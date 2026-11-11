"use client";

import React, { useEffect, useState } from "react";
import { DIIB_CARDS_ROLE_META, DiibCardRole } from "@/games/diib-cards/types";
import { DiibCardBackArt, DiibRoleArt } from "@/components/games/diib-cards/DiibRoleArt";
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

const COMPACT_ROLE_TITLES: Record<DiibCardRole, string> = {
  manager: "المانيجر",
  wolf: "الذيب",
  mute_wolf: "الذيب السكّات",
  seer: "الشوافة",
  witch: "السحارة",
  protector: "الحارس",
  hunter: "الصياد",
  villager: "ولد الحومة",
};

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

  // Single-Mounted-Face 2-Stage Flip:
  // Only ONE face exists in the DOM at a time, and neither face ever uses rotateY(180deg)
  // or scaleX(-1), making mirrored/backwards Arabic text or bleed-through 100% impossible on iOS Safari.
  const [displayedFlipped, setDisplayedFlipped] = useState<boolean>(isFlipped);
  const [flipStage, setFlipStage] = useState<"idle" | "closing" | "opening">("idle");

  useEffect(() => {
    if (compact) {
      setDisplayedFlipped(isFlipped);
      setFlipStage("idle");
      return;
    }
    if (isFlipped === displayedFlipped) return;

    setFlipStage("closing");
    const swapId = setTimeout(() => {
      setDisplayedFlipped(isFlipped);
      setFlipStage("opening");
    }, 145);

    const doneId = setTimeout(() => {
      setFlipStage("idle");
    }, 310);

    return () => {
      clearTimeout(swapId);
      clearTimeout(doneId);
    };
  }, [isFlipped, displayedFlipped, compact]);

  const handleTap = () => {
    if (!onFlipChange || flipStage !== "idle") return;
    sound.playCardFlip();
    onFlipChange(!isFlipped);
  };

  // =========================================================================
  // COMPACT MINI-TAROT CARD (Game Over 2-Col Mobile Grid & Dawn Obituary)
  // =========================================================================
  if (compact) {
    const shortTitle = COMPACT_ROLE_TITLES[role] || meta.title;
    return (
      <div
        dir="rtl"
        className={`relative rounded-2xl overflow-hidden border-2 ${meta.borderColor} bg-[#10141F] shadow-xl flex flex-col transition-all ${
          isDead ? "grayscale-[55%] opacity-85" : ""
        } ${className}`}
      >
        <div className="relative h-32 sm:h-36 w-full overflow-hidden bg-[#0B0E16] shrink-0">
          <DiibRoleArt role={role} compact />
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#10141F] to-transparent pointer-events-none" />

          {/* Clean single-corner status badge */}
          {isDead && (
            <span className="absolute top-2 left-2 whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-950/95 text-rose-200 border border-rose-400/60 shadow-md">
              💀 ميت
            </span>
          )}
          {!isDead && isMuted && (
            <span className="absolute top-2 left-2 whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-black bg-fuchsia-950/95 text-fuchsia-200 border border-fuchsia-400/60 shadow-md">
              🤐 مسكّت
            </span>
          )}

          {/* Role Emoji Badge */}
          <div className="absolute bottom-1.5 right-2 w-7 h-7 rounded-lg bg-[#0E121B]/95 border border-amber-400/50 flex items-center justify-center text-sm shadow-md">
            {meta.emoji}
          </div>
        </div>

        <div className="p-2.5 pt-2 text-center bg-gradient-to-b from-[#10141F] to-[#0B0E16] flex-1 flex flex-col justify-between gap-1">
          {playerName && (
            <div className="text-sm font-black text-jma3a-sand truncate">{playerName}</div>
          )}
          <div>
            <span
              className={`inline-block max-w-full truncate whitespace-nowrap px-2.5 py-0.5 rounded-full text-[10px] font-black border ${meta.badgeBg}`}
            >
              {shortTitle}
            </span>
          </div>
          <div className="text-[10px] font-semibold text-jma3a-gold/85 truncate">
            {meta.ruleBadge}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // FULL-SIZE INTERACTIVE TAROT CARD (Pure Vector + Zero-Mirror Flip)
  // =========================================================================
  const flipTransformStyle: React.CSSProperties =
    flipStage === "closing"
      ? {
          transform: "scaleX(0.03) scaleY(0.97)",
          transition: "transform 145ms ease-in",
        }
      : flipStage === "opening"
      ? {
          transform: "scaleX(1) scaleY(1)",
          transition: "transform 165ms ease-out",
        }
      : {
          transform: "none",
          transition: "transform 165ms ease-out",
        };

  return (
    <div
      dir="rtl"
      onClick={handleTap}
      className={`relative select-none ${
        onFlipChange ? "cursor-pointer active:scale-[0.99]" : ""
      } w-full max-w-[18.5rem] sm:max-w-[19.5rem] h-[26.5rem] sm:h-[28.5rem] mx-auto ${className}`}
    >
      <div
        style={flipTransformStyle}
        className="relative w-full h-full rounded-[26px] shadow-[0_24px_55px_-12px_rgba(0,0,0,0.88)] will-change-transform"
      >
        {!displayedFlipped ? (
          /* =========================================================
             FACE 1: PURE VECTOR ROYAL MOROCCAN TAROT CARD BACK
             ========================================================= */
          <div className="relative w-full h-full rounded-[26px] overflow-hidden border-2 border-amber-400/75 bg-[#0B0E17]">
            <DiibCardBackArt />

            <div className="absolute inset-3 rounded-[18px] pointer-events-none flex flex-col justify-between p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  dir="ltr"
                  className="text-[10px] font-black tracking-[0.18em] uppercase text-amber-300 px-2.5 py-1 rounded-full bg-[#090C14]/95 border border-amber-400/45 whitespace-nowrap"
                >
                  DIIB CARDS
                </span>
                {playerName && (
                  <span className="text-xs font-black text-jma3a-sand px-2.5 py-1 rounded-full bg-[#090C14]/95 border border-white/20 truncate max-w-[135px]">
                    {playerName}
                  </span>
                )}
              </div>

              <div className="p-3 rounded-2xl bg-[#090C14]/95 border border-amber-400/50 text-center shadow-xl">
                <div className="flex items-center justify-center gap-1.5 text-sm font-black text-amber-200">
                  <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                  <span>كارطتك السرية 🃏</span>
                </div>
                <p className="text-[11px] text-jma3a-sand/90 mt-0.5 font-semibold">
                  انقر باش تقلب الكارطة وتشوف دورك غير بوحدك 👀
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* =========================================================
             FACE 2: PURE VECTOR REVEALED CHARACTER TAROT CARD
             ========================================================= */
          <div
            className={`relative w-full h-full rounded-[26px] overflow-hidden border-2 ${meta.borderColor} bg-[#0E121B] flex flex-col justify-between`}
          >
            {/* Top 52% Bespoke Vector Tarot Emblem */}
            <div className="relative h-[52%] w-full overflow-hidden bg-[#0B0E16] shrink-0">
              <DiibRoleArt role={role} />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0E121B] via-[#0E121B]/70 to-transparent pointer-events-none" />

              {/* Top Tarot Header Bar */}
              <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-2">
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-black border shadow-md whitespace-nowrap ${meta.badgeBg}`}
                >
                  {meta.team === "MANAGER"
                    ? "👑 سيد الطاولة"
                    : meta.team === "WOLVES"
                    ? "🐺 صف الذيابة"
                    : "🏡 صف الحومة"}
                </span>
                <span
                  dir="ltr"
                  className="px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase bg-[#090C14]/90 text-amber-200 border border-amber-300/35 whitespace-nowrap"
                >
                  {meta.subtitle}
                </span>
              </div>
            </div>

            {/* Center Role Medallion Crest */}
            <div className="relative z-20 -mt-6 mx-auto w-12 h-12 rounded-2xl bg-[#131824] border-2 border-amber-400/75 shadow-xl flex items-center justify-center text-2xl shrink-0">
              {meta.emoji}
            </div>

            {/* Bottom Role Lore & Power Plaque */}
            <div
              className={`relative z-10 flex-1 px-4 pt-2 pb-3.5 flex flex-col justify-between text-center bg-gradient-to-b ${meta.themeGradient}`}
            >
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-jma3a-gold tracking-tight">
                  {meta.title}
                </h3>
                <div className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-[#090C14]/80 border border-white/10 text-[11px] font-bold text-amber-200">
                  {meta.ruleBadge}
                </div>
                <p className="text-xs text-jma3a-sand/90 leading-relaxed mt-2 line-clamp-3">
                  {meta.description}
                </p>
              </div>

              {/* Wolf Pack Allies Strip (for Wolves) */}
              {packMemberNames && packMemberNames.length > 0 && (
                <div className="mt-1.5 py-1 px-2.5 rounded-xl bg-rose-950/85 border border-rose-500/45 text-[11px] text-rose-200 truncate">
                  <span className="font-black text-rose-300 ml-1">عصابتك 🐺:</span>
                  {packMemberNames.join(" ، ")}
                </div>
              )}

              {onFlipChange && (
                <div className="pt-1 flex items-center justify-center gap-1.5 text-[11px] font-bold text-jma3a-muted">
                  <EyeOff className="w-3.5 h-3.5 text-jma3a-gold shrink-0" />
                  <span>انقر على الكارطة باش تخبّيها على الجالسين حذاك 🤫</span>
                </div>
              )}
            </div>

            {/* Inner Ornamental Gold Hairline */}
            <div className="absolute inset-2 rounded-[20px] border border-amber-300/20 pointer-events-none z-20" />
          </div>
        )}
      </div>
    </div>
  );
}
