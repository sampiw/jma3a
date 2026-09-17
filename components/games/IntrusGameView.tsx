"use client";

import React, { useState } from "react";
import { Card3D } from "@/components/Card3D";
import { IntrusEyeIcon } from "@/components/icons/IntrusEyeIcon";
import { sound } from "@/lib/sound";
import { Sparkles, Trophy } from "lucide-react";
import confetti from "canvas-confetti";

interface IntrusGameViewProps {
  publicData: any;
  privateData?: any;
  mySecret?: string;
  isHost: boolean;
  onAction: (action: any) => void;
  players: Array<{ id: string; nickname: string }>;
}

export function IntrusGameView({
  publicData,
  privateData,
  mySecret,
  isHost,
  onAction,
  players,
}: IntrusGameViewProps) {
  const [selectedSuspect, setSelectedSuspect] = useState<string>("");
  const [guessInput, setGuessInput] = useState<string>("");

  const isIntruder = privateData?.isIntruder;
  const currentSpeaker = players.find((p) => p.id === publicData.currentTurnPlayerId);

  React.useEffect(() => {
    if (publicData.intruderCaught !== undefined) {
      sound.playSuccess();
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
    }
  }, [publicData.intruderCaught]);

  return (
    <div className="flex flex-col items-center max-w-md mx-auto p-4 text-center">
      {/* Game Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-jma3a-surface border border-jma3a-border mb-4 text-xs">
        <IntrusEyeIcon className="w-5 h-5" />
        <span className="text-jma3a-sand font-bold">الدخيل (L'Intrus)</span>
        <span className="text-jma3a-muted">• الجولة {publicData.clueRoundIndex || 1}</span>
      </div>

      {/* Secret Card Flip */}
      <div className="w-full mb-6">
        <Card3D
          className="w-72 h-80 mx-auto"
          frontContent={
            <div className="flex flex-col items-center justify-center h-full p-4 text-center">
              <IntrusEyeIcon className="w-16 h-16 mb-3 text-emerald-400" />
              <h3 className="text-lg font-bold text-jma3a-sand mb-1">الكلمة السرية</h3>
              <p className="text-xs text-jma3a-muted">انقر للقلب وشوف كلمتك الخاصة بوحدك</p>
            </div>
          }
          backContent={
            <div className="flex flex-col items-center justify-center h-full p-4 text-center">
              {isIntruder ? (
                <>
                  <span className="text-4xl mb-2">🕵️</span>
                  <h3 className="text-2xl font-black text-rose-400 mb-2">أنت هو الدخيل!</h3>
                  <p className="text-xs text-jma3a-sand/80 leading-relaxed">
                    ما عندك حتى كلمة سرية! سمع مزيان لتلميحات الأصحاب وعطي تلميح عام باش ما يعيقوش بيك!
                  </p>
                </>
              ) : (
                <>
                  <span className="text-3xl mb-2">🔑</span>
                  <span className="text-xs text-jma3a-muted mb-1">الكلمة السرية ديالك:</span>
                  <h3 className="text-2xl font-black text-jma3a-gold mb-2">{mySecret}</h3>
                  <p className="text-xs text-jma3a-sand/80">
                    عطي تلميح ذكي كيخص هاد الكلمة بلا ما تنطقها نهائياً!
                  </p>
                </>
              )}
            </div>
          }
        />
      </div>

      {/* Turn Indicator for Clue Rounds */}
      {publicData.currentTurnPlayerId && !publicData.votes && (
        <div className="w-full p-4 rounded-2xl bg-jma3a-card border border-jma3a-border mb-4 text-center">
          <span className="text-xs text-jma3a-muted block mb-1">الدور دابا عند:</span>
          <div className="text-xl font-black text-jma3a-sand flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-jma3a-gold" />
            <span>{currentSpeaker?.nickname}</span>
          </div>
          <p className="text-xs text-jma3a-muted mt-2">
            عطي كلمة وحدة أو تلميح صغير بصوتك فالجلسة
          </p>

          <button
            onClick={() => onAction({ type: "NEXT_CLUE_TURN" })}
            className="w-full mt-3 py-2.5 rounded-xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand font-bold text-sm border border-jma3a-border"
          >
            عطى التلميح؟ دوز للي مورو ⏩
          </button>
        </div>
      )}

      {/* Voting Section */}
      <div className="w-full p-4 rounded-2xl bg-jma3a-card border border-jma3a-border mb-4 text-right">
        <h3 className="text-sm font-bold text-jma3a-sand mb-2">صوت على شكون بان ليك هو الدخيل:</h3>
        <div className="grid grid-cols-2 gap-2">
          {players.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelectedSuspect(p.id);
                sound.playCardFlip();
                onAction({ type: "VOTE_INTRUDER", targetPlayerId: p.id });
              }}
              className={`p-3 rounded-xl border text-sm font-semibold transition-all ${
                selectedSuspect === p.id
                  ? "bg-emerald-600 text-white border-emerald-400 font-bold"
                  : "bg-jma3a-surface text-jma3a-sand border-jma3a-border hover:border-emerald-400"
              }`}
            >
              {p.nickname}
            </button>
          ))}
        </div>

        {isHost && (
          <button
            onClick={() => onAction({ type: "RESOLVE_VOTES" })}
            className="w-full mt-3 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold text-sm shadow-md"
          >
            كشف التصويت والنتائج 🗳️
          </button>
        )}
      </div>

      {/* Intruder Final Guess Prompt */}
      {publicData.intruderCaught && isIntruder && !publicData.intruderGuessCorrect && (
        <div className="w-full p-4 rounded-2xl bg-rose-950/60 border border-rose-500/50 mb-4 text-right animate-fadeIn">
          <h4 className="text-sm font-bold text-rose-300 mb-1">حصلوك! ولكن مازال عندك أمل 🤫</h4>
          <p className="text-xs text-rose-200 mb-3">خمن الكلمة السرية اللي كانو كيهضرو عليها باش تخطف الفوز:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={guessInput}
              onChange={(e) => setGuessInput(e.target.value)}
              placeholder="اكتب تخمينك هنا..."
              className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-rose-500/30 text-white text-sm focus:outline-none"
            />
            <button
              onClick={() => onAction({ type: "INTRUDER_GUESS", guessedWord: guessInput })}
              className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold"
            >
              تأكيد
            </button>
          </div>
        </div>
      )}

      {/* Revealed Results */}
      {publicData.secretWord && (
        <div className="w-full p-5 rounded-2xl bg-gradient-to-b from-jma3a-surface to-jma3a-card border border-jma3a-border text-center mb-4">
          <h4 className="text-xs text-jma3a-muted mb-1">الكلمة الحقيقية كانت:</h4>
          <div className="text-2xl font-black text-jma3a-gold mb-2">{publicData.secretWord}</div>
          <div className="text-sm font-bold text-jma3a-sand mb-3">
            الدخيل كان هو: <strong className="text-rose-400">@{players.find((p) => p.id === publicData.intruderPlayerId)?.nickname}</strong>
          </div>

          {publicData.scores && (
            <div className="p-3 rounded-xl bg-black/30 text-xs text-right">
              <span className="font-bold text-jma3a-muted block mb-1 flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-jma3a-gold" />
                <span>جدول النقاط:</span>
              </span>
              {Object.entries(publicData.scores).map(([id, score]: [string, any]) => {
                const p = players.find((x) => x.id === id);
                return (
                  <div key={id} className="flex justify-between py-0.5">
                    <span>{p?.nickname}</span>
                    <strong className="text-jma3a-gold">{score} نقطة</strong>
                  </div>
                );
              })}
            </div>
          )}

          {isHost && (
            <button
              onClick={() => onAction({ type: "NEXT_ROUND" })}
              className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-bold text-sm shadow-md"
            >
              الجولة التالية 🔄
            </button>
          )}
        </div>
      )}
    </div>
  );
}
