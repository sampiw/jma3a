import {
  GameRoom,
  Player,
  DeviceSession,
  GameId,
  InteractionMode,
  AuthorizedGameState,
  PublicRoomView,
  DevicePlayerInfo,
} from "@/lib/types";
import { generateRoomCode, normalizeRoomCode } from "./code";
import { getGameDefinition } from "@/games";
import { realtimeHub } from "@/lib/realtime/pubsub";
import { Redis } from "@upstash/redis";
import fs from "node:fs";
import path from "node:path";

function getEnvVar(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const parts = line.split("=");
        if (parts[0]?.trim() === key) {
          let val = parts.slice(1).join("=").trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          return val;
        }
      }
    }
  } catch {}
  return undefined;
}

const rawRedisUrl = getEnvVar("KV_REST_API_URL") || getEnvVar("UPSTASH_REDIS_REST_URL");
const rawRedisToken = getEnvVar("KV_REST_API_TOKEN") || getEnvVar("UPSTASH_REDIS_REST_TOKEN");

const redisUrl = rawRedisUrl?.replace(/^"(.*)"$/, "$1");
const redisToken = rawRedisToken?.replace(/^"(.*)"$/, "$1");

export const redis = (redisUrl && redisToken)
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

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

export class RoomStore {
  private rooms: Map<string, GameRoom> = new Map();
  private gameSessions: Map<string, InternalGameSession> = new Map();
  private deviceSessions: Map<string, DeviceSession> = new Map();

  private async persistRoom(room: GameRoom) {
    this.rooms.set(room.code, room);
    if (redis) {
      try {
        await redis.set(`jma3a:room:${room.code}`, room, { ex: 86400 });
      } catch (err) {
        console.error("Redis persistRoom error:", err);
      }
    }
  }

  private async persistSession(session: InternalGameSession) {
    this.gameSessions.set(session.id, session);
    if (redis) {
      try {
        await redis.set(`jma3a:session:${session.id}`, session, { ex: 86400 });
      } catch (err) {
        console.error("Redis persistSession error:", err);
      }
    }
  }

  async createRoom(
    hostNickname: string,
    gameId: GameId = "dib",
    mode: InteractionMode = "MULTI_PHONE",
    locale: "darija" | "ar" | "fr" | "en" = "darija",
    hostSessionToken: string,
    avatarSeed: string = "avatar_1"
  ): Promise<{ room: GameRoom; hostPlayer: Player }> {
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

    await this.persistRoom(room);
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

  async getRoom(code: string): Promise<GameRoom | undefined> {
    const norm = normalizeRoomCode(code);
    if (redis) {
      try {
        const fromRedis = await redis.get<GameRoom>(`jma3a:room:${norm}`);
        if (fromRedis) {
          this.rooms.set(norm, fromRedis);
          return fromRedis;
        }
      } catch (err) {
        console.error("Redis getRoom error:", err);
      }
    }
    return this.rooms.get(norm);
  }

  getRoomSync(code: string): GameRoom | undefined {
    return this.rooms.get(normalizeRoomCode(code));
  }

  async getSession(sessionId: string): Promise<InternalGameSession | undefined> {
    if (redis) {
      try {
        const fromRedis = await redis.get<InternalGameSession>(`jma3a:session:${sessionId}`);
        if (fromRedis) {
          this.gameSessions.set(sessionId, fromRedis);
          return fromRedis;
        }
      } catch (err) {
        console.error("Redis getSession error:", err);
      }
    }
    return this.gameSessions.get(sessionId);
  }

  async joinRoom(
    code: string,
    nickname: string,
    sessionToken: string,
    avatarSeed: string = "avatar_1"
  ): Promise<{ success: boolean; player?: Player; error?: string }> {
    const normCode = normalizeRoomCode(code);
    const room = await this.getRoom(normCode);
    if (!room) {
      return { success: false, error: "الغرفة ما كايناش. تأكد من الكود عفاك." };
    }

    // Check if player already exists for this session token (reconnect)
    const existingPlayer = room.players.find((p) => p.deviceSessionId === sessionToken);
    if (existingPlayer) {
      existingPlayer.isOnline = true;
      existingPlayer.lastSeenAt = Date.now();
      await this.persistRoom(room);
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
    await this.persistRoom(room);
    this.recordDeviceSession(sessionToken, normCode, "PERSONAL");

    realtimeHub.publish(normCode, "PLAYER_JOINED", 1);
    return { success: true, player: newPlayer };
  }

  async addLocalPlayer(
    code: string,
    callerSessionToken: string,
    nickname: string,
    avatarSeed: string = "avatar_1"
  ): Promise<{ success: boolean; player?: Player; error?: string }> {
    const room = await this.getRoom(code);
    if (!room) return { success: false, error: "الغرفة ما كايناش" };

    const callerHasPlayer = room.players.some((p) => p.deviceSessionId === callerSessionToken);
    const host = room.players.find((p) => p.id === room.hostPlayerId);
    const isCallerHost = host?.deviceSessionId === callerSessionToken;

    if (!callerHasPlayer && !isCallerHost) {
      return { success: false, error: "الجهاز غير معترف به في هذه الغرفة" };
    }

    if (room.status !== "LOBBY") {
      return { success: false, error: "اللعبة بدات ديجا فهاد الغرفة" };
    }

    const cleanNick = nickname.trim();
    if (!cleanNick) {
      return { success: false, error: "عفاك دخل سمية صالحة" };
    }

    const normNick = cleanNick.toLowerCase();
    const isNickTaken = room.players.some((p) => p.normalizedNickname === normNick);
    const finalNick = isNickTaken ? `${cleanNick} (${room.players.length + 1})` : cleanNick;

    const localId = "p_loc_" + crypto.randomUUID().slice(0, 8);
    const localPlayer: Player = {
      id: localId,
      roomId: room.code,
      nickname: finalNick,
      normalizedNickname: finalNick.toLowerCase(),
      status: "ACTIVE",
      joinedAt: Date.now(),
      avatarSeed,
      isHost: false,
      deviceSessionId: callerSessionToken, // Bound to this phone's session
      isOnline: true,
    };

    room.players.push(localPlayer);
    room.updatedAt = Date.now();
    await this.persistRoom(room);
    realtimeHub.publish(room.code, "PLAYER_JOINED", 1);
    return { success: true, player: localPlayer };
  }

  async removePlayer(
    code: string,
    callerSessionToken: string,
    playerIdToRemove: string
  ): Promise<{ success: boolean; error?: string }> {
    const room = await this.getRoom(code);
    if (!room) return { success: false, error: "الغرفة ما كايناش" };

    const playerIndex = room.players.findIndex((p) => p.id === playerIdToRemove);
    if (playerIndex === -1) return { success: false, error: "اللاعب غير موجود" };

    const playerToRemove = room.players[playerIndex];
    const host = room.players.find((p) => p.id === room.hostPlayerId);
    const isHost = host?.deviceSessionId === callerSessionToken;
    const isOwnDevice = playerToRemove.deviceSessionId === callerSessionToken;

    if (!isHost && !isOwnDevice) {
      return { success: false, error: "ما عندكش الصلاحية باش تمسح هاد اللاعب" };
    }

    if (playerToRemove.isHost) {
      if (room.players.length <= 1) {
        return { success: false, error: "ما يمكنش تمسح المضيف الوحيد" };
      }
      const nextHost = room.players.find((p) => p.id !== playerToRemove.id);
      if (nextHost) {
        nextHost.isHost = true;
        room.hostPlayerId = nextHost.id;
      }
    }

    room.players.splice(playerIndex, 1);
    room.updatedAt = Date.now();

    // If active session, handle safe mark dead
    if (room.activeSessionId) {
      const session = await this.getSession(room.activeSessionId);
      if (session && session.state && session.state.playerStates?.[playerIdToRemove]) {
        session.state.playerStates[playerIdToRemove].isAlive = false;
        await this.persistSession(session);
      }
    }

    await this.persistRoom(room);
    realtimeHub.publish(room.code, "PLAYER_LEFT", 1);
    return { success: true };
  }

  async updateGameSettings(
    code: string,
    hostSessionToken: string,
    gameSettings: Record<string, any>
  ): Promise<{ success: boolean; error?: string }> {
    const room = await this.getRoom(code);
    if (!room) return { success: false, error: "الغرفة ما كايناش" };

    const host = room.players.find((p) => p.id === room.hostPlayerId);
    if (!host || host.deviceSessionId !== hostSessionToken) {
      return { success: false, error: "غير المضيف لي يقدر يبدل إعدادات اللعبة" };
    }

    room.settings.gameSettings = {
      ...(room.settings.gameSettings || {}),
      ...gameSettings,
    };
    room.updatedAt = Date.now();

    await this.persistRoom(room);
    realtimeHub.publish(room.code, "SETTINGS_UPDATED", 1);
    return { success: true };
  }

  async switchGame(
    code: string,
    hostSessionToken: string,
    newGameId: GameId
  ): Promise<{ success: boolean; error?: string }> {
    const room = await this.getRoom(code);
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

    await this.persistRoom(room);
    realtimeHub.publish(room.code, "GAME_SWITCHED", 1, { newGameId });
    return { success: true };
  }

  async startGame(code: string, hostSessionToken: string): Promise<{ success: boolean; error?: string }> {
    const room = await this.getRoom(code);
    if (!room) return { success: false, error: "Room not found" };

    const host = room.players.find((p) => p.id === room.hostPlayerId);
    if (!host || host.deviceSessionId !== hostSessionToken) {
      return { success: false, error: "Only host can start the game" };
    }

    const gameDef = getGameDefinition(room.selectedGameId);
    if (!gameDef) return { success: false, error: "Game engine not found" };

    const mergedSettings = {
      ...gameDef.defaultSettings,
      ...(room.settings.gameSettings || {}),
    };

    const val = gameDef.validateSetup(room.players, mergedSettings);
    if (!val.isValid) {
      return { success: false, error: val.errors?.join(" ") || "Invalid setup" };
    }

    const initialState = gameDef.createInitialState(room.players, mergedSettings);
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

    room.activeSessionId = sessionId;
    room.status = "ACTIVE";
    room.updatedAt = Date.now();

    await this.persistSession(session);
    await this.persistRoom(room);

    realtimeHub.publish(room.code, "GAME_STARTED", 1);
    return { success: true };
  }

  async dispatchAction(
    code: string,
    sessionToken: string,
    action: any,
    targetPlayerId?: string
  ): Promise<{ success: boolean; error?: string }> {
    const room = await this.getRoom(code);
    if (!room || room.status !== "ACTIVE" || !room.activeSessionId) {
      return { success: false, error: "No active game in this room" };
    }

    const session = await this.getSession(room.activeSessionId);
    if (!session) return { success: false, error: "Session not found" };

    const gameDef = getGameDefinition(session.gameId);
    if (!gameDef) return { success: false, error: "Game engine not found" };

    // Find acting player
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
      settings: {
        ...gameDef.defaultSettings,
        interactionMode: room.settings.interactionMode,
        ...(room.settings.gameSettings || {}),
      },
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

    // If DIB transitioned out of ROLE_REVEAL into NIGHT_WOLF, complete pass-the-phone
    if (session.gameId === "dib" && result.newPhase !== "ROLE_REVEAL") {
      session.passThePhone = undefined;
    }

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

    await this.persistSession(session);
    await this.persistRoom(room);

    realtimeHub.publish(room.code, "STATE_CHANGED", session.stateVersion);
    return { success: true };
  }

  async advancePassThePhone(code: string, sessionToken: string): Promise<{ success: boolean; error?: string }> {
    const room = await this.getRoom(code);
    if (!room || !room.activeSessionId) return { success: false, error: "No active room" };
    const session = await this.getSession(room.activeSessionId);
    if (!session || !session.passThePhone) return { success: false, error: "No pass-the-phone active" };

    if (!session.passThePhone.isRevealed) {
      // Reveal current player
      session.passThePhone.isRevealed = true;
    } else {
      // Hide and move to next player
      session.passThePhone.isRevealed = false;
      const nextIndex = session.passThePhone.currentPlayerIndex + 1;
      if (nextIndex >= room.players.length) {
        // All players have viewed their card! Dismiss pass curtain
        session.passThePhone = undefined;
      } else {
        session.passThePhone.currentPlayerIndex = nextIndex;
      }
    }

    session.stateVersion += 1;
    await this.persistSession(session);
    realtimeHub.publish(room.code, "PASS_THE_PHONE_STEP", session.stateVersion);
    return { success: true };
  }

  async getAuthorizedState(code: string, sessionToken?: string | null): Promise<AuthorizedGameState | null> {
    const room = await this.getRoom(code);
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

    let session = room.activeSessionId ? await this.getSession(room.activeSessionId) : undefined;
    const gameDef = getGameDefinition(room.selectedGameId);

    if (session && gameDef) {
      const mergedGameSettings = {
        ...gameDef.defaultSettings,
        interactionMode: room.settings.interactionMode,
        ...(room.settings.gameSettings || {}),
      };

      const ctx = {
        roomId: room.code,
        players: room.players,
        state: session.state,
        settings: mergedGameSettings,
        round: session.round,
        phase: session.phase,
        stateVersion: session.stateVersion,
      };

      publicRoomView.gameView = {
        ...gameDef.getPublicView(ctx),
        timer: session.timer,
      };
    }

    // Resolve players for this device session
    const myDevicePlayers = sessionToken
      ? room.players.filter((p) => p.deviceSessionId === sessionToken)
      : [];

    const devicePlayers: DevicePlayerInfo[] = myDevicePlayers.map((p) => {
      let pView = undefined;
      if (session && gameDef) {
        const mergedGameSettings = {
          ...gameDef.defaultSettings,
          interactionMode: room.settings.interactionMode,
          ...(room.settings.gameSettings || {}),
        };
        const ctx = {
          roomId: room.code,
          players: room.players,
          state: session.state,
          settings: mergedGameSettings,
          round: session.round,
          phase: session.phase,
          stateVersion: session.stateVersion,
        };
        pView = gameDef.getPlayerView(ctx, p.id);
      }
      const isAlive = session?.state?.playerStates?.[p.id]?.isAlive ?? true;
      return {
        id: p.id,
        nickname: p.nickname,
        avatarSeed: p.avatarSeed,
        isHost: p.isHost,
        isAlive,
        privateView: pView,
      };
    });

    let currentPlayer = myDevicePlayers[0];
    let privateView = devicePlayers[0]?.privateView;

    // In ONE_PHONE mode, pass-the-phone controls the shared viewing screen
    if (session && gameDef && room.settings.interactionMode === "ONE_PHONE" && session.passThePhone) {
      const activeLocalP = room.players[session.passThePhone.currentPlayerIndex];
      if (session.passThePhone.isRevealed && activeLocalP) {
        const ctx = {
          roomId: room.code,
          players: room.players,
          state: session.state,
          settings: (room.settings.gameSettings as any) || gameDef.defaultSettings,
          round: session.round,
          phase: session.phase,
          stateVersion: session.stateVersion,
        };
        privateView = gameDef.getPlayerView(ctx, activeLocalP.id);
      } else {
        privateView = undefined; // Hide secrets behind privacy curtain!
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
      devicePlayers,
      privateView,
      passThePhone: passThePhoneData,
    };
  }
}

const globalForStore = globalThis as unknown as { jma3aRoomStore?: RoomStore };
export const roomStore = globalForStore.jma3aRoomStore || new RoomStore();
globalForStore.jma3aRoomStore = roomStore;
