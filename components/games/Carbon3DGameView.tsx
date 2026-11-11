"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import confetti from "canvas-confetti";
import {
  Crosshair,
  DoorOpen,
  Maximize2,
  Minimize2,
  RefreshCw,
  Settings2,
  Smartphone,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { isFullscreenActive, isIOS, isStandaloneApp } from "@/lib/fullscreen";
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
  AimStickState,
  Carbon3DArena,
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

const SHORT_WEAPON_AR: Record<string, string> = {
  CARBINE: "رشاش ⚡",
  SHOTGUN: "شوتغن 💥",
  RAILGUN: "قناص 🎯",
  LOBBER: "قاذف 🔮",
};

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
  const [iosFullscreenHelpOpen, setIosFullscreenHelpOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(sound.isMuted);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
    setIsFullscreen(isFullscreenActive() || isStandaloneApp());

    let wakeLock: any = null;
    if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
      (navigator as any).wakeLock
        .request("screen")
        .then((wl: any) => {
          wakeLock = wl;
        })
        .catch(() => {});
    }

    const onFs = () => setIsFullscreen(isFullscreenActive() || isStandaloneApp());
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs as EventListener);
    const clock = setInterval(() => setNowMs(Date.now()), 200);
    return () => {
      clearInterval(clock);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs as EventListener);
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

  const myInitial = initialCombatants[myId];
  const localPhysRef = useRef<LocalPlayerPhysicsState>({
    x: myInitial?.x ?? 0,
    y: myInitial?.y ?? 0,
    z: myInitial?.z ?? -15.8,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: myInitial?.yaw ?? 0,
    pitch: 0,
    isDashing: false,
    isAirborne: false,
  });

  const moveStickRef = useRef<{ dx: number; dz: number }>({ dx: 0, dz: 0 });
  const aimStickRef = useRef<AimStickState>({
    active: false,
    dx: 0,
    dz: 0,
    mag: 0,
    autoFireTap: false,
    manualReleaseShot: false,
    releaseDx: 0,
    releaseDz: 1,
    releaseMag: 0,
  });
  const commandsRef = useRef<ActiveShotCommand>({
    dashRequested: false,
    grenadeRequested: false,
    reloadRequested: false,
  });

  const remoteShotQueueRef = useRef<CarbonShotPacket[]>([]);
  const killBurstQueueRef = useRef<Array<{ x: number; y: number; z: number; colorHex: number }>>([]);
  const screenShakeRef = useRef<number>(0);

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
      setLiveKillFeed((prev) => [kill, ...prev].slice(0, 3));

      if (kill.killerId === myId) {
        carbonSfx.playKillConfirm(kill.streak);
        const callout =
          kill.streak >= 4
            ? "👑 سيطرة مطلقة! ما كيرحمش 🔥"
            : kill.streak === 3
            ? "⚡ تريبل كيل! شعلتي الساحة!"
            : kill.streak === 2
            ? "🔥 دبل كيل ناااضي!"
            : kill.isHeadshot
            ? "🎯 ضربة قاضية!"
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
      screenShakeRef.current = Math.max(screenShakeRef.current, shieldBroken ? 0.2 : 0.09);
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

  useEffect(() => {
    if (phase === "GAME_OVER") {
      carbonSfx.playKillConfirm(3);
      try {
        confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
      } catch {}
    }
  }, [phase]);

  // --- BRAWL-STARS TWIN-STICK TOUCH CONTROLS (LEFT MOVE STICK | RIGHT DUAL-MODE ATTACK STICK) ---
  const leftTouchRef = useRef<{ id: number; startX: number; startY: number } | null>(null);
  const rightTouchRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    maxDragMag: number;
  } | null>(null);

  const [leftStickVis, setLeftStickVis] = useState<{
    active: boolean;
    baseX: number;
    baseY: number;
    knobX: number;
    knobY: number;
  }>({ active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 });

  const [rightStickVis, setRightStickVis] = useState<{
    active: boolean;
    baseX: number;
    baseY: number;
    knobX: number;
    knobY: number;
    isAiming: boolean;
  }>({ active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, isAiming: false });

  const STICK_MAX_R = 50;

  const onLeftZonePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (leftTouchRef.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    leftTouchRef.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY };
    moveStickRef.current = { dx: 0, dz: 0 };
    setLeftStickVis({
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
    setLeftStickVis((s) => ({ ...s, knobX: kx, knobY: ky }));
  };

  const onLeftZonePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!leftTouchRef.current || leftTouchRef.current.id !== e.pointerId) return;
    leftTouchRef.current = null;
    moveStickRef.current = { dx: 0, dz: 0 };
    setLeftStickVis((s) => ({ ...s, active: false, knobX: 0, knobY: 0 }));
  };

  // Right Dual-Mode Attack Stick: Tap = Auto-Aim Fire | Drag = 360° Ground Telegraph Aim!
  const startRightStick = (pointerId: number, clientX: number, clientY: number, target: HTMLElement) => {
    if (rightTouchRef.current !== null) return;
    try {
      target.setPointerCapture(pointerId);
    } catch {}
    rightTouchRef.current = {
      id: pointerId,
      startX: clientX,
      startY: clientY,
      maxDragMag: 0,
    };
    aimStickRef.current.active = true;
    aimStickRef.current.dx = 0;
    aimStickRef.current.dz = 0;
    aimStickRef.current.mag = 0;
    setRightStickVis({
      active: true,
      baseX: clientX,
      baseY: clientY,
      knobX: 0,
      knobY: 0,
      isAiming: false,
    });
  };

  const moveRightStick = (pointerId: number, clientX: number, clientY: number) => {
    if (!rightTouchRef.current || rightTouchRef.current.id !== pointerId) return;
    const rawX = clientX - rightTouchRef.current.startX;
    const rawY = clientY - rightTouchRef.current.startY;
    const dist = Math.hypot(rawX, rawY);
    const clamped = Math.min(STICK_MAX_R, dist);
    const mag = clamped / STICK_MAX_R;
    rightTouchRef.current.maxDragMag = Math.max(rightTouchRef.current.maxDragMag, mag);

    const angle = Math.atan2(rawY, rawX);
    const kx = Math.cos(angle) * clamped;
    const ky = Math.sin(angle) * clamped;

    if (dist > 3) {
      aimStickRef.current.dx = Math.cos(angle);
      aimStickRef.current.dz = Math.sin(angle);
    }
    aimStickRef.current.mag = mag;
    setRightStickVis((s) => ({
      ...s,
      knobX: kx,
      knobY: ky,
      isAiming: mag >= 0.24,
    }));
  };

  const endRightStick = (pointerId: number) => {
    if (!rightTouchRef.current || rightTouchRef.current.id !== pointerId) return;
    const finalMag = aimStickRef.current.mag;
    const peakMag = rightTouchRef.current.maxDragMag;
    const rDx = aimStickRef.current.dx;
    const rDz = aimStickRef.current.dz;

    rightTouchRef.current = null;
    aimStickRef.current.active = false;
    aimStickRef.current.mag = 0;

    if (peakMag < 0.24) {
      // Quick-Tap -> Instant Auto-Aim Shot!
      aimStickRef.current.autoFireTap = true;
    } else if (finalMag >= 0.2) {
      // Dragged & Released outside inner cancel zone -> Fire along exact aimed vector!
      aimStickRef.current.manualReleaseShot = true;
      aimStickRef.current.releaseDx = rDx;
      aimStickRef.current.releaseDz = rDz;
      aimStickRef.current.releaseMag = finalMag;
    }

    setRightStickVis((s) => ({ ...s, active: false, knobX: 0, knobY: 0, isAiming: false }));
  };

  // Smart Fullscreen Toggle (Portrait + Landscape friendly on Android/Desktop; Safari guide on iPhone)
  const handleToggleFullscreen = async () => {
    if (isIOS() && !isStandaloneApp()) {
      window.scrollTo(0, 1);
      setIosFullscreenHelpOpen(true);
      return;
    }
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    try {
      if (!isFullscreenActive()) {
        if (el.requestFullscreen) {
          await el.requestFullscreen({ navigationUI: "hide" } as FullscreenOptions);
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      }
    } catch {
      setIosFullscreenHelpOpen(true);
    }
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

  const showDamageVignette = nowMs - damageFlash.at < 320;
  const showBanner = killBanner && nowMs - killBanner.at < 2200;
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
          ? "fixed inset-0 z-50 w-screen h-[100dvh] overflow-hidden bg-sky-400 select-none touch-none font-sans"
          : "relative w-full h-[78dvh] min-h-[500px] rounded-3xl border-2 border-sky-400/60 overflow-hidden bg-sky-400 select-none touch-none font-sans shadow-2xl"
      }
    >
      {/* 1. 60 FPS Bright Stylized Daylight 3D Arena */}
      <Carbon3DArena
        myId={myId}
        mode={mode}
        phase={phase}
        combatantsRef={combatantsRef}
        pickupsRef={pickupsRef}
        peersRef={peersRef}
        coreOwnerRef={coreOwnerRef}
        localPhysRef={localPhysRef}
        moveStickRef={moveStickRef}
        aimStickRef={aimStickRef}
        commandsRef={commandsRef}
        remoteShotQueueRef={remoteShotQueueRef}
        killBurstQueueRef={killBurstQueueRef}
        screenShakeRef={screenShakeRef}
        onLocalPosTick={sendLocalPos}
        onBroadcastShot={broadcastShot}
        onClaimHit={claimHit}
        onHudWeaponUpdate={setWeaponHud}
      />

      {/* 2. Subtle Damage Screen Vignette */}
      {showDamageVignette && (
        <div
          className={`pointer-events-none absolute inset-0 transition-opacity duration-200 ${
            damageFlash.shieldBroke
              ? "shadow-[inset_0_0_75px_rgba(14,165,233,0.75)]"
              : "shadow-[inset_0_0_70px_rgba(239,68,68,0.65)]"
          }`}
        />
      )}

      {/* 3. Full-Screen Split Twin-Stick Touch Zones (Left 50% Move | Right 50% Dual-Mode Aim/Shoot) */}
      {phase === "PLAYING" && (
        <>
          <div
            onPointerDown={onLeftZonePointerDown}
            onPointerMove={onLeftZonePointerMove}
            onPointerUp={onLeftZonePointerUp}
            onPointerCancel={onLeftZonePointerUp}
            className="absolute inset-y-12 left-0 w-1/2 z-10 touch-none"
          />
          <div
            onPointerDown={(e) => startRightStick(e.pointerId, e.clientX, e.clientY, e.currentTarget)}
            onPointerMove={(e) => moveRightStick(e.pointerId, e.clientX, e.clientY)}
            onPointerUp={(e) => endRightStick(e.pointerId)}
            onPointerCancel={(e) => endRightStick(e.pointerId)}
            className="absolute inset-y-12 right-0 w-1/2 z-10 touch-none"
          />
        </>
      )}

      {/* Floating Left Move Stick Visual */}
      {leftStickVis.active && (
        <div
          style={{
            left: leftStickVis.baseX - 54,
            top: leftStickVis.baseY - 54,
          }}
          className="pointer-events-none fixed z-20 w-[108px] h-[108px] rounded-full border-2 border-sky-300/80 bg-slate-900/35 backdrop-blur-xs flex items-center justify-center shadow-lg"
        >
          <div
            style={{
              transform: `translate(${leftStickVis.knobX}px, ${leftStickVis.knobY}px)`,
            }}
            className="w-11 h-11 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 border-2 border-white shadow-md"
          />
        </div>
      )}

      {/* Floating Right Dual-Mode Attack Stick Visual (while touching right half) */}
      {rightStickVis.active && (
        <div
          style={{
            left: rightStickVis.baseX - 56,
            top: rightStickVis.baseY - 56,
          }}
          className={`pointer-events-none fixed z-20 w-[112px] h-[112px] rounded-full border-2 flex items-center justify-center shadow-xl ${
            rightStickVis.isAiming
              ? "border-amber-300 bg-rose-950/40"
              : "border-rose-400/80 bg-slate-900/35"
          }`}
        >
          <div
            style={{
              transform: `translate(${rightStickVis.knobX}px, ${rightStickVis.knobY}px)`,
            }}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 border-2 border-white flex items-center justify-center text-white shadow-lg"
          >
            <Crosshair className="w-5 h-5" />
          </div>
        </div>
      )}

      {/* 4. Ultra-Compact Safe-Area Top Header (Zero Clipping on 360px Portrait & Landscape!) */}
      <div className="pointer-events-none absolute top-0 inset-x-0 z-30 pt-[max(0.5rem,env(safe-area-inset-top))] px-[max(0.6rem,env(safe-area-inset-right))] pl-[max(0.6rem,env(safe-area-inset-left))] flex items-center justify-between gap-1.5">
        {/* Right (RTL Start): Compact Score + Timer Pill (Tap for Scoreboard) */}
        <button
          type="button"
          onClick={() => setScoreboardOpen((v) => !v)}
          className="pointer-events-auto flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-md border border-white/25 rounded-2xl px-2.5 py-1.5 shadow-lg active:scale-95 min-w-0"
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isLive ? "bg-emerald-400" : "bg-sky-400"
            }`}
          />
          {mode === "SQUAD" ? (
            <div className="flex items-center gap-1 text-[11px] font-black whitespace-nowrap">
              <span className="text-sky-300">{teamScoresRef.current.CYAN}</span>
              <span className="text-slate-400">-</span>
              <span className="text-rose-400">{teamScoresRef.current.CRIMSON}</span>
            </div>
          ) : mode === "SURVIVAL" ? (
            <div className="flex items-center gap-1 text-[11px] font-black whitespace-nowrap">
              <span className="text-amber-300">🌊 {waveRef.current}</span>
              <span className="text-rose-300">({waveRemRef.current})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[11px] font-black min-w-0">
              <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-white truncate max-w-[74px] sm:max-w-[120px]">
                {sortedLeaderboard[0]?.nickname || "—"}
              </span>
              <span className="text-emerald-300 font-mono">
                {sortedLeaderboard[0]?.kills ?? 0}/{settings.targetKillsFFA || 15}
              </span>
            </div>
          )}

          {mode !== "SURVIVAL" && (
            <span
              dir="ltr"
              className="font-mono text-[11px] font-black px-1.5 py-0.5 rounded-lg bg-white/10 text-amber-200"
            >
              {mm}:{ss}
            </span>
          )}
        </button>

        {/* Left (RTL End): 4 Crisp Compact Icon Buttons (Fullscreen, Mode, Mute, Room) */}
        <div className="pointer-events-auto flex items-center gap-1 shrink-0">
          {canConfigure && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="w-9 h-9 rounded-xl bg-slate-900/80 border border-amber-400/50 text-amber-300 backdrop-blur-md flex items-center justify-center shadow-md active:scale-90"
              title="تبديل طور اللعب"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={toggleMute}
            className="w-9 h-9 rounded-xl bg-slate-900/80 border border-white/25 text-white backdrop-blur-md flex items-center justify-center shadow-md active:scale-90"
            title="الصوت"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-300" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsImmersive((v) => !v)}
            className="w-9 h-9 rounded-xl bg-slate-900/80 border border-white/25 text-slate-200 backdrop-blur-md flex items-center justify-center shadow-md active:scale-90"
            title={isImmersive ? "إظهار الغرفة وكود QR" : "تكبير اللعبة"}
          >
            <DoorOpen className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="h-9 px-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-[11px] flex items-center gap-1 shadow-md active:scale-90"
            title="ملء الشاشة الكاملة"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden xs:inline sm:inline">شاشة كاملة</span>
          </button>
        </div>
      </div>

      {/* Squad Central Zone Bar */}
      {mode === "SQUAD" && phase === "PLAYING" && (
        <div className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-20 w-44 bg-slate-900/75 border border-white/20 rounded-full p-1 backdrop-blur-xs">
          <div className="relative h-2 rounded-full bg-slate-700 overflow-hidden">
            <div
              style={{
                width: `${Math.abs(coreProgRef.current)}%`,
                right: coreProgRef.current >= 0 ? "50%" : undefined,
                left: coreProgRef.current < 0 ? "50%" : undefined,
              }}
              className={`h-full transition-all ${
                coreProgRef.current >= 0 ? "bg-sky-400" : "bg-rose-500"
              }`}
            />
          </div>
        </div>
      )}

      {/* Kill-Streak Hype Callout */}
      {showBanner && killBanner && (
        <div className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-30 text-center">
          <div className="px-4 py-1.5 rounded-2xl bg-slate-900/90 border-2 border-amber-400 shadow-xl">
            <p className="text-xs sm:text-sm font-black text-amber-300">{killBanner.text}</p>
            <p className="text-[10px] font-bold text-white">{killBanner.sub}</p>
          </div>
        </div>
      )}

      {/* Compact Killfeed */}
      {liveKillFeed.length > 0 && phase === "PLAYING" && (
        <div className="pointer-events-none absolute top-13 right-2.5 z-20 flex flex-col gap-1 max-w-[185px]">
          {liveKillFeed.map((kf) => (
            <div
              key={kf.id}
              className="px-2 py-0.5 rounded-lg bg-slate-900/70 border border-white/15 text-[10px] font-bold text-white flex items-center gap-1 backdrop-blur-xs"
            >
              <span className="text-emerald-300 truncate max-w-[68px]">{kf.killerName}</span>
              <span className="text-amber-300">⚡</span>
              <span className="text-rose-300 truncate max-w-[68px]">{kf.victimName}</span>
            </div>
          ))}
        </div>
      )}

      {/* Respawn Countdown Overlay */}
      {respawnLeftSec && phase === "PLAYING" && (
        <div className="pointer-events-none absolute inset-0 z-30 bg-slate-950/45 backdrop-blur-xs flex items-center justify-center">
          <div className="px-6 py-4 rounded-3xl bg-slate-900/95 border-2 border-amber-400 text-center shadow-2xl">
            <p className="text-base font-black text-white mb-0.5">راجعين للساحة! 🚀</p>
            <span className="font-mono text-3xl font-black text-amber-300">{respawnLeftSec}s</span>
          </div>
        </div>
      )}

      {/* 5. Zero-Overlap Ergonomic Bottom Controls (Portrait + Landscape Ready!) */}
      {phase === "PLAYING" && (
        <>
          {/* Idle Left Move Stick Visual Guide */}
          {!leftStickVis.active && (
            <div className="pointer-events-none absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-[max(1.1rem,env(safe-area-inset-left))] z-10 w-[82px] h-[82px] rounded-full border-2 border-white/35 bg-slate-900/25 flex items-center justify-center">
              <div className="w-9 h-9 rounded-full bg-sky-400/60 border-2 border-white/80" />
            </div>
          )}

          {/* Compact Center Weapon-Swap / Reload Pill (118px wide — never touches sticks!) */}
          <div className="pointer-events-auto absolute bottom-[max(1.45rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-30 flex items-center gap-1">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                if (swapLocalWeapon()) carbonSfx.playPickup();
                else commandsRef.current.reloadRequested = true;
              }}
              className="px-3 py-1.5 rounded-full bg-slate-900/85 border border-white/30 backdrop-blur-md shadow-lg flex items-center gap-1.5 text-[11px] font-black text-white active:scale-95"
            >
              <span>{SHORT_WEAPON_AR[weaponHud.weapon] || weaponHud.weapon}</span>
              <span className="font-mono text-amber-300">
                {weaponHud.isReloading ? "⏳" : `${weaponHud.ammo}`}
              </span>
              {weaponHud.secondaryWeapon && <RefreshCw className="w-3 h-3 text-sky-300" />}
            </button>
          </div>

          {/* Right Action Cluster: Dual-Mode Attack Stick + Arced Dash & Shock Bomb */}
          <div className="pointer-events-none absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.1rem,env(safe-area-inset-right))] z-30">
            {/* EMP Shock Bomb (Diagonally Up-Left of Attack Stick) */}
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                commandsRef.current.grenadeRequested = true;
              }}
              disabled={weaponHud.grenadeCooldownLeft > 0.05}
              className={`pointer-events-auto absolute -top-11 right-[76px] w-11 h-11 rounded-full border-2 flex flex-col items-center justify-center font-black shadow-lg transition-transform active:scale-90 ${
                weaponHud.grenadeCooldownLeft > 0.05
                  ? "bg-slate-900/75 border-slate-600 text-slate-400"
                  : "bg-sky-500 border-white text-white"
              }`}
            >
              <span className="text-sm leading-none">💣</span>
              {weaponHud.grenadeCooldownLeft > 0.05 && (
                <span className="text-[8px] font-mono">
                  {weaponHud.grenadeCooldownLeft.toFixed(0)}s
                </span>
              )}
            </button>

            {/* Jet-Dash (Directly Above Attack Stick) */}
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                commandsRef.current.dashRequested = true;
              }}
              disabled={weaponHud.dashCooldownLeft > 0.05}
              className={`pointer-events-auto absolute -top-[62px] right-2 w-12 h-12 rounded-full border-2 flex flex-col items-center justify-center font-black shadow-lg transition-transform active:scale-90 ${
                weaponHud.dashCooldownLeft > 0.05
                  ? "bg-slate-900/75 border-slate-600 text-slate-400"
                  : "bg-emerald-500 border-white text-slate-950"
              }`}
            >
              <Zap className="w-5 h-5" />
              {weaponHud.dashCooldownLeft > 0.05 && (
                <span className="text-[8px] font-mono text-white">
                  {weaponHud.dashCooldownLeft.toFixed(1)}s
                </span>
              )}
            </button>

            {/* Anchored Dual-Mode Attack Stick (Tap = Auto-Aim 🎯 | Drag = Manual Aim!) */}
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                startRightStick(e.pointerId, e.clientX, e.clientY, e.currentTarget);
              }}
              onPointerMove={(e) => moveRightStick(e.pointerId, e.clientX, e.clientY)}
              onPointerUp={(e) => endRightStick(e.pointerId)}
              onPointerCancel={(e) => endRightStick(e.pointerId)}
              className={`pointer-events-auto w-[84px] h-[84px] rounded-full border-4 border-white shadow-[0_6px_24px_rgba(244,63,94,0.55)] flex flex-col items-center justify-center text-white transition-transform ${
                rightStickVis.active
                  ? "scale-95 bg-rose-600/70"
                  : "bg-gradient-to-br from-rose-500 via-red-500 to-amber-500"
              }`}
            >
              <Crosshair className="w-7 h-7" />
              <span className="text-[9px] font-black leading-none mt-0.5">اضغط / اسحب</span>
            </div>
          </div>
        </>
      )}

      {/* 6. iPhone Safari Fullscreen & Hide-Toolbar Helper Modal */}
      {iosFullscreenHelpOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIosFullscreenHelpOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-slate-900 border-2 border-amber-400 p-5 text-right space-y-3.5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-amber-300 flex items-center gap-1.5">
                <Smartphone className="w-5 h-5" />
                <span>شاشة كاملة فـ iPhone</span>
              </h3>
              <button
                type="button"
                onClick={() => setIosFullscreenHelpOpen(false)}
                className="p-1.5 rounded-full bg-slate-800 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-800/90 border border-white/10 space-y-1">
              <p className="text-xs font-black text-emerald-300">
                ⚡ حل سريع وسط Safari (ضغطة وحدة):
              </p>
              <p className="text-xs text-slate-200 leading-relaxed">
                كليكي على الأيقونة <strong>[=]</strong> (أو <strong>عA</strong>) اللي كاينة حدا{" "}
                <span dir="ltr" className="font-mono text-sky-300">
                  jma3a.vercel.app
                </span>{" "}
                واختار <strong>&quot;إخفاء شريط الأدوات / Hide Toolbar&quot;</strong>!
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-800/90 border border-white/10 space-y-1">
              <p className="text-xs font-black text-amber-300">
                🏆 شاشة كاملة 100% بحال تطبيق (الأفضل!):
              </p>
              <p className="text-xs text-slate-200 leading-relaxed">
                كليكي على زر المشاركة <strong>(Share ⬆️)</strong> واختار{" "}
                <strong>&quot;Add to Home Screen / إضافة إلى الشاشة الرئيسية&quot;</strong> وحلّ
                JMA3A منها بلا حتى شريط!
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIosFullscreenHelpOpen(false)}
              className="w-full py-3 rounded-2xl bg-amber-400 text-slate-950 font-black text-sm active:scale-95"
            >
              واخا، يالاه نلعبو! 🎮
            </button>
          </div>
        </div>
      )}

      {/* 7. Live Scoreboard Modal */}
      {scoreboardOpen && phase === "PLAYING" && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setScoreboardOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-slate-900 border-2 border-sky-400/50 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-black text-sky-300 flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>ترتيب الأبطال ({humanCount <= 1 ? "وضع فردي" : "ويفي مباشر"})</span>
              </h3>
              <button
                type="button"
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
                      ? "bg-emerald-950/80 border border-emerald-400/60 text-white"
                      : "bg-slate-800/80 text-slate-200"
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

      {/* 8. Match Mode & Difficulty Drawer */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-slate-900 border-2 border-amber-400/60 p-5 shadow-2xl text-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span>أطوار الساحة (1 حتى 8 لاعبين)</span>
              </h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="p-1.5 rounded-full bg-slate-800 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 mb-4">
              {(
                [
                  {
                    id: "FFA",
                    title: "🔥 الكل ضد الكل (Showdown)",
                    desc: "أول بطل كيوصل لـ 15 إقصاء كيربح التاج!",
                  },
                  {
                    id: "SQUAD",
                    title: "⚡ حرب الفرق (4 ضد 4)",
                    desc: "الفريق الأزرق ضد الفريق الأحمر + السيطرة على الوسط!",
                  },
                  {
                    id: "SURVIVAL",
                    title: "🤖 صمود الموجات التعاوني (Solo / Co-op)",
                    desc: "تعاونو ضد موجات الدرونات والعملاق GOLIATH!",
                  },
                ] as const
              ).map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => handleModeSwitch(m.id)}
                  className={`w-full p-3 rounded-2xl border text-right transition-all ${
                    mode === m.id
                      ? "bg-sky-950/80 border-sky-400 text-white"
                      : "bg-slate-800/60 border-white/10 text-slate-300"
                  }`}
                >
                  <div className="text-sm font-black">{m.title}</div>
                  <div className="text-[11px] text-slate-400">{m.desc}</div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/10">
              <span className="text-xs font-bold text-slate-300">مستوى البوتات:</span>
              <div className="flex gap-1.5">
                {(["NORMAL", "HARD", "CARBON"] as const).map((diff) => (
                  <button
                    type="button"
                    key={diff}
                    onClick={() => handleModeSwitch(mode, diff)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black border ${
                      settings.botDifficulty === diff
                        ? "bg-amber-400 text-slate-950 border-amber-300"
                        : "bg-slate-800 border-white/10 text-slate-300"
                    }`}
                  >
                    {diff === "NORMAL" ? "عادي" : diff === "HARD" ? "محترف" : "أسطوري 🔥"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. Post-Match Victory Podium */}
      {phase === "GAME_OVER" && (
        <div className="fixed inset-0 z-40 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border-2 border-amber-400 p-6 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-400/60 flex items-center justify-center mx-auto mb-3">
              <Trophy className="w-9 h-9 text-amber-400" />
            </div>
            <h2 className="text-2xl font-black text-white mb-1">نهاية المعركة! 🏆</h2>
            <p className="text-sm font-bold text-amber-300 mb-4">
              {winnerSummaryAr || "سالات الجولة!"}
            </p>

            <div className="space-y-1.5 mb-5 max-h-52 overflow-y-auto text-right">
              {sortedLeaderboard.slice(0, 8).map((u, idx) => (
                <div
                  key={u.id}
                  className={`px-3.5 py-2 rounded-xl flex items-center justify-between text-xs font-bold ${
                    idx === 0
                      ? "bg-amber-500/20 border border-amber-400 text-amber-200"
                      : u.id === myId
                      ? "bg-emerald-950/70 border border-emerald-400/50 text-emerald-200"
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
                  type="button"
                  onClick={handleRestartMatch}
                  className="py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-sm shadow-lg active:scale-95"
                >
                  جولة جديدة 🚀
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="py-3 rounded-2xl bg-slate-800 border border-white/15 text-slate-200 font-bold text-sm active:scale-95"
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
