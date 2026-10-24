import {
  GameContext,
  GameDefinition,
  GameEndResult,
  TransitionResult,
  ValidationResult,
} from "@/games/registry";
import { Player, PrivatePlayerGameView, PublicGameView } from "@/lib/types";
import {
  BattleFeedItem,
  CORSAIR_STYLES,
  CannonShotRecord,
  LootCrateKind,
  MATCH_DURATION_MS,
  PIRATES3D_GAME_ID,
  PIRATES_ISLANDS,
  PirateShipState,
  Pirates3DAction,
  Pirates3DSettings,
  Pirates3DState,
  SEA_ARENA_RADIUS,
  SeaLootCrate,
  WIN_GOLD_TARGET,
  WIN_SINKS_TARGET,
} from "./types";

const BOT_DEFINITIONS = [
  { id: "bot_barbarossa", nickname: "🤖 الرايس عروج", styleIndex: 1 },
  { id: "bot_sayyida", nickname: "🤖 السيدة الحرة", styleIndex: 2 },
  { id: "bot_morato", nickname: "🤖 مراد رايس", styleIndex: 4 },
];

const LOOT_TYPES: LootCrateKind[] = [
  "REPAIR",
  "DOUBLE_POWDER",
  "SHIELD",
  "GOLD_CHEST",
];

function clampToSeaArena(x: number, z: number): { x: number; z: number } {
  let nx = Number.isFinite(x) ? x : 0;
  let nz = Number.isFinite(z) ? z : 0;

  // Push outside island obstacles
  for (const isl of PIRATES_ISLANDS) {
    const dx = nx - isl.x;
    const dz = nz - isl.z;
    const dist = Math.hypot(dx, dz);
    const minDist = isl.radius + 2.4;
    if (dist < minDist) {
      const ang = dist > 0.001 ? Math.atan2(dz, dx) : 0;
      nx = isl.x + Math.cos(ang) * minDist;
      nz = isl.z + Math.sin(ang) * minDist;
    }
  }

  // Clamp inside outer sea boundary
  const radial = Math.hypot(nx, nz);
  if (radial > SEA_ARENA_RADIUS - 2.5) {
    const scale = (SEA_ARENA_RADIUS - 2.5) / radial;
    nx *= scale;
    nz *= scale;
  }

  return { x: Number(nx.toFixed(2)), z: Number(nz.toFixed(2)) };
}

function getHarborSpawnPoint(index: number, total: number): {
  x: number;
  z: number;
  yaw: number;
} {
  const angle = (index / Math.max(1, total)) * Math.PI * 2 + 0.35;
  const radius = 38;
  const rawX = Math.cos(angle) * radius;
  const rawZ = Math.sin(angle) * radius;
  const pos = clampToSeaArena(rawX, rawZ);
  // Face toward center of the sea
  const yaw = Math.atan2(-pos.x, -pos.z);
  return { x: pos.x, z: pos.z, yaw: Number(yaw.toFixed(3)) };
}

function spawnFreshCrate(index: number, now: number): SeaLootCrate {
  const angle = index * 1.37 + ((now % 1000) / 1000) * Math.PI * 2;
  const dist = 15 + (index % 3) * 9;
  const pos = clampToSeaArena(Math.cos(angle) * dist, Math.sin(angle) * dist);
  const kind = LOOT_TYPES[index % LOOT_TYPES.length];
  return {
    id: `crate_${now}_${index}_${Math.floor(Math.random() * 999)}`,
    kind,
    x: pos.x,
    z: pos.z,
    spawnedAt: now,
  };
}

function addFeed(
  state: Pirates3DState,
  textAr: string,
  tone: BattleFeedItem["tone"],
  now: number
) {
  state.battleFeed = [
    {
      id: `feed_${now}_${Math.floor(Math.random() * 9999)}`,
      textAr,
      tone,
      ts: now,
    },
    ...state.battleFeed,
  ].slice(0, 8);
}

function buildFreshBattleState(
  players: Player[],
  round: number,
  existingScores: Record<string, number>,
  aiBotsEnabled: boolean
): Pirates3DState {
  const now = Date.now();
  const scores: Record<string, number> = { ...existingScores };
  const ships: Record<string, PirateShipState> = {};

  const botCount = aiBotsEnabled ? Math.max(1, 4 - players.length) : 0;
  const totalShips = players.length + botCount;

  players.forEach((p, idx) => {
    if (typeof scores[p.id] !== "number") scores[p.id] = 0;
    const spawn = getHarborSpawnPoint(idx, totalShips);
    ships[p.id] = {
      id: p.id,
      nickname: p.nickname,
      isBot: false,
      styleIndex: idx % CORSAIR_STYLES.length,
      x: spawn.x,
      z: spawn.z,
      yaw: spawn.yaw,
      speed: 0,
      hp: 100,
      maxHp: 100,
      shield: 20,
      goldScore: 0,
      sinks: 0,
      deaths: 0,
      doublePowderUntil: 0,
      windBoostUntil: 0,
      sunkUntil: 0,
      lastShotAt: 0,
      lastBroadsideAt: 0,
      lastBoostAt: 0,
    };
  });

  for (let b = 0; b < botCount; b++) {
    const botDef = BOT_DEFINITIONS[b % BOT_DEFINITIONS.length];
    const spawn = getHarborSpawnPoint(players.length + b, totalShips);
    ships[botDef.id] = {
      id: botDef.id,
      nickname: botDef.nickname,
      isBot: true,
      styleIndex: (players.length + b + 1) % CORSAIR_STYLES.length,
      x: spawn.x,
      z: spawn.z,
      yaw: spawn.yaw,
      speed: 5.5,
      hp: 100,
      maxHp: 100,
      shield: 0,
      goldScore: 0,
      sinks: 0,
      deaths: 0,
      doublePowderUntil: 0,
      windBoostUntil: 0,
      sunkUntil: 0,
      lastShotAt: 0,
      lastBroadsideAt: 0,
      lastBoostAt: 0,
    };
  }

  const lootCrates: SeaLootCrate[] = [];
  for (let i = 0; i < 6; i++) {
    lootCrates.push(spawnFreshCrate(i, now));
  }

  return {
    phase: "PLAYING",
    round,
    startedAt: now,
    endsAt: now + MATCH_DURATION_MS,
    aiBotsEnabled,
    ships,
    lootCrates,
    recentShots: [],
    battleFeed: [
      {
        id: `start_${now}`,
        textAr:
          "🏴‍☠️ انطلقت معركة قراصنة سلا! وجّه السفينة وأطلق المدافع لإغراق الخصوم!",
        tone: "info",
        ts: now,
      },
    ],
    winnerId: null,
    winnerSummaryAr: null,
    scores,
  };
}

function checkRespawnsAndVictory(state: Pirates3DState, now: number) {
  const shipList = Object.values(state.ships);

  // 1. Respawn sunk ships whose timer has elapsed
  shipList.forEach((ship, idx) => {
    if (ship.sunkUntil > 0 && now >= ship.sunkUntil) {
      const spawn = getHarborSpawnPoint(
        idx + Math.floor(now / 1000),
        shipList.length
      );
      ship.sunkUntil = 0;
      ship.hp = ship.maxHp;
      ship.shield = 25;
      ship.x = spawn.x;
      ship.z = spawn.z;
      ship.yaw = spawn.yaw;
    }
  });

  if (state.phase === "GAME_OVER") return;

  // 2. Check if any captain reached target sinks or gold score, or time expired
  let winningShip: PirateShipState | null = null;
  for (const s of shipList) {
    if (s.sinks >= WIN_SINKS_TARGET || s.goldScore >= WIN_GOLD_TARGET) {
      if (!winningShip || s.goldScore > winningShip.goldScore) {
        winningShip = s;
      }
    }
  }

  const timeExpired = now >= state.endsAt;
  if (winningShip || timeExpired) {
    const sorted = [...shipList].sort(
      (a, b) => b.goldScore - a.goldScore || b.sinks - a.sinks
    );
    const champ = winningShip ?? sorted[0];
    state.phase = "GAME_OVER";
    state.winnerId = champ?.id ?? null;

    for (const s of shipList) {
      if (!s.isBot) {
        state.scores[s.id] = (state.scores[s.id] || 0) + s.goldScore;
      }
    }
    if (champ && !champ.isBot) {
      state.scores[champ.id] = (state.scores[champ.id] || 0) + 150;
    }

    state.winnerSummaryAr = champ
      ? `👑 انتصر القبطان ${champ.nickname} بلقب أمير قراصنة سلا برصيد ${champ.goldScore} ذهب و ${champ.sinks} إغراقات!`
      : "انتهت المعركة البحرية!";
  }
}

function collectNearbyCrates(
  state: Pirates3DState,
  ship: PirateShipState,
  now: number
) {
  if (ship.sunkUntil > 0) return;

  for (let i = state.lootCrates.length - 1; i >= 0; i--) {
    const crate = state.lootCrates[i];
    const dist = Math.hypot(ship.x - crate.x, ship.z - crate.z);
    if (dist <= 4.3) {
      state.lootCrates.splice(i, 1);

      switch (crate.kind) {
        case "REPAIR":
          ship.hp = Math.min(ship.maxHp, ship.hp + 40);
          ship.goldScore += 30;
          addFeed(
            state,
            `🧰 ${ship.nickname} أصلح سفينته (+40 صحة)!`,
            "loot",
            now
          );
          break;
        case "DOUBLE_POWDER":
          ship.doublePowderUntil = now + 14_000;
          ship.goldScore += 40;
          addFeed(
            state,
            `🔥 ${ship.nickname} التقط البارود المضاعف (ضرر ×1.5)!`,
            "loot",
            now
          );
          break;
        case "SHIELD":
          ship.shield = Math.min(80, ship.shield + 45);
          ship.goldScore += 35;
          addFeed(
            state,
            `🛡️ ${ship.nickname} عزّز درع السفينة (+45 درع)!`,
            "loot",
            now
          );
          break;
        case "GOLD_CHEST":
          ship.goldScore += 160;
          addFeed(
            state,
            `💰 ${ship.nickname} غنم صندوق كنز سلا (+160 ذهب)!`,
            "loot",
            now
          );
          break;
      }

      state.lootCrates.push(spawnFreshCrate(i + Math.floor(now % 17), now));
    }
  }
}

function executeCannonFire(
  state: Pirates3DState,
  shooter: PirateShipState,
  mode: "SINGLE" | "TRIPLE",
  aimYaw: number,
  targetX: number,
  targetZ: number,
  targetShipId: string | undefined,
  now: number
) {
  if (shooter.sunkUntil > 0 || state.phase !== "PLAYING") return;

  const isTriple = mode === "TRIPLE";
  const cooldown = isTriple ? 3800 : 750;
  const lastTime = isTriple ? shooter.lastBroadsideAt : shooter.lastShotAt;
  if (now - lastTime < cooldown) return;

  if (isTriple) {
    shooter.lastBroadsideAt = now;
  } else {
    shooter.lastShotAt = now;
  }

  const clampedTarget = clampToSeaArena(targetX, targetZ);
  const powderMult = shooter.doublePowderUntil > now ? 1.5 : 1.0;
  const baseDamage = Math.round((isTriple ? 44 : 28) * powderMult);
  const splashRadius = isTriple ? 8.2 : 5.8;

  const hitShipIds: string[] = [];
  const sunkShipIds: string[] = [];

  for (const enemy of Object.values(state.ships)) {
    if (enemy.id === shooter.id || enemy.sunkUntil > 0) continue;

    const distToShooter = Math.hypot(enemy.x - shooter.x, enemy.z - shooter.z);
    if (distToShooter > 46) continue;

    const distToImpact = Math.hypot(
      enemy.x - clampedTarget.x,
      enemy.z - clampedTarget.z
    );

    // Also check perpendicular distance to cannonball trajectory line
    const segDx = clampedTarget.x - shooter.x;
    const segDz = clampedTarget.z - shooter.z;
    const segLenSq = segDx * segDx + segDz * segDz;
    let distToRay = distToImpact;
    if (segLenSq > 1) {
      const t = Math.max(
        0,
        Math.min(
          1,
          ((enemy.x - shooter.x) * segDx + (enemy.z - shooter.z) * segDz) /
            segLenSq
        )
      );
      const projX = shooter.x + t * segDx;
      const projZ = shooter.z + t * segDz;
      distToRay = Math.hypot(enemy.x - projX, enemy.z - projZ);
    }

    const isLockedTarget =
      targetShipId === enemy.id && distToShooter <= 42;
    const isHit =
      isLockedTarget ||
      distToImpact <= splashRadius ||
      distToRay <= (isTriple ? 4.8 : 3.4);

    if (isHit) {
      hitShipIds.push(enemy.id);
      let remainingDmg = baseDamage;

      if (enemy.shield > 0) {
        const absorbed = Math.min(enemy.shield, remainingDmg);
        enemy.shield -= absorbed;
        remainingDmg -= absorbed;
      }

      enemy.hp = Math.max(0, enemy.hp - remainingDmg);
      shooter.goldScore += 45;

      if (enemy.hp <= 0) {
        enemy.sunkUntil = now + 3500;
        enemy.deaths += 1;
        shooter.sinks += 1;
        shooter.goldScore += 200;
        sunkShipIds.push(enemy.id);
        addFeed(
          state,
          `🏴‍☠️💥 ${shooter.nickname} أغرق سفينة ${enemy.nickname} (+200 ذهب)!`,
          "sink",
          now
        );
      } else {
        addFeed(
          state,
          `💣 ${shooter.nickname} أصاب سفينة ${enemy.nickname} (-${baseDamage} HP)!`,
          "hit",
          now
        );
      }
    }
  }

  // If locked onto an enemy ship, snap visual target coords to that ship for dramatic 3D impact
  let finalToX = clampedTarget.x;
  let finalToZ = clampedTarget.z;
  if (hitShipIds.length > 0) {
    const firstHit = state.ships[hitShipIds[0]];
    if (firstHit) {
      finalToX = firstHit.x;
      finalToZ = firstHit.z;
    }
  }

  const shotRecord: CannonShotRecord = {
    id: `shot_${now}_${Math.floor(Math.random() * 9999)}`,
    shooterId: shooter.id,
    shooterStyleIndex: shooter.styleIndex,
    mode,
    fromX: shooter.x,
    fromZ: shooter.z,
    toX: finalToX,
    toZ: finalToZ,
    hitShipIds,
    sunkShipIds,
    ts: now,
  };

  state.recentShots = [shotRecord, ...state.recentShots].slice(0, 12);
  void aimYaw;
}

function stepAiBots(state: Pirates3DState, now: number) {
  if (!state.aiBotsEnabled || state.phase !== "PLAYING") return;

  const allShips = Object.values(state.ships);
  for (const bot of allShips) {
    if (!bot.isBot || bot.sunkUntil > 0) continue;

    // Find nearest living non-self ship
    let nearestEnemy: PirateShipState | null = null;
    let nearestDist = Infinity;
    for (const other of allShips) {
      if (other.id === bot.id || other.sunkUntil > 0) continue;
      const d = Math.hypot(other.x - bot.x, other.z - bot.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearestEnemy = other;
      }
    }

    if (nearestEnemy) {
      const desiredYaw = Math.atan2(
        nearestEnemy.x - bot.x,
        nearestEnemy.z - bot.z
      );
      // Circle-strafe when close, approach when far
      const orbitOffset = nearestDist < 18 ? 0.65 : 0.1;
      bot.yaw = Number((desiredYaw + orbitOffset).toFixed(3));
    } else {
      bot.yaw = Number((bot.yaw + 0.18).toFixed(3));
    }

    const stepDist = 2.6;
    const nextPos = clampToSeaArena(
      bot.x + Math.sin(bot.yaw) * stepDist,
      bot.z + Math.cos(bot.yaw) * stepDist
    );
    bot.x = nextPos.x;
    bot.z = nextPos.z;
    bot.speed = 6.5;

    collectNearbyCrates(state, bot, now);

    // Bot fires cannon if enemy is within 32m and cooldown elapsed
    if (
      nearestEnemy &&
      nearestDist <= 31 &&
      now - bot.lastShotAt >= 2600
    ) {
      // Slight aim scatter so bots are fun and fair
      const scatterX = (Math.random() - 0.5) * 7.5;
      const scatterZ = (Math.random() - 0.5) * 7.5;
      executeCannonFire(
        state,
        bot,
        "SINGLE",
        bot.yaw,
        nearestEnemy.x + scatterX,
        nearestEnemy.z + scatterZ,
        undefined,
        now
      );
    }
  }
}

export const Pirates3DEngine: GameDefinition<
  Pirates3DState,
  Pirates3DAction,
  Pirates3DSettings
> = {
  id: PIRATES3D_GAME_ID,
  slug: PIRATES3D_GAME_ID,
  version: 1,
  displayNameKey: "قراصنة سلا 3D: حرب السفن 🏴‍☠️💣",
  shortDescriptionKey:
    "معركة بحرية ثلاثية الأبعاد بسفن القراصنة الخشبية، الأمواج المتحركة، ومدافع البارود! أغرق سفن أصدقائك واجمع كنوز الذهب!",
  minPlayers: 1,
  maxPlayers: 8,
  capabilities: ["MULTI_PHONE", "HYBRID", "SCORES"],
  defaultSettings: {
    aiBotsEnabled: true,
    interactionMode: "MULTI_PHONE",
  },

  validateSetup(players: Player[]): ValidationResult {
    if (players.length < 1) {
      return {
        isValid: false,
        errors: ["خاص على الأقل قبطان واحد باش تبدا معركة قراصنة سلا 3D!"],
      };
    }
    return { isValid: true };
  },

  createInitialState(
    players: Player[],
    settings?: Pirates3DSettings
  ): Pirates3DState {
    const aiBots =
      typeof settings?.aiBotsEnabled === "boolean"
        ? settings.aiBotsEnabled
        : players.length < 3;
    return buildFreshBattleState(players, 1, {}, aiBots);
  },

  start(
    ctx: GameContext<Pirates3DState, Pirates3DSettings>
  ): TransitionResult<Pirates3DState> {
    const state = this.createInitialState(ctx.players, ctx.settings);
    return {
      success: true,
      newState: state,
      newPhase: state.phase,
      newRound: 1,
    };
  },

  handleAction(
    ctx: GameContext<Pirates3DState, Pirates3DSettings>,
    actorPlayerId: string,
    action: Pirates3DAction
  ): TransitionResult<Pirates3DState> {
    const state: Pirates3DState = structuredClone(ctx.state);
    const now = Date.now();

    // Ensure actor has a ship if they joined mid-match
    if (
      actorPlayerId &&
      !state.ships[actorPlayerId] &&
      ctx.players.some((p) => p.id === actorPlayerId)
    ) {
      const pObj = ctx.players.find((p) => p.id === actorPlayerId)!;
      const idx = Object.keys(state.ships).length;
      const spawn = getHarborSpawnPoint(idx, idx + 1);
      state.ships[actorPlayerId] = {
        id: actorPlayerId,
        nickname: pObj.nickname,
        isBot: false,
        styleIndex: idx % CORSAIR_STYLES.length,
        x: spawn.x,
        z: spawn.z,
        yaw: spawn.yaw,
        speed: 0,
        hp: 100,
        maxHp: 100,
        shield: 20,
        goldScore: 0,
        sinks: 0,
        deaths: 0,
        doublePowderUntil: 0,
        windBoostUntil: 0,
        sunkUntil: 0,
        lastShotAt: 0,
        lastBroadsideAt: 0,
        lastBoostAt: 0,
      };
    }

    if (action.type === "RESTART_BATTLE") {
      const next = buildFreshBattleState(
        ctx.players,
        state.round + 1,
        state.scores,
        state.aiBotsEnabled
      );
      return {
        success: true,
        newState: next,
        newPhase: next.phase,
        newRound: next.round,
      };
    }

    if (action.type === "TOGGLE_AI_BOTS") {
      const nextAi =
        typeof action.enabled === "boolean"
          ? action.enabled
          : !state.aiBotsEnabled;
      const next = buildFreshBattleState(
        ctx.players,
        state.round,
        state.scores,
        nextAi
      );
      return {
        success: true,
        newState: next,
        newPhase: next.phase,
      };
    }

    checkRespawnsAndVictory(state, now);
    if (state.phase === "GAME_OVER") {
      return {
        success: true,
        newState: state,
        newPhase: state.phase,
      };
    }

    const actorShip =
      state.ships[actorPlayerId] ??
      Object.values(state.ships).find((s) => !s.isBot);

    if (action.type === "SYNC_SHIP" && actorShip && actorShip.sunkUntil === 0) {
      const pos = clampToSeaArena(action.x, action.z);
      actorShip.x = pos.x;
      actorShip.z = pos.z;
      actorShip.yaw = Number((action.yaw || 0).toFixed(3));
      actorShip.speed = Number((action.speed || 0).toFixed(2));
      collectNearbyCrates(state, actorShip, now);
      stepAiBots(state, now);
      checkRespawnsAndVictory(state, now);
      return {
        success: true,
        newState: state,
        newPhase: state.phase,
      };
    }

    if (action.type === "WIND_BOOST" && actorShip && actorShip.sunkUntil === 0) {
      if (now - actorShip.lastBoostAt >= 6000) {
        actorShip.lastBoostAt = now;
        actorShip.windBoostUntil = now + 3200;
        actorShip.hp = Math.min(actorShip.maxHp, actorShip.hp + 20);
        addFeed(
          state,
          `⚡ ${actorShip.nickname} أطلق الريح السلطانية (+20 إصلاح وسرعة مضاعفة)!`,
          "loot",
          now
        );
      }
      return {
        success: true,
        newState: state,
        newPhase: state.phase,
      };
    }

    if (
      action.type === "FIRE_CANNON" &&
      actorShip &&
      actorShip.sunkUntil === 0
    ) {
      if (
        typeof action.fromX === "number" &&
        typeof action.fromZ === "number"
      ) {
        const synced = clampToSeaArena(action.fromX, action.fromZ);
        actorShip.x = synced.x;
        actorShip.z = synced.z;
      }
      actorShip.yaw = Number((action.aimYaw || actorShip.yaw).toFixed(3));
      executeCannonFire(
        state,
        actorShip,
        action.mode,
        action.aimYaw,
        action.targetX,
        action.targetZ,
        action.targetShipId,
        now
      );
      checkRespawnsAndVictory(state, now);
      return {
        success: true,
        newState: state,
        newPhase: state.phase,
      };
    }

    if (action.type === "AI_TICK") {
      stepAiBots(state, now);
      checkRespawnsAndVictory(state, now);
      return {
        success: true,
        newState: state,
        newPhase: state.phase,
      };
    }

    return {
      success: true,
      newState: state,
      newPhase: state.phase,
    };
  },

  getPublicView(
    ctx: GameContext<Pirates3DState, Pirates3DSettings>
  ): PublicGameView {
    const s = ctx.state;
    return {
      gameId: PIRATES3D_GAME_ID,
      phase: s.phase,
      round: s.round,
      stateVersion: ctx.stateVersion,
      publicData: {
        phase: s.phase,
        round: s.round,
        startedAt: s.startedAt,
        endsAt: s.endsAt,
        aiBotsEnabled: s.aiBotsEnabled,
        ships: s.ships,
        lootCrates: s.lootCrates,
        recentShots: s.recentShots,
        battleFeed: s.battleFeed,
        winnerId: s.winnerId,
        winnerSummaryAr: s.winnerSummaryAr,
        scores: s.scores,
      },
    };
  },

  getPlayerView(
    ctx: GameContext<Pirates3DState, Pirates3DSettings>,
    playerId: string
  ): PrivatePlayerGameView {
    const s = ctx.state;
    const isHost = Boolean(ctx.players.find((p) => p.id === playerId)?.isHost);
    const myShip = s.ships[playerId];
    return {
      playerId,
      isHost,
      allowedActions: [],
      privateData: {
        isAlive: myShip ? myShip.sunkUntil === 0 : true,
        myShipId: playerId,
        myScore: myShip?.goldScore ?? 0,
      },
    };
  },

  checkFinished(
    ctx: GameContext<Pirates3DState, Pirates3DSettings>
  ): GameEndResult | null {
    if (ctx.state.phase !== "GAME_OVER") return null;
    const scoreboard = Object.values(ctx.state.ships)
      .map((s) => ({
        id: s.id,
        label: s.nickname,
        score: s.goldScore,
      }))
      .sort((a, b) => b.score - a.score);

    return {
      isFinished: true,
      winner: {
        players: ctx.state.winnerId ? [ctx.state.winnerId] : [],
        summary: ctx.state.winnerSummaryAr || "انتهت معركة قراصنة سلا!",
      },
      scoreboard,
    };
  },
};
