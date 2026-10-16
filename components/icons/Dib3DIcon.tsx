import React from "react";

export function Dib3DIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <radialGradient id="dib3dGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#8B5CF6" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#090D16" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wolfFur3D" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="50%" stopColor="#0F172A" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>
      </defs>

      <circle cx="50" cy="50" r="46" fill="url(#dib3dGlow)" />

      {/* 3D Isometric Cobblestone Derb Platform */}
      <polygon points="50,62 84,76 50,90 16,76" fill="#1E293B" stroke="#38BDF8" strokeWidth="1.5" />
      <polygon points="16,76 50,90 50,96 16,82" fill="#0F172A" />
      <polygon points="84,76 50,90 50,96 84,82" fill="#020617" />

      {/* Glowing Sewer Vent Grate on Platform */}
      <ellipse cx="50" cy="76" rx="14" ry="5.5" fill="#090D16" stroke="#A855F7" strokeWidth="1.8" />

      {/* Full Blood Moon Behind Wolf */}
      <circle cx="50" cy="36" r="22" fill="#BE123C" opacity="0.85" />
      <circle cx="50" cy="36" r="19" fill="#F43F5E" opacity="0.5" />

      {/* 3D Stylized Wolf Head Emerging in the Derb */}
      <polygon points="28,42 22,16 40,28" fill="#1E293B" stroke="#FB7185" strokeWidth="1.5" />
      <polygon points="72,42 78,16 60,28" fill="#1E293B" stroke="#FB7185" strokeWidth="1.5" />
      <polygon
        points="50,18 74,38 66,64 50,74 34,64 26,38"
        fill="url(#wolfFur3D)"
        stroke="#F43F5E"
        strokeWidth="2"
      />

      {/* Glowing Red Predator Eyes */}
      <polygon points="35,42 46,46 37,49" fill="#FF0040" />
      <polygon points="65,42 54,46 63,49" fill="#FF0040" />
      <circle cx="40" cy="45" r="1.5" fill="#FFFFFF" />
      <circle cx="60" cy="45" r="1.5" fill="#FFFFFF" />

      {/* Moroccan Fanoos Lantern Floating Top-Right */}
      <circle cx="82" cy="24" r="6" fill="#FACC15" opacity="0.9" />
      <text x="12" y="28" fill="#38BDF8" fontSize="13" fontWeight="900">
        3D
      </text>
    </svg>
  );
}
