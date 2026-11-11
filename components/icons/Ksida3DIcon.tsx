import React from "react";

export function Ksida3DIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="ksidaBg" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="50%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#7c2d12" />
        </linearGradient>
        <linearGradient id="ksidaTaxi" x1="14" y1="26" x2="50" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#991b1b" />
        </linearGradient>
      </defs>

      {/* Rounded Arcade Badge */}
      <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#ksidaBg)" stroke="#fbbf24" strokeWidth="2.5" />

      {/* Crash Starburst Spark Behind Car */}
      <path
        d="M34 10L38 19L48 14L43 24L54 27L44 33L49 42L38 39L32 48L28 38L17 41L22 31L12 25L23 22L19 13L29 18L34 10Z"
        fill="#fef08a"
        fillOpacity="0.92"
      />

      {/* Tilted Drifting Moroccan Petit Taxi Silhouette */}
      <g transform="rotate(-8 32 36)">
        {/* Roof TAXI Sign */}
        <rect x="26" y="20" width="12" height="5" rx="2" fill="#ffffff" stroke="#dc2626" strokeWidth="1.5" />
        {/* Cabin */}
        <path d="M19 32L23 25H41L45 32H19Z" fill="#0f172a" stroke="#fca5a5" strokeWidth="1.5" />
        {/* Car Body */}
        <rect x="13" y="31" width="38" height="12" rx="5" fill="url(#ksidaTaxi)" stroke="#ffffff" strokeWidth="1.5" />
        {/* Headlights & Grille */}
        <circle cx="47" cy="36" r="2.5" fill="#fef08a" />
        <rect x="15" y="35" width="4" height="3" rx="1" fill="#fb7185" />
        {/* Wheels */}
        <circle cx="22" cy="44" r="5" fill="#18181b" stroke="#e2e8f0" strokeWidth="2" />
        <circle cx="42" cy="44" r="5" fill="#18181b" stroke="#e2e8f0" strokeWidth="2" />
      </g>
    </svg>
  );
}
