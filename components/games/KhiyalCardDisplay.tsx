"use client";

import React, { useState } from "react";
import { KhiyalCard } from "@/games/khiyal/types";
import { getCardImageUrl } from "@/games/khiyal/cards";
import { Sparkles, Eye, Check, Crown } from "lucide-react";

interface KhiyalCardDisplayProps {
  card: KhiyalCard;
  indexLabel?: number | string;
  isSelected?: boolean;
  isStorytellerCard?: boolean;
  isMyCard?: boolean;
  ownerNickname?: string;
  votesCount?: number;
  voterNicknames?: string[];
  disabled?: boolean;
  disabledReason?: string;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  onInspect?: () => void;
}

export function KhiyalCardDisplay({
  card,
  indexLabel,
  isSelected,
  isStorytellerCard,
  isMyCard,
  ownerNickname,
  votesCount,
  voterNicknames,
  disabled,
  disabledReason,
  size = "md",
  onClick,
  onInspect,
}: KhiyalCardDisplayProps) {
  const [imgError, setImgError] = useState(false);
  const imageUrl = card.imageUrl || getCardImageUrl(card.id);

  const sizeClasses = {
    sm: "w-full max-w-[110px] aspect-[2/3] text-[10px]",
    md: "w-full max-w-[170px] sm:max-w-[200px] aspect-[2/3] text-xs",
    lg: "w-full max-w-[280px] sm:max-w-[340px] aspect-[2/3] text-sm",
  };

  const containerMaxWidth =
    size === "lg" ? "max-w-[280px] sm:max-w-[340px]" : size === "sm" ? "max-w-[110px]" : "max-w-[170px] sm:max-w-[200px]";

  return (
    <div className={`relative group select-none flex flex-col items-center w-full ${containerMaxWidth}`}>
      {/* Index Badge during Voting */}
      {indexLabel !== undefined && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 text-jma3a-dark font-black text-sm flex items-center justify-center shadow-xl border-2 border-jma3a-dark ring-2 ring-yellow-300/50">
          {indexLabel}
        </div>
      )}

      {/* Storyteller Crown Badge during Resolution */}
      {isStorytellerCard && (
        <div className="absolute -top-3.5 right-2 z-20 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-jma3a-dark font-black text-[11px] flex items-center gap-1 shadow-2xl border border-yellow-100 animate-bounce">
          <Crown className="w-3.5 h-3.5 fill-jma3a-dark" />
          <span>مول الحجاية</span>
        </div>
      )}

      {/* My Card Tag */}
      {isMyCard && !isStorytellerCard && (
        <div className="absolute -top-3 right-2 z-20 px-2 py-0.5 rounded-full bg-black/80 text-white/90 font-bold text-[10px] border border-white/20 shadow-md">
          بطاقتك 🃏
        </div>
      )}

      {/* Card Body - REAL DIXIT ART STYLE */}
      <div
        onClick={() => {
          if (!disabled && onClick) onClick();
        }}
        className={`relative rounded-2xl overflow-hidden border-2 transition-all duration-300 flex flex-col justify-between ${
          sizeClasses[size]
        } ${
          disabled
            ? "opacity-45 cursor-not-allowed border-white/10 grayscale-[30%]"
            : isSelected
            ? "border-jma3a-gold shadow-2xl shadow-jma3a-gold/50 scale-[1.04] cursor-pointer ring-4 ring-jma3a-gold/70"
            : "border-white/20 hover:border-jma3a-gold/80 hover:scale-[1.02] cursor-pointer shadow-xl"
        } bg-gradient-to-br ${card.fallbackGradient}`}
      >
        {/* Real Artwork Image */}
        {!imgError && imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageUrl}
            alt={card.title}
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          /* High quality artistic SVG fallback */
          <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950">
            <div className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mb-2 shadow-inner backdrop-blur-sm">
              <Sparkles className="w-8 h-8 text-jma3a-gold animate-pulse" />
            </div>
            <span className="text-xs font-bold text-amber-200">{card.title}</span>
          </div>
        )}

        {/* Cinematic Vignette Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30 pointer-events-none" />

        {/* Top Floating Action: Inspect Icon */}
        <div className="relative z-10 p-2 flex items-center justify-between">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-md text-white/70 border border-white/10 font-mono">
            #{card.visualTheme}
          </span>
          {onInspect && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onInspect();
              }}
              className="p-1.5 rounded-xl bg-black/60 hover:bg-black/90 text-white/90 hover:text-white transition-all backdrop-blur-md border border-white/20 shadow-md"
              title="تكبير وتأمل البطاقة"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Bottom Floating Title Pill (No wall of text!) */}
        <div className="relative z-10 p-2 text-center mt-auto">
          <div className="px-2.5 py-1 rounded-xl bg-black/65 backdrop-blur-md border border-white/20 shadow-lg inline-flex items-center justify-center gap-1 max-w-full">
            <span className="font-black text-amber-200 text-xs truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {card.title}
            </span>
            {isSelected && (
              <Check className="w-3.5 h-3.5 text-jma3a-gold stroke-[3] shrink-0" />
            )}
          </div>

          {/* Votes Count Pill in Resolution */}
          {votesCount !== undefined && votesCount > 0 && (
            <div className="mt-1">
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-jma3a-dark font-black text-[10px] shadow-md border border-yellow-200">
                {votesCount} {votesCount === 1 ? "صوت" : "أصوات"} 🗳️
              </span>
            </div>
          )}
        </div>

        {/* Disabled Overlay text */}
        {disabled && disabledReason && (
          <div className="absolute inset-0 z-30 bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 text-center">
            <span className="text-xs font-black text-rose-300 bg-rose-950/80 px-2.5 py-1 rounded-xl border border-rose-500/40">
              {disabledReason}
            </span>
          </div>
        )}
      </div>

      {/* Owner tag in resolution */}
      {ownerNickname && (
        <div className="mt-1.5 text-center">
          <span className="text-[11px] font-black text-jma3a-sand bg-black/60 px-3 py-0.5 rounded-full border border-white/10 shadow-sm">
            @{ownerNickname}
          </span>
          {voterNicknames && voterNicknames.length > 0 && (
            <p className="text-[10px] text-amber-300 font-semibold mt-0.5">
              صوّتو ليه: {voterNicknames.join("، ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
