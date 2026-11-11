"use client";

import React, { useRef, useState } from "react";
import { DIIB_CARDS_ROLE_META, DiibCardRole } from "@/games/diib-cards/types";
import { sound } from "@/lib/sound";
import { EyeOff, Sparkles } from "lucide-react";

interface DiibTarotCardProps {
  role: DiibCardRole;
  playerName?: string;
  isFlipped: boolean;
  onFlipChange?: (nextFlipped: boolean) => void;
  packMemberNames?: string[];
  compact?: boolean;
  isDead?: boolean;
  isMuted?: boolean;
  className?: string;
}

export function DiibTarotCard({
  role,
  playerName,
  isFlipped,
  onFlipChange,
  packMemberNames,
  compact = false,
  isDead = false,
  isMuted = false,
  className = "",
}: DiibTarotCardProps) {
  const meta = DIIB_CARDS_ROLE_META[role] || DIIB_CARDS_ROLE_META.villager;
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, glareX: 50, glareY: 50 });

  const updatePointerTilt = (clientX: number, clientY: number) => {
    if (compact || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    setTilt({
      x: (0.5 - relY) * 18,
      y: (relX - 0.5) * 18,
      glareX: Math.round(relX * 100),
      glareY: Math.round(relY * 100),
    });
  };

  const resetTilt = () => {
    setTilt({ x: 0, y: 0, glareX: 50, glareY: 50 });
  };

  const handleTap = () => {
    if (!onFlipChange) return;
    sound.playCardFlip();
    onFlipChange(!isFlipped);
  };

  // Compact Mini-Tarot Card (used in Game Over gallery, Obituary & Manager Deck)
  if (compact) {
    return (
      <div
        className={`relative rounded-2xl overflow-hidden border-2 ${meta.borderColor} bg-jma3a-card shadow-xl transition-all ${
          isDead ? "grayscale-[65%] opacity-80" : ""
        } ${className}`}
      >
        <div className="relative h-32 w-full overflow-hidden bg-jma3a-dark">
          <img
            src={meta.image}
            alt={meta.title}
            className="w-full h-full object-cover object-top"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-jma3a-card via-jma3a-card/30 to-transparent" />

          {/* Top status pills */}
          <div className="absolute top-2 inset-x-2 flex items-center justify-between gap-1">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${meta.badgeBg}`}>
              {meta.emoji} {meta.title}
            </span>
            {isDead && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-950/95 text-rose-300 border border-rose-500/60">
                💀 ميت
              </span>
            )}
            {!isDead && isMuted && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-fuchsia-950/95 text-fuchsia-200 border border-fuchsia-400/60">
                🤐 مسكّت
              </span>
            )}
          </div>
        </div>

        <div className="p-2.5 text-center bg-gradient-to-b from-jma3a-card to-jma3a-dark">
          {playerName && (
            <div className="text-sm font-black text-jma3a-sand truncate">{playerName}</div>
          )}
          <div className="text-[10px] font-semibold text-jma3a-gold/90 truncate mt-0.5">
            {meta.ruleBadge}
          </div>
        </div>
      </div>
    );
  }

  // Full-Size Interactive 3D Collectible Tarot Card
  return (
    <div
      ref={cardRef}
      onMouseMove={(e) => updatePointerTilt(e.clientX, e.clientY)}
      onMouseLeave={resetTilt}
      onTouchMove={(e) => {
        if (e.touches[0]) updatePointerTilt(e.touches[0].clientX, e.touches[0].clientY);
      }}
      onTouchEnd={resetTilt}
      onClick={handleTap}
      className={`relative select-none ${onFlipChange ? "cursor-pointer" : ""} w-[19rem] sm:w-80 h-[28rem] sm:h-[30rem] mx-auto ${className}`}
      style={{ perspective: "1400px" }}
    >
      <div
        className="relative w-full h-full rounded-[26px] transition-transform duration-700 ease-out shadow-[0_25px_60px_-12px_rgba(0,0,0,0.85)]"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y + (isFlipped ? 180 : 0)}deg)`,
        }}
      >
        {/* =========================================================
            FACE 1: ORNATE MOROCCAN TAROT CARD BACK (SECRET / LOCKED)
           ========================================================= */}
        <div
          className="absolute inset-0 w-full h-full rounded-[26px] overflow-hidden border-2 border-amber-400/70 bg-[#0D101B] backface-hidden shadow-inner"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          {/* Generated Luxury Card Back Artwork */}
          <img
            src="/images/diib-cards/card-back.png"
            alt="Diib Cards Back"
            className="absolute inset-0 w-full h-full object-cover opacity-90"
          />

          {/* Subtle Dark-Gold Vignette & Foil Shimmer */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(252, 208, 104, 0.24), transparent 55%), linear-gradient(to bottom, rgba(11,14,20,0.35), rgba(11,14,20,0.82))`,
            }}
          />

          {/* Inner Gold Filigree Frame */}
          <div className="absolute inset-3 rounded-[18px] border border-amber-300/45 pointer-events-none flex flex-col justify-between p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black tracking-[0.2em] uppercase text-amber-300/90 px-2.5 py-0.5 rounded-full bg-black/65 border border-amber-400/40">
                DIIB CARDS
              </span>
              {playerName && (
                <span className="text-xs font-black text-jma3a-sand px-2.5 py-0.5 rounded-full bg-black/70 border border-white/15 truncate max-w-[140px]">
                  {playerName}
                </span>
              )}
            </div>

            <div className="my-auto text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-black/65 border border-amber-400/60 shadow-[0_0_30px_rgba(229,169,59,0.35)] mb-3 backdrop-blur-sm">
                <Sparkles className="w-8 h-8 text-amber-300 animate-pulse" />
              </div>
              <h3 className="text-xl font-black text-amber-200 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
                كارطتك السرية 🃏
              </h3>
              <p className="text-xs text-jma3a-sand/90 mt-1 font-semibold drop-shadow">
                انقر باش تقلب الكارطة وتشوف دورك غير بوحدك 👀
              </p>
            </div>

            <div className="text-center">
              <span className="inline-block text-[11px] font-bold text-amber-300/90 px-3 py-1 rounded-full bg-black/70 border border-amber-400/35">
                كوارط الذيب &bull; النسخة الملكية
              </span>
            </div>
          </div>
        </div>

        {/* =========================================================
            FACE 2: REVEALED ILLUSTRATED CHARACTER TAROT CARD
           ========================================================= */}
        <div
          className={`absolute inset-0 w-full h-full rounded-[26px] overflow-hidden border-2 ${meta.borderColor} bg-[#0E121B] backface-hidden flex flex-col justify-between`}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {/* Top 62% Full-Bleed Character Illustration */}
          <div className="relative h-[60%] w-full overflow-hidden bg-jma3a-dark">
            <img
              src={meta.image}
              alt={meta.title}
              className="w-full h-full object-cover object-top scale-[1.02]"
            />
            {/* Dynamic Holographic Foil Glare */}
            <div
              className="absolute inset-0 pointer-events-none mix-blend-screen"
              style={{
                background: `radial-gradient(circle at ${100 - tilt.glareX}% ${tilt.glareY}%, rgba(255, 236, 179, 0.28), transparent 55%)`,
              }}
            />
            {/* Gradient melt into bottom plaque */}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0E121B] via-[#0E121B]/80 to-transparent" />

            {/* Top Tarot Header Bar */}
            <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-2">
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-black border backdrop-blur-md shadow-md ${meta.badgeBg}`}>
                {meta.team === "MANAGER"
                  ? "👑 سيد الطاولة"
                  : meta.team === "WOLVES"
                  ? "🐺 صف الذيابة"
                  : "🏡 صف الحومة"}
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase bg-black/65 text-amber-200/90 border border-amber-300/30 backdrop-blur-md">
                {meta.subtitle}
              </span>
            </div>

            {/* Floating Center Medallion Crest */}
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-12 h-12 rounded-2xl bg-[#131824] border-2 border-amber-400/70 shadow-xl flex items-center justify-center text-2xl">
              {meta.emoji}
            </div>
          </div>

          {/* Bottom 40% Ornate Role Lore & Power Plaque */}
          <div className={`relative flex-1 px-4 pt-4 pb-3.5 flex flex-col justify-between text-center bg-gradient-to-b ${meta.themeGradient}`}>
            <div>
              <h3 className="text-2xl font-black text-jma3a-gold tracking-tight">
                {meta.title}
              </h3>
              <div className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-black/45 border border-white/10 text-[11px] font-bold text-amber-200">
                {meta.ruleBadge}
              </div>
              <p className="text-xs text-jma3a-sand/90 leading-relaxed mt-2 line-clamp-3">
                {meta.description}
              </p>
            </div>

            {/* Wolf Pack Allies Strip (for Wolves) */}
            {packMemberNames && packMemberNames.length > 0 && (
              <div className="mt-1.5 py-1.5 px-2.5 rounded-xl bg-rose-950/75 border border-rose-500/40 text-[11px] text-rose-200">
                <span className="font-black text-rose-300 ml-1">عصابتك 🐺:</span>
                {packMemberNames.join(" ، ")}
              </div>
            )}

            <div className="pt-1 flex items-center justify-center gap-1.5 text-[11px] font-bold text-jma3a-muted">
              <EyeOff className="w-3.5 h-3.5 text-jma3a-gold" />
              <span>انقر على الكارطة باش تخبّيها على الجالسين حذاك 🤫</span>
            </div>
          </div>

          {/* Inner Ornamental Gold Hairline */}
          <div className="absolute inset-2 rounded-[20px] border border-amber-300/20 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
