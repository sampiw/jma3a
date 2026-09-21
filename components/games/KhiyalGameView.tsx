"use client";

import React, { useState, useEffect } from "react";
import { KhiyalCardDisplay } from "./KhiyalCardDisplay";
import { getCardById } from "@/games/khiyal/cards";
import { sound } from "@/lib/sound";
import confetti from "canvas-confetti";
import {
  Sparkles,
  Send,
  Trophy,
  Users,
  CheckCircle2,
  Clock,
  Crown,
  HelpCircle,
  X,
  Eye,
  Flame,
  ArrowRight,
} from "lucide-react";

interface KhiyalGameViewProps {
  publicData: any;
  privateData?: any;
  isHost: boolean;
  onAction: (action: any, targetPlayerId?: string) => void;
  players: Array<{ id: string; nickname: string; isAlive?: boolean; avatarSeed?: string }>;
  activePlayerId?: string;
  devicePlayers?: any[];
  onSelectPlayer?: (playerId: string) => void;
  isPassThePhoneActive?: boolean;
}

const INSPIRATION_CHIPS = [
  "حلم غريب 🌙",
  "مثل شعبي مغربي 📜",
  "أغنية قديمة 🎶",
  "ذكرى طفولة 🧒",
  "إحساس عميق 💫",
  "حاجة ندمت عليها 🫣",
  "حرية مطلقة 🕊️",
  "سر مدفون 🤫",
];

export function KhiyalGameView({
  publicData,
  privateData,
  isHost,
  onAction,
  players,
  activePlayerId,
  devicePlayers,
}: KhiyalGameViewProps) {
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [clueInput, setClueInput] = useState<string>("");
  const [inspectingCardId, setInspectingCardId] = useState<string | null>(null);

  const currentPhase = publicData.phase || "STORYTELLER_CLUE";
  const isStoryteller = Boolean(privateData?.isStoryteller);
  const myHand: string[] = privateData?.myHand || [];
  const mySubmittedCardIds: string[] = privateData?.mySubmittedCardIds || [];
  const myVote: string | undefined = privateData?.myVote;
  const is3Players = players.length === 3;
  const requiredCards = is3Players ? 2 : 1;

  // Trigger sound / confetti on game over
  useEffect(() => {
    if (publicData.winner) {
      sound.playSuccess();
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    }
  }, [publicData.winner]);

  const dispatch = (action: any) => {
    onAction(action, activePlayerId);
  };

  const storytellerPlayer = players.find((p) => p.id === publicData.storytellerId);
  const inspectingCard = inspectingCardId ? getCardById(inspectingCardId) : null;

  // -----------------------------------------------------------------
  // 1. GAME OVER VIEW
  // -----------------------------------------------------------------
  if (currentPhase === "GAME_OVER") {
    const winnerPlayer = players.find((p) => p.id === publicData.winner);
    const sortedScores = Object.entries(publicData.scores || {}).sort(
      (a: any, b: any) => b[1] - a[1]
    );

    return (
      <div className="flex flex-col items-center max-w-lg mx-auto p-4 text-center animate-fade-in">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-500 to-yellow-600 border border-yellow-300 flex items-center justify-center mb-4 shadow-2xl shadow-yellow-500/30">
          <Trophy className="w-10 h-10 text-jma3a-dark animate-bounce" />
        </div>

        <span className="text-xs font-bold px-3.5 py-1 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 mb-2">
          نهاية رحلة الخيال! 🎨✨
        </span>

        <h2 className="text-3xl font-black text-jma3a-gold mb-2">
          فاز {winnerPlayer?.nickname || "البطل"} باللعبة!
        </h2>
        <p className="text-xs text-jma3a-muted mb-6">
          وصل للهدف وحقق أعلى درجات الخيال والتلميح الفني!
        </p>

        {/* Scoreboard Podium */}
        <div className="w-full p-5 rounded-3xl bg-jma3a-card border border-jma3a-border shadow-2xl mb-6 text-right">
          <h3 className="text-sm font-bold text-jma3a-sand mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-jma3a-gold" />
            <span>الترتيب النهائي:</span>
          </h3>
          <div className="space-y-2">
            {sortedScores.map(([pId, score]: any, rank: number) => {
              const p = players.find((x) => x.id === pId);
              return (
                <div
                  key={pId}
                  className={`p-3 rounded-xl flex items-center justify-between border ${
                    rank === 0
                      ? "bg-gradient-to-r from-amber-500/20 to-yellow-500/10 border-jma3a-gold text-jma3a-gold font-black"
                      : "bg-jma3a-surface border-white/5 text-jma3a-sand font-bold text-sm"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-black/40 flex items-center justify-center text-xs">
                      {rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : rank + 1}
                    </span>
                    <span>{p?.nickname || pId}</span>
                  </div>
                  <span className="font-mono text-base font-black">{score} نقطة</span>
                </div>
              );
            })}
          </div>
        </div>

        {isHost && (
          <button
            onClick={() => dispatch({ type: "NEXT_ROUND" })}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-black text-base shadow-xl active:scale-95 transition-all"
          >
            لعب جولة أخرى 🔄
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center max-w-2xl mx-auto p-3 text-center animate-fade-in relative pb-10">
      {/* Top Game Bar */}
      <div className="w-full flex items-center justify-between mb-4 p-2.5 rounded-2xl bg-jma3a-surface/70 border border-jma3a-border">
        <div className="flex items-center gap-2 text-xs font-bold text-jma3a-sand">
          <span className="px-2.5 py-1 rounded-xl bg-jma3a-dark border border-white/10 text-jma3a-gold">
            الجولة {publicData.round || 1}
          </span>
          <span className="hidden sm:inline text-jma3a-muted">الهدف: 30 نقطة</span>
        </div>

        {/* Storyteller Tag */}
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 px-3 py-1 rounded-xl bg-amber-950/60 border border-amber-500/30">
          <Crown className="w-3.5 h-3.5 text-jma3a-gold" />
          <span>مول الحجاية: {storytellerPlayer?.nickname}</span>
        </div>

        {/* Quick Scores preview */}
        <div className="text-xs font-bold text-jma3a-muted flex items-center gap-1">
          <Trophy className="w-3.5 h-3.5 text-jma3a-gold" />
          <span className="font-mono text-jma3a-sand font-black">
            {publicData.scores?.[activePlayerId || ""] || 0} pts
          </span>
        </div>
      </div>

      {/* Clue Banner (Shown during Submissions, Voting, and Resolution) */}
      {publicData.currentClue && (
        <div className="w-full mb-6 p-4 rounded-3xl bg-gradient-to-r from-indigo-950/80 via-purple-900/60 to-indigo-950/80 border border-purple-500/40 text-center shadow-xl animate-fade-in">
          <span className="text-[11px] uppercase tracking-wider text-purple-300 font-bold block mb-1">
            حجاية مول النوبة لهاد الجولة:
          </span>
          <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-jma3a-gold via-yellow-200 to-amber-300 tracking-wide">
            &ldquo;{publicData.currentClue}&rdquo;
          </h2>
        </div>
      )}

      {/* --------------------------------------------------------------- */}
      {/* PHASE 1: STORYTELLER_CLUE */}
      {/* --------------------------------------------------------------- */}
      {currentPhase === "STORYTELLER_CLUE" && (
        <div className="w-full space-y-4 animate-fade-in">
          {isStoryteller ? (
            <div className="w-full p-4 sm:p-6 rounded-3xl bg-jma3a-card border border-jma3a-gold/40 shadow-2xl text-right">
              <div className="text-center mb-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center mx-auto mb-2 shadow-lg">
                  <Crown className="w-7 h-7 text-jma3a-gold animate-bounce" />
                </div>
                <h3 className="text-xl font-black text-jma3a-sand mb-1">
                  نوبتك دابا! أنت هو مول الحجاية 📜🎨
                </h3>
                <p className="text-xs text-jma3a-muted max-w-sm mx-auto leading-relaxed">
                  عزل بطاقة واحدة من يدك وحجي عليها بحجاية ذكية (مثل، أغنية، فكرة، أو إحساس).
                </p>
              </div>

              {/* Clue Input */}
              <div className="mb-4">
                <label className="text-xs font-bold text-jma3a-sand block mb-2">
                  اكتب الحجاية ديالك هنا:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={clueInput}
                    onChange={(e) => setClueInput(e.target.value)}
                    placeholder="مثلاً: حلمة معطلة فمحطة القامرة..."
                    className="w-full px-4 py-3.5 rounded-2xl bg-jma3a-surface border border-jma3a-border text-jma3a-sand text-sm font-bold focus:outline-none focus:border-jma3a-gold text-right pr-4 pl-12"
                  />
                  <Sparkles className="w-5 h-5 text-jma3a-gold absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                </div>
              </div>

              {/* Inspiration Chips */}
              <div className="mb-5">
                <span className="text-[11px] text-jma3a-muted block mb-1.5">
                  أفكار للإلهام (انقر باش تستلهم):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {INSPIRATION_CHIPS.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setClueInput(chip.replace(/[^\u0600-\u06FF\s]/g, "").trim())}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-jma3a-surface hover:bg-jma3a-border border border-white/10 text-jma3a-sand transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Select Card From Hand */}
              <div className="mb-5">
                <span className="text-xs font-bold text-jma3a-sand block mb-2">
                  عزل البطاقة لي كتمثل هاد الحجاية (انقر على البطاقة):
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3.5 justify-items-center">
                  {myHand.map((cardId) => {
                    const c = getCardById(cardId);
                    if (!c) return null;
                    return (
                      <KhiyalCardDisplay
                        key={cardId}
                        card={c}
                        isSelected={selectedCardId === cardId}
                        onClick={() => {
                          sound.playCardFlip();
                          setSelectedCardId(cardId);
                        }}
                        onInspect={() => setInspectingCardId(cardId)}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Golden Rule Tip */}
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200/90 leading-relaxed mb-5">
                <span className="font-bold block mb-0.5">⚠️ تذكير بالقانون الذهبي:</span>
                إيلا كلشي عاق ببطاقتك (ساهلة بزاف) أو حتى حد ما عاق (صعيبة بزاف) كتاخد 0 نقط! خاصك حجاية متوازنة وفنانة.
              </div>

              {/* Submit CTA */}
              <button
                onClick={() => {
                  if (!selectedCardId || !clueInput.trim()) return;
                  sound.playCardFlip();
                  dispatch({
                    type: "SUBMIT_CLUE",
                    cardId: selectedCardId,
                    clue: clueInput.trim(),
                  });
                }}
                disabled={!selectedCardId || !clueInput.trim()}
                className={`w-full py-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-2 shadow-xl ${
                  !selectedCardId || !clueInput.trim()
                    ? "bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed"
                    : "bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white hover:brightness-110 active:scale-95 shadow-jma3a-terracotta/40"
                }`}
              >
                <Send className="w-5 h-5" />
                <span>تأكيد البطاقة والحجاية 🚀</span>
              </button>
            </div>
          ) : (
            <div className="w-full p-6 rounded-3xl bg-jma3a-card border border-jma3a-border text-center shadow-xl">
              <div className="w-14 h-14 rounded-2xl bg-indigo-950/60 border border-indigo-500/40 flex items-center justify-center mx-auto mb-3 shadow-lg">
                <Clock className="w-7 h-7 text-indigo-400 animate-spin-slow" />
              </div>
              <h3 className="text-xl font-bold text-jma3a-sand mb-2">
                كنتسناو مول الحجاية: @{storytellerPlayer?.nickname}
              </h3>
              <p className="text-xs text-jma3a-muted mb-6 leading-relaxed max-w-sm mx-auto">
                مول الحجاية كيتأمل فبطاقاته وكيوجد ليكم حجاية سريالية واعرة... ركز فبطاقات يدك لتحت!
              </p>

              {/* Hand preview while waiting */}
              <div className="border-t border-white/10 pt-4 text-right">
                <span className="text-xs font-bold text-jma3a-sand block mb-3">
                  بطاقات يدك (Hand):
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3.5 justify-items-center">
                  {myHand.map((cardId) => {
                    const c = getCardById(cardId);
                    if (!c) return null;
                    return (
                      <KhiyalCardDisplay
                        key={cardId}
                        card={c}
                        onInspect={() => setInspectingCardId(cardId)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------- */}
      {/* PHASE 2: PLAYER_SUBMISSIONS */}
      {/* --------------------------------------------------------------- */}
      {currentPhase === "PLAYER_SUBMISSIONS" && (
        <div className="w-full space-y-4 animate-fade-in">
          {isStoryteller ? (
            <div className="w-full p-6 rounded-3xl bg-jma3a-card border border-jma3a-border text-center shadow-xl">
              <div className="w-14 h-14 rounded-2xl bg-purple-950/60 border border-purple-500/40 flex items-center justify-center mx-auto mb-3">
                <Users className="w-7 h-7 text-purple-400 animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-jma3a-sand mb-1">
                اللاعبون كيعزلو بطاقاتهم التضليلية 🃏
              </h3>
              <p className="text-xs text-jma3a-muted mb-4">
                كل واحد كيقلب فبطاقاتو على أقرب كارتة للحجاية ديالك باش يدوخ الجماعة!
              </p>

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-jma3a-surface border border-white/10 text-sm font-bold text-jma3a-gold">
                <span>تم اختيار: {publicData.submittedCount || 0}</span>
                <span>/</span>
                <span>{publicData.totalRequiredSubmissions || 1} لاعبين</span>
              </div>
            </div>
          ) : mySubmittedCardIds.length > 0 ? (
            <div className="w-full p-6 rounded-3xl bg-emerald-950/40 border border-emerald-500/40 text-center shadow-xl">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3 animate-bounce" />
              <h3 className="text-xl font-bold text-emerald-300 mb-1">
                تم تسجيل بطاقتك بنجاح! ✅
              </h3>
              <p className="text-xs text-emerald-200/80 mb-4">
                كنتسناو باقي اللاعبين يساليوا الاختيار ديالهم باش تبدا جولة التصويت.
              </p>
              <div className="text-xs text-jma3a-muted">
                تم اختيار {publicData.submittedCount || 0} من أصل {publicData.totalRequiredSubmissions || 1}
              </div>
            </div>
          ) : (
            <div className="w-full p-4 sm:p-6 rounded-3xl bg-jma3a-card border border-jma3a-border text-right shadow-xl">
              <h3 className="text-lg font-black text-jma3a-sand mb-1">
                عزل {requiredCards} {requiredCards === 2 ? "بطاقتين" : "بطاقة واحدة"} من يدك:
              </h3>
              <p className="text-xs text-jma3a-muted mb-4 leading-relaxed">
                اختار البطاقة لي كتحس أنها كتشبه لحجاية مول النوبة (&ldquo;{publicData.currentClue}&rdquo;) باش الناس يغلطو ويصوتو عليها وتربح نقاط إضافية!
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3.5 justify-items-center mb-5">
                {myHand.map((cardId) => {
                  const c = getCardById(cardId);
                  if (!c) return null;
                  const isSelected = is3Players
                    ? selectedCardIds.includes(cardId)
                    : selectedCardId === cardId;

                  return (
                    <KhiyalCardDisplay
                      key={cardId}
                      card={c}
                      isSelected={isSelected}
                      onClick={() => {
                        sound.playCardFlip();
                        if (is3Players) {
                          if (selectedCardIds.includes(cardId)) {
                            setSelectedCardIds(selectedCardIds.filter((x) => x !== cardId));
                          } else if (selectedCardIds.length < 2) {
                            setSelectedCardIds([...selectedCardIds, cardId]);
                          }
                        } else {
                          setSelectedCardId(cardId);
                        }
                      }}
                      onInspect={() => setInspectingCardId(cardId)}
                    />
                  );
                })}
              </div>

              {/* Submit CTA */}
              <button
                onClick={() => {
                  const cardsToSend = is3Players ? selectedCardIds : [selectedCardId];
                  if (cardsToSend.length !== requiredCards) return;
                  sound.playCardFlip();
                  dispatch({ type: "SUBMIT_CARDS", cardIds: cardsToSend });
                }}
                disabled={is3Players ? selectedCardIds.length !== 2 : !selectedCardId}
                className={`w-full py-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-2 shadow-xl ${
                  (is3Players ? selectedCardIds.length !== 2 : !selectedCardId)
                    ? "bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed"
                    : "bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white hover:brightness-110 active:scale-95 shadow-jma3a-terracotta/40"
                }`}
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>تأكيد الاختيار 🃏</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------- */}
      {/* PHASE 3: VOTING */}
      {/* --------------------------------------------------------------- */}
      {currentPhase === "VOTING" && (
        <div className="w-full space-y-4 animate-fade-in">
          {isStoryteller ? (
            <div className="w-full p-6 rounded-3xl bg-jma3a-card border border-jma3a-border text-center shadow-xl">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center mx-auto mb-3">
                <Crown className="w-7 h-7 text-jma3a-gold animate-bounce" />
              </div>
              <h3 className="text-xl font-bold text-jma3a-sand mb-1">
                البطاقات معروضة والناس كيصوتو دابا! 👀
              </h3>
              <p className="text-xs text-jma3a-muted mb-4">
                واش حجايتك كانت ذكية بما يكفي؟ كنتسناو نتائج التصويت...
              </p>

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-jma3a-surface border border-white/10 text-sm font-bold text-jma3a-gold">
                <span>صوّتو: {publicData.votesCount || 0}</span>
                <span>/</span>
                <span>{publicData.totalRequiredVotes || 1}</span>
              </div>
            </div>
          ) : myVote ? (
            <div className="w-full p-6 rounded-3xl bg-emerald-950/40 border border-emerald-500/40 text-center shadow-xl">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
              <h3 className="text-lg font-bold text-emerald-300 mb-1">
                تم تسجيل صوتك السري بنجاح! 🔒
              </h3>
              <p className="text-xs text-emerald-200/80 mb-3">
                كنتسناو باقي اللاعبين يصوتو باش يتكشف المستور ونحسبو النقط!
              </p>
              <div className="text-xs text-jma3a-muted">
                صوّتو {publicData.votesCount || 0} من أصل {publicData.totalRequiredVotes || 1}
              </div>
            </div>
          ) : (
            <div className="w-full p-4 sm:p-6 rounded-3xl bg-jma3a-card border border-jma3a-border text-right shadow-xl">
              <h3 className="text-lg font-black text-jma3a-sand mb-1">
                شكون هي بطاقة مول الحجاية؟ 🗳️
              </h3>
              <p className="text-xs text-jma3a-muted mb-4">
                تأمل فالبطاقات وصوت على البطاقة الأصلية ديال مول الحجاية &ldquo;{publicData.currentClue}&rdquo;! (ممنوع تصوت على كارتتك).
              </p>

              {/* Table Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3.5 justify-items-center mb-5">
                {(publicData.tableCards || []).map((tc: any) => {
                  const c = getCardById(tc.cardId);
                  if (!c) return null;
                  const isMySubmitted = mySubmittedCardIds.includes(tc.cardId);

                  return (
                    <KhiyalCardDisplay
                      key={tc.cardId}
                      card={c}
                      indexLabel={tc.anonymousIndex}
                      isSelected={selectedCardId === tc.cardId}
                      disabled={isMySubmitted}
                      disabledReason={isMySubmitted ? "بطاقتك الخاصة" : undefined}
                      onClick={() => {
                        if (isMySubmitted) return;
                        sound.playCardFlip();
                        setSelectedCardId(tc.cardId);
                      }}
                      onInspect={() => setInspectingCardId(tc.cardId)}
                    />
                  );
                })}
              </div>

              {/* Submit Vote CTA */}
              <button
                onClick={() => {
                  if (!selectedCardId) return;
                  sound.playCardFlip();
                  dispatch({ type: "CAST_VOTE", cardId: selectedCardId });
                }}
                disabled={!selectedCardId}
                className={`w-full py-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-2 shadow-xl ${
                  !selectedCardId
                    ? "bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed"
                    : "bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white hover:brightness-110 active:scale-95 shadow-jma3a-terracotta/40"
                }`}
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>تأكيد التصويت 🗳️</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------- */}
      {/* PHASE 4: ROUND_RESOLUTION */}
      {/* --------------------------------------------------------------- */}
      {currentPhase === "ROUND_RESOLUTION" && publicData.lastRoundResult && (
        <div className="w-full space-y-5 animate-fade-in text-right">
          {/* Verdict Banner */}
          <div
            className={`p-5 rounded-3xl border text-center shadow-2xl ${
              publicData.lastRoundResult.caseType === "BALANCED"
                ? "bg-gradient-to-br from-emerald-950/80 to-teal-950/80 border-emerald-500/50 text-emerald-200"
                : "bg-gradient-to-br from-rose-950/80 to-orange-950/80 border-rose-500/50 text-rose-200"
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-black/40 flex items-center justify-center mx-auto mb-2">
              {publicData.lastRoundResult.caseType === "BALANCED" ? (
                <Sparkles className="w-6 h-6 text-emerald-400" />
              ) : (
                <HelpCircle className="w-6 h-6 text-rose-400" />
              )}
            </div>
            <h3 className="text-xl font-black mb-1">
              {publicData.lastRoundResult.caseType === "BALANCED"
                ? "ضربة معلم لمول الحجاية! 🎯"
                : publicData.lastRoundResult.caseType === "ALL_CORRECT"
                ? "الحجاية كانت مفضوحة وساهلة بزاف! 🙈"
                : "الحجاية كانت غامضة ومستحيلة! 🌫️"}
            </h3>
            <p className="text-xs leading-relaxed max-w-md mx-auto">
              {publicData.lastRoundResult.explanation}
            </p>
          </div>

          {/* Cards Reveal Gallery */}
          <div className="p-4 sm:p-5 rounded-3xl bg-jma3a-card border border-jma3a-border shadow-xl">
            <h4 className="text-xs font-bold text-jma3a-sand mb-3">
              كشف أصحاب البطاقات والأصوات:
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3.5 justify-items-center">
              {(publicData.lastRoundResult.cardsOnTable || []).map((cardInfo: any, idx: number) => {
                const c = getCardById(cardInfo.cardId);
                if (!c) return null;
                const owner = players.find((p) => p.id === cardInfo.ownerId);
                const voters = (cardInfo.voterIds || []).map(
                  (vId: string) => players.find((p) => p.id === vId)?.nickname || vId
                );

                return (
                  <div key={idx} className="flex flex-col items-center">
                    <KhiyalCardDisplay
                      card={c}
                      isStorytellerCard={cardInfo.isStoryteller}
                      ownerNickname={owner?.nickname}
                      votesCount={cardInfo.voterIds?.length || 0}
                      voterNicknames={voters}
                      onInspect={() => setInspectingCardId(cardInfo.cardId)}
                    />
                    {/* Points badge earned by this card */}
                    <div className="mt-1">
                      {cardInfo.isStoryteller ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-jma3a-gold/20 text-jma3a-gold font-bold border border-jma3a-gold/30">
                          +{cardInfo.pointsEarned} نقط لمول الحجاية
                        </span>
                      ) : cardInfo.decoyBonus > 0 ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 font-bold border border-indigo-500/30">
                          +{cardInfo.decoyBonus} نقطة تضليل 🎭
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Points Delta Table */}
          <div className="p-4 rounded-2xl bg-jma3a-surface border border-white/10">
            <h4 className="text-xs font-bold text-jma3a-sand mb-2.5">
              مجموع النقاط المحصلة فهاد الجولة:
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {players.map((p) => {
                const delta = publicData.lastRoundResult.pointsDelta?.[p.id] || 0;
                const total = publicData.scores?.[p.id] || 0;
                return (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-xs"
                  >
                    <span className="font-bold text-jma3a-sand truncate">{p.nickname}</span>
                    <div className="flex items-center gap-1.5 font-mono">
                      {delta > 0 && (
                        <span className="text-emerald-400 font-black">+{delta}</span>
                      )}
                      <span className="text-jma3a-muted">({total} pts)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Next Round CTA */}
          {isHost && (
            <button
              onClick={() => {
                sound.playCardFlip();
                dispatch({ type: "NEXT_ROUND" });
              }}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-black text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span>دوز للجولة الموالية ⏩</span>
            </button>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------- */}
      {/* Full-Screen Card Inspection Modal */}
      {/* --------------------------------------------------------------- */}
      {inspectingCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn"
          onClick={() => setInspectingCardId(null)}
        >
          <div
            className="relative max-w-sm w-full flex flex-col items-center max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex justify-end mb-2">
              <button
                onClick={() => setInspectingCardId(null)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <KhiyalCardDisplay card={inspectingCard} size="lg" />

            {/* Poetic Darija artistic story & theme */}
            <div className="w-full mt-3 p-3.5 rounded-2xl bg-black/75 border border-white/15 backdrop-blur-md text-right shadow-2xl">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-black text-amber-300">
                  {inspectingCard.title}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/75 font-mono">
                  #{inspectingCard.visualTheme}
                </span>
              </div>
              <p className="text-xs text-jma3a-sand/90 leading-relaxed font-medium">
                {inspectingCard.description}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
