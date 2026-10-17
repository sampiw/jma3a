"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/realtime/supabaseBrowser";
import { sound } from "@/lib/sound";
import {
  RIYAD3D_ARENA_HALF,
  RIYAD3D_HIDING_SPOTS,
  RIYAD3D_VAN_ZONE,
  Riyad3DAction,
  Riyad3DFeedEvent,
  Riyad3DMonsterAlert,
  Riyad3DPoseBroadcast,
  Riyad3DPlayerState,
  Riyad3DTreasureItem,
} from "@/games/riyad3d/types";
import Riyad3DArena, { Riyad3DNearbyContext } from "./Riyad3DArena";

export interface Riyad3DGameViewProps {
  publicData: Record<string, any>;
  privateData?: Record<string, any>;
  isHost?: boolean;
  onAction: (action: Riyad3DAction) => Promise<void> | void;
  players?: any[];
  activePlayerId?: string;
  roomCode?: string;
  onRefresh?: () => void;
}

export function Riyad3DGameView({
  publicData,
  privateData,
  onAction,
  activePlayerId,
  roomCode = "RIYAD",
}: Riyad3DGameViewProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const onDispatch = useCallback(
    async (action: Riyad3DAction) => {
      await onAction(action);
    },
    [onAction]
  );

  const publicView = publicData ?? {};
  const players = (publicView.players as Riyad3DPlayerState[]) ?? [];
  const treasures = (publicView.treasures as Riyad3DTreasureItem[]) ?? [];
  const recentEvents = (publicView.recentEvents as Riyad3DFeedEvent[]) ?? [];
  const lastMonsterAlert =
    (publicView.lastMonsterAlert as Riyad3DMonsterAlert | null) ?? null;

  const quotaDh = Number(publicView.quotaDh ?? 4500);
  const totalExtractedDh = Number(publicView.totalExtractedDh ?? 0);
  const endsAt = String(publicView.endsAt ?? "");
  const phase = String(publicView.phase ?? "active");

  const resolvedPlayerId =
    activePlayerId ||
    (privateData?.me as Riyad3DPlayerState | undefined)?.id ||
    players[0]?.id ||
    "local";

  const myPlayer = useMemo(() => {
    return (
      players.find((p) => p.id === resolvedPlayerId) ??
      players[0] ?? {
        id: resolvedPlayerId,
        name: "لص الرياض",
        extractedDh: 0,
        extractedCount: 0,
        shatteredCount: 0,
        shovesDealt: 0,
        timesCaughtByMonster: 0,
        carryingLootId: null,
        hiddenSpotId: null,
        stunnedUntilAt: null,
        shoveCooldownUntilAt: null,
        spawnX: 0,
        spawnZ: 23,
      }
    );
  }, [players, resolvedPlayerId]);

  const myCarriedLoot = useMemo(() => {
    if (!myPlayer.carryingLootId) return null;
    return treasures.find((t) => t.id === myPlayer.carryingLootId) ?? null;
  }, [myPlayer.carryingLootId, treasures]);

  // Controls & Realtime Refs
  const remotePosesRef = useRef<Record<string, Riyad3DPoseBroadcast>>({});
  const joystickRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lookDeltaRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const sprintRef = useRef<boolean>(false);

  const [isSprintingUI, setIsSprintingUI] = useState(false);
  const [nearby, setNearby] = useState<Riyad3DNearbyContext>({
    nearestLoot: null,
    inVanZone: false,
    nearestHidingSpot: null,
    nearestShoveTarget: null,
    monsterDist: 30,
    monsterX: 0,
    monsterZ: -20,
    myX: myPlayer.spawnX,
    myZ: myPlayer.spawnZ,
  });

  const [secondsLeft, setSecondsLeft] = useState<number>(180);
  const [crackFlashText, setCrackFlashText] = useState<string | null>(null);
  const [monsterJumpscareText, setMonsterJumpscareText] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  // Virtual Joystick visual state
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const joyTouchIdRef = useRef<number | null>(null);
  const joyOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lookTouchIdRef = useRef<number | null>(null);
  const lookLastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Supabase Realtime Channel for 12Hz 3D Pose Broadcasts
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const ch = supabase.channel(`riyad3d:${roomCode.toUpperCase()}`, {
      config: { broadcast: { self: false } },
    });

    ch.on("broadcast", { event: "pose" }, ({ payload }) => {
      const data = payload as Riyad3DPoseBroadcast;
      if (data && data.playerId && data.playerId !== myPlayer.id) {
        remotePosesRef.current[data.playerId] = data;
      }
    }).subscribe();

    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [roomCode, myPlayer.id]);

  const handleBroadcastPose = useCallback((pose: Riyad3DPoseBroadcast) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "pose",
      payload: pose,
    });
  }, []);

  // Round Countdown Timer
  const timeoutSentRef = useRef(false);
  useEffect(() => {
    timeoutSentRef.current = false;
  }, [publicView.round, phase]);

  useEffect(() => {
    if (phase !== "active" || !endsAt) return;
    const tick = () => {
      const rem = Math.max(
        0,
        Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(rem);
      if (rem <= 0 && !timeoutSentRef.current) {
        timeoutSentRef.current = true;
        onDispatch({ type: "TIMEOUT_ROUND" }).catch(() => {});
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, endsAt, onDispatch]);

  // Handle R.E.P.O. Wall Bump While Carrying Treasure
  const handleWallBumpWhileCarrying = useCallback(
    (x: number, z: number) => {
      if (!myCarriedLoot || phase !== "active") return;

      const willShatter = myCarriedLoot.durability <= 28;
      if (willShatter) {
        sound.playGlassShatter();
        setCrackFlashText(
          `💔💥 تهرّس "${myCarriedLoot.emoji} ${myCarriedLoot.titleAr}" كامل! (0 DH) — الغول سمع الصداع وجاي يجري!`
        );
      } else {
        sound.playGlassCrack();
        setCrackFlashText(
          `💥 زدحتي "${myCarriedLoot.emoji} ${myCarriedLoot.titleAr}" مع الحيط! نقصت قيمتو بـ -25%!`
        );
      }

      setTimeout(() => {
        setCrackFlashText(null);
      }, 2800);

      onDispatch({
        type: "DAMAGE_CARRIED_LOOT",
        damagePercent: 28,
        x,
        z,
      }).catch(() => {});
    },
    [myCarriedLoot, phase, onDispatch]
  );

  // Handle Haunted Ghoul Strike
  const handleMonsterStrikeMe = useCallback(
    (dropX: number, dropZ: number) => {
      if (phase !== "active") return;
      sound.playMonsterRoar();
      setMonsterJumpscareText(
        "👹💥 شدّك الغول المسكون فـ الظلام! طاح الكنز من يدك وتلاحيتي لباب الرياض!"
      );
      setTimeout(() => {
        setMonsterJumpscareText(null);
      }, 3200);

      onDispatch({
        type: "MONSTER_STRIKE",
        targetPlayerId: myPlayer.id,
        dropX,
        dropZ,
      }).catch(() => {});
    },
    [phase, myPlayer.id, onDispatch]
  );

  // Action Handlers
  const handlePickupNearest = async () => {
    if (!nearby.nearestLoot || busyAction) return;
    setBusyAction(true);
    sound.playCardFlip();
    try {
      await onDispatch({
        type: "PICKUP_LOOT",
        lootId: nearby.nearestLoot.loot.id,
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleDropLoot = async () => {
    if (!myCarriedLoot || busyAction) return;
    setBusyAction(true);
    sound.playCardFlip();
    try {
      await onDispatch({
        type: "DROP_LOOT",
        x: nearby.myX,
        z: nearby.myZ,
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleExtractLoot = async () => {
    if (!myCarriedLoot || !nearby.inVanZone || busyAction) return;
    setBusyAction(true);
    sound.playCashRegister();
    try {
      await onDispatch({ type: "EXTRACT_LOOT" });
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleHide = async () => {
    if (busyAction) return;
    setBusyAction(true);
    sound.playCardFlip();
    try {
      if (myPlayer.hiddenSpotId) {
        await onDispatch({ type: "TOGGLE_HIDE", spotId: null });
      } else if (nearby.nearestHidingSpot) {
        await onDispatch({
          type: "TOGGLE_HIDE",
          spotId: nearby.nearestHidingSpot.spot.id,
        });
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleShoveFriend = async () => {
    if (!nearby.nearestShoveTarget || busyAction) return;
    const targetPose = remotePosesRef.current[nearby.nearestShoveTarget.playerId];
    setBusyAction(true);
    sound.playGlassCrack();
    try {
      await onDispatch({
        type: "SHOVE_PLAYER",
        targetPlayerId: nearby.nearestShoveTarget.playerId,
        dropX: targetPose?.x ?? nearby.myX,
        dropZ: targetPose?.z ?? nearby.myZ,
      });
    } finally {
      setBusyAction(false);
    }
  };

  const shoveOnCooldown = Boolean(
    myPlayer.shoveCooldownUntilAt && myPlayer.shoveCooldownUntilAt > Date.now()
  );
  const isStunned = Boolean(
    myPlayer.stunnedUntilAt && myPlayer.stunnedUntilAt > Date.now()
  );

  // Format MM:SS
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const quotaProgressPct = Math.min(
    100,
    Math.round((totalExtractedDh / Math.max(1, quotaDh)) * 100)
  );

  const availableTreasuresCount = treasures.filter(
    (t) => t.status === "available" || t.status === "carried"
  ).length;

  if (!mounted) return null;

  const content = (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9999] w-screen h-screen overflow-hidden bg-[#060a12] text-white select-none touch-none font-sans"
    >
      {/* 3D Three.js Haunted Riyad Canvas */}
      <Riyad3DArena
        myPlayer={myPlayer}
        players={players}
        treasures={treasures}
        lastMonsterAlert={lastMonsterAlert}
        remotePosesRef={remotePosesRef}
        joystickRef={joystickRef}
        lookDeltaRef={lookDeltaRef}
        sprintRef={sprintRef}
        onBroadcastPose={handleBroadcastPose}
        onNearbyContextChange={setNearby}
        onWallBumpWhileCarrying={handleWallBumpWhileCarrying}
        onMonsterStrikeMe={handleMonsterStrikeMe}
      />

      {/* Right-Half Touch Look Drag Area */}
      <div
        className="absolute inset-y-0 right-0 w-1/2 z-10"
        onPointerDown={(e) => {
          if (lookTouchIdRef.current !== null) return;
          lookTouchIdRef.current = e.pointerId;
          lookLastPosRef.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (lookTouchIdRef.current !== e.pointerId) return;
          const dx = e.clientX - lookLastPosRef.current.x;
          const dy = e.clientY - lookLastPosRef.current.y;
          lookLastPosRef.current = { x: e.clientX, y: e.clientY };
          lookDeltaRef.current.dx += dx;
          lookDeltaRef.current.dy += dy;
        }}
        onPointerUp={(e) => {
          if (lookTouchIdRef.current === e.pointerId) {
            lookTouchIdRef.current = null;
          }
        }}
        onPointerCancel={(e) => {
          if (lookTouchIdRef.current === e.pointerId) {
            lookTouchIdRef.current = null;
          }
        }}
      />

      {/* Monster Proximity Red Vignette */}
      {nearby.monsterDist < 10 && !myPlayer.hiddenSpotId && (
        <div
          className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-200"
          style={{
            background:
              "radial-gradient(circle, transparent 45%, rgba(220, 38, 38, 0.55) 100%)",
            opacity: Math.min(1, (10 - nearby.monsterDist) / 7),
          }}
        />
      )}

      {/* Fullscreen Jumpscare / Crack Impact Flash */}
      {monsterJumpscareText && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-red-950/85 backdrop-blur-sm animate-pulse px-6 text-center">
          <div className="max-w-lg rounded-3xl border-2 border-red-400 bg-black/90 p-6 shadow-2xl">
            <div className="text-6xl mb-3">👹💥</div>
            <p className="text-2xl font-black text-red-200">
              {monsterJumpscareText}
            </p>
          </div>
        </div>
      )}

      {crackFlashText && (
        <div className="pointer-events-none absolute top-24 inset-x-0 z-40 flex justify-center px-4">
          <div className="rounded-2xl border-2 border-amber-400 bg-red-950/95 px-5 py-3 text-center shadow-2xl animate-bounce">
            <p className="text-sm sm:text-base font-black text-amber-200">
              {crackFlashText}
            </p>
          </div>
        </div>
      )}

      {/* TOP HUD BAR: Quota Progress + Personal Bag + Timer + Minimap */}
      <div className="pointer-events-none absolute top-3 inset-x-3 z-30 flex items-start justify-between gap-2">
        {/* Left/Right Info Cards */}
        <div className="flex flex-wrap items-center gap-2 max-w-[70%]">
          {/* Extraction Van Quota Card */}
          <div className="rounded-2xl border border-emerald-400/40 bg-slate-950/85 backdrop-blur-md px-3.5 py-2 shadow-lg">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-black text-emerald-300">
              <span>🚐 الهوندا:</span>
              <span className="text-white">
                {totalExtractedDh} / {quotaDh} DH
              </span>
              <span className="text-[11px] text-amber-300">
                (باقي {availableTreasuresCount} كنوز)
              </span>
            </div>
            <div className="mt-1.5 h-2 w-40 sm:w-52 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all duration-300"
                style={{ width: `${quotaProgressPct}%` }}
              />
            </div>
          </div>

          {/* Personal Stolen Bag + Timer */}
          <div className="rounded-2xl border border-amber-400/40 bg-slate-950/85 backdrop-blur-md px-3.5 py-2 shadow-lg flex items-center gap-3">
            <div>
              <div className="text-[10px] text-slate-400 font-bold">
                💰 غنيمتك
              </div>
              <div className="text-sm sm:text-base font-black text-amber-300">
                {myPlayer.extractedDh} DH
              </div>
            </div>
            <div className="h-7 w-px bg-slate-700" />
            <div>
              <div className="text-[10px] text-slate-400 font-bold">
                ⏳ الوقت
              </div>
              <div
                className={`text-sm sm:text-base font-black ${
                  secondsLeft <= 30 ? "text-red-400 animate-pulse" : "text-sky-300"
                }`}
              >
                {mm}:{ss}
              </div>
            </div>
          </div>

          {/* Live Feed Toast */}
          {recentEvents[0] && (
            <div className="hidden md:flex items-center rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3.5 py-2 text-xs font-bold text-slate-200 max-w-md truncate">
              {recentEvents[0].textAr}
            </div>
          )}
        </div>

        {/* Corner Radar Minimap (🗺️) */}
        <div className="rounded-2xl border border-emerald-500/40 bg-slate-950/90 backdrop-blur-md p-2 shadow-xl flex flex-col items-center">
          <div className="text-[10px] font-black text-emerald-300 mb-1">
            🗺️ رادار الرياض
          </div>
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-slate-900 border border-slate-700 overflow-hidden">
            {/* Extraction Van at South Gate */}
            <div
              className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 border border-white flex items-center justify-center text-[8px]"
              style={{
                left: `${((RIYAD3D_VAN_ZONE.x + RIYAD3D_ARENA_HALF) / (RIYAD3D_ARENA_HALF * 2)) * 100}%`,
                top: `${((RIYAD3D_VAN_ZONE.z + RIYAD3D_ARENA_HALF) / (RIYAD3D_ARENA_HALF * 2)) * 100}%`,
              }}
              title="سطافيط الهوندا"
            >
              🚐
            </div>

            {/* Available Treasures (Gold Dots) */}
            {treasures
              .filter((t) => t.status === "available")
              .map((t) => (
                <div
                  key={t.id}
                  className="absolute w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 shadow-[0_0_6px_#facc15]"
                  style={{
                    left: `${((t.x + RIYAD3D_ARENA_HALF) / (RIYAD3D_ARENA_HALF * 2)) * 100}%`,
                    top: `${((t.z + RIYAD3D_ARENA_HALF) / (RIYAD3D_ARENA_HALF * 2)) * 100}%`,
                  }}
                />
              ))}

            {/* Hiding Spots (Cyan Dots) */}
            {RIYAD3D_HIDING_SPOTS.map((s) => (
              <div
                key={s.id}
                className="absolute w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400/70"
                style={{
                  left: `${((s.x + RIYAD3D_ARENA_HALF) / (RIYAD3D_ARENA_HALF * 2)) * 100}%`,
                  top: `${((s.z + RIYAD3D_ARENA_HALF) / (RIYAD3D_ARENA_HALF * 2)) * 100}%`,
                }}
              />
            ))}

            {/* Stalking Haunted Ghoul (Red Skull Pulse) */}
            <div
              className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600 animate-ping"
              style={{
                left: `${((nearby.monsterX + RIYAD3D_ARENA_HALF) / (RIYAD3D_ARENA_HALF * 2)) * 100}%`,
                top: `${((nearby.monsterZ + RIYAD3D_ARENA_HALF) / (RIYAD3D_ARENA_HALF * 2)) * 100}%`,
              }}
            />
            <div
              className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 border border-white flex items-center justify-center text-[8px]"
              style={{
                left: `${((nearby.monsterX + RIYAD3D_ARENA_HALF) / (RIYAD3D_ARENA_HALF * 2)) * 100}%`,
                top: `${((nearby.monsterZ + RIYAD3D_ARENA_HALF) / (RIYAD3D_ARENA_HALF * 2)) * 100}%`,
              }}
            >
              👹
            </div>

            {/* My Player Position (Bright Green Dot) */}
            <div
              className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime-400 border-2 border-white shadow-[0_0_8px_#84cc16]"
              style={{
                left: `${((nearby.myX + RIYAD3D_ARENA_HALF) / (RIYAD3D_ARENA_HALF * 2)) * 100}%`,
                top: `${((nearby.myZ + RIYAD3D_ARENA_HALF) / (RIYAD3D_ARENA_HALF * 2)) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* CARRIED TREASURE FRAGILE DURABILITY HUD (R.E.P.O. Style) */}
      {myCarriedLoot && (
        <div className="pointer-events-none absolute top-20 sm:top-16 inset-x-0 z-30 flex justify-center px-4">
          <div className="rounded-2xl border-2 border-amber-400/80 bg-slate-950/90 backdrop-blur-md px-4 py-2.5 shadow-2xl max-w-md w-full">
            <div className="flex items-center justify-between text-xs sm:text-sm font-black">
              <span className="text-amber-300">
                {myCarriedLoot.emoji} {myCarriedLoot.titleAr} (
                {myCarriedLoot.weight === "heavy"
                  ? "ثقيل بزاف"
                  : myCarriedLoot.weight === "medium"
                  ? "متوسط"
                  : "خفيف"}
                )
              </span>
              <span className="text-emerald-300 text-base">
                {myCarriedLoot.currentValueDh} DH
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-300">
                سلامة الكنز: {myCarriedLoot.durability}%
              </span>
              <div className="flex-1 h-2.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    myCarriedLoot.durability > 60
                      ? "bg-emerald-400"
                      : myCarriedLoot.durability > 30
                      ? "bg-amber-400"
                      : "bg-red-500 animate-pulse"
                  }`}
                  style={{ width: `${myCarriedLoot.durability}%` }}
                />
              </div>
            </div>
            <div className="mt-1 text-[10px] text-amber-200/90 font-bold text-center">
              ⚠️ رد بالك من الحيوط وانت كاتجري! غادي بيها لـ 🚐 سطافيط الهوندا فـ الجنوب!
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN OR STUNNED STATUS BANNER */}
      {myPlayer.hiddenSpotId && (
        <div className="pointer-events-none absolute top-24 inset-x-0 z-30 flex justify-center px-4">
          <div className="rounded-2xl border border-sky-400 bg-sky-950/90 px-5 py-2.5 text-center shadow-xl">
            <p className="text-sm font-black text-sky-200">
              🫣 راك مخبّي دابا! الغول ما يقدرش يشوفك هنا.
            </p>
          </div>
        </div>
      )}

      {isStunned && (
        <div className="pointer-events-none absolute top-28 inset-x-0 z-30 flex justify-center px-4">
          <div className="rounded-2xl border border-red-400 bg-red-950/90 px-5 py-2.5 text-center shadow-xl animate-bounce">
            <p className="text-sm font-black text-red-200">
              💫 راك دايخ من الضربة! تسنّا ثانية...
            </p>
          </div>
        </div>
      )}

      {/* BOTTOM-LEFT VIRTUAL THUMB JOYSTICK */}
      <div
        className="absolute bottom-6 left-6 z-30 w-32 h-32 sm:w-36 sm:h-36 rounded-full border-2 border-white/25 bg-slate-950/65 backdrop-blur-md flex items-center justify-center touch-none"
        onPointerDown={(e) => {
          e.stopPropagation();
          joyTouchIdRef.current = e.pointerId;
          const rect = e.currentTarget.getBoundingClientRect();
          joyOriginRef.current = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (joyTouchIdRef.current !== e.pointerId) return;
          const maxR = 46;
          const dx = e.clientX - joyOriginRef.current.x;
          const dy = e.clientY - joyOriginRef.current.y;
          const dist = Math.hypot(dx, dy);
          const clampedDist = Math.min(maxR, dist);
          const angle = Math.atan2(dy, dx);
          const kx = Math.cos(angle) * clampedDist;
          const ky = Math.sin(angle) * clampedDist;
          setJoyKnob({ x: kx, y: ky });
          joystickRef.current = {
            x: Number((kx / maxR).toFixed(2)),
            y: Number((ky / maxR).toFixed(2)),
          };
        }}
        onPointerUp={(e) => {
          if (joyTouchIdRef.current === e.pointerId) {
            joyTouchIdRef.current = null;
            setJoyKnob({ x: 0, y: 0 });
            joystickRef.current = { x: 0, y: 0 };
          }
        }}
        onPointerCancel={(e) => {
          if (joyTouchIdRef.current === e.pointerId) {
            joyTouchIdRef.current = null;
            setJoyKnob({ x: 0, y: 0 });
            joystickRef.current = { x: 0, y: 0 };
          }
        }}
      >
        <div
          className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-emerald-500 shadow-lg border-2 border-white pointer-events-none transition-transform duration-75"
          style={{
            transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
          }}
        />
      </div>

      {/* BOTTOM-RIGHT CONTEXTUAL 3D ACTION DECK */}
      <div className="absolute bottom-6 right-6 z-30 flex flex-col items-end gap-2.5">
        {/* 1. Extract Treasure in Honda Van */}
        {myCarriedLoot && nearby.inVanZone && (
          <button
            type="button"
            onClick={handleExtractLoot}
            disabled={busyAction}
            className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-600 to-teal-500 px-5 py-3.5 text-sm sm:text-base font-black text-white shadow-[0_0_25px_rgba(16,185,129,0.75)] animate-bounce active:scale-95"
          >
            🚐💰 حطّ فـ الهوندا! (+{myCarriedLoot.currentValueDh} DH)
          </button>
        )}

        {/* 2. Pickup Nearest Treasure */}
        {!myCarriedLoot && !myPlayer.hiddenSpotId && nearby.nearestLoot && (
          <button
            type="button"
            onClick={handlePickupNearest}
            disabled={busyAction}
            className="rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-500 to-yellow-500 px-5 py-3.5 text-sm sm:text-base font-black text-slate-950 shadow-[0_0_22px_rgba(245,158,11,0.7)] animate-pulse active:scale-95"
          >
            🤲 هزّ {nearby.nearestLoot.loot.emoji} {nearby.nearestLoot.loot.titleAr} (
            {nearby.nearestLoot.loot.currentValueDh} DH)
          </button>
        )}

        {/* 3. Drop Carried Treasure */}
        {myCarriedLoot && (
          <button
            type="button"
            onClick={handleDropLoot}
            disabled={busyAction}
            className="rounded-2xl border border-slate-500 bg-slate-900/90 px-4 py-2.5 text-xs sm:text-sm font-black text-slate-200 shadow-lg active:scale-95"
          >
            📦 حطّ الكنز فـ الأرض
          </button>
        )}

        {/* 4. Hide Under Table / Exit Hiding */}
        {(myPlayer.hiddenSpotId || nearby.nearestHidingSpot) && (
          <button
            type="button"
            onClick={handleToggleHide}
            disabled={busyAction}
            className="rounded-2xl border-2 border-sky-400 bg-sky-900/90 px-4 py-3 text-xs sm:text-sm font-black text-sky-100 shadow-lg active:scale-95"
          >
            {myPlayer.hiddenSpotId
              ? "🏃 خرج من المخبأ"
              : `🫣 تخبّا فـ ${nearby.nearestHidingSpot?.spot.titleAr}`}
          </button>
        )}

        {/* 5. Shove Friend to Steal Their Treasure! */}
        {nearby.nearestShoveTarget && !myPlayer.hiddenSpotId && (
          <button
            type="button"
            onClick={handleShoveFriend}
            disabled={busyAction || shoveOnCooldown}
            className={`rounded-2xl border-2 px-4 py-3 text-xs sm:text-sm font-black shadow-lg active:scale-95 ${
              shoveOnCooldown
                ? "border-slate-600 bg-slate-800/80 text-slate-400"
                : "border-rose-400 bg-gradient-to-r from-rose-600 to-orange-600 text-white shadow-[0_0_18px_rgba(244,63,94,0.6)]"
            }`}
          >
            {shoveOnCooldown
              ? "⏳ الدّفعة كتّشحن..."
              : nearby.nearestShoveTarget.hasLoot
              ? `🤚💎 دْفَع ${nearby.nearestShoveTarget.name} وطيّح ليه الكنز!`
              : `🤚 دْفَع ${nearby.nearestShoveTarget.name}!`}
          </button>
        )}

        {/* 6. Sprint Button */}
        <button
          type="button"
          onPointerDown={() => {
            sprintRef.current = true;
            setIsSprintingUI(true);
          }}
          onPointerUp={() => {
            sprintRef.current = false;
            setIsSprintingUI(false);
          }}
          onPointerLeave={() => {
            sprintRef.current = false;
            setIsSprintingUI(false);
          }}
          className={`rounded-full border-2 px-5 py-3 text-xs sm:text-sm font-black shadow-xl transition-all ${
            isSprintingUI
              ? "border-amber-300 bg-amber-500 text-slate-950 scale-95"
              : "border-white/30 bg-slate-900/85 text-white"
          }`}
        >
          🏃‍♂️ جري (Sprint)
        </button>
      </div>

      {/* FINISHED ROUND OVERLAY & HEIST LEADERBOARD */}
      {phase === "finished" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-3xl border-2 border-amber-400/60 bg-slate-900/95 p-6 shadow-2xl text-center">
            <div className="text-5xl mb-2">
              {publicView.quotaReached ? "🚐💰👑" : "👹🏺"}
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-amber-300 mb-2">
              {publicView.quotaReached
                ? "نجحت سرقة الرياض المسكون!"
                : "سالات الجولة فـ الرياض المسكون!"}
            </h2>
            <p className="text-sm sm:text-base font-bold text-slate-200 mb-5">
              {String(publicView.winReasonAr ?? "")}
            </p>

            {/* Players Stolen Loot Table */}
            <div className="space-y-2.5 text-right mb-6">
              {[...players]
                .sort((a, b) => b.extractedDh - a.extractedDh)
                .map((p, idx) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                      idx === 0 && p.extractedDh > 0
                        ? "border-amber-400 bg-amber-500/15"
                        : "border-slate-700 bg-slate-800/70"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">
                        {idx === 0 && p.extractedDh > 0 ? "👑" : "🏃"}
                      </span>
                      <div>
                        <div className="font-black text-sm sm:text-base text-white">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-slate-300">
                          هرّب {p.extractedCount} كنوز • هرّس {p.shatteredCount} 💔 • دْفَع{" "}
                          {p.shovesDealt} 🤚
                        </div>
                      </div>
                    </div>
                    <div className="text-base sm:text-lg font-black text-emerald-300">
                      {p.extractedDh} DH
                    </div>
                  </div>
                ))}
            </div>

            <button
              type="button"
              onClick={() => onDispatch({ type: "RESTART_GAME" })}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-emerald-500 py-3.5 text-base font-black text-slate-950 shadow-xl hover:brightness-110 active:scale-95"
            >
              🔄 سرقة جديدة فـ الرياض (جولة {Number(publicView.round ?? 1) + 1})
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
