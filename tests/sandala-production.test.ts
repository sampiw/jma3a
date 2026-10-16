import { describe, it, expect } from "vitest";
import { SandalaEngine } from "@/games/sandala/engine";
import { Player } from "@/lib/types";
import { GameContext } from "@/games/registry";
import { SandalaState, SandalaSettings } from "@/games/sandala/types";

const mockPlayers: Player[] = [
  {
    id: "p1",
    roomId: "TEST_SANDALA",
    nickname: "الحاجة فاطمة",
    normalizedNickname: "الحاجة فاطمة",
    status: "ACTIVE",
    joinedAt: 1000,
    avatarSeed: "avatar_1",
    isHost: true,
    deviceSessionId: "d1",
    isOnline: true,
  },
  {
    id: "p2",
    roomId: "TEST_SANDALA",
    nickname: "كبور",
    normalizedNickname: "كبور",
    status: "ACTIVE",
    joinedAt: 1001,
    avatarSeed: "avatar_2",
    isHost: false,
    deviceSessionId: "d2",
    isOnline: true,
  },
  {
    id: "p3",
    roomId: "TEST_SANDALA",
    nickname: "الشعيبية",
    normalizedNickname: "الشعيبية",
    status: "ACTIVE",
    joinedAt: 1002,
    avatarSeed: "avatar_3",
    isHost: false,
    deviceSessionId: "d3",
    isOnline: true,
  },
];

function makeCtx(
  state: SandalaState,
  settings = SandalaEngine.defaultSettings
): GameContext<SandalaState, SandalaSettings> {
  return {
    roomId: "JM-SANDALA",
    players: mockPlayers,
    settings,
    state,
    round: state.round,
    phase: state.phase,
    stateVersion: 1,
  };
}

describe("Sandala 3D (صندالة الواليدة 3D) Engine", () => {
  it("initializes game with 1 MAMA and KIDs with 3 hearts each", () => {
    const val = SandalaEngine.validateSetup(mockPlayers, SandalaEngine.defaultSettings);
    expect(val.isValid).toBe(true);

    const state = SandalaEngine.createInitialState(mockPlayers, SandalaEngine.defaultSettings);

    expect(state.phase).toBe("ROUND_PLAY");
    expect(state.round).toBe(1);
    expect(state.mamaIds).toEqual(["p1"]);
    expect(state.entities["p1"].role).toBe("MAMA");
    expect(state.entities["p2"].role).toBe("KID");
    expect(state.entities["p2"].hearts).toBe(3);
    expect(state.entities["p3"].hearts).toBe(3);
  });

  it("rewards Matrix Dodge (+35 pts) when a Kid flops on their belly during a Sandala throw", () => {
    let state = SandalaEngine.createInitialState(mockPlayers, SandalaEngine.defaultSettings);

    // Position Mama at (0, 0) aiming along +Z (rotY = 0 -> dir = (0, 1)) and Kid p2 at (0, 5)
    state = SandalaEngine.handleAction(makeCtx(state), "p1", {
      type: "SYNC_POS",
      x: 0,
      z: 0,
      rotY: 0,
    }).newState;
    state = SandalaEngine.handleAction(makeCtx(state), "p2", {
      type: "SYNC_POS",
      x: 0,
      z: 5,
      rotY: 0,
    }).newState;

    // Kid p2 flops on belly right before Mama throws!
    state = SandalaEngine.handleAction(makeCtx(state), "p2", {
      type: "KID_FLOP",
      x: 0,
      z: 5,
    }).newState;

    // Mama throws Sandala straight along +Z (rotY = 0)
    state = SandalaEngine.handleAction(makeCtx(state), "p1", {
      type: "THROW_SANDALA",
      x: 0,
      z: 0,
      rotY: 0,
    }).newState;

    // Kid p2 should keep all 3 hearts and gain +35 Matrix Dodge points!
    expect(state.entities["p2"].hearts).toBe(3);
    expect(state.scores["p2"]).toBe(35);
    expect(state.feed[0].type).toBe("DODGE");
  });

  it("deducts hearts when Sandala hits a standing Kid and K.O.s at 0 hearts", () => {
    let state = SandalaEngine.createInitialState(mockPlayers, SandalaEngine.defaultSettings);

    // Place Mama at (0, 0) and Kid p2 at (0, 4), Kid p3 far away at (-12, -12)
    state = SandalaEngine.handleAction(makeCtx(state), "p1", {
      type: "SYNC_POS",
      x: 0,
      z: 0,
      rotY: 0,
    }).newState;
    state = SandalaEngine.handleAction(makeCtx(state), "p2", {
      type: "SYNC_POS",
      x: 0,
      z: 4,
      rotY: 0,
    }).newState;
    state = SandalaEngine.handleAction(makeCtx(state), "p3", {
      type: "SYNC_POS",
      x: -12,
      z: -12,
      rotY: 0,
    }).newState;

    // Hit 1
    state.entities["p1"].lastThrowAt = 0;
    state = SandalaEngine.handleAction(makeCtx(state), "p1", {
      type: "THROW_SANDALA",
      x: 0,
      z: 0,
      rotY: 0,
    }).newState;
    expect(state.entities["p2"].hearts).toBe(2);

    // Move p2 back to (0, 4) and clear cooldown
    state.entities["p2"].x = 0;
    state.entities["p2"].z = 4;
    state.entities["p1"].lastThrowAt = 0;

    // Hit 2
    state = SandalaEngine.handleAction(makeCtx(state), "p1", {
      type: "THROW_SANDALA",
      x: 0,
      z: 0,
      rotY: 0,
    }).newState;
    expect(state.entities["p2"].hearts).toBe(1);

    // Move p2 back to (0, 4) and clear cooldown
    state.entities["p2"].x = 0;
    state.entities["p2"].z = 4;
    state.entities["p1"].lastThrowAt = 0;

    // Hit 3 -> K.O.!
    state = SandalaEngine.handleAction(makeCtx(state), "p1", {
      type: "THROW_SANDALA",
      x: 0,
      z: 0,
      rotY: 0,
    }).newState;
    expect(state.entities["p2"].hearts).toBe(0);
    expect(state.entities["p2"].isKO).toBe(true);
    expect(state.scores["p1"]).toBeGreaterThanOrEqual(310);
  });

  it("handles Sabon Beldi trap betrayal, Snitch, and Chaabi Dance taunt", () => {
    let state = SandalaEngine.createInitialState(mockPlayers, SandalaEngine.defaultSettings);

    // Kid p2 drops Sabon Beldi at (2, 2)
    state = SandalaEngine.handleAction(makeCtx(state), "p2", {
      type: "DROP_SABON",
      x: 2,
      z: 2,
    }).newState;
    expect(state.traps.length).toBe(1);
    const trapId = state.traps[0].id;

    // Friend p3 slips on p2's Sabon Beldi -> p2 gets +45 betrayal points!
    state = SandalaEngine.handleAction(makeCtx(state), "p3", {
      type: "TRIGGER_SABON",
      trapId,
    }).newState;
    expect(state.traps.length).toBe(0);
    expect(state.scores["p2"]).toBe(45);
    expect(state.entities["p3"].slippedUntil).toBeGreaterThan(Date.now());

    // Kid p2 does Chaabi Dance -> +40 points
    state = SandalaEngine.handleAction(makeCtx(state), "p2", {
      type: "CHAABI_DANCE",
      x: 2,
      z: 2,
    }).newState;
    expect(state.scores["p2"]).toBe(85);
    expect(state.entities["p2"].dancingUntil).toBeGreaterThan(Date.now());

    // Kid p2 snitches on p3 -> +30 points
    state = SandalaEngine.handleAction(makeCtx(state), "p2", {
      type: "SNITCH_FRIEND",
    }).newState;
    expect(state.scores["p2"]).toBe(115);
    expect(state.entities["p3"].snitchedUntil).toBeGreaterThan(Date.now());
  });
});
