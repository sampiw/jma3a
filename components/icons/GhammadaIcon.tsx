import React from "react";

export function GhammadaIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <radialGradient id="ghamGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.45" />
          <stop offset="65%" stopColor="#10B981" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#0B0E14" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tajineCone" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EA580C" />
          <stop offset="100%" stopColor="#9A3412" />
        </linearGradient>
        <linearGradient id="crateTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>

      <circle cx="50" cy="50" r="46" fill="url(#ghamGlow)" />

      {/* 3D Isometric Cube / Crate Base */}
      <polygon points="50,48 80,62 50,76 20,62" fill="url(#crateTop)" />
      <polygon points="20,62 50,76 50,92 20,78" fill="#B45309" />
      <polygon points="80,62 50,76 50,92 80,78" fill="#78350F" />

      {/* Peeking Eyes Under the Tajine Lid! */}
      <ellipse cx="42" cy="54" rx="5.5" ry="4" fill="#0F172A" />
      <ellipse cx="58" cy="54" rx="5.5" ry="4" fill="#0F172A" />
      <circle cx="43" cy="54" r="2.5" fill="#FCD068" />
      <circle cx="59" cy="54" r="2.5" fill="#FCD068" />
      <circle cx="44" cy="53.5" r="1" fill="#FFFFFF" />
      <circle cx="60" cy="53.5" r="1" fill="#FFFFFF" />

      {/* Floating Disguise Tajine Cone Lifted Slightly */}
      <g transform="translate(0, -4)">
        <ellipse cx="50" cy="48" rx="28" ry="8" fill="#7C2D12" stroke="#FDBA74" strokeWidth="1.5" />
        <path d="M 25 46 L 45 20 L 55 20 L 75 46 Z" fill="url(#tajineCone)" stroke="#FDBA74" strokeWidth="1.5" />
        {/* Tajine Top Knob */}
        <ellipse cx="50" cy="18" rx="7" ry="4" fill="#EA580C" stroke="#FCD068" strokeWidth="1.5" />
      </g>

      {/* Sparkle / Question Marks */}
      <text x="16" y="34" fill="#FCD068" fontSize="16" fontWeight="900">
        ؟
      </text>
      <text x="76" y="32" fill="#34D399" fontSize="15" fontWeight="900">
        !
      </text>
    </svg>
  );
}
