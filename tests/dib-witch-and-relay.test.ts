import { describe, it, expect } from "vitest";
import {
  DibEngine,
  buildSeatingRelayQueue,
  resolveWolfPlurality,
  determineWinner,
  DibState,
  DibSettings,
} from "@/games/dib/engine";
import { Player } from "@/lib/types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p_${i + 1}`,
    roomId: "ROOM_TEST",
    nickname: `Player_${i + 1}`,
    normalizedNickname: `player_${i + 1}`,
    status: "ACTIVE",
    joinedAt: Date.now() + i * 10,
    avatarSeed: `seed_${i + 1}`,
    isHost: i === 0,
    deviceSessionId: `dev_${i + 1}`,
    isOnline: true,
  }));
}

function makeControlledState(
  players: Player[],
  roleMap: Record<string, "villager" | "wolf" | "seer" | "witch" | "hunter">
): DibState {
  const state = DibEngine.createInitialState(players, DibEngine.defaultSettings);
  players.forEach((p, idx) => {
    const role = roleMap[p.id] || "villager";
    state.playerStates[p.id] = {
      playerId: p.id,
      role,
      team: role === "wolf" ? "WOLVES" : "VILLAGE",
      isAlive: true,
      seatIndex: idx,
    };
  });
  return state;
}

function dispatch(ctx: any, actorId: string, action: any) {
  const res = DibEngine.handleAction(ctx, actorId, action);
  if (res.success) {
    ctx.state = res.newState;
    ctx.phase = res.newPhase;
  }
  return res;
}

describe("DIB: Witch Pending Attack Semantics & Information Security", () => {
  const players = makePlayers(8);
  const roleMap: Record<string, "villager" | "wolf" | "seer" | "witch" | "hunter"> = {
    p_1: "wolf",
    p_2: "wolf",
    p_3: "seer",
    p_4: "witch",
    p_5: "hunter",
    p_6: "villager",
    p_7: "villager",
    p_8: "villager",
  };

  it("Test 1: Wolf targets victim -> Witch sees victim -> Witch heals -> victim alive at dawn", () => {
    const state = makeControlledState(players, roleMap);
    state.phase = "NIGHT_WOLVES";

    const ctx = {
      roomId: "ROOM_TEST",
      players,
      state,
      settings: DibEngine.defaultSettings,
      round: 1,
      phase: state.phase,
      stateVersion: 1,
    };

    // Wolves vote for p_6 (villager)
    dispatch(ctx, "p_1", { type: "WOLF_VOTE", targetPlayerId: "p_6" });
    dispatch(ctx, "p_2", { type: "WOLF_VOTE", targetPlayerId: "p_6" });

    // Advance to NIGHT_WITCH
    const toWitch = dispatch(ctx, "p_1", { type: "NEXT_PHASE" });
    expect(toWitch.newPhase).toBe("NIGHT_WITCH");

    // Verify pending attack exists but p_6 is STILL alive (not dead yet!)
    expect(ctx.state.pendingWolfVictimId).toBe("p_6");
    expect(ctx.state.playerStates["p_6"].isAlive).toBe(true);

    // Witch inspects private view
    const witchView = DibEngine.getPlayerView(ctx, "p_4");
    expect(witchView.privateData.wolfAttack).toEqual({
      status: "TARGETED",
      victim: { id: "p_6", nickname: "Player_6" },
    });

    // Witch uses healing potion
    const witchAction = dispatch(ctx, "p_4", {
      type: "WITCH_ACTION",
      healWolfVictim: true,
    });
    expect(witchAction.success).toBe(true);

    // Advance through resolution to DAY_ANNOUNCEMENT
    const toDawn = dispatch(ctx, "p_1", { type: "NEXT_PHASE" });
    expect(toDawn.newPhase).toBe("DAY_ANNOUNCEMENT");

    // p_6 survived!
    expect(ctx.state.playerStates["p_6"].isAlive).toBe(true);
    expect(ctx.state.lastResolution?.deaths).toHaveLength(0);
    expect(ctx.state.lastResolution?.savedPlayerId).toBe("p_6");
  });

  it("Test 2: Wolf targets victim -> Witch passes (no heal) -> victim dies at dawn", () => {
    const state = makeControlledState(players, roleMap);
    state.phase = "NIGHT_WOLVES";

    const ctx = {
      roomId: "ROOM_TEST",
      players,
      state,
      settings: DibEngine.defaultSettings,
      round: 1,
      phase: state.phase,
      stateVersion: 1,
    };

    // Wolves vote for p_6
    dispatch(ctx, "p_1", { type: "WOLF_VOTE", targetPlayerId: "p_6" });
    dispatch(ctx, "p_2", { type: "WOLF_VOTE", targetPlayerId: "p_6" });

    // Advance to NIGHT_WITCH
    const toWitch = dispatch(ctx, "p_1", { type: "NEXT_PHASE" });
    expect(toWitch.newPhase).toBe("NIGHT_WITCH");

    // Witch explicitly passes without healing
    const witchPass = dispatch(ctx, "p_4", {
      type: "WITCH_ACTION",
      healWolfVictim: false,
    });
    expect(witchPass.success).toBe(true);

    // Advance to DAY_ANNOUNCEMENT
    const toDawn = dispatch(ctx, "p_1", { type: "NEXT_PHASE" });
    expect(toDawn.newPhase).toBe("DAY_ANNOUNCEMENT");

    // p_6 died of WOLF_ATTACK
    expect(ctx.state.playerStates["p_6"].isAlive).toBe(false);
    expect(ctx.state.lastResolution?.deaths).toHaveLength(1);
    expect(ctx.state.lastResolution?.deaths[0].playerId).toBe("p_6");
    expect(ctx.state.lastResolution?.deaths[0].primaryCause).toBe("WOLF_ATTACK");
  });

  it("Test 3: Wolf targets Witch herself -> Witch self-heals -> Witch survives dawn", () => {
    const state = makeControlledState(players, roleMap);
    state.phase = "NIGHT_WOLVES";

    const ctx = {
      roomId: "ROOM_TEST",
      players,
      state,
      settings: DibEngine.defaultSettings,
      round: 1,
      phase: state.phase,
      stateVersion: 1,
    };

    // Wolves target Witch (p_4)
    dispatch(ctx, "p_1", { type: "WOLF_VOTE", targetPlayerId: "p_4" });

    const toWitch = dispatch(ctx, "p_1", { type: "NEXT_PHASE" });
    expect(toWitch.newPhase).toBe("NIGHT_WITCH");

    // Witch sees she is the victim
    const witchView = DibEngine.getPlayerView(ctx, "p_4");
    expect(witchView.privateData.wolfAttack).toEqual({
      status: "TARGETED",
      victim: { id: "p_4", nickname: "Player_4" },
    });

    // Witch self-heals
    const witchSelfHeal = dispatch(ctx, "p_4", {
      type: "WITCH_ACTION",
      healWolfVictim: true,
    });
    expect(witchSelfHeal.success).toBe(true);

    const toDawn = dispatch(ctx, "p_1", { type: "NEXT_PHASE" });
    expect(toDawn.newPhase).toBe("DAY_ANNOUNCEMENT");

    // Witch is alive!
    expect(ctx.state.playerStates["p_4"].isAlive).toBe(true);
    expect(ctx.state.lastResolution?.deaths).toHaveLength(0);
    expect(ctx.state.lastResolution?.savedPlayerId).toBe("p_4");
  });

  it("Test 4: Witch heals wolf victim AND poisons another player in same night (Dual Potions)", () => {
    const state = makeControlledState(players, roleMap);
    state.phase = "NIGHT_WOLVES";

    const ctx = {
      roomId: "ROOM_TEST",
      players,
      state,
      settings: DibEngine.defaultSettings,
      round: 1,
      phase: state.phase,
      stateVersion: 1,
    };

    // Wolves target p_6
    dispatch(ctx, "p_1", { type: "WOLF_VOTE", targetPlayerId: "p_6" });

    const toWitch = dispatch(ctx, "p_1", { type: "NEXT_PHASE" });
    expect(toWitch.newPhase).toBe("NIGHT_WITCH");

    // Witch uses BOTH potions: heals p_6, poisons p_7
    const dualAction = dispatch(ctx, "p_4", {
      type: "WITCH_ACTION",
      healWolfVictim: true,
      poisonTargetId: "p_7",
    });
    expect(dualAction.success).toBe(true);

    // Both potions now depleted
    expect(ctx.state.witch.healAvailable).toBe(false);
    expect(ctx.state.witch.poisonAvailable).toBe(false);

    const toDawn = dispatch(ctx, "p_1", { type: "NEXT_PHASE" });
    expect(toDawn.newPhase).toBe("DAY_ANNOUNCEMENT");

    // p_6 survived (healed), p_7 died of WITCH_POISON
    expect(ctx.state.playerStates["p_6"].isAlive).toBe(true);
    expect(ctx.state.playerStates["p_7"].isAlive).toBe(false);
    expect(ctx.state.lastResolution?.deaths).toHaveLength(1);
    expect(ctx.state.lastResolution?.deaths[0].playerId).toBe("p_7");
    expect(ctx.state.lastResolution?.deaths[0].primaryCause).toBe("WITCH_POISON");
  });

  it("Test 5: Strict Information Projection: Only living Witch receives wolfAttack", () => {
    const state = makeControlledState(players, roleMap);
    state.phase = "NIGHT_WOLVES";

    const ctx = {
      roomId: "ROOM_TEST",
      players,
      state,
      settings: DibEngine.defaultSettings,
      round: 1,
      phase: state.phase,
      stateVersion: 1,
    };

    dispatch(ctx, "p_1", { type: "WOLF_VOTE", targetPlayerId: "p_6" });

    const toWitch = dispatch(ctx, "p_1", { type: "NEXT_PHASE" });
    expect(toWitch.newPhase).toBe("NIGHT_WITCH");

    // Public view: NO wolf attack info!
    const pubView = DibEngine.getPublicView(ctx);
    expect(pubView.publicData.wolfAttack).toBeUndefined();
    expect((pubView.publicData as any).pendingWolfVictimId).toBeUndefined();

    // Villager view: NO wolf attack info!
    const villagerView = DibEngine.getPlayerView(ctx, "p_6");
    expect(villagerView.privateData.wolfAttack).toBeUndefined();

    // Wolf view: NO wolf attack info! (wolves voted, but don't get the resolved attack projection)
    const wolfView = DibEngine.getPlayerView(ctx, "p_1");
    expect(wolfView.privateData.wolfAttack).toBeUndefined();

    // Hunter view: NO wolf attack info!
    const hunterView = DibEngine.getPlayerView(ctx, "p_5");
    expect(hunterView.privateData.wolfAttack).toBeUndefined();

    // Living Witch view: PROPERLY AUTHORIZED
    const witchView = DibEngine.getPlayerView(ctx, "p_4");
    expect(witchView.privateData.wolfAttack).toBeDefined();
    expect(witchView.privateData.wolfAttack).toEqual({
      status: "TARGETED",
      victim: { id: "p_6", nickname: "Player_6" },
    });
  });
});

describe("DIB: Role-Independent Two-Pass One-Phone Relay", () => {
  const players = makePlayers(6);

  it("Test 6: Queue order is strictly role-independent (based entirely on seating)", () => {
    const roleMapA: Record<string, "villager" | "wolf" | "seer" | "witch" | "hunter"> = {
      p_1: "wolf",
      p_2: "witch",
      p_3: "villager",
      p_4: "seer",
      p_5: "hunter",
      p_6: "villager",
    };
    const stateA = makeControlledState(players, roleMapA);
    const queueA = buildSeatingRelayQueue(stateA.playerStates);

    // Strict seating order 0..5
    expect(queueA).toEqual(["p_1", "p_2", "p_3", "p_4", "p_5", "p_6"]);

    // Now completely swap roles: p_1 is villager, p_2 is wolf, p_6 is witch
    const roleMapB: Record<string, "villager" | "wolf" | "seer" | "witch" | "hunter"> = {
      p_1: "villager",
      p_2: "wolf",
      p_3: "seer",
      p_4: "villager",
      p_5: "hunter",
      p_6: "witch",
    };
    const stateB = makeControlledState(players, roleMapB);
    const queueB = buildSeatingRelayQueue(stateB.playerStates);

    // The physical handoff order remains EXACTLY IDENTICAL
    expect(queueB).toEqual(queueA);
    expect(queueB).toEqual(["p_1", "p_2", "p_3", "p_4", "p_5", "p_6"]);
  });

  it("Test 7: Full Two-Pass relay cycle: Pass A (Ballots) -> Pass B (Witch) -> Dawn", () => {
    const roleMap: Record<string, "villager" | "wolf" | "seer" | "witch" | "hunter"> = {
      p_1: "wolf",
      p_2: "villager",
      p_3: "seer",
      p_4: "wolf",
      p_5: "witch",
      p_6: "villager",
    };
    const state = makeControlledState(players, roleMap);
    state.phase = "NIGHT_INTRO";

    const settings: DibSettings = {
      ...DibEngine.defaultSettings,
      interactionMode: "ONE_PHONE",
    };

    const ctx = {
      roomId: "ROOM_TEST",
      players,
      state,
      settings,
      round: 1,
      phase: state.phase,
      stateVersion: 1,
    };

    // Advance into Pass A (NIGHT_RELAY_PRIMARY)
    const toPassA = dispatch(ctx, "p_1", { type: "NEXT_PHASE" });
    expect(toPassA.newPhase).toBe("NIGHT_RELAY_PRIMARY");

    expect(ctx.state.relayState?.pass).toBe("PRIMARY");
    expect(ctx.state.relayState?.currentIndex).toBe(0);

    // Player 1 (Wolf) takes turn
    dispatch(ctx, "p_1", { type: "RELAY_UNLOCK" });
    dispatch(ctx, "p_1", { type: "WOLF_VOTE", targetPlayerId: "p_2" });
    dispatch(ctx, "p_1", { type: "RELAY_FINISH_TURN" });
    expect(ctx.state.relayState?.currentIndex).toBe(1);

    // Player 2 (Villager) takes turn (decoy sleep)
    dispatch(ctx, "p_2", { type: "RELAY_UNLOCK" });
    dispatch(ctx, "p_2", { type: "RELAY_FINISH_TURN" });
    expect(ctx.state.relayState?.currentIndex).toBe(2);

    // Player 3 (Seer) inspects Player 1
    dispatch(ctx, "p_3", { type: "RELAY_UNLOCK" });
    dispatch(ctx, "p_3", { type: "SEER_INSPECT", targetPlayerId: "p_1" });
    dispatch(ctx, "p_3", { type: "RELAY_FINISH_TURN" });
    expect(ctx.state.relayState?.currentIndex).toBe(3);

    // Player 4 (Wolf) also votes for Player 2
    dispatch(ctx, "p_4", { type: "RELAY_UNLOCK" });
    dispatch(ctx, "p_4", { type: "WOLF_VOTE", targetPlayerId: "p_2" });
    dispatch(ctx, "p_4", { type: "RELAY_FINISH_TURN" });
    expect(ctx.state.relayState?.currentIndex).toBe(4);

    // Player 5 (Witch) takes Pass A turn (sleep/prepare)
    dispatch(ctx, "p_5", { type: "RELAY_UNLOCK" });
    dispatch(ctx, "p_5", { type: "RELAY_FINISH_TURN" });
    expect(ctx.state.relayState?.currentIndex).toBe(5);

    // Player 6 (Villager) finishes Pass A -> Triggers Pass B transition!
    dispatch(ctx, "p_6", { type: "RELAY_UNLOCK" });
    dispatch(ctx, "p_6", { type: "RELAY_FINISH_TURN" });

    // NOW IN PASS B (NIGHT_RELAY_WITCH)!
    expect(ctx.state.phase).toBe("NIGHT_RELAY_WITCH");
    expect(ctx.state.relayState?.pass).toBe("WITCH");
    expect(ctx.state.relayState?.currentIndex).toBe(0);
    // Wolf victim resolved as p_2
    expect(ctx.state.pendingWolfVictimId).toBe("p_2");

    // Cycle Pass B through non-witch players (p_1, p_2, p_3, p_4)
    for (let i = 0; i < 4; i++) {
      const pid = players[i].id;
      dispatch(ctx, pid, { type: "RELAY_UNLOCK" });
      dispatch(ctx, pid, { type: "RELAY_FINISH_TURN" });
    }
    expect(ctx.state.relayState?.currentIndex).toBe(4); // Witch's turn (p_5)

    // Witch unlocks and sees resolved victim p_2
    dispatch(ctx, "p_5", { type: "RELAY_UNLOCK" });
    const witchView = DibEngine.getPlayerView(ctx, "p_5");
    expect(witchView.privateData.wolfAttack).toEqual({
      status: "TARGETED",
      victim: { id: "p_2", nickname: "Player_2" },
    });

    // Witch heals p_2!
    dispatch(ctx, "p_5", { type: "WITCH_ACTION", healWolfVictim: true });
    dispatch(ctx, "p_5", { type: "RELAY_FINISH_TURN" });

    // Player 6 completes Pass B -> advances directly to resolution & DAY_ANNOUNCEMENT
    dispatch(ctx, "p_6", { type: "RELAY_UNLOCK" });
    dispatch(ctx, "p_6", { type: "RELAY_FINISH_TURN" });

    expect(ctx.state.phase).toBe("DAY_ANNOUNCEMENT");
    // p_2 was saved by Witch
    expect(ctx.state.playerStates["p_2"].isAlive).toBe(true);
    expect(ctx.state.lastResolution?.deaths).toHaveLength(0);
    expect(ctx.state.lastResolution?.savedPlayerId).toBe("p_2");
  });

  it("Test 8: Wolf vote tie results in NO_TARGET; Witch sees NO_TARGET but can still poison", () => {
    const roleMap: Record<string, "villager" | "wolf" | "seer" | "witch" | "hunter"> = {
      p_1: "wolf",
      p_2: "wolf",
      p_3: "witch",
      p_4: "villager",
      p_5: "villager",
      p_6: "villager",
    };
    const state = makeControlledState(players, roleMap);
    state.phase = "NIGHT_WOLVES";

    const ctx = {
      roomId: "ROOM_TEST",
      players,
      state,
      settings: DibEngine.defaultSettings,
      round: 1,
      phase: state.phase,
      stateVersion: 1,
    };

    // Wolf 1 votes for p_4, Wolf 2 votes for p_5 (TIE!)
    dispatch(ctx, "p_1", { type: "WOLF_VOTE", targetPlayerId: "p_4" });
    dispatch(ctx, "p_2", { type: "WOLF_VOTE", targetPlayerId: "p_5" });

    const toWitch = dispatch(ctx, "p_1", { type: "NEXT_PHASE" });
    expect(toWitch.newPhase).toBe("NIGHT_WITCH");

    // No target due to tie
    expect(ctx.state.pendingWolfVictimId).toBeUndefined();

    // Witch sees NO_TARGET
    const witchView = DibEngine.getPlayerView(ctx, "p_3");
    expect(witchView.privateData.wolfAttack).toEqual({ status: "NO_TARGET" });

    // Witch poisons p_6
    const poisonAction = dispatch(ctx, "p_3", {
      type: "WITCH_ACTION",
      healWolfVictim: false,
      poisonTargetId: "p_6",
    });
    expect(poisonAction.success).toBe(true);

    const toDawn = dispatch(ctx, "p_1", { type: "NEXT_PHASE" });
    expect(toDawn.newPhase).toBe("DAY_ANNOUNCEMENT");

    // p_4 and p_5 are safe, p_6 died by poison
    expect(ctx.state.playerStates["p_4"].isAlive).toBe(true);
    expect(ctx.state.playerStates["p_5"].isAlive).toBe(true);
    expect(ctx.state.playerStates["p_6"].isAlive).toBe(false);
    expect(ctx.state.lastResolution?.deaths[0].primaryCause).toBe("WITCH_POISON");
  });
});

describe("DIB: Classic Rules Configuration", () => {
  const players = makePlayers(6);
  const roleMap: Record<string, "villager" | "wolf" | "seer" | "witch" | "hunter"> = {
    p_1: "seer",
    p_2: "wolf",
    p_3: "villager",
    p_4: "villager",
    p_5: "villager",
    p_6: "villager",
  };

  it("Test 9: Seer reveal mode: EXACT_ROLE vs ALIGNMENT_ONLY", () => {
    // Mode A: EXACT_ROLE
    const stateA = makeControlledState(players, roleMap);
    stateA.phase = "NIGHT_SEER";
    const ctxA = {
      roomId: "ROOM_TEST",
      players,
      state: stateA,
      settings: { ...DibEngine.defaultSettings, seerRevealMode: "EXACT_ROLE" as const },
      round: 1,
      phase: stateA.phase,
      stateVersion: 1,
    };
    dispatch(ctxA, "p_1", { type: "SEER_INSPECT", targetPlayerId: "p_2" });
    const viewA = DibEngine.getPlayerView(ctxA, "p_1");
    expect((viewA.privateData.seerInspection as any)?.role).toBe("wolf");
    expect((viewA.privateData.seerInspection as any)?.alignment).toBe("WOLF");

    // Mode B: ALIGNMENT_ONLY
    const stateB = makeControlledState(players, roleMap);
    stateB.phase = "NIGHT_SEER";
    const ctxB = {
      roomId: "ROOM_TEST",
      players,
      state: stateB,
      settings: { ...DibEngine.defaultSettings, seerRevealMode: "ALIGNMENT_ONLY" as const },
      round: 1,
      phase: stateB.phase,
      stateVersion: 1,
    };
    dispatch(ctxB, "p_1", { type: "SEER_INSPECT", targetPlayerId: "p_2" });
    const viewB = DibEngine.getPlayerView(ctxB, "p_1");
    expect((viewB.privateData.seerInspection as any)?.role).toBeUndefined();
    expect((viewB.privateData.seerInspection as any)?.alignment).toBe("WOLF");
  });

  it("Test 10: Day vote tie handling: NO_ELIMINATION vs RUNOFF", () => {
    // Mode A: NO_ELIMINATION (Classic default)
    const stateA = makeControlledState(players, roleMap);
    stateA.phase = "DAY_VOTE";
    const ctxA = {
      roomId: "ROOM_TEST",
      players,
      state: stateA,
      settings: { ...DibEngine.defaultSettings, dayTieRule: "NO_ELIMINATION" as const },
      round: 1,
      phase: stateA.phase,
      stateVersion: 1,
    };
    // 2 votes for p_2, 2 votes for p_3 (Quorum is 4 out of 6, met!)
    dispatch(ctxA, "p_1", { type: "DAY_VOTE", targetPlayerId: "p_2" });
    dispatch(ctxA, "p_2", { type: "DAY_VOTE", targetPlayerId: "p_2" });
    dispatch(ctxA, "p_3", { type: "DAY_VOTE", targetPlayerId: "p_3" });
    dispatch(ctxA, "p_4", { type: "DAY_VOTE", targetPlayerId: "p_3" });

    const tieAdvanceA = dispatch(ctxA, "p_1", { type: "NEXT_PHASE" });
    // Advances straight to NIGHT_INTRO with NO elimination!
    expect(tieAdvanceA.newPhase).toBe("NIGHT_INTRO");
    expect(tieAdvanceA.newState.lastResolution?.deaths).toHaveLength(0);

    // Mode B: RUNOFF
    const stateB = makeControlledState(players, roleMap);
    stateB.phase = "DAY_VOTE";
    const ctxB = {
      roomId: "ROOM_TEST",
      players,
      state: stateB,
      settings: { ...DibEngine.defaultSettings, dayTieRule: "RUNOFF" as const },
      round: 1,
      phase: stateB.phase,
      stateVersion: 1,
    };
    dispatch(ctxB, "p_1", { type: "DAY_VOTE", targetPlayerId: "p_2" });
    dispatch(ctxB, "p_2", { type: "DAY_VOTE", targetPlayerId: "p_2" });
    dispatch(ctxB, "p_3", { type: "DAY_VOTE", targetPlayerId: "p_3" });
    dispatch(ctxB, "p_4", { type: "DAY_VOTE", targetPlayerId: "p_3" });

    const tieAdvanceB = dispatch(ctxB, "p_1", { type: "NEXT_PHASE" });
    // Advances to RUNOFF between p_2 and p_3
    expect(tieAdvanceB.newPhase).toBe("RUNOFF");
    expect(tieAdvanceB.newState.runoffCandidates).toEqual(expect.arrayContaining(["p_2", "p_3"]));
  });
});
