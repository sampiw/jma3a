export type KsidaMode = "RACE" | "DERBY" | "HOT_BOMB";

export type KsidaVehicleId =
  | "TAXI_HMER"
  | "MERCEDES_240"
  | "C15_KHATTAF"
  | "TRIPORTEUR"
  | "LOGAN_ECOLE"
  | "JADARMIYA";

export type KsidaItemId =
  | "SANDALA"
  | "BUTAGAZ"
  | "SOAP_OIL"
  | "ATAY_NITRO"
  | "WEDDING_HORN"
  | "WATERMELON";

export type KsidaTauntId =
  | "HAYED"
  | "CONSTAT"
  | "PERMIS"
  | "WALIDA"
  | "C15_LEGEND"
  | "ATAY";

export interface VehicleSpec {
  id: KsidaVehicleId;
  nameAr: string;
  taglineAr: string;
  emoji: string;
  glbPath: string;
  bodyHex: number;
  secondaryHex: number;
  accentHex: string;
  topSpeed: number; // m/s
  accel: number; // m/s^2
  turnRate: number; // rad/s
  driftGrip: number; // 0..1 lateral grip while drifting
  mass: number; // collision momentum weight
  maxHp: number;
}

export const KSIDA_VEHICLES: Record<KsidaVehicleId, VehicleSpec> = {
  TAXI_HMER: {
    id: "TAXI_HMER",
    nameAr: "طاكسي صغير حمر",
    taglineAr: "ملك الزناقي والدريفت السريع — طاكسي كازا الأصلي 🧿",
    emoji: "🚕",
    glbPath: "/models/cars/taxi.glb",
    bodyHex: 0xdc2626,
    secondaryHex: 0x18181b,
    accentHex: "#ef4444",
    topSpeed: 34.5,
    accel: 27.5,
    turnRate: 2.38,
    driftGrip: 0.92,
    mass: 0.98,
    maxHp: 105,
  },
  MERCEDES_240: {
    id: "MERCEDES_240",
    nameAr: "مرسيدس 240 الكبيرة",
    taglineAr: "6 بلايص + الشيفور + الباكاج فوق السقف! دبابة الطريق",
    emoji: "🚘",
    glbPath: "/models/cars/sedan.glb",
    bodyHex: 0xfef3c7,
    secondaryHex: 0x0f172a,
    accentHex: "#f59e0b",
    topSpeed: 33.2,
    accel: 23.5,
    turnRate: 2.05,
    driftGrip: 0.87,
    mass: 1.42,
    maxHp: 130,
  },
  C15_KHATTAF: {
    id: "C15_KHATTAF",
    nameAr: "C15 الخطّاف الأسطورية",
    taglineAr: "C15 ما كتموتش! محملة بالبوطات ومقطوعة ليها الفران",
    emoji: "🚐",
    glbPath: "/models/cars/van.glb",
    bodyHex: 0xe2e8f0,
    secondaryHex: 0x334155,
    accentHex: "#38bdf8",
    topSpeed: 32.8,
    accel: 24.5,
    turnRate: 2.14,
    driftGrip: 0.89,
    mass: 1.36,
    maxHp: 135,
  },
  TRIPORTEUR: {
    id: "TRIPORTEUR",
    nameAr: "هوندا الدلاح الصاروخية",
    taglineAr: "بيكاب شارجي بالدلاح والطواجن وكيهز الرويضة فالنيترو!",
    emoji: "🛺",
    glbPath: "/models/cars/delivery-flat.glb",
    bodyHex: 0x0284c7,
    secondaryHex: 0xf97316,
    accentHex: "#fb923c",
    topSpeed: 35.2,
    accel: 29.5,
    turnRate: 2.52,
    driftGrip: 0.85,
    mass: 0.88,
    maxHp: 96,
  },
  LOGAN_ECOLE: {
    id: "LOGAN_ECOLE",
    nameAr: "لوطو إيكول الدرب",
    taglineAr: "بلاكة AUTO-ÉCOLE فوق السقف — قمة الإهانة ملي تفرشخ صاحبك!",
    emoji: "🚗",
    glbPath: "/models/cars/hatchback-sports.glb",
    bodyHex: 0xfacc15,
    secondaryHex: 0x1e293b,
    accentHex: "#fde047",
    topSpeed: 33.8,
    accel: 26.5,
    turnRate: 2.3,
    driftGrip: 0.91,
    mass: 1.08,
    maxHp: 110,
  },
  JADARMIYA: {
    id: "JADARMIYA",
    nameAr: "سطافيط الرادار 🚨",
    taglineAr: "الجدارمية والرادار المتنقل — الصافرة شاعلة و400 درهم واجدة!",
    emoji: "🚓",
    glbPath: "/models/cars/police.glb",
    bodyHex: 0x1e3a8a,
    secondaryHex: 0xf8fafc,
    accentHex: "#3b82f6",
    topSpeed: 35.0,
    accel: 27.0,
    turnRate: 2.28,
    driftGrip: 0.9,
    mass: 1.28,
    maxHp: 122,
  },
};

export const KSIDA_VEHICLE_ORDER: KsidaVehicleId[] = [
  "TAXI_HMER",
  "MERCEDES_240",
  "C15_KHATTAF",
  "TRIPORTEUR",
  "LOGAN_ECOLE",
  "JADARMIYA",
];

export interface MemeItemSpec {
  id: KsidaItemId;
  nameAr: string;
  shortAr: string;
  emoji: string;
  colorHex: string;
}

export const KSIDA_ITEMS: Record<KsidaItemId, MemeItemSpec> = {
  SANDALA: {
    id: "SANDALA",
    nameAr: "صندالة الواليدة الموجهة",
    shortAr: "صندالة طائرة 🩴",
    emoji: "🩴",
    colorHex: "#ec4899",
  },
  BUTAGAZ: {
    id: "BUTAGAZ",
    nameAr: "بوطاغاز طائر متفجر",
    shortAr: "قنبلة البوطا 💥",
    emoji: "💥",
    colorHex: "#ef4444",
  },
  SOAP_OIL: {
    id: "SOAP_OIL",
    nameAr: "الصابون البلدي وزيت العود",
    shortAr: "صابون بلدي 🫧",
    emoji: "🫧",
    colorHex: "#84cc16",
  },
  ATAY_NITRO: {
    id: "ATAY_NITRO",
    nameAr: "نيترو أتاي مشحر خارق",
    shortAr: "أتاي أوفردرايف 🫖",
    emoji: "🫖",
    colorHex: "#10b981",
  },
  WEDDING_HORN: {
    id: "WEDDING_HORN",
    nameAr: "كلاكسون العرس الصاعق",
    shortAr: "بوق العرس 📢",
    emoji: "📢",
    colorHex: "#f59e0b",
  },
  WATERMELON: {
    id: "WATERMELON",
    nameAr: "قنبلة الدلاح المتدحرج",
    shortAr: "فخ الدلاح 🍉",
    emoji: "🍉",
    colorHex: "#22c55e",
  },
};

export const KSIDA_TAUNTS: Record<
  KsidaTauntId,
  { id: KsidaTauntId; textAr: string; emoji: string; hornStyle: number }
> = {
  HAYED: { id: "HAYED", textAr: "حيد من الطريق آ الشريف!", emoji: "🚕", hornStyle: 0 },
  CONSTAT: { id: "CONSTAT", textAr: "وجد الكونسطا آ صاحبي!", emoji: "📝", hornStyle: 1 },
  PERMIS: { id: "PERMIS", textAr: "شكون عطاك البيرمي؟!", emoji: "🪪", hornStyle: 2 },
  WALIDA: { id: "WALIDA", textAr: "وااا الواليدة صندالة جات!", emoji: "🩴", hornStyle: 3 },
  C15_LEGEND: { id: "C15_LEGEND", textAr: "الحديد القاصح ما كيموتش!", emoji: "💪", hornStyle: 4 },
  ATAY: { id: "ATAY", textAr: "بسلامة! نشربو أتاي فخط الوصول!", emoji: "🫖", hornStyle: 5 },
};

export const KSIDA_TAUNT_ORDER: KsidaTauntId[] = [
  "HAYED",
  "CONSTAT",
  "PERMIS",
  "WALIDA",
  "C15_LEGEND",
  "ATAY",
];

export const RACER_ACCENT_PALETTE: number[] = [
  0xef4444, // Taxi Red
  0xf59e0b, // Saffron Gold
  0x06b6d4, // Corniche Cyan
  0x10b981, // Mint Tea Emerald
  0xec4899, // Bougainvillea Pink
  0x8b5cf6, // Majorelle Violet
  0xf97316, // Tanjia Orange
  0x84cc16, // Olive Lime
];

export interface KsidaRacer {
  id: string;
  nickname: string;
  isBot: boolean;
  vehicle: KsidaVehicleId;
  accentHex: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  speed: number;
  hp: number;
  maxHp: number;
  nitro: number; // 0..100
  isAlive: boolean;
  respawnAt: number;
  heldItem: KsidaItemId | null;
  atayUntil: number; // timestamp ms of Mint Tea Overdrive
  spinUntil: number; // timestamp ms of spinout state
  shieldUntil: number; // spawn/respawn protection
  // Race & Derby progression
  lap: number; // 1..targetLaps
  nextCheckpoint: number; // 0..7
  trackProgress: number; // monotonic total progress for live race standings
  finishedAt: number; // >0 when race completed
  // Stats & Meme Roast Metrics
  score: number;
  takedowns: number;
  wrecksTaken: number;
  wallHits: number;
  driftScore: number;
  streak: number;
  lastDamagedBy: string | null;
  lastTauntId: KsidaTauntId | null;
  lastTauntAt: number;
}

export interface KsidaCratePad {
  id: string;
  x: number;
  y: number;
  z: number;
  available: boolean;
  respawnAt: number;
}

export interface KsidaBarrelProp {
  id: string;
  x: number;
  z: number;
  available: boolean;
  respawnAt: number;
}

export interface KsidaHazardDrop {
  id: string;
  ownerId: string;
  kind: "SOAP_OIL" | "WATERMELON";
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  spawnedAt: number;
}

export interface KsidaAwardBadge {
  id: string;
  titleAr: string;
  subtitleAr: string;
  emoji: string;
  winnerId: string;
  winnerName: string;
  statLabel: string;
}

export interface KsidaSettings {
  mode: KsidaMode;
  botFill: boolean; // Solo (1 human) auto-fills 5 hilarious Moroccan bots; 2+ humans = optional toggle!
  targetLaps: number; // default 3 laps in RACE (~2.5-3 mins on the 1.58km Grand Circuit!)
  targetDerbyScore: number; // default 250 pts in DERBY
  matchDurationSec: number; // default 300s (5 minutes)
}

export interface KsidaWreckEventPacket {
  id: string;
  attackerId: string;
  attackerName: string;
  victimId: string;
  victimName: string;
  cause:
    | "RAM"
    | "SANDALA"
    | "BUTAGAZ"
    | "SOAP_OIL"
    | "WEDDING_HORN"
    | "WATERMELON"
    | "HOT_BOMB"
    | "BARREL";
  streak: number;
  memeBannerAr: string;
  x: number;
  y: number;
  z: number;
  colorHex: number;
}

export interface KsidaState {
  phase: "PLAYING" | "GAME_OVER";
  mode: KsidaMode;
  round: number;
  startedAt: number;
  countdownEndsAt: number;
  endsAt: number;
  crownHolderId: string | null;
  crownX: number;
  crownZ: number;
  hotBombHolderId: string | null;
  hotBombExplodesAt: number;
  racers: Record<string, KsidaRacer>;
  crates: KsidaCratePad[];
  hazards: KsidaHazardDrop[];
  wreckFeed: KsidaWreckEventPacket[];
  awards: KsidaAwardBadge[];
  winnerId: string | null;
  winnerSummaryAr: string | null;
  settings: KsidaSettings;
}

// Live Relay Network Packets (ksida3d:<ROOM_CODE>)
export interface KsidaLivePeerPacket {
  i: string; // racerId
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yw: number; // yaw
  sp: number; // forward speed
  st: number; // steer -1..1
  dr: number; // drift stage 0..3
  nt: number; // nitro active 0|1
  v: KsidaVehicleId;
  lp: number; // lap
  cp: number; // nextCheckpoint
  pr: number; // trackProgress
  wh: number; // wallHits counter
  ds: number; // driftScore
  t: number; // local perf timestamp on receiver
}

export interface KsidaRamClaimPacket {
  attackerId: string;
  victimId: string;
  damage: number;
  impulseX: number;
  impulseZ: number;
  spinMs: number;
  isTBone: boolean;
  x: number;
  y: number;
  z: number;
}

export interface KsidaItemFirePacket {
  id: string;
  ownerId: string;
  item: KsidaItemId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  targetId: string | null;
}

export interface KsidaItemHitPacket {
  attackerId: string;
  victimId: string;
  item: KsidaItemId | "BARREL";
  damage: number;
  spinMs: number;
  impulseX: number;
  impulseZ: number;
  x: number;
  y: number;
  z: number;
}

export interface KsidaTauntPacket {
  racerId: string;
  nickname: string;
  tauntId: KsidaTauntId;
}

export interface KsidaWorldSyncPacket {
  seq: number;
  arbiterId: string;
  crownId: string | null;
  cx: number;
  cz: number;
  bombId: string | null;
  bombAt: number;
  crates: Array<{ i: string; a: 0 | 1 }>;
  barrels?: Array<{ i: string; a: 0 | 1 }>;
  hazards: Array<{
    i: string;
    o: string;
    k: "SOAP_OIL" | "WATERMELON";
    x: number;
    z: number;
    vx: number;
    vz: number;
  }>;
  units: Array<{
    i: string;
    n: string;
    b: 0 | 1;
    v: KsidaVehicleId;
    c: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vz: number;
    yw: number;
    hp: number;
    mhp: number;
    nt: number;
    al: 0 | 1;
    ra: number;
    it: KsidaItemId | null;
    at: number;
    spn: number;
    shd: number;
    lp: number;
    cp: number;
    pr: number;
    fn: number;
    sc: number;
    tk: number;
    wt: number;
    wh: number;
    ds: number;
    st: number;
  }>;
}

export type KsidaAction =
  | {
      type: "CONFIGURE_MATCH";
      mode?: KsidaMode;
      botFill?: boolean;
      targetLaps?: number;
      matchDurationSec?: number;
    }
  | {
      type: "SELECT_VEHICLE";
      vehicle: KsidaVehicleId;
    }
  | {
      type: "SYNC_CHECKPOINT";
      racers?: Record<string, KsidaRacer>;
      crates?: KsidaCratePad[];
      crownHolderId?: string | null;
      hotBombHolderId?: string | null;
      hotBombExplodesAt?: number;
    }
  | {
      type: "FINISH_MATCH";
      racers?: Record<string, KsidaRacer>;
      winnerId?: string | null;
      winnerSummaryAr?: string;
    }
  | {
      type: "PLAY_AGAIN";
    };
