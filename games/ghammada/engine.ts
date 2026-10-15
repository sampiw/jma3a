import {
  GameDefinition,
  GameContext,
  ValidationResult,
  TransitionResult,
  GameEndResult,
} from "@/games/registry";
import { Player, PublicGameView, PrivatePlayerGameView } from "@/lib/types";
import {
  GhammadaState,
  GhammadaSettings,
  GhammadaAction,
  GhammadaWorldProp,
  GhammadaPlayerEntity,
  ALL_PROP_IDS,
  GHAMMADA_PROPS,
  GhammadaPropId,
} from "./types";

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateWorldProps(seed: number): GhammadaWorldProp[] {
  const rand = seededRandom(seed);
  const props: GhammadaWorldProp[] = [];

  // Curated anchor clusters across the 4 Moroccan Courtyard quadrants + random scatter
  const clusterCenters = [
    { cx: -9, cz: -9 }, // Café corner (NW)
    { cx: 9, cz: -9 },  // Pottery & Tajine Souk (NE)
    { cx: -9, cz: 9 },  // Butagaz & Crate Alley (SW)
    { cx: 9, cz: 9 },   // Fruit & Lantern Garden (SE)
    { cx: 0, cz: -11 }, // North Archway
    { cx: 0, cz: 11 },  // South Archway
    { cx: -11, cz: 0 }, // West Arcade
    { cx: 11, cz: 0 },  // East Arcade
  ];

  let idx = 0;
  for (const cluster of clusterCenters) {
    for (let i = 0; i < 4; i++) {
      const propId = ALL_PROP_IDS[Math.floor(rand() * ALL_PROP_IDS.length)];
      const angle = rand() * Math.PI * 2;
      const dist = 1.5 + rand() * 3.8;
      const x = Math.max(-15, Math.min(15, Number((cluster.cx + Math.cos(angle) * dist).toFixed(2))));
      const z = Math.max(-15, Math.min(15, Number((cluster.cz + Math.sin(angle) * dist).toFixed(2))));
      const rotY = Number((rand() * Math.PI * 2).toFixed(2));

      props.push({
        id: `wp_${idx++}`,
        propId,
        x,
        z,
        rotY,
        isDestroyed: false,
      });
    }
  }

  return props;
}

function getHunterCount(playerCount: number): number {
  if (playerCount <= 4) return 1;
  if (playerCount <= 8) return 2;
  return 3;
}

function selectHuntersForRound(players: Player[], round: number): string[] {
  const count = getHunterCount(players.length);
  const selected: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = (round - 1 + i) % players.length;
    selected.push(players[idx].id);
  }
  return selected;
}

function createRoundEntities(
  players: Player[],
  hunterIds: string[],
  maxHearts: number,
  seed: number
): Record<string, GhammadaPlayerEntity> {
  const rand = seededRandom(seed + 99);
  const entities: Record<string, GhammadaPlayerEntity> = {};

  players.forEach((p, idx) => {
    const isHunter = hunterIds.includes(p.id);
    const angle = (idx / Math.max(1, players.length)) * Math.PI * 2;
    const spawnRadius = isHunter ? 1.5 : 5.5 + rand() * 3.0;
    const startProp: GhammadaPropId = ALL_PROP_IDS[idx % ALL_PROP_IDS.length];

    entities[p.id] = {
      playerId: p.id,
      role: isHunter ? "HUNTER" : "HIDER",
      x: Number((Math.cos(angle) * spawnRadius).toFixed(2)),
      z: Number((Math.sin(angle) * spawnRadius).toFixed(2)),
      rotY: Number(angle.toFixed(2)),
      propId: startProp,
      isLocked: false,
      isCaught: false,
      hearts: maxHearts,
      tauntCount: 0,
    };
  });

  return entities;
}

function concludeRound(
  state: GhammadaState,
  winner: "HUNTERS" | "HIDERS",
  headline: string,
  summary: string
): TransitionResult<GhammadaState> {
  const next = structuredClone(state);
  next.phase = "ROUND_END";
  next.roundWinner = winner;
  next.roundHeadline = headline;
  next.roundSummary = summary;

  // Award survival bonus (+100 pts) to every uncaught Hider if Hiders won or survived
  for (const ent of Object.values(next.entities)) {
    if (ent.role === "HIDER" && !ent.isCaught) {
      next.scores[ent.playerId] = (next.scores[ent.playerId] || 0) + 100;
    }
  }

  next.feed.unshift({
    id: "feed_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    timestamp: Date.now(),
    text: headline,
    type: "SURVIVE",
  });
  next.feed = next.feed.slice(0, 8);

  return {
    success: true,
    newState: next,
    newPhase: "ROUND_END",
  };
}

export const GhammadaEngine: GameDefinition<GhammadaState, GhammadaAction, GhammadaSettings> = {
  id: "ghammada",
  slug: "ghammada",
  version: 1,
  displayNameKey: "غمّيضة 3D (Ghammada 3D) 📦🔍",
  shortDescriptionKey: "لعبة الغميضة الثلاثية الأبعاد! تحوّل لطاجين، براد، أو بوطاغاز وتخبّى فـ الرياض المغربي 3D قبل ما يشدّك الصياد!",
  minPlayers: 2,
  maxPlayers: 16,
  capabilities: ["MULTI_PHONE", "REALTIME", "SCORES", "TIMERS"],
  defaultSettings: {
    hideDurationSec: 18,
    huntDurationSec: 75,
    maxRounds: 4,
    hunterMaxHearts: 5,
    interactionMode: "MULTI_PHONE",
  },

  validateSetup(players: Player[], _settings: GhammadaSettings): ValidationResult {
    if (players.length < 2) {
      return {
        isValid: false,
        errors: ["خاص على الأقل 2 لاعبين باش تبدا غمّيضة 3D!"],
      };
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: GhammadaSettings): GhammadaState {
    const now = Date.now();
    const seed = Math.floor(Math.random() * 100000) + 1;
    const hideSec = settings.hideDurationSec || 18;
    const maxRounds = Math.max(players.length, settings.maxRounds || 4);
    const hunterIds = selectHuntersForRound(players, 1);
    const scores: Record<string, number> = {};
    for (const p of players) scores[p.id] = 0;

    return {
      phase: "HIDE_PHASE",
      round: 1,
      maxRounds,
      phaseStartedAt: now,
      phaseEndsAt: now + hideSec * 1000,
      mapSeed: seed,
      hunterIds,
      entities: createRoundEntities(players, hunterIds, settings.hunterMaxHearts || 5, seed),
      worldProps: generateWorldProps(seed),
      scores,
      feed: [
        {
          id: "start_1",
          timestamp: now,
          text: "🙈 بدات الغمّيضة! المتخبيين عندهم 18 ثانية باش يتحولو لأشياء ويتخباو فـ الرياض!",
          type: "SURVIVE",
        },
      ],
    };
  },

  start(ctx: GameContext<GhammadaState, GhammadaSettings>): TransitionResult<GhammadaState> {
    return {
      success: true,
      newState: ctx.state,
      newPhase: ctx.state.phase,
    };
  },

  handleAction(
    ctx: GameContext<GhammadaState, GhammadaSettings>,
    actorPlayerId: string,
    action: GhammadaAction
  ): TransitionResult<GhammadaState> {
    const state = structuredClone(ctx.state);
    const now = Date.now();
    const actorEntity = state.entities[actorPlayerId];
    const getNick = (id: string) => ctx.players.find((p) => p.id === id)?.nickname || "لاعب";

    // Auto-check phase timer expiration on any incoming packet
    if (state.phase === "HIDE_PHASE" && now >= state.phaseEndsAt) {
      state.phase = "HUNT_PHASE";
      state.phaseStartedAt = now;
      state.phaseEndsAt = now + (ctx.settings.huntDurationSec || 75) * 1000;
      state.feed.unshift({
        id: "hunt_" + now,
        timestamp: now,
        text: "🔨 تفتح القفص! الصياد خرج كيقلّب فـ الرياض — ثبّتو راسكم!",
        type: "CATCH",
      });
    } else if (state.phase === "HUNT_PHASE" && now >= state.phaseEndsAt) {
      return concludeRound(
        state,
        "HIDERS",
        "⏰ سالا الوقت! المتخبيين دارو قالب واعر للصيادين! 📦🏆",
        "حتى واحد ما قدر يكشف بلاصتهم قبل ما تصفر الساعة!"
      );
    }

    switch (action.type) {
      case "START_HUNT": {
        if (state.phase === "HIDE_PHASE") {
          state.phase = "HUNT_PHASE";
          state.phaseStartedAt = now;
          state.phaseEndsAt = now + (ctx.settings.huntDurationSec || 75) * 1000;
          state.feed.unshift({
            id: "hunt_" + now,
            timestamp: now,
            text: "🔨 تفتح القفص! الصياد خرج كيقلّب فـ الرياض!",
            type: "CATCH",
          });
        }
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "TIME_UP": {
        if (state.phase === "HIDE_PHASE") {
          state.phase = "HUNT_PHASE";
          state.phaseStartedAt = now;
          state.phaseEndsAt = now + (ctx.settings.huntDurationSec || 75) * 1000;
          return { success: true, newState: state, newPhase: "HUNT_PHASE" };
        }
        if (state.phase === "HUNT_PHASE") {
          return concludeRound(
            state,
            "HIDERS",
            "⏰ سالا الوقت! المتخبيين نجاو بذكاء خارق! 📦🎉",
            "الصيادين ما قدروش يكشفو گاع المتخبيين فالوقت المحدد!"
          );
        }
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "SYNC_POS": {
        if (!actorEntity || actorEntity.isCaught) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        // Hunters stay inside the center cage during HIDE_PHASE
        if (actorEntity.role === "HUNTER" && state.phase === "HIDE_PHASE") {
          return { success: true, newState: state, newPhase: state.phase };
        }

        actorEntity.x = Math.max(-16.2, Math.min(16.2, Number(action.x.toFixed(2))));
        actorEntity.z = Math.max(-16.2, Math.min(16.2, Number(action.z.toFixed(2))));
        actorEntity.rotY = Number((action.rotY || 0).toFixed(2));
        if (action.propId && GHAMMADA_PROPS[action.propId]) {
          actorEntity.propId = action.propId;
        }
        if (typeof action.isLocked === "boolean") {
          actorEntity.isLocked = action.isLocked;
        }

        return { success: true, newState: state, newPhase: state.phase };
      }

      case "MORPH_PROP": {
        if (!actorEntity || actorEntity.role !== "HIDER" || actorEntity.isCaught) {
          return { success: false, newState: state, newPhase: state.phase, error: "غير المتخبي لي يقدر يبدل الشكل" };
        }
        if (GHAMMADA_PROPS[action.propId]) {
          actorEntity.propId = action.propId;
        }
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "TOGGLE_LOCK": {
        if (!actorEntity || actorEntity.role !== "HIDER" || actorEntity.isCaught) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        actorEntity.isLocked = action.isLocked;
        if (typeof action.x === "number") actorEntity.x = Math.max(-16.2, Math.min(16.2, Number(action.x.toFixed(2))));
        if (typeof action.z === "number") actorEntity.z = Math.max(-16.2, Math.min(16.2, Number(action.z.toFixed(2))));
        if (typeof action.rotY === "number") actorEntity.rotY = Number(action.rotY.toFixed(2));
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "SMOKE_DASH": {
        if (!actorEntity || actorEntity.role !== "HIDER" || actorEntity.isCaught) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        actorEntity.x = Math.max(-16.2, Math.min(16.2, Number(action.x.toFixed(2))));
        actorEntity.z = Math.max(-16.2, Math.min(16.2, Number(action.z.toFixed(2))));
        actorEntity.rotY = Number(action.rotY.toFixed(2));
        actorEntity.isLocked = false;
        actorEntity.lastDashAt = now;
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "TAUNT_WHISTLE": {
        if (!actorEntity || actorEntity.role !== "HIDER" || actorEntity.isCaught) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        if (state.phase !== "HUNT_PHASE") {
          return { success: false, newState: state, newPhase: state.phase, error: "تسنى حتى يخرج الصياد عاد صفّر عليه!" };
        }
        // Cooldown check (4 seconds)
        if (actorEntity.lastTauntAt && now - actorEntity.lastTauntAt < 4000) {
          return { success: true, newState: state, newPhase: state.phase };
        }

        actorEntity.x = Math.max(-16.2, Math.min(16.2, Number(action.x.toFixed(2))));
        actorEntity.z = Math.max(-16.2, Math.min(16.2, Number(action.z.toFixed(2))));
        actorEntity.lastTauntAt = now;
        actorEntity.tauntCount += 1;
        state.scores[actorPlayerId] = (state.scores[actorPlayerId] || 0) + 30;

        state.feed.unshift({
          id: "taunt_" + now + "_" + actorPlayerId,
          timestamp: now,
          text: `😗🔊 ${getNick(actorPlayerId)} صفّر وتحدّى الصياد! (+30 نقطة شجاعة)`,
          type: "TAUNT",
        });
        state.feed = state.feed.slice(0, 8);

        return { success: true, newState: state, newPhase: state.phase };
      }

      case "HUNTER_STRIKE": {
        if (!actorEntity || actorEntity.role !== "HUNTER") {
          return { success: false, newState: state, newPhase: state.phase, error: "غير الصياد لي يقدر يضرب بالمطرقة" };
        }
        if (state.phase !== "HUNT_PHASE") {
          return { success: false, newState: state, newPhase: state.phase, error: "مازال ما بداتش مرحلة الصيد" };
        }
        if (actorEntity.hearts <= 0) {
          return { success: false, newState: state, newPhase: state.phase, error: "ساليو ليك القلوب ❤️!" };
        }

        actorEntity.x = Math.max(-16.2, Math.min(16.2, Number(action.x.toFixed(2))));
        actorEntity.z = Math.max(-16.2, Math.min(16.2, Number(action.z.toFixed(2))));
        actorEntity.rotY = Number(action.rotY.toFixed(2));
        actorEntity.lastStrikeAt = now;

        const STRIKE_RADIUS = 3.1;
        const caughtHiders: GhammadaPlayerEntity[] = [];

        for (const ent of Object.values(state.entities)) {
          if (ent.role === "HIDER" && !ent.isCaught) {
            const dist = Math.hypot(ent.x - actorEntity.x, ent.z - actorEntity.z);
            if (dist <= STRIKE_RADIUS) {
              caughtHiders.push(ent);
            }
          }
        }

        if (caughtHiders.length > 0) {
          for (const hider of caughtHiders) {
            hider.isCaught = true;
            hider.caughtBy = actorPlayerId;
            state.scores[actorPlayerId] = (state.scores[actorPlayerId] || 0) + 120;
            const propName = GHAMMADA_PROPS[hider.propId]?.name || "شي حاجة";
            state.feed.unshift({
              id: "catch_" + now + "_" + hider.playerId,
              timestamp: now,
              text: `💥🔨 ${getNick(actorPlayerId)} شدّ ${getNick(hider.playerId)} متخبي فـ ${propName}! (+120 ن)`,
              type: "CATCH",
            });
          }
          state.feed = state.feed.slice(0, 8);

          // Check if all hiders are now caught
          const remainingHiders = Object.values(state.entities).filter(
            (e) => e.role === "HIDER" && !e.isCaught
          );
          if (remainingHiders.length === 0) {
            return concludeRound(
              state,
              "HUNTERS",
              "🎯 الصيادين كشفو گاع المتخبيين! برافو! 🔨🔥",
              `تم كشف آخر متخبي قبل نهاية الوقت!`
            );
          }

          return { success: true, newState: state, newPhase: state.phase };
        } else {
          // Missed! Check if a world prop was hit and shatter it
          let shatteredProp: GhammadaWorldProp | null = null;
          for (const wp of state.worldProps) {
            if (!wp.isDestroyed) {
              const d = Math.hypot(wp.x - actorEntity.x, wp.z - actorEntity.z);
              if (d <= 2.6) {
                wp.isDestroyed = true;
                shatteredProp = wp;
                break;
              }
            }
          }

          actorEntity.hearts = Math.max(0, actorEntity.hearts - 1);
          const propLabel = shatteredProp
            ? GHAMMADA_PROPS[shatteredProp.propId]?.name
            : "الخوا";

          state.feed.unshift({
            id: "miss_" + now + "_" + actorPlayerId,
            timestamp: now,
            text: `❌💔 ${getNick(actorPlayerId)} ضرب ${propLabel} وخسر قلب! (باقي ${actorEntity.hearts} ❤️)`,
            type: "MISS",
          });
          state.feed = state.feed.slice(0, 8);

          // Check if all Hunters ran out of hearts
          const aliveHunters = Object.values(state.entities).filter(
            (e) => e.role === "HUNTER" && e.hearts > 0
          );
          if (aliveHunters.length === 0) {
            return concludeRound(
              state,
              "HIDERS",
              "📦😂 الصيادين هرّسو غير الماعن وساليو ليهم القلوب! فوز المتخبيين!",
              "المتخبيين دوّخو الصيادين مزيان فهاد الجولة!"
            );
          }

          return { success: true, newState: state, newPhase: state.phase };
        }
      }

      case "NEXT_ROUND": {
        if (state.phase !== "ROUND_END") {
          return { success: true, newState: state, newPhase: state.phase };
        }

        if (state.round >= state.maxRounds) {
          const sorted = [...ctx.players].sort(
            (a, b) => (state.scores[b.id] || 0) - (state.scores[a.id] || 0)
          );
          state.winnerId = sorted[0]?.id;
          state.phase = "GAME_OVER";
          return { success: true, newState: state, newPhase: "GAME_OVER" };
        }

        const nextRound = state.round + 1;
        const nextSeed = state.mapSeed + nextRound * 7919;
        const nextHunters = selectHuntersForRound(ctx.players, nextRound);
        const hideSec = ctx.settings.hideDurationSec || 18;

        state.round = nextRound;
        state.phase = "HIDE_PHASE";
        state.phaseStartedAt = now;
        state.phaseEndsAt = now + hideSec * 1000;
        state.mapSeed = nextSeed;
        state.hunterIds = nextHunters;
        state.entities = createRoundEntities(
          ctx.players,
          nextHunters,
          ctx.settings.hunterMaxHearts || 5,
          nextSeed
        );
        state.worldProps = generateWorldProps(nextSeed);
        state.roundWinner = undefined;
        state.roundHeadline = undefined;
        state.roundSummary = undefined;
        state.feed = [
          {
            id: "round_" + nextRound,
            timestamp: now,
            text: `🙈 الجولة ${nextRound} بدات! تبدلو الأدوار — تخبّاو دغيا!`,
            type: "SURVIVE",
          },
        ];

        return {
          success: true,
          newState: state,
          newPhase: "HIDE_PHASE",
          newRound: nextRound,
        };
      }

      case "RESTART_GAME": {
        const fresh = this.createInitialState(ctx.players, ctx.settings);
        return {
          success: true,
          newState: fresh,
          newPhase: fresh.phase,
          newRound: 1,
        };
      }

      default:
        return { success: true, newState: state, newPhase: state.phase };
    }
  },

  getPublicView(ctx: GameContext<GhammadaState, GhammadaSettings>): PublicGameView {
    const { state } = ctx;
    return {
      gameId: "ghammada",
      phase: state.phase,
      round: state.round,
      stateVersion: ctx.stateVersion,
      publicData: {
        phase: state.phase,
        round: state.round,
        maxRounds: state.maxRounds,
        phaseStartedAt: state.phaseStartedAt,
        phaseEndsAt: state.phaseEndsAt,
        hunterIds: state.hunterIds,
        entities: state.entities,
        worldProps: state.worldProps,
        scores: state.scores,
        feed: state.feed,
        roundWinner: state.roundWinner,
        roundHeadline: state.roundHeadline,
        roundSummary: state.roundSummary,
        winnerId: state.winnerId,
      },
    };
  },

  getPlayerView(
    ctx: GameContext<GhammadaState, GhammadaSettings>,
    playerId: string
  ): PrivatePlayerGameView {
    const { state } = ctx;
    const myEntity = state.entities[playerId];
    const isHost = ctx.players.find((p) => p.id === playerId)?.isHost ?? false;

    return {
      playerId,
      isHost,
      myRole: myEntity?.role || "HIDER",
      privateData: {
        myEntity: myEntity || null,
        myScore: state.scores[playerId] || 0,
      },
      allowedActions: [
        "SYNC_POS",
        "MORPH_PROP",
        "TOGGLE_LOCK",
        "SMOKE_DASH",
        "TAUNT_WHISTLE",
        "HUNTER_STRIKE",
        "START_HUNT",
        "TIME_UP",
        "NEXT_ROUND",
        "RESTART_GAME",
      ],
    };
  },

  checkFinished(ctx: GameContext<GhammadaState, GhammadaSettings>): GameEndResult | null {
    if (ctx.state.phase !== "GAME_OVER") return null;
    const winnerPlayer = ctx.players.find((p) => p.id === ctx.state.winnerId);
    const scoreboard = ctx.players
      .map((p) => ({
        id: p.id,
        label: p.nickname,
        score: ctx.state.scores[p.id] || 0,
      }))
      .sort((a, b) => b.score - a.score);

    return {
      isFinished: true,
      winner: {
        players: ctx.state.winnerId ? [ctx.state.winnerId] : [],
        summary: `فاز ${winnerPlayer?.nickname || "البطل"} بلعبة غمّيضة 3D! 📦🏆`,
      },
      scoreboard,
    };
  },
};
