import { describe, it, expect } from "vitest";
import { DibEngine, determineWinner, resolveWolfPlurality, getRecommendedRoleDistribution, DibState } from "@/games/dib/engine";
import { Player } from "@/lib/types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p_${i + 1}`,
    roomId: "TEST_ROOM",
    nickname: `Player ${i + 1}`,
    normalizedNickname: `player ${i + 1}`,
    status: "ACTIVE",
    joinedAt: Date.now(),
    avatarSeed: "avatar_1",
    isHost: i === 0,
    deviceSessionId: `dev_${i + 1}`,
    isOnline: true,
  }));
}

describe("DIB Production Engine & Edge Cases", () => {
  it("enforces hard minimum 6 players and validates role balancing table", () => {
    const players5 = makePlayers(5);
    const val5 = DibEngine.validateSetup(players5, DibEngine.defaultSettings);
    expect(val5.isValid).toBe(false);
    expect(val5.errors?.[0]).toContain("6");

    const players6 = makePlayers(6);
    const val6 = DibEngine.validateSetup(players6, DibEngine.defaultSettings);
    expect(val6.isValid).toBe(true);

    const dist8 = getRecommendedRoleDistribution(8);
    expect(dist8.wolf).toBe(2);
    expect(dist8.seer).toBe(1);
    expect(dist8.witch).toBe(1);
    expect(dist8.hunter).toBe(0);
    expect(dist8.villager).toBe(4);

    const dist10 = getRecommendedRoleDistribution(10);
    expect(dist10.wolf).toBe(3);
    expect(dist10.hunter).toBe(1);
  });

  it("handles Seer inspection returning alignment WOLF vs NOT_WOLF", () => {
    const players = makePlayers(8);
    const state = DibEngine.createInitialState(players, DibEngine.defaultSettings);
    state.phase = "NIGHT_SEER";

    const seer = Object.values(state.playerStates).find((p) => p.role === "seer")!;
    const wolf = Object.values(state.playerStates).find((p) => p.role === "wolf")!;
    const villager = Object.values(state.playerStates).find((p) => p.role === "villager")!;

    const ctx = {
      roomId: "TEST",
      players,
      state,
      settings: DibEngine.defaultSettings,
      round: 1,
      phase: state.phase,
      stateVersion: 1,
    };

    // Inspect wolf
    const resWolf = DibEngine.handleAction(ctx, seer.playerId, {
      type: "SEER_INSPECT",
      targetPlayerId: wolf.playerId,
    });
    expect(resWolf.success).toBe(true);
    expect(resWolf.newState.seerCurrentInspection?.alignment).toBe("WOLF");

    // Cannot inspect twice in same night
    const ctx2 = { ...ctx, state: resWolf.newState };
    const resTwice = DibEngine.handleAction(ctx2, seer.playerId, {
      type: "SEER_INSPECT",
      targetPlayerId: villager.playerId,
    });
    expect(resTwice.success).toBe(false);
  });

  it("resolves Wolf plurality and resolves ties as NO KILL", () => {
    const players = makePlayers(8);
    const state = DibEngine.createInitialState(players, DibEngine.defaultSettings);
    // Explicitly guarantee candidates are non-wolves so votes are valid
    state.playerStates["p_5"].role = "villager";
    state.playerStates["p_6"].role = "villager";

    // Case 1: Unique winner
    const votes1 = {
      p_1: "p_5",
      p_2: "p_5",
      p_3: "p_6",
    };
    expect(resolveWolfPlurality(votes1, state.playerStates)).toBe("p_5");

    // Case 2: Tie for first place => NO KILL
    const votes2 = {
      p_1: "p_5",
      p_2: "p_6",
    };
    expect(resolveWolfPlurality(votes2, state.playerStates)).toBeUndefined();
  });

  it("handles Witch using both heal and poison in same night and healing self", () => {
    const players = makePlayers(8);
    const state = DibEngine.createInitialState(players, DibEngine.defaultSettings);

    const witch = Object.values(state.playerStates).find((p) => p.role === "witch")!;
    const innocent = Object.values(state.playerStates).find((p) => p.role === "villager")!;

    state.phase = "NIGHT_WITCH";
    // Wolves attacked Witch!
    state.wolfResolvedVictimId = witch.playerId;

    const ctx = {
      roomId: "TEST",
      players,
      state,
      settings: DibEngine.defaultSettings,
      round: 1,
      phase: state.phase,
      stateVersion: 1,
    };

    // Witch heals self AND poisons another player
    const resWitch = DibEngine.handleAction(ctx, witch.playerId, {
      type: "WITCH_ACTION",
      healWolfVictim: true,
      poisonTargetId: innocent.playerId,
    });
    expect(resWitch.success).toBe(true);
    expect(resWitch.newState.witch.healAvailable).toBe(false);
    expect(resWitch.newState.witch.poisonAvailable).toBe(false);
    expect(resWitch.newState.witchSavedPlayerId).toBe(witch.playerId);
    expect(resWitch.newState.witchPoisonTargetId).toBe(innocent.playerId);

    // Advance to NIGHT_RESOLUTION
    const ctxNight = { ...ctx, state: resWitch.newState };
    const resAdvance = DibEngine.handleAction(ctxNight, players[0].id, { type: "NEXT_PHASE" });
    expect(resAdvance.success).toBe(true);

    // Witch survived because of self-heal! Innocent died of poison!
    expect(resAdvance.newState.playerStates[witch.playerId].isAlive).toBe(true);
    expect(resAdvance.newState.playerStates[innocent.playerId].isAlive).toBe(false);
    expect(resAdvance.newState.lastResolution?.deaths.length).toBe(1);
    expect(resAdvance.newState.lastResolution?.deaths[0].causes).toContain("WITCH_POISON");
  });

  it("resolves Hunter reaction queue and chained Hunter shots", () => {
    const players = makePlayers(8);
    const state = DibEngine.createInitialState(players, DibEngine.defaultSettings);

    // Force Hunter A and Hunter B roles
    const p1 = players[0].id;
    const p2 = players[1].id;
    const p3 = players[2].id;
    state.playerStates[p1].role = "hunter";
    state.playerStates[p2].role = "hunter";
    state.playerStates[p3].role = "wolf";

    // Hunter A dies at night
    state.phase = "NIGHT_WITCH";
    state.wolfResolvedVictimId = p1;
    state.witchActionDone = true;

    const ctx = {
      roomId: "TEST",
      players,
      state,
      settings: DibEngine.defaultSettings,
      round: 1,
      phase: state.phase,
      stateVersion: 1,
    };

    // Advance night resolution
    const resAdv = DibEngine.handleAction(ctx, p1, { type: "NEXT_PHASE" });
    expect(resAdv.success).toBe(true);
    expect(resAdv.newPhase).toBe("REACTION_QUEUE");
    expect(resAdv.newState.pendingReactions.length).toBe(1);
    expect(resAdv.newState.pendingReactions[0].actorPlayerId).toBe(p1);

    // Hunter A shoots Hunter B!
    const ctxReaction1 = { ...ctx, state: resAdv.newState, phase: resAdv.newPhase };
    const resShoot1 = DibEngine.handleAction(ctxReaction1, p1, {
      type: "HUNTER_SHOOT",
      targetPlayerId: p2,
    });
    expect(resShoot1.success).toBe(true);
    expect(resShoot1.newPhase).toBe("REACTION_QUEUE");
    // Hunter B is now enqueued for revenge shot!
    expect(resShoot1.newState.pendingReactions.length).toBe(1);
    expect(resShoot1.newState.pendingReactions[0].actorPlayerId).toBe(p2);

    // Hunter B shoots Wolf!
    const ctxReaction2 = { ...ctx, state: resShoot1.newState, phase: resShoot1.newPhase };
    const resShoot2 = DibEngine.handleAction(ctxReaction2, p2, {
      type: "HUNTER_SHOOT",
      targetPlayerId: p3,
    });
    expect(resShoot2.success).toBe(true);
    expect(resShoot2.newState.playerStates[p3].isAlive).toBe(false);
    expect(resShoot2.newState.pendingReactions.length).toBe(0);
  });

  it("handles Day vote tie triggering runoff, and runoff tie resulting in no elimination", () => {
    const players = makePlayers(6);
    const state = DibEngine.createInitialState(players, DibEngine.defaultSettings);
    state.phase = "DAY_VOTE";

    // 6 players: p1 and p2 tie with 3 votes each
    state.dayVotes = {
      p_1: "p_5",
      p_2: "p_5",
      p_3: "p_5",
      p_4: "p_6",
      p_5: "p_6",
      p_6: "p_6",
    };

    const ctx = {
      roomId: "TEST",
      players,
      state,
      settings: { ...DibEngine.defaultSettings, dayTieRule: "RUNOFF" as const },
      round: 1,
      phase: state.phase,
      stateVersion: 1,
    };

    // Advance day vote => triggers RUNOFF between p_5 and p_6
    const resVote = DibEngine.handleAction(ctx, players[0].id, { type: "NEXT_PHASE" });
    expect(resVote.success).toBe(true);
    expect(resVote.newPhase).toBe("RUNOFF");
    expect(resVote.newState.runoffCandidates).toEqual(["p_5", "p_6"]);

    // Runoff votes also tie!
    const ctxRunoff = { ...ctx, state: resVote.newState, phase: resVote.newPhase };
    ctxRunoff.state.runoffVotes = {
      p_1: "p_5",
      p_2: "p_5",
      p_3: "p_6",
      p_4: "p_6",
    };

    // Advance runoff => NO ELIMINATION on second tie! Transitions to DAY_RESOLUTION
    const resRunoffAdv = DibEngine.handleAction(ctxRunoff, players[0].id, { type: "NEXT_PHASE" });
    expect(resRunoffAdv.success).toBe(true);
    expect(resRunoffAdv.newPhase).toBe("DAY_RESOLUTION");
    expect(resRunoffAdv.newState.lastResolution?.deaths.length).toBe(0);

    // Advancing from DAY_RESOLUTION moves into NIGHT_INTRO
    const resNight = DibEngine.handleAction(
      { ...ctxRunoff, state: resRunoffAdv.newState, phase: resRunoffAdv.newPhase },
      players[0].id,
      { type: "NEXT_PHASE" }
    );
    expect(resNight.newPhase).toBe("NIGHT_INTRO");
  });

  it("evaluates win conditions correctly behind resolution barrier", () => {
    const players = makePlayers(6);
    const state = DibEngine.createInitialState(players, DibEngine.defaultSettings);

    // Kill all wolves => VILLAGE wins
    for (const p of Object.values(state.playerStates)) {
      if (p.role === "wolf") p.isAlive = false;
    }
    expect(determineWinner(state.playerStates)).toBe("VILLAGE");

    // Wolves equal living non-wolves => WOLVES win
    const state2 = DibEngine.createInitialState(players, DibEngine.defaultSettings);
    // 2 wolves, 4 villagers: kill 2 villagers => 2 wolves, 2 villagers
    const villagers = Object.values(state2.playerStates).filter((p) => p.role !== "wolf");
    villagers[0].isAlive = false;
    villagers[1].isAlive = false;
    expect(determineWinner(state2.playerStates)).toBe("WOLVES");

    // All dead => DRAW
    const state3 = DibEngine.createInitialState(players, DibEngine.defaultSettings);
    for (const p of Object.values(state3.playerStates)) p.isAlive = false;
    expect(determineWinner(state3.playerStates)).toBe("DRAW");
  });
});
