import React from "react";

export function DiibCardsIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <radialGradient id="diibCardsAura" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#E5A93B" stopOpacity="0.4" />
          <stop offset="65%" stopColor="#D94B34" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#0B0E14" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="goldFoil" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFF2B2" />
          <stop offset="45%" stopColor="#E5A93B" />
          <stop offset="100%" stopColor="#B87614" />
        </linearGradient>
        <linearGradient id="cardObsidian" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#261B3A" />
          <stop offset="100%" stopColor="#0E121B" />
        </linearGradient>
        <linearGradient id="cardCrimson" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B1525" />
          <stop offset="100%" stopColor="#121622" />
        </linearGradient>
      </defs>

      <circle cx="50" cy="52" r="46" fill="url(#diibCardsAura)" />

      {/* Left Fanned Manager/Mystic Card */}
      <g transform="rotate(-14 38 54)">
        <rect
          x="16"
          y="18"
          width="44"
          height="64"
          rx="7"
          fill="url(#cardObsidian)"
          stroke="url(#goldFoil)"
          strokeWidth="2.4"
        />
        <rect
          x="20"
          y="22"
          width="36"
          height="56"
          rx="4"
          stroke="#E5A93B"
          strokeOpacity="0.35"
          strokeWidth="1"
          strokeDasharray="3 2"
        />
        {/* Zellige Star */}
        <polygon points="38,38 43,48 38,58 33,48" fill="#E5A93B" fillOpacity="0.45" />
      </g>

      {/* Right Fanned Hero Wolf + Manager Crown Card */}
      <g transform="rotate(9 58 52)">
        <rect
          x="36"
          y="16"
          width="46"
          height="66"
          rx="7"
          fill="url(#cardCrimson)"
          stroke="url(#goldFoil)"
          strokeWidth="2.8"
        />
        <rect
          x="40.5"
          y="20.5"
          width="37"
          height="57"
          rx="4.5"
          stroke="#FCD068"
          strokeOpacity="0.4"
          strokeWidth="1"
        />

        {/* Royal Manager Crown at Top */}
        <path
          d="M49 33L52.5 26L59 31L65.5 26L69 33H49Z"
          fill="url(#goldFoil)"
        />

        {/* Stylized Wolf Head Emblem */}
        <polygon points="48,39 54,48 46,47" fill="#E5A93B" />
        <polygon points="70,39 64,48 72,47" fill="#E5A93B" />
        <polygon
          points="59,42 70,52 71,62 59,72 47,62 48,52"
          fill="#1B2230"
          stroke="url(#goldFoil)"
          strokeWidth="1.6"
        />
        {/* Glowing Crimson-Gold Eyes */}
        <polygon points="51,54 56,55 53,58" fill="#FF5A4E" />
        <polygon points="67,54 62,55 65,58" fill="#FF5A4E" />
        {/* Nose */}
        <polygon points="59,65 62,68 56,68" fill="#FCD068" />
      </g>
    </svg>
  );
}
