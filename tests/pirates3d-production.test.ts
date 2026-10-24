import { describe, expect, it } from "vitest";
import { Pirates3DEngine } from "@/games/pirates3d/engine";
import { GameContext } from "@/games/registry";
import { Player } from "@/lib/types";
import { Pirates3DSettings, Pirates3DState } from "@/games/pirates3d/types";

const mockPlayers: Player[] = [
  {
    id: "p1",
    roomId: "TEST_PIRATES",
    nickname: "الرايس يوسف",
    normalizedNickname: "الرايس يوسف",
    status: "ACTIVE",
    joinedAt: 1000,
    avatarSeed: "1",
    isHost: true,
    deviceSessionId: "d1",
    isOnline: true,
  },
  {
    id: "p2",
    roomId: "TEST_PIRATES",
    nickname: "الرايس كبور",
    normalizedNickname: "الرايس كبور",
    status: "ACTIVE",
    joinedAt: 1001,
    avatarSeed: "2",
    isHost: false,
    deviceSessionId: "d2",
    isOnline: true,
  },
];

function makeCtx(
  state: Pirates3DState
): GameContext<Pirates3DState, Pirates3DSettings> {
  return {
    roomId: "PIR1",
    state,
    players: mockPlayers,
    settings: Pirates3DEngine.defaultSettings,
    phase: state.phase,
    round: state.round,
    stateVersion: 1,
  };
}

describe("Pirates 3D: Corsairs of Salé Engine", () => {
  it("spawns player galleons, AI corsair bots, and floating loot crates", () => {
    const state = Pirates3DEngine.createInitialState(
      mockPlayers,
      Pirates3DEngine.defaultSettings
    );

    expect(state.phase).toBe("PLAYING");
    expect(state.ships["p1"]).toBeDefined();
    expect(state.ships["p2"]).toBeDefined();
    expect(Object.keys(state.ships).length).toBeGreaterThanOrEqual(4);
    expect(state.lootCrates.length).toBe(6);
  });

  it("handles cannon fire, shield absorption, ship sinking, and victory", () => {
    let state = Pirates3DEngine.createInitialState(mockPlayers, {
      aiBotsEnabled: false,
      interactionMode: "MULTI_PHONE",
    });

    // Place p1 and p2 within cannon range
    state.ships["p1"].x = -12;
    state.ships["p1"].z = 15;
    state.ships["p2"].x = 8;
    state.ships["p2"].z = 15;
    state.ships["p2"].shield = 0;
    state.ships["p2"].hp = 35;

    // p1 fires a TRIPLE broadside locked onto p2
    const fireRes = Pirates3DEngine.handleAction(makeCtx(state), "p1", {
      type: "FIRE_CANNON",
      mode: "TRIPLE",
      fromX: -12,
      fromZ: 15,
      aimYaw: Math.PI / 2,
      targetX: 8,
      targetZ: 15,
      targetShipId: "p2",
    });

    expect(fireRes.success).toBe(true);
    state = fireRes.newState!;
    expect(state.ships["p2"].hp).toBe(0);
    expect(state.ships["p2"].sunkUntil).toBeGreaterThan(Date.now());
    expect(state.ships["p1"].sinks).toBe(1);
    expect(state.ships["p1"].goldScore).toBeGreaterThanOrEqual(200);

    // Give p1 4 sinks and sink another ship to trigger WIN_SINKS_TARGET (5)
    state.ships["p1"].sinks = 4;
    state.ships["p1"].lastBroadsideAt = 0;
    state.ships["p2"].sunkUntil = 0;
    state.ships["p2"].hp = 20;

    const winRes = Pirates3DEngine.handleAction(makeCtx(state), "p1", {
      type: "FIRE_CANNON",
      mode: "TRIPLE",
      fromX: -12,
      fromZ: 15,
      aimYaw: Math.PI / 2,
      targetX: 8,
      targetZ: 15,
      targetShipId: "p2",
    });

    expect(winRes.newState!.phase).toBe("GAME_OVER");
    expect(winRes.newState!.winnerId).toBe("p1");
  });

  it("supports wind boost + hull repair and battle restart", () => {
    let state = Pirates3DEngine.createInitialState(
      mockPlayers,
      Pirates3DEngine.defaultSettings
    );
    state.ships["p1"].hp = 60;

    const boostRes = Pirates3DEngine.handleAction(makeCtx(state), "p1", {
      type: "WIND_BOOST",
    });
    expect(boostRes.success).toBe(true);
    state = boostRes.newState!;
    expect(state.ships["p1"].hp).toBe(80);
    expect(state.ships["p1"].windBoostUntil).toBeGreaterThan(Date.now());

    const restartRes = Pirates3DEngine.handleAction(makeCtx(state), "p1", {
      type: "RESTART_BATTLE",
    });
    expect(restartRes.success).toBe(true);
    expect(restartRes.newState!.round).toBe(2);
    expect(restartRes.newState!.ships["p1"].hp).toBe(100);
  });
});
