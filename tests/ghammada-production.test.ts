import { describe, it, expect } from "vitest";
import { GhammadaEngine } from "@/games/ghammada/engine";
import { Player } from "@/lib/types";
import { GameContext } from "@/games/registry";
import { GhammadaState, GhammadaSettings } from "@/games/ghammada/types";
import {
  cameraForward,
  cameraRelativeMove,
  cameraRight,
} from "@/components/games/ghammada/controlsMath";
import { FOUNTAIN_RADIUS, resolveCollisions } from "@/games/ghammada/layout";

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

describe("Ghammada 3D (غمّيضة 3D — Prop Hunt) Engine & Controls", () => {
  it("initializes 3D world props outside furniture colliders, roles, and HIDE_PHASE", () => {
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

  it("handles directional Hunter hammer strikes (smashing decoy loses heart, hitting Hiders catches them)", () => {
    let state = GhammadaEngine.createInitialState(mockPlayers, GhammadaEngine.defaultSettings);
    state = GhammadaEngine.handleAction(makeCtx(state), "p1", { type: "START_HUNT" }).newState;

    // Place p2 at (10, 10) and p3 at (-10, -10)
    state.entities["p2"].x = 10;
    state.entities["p2"].z = 10;
    state.entities["p3"].x = -10;
    state.entities["p3"].z = -10;

    // Place a decoy worldProp at (0, 1.3) directly in front of Hunter at (0, 0, rotY=0)
    state.worldProps[0].x = 0;
    state.worldProps[0].z = 1.3;
    state.worldProps[0].isDestroyed = false;

    // Hunter p1 strikes at (0, 0, rotY=0) -> smashes decoy worldProp[0] and loses 1 heart
    state = GhammadaEngine.handleAction(makeCtx(state), "p1", {
      type: "HUNTER_STRIKE",
      x: 0,
      z: 0,
      rotY: 0,
    }).newState;
    expect(state.worldProps[0].isDestroyed).toBe(true);
    expect(state.entities["p1"].hearts).toBe(4);

    // Clear strike cooldown to simulate next swing
    state.entities["p1"].lastStrikeAt = 0;

    // Hunter p1 stands at (10, 8.7) facing +Z (rotY=0) so hammer hits (10, 10) -> catches p2 (+120 pts)
    state = GhammadaEngine.handleAction(makeCtx(state), "p1", {
      type: "HUNTER_STRIKE",
      x: 10,
      z: 8.7,
      rotY: 0,
    }).newState;
    expect(state.entities["p2"].isCaught).toBe(true);
    expect(state.scores["p1"]).toBe(120);
    expect(state.phase).toBe("HUNT_PHASE");

    // Clear strike cooldown and strike p3 at (-10, -10) from (-10, -11.3, rotY=0) -> all hiders caught -> ROUND_END!
    state.entities["p1"].lastStrikeAt = 0;
    state = GhammadaEngine.handleAction(makeCtx(state), "p1", {
      type: "HUNTER_STRIKE",
      x: -10,
      z: -11.3,
      rotY: 0,
    }).newState;
    expect(state.entities["p3"].isCaught).toBe(true);
    expect(state.scores["p1"]).toBe(240);
    expect(state.phase).toBe("ROUND_END");
    expect(state.roundWinner).toBe("HUNTERS");
  });

  it("prevents duplicate TIME_UP packets from skipping HUNT_PHASE", () => {
    let state = GhammadaEngine.createInitialState(mockPlayers, GhammadaEngine.defaultSettings);
    state.phaseEndsAt = Date.now() - 100;

    // First TIME_UP transitions from HIDE_PHASE -> HUNT_PHASE
    state = GhammadaEngine.handleAction(makeCtx(state), "p1", {
      type: "TIME_UP",
      forPhase: "HIDE_PHASE",
    }).newState;
    expect(state.phase).toBe("HUNT_PHASE");

    // Duplicate TIME_UP arriving 350ms later MUST NOT skip HUNT_PHASE!
    state = GhammadaEngine.handleAction(makeCtx(state), "p1", {
      type: "TIME_UP",
      forPhase: "HIDE_PHASE",
    }).newState;
    expect(state.phase).toBe("HUNT_PHASE");

    // Even a TIME_UP without forPhase must not end HUNT_PHASE before its 75s timer expires
    state = GhammadaEngine.handleAction(makeCtx(state), "p1", {
      type: "TIME_UP",
    }).newState;
    expect(state.phase).toBe("HUNT_PHASE");
  });

  it("keeps joystick movement aligned with camera yaw at all 360° angles (never inverted)", () => {
    const testAngles = [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2, 2.35];

    for (const yaw of testAngles) {
      const f = cameraForward(yaw);
      const r = cameraRight(yaw);

      // Pushing stick UP (jy = -1) must move strictly along +cameraForward(yaw)
      const upMove = cameraRelativeMove(0, -1, yaw);
      const dotForward = upMove.x * f.x + upMove.z * f.z;
      expect(dotForward).toBeCloseTo(1, 5);

      // Pushing stick DOWN (jy = +1) must move strictly along -cameraForward(yaw)
      const downMove = cameraRelativeMove(0, 1, yaw);
      const dotBack = downMove.x * f.x + downMove.z * f.z;
      expect(dotBack).toBeCloseTo(-1, 5);

      // Pushing stick RIGHT (jx = +1) must move strictly along +cameraRight(yaw)
      const rightMove = cameraRelativeMove(1, 0, yaw);
      const dotRight = rightMove.x * r.x + rightMove.z * r.z;
      expect(dotRight).toBeCloseTo(1, 5);
    }

    // Verify collision resolution pushes player out of center fountain
    const pushed = resolveCollisions(0.5, 0, 0.45);
    expect(Math.hypot(pushed.x, pushed.z)).toBeGreaterThanOrEqual(FOUNTAIN_RADIUS + 0.44);
  });
});
