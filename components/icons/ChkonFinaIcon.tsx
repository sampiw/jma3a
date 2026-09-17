import React from "react";

export function ChkonFinaIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <radialGradient id="spotlightGlow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#0B0E14" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mirrorGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#spotlightGlow)" />
      {/* Hand Mirror / Spotlight Outer Ring */}
      <circle cx="50" cy="44" r="30" stroke="url(#mirrorGold)" strokeWidth="4" />
      <circle cx="50" cy="44" r="24" fill="#18202F" />
      {/* Question mark with playful curl */}
      <path
        d="M44 34 C44 28 56 28 56 34 C56 38 48 40 48 46 M48 54 L48 56"
        stroke="url(#mirrorGold)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Mirror Handle */}
      <path d="M50 74 L50 90 M46 90 L54 90" stroke="url(#mirrorGold)" strokeWidth="4" strokeLinecap="round" />
      {/* Sparkles */}
      <polygon points="76,24 78,28 82,30 78,32 76,36 74,32 70,30 74,28" fill="#FCD068" />
      <polygon points="22,60 24,63 27,64 24,65 22,68 20,65 17,64 20,63" fill="#FCD068" />
    </svg>
  );
}
