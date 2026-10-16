export type Dib3DRole = "WOLF" | "SHERIFF" | "SEER" | "VILLAGER";

export type Dib3DPhase = "ROAM_3D" | "MEETING" | "EJECTION_REVEAL" | "GAME_OVER";

export type Dib3DTaskStationId =
  | "farran_bread"
  | "hanout_kunnach"
  | "cafe_atay"
  | "hammam_berma"
  | "sqaya_bucket"
  | "zellige_lamp"
  | "attar_spices"
  | "sebbagh_wool"
  | "souika_carpet"
  | "medersa_clock";

export const DIB3D_ARENA_HALF = 38;

export interface Dib3DWallSegment {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

export const DIB3D_WALL_SEGMENTS: Dib3DWallSegment[] = [
  // Inner Riad Courtyard ring (with 5m gates on N, S, E, W)
  { x: -5.5, z: -8.5, w: 6.0, d: 1.1, h: 3.8 },
  { x: 5.5, z: -8.5, w: 6.0, d: 1.1, h: 3.8 },
  { x: -5.5, z: 8.5, w: 6.0, d: 1.1, h: 3.8 },
  { x: 5.5, z: 8.5, w: 6.0, d: 1.1, h: 3.8 },
  { x: -8.5, z: -5.5, w: 1.1, d: 6.0, h: 3.8 },
  { x: -8.5, z: 5.5, w: 1.1, d: 6.0, h: 3.8 },
  { x: 8.5, z: -5.5, w: 1.1, d: 6.0, h: 3.8 },
  { x: 8.5, z: 5.5, w: 1.1, d: 6.0, h: 3.8 },
  // 4 Outer Medina Quarter Enclosures (NW, NE, SW, SE)
  { x: -23.0, z: -18.0, w: 10.0, d: 1.2, h: 4.1 },
  { x: -19.0, z: -26.5, w: 1.2, d: 10.0, h: 4.1 },
  { x: 23.0, z: -18.0, w: 10.0, d: 1.2, h: 4.1 },
  { x: 19.0, z: -26.5, w: 1.2, d: 10.0, h: 4.1 },
  { x: -23.0, z: 18.0, w: 10.0, d: 1.2, h: 4.1 },
  { x: -19.0, z: 26.5, w: 1.2, d: 10.0, h: 4.1 },
  { x: 23.0, z: 18.0, w: 10.0, d: 1.2, h: 4.1 },
  { x: 19.0, z: 26.5, w: 1.2, d: 10.0, h: 4.1 },
  // Alleyway Sightline Baffles (West, East, North, South)
  { x: -21.0, z: -6.5, w: 1.2, d: 7.5, h: 3.9 },
  { x: -21.0, z: 6.5, w: 1.2, d: 7.5, h: 3.9 },
  { x: 21.0, z: -6.5, w: 1.2, d: 7.5, h: 3.9 },
  { x: 21.0, z: 6.5, w: 1.2, d: 7.5, h: 3.9 },
  { x: -6.5, z: -22.0, w: 6.5, d: 1.2, h: 3.9 },
  { x: 6.5, z: -22.0, w: 6.5, d: 1.2, h: 3.9 },
  { x: -6.5, z: 22.0, w: 6.5, d: 1.2, h: 3.9 },
  { x: 6.5, z: 22.0, w: 6.5, d: 1.2, h: 3.9 },
];

export interface Dib3DTaskStationDef {
  id: Dib3DTaskStationId;
  title: string;
  actionLabel: string;
  zoneName: string;
  emoji: string;
  x: number;
  z: number;
  color: number;
}

export const DIB3D_TASK_STATIONS: Dib3DTaskStationDef[] = [
  {
    id: "farran_bread",
    title: "الفرّان البلدي",
    actionLabel: "🥖 طيّب وقلّب الخبز فـ الفران!",
    zoneName: "حي الفرّان البلدي (شمال غرب)",
    emoji: "🥖",
    x: -26.0,
    z: -24.0,
    color: 0xf97316,
  },
  {
    id: "hanout_kunnach",
    title: "حانوت الحاج",
    actionLabel: "📓 قدّ الحساب فـ كناش الكريدي!",
    zoneName: "رحبة حانوت الحاج (شمال)",
    emoji: "📓",
    x: 0,
    z: -28.0,
    color: 0x3b82f6,
  },
  {
    id: "cafe_atay",
    title: "قهوة الشعبي",
    actionLabel: "🍵 شحّر البراد د أتاي بالنعناع!",
    zoneName: "ركنة قهوة الشعبي (شمال شرق)",
    emoji: "🍵",
    x: 26.0,
    z: -24.0,
    color: 0x10b981,
  },
  {
    id: "hammam_berma",
    title: "الحمام البلدي",
    actionLabel: "🪣 زيد العواد فـ فرناتشي الحمام!",
    zoneName: "زنقة الحمام البلدي (جنوب غرب)",
    emoji: "🪣",
    x: -26.0,
    z: 24.0,
    color: 0xec4899,
  },
  {
    id: "sqaya_bucket",
    title: "سقاية الدرب",
    actionLabel: "⛲ عمّر القلوشة من السقاية!",
    zoneName: "ساحة سقاية الدرب (جنوب شرق)",
    emoji: "⛲",
    x: 26.0,
    z: 24.0,
    color: 0x06b6d4,
  },
  {
    id: "zellige_lamp",
    title: "فانوس الزنقة",
    actionLabel: "🏮 ركّب الخيوط وشعل الفانوس!",
    zoneName: "عقبة الفانوس (غرب)",
    emoji: "🏮",
    x: -28.0,
    z: 0,
    color: 0xfacc15,
  },
  {
    id: "attar_spices",
    title: "دكّان العطّار",
    actionLabel: "🌿 خلّط عطرية راس الحانوت!",
    zoneName: "زقاق العطّارين (وسط شمال)",
    emoji: "🌿",
    x: -14.0,
    z: -15.0,
    color: 0xa855f7,
  },
  {
    id: "sebbagh_wool",
    title: "دار الدبّاغ",
    actionLabel: "🧶 صبغ الجلد فـ جفان الدباغة!",
    zoneName: "حومة دار الدبّاغ (وسط جنوب)",
    emoji: "🧶",
    x: 14.0,
    z: 15.0,
    color: 0xeab308,
  },
  {
    id: "souika_carpet",
    title: "قيسارية الزرابي",
    actionLabel: "🕌 نفض الغبرة من الزربية الأمازيغية!",
    zoneName: "قيسارية الزرابي (وسط غرب)",
    emoji: "🕌",
    x: -14.0,
    z: 15.0,
    color: 0xef4444,
  },
  {
    id: "medersa_clock",
    title: "ساعة المدرسة",
    actionLabel: "🕰️ قدّ عقارب الساعة الشمسية!",
    zoneName: "صحن الساعة القديمة (وسط شرق)",
    emoji: "🕰️",
    x: 14.0,
    z: -15.0,
    color: 0x14b8a6,
  },
];

export interface Dib3DVentDef {
  id: string;
  label: string;
  x: number;
  z: number;
}

export const DIB3D_VENTS: Dib3DVentDef[] = [
  { id: "vent_nw", label: "قادوس الفرّان", x: -31.0, z: -29.0 },
  { id: "vent_n", label: "قادوس العطّار", x: 0, z: -16.0 },
  { id: "vent_ne", label: "قادوس القهوة", x: 31.0, z: -29.0 },
  { id: "vent_se", label: "قادوس السقاية", x: 31.0, z: 29.0 },
  { id: "vent_s", label: "قادوس الدبّاغ", x: 0, z: 16.0 },
  { id: "vent_sw", label: "قادوس الحمام", x: -31.0, z: 29.0 },
];

export const DIB3D_ELECTRIC_BOX = {
  x: 28.0,
  z: 0,
  title: "صندوق الضو ⚡",
  zoneName: "حدا المحوّل الكهربائي (شرق)",
};

export const DIB3D_CENTRAL_DRUM = {
  x: 0,
  z: 0,
  title: "طبل ساحة الدرب 🥁",
  zoneName: "وسط رياض الدرب",
};

export interface Dib3DDeadBody {
  id: string;
  victimId: string;
  victimName: string;
  x: number;
  z: number;
  outfitColor: number;
  zoneName: string;
  createdAt: number;
}

export interface Dib3DPlayerEntity {
  playerId: string;
  role: Dib3DRole;
  x: number;
  z: number;
  rotY: number;
  isAlive: boolean;
  outfitColor: number;
  assignedTasks: Dib3DTaskStationId[];
  completedTasks: Dib3DTaskStationId[];
  sheriffBullets: number;
  sheriffGunBroken?: boolean;
  lastSheriffShotAt?: number;
  lastNotice?: string;
  seerScansLeft: number;
  meetingsLeft: number;
  lastKillAt?: number;
  lastVentAt?: number;
}

export interface Dib3DChatMsg {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  type: "ACCUSE" | "DEFEND" | "INFO" | "SYSTEM";
  timestamp: number;
}

export interface Dib3DSettings {
  tasksPerPlayer: number;
  killCooldownSec: number;
  meetingDurationSec: number;
  interactionMode?: "MULTI_PHONE";
}

export interface Dib3DState {
  phase: Dib3DPhase;
  round: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  entities: Record<string, Dib3DPlayerEntity>;
  deadBodies: Dib3DDeadBody[];
  lightsOutUntil?: number;
  lastSabotageAt?: number;
  totalTasksCompleted: number;
  totalTasksRequired: number;
  scores: Record<string, number>;
  // Private Seer knowledge: seerId -> { targetPlayerId: "WOLF" | "INNOCENT" }
  seerKnownRoles: Record<string, Record<string, "WOLF" | "INNOCENT">>;
  // Meeting & Voting state
  meetingCallerId?: string;
  meetingReason?: "BODY_REPORT" | "EMERGENCY_DRUM";
  reportedBody?: Dib3DDeadBody | null;
  votes: Record<string, string>; // voterId -> targetPlayerId | "SKIP"
  chatFeed: Dib3DChatMsg[];
  // Ejection reveal state
  ejectedPlayerId?: string | null;
  ejectedHeadline?: string;
  ejectedSubtitle?: string;
  // Game over state
  winnerTeam?: "VILLAGERS" | "WOLVES";
  winnerHeadline?: string;
  winnerSummary?: string;
}

export type Dib3DAction =
  | { type: "SYNC_POS"; x: number; z: number; rotY: number }
  | { type: "COMPLETE_TASK"; stationId: Dib3DTaskStationId }
  | {
      type: "WOLF_KILL";
      targetId: string;
      x: number;
      z: number;
      targetX?: number;
      targetZ?: number;
    }
  | { type: "WOLF_VENT"; fromVentId?: string }
  | { type: "SABOTAGE_LIGHTS" }
  | { type: "FIX_LIGHTS" }
  | {
      type: "SHERIFF_SHOOT";
      targetId: string;
      x: number;
      z: number;
    }
  | { type: "SEER_SCAN"; targetId: string }
  | { type: "REPORT_BODY"; bodyId: string }
  | { type: "CALL_MEETING" }
  | {
      type: "QUICK_CHAT";
      text: string;
      chatType: "ACCUSE" | "DEFEND" | "INFO";
    }
  | { type: "CAST_VOTE"; targetId: string } // targetPlayerId or "SKIP"
  | { type: "FINALIZE_VOTES" }
  | { type: "RESUME_ROAM" }
  | { type: "RESTART_GAME" };
