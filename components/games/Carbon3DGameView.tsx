"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import confetti from "canvas-confetti";
import {
  Crosshair,
  DoorOpen,
  Focus,
  Maximize2,
  Minimize2,
  RefreshCw,
  Settings2,
  Smartphone,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { isFullscreenActive, isIOS, isStandaloneApp } from "@/lib/fullscreen";
import { sound } from "@/lib/sound";
import { ARENA_HALF, HARDPOINT_ZONES } from "@/games/carbon3d/arenaLayout";
import {
  CARBON_WEAPONS,
  CarbonAction,
  CarbonBarrelExplodePacket,
  CarbonBarrelState,
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
  LocalWeaponHudState,
  TpsLookInputState,
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
  CARBINE: "رشاش M4 🔫",
  SHOTGUN: "شوتغن M870 💥",
  RAILGUN: "قناص AWP 🎯",
  LOBBER: "قاذف M32 🚀",
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
  const [autoFireAssist, setAutoFireAssist] = useState(false);
  const [adsToggled, setAdsToggled] = useState(false);
  const [isDesktopFinePointer, setIsDesktopFinePointer] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
    setIsFullscreen(isFullscreenActive() || isStandaloneApp());
    setIsDesktopFinePointer(Boolean(window.matchMedia?.("(pointer: fine)").matches));

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
  const endsAt = Number(publicData?.endsAt ?? Date.now() + 270_000);
  const settings = (publicData?.settings as CarbonSettings) || {
    mode: "FFA",
    botFill: false,
    botDifficulty: "HARD",
    targetKillsFFA: 15,
    targetScoreSquad: 100,
    matchDurationSec: 270,
  };
  const initialCombatants =
    (publicData?.combatants as Record<string, CarbonCombatant>) || {};
  const initialPickups = (publicData?.pickups as CarbonPickupPad[]) || [];
  const initialBarrels = (publicData?.barrels as CarbonBarrelState[]) || [];
  const winnerSummaryAr = (publicData?.winnerSummaryAr as string | null) || null;

  // Strict Player Identity Resolution: NEVER fall back to another human's ID when activePlayerId is known!
  const myId = useMemo(() => {
    const candidate = (activePlayerId || String(privateData?.myStrikerId ?? "")).trim();
    if (candidate) return candidate;
    const firstHuman = Object.values(initialCombatants).find((u) => !u.isBot);
    return firstHuman?.id || "p_local";
  }, [activePlayerId, privateData?.myStrikerId, initialCombatants]);

  const myInitial = initialCombatants[myId];
  const localPhysRef = useRef<LocalPlayerPhysicsState>({
    x: myInitial?.x ?? -6.5,
    y: myInitial?.y ?? 0,
    z: myInitial?.z ?? -31.5,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: myInitial?.yaw ?? 0,
    pitch: -0.05,
    isDashing: false,
    isAirborne: false,
    isSprinting: false,
  });

  const moveStickRef = useRef<{ dx: number; dz: number }>({ dx: 0, dz: 0 });
  const lookInputRef = useRef<TpsLookInputState>({
    deltaYaw: 0,
    deltaPitch: 0,
    fireHeld: false,
    fireTap: false,
    isAds: false,
    autoFireAssist: false,
  });
  lookInputRef.current.isAds = adsToggled;
  lookInputRef.current.autoFireAssist = autoFireAssist;

  const commandsRef = useRef<ActiveShotCommand>({
    dashRequested: false,
    jumpRequested: false,
    grenadeRequested: false,
    reloadRequested: false,
  });

  const remoteShotQueueRef = useRef<CarbonShotPacket[]>([]);
  const barrelBoomQueueRef = useRef<CarbonBarrelExplodePacket[]>([]);
  const killBurstQueueRef = useRef<Array<{ x: number; y: number; z: number; colorHex: number }>>([]);
  const screenShakeRef = useRef<number>(0);

  const [weaponHud, setWeaponHud] = useState<LocalWeaponHudState>({
    weapon: "CARBINE",
    secondaryWeapon: "SHOTGUN",
    ammo: 30,
    maxAmmo: 30,
    isReloading: false,
    dashCooldownLeft: 0,
    grenadeCooldownLeft: 0,
    hasTargetLock: false,
    isAdsActive: false,
    pointerLocked: false,
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

  const handleBarrelExplode = useCallback((boom: CarbonBarrelExplodePacket) => {
    barrelBoomQueueRef.current.push(boom);
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
          kill.weapon === "BARREL"
            ? "🛢️💥 تفجير برميل قاتل!"
            : kill.streak >= 4
            ? "👑 سيطرة مطلقة! كوماندوز لا يقهر 🔥"
            : kill.streak === 3
            ? "⚡ تريبل كيل! فرقة النخبة!"
            : kill.streak === 2
            ? "🔥 دبل كيل تكتيكي!"
            : kill.isHeadshot
            ? "🎯 قنصة فـ الراس (Headshot)!"
            : "🪖 تم تحييد الهدف (+10)!";
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
      screenShakeRef.current = Math.max(screenShakeRef.current, shieldBroken ? 0.2 : 0.08);
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
    localPhysRef.current.pitch = -0.05;
    setAdsToggled(false);
  }, []);

  const {
    isLive,
    hudTick,
    combatantsRef,
    pickupsRef,
    barrelsRef,
    gemsRef,
    hardpointIndexRef,
    peersRef,
    waveRef,
    waveRemRef,
    coreOwnerRef,
    teamScoresRef,
    sendLocalPos,
    broadcastShot,
    claimHit,
    claimBarrelHit,
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
    initialBarrels,
    localPhysRef,
    onRemoteShot: handleRemoteShot,
    onKillEvent: handleKillEvent,
    onBarrelExplode: handleBarrelExplode,
    onDamageTaken: handleDamageTaken,
    onRespawnLocal: handleRespawnLocal,
    onAction,
    onRefresh,
  });

  // Desktop Weapon Swap Keys (Q / 1 / 2)
  useEffect(() => {
    const onSwapKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "1" || k === "2" || k === "x") {
        swapLocalWeapon();
      }
    };
    window.addEventListener("keydown", onSwapKey);
    return () => window.removeEventListener("keydown", onSwapKey);
  }, [swapLocalWeapon]);

  useEffect(() => {
    if (phase === "GAME_OVER") {
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      carbonSfx.playKillConfirm(3);
      try {
        confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
      } catch {}
    }
  }, [phase]);

  // --- UN-STICKABLE MOBILE MULTI-TOUCH SYSTEM: LEFT THUMBSTICK + RIGHT FREE-LOOK + DRAG-FIRE BUTTON ---
  const leftTouchRef = useRef<{ id: number; startX: number; startY: number } | null>(null);
  const lookTouchRef = useRef<{ id: number; lastX: number; lastY: number } | null>(null);
  const fireTouchRef = useRef<{ id: number; lastX: number; lastY: number } | null>(null);

  const [leftStickVis, setLeftStickVis] = useState<{
    active: boolean;
    baseX: number;
    baseY: number;
    knobX: number;
    knobY: number;
    sprinting: boolean;
  }>({ active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, sprinting: false });

  const [fireBtnPressed, setFireBtnPressed] = useState(false);

  const STICK_MAX_R = 52;

  const resetLeftStick = useCallback(() => {
    leftTouchRef.current = null;
    moveStickRef.current = { dx: 0, dz: 0 };
    setLeftStickVis({ active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, sprinting: false });
  }, []);

  const updateLeftStickCoords = useCallback((clientX: number, clientY: number) => {
    if (!leftTouchRef.current) return;
    const rawX = clientX - leftTouchRef.current.startX;
    const rawY = clientY - leftTouchRef.current.startY;
    const dist = Math.hypot(rawX, rawY);
    const clamped = Math.min(STICK_MAX_R, dist);
    const angle = Math.atan2(rawY, rawX);
    const kx = dist > 1 ? Math.cos(angle) * clamped : 0;
    const ky = dist > 1 ? Math.sin(angle) * clamped : 0;
    const dx = kx / STICK_MAX_R;
    const dz = ky / STICK_MAX_R;
    moveStickRef.current = { dx, dz };
    setLeftStickVis((s) => ({
      ...s,
      knobX: kx,
      knobY: ky,
      sprinting: -dz > 0.55 && Math.hypot(dx, dz) > 0.88,
    }));
  }, []);

  const beginLeftStick = useCallback((id: number, clientX: number, clientY: number) => {
    leftTouchRef.current = { id, startX: clientX, startY: clientY };
    moveStickRef.current = { dx: 0, dz: 0 };
    setLeftStickVis({
      active: true,
      baseX: clientX,
      baseY: clientY,
      knobX: 0,
      knobY: 0,
      sprinting: false,
    });
  }, []);

  // Global Hardware Touch Reconciler (Prevents Stuck Joysticks or Stuck Fire on iOS/Android!)
  useEffect(() => {
    const reconcileTouches = (e: TouchEvent) => {
      const liveIds = new Set<number>();
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        liveIds.add(t.identifier);
        if (leftTouchRef.current && leftTouchRef.current.id === t.identifier) {
          updateLeftStickCoords(t.clientX, t.clientY);
        }
        if (lookTouchRef.current && lookTouchRef.current.id === t.identifier) {
          const dx = t.clientX - lookTouchRef.current.lastX;
          const dy = t.clientY - lookTouchRef.current.lastY;
          lookTouchRef.current.lastX = t.clientX;
          lookTouchRef.current.lastY = t.clientY;
          lookInputRef.current.deltaYaw -= dx * 0.0054;
          lookInputRef.current.deltaPitch -= dy * 0.0042;
        }
        if (fireTouchRef.current && fireTouchRef.current.id === t.identifier) {
          const dx = t.clientX - fireTouchRef.current.lastX;
          const dy = t.clientY - fireTouchRef.current.lastY;
          fireTouchRef.current.lastX = t.clientX;
          fireTouchRef.current.lastY = t.clientY;
          lookInputRef.current.deltaYaw -= dx * 0.0046;
          lookInputRef.current.deltaPitch -= dy * 0.0038;
        }
      }

      if (leftTouchRef.current && !liveIds.has(leftTouchRef.current.id)) {
        resetLeftStick();
      }
      if (lookTouchRef.current && !liveIds.has(lookTouchRef.current.id)) {
        lookTouchRef.current = null;
      }
      if (fireTouchRef.current && !liveIds.has(fireTouchRef.current.id)) {
        fireTouchRef.current = null;
        lookInputRef.current.fireHeld = false;
        setFireBtnPressed(false);
      }
    };

    const forceResetAll = () => {
      resetLeftStick();
      lookTouchRef.current = null;
      fireTouchRef.current = null;
      lookInputRef.current.fireHeld = false;
      setFireBtnPressed(false);
    };

    const onVisChange = () => {
      if (document.hidden) forceResetAll();
    };

    window.addEventListener("touchmove", reconcileTouches, { passive: true });
    window.addEventListener("touchend", reconcileTouches, { passive: true });
    window.addEventListener("touchcancel", reconcileTouches, { passive: true });
    window.addEventListener("blur", forceResetAll);
    document.addEventListener("visibilitychange", onVisChange);

    return () => {
      window.removeEventListener("touchmove", reconcileTouches);
      window.removeEventListener("touchend", reconcileTouches);
      window.removeEventListener("touchcancel", reconcileTouches);
      window.removeEventListener("blur", forceResetAll);
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [resetLeftStick, updateLeftStickCoords]);

  useEffect(() => {
    if (phase !== "PLAYING") {
      resetLeftStick();
      lookTouchRef.current = null;
      fireTouchRef.current = null;
      lookInputRef.current.fireHeld = false;
      setFireBtnPressed(false);
    }
  }, [phase, resetLeftStick]);

  const onLeftZoneTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (leftTouchRef.current) return;
    const t = e.changedTouches[0];
    if (!t) return;
    beginLeftStick(t.identifier, t.clientX, t.clientY);
  };

  const onRightLookTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (lookTouchRef.current) return;
    const t = e.changedTouches[0];
    if (!t) return;
    lookTouchRef.current = {
      id: t.identifier,
      lastX: t.clientX,
      lastY: t.clientY,
    };
  };

  const onFireBtnTouchStart = (e: React.TouchEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const t = e.changedTouches[0];
    if (!t) return;
    fireTouchRef.current = {
      id: t.identifier,
      lastX: t.clientX,
      lastY: t.clientY,
    };
    lookInputRef.current.fireHeld = true;
    lookInputRef.current.fireTap = true;
    setFireBtnPressed(true);
  };

  const onFireBtnTouchEnd = (e: React.TouchEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!fireTouchRef.current) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === fireTouchRef.current.id) {
        fireTouchRef.current = null;
        lookInputRef.current.fireHeld = false;
        setFireBtnPressed(false);
        break;
      }
    }
  };

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
  const sortedLeaderboard = [...allUnits].sort((a, b) =>
    mode === "SURVIVAL"
      ? b.kills - a.kills || b.score - a.score
      : (b.gems || 0) - (a.gems || 0) || b.kills - a.kills || b.score - a.score
  );
  const humanCount = allUnits.filter((u) => !u.isBot).length;
  const canConfigure = isHost || humanCount <= 1;

  const secRemaining = Math.max(0, Math.ceil((endsAt - nowMs) / 1000));
  const mm = String(Math.floor(secRemaining / 60)).padStart(2, "0");
  const ss = String(secRemaining % 60).padStart(2, "0");

  const activeHardpoint =
    HARDPOINT_ZONES[hardpointIndexRef.current % HARDPOINT_ZONES.length] || HARDPOINT_ZONES[0];

  const showDamageVignette = nowMs - damageFlash.at < 320;
  const showBanner = killBanner && nowMs - killBanner.at < 2200;
  const respawnLeftSec =
    myUnit && !myUnit.isAlive && myUnit.respawnAt > nowMs
      ? ((myUnit.respawnAt - nowMs) / 1000).toFixed(1)
      : null;

  const isSniperScoped =
    phase === "PLAYING" &&
    Boolean(myUnit?.isAlive) &&
    weaponHud.isAdsActive &&
    weaponHud.weapon === "RAILGUN";

  if (!mounted) return null;

  // Mini-map coordinate mapper: [-48, +48] -> [6, 70] in 76x76 radar box
  const toRadarCoord = (val: number) => 38 + (val / ARENA_HALF) * 32;

  const ui = (
    <div
      dir="rtl"
      className={
        isImmersive
          ? "fixed inset-0 z-50 w-screen h-[100dvh] overflow-hidden bg-slate-950 select-none touch-none font-sans"
          : "relative w-full h-[80dvh] min-h-[520px] rounded-3xl border-2 border-sky-400/60 overflow-hidden bg-slate-950 select-none touch-none font-sans shadow-2xl"
      }
    >
      {/* 1. 60FPS Coastal Military Outpost Over-the-Shoulder TPS Engine */}
      <Carbon3DArena
        myId={myId}
        mode={mode}
        phase={phase}
        combatantsRef={combatantsRef}
        pickupsRef={pickupsRef}
        barrelsRef={barrelsRef}
        gemsRef={gemsRef}
        hardpointIndexRef={hardpointIndexRef}
        peersRef={peersRef}
        coreOwnerRef={coreOwnerRef}
        localPhysRef={localPhysRef}
        moveStickRef={moveStickRef}
        lookInputRef={lookInputRef}
        commandsRef={commandsRef}
        remoteShotQueueRef={remoteShotQueueRef}
        barrelBoomQueueRef={barrelBoomQueueRef}
        killBurstQueueRef={killBurstQueueRef}
        screenShakeRef={screenShakeRef}
        onLocalPosTick={sendLocalPos}
        onBroadcastShot={broadcastShot}
        onClaimHit={claimHit}
        onClaimBarrelHit={claimBarrelHit}
        onHudWeaponUpdate={setWeaponHud}
      />

      {/* 2. AWP Sniper Scope Reticle Overlay (when ADS with RAILGUN) */}
      {isSniperScoped && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_36%,rgba(2,6,23,0.92)_66%)]" />
          <div className="relative w-[min(78vw,78vh)] h-[min(78vw,78vh)] rounded-full border-2 border-rose-400/70 shadow-[0_0_60px_rgba(0,0,0,0.95)] flex items-center justify-center">
            <div className="absolute inset-x-0 h-[1px] bg-rose-400/75" />
            <div className="absolute inset-y-0 w-[1px] bg-rose-400/75" />
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_10px_#f43f5e]" />
          </div>
        </div>
      )}

      {/* 3. Center Tactical TPS Crosshair + Hitmarker */}
      {phase === "PLAYING" && myUnit?.isAlive && !isSniperScoped && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            {/* Center Precision Dot */}
            <div
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                weaponHud.hasTargetLock
                  ? "bg-rose-400 shadow-[0_0_8px_#f43f5e]"
                  : "bg-white shadow-[0_0_4px_rgba(0,0,0,0.9)]"
              }`}
            />
            {/* 4 Dynamic Spread Ticks */}
            {(() => {
              const gap = weaponHud.isAdsActive ? 7 : weaponHud.hasTargetLock ? 10 : 14;
              const tickColor = weaponHud.hasTargetLock ? "bg-rose-400" : "bg-white/90";
              return (
                <>
                  <span
                    style={{ transform: `translateY(-${gap}px)` }}
                    className={`absolute w-[2px] h-2.5 rounded-full ${tickColor} shadow`}
                  />
                  <span
                    style={{ transform: `translateY(${gap}px)` }}
                    className={`absolute w-[2px] h-2.5 rounded-full ${tickColor} shadow`}
                  />
                  <span
                    style={{ transform: `translateX(-${gap}px)` }}
                    className={`absolute h-[2px] w-2.5 rounded-full ${tickColor} shadow`}
                  />
                  <span
                    style={{ transform: `translateX(${gap}px)` }}
                    className={`absolute h-[2px] w-2.5 rounded-full ${tickColor} shadow`}
                  />
                </>
              );
            })()}

            {/* Crisp Hitmarker X on Impact */}
            {weaponHud.lastHitIsCrit > 0 && (
              <div
                className={`absolute w-7 h-7 rotate-45 border-2 pointer-events-none ${
                  weaponHud.lastHitIsCrit === 2
                    ? "border-amber-300 scale-125"
                    : "border-rose-400"
                }`}
              />
            )}
          </div>
        </div>
      )}

      {/* 4. Subtle Damage Screen Vignette */}
      {showDamageVignette && (
        <div
          className={`pointer-events-none absolute inset-0 z-20 transition-opacity duration-200 ${
            damageFlash.shieldBroke
              ? "shadow-[inset_0_0_80px_rgba(56,189,248,0.8)]"
              : "shadow-[inset_0_0_75px_rgba(239,68,68,0.7)]"
          }`}
        />
      )}

      {/* 5. Mobile Split Touch Zones: Left Floating Stick + Right Free-Look Camera Swipe */}
      {phase === "PLAYING" && !isDesktopFinePointer && (
        <>
          <div
            onTouchStart={onLeftZoneTouchStart}
            className="absolute top-14 bottom-4 left-0 w-[46%] z-10 touch-none"
          />
          <div
            onTouchStart={onRightLookTouchStart}
            className="absolute top-14 bottom-4 right-0 w-[54%] z-10 touch-none"
          />
        </>
      )}

      {/* Desktop PointerLock Prompt Pill */}
      {phase === "PLAYING" && isDesktopFinePointer && !weaponHud.pointerLocked && (
        <div className="pointer-events-none absolute top-14 inset-x-0 z-25 flex justify-center px-3">
          <div className="px-3.5 py-1.5 rounded-full bg-slate-950/80 border border-sky-400/50 text-[11px] font-bold text-sky-200 backdrop-blur-md shadow-lg">
            🖱️ كليكي وسط الشاشة باش تصوّب بالماوس + تحرّك بـ WASD + كليك يمين للمنظار (Esc للخروج)
          </div>
        </div>
      )}

      {/* Floating Left Move / Sprint Thumbstick Visual */}
      {leftStickVis.active && (
        <div
          style={{
            left: leftStickVis.baseX - 54,
            top: leftStickVis.baseY - 54,
          }}
          className={`pointer-events-none fixed z-25 w-[108px] h-[108px] rounded-full border-2 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center shadow-lg ${
            leftStickVis.sprinting ? "border-emerald-400" : "border-sky-300/75"
          }`}
        >
          <div
            style={{
              transform: `translate(${leftStickVis.knobX}px, ${leftStickVis.knobY}px)`,
            }}
            className={`w-11 h-11 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[11px] font-black text-white ${
              leftStickVis.sprinting
                ? "bg-gradient-to-br from-emerald-400 to-teal-600"
                : "bg-gradient-to-br from-sky-400 to-blue-600"
            }`}
          >
            {leftStickVis.sprinting ? "🏃" : ""}
          </div>
        </div>
      )}

      {/* 6. Top Safe-Area Tactical HUD Bar + Live 96x96m Mini-Radar */}
      <div className="pointer-events-none absolute top-0 inset-x-0 z-30 pt-[max(0.5rem,env(safe-area-inset-top))] px-[max(0.6rem,env(safe-area-inset-right))] pl-[max(0.6rem,env(safe-area-inset-left))] flex items-start justify-between gap-2">
        {/* Right (RTL Start): Live Status + Scoreboard Pill + Active Hardpoint Callout */}
        <div className="flex flex-col items-start gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => setScoreboardOpen((v) => !v)}
            className="pointer-events-auto flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md border border-white/20 rounded-2xl px-2.5 py-1.5 shadow-lg active:scale-95 min-w-0"
          >
            <span
              title={isLive ? "متصل مباشرة بالويفي" : "جاري الاتصال..."}
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isLive
                  ? "bg-emerald-400 shadow-[0_0_8px_#34d399]"
                  : "bg-amber-400 animate-pulse"
              }`}
            />
            {mode === "SQUAD" ? (
              <div className="flex items-center gap-1.5 text-[11px] font-black whitespace-nowrap">
                <span>🚩</span>
                <span className="text-sky-300">{teamScoresRef.current.CYAN}</span>
                <span className="text-slate-500">/100</span>
                <span className="text-slate-400">-</span>
                <span className="text-rose-400">{teamScoresRef.current.CRIMSON}</span>
              </div>
            ) : mode === "SURVIVAL" ? (
              <div className="flex items-center gap-1 text-[11px] font-black whitespace-nowrap">
                <span className="text-amber-300">🪖 موجة {waveRef.current}</span>
                <span className="text-rose-300">({waveRemRef.current})</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] font-black min-w-0">
                <span className="px-1.5 py-0.5 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-200 font-mono whitespace-nowrap">
                  🚩 {myUnit?.gems ?? 0}/100
                </span>
                <span className="text-white truncate max-w-[72px] sm:max-w-[115px]">
                  👑 {sortedLeaderboard[0]?.nickname || "—"}
                </span>
                <span className="text-amber-300 font-mono whitespace-nowrap">
                  ({sortedLeaderboard[0]?.kills ?? 0}💀)
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

          {/* Active Rotating Hardpoint Indicator */}
          {mode !== "SURVIVAL" && phase === "PLAYING" && (
            <div className="px-2.5 py-1 rounded-xl bg-slate-950/75 border border-amber-400/35 backdrop-blur-md text-[10px] font-black text-amber-200 shadow">
              📍 المنطقة النشطة: {activeHardpoint.nameAr}
            </div>
          )}
        </div>

        {/* Left (RTL End): Controls + Auto-Fire Toggle + Mini-Radar */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="pointer-events-auto flex items-center gap-1">
            {!isDesktopFinePointer && (
              <button
                type="button"
                onClick={() => setAutoFireAssist((v) => !v)}
                className={`px-2 py-1.5 rounded-xl border text-[10px] font-black transition active:scale-95 ${
                  autoFireAssist
                    ? "bg-emerald-500/30 border-emerald-400 text-emerald-200"
                    : "bg-slate-950/80 border-white/20 text-slate-300"
                }`}
              >
                {autoFireAssist ? "🎯 تلقائي" : "🎯 يدوي"}
              </button>
            )}

            {canConfigure && (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label="إعدادات المعركة"
                className="w-8 h-8 rounded-xl bg-slate-950/80 backdrop-blur-md border border-white/20 text-white flex items-center justify-center active:scale-90"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={toggleMute}
              aria-label="الصوت"
              className="w-8 h-8 rounded-xl bg-slate-950/80 backdrop-blur-md border border-white/20 text-white flex items-center justify-center active:scale-90"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setIsImmersive((v) => !v)}
              title="الغرفة والكود"
              className="w-8 h-8 rounded-xl bg-slate-950/80 backdrop-blur-md border border-white/20 text-sky-300 flex items-center justify-center active:scale-90"
            >
              <DoorOpen className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleToggleFullscreen}
              className={`h-8 px-2 rounded-xl border flex items-center gap-1 text-[11px] font-black shadow-md active:scale-95 ${
                isFullscreen
                  ? "bg-slate-950/80 border-white/20 text-white"
                  : "bg-amber-400 border-amber-200 text-slate-950"
              }`}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Live 96m x 96m Tactical Outpost Mini-Radar */}
          {phase === "PLAYING" && (
            <div className="relative w-[76px] h-[76px] rounded-2xl bg-slate-950/80 border border-sky-400/35 backdrop-blur-md shadow-lg overflow-hidden">
              {/* Road crosshairs */}
              <div className="absolute inset-x-1 top-1/2 h-[1px] bg-white/10" />
              <div className="absolute inset-y-1 left-1/2 w-[1px] bg-white/10" />
              {/* Active Hardpoint Ring */}
              {mode !== "SURVIVAL" && (
                <div
                  style={{
                    left: toRadarCoord(activeHardpoint.x) - 7,
                    top: toRadarCoord(activeHardpoint.z) - 7,
                  }}
                  className="absolute w-3.5 h-3.5 rounded-full border border-amber-400 bg-amber-400/25 animate-pulse"
                />
              )}
              {/* Combatant Blips */}
              {allUnits.map((u) => {
                if (!u.isAlive) return null;
                const isMe = u.id === myId;
                const isAlly = myUnit && !isMe && (mode === "SQUAD" || mode === "SURVIVAL") && u.team === myUnit.team;
                const recentlyFired = nowMs - (u.lastFiredAt || 0) < 2200;
                // Show self, allies, and enemies who fired recently or are near Hardpoint!
                if (!isMe && !isAlly && !recentlyFired && Math.hypot(u.x - localPhysRef.current.x, u.z - localPhysRef.current.z) > 28) {
                  return null;
                }
                const rx = toRadarCoord(isMe ? localPhysRef.current.x : u.x);
                const rz = toRadarCoord(isMe ? localPhysRef.current.z : u.z);
                return (
                  <span
                    key={u.id}
                    style={{ left: rx - 3, top: rz - 3 }}
                    className={`absolute w-1.5 h-1.5 rounded-full ${
                      isMe
                        ? "w-2 h-2 bg-emerald-400 ring-2 ring-white"
                        : isAlly
                        ? "bg-sky-400"
                        : "bg-rose-500"
                    }`}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 7. Live Kill Feed & Elimination Banner */}
      {liveKillFeed.length > 0 && phase === "PLAYING" && (
        <div className="pointer-events-none absolute top-28 right-2.5 z-25 flex flex-col items-start gap-1 max-w-[56vw]">
          {liveKillFeed.slice(0, 2).map((kf) => (
            <div
              key={kf.id}
              className="px-2 py-0.5 rounded-lg bg-slate-950/75 backdrop-blur-sm border border-white/15 text-[10px] font-bold text-white flex items-center gap-1 shadow truncate max-w-full"
            >
              <span className="text-sky-300 truncate max-w-[72px]">{kf.killerName}</span>
              <span className="text-amber-400">
                {kf.weapon === "BARREL" ? "🛢️💥" : kf.isHeadshot ? "🎯" : "🔫"}
              </span>
              <span className="text-rose-300 truncate max-w-[72px]">{kf.victimName}</span>
            </div>
          ))}
        </div>
      )}

      {showBanner && killBanner && (
        <div className="pointer-events-none absolute top-16 inset-x-0 z-30 flex justify-center px-3">
          <div className="px-4 py-1.5 rounded-2xl bg-slate-950/90 border border-amber-300 shadow-xl text-center">
            <div className="text-xs sm:text-sm font-black text-amber-300">{killBanner.text}</div>
            <div className="text-[10px] font-bold text-slate-200">{killBanner.sub}</div>
          </div>
        </div>
      )}

      {/* Respawn Overlay */}
      {respawnLeftSec && phase === "PLAYING" && (
        <div className="pointer-events-none absolute inset-0 z-30 bg-slate-950/55 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="px-6 py-4 rounded-3xl bg-slate-900/95 border border-rose-400/70 text-center shadow-2xl">
            <div className="text-sm font-black text-rose-400 mb-1">💥 سقطت فـ الميدان!</div>
            <div className="text-xs text-slate-200 font-bold">
              عودة للقاعدة خلال <span className="text-amber-300 font-mono text-base">{respawnLeftSec}s</span>
            </div>
          </div>
        </div>
      )}

      {/* 8. Bottom Tactical HUD + COD/PUBG Mobile Right-Thumb Action Cluster */}
      {phase === "PLAYING" && myUnit && (
        <>
          {/* Bottom-Center Compact Armor + HP + Weapon Swap Pill */}
          <div className="pointer-events-none absolute bottom-0 inset-x-0 z-30 pb-[max(0.55rem,env(safe-area-inset-bottom))] px-3 flex justify-center">
            <div className="pointer-events-auto flex flex-col gap-1.5 bg-slate-950/85 backdrop-blur-md border border-white/20 rounded-2xl px-3 py-2 shadow-xl w-full max-w-[290px]">
              <div className="flex items-center gap-2">
                <div className="flex-1 flex flex-col gap-1">
                  {/* Ballistic Armor Bar */}
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(100, (myUnit.shield / Math.max(1, myUnit.maxShield)) * 100)
                        )}%`,
                      }}
                      className="h-full bg-gradient-to-r from-sky-400 to-cyan-300 transition-all duration-100"
                    />
                  </div>
                  {/* Soldier HP Bar */}
                  <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(100, (myUnit.hp / Math.max(1, myUnit.maxHp)) * 100)
                        )}%`,
                      }}
                      className={`h-full transition-all duration-100 ${
                        myUnit.hp > 40
                          ? "bg-gradient-to-r from-emerald-500 to-lime-400"
                          : "bg-gradient-to-r from-rose-600 to-amber-500"
                      }`}
                    />
                  </div>
                </div>
                <span className="font-mono text-xs font-black text-white w-8 text-left" dir="ltr">
                  {Math.round(myUnit.hp)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  onClick={() => swapLocalWeapon()}
                  className={`flex-1 flex items-center justify-between gap-1 px-2.5 py-1 rounded-xl border text-[11px] font-black active:scale-95 ${
                    CARBON_WEAPONS[weaponHud.weapon].badgeColor
                  }`}
                >
                  <span className="truncate">{SHORT_WEAPON_AR[weaponHud.weapon]}</span>
                  {weaponHud.secondaryWeapon && (
                    <span className="px-1.5 py-0.5 rounded bg-white/15 text-[9px] text-white shrink-0">
                      بدّل ⇄
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    commandsRef.current.reloadRequested = true;
                  }}
                  dir="ltr"
                  className="px-2.5 py-1 rounded-xl bg-slate-900 border border-white/15 text-[11px] font-mono font-black text-white flex items-center gap-1 active:scale-95 shrink-0"
                >
                  {weaponHud.isReloading ? (
                    <span className="text-amber-300 text-[10px]">تعمير...</span>
                  ) : (
                    <>
                      <span>{weaponHud.ammo}</span>
                      <span className="text-slate-400">/{weaponHud.maxAmmo}</span>
                      <RefreshCw className="w-3 h-3 text-sky-300" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Ergonomic Mobile Right-Thumb Combat Cluster (Fire + ADS Scope + Roll + Jump + Grenade) */}
          {!isDesktopFinePointer && (
            <div
              style={{
                right: "max(0.65rem, env(safe-area-inset-right))",
                bottom: "calc(max(0.65rem, env(safe-area-inset-bottom)) + 4.5rem)",
              }}
              className="pointer-events-auto fixed z-30 flex flex-col items-end gap-2"
            >
              {/* Upper Utility Row: Frag Grenade + Jump + ADS Scope */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    commandsRef.current.grenadeRequested = true;
                  }}
                  onClick={() => {
                    commandsRef.current.grenadeRequested = true;
                  }}
                  disabled={weaponHud.grenadeCooldownLeft > 0.05}
                  className={`w-11 h-11 rounded-full border-2 flex flex-col items-center justify-center shadow-lg active:scale-90 ${
                    weaponHud.grenadeCooldownLeft > 0.05
                      ? "bg-slate-900/75 border-slate-600 text-slate-400"
                      : "bg-amber-600/90 border-amber-200 text-white"
                  }`}
                >
                  <span className="text-sm leading-none">💣</span>
                  {weaponHud.grenadeCooldownLeft > 0.05 && (
                    <span className="text-[8px] font-mono font-black">
                      {Math.ceil(weaponHud.grenadeCooldownLeft)}s
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    commandsRef.current.jumpRequested = true;
                  }}
                  onClick={() => {
                    commandsRef.current.jumpRequested = true;
                  }}
                  className="w-11 h-11 rounded-full border-2 border-sky-200 bg-sky-600/85 text-white flex flex-col items-center justify-center shadow-lg active:scale-90"
                >
                  <span className="text-xs font-black leading-none">⏫</span>
                  <span className="text-[8px] font-black">قفز</span>
                </button>

                <button
                  type="button"
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    setAdsToggled((v) => !v);
                  }}
                  onClick={() => setAdsToggled((v) => !v)}
                  className={`w-12 h-12 rounded-full border-2 flex flex-col items-center justify-center shadow-lg active:scale-90 ${
                    adsToggled
                      ? "bg-amber-400 border-white text-slate-950"
                      : "bg-slate-900/90 border-sky-300/80 text-sky-200"
                  }`}
                >
                  <Focus className="w-5 h-5" />
                  <span className="text-[8px] font-black">منظار</span>
                </button>
              </div>

              {/* Primary Row: Combat Roll + Big Hold/Drag Fire Trigger */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    commandsRef.current.dashRequested = true;
                  }}
                  onClick={() => {
                    commandsRef.current.dashRequested = true;
                  }}
                  disabled={weaponHud.dashCooldownLeft > 0.05}
                  className={`w-12 h-12 rounded-full border-2 flex flex-col items-center justify-center shadow-lg active:scale-90 ${
                    weaponHud.dashCooldownLeft > 0.05
                      ? "bg-slate-900/75 border-slate-600 text-slate-400"
                      : "bg-emerald-600/90 border-emerald-200 text-white"
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  <span className="text-[8px] font-black">
                    {weaponHud.dashCooldownLeft > 0.05
                      ? `${weaponHud.dashCooldownLeft.toFixed(1)}s`
                      : "دحرجة"}
                  </span>
                </button>

                <button
                  type="button"
                  onTouchStart={onFireBtnTouchStart}
                  onTouchEnd={onFireBtnTouchEnd}
                  onTouchCancel={onFireBtnTouchEnd}
                  className={`w-[74px] h-[74px] rounded-full border-[3px] flex flex-col items-center justify-center shadow-2xl transition-transform ${
                    fireBtnPressed
                      ? "scale-95 bg-gradient-to-br from-amber-400 to-rose-600 border-white text-white"
                      : "bg-gradient-to-br from-rose-500 to-red-700 border-rose-200 text-white"
                  }`}
                >
                  <Crosshair className="w-7 h-7" />
                  <span className="text-[10px] font-black mt-0.5">إطلاق</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 9. Live Scoreboard Drawer */}
      {scoreboardOpen && (
        <div
          onClick={() => setScoreboardOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-slate-900 border border-white/20 p-4 shadow-2xl text-white"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-black text-sm text-amber-300">
                <Users className="w-4 h-4" />
                <span>ترتيب فرقة النخبة ({allUnits.length}/8)</span>
              </div>
              <button
                type="button"
                onClick={() => setScoreboardOpen(false)}
                className="p-1.5 rounded-xl bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
              {sortedLeaderboard.map((u, idx) => (
                <div
                  key={u.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold ${
                    u.id === myId
                      ? "bg-emerald-500/20 border-emerald-400/60"
                      : "bg-slate-800/80 border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-amber-300 font-mono w-5">#{idx + 1}</span>
                    <span className="truncate">{u.nickname}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono shrink-0">
                    {mode !== "SURVIVAL" && <span className="text-sky-300">🚩 {u.gems || 0}</span>}
                    <span className="text-emerald-300">{u.kills} إقصاء</span>
                    <span className="text-slate-400">{u.deaths} موت</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 10. Host Match Mode & Bot Fill Modal */}
      {settingsOpen && (
        <div
          onClick={() => setSettingsOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-slate-900 border border-sky-400/40 p-5 shadow-2xl text-white space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-sky-300">⚙️ إعدادات عملية الأطلس 3D</h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="p-1.5 rounded-xl bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-300">طور العملية:</div>
              <div className="grid grid-cols-1 gap-2">
                {(
                  [
                    {
                      id: "FFA",
                      title: "🚩 السيطرة الميدانية (Hardpoint + الكل ضد الكل)",
                      desc: "سيطر على المهبط، الرصيف، والقصبة! أول جندي يوصل لـ 100 نقطة أو 15 إقصاء كيربح!",
                    },
                    {
                      id: "SQUAD",
                      title: "⚔️ معركة الفرق 4 ضد 4",
                      desc: "فرقة الأطلس الزرقاء ضد قوات الاقتحام الحمراء على خريطة 96×96م!",
                    },
                    {
                      id: "SURVIVAL",
                      title: "🚁 صمود الكوماندوز (تعاوني ضد الموجات)",
                      desc: "تعاون مع صحابك أو بوحدك ضد موجات المغاوير والمدرع القائد Juggernaut!",
                    },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleModeSwitch(m.id)}
                    className={`text-right p-3 rounded-2xl border transition active:scale-98 ${
                      mode === m.id
                        ? "bg-sky-500/20 border-sky-400"
                        : "bg-slate-800/70 border-white/10"
                    }`}
                  >
                    <div className="text-xs font-black text-white">{m.title}</div>
                    <div className="text-[11px] text-slate-300 mt-0.5">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Smart Bot Toggle */}
            {mode !== "SURVIVAL" && (
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-slate-300">🤖 جنود الذكاء الاصطناعي (Bots):</div>
                <button
                  type="button"
                  onClick={() => handleModeSwitch(mode, settings.botDifficulty, !settings.botFill)}
                  className={`w-full p-2.5 rounded-xl border text-xs font-black flex items-center justify-between ${
                    settings.botFill
                      ? "bg-amber-500/20 border-amber-400 text-amber-200"
                      : "bg-emerald-500/20 border-emerald-400 text-emerald-200"
                  }`}
                >
                  <span>
                    {settings.botFill
                      ? "🤖 شغّال دائماً (إضافة البوتات حتى مع الأصدقاء)"
                      : "👥 مواجهة حقيقية (بدون بوتات ملي يدخلو 2+ لاعبين)"}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/15 text-[10px]">تبديل</span>
                </button>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-300">مستوى ذكاء البوتات:</div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: "NORMAL", label: "عادي 🙂" },
                    { id: "HARD", label: "محترف 🔥" },
                    { id: "CARBON", label: "كوماندوز 💀" },
                  ] as const
                ).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleModeSwitch(mode, d.id)}
                    className={`py-2 rounded-xl border text-xs font-black ${
                      settings.botDifficulty === d.id
                        ? "bg-amber-500/25 border-amber-400 text-amber-200"
                        : "bg-slate-800 border-white/10 text-slate-300"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 11. iPhone Safari Fullscreen Helper */}
      {iosFullscreenHelpOpen && (
        <div
          onClick={() => setIosFullscreenHelpOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-slate-900 border border-amber-400/50 p-5 text-white space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-300 font-black text-sm">
                <Smartphone className="w-5 h-5" />
                <span>شاشة كاملة فـ iPhone</span>
              </div>
              <button
                type="button"
                onClick={() => setIosFullscreenHelpOpen(false)}
                className="p-1 rounded-lg bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              فـ Safari ديال iPhone، كليكي على زر المشاركة <strong>Share ⬆️</strong> لتحت، واختار{" "}
              <strong>Add to Home Screen (إضافة للشاشة الرئيسية)</strong> باش تلعب فـ شاشة كاملة 100%!
            </p>
          </div>
        </div>
      )}

      {/* 12. Match Victory Podium */}
      {phase === "GAME_OVER" && (
        <div className="absolute inset-0 z-40 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border-2 border-amber-400/60 p-5 text-white shadow-2xl space-y-4">
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-300 text-xs font-black">
                <Trophy className="w-4 h-4" />
                <span>انتهت عملية الأطلس!</span>
              </div>
              <h2 className="text-lg font-black text-white pt-1">
                {winnerSummaryAr || "انتهت المعركة!"}
              </h2>
            </div>

            <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
              {sortedLeaderboard.slice(0, 6).map((u, i) => (
                <div
                  key={u.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold ${
                    i === 0
                      ? "bg-amber-500/20 border-amber-400/60 text-amber-100"
                      : "bg-slate-800/80 border-white/10 text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono font-black text-amber-300">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                    </span>
                    <span className="truncate">{u.nickname}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono shrink-0">
                    {mode !== "SURVIVAL" && <span className="text-sky-300">🚩 {u.gems || 0}</span>}
                    <span className="text-emerald-300">{u.kills} إقصاء</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              {canConfigure && (
                <button
                  type="button"
                  onClick={handleRestartMatch}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-sky-500 text-slate-950 font-black text-sm shadow-lg active:scale-95"
                >
                  🔄 عملية جديدة!
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsImmersive(false)}
                className="px-4 py-3 rounded-2xl bg-slate-800 border border-white/20 text-xs font-black text-white active:scale-95"
              >
                الغرفة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isImmersive && typeof document !== "undefined") {
    return createPortal(ui, document.body);
  }
  return ui;
}
