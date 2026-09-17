"use client";

import React, { useState, useEffect } from "react";
import { MettelhaIcon } from "@/components/icons/MettelhaIcon";
import { sound } from "@/lib/sound";
import { Play, Check, RotateCcw, Clock } from "lucide-react";

interface MettelhaGameViewProps {
  publicData: any;
  privateData?: any;
  mySecret?: string;
  isHost: boolean;
  onAction: (action: any) => void;
  players: Array<{ id: string; nickname: string }>;
}

export function MettelhaGameView({
  publicData,
  privateData,
  isHost,
  onAction,
  players,
}: MettelhaGameViewProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(60);
  const [isActiveTimer, setIsActiveTimer] = useState(false);

  const isActor = privateData?.isActor;
  const activeActor = players.find((p) => p.id === publicData.activeActorId);
  const promptText = privateData?.prompt?.prompt;

  // Countdown timer effect
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
    onAction({ type: "START_ACTING" });
  };

  const handleCorrect = () => {
    sound.playSuccess();
    onAction({ type: "MARK_CORRECT" });
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
                  ? "bg-jma3a-surface border-jma3a-gold shadow-lg shadow-jma3a-gold/10"
                  : "bg-jma3a-card border-jma3a-border opacity-70"
              }`}
            >
              <span className="text-xs text-jma3a-muted block mb-0.5">{team.name}</span>
              <span className="text-2xl font-black text-jma3a-gold">{team.score}</span>
              <span className="text-[10px] text-jma3a-muted block">نقطة</span>
            </div>
          );
        })}
      </div>

      {/* Preparation State */}
      {!isActiveTimer && !promptText && (
        <div className="w-full p-8 rounded-3xl bg-jma3a-card border border-jma3a-border mb-6 text-center">
          <MettelhaIcon className="w-16 h-16 mx-auto mb-3" />
          <h3 className="text-xl font-black text-jma3a-sand mb-1">
            دور: <strong className="text-jma3a-gold">{publicData.activeTeamName}</strong>
          </h3>
          <p className="text-sm text-jma3a-muted mb-6">
            الممثل هاد الجولة هو: <strong className="text-jma3a-sand">{activeActor?.nickname}</strong>
          </p>

          <button
            onClick={handleStart}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-black text-lg shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all"
          >
            <Play className="w-6 h-6 fill-white" />
            <span>واجد؟ بدا التوقيت (60 ثانية)</span>
          </button>
        </div>
      )}

      {/* Active Acting Card */}
      {promptText && (
        <div className="w-full flex flex-col items-center">
          {/* Circular Countdown */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-jma3a-surface border border-jma3a-border mb-4">
            <Clock className={`w-5 h-5 ${secondsLeft <= 10 ? "text-rose-500 animate-bounce" : "text-jma3a-gold"}`} />
            <span className={`text-2xl font-mono font-black ${secondsLeft <= 10 ? "text-rose-400" : "text-jma3a-sand"}`}>
              {secondsLeft}s
            </span>
          </div>

          {/* Huge Prompt Card */}
          <div className="w-full min-h-[200px] p-6 rounded-3xl bg-gradient-to-br from-jma3a-surface to-jma3a-card border border-jma3a-gold/40 shadow-2xl flex flex-col items-center justify-center mb-6">
            <span className="text-xs text-jma3a-muted mb-2">المطلوب تمثلو بدون كلام 🤐:</span>
            <div className="text-3xl font-black text-jma3a-sand leading-relaxed">
              &quot;{promptText}&quot;
            </div>
          </div>

          {/* Action Buttons */}
          <div className="w-full flex gap-3">
            <button
              onClick={handleSkip}
              className="flex-1 py-4 rounded-2xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand font-bold text-base border border-jma3a-border flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-5 h-5" />
              <span>دوز (تخطي)</span>
            </button>
            <button
              onClick={handleCorrect}
              className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-black text-lg shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Check className="w-6 h-6 stroke-[3]" />
              <span>صحيحة (+1)</span>
            </button>
          </div>
        </div>
      )}

      {/* Turn Summary Screen */}
      {!isActiveTimer && publicData.turnCorrectCount !== undefined && publicData.turnCorrectCount > 0 && (
        <div className="w-full p-6 rounded-3xl bg-jma3a-card border border-jma3a-border mt-4 text-center animate-fadeIn">
          <h4 className="text-lg font-bold text-jma3a-sand mb-2">سالات هاد الجولة! 🎉</h4>
          <p className="text-sm text-emerald-400 font-bold mb-4">
            جبتو {publicData.turnCorrectCount} إجابة صحيحة!
          </p>

          {isHost && (
            <button
              onClick={() => onAction({ type: "NEXT_TEAM_TURN" })}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-bold shadow-lg shadow-jma3a-terracotta/30"
            >
              دور الفرقة الموالية ⏩
            </button>
          )}
        </div>
      )}
    </div>
  );
}
