"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { sound } from "@/lib/sound";
import { User, LogIn, AlertCircle } from "lucide-react";

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = use(params);
  const roomCode = resolvedParams.code.toUpperCase();
  const router = useRouter();

  const [roomInfo, setRoomInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState("");
  const [avatarSeed, setAvatarSeed] = useState("avatar_1");
  const [joining, setJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const avatars = [
    { id: "avatar_1", emoji: "🦁", label: "سبع" },
    { id: "avatar_2", emoji: "🐺", label: "ذيب" },
    { id: "avatar_3", emoji: "🦅", label: "نسر" },
    { id: "avatar_4", emoji: "🦊", label: "ثعلب" },
    { id: "avatar_5", emoji: "🐪", label: "جمل" },
    { id: "avatar_6", emoji: "🐎", label: "عود" },
    { id: "avatar_7", emoji: "🦉", label: "بومة" },
    { id: "avatar_8", emoji: "🐆", label: "نمر" },
  ];

  useEffect(() => {
    fetch(`/api/rooms/${roomCode}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setRoomInfo(data);
        } else {
          setErrorMsg(data.error || "الغرفة غير موجودة");
        }
        setLoading(false);
      })
      .catch(() => {
        setErrorMsg("تعذر الاتصال بالخادم");
        setLoading(false);
      });
  }, [roomCode]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setErrorMsg("عفاك كتب سميتك باش يعرفوك صحابك");
      return;
    }

    setJoining(true);
    setErrorMsg("");
    sound.playCardFlip();

    try {
      const res = await fetch(`/api/rooms/${roomCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim(),
          avatarSeed,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "تعذر الانضمام للغرفة");
        setJoining(false);
        return;
      }

      router.push(`/room/${roomCode}`);
    } catch {
      setErrorMsg("حدث خطأ فالشبكة. عاود حاول.");
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-jma3a-gold border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-jma3a-muted">كنقلبو على الغرفة...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-md mx-auto w-full">
      <div className="w-full p-6 sm:p-8 rounded-3xl bg-jma3a-card border border-jma3a-border shadow-2xl text-right">
        {/* Room Code Badge */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-jma3a-border/60">
          <div>
            <span className="text-xs text-jma3a-muted block">الانضمام للغرفة</span>
            <span className="text-2xl font-mono font-black text-jma3a-gold">{roomCode}</span>
          </div>
          <div className="text-left">
            <span className="text-[11px] text-jma3a-muted block">الحاضرين دابا</span>
            <span className="text-sm font-bold text-jma3a-sand">{roomInfo?.playersCount || 0} لاعبين</span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-semibold mb-5 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleJoin} className="space-y-5">
          <div>
            <label className="text-xs text-jma3a-sand font-bold block mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-jma3a-gold" />
              <span>السمية ديالك فاللعبة:</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="اكتب سميتك هنا..."
              className="w-full px-4 py-3.5 rounded-2xl bg-jma3a-surface border border-jma3a-border text-jma3a-sand text-sm font-semibold focus:outline-none focus:border-jma3a-gold transition-colors"
              maxLength={20}
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs text-jma3a-sand font-bold block mb-2">اختار شخصيتك (الأفاتار):</label>
            <div className="grid grid-cols-4 gap-2">
              {avatars.map((av) => (
                <button
                  key={av.id}
                  type="button"
                  onClick={() => {
                    setAvatarSeed(av.id);
                    sound.playCardFlip();
                  }}
                  className={`p-2.5 rounded-2xl border text-center transition-all ${
                    avatarSeed === av.id
                      ? "bg-jma3a-surface border-jma3a-gold shadow-md scale-105"
                      : "bg-jma3a-dark border-jma3a-border hover:border-white/20"
                  }`}
                >
                  <span className="text-2xl block mb-0.5">{av.emoji}</span>
                  <span className="text-[10px] text-jma3a-muted block">{av.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={joining}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-bold text-base shadow-xl shadow-jma3a-terracotta/30 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <LogIn className="w-5 h-5" />
            <span>{joining ? "جاري الدخول..." : "دخول للغرفة 🚀"}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
