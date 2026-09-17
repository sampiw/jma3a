"use client";

import React, { useState } from "react";
import { ChkonFinaIcon } from "@/components/icons/ChkonFinaIcon";
import { sound } from "@/lib/sound";
import { CheckCircle2, Flame, Award } from "lucide-react";
import confetti from "canvas-confetti";

interface ChkonFinaGameViewProps {
  publicData: any;
  privateData?: any;
  isHost: boolean;
  onAction: (action: any) => void;
  players: Array<{ id: string; nickname: string; avatarSeed?: string }>;
}

export function ChkonFinaGameView({
  publicData,
  privateData,
  isHost,
  onAction,
  players,
}: ChkonFinaGameViewProps) {
  const [selectedCandidate, setSelectedCandidate] = useState<string>("");

  const results = publicData.results;
  const currentPrompt = publicData.currentPrompt;

  React.useEffect(() => {
    if (results) {
      sound.playSuccess();
      if (results.isUnanimous) {
        confetti({ particleCount: 70, spread: 70, origin: { y: 0.5 } });
      }
    }
  }, [results]);

  return (
    <div className="flex flex-col items-center max-w-md mx-auto p-4 text-center">
      {/* Game Badge */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-jma3a-surface border border-jma3a-border mb-4 text-xs">
        <ChkonFinaIcon className="w-5 h-5" />
        <span className="text-jma3a-sand font-bold">شكون فينا؟</span>
        <span className="text-jma3a-gold font-mono">• سؤال #{publicData.round || 1}</span>
      </div>

      {/* The Question Card */}
      <div className="w-full p-6 rounded-3xl bg-gradient-to-br from-jma3a-surface to-jma3a-card border border-jma3a-gold/30 shadow-2xl mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-jma3a-gold/5 rounded-full blur-2xl pointer-events-none" />
        <span className="text-xs text-jma3a-muted uppercase tracking-wider block mb-2">السؤال الاجتماعي</span>
        <h2 className="text-2xl font-black text-jma3a-sand leading-snug">
          &quot;{currentPrompt?.prompt}&quot;
        </h2>
      </div>

      {/* Voting Ballot (Active when no results yet) */}
      {!results ? (
        <div className="w-full p-5 rounded-2xl bg-jma3a-card border border-jma3a-border mb-4 text-right">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-jma3a-muted">صوتوا فالسرية ({publicData.votesCount || 0}/{players.length})</span>
            <h3 className="text-sm font-bold text-jma3a-sand">اختار الشخص:</h3>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {players.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedCandidate(p.id);
                  sound.playCardFlip();
                  onAction({ type: "CAST_VOTE", targetPlayerId: p.id });
                }}
                className={`p-3.5 rounded-2xl border text-sm font-semibold transition-all flex items-center justify-between ${
                  selectedCandidate === p.id || privateData?.myVote === p.id
                    ? "bg-gradient-to-r from-jma3a-gold to-amber-500 text-jma3a-dark border-jma3a-gold font-bold shadow-lg shadow-jma3a-gold/20"
                    : "bg-jma3a-surface text-jma3a-sand border-jma3a-border hover:border-jma3a-gold/50"
                }`}
              >
                <span>{p.nickname}</span>
                {(selectedCandidate === p.id || privateData?.myVote === p.id) && (
                  <CheckCircle2 className="w-4 h-4 text-jma3a-dark" />
                )}
              </button>
            ))}
          </div>

          {isHost && (
            <button
              onClick={() => onAction({ type: "REVEAL_RESULTS" })}
              className="w-full mt-4 py-3 rounded-xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand font-bold text-sm border border-jma3a-border"
            >
              حسم وكشف النتائج الآن 📊
            </button>
          )}
        </div>
      ) : (
        /* Results Revealed Screen */
        <div className="w-full p-5 rounded-3xl bg-jma3a-card border border-jma3a-border mb-4 text-right animate-fadeIn">
          {results.isUnanimous && (
            <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-center mb-4 flex items-center justify-center gap-2 text-amber-300 font-black text-sm animate-pulse">
              <Flame className="w-5 h-5 text-amber-400" />
              <span>إجماع كلي! كولشي اتفق على نفس الشخص! 🎯</span>
            </div>
          )}

          <h3 className="text-sm font-bold text-jma3a-sand mb-3">توزيع الأصوات:</h3>

          <div className="space-y-3">
            {players.map((p) => {
              const count = results.counts?.[p.id] || 0;
              const pct = results.percentages?.[p.id] || 0;
              const isWinner = results.topCandidateId === p.id && count > 0;

              return (
                <div key={p.id} className="p-3 rounded-xl bg-jma3a-surface/80 border border-jma3a-border">
                  <div className="flex justify-between items-center mb-1 text-sm">
                    <span className="font-bold text-jma3a-sand flex items-center gap-1.5">
                      {isWinner && <Award className="w-4 h-4 text-jma3a-gold" />}
                      <span>{p.nickname}</span>
                    </span>
                    <span className="font-mono text-xs text-jma3a-gold font-bold">
                      {count} صوت ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-black/40 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${
                        isWinner ? "bg-gradient-to-r from-jma3a-gold to-amber-500" : "bg-jma3a-muted/40"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {isHost && (
            <button
              onClick={() => onAction({ type: "NEXT_PROMPT" })}
              className="w-full mt-5 py-3.5 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-bold shadow-lg shadow-jma3a-terracotta/30"
            >
              السؤال الموالي ⏩
            </button>
          )}
        </div>
      )}
    </div>
  );
}
