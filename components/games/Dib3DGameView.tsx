"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import confetti from "canvas-confetti";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/realtime/supabaseBrowser";
import {
  Dib3DArena,
  Dib3DFxEvent,
  Dib3DLivePacket,
  Dib3DLocalTransform,
  Dib3DProximityState,
} from "@/components/games/Dib3DArena";
import {
  Dib3DMiniGameModal,
  Dib3DMinimap,
} from "@/components/games/Dib3DMiniGameModal";
import {
  DIB3D_TASK_STATIONS,
  DIB3D_VENTS,
  Dib3DChatMsg,
  Dib3DDeadBody,
  Dib3DPhase,
  Dib3DPlayerEntity,
  Dib3DRole,
  Dib3DTaskStationDef,
  Dib3DTaskStationId,
} from "@/games/dib3d/types";
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
  Trophy,
  RotateCcw,
  Maximize2,
  Minimize2,
  Smartphone,
  Zap,
  Skull,
  Eye,
  Crosshair,
  Megaphone,
  CheckCircle2,
  Circle,
  X,
} from "lucide-react";

interface Dib3DGameViewProps {
  publicData: {
    phase: Dib3DPhase;
    round: number;
    phaseStartedAt: number;
    phaseEndsAt: number;
    entities: Record<string, Dib3DPlayerEntity>;
    deadBodies: Dib3DDeadBody[];
    lightsOutUntil?: number;
    totalTasksCompleted: number;
    totalTasksRequired: number;
    scores: Record<string, number>;
    alivePlayerIds: string[];
    meetingCallerId?: string;
    meetingReason?: "BODY_REPORT" | "EMERGENCY_DRUM";
    reportedBody?: Dib3DDeadBody | null;
    votes: Record<string, string>;
    chatFeed: Dib3DChatMsg[];
    ejectedPlayerId?: string | null;
    ejectedHeadline?: string;
    ejectedSubtitle?: string;
    winnerTeam?: "VILLAGERS" | "WOLVES";
    winnerHeadline?: string;
    winnerSummary?: string;
  };
  privateData?: {
    isAlive: boolean;
    myEntity: Dib3DPlayerEntity | null;
    fellowWolfIds: string[];
    seerKnown: Record<string, "WOLF" | "INNOCENT">;
    myScore: number;
  };
  myRole?: string;
  isHost: boolean;
  onAction: (action: any, targetPlayerId?: string) => void;
  players: Array<{ id: string; nickname: string; isHost?: boolean }>;
  activePlayerId?: string;
  roomCode?: string;
  onRefresh?: () => void;
}

const ROLE_INFO: Record<
  Dib3DRole,
  { title: string; badge: string; desc: string; colorClass: string }
> = {
  WOLF: {
    title: "🐺 أنت الذيب الخائن!",
    badge: "🐺 الذيب",
    desc: "افترس ولاد الدرب فـ الزناقي المظلمة، تخشّى فـ القوادس بـ 6، وقطّع الضو بلا ما يعيقو بيك!",
    colorClass: "bg-rose-950/90 border-rose-500 text-rose-200",
  },
  SHERIFF: {
    title: "🎯 أنت القناص (المقدم)!",
    badge: "🎯 القناص",
    desc: "عندك رصاصة فضية! يلا ضربتي الذيب كيموت فوراً، ولكن يلا قتلتي ولد الدرب بريء كيموت هو وكتهرس المكحلة ديالك للأبد!",
    colorClass: "bg-amber-950/90 border-amber-400 text-amber-200",
  },
  SEER: {
    title: "🔮 أنت الشوافة!",
    badge: "🔮 الشوافة",
    desc: "قرّبي لأي لاعب فـ الدرب وكشفي الهالة ديالو واش ذيب خائن ولا ولد الدرب بريء!",
    colorClass: "bg-purple-950/90 border-purple-400 text-purple-200",
  },
  VILLAGER: {
    title: "👨‍🌾 أنت ولد الدرب!",
    badge: "👨‍🌾 ولد الدرب",
    desc: "استعمل الخريطة 🗺️ وكمّل المهام التفاعلية فـ الحومة الكبيرة، وبلّغ على أي جثة تلقاها!",
    colorClass: "bg-emerald-950/90 border-emerald-400 text-emerald-200",
  },
};

export function Dib3DGameView({
  publicData,
  privateData,
  myRole: propRole,
  isHost,
  onAction,
  players,
  activePlayerId,
  roomCode: propRoomCode,
  onRefresh,
}: Dib3DGameViewProps) {
  const params = useParams<{ code?: string }>();
  const resolvedRoomCode = (propRoomCode || params?.code || "").toString().toUpperCase();

  const {
    phase,
    round,
    phaseEndsAt,
    entities = {},
    deadBodies = [],
    lightsOutUntil,
    totalTasksCompleted = 0,
    totalTasksRequired = 8,
    scores = {},
    meetingCallerId,
    meetingReason,
    reportedBody,
    votes = {},
    chatFeed = [],
    ejectedHeadline,
    ejectedSubtitle,
    winnerTeam,
    winnerHeadline,
    winnerSummary,
  } = publicData;

  const myId = activePlayerId || players[0]?.id || "";
  const myPrivEnt = privateData?.myEntity || entities[myId] || null;
  const myRole: Dib3DRole =
    (propRole as Dib3DRole) || myPrivEnt?.role || "VILLAGER";
  const isAlive = myPrivEnt ? myPrivEnt.isAlive : true;
  const myAssignedTasks = myPrivEnt?.assignedTasks || [];
  const myCompletedTasks = myPrivEnt?.completedTasks || [];
  const fellowWolfIds = privateData?.fellowWolfIds || [];
  const seerKnown = privateData?.seerKnown || {};

  const localPosRef = useRef<Dib3DLocalTransform>({
    x: myPrivEnt?.x ?? 0,
    z: myPrivEnt?.z ?? 3.5,
    rotY: myPrivEnt?.rotY ?? 0,
    camYaw: 0,
    camPitch: 0.52,
    isMoving: false,
  });

  const [proximity, setProximity] = useState<Dib3DProximityState>({
    nearestTargetId: null,
    nearestBodyId: null,
    nearestBodyVictim: null,
    nearestTaskStationId: null,
    nearElectricBox: false,
    nearCentralDrum: false,
    nearVentId: null,
    playerX: myPrivEnt?.x ?? 0,
    playerZ: myPrivEnt?.z ?? 3.5,
    playerRotY: myPrivEnt?.rotY ?? 0,
  });
  const [activeMiniGameStation, setActiveMiniGameStation] =
    useState<Dib3DTaskStationDef | null>(null);

  const fxQueueRef = useRef<Dib3DFxEvent[]>([]);
  const peersRef = useRef<Map<string, Dib3DLivePacket>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastBroadcastRef = useRef<{ at: number; key: string }>({ at: 0, key: "" });
  const localShadowUntilRef = useRef<number>(0);
  const wasAliveRef = useRef<boolean>(isAlive);
  const [ambushBannerUntil, setAmbushBannerUntil] = useState<number>(0);
  const [isLive, setIsLive] = useState(false);

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Trigger Blind Ambush screen if isAlive transitions from true -> false during ROAM_3D
  useEffect(() => {
    if (wasAliveRef.current && !isAlive && phase === "ROAM_3D") {
      sound.playWolfKill();
      vibrate([120, 40, 160, 40, 200]);
      setAmbushBannerUntil(Date.now() + 6500);
    }
    wasAliveRef.current = isAlive;
  }, [isAlive, phase]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase || !resolvedRoomCode || !myId) return;

    const ch = supabase.channel(`dib3d:${resolvedRoomCode}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    ch.on("broadcast", { event: "pos" }, ({ payload }) => {
      const p = payload as Dib3DLivePacket;
      if (!p || p.i === myId) return;
      peersRef.current.set(p.i, { ...p, t: performance.now() });
    })
      .on("broadcast", { event: "fx" }, ({ payload }) => {
        const fx = payload as Dib3DFxEvent;
        if (!fx || fx.i === myId) return;
        if (fx.k === "kill") {
          sound.playWolfKill();
          // Immediately cloak the killer in shadow on all screens
          const prev = peersRef.current.get(fx.i);
          peersRef.current.set(fx.i, {
            i: fx.i,
            x: fx.x,
            z: fx.z,
            r: prev?.r ?? 0,
            m: false,
            s: true,
            t: performance.now(),
          });
          if (fx.v === myId) {
            vibrate([120, 40, 160, 40, 200]);
            setAmbushBannerUntil(Date.now() + 6500);
          }
        } else if (fx.k === "shoot" && fx.v === myId) {
          sound.playSlapSmack();
          vibrate([120, 40, 160]);
          setAmbushBannerUntil(Date.now() + 6500);
        } else if (fx.k === "shadow") {
          sound.playVentPop();
          const prev = peersRef.current.get(fx.i);
          peersRef.current.set(fx.i, {
            i: fx.i,
            x: fx.x,
            z: fx.z,
            r: prev?.r ?? 0,
            m: prev?.m,
            s: true,
            t: performance.now(),
          });
        } else if (fx.k === "vent") sound.playVentPop();
        else if (fx.k === "lights") sound.playLightsOut();
        else if (fx.k === "task" || fx.k === "fix") sound.playSuccess();
        fxQueueRef.current.push(fx);
      })
      .on("broadcast", { event: "refresh" }, () => {
        onRefreshRef.current?.();
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
  }, [resolvedRoomCode, myId]);

  const sendLivePos = useCallback(
    (pkt: Omit<Dib3DLivePacket, "i" | "t">) => {
      const ch = channelRef.current;
      if (!ch || !myId) return;
      const now = performance.now();
      const isShadowNow =
        Date.now() < localShadowUntilRef.current ||
        Boolean(myPrivEnt?.shadowUntil && Date.now() < myPrivEnt.shadowUntil);
      const key = `${pkt.x.toFixed(2)}|${pkt.z.toFixed(2)}|${pkt.r.toFixed(2)}|${isShadowNow ? 1 : 0}`;
      const since = now - lastBroadcastRef.current.at;
      if (since < 80) return;
      if (key === lastBroadcastRef.current.key && since < 900) return;
      lastBroadcastRef.current = { at: now, key };
      ch.send({
        type: "broadcast",
        event: "pos",
        payload: {
          i: myId,
          x: Math.round(pkt.x * 100) / 100,
          z: Math.round(pkt.z * 100) / 100,
          r: Math.round(pkt.r * 100) / 100,
          m: pkt.m,
          s: isShadowNow,
          t: 0,
        },
      });
    },
    [myId, myPrivEnt?.shadowUntil]
  );

  const sendLiveFx = useCallback(
    (fx: Omit<Dib3DFxEvent, "i">) => {
      channelRef.current?.send({
        type: "broadcast",
        event: "fx",
        payload: { ...fx, i: myId },
      });
    },
    [myId]
  );

  const sendRefresh = useCallback(() => {
    channelRef.current?.send({ type: "broadcast", event: "refresh", payload: {} });
  }, []);

  // Virtual thumb joystick state
  const joystickVecRef = useRef<{ dx: number; dz: number }>({ dx: 0, dz: 0 });
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const joyPointerIdRef = useRef<number | null>(null);

  const [mounted, setMounted] = useState<boolean>(false);
  const [isImmersive, setIsImmersive] = useState<boolean>(true);
  const [browserFs, setBrowserFs] = useState<boolean>(false);
  const [iosHelpOpen, setIosHelpOpen] = useState<boolean>(false);
  const [nowClock, setNowClock] = useState<number>(Date.now());
  const [tasksExpanded, setTasksExpanded] = useState<boolean>(true);

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

  // Sync coordinates when entering ROAM_3D
  useEffect(() => {
    if (phase === "ROAM_3D" && myPrivEnt) {
      localPosRef.current.x = myPrivEnt.x;
      localPosRef.current.z = myPrivEnt.z;
      localPosRef.current.rotY = myPrivEnt.rotY;
      localPosRef.current.camYaw = Math.atan2(-myPrivEnt.x, -myPrivEnt.z);
    }
    if (phase === "MEETING") {
      sound.playEmergencySiren();
      vibrate([100, 60, 120]);
    }
    if (phase === "GAME_OVER") {
      sound.playSuccess();
      try {
        confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
      } catch {}
    }
  }, [phase, round]);

  // 500ms clock for cooldowns, lights out, and meeting/ejection timers
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setNowClock(now);
      if (phase === "EJECTION_REVEAL" && now >= phaseEndsAt && isHost) {
        onAction({ type: "RESUME_ROAM" });
        sendRefresh();
      }
      if (phase === "MEETING" && now >= phaseEndsAt && isHost) {
        onAction({ type: "FINALIZE_VOTES" });
        sendRefresh();
      }
    }, 400);
    return () => clearInterval(id);
  }, [phase, phaseEndsAt, isHost, onAction, sendRefresh]);

  const playersMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of players) m[p.id] = p.nickname;
    return m;
  }, [players]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  }, [players, scores]);

  const handlePositionTick = useCallback(
    (x: number, z: number, rotY: number, isMoving: boolean) => {
      sendLivePos({ x, z, r: rotY, m: isMoving });
      const now = performance.now();
      const serverInterval = isLive ? 450 : 260;
      if (isMoving && now - lastServerSyncAtRef.current > serverInterval) {
        lastServerSyncAtRef.current = now;
        onAction({ type: "SYNC_POS", x, z, rotY });
      }
    },
    [onAction, sendLivePos, isLive]
  );

  // Multi-touch Joystick handlers
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
    joystickVecRef.current = { dx: dx / maxR, dz: dy / maxR };
  };

  const handleJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (joyPointerIdRef.current !== null) return;
    joyPointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
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
    onAction({
      type: "SYNC_POS",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
      rotY: localPosRef.current.rotY,
    });
  };

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

  // =========================================================================
  // 3D CONTEXTUAL ACTIONS
  // =========================================================================
  const killCooldownLeft = useMemo(() => {
    if (myRole !== "WOLF" || !myPrivEnt?.lastKillAt) return 0;
    const elapsed = (nowClock - myPrivEnt.lastKillAt) / 1000;
    return Math.max(0, Math.ceil(12 - elapsed));
  }, [myRole, myPrivEnt?.lastKillAt, nowClock]);

  const shadowActiveLeft = useMemo(() => {
    const until = Math.max(
      localShadowUntilRef.current,
      myPrivEnt?.shadowUntil || 0
    );
    if (nowClock >= until) return 0;
    return Math.ceil((until - nowClock) / 1000);
  }, [myPrivEnt?.shadowUntil, nowClock]);

  const shadowCooldownLeft = useMemo(() => {
    if (myRole !== "WOLF" || !myPrivEnt?.lastShadowAt) return 0;
    const elapsed = (nowClock - myPrivEnt.lastShadowAt) / 1000;
    return Math.max(0, Math.ceil(16 - elapsed));
  }, [myRole, myPrivEnt?.lastShadowAt, nowClock]);

  const isLightsOut = Boolean(lightsOutUntil && nowClock < lightsOutUntil);
  const taskPercent = Math.min(
    100,
    Math.round((totalTasksCompleted / Math.max(1, totalTasksRequired)) * 100)
  );

  const handleWolfShadow = () => {
    if (shadowCooldownLeft > 0 || shadowActiveLeft > 0) return;
    sound.playVentPop();
    vibrate([40, 25, 40]);
    localShadowUntilRef.current = Date.now() + 10000;
    const fx: Omit<Dib3DFxEvent, "i"> = {
      k: "shadow",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendLiveFx(fx);
    onAction({ type: "WOLF_SHADOW" });
    sendRefresh();
  };

  const handleWolfKill = () => {
    if (!proximity.nearestTargetId || killCooldownLeft > 0) return;
    sound.playWolfKill();
    vibrate([70, 30, 90]);
    const targetId = proximity.nearestTargetId;
    const peer = peersRef.current.get(targetId);
    const ent = entities[targetId];
    const tx = peer ? peer.x : ent?.x ?? localPosRef.current.x;
    const tz = peer ? peer.z : ent?.z ?? localPosRef.current.z;

    localPosRef.current.x = tx;
    localPosRef.current.z = tz;
    localShadowUntilRef.current = Math.max(
      localShadowUntilRef.current,
      Date.now() + 5000
    );
    const fx: Omit<Dib3DFxEvent, "i"> = {
      k: "kill",
      v: targetId,
      x: tx,
      z: tz,
    };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendLiveFx(fx);

    onAction({
      type: "WOLF_KILL",
      targetId,
      x: localPosRef.current.x,
      z: localPosRef.current.z,
      targetX: tx,
      targetZ: tz,
    });
    sendRefresh();
  };

  const handleWolfVent = () => {
    if (!proximity.nearVentId) return;
    sound.playVentPop();
    vibrate(40);
    const currentIdx = DIB3D_VENTS.findIndex((v) => v.id === proximity.nearVentId);
    const nextVent =
      DIB3D_VENTS[(Math.max(0, currentIdx) + 1) % DIB3D_VENTS.length];
    localPosRef.current.x = nextVent.x;
    localPosRef.current.z = nextVent.z;

    const fx: Omit<Dib3DFxEvent, "i"> = {
      k: "vent",
      x: nextVent.x,
      z: nextVent.z,
    };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendLiveFx(fx);

    onAction({ type: "WOLF_VENT", fromVentId: proximity.nearVentId });
    sendRefresh();
  };

  const handleSabotageLights = () => {
    sound.playLightsOut();
    vibrate(50);
    sendLiveFx({
      k: "lights",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    });
    onAction({ type: "SABOTAGE_LIGHTS" });
    sendRefresh();
  };

  const handleFixLights = () => {
    sound.playSuccess();
    vibrate(35);
    const fx: Omit<Dib3DFxEvent, "i"> = {
      k: "fix",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendLiveFx(fx);
    onAction({ type: "FIX_LIGHTS" });
    sendRefresh();
  };

  const handleOpenTaskMiniGame = () => {
    if (!proximity.nearestTaskStationId) return;
    const st = DIB3D_TASK_STATIONS.find(
      (s) => s.id === proximity.nearestTaskStationId
    );
    if (!st) return;
    sound.playCardFlip();
    vibrate(25);
    setActiveMiniGameStation(st);
  };

  const handleCompleteTaskById = (stationId: Dib3DTaskStationId) => {
    setActiveMiniGameStation(null);
    sound.playSuccess();
    vibrate([30, 40, 30]);
    const fx: Omit<Dib3DFxEvent, "i"> = {
      k: "task",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendLiveFx(fx);
    onAction({
      type: "COMPLETE_TASK",
      stationId,
    });
    sendRefresh();
  };

  const sheriffCooldownLeft = useMemo(() => {
    if (myRole !== "SHERIFF" || !myPrivEnt?.lastSheriffShotAt) return 0;
    const elapsed = (nowClock - myPrivEnt.lastSheriffShotAt) / 1000;
    return Math.max(0, Math.ceil(20 - elapsed));
  }, [myRole, myPrivEnt?.lastSheriffShotAt, nowClock]);

  const handleSheriffShoot = () => {
    if (!proximity.nearestTargetId || sheriffCooldownLeft > 0) return;
    sound.playSlapSmack();
    vibrate([80, 40, 80]);
    const fx: Omit<Dib3DFxEvent, "i"> = {
      k: "shoot",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendLiveFx(fx);
    onAction({
      type: "SHERIFF_SHOOT",
      targetId: proximity.nearestTargetId,
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    });
    sendRefresh();
  };

  const handleSeerScan = () => {
    if (!proximity.nearestTargetId) return;
    sound.playSuccess();
    vibrate(40);
    const fx: Omit<Dib3DFxEvent, "i"> = {
      k: "scan",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendLiveFx(fx);
    onAction({
      type: "SEER_SCAN",
      targetId: proximity.nearestTargetId,
    });
  };

  const handleReportBody = () => {
    if (!proximity.nearestBodyId) return;
    sound.playEmergencySiren();
    vibrate([100, 50, 100]);
    onAction({ type: "REPORT_BODY", bodyId: proximity.nearestBodyId });
    sendRefresh();
  };

  const handleCallMeeting = () => {
    sound.playEmergencySiren();
    vibrate([100, 50, 100]);
    onAction({ type: "CALL_MEETING" });
    sendRefresh();
  };

  const roleMeta = ROLE_INFO[myRole];
  const currentTaskStation = DIB3D_TASK_STATIONS.find(
    (s) => s.id === proximity.nearestTaskStationId
  );

  const isRoamPhase = phase === "ROAM_3D";

  const activeRoamUI = isRoamPhase ? (
    <div
      className={
        isImmersive
          ? "fixed inset-0 z-[100] w-screen h-[100dvh] bg-slate-950 overflow-hidden select-none"
          : "relative w-full rounded-3xl overflow-hidden border-2 border-rose-500/40 shadow-2xl bg-slate-950 select-none h-[520px] sm:h-[600px]"
      }
    >
      <Dib3DArena
        phase={phase}
        myPlayerId={myId}
        myRole={myRole}
        isMyPlayerAlive={isAlive}
        myAssignedTasks={myAssignedTasks}
        myCompletedTasks={myCompletedTasks}
        fellowWolfIds={fellowWolfIds}
        seerKnown={seerKnown}
        entities={entities}
        deadBodies={deadBodies}
        lightsOutUntil={lightsOutUntil}
        playersMap={playersMap}
        localPosRef={localPosRef}
        joystickVecRef={joystickVecRef}
        peersRef={peersRef}
        fxQueueRef={fxQueueRef}
        onPositionTick={handlePositionTick}
        onProximityChange={setProximity}
      />

      {/* TOP HUD BAR */}
      <div
        className="absolute top-0 inset-x-0 px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] z-20 flex items-center justify-between gap-1.5 pointer-events-none"
        dir="ltr"
      >
        <div className="flex items-center gap-1 pointer-events-auto shrink-0">
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="px-2 py-1.5 rounded-xl bg-slate-900/85 hover:bg-slate-800 backdrop-blur-md border border-rose-400/40 text-rose-300 text-[11px] font-black flex items-center gap-1 shadow-lg active:scale-95"
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">
              {browserFs ? "خروج" : "شاشة كاملة"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsImmersive((v) => !v)}
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
            <span>{isLive ? "LIVE" : `R${round}`}</span>
          </span>
        </div>

        {/* Center Baraka Task Progress Bar */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-emerald-400/40 px-2.5 py-1 rounded-full shadow-lg">
          <span className="text-[10px] font-black text-emerald-300">
            🥖 مهام الحومة {taskPercent}%
          </span>
          <div className="w-16 sm:w-28 h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-300"
              style={{ width: `${taskPercent}%` }}
            />
          </div>
        </div>

        {/* Right: Role Badge */}
        <div className="flex items-center gap-1 shrink-0" dir="rtl">
          <span
            className={`px-2.5 py-1 rounded-full backdrop-blur-md border text-[11px] font-black shadow-lg flex items-center gap-1 ${roleMeta.colorClass}`}
          >
            <span>{!isAlive ? `👻 روح (${roleMeta.badge})` : roleMeta.badge}</span>
          </span>
        </div>
      </div>

      {/* LIGHTS SABOTAGE WARNING BANNER */}
      {isLightsOut && (
        <div className="absolute top-12 inset-x-4 max-w-md mx-auto p-2 rounded-2xl bg-rose-950/95 border-2 border-amber-400 text-center z-20 pointer-events-none animate-pulse">
          <span className="text-xs font-black text-amber-300 block">
            ⚡ الضو مقطوع فـ المدينة! تبع الخريطة 🗺️ لـ صندوق الضو (شرق) باش تشعلو!
          </span>
        </div>
      )}

      {/* HUNTER NOTICE BANNER (e.g. Broken Gun or Wolf Eliminated) */}
      {myPrivEnt?.lastNotice && (
        <div className="absolute top-24 inset-x-4 max-w-md mx-auto p-2.5 rounded-2xl bg-slate-950/95 border-2 border-amber-400 text-center z-20 pointer-events-none shadow-2xl">
          <span className="text-xs font-black text-amber-200 block">
            {myPrivEnt.lastNotice}
          </span>
        </div>
      )}

      {/* TOP-RIGHT MEDINA LABYRINTH MINIMAP (76x76m) */}
      <div className="absolute top-12 right-2.5 z-20 pointer-events-auto">
        <Dib3DMinimap
          playerX={proximity.playerX}
          playerZ={proximity.playerZ}
          myRole={myRole}
          assignedTasks={myAssignedTasks}
          completedTasks={myCompletedTasks}
          isLightsOut={isLightsOut}
        />
      </div>

      {/* TOP-LEFT TASK CHECKLIST / ROLE BRIEFING */}
      <div
        className="absolute top-12 left-2.5 z-20 pointer-events-auto max-w-[195px] sm:max-w-[235px]"
        dir="rtl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setTasksExpanded((v) => !v)}
          className="w-full px-3 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-white/15 text-right text-[11px] font-black text-amber-300 flex items-center justify-between shadow-lg"
        >
          <span>
            {myRole === "WOLF"
              ? "🐺 خطة الذيب السرية"
              : `📋 مهامك (${myCompletedTasks.length}/${myAssignedTasks.length})`}
          </span>
          <span>{tasksExpanded ? "▲" : "▼"}</span>
        </button>

        {tasksExpanded && (
          <div className="mt-1 p-2.5 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-white/10 space-y-1.5 text-right shadow-xl max-h-[210px] overflow-y-auto">
            <p className="text-[10px] text-slate-300 leading-snug">{roleMeta.desc}</p>
            {myRole !== "WOLF" && (
              <div className="space-y-1 pt-1 border-t border-white/10">
                {myAssignedTasks.map((tid) => {
                  const st = DIB3D_TASK_STATIONS.find((s) => s.id === tid);
                  const done = myCompletedTasks.includes(tid);
                  return (
                    <div
                      key={tid}
                      className={`flex items-center gap-1.5 text-[10px] font-bold ${
                        done ? "text-emerald-400 line-through" : "text-amber-200"
                      }`}
                    >
                      {done ? (
                        <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
                      ) : (
                        <Circle className="w-3 h-3 shrink-0 text-amber-400" />
                      )}
                      <span>
                        {st?.emoji} {st?.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* BOTTOM DUAL-THUMB CONTROLS (LEFT JOYSTICK + RIGHT CONTEXTUAL)     */}
      {/* ================================================================= */}
      <div
        className="absolute bottom-0 inset-x-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex items-end justify-between gap-2 pointer-events-none"
        dir="ltr"
      >
        {/* LEFT: VIRTUAL JOYSTICK */}
        <div className="flex flex-col items-center gap-1 pointer-events-auto shrink-0">
          <div
            ref={joyBaseRef}
            onPointerDown={handleJoyDown}
            onPointerMove={handleJoyMove}
            onPointerUp={handleJoyUp}
            onPointerCancel={handleJoyUp}
            className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-slate-950/65 backdrop-blur-md border-2 border-rose-400/50 relative flex items-center justify-center shadow-2xl touch-none cursor-pointer"
          >
            <span className="absolute top-1.5 text-[8px] font-black text-rose-300/60 pointer-events-none">
              ▲
            </span>
            <span className="absolute bottom-1.5 text-[8px] font-black text-rose-300/60 pointer-events-none">
              ▼
            </span>
            <span className="absolute left-1.5 text-[8px] font-black text-rose-300/60 pointer-events-none">
              ◀
            </span>
            <span className="absolute right-1.5 text-[8px] font-black text-rose-300/60 pointer-events-none">
              ▶
            </span>
            <div
              style={{
                transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
              }}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 border-2 border-white shadow-lg pointer-events-none"
            />
          </div>
        </div>

        {/* RIGHT: CONTEXTUAL 3D ACTION BUTTONS */}
        <div
          className="pointer-events-auto flex flex-col items-end gap-2"
          dir="rtl"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* 1. REPORT DEAD BODY (Highest Priority when near a corpse!) */}
          {isAlive && proximity.nearestBodyId && (
            <button
              type="button"
              onClick={handleReportBody}
              className="px-4 py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-orange-600 border-2 border-white text-white font-black text-xs sm:text-sm shadow-2xl shadow-rose-600/60 animate-bounce flex items-center gap-2 active:scale-95"
            >
              <Megaphone className="w-5 h-5" />
              <span>📢 بلّغ على جثة {proximity.nearestBodyVictim}!</span>
            </button>
          )}

          {/* 2. FIX SABOTAGED LIGHTS (When near Electric Box) */}
          {isAlive && isLightsOut && proximity.nearElectricBox && (
            <button
              type="button"
              onClick={handleFixLights}
              className="px-4 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 border-2 border-white text-slate-950 font-black text-xs sm:text-sm shadow-2xl animate-pulse flex items-center gap-1.5 active:scale-95"
            >
              <Zap className="w-5 h-5" />
              <span>🔧 شعل الضو د الدرب! (+35 ن)</span>
            </button>
          )}

          {/* 3. RING CENTRAL EMERGENCY DRUM */}
          {isAlive &&
            proximity.nearCentralDrum &&
            (myPrivEnt?.meetingsLeft ?? 1) > 0 && (
              <button
                type="button"
                onClick={handleCallMeeting}
                className="px-3.5 py-2.5 rounded-2xl bg-amber-500/90 hover:bg-amber-400 border-2 border-amber-200 text-slate-950 font-black text-xs shadow-xl flex items-center gap-1.5 active:scale-95"
              >
                <span>🥁 دق طبل الدرب (اجتماع طارئ)</span>
              </button>
            )}

          {/* 4. OPEN INTERACTIVE MOROCCAN MINI-GAME TASK */}
          {myRole !== "WOLF" && currentTaskStation && (
            <button
              type="button"
              onClick={handleOpenTaskMiniGame}
              className="px-4 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 border-2 border-emerald-200 text-white font-black text-xs sm:text-sm shadow-2xl shadow-emerald-600/50 animate-bounce flex items-center gap-1.5 active:scale-95"
            >
              <span>🛠️ {currentTaskStation.actionLabel}</span>
            </button>
          )}

          {/* 5. WOLF ABILITIES (Kill / Shadow Cloak / Sewer Vent / Sabotage Lights) */}
          {isAlive && myRole === "WOLF" && (
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  disabled={shadowCooldownLeft > 0 || shadowActiveLeft > 0}
                  onClick={handleWolfShadow}
                  className={`px-3 py-2 rounded-2xl border-2 font-black text-[11px] shadow-xl flex items-center gap-1 active:scale-95 transition-all ${
                    shadowActiveLeft > 0
                      ? "bg-purple-950 border-purple-400 text-purple-200 animate-pulse"
                      : shadowCooldownLeft > 0
                      ? "bg-slate-900/75 border-slate-700 text-slate-400 opacity-60"
                      : "bg-gradient-to-r from-purple-900 to-slate-900 border-purple-400 text-purple-200"
                  }`}
                >
                  <span>
                    {shadowActiveLeft > 0
                      ? `🌑 مخفّي فـ الظل (${shadowActiveLeft}s)`
                      : shadowCooldownLeft > 0
                      ? `🌑 عباءة الظل (${shadowCooldownLeft}s)`
                      : "🌑 لبس عباءة الظل (10s)"}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isLightsOut}
                  onClick={handleSabotageLights}
                  className="px-3 py-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 disabled:opacity-40 border-2 border-amber-400/70 text-amber-300 font-black text-[11px] shadow-xl flex items-center gap-1 active:scale-95"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>قطّع الضو ⚡</span>
                </button>

                <button
                  type="button"
                  disabled={!proximity.nearVentId}
                  onClick={handleWolfVent}
                  className={`px-3 py-2.5 rounded-2xl border-2 font-black text-xs shadow-xl flex items-center gap-1 active:scale-95 transition-all ${
                    proximity.nearVentId
                      ? "bg-purple-600 border-purple-200 text-white animate-pulse"
                      : "bg-slate-900/70 border-slate-700 text-slate-400 opacity-50"
                  }`}
                >
                  <span>🕳️ تخشّى فـ القادوس</span>
                </button>
              </div>

              <button
                type="button"
                disabled={!proximity.nearestTargetId || killCooldownLeft > 0}
                onClick={handleWolfKill}
                className={`w-24 h-24 sm:w-28 sm:h-28 p-2.5 rounded-full border-4 font-black text-xs sm:text-sm shadow-2xl flex flex-col items-center justify-center gap-0.5 active:scale-90 transition-all ${
                  proximity.nearestTargetId && killCooldownLeft <= 0
                    ? "bg-gradient-to-br from-rose-600 via-red-600 to-orange-600 border-rose-200 text-white shadow-rose-600/60 scale-105"
                    : "bg-slate-900/80 border-slate-700 text-slate-400"
                }`}
              >
                <Skull className="w-7 h-7" />
                <span className="truncate max-w-[82px]">
                  {killCooldownLeft > 0
                    ? `⏱️ ${killCooldownLeft}s`
                    : proximity.nearestTargetId
                    ? `افترس ${entities[proximity.nearestTargetId]?.maskEmoji || "🎭"}`
                    : "قرّب لضحية"}
                </span>
              </button>
            </div>
          )}

          {/* 6. SHERIFF SILVER BULLET (OR BROKEN GUN NOTICE) */}
          {isAlive && myRole === "SHERIFF" && (
            <>
              {myPrivEnt?.sheriffGunBroken ? (
                <div className="px-3.5 py-2.5 rounded-2xl bg-rose-950/90 border-2 border-rose-500/60 text-rose-200 font-black text-[11px] shadow-xl">
                  💥 المكحلة تهرسات (قتلتي ولد الدرب بريء!)
                </div>
              ) : (myPrivEnt?.sheriffBullets ?? 0) > 0 ? (
                <button
                  type="button"
                  disabled={!proximity.nearestTargetId || sheriffCooldownLeft > 0}
                  onClick={handleSheriffShoot}
                  className={`px-4 py-3.5 rounded-2xl border-2 font-black text-xs sm:text-sm shadow-2xl flex items-center gap-1.5 active:scale-95 transition-all ${
                    proximity.nearestTargetId && sheriffCooldownLeft <= 0
                      ? "bg-gradient-to-r from-amber-500 to-orange-600 border-amber-200 text-slate-950"
                      : "bg-slate-900/80 border-slate-700 text-slate-400 opacity-60"
                  }`}
                >
                  <Crosshair className="w-4 h-4" />
                  <span>
                    {sheriffCooldownLeft > 0
                      ? `⏳ الرصاصة كتوجد (${sheriffCooldownLeft}s)`
                      : proximity.nearestTargetId
                      ? `🎯 أطلق رصاصة الفضة على ${entities[proximity.nearestTargetId]?.maskEmoji || "🎭"} ${entities[proximity.nearestTargetId]?.maskName || ""}!`
                      : "🎯 قرّب للمشتبه باش تضربو"}
                  </span>
                </button>
              ) : null}
            </>
          )}

          {/* 7. SEER AURA SCAN */}
          {isAlive &&
            myRole === "SEER" &&
            (myPrivEnt?.seerScansLeft ?? 0) > 0 && (
              <button
                type="button"
                disabled={!proximity.nearestTargetId}
                onClick={handleSeerScan}
                className={`px-4 py-3.5 rounded-2xl border-2 font-black text-xs sm:text-sm shadow-2xl flex items-center gap-1.5 active:scale-95 transition-all ${
                  proximity.nearestTargetId
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 border-purple-200 text-white"
                    : "bg-slate-900/80 border-slate-700 text-slate-400 opacity-60"
                }`}
              >
                <Eye className="w-4 h-4" />
                <span>
                  {proximity.nearestTargetId
                    ? `🔮 اكشف هالة ${entities[proximity.nearestTargetId]?.maskEmoji || "🎭"} (${myPrivEnt?.seerScansLeft})`
                    : `🔮 قرّب للاعب لكشف هالته (${myPrivEnt?.seerScansLeft})`}
                </span>
              </button>
            )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* INSTANT FULL-SCREEN BLIND AMBUSH OVERLAY ON VICTIM'S PHONE!       */}
      {/* ================================================================= */}
      {(nowClock < ambushBannerUntil ||
        Boolean(myPrivEnt?.killedAt && nowClock - myPrivEnt.killedAt < 6500)) && (
        <div
          className="fixed inset-0 z-[160] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-100"
          dir="rtl"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="text-7xl sm:text-8xl animate-bounce mb-4">🐺💥</div>
          <h2 className="text-2xl sm:text-4xl font-black text-rose-500 mb-2">
            غدرك طيف الظلام من اللور!
          </h2>
          <p className="text-sm sm:text-base font-bold text-amber-200 max-w-md mb-4">
            هجم عليك الذيب فـ الظلام بلا ما تشوف شكون هو!
          </p>
          <div className="max-w-md w-full p-4 rounded-2xl bg-rose-950/80 border-2 border-rose-500 space-y-2 mb-5">
            <p className="text-base font-black text-white">
              🤫 ممنوع تهضر أو تلمّح للحيين!
            </p>
            <p className="text-xs text-rose-200 leading-relaxed">
              أنت دابا روح (👻) فـ الدرب — بقى ساكت باش ما تخسرش اللعب، وكمّل المهام ديالك كـ روح باش تعاون ولاد الدرب يربحو!
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAmbushBannerUntil(0)}
            className="px-6 py-3 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs shadow-xl active:scale-95"
          >
            👻 كمّل كـ روح بـ سكات
          </button>
        </div>
      )}

      {/* INTERACTIVE MOROCCAN TASK MINI-GAME MODAL */}
      {activeMiniGameStation && (
        <Dib3DMiniGameModal
          station={activeMiniGameStation}
          onComplete={handleCompleteTaskById}
          onClose={() => setActiveMiniGameStation(null)}
        />
      )}

      {/* iOS Fullscreen Modal */}
      {iosHelpOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIosHelpOpen(false)}
        >
          <div
            className="max-w-sm w-full rounded-3xl bg-slate-900 border-2 border-rose-400 p-5 text-right space-y-3 shadow-2xl"
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
              <h3 className="text-base font-black text-rose-300">
                📱 وضع الشاشة الكاملة فـ iPhone
              </h3>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              دوّر التيليفون بالعرض (Landscape) باش تلعب فـ الدرب 3D بـ جوج صباع!
            </p>
            <button
              type="button"
              onClick={() => setIosHelpOpen(false)}
              className="w-full py-2.5 rounded-2xl bg-rose-600 text-white font-black text-xs"
            >
              مفهوم، يالاه نلعبو! 🎮
            </button>
          </div>
        </div>
      )}
    </div>
  ) : null;

  const meetingSecondsLeft = Math.max(
    0,
    Math.ceil((phaseEndsAt - nowClock) / 1000)
  );
  const myVote = votes[myId];

  return (
    <div className="max-w-4xl mx-auto w-full space-y-4 pb-6 text-right">
      {isRoamPhase &&
        (isImmersive && mounted && typeof document !== "undefined"
          ? createPortal(activeRoamUI, document.body)
          : activeRoamUI)}

      {/* ===================================================================== */}
      {/* PHASE 2: EMERGENCY MEETING & COURTROOM VOTING                         */}
      {/* ===================================================================== */}
      {phase === "MEETING" && (
        <div className="rounded-3xl bg-gradient-to-b from-slate-900 via-slate-950 to-black border-2 border-rose-500/60 p-4 sm:p-6 shadow-2xl space-y-4">
          {/* Header Banner */}
          <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/40 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-right">
            <span className="px-3 py-1 rounded-full bg-rose-600 text-white font-black text-xs">
              ⏱️ باقي للتصويت: {meetingSecondsLeft}s
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white">
                {meetingReason === "BODY_REPORT"
                  ? `🚨 لقينا جثة ${reportedBody?.victimName || "ضحية"} (${reportedBody?.zoneName || "فـ الدرب"})!`
                  : `🥁 اجتماع طارئ فـ ساحة الدرب (عيّط ليه ${playersMap[meetingCallerId || ""] || "لاعب"})!`}
              </h2>
              <p className="text-xs text-rose-200">
                ناقشوا وصوّتوا على شكون الذيب الخائن باش تطردوه من الدرب!
              </p>
            </div>
          </div>

          {/* 1-Tap Darija Quick-Chat Accusations & Defenses */}
          {isAlive && (
            <div className="flex flex-wrap gap-1.5 justify-end">
              {[
                { text: "👉 شفتو واقف حدا الجثة!", type: "ACCUSE" as const },
                { text: "🕳️ شفتو خارج من القادوس!", type: "ACCUSE" as const },
                { text: "✋ والله كنت فـ الفران كنطرح الخبز!", type: "DEFEND" as const },
                { text: "🍵 كنت فـ القهوة كنشحّر أتاي!", type: "DEFEND" as const },
                { text: "🔮 سمعوني مزيان، عندي معلومة مؤكدة!", type: "INFO" as const },
              ].map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    sound.playCardFlip();
                    onAction({
                      type: "QUICK_CHAT",
                      text: q.text,
                      chatType: q.type,
                    });
                    sendRefresh();
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-[11px] font-bold text-amber-200 active:scale-95 transition-all"
                >
                  {q.text}
                </button>
              ))}
            </div>
          )}

          {/* Live Courtroom Feed */}
          <div className="p-3 rounded-2xl bg-black/50 border border-slate-800 max-h-36 overflow-y-auto space-y-1.5">
            {chatFeed.map((msg) => (
              <div
                key={msg.id}
                className="text-xs flex items-center justify-end gap-1.5"
              >
                <span className="text-slate-200">{msg.text}</span>
                <strong className="text-amber-400">:{msg.senderName}</strong>
              </div>
            ))}
          </div>

          {/* Player Voting Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {players.map((p) => {
              const ent = entities[p.id];
              const pAlive = ent?.isAlive !== false;
              const hasVoted = Boolean(votes[p.id]);
              const isMyTarget = myVote === p.id;
              const seerTag = seerKnown[p.id];

              return (
                <div
                  key={p.id}
                  className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                    !pAlive
                      ? "bg-rose-950/20 border-rose-900/30 opacity-55"
                      : isMyTarget
                      ? "bg-rose-600/25 border-rose-400"
                      : "bg-slate-900 border-slate-800"
                  }`}
                >
                  <div>
                    {pAlive && isAlive && !myVote && (
                      <button
                        type="button"
                        onClick={() => {
                          sound.playCardFlip();
                          onAction({ type: "CAST_VOTE", targetId: p.id });
                          sendRefresh();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs active:scale-95"
                      >
                        🗳️ صوّت عليه
                      </button>
                    )}
                    {isMyTarget && (
                      <span className="px-2.5 py-1 rounded-xl bg-rose-500 text-white font-black text-[11px]">
                        ✅ صوّتّي عليه
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {hasVoted && pAlive && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                        صوّت ✔️
                      </span>
                    )}
                    {seerTag && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                          seerTag === "WOLF"
                            ? "bg-rose-600 text-white"
                            : "bg-emerald-600 text-white"
                        }`}
                      >
                        {seerTag === "WOLF" ? "🐺 ذيب!" : "🟢 بريء"}
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-800 border border-white/10 text-amber-200 font-bold">
                      {ent?.maskEmoji || "🎭"} {ent?.maskName || "قناع"}
                    </span>
                    <span
                      className={`text-sm font-black ${
                        pAlive ? "text-white" : "text-rose-300 line-through"
                      }`}
                    >
                      {p.nickname} {!pAlive && "💀"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Skip Vote + Host Finalize */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            {isHost && (
              <button
                type="button"
                onClick={() => {
                  onAction({ type: "FINALIZE_VOTES" });
                  sendRefresh();
                }}
                className="px-4 py-2.5 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-300 font-bold text-xs"
              >
                ⚡ حسم التصويت دابا
              </button>
            )}

            {isAlive && !myVote && (
              <button
                type="button"
                onClick={() => {
                  sound.playCardFlip();
                  onAction({ type: "CAST_VOTE", targetId: "SKIP" });
                  sendRefresh();
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-black text-xs"
              >
                🏳️ تخطي التصويت (ما متأكدش)
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHASE 3: EJECTION REVEAL                                              */}
      {/* ===================================================================== */}
      {phase === "EJECTION_REVEAL" && (
        <div className="rounded-3xl bg-gradient-to-b from-slate-900 to-black border-2 border-amber-400/60 p-8 text-center shadow-2xl space-y-4">
          <div className="text-5xl animate-bounce">🌕🐺</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {ejectedHeadline}
          </h2>
          <p className="text-sm text-slate-300 max-w-md mx-auto">
            {ejectedSubtitle}
          </p>
          <button
            type="button"
            onClick={() => {
              onAction({ type: "RESUME_ROAM" });
              sendRefresh();
            }}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 font-black text-sm shadow-xl"
          >
            كمّلو الليلة فـ الدرب 3D 🏃‍♂️
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHASE 4: GAME OVER                                                    */}
      {/* ===================================================================== */}
      {phase === "GAME_OVER" && (
        <div className="rounded-3xl bg-gradient-to-b from-rose-950/60 via-slate-900 to-slate-950 border-2 border-amber-400 p-6 text-center shadow-2xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center mx-auto">
            <Trophy className="w-9 h-9 text-amber-400" />
          </div>

          <span
            className={`inline-block px-3 py-1 rounded-full text-xs font-black ${
              winnerTeam === "WOLVES"
                ? "bg-rose-600 text-white"
                : "bg-emerald-600 text-white"
            }`}
          >
            {winnerTeam === "WOLVES" ? "🐺 فوز الذيابة!" : "👨‍🌾 فوز ولاد الدرب!"}
          </span>

          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {winnerHeadline}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto">
            {winnerSummary}
          </p>

          <div className="space-y-2 max-w-md mx-auto text-right">
            {sortedPlayers.map((p, idx) => {
              const ent = entities[p.id];
              return (
                <div
                  key={p.id}
                  className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between"
                >
                  <span className="px-3 py-1 rounded-xl bg-black/40 font-black text-emerald-400 text-xs">
                    {scores[p.id] || 0} نقطة
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-amber-300 font-bold">
                      {ent?.role === "WOLF"
                        ? "🐺 الذيب"
                        : ent?.role === "SHERIFF"
                        ? "🎯 الصياد"
                        : ent?.role === "SEER"
                        ? "🔮 الشوافة"
                        : "👨‍🌾 ولد الدرب"}
                    </span>
                    <span className="text-sm font-black text-white">
                      {p.nickname}
                    </span>
                    <span>
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playCardFlip();
              onAction({ type: "RESTART_GAME" });
              sendRefresh();
            }}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 text-white font-black text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-5 h-5" />
            <span>نعاودو طرح جديد فـ الدرب 3D! 🔄</span>
          </button>
        </div>
      )}
    </div>
  );
}
