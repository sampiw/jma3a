import { CarbonPickupKind, CarbonPickupPad, CarbonTeam } from "./types";

/** Half-size of the Orbital Carbon Colosseum (playable X/Z in [-25, +25]) */
export const ARENA_HALF = 25.0;
export const CORE_PLATFORM_RADIUS = 5.6;
export const CORE_PLATFORM_HEIGHT = 1.15;
export const CORE_CAPTURE_RADIUS = 4.6;
export const PLAYER_RADIUS = 0.52;
export const EYE_HEIGHT = 1.48;

export interface ArenaBoxObstacle {
  id: string;
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  baseY: number;
  height: number;
  style: "TITANIUM_WALL" | "ENERGY_BUNKER" | "PILLAR" | "SNIPER_DECK";
  walkableTop?: boolean;
  accentHex?: number;
}

export interface ArenaRamp {
  id: string;
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  /** Direction from low (0) to high (topY): 'N' (-Z), 'S' (+Z), 'E' (+X), 'W' (-X) */
  ascendDir: "N" | "S" | "E" | "W";
  baseY: number;
  topY: number;
}

export interface ArenaJumpPad {
  id: string;
  x: number;
  z: number;
  radius: number;
  launchVx: number;
  launchVy: number;
  launchVz: number;
  colorHex: number;
}

export interface ArenaSpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
  team: CarbonTeam;
}

/**
 * Symmetrical Sci-Fi Orbital Colosseum:
 * - Elevated central Overdrive Deck (y = 1.15m) with 4 cardinal access ramps
 * - 4 diagonal Carbon-Titanium L-bunkers for tactical strafe duels & wall-bounces
 * - 4 outer high pillars + 2 flanking sniper decks (East & West)
 * - 4 corner Gravity Jump-Pads that launch Strikers onto the decks or center core!
 */
export const ARENA_OBSTACLES: ArenaBoxObstacle[] = [
  // 4 inner angled-position tactical cover walls framing the central platform
  {
    id: "bunker_nw",
    x: -8.6,
    z: -8.6,
    halfX: 2.3,
    halfZ: 0.75,
    baseY: 0,
    height: 2.35,
    style: "ENERGY_BUNKER",
    accentHex: 0x22d3ee,
  },
  {
    id: "bunker_ne",
    x: 8.6,
    z: -8.6,
    halfX: 2.3,
    halfZ: 0.75,
    baseY: 0,
    height: 2.35,
    style: "ENERGY_BUNKER",
    accentHex: 0x22d3ee,
  },
  {
    id: "bunker_sw",
    x: -8.6,
    z: 8.6,
    halfX: 2.3,
    halfZ: 0.75,
    baseY: 0,
    height: 2.35,
    style: "ENERGY_BUNKER",
    accentHex: 0xf43f5e,
  },
  {
    id: "bunker_se",
    x: 8.6,
    z: 8.6,
    halfX: 2.3,
    halfZ: 0.75,
    baseY: 0,
    height: 2.35,
    style: "ENERGY_BUNKER",
    accentHex: 0xf43f5e,
  },

  // Side wing titanium cover blocks (creates rich shotgun & ricochet corridors)
  {
    id: "wing_nw",
    x: -11.5,
    z: -5.4,
    halfX: 0.75,
    halfZ: 2.1,
    baseY: 0,
    height: 2.5,
    style: "TITANIUM_WALL",
    accentHex: 0x22d3ee,
  },
  {
    id: "wing_ne",
    x: 11.5,
    z: -5.4,
    halfX: 0.75,
    halfZ: 2.1,
    baseY: 0,
    height: 2.5,
    style: "TITANIUM_WALL",
    accentHex: 0x22d3ee,
  },
  {
    id: "wing_sw",
    x: -11.5,
    z: 5.4,
    halfX: 0.75,
    halfZ: 2.1,
    baseY: 0,
    height: 2.5,
    style: "TITANIUM_WALL",
    accentHex: 0xf43f5e,
  },
  {
    id: "wing_se",
    x: 11.5,
    z: 5.4,
    halfX: 0.75,
    halfZ: 2.1,
    baseY: 0,
    height: 2.5,
    style: "TITANIUM_WALL",
    accentHex: 0xf43f5e,
  },

  // East & West Elevated Sniper Overlook Decks (walkable via ramps or jump pads!)
  {
    id: "deck_west",
    x: -18.5,
    z: 0,
    halfX: 2.8,
    halfZ: 4.2,
    baseY: 0,
    height: 1.45,
    style: "SNIPER_DECK",
    walkableTop: true,
    accentHex: 0xa855f7,
  },
  {
    id: "deck_east",
    x: 18.5,
    z: 0,
    halfX: 2.8,
    halfZ: 4.2,
    baseY: 0,
    height: 1.45,
    style: "SNIPER_DECK",
    walkableTop: true,
    accentHex: 0xf59e0b,
  },

  // North & South Spawn Shield Bulkheads (prevents spawn-sniping across map)
  {
    id: "shield_north",
    x: 0,
    z: -16.8,
    halfX: 3.8,
    halfZ: 0.85,
    baseY: 0,
    height: 2.7,
    style: "TITANIUM_WALL",
    accentHex: 0x22d3ee,
  },
  {
    id: "shield_south",
    x: 0,
    z: 16.8,
    halfX: 3.8,
    halfZ: 0.85,
    baseY: 0,
    height: 2.7,
    style: "TITANIUM_WALL",
    accentHex: 0xf43f5e,
  },

  // 4 Tall Orbital Monolith Pillars with holographic rings
  {
    id: "pillar_1",
    x: -15.2,
    z: -11.8,
    halfX: 1.15,
    halfZ: 1.15,
    baseY: 0,
    height: 5.2,
    style: "PILLAR",
    accentHex: 0x22d3ee,
  },
  {
    id: "pillar_2",
    x: 15.2,
    z: -11.8,
    halfX: 1.15,
    halfZ: 1.15,
    baseY: 0,
    height: 5.2,
    style: "PILLAR",
    accentHex: 0x22d3ee,
  },
  {
    id: "pillar_3",
    x: -15.2,
    z: 11.8,
    halfX: 1.15,
    halfZ: 1.15,
    baseY: 0,
    height: 5.2,
    style: "PILLAR",
    accentHex: 0xf43f5e,
  },
  {
    id: "pillar_4",
    x: 15.2,
    z: 11.8,
    halfX: 1.15,
    halfZ: 1.15,
    baseY: 0,
    height: 5.2,
    style: "PILLAR",
    accentHex: 0xf43f5e,
  },
];

export const ARENA_RAMPS: ArenaRamp[] = [
  // 4 Ramps ascending onto the Central Overdrive Core Platform (y: 0 -> 1.15)
  { id: "ramp_core_n", x: 0, z: -7.2, halfX: 1.85, halfZ: 2.1, ascendDir: "S", baseY: 0, topY: CORE_PLATFORM_HEIGHT },
  { id: "ramp_core_s", x: 0, z: 7.2, halfX: 1.85, halfZ: 2.1, ascendDir: "N", baseY: 0, topY: CORE_PLATFORM_HEIGHT },
  { id: "ramp_core_w", x: -7.2, z: 0, halfX: 2.1, halfZ: 1.85, ascendDir: "E", baseY: 0, topY: CORE_PLATFORM_HEIGHT },
  { id: "ramp_core_e", x: 7.2, z: 0, halfX: 2.1, halfZ: 1.85, ascendDir: "W", baseY: 0, topY: CORE_PLATFORM_HEIGHT },

  // Ramps up to West & East Sniper Overlook Decks (y: 0 -> 1.45)
  { id: "ramp_west_n", x: -18.5, z: -6.1, halfX: 1.8, halfZ: 2.0, ascendDir: "S", baseY: 0, topY: 1.45 },
  { id: "ramp_west_s", x: -18.5, z: 6.1, halfX: 1.8, halfZ: 2.0, ascendDir: "N", baseY: 0, topY: 1.45 },
  { id: "ramp_east_n", x: 18.5, z: -6.1, halfX: 1.8, halfZ: 2.0, ascendDir: "S", baseY: 0, topY: 1.45 },
  { id: "ramp_east_s", x: 18.5, z: 6.1, halfX: 1.8, halfZ: 2.0, ascendDir: "N", baseY: 0, topY: 1.45 },
];

export const ARENA_JUMP_PADS: ArenaJumpPad[] = [
  {
    id: "jpad_nw",
    x: -17.5,
    z: -17.5,
    radius: 1.55,
    launchVx: 9.8,
    launchVy: 11.2,
    launchVz: 9.8,
    colorHex: 0x22d3ee,
  },
  {
    id: "jpad_ne",
    x: 17.5,
    z: -17.5,
    radius: 1.55,
    launchVx: -9.8,
    launchVy: 11.2,
    launchVz: 9.8,
    colorHex: 0x22d3ee,
  },
  {
    id: "jpad_sw",
    x: -17.5,
    z: 17.5,
    radius: 1.55,
    launchVx: 9.8,
    launchVy: 11.2,
    launchVz: -9.8,
    colorHex: 0xf43f5e,
  },
  {
    id: "jpad_se",
    x: 17.5,
    z: 17.5,
    radius: 1.55,
    launchVx: -9.8,
    launchVy: 11.2,
    launchVz: -9.8,
    colorHex: 0xf43f5e,
  },
];

export const ARENA_SPAWN_POINTS: ArenaSpawnPoint[] = [
  // CYAN (North half)
  { x: -6.5, y: 0, z: -21.2, yaw: 0, team: "CYAN" },
  { x: 6.5, y: 0, z: -21.2, yaw: 0, team: "CYAN" },
  { x: -13.5, y: 0, z: -19.5, yaw: 0.35, team: "CYAN" },
  { x: 13.5, y: 0, z: -19.5, yaw: -0.35, team: "CYAN" },
  // CRIMSON (South half)
  { x: -6.5, y: 0, z: 21.2, yaw: Math.PI, team: "CRIMSON" },
  { x: 6.5, y: 0, z: 21.2, yaw: Math.PI, team: "CRIMSON" },
  { x: -13.5, y: 0, z: 19.5, yaw: Math.PI - 0.35, team: "CRIMSON" },
  { x: 13.5, y: 0, z: 19.5, yaw: -Math.PI + 0.35, team: "CRIMSON" },
];

export function createInitialPickupPads(): CarbonPickupPad[] {
  const defs: Array<{ id: string; kind: CarbonPickupKind; x: number; y: number; z: number }> = [
    { id: "pad_overdrive", kind: "OVERDRIVE_AMP", x: 0, y: CORE_PLATFORM_HEIGHT, z: 0 },
    { id: "pad_rail_w", kind: "WEAPON_RAILGUN", x: -18.5, y: 1.45, z: 0 },
    { id: "pad_rail_e", kind: "WEAPON_RAILGUN", x: 18.5, y: 1.45, z: 0 },
    { id: "pad_shotgun_n", kind: "WEAPON_SHOTGUN", x: 0, y: 0, z: -12.4 },
    { id: "pad_shotgun_s", kind: "WEAPON_SHOTGUN", x: 0, y: 0, z: 12.4 },
    { id: "pad_lobber_nw", kind: "WEAPON_LOBBER", x: -11.5, y: 0, z: 0 },
    { id: "pad_lobber_se", kind: "WEAPON_LOBBER", x: 11.5, y: 0, z: 0 },
    { id: "pad_shield_ne", kind: "SHIELD_CELL", x: 12.5, y: 0, z: -12.5 },
    { id: "pad_shield_sw", kind: "SHIELD_CELL", x: -12.5, y: 0, z: 12.5 },
  ];
  return defs.map((d) => ({
    ...d,
    available: true,
    respawnAt: 0,
  }));
}

/**
 * Computes exact ground/platform surface height at (x, z) considering current player Y.
 */
export function sampleArenaGroundHeight(x: number, z: number, currentY = 0): number {
  let h = 0;

  // 1. Central circular Overdrive platform
  const distCenter = Math.hypot(x, z);
  if (distCenter <= CORE_PLATFORM_RADIUS) {
    if (currentY >= CORE_PLATFORM_HEIGHT - 0.55) {
      h = Math.max(h, CORE_PLATFORM_HEIGHT);
    }
  }

  // 2. Walkable Sniper Decks
  for (const obs of ARENA_OBSTACLES) {
    if (!obs.walkableTop) continue;
    if (
      Math.abs(x - obs.x) <= obs.halfX + 0.15 &&
      Math.abs(z - obs.z) <= obs.halfZ + 0.15 &&
      currentY >= obs.height - 0.55
    ) {
      h = Math.max(h, obs.baseY + obs.height);
    }
  }

  // 3. Smooth Ramps
  for (const r of ARENA_RAMPS) {
    if (Math.abs(x - r.x) <= r.halfX && Math.abs(z - r.z) <= r.halfZ) {
      let t = 0;
      if (r.ascendDir === "S") t = (z - (r.z - r.halfZ)) / (2 * r.halfZ);
      else if (r.ascendDir === "N") t = (r.z + r.halfZ - z) / (2 * r.halfZ);
      else if (r.ascendDir === "E") t = (x - (r.x - r.halfX)) / (2 * r.halfX);
      else if (r.ascendDir === "W") t = (r.x + r.halfX - x) / (2 * r.halfX);
      const rampY = r.baseY + Math.max(0, Math.min(1, t)) * (r.topY - r.baseY);
      h = Math.max(h, rampY);
    }
  }

  return h;
}

/** Checks if (x, z) is on one of the 4 cardinal core ramps */
function isOnCoreRamp(x: number, z: number): boolean {
  for (let i = 0; i < 4; i++) {
    const r = ARENA_RAMPS[i];
    if (Math.abs(x - r.x) <= r.halfX + 0.25 && Math.abs(z - r.z) <= r.halfZ + 0.35) {
      return true;
    }
  }
  return false;
}

/**
 * Resolves smooth sliding collision against octagonal outer perimeter, obstacles, and platform ledges.
 */
export function resolveArenaMovement(
  x: number,
  y: number,
  z: number,
  radius = PLAYER_RADIUS
): { x: number; z: number } {
  let nx = x;
  let nz = z;

  // 1. Octagonal outer colosseum boundary
  const limit = ARENA_HALF - radius;
  nx = Math.max(-limit, Math.min(limit, nx));
  nz = Math.max(-limit, Math.min(limit, nz));

  // Octagon diagonal corner bevels (|x| + |z| <= diagLimit)
  const diagLimit = 37.5 - radius;
  const manhattan = Math.abs(nx) + Math.abs(nz);
  if (manhattan > diagLimit) {
    const excess = (manhattan - diagLimit) * 0.5;
    nx -= Math.sign(nx) * excess;
    nz -= Math.sign(nz) * excess;
  }

  // 2. Central platform side ledge (if player is on ground y < 0.72 and not on a core ramp, push out)
  const distCenter = Math.hypot(nx, nz);
  const coreWallR = CORE_PLATFORM_RADIUS + radius;
  if (distCenter < coreWallR && distCenter > 0.001 && y < CORE_PLATFORM_HEIGHT - 0.42 && !isOnCoreRamp(nx, nz)) {
    nx = (nx / distCenter) * coreWallR;
    nz = (nz / distCenter) * coreWallR;
  }

  // 3. Solid box obstacles (skip walkable decks if player is high enough or entering via ramp)
  for (const obs of ARENA_OBSTACLES) {
    const topY = obs.baseY + obs.height;
    if (y >= topY - 0.38) continue;
    // Allow smooth ramp entry onto sniper decks from North/South ends
    if (obs.walkableTop && Math.abs(nx - obs.x) <= 1.85 && Math.abs(nz - obs.z) >= obs.halfZ - 0.35 && y >= 0.85) {
      continue;
    }

    const expandX = obs.halfX + radius;
    const expandZ = obs.halfZ + radius;
    const dx = nx - obs.x;
    const dz = nz - obs.z;

    if (Math.abs(dx) < expandX && Math.abs(dz) < expandZ) {
      const overlapX = expandX - Math.abs(dx);
      const overlapZ = expandZ - Math.abs(dz);
      if (overlapX < overlapZ) {
        nx += (dx >= 0 ? 1 : -1) * overlapX;
      } else {
        nz += (dz >= 0 ? 1 : -1) * overlapZ;
      }
    }
  }

  return { x: nx, z: nz };
}

export interface RaycastObstacleHit {
  t: number; // distance along ray
  hx: number;
  hy: number;
  hz: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Fast 3D raycast against arena cover walls, pillars, central platform & outer perimeter.
 * Used for hitscan Railgun, line-of-sight Auto-Fire checks, camera anti-clipping, and Lobber bounces!
 */
export function raycastArenaWorld(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number
): RaycastObstacleHit | null {
  let closestT = maxDist;
  let hitNormal = { nx: 0, ny: 1, nz: 0 };
  let found = false;

  const testAABB = (
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number
  ) => {
    let tmin = 0;
    let tmax = closestT;
    let nX = 0;
    let nY = 0;
    let nZ = 0;

    // X slab
    if (Math.abs(dx) < 1e-6) {
      if (ox < minX || ox > maxX) return;
    } else {
      const inv = 1 / dx;
      let t1 = (minX - ox) * inv;
      let t2 = (maxX - ox) * inv;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        s = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        nX = s;
        nY = 0;
        nZ = 0;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return;
    }

    // Y slab
    if (Math.abs(dy) < 1e-6) {
      if (oy < minY || oy > maxY) return;
    } else {
      const inv = 1 / dy;
      let t1 = (minY - oy) * inv;
      let t2 = (maxY - oy) * inv;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        s = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        nX = 0;
        nY = s;
        nZ = 0;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return;
    }

    // Z slab
    if (Math.abs(dz) < 1e-6) {
      if (oz < minZ || oz > maxZ) return;
    } else {
      const inv = 1 / dz;
      let t1 = (minZ - oz) * inv;
      let t2 = (maxZ - oz) * inv;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        s = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        nX = 0;
        nY = 0;
        nZ = s;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return;
    }

    if (tmin > 0.02 && tmin < closestT) {
      closestT = tmin;
      hitNormal = { nx: nX, ny: nY, nz: nZ };
      found = true;
    }
  };

  // Ground plane y = 0
  if (dy < -1e-4 && oy > 0) {
    const tg = -oy / dy;
    if (tg > 0.02 && tg < closestT) {
      closestT = tg;
      hitNormal = { nx: 0, ny: 1, nz: 0 };
      found = true;
    }
  }

  // Outer perimeter walls
  if (Math.abs(dx) > 1e-5) {
    const boundX = dx > 0 ? ARENA_HALF : -ARENA_HALF;
    const tx = (boundX - ox) / dx;
    if (tx > 0.02 && tx < closestT) {
      const hy = oy + dy * tx;
      const hz = oz + dz * tx;
      if (hy >= 0 && hy <= 7.0 && Math.abs(hz) <= ARENA_HALF) {
        closestT = tx;
        hitNormal = { nx: dx > 0 ? -1 : 1, ny: 0, nz: 0 };
        found = true;
      }
    }
  }
  if (Math.abs(dz) > 1e-5) {
    const boundZ = dz > 0 ? ARENA_HALF : -ARENA_HALF;
    const tz = (boundZ - oz) / dz;
    if (tz > 0.02 && tz < closestT) {
      const hy = oy + dy * tz;
      const hx = ox + dx * tz;
      if (hy >= 0 && hy <= 7.0 && Math.abs(hx) <= ARENA_HALF) {
        closestT = tz;
        hitNormal = { nx: 0, ny: 0, nz: dz > 0 ? -1 : 1 };
        found = true;
      }
    }
  }

  // Obstacles
  for (const obs of ARENA_OBSTACLES) {
    testAABB(
      obs.x - obs.halfX,
      obs.x + obs.halfX,
      obs.baseY,
      obs.baseY + obs.height,
      obs.z - obs.halfZ,
      obs.z + obs.halfZ
    );
  }

  // Central platform cylinder approximation
  testAABB(
    -CORE_PLATFORM_RADIUS * 0.88,
    CORE_PLATFORM_RADIUS * 0.88,
    0,
    CORE_PLATFORM_HEIGHT,
    -CORE_PLATFORM_RADIUS * 0.88,
    CORE_PLATFORM_RADIUS * 0.88
  );

  if (!found) return null;
  return {
    t: closestT,
    hx: ox + dx * closestT,
    hy: oy + dy * closestT,
    hz: oz + dz * closestT,
    ...hitNormal,
  };
}
