export const PIRATES3D_GAME_ID = "pirates3d" as const;

export const SEA_ARENA_RADIUS = 58;
export const WIN_SINKS_TARGET = 5;
export const WIN_GOLD_TARGET = 1000;
export const MATCH_DURATION_MS = 180_000; // 3 minutes

export interface CorsairStyleDef {
  id: string;
  nameAr: string;
  emblem: string;
  sailPrimary: string;
  sailSecondary: string;
  hullColor: string;
  trimColor: string;
}

export const CORSAIR_STYLES: CorsairStyleDef[] = [
  {
    id: "gold_sun",
    nameAr: "أسطول الشمس الذهبية",
    emblem: "☀️",
    sailPrimary: "#fef3c7",
    sailSecondary: "#d97706",
    hullColor: "#451a03",
    trimColor: "#facc15",
  },
  {
    id: "crimson_sabre",
    nameAr: "قراصنة السيف الأحمر",
    emblem: "⚔️",
    sailPrimary: "#ffe4e6",
    sailSecondary: "#e11d48",
    hullColor: "#3b0a14",
    trimColor: "#fb7185",
  },
  {
    id: "emerald_kraken",
    nameAr: "بحّارة الأخطبوط الأخضر",
    emblem: "🐙",
    sailPrimary: "#d1fae5",
    sailSecondary: "#059669",
    hullColor: "#0f291e",
    trimColor: "#34d399",
  },
  {
    id: "sapphire_anchor",
    nameAr: "حراس المرساة الزرقاء",
    emblem: "⚓",
    sailPrimary: "#e0f2fe",
    sailSecondary: "#0284c7",
    hullColor: "#0c233b",
    trimColor: "#38bdf8",
  },
  {
    id: "purple_crescent",
    nameAr: "فرسان الهلال الملكي",
    emblem: "🌙",
    sailPrimary: "#f3e8ff",
    sailSecondary: "#7c3aed",
    hullColor: "#261042",
    trimColor: "#c084fc",
  },
  {
    id: "orange_dragon",
    nameAr: "مدفعية التنين الناري",
    emblem: "🐉",
    sailPrimary: "#ffedd5",
    sailSecondary: "#ea580c",
    hullColor: "#3d1806",
    trimColor: "#fb923c",
  },
  {
    id: "teal_shark",
    nameAr: "قراصنة القرش الأطلسي",
    emblem: "🦈",
    sailPrimary: "#ccfbf1",
    sailSecondary: "#0d9488",
    hullColor: "#0b2926",
    trimColor: "#2dd4bf",
  },
  {
    id: "silver_skull",
    nameAr: "أشباح أبي رقراق",
    emblem: "🏴‍☠️",
    sailPrimary: "#f1f5f9",
    sailSecondary: "#334155",
    hullColor: "#1e293b",
    trimColor: "#cbd5e1",
  },
];

export interface SeaIslandObstacle {
  id: string;
  nameAr: string;
  x: number;
  z: number;
  radius: number;
  kind: "FORTRESS" | "LIGHTHOUSE" | "REEF";
}

export const PIRATES_ISLANDS: SeaIslandObstacle[] = [
  {
    id: "sqala_center",
    nameAr: "قلعة السقالة الوسطى",
    x: 0,
    z: 0,
    radius: 8.5,
    kind: "FORTRESS",
  },
  {
    id: "reef_nw",
    nameAr: "منارة الشمال الغربي",
    x: -25,
    z: -22,
    radius: 5.5,
    kind: "LIGHTHOUSE",
  },
  {
    id: "reef_ne",
    nameAr: "صخرة المرسى الشرقي",
    x: 25,
    z: -22,
    radius: 5.2,
    kind: "REEF",
  },
  {
    id: "reef_sw",
    nameAr: "جزيرة الكنز الغربي",
    x: -25,
    z: 22,
    radius: 5.2,
    kind: "REEF",
  },
  {
    id: "reef_se",
    nameAr: "منارة الجنوب الشرقي",
    x: 25,
    z: 22,
    radius: 5.5,
    kind: "LIGHTHOUSE",
  },
];

export type LootCrateKind = "REPAIR" | "DOUBLE_POWDER" | "SHIELD" | "GOLD_CHEST";

export interface SeaLootCrate {
  id: string;
  kind: LootCrateKind;
  x: number;
  z: number;
  spawnedAt: number;
}

export interface PirateShipState {
  id: string;
  nickname: string;
  isBot: boolean;
  styleIndex: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  hp: number;
  maxHp: number;
  shield: number;
  goldScore: number;
  sinks: number;
  deaths: number;
  doublePowderUntil: number;
  windBoostUntil: number;
  sunkUntil: number;
  lastShotAt: number;
  lastBroadsideAt: number;
  lastBoostAt: number;
}

export interface CannonShotRecord {
  id: string;
  shooterId: string;
  shooterStyleIndex: number;
  mode: "SINGLE" | "TRIPLE";
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  hitShipIds: string[];
  sunkShipIds: string[];
  ts: number;
}

export interface BattleFeedItem {
  id: string;
  textAr: string;
  tone: "sink" | "hit" | "loot" | "info";
  ts: number;
}

export interface Pirates3DState {
  phase: "PLAYING" | "GAME_OVER";
  round: number;
  startedAt: number;
  endsAt: number;
  aiBotsEnabled: boolean;
  ships: Record<string, PirateShipState>;
  lootCrates: SeaLootCrate[];
  recentShots: CannonShotRecord[];
  battleFeed: BattleFeedItem[];
  winnerId: string | null;
  winnerSummaryAr: string | null;
  scores: Record<string, number>;
}

export interface Pirates3DSettings {
  aiBotsEnabled: boolean;
  interactionMode?: "MULTI_PHONE" | "ONE_PHONE" | "HYBRID";
}

export type Pirates3DAction =
  | {
      type: "SYNC_SHIP";
      x: number;
      z: number;
      yaw: number;
      speed: number;
    }
  | {
      type: "FIRE_CANNON";
      mode: "SINGLE" | "TRIPLE";
      fromX?: number;
      fromZ?: number;
      aimYaw: number;
      targetX: number;
      targetZ: number;
      targetShipId?: string;
    }
  | {
      type: "WIND_BOOST";
    }
  | {
      type: "AI_TICK";
    }
  | {
      type: "TOGGLE_AI_BOTS";
      enabled?: boolean;
    }
  | {
      type: "RESTART_BATTLE";
    };
