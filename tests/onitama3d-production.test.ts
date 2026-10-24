import { describe, expect, it } from "vitest";
import { Onitama3DEngine } from "@/games/onitama3d/engine";
import { GameContext } from "@/games/registry";
import { Player } from "@/lib/types";
import { Onitama3DSettings, Onitama3DState } from "@/games/onitama3d/types";

const mockPlayers: Player[] = [
  {
    id: "p1",
    roomId: "TEST_ONI3D",
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
    roomId: "TEST_ONI3D",
    nickname: "كبور",
    normalizedNickname: "كبور",
    status: "ACTIVE",
    joinedAt: 1001,
    avatarSeed: "2",
    isHost: false,
    deviceSessionId: "d2",
    isOnline: true,
  },
];

function makeCtx(
  state: Onitama3DState
): GameContext<Onitama3DState, Onitama3DSettings> {
  return {
    roomId: "ONI1",
    state,
    players: mockPlayers,
    settings: Onitama3DEngine.defaultSettings,
    phase: state.phase,
    round: state.round,
    stateVersion: 1,
  };
}

describe("Onitama 3D & Royal Chess 3D Engine", () => {
  it("initializes a 5x5 Onitama board with 10 pieces and 5 martial arts cards", () => {
    const state = Onitama3DEngine.createInitialState(
      mockPlayers,
      Onitama3DEngine.defaultSettings
    );
    expect(state.mode).toBe("ONITAMA");
    expect(state.boardSize).toBe(5);
    expect(state.pieces.length).toBe(10);
    expect(state.goldCards.length).toBe(2);
    expect(state.crimsonCards.length).toBe(2);
    expect(typeof state.sideCard).toBe("string");
  });

  it("rotates the used card with the center spare card after an Onitama move and detects Way of the Stone", () => {
    let state = Onitama3DEngine.createInitialState(
      mockPlayers,
      Onitama3DEngine.defaultSettings
    );
    state.turn = "GOLD";
    state.goldCards = ["tiger", "crab"];
    state.crimsonCards = ["dragon", "frog"];
    state.sideCard = "rabbit";

    // GOLD uses "tiger" ([-2, 0]) to leap their Master from (4,2) to (2,2)
    const res1 = Onitama3DEngine.handleAction(makeCtx(state), "p1", {
      type: "MAKE_MOVE",
      pieceId: "gold_2",
      toR: 2,
      toC: 2,
      cardId: "tiger",
    });
    expect(res1.success).toBe(true);
    state = res1.newState!;

    // Verify card rotation: "tiger" is now sideCard, and "rabbit" is in GOLD's hand!
    expect(state.sideCard).toBe("tiger");
    expect(state.goldCards).toContain("rabbit");
    expect(state.turn).toBe("CRIMSON");

    // Now test Way of the Stone: place GOLD Master at (2,2) and let GOLD capture CRIMSON Master at (0,2) using "tiger"
    state.turn = "GOLD";
    state.goldCards = ["tiger", "crab"];
    const resWin = Onitama3DEngine.handleAction(makeCtx(state), "p1", {
      type: "MAKE_MOVE",
      pieceId: "gold_2",
      toR: 0,
      toC: 2,
      cardId: "tiger",
    });
    expect(resWin.success).toBe(true);
    expect(resWin.newState!.phase).toBe("GAME_OVER");
    expect(resWin.newState!.winnerSide).toBe("GOLD");
  });

  it("supports switching to 8x8 Royal Chess 3D mode, legal moves, and AI moves", () => {
    let state = Onitama3DEngine.createInitialState(
      mockPlayers,
      Onitama3DEngine.defaultSettings
    );

    // Switch to CHESS 8x8 mode
    state = Onitama3DEngine.handleAction(makeCtx(state), "p1", {
      type: "SWITCH_MODE",
      mode: "CHESS",
    }).newState!;

    expect(state.mode).toBe("CHESS");
    expect(state.boardSize).toBe(8);
    expect(state.pieces.length).toBe(32);

    // Move GOLD pawn e2 -> e4 (from r=6, c=4 to r=4, c=4)
    const moveRes = Onitama3DEngine.handleAction(makeCtx(state), "p1", {
      type: "MAKE_MOVE",
      pieceId: "gold_pawn_4",
      toR: 4,
      toC: 4,
    });
    expect(moveRes.success).toBe(true);
    state = moveRes.newState!;
    expect(state.turn).toBe("CRIMSON");

    // Let AI play CRIMSON's response
    const aiRes = Onitama3DEngine.handleAction(makeCtx(state), "p1", {
      type: "AI_STEP",
    });
    expect(aiRes.success).toBe(true);
    expect(aiRes.newState!.turn).toBe("GOLD");
  });

  it("assigns distinct GOLD and CRIMSON perspectives to 2 phones and aligns right/left card moves", () => {
    const state = Onitama3DEngine.createInitialState(
      mockPlayers,
      Onitama3DEngine.defaultSettings
    );
    const ctx = makeCtx(state);

    const p1View = Onitama3DEngine.getPlayerView(ctx, "p1");
    const p2View = Onitama3DEngine.getPlayerView(ctx, "p2");
    expect(p1View.privateData.mySide).toBe("GOLD");
    expect(p2View.privateData.mySide).toBe("CRIMSON");

    // Swap seats and verify both phones flip sides
    const swapped = Onitama3DEngine.handleAction(ctx, "p1", {
      type: "SWAP_SEATS",
    }).newState!;
    const swappedCtx = makeCtx(swapped);
    expect(Onitama3DEngine.getPlayerView(swappedCtx, "p1").privateData.mySide).toBe("CRIMSON");
    expect(Onitama3DEngine.getPlayerView(swappedCtx, "p2").privateData.mySide).toBe("GOLD");
  });
});
