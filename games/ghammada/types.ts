import { InteractionMode } from "@/lib/types";

export type GhammadaPhase =
  | "HIDE_PHASE"
  | "HUNT_PHASE"
  | "ROUND_END"
  | "GAME_OVER";

export type GhammadaPropId =
  | "tajine"
  | "berrad"
  | "butagaz"
  | "chair"
  | "crate"
  | "amphora"
  | "della7a"
  | "fanar";

export interface GhammadaPropMeta {
  id: GhammadaPropId;
  name: string;
  emoji: string;
  speedMultiplier: number;
  hitRadius: number;
}

export const GHAMMADA_PROPS: Record<GhammadaPropId, GhammadaPropMeta> = {
  tajine: {
    id: "tajine",
    name: "طاجين الفخار",
    emoji: "🍲",
    speedMultiplier: 1.0,
    hitRadius: 0.9,
  },
  berrad: {
    id: "berrad",
    name: "براد أتاي",
    emoji: "🫖",
    speedMultiplier: 1.15,
    hitRadius: 0.75,
  },
  butagaz: {
    id: "butagaz",
    name: "بوطاغاز زرقة",
    emoji: "🛢️",
    speedMultiplier: 0.95,
    hitRadius: 0.85,
  },
  chair: {
    id: "chair",
    name: "كرسي القهوة",
    emoji: "🪑",
    speedMultiplier: 0.95,
    hitRadius: 0.95,
  },
  crate: {
    id: "crate",
    name: "صندوق السليعة",
    emoji: "📦",
    speedMultiplier: 0.9,
    hitRadius: 1.05,
  },
  amphora: {
    id: "amphora",
    name: "قلة الفخار",
    emoji: "🏺",
    speedMultiplier: 1.0,
    hitRadius: 0.85,
  },
  della7a: {
    id: "della7a",
    name: "دلاحة مكورة",
    emoji: "🍉",
    speedMultiplier: 1.2,
    hitRadius: 0.7,
  },
  fanar: {
    id: "fanar",
    name: "فنار نحاسي",
    emoji: "🏮",
    speedMultiplier: 1.1,
    hitRadius: 0.75,
  },
};

export const ALL_PROP_IDS = Object.keys(GHAMMADA_PROPS) as GhammadaPropId[];

export interface GhammadaWorldProp {
  id: string;
  propId: GhammadaPropId;
  x: number;
  z: number;
  rotY: number;
  isDestroyed?: boolean;
}

export interface GhammadaPlayerEntity {
  playerId: string;
  role: "HUNTER" | "HIDER";
  x: number;
  z: number;
  rotY: number;
  propId: GhammadaPropId;
  isLocked: boolean;
  isCaught: boolean;
  caughtBy?: string;
  hearts: number; // Hunters start with 5 hearts; lose 1 on false strike
  tauntCount: number;
  lastTauntAt?: number;
  lastStrikeAt?: number;
  lastDashAt?: number;
}

export interface GhammadaKillFeedItem {
  id: string;
  timestamp: number;
  text: string;
  type: "CATCH" | "MISS" | "TAUNT" | "SURVIVE";
}

export interface GhammadaSettings {
  hideDurationSec: number;
  huntDurationSec: number;
  maxRounds: number;
  hunterMaxHearts: number;
  interactionMode?: InteractionMode;
}

export type GhammadaAction =
  | {
      type: "SYNC_POS";
      x: number;
      z: number;
      rotY: number;
      propId?: GhammadaPropId;
      isLocked?: boolean;
    }
  | { type: "MORPH_PROP"; propId: GhammadaPropId }
  | { type: "TOGGLE_LOCK"; isLocked: boolean; x?: number; z?: number; rotY?: number }
  | { type: "SMOKE_DASH"; x: number; z: number; rotY: number }
  | { type: "TAUNT_WHISTLE"; x: number; z: number }
  | {
      type: "HUNTER_STRIKE";
      x: number;
      z: number;
      rotY: number;
      /** Hider positions as seen live on the hunter's screen (optional, validated server-side) */
      targets?: Array<{ id: string; x: number; z: number }>;
    }
  | { type: "START_HUNT" }
  | { type: "TIME_UP"; forPhase?: GhammadaPhase }
  | { type: "NEXT_ROUND" }
  | { type: "RESTART_GAME" };

export interface GhammadaState {
  phase: GhammadaPhase;
  round: number;
  maxRounds: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  mapSeed: number;
  hunterIds: string[];
  entities: Record<string, GhammadaPlayerEntity>;
  worldProps: GhammadaWorldProp[];
  scores: Record<string, number>;
  feed: GhammadaKillFeedItem[];
  roundWinner?: "HUNTERS" | "HIDERS";
  roundHeadline?: string;
  roundSummary?: string;
  winnerId?: string;
}
