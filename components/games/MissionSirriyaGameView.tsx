"use client";

import React, { useState, useEffect } from "react";
import { MissionIcon } from "@/components/icons/MissionIcon";
import { sound } from "@/lib/sound";
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  RotateCcw,
  Sparkles,
  Trophy,
  Target,
  Coins,
  Send,
  X,
} from "lucide-react";
import confetti from "canvas-confetti";

interface MissionSirriyaGameViewProps {
  publicData: any;
  privateData?: any;
  mySecret?: string;
  isHost: boolean;
  onAction: (action: any, targetPlayerId?: string) => void;
  players: Array<{ id: string; nickname: string }>;
  activePlayerId?: string;
}

export function MissionSirriyaGameView({
  publicData,
  privateData,
  isHost,
  onAction,
  players,
  activePlayerId,
}: MissionSirriyaGameViewProps) {
  const [revealedAssignmentId, setRevealedAssignmentId] = useState<string | null>(null);
  const [challengeModalOpen, setChallengeModalOpen] = useState(false);
  const [claimTargetModalOpen, setClaimTargetModalOpen] = useState(false);
  const [selectedClaimAsgId, setSelectedClaimAsgId] = useState<string | null>(null);

  const assignments = privateData?.assignments || [];
  const successes = privateData?.successes || 0;
  const targetToWin = publicData.targetToWin || 3;
  const tokens = privateData?.challengeTokensRemaining ?? 2;
  const incomingChallenges = privateData?.myIncomingChallenges || [];
  const incomingClaims = privateData?.myIncomingClaims || [];

  const isGameOver = publicData.phase === "GAME_OVER";
  const winnerPlayer = players.find((p) => publicData.winnerPlayerIds?.includes(p.id));

  // Trigger celebration on game over
  useEffect(() => {
    if (isGameOver) {
      sound.playSuccess();
      confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
    }
  }, [isGameOver]);

  const dispatch = (action: any) => {
    onAction(action, activePlayerId);
  };

  return (
    <div className="flex flex-col items-center max-w-lg mx-auto p-3 text-right animate-fade-in w-full">
      {/* Ambient Header Bar */}
      <div className="w-full p-4 rounded-3xl bg-gradient-to-r from-jma3a-surface to-jma3a-card border border-jma3a-border mb-4 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-jma3a-gold" />
          </div>
          <div>
            <span className="text-[10px] text-jma3a-muted block">هدفك للفوز:</span>
            <span className="text-sm font-black text-jma3a-gold">
              {successes} / {targetToWin} مهمات ناجحة
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-jma3a-dark border border-jma3a-border">
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-jma3a-sand">
              {tokens} {tokens === 1 ? "محاولة" : "محاولات"}
            </span>
          </div>
        </div>
      </div>

      {/* Branded "CHDDITEK! — شدّيتك! 👀" Button */}
      {publicData.phase === "ACTIVE" && !isGameOver && (
        <button
          onClick={() => {
            sound.playCardFlip();
            setChallengeModalOpen(true);
          }}
          disabled={tokens <= 0}
          className={`w-full mb-5 py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-xl transition-all ${
            tokens > 0
              ? "bg-gradient-to-r from-rose-600 via-red-500 to-rose-700 text-white hover:brightness-110 active:scale-95 shadow-rose-900/40"
              : "bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed"
          }`}
        >
          <ShieldAlert className="w-5 h-5 animate-pulse" />
          <span>شدّيتك! 👀 (Chdditek!)</span>
        </button>
      )}

      {/* Incoming Challenge Alert Dialog (You are accused!) */}
      {incomingChallenges.length > 0 && (
        <div className="w-full mb-5 p-5 rounded-3xl bg-rose-950/90 border-2 border-rose-500 shadow-2xl text-center animate-bounce-subtle">
          <div className="w-12 h-12 rounded-full bg-rose-500/30 border border-rose-400 flex items-center justify-center mx-auto mb-2">
            <ShieldAlert className="w-6 h-6 text-rose-400 animate-pulse" />
          </div>
          <h3 className="text-lg font-black text-white mb-1">
            واحد من صحابك قال ليك: &quot;شدّيتك!&quot; 👀
          </h3>
          <p className="text-xs text-rose-200 mb-4 leading-relaxed">
            جاوب بصدق: واش الحركة ولا الهضرة لي درتي دابا جزء من شي مهمة عندك؟
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => {
                sound.playCardFlip();
                dispatch({
                  type: "RESPOND_CHALLENGE",
                  challengeId: incomingChallenges[0].id,
                  wasCaught: true,
                });
              }}
              className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md"
            >
              نعم — حصلتيني! 🎯
            </button>
            <button
              onClick={() => {
                sound.playCardFlip();
                dispatch({
                  type: "RESPOND_CHALLENGE",
                  challengeId: incomingChallenges[0].id,
                  wasCaught: false,
                });
              }}
              className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold text-xs border border-gray-600"
            >
              لا — ما كايناش مهمة! 😏
            </button>
          </div>
        </div>
      )}

      {/* Incoming Target Confirmation Alert (Someone claims they tricked you!) */}
      {incomingClaims.length > 0 && (
        <div className="w-full mb-5 p-5 rounded-3xl bg-indigo-950/90 border-2 border-indigo-500 shadow-2xl text-center animate-fade-in">
          <div className="w-12 h-12 rounded-full bg-indigo-500/30 border border-indigo-400 flex items-center justify-center mx-auto mb-2">
            <Target className="w-6 h-6 text-indigo-400 animate-pulse" />
          </div>
          <h3 className="text-lg font-black text-white mb-1">تأكيد إنجاز مهمة 🎯</h3>
          <p className="text-xs text-indigo-200 mb-4 leading-relaxed">
            صاحبك صرح بأنه طبق عليك مهمة سرية بنجاح. واش داكشي وقع بصح قبل ما تشك فيه؟
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => {
                sound.playSuccess();
                dispatch({
                  type: "RESPOND_CLAIM",
                  claimId: incomingClaims[0].id,
                  confirmed: true,
                });
              }}
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md"
            >
              نعم، دارها بصح ✅
            </button>
            <button
              onClick={() => {
                sound.playCardFlip();
                dispatch({
                  type: "RESPOND_CLAIM",
                  claimId: incomingClaims[0].id,
                  confirmed: false,
                });
              }}
              className="flex-1 py-3 rounded-xl bg-rose-900 hover:bg-rose-800 text-white font-bold text-xs border border-rose-600"
            >
              لا، ما دارهاش / فقت بيه ❌
            </button>
          </div>
        </div>
      )}

      {/* Private Mission Cards Deck */}
      <div className="w-full mb-6">
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-bold text-jma3a-sand flex items-center gap-1.5">
            <MissionIcon className="w-4 h-4" />
            <span>ملفاتك السرية ({assignments.length}):</span>
          </span>
          <span className="text-[11px] text-jma3a-muted">مخبيين باش ما يشوفهم حد</span>
        </div>

        <div className="space-y-3">
          {assignments.map((asg: any) => {
            const isRevealed = revealedAssignmentId === asg.assignmentId;
            const isDone = asg.status === "SUCCEEDED";
            const isCaught = asg.status === "CAUGHT";
            const isFailed = asg.status === "FAILED";
            const isPending = asg.status === "CLAIM_PENDING";

            return (
              <div
                key={asg.assignmentId}
                className={`p-4 rounded-2xl border transition-all ${
                  isDone
                    ? "bg-emerald-950/40 border-emerald-500/50"
                    : isCaught
                    ? "bg-rose-950/30 border-rose-600/30 opacity-60"
                    : isFailed
                    ? "bg-gray-900/60 border-gray-800 opacity-60"
                    : isPending
                    ? "bg-amber-950/40 border-amber-500/50 animate-pulse"
                    : "bg-jma3a-card border-jma3a-border hover:border-jma3a-gold/40 shadow-md"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isDone ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/40 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>منجزة بنجاح (+1)</span>
                      </span>
                    ) : isCaught ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold border border-rose-500/40 flex items-center gap-1">
                        <XCircle className="w-3 h-3" />
                        <span>تم صيدها</span>
                      </span>
                    ) : isFailed ? (
                      <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 text-[10px] font-bold border border-gray-700">
                        مرفوضة
                      </span>
                    ) : isPending ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/40">
                        في انتظار التأكيد...
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-jma3a-surface text-jma3a-gold text-[10px] font-bold border border-jma3a-border">
                        نشطة
                      </span>
                    )}
                  </div>

                  {!isDone && !isCaught && !isFailed && (
                    <button
                      onClick={() =>
                        setRevealedAssignmentId(isRevealed ? null : asg.assignmentId)
                      }
                      className="p-1.5 rounded-xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand border border-jma3a-border text-xs flex items-center gap-1"
                    >
                      {isRevealed ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-jma3a-muted" />
                          <span className="text-[10px]">كاشي</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 text-jma3a-gold" />
                          <span className="text-[10px]">كشف</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Instruction text */}
                <div className="my-2">
                  {isRevealed || isDone || isCaught ? (
                    <p className="text-sm font-bold text-jma3a-sand leading-relaxed">
                      &quot;{asg.instruction}&quot;
                    </p>
                  ) : (
                    <div className="py-3 text-center text-xs text-jma3a-muted bg-black/30 rounded-xl border border-white/5 flex items-center justify-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-jma3a-gold/60" />
                      <span>انقر على &quot;كشف&quot; باش تقرا المهمة فسرية</span>
                    </div>
                  )}
                </div>

                {/* Action buttons for active assignment */}
                {asg.status === "ACTIVE" && isRevealed && (
                  <div className="flex gap-2 mt-3 pt-2 border-t border-white/5">
                    {privateData?.freeSwapAvailable && (
                      <button
                        onClick={() => {
                          sound.playCardFlip();
                          dispatch({ type: "SWAP_MISSION", assignmentId: asg.assignmentId });
                        }}
                        className="py-2 px-3 rounded-xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand text-xs font-semibold border border-jma3a-border flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-jma3a-gold" />
                        <span>تبديل مجاني</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        sound.playCardFlip();
                        if (asg.adjudication === "SELF_HONOR") {
                          dispatch({ type: "CLAIM_MISSION", assignmentId: asg.assignmentId });
                        } else {
                          setSelectedClaimAsgId(asg.assignmentId);
                          setClaimTargetModalOpen(true);
                        }
                      }}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>صافي، درتها بنجاح! 🎯</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Activity Ticker */}
      {publicData.recentActivity?.length > 0 && (
        <div className="w-full p-3 rounded-2xl bg-jma3a-card/60 border border-jma3a-border mb-4 text-xs">
          <span className="font-bold text-jma3a-muted block mb-1">آخر الأخبار فالحومة:</span>
          <div className="space-y-1">
            {publicData.recentActivity.slice(0, 3).map((act: any, i: number) => (
              <div key={i} className="text-jma3a-sand/90 text-[11px] flex items-center gap-1.5">
                <span>{act.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {isGameOver && (
        <div className="w-full p-6 rounded-3xl bg-gradient-to-b from-jma3a-surface to-jma3a-card border border-jma3a-gold/40 text-center my-4 shadow-2xl animate-fade-in">
          <Trophy className="w-12 h-12 text-jma3a-gold mx-auto mb-2 animate-bounce" />
          <h3 className="text-2xl font-black text-jma3a-gold mb-1">
            الفائز: @{winnerPlayer?.nickname}! 🏆
          </h3>
          <p className="text-xs text-jma3a-sand/90 mb-4">
            أول لاعب كمل {targetToWin} مهمات سرية بلا ما يعيقو بيه الحضور!
          </p>
        </div>
      )}

      {/* Challenge Target Modal ("شدّيتك!") */}
      {challengeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm rounded-3xl border border-rose-500/40 bg-jma3a-card p-6 shadow-2xl text-right">
            <button
              onClick={() => setChallengeModalOpen(false)}
              className="absolute top-4 left-4 p-2 rounded-full text-jma3a-muted hover:text-white bg-jma3a-surface"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mb-3">
              <ShieldAlert className="w-6 h-6 text-rose-500" />
            </div>

            <h3 className="text-lg font-black text-white mb-1">شكون باغي تشكك فيه؟ 👀</h3>
            <p className="text-xs text-jma3a-muted mb-4">
              إيلا كان بصح كيدير مهمة، غادي تصيدها وتبقى عندك المحاولة. إيلا كان بريء، غادي تضيع ليك محاولة!
            </p>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {players
                .filter((p) => p.id !== activePlayerId)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      sound.playCardFlip();
                      dispatch({ type: "CHALLENGE_PLAYER", targetPlayerId: p.id });
                      setChallengeModalOpen(false);
                    }}
                    className="p-3 rounded-xl bg-jma3a-surface hover:bg-rose-950/60 border border-jma3a-border hover:border-rose-500 text-sm font-bold text-jma3a-sand transition-all active:scale-95"
                  >
                    @{p.nickname}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Target Selector Modal for Claims */}
      {claimTargetModalOpen && selectedClaimAsgId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm rounded-3xl border border-jma3a-border bg-jma3a-card p-6 shadow-2xl text-right">
            <button
              onClick={() => setClaimTargetModalOpen(false)}
              className="absolute top-4 left-4 p-2 rounded-full text-jma3a-muted hover:text-white bg-jma3a-surface"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-jma3a-sand mb-1">شكون الشخص لي طبقتي عليه؟</h3>
            <p className="text-xs text-jma3a-muted mb-4">
              غادي يوصلو ميساج سري باش يأكد واش درتيها قبل ما يشك فيك:
            </p>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {players
                .filter((p) => p.id !== activePlayerId)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      sound.playSuccess();
                      dispatch({
                        type: "CLAIM_MISSION",
                        assignmentId: selectedClaimAsgId,
                        targetPlayerId: p.id,
                      });
                      setClaimTargetModalOpen(false);
                      setSelectedClaimAsgId(null);
                    }}
                    className="p-3 rounded-xl bg-jma3a-surface hover:bg-jma3a-border border border-jma3a-border hover:border-jma3a-gold text-sm font-bold text-jma3a-sand transition-all active:scale-95"
                  >
                    @{p.nickname}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
