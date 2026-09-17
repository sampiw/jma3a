"use client";

import React, { useState, useEffect } from "react";
import { Card3D } from "@/components/Card3D";
import { DibWolfIcon } from "@/components/icons/DibWolfIcon";
import {
  Moon,
  Sun,
  ShieldAlert,
  Sparkles,
  Skull,
  Users,
  CheckCircle,
  Eye,
  Heart,
  Crosshair,
  MessageSquare,
  AlertTriangle,
  Flame,
} from "lucide-react";
import { sound } from "@/lib/sound";
import confetti from "canvas-confetti";

interface DibGameViewProps {
  publicData: any;
  privateData?: any;
  myRole?: string;
  isHost: boolean;
  onAction: (action: any, targetPlayerId?: string) => void;
  players: Array<{ id: string; nickname: string; isAlive?: boolean; avatarSeed?: string }>;
  activePlayerId?: string;
}

export function DibGameView({
  publicData,
  privateData,
  myRole,
  isHost,
  onAction,
  players,
  activePlayerId,
}: DibGameViewProps) {
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const [poisonTarget, setPoisonTarget] = useState<string>("");
  const [showPoisonSelect, setShowPoisonSelect] = useState<boolean>(false);

  const isAlive = privateData?.isAlive !== false;

  const roleTitles: Record<string, string> = {
    villager: "ولد البلاد (قروي) 👨‍🌾",
    wolf: "ذيب 🐺",
    seer: "الشوافة 🔮",
    witch: "السحارة 🧪",
    hunter: "الصياد 🎯",
  };

  const roleDescriptions: Record<string, string> = {
    villager: "ما عندك حتى قوة خارقة، ولكن ذكائك وحوارك بالنهار هما سلاح القرية الوحيد!",
    wolf: "كتفيق بالليل مع عصابة الذيابة وتختارو شكون تاكلو فصمت وبلا ما يعيق بيكم حد!",
    seer: "كتكشفي سر لاعب واحد كل ليلة وكتعرفي واش بريء مسالم ولا ذيب متنكر!",
    witch: "عندك جرعة حياة تعتق ضحية الذيابة، وجرعة سم تقضي على مشتبه فيه!",
    hunter: "إيلا تقتلتي بالليل ولا بالنهار، عندك رصاصة أخيرة كتخرج بها لاعب معاك للقبر!",
  };

  const alivePlayers = players.filter((p) =>
    publicData.alivePlayerIds ? publicData.alivePlayerIds.includes(p.id) : true
  );

  const livingVictim = players.find((p) => p.id === privateData?.victimId);

  // Trigger celebration on game over
  useEffect(() => {
    if (publicData.winner) {
      sound.playSuccess();
      confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
    }
  }, [publicData.winner]);

  const currentPhase = publicData.phase || (publicData.winner ? "GAME_OVER" : "ROLE_REVEAL");

  const dispatch = (action: any) => {
    onAction(action, activePlayerId);
  };

  // 1. Phase: Role Reveal
  if (currentPhase === "ROLE_REVEAL") {
    const roleKey = myRole || "villager";
    return (
      <div className="flex flex-col items-center justify-center max-w-sm mx-auto p-4 text-center animate-fade-in">
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-jma3a-surface text-jma3a-gold border border-jma3a-border mb-4">
          بطاقتك السرية 👀
        </span>

        <Card3D
          className="w-72 h-96 mx-auto mb-6"
          frontContent={
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <div className="w-24 h-24 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-4 shadow-inner">
                <DibWolfIcon className="w-16 h-16 animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-jma3a-sand mb-2">بطاقتك في لعبة الذيب</h3>
              <p className="text-xs text-jma3a-muted">انقر أو مرر الفأرة باش تقلب البطاقة وتشوف شخصيتك</p>
            </div>
          }
          backContent={
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <span className="text-4xl mb-2">
                {roleKey === "wolf"
                  ? "🐺"
                  : roleKey === "seer"
                  ? "🔮"
                  : roleKey === "witch"
                  ? "🧪"
                  : roleKey === "hunter"
                  ? "🎯"
                  : "👨‍🌾"}
              </span>
              <h3 className="text-2xl font-black text-jma3a-gold mb-2">
                {roleTitles[roleKey]}
              </h3>
              <p className="text-xs text-jma3a-sand/90 leading-relaxed mb-3">
                {roleDescriptions[roleKey]}
              </p>
              {roleKey === "wolf" && privateData?.packMembers && (
                <div className="mt-2 w-full p-2.5 rounded-xl bg-black/50 border border-rose-500/40 text-xs text-rose-300">
                  <span className="font-bold block mb-1">عصابة الذيابة 🐺:</span>
                  <div className="flex flex-wrap gap-1 justify-center">
                    {privateData.packMembers.map((id: string) => {
                      const p = players.find((x) => x.id === id);
                      return (
                        <span key={id} className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-600/30">
                          {p?.nickname || id}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          }
        />

        {isHost && (
          <button
            onClick={() => dispatch({ type: "NEXT_PHASE" })}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-bold shadow-lg shadow-jma3a-terracotta/30 hover:brightness-110 active:scale-95 transition-all"
          >
            الكل شاف دوره؟ سد الليل 🌙
          </button>
        )}
      </div>
    );
  }

  // 2. Phase: NIGHT_SEER (Wakes first!)
  if (currentPhase === "NIGHT_SEER") {
    const isSeer = myRole === "seer" && isAlive;

    return (
      <div className="flex flex-col items-center justify-center max-w-md mx-auto p-4 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-indigo-950/60 border border-indigo-500/40 flex items-center justify-center mb-3 shadow-lg shadow-indigo-900/30">
          <Sparkles className="w-8 h-8 text-indigo-400 animate-pulse" />
        </div>

        <h2 className="text-2xl font-black text-jma3a-sand mb-1">
          {publicData.narrationKey || "الشوافة تفيق 🔮"}
        </h2>
        <p className="text-xs text-jma3a-muted mb-4">
          المدينة ناعسة... الشوافة كتسول على حقيقة واحد من الحاضرين
        </p>

        {isSeer ? (
          <div className="w-full p-4 rounded-2xl bg-jma3a-card border border-indigo-500/40 text-right shadow-xl">
            <h3 className="text-sm font-bold text-indigo-300 mb-2 flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-400" />
              <span>عزلي لاعب واحد فقط تكشفي حقيقتو لهاد الليلة:</span>
            </h3>

            {privateData?.seerTarget ? (
              <div className="p-4 rounded-xl bg-indigo-950/80 border border-indigo-400 text-center my-3 animate-fade-in">
                <span className="text-xs text-indigo-300 block mb-1">نتيجة كشفك لليلة:</span>
                <p className="text-lg font-bold text-jma3a-sand">
                  {players.find((p) => p.id === privateData.seerTarget.targetId)?.nickname}
                </p>
                <div className="mt-2 text-xl font-black">
                  {privateData.seerTarget.result === "wolf" ? (
                    <span className="text-rose-400 flex items-center justify-center gap-1">
                      <span>ذيب متنكر! 🐺🚨</span>
                    </span>
                  ) : (
                    <span className="text-emerald-400 flex items-center justify-center gap-1">
                      <span>بريء مسالم 🕊️✨</span>
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 my-3">
                {alivePlayers
                  .filter((p) => p.id !== activePlayerId)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        sound.playCardFlip();
                        dispatch({ type: "SEER_INSPECT", targetPlayerId: p.id });
                      }}
                      className="p-3 rounded-xl bg-jma3a-surface hover:bg-indigo-600/30 border border-jma3a-border hover:border-indigo-400 text-sm font-semibold text-jma3a-sand transition-all active:scale-95"
                    >
                      {p.nickname}
                    </button>
                  ))}
              </div>
            )}

            {privateData?.seerHistory?.length > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-black/40 text-xs border border-white/5">
                <span className="font-bold text-indigo-400 block mb-1.5">سجل الكشوفات السابقة:</span>
                <div className="space-y-1">
                  {privateData.seerHistory.map((h: any, i: number) => {
                    const p = players.find((x) => x.id === h.targetId);
                    return (
                      <div key={i} className="flex justify-between items-center py-0.5 border-b border-white/5">
                        <span>{p?.nickname}</span>
                        <span className={`font-bold ${h.result === "wolf" ? "text-rose-400" : "text-emerald-400"}`}>
                          {h.result === "wolf" ? "ذيب 🐺" : "بريء 🕊️"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full p-6 rounded-2xl bg-jma3a-card/60 border border-jma3a-border text-center">
            <Moon className="w-10 h-10 text-indigo-400/40 mx-auto mb-2" />
            <p className="text-sm text-jma3a-sand/70">الجميع ناعم فالنوم... الشوافة بوحدها لي فايقة.</p>
          </div>
        )}

        {isHost && (
          <button
            onClick={() => dispatch({ type: "NEXT_PHASE" })}
            className="w-full mt-6 py-3.5 rounded-xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand font-bold text-sm border border-jma3a-border active:scale-95 transition-all"
          >
            تنعس الشوافة ويكمل الليل ⏩
          </button>
        )}
      </div>
    );
  }

  // 3. Phase: NIGHT_WOLF (Wakes second!)
  if (currentPhase === "NIGHT_WOLF") {
    const isWolf = myRole === "wolf" && isAlive;

    const wolfSignalsList = [
      { text: "نقتلو هذا 💀", signal: "kill" },
      { text: "شكيت فيه 🧐", signal: "suspect" },
      { text: "مريقل 👍", signal: "agree" },
      { text: "بلاش 🙅‍♂️", signal: "disagree" },
    ];

    return (
      <div className="flex flex-col items-center justify-center max-w-md mx-auto p-4 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-rose-950/60 border border-rose-500/40 flex items-center justify-center mb-3 shadow-lg shadow-rose-900/30">
          <DibWolfIcon className="w-10 h-10 text-rose-500 animate-pulse" />
        </div>

        <h2 className="text-2xl font-black text-jma3a-sand mb-1">
          {publicData.narrationKey || "الذيابة يفيقو 🐺"}
        </h2>
        <p className="text-xs text-jma3a-muted mb-4">
          المدينة ناعسة... الذيابة كيتشاورو فصمت باش يختارو الضحية
        </p>

        {isWolf ? (
          <div className="w-full p-4 rounded-2xl bg-jma3a-card border border-rose-500/40 text-right shadow-xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-rose-400 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                <span>اختارو ضحية الليلة:</span>
              </h3>
              <span className="text-xs px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                أصوات الذيابة: {publicData.livingWolfVotesCount || 0} / {publicData.totalLivingWolves || 1}
              </span>
            </div>

            {/* Victim selection buttons */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {alivePlayers
                .filter((p) => !privateData?.packMembers?.includes(p.id))
                .map((p) => {
                  const isSelected = selectedTarget === p.id || privateData?.currentWolfVotes?.[activePlayerId || ""] === p.id;
                  const votersForThis = Object.entries(privateData?.currentWolfVotes || {})
                    .filter(([, vId]) => vId === p.id)
                    .map(([wId]) => players.find((x) => x.id === wId)?.nickname || "ذيب");

                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedTarget(p.id);
                        sound.playCardFlip();
                        dispatch({ type: "WOLF_VOTE", targetPlayerId: p.id });
                      }}
                      className={`p-3 rounded-xl border text-sm font-semibold transition-all relative ${
                        isSelected
                          ? "bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-900/40"
                          : "bg-jma3a-surface text-jma3a-sand border-jma3a-border hover:border-rose-400"
                      }`}
                    >
                      <div>{p.nickname}</div>
                      {votersForThis.length > 0 && (
                        <div className="text-[10px] text-rose-200 mt-1 flex flex-wrap gap-1 justify-center">
                          {votersForThis.map((name, i) => (
                            <span key={i} className="px-1.5 py-0.2 bg-black/40 rounded">
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>

            {/* Silent Wolf Signals / Chat for pack coordination */}
            <div className="pt-3 border-t border-rose-500/20">
              <span className="text-xs font-bold text-rose-300 block mb-2 flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>إشارات سرية بين الذيابة:</span>
              </span>
              <div className="flex flex-wrap gap-1.5 justify-center mb-3">
                {wolfSignalsList.map((sig) => (
                  <button
                    key={sig.signal}
                    onClick={() => dispatch({ type: "WOLF_SIGNAL", signal: sig.text })}
                    className="px-2.5 py-1 rounded-lg bg-jma3a-surface hover:bg-rose-900/50 border border-rose-500/30 text-xs text-rose-200 active:scale-95 transition-all"
                  >
                    {sig.text}
                  </button>
                ))}
              </div>

              {/* Signals feed */}
              {privateData?.wolfSignals?.length > 0 && (
                <div className="p-2 rounded-xl bg-black/40 text-xs text-right space-y-1 max-h-24 overflow-y-auto">
                  {privateData.wolfSignals.slice(-5).map((s: any, idx: number) => {
                    const wolfName = players.find((x) => x.id === s.wolfId)?.nickname || "ذيب";
                    return (
                      <div key={idx} className="text-rose-200/90 text-[11px]">
                        <span className="font-bold text-rose-400">@{wolfName}:</span> {s.signal}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full p-6 rounded-2xl bg-jma3a-card/60 border border-jma3a-border text-center">
            <Moon className="w-10 h-10 text-rose-400/30 mx-auto mb-2" />
            <p className="text-sm text-jma3a-sand/70">ناعس فالدار... وأصوات الذيابة كتدور فالزقاق 🐾</p>
          </div>
        )}

        {isHost && (
          <button
            onClick={() => dispatch({ type: "NEXT_PHASE" })}
            className="w-full mt-6 py-3.5 rounded-xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand font-bold text-sm border border-jma3a-border active:scale-95 transition-all"
          >
            ينعسو الذيابة وتفيق السحارة ⏩
          </button>
        )}
      </div>
    );
  }

  // 4. Phase: NIGHT_WITCH (Wakes third!)
  if (currentPhase === "NIGHT_WITCH") {
    const isWitch = myRole === "witch" && isAlive;

    return (
      <div className="flex flex-col items-center justify-center max-w-md mx-auto p-4 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center mb-3 shadow-lg shadow-emerald-900/30">
          <Sparkles className="w-8 h-8 text-emerald-400 animate-pulse" />
        </div>

        <h2 className="text-2xl font-black text-jma3a-sand mb-1">
          {publicData.narrationKey || "السحارة تفيق 🧪"}
        </h2>
        <p className="text-xs text-jma3a-muted mb-4">
          المدينة ناعسة... السحارة كتختار تستعمل جرعاتها السحرية
        </p>

        {isWitch ? (
          <div className="w-full p-4 rounded-2xl bg-jma3a-card border border-emerald-500/40 text-right shadow-xl">
            {/* Reveal wolf victim to witch */}
            <div className="p-3 rounded-xl bg-black/40 border border-emerald-500/20 mb-4 text-center">
              <span className="text-xs text-emerald-300 block mb-1">ضحية هجوم الذيابة:</span>
              {livingVictim ? (
                <p className="text-lg font-bold text-rose-400 flex items-center justify-center gap-1.5">
                  <Skull className="w-5 h-5 text-rose-500" />
                  <span>{livingVictim.nickname} معرض للموت!</span>
                </p>
              ) : (
                <p className="text-sm text-jma3a-sand/70">ما كاين حتى ضحية الليلة</p>
              )}
            </div>

            {/* Potion choices */}
            <div className="space-y-2 mb-4">
              {/* Save Potion */}
              {privateData?.canHeal && livingVictim && (
                <button
                  onClick={() => {
                    sound.playCardFlip();
                    dispatch({ type: "WITCH_DECIDE", action: "save" });
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 font-bold text-sm flex items-center justify-between transition-all"
                >
                  <span className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-emerald-400" />
                    <span>جرعة الحياة: عتق {livingVictim.nickname}</span>
                  </span>
                  <span className="text-xs bg-emerald-950 px-2 py-0.5 rounded border border-emerald-700">
                    صالحة مرة واحدة
                  </span>
                </button>
              )}

              {/* Poison Potion */}
              {privateData?.canPoison && (
                <div>
                  <button
                    onClick={() => setShowPoisonSelect(!showPoisonSelect)}
                    className="w-full py-3 px-4 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/50 text-purple-300 font-bold text-sm flex items-center justify-between transition-all"
                  >
                    <span className="flex items-center gap-2">
                      <Skull className="w-4 h-4 text-purple-400" />
                      <span>جرعة السم: سمم لاعب</span>
                    </span>
                    <span className="text-xs bg-purple-950 px-2 py-0.5 rounded border border-purple-700">
                      صالحة مرة واحدة
                    </span>
                  </button>

                  {showPoisonSelect && (
                    <div className="grid grid-cols-2 gap-2 mt-2 p-2 rounded-xl bg-black/40">
                      {alivePlayers
                        .filter((p) => p.id !== activePlayerId && p.id !== livingVictim?.id)
                        .map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setPoisonTarget(p.id);
                              sound.playCardFlip();
                              dispatch({
                                type: "WITCH_DECIDE",
                                action: "poison",
                                targetPlayerId: p.id,
                              });
                              setShowPoisonSelect(false);
                            }}
                            className={`p-2 rounded-lg text-xs font-semibold border ${
                              poisonTarget === p.id
                                ? "bg-purple-700 text-white border-purple-400"
                                : "bg-jma3a-surface text-purple-200 border-purple-500/30 hover:border-purple-400"
                            }`}
                          >
                            {p.nickname}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Skip / Do Nothing */}
              <button
                onClick={() => dispatch({ type: "WITCH_DECIDE", action: "skip" })}
                className="w-full py-2.5 px-4 rounded-xl bg-jma3a-surface hover:bg-jma3a-border border border-jma3a-border text-xs text-jma3a-muted font-bold text-center transition-all"
              >
                ما نستعمل حتى جرعة / ساليت القرارات
              </button>
            </div>

            {privateData?.witchActionDone && (
              <div className="text-center text-xs text-emerald-400 font-bold flex items-center justify-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>تم تسجيل قرارات السحارة بنجاح!</span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full p-6 rounded-2xl bg-jma3a-card/60 border border-jma3a-border text-center">
            <Moon className="w-10 h-10 text-emerald-400/30 mx-auto mb-2" />
            <p className="text-sm text-jma3a-sand/70">السحارة كتوجد طقوسها فهدوء تام 🕯️</p>
          </div>
        )}

        {isHost && (
          <button
            onClick={() => dispatch({ type: "NEXT_PHASE" })}
            className="w-full mt-6 py-3.5 rounded-xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand font-bold text-sm border border-jma3a-border active:scale-95 transition-all"
          >
            تنعس السحارة ويطلع الصباح ☀️
          </button>
        )}
      </div>
    );
  }

  // 5. Phase: DAY_ANNOUNCEMENT (Dramatic morning reveal!)
  if (currentPhase === "DAY_ANNOUNCEMENT") {
    const summary = publicData.nightSummary;
    const hasDeaths = summary?.deaths && summary.deaths.length > 0;
    const savedPlayer = players.find((p) => p.id === summary?.savedPlayerId);

    return (
      <div className="flex flex-col items-center justify-center max-w-md mx-auto p-4 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-3 shadow-lg shadow-amber-900/20">
          <Sun className="w-9 h-9 text-amber-400 animate-spin-slow" />
        </div>

        <h2 className="text-3xl font-black text-jma3a-sand mb-1">الصباح طلع على الحومة! ☀️</h2>
        <p className="text-xs text-jma3a-muted mb-5">القرية فاقت تشوف آش وقع البارح بالليل</p>

        {/* Dramatic Announcement Card */}
        <div className="w-full p-6 rounded-3xl bg-gradient-to-b from-jma3a-card to-jma3a-surface border border-jma3a-border shadow-2xl mb-6">
          {hasDeaths ? (
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mx-auto">
                <Skull className="w-6 h-6 text-rose-500" />
              </div>
              <h3 className="text-xl font-bold text-rose-400">فاجعة صدمات القرية!</h3>
              <div className="space-y-2">
                {summary.deaths.map((d: any, idx: number) => {
                  const victim = players.find((p) => p.id === d.playerId);
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-rose-950/60 border border-rose-600/40 text-sm font-bold text-white flex items-center justify-between"
                    >
                      <span className="text-rose-200">@{victim?.nickname}</span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-rose-900 text-rose-100">
                        {d.reason === "wolf" ? "قتلوه الذيابة 🐺" : "تسمم بجرعة 🧪"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto">
                <Heart className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-emerald-400">ليلة هادئة وبلا ضحايا! ✨</h3>
              {savedPlayer && (
                <p className="text-xs text-emerald-200 bg-emerald-950/60 p-2.5 rounded-xl border border-emerald-600/30">
                  كان هجوم ولكن تدخل سحري عتق <strong>@{savedPlayer.nickname}</strong> من الموت! 🛡️
                </p>
              )}
            </div>
          )}
        </div>

        {isHost && (
          <button
            onClick={() => dispatch({ type: "NEXT_PHASE" })}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-black text-base shadow-xl shadow-jma3a-terracotta/30 hover:brightness-110 active:scale-95 transition-all"
          >
            بدا النقاش فالحومة 🗣️
          </button>
        )}
      </div>
    );
  }

  // 6. Phase: HUNTER_REVENGE (Hunter shoots last bullet!)
  if (currentPhase === "HUNTER_REVENGE") {
    const isHunterShooter = activePlayerId === publicData.hunterShooterId;
    const shooter = players.find((p) => p.id === publicData.hunterShooterId);

    return (
      <div className="flex flex-col items-center justify-center max-w-md mx-auto p-4 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-orange-950/60 border border-orange-500/40 flex items-center justify-center mb-3 shadow-lg shadow-orange-900/30">
          <Crosshair className="w-9 h-9 text-orange-400 animate-pulse" />
        </div>

        <h2 className="text-2xl font-black text-jma3a-sand mb-1">الصياد عندو رصاصة أخيرة! 🎯</h2>
        <p className="text-xs text-orange-300 mb-4">
          @{shooter?.nickname} مات ولكن كيوجه فرديو قبل ما يودع!
        </p>

        {isHunterShooter ? (
          <div className="w-full p-4 rounded-2xl bg-jma3a-card border border-orange-500/40 text-right shadow-xl">
            <span className="text-sm font-bold text-orange-300 block mb-2">
              اختار شكون باغي تضرب برصاصتك الأخيرة:
            </span>
            <div className="grid grid-cols-2 gap-2 my-2">
              {alivePlayers
                .filter((p) => p.id !== activePlayerId)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      sound.playCardFlip();
                      dispatch({ type: "HUNTER_SHOOT", targetPlayerId: p.id });
                    }}
                    className="p-3 rounded-xl bg-orange-900/30 hover:bg-orange-600/40 border border-orange-500/40 text-sm font-bold text-white transition-all active:scale-95"
                  >
                    🎯 {p.nickname}
                  </button>
                ))}
            </div>
          </div>
        ) : (
          <div className="w-full p-6 rounded-2xl bg-jma3a-card/60 border border-jma3a-border text-center">
            <p className="text-sm text-jma3a-sand/80">الكل حابس النفس... الصياد كيعزل شكون يدي معاه للقبر!</p>
          </div>
        )}

        {isHost && (
          <button
            onClick={() => dispatch({ type: "NEXT_PHASE" })}
            className="w-full mt-6 py-3.5 rounded-xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand font-bold text-sm border border-jma3a-border active:scale-95 transition-all"
          >
            حسم النتائج والمتابعة ⏩
          </button>
        )}
      </div>
    );
  }

  // 7. Phase: DISCUSSION / DAY_VOTE
  const isVoting = currentPhase === "DAY_VOTE";

  return (
    <div className="flex flex-col items-center max-w-md mx-auto p-4 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-jma3a-surface border border-jma3a-border flex items-center justify-center mb-3">
        <Sun className="w-8 h-8 text-jma3a-gold animate-spin-slow" />
      </div>

      <h2 className="text-2xl font-black text-jma3a-sand mb-1">
        {isVoting ? "وقت التصويت والمحاكمة! 🗳️" : "النقاش فالحومة 🗣️"}
      </h2>
      <p className="text-xs text-jma3a-muted mb-4">
        {isVoting
          ? "كل واحد يصوت على المشتبه فيه لي باغي ينفيه من القرية!"
          : "ناقشو الشكوك بيناتكم وتوصلو للحقيقة قبل ما يبدا التصويت!"}
      </p>

      {/* Victims list if any */}
      {publicData.recentDeaths?.length > 0 && (
        <div className="w-full p-3 rounded-2xl bg-rose-950/40 border border-rose-600/30 mb-4 text-center">
          <span className="text-xs text-rose-300 font-semibold block mb-1">الضحايا:</span>
          <div className="flex flex-wrap gap-2 justify-center">
            {publicData.recentDeaths.map((id: string) => {
              const victim = players.find((p) => p.id === id);
              return (
                <span key={id} className="px-2.5 py-0.5 rounded-full bg-rose-900/60 text-white text-xs font-bold">
                  {victim?.nickname}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Voting Ballot */}
      {isVoting && isAlive && (
        <div className="w-full p-4 rounded-2xl bg-jma3a-card border border-jma3a-border mb-4 text-right shadow-lg">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-jma3a-sand flex items-center gap-1.5">
              <Users className="w-4 h-4 text-jma3a-gold" />
              <span>صوت على شكون كتشك فيه:</span>
            </h3>
            <span className="text-xs text-jma3a-muted">
              {publicData.votesSubmittedCount || 0} / {alivePlayers.length} صوّتو
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {alivePlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedTarget(p.id);
                  sound.playCardFlip();
                  dispatch({ type: "DAY_VOTE", targetPlayerId: p.id });
                }}
                className={`p-3 rounded-xl border text-sm font-semibold transition-all ${
                  selectedTarget === p.id || privateData?.myVote === p.id
                    ? "bg-jma3a-gold text-jma3a-dark border-jma3a-gold font-bold shadow-md shadow-jma3a-gold/30"
                    : "bg-jma3a-surface text-jma3a-sand border-jma3a-border hover:border-jma3a-gold"
                }`}
              >
                {p.nickname}
              </button>
            ))}
          </div>

          {privateData?.myVote && (
            <div className="mt-3 text-xs text-emerald-400 flex items-center gap-1 justify-center">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>تم تسجيل صوتك بنجاح!</span>
            </div>
          )}
        </div>
      )}

      {/* Game Over Screen */}
      {publicData.winner && (
        <div className="w-full p-6 rounded-3xl bg-gradient-to-b from-jma3a-surface to-jma3a-card border border-jma3a-gold/40 text-center my-4 shadow-2xl animate-fade-in">
          <h3 className="text-3xl font-black text-jma3a-gold mb-2">
            {publicData.winner === "village" ? "انتصار أهل القرية! 🎉" : "انتصار الذيابة! 🐺"}
          </h3>
          <p className="text-sm text-jma3a-sand/90 mb-4">
            {publicData.winner === "village"
              ? "القرية تغلبت على المكر وقضات على جميع الذيابة!"
              : "الذيابة قضاوا على القرية وسيطرو على الحومة!"}
          </p>

          {privateData?.allRoles && (
            <div className="p-3 rounded-2xl bg-black/40 text-xs text-right mb-4 border border-white/5">
              <span className="font-bold text-jma3a-gold block mb-2">كشف أدوار الجميع:</span>
              <div className="space-y-1.5">
                {Object.entries(privateData.allRoles).map(([id, role]: [string, any]) => {
                  const p = players.find((x) => x.id === id);
                  return (
                    <div key={id} className="flex justify-between items-center py-1 border-b border-white/5">
                      <span className="font-semibold text-jma3a-sand">{p?.nickname}</span>
                      <strong className="text-jma3a-gold">{roleTitles[role] || role}</strong>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Host Controls */}
      {isHost && !publicData.winner && (
        <button
          onClick={() => dispatch({ type: "NEXT_PHASE" })}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-black shadow-lg shadow-jma3a-terracotta/30 hover:brightness-110 active:scale-95 transition-all"
        >
          {currentPhase === "DISCUSSION"
            ? "بدا التصويت دابا 🗳️"
            : currentPhase === "DAY_VOTE"
            ? "فرز الأصوات وحسم الإعدام ⚖️"
            : "الانتقال للمرحلة الموالية ⏩"}
        </button>
      )}
    </div>
  );
}
