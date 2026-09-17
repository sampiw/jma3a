"use client";

import React, { useState } from "react";
import { Card3D } from "@/components/Card3D";
import { MissionIcon } from "@/components/icons/MissionIcon";
import { sound } from "@/lib/sound";
import { Check, X, RotateCcw, Award, ThumbsUp, ThumbsDown } from "lucide-react";
import confetti from "canvas-confetti";

interface MissionSirriyaGameViewProps {
  publicData: any;
  privateData?: any;
  mySecret?: string;
  isHost: boolean;
  onAction: (action: any) => void;
  players: Array<{ id: string; nickname: string }>;
}

export function MissionSirriyaGameView({
  publicData,
  privateData,
  isHost,
  onAction,
  players,
}: MissionSirriyaGameViewProps) {
  const [claimedLocal, setClaimedLocal] = useState(false);

  const mission = privateData?.mission;
  const isClaiming = publicData.currentClaimPlayerId !== undefined;
  const claimPlayer = players.find((p) => p.id === publicData.currentClaimPlayerId);

  React.useEffect(() => {
    if (mission?.confirmed) {
      sound.playSuccess();
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
    }
  }, [mission?.confirmed]);

  const handleClaim = () => {
    sound.playSuccess();
    setClaimedLocal(true);
    onAction({ type: "CLAIM_COMPLETION" });
  };

  const handleSwap = () => {
    sound.playCardFlip();
    onAction({ type: "SWAP_MISSION" });
  };

  return (
    <div className="flex flex-col items-center max-w-md mx-auto p-4 text-center">
      {/* Game Badge */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-jma3a-surface border border-jma3a-border mb-4 text-xs">
        <MissionIcon className="w-5 h-5" />
        <span className="text-jma3a-sand font-bold">مهمة سرية (Mission Sirriya)</span>
        <span className="text-jma3a-muted">• جولة #{publicData.round || 1}</span>
      </div>

      {/* Secret Mission Card */}
      <div className="w-full mb-6">
        <Card3D
          className="w-72 h-88 mx-auto"
          frontContent={
            <div className="flex flex-col items-center justify-center h-full p-4 text-center">
              <MissionIcon className="w-20 h-20 mb-3" />
              <h3 className="text-lg font-bold text-jma3a-sand mb-1">الملف السري</h3>
              <p className="text-xs text-jma3a-muted">انقر باش تكشف مهمتك الخاصة بوحدك</p>
            </div>
          }
          backContent={
            <div className="flex flex-col items-center justify-center h-full p-5 text-center">
              <span className="text-xs text-rose-400 font-bold uppercase tracking-wider mb-2">مهمة سرية للغاية</span>
              <div className="text-base font-bold text-jma3a-sand leading-relaxed mb-4">
                &quot;{mission?.instruction || "كن في كامل تركيزك..."}&quot;
              </div>

              {mission?.claimed && (
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/40">
                  {mission.confirmed ? "تم التأكيد بنجاح! 🎯" : "تم التصريح بالإنجاز"}
                </span>
              )}
            </div>
          }
        />
      </div>

      {/* Action Buttons for Player */}
      {mission && !mission.claimed && !claimedLocal && (
        <div className="w-full flex gap-3 mb-6">
          {mission.canSwap && (
            <button
              onClick={handleSwap}
              className="flex-1 py-3.5 rounded-2xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand font-bold text-sm border border-jma3a-border flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4 text-jma3a-gold" />
              <span>بدل المهمة (مرة وحدة)</span>
            </button>
          )}

          <button
            onClick={handleClaim}
            className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>نفذت المهمة بنجاح! 🎯</span>
          </button>
        </div>
      )}

      {/* Group Confirmation Dialog */}
      {isClaiming && (
        <div className="w-full p-5 rounded-3xl bg-jma3a-card border border-jma3a-gold/40 mb-6 text-center shadow-2xl animate-fadeIn">
          <span className="text-xs text-jma3a-gold font-bold block mb-1">تصريح إنجاز مهمة</span>
          <h3 className="text-lg font-black text-jma3a-sand mb-2">
            @{claimPlayer?.nickname} كيصرح بأنه كمل مهمتو!
          </h3>

          <div className="p-3 rounded-2xl bg-jma3a-surface/80 border border-jma3a-border mb-4 text-sm text-jma3a-sand font-medium">
            المهمة كانت: &quot;{publicData.revealedMissionInstruction}&quot;
          </div>

          <p className="text-xs text-jma3a-muted mb-4">واش بصح دارها ولا كيزيد فيه؟ صوتو:</p>

          <div className="flex gap-3 mb-3">
            <button
              onClick={() => onAction({ type: "VOTE_CONFIRM", confirm: false })}
              className="flex-1 py-3 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/40 text-rose-300 font-bold text-sm flex items-center justify-center gap-2"
            >
              <ThumbsDown className="w-4 h-4" />
              <span>لا، ما تحسبش (0)</span>
            </button>
            <button
              onClick={() => onAction({ type: "VOTE_CONFIRM", confirm: true })}
              className="flex-1 py-3 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-300 font-bold text-sm flex items-center justify-center gap-2"
            >
              <ThumbsUp className="w-4 h-4" />
              <span>نعم، بصح دارها (+1)</span>
            </button>
          </div>

          {isHost && (
            <button
              onClick={() => onAction({ type: "RESOLVE_CONFIRMATION" })}
              className="w-full py-2.5 rounded-xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand font-bold text-xs border border-jma3a-border"
            >
              تأكيد القرار ومتابعة اللعبة ⏩
            </button>
          )}
        </div>
      )}

      {/* Leaderboard */}
      {publicData.scores && (
        <div className="w-full p-4 rounded-2xl bg-jma3a-card border border-jma3a-border text-right mb-4">
          <span className="text-xs text-jma3a-muted font-bold block mb-2 flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-jma3a-gold" />
            <span>المهمات المنجزة والنقاط:</span>
          </span>
          <div className="space-y-1">
            {Object.entries(publicData.scores).map(([id, score]: [string, any]) => {
              const p = players.find((x) => x.id === id);
              return (
                <div key={id} className="flex justify-between py-1 text-sm border-b border-white/5">
                  <span className="font-semibold text-jma3a-sand">{p?.nickname}</span>
                  <strong className="text-jma3a-gold">{score} نقاط</strong>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* End Round CTA */}
      {isHost && (
        <button
          onClick={() => onAction({ type: "NEXT_ROUND" })}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-bold shadow-lg shadow-jma3a-terracotta/30"
        >
          مهمات جديدة للجولة التالية 🔄
        </button>
      )}
    </div>
  );
}
