"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/realtime/supabaseBrowser";
import {
  ARENA_SPAWN_POINTS,
  createInitialBarrels,
  HARDPOINT_ZONES,
  resolveArenaMovement,
} from "@/games/carbon3d/arenaLayout";
import {
  BotRuntimeMemory,
  createSurvivalWaveBots,
  isHostile,
  stepArenaBots,
} from "@/games/carbon3d/ai";
import {
  CarbonAction,
  CarbonBarrelExplodePacket,
  CarbonBarrelHitPacket,
  CarbonBarrelState,
  CarbonCombatant,
  CarbonGemDrop,
  CarbonHitClaimPacket,
  CarbonKillEventPacket,
  CarbonLivePeerPacket,
  CarbonMode,
  CarbonPickupPad,
  CarbonSettings,
  CarbonShotPacket,
  CarbonWorldSyncPacket,
} from "@/games/carbon3d/types";
import { carbonSfx } from "./soundFx";

const POS_BROADCAST_MS = 55; // ~18Hz local physics sampling into coalesced 11Hz relay
const POS_HEARTBEAT_MS = 650; // Stationary heartbeat so new joiners see idle peers immediately
const WORLD_SYNC_MS = 180; // ~5.5Hz authoritative HP/Armor/Hardpoint/Barrels sync
const CHECKPOINT_API_MS = 10_000; // Persist to Redis every 10s
const HARDPOINT_ROTATE_MS = 45_000; // Rotate active Hardpoint across 5 Island Sectors every 45s!
const DEFAULT_WIN_POINTS_TARGET = 250;

export interface LocalPlayerPhysicsState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  isDashing: boolean;
  isAirborne: boolean;
  isSprinting?: boolean;
  isTurboSprint?: boolean;
}

interface UseCarbonNetOptions {
  roomCode: string;
  myId: string;
  isHost: boolean;
  round: number;
  phase: "PLAYING" | "GAME_OVER";
  mode: CarbonMode;
  endsAt: number;
  settings: CarbonSettings;
  initialCombatants: Record<string, CarbonCombatant>;
  initialPickups: CarbonPickupPad[];
  initialBarrels?: CarbonBarrelState[];
  localPhysRef: React.MutableRefObject<LocalPlayerPhysicsState>;
  onRemoteShot: (shot: CarbonShotPacket) => void;
  onKillEvent: (kill: CarbonKillEventPacket) => void;
  onBarrelExplode?: (boom: CarbonBarrelExplodePacket) => void;
  onDamageTaken: (amount: number, fromX: number, fromZ: number, shieldBroken: boolean) => void;
  onRespawnLocal: (x: number, y: number, z: number, yaw: number) => void;
  onAction: (action: CarbonAction) => Promise<void> | void;
  onRefresh?: () => void;
}

export function useCarbonNet({
  roomCode,
  myId,
  isHost,
  round,
  phase,
  mode,
  endsAt,
  settings,
  initialCombatants,
  initialPickups,
  initialBarrels,
  localPhysRef,
  onRemoteShot,
  onKillEvent,
  onBarrelExplode,
  onDamageTaken,
  onRespawnLocal,
  onAction,
  onRefresh,
}: UseCarbonNetOptions) {
  const [isLive, setIsLive] = useState(false);

  const combatantsRef = useRef<Record<string, CarbonCombatant>>({});
  const pickupsRef = useRef<CarbonPickupPad[]>([]);
  const barrelsRef = useRef<CarbonBarrelState[]>([]);
  const gemsRef = useRef<CarbonGemDrop[]>([]);
  const hardpointIndexRef = useRef<number>(0);
  const lastHardpointSwitchRef = useRef<number>(Date.now());
  const hardpointScoreAccRef = useRef<number>(0);
  const countdownEndsAtRef = useRef<number>(0);
  const countdownLeaderRef = useRef<string | null>(null);
  const lastAirdropAtRef = useRef<number>(0);

  const peersRef = useRef<Map<string, CarbonLivePeerPacket>>(new Map());
  const botMemRef = useRef<Map<string, BotRuntimeMemory>>(new Map());

  const waveRef = useRef<number>(1);
  const waveRemRef = useRef<number>(0);
  const coreOwnerRef = useRef<CarbonCombatant["team"] | "CONTESTED" | "NEUTRAL">("NEUTRAL");
  const coreProgRef = useRef<number>(0);
  const teamScoresRef = useRef<{ CYAN: number; CRIMSON: number }>({ CYAN: 0, CRIMSON: 0 });
  const finishedSentRef = useRef<boolean>(false);
  const seqRef = useRef<number>(0);
  const lastArbiterHeardRef = useRef<number>(performance.now());

  const [hudTick, setHudTick] = useState(0);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastPosSentRef = useRef<{ at: number; key: string }>({ at: 0, key: "" });
  const lastCheckpointAtRef = useRef<number>(Date.now());

  const callbacksRef = useRef({
    onRemoteShot,
    onKillEvent,
    onBarrelExplode,
    onDamageTaken,
    onRespawnLocal,
    onAction,
    onRefresh,
  });
  callbacksRef.current = {
    onRemoteShot,
    onKillEvent,
    onBarrelExplode,
    onDamageTaken,
    onRespawnLocal,
    onAction,
    onRefresh,
  };

  // Re-initialize match state whenever `round` or `mode` changes
  useEffect(() => {
    const clonedUnits: Record<string, CarbonCombatant> = {};
    for (const [k, v] of Object.entries(initialCombatants || {})) {
      clonedUnits[k] = { ...v, gems: v.gems ?? 0, lastFiredAt: v.lastFiredAt ?? 0 };
    }
    combatantsRef.current = clonedUnits;
    pickupsRef.current = (initialPickups || []).map((p) => ({ ...p }));
    barrelsRef.current = (initialBarrels && initialBarrels.length > 0
      ? initialBarrels
      : createInitialBarrels()
    ).map((b) => ({ ...b }));
    botMemRef.current.clear();
    waveRef.current = 1;
    waveRemRef.current = Object.values(clonedUnits).filter(
      (c) => c.isBot && c.team === "CRIMSON" && c.isAlive
    ).length;
    hardpointIndexRef.current = 0;
    lastHardpointSwitchRef.current = Date.now();
    hardpointScoreAccRef.current = 0;
    coreOwnerRef.current = "NEUTRAL";
    coreProgRef.current = 0;
    teamScoresRef.current = { CYAN: 0, CRIMSON: 0 };
    countdownEndsAtRef.current = 0;
    countdownLeaderRef.current = null;
    lastAirdropAtRef.current = Date.now();
    finishedSentRef.current = false;
    gemsRef.current = [];

    const me = clonedUnits[myId];
    if (me) {
      callbacksRef.current.onRespawnLocal(me.x, me.y, me.z, me.yaw);
    }
    setHudTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, mode, myId]);

  // Dynamically merge newly hot-joined human players (PC <-> Phone mid-match join!)
  useEffect(() => {
    let changed = false;
    for (const [id, unit] of Object.entries(initialCombatants || {})) {
      if (!unit || unit.isBot) continue;
      if (!combatantsRef.current[id]) {
        combatantsRef.current[id] = {
          ...unit,
          gems: unit.gems ?? 0,
          lastFiredAt: unit.lastFiredAt ?? 0,
        };
        if (id === myId) {
          callbacksRef.current.onRespawnLocal(unit.x, unit.y, unit.z, unit.yaw);
        }
        changed = true;
      }
    }

    // Smart Bot Policy: if 2+ real humans are now in the match and botFill is OFF, prune solo bots!
    const humanCount = Object.values(combatantsRef.current).filter((u) => !u.isBot).length;
    if (humanCount >= 2 && !settings.botFill && mode !== "SURVIVAL") {
      for (const [id, unit] of Object.entries(combatantsRef.current)) {
        if (unit.isBot) {
          delete combatantsRef.current[id];
          peersRef.current.delete(id);
          changed = true;
        }
      }
    }

    if (changed) {
      setHudTick((t) => t + 1);
    }
  }, [initialCombatants, settings.botFill, mode, myId]);

  // Apply damage & resolve kills on the Arbiter
  const applyArbiterHit = useCallback(
    (claim: CarbonHitClaimPacket, allowSelfBlast = false) => {
      if (finishedSentRef.current || phase === "GAME_OVER") return;
      const shooter = combatantsRef.current[claim.shooterId];
      const victim = combatantsRef.current[claim.targetId];
      if (!shooter || !victim || !victim.isAlive) return;
      if (!allowSelfBlast && !isHostile(shooter, victim, mode)) return;
      if (allowSelfBlast && shooter.id !== victim.id && !isHostile(shooter, victim, mode)) return;

      const now = Date.now();
      const mult = shooter.overdriveUntil > now ? 1.3 : 1.0;
      let dmg = Math.max(1, Math.round(claim.damage * mult));
      victim.lastDamagedAt = now;

      const hadShield = victim.shield > 0;
      if (victim.shield > 0) {
        const absorbed = Math.min(victim.shield, dmg);
        victim.shield -= absorbed;
        dmg -= absorbed;
      }
      if (dmg > 0) {
        victim.hp = Math.max(0, victim.hp - dmg);
      }

      const shieldJustBroke = hadShield && victim.shield <= 0;
      if (victim.id === myId) {
        callbacksRef.current.onDamageTaken(
          claim.damage,
          shooter.x,
          shooter.z,
          shieldJustBroke
        );
      } else {
        channelRef.current?.send({
          type: "broadcast",
          event: "dmg_fx",
          payload: {
            targetId: victim.id,
            amount: claim.damage,
            fx: shooter.x,
            fz: shooter.z,
            sb: shieldJustBroke ? 1 : 0,
          },
        });
      }

      if (victim.hp <= 0) {
        victim.isAlive = false;
        victim.deaths += 1;
        victim.streak = 0;
        victim.respawnAt =
          mode === "SURVIVAL" && victim.isBot ? 0 : now + (mode === "SURVIVAL" ? 4500 : 3000);

        if (shooter.id !== victim.id) {
          const winPtsTarget = settings.targetScoreSquad || DEFAULT_WIN_POINTS_TARGET;
          const bonusPts = claim.isCrit || claim.weapon === "BARREL" ? 8 : 6;
          shooter.kills += 1;
          shooter.streak += 1;
          shooter.score += victim.archetype === "BOSS_MECH" ? 350 : 100 + shooter.streak * 15;
          shooter.gems = Math.min(winPtsTarget, (shooter.gems || 0) + bonusPts);

          if (mode === "SQUAD" && (shooter.team === "CYAN" || shooter.team === "CRIMSON")) {
            teamScoresRef.current[shooter.team] = Math.min(
              winPtsTarget,
              teamScoresRef.current[shooter.team] + bonusPts
            );
          }
        }

        const killPkt: CarbonKillEventPacket = {
          id: `k_${now}_${Math.random().toString(36).slice(2, 6)}`,
          killerId: shooter.id,
          killerName: shooter.nickname,
          victimId: victim.id,
          victimName: victim.nickname,
          weapon: claim.weapon,
          isHeadshot: claim.isCrit,
          streak: shooter.streak,
          vx: victim.x,
          vy: victim.y,
          vz: victim.z,
          colorHex: shooter.accentHex,
        };

        callbacksRef.current.onKillEvent(killPkt);
        channelRef.current?.send({
          type: "broadcast",
          event: "kill",
          payload: killPkt,
        });
      }
    },
    [mode, myId, phase]
  );

  // Resolve Explosive Barrel Detonation + Chain-Reaction AoE Blast on Arbiter
  const applyArbiterBarrelHit = useCallback(
    (pkt: CarbonBarrelHitPacket) => {
      if (finishedSentRef.current || phase === "GAME_OVER") return;
      const barrel = barrelsRef.current.find((b) => b.id === pkt.barrelId);
      if (!barrel || !barrel.alive) return;

      barrel.hp -= Math.max(10, pkt.damage);
      if (barrel.hp > 0) return;

      const detonateBarrel = (b: CarbonBarrelState, shooterId: string) => {
        if (!b.alive) return;
        b.alive = false;
        b.hp = 0;
        b.respawnAt = Date.now() + 24_000;

        const boomPkt: CarbonBarrelExplodePacket = {
          barrelId: b.id,
          shooterId,
          x: b.x,
          y: b.y,
          z: b.z,
        };
        callbacksRef.current.onBarrelExplode?.(boomPkt);
        channelRef.current?.send({
          type: "broadcast",
          event: "barrel_boom",
          payload: boomPkt,
        });

        // 6.2m AoE Blast Shockwave against nearby combatants
        const BLAST_RADIUS = 6.2;
        for (const u of Object.values(combatantsRef.current)) {
          if (!u.isAlive) continue;
          const d = Math.hypot(u.x - b.x, u.y + 0.9 - (b.y + 0.6), u.z - b.z);
          if (d <= BLAST_RADIUS) {
            const falloff = 1 - (d / BLAST_RADIUS) * 0.65;
            const dmg = Math.round(98 * falloff);
            applyArbiterHit(
              {
                shooterId,
                targetId: u.id,
                weapon: "BARREL",
                damage: dmg,
                isCrit: d < 2.2,
                hx: u.x,
                hy: u.y + 0.9,
                hz: u.z,
                kx: 0,
                kz: 0,
              },
              true
            );
          }
        }

        // Chain-detonate adjacent barrels within 5.5m!
        for (const otherB of barrelsRef.current) {
          if (otherB.alive && Math.hypot(otherB.x - b.x, otherB.z - b.z) < 5.5) {
            detonateBarrel(otherB, shooterId);
          }
        }
      };

      detonateBarrel(barrel, pkt.shooterId);
    },
    [applyArbiterHit, phase]
  );

  // Connect Upstash Redis 11Hz Live Relay Channel
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase || !roomCode || !myId) return;

    const ch = supabase.channel(`carbon3d:${roomCode.toUpperCase()}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    ch.on("broadcast", { event: "pos" }, ({ payload }) => {
      const p = payload as CarbonLivePeerPacket;
      if (!p || p.i === myId) return;
      peersRef.current.set(p.i, { ...p, t: performance.now() });
      const unit = combatantsRef.current[p.i];
      if (unit && unit.isAlive) {
        unit.x = p.x;
        unit.y = p.y;
        unit.z = p.z;
        unit.yaw = p.yw;
        unit.pitch = p.pt;
        unit.weapon = p.w;
      }
    })
      .on("broadcast", { event: "shot" }, ({ payload }) => {
        const s = payload as CarbonShotPacket;
        if (!s || s.shooterId === myId) return;
        const unit = combatantsRef.current[s.shooterId];
        if (unit) unit.lastFiredAt = Date.now();
        callbacksRef.current.onRemoteShot(s);
      })
      .on("broadcast", { event: "hit" }, ({ payload }) => {
        const claim = payload as CarbonHitClaimPacket;
        if (!claim) return;
        if (isHost || performance.now() - lastArbiterHeardRef.current > 3200) {
          applyArbiterHit(claim);
        }
      })
      .on("broadcast", { event: "barrel_hit" }, ({ payload }) => {
        const pkt = payload as CarbonBarrelHitPacket;
        if (!pkt) return;
        if (isHost || performance.now() - lastArbiterHeardRef.current > 3200) {
          applyArbiterBarrelHit(pkt);
        }
      })
      .on("broadcast", { event: "barrel_boom" }, ({ payload }) => {
        const boom = payload as CarbonBarrelExplodePacket;
        if (!boom) return;
        const b = barrelsRef.current.find((item) => item.id === boom.barrelId);
        if (b) b.alive = false;
        callbacksRef.current.onBarrelExplode?.(boom);
      })
      .on("broadcast", { event: "dmg_fx" }, ({ payload }) => {
        if (!payload || payload.targetId !== myId) return;
        callbacksRef.current.onDamageTaken(
          Number(payload.amount || 18),
          Number(payload.fx || 0),
          Number(payload.fz || 0),
          Boolean(payload.sb)
        );
      })
      .on("broadcast", { event: "kill" }, ({ payload }) => {
        const k = payload as CarbonKillEventPacket;
        if (!k) return;
        callbacksRef.current.onKillEvent(k);
      })
      .on("broadcast", { event: "stim" }, ({ payload }) => {
        if (!payload?.playerId) return;
        const unit = combatantsRef.current[String(payload.playerId)];
        if (unit && unit.isAlive) {
          unit.hp = Math.min(unit.maxHp, unit.hp + 28);
          unit.shield = Math.min(unit.maxShield, unit.shield + 20);
        }
      })
      .on("broadcast", { event: "world" }, ({ payload }) => {
        const w = payload as CarbonWorldSyncPacket;
        if (!w || w.arbiterId === myId) return;
        if (isHost) return; // Host is authoritative arbiter
        seqRef.current = w.seq;
        lastArbiterHeardRef.current = performance.now();

        waveRef.current = w.wave;
        waveRemRef.current = w.waveRem;
        if (typeof w.hpIdx === "number") {
          hardpointIndexRef.current = w.hpIdx;
        }
        coreOwnerRef.current = w.coreOwner;
        coreProgRef.current = w.coreProg;
        teamScoresRef.current = w.scores;
        countdownEndsAtRef.current = w.cdEnd ?? 0;
        countdownLeaderRef.current = w.cdWho ?? null;

        if (Array.isArray(w.gems)) {
          gemsRef.current = w.gems.map((g) => ({
            id: g.i,
            x: g.x,
            y: g.y ?? 0,
            z: g.z,
            spawnedAt: 0,
          }));
        }

        if (Array.isArray(w.barrels)) {
          for (const bs of w.barrels) {
            const b = barrelsRef.current.find((item) => item.id === bs.i);
            if (b) b.alive = bs.a === 1;
          }
        }

        const nextMap: Record<string, CarbonCombatant> = {};
        const nowPerf = performance.now();

        for (const u of w.units) {
          const prev = combatantsRef.current[u.i];
          const wasDead = prev && !prev.isAlive;
          const isMe = u.i === myId;
          const nextPts = u.gm ?? prev?.gems ?? 0;

          if (isMe && prev && nextPts > (prev.gems ?? 0) + 4) {
            carbonSfx.playPickup();
          }

          // For remote humans, prefer fresh direct `pos` stream if received within last 350ms
          const recentPeer = !isMe && u.b === 0 ? peersRef.current.get(u.i) : undefined;
          const hasFreshDirectPos = Boolean(recentPeer && nowPerf - recentPeer.t < 350);

          nextMap[u.i] = {
            id: u.i,
            nickname: u.n,
            isBot: u.b === 1,
            archetype: u.ar,
            team: u.tm,
            accentHex: u.c,
            x:
              isMe && u.al === 1 && !wasDead
                ? localPhysRef.current.x
                : hasFreshDirectPos && recentPeer
                ? recentPeer.x
                : u.x,
            y:
              isMe && u.al === 1 && !wasDead
                ? localPhysRef.current.y
                : hasFreshDirectPos && recentPeer
                ? recentPeer.y
                : u.y,
            z:
              isMe && u.al === 1 && !wasDead
                ? localPhysRef.current.z
                : hasFreshDirectPos && recentPeer
                ? recentPeer.z
                : u.z,
            yaw: isMe
              ? localPhysRef.current.yaw
              : hasFreshDirectPos && recentPeer
              ? recentPeer.yw
              : u.yw,
            pitch: isMe
              ? localPhysRef.current.pitch
              : hasFreshDirectPos && recentPeer
              ? recentPeer.pt
              : u.pt ?? prev?.pitch ?? 0,
            hp: u.hp,
            maxHp: u.mhp,
            shield: u.sh,
            maxShield: u.msh,
            isAlive: u.al === 1,
            respawnAt: u.ra,
            weapon: isMe && prev && u.al === 1 && !wasDead ? prev.weapon : u.w,
            secondaryWeapon: u.sw,
            kills: u.k,
            deaths: u.d,
            assists: prev?.assists ?? 0,
            gems: nextPts,
            score: u.sc,
            streak: u.st,
            overdriveUntil: u.od,
            lastDamagedAt: prev?.lastDamagedAt ?? 0,
            lastFiredAt: isMe ? prev?.lastFiredAt ?? 0 : u.lf ?? prev?.lastFiredAt ?? 0,
          };

          if (isMe && wasDead && u.al === 1) {
            callbacksRef.current.onRespawnLocal(u.x, u.y, u.z, u.yw);
          }

          // Feed bots AND fallback remote humans into peersRef so every soldier interpolates at 60fps!
          if (!isMe && u.al === 1 && (u.b === 1 || !hasFreshDirectPos)) {
            const dx = prev ? (u.x - prev.x) / (WORLD_SYNC_MS / 1000) : 0;
            const dz = prev ? (u.z - prev.z) / (WORLD_SYNC_MS / 1000) : 0;
            peersRef.current.set(u.i, {
              i: u.i,
              x: u.x,
              y: u.y,
              z: u.z,
              vx: Math.max(-10, Math.min(10, dx)),
              vz: Math.max(-10, Math.min(10, dz)),
              yw: u.yw,
              pt: u.pt ?? 0,
              w: u.w,
              t: nowPerf,
            });
          }
        }
        combatantsRef.current = nextMap;

        for (const padSync of w.pads) {
          const pad = pickupsRef.current.find((p) => p.id === padSync.i);
          if (pad) pad.available = padSync.a === 1;
        }
        setHudTick((t) => t + 1);
      })
      .on("broadcast", { event: "refresh" }, () => {
        callbacksRef.current.onRefresh?.();
      })
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    channelRef.current = ch;
    return () => {
      setIsLive(false);
      channelRef.current = null;
      peersRef.current.clear();
      supabase.removeChannel(ch);
    };
  }, [roomCode, myId, isHost, applyArbiterHit, applyArbiterBarrelHit, localPhysRef]);

  // Host / Solo Authoritative Simulation Loop (20Hz Physics/AI + 5.5Hz World Sync)
  useEffect(() => {
    if (phase === "GAME_OVER") return;

    let lastSimTime = performance.now();
    let lastWorldBroadcast = 0;

    const interval = setInterval(() => {
      const perfNow = performance.now();
      const dt = Math.min(0.1, (perfNow - lastSimTime) / 1000);
      lastSimTime = perfNow;
      const now = Date.now();

      // Sync local player coordinates into combatantsRef
      const me = combatantsRef.current[myId];
      if (me && me.isAlive) {
        me.x = localPhysRef.current.x;
        me.y = localPhysRef.current.y;
        me.z = localPhysRef.current.z;
        me.yaw = localPhysRef.current.yaw;
        me.pitch = localPhysRef.current.pitch;
      }

      const actingArbiter = isHost || perfNow - lastArbiterHeardRef.current > 3200;
      if (!actingArbiter || finishedSentRef.current) {
        setHudTick((t) => (t + 1) % 10000);
        return;
      }

      const units = Object.values(combatantsRef.current);

      // 1. Rotate Tactical Hardpoint every 40s (Helipad -> West Dockyard -> East Kasbah)
      if (mode !== "SURVIVAL" && now - lastHardpointSwitchRef.current >= HARDPOINT_ROTATE_MS) {
        lastHardpointSwitchRef.current = now;
        hardpointIndexRef.current = (hardpointIndexRef.current + 1) % HARDPOINT_ZONES.length;
      }
      const activeHp =
        HARDPOINT_ZONES[hardpointIndexRef.current % HARDPOINT_ZONES.length] || HARDPOINT_ZONES[0];

      // 2. Armor Regeneration, Respawns, Pickup Pads & Barrel Respawns
      for (const u of units) {
        if (!u.isAlive) {
          if (u.respawnAt > 0 && now >= u.respawnAt) {
            const pool =
              mode === "FFA"
                ? ARENA_SPAWN_POINTS
                : ARENA_SPAWN_POINTS.filter((s) => s.team === u.team);
            let bestSp = pool[0] || ARENA_SPAWN_POINTS[0];
            let bestMinDist = -1;
            for (const sp of pool) {
              let minEnemyD = 999;
              for (const other of units) {
                if (other.isAlive && isHostile(u, other, mode)) {
                  minEnemyD = Math.min(minEnemyD, Math.hypot(other.x - sp.x, other.z - sp.z));
                }
              }
              if (minEnemyD > bestMinDist) {
                bestMinDist = minEnemyD;
                bestSp = sp;
              }
            }

            u.isAlive = true;
            u.hp = u.maxHp;
            u.shield = u.maxShield;
            u.x = bestSp.x;
            u.y = bestSp.y;
            u.z = bestSp.z;
            u.yaw = bestSp.yaw;
            u.respawnAt = 0;

            if (u.id === myId) {
              callbacksRef.current.onRespawnLocal(u.x, u.y, u.z, u.yaw);
            }
          }
          continue;
        }

        // Tactical Armor recharge after 4.2s out of combat
        if (u.shield < u.maxShield && now - u.lastDamagedAt > 4200) {
          u.shield = Math.min(u.maxShield, u.shield + 16 * dt);
        }

        // Pickup Pad Collisions
        for (const pad of pickupsRef.current) {
          if (!pad.available) continue;
          if (u.isBot && mode === "SURVIVAL") continue;
          const distXZ = Math.hypot(u.x - pad.x, u.z - pad.z);
          if (distXZ < 1.65 && Math.abs(u.y - pad.y) < 1.35) {
            pad.available = false;
            pad.respawnAt = now + (pad.kind === "OVERDRIVE_AMP" ? 24_000 : 14_000);

            if (pad.kind === "WEAPON_SHOTGUN") {
              u.secondaryWeapon = u.weapon === "SHOTGUN" ? u.secondaryWeapon : u.weapon;
              u.weapon = "SHOTGUN";
            } else if (pad.kind === "WEAPON_RAILGUN") {
              u.secondaryWeapon = u.weapon === "RAILGUN" ? u.secondaryWeapon : u.weapon;
              u.weapon = "RAILGUN";
            } else if (pad.kind === "WEAPON_LOBBER") {
              u.secondaryWeapon = u.weapon === "LOBBER" ? u.secondaryWeapon : u.weapon;
              u.weapon = "LOBBER";
            } else if (pad.kind === "SHIELD_CELL") {
              u.shield = u.maxShield;
              u.hp = Math.min(u.maxHp, u.hp + 45);
            } else if (pad.kind === "OVERDRIVE_AMP") {
              u.overdriveUntil = now + 12_000;
              u.shield = u.maxShield;
            }
            if (u.id === myId) carbonSfx.playPickup();
          }
        }
      }

      for (const pad of pickupsRef.current) {
        if (!pad.available && now >= pad.respawnAt) {
          pad.available = true;
        }
      }

      for (const brl of barrelsRef.current) {
        if (!brl.alive && brl.respawnAt > 0 && now >= brl.respawnAt) {
          brl.alive = true;
          brl.hp = 40;
          brl.respawnAt = 0;
        }
      }

      // 3. Hardpoint Capture Scoring + Golden Tactical Supply Drops (FFA & SQUAD)
      const winPtsTarget = settings.targetScoreSquad || DEFAULT_WIN_POINTS_TARGET;
      if (mode !== "SURVIVAL") {
        // Spawn Golden Supply Crate near active Hardpoint every 15s
        if (now - lastAirdropAtRef.current >= 15_000) {
          lastAirdropAtRef.current = now;
          if (gemsRef.current.length < 4) {
            const ang = Math.random() * Math.PI * 2;
            const dist = 2.2 + Math.random() * 5.2;
            const pos = resolveArenaMovement(
              activeHp.x + Math.cos(ang) * dist,
              activeHp.y,
              activeHp.z + Math.sin(ang) * dist,
              0.55
            );
            gemsRef.current.push({
              id: `air_${now.toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
              x: Math.round(pos.x * 100) / 100,
              y: activeHp.y,
              z: Math.round(pos.z * 100) / 100,
              spawnedAt: now,
            });
          }
        }

        // Collect Golden Supply Crates (+10 Tactical Points + Armor/Overdrive Boost)
        for (let gIdx = gemsRef.current.length - 1; gIdx >= 0; gIdx--) {
          const drop = gemsRef.current[gIdx];
          const dropY = drop.y ?? 0;
          let collector: CarbonCombatant | null = null;
          let bestD = 1.75;
          for (const u of units) {
            if (!u.isAlive || Math.abs(u.y - dropY) > 1.5) continue;
            const d = Math.hypot(u.x - drop.x, u.z - drop.z);
            if (d <= bestD) {
              bestD = d;
              collector = u;
            }
          }
          if (collector) {
            gemsRef.current.splice(gIdx, 1);
            collector.gems = Math.min(winPtsTarget, (collector.gems || 0) + 10);
            collector.score += 90;
            collector.shield = Math.min(collector.maxShield, collector.shield + 30);
            collector.overdriveUntil = Math.max(collector.overdriveUntil, now + 5500);
            if (mode === "SQUAD" && (collector.team === "CYAN" || collector.team === "CRIMSON")) {
              teamScoresRef.current[collector.team] = Math.min(
                winPtsTarget,
                teamScoresRef.current[collector.team] + 10
              );
            }
            if (collector.id === myId) {
              carbonSfx.playPickup();
            }
          }
        }

        // Evaluate Active Hardpoint Zone Control (+2 Tactical Points every 1.5s)
        const holders = units.filter(
          (u) =>
            u.isAlive &&
            Math.hypot(u.x - activeHp.x, u.z - activeHp.z) <= activeHp.radius &&
            Math.abs(u.y - activeHp.y) < 1.6
        );

        hardpointScoreAccRef.current += dt;
        const awardTick = hardpointScoreAccRef.current >= 1.5;
        if (awardTick) hardpointScoreAccRef.current -= 1.5;

        if (mode === "SQUAD") {
          const hasCyan = holders.some((h) => h.team === "CYAN");
          const hasCrimson = holders.some((h) => h.team === "CRIMSON");
          if (hasCyan && hasCrimson) {
            coreOwnerRef.current = "CONTESTED";
          } else if (hasCyan) {
            coreOwnerRef.current = "CYAN";
            if (awardTick) {
              teamScoresRef.current.CYAN = Math.min(
                winPtsTarget,
                teamScoresRef.current.CYAN + 2
              );
              for (const h of holders) {
                h.score += 15;
                h.gems = Math.min(winPtsTarget, (h.gems || 0) + 2);
              }
            }
          } else if (hasCrimson) {
            coreOwnerRef.current = "CRIMSON";
            if (awardTick) {
              teamScoresRef.current.CRIMSON = Math.min(
                winPtsTarget,
                teamScoresRef.current.CRIMSON + 2
              );
              for (const h of holders) {
                h.score += 15;
                h.gems = Math.min(winPtsTarget, (h.gems || 0) + 2);
              }
            }
          } else {
            coreOwnerRef.current = "NEUTRAL";
          }
        } else {
          // FFA Hardpoint Control
          if (holders.length === 0) {
            coreOwnerRef.current = "NEUTRAL";
          } else if (holders.length === 1) {
            const sole = holders[0];
            coreOwnerRef.current = sole.id === myId ? "CYAN" : "CRIMSON";
            if (awardTick) {
              sole.gems = Math.min(winPtsTarget, (sole.gems || 0) + 2);
              sole.score += 20;
            }
          } else {
            coreOwnerRef.current = "CONTESTED";
          }
        }
      }

      // 4. Survival Wave Progression (Solo / Co-op Commando PvE)
      if (mode === "SURVIVAL") {
        const aliveEnemies = units.filter((u) => u.isBot && u.team === "CRIMSON" && u.isAlive);
        waveRemRef.current = aliveEnemies.length;

        const humans = units.filter((u) => !u.isBot);
        if (humans.length > 0 && humans.every((h) => !h.isAlive) && waveRef.current >= 1) {
          finishedSentRef.current = true;
          const topHuman = [...humans].sort((a, b) => b.kills - a.kills)[0];
          const summary = `صمدت فرقة النخبة حتى للموجة ${waveRef.current} وقضيتو على ${humans.reduce(
            (s, h) => s + h.kills,
            0
          )} مهاجم! قائد الميدان: ${topHuman?.nickname || "البطل"} 🪖🔥`;
          Promise.resolve(
            callbacksRef.current.onAction({
              type: "FINISH_MATCH",
              combatants: combatantsRef.current,
              wave: waveRef.current,
              winnerId: topHuman?.id || null,
              winnerSummaryAr: summary,
            })
          ).then(() => {
            channelRef.current?.send({ type: "broadcast", event: "refresh", payload: {} });
            callbacksRef.current.onRefresh?.();
          });
          return;
        }

        if (aliveEnemies.length === 0) {
          const nextWave = waveRef.current + 1;
          waveRef.current = nextWave;
          for (const key of Object.keys(combatantsRef.current)) {
            if (combatantsRef.current[key].isBot) {
              delete combatantsRef.current[key];
            } else {
              const h = combatantsRef.current[key];
              h.isAlive = true;
              h.hp = h.maxHp;
              h.shield = h.maxShield;
              if (nextWave % 3 === 0) h.overdriveUntil = now + 10_000;
            }
          }
          const newBots = createSurvivalWaveBots(nextWave, Math.max(1, humans.length));
          for (const nb of newBots) {
            combatantsRef.current[nb.id] = nb;
          }
          waveRemRef.current = newBots.length;
          carbonSfx.playPickup();
        }
      }

      // 5. Tick Spec-Ops AI Soldiers & Broadcast Bot Gunfire
      const botShots = stepArenaBots(
        combatantsRef.current,
        pickupsRef.current,
        botMemRef.current,
        mode,
        settings.botDifficulty || "HARD",
        now,
        dt,
        gemsRef.current,
        hardpointIndexRef.current
      );
      for (const bShot of botShots) {
        callbacksRef.current.onRemoteShot(bShot);
        channelRef.current?.send({
          type: "broadcast",
          event: "shot",
          payload: bShot,
        });
      }

      // 6. Check Match Win Conditions (First to 250 Tactical Points OR 25 Eliminations OR Time Up)
      const timeExpired = now >= endsAt;
      if (mode === "FFA") {
        const sorted = [...units].sort(
          (a, b) => (b.gems || 0) - (a.gems || 0) || b.kills - a.kills || b.score - a.score
        );
        const top = sorted[0];
        const targetKills = settings.targetKillsFFA || 25;
        const reachedGoal =
          Boolean(top) && ((top.gems || 0) >= winPtsTarget || top.kills >= targetKills);

        if ((reachedGoal || timeExpired) && top) {
          finishedSentRef.current = true;
          const summary = `🪖 ${top.nickname} سيطر على جزيرة الأطلس بـ ${
            top.gems || 0
          } نقطة تكتيكية و ${top.kills} إقصاء! 🏆`;
          Promise.resolve(
            callbacksRef.current.onAction({
              type: "FINISH_MATCH",
              combatants: combatantsRef.current,
              winnerId: top.id,
              winnerSummaryAr: summary,
            })
          ).then(() => {
            channelRef.current?.send({ type: "broadcast", event: "refresh", payload: {} });
            callbacksRef.current.onRefresh?.();
          });
          return;
        }
      } else if (mode === "SQUAD") {
        const sc = teamScoresRef.current;
        const reachedGoal = sc.CYAN >= winPtsTarget || sc.CRIMSON >= winPtsTarget;
        if (reachedGoal || timeExpired) {
          finishedSentRef.current = true;
          const winTeam = sc.CYAN >= sc.CRIMSON ? "CYAN" : "CRIMSON";
          const teamAr = winTeam === "CYAN" ? "فرقة الأطلس الزرقاء 🛡️" : "قوات الاقتحام الحمراء 🔥";
          const mvp = [...units]
            .filter((u) => u.team === winTeam)
            .sort((a, b) => b.kills - a.kills || b.score - a.score)[0];
          const summary = `🪖 انتصرت ${teamAr} بنتيجة (${sc.CYAN} - ${
            sc.CRIMSON
          })! بطل العملية: ${mvp?.nickname || "البطل"} 👑`;
          Promise.resolve(
            callbacksRef.current.onAction({
              type: "FINISH_MATCH",
              combatants: combatantsRef.current,
              teamScores: sc,
              winnerTeam: winTeam,
              winnerId: mvp?.id || null,
              winnerSummaryAr: summary,
            })
          ).then(() => {
            channelRef.current?.send({ type: "broadcast", event: "refresh", payload: {} });
            callbacksRef.current.onRefresh?.();
          });
          return;
        }
      }

      // 7. Broadcast Authoritative World Snapshot @ ~5.5Hz
      if (perfNow - lastWorldBroadcast >= WORLD_SYNC_MS) {
        lastWorldBroadcast = perfNow;
        seqRef.current += 1;
        const worldPkt: CarbonWorldSyncPacket = {
          arbiterId: myId,
          seq: seqRef.current,
          mode,
          phase: "PLAYING",
          endsAt,
          wave: waveRef.current,
          waveRem: waveRemRef.current,
          hpIdx: hardpointIndexRef.current,
          coreOwner: coreOwnerRef.current,
          coreProg: Math.round(coreProgRef.current),
          scores: teamScoresRef.current,
          gems: gemsRef.current.map((g) => ({
            i: g.id,
            x: g.x,
            y: g.y ?? 0,
            z: g.z,
          })),
          barrels: barrelsRef.current.map((b) => ({
            i: b.id,
            a: b.alive ? 1 : 0,
          })),
          units: Object.values(combatantsRef.current).map((u) => ({
            i: u.id,
            n: u.nickname,
            b: u.isBot ? 1 : 0,
            ar: u.archetype,
            tm: u.team,
            c: u.accentHex,
            x: Math.round(u.x * 100) / 100,
            y: Math.round(u.y * 100) / 100,
            z: Math.round(u.z * 100) / 100,
            yw: Math.round(u.yaw * 100) / 100,
            pt: Math.round((u.pitch || 0) * 100) / 100,
            hp: Math.round(u.hp),
            mhp: u.maxHp,
            sh: Math.round(u.shield),
            msh: u.maxShield,
            al: u.isAlive ? 1 : 0,
            ra: u.respawnAt,
            w: u.weapon,
            sw: u.secondaryWeapon,
            k: u.kills,
            d: u.deaths,
            gm: u.gems || 0,
            lf: u.lastFiredAt || 0,
            sc: u.score,
            st: u.streak,
            od: u.overdriveUntil,
          })),
          pads: pickupsRef.current.map((p) => ({
            i: p.id,
            a: p.available ? 1 : 0,
          })),
        };
        channelRef.current?.send({
          type: "broadcast",
          event: "world",
          payload: worldPkt,
        });
        setHudTick((t) => (t + 1) % 10000);
      }

      // 8. Rare 10s Redis Checkpoint
      if (now - lastCheckpointAtRef.current >= CHECKPOINT_API_MS && isHost) {
        lastCheckpointAtRef.current = now;
        callbacksRef.current.onAction({
          type: "SYNC_CHECKPOINT",
          combatants: combatantsRef.current,
          pickups: pickupsRef.current,
          barrels: barrelsRef.current,
          hardpointIndex: hardpointIndexRef.current,
          teamScores: teamScoresRef.current,
          coreOwner: coreOwnerRef.current,
          coreProgress: Math.round(coreProgRef.current),
          wave: waveRef.current,
          waveEnemiesRemaining: waveRemRef.current,
        });
      }
    }, 50);

    return () => clearInterval(interval);
  }, [phase, myId, isHost, mode, endsAt, settings, localPhysRef]);

  /** Sends local player position @ ~18Hz (plus 650ms idle heartbeat) */
  const sendLocalPos = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || !myId) return;
    const now = performance.now();
    const since = now - lastPosSentRef.current.at;
    if (since < POS_BROADCAST_MS) return;

    const p = localPhysRef.current;
    const me = combatantsRef.current[myId];
    if (!me || !me.isAlive) return;

    const key = `${p.x.toFixed(2)}|${p.y.toFixed(2)}|${p.z.toFixed(2)}|${p.yaw.toFixed(2)}|${p.pitch.toFixed(2)}|${me.weapon}|${p.isDashing ? 1 : 0}|${p.isTurboSprint ? 1 : 0}`;
    if (key === lastPosSentRef.current.key && since < POS_HEARTBEAT_MS) return;
    lastPosSentRef.current = { at: now, key };

    const pkt: CarbonLivePeerPacket = {
      i: myId,
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      z: Math.round(p.z * 100) / 100,
      vx: Math.round(p.vx * 10) / 10,
      vz: Math.round(p.vz * 10) / 10,
      yw: Math.round(p.yaw * 100) / 100,
      pt: Math.round(p.pitch * 100) / 100,
      w: me.weapon,
      d: p.isDashing ? 1 : 0,
      ab: p.isAirborne ? 1 : 0,
      sp: p.isSprinting ? 1 : 0,
      ts: p.isTurboSprint ? 1 : 0,
      t: 0,
    };

    ch.send({
      type: "broadcast",
      event: "pos",
      payload: pkt,
    });
  }, [myId, localPhysRef]);

  const broadcastShot = useCallback((shot: CarbonShotPacket) => {
    const shooter = combatantsRef.current[shot.shooterId];
    if (shooter) shooter.lastFiredAt = Date.now();
    channelRef.current?.send({
      type: "broadcast",
      event: "shot",
      payload: shot,
    });
  }, []);

  const claimHit = useCallback(
    (claim: CarbonHitClaimPacket) => {
      const actingArbiter =
        isHost || performance.now() - lastArbiterHeardRef.current > 3200;
      if (actingArbiter) {
        applyArbiterHit(claim);
      } else {
        channelRef.current?.send({
          type: "broadcast",
          event: "hit",
          payload: claim,
        });
      }
    },
    [isHost, applyArbiterHit]
  );

  const claimBarrelHit = useCallback(
    (barrelId: string, damage: number) => {
      if (!myId) return;
      const pkt: CarbonBarrelHitPacket = {
        shooterId: myId,
        barrelId,
        damage,
      };
      const actingArbiter =
        isHost || performance.now() - lastArbiterHeardRef.current > 3200;
      if (actingArbiter) {
        applyArbiterBarrelHit(pkt);
      } else {
        channelRef.current?.send({
          type: "broadcast",
          event: "barrel_hit",
          payload: pkt,
        });
      }
    },
    [myId, isHost, applyArbiterBarrelHit]
  );

  const swapLocalWeapon = useCallback(() => {
    const me = combatantsRef.current[myId];
    if (!me || !me.secondaryWeapon) return null;
    const prev = me.weapon;
    me.weapon = me.secondaryWeapon;
    me.secondaryWeapon = prev;
    carbonSfx.playPickup();
    setHudTick((t) => t + 1);
    return me.weapon;
  }, [myId]);

  const claimStimBoost = useCallback(() => {
    const me = combatantsRef.current[myId];
    if (me && me.isAlive) {
      me.hp = Math.min(me.maxHp, me.hp + 28);
      me.shield = Math.min(me.maxShield, me.shield + 20);
      setHudTick((t) => t + 1);
    }
    channelRef.current?.send({
      type: "broadcast",
      event: "stim",
      payload: { playerId: myId },
    });
  }, [myId]);

  const sendRefresh = useCallback(() => {
    channelRef.current?.send({
      type: "broadcast",
      event: "refresh",
      payload: {},
    });
  }, []);

  return {
    isLive,
    hudTick,
    combatantsRef,
    pickupsRef,
    barrelsRef,
    gemsRef,
    hardpointIndexRef,
    countdownEndsAtRef,
    countdownLeaderRef,
    peersRef,
    waveRef,
    waveRemRef,
    coreOwnerRef,
    coreProgRef,
    teamScoresRef,
    sendLocalPos,
    broadcastShot,
    claimHit,
    claimBarrelHit,
    claimStimBoost,
    swapLocalWeapon,
    sendRefresh,
  };
}
