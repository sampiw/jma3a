import { describe, it, expect } from "vitest";
import { MissionSirriyaEngine } from "@/games/mission-sirriya/engine";
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

describe("Mission Sirriya Ambient Engine & Production Features", () => {
  it("deals multiple private missions per player and supports one free pre-game swap", () => {
    const players = makePlayers(4);
    const state = MissionSirriyaEngine.createInitialState(players, {
      preset: "standard",
      missionsPerPlayer: 5,
      successesToWin: 3,
      initialChallengeTokens: 2,
    });

    expect(state.phase).toBe("SECRET_REVEAL");
    expect(state.players["p_1"].assignments.length).toBe(5);
    expect(state.players["p_1"].challengeTokensRemaining).toBe(2);
    expect(state.players["p_1"].freeSwapAvailable).toBe(true);

    const firstAsg = state.players["p_1"].assignments[0];
    const oldMissionId = firstAsg.missionId;

    const ctx = {
      roomId: "TEST",
      players,
      state,
      settings: MissionSirriyaEngine.defaultSettings,
      round: 1,
      phase: state.phase,
      stateVersion: 1,
    };

    // Swap first mission
    const resSwap = MissionSirriyaEngine.handleAction(ctx, "p_1", {
      type: "SWAP_MISSION",
      assignmentId: firstAsg.assignmentId,
    });
    expect(resSwap.success).toBe(true);
    expect(resSwap.newState.players["p_1"].freeSwapAvailable).toBe(false);

    // Cannot swap again!
    const ctx2 = { ...ctx, state: resSwap.newState };
    const resSwapAgain = MissionSirriyaEngine.handleAction(ctx2, "p_1", {
      type: "SWAP_MISSION",
      assignmentId: firstAsg.assignmentId,
    });
    expect(resSwapAgain.success).toBe(false);
  });

  it("handles CHDDITEK challenge flow: correct challenge vs wrong challenge", () => {
    const players = makePlayers(4);
    const state = MissionSirriyaEngine.createInitialState(players, {
      preset: "standard",
      missionsPerPlayer: 5,
      successesToWin: 3,
      initialChallengeTokens: 2,
    });
    state.phase = "ACTIVE";

    const ctx = {
      roomId: "TEST",
      players,
      state,
      settings: MissionSirriyaEngine.defaultSettings,
      round: 1,
      phase: state.phase,
      stateVersion: 1,
    };

    // 1. p_1 challenges p_2 ("شدّيتك!")
    const resChal1 = MissionSirriyaEngine.handleAction(ctx, "p_1", {
      type: "CHALLENGE_PLAYER",
      targetPlayerId: "p_2",
    });
    expect(resChal1.success).toBe(true);
    expect(resChal1.newState.pendingChallenges.length).toBe(1);
    const chal1Id = resChal1.newState.pendingChallenges[0].id;

    // Case A: p_2 was indeed caught!
    const ctxChal1 = { ...ctx, state: resChal1.newState };
    const resRespCaught = MissionSirriyaEngine.handleAction(ctxChal1, "p_2", {
      type: "RESPOND_CHALLENGE",
      challengeId: chal1Id,
      wasCaught: true,
    });
    expect(resRespCaught.success).toBe(true);
    // Challenger keeps token
    expect(resRespCaught.newState.players["p_1"].challengeTokensRemaining).toBe(2);
    // Accused caughtCount + 1
    expect(resRespCaught.newState.players["p_2"].caughtCount).toBe(1);

    // Case B: p_1 challenges p_3, but p_3 was innocent (wrong challenge)
    const ctxWrong = { ...ctx, state: resRespCaught.newState };
    const resChal2 = MissionSirriyaEngine.handleAction(ctxWrong, "p_1", {
      type: "CHALLENGE_PLAYER",
      targetPlayerId: "p_3",
    });
    expect(resChal2.success).toBe(true);
    const chal2Id = resChal2.newState.pendingChallenges[0].id;

    const ctxChal2 = { ...ctx, state: resChal2.newState };
    const resRespInnocent = MissionSirriyaEngine.handleAction(ctxChal2, "p_3", {
      type: "RESPOND_CHALLENGE",
      challengeId: chal2Id,
      wasCaught: false,
    });
    expect(resRespInnocent.success).toBe(true);
    // Challenger LOSES 1 token!
    expect(resRespInnocent.newState.players["p_1"].challengeTokensRemaining).toBe(1);
  });

  it("handles Target Confirmation and win threshold", () => {
    const players = makePlayers(4);
    const state = MissionSirriyaEngine.createInitialState(players, {
      preset: "quick",
      missionsPerPlayer: 3,
      successesToWin: 2,
      initialChallengeTokens: 1,
    });
    state.phase = "ACTIVE";

    const p1Asg = state.players["p_1"].assignments[0];
    p1Asg.adjudication = "TARGET_CONFIRM";

    const ctx = {
      roomId: "TEST",
      players,
      state,
      settings: {
        preset: "quick",
        missionsPerPlayer: 3,
        successesToWin: 2,
        initialChallengeTokens: 1,
      },
      round: 1,
      phase: state.phase,
      stateVersion: 1,
    };

    // p_1 claims completion targeting p_2
    const resClaim = MissionSirriyaEngine.handleAction(ctx, "p_1", {
      type: "CLAIM_MISSION",
      assignmentId: p1Asg.assignmentId,
      targetPlayerId: "p_2",
    });
    expect(resClaim.success).toBe(true);
    expect(resClaim.newState.pendingClaims.length).toBe(1);
    const claimId = resClaim.newState.pendingClaims[0].id;

    // p_2 confirms claim!
    const ctxConfirm = { ...ctx, state: resClaim.newState };
    const resConf = MissionSirriyaEngine.handleAction(ctxConfirm, "p_2", {
      type: "RESPOND_CLAIM",
      claimId,
      confirmed: true,
    });
    expect(resConf.success).toBe(true);
    expect(resConf.newState.players["p_1"].successes).toBe(1);
    expect(resConf.newState.phase).toBe("ACTIVE");

    // p_1 completes second mission via SELF_HONOR -> Wins!
    const p1Asg2 = resConf.newState.players["p_1"].assignments[1];
    p1Asg2.adjudication = "SELF_HONOR";

    const ctxWin = { ...ctx, state: resConf.newState };
    const resWin = MissionSirriyaEngine.handleAction(ctxWin, "p_1", {
      type: "CLAIM_MISSION",
      assignmentId: p1Asg2.assignmentId,
    });
    expect(resWin.success).toBe(true);
    expect(resWin.newState.players["p_1"].successes).toBe(2);
    expect(resWin.newState.phase).toBe("GAME_OVER");
    expect(resWin.newState.winnerPlayerIds).toEqual(["p_1"]);
  });
});
