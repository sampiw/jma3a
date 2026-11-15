"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Flame, Sparkles, Timer, Trophy } from "lucide-react";
import { SimsarMiniGameState, SimsarPlayer } from "@/games/simsar3d/types";
import { simsarSfx } from "./soundFx";

export interface SimsarMiniGamesProps {
  miniGame: SimsarMiniGameState;
  myId: string;
  players: Record<string, SimsarPlayer>;
  isHost: boolean;
  onSubmitScore: (score: number) => void;
  onFinalizeMiniGame: () => void;
}

const MINIGAME_INFO: Record<
  SimsarMiniGameState["id"],
  { titleAr: string; ruleAr: string; badge: string }
> = {
  DIRHAM_RAIN: {
    titleAr: "شتا ديال الدراهم والصنادل! 🌧️💵",
    ruleAr: "حرّك القفة بصبع واحد باش تجمع الدراهم والماس، وهرب من الصندالة والضريبة!",
    badge: "سحب بإصبع واحد 👆",
  },
  TAJINE_SHUFFLE: {
    titleAr: "خفّة يد جامع الفنا! 🍲💎",
    ruleAr: "تبع بعينك الطاجين اللي مخبية تحتو الجوهرة عبر 3 جولات سريعة!",
    badge: "تركيز وسرعة 👀",
  },
  TAXI_METER: {
    titleAr: "عدّاد الطاكسي 7.00 ثواني! 🚕⏱️",
    ruleAr: "العداد غيتغطى فـ 3.20 ثانية — حبسو أقرب ما يمكن لـ 7.00 بالضبط! (عندك جوج محاولات)",
    badge: "دقّة التوقيت 🎯",
  },
  HOT_BUTAGAZ: {
    titleAr: "دوّز البوطا السخونة! 💣🔥",
    ruleAr: "برك بسرعة على البوطا باش تعمّر الدائرة وتلوحها بعيد قبل ما تفرگع عليك!",
    badge: "ضغط سريع ⚡",
  },
};

export function SimsarMiniGames({
  miniGame,
  myId,
  players,
  isHost,
  onSubmitScore,
  onFinalizeMiniGame,
}: SimsarMiniGamesProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [localScore, setLocalScore] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const scoreRef = useRef(0);
  scoreRef.current = localScore;

  const alreadySubmittedOnServer = miniGame.submittedIds.includes(myId);

  const commitScore = useCallback(
    (finalVal: number) => {
      if (hasSubmitted || alreadySubmittedOnServer) return;
      setHasSubmitted(true);
      simsarSfx.playCashGain();
      onSubmitScore(Math.max(0, Math.round(finalVal)));
    },
    [hasSubmitted, alreadySubmittedOnServer, onSubmitScore]
  );

  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      const msLeft = miniGame.endsAt - now;
      if (msLeft <= 900 && !hasSubmitted && !alreadySubmittedOnServer) {
        commitScore(scoreRef.current);
      }
      if (msLeft <= -800 && isHost) {
        onFinalizeMiniGame();
      }
    }, 100);
    return () => clearInterval(iv);
  }, [
    miniGame.endsAt,
    hasSubmitted,
    alreadySubmittedOnServer,
    isHost,
    commitScore,
    onFinalizeMiniGame,
  ]);

  const secsLeft = Math.max(0, Math.ceil((miniGame.endsAt - nowMs) / 1000));
  const info = MINIGAME_INFO[miniGame.id];
  const done = hasSubmitted || alreadySubmittedOnServer;

  // Live Mini-Game Scoreboard preview
  const liveStandings = Object.values(players)
    .filter((p) => !p.isBankrupt)
    .map((p) => ({
      id: p.id,
      nickname: p.nickname,
      score: p.id === myId ? Math.max(localScore, miniGame.scores[p.id] ?? 0) : miniGame.scores[p.id] ?? 0,
      submitted: p.id === myId ? done : miniGame.submittedIds.includes(p.id),
    }))
    .sort((a, b) => b.score - a.score);

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col justify-between p-3 sm:p-5 select-none overflow-hidden"
    >
      {/* Top Header */}
      <div className="w-full max-w-md mx-auto space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="px-3 py-1 rounded-full bg-purple-600/30 border border-purple-400/60 text-purple-200 text-xs font-black flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>تحدي نهاية الدورة {miniGame.roundNumber}</span>
          </span>

          <div
            className={`px-3 py-1 rounded-full border font-mono text-sm font-black flex items-center gap-1 ${
              secsLeft <= 5
                ? "bg-rose-600 border-yellow-200 text-white animate-pulse"
                : "bg-slate-900 border-amber-400/60 text-amber-300"
            }`}
          >
            <Timer className="w-4 h-4" />
            <span>{secsLeft}s</span>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500/20 via-purple-600/20 to-emerald-500/20 border border-amber-400/40 text-center">
          <h2 className="text-lg sm:text-xl font-black text-white">{info.titleAr}</h2>
          <p className="text-[11px] sm:text-xs text-slate-300 font-bold mt-0.5 leading-snug">
            {info.ruleAr}
          </p>
          <div className="mt-1.5 inline-flex items-center gap-2 text-[11px] font-black text-emerald-300">
            <span>🥇 +300 DH</span>
            <span>•</span>
            <span>🥈 +175 DH</span>
            <span>•</span>
            <span>🥉 +75 DH</span>
          </div>
        </div>
      </div>

      {/* Center Interactive One-Thumb Arena */}
      <div className="flex-1 w-full max-w-md mx-auto my-2.5 relative rounded-3xl bg-slate-900/90 border-2 border-slate-700/90 shadow-2xl overflow-hidden flex flex-col">
        {done ? (
          <div className="flex-1 flex flex-col items-center justify-center p-5 text-center">
            <CheckCircle2 className="w-14 h-14 text-emerald-400 mb-2 animate-bounce" />
            <div className="text-2xl font-black text-white mb-1">
              سجلتي {Math.max(localScore, miniGame.scores[myId] ?? 0)} نقطة! 🔥
            </div>
            <p className="text-xs text-slate-400 mb-4">
              كنتسناو باقي اللاعبين يكملو ({secsLeft} ثانية)...
            </p>

            <div className="w-full space-y-1.5 max-w-xs">
              {liveStandings.map((st, idx) => (
                <div
                  key={st.id}
                  className={`px-3 py-2 rounded-xl flex items-center justify-between text-xs font-bold ${
                    st.id === myId
                      ? "bg-emerald-950/80 border border-emerald-400/60 text-emerald-200"
                      : "bg-slate-950/80 border border-slate-800 text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-black">#{idx + 1}</span>
                    <span>{st.nickname}</span>
                  </div>
                  <span className="font-mono font-black text-amber-300">
                    {st.submitted ? `${st.score} نقطة` : "كيلعب..."}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {miniGame.id === "DIRHAM_RAIN" && (
              <DirhamRainGame onScoreChange={setLocalScore} />
            )}
            {miniGame.id === "TAJINE_SHUFFLE" && (
              <TajineShuffleGame
                onScoreChange={setLocalScore}
                onFinishedAll={commitScore}
              />
            )}
            {miniGame.id === "TAXI_METER" && (
              <TaxiMeterGame
                onScoreChange={setLocalScore}
                onFinishedAll={commitScore}
              />
            )}
            {miniGame.id === "HOT_BUTAGAZ" && (
              <HotButagazGame onScoreChange={setLocalScore} />
            )}
          </>
        )}
      </div>

      {/* Bottom Live Score Strip */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between px-3 py-2 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-slate-300">نقاطك دابا:</span>
          <span className="text-lg font-black font-mono text-emerald-400">
            {localScore}
          </span>
        </div>
        <span className="text-[11px] font-black text-amber-300">{info.badge}</span>
      </div>
    </div>
  );
}

/* ============================================================================
 * 1. DIRHAM RAIN & SANDALA DODGE (Slide basket with 1 finger!)
 * ========================================================================== */
interface FallingDrop {
  id: number;
  xPct: number; // 8..92
  yPct: number; // 0..100
  speed: number;
  kind: "COIN" | "BILL" | "DIAMOND" | "SANDALA" | "TAX";
  emoji: string;
  pts: number;
}

function DirhamRainGame({ onScoreChange }: { onScoreChange: (s: number) => void }) {
  const [basketX, setBasketX] = useState(50);
  const [drops, setDrops] = useState<FallingDrop[]>([]);
  const [flashTone, setFlashTone] = useState<"GOOD" | "BAD" | null>(null);

  const basketRef = useRef(50);
  const scoreInternalRef = useRef(0);
  const nextIdRef = useRef(1);

  useEffect(() => {
    let lastTime = performance.now();
    let spawnAcc = 0;

    const iv = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;

      spawnAcc += dt;
      setDrops((prev) => {
        const next: FallingDrop[] = [];
        for (const d of prev) {
          const ny = d.yPct + d.speed * dt;
          // Check catch collision near bottom basket (y: 79..91%)
          if (ny >= 78 && ny <= 92 && Math.abs(d.xPct - basketRef.current) < 13.5) {
            scoreInternalRef.current = Math.max(0, scoreInternalRef.current + d.pts);
            onScoreChange(scoreInternalRef.current);
            if (d.pts > 0) {
              simsarSfx.playPopTap(d.kind === "DIAMOND" ? 1.5 : 1.15);
              setFlashTone("GOOD");
            } else {
              simsarSfx.playRentPaid();
              setFlashTone("BAD");
            }
            setTimeout(() => setFlashTone(null), 180);
            continue;
          }
          if (ny < 103) {
            next.push({ ...d, yPct: ny });
          }
        }

        if (spawnAcc >= 0.34) {
          spawnAcc = 0;
          const roll = Math.random();
          let spec: Pick<FallingDrop, "kind" | "emoji" | "pts" | "speed"> = {
            kind: "COIN",
            emoji: "🪙",
            pts: 25,
            speed: 44 + Math.random() * 16,
          };
          if (roll > 0.88) {
            spec = { kind: "DIAMOND", emoji: "💎", pts: 75, speed: 62 };
          } else if (roll > 0.66) {
            spec = { kind: "BILL", emoji: "💵", pts: 45, speed: 50 };
          } else if (roll < 0.22) {
            spec = { kind: "SANDALA", emoji: "🩴", pts: -45, speed: 56 };
          } else if (roll < 0.34) {
            spec = { kind: "TAX", emoji: "📝", pts: -35, speed: 48 };
          }

          next.push({
            id: nextIdRef.current++,
            xPct: 10 + Math.random() * 80,
            yPct: -6,
            ...spec,
          });
        }
        return next;
      });
    }, 33);

    return () => clearInterval(iv);
  }, [onScoreChange]);

  const updatePointerX = (clientX: number, rect: DOMRect) => {
    const pct = Math.max(10, Math.min(90, ((clientX - rect.left) / Math.max(1, rect.width)) * 100));
    basketRef.current = pct;
    setBasketX(pct);
  };

  return (
    <div
      dir="ltr"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        updatePointerX(e.clientX, e.currentTarget.getBoundingClientRect());
      }}
      onPointerMove={(e) => {
        if (e.buttons > 0 || e.pointerType === "touch") {
          updatePointerX(e.clientX, e.currentTarget.getBoundingClientRect());
        }
      }}
      className={`relative flex-1 w-full touch-none select-none overflow-hidden transition-colors ${
        flashTone === "GOOD"
          ? "bg-emerald-950/40"
          : flashTone === "BAD"
          ? "bg-rose-950/50"
          : "bg-gradient-to-b from-slate-900 to-slate-950"
      }`}
    >
      {drops.map((d) => (
        <div
          key={d.id}
          style={{ left: `${d.xPct}%`, top: `${d.yPct}%` }}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-3xl sm:text-4xl drop-shadow-lg"
        >
          {d.emoji}
        </div>
      ))}

      {/* Player's Sliding Moroccan Basket */}
      <div
        style={{ left: `${basketX}%`, top: "85%" }}
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
      >
        <div className="w-20 h-12 rounded-2xl bg-gradient-to-b from-amber-400 to-orange-600 border-2 border-white shadow-xl flex items-center justify-center text-3xl">
          🧺
        </div>
        <span className="text-[10px] font-black text-amber-300 mt-1">اسحب هنا ◀ ▶</span>
      </div>
    </div>
  );
}

/* ============================================================================
 * 2. JEMAA EL-FNA 3-TAJINE SHUFFLE (3 Accelerating Waves!)
 * ========================================================================== */
function TajineShuffleGame({
  onScoreChange,
  onFinishedAll,
}: {
  onScoreChange: (s: number) => void;
  onFinishedAll: (s: number) => void;
}) {
  const [wave, setWave] = useState(1);
  const [phase, setPhase] = useState<"PEEK" | "SHUFFLING" | "PICK" | "RESULT">("PEEK");
  // `slots[tajineId]` = visual column 0, 1, or 2
  const [slots, setSlots] = useState<[number, number, number]>([0, 1, 2]);
  const [gemTajineId, setGemTajineId] = useState<number>(1);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const scoreRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const winningId = Math.floor(Math.random() * 3);
    setGemTajineId(winningId);
    setPickedId(null);
    setPhase("PEEK");

    const swapCount = 3 + wave * 2;
    const swapIntervalMs = Math.max(210, 420 - wave * 75);

    const t1 = setTimeout(() => {
      if (cancelled) return;
      setPhase("SHUFFLING");

      let step = 0;
      const shufIv = setInterval(() => {
        if (cancelled) {
          clearInterval(shufIv);
          return;
        }
        step += 1;
        simsarSfx.playPopTap(0.9 + step * 0.05);
        setSlots((prev) => {
          const next = [...prev] as [number, number, number];
          const i = Math.floor(Math.random() * 3);
          const j = (i + 1 + Math.floor(Math.random() * 2)) % 3;
          const tmp = next[i];
          next[i] = next[j];
          next[j] = tmp;
          return next;
        });

        if (step >= swapCount) {
          clearInterval(shufIv);
          setTimeout(() => {
            if (!cancelled) setPhase("PICK");
          }, swapIntervalMs);
        }
      }, swapIntervalMs);
    }, 1050);

    return () => {
      cancelled = true;
      clearTimeout(t1);
    };
  }, [wave]);

  const handlePick = (tajineId: number) => {
    if (phase !== "PICK") return;
    setPickedId(tajineId);
    setPhase("RESULT");

    if (tajineId === gemTajineId) {
      const pts = 110 + wave * 30;
      scoreRef.current += pts;
      onScoreChange(scoreRef.current);
      simsarSfx.playCashGain();
    } else {
      simsarSfx.playRentPaid();
    }

    setTimeout(() => {
      if (wave >= 3) {
        onFinishedAll(scoreRef.current);
      } else {
        setWave((w) => w + 1);
      }
    }, 950);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-between p-5">
      <div className="px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/50 text-xs font-black text-amber-200">
        الجولة {wave} من 3 •{" "}
        {phase === "PEEK"
          ? "عقل على الجوهرة! 👀"
          : phase === "SHUFFLING"
          ? "كيتخلطو... ركّز!"
          : phase === "PICK"
          ? "إختار الطاجين الصحيح دابا! 👆"
          : pickedId === gemTajineId
          ? "برافو! جبتيها لاصقة! 💎"
          : "خسارة! كانت فطاجين آخر!"}
      </div>

      <div dir="ltr" className="relative w-full h-40 flex items-center justify-center">
        {[0, 1, 2].map((tId) => {
          const col = slots[tId]; // 0, 1, 2
          const xOffset = (col - 1) * 104;
          const isOpen = phase === "PEEK" || phase === "RESULT";
          const hasGem = tId === gemTajineId;

          return (
            <button
              key={tId}
              type="button"
              disabled={phase !== "PICK"}
              onClick={() => handlePick(tId)}
              style={{ transform: `translateX(${xOffset}px)` }}
              className={`absolute w-24 h-28 rounded-3xl border-2 flex flex-col items-center justify-center transition-transform duration-200 shadow-xl ${
                phase === "PICK"
                  ? "bg-amber-950/90 border-amber-400 active:scale-90 cursor-pointer"
                  : "bg-slate-800/90 border-slate-600"
              }`}
            >
              <span
                className={`text-4xl transition-transform duration-200 ${
                  isOpen ? "-translate-y-4" : ""
                }`}
              >
                🍲
              </span>
              {isOpen && (
                <span className="text-2xl -mt-2 animate-bounce">
                  {hasGem ? "💎" : "💨"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 font-bold text-center">
        كل إجابة صحيحة كتزيدك حتى لـ +200 نقطة!
      </p>
    </div>
  );
}

/* ============================================================================
 * 3. PETIT TAXI BLIND 7.00s METER (2 Precision Attempts!)
 * ========================================================================== */
function TaxiMeterGame({
  onScoreChange,
  onFinishedAll,
}: {
  onScoreChange: (s: number) => void;
  onFinishedAll: (s: number) => void;
}) {
  const [attempt, setAttempt] = useState(1);
  const [running, setRunning] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [lastResult, setLastResult] = useState<{ stoppedAt: number; pts: number } | null>(null);
  const startPerfRef = useRef<number>(performance.now());
  const bestScoreRef = useRef<number>(0);

  useEffect(() => {
    startPerfRef.current = performance.now();
    setRunning(true);
    setElapsedSec(0);
  }, [attempt]);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      const sec = (performance.now() - startPerfRef.current) / 1000;
      setElapsedSec(sec);
      if (sec >= 9.8) {
        handleStopMeter(sec);
      }
    }, 25);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, attempt]);

  const handleStopMeter = (forcedSec?: number) => {
    if (!running) return;
    setRunning(false);
    const finalSec = forcedSec ?? (performance.now() - startPerfRef.current) / 1000;
    setElapsedSec(finalSec);

    const errMs = Math.abs(finalSec - 7.0) * 1000;
    const pts = Math.max(40, Math.round(500 - errMs * 0.22));
    bestScoreRef.current = Math.max(bestScoreRef.current, pts);
    onScoreChange(bestScoreRef.current);
    setLastResult({ stoppedAt: finalSec, pts });

    if (errMs < 350) simsarSfx.playCashGain();
    else simsarSfx.playPopTap(0.9);

    setTimeout(() => {
      if (attempt >= 2) {
        onFinishedAll(bestScoreRef.current);
      } else {
        setLastResult(null);
        setAttempt((a) => a + 1);
      }
    }, 1350);
  };

  const isBlind = running && elapsedSec >= 3.2;

  return (
    <div className="flex-1 flex flex-col items-center justify-between p-5 text-center">
      <div className="text-xs font-black text-amber-300">
        المحاولة {attempt} من 2 • الهدف: <span className="font-mono text-emerald-300">7.00s</span>
      </div>

      {/* Petit Taxi Red Digital Meter Box */}
      <div className="w-full max-w-[250px] p-5 rounded-3xl bg-black border-4 border-red-600 shadow-[0_0_30px_rgba(220,38,38,0.4)]">
        <div className="text-[10px] font-bold text-red-400 mb-1">🚕 TAXI CASA • TARIF 2</div>
        <div className="text-5xl font-mono font-black tracking-wider text-red-500">
          {isBlind ? "?.??" : elapsedSec.toFixed(2)}
        </div>
        {lastResult && (
          <div className="mt-2 text-xs font-black text-emerald-300">
            وقفتي فـ {lastResult.stoppedAt.toFixed(2)}s (+{lastResult.pts} نقطة!)
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={!running}
        onPointerDown={(e) => {
          e.preventDefault();
          handleStopMeter();
        }}
        className="w-full py-5 rounded-3xl bg-gradient-to-r from-red-600 to-amber-500 active:scale-95 disabled:opacity-50 border-2 border-yellow-200 text-xl font-black text-white shadow-2xl"
      >
        🛑 حْبَس فـ 7.00!
      </button>
    </div>
  );
}

/* ============================================================================
 * 4. HOT BUTAGAZ TURBO TAP (1-Thumb Rapid Tap Combo!)
 * ========================================================================== */
function HotButagazGame({ onScoreChange }: { onScoreChange: (s: number) => void }) {
  const [tapsInCycle, setTapsInCycle] = useState(0);
  const [throwsCount, setThrowsCount] = useState(0);
  const scoreRef = useRef(0);

  const handleTap = () => {
    simsarSfx.playPopTap(1 + tapsInCycle * 0.1);
    const next = tapsInCycle + 1;
    if (next >= 5) {
      setTapsInCycle(0);
      const nextThrows = throwsCount + 1;
      setThrowsCount(nextThrows);
      scoreRef.current += 55 + nextThrows * 5;
      onScoreChange(scoreRef.current);
      simsarSfx.playCashGain();
    } else {
      setTapsInCycle(next);
      scoreRef.current += 6;
      onScoreChange(scoreRef.current);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-between p-5 text-center">
      <div className="flex items-center gap-2 text-xs font-black text-amber-300">
        <Flame className="w-4 h-4 text-orange-400" />
        <span>رميتي {throwsCount} بوطات بعيد! عمّر الدائرة بـ 5 ضغطات!</span>
      </div>

      {/* 5-Segment Charge Dots */}
      <div dir="ltr" className="flex items-center gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`w-5 h-5 rounded-full border transition-all ${
              i < tapsInCycle
                ? "bg-emerald-400 border-white scale-110"
                : "bg-slate-800 border-slate-600"
            }`}
          />
        ))}
      </div>

      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          handleTap();
        }}
        className="w-44 h-44 rounded-full bg-gradient-to-br from-rose-600 via-orange-500 to-amber-400 active:scale-90 border-4 border-yellow-200 shadow-[0_0_40px_rgba(249,115,22,0.55)] flex flex-col items-center justify-center text-white touch-none select-none"
      >
        <span className="text-6xl leading-none">🧨</span>
        <span className="text-sm font-black mt-2">اضغط بسرعة! 🔥</span>
      </button>

      <p className="text-[11px] text-slate-400 font-bold">
        كل 5 ضغطات كتلوح البوطا وكتعطيك كومبو نقاط مضاعف!
      </p>
    </div>
  );
}
