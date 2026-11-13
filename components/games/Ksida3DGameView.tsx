"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import confetti from "canvas-confetti";
import {
  AlertTriangle,
  Car,
  Crown,
  DoorOpen,
  Flame,
  Gamepad2,
  Gauge,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { isFullscreenActive, isIOS, isStandaloneApp } from "@/lib/fullscreen";
import { sound } from "@/lib/sound";
import { computeKsidaAwards, sortRacersStandings } from "@/games/ksida3d/engine";
import {
  CarKinematicsState,
  createInitialCarKinematics,
} from "@/games/ksida3d/physics";
import {
  ARENA_PILLARS,
  DERBY_ARENA_RADIUS,
  findNearestTrackSample,
  FINISH_SAMPLE_INDEX,
  RONDA_CENTER,
  RONDA_FOUNTAIN_RADIUS,
  RONDA_PLAZA_RADIUS,
  TRACK_CHECKPOINTS,
  TRACK_POLYLINE,
  TRACK_TOTAL_LENGTH_M,
} from "@/games/ksida3d/trackLayout";
import {
  KSIDA_ITEMS,
  KSIDA_TAUNT_ORDER,
  KSIDA_TAUNTS,
  KSIDA_VEHICLE_ORDER,
  KSIDA_VEHICLES,
  KsidaAction,
  KsidaAwardBadge,
  KsidaCratePad,
  KsidaItemFirePacket,
  KsidaMode,
  KsidaRacer,
  KsidaSettings,
  KsidaVehicleId,
  KsidaWreckEventPacket,
} from "@/games/ksida3d/types";
import {
  Ksida3DArena,
  KsidaDriveInput,
  VisualBoomEvent,
} from "./Ksida3DArena";
import { ksidaSfx } from "./ksida3d/soundFx";
import { useKsidaNet } from "./ksida3d/useKsidaNet";

export interface Ksida3DGameViewProps {
  publicData: Record<string, any>;
  privateData?: Record<string, any>;
  isHost?: boolean;
  onAction: (action: KsidaAction) => Promise<void> | void;
  players?: any[];
  activePlayerId?: string;
  roomCode?: string;
  onRefresh?: () => void;
}

const MODE_LABELS_AR: Record<KsidaMode, { title: string; badge: string; desc: string }> = {
  RACE: {
    title: "سباق الكسيدة الكبير 🏁",
    badge: `3 دورات • مدار ${(TRACK_TOTAL_LENGTH_M / 1000).toFixed(2)} كلم`,
    desc: "سابق عبر كورنيش عين الذئاب، ميناء طنجة-ميد، قصبة الوداية، ممر الأطلس، ومدار الروندا الكبرى!",
  },
  DERBY: {
    title: "حرب الروندا الملكية 👑",
    badge: "تفركيع + التاج الذهبي (250 نقطة)",
    desc: "حلبة تصادم عملاقة 124 متر مع البراميل المتفجرة! خطف التاج الذهبي وفرشخ الطوموبيلات باش تجمع 250 نقطة!",
  },
  HOT_BOMB: {
    title: "قنبلة البوطا السخونة 💣",
    badge: "دوّز البوطا قبل ما تفرگع",
    desc: "واحد هاز بوطا كتشعل فوق السقف! قيس أي طوموبيل فالحلبة باش تلصقها فيه قبل الصفر!",
  },
};

// Precomputed SVG polyline path for the 240-sample Grand Moroccan Circuit minimap
const CIRCUIT_SVG_PATH =
  TRACK_POLYLINE.map((pt, idx) => `${idx === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.z.toFixed(1)}`).join(" ") + " Z";

const FINISH_PT = TRACK_POLYLINE[FINISH_SAMPLE_INDEX];

export function Ksida3DGameView({
  publicData,
  privateData,
  isHost = false,
  onAction,
  activePlayerId,
  roomCode = "",
  onRefresh,
}: Ksida3DGameViewProps) {
  const [mounted, setMounted] = useState(false);
  const [isImmersive, setIsImmersive] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(sound.isMuted);
  const [isDesktopFinePointer, setIsDesktopFinePointer] = useState(false);
  const [forceTouchHud, setForceTouchHud] = useState(false);
  const [autoGas, setAutoGas] = useState(false);
  const [touchSteerStyle, setTouchSteerStyle] = useState<"PADDLES" | "WHEEL">("PADDLES");

  const [garageOpen, setGarageOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [standingsOpen, setStandingsOpen] = useState(false);
  const [tauntDrawerOpen, setTauntDrawerOpen] = useState(false);

  const [wreckFeed, setWreckFeed] = useState<KsidaWreckEventPacket[]>([]);
  const [centerBanner, setCenterBanner] = useState<{ text: string; sub?: string; color: string } | null>(
    null
  );
  const [steerKnobUi, setSteerKnobUi] = useState(0); // -1..1 visual indicator
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
    setIsFullscreen(isFullscreenActive() || isStandaloneApp());
    const finePtr = Boolean(window.matchMedia?.("(pointer: fine)").matches);
    setIsDesktopFinePointer(finePtr);

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
    const clock = setInterval(() => setNowMs(Date.now()), 100);

    return () => {
      clearInterval(clock);
      ksidaSfx.stopEngineLoop();
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs as EventListener);
      if (wakeLock) wakeLock.release?.().catch(() => {});
    };
  }, []);

  const phase = (publicData?.phase as "PLAYING" | "GAME_OVER") || "PLAYING";
  const mode = (publicData?.mode as KsidaMode) || "RACE";
  const round = Number(publicData?.round ?? 1);
  const countdownEndsAt = Number(publicData?.countdownEndsAt ?? 0);
  const endsAt = Number(publicData?.endsAt ?? Date.now() + 300_000);
  const settings: KsidaSettings = (publicData?.settings as KsidaSettings) || {
    mode: "RACE",
    botFill: false,
    targetLaps: 3,
    targetDerbyScore: 250,
    matchDurationSec: 300,
  };
  const initialRacers = (publicData?.racers as Record<string, KsidaRacer>) || {};
  const initialCrates = (publicData?.crates as KsidaCratePad[]) || [];
  const initialCrownHolderId = (publicData?.crownHolderId as string | null) || null;
  const initialHotBombHolderId = (publicData?.hotBombHolderId as string | null) || null;
  const initialHotBombExplodesAt = Number(publicData?.hotBombExplodesAt ?? 0);
  const winnerSummaryAr = (publicData?.winnerSummaryAr as string | null) || null;
  const serverAwards = (publicData?.awards as KsidaAwardBadge[]) || [];

  const myId = useMemo(() => {
    const candidate = (activePlayerId || String(privateData?.myRacerId ?? "")).trim();
    if (candidate) return candidate;
    const firstHuman = Object.values(initialRacers).find((r) => !r.isBot);
    return firstHuman?.id || "p_local";
  }, [activePlayerId, privateData?.myRacerId, initialRacers]);

  const myInitial = initialRacers[myId];
  const localKinRef = useRef<CarKinematicsState>(
    createInitialCarKinematics(
      myInitial?.x ?? 0,
      myInitial?.y ?? 0,
      myInitial?.z ?? 0,
      myInitial?.yaw ?? 0,
      65
    )
  );
  const localProgressRef = useRef({
    lap: myInitial?.lap ?? 1,
    nextCheckpoint: myInitial?.nextCheckpoint ?? 1,
    trackProgress: myInitial?.trackProgress ?? 0,
    wallHits: myInitial?.wallHits ?? 0,
    driftScore: myInitial?.driftScore ?? 0,
  });

  const driveInputRef = useRef<KsidaDriveInput>({
    throttle: 0,
    steer: 0,
    driftHeld: false,
    hopRequested: false,
    nitroHeld: false,
    lookBackHeld: false,
  });

  const revMeterRef = useRef<number>(0);
  const countdownEndsAtRef = useRef<number>(countdownEndsAt);
  countdownEndsAtRef.current = countdownEndsAt;

  const projectileQueueRef = useRef<KsidaItemFirePacket[]>([]);
  const boomQueueRef = useRef<VisualBoomEvent[]>([]);
  const screenShakeRef = useRef<number>(0);
  const lastTrackResetAtRef = useRef<number>(0);

  const showBanner = useCallback(
    (text: string, sub?: string, color = "from-amber-500 to-rose-600") => {
      setCenterBanner({ text, sub, color });
      setTimeout(() => {
        setCenterBanner((prev) => (prev?.text === text ? null : prev));
      }, 2500);
    },
    []
  );

  const handleRemoteItemFire = useCallback((pkt: KsidaItemFirePacket) => {
    projectileQueueRef.current.push(pkt);
  }, []);

  const handleWreckEvent = useCallback(
    (ev: KsidaWreckEventPacket) => {
      setWreckFeed((prev) => [ev, ...prev.slice(0, 3)]);
      boomQueueRef.current.push({
        x: ev.x,
        y: ev.y + 0.5,
        z: ev.z,
        colorHex: ev.colorHex,
        labelAr: "كسيدة! 💥",
      });
      ksidaSfx.playCrashImpact(1.4, true);

      if (ev.attackerId === myId && ev.victimId !== myId) {
        showBanner(
          `💥 فرشختي ${ev.victimName}!`,
          ev.memeBannerAr,
          "from-emerald-500 to-amber-500"
        );
      } else if (ev.victimId === myId) {
        showBanner(
          `💀 تفرشختي على يد ${ev.attackerName}!`,
          ev.memeBannerAr,
          "from-rose-600 to-red-900"
        );
      }
    },
    [myId, showBanner]
  );

  const handleLocalKnockback = useCallback(
    (ix: number, iz: number, spinMs: number, damage: number) => {
      localKinRef.current.vx += ix;
      localKinRef.current.vz += iz;
      if (spinMs > 0) {
        localKinRef.current.spinTimer = Math.max(
          localKinRef.current.spinTimer,
          spinMs / 1000
        );
      }
      screenShakeRef.current = Math.max(screenShakeRef.current, Math.min(1.0, damage / 35));
      ksidaSfx.playCrashImpact(damage / 25, false);
    },
    []
  );

  const handleRespawnLocal = useCallback((x: number, y: number, z: number, yaw: number) => {
    localKinRef.current = createInitialCarKinematics(x, y, z, yaw, 75);
  }, []);

  const handleExplosionVisual = useCallback(
    (x: number, y: number, z: number, colorHex: number, labelAr?: string) => {
      boomQueueRef.current.push({ x, y, z, colorHex, labelAr });
    },
    []
  );

  const {
    isLive,
    hudTick,
    racersRef,
    cratesRef,
    barrelsRef,
    hazardsRef,
    peersRef,
    crownHolderRef,
    crownPosRef,
    hotBombHolderRef,
    hotBombExplodesAtRef,
    raceFinishDeadlineRef,
    broadcastLocalPosTick,
    claimRamHit,
    fireHeldMemeItem,
    claimProjectileHit,
    sendMemeTaunt,
    selectLocalVehicle,
    notifyRoomRefresh,
  } = useKsidaNet({
    roomCode,
    myId,
    isHost,
    round,
    phase,
    mode,
    countdownEndsAt,
    endsAt,
    settings,
    initialRacers,
    initialCrates,
    initialCrownHolderId,
    initialHotBombHolderId,
    initialHotBombExplodesAt,
    localKinRef,
    localProgressRef,
    onRemoteItemFire: handleRemoteItemFire,
    onWreckEvent: handleWreckEvent,
    onLocalKnockback: handleLocalKnockback,
    onRespawnLocal: handleRespawnLocal,
    onExplosionVisual: handleExplosionVisual,
    onAction,
    onRefresh,
  });

  // 3.. 2.. 1.. ديماري! Countdown Beep Effect
  const lastBeepStepRef = useRef<number>(99);
  useEffect(() => {
    lastBeepStepRef.current = 99;
    revMeterRef.current = 0;
  }, [round, countdownEndsAt]);

  useEffect(() => {
    if (phase !== "PLAYING" || countdownEndsAt <= 0) return;
    const msLeft = countdownEndsAt - nowMs;
    if (msLeft > 3050 || msLeft < -750) return;

    const step = msLeft > 2000 ? 3 : msLeft > 1000 ? 2 : msLeft > 0 ? 1 : 0;
    if (step < lastBeepStepRef.current) {
      lastBeepStepRef.current = step;
      ksidaSfx.playCountdownBeep(step === 0);
    }
  }, [nowMs, countdownEndsAt, phase]);

  // Trigger celebratory confetti on GAME_OVER
  useEffect(() => {
    if (phase === "GAME_OVER") {
      ksidaSfx.stopEngineLoop();
      ksidaSfx.playLapFanfare(true);
      try {
        confetti({ particleCount: 95, spread: 82, origin: { y: 0.55 } });
      } catch {}
    }
  }, [phase]);

  // 1-Tap / R-Key Track Recovery (unsticks from walls or fixes wrong-way instantly!)
  const handleResetToTrack = useCallback(() => {
    const now = Date.now();
    if (now - lastTrackResetAtRef.current < 1100) return;
    if (now < countdownEndsAtRef.current) return;
    lastTrackResetAtRef.current = now;

    const curNitro = Math.max(40, localKinRef.current.nitro);
    if (mode === "RACE") {
      const { sample } = findNearestTrackSample(localKinRef.current.x, localKinRef.current.z);
      localKinRef.current = createInitialCarKinematics(
        sample.x,
        0,
        sample.z,
        sample.yaw,
        curNitro
      );
    } else {
      localKinRef.current = createInitialCarKinematics(0, 0, -36, 0, curNitro);
    }
    ksidaSfx.playCratePickup();
    showBanner("🔄 رجعتي للطريق!", "كسيري دابا بلا رحمة!", "from-cyan-500 to-emerald-600");
  }, [mode, showBanner]);

  const handleUseItem = useCallback(() => {
    if (Date.now() < countdownEndsAtRef.current) return;
    const pkt = fireHeldMemeItem();
    if (!pkt) return;
    if (pkt.item === "SANDALA" || pkt.item === "BUTAGAZ") {
      projectileQueueRef.current.push(pkt);
      ksidaSfx.playMemeHorn(pkt.item === "SANDALA" ? 3 : 4, true);
    } else if (pkt.item === "ATAY_NITRO") {
      ksidaSfx.playDriftBoost(3);
      showBanner(
        "🫖 أتاي مشحر أوفردرايف!",
        "سرعة قصوى + تفركيع مضاعف!",
        "from-emerald-500 to-teal-700"
      );
    } else if (pkt.item === "SOAP_OIL" || pkt.item === "WATERMELON") {
      ksidaSfx.playCratePickup();
    }
  }, [fireHeldMemeItem, showBanner]);

  const handleQuickHorn = useCallback(() => {
    const pick = KSIDA_TAUNT_ORDER[Math.floor(Math.random() * KSIDA_TAUNT_ORDER.length)];
    sendMemeTaunt(pick);
  }, [sendMemeTaunt]);

  // Keyboard + Multi-Touch Unified Drive Input
  const keysHeldRef = useRef<Set<string>>(new Set());
  const touchSteerRef = useRef<number>(0);
  const touchBrakeRef = useRef<boolean>(false);
  const touchGasHoldRef = useRef<boolean>(false);
  const touchDriftRef = useRef<boolean>(false);
  const touchNitroRef = useRef<boolean>(false);

  const syncCombinedDriveInput = useCallback(() => {
    const keys = keysHeldRef.current;
    const keyGas = keys.has("KeyW") || keys.has("ArrowUp");
    const keyBrake = keys.has("KeyS") || keys.has("ArrowDown");
    const keyLeft = keys.has("KeyA") || keys.has("ArrowLeft");
    const keyRight = keys.has("KeyD") || keys.has("ArrowRight");
    const keyDrift = keys.has("Space");
    const keyNitro = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const keyLookBack = keys.has("KeyQ");

    const inCountdown = Date.now() < countdownEndsAtRef.current;

    let throttle = 0;
    if (keyBrake || touchBrakeRef.current) {
      throttle = -1;
    } else if (
      keyGas ||
      touchGasHoldRef.current ||
      (!inCountdown && (touchDriftRef.current || autoGas))
    ) {
      // Note: On mobile, holding the DRIFT button also maintains forward gas so 1 right thumb can drift seamlessly!
      throttle = 1;
    }

    let steer = touchSteerRef.current;
    if (keyLeft && !keyRight) steer = -1;
    else if (keyRight && !keyLeft) steer = 1;

    driveInputRef.current.throttle = throttle;
    driveInputRef.current.steer = steer;
    driveInputRef.current.driftHeld = keyDrift || touchDriftRef.current;
    driveInputRef.current.nitroHeld = keyNitro || touchNitroRef.current;
    driveInputRef.current.lookBackHeld = keyLookBack;
  }, [autoGas]);

  useEffect(() => {
    syncCombinedDriveInput();
  }, [autoGas, countdownEndsAt, syncCombinedDriveInput]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      if (e.code === "Space" && !keysHeldRef.current.has("Space")) {
        driveInputRef.current.hopRequested = true;
      }
      keysHeldRef.current.add(e.code);
      syncCombinedDriveInput();

      if (e.code === "KeyE" || e.code === "Enter") {
        handleUseItem();
      } else if (e.code === "KeyR") {
        handleResetToTrack();
      } else if (e.code === "KeyH") {
        handleQuickHorn();
      } else if (e.code === "KeyG") {
        setGarageOpen((v) => !v);
      } else if (e.code.startsWith("Digit")) {
        const idx = Number(e.code.replace("Digit", "")) - 1;
        if (idx >= 0 && idx < KSIDA_TAUNT_ORDER.length) {
          sendMemeTaunt(KSIDA_TAUNT_ORDER[idx]);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeldRef.current.delete(e.code);
      syncCombinedDriveInput();
    };

    const onBlur = () => {
      keysHeldRef.current.clear();
      touchSteerRef.current = 0;
      touchBrakeRef.current = false;
      touchGasHoldRef.current = false;
      touchDriftRef.current = false;
      touchNitroRef.current = false;
      setSteerKnobUi(0);
      syncCombinedDriveInput();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    syncCombinedDriveInput,
    handleUseItem,
    handleResetToTrack,
    handleQuickHorn,
    sendMemeTaunt,
  ]);

  // Unified Touch Steering Zone (supports Dual Tactile Paddles with slide-across OR Analog Wheel)
  const steerPadRef = useRef<{ pointerId: number | null; centerX: number }>({
    pointerId: null,
    centerX: 0,
  });

  const applyTouchSteerFromClientX = (clientX: number, rect: DOMRect) => {
    const cx = rect.left + rect.width * 0.5;
    if (touchSteerStyle === "PADDLES") {
      const rel = (clientX - cx) / Math.max(1, rect.width * 0.5);
      // Crisp digital-progressive paddle response with tiny deadzone right at seam
      const val = Math.abs(rel) < 0.08 ? 0 : rel < 0 ? -1 : 1;
      touchSteerRef.current = val;
      setSteerKnobUi(val);
    } else {
      const norm = Math.max(-1, Math.min(1, (clientX - cx) / (rect.width * 0.36)));
      touchSteerRef.current = norm;
      setSteerKnobUi(norm);
    }
    syncCombinedDriveInput();
  };

  const onSteerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    steerPadRef.current = { pointerId: e.pointerId, centerX: rect.left + rect.width * 0.5 };
    applyTouchSteerFromClientX(e.clientX, rect);
  };

  const onSteerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (steerPadRef.current.pointerId !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    applyTouchSteerFromClientX(e.clientX, rect);
  };

  const onSteerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (steerPadRef.current.pointerId !== e.pointerId) return;
    steerPadRef.current.pointerId = null;
    touchSteerRef.current = 0;
    setSteerKnobUi(0);
    syncCombinedDriveInput();
  };

  const toggleSound = () => {
    sound.isMuted = !isMuted;
    setIsMuted(!isMuted);
    if (!sound.isMuted) ksidaSfx.playMemeHorn(0, true);
    else ksidaSfx.stopEngineLoop();
  };

  const toggleFullscreen = async () => {
    if (isIOS()) {
      setIsImmersive(true);
      return;
    }
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {}
  };

  // Live HUD derived values (refreshed via `hudTick` & 100ms `nowMs`)
  void hudTick;
  const allRacers = Object.values(racersRef.current);
  const activeRacersList = allRacers.length > 0 ? allRacers : Object.values(initialRacers);
  const standings = sortRacersStandings(activeRacersList, mode);
  const me = racersRef.current[myId] || initialRacers[myId];
  const myRank = Math.max(1, standings.findIndex((r) => r.id === myId) + 1);
  const mySpec = KSIDA_VEHICLES[me?.vehicle || "TAXI_HMER"];
  const heldItemSpec = me?.heldItem ? KSIDA_ITEMS[me.heldItem] : null;

  const kin = localKinRef.current;
  const speedKmh = Math.round(Math.abs(kin.forwardSpeed) * 4.8);
  const gearLabel =
    kin.forwardSpeed < -1.5
      ? "R"
      : speedKmh < 6
      ? "N"
      : String(Math.min(5, Math.max(1, Math.ceil(speedKmh / 34))));
  const nitroPct = Math.round(kin.nitro);
  const hpPct = me ? Math.max(0, Math.round((me.hp / Math.max(1, me.maxHp)) * 100)) : 100;

  const countdownMsLeft = countdownEndsAt - nowMs;
  const showCountdownOverlay = phase === "PLAYING" && countdownMsLeft > -850 && countdownEndsAt > 0;
  const countdownNumber =
    countdownMsLeft > 2000
      ? "3"
      : countdownMsLeft > 1000
      ? "2"
      : countdownMsLeft > 0
      ? "1"
      : "ديماري! 🔥";
  const revPct = Math.round(Math.min(100, Math.max(0, revMeterRef.current * 100)));
  const revInSweetSpot = revPct >= 48 && revPct <= 96;

  const isWrongWay =
    phase === "PLAYING" &&
    mode === "RACE" &&
    countdownMsLeft <= 0 &&
    kin.wrongWayTimer > 1.2;

  const graceSecsLeft =
    raceFinishDeadlineRef.current > nowMs
      ? Math.max(0, Math.ceil((raceFinishDeadlineRef.current - nowMs) / 1000))
      : 0;

  const timeLeftSec = Math.max(0, Math.ceil((endsAt - nowMs) / 1000));
  const mins = Math.floor(timeLeftSec / 60);
  const secs = String(timeLeftSec % 60).padStart(2, "0");

  const isHoldingBomb = mode === "HOT_BOMB" && hotBombHolderRef.current === myId;
  const bombSecsLeft = Math.max(
    0,
    Math.ceil((hotBombExplodesAtRef.current - nowMs) / 1000)
  );
  const isHoldingCrown = mode === "DERBY" && crownHolderRef.current === myId;
  const respawnLeftSec =
    me && !me.isAlive && me.respawnAt > nowMs
      ? ((me.respawnAt - nowMs) / 1000).toFixed(1)
      : null;

  const showTouchControls = !isDesktopFinePointer || forceTouchHud;
  const nextCpObj =
    TRACK_CHECKPOINTS[
      ((localProgressRef.current.nextCheckpoint % TRACK_CHECKPOINTS.length) +
        TRACK_CHECKPOINTS.length) %
        TRACK_CHECKPOINTS.length
    ];

  const finalAwards = useMemo(() => {
    if (serverAwards && serverAwards.length > 0) return serverAwards;
    return computeKsidaAwards(racersRef.current, mode);
  }, [serverAwards, racersRef, mode, phase]);

  const gameContent = (
    <div
      dir="rtl"
      className={`${
        isImmersive ? "fixed inset-0 z-50" : "relative w-full h-[82vh] rounded-3xl overflow-hidden"
      } bg-slate-950 text-white select-none overflow-hidden font-sans`}
    >
      {/* 60FPS Three.js World Canvas */}
      <Ksida3DArena
        myId={myId}
        mode={mode}
        phase={phase}
        countdownEndsAt={countdownEndsAt}
        targetLaps={settings.targetLaps}
        racersRef={racersRef}
        cratesRef={cratesRef}
        barrelsRef={barrelsRef}
        hazardsRef={hazardsRef}
        peersRef={peersRef}
        crownHolderRef={crownHolderRef}
        crownPosRef={crownPosRef}
        hotBombHolderRef={hotBombHolderRef}
        localKinRef={localKinRef}
        localProgressRef={localProgressRef}
        driveInputRef={driveInputRef}
        revMeterRef={revMeterRef}
        projectileQueueRef={projectileQueueRef}
        boomQueueRef={boomQueueRef}
        screenShakeRef={screenShakeRef}
        onLocalPosTick={broadcastLocalPosTick}
        onClaimRamHit={claimRamHit}
        onClaimProjectileHit={claimProjectileHit}
        onLapBanner={(lap, target) =>
          showBanner(
            lap === target ? `🔥 الدورة الأخيرة (${lap}/${target})!` : `🏁 الدورة ${lap} من ${target}!`,
            "زيد كسيري فـ الكورنيش والقصبة!",
            "from-amber-500 to-emerald-600"
          )
        }
        onPerfectLaunch={() =>
          showBanner(
            "🚀 انطلاقة صاروخية!",
            "تيربو كامل + 30% نيترو إضافي!",
            "from-emerald-500 to-cyan-600"
          )
        }
      />

      {/* Nitro / Turbo Pad / Mint Tea Overdrive Screen Edge Glow */}
      {(kin.isNitroActive || kin.turboPadTimer > 0 || (me && me.atayUntil > nowMs)) && (
        <div
          className={`pointer-events-none absolute inset-0 border-[6px] ${
            me && me.atayUntil > nowMs
              ? "border-emerald-400/65 shadow-[inset_0_0_55px_rgba(16,185,129,0.5)]"
              : "border-cyan-400/55 shadow-[inset_0_0_45px_rgba(56,189,248,0.45)]"
          } animate-pulse`}
        />
      )}

      {/* Ticking Hot-Bomb Urgent Red Vignette if YOU have the Butagaz! */}
      {isHoldingBomb && phase === "PLAYING" && (
        <div className="pointer-events-none absolute inset-0 border-[8px] border-red-500/80 shadow-[inset_0_0_70px_rgba(239,68,68,0.65)] animate-pulse" />
      )}

      {/* === TOP BAR HUD === */}
      <div className="absolute top-0 inset-x-0 z-20 p-2.5 sm:p-4 flex items-start justify-between gap-2 pointer-events-none">
        {/* Right (RTL Start): Rank, Mode/Lap, Grace Timer & Match Clock */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pointer-events-auto">
          <div className="px-3 py-1.5 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-amber-400/60 shadow-lg flex items-center gap-2">
            <span className="text-lg sm:text-2xl font-black text-amber-300">#{myRank}</span>
            <span className="text-[11px] text-slate-300 font-bold">/ {standings.length}</span>
          </div>

          {mode === "RACE" && (
            <div className="px-3 py-1.5 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-emerald-400/50 text-xs sm:text-sm font-black text-emerald-200 flex items-center gap-1.5">
              <span>
                🏁 الدورة {Math.min(settings.targetLaps, localProgressRef.current.lap)}/{settings.targetLaps}
              </span>
              <span className="hidden md:inline text-[11px] text-slate-400 font-bold">
                • {nextCpObj?.labelAr}
              </span>
            </div>
          )}

          {mode === "DERBY" && (
            <div
              className={`px-3 py-1.5 rounded-2xl backdrop-blur-md border text-xs sm:text-sm font-black ${
                isHoldingCrown
                  ? "bg-amber-500/90 border-yellow-200 text-slate-950 animate-bounce"
                  : "bg-slate-950/85 border-amber-400/50 text-amber-200"
              }`}
            >
              {isHoldingCrown
                ? "👑 عندك التاج الذهبي! هرب!"
                : `💥 ${me?.score ?? 0}/${settings.targetDerbyScore} نقطة`}
            </div>
          )}

          {mode === "HOT_BOMB" && (
            <div
              className={`px-3 py-1.5 rounded-2xl backdrop-blur-md border text-xs sm:text-sm font-black ${
                isHoldingBomb
                  ? "bg-red-600 border-yellow-300 text-white animate-bounce"
                  : "bg-slate-950/85 border-rose-400/50 text-rose-200"
              }`}
            >
              {isHoldingBomb
                ? `💣 البوطا فوقك! قيس شي حد (${bombSecsLeft}s)`
                : `💣 تفرگيعة البوطا: ${bombSecsLeft}s`}
            </div>
          )}

          {graceSecsLeft > 0 && (
            <div className="px-2.5 py-1.5 rounded-2xl bg-amber-600/90 border border-yellow-200 text-xs font-black text-white animate-pulse">
              🏁 الأول وصل! باقي {graceSecsLeft}ث
            </div>
          )}

          <div className="px-2.5 py-1.5 rounded-2xl bg-slate-950/80 border border-slate-700/80 text-xs font-mono font-bold text-slate-200">
            ⏱ {mins}:{secs}
          </div>

          {roomCode && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-slate-950/75 border border-slate-700 text-[11px] font-bold text-slate-300">
              <span className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span>كود: {roomCode}</span>
            </div>
          )}
        </div>

        {/* Left (RTL End): Track Reset, Garage, Standings, Settings, Sound, Fullscreen, Exit */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            type="button"
            onClick={handleResetToTrack}
            className="px-2.5 py-2 rounded-xl bg-slate-900/85 hover:bg-cyan-950 border border-cyan-500/40 text-xs font-black text-cyan-200 flex items-center gap-1 active:scale-95"
            title="إرجاع للطريق (R)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">طريق (R)</span>
          </button>

          <button
            type="button"
            onClick={() => setGarageOpen(true)}
            className="px-2.5 py-2 rounded-xl bg-gradient-to-r from-amber-500/90 to-orange-600/90 hover:brightness-110 border border-amber-300/60 text-xs font-black text-white shadow-lg flex items-center gap-1 active:scale-95"
            title="بدل الطوموبيل (G)"
          >
            <span>{mySpec?.emoji || "🚕"}</span>
            <span className="hidden sm:inline">الگاراج</span>
          </button>

          <button
            type="button"
            onClick={() => setStandingsOpen((v) => !v)}
            className="p-2 rounded-xl bg-slate-900/85 hover:bg-slate-800 border border-slate-700 text-amber-300"
            title="الترتيب"
          >
            <Trophy className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-xl bg-slate-900/85 hover:bg-slate-800 border border-slate-700 text-cyan-300"
            title="إعدادات الطور والتحكم"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={toggleSound}
            className="p-2 rounded-xl bg-slate-900/85 hover:bg-slate-800 border border-slate-700 text-slate-200"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-amber-300" />}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="hidden sm:flex p-2 rounded-xl bg-slate-900/85 hover:bg-slate-800 border border-slate-700 text-slate-200"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setIsImmersive((v) => !v)}
            className="p-2 rounded-xl bg-rose-950/85 hover:bg-rose-900 border border-rose-500/50 text-rose-200"
            title={isImmersive ? "رجوع للغرفة" : "ملء الشاشة"}
          >
            <DoorOpen className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* === LIVE 2D RADAR MINIMAP (Top-Left below controls) === */}
      {phase === "PLAYING" && (
        <div
          dir="ltr"
          className="pointer-events-none absolute top-14 left-2.5 sm:top-16 sm:left-4 z-20 rounded-2xl bg-slate-950/80 backdrop-blur-md border border-slate-700/80 p-1.5 shadow-xl"
        >
          {mode === "RACE" ? (
            <svg
              viewBox="-248 -182 496 368"
              className="w-28 h-20 sm:w-40 sm:h-28 block"
            >
              {/* Ronda Plaza Ring */}
              <circle
                cx={RONDA_CENTER.x}
                cy={RONDA_CENTER.z}
                r={RONDA_PLAZA_RADIUS}
                fill="#1e293b"
                stroke="#f59e0b"
                strokeWidth="4"
                opacity="0.9"
              />
              {/* Track Outer Border & Inner Asphalt */}
              <path
                d={CIRCUIT_SVG_PATH}
                fill="none"
                stroke="#475569"
                strokeWidth="26"
                strokeLinejoin="round"
              />
              <path
                d={CIRCUIT_SVG_PATH}
                fill="none"
                stroke="#0f172a"
                strokeWidth="18"
                strokeLinejoin="round"
              />
              {/* Ronda Fountain Island */}
              <circle
                cx={RONDA_CENTER.x}
                cy={RONDA_CENTER.z}
                r={RONDA_FOUNTAIN_RADIUS + 2}
                fill="#38bdf8"
              />
              {/* Start/Finish Line Marker */}
              <circle
                cx={FINISH_PT.x}
                cy={FINISH_PT.z}
                r="9"
                fill="#ffffff"
                stroke="#ef4444"
                strokeWidth="3.5"
              />
              {/* Next Checkpoint Beacon */}
              {nextCpObj && (
                <circle
                  cx={nextCpObj.x}
                  cy={nextCpObj.z}
                  r="11"
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="3.5"
                  opacity="0.85"
                />
              )}
              {/* Rival Racers */}
              {activeRacersList.map((r) => {
                if (r.id === myId || !r.isAlive) return null;
                return (
                  <circle
                    key={r.id}
                    cx={r.x}
                    cy={r.z}
                    r="8.5"
                    fill={r.isBot ? "#fbbf24" : "#f43f5e"}
                    stroke="#020617"
                    strokeWidth="2.5"
                  />
                );
              })}
              {/* Local Player Directional Arrow */}
              <g
                transform={`translate(${kin.x.toFixed(1)}, ${kin.z.toFixed(1)}) rotate(${(
                  (-kin.yaw * 180) /
                  Math.PI
                ).toFixed(1)})`}
              >
                <polygon
                  points="0,14 -10,-10 0,-5 10,-10"
                  fill="#10b981"
                  stroke="#ffffff"
                  strokeWidth="2.8"
                />
              </g>
            </svg>
          ) : (
            <svg viewBox="-74 -74 148 148" className="w-24 h-24 sm:w-32 sm:h-32 block">
              <circle
                cx="0"
                cy="0"
                r={DERBY_ARENA_RADIUS}
                fill="#0f172a"
                stroke="#f59e0b"
                strokeWidth="4"
              />
              {ARENA_PILLARS.filter((p) => p.modes.includes(mode)).map((pil) => (
                <circle
                  key={pil.id}
                  cx={pil.x}
                  cy={pil.z}
                  r={pil.radius + 1.2}
                  fill="#64748b"
                />
              ))}
              {mode === "DERBY" && !crownHolderRef.current && (
                <circle
                  cx={crownPosRef.current.x}
                  cy={crownPosRef.current.z}
                  r="5.5"
                  fill="#facc15"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              )}
              {activeRacersList.map((r) => {
                if (r.id === myId || !r.isAlive) return null;
                const hasSpecial =
                  r.id === crownHolderRef.current || r.id === hotBombHolderRef.current;
                return (
                  <circle
                    key={r.id}
                    cx={r.x}
                    cy={r.z}
                    r={hasSpecial ? "5.2" : "3.8"}
                    fill={
                      r.id === hotBombHolderRef.current
                        ? "#ef4444"
                        : r.id === crownHolderRef.current
                        ? "#facc15"
                        : "#fb923c"
                    }
                    stroke="#020617"
                    strokeWidth="1.2"
                  />
                );
              })}
              <g
                transform={`translate(${kin.x.toFixed(1)}, ${kin.z.toFixed(1)}) rotate(${(
                  (-kin.yaw * 180) /
                  Math.PI
                ).toFixed(1)})`}
              >
                <polygon
                  points="0,6.5 -4.6,-4.6 0,-2.2 4.6,-4.6"
                  fill="#10b981"
                  stroke="#ffffff"
                  strokeWidth="1.3"
                />
              </g>
            </svg>
          )}
        </div>
      )}

      {/* Live Meme Wreck Feed (Top-Right below bar) */}
      {wreckFeed.length > 0 && phase === "PLAYING" && (
        <div className="absolute top-14 right-3 sm:top-16 sm:right-4 z-20 space-y-1 max-w-[270px] pointer-events-none">
          {wreckFeed.slice(0, 2).map((w) => (
            <div
              key={w.id}
              className="px-2.5 py-1 rounded-xl bg-slate-950/80 backdrop-blur-md border border-rose-500/40 text-[11px] font-bold text-amber-100 shadow-md"
            >
              <span className="text-emerald-300">{w.attackerName}</span> 💥{" "}
              <span className="text-rose-300">{w.victimName}</span>
            </div>
          ))}
        </div>
      )}

      {/* === 3.. 2.. 1.. ديماري! TRAFFIC-LIGHT COUNTDOWN & LAUNCH REV-METER === */}
      {showCountdownOverlay && (
        <div className="pointer-events-none absolute inset-x-0 top-20 sm:top-24 z-30 flex flex-col items-center px-4">
          <div className="px-6 py-4 rounded-3xl bg-slate-950/90 backdrop-blur-md border-2 border-amber-400/70 shadow-2xl flex flex-col items-center gap-2.5">
            {/* Traffic Lights Row */}
            <div dir="ltr" className="flex items-center gap-3">
              <span
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-white/40 transition-all ${
                  countdownMsLeft > 0
                    ? "bg-red-500 shadow-[0_0_18px_#ef4444]"
                    : "bg-slate-800"
                }`}
              />
              <span
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-white/40 transition-all ${
                  countdownMsLeft <= 2000 && countdownMsLeft > 0
                    ? "bg-amber-400 shadow-[0_0_18px_#fbbf24]"
                    : "bg-slate-800"
                }`}
              />
              <span
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-white/40 transition-all ${
                  countdownMsLeft <= 0
                    ? "bg-emerald-400 shadow-[0_0_24px_#10b981] scale-125"
                    : "bg-slate-800"
                }`}
              />
            </div>

            <div
              className={`text-3xl sm:text-5xl font-black tracking-tight drop-shadow ${
                countdownMsLeft <= 0 ? "text-emerald-300 animate-bounce" : "text-amber-300"
              }`}
            >
              {countdownNumber}
            </div>

            {/* Mario-Kart Style Launch RPM Sweet-Spot Bar */}
            {countdownMsLeft > 0 && (
              <div className="w-52 sm:w-64">
                <div
                  dir="ltr"
                  className="relative w-full h-3 rounded-full bg-slate-800 border border-slate-600 overflow-hidden"
                >
                  {/* Emerald Sweet Spot Target Zone (48% .. 95%) */}
                  <div
                    style={{ left: "48%", width: "47%" }}
                    className="absolute inset-y-0 bg-emerald-500/30 border-x border-emerald-400/80"
                  />
                  <div
                    style={{ width: `${revPct}%` }}
                    className={`h-full transition-all duration-75 ${
                      revPct > 96
                        ? "bg-rose-500"
                        : revInSweetSpot
                        ? "bg-emerald-400"
                        : "bg-amber-400"
                    }`}
                  />
                </div>
                <div className="text-[10px] font-bold text-slate-300 text-center mt-1">
                  ضغط على <span className="text-emerald-300">كسيري</span> فالمنطقة الخضراء لانطلاقة صاروخية! 🚀
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* === WRONG-WAY FLASHING ALERT + 1-TAP TRACK RESET === */}
      {isWrongWay && !respawnLeftSec && (
        <div className="absolute top-24 inset-x-0 z-30 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto px-4 py-2.5 rounded-2xl bg-red-950/95 border-2 border-amber-400 shadow-2xl flex items-center gap-3 animate-pulse">
            <AlertTriangle className="w-6 h-6 text-amber-300 shrink-0" />
            <div>
              <div className="text-sm sm:text-base font-black text-white">
                ⚠️ اتجاه معاكس! غادي ضد السباق!
              </div>
              <div className="text-[11px] text-amber-200 font-bold">
                دور نص دورة ولا ضغط لإرجاع الطوموبيل للطريق
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetToTrack}
              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black shrink-0 shadow-md active:scale-95"
            >
              🔄 رجوع (R)
            </button>
          </div>
        </div>
      )}

      {/* Center Meme Callout Banner */}
      {centerBanner && phase === "PLAYING" && !showCountdownOverlay && !isWrongWay && (
        <div className="pointer-events-none absolute top-20 inset-x-0 z-30 flex justify-center px-4">
          <div
            className={`px-5 py-2.5 rounded-2xl bg-gradient-to-r ${centerBanner.color} border-2 border-white/50 shadow-2xl text-center animate-bounce`}
          >
            <div className="text-base sm:text-xl font-black text-white drop-shadow">
              {centerBanner.text}
            </div>
            {centerBanner.sub && (
              <div className="text-xs font-bold text-yellow-100 mt-0.5">{centerBanner.sub}</div>
            )}
          </div>
        </div>
      )}

      {/* WRECKED / CONSTAT RESPAWN OVERLAY */}
      {respawnLeftSec && phase === "PLAYING" && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-red-950/45 backdrop-blur-[2px] px-4">
          <div className="px-6 py-5 rounded-3xl bg-slate-950/90 border-2 border-rose-500 shadow-2xl text-center max-w-sm">
            <div className="text-3xl font-black text-rose-400 mb-1">مشات لافيراي! 💥📝</div>
            <p className="text-xs text-amber-200 font-bold mb-3">
              وجد الكونسطا... الديباناج كينزّلك دابا!
            </p>
            <div className="text-xl font-mono font-black text-white">
              راجعين فـ {respawnLeftSec} ثانية ⚡
            </div>
          </div>
        </div>
      )}

      {/* === BOTTOM DRIVING CONTROLS & TELEMETRY DASHBOARD === */}
      {phase === "PLAYING" && (
        <>
          {showTouchControls ? (
            /* ========= MOBILE / TOUCH PRO ARCADE LAYOUT ========= */
            <div
              dir="ltr"
              className="absolute bottom-0 inset-x-0 z-20 p-2.5 sm:p-4 flex items-end justify-between gap-2 pointer-events-none"
            >
              {/* LEFT THUMB: Dual Tactile Steering Paddles (or Analog Wheel) + Auto-Gas Toggle */}
              <div className="flex flex-col items-start gap-2 pointer-events-auto">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAutoGas((v) => !v)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all ${
                      autoGas
                        ? "bg-emerald-600/90 border-emerald-300 text-white"
                        : "bg-slate-900/85 border-slate-600 text-slate-300"
                    }`}
                  >
                    {autoGas ? "⚡ أوطو-كسيري ON" : "كسيري يدوي"}
                  </button>

                  {isDesktopFinePointer && (
                    <button
                      type="button"
                      onClick={() => setForceTouchHud(false)}
                      className="px-2 py-1 rounded-xl bg-slate-900/85 border border-slate-700 text-[10px] font-bold text-slate-300"
                    >
                      إخفاء اللمس
                    </button>
                  )}
                </div>

                {touchSteerStyle === "PADDLES" ? (
                  /* Seamless Multi-Touch Dual Steering Paddles (Slide thumb left <-> right!) */
                  <div
                    onPointerDown={onSteerPointerDown}
                    onPointerMove={onSteerPointerMove}
                    onPointerUp={onSteerPointerUp}
                    onPointerCancel={onSteerPointerUp}
                    className="w-40 h-24 sm:w-48 sm:h-28 rounded-3xl bg-slate-950/80 backdrop-blur-md border-2 border-slate-600/90 p-1.5 grid grid-cols-2 gap-1.5 shadow-2xl touch-none"
                  >
                    <div
                      className={`rounded-2xl flex flex-col items-center justify-center border transition-all ${
                        steerKnobUi < -0.2
                          ? "bg-amber-500 border-yellow-200 text-slate-950 scale-95 shadow-inner"
                          : "bg-slate-900/90 border-slate-700 text-slate-200"
                      }`}
                    >
                      <span className="text-2xl sm:text-3xl font-black leading-none">◀</span>
                      <span className="text-[10px] font-black mt-1">يسار</span>
                    </div>
                    <div
                      className={`rounded-2xl flex flex-col items-center justify-center border transition-all ${
                        steerKnobUi > 0.2
                          ? "bg-amber-500 border-yellow-200 text-slate-950 scale-95 shadow-inner"
                          : "bg-slate-900/90 border-slate-700 text-slate-200"
                      }`}
                    >
                      <span className="text-2xl sm:text-3xl font-black leading-none">▶</span>
                      <span className="text-[10px] font-black mt-1">يمين</span>
                    </div>
                  </div>
                ) : (
                  /* Optional Smooth Analog Wheel Slider */
                  <div
                    onPointerDown={onSteerPointerDown}
                    onPointerMove={onSteerPointerMove}
                    onPointerUp={onSteerPointerUp}
                    onPointerCancel={onSteerPointerUp}
                    className="relative w-40 h-24 sm:w-48 sm:h-28 rounded-3xl bg-slate-950/80 backdrop-blur-md border-2 border-slate-600/90 shadow-2xl flex items-center justify-center touch-none"
                  >
                    <div className="absolute inset-x-4 h-2 rounded-full bg-slate-800 border border-slate-700" />
                    <div className="absolute left-3 text-xs font-black text-slate-400">◀</div>
                    <div className="absolute right-3 text-xs font-black text-slate-400">▶</div>
                    <div
                      style={{
                        transform: `translateX(${steerKnobUi * 44}px) rotate(${steerKnobUi * 36}deg)`,
                      }}
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-b from-amber-400 to-orange-600 border-2 border-white shadow-xl flex items-center justify-center text-xl font-black text-slate-950 transition-transform duration-75"
                    >
                      🛞
                    </div>
                  </div>
                )}
              </div>

              {/* CENTER: Compact Telemetry Speedometer + HP + Nitro */}
              <div className="flex flex-col items-center gap-1 pointer-events-none mb-0.5">
                {kin.isDrifting && kin.driftStage > 0 && (
                  <div
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                      kin.driftStage === 3
                        ? "bg-purple-600 border-purple-200 text-white"
                        : kin.driftStage === 2
                        ? "bg-amber-500 border-yellow-200 text-slate-950"
                        : "bg-cyan-500 border-cyan-200 text-slate-950"
                    }`}
                  >
                    دريفت x{kin.driftStage} ⚡
                  </div>
                )}
                <div className="px-3 py-1.5 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-slate-700/90 text-center min-w-[98px] sm:min-w-[132px] shadow-xl">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-lg sm:text-2xl font-black font-mono text-amber-300">
                      {speedKmh}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400">KM/H</span>
                    <span className="px-1 rounded bg-slate-800 text-[9px] font-mono font-black text-cyan-300">
                      {gearLabel}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1">
                    <div
                      style={{ width: `${hpPct}%` }}
                      className={`h-full transition-all ${
                        hpPct > 50 ? "bg-emerald-400" : hpPct > 25 ? "bg-amber-400" : "bg-rose-500"
                      }`}
                    />
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1">
                    <div
                      style={{ width: `${nitroPct}%` }}
                      className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* RIGHT THUMB: Meme Item, Nitro, Brake/Reverse, Drift & Tall Gas Pedal! */}
              <div className="flex flex-col items-end gap-1.5 pointer-events-auto">
                {/* Taunt Drawer Popup */}
                {tauntDrawerOpen && (
                  <div
                    dir="rtl"
                    className="grid grid-cols-2 gap-1.5 p-2 rounded-2xl bg-slate-950/95 border border-amber-400/60 shadow-2xl mb-1 max-w-[250px]"
                  >
                    {KSIDA_TAUNT_ORDER.map((tid) => {
                      const t = KSIDA_TAUNTS[tid];
                      return (
                        <button
                          key={tid}
                          type="button"
                          onClick={() => {
                            sendMemeTaunt(tid);
                            setTauntDrawerOpen(false);
                          }}
                          className="px-2 py-1.5 rounded-xl bg-slate-900 hover:bg-amber-500/20 border border-slate-700 text-[11px] font-bold text-amber-200 text-right truncate"
                        >
                          {t.emoji} {t.textAr}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Upper Action Row: Horn, Taunts, Item & Nitro */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleQuickHorn}
                    className="px-2.5 py-1.5 rounded-xl bg-amber-500/90 active:scale-90 border border-yellow-200 text-[11px] font-black text-slate-950 shadow-lg"
                  >
                    📢 كلاكسون
                  </button>
                  <button
                    type="button"
                    onClick={() => setTauntDrawerOpen((v) => !v)}
                    className="px-2 py-1.5 rounded-xl bg-slate-900/90 border border-amber-400/50 text-xs font-black text-amber-300"
                  >
                    😂
                  </button>

                  {/* Meme Weapon Button */}
                  <button
                    type="button"
                    disabled={!heldItemSpec}
                    onClick={handleUseItem}
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border-2 shadow-xl flex flex-col items-center justify-center transition-all ${
                      heldItemSpec
                        ? "bg-gradient-to-br from-fuchsia-600 to-amber-500 border-yellow-200 animate-pulse active:scale-90"
                        : "bg-slate-900/70 border-slate-700/70 opacity-60"
                    }`}
                  >
                    <span className="text-xl sm:text-2xl leading-none">
                      {heldItemSpec ? heldItemSpec.emoji : "🎲"}
                    </span>
                    <span className="text-[8px] font-black text-white truncate max-w-[46px]">
                      {heldItemSpec ? heldItemSpec.shortAr : "سلاح"}
                    </span>
                  </button>

                  {/* Nitro Boost Button */}
                  <button
                    type="button"
                    onPointerDown={() => {
                      touchNitroRef.current = true;
                      syncCombinedDriveInput();
                    }}
                    onPointerUp={() => {
                      touchNitroRef.current = false;
                      syncCombinedDriveInput();
                    }}
                    onPointerCancel={() => {
                      touchNitroRef.current = false;
                      syncCombinedDriveInput();
                    }}
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border-2 shadow-xl flex flex-col items-center justify-center active:scale-90 touch-none transition-all ${
                      nitroPct > 15
                        ? "bg-gradient-to-b from-cyan-500 to-blue-700 border-cyan-200 text-white"
                        : "bg-slate-900/80 border-slate-700 text-slate-400"
                    }`}
                  >
                    <Flame className="w-4 h-4" />
                    <span className="text-[9px] font-black">{nitroPct}%</span>
                  </button>
                </div>

                {/* Lower Pedals Row: Brake/Reverse + Power-Drift + Tall Gas Pedal */}
                <div className="flex items-end gap-1.5">
                  {/* Brake / Reverse Pedal */}
                  <button
                    type="button"
                    onPointerDown={() => {
                      touchBrakeRef.current = true;
                      syncCombinedDriveInput();
                    }}
                    onPointerUp={() => {
                      touchBrakeRef.current = false;
                      syncCombinedDriveInput();
                    }}
                    onPointerCancel={() => {
                      touchBrakeRef.current = false;
                      syncCombinedDriveInput();
                    }}
                    className="w-13 h-16 sm:w-15 sm:h-20 px-2 rounded-2xl bg-rose-950/90 active:bg-rose-600 border-2 border-rose-400/60 flex flex-col items-center justify-center text-rose-100 shadow-lg touch-none"
                  >
                    <span className="text-base leading-none">⏪</span>
                    <span className="text-[10px] font-black mt-1">فراني</span>
                  </button>

                  {/* Power-Drift Pedal (Maintains Forward Gas + Drift Hop!) */}
                  <button
                    type="button"
                    onPointerDown={() => {
                      touchDriftRef.current = true;
                      driveInputRef.current.hopRequested = true;
                      syncCombinedDriveInput();
                    }}
                    onPointerUp={() => {
                      touchDriftRef.current = false;
                      syncCombinedDriveInput();
                    }}
                    onPointerCancel={() => {
                      touchDriftRef.current = false;
                      syncCombinedDriveInput();
                    }}
                    className="w-16 h-20 sm:w-20 sm:h-24 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 active:scale-95 border-2 border-amber-200 shadow-2xl flex flex-col items-center justify-center text-slate-950 touch-none"
                  >
                    <span className="text-xl sm:text-2xl leading-none">💨</span>
                    <span className="text-xs font-black mt-1">دريفت</span>
                  </button>

                  {/* Primary Tall Accelerator GAS Pedal */}
                  <button
                    type="button"
                    onPointerDown={() => {
                      touchGasHoldRef.current = true;
                      syncCombinedDriveInput();
                    }}
                    onPointerUp={() => {
                      touchGasHoldRef.current = false;
                      syncCombinedDriveInput();
                    }}
                    onPointerCancel={() => {
                      touchGasHoldRef.current = false;
                      syncCombinedDriveInput();
                    }}
                    className={`w-16 h-24 sm:w-20 sm:h-28 rounded-3xl border-2 shadow-2xl flex flex-col items-center justify-center active:scale-95 touch-none transition-all ${
                      autoGas
                        ? "bg-emerald-500 border-white text-slate-950"
                        : "bg-gradient-to-b from-emerald-400 to-emerald-700 border-emerald-200 text-slate-950"
                    }`}
                  >
                    <Gauge className="w-6 h-6 sm:w-7 sm:h-7" />
                    <span className="text-xs sm:text-sm font-black mt-1">كسيري</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ========= DESKTOP PRO RACING TELEMETRY DOCK ========= */
            <div className="absolute bottom-0 inset-x-0 z-20 p-4 flex flex-col items-center gap-2 pointer-events-none">
              {tauntDrawerOpen && (
                <div
                  dir="rtl"
                  className="pointer-events-auto grid grid-cols-3 gap-1.5 p-2.5 rounded-2xl bg-slate-950/95 border border-amber-400/60 shadow-2xl mb-1"
                >
                  {KSIDA_TAUNT_ORDER.map((tid, idx) => {
                    const t = KSIDA_TAUNTS[tid];
                    return (
                      <button
                        key={tid}
                        type="button"
                        onClick={() => {
                          sendMemeTaunt(tid);
                          setTauntDrawerOpen(false);
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-amber-500/20 border border-slate-700 text-xs font-bold text-amber-200 text-right"
                      >
                        <span className="text-slate-400 font-mono ml-1">[{idx + 1}]</span>
                        {t.emoji} {t.textAr}
                      </button>
                    );
                  })}
                </div>
              )}

              <div
                dir="ltr"
                className="pointer-events-auto px-4 py-2.5 rounded-3xl bg-slate-950/85 backdrop-blur-md border border-slate-700/90 shadow-2xl flex items-center gap-4"
              >
                {/* Speed + Gear */}
                <div className="flex items-baseline gap-1.5 min-w-[115px]">
                  <span className="text-3xl font-black font-mono text-amber-300">
                    {speedKmh}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">KM/H</span>
                  <span className="ml-1 px-1.5 py-0.5 rounded-md bg-slate-800 border border-slate-600 text-xs font-mono font-black text-cyan-300">
                    {gearLabel}
                  </span>
                </div>

                {/* Armor HP & Nitro Bars */}
                <div className="w-44 space-y-1.5">
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-300 mb-0.5">
                      <span>🛡 الصلابة</span>
                      <span>{hpPct}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        style={{ width: `${hpPct}%` }}
                        className={`h-full transition-all ${
                          hpPct > 50
                            ? "bg-emerald-400"
                            : hpPct > 25
                            ? "bg-amber-400"
                            : "bg-rose-500"
                        }`}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-cyan-300 mb-0.5">
                      <span>🔥 النيترو [Shift]</span>
                      <span>{nitroPct}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        style={{ width: `${nitroPct}%` }}
                        className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Drift Stage Indicator */}
                {kin.isDrifting && kin.driftStage > 0 && (
                  <div
                    className={`px-3 py-1 rounded-xl text-xs font-black border ${
                      kin.driftStage === 3
                        ? "bg-purple-600 border-purple-200 text-white"
                        : kin.driftStage === 2
                        ? "bg-amber-500 border-yellow-200 text-slate-950"
                        : "bg-cyan-500 border-cyan-200 text-slate-950"
                    }`}
                  >
                    DRIFT x{kin.driftStage} ⚡
                  </div>
                )}

                {/* Meme Item Slot [E] */}
                <button
                  type="button"
                  disabled={!heldItemSpec}
                  onClick={handleUseItem}
                  className={`relative w-14 h-14 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${
                    heldItemSpec
                      ? "bg-gradient-to-br from-fuchsia-600 to-amber-500 border-yellow-200 animate-pulse hover:scale-105"
                      : "bg-slate-900/80 border-slate-700 opacity-65"
                  }`}
                  title="استعمل السلاح (E)"
                >
                  <span className="text-2xl leading-none">
                    {heldItemSpec ? heldItemSpec.emoji : "🎲"}
                  </span>
                  <span className="text-[9px] font-black text-white mt-0.5">
                    {heldItemSpec ? heldItemSpec.shortAr : "[E]"}
                  </span>
                </button>

                {/* Quick Horn & Meme Taunts */}
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={handleQuickHorn}
                    className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-[11px] font-black text-slate-950"
                    title="كلاكسون (H)"
                  >
                    📢 [H]
                  </button>
                  <button
                    type="button"
                    onClick={() => setTauntDrawerOpen((v) => !v)}
                    className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold text-amber-300"
                    title="ميمز (1-6)"
                  >
                    😂 ميمز
                  </button>
                </div>

                {/* Optional Touch Controls Toggle for Touchscreen Laptops */}
                <button
                  type="button"
                  onClick={() => setForceTouchHud(true)}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-white"
                  title="إظهار أزرار اللمس"
                >
                  <Gamepad2 className="w-4 h-4" />
                </button>
              </div>

              <div className="px-3.5 py-1 rounded-full bg-slate-950/75 border border-slate-800 text-[11px] text-slate-300 font-semibold">
                WASD / الأسهم: سياقة • Space: دريفت • Shift: نيترو • E: سلاح • R: إرجاع للطريق • Q: كاميرا خلفية • H: كلاكسون
              </div>
            </div>
          )}
        </>
      )}

      {/* === QUICK GARAGE VEHICLE SELECTOR MODAL === */}
      {garageOpen && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-amber-400/50 p-5 shadow-2xl max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Car className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-black text-amber-200">
                  گاراج الطوموبيلات الأسطورية 3D 🚕
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGarageOpen(false)}
                className="p-1.5 rounded-full bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {KSIDA_VEHICLE_ORDER.map((vid: KsidaVehicleId) => {
                const v = KSIDA_VEHICLES[vid];
                const selected = me?.vehicle === vid;
                return (
                  <button
                    key={vid}
                    type="button"
                    onClick={async () => {
                      ksidaSfx.playMemeHorn(0, true);
                      await selectLocalVehicle(vid);
                      setGarageOpen(false);
                    }}
                    className={`w-full p-3.5 rounded-2xl border text-right transition-all flex items-center justify-between gap-3 ${
                      selected
                        ? "bg-amber-500/20 border-amber-400 shadow-lg"
                        : "bg-slate-950/75 border-slate-800 hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{v.emoji}</span>
                      <div>
                        <div className="text-sm font-black text-white flex items-center gap-2">
                          <span>{v.nameAr}</span>
                          {selected && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                              مختارة ✓
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-300 mt-0.5">{v.taglineAr}</p>
                      </div>
                    </div>

                    <div className="text-[10px] font-bold text-amber-300 shrink-0 space-y-0.5 text-left">
                      <div>⚡ سرعة: {Math.round(v.topSpeed * 4.8)}</div>
                      <div>🛡 صلابة: {v.maxHp}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* === MATCH MODE, CONTROLS & BOT SETTINGS MODAL === */}
      {settingsOpen && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-cyan-400/50 p-5 shadow-2xl max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-cyan-200">إعدادات كسيدة رويال 3D ⚙️</h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="p-1.5 rounded-full bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 mb-4">
              {(["RACE", "DERBY", "HOT_BOMB"] as KsidaMode[]).map((m) => {
                const info = MODE_LABELS_AR[m];
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={!isHost}
                    onClick={async () => {
                      await onAction({ type: "CONFIGURE_MATCH", mode: m });
                      notifyRoomRefresh();
                      setSettingsOpen(false);
                    }}
                    className={`w-full p-3 rounded-2xl border text-right transition-all ${
                      active
                        ? "bg-cyan-950/80 border-cyan-400 text-white"
                        : "bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-600"
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black">{info.title}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 font-bold shrink-0">
                        {info.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{info.desc}</p>
                  </button>
                );
              })}
            </div>

            {/* Mobile Steering Preference */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/80 border border-slate-800 mb-3">
              <div>
                <div className="text-xs font-black text-white">نوع السياقة فالهاتف 📱</div>
                <div className="text-[10px] text-slate-400">
                  أزرار يسار/يمين احترافية أو مقود سحب
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTouchSteerStyle("PADDLES")}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black ${
                    touchSteerStyle === "PADDLES"
                      ? "bg-amber-400 text-slate-950"
                      : "bg-slate-800 text-slate-300"
                  }`}
                >
                  ◀ ▶ أزرار
                </button>
                <button
                  type="button"
                  onClick={() => setTouchSteerStyle("WHEEL")}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black ${
                    touchSteerStyle === "WHEEL"
                      ? "bg-amber-400 text-slate-950"
                      : "bg-slate-800 text-slate-300"
                  }`}
                >
                  🛞 مقود
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/80 border border-slate-800 mb-4">
              <div>
                <div className="text-xs font-black text-white">إضافة شيفورات بوتات مع الأصدقاء 🤖</div>
                <div className="text-[10px] text-slate-400">
                  فاللعب الفردي كيدخلو 5 بوتات أوتوماتيكياً
                </div>
              </div>
              <button
                type="button"
                disabled={!isHost}
                onClick={async () => {
                  await onAction({
                    type: "CONFIGURE_MATCH",
                    botFill: !settings.botFill,
                  });
                  notifyRoomRefresh();
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black ${
                  settings.botFill
                    ? "bg-emerald-500 text-slate-950"
                    : "bg-slate-800 text-slate-300"
                } disabled:opacity-50`}
              >
                {settings.botFill ? "شغال ON" : "طافي OFF"}
              </button>
            </div>

            {!isHost && (
              <p className="text-[11px] text-amber-300 text-center">
                غير قائد الغرفة (Host) يقدر يبدل الطور للجميع
              </p>
            )}
          </div>
        </div>
      )}

      {/* === LIVE STANDINGS OVERLAY === */}
      {standingsOpen && phase === "PLAYING" && (
        <div className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-amber-400/50 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-black text-amber-300">الترتيب المباشر 🏆</h3>
              <button
                type="button"
                onClick={() => setStandingsOpen(false)}
                className="p-1.5 rounded-full bg-slate-800 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5">
              {standings.map((r, idx) => (
                <div
                  key={r.id}
                  className={`px-3 py-2 rounded-xl flex items-center justify-between text-xs font-bold ${
                    r.id === myId
                      ? "bg-emerald-950/80 border border-emerald-400/60 text-emerald-200"
                      : "bg-slate-950/80 border border-slate-800 text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-black">#{idx + 1}</span>
                    <span>{KSIDA_VEHICLES[r.vehicle]?.emoji || "🚕"}</span>
                    <span>{r.nickname}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    {mode === "RACE" && (
                      <span className="text-cyan-300">
                        دورة {Math.min(settings.targetLaps, r.lap)}/{settings.targetLaps}
                      </span>
                    )}
                    <span className="text-rose-300">{r.takedowns} 💥</span>
                    <span className="text-amber-300">{r.score} نقطة</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === GAME OVER PODIUM & MEME ROAST CEREMONY === */}
      {phase === "GAME_OVER" && (
        <div className="fixed inset-0 z-40 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-3xl bg-slate-900 border-2 border-amber-400/70 p-5 sm:p-6 shadow-2xl my-auto">
            <div className="text-center mb-5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-black mb-2">
                <Crown className="w-4 h-4" />
                <span>حفل جوائز الكونسطا والكسيدة 🏆</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white">
                {winnerSummaryAr || "سالات الروينة فـ كسيدة رويال 3D!"}
              </h2>
            </div>

            {/* Hilarious Meme Superlative Badges */}
            {finalAwards.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-5">
                {finalAwards.map((aw) => (
                  <div
                    key={aw.id}
                    className="p-3 rounded-2xl bg-slate-950/90 border border-amber-400/40 flex items-start gap-2.5"
                  >
                    <span className="text-2xl shrink-0">{aw.emoji}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-amber-300">{aw.titleAr}</div>
                      <div className="text-sm font-black text-white truncate">{aw.winnerName}</div>
                      <div className="text-[10px] text-slate-400">{aw.subtitleAr}</div>
                      <div className="text-[10px] font-bold text-emerald-300 mt-0.5">
                        {aw.statLabel}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Final Scoreboard */}
            <div className="space-y-1.5 mb-5 max-h-44 overflow-y-auto">
              {standings.map((r, idx) => (
                <div
                  key={r.id}
                  className={`px-3.5 py-2 rounded-xl flex items-center justify-between text-xs font-bold ${
                    idx === 0
                      ? "bg-amber-500/20 border border-amber-400 text-amber-200"
                      : "bg-slate-950/80 border border-slate-800 text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-black text-amber-400">#{idx + 1}</span>
                    <span>{KSIDA_VEHICLES[r.vehicle]?.emoji || "🚕"}</span>
                    <span>{r.nickname}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-rose-300">{r.takedowns} تفركيعة 💥</span>
                    <span className="text-emerald-300 font-black">{r.score} نقطة</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Replay & Mode Switch Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={async () => {
                  ksidaSfx.playMemeHorn(1, true);
                  await onAction({ type: "PLAY_AGAIN" });
                  notifyRoomRefresh();
                }}
                className="py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-600 hover:brightness-110 text-white font-black text-sm shadow-xl flex items-center justify-center gap-2 active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>عاود السباق دابا! 🚕🔥</span>
              </button>

              <button
                type="button"
                onClick={() => setIsImmersive(false)}
                className="py-3.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold text-sm flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>رجوع للغرفة / بدل اللعبة</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isImmersive && mounted && typeof document !== "undefined") {
    return createPortal(gameContent, document.body);
  }
  return gameContent;
}
