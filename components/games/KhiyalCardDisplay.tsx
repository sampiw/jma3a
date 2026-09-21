"use client";

import React from "react";
import { KhiyalCard } from "@/games/khiyal/types";
import { Sparkles, Eye, Check, Crown } from "lucide-react";

interface KhiyalCardDisplayProps {
  card: KhiyalCard;
  indexLabel?: number | string;
  isSelected?: boolean;
  isStorytellerCard?: boolean;
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
  ownerNickname,
  votesCount,
  voterNicknames,
  disabled,
  disabledReason,
  size = "md",
  onClick,
  onInspect,
}: KhiyalCardDisplayProps) {
  const sizeClasses = {
    sm: "w-28 h-40 text-[11px]",
    md: "w-36 h-52 text-xs sm:w-44 sm:h-64",
    lg: "w-64 h-92 sm:w-72 sm:h-[420px] text-sm",
  };

  return (
    <div className="relative group select-none flex flex-col items-center">
      {/* Index Badge */}
      {indexLabel !== undefined && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 w-7 h-7 rounded-full bg-jma3a-gold text-jma3a-dark font-black text-xs flex items-center justify-center shadow-lg border-2 border-jma3a-dark">
          {indexLabel}
        </div>
      )}

      {/* Storyteller Crown Badge */}
      {isStorytellerCard && (
        <div className="absolute -top-3.5 right-2 z-20 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-jma3a-dark font-black text-[10px] flex items-center gap-1 shadow-xl border border-yellow-200 animate-pulse">
          <Crown className="w-3 h-3 fill-jma3a-dark" />
          <span>الحكواتي</span>
        </div>
      )}

      {/* Card Body */}
      <div
        onClick={() => {
          if (!disabled && onClick) onClick();
        }}
        className={`relative rounded-2xl overflow-hidden border-2 transition-all duration-300 flex flex-col justify-between p-3 ${
          sizeClasses[size]
        } ${
          disabled
            ? "opacity-50 cursor-not-allowed border-white/10"
            : isSelected
            ? "border-jma3a-gold shadow-xl shadow-jma3a-gold/30 scale-[1.03] cursor-pointer ring-2 ring-jma3a-gold/60"
            : "border-white/20 hover:border-jma3a-gold/70 hover:scale-[1.02] cursor-pointer shadow-lg"
        } bg-gradient-to-br ${card.fallbackGradient}`}
      >
        {/* Background Texture & Vignette */}
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[0.5px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/20 via-transparent to-black/60 pointer-events-none" />

        {/* Top Header: Title & Inspect Icon */}
        <div className="relative z-10 flex items-start justify-between gap-1">
          <span className="font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] line-clamp-1 leading-tight">
            {card.title}
          </span>
          {onInspect && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onInspect();
              }}
              className="p-1 rounded-lg bg-black/40 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
              title="تكبير البطاقة"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Center Artwork Scene */}
        <div className="relative z-10 my-auto text-center flex flex-col items-center justify-center py-2">
          <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mb-2 shadow-inner backdrop-blur-sm group-hover:scale-110 transition-transform">
            <Sparkles className="w-6 h-6 text-jma3a-gold" />
          </div>
          <p className="text-[11px] leading-relaxed text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] line-clamp-3 px-1 text-center font-medium">
            {card.description}
          </p>
        </div>

        {/* Bottom Bar */}
        <div className="relative z-10 pt-2 border-t border-white/10 flex items-center justify-between text-[10px]">
          <span className="text-white/60 font-semibold capitalize">#{card.visualTheme}</span>

          {isSelected && (
            <span className="w-5 h-5 rounded-full bg-jma3a-gold text-jma3a-dark flex items-center justify-center font-bold">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </span>
          )}

          {votesCount !== undefined && votesCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-950/90 text-indigo-200 border border-indigo-500/40 font-bold">
              {votesCount} {votesCount === 1 ? "صوت" : "أصوات"} 🗳️
            </span>
          )}
        </div>

        {/* Disabled Overlay text */}
        {disabled && disabledReason && (
          <div className="absolute inset-0 z-30 bg-black/75 flex items-center justify-center p-2 text-center">
            <span className="text-xs font-bold text-rose-300">{disabledReason}</span>
          </div>
        )}
      </div>

      {/* Owner tag in resolution */}
      {ownerNickname && (
        <div className="mt-1.5 text-center">
          <span className="text-[11px] font-bold text-jma3a-sand bg-black/40 px-2.5 py-0.5 rounded-full border border-white/10">
            @{ownerNickname}
          </span>
          {voterNicknames && voterNicknames.length > 0 && (
            <p className="text-[10px] text-jma3a-muted mt-0.5">
              صوّت له: {voterNicknames.join("، ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
