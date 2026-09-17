import React from "react";

export function MissionIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="envBody" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>
        <radialGradient id="waxSeal" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#DC2626" />
          <stop offset="100%" stopColor="#7F1D1D" />
        </radialGradient>
      </defs>
      {/* Background glow */}
      <circle cx="50" cy="50" r="44" fill="#172554" opacity="0.4" />
      {/* Secret Envelope Body */}
      <rect x="16" y="28" width="68" height="48" rx="4" fill="url(#envBody)" stroke="#475569" strokeWidth="2" />
      {/* Envelope Flap Lines */}
      <path d="M16 30 L50 56 L84 30" stroke="#64748B" strokeWidth="2" fill="none" />
      <path d="M16 74 L42 50" stroke="#334155" strokeWidth="1.5" />
      <path d="M84 74 L58 50" stroke="#334155" strokeWidth="1.5" />
      {/* Red Wax Seal */}
      <circle cx="50" cy="54" r="12" fill="url(#waxSeal)" stroke="#EF4444" strokeWidth="1.5" />
      {/* Moroccan Star Impress on Wax Seal */}
      <polygon
        points="50,47 52,52 57,52 53,55 55,60 50,57 45,60 47,55 43,52 48,52"
        fill="#FEF2F2"
      />
    </svg>
  );
}
