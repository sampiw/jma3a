export const RIYAD3D_GAME_ID = "riyad3d" as const;

export const RIYAD3D_MIN_PLAYERS = 2;
export const RIYAD3D_MAX_PLAYERS = 8;

/** Total round duration in seconds (3.5 minutes to steal the quota!) */
export const RIYAD3D_ROUND_SECONDS = 210;

/** Arena half-size: 68m × 68m Haunted Moroccan Riyad */
export const RIYAD3D_ARENA_HALF = 34;

export interface Riyad3DWallSegment {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  kind?: "pillar" | "wall" | "arch" | "fountain" | "table";
}

/**
 * 68m × 68m Haunted Moroccan Riyad layout:
 * - Central Cursed Fountain Courtyard (0, 0)
 * - Extraction Van ("🚐 سطافيط الهوندا") parked at the South Gate (0, 27)
 * - 6 Grand Moroccan Salons & Vaults surrounding the courtyard
 */
export const RIYAD3D_WALL_SEGMENTS: Riyad3DWallSegment[] = [
  // Central Haunted Fountain
  { x: 0, z: 0, w: 4.6, d: 4.6, h: 2.2, kind: "fountain" },

  // Inner Courtyard Riwaq Pillars
  { x: -9, z: -9, w: 1.8, d: 1.8, h: 4.8, kind: "pillar" },
  { x: 9, z: -9, w: 1.8, d: 1.8, h: 4.8, kind: "pillar" },
  { x: -9, z: 9, w: 1.8, d: 1.8, h: 4.8, kind: "pillar" },
  { x: 9, z: 9, w: 1.8, d: 1.8, h: 4.8, kind: "pillar" },
  { x: 0, z: -9, w: 1.8, d: 1.8, h: 4.8, kind: "pillar" },
  { x: -9, z: 0, w: 1.8, d: 1.8, h: 4.8, kind: "pillar" },
  { x: 9, z: 0, w: 1.8, d: 1.8, h: 4.8, kind: "pillar" },

  // North Royal Salon Dividers
  { x: -12, z: -16, w: 9, d: 1.5, h: 4.6, kind: "wall" },
  { x: 12, z: -16, w: 9, d: 1.5, h: 4.6, kind: "wall" },
  { x: 0, z: -24, w: 1.5, d: 9, h: 4.6, kind: "wall" },

  // West Wing Corridors & Koutoubia Clock Room
  { x: -17, z: -6, w: 1.5, d: 10, h: 4.6, kind: "wall" },
  { x: -17, z: 10, w: 1.5, d: 10, h: 4.6, kind: "wall" },
  { x: -25, z: 0, w: 8, d: 1.5, h: 4.6, kind: "wall" },

  // East Wing Corridors & Crystal Chandelier Hall
  { x: 17, z: -6, w: 1.5, d: 10, h: 4.6, kind: "wall" },
  { x: 17, z: 10, w: 1.5, d: 10, h: 4.6, kind: "wall" },
  { x: 25, z: 0, w: 8, d: 1.5, h: 4.6, kind: "wall" },

  // South Gate Archways leading to the Extraction Van ("سطافيط الهوندا")
  { x: -11, z: 18, w: 10, d: 1.5, h: 4.6, kind: "arch" },
  { x: 11, z: 18, w: 10, d: 1.5, h: 4.6, kind: "arch" },
];

export interface Riyad3DVect2 {
  x: number;
  z: number;
}

/** Extraction Van zone at the South Gate */
export const RIYAD3D_VAN_ZONE = {
  x: 0,
  z: 27,
  radius: 5.5,
  titleAr: "🚐 سطافيط الهوندا (منطقة التهريب)",
};

export interface Riyad3DHidingSpot {
  id: string;
  titleAr: string;
  emoji: string;
  x: number;
  z: number;
}

export const RIYAD3D_HIDING_SPOTS: Riyad3DHidingSpot[] = [
  { id: "hide_nw", titleAr: "طبلة الصالون الشمالي", emoji: "🪑", x: -18, z: -22 },
  { id: "hide_ne", titleAr: "ماريو الذهب الشرقي", emoji: "🚪", x: 18, z: -22 },
  { id: "hide_w", titleAr: "سدّاري الجناح الغربي", emoji: "🛋️", x: -24, z: -8 },
  { id: "hide_e", titleAr: "سدّاري الجناح الشرقي", emoji: "🛋️", x: 24, z: -8 },
  { id: "hide_sw", titleAr: "خزانة المطبخ القديم", emoji: "📦", x: -22, z: 14 },
  { id: "hide_se", titleAr: "طبلة البهو الجنوبي", emoji: "🪑", x: 22, z: 14 },
];

export type Riyad3DTreasureWeight = "light" | "medium" | "heavy";

export type Riyad3DTreasurePropKind =
  | "crown"
  | "chandelier"
  | "amphora"
  | "chest"
  | "clock"
  | "berrad"
  | "tajine"
  | "tv";

export interface Riyad3DTreasureItem {
  id: string;
  titleAr: string;
  emoji: string;
  propKind: Riyad3DTreasurePropKind;
  weight: Riyad3DTreasureWeight;
  maxValueDh: number;
  currentValueDh: number;
  /** 0 to 100% */
  durability: number;
  x: number;
  z: number;
  carriedByPlayerId: string | null;
  status: "available" | "carried" | "extracted" | "shattered";
  lastDamageText?: string | null;
}

export const RIYAD3D_TREASURE_TEMPLATES: Array<{
  id: string;
  titleAr: string;
  emoji: string;
  propKind: Riyad3DTreasurePropKind;
  weight: Riyad3DTreasureWeight;
  maxValueDh: number;
  x: number;
  z: number;
}> = [
  {
    id: "loot_crown",
    titleAr: "تاج السلطان الذهبي",
    emoji: "👑",
    propKind: "crown",
    weight: "medium",
    maxValueDh: 2500,
    x: 0,
    z: -28,
  },
  {
    id: "loot_chandelier",
    titleAr: "ثريا الكريستال الفاسية",
    emoji: "🕌",
    propKind: "chandelier",
    weight: "heavy",
    maxValueDh: 2200,
    x: 26,
    z: -24,
  },
  {
    id: "loot_amphora",
    titleAr: "فاز الخزف المسفيوي",
    emoji: "🏺",
    propKind: "amphora",
    weight: "heavy",
    maxValueDh: 1850,
    x: -26,
    z: -24,
  },
  {
    id: "loot_chest",
    titleAr: "صندوق المجوهرات الأمازيغي",
    emoji: "💎",
    propKind: "chest",
    weight: "medium",
    maxValueDh: 1650,
    x: -27,
    z: 8,
  },
  {
    id: "loot_clock",
    titleAr: "ساعة الصومعة الذهبية",
    emoji: "🕰️",
    propKind: "clock",
    weight: "medium",
    maxValueDh: 1450,
    x: 27,
    z: 8,
  },
  {
    id: "loot_berrad",
    titleAr: "صينية البراد الفضي الملكي",
    emoji: "🫖",
    propKind: "berrad",
    weight: "light",
    maxValueDh: 1250,
    x: -11,
    z: -19,
  },
  {
    id: "loot_tajine",
    titleAr: "طاجين الذهب المرصّع",
    emoji: "🍲",
    propKind: "tajine",
    weight: "light",
    maxValueDh: 1100,
    x: 11,
    z: -19,
  },
  {
    id: "loot_tv",
    titleAr: "تلفزة الرياض المذهّبة",
    emoji: "📺",
    propKind: "tv",
    weight: "medium",
    maxValueDh: 950,
    x: 0,
    z: -13,
  },
  {
    id: "loot_amphora_south",
    titleAr: "جرّة المرجان العتيقة",
    emoji: "🏺",
    propKind: "amphora",
    weight: "light",
    maxValueDh: 900,
    x: -15,
    z: 22,
  },
  {
    id: "loot_chest_south",
    titleAr: "علبة اللويز الذهبي",
    emoji: "🪙",
    propKind: "chest",
    weight: "light",
    maxValueDh: 850,
    x: 15,
    z: 22,
  },
];

export interface Riyad3DPlayerState {
  id: string;
  name: string;
  extractedDh: number;
  extractedCount: number;
  shatteredCount: number;
  shovesDealt: number;
  timesCaughtByMonster: number;
  carryingLootId: string | null;
  hiddenSpotId: string | null;
  stunnedUntilAt: number | null;
  shoveCooldownUntilAt: number | null;
  spawnX: number;
  spawnZ: number;
}

export interface Riyad3DFeedEvent {
  id: string;
  type: "extract" | "crack" | "shatter" | "shove" | "monster_attack" | "pickup";
  textAr: string;
  createdAt: string;
}

export interface Riyad3DMonsterAlert {
  id: string;
  targetPlayerId: string;
  targetPlayerName: string;
  x: number;
  z: number;
  createdAt: string;
}

export interface Riyad3DState {
  phase: "active" | "finished";
  round: number;
  startedAt: string;
  endsAt: string;
  quotaDh: number;
  totalExtractedDh: number;
  players: Riyad3DPlayerState[];
  treasures: Riyad3DTreasureItem[];
  recentEvents: Riyad3DFeedEvent[];
  lastMonsterAlert: Riyad3DMonsterAlert | null;
  winnerId: string | null;
  winReasonAr: string | null;
  quotaReached: boolean;
  scores: Record<string, number>;
}

/** Realtime 3D broadcast payload per player over Supabase channel */
export interface Riyad3DPoseBroadcast {
  playerId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  carryingLootId: string | null;
  carryingPropKind: Riyad3DTreasurePropKind | null;
  carryingValueDh: number;
  carryingDurability: number;
  hiddenSpotId: string | null;
  stunned: boolean;
  sprinting: boolean;
  ts: number;
}

export interface Riyad3DSettings {
  roundSeconds: number;
  interactionMode: "MULTI_PHONE" | "ONE_PHONE";
}

export type Riyad3DAction =
  | { type: "PICKUP_LOOT"; lootId: string }
  | { type: "DROP_LOOT"; x: number; z: number }
  | {
      type: "DAMAGE_CARRIED_LOOT";
      damagePercent: number;
      reasonAr?: string;
      x?: number;
      z?: number;
    }
  | { type: "EXTRACT_LOOT" }
  | { type: "TOGGLE_HIDE"; spotId: string | null }
  | { type: "SHOVE_PLAYER"; targetPlayerId: string; dropX: number; dropZ: number }
  | { type: "MONSTER_STRIKE"; targetPlayerId: string; dropX: number; dropZ: number }
  | { type: "TIMEOUT_ROUND" }
  | { type: "RESTART_GAME" };
