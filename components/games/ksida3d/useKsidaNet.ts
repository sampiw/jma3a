"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/realtime/supabaseBrowser";
import { BotDriverMemory, stepKsidaBots } from "@/games/ksida3d/ai";
import { sortRacersStandings } from "@/games/ksida3d/engine";
import { CarKinematicsState } from "@/games/ksida3d/physics";
import { getSpawnSlots, TRACK_CHECKPOINTS, TRACK_POLYLINE } from "@/games/ksida3d/trackLayout";
import {
  KSIDA_TAUNTS,
  KSIDA_VEHICLES,
  KsidaAction,
  KsidaCratePad,
  KsidaHazardDrop,
  KsidaItemFirePacket,
  KsidaItemHitPacket,
  KsidaItemId,
  KsidaLivePeerPacket,
  KsidaMode,
  KsidaRacer,
  KsidaRamClaimPacket,
  KsidaSettings,
  KsidaTauntId,
  KsidaTauntPacket,
  KsidaVehicleId,
  KsidaWorldSyncPacket,
  KsidaWreckEventPacket,
} from "@/games/ksida3d/types";
import { ksidaSfx } from "./soundFx";

const POS_BROADCAST_MS = 58; // ~17Hz sampling coalesced into 11Hz Live Relay
const POS_HEARTBEAT_MS = 650;
const WORLD_SYNC_MS = 180;
const CHECKPOINT_API_MS = 10_000;

const MEME_BANNERS_BY_CAUSE: Record<KsidaWreckEventPacket["cause"], string[]> = {
  RAM: [
    "وجد الكونسطا! طوموبيل مشات لافيراي 📝💥",
    "تفرشخ فـ الروندا! شكون عطاك البيرمي؟ 🪪🔥",
    "دخلة ديال الطاكسيات الكبار! بااااك 🚕💀",
  ],
  SANDALA: [
    "صندالة الواليدة القاتلة! ما كاينش الهروب 🩴🎯",
    "طرااااخ! الصندالة الموجهة دارت خدمتها 🩴😂",
  ],
  BUTAGAZ: [
    "تفرگعات عليه البوطا فالسما! 🚀💥",
    "مول البوطا صيفطو للقمر! 🧪🔥",
  ],
  SOAP_OIL: [
    "زلق فالصابون البلدي! 720 درجة 🫧😂",
    "زيت العود خرجات عليه فالمنعرج! 🫒💀",
  ],
  WEDDING_HORN: [
    "طار بكلاكسون العرس برا الطريق! 📢💨",
    "طاط-طاط-طاطاطا! الصوت طيّرو! 🔊💥",
  ],
  WATERMELON: [
    "تفرشخ فـ دلاحة عملاقة وسط الطريق! 🍉💀",
  ],
  HOT_BOMB: [
    "نسى قنبلة البوطا فوق السقف وتفرگع! 💣🔥",
  ],
};

function pickWeightedItem(rankIndex: number, totalRacers: number): KsidaItemId {
  const isLeader = rankIndex === 0 && totalRacers > 1;
  const pool: KsidaItemId[] = isLeader
    ? ["SOAP_OIL", "WATERMELON", "WEDDING_HORN", "BUTAGAZ", "SOAP_OIL"]
    : [
        "SANDALA",
        "SANDALA",
        "ATAY_NITRO",
        "BUTAGAZ",
        "WEDDING_HORN",
        "WATERMELON",
      ];
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickBanner(cause: KsidaWreckEventPacket["cause"]): string {
  const arr = MEME_BANNERS_BY_CAUSE[cause] || MEME_BANNERS_BY_CAUSE.RAM;
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface UseKsidaNetOptions {
  roomCode: string;
  myId: string;
  isHost: boolean;
  round: number;
  phase: "PLAYING" | "GAME_OVER";
  mode: KsidaMode;
  endsAt: number;
  settings: KsidaSettings;
  initialRacers: Record<string, KsidaRacer>;
  initialCrates: KsidaCratePad[];
  initialCrownHolderId: string | null;
  initialHotBombHolderId: string | null;
  initialHotBombExplodesAt: number;
  localKinRef: React.MutableRefObject<CarKinematicsState>;
  localProgressRef: React.MutableRefObject<{
    lap: number;
    nextCheckpoint: number;
    trackProgress: number;
    wallHits: number;
    driftScore: number;
  }>;
  onRemoteItemFire: (pkt: KsidaItemFirePacket) => void;
  onWreckEvent: (ev: KsidaWreckEventPacket) => void;
  onLocalKnockback: (ix: number, iz: number, spinMs: number, damage: number, banner?: string) => void;
  onRespawnLocal: (x: number, y: number, z: number, yaw: number) => void;
  onExplosionVisual: (x: number, y: number, z: number, colorHex: number, labelAr?: string) => void;
  onAction: (action: KsidaAction) => Promise<void> | void;
  onRefresh?: () => void;
}

export function useKsidaNet({
  roomCode,
  myId,
  isHost,
  round,
  phase,
  mode,
  endsAt,
  settings,
  initialRacers,
  initialCrates,
  initialCrownHolderId,
  initialHotBombHolderId,
  initialHotBombExplodesAt,
  localKinRef,
  localProgressRef,
  onRemoteItemFire,
  onWreckEvent,
  onLocalKnockback,
  onRespawnLocal,
  onExplosionVisual,
  onAction,
  onRefresh,
}: UseKsidaNetOptions) {
  const [isLive, setIsLive] = useState(false);
  const [hudTick, setHudTick] = useState(0);

  const racersRef = useRef<Record<string, KsidaRacer>>({});
  const cratesRef = useRef<KsidaCratePad[]>([]);
  const hazardsRef = useRef<KsidaHazardDrop[]>([]);
  const peersRef = useRef<Map<string, KsidaLivePeerPacket>>(new Map());
  const botMemRef = useRef<Map<string, BotDriverMemory>>(new Map());

  const crownHolderRef = useRef<string | null>(initialCrownHolderId);
  const crownPosRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const crownTickAccRef = useRef<number>(0);

  const hotBombHolderRef = useRef<string | null>(initialHotBombHolderId);
  const hotBombExplodesAtRef = useRef<number>(initialHotBombExplodesAt);
  const lastBombTransferAtRef = useRef<number>(0);

  const raceFinishDeadlineRef = useRef<number>(0);
  const finishedSentRef = useRef<boolean>(false);
  const seqRef = useRef<number>(0);
  const lastArbiterHeardRef = useRef<number>(performance.now());
  const lastCheckpointAtRef = useRef<number>(Date.now());
  const lastPosSentRef = useRef<{ at: number; key: string }>({ at: 0, key: "" });

  const channelRef = useRef<RealtimeChannel | null>(null);

  const callbacksRef = useRef({
    onRemoteItemFire,
    onWreckEvent,
    onLocalKnockback,
    onRespawnLocal,
    onExplosionVisual,
    onAction,
    onRefresh,
  });
  callbacksRef.current = {
    onRemoteItemFire,
    onWreckEvent,
    onLocalKnockback,
    onRespawnLocal,
    onExplosionVisual,
    onAction,
    onRefresh,
  };

  // Re-initialize match state whenever `round` or `mode` changes
  useEffect(() => {
    const cloned: Record<string, KsidaRacer> = {};
    for (const [k, v] of Object.entries(initialRacers || {})) {
      cloned[k] = { ...v };
    }
    racersRef.current = cloned;
    cratesRef.current = (initialCrates || []).map((c) => ({ ...c }));
    hazardsRef.current = [];
    botMemRef.current.clear();

    crownHolderRef.current = initialCrownHolderId || null;
    crownPosRef.current = { x: 0, z: 0 };
    crownTickAccRef.current = 0;

    hotBombHolderRef.current = initialHotBombHolderId || null;
    hotBombExplodesAtRef.current =
      initialHotBombExplodesAt || (mode === "HOT_BOMB" ? Date.now() + 15_000 : 0);
    lastBombTransferAtRef.current = 0;
    raceFinishDeadlineRef.current = 0;
    finishedSentRef.current = false;

    const me = cloned[myId];
    if (me) {
      localProgressRef.current = {
        lap: me.lap || 1,
        nextCheckpoint: me.nextCheckpoint ?? 1,
        trackProgress: me.trackProgress || 0,
        wallHits: me.wallHits || 0,
        driftScore: me.driftScore || 0,
      };
      callbacksRef.current.onRespawnLocal(me.x, me.y, me.z, me.yaw);
    }
    setHudTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, mode, myId]);

  // Merge hot-joined human racers OR updated vehicle selection from room state
  useEffect(() => {
    let changed = false;
    for (const [id, r] of Object.entries(initialRacers || {})) {
      if (!r || r.isBot) continue;
      const existing = racersRef.current[id];
      if (!existing) {
        racersRef.current[id] = { ...r };
        if (id === myId) {
          callbacksRef.current.onRespawnLocal(r.x, r.y, r.z, r.yaw);
        }
        changed = true;
      } else if (existing.vehicle !== r.vehicle) {
        existing.vehicle = r.vehicle;
        existing.maxHp = KSIDA_VEHICLES[r.vehicle]?.maxHp || 100;
        existing.hp = Math.min(existing.maxHp, existing.hp);
        changed = true;
      }
    }

    // Smart Bot Policy: if 2+ humans are now present and botFill is OFF, prune solo bots!
    const humanCount = Object.values(racersRef.current).filter((u) => !u.isBot).length;
    if (humanCount >= 2 && !settings.botFill) {
      for (const [id, unit] of Object.entries(racersRef.current)) {
        if (unit.isBot) {
          delete racersRef.current[id];
          peersRef.current.delete(id);
          botMemRef.current.delete(id);
          changed = true;
        }
      }
    }

    if (changed) setHudTick((t) => t + 1);
  }, [initialRacers, settings.botFill, myId]);

  // Authoritative Damage / Takedown / Bomb-Pass / Crown-Steal resolver
  const applyArbiterDamage = useCallback(
    (opts: {
      attackerId: string;
      victimId: string;
      damage: number;
      cause: KsidaWreckEventPacket["cause"];
      impulseX: number;
      impulseZ: number;
      spinMs: number;
      hitX: number;
      hitZ: number;
    }) => {
      if (finishedSentRef.current || phase === "GAME_OVER") return;
      const attacker = racersRef.current[opts.attackerId];
      const victim = racersRef.current[opts.victimId];
      if (!victim || !victim.isAlive) return;

      const now = Date.now();
      if (victim.shieldUntil > now && opts.cause !== "HOT_BOMB") return;

      // Hot-Bomb Transfer on Ram!
      if (
        mode === "HOT_BOMB" &&
        opts.cause === "RAM" &&
        attacker &&
        attacker.id !== victim.id &&
        now - lastBombTransferAtRef.current > 1100
      ) {
        if (hotBombHolderRef.current === attacker.id) {
          hotBombHolderRef.current = victim.id;
          hotBombExplodesAtRef.current = Math.max(hotBombExplodesAtRef.current, now + 4500);
          lastBombTransferAtRef.current = now;
        } else if (hotBombHolderRef.current === victim.id) {
          hotBombHolderRef.current = attacker.id;
          hotBombExplodesAtRef.current = Math.max(hotBombExplodesAtRef.current, now + 4500);
          lastBombTransferAtRef.current = now;
        }
      }

      // Steal Golden Tagine Crown in DERBY on heavy hit (>= 18 dmg)!
      if (
        mode === "DERBY" &&
        attacker &&
        attacker.id !== victim.id &&
        crownHolderRef.current === victim.id &&
        opts.damage >= 18
      ) {
        crownHolderRef.current = attacker.id;
      }

      const actualDmg = Math.max(4, Math.round(opts.damage));
      victim.hp = Math.max(0, victim.hp - actualDmg);
      victim.lastDamagedBy = attacker?.id || null;
      if (opts.spinMs > 0) {
        victim.spinUntil = Math.max(victim.spinUntil, now + opts.spinMs);
      }

      // Dispatch knockback & camera shake to victim
      if (victim.id === myId) {
        callbacksRef.current.onLocalKnockback(
          opts.impulseX,
          opts.impulseZ,
          opts.spinMs,
          actualDmg
        );
      } else if (!victim.isBot) {
        channelRef.current?.send({
          type: "broadcast",
          event: "knock_fx",
          payload: {
            targetId: victim.id,
            ix: opts.impulseX,
            iz: opts.impulseZ,
            spn: opts.spinMs,
            dmg: actualDmg,
          },
        });
      } else {
        // Apply impulse directly to bot kinematics memory
        const bm = botMemRef.current.get(victim.id);
        if (bm) {
          bm.kin.vx += opts.impulseX;
          bm.kin.vz += opts.impulseZ;
          if (opts.spinMs > 0) bm.kin.spinTimer = opts.spinMs / 1000;
        }
      }

      // Check WRECK / TAKEDOWN!
      if (victim.hp <= 0) {
        victim.isAlive = false;
        victim.wrecksTaken += 1;
        victim.streak = 0;
        victim.heldItem = null;
        victim.respawnAt = now + 2400;

        if (crownHolderRef.current === victim.id) {
          if (attacker && attacker.id !== victim.id && attacker.isAlive) {
            crownHolderRef.current = attacker.id;
          } else {
            crownHolderRef.current = null;
            crownPosRef.current = { x: victim.x * 0.5, z: victim.z * 0.5 };
          }
        }

        if (attacker && attacker.id !== victim.id) {
          attacker.takedowns += 1;
          attacker.streak += 1;
          attacker.score += 20 + attacker.streak * 5;
          attacker.nitro = Math.min(100, attacker.nitro + 50);
        }

        const wreckPkt: KsidaWreckEventPacket = {
          id: `wrk_${now}_${Math.random().toString(36).slice(2, 6)}`,
          attackerId: attacker?.id || victim.id,
          attackerName: attacker?.nickname || "قنبلة البوطا",
          victimId: victim.id,
          victimName: victim.nickname,
          cause: opts.cause,
          streak: attacker?.streak || 1,
          memeBannerAr: pickBanner(opts.cause),
          x: victim.x,
          y: victim.y,
          z: victim.z,
          colorHex: attacker?.accentHex || 0xef4444,
        };

        callbacksRef.current.onWreckEvent(wreckPkt);
        channelRef.current?.send({
          type: "broadcast",
          event: "wreck",
          payload: wreckPkt,
        });
      }
    },
    [mode, myId, phase]
  );

  // Spawn static/rolling hazards (Beldi Soap Slick or Watermelon Boulders) on Arbiter
  const registerFiredItemHazard = useCallback((pkt: KsidaItemFirePacket) => {
    const now = Date.now();
    if (pkt.item === "SOAP_OIL") {
      const bx = pkt.x - Math.sin(pkt.yaw) * 2.8;
      const bz = pkt.z - Math.cos(pkt.yaw) * 2.8;
      hazardsRef.current.push({
        id: pkt.id,
        ownerId: pkt.ownerId,
        kind: "SOAP_OIL",
        x: Math.round(bx * 100) / 100,
        y: 0.05,
        z: Math.round(bz * 100) / 100,
        vx: 0,
        vz: 0,
        spawnedAt: now,
      });
      if (hazardsRef.current.length > 14) hazardsRef.current.shift();
    } else if (pkt.item === "WATERMELON") {
      for (const angOff of [-0.35, 0, 0.35]) {
        const a = pkt.yaw + Math.PI + angOff;
        hazardsRef.current.push({
          id: `${pkt.id}_${angOff}`,
          ownerId: pkt.ownerId,
          kind: "WATERMELON",
          x: Math.round((pkt.x + Math.sin(a) * 2.6) * 100) / 100,
          y: 0.5,
          z: Math.round((pkt.z + Math.cos(a) * 2.6) * 100) / 100,
          vx: Math.round(Math.sin(a) * 9.5 * 10) / 10,
          vz: Math.round(Math.cos(a) * 9.5 * 10) / 10,
          spawnedAt: now,
        });
      }
      while (hazardsRef.current.length > 16) hazardsRef.current.shift();
    } else if (pkt.item === "WEDDING_HORN") {
      // Instant AoE sonic bass blast around owner!
      ksidaSfx.playMemeHorn(1, pkt.ownerId === myId);
      callbacksRef.current.onExplosionVisual(pkt.x, pkt.y, pkt.z, 0xf59e0b, "بوق العرس! 📢");
      const BLAST_R = 9.8;
      for (const u of Object.values(racersRef.current)) {
        if (u.id === pkt.ownerId || !u.isAlive) continue;
        const dx = u.x - pkt.x;
        const dz = u.z - pkt.z;
        const d = Math.hypot(dx, dz);
        if (d <= BLAST_R) {
          const nx = d > 0.01 ? dx / d : 1;
          const nz = d > 0.01 ? dz / d : 0;
          applyArbiterDamage({
            attackerId: pkt.ownerId,
            victimId: u.id,
            damage: 28,
            cause: "WEDDING_HORN",
            impulseX: nx * 24,
            impulseZ: nz * 24,
            spinMs: 680,
            hitX: u.x,
            hitZ: u.z,
          });
        }
      }
    }
  }, [applyArbiterDamage, myId]);

  // Subscribe to Upstash 11Hz Live Relay Channel (`ksida3d:<ROOM_CODE>`)
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase || !roomCode || !myId) return;

    const ch = supabase.channel(`ksida3d:${roomCode.toUpperCase()}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    ch.on("broadcast", { event: "pos" }, ({ payload }) => {
      const p = payload as KsidaLivePeerPacket;
      if (!p || p.i === myId) return;
      peersRef.current.set(p.i, { ...p, t: performance.now() });
      const unit = racersRef.current[p.i];
      if (unit && unit.isAlive) {
        unit.x = p.x;
        unit.y = p.y;
        unit.z = p.z;
        unit.vx = p.vx;
        unit.vz = p.vz;
        unit.yaw = p.yw;
        unit.speed = p.sp;
        unit.vehicle = p.v;
        unit.lap = p.lp;
        unit.nextCheckpoint = p.cp;
        unit.trackProgress = p.pr;
        unit.wallHits = Math.max(unit.wallHits, p.wh || 0);
        unit.driftScore = Math.max(unit.driftScore, p.ds || 0);
      }
    })
      .on("broadcast", { event: "ram_hit" }, ({ payload }) => {
        const claim = payload as KsidaRamClaimPacket;
        if (!claim) return;
        if (isHost || performance.now() - lastArbiterHeardRef.current > 3200) {
          applyArbiterDamage({
            attackerId: claim.attackerId,
            victimId: claim.victimId,
            damage: claim.damage,
            cause: "RAM",
            impulseX: claim.impulseX,
            impulseZ: claim.impulseZ,
            spinMs: claim.spinMs,
            hitX: claim.x,
            hitZ: claim.z,
          });
        }
      })
      .on("broadcast", { event: "item_fire" }, ({ payload }) => {
        const pkt = payload as KsidaItemFirePacket;
        if (!pkt || pkt.ownerId === myId) return;
        const owner = racersRef.current[pkt.ownerId];
        if (owner) {
          owner.heldItem = null;
          if (pkt.item === "ATAY_NITRO") {
            owner.atayUntil = Date.now() + 6500;
          }
        }
        if (isHost || performance.now() - lastArbiterHeardRef.current > 3200) {
          registerFiredItemHazard(pkt);
        }
        callbacksRef.current.onRemoteItemFire(pkt);
      })
      .on("broadcast", { event: "item_hit" }, ({ payload }) => {
        const hit = payload as KsidaItemHitPacket;
        if (!hit) return;
        if (isHost || performance.now() - lastArbiterHeardRef.current > 3200) {
          const causeMap: Partial<Record<KsidaItemId, KsidaWreckEventPacket["cause"]>> = {
            SANDALA: "SANDALA",
            BUTAGAZ: "BUTAGAZ",
            SOAP_OIL: "SOAP_OIL",
            WEDDING_HORN: "WEDDING_HORN",
            WATERMELON: "WATERMELON",
          };
          applyArbiterDamage({
            attackerId: hit.attackerId,
            victimId: hit.victimId,
            damage: hit.damage,
            cause: causeMap[hit.item] || "SANDALA",
            impulseX: hit.impulseX,
            impulseZ: hit.impulseZ,
            spinMs: hit.spinMs,
            hitX: hit.x,
            hitZ: hit.z,
          });
        }
      })
      .on("broadcast", { event: "knock_fx" }, ({ payload }) => {
        if (!payload || payload.targetId !== myId) return;
        callbacksRef.current.onLocalKnockback(
          Number(payload.ix || 0),
          Number(payload.iz || 0),
          Number(payload.spn || 0),
          Number(payload.dmg || 15)
        );
      })
      .on("broadcast", { event: "wreck" }, ({ payload }) => {
        const ev = payload as KsidaWreckEventPacket;
        if (!ev) return;
        callbacksRef.current.onWreckEvent(ev);
      })
      .on("broadcast", { event: "taunt" }, ({ payload }) => {
        const t = payload as KsidaTauntPacket;
        if (!t) return;
        const r = racersRef.current[t.racerId];
        if (r) {
          r.lastTauntId = t.tauntId;
          r.lastTauntAt = Date.now();
        }
        const spec = KSIDA_TAUNTS[t.tauntId];
        if (spec) ksidaSfx.playMemeHorn(spec.hornStyle, false);
        setHudTick((v) => v + 1);
      })
      .on("broadcast", { event: "world" }, ({ payload }) => {
        const w = payload as KsidaWorldSyncPacket;
        if (!w || w.arbiterId === myId || isHost) return;

        seqRef.current = w.seq;
        lastArbiterHeardRef.current = performance.now();

        crownHolderRef.current = w.crownId;
        crownPosRef.current = { x: w.cx, z: w.cz };
        hotBombHolderRef.current = w.bombId;
        hotBombExplodesAtRef.current = w.bombAt;

        if (Array.isArray(w.crates)) {
          for (const cs of w.crates) {
            const c = cratesRef.current.find((item) => item.id === cs.i);
            if (c) c.available = cs.a === 1;
          }
        }

        if (Array.isArray(w.hazards)) {
          hazardsRef.current = w.hazards.map((h) => ({
            id: h.i,
            ownerId: h.o,
            kind: h.k,
            x: h.x,
            y: h.k === "SOAP_OIL" ? 0.05 : 0.5,
            z: h.z,
            vx: h.vx,
            vz: h.vz,
            spawnedAt: 0,
          }));
        }

        const nextMap: Record<string, KsidaRacer> = {};
        const nowPerf = performance.now();

        for (const u of w.units) {
          const prev = racersRef.current[u.i];
          const wasDead = prev && !prev.isAlive;
          const isMe = u.i === myId;

          if (isMe && prev && !prev.heldItem && u.it) {
            ksidaSfx.playCratePickup();
          }

          const recentPeer = !isMe && u.b === 0 ? peersRef.current.get(u.i) : undefined;
          const hasFreshPos = Boolean(recentPeer && nowPerf - recentPeer.t < 360);

          nextMap[u.i] = {
            id: u.i,
            nickname: u.n,
            isBot: u.b === 1,
            vehicle: isMe && prev ? prev.vehicle : u.v,
            accentHex: u.c,
            x:
              isMe && u.al === 1 && !wasDead
                ? localKinRef.current.x
                : hasFreshPos && recentPeer
                ? recentPeer.x
                : u.x,
            y:
              isMe && u.al === 1 && !wasDead
                ? localKinRef.current.y
                : hasFreshPos && recentPeer
                ? recentPeer.y
                : u.y,
            z:
              isMe && u.al === 1 && !wasDead
                ? localKinRef.current.z
                : hasFreshPos && recentPeer
                ? recentPeer.z
                : u.z,
            vx: isMe ? localKinRef.current.vx : hasFreshPos && recentPeer ? recentPeer.vx : u.vx,
            vz: isMe ? localKinRef.current.vz : hasFreshPos && recentPeer ? recentPeer.vz : u.vz,
            yaw: isMe
              ? localKinRef.current.yaw
              : hasFreshPos && recentPeer
              ? recentPeer.yw
              : u.yw,
            speed: isMe ? localKinRef.current.forwardSpeed : u.vx,
            hp: u.hp,
            maxHp: u.mhp,
            nitro: isMe && u.al === 1 && !wasDead ? localKinRef.current.nitro : u.nt,
            isAlive: u.al === 1,
            respawnAt: u.ra,
            heldItem: isMe && prev && prev.heldItem === null && u.it === prev.heldItem ? null : u.it,
            atayUntil: u.at,
            spinUntil: u.spn,
            shieldUntil: u.shd,
            lap: isMe ? localProgressRef.current.lap : u.lp,
            nextCheckpoint: isMe ? localProgressRef.current.nextCheckpoint : u.cp,
            trackProgress: isMe ? localProgressRef.current.trackProgress : u.pr,
            finishedAt: u.fn,
            score: u.sc,
            takedowns: u.tk,
            wrecksTaken: u.wt,
            wallHits: isMe ? localProgressRef.current.wallHits : u.wh,
            driftScore: isMe ? localProgressRef.current.driftScore : u.ds,
            streak: u.st,
            lastDamagedBy: prev?.lastDamagedBy || null,
            lastTauntId: prev?.lastTauntId || null,
            lastTauntAt: prev?.lastTauntAt || 0,
          };

          if (isMe && wasDead && u.al === 1) {
            callbacksRef.current.onRespawnLocal(u.x, u.y, u.z, u.yw);
          }

          // Feed bots & fallback remote cars into peersRef for silky 60fps Hermite interpolation!
          if (!isMe && u.al === 1 && (u.b === 1 || !hasFreshPos)) {
            peersRef.current.set(u.i, {
              i: u.i,
              x: u.x,
              y: u.y,
              z: u.z,
              vx: u.vx,
              vz: u.vz,
              yw: u.yw,
              sp: Math.hypot(u.vx, u.vz),
              st: 0,
              dr: 0,
              nt: u.at > Date.now() ? 1 : 0,
              v: u.v,
              lp: u.lp,
              cp: u.cp,
              pr: u.pr,
              wh: u.wh,
              ds: u.ds,
              t: nowPerf,
            });
          }
        }
        racersRef.current = nextMap;
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
  }, [
    roomCode,
    myId,
    isHost,
    applyArbiterDamage,
    registerFiredItemHazard,
    localKinRef,
    localProgressRef,
  ]);

  // Host / Solo Authoritative 20Hz Arbiter Loop
  useEffect(() => {
    if (phase === "GAME_OVER") return;

    let lastSimTime = performance.now();
    let lastWorldSent = 0;

    const timer = setInterval(() => {
      const perfNow = performance.now();
      const dt = Math.min(0.1, (perfNow - lastSimTime) / 1000);
      lastSimTime = perfNow;
      const now = Date.now();

      // Sync local human racer state from 60fps kinematics
      const me = racersRef.current[myId];
      if (me && me.isAlive) {
        me.x = localKinRef.current.x;
        me.y = localKinRef.current.y;
        me.z = localKinRef.current.z;
        me.vx = localKinRef.current.vx;
        me.vz = localKinRef.current.vz;
        me.yaw = localKinRef.current.yaw;
        me.speed = localKinRef.current.forwardSpeed;
        me.nitro = Math.round(localKinRef.current.nitro);
        me.wallHits = localProgressRef.current.wallHits;
        me.driftScore = localProgressRef.current.driftScore;

        if (mode === "RACE" && me.finishedAt === 0) {
          const prevLap = me.lap;
          me.lap = localProgressRef.current.lap;
          me.nextCheckpoint = localProgressRef.current.nextCheckpoint;
          me.trackProgress = localProgressRef.current.trackProgress;
          if (me.lap > prevLap) {
            me.score += 35;
          }
          if (me.lap > settings.targetLaps) {
            me.lap = settings.targetLaps;
            me.finishedAt = now;
            me.score += 110;
            ksidaSfx.playLapFanfare(true);
          }
        }
      }

      const actingArbiter = isHost || perfNow - lastArbiterHeardRef.current > 3200;
      if (!actingArbiter || finishedSentRef.current) {
        setHudTick((t) => (t + 1) % 10000);
        return;
      }

      const units = Object.values(racersRef.current);
      const sortedStandings = sortRacersStandings(units, mode);

      // 1. Respawns & Mystery Crate Pickups
      for (const u of units) {
        if (!u.isAlive) {
          if (u.respawnAt > 0 && now >= u.respawnAt) {
            let rx = 0;
            let rz = 0;
            let ryaw = 0;

            if (mode === "RACE") {
              // Respawn right near their active checkpoint corridor so they stay right in the race!
              const prevCpIdx =
                ((u.nextCheckpoint - 1) % TRACK_CHECKPOINTS.length +
                  TRACK_CHECKPOINTS.length) %
                TRACK_CHECKPOINTS.length;
              const sampleIdx = TRACK_CHECKPOINTS[prevCpIdx].sampleIndex;
              const pt = TRACK_POLYLINE[sampleIdx];
              const lateral = (Math.random() - 0.5) * 6;
              rx = pt.x + pt.nx * lateral;
              rz = pt.z + pt.nz * lateral;
              ryaw = pt.yaw;
            } else {
              const slots = getSpawnSlots(mode);
              const sp = slots[Math.floor(Math.random() * slots.length)];
              rx = sp.x;
              rz = sp.z;
              ryaw = sp.yaw;
            }

            u.isAlive = true;
            u.hp = u.maxHp;
            u.nitro = Math.max(u.nitro, 70);
            u.x = rx;
            u.y = 0;
            u.z = rz;
            u.vx = 0;
            u.vz = 0;
            u.yaw = ryaw;
            u.respawnAt = 0;
            u.shieldUntil = now + 2600;

            if (u.id === myId) {
              callbacksRef.current.onRespawnLocal(rx, 0, rz, ryaw);
            } else if (u.isBot) {
              const bm = botMemRef.current.get(u.id);
              if (bm) {
                bm.kin.x = rx;
                bm.kin.y = 0;
                bm.kin.z = rz;
                bm.kin.vx = 0;
                bm.kin.vz = 0;
                bm.kin.forwardSpeed = 0;
                bm.kin.yaw = ryaw;
              }
            }
          }
          continue;
        }

        // Mystery Crate collision
        for (const pad of cratesRef.current) {
          if (!pad.available) continue;
          if (Math.hypot(u.x - pad.x, u.z - pad.z) < 2.35) {
            pad.available = false;
            pad.respawnAt = now + 9500;
            u.nitro = Math.min(100, u.nitro + 25);
            if (!u.heldItem) {
              const rankIdx = Math.max(
                0,
                sortedStandings.findIndex((s) => s.id === u.id)
              );
              u.heldItem = pickWeightedItem(rankIdx, sortedStandings.length);
            }
            if (u.id === myId) {
              localKinRef.current.nitro = Math.min(100, localKinRef.current.nitro + 25);
              ksidaSfx.playCratePickup();
            }
          }
        }
      }

      for (const pad of cratesRef.current) {
        if (!pad.available && now >= pad.respawnAt) {
          pad.available = true;
        }
      }

      // 2. Step Rolling Watermelon & Beldi Soap Slick Hazards!
      for (let i = hazardsRef.current.length - 1; i >= 0; i--) {
        const h = hazardsRef.current[i];
        if (h.spawnedAt > 0 && now - h.spawnedAt > 18_000) {
          hazardsRef.current.splice(i, 1);
          continue;
        }
        if (h.kind === "WATERMELON") {
          h.x += h.vx * dt;
          h.z += h.vz * dt;
          h.vx *= Math.pow(0.88, dt);
          h.vz *= Math.pow(0.88, dt);
        }

        // Check collision with alive racers (ignore owner for first 1.2s)
        for (const u of units) {
          if (!u.isAlive) continue;
          if (u.id === h.ownerId && h.spawnedAt > 0 && now - h.spawnedAt < 1200) continue;
          const hitR = h.kind === "SOAP_OIL" ? 2.45 : 1.95;
          if (Math.hypot(u.x - h.x, u.z - h.z) <= hitR) {
            hazardsRef.current.splice(i, 1);
            applyArbiterDamage({
              attackerId: h.ownerId,
              victimId: u.id,
              damage: h.kind === "WATERMELON" ? 30 : 12,
              cause: h.kind,
              impulseX: h.vx * 0.8,
              impulseZ: h.vz * 0.8,
              spinMs: h.kind === "SOAP_OIL" ? 1150 : 650,
              hitX: u.x,
              hitZ: u.z,
            });
            break;
          }
        }
      }

      // 3. DERBY Golden Tagine Crown Logic
      if (mode === "DERBY") {
        const holder = crownHolderRef.current ? racersRef.current[crownHolderRef.current] : null;
        if (!holder || !holder.isAlive) {
          crownHolderRef.current = null;
          // Anyone driving near (crownX, crownZ) claims the Golden Tagine Crown!
          for (const u of units) {
            if (!u.isAlive) continue;
            if (Math.hypot(u.x - crownPosRef.current.x, u.z - crownPosRef.current.z) < 2.9) {
              crownHolderRef.current = u.id;
              if (u.id === myId) ksidaSfx.playCratePickup();
              break;
            }
          }
        } else {
          crownPosRef.current = { x: holder.x, z: holder.z };
          crownTickAccRef.current += dt;
          if (crownTickAccRef.current >= 1.0) {
            crownTickAccRef.current -= 1.0;
            holder.score += 3;
          }
        }
      }

      // 4. HOT_BOMB Ticking Roof Butagaz Logic
      if (mode === "HOT_BOMB") {
        const aliveList = units.filter((u) => u.isAlive);
        const holder = hotBombHolderRef.current
          ? racersRef.current[hotBombHolderRef.current]
          : null;

        if (!holder || !holder.isAlive) {
          if (aliveList.length > 0) {
            const nextVictim = aliveList[Math.floor(Math.random() * aliveList.length)];
            hotBombHolderRef.current = nextVictim.id;
            hotBombExplodesAtRef.current = now + 14_500;
          }
        } else if (now >= hotBombExplodesAtRef.current) {
          // BOOM!! Roof Butagaz Detonates!
          callbacksRef.current.onExplosionVisual(
            holder.x,
            holder.y + 1,
            holder.z,
            0xef4444,
            "تفرگعات البوطا! 💣💥"
          );
          ksidaSfx.playButagazExplosion();

          // Survivors earn +18 points!
          for (const surv of aliveList) {
            if (surv.id !== holder.id) {
              surv.score += 18;
            }
          }

          applyArbiterDamage({
            attackerId: holder.id,
            victimId: holder.id,
            damage: 999,
            cause: "HOT_BOMB",
            impulseX: 0,
            impulseZ: 0,
            spinMs: 900,
            hitX: holder.x,
            hitZ: holder.z,
          });

          const remainingAlive = units.filter((u) => u.isAlive && u.id !== holder.id);
          if (remainingAlive.length > 0) {
            const pick = remainingAlive[Math.floor(Math.random() * remainingAlive.length)];
            hotBombHolderRef.current = pick.id;
            hotBombExplodesAtRef.current = now + 15_000;
          } else {
            hotBombHolderRef.current = null;
            hotBombExplodesAtRef.current = now + 15_000;
          }
        }
      }

      // 5. Step Trash-Talking Moroccan AI Bots!
      stepKsidaBots(
        racersRef.current,
        cratesRef.current,
        botMemRef.current,
        mode,
        crownHolderRef.current,
        crownPosRef.current.x,
        crownPosRef.current.z,
        hotBombHolderRef.current,
        settings.targetLaps,
        dt,
        now,
        {
          onBotFireItem: (pkt) => {
            registerFiredItemHazard(pkt);
            callbacksRef.current.onRemoteItemFire(pkt);
            channelRef.current?.send({
              type: "broadcast",
              event: "item_fire",
              payload: pkt,
            });
          },
          onBotRamHit: (attId, vicId, dmg, ix, iz, spinMs, _isTBone, hx, hz) => {
            applyArbiterDamage({
              attackerId: attId,
              victimId: vicId,
              damage: dmg,
              cause: "RAM",
              impulseX: ix,
              impulseZ: iz,
              spinMs,
              hitX: hx,
              hitZ: hz,
            });
          },
          onBotTaunt: (botId, nickname, tauntId) => {
            const spec = KSIDA_TAUNTS[tauntId];
            if (spec) ksidaSfx.playMemeHorn(spec.hornStyle, false);
            channelRef.current?.send({
              type: "broadcast",
              event: "taunt",
              payload: { racerId: botId, nickname, tauntId } satisfies KsidaTauntPacket,
            });
          },
        }
      );

      // Update local peersRef for bots on Arbiter so Three.js renders them at 60fps
      for (const b of units) {
        if (!b.isBot || !b.isAlive) continue;
        const bm = botMemRef.current.get(b.id);
        peersRef.current.set(b.id, {
          i: b.id,
          x: b.x,
          y: b.y,
          z: b.z,
          vx: b.vx,
          vz: b.vz,
          yw: b.yaw,
          sp: b.speed,
          st: bm?.kin.steerAngle ?? 0,
          dr: bm?.kin.driftStage ?? 0,
          nt: bm?.kin.isNitroActive || b.atayUntil > now ? 1 : 0,
          v: b.vehicle,
          lp: b.lap,
          cp: b.nextCheckpoint,
          pr: b.trackProgress,
          wh: b.wallHits,
          ds: b.driftScore,
          t: perfNow,
        });
      }

      // 6. Evaluate Win & Match End Conditions
      let shouldEnd = now >= endsAt;

      if (mode === "RACE") {
        const humans = units.filter((u) => !u.isBot);
        const anyFinished = units.some((u) => u.finishedAt > 0);
        const allHumansFinished =
          humans.length > 0 && humans.every((h) => h.finishedAt > 0);

        if (anyFinished && raceFinishDeadlineRef.current === 0) {
          raceFinishDeadlineRef.current = now + 18_000; // 18s grace countdown after 1st crosses line!
        }
        if (
          allHumansFinished ||
          (raceFinishDeadlineRef.current > 0 && now >= raceFinishDeadlineRef.current)
        ) {
          shouldEnd = true;
        }
      } else if (mode === "DERBY") {
        if (units.some((u) => u.score >= settings.targetDerbyScore)) {
          shouldEnd = true;
        }
      }

      if (shouldEnd && !finishedSentRef.current) {
        finishedSentRef.current = true;
        const finalStandings = sortRacersStandings(units, mode);
        const champ = finalStandings[0];
        void Promise.resolve(
          callbacksRef.current.onAction({
            type: "FINISH_MATCH",
            racers: racersRef.current,
            winnerId: champ?.id || null,
          })
        ).then(() => {
          channelRef.current?.send({
            type: "broadcast",
            event: "refresh",
            payload: {},
          });
        });
        return;
      }

      // 7. Broadcast World Snapshot (~5.5Hz)
      if (perfNow - lastWorldSent >= WORLD_SYNC_MS) {
        lastWorldSent = perfNow;
        seqRef.current += 1;
        const pkt: KsidaWorldSyncPacket = {
          seq: seqRef.current,
          arbiterId: myId,
          crownId: crownHolderRef.current,
          cx: Math.round(crownPosRef.current.x * 10) / 10,
          cz: Math.round(crownPosRef.current.z * 10) / 10,
          bombId: hotBombHolderRef.current,
          bombAt: hotBombExplodesAtRef.current,
          crates: cratesRef.current.map((c) => ({ i: c.id, a: c.available ? 1 : 0 })),
          hazards: hazardsRef.current.map((h) => ({
            i: h.id,
            o: h.ownerId,
            k: h.kind,
            x: Math.round(h.x * 10) / 10,
            z: Math.round(h.z * 10) / 10,
            vx: Math.round(h.vx * 10) / 10,
            vz: Math.round(h.vz * 10) / 10,
          })),
          units: units.map((u) => ({
            i: u.id,
            n: u.nickname,
            b: u.isBot ? 1 : 0,
            v: u.vehicle,
            c: u.accentHex,
            x: Math.round(u.x * 100) / 100,
            y: Math.round(u.y * 100) / 100,
            z: Math.round(u.z * 100) / 100,
            vx: Math.round(u.vx * 10) / 10,
            vz: Math.round(u.vz * 10) / 10,
            yw: Math.round(u.yaw * 1000) / 1000,
            hp: Math.round(u.hp),
            mhp: u.maxHp,
            nt: Math.round(u.nitro),
            al: u.isAlive ? 1 : 0,
            ra: u.respawnAt,
            it: u.heldItem,
            at: u.atayUntil,
            spn: u.spinUntil,
            shd: u.shieldUntil,
            lp: u.lap,
            cp: u.nextCheckpoint,
            pr: u.trackProgress,
            fn: u.finishedAt,
            sc: Math.round(u.score),
            tk: u.takedowns,
            wt: u.wrecksTaken,
            wh: u.wallHits,
            ds: u.driftScore,
            st: u.streak,
          })),
        };
        channelRef.current?.send({
          type: "broadcast",
          event: "world",
          payload: pkt,
        });
      }

      // 8. Periodic Redis Checkpoint every 10s
      if (now - lastCheckpointAtRef.current >= CHECKPOINT_API_MS) {
        lastCheckpointAtRef.current = now;
        void callbacksRef.current.onAction({
          type: "SYNC_CHECKPOINT",
          racers: racersRef.current,
          crates: cratesRef.current,
          crownHolderId: crownHolderRef.current,
          hotBombHolderId: hotBombHolderRef.current,
          hotBombExplodesAt: hotBombExplodesAtRef.current,
        });
      }

      setHudTick((t) => (t + 1) % 10000);
    }, 50);

    return () => clearInterval(timer);
  }, [
    phase,
    isHost,
    myId,
    mode,
    endsAt,
    settings.targetLaps,
    settings.targetDerbyScore,
    applyArbiterDamage,
    registerFiredItemHazard,
    localKinRef,
    localProgressRef,
  ]);

  // Outbound Local Car Position Stream (~17Hz coalesced)
  const broadcastLocalPosTick = useCallback(() => {
    const ch = channelRef.current;
    const me = racersRef.current[myId];
    if (!ch || !me || !me.isAlive || phase === "GAME_OVER") return;

    const now = performance.now();
    const kin = localKinRef.current;
    const prog = localProgressRef.current;
    const key = `${kin.x.toFixed(1)}|${kin.z.toFixed(1)}|${kin.yaw.toFixed(2)}|${kin.driftStage}|${kin.isNitroActive ? 1 : 0}`;
    const elapsed = now - lastPosSentRef.current.at;

    if (elapsed < POS_BROADCAST_MS) return;
    if (key === lastPosSentRef.current.key && elapsed < POS_HEARTBEAT_MS) return;

    lastPosSentRef.current = { at: now, key };
    const pkt: KsidaLivePeerPacket = {
      i: myId,
      x: Math.round(kin.x * 100) / 100,
      y: Math.round(kin.y * 100) / 100,
      z: Math.round(kin.z * 100) / 100,
      vx: Math.round(kin.vx * 10) / 10,
      vz: Math.round(kin.vz * 10) / 10,
      yw: Math.round(kin.yaw * 1000) / 1000,
      sp: Math.round(kin.forwardSpeed * 10) / 10,
      st: Math.round(kin.steerAngle * 100) / 100,
      dr: kin.driftStage,
      nt: kin.isNitroActive || me.atayUntil > Date.now() ? 1 : 0,
      v: me.vehicle,
      lp: prog.lap,
      cp: prog.nextCheckpoint,
      pr: prog.trackProgress,
      wh: prog.wallHits,
      ds: prog.driftScore,
      t: 0,
    };
    ch.send({ type: "broadcast", event: "pos", payload: pkt });
  }, [myId, phase, localKinRef, localProgressRef]);

  const claimRamHit = useCallback(
    (claim: KsidaRamClaimPacket) => {
      if (isHost || performance.now() - lastArbiterHeardRef.current > 3200) {
        applyArbiterDamage({
          attackerId: claim.attackerId,
          victimId: claim.victimId,
          damage: claim.damage,
          cause: "RAM",
          impulseX: claim.impulseX,
          impulseZ: claim.impulseZ,
          spinMs: claim.spinMs,
          hitX: claim.x,
          hitZ: claim.z,
        });
      } else {
        channelRef.current?.send({
          type: "broadcast",
          event: "ram_hit",
          payload: claim,
        });
      }
    },
    [isHost, applyArbiterDamage]
  );

  const fireHeldMemeItem = useCallback((): KsidaItemFirePacket | null => {
    const me = racersRef.current[myId];
    if (!me || !me.isAlive || !me.heldItem || phase === "GAME_OVER") return null;

    const item = me.heldItem;
    me.heldItem = null;
    const now = Date.now();

    if (item === "ATAY_NITRO") {
      me.atayUntil = now + 6500;
      localKinRef.current.nitro = 100;
    }

    // Pick best homing target ahead for SANDALA
    let targetId: string | null = null;
    if (item === "SANDALA") {
      let bestScore = Infinity;
      const fx = Math.sin(localKinRef.current.yaw);
      const fz = Math.cos(localKinRef.current.yaw);
      for (const u of Object.values(racersRef.current)) {
        if (u.id === myId || !u.isAlive) continue;
        const dx = u.x - localKinRef.current.x;
        const dz = u.z - localKinRef.current.z;
        const d = Math.hypot(dx, dz);
        if (d > 55) continue;
        const fwdDot = (dx / (d || 1)) * fx + (dz / (d || 1)) * fz;
        const weight = d * (fwdDot > 0.2 ? 0.65 : 1.5);
        if (weight < bestScore) {
          bestScore = weight;
          targetId = u.id;
        }
      }
    }

    const pkt: KsidaItemFirePacket = {
      id: `itm_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      ownerId: myId,
      item,
      x: localKinRef.current.x,
      y: localKinRef.current.y + 0.7,
      z: localKinRef.current.z,
      yaw: localKinRef.current.yaw,
      speed: localKinRef.current.forwardSpeed,
      targetId,
    };

    if (isHost || performance.now() - lastArbiterHeardRef.current > 3200) {
      registerFiredItemHazard(pkt);
    }

    channelRef.current?.send({
      type: "broadcast",
      event: "item_fire",
      payload: pkt,
    });
    setHudTick((t) => t + 1);
    return pkt;
  }, [myId, phase, isHost, localKinRef, registerFiredItemHazard]);

  const claimProjectileHit = useCallback(
    (hit: KsidaItemHitPacket) => {
      if (isHost || performance.now() - lastArbiterHeardRef.current > 3200) {
        const causeMap: Partial<Record<KsidaItemId, KsidaWreckEventPacket["cause"]>> = {
          SANDALA: "SANDALA",
          BUTAGAZ: "BUTAGAZ",
          SOAP_OIL: "SOAP_OIL",
          WEDDING_HORN: "WEDDING_HORN",
          WATERMELON: "WATERMELON",
        };
        applyArbiterDamage({
          attackerId: hit.attackerId,
          victimId: hit.victimId,
          damage: hit.damage,
          cause: causeMap[hit.item] || "SANDALA",
          impulseX: hit.impulseX,
          impulseZ: hit.impulseZ,
          spinMs: hit.spinMs,
          hitX: hit.x,
          hitZ: hit.z,
        });
      } else {
        channelRef.current?.send({
          type: "broadcast",
          event: "item_hit",
          payload: hit,
        });
      }
    },
    [isHost, applyArbiterDamage]
  );

  const sendMemeTaunt = useCallback(
    (tauntId: KsidaTauntId) => {
      const me = racersRef.current[myId];
      if (!me) return;
      me.lastTauntId = tauntId;
      me.lastTauntAt = Date.now();
      const spec = KSIDA_TAUNTS[tauntId];
      if (spec) ksidaSfx.playMemeHorn(spec.hornStyle, true);
      channelRef.current?.send({
        type: "broadcast",
        event: "taunt",
        payload: {
          racerId: myId,
          nickname: me.nickname,
          tauntId,
        } satisfies KsidaTauntPacket,
      });
      setHudTick((t) => t + 1);
    },
    [myId]
  );

  const selectLocalVehicle = useCallback(
    async (vehicle: KsidaVehicleId) => {
      const me = racersRef.current[myId];
      const spec = KSIDA_VEHICLES[vehicle];
      if (me && spec) {
        me.vehicle = vehicle;
        me.maxHp = spec.maxHp;
        me.hp = spec.maxHp;
        setHudTick((t) => t + 1);
      }
      await callbacksRef.current.onAction({
        type: "SELECT_VEHICLE",
        vehicle,
      });
      channelRef.current?.send({
        type: "broadcast",
        event: "refresh",
        payload: {},
      });
    },
    [myId]
  );

  const notifyRoomRefresh = useCallback(() => {
    channelRef.current?.send({
      type: "broadcast",
      event: "refresh",
      payload: {},
    });
  }, []);

  return {
    isLive,
    hudTick,
    racersRef,
    cratesRef,
    hazardsRef,
    peersRef,
    crownHolderRef,
    crownPosRef,
    hotBombHolderRef,
    hotBombExplodesAtRef,
    broadcastLocalPosTick,
    claimRamHit,
    fireHeldMemeItem,
    claimProjectileHit,
    sendMemeTaunt,
    selectLocalVehicle,
    notifyRoomRefresh,
  };
}
