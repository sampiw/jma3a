import React from "react";

export function DibWolfIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <radialGradient id="wolfMoon" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#D94A38" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#0B0E14" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wolfFur" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2A3342" />
          <stop offset="100%" stopColor="#141923" />
        </linearGradient>
        <linearGradient id="goldGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FCD068" />
          <stop offset="100%" stopColor="#E5A93B" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#wolfMoon)" />
      {/* Ears */}
      <polygon points="26,16 36,36 18,34" fill="#3F4D63" />
      <polygon points="74,16 64,36 82,34" fill="#3F4D63" />
      <polygon points="28,20 34,34 22,32" fill="#D94A38" opacity="0.7" />
      <polygon points="72,20 66,34 78,32" fill="#D94A38" opacity="0.7" />
      {/* Head */}
      <polygon points="50,22 72,44 76,64 50,88 24,64 28,44" fill="url(#wolfFur)" stroke="#4E5D78" strokeWidth="2" />
      {/* Brow & Cheeks */}
      <polygon points="50,38 66,48 50,60 34,48" fill="#1C2331" />
      {/* Glowing Eyes */}
      <polygon points="34,46 44,48 38,54" fill="url(#goldGlow)" />
      <polygon points="66,46 56,48 62,54" fill="url(#goldGlow)" />
      <circle cx="38" cy="49" r="1.5" fill="#FFF" />
      <circle cx="62" cy="49" r="1.5" fill="#FFF" />
      {/* Snout & Nose */}
      <polygon points="50,60 58,74 50,84 42,74" fill="#10141D" />
      <polygon points="50,78 54,82 46,82" fill="#D94A38" />
    </svg>
  );
}
