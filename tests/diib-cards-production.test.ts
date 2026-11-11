import { describe, it, expect } from "vitest";
import {
  DiibCardsEngine,
  getRecommendedDiibCardsDistribution,
} from "../games/diib-cards/engine";
import { Player } from "../lib/types";
import { RoomStore } from "../lib/rooms/store";

function createPlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p_${i + 1}`,
    roomId: "JM-CARDS",
    nickname: `Player ${i + 1}`,
    normalizedNickname: `player ${i + 1}`,
    status: "ACTIVE",
    joinedAt: Date.now(),
    avatarSeed: `avatar_${(i % 8) + 1}`,
    isHost: i === 0,
    deviceSessionId: `tok_${i + 1}`,
    isOnline: true,
  }));
}

function makeCtx(players: Player[], state: any, overrides?: any) {
  return {
    roomId: "JM-CARDS",
    players,
    state,
    settings: {
      ...DiibCardsEngine.defaultSettings,
      ...(overrides || {}),
    },
    round: state.round || 1,
    phase: state.phase,
    stateVersion: state.eventSequence || 1,
  };
}

describe("Diib Cards (كوارط الذيب) Production Engine & Rules", () => {
  it("validates minimum 4 players (1 Manager + 3 Role Cards) and balanced distributions", () => {
    const three = createPlayers(3);
    expect(DiibCardsEngine.validateSetup(three, DiibCardsEngine.defaultSettings).isValid).toBe(false);

    const seven = createPlayers(7);
    expect(DiibCardsEngine.validateSetup(seven, DiibCardsEngine.defaultSettings).isValid).toBe(true);

    // 7 players in room => 1 Manager + 6 playable cards
    const dist6 = getRecommendedDiibCardsDistribution(6);
    const totalCards = Object.values(dist6).reduce((a, b) => a + b, 0);
    expect(totalCards).toBe(6);
    expect(dist6.wolf + dist6.mute_wolf).toBe(2);
  });

  it("lets a non-host friend volunteer and get the Manager Card while keeping everyone in the room", () => {
    const players = createPlayers(7);
    let state = DiibCardsEngine.createInitialState(players, DiibCardsEngine.defaultSettings);
    expect(state.phase).toBe("MANAGER_SELECT");

    // Player 3 (non-host) asks to be Manager
    const volRes = DiibCardsEngine.handleAction(makeCtx(players, state), "p_3", {
      type: "VOLUNTEER_MANAGER",
    });
    expect(volRes.success).toBe(true);
    state = volRes.newState;
    expect(state.managerVolunteers).toEqual(["p_3"]);

    // Sole volunteer claims Manager Card directly (or Host confirms)
    const confirmRes = DiibCardsEngine.handleAction(makeCtx(players, state), "p_3", {
      type: "CONFIRM_MANAGER",
      managerId: "p_3",
    });
    expect(confirmRes.success).toBe(true);
    state = confirmRes.newState;
    expect(state.phase).toBe("ROLE_REVEAL");
    expect(state.managerId).toBe("p_3");
    expect(state.playerStates["p_3"].role).toBe("manager");
    expect(state.playerStates["p_3"].team).toBe("MANAGER");

    // All other 6 players remain in room and hold playable cards
    const playable = Object.values(state.playerStates).filter((p) => p.role !== "manager");
    expect(playable.length).toBe(6);

    // Strict Information Security:
    // 1. Manager sees Master Roster
    const managerView = DiibCardsEngine.getPlayerView(makeCtx(players, state), "p_3");
    expect(managerView.myRole).toBe("manager");
    expect((managerView.privateData.masterRoster as any[]).length).toBe(6);

    // 2. Villager NEVER sees other roles or masterRoster
    const villager = playable.find((p) => p.team === "VILLAGE")!;
    const villagerView = DiibCardsEngine.getPlayerView(makeCtx(players, state), villager.playerId);
    expect(villagerView.privateData.masterRoster).toBeUndefined();
    expect(villagerView.privateData.allRoles).toBeUndefined();
    expect(villagerView.privateData.packMembers).toBeUndefined();

    // 3. Wolf sees packMembers
    const wolf = playable.find((p) => p.team === "WOLVES")!;
    const wolfView = DiibCardsEngine.getPlayerView(makeCtx(players, state), wolf.playerId);
    expect(Array.isArray(wolfView.privateData.packMembers)).toBe(true);
    expect((wolfView.privateData.packMembers as string[]).length).toBe(2);
  });

  it("supports One-Phone Deal Relay ending directly on the Manager", () => {
    const players = createPlayers(5); // 1 manager + 4 playable
    let state = DiibCardsEngine.createInitialState(players, DiibCardsEngine.defaultSettings);

    const res = DiibCardsEngine.handleAction(
      makeCtx(players, state, { interactionMode: "ONE_PHONE" }),
      "p_1",
      { type: "CONFIRM_MANAGER", managerId: "p_2" }
    );
    state = res.newState;
    expect(state.dealRelay).toBeDefined();
    expect(state.dealRelay!.queue.length).toBe(5);
    // Manager p_2 MUST be the very last person in the deal queue so the phone stays with the Manager!
    expect(state.dealRelay!.queue[4]).toBe("p_2");

    // Curtain is initially locked — private role hidden
    const firstPlayerId = state.dealRelay!.queue[0];
    const lockedView = DiibCardsEngine.getPlayerView(
      makeCtx(players, state, { interactionMode: "ONE_PHONE" }),
      firstPlayerId
    );
    expect(lockedView.myRole).toBeUndefined();

    // Step through all 5 players (2 taps each: reveal + hide)
    for (let i = 0; i < 5; i++) {
      const curId = state.dealRelay!.queue[state.dealRelay!.currentIndex];
      state = DiibCardsEngine.handleAction(
        makeCtx(players, state, { interactionMode: "ONE_PHONE" }),
        curId,
        { type: "DEAL_RELAY_STEP" }
      ).newState;
      const unlockedView = DiibCardsEngine.getPlayerView(
        makeCtx(players, state, { interactionMode: "ONE_PHONE" }),
        curId
      );
      expect(unlockedView.myRole).toBeDefined();

      state = DiibCardsEngine.handleAction(
        makeCtx(players, state, { interactionMode: "ONE_PHONE" }),
        curId,
        { type: "DEAL_RELAY_STEP" }
      ).newState;
    }

    expect(state.dealRelay).toBeUndefined();
  });

  it("enforces Night rules: Protector shield, no-repeat protection/mute, Witch potions & Wolf Mute speaking skip", () => {
    const players = createPlayers(9); // p_1 manager, 8 playable (wolf, mute_wolf, seer, protector, witch, hunter, 2 villagers)
    let state = DiibCardsEngine.createInitialState(players, DiibCardsEngine.defaultSettings);
    state = DiibCardsEngine.handleAction(makeCtx(players, state), "p_1", {
      type: "CONFIRM_MANAGER",
      managerId: "p_1",
    }).newState;

    state = DiibCardsEngine.handleAction(makeCtx(players, state), "p_1", {
      type: "START_NIGHT",
    }).newState;
    expect(state.phase).toBe("NIGHT");

    const playable = Object.values(state.playerStates).filter((p) => p.role !== "manager");
    const innocentTargets = playable.filter(
      (p) => p.team === "VILLAGE" && p.role !== "hunter" && p.role !== "witch"
    );
    const shieldedVictim = innocentTargets[0].playerId;
    const mutedPerson = innocentTargets[1].playerId;

    // Night 1: Protector shields shieldedVictim, Wolves attack shieldedVictim AND mute mutedPerson
    state = DiibCardsEngine.handleAction(makeCtx(players, state), "p_1", {
      type: "UPDATE_NIGHT_DRAFT",
      draft: {
        protectedId: shieldedVictim,
        wolfTargetId: shieldedVictim,
        mutedTargetId: mutedPerson,
      },
    }).newState;

    const commit1 = DiibCardsEngine.handleAction(makeCtx(players, state), "p_1", {
      type: "COMMIT_NIGHT",
    });
    expect(commit1.success).toBe(true);
    state = commit1.newState;
    expect(state.phase).toBe("DAWN_ANNOUNCEMENT");
    expect(state.lastDawnDeaths.length).toBe(0); // Shield blocked Wolf attack!
    expect(state.mutedPlayerId).toBe(mutedPerson);

    // Start Day 1 Speaking Turns -> Muted player MUST be skipped from speaking!
    const speakRes = DiibCardsEngine.handleAction(makeCtx(players, state), "p_1", {
      type: "START_SPEAKING",
    });
    state = speakRes.newState;
    expect(state.phase).toBe("SPEAKING_TURNS");
    const mutedEntry = state.speakingQueue.find((s) => s.playerId === mutedPerson);
    expect(mutedEntry?.isMuted).toBe(true);
    expect(mutedEntry?.skippedReason).toBe("MUTED");

    // Trying to manually select the muted player to speak MUST be rejected by rules!
    const illegalSpeak = DiibCardsEngine.handleAction(makeCtx(players, state), "p_1", {
      type: "SELECT_SPEAKER",
      targetPlayerId: mutedPerson,
    });
    expect(illegalSpeak.success).toBe(false);

    // Advance to Night 2 via peaceful vote
    state = DiibCardsEngine.handleAction(makeCtx(players, state), "p_1", {
      type: "START_VOTING",
    }).newState;
    state = DiibCardsEngine.handleAction(makeCtx(players, state), "p_1", {
      type: "SKIP_VOTE_NO_ELIMINATION",
    }).newState;
    state = DiibCardsEngine.handleAction(makeCtx(players, state), "p_1", {
      type: "NEXT_NIGHT",
    }).newState;
    expect(state.phase).toBe("NIGHT");
    expect(state.round).toBe(2);
    expect(state.mutedPlayerId).toBeUndefined();

    // Round 2 Rule Check 1: Protector CANNOT protect the exact same person two nights in a row!
    const repeatProtect = DiibCardsEngine.handleAction(makeCtx(players, state), "p_1", {
      type: "UPDATE_NIGHT_DRAFT",
      draft: { protectedId: shieldedVictim },
    });
    expect(repeatProtect.success).toBe(false);

    // Round 2 Rule Check 2: Wolves CANNOT mute the exact same person two nights in a row!
    const repeatMute = DiibCardsEngine.handleAction(makeCtx(players, state), "p_1", {
      type: "UPDATE_NIGHT_DRAFT",
      draft: { mutedTargetId: mutedPerson },
    });
    expect(repeatMute.success).toBe(false);

    // Witch uses Life Potion on Night 2 -> consumes healAvailable permanently!
    state = DiibCardsEngine.handleAction(makeCtx(players, state), "p_1", {
      type: "UPDATE_NIGHT_DRAFT",
      draft: { wolfTargetId: shieldedVictim, witchSave: true },
    }).newState;
    state = DiibCardsEngine.handleAction(makeCtx(players, state), "p_1", {
      type: "COMMIT_NIGHT",
    }).newState;
    expect(state.lastDawnDeaths.length).toBe(0);
    expect(state.witch.healAvailable).toBe(false);
  });

  it("triggers Hunter Revenge Shot automatically on death and handles Tie Runoff + New Manager rotation", async () => {
    const store = new RoomStore();
    const { room } = await store.createRoom(
      "HostPlayer",
      "diib-cards",
      "MULTI_PHONE",
      "darija",
      "tok_host"
    );
    for (let i = 2; i <= 9; i++) {
      await store.joinRoom(room.code, `Friend_${i}`, `tok_${i}`);
    }

    const startRes = await store.startGame(room.code, "tok_host");
    expect(startRes.success).toBe(true);

    let authHost = await store.getAuthorizedState(room.code, "tok_host");
    const allPlayers = authHost!.room.players;
    const friend2 = allPlayers[1];

    // Friend 2 volunteers and becomes Manager
    await store.dispatchAction(room.code, "tok_2", { type: "VOLUNTEER_MANAGER" });
    await store.dispatchAction(room.code, "tok_2", {
      type: "CONFIRM_MANAGER",
      managerId: friend2.id,
    });

    const authManager = await store.getAuthorizedState(room.code, "tok_2");
    expect(authManager?.privateView?.myRole).toBe("manager");
    const roster = authManager?.privateView?.privateData.masterRoster as any[];
    const hunter = roster.find((r) => r.role === "hunter")!;
    const wolves = roster.filter((r) => r.team === "WOLVES");

    // Start Night 1 -> Wolves kill the Hunter -> triggers HUNTER_REACTION!
    await store.dispatchAction(room.code, "tok_2", { type: "START_NIGHT" });
    await store.dispatchAction(room.code, "tok_2", {
      type: "UPDATE_NIGHT_DRAFT",
      draft: { wolfTargetId: hunter.playerId },
    });
    await store.dispatchAction(room.code, "tok_2", { type: "COMMIT_NIGHT" });

    let pub = (await store.getAuthorizedState(room.code, "tok_2"))!.room.gameView!.publicData as any;
    expect(pub.phase).toBe("HUNTER_REACTION");
    expect(pub.pendingHunterId).toBe(hunter.playerId);

    // Hunter shoots Wolf #1!
    await store.dispatchAction(room.code, "tok_2", {
      type: "RESOLVE_HUNTER_SHOT",
      targetPlayerId: wolves[0].playerId,
    });

    pub = (await store.getAuthorizedState(room.code, "tok_2"))!.room.gameView!.publicData as any;
    expect(pub.phase).toBe("DAWN_ANNOUNCEMENT");

    // Move to Day Vote -> eliminate remaining Wolf #2 -> VILLAGE WINS!
    await store.dispatchAction(room.code, "tok_2", { type: "START_SPEAKING" });
    await store.dispatchAction(room.code, "tok_2", { type: "START_VOTING" });
    await store.dispatchAction(room.code, "tok_2", {
      type: "ADJUST_CANDIDATE_TALLY",
      candidateId: wolves[1].playerId,
      delta: 4,
    });
    await store.dispatchAction(room.code, "tok_2", { type: "COMMIT_VOTES" });

    const finishedState = await store.getAuthorizedState(room.code, "tok_2");
    expect(finishedState!.room.status).toBe("FINISHED");
    expect((finishedState!.room.gameView!.publicData as any).phase).toBe("GAME_OVER");
    expect((finishedState!.room.gameView!.publicData as any).winner).toBe("VILLAGE");

    // Start Match #2 with a NEW Manager WITHOUT anyone leaving the room!
    const rematchRes = await store.dispatchAction(room.code, "tok_2", {
      type: "NEW_GAME_NEW_MANAGER",
    });
    expect(rematchRes.success).toBe(true);

    const nextMatchState = await store.getAuthorizedState(room.code, "tok_host");
    expect(nextMatchState!.room.status).toBe("ACTIVE");
    expect(nextMatchState!.room.players.length).toBe(9);
    const nextPub = nextMatchState!.room.gameView!.publicData as any;
    expect(nextPub.phase).toBe("MANAGER_SELECT");
    expect(nextPub.matchNumber).toBe(2);
    expect(nextPub.managerHistory).toContain(friend2.id);

    // Auto-pick fair rotation must pick someone OTHER than Friend 2!
    await store.dispatchAction(room.code, "tok_host", { type: "AUTO_PICK_MANAGER" });
    const rotatedPub = (await store.getAuthorizedState(room.code, "tok_host"))!.room.gameView!
      .publicData as any;
    expect(rotatedPub.phase).toBe("ROLE_REVEAL");
    expect(rotatedPub.managerId).toBeDefined();
    expect(rotatedPub.managerId).not.toBe(friend2.id);
  });
});
