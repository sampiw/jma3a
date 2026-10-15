"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import confetti from "canvas-confetti";
import { Ghammada3DArena } from "@/components/games/Ghammada3DArena";
import {
  GhammadaPhase,
  GhammadaPlayerEntity,
  GhammadaPropId,
  GhammadaWorldProp,
  GhammadaKillFeedItem,
  GHAMMADA_PROPS,
  ALL_PROP_IDS,
} from "@/games/ghammada/types";
import { sound } from "@/lib/sound";
import {
  Hammer,
  Lock,
  Unlock,
  Volume2,
  Wind,
  Trophy,
  RotateCcw,
  ChevronLeft,
  Radio,
  EyeOff,
  Sparkles,
  Heart,
} from "lucide-react";

interface GhammadaGameViewProps {
  publicData: {
    phase: GhammadaPhase;
    round: number;
    maxRounds: number;
    phaseStartedAt: number;
    phaseEndsAt: number;
    hunterIds: string[];
    entities: Record<string, GhammadaPlayerEntity>;
    worldProps: GhammadaWorldProp[];
    scores: Record<string, number>;
    feed: GhammadaKillFeedItem[];
    roundWinner?: "HUNTERS" | "HIDERS";
    roundHeadline?: string;
    roundSummary?: string;
    winnerId?: string;
  };
  privateData?: {
    myEntity: GhammadaPlayerEntity | null;
    myScore: number;
  };
  isHost: boolean;
  onAction: (action: any, targetPlayerId?: string) => void;
  players: Array<{ id: string; nickname: string; isHost?: boolean }>;
  activePlayerId?: string;
}

export function GhammadaGameView({
  publicData,
  isHost,
  onAction,
  players,
  activePlayerId,
}: GhammadaGameViewProps) {
  const {
    phase,
    round,
    maxRounds = 4,
    phaseEndsAt,
    entities = {},
    worldProps = [],
    scores = {},
    feed = [],
    roundWinner,
    roundHeadline,
    roundSummary,
    winnerId,
  } = publicData;

  const myId = activePlayerId || players[0]?.id || "";
  const myEntity = entities[myId];
  const isHunter = myEntity?.role === "HUNTER";
  const isCaught = Boolean(myEntity?.isCaught);

  // Local 60 FPS authoritative ref for smooth 3D movement
  const localPosRef = useRef<{
    x: number;
    z: number;
    rotY: number;
    propId: GhammadaPropId;
    isLocked: boolean;
    camYaw: number;
  }>({
    x: myEntity?.x ?? 0,
    z: myEntity?.z ?? 5,
    rotY: myEntity?.rotY ?? 0,
    propId: myEntity?.propId ?? "tajine",
    isLocked: myEntity?.isLocked ?? false,
    camYaw: 0,
  });

  // Virtual thumb joystick vector (-1..1)
  const joystickVecRef = useRef<{ dx: number; dz: number }>({ dx: 0, dz: 0 });
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const isDraggingJoyRef = useRef(false);

  const [selectedProp, setSelectedProp] = useState<GhammadaPropId>(
    myEntity?.propId || "tajine"
  );
  const [isLockedUI, setIsLockedUI] = useState<boolean>(Boolean(myEntity?.isLocked));
  const [secondsLeft, setSecondsLeft] = useState<number>(18);
  const [sonarDistance, setSonarDistance] = useState<number | null>(null);
  const lastTimeUpSentRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });

  // Sync initial spawn coordinates when round resets
  useEffect(() => {
    if (myEntity) {
      localPosRef.current.x = myEntity.x;
      localPosRef.current.z = myEntity.z;
      localPosRef.current.rotY = myEntity.rotY;
      localPosRef.current.propId = myEntity.propId;
      localPosRef.current.isLocked = myEntity.role === "HUNTER" ? false : myEntity.isLocked;
      setSelectedProp(myEntity.propId);
      setIsLockedUI(myEntity.role === "HUNTER" ? false : myEntity.isLocked);
    }
  }, [round, myId]);

  // Ensure Hunter is unlocked and play alert sound when HUNT_PHASE starts
  useEffect(() => {
    if (phase === "HUNT_PHASE") {
      sound.playDawnChime();
      if (isHunter) {
        localPosRef.current.isLocked = false;
        setIsLockedUI(false);
      }
    }
  }, [phase, isHunter]);

  // Countdown timer & debounced phase transition trigger
  useEffect(() => {
    if (phase !== "HIDE_PHASE" && phase !== "HUNT_PHASE") return;

    const updateClock = () => {
      const now = Date.now();
      const rem = Math.max(0, Math.ceil((phaseEndsAt - now) / 1000));
      setSecondsLeft(rem);

      if (rem <= 0) {
        const phaseKey = `${round}_${phase}`;
        const prev = lastTimeUpSentRef.current;
        if (prev.key !== phaseKey || now - prev.at > 2500) {
          lastTimeUpSentRef.current = { key: phaseKey, at: now };
          onAction({ type: "TIME_UP", forPhase: phase });
        }
      }
    };

    updateClock();
    const interval = setInterval(updateClock, 350);

    return () => clearInterval(interval);
  }, [phase, round, phaseEndsAt, onAction]);

  // Celebratory confetti on ROUND_END or GAME_OVER
  useEffect(() => {
    if (phase === "ROUND_END" || phase === "GAME_OVER") {
      sound.playSuccess();
      try {
        confetti({ particleCount: 75, spread: 70, origin: { y: 0.6 } });
      } catch {}
    }
  }, [phase, round]);

  // Players lookup map
  const playersMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of players) map[p.id] = p.nickname;
    return map;
  }, [players]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  }, [players, scores]);

  const uncaughtHidersCount = useMemo(() => {
    return Object.values(entities).filter((e) => e.role === "HIDER" && !e.isCaught).length;
  }, [entities]);

  // Throttled position callback from 3D loop
  const handlePositionTick = useCallback(
    (x: number, z: number, rotY: number) => {
      onAction({
        type: "SYNC_POS",
        x,
        z,
        rotY,
        propId: localPosRef.current.propId,
        isLocked: localPosRef.current.isLocked,
      });
    },
    [onAction]
  );

  // Virtual Joystick Touch Handlers
  const updateJoystick = (clientX: number, clientY: number) => {
    if (!joyBaseRef.current) return;
    const rect = joyBaseRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width / 2 - 14;

    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }

    setJoyKnob({ x: dx, y: dy });
    joystickVecRef.current = {
      dx: dx / maxR,
      dz: dy / maxR,
    };
  };

  const handleJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingJoyRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    // Unlock automatically if user starts dragging joystick
    if (localPosRef.current.isLocked) {
      localPosRef.current.isLocked = false;
      setIsLockedUI(false);
    }
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingJoyRef.current) return;
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoyUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingJoyRef.current = false;
    setJoyKnob({ x: 0, y: 0 });
    joystickVecRef.current = { dx: 0, dz: 0 };
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    // Send final resting coordinate
    onAction({
      type: "SYNC_POS",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
      rotY: localPosRef.current.rotY,
      propId: localPosRef.current.propId,
      isLocked: localPosRef.current.isLocked,
    });
  };

  // Hider Action: Morph Prop
  const handleSelectProp = (propId: GhammadaPropId) => {
    sound.playCardFlip();
    localPosRef.current.propId = propId;
    setSelectedProp(propId);
    onAction({ type: "MORPH_PROP", propId });
  };

  // Hider Action: Lock / Freeze Prop in Place
  const handleToggleLock = () => {
    sound.playCardFlip();
    const nextLock = !localPosRef.current.isLocked;
    localPosRef.current.isLocked = nextLock;
    setIsLockedUI(nextLock);
    onAction({
      type: "TOGGLE_LOCK",
      isLocked: nextLock,
      x: localPosRef.current.x,
      z: localPosRef.current.z,
      rotY: localPosRef.current.rotY,
    });
  };

  // Hider Action: Smoke Dash forward
  const handleSmokeDash = () => {
    sound.playCardFlip();
    const angle = localPosRef.current.rotY;
    const dashDist = 4.2;
    const nx = Math.max(-15.5, Math.min(15.5, localPosRef.current.x + Math.sin(angle) * dashDist));
    const nz = Math.max(-15.5, Math.min(15.5, localPosRef.current.z + Math.cos(angle) * dashDist));
    localPosRef.current.x = nx;
    localPosRef.current.z = nz;
    localPosRef.current.isLocked = false;
    setIsLockedUI(false);

    onAction({
      type: "SMOKE_DASH",
      x: nx,
      z: nz,
      rotY: angle,
    });
  };

  // Hider Action: Whistle Taunt (+30 pts!)
  const handleWhistleTaunt = () => {
    sound.playSuccess();
    onAction({
      type: "TAUNT_WHISTLE",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    });
  };

  // Hunter Action: Hammer Strike!
  const handleHunterStrike = () => {
    sound.playBuzzer();
    onAction({
      type: "HUNTER_STRIKE",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
      rotY: localPosRef.current.rotY,
    });
  };

  // Hunter Action: Sonar Pulse (calculates distance to closest uncaught Hider)
  const handleHunterSonar = () => {
    sound.playTick();
    let minD = Infinity;
    for (const ent of Object.values(entities)) {
      if (ent.role === "HIDER" && !ent.isCaught) {
        const d = Math.hypot(ent.x - localPosRef.current.x, ent.z - localPosRef.current.z);
        if (d < minD) minD = d;
      }
    }
    if (minD < Infinity) {
      setSonarDistance(Math.round(minD));
    } else {
      setSonarDistance(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto w-full space-y-3 pb-6 text-right animate-fadeIn">
      {/* Top 3D Game Telemetry HUD */}
      <div className="rounded-3xl bg-slate-900/95 border border-amber-500/40 p-3 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Timer & Round Pill */}
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-black border flex items-center gap-1.5 ${
                phase === "HIDE_PHASE"
                  ? "bg-amber-500/20 border-amber-400 text-amber-300"
                  : "bg-rose-500/20 border-rose-400 text-rose-300"
              }`}
            >
              <span>⏱️ {secondsLeft}s</span>
              <span>•</span>
              <span>
                {phase === "HIDE_PHASE" ? "وقت التخبّية 🙈" : "وقت الصيد 🔨"}
              </span>
            </span>

            <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold">
              الجولة {round}/{maxRounds}
            </span>
          </div>

          {/* Role & Hearts / Remaining Hiders */}
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-black">
              📦 متخبيين باقيين: {uncaughtHidersCount}
            </span>

            {isHunter ? (
              <span className="px-3 py-1 rounded-full bg-rose-950/90 border border-rose-500/50 text-rose-300 text-xs font-black flex items-center gap-1">
                <span>🔨 أنت الصياد</span>
                <span className="text-rose-400 ml-1">
                  {"❤️".repeat(Math.max(0, myEntity?.hearts ?? 5))}
                </span>
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-cyan-950/90 border border-cyan-500/50 text-cyan-300 text-xs font-black">
                {GHAMMADA_PROPS[selectedProp]?.emoji} متنكر فـ: {GHAMMADA_PROPS[selectedProp]?.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* ACTIVE 3D GAMEPLAY VIEWPORT (HIDE_PHASE & HUNT_PHASE)                 */}
      {/* ===================================================================== */}
      {(phase === "HIDE_PHASE" || phase === "HUNT_PHASE") && (
        <div className="space-y-3">
          <div className="relative">
            {/* WebGL 3D Scene */}
            <Ghammada3DArena
              phase={phase}
              myPlayerId={myId}
              entities={entities}
              worldProps={worldProps}
              playersMap={playersMap}
              localPosRef={localPosRef}
              joystickVecRef={joystickVecRef}
              onPositionTick={handlePositionTick}
            />

            {/* Floating Live Kill / Taunt Feed Overlay (Top-Right of 3D Screen) */}
            <div className="absolute top-3 right-3 max-w-[250px] space-y-1 pointer-events-none z-10">
              {feed.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className="px-2.5 py-1.5 rounded-xl bg-black/75 backdrop-blur-md border border-white/10 text-[11px] font-bold text-white shadow-md"
                >
                  {item.text}
                </div>
              ))}
            </div>

            {/* Camera Orbit Hint (Top-Left of 3D Screen) */}
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-xl bg-black/65 backdrop-blur-sm border border-white/10 text-[10px] font-bold text-amber-300 pointer-events-none z-10">
              👆 دوز صبعك على الشاشة باش تدوّر الكاميرا 360°
            </div>

            {/* Hunter Blindfold Banner during HIDE_PHASE */}
            {isHunter && phase === "HIDE_PHASE" && (
              <div className="absolute inset-x-4 bottom-4 p-4 rounded-2xl bg-rose-950/90 backdrop-blur-md border-2 border-rose-500/60 text-center shadow-2xl z-20 space-y-2">
                <div className="flex items-center justify-center gap-2 text-rose-300 font-black text-base">
                  <EyeOff className="w-5 h-5 animate-bounce" />
                  <span>قفص الصياد مسدود لـ {secondsLeft} ثانية!</span>
                </div>
                <p className="text-xs text-rose-200/90">
                  صحابك كيتحولو لطواجن، برادا، وصنادق وكيتخباو فـ الرياض... وجّد المطرقة ديالك! 🔨
                </p>
                {(secondsLeft <= 2 || isHost) && (
                  <button
                    type="button"
                    onClick={() => {
                      sound.playCardFlip();
                      onAction({ type: "START_HUNT" });
                    }}
                    className="mt-1 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg active:scale-95 transition-all"
                  >
                    {secondsLeft <= 0 ? "افتح القفص وبدا الصيد دابا! 🔨" : "كلشي تخبّى؟ افتح القفص دابا 🔓"}
                  </button>
                )}
              </div>
            )}

            {/* Caught Spectator Banner for Hiders */}
            {!isHunter && isCaught && (
              <div className="absolute inset-x-4 bottom-4 p-3.5 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-rose-500/50 text-center z-20">
                <span className="text-sm font-black text-rose-400 block">
                  💥 حصلتي! شدّك الصياد فهاد الجولة
                </span>
                <span className="text-xs text-slate-300">
                  تفرّج مباشرة فصحابك اللي باقيين متخبيين فـ الرياض!
                </span>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* MOBILE GAMEPAD DECK: THUMB JOYSTICK + ACTION BUTTONS              */}
          {/* ================================================================= */}
          <div className="rounded-3xl bg-slate-900/95 border border-slate-800 p-4 shadow-2xl">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4" dir="ltr">
              {/* LEFT: 360° Virtual Thumb Joystick */}
              <div className="flex items-center gap-3">
                <div
                  ref={joyBaseRef}
                  onPointerDown={handleJoyDown}
                  onPointerMove={handleJoyMove}
                  onPointerUp={handleJoyUp}
                  className="w-28 h-28 rounded-full bg-slate-950 border-2 border-cyan-500/40 relative flex items-center justify-center shadow-inner touch-none cursor-pointer"
                >
                  {/* Crosshair guides */}
                  <div className="w-full h-[1px] bg-slate-800 absolute pointer-events-none" />
                  <div className="h-full w-[1px] bg-slate-800 absolute pointer-events-none" />
                  {/* Draggable Thumb Stick */}
                  <div
                    style={{
                      transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
                    }}
                    className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 border-2 border-white shadow-lg shadow-cyan-500/30 pointer-events-none"
                  />
                </div>
                <div className="text-left" dir="rtl">
                  <span className="text-xs font-black text-white block">🕹️ جويستيك التحرك</span>
                  <span className="text-[11px] text-slate-400 block">
                    جرّ بصبعك باش تجري فـ الرياض 3D
                  </span>
                  {isLockedUI && !isHunter && (
                    <span className="text-[11px] text-emerald-400 font-bold block mt-0.5">
                      🔒 أنت مثبت فبلاصتك دابا
                    </span>
                  )}
                </div>
              </div>

              {/* RIGHT: Role-Specific Action Buttons */}
              <div className="flex-1 w-full" dir="rtl">
                {isHunter ? (
                  /* HUNTER CONTROLS */
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        disabled={phase !== "HUNT_PHASE" || (myEntity?.hearts ?? 5) <= 0}
                        onClick={handleHunterStrike}
                        className="py-4 px-4 rounded-2xl bg-gradient-to-r from-rose-600 to-orange-600 hover:brightness-110 disabled:opacity-40 text-white font-black text-sm shadow-xl shadow-rose-600/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <Hammer className="w-5 h-5" />
                        <span>ضرب بالمطرقة! 🔨</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleHunterSonar}
                        className="py-4 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-cyan-500/40 text-cyan-300 font-black text-xs active:scale-95 transition-all flex flex-col items-center justify-center"
                      >
                        <div className="flex items-center gap-1">
                          <Radio className="w-4 h-4 text-cyan-400" />
                          <span>رادار القرب 📡</span>
                        </div>
                        {sonarDistance !== null && (
                          <span className="text-[11px] text-amber-300 mt-0.5">
                            أقرب متخبي: {sonarDistance} متر!
                          </span>
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 text-center">
                      ⚠️ عندك <strong>{myEntity?.hearts ?? 5} قلوب ❤️</strong> — قرّب لأي طاجين أو صندوق مشبوه وضربو بالمطرقة!
                    </p>
                  </div>
                ) : (
                  /* HIDER CONTROLS */
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={isCaught}
                        onClick={handleToggleLock}
                        className={`py-3 px-2 rounded-2xl font-black text-xs border transition-all flex flex-col items-center justify-center gap-1 active:scale-95 ${
                          isLockedUI
                            ? "bg-emerald-600 border-emerald-300 text-white shadow-lg shadow-emerald-600/30"
                            : "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                        }`}
                      >
                        {isLockedUI ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        <span>{isLockedUI ? "مثبت 🔒" : "ثبّت فبلاصتك"}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isCaught || phase !== "HUNT_PHASE"}
                        onClick={handleWhistleTaunt}
                        className="py-3 px-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-110 disabled:opacity-40 text-slate-950 font-black text-xs shadow-lg active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
                      >
                        <Volume2 className="w-4 h-4" />
                        <span>صفّر (+30 ن) 😗</span>
                      </button>

                      <button
                        type="button"
                        disabled={isCaught}
                        onClick={handleSmokeDash}
                        className="py-3 px-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-black text-xs border border-indigo-400/40 shadow-lg active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
                      >
                        <Wind className="w-4 h-4" />
                        <span>داش هروب 💨</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* HIDER 8-PROP DISGUISE SELECTOR STRIP */}
            {!isHunter && !isCaught && (
              <div className="mt-3 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-amber-400 font-bold">
                    كليكي على أي غرض باش تتحول ليه فـ الحين:
                  </span>
                  <span className="text-xs font-black text-white">
                    🎭 اختار التنكر 3D ديالك:
                  </span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                  {ALL_PROP_IDS.map((pid) => {
                    const meta = GHAMMADA_PROPS[pid];
                    const active = selectedProp === pid;
                    return (
                      <button
                        key={pid}
                        type="button"
                        onClick={() => handleSelectProp(pid)}
                        className={`p-2 rounded-2xl border text-center transition-all active:scale-95 ${
                          active
                            ? "bg-amber-500/20 border-amber-400 text-amber-200 shadow-md"
                            : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-600"
                        }`}
                      >
                        <span className="text-lg block">{meta.emoji}</span>
                        <span className="text-[10px] font-bold block truncate">
                          {meta.name.split(" ")[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHASE 3: ROUND_END                                                    */}
      {/* ===================================================================== */}
      {phase === "ROUND_END" && (
        <div className="rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-400/50 p-6 text-center shadow-2xl space-y-4">
          <div className="text-4xl">
            {roundWinner === "HUNTERS" ? "🔨🎯" : "📦🏆"}
          </div>
          <h2 className="text-2xl font-black text-white">
            {roundHeadline || "سالات الجولة!"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto">
            {roundSummary}
          </p>

          {/* Current Standings */}
          <div className="space-y-2 max-w-md mx-auto text-right pt-2">
            {sortedPlayers.map((p, idx) => {
              const ent = entities[p.id];
              return (
                <div
                  key={p.id}
                  className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between"
                >
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 font-black text-xs">
                    {scores[p.id] || 0} نقطة
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">
                      {ent?.role === "HUNTER"
                        ? "🔨 صياد"
                        : ent?.isCaught
                        ? "💥 تشدّ"
                        : `📦 نجا (${GHAMMADA_PROPS[ent?.propId || "tajine"]?.emoji})`}
                    </span>
                    <span className="text-sm font-black text-white">{p.nickname}</span>
                    <span className="text-xs font-black text-amber-400">#{idx + 1}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playCardFlip();
              onAction({ type: "NEXT_ROUND" });
            }}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:brightness-110 text-slate-950 font-black text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span>
              {round >= maxRounds ? "شوف الفائز النهائي 🏆" : `الجولة ${round + 1} (تبديل الصياد) 🔄`}
            </span>
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHASE 4: GAME_OVER                                                    */}
      {/* ===================================================================== */}
      {phase === "GAME_OVER" && (
        <div className="rounded-3xl bg-gradient-to-b from-amber-950/60 via-slate-900 to-slate-950 border-2 border-amber-400 p-6 text-center shadow-2xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center mx-auto">
            <Trophy className="w-9 h-9 text-amber-400" />
          </div>

          <h2 className="text-3xl font-black text-white">
            👑 {playersMap[winnerId || sortedPlayers[0]?.id || ""] || "البطل"} ملك الغمّيضة 3D!
          </h2>

          <div className="space-y-2 max-w-md mx-auto text-right">
            {sortedPlayers.map((p, idx) => (
              <div
                key={p.id}
                className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                  idx === 0
                    ? "bg-amber-500/20 border-amber-400 text-white"
                    : "bg-slate-900 border-slate-800 text-slate-200"
                }`}
              >
                <span className="px-3 py-1 rounded-xl bg-black/40 font-black text-emerald-400 text-sm">
                  {scores[p.id] || 0} نقطة
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black">{p.nickname}</span>
                  <span className="text-base">
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playCardFlip();
              onAction({ type: "RESTART_GAME" });
            }}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-5 h-5" />
            <span>نعاودو طرح جديد 3D! 🔄</span>
          </button>
        </div>
      )}
    </div>
  );
}
