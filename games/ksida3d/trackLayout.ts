import { KsidaCratePad, KsidaMode } from "./types";

export const TRACK_SAMPLES = 96;
export const TRACK_HALF_WIDTH = 9.6; // 19.2m wide highway!
export const RONDA_PLAZA_RADIUS = 17.5; // 35m central Figure-8 crash intersection!
export const DERBY_ARENA_RADIUS = 36.0; // 72m stadium bowl for DERBY & HOT_BOMB!
export const CAR_COLLISION_RADIUS = 1.32;

export interface TrackSamplePoint {
  index: number;
  theta: number;
  x: number;
  z: number;
  tx: number; // unit tangent X
  tz: number; // unit tangent Z
  nx: number; // unit right-hand normal X
  nz: number; // unit right-hand normal Z
  yaw: number; // atan2(tx, tz) matching Three.js forward (+sin(yaw), +cos(yaw))
}

export interface TrackCheckpoint {
  id: number;
  sampleIndex: number;
  x: number;
  z: number;
  tx: number;
  tz: number;
  yaw: number;
  radius: number;
  labelAr: string;
}

export interface StuntRamp {
  id: string;
  x: number;
  z: number;
  yaw: number; // direction of launch
  width: number;
  length: number;
  height: number;
  modes: KsidaMode[];
}

export interface SpawnSlot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

// Parametric Figure-8: East Corniche Ocean Loop + West Kasbah Boulevard + Central Ronda Crossroads
function evalRawFigure8(theta: number): { x: number; z: number; dx: number; dz: number } {
  const x = 60 * Math.sin(theta);
  const z = 34 * Math.sin(2 * theta);
  const dx = 60 * Math.cos(theta);
  const dz = 68 * Math.cos(2 * theta);
  return { x, z, dx, dz };
}

export const TRACK_POLYLINE: TrackSamplePoint[] = Array.from(
  { length: TRACK_SAMPLES },
  (_, index) => {
    const theta = (index / TRACK_SAMPLES) * Math.PI * 2;
    const { x, z, dx, dz } = evalRawFigure8(theta);
    const len = Math.hypot(dx, dz) || 1;
    const tx = dx / len;
    const tz = dz / len;
    // Right-hand perpendicular normal in XZ plane when forward = (tx, tz)
    const nx = -tz;
    const nz = tx;
    const yaw = Math.atan2(tx, tz);
    return { index, theta, x, z, tx, tz, nx, nz, yaw };
  }
);

export const TRACK_CHECKPOINTS: TrackCheckpoint[] = [
  {
    id: 0,
    sampleIndex: 3,
    x: TRACK_POLYLINE[3].x,
    z: TRACK_POLYLINE[3].z,
    tx: TRACK_POLYLINE[3].tx,
    tz: TRACK_POLYLINE[3].tz,
    yaw: TRACK_POLYLINE[3].yaw,
    radius: 13.5,
    labelAr: "خط الانطلاق والوصول 🏁",
  },
  {
    id: 1,
    sampleIndex: 24,
    x: TRACK_POLYLINE[24].x,
    z: TRACK_POLYLINE[24].z,
    tx: TRACK_POLYLINE[24].tx,
    tz: TRACK_POLYLINE[24].tz,
    yaw: TRACK_POLYLINE[24].yaw,
    radius: 13.0,
    labelAr: "منعرج الكورنيش 🌊",
  },
  {
    id: 2,
    sampleIndex: 51,
    x: TRACK_POLYLINE[51].x,
    z: TRACK_POLYLINE[51].z,
    tx: TRACK_POLYLINE[51].tx,
    tz: TRACK_POLYLINE[51].tz,
    yaw: TRACK_POLYLINE[51].yaw,
    radius: 13.5,
    labelAr: "تقاطع الروندا الوسطى 💥",
  },
  {
    id: 3,
    sampleIndex: 72,
    x: TRACK_POLYLINE[72].x,
    z: TRACK_POLYLINE[72].z,
    tx: TRACK_POLYLINE[72].tx,
    tz: TRACK_POLYLINE[72].tz,
    yaw: TRACK_POLYLINE[72].yaw,
    radius: 13.0,
    labelAr: "دورة القصبة النخيل 🌴",
  },
];

export const STUNT_RAMPS: StuntRamp[] = [
  // Central Ronda Kickers (active in all modes!)
  {
    id: "ramp_ronda_ne",
    x: -5.8,
    z: -6.4,
    yaw: TRACK_POLYLINE[0].yaw,
    width: 4.8,
    length: 5.6,
    height: 1.05,
    modes: ["RACE", "DERBY", "HOT_BOMB"],
  },
  {
    id: "ramp_ronda_nw",
    x: 5.8,
    z: -6.4,
    yaw: TRACK_POLYLINE[48].yaw,
    width: 4.8,
    length: 5.6,
    height: 1.05,
    modes: ["RACE", "DERBY", "HOT_BOMB"],
  },
  // Extra Derby Stadium Launchers
  {
    id: "ramp_derby_n",
    x: 0,
    z: 21.0,
    yaw: Math.PI, // launches South into center!
    width: 5.4,
    length: 5.8,
    height: 1.15,
    modes: ["DERBY", "HOT_BOMB"],
  },
  {
    id: "ramp_derby_s",
    x: 0,
    z: -21.0,
    yaw: 0, // launches North into center!
    width: 5.4,
    length: 5.8,
    height: 1.15,
    modes: ["DERBY", "HOT_BOMB"],
  },
  // Straightaway Boost Kickers in RACE mode
  {
    id: "ramp_east_exit",
    x: TRACK_POLYLINE[36].x,
    z: TRACK_POLYLINE[36].z,
    yaw: TRACK_POLYLINE[36].yaw,
    width: 4.6,
    length: 5.4,
    height: 0.95,
    modes: ["RACE"],
  },
  {
    id: "ramp_west_exit",
    x: TRACK_POLYLINE[84].x,
    z: TRACK_POLYLINE[84].z,
    yaw: TRACK_POLYLINE[84].yaw,
    width: 4.6,
    length: 5.4,
    height: 0.95,
    modes: ["RACE"],
  },
];

export function getSpawnSlots(mode: KsidaMode): SpawnSlot[] {
  if (mode === "RACE") {
    // 2-column F1 starting grid along samples 90..95 approaching Start/Finish Arch (sample 3)
    const slots: SpawnSlot[] = [];
    const rowIndices = [95, 93, 91, 89];
    for (let r = 0; r < rowIndices.length; r++) {
      const pt = TRACK_POLYLINE[rowIndices[r]];
      for (const side of [-1, 1]) {
        slots.push({
          x: Math.round((pt.x + pt.nx * side * 3.1) * 100) / 100,
          y: 0,
          z: Math.round((pt.z + pt.nz * side * 3.1) * 100) / 100,
          yaw: pt.yaw,
        });
      }
    }
    return slots;
  }

  // Circular Gladiator ring facing center (0, 0) for DERBY & HOT_BOMB
  const slots: SpawnSlot[] = [];
  const ringR = 26.5;
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const x = Math.cos(ang) * ringR;
    const z = Math.sin(ang) * ringR;
    const yaw = Math.atan2(-x, -z);
    slots.push({
      x: Math.round(x * 100) / 100,
      y: 0,
      z: Math.round(z * 100) / 100,
      yaw,
    });
  }
  return slots;
}

export function createInitialCratePads(mode: KsidaMode): KsidaCratePad[] {
  if (mode === "RACE") {
    const padSamples = [
      { idx: 12, offsets: [-3.6, 3.6] },
      { idx: 30, offsets: [-3.4, 3.4] },
      { idx: 48, offsets: [0] }, // Dead-center Ronda risk/reward crate!
      { idx: 60, offsets: [-3.6, 3.6] },
      { idx: 78, offsets: [-3.4, 3.4] },
    ];
    const pads: KsidaCratePad[] = [];
    let counter = 1;
    for (const group of padSamples) {
      const pt = TRACK_POLYLINE[group.idx % TRACK_SAMPLES];
      for (const off of group.offsets) {
        pads.push({
          id: `crate_${counter++}`,
          x: Math.round((pt.x + pt.nx * off) * 100) / 100,
          y: 0.6,
          z: Math.round((pt.z + pt.nz * off) * 100) / 100,
          available: true,
          respawnAt: 0,
        });
      }
    }
    return pads;
  }

  // Ring of 8 Mystery Crates + 1 Center Crate in DERBY / HOT_BOMB
  const pads: KsidaCratePad[] = [
    { id: "crate_center", x: 0, y: 0.6, z: 0, available: true, respawnAt: 0 },
  ];
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r = i % 2 === 0 ? 15.5 : 27.0;
    pads.push({
      id: `crate_${i + 1}`,
      x: Math.round(Math.cos(ang) * r * 100) / 100,
      y: 0.6,
      z: Math.round(Math.sin(ang) * r * 100) / 100,
      available: true,
      respawnAt: 0,
    });
  }
  return pads;
}

/** Closest point on polyline segment [A, B] to (px, pz) */
function closestPointOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): { cx: number; cz: number; distSq: number } {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  let t = 0;
  if (lenSq > 1e-6) {
    t = ((px - ax) * abx + (pz - az) * abz) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return { cx, cz, distSq: dx * dx + dz * dz };
}

/**
 * Signed distance & outward wall normal for track/arena containment.
 * sdf < 0 means inside asphalt; sdf > -radius means touching outer guardrail.
 */
export function evaluateTrackBoundary(
  x: number,
  z: number,
  mode: KsidaMode
): { sdf: number; nx: number; nz: number } {
  if (mode !== "RACE") {
    const d = Math.hypot(x, z);
    const nx = d > 1e-4 ? x / d : 1;
    const nz = d > 1e-4 ? z / d : 0;
    return { sdf: d - DERBY_ARENA_RADIUS, nx, nz };
  }

  // 1. Distance to Figure-8 road centerline
  let bestDistSq = Infinity;
  let bestCx = 0;
  let bestCz = 0;
  for (let i = 0; i < TRACK_SAMPLES; i++) {
    const a = TRACK_POLYLINE[i];
    const b = TRACK_POLYLINE[(i + 1) % TRACK_SAMPLES];
    const res = closestPointOnSegment(x, z, a.x, a.z, b.x, b.z);
    if (res.distSq < bestDistSq) {
      bestDistSq = res.distSq;
      bestCx = res.cx;
      bestCz = res.cz;
    }
  }
  const distSpline = Math.sqrt(bestDistSq);
  const sdfSpline = distSpline - TRACK_HALF_WIDTH;

  // 2. Distance to Central Ronda Plaza circle
  const distRonda = Math.hypot(x, z);
  const sdfRonda = distRonda - RONDA_PLAZA_RADIUS;

  if (sdfRonda < sdfSpline) {
    const nx = distRonda > 1e-4 ? x / distRonda : 1;
    const nz = distRonda > 1e-4 ? z / distRonda : 0;
    return { sdf: sdfRonda, nx, nz };
  }

  const dx = x - bestCx;
  const dz = z - bestCz;
  const nx = distSpline > 1e-4 ? dx / distSpline : 0;
  const nz = distSpline > 1e-4 ? dz / distSpline : 1;
  return { sdf: sdfSpline, nx, nz };
}

/**
 * Evaluates ramp deck elevation at (x, z) for the active mode.
 */
export function sampleRampHeight(
  x: number,
  z: number,
  mode: KsidaMode
): { height: number; onRamp: boolean; nearLip: boolean; rampYaw: number } {
  for (const r of STUNT_RAMPS) {
    if (!r.modes.includes(mode)) continue;
    const dx = x - r.x;
    const dz = z - r.z;
    const fx = Math.sin(r.yaw);
    const fz = Math.cos(r.yaw);
    const rx = -fz;
    const rz = fx;

    const localFwd = dx * fx + dz * fz; // -length/2 (entry) .. +length/2 (launch lip)
    const localSide = dx * rx + dz * rz;

    if (Math.abs(localSide) <= r.width * 0.5 && Math.abs(localFwd) <= r.length * 0.5) {
      const t = (localFwd + r.length * 0.5) / r.length; // 0..1
      return {
        height: t * r.height,
        onRamp: true,
        nearLip: t > 0.78,
        rampYaw: r.yaw,
      };
    }
  }
  return { height: 0, onRamp: false, nearLip: false, rampYaw: 0 };
}

/**
 * Branch-aware monotonic track progress & checkpoint advancement for RACE mode.
 */
export function updateRaceCheckpointAndProgress(
  x: number,
  z: number,
  lap: number,
  nextCheckpoint: number
): { lap: number; nextCheckpoint: number; trackProgress: number; crossedCheckpoint: boolean; completedLap: boolean } {
  let curLap = lap;
  let curCp = nextCheckpoint;
  let crossedCheckpoint = false;
  let completedLap = false;

  const targetCp = TRACK_CHECKPOINTS[curCp % TRACK_CHECKPOINTS.length];
  const distToCp = Math.hypot(x - targetCp.x, z - targetCp.z);
  if (distToCp <= targetCp.radius) {
    crossedCheckpoint = true;
    if (curCp === 0) {
      curLap += 1;
      completedLap = true;
      curCp = 1;
    } else {
      curCp = (curCp + 1) % TRACK_CHECKPOINTS.length;
    }
  }

  // Restrict spline lookup window to the active track quarter so the (0,0) Figure-8 crossing is unambiguous!
  let startK = 0;
  let endK = 32;
  if (curCp === 1) {
    startK = -12;
    endK = 30;
  } else if (curCp === 2) {
    startK = 18;
    endK = 56;
  } else if (curCp === 3) {
    startK = 44;
    endK = 78;
  } else {
    // curCp === 0 (approaching Finish Arch at sample 3 from West loop)
    startK = 66;
    endK = 100;
  }

  let bestK = startK;
  let bestD2 = Infinity;
  for (let k = startK; k <= endK; k++) {
    const wrapped = ((k % TRACK_SAMPLES) + TRACK_SAMPLES) % TRACK_SAMPLES;
    const pt = TRACK_POLYLINE[wrapped];
    const d2 = (x - pt.x) * (x - pt.x) + (z - pt.z) * (z - pt.z);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestK = k;
    }
  }

  // Normalize progress within current lap: sample 3 = 0.0 .. sample 99 (=3) = 1.0
  const frac = (bestK - 3) / TRACK_SAMPLES;
  const clampedFrac = Math.max(-0.15, Math.min(1.02, frac));
  const trackProgress = Math.round(((curLap - 1) + clampedFrac) * 1000) / 1000;

  return {
    lap: curLap,
    nextCheckpoint: curCp,
    trackProgress,
    crossedCheckpoint,
    completedLap,
  };
}
