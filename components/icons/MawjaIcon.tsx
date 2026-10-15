import React from "react";

export function MawjaIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <radialGradient id="mawjaAura" cx="50%" cy="65%" r="55%">
          <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#8B5CF6" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#0B0E14" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mawjaArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06B6D4" />
          <stop offset="50%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
        <linearGradient id="mawjaNeedle" x1="50%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stopColor="#FCD068" />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>

      {/* Background Ambient Glow */}
      <circle cx="50" cy="52" r="46" fill="url(#mawjaAura)" />

      {/* Outer Semicircle Radar Track */}
      <path
        d="M 14 70 A 36 36 0 0 1 86 70"
        stroke="url(#mawjaArcGrad)"
        strokeWidth="7"
        strokeLinecap="round"
        opacity="0.9"
      />

      {/* Inner Radar Rings */}
      <path
        d="M 24 70 A 26 26 0 0 1 76 70"
        stroke="#38BDF8"
        strokeWidth="1.75"
        strokeDasharray="3 3"
        opacity="0.55"
      />
      <path
        d="M 34 70 A 16 16 0 0 1 66 70"
        stroke="#FCD068"
        strokeWidth="1.5"
        opacity="0.45"
      />

      {/* Target Bullseye Sector Highlight */}
      <path
        d="M 50 70 L 58 35 A 36 36 0 0 1 72 41 Z"
        fill="#F59E0B"
        opacity="0.35"
      />

      {/* Sine Wave Pulse Across Base */}
      <path
        d="M 12 78 Q 22 70, 31 78 T 50 78 T 69 78 T 88 78"
        stroke="#22D3EE"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />

      {/* Radar Needle Pointing into Target */}
      <line
        x1="50"
        y1="70"
        x2="64"
        y2="34"
        stroke="url(#mawjaNeedle)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Glowing Pivot Hub */}
      <circle cx="50" cy="70" r="7" fill="#0F172A" stroke="#FCD068" strokeWidth="2.5" />
      <circle cx="50" cy="70" r="3" fill="#22D3EE" />

      {/* Signal Sparkles */}
      <circle cx="64" cy="34" r="3" fill="#FCD068" />
      <circle cx="64" cy="34" r="6" stroke="#FCD068" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}
