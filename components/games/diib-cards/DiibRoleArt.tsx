"use client";

import React from "react";
import { DiibCardRole } from "@/games/diib-cards/types";

const PALETTES: Record<
  DiibCardRole,
  {
    bgFrom: string;
    bgVia: string;
    accent: string;
    accentSoft: string;
    glow: string;
  }
> = {
  manager: {
    bgFrom: "#291b06",
    bgVia: "#141019",
    accent: "#fbbf24",
    accentSoft: "#fde68a",
    glow: "rgba(251, 191, 36, 0.34)",
  },
  wolf: {
    bgFrom: "#360a15",
    bgVia: "#180b13",
    accent: "#fb7185",
    accentSoft: "#fecdd3",
    glow: "rgba(244, 63, 94, 0.36)",
  },
  mute_wolf: {
    bgFrom: "#2d0b3a",
    bgVia: "#150c22",
    accent: "#e879f9",
    accentSoft: "#f5d0fe",
    glow: "rgba(217, 70, 239, 0.35)",
  },
  seer: {
    bgFrom: "#151546",
    bgVia: "#0f1229",
    accent: "#818cf8",
    accentSoft: "#c7d2fe",
    glow: "rgba(129, 140, 248, 0.36)",
  },
  witch: {
    bgFrom: "#072e23",
    bgVia: "#0c1b1d",
    accent: "#34d399",
    accentSoft: "#a7f3d0",
    glow: "rgba(52, 211, 153, 0.34)",
  },
  protector: {
    bgFrom: "#08283e",
    bgVia: "#0d1826",
    accent: "#38bdf8",
    accentSoft: "#bae6fd",
    glow: "rgba(56, 189, 248, 0.34)",
  },
  hunter: {
    bgFrom: "#331807",
    bgVia: "#19120f",
    accent: "#fb923c",
    accentSoft: "#fed7aa",
    glow: "rgba(251, 146, 60, 0.34)",
  },
  villager: {
    bgFrom: "#251c0f",
    bgVia: "#13141c",
    accent: "#f59e0b",
    accentSoft: "#fde68a",
    glow: "rgba(245, 158, 11, 0.28)",
  },
};

/**
 * Pure Vector Royal Moroccan Tarot Card Back (Zero external images, 0 KB network cost)
 */
export function DiibCardBackArt() {
  return (
    <div
      className="relative w-full h-full overflow-hidden flex items-center justify-center"
      style={{
        background:
          "radial-gradient(circle at 50% 44%, rgba(245,158,11,0.22) 0%, rgba(16,22,42,0.95) 58%, #090c15 100%)",
      }}
    >
      <svg
        viewBox="0 0 240 340"
        className="w-full h-full"
        fill="none"
        aria-hidden="true"
      >
        {/* Outer Double Filigree Frame */}
        <rect
          x="10"
          y="10"
          width="220"
          height="320"
          rx="20"
          stroke="#F59E0B"
          strokeOpacity="0.45"
          strokeWidth="1.5"
        />
        <rect
          x="16"
          y="16"
          width="208"
          height="308"
          rx="15"
          stroke="#FDE68A"
          strokeOpacity="0.22"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* Corner Moroccan Diamonds */}
        <polygon points="28,28 34,22 40,28 34,34" fill="#F59E0B" fillOpacity="0.55" />
        <polygon points="200,28 206,22 212,28 206,34" fill="#F59E0B" fillOpacity="0.55" />
        <polygon points="28,312 34,306 40,312 34,318" fill="#F59E0B" fillOpacity="0.55" />
        <polygon points="200,312 206,306 212,312 206,318" fill="#F59E0B" fillOpacity="0.55" />

        {/* Moorish Keyhole Arch */}
        <path
          d="M34 282 V126 C34 74 72 42 120 28 C168 42 206 74 206 126 V282"
          stroke="#FBBF24"
          strokeOpacity="0.38"
          strokeWidth="1.6"
        />

        {/* 8-Pointed Moroccan Rub el Hizb Mandala */}
        <g transform="translate(120, 152)">
          <rect
            x="-52"
            y="-52"
            width="104"
            height="104"
            rx="6"
            stroke="#F59E0B"
            strokeOpacity="0.5"
            strokeWidth="1.6"
          />
          <rect
            x="-52"
            y="-52"
            width="104"
            height="104"
            rx="6"
            transform="rotate(45)"
            stroke="#F59E0B"
            strokeOpacity="0.5"
            strokeWidth="1.6"
          />
          <circle r="56" fill="#0B1020" stroke="#FBBF24" strokeWidth="2.2" />
          <circle
            r="48"
            stroke="#FDE68A"
            strokeOpacity="0.45"
            strokeWidth="1"
            strokeDasharray="3 3"
          />

          {/* Golden Crescent Moon */}
          <path
            d="M-8 -34 A36 36 0 1 0 32 18 A28 28 0 1 1 -8 -34 Z"
            fill="#FBBF24"
            fillOpacity="0.92"
          />

          {/* Geometric Wolf Silhouette Inside Moon */}
          <path
            d="M-6 26 L-2 8 L-10 -2 L-2 -8 L2 -22 L10 -12 L20 -18 L18 -4 L26 2 L16 10 L18 26 Z"
            fill="#FDE68A"
          />

          {/* Twinkling Stars */}
          <circle cx="-22" cy="-14" r="2" fill="#FEF3C7" />
          <circle cx="24" cy="-22" r="1.8" fill="#FEF3C7" />
          <circle cx="8" cy="-32" r="1.4" fill="#FEF3C7" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Pure Vector Bespoke Role Tarot Emblem (Zero external images, razor-sharp on iOS/Android)
 */
export function DiibRoleArt({
  role,
  compact = false,
}: {
  role: DiibCardRole;
  compact?: boolean;
}) {
  const pal = PALETTES[role] || PALETTES.villager;

  return (
    <div
      className="relative w-full h-full overflow-hidden flex items-center justify-center"
      style={{
        background: `radial-gradient(circle at 50% 48%, ${pal.glow} 0%, ${pal.bgFrom} 48%, ${pal.bgVia} 82%, #0B0E16 100%)`,
      }}
    >
      <svg
        viewBox="0 0 240 200"
        className={`w-full h-full ${compact ? "scale-105" : ""}`}
        fill="none"
        aria-hidden="true"
      >
        {/* Moroccan Moorish Arch Backdrop */}
        <path
          d="M36 196 V92 C36 46 74 20 120 10 C166 20 204 46 204 92 V196"
          stroke={pal.accent}
          strokeOpacity="0.34"
          strokeWidth="1.8"
        />
        <path
          d="M46 196 V96 C46 56 79 32 120 22 C161 32 194 56 194 96 V196"
          stroke={pal.accentSoft}
          strokeOpacity="0.18"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* Subtle Zellige Star Halo */}
        <g transform="translate(120, 104)" opacity="0.28">
          <rect
            x="-44"
            y="-44"
            width="88"
            height="88"
            stroke={pal.accent}
            strokeWidth="1.2"
          />
          <rect
            x="-44"
            y="-44"
            width="88"
            height="88"
            transform="rotate(45)"
            stroke={pal.accent}
            strokeWidth="1.2"
          />
        </g>

        {/* =======================================================
            BESPOKE ROLE VECTOR ILLUSTRATIONS
           ======================================================= */}
        {role === "manager" && (
          <g transform="translate(120, 104)">
            <circle r="44" fill="#120E07" fillOpacity="0.72" stroke="#FBBF24" strokeWidth="2" />
            {/* Royal 5-Point Moroccan Crown */}
            <path
              d="M-28 8 L-32 -16 L-14 -4 L0 -24 L14 -4 L32 -16 L28 8 Z"
              fill="#F59E0B"
              stroke="#FEF3C7"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <rect x="-28" y="11" width="56" height="8" rx="3" fill="#FBBF24" />
            {/* Crown Jewels */}
            <circle cx="0" cy="-26" r="3.5" fill="#FEF3C7" />
            <circle cx="-32" cy="-18" r="2.8" fill="#FDE68A" />
            <circle cx="32" cy="-18" r="2.8" fill="#FDE68A" />
            {/* Royal Decree Scroll Below */}
            <rect
              x="-24"
              y="24"
              width="48"
              height="9"
              rx="4.5"
              fill="#FDE68A"
              fillOpacity="0.9"
            />
          </g>
        )}

        {role === "wolf" && (
          <g transform="translate(120, 104)">
            {/* Blood Moon */}
            <circle r="45" fill="#4C0519" fillOpacity="0.82" stroke="#FB7185" strokeWidth="2.2" />
            {/* Fierce Geometric Wolf Head */}
            <path
              d="M-28 -30 L-14 -8 L14 -8 L28 -30 L26 4 L34 14 L16 24 L0 36 L-16 24 L-34 14 L-26 4 Z"
              fill="#1F0812"
              stroke="#FDA4AF"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {/* Glowing Crimson Wolf Eyes */}
            <polygon points="-16,2 -5,6 -13,10" fill="#F43F5E" />
            <polygon points="16,2 5,6 13,10" fill="#F43F5E" />
            {/* Fangs / Nose */}
            <polygon points="-5,20 5,20 0,27" fill="#FECDD3" />
          </g>
        )}

        {role === "mute_wolf" && (
          <g transform="translate(120, 104)">
            <circle r="45" fill="#2E073F" fillOpacity="0.82" stroke="#E879F9" strokeWidth="2.2" />
            {/* Shadow Wolf Upper Silhouette */}
            <path
              d="M-26 -30 L-12 -10 L12 -10 L26 -30 L24 0 L-24 0 Z"
              fill="#190726"
              stroke="#F0ABFC"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <polygon points="-14,-2 -5,2 -12,5" fill="#E879F9" />
            <polygon points="14,-2 5,2 12,5" fill="#E879F9" />
            {/* Crossed Silence Chains */}
            <line x1="-32" y1="8" x2="32" y2="24" stroke="#FBBF24" strokeWidth="2.5" strokeDasharray="5 3" />
            <line x1="-32" y1="24" x2="32" y2="8" stroke="#FBBF24" strokeWidth="2.5" strokeDasharray="5 3" />
            {/* Golden Silence Padlock */}
            <path
              d="M-8 10 V4 A8 8 0 0 1 8 4 V10"
              stroke="#FDE68A"
              strokeWidth="3"
              fill="none"
            />
            <rect x="-13" y="10" width="26" height="22" rx="5" fill="#F59E0B" stroke="#FEF3C7" strokeWidth="1.6" />
            <circle cx="0" cy="19" r="2.8" fill="#1E1028" />
            <rect x="-1.4" y="20" width="2.8" height="6" rx="1" fill="#1E1028" />
          </g>
        )}

        {role === "seer" && (
          <g transform="translate(120, 104)">
            {/* Crystal Orb */}
            <circle r="42" fill="#17154A" fillOpacity="0.85" stroke="#818CF8" strokeWidth="2.4" />
            <path
              d="M-26 -16 A32 32 0 0 1 18 -26"
              stroke="#E0E7FF"
              strokeOpacity="0.6"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* Mystic All-Seeing Eye Inside Orb */}
            <path
              d="M-28 0 Q0 -22 28 0 Q0 22 -28 0 Z"
              fill="#0F102E"
              stroke="#C7D2FE"
              strokeWidth="2"
            />
            <circle r="9" fill="#818CF8" />
            <circle r="4" fill="#EEF2FF" />
            {/* Ornate Brass Pedestal */}
            <path
              d="M-22 36 L-14 26 H14 L22 36 Z"
              fill="#F59E0B"
              stroke="#FDE68A"
              strokeWidth="1.5"
            />
          </g>
        )}

        {role === "witch" && (
          <g transform="translate(120, 104)">
            <circle r="45" fill="#06281F" fillOpacity="0.82" stroke="#34D399" strokeWidth="2" />
            {/* Left Flask: Emerald Life Potion */}
            <g transform="translate(-17, 4) rotate(-8)">
              <rect x="-4" y="-26" width="8" height="10" rx="2" fill="#A7F3D0" />
              <path
                d="M-5 -16 L-16 8 A14 14 0 1 0 16 8 L5 -16 Z"
                fill="#064E3B"
                stroke="#34D399"
                strokeWidth="2"
              />
              <circle cx="0" cy="10" r="8" fill="#10B981" fillOpacity="0.85" />
            </g>
            {/* Right Flask: Violet Poison Potion */}
            <g transform="translate(17, 4) rotate(8)">
              <rect x="-4" y="-26" width="8" height="10" rx="2" fill="#F5D0FE" />
              <path
                d="M-5 -16 L-16 8 A14 14 0 1 0 16 8 L5 -16 Z"
                fill="#3B0764"
                stroke="#E879F9"
                strokeWidth="2"
              />
              <circle cx="0" cy="10" r="8" fill="#D946EF" fillOpacity="0.85" />
            </g>
            {/* Arcane Sparkles */}
            <circle cx="-16" cy="-28" r="2.5" fill="#6EE7B7" />
            <circle cx="18" cy="-28" r="2.5" fill="#F0ABFC" />
            <circle cx="0" cy="-34" r="3" fill="#FDE68A" />
          </g>
        )}

        {role === "protector" && (
          <g transform="translate(120, 104)">
            <circle r="45" fill="#082438" fillOpacity="0.82" stroke="#38BDF8" strokeWidth="2" />
            {/* Guardian Moroccan Heater / Buckler Shield */}
            <path
              d="M0 -34 L30 -22 V4 C30 22 16 34 0 40 C-16 34 -30 22 -30 4 V-22 Z"
              fill="#0F3049"
              stroke="#FBBF24"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <path
              d="M0 -25 L21 -16 V3 C21 16 11 26 0 31 C-11 26 -21 16 -21 3 V-16 Z"
              stroke="#7DD3FC"
              strokeWidth="1.5"
            />
            {/* Central Star Boss */}
            <polygon
              points="0,-12 4,-3 14,-3 6,3 9,12 0,7 -9,12 -6,3 -14,-3 -4,-3"
              fill="#FBBF24"
            />
          </g>
        )}

        {role === "hunter" && (
          <g transform="translate(120, 104)">
            {/* Crosshair Target Moon */}
            <circle r="42" fill="#2B1406" fillOpacity="0.85" stroke="#FB923C" strokeWidth="2.2" />
            <circle r="26" stroke="#FED7AA" strokeOpacity="0.65" strokeWidth="1.6" strokeDasharray="6 4" />
            <circle r="10" fill="#FB923C" fillOpacity="0.25" stroke="#FB923C" strokeWidth="2" />
            <circle r="3.5" fill="#FEF3C7" />
            {/* Crosshair Ticks */}
            <line x1="0" y1="-48" x2="0" y2="-30" stroke="#FDBA74" strokeWidth="2.4" strokeLinecap="round" />
            <line x1="0" y1="30" x2="0" y2="48" stroke="#FDBA74" strokeWidth="2.4" strokeLinecap="round" />
            <line x1="-48" y1="0" x2="-30" y2="0" stroke="#FDBA74" strokeWidth="2.4" strokeLinecap="round" />
            <line x1="30" y1="0" x2="48" y2="0" stroke="#FDBA74" strokeWidth="2.4" strokeLinecap="round" />
            {/* Diagonal Flintlock Barrel Accent */}
            <line x1="-30" y1="28" x2="28" y2="-28" stroke="#FDE68A" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}

        {role === "villager" && (
          <g transform="translate(120, 104)">
            <circle r="44" fill="#231A0D" fillOpacity="0.82" stroke="#F59E0B" strokeWidth="2" />
            {/* Warm Moroccan Fanous Lantern */}
            <circle cx="0" cy="-32" r="4" stroke="#FBBF24" strokeWidth="2" />
            <path d="M-12 -22 L0 -30 L12 -22 Z" fill="#F59E0B" />
            <rect
              x="-14"
              y="-22"
              width="28"
              height="40"
              rx="5"
              fill="#451A03"
              stroke="#FBBF24"
              strokeWidth="2.2"
            />
            {/* Glowing Inner Flame */}
            <path
              d="M0 -12 C7 -2 8 8 0 12 C-8 8 -7 -2 0 -12 Z"
              fill="#FDE68A"
            />
            <rect x="-18" y="18" width="36" height="6" rx="3" fill="#F59E0B" />
          </g>
        )}
      </svg>
    </div>
  );
}
