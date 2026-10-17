import {
  GameContext,
  GameDefinition,
  GameEndResult,
  TransitionResult,
  ValidationResult,
} from "@/games/registry";
import {
  Player,
  PrivatePlayerGameView,
  PublicGameView,
} from "@/lib/types";
import {
  RIYAD3D_ARENA_HALF,
  RIYAD3D_GAME_ID,
  RIYAD3D_HIDING_SPOTS,
  RIYAD3D_MAX_PLAYERS,
  RIYAD3D_MIN_PLAYERS,
  RIYAD3D_ROUND_SECONDS,
  RIYAD3D_TREASURE_TEMPLATES,
  Riyad3DAction,
  Riyad3DFeedEvent,
  Riyad3DPlayerState,
  Riyad3DSettings,
  Riyad3DState,
  Riyad3DTreasureItem,
} from "./types";

const SPAWN_OFFSETS: Array<{ x: number; z: number }> = [
  { x: -3.5, z: 23.5 },
  { x: 3.5, z: 23.5 },
  { x: -6.5, z: 24.5 },
  { x: 6.5, z: 24.5 },
  { x: -2.0, z: 21.0 },
  { x: 2.0, z: 21.0 },
  { x: -5.0, z: 21.0 },
  { x: 5.0, z: 21.0 },
];

function clampCoord(val: number): number {
  const limit = RIYAD3D_ARENA_HALF - 2.5;
  if (!Number.isFinite(val)) return 0;
  return Math.max(-limit, Math.min(limit, Number(val.toFixed(1))));
}

function getPlayerLabel(p: Player): string {
  return p.nickname || (p as unknown as { name?: string }).name || "لص الرياض";
}

function buildInitialTreasures(round: number): Riyad3DTreasureItem[] {
  return RIYAD3D_TREASURE_TEMPLATES.map((tpl, idx) => {
    const offsetAngle = ((round * 3 + idx * 5) % 8) * (Math.PI / 4);
    const jitterX = Math.round(Math.cos(offsetAngle) * 1.2 * 10) / 10;
    const jitterZ = Math.round(Math.sin(offsetAngle) * 1.2 * 10) / 10;

    return {
      id: tpl.id,
      titleAr: tpl.titleAr,
      emoji: tpl.emoji,
      propKind: tpl.propKind,
      weight: tpl.weight,
      maxValueDh: tpl.maxValueDh,
      currentValueDh: tpl.maxValueDh,
      durability: 100,
      x: clampCoord(tpl.x + jitterX),
      z: clampCoord(tpl.z + jitterZ),
      carriedByPlayerId: null,
      status: "available",
      lastDamageText: null,
    };
  });
}

function appendFeedEvent(
  events: Riyad3DFeedEvent[],
  type: Riyad3DFeedEvent["type"],
  textAr: string,
  nowIso: string
): Riyad3DFeedEvent[] {
  const next: Riyad3DFeedEvent = {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    textAr,
    createdAt: nowIso,
  };
  return [next, ...events].slice(0, 8);
}

function buildRoundState(
  players: Player[],
  round: number,
  existingScores?: Record<string, number>,
  roundSeconds = RIYAD3D_ROUND_SECONDS
): Riyad3DState {
  const nowMs = Date.now();
  const startedAt = new Date(nowMs).toISOString();
  const endsAt = new Date(nowMs + roundSeconds * 1000).toISOString();

  const scores: Record<string, number> = { ...(existingScores ?? {}) };
  for (const p of players) {
    if (typeof scores[p.id] !== "number") {
      scores[p.id] = 0;
    }
  }

  const quotaDh = Math.min(8500, 3500 + players.length * 900);

  const playerStates: Riyad3DPlayerState[] = players.map((p, idx) => {
    const sp = SPAWN_OFFSETS[idx % SPAWN_OFFSETS.length];
    return {
      id: p.id,
      name: getPlayerLabel(p),
      extractedDh: 0,
      extractedCount: 0,
      shatteredCount: 0,
      shovesDealt: 0,
      timesCaughtByMonster: 0,
      carryingLootId: null,
      hiddenSpotId: null,
      stunnedUntilAt: null,
      shoveCooldownUntilAt: null,
      spawnX: sp.x,
      spawnZ: sp.z,
    };
  });

  const treasures = buildInitialTreasures(round);

  return {
    phase: "active",
    round,
    startedAt,
    endsAt,
    quotaDh,
    totalExtractedDh: 0,
    players: playerStates,
    treasures,
    recentEvents: [
      {
        id: `start_${round}_${nowMs}`,
        type: "pickup",
        textAr: `🚐 وصلت سطافيط الهوندا لباب الرياض! خاصكم تجمّعو ${quotaDh} درهم قبل ما يسالي الوقت!`,
        createdAt: startedAt,
      },
    ],
    lastMonsterAlert: null,
    winnerId: null,
    winReasonAr: null,
    quotaReached: false,
    scores,
  };
}

function finalizeRound(state: Riyad3DState, reasonPrefixAr: string): Riyad3DState {
  if (state.phase === "finished") return state;

  const sortedPlayers = [...state.players].sort((a, b) => {
    if (b.extractedDh !== a.extractedDh) return b.extractedDh - a.extractedDh;
    return b.extractedCount - a.extractedCount;
  });

  const topThief = sortedPlayers[0] ?? null;
  const quotaReached = state.totalExtractedDh >= state.quotaDh;

  const nextScores: Record<string, number> = { ...state.scores };
  for (const p of state.players) {
    nextScores[p.id] = (nextScores[p.id] ?? 0) + p.extractedDh;
  }

  let winReasonAr = reasonPrefixAr;
  if (topThief && topThief.extractedDh > 0) {
    if (quotaReached) {
      winReasonAr = `🎉 سرقة أسطورية! جمعتو ${state.totalExtractedDh} DH (الهدف ${state.quotaDh} DH) — زعيم الشفارة هو ${topThief.name} بـ ${topThief.extractedDh} DH!`;
    } else {
      winReasonAr = `🚐 هربت الهوندا بـ ${state.totalExtractedDh} DH! أكبر شفّار فـ الجولة هو ${topThief.name} بـ ${topThief.extractedDh} DH!`;
    }
  } else {
    winReasonAr = `👹 الرياض المسكون غلبكم! حتى واحد ما قدر يهرّب الكنوز لسطافيط الهوندا!`;
  }

  return {
    ...state,
    phase: "finished",
    winnerId: topThief && topThief.extractedDh > 0 ? topThief.id : null,
    winReasonAr,
    quotaReached,
    scores: nextScores,
  };
}

function evaluateRoundEndIfComplete(state: Riyad3DState): Riyad3DState {
  if (state.phase === "finished") return state;

  const activeTreasures = state.treasures.filter(
    (t) => t.status === "available" || t.status === "carried"
  );

  if (activeTreasures.length > 0) {
    return state;
  }

  return finalizeRound(state, "كل الكنوز فـ الرياض تهرّبت أو تهرّسات!");
}

export const Riyad3DEngine: GameDefinition<
  Riyad3DState,
  Riyad3DAction,
  Riyad3DSettings
> = {
  id: RIYAD3D_GAME_ID,
  slug: RIYAD3D_GAME_ID,
  version: 1,
  displayNameKey: "🏺 سرقة الرياض المسكون 3D (R.E.P.O. Marocain)",
  shortDescriptionKey:
    "سرق الكنوز الغالية من الرياض المظلم وحطّها فـ سطافيط الهوندا بلا ما تهرّسها، تخبّا تحت الطبلة من الغول، أو دْفَع صاحبك وسرق ليه الكنز!",
  minPlayers: RIYAD3D_MIN_PLAYERS,
  maxPlayers: RIYAD3D_MAX_PLAYERS,
  capabilities: ["MULTI_PHONE", "REALTIME", "SCORES", "TIMERS"],
  defaultSettings: {
    roundSeconds: RIYAD3D_ROUND_SECONDS,
    interactionMode: "MULTI_PHONE",
  },

  validateSetup(players: Player[]): ValidationResult {
    if (players.length < RIYAD3D_MIN_PLAYERS) {
      return {
        isValid: false,
        errors: ["خاص على الأقل 2 لاعبين باش تبداو سرقة الرياض المسكون 3D!"],
      };
    }
    return { isValid: true };
  },

  createInitialState(
    players: Player[],
    settings?: Riyad3DSettings
  ): Riyad3DState {
    return buildRoundState(
      players,
      1,
      {},
      settings?.roundSeconds ?? RIYAD3D_ROUND_SECONDS
    );
  },

  start(
    ctx: GameContext<Riyad3DState, Riyad3DSettings>
  ): TransitionResult<Riyad3DState> {
    const state = this.createInitialState(ctx.players, ctx.settings);
    return {
      success: true,
      newState: state,
      newPhase: state.phase,
      newRound: 1,
    };
  },

  handleAction(
    ctx: GameContext<Riyad3DState, Riyad3DSettings>,
    actorPlayerId: string,
    action: Riyad3DAction
  ): TransitionResult<Riyad3DState> {
    const state: Riyad3DState = structuredClone(ctx.state);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (action.type === "RESTART_GAME") {
      const next = buildRoundState(
        ctx.players,
        state.round + 1,
        state.scores,
        ctx.settings?.roundSeconds ?? RIYAD3D_ROUND_SECONDS
      );
      return {
        success: true,
        newState: next,
        newPhase: next.phase,
        newRound: next.round,
      };
    }

    if (state.phase === "finished") {
      return { success: true, newState: state, newPhase: state.phase };
    }

    if (action.type === "TIMEOUT_ROUND") {
      const finished = finalizeRound(
        state,
        "⏰ سالا الوقت وهربت سطافيط الهوندا!"
      );
      return {
        success: true,
        newState: finished,
        newPhase: finished.phase,
      };
    }

    const actor = state.players.find((p) => p.id === actorPlayerId);
    if (!actor) {
      return {
        success: false,
        newState: state,
        newPhase: state.phase,
        error: "أنت لست ضمن لاعبي هذه الغرفة",
      };
    }

    switch (action.type) {
      case "PICKUP_LOOT": {
        if (actor.carryingLootId || actor.hiddenSpotId) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const targetLoot = state.treasures.find(
          (t) => t.id === action.lootId && t.status === "available"
        );
        if (!targetLoot) {
          return { success: true, newState: state, newPhase: state.phase };
        }

        targetLoot.status = "carried";
        targetLoot.carriedByPlayerId = actor.id;
        targetLoot.lastDamageText = null;
        actor.carryingLootId = targetLoot.id;
        actor.hiddenSpotId = null;

        return { success: true, newState: state, newPhase: state.phase };
      }

      case "DROP_LOOT": {
        if (!actor.carryingLootId) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const loot = state.treasures.find((t) => t.id === actor.carryingLootId);
        if (loot) {
          loot.status = "available";
          loot.carriedByPlayerId = null;
          loot.x = clampCoord(action.x);
          loot.z = clampCoord(action.z);
        }
        actor.carryingLootId = null;
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "DAMAGE_CARRIED_LOOT": {
        if (!actor.carryingLootId) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const loot = state.treasures.find((t) => t.id === actor.carryingLootId);
        if (!loot) {
          return { success: true, newState: state, newPhase: state.phase };
        }

        const dmg = Math.max(10, Math.min(60, Math.round(action.damagePercent)));
        const nextDurability = Math.max(0, loot.durability - dmg);

        if (nextDurability <= 0) {
          loot.durability = 0;
          loot.currentValueDh = 0;
          loot.carriedByPlayerId = null;
          loot.status = "shattered";
          loot.lastDamageText = "💔 تهرّس الكنز بالكامل! (0 درهم)";
          actor.carryingLootId = null;
          actor.shatteredCount += 1;

          state.recentEvents = appendFeedEvent(
            state.recentEvents,
            "shatter",
            `💔💥 ${actor.name} هرّس "${loot.emoji} ${loot.titleAr}" كامل! مشات ${loot.maxValueDh} درهم فـ الخوا والغول سمع الصداع!`,
            nowIso
          );
          state.lastMonsterAlert = {
            id: `alert_${nowMs}`,
            targetPlayerId: actor.id,
            targetPlayerName: actor.name,
            x: clampCoord(action.x ?? loot.x),
            z: clampCoord(action.z ?? loot.z),
            createdAt: nowIso,
          };

          const checked = evaluateRoundEndIfComplete(state);
          return {
            success: true,
            newState: checked,
            newPhase: checked.phase,
          };
        }

        const nextValueDh = Math.max(
          100,
          Math.round((loot.maxValueDh * (nextDurability / 100)) / 10) * 10
        );
        const lostDh = loot.currentValueDh - nextValueDh;

        loot.durability = nextDurability;
        loot.currentValueDh = nextValueDh;
        loot.lastDamageText = `💥 تشقّق الكنز! (-${lostDh} DH)`;

        state.recentEvents = appendFeedEvent(
          state.recentEvents,
          "crack",
          `💥 ${actor.name} زدح "${loot.emoji} ${loot.titleAr}" مع الحيط! ضاعت -${lostDh} DH (بقات ${nextValueDh} DH)`,
          nowIso
        );

        return { success: true, newState: state, newPhase: state.phase };
      }

      case "EXTRACT_LOOT": {
        if (!actor.carryingLootId) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const loot = state.treasures.find((t) => t.id === actor.carryingLootId);
        if (!loot) {
          return { success: true, newState: state, newPhase: state.phase };
        }

        const earnedDh = loot.currentValueDh;
        loot.carriedByPlayerId = null;
        loot.status = "extracted";

        actor.carryingLootId = null;
        actor.extractedDh += earnedDh;
        actor.extractedCount += 1;

        state.totalExtractedDh += earnedDh;
        state.quotaReached = state.totalExtractedDh >= state.quotaDh;

        state.recentEvents = appendFeedEvent(
          state.recentEvents,
          "extract",
          `🚐💰 ${actor.name} حطّ "${loot.emoji} ${loot.titleAr}" فـ الهوندا وربح +${earnedDh} درهم!`,
          nowIso
        );

        const checked = evaluateRoundEndIfComplete(state);
        return {
          success: true,
          newState: checked,
          newPhase: checked.phase,
        };
      }

      case "TOGGLE_HIDE": {
        if (action.spotId !== null) {
          const spot = RIYAD3D_HIDING_SPOTS.find((s) => s.id === action.spotId);
          if (!spot) {
            return { success: true, newState: state, newPhase: state.phase };
          }
          if (actor.carryingLootId) {
            const loot = state.treasures.find(
              (t) => t.id === actor.carryingLootId
            );
            if (loot) {
              loot.status = "available";
              loot.carriedByPlayerId = null;
              loot.x = clampCoord(spot.x + 1.2);
              loot.z = clampCoord(spot.z + 1.2);
            }
            actor.carryingLootId = null;
          }
          actor.hiddenSpotId = spot.id;
        } else {
          actor.hiddenSpotId = null;
        }

        return { success: true, newState: state, newPhase: state.phase };
      }

      case "SHOVE_PLAYER": {
        if (action.targetPlayerId === actor.id) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const target = state.players.find(
          (p) => p.id === action.targetPlayerId
        );
        if (!target) {
          return { success: true, newState: state, newPhase: state.phase };
        }

        const dropX = clampCoord(action.dropX);
        const dropZ = clampCoord(action.dropZ);
        let eventText = `🤚😂 ${actor.name} دْفَع ${target.name} وقلّبو فـ الظلام!`;

        if (target.carryingLootId) {
          const loot = state.treasures.find(
            (t) => t.id === target.carryingLootId
          );
          if (loot) {
            const nextDurability = Math.max(15, loot.durability - 20);
            const nextValueDh = Math.max(
              100,
              Math.round((loot.maxValueDh * (nextDurability / 100)) / 10) * 10
            );
            loot.status = "available";
            loot.carriedByPlayerId = null;
            loot.durability = nextDurability;
            loot.currentValueDh = nextValueDh;
            loot.x = dropX;
            loot.z = dropZ;
            loot.lastDamageText = `🤚 طاح الكنز بالدّفعة! (-20%)`;
            eventText = `🤚💎 غدرة ديال المعقول! ${actor.name} دْفَع ${target.name} وطيّح ليه "${loot.emoji} ${loot.titleAr}"!`;
          }
        }

        actor.shovesDealt += 1;
        actor.shoveCooldownUntilAt = nowMs + 8000;

        target.carryingLootId = null;
        target.hiddenSpotId = null;
        target.stunnedUntilAt = nowMs + 2200;

        state.recentEvents = appendFeedEvent(
          state.recentEvents,
          "shove",
          eventText,
          nowIso
        );

        return { success: true, newState: state, newPhase: state.phase };
      }

      case "MONSTER_STRIKE": {
        const target = state.players.find(
          (p) => p.id === action.targetPlayerId
        );
        if (!target || target.hiddenSpotId) {
          return { success: true, newState: state, newPhase: state.phase };
        }

        const dropX = clampCoord(action.dropX);
        const dropZ = clampCoord(action.dropZ);
        let lootPenaltyText = "";

        if (target.carryingLootId) {
          const loot = state.treasures.find(
            (t) => t.id === target.carryingLootId
          );
          if (loot) {
            const nextDurability = Math.max(10, loot.durability - 25);
            const nextValueDh = Math.max(
              100,
              Math.round((loot.maxValueDh * (nextDurability / 100)) / 10) * 10
            );
            loot.status = "available";
            loot.carriedByPlayerId = null;
            loot.durability = nextDurability;
            loot.currentValueDh = nextValueDh;
            loot.x = dropX;
            loot.z = dropZ;
            loot.lastDamageText = "👹 طاح الكنز من خلعة الغول!";
            lootPenaltyText = ` وطاح من يدو "${loot.emoji} ${loot.titleAr}"`;
          }
        }

        const penaltyDh = Math.min(target.extractedDh, 150);
        target.carryingLootId = null;
        target.hiddenSpotId = null;
        target.extractedDh = Math.max(0, target.extractedDh - penaltyDh);
        target.timesCaughtByMonster += 1;
        target.stunnedUntilAt = nowMs + 2600;

        state.totalExtractedDh = Math.max(
          0,
          state.totalExtractedDh - penaltyDh
        );

        state.recentEvents = appendFeedEvent(
          state.recentEvents,
          "monster_attack",
          `👹💥 الغول شدّ ${target.name} فـ الظلام${lootPenaltyText}!`,
          nowIso
        );

        return { success: true, newState: state, newPhase: state.phase };
      }

      default:
        return { success: true, newState: state, newPhase: state.phase };
    }
  },

  getPublicView(
    ctx: GameContext<Riyad3DState, Riyad3DSettings>
  ): PublicGameView {
    const s = ctx.state;
    return {
      gameId: RIYAD3D_GAME_ID,
      phase: s.phase,
      round: s.round,
      stateVersion: ctx.stateVersion,
      publicData: {
        phase: s.phase,
        round: s.round,
        startedAt: s.startedAt,
        endsAt: s.endsAt,
        quotaDh: s.quotaDh,
        totalExtractedDh: s.totalExtractedDh,
        quotaReached: s.quotaReached,
        players: s.players,
        treasures: s.treasures,
        recentEvents: s.recentEvents,
        lastMonsterAlert: s.lastMonsterAlert,
        winnerId: s.winnerId,
        winReasonAr: s.winReasonAr,
        scores: s.scores,
      },
    };
  },

  getPlayerView(
    ctx: GameContext<Riyad3DState, Riyad3DSettings>,
    playerId: string
  ): PrivatePlayerGameView {
    const s = ctx.state;
    const isHost = Boolean(ctx.players.find((p) => p.id === playerId)?.isHost);
    const me = s.players.find((p) => p.id === playerId) ?? null;
    const myCarriedLoot = me?.carryingLootId
      ? s.treasures.find((t) => t.id === me.carryingLootId) ?? null
      : null;

    return {
      playerId,
      isHost,
      allowedActions: [],
      privateData: {
        isAlive: true,
        me,
        myCarriedLoot,
        myScore: s.scores[playerId] ?? 0,
      },
    };
  },

  checkFinished(
    ctx: GameContext<Riyad3DState, Riyad3DSettings>
  ): GameEndResult | null {
    if (ctx.state.phase !== "finished") return null;
    const scoreboard = ctx.players
      .map((p) => ({
        id: p.id,
        label: getPlayerLabel(p),
        score: ctx.state.scores[p.id] ?? 0,
      }))
      .sort((a, b) => b.score - a.score);

    return {
      isFinished: true,
      winner: {
        players: ctx.state.winnerId ? [ctx.state.winnerId] : [],
        summary: ctx.state.winReasonAr || "سالات سرقة الرياض المسكون!",
      },
      scoreboard,
    };
  },
};
