import {
  CarbonBarrelState,
  CarbonPickupKind,
  CarbonPickupPad,
  CarbonTeam,
} from "./types";

/**
 * OPERATION ATLAS 3D — "قاعدة الأطلس الساحلية" (Coastal Military Outpost)
 * Massive 96m x 96m Island Base (X/Z in [-48, +48]) surrounded by sunlit Mediterranean ocean:
 * - Zone 1 (Center): Elevated Concrete Helipad Deck (18m x 18m @ y = 1.6m) with 4 wide entry ramps
 * - Zone 2 (West): Cargo Shipping Container Dockyard + Elevated Harbor Pier (@ y = 2.0m)
 * - Zone 3 (East): Weathered Moroccan Kasbah Stone Fortress + Elevated Sniper Terrace (@ y = 2.0m)
 * - Zone 4 & 5 (North/South): Task Force & OpFor Garrison Compounds with blast walls & supply depots
 */
export const ARENA_HALF = 48.0;
export const CORE_PLATFORM_RADIUS = 5.6;
export const CORE_PLATFORM_HEIGHT = 1.6;
export const CORE_CAPTURE_RADIUS = 5.6;
export const PLAYER_RADIUS = 0.48;
export const EYE_HEIGHT = 1.52;

export const JOG_SPEED = 5.5;
export const SPRINT_SPEED = 7.3;
export const ROLL_SPEED = 13.0;

export type ObstacleVisualStyle =
  | "SANDBAG"
  | "CONTAINER_RED"
  | "CONTAINER_BLUE"
  | "CONTAINER_OLIVE"
  | "WOOD_CRATE"
  | "KASBAH_WALL"
  | "KASBAH_LOW"
  | "CONCRETE_BARRIER"
  | "RADAR_TOWER";

export interface ArenaBoxObstacle {
  id: string;
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  baseY: number;
  height: number;
  style: ObstacleVisualStyle;
  accentHex?: number;
}

export interface ArenaElevatedPlatform {
  id: string;
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  topY: number;
  theme: "HELIPAD" | "DOCK_PIER" | "KASBAH_TERRACE";
}

export interface ArenaRamp {
  id: string;
  platformId: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  lowY: number;
  highY: number;
  ascendDir: "+Z" | "-Z" | "+X" | "-X";
}

export interface ArenaHardpointZone {
  id: string;
  nameAr: string;
  x: number;
  y: number;
  z: number;
  radius: number;
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

export interface ArenaBushZone {
  id: string;
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
}

export const HARDPOINT_ZONES: ArenaHardpointZone[] = [
  {
    id: "hp_helipad",
    nameAr: "مهبط المروحيات 🚁",
    x: 0,
    y: 1.6,
    z: 0,
    radius: 5.6,
  },
  {
    id: "hp_dockyard",
    nameAr: "رصيف الحاويات 🚢",
    x: -22.5,
    y: 0,
    z: 0,
    radius: 5.6,
  },
  {
    id: "hp_kasbah",
    nameAr: "قلعة القصبة 🏰",
    x: 22.5,
    y: 0,
    z: 0,
    radius: 5.6,
  },
];

export const ARENA_PLATFORMS: ArenaElevatedPlatform[] = [
  {
    id: "helipad_deck",
    x: 0,
    z: 0,
    halfX: 9.0,
    halfZ: 9.0,
    topY: 1.6,
    theme: "HELIPAD",
  },
  {
    id: "dock_platform",
    x: -33.0,
    z: 0,
    halfX: 5.0,
    halfZ: 8.5,
    topY: 2.0,
    theme: "DOCK_PIER",
  },
  {
    id: "kasbah_terrace",
    x: 33.0,
    z: 0,
    halfX: 5.0,
    halfZ: 8.5,
    topY: 2.0,
    theme: "KASBAH_TERRACE",
  },
];

export const ARENA_RAMPS: ArenaRamp[] = [
  // Central Helipad 4-way Ramps
  {
    id: "ramp_heli_n",
    platformId: "helipad_deck",
    minX: -2.5,
    maxX: 2.5,
    minZ: -14.2,
    maxZ: -9.0,
    lowY: 0,
    highY: 1.6,
    ascendDir: "+Z",
  },
  {
    id: "ramp_heli_s",
    platformId: "helipad_deck",
    minX: -2.5,
    maxX: 2.5,
    minZ: 9.0,
    maxZ: 14.2,
    lowY: 0,
    highY: 1.6,
    ascendDir: "-Z",
  },
  {
    id: "ramp_heli_w",
    platformId: "helipad_deck",
    minX: -14.2,
    maxX: -9.0,
    minZ: -2.5,
    maxZ: 2.5,
    lowY: 0,
    highY: 1.6,
    ascendDir: "+X",
  },
  {
    id: "ramp_heli_e",
    platformId: "helipad_deck",
    minX: 9.0,
    maxX: 14.2,
    minZ: -2.5,
    maxZ: 2.5,
    lowY: 0,
    highY: 1.6,
    ascendDir: "-X",
  },
  // West Dockyard Pier Ramps
  {
    id: "ramp_dock_n",
    platformId: "dock_platform",
    minX: -35.2,
    maxX: -30.8,
    minZ: -14.5,
    maxZ: -8.5,
    lowY: 0,
    highY: 2.0,
    ascendDir: "+Z",
  },
  {
    id: "ramp_dock_s",
    platformId: "dock_platform",
    minX: -35.2,
    maxX: -30.8,
    minZ: 8.5,
    maxZ: 14.5,
    lowY: 0,
    highY: 2.0,
    ascendDir: "-Z",
  },
  // East Kasbah Sniper Terrace Stone Ramps
  {
    id: "ramp_kasbah_n",
    platformId: "kasbah_terrace",
    minX: 30.8,
    maxX: 35.2,
    minZ: -14.5,
    maxZ: -8.5,
    lowY: 0,
    highY: 2.0,
    ascendDir: "+Z",
  },
  {
    id: "ramp_kasbah_s",
    platformId: "kasbah_terrace",
    minX: 30.8,
    maxX: 35.2,
    minZ: 8.5,
    maxZ: 14.5,
    lowY: 0,
    highY: 2.0,
    ascendDir: "-Z",
  },
];

export const ARENA_OBSTACLES: ArenaBoxObstacle[] = [
  // --- ZONE 1: CENTRAL HELIPAD TACTICAL SANDBAG BUNKERS (on y = 1.6m deck) ---
  { id: "heli_sb_nw", x: -6.2, z: -6.2, halfX: 1.65, halfZ: 0.8, baseY: 1.6, height: 1.12, style: "SANDBAG" },
  { id: "heli_sb_ne", x: 6.2, z: -6.2, halfX: 1.65, halfZ: 0.8, baseY: 1.6, height: 1.12, style: "SANDBAG" },
  { id: "heli_sb_sw", x: -6.2, z: 6.2, halfX: 1.65, halfZ: 0.8, baseY: 1.6, height: 1.12, style: "SANDBAG" },
  { id: "heli_sb_se", x: 6.2, z: 6.2, halfX: 1.65, halfZ: 0.8, baseY: 1.6, height: 1.12, style: "SANDBAG" },

  // Diagonal Radar & Communications Towers framing Center Plaza
  { id: "radar_nw", x: -12.8, z: -12.8, halfX: 1.35, halfZ: 1.35, baseY: 0, height: 5.8, style: "RADAR_TOWER" },
  { id: "radar_se", x: 12.8, z: 12.8, halfX: 1.35, halfZ: 1.35, baseY: 0, height: 5.8, style: "RADAR_TOWER" },

  // --- ZONE 2: WEST CARGO DOCKYARD (Corrugated Steel ISO Containers + Timber Crates) ---
  { id: "cont_west_n", x: -22.5, z: -9.4, halfX: 3.2, halfZ: 1.35, baseY: 0, height: 2.85, style: "CONTAINER_RED" },
  { id: "cont_west_s", x: -22.5, z: 9.4, halfX: 3.2, halfZ: 1.35, baseY: 0, height: 2.85, style: "CONTAINER_BLUE" },
  { id: "cont_lane_nw", x: -16.5, z: -17.5, halfX: 1.35, halfZ: 3.3, baseY: 0, height: 2.85, style: "CONTAINER_OLIVE" },
  { id: "cont_lane_sw", x: -16.5, z: 17.5, halfX: 1.35, halfZ: 3.3, baseY: 0, height: 2.85, style: "CONTAINER_RED" },
  { id: "cont_outer_nw", x: -31.5, z: -22.5, halfX: 3.2, halfZ: 1.35, baseY: 0, height: 2.85, style: "CONTAINER_BLUE" },
  { id: "cont_outer_sw", x: -31.5, z: 22.5, halfX: 3.2, halfZ: 1.35, baseY: 0, height: 2.85, style: "CONTAINER_OLIVE" },
  { id: "crate_dock_nw", x: -18.0, z: -4.4, halfX: 1.15, halfZ: 0.95, baseY: 0, height: 1.22, style: "WOOD_CRATE" },
  { id: "crate_dock_sw", x: -18.0, z: 4.4, halfX: 1.15, halfZ: 0.95, baseY: 0, height: 1.22, style: "WOOD_CRATE" },
  { id: "pier_cover_n", x: -28.8, z: -4.2, halfX: 0.75, halfZ: 1.85, baseY: 2.0, height: 1.15, style: "SANDBAG" },
  { id: "pier_cover_s", x: -28.8, z: 4.2, halfX: 0.75, halfZ: 1.85, baseY: 2.0, height: 1.15, style: "SANDBAG" },

  // --- ZONE 3: EAST OLD KASBAH FORTRESS (Stone Ruin Walls, Towers & Battlements) ---
  { id: "kasbah_wall_n", x: 22.5, z: -9.4, halfX: 3.4, halfZ: 0.95, baseY: 0, height: 3.3, style: "KASBAH_WALL" },
  { id: "kasbah_wall_s", x: 22.5, z: 9.4, halfX: 3.4, halfZ: 0.95, baseY: 0, height: 3.3, style: "KASBAH_WALL" },
  { id: "kasbah_tower_ne", x: 16.5, z: -17.5, halfX: 1.75, halfZ: 2.5, baseY: 0, height: 3.8, style: "KASBAH_WALL" },
  { id: "kasbah_tower_se", x: 16.5, z: 17.5, halfX: 1.75, halfZ: 2.5, baseY: 0, height: 3.8, style: "KASBAH_WALL" },
  { id: "kasbah_outer_ne", x: 31.5, z: -22.5, halfX: 3.2, halfZ: 1.0, baseY: 0, height: 3.2, style: "KASBAH_WALL" },
  { id: "kasbah_outer_se", x: 31.5, z: 22.5, halfX: 3.2, halfZ: 1.0, baseY: 0, height: 3.2, style: "KASBAH_WALL" },
  { id: "kasbah_low_nw", x: 18.0, z: -4.4, halfX: 1.15, halfZ: 0.85, baseY: 0, height: 1.18, style: "KASBAH_LOW" },
  { id: "kasbah_low_sw", x: 18.0, z: 4.4, halfX: 1.15, halfZ: 0.85, baseY: 0, height: 1.18, style: "KASBAH_LOW" },
  { id: "terrace_parapet_n", x: 28.8, z: -4.2, halfX: 0.75, halfZ: 1.85, baseY: 2.0, height: 1.15, style: "KASBAH_LOW" },
  { id: "terrace_parapet_s", x: 28.8, z: 4.2, halfX: 0.75, halfZ: 1.85, baseY: 2.0, height: 1.15, style: "KASBAH_LOW" },

  // --- ZONES 4 & 5: NORTH & SOUTH GARRISON COMPOUNDS & MID-FIELD BUNKERS ---
  { id: "garrison_n_wall", x: 0, z: -26.5, halfX: 4.6, halfZ: 0.95, baseY: 0, height: 2.55, style: "CONCRETE_BARRIER" },
  { id: "garrison_s_wall", x: 0, z: 26.5, halfX: 4.6, halfZ: 0.95, baseY: 0, height: 2.55, style: "CONCRETE_BARRIER" },
  { id: "mid_sb_nw", x: -8.2, z: -19.5, halfX: 1.85, halfZ: 0.85, baseY: 0, height: 1.18, style: "SANDBAG" },
  { id: "mid_sb_ne", x: 8.2, z: -19.5, halfX: 1.85, halfZ: 0.85, baseY: 0, height: 1.18, style: "SANDBAG" },
  { id: "mid_sb_sw", x: -8.2, z: 19.5, halfX: 1.85, halfZ: 0.85, baseY: 0, height: 1.18, style: "SANDBAG" },
  { id: "mid_sb_se", x: 8.2, z: 19.5, halfX: 1.85, halfZ: 0.85, baseY: 0, height: 1.18, style: "SANDBAG" },
  { id: "bunker_nw", x: -12.5, z: -35.0, halfX: 2.8, halfZ: 1.05, baseY: 0, height: 2.25, style: "CONCRETE_BARRIER" },
  { id: "bunker_ne", x: 12.5, z: -35.0, halfX: 2.8, halfZ: 1.05, baseY: 0, height: 2.25, style: "CONCRETE_BARRIER" },
  { id: "bunker_sw", x: -12.5, z: 35.0, halfX: 2.8, halfZ: 1.05, baseY: 0, height: 2.25, style: "CONCRETE_BARRIER" },
  { id: "bunker_se", x: 12.5, z: 35.0, halfX: 2.8, halfZ: 1.05, baseY: 0, height: 2.25, style: "CONCRETE_BARRIER" },
  { id: "crate_n_depot", x: 0, z: -38.5, halfX: 2.1, halfZ: 1.1, baseY: 0, height: 1.35, style: "WOOD_CRATE" },
  { id: "crate_s_depot", x: 0, z: 38.5, halfX: 2.1, halfZ: 1.1, baseY: 0, height: 1.35, style: "WOOD_CRATE" },
];

export const ARENA_JUMP_PADS: ArenaJumpPad[] = [];

export const ARENA_SPAWN_POINTS: ArenaSpawnPoint[] = [
  // CYAN / Task Force North Garrison
  { x: -6.5, y: 0, z: -31.5, yaw: 0, team: "CYAN" },
  { x: 6.5, y: 0, z: -31.5, yaw: 0, team: "CYAN" },
  { x: -23.5, y: 0, z: -27.5, yaw: 0.35, team: "CYAN" },
  { x: 23.5, y: 0, z: -27.5, yaw: -0.35, team: "CYAN" },
  // CRIMSON / OpFor South Garrison
  { x: -6.5, y: 0, z: 31.5, yaw: Math.PI, team: "CRIMSON" },
  { x: 6.5, y: 0, z: 31.5, yaw: Math.PI, team: "CRIMSON" },
  { x: -23.5, y: 0, z: 27.5, yaw: Math.PI - 0.35, team: "CRIMSON" },
  { x: 23.5, y: 0, z: 27.5, yaw: -Math.PI + 0.35, team: "CRIMSON" },
];

export const ARENA_BUSHES: ArenaBushZone[] = [];

export function isInsideArenaBush(_x: number, _z: number): boolean {
  return false;
}

export function createInitialPickupPads(): CarbonPickupPad[] {
  const defs: Array<{ id: string; kind: CarbonPickupKind; x: number; y: number; z: number }> = [
    // Elevated Sniper Overlooks (AWP Atlas Sniper)
    { id: "pad_rail_dock", kind: "WEAPON_RAILGUN", x: -33.0, y: 2.0, z: 0 },
    { id: "pad_rail_kasbah", kind: "WEAPON_RAILGUN", x: 33.0, y: 2.0, z: 0 },
    // Close-Quarters Breacher Shotguns
    { id: "pad_shotgun_n", kind: "WEAPON_SHOTGUN", x: 0, y: 0, z: -17.5 },
    { id: "pad_shotgun_s", kind: "WEAPON_SHOTGUN", x: 0, y: 0, z: 17.5 },
    // M32 Rotary Grenade Launchers
    { id: "pad_lobber_w", kind: "WEAPON_LOBBER", x: -15.5, y: 0, z: -9.5 },
    { id: "pad_lobber_e", kind: "WEAPON_LOBBER", x: 15.5, y: 0, z: 9.5 },
    // Armor & Medkit Supply Stations
    { id: "pad_shield_nw", kind: "SHIELD_CELL", x: -14.5, y: 0, z: 9.5 },
    { id: "pad_shield_se", kind: "SHIELD_CELL", x: 14.5, y: 0, z: -9.5 },
    { id: "pad_shield_n", kind: "SHIELD_CELL", x: 0, y: 0, z: -23.2 },
    { id: "pad_shield_s", kind: "SHIELD_CELL", x: 0, y: 0, z: 23.2 },
    // Tactical Overdrive Amps on Central Helipad Flanks
    { id: "pad_overdrive_w", kind: "OVERDRIVE_AMP", x: -6.5, y: 1.6, z: 0 },
    { id: "pad_overdrive_e", kind: "OVERDRIVE_AMP", x: 6.5, y: 1.6, z: 0 },
  ];
  return defs.map((d) => ({
    ...d,
    available: true,
    respawnAt: 0,
  }));
}

export function createInitialBarrels(): CarbonBarrelState[] {
  const pts: Array<{ id: string; x: number; y: number; z: number }> = [
    { id: "brl_heli_n", x: 3.6, y: 1.6, z: -5.4 },
    { id: "brl_heli_s", x: -3.6, y: 1.6, z: 5.4 },
    { id: "brl_dock_1", x: -20.2, y: 0, z: -6.8 },
    { id: "brl_dock_2", x: -20.2, y: 0, z: 6.8 },
    { id: "brl_kasbah_1", x: 20.2, y: 0, z: -6.8 },
    { id: "brl_kasbah_2", x: 20.2, y: 0, z: 6.8 },
    { id: "brl_mid_nw", x: -5.2, y: 0, z: -18.8 },
    { id: "brl_mid_se", x: 5.2, y: 0, z: 18.8 },
    { id: "brl_lane_w", x: -14.4, y: 0, z: -15.2 },
    { id: "brl_lane_e", x: 14.4, y: 0, z: 15.2 },
  ];
  return pts.map((p) => ({
    ...p,
    hp: 40,
    alive: true,
    respawnAt: 0,
  }));
}

function evalRampHeight(r: ArenaRamp, x: number, z: number): number {
  let t = 0;
  if (r.ascendDir === "+Z") {
    t = (z - r.minZ) / Math.max(0.01, r.maxZ - r.minZ);
  } else if (r.ascendDir === "-Z") {
    t = (r.maxZ - z) / Math.max(0.01, r.maxZ - r.minZ);
  } else if (r.ascendDir === "+X") {
    t = (x - r.minX) / Math.max(0.01, r.maxX - r.minX);
  } else {
    t = (r.maxX - x) / Math.max(0.01, r.maxX - r.minX);
  }
  const clamped = Math.max(0, Math.min(1, t));
  return r.lowY + (r.highY - r.lowY) * clamped;
}

/**
 * Computes exact multi-level terrain & ramp elevation at (x, z).
 */
export function sampleArenaGroundHeight(x: number, z: number, currentY = 0): number {
  let bestY = 0;

  for (const r of ARENA_RAMPS) {
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
      const ry = evalRampHeight(r, x, z);
      if (ry > bestY) bestY = ry;
    }
  }

  for (const p of ARENA_PLATFORMS) {
    if (Math.abs(x - p.x) <= p.halfX && Math.abs(z - p.z) <= p.halfZ) {
      if (currentY >= p.topY - 0.68) {
        if (p.topY > bestY) bestY = p.topY;
      }
    }
  }

  return bestY;
}

/**
 * Smooth sliding collision against island seawalls, elevated platform retaining walls,
 * shipping containers, Kasbah fortress walls, and sandbag bunkers.
 */
export function resolveArenaMovement(
  x: number,
  y: number,
  z: number,
  radius = PLAYER_RADIUS
): { x: number; z: number } {
  let nx = x;
  let nz = z;

  const limit = ARENA_HALF - radius - 0.3;
  nx = Math.max(-limit, Math.min(limit, nx));
  nz = Math.max(-limit, Math.min(limit, nz));

  // Elevated platforms act as solid concrete retaining walls when player is below their deck
  // (except along connected ramp entry openings where the player smoothly ascends!)
  for (const p of ARENA_PLATFORMS) {
    if (y >= p.topY - 0.65) continue;

    // Check if player is currently aligned inside a ramp feeding this platform near its top edge
    let onConnectedRampTop = false;
    for (const r of ARENA_RAMPS) {
      if (r.platformId !== p.id) continue;
      if (
        nx >= r.minX + radius * 0.35 &&
        nx <= r.maxX - radius * 0.35 &&
        nz >= r.minZ - 0.3 &&
        nz <= r.maxZ + 0.3 &&
        evalRampHeight(r, nx, nz) >= p.topY - 0.72
      ) {
        onConnectedRampTop = true;
        break;
      }
    }
    if (onConnectedRampTop) continue;

    const expandX = p.halfX + radius;
    const expandZ = p.halfZ + radius;
    const dx = nx - p.x;
    const dz = nz - p.z;
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

  // Cover boxes, containers, Kasbah walls, and bunkers (respecting vertical height overlap!)
  for (const obs of ARENA_OBSTACLES) {
    if (y >= obs.baseY + obs.height - 0.15) continue;
    if (y + 1.75 <= obs.baseY) continue;

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
  t: number;
  hx: number;
  hy: number;
  hz: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Fast 3D raycast against coastal ground, elevated platforms, ramps, containers, Kasbah walls & sandbags.
 * Used for both ballistic hit-detection AND TPS right-shoulder camera spring-arm anti-clipping!
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

  // Ground plane y = 0
  if (dy < -1e-4 && oy > 0) {
    const tg = -oy / dy;
    if (tg > 0.02 && tg < closestT) {
      closestT = tg;
      hitNormal = { nx: 0, ny: 1, nz: 0 };
      found = true;
    }
  }

  // Island perimeter seawall curbs
  if (Math.abs(dx) > 1e-5) {
    const boundX = dx > 0 ? ARENA_HALF : -ARENA_HALF;
    const tx = (boundX - ox) / dx;
    if (tx > 0.02 && tx < closestT) {
      const hy = oy + dy * tx;
      const hz = oz + dz * tx;
      if (hy >= 0 && hy <= 1.6 && Math.abs(hz) <= ARENA_HALF) {
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
      if (hy >= 0 && hy <= 1.6 && Math.abs(hx) <= ARENA_HALF) {
        closestT = tz;
        hitNormal = { nx: 0, ny: 0, nz: dz > 0 ? -1 : 1 };
        found = true;
      }
    }
  }

  // Elevated Concrete / Stone Platforms
  for (const p of ARENA_PLATFORMS) {
    testAABB(
      p.x - p.halfX,
      p.x + p.halfX,
      0,
      p.topY,
      p.z - p.halfZ,
      p.z + p.halfZ
    );
  }

  // Cover Boxes, Shipping Containers, Kasbah Walls & Bunkers
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
