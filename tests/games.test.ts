import { describe, it, expect } from "vitest";
import { DibEngine, getRecommendedRoleDistribution } from "../games/dib/engine";
import { IntrusEngine } from "../games/intrus/engine";
import { ChkonFinaEngine } from "../games/chkon-fina/engine";
import { MettelhaEngine } from "../games/mettelha/engine";
import { Mamnou3Engine } from "../games/mamnou3/engine";
import { MissionSirriyaEngine } from "../games/mission-sirriya/engine";
import { Player } from "../lib/types";

function createMockPlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `player_${i + 1}`,
    roomId: "JM-TEST",
    nickname: `Player ${i + 1}`,
    normalizedNickname: `player ${i + 1}`,
    status: "ACTIVE",
    joinedAt: Date.now(),
    avatarSeed: `seed_${i + 1}`,
    isHost: i === 0,
    deviceSessionId: `dev_${i + 1}`,
    isOnline: true,
  }));
}

describe("1. DIB Engine (Werewolf)", () => {
  it("generates correct role balance for 6 players", () => {
    const dist = getRecommendedRoleDistribution(6);
    expect(dist.wolf).toBe(2);
    expect(dist.seer).toBe(1);
    expect(dist.witch).toBe(1);
    expect(dist.villager).toBe(2);
  });

  it("strictly hides other players' roles in playerView during active game", () => {
    const players = createMockPlayers(5);
    const state = DibEngine.createInitialState(players, DibEngine.defaultSettings);
    const ctx = {
      roomId: "JM-TEST",
      players,
      state,
      settings: DibEngine.defaultSettings,
      round: 1,
      phase: "NIGHT_WOLF",
      stateVersion: 1,
    };

    const villager = Object.values(state.playerStates).find((p) => p.role === "villager");
    expect(villager).toBeDefined();

    const villagerView = DibEngine.getPlayerView(ctx, villager!.playerId);
    expect(villagerView.myRole).toBe("villager");
    expect(villagerView.privateData.allRoles).toBeUndefined();
    expect(villagerView.privateData.packMembers).toBeUndefined();
  });

  it("wolves see their pack members", () => {
    const players = createMockPlayers(6);
    const state = DibEngine.createInitialState(players, DibEngine.defaultSettings);
    const wolves = Object.values(state.playerStates).filter((p) => p.role === "wolf");
    expect(wolves.length).toBeGreaterThanOrEqual(1);

    const ctx = {
      roomId: "JM-TEST",
      players,
      state: { ...state, phase: "NIGHT_WOLF" as const },
      settings: DibEngine.defaultSettings,
      round: 1,
      phase: "NIGHT_WOLF",
      stateVersion: 1,
    };

    const wolfView = DibEngine.getPlayerView(ctx, wolves[0].playerId);
    expect(wolfView.myRole).toBe("wolf");
    expect(wolfView.privateData.packMembers).toBeDefined();
    expect(Array.isArray(wolfView.privateData.packMembers)).toBe(true);
  });
});

describe("2. L'INTRUS Engine", () => {
  it("assigns secret word to civilians and hides it from intruder", () => {
    const players = createMockPlayers(4);
    const state = IntrusEngine.createInitialState(players, IntrusEngine.defaultSettings);
    const ctx = {
      roomId: "JM-TEST",
      players,
      state,
      settings: IntrusEngine.defaultSettings,
      round: 1,
      phase: "SECRET_REVEAL",
      stateVersion: 1,
    };

    const intruderView = IntrusEngine.getPlayerView(ctx, state.intruderPlayerId);
    expect(intruderView.myRole).toBe("intruder");
    expect(intruderView.mySecret).toBe("INTRUDER");

    const civilian = players.find((p) => p.id !== state.intruderPlayerId)!;
    const civilianView = IntrusEngine.getPlayerView(ctx, civilian.id);
    expect(civilianView.myRole).toBe("civilian");
    expect(civilianView.mySecret).toBe(state.secretWord);
  });
});

describe("3. CHKON FINA? Engine", () => {
  it("resolves voting and calculates percentages and unanimous tag", () => {
    const players = createMockPlayers(3);
    const state = ChkonFinaEngine.createInitialState(players, ChkonFinaEngine.defaultSettings);
    const ctx = {
      roomId: "JM-TEST",
      players,
      state,
      settings: { ...ChkonFinaEngine.defaultSettings, allowSelfVote: true },
      round: 1,
      phase: "VOTING",
      stateVersion: 1,
    };

    // All players vote for player_1
    let curState = state;
    players.forEach((p) => {
      const res = ChkonFinaEngine.handleAction(
        { ...ctx, state: curState },
        p.id,
        { type: "CAST_VOTE", targetPlayerId: "player_1" }
      );
      curState = res.newState;
    });

    expect(curState.phase).toBe("REVEAL_RESULTS");
    expect(curState.results?.topCandidateId).toBe("player_1");
    expect(curState.results?.isUnanimous).toBe(true);
    expect(curState.results?.percentages["player_1"]).toBe(100);
  });
});

describe("4. METTELHA Engine", () => {
  it("tracks scores and team turns correctly", () => {
    const players = createMockPlayers(4);
    const state = MettelhaEngine.createInitialState(players, MettelhaEngine.defaultSettings);
    expect(state.teams.length).toBe(2);

    const ctx = {
      roomId: "JM-TEST",
      players,
      state,
      settings: MettelhaEngine.defaultSettings,
      round: 1,
      phase: "TEAM_PREPARE",
      stateVersion: 1,
    };

    const startRes = MettelhaEngine.handleAction(ctx, state.activeActorId, { type: "START_ACTING" });
    expect(startRes.newPhase).toBe("ACTING");

    const correctRes = MettelhaEngine.handleAction(
      { ...ctx, state: startRes.newState },
      state.activeActorId,
      { type: "MARK_CORRECT" }
    );
    expect(correctRes.newState.teams[0].score).toBe(1);
  });
});

describe("5. MAMNOU3 Engine", () => {
  it("applies penalty on taboo violation and adds points on correct", () => {
    const players = createMockPlayers(4);
    const state = Mamnou3Engine.createInitialState(players, Mamnou3Engine.defaultSettings);
    const ctx = {
      roomId: "JM-TEST",
      players,
      state: { ...state, phase: "DESCRIBING" as const },
      settings: Mamnou3Engine.defaultSettings,
      round: 1,
      phase: "DESCRIBING",
      stateVersion: 1,
    };

    const tabooRes = Mamnou3Engine.handleAction(ctx, state.activeDescriberId, { type: "MARK_TABOO" });
    expect(tabooRes.newState.teams[0].score).toBe(-1);

    const correctRes = Mamnou3Engine.handleAction(
      { ...ctx, state: tabooRes.newState },
      state.activeDescriberId,
      { type: "MARK_CORRECT" }
    );
    expect(correctRes.newState.teams[0].score).toBe(0);
  });
});

describe("6. MISSION SIRRIYA Engine", () => {
  it("assigns unique secret missions and handles completion claim", () => {
    const players = createMockPlayers(3);
    const state = MissionSirriyaEngine.createInitialState(players, MissionSirriyaEngine.defaultSettings);

    const assignedIds = Object.values(state.playerMissions).map((m) => m.missionId);
    expect(new Set(assignedIds).size).toBe(3);

    const ctx = {
      roomId: "JM-TEST",
      players,
      state: { ...state, phase: "ACTIVE_MISSIONS" as const },
      settings: MissionSirriyaEngine.defaultSettings,
      round: 1,
      phase: "ACTIVE_MISSIONS",
      stateVersion: 1,
    };

    const claimRes = MissionSirriyaEngine.handleAction(ctx, "player_1", { type: "CLAIM_COMPLETION" });
    expect(claimRes.newPhase).toBe("CONFIRMATION");
    expect(claimRes.newState.currentClaimPlayerId).toBe("player_1");
  });
});
