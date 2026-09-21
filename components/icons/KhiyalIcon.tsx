import React from "react";

export function KhiyalIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="khiyalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="50%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id="starGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>

      {/* Outer Mystic Circle */}
      <circle cx="50" cy="50" r="45" stroke="#312E81" strokeWidth="2" strokeDasharray="3 3" />
      <circle cx="50" cy="50" r="41" stroke="url(#khiyalGradient)" strokeWidth="1.5" opacity="0.6" />

      {/* Floating Crescent Moon */}
      <path
        d="M62 20 C42 22 28 38 28 58 C28 72 37 84 50 88 C40 84 34 74 34 62 C34 46 46 32 62 26 C64 25 63 21 62 20 Z"
        fill="url(#khiyalGradient)"
        opacity="0.9"
      />

      {/* Surreal Canvas Card */}
      <rect
        x="42"
        y="30"
        width="34"
        height="46"
        rx="6"
        fill="#1E1B4B"
        stroke="url(#khiyalGradient)"
        strokeWidth="2.5"
        transform="rotate(8 59 53)"
      />

      {/* Painting Landscape inside card */}
      <path
        d="M45 64 Q55 52 65 60 Q73 54 77 66 L77 72 L45 72 Z"
        fill="#4338CA"
        transform="rotate(8 59 53)"
      />

      {/* Sparkles & Constellation Stars */}
      <circle cx="25" cy="32" r="2.5" fill="url(#starGlow)" />
      <circle cx="20" cy="50" r="1.5" fill="#E0E7FF" />
      <circle cx="78" cy="22" r="3" fill="url(#starGlow)" />
      <circle cx="82" cy="74" r="2" fill="url(#starGlow)" />

      {/* 4-Point Star */}
      <path
        d="M50 8 Q50 16 42 16 Q50 16 50 24 Q50 16 58 16 Q50 16 50 8 Z"
        fill="url(#starGlow)"
      />
    </svg>
  );
}
