import React from "react";

export function Pirates3DIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="piratesBg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="50%" stopColor="#0369a1" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="sailGrad" x1="18" y1="10" x2="46" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="hullGrad" x1="12" y1="38" x2="52" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#92400e" />
          <stop offset="100%" stopColor="#451a03" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#piratesBg)" stroke="#38bdf8" strokeWidth="2.5" />

      {/* Mast */}
      <rect x="30.5" y="10" width="3" height="32" rx="1" fill="#78350f" />

      {/* Billowing Corsair Sail */}
      <path
        d="M19 15C27 12 37 12 45 15C48 23 48 30 44 36C36 34 28 34 20 36C16 30 16 23 19 15Z"
        fill="url(#sailGrad)"
        stroke="#b45309"
        strokeWidth="1.8"
      />

      {/* Crimson Crossed Sabre / Star Emblem on Sail */}
      <circle cx="32" cy="25" r="5" fill="#e11d48" />
      <circle cx="32" cy="25" r="2.2" fill="#fef08a" />

      {/* Top Pennant Flag */}
      <path d="M33 10L44 12.5L33 15V10Z" fill="#ef4444" />

      {/* Galleon Wooden Hull with Cannons */}
      <path
        d="M11 39H53L47 50H17L11 39Z"
        fill="url(#hullGrad)"
        stroke="#facc15"
        strokeWidth="1.8"
      />
      <circle cx="22" cy="44.5" r="2.2" fill="#1e293b" stroke="#facc15" strokeWidth="1" />
      <circle cx="32" cy="44.5" r="2.2" fill="#1e293b" stroke="#facc15" strokeWidth="1" />
      <circle cx="42" cy="44.5" r="2.2" fill="#1e293b" stroke="#facc15" strokeWidth="1" />

      {/* Ocean Waves */}
      <path
        d="M8 52C14 49 18 55 24 52C30 49 34 55 40 52C46 49 50 55 56 52"
        stroke="#7dd3fc"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default Pirates3DIcon;
