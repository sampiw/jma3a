import type { TransitionResult } from "@/games/registry";
import type { SimsarState, SimsarAction } from "./types";
import { generateBotMiniGameScore } from "./ai";
import { MOUL_CAST, MOUL_ROUNDS, MOUL_SITES, MOUL_STARTS, moulRent, routeTile, upgradePrice, type MoulShot } from "./moulBoard";

export function updateWealth(s: SimsarState) {
  for (const p of Object.values(s.players)) {
    p.netWorth = p.cash + MOUL_SITES.reduce((sum, site, i) => {
      const prop = s.properties[i];
      return sum + (prop.ownerId === p.id ? site.price + upgradePrice(i) * prop.level : 0);
    }, 0);
  }
}
export function startMoul(s: SimsarState) {
  s.maxRounds = s.settings.maxRounds = MOUL_ROUNDS;
  s.moul = { cast: {}, steps: null, bids: {}, auctionEnd: 0, history: [], built: false };
  s.properties = Object.fromEntries(MOUL_SITES.map((_, i) => [i, {ownerId: null, level: 0, isMortgaged: false}]));
  s.turnOrder.forEach((id, i) => {
    const p = s.players[id];
    s.moul!.cast[id] = i;
    p.accentHex = MOUL_CAST[i].color;
    p.position = p.prevPosition = MOUL_STARTS[i];
    p.cash = 800;
    s.properties[p.position].ownerId = id;
  });
  updateWealth(s);
  return s;
}
export function receipt(s: SimsarState, data: Omit<MoulShot, "id">) {
  const table = s.moul!;
  table.history.unshift({...data, id: crypto.randomUUID()});
  table.history.length = Math.min(table.history.length, 12);
}
function award(s: SimsarState, tile: number, id: string, price: number) {
  s.players[id].cash -= price;
  s.properties[tile].ownerId = id;
  receipt(s, {kind: "BUY", tile, actor: id, amount: price});
}
function settleAuction(s: SimsarState) {
  const tile = s.pendingTileIndex!;
  const bids = s.moul!.bids;
  // Ties go to the first seat clockwise from the active player.
  const order = [...s.turnOrder.slice(s.currentTurnIndex), ...s.turnOrder.slice(0, s.currentTurnIndex)];
  const best = order.filter(id => bids[id] > 0 && s.players[id].cash >= bids[id]).sort((a,b) => bids[b] - bids[a])[0];
  if (best) award(s, tile, best, bids[best]);
  s.moul!.bids = {};
  s.moul!.auctionEnd = 0;
  s.pendingTileIndex = null;
  s.phase = "LANDED_DECISION";
}
function beginMini(s: SimsarState) {
  const id = s.round === 4 ? "DIRHAM_RAIN" : "TAXI_METER";
  const now = Date.now();
  const scores = Object.fromEntries(s.turnOrder.filter(p => s.players[p].isBot).map(p => [p, generateBotMiniGameScore(p, id)]));
  s.miniGame = {id, roundNumber: s.round, seed: Math.floor(Math.random()*100000), startedAt: now, endsAt: now+22000, scores, submittedIds: Object.keys(scores), resolved: false};
  s.phase = "MINIGAME";
}
function finishMini(s: SimsarState) {
  const mg = s.miniGame!;
  const ranked = s.turnOrder.filter(id => mg.submittedIds.includes(id)).sort((a,b) => mg.scores[b]-mg.scores[a]);
  const winner = ranked[0];
  if (winner) {
    s.players[winner].cash += 200;
    s.players[winner].miniGamesWon++;
    receipt(s, {kind: "PRIZE", tile: s.players[winner].position, actor: winner, amount: 200});
  }
  s.round++;
  s.miniGame = null;
  s.phase = "ROLL_READY";
}
function endTurn(s: SimsarState) {
  s.currentTurnIndex = (s.currentTurnIndex + 1) % s.turnOrder.length;
  s.currentPlayerId = s.turnOrder[s.currentTurnIndex];
  s.moul!.built = false;
  s.lastDice = null;
  s.phase = "ROLL_READY";
  if (s.currentTurnIndex !== 0) return;
  if (s.round === s.maxRounds) {
    const winner = Object.values(s.players).sort((a,b) => b.netWorth-a.netWorth || b.cash-a.cash)[0];
    s.winnerId = winner.id;
    s.winnerSummaryAr = winner.nickname + " مول البلاد · " + winner.netWorth + " DH";
    s.phase = "GAME_OVER";
  } else if (s.round === 4 || s.round === 8) beginMini(s);
  else s.round++;
}
function botChoice(s: SimsarState): SimsarAction {
  const player = s.players[s.currentPlayerId];
  if (s.phase === "ROLL_READY") return {type: "ROLL_DICE"};
  const steps = s.moul!.steps;
  if (steps !== null) {
    const value = (direction: 1 | -1) => {
      const tile = routeTile(player.position, steps, direction);
      const site = MOUL_SITES[tile], prop = s.properties[tile];
      if (!site.price) return -80;
      if (!prop.ownerId) return site.price <= player.cash ? site.price / 3 : 0;
      return prop.ownerId === player.id ? 10 : -moulRent(tile, s.properties);
    };
    return {type: "MOUL_ROUTE", direction: value(1) >= value(-1) ? 1 : -1};
  }
  if (s.pendingTileIndex !== null) return {type: player.cash >= MOUL_SITES[s.pendingTileIndex].price + 80 ? "BUY_PROPERTY" : "START_AUCTION"};
  const tile = player.position;
  if (!s.moul!.built && s.properties[tile].ownerId === player.id && s.properties[tile].level < 2 && player.cash > upgradePrice(tile)+160) return {type:"UPGRADE_PROPERTY", tileIndex:tile};
  return {type:"END_TURN"};
}
export function applyMoul(base: SimsarState, actor: string, action: SimsarAction, host: boolean): TransitionResult<SimsarState> {
  const fail = (error: string) => ({success: false, newState: base, newPhase: base.phase, error});
  if (!base.players[actor] || base.phase === "GAME_OVER") return fail("الدور سالا");
  const s = structuredClone(base);
  const m = s.moul!, p = s.players[actor];
  if (action.type === "BOT_STEP") {
    if (!host || !s.players[s.currentPlayerId].isBot || !["ROLL_READY","LANDED_DECISION"].includes(s.phase)) return fail("ماشي دور الروبو");
    return applyMoul(s, s.currentPlayerId, botChoice(s), false);
  }
  if (action.type === "SEND_REACTION") {
    if (!["TBARKALLAH","PAY_RENT","BROKE"].includes(action.reactionId) || Date.now()-p.lastReactionAt < 1800) return fail("بشوية");
    p.lastReactionId = action.reactionId;
    p.lastReactionAt = Date.now();
  } else if (action.type === "MOUL_CAST") {
    const c = action.character;
    if (!Number.isInteger(c) || !MOUL_CAST[c] || Object.entries(m.cast).some(([id,v]) => id !== actor && v === c)) return fail("هاد الشخصية محجوزة");
    m.cast[actor] = c;
    p.accentHex = MOUL_CAST[c].color;
  } else if (action.type === "MOUL_BID" || action.type === "FINALIZE_AUCTION") {
    if (s.phase !== "AUCTION") return fail("المزاد سالا");
    if (action.type === "MOUL_BID") {
      if (Date.now() >= m.auctionEnd || actor in m.bids || !Number.isInteger(action.amount) || action.amount < 0 || action.amount > p.cash) return fail("عرض غير صالح");
      m.bids[actor] = action.amount;
    } else if (Date.now() < m.auctionEnd) return fail("المزاد مازال مفتوح");
    if (Date.now() >= m.auctionEnd || s.turnOrder.every(id => id in m.bids)) settleAuction(s);
  } else if (action.type === "SUBMIT_MINIGAME_SCORE" || action.type === "FINALIZE_MINIGAME") {
    const mg = s.miniGame;
    if (s.phase !== "MINIGAME" || !mg) return fail("التحدي سالا");
    if (action.type === "SUBMIT_MINIGAME_SCORE") {
      if (!Number.isFinite(action.score) || mg.submittedIds.includes(actor) || Date.now() > mg.endsAt + 1200) return fail("النتيجة تسجلات أو الوقت سالا");
      mg.scores[actor] = Math.max(0, Math.min(5000, Math.round(action.score)));
      mg.submittedIds.push(actor);
    } else if (Date.now() < mg.endsAt) return fail("باقي الوقت");
    if (action.type === "FINALIZE_MINIGAME" || mg.submittedIds.length === s.turnOrder.length) finishMini(s);
  } else {
    if (s.currentPlayerId !== actor) return fail("تسنى نوبتك");
    if (action.type === "ROLL_DICE" && s.phase === "ROLL_READY") {
      m.steps = 1 + Math.floor(Math.random()*6);
      s.phase = "LANDED_DECISION";
    } else if (action.type === "MOUL_ROUTE" && s.phase === "LANDED_DECISION" && m.steps !== null && (action.direction === 1 || action.direction === -1)) {
      const tile = routeTile(p.position, m.steps, action.direction);
      p.prevPosition = p.position;
      p.position = tile;
      p.moveSeq++;
      m.steps = null;
      const owner = s.properties[tile].ownerId;
      if (!MOUL_SITES[tile].price || (owner && owner !== actor)) {
        const rent = owner ? moulRent(tile, s.properties) : 80;
        const amount = Math.min(rent, p.cash);
        p.cash -= amount;
        if (owner) {
          s.players[owner].cash += amount;
          s.players[owner].rentCollected += amount;
          p.rentPaid += amount;
        }
        receipt(s, {kind: owner ? "RENT" : "TAX", actor, recipient: owner ?? undefined, tile, amount});
      } else if (!owner) s.pendingTileIndex = tile;
    } else if ((action.type === "BUY_PROPERTY" || action.type === "START_AUCTION") && s.phase === "LANDED_DECISION" && s.pendingTileIndex !== null) {
      const tile = s.pendingTileIndex, price = MOUL_SITES[tile].price;
      if (action.type === "BUY_PROPERTY") {
        if (p.cash < price || s.properties[tile].ownerId) return fail("الرصيد ما كافيش");
        award(s, tile, actor, price);
        s.pendingTileIndex = null;
      } else {
        s.phase = "AUCTION";
        m.auctionEnd = Date.now()+45000;
        m.bids = Object.fromEntries(s.turnOrder.filter(id => s.players[id].isBot).map(id => [id, Math.max(0, Math.min(s.players[id].cash-80, Math.round(price*.8)))]));
      }
    } else if (action.type === "UPGRADE_PROPERTY" && ["ROLL_READY","LANDED_DECISION"].includes(s.phase) && s.pendingTileIndex === null && m.steps === null) {
      const tile = action.tileIndex, prop = s.properties[tile];
      if (!Number.isInteger(tile) || !prop || prop.ownerId !== actor || prop.level >= 2 || m.built || p.cash < upgradePrice(tile)) return fail("ما يمكنش تبني دابا");
      const cost = upgradePrice(tile);
      p.cash -= cost;
      prop.level++;
      m.built = true;
      receipt(s, {kind:"BUILD", tile, actor, amount:cost});
    } else if (action.type === "END_TURN" && s.phase === "LANDED_DECISION" && m.steps === null && s.pendingTileIndex === null) {
      p.cash += 35;
      updateWealth(s);
      endTurn(s);
    } else return fail("هاد الحركة ماشي متاحة دابا");
  }
  s.updatedAt = Date.now();
  updateWealth(s);
  return {success:true, newState:s, newPhase:s.phase, newRound:s.round};
}
