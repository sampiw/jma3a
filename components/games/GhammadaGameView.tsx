"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import confetti from "canvas-confetti";
import { Ghammada3DArena, LocalPlayerTransform } from "@/components/games/Ghammada3DArena";
import {
  GhammadaPhase,
  GhammadaPlayerEntity,
  GhammadaPropId,
  GhammadaWorldProp,
  GhammadaKillFeedItem,
  GHAMMADA_PROPS,
  ALL_PROP_IDS,
} from "@/games/ghammada/types";
import { resolveCollisions, STATIC_COLLIDERS } from "@/games/ghammada/layout";
import {
  LIVE_STALE_MS,
  LiveFx,
  useGhammadaLive,
} from "@/components/games/ghammada/useGhammadaLive";
import {
  enterGameFullscreen,
  exitGameFullscreen,
  isFullscreenActive,
  isIOS,
  isStandaloneApp,
  vibrate,
} from "@/lib/fullscreen";
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
  Maximize2,
  Minimize2,
  Smartphone,
  X,
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
  roomCode?: string;
  onRefresh?: () => void;
}

export function GhammadaGameView({
  publicData,
  isHost,
  onAction,
  players,
  activePlayerId,
  roomCode: propRoomCode,
  onRefresh,
}: GhammadaGameViewProps) {
  const params = useParams<{ code?: string }>();
  const resolvedRoomCode = (propRoomCode || params?.code || "").toString().toUpperCase();

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

  // Local 60 FPS transform ref for smooth 3D movement & camera angles
  const localPosRef = useRef<LocalPlayerTransform>({
    x: myEntity?.x ?? 0,
    z: myEntity?.z ?? 5,
    rotY: myEntity?.rotY ?? 0,
    propId: myEntity?.propId ?? "tajine",
    isLocked: myEntity?.isLocked ?? false,
    camYaw: 0,
    camPitch: 0.52,
    isMoving: false,
  });

  // Queue of instant 3D particle/animation FX for Ghammada3DArena
  const fxQueueRef = useRef<LiveFx[]>([]);

  // Live broadcast channel (Supabase Realtime when env vars are set, automatic fallback otherwise)
  const { isLive, peersRef, sendPos, sendFx, sendRefresh } = useGhammadaLive(
    resolvedRoomCode,
    myId,
    {
      onFx: (fx) => {
        fxQueueRef.current.push(fx);
      },
      onRefresh: () => {
        onRefresh?.();
      },
    }
  );

  // Virtual thumb joystick vector (-1..1) with dedicated pointerId tracking
  const joystickVecRef = useRef<{ dx: number; dz: number }>({ dx: 0, dz: 0 });
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const joyPointerIdRef = useRef<number | null>(null);

  const [selectedProp, setSelectedProp] = useState<GhammadaPropId>(
    myEntity?.propId || "tajine"
  );
  const [isLockedUI, setIsLockedUI] = useState<boolean>(Boolean(myEntity?.isLocked));
  const [propDrawerOpen, setPropDrawerOpen] = useState<boolean>(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(18);
  const [sonarDistance, setSonarDistance] = useState<number | null>(null);

  // Full-bleed viewport state (rendered via createPortal to document.body so parent transforms never clip it!)
  const [mounted, setMounted] = useState<boolean>(false);
  const [isImmersive, setIsImmersive] = useState<boolean>(true);
  const [browserFs, setBrowserFs] = useState<boolean>(false);
  const [iosHelpOpen, setIosHelpOpen] = useState<boolean>(false);

  const lastTimeUpSentRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const lastServerSyncAtRef = useRef<number>(0);

  useEffect(() => {
    setMounted(true);
    const syncFs = () => setBrowserFs(isFullscreenActive());
    document.addEventListener("fullscreenchange", syncFs);
    document.addEventListener("webkitfullscreenchange", syncFs);
    return () => {
      document.removeEventListener("fullscreenchange", syncFs);
      document.removeEventListener("webkitfullscreenchange", syncFs);
    };
  }, []);

  // Sync initial spawn coordinates when round resets
  useEffect(() => {
    if (myEntity) {
      localPosRef.current.x = myEntity.x;
      localPosRef.current.z = myEntity.z;
      localPosRef.current.rotY = myEntity.rotY;
      localPosRef.current.propId = myEntity.propId;
      localPosRef.current.isLocked = myEntity.role === "HUNTER" ? false : myEntity.isLocked;
      // Aim camera towards the center of the courtyard on spawn
      localPosRef.current.camYaw = Math.atan2(-myEntity.x, -myEntity.z);
      localPosRef.current.camPitch = 0.52;
      setSelectedProp(myEntity.propId);
      setIsLockedUI(myEntity.role === "HUNTER" ? false : myEntity.isLocked);
      setSonarDistance(null);
    }
  }, [round, myId]);

  // Ensure Hunter is unlocked and play alert sound when HUNT_PHASE starts
  useEffect(() => {
    if (phase === "HUNT_PHASE") {
      sound.playDawnChime();
      vibrate([40, 60, 40]);
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
          sendRefresh();
        }
      }
    };

    updateClock();
    const interval = setInterval(updateClock, 350);

    return () => clearInterval(interval);
  }, [phase, round, phaseEndsAt, onAction, sendRefresh]);

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

  // Position tick from 60fps loop: sends ~12Hz to Supabase live channel + throttled 320ms to server
  const handlePositionTick = useCallback(
    (x: number, z: number, rotY: number, isMoving: boolean) => {
      sendPos({
        x,
        z,
        r: rotY,
        p: localPosRef.current.propId,
        l: localPosRef.current.isLocked,
        m: isMoving,
      });

      const now = performance.now();
      const serverInterval = isLive ? 450 : 260;
      if (isMoving && now - lastServerSyncAtRef.current > serverInterval) {
        lastServerSyncAtRef.current = now;
        onAction({
          type: "SYNC_POS",
          x,
          z,
          rotY,
          propId: localPosRef.current.propId,
          isLocked: localPosRef.current.isLocked,
        });
      }
    },
    [onAction, sendPos, isLive]
  );

  // Dedicated Multi-Touch Virtual Joystick Handlers
  const updateJoystick = (clientX: number, clientY: number) => {
    if (!joyBaseRef.current) return;
    const rect = joyBaseRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = Math.max(20, rect.width / 2 - 14);

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
    e.stopPropagation();
    if (joyPointerIdRef.current !== null) return;
    joyPointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    if (localPosRef.current.isLocked) {
      localPosRef.current.isLocked = false;
      setIsLockedUI(false);
    }
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.pointerId !== joyPointerIdRef.current) return;
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoyUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.pointerId !== joyPointerIdRef.current) return;
    joyPointerIdRef.current = null;
    setJoyKnob({ x: 0, y: 0 });
    joystickVecRef.current = { dx: 0, dz: 0 };
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    sendPos({
      x: localPosRef.current.x,
      z: localPosRef.current.z,
      r: localPosRef.current.rotY,
      p: localPosRef.current.propId,
      l: localPosRef.current.isLocked,
      m: false,
    });
    onAction({
      type: "SYNC_POS",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
      rotY: localPosRef.current.rotY,
      propId: localPosRef.current.propId,
      isLocked: localPosRef.current.isLocked,
    });
  };

  // Fullscreen + Landscape toggle handler
  const handleToggleFullscreen = async () => {
    sound.playCardFlip();
    if (isIOS() && !isStandaloneApp()) {
      setIsImmersive(true);
      setIosHelpOpen(true);
      return;
    }
    if (browserFs) {
      await exitGameFullscreen();
      setBrowserFs(false);
    } else {
      setIsImmersive(true);
      const ok = await enterGameFullscreen();
      setBrowserFs(ok);
    }
  };

  // Hider Action: Morph Prop
  const handleSelectProp = (propId: GhammadaPropId) => {
    sound.playCardFlip();
    vibrate(20);
    localPosRef.current.propId = propId;
    setSelectedProp(propId);
    setPropDrawerOpen(false);
    const fx: Omit<LiveFx, "i"> = {
      k: "morph",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
      p: propId,
    };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendFx(fx);
    onAction({ type: "MORPH_PROP", propId });
    sendRefresh();
  };

  // Hider Action: Lock / Freeze Prop in Place
  const handleToggleLock = () => {
    sound.playCardFlip();
    vibrate(25);
    const nextLock = !localPosRef.current.isLocked;
    localPosRef.current.isLocked = nextLock;
    setIsLockedUI(nextLock);
    sendPos({
      x: localPosRef.current.x,
      z: localPosRef.current.z,
      r: localPosRef.current.rotY,
      p: localPosRef.current.propId,
      l: nextLock,
      m: false,
    });
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
    vibrate([25, 40]);
    const oldX = localPosRef.current.x;
    const oldZ = localPosRef.current.z;
    const angle = localPosRef.current.rotY;
    const dashDist = 4.2;
    const rawX = oldX + Math.sin(angle) * dashDist;
    const rawZ = oldZ + Math.cos(angle) * dashDist;
    const resolved = resolveCollisions(rawX, rawZ, 0.45, STATIC_COLLIDERS);

    localPosRef.current.x = resolved.x;
    localPosRef.current.z = resolved.z;
    localPosRef.current.isLocked = false;
    setIsLockedUI(false);

    const fx: Omit<LiveFx, "i"> = { k: "dash", x: oldX, z: oldZ };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendFx(fx);
    sendPos({
      x: resolved.x,
      z: resolved.z,
      r: angle,
      p: localPosRef.current.propId,
      l: false,
      m: true,
    });

    onAction({
      type: "SMOKE_DASH",
      x: resolved.x,
      z: resolved.z,
      rotY: angle,
    });
  };

  // Hider Action: Whistle Taunt (+30 pts!)
  const handleWhistleTaunt = () => {
    sound.playSuccess();
    vibrate(30);
    const fx: Omit<LiveFx, "i"> = {
      k: "whistle",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendFx(fx);
    onAction({
      type: "TAUNT_WHISTLE",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    });
    sendRefresh();
  };

  // Hunter Action: Directional Hammer Strike!
  const handleHunterStrike = () => {
    sound.playBuzzer();
    vibrate(45);
    const x = localPosRef.current.x;
    const z = localPosRef.current.z;
    const rotY = localPosRef.current.rotY;

    const fx: Omit<LiveFx, "i"> = { k: "strike", x, z, r: rotY };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendFx(fx);

    const nowPerf = performance.now();
    const targets: Array<{ id: string; x: number; z: number }> = [];
    for (const ent of Object.values(entities)) {
      if (ent.role !== "HIDER" || ent.isCaught) continue;
      const peer = peersRef.current.get(ent.playerId);
      if (peer && nowPerf - peer.t < LIVE_STALE_MS) {
        targets.push({ id: ent.playerId, x: peer.x, z: peer.z });
      } else {
        targets.push({ id: ent.playerId, x: ent.x, z: ent.z });
      }
    }

    onAction({
      type: "HUNTER_STRIKE",
      x,
      z,
      rotY,
      targets,
    });
    sendRefresh();
  };

  // Hunter Action: Sonar Pulse (calculates distance to closest uncaught Hider)
  const handleHunterSonar = () => {
    sound.playTick();
    vibrate(20);
    const nowPerf = performance.now();
    let minD = Infinity;
    for (const ent of Object.values(entities)) {
      if (ent.role === "HIDER" && !ent.isCaught) {
        const peer = peersRef.current.get(ent.playerId);
        const hx = peer && nowPerf - peer.t < LIVE_STALE_MS ? peer.x : ent.x;
        const hz = peer && nowPerf - peer.t < LIVE_STALE_MS ? peer.z : ent.z;
        const d = Math.hypot(hx - localPosRef.current.x, hz - localPosRef.current.z);
        if (d < minD) minD = d;
      }
    }
    setSonarDistance(minD < Infinity ? Math.max(1, Math.round(minD)) : null);
  };

  const isActivePhase = phase === "HIDE_PHASE" || phase === "HUNT_PHASE";

  const activeGameUI = isActivePhase ? (
    <div
      className={
        isImmersive
          ? "fixed inset-0 z-[100] w-screen h-[100dvh] bg-slate-950 overflow-hidden select-none"
          : "relative w-full rounded-3xl overflow-hidden border-2 border-amber-500/40 shadow-2xl bg-slate-950 select-none h-[520px] sm:h-[600px]"
      }
    >
      {/* Full-screen 3D Canvas */}
      <Ghammada3DArena
        phase={phase}
        myPlayerId={myId}
        entities={entities}
        worldProps={worldProps}
        playersMap={playersMap}
        localPosRef={localPosRef}
        joystickVecRef={joystickVecRef}
        peersRef={peersRef}
        fxQueueRef={fxQueueRef}
        fullScreen={true}
        onPositionTick={handlePositionTick}
      />

      {/* TOP SINGLE-ROW GLASSMORPHIC HUD BAR (Never wraps onto 2 lines!) */}
      <div
        className="absolute top-0 inset-x-0 px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] z-20 flex items-center justify-between gap-1.5 pointer-events-none"
        dir="ltr"
      >
        {/* Top-Left: Fullscreen + Minimize + Live Status */}
        <div className="flex items-center gap-1 pointer-events-auto shrink-0">
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="px-2 py-1.5 rounded-xl bg-slate-900/85 hover:bg-slate-800 backdrop-blur-md border border-amber-400/40 text-amber-300 text-[11px] font-black flex items-center gap-1 shadow-lg active:scale-95"
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xs:inline sm:inline">
              {browserFs ? "خروج" : "شاشة كاملة"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsImmersive((v) => !v)}
            title={isImmersive ? "إظهار قائمة الغرفة" : "تكبير اللعبة"}
            className="p-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 backdrop-blur-md border border-white/15 text-slate-200 shadow-lg active:scale-95"
          >
            {isImmersive ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          <span
            className={`px-2 py-1 rounded-xl text-[10px] font-black border backdrop-blur-md flex items-center gap-1 ${
              isLive
                ? "bg-emerald-950/85 border-emerald-500/40 text-emerald-300"
                : "bg-slate-900/80 border-slate-700 text-slate-300"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isLive ? "bg-emerald-400 animate-ping" : "bg-amber-400"
              }`}
            />
            <span>{isLive ? "LIVE" : `R${round}/${maxRounds}`}</span>
          </span>
        </div>

        {/* Top-Center: Phase Timer + Uncaught Hiders */}
        <div className="flex items-center gap-1 shrink-0">
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-black border backdrop-blur-md shadow-lg flex items-center gap-1 ${
              phase === "HIDE_PHASE"
                ? "bg-amber-500/25 border-amber-400 text-amber-200"
                : "bg-rose-600/35 border-rose-400 text-rose-100"
            }`}
          >
            <span>⏱️ {secondsLeft}s</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">
              {phase === "HIDE_PHASE" ? "تخبّاو 🙈" : "الصيد 🔨"}
            </span>
          </span>

          <span className="px-2 py-1 rounded-full bg-slate-900/85 backdrop-blur-md border border-emerald-500/40 text-emerald-300 text-[11px] font-black shadow-lg">
            📦 {uncaughtHidersCount}
          </span>
        </div>

        {/* Top-Right: Role & Hearts / Active Prop */}
        <div className="flex items-center gap-1 shrink-0" dir="rtl">
          {isHunter ? (
            <span className="px-2.5 py-1 rounded-full bg-rose-950/90 backdrop-blur-md border border-rose-500/50 text-rose-200 text-[11px] font-black shadow-lg flex items-center gap-1">
              <span>🔨</span>
              <span className="tracking-tighter">
                {"❤️".repeat(Math.max(0, myEntity?.hearts ?? 5))}
              </span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-cyan-950/90 backdrop-blur-md border border-cyan-400/50 text-cyan-200 text-[11px] font-black shadow-lg flex items-center gap-1">
              <span>{GHAMMADA_PROPS[selectedProp]?.emoji}</span>
              <span className="max-w-[72px] sm:max-w-none truncate">
                {GHAMMADA_PROPS[selectedProp]?.name}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* LIVE KILL & TAUNT FEED (Cleanly below the single-row top bar) */}
      <div className="absolute top-12 right-2.5 max-w-[210px] sm:max-w-[250px] space-y-1 pointer-events-none z-10">
        {feed.slice(0, 3).map((item) => (
          <div
            key={item.id}
            className="px-2.5 py-1 rounded-xl bg-black/65 backdrop-blur-md border border-white/10 text-[10px] sm:text-[11px] font-bold text-white shadow-md"
          >
            {item.text}
          </div>
        ))}
      </div>

      {/* HUNTER BLINDFOLD CAGE BANNER (HIDE_PHASE) */}
      {isHunter && phase === "HIDE_PHASE" && (
        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto p-4 rounded-3xl bg-rose-950/90 backdrop-blur-md border-2 border-rose-500/70 text-center shadow-2xl z-20 space-y-2">
          <div className="flex items-center justify-center gap-2 text-rose-200 font-black text-base">
            <EyeOff className="w-5 h-5 animate-bounce text-amber-400" />
            <span>قفص الصياد مسدود لـ {secondsLeft} ثانية!</span>
          </div>
          <p className="text-xs text-rose-100/90">
            صحابك كيتحولو لطواجن، برادا، وصنادق وكيتخباو فـ الرياض... وجّد المطرقة ديالك! 🔨
          </p>
          {(secondsLeft <= 2 || isHost) && (
            <button
              type="button"
              onClick={() => {
                sound.playCardFlip();
                onAction({ type: "START_HUNT" });
                sendRefresh();
              }}
              className="mt-1 px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg active:scale-95 transition-all"
            >
              {secondsLeft <= 0
                ? "افتح القفص وبدا الصيد دابا! 🔨"
                : "كلشي تخبّى؟ افتح القفص دابا 🔓"}
            </button>
          )}
        </div>
      )}

      {/* CAUGHT SPECTATOR BANNER FOR HIDERS */}
      {!isHunter && isCaught && (
        <div className="absolute inset-x-4 top-14 max-w-sm mx-auto p-2.5 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-rose-500/50 text-center z-20 pointer-events-none">
          <span className="text-xs font-black text-rose-400 block">
            💥 حصلتي! دوز صبعك على الشاشة وتفرّج فصحابك مباشرة
          </span>
        </div>
      )}

      {/* FLOATING 8-PROP DISGUISE DRAWER (When Hider taps 🎭) */}
      {!isHunter && !isCaught && propDrawerOpen && (
        <div
          className="absolute bottom-32 inset-x-3 sm:inset-x-auto sm:right-4 sm:w-[400px] p-3 rounded-3xl bg-slate-950/95 backdrop-blur-xl border-2 border-amber-400/50 shadow-2xl z-30"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setPropDrawerOpen(false)}
              className="p-1 rounded-lg bg-slate-800 text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
            <span className="text-xs font-black text-amber-300">
              🎭 اختار الغرض اللي بغيتي تتحول ليه:
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
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
                      ? "bg-amber-500/25 border-amber-400 text-amber-200 shadow-md"
                      : "bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-600"
                  }`}
                >
                  <span className="text-xl block">{meta.emoji}</span>
                  <span className="text-[10px] font-bold block truncate mt-0.5">
                    {meta.name.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* BOTTOM DUAL-THUMB ARCADE OVERLAY (LEFT JOYSTICK + RIGHT ACTIONS)  */}
      {/* ================================================================= */}
      <div
        className="absolute bottom-0 inset-x-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex items-end justify-between gap-2 pointer-events-none"
        dir="ltr"
      >
        {/* BOTTOM-LEFT: MULTI-TOUCH VIRTUAL JOYSTICK */}
        <div className="flex flex-col items-center gap-1 pointer-events-auto shrink-0">
          <div
            ref={joyBaseRef}
            onPointerDown={handleJoyDown}
            onPointerMove={handleJoyMove}
            onPointerUp={handleJoyUp}
            onPointerCancel={handleJoyUp}
            className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-slate-950/65 backdrop-blur-md border-2 border-cyan-400/50 relative flex items-center justify-center shadow-2xl touch-none cursor-pointer"
          >
            <span className="absolute top-1.5 text-[8px] font-black text-cyan-300/60 pointer-events-none">
              ▲
            </span>
            <span className="absolute bottom-1.5 text-[8px] font-black text-cyan-300/60 pointer-events-none">
              ▼
            </span>
            <span className="absolute left-1.5 text-[8px] font-black text-cyan-300/60 pointer-events-none">
              ◀
            </span>
            <span className="absolute right-1.5 text-[8px] font-black text-cyan-300/60 pointer-events-none">
              ▶
            </span>
            <div
              style={{
                transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
              }}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 border-2 border-white shadow-lg shadow-cyan-500/40 pointer-events-none"
            />
          </div>
          <span className="hidden sm:inline-block text-[10px] font-bold text-slate-300/80 bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-sm">
            🕹️ تحرّك • دوز على الشاشة باش تدوّر الكاميرا
          </span>
        </div>

        {/* BOTTOM-RIGHT: ROLE ACTION CLUSTER */}
        <div
          className="pointer-events-auto flex flex-col items-end gap-1.5"
          dir="rtl"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isHunter ? (
            /* HUNTER ARCADE BUTTONS */
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handleHunterSonar}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-900/85 hover:bg-slate-800 backdrop-blur-md border-2 border-cyan-400/60 text-cyan-300 font-black text-[11px] shadow-xl active:scale-90 transition-all flex flex-col items-center justify-center"
              >
                <Radio className="w-5 h-5 text-cyan-400" />
                <span>رادار</span>
                {sonarDistance !== null && (
                  <span className="text-[10px] text-amber-300 font-extrabold">
                    {sonarDistance}m
                  </span>
                )}
              </button>

              <button
                type="button"
                disabled={phase !== "HUNT_PHASE" || (myEntity?.hearts ?? 5) <= 0}
                onClick={handleHunterStrike}
                className="w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-rose-500 via-red-600 to-orange-600 hover:brightness-110 disabled:opacity-40 border-4 border-rose-200/80 text-white font-black text-xs sm:text-sm shadow-2xl shadow-rose-600/50 active:scale-90 transition-all flex flex-col items-center justify-center gap-0.5"
              >
                <Hammer className="w-7 h-7 sm:w-8 sm:h-8" />
                <span>ضرب! 🔨</span>
              </button>
            </div>
          ) : (
            /* HIDER ARCADE BUTTONS (Clean 2x2 Grid that fits Portrait & Landscape) */
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              <button
                type="button"
                disabled={isCaught}
                onClick={() => {
                  sound.playCardFlip();
                  setPropDrawerOpen((v) => !v);
                }}
                className={`px-3 py-2.5 rounded-2xl backdrop-blur-md border-2 font-black text-[11px] sm:text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1 ${
                  propDrawerOpen
                    ? "bg-amber-500 border-white text-slate-950"
                    : "bg-slate-900/90 border-amber-400/60 text-amber-300"
                }`}
              >
                <span>{GHAMMADA_PROPS[selectedProp]?.emoji}</span>
                <span>الشكْل 🎭</span>
              </button>

              <button
                type="button"
                disabled={isCaught || phase !== "HUNT_PHASE"}
                onClick={handleWhistleTaunt}
                className="px-3 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 disabled:opacity-40 border-2 border-amber-200 text-slate-950 font-black text-[11px] sm:text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1"
              >
                <Volume2 className="w-4 h-4 shrink-0" />
                <span>صفّر 😗</span>
              </button>

              <button
                type="button"
                disabled={isCaught}
                onClick={handleSmokeDash}
                className="px-3 py-3 rounded-2xl bg-indigo-600/90 hover:bg-indigo-500 disabled:opacity-40 backdrop-blur-md border-2 border-indigo-300 text-white font-black text-[11px] sm:text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1"
              >
                <Wind className="w-4 h-4 shrink-0" />
                <span>داش 💨</span>
              </button>

              <button
                type="button"
                disabled={isCaught}
                onClick={handleToggleLock}
                className={`px-3 py-3 rounded-2xl backdrop-blur-md border-2 font-black text-[11px] sm:text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1 ${
                  isLockedUI
                    ? "bg-emerald-600 border-emerald-200 text-white shadow-emerald-600/50"
                    : "bg-slate-900/90 border-cyan-400/70 text-cyan-200"
                }`}
              >
                {isLockedUI ? (
                  <Lock className="w-4 h-4 shrink-0" />
                ) : (
                  <Unlock className="w-4 h-4 shrink-0" />
                )}
                <span>{isLockedUI ? "مثبّت 🔒" : "ثبّت"}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* iOS Fullscreen & Landscape Instructions Modal */}
      {iosHelpOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIosHelpOpen(false)}
        >
          <div
            className="max-w-sm w-full rounded-3xl bg-slate-900 border-2 border-amber-400 p-5 text-right space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIosHelpOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-base font-black text-amber-300">
                📱 وضع الشاشة الكاملة فـ iPhone
              </h3>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              1️⃣ <strong>دوّر التيليفون بالعرض (Landscape)</strong> باش تلعب بـ جوج صباع بحال PUBG!
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              2️⃣ إلا بغيتي تحيّد شريط Safari نهائياً: كليكي على زر المشاركة{" "}
              <strong>(Share ⬆️)</strong> لتحت واختار{" "}
              <strong>&quot;Add to Home Screen / إضافة إلى الشاشة الرئيسية&quot;</strong>.
            </p>
            <button
              type="button"
              onClick={() => setIosHelpOpen(false)}
              className="w-full py-2.5 rounded-2xl bg-amber-500 text-slate-950 font-black text-xs"
            >
              مفهوم، يالاه نلعبو! 🎮
            </button>
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="max-w-4xl mx-auto w-full space-y-3 pb-6 text-right">
      {/* Render active 3D game via Portal directly on document.body when immersive */}
      {isActivePhase &&
        (isImmersive && mounted && typeof document !== "undefined"
          ? createPortal(activeGameUI, document.body)
          : activeGameUI)}

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
              sendRefresh();
            }}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:brightness-110 text-slate-950 font-black text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span>
              {round >= maxRounds
                ? "شوف الفائز النهائي 🏆"
                : `الجولة ${round + 1} (تبديل الصياد) 🔄`}
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
              sendRefresh();
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
