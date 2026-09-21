import { InteractionMode } from "@/lib/types";

export type KhiyalPhase =
  | "STORYTELLER_CLUE"
  | "PLAYER_SUBMISSIONS"
  | "VOTING"
  | "ROUND_RESOLUTION"
  | "GAME_OVER";

export interface KhiyalCard {
  id: string;
  title: string;
  visualTheme: "cosmic" | "desert" | "medina" | "ocean" | "mystic" | "surreal";
  fallbackGradient: string;
  imageUrl?: string;
  description: string;
}

export interface KhiyalSettings {
  targetScore: number;
  handSize: number;
  clueTimeLimitSeconds: number;
  voteTimeLimitSeconds: number;
  interactionMode?: InteractionMode;
}

export type KhiyalAction =
  | { type: "SUBMIT_CLUE"; cardId: string; clue: string }
  | { type: "SUBMIT_CARDS"; cardIds: string[] }
  | { type: "CAST_VOTE"; cardId: string }
  | { type: "NEXT_ROUND" }
  | { type: "RELAY_UNLOCK" }
  | { type: "RELAY_FINISH_TURN" };

export interface RoundResult {
  round: number;
  storytellerId: string;
  storytellerCardId: string;
  clue: string;
  cardsOnTable: Array<{
    cardId: string;
    ownerId: string;
    voterIds: string[];
    isStoryteller: boolean;
    pointsEarned: number;
    decoyBonus: number;
  }>;
  pointsDelta: Record<string, number>;
  caseType: "ALL_CORRECT" | "NONE_CORRECT" | "BALANCED";
  explanation: string;
}

export interface KhiyalRelayState {
  currentIndex: number;
  queue: string[];
  privacyUnlocked: boolean;
}

export interface KhiyalState {
  phase: KhiyalPhase;
  round: number;
  storytellerId: string;
  currentClue: string | null;
  storytellerCardId: string | null;
  deck: string[];
  discardPile: string[];
  playerHands: Record<string, string[]>;
  submittedCards: Record<string, string[]>;
  tableCards: Array<{ cardId: string; anonymousIndex: number }>;
  votes: Record<string, string>;
  scores: Record<string, number>;
  lastRoundResult?: RoundResult;
  winner?: string | null;
  eventSequence: number;
  relayState?: KhiyalRelayState;
}
