/**
 * Static riad layout shared by the game logic (spawn rules) and the 3D client (rendering + collisions).
 * Coordinates are in meters; the playable courtyard spans -16..16 on X and Z.
 */

export type GhammadaDecorModel =
  | "tableRound"
  | "stoolBar"
  | "loungeSofa"
  | "benchCushion"
  | "pottedPlant"
  | "plantSmall1"
  | "plantSmall2"
  | "lampRoundFloor"
  | "rugRound"
  | "rugRectangle";

export interface GhammadaDecor {
  model: GhammadaDecorModel;
  x: number;
  z: number;
  rotY: number;
  /** Collision radius in meters (0 = walk-through, e.g. rugs) */
  radius: number;
  /** Target height in meters used to scale the model */
  height: number;
}

export const ARENA_HALF = 16.2;
export const FOUNTAIN_RADIUS = 2.9;

export const PALM_POSITIONS: Array<[number, number]> = [
  [-5.5, -5.5],
  [5.5, -5.5],
  [-5.5, 5.5],
  [5.5, 5.5],
];
export const PALM_RADIUS = 0.55;

export const GHAMMADA_DECOR: GhammadaDecor[] = [
  // NW — café corner
  { model: "rugRound", x: -10, z: -10, rotY: 0, radius: 0, height: 0.05 },
  { model: "tableRound", x: -10, z: -10, rotY: 0, radius: 0.85, height: 0.8 },
  { model: "stoolBar", x: -11.4, z: -10, rotY: 1.57, radius: 0.4, height: 0.9 },
  { model: "stoolBar", x: -8.6, z: -10, rotY: -1.57, radius: 0.4, height: 0.9 },
  { model: "stoolBar", x: -10, z: -8.6, rotY: 3.14, radius: 0.4, height: 0.9 },
  { model: "lampRoundFloor", x: -14.8, z: -14.8, rotY: 0, radius: 0.35, height: 1.8 },

  // NE — souk lounge
  { model: "rugRectangle", x: 11, z: -11, rotY: 0.78, radius: 0, height: 0.05 },
  { model: "loungeSofa", x: 13, z: -13, rotY: -0.78, radius: 1.1, height: 0.9 },
  { model: "benchCushion", x: 8.5, z: -13.8, rotY: 0, radius: 0.8, height: 0.55 },
  { model: "pottedPlant", x: 14.6, z: -8.2, rotY: 0, radius: 0.45, height: 1.3 },

  // SW — plant alley
  { model: "pottedPlant", x: -13.8, z: 8.2, rotY: 0, radius: 0.45, height: 1.4 },
  { model: "pottedPlant", x: -8.2, z: 13.8, rotY: 0, radius: 0.45, height: 1.4 },
  { model: "plantSmall2", x: -12, z: 12, rotY: 0.4, radius: 0.35, height: 0.8 },
  { model: "benchCushion", x: -14.4, z: 12.5, rotY: 1.57, radius: 0.8, height: 0.55 },
  { model: "lampRoundFloor", x: -14.8, z: 14.8, rotY: 0, radius: 0.35, height: 1.8 },

  // SE — garden
  { model: "rugRound", x: 10, z: 10, rotY: 0, radius: 0, height: 0.05 },
  { model: "plantSmall1", x: 8.2, z: 13.6, rotY: 0, radius: 0.35, height: 0.7 },
  { model: "plantSmall2", x: 13.6, z: 8.2, rotY: 1, radius: 0.35, height: 0.8 },
  { model: "benchCushion", x: 13.5, z: 13.5, rotY: -0.78, radius: 0.8, height: 0.55 },
  { model: "lampRoundFloor", x: 14.8, z: 14.8, rotY: 0, radius: 0.35, height: 1.8 },

  // Arcade edges
  { model: "pottedPlant", x: 0, z: -15, rotY: 0, radius: 0.45, height: 1.3 },
  { model: "pottedPlant", x: 0, z: 15, rotY: 0, radius: 0.45, height: 1.3 },
  { model: "pottedPlant", x: -15, z: 0, rotY: 0, radius: 0.45, height: 1.3 },
  { model: "pottedPlant", x: 15, z: 0, rotY: 0, radius: 0.45, height: 1.3 },
];

export interface CircleCollider {
  x: number;
  z: number;
  r: number;
}

/** All solid obstacles the players can't walk through */
export const STATIC_COLLIDERS: CircleCollider[] = [
  { x: 0, z: 0, r: FOUNTAIN_RADIUS },
  ...PALM_POSITIONS.map(([x, z]) => ({ x, z, r: PALM_RADIUS })),
  ...GHAMMADA_DECOR.filter((d) => d.radius > 0).map((d) => ({ x: d.x, z: d.z, r: d.radius })),
];

/**
 * Pushes a point (with its own radius) out of every static collider and keeps it inside the walls.
 * Pure function so it can be unit-tested and shared.
 */
export function resolveCollisions(
  x: number,
  z: number,
  selfRadius: number,
  colliders: CircleCollider[] = STATIC_COLLIDERS
): { x: number; z: number } {
  let nx = x;
  let nz = z;
  for (const c of colliders) {
    const dx = nx - c.x;
    const dz = nz - c.z;
    const dist = Math.hypot(dx, dz);
    const minDist = c.r + selfRadius;
    if (dist < minDist) {
      if (dist < 1e-4) {
        nx = c.x + minDist;
      } else {
        nx = c.x + (dx / dist) * minDist;
        nz = c.z + (dz / dist) * minDist;
      }
    }
  }
  const lim = ARENA_HALF - selfRadius;
  nx = Math.max(-lim, Math.min(lim, nx));
  nz = Math.max(-lim, Math.min(lim, nz));
  return { x: nx, z: nz };
}

/** True when a spot is free for spawning a prop or a player */
export function isSpotFree(x: number, z: number, clearance: number): boolean {
  if (Math.abs(x) > ARENA_HALF - clearance || Math.abs(z) > ARENA_HALF - clearance) return false;
  return STATIC_COLLIDERS.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + clearance);
}
