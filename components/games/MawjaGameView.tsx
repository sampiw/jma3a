"use client";

import React, { useState, useEffect, useMemo } from "react";
import confetti from "canvas-confetti";
import { MawjaRadarDial, PlottedNeedle } from "@/components/games/MawjaRadarDial";
import {
  MawjaSpectrum,
  MawjaRoundResult,
  MawjaPlayerAward,
  MawjaPlayerGuess,
  MawjaScoreZone,
} from "@/games/mawja/types";
import { sound } from "@/lib/sound";
import {
  Radio,
  Flame,
  Target,
  Sparkles,
  Trophy,
  CheckCircle2,
  Send,
  Award,
  RotateCcw,
  ChevronLeft,
  AlertTriangle,
  Users,
  Eye,
  Shuffle,
} from "lucide-react";

interface MawjaGameViewProps {
  publicData: {
    phase: "TRANSMITTER_SELECT" | "RECEIVERS_TUNE" | "ROUND_REVEAL" | "GAME_OVER";
    round: number;
    targetScore: number;
    maxRounds: number;
    transmitterId: string;
    currentSpectrum: MawjaSpectrum;
    currentClue?: string;
    targetValue?: number;
    lockedPlayerIds: string[];
    doubleDownPlayerIds: string[];
    totalReceiversCount: number;
    scores: Record<string, number>;
    doubleDownChipsLeft: Record<string, number>;
    lastRoundResult?: MawjaRoundResult;
    winnerId?: string;
    awards?: MawjaPlayerAward[];
  };
  privateData?: {
    isTransmitter: boolean;
    secretTargetValue?: number;
    candidateSpectrums?: MawjaSpectrum[];
    myGuess: MawjaPlayerGuess | null;
    myDoubleDownChips: number;
  };
  isHost: boolean;
  onAction: (action: any, targetPlayerId?: string) => void;
  players: Array<{ id: string; nickname: string; isHost?: boolean }>;
  activePlayerId?: string;
}

const ZONE_META: Record<
  MawjaScoreZone,
  { label: string; badgeClass: string; pointsLabel: string }
> = {
  BULLSEYE: {
    label: "🎯 لاصقة فالصميم!",
    badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50",
    pointsLabel: "+4 نقط",
  },
  INNER: {
    label: "🔥 قريب بزاف!",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/50",
    pointsLabel: "+3 نقط",
  },
  OUTER: {
    label: "👌 دايز فالموجة",
    badgeClass: "bg-blue-500/20 text-blue-300 border-blue-500/50",
    pointsLabel: "+2 نقط",
  },
  MISS: {
    label: "💨 خارج التغطية",
    badgeClass: "bg-slate-800 text-slate-400 border-slate-700",
    pointsLabel: "0 نقطة",
  },
};

export function MawjaGameView({
  publicData,
  privateData,
  isHost,
  onAction,
  players,
  activePlayerId,
}: MawjaGameViewProps) {
  const {
    phase,
    round,
    targetScore = 15,
    maxRounds = 8,
    transmitterId,
    currentSpectrum,
    currentClue,
    lockedPlayerIds = [],
    doubleDownPlayerIds = [],
    scores = {},
    doubleDownChipsLeft = {},
    lastRoundResult,
    winnerId,
    awards = [],
  } = publicData;

  const isTransmitter =
    privateData?.isTransmitter ?? (activePlayerId ? activePlayerId === transmitterId : false);
  const secretTarget = privateData?.secretTargetValue ?? publicData.targetValue ?? 50;
  const candidateSpectrums = privateData?.candidateSpectrums || (currentSpectrum ? [currentSpectrum] : []);
  const myChipsRemaining =
    privateData?.myDoubleDownChips ??
    (activePlayerId ? doubleDownChipsLeft[activePlayerId] ?? 0 : 0);

  // Transmitter form state
  const [selectedSpectrumId, setSelectedSpectrumId] = useState<string>("");
  const [isCustomSpectrum, setIsCustomSpectrum] = useState<boolean>(false);
  const [customLeft, setCustomLeft] = useState<string>("");
  const [customRight, setCustomRight] = useState<string>("");
  const [clueInput, setClueInput] = useState<string>("");
  const [localError, setLocalError] = useState<string>("");

  // Receiver tuning state
  const [dialValue, setDialValue] = useState<number>(50);
  const [doubleDown, setDoubleDown] = useState<boolean>(false);
  const [predictedBestPlayerId, setPredictedBestPlayerId] = useState<string | null>(null);
  const [isEditingGuess, setIsEditingGuess] = useState<boolean>(false);

  // Practice dial for receivers while waiting in TRANSMITTER_SELECT
  const [practiceDial, setPracticeDial] = useState<number>(50);

  // Reset local form states when round or phase changes
  useEffect(() => {
    setLocalError("");
    if (phase === "TRANSMITTER_SELECT") {
      if (candidateSpectrums.length > 0) {
        setSelectedSpectrumId(candidateSpectrums[0].id);
      } else if (currentSpectrum) {
        setSelectedSpectrumId(currentSpectrum.id);
      }
      setIsCustomSpectrum(false);
      setCustomLeft("");
      setCustomRight("");
      setClueInput("");
    }
    if (phase === "RECEIVERS_TUNE") {
      if (privateData?.myGuess) {
        setDialValue(privateData.myGuess.value);
        setDoubleDown(privateData.myGuess.doubleDown);
        setPredictedBestPlayerId(privateData.myGuess.predictedBestPlayerId || null);
        setIsEditingGuess(false);
      } else {
        setDialValue(50);
        setDoubleDown(false);
        setPredictedBestPlayerId(null);
        setIsEditingGuess(true);
      }
    }
  }, [phase, round, currentSpectrum?.id, privateData?.myGuess]);

  // Trigger celebratory effects on ROUND_REVEAL (if bullseye hit) or GAME_OVER
  useEffect(() => {
    if (phase === "ROUND_REVEAL" && lastRoundResult) {
      const anyBullseye = lastRoundResult.evaluations.some((e) => e.zone === "BULLSEYE");
      if (anyBullseye) {
        sound.playSuccess();
        try {
          confetti({ particleCount: 55, spread: 65, origin: { y: 0.65 } });
        } catch {}
      } else {
        sound.playDawnChime();
      }
    } else if (phase === "GAME_OVER") {
      sound.playSuccess();
      try {
        confetti({ particleCount: 110, spread: 80, origin: { y: 0.55 } });
      } catch {}
    }
  }, [phase, round, lastRoundResult]);

  const getNickname = (id: string) =>
    players.find((p) => p.id === id)?.nickname || "لاعب";

  const transmitterName = getNickname(transmitterId);
  const receivers = useMemo(
    () => players.filter((p) => p.id !== transmitterId),
    [players, transmitterId]
  );

  const hasSubmitted = Boolean(
    (activePlayerId && lockedPlayerIds.includes(activePlayerId)) ||
      privateData?.myGuess
  );

  // Selected spectrum preview for Transmitter
  const previewSpectrum: MawjaSpectrum = useMemo(() => {
    if (isCustomSpectrum) {
      return {
        id: "custom",
        category: "spicy",
        categoryLabel: "✨ طيف من إبداعكم",
        leftLabel: customLeft.trim() || "القطب الأول (0%)",
        rightLabel: customRight.trim() || "القطب الثاني (100%)",
      };
    }
    return (
      candidateSpectrums.find((s) => s.id === selectedSpectrumId) ||
      currentSpectrum || {
        id: "default",
        category: "moroccan",
        categoryLabel: "🇲🇦 يوميات مغربية",
        leftLabel: "بارد ❄️",
        rightLabel: "سخون 🔥",
      }
    );
  }, [isCustomSpectrum, customLeft, customRight, candidateSpectrums, selectedSpectrumId, currentSpectrum]);

  const handleTransmitClue = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    const trimmedClue = clueInput.trim();
    if (!trimmedClue) {
      setLocalError("كتب التلميح بعدا عاد صيفط الإشارة!");
      return;
    }
    if (/\d/.test(trimmedClue) || trimmedClue.includes("%") || trimmedClue.includes("فالمية")) {
      setLocalError("ممنوع تستعمل الأرقام أو النسب المئوية فالتلميح! عبّر غير بالفكرة 🧠");
      return;
    }

    if (isCustomSpectrum) {
      if (!customLeft.trim() || !customRight.trim()) {
        setLocalError("عفاك كتب القطب ديال 0% والقطب ديال 100% باش تصايب طيف من راسك!");
        return;
      }
      sound.playSuccess();
      onAction({
        type: "SUBMIT_CLUE",
        clue: trimmedClue,
        customLeft: customLeft.trim(),
        customRight: customRight.trim(),
      });
    } else {
      sound.playSuccess();
      onAction({
        type: "SUBMIT_CLUE",
        spectrumId: previewSpectrum.id,
        clue: trimmedClue,
      });
    }
  };

  const handleLockGuess = () => {
    sound.playSuccess();
    setIsEditingGuess(false);
    onAction({
      type: "LOCK_GUESS",
      value: dialValue,
      doubleDown,
      predictedBestPlayerId: predictedBestPlayerId || undefined,
    });
  };

  // Sorted scoreboard
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  }, [players, scores]);

  // Plotted needles for ROUND_REVEAL
  const plottedNeedles: PlottedNeedle[] = useMemo(() => {
    if (phase !== "ROUND_REVEAL" || !lastRoundResult) return [];
    return lastRoundResult.evaluations.map((ev) => ({
      playerId: ev.playerId,
      nickname: getNickname(ev.playerId),
      value: ev.value,
      doubleDown: ev.doubleDown,
      zone: ev.zone,
      isMe: ev.playerId === activePlayerId,
    }));
  }, [phase, lastRoundResult, players, activePlayerId]);

  return (
    <div className="max-w-2xl mx-auto w-full space-y-4 pb-8 text-right animate-fadeIn">
      {/* Top Telemetry Bar: Round & Live Scoreboard Strip */}
      <div className="rounded-3xl bg-slate-900/90 border border-cyan-500/30 p-3.5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-black flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>الجولة {round} / {maxRounds} • الهدف: {targetScore} ن</span>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[11px] font-bold">
              📡 مول الموجة: {transmitterName}
            </span>
          </div>

          {activePlayerId && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
              <span>فيشات الدوبل:</span>
              <span className="px-2 py-0.5 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 font-black">
                🔥 {myChipsRemaining}x
              </span>
            </div>
          )}
        </div>

        {/* Compact Horizontal Scoreboard */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {sortedPlayers.map((p, idx) => {
            const isTrans = p.id === transmitterId;
            const isMe = p.id === activePlayerId;
            const hasSub = lockedPlayerIds.includes(p.id);
            const pChips = doubleDownChipsLeft[p.id] ?? 0;

            return (
              <div
                key={p.id}
                className={`px-3 py-1.5 rounded-2xl border shrink-0 flex items-center gap-2 text-xs transition-all ${
                  isMe
                    ? "bg-amber-500/15 border-amber-400/60 text-amber-200 shadow-md"
                    : isTrans
                    ? "bg-cyan-950/60 border-cyan-500/40 text-cyan-200"
                    : "bg-slate-800/80 border-slate-700 text-slate-200"
                }`}
              >
                <span className="font-black text-amber-400">#{idx + 1}</span>
                <span className="font-bold truncate max-w-[90px]">{p.nickname}</span>
                {isTrans && <span title="مول الموجة">📡</span>}
                {!isTrans && phase === "RECEIVERS_TUNE" && (
                  <span title={hasSub ? "تردد مؤكد" : "كيفكّر"}>
                    {hasSub ? "✅" : "⏳"}
                  </span>
                )}
                <span className="px-1.5 py-0.5 rounded-md bg-black/40 font-black text-emerald-300">
                  {scores[p.id] || 0} ن
                </span>
                {pChips > 0 && (
                  <span className="text-[10px] text-orange-400" title="فيشات الدوبل">
                    {"🔥".repeat(pChips)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* PHASE 1: TRANSMITTER_SELECT                                           */}
      {/* ===================================================================== */}
      {phase === "TRANSMITTER_SELECT" && (
        <>
          {isTransmitter ? (
            <div className="space-y-4">
              {/* Transmitter Secret Briefing Card */}
              <div className="rounded-3xl bg-gradient-to-br from-cyan-950/90 via-slate-900 to-indigo-950/90 border-2 border-cyan-400/50 p-5 shadow-2xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-xs font-black">
                    🎯 سري للغاية — غير نتا اللي كتشوف هاد الرقم!
                  </span>
                  <span className="text-xs font-bold text-cyan-300">نوبتك تبث الموجة 📡</span>
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-white mb-1">
                  الهدف السري ديالك هو:{" "}
                  <span className="text-emerald-400 underline decoration-wavy">
                    {secretTarget}%
                  </span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-4">
                  اختار طيف من الأطياف لتحت، وعطي لصحابك <strong>تلميح ذكي</strong> يخلّيهم يحطو المؤشر فـ{" "}
                  <strong className="text-emerald-300">{secretTarget}%</strong> بالضبط بلا ما تذكر حتى شي رقم!
                </p>

                {/* Transmitter Radar Preview */}
                <MawjaRadarDial
                  leftLabel={previewSpectrum.leftLabel}
                  rightLabel={previewSpectrum.rightLabel}
                  value={secretTarget}
                  targetValue={secretTarget}
                  showTarget={true}
                  interactive={false}
                  statusLabel={`الهدف السري: ${secretTarget}%`}
                />
              </div>

              {/* Step 1: Spectrum Selection */}
              <div className="rounded-3xl bg-slate-900/95 border border-slate-800 p-5 shadow-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        sound.playCardFlip();
                        setIsCustomSpectrum(!isCustomSpectrum);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all flex items-center gap-1.5 ${
                        isCustomSpectrum
                          ? "bg-pink-500/20 border-pink-400 text-pink-300"
                          : "bg-slate-800 border-slate-700 text-amber-300 hover:border-amber-400/50"
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isCustomSpectrum ? "رجع للأطياف الجاهزة" : "✨ صايب طيف من راسك"}</span>
                    </button>

                    {!isCustomSpectrum && (
                      <button
                        type="button"
                        onClick={() => {
                          sound.playCardFlip();
                          onAction({ type: "REROLL_SPECTRUMS" });
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 text-xs font-bold flex items-center gap-1 transition-all"
                        title="بدّل الأطياف المقترحة"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                        <span>أطياف أخرى</span>
                      </button>
                    )}
                  </div>

                  <h3 className="text-base font-black text-white">
                    1. اختار طيف الموجة:
                  </h3>
                </div>

                {!isCustomSpectrum ? (
                  <div className="grid grid-cols-1 gap-2.5">
                    {candidateSpectrums.map((spec) => {
                      const isSelected = spec.id === previewSpectrum.id;
                      return (
                        <button
                          key={spec.id}
                          type="button"
                          onClick={() => {
                            sound.playCardFlip();
                            setSelectedSpectrumId(spec.id);
                          }}
                          className={`w-full p-3.5 rounded-2xl border text-right transition-all ${
                            isSelected
                              ? "bg-gradient-to-r from-cyan-950/90 to-pink-950/90 border-amber-400 shadow-lg shadow-amber-500/10"
                              : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1.5">
                            <span>{isSelected ? "✅ مختار دابا" : "كليكي للاختيار"}</span>
                            <span className="text-amber-400">{spec.categoryLabel}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 items-center" dir="ltr">
                            <div className="p-2 rounded-xl bg-cyan-950/50 border border-cyan-500/30 text-left">
                              <span className="text-[10px] font-black text-cyan-400 block">0%</span>
                              <span className="text-xs sm:text-sm font-black text-white" dir="rtl">
                                {spec.leftLabel}
                              </span>
                            </div>
                            <div className="p-2 rounded-xl bg-pink-950/50 border border-pink-500/30 text-right">
                              <span className="text-[10px] font-black text-pink-400 block">100%</span>
                              <span className="text-xs sm:text-sm font-black text-white" dir="rtl">
                                {spec.rightLabel}
                              </span>
                            </div>
                          </div>
                          {spec.examples && (
                            <p className="text-[11px] text-slate-400 mt-2 text-right">
                              💡 {spec.examples}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-pink-500/30 space-y-3">
                    <p className="text-xs text-pink-300 font-bold">
                      ✨ دير طيف خاص بيكم وبجماعتكم (Inside Joke):
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-cyan-400 mb-1">
                          القطب الأول (0% - أقصى اليسار):
                        </label>
                        <input
                          type="text"
                          value={customLeft}
                          onChange={(e) => setCustomLeft(e.target.value)}
                          placeholder="مثلا: كيمشي ينعس مع 9 دالليل"
                          maxLength={40}
                          className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-cyan-500/40 text-white text-xs font-bold focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-pink-400 mb-1">
                          القطب الثاني (100% - أقصى اليمين):
                        </label>
                        <input
                          type="text"
                          value={customRight}
                          onChange={(e) => setCustomRight(e.target.value)}
                          placeholder="مثلا: كيسهر حتى يودن الفجر"
                          maxLength={40}
                          className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-pink-500/40 text-white text-xs font-bold focus:outline-none focus:border-pink-400"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Clue Input */}
                <form onSubmit={handleTransmitClue} className="space-y-3 pt-2 border-t border-slate-800">
                  <label className="block text-base font-black text-white">
                    2. اكتب إشارة التردد (التلميح ديالك لـ {secretTarget}%):
                  </label>
                  <input
                    type="text"
                    value={clueInput}
                    onChange={(e) => setClueInput(e.target.value)}
                    placeholder={`مثال: شي حاجة كتجي فـ ${secretTarget}% بين هاد الجوج...`}
                    maxLength={80}
                    className="w-full px-4 py-3.5 rounded-2xl bg-slate-950 border-2 border-slate-700 focus:border-amber-400 text-white font-bold text-sm placeholder:text-slate-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400">
                    ⚠️ ممنوع تكتب أرقام أو نسب مئوية. عطي مثال، موقف، أو فكرة ذكية!
                  </p>

                  {localError && (
                    <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-300 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{localError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 hover:brightness-110 text-white font-black text-base shadow-xl shadow-cyan-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <Send className="w-5 h-5" />
                    <span>بثّ الموجة لصحابك دابا! 📡</span>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            /* Receiver Waiting Screen during TRANSMITTER_SELECT */
            <div className="rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-cyan-500/30 p-6 text-center shadow-2xl space-y-5">
              <div className="w-16 h-16 rounded-full bg-cyan-500/15 border-2 border-cyan-400/50 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/20">
                <Radio className="w-8 h-8 text-cyan-400 animate-pulse" />
              </div>

              <div>
                <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black">
                  جاري تحضير البث...
                </span>
                <h2 className="text-2xl font-black text-white mt-2">
                  {transmitterName} كيقادّ الموجة السرية! 🧠📡
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                  دابا غير يختار الطيف ويصيفط الإشارة، غادي يبان ليك الرادار فالتليفون ديالك باش تشدّ التردد الصحيح!
                </p>
              </div>

              {/* Interactive Warm-Up Dial for Receivers while waiting */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <p className="text-xs font-bold text-cyan-300 mb-2">
                  🎛️ رادار التدريب (جرّب تحرك المؤشر بيدك باش توجد راسك):
                </p>
                <MawjaRadarDial
                  leftLabel="أقصى اليسار (0%)"
                  rightLabel="أقصى اليمين (100%)"
                  value={practiceDial}
                  onChange={setPracticeDial}
                  interactive={true}
                  showTarget={false}
                  statusLabel="رادار الاستعداد"
                />
              </div>

              {/* Scoring Rules Quick Guide */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-right">
                <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/30">
                  <span className="text-xs font-black text-emerald-400 block">🎯 فالصميم (±4%)</span>
                  <span className="text-[11px] text-slate-300">4 نقط كاملة</span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-500/30">
                  <span className="text-xs font-black text-amber-400 block">🔥 قريب (±11%)</span>
                  <span className="text-[11px] text-slate-300">3 نقط</span>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-950/50 border border-blue-500/30">
                  <span className="text-xs font-black text-blue-400 block">👌 فالموجة (±19%)</span>
                  <span className="text-[11px] text-slate-300">نقطتان (2)</span>
                </div>
                <div className="p-2.5 rounded-xl bg-orange-950/50 border border-orange-500/30">
                  <span className="text-xs font-black text-orange-400 block">🔥 ضوبل الرهان</span>
                  <span className="text-[11px] text-slate-300">يدوبل لـ 8 نقط!</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* PHASE 2: RECEIVERS_TUNE                                               */}
      {/* ===================================================================== */}
      {phase === "RECEIVERS_TUNE" && currentSpectrum && (
        <div className="space-y-4">
          {/* Broadcasted Signal Banner */}
          <div className="rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-cyan-950 border-2 border-amber-400/60 p-5 text-center shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between text-xs font-bold mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {currentSpectrum.categoryLabel}
              </span>
              <span className="text-amber-300 flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 animate-ping" />
                <span>إشارة من دماغ {transmitterName}:</span>
              </span>
            </div>

            <div className="my-3 py-3 px-4 rounded-2xl bg-black/50 border border-amber-400/30 shadow-inner">
              <p className="text-2xl sm:text-3xl font-black text-amber-300 tracking-wide">
                &ldquo;{currentClue}&rdquo;
              </p>
            </div>

            <p className="text-xs text-slate-300">
              فين كضن بلّي <strong className="text-white">{transmitterName}</strong> حطّ هاد الفكرة بين القطبين؟
            </p>
          </div>

          {!isTransmitter ? (
            /* Receiver Interactive Tuning Deck */
            <div className="rounded-3xl bg-slate-900/95 border border-slate-800 p-4 sm:p-5 shadow-xl space-y-4">
              <MawjaRadarDial
                leftLabel={currentSpectrum.leftLabel}
                rightLabel={currentSpectrum.rightLabel}
                value={dialValue}
                onChange={(v) => {
                  setDialValue(v);
                  if (!isEditingGuess) setIsEditingGuess(true);
                }}
                interactive={!hasSubmitted || isEditingGuess}
                showTarget={false}
                statusLabel={
                  hasSubmitted && !isEditingGuess
                    ? `✅ ترددك مقفول فـ ${dialValue}%`
                    : `التردد ديالك: ${dialValue}%`
                }
              />

              {/* Tactical Enhancers: Double-Down & Side-Bet */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {/* 1. Double-Down Chip Toggle */}
                <div
                  className={`p-3.5 rounded-2xl border transition-all ${
                    doubleDown
                      ? "bg-orange-950/70 border-orange-400 shadow-lg shadow-orange-500/15"
                      : "bg-slate-950/70 border-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-orange-300">
                      باقي ليك: {myChipsRemaining} 🔥
                    </span>
                    <span className="text-xs font-black text-white flex items-center gap-1">
                      <Flame className="w-4 h-4 text-orange-400" />
                      <span>ضوبل الرهان (x2)</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-2.5 leading-relaxed">
                    إلا جبتيها فالصميم (4) أو قريب (3) كتدوبل لـ <strong>8 أو 6 نقط</strong>! وإلا زگلتي كتنقص نقطة (-1).
                  </p>
                  <button
                    type="button"
                    disabled={myChipsRemaining <= 0 && !doubleDown}
                    onClick={() => {
                      sound.playCardFlip();
                      setDoubleDown(!doubleDown);
                      setIsEditingGuess(true);
                    }}
                    className={`w-full py-2 rounded-xl text-xs font-black transition-all ${
                      doubleDown
                        ? "bg-gradient-to-r from-orange-500 to-rose-600 text-white shadow-md"
                        : myChipsRemaining > 0
                        ? "bg-slate-800 hover:bg-slate-700 text-orange-300 border border-orange-500/30"
                        : "bg-slate-900 text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    {doubleDown
                      ? "🔥 مفعل! غادي نضوبل الرهان"
                      : myChipsRemaining > 0
                      ? "فعّل ضوبل الرهان 🔥"
                      : "ساليو ليك فيشات الدوبل"}
                  </button>
                </div>

                {/* 2. Side-Bet on a Friend */}
                <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-emerald-400">+1 نقطة فابور</span>
                    <span className="text-xs font-black text-white flex items-center gap-1">
                      <Target className="w-4 h-4 text-emerald-400" />
                      <span>شكون غادي يجيبها لاصقة؟</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-2">
                    راهن على صاحبك اللي غادي يكون أقرب واحد للهدف:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {receivers
                      .filter((r) => r.id !== activePlayerId)
                      .map((friend) => {
                        const isPicked = predictedBestPlayerId === friend.id;
                        return (
                          <button
                            key={friend.id}
                            type="button"
                            onClick={() => {
                              sound.playCardFlip();
                              setPredictedBestPlayerId(isPicked ? null : friend.id);
                              setIsEditingGuess(true);
                            }}
                            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                              isPicked
                                ? "bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-sm"
                                : "bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500"
                            }`}
                          >
                            {isPicked ? "🎯 " : ""}
                            {friend.nickname}
                          </button>
                        );
                      })}
                    {receivers.filter((r) => r.id !== activePlayerId).length === 0 && (
                      <span className="text-[11px] text-slate-500">نتا بوحدك اللي كتستقبل فهاد الجولة</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Lock-In / Update Action Button */}
              {!hasSubmitted || isEditingGuess ? (
                <button
                  type="button"
                  onClick={handleLockGuess}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:brightness-110 text-white font-black text-base shadow-xl shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>
                    {hasSubmitted
                      ? `تحديث التردد لـ ${dialValue}% 📡`
                      : `اقفل التردد فـ ${dialValue}% 📡`}
                  </span>
                </button>
              ) : (
                <div className="p-3.5 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setIsEditingGuess(true)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700"
                  >
                    بدّل التردد
                  </button>
                  <div className="text-right">
                    <span className="text-xs font-black text-emerald-300 block">
                      ✅ التردد ديالك واجد ({dialValue}%)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      كنتسناو باقي الصحاب يقفلو التردد ديالهم...
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Transmitter Spectator View while Receivers Tune */
            <div className="rounded-3xl bg-slate-900/95 border border-cyan-500/30 p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black">
                  الهدف السري: {secretTarget}%
                </span>
                <h3 className="text-base font-black text-white">
                  📡 صحابك كيبحثو على الموجة ديالك دابا...
                </h3>
              </div>

              <MawjaRadarDial
                leftLabel={currentSpectrum.leftLabel}
                rightLabel={currentSpectrum.rightLabel}
                value={secretTarget}
                targetValue={secretTarget}
                showTarget={true}
                interactive={false}
                statusLabel={`هدفك السري: ${secretTarget}%`}
              />
            </div>
          )}

          {/* Live Receivers Readiness Footer */}
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-black text-cyan-400">
                {lockedPlayerIds.length} / {receivers.length} واجدين
              </span>
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-amber-400" />
                <span>حالة مستقبلين الموجة:</span>
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {receivers.map((r) => {
                const isReady = lockedPlayerIds.includes(r.id);
                const isDoubled = doubleDownPlayerIds.includes(r.id);
                return (
                  <div
                    key={r.id}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                      isReady
                        ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                        : "bg-slate-950/60 border-slate-800 text-slate-400"
                    }`}
                  >
                    <span>{isReady ? "✅" : "⏳"}</span>
                    <span>{r.nickname}</span>
                    {isDoubled && (
                      <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 text-[10px] font-black">
                        🔥 x2
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Force Reveal button for Host/Transmitter if at least 1 player submitted */}
            {(isHost || isTransmitter) && lockedPlayerIds.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    sound.playCardFlip();
                    onAction({ type: "FORCE_REVEAL" });
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-xs font-black flex items-center gap-1.5 transition-all"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>اكشف الموجة دابا ({lockedPlayerIds.length} واجدين)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHASE 3: ROUND_REVEAL                                                 */}
      {/* ===================================================================== */}
      {phase === "ROUND_REVEAL" && lastRoundResult && (
        <div className="space-y-4">
          {/* Reveal Header & Radar Plot */}
          <div className="rounded-3xl bg-gradient-to-b from-slate-900 via-slate-950 to-indigo-950/90 border-2 border-emerald-400/50 p-5 shadow-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-xs font-black">
                🎯 الهدف الحقيقي: {lastRoundResult.targetValue}%
              </span>
              <span className="text-xs font-bold text-amber-300">
                📡 تلميح {getNickname(lastRoundResult.transmitterId)}: &ldquo;{lastRoundResult.clue}&rdquo;
              </span>
            </div>

            {/* Moroccan Darija Commentary Banner */}
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-cyan-500/30 text-center">
              <h3 className="text-lg font-black text-amber-300 mb-1">
                {lastRoundResult.headline}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {lastRoundResult.commentary}
              </p>
            </div>

            <MawjaRadarDial
              leftLabel={lastRoundResult.spectrum.leftLabel}
              rightLabel={lastRoundResult.spectrum.rightLabel}
              value={lastRoundResult.targetValue}
              targetValue={lastRoundResult.targetValue}
              showTarget={true}
              interactive={false}
              plottedNeedles={plottedNeedles}
              statusLabel={`الهدف: ${lastRoundResult.targetValue}%`}
            />
          </div>

          {/* Round Evaluations Breakdown */}
          <div className="rounded-3xl bg-slate-900/95 border border-slate-800 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-cyan-300">
                📡 مول الموجة ({getNickname(lastRoundResult.transmitterId)}) ربح:{" "}
                <strong className="text-emerald-400">+{lastRoundResult.transmitterPoints} نقط</strong>
              </span>
              <h3 className="text-base font-black text-white">نتائج الجولة بالتفصيل:</h3>
            </div>

            <div className="space-y-2.5">
              {lastRoundResult.evaluations.map((ev) => {
                const zMeta = ZONE_META[ev.zone];
                return (
                  <div
                    key={ev.playerId}
                    className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-xl text-xs font-black ${
                          ev.totalDelta > 0
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : ev.totalDelta < 0
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {ev.totalDelta > 0 ? `+${ev.totalDelta} نقط` : `${ev.totalDelta} نقطة`}
                      </span>

                      {ev.doubleDown && (
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                            ev.doubleDownDelta > 0
                              ? "bg-orange-500/20 text-orange-300 border border-orange-500/40"
                              : "bg-rose-950 text-rose-300 border border-rose-500/40"
                          }`}
                        >
                          {ev.doubleDownDelta > 0
                            ? `🔥 دوبل ناجح (+${ev.doubleDownDelta})`
                            : "💔 ضاع الدوبل (-1)"}
                        </span>
                      )}

                      {ev.sideBetWon && (
                        <span className="px-2 py-0.5 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/40 text-[10px] font-black">
                          🤝 رهان صادق (+1)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border ${zMeta.badgeClass}`}>
                        {zMeta.label} (فرق {ev.diff}%)
                      </span>
                      <div className="text-right">
                        <span className="text-sm font-black text-white block">
                          {getNickname(ev.playerId)}
                        </span>
                        <span className="text-[11px] text-amber-400 font-bold">
                          حطّ {ev.value}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Next Round CTA (Host or Transmitter) */}
            {(isHost || isTransmitter) ? (
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => {
                    sound.playCardFlip();
                    onAction({ type: "NEXT_ROUND" });
                  }}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:brightness-110 text-slate-950 font-black text-base shadow-xl shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <span>
                    {round >= maxRounds
                      ? "شوف الفائز النهائي والأوسمة 🏆"
                      : `ندوزو للجولة ${round + 1} 📡`}
                  </span>
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <p className="text-center text-xs text-slate-400 pt-2">
                كنتسناو مول الموجة أو مول الغرفة يدوز للجولة الجاية...
              </p>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHASE 4: GAME_OVER                                                    */}
      {/* ===================================================================== */}
      {phase === "GAME_OVER" && (
        <div className="space-y-4">
          {/* Podium Hero Card */}
          <div className="rounded-3xl bg-gradient-to-b from-amber-950/60 via-slate-900 to-slate-950 border-2 border-amber-400/60 p-6 text-center shadow-2xl space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20">
              <Trophy className="w-9 h-9 text-amber-400" />
            </div>

            <div>
              <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black">
                سالات المهمة! 📡🎉
              </span>
              <h2 className="text-3xl font-black text-white mt-2">
                {getNickname(winnerId || sortedPlayers[0]?.id || "")} على رأس الموجة! 👑
              </h2>
              <p className="text-xs text-slate-300 mt-1">
                أعلى تردد وأحسن قراءة للعقول فهاد الجماعة!
              </p>
            </div>

            {/* Final Standings List */}
            <div className="space-y-2 max-w-md mx-auto text-right">
              {sortedPlayers.map((p, idx) => {
                const isWinner = p.id === (winnerId || sortedPlayers[0]?.id);
                return (
                  <div
                    key={p.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                      isWinner
                        ? "bg-amber-500/20 border-amber-400 text-white shadow-lg"
                        : "bg-slate-900/90 border-slate-800 text-slate-200"
                    }`}
                  >
                    <span className="px-3 py-1 rounded-xl bg-black/40 font-black text-emerald-400 text-sm">
                      {scores[p.id] || 0} نقطة
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-black">{p.nickname}</span>
                      <span className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center font-black text-xs text-amber-400">
                        {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Special Player Awards */}
            {awards && awards.length > 0 && (
              <div className="pt-4 border-t border-slate-800">
                <h3 className="text-sm font-black text-amber-300 mb-3 flex items-center justify-center gap-1.5">
                  <Award className="w-4 h-4" />
                  <span>أوسمة الموجة الخاصة:</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {awards.map((aw, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-2xl bg-slate-900/90 border border-cyan-500/30 text-center"
                    >
                      <div className="text-2xl mb-1">{aw.badge}</div>
                      <div className="text-xs font-black text-amber-300">{aw.title}</div>
                      <div className="text-sm font-black text-white my-0.5">
                        {getNickname(aw.playerId)}
                      </div>
                      <div className="text-[11px] text-slate-400">{aw.subtitle}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                sound.playCardFlip();
                onAction({ type: "RESTART_GAME" });
              }}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-white font-black text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-5 h-5" />
              <span>نعاودو طريح جديد بأطياف جديدة! 🔄</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
