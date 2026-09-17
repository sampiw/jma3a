export type RoomStatus = 'LOBBY' | 'ACTIVE' | 'FINISHED' | 'EXPIRED';

export type InteractionMode = 'MULTI_PHONE' | 'ONE_PHONE' | 'HYBRID';

export type PlayerStatus = 'ACTIVE' | 'ELIMINATED' | 'LEFT' | 'SPECTATING';

export interface Player {
  id: string;
  roomId: string;
  nickname: string;
  normalizedNickname: string;
  status: PlayerStatus;
  joinedAt: number;
  avatarSeed: string;
  isHost: boolean;
  teamId?: string;
  deviceSessionId: string;
  isOnline: boolean;
  lastSeenAt?: number;
}

export interface DeviceSession {
  id: string;
  token: string;
  roomId: string;
  type: 'PERSONAL' | 'SHARED_HOST';
  createdAt: number;
  lastSeenAt: number;
}

export type GameId = 'dib' | 'intrus' | 'chkon-fina' | 'mettelha' | 'mamnou3' | 'mission-sirriya';

export type GameCapability =
  | 'MULTI_PHONE'
  | 'ONE_PHONE'
  | 'HYBRID'
  | 'SHARED_SCREEN'
  | 'TEAM_MODE'
  | 'PRIVATE_TURNS'
  | 'ANONYMOUS_VOTING'
  | 'REALTIME'
  | 'SCORES'
  | 'TIMERS'
  | 'NARRATION';

export interface RoomSettings {
  maxPlayers: number;
  interactionMode: InteractionMode;
  locale: 'darija' | 'ar' | 'fr' | 'en';
  gameSettings: Record<string, unknown>;
}

export interface GameRoom {
  id: string;
  code: string;
  status: RoomStatus;
  selectedGameId: GameId;
  selectedGameVersion: number;
  hostPlayerId: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  settings: RoomSettings;
  players: Player[];
  activeSessionId?: string;
  historyGameIds?: GameId[];
}

export interface PublicGameView {
  gameId: GameId;
  phase: string;
  round: number;
  stateVersion: number;
  timer?: {
    startsAt: number;
    endsAt: number;
    durationMs: number;
    isPaused: boolean;
  };
  publicData: Record<string, unknown>;
}

export interface PrivatePlayerGameView {
  playerId: string;
  isHost: boolean;
  myRole?: string;
  mySecret?: string;
  myTeam?: string;
  privateData: Record<string, unknown>;
  allowedActions: string[];
}

export interface PublicRoomView {
  code: string;
  status: RoomStatus;
  selectedGameId: GameId;
  hostPlayerId: string;
  players: Array<{
    id: string;
    nickname: string;
    avatarSeed: string;
    status: PlayerStatus;
    isHost: boolean;
    isOnline: boolean;
    teamId?: string;
  }>;
  settings: RoomSettings;
  gameView?: PublicGameView;
}

export interface DevicePlayerInfo {
  id: string;
  nickname: string;
  isHost: boolean;
  avatarSeed: string;
  isAlive?: boolean;
  privateView?: PrivatePlayerGameView;
}

export interface AuthorizedGameState {
  room: PublicRoomView;
  player?: {
    id: string;
    nickname: string;
    isHost: boolean;
    avatarSeed: string;
  };
  privateView?: PrivatePlayerGameView;
  devicePlayers?: DevicePlayerInfo[];
  passThePhone?: {
    currentPlayerId: string;
    currentPlayerNickname: string;
    isRevealed: boolean;
    remainingPlayersCount: number;
  };
}
