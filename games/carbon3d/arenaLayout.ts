import {
  CarbonBarrelState,
  CarbonPickupKind,
  CarbonPickupPad,
  CarbonTeam,
} from "./types";

/**
 * OPERATION ATLAS 3D — "جزيرة الأطلس العسكرية" (168m x 168m Multi-Sector Island Military Base)
 * Massive 168m x 168m Island (X/Z in [-84, +84], >28,200 m²) surrounded by sunlit Mediterranean ocean:
 * - Sector 1 (Center  0,   0): Central Command Helipad (24m x 24m @ y = 1.8m) + 4 wide assault ramps
 * - Sector 2 (West  -44,   0): Deepwater Cargo Shipping Port + Elevated Harbor Pier (@ y = 2.2m)
 * - Sector 3 (East  +44,   0): Ancient Moroccan Kasbah Stone Citadel + Sniper Terrace (@ y = 2.2m)
 * - Sector 4 (North   0, -46): Northern Radar & Hangar Command Deck (@ y = 2.0m)
 * - Sector 5 (South   0, +46): Southern Munitions & Fuel Depot Deck (@ y = 2.0m)
 * - 4 Diagonal Tactical Jump-Launchers for rapid aerial traversal between sectors!
 */
export const ARENA_HALF = 84.0;
export const CORE_PLATFORM_RADIUS = 6.8;
export const CORE_PLATFORM_HEIGHT = 1.8;
export const CORE_CAPTURE_RADIUS = 6.8;
export const PLAYER_RADIUS = 0.48;
export const EYE_HEIGHT = 1.52;

export const JOG_SPEED = 6.2;
export const SPRINT_SPEED = 8.4;
export const TURBO_SPRINT_SPEED = 11.6;
export const ROLL_SPEED = 14.8;

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
  theme: "HELIPAD" | "DOCK_PIER" | "KASBAH_TERRACE" | "HANGAR";
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
    y: 1.8,
    z: 0,
    radius: 6.8,
  },
  {
    id: "hp_dockyard",
    nameAr: "ميناء الحاويات 🚢",
    x: -40.0,
    y: 0,
    z: 0,
    radius: 6.8,
  },
  {
    id: "hp_kasbah",
    nameAr: "قلعة القصبة 🏰",
    x: 40.0,
    y: 0,
    z: 0,
    radius: 6.8,
  },
  {
    id: "hp_north_radar",
    nameAr: "ثكنة الرادار الشمالية 📡",
    x: 0,
    y: 0,
    z: -40.0,
    radius: 6.8,
  },
  {
    id: "hp_south_depot",
    nameAr: "مستودع الذخيرة الجنوبي 🏭",
    x: 0,
    y: 0,
    z: 40.0,
    radius: 6.8,
  },
];

export const ARENA_PLATFORMS: ArenaElevatedPlatform[] = [
  {
    id: "helipad_deck",
    x: 0,
    z: 0,
    halfX: 12.0,
    halfZ: 12.0,
    topY: 1.8,
    theme: "HELIPAD",
  },
  {
    id: "dock_platform",
    x: -58.0,
    z: 0,
    halfX: 7.0,
    halfZ: 12.0,
    topY: 2.2,
    theme: "DOCK_PIER",
  },
  {
    id: "kasbah_terrace",
    x: 58.0,
    z: 0,
    halfX: 7.0,
    halfZ: 12.0,
    topY: 2.2,
    theme: "KASBAH_TERRACE",
  },
  {
    id: "north_hangar_deck",
    x: 0,
    z: -58.0,
    halfX: 11.0,
    halfZ: 6.5,
    topY: 2.0,
    theme: "HANGAR",
  },
  {
    id: "south_depot_deck",
    x: 0,
    z: 58.0,
    halfX: 11.0,
    halfZ: 6.5,
    topY: 2.0,
    theme: "HANGAR",
  },
];

export const ARENA_RAMPS: ArenaRamp[] = [
  // Sector 1: Central Helipad 4-Way Wide Assault Ramps
  {
    id: "ramp_heli_n",
    platformId: "helipad_deck",
    minX: -3.2,
    maxX: 3.2,
    minZ: -18.5,
    maxZ: -12.0,
    lowY: 0,
    highY: 1.8,
    ascendDir: "+Z",
  },
  {
    id: "ramp_heli_s",
    platformId: "helipad_deck",
    minX: -3.2,
    maxX: 3.2,
    minZ: 12.0,
    maxZ: 18.5,
    lowY: 0,
    highY: 1.8,
    ascendDir: "-Z",
  },
  {
    id: "ramp_heli_w",
    platformId: "helipad_deck",
    minX: -18.5,
    maxX: -12.0,
    minZ: -3.2,
    maxZ: 3.2,
    lowY: 0,
    highY: 1.8,
    ascendDir: "+X",
  },
  {
    id: "ramp_heli_e",
    platformId: "helipad_deck",
    minX: 12.0,
    maxX: 18.5,
    minZ: -3.2,
    maxZ: 3.2,
    lowY: 0,
    highY: 1.8,
    ascendDir: "-X",
  },
  // Sector 2: West Deepwater Pier Ramps
  {
    id: "ramp_dock_n",
    platformId: "dock_platform",
    minX: -61.0,
    maxX: -55.0,
    minZ: -19.0,
    maxZ: -12.0,
    lowY: 0,
    highY: 2.2,
    ascendDir: "+Z",
  },
  {
    id: "ramp_dock_s",
    platformId: "dock_platform",
    minX: -61.0,
    maxX: -55.0,
    minZ: 12.0,
    maxZ: 19.0,
    lowY: 0,
    highY: 2.2,
    ascendDir: "-Z",
  },
  // Sector 3: East Kasbah Citadel Stone Ramps
  {
    id: "ramp_kasbah_n",
    platformId: "kasbah_terrace",
    minX: 55.0,
    maxX: 61.0,
    minZ: -19.0,
    maxZ: -12.0,
    lowY: 0,
    highY: 2.2,
    ascendDir: "+Z",
  },
  {
    id: "ramp_kasbah_s",
    platformId: "kasbah_terrace",
    minX: 55.0,
    maxX: 61.0,
    minZ: 12.0,
    maxZ: 19.0,
    lowY: 0,
    highY: 2.2,
    ascendDir: "-Z",
  },
  // Sector 4: North Radar Command Deck Ramps
  {
    id: "ramp_north_w",
    platformId: "north_hangar_deck",
    minX: -17.5,
    maxX: -11.0,
    minZ: -60.8,
    maxZ: -55.2,
    lowY: 0,
    highY: 2.0,
    ascendDir: "+X",
  },
  {
    id: "ramp_north_e",
    platformId: "north_hangar_deck",
    minX: 11.0,
    maxX: 17.5,
    minZ: -60.8,
    maxZ: -55.2,
    lowY: 0,
    highY: 2.0,
    ascendDir: "-X",
  },
  // Sector 5: South Munitions Depot Deck Ramps
  {
    id: "ramp_south_w",
    platformId: "south_depot_deck",
    minX: -17.5,
    maxX: -11.0,
    minZ: 55.2,
    maxZ: 60.8,
    lowY: 0,
    highY: 2.0,
    ascendDir: "+X",
  },
  {
    id: "ramp_south_e",
    platformId: "south_depot_deck",
    minX: 11.0,
    maxX: 17.5,
    minZ: 55.2,
    maxZ: 60.8,
    lowY: 0,
    highY: 2.0,
    ascendDir: "-X",
  },
];

export const ARENA_OBSTACLES: ArenaBoxObstacle[] = [
  // --- SECTOR 1: CENTRAL HELIPAD SANDBAG BUNKERS & RADAR TOWERS ---
  { id: "heli_sb_nw", x: -8.2, z: -8.2, halfX: 2.0, halfZ: 0.9, baseY: 1.8, height: 1.15, style: "SANDBAG" },
  { id: "heli_sb_ne", x: 8.2, z: -8.2, halfX: 2.0, halfZ: 0.9, baseY: 1.8, height: 1.15, style: "SANDBAG" },
  { id: "heli_sb_sw", x: -8.2, z: 8.2, halfX: 2.0, halfZ: 0.9, baseY: 1.8, height: 1.15, style: "SANDBAG" },
  { id: "heli_sb_se", x: 8.2, z: 8.2, halfX: 2.0, halfZ: 0.9, baseY: 1.8, height: 1.15, style: "SANDBAG" },

  { id: "radar_nw", x: -17.5, z: -17.5, halfX: 1.6, halfZ: 1.6, baseY: 0, height: 6.6, style: "RADAR_TOWER" },
  { id: "radar_se", x: 17.5, z: 17.5, halfX: 1.6, halfZ: 1.6, baseY: 0, height: 6.6, style: "RADAR_TOWER" },

  // --- SECTOR 2: WEST CARGO SHIPPING PORT (ISO Containers + Timber Cargo + Pier Bunkers) ---
  { id: "cont_west_n", x: -40.0, z: -13.0, halfX: 4.2, halfZ: 1.5, baseY: 0, height: 3.1, style: "CONTAINER_RED" },
  { id: "cont_west_s", x: -40.0, z: 13.0, halfX: 4.2, halfZ: 1.5, baseY: 0, height: 3.1, style: "CONTAINER_BLUE" },
  { id: "cont_lane_nw", x: -27.5, z: -20.5, halfX: 1.5, halfZ: 4.2, baseY: 0, height: 3.1, style: "CONTAINER_OLIVE" },
  { id: "cont_lane_sw", x: -27.5, z: 20.5, halfX: 1.5, halfZ: 4.2, baseY: 0, height: 3.1, style: "CONTAINER_RED" },
  { id: "cont_outer_nw", x: -54.0, z: -34.0, halfX: 4.2, halfZ: 1.5, baseY: 0, height: 3.1, style: "CONTAINER_BLUE" },
  { id: "cont_outer_sw", x: -54.0, z: 34.0, halfX: 4.2, halfZ: 1.5, baseY: 0, height: 3.1, style: "CONTAINER_OLIVE" },
  { id: "cont_corner_nw", x: -64.0, z: -52.0, halfX: 1.5, halfZ: 4.2, baseY: 0, height: 3.1, style: "CONTAINER_RED" },
  { id: "cont_corner_sw", x: -64.0, z: 52.0, halfX: 1.5, halfZ: 4.2, baseY: 0, height: 3.1, style: "CONTAINER_BLUE" },
  { id: "crate_dock_nw", x: -31.0, z: -6.2, halfX: 1.4, halfZ: 1.15, baseY: 0, height: 1.3, style: "WOOD_CRATE" },
  { id: "crate_dock_sw", x: -31.0, z: 6.2, halfX: 1.4, halfZ: 1.15, baseY: 0, height: 1.3, style: "WOOD_CRATE" },
  { id: "pier_cover_n", x: -52.2, z: -5.5, halfX: 0.85, halfZ: 2.2, baseY: 2.2, height: 1.18, style: "SANDBAG" },
  { id: "pier_cover_s", x: -52.2, z: 5.5, halfX: 0.85, halfZ: 2.2, baseY: 2.2, height: 1.18, style: "SANDBAG" },

  // --- SECTOR 3: EAST MOROCCAN KASBAH CITADEL (Stone Fortress Walls, Watchtowers & Parapets) ---
  { id: "kasbah_wall_n", x: 40.0, z: -13.0, halfX: 4.4, halfZ: 1.1, baseY: 0, height: 3.6, style: "KASBAH_WALL" },
  { id: "kasbah_wall_s", x: 40.0, z: 13.0, halfX: 4.4, halfZ: 1.1, baseY: 0, height: 3.6, style: "KASBAH_WALL" },
  { id: "kasbah_tower_ne", x: 27.5, z: -20.5, halfX: 2.1, halfZ: 3.2, baseY: 0, height: 4.2, style: "KASBAH_WALL" },
  { id: "kasbah_tower_se", x: 27.5, z: 20.5, halfX: 2.1, halfZ: 3.2, baseY: 0, height: 4.2, style: "KASBAH_WALL" },
  { id: "kasbah_outer_ne", x: 54.0, z: -34.0, halfX: 4.2, halfZ: 1.15, baseY: 0, height: 3.5, style: "KASBAH_WALL" },
  { id: "kasbah_outer_se", x: 54.0, z: 34.0, halfX: 4.2, halfZ: 1.15, baseY: 0, height: 3.5, style: "KASBAH_WALL" },
  { id: "kasbah_corner_ne", x: 64.0, z: -52.0, halfX: 1.2, halfZ: 4.2, baseY: 0, height: 3.6, style: "KASBAH_WALL" },
  { id: "kasbah_corner_se", x: 64.0, z: 52.0, halfX: 1.2, halfZ: 4.2, baseY: 0, height: 3.6, style: "KASBAH_WALL" },
  { id: "kasbah_low_nw", x: 31.0, z: -6.2, halfX: 1.4, halfZ: 1.0, baseY: 0, height: 1.22, style: "KASBAH_LOW" },
  { id: "kasbah_low_sw", x: 31.0, z: 6.2, halfX: 1.4, halfZ: 1.0, baseY: 0, height: 1.22, style: "KASBAH_LOW" },
  { id: "terrace_parapet_n", x: 52.2, z: -5.5, halfX: 0.85, halfZ: 2.2, baseY: 2.2, height: 1.18, style: "KASBAH_LOW" },
  { id: "terrace_parapet_s", x: 52.2, z: 5.5, halfX: 0.85, halfZ: 2.2, baseY: 2.2, height: 1.18, style: "KASBAH_LOW" },

  // --- SECTORS 4 & 5: NORTH RADAR BASE & SOUTH MUNITIONS DEPOT ---
  { id: "garrison_n_wall", x: 0, z: -29.5, halfX: 5.4, halfZ: 1.05, baseY: 0, height: 2.65, style: "CONCRETE_BARRIER" },
  { id: "garrison_s_wall", x: 0, z: 29.5, halfX: 5.4, halfZ: 1.05, baseY: 0, height: 2.65, style: "CONCRETE_BARRIER" },
  { id: "north_deck_sb", x: 0, z: -52.4, halfX: 3.2, halfZ: 0.85, baseY: 2.0, height: 1.15, style: "SANDBAG" },
  { id: "south_deck_sb", x: 0, z: 52.4, halfX: 3.2, halfZ: 0.85, baseY: 2.0, height: 1.15, style: "SANDBAG" },
  { id: "radar_north_main", x: 0, z: -68.5, halfX: 1.8, halfZ: 1.8, baseY: 0, height: 7.4, style: "RADAR_TOWER" },

  { id: "mid_sb_nw", x: -12.5, z: -24.0, halfX: 2.2, halfZ: 0.95, baseY: 0, height: 1.2, style: "SANDBAG" },
  { id: "mid_sb_ne", x: 12.5, z: -24.0, halfX: 2.2, halfZ: 0.95, baseY: 0, height: 1.2, style: "SANDBAG" },
  { id: "mid_sb_sw", x: -12.5, z: 24.0, halfX: 2.2, halfZ: 0.95, baseY: 0, height: 1.2, style: "SANDBAG" },
  { id: "mid_sb_se", x: 12.5, z: 24.0, halfX: 2.2, halfZ: 0.95, baseY: 0, height: 1.2, style: "SANDBAG" },

  { id: "bunker_nw", x: -24.0, z: -48.0, halfX: 3.6, halfZ: 1.2, baseY: 0, height: 2.5, style: "CONCRETE_BARRIER" },
  { id: "bunker_ne", x: 24.0, z: -48.0, halfX: 3.6, halfZ: 1.2, baseY: 0, height: 2.5, style: "CONCRETE_BARRIER" },
  { id: "bunker_sw", x: -24.0, z: 48.0, halfX: 3.6, halfZ: 1.2, baseY: 0, height: 2.5, style: "CONCRETE_BARRIER" },
  { id: "bunker_se", x: 24.0, z: 48.0, halfX: 3.6, halfZ: 1.2, baseY: 0, height: 2.5, style: "CONCRETE_BARRIER" },

  { id: "depot_crate_nw", x: -38.0, z: -36.0, halfX: 1.8, halfZ: 1.4, baseY: 0, height: 1.45, style: "WOOD_CRATE" },
  { id: "depot_crate_ne", x: 38.0, z: -36.0, halfX: 1.8, halfZ: 1.4, baseY: 0, height: 1.45, style: "WOOD_CRATE" },
  { id: "depot_crate_sw", x: -38.0, z: 36.0, halfX: 1.8, halfZ: 1.4, baseY: 0, height: 1.45, style: "WOOD_CRATE" },
  { id: "depot_crate_se", x: 38.0, z: 36.0, halfX: 1.8, halfZ: 1.4, baseY: 0, height: 1.45, style: "WOOD_CRATE" },
  { id: "crate_s_depot", x: 0, z: 70.0, halfX: 2.8, halfZ: 1.3, baseY: 0, height: 1.5, style: "WOOD_CRATE" },
];

// 4 Tactical Jump/Boost Pads at Diagonal Crossroads for Rapid Aerial Sector Traversal!
export const ARENA_JUMP_PADS: ArenaJumpPad[] = [
  {
    id: "jpad_nw",
    x: -22.5,
    z: -32.5,
    radius: 1.85,
    launchVx: 11.5,
    launchVy: 11.8,
    launchVz: 15.5,
    colorHex: 0x38bdf8,
  },
  {
    id: "jpad_ne",
    x: 22.5,
    z: -32.5,
    radius: 1.85,
    launchVx: -11.5,
    launchVy: 11.8,
    launchVz: 15.5,
    colorHex: 0x38bdf8,
  },
  {
    id: "jpad_sw",
    x: -22.5,
    z: 32.5,
    radius: 1.85,
    launchVx: 11.5,
    launchVy: 11.8,
    launchVz: -15.5,
    colorHex: 0x10b981,
  },
  {
    id: "jpad_se",
    x: 22.5,
    z: 32.5,
    radius: 1.85,
    launchVx: -11.5,
    launchVy: 11.8,
    launchVz: -15.5,
    colorHex: 0x10b981,
  },
];

export const ARENA_SPAWN_POINTS: ArenaSpawnPoint[] = [
  // CYAN / Task Force North & West Sectors
  { x: -12.0, y: 0, z: -66.0, yaw: 0, team: "CYAN" },
  { x: 12.0, y: 0, z: -66.0, yaw: 0, team: "CYAN" },
  { x: -46.0, y: 0, z: -48.0, yaw: 0.55, team: "CYAN" },
  { x: 46.0, y: 0, z: -48.0, yaw: -0.55, team: "CYAN" },
  // CRIMSON / OpFor South & East Sectors
  { x: -12.0, y: 0, z: 66.0, yaw: Math.PI, team: "CRIMSON" },
  { x: 12.0, y: 0, z: 66.0, yaw: Math.PI, team: "CRIMSON" },
  { x: -46.0, y: 0, z: 48.0, yaw: Math.PI - 0.55, team: "CRIMSON" },
  { x: 46.0, y: 0, z: 48.0, yaw: -Math.PI + 0.55, team: "CRIMSON" },
];

export const ARENA_BUSHES: ArenaBushZone[] = [];

export function isInsideArenaBush(_x: number, _z: number): boolean {
  return false;
}

export function createInitialPickupPads(): CarbonPickupPad[] {
  const defs: Array<{ id: string; kind: CarbonPickupKind; x: number; y: number; z: number }> = [
    // Elevated Sniper Overlooks (AWP Atlas Sniper on Pier, Kasbah, North & South Decks)
    { id: "pad_rail_dock", kind: "WEAPON_RAILGUN", x: -58.0, y: 2.2, z: 0 },
    { id: "pad_rail_kasbah", kind: "WEAPON_RAILGUN", x: 58.0, y: 2.2, z: 0 },
    { id: "pad_rail_north", kind: "WEAPON_RAILGUN", x: 0, y: 2.0, z: -58.0 },
    { id: "pad_rail_south", kind: "WEAPON_RAILGUN", x: 0, y: 2.0, z: 58.0 },
    // Close-Quarters Breacher Shotguns
    { id: "pad_shotgun_n", kind: "WEAPON_SHOTGUN", x: 0, y: 0, z: -22.5 },
    { id: "pad_shotgun_s", kind: "WEAPON_SHOTGUN", x: 0, y: 0, z: 22.5 },
    { id: "pad_shotgun_w", kind: "WEAPON_SHOTGUN", x: -40.0, y: 0, z: -6.5 },
    { id: "pad_shotgun_e", kind: "WEAPON_SHOTGUN", x: 40.0, y: 0, z: 6.5 },
    // M32 Rotary Grenade Launchers
    { id: "pad_lobber_w", kind: "WEAPON_LOBBER", x: -24.0, y: 0, z: -10.5 },
    { id: "pad_lobber_e", kind: "WEAPON_LOBBER", x: 24.0, y: 0, z: 10.5 },
    // Armor & Medkit Supply Stations across all 5 Sectors
    { id: "pad_shield_nw", kind: "SHIELD_CELL", x: -22.0, y: 0, z: 12.0 },
    { id: "pad_shield_se", kind: "SHIELD_CELL", x: 22.0, y: 0, z: -12.0 },
    { id: "pad_shield_n", kind: "SHIELD_CELL", x: 0, y: 0, z: -36.5 },
    { id: "pad_shield_s", kind: "SHIELD_CELL", x: 0, y: 0, z: 36.5 },
    { id: "pad_shield_dock", kind: "SHIELD_CELL", x: -45.0, y: 0, z: 18.0 },
    { id: "pad_shield_kasbah", kind: "SHIELD_CELL", x: 45.0, y: 0, z: -18.0 },
    // Tactical Overdrive Amps on Central Helipad Flanks
    { id: "pad_overdrive_w", kind: "OVERDRIVE_AMP", x: -9.0, y: 1.8, z: 0 },
    { id: "pad_overdrive_e", kind: "OVERDRIVE_AMP", x: 9.0, y: 1.8, z: 0 },
  ];
  return defs.map((d) => ({
    ...d,
    available: true,
    respawnAt: 0,
  }));
}

export function createInitialBarrels(): CarbonBarrelState[] {
  const pts: Array<{ id: string; x: number; y: number; z: number }> = [
    { id: "brl_heli_n", x: 4.8, y: 1.8, z: -7.5 },
    { id: "brl_heli_s", x: -4.8, y: 1.8, z: 7.5 },
    { id: "brl_dock_1", x: -35.5, y: 0, z: -8.5 },
    { id: "brl_dock_2", x: -35.5, y: 0, z: 8.5 },
    { id: "brl_dock_3", x: -46.0, y: 0, z: -2.0 },
    { id: "brl_kasbah_1", x: 35.5, y: 0, z: -8.5 },
    { id: "brl_kasbah_2", x: 35.5, y: 0, z: 8.5 },
    { id: "brl_kasbah_3", x: 46.0, y: 0, z: 2.0 },
    { id: "brl_north_1", x: -6.8, y: 0, z: -38.5 },
    { id: "brl_north_2", x: 6.8, y: 0, z: -38.5 },
    { id: "brl_south_1", x: -6.8, y: 0, z: 38.5 },
    { id: "brl_south_2", x: 6.8, y: 0, z: 38.5 },
    { id: "brl_mid_nw", x: -8.5, y: 0, z: -23.0 },
    { id: "brl_mid_se", x: 8.5, y: 0, z: 23.0 },
    { id: "brl_lane_w", x: -23.0, y: 0, z: -18.5 },
    { id: "brl_lane_e", x: 23.0, y: 0, z: 18.5 },
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
      if (currentY >= p.topY - 0.72) {
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

  const limit = ARENA_HALF - radius - 0.35;
  nx = Math.max(-limit, Math.min(limit, nx));
  nz = Math.max(-limit, Math.min(limit, nz));

  // Elevated platforms act as solid concrete retaining walls when player is below their deck
  // (except along connected ramp entry openings where the player smoothly ascends!)
  for (const p of ARENA_PLATFORMS) {
    if (y >= p.topY - 0.68) continue;

    let onConnectedRampTop = false;
    for (const r of ARENA_RAMPS) {
      if (r.platformId !== p.id) continue;
      if (
        nx >= r.minX + radius * 0.3 &&
        nx <= r.maxX - radius * 0.3 &&
        nz >= r.minZ - 0.35 &&
        nz <= r.maxZ + 0.35 &&
        evalRampHeight(r, nx, nz) >= p.topY - 0.8
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
 * Fast 3D raycast against coastal ground, elevated platforms, containers, Kasbah walls & sandbags.
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
      if (hy >= 0 && hy <= 1.8 && Math.abs(hz) <= ARENA_HALF) {
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
      if (hy >= 0 && hy <= 1.8 && Math.abs(hx) <= ARENA_HALF) {
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
