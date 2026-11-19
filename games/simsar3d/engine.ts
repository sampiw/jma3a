import {
  GameContext,
  GameDefinition,
  GameEndResult,
  TransitionResult,
  ValidationResult,
} from "@/games/registry";
import { Player, PrivatePlayerGameView, PublicGameView } from "@/lib/types";
import {
  chooseNextBotAction,
  createSimsarBots,
  generateBotMiniGameScore,
} from "./ai";
import {
  BOARD_TILE_COUNT,
  BUILDING_TIER_NAMES_AR,
  computePlayerNetWorth,
  computePropertyRent,
  createInitialPropertiesState,
  getSimsarUpgradeQuote,
  hasSimsarUpgradedTileThisTurn,
  HAMZA_CARDS,
  INITIAL_GARDIENNAGE_POT_DH,
  isSimsarPropertyPhase,
  JAIL_BAIL_DH,
  LAND_ON_START_BONUS_DH,
  PASS_START_SALARY_DH,
  SIMSAR_BOARD_TILES,
} from "./boardData";
import {
  SIMSAR_REACTIONS,
  SIMSAR_TOKEN_ORDER,
  SIMSAR_TOKENS,
  SimsarAction,
  SimsarAwardBadge,
  SimsarEventBanner,
  SimsarHeistSymbol,
  SimsarMiniGameId,
  SimsarMode,
  SimsarPlayer,
  SimsarPropertyOffer,
  SimsarPropertyState,
  SimsarRentReceipt,
  SimsarSettings,
  SimsarState,
} from "./types";

import { applyMoul, startMoul, receipt, updateWealth } from "./moulEngine";

export const AUCTION_DURATION_MS = 10_000;
export const MINIGAME_DURATION_MS = 22_000;

export const DEFAULT_SIMSAR_SETTINGS: SimsarSettings = {
  mode: "BLITZ",
  botFill: false,
  maxRounds: 10,
  startingCash: 1000,
  empireTargetDh: 4200,
};

const MINIGAME_ROTATION: SimsarMiniGameId[] = [
  "DIRHAM_RAIN",
  "TAJINE_SHUFFLE",
  "TAXI_METER",
  "HOT_BUTAGAZ",
];

function cloneState(s: SimsarState): SimsarState {
  return JSON.parse(JSON.stringify(s)) as SimsarState;
}

function pushBanner(
  state: SimsarState,
  emoji: string,
  titleAr: string,
  subtitleAr: string,
  tone: SimsarEventBanner["tone"] = "GOLD",
  rent?: SimsarRentReceipt
) {
  const ev: SimsarEventBanner = {
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    emoji,
    titleAr,
    subtitleAr,
    tone,
    createdAt: Date.now(),
    ...(rent && { rent }),
  };
  state.recentEvents = [ev, ...state.recentEvents.slice(0, 5)];
}

function refreshAllNetWorths(state: SimsarState) {
  for (const p of Object.values(state.players)) {
    p.netWorth = computePlayerNetWorth(p, state.properties);
  }
}

export function sortSimsarStandings(players: SimsarPlayer[]): SimsarPlayer[] {
  return [...players].sort((a, b) => {
    if (a.isBankrupt !== b.isBankrupt) return a.isBankrupt ? 1 : -1;
    if (b.netWorth !== a.netWorth) return b.netWorth - a.netWorth;
    return b.cash - a.cash;
  });
}

export function computeSimsarAwards(
  playersMap: Record<string, SimsarPlayer>
): SimsarAwardBadge[] {
  const list = Object.values(playersMap);
  if (list.length === 0) return [];

  const awards: SimsarAwardBadge[] = [];
  const byWealth = sortSimsarStandings(list)[0];
  if (byWealth) {
    awards.push({
      id: "award_emperor",
      emoji: "👑",
      titleAr: "إمبراطور العقار الأول",
      subtitleAr: "شرا المغرب كامل وبنى القهاوي والأوطيلات!",
      winnerId: byWealth.id,
      winnerName: byWealth.nickname,
      statLabel: `${byWealth.netWorth} DH ثروة`,
    });
  }

  const byRent = [...list].sort((a, b) => b.rentCollected - a.rentCollected)[0];
  if (byRent) {
    awards.push({
      id: "award_landlord",
      emoji: "🧛",
      titleAr: "مول الكرا القاصح",
      subtitleAr: "ما كيرحمش فـ راس الشهر ولو بدرهم!",
      winnerId: byRent.id,
      winnerName: byRent.nickname,
      statLabel: `${byRent.rentCollected} DH كرا مجموع`,
    });
  }

  const byHeist = [...list].sort((a, b) => b.heistStolen - a.heistStolen)[0];
  if (byHeist && byHeist.heistStolen > 0) {
    awards.push({
      id: "award_heist",
      emoji: "🥷",
      titleAr: "شفّار الطواجن الذهبية",
      subtitleAr: "خوّا الصناديق ديال صحابو بالعلالي!",
      winnerId: byHeist.id,
      winnerName: byHeist.nickname,
      statLabel: `${byHeist.heistStolen} DH مسروقة`,
    });
  } else {
    const byMini = [...list].sort((a, b) => b.miniGamesWon - a.miniGamesWon)[0];
    if (byMini) {
      awards.push({
        id: "award_minigame",
        emoji: "⚡",
        titleAr: "بطل التحديات السريعة",
        subtitleAr: "خفّة يد رهيبة فـ ألعاب الدرب!",
        winnerId: byMini.id,
        winnerName: byMini.nickname,
        statLabel: `${byMini.miniGamesWon} فوز بالتحديات`,
      });
    }
  }

  const byVictim = [...list].sort(
    (a, b) => b.rentPaid + b.jailVisits * 80 - (a.rentPaid + a.jailVisits * 80)
  )[0];
  if (byVictim) {
    awards.push({
      id: "award_victim",
      emoji: "🚓",
      titleAr: "زبون الكرا والفوريان",
      subtitleAr: "الميزانية كاملة مشات فالكرا والرادارات!",
      winnerId: byVictim.id,
      winnerName: byVictim.nickname,
      statLabel: `${byVictim.rentPaid} DH كرا مدفوع`,
    });
  }

  return awards;
}

/**
 * Deducts `amount` from `payer`, automatically mortgaging/selling building levels if cash < amount!
 * Returns the actual cash transferred (and marks bankrupt if even total liquidation wasn't enough).
 */
function chargePlayerWithAutoRescue(
  state: SimsarState,
  payer: SimsarPlayer,
  amount: number,
  creditor: SimsarPlayer | "POT"
): number {
  let remaining = Math.max(0, Math.round(amount));
  if (remaining === 0) return 0;

  // Auto-liquidate lowest-value properties/upgrades if short on cash!
  while (payer.cash < remaining) {
    // 1. Try mortgaging an unimproved owned property first
    const unimprovedIdx = Object.entries(state.properties)
      .filter(
        ([, pr]) => pr.ownerId === payer.id && !pr.isMortgaged && pr.level === 0
      )
      .map(([k]) => Number(k))
      .sort(
        (a, b) =>
          (SIMSAR_BOARD_TILES[a]?.price || 0) - (SIMSAR_BOARD_TILES[b]?.price || 0)
      )[0];

    if (unimprovedIdx !== undefined) {
      const t = SIMSAR_BOARD_TILES[unimprovedIdx];
      state.properties[unimprovedIdx].isMortgaged = true;
      payer.cash += Math.round((t.price || 100) * 0.5);
      continue;
    }

    // 2. Sell 1 building tier at 50% upgrade value
    const builtIdx = Object.entries(state.properties)
      .filter(([, pr]) => pr.ownerId === payer.id && pr.level > 0)
      .map(([k]) => Number(k))[0];

    if (builtIdx !== undefined) {
      const t = SIMSAR_BOARD_TILES[builtIdx];
      state.properties[builtIdx].level = (state.properties[builtIdx].level - 1) as
        | 0
        | 1
        | 2
        | 3;
      payer.cash += Math.round((t.upgradeCost || 80) * 0.5);
      continue;
    }

    break;
  }

  const paid = Math.min(payer.cash, remaining);
  payer.cash -= paid;

  if (creditor === "POT") {
    state.gardiennagePot += paid;
  } else {
    creditor.cash += paid;
    creditor.rentCollected += paid;
  }

  if (paid < remaining) {
    // Bankrupt! Transfer remaining properties to creditor (or back to bank if POT)
    payer.cash = 0;
    payer.isBankrupt = true;
    for (const [idxStr, pr] of Object.entries(state.properties)) {
      if (pr.ownerId === payer.id) {
        if (creditor === "POT") {
          state.properties[Number(idxStr)] = {
            ownerId: null,
            level: 0,
            isMortgaged: false,
          };
        } else {
          pr.ownerId = creditor.id;
        }
      }
    }
    pushBanner(
      state,
      "💀",
      `إفلاس ${payer.nickname}! مشى الحانوت!`,
      creditor === "POT"
        ? "العقارات رجعو للسوق الحر!"
        : `${creditor.nickname} ورث كاع العقارات ديالو!`,
      "ROSE"
    );
  }

  return paid;
}

function checkAndFinalizeMatchIfWon(state: SimsarState): boolean {
  refreshAllNetWorths(state);
  const alive = Object.values(state.players).filter((p) => !p.isBankrupt);

  // 1. Last standing tycoon
  if (alive.length <= 1 && Object.keys(state.players).length > 1) {
    const winner = alive[0] || Object.values(state.players)[0];
    state.phase = "GAME_OVER";
    state.winnerId = winner.id;
    state.winnerSummaryAr = `👑 ${winner.nickname} فلّس كاع المنافسين وسيطر على العقار!`;
    state.awards = computeSimsarAwards(state.players);
    return true;
  }

  // 2. Hit Empire Net-Worth Target!
  const targetWinner = sortSimsarStandings(alive).find(
    (p) => p.netWorth >= state.empireTargetDh
  );
  if (targetWinner) {
    state.phase = "GAME_OVER";
    state.winnerId = targetWinner.id;
    state.winnerSummaryAr = `🏆 ${targetWinner.nickname} وصل لثروة ${targetWinner.netWorth} DH وبنى الإمبراطورية!`;
    state.awards = computeSimsarAwards(state.players);
    return true;
  }

  return false;
}

function buildShuffledHeistBoxes(): SimsarHeistSymbol[] {
  const pool: SimsarHeistSymbol[] = [
    "SILVER",
    "SILVER",
    "SILVER",
    "GOLD",
    "GOLD",
    "GOLD",
    "DIAMOND",
    "DIAMOND",
    "DIAMOND",
  ];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/**
 * Resolves the effect of `player` landing on `state.players[player.id].position`.
 */
function resolveTileArrival(
  state: SimsarState,
  player: SimsarPlayer,
  diceTotal: number,
  multiplier: 1 | 2
) {
  const tile = SIMSAR_BOARD_TILES[player.position];
  if (!tile) {
    state.phase = "LANDED_DECISION";
    return;
  }

  switch (tile.kind) {
    case "START": {
      const bonus = LAND_ON_START_BONUS_DH * multiplier;
      player.cash += bonus;
      pushBanner(
        state,
        "💰",
        `${player.nickname} نزل فوق المانضا!`,
        `ربح بونيس الانطلاق +${bonus} DH كاش!`,
        "EMERALD"
      );
      state.phase = "LANDED_DECISION";
      break;
    }

    case "JAIL": {
      pushBanner(
        state,
        "👀",
        `${player.nickname} دايز من قدام الفوريان`,
        "زيارة خفيفة بلا مخالفة!",
        "CYAN"
      );
      state.phase = "LANDED_DECISION";
      break;
    }

    case "JACKPOT": {
      const pot = Math.max(80, state.gardiennagePot);
      player.cash += pot;
      state.gardiennagePot = INITIAL_GARDIENNAGE_POT_DH;
      pushBanner(
        state,
        "🦺",
        `جاكبوت باركينغ الگارديناج!`,
        `${player.nickname} جمع الحصالة كاملة: +${pot} DH!`,
        "GOLD"
      );
      state.phase = "LANDED_DECISION";
      break;
    }

    case "RADAR_TO_JAIL": {
      const fine = 75;
      chargePlayerWithAutoRescue(state, player, fine, "POT");
      player.prevPosition = player.position;
      player.position = 6; // JAIL corner
      player.moveSeq += 1;
      player.inJailTurns = 2;
      player.jailVisits += 1;
      state.extraRollGranted = false;
      pushBanner(
        state,
        "🚓",
        `فلاش رادار 180 كلم/س على ${player.nickname}!`,
        `مشى للفوريان + ${fine} DH لحصالة الگارديناج!`,
        "ROSE"
      );
      state.phase = "LANDED_DECISION";
      break;
    }

    case "TAX": {
      const tax = 120 * multiplier;
      chargePlayerWithAutoRescue(state, player, tax, "POT");
      pushBanner(
        state,
        "📝",
        `مول الكارني والضريبة شد ${player.nickname}!`,
        `خلص ${tax} DH مشات لباركينغ الگارديناج!`,
        "ROSE"
      );
      state.phase = "LANDED_DECISION";
      break;
    }

    case "HEIST": {
      // Pick the richest non-bankrupt rival!
      const rivals = Object.values(state.players)
        .filter((r) => r.id !== player.id && !r.isBankrupt && r.cash > 20)
        .sort((a, b) => b.cash - a.cash);

      if (rivals.length === 0) {
        player.cash += 150 * multiplier;
        pushBanner(
          state,
          "🥷",
          `سطو السمسار: الخزنة خاوية!`,
          `${player.nickname} لقى +${150 * multiplier} DH فـ الصندوق السري!`,
          "GOLD"
        );
        state.phase = "LANDED_DECISION";
      } else {
        const victim = rivals[0];
        state.heist = {
          raiderId: player.id,
          victimId: victim.id,
          boxes: buildShuffledHeistBoxes(),
          revealedIndices: [],
          resolvedTier: null,
          stolenAmount: 0,
          shieldBlocked: false,
        };
        state.phase = "HEIST";
        pushBanner(
          state,
          "🥷",
          `سطو خطير! ${player.nickname} يستهدف خزنة ${victim.nickname}!`,
          "إقلب الطواجن باش تكتاشف الغنيمة!",
          "PURPLE"
        );
      }
      break;
    }

    case "HAMZA": {
      const card = HAMZA_CARDS[Math.floor(Math.random() * HAMZA_CARDS.length)];
      if (card.kind === "GAIN_CASH") {
        const gain = (card.amount || 180) * multiplier;
        player.cash += gain;
        pushBanner(state, card.emoji, card.titleAr, `${player.nickname}: +${gain} DH!`, "EMERALD");
        state.phase = "LANDED_DECISION";
      } else if (card.kind === "PAY_POT") {
        const amt = card.amount || 100;
        chargePlayerWithAutoRescue(state, player, amt, "POT");
        pushBanner(state, card.emoji, card.titleAr, `${player.nickname} دفع ${amt} DH للگارديناج!`, "ROSE");
        state.phase = "LANDED_DECISION";
      } else if (card.kind === "COLLECT_FROM_ALL") {
        const perPlayer = card.amount || 45;
        let collected = 0;
        for (const other of Object.values(state.players)) {
          if (other.id === player.id || other.isBankrupt) continue;
          const paid = chargePlayerWithAutoRescue(state, other, perPlayer, player);
          collected += paid;
        }
        pushBanner(
          state,
          card.emoji,
          card.titleAr,
          `${player.nickname} جمع +${collected} DH من عند الجماعة!`,
          "GOLD"
        );
        state.phase = "LANDED_DECISION";
      } else if (card.kind === "GAIN_SHIELD") {
        player.shields = Math.min(2, player.shields + 1);
        pushBanner(
          state,
          "🛡️",
          card.titleAr,
          `${player.nickname} ولا عندو درع حماية (${player.shields}/2)!`,
          "CYAN"
        );
        state.phase = "LANDED_DECISION";
      } else if (card.kind === "FREE_UPGRADE") {
        const myCities = SIMSAR_BOARD_TILES.filter((t) => {
          const pr = state.properties[t.index];
          return t.kind === "CITY" && pr && pr.ownerId === player.id && !pr.isMortgaged && pr.level < 3;
        });
        if (myCities.length > 0) {
          const pick = myCities[Math.floor(Math.random() * myCities.length)];
          const pr = state.properties[pick.index];
          pr.level = (pr.level + 1) as 0 | 1 | 2 | 3;
          pushBanner(
            state,
            "🏗️",
            `رخصة بني مجانية لـ ${player.nickname}!`,
            `${pick.shortAr} طلعات لـ ${BUILDING_TIER_NAMES_AR[pr.level]}!`,
            "EMERALD"
          );
        } else {
          player.cash += 160;
          pushBanner(
            state,
            "🏗️",
            card.titleAr,
            `${player.nickname} خذا تعويض +160 DH كاش!`,
            "EMERALD"
          );
        }
        state.phase = "LANDED_DECISION";
      } else if (card.kind === "TELEPORT_TILE" && card.targetTile !== undefined) {
        const oldPos = player.position;
        const tgt = card.targetTile;
        if (tgt < oldPos && tgt !== 0) {
          player.cash += PASS_START_SALARY_DH;
        }
        player.prevPosition = oldPos;
        player.position = tgt;
        player.moveSeq += 1;
        pushBanner(state, card.emoji, card.titleAr, card.descAr, "PURPLE");
        resolveTileArrival(state, player, diceTotal, 1);
      } else {
        state.phase = "LANDED_DECISION";
      }
      break;
    }

    case "CITY":
    case "UTILITY": {
      const prop: SimsarPropertyState | undefined = state.properties[tile.index];
      if (!prop || !prop.ownerId) {
        state.pendingTileIndex = tile.index;
        state.phase = "LANDED_DECISION";
      } else if (prop.ownerId === player.id) {
        state.pendingTileIndex = null;
        state.phase = "LANDED_DECISION";
      } else if (prop.isMortgaged) {
        pushBanner(
          state,
          "🔒",
          `${tile.shortAr} مرهونة فالبنك!`,
          `${player.nickname} ما خلّص حتى درهم كرا!`,
          "CYAN"
        );
        state.phase = "LANDED_DECISION";
      } else {
        const owner = state.players[prop.ownerId];
        if (!owner || owner.isBankrupt) {
          state.phase = "LANDED_DECISION";
          break;
        }
        const fullRent = computePropertyRent(tile.index, state.properties, diceTotal);
        const shieldUsed = player.shields > 0 && fullRent >= 90;
        if (shieldUsed) player.shields -= 1;
        const dueDh = shieldUsed ? Math.round(fullRent * 0.5) : fullRent;
        const paid = chargePlayerWithAutoRescue(state, player, dueDh, owner);
        player.rentPaid += paid;
        const rollSeq = state.lastDice?.rollSeq ?? 0;
        const receipt: SimsarRentReceipt = {
          id: `${state.updatedAt}:${rollSeq}:${player.id}:${player.moveSeq}`,
          createdAt: state.updatedAt,
          rollSeq,
          moveSeq: player.moveSeq,
          tileIndex: tile.index,
          payerId: player.id,
          ownerId: owner.id,
          paidDh: paid,
          dueDh,
          shieldUsed,
        };
        state.lastRent = receipt;
        pushBanner(
          state,
          "💸",
          `${player.nickname} خلّص ${paid} DH كرا فـ ${tile.shortAr}!`,
          `مشات لجيب ${owner.nickname}${shieldUsed ? " · 🛡️ الدرع نقص الكرا النص" : ""}`,
          "ROSE",
          receipt
        );
        state.phase = "LANDED_DECISION";
      }
      break;
    }
  }

  checkAndFinalizeMatchIfWon(state);
}

/**
 * Advances to the next alive player's turn, or launches the 20s All-Players Mini-Game at round end!
 */
function advanceTurnOrStartMiniGame(state: SimsarState) {
  if (checkAndFinalizeMatchIfWon(state)) return;

  state.pendingTileIndex = null;
  state.auction = null;
  state.heist = null;
  const current = state.players[state.currentPlayerId];
  if (state.extraRollGranted && current && !current.isBankrupt && current.inJailTurns === 0) {
    state.extraRollGranted = false;
    state.phase = "ROLL_READY";
    pushBanner(
      state,
      "🎲",
      `ضوبل (Doubles) لـ ${current.nickname}!`,
      "عندك رمية إضافية دابا!",
      "CYAN"
    );
    return;
  }
  state.upgradedTileIndicesThisTurn = [];
  state.extraRollGranted = false;

  const totalOrder = state.turnOrder.length;
  let nextIdx = state.currentTurnIndex + 1;
  let wrappedRound = false;

  for (let step = 0; step < totalOrder; step++) {
    const candidateIdx = (state.currentTurnIndex + 1 + step) % totalOrder;
    if (state.currentTurnIndex + 1 + step >= totalOrder) {
      wrappedRound = true;
    }
    const pid = state.turnOrder[candidateIdx];
    const p = state.players[pid];
    if (p && !p.isBankrupt) {
      nextIdx = candidateIdx;
      break;
    }
  }

  state.currentTurnIndex = nextIdx;
  state.currentPlayerId = state.turnOrder[nextIdx];

  if (wrappedRound) {
    // Check if final round just finished!
    if (state.round >= state.maxRounds) {
      refreshAllNetWorths(state);
      const standings = sortSimsarStandings(Object.values(state.players));
      const champ = standings[0];
      state.phase = "GAME_OVER";
      state.winnerId = champ?.id || null;
      state.winnerSummaryAr = champ
        ? `🏆 سالات ${state.maxRounds} دورات! ${champ.nickname} ربح اللقب بثروة ${champ.netWorth} DH!`
        : "سالات المباراة!";
      state.awards = computeSimsarAwards(state.players);
      return;
    }

    // Launch Simultaneous 20-Second Mario-Party Mini-Game!
    const mgId = MINIGAME_ROTATION[(state.round - 1) % MINIGAME_ROTATION.length];
    const now = Date.now();
    const botScores: Record<string, number> = {};
    const submittedIds: string[] = [];

    for (const p of Object.values(state.players)) {
      if (p.isBot && !p.isBankrupt) {
        botScores[p.id] = generateBotMiniGameScore(p.id, mgId);
        submittedIds.push(p.id);
      }
    }

    state.miniGame = {
      id: mgId,
      roundNumber: state.round,
      seed: Math.floor(Math.random() * 100_000),
      startedAt: now,
      endsAt: now + MINIGAME_DURATION_MS,
      scores: botScores,
      submittedIds,
      resolved: false,
    };
    state.phase = "MINIGAME";
    pushBanner(
      state,
      "⚡",
      `نهاية الدورة ${state.round} — وقت التحدي الجماعي!`,
      "الكل يلعب فـ 20 ثانية باش يربح +300 DH كاش!",
      "PURPLE"
    );
    return;
  }

  state.phase = "ROLL_READY";
}

function finalizeMiniGamePayouts(state: SimsarState) {
  const mg = state.miniGame;
  if (!mg || mg.resolved) {
    state.miniGame = null;
    state.phase = "ROLL_READY";
    return;
  }

  const alive = Object.values(state.players).filter((p) => !p.isBankrupt);
  const ranked = alive
    .map((p) => ({
      playerId: p.id,
      nickname: p.nickname,
      score: mg.scores[p.id] ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  const rewardTable = [300, 175, 75];
  const rankings = ranked.map((entry, idx) => {
    const rewardDh = idx < rewardTable.length && entry.score > 0 ? rewardTable[idx] : 25;
    const pl = state.players[entry.playerId];
    if (pl) {
      pl.cash += rewardDh;
      if (idx === 0 && entry.score > 0) pl.miniGamesWon += 1;
    }
    return { ...entry, rewardDh };
  });

  mg.resolved = true;
  mg.rankings = rankings;

  const champ = rankings[0];
  if (champ) {
    pushBanner(
      state,
      "🏅",
      `${champ.nickname} ربح التحدي الجماعي (+${champ.rewardDh} DH)!`,
      `بدينا الدورة ${state.round + 1} من ${state.maxRounds}!`,
      "EMERALD"
    );
  }

  state.round += 1;
  state.propertyOffers = getOpenPropertyOffers(state);
  state.miniGame = null;
  state.phase = "ROLL_READY";
  checkAndFinalizeMatchIfWon(state);
}

function finalizeAuction(state: SimsarState) {
  const auc = state.auction;
  if (!auc) {
    state.phase = "LANDED_DECISION";
    return;
  }
  const tile = SIMSAR_BOARD_TILES[auc.tileIndex];
  const prop = state.properties[auc.tileIndex];

  if (auc.highestBidderId && prop && tile) {
    const winner = state.players[auc.highestBidderId];
    if (winner && winner.cash >= auc.currentBid) {
      winner.cash -= auc.currentBid;
      winner.auctionsWon += 1;
      prop.ownerId = winner.id;
      prop.level = 0;
      prop.isMortgaged = false;
      pushBanner(
        state,
        "🔨",
        `الدلالة رسات على ${winner.nickname}!`,
        `شرا ${tile.shortAr} بالمزاد غير بـ ${auc.currentBid} DH!`,
        "GOLD"
      );
    }
  } else if (tile) {
    pushBanner(
      state,
      "🔨",
      `ما زايد حتى واحد فـ ${tile.shortAr}!`,
      "بقات الأرض فابور فالسوق!",
      "CYAN"
    );
  }

  state.auction = null;
  state.pendingTileIndex = null;
  state.phase = "LANDED_DECISION";
  refreshAllNetWorths(state);
}

type PropertyOfferAction = Extract<SimsarAction, {
  type: "OFFER_PROPERTY_DEAL" | "ANSWER_PROPERTY_DEAL" | "CANCEL_PROPERTY_DEAL";
}>;

function getOpenPropertyOffers(state: SimsarState): SimsarPropertyOffer[] {
  return (state.propertyOffers ?? []).filter((offer) => {
    const from = state.players[offer.fromPlayerId];
    const to = state.players[offer.toPlayerId];
    const requested = state.properties[offer.requestedTileIndex];
    const offered = offer.offeredTileIndex === null ? null : state.properties[offer.offeredTileIndex];
    return (
      state.round <= offer.expiresAfterRound && from && to && !from.isBankrupt && !to.isBankrupt &&
      requested?.ownerId === to.id && !requested.isMortgaged && requested.level === offer.requestedLevel &&
      (offer.offeredTileIndex === null ||
        (offered?.ownerId === from.id && !offered.isMortgaged && offered.level === offer.offeredLevel))
    );
  });
}

function applyPropertyOffer(state: SimsarState, actorId: string, action: PropertyOfferAction) {
  const actor = state.players[actorId];
  if (!actor || actor.isBot || actor.isBankrupt || state.phase === "GAME_OVER") {
    return "الصفقات متاحة للسماسرية اللي باقيين فالماتش.";
  }
  const offers = getOpenPropertyOffers(state);
  const canDeal = isSimsarPropertyPhase(state.phase);

  if (action.type === "OFFER_PROPERTY_DEAL") {
    const { requestedTileIndex, offeredTileIndex, cashDh } = action;
    if (!canDeal) return "تسنى حتى تسالي هاد المرحلة باش تصيفط عرض.";
    if (!Number.isInteger(requestedTileIndex) ||
        (offeredTileIndex !== null && !Number.isInteger(offeredTileIndex)) ||
        !Number.isSafeInteger(cashDh) || cashDh < 0 || cashDh > actor.cash ||
        (cashDh === 0 && offeredTileIndex === null)) return "اختار عقار أو مبلغ من الرصيد ديالك.";

    const requested = state.properties[requestedTileIndex];
    const to = requested?.ownerId ? state.players[requested.ownerId] : undefined;
    const offered = offeredTileIndex === null ? null : state.properties[offeredTileIndex];
    if (!to || to.id === actorId || to.isBot || to.isBankrupt || requested.isMortgaged ||
        (offeredTileIndex !== null && (offered?.ownerId !== actorId || offered.isMortgaged))) {
      return "هاد العقار ما يمكنش يدخل فالصفقة دابا.";
    }
    if (offers.some((offer) => offer.fromPlayerId === actorId)) return "عندك عرض باقي كيتسنى الجواب.";

    state.propertyOffers = [...offers, {
      id: crypto.randomUUID(),
      fromPlayerId: actorId,
      toPlayerId: to.id,
      requestedTileIndex,
      requestedLevel: requested.level,
      offeredTileIndex,
      offeredLevel: offered?.level ?? null,
      cashDh,
      expiresAfterRound: state.round + 1,
    }];
    return;
  }

  const offer = offers.find((entry) => entry.id === action.offerId);
  const authorizedId = action.type === "CANCEL_PROPERTY_DEAL" ? offer?.fromPlayerId : offer?.toPlayerId;
  if (!offer || authorizedId !== actorId) return "هاد العرض ما بقاش متاح.";
  if (action.type === "ANSWER_PROPERTY_DEAL" && typeof action.accept !== "boolean") {
    return "اختار القبول أو الرفض.";
  }

  if (action.type === "ANSWER_PROPERTY_DEAL" && action.accept) {
    if (!canDeal) return "تسنى حتى تسالي هاد المرحلة باش تقبل العرض.";
    const from = state.players[offer.fromPlayerId];
    if (from.cash < offer.cashDh) return "مول العرض ما بقاش عندو الرصيد الكافي.";

    from.cash -= offer.cashDh;
    actor.cash += offer.cashDh;
    state.properties[offer.requestedTileIndex].ownerId = from.id;
    if (offer.offeredTileIndex !== null) state.properties[offer.offeredTileIndex].ownerId = actor.id;
    state.propertyOffers = getOpenPropertyOffers(state);
    if (state.mode === "MOUL") {
      receipt(state, {kind:"BUY", actor:from.id, recipient:actor.id, tile:offer.requestedTileIndex, amount:offer.cashDh, swapped:offer.offeredTileIndex ?? undefined});
      updateWealth(state);
      return;
    }
    pushBanner(
      state,
      "🤝",
      `${from.nickname} و ${actor.nickname} دارو صفقة!`,
      `${SIMSAR_BOARD_TILES[offer.requestedTileIndex].shortAr} ولات ديال ${from.nickname}.`,
      "EMERALD"
    );
    checkAndFinalizeMatchIfWon(state);
    return;
  }

  state.propertyOffers = offers.filter((entry) => entry.id !== offer.id);
}

function applySimsarActionInternal(
  baseState: SimsarState,
  actorId: string,
  action: SimsarAction,
  roomPlayers: Player[],
  isHostActor: boolean
): TransitionResult<SimsarState> {
  const state = cloneState(baseState);
  state.updatedAt = Date.now();

  if (action.type === "PLAY_AGAIN") {
    const fresh = Simsar3DEngine.createInitialState(roomPlayers, state.settings);
    return {
      success: true,
      newState: fresh,
      newPhase: fresh.phase,
      newRound: 1,
    };
  }

  if (action.type === "CONFIGURE_MATCH") {
    if (!isHostActor) {
      return { success: false, newState: state, newPhase: state.phase, error: "Host only" };
    }
    const newMode: SimsarMode = action.mode || state.settings.mode;
    const newSettings: SimsarSettings = {
      ...state.settings,
      mode: newMode,
      botFill: action.botFill !== undefined ? action.botFill : state.settings.botFill,
      maxRounds: newMode === "EMPIRE" ? 15 : 10,
      empireTargetDh: newMode === "EMPIRE" ? 6000 : 4200,
    };
    const fresh = Simsar3DEngine.createInitialState(roomPlayers, newSettings);
    return {
      success: true,
      newState: fresh,
      newPhase: fresh.phase,
      newRound: 1,
    };
  }

  if (action.type === "SELECT_TOKEN") {
    const me = state.players[actorId];
    const spec = SIMSAR_TOKENS[action.token];
    if (me && spec) {
      me.token = action.token;
      me.accentHex = spec.accentCss;
    }
    return { success: true, newState: state, newPhase: state.phase };
  }

  if (action.type === "SEND_REACTION") {
    const me = state.players[actorId];
    const rSpec = SIMSAR_REACTIONS[action.reactionId];
    if (me && rSpec) {
      me.lastReactionId = action.reactionId;
      me.lastReactionAt = Date.now();
    }
    return { success: true, newState: state, newPhase: state.phase };
  }

  if (action.type === "OFFER_PROPERTY_DEAL" || action.type === "ANSWER_PROPERTY_DEAL" ||
      action.type === "CANCEL_PROPERTY_DEAL") {
    const error = applyPropertyOffer(state, actorId, action);
    return error
      ? { success: false, newState: baseState, newPhase: baseState.phase, error }
      : { success: true, newState: state, newPhase: state.phase };
  }

  if (action.type === "BOT_STEP") {
    const decision = chooseNextBotAction(state);
    if (!decision) {
      return { success: true, newState: state, newPhase: state.phase };
    }
    return applySimsarActionInternal(
      state,
      decision.botId,
      decision.action,
      roomPlayers,
      true
    );
  }

  // === SIMULTANEOUS ALL-PLAYERS MINI-GAME ACTIONS ===
  if (action.type === "SUBMIT_MINIGAME_SCORE") {
    if (state.phase !== "MINIGAME" || !state.miniGame) {
      return { success: true, newState: state, newPhase: state.phase };
    }
    const clampedScore = Math.max(0, Math.min(5000, Math.round(action.score)));
    state.miniGame.scores[actorId] = Math.max(
      state.miniGame.scores[actorId] ?? 0,
      clampedScore
    );
    if (!state.miniGame.submittedIds.includes(actorId)) {
      state.miniGame.submittedIds.push(actorId);
    }

    const aliveIds = Object.values(state.players)
      .filter((p) => !p.isBankrupt)
      .map((p) => p.id);
    if (aliveIds.every((id) => state.miniGame!.submittedIds.includes(id))) {
      finalizeMiniGamePayouts(state);
    }
    refreshAllNetWorths(state);
    return {
      success: true,
      newState: state,
      newPhase: state.phase,
      newRound: state.round,
    };
  }

  if (action.type === "FINALIZE_MINIGAME") {
    if (state.phase === "MINIGAME" && state.miniGame) {
      finalizeMiniGamePayouts(state);
      refreshAllNetWorths(state);
    }
    return {
      success: true,
      newState: state,
      newPhase: state.phase,
      newRound: state.round,
    };
  }

  // === LIVE ROOM AUCTION ACTIONS (Open to all solvent players!) ===
  if (action.type === "PLACE_BID") {
    if (state.phase !== "AUCTION" || !state.auction) {
      return { success: false, newState: state, newPhase: state.phase, error: "No active auction" };
    }
    const bidder = state.players[actorId];
    if (!bidder || bidder.isBankrupt) {
      return { success: false, newState: state, newPhase: state.phase, error: "Invalid bidder" };
    }
    const delta = Math.max(10, Math.min(250, Math.round(action.amountDelta)));
    const nextBid = state.auction.currentBid + delta;
    if (bidder.cash < nextBid) {
      return { success: false, newState: state, newPhase: state.phase, error: "رصيدك غير كافي!" };
    }
    state.auction.currentBid = nextBid;
    state.auction.highestBidderId = bidder.id;
    state.auction.passedPlayerIds = state.auction.passedPlayerIds.filter((id) => id !== bidder.id);
    // Extend auction clock to at least 5.5s on any new bid for dramatic bidding wars!
    state.auction.endsAt = Math.max(state.auction.endsAt, Date.now() + 5500);
    return { success: true, newState: state, newPhase: state.phase };
  }

  if (action.type === "PASS_AUCTION") {
    if (state.phase !== "AUCTION" || !state.auction) {
      return { success: true, newState: state, newPhase: state.phase };
    }
    if (!state.auction.passedPlayerIds.includes(actorId)) {
      state.auction.passedPlayerIds.push(actorId);
    }
    const eligible = Object.values(state.players).filter(
      (p) => !p.isBankrupt && p.id !== state.auction!.highestBidderId
    );
    if (eligible.every((p) => state.auction!.passedPlayerIds.includes(p.id))) {
      finalizeAuction(state);
    }
    return { success: true, newState: state, newPhase: state.phase };
  }

  if (action.type === "FINALIZE_AUCTION") {
    if (state.phase === "AUCTION") {
      finalizeAuction(state);
    }
    return { success: true, newState: state, newPhase: state.phase };
  }

  // === ACTIVE TURN-HOLDER ACTIONS ===
  if (actorId !== state.currentPlayerId) {
    return {
      success: false,
      newState: state,
      newPhase: state.phase,
      error: "ماشي نوبتك دابا!",
    };
  }

  const player = state.players[actorId];
  if (!player || player.isBankrupt) {
    advanceTurnOrStartMiniGame(state);
    return { success: true, newState: state, newPhase: state.phase };
  }

  if (action.type === "PAY_JAIL_BAIL") {
    if (state.phase !== "ROLL_READY" || player.inJailTurns <= 0) {
      return { success: false, newState: state, newPhase: state.phase, error: "Not in jail" };
    }
    if (player.cash < JAIL_BAIL_DH) {
      return { success: false, newState: state, newPhase: state.phase, error: "ما عندكش 100 DH كفالة!" };
    }
    player.cash -= JAIL_BAIL_DH;
    state.gardiennagePot += JAIL_BAIL_DH;
    player.inJailTurns = 0;
    pushBanner(
      state,
      "🔓",
      `${player.nickname} خلّص 100 DH وخرج من الفوريان!`,
      "دابا لوح النرد وكمل طريقك!",
      "EMERALD"
    );
    refreshAllNetWorths(state);
    return { success: true, newState: state, newPhase: state.phase };
  }

  if (action.type === "ROLL_DICE") {
    if (state.phase !== "ROLL_READY") {
      return { success: false, newState: state, newPhase: state.phase, error: "Already rolled" };
    }

    const mult: 1 | 2 = action.multiplier === 2 && player.cash >= 500 ? 2 : 1;
    const die1 = 1 + Math.floor(Math.random() * 6);
    const die2 = 1 + Math.floor(Math.random() * 6);
    const total = die1 + die2;
    const isDoubles = die1 === die2;

    state.lastDice = {
      die1,
      die2,
      total,
      isDoubles,
      multiplier: mult,
      rollerId: player.id,
      rollSeq: (state.lastDice?.rollSeq ?? 0) + 1,
      rolledAt: Date.now(),
    };

    // Handle الفوريان (Jail) check!
    if (player.inJailTurns > 0) {
      if (isDoubles) {
        player.inJailTurns = 0;
        pushBanner(
          state,
          "🎲",
          `ضوبل (${die1}-${die2})! ${player.nickname} هرب من الفوريان فابور!`,
          `تقدم بـ ${total} خانات!`,
          "EMERALD"
        );
      } else if (player.inJailTurns === 1) {
        // Second turn in jail: auto-release after paying 50 DH reduced fine
        player.inJailTurns = 0;
        chargePlayerWithAutoRescue(state, player, 50, "POT");
        pushBanner(
          state,
          "🚓",
          `سالات مدة الحجز ديال ${player.nickname}!`,
          `خرج بـ 50 DH وتقدم بـ ${total} خانات!`,
          "CYAN"
        );
      } else {
        player.inJailTurns -= 1;
        pushBanner(
          state,
          "🔒",
          `${player.nickname} باقي مشدود فالفوريان!`,
          `ما جابش الضوبل (${die1}-${die2}) — باقي نوبة وحدة!`,
          "ROSE"
        );
        state.phase = "LANDED_DECISION";
        refreshAllNetWorths(state);
        return { success: true, newState: state, newPhase: state.phase };
      }
    } else if (isDoubles && !state.extraRollGranted) {
      state.extraRollGranted = true;
    } else {
      state.extraRollGranted = false;
    }

    const steps = total;
    const oldPos = player.position;
    const rawNext = oldPos + steps;
    const newPos = rawNext % BOARD_TILE_COUNT;

    player.prevPosition = oldPos;
    player.position = newPos;
    player.moveSeq += 1;

    // Passed START (المانضا) without landing directly on 0 (landing on 0 gives LAND_ON_START_BONUS_DH inside resolveTileArrival)
    if (rawNext >= BOARD_TILE_COUNT && newPos !== 0) {
      const sal = PASS_START_SALARY_DH * mult;
      player.cash += sal;
      pushBanner(
        state,
        "💵",
        `دازت المانضا لـ ${player.nickname}!`,
        `شدّيتي الخلصة الشهرية +${sal} DH!`,
        "EMERALD"
      );
    }

    resolveTileArrival(state, player, total, mult);
    refreshAllNetWorths(state);
    return { success: true, newState: state, newPhase: state.phase };
  }

  if (action.type === "PICK_HEIST_BOX") {
    if (state.phase !== "HEIST" || !state.heist || state.heist.raiderId !== player.id) {
      return { success: false, newState: state, newPhase: state.phase, error: "No active heist" };
    }
    const h = state.heist;
    const idx = action.boxIndex;
    if (idx < 0 || idx >= 9 || h.revealedIndices.includes(idx) || h.resolvedTier) {
      return { success: true, newState: state, newPhase: state.phase };
    }

    h.revealedIndices.push(idx);

    // Count matching symbols revealed so far; once 3 match (or 5 picks made), resolve!
    const counts: Record<SimsarHeistSymbol, number> = {
      SILVER: 0,
      GOLD: 0,
      DIAMOND: 0,
    };
    for (const rIdx of h.revealedIndices) {
      counts[h.boxes[rIdx]] += 1;
    }

    let matched: SimsarHeistSymbol | null = null;
    if (counts.DIAMOND >= 3) matched = "DIAMOND";
    else if (counts.GOLD >= 3) matched = "GOLD";
    else if (counts.SILVER >= 3) matched = "SILVER";
    else if (h.revealedIndices.length >= 5) {
      // Pick whichever has 2!
      matched = counts.DIAMOND >= 2 ? "DIAMOND" : counts.GOLD >= 2 ? "GOLD" : "SILVER";
    }

    if (matched) {
      h.resolvedTier = matched;
      const victim = state.players[h.victimId];
      const baseSteal = matched === "DIAMOND" ? 280 : matched === "GOLD" ? 170 : 95;

      if (victim && !victim.isBankrupt) {
        let actualSteal = Math.min(victim.cash, baseSteal);
        if (victim.shields > 0) {
          victim.shields -= 1;
          h.shieldBlocked = true;
          actualSteal = Math.round(actualSteal * 0.35);
        }
        victim.cash -= actualSteal;
        player.cash += actualSteal;
        player.heistStolen += actualSteal;
        h.stolenAmount = actualSteal;

        const tierLabel =
          matched === "DIAMOND"
            ? "💎 سرقة الماس الكبرى!"
            : matched === "GOLD"
            ? "🥇 خزنة الذهب!"
            : "🪙 غنيمة الفضة!";
        pushBanner(
          state,
          "🥷",
          `${tierLabel} ${player.nickname} سرق ${actualSteal} DH من ${victim.nickname}!`,
          h.shieldBlocked ? "درع الحماية 🛡️ أنقذ جزء كبير من الفلوس!" : "سطو نظيف بالعلالي!",
          "PURPLE"
        );
      }

      state.phase = "LANDED_DECISION";
      checkAndFinalizeMatchIfWon(state);
    }

    refreshAllNetWorths(state);
    return { success: true, newState: state, newPhase: state.phase };
  }

  if (action.type === "BUY_PROPERTY") {
    if (state.phase !== "LANDED_DECISION" || state.pendingTileIndex === null) {
      return { success: false, newState: state, newPhase: state.phase, error: "Nothing to buy" };
    }
    const tile = SIMSAR_BOARD_TILES[state.pendingTileIndex];
    const prop = state.properties[state.pendingTileIndex];
    if (!tile || !prop || prop.ownerId || !tile.price) {
      return { success: false, newState: state, newPhase: state.phase, error: "Already owned" };
    }
    if (player.cash < tile.price) {
      return { success: false, newState: state, newPhase: state.phase, error: "الفلوس ناقصة! دير دلالة!" };
    }

    player.cash -= tile.price;
    prop.ownerId = player.id;
    prop.level = 0;
    prop.isMortgaged = false;
    state.pendingTileIndex = null;

    pushBanner(
      state,
      "🏙️",
      `${player.nickname} شرا ${tile.nameAr}!`,
      `خلص ${tile.price} DH وتملّك الأرض رسمياً!`,
      "EMERALD"
    );
    checkAndFinalizeMatchIfWon(state);
    return { success: true, newState: state, newPhase: state.phase };
  }

  if (action.type === "START_AUCTION") {
    if (state.phase !== "LANDED_DECISION" || state.pendingTileIndex === null) {
      return { success: false, newState: state, newPhase: state.phase, error: "No property for auction" };
    }
    const tile = SIMSAR_BOARD_TILES[state.pendingTileIndex];
    const startBid = Math.max(40, Math.round((tile?.price || 120) * 0.45));
    const now = Date.now();
    state.auction = {
      tileIndex: state.pendingTileIndex,
      currentBid: startBid,
      highestBidderId: null,
      passedPlayerIds: [],
      startedAt: now,
      endsAt: now + AUCTION_DURATION_MS,
    };
    state.phase = "AUCTION";
    pushBanner(
      state,
      "🔨",
      `بدات الدلالة العلنية على ${tile?.shortAr}!`,
      `السومة الافتتاحية غير بـ ${startBid} DH — شكون يزيد؟`,
      "GOLD"
    );
    return { success: true, newState: state, newPhase: state.phase };
  }

  if (action.type === "UPGRADE_PROPERTY") {
    const tile = SIMSAR_BOARD_TILES[action.tileIndex];
    const quote = getSimsarUpgradeQuote(action.tileIndex, state.properties, player.id);
    if (!quote || !isSimsarPropertyPhase(state.phase) || player.inJailTurns > 0) {
      return { success: false, newState: state, newPhase: state.phase, error: "ما يمكنش تطوّر هاد العقار دابا." };
    }
    if (hasSimsarUpgradedTileThisTurn(state, tile.index)) {
      return { success: false, newState: state, newPhase: state.phase, error: "طوّرت هاد العقار فهاد النوبة. تقدر تطوّر عقار آخر." };
    }
    if (player.cash < quote.cost) {
      return { success: false, newState: state, newPhase: state.phase, error: "رصيدك غير كافي للبني!" };
    }

    player.cash -= quote.cost;
    state.properties[tile.index].level = quote.nextLevel;
    state.upgradedTileIndicesThisTurn = [...(state.upgradedTileIndicesThisTurn ?? []), tile.index];

    pushBanner(
      state,
      "🏗️",
      `${player.nickname} بنى ${BUILDING_TIER_NAMES_AR[quote.nextLevel]} فـ ${tile.shortAr}!`,
      `الكرا طلع من ${quote.currentRent} لـ ${quote.nextRent} DH!`,
      "GOLD"
    );
    checkAndFinalizeMatchIfWon(state);
    return { success: true, newState: state, newPhase: state.phase };
  }

  if (action.type === "MORTGAGE_PROPERTY") {
    const tile = SIMSAR_BOARD_TILES[action.tileIndex];
    const prop = state.properties[action.tileIndex];
    if (!tile || !prop || prop.ownerId !== player.id || prop.isMortgaged || !tile.price) {
      return { success: false, newState: state, newPhase: state.phase, error: "Cannot mortgage" };
    }
    const refund =
      Math.round(tile.price * 0.5) +
      prop.level * Math.round((tile.upgradeCost || 0) * 0.5);
    prop.level = 0;
    prop.isMortgaged = true;
    player.cash += refund;
    refreshAllNetWorths(state);
    return { success: true, newState: state, newPhase: state.phase };
  }

  if (action.type === "UNMORTGAGE_PROPERTY") {
    const tile = SIMSAR_BOARD_TILES[action.tileIndex];
    const prop = state.properties[action.tileIndex];
    if (!tile || !prop || prop.ownerId !== player.id || !prop.isMortgaged || !tile.price) {
      return { success: false, newState: state, newPhase: state.phase, error: "Not mortgaged" };
    }
    const cost = Math.round(tile.price * 0.55);
    if (player.cash < cost) {
      return { success: false, newState: state, newPhase: state.phase, error: "رصيدك غير كافي!" };
    }
    player.cash -= cost;
    prop.isMortgaged = false;
    refreshAllNetWorths(state);
    return { success: true, newState: state, newPhase: state.phase };
  }

  if (action.type === "END_TURN") {
    if (state.phase !== "LANDED_DECISION") {
      return { success: false, newState: state, newPhase: state.phase, error: "Roll first" };
    }
    // If player skipped an unowned property without clicking Buy or Auction, start quick auction if 2+ humans, else leave unowned!
    if (state.pendingTileIndex !== null) {
      state.pendingTileIndex = null;
    }
    advanceTurnOrStartMiniGame(state);
    refreshAllNetWorths(state);
    return {
      success: true,
      newState: state,
      newPhase: state.phase,
      newRound: state.round,
    };
  }

  return { success: true, newState: state, newPhase: state.phase };
}

export const Simsar3DEngine: GameDefinition<SimsarState, SimsarAction, SimsarSettings> = {
  id: "simsar3d",
  slug: "simsar3d",
  version: 1,
  displayNameKey: "سمسار رويال 3D: إمبراطورية الهمزة",
  shortDescriptionKey:
    "مونوبولي المغرب 3D × تحديات جماعية سريعة بيد وحدة فالهاتف! شري المدن، بني الرياضات والأوطيلات، ودير السطو والدلالة!",
  minPlayers: 1,
  maxPlayers: 7,
  capabilities: ["MULTI_PHONE", "ONE_PHONE", "HYBRID", "REALTIME", "SCORES", "TIMERS"],
  defaultSettings: DEFAULT_SIMSAR_SETTINGS,

  validateSetup(players: Player[], settings?: SimsarSettings): ValidationResult {
    const active = players.filter((p) => p.status !== "LEFT");
    if (active.length < 1) {
      return { isValid: false, errors: ["خاص على الأقل لاعب واحد!"] };
    }
    if (settings?.mode === "MOUL" && active.length > 7) return { isValid: false, errors: ["مول البلاد كيساع سبعة لاعبين"] };
    if (settings?.mode !== "MOUL" && active.length > 6) {
      return { isValid: false, errors: ["الحد الأقصى فـ الطبلة هو 6 سماسرية!"] };
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], rawSettings: SimsarSettings): SimsarState {
    const mode: SimsarMode = rawSettings?.mode || "BLITZ";
    const settings: SimsarSettings = {
      ...DEFAULT_SIMSAR_SETTINGS,
      ...rawSettings,
      mode,
      maxRounds: mode === "EMPIRE" ? 15 : 10,
      empireTargetDh: mode === "EMPIRE" ? 6000 : 4200,
    };

    const humans = players.filter((p) => p.status !== "LEFT").slice(0, mode === "MOUL" ? 7 : 6);
    const playersMap: Record<string, SimsarPlayer> = {};
    const turnOrder: string[] = [];

    humans.forEach((p, idx) => {
      const token = SIMSAR_TOKEN_ORDER[idx % SIMSAR_TOKEN_ORDER.length];
      const spec = SIMSAR_TOKENS[token];
      playersMap[p.id] = {
        id: p.id,
        nickname: p.nickname,
        isBot: false,
        token,
        accentHex: spec.accentCss,
        cash: settings.startingCash,
        netWorth: settings.startingCash,
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
      };
      turnOrder.push(p.id);
    });

    // Smart Bot Policy: Solo = 3 Moroccan Tycoon Bots (4-player table); 2+ humans = pure PvP unless botFill=true!
    const desiredTotal = humans.length === 1 ? 4 : settings.botFill ? Math.max(humans.length, 4) : humans.length;
    const botCount = Math.max(0, Math.min(6 - humans.length, desiredTotal - humans.length));
    const bots = createSimsarBots(humans.length, botCount, settings.startingCash);
    for (const b of bots) {
      playersMap[b.id] = b;
      turnOrder.push(b.id);
    }

    const firstId = turnOrder[0] || "p1";

    const initial: SimsarState = {
      phase: "ROLL_READY",
      mode,
      round: 1,
      maxRounds: settings.maxRounds,
      empireTargetDh: settings.empireTargetDh,
      settings,
      turnOrder,
      currentTurnIndex: 0,
      currentPlayerId: firstId,
      extraRollGranted: false,
      players: playersMap,
      properties: createInitialPropertiesState(),
      gardiennagePot: INITIAL_GARDIENNAGE_POT_DH,
      lastDice: null,
      pendingTileIndex: null,
      upgradedTileIndicesThisTurn: [],
      auction: null,
      heist: null,
      miniGame: null,
      recentEvents: [
        {
          id: "ev_welcome",
          emoji: "🎲",
          titleAr: "مرحبا فـ سمسار رويال 3D!",
          subtitleAr: "لوح النرد بيد وحدة، شري المدن وبني الإمبراطورية!",
          tone: "GOLD",
          createdAt: Date.now(),
        },
      ],
      lastRent: null,
      propertyOffers: [],
      winnerId: null,
      winnerSummaryAr: null,
      awards: [],
      updatedAt: Date.now(),
    };
    return mode === "MOUL" ? startMoul(initial) : initial;
  },

  start(ctx: GameContext<SimsarState, SimsarSettings>): TransitionResult<SimsarState> {
    const fresh = this.createInitialState(ctx.players, ctx.settings);
    return {
      success: true,
      newState: fresh,
      newPhase: fresh.phase,
      newRound: 1,
    };
  },

  handleAction(
    ctx: GameContext<SimsarState, SimsarSettings>,
    actorPlayerId: string,
    action: SimsarAction
  ): TransitionResult<SimsarState> {
    const actorObj = ctx.players.find((p) => p.id === actorPlayerId);
    const isHost = Boolean(actorObj?.isHost);
    if (ctx.state.mode === "MOUL") {
      if (action.type === "OFFER_PROPERTY_DEAL" || action.type === "ANSWER_PROPERTY_DEAL" || action.type === "CANCEL_PROPERTY_DEAL") {
        const next = cloneState(ctx.state);
        const error = applyPropertyOffer(next, actorPlayerId, action);
        return {success: !error, error, newState: error ? ctx.state : next, newPhase: next.phase};
      }
      if (action.type === "PLAY_AGAIN" && isHost && ctx.state.phase === "GAME_OVER") return this.start({...ctx, settings: ctx.state.settings});
      return applyMoul(ctx.state, actorPlayerId, action, isHost);
    }
    return applySimsarActionInternal(ctx.state, actorPlayerId, action, ctx.players, isHost);
  },

  getPublicView(ctx: GameContext<SimsarState, SimsarSettings>): PublicGameView {
    const s = ctx.state;
    if (s.moul) return { gameId: "simsar3d", phase: s.phase, round: s.round, stateVersion: ctx.stateVersion, publicData: { ...s, propertyOffers: getOpenPropertyOffers(s), moul: { ...s.moul, bids: Object.fromEntries(Object.keys(s.moul.bids).map(id => [id, 0])) } } };
    // Mask unrevealed heist boxes so nobody peeks via network tab!
    const safeHeist = s.heist
      ? {
          ...s.heist,
          boxes: s.heist.boxes.map((sym, idx) =>
            s.heist!.revealedIndices.includes(idx) || s.heist!.resolvedTier ? sym : ("SILVER" as const)
          ),
        }
      : null;

    return {
      gameId: "simsar3d",
      phase: s.phase,
      round: s.round,
      stateVersion: ctx.stateVersion,
      publicData: {
        ...s,
        heist: safeHeist,
        propertyOffers: s.phase === "GAME_OVER" ? [] : getOpenPropertyOffers(s),
      },
    };
  },

  getPlayerView(
    ctx: GameContext<SimsarState, SimsarSettings>,
    playerId: string
  ): PrivatePlayerGameView {
    const pObj = ctx.players.find((p) => p.id === playerId);
    return {
      playerId,
      isHost: Boolean(pObj?.isHost),
      privateData: {
        myPlayerId: playerId,
      },
      allowedActions: [],
    };
  },

  checkFinished(ctx: GameContext<SimsarState, SimsarSettings>): GameEndResult | null {
    if (ctx.state.phase !== "GAME_OVER") return null;
    const standings = sortSimsarStandings(Object.values(ctx.state.players));
    return {
      isFinished: true,
      winner: {
        players: ctx.state.winnerId ? [ctx.state.winnerId] : [],
        summary: ctx.state.winnerSummaryAr || "سالات المباراة!",
      },
      scoreboard: standings.map((p) => ({
        id: p.id,
        label: p.nickname,
        score: p.netWorth,
      })),
    };
  },
};
