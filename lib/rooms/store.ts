import {
  GameRoom,
  Player,
  DeviceSession,
  GameId,
  InteractionMode,
  AuthorizedGameState,
  PublicRoomView,
} from "@/lib/types";
import { generateRoomCode, normalizeRoomCode } from "./code";
import { getGameDefinition } from "@/games";
import { realtimeHub } from "@/lib/realtime/pubsub";

interface InternalGameSession {
  id: string;
  gameId: GameId;
  state: any;
  phase: string;
  round: number;
  stateVersion: number;
  timer?: {
    startsAt: number;
    endsAt: number;
    durationMs: number;
    isPaused: boolean;
  };
  passThePhone?: {
    currentPlayerIndex: number;
    isRevealed: boolean;
  };
}

class RoomStore {
  private rooms: Map<string, GameRoom> = new Map();
  private gameSessions: Map<string, InternalGameSession> = new Map();
  private deviceSessions: Map<string, DeviceSession> = new Map();

  createRoom(
    hostNickname: string,
    gameId: GameId = "dib",
    mode: InteractionMode = "MULTI_PHONE",
    locale: "darija" | "ar" | "fr" | "en" = "darija",
    hostSessionToken: string,
    avatarSeed: string = "avatar_1"
  ): { room: GameRoom; hostPlayer: Player } {
    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }

    const hostPlayerId = "p_" + crypto.randomUUID().slice(0, 8);
    const hostPlayer: Player = {
      id: hostPlayerId,
      roomId: code,
      nickname: hostNickname.trim() || "Host",
      normalizedNickname: hostNickname.trim().toLowerCase(),
      status: "ACTIVE",
      joinedAt: Date.now(),
      avatarSeed,
      isHost: true,
      deviceSessionId: hostSessionToken,
      isOnline: true,
    };

    const room: GameRoom = {
      id: "room_" + crypto.randomUUID(),
      code,
      status: "LOBBY",
      selectedGameId: gameId,
      selectedGameVersion: 1,
      hostPlayerId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      settings: {
        maxPlayers: 18,
        interactionMode: mode,
        locale,
        gameSettings: {},
      },
      players: [hostPlayer],
      historyGameIds: [gameId],
    };

    this.rooms.set(code, room);
    this.recordDeviceSession(hostSessionToken, code, "PERSONAL");

    realtimeHub.publish(code, "ROOM_UPDATED", 1);
    return { room, hostPlayer };
  }

  recordDeviceSession(token: string, roomCode: string, type: "PERSONAL" | "SHARED_HOST"): DeviceSession {
    const existing = this.deviceSessions.get(token);
    if (existing) {
      existing.lastSeenAt = Date.now();
      return existing;
    }

    const session: DeviceSession = {
      id: "dev_" + crypto.randomUUID().slice(0, 8),
      token,
      roomId: roomCode,
      type,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    this.deviceSessions.set(token, session);
    return session;
  }

  getRoom(code: string): GameRoom | undefined {
    return this.rooms.get(normalizeRoomCode(code));
  }

  joinRoom(
    code: string,
    nickname: string,
    sessionToken: string,
    avatarSeed: string = "avatar_1"
  ): { success: boolean; player?: Player; error?: string } {
    const normCode = normalizeRoomCode(code);
    const room = this.rooms.get(normCode);
    if (!room) {
      return { success: false, error: "الغرفة ما كايناش. تأكد من الكود عفاك." };
    }

    // Check if player already exists for this session token (reconnect)
    const existingPlayer = room.players.find((p) => p.deviceSessionId === sessionToken);
    if (existingPlayer) {
      existingPlayer.isOnline = true;
      existingPlayer.lastSeenAt = Date.now();
      this.recordDeviceSession(sessionToken, normCode, "PERSONAL");
      realtimeHub.publish(normCode, "PLAYER_RECONNECTED", 1);
      return { success: true, player: existingPlayer };
    }

    if (room.status !== "LOBBY") {
      return { success: false, error: "اللعبة بدات ديجا فهاد الغرفة!" };
    }

    const cleanNick = nickname.trim();
    if (!cleanNick) {
      return { success: false, error: "عفاك دخل سمية صالحة." };
    }

    // Check duplicate nickname in room
    const normNick = cleanNick.toLowerCase();
    const isNickTaken = room.players.some((p) => p.normalizedNickname === normNick);
    const finalNick = isNickTaken ? `${cleanNick} (${room.players.length + 1})` : cleanNick;

    const newPlayerId = "p_" + crypto.randomUUID().slice(0, 8);
    const newPlayer: Player = {
      id: newPlayerId,
      roomId: normCode,
      nickname: finalNick,
      normalizedNickname: finalNick.toLowerCase(),
      status: "ACTIVE",
      joinedAt: Date.now(),
      avatarSeed,
      isHost: false,
      deviceSessionId: sessionToken,
      isOnline: true,
    };

    room.players.push(newPlayer);
    room.updatedAt = Date.now();
    this.recordDeviceSession(sessionToken, normCode, "PERSONAL");

    realtimeHub.publish(normCode, "PLAYER_JOINED", 1);
    return { success: true, player: newPlayer };
  }

  addLocalPlayer(
    code: string,
    hostSessionToken: string,
    nickname: string,
    avatarSeed: string = "avatar_1"
  ): { success: boolean; player?: Player; error?: string } {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: "Room not found" };

    const host = room.players.find((p) => p.id === room.hostPlayerId);
    if (!host || host.deviceSessionId !== hostSessionToken) {
      return { success: false, error: "Only host can add shared-device players" };
    }

    const cleanNick = nickname.trim();
    const localId = "p_loc_" + crypto.randomUUID().slice(0, 8);
    const localPlayer: Player = {
      id: localId,
      roomId: room.code,
      nickname: cleanNick || `Player ${room.players.length + 1}`,
      normalizedNickname: cleanNick.toLowerCase(),
      status: "ACTIVE",
      joinedAt: Date.now(),
      avatarSeed,
      isHost: false,
      deviceSessionId: hostSessionToken, // Bound to host phone
      isOnline: true,
    };

    room.players.push(localPlayer);
    room.updatedAt = Date.now();
    realtimeHub.publish(room.code, "PLAYER_JOINED", 1);
    return { success: true, player: localPlayer };
  }

  switchGame(
    code: string,
    hostSessionToken: string,
    newGameId: GameId
  ): { success: boolean; error?: string } {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: "Room not found" };

    const host = room.players.find((p) => p.id === room.hostPlayerId);
    if (!host || host.deviceSessionId !== hostSessionToken) {
      return { success: false, error: "Only host can switch games" };
    }

    const gameDef = getGameDefinition(newGameId);
    if (!gameDef) return { success: false, error: "Invalid game selected" };

    // Reset room back to LOBBY keeping all players!
    room.selectedGameId = newGameId;
    room.status = "LOBBY";
    room.activeSessionId = undefined;
    if (!room.historyGameIds) room.historyGameIds = [];
    room.historyGameIds.push(newGameId);
    room.updatedAt = Date.now();

    realtimeHub.publish(room.code, "GAME_SWITCHED", 1, { newGameId });
    return { success: true };
  }

  startGame(code: string, hostSessionToken: string): { success: boolean; error?: string } {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: "Room not found" };

    const host = room.players.find((p) => p.id === room.hostPlayerId);
    if (!host || host.deviceSessionId !== hostSessionToken) {
      return { success: false, error: "Only host can start the game" };
    }

    const gameDef = getGameDefinition(room.selectedGameId);
    if (!gameDef) return { success: false, error: "Game engine not found" };

    const val = gameDef.validateSetup(room.players, gameDef.defaultSettings);
    if (!val.isValid) {
      return { success: false, error: val.errors?.join(" ") || "Invalid setup" };
    }

    const initialState = gameDef.createInitialState(room.players, gameDef.defaultSettings);
    const sessionId = "sess_" + crypto.randomUUID().slice(0, 8);

    const session: InternalGameSession = {
      id: sessionId,
      gameId: room.selectedGameId,
      state: initialState,
      phase: (initialState as any).phase || "STARTED",
      round: (initialState as any).round || 1,
      stateVersion: 1,
      passThePhone: {
        currentPlayerIndex: 0,
        isRevealed: false,
      },
    };

    this.gameSessions.set(sessionId, session);
    room.activeSessionId = sessionId;
    room.status = "ACTIVE";
    room.updatedAt = Date.now();

    realtimeHub.publish(room.code, "GAME_STARTED", 1);
    return { success: true };
  }

  dispatchAction(
    code: string,
    sessionToken: string,
    action: any,
    targetPlayerId?: string
  ): { success: boolean; error?: string } {
    const room = this.getRoom(code);
    if (!room || room.status !== "ACTIVE" || !room.activeSessionId) {
      return { success: false, error: "No active game in this room" };
    }

    const session = this.gameSessions.get(room.activeSessionId);
    if (!session) return { success: false, error: "Session not found" };

    const gameDef = getGameDefinition(session.gameId);
    if (!gameDef) return { success: false, error: "Game engine not found" };

    // Find acting player
    // If targetPlayerId is supplied and sessionToken is host (e.g. Pass the Phone mode), allow acting as target
    let actor = room.players.find((p) => p.deviceSessionId === sessionToken);
    if (targetPlayerId) {
      const targetP = room.players.find((p) => p.id === targetPlayerId);
      if (targetP && (targetP.deviceSessionId === sessionToken || actor?.isHost)) {
        actor = targetP;
      }
    }

    if (!actor) return { success: false, error: "Player not authorized" };

    const ctx = {
      roomId: room.code,
      players: room.players,
      state: session.state,
      settings: (room.settings.gameSettings as any) || gameDef.defaultSettings,
      round: session.round,
      phase: session.phase,
      stateVersion: session.stateVersion,
    };

    const result = gameDef.handleAction(ctx, actor.id, action);
    if (!result.success) {
      return { success: false, error: result.error || "Action rejected" };
    }

    session.state = result.newState;
    session.phase = result.newPhase;
    if (result.newRound) session.round = result.newRound;
    session.stateVersion += 1;

    if (result.timerDurationMs) {
      session.timer = {
        startsAt: Date.now(),
        endsAt: Date.now() + result.timerDurationMs,
        durationMs: result.timerDurationMs,
        isPaused: false,
      };
    }

    const endCheck = gameDef.checkFinished(ctx);
    if (endCheck?.isFinished) {
      room.status = "FINISHED";
    }

    realtimeHub.publish(room.code, "STATE_CHANGED", session.stateVersion);
    return { success: true };
  }

  advancePassThePhone(code: string, sessionToken: string): { success: boolean; error?: string } {
    const room = this.getRoom(code);
    if (!room || !room.activeSessionId) return { success: false, error: "No active room" };
    const session = this.gameSessions.get(room.activeSessionId);
    if (!session || !session.passThePhone) return { success: false, error: "No pass-the-phone active" };

    if (!session.passThePhone.isRevealed) {
      // Reveal current player
      session.passThePhone.isRevealed = true;
    } else {
      // Hide and move to next player
      session.passThePhone.isRevealed = false;
      session.passThePhone.currentPlayerIndex =
        (session.passThePhone.currentPlayerIndex + 1) % room.players.length;
    }

    session.stateVersion += 1;
    realtimeHub.publish(room.code, "PASS_THE_PHONE_STEP", session.stateVersion);
    return { success: true };
  }

  getAuthorizedState(code: string, sessionToken?: string | null): AuthorizedGameState | null {
    const room = this.getRoom(code);
    if (!room) return null;

    const publicRoomView: PublicRoomView = {
      code: room.code,
      status: room.status,
      selectedGameId: room.selectedGameId,
      hostPlayerId: room.hostPlayerId,
      players: room.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatarSeed: p.avatarSeed,
        status: p.status,
        isHost: p.isHost,
        isOnline: p.isOnline,
        teamId: p.teamId,
      })),
      settings: room.settings,
    };

    let session = room.activeSessionId ? this.gameSessions.get(room.activeSessionId) : undefined;
    const gameDef = getGameDefinition(room.selectedGameId);

    if (session && gameDef) {
      const ctx = {
        roomId: room.code,
        players: room.players,
        state: session.state,
        settings: (room.settings.gameSettings as any) || gameDef.defaultSettings,
        round: session.round,
        phase: session.phase,
        stateVersion: session.stateVersion,
      };

      publicRoomView.gameView = {
        ...gameDef.getPublicView(ctx),
        timer: session.timer,
      };
    }

    // Resolve player view for session token
    let currentPlayer = sessionToken ? room.players.find((p) => p.deviceSessionId === sessionToken) : undefined;

    let privateView = undefined;
    if (session && gameDef) {
      // In ONE_PHONE mode, check who the active pass-the-phone player is
      let viewingPlayerId = currentPlayer?.id;
      if (room.settings.interactionMode === "ONE_PHONE" && session.passThePhone) {
        const activeLocalP = room.players[session.passThePhone.currentPlayerIndex];
        if (session.passThePhone.isRevealed && activeLocalP) {
          viewingPlayerId = activeLocalP.id;
        } else {
          viewingPlayerId = undefined; // Hide secrets behind privacy curtain!
        }
      }

      if (viewingPlayerId) {
        const ctx = {
          roomId: room.code,
          players: room.players,
          state: session.state,
          settings: (room.settings.gameSettings as any) || gameDef.defaultSettings,
          round: session.round,
          phase: session.phase,
          stateVersion: session.stateVersion,
        };
        privateView = gameDef.getPlayerView(ctx, viewingPlayerId);
      }
    }

    let passThePhoneData = undefined;
    if (room.settings.interactionMode === "ONE_PHONE" && session?.passThePhone) {
      const activeP = room.players[session.passThePhone.currentPlayerIndex] || room.players[0];
      passThePhoneData = {
        currentPlayerId: activeP.id,
        currentPlayerNickname: activeP.nickname,
        isRevealed: session.passThePhone.isRevealed,
        remainingPlayersCount: room.players.length - session.passThePhone.currentPlayerIndex,
      };
    }

    return {
      room: publicRoomView,
      player: currentPlayer
        ? {
            id: currentPlayer.id,
            nickname: currentPlayer.nickname,
            isHost: currentPlayer.isHost,
            avatarSeed: currentPlayer.avatarSeed,
          }
        : undefined,
      privateView,
      passThePhone: passThePhoneData,
    };
  }
}

const globalForStore = global as unknown as { jma3aRoomStore?: RoomStore };
export const roomStore = globalForStore.jma3aRoomStore || new RoomStore();
if (process.env.NODE_ENV !== "production") globalForStore.jma3aRoomStore = roomStore;
