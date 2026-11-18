import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GameContext } from "@/games/registry";
import { chooseNextBotAction } from "@/games/simsar3d/ai";
import {
  BOARD_TILE_COUNT,
  computePlayerNetWorth,
  computePropertyRent,
  getSimsarUpgradeQuote,
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
  SimsarAction,
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
      // v1 + core world landmarks
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
      "models/hunter.glb",
      "models/cars/suv-luxury.glb",
      "models/cars/race-future.glb",
      // v2 Commercial Skyscrapers & Plaza
      "models/simsar/commercial/skyscraper-a.glb",
      "models/simsar/commercial/skyscraper-b.glb",
      "models/simsar/commercial/skyscraper-c.glb",
      "models/simsar/commercial/skyscraper-d.glb",
      "models/simsar/commercial/plaza-fountain.glb",
      "models/simsar/commercial/lightposts.glb",
      // v2 Suburban Riads & Gardens
      "models/simsar/suburban/villa-d.glb",
      "models/simsar/suburban/villa-g.glb",
      "models/simsar/suburban/villa-k.glb",
      "models/simsar/suburban/villa-n.glb",
      "models/simsar/suburban/villa-r.glb",
      "models/simsar/suburban/villa-t.glb",
      "models/simsar/suburban/tree-large.glb",
      "models/simsar/suburban/planter.glb",
      // v2 Maritime Ships & Animated Treasure Chest
      "models/simsar/maritime/ship-large.glb",
      "models/simsar/maritime/ship-medium.glb",
      "models/simsar/maritime/chest.glb",
      "models/simsar/maritime/tower-small.glb",
      "models/simsar/maritime/cannon.glb",
      // v2 Medina Windmill, Lanterns & Banners
      "models/simsar/medina/windmill.glb",
      "models/simsar/medina/blade.glb",
      "models/simsar/medina/lantern.glb",
      "models/simsar/medina/banner-red.glb",
      "models/simsar/medina/banner-green.glb",
      // v2 3D Props & Skinned Characters
      "models/simsar/props/coin.glb",
      "models/simsar/props/block-coin.glb",
      "models/simsar/props/cloud.glb",
      "models/simsar/props/flag.glb",
      "models/simsar/props/character.glb",
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
      "models/cars/Textures/colormap.png",
      "models/simsar/commercial/Textures/colormap.png",
      "models/simsar/suburban/Textures/colormap.png",
      "models/simsar/maritime/Textures/colormap.png",
      "models/simsar/props/Textures/colormap.png",
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

  it("lets players build once on each city per turn, including before the roll and through doubles", () => {
    const players = makePlayers(2);
    const state = Simsar3DEngine.createInitialState(players, DEFAULT_SIMSAR_SETTINGS);
    state.properties[1].ownerId = "p1";
    state.properties[2].ownerId = "p1";
    const quote = getSimsarUpgradeQuote(1, state.properties, "p1");
    expect(quote).toEqual({ currentRent: 25, nextRent: 70, nextLevel: 1, cost: 70 });
    const action = { type: "UPGRADE_PROPERTY", tileIndex: 1 } as const;
    const upgraded = Simsar3DEngine.handleAction(makeCtx(players, state), "p1", action);
    expect(upgraded.success).toBe(true);
    expect(upgraded.newState.players.p1.cash).toBe(930);
    expect(upgraded.newState.players.p1.netWorth).toBe(1220);

    upgraded.newState.phase = "LANDED_DECISION";
    upgraded.newState.extraRollGranted = true;
    const doubles = Simsar3DEngine.handleAction(makeCtx(players, upgraded.newState), "p1", { type: "END_TURN" });
    expect(doubles.newState.currentPlayerId).toBe("p1");
    expect(doubles.newState.phase).toBe("ROLL_READY");
    expect(Simsar3DEngine.handleAction(makeCtx(players, doubles.newState), "p1", action).success).toBe(false);
    expect(doubles.newState.properties[1].level).toBe(1);
    const secondCity = Simsar3DEngine.handleAction(makeCtx(players, doubles.newState), "p1", {
      type: "UPGRADE_PROPERTY", tileIndex: 2,
    });
    expect(secondCity.success).toBe(true);
    expect(secondCity.newState.properties[2].level).toBe(1);
    expect(secondCity.newState.players.p1.cash).toBe(850);
    secondCity.newState.phase = "LANDED_DECISION";
    const nextTurn = Simsar3DEngine.handleAction(makeCtx(players, secondCity.newState), "p1", { type: "END_TURN" });
    expect(nextTurn.newState.currentPlayerId).toBe("p2");
    expect(nextTurn.newState.upgradedTileIndicesThisTurn).toEqual([]);
  });

  it("records the exact rent transfer and its landing for every room member", () => {
    const players = makePlayers(2);
    const state = Simsar3DEngine.createInitialState(players, DEFAULT_SIMSAR_SETTINGS);
    state.properties[2] = { ownerId: "p2", level: 2, isMortgaged: false };
    state.players.p1.shields = 1;
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const result = Simsar3DEngine.handleAction(makeCtx(players, state), "p1", { type: "ROLL_DICE" });
      const after = result.newState;
      expect(after.players.p1.cash).toBe(905);
      expect(after.players.p2.cash).toBe(1095);
      expect(after.lastRent).toMatchObject({
        payerId: "p1", ownerId: "p2", tileIndex: 2, paidDh: 95, dueDh: 95, shieldUsed: true,
        moveSeq: after.players.p1.moveSeq, rollSeq: after.lastDice?.rollSeq,
      });
      expect(after.recentEvents[0].rent).toEqual(after.lastRent);
      const view = Simsar3DEngine.getPublicView(makeCtx(players, after)).publicData;
      expect(view.lastRent).toEqual(after.lastRent);

      state.players.p1.cash = 45;
      const partial = Simsar3DEngine.handleAction(makeCtx(players, state), "p1", { type: "ROLL_DICE" });
      expect(partial.newState.phase).toBe("GAME_OVER");
      expect(partial.newState.lastRent).toMatchObject({ paidDh: 45, dueDh: 95 });
    } finally {
      random.mockRestore();
    }
  });

  it("lets only the named recipient accept a fresh property swap and applies it once", () => {
    const players = makePlayers(3);
    const state = Simsar3DEngine.createInitialState(players, DEFAULT_SIMSAR_SETTINGS);
    state.properties[1] = { ownerId: "p1", level: 1, isMortgaged: false };
    state.properties[2] = { ownerId: "p2", level: 2, isMortgaged: false };
    const offered = Simsar3DEngine.handleAction(makeCtx(players, state), "p1", {
      type: "OFFER_PROPERTY_DEAL", requestedTileIndex: 2, offeredTileIndex: 1, cashDh: 150,
    }).newState;
    const accept = { type: "ANSWER_PROPERTY_DEAL", offerId: offered.propertyOffers![0].id, accept: true } as const;
    const answer = (next: SimsarState, actor: string) => Simsar3DEngine.handleAction(makeCtx(players, next), actor, accept);
    expect(answer(offered, "p3").success).toBe(false);
    const stale = structuredClone(offered);
    stale.properties[2].level = 3;
    expect(answer(stale, "p2").success).toBe(false);
    const broke = structuredClone(offered);
    broke.players.p1.cash = 149;
    expect(answer(broke, "p2").success).toBe(false);

    const accepted = answer(offered, "p2");
    expect(accepted.success).toBe(true);
    expect(accepted.newState.players.p1.cash).toBe(850);
    expect(accepted.newState.players.p2.cash).toBe(1150);
    expect(accepted.newState.properties[1]).toMatchObject({ ownerId: "p2", level: 1 });
    expect(accepted.newState.properties[2]).toMatchObject({ ownerId: "p1", level: 2 });
    expect(accepted.newState.propertyOffers).toEqual([]);
    expect(answer(accepted.newState, "p2").success).toBe(false);
  });

  it("syncs rent and trade ownership between two independently joined devices", async () => {
    const hostSession = "sess_simsar_multi_host";
    const guestSession = "sess_simsar_multi_guest";
    const { room, hostPlayer } = await roomStore.createRoom("Salma", "simsar3d", "MULTI_PHONE", "darija", hostSession);
    const guest = await roomStore.joinRoom(room.code, "Youssef", guestSession);
    expect(guest.success).toBe(true);
    expect((await roomStore.startGame(room.code, hostSession)).success).toBe(true);
    const dispatch = (session: string, action: SimsarAction, actorId?: string) =>
      roomStore.dispatchAction(room.code, session, action, actorId);
    const view = async (session: string) => {
      const result = await roomStore.getAuthorizedState(room.code, session);
      expect(result?.player).toBeDefined();
      return result!.room.gameView!.publicData as unknown as SimsarState;
    };
    const rollOntoTileFour = async (session: string) => {
      const random = vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.4);
      try {
        expect((await dispatch(session, { type: "ROLL_DICE" })).success).toBe(true);
      } finally {
        random.mockRestore();
      }
    };

    await rollOntoTileFour(hostSession);
    expect((await dispatch(hostSession, { type: "BUY_PROPERTY" })).success).toBe(true);
    expect((await dispatch(hostSession, { type: "UPGRADE_PROPERTY", tileIndex: 4 })).success).toBe(true);
    expect((await dispatch(hostSession, { type: "END_TURN" })).success).toBe(true);
    await rollOntoTileFour(guestSession);

    const hostView = await view(hostSession);
    const guestView = await view(guestSession);
    expect(hostView.lastRent).toMatchObject({
      payerId: guest.player!.id, ownerId: hostPlayer.id, paidDh: 100, tileIndex: 4,
    });
    expect(guestView.lastRent).toEqual(hostView.lastRent);

    expect((await dispatch(guestSession, {
      type: "OFFER_PROPERTY_DEAL", requestedTileIndex: 4, offeredTileIndex: null, cashDh: 225,
    })).success).toBe(true);
    const offerId = (await view(hostSession)).propertyOffers![0].id;
    const answer = { type: "ANSWER_PROPERTY_DEAL", offerId, accept: true } as const;
    expect((await dispatch(hostSession, answer, guest.player!.id)).success).toBe(false);
    expect((await dispatch(hostSession, answer)).success).toBe(true);
    expect((await view(guestSession)).properties[4]).toMatchObject({ ownerId: guest.player!.id, level: 1 });
    expect((await view(hostSession)).propertyOffers).toEqual([]);
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
