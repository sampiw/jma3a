import { describe, it, expect } from "vitest";
import { GhammadaEngine } from "@/games/ghammada/engine";
import { Player } from "@/lib/types";
import { GameContext } from "@/games/registry";
import { GhammadaState, GhammadaSettings } from "@/games/ghammada/types";

const mockPlayers: Player[] = [
  {
    id: "p1",
    roomId: "TEST_ROOM",
    nickname: "عصام",
    normalizedNickname: "عصام",
    status: "ACTIVE",
    joinedAt: 1,
    avatarSeed: "1",
    isHost: true,
    deviceSessionId: "dev_1",
    isOnline: true,
  },
  {
    id: "p2",
    roomId: "TEST_ROOM",
    nickname: "إلياس",
    normalizedNickname: "إلياس",
    status: "ACTIVE",
    joinedAt: 2,
    avatarSeed: "2",
    isHost: false,
    deviceSessionId: "dev_2",
    isOnline: true,
  },
  {
    id: "p3",
    roomId: "TEST_ROOM",
    nickname: "مهدي",
    normalizedNickname: "مهدي",
    status: "ACTIVE",
    joinedAt: 3,
    avatarSeed: "3",
    isHost: false,
    deviceSessionId: "dev_3",
    isOnline: true,
  },
];

function makeCtx(
  state: GhammadaState,
  settings = GhammadaEngine.defaultSettings
): GameContext<GhammadaState, GhammadaSettings> {
  return {
    roomId: "JM-3D",
    players: mockPlayers,
    settings,
    state,
    round: state.round,
    phase: state.phase,
    stateVersion: 1,
  };
}

describe("Ghammada 3D (غمّيضة 3D — Prop Hunt) Engine", () => {
  it("initializes 3D world props, roles, and HIDE_PHASE", () => {
    const val = GhammadaEngine.validateSetup(mockPlayers, GhammadaEngine.defaultSettings);
    expect(val.isValid).toBe(true);

    const state = GhammadaEngine.createInitialState(mockPlayers, GhammadaEngine.defaultSettings);
    expect(state.phase).toBe("HIDE_PHASE");
    expect(state.worldProps.length).toBeGreaterThanOrEqual(24);
    expect(state.hunterIds.length).toBe(1);
    expect(state.entities["p1"].role).toBe("HUNTER");
    expect(state.entities["p2"].role).toBe("HIDER");
    expect(state.entities["p3"].role).toBe("HIDER");
  });

  it("supports Hider prop morphing, position sync, lock, and whistle taunt", () => {
    let state = GhammadaEngine.createInitialState(mockPlayers, GhammadaEngine.defaultSettings);

    // Hider p2 morphs into butagaz and moves
    state = GhammadaEngine.handleAction(makeCtx(state), "p2", {
      type: "MORPH_PROP",
      propId: "butagaz",
    }).newState;
    expect(state.entities["p2"].propId).toBe("butagaz");

    state = GhammadaEngine.handleAction(makeCtx(state), "p2", {
      type: "SYNC_POS",
      x: -8.5,
      z: 9.2,
      rotY: 1.5,
      isLocked: true,
    }).newState;
    expect(state.entities["p2"].x).toBe(-8.5);
    expect(state.entities["p2"].isLocked).toBe(true);

    // Transition to HUNT_PHASE and test whistle taunt (+30 pts)
    state = GhammadaEngine.handleAction(makeCtx(state), "p1", {
      type: "START_HUNT",
    }).newState;
    expect(state.phase).toBe("HUNT_PHASE");

    state = GhammadaEngine.handleAction(makeCtx(state), "p2", {
      type: "TAUNT_WHISTLE",
      x: -8.5,
      z: 9.2,
    }).newState;
    expect(state.scores["p2"]).toBe(30);
    expect(state.entities["p2"].tauntCount).toBe(1);
  });

  it("handles Hunter hammer strikes (miss loses heart, hit catches Hiders and concludes round)", () => {
    let state = GhammadaEngine.createInitialState(mockPlayers, GhammadaEngine.defaultSettings);
    state = GhammadaEngine.handleAction(makeCtx(state), "p1", { type: "START_HUNT" }).newState;

    // Place p2 at (10, 10) and p3 at (-10, -10)
    state.entities["p2"].x = 10;
    state.entities["p2"].z = 10;
    state.entities["p3"].x = -10;
    state.entities["p3"].z = -10;

    // Hunter p1 strikes at (0, 0) -> misses and loses 1 heart
    state = GhammadaEngine.handleAction(makeCtx(state), "p1", {
      type: "HUNTER_STRIKE",
      x: 0,
      z: 0,
      rotY: 0,
    }).newState;
    expect(state.entities["p1"].hearts).toBe(4);

    // Hunter p1 moves to (9.5, 9.5) and strikes -> catches p2 (+120 pts)
    state = GhammadaEngine.handleAction(makeCtx(state), "p1", {
      type: "HUNTER_STRIKE",
      x: 9.5,
      z: 9.5,
      rotY: 0,
    }).newState;
    expect(state.entities["p2"].isCaught).toBe(true);
    expect(state.scores["p1"]).toBe(120);
    expect(state.phase).toBe("HUNT_PHASE");

    // Hunter p1 moves to (-9.5, -9.5) and strikes -> catches p3 -> all hiders caught -> ROUND_END!
    state = GhammadaEngine.handleAction(makeCtx(state), "p1", {
      type: "HUNTER_STRIKE",
      x: -9.5,
      z: -9.5,
      rotY: 0,
    }).newState;
    expect(state.entities["p3"].isCaught).toBe(true);
    expect(state.scores["p1"]).toBe(240);
    expect(state.phase).toBe("ROUND_END");
    expect(state.roundWinner).toBe("HUNTERS");
  });
});
