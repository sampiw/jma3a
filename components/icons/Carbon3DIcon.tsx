import React from "react";

export function Carbon3DIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="carbonHelmetGrad" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="55%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>
        <linearGradient id="carbonVisorGrad" x1="14" y1="26" x2="50" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#f43f5e" />
        </linearGradient>
        <linearGradient id="carbonRingGrad" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* Outer Tactical Crosshair Ring */}
      <circle cx="32" cy="32" r="28" stroke="url(#carbonRingGrad)" strokeWidth="2.2" strokeDasharray="10 5" />
      <path d="M32 2V9M32 55V62M2 32H9M55 32H62" stroke="#22d3ee" strokeWidth="2.4" strokeLinecap="round" />

      {/* Angular Cyber-Striker Helmet */}
      <path
        d="M20 14L32 10L44 14L50 26L47 45L38 53H26L17 45L14 26L20 14Z"
        fill="url(#carbonHelmetGrad)"
        stroke="#475569"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Center Crest */}
      <path d="M29 10H35L34 22H30L29 10Z" fill="#22d3ee" fillOpacity="0.85" />

      {/* Panoramic Glowing Cyber Visor */}
      <path
        d="M17 26L32 30L47 26L45 35L32 38L19 35L17 26Z"
        fill="url(#carbonVisorGrad)"
      />
      <path
        d="M20 28.5L32 31.5L44 28.5"
        stroke="#ffffff"
        strokeWidth="1.4"
        strokeOpacity="0.8"
        strokeLinecap="round"
      />

      {/* Respirator / Jaw Vents */}
      <path d="M26 43H38L36 49H28L26 43Z" fill="#334155" />
      <circle cx="23" cy="45" r="1.8" fill="#f43f5e" />
      <circle cx="41" cy="45" r="1.8" fill="#22d3ee" />
    </svg>
  );
}
