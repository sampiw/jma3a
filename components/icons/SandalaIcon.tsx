import React from "react";

export function SandalaIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <radialGradient id="sandalaGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#EC4899" stopOpacity="0.55" />
          <stop offset="65%" stopColor="#F59E0B" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#0B0E14" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sandalaSole" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="50%" stopColor="#DB2777" />
          <stop offset="100%" stopColor="#9D174D" />
        </linearGradient>
        <linearGradient id="sandalaStrap" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="50%" stopColor="#FEF08A" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>

      <circle cx="50" cy="50" r="46" fill="url(#sandalaGlow)" />

      {/* Target Sniper Crosshair Ring */}
      <circle cx="54" cy="48" r="34" stroke="#F43F5E" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.55" />
      <line x1="54" y1="9" x2="54" y2="18" stroke="#F43F5E" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <line x1="54" y1="78" x2="54" y2="87" stroke="#F43F5E" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <line x1="15" y1="48" x2="24" y2="48" stroke="#F43F5E" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <line x1="84" y1="48" x2="93" y2="48" stroke="#F43F5E" strokeWidth="2" strokeLinecap="round" opacity="0.7" />

      {/* Speed Whoosh Lines */}
      <path d="M 10 68 Q 22 60 34 62" stroke="#FDE047" strokeWidth="2.8" strokeLinecap="round" opacity="0.85" />
      <path d="M 12 78 Q 28 70 42 72" stroke="#FB7185" strokeWidth="2.4" strokeLinecap="round" opacity="0.75" />
      <path d="M 18 54 Q 26 48 35 49" stroke="#38BDF8" strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />

      {/* Flying Moroccan Sandala (Tilted at -32 deg) */}
      <g transform="translate(53, 47) rotate(-32)">
        {/* 3D Bottom Rubber Edge */}
        <rect x="-15" y="-26" width="30" height="54" rx="15" fill="#500724" transform="translate(2, 4)" />
        {/* Main Slipper Sole */}
        <rect
          x="-15"
          y="-26"
          width="30"
          height="54"
          rx="15"
          fill="url(#sandalaSole)"
          stroke="#FBCFE8"
          strokeWidth="2"
        />
        {/* Inner Footbed Pattern */}
        <rect x="-10" y="-20" width="20" height="42" rx="10" fill="#BE185D" opacity="0.65" />
        {/* Golden Zellige / Babouche Strap */}
        <path
          d="M -16 -10 Q 0 -20 16 -10 L 15 4 Q 0 -6 -15 4 Z"
          fill="url(#sandalaStrap)"
          stroke="#78350F"
          strokeWidth="1.5"
        />
        {/* Center Diamond Emblem on Strap */}
        <polygon points="0,-11 6,-5 0,1 -6,-5" fill="#EC4899" stroke="#FEF08A" strokeWidth="1.2" />
      </g>

      {/* Impact Star / Sparkles */}
      <polygon
        points="78,22 81,28 88,29 82,34 84,40 78,36 72,40 74,34 68,29 75,28"
        fill="#FACC15"
        stroke="#EA580C"
        strokeWidth="1"
      />
    </svg>
  );
}
