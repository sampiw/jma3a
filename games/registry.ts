import { GameCapability, GameId, Player, PublicGameView, PrivatePlayerGameView } from "@/lib/types";

export interface GameContext<TState = unknown, TSettings = unknown> {
  roomId: string;
  players: Player[];
  state: TState;
  settings: TSettings;
  round: number;
  phase: string;
  stateVersion: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
}

export interface TransitionResult<TState = unknown> {
  success: boolean;
  newState: TState;
  newPhase: string;
  newRound?: number;
  timerDurationMs?: number;
  error?: string;
  broadcastEvent?: {
    type: string;
    payload?: Record<string, unknown>;
  };
}

export interface GameEndResult {
  isFinished: boolean;
  winner?: {
    team?: string;
    players?: string[];
    summary: string;
  };
  scoreboard?: Array<{
    id: string;
    label: string;
    score: number;
  }>;
}

export interface GameDefinition<TState = any, TAction = any, TSettings = any> {
  id: GameId;
  slug: string;
  version: number;
  displayNameKey: string;
  shortDescriptionKey: string;
  minPlayers: number;
  maxPlayers: number | null;
  capabilities: GameCapability[];
  defaultSettings: TSettings;

  validateSetup(players: Player[], settings: TSettings): ValidationResult;
  createInitialState(players: Player[], settings: TSettings): TState;
  start(ctx: GameContext<TState, TSettings>): TransitionResult<TState>;
  handleAction(ctx: GameContext<TState, TSettings>, actorPlayerId: string, action: TAction): TransitionResult<TState>;
  getPublicView(ctx: GameContext<TState, TSettings>): PublicGameView;
  getPlayerView(ctx: GameContext<TState, TSettings>, playerId: string): PrivatePlayerGameView;
  checkFinished(ctx: GameContext<TState, TSettings>): GameEndResult | null;
}

const gameRegistry = new Map<GameId, GameDefinition>();

export function registerGame(game: GameDefinition) {
  gameRegistry.set(game.id, game);
}

export function getGameDefinition(id: GameId): GameDefinition | undefined {
  return gameRegistry.get(id);
}

export function getAllGameDefinitions(): GameDefinition[] {
  return Array.from(gameRegistry.values());
}
