import { describe, it, expect } from "vitest";
import { KhiyalEngine } from "@/games/khiyal/engine";
import { getCardImageUrl, KHIYAL_CARDS } from "@/games/khiyal/cards";
import { Player } from "@/lib/types";
import { KhiyalSettings, KhiyalState } from "@/games/khiyal/types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p_${i + 1}`,
    roomId: "ROOM_TEST",
    nickname: `Player ${i + 1}`,
    normalizedNickname: `player ${i + 1}`,
    status: "ACTIVE",
    joinedAt: Date.now() + i * 10,
    avatarSeed: `avatar_${i + 1}`,
    isHost: i === 0,
    deviceSessionId: `session_${i + 1}`,
    isOnline: true,
  }));
}

function makeContext(players: Player[], settings?: Partial<KhiyalSettings>) {
  const mergedSettings: KhiyalSettings = {
    ...KhiyalEngine.defaultSettings,
    ...settings,
  };
  const state = KhiyalEngine.createInitialState(players, mergedSettings);
  return {
    roomId: "ROOM_TEST",
    players,
    state,
    settings: mergedSettings,
    round: 1,
    phase: state.phase,
    stateVersion: 1,
  };
}

describe("Khiyal (Dixit) Game Engine", () => {
  it("validates setup constraints (3 to 12 players)", () => {
    const p2 = makePlayers(2);
    expect(KhiyalEngine.validateSetup(p2, KhiyalEngine.defaultSettings).isValid).toBe(false);

    const p3 = makePlayers(3);
    expect(KhiyalEngine.validateSetup(p3, KhiyalEngine.defaultSettings).isValid).toBe(true);

    const p12 = makePlayers(12);
    expect(KhiyalEngine.validateSetup(p12, KhiyalEngine.defaultSettings).isValid).toBe(true);

    const p13 = makePlayers(13);
    expect(KhiyalEngine.validateSetup(p13, KhiyalEngine.defaultSettings).isValid).toBe(false);
  });

  it("deals 6 cards to each player on setup", () => {
    const players = makePlayers(5);
    const ctx = makeContext(players);

    for (const p of players) {
      expect(ctx.state.playerHands[p.id]).toHaveLength(6);
    }
    expect(ctx.state.storytellerId).toBe("p_1");
    expect(ctx.state.phase).toBe("STORYTELLER_CLUE");
  });

  it("handles balanced clue: Storyteller gets 3, correct guessers get 3, decoy bonus +1", () => {
    const players = makePlayers(4);
    const ctx = makeContext(players);

    // 1. Storyteller (p_1) submits clue and card
    const stCard = ctx.state.playerHands["p_1"][0];
    const resClue = KhiyalEngine.handleAction(ctx, "p_1", {
      type: "SUBMIT_CLUE",
      cardId: stCard,
      clue: "شاي فالغروب",
    });
    expect(resClue.success).toBe(true);
    expect(resClue.newPhase).toBe("PLAYER_SUBMISSIONS");
    ctx.state = resClue.newState;

    // 2. Non-storytellers submit 1 card each (4 players)
    const p2Card = ctx.state.playerHands["p_2"][0];
    const p3Card = ctx.state.playerHands["p_3"][0];
    const p4Card = ctx.state.playerHands["p_4"][0];

    const r2 = KhiyalEngine.handleAction(ctx, "p_2", { type: "SUBMIT_CARDS", cardIds: [p2Card] });
    ctx.state = r2.newState;
    expect(ctx.state.phase).toBe("PLAYER_SUBMISSIONS");

    const r3 = KhiyalEngine.handleAction(ctx, "p_3", { type: "SUBMIT_CARDS", cardIds: [p3Card] });
    ctx.state = r3.newState;
    expect(ctx.state.phase).toBe("PLAYER_SUBMISSIONS");

    // p_4 submits -> advances to VOTING
    const r4 = KhiyalEngine.handleAction(ctx, "p_4", { type: "SUBMIT_CARDS", cardIds: [p4Card] });
    ctx.state = r4.newState;
    expect(ctx.state.phase).toBe("VOTING");
    expect(ctx.state.tableCards).toHaveLength(4);

    // 3. Voting
    // Non-storytellers cannot vote for their own cards:
    const badVote = KhiyalEngine.handleAction(ctx, "p_2", { type: "CAST_VOTE", cardId: p2Card });
    expect(badVote.success).toBe(false);

    // Balanced votes:
    // p_2 votes for Storyteller card (stCard) -> CORRECT!
    // p_3 votes for Storyteller card (stCard) -> CORRECT!
    // p_4 votes for p_2's decoy card (p2Card) -> TRICKED by p_2!
    const v2 = KhiyalEngine.handleAction(ctx, "p_2", { type: "CAST_VOTE", cardId: stCard });
    ctx.state = v2.newState;
    const v3 = KhiyalEngine.handleAction(ctx, "p_3", { type: "CAST_VOTE", cardId: stCard });
    ctx.state = v3.newState;
    const v4 = KhiyalEngine.handleAction(ctx, "p_4", { type: "CAST_VOTE", cardId: p2Card });
    ctx.state = v4.newState;

    // All votes submitted -> Automatically resolved to ROUND_RESOLUTION!
    expect(ctx.state.phase).toBe("ROUND_RESOLUTION");
    expect(ctx.state.lastRoundResult?.caseType).toBe("BALANCED");

    // Scores breakdown:
    // p_1 (Storyteller): 3 points (balanced clue)
    // p_2: 3 points (correct guess) + 1 point (decoy bonus from p_4) = 4 points
    // p_3: 3 points (correct guess) = 3 points
    // p_4: 0 points
    expect(ctx.state.scores["p_1"]).toBe(3);
    expect(ctx.state.scores["p_2"]).toBe(4);
    expect(ctx.state.scores["p_3"]).toBe(3);
    expect(ctx.state.scores["p_4"]).toBe(0);
  });

  it("handles ALL_CORRECT: Storyteller gets 0, all others get 2", () => {
    const players = makePlayers(4);
    const ctx = makeContext(players);

    const stCard = ctx.state.playerHands["p_1"][0];
    ctx.state = KhiyalEngine.handleAction(ctx, "p_1", {
      type: "SUBMIT_CLUE",
      cardId: stCard,
      clue: "واضحة بزاف",
    }).newState;

    ctx.state = KhiyalEngine.handleAction(ctx, "p_2", {
      type: "SUBMIT_CARDS",
      cardIds: [ctx.state.playerHands["p_2"][0]],
    }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_3", {
      type: "SUBMIT_CARDS",
      cardIds: [ctx.state.playerHands["p_3"][0]],
    }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_4", {
      type: "SUBMIT_CARDS",
      cardIds: [ctx.state.playerHands["p_4"][0]],
    }).newState;

    expect(ctx.state.phase).toBe("VOTING");

    // All 3 non-storytellers vote for Storyteller's card!
    ctx.state = KhiyalEngine.handleAction(ctx, "p_2", { type: "CAST_VOTE", cardId: stCard }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_3", { type: "CAST_VOTE", cardId: stCard }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_4", { type: "CAST_VOTE", cardId: stCard }).newState;

    expect(ctx.state.phase).toBe("ROUND_RESOLUTION");
    expect(ctx.state.lastRoundResult?.caseType).toBe("ALL_CORRECT");

    // Storyteller: 0, others: 2 each
    expect(ctx.state.scores["p_1"]).toBe(0);
    expect(ctx.state.scores["p_2"]).toBe(2);
    expect(ctx.state.scores["p_3"]).toBe(2);
    expect(ctx.state.scores["p_4"]).toBe(2);
  });

  it("handles NONE_CORRECT: Storyteller gets 0, all others get 2 (+ decoy bonuses)", () => {
    const players = makePlayers(4);
    const ctx = makeContext(players);

    const stCard = ctx.state.playerHands["p_1"][0];
    ctx.state = KhiyalEngine.handleAction(ctx, "p_1", {
      type: "SUBMIT_CLUE",
      cardId: stCard,
      clue: "لغز غامض مستحيل",
    }).newState;

    const p2Card = ctx.state.playerHands["p_2"][0];
    const p3Card = ctx.state.playerHands["p_3"][0];
    const p4Card = ctx.state.playerHands["p_4"][0];

    ctx.state = KhiyalEngine.handleAction(ctx, "p_2", { type: "SUBMIT_CARDS", cardIds: [p2Card] }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_3", { type: "SUBMIT_CARDS", cardIds: [p3Card] }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_4", { type: "SUBMIT_CARDS", cardIds: [p4Card] }).newState;

    // Nobody votes for Storyteller card!
    // p_2 votes for p_3's card
    // p_3 votes for p_4's card
    // p_4 votes for p_2's card
    ctx.state = KhiyalEngine.handleAction(ctx, "p_2", { type: "CAST_VOTE", cardId: p3Card }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_3", { type: "CAST_VOTE", cardId: p4Card }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_4", { type: "CAST_VOTE", cardId: p2Card }).newState;

    expect(ctx.state.phase).toBe("ROUND_RESOLUTION");
    expect(ctx.state.lastRoundResult?.caseType).toBe("NONE_CORRECT");

    // Storyteller gets 0
    expect(ctx.state.scores["p_1"]).toBe(0);
    // Everyone else gets base 2 points + 1 decoy bonus each = 3 points each!
    expect(ctx.state.scores["p_2"]).toBe(3);
    expect(ctx.state.scores["p_3"]).toBe(3);
    expect(ctx.state.scores["p_4"]).toBe(3);
  });

  it("handles 3-player mode requiring 2 decoy cards per player", () => {
    const players = makePlayers(3);
    const ctx = makeContext(players);

    const stCard = ctx.state.playerHands["p_1"][0];
    ctx.state = KhiyalEngine.handleAction(ctx, "p_1", {
      type: "SUBMIT_CLUE",
      cardId: stCard,
      clue: "ثلاثة د الناس",
    }).newState;

    // In 3-player mode, submitting 1 card should fail
    const p2Hand = ctx.state.playerHands["p_2"];
    const fail1 = KhiyalEngine.handleAction(ctx, "p_2", { type: "SUBMIT_CARDS", cardIds: [p2Hand[0]] });
    expect(fail1.success).toBe(false);

    // Submitting 2 cards succeeds
    const ok2 = KhiyalEngine.handleAction(ctx, "p_2", {
      type: "SUBMIT_CARDS",
      cardIds: [p2Hand[0], p2Hand[1]],
    });
    expect(ok2.success).toBe(true);
    ctx.state = ok2.newState;

    const p3Hand = ctx.state.playerHands["p_3"];
    const ok3 = KhiyalEngine.handleAction(ctx, "p_3", {
      type: "SUBMIT_CARDS",
      cardIds: [p3Hand[0], p3Hand[1]],
    });
    expect(ok3.success).toBe(true);
    ctx.state = ok3.newState;

    // Total table cards = 1 (storyteller) + 2 (p2) + 2 (p3) = 5 cards!
    expect(ctx.state.phase).toBe("VOTING");
    expect(ctx.state.tableCards).toHaveLength(5);
  });

  it("advances rounds, rotates storyteller, and replenishes hands", () => {
    const players = makePlayers(4);
    const ctx = makeContext(players);

    const stCard = ctx.state.playerHands["p_1"][0];
    ctx.state = KhiyalEngine.handleAction(ctx, "p_1", {
      type: "SUBMIT_CLUE",
      cardId: stCard,
      clue: "الجولة الأولى",
    }).newState;

    ctx.state = KhiyalEngine.handleAction(ctx, "p_2", {
      type: "SUBMIT_CARDS",
      cardIds: [ctx.state.playerHands["p_2"][0]],
    }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_3", {
      type: "SUBMIT_CARDS",
      cardIds: [ctx.state.playerHands["p_3"][0]],
    }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_4", {
      type: "SUBMIT_CARDS",
      cardIds: [ctx.state.playerHands["p_4"][0]],
    }).newState;

    ctx.state = KhiyalEngine.handleAction(ctx, "p_2", { type: "CAST_VOTE", cardId: stCard }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_3", { type: "CAST_VOTE", cardId: stCard }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_4", { type: "CAST_VOTE", cardId: stCard }).newState;

    expect(ctx.state.phase).toBe("ROUND_RESOLUTION");

    // Advance to next round
    const nextRoundRes = KhiyalEngine.handleAction(ctx, "p_1", { type: "NEXT_ROUND" });
    expect(nextRoundRes.success).toBe(true);
    expect(nextRoundRes.newPhase).toBe("STORYTELLER_CLUE");
    expect(nextRoundRes.newState.round).toBe(2);
    // Storyteller rotated to p_2!
    expect(nextRoundRes.newState.storytellerId).toBe("p_2");

    // All hands replenished back to 6 cards!
    for (const p of players) {
      expect(nextRoundRes.newState.playerHands[p.id]).toHaveLength(6);
    }
  });

  it("triggers GAME_OVER when a player reaches the target score", () => {
    const players = makePlayers(4);
    // Set targetScore = 5 for fast test
    const ctx = makeContext(players, { targetScore: 5 });

    // Seed p_2 with 4 points already
    ctx.state.scores["p_2"] = 4;

    const stCard = ctx.state.playerHands["p_1"][0];
    ctx.state = KhiyalEngine.handleAction(ctx, "p_1", {
      type: "SUBMIT_CLUE",
      cardId: stCard,
      clue: "قريب يسالي الماتش",
    }).newState;

    const p2Card = ctx.state.playerHands["p_2"][0];
    ctx.state = KhiyalEngine.handleAction(ctx, "p_2", { type: "SUBMIT_CARDS", cardIds: [p2Card] }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_3", {
      type: "SUBMIT_CARDS",
      cardIds: [ctx.state.playerHands["p_3"][0]],
    }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_4", {
      type: "SUBMIT_CARDS",
      cardIds: [ctx.state.playerHands["p_4"][0]],
    }).newState;

    // p_2 gets 3 points for guessing stCard -> total 4 + 3 = 7 >= 5
    ctx.state = KhiyalEngine.handleAction(ctx, "p_2", { type: "CAST_VOTE", cardId: stCard }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_3", { type: "CAST_VOTE", cardId: p2Card }).newState;
    ctx.state = KhiyalEngine.handleAction(ctx, "p_4", { type: "CAST_VOTE", cardId: p2Card }).newState;

    expect(ctx.state.phase).toBe("GAME_OVER");
    expect(ctx.state.winner).toBe("p_2");

    const finished = KhiyalEngine.checkFinished(ctx);
    expect(finished?.isFinished).toBe(true);
    expect(finished?.winner?.players).toContain("p_2");
  });

  it("maps every Khiyal card to a valid artwork URL from public/cards/khiyal", () => {
    expect(KHIYAL_CARDS.length).toBeGreaterThanOrEqual(30);
    for (const card of KHIYAL_CARDS) {
      const url = getCardImageUrl(card.id);
      expect(url).toBeDefined();
      expect(url).toMatch(/^\/cards\/khiyal\/khiyal_\d+\.jpg$/);
    }
  });

  it("ensures authentic Moroccan Darija terminology (مول الحجاية) is used without الحكواتي", () => {
    const players = makePlayers(4);
    const ctx = makeContext(players);

    // Non-storyteller trying to submit clue
    const illegalClue = KhiyalEngine.handleAction(ctx, "p_2", {
      type: "SUBMIT_CLUE",
      cardId: "khiyal_01",
      clue: "test",
    });
    expect(illegalClue.success).toBe(false);
    expect(illegalClue.error).toContain("مول الحجاية");
    expect(illegalClue.error).not.toContain("الحكواتي");
  });
});

