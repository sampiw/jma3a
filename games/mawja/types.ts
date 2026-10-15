import { InteractionMode } from "@/lib/types";

export type MawjaPhase =
  | "TRANSMITTER_SELECT"
  | "RECEIVERS_TUNE"
  | "ROUND_REVEAL"
  | "GAME_OVER";

export type MawjaCategory = "spicy" | "moroccan" | "deep" | "pop";

export interface MawjaSpectrum {
  id: string;
  leftLabel: string;   // 0% pole
  rightLabel: string;  // 100% pole
  category: MawjaCategory;
  categoryLabel: string;
  examples?: string;
}

export interface MawjaPlayerGuess {
  playerId: string;
  value: number;                  // 0 to 100
  doubleDown: boolean;            // 🔥 x2 confidence chip
  predictedBestPlayerId?: string; // Side-bet: which friend will be closest?
  lockedAt: number;
}

export type MawjaScoreZone = "BULLSEYE" | "INNER" | "OUTER" | "MISS";

export interface MawjaGuessEvaluation {
  playerId: string;
  value: number;
  diff: number;
  zone: MawjaScoreZone;
  basePoints: number;
  doubleDown: boolean;
  doubleDownDelta: number;
  predictedBestPlayerId?: string;
  sideBetWon: boolean;
  totalDelta: number;
}

export interface MawjaRoundResult {
  round: number;
  transmitterId: string;
  spectrum: MawjaSpectrum;
  clue: string;
  targetValue: number; // 0 to 100
  evaluations: MawjaGuessEvaluation[];
  transmitterPoints: number;
  closestPlayerIds: string[];
  headline: string;
  commentary: string;
}

export interface MawjaSettings {
  targetScore: number;
  maxRounds: number;
  doubleDownChipsPerPlayer: number;
  interactionMode?: InteractionMode;
}

export type MawjaAction =
  | { type: "REROLL_SPECTRUMS" }
  | { type: "SELECT_SPECTRUM"; spectrumId: string }
  | {
      type: "SUBMIT_CLUE";
      clue: string;
      spectrumId?: string;
      customLeft?: string;
      customRight?: string;
    }
  | {
      type: "LOCK_GUESS";
      value: number;
      doubleDown?: boolean;
      predictedBestPlayerId?: string;
    }
  | { type: "FORCE_REVEAL" }
  | { type: "NEXT_ROUND" }
  | { type: "RESTART_GAME" };

export interface MawjaPlayerAward {
  playerId: string;
  title: string;
  subtitle: string;
  badge: string;
}

export interface MawjaState {
  phase: MawjaPhase;
  round: number;
  transmitterOrder: string[];
  transmitterIndex: number;
  transmitterId: string;

  // Deck & current choices
  usedSpectrumIds: string[];
  candidateSpectrums: MawjaSpectrum[];
  currentSpectrum: MawjaSpectrum;

  // Secret target (0-100) — only visible to transmitter until ROUND_REVEAL
  targetValue: number;
  currentClue?: string;

  // Guesses in RECEIVERS_TUNE
  guesses: Record<string, MawjaPlayerGuess>;

  // Scores & resources
  scores: Record<string, number>;
  doubleDownChipsLeft: Record<string, number>;

  // Stats for awards
  bullseyeCount: Record<string, number>;
  transmitterPointsTotal: Record<string, number>;
  doubleDownWins: Record<string, number>;

  // History
  lastRoundResult?: MawjaRoundResult;
  history: MawjaRoundResult[];
  winnerId?: string;
  awards?: MawjaPlayerAward[];
}
