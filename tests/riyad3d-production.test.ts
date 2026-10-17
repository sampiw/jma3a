import { describe, expect, it } from "vitest";
import { Riyad3DEngine } from "@/games/riyad3d/engine";
import { GameContext } from "@/games/registry";
import { Player } from "@/lib/types";
import { Riyad3DSettings, Riyad3DState } from "@/games/riyad3d/types";

const mockPlayers: Player[] = [
  {
    id: "p1",
    roomId: "TEST_RYD3D",
    nickname: "يوسف",
    normalizedNickname: "يوسف",
    status: "ACTIVE",
    joinedAt: 1000,
    avatarSeed: "1",
    isHost: true,
    deviceSessionId: "d1",
    isOnline: true,
  },
  {
    id: "p2",
    roomId: "TEST_RYD3D",
    nickname: "كبور",
    normalizedNickname: "كبور",
    status: "ACTIVE",
    joinedAt: 1001,
    avatarSeed: "2",
    isHost: false,
    deviceSessionId: "d2",
    isOnline: true,
  },
  {
    id: "p3",
    roomId: "TEST_RYD3D",
    nickname: "الشعيبية",
    normalizedNickname: "الشعيبية",
    status: "ACTIVE",
    joinedAt: 1002,
    avatarSeed: "3",
    isHost: false,
    deviceSessionId: "d3",
    isOnline: true,
  },
];

function makeCtx(state: Riyad3DState): GameContext<Riyad3DState, Riyad3DSettings> {
  return {
    roomId: "RYD1",
    state,
    players: mockPlayers,
    settings: Riyad3DEngine.defaultSettings,
    phase: state.phase,
    round: state.round,
    stateVersion: 1,
  };
}

describe("Riyad 3D: Haunted Riyad Heist (R.E.P.O. × Lethal Company Marocain)", () => {
  it("initializes 10 fragile 3D Moroccan treasures and sets the Honda Van quota", () => {
    const state = Riyad3DEngine.createInitialState(
      mockPlayers,
      Riyad3DEngine.defaultSettings
    );
    expect(state.phase).toBe("active");
    expect(state.treasures.length).toBe(10);
    expect(state.quotaDh).toBeGreaterThanOrEqual(4500);
    expect(state.players.length).toBe(3);
  });

  it("allows picking up a treasure, cracking it on wall impact, and shattering at 0% durability", () => {
    let state = Riyad3DEngine.createInitialState(
      mockPlayers,
      Riyad3DEngine.defaultSettings
    );
    const crown = state.treasures.find((t) => t.id === "loot_crown")!;
    expect(crown.maxValueDh).toBe(2500);

    // Pickup Crown
    const res1 = Riyad3DEngine.handleAction(makeCtx(state), "p1", {
      type: "PICKUP_LOOT",
      lootId: "loot_crown",
    });
    expect(res1.success).toBe(true);
    state = res1.newState!;
    expect(state.players.find((p) => p.id === "p1")?.carryingLootId).toBe(
      "loot_crown"
    );

    // Wall bump #1 (-40% durability)
    const res2 = Riyad3DEngine.handleAction(makeCtx(state), "p1", {
      type: "DAMAGE_CARRIED_LOOT",
      damagePercent: 40,
      x: -5,
      z: -10,
    });
    state = res2.newState!;
    const crackedCrown = state.treasures.find((t) => t.id === "loot_crown")!;
    expect(crackedCrown.durability).toBe(60);
    expect(crackedCrown.currentValueDh).toBe(1500);
    expect(crackedCrown.status).toBe("carried");

    // Wall bump #2 & #3 shatter it completely (0 DH + alerts Monster)
    state = Riyad3DEngine.handleAction(makeCtx(state), "p1", {
      type: "DAMAGE_CARRIED_LOOT",
      damagePercent: 60,
      x: -5,
      z: -10,
    }).newState!;

    const shatteredCrown = state.treasures.find((t) => t.id === "loot_crown")!;
    expect(shatteredCrown.status).toBe("shattered");
    expect(shatteredCrown.currentValueDh).toBe(0);
    expect(state.players.find((p) => p.id === "p1")?.carryingLootId).toBeNull();
    expect(state.players.find((p) => p.id === "p1")?.shatteredCount).toBe(1);
    expect(state.lastMonsterAlert?.targetPlayerId).toBe("p1");
  });

  it("extracts carried treasure in the Honda Van and supports friend shove betrayal", () => {
    let state = Riyad3DEngine.createInitialState(
      mockPlayers,
      Riyad3DEngine.defaultSettings
    );

    // p1 picks up Chandelier (2200 DH)
    state = Riyad3DEngine.handleAction(makeCtx(state), "p1", {
      type: "PICKUP_LOOT",
      lootId: "loot_chandelier",
    }).newState!;

    // p2 shoves p1 to steal the Chandelier!
    state = Riyad3DEngine.handleAction(makeCtx(state), "p2", {
      type: "SHOVE_PLAYER",
      targetPlayerId: "p1",
      dropX: 0,
      dropZ: 22,
    }).newState!;

    expect(state.players.find((p) => p.id === "p1")?.carryingLootId).toBeNull();
    expect(state.players.find((p) => p.id === "p2")?.shovesDealt).toBe(1);

    const droppedChandelier = state.treasures.find(
      (t) => t.id === "loot_chandelier"
    )!;
    expect(droppedChandelier.status).toBe("available");
    expect(droppedChandelier.durability).toBe(80);

    // p2 picks up the dropped Chandelier and extracts it in the Honda Van!
    state = Riyad3DEngine.handleAction(makeCtx(state), "p2", {
      type: "PICKUP_LOOT",
      lootId: "loot_chandelier",
    }).newState!;

    state = Riyad3DEngine.handleAction(makeCtx(state), "p2", {
      type: "EXTRACT_LOOT",
    }).newState!;

    const p2 = state.players.find((p) => p.id === "p2")!;
    expect(p2.extractedCount).toBe(1);
    expect(p2.extractedDh).toBe(1760);
    expect(state.totalExtractedDh).toBe(1760);
  });

  it("protects hidden players under tables from the Haunted Ghoul and supports RESTART_GAME", () => {
    let state = Riyad3DEngine.createInitialState(
      mockPlayers,
      Riyad3DEngine.defaultSettings
    );

    // p3 hides under North-West Salon Table
    state = Riyad3DEngine.handleAction(makeCtx(state), "p3", {
      type: "TOGGLE_HIDE",
      spotId: "hide_nw",
    }).newState!;
    expect(state.players.find((p) => p.id === "p3")?.hiddenSpotId).toBe(
      "hide_nw"
    );

    // Monster strike on hidden p3 has no effect
    state = Riyad3DEngine.handleAction(makeCtx(state), "p3", {
      type: "MONSTER_STRIKE",
      targetPlayerId: "p3",
      dropX: -18,
      dropZ: -22,
    }).newState!;
    expect(
      state.players.find((p) => p.id === "p3")?.timesCaughtByMonster
    ).toBe(0);

    // Timeout round and restart game
    state = Riyad3DEngine.handleAction(makeCtx(state), "p1", {
      type: "TIMEOUT_ROUND",
    }).newState!;
    expect(state.phase).toBe("finished");

    const restarted = Riyad3DEngine.handleAction(makeCtx(state), "p1", {
      type: "RESTART_GAME",
    }).newState!;
    expect(restarted.phase).toBe("active");
    expect(restarted.round).toBe(2);
  });
});
