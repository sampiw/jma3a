export type Dib3DRole = "WOLF" | "SHERIFF" | "SEER" | "VILLAGER";

export type Dib3DPhase = "ROAM_3D" | "MEETING" | "EJECTION_REVEAL" | "GAME_OVER";

export type Dib3DTaskStationId =
  | "farran_bread"
  | "hanout_kunnach"
  | "cafe_atay"
  | "hammam_berma"
  | "sqaya_bucket"
  | "zellige_lamp";

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
    actionLabel: "🥖 طرح الخبز فـ الفران!",
    zoneName: "حدا الفرّان البلدي",
    emoji: "🥖",
    x: -10.2,
    z: -10.2,
    color: 0xf97316,
  },
  {
    id: "hanout_kunnach",
    title: "حانوت الحاج",
    actionLabel: "📓 قيّد الكريدي فـ الكناش!",
    zoneName: "قدام حانوت الحاج",
    emoji: "📓",
    x: 0,
    z: -12.2,
    color: 0x3b82f6,
  },
  {
    id: "cafe_atay",
    title: "قهوة الشعبي",
    actionLabel: "🍵 شحّر البراد د أتاي!",
    zoneName: "فـ قهوة الشعبي",
    emoji: "🍵",
    x: 10.2,
    z: -10.2,
    color: 0x10b981,
  },
  {
    id: "hammam_berma",
    title: "الحمام البلدي",
    actionLabel: "🪣 سخّن البرمة د الحمام!",
    zoneName: "داخلة الحمام البلدي",
    emoji: "🪣",
    x: -10.2,
    z: 10.2,
    color: 0xec4899,
  },
  {
    id: "sqaya_bucket",
    title: "سقاية الدرب",
    actionLabel: "⛲ عمّر السطل من السقاية!",
    zoneName: "حدا سقاية الدرب",
    emoji: "⛲",
    x: 10.2,
    z: 10.2,
    color: 0x06b6d4,
  },
  {
    id: "zellige_lamp",
    title: "فانوس الزنقة",
    actionLabel: "🏮 شعل فانوس الزنقة!",
    zoneName: "تحت فانوس الزنقة",
    emoji: "🏮",
    x: -12.2,
    z: 0,
    color: 0xfacc15,
  },
];

export interface Dib3DVentDef {
  id: string;
  label: string;
  x: number;
  z: number;
}

export const DIB3D_VENTS: Dib3DVentDef[] = [
  { id: "vent_nw", label: "قادوس الفرّان", x: -13.2, z: -13.2 },
  { id: "vent_ne", label: "قادوس القهوة", x: 13.2, z: -13.2 },
  { id: "vent_se", label: "قادوس السقاية", x: 13.2, z: 13.2 },
  { id: "vent_sw", label: "قادوس الحمام", x: -13.2, z: 13.2 },
];

export const DIB3D_ELECTRIC_BOX = {
  x: 12.2,
  z: 0,
  title: "صندوق الضو ⚡",
  zoneName: "حدا صندوق الضو",
};

export const DIB3D_CENTRAL_DRUM = {
  x: 0,
  z: 0,
  title: "طبل ساحة الدرب 🥁",
  zoneName: "وسط ساحة الدرب",
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
