import React from "react";

export function Simsar3DIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="simsarBg" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="48%" stopColor="#047857" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="simsarGold" x1="16" y1="10" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>

      {/* Luxury Zellige Emerald & Gold Rounded Tile */}
      <rect
        x="4"
        y="4"
        width="56"
        height="56"
        rx="16"
        fill="url(#simsarBg)"
        stroke="#fbbf24"
        strokeWidth="2.5"
      />

      {/* Moroccan Riad Arch & Hotel Silhouette */}
      <path
        d="M14 48V28L23 21L32 28V48H14Z"
        fill="#064e3b"
        stroke="#6ee7b7"
        strokeWidth="1.6"
      />
      <path
        d="M19 48V35C19 32.8 20.8 31 23 31C25.2 31 27 32.8 27 35V48H19Z"
        fill="#fbbf24"
      />

      {/* Golden Royal Crown Above Riad */}
      <path
        d="M15 18L19 22L23 15L27 22L31 18L29 24H17L15 18Z"
        fill="url(#simsarGold)"
        stroke="#ffffff"
        strokeWidth="1"
      />

      {/* 3D Isometric Tumbling Ivory Die */}
      <g transform="translate(30, 22) rotate(11)">
        <rect
          x="2"
          y="2"
          width="22"
          height="22"
          rx="5"
          fill="#fffbeb"
          stroke="#f59e0b"
          strokeWidth="2"
        />
        <circle cx="8" cy="8" r="2" fill="#dc2626" />
        <circle cx="13" cy="13" r="2.2" fill="#dc2626" />
        <circle cx="18" cy="18" r="2" fill="#dc2626" />
        <circle cx="18" cy="8" r="1.8" fill="#0f172a" />
        <circle cx="8" cy="18" r="1.8" fill="#0f172a" />
      </g>
    </svg>
  );
}
