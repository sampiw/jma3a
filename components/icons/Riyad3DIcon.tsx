import React from "react";

export function Riyad3DIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <radialGradient id="riyad3dGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#10B981" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#090D16" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="goldVase3D" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="50%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
      </defs>

      <circle cx="50" cy="50" r="46" fill="url(#riyad3dGlow)" />

      {/* Lurking Haunted Ghoul Eyes in the Dark Archway Behind */}
      <path
        d="M24 58 L24 30 Q50 8 76 30 L76 58 Z"
        fill="#0F172A"
        stroke="#A855F7"
        strokeWidth="1.8"
      />
      <polygon points="34,28 44,31 36,34" fill="#EF4444" />
      <polygon points="66,28 56,31 64,34" fill="#EF4444" />

      {/* 3D Isometric Zellij Floor Pedestal */}
      <polygon points="50,68 84,80 50,92 16,80" fill="#064E3B" stroke="#10B981" strokeWidth="1.5" />
      <polygon points="16,80 50,92 50,97 16,85" fill="#022C22" />
      <polygon points="84,80 50,92 50,97 84,85" fill="#042F2E" />

      {/* 3D Fragile Golden Moroccan Vase / Treasure */}
      <ellipse cx="50" cy="36" rx="11" ry="4" fill="#FEF08A" stroke="#D97706" strokeWidth="1.5" />
      <path
        d="M41 36 L43 44 Q32 54 36 68 Q50 78 64 68 Q68 54 57 44 L59 36 Z"
        fill="url(#goldVase3D)"
        stroke="#FEF08A"
        strokeWidth="2"
      />
      {/* Handles */}
      <path d="M41 42 Q30 45 34 56" stroke="#FBBF24" strokeWidth="3" strokeLinecap="round" />
      <path d="M59 42 Q70 45 66 56" stroke="#FBBF24" strokeWidth="3" strokeLinecap="round" />

      {/* R.E.P.O. Fragile Crack Line on the Vase */}
      <polyline
        points="49,45 45,53 52,58 47,67"
        stroke="#EF4444"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Emerald Gem in Center */}
      <polygon points="50,48 55,54 50,60 45,54" fill="#10B981" stroke="#A7F3D0" strokeWidth="1.2" />

      <text x="12" y="25" fill="#FBBF24" fontSize="13" fontWeight="900">
        3D
      </text>
    </svg>
  );
}
