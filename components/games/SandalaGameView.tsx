"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import confetti from "canvas-confetti";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/realtime/supabaseBrowser";
import {
  Sandala3DArena,
  SandalaFxEvent,
  SandalaLivePacket,
  SandalaLocalTransform,
} from "@/components/games/Sandala3DArena";
import {
  SandalaFeedItem,
  SandalaPhase,
  SandalaPlayerEntity,
  SandalaTrap,
} from "@/games/sandala/types";
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
  ChevronLeft,
  Maximize2,
  Minimize2,
  Smartphone,
  Flame,
  Sparkles,
  X,
} from "lucide-react";

interface SandalaGameViewProps {
  publicData: {
    phase: SandalaPhase;
    round: number;
    maxRounds: number;
    phaseStartedAt: number;
    phaseEndsAt: number;
    mamaIds: string[];
    entities: Record<string, SandalaPlayerEntity>;
    traps: SandalaTrap[];
    scores: Record<string, number>;
    feed: SandalaFeedItem[];
    roundWinner?: "MAMA" | "KIDS";
    roundHeadline?: string;
    roundSummary?: string;
    winnerId?: string;
  };
  privateData?: {
    myEntity: SandalaPlayerEntity | null;
    myScore: number;
  };
  isHost: boolean;
  onAction: (action: any, targetPlayerId?: string) => void;
  players: Array<{ id: string; nickname: string; isHost?: boolean }>;
  activePlayerId?: string;
  roomCode?: string;
  onRefresh?: () => void;
}

export function SandalaGameView({
  publicData,
  onAction,
  players,
  activePlayerId,
  roomCode: propRoomCode,
  onRefresh,
}: SandalaGameViewProps) {
  const params = useParams<{ code?: string }>();
  const resolvedRoomCode = (propRoomCode || params?.code || "").toString().toUpperCase();

  const {
    phase,
    round,
    maxRounds = 4,
    phaseEndsAt,
    entities = {},
    traps = [],
    scores = {},
    feed = [],
    roundWinner,
    roundHeadline,
    roundSummary,
    winnerId,
  } = publicData;

  const myId = activePlayerId || players[0]?.id || "";
  const myEntity = entities[myId];
  const isMama = myEntity?.role === "MAMA";
  const isKO = Boolean(myEntity?.isKO);

  const localPosRef = useRef<SandalaLocalTransform>({
    x: myEntity?.x ?? 0,
    z: myEntity?.z ?? 5,
    rotY: myEntity?.rotY ?? 0,
    camYaw: 0,
    camPitch: 0.52,
    isMoving: false,
  });

  const fxQueueRef = useRef<SandalaFxEvent[]>([]);
  const peersRef = useRef<Map<string, SandalaLivePacket>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastBroadcastRef = useRef<{ at: number; key: string }>({ at: 0, key: "" });
  const [isLive, setIsLive] = useState(false);

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Connect to Supabase Realtime Live Channel
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase || !resolvedRoomCode || !myId) return;

    const ch = supabase.channel(`sandala:${resolvedRoomCode}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    ch.on("broadcast", { event: "pos" }, ({ payload }) => {
      const p = payload as SandalaLivePacket;
      if (!p || p.i === myId) return;
      peersRef.current.set(p.i, { ...p, t: performance.now() });
    })
      .on("broadcast", { event: "fx" }, ({ payload }) => {
        const fx = payload as SandalaFxEvent;
        if (!fx || fx.i === myId) return;
        if (fx.k === "sandala") sound.playSandalaThrow();
        else if (fx.k === "broom") sound.playSlapSmack();
        else if (fx.k === "slip") sound.playCartoonSlip();
        else if (fx.k === "dance") sound.playChaabiBeat();
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
    (pkt: Omit<SandalaLivePacket, "i" | "t">) => {
      const ch = channelRef.current;
      if (!ch || !myId) return;
      const now = performance.now();
      const key = `${pkt.x.toFixed(2)}|${pkt.z.toFixed(2)}|${pkt.r.toFixed(2)}|${pkt.f ? 1 : 0}|${pkt.s ? 1 : 0}`;
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
          f: pkt.f,
          s: pkt.s,
          d: pkt.d,
          t: 0,
        },
      });
    },
    [myId]
  );

  const sendLiveFx = useCallback(
    (fx: Omit<SandalaFxEvent, "i">) => {
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

  const [secondsLeft, setSecondsLeft] = useState<number>(65);
  const [mounted, setMounted] = useState<boolean>(false);
  const [isImmersive, setIsImmersive] = useState<boolean>(true);
  const [browserFs, setBrowserFs] = useState<boolean>(false);
  const [iosHelpOpen, setIosHelpOpen] = useState<boolean>(false);

  const lastTimeUpSentRef = useRef<{ round: number; at: number }>({ round: 0, at: 0 });
  const lastServerSyncAtRef = useRef<number>(0);
  const prevHitsRef = useRef<number>(myEntity?.hearts ?? 3);

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

  // Sync spawn coordinates on round start
  useEffect(() => {
    if (myEntity) {
      localPosRef.current.x = myEntity.x;
      localPosRef.current.z = myEntity.z;
      localPosRef.current.rotY = myEntity.rotY;
      localPosRef.current.camYaw = Math.atan2(-myEntity.x, -myEntity.z);
      localPosRef.current.camPitch = 0.52;
      localPosRef.current.floppedUntil = 0;
      localPosRef.current.slippedUntil = 0;
      localPosRef.current.dancingUntil = 0;
      prevHitsRef.current = myEntity.hearts;
    }
  }, [round, myId]);

  // Play slap smack + vibrate when local Kid loses a heart!
  useEffect(() => {
    if (myEntity && myEntity.hearts < prevHitsRef.current) {
      sound.playSlapSmack();
      vibrate([80, 40, 80]);
    }
    if (myEntity) prevHitsRef.current = myEntity.hearts;
  }, [myEntity?.hearts]);

  // Countdown timer
  useEffect(() => {
    if (phase !== "ROUND_PLAY") return;
    const tick = () => {
      const now = Date.now();
      const rem = Math.max(0, Math.ceil((phaseEndsAt - now) / 1000));
      setSecondsLeft(rem);
      if (rem <= 0) {
        const prev = lastTimeUpSentRef.current;
        if (prev.round !== round || now - prev.at > 2500) {
          lastTimeUpSentRef.current = { round, at: now };
          onAction({ type: "TIME_UP", forRound: round });
          sendRefresh();
        }
      }
    };
    tick();
    const id = setInterval(tick, 350);
    return () => clearInterval(id);
  }, [phase, round, phaseEndsAt, onAction, sendRefresh]);

  // Confetti on round/game end
  useEffect(() => {
    if (phase === "ROUND_END" || phase === "GAME_OVER") {
      sound.playSuccess();
      try {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      } catch {}
    }
  }, [phase, round]);

  const playersMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of players) m[p.id] = p.nickname;
    return m;
  }, [players]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  }, [players, scores]);

  const survivingKidsCount = useMemo(() => {
    return Object.values(entities).filter((e) => e.role === "KID" && !e.isKO).length;
  }, [entities]);

  const handlePositionTick = useCallback(
    (x: number, z: number, rotY: number, isMoving: boolean) => {
      const nowEpoch = Date.now();
      sendLivePos({
        x,
        z,
        r: rotY,
        m: isMoving,
        f: nowEpoch <= (localPosRef.current.floppedUntil || 0),
        s: nowEpoch <= (localPosRef.current.slippedUntil || 0),
        d: nowEpoch <= (localPosRef.current.dancingUntil || 0),
      });

      const now = performance.now();
      const serverInterval = isLive ? 450 : 260;
      if (isMoving && now - lastServerSyncAtRef.current > serverInterval) {
        lastServerSyncAtRef.current = now;
        onAction({ type: "SYNC_POS", x, z, rotY });
      }
    },
    [onAction, sendLivePos, isLive]
  );

  // Triggered when local player steps on a Sabon Beldi trap in 3D
  const handleTriggerTrap = useCallback(
    (trapId: string, x: number, z: number) => {
      sound.playCartoonSlip();
      vibrate([50, 50, 50]);
      const fx: Omit<SandalaFxEvent, "i"> = { k: "slip", x, z };
      fxQueueRef.current.push({ ...fx, i: myId });
      sendLiveFx(fx);
      onAction({ type: "TRIGGER_SABON", trapId, x, z });
      sendRefresh();
    },
    [myId, onAction, sendLiveFx, sendRefresh]
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
  // MAMA ACTIONS (🩴 صندالة صواريخ / 🧹 شطابة / 😡 بلاتي نجيك)
  // =========================================================================
  const handleThrowSandala = () => {
    sound.playSandalaThrow();
    vibrate(45);
    const x = localPosRef.current.x;
    const z = localPosRef.current.z;
    const rotY = localPosRef.current.rotY;

    const fx: Omit<SandalaFxEvent, "i"> = { k: "sandala", x, z, r: rotY };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendLiveFx(fx);

    const nowPerf = performance.now();
    const targets: Array<{ id: string; x: number; z: number; flopped?: boolean }> = [];
    for (const ent of Object.values(entities)) {
      if (ent.role !== "KID" || ent.isKO) continue;
      const peer = peersRef.current.get(ent.playerId);
      if (peer && nowPerf - peer.t < 2000) {
        targets.push({ id: ent.playerId, x: peer.x, z: peer.z, flopped: peer.f });
      } else {
        targets.push({ id: ent.playerId, x: ent.x, z: ent.z });
      }
    }

    onAction({
      type: "THROW_SANDALA",
      x,
      z,
      rotY,
      targets,
    });
    sendRefresh();
  };

  const handleBroomSweep = () => {
    sound.playSlapSmack();
    vibrate([40, 30, 40]);
    const x = localPosRef.current.x;
    const z = localPosRef.current.z;

    const fx: Omit<SandalaFxEvent, "i"> = { k: "broom", x, z };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendLiveFx(fx);

    const nowPerf = performance.now();
    const targets: Array<{ id: string; x: number; z: number }> = [];
    for (const ent of Object.values(entities)) {
      if (ent.role !== "KID" || ent.isKO) continue;
      const peer = peersRef.current.get(ent.playerId);
      if (peer && nowPerf - peer.t < 2000) {
        targets.push({ id: ent.playerId, x: peer.x, z: peer.z });
      } else {
        targets.push({ id: ent.playerId, x: ent.x, z: ent.z });
      }
    }

    onAction({
      type: "BROOM_SWEEP",
      x,
      z,
      targets,
    });
    sendRefresh();
  };

  const handleMamaRage = () => {
    sound.playBuzzer();
    vibrate(50);
    const fx: Omit<SandalaFxEvent, "i"> = {
      k: "rage",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendLiveFx(fx);
    onAction({ type: "MAMA_RAGE" });
    sendRefresh();
  };

  // =========================================================================
  // KID MEME ACTIONS (😭 نبطح / 🧼 صابون بلدي / 👉 شكاية / 💃 شطيح)
  // =========================================================================
  const handleKidFlop = () => {
    sound.playCardFlip();
    vibrate(30);
    localPosRef.current.floppedUntil = Date.now() + 1500;
    const fx: Omit<SandalaFxEvent, "i"> = {
      k: "flop",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendLiveFx(fx);
    onAction({
      type: "KID_FLOP",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    });
  };

  const handleDropSabon = () => {
    sound.playCartoonSlip();
    vibrate(25);
    const fx: Omit<SandalaFxEvent, "i"> = {
      k: "sabon",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendLiveFx(fx);
    onAction({
      type: "DROP_SABON",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    });
    sendRefresh();
  };

  const handleSnitchFriend = () => {
    sound.playSuccess();
    vibrate(25);
    const fx: Omit<SandalaFxEvent, "i"> = {
      k: "snitch",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendLiveFx(fx);
    onAction({ type: "SNITCH_FRIEND" });
    sendRefresh();
  };

  const handleChaabiDance = () => {
    sound.playChaabiBeat();
    vibrate([25, 40, 25]);
    localPosRef.current.dancingUntil = Date.now() + 2200;
    const fx: Omit<SandalaFxEvent, "i"> = {
      k: "dance",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    };
    fxQueueRef.current.push({ ...fx, i: myId });
    sendLiveFx(fx);
    onAction({
      type: "CHAABI_DANCE",
      x: localPosRef.current.x,
      z: localPosRef.current.z,
    });
    sendRefresh();
  };

  const isActivePhase = phase === "ROUND_PLAY";

  const activeGameUI = isActivePhase ? (
    <div
      className={
        isImmersive
          ? "fixed inset-0 z-[100] w-screen h-[100dvh] bg-slate-950 overflow-hidden select-none"
          : "relative w-full rounded-3xl overflow-hidden border-2 border-pink-500/40 shadow-2xl bg-slate-950 select-none h-[520px] sm:h-[600px]"
      }
    >
      <Sandala3DArena
        phase={phase}
        myPlayerId={myId}
        entities={entities}
        traps={traps}
        localPosRef={localPosRef}
        joystickVecRef={joystickVecRef}
        peersRef={peersRef}
        fxQueueRef={fxQueueRef}
        onPositionTick={handlePositionTick}
        onTriggerTrap={handleTriggerTrap}
      />

      {/* TOP SINGLE-ROW GLASSMORPHIC HUD BAR */}
      <div
        className="absolute top-0 inset-x-0 px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] z-20 flex items-center justify-between gap-1.5 pointer-events-none"
        dir="ltr"
      >
        <div className="flex items-center gap-1 pointer-events-auto shrink-0">
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="px-2 py-1.5 rounded-xl bg-slate-900/85 hover:bg-slate-800 backdrop-blur-md border border-pink-400/40 text-pink-300 text-[11px] font-black flex items-center gap-1 shadow-lg active:scale-95"
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
            <span>{isLive ? "LIVE" : `R${round}/${maxRounds}`}</span>
          </span>
        </div>

        {/* Center Timer + Remaining Kids */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-black border bg-pink-600/35 border-pink-400 text-pink-100 backdrop-blur-md shadow-lg flex items-center gap-1">
            <span>⏱️ {secondsLeft}s</span>
            <span className="hidden sm:inline">• صندالة الواليدة 🩴</span>
          </span>

          <span className="px-2 py-1 rounded-full bg-slate-900/85 backdrop-blur-md border border-amber-400/40 text-amber-300 text-[11px] font-black shadow-lg">
            🏃‍♂️ {survivingKidsCount}
          </span>
        </div>

        {/* Right: Role & Hearts */}
        <div className="flex items-center gap-1 shrink-0" dir="rtl">
          {isMama ? (
            <span className="px-2.5 py-1 rounded-full bg-rose-950/90 backdrop-blur-md border border-pink-500/60 text-pink-200 text-[11px] font-black shadow-lg flex items-center gap-1">
              <span>🩴 أنت الواليدة!</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-indigo-950/90 backdrop-blur-md border border-indigo-400/50 text-indigo-200 text-[11px] font-black shadow-lg flex items-center gap-1">
              <span>🏃‍♂️</span>
              <span className="tracking-tighter">
                {isKO ? "💀 K.O" : "❤️".repeat(Math.max(0, myEntity?.hearts ?? 3))}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* LIVE ROAST & MEME FEED (Top-Right below HUD bar) */}
      <div className="absolute top-12 right-2.5 max-w-[225px] sm:max-w-[270px] space-y-1 pointer-events-none z-10">
        {feed.slice(0, 3).map((item) => (
          <div
            key={item.id}
            className="px-2.5 py-1 rounded-xl bg-black/70 backdrop-blur-md border border-white/10 text-[10px] sm:text-[11px] font-bold text-white shadow-md"
          >
            {item.text}
          </div>
        ))}
      </div>

      {/* K.O. BANNER FOR KIDS */}
      {!isMama && isKO && (
        <div className="absolute inset-x-4 top-14 max-w-sm mx-auto p-2.5 rounded-2xl bg-rose-950/90 backdrop-blur-md border border-pink-500/60 text-center z-20 pointer-events-none">
          <span className="text-xs font-black text-pink-200 block">
            🧎‍♂️😭 شبعتي صندالة وربّعتي يديك فـ القنت! تفرّج فـ صحابك
          </span>
        </div>
      )}

      {/* ================================================================= */}
      {/* BOTTOM DUAL-THUMB ARCADE OVERLAY (LEFT JOYSTICK + RIGHT MEMES)    */}
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
            className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-slate-950/65 backdrop-blur-md border-2 border-pink-400/50 relative flex items-center justify-center shadow-2xl touch-none cursor-pointer"
          >
            <span className="absolute top-1.5 text-[8px] font-black text-pink-300/60 pointer-events-none">
              ▲
            </span>
            <span className="absolute bottom-1.5 text-[8px] font-black text-pink-300/60 pointer-events-none">
              ▼
            </span>
            <span className="absolute left-1.5 text-[8px] font-black text-pink-300/60 pointer-events-none">
              ◀
            </span>
            <span className="absolute right-1.5 text-[8px] font-black text-pink-300/60 pointer-events-none">
              ▶
            </span>
            <div
              style={{
                transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
              }}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-pink-400 to-rose-600 border-2 border-white shadow-lg shadow-pink-500/40 pointer-events-none"
            />
          </div>
          <span className="hidden sm:inline-block text-[10px] font-bold text-slate-300/80 bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-sm">
            🕹️ تحرّك • دوز على الشاشة باش تدوّر الكاميرا
          </span>
        </div>

        {/* RIGHT: ROLE ACTION BUTTONS */}
        <div
          className="pointer-events-auto flex flex-col items-end gap-1.5"
          dir="rtl"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isMama ? (
            /* MAMA CONTROLS (🩴 صندالة صواريخ + 🧹 شطابة + 😡 غوتة) */
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={handleMamaRage}
                  className="px-3 py-2 rounded-2xl bg-amber-500/90 hover:bg-amber-400 border-2 border-amber-200 text-slate-950 font-black text-[11px] shadow-xl active:scale-90 transition-all flex items-center gap-1"
                >
                  <Flame className="w-4 h-4 shrink-0" />
                  <span>بلاتي نجيك! 😡</span>
                </button>

                <button
                  type="button"
                  onClick={handleBroomSweep}
                  className="px-3 py-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border-2 border-amber-400/70 text-amber-300 font-black text-xs shadow-xl active:scale-90 transition-all flex items-center justify-center gap-1"
                >
                  <span>شطابة! 🧹</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleThrowSandala}
                className="w-22 h-22 sm:w-28 sm:h-28 p-3 rounded-full bg-gradient-to-br from-pink-500 via-rose-600 to-orange-600 hover:brightness-110 border-4 border-pink-200 text-white font-black text-xs sm:text-sm shadow-2xl shadow-pink-600/50 active:scale-90 transition-all flex flex-col items-center justify-center gap-0.5"
              >
                <span className="text-2xl sm:text-3xl">🩴</span>
                <span>صندالة!</span>
              </button>
            </div>
          ) : (
            /* KID MEME 2x2 GRID (😭 نبطح / 🧼 صابون بلدي / 👉 شكاية / 💃 شطيح) */
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              <button
                type="button"
                disabled={isKO}
                onClick={handleSnitchFriend}
                className="px-3 py-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 disabled:opacity-40 backdrop-blur-md border-2 border-amber-400/60 text-amber-300 font-black text-[11px] sm:text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1"
              >
                <span>شكاية 👉</span>
              </button>

              <button
                type="button"
                disabled={isKO}
                onClick={handleChaabiDance}
                className="px-3 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 disabled:opacity-40 border-2 border-pink-300 text-white font-black text-[11px] sm:text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>شطيح 💃</span>
              </button>

              <button
                type="button"
                disabled={isKO}
                onClick={handleDropSabon}
                className="px-3 py-3 rounded-2xl bg-lime-600/90 hover:bg-lime-500 disabled:opacity-40 backdrop-blur-md border-2 border-lime-200 text-slate-950 font-black text-[11px] sm:text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1"
              >
                <span>صابون 🧼</span>
              </button>

              <button
                type="button"
                disabled={isKO}
                onClick={handleKidFlop}
                className="px-3.5 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 disabled:opacity-40 border-2 border-cyan-200 text-white font-black text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1"
              >
                <span>نبطح! 😭</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* iOS Fullscreen Modal */}
      {iosHelpOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIosHelpOpen(false)}
        >
          <div
            className="max-w-sm w-full rounded-3xl bg-slate-900 border-2 border-pink-400 p-5 text-right space-y-3 shadow-2xl"
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
              <h3 className="text-base font-black text-pink-300">
                📱 وضع الشاشة الكاملة فـ iPhone
              </h3>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              1️⃣ <strong>دوّر التيليفون بالعرض (Landscape)</strong> باش تلعب بـ جوج صباع بحال PUBG!
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              2️⃣ إلا بغيتي تحيّد شريط Safari: كليكي على زر المشاركة{" "}
              <strong>(Share ⬆️)</strong> واختار{" "}
              <strong>&quot;Add to Home Screen / إضافة إلى الشاشة الرئيسية&quot;</strong>.
            </p>
            <button
              type="button"
              onClick={() => setIosHelpOpen(false)}
              className="w-full py-2.5 rounded-2xl bg-pink-500 text-white font-black text-xs"
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
      {isActivePhase &&
        (isImmersive && mounted && typeof document !== "undefined"
          ? createPortal(activeGameUI, document.body)
          : activeGameUI)}

      {/* ===================================================================== */}
      {/* PHASE 2: ROUND_END                                                    */}
      {/* ===================================================================== */}
      {phase === "ROUND_END" && (
        <div className="rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-pink-500/50 p-6 text-center shadow-2xl space-y-4">
          <div className="text-4xl">
            {roundWinner === "MAMA" ? "🩴👑" : "🏃‍♂️😂"}
          </div>
          <h2 className="text-2xl font-black text-white">
            {roundHeadline || "سالات الجولة!"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto">
            {roundSummary}
          </p>

          <div className="space-y-2 max-w-md mx-auto text-right pt-2">
            {sortedPlayers.map((p, idx) => {
              const ent = entities[p.id];
              return (
                <div
                  key={p.id}
                  className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between"
                >
                  <span className="px-2.5 py-1 rounded-xl bg-pink-500/20 text-pink-300 font-black text-xs">
                    {scores[p.id] || 0} نقطة
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">
                      {ent?.role === "MAMA"
                        ? `🩴 الواليدة (${ent.hitsCount} ضربات)`
                        : ent?.isKO
                        ? "🧎‍♂️ كلَا العصا"
                        : `🏃‍♂️ فلت (${ent?.betrayalsCount || 0} غدر)`}
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
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-pink-500 to-orange-500 hover:brightness-110 text-white font-black text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span>
              {round >= maxRounds
                ? "شوف الفائز النهائي 🏆"
                : `الجولة ${round + 1} (تبديل الواليدة) 🔄`}
            </span>
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHASE 3: GAME_OVER                                                    */}
      {/* ===================================================================== */}
      {phase === "GAME_OVER" && (
        <div className="rounded-3xl bg-gradient-to-b from-pink-950/60 via-slate-900 to-slate-950 border-2 border-pink-400 p-6 text-center shadow-2xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-pink-500/20 border-2 border-pink-400 flex items-center justify-center mx-auto">
            <Trophy className="w-9 h-9 text-amber-400" />
          </div>

          <h2 className="text-3xl font-black text-white">
            👑 {playersMap[winnerId || sortedPlayers[0]?.id || ""] || "البطل"} أسطورة الصندالة 3D!
          </h2>

          <div className="space-y-2 max-w-md mx-auto text-right">
            {sortedPlayers.map((p, idx) => (
              <div
                key={p.id}
                className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                  idx === 0
                    ? "bg-pink-500/20 border-pink-400 text-white"
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
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 text-white font-black text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-5 h-5" />
            <span>نعاودو طرح جديد 3D! 🔄</span>
          </button>
        </div>
      )}
    </div>
  );
}
