"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import confetti from "canvas-confetti";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/realtime/supabaseBrowser";
import { sound } from "@/lib/sound";
import {
  BattleFeedItem,
  CORSAIR_STYLES,
  CannonShotRecord,
  PirateShipState,
  Pirates3DAction,
  SeaLootCrate,
  WIN_GOLD_TARGET,
  WIN_SINKS_TARGET,
} from "@/games/pirates3d/types";
import Pirates3DCanvas, {
  PiratesFxEvent,
  PiratesLivePacket,
  PiratesLocalTransform,
} from "./Pirates3DCanvas";

export interface Pirates3DGameViewProps {
  publicData: Record<string, any>;
  privateData?: Record<string, any>;
  isHost?: boolean;
  onAction: (action: Pirates3DAction) => Promise<void> | void;
  players?: any[];
  activePlayerId?: string;
  roomCode?: string;
  onRefresh?: () => void;
}

export function Pirates3DGameView({
  publicData,
  privateData,
  onAction,
  activePlayerId,
  roomCode: propRoomCode,
  onRefresh,
}: Pirates3DGameViewProps) {
  const params = useParams<{ code?: string }>();
  const resolvedRoomCode = (propRoomCode || params?.code || "")
    .toString()
    .toUpperCase();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const phase = String(publicData?.phase ?? "PLAYING") as
    | "PLAYING"
    | "GAME_OVER";
  const round = Number(publicData?.round ?? 1);
  const endsAt = Number(publicData?.endsAt ?? Date.now() + 180_000);
  const aiBotsEnabled = Boolean(publicData?.aiBotsEnabled ?? true);
  const shipsMap =
    (publicData?.ships as Record<string, PirateShipState>) ?? {};
  const lootCrates = (publicData?.lootCrates as SeaLootCrate[]) ?? [];
  const recentShots = (publicData?.recentShots as CannonShotRecord[]) ?? [];
  const battleFeed = (publicData?.battleFeed as BattleFeedItem[]) ?? [];
  const winnerId = (publicData?.winnerId as string | null) ?? null;
  const winnerSummaryAr =
    (publicData?.winnerSummaryAr as string | null) ?? null;

  const myShipId = useMemo(() => {
    const candidate = activePlayerId || String(privateData?.myShipId ?? "");
    if (candidate && shipsMap[candidate]) return candidate;
    const firstHuman = Object.values(shipsMap).find((s) => !s.isBot);
    return firstHuman?.id ?? Object.keys(shipsMap)[0] ?? "player_1";
  }, [activePlayerId, privateData?.myShipId, shipsMap]);

  const myShip = shipsMap[myShipId];

  const localPosRef = useRef<PiratesLocalTransform>({
    x: myShip?.x ?? 0,
    z: myShip?.z ?? 32,
    rotY: myShip?.yaw ?? Math.PI,
    camYaw: Math.atan2(-(myShip?.x ?? 0), -(myShip?.z ?? 32)),
    camPitch: 0.46,
    aimYaw: Math.atan2(-(myShip?.x ?? 0), -(myShip?.z ?? 32)),
    lockedTargetId: null,
    targetWorldX: 0,
    targetWorldZ: 0,
    isMoving: false,
  });

  // Multi-touch 360 Virtual Thumb Joystick State (Same proven feel as Sandala & Dib3D!)
  const joystickVecRef = useRef<{ dx: number; dz: number }>({ dx: 0, dz: 0 });
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const joyPointerIdRef = useRef<number | null>(null);

  const [lockedTargetId, setLockedTargetId] = useState<string | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());

  // Realtime Broadcast Peers & FX Queue for 60fps Multiplayer
  const peersRef = useRef<Map<string, PiratesLivePacket>>(new Map());
  const fxQueueRef = useRef<PiratesFxEvent[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastBroadcastAtRef = useRef<number>(0);
  const lastServerSyncAtRef = useRef<number>(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Sync spawn coordinates on round start or respawn
  useEffect(() => {
    if (myShip) {
      localPosRef.current.x = myShip.x;
      localPosRef.current.z = myShip.z;
      localPosRef.current.rotY = myShip.yaw;
      localPosRef.current.camYaw = Math.atan2(-myShip.x, -myShip.z);
    }
  }, [round, myShipId]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase || !resolvedRoomCode || !myShipId) return;

    const ch = supabase.channel(`pirates:${resolvedRoomCode}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    ch.on("broadcast", { event: "pos" }, ({ payload }) => {
      const p = payload as PiratesLivePacket;
      if (!p || p.i === myShipId) return;
      peersRef.current.set(p.i, { ...p, t: performance.now() });
    })
      .on("broadcast", { event: "fx" }, ({ payload }) => {
        const fx = payload as PiratesFxEvent;
        if (!fx || fx.i === myShipId) return;
        sound.playGlassCrack();
        fxQueueRef.current.push(fx);
      })
      .on("broadcast", { event: "refresh" }, () => {
        onRefreshRef.current?.();
      })
      .subscribe();

    channelRef.current = ch;
    return () => {
      channelRef.current = null;
      peersRef.current.clear();
      supabase.removeChannel(ch);
    };
  }, [resolvedRoomCode, myShipId]);

  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Periodic server sync for AI bots & crate pickups even when stationary
  useEffect(() => {
    if (phase !== "PLAYING") return;
    const timer = setInterval(() => {
      const lp = localPosRef.current;
      onAction({
        type: "SYNC_SHIP",
        x: Number(lp.x.toFixed(2)),
        z: Number(lp.z.toFixed(2)),
        yaw: Number(lp.rotY.toFixed(3)),
        speed: lp.isMoving ? 10 : 0,
      });
    }, 800);
    return () => clearInterval(timer);
  }, [phase, onAction]);

  // Confetti on Victory
  useEffect(() => {
    if (phase === "GAME_OVER") {
      sound.playSuccess();
      try {
        confetti({ particleCount: 95, spread: 75, origin: { y: 0.6 } });
      } catch {
        // Ignore in headless tests
      }
    }
  }, [phase]);

  const handlePositionTick = useCallback(
    (x: number, z: number, rotY: number, isMoving: boolean) => {
      const now = performance.now();
      if (isMoving && now - lastBroadcastAtRef.current > 80) {
        lastBroadcastAtRef.current = now;
        channelRef.current?.send({
          type: "broadcast",
          event: "pos",
          payload: {
            i: myShipId,
            x: Math.round(x * 100) / 100,
            z: Math.round(z * 100) / 100,
            r: Math.round(rotY * 100) / 100,
            m: isMoving,
            t: 0,
          },
        });
      }

      if (isMoving && now - lastServerSyncAtRef.current > 360) {
        lastServerSyncAtRef.current = now;
        onAction({
          type: "SYNC_SHIP",
          x: Number(x.toFixed(2)),
          z: Number(z.toFixed(2)),
          yaw: Number(rotY.toFixed(3)),
          speed: 10,
        });
      }
    },
    [myShipId, onAction]
  );

  // Virtual Thumb Joystick Handlers
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
    const lp = localPosRef.current;
    onAction({
      type: "SYNC_SHIP",
      x: Number(lp.x.toFixed(2)),
      z: Number(lp.z.toFixed(2)),
      yaw: Number(lp.rotY.toFixed(3)),
      speed: 0,
    });
  };

  const handleFireCannon = useCallback(
    (
      mode: "SINGLE" | "TRIPLE",
      overrideAimYaw?: number,
      overrideTx?: number,
      overrideTz?: number,
      overrideTargetId?: string
    ) => {
      if (phase !== "PLAYING") return;
      if (myShip && myShip.sunkUntil > Date.now()) return;

      const lp = localPosRef.current;
      const aimYaw = overrideAimYaw ?? lp.aimYaw;
      const tx = overrideTx ?? lp.targetWorldX;
      const tz = overrideTz ?? lp.targetWorldZ;
      const targetId =
        overrideTargetId ?? lp.lockedTargetId ?? undefined;

      sound.playGlassCrack();

      const fx: PiratesFxEvent = {
        k: mode === "TRIPLE" ? "triple" : "cannon",
        i: myShipId,
        fx: lp.x,
        fz: lp.z,
        tx,
        tz,
        hit: Boolean(targetId),
      };
      fxQueueRef.current.push(fx);
      channelRef.current?.send({
        type: "broadcast",
        event: "fx",
        payload: fx,
      });

      onAction({
        type: "FIRE_CANNON",
        mode,
        fromX: Number(lp.x.toFixed(2)),
        fromZ: Number(lp.z.toFixed(2)),
        aimYaw: Number(aimYaw.toFixed(3)),
        targetX: Number(tx.toFixed(2)),
        targetZ: Number(tz.toFixed(2)),
        targetShipId: targetId,
      });
      channelRef.current?.send({
        type: "broadcast",
        event: "refresh",
        payload: {},
      });
    },
    [phase, myShip, myShipId, onAction]
  );

  const handleWindBoost = useCallback(() => {
    if (phase !== "PLAYING") return;
    sound.playCardFlip();
    onAction({ type: "WIND_BOOST" });
  }, [phase, onAction]);

  // Keyboard shortcuts for firing cannons (Space / F / Shift)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        handleFireCannon("SINGLE");
      } else if (e.code === "KeyF") {
        e.preventDefault();
        handleFireCannon("TRIPLE");
      } else if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        e.preventDefault();
        handleWindBoost();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleFireCannon, handleWindBoost]);

  const leaderboard = useMemo(() => {
    return Object.values(shipsMap).sort(
      (a, b) => b.goldScore - a.goldScore || b.sinks - a.sinks
    );
  }, [shipsMap]);

  const remainingSec = Math.max(0, Math.ceil((endsAt - nowTs) / 1000));
  const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const ss = String(remainingSec % 60).padStart(2, "0");

  const isSunk = Boolean(myShip && myShip.sunkUntil > nowTs);
  const tripleCooldownLeft = myShip
    ? Math.max(0, Math.ceil((myShip.lastBroadsideAt + 3800 - nowTs) / 1000))
    : 0;
  const boostCooldownLeft = myShip
    ? Math.max(0, Math.ceil((myShip.lastBoostAt + 6000 - nowTs) / 1000))
    : 0;

  const lockedShipName = lockedTargetId
    ? shipsMap[lockedTargetId]?.nickname ?? null
    : null;

  if (!mounted) return null;

  const content = (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9999] w-screen h-screen overflow-hidden bg-[#0284c7] text-white select-none font-sans flex flex-col"
    >
      {/* ZONE 1: COMPACT DOCKED TOP HEADER BAR */}
      <header className="shrink-0 z-20 bg-slate-950/95 border-b border-sky-800/70 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="rounded-xl bg-gradient-to-r from-amber-500/25 to-sky-500/25 border border-amber-400/60 px-2.5 py-1 flex items-center gap-1.5">
            <span className="text-sm">🏴‍☠️</span>
            <span className="text-xs font-black text-amber-300">
              قراصنة سلا 3D
            </span>
          </div>

          <div className="rounded-xl bg-slate-900 border border-slate-700 px-2.5 py-1 text-xs font-black text-sky-200">
            ⏱️ {mm}:{ss}
          </div>

          {myShip && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-900/90 border border-slate-700 px-2.5 py-1 text-xs font-black">
              <span className="text-emerald-300">
                ❤️ {myShip.hp}/{myShip.maxHp}
              </span>
              {myShip.shield > 0 && (
                <span className="text-sky-300">🛡️ {myShip.shield}</span>
              )}
              <span className="text-amber-300">
                💰 {myShip.goldScore}/{WIN_GOLD_TARGET}
              </span>
              <span className="text-rose-300">
                💀 {myShip.sinks}/{WIN_SINKS_TARGET}
              </span>
            </div>
          )}
        </div>

        {/* Top Captains + Actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="hidden md:flex items-center gap-1.5">
            {leaderboard.slice(0, 3).map((s, idx) => {
              const st =
                CORSAIR_STYLES[s.styleIndex % CORSAIR_STYLES.length] ??
                CORSAIR_STYLES[0];
              return (
                <div
                  key={s.id}
                  className={`rounded-lg px-2 py-0.5 text-[11px] font-bold border ${
                    s.id === myShipId
                      ? "border-amber-400/60 bg-amber-500/15 text-amber-200"
                      : "border-slate-700 bg-slate-900 text-slate-300"
                  }`}
                >
                  {idx === 0 ? "👑" : st.emblem} {s.nickname}: {s.goldScore}💰 (
                  {s.sinks}💀)
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playCardFlip();
              onAction({ type: "TOGGLE_AI_BOTS" });
            }}
            className={`rounded-xl border px-2.5 py-1 text-[11px] font-black transition-all active:scale-95 ${
              aiBotsEnabled
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                : "border-slate-700 bg-slate-900 text-slate-300"
            }`}
          >
            🤖 أسطول البوت: {aiBotsEnabled ? "مفعّل ✓" : "مغلق"}
          </button>

          <button
            type="button"
            onClick={() => setShowRulesModal(true)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-black text-amber-300"
          >
            📜 القواعد
          </button>
        </div>
      </header>

      {/* ZONE 2: CENTER 3D OCEAN VIEWPORT + OVERLAY JOYSTICK & ACTION CONTROLS */}
      <main className="relative flex-1 min-h-0 w-full overflow-hidden">
        <Pirates3DCanvas
          myShipId={myShipId}
          ships={shipsMap}
          lootCrates={lootCrates}
          recentShots={recentShots}
          localPosRef={localPosRef}
          joystickVecRef={joystickVecRef}
          peersRef={peersRef}
          fxQueueRef={fxQueueRef}
          onPositionTick={handlePositionTick}
          onLockedTargetChange={setLockedTargetId}
          onTapFire={(aimYaw, tx, tz, targetId) =>
            handleFireCannon("SINGLE", aimYaw, tx, tz, targetId)
          }
        />

        {/* Top-Center Battle Feed & Auto-Lock Indicator */}
        <div className="pointer-events-none absolute top-2 inset-x-0 flex flex-col items-center gap-1 px-3">
          {lockedShipName ? (
            <div className="rounded-full bg-rose-950/90 border-2 border-rose-400 px-4 py-1 text-xs font-black text-rose-200 shadow-lg animate-pulse">
              🎯 الهدف مقفل على: {lockedShipName} — اضغط 💣 للقصف المباشر!
            </div>
          ) : (
            battleFeed[0] && (
              <div className="rounded-full bg-slate-950/85 border border-sky-400/40 px-3.5 py-1 text-[11px] font-bold text-amber-200 shadow-lg">
                {battleFeed[0].textAr}
              </div>
            )
          )}
        </div>

        {/* Sunk Respawn Overlay Pill */}
        {isSunk && (
          <div className="pointer-events-none absolute inset-x-0 top-14 flex justify-center px-4">
            <div className="rounded-2xl bg-rose-950/95 border-2 border-rose-400 px-5 py-2.5 text-center shadow-2xl animate-pulse">
              <div className="text-sm font-black text-rose-200">
                ⚓ غرقت سفينتك! جاري إنزال سفينة جديدة خلال ثوانٍ...
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM-LEFT: 360° MULTI-TOUCH ANALOG THUMB JOYSTICK */}
        <div
          dir="ltr"
          className="absolute bottom-3 left-4 z-20 flex flex-col items-center gap-1"
        >
          <div
            ref={joyBaseRef}
            onPointerDown={handleJoyDown}
            onPointerMove={handleJoyMove}
            onPointerUp={handleJoyUp}
            onPointerCancel={handleJoyUp}
            className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-slate-950/65 border-2 border-sky-400/60 backdrop-blur-md shadow-[0_0_24px_rgba(14,165,233,0.35)] flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
          >
            {/* Compass Ring Markings */}
            <div className="pointer-events-none absolute inset-2 rounded-full border border-dashed border-sky-300/30" />
            <span className="pointer-events-none absolute top-1.5 text-[9px] font-black text-sky-300/70">
              ▲
            </span>
            <span className="pointer-events-none absolute bottom-1.5 text-[9px] font-black text-sky-300/70">
              ▼
            </span>
            <span className="pointer-events-none absolute left-2 text-[9px] font-black text-sky-300/70">
              ◀
            </span>
            <span className="pointer-events-none absolute right-2 text-[9px] font-black text-sky-300/70">
              ▶
            </span>

            {/* Thumb Knob */}
            <div
              style={{
                transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
              }}
              className="pointer-events-none w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-sky-500 border-2 border-white shadow-lg flex items-center justify-center text-base"
            >
              ⛵
            </div>
          </div>
          <span className="text-[10px] font-black text-white/90 bg-slate-950/70 px-2 py-0.5 rounded-full">
            جويستيك الإبحار (أو WASD)
          </span>
        </div>

        {/* BOTTOM-RIGHT: TACTICAL CANNON & ABILITY CLUSTER */}
        <div className="absolute bottom-3 right-4 z-20 flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSunk || boostCooldownLeft > 0}
              onClick={handleWindBoost}
              className="rounded-2xl border-2 border-emerald-400 bg-slate-950/85 hover:bg-emerald-500/30 px-3 py-2 text-xs font-black text-emerald-200 shadow-lg backdrop-blur-md active:scale-95 disabled:opacity-50"
            >
              ⚡ سرعة + إصلاح{" "}
              {boostCooldownLeft > 0 ? `(${boostCooldownLeft}s)` : ""}
            </button>

            <button
              type="button"
              disabled={isSunk || tripleCooldownLeft > 0}
              onClick={() => handleFireCannon("TRIPLE")}
              className="rounded-2xl border-2 border-orange-400 bg-slate-950/85 hover:bg-orange-500/30 px-3 py-2 text-xs font-black text-orange-200 shadow-lg backdrop-blur-md active:scale-95 disabled:opacity-50"
            >
              🔥 وابل ثلاثي{" "}
              {tripleCooldownLeft > 0 ? `(${tripleCooldownLeft}s)` : ""}
            </button>
          </div>

          <button
            type="button"
            disabled={isSunk}
            onClick={() => handleFireCannon("SINGLE")}
            className={`rounded-3xl border-2 px-6 py-3.5 text-sm sm:text-base font-black shadow-2xl transition-all active:scale-95 disabled:opacity-50 ${
              lockedShipName
                ? "border-white bg-gradient-to-r from-rose-600 via-red-500 to-amber-400 text-white shadow-[0_0_25px_rgba(244,63,94,0.85)] animate-pulse"
                : "border-amber-300 bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.5)]"
            }`}
          >
            {lockedShipName
              ? `🎯 قصف ${lockedShipName.slice(0, 10)}! 💣`
              : "💣 إطلاق المدفع!"}
          </button>
        </div>
      </main>

      {/* ZONE 3: SLIM CREDITS FOOTER */}
      <footer
        dir="ltr"
        className="shrink-0 z-20 bg-slate-950/95 border-t border-sky-900/60 py-1.5 px-3 flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold text-slate-400"
      >
        <span>Created by sampiw:</span>
        <a
          href="https://github.com/sampiw"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-200 hover:text-white underline-offset-2 hover:underline"
        >
          GitHub @sampiw
        </a>
      </footer>

      {/* RULES MODAL */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-3xl border border-amber-400/50 bg-slate-900 p-6 text-right shadow-2xl space-y-3">
            <h3 className="text-xl font-black text-amber-300">
              🏴‍☠️ قواعد قراصنة سلا 3D: حرب السفن
            </h3>
            <div className="space-y-2 text-xs sm:text-sm text-slate-200 leading-relaxed">
              <p>
                • <strong className="text-amber-300">جويستيك الإبحار 360°:</strong>{" "}
                حرك الجويستيك (أو <strong className="text-white">WASD</strong>) في أي اتجاه باش تبحر بسفينتك بكل سلاسة!
              </p>
              <p>
                • <strong className="text-sky-300">تصويب الكاميرا والقفل التلقائي 🎯:</strong>{" "}
                اسحب الشاشة لتدوير الكاميرا—خط المدفع كيتبع نظرة الكاميرا وكيتقفل تلقائياً على سفينة الخصم!
              </p>
              <p>
                • <strong className="text-orange-300">الأسلحة والقدرات:</strong>{" "}
                اضغط <strong className="text-white">💣 إطلاق المدفع</strong>{" "}
                (أو المس شاشة البحر)، أو{" "}
                <strong className="text-white">🔥 وابل ثلاثي</strong>، أو{" "}
                <strong className="text-white">⚡ سرعة + إصلاح</strong>!
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRulesModal(false)}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 py-3 font-black text-slate-950"
            >
              فهمت، ارفعوا الأشرعة! 🏴‍☠️🔥
            </button>
          </div>
        </div>
      )}

      {/* GAME OVER VICTORY MODAL */}
      {phase === "GAME_OVER" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/88 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-3xl border-2 border-amber-400/70 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="text-5xl mb-2">🏴‍☠️👑💣</div>
            <div className="inline-block rounded-full bg-amber-500/20 border border-amber-400/40 px-3.5 py-1 text-xs font-black text-amber-300 mb-2">
              نهاية المعركة البحرية
            </div>
            <h2 className="text-2xl font-black text-white mb-2">
              {winnerId && shipsMap[winnerId]
                ? `انتصر القبطان ${shipsMap[winnerId].nickname}!`
                : "انتهت معركة القراصنة!"}
            </h2>
            <p className="text-sm font-bold text-slate-300 mb-4">
              {winnerSummaryAr}
            </p>

            <div className="mb-5 space-y-1.5 text-right max-h-40 overflow-y-auto">
              {leaderboard.map((s, i) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-xl bg-slate-800/90 border border-slate-700 px-3 py-1.5 text-xs font-bold"
                >
                  <span>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "⚓"}{" "}
                    {s.nickname}
                  </span>
                  <span className="text-amber-300">
                    {s.goldScore} 💰 • {s.sinks} 💀
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onAction({ type: "RESTART_BATTLE" })}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 py-3.5 text-sm font-black text-slate-950 shadow-xl hover:brightness-110 active:scale-95"
            >
              🔄 معركة بحرية جديدة!
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}

export default Pirates3DGameView;
