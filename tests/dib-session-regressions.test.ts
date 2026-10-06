import { afterEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => {
  // Keep regression tests isolated from the project's live Redis credentials.
  process.env.KV_REST_API_URL = "https://redis.test.invalid";
  process.env.KV_REST_API_TOKEN = "test-only";
  return new Map<string, unknown>();
});
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async get(key: string) { return structuredClone(storage.get(key)); }
    async set(key: string, value: unknown) { storage.set(key, structuredClone(value)); }
  },
}));

import { RoomStore, redis } from "@/lib/rooms/store";
import { DibEngine, DibState } from "@/games/dib/engine";

async function createGame(mode: "MULTI_PHONE" | "ONE_PHONE" = "MULTI_PHONE") {
  const store = new RoomStore();
  const { room } = await store.createRoom("Host", "dib", mode, "darija", "device_0");
  for (let i = 1; i < 6; i++) {
    await store.joinRoom(room.code, `Friend ${i}`, `device_${i}`);
  }
  expect((await store.startGame(room.code, "device_0")).success).toBe(true);
  const fullRoom = (await store.getRoom(room.code))!;
  const session = (await store.getSession(fullRoom.activeSessionId!))!;
  return { store, room: fullRoom, session, ids: fullRoom.players.map((p) => p.id) };
}

afterEach(() => { vi.restoreAllMocks(); storage.clear(); });

describe("DIB session regressions", () => {
  it.each(["night", "day"])("keeps a dead hunter's phone actionable at wolf parity after %s elimination", async (cause) => {
    const { store, room, session, ids } = await createGame();
    const state = session.state as DibState;
    ids.forEach((id, index) => {
      state.playerStates[id].role = index === 0 ? "wolf" : index === 1 ? "hunter" : "villager";
      state.playerStates[id].team = index === 0 ? "WOLVES" : "VILLAGE";
      state.playerStates[id].isAlive = index < 3;
    });
    state.phase = cause === "night" ? "NIGHT_WITCH" : "DAY_VOTE";
    state.pendingWolfVictimId = ids[1];
    state.dayVotes = { [ids[0]]: ids[1], [ids[1]]: ids[1], [ids[2]]: ids[1] };
    session.phase = state.phase;
    await redis!.set(`jma3a:session:${session.id}`, session);

    expect((await store.dispatchAction(room.code, "device_0", { type: "NEXT_PHASE" })).success).toBe(true);
    const hunterView = await new RoomStore().getAuthorizedState(room.code, "device_1");
    expect(hunterView?.room.status).toBe("ACTIVE");
    expect(hunterView?.room.gameView?.phase).toBe("REACTION_QUEUE");
    expect(hunterView?.privateView?.privateData.isAlive).toBe(false);
    expect(hunterView?.privateView?.allowedActions).toContain("HUNTER_SHOOT");

    // Host trying to advance while everyone waits must not close the room.
    await store.dispatchAction(room.code, "device_0", { type: "NEXT_PHASE" });
    expect((await store.getRoom(room.code))?.status).toBe("ACTIVE");
    expect((await store.dispatchAction(room.code, "device_2", {
      type: "HUNTER_SHOOT", targetPlayerId: ids[0],
    })).success).toBe(false);
    expect((await store.dispatchAction(room.code, "device_1", {
      type: "HUNTER_SHOOT", targetPlayerId: ids[0],
    })).success).toBe(true);
    const final = await store.getAuthorizedState(room.code, "device_1");
    expect(final?.room.status).toBe("FINISHED");
    expect(final?.room.gameView?.publicData.winner).toBe("VILLAGE");
    expect(final?.room.gameView?.timer).toBeUndefined();
  });

  it("defers a win while a second hunter still has a chained shot", async () => {
    const { room, session, ids } = await createGame();
    const state = session.state as DibState;
    ids.forEach((id, index) => {
      Object.assign(state.playerStates[id], {
        role: index === 0 ? "wolf" : index < 3 ? "hunter" : "villager",
        team: index === 0 ? "WOLVES" : "VILLAGE",
        isAlive: index !== 1 && index < 4,
      });
    });
    state.phase = "REACTION_QUEUE";
    state.pendingReactions = [{ id: "first", type: "HUNTER_SHOT", actorPlayerId: ids[1] }];
    const ctx = { roomId: room.code, players: room.players, state, settings: DibEngine.defaultSettings,
      round: 1, phase: state.phase, stateVersion: 1 };
    const shot = DibEngine.handleAction(ctx, ids[1], { type: "HUNTER_SHOOT", targetPlayerId: ids[2] });
    expect(shot.success).toBe(true);
    expect(shot.newState.pendingReactions[0].actorPlayerId).toBe(ids[2]);
    expect(DibEngine.checkFinished({ ...ctx, state: shot.newState })).toBeNull();
  });

  it("keeps playing when the hunter breaks wolf parity by shooting one of two wolves", async () => {
    const { store, room, session, ids } = await createGame();
    const state = session.state as DibState;
    ids.forEach((id, index) => {
      Object.assign(state.playerStates[id], {
        role: index === 1 ? "hunter" : index === 0 || index === 2 ? "wolf" : "villager",
        team: index === 0 || index === 2 ? "WOLVES" : "VILLAGE",
        isAlive: index < 5,
      });
    });
    state.phase = "NIGHT_WITCH";
    state.pendingWolfVictimId = ids[1];
    session.phase = state.phase;
    await redis!.set(`jma3a:session:${session.id}`, session);
    await store.dispatchAction(room.code, "device_0", { type: "NEXT_PHASE" });
    expect((await store.dispatchAction(room.code, "device_1", {
      type: "HUNTER_SHOOT", targetPlayerId: ids[0],
    })).success).toBe(true);
    const afterShot = await store.getAuthorizedState(room.code, "device_1");
    expect(afterShot?.room.status).toBe("ACTIVE");
    expect(afterShot?.room.gameView?.phase).toBe("DAY_ANNOUNCEMENT");
    expect(afterShot?.room.gameView?.publicData.winner).toBeUndefined();
    expect((await store.dispatchAction(room.code, "device_0", { type: "NEXT_PHASE" })).success).toBe(true);
  });

  it("uses persisted night deadlines, preserves them during actions, and rejects early/stale timer events", async () => {
    const time = vi.spyOn(Date, "now");
    time.mockReturnValue(100000);
    const { store, room } = await createGame();
    await store.dispatchAction(room.code, "device_0", { type: "NEXT_PHASE" });
    const intro = (await new RoomStore().getAuthorizedState(room.code, "device_1"))!.room.gameView!;
    expect(intro.timer?.endsAt).toBe(106000);
    const expiry = { type: "NIGHT_TIMER_EXPIRED", phase: intro.phase, endsAt: intro.timer!.endsAt };
    expect((await store.dispatchAction(room.code, "device_0", expiry)).success).toBe(false);
    time.mockReturnValue(106000);
    expect((await store.dispatchAction(room.code, "device_1", expiry)).success).toBe(false);
    expect((await store.dispatchAction(room.code, "device_0", expiry)).success).toBe(true);
    expect((await store.dispatchAction(room.code, "device_0", expiry)).success).toBe(false);
    const seerPhase = (await store.getAuthorizedState(room.code, "device_0"))!.room.gameView!;
    expect(seerPhase.phase).toBe("NIGHT_SEER");
    expect(seerPhase.timer?.endsAt).toBe(121000);
    const fullRoom = (await store.getRoom(room.code))!;
    const session = (await store.getSession(fullRoom.activeSessionId!))!;
    const seer = Object.values((session.state as DibState).playerStates).find((p) => p.role === "seer")!;
    const target = fullRoom.players.find((p) => p.id !== seer.playerId)!;
    const token = fullRoom.players.find((p) => p.id === seer.playerId)!.deviceSessionId;
    expect((await store.dispatchAction(room.code, token, { type: "SEER_INSPECT", targetPlayerId: target.id })).success).toBe(true);
    expect((await store.getAuthorizedState(room.code, token))?.room.gameView?.timer?.endsAt).toBe(121000);
    for (const [phase, deadline, next] of [
      ["NIGHT_SEER", 121000, "NIGHT_WOLVES"],
      ["NIGHT_WOLVES", 146000, "NIGHT_WITCH"],
      ["NIGHT_WITCH", 166000, "DAY_ANNOUNCEMENT"],
    ] as const) {
      time.mockReturnValue(deadline);
      expect((await store.dispatchAction(room.code, "device_0", { type: "NIGHT_TIMER_EXPIRED", phase, endsAt: deadline })).success).toBe(true);
      expect((await store.getAuthorizedState(room.code, "device_0"))?.room.gameView?.phase).toBe(next);
    }
  });

  it("clears the intro timer when entering the untimed one-phone relay", async () => {
    const { store, room } = await createGame("ONE_PHONE");
    await store.dispatchAction(room.code, "device_0", { type: "NEXT_PHASE" });
    await store.dispatchAction(room.code, "device_0", { type: "NEXT_PHASE" });
    const view = (await store.getAuthorizedState(room.code, "device_0"))!.room.gameView!;
    expect(view.phase).toBe("NIGHT_RELAY_PRIMARY");
    expect(view.timer).toBeUndefined();
  });

  it("persists saved custom roles across repeated snapshots and separate store instances", async () => {
    const { store, room } = await createGame();
    const customRoles = { wolf: 1, seer: 0, witch: 1, hunter: 1 };
    expect((await store.updateGameSettings(room.code, "device_0", { customRoles })).success).toBe(true);
    for (let i = 0; i < 3; i++) {
      const state = await new RoomStore().getAuthorizedState(room.code, "device_0");
      expect(state?.room.settings.gameSettings?.customRoles).toEqual(customRoles);
    }
  });
});
