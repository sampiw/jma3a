import React from "react";

export function MettelhaIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="maskGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <linearGradient id="maskSilver" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E2E8F0" />
          <stop offset="100%" stopColor="#64748B" />
        </linearGradient>
      </defs>
      {/* Background Stage Glow */}
      <circle cx="50" cy="50" r="44" fill="#311F1D" opacity="0.6" />
      {/* Comedy Mask (Smiling) */}
      <path
        d="M22 32 C22 22 46 22 46 32 C46 54 22 54 22 32 Z"
        fill="url(#maskGold)"
        stroke="#FCD068"
        strokeWidth="2"
      />
      <circle cx="30" cy="32" r="3" fill="#1A130B" />
      <circle cx="38" cy="32" r="3" fill="#1A130B" />
      <path d="M28 42 Q34 48 40 42" stroke="#1A130B" strokeWidth="2.5" strokeLinecap="round" />

      {/* Drama Mask (Tragic/Surprised) */}
      <path
        d="M54 44 C54 34 78 34 78 44 C78 66 54 66 54 44 Z"
        fill="url(#maskSilver)"
        stroke="#CBD5E1"
        strokeWidth="2"
      />
      <circle cx="62" cy="44" r="3" fill="#0F172A" />
      <circle cx="70" cy="44" r="3" fill="#0F172A" />
      <path d="M63 56 Q66 50 69 56" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
