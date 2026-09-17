"use client";

import React, { useState } from "react";
import { Card3D } from "@/components/Card3D";
import { DibWolfIcon } from "@/components/icons/DibWolfIcon";
import { Moon, Sun, ShieldAlert, Sparkles, Skull, Users, CheckCircle } from "lucide-react";
import { sound } from "@/lib/sound";
import confetti from "canvas-confetti";

interface DibGameViewProps {
  publicData: any;
  privateData?: any;
  myRole?: string;
  isHost: boolean;
  onAction: (action: any) => void;
  players: Array<{ id: string; nickname: string; isAlive?: boolean }>;
}

export function DibGameView({
  publicData,
  privateData,
  myRole,
  isHost,
  onAction,
  players,
}: DibGameViewProps) {
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const isAlive = privateData?.isAlive !== false;

  const roleTitles: Record<string, string> = {
    villager: "ولد البلاد (قروي)",
    wolf: "ذيب 🐺",
    seer: "الشوافة 🔮",
    witch: "السحارة 🧪",
  };

  const roleDescriptions: Record<string, string> = {
    villager: "ما عندك حتى قوة سحرية، ولكن ذكائك وتركيزك بالنهار هما سلاح القرية الوحيد!",
    wolf: "كتفيق بالليل مع الذيابة وتختارو شكون تاكلو بلا ما يعيق بيكم حتى حد!",
    seer: "كتكشفي سر لاعب واحد كل ليلة وكتعرفي واش بريء ولا ذيب!",
    witch: "عندك دواء ينقذ الضحية، وسم يقضي على لاعب. استعمليهم بحكمة!",
  };

  const alivePlayers = players.filter((p) =>
    publicData.alivePlayerIds ? publicData.alivePlayerIds.includes(p.id) : true
  );

  // Trigger celebration on game over
  React.useEffect(() => {
    if (publicData.winner) {
      sound.playSuccess();
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    }
  }, [publicData.winner]);

  // Phase: Role Reveal
  if (!publicData.wolvesDone && publicData.livingPlayersCount && !publicData.recentDeaths?.length && !publicData.lastEliminatedPlayerId && !publicData.votesSubmittedCount && !publicData.winner) {
    return (
      <div className="flex flex-col items-center justify-center max-w-sm mx-auto p-4 text-center">
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-jma3a-surface text-jma3a-gold border border-jma3a-border mb-4">
          اكشف بطاقتك السرية 👀
        </span>

        <Card3D
          className="w-72 h-96 mx-auto mb-6"
          frontContent={
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <DibWolfIcon className="w-20 h-20 mb-4 animate-pulse" />
              <h3 className="text-xl font-bold text-jma3a-sand mb-2">بطاقتك في لعبة الذيب</h3>
              <p className="text-xs text-jma3a-muted">انقر باش تقلب البطاقة وتشوف سرك بوحدك</p>
            </div>
          }
          backContent={
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <span className="text-3xl mb-2">
                {myRole === "wolf" ? "🐺" : myRole === "seer" ? "🔮" : myRole === "witch" ? "🧪" : "👨‍🌾"}
              </span>
              <h3 className="text-2xl font-black text-jma3a-gold mb-2">
                {roleTitles[myRole || "villager"]}
              </h3>
              <p className="text-xs text-jma3a-sand/80 leading-relaxed">
                {roleDescriptions[myRole || "villager"]}
              </p>
              {myRole === "wolf" && privateData?.packMembers && (
                <div className="mt-4 p-2 rounded-xl bg-black/40 border border-red-500/30 text-xs text-rose-300">
                  <span className="font-bold block mb-1">صحابك الذيابة:</span>
                  {privateData.packMembers.map((id: string) => {
                    const p = players.find((x) => x.id === id);
                    return <span key={id} className="inline-block mx-1">@{p?.nickname}</span>;
                  })}
                </div>
              )}
            </div>
          }
        />

        {isHost && (
          <button
            onClick={() => onAction({ type: "NEXT_PHASE" })}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-bold shadow-lg shadow-jma3a-terracotta/30"
          >
            الكل شاف دوره؟ بدا الليل 🌙
          </button>
        )}
      </div>
    );
  }

  // Phase: Night
  const isNight = publicData.narrationKey?.includes("الليل") || publicData.narrationKey?.includes("الذيابة") || publicData.narrationKey?.includes("تنعس") || publicData.narrationKey?.includes("الشوافة");

  if (isNight) {
    return (
      <div className="flex flex-col items-center justify-center max-w-md mx-auto p-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-jma3a-surface border border-jma3a-border flex items-center justify-center mb-3">
          <Moon className="w-8 h-8 text-indigo-400 animate-pulse" />
        </div>

        <h2 className="text-2xl font-black text-jma3a-sand mb-2">{publicData.narrationKey || "المدينة ناعسة 🌙"}</h2>

        {/* Wolf turn screen */}
        {myRole === "wolf" && isAlive && (
          <div className="w-full mt-4 p-4 rounded-2xl bg-jma3a-card border border-rose-500/30 text-right">
            <h3 className="text-base font-bold text-rose-400 mb-2 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-500" />
              <span>اختارو الضحية ديالكم لهاد الليلة:</span>
            </h3>

            <div className="grid grid-cols-2 gap-2 my-3">
              {alivePlayers
                .filter((p) => !privateData?.packMembers?.includes(p.id))
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedTarget(p.id);
                      sound.playCardFlip();
                      onAction({ type: "WOLF_VOTE", targetPlayerId: p.id });
                    }}
                    className={`p-3 rounded-xl border text-sm font-semibold transition-all ${
                      selectedTarget === p.id
                        ? "bg-rose-600 text-white border-rose-400"
                        : "bg-jma3a-surface text-jma3a-sand border-jma3a-border hover:border-rose-400"
                    }`}
                  >
                    {p.nickname}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Seer turn screen */}
        {myRole === "seer" && isAlive && (
          <div className="w-full mt-4 p-4 rounded-2xl bg-jma3a-card border border-indigo-500/30 text-right">
            <h3 className="text-base font-bold text-indigo-300 mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <span>عزلي شكون بغيتي تكشفي حقيقتو:</span>
            </h3>
            <div className="grid grid-cols-2 gap-2 my-3">
              {alivePlayers
                .filter((p) => p.id !== privateData?.playerId)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      sound.playCardFlip();
                      onAction({ type: "SEER_INSPECT", targetPlayerId: p.id });
                    }}
                    className="p-3 rounded-xl bg-jma3a-surface hover:bg-indigo-600/30 border border-jma3a-border text-sm font-semibold text-jma3a-sand"
                  >
                    {p.nickname}
                  </button>
                ))}
            </div>
            {privateData?.seerHistory?.length > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-black/40 text-xs">
                <span className="font-bold text-indigo-400 block mb-1">سجل الكشوفات:</span>
                {privateData.seerHistory.map((h: any, i: number) => {
                  const p = players.find((x) => x.id === h.targetId);
                  return (
                    <div key={i} className="flex justify-between py-0.5">
                      <span>{p?.nickname}</span>
                      <strong className={h.result === "wolf" ? "text-rose-400" : "text-emerald-400"}>
                        {h.result === "wolf" ? "ذيب 🐺" : "بريء 🕊️"}
                      </strong>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Host Phase Advancement */}
        {isHost && (
          <button
            onClick={() => onAction({ type: "NEXT_PHASE" })}
            className="w-full mt-6 py-3 rounded-xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand font-bold text-sm border border-jma3a-border"
          >
            دوز للمرحلة الموالية ⏩
          </button>
        )}
      </div>
    );
  }

  // Phase: Day / Discussion / Voting
  return (
    <div className="flex flex-col items-center max-w-md mx-auto p-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-jma3a-surface border border-jma3a-border flex items-center justify-center mb-3">
        <Sun className="w-8 h-8 text-jma3a-gold animate-spin-slow" />
      </div>

      <h2 className="text-2xl font-black text-jma3a-sand mb-1">{publicData.narrationKey || "المدينة فاقت ☀️"}</h2>
      <p className="text-xs text-jma3a-muted mb-4">ناقشو الشكوك بيناتكم وتوصلو للحقيقة قبل فوات الأوان!</p>

      {/* Victims list if any */}
      {publicData.recentDeaths?.length > 0 && (
        <div className="w-full p-4 rounded-2xl bg-rose-950/40 border border-rose-600/40 mb-4 text-center">
          <Skull className="w-6 h-6 text-rose-500 mx-auto mb-1" />
          <span className="text-xs text-rose-300 font-semibold block">ضحايا الليلة الماضية:</span>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {publicData.recentDeaths.map((id: string) => {
              const victim = players.find((p) => p.id === id);
              return (
                <span key={id} className="px-3 py-1 rounded-full bg-rose-900/60 text-white text-xs font-bold">
                  {victim?.nickname}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Voting Ballot */}
      {isAlive && (
        <div className="w-full p-4 rounded-2xl bg-jma3a-card border border-jma3a-border mb-4 text-right">
          <h3 className="text-sm font-bold text-jma3a-sand mb-2 flex items-center gap-2">
            <Users className="w-4 h-4 text-jma3a-gold" />
            <span>صوت على شكون كتشك فيه:</span>
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {alivePlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedTarget(p.id);
                  sound.playCardFlip();
                  onAction({ type: "DAY_VOTE", targetPlayerId: p.id });
                }}
                className={`p-3 rounded-xl border text-sm font-semibold transition-all ${
                  selectedTarget === p.id
                    ? "bg-jma3a-gold text-jma3a-dark border-jma3a-gold font-bold"
                    : "bg-jma3a-surface text-jma3a-sand border-jma3a-border hover:border-jma3a-gold"
                }`}
              >
                {p.nickname}
              </button>
            ))}
          </div>
          {privateData?.myVote && (
            <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>تم تسجيل صوتك السري بنجاح</span>
            </div>
          )}
        </div>
      )}

      {/* Game Over Screen */}
      {publicData.winner && (
        <div className="w-full p-6 rounded-3xl bg-gradient-to-b from-jma3a-surface to-jma3a-card border border-jma3a-gold/40 text-center my-4 shadow-2xl">
          <h3 className="text-3xl font-black text-jma3a-gold mb-2">
            {publicData.winner === "village" ? "انتصار القرية! 🎉" : "انتصار الذيابة! 🐺"}
          </h3>
          <p className="text-sm text-jma3a-sand/90 mb-4">
            {publicData.winner === "village"
              ? "تم القضاء على جميع الذيابة بنجاح ونجت القرية!"
              : "الذيابة سيطرو على القرية وقضاو على الأغلبية!"}
          </p>

          {privateData?.allRoles && (
            <div className="p-3 rounded-xl bg-black/40 text-xs text-right mb-4">
              <span className="font-bold text-jma3a-muted block mb-2">كشف أدوار الجميع:</span>
              {Object.entries(privateData.allRoles).map(([id, role]: [string, any]) => {
                const p = players.find((x) => x.id === id);
                return (
                  <div key={id} className="flex justify-between py-1 border-b border-white/5">
                    <span>{p?.nickname}</span>
                    <strong className="text-jma3a-gold">{roleTitles[role] || role}</strong>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Host Controls */}
      {isHost && !publicData.winner && (
        <button
          onClick={() => onAction({ type: "NEXT_PHASE" })}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-bold shadow-lg shadow-jma3a-terracotta/30"
        >
          حسم النتائج / الانتقال للمرحلة الموالية ⏩
        </button>
      )}
    </div>
  );
}
