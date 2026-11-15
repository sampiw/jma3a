import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GameContext } from "@/games/registry";
import { chooseNextBotAction } from "@/games/simsar3d/ai";
import {
  BOARD_TILE_COUNT,
  computePlayerNetWorth,
  computePropertyRent,
  getTileWorldTransform,
  HAMZA_CARDS,
  ownsFullColorSet,
  SIMSAR_BOARD_TILES,
} from "@/games/simsar3d/boardData";
import {
  computeSimsarAwards,
  DEFAULT_SIMSAR_SETTINGS,
  Simsar3DEngine,
  sortSimsarStandings,
} from "@/games/simsar3d/engine";
import {
  SIMSAR_TOKEN_ORDER,
  SIMSAR_TOKENS,
  SimsarSettings,
  SimsarState,
} from "@/games/simsar3d/types";
import { roomStore } from "@/lib/rooms/store";
import { Player } from "@/lib/types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    roomId: "JM-SIMS",
    nickname: `Tycoon_${i + 1}`,
    normalizedNickname: `tycoon_${i + 1}`,
    status: "ACTIVE",
    joinedAt: Date.now(),
    avatarSeed: `avatar_${(i % 8) + 1}`,
    isHost: i === 0,
    deviceSessionId: `sess_simsar_${i + 1}`,
    isOnline: true,
  }));
}

function makeCtx(
  players: Player[],
  state: SimsarState,
  settings: SimsarSettings = DEFAULT_SIMSAR_SETTINGS
): GameContext<SimsarState, SimsarSettings> {
  return {
    roomId: "JM-SIMS",
    players,
    state,
    settings,
    round: state.round,
    phase: state.phase,
    stateVersion: 1,
  };
}

describe("SIMSAR ROYALE 3D — Production 3D Board, GLB Assets, Auctions, Heist, Mini-Games & RoomStore", () => {
  it("verifies all 6 Moroccan 3D vehicle tokens, 3D building/landmark GLBs, and textures exist with valid binary headers", () => {
    expect(SIMSAR_TOKEN_ORDER.length).toBe(6);

    for (const tid of SIMSAR_TOKEN_ORDER) {
      const spec = SIMSAR_TOKENS[tid];
      const diskPath = path.join(process.cwd(), "public", spec.glbPath);
      expect(fs.existsSync(diskPath)).toBe(true);
      const magic = fs.readFileSync(diskPath).subarray(0, 4).toString("ascii");
      expect(magic).toBe("glTF");
    }

    const requiredWorldGlbs = [
      "models/ksida/fantasy/fountain.glb",
      "models/ksida/palm-bend.glb",
      "models/ksida/palm-straight.glb",
      "models/ksida/fantasy/arch-top.glb",
      "models/ksida/watch-tower.glb",
      "models/food/tajine.glb",
      "models/food/watermelon.glb",
      "models/ksida/rocks-a.glb",
      "models/ksida/fantasy/stall-green.glb",
      "models/ksida/fantasy/stall-red.glb",
      "models/ksida/city/building-a.glb",
      "models/ksida/city/building-c.glb",
      "models/ksida/city/building-f.glb",
      "models/ksida/city/building-j.glb",
    ];
    for (const rel of requiredWorldGlbs) {
      const full = path.join(process.cwd(), "public", rel);
      expect(fs.existsSync(full)).toBe(true);
      expect(fs.readFileSync(full).subarray(0, 4).toString("ascii")).toBe("glTF");
    }

    const requiredTextures = [
      "textures/shooter/waternormals.jpg",
      "textures/shooter/brick_diffuse.jpg",
      "textures/shooter/brick_bump.jpg",
    ];
    for (const texRel of requiredTextures) {
      expect(fs.existsSync(path.join(process.cwd(), "public", texRel))).toBe(true);
    }
  });

  it("enforces Smart Bot Policy: Solo spawns 3 Moroccan Tycoon Bots; 2+ humans play pure PvP unless botFill=true", () => {
    const soloPlayers = makePlayers(1);
    const soloState = Simsar3DEngine.createInitialState(soloPlayers, DEFAULT_SIMSAR_SETTINGS);
    expect(soloState.turnOrder.length).toBe(4);
    const soloBots = Object.values(soloState.players).filter((p) => p.isBot);
    expect(soloBots.length).toBe(3);

    const duoPlayers = makePlayers(2);
    const pvpState = Simsar3DEngine.createInitialState(duoPlayers, DEFAULT_SIMSAR_SETTINGS);
    expect(pvpState.turnOrder.length).toBe(2);
    expect(Object.values(pvpState.players).every((p) => !p.isBot)).toBe(true);

    const filledState = Simsar3DEngine.createInitialState(duoPlayers, {
      ...DEFAULT_SIMSAR_SETTINGS,
      botFill: true,
    });
    expect(filledState.turnOrder.length).toBe(4);

    const sixPlayers = makePlayers(6);
    const fullTable = Simsar3DEngine.createInitialState(sixPlayers, {
      ...DEFAULT_SIMSAR_SETTINGS,
      botFill: true,
      mode: "EMPIRE",
    });
    expect(fullTable.turnOrder.length).toBe(6);
    expect(fullTable.maxRounds).toBe(15);
    expect(fullTable.empireTargetDh).toBe(6000);
  });

  it("validates 24-tile perimeter geometry, Hamza cards, full color-set monopoly x2 rent, and net worth", () => {
    expect(SIMSAR_BOARD_TILES.length).toBe(BOARD_TILE_COUNT);
    expect(HAMZA_CARDS.length).toBeGreaterThanOrEqual(10);

    // Corners at 0, 6, 12, 18
    expect(getTileWorldTransform(0).isCorner).toBe(true);
    expect(getTileWorldTransform(6).isCorner).toBe(true);
    expect(getTileWorldTransform(12).isCorner).toBe(true);
    expect(getTileWorldTransform(18).isCorner).toBe(true);
    expect(getTileWorldTransform(3).isCorner).toBe(false);

    const players = makePlayers(2);
    const state = Simsar3DEngine.createInitialState(players, DEFAULT_SIMSAR_SETTINGS);

    // Tiles 1 (Asilah), 2 (Chefchaouen), and 19 (Ifrane) form CHEFCHAOUEN_BLUE
    state.properties[1].ownerId = "p1";
    state.properties[2].ownerId = "p1";
    expect(ownsFullColorSet("p1", "CHEFCHAOUEN_BLUE", state.properties)).toBe(false);
    const singleRent = computePropertyRent(1, state.properties, 7);
    expect(singleRent).toBe(SIMSAR_BOARD_TILES[1].rents![0]);

    state.properties[19].ownerId = "p1";
    expect(ownsFullColorSet("p1", "CHEFCHAOUEN_BLUE", state.properties)).toBe(true);
    const monopolyRent = computePropertyRent(1, state.properties, 7);
    expect(monopolyRent).toBe(SIMSAR_BOARD_TILES[1].rents![0] * 2);

    const nw = computePlayerNetWorth(state.players.p1, state.properties);
    expect(nw).toBe(
      state.players.p1.cash +
        (SIMSAR_BOARD_TILES[1].price || 0) +
        (SIMSAR_BOARD_TILES[2].price || 0) +
        (SIMSAR_BOARD_TILES[19].price || 0)
    );
  });

  it("handles ROLL_DICE, BUY_PROPERTY, UPGRADE_PROPERTY, MORTGAGE/UNMORTGAGE, and END_TURN cleanly", () => {
    const players = makePlayers(2);
    let state = Simsar3DEngine.createInitialState(players, DEFAULT_SIMSAR_SETTINGS);

    // Roll dice for p1
    const r1 = Simsar3DEngine.handleAction(makeCtx(players, state), "p1", {
      type: "ROLL_DICE",
      multiplier: 2,
    });
    expect(r1.success).toBe(true);
    state = r1.newState;
    expect(state.lastDice).not.toBeNull();
    expect(state.lastDice?.multiplier).toBe(2);

    // Simulate landing on unowned Chefchaouen (tile 2) in LANDED_DECISION
    state.phase = "LANDED_DECISION";
    state.players.p1.position = 2;
    state.pendingTileIndex = 2;
    state.properties[2] = { ownerId: null, level: 0, isMortgaged: false };
    state.players.p1.cash = 1000;

    const buyRes = Simsar3DEngine.handleAction(makeCtx(players, state), "p1", {
      type: "BUY_PROPERTY",
    });
    expect(buyRes.success).toBe(true);
    state = buyRes.newState;
    expect(state.properties[2].ownerId).toBe("p1");
    expect(state.pendingTileIndex).toBeNull();
    expect(state.players.p1.cash).toBe(1000 - (SIMSAR_BOARD_TILES[2].price || 0));

    // Upgrade Chefchaouen to Level 1 (Café ☕)
    const upgRes = Simsar3DEngine.handleAction(makeCtx(players, state), "p1", {
      type: "UPGRADE_PROPERTY",
      tileIndex: 2,
    });
    expect(upgRes.success).toBe(true);
    state = upgRes.newState;
    expect(state.properties[2].level).toBe(1);

    // Mortgage & Unmortgage
    const mortRes = Simsar3DEngine.handleAction(makeCtx(players, state), "p1", {
      type: "MORTGAGE_PROPERTY",
      tileIndex: 2,
    });
    expect(mortRes.success).toBe(true);
    state = mortRes.newState;
    expect(state.properties[2].isMortgaged).toBe(true);
    expect(state.properties[2].level).toBe(0);

    const unmortRes = Simsar3DEngine.handleAction(makeCtx(players, state), "p1", {
      type: "UNMORTGAGE_PROPERTY",
      tileIndex: 2,
    });
    expect(unmortRes.success).toBe(true);
    state = unmortRes.newState;
    expect(state.properties[2].isMortgaged).toBe(false);

    // Clear any extraRollGranted and end p1's turn -> p2's turn!
    state.extraRollGranted = false;
    const endRes = Simsar3DEngine.handleAction(makeCtx(players, state), "p1", {
      type: "END_TURN",
    });
    expect(endRes.success).toBe(true);
    expect(endRes.newState.currentPlayerId).toBe("p2");
    expect(endRes.newState.phase).toBe("ROLL_READY");
  });

  it("executes Live Room Auctions (START_AUCTION -> PLACE_BID -> PASS_AUCTION) and awards city to highest bidder", () => {
    const players = makePlayers(2);
    let state = Simsar3DEngine.createInitialState(players, DEFAULT_SIMSAR_SETTINGS);
    state.phase = "LANDED_DECISION";
    state.pendingTileIndex = 4; // السويقة

    const startRes = Simsar3DEngine.handleAction(makeCtx(players, state), "p1", {
      type: "START_AUCTION",
    });
    expect(startRes.success).toBe(true);
    state = startRes.newState;
    expect(state.phase).toBe("AUCTION");
    expect(state.auction).not.toBeNull();

    // p2 bids +50 DH
    const bidRes = Simsar3DEngine.handleAction(makeCtx(players, state), "p2", {
      type: "PLACE_BID",
      amountDelta: 50,
    });
    expect(bidRes.success).toBe(true);
    state = bidRes.newState;
    const winningBid = state.auction!.currentBid;
    expect(state.auction?.highestBidderId).toBe("p2");

    // p1 passes -> auction finalizes immediately!
    const passRes = Simsar3DEngine.handleAction(makeCtx(players, state), "p1", {
      type: "PASS_AUCTION",
    });
    expect(passRes.success).toBe(true);
    state = passRes.newState;
    expect(state.phase).toBe("LANDED_DECISION");
    expect(state.auction).toBeNull();
    expect(state.properties[4].ownerId).toBe("p2");
    expect(state.players.p2.cash).toBe(1000 - winningBid);
    expect(state.players.p2.auctionsWon).toBe(1);
  });

  it("masks unrevealed 9-Tajine Bank Heist boxes in getPublicView, resolves loot & Shield protection", () => {
    const players = makePlayers(2);
    let state = Simsar3DEngine.createInitialState(players, DEFAULT_SIMSAR_SETTINGS);
    state.phase = "HEIST";
    state.players.p2.cash = 900;
    state.players.p2.shields = 1; // Shield reduces theft by 65%!
    state.heist = {
      raiderId: "p1",
      victimId: "p2",
      boxes: [
        "DIAMOND",
        "DIAMOND",
        "DIAMOND",
        "GOLD",
        "GOLD",
        "GOLD",
        "SILVER",
        "SILVER",
        "SILVER",
      ],
      revealedIndices: [],
      resolvedTier: null,
      stolenAmount: 0,
      shieldBlocked: false,
    };

    // Public view must mask unrevealed boxes!
    const pubBefore = Simsar3DEngine.getPublicView(makeCtx(players, state));
    const pubHeistBefore = (pubBefore.publicData as any).heist;
    expect(pubHeistBefore.boxes[0]).toBe("SILVER"); // masked!

    // Reveal 3 DIAMOND Tajines (indices 0, 1, 2)
    for (const boxIndex of [0, 1, 2]) {
      const pickRes = Simsar3DEngine.handleAction(makeCtx(players, state), "p1", {
        type: "PICK_HEIST_BOX",
        boxIndex,
      });
      expect(pickRes.success).toBe(true);
      state = pickRes.newState;
    }

    expect(state.heist?.resolvedTier).toBe("DIAMOND");
    expect(state.heist?.shieldBlocked).toBe(true);
    expect(state.players.p2.shields).toBe(0);
    // Base 280 * 0.35 = 98 DH
    expect(state.heist?.stolenAmount).toBe(Math.round(280 * 0.35));
    expect(state.phase).toBe("LANDED_DECISION");
  });

  it("triggers End-of-Round 20s Simultaneous Mini-Game, pays +300/+175/+75 DH, runs BOT_STEP, and computes Roast Awards", async () => {
    const players = makePlayers(2);
    let state = Simsar3DEngine.createInitialState(players, DEFAULT_SIMSAR_SETTINGS);

    // Advance from p2 (last player in round 1) -> triggers MINIGAME!
    state.currentTurnIndex = 1;
    state.currentPlayerId = "p2";
    state.phase = "LANDED_DECISION";

    const endRoundRes = Simsar3DEngine.handleAction(makeCtx(players, state), "p2", {
      type: "END_TURN",
    });
    expect(endRoundRes.success).toBe(true);
    state = endRoundRes.newState;
    expect(state.phase).toBe("MINIGAME");
    expect(state.miniGame).not.toBeNull();

    // p1 scores 420, p2 scores 260 -> auto-finalizes when all alive players submit!
    state = Simsar3DEngine.handleAction(makeCtx(players, state), "p1", {
      type: "SUBMIT_MINIGAME_SCORE",
      score: 420,
    }).newState;
    state = Simsar3DEngine.handleAction(makeCtx(players, state), "p2", {
      type: "SUBMIT_MINIGAME_SCORE",
      score: 260,
    }).newState;

    expect(state.phase).toBe("ROLL_READY");
    expect(state.round).toBe(2);
    expect(state.players.p1.cash).toBe(1300); // +300 DH 1st place!
    expect(state.players.p2.cash).toBe(1175); // +175 DH 2nd place!

    // Verify Bot AI & BOT_STEP in Solo mode
    const soloPlayers = makePlayers(1);
    let soloState = Simsar3DEngine.createInitialState(soloPlayers, DEFAULT_SIMSAR_SETTINGS);
    soloState.currentTurnIndex = 1;
    soloState.currentPlayerId = soloState.turnOrder[1]; // bot_simsar_1
    expect(chooseNextBotAction(soloState)).not.toBeNull();

    const botStep1 = Simsar3DEngine.handleAction(makeCtx(soloPlayers, soloState), "p1", {
      type: "BOT_STEP",
    });
    expect(botStep1.success).toBe(true);
    expect(botStep1.newState.lastDice).not.toBeNull();

    const awards = computeSimsarAwards(state.players);
    expect(awards.length).toBeGreaterThanOrEqual(3);
    expect(sortSimsarStandings(Object.values(state.players))[0].id).toBe("p1");

    // Verify full RoomStore lifecycle + Hot-Join into an active Simsar Royale 3D room!
    const created = await roomStore.createRoom(
      "الحاج السمسار",
      "simsar3d",
      "MULTI_PHONE",
      "darija",
      "sess_host_simsar",
      "avatar_1"
    );
    expect(created.room.selectedGameId).toBe("simsar3d");

    const started = await roomStore.startGame(created.room.code, "sess_host_simsar");
    expect(started.success).toBe(true);

    const hotJoin = await roomStore.joinRoom(
      created.room.code,
      "السمسار الثاني",
      "sess_guest_simsar",
      "avatar_2"
    );
    expect(hotJoin.success).toBe(true);
  });
});
