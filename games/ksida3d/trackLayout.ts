import { KsidaBarrelProp, KsidaCratePad, KsidaMode } from "./types";

export const TRACK_SAMPLES = 240;
export const TRACK_HALF_WIDTH = 11.4; // 22.8m wide 4-lane highway!
export const RONDA_CENTER = { x: -145, z: -68 };
export const RONDA_PLAZA_RADIUS = 27.5; // 55m Grand Ronda Monument Roundabout!
export const RONDA_FOUNTAIN_RADIUS = 5.2; // Central 3D Stone Fountain Island!
export const DERBY_ARENA_RADIUS = 62.0; // 124m Gladiator Derby & Hot-Bomb Stadium!
export const CAR_COLLISION_RADIUS = 1.38;

export interface CircularObstacle {
  id: string;
  x: number;
  z: number;
  radius: number;
  modes: KsidaMode[];
}

export const ARENA_PILLARS: CircularObstacle[] = [
  {
    id: "ronda_fountain",
    x: RONDA_CENTER.x,
    z: RONDA_CENTER.z,
    radius: RONDA_FOUNTAIN_RADIUS,
    modes: ["RACE"],
  },
  { id: "derby_pillar_ne", x: 24, z: 24, radius: 3.4, modes: ["DERBY", "HOT_BOMB"] },
  { id: "derby_pillar_nw", x: -24, z: 24, radius: 3.4, modes: ["DERBY", "HOT_BOMB"] },
  { id: "derby_pillar_se", x: 24, z: -24, radius: 3.4, modes: ["DERBY", "HOT_BOMB"] },
  { id: "derby_pillar_sw", x: -24, z: -24, radius: 3.4, modes: ["DERBY", "HOT_BOMB"] },
];

export interface TrackSamplePoint {
  index: number;
  s: number; // cumulative distance in meters from sample 0
  theta: number; // normalized 0..2pi
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

export interface TurboBoostPad {
  id: string;
  x: number;
  z: number;
  yaw: number;
  width: number;
  length: number;
  modes: KsidaMode[];
}

export interface SpawnSlot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/**
 * 16 handcrafted waypoints spanning a 460m x 330m Moroccan coastal peninsula:
 * Sector 1: Corniche Ain Diab Oceanfront Straight & Marina Sweeper
 * Sector 2: Tanger-Med Cargo Port Chicane & Lighthouse Bluff
 * Sector 3: Kasbah Fortress Double Hairpins & Medina Arcade
 * Sector 4: Atlas Sandstone Canyon & Grand Ronda Monument Roundabout
 */
const CIRCUIT_WAYPOINTS: ReadonlyArray<[number, number]> = [
  [-78, -136], // 0: Grid / Main Straight West
  [18, -136], // 1: Checkered Start/Finish Gantry & Grandstands
  [118, -132], // 2: Corniche Ain Diab Ocean Straight
  [196, -94], // 3: Marina Beach Sweeper
  [214, -10], // 4: Tanger-Med Port Boulevard
  [174, 72], // 5: Cargo Container Chicane
  [202, 138], // 6: North-East Lighthouse Bluff
  [114, 156], // 7: Kasbah Outer Fortress Wall
  [48, 86], // 8: Kasbah Hairpin #1 (Inner Medina Dive!)
  [-20, 154], // 9: Kasbah Hairpin #2 (Bab El Mansour Apex!)
  [-114, 146], // 10: Medina Souk Boulevard
  [-196, 102], // 11: Atlas Canyon Overlook
  [-214, 16], // 12: Atlas Sandstone Canyon Sweep
  [-164, -20], // 13: Ronda North Entry
  [-145, -68], // 14: Grand Ronda Fountain Roundabout Centerline
  [-140, -122], // 15: Pit-Wall Final Corner onto Main Straight
];

function catmullRom1D(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function buildUniformCircuitPolyline(numSamples: number): {
  points: TrackSamplePoint[];
  totalLength: number;
} {
  const N = CIRCUIT_WAYPOINTS.length;
  const denseCount = N * 64;
  const denseX = new Float64Array(denseCount + 1);
  const denseZ = new Float64Array(denseCount + 1);
  const cumLen = new Float64Array(denseCount + 1);

  for (let i = 0; i <= denseCount; i++) {
    const u = (i / denseCount) * N;
    const seg = Math.floor(u) % N;
    const localT = u - Math.floor(u);

    const p0 = CIRCUIT_WAYPOINTS[(seg - 1 + N) % N];
    const p1 = CIRCUIT_WAYPOINTS[seg];
    const p2 = CIRCUIT_WAYPOINTS[(seg + 1) % N];
    const p3 = CIRCUIT_WAYPOINTS[(seg + 2) % N];

    denseX[i] = catmullRom1D(p0[0], p1[0], p2[0], p3[0], localT);
    denseZ[i] = catmullRom1D(p0[1], p1[1], p2[1], p3[1], localT);

    if (i > 0) {
      cumLen[i] =
        cumLen[i - 1] + Math.hypot(denseX[i] - denseX[i - 1], denseZ[i] - denseZ[i - 1]);
    }
  }

  const totalLength = cumLen[denseCount];
  const rawPts: Array<{ x: number; z: number; s: number }> = [];
  let cursor = 0;

  for (let k = 0; k < numSamples; k++) {
    const targetS = (k / numSamples) * totalLength;
    while (cursor < denseCount - 1 && cumLen[cursor + 1] < targetS) {
      cursor++;
    }
    const segLen = Math.max(1e-6, cumLen[cursor + 1] - cumLen[cursor]);
    const alpha = Math.max(0, Math.min(1, (targetS - cumLen[cursor]) / segLen));
    rawPts.push({
      x: denseX[cursor] + (denseX[cursor + 1] - denseX[cursor]) * alpha,
      z: denseZ[cursor] + (denseZ[cursor + 1] - denseZ[cursor]) * alpha,
      s: targetS,
    });
  }

  const points: TrackSamplePoint[] = rawPts.map((pt, index) => {
    const prev = rawPts[(index - 1 + numSamples) % numSamples];
    const next = rawPts[(index + 1) % numSamples];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const tx = dx / len;
    const tz = dz / len;
    // Right-hand perpendicular normal in XZ plane when forward = (tx, tz)
    const nx = -tz;
    const nz = tx;
    const yaw = Math.atan2(tx, tz);
    return {
      index,
      s: Math.round(pt.s * 10) / 10,
      theta: (index / numSamples) * Math.PI * 2,
      x: Math.round(pt.x * 100) / 100,
      z: Math.round(pt.z * 100) / 100,
      tx,
      tz,
      nx,
      nz,
      yaw,
    };
  });

  return { points, totalLength: Math.round(totalLength) };
}

const BUILT_CIRCUIT = buildUniformCircuitPolyline(TRACK_SAMPLES);
export const TRACK_POLYLINE: TrackSamplePoint[] = BUILT_CIRCUIT.points;
export const TRACK_TOTAL_LENGTH_M: number = BUILT_CIRCUIT.totalLength;

export const FINISH_SAMPLE_INDEX = 14; // Right on the Grandstand Corniche Straight!

const CHECKPOINT_LABELS_AR = [
  "خط الانطلاق والوصول 🏁",
  "كورنيش عين الذئاب 🌊",
  "ميناء طنجة-ميد للحاويات 🚢",
  "منارة البحر الأطلسي 🗼",
  "منعرج القصبة التاريخية 🏰",
  "سوق المدينة القديمة 🏮",
  "ممر جبال الأطلس الصخري ⛰️",
  "مدار الروندا الكبرى 💥",
];

export const TRACK_CHECKPOINTS: TrackCheckpoint[] = Array.from({ length: 8 }, (_, id) => {
  const sampleIndex = (FINISH_SAMPLE_INDEX + id * 30) % TRACK_SAMPLES;
  const pt = TRACK_POLYLINE[sampleIndex];
  return {
    id,
    sampleIndex,
    x: pt.x,
    z: pt.z,
    tx: pt.tx,
    tz: pt.tz,
    yaw: pt.yaw,
    radius: id === 7 ? 24.5 : 16.5, // Wider capture gate across Ronda roundabout!
    labelAr: CHECKPOINT_LABELS_AR[id],
  };
});

function makeTrackRamp(
  id: string,
  sampleIdx: number,
  lateralOffset: number,
  width = 5.8,
  length = 7.6,
  height = 1.35
): StuntRamp {
  const pt = TRACK_POLYLINE[((sampleIdx % TRACK_SAMPLES) + TRACK_SAMPLES) % TRACK_SAMPLES];
  return {
    id,
    x: Math.round((pt.x + pt.nx * lateralOffset) * 100) / 100,
    z: Math.round((pt.z + pt.nz * lateralOffset) * 100) / 100,
    yaw: pt.yaw,
    width,
    length,
    height,
    modes: ["RACE"],
  };
}

export const STUNT_RAMPS: StuntRamp[] = [
  // Grand Circuit Stunt Kickers
  makeTrackRamp("ramp_corniche_jump", 28, -3.5, 5.8, 7.8, 1.32),
  makeTrackRamp("ramp_port_jump", 72, 3.2, 5.8, 7.6, 1.35),
  makeTrackRamp("ramp_medina_jump", 154, 0, 6.4, 8.2, 1.42),
  makeTrackRamp("ramp_canyon_crest", 196, -2.8, 6.0, 8.0, 1.45),

  // Derby & Hot-Bomb 4-Way Gladiator Launchers into Central Zellige Bowl!
  {
    id: "ramp_derby_n",
    x: 0,
    z: 30.0,
    yaw: Math.PI,
    width: 6.8,
    length: 8.0,
    height: 1.45,
    modes: ["DERBY", "HOT_BOMB"],
  },
  {
    id: "ramp_derby_s",
    x: 0,
    z: -30.0,
    yaw: 0,
    width: 6.8,
    length: 8.0,
    height: 1.45,
    modes: ["DERBY", "HOT_BOMB"],
  },
  {
    id: "ramp_derby_e",
    x: 30.0,
    z: 0,
    yaw: -Math.PI / 2,
    width: 6.8,
    length: 8.0,
    height: 1.45,
    modes: ["DERBY", "HOT_BOMB"],
  },
  {
    id: "ramp_derby_w",
    x: -30.0,
    z: 0,
    yaw: Math.PI / 2,
    width: 6.8,
    length: 8.0,
    height: 1.45,
    modes: ["DERBY", "HOT_BOMB"],
  },
];

function makeTrackTurboPad(id: string, sampleIdx: number, lateralOffset: number): TurboBoostPad {
  const pt = TRACK_POLYLINE[((sampleIdx % TRACK_SAMPLES) + TRACK_SAMPLES) % TRACK_SAMPLES];
  return {
    id,
    x: Math.round((pt.x + pt.nx * lateralOffset) * 100) / 100,
    z: Math.round((pt.z + pt.nz * lateralOffset) * 100) / 100,
    yaw: pt.yaw,
    width: 5.2,
    length: 8.5,
    modes: ["RACE"],
  };
}

export const TURBO_PADS: TurboBoostPad[] = [
  makeTrackTurboPad("turbo_straight_1", 20, 4.2),
  makeTrackTurboPad("turbo_marina_2", 48, -3.8),
  makeTrackTurboPad("turbo_port_3", 86, 3.6),
  makeTrackTurboPad("turbo_kasbah_exit_4", 136, -3.4),
  makeTrackTurboPad("turbo_medina_5", 168, 3.8),
  makeTrackTurboPad("turbo_canyon_6", 204, 3.5),
  // Inside fast-lane of Grand Ronda Monument!
  {
    id: "turbo_ronda_fast",
    x: RONDA_CENTER.x + 11.5,
    z: RONDA_CENTER.z - 2.0,
    yaw: Math.PI,
    width: 5.2,
    length: 8.2,
    modes: ["RACE"],
  },
  makeTrackTurboPad("turbo_finish_sprint", 236, -3.6),

  // Outer Speed Ring Turbo Strips in DERBY & HOT_BOMB Stadium
  ...Array.from({ length: 6 }, (_, i): TurboBoostPad => {
    const ang = (i / 6) * Math.PI * 2;
    const r = 46.0;
    const x = Math.round(Math.cos(ang) * r * 100) / 100;
    const z = Math.round(Math.sin(ang) * r * 100) / 100;
    const tx = -Math.sin(ang);
    const tz = Math.cos(ang);
    return {
      id: `turbo_derby_${i + 1}`,
      x,
      z,
      yaw: Math.atan2(tx, tz),
      width: 5.6,
      length: 8.5,
      modes: ["DERBY", "HOT_BOMB"],
    };
  }),
];

export function getSpawnSlots(mode: KsidaMode): SpawnSlot[] {
  if (mode === "RACE") {
    // 2-column F1/GT starting grid along samples 10, 7, 4, 1 approaching Start/Finish Arch (sample 14)
    const slots: SpawnSlot[] = [];
    const rowIndices = [10, 7, 4, 1];
    for (let r = 0; r < rowIndices.length; r++) {
      const pt = TRACK_POLYLINE[rowIndices[r]];
      for (const side of [-1, 1]) {
        slots.push({
          x: Math.round((pt.x + pt.nx * side * 3.8) * 100) / 100,
          y: 0,
          z: Math.round((pt.z + pt.nz * side * 3.8) * 100) / 100,
          yaw: pt.yaw,
        });
      }
    }
    return slots;
  }

  // Circular Gladiator ring facing center (0, 0) for DERBY & HOT_BOMB
  const slots: SpawnSlot[] = [];
  const ringR = 44.0;
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
      { idx: 24, offsets: [-4.6, 0, 4.6] },
      { idx: 56, offsets: [-4.4, 4.4] },
      { idx: 92, offsets: [-4.2, 4.2] },
      { idx: 122, offsets: [-3.8, 3.8] },
      { idx: 148, offsets: [-4.5, 0, 4.5] },
      { idx: 182, offsets: [-4.2, 4.2] },
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
    // Outer reward crates in Grand Ronda Roundabout!
    pads.push(
      {
        id: `crate_${counter++}`,
        x: RONDA_CENTER.x - 14.5,
        y: 0.6,
        z: RONDA_CENTER.z - 4.0,
        available: true,
        respawnAt: 0,
      },
      {
        id: `crate_${counter++}`,
        x: RONDA_CENTER.x - 12.0,
        y: 0.6,
        z: RONDA_CENTER.z + 9.0,
        available: true,
        respawnAt: 0,
      }
    );
    return pads;
  }

  // 13 Mystery Crates across the 124m DERBY / HOT_BOMB Stadium!
  const pads: KsidaCratePad[] = [
    { id: "crate_center", x: 0, y: 0.6, z: 0, available: true, respawnAt: 0 },
  ];
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const r = i % 2 === 0 ? 20.5 : 42.0;
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

export function createInitialBarrels(mode: KsidaMode): KsidaBarrelProp[] {
  if (mode === "RACE") {
    const spots = [
      { idx: 40, off: 6.2 },
      { idx: 64, off: -5.8 },
      { idx: 108, off: 5.5 },
      { idx: 118, off: -6.0 },
      { idx: 132, off: 5.8 },
      { idx: 142, off: -5.8 },
      { idx: 174, off: 6.2 },
      { idx: 210, off: -5.6 },
    ];
    return spots.map((sp, i) => {
      const pt = TRACK_POLYLINE[sp.idx % TRACK_SAMPLES];
      return {
        id: `brl_${i + 1}`,
        x: Math.round((pt.x + pt.nx * sp.off) * 100) / 100,
        z: Math.round((pt.z + pt.nz * sp.off) * 100) / 100,
        available: true,
        respawnAt: 0,
      };
    });
  }

  return Array.from({ length: 8 }, (_, i) => {
    const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r = 34.0;
    return {
      id: `brl_${i + 1}`,
      x: Math.round(Math.cos(ang) * r * 100) / 100,
      z: Math.round(Math.sin(ang) * r * 100) / 100,
      available: true,
      respawnAt: 0,
    };
  });
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

/** Finds nearest TrackSamplePoint for wrong-way detection, track reset, and AI recovery */
export function findNearestTrackSample(
  x: number,
  z: number
): { sample: TrackSamplePoint; dist: number } {
  let bestIdx = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < TRACK_SAMPLES; i++) {
    const pt = TRACK_POLYLINE[i];
    const d2 = (x - pt.x) * (x - pt.x) + (z - pt.z) * (z - pt.z);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestIdx = i;
    }
  }
  return { sample: TRACK_POLYLINE[bestIdx], dist: Math.sqrt(bestD2) };
}

/**
 * Signed distance & wall normal for track/arena containment + interior monument/pillar obstacles.
 * sdf < 0 means inside drivable asphalt; sdf + CAR_COLLISION_RADIUS > 0 means touching a wall/pillar.
 */
export function evaluateTrackBoundary(
  x: number,
  z: number,
  mode: KsidaMode
): { sdf: number; nx: number; nz: number } {
  let outerSdf = 0;
  let outerNx = 1;
  let outerNz = 0;

  if (mode !== "RACE") {
    const d = Math.hypot(x, z);
    outerNx = d > 1e-4 ? x / d : 1;
    outerNz = d > 1e-4 ? z / d : 0;
    outerSdf = d - DERBY_ARENA_RADIUS;
  } else {
    // 1. Distance to 240-sample Grand Circuit centerline
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

    // 2. Union with Grand Ronda Monument Roundabout Plaza
    const rx = x - RONDA_CENTER.x;
    const rz = z - RONDA_CENTER.z;
    const distRonda = Math.hypot(rx, rz);
    const sdfRonda = distRonda - RONDA_PLAZA_RADIUS;

    if (sdfRonda < sdfSpline) {
      outerNx = distRonda > 1e-4 ? rx / distRonda : 1;
      outerNz = distRonda > 1e-4 ? rz / distRonda : 0;
      outerSdf = sdfRonda;
    } else {
      const dx = x - bestCx;
      const dz = z - bestCz;
      outerNx = distSpline > 1e-4 ? dx / distSpline : 0;
      outerNz = distSpline > 1e-4 ? dz / distSpline : 1;
      outerSdf = sdfSpline;
    }
  }

  // 3. Interior Fountain / Tactical Pillar Obstacles (set subtraction: max(outerSdf, pillarSdf))
  for (const pil of ARENA_PILLARS) {
    if (!pil.modes.includes(mode)) continue;
    const dx = x - pil.x;
    const dz = z - pil.z;
    const d = Math.hypot(dx, dz);
    const pilSdf = pil.radius - d; // > -CAR_COLLISION_RADIUS when hitting pillar!
    if (pilSdf > outerSdf) {
      outerSdf = pilSdf;
      // Normal points INTO the pillar so `car.x -= nx * pen` pushes the car OUTWARD away from pillar!
      outerNx = d > 1e-4 ? -dx / d : -1;
      outerNz = d > 1e-4 ? -dz / d : 0;
    }
  }

  return { sdf: outerSdf, nx: outerNx, nz: outerNz };
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
        nearLip: t > 0.76,
        rampYaw: r.yaw,
      };
    }
  }
  return { height: 0, onRamp: false, nearLip: false, rampYaw: 0 };
}

/**
 * Checks whether (x, z) is over an asphalt Turbo Chevron Boost Pad!
 */
export function sampleTurboPad(
  x: number,
  z: number,
  mode: KsidaMode
): TurboBoostPad | null {
  for (const pad of TURBO_PADS) {
    if (!pad.modes.includes(mode)) continue;
    const dx = x - pad.x;
    const dz = z - pad.z;
    if (dx * dx + dz * dz > 42) continue;
    const fx = Math.sin(pad.yaw);
    const fz = Math.cos(pad.yaw);
    const rx = -fz;
    const rz = fx;
    const localFwd = dx * fx + dz * fz;
    const localSide = dx * rx + dz * rz;
    if (Math.abs(localSide) <= pad.width * 0.52 && Math.abs(localFwd) <= pad.length * 0.52) {
      return pad;
    }
  }
  return null;
}

/**
 * Monotonic 8-Checkpoint lap & progress tracker for the 240-sample Grand Circuit.
 */
export function updateRaceCheckpointAndProgress(
  x: number,
  z: number,
  lap: number,
  nextCheckpoint: number
): {
  lap: number;
  nextCheckpoint: number;
  trackProgress: number;
  crossedCheckpoint: boolean;
  completedLap: boolean;
} {
  const numCps = TRACK_CHECKPOINTS.length;
  let curLap = lap;
  let curCp = ((nextCheckpoint % numCps) + numCps) % numCps;
  let crossedCheckpoint = false;
  let completedLap = false;

  const targetCp = TRACK_CHECKPOINTS[curCp];
  const distToCp = Math.hypot(x - targetCp.x, z - targetCp.z);
  if (distToCp <= targetCp.radius) {
    crossedCheckpoint = true;
    if (curCp === 0) {
      curLap += 1;
      completedLap = true;
      curCp = 1;
    } else {
      curCp = (curCp + 1) % numCps;
    }
  }

  // Search local 54-sample window around the active sector [prevCpSample - 12 .. targetCpSample + 12]
  const prevCpIdx = (curCp - 1 + numCps) % numCps;
  const sectorStartSample =
    FINISH_SAMPLE_INDEX + prevCpIdx * 30; // unwrapped relative to FINISH_SAMPLE_INDEX
  const winStart = sectorStartSample - 14;
  const winEnd = sectorStartSample + 42;

  let bestUnwrappedK = sectorStartSample;
  let bestD2 = Infinity;
  for (let k = winStart; k <= winEnd; k++) {
    const wrapped = ((k % TRACK_SAMPLES) + TRACK_SAMPLES) % TRACK_SAMPLES;
    const pt = TRACK_POLYLINE[wrapped];
    const d2 = (x - pt.x) * (x - pt.x) + (z - pt.z) * (z - pt.z);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestUnwrappedK = k;
    }
  }

  const frac = (bestUnwrappedK - FINISH_SAMPLE_INDEX) / TRACK_SAMPLES;
  const clampedFrac = Math.max(-0.08, Math.min(1.02, frac));
  const trackProgress = Math.round((curLap - 1 + clampedFrac) * 1000) / 1000;

  return {
    lap: curLap,
    nextCheckpoint: curCp,
    trackProgress,
    crossedCheckpoint,
    completedLap,
  };
}
