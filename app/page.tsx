"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { sound } from "@/lib/sound";
import { DibWolfIcon } from "@/components/icons/DibWolfIcon";
import { IntrusEyeIcon } from "@/components/icons/IntrusEyeIcon";
import { ChkonFinaIcon } from "@/components/icons/ChkonFinaIcon";
import { MettelhaIcon } from "@/components/icons/MettelhaIcon";
import { Mamnou3Icon } from "@/components/icons/Mamnou3Icon";
import { MissionIcon } from "@/components/icons/MissionIcon";
import {
  Volume2,
  VolumeX,
  Sparkles,
  Users,
  Clock,
  ChevronLeft,
  Smartphone,
  HelpCircle,
  X,
  Play,
} from "lucide-react";
import { GameId, InteractionMode } from "@/lib/types";

interface GameInfo {
  id: GameId;
  title: string;
  tagline: string;
  description: string;
  players: string;
  duration: string;
  modes: string[];
  icon: React.ReactNode;
  badgeColor: string;
}

const GAMES: GameInfo[] = [
  {
    id: "dib",
    title: "الذيب (DIB)",
    tagline: "لعبة الذئب البشري والمكر",
    description: "الذيابة كياكلو بالليل، والقرية خاصها تكتاشفهم بالنهار قبل ما يقضيو على كولشي!",
    players: "4-18 لاعب",
    duration: "15-30 دقيقة",
    modes: ["كل واحد بتليفونو", "تليفون واحد"],
    icon: <DibWolfIcon className="w-14 h-14" />,
    badgeColor: "from-rose-600/30 to-rose-950/40 border-rose-500/40 text-rose-300",
  },
  {
    id: "intrus",
    title: "الدخيل (L'Intrus)",
    tagline: "كلمة سرية ودخيل كيتصنت",
    description: "الكل عندو نفس الكلمة من غير واحد 'دخيل'. قولو تلميحات ذكية باش تفرشوه بلا ما تعطيوه الكلمة!",
    players: "3-16 لاعب",
    duration: "10-20 دقيقة",
    modes: ["كل واحد بتليفونو", "تليفون واحد"],
    icon: <IntrusEyeIcon className="w-14 h-14" />,
    badgeColor: "from-emerald-600/30 to-emerald-950/40 border-emerald-500/40 text-emerald-300",
  },
  {
    id: "chkon-fina",
    title: "شكون فينا؟",
    tagline: "أكثر واحد قادر يديرها",
    description: "سؤال كيبين شكون فالمجموعة عندو هاد الصفة. صوتو فسرية وشوفو النتائج الصادمة!",
    players: "3-20 لاعب",
    duration: "10-15 دقيقة",
    modes: ["كل واحد بتليفونو", "تليفون واحد"],
    icon: <ChkonFinaIcon className="w-14 h-14" />,
    badgeColor: "from-amber-600/30 to-amber-950/40 border-amber-500/40 text-amber-300",
  },
  {
    id: "mettelha",
    title: "مثلها (Mettelha)",
    tagline: "شخصيات ومواقف بالحركات فقط",
    description: "مثل الكلمة ولا الموقف لفرقتك بلا ما تنطق بحتى حرف. السرعة والنقاط كيحسمو!",
    players: "2-20 لاعب",
    duration: "15-25 دقيقة",
    modes: ["تليفون واحد", "فرق"],
    icon: <MettelhaIcon className="w-14 h-14" />,
    badgeColor: "from-orange-600/30 to-orange-950/40 border-orange-500/40 text-orange-300",
  },
  {
    id: "mamnou3",
    title: "ممنوع (Mamnou3)",
    tagline: "شرح الكلمة بلا ما تنطق بالممنوعات",
    description: "خلي فرقتك تعيق بالكلمة الرئيسية، ولكن حذاري من الكلمات الممنوعة فالكارتة!",
    players: "2-20 لاعب",
    duration: "15-25 دقيقة",
    modes: ["تليفون واحد", "فرق"],
    icon: <Mamnou3Icon className="w-14 h-14" />,
    badgeColor: "from-red-600/30 to-red-950/40 border-red-500/40 text-red-300",
  },
  {
    id: "mission-sirriya",
    title: "مهمة سرية",
    tagline: "تحديات خفية وسط الجماعة",
    description: "كل لاعب كياخد مهمة اجتماعية سرية خاصة ينفذها فالجلسة بلا ما يعيق بيه حد!",
    players: "3-20 لاعب",
    duration: "15-30 دقيقة",
    modes: ["كل واحد بتليفونو", "تليفون واحد"],
    icon: <MissionIcon className="w-14 h-14" />,
    badgeColor: "from-indigo-600/30 to-indigo-950/40 border-indigo-500/40 text-indigo-300",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [isMuted, setIsMuted] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  // Create room modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameId>("dib");
  const [hostNickname, setHostNickname] = useState("");
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("MULTI_PHONE");
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const toggleSound = () => {
    sound.isMuted = !isMuted;
    setIsMuted(!isMuted);
    if (isMuted) sound.playCardFlip();
  };

  const handleJoinDirect = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = joinCodeInput.trim().toUpperCase();
    if (!clean) return;
    sound.playCardFlip();
    router.push(`/join/${clean}`);
  };

  const openCreateForGame = (gameId: GameId) => {
    sound.playCardFlip();
    setSelectedGame(gameId);
    setCreateModalOpen(true);
  };

  const handleCreateRoom = async () => {
    if (!hostNickname.trim()) {
      setErrorMsg("عفاك دخل سميتك باش يعرفوك صحابك");
      return;
    }

    setIsCreating(true);
    setErrorMsg("");
    sound.playCardFlip();

    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostNickname: hostNickname.trim(),
          gameId: selectedGame,
          mode: interactionMode,
          locale: "darija",
          avatarSeed: "avatar_" + Math.floor(Math.random() * 8 + 1),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "تعذر إنشاء الغرفة. عاود حاول.");
        setIsCreating(false);
        return;
      }

      router.push(`/room/${data.roomCode}`);
    } catch {
      setErrorMsg("حدث خطأ فالشبكة. عاود حاول عفاك.");
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top Navigation */}
      <header className="w-full border-b border-jma3a-border/40 bg-jma3a-dark/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-jma3a-terracotta to-jma3a-gold p-0.5 shadow-lg shadow-jma3a-terracotta/20">
              <div className="w-full h-full bg-jma3a-dark rounded-[14px] flex items-center justify-center font-black text-jma3a-gold text-lg tracking-wider">
                JM
              </div>
            </div>
            <div>
              <span className="text-xl font-black tracking-wider text-jma3a-sand block">JMA3A</span>
              <span className="text-[10px] font-bold text-jma3a-gold tracking-widest uppercase block -mt-1">
                جماعة
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHowItWorks(true)}
              className="p-2 rounded-xl text-jma3a-muted hover:text-jma3a-sand hover:bg-jma3a-surface transition-all flex items-center gap-1.5 text-xs font-semibold"
            >
              <HelpCircle className="w-4 h-4 text-jma3a-gold" />
              <span className="hidden sm:inline">كيفاش كنلعبو؟</span>
            </button>

            <button
              onClick={toggleSound}
              className="p-2 rounded-xl text-jma3a-muted hover:text-jma3a-sand hover:bg-jma3a-surface transition-all"
              title={isMuted ? "شغل الصوت" : "كتم الصوت"}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-jma3a-gold" />}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-4 pt-10 pb-8 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-jma3a-surface border border-jma3a-gold/30 text-jma3a-gold text-xs font-bold mb-4 shadow-sm">
          <Sparkles className="w-3.5 h-3.5" />
          <span>ألعاب مغربية للأصدقاء والعائلة</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-jma3a-sand tracking-tight leading-tight mb-4">
          جمع الجماعة. اختار اللعبة. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-jma3a-gold via-amber-400 to-jma3a-terracotta">
            وبداو فالحين!
          </span>
        </h1>

        <p className="text-sm sm:text-base text-jma3a-muted max-w-xl mx-auto mb-8 leading-relaxed">
          ألعاب سهرات وتجمعات بدون تطبيق للتحميل وبدون تسجيل. الكل كيدخل فثواني بالكود أو QR سواء عندكم تليفوناتكم أو
          بتليفون واحد كيدوز بيناتكم!
        </p>

        {/* Quick Join Code Form */}
        <form
          onSubmit={handleJoinDirect}
          className="flex items-center max-w-md mx-auto p-1.5 rounded-2xl bg-jma3a-card border border-jma3a-border focus-within:border-jma3a-gold shadow-2xl mb-4 transition-all"
        >
          <input
            type="text"
            value={joinCodeInput}
            onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
            placeholder="عندك كود؟ كتبو هنا (مثال: JM-8821)"
            className="flex-1 px-4 py-3 bg-transparent text-jma3a-sand text-sm font-semibold placeholder:text-jma3a-muted/60 focus:outline-none tracking-wider text-right"
            maxLength={10}
          />
          <button
            type="submit"
            className="px-6 py-3 rounded-xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand font-bold text-sm border border-jma3a-border transition-all active:scale-95"
          >
            دخول
          </button>
        </form>
      </section>

      {/* Game Catalog Section */}
      <section className="px-4 py-8 max-w-5xl mx-auto w-full flex-1">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-jma3a-sand">شنو غادي نلعبو اليوم؟</h2>
            <p className="text-xs text-jma3a-muted">6 ألعاب جماعية أصلية واجدة للعب مباشرة</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {GAMES.map((game) => (
            <div
              key={game.id}
              className="group relative rounded-3xl bg-jma3a-card/90 border border-jma3a-border/80 hover:border-jma3a-gold/60 p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-jma3a-gold/10 overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-2xl pointer-events-none group-hover:scale-150 transition-transform" />

              <div>
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2 rounded-2xl bg-jma3a-surface border border-jma3a-border group-hover:border-jma3a-gold/40 transition-colors">
                    {game.icon}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border bg-gradient-to-r ${game.badgeColor}`}>
                    {game.tagline}
                  </span>
                </div>

                <h3 className="text-xl font-black text-jma3a-sand mb-2 group-hover:text-jma3a-gold transition-colors">
                  {game.title}
                </h3>

                <p className="text-xs text-jma3a-muted/90 leading-relaxed mb-5">
                  {game.description}
                </p>
              </div>

              <div>
                {/* Meta details */}
                <div className="flex items-center gap-4 py-3 border-t border-b border-jma3a-border/40 text-[11px] text-jma3a-muted mb-4">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-jma3a-gold" />
                    <span>{game.players}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-jma3a-gold" />
                    <span>{game.duration}</span>
                  </span>
                </div>

                {/* Play CTA Button */}
                <button
                  onClick={() => openCreateForGame(game.id)}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-bold text-sm shadow-lg shadow-jma3a-terracotta/20 hover:shadow-jma3a-terracotta/40 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>بدا هاد اللعبة</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-jma3a-border/40 py-6 text-center text-xs text-jma3a-muted">
        <p>JMA3A (جماعة) — منصة ألعاب اجتماعية مغربية للأوقات الواقعية الحية ❤️</p>
        <p className="mt-1 text-[11px] text-jma3a-muted/60">بنيت للمة، للضحك، وللأصحاب بلا شاشات معقدة</p>
      </footer>

      {/* Create Room Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-md rounded-3xl border border-jma3a-border bg-jma3a-card p-6 shadow-2xl text-right">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="absolute top-4 left-4 p-2 rounded-full text-jma3a-muted hover:text-white bg-jma3a-surface"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black text-jma3a-sand mb-1">إنشاء غرفة لعبة جديدة</h3>
            <p className="text-xs text-jma3a-muted mb-5">
              اللعبة المختارة: <strong className="text-jma3a-gold">{GAMES.find((g) => g.id === selectedGame)?.title}</strong>
            </p>

            {/* Host Nickname Input */}
            <div className="mb-4">
              <label className="text-xs text-jma3a-sand font-bold block mb-1.5">السمية ديالك (المولف / Host):</label>
              <input
                type="text"
                value={hostNickname}
                onChange={(e) => setHostNickname(e.target.value)}
                placeholder="مثال: يوسف، فاطمة، كبور..."
                className="w-full px-4 py-3 rounded-xl bg-jma3a-surface border border-jma3a-border text-jma3a-sand text-sm font-semibold focus:outline-none focus:border-jma3a-gold"
                maxLength={20}
              />
            </div>

            {/* Interaction Mode Selection */}
            <div className="mb-6">
              <label className="text-xs text-jma3a-sand font-bold block mb-1.5">طريقة اللعب فهاد الجلسة:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setInteractionMode("MULTI_PHONE")}
                  className={`p-3 rounded-xl border text-right transition-all ${
                    interactionMode === "MULTI_PHONE"
                      ? "bg-jma3a-surface border-jma3a-gold text-jma3a-gold font-bold"
                      : "bg-jma3a-dark border-jma3a-border text-jma3a-muted hover:border-white/20"
                  }`}
                >
                  <Smartphone className="w-5 h-5 mb-1 text-jma3a-gold" />
                  <span className="text-xs font-bold block text-jma3a-sand">كل واحد بتليفونو</span>
                  <span className="text-[10px] text-jma3a-muted block">كيسكانيو QR ويلعبو</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInteractionMode("ONE_PHONE")}
                  className={`p-3 rounded-xl border text-right transition-all ${
                    interactionMode === "ONE_PHONE"
                      ? "bg-jma3a-surface border-jma3a-gold text-jma3a-gold font-bold"
                      : "bg-jma3a-dark border-jma3a-border text-jma3a-muted hover:border-white/20"
                  }`}
                >
                  <Users className="w-5 h-5 mb-1 text-jma3a-terracotta" />
                  <span className="text-xs font-bold block text-jma3a-sand">تليفون واحد كيدور</span>
                  <span className="text-[10px] text-jma3a-muted block">بالحاجز السري التام</span>
                </button>
              </div>
            </div>

            {errorMsg && <p className="text-xs text-rose-400 mb-4">{errorMsg}</p>}

            <button
              onClick={handleCreateRoom}
              disabled={isCreating}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-bold text-base shadow-xl shadow-jma3a-terracotta/30 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {isCreating ? <span>كنوجدو الغرفة...</span> : <span>إنشاء الغرفة وعرض الكود 🚀</span>}
            </button>
          </div>
        </div>
      )}

      {/* How it Works Modal */}
      {showHowItWorks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-md rounded-3xl border border-jma3a-border bg-jma3a-card p-6 shadow-2xl text-right">
            <button
              onClick={() => setShowHowItWorks(false)}
              className="absolute top-4 left-4 p-2 rounded-full text-jma3a-muted hover:text-white bg-jma3a-surface"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black text-jma3a-sand mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-jma3a-gold" />
              <span>كيفاش كنلعبو فـ JMA3A؟</span>
            </h3>

            <div className="space-y-4 text-xs text-jma3a-sand/90 leading-relaxed">
              <div className="p-3.5 rounded-2xl bg-jma3a-surface/80 border border-jma3a-border">
                <strong className="text-jma3a-gold block mb-1 text-sm">1. واحد كيصاوب الغرفة</strong>
                <p>كيختار اللعبة (الذيب، الدخيل، مثلها...) وكيعلق كود الغرفة أو QR code قدام الجالسين.</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-jma3a-surface/80 border border-jma3a-border">
                <strong className="text-jma3a-gold block mb-1 text-sm">2. الباقي كيدخلو فـ 5 ثواني</strong>
                <p>كيسكانيو بالكاميرا، كيدخلو سميتهم، وها هما واجدين بلا تسجيل وبلا تحميل تطبيق!</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-jma3a-surface/80 border border-jma3a-border">
                <strong className="text-jma3a-gold block mb-1 text-sm">3. اللعب فالحياة الواقعية</strong>
                <p>التطبيق كيدبر الأدوار السرية، التوقيت، والتصويت، والتفاعل والضحك والتحدي كيدوز بيناتكم فالقعدة!</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-jma3a-surface/80 border border-jma3a-border">
                <strong className="text-jma3a-gold block mb-1 text-sm">4. بدلو اللعبة بلا ما تعاودو الغرفة</strong>
                <p>ملي تساليو أي لعبة، كتقدرو تكليكيو &quot;بدلو اللعبة&quot; والجميع كيبقى مجموع فنفس الغرفة!</p>
              </div>
            </div>

            <button
              onClick={() => setShowHowItWorks(false)}
              className="w-full mt-6 py-3.5 rounded-2xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand font-bold text-sm border border-jma3a-border"
            >
              فهمت، يلا نبداو!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
