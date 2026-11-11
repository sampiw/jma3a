import { CarbonPickupKind, CarbonPickupPad, CarbonTeam } from "./types";

/**
 * Clean, tight, action-packed Brawl-style Daylight Stadium (38m x 38m, X/Z in [-19, +19]).
 * Low-profile rounded cover blocks (1.45m tall) so the elevated Top-Down 3D camera
 * NEVER gets blocked and every player has crystal-clear 360° visibility on Portrait & Landscape phones!
 */
export const ARENA_HALF = 19.0;
export const CORE_PLATFORM_RADIUS = 4.2;
export const CORE_PLATFORM_HEIGHT = 0.0; // Flat clean stadium court for snappy top-down aiming
export const CORE_CAPTURE_RADIUS = 4.0;
export const PLAYER_RADIUS = 0.54;
export const EYE_HEIGHT = 1.2;

export interface ArenaBoxObstacle {
  id: string;
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  baseY: number;
  height: number;
  style: "SANDSTONE_WALL" | "SUPPLY_CRATE" | "HEDGEROW";
  walkableTop?: boolean;
  accentHex?: number;
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
 * 8 Clean, Symmetrical Low-Profile Cover Blocks (like Brawl Stars Champion Stadium):
 * - Open central Star Medallion for clean duels
 * - 4 inner cover blocks with generous lanes
 * - 4 outer wing crates/walls protecting spawns
 */
export const ARENA_OBSTACLES: ArenaBoxObstacle[] = [
  // 4 Inner Tactical Sandstone Cover Walls framing the center ring
  {
    id: "wall_nw",
    x: -6.2,
    z: -5.8,
    halfX: 1.85,
    halfZ: 0.75,
    baseY: 0,
    height: 1.45,
    style: "SANDSTONE_WALL",
  },
  {
    id: "wall_ne",
    x: 6.2,
    z: -5.8,
    halfX: 1.85,
    halfZ: 0.75,
    baseY: 0,
    height: 1.45,
    style: "SANDSTONE_WALL",
  },
  {
    id: "wall_sw",
    x: -6.2,
    z: 5.8,
    halfX: 1.85,
    halfZ: 0.75,
    baseY: 0,
    height: 1.45,
    style: "SANDSTONE_WALL",
  },
  {
    id: "wall_se",
    x: 6.2,
    z: 5.8,
    halfX: 1.85,
    halfZ: 0.75,
    baseY: 0,
    height: 1.45,
    style: "SANDSTONE_WALL",
  },

  // 2 Side Supply Crate Clusters (East & West flanks)
  {
    id: "crate_west",
    x: -11.8,
    z: 0,
    halfX: 1.1,
    halfZ: 2.2,
    baseY: 0,
    height: 1.35,
    style: "SUPPLY_CRATE",
  },
  {
    id: "crate_east",
    x: 11.8,
    z: 0,
    halfX: 1.1,
    halfZ: 2.2,
    baseY: 0,
    height: 1.35,
    style: "SUPPLY_CRATE",
  },

  // North & South Spawn Cover Walls
  {
    id: "cover_north",
    x: 0,
    z: -12.4,
    halfX: 2.6,
    halfZ: 0.75,
    baseY: 0,
    height: 1.45,
    style: "SANDSTONE_WALL",
  },
  {
    id: "cover_south",
    x: 0,
    z: 12.4,
    halfX: 2.6,
    halfZ: 0.75,
    baseY: 0,
    height: 1.45,
    style: "SANDSTONE_WALL",
  },
];

export const ARENA_JUMP_PADS: ArenaJumpPad[] = [
  {
    id: "jpad_nw",
    x: -13.8,
    z: -13.8,
    radius: 1.35,
    launchVx: 8.4,
    launchVy: 10.5,
    launchVz: 8.4,
    colorHex: 0x06b6d4,
  },
  {
    id: "jpad_ne",
    x: 13.8,
    z: -13.8,
    radius: 1.35,
    launchVx: -8.4,
    launchVy: 10.5,
    launchVz: 8.4,
    colorHex: 0x06b6d4,
  },
  {
    id: "jpad_sw",
    x: -13.8,
    z: 13.8,
    radius: 1.35,
    launchVx: 8.4,
    launchVy: 10.5,
    launchVz: -8.4,
    colorHex: 0xf97316,
  },
  {
    id: "jpad_se",
    x: 13.8,
    z: 13.8,
    radius: 1.35,
    launchVx: -8.4,
    launchVy: 10.5,
    launchVz: -8.4,
    colorHex: 0xf97316,
  },
];

export const ARENA_SPAWN_POINTS: ArenaSpawnPoint[] = [
  // CYAN / North side
  { x: -5.2, y: 0, z: -15.8, yaw: 0, team: "CYAN" },
  { x: 5.2, y: 0, z: -15.8, yaw: 0, team: "CYAN" },
  { x: -11.5, y: 0, z: -14.2, yaw: 0.35, team: "CYAN" },
  { x: 11.5, y: 0, z: -14.2, yaw: -0.35, team: "CYAN" },
  // CRIMSON / South side
  { x: -5.2, y: 0, z: 15.8, yaw: Math.PI, team: "CRIMSON" },
  { x: 5.2, y: 0, z: 15.8, yaw: Math.PI, team: "CRIMSON" },
  { x: -11.5, y: 0, z: 14.2, yaw: Math.PI - 0.35, team: "CRIMSON" },
  { x: 11.5, y: 0, z: 14.2, yaw: -Math.PI + 0.35, team: "CRIMSON" },
];

export interface ArenaBushZone {
  id: string;
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
}

/**
 * 6 Symmetrical Tall Grass Stealth Bush Clusters (Brawl Stars Ambush Zones):
 * - Walk inside to turn invisible to distant enemies (> 3.8m) until you fire or take damage!
 */
export const ARENA_BUSHES: ArenaBushZone[] = [
  { id: "bush_nw", x: -6.2, z: -3.25, halfX: 2.0, halfZ: 1.45 },
  { id: "bush_ne", x: 6.2, z: -3.25, halfX: 2.0, halfZ: 1.45 },
  { id: "bush_sw", x: -6.2, z: 3.25, halfX: 2.0, halfZ: 1.45 },
  { id: "bush_se", x: 6.2, z: 3.25, halfX: 2.0, halfZ: 1.45 },
  { id: "bush_west_lane", x: -15.2, z: -6.2, halfX: 1.55, halfZ: 2.6 },
  { id: "bush_east_lane", x: 15.2, z: 6.2, halfX: 1.55, halfZ: 2.6 },
];

export function isInsideArenaBush(x: number, z: number): boolean {
  for (const b of ARENA_BUSHES) {
    if (Math.abs(x - b.x) <= b.halfX && Math.abs(z - b.z) <= b.halfZ) {
      return true;
    }
  }
  return false;
}

export function createInitialPickupPads(): CarbonPickupPad[] {
  const defs: Array<{ id: string; kind: CarbonPickupKind; x: number; y: number; z: number }> = [
    { id: "pad_overdrive", kind: "OVERDRIVE_AMP", x: -9.8, y: 0, z: -9.8 },
    { id: "pad_overdrive_se", kind: "OVERDRIVE_AMP", x: 9.8, y: 0, z: 9.8 },
    { id: "pad_rail_w", kind: "WEAPON_RAILGUN", x: -15.4, y: 0, z: 0 },
    { id: "pad_rail_e", kind: "WEAPON_RAILGUN", x: 15.4, y: 0, z: 0 },
    { id: "pad_shotgun_n", kind: "WEAPON_SHOTGUN", x: 0, y: 0, z: -8.8 },
    { id: "pad_shotgun_s", kind: "WEAPON_SHOTGUN", x: 0, y: 0, z: 8.8 },
    { id: "pad_lobber_w", kind: "WEAPON_LOBBER", x: -7.5, y: 0, z: 0 },
    { id: "pad_lobber_e", kind: "WEAPON_LOBBER", x: 7.5, y: 0, z: 0 },
    { id: "pad_shield_ne", kind: "SHIELD_CELL", x: 9.8, y: 0, z: -9.8 },
    { id: "pad_shield_sw", kind: "SHIELD_CELL", x: -9.8, y: 0, z: 9.8 },
  ];
  return defs.map((d) => ({
    ...d,
    available: true,
    respawnAt: 0,
  }));
}

export function sampleArenaGroundHeight(_x: number, _z: number, _currentY = 0): number {
  return 0;
}

/**
 * Smooth sliding collision against stadium walls & low cover blocks.
 * Airborne players flying high off Jump-Pads (y >= 1.35) soar right over low cover walls!
 */
export function resolveArenaMovement(
  x: number,
  y: number,
  z: number,
  radius = PLAYER_RADIUS
): { x: number; z: number } {
  let nx = x;
  let nz = z;

  const limit = ARENA_HALF - radius;
  nx = Math.max(-limit, Math.min(limit, nx));
  nz = Math.max(-limit, Math.min(limit, nz));

  // Rounded stadium corners
  const cornerStart = ARENA_HALF - 4.2;
  if (Math.abs(nx) > cornerStart && Math.abs(nz) > cornerStart) {
    const cx = Math.sign(nx) * cornerStart;
    const cz = Math.sign(nz) * cornerStart;
    const dx = nx - cx;
    const dz = nz - cz;
    const maxR = 4.2 - radius;
    const d = Math.hypot(dx, dz);
    if (d > maxR && d > 1e-4) {
      nx = cx + (dx / d) * maxR;
      nz = cz + (dz / d) * maxR;
    }
  }

  // Low-profile cover obstacles (can jump OVER them via Jump-Pads when y >= 1.35!)
  if (y < 1.32) {
    for (const obs of ARENA_OBSTACLES) {
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
  }

  return { x: nx, z: nz };
}

export interface RaycastObstacleHit {
  t: number;
  hx: number;
  hy: number;
  hz: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Fast 3D raycast against arena cover blocks & stadium perimeter.
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

  if (dy < -1e-4 && oy > 0) {
    const tg = -oy / dy;
    if (tg > 0.02 && tg < closestT) {
      closestT = tg;
      hitNormal = { nx: 0, ny: 1, nz: 0 };
      found = true;
    }
  }

  if (Math.abs(dx) > 1e-5) {
    const boundX = dx > 0 ? ARENA_HALF : -ARENA_HALF;
    const tx = (boundX - ox) / dx;
    if (tx > 0.02 && tx < closestT) {
      const hy = oy + dy * tx;
      const hz = oz + dz * tx;
      if (hy >= 0 && hy <= 3.0 && Math.abs(hz) <= ARENA_HALF) {
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
      if (hy >= 0 && hy <= 3.0 && Math.abs(hx) <= ARENA_HALF) {
        closestT = tz;
        hitNormal = { nx: 0, ny: 0, nz: dz > 0 ? -1 : 1 };
        found = true;
      }
    }
  }

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

  if (!found) return null;
  return {
    t: closestT,
    hx: ox + dx * closestT,
    hy: oy + dy * closestT,
    hz: oz + dz * closestT,
    ...hitNormal,
  };
}
