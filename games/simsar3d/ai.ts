import {
  getGroupTileIndices,
  JAIL_BAIL_DH,
  SIMSAR_BOARD_TILES,
} from "./boardData";
import {
  SIMSAR_REACTION_ORDER,
  SIMSAR_TOKEN_ORDER,
  SIMSAR_TOKENS,
  SimsarAction,
  SimsarMiniGameId,
  SimsarPlayer,
  SimsarState,
} from "./types";

export interface BotTycoonPersona {
  nickname: string;
  aggression: number; // 0..1 willingness to buy & bid high
  reserveCash: number; // minimum safety cushion
}

export const MOROCCAN_TYCOON_BOTS: BotTycoonPersona[] = [
  { nickname: "الحاج المعطي 🎩", aggression: 0.78, reserveCash: 160 },
  { nickname: "السمسارة زبيدة 💍", aggression: 0.88, reserveCash: 120 },
  { nickname: "ولد الفشوش 🕶️", aggression: 0.92, reserveCash: 90 },
  { nickname: "المعلّم كبور 🔧", aggression: 0.68, reserveCash: 190 },
];

export function createSimsarBots(
  humanCount: number,
  botCount: number,
  startingCash: number
): SimsarPlayer[] {
  const bots: SimsarPlayer[] = [];
  for (let i = 0; i < botCount; i++) {
    const persona = MOROCCAN_TYCOON_BOTS[i % MOROCCAN_TYCOON_BOTS.length];
    const tokenIdx = (humanCount + i) % SIMSAR_TOKEN_ORDER.length;
    const token = SIMSAR_TOKEN_ORDER[tokenIdx];
    const spec = SIMSAR_TOKENS[token];

    bots.push({
      id: `bot_simsar_${i + 1}`,
      nickname: persona.nickname,
      isBot: true,
      token,
      accentHex: spec.accentCss,
      cash: startingCash,
      netWorth: startingCash,
      position: 0,
      prevPosition: 0,
      moveSeq: 0,
      inJailTurns: 0,
      shields: 0,
      isBankrupt: false,
      rentCollected: 0,
      rentPaid: 0,
      heistStolen: 0,
      auctionsWon: 0,
      miniGamesWon: 0,
      jailVisits: 0,
      lastReactionId: null,
      lastReactionAt: 0,
    });
  }
  return bots;
}

/**
 * Computes a realistic, competitive AI mini-game score so Solo & Bot-Fill mini-games feel alive!
 */
export function generateBotMiniGameScore(
  botId: string,
  gameId: SimsarMiniGameId
): number {
  const idx = Number(botId.replace(/\D+/g, "")) || 1;
  const skill = 0.55 + ((idx * 17) % 35) / 100; // 0.55 .. 0.90

  switch (gameId) {
    case "DIRHAM_RAIN":
      return Math.round(140 + skill * 210 + Math.random() * 90);
    case "TAJINE_SHUFFLE":
      // Each correct round = 100..150 pts (max ~420)
      return Math.round((Math.random() < skill ? 130 : 40) + (Math.random() < skill * 0.9 ? 140 : 0) + (Math.random() < skill * 0.7 ? 150 : 0));
    case "TAXI_METER":
      // Score out of 1000 (1000 = exact 7.00s, minus 1 point per 4ms error)
      return Math.max(250, Math.round(680 + skill * 230 + (Math.random() - 0.5) * 140));
    case "HOT_BUTAGAZ":
      return Math.round(160 + skill * 200 + Math.random() * 80);
  }
}

/**
 * Decides the next single action for whichever Bot needs to act right now (Turn, Auction, or Heist).
 * Returns `{ botId, action }` or `null` if waiting on a human player.
 */
export function chooseNextBotAction(state: SimsarState): {
  botId: string;
  action: SimsarAction;
} | null {
  if (state.phase === "GAME_OVER" || state.phase === "MINIGAME") {
    return null;
  }

  // 1. Live Auction: let eligible bots place a smart bid or pass!
  if (state.phase === "AUCTION" && state.auction) {
    const auc = state.auction;
    const tile = SIMSAR_BOARD_TILES[auc.tileIndex];
    const basePrice = tile?.price || 150;

    for (const pid of state.turnOrder) {
      const p = state.players[pid];
      if (!p || !p.isBot || p.isBankrupt) continue;
      if (auc.highestBidderId === pid) continue;
      if (auc.passedPlayerIds.includes(pid)) continue;

      const personaIdx = (Number(pid.replace(/\D+/g, "")) || 1) - 1;
      const persona = MOROCCAN_TYCOON_BOTS[personaIdx % MOROCCAN_TYCOON_BOTS.length];

      // Value property higher if bot already owns another city in same color group!
      let groupBonus = 1.0;
      if (tile?.group) {
        const siblings = getGroupTileIndices(tile.group);
        if (siblings.some((idx) => state.properties[idx]?.ownerId === pid)) {
          groupBonus = 1.35;
        }
      }

      const maxWillingBid = Math.min(
        p.cash - persona.reserveCash * 0.6,
        Math.round(basePrice * persona.aggression * groupBonus * 1.1)
      );

      if (auc.currentBid + 20 <= maxWillingBid) {
        return {
          botId: pid,
          action: { type: "PLACE_BID", amountDelta: 20 },
        };
      }
      return {
        botId: pid,
        action: { type: "PASS_AUCTION" },
      };
    }
    return null;
  }

  const active = state.players[state.currentPlayerId];
  if (!active || !active.isBot || active.isBankrupt) {
    return null;
  }

  // 2. Bot Heist Turn: pick an unrevealed Tajine lid!
  if (state.phase === "HEIST" && state.heist && state.heist.raiderId === active.id) {
    const available: number[] = [];
    for (let i = 0; i < 9; i++) {
      if (!state.heist.revealedIndices.includes(i)) available.push(i);
    }
    if (available.length > 0) {
      const pick = available[Math.floor(Math.random() * available.length)];
      return {
        botId: active.id,
        action: { type: "PICK_HEIST_BOX", boxIndex: pick },
      };
    }
  }

  // 3. Bot Roll Ready: pay bail if flush with cash in late rounds, otherwise roll dice!
  if (state.phase === "ROLL_READY") {
    if (active.inJailTurns > 0 && active.cash >= 550 && state.round >= 3) {
      return {
        botId: active.id,
        action: { type: "PAY_JAIL_BAIL" },
      };
    }
    const useTurbo = active.cash >= 950 && state.round >= 4 ? 2 : 1;
    return {
      botId: active.id,
      action: { type: "ROLL_DICE", multiplier: useTurbo },
    };
  }

  // 4. Bot Landed Decision: buy unowned property, upgrade owned property, or end turn!
  if (state.phase === "LANDED_DECISION") {
    const personaIdx = (Number(active.id.replace(/\D+/g, "")) || 1) - 1;
    const persona = MOROCCAN_TYCOON_BOTS[personaIdx % MOROCCAN_TYCOON_BOTS.length];

    if (state.pendingTileIndex !== null) {
      const tile = SIMSAR_BOARD_TILES[state.pendingTileIndex];
      const prop = state.properties[state.pendingTileIndex];
      if (tile && prop && !prop.ownerId && tile.price) {
        if (active.cash >= tile.price + persona.reserveCash * 0.45) {
          return {
            botId: active.id,
            action: { type: "BUY_PROPERTY" },
          };
        }
        return {
          botId: active.id,
          action: { type: "START_AUCTION" },
        };
      }
    }

    // Check if bot can smartly upgrade one of its owned cities once this turn!
    if (active.inJailTurns === 0 &&
        (state.upgradedTileIndicesThisTurn?.length ?? Number(Boolean(state.hasUpgradedThisTurn))) === 0) {
      const upgradable = SIMSAR_BOARD_TILES.filter((t) => {
        const pr = state.properties[t.index];
        return (
          t.kind === "CITY" &&
          pr &&
          pr.ownerId === active.id &&
          !pr.isMortgaged &&
          pr.level < 3 &&
          t.upgradeCost &&
          active.cash >= t.upgradeCost + persona.reserveCash
        );
      });
      if (upgradable.length > 0) {
        // Prefer highest-rent city
        upgradable.sort((a, b) => (b.price || 0) - (a.price || 0));
        return {
          botId: active.id,
          action: { type: "UPGRADE_PROPERTY", tileIndex: upgradable[0].index },
        };
      }
    }

    // Occasional hilarious bot reaction before ending turn
    if (Math.random() < 0.18 && Date.now() - active.lastReactionAt > 12_000) {
      const rId =
        SIMSAR_REACTION_ORDER[Math.floor(Math.random() * SIMSAR_REACTION_ORDER.length)];
      return {
        botId: active.id,
        action: { type: "SEND_REACTION", reactionId: rId },
      };
    }

    return {
      botId: active.id,
      action: { type: "END_TURN" },
    };
  }

  void JAIL_BAIL_DH;
  return null;
}
