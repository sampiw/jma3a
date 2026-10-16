import { InteractionMode } from "@/lib/types";

export type SandalaPhase = "ROUND_PLAY" | "ROUND_END" | "GAME_OVER";

export interface SandalaTrap {
  id: string;
  ownerId: string;
  x: number;
  z: number;
  createdAt: number;
  triggered?: boolean;
}

export interface SandalaPlayerEntity {
  playerId: string;
  role: "MAMA" | "KID";
  x: number;
  z: number;
  rotY: number;
  hearts: number; // Kids start with 3 hearts; at 0 -> isKO = true
  isKO: boolean;
  outfitColor: number;
  floppedUntil?: number;
  slippedUntil?: number;
  snitchedUntil?: number;
  dancingUntil?: number;
  rageUntil?: number;
  lastThrowAt?: number;
  lastHitAt?: number;
  betrayalsCount: number;
  dodgesCount: number;
  hitsCount: number;
}

export interface SandalaFeedItem {
  id: string;
  timestamp: number;
  text: string;
  type: "SMACK" | "DODGE" | "BETRAY" | "SNITCH" | "DANCE" | "KO";
}

export interface SandalaSettings {
  roundDurationSec: number;
  maxRounds: number;
  kidHearts: number;
  interactionMode?: InteractionMode;
}

export type SandalaAction =
  | {
      type: "SYNC_POS";
      x: number;
      z: number;
      rotY: number;
    }
  | {
      type: "THROW_SANDALA";
      x: number;
      z: number;
      rotY: number;
      targetId?: string;
      hitX?: number;
      hitZ?: number;
      targets?: Array<{ id: string; x: number; z: number; flopped?: boolean }>;
    }
  | {
      type: "BROOM_SWEEP";
      x: number;
      z: number;
      targets?: Array<{ id: string; x: number; z: number }>;
    }
  | {
      type: "MAMA_RAGE";
    }
  | {
      type: "KID_FLOP";
      x: number;
      z: number;
    }
  | {
      type: "DROP_SABON";
      x: number;
      z: number;
    }
  | {
      type: "TRIGGER_SABON";
      trapId: string;
      x: number;
      z: number;
    }
  | {
      type: "SNITCH_FRIEND";
    }
  | {
      type: "CHAABI_DANCE";
      x: number;
      z: number;
    }
  | {
      type: "TIME_UP";
      forRound?: number;
    }
  | {
      type: "NEXT_ROUND";
    }
  | {
      type: "RESTART_GAME";
    };

export interface SandalaState {
  phase: SandalaPhase;
  round: number;
  maxRounds: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  mamaIds: string[];
  entities: Record<string, SandalaPlayerEntity>;
  traps: SandalaTrap[];
  scores: Record<string, number>;
  feed: SandalaFeedItem[];
  roundWinner?: "MAMA" | "KIDS";
  roundHeadline?: string;
  roundSummary?: string;
  winnerId?: string;
}
