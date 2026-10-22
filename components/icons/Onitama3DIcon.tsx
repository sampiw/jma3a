import React from "react";

export function Onitama3DIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <radialGradient id="onitamaGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.6" />
          <stop offset="55%" stopColor="#EF4444" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#090D16" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="goldKingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="50%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
      </defs>

      <circle cx="50" cy="50" r="46" fill="url(#onitamaGlow)" />

      {/* Floating Onitama Martial Arts Scroll Card Behind */}
      <g transform="rotate(-12 30 34)">
        <rect
          x="12"
          y="16"
          width="32"
          height="24"
          rx="4"
          fill="#1E293B"
          stroke="#F43F5E"
          strokeWidth="1.8"
        />
        <rect x="25" y="25" width="5" height="5" fill="#FACC15" />
        <rect x="19" y="19" width="5" height="5" fill="#F43F5E" />
        <rect x="31" y="19" width="5" height="5" fill="#F43F5E" />
      </g>

      {/* 3D Isometric Chess & Onitama Board Base */}
      <polygon
        points="50,58 88,74 50,90 12,74"
        fill="#0F172A"
        stroke="#FBBF24"
        strokeWidth="2"
      />
      <polygon points="12,74 50,90 50,96 12,80" fill="#78350F" />
      <polygon points="88,74 50,90 50,96 88,80" fill="#451A03" />

      {/* Checkered 3D Tiles */}
      <polygon points="50,62 67,69 50,76 33,69" fill="#1E293B" stroke="#38BDF8" strokeWidth="1" />
      <polygon points="50,66 60,70 50,74 40,70" fill="#10B981" opacity="0.55" />

      {/* 3D Sculpted Royal Chess King / Onitama Master Piece */}
      <ellipse cx="54" cy="69" rx="13" ry="5" fill="#B45309" stroke="#FEF08A" strokeWidth="1.5" />
      <path
        d="M44 68 L48 38 L60 38 L64 68 Z"
        fill="url(#goldKingGrad)"
        stroke="#FEF08A"
        strokeWidth="1.8"
      />
      <ellipse cx="54" cy="36" rx="9" ry="3.5" fill="#FDE047" stroke="#B45309" strokeWidth="1.4" />
      {/* Crown Cross / Temple Finial */}
      <path d="M54 21 L54 33 M49 26 L59 26" stroke="#FEF08A" strokeWidth="3" strokeLinecap="round" />

      <text x="68" y="28" fill="#FBBF24" fontSize="13" fontWeight="900">
        3D
      </text>
    </svg>
  );
}
