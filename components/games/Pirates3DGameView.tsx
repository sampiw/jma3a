"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import confetti from "canvas-confetti";
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
import Pirates3DCanvas, { LocalShipControlRef } from "./Pirates3DCanvas";

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
}: Pirates3DGameViewProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const phase = String(publicData?.phase ?? "PLAYING") as
    | "PLAYING"
    | "GAME_OVER";
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

  const controlRef = useRef<LocalShipControlRef>({
    x: myShip?.x ?? 0,
    z: myShip?.z ?? 32,
    yaw: myShip?.yaw ?? Math.PI,
    speed: 4.5,
    steerInput: 0,
    throttleInput: 0.65, // Cruise sails forward by default so sailing feels effortless!
    aimYawOffset: 0,
    aimDistance: 22,
    lockedTargetId: null,
    targetWorldX: 0,
    targetWorldZ: 0,
  });

  const [autoSail, setAutoSail] = useState(true);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Sync local ship position & step AI every 750ms while playing
  useEffect(() => {
    if (phase !== "PLAYING") return;
    const syncTimer = setInterval(() => {
      const c = controlRef.current;
      onAction({
        type: "SYNC_SHIP",
        x: Number(c.x.toFixed(2)),
        z: Number(c.z.toFixed(2)),
        yaw: Number(c.yaw.toFixed(3)),
        speed: Number(c.speed.toFixed(2)),
      });
    }, 750);
    return () => clearInterval(syncTimer);
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

  const handleFireCannon = useCallback(
    (mode: "SINGLE" | "TRIPLE") => {
      if (phase !== "PLAYING") return;
      if (myShip && myShip.sunkUntil > Date.now()) return;

      const c = controlRef.current;
      sound.playGlassCrack();
      onAction({
        type: "FIRE_CANNON",
        mode,
        fromX: Number(c.x.toFixed(2)),
        fromZ: Number(c.z.toFixed(2)),
        aimYaw: Number((c.yaw + c.aimYawOffset).toFixed(3)),
        targetX: Number(c.targetWorldX.toFixed(2)),
        targetZ: Number(c.targetWorldZ.toFixed(2)),
        targetShipId: c.lockedTargetId ?? undefined,
      });
    },
    [phase, myShip, onAction]
  );

  const handleWindBoost = useCallback(() => {
    if (phase !== "PLAYING") return;
    sound.playCardFlip();
    onAction({ type: "WIND_BOOST" });
  }, [phase, onAction]);

  // Keyboard shortcuts for firing cannons (Space / E / Shift)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        handleFireCannon("SINGLE");
      } else if (e.code === "KeyE") {
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

  if (!mounted) return null;

  const content = (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9999] w-screen h-screen overflow-hidden bg-[#081c2e] text-white select-none font-sans flex flex-col"
    >
      {/* ZONE 1: COMPACT DOCKED TOP HEADER BAR */}
      <header className="shrink-0 z-20 bg-slate-950/95 border-b border-sky-900/60 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="rounded-xl bg-gradient-to-r from-amber-500/20 to-sky-500/20 border border-amber-400/50 px-2.5 py-1 flex items-center gap-1.5">
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
                  {idx === 0 ? "👑" : st.emblem} {s.nickname}: {s.goldScore}💰 ({s.sinks}💀)
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

      {/* ZONE 2: CENTER 3D OCEAN VIEWPORT */}
      <main className="relative flex-1 min-h-0 w-full overflow-hidden">
        <Pirates3DCanvas
          myShipId={myShipId}
          ships={shipsMap}
          lootCrates={lootCrates}
          recentShots={recentShots}
          controlRef={controlRef}
          onQuickFire={() => handleFireCannon("SINGLE")}
        />

        {/* Subtle Top-Center Battle Feed Pill */}
        <div className="pointer-events-none absolute top-2 inset-x-0 flex flex-col items-center gap-1 px-3">
          {battleFeed[0] && (
            <div className="rounded-full bg-slate-950/85 border border-sky-500/40 px-3.5 py-1 text-[11px] font-bold text-amber-200 shadow-lg">
              {battleFeed[0].textAr}
            </div>
          )}
          <div className="rounded-full bg-slate-950/70 border border-slate-700/70 px-3 py-0.5 text-[10px] font-bold text-slate-300">
            🎯 اسحب الشاشة لتوجيه خط المدفع الأخضر (يقفل تلقائياً على سفن الخصم 🎯)
          </div>
        </div>

        {/* Sunk Respawn Overlay Pill */}
        {isSunk && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
            <div className="rounded-2xl bg-rose-950/90 border-2 border-rose-400 px-5 py-2.5 text-center shadow-2xl animate-pulse">
              <div className="text-sm font-black text-rose-200">
                ⚓ غرقت سفينتك في المعركة! جاري تجهيز سفينة جديدة مع درع حماية...
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ZONE 3: DOCKED NAVAL CONTROL DECK & CREDITS FOOTER */}
      <footer className="shrink-0 z-20 bg-slate-950/95 border-t border-sky-900/60 px-3 py-2">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
          {/* Helm Steering & Sails Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onPointerDown={() => {
                controlRef.current.steerInput = 1;
              }}
              onPointerUp={() => {
                controlRef.current.steerInput = 0;
              }}
              onPointerLeave={() => {
                controlRef.current.steerInput = 0;
              }}
              className="rounded-2xl border-2 border-sky-400/50 bg-slate-900 active:bg-sky-500/30 px-3.5 py-2.5 text-xs sm:text-sm font-black text-sky-200 select-none"
            >
              ↪️ يمين
            </button>

            <button
              type="button"
              onClick={() => {
                sound.playCardFlip();
                setAutoSail((prev) => {
                  const next = !prev;
                  controlRef.current.throttleInput = next ? 0.68 : 0;
                  return next;
                });
              }}
              className={`rounded-2xl border-2 px-3 py-2.5 text-xs font-black transition-all ${
                autoSail
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                  : "border-slate-700 bg-slate-900 text-slate-300"
              }`}
            >
              ⛵ {autoSail ? "إبحار: شغّال" : "إبحار: متوقف"}
            </button>

            <button
              type="button"
              onPointerDown={() => {
                controlRef.current.steerInput = -1;
              }}
              onPointerUp={() => {
                controlRef.current.steerInput = 0;
              }}
              onPointerLeave={() => {
                controlRef.current.steerInput = 0;
              }}
              className="rounded-2xl border-2 border-sky-400/50 bg-slate-900 active:bg-sky-500/30 px-3.5 py-2.5 text-xs sm:text-sm font-black text-sky-200 select-none"
            >
              يسار ↩️
            </button>
          </div>

          {/* Cannon Fire & Tactical Abilities */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSunk}
              onClick={() => handleFireCannon("SINGLE")}
              className="rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-rose-600 to-amber-500 px-4 py-2.5 text-xs sm:text-sm font-black text-slate-950 shadow-[0_0_16px_rgba(245,158,11,0.45)] active:scale-95 disabled:opacity-50"
            >
              💣 إطلاق المدفع!
            </button>

            <button
              type="button"
              disabled={isSunk || tripleCooldownLeft > 0}
              onClick={() => handleFireCannon("TRIPLE")}
              className="rounded-2xl border-2 border-orange-400/70 bg-orange-500/20 hover:bg-orange-500/30 px-3 py-2.5 text-xs font-black text-orange-200 active:scale-95 disabled:opacity-50"
            >
              🔥 وابل ثلاثي{" "}
              {tripleCooldownLeft > 0 ? `(${tripleCooldownLeft}s)` : ""}
            </button>

            <button
              type="button"
              disabled={isSunk || boostCooldownLeft > 0}
              onClick={handleWindBoost}
              className="rounded-2xl border-2 border-emerald-400/70 bg-emerald-500/20 hover:bg-emerald-500/30 px-3 py-2.5 text-xs font-black text-emerald-200 active:scale-95 disabled:opacity-50"
            >
              ⚡ ريح وإصلاح{" "}
              {boostCooldownLeft > 0 ? `(${boostCooldownLeft}s)` : ""}
            </button>
          </div>
        </div>

        <div
          dir="ltr"
          className="mt-1.5 pt-1 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-3 text-[10px] font-bold text-slate-400"
        >
          <span>Created by sampiw:</span>
          <a
            href="https://www.instagram.com/sampiw/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-pink-400 hover:text-pink-300 underline-offset-2 hover:underline"
          >
            Instagram
          </a>
          <span>•</span>
          <a
            href="https://github.com/sampiw"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-200 hover:text-white underline-offset-2 hover:underline"
          >
            GitHub
          </a>
          <span>•</span>
          <a
            href="https://t.me/sampiw"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 hover:text-sky-300 underline-offset-2 hover:underline"
          >
            Telegram @sampiw
          </a>
        </div>
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
                • <strong className="text-amber-300">الإبحار والتصويب:</strong>{" "}
                استعمل أزرار <strong className="text-white">يمين / يسار</strong>{" "}
                (أو <strong className="text-white">WASD</strong>) للالتفاف، واسحب الشاشة لتوجيه خط المدفع الأخضر.
              </p>
              <p>
                • <strong className="text-rose-300">قفل الهدف التلقائي 🎯:</strong>{" "}
                ملّي كيقرب خط التصويب لسفينة الخصم، كيتحول للأحمر وكيتقفل عليها باش تضربها بدقة!
              </p>
              <p>
                • <strong className="text-orange-300">الأسلحة والقدرات:</strong>{" "}
                اضغط <strong className="text-white">💣 إطلاق المدفع</strong>{" "}
                للضرب السريع، أو{" "}
                <strong className="text-white">🔥 وابل ثلاثي</strong> لإطلاق 3 قذائف دفعة واحدة، أو{" "}
                <strong className="text-white">⚡ ريح وإصلاح</strong> لمضاعفة سرعتك وإصلاح السفينة (+20 صحة)!
              </p>
              <p>
                • <strong className="text-emerald-300">شرط الفوز:</strong> أول قبطان يوصل لـ{" "}
                <strong className="text-white">5 إغراقات (💀)</strong> أو{" "}
                <strong className="text-white">1000 ذهب (💰)</strong> يربح لقب أمير قراصنة سلا!
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

            {/* Final Standings */}
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
