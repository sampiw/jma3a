"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/realtime/supabaseBrowser";
import {
  ARENA_SPAWN_POINTS,
  CORE_CAPTURE_RADIUS,
} from "@/games/carbon3d/arenaLayout";
import {
  BotRuntimeMemory,
  createSurvivalWaveBots,
  isHostile,
  stepArenaBots,
} from "@/games/carbon3d/ai";
import {
  CarbonAction,
  CarbonCombatant,
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

const POS_BROADCAST_MS = 50; // 20Hz smooth WiFi position ticks
const WORLD_SYNC_MS = 180; // ~5.5Hz authoritative HP/Shield/Score/Pads sync
const CHECKPOINT_API_MS = 10_000; // Persist to Redis every 10s only (zero HTTP lag!)

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
  localPhysRef: React.MutableRefObject<LocalPlayerPhysicsState>;
  onRemoteShot: (shot: CarbonShotPacket) => void;
  onKillEvent: (kill: CarbonKillEventPacket) => void;
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
  localPhysRef,
  onRemoteShot,
  onKillEvent,
  onDamageTaken,
  onRespawnLocal,
  onAction,
  onRefresh,
}: UseCarbonNetOptions) {
  const [isLive, setIsLive] = useState(false);

  // Authoritative / synced world state mirror kept in refs for 60fps Three.js access + light HUD state
  const combatantsRef = useRef<Record<string, CarbonCombatant>>({});
  const pickupsRef = useRef<CarbonPickupPad[]>([]);
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
  const lastPosSentRef = useRef<number>(0);
  const lastCheckpointAtRef = useRef<number>(Date.now());

  const callbacksRef = useRef({
    onRemoteShot,
    onKillEvent,
    onDamageTaken,
    onRespawnLocal,
    onAction,
    onRefresh,
  });
  callbacksRef.current = {
    onRemoteShot,
    onKillEvent,
    onDamageTaken,
    onRespawnLocal,
    onAction,
    onRefresh,
  };

  // Re-initialize match state whenever `round` or `mode` changes
  useEffect(() => {
    const clonedUnits: Record<string, CarbonCombatant> = {};
    for (const [k, v] of Object.entries(initialCombatants || {})) {
      clonedUnits[k] = { ...v };
    }
    combatantsRef.current = clonedUnits;
    pickupsRef.current = (initialPickups || []).map((p) => ({ ...p }));
    botMemRef.current.clear();
    waveRef.current = 1;
    waveRemRef.current = Object.values(clonedUnits).filter(
      (c) => c.isBot && c.team === "CRIMSON" && c.isAlive
    ).length;
    coreOwnerRef.current = "NEUTRAL";
    coreProgRef.current = 0;
    teamScoresRef.current = { CYAN: 0, CRIMSON: 0 };
    finishedSentRef.current = false;

    const me = clonedUnits[myId];
    if (me) {
      callbacksRef.current.onRespawnLocal(me.x, me.y, me.z, me.yaw);
    }
    setHudTick((t) => t + 1);
  }, [round, mode, myId]);

  // Apply damage & resolve kills on the Arbiter
  const applyArbiterHit = useCallback(
    (claim: CarbonHitClaimPacket) => {
      if (finishedSentRef.current || phase === "GAME_OVER") return;
      const shooter = combatantsRef.current[claim.shooterId];
      const victim = combatantsRef.current[claim.targetId];
      if (!shooter || !victim || !victim.isAlive) return;
      if (!isHostile(shooter, victim, mode)) return;

      const now = Date.now();
      const mult = shooter.overdriveUntil > now ? 1.35 : 1.0;
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
          mode === "SURVIVAL" && victim.isBot ? 0 : now + (mode === "SURVIVAL" ? 4500 : 2500);

        shooter.kills += 1;
        shooter.streak += 1;
        shooter.score += victim.archetype === "BOSS_MECH" ? 350 : 100 + shooter.streak * 15;

        if (mode === "SQUAD" && (shooter.team === "CYAN" || shooter.team === "CRIMSON")) {
          teamScoresRef.current[shooter.team] += 2;
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

  // Connect Supabase Realtime WebSocket Broadcast
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
        callbacksRef.current.onRemoteShot(s);
      })
      .on("broadcast", { event: "hit" }, ({ payload }) => {
        const claim = payload as CarbonHitClaimPacket;
        if (!claim) return;
        if (isHost) {
          applyArbiterHit(claim);
        }
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
      .on("broadcast", { event: "world" }, ({ payload }) => {
        const w = payload as CarbonWorldSyncPacket;
        if (!w || w.arbiterId === myId) return;
        if (w.seq < seqRef.current && w.arbiterId === "host") return;
        seqRef.current = w.seq;
        lastArbiterHeardRef.current = performance.now();

        waveRef.current = w.wave;
        waveRemRef.current = w.waveRem;
        coreOwnerRef.current = w.coreOwner;
        coreProgRef.current = w.coreProg;
        teamScoresRef.current = w.scores;

        const nextMap: Record<string, CarbonCombatant> = {};
        for (const u of w.units) {
          const prev = combatantsRef.current[u.i];
          const wasDead = prev && !prev.isAlive;
          const isMe = u.i === myId;

          nextMap[u.i] = {
            id: u.i,
            nickname: u.n,
            isBot: u.b === 1,
            archetype: u.ar,
            team: u.tm,
            accentHex: u.c,
            x: isMe && u.al === 1 && !wasDead ? localPhysRef.current.x : u.x,
            y: isMe && u.al === 1 && !wasDead ? localPhysRef.current.y : u.y,
            z: isMe && u.al === 1 && !wasDead ? localPhysRef.current.z : u.z,
            yaw: isMe ? localPhysRef.current.yaw : u.yw,
            pitch: isMe ? localPhysRef.current.pitch : prev?.pitch ?? 0,
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
            score: u.sc,
            streak: u.st,
            overdriveUntil: u.od,
            lastDamagedAt: prev?.lastDamagedAt ?? 0,
          };

          // If local player just respawned on arbiter, snap to new spawn!
          if (isMe && wasDead && u.al === 1) {
            callbacksRef.current.onRespawnLocal(u.x, u.y, u.z, u.yw);
          }

          // Feed bots into peersRef so Carbon3DArena interpolates bots smoothly at 60fps on guest phones too!
          if (u.b === 1 && u.al === 1) {
            const dx = prev ? (u.x - prev.x) / (WORLD_SYNC_MS / 1000) : 0;
            const dz = prev ? (u.z - prev.z) / (WORLD_SYNC_MS / 1000) : 0;
            peersRef.current.set(u.i, {
              i: u.i,
              x: u.x,
              y: u.y,
              z: u.z,
              vx: Math.max(-12, Math.min(12, dx)),
              vz: Math.max(-12, Math.min(12, dz)),
              yw: u.yw,
              pt: 0,
              w: u.w,
              t: performance.now(),
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
  }, [roomCode, myId, isHost, applyArbiterHit, localPhysRef]);

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

      // Sync my local physics coordinates into combatantsRef
      const me = combatantsRef.current[myId];
      if (me && me.isAlive) {
        me.x = localPhysRef.current.x;
        me.y = localPhysRef.current.y;
        me.z = localPhysRef.current.z;
        me.yaw = localPhysRef.current.yaw;
        me.pitch = localPhysRef.current.pitch;
      }

      // Check if we act as Arbiter (Host, Solo, or Failover if Host dropped for > 3.2s)
      const actingArbiter =
        isHost || perfNow - lastArbiterHeardRef.current > 3200;
      if (!actingArbiter || finishedSentRef.current) {
        setHudTick((t) => (t + 1) % 10000);
        return;
      }

      const units = Object.values(combatantsRef.current);

      // 1. Shield Regeneration, Respawns & Pickup Pad Collisions
      for (const u of units) {
        if (!u.isAlive) {
          if (u.respawnAt > 0 && now >= u.respawnAt) {
            const pool =
              mode === "FFA"
                ? ARENA_SPAWN_POINTS
                : ARENA_SPAWN_POINTS.filter((s) => s.team === u.team);
            // Pick spawn farthest from enemies!
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

        // Halo/Apex fast tactical shield recharge after 3.4s out of combat
        if (u.shield < u.maxShield && now - u.lastDamagedAt > 3400) {
          u.shield = Math.min(u.maxShield, u.shield + 20 * dt);
        }

        // Check pickup pads
        for (const pad of pickupsRef.current) {
          if (!pad.available) continue;
          if (u.isBot && mode === "SURVIVAL") continue; // Survival enemies don't steal player pads
          const distXZ = Math.hypot(u.x - pad.x, u.z - pad.z);
          if (distXZ < 1.55 && Math.abs(u.y - pad.y) < 1.4) {
            pad.available = false;
            pad.respawnAt = now + (pad.kind === "OVERDRIVE_AMP" ? 22_000 : 12_000);

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
              u.hp = Math.min(u.maxHp, u.hp + 35);
            } else if (pad.kind === "OVERDRIVE_AMP") {
              u.overdriveUntil = now + 12_000;
              u.shield = u.maxShield;
            }
            if (u.id === myId) carbonSfx.playPickup();
          }
        }
      }

      // Respawn pickup pads
      for (const pad of pickupsRef.current) {
        if (!pad.available && now >= pad.respawnAt) {
          pad.available = true;
        }
      }

      // 2. Central Overdrive Core Capture (SQUAD mode)
      if (mode === "SQUAD") {
        let cyanIn = 0;
        let crimsonIn = 0;
        for (const u of units) {
          if (!u.isAlive) continue;
          if (Math.hypot(u.x, u.z) <= CORE_CAPTURE_RADIUS && u.y >= 0.65) {
            if (u.team === "CYAN") cyanIn++;
            else if (u.team === "CRIMSON") crimsonIn++;
          }
        }
        if (cyanIn > 0 && crimsonIn > 0) {
          coreOwnerRef.current = "CONTESTED";
        } else if (cyanIn > 0) {
          coreProgRef.current = Math.min(100, coreProgRef.current + 28 * dt);
          if (coreProgRef.current >= 100) coreOwnerRef.current = "CYAN";
        } else if (crimsonIn > 0) {
          coreProgRef.current = Math.max(-100, coreProgRef.current - 28 * dt);
          if (coreProgRef.current <= -100) coreOwnerRef.current = "CRIMSON";
        }

        // Award +1 point every 2s to core owner
        if (Math.floor((now - dt * 1000) / 2000) !== Math.floor(now / 2000)) {
          if (coreOwnerRef.current === "CYAN") teamScoresRef.current.CYAN += 1;
          else if (coreOwnerRef.current === "CRIMSON") teamScoresRef.current.CRIMSON += 1;
        }
      }

      // 3. Survival Wave Progression (Solo / Co-op PvE)
      if (mode === "SURVIVAL") {
        const aliveEnemies = units.filter((u) => u.isBot && u.team === "CRIMSON" && u.isAlive);
        waveRemRef.current = aliveEnemies.length;

        // Check if ALL human players are dead simultaneously -> Survival Game Over!
        const humans = units.filter((u) => !u.isBot);
        if (humans.length > 0 && humans.every((h) => !h.isAlive) && waveRef.current >= 1) {
          // Allow respawn unless Solo or whole squad wiped simultaneously
          finishedSentRef.current = true;
          const topHuman = [...humans].sort((a, b) => b.kills - a.kills)[0];
          const summary = `صمدتو حتى للموجة ${waveRef.current} وقضيتو على ${humans.reduce(
            (s, h) => s + h.kills,
            0
          )} آلي! البطل: ${topHuman?.nickname || "البطل"} 🔥`;
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
          // Next Wave! Clean old dead wave bots, heal/shield humans, spawn escalated wave!
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

      // 4. Tick AI Bots & Broadcast Bot Shots
      const botShots = stepArenaBots(
        combatantsRef.current,
        pickupsRef.current,
        botMemRef.current,
        mode,
        settings.botDifficulty || "HARD",
        now,
        dt
      );
      for (const bShot of botShots) {
        callbacksRef.current.onRemoteShot(bShot);
        channelRef.current?.send({
          type: "broadcast",
          event: "shot",
          payload: bShot,
        });
      }

      // 5. Check Match Win Conditions (FFA / SQUAD / Timer)
      const timeExpired = now >= endsAt;
      if (mode === "FFA") {
        const leader = [...units].sort((a, b) => b.kills - a.kills || b.score - a.score)[0];
        if (leader && (leader.kills >= (settings.targetKillsFFA || 15) || timeExpired)) {
          finishedSentRef.current = true;
          const summary = `👑 ${leader.nickname} سيطر على كاربون أرينا بـ ${leader.kills} إقصاء و ${leader.score} نقطة!`;
          Promise.resolve(
            callbacksRef.current.onAction({
              type: "FINISH_MATCH",
              combatants: combatantsRef.current,
              winnerId: leader.id,
              winnerSummaryAr: summary,
            })
          ).then(() => {
            channelRef.current?.send({ type: "broadcast", event: "refresh", payload: {} });
            callbacksRef.current.onRefresh?.();
          });
          return;
        }
      } else if (mode === "SQUAD") {
        const target = settings.targetScoreSquad || 40;
        const sc = teamScoresRef.current;
        if (sc.CYAN >= target || sc.CRIMSON >= target || timeExpired) {
          finishedSentRef.current = true;
          const winTeam = sc.CYAN >= sc.CRIMSON ? "CYAN" : "CRIMSON";
          const teamAr = winTeam === "CYAN" ? "فريق السايان ⚡" : "فريق الكريمسون 🔥";
          const mvp = [...units]
            .filter((u) => u.team === winTeam)
            .sort((a, b) => b.kills - a.kills)[0];
          const summary = `انتصر ${teamAr} (${sc.CYAN} - ${sc.CRIMSON})! نجم المعركة: ${
            mvp?.nickname || "البطل"
          } 👑`;
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

      // 6. Broadcast World Snapshot @ ~5.5Hz over WebSocket
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
          coreOwner: coreOwnerRef.current,
          coreProg: Math.round(coreProgRef.current),
          scores: teamScoresRef.current,
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

      // 7. Rare 10s Redis Checkpoint (keeps late-reloading browsers updated with zero lag)
      if (now - lastCheckpointAtRef.current >= CHECKPOINT_API_MS && isHost) {
        lastCheckpointAtRef.current = now;
        callbacksRef.current.onAction({
          type: "SYNC_CHECKPOINT",
          combatants: combatantsRef.current,
          pickups: pickupsRef.current,
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

  /** Sends local player position @ 20Hz over Supabase WebSocket */
  const sendLocalPos = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || !myId) return;
    const now = performance.now();
    if (now - lastPosSentRef.current < POS_BROADCAST_MS) return;
    lastPosSentRef.current = now;

    const p = localPhysRef.current;
    const me = combatantsRef.current[myId];
    if (!me || !me.isAlive) return;

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
      t: 0,
    };
    ch.send({ type: "broadcast", event: "pos", payload: pkt });
  }, [myId, localPhysRef]);

  /** Broadcasts a weapon or grenade shot to all WiFi peers */
  const broadcastShot = useCallback((shot: CarbonShotPacket) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "shot",
      payload: shot,
    });
  }, []);

  /** Claims a confirmed projectile/hitscan hit (local Arbiter applies at 0ms, or relays to Host!) */
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

  const swapLocalWeapon = useCallback(() => {
    const me = combatantsRef.current[myId];
    if (!me || !me.secondaryWeapon) return false;
    const prev = me.weapon;
    me.weapon = me.secondaryWeapon;
    me.secondaryWeapon = prev;
    setHudTick((t) => t + 1);
    return true;
  }, [myId]);

  const sendRefresh = useCallback(() => {
    channelRef.current?.send({ type: "broadcast", event: "refresh", payload: {} });
  }, []);

  return {
    isLive,
    hudTick,
    combatantsRef,
    pickupsRef,
    peersRef,
    waveRef,
    waveRemRef,
    coreOwnerRef,
    coreProgRef,
    teamScoresRef,
    sendLocalPos,
    broadcastShot,
    claimHit,
    swapLocalWeapon,
    sendRefresh,
  };
}
