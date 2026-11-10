"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import confetti from "canvas-confetti";
import {
  Crosshair,
  Eye,
  Flame,
  Maximize,
  Minimize,
  RefreshCw,
  Settings2,
  Shield,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { sound } from "@/lib/sound";
import {
  CARBON_WEAPONS,
  CarbonAction,
  CarbonCombatant,
  CarbonKillEventPacket,
  CarbonMode,
  CarbonPickupPad,
  CarbonSettings,
  CarbonShotPacket,
} from "@/games/carbon3d/types";
import {
  ActiveShotCommand,
  Carbon3DArena,
  CarbonCameraMode,
  LocalWeaponHudState,
} from "./Carbon3DArena";
import { carbonSfx } from "./carbon3d/soundFx";
import { LocalPlayerPhysicsState, useCarbonNet } from "./carbon3d/useCarbonNet";

export interface Carbon3DGameViewProps {
  publicData: Record<string, any>;
  privateData?: Record<string, any>;
  isHost?: boolean;
  onAction: (action: CarbonAction) => Promise<void> | void;
  players?: any[];
  activePlayerId?: string;
  roomCode?: string;
  onRefresh?: () => void;
}

export function Carbon3DGameView({
  publicData,
  privateData,
  isHost = false,
  onAction,
  activePlayerId,
  roomCode = "",
  onRefresh,
}: Carbon3DGameViewProps) {
  const [mounted, setMounted] = useState(false);
  const [isImmersive, setIsImmersive] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(sound.isMuted);
  const [cameraMode, setCameraMode] = useState<CarbonCameraMode>("TPS");
  const [autoFire, setAutoFire] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
    // Keep phone screen awake during live shooter action!
    let wakeLock: any = null;
    if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
      (navigator as any).wakeLock
        .request("screen")
        .then((wl: any) => {
          wakeLock = wl;
        })
        .catch(() => {});
    }
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    const clock = setInterval(() => setNowMs(Date.now()), 200);
    return () => {
      clearInterval(clock);
      document.removeEventListener("fullscreenchange", onFs);
      if (wakeLock) wakeLock.release?.().catch(() => {});
    };
  }, []);

  const phase = (publicData?.phase as "PLAYING" | "GAME_OVER") || "PLAYING";
  const mode = (publicData?.mode as CarbonMode) || "FFA";
  const round = Number(publicData?.round ?? 1);
  const endsAt = Number(publicData?.endsAt ?? Date.now() + 210_000);
  const settings = (publicData?.settings as CarbonSettings) || {
    mode: "FFA",
    botFill: true,
    botDifficulty: "HARD",
    targetKillsFFA: 15,
    targetScoreSquad: 40,
    matchDurationSec: 210,
  };
  const initialCombatants =
    (publicData?.combatants as Record<string, CarbonCombatant>) || {};
  const initialPickups = (publicData?.pickups as CarbonPickupPad[]) || [];
  const winnerSummaryAr = (publicData?.winnerSummaryAr as string | null) || null;

  const myId = useMemo(() => {
    const candidate = activePlayerId || String(privateData?.myStrikerId ?? "");
    if (candidate && initialCombatants[candidate]) return candidate;
    const firstHuman = Object.values(initialCombatants).find((u) => !u.isBot);
    return firstHuman?.id || Object.keys(initialCombatants)[0] || "p_local";
  }, [activePlayerId, privateData?.myStrikerId, initialCombatants]);

  // Physics, Controls & FX Queues shared at 60Hz with Carbon3DArena
  const myInitial = initialCombatants[myId];
  const localPhysRef = useRef<LocalPlayerPhysicsState>({
    x: myInitial?.x ?? 0,
    y: myInitial?.y ?? 0,
    z: myInitial?.z ?? -18,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: myInitial?.yaw ?? 0,
    pitch: 0,
    isDashing: false,
    isAirborne: false,
  });

  const moveStickRef = useRef<{ dx: number; dz: number }>({ dx: 0, dz: 0 });
  const lookDeltaRef = useRef<{ dYaw: number; dPitch: number; isDragging: boolean }>({
    dYaw: 0,
    dPitch: 0,
    isDragging: false,
  });
  const commandsRef = useRef<ActiveShotCommand>({
    manualFiring: false,
    autoFireEnabled: true,
    dashRequested: false,
    grenadeRequested: false,
    reloadRequested: false,
  });
  commandsRef.current.autoFireEnabled = autoFire;

  const remoteShotQueueRef = useRef<CarbonShotPacket[]>([]);
  const killBurstQueueRef = useRef<Array<{ x: number; y: number; z: number; colorHex: number }>>([]);
  const screenShakeRef = useRef<number>(0);

  // HUD Visual Feedback States
  const [weaponHud, setWeaponHud] = useState<LocalWeaponHudState>({
    weapon: "CARBINE",
    secondaryWeapon: "SHOTGUN",
    ammo: 28,
    maxAmmo: 28,
    isReloading: false,
    dashCooldownLeft: 0,
    grenadeCooldownLeft: 0,
    hasTargetLock: false,
    lastHitIsCrit: 0,
    lastHitAt: 0,
  });
  const [damageFlash, setDamageFlash] = useState<{ at: number; shieldBroke: boolean }>({
    at: 0,
    shieldBroke: false,
  });
  const [killBanner, setKillBanner] = useState<{ text: string; sub: string; at: number } | null>(
    null
  );
  const [liveKillFeed, setLiveKillFeed] = useState<CarbonKillEventPacket[]>([]);

  const handleRemoteShot = useCallback((shot: CarbonShotPacket) => {
    remoteShotQueueRef.current.push(shot);
  }, []);

  const handleKillEvent = useCallback(
    (kill: CarbonKillEventPacket) => {
      killBurstQueueRef.current.push({
        x: kill.vx,
        y: kill.vy,
        z: kill.vz,
        colorHex: kill.colorHex,
      });
      setLiveKillFeed((prev) => [kill, ...prev].slice(0, 4));

      if (kill.killerId === myId) {
        carbonSfx.playKillConfirm(kill.streak);
        const callout =
          kill.streak >= 4
            ? "👑 سيطرة كاربون مطلقة! ما كيرحمش 🔥"
            : kill.streak === 3
            ? "⚡ تريبل كيل! شعلتي الأرينا!"
            : kill.streak === 2
            ? "🔥 دبل كيل ناااضي!"
            : kill.isHeadshot
            ? "🎯 هيدشوت فـ الفيزور!"
            : "💥 قضيتي عليه!";
        setKillBanner({
          text: callout,
          sub: `إقصاء ${kill.victimName}`,
          at: Date.now(),
        });
      }
    },
    [myId]
  );

  const handleDamageTaken = useCallback(
    (_amount: number, _fromX: number, _fromZ: number, shieldBroken: boolean) => {
      setDamageFlash({ at: Date.now(), shieldBroke: shieldBroken });
      screenShakeRef.current = Math.max(screenShakeRef.current, shieldBroken ? 0.24 : 0.11);
      if (shieldBroken) carbonSfx.playShieldBreak();
      else carbonSfx.haptic(12);
    },
    []
  );

  const handleRespawnLocal = useCallback((x: number, y: number, z: number, yaw: number) => {
    localPhysRef.current.x = x;
    localPhysRef.current.y = y;
    localPhysRef.current.z = z;
    localPhysRef.current.vx = 0;
    localPhysRef.current.vy = 0;
    localPhysRef.current.vz = 0;
    localPhysRef.current.yaw = yaw;
    localPhysRef.current.pitch = 0;
  }, []);

  const {
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
  } = useCarbonNet({
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
    onRemoteShot: handleRemoteShot,
    onKillEvent: handleKillEvent,
    onDamageTaken: handleDamageTaken,
    onRespawnLocal: handleRespawnLocal,
    onAction,
    onRefresh,
  });

  // Confetti celebration on Victory
  useEffect(() => {
    if (phase === "GAME_OVER") {
      carbonSfx.playKillConfirm(3);
      try {
        confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
      } catch {}
    }
  }, [phase]);

  // --- FLOATING LEFT THUMBSTICK & RIGHT SMOOTH-LOOK MULTI-TOUCH HANDLERS ---
  const leftTouchRef = useRef<{ id: number; startX: number; startY: number } | null>(null);
  const rightTouchRef = useRef<{ id: number; lastX: number; lastY: number } | null>(null);
  const [floatingStickVis, setFloatingStickVis] = useState<{
    active: boolean;
    baseX: number;
    baseY: number;
    knobX: number;
    knobY: number;
  }>({ active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 });

  const STICK_MAX_R = 52;

  const onLeftZonePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (leftTouchRef.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    leftTouchRef.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY };
    moveStickRef.current = { dx: 0, dz: 0 };
    setFloatingStickVis({
      active: true,
      baseX: e.clientX,
      baseY: e.clientY,
      knobX: 0,
      knobY: 0,
    });
  };

  const onLeftZonePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!leftTouchRef.current || leftTouchRef.current.id !== e.pointerId) return;
    const rawX = e.clientX - leftTouchRef.current.startX;
    const rawY = e.clientY - leftTouchRef.current.startY;
    const dist = Math.hypot(rawX, rawY);
    const clamped = Math.min(STICK_MAX_R, dist);
    const angle = Math.atan2(rawY, rawX);
    const kx = Math.cos(angle) * clamped;
    const ky = Math.sin(angle) * clamped;
    moveStickRef.current = {
      dx: kx / STICK_MAX_R,
      dz: ky / STICK_MAX_R,
    };
    setFloatingStickVis((s) => ({ ...s, knobX: kx, knobY: ky }));
  };

  const onLeftZonePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!leftTouchRef.current || leftTouchRef.current.id !== e.pointerId) return;
    leftTouchRef.current = null;
    moveStickRef.current = { dx: 0, dz: 0 };
    setFloatingStickVis((s) => ({ ...s, active: false, knobX: 0, knobY: 0 }));
  };

  const onRightZonePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (rightTouchRef.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    rightTouchRef.current = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY };
    lookDeltaRef.current.isDragging = true;
  };

  const onRightZonePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!rightTouchRef.current || rightTouchRef.current.id !== e.pointerId) return;
    const dx = e.clientX - rightTouchRef.current.lastX;
    const dy = e.clientY - rightTouchRef.current.lastY;
    rightTouchRef.current.lastX = e.clientX;
    rightTouchRef.current.lastY = e.clientY;

    // Velocity-curved smooth mobile sensitivity
    const speed = Math.hypot(dx, dy);
    const accel = 1 + Math.min(0.85, speed * 0.025);
    lookDeltaRef.current.dYaw -= dx * 0.0048 * accel;
    lookDeltaRef.current.dPitch -= dy * 0.0036 * accel;
  };

  const onRightZonePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!rightTouchRef.current || rightTouchRef.current.id !== e.pointerId) return;
    rightTouchRef.current = null;
    lookDeltaRef.current.isDragging = false;
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {}
  };

  const toggleMute = () => {
    sound.isMuted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleModeSwitch = async (
    nextMode: CarbonMode,
    nextDiff?: "NORMAL" | "HARD" | "CARBON",
    nextBotFill?: boolean
  ) => {
    setSettingsOpen(false);
    await Promise.resolve(
      onAction({
        type: "CONFIGURE_MATCH",
        mode: nextMode,
        botDifficulty: nextDiff ?? settings.botDifficulty,
        botFill: typeof nextBotFill === "boolean" ? nextBotFill : settings.botFill,
      })
    );
    sendRefresh();
    onRefresh?.();
  };

  const handleRestartMatch = async () => {
    await Promise.resolve(onAction({ type: "RESTART_MATCH", mode }));
    sendRefresh();
    onRefresh?.();
  };

  // Read fresh combatant snapshots from ref (re-evaluated via hudTick)
  void hudTick;
  const allUnits = Object.values(combatantsRef.current);
  const myUnit = combatantsRef.current[myId];
  const sortedLeaderboard = [...allUnits].sort(
    (a, b) => b.kills - a.kills || b.score - a.score
  );
  const humanCount = allUnits.filter((u) => !u.isBot).length;
  const canConfigure = isHost || humanCount <= 1;

  const secRemaining = Math.max(0, Math.ceil((endsAt - nowMs) / 1000));
  const mm = String(Math.floor(secRemaining / 60)).padStart(2, "0");
  const ss = String(secRemaining % 60).padStart(2, "0");

  const activeSpec = CARBON_WEAPONS[weaponHud.weapon];
  const showHitmarker = nowMs - weaponHud.lastHitAt < 180;
  const isCritMarker = showHitmarker && weaponHud.lastHitIsCrit === weaponHud.lastHitAt;
  const showDamageVignette = nowMs - damageFlash.at < 360;
  const showBanner = killBanner && nowMs - killBanner.at < 2400;
  const respawnLeftSec =
    myUnit && !myUnit.isAlive && myUnit.respawnAt > nowMs
      ? ((myUnit.respawnAt - nowMs) / 1000).toFixed(1)
      : null;

  if (!mounted) return null;

  const ui = (
    <div
      dir="rtl"
      className={
        isImmersive
          ? "fixed inset-0 z-50 w-[100dvw] h-[100dvh] overflow-hidden bg-slate-950 select-none touch-none font-sans"
          : "relative w-full h-[78dvh] min-h-[500px] rounded-3xl border border-cyan-500/40 overflow-hidden bg-slate-950 select-none touch-none font-sans shadow-2xl"
      }
    >
      {/* 1. 60 FPS Three.js Orbital Carbon Arena */}
      <Carbon3DArena
        myId={myId}
        mode={mode}
        phase={phase}
        cameraMode={cameraMode}
        combatantsRef={combatantsRef}
        pickupsRef={pickupsRef}
        peersRef={peersRef}
        coreOwnerRef={coreOwnerRef}
        localPhysRef={localPhysRef}
        moveStickRef={moveStickRef}
        lookDeltaRef={lookDeltaRef}
        commandsRef={commandsRef}
        remoteShotQueueRef={remoteShotQueueRef}
        killBurstQueueRef={killBurstQueueRef}
        screenShakeRef={screenShakeRef}
        onLocalPosTick={sendLocalPos}
        onBroadcastShot={broadcastShot}
        onClaimHit={claimHit}
        onHudWeaponUpdate={setWeaponHud}
      />

      {/* 2. Damage / Shield Shatter Screen Vignette */}
      {showDamageVignette && (
        <div
          className={`pointer-events-none absolute inset-0 transition-opacity duration-200 ${
            damageFlash.shieldBroke
              ? "shadow-[inset_0_0_95px_rgba(34,211,238,0.85)]"
              : "shadow-[inset_0_0_85px_rgba(244,63,94,0.75)]"
          }`}
        />
      )}

      {/* 3. Multi-Touch Invisible Split Zones (Left 46% Move Stick | Right 54% Aim Drag) */}
      {phase === "PLAYING" && (
        <>
          <div
            onPointerDown={onLeftZonePointerDown}
            onPointerMove={onLeftZonePointerMove}
            onPointerUp={onLeftZonePointerUp}
            onPointerCancel={onLeftZonePointerUp}
            className="absolute inset-y-14 left-0 w-[46%] z-10 touch-none"
          />
          <div
            onPointerDown={onRightZonePointerDown}
            onPointerMove={onRightZonePointerMove}
            onPointerUp={onRightZonePointerUp}
            onPointerCancel={onRightZonePointerUp}
            className="absolute inset-y-14 right-0 w-[54%] z-10 touch-none"
          />
        </>
      )}

      {/* Floating Left Virtual Thumbstick Visual */}
      {floatingStickVis.active && (
        <div
          style={{
            left: floatingStickVis.baseX - 58,
            top: floatingStickVis.baseY - 58,
          }}
          className="pointer-events-none fixed z-20 w-[116px] h-[116px] rounded-full border-2 border-cyan-400/50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center shadow-[0_0_25px_rgba(34,211,238,0.25)]"
        >
          <div
            style={{
              transform: `translate(${floatingStickVis.knobX}px, ${floatingStickVis.knobY}px)`,
            }}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-sky-600 border-2 border-white/80 shadow-[0_0_18px_rgba(34,211,238,0.9)]"
          />
        </div>
      )}

      {/* Static Subtle Hint on Left Corner When Thumbstick Idle */}
      {!floatingStickVis.active && phase === "PLAYING" && (
        <div className="pointer-events-none absolute bottom-7 left-7 z-10 w-24 h-24 rounded-full border border-white/15 bg-slate-950/25 flex items-center justify-center">
          <div className="w-9 h-9 rounded-full border border-cyan-400/40 bg-cyan-400/15" />
        </div>
      )}

      {/* 4. Center Dynamic Sci-Fi Reticle + Hitmarker (TPS Mode) */}
      {phase === "PLAYING" && myUnit?.isAlive && cameraMode === "TPS" && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            {/* Outer reticle brackets */}
            <div
              className={`w-9 h-9 rounded-full border-2 transition-all duration-75 ${
                weaponHud.hasTargetLock
                  ? "scale-110 border-rose-500 shadow-[0_0_16px_rgba(244,63,94,0.9)]"
                  : "border-cyan-300/75"
              }`}
            />
            <div
              className={`absolute w-1.5 h-1.5 rounded-full ${
                weaponHud.hasTargetLock ? "bg-rose-400" : "bg-white"
              }`}
            />
            {weaponHud.hasTargetLock && autoFire && (
              <span className="absolute -bottom-5 whitespace-nowrap text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded bg-rose-600/85 text-white">
                قفل الهدف ⚡
              </span>
            )}
            {/* Hitmarker X */}
            {showHitmarker && (
              <div
                className={`absolute w-7 h-7 rotate-45 border-2 ${
                  isCritMarker ? "border-amber-300 scale-125" : "border-white"
                }`}
              />
            )}
          </div>
        </div>
      )}

      {/* 5. Top Tactical Match Header */}
      <div className="pointer-events-none absolute top-0 inset-x-0 z-30 p-2.5 sm:p-3.5 flex items-start justify-between gap-2">
        {/* Right (RTL Start): Mode Score / Wave / Timer Pill */}
        <div className="pointer-events-auto flex items-center gap-2 bg-slate-950/80 backdrop-blur-md border border-cyan-500/35 rounded-2xl px-3 py-1.5 shadow-xl">
          <button
            onClick={() => setScoreboardOpen((v) => !v)}
            className="flex items-center gap-2 text-right"
          >
            {mode === "SQUAD" ? (
              <div className="flex items-center gap-2 text-xs font-black">
                <span className="px-2 py-0.5 rounded-lg bg-cyan-500/25 text-cyan-300 border border-cyan-400/40">
                  سايان {teamScoresRef.current.CYAN}
                </span>
                <span className="text-slate-400">ضد</span>
                <span className="px-2 py-0.5 rounded-lg bg-rose-500/25 text-rose-300 border border-rose-400/40">
                  كريمسون {teamScoresRef.current.CRIMSON}
                </span>
              </div>
            ) : mode === "SURVIVAL" ? (
              <div className="flex items-center gap-2 text-xs font-black">
                <span className="px-2 py-0.5 rounded-lg bg-amber-500/25 text-amber-300 border border-amber-400/40">
                  🌊 الموجة {waveRef.current}
                </span>
                <span className="text-rose-300">الآليين: {waveRemRef.current}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs font-black">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-cyan-300">
                  الأول: {sortedLeaderboard[0]?.nickname?.slice(0, 10) || "—"} (
                  {sortedLeaderboard[0]?.kills ?? 0}/{settings.targetKillsFFA || 15})
                </span>
              </div>
            )}
          </button>

          {mode !== "SURVIVAL" && (
            <span
              dir="ltr"
              className="font-mono text-xs font-black px-2 py-0.5 rounded-lg bg-slate-900 text-slate-200 border border-white/10"
            >
              {mm}:{ss}
            </span>
          )}

          <span
            title={isLive ? "متصل بالويفي المباشر 20Hz" : "وضع فردي / محلي"}
            className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
              isLive
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                : "bg-sky-500/20 text-sky-300 border border-sky-400/30"
            }`}
          >
            <Wifi className="w-3 h-3" />
            <span className="hidden sm:inline">{humanCount <= 1 ? "SOLO" : "WIFI"}</span>
          </span>
        </div>

        {/* Left (RTL End): Utility Controls (Camera, Auto-Fire, Mode Settings, Sound, Fullscreen) */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            onClick={() => setAutoFire((v) => !v)}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black border backdrop-blur-md transition-all flex items-center gap-1 ${
              autoFire
                ? "bg-emerald-950/85 border-emerald-400/60 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                : "bg-slate-950/80 border-white/15 text-slate-300"
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>{autoFire ? "تلقائي: شغال" : "إطلاق يدوي"}</span>
          </button>

          <button
            onClick={() => setCameraMode((c) => (c === "TPS" ? "TACTICAL" : "TPS"))}
            className="px-2.5 py-1.5 rounded-xl bg-slate-950/80 border border-white/15 text-cyan-200 text-[11px] font-bold backdrop-blur-md flex items-center gap-1 active:scale-95"
          >
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">
              {cameraMode === "TPS" ? "منظور الكتف" : "منظور تكتيكي"}
            </span>
          </button>

          {canConfigure && (
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 rounded-xl bg-slate-950/80 border border-amber-400/40 text-amber-300 backdrop-blur-md active:scale-95"
              title="تبديل طور اللعب والبوتات"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={toggleMute}
            className="p-2 rounded-xl bg-slate-950/80 border border-white/15 text-slate-200 backdrop-blur-md"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-300" />}
          </button>

          <button
            onClick={() => setIsImmersive((v) => !v)}
            className="px-2 py-1.5 rounded-xl bg-slate-950/80 border border-white/15 text-slate-200 text-[10px] font-bold backdrop-blur-md"
            title={isImmersive ? "إظهار قائمة الغرفة و QR" : "ملء شاشة الهاتف"}
          >
            {isImmersive ? "الغرفة" : "تكبير"}
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-950/80 border border-white/15 text-slate-200 backdrop-blur-md"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Squad Central Overdrive Core Progress Bar */}
      {mode === "SQUAD" && phase === "PLAYING" && (
        <div className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-20 w-52 bg-slate-950/75 border border-white/15 rounded-full p-1 backdrop-blur-sm">
          <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              style={{
                width: `${Math.abs(coreProgRef.current)}%`,
                right: coreProgRef.current >= 0 ? "50%" : undefined,
                left: coreProgRef.current < 0 ? "50%" : undefined,
              }}
              className={`h-full transition-all ${
                coreProgRef.current >= 0 ? "bg-cyan-400" : "bg-rose-500"
              }`}
            />
          </div>
          <p className="text-[9px] text-center font-bold text-slate-300 mt-0.5">
            نواة الأوفردرايف الوسطى:{" "}
            {coreOwnerRef.current === "CYAN"
              ? "سيطرة السايان ⚡"
              : coreOwnerRef.current === "CRIMSON"
              ? "سيطرة الكريمسون 🔥"
              : coreOwnerRef.current === "CONTESTED"
              ? "اشتباك حامي! ⚔️"
              : "محايدة"}
          </p>
        </div>
      )}

      {/* Kill-Streak Hype Banner */}
      {showBanner && killBanner && (
        <div className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 z-30 text-center animate-bounce">
          <div className="px-5 py-2 rounded-2xl bg-gradient-to-r from-cyan-950/90 via-slate-900/95 to-rose-950/90 border border-amber-400/60 shadow-[0_0_30px_rgba(251,191,36,0.35)]">
            <p className="text-sm sm:text-base font-black text-amber-300">{killBanner.text}</p>
            <p className="text-[11px] font-bold text-slate-200">{killBanner.sub}</p>
          </div>
        </div>
      )}

      {/* Live Compact Killfeed (Top-Right below header) */}
      {liveKillFeed.length > 0 && phase === "PLAYING" && (
        <div className="pointer-events-none absolute top-14 right-3 z-20 flex flex-col gap-1 max-w-[230px]">
          {liveKillFeed.map((kf) => (
            <div
              key={kf.id}
              className="px-2.5 py-1 rounded-lg bg-slate-950/70 border border-white/10 text-[10px] font-bold text-slate-200 flex items-center gap-1.5 backdrop-blur-sm"
            >
              <span className="text-cyan-300 truncate max-w-[80px]">{kf.killerName}</span>
              <span className="text-amber-400">{kf.isHeadshot ? "🎯" : "⚡"}</span>
              <span className="text-rose-300 truncate max-w-[80px]">{kf.victimName}</span>
            </div>
          ))}
        </div>
      )}

      {/* Respawn Sky-Drop Overlay */}
      {respawnLeftSec && phase === "PLAYING" && (
        <div className="pointer-events-none absolute inset-0 z-30 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center">
          <div className="px-7 py-5 rounded-3xl bg-slate-900/95 border border-rose-500/50 text-center shadow-2xl">
            <p className="text-lg font-black text-rose-400 mb-1">تم تدمير الدرع! 💥</p>
            <p className="text-xs text-slate-300 mb-2">إعادة الإنزال المداري خلال</p>
            <span className="font-mono text-3xl font-black text-cyan-300">{respawnLeftSec}s</span>
          </div>
        </div>
      )}

      {/* 6. Bottom-Center Player Shield / Health / Weapon Bar */}
      {phase === "PLAYING" && myUnit && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-30 w-[260px] sm:w-[330px] flex flex-col gap-1.5">
          {/* Overdrive Active Badge */}
          {myUnit.overdriveUntil > nowMs && (
            <div className="self-center px-3 py-0.5 rounded-full bg-amber-500/30 border border-amber-400 text-[10px] font-black text-amber-200 animate-pulse">
              ⚡ أوفردرايف شغال (+35% قوة نيران!)
            </div>
          )}

          {/* Shield & HP Bars */}
          <div className="p-2 rounded-2xl bg-slate-950/85 border border-white/15 backdrop-blur-md shadow-xl space-y-1.5">
            {/* Shield */}
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  style={{
                    width: `${Math.max(0, Math.min(100, (myUnit.shield / myUnit.maxShield) * 100))}%`,
                  }}
                  className="h-full bg-gradient-to-r from-cyan-400 to-sky-300 transition-all duration-100"
                />
              </div>
              <span className="font-mono text-[10px] font-black text-cyan-300 w-7 text-left">
                {Math.round(myUnit.shield)}
              </span>
            </div>

            {/* Health */}
            <div className="flex items-center gap-2">
              <Flame className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <div className="flex-1 h-2.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  style={{
                    width: `${Math.max(0, Math.min(100, (myUnit.hp / myUnit.maxHp) * 100))}%`,
                  }}
                  className={`h-full transition-all duration-100 ${
                    myUnit.hp > 50
                      ? "bg-gradient-to-r from-emerald-500 to-teal-300"
                      : myUnit.hp > 25
                      ? "bg-amber-400"
                      : "bg-rose-500"
                  }`}
                />
              </div>
              <span className="font-mono text-[10px] font-black text-emerald-300 w-7 text-left">
                {Math.round(myUnit.hp)}
              </span>
            </div>

            {/* Active Weapon + Swap + Reload */}
            <div className="pointer-events-auto pt-1 border-t border-white/10 flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  if (swapLocalWeapon()) carbonSfx.playPickup();
                }}
                className={`px-2.5 py-1 rounded-xl border text-[11px] font-black flex items-center gap-1.5 active:scale-95 ${activeSpec.badgeColor}`}
              >
                <span>{activeSpec.nameAr}</span>
                {weaponHud.secondaryWeapon && (
                  <span className="text-[9px] opacity-80 bg-black/40 px-1.5 py-0.5 rounded">
                    بدّل 🔄
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  commandsRef.current.reloadRequested = true;
                }}
                dir="ltr"
                className="px-2.5 py-1 rounded-xl bg-slate-900 border border-white/15 font-mono text-xs font-black text-white flex items-center gap-1 active:scale-95"
              >
                {weaponHud.isReloading ? (
                  <span className="text-amber-300 text-[10px] animate-pulse">تعبئة...</span>
                ) : (
                  <>
                    <span className="text-cyan-300">{weaponHud.ammo}</span>
                    <span className="text-slate-500">/</span>
                    <span className="text-slate-400">{weaponHud.maxAmmo}</span>
                    <RefreshCw className="w-3 h-3 text-slate-400 ml-1" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Bottom-Right Ergonomic Thumb Action Cluster (Manual Fire + Jet-Dash + EMP Grenade) */}
      {phase === "PLAYING" && (
        <div className="pointer-events-auto absolute bottom-5 right-5 z-30 flex items-end gap-2.5">
          <div className="flex flex-col gap-2.5 items-center">
            {/* EMP Shock Grenade */}
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                commandsRef.current.grenadeRequested = true;
              }}
              disabled={weaponHud.grenadeCooldownLeft > 0.05}
              className={`w-12 h-12 rounded-2xl border-2 flex flex-col items-center justify-center font-black transition-all active:scale-90 ${
                weaponHud.grenadeCooldownLeft > 0.05
                  ? "bg-slate-900/75 border-slate-700 text-slate-500"
                  : "bg-sky-950/85 border-sky-400 text-sky-200 shadow-[0_0_18px_rgba(56,189,248,0.4)]"
              }`}
            >
              <span className="text-base leading-none">💣</span>
              <span className="text-[9px] mt-0.5">
                {weaponHud.grenadeCooldownLeft > 0.05
                  ? `${weaponHud.grenadeCooldownLeft.toFixed(0)}s`
                  : "نبضة"}
              </span>
            </button>

            {/* Jet-Dash */}
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                commandsRef.current.dashRequested = true;
              }}
              disabled={weaponHud.dashCooldownLeft > 0.05}
              className={`w-13 h-13 p-2 rounded-2xl border-2 flex flex-col items-center justify-center font-black transition-all active:scale-90 ${
                weaponHud.dashCooldownLeft > 0.05
                  ? "bg-slate-900/75 border-slate-700 text-slate-500"
                  : "bg-cyan-950/85 border-cyan-400 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.45)]"
              }`}
            >
              <Zap className="w-4 h-4 text-cyan-300" />
              <span className="text-[9px] mt-0.5">
                {weaponHud.dashCooldownLeft > 0.05
                  ? `${weaponHud.dashCooldownLeft.toFixed(1)}s`
                  : "اندفاع"}
              </span>
            </button>
          </div>

          {/* Big Tactile Manual Fire Trigger */}
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              commandsRef.current.manualFiring = true;
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              commandsRef.current.manualFiring = false;
            }}
            onPointerCancel={() => {
              commandsRef.current.manualFiring = false;
            }}
            className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-500 via-rose-600 to-amber-600 border-4 border-white/80 shadow-[0_0_32px_rgba(244,63,94,0.65)] active:scale-90 transition-transform flex flex-col items-center justify-center text-white"
          >
            <Crosshair className="w-7 h-7" />
            <span className="text-[10px] font-black">إطلاق</span>
          </button>
        </div>
      )}

      {/* 8. Live Scoreboard Modal (Tap top score bar anytime) */}
      {scoreboardOpen && phase === "PLAYING" && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-cyan-500/40 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-black text-cyan-300 flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>ترتيب المقاتلين فـ الأرينا</span>
              </h3>
              <button
                onClick={() => setScoreboardOpen(false)}
                className="p-1.5 rounded-full bg-slate-800 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {sortedLeaderboard.map((u, idx) => (
                <div
                  key={u.id}
                  className={`px-3 py-2 rounded-xl flex items-center justify-between text-xs font-bold ${
                    u.id === myId
                      ? "bg-cyan-950/80 border border-cyan-400/60 text-white"
                      : "bg-slate-800/70 text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-black">#{idx + 1}</span>
                    <span>{u.nickname}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-emerald-300">{u.kills} K</span>
                    <span className="text-rose-300">{u.deaths} D</span>
                    <span className="text-amber-300">{u.score} pts</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 9. Match Mode & AI Settings Drawer (Host or Solo Player!) */}
      {settingsOpen && (
        <div className="fixed inset-0 z-40 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-cyan-400/40 p-5 shadow-2xl text-right">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-400" />
                <span>إعدادات بروتوكول كاربون 3D</span>
              </h3>
              <button
                onClick={() => setSettingsOpen(false)}
                className="p-1.5 rounded-full bg-slate-800 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-3">اختار طور المعركة (1 حتى 8 لاعبين):</p>
            <div className="space-y-2 mb-4">
              {(
                [
                  {
                    id: "FFA",
                    title: "🔥 حرب الكل ضد الكل (Deathmatch)",
                    desc: "أول مقاتل كيوصل لـ 15 إقصاء كيربح التاج!",
                  },
                  {
                    id: "SQUAD",
                    title: "⚡ حرب الفرق + نواة الأوفردرايف (4v4)",
                    desc: "فريق السايان ضد فريق الكريمسون! سيطرو على المنصة الوسطى",
                  },
                  {
                    id: "SURVIVAL",
                    title: "🤖 صمود الموجات التعاوني (Solo / Co-op)",
                    desc: "واجهو موجات الدرونات والعملاق المدرع GOLIATH مجموعين!",
                  },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleModeSwitch(m.id)}
                  className={`w-full p-3 rounded-2xl border text-right transition-all ${
                    mode === m.id
                      ? "bg-cyan-950/70 border-cyan-400 text-white"
                      : "bg-slate-950/60 border-white/10 text-slate-300 hover:border-white/30"
                  }`}
                >
                  <div className="text-sm font-black">{m.title}</div>
                  <div className="text-[11px] text-slate-400">{m.desc}</div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/10">
              <span className="text-xs font-bold text-slate-300">مستوى ذكاء البوتات:</span>
              <div className="flex gap-1.5">
                {(["NORMAL", "HARD", "CARBON"] as const).map((diff) => (
                  <button
                    key={diff}
                    onClick={() => handleModeSwitch(mode, diff)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black border ${
                      settings.botDifficulty === diff
                        ? "bg-amber-500/25 border-amber-400 text-amber-300"
                        : "bg-slate-800 border-white/10 text-slate-400"
                    }`}
                  >
                    {diff === "NORMAL" ? "عادي" : diff === "HARD" ? "محترف" : "كاربون 🔥"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 10. Post-Match MVP Victory Podium */}
      {phase === "GAME_OVER" && (
        <div className="fixed inset-0 z-40 bg-slate-950/88 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-amber-400/50 p-6 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center mx-auto mb-3">
              <Trophy className="w-9 h-9 text-amber-400" />
            </div>
            <h2 className="text-2xl font-black text-white mb-1">نهاية المعركة! ⚡</h2>
            <p className="text-sm font-bold text-amber-300 mb-5">
              {winnerSummaryAr || "انتهت معركة بروتوكول كاربون 3D!"}
            </p>

            <div className="space-y-2 mb-6 max-h-56 overflow-y-auto text-right">
              {sortedLeaderboard.slice(0, 8).map((u, idx) => (
                <div
                  key={u.id}
                  className={`px-3.5 py-2.5 rounded-xl flex items-center justify-between text-xs font-bold ${
                    idx === 0
                      ? "bg-amber-500/20 border border-amber-400/60 text-amber-200"
                      : u.id === myId
                      ? "bg-cyan-950/70 border border-cyan-400/40 text-cyan-200"
                      : "bg-slate-800/80 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-black">{idx === 0 ? "👑" : `#${idx + 1}`}</span>
                    <span>{u.nickname}</span>
                  </div>
                  <div className="font-mono flex items-center gap-3">
                    <span className="text-emerald-300">{u.kills} إقصاء</span>
                    <span className="text-amber-300">{u.score} نقطة</span>
                  </div>
                </div>
              ))}
            </div>

            {canConfigure ? (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={handleRestartMatch}
                  className="py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-sm shadow-lg active:scale-95"
                >
                  نعاودو جولة جديدة 🚀
                </button>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="py-3.5 rounded-2xl bg-slate-800 border border-white/15 text-slate-200 font-bold text-sm active:scale-95"
                >
                  بدّل الطور ⚙️
                </button>
              </div>
            ) : (
              <p className="text-xs font-bold text-slate-400 animate-pulse">
                كنتسناو مضيف الغرفة يبدا الجولة الجاية...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return isImmersive ? createPortal(ui, document.body) : ui;
}

export default Carbon3DGameView;
