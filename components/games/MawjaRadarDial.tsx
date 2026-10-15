"use client";

import React, { useRef, useCallback } from "react";
import { MawjaScoreZone } from "@/games/mawja/types";

export interface PlottedNeedle {
  playerId: string;
  nickname: string;
  value: number;
  doubleDown?: boolean;
  zone?: MawjaScoreZone;
  isMe?: boolean;
}

interface MawjaRadarDialProps {
  /** Left pole (0%) */
  leftLabel: string;
  /** Right pole (100%) */
  rightLabel: string;
  /** Current needle value (0..100) for interactive tuning or single preview */
  value?: number;
  /** Callback when user drags or adjusts the needle */
  onChange?: (newValue: number) => void;
  /** Whether the user can drag/adjust the dial */
  interactive?: boolean;
  /** Secret target center (0..100). Only provided to Transmitter or during ROUND_REVEAL */
  targetValue?: number | null;
  /** Whether to reveal the target zones on the radar */
  showTarget?: boolean;
  /** Multiple player needles to render during ROUND_REVEAL */
  plottedNeedles?: PlottedNeedle[];
  /** Subtitle badge inside the radar hub */
  statusLabel?: string;
}

const CX = 200;
const CY = 198;
const R_OUTER = 166;
const R_INNER = 58;

// Scoring zone radii (in percentage units, matching engine.ts)
const BULLSEYE_HALF = 4; // ±4% (4 pts)
const INNER_HALF = 11;   // ±11% (3 pts)
const OUTER_HALF = 19;   // ±19% (2 pts)

function valueToPoint(val: number, radius: number): { x: number; y: number } {
  const clamped = Math.max(0, Math.min(100, val));
  const theta = Math.PI * (1 - clamped / 100);
  return {
    x: CX + radius * Math.cos(theta),
    y: CY - radius * Math.sin(theta),
  };
}

function buildSectorPath(vStart: number, vEnd: number, rOuter = R_OUTER, rInner = R_INNER): string {
  const s = Math.max(0, Math.min(100, vStart));
  const e = Math.max(0, Math.min(100, vEnd));
  if (e <= s) return "";

  const p1 = valueToPoint(s, rOuter);
  const p2 = valueToPoint(e, rOuter);
  const p3 = valueToPoint(e, rInner);
  const p4 = valueToPoint(s, rInner);

  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 0 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

const NEEDLE_COLORS = [
  "#22D3EE", // Cyan
  "#F472B6", // Pink
  "#A78BFA", // Purple
  "#34D399", // Emerald
  "#FB923C", // Orange
  "#FACC15", // Yellow
  "#60A5FA", // Blue
  "#F87171", // Red
];

export function MawjaRadarDial({
  leftLabel,
  rightLabel,
  value = 50,
  onChange,
  interactive = false,
  targetValue = null,
  showTarget = false,
  plottedNeedles = [],
  statusLabel,
}: MawjaRadarDialProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const isDraggingRef = useRef(false);

  const updateFromClientPos = useCallback(
    (clientX: number, clientY: number) => {
      if (!interactive || !onChange || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const svgX = ((clientX - rect.left) / rect.width) * 400;
      const svgY = ((clientY - rect.top) / rect.height) * 235;

      const dx = svgX - CX;
      const dy = Math.max(0, CY - svgY);
      const angle = Math.atan2(dy, dx); // 0..PI
      const nextVal = Math.round((1 - angle / Math.PI) * 100);
      const clamped = Math.max(0, Math.min(100, nextVal));
      onChange(clamped);
    },
    [interactive, onChange]
  );

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClientPos(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || !isDraggingRef.current) return;
    updateFromClientPos(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const adjustBy = (delta: number) => {
    if (!interactive || !onChange) return;
    const next = Math.max(0, Math.min(100, value + delta));
    onChange(next);
  };

  // Precompute ticks every 10%
  const ticks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  // Primary needle tip
  const mainTip = valueToPoint(value, R_OUTER - 8);
  const mainBase = valueToPoint(value, R_INNER - 8);

  return (
    <div className="w-full select-none" dir="ltr">
      {/* Pole Cards Header (0% on Left, 100% on Right) */}
      <div className="grid grid-cols-2 gap-3 mb-2">
        <div className="rounded-2xl bg-gradient-to-br from-cyan-950/80 to-slate-900/90 border border-cyan-500/40 p-3 text-left shadow-lg">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-cyan-400 mb-1">
            <span>0% • أقصى اليسار</span>
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">قطب A</span>
          </div>
          <p className="text-sm sm:text-base font-black text-white leading-snug" dir="rtl">
            {leftLabel}
          </p>
        </div>

        <div className="rounded-2xl bg-gradient-to-bl from-pink-950/80 to-slate-900/90 border border-pink-500/40 p-3 text-right shadow-lg">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-pink-400 mb-1">
            <span className="px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300">قطب B</span>
            <span>100% • أقصى اليمين</span>
          </div>
          <p className="text-sm sm:text-base font-black text-white leading-snug" dir="rtl">
            {rightLabel}
          </p>
        </div>
      </div>

      {/* Main Semicircular Radar SVG */}
      <div className="relative w-full max-w-[440px] mx-auto">
        <svg
          ref={svgRef}
          viewBox="0 0 400 235"
          className={`w-full h-auto overflow-visible ${
            interactive ? "cursor-grab active:cursor-grabbing touch-none" : ""
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <defs>
            <linearGradient id="radarTrackBg" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#083344" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#1E1B4B" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#500724" stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id="radarRimGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06B6D4" />
              <stop offset="50%" stopColor="#A855F7" />
              <stop offset="100%" stopColor="#EC4899" />
            </linearGradient>
            <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#0F172A" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Outer Ambient Halo */}
          <circle cx={CX} cy={CY} r={R_OUTER + 14} fill="url(#hubGlow)" />

          {/* Main Radar Semicircle Track */}
          <path
            d={buildSectorPath(0, 100, R_OUTER, R_INNER)}
            fill="url(#radarTrackBg)"
            stroke="url(#radarRimGrad)"
            strokeWidth="2.5"
          />

          {/* Concentric Radar Grid Arcs */}
          {[0.35, 0.65].map((ratio, idx) => {
            const rGrid = R_INNER + (R_OUTER - R_INNER) * ratio;
            const leftPt = valueToPoint(0, rGrid);
            const rightPt = valueToPoint(100, rGrid);
            return (
              <path
                key={idx}
                d={`M ${leftPt.x} ${leftPt.y} A ${rGrid} ${rGrid} 0 0 1 ${rightPt.x} ${rightPt.y}`}
                fill="none"
                stroke="#475569"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.45"
              />
            );
          })}

          {/* Encrypted Shield Pattern when target is hidden */}
          {!showTarget && (
            <g opacity="0.28">
              {[20, 35, 50, 65, 80].map((v) => {
                const pIn = valueToPoint(v, R_INNER + 4);
                const pOut = valueToPoint(v, R_OUTER - 4);
                return (
                  <line
                    key={v}
                    x1={pIn.x}
                    y1={pIn.y}
                    x2={pOut.x}
                    y2={pOut.y}
                    stroke="#38BDF8"
                    strokeWidth="1"
                    strokeDasharray="3 5"
                  />
                );
              })}
            </g>
          )}

          {/* Target Scoring Zones (Visible to Transmitter or during ROUND_REVEAL) */}
          {showTarget && typeof targetValue === "number" && (
            <g>
              {/* Outer Zone (±19% -> 2 pts) */}
              <path
                d={buildSectorPath(targetValue - OUTER_HALF, targetValue + OUTER_HALF)}
                fill="#3B82F6"
                fillOpacity="0.32"
                stroke="#60A5FA"
                strokeWidth="1"
              />
              {/* Inner Zone (±11% -> 3 pts) */}
              <path
                d={buildSectorPath(targetValue - INNER_HALF, targetValue + INNER_HALF)}
                fill="#F59E0B"
                fillOpacity="0.48"
                stroke="#FBBF24"
                strokeWidth="1.2"
              />
              {/* Bullseye Zone (±4% -> 4 pts) */}
              <path
                d={buildSectorPath(targetValue - BULLSEYE_HALF, targetValue + BULLSEYE_HALF)}
                fill="#10B981"
                fillOpacity="0.82"
                stroke="#A7F3D0"
                strokeWidth="2"
              />

              {/* Exact Target Center Line & Badge */}
              {(() => {
                const exactInner = valueToPoint(targetValue, R_INNER);
                const exactOuter = valueToPoint(targetValue, R_OUTER + 10);
                const badgePos = valueToPoint(targetValue, R_OUTER + 22);
                return (
                  <g>
                    <line
                      x1={exactInner.x}
                      y1={exactInner.y}
                      x2={exactOuter.x}
                      y2={exactOuter.y}
                      stroke="#ECFDF5"
                      strokeWidth="2.5"
                      strokeDasharray="3 2"
                    />
                    <rect
                      x={badgePos.x - 22}
                      y={badgePos.y - 10}
                      width="44"
                      height="20"
                      rx="6"
                      fill="#059669"
                      stroke="#A7F3D0"
                      strokeWidth="1.5"
                    />
                    <text
                      x={badgePos.x}
                      y={badgePos.y + 4}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="10"
                      fontWeight="900"
                    >
                      🎯 {targetValue}%
                    </text>
                  </g>
                );
              })()}
            </g>
          )}

          {/* Percentage Tick Marks & Labels along Outer Rim */}
          {ticks.map((t) => {
            const isMajor = t % 50 === 0 || t === 50;
            const p1 = valueToPoint(t, R_OUTER - (isMajor ? 10 : 6));
            const p2 = valueToPoint(t, R_OUTER);
            const labelPt = valueToPoint(t, R_OUTER + 13);
            return (
              <g key={t}>
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={isMajor ? "#F8FAFC" : "#94A3B8"}
                  strokeWidth={isMajor ? "2" : "1.2"}
                  opacity={isMajor ? "0.9" : "0.5"}
                />
                {t % 20 === 0 && (
                  <text
                    x={labelPt.x}
                    y={labelPt.y + 3}
                    textAnchor="middle"
                    fill="#94A3B8"
                    fontSize="9"
                    fontWeight="700"
                  >
                    {t}%
                  </text>
                )}
              </g>
            );
          })}

          {/* Multi-Player Needles (During ROUND_REVEAL) */}
          {plottedNeedles.map((needle, idx) => {
            const color = needle.isMe
              ? "#FCD068"
              : NEEDLE_COLORS[idx % NEEDLE_COLORS.length];
            const nBase = valueToPoint(needle.value, R_INNER - 4);
            const nTip = valueToPoint(needle.value, R_OUTER - 12);
            // Stagger label radii slightly so overlapping guesses stay readable
            const labelRadius = R_INNER + 38 + ((idx % 3) * 28);
            const nLabel = valueToPoint(needle.value, labelRadius);

            return (
              <g key={needle.playerId}>
                <line
                  x1={nBase.x}
                  y1={nBase.y}
                  x2={nTip.x}
                  y2={nTip.y}
                  stroke={color}
                  strokeWidth={needle.isMe ? "4" : "3"}
                  strokeLinecap="round"
                />
                <circle
                  cx={nTip.x}
                  cy={nTip.y}
                  r={needle.isMe ? "6" : "4.5"}
                  fill={color}
                  stroke="#0F172A"
                  strokeWidth="1.5"
                />
                {/* Player Tag Pill on Needle */}
                <g transform={`translate(${nLabel.x}, ${nLabel.y})`}>
                  <rect
                    x="-34"
                    y="-10"
                    width="68"
                    height="20"
                    rx="10"
                    fill="#0F172A"
                    fillOpacity="0.92"
                    stroke={color}
                    strokeWidth="1.5"
                  />
                  <text
                    x="0"
                    y="3.5"
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="8.5"
                    fontWeight="800"
                  >
                    {needle.doubleDown ? "🔥" : ""}
                    {needle.nickname.slice(0, 7)} {needle.value}%
                  </text>
                </g>
              </g>
            );
          })}

          {/* Primary Interactive Needle (Shown when tuning or when no plotted needles) */}
          {plottedNeedles.length === 0 && (
            <g>
              {/* Needle Glow Shadow */}
              <line
                x1={mainBase.x}
                y1={mainBase.y}
                x2={mainTip.x}
                y2={mainTip.y}
                stroke="#22D3EE"
                strokeWidth="8"
                strokeLinecap="round"
                opacity="0.25"
              />
              {/* Main Needle Arm */}
              <line
                x1={mainBase.x}
                y1={mainBase.y}
                x2={mainTip.x}
                y2={mainTip.y}
                stroke="#FCD068"
                strokeWidth="4.5"
                strokeLinecap="round"
              />
              {/* Draggable Handle Circle on Arc */}
              <circle
                cx={mainTip.x}
                cy={mainTip.y}
                r={interactive ? "11" : "7"}
                fill="#0F172A"
                stroke="#FCD068"
                strokeWidth="3"
              />
              <circle cx={mainTip.x} cy={mainTip.y} r="4" fill="#22D3EE" />
            </g>
          )}

          {/* Center Radar Pivot Hub */}
          <path
            d={`M ${CX - R_INNER} ${CY} A ${R_INNER} ${R_INNER} 0 0 1 ${CX + R_INNER} ${CY} Z`}
            fill="#0B0F19"
            stroke="#334155"
            strokeWidth="2"
          />

          {/* Live Readout Inside Hub */}
          <text
            x={CX}
            y={CY - 22}
            textAnchor="middle"
            fill="#FCD068"
            fontSize="24"
            fontWeight="900"
          >
            {showTarget && typeof targetValue === "number" && plottedNeedles.length > 0
              ? `🎯 ${targetValue}%`
              : `${value}%`}
          </text>
          <text
            x={CX}
            y={CY - 5}
            textAnchor="middle"
            fill="#94A3B8"
            fontSize="9.5"
            fontWeight="700"
          >
            {statusLabel || (interactive ? "جرّ المؤشر أو قيّس التردد" : "تردد الموجة")}
          </text>
        </svg>
      </div>

      {/* Interactive Precision Controls (Slider + Fine-Tune Buttons) */}
      {interactive && onChange && (
        <div className="mt-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-3 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-black text-cyan-400 w-9 text-left">0%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={value}
              onChange={(e) => onChange(Number(e.target.value))}
              className="w-full h-2.5 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <span className="text-xs font-black text-pink-400 w-10 text-right">100%</span>
          </div>

          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() => adjustBy(-5)}
              className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-black text-xs border border-slate-700 active:scale-95 transition-all"
            >
              -5%
            </button>
            <button
              type="button"
              onClick={() => adjustBy(-1)}
              className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-200 font-bold text-xs border border-slate-700 active:scale-95 transition-all"
            >
              -1%
            </button>
            <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-black text-xs text-center min-w-[74px]">
              {value}%
            </div>
            <button
              type="button"
              onClick={() => adjustBy(1)}
              className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-pink-200 font-bold text-xs border border-slate-700 active:scale-95 transition-all"
            >
              +1%
            </button>
            <button
              type="button"
              onClick={() => adjustBy(5)}
              className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-pink-300 font-black text-xs border border-slate-700 active:scale-95 transition-all"
            >
              +5%
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
