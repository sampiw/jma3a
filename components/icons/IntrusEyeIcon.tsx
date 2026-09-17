import React from "react";

export function IntrusEyeIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="intrusGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      {/* Target scope / Prism */}
      <circle cx="50" cy="50" r="44" stroke="#1F2937" strokeWidth="2" strokeDasharray="4 4" />
      <circle cx="50" cy="50" r="34" stroke="url(#intrusGlow)" strokeWidth="3" opacity="0.8" />
      {/* Spy Trenchcoat Silhouette */}
      <path d="M50 18 C30 18 18 36 18 50 C18 64 30 82 50 82 C70 82 82 64 82 50 C82 36 70 18 50 18 Z" stroke="#374151" strokeWidth="2" />
      {/* Eye Aperture */}
      <path d="M26 50 Q50 30 74 50 Q50 70 26 50 Z" fill="#111827" stroke="url(#intrusGlow)" strokeWidth="2" />
      {/* Glowing Iris */}
      <circle cx="50" cy="50" r="12" fill="url(#intrusGlow)" />
      <circle cx="50" cy="50" r="6" fill="#000" />
      <circle cx="47" cy="47" r="2.5" fill="#FFF" />
      {/* Crosshairs */}
      <line x1="50" y1="12" x2="50" y2="24" stroke="#10B981" strokeWidth="2" />
      <line x1="50" y1="76" x2="50" y2="88" stroke="#10B981" strokeWidth="2" />
      <line x1="12" y1="50" x2="24" y2="50" stroke="#10B981" strokeWidth="2" />
      <line x1="76" y1="50" x2="88" y2="50" stroke="#10B981" strokeWidth="2" />
    </svg>
  );
}
