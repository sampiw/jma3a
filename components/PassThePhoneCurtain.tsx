"use client";

import React from "react";
import { Lock, Eye, EyeOff, UserCheck } from "lucide-react";
import { sound } from "@/lib/sound";

interface PassThePhoneCurtainProps {
  currentPlayerNickname: string;
  currentPlayerId?: string;
  isRevealed: boolean;
  onStep: () => void;
  onSelectPlayer?: (playerId: string) => void;
  isHost?: boolean;
  onStartNight?: () => void;
  children: React.ReactNode;
}

export function PassThePhoneCurtain({
  currentPlayerNickname,
  currentPlayerId,
  isRevealed,
  onStep,
  onSelectPlayer,
  isHost,
  onStartNight,
  children,
}: PassThePhoneCurtainProps) {
  const handleAction = () => {
    sound.playCardFlip();
    if (!isRevealed && currentPlayerId && onSelectPlayer) {
      onSelectPlayer(currentPlayerId);
    }
    onStep();
  };

  if (isRevealed) {
    return (
      <div className="flex flex-col items-center justify-between min-h-[70vh] w-full max-w-md mx-auto p-4 animate-fadeIn">
        <div className="w-full flex items-center justify-between p-3 rounded-xl bg-jma3a-surface/60 border border-jma3a-border mb-4">
          <div className="flex items-center gap-2 text-sm text-jma3a-sand font-medium">
            <Eye className="w-4 h-4 text-jma3a-gold" />
            <span>دور: <strong className="text-jma3a-gold">{currentPlayerNickname}</strong></span>
          </div>
          <span className="text-xs text-rose-400 font-medium">👀 شوف غير بوحدك</span>
        </div>

        {/* The Secret Content */}
        <div className="w-full my-auto">{children}</div>

        {/* Hide and Pass CTA - Primary button right under the secret card */}
        <button
          onClick={handleAction}
          className="w-full py-4 mt-6 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-bold text-lg shadow-xl shadow-jma3a-terracotta/40 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <EyeOff className="w-5 h-5" />
          <span>خبي وكمل ودوز التليفون 🤫</span>
        </button>

        {/* Host bypass button at the VERY BOTTOM so no one misclicks it! */}
        {isHost && onStartNight && (
          <div className="w-full mt-4 pt-3 border-t border-white/10">
            <button
              onClick={() => {
                sound.playCardFlip();
                onStartNight();
              }}
              className="w-full py-2.5 rounded-xl bg-jma3a-surface/60 hover:bg-jma3a-surface border border-jma3a-border/60 text-xs font-semibold text-jma3a-muted hover:text-jma3a-sand transition-all"
            >
              🌙 الكل شاف دوره؟ سد الليل دابا (تخطي باقي اللاعبين)
            </button>
          </div>
        )}
      </div>
    );
  }

  // Privacy Curtain: Hand off phone
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] w-full max-w-md mx-auto p-6 text-center animate-fadeIn">
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-jma3a-surface to-jma3a-card border border-jma3a-border flex items-center justify-center shadow-2xl">
          <Lock className="w-12 h-12 text-jma3a-gold animate-pulse" />
        </div>
      </div>

      <span className="px-4 py-1.5 rounded-full text-xs font-semibold bg-jma3a-surface text-jma3a-muted border border-jma3a-border mb-3">
        دور سري 🔒
      </span>

      <h2 className="text-2xl font-black text-jma3a-sand mb-2">
        دوز التليفون لـ
      </h2>
      <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-jma3a-gold to-jma3a-accent mb-4">
        {currentPlayerNickname}
      </div>

      <p className="text-sm text-jma3a-muted max-w-xs mb-8">
        ماتخلي حتى شي واحد يشوف الشاشة معك. ملي تشد التليفون ورك لتحت!
      </p>

      <button
        onClick={handleAction}
        className="w-full py-4 rounded-2xl bg-gradient-to-r from-jma3a-surface to-jma3a-border text-jma3a-sand hover:text-white font-bold text-lg border border-jma3a-gold/40 shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 hover:border-jma3a-gold"
      >
        <UserCheck className="w-5 h-5 text-jma3a-gold" />
        <span>أنا هو / هي {currentPlayerNickname} 👀</span>
      </button>
    </div>
  );
}
