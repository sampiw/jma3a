import React from "react";

export function Mamnou3Icon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="shieldRed" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EF4444" />
          <stop offset="100%" stopColor="#991B1B" />
        </linearGradient>
        <radialGradient id="buzzerCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FCA5A5" />
          <stop offset="100%" stopColor="#DC2626" />
        </radialGradient>
      </defs>
      {/* Octagonal Stop Sign / Buzzer Base */}
      <polygon
        points="30,14 70,14 86,30 86,70 70,86 30,86 14,70 14,30"
        fill="url(#shieldRed)"
        stroke="#FCA5A5"
        strokeWidth="3"
      />
      {/* Inner Ring */}
      <circle cx="50" cy="50" r="28" fill="#1C1917" stroke="#EF4444" strokeWidth="2" />
      {/* Buzzer Center Light */}
      <circle cx="50" cy="50" r="16" fill="url(#buzzerCore)" />
      {/* Forbidden Diagonal Cross */}
      <line x1="36" y1="36" x2="64" y2="64" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
      <line x1="64" y1="36" x2="36" y2="64" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
