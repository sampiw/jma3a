import { describe, it, expect } from "vitest";
import { MawjaEngine } from "@/games/mawja/engine";
import { Player } from "@/lib/types";
import { GameContext } from "@/games/registry";
import { MawjaState, MawjaSettings } from "@/games/mawja/types";

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
  {
    id: "p4",
    roomId: "TEST_ROOM",
    nickname: "نبيل",
    normalizedNickname: "نبيل",
    status: "ACTIVE",
    joinedAt: 4,
    avatarSeed: "4",
    isHost: false,
    deviceSessionId: "dev_4",
    isOnline: true,
  },
];

function makeCtx(state: MawjaState, settings = MawjaEngine.defaultSettings): GameContext<MawjaState, MawjaSettings> {
  return {
    roomId: "JM-9999",
    players: mockPlayers,
    settings,
    state,
    round: state.round,
    phase: state.phase,
    stateVersion: 1,
  };
}

describe("Mawja (موجة) Multi-Phone Engine", () => {
  it("validates setup and initializes round 1 with secret target isolated to transmitter", () => {
    const val = MawjaEngine.validateSetup(mockPlayers, MawjaEngine.defaultSettings);
    expect(val.isValid).toBe(true);

    const state = MawjaEngine.createInitialState(mockPlayers, MawjaEngine.defaultSettings);
    expect(state.phase).toBe("TRANSMITTER_SELECT");
    expect(state.round).toBe(1);
    expect(state.candidateSpectrums.length).toBe(3);
    expect(state.targetValue).toBeGreaterThanOrEqual(6);
    expect(state.targetValue).toBeLessThanOrEqual(94);

    const ctx = makeCtx(state);

    // Verify secret isolation in public view
    const pubView = MawjaEngine.getPublicView(ctx);
    expect(pubView.publicData.targetValue).toBeUndefined();

    const transmitterId = state.transmitterId;
    const receiverId = mockPlayers.find((p) => p.id !== transmitterId)!.id;

    // Transmitter sees secretTargetValue
    const transPrivate = MawjaEngine.getPlayerView(ctx, transmitterId);
    expect(transPrivate.privateData.isTransmitter).toBe(true);
    expect(transPrivate.privateData.secretTargetValue).toBe(state.targetValue);

    // Receiver does NOT see secretTargetValue before ROUND_REVEAL
    const recPrivate = MawjaEngine.getPlayerView(ctx, receiverId);
    expect(recPrivate.privateData.isTransmitter).toBe(false);
    expect(recPrivate.privateData.secretTargetValue).toBeUndefined();
  });

  it("enforces anti-cheat rules on clues and supports custom spectrums", () => {
    const state = MawjaEngine.createInitialState(mockPlayers, MawjaEngine.defaultSettings);
    const ctx = makeCtx(state);
    const transmitterId = state.transmitterId;
    const receiverId = mockPlayers.find((p) => p.id !== transmitterId)!.id;

    // Non-transmitter cannot transmit clue
    const badActor = MawjaEngine.handleAction(ctx, receiverId, {
      type: "SUBMIT_CLUE",
      clue: "أتاشي",
      spectrumId: state.candidateSpectrums[0].id,
    });
    expect(badActor.success).toBe(false);
    expect(badActor.error).toBeDefined();

    // Digits or percentages in clue are blocked
    const numericClue = MawjaEngine.handleAction(ctx, transmitterId, {
      type: "SUBMIT_CLUE",
      clue: "شي 75 فالمية",
      spectrumId: state.candidateSpectrums[0].id,
    });
    expect(numericClue.success).toBe(false);
    expect(numericClue.error).toBeDefined();

    // Custom spectrum + valid clue transitions to RECEIVERS_TUNE
    const customTransmit = MawjaEngine.handleAction(ctx, transmitterId, {
      type: "SUBMIT_CLUE",
      clue: "قهوة نص نص فالصيف",
      customLeft: "بارد بزاف",
      customRight: "سخون بزاف",
    });
    expect(customTransmit.success).toBe(true);
    expect(customTransmit.newState.phase).toBe("RECEIVERS_TUNE");
    expect(customTransmit.newState.currentSpectrum.leftLabel).toBe("بارد بزاف");
    expect(customTransmit.newState.currentClue).toBe("قهوة نص نص فالصيف");
  });

  it("calculates Bullseye, Inner, Outer, Double-Down, Side-Bet, and Transmitter points accurately", () => {
    let state = MawjaEngine.createInitialState(mockPlayers, MawjaEngine.defaultSettings);
    // Force deterministic targetValue = 70 and transmitter = p1
    state = {
      ...state,
      transmitterId: "p1",
      targetValue: 70,
    };

    // p1 transmits clue
    state = MawjaEngine.handleAction(makeCtx(state), "p1", {
      type: "SUBMIT_CLUE",
      clue: "طاجين بالبرقوق",
      spectrumId: state.candidateSpectrums[0].id,
    }).newState;

    // p2 guesses 72 (diff 2 -> BULLSEYE = 4 pts) + Double-Down (4 + 4 = 8 pts)
    const r1 = MawjaEngine.handleAction(makeCtx(state), "p2", {
      type: "LOCK_GUESS",
      value: 72,
      doubleDown: true,
      predictedBestPlayerId: "p3",
    });
    expect(r1.success).toBe(true);
    state = r1.newState;
    expect(state.phase).toBe("RECEIVERS_TUNE");

    // p3 guesses 60 (diff 10 -> INNER = 3 pts) + Side-bet on p2 (who is closest -> +1 pt = 4 pts)
    const r2 = MawjaEngine.handleAction(makeCtx(state), "p3", {
      type: "LOCK_GUESS",
      value: 60,
      doubleDown: false,
      predictedBestPlayerId: "p2",
    });
    expect(r2.success).toBe(true);
    state = r2.newState;

    // p4 guesses 20 (diff 50 -> MISS = 0 pts) + Double-Down (miss penalty = -1 pt, score clamped to 0)
    const r3 = MawjaEngine.handleAction(makeCtx(state), "p4", {
      type: "LOCK_GUESS",
      value: 20,
      doubleDown: true,
    });
    expect(r3.success).toBe(true);
    state = r3.newState;

    // All 3 receivers locked in -> auto-transitions to ROUND_REVEAL
    expect(state.phase).toBe("ROUND_REVEAL");
    expect(state.lastRoundResult).toBeDefined();

    // Check scores:
    // p2: 4 base + 4 doubleDown + 0 sideBet = 8
    expect(state.scores["p2"]).toBe(8);
    // p3: 3 base + 0 doubleDown + 1 sideBet (bet on p2 who had diff 2) = 4
    expect(state.scores["p3"]).toBe(4);
    // p4: 0 base - 1 doubleDown = -1 -> clamped at 0
    expect(state.scores["p4"]).toBe(0);
    // p1 (Transmitter): 2 receivers scored (p2, p3) = 2 pts + 2 jackpot (p2 hit BULLSEYE) = 4 pts
    expect(state.scores["p1"]).toBe(4);

    // Check Double-Down chips decremented for p2 and p4
    expect(state.doubleDownChipsLeft["p2"]).toBe(1);
    expect(state.doubleDownChipsLeft["p3"]).toBe(2);
    expect(state.doubleDownChipsLeft["p4"]).toBe(1);
  });
});
