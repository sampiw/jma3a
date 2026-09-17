"use client";

import React, { useState, useEffect } from "react";
import { Mamnou3Icon } from "@/components/icons/Mamnou3Icon";
import { sound } from "@/lib/sound";
import { Play, Check, RotateCcw, AlertOctagon, Clock } from "lucide-react";

interface Mamnou3GameViewProps {
  publicData: any;
  privateData?: any;
  mySecret?: string;
  isHost: boolean;
  onAction: (action: any) => void;
  players: Array<{ id: string; nickname: string }>;
}

export function Mamnou3GameView({
  publicData,
  privateData,
  isHost,
  onAction,
  players,
}: Mamnou3GameViewProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(60);
  const [isActiveTimer, setIsActiveTimer] = useState(false);

  const isDescriber = privateData?.isDescriber;
  const activeDescriber = players.find((p) => p.id === publicData.activeDescriberId);
  const card = privateData?.card;

  // Timer loop
  useEffect(() => {
    let interval: any = null;
    if (isActiveTimer && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 6 && prev > 1) {
            sound.playTick();
          } else if (prev === 1) {
            sound.playBuzzer();
            setIsActiveTimer(false);
            onAction({ type: "END_TURN" });
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActiveTimer, secondsLeft, onAction]);

  const handleStart = () => {
    sound.playCardFlip();
    setSecondsLeft(60);
    setIsActiveTimer(true);
    onAction({ type: "START_DESCRIBING" });
  };

  const handleCorrect = () => {
    sound.playSuccess();
    onAction({ type: "MARK_CORRECT" });
  };

  const handleTaboo = () => {
    sound.playBuzzer();
    onAction({ type: "MARK_TABOO" });
  };

  const handleSkip = () => {
    sound.playCardFlip();
    onAction({ type: "MARK_SKIP" });
  };

  return (
    <div className="flex flex-col items-center max-w-md mx-auto p-4 text-center">
      {/* Teams Scoreboard Header */}
      <div className="w-full flex gap-3 mb-5">
        {publicData.teams?.map((team: any, idx: number) => {
          const isCurrent = idx === publicData.activeTeamIndex;
          return (
            <div
              key={team.id}
              className={`flex-1 p-3 rounded-2xl border text-center transition-all ${
                isCurrent
                  ? "bg-jma3a-surface border-rose-500 shadow-lg shadow-rose-500/10"
                  : "bg-jma3a-card border-jma3a-border opacity-70"
              }`}
            >
              <span className="text-xs text-jma3a-muted block mb-0.5">{team.name}</span>
              <span className="text-2xl font-black text-rose-400">{team.score}</span>
              <span className="text-[10px] text-jma3a-muted block">نقطة</span>
            </div>
          );
        })}
      </div>

      {/* Prepare State */}
      {!isActiveTimer && !card && (
        <div className="w-full p-8 rounded-3xl bg-jma3a-card border border-jma3a-border mb-6 text-center">
          <Mamnou3Icon className="w-16 h-16 mx-auto mb-3" />
          <h3 className="text-xl font-black text-jma3a-sand mb-1">
            دور: <strong className="text-rose-400">{publicData.activeTeamName}</strong>
          </h3>
          <p className="text-sm text-jma3a-muted mb-6">
            الشخص اللي غادي يشرح: <strong className="text-jma3a-sand">{activeDescriber?.nickname}</strong>
          </p>

          <button
            onClick={handleStart}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 to-red-500 text-white font-black text-lg shadow-xl shadow-rose-600/30 flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all"
          >
            <Play className="w-6 h-6 fill-white" />
            <span>بدا الدور (60 ثانية)</span>
          </button>
        </div>
      )}

      {/* Active Taboo Card */}
      {card && (
        <div className="w-full flex flex-col items-center">
          {/* Countdown Clock */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-jma3a-surface border border-jma3a-border mb-4">
            <Clock className={`w-5 h-5 ${secondsLeft <= 10 ? "text-rose-500 animate-bounce" : "text-jma3a-gold"}`} />
            <span className={`text-2xl font-mono font-black ${secondsLeft <= 10 ? "text-rose-400" : "text-jma3a-sand"}`}>
              {secondsLeft}s
            </span>
          </div>

          {/* The Taboo Card */}
          <div className="w-full p-6 rounded-3xl bg-gradient-to-br from-jma3a-surface to-jma3a-card border border-rose-500/40 shadow-2xl mb-6">
            {/* Target Word */}
            <div className="p-4 rounded-2xl bg-jma3a-dark border border-jma3a-border mb-4 text-center">
              <span className="text-xs text-jma3a-muted block mb-1">الكلمة المطلوبة:</span>
              <h2 className="text-3xl font-black text-emerald-400">{card.target}</h2>
            </div>

            {/* Forbidden Words */}
            <div className="text-right">
              <span className="text-xs text-rose-400 font-bold block mb-2 flex items-center gap-1">
                <AlertOctagon className="w-4 h-4 text-rose-500" />
                <span>ممنوع تنطق بهاد الكلمات:</span>
              </span>
              <div className="space-y-2">
                {card.forbidden?.map((word: string, i: number) => (
                  <div
                    key={i}
                    className="py-2 px-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-sm font-semibold text-center"
                  >
                    🚫 {word}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Actions: Correct, Taboo Buzzer, Skip */}
          <div className="w-full grid grid-cols-3 gap-2">
            <button
              onClick={handleTaboo}
              className="py-4 px-2 rounded-2xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/60 text-rose-300 font-bold text-sm flex flex-col items-center justify-center gap-1 active:scale-95"
            >
              <AlertOctagon className="w-5 h-5 text-rose-400" />
              <span>ممنوع (-1)</span>
            </button>

            <button
              onClick={handleSkip}
              className="py-4 px-2 rounded-2xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand font-bold text-sm border border-jma3a-border flex flex-col items-center justify-center gap-1 active:scale-95"
            >
              <RotateCcw className="w-5 h-5 text-jma3a-muted" />
              <span>تخطي (0)</span>
            </button>

            <button
              onClick={handleCorrect}
              className="py-4 px-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 flex flex-col items-center justify-center gap-1 active:scale-95"
            >
              <Check className="w-6 h-6 stroke-[3]" />
              <span>صحيحة (+1)</span>
            </button>
          </div>
        </div>
      )}

      {/* Turn Summary Screen */}
      {!isActiveTimer && publicData.turnCorrectCount !== undefined && (publicData.turnCorrectCount > 0 || publicData.turnTabooCount > 0) && (
        <div className="w-full p-6 rounded-3xl bg-jma3a-card border border-jma3a-border mt-4 text-center animate-fadeIn">
          <h4 className="text-lg font-bold text-jma3a-sand mb-2">سالات هاد الجولة!</h4>
          <div className="flex justify-center gap-4 text-sm font-bold mb-4">
            <span className="text-emerald-400">+{publicData.turnCorrectCount} صحيحة</span>
            <span className="text-rose-400">-{publicData.turnTabooCount} ممنوعة</span>
          </div>

          {isHost && (
            <button
              onClick={() => onAction({ type: "NEXT_TEAM_TURN" })}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-500 text-white font-bold shadow-lg shadow-rose-600/30"
            >
              دور الفرقة الموالية ⏩
            </button>
          )}
        </div>
      )}
    </div>
  );
}
