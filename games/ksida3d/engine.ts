import {
  GameContext,
  GameDefinition,
  GameEndResult,
  TransitionResult,
  ValidationResult,
} from "@/games/registry";
import { Player, PrivatePlayerGameView, PublicGameView } from "@/lib/types";
import { createKsidaBots } from "./ai";
import { createInitialCratePads, getSpawnSlots } from "./trackLayout";
import {
  KSIDA_VEHICLE_ORDER,
  KSIDA_VEHICLES,
  KsidaAction,
  KsidaAwardBadge,
  KsidaMode,
  KsidaRacer,
  KsidaSettings,
  KsidaState,
  RACER_ACCENT_PALETTE,
} from "./types";

export const COUNTDOWN_DURATION_MS = 4000; // 3.. 2.. 1.. ديماري!

export const DEFAULT_KSIDA_SETTINGS: KsidaSettings = {
  mode: "RACE",
  botFill: false, // Solo = 5 hilarious Moroccan bots automatically; 2+ humans = pure PvP unless toggled ON!
  targetLaps: 3,
  targetDerbyScore: 250,
  matchDurationSec: 300,
};

export function buildHumanRacer(
  p: Player,
  idx: number,
  settings: KsidaSettings
): KsidaRacer {
  const slots = getSpawnSlots(settings.mode);
  const sp = slots[idx % slots.length];
  const vehicle = KSIDA_VEHICLE_ORDER[idx % KSIDA_VEHICLE_ORDER.length];
  const spec = KSIDA_VEHICLES[vehicle];
  const accentHex = RACER_ACCENT_PALETTE[idx % RACER_ACCENT_PALETTE.length];

  return {
    id: p.id,
    nickname: p.nickname,
    isBot: false,
    vehicle,
    accentHex,
    x: sp.x,
    y: sp.y,
    z: sp.z,
    vx: 0,
    vz: 0,
    yaw: sp.yaw,
    speed: 0,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    nitro: 65,
    isAlive: true,
    respawnAt: 0,
    heldItem: null,
    atayUntil: 0,
    spinUntil: 0,
    shieldUntil: Date.now() + COUNTDOWN_DURATION_MS + 2500,
    lap: 1,
    nextCheckpoint: 1,
    trackProgress: 0,
    finishedAt: 0,
    score: 0,
    takedowns: 0,
    wrecksTaken: 0,
    wallHits: 0,
    driftScore: 0,
    streak: 0,
    lastDamagedBy: null,
    lastTauntId: null,
    lastTauntAt: 0,
  };
}

export function sortRacersStandings(racers: KsidaRacer[], mode: KsidaMode): KsidaRacer[] {
  return [...racers].sort((a, b) => {
    if (mode === "RACE") {
      if (a.finishedAt > 0 && b.finishedAt > 0) {
        return a.finishedAt - b.finishedAt;
      }
      if (a.finishedAt > 0) return -1;
      if (b.finishedAt > 0) return 1;
      const progDiff = b.trackProgress - a.trackProgress;
      if (Math.abs(progDiff) > 0.015) return progDiff;
    }
    return b.score - a.score || b.takedowns - a.takedowns || a.wrecksTaken - b.wrecksTaken;
  });
}

export function computeKsidaAwards(
  racersMap: Record<string, KsidaRacer>,
  mode: KsidaMode
): KsidaAwardBadge[] {
  const list = Object.values(racersMap);
  if (list.length === 0) return [];

  const sorted = sortRacersStandings(list, mode);
  const awards: KsidaAwardBadge[] = [];

  const champ = sorted[0];
  awards.push({
    id: "award_champion",
    titleAr: "سلطان الروندا والكورنيش",
    subtitleAr: mode === "RACE" ? "أسرع شيفور فالمغرب!" : "سيطر على الحلبة بلا رحمة!",
    emoji: "👑",
    winnerId: champ.id,
    winnerName: champ.nickname,
    statLabel: `${champ.score} نقطة • ${champ.takedowns} تفركيعة`,
  });

  const topSmasher = [...list].sort(
    (a, b) => b.takedowns - a.takedowns || b.score - a.score
  )[0];
  if (topSmasher) {
    awards.push({
      id: "award_smasher",
      titleAr: "مول الفران مقطوع",
      subtitleAr: "ما خلى حتى طوموبيل صحيحة فـ الروندا!",
      emoji: "💥",
      winnerId: topSmasher.id,
      winnerName: topSmasher.nickname,
      statLabel: `${topSmasher.takedowns} كسيدة قاتلة`,
    });
  }

  const needsPermis = [...list].sort(
    (a, b) =>
      b.wallHits + b.wrecksTaken * 3 - (a.wallHits + a.wrecksTaken * 3) ||
      a.score - b.score
  )[0];
  if (needsPermis) {
    awards.push({
      id: "award_permis",
      titleAr: "خصو يعاود البيرمي",
      subtitleAr: "باس جميع الحيطان والپوطويات ديال الكورنيش!",
      emoji: "🪪",
      winnerId: needsPermis.id,
      winnerName: needsPermis.nickname,
      statLabel: `${needsPermis.wallHits} حيط • ${needsPermis.wrecksTaken} تفرشيخة`,
    });
  }

  const driftKing = [...list].sort((a, b) => b.driftScore - a.driftScore)[0];
  if (driftKing && driftKing.driftScore > 0) {
    awards.push({
      id: "award_drift",
      titleAr: "ملك الدريفت المشحر",
      subtitleAr: "حرق الپناوات فكل دورة بحال طوكيو دريفت!",
      emoji: "💨",
      winnerId: driftKing.id,
      winnerName: driftKing.nickname,
      statLabel: `${driftKing.driftScore} نقطة دريفت`,
    });
  }

  return awards;
}

function buildInitialRacers(
  players: Player[],
  settings: KsidaSettings
): Record<string, KsidaRacer> {
  const racers: Record<string, KsidaRacer> = {};
  const activeHumans = players.filter((p) => p.status !== "LEFT").slice(0, 8);

  activeHumans.forEach((p, idx) => {
    racers[p.id] = buildHumanRacer(p, idx, settings);
  });

  const bots = createKsidaBots(activeHumans.length, settings.mode, settings.botFill);
  for (const bot of bots) {
    racers[bot.id] = bot;
  }

  return racers;
}

function createMatchState(
  players: Player[],
  rawSettings: Partial<KsidaSettings>,
  round = 1
): KsidaState {
  const settings: KsidaSettings = {
    ...DEFAULT_KSIDA_SETTINGS,
    ...rawSettings,
  };
  const now = Date.now();
  const countdownEndsAt = now + COUNTDOWN_DURATION_MS;
  const racers = buildInitialRacers(players, settings);
  const allIds = Object.keys(racers);
  const initialBombHolder =
    settings.mode === "HOT_BOMB" && allIds.length > 0
      ? allIds[Math.floor(Math.random() * allIds.length)]
      : null;

  return {
    phase: "PLAYING",
    mode: settings.mode,
    round,
    startedAt: now,
    countdownEndsAt,
    endsAt: countdownEndsAt + settings.matchDurationSec * 1000,
    crownHolderId: null,
    crownX: 0,
    crownZ: 0,
    hotBombHolderId: initialBombHolder,
    hotBombExplodesAt: initialBombHolder ? countdownEndsAt + 16_000 : 0,
    racers,
    crates: createInitialCratePads(settings.mode),
    hazards: [],
    wreckFeed: [],
    awards: [],
    winnerId: null,
    winnerSummaryAr: null,
    settings,
  };
}

export const Ksida3DEngine: GameDefinition<KsidaState, KsidaAction, KsidaSettings> = {
  id: "ksida3d",
  slug: "ksida-royal-3d",
  version: 2,
  displayNameKey: "كسيدة رويال 3D: حرب الطاكسيات 🚕💥🩴",
  shortDescriptionKey:
    "سباق وتفركيع الطوموبيلات المغربية 3D على مدار الكورنيش والقصبة الكبير! دريفت بالطاكسي الحمر وC15 وسطافيط الرادار، صندالة الواليدة الموجهة، والكونسطا مضمونة!",
  minPlayers: 1,
  maxPlayers: 8,
  capabilities: ["MULTI_PHONE", "REALTIME", "SCORES", "TIMERS"],
  defaultSettings: DEFAULT_KSIDA_SETTINGS,

  validateSetup(players: Player[], _settings: KsidaSettings): ValidationResult {
    const active = players.filter((p) => p.status !== "LEFT");
    if (active.length < 1) {
      return { isValid: false, errors: ["خاص على الأقل شيفور واحد باش يديماري السباق!"] };
    }
    if (active.length > 8) {
      return {
        isValid: false,
        errors: ["كسيدة رويال 3D كتهز من 1 حتى 8 شيفورات كحد أقصى باش تبقى طايرة 60FPS!"],
      };
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: KsidaSettings): KsidaState {
    return createMatchState(players, settings, 1);
  },

  start(ctx: GameContext<KsidaState, KsidaSettings>): TransitionResult<KsidaState> {
    const fresh = createMatchState(ctx.players, ctx.settings, 1);
    return {
      success: true,
      newState: fresh,
      newPhase: "PLAYING",
      newRound: 1,
    };
  },

  handleAction(
    ctx: GameContext<KsidaState, KsidaSettings>,
    actorPlayerId: string,
    action: KsidaAction
  ): TransitionResult<KsidaState> {
    const state = ctx.state;
    const actor = ctx.players.find((p) => p.id === actorPlayerId);

    switch (action.type) {
      case "CONFIGURE_MATCH": {
        if (!actor?.isHost && ctx.players.length > 1) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "غير مول الغرفة يقدر يبدل طور السباق!",
          };
        }
        const nextSettings: KsidaSettings = {
          ...state.settings,
          ...(action.mode ? { mode: action.mode } : {}),
          ...(typeof action.botFill === "boolean" ? { botFill: action.botFill } : {}),
          ...(typeof action.targetLaps === "number"
            ? { targetLaps: Math.max(2, Math.min(5, action.targetLaps)) }
            : {}),
          ...(typeof action.matchDurationSec === "number"
            ? { matchDurationSec: Math.max(150, Math.min(600, action.matchDurationSec)) }
            : {}),
        };
        const resetState = createMatchState(ctx.players, nextSettings, state.round + 1);
        return {
          success: true,
          newState: resetState,
          newPhase: "PLAYING",
          newRound: resetState.round,
        };
      }

      case "SELECT_VEHICLE": {
        const spec = KSIDA_VEHICLES[action.vehicle];
        if (!spec || !state.racers[actorPlayerId]) {
          return { success: false, newState: state, newPhase: state.phase };
        }
        const cur = state.racers[actorPlayerId];
        const updatedRacers: Record<string, KsidaRacer> = {
          ...state.racers,
          [actorPlayerId]: {
            ...cur,
            vehicle: action.vehicle,
            maxHp: spec.maxHp,
            hp: Math.min(spec.maxHp, cur.hp),
          },
        };
        return {
          success: true,
          newState: { ...state, racers: updatedRacers },
          newPhase: state.phase,
        };
      }

      case "SYNC_CHECKPOINT": {
        if (state.phase === "GAME_OVER") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const merged: Record<string, KsidaRacer> = {
          ...(action.racers || state.racers),
        };
        for (const [id, r] of Object.entries(state.racers || {})) {
          if (!r.isBot && !merged[id]) {
            merged[id] = r;
          }
        }
        return {
          success: true,
          newState: {
            ...state,
            racers: merged,
            crates: action.crates || state.crates,
            crownHolderId:
              action.crownHolderId !== undefined ? action.crownHolderId : state.crownHolderId,
            hotBombHolderId:
              action.hotBombHolderId !== undefined
                ? action.hotBombHolderId
                : state.hotBombHolderId,
            hotBombExplodesAt:
              action.hotBombExplodesAt !== undefined
                ? action.hotBombExplodesAt
                : state.hotBombExplodesAt,
          },
          newPhase: state.phase,
        };
      }

      case "FINISH_MATCH": {
        if (state.phase === "GAME_OVER") {
          return { success: true, newState: state, newPhase: "GAME_OVER" };
        }
        const finalRacers: Record<string, KsidaRacer> = {
          ...(action.racers || state.racers),
        };
        const sorted = sortRacersStandings(Object.values(finalRacers), state.mode);
        const top = sorted[0] || null;
        const winnerId = action.winnerId ?? top?.id ?? null;
        const awards = computeKsidaAwards(finalRacers, state.mode);
        const vehicleEmoji = top ? KSIDA_VEHICLES[top.vehicle]?.emoji || "🚕" : "🏆";
        const defaultSummary = top
          ? `${vehicleEmoji} ${top.nickname} ربح اللقب فـ كسيدة رويال 3D بـ ${top.score} نقطة و ${top.takedowns} تفركيعة!`
          : "سالات الروينة فـ كسيدة رويال 3D!";

        return {
          success: true,
          newState: {
            ...state,
            phase: "GAME_OVER",
            racers: finalRacers,
            awards,
            winnerId,
            winnerSummaryAr: action.winnerSummaryAr || defaultSummary,
          },
          newPhase: "GAME_OVER",
          broadcastEvent: {
            type: "KSIDA_MATCH_FINISHED",
            payload: { winnerId },
          },
        };
      }

      case "PLAY_AGAIN": {
        const fresh = createMatchState(ctx.players, state.settings, state.round + 1);
        return {
          success: true,
          newState: fresh,
          newPhase: "PLAYING",
          newRound: fresh.round,
        };
      }

      default:
        return {
          success: false,
          newState: state,
          newPhase: state.phase,
          error: "أمر غير معروف فـ كسيدة رويال 3D",
        };
    }
  },

  getPublicView(ctx: GameContext<KsidaState, KsidaSettings>): PublicGameView {
    const s = ctx.state;
    return {
      gameId: "ksida3d",
      phase: s.phase,
      round: s.round,
      stateVersion: ctx.stateVersion,
      timer: {
        startsAt: s.startedAt,
        endsAt: s.endsAt,
        durationMs: Math.max(1000, s.endsAt - s.startedAt),
        isPaused: s.phase === "GAME_OVER",
      },
      publicData: {
        phase: s.phase,
        mode: s.mode,
        round: s.round,
        startedAt: s.startedAt,
        countdownEndsAt: s.countdownEndsAt,
        endsAt: s.endsAt,
        crownHolderId: s.crownHolderId,
        crownX: s.crownX,
        crownZ: s.crownZ,
        hotBombHolderId: s.hotBombHolderId,
        hotBombExplodesAt: s.hotBombExplodesAt,
        racers: s.racers,
        crates: s.crates,
        awards: s.awards,
        winnerId: s.winnerId,
        winnerSummaryAr: s.winnerSummaryAr,
        settings: s.settings,
      },
    };
  },

  getPlayerView(
    ctx: GameContext<KsidaState, KsidaSettings>,
    playerId: string
  ): PrivatePlayerGameView {
    const isHost = Boolean(ctx.players.find((p) => p.id === playerId)?.isHost);
    const me = ctx.state.racers[playerId];
    return {
      playerId,
      isHost,
      myRole: me?.vehicle || "TAXI_HMER",
      privateData: {
        myRacerId: playerId,
      },
      allowedActions: [
        "SELECT_VEHICLE",
        "SYNC_CHECKPOINT",
        "FINISH_MATCH",
        "PLAY_AGAIN",
        ...(isHost ? ["CONFIGURE_MATCH"] : []),
      ],
    };
  },

  checkFinished(ctx: GameContext<KsidaState, KsidaSettings>): GameEndResult | null {
    const s = ctx.state;
    if (s.phase !== "GAME_OVER") return null;

    const sorted = sortRacersStandings(Object.values(s.racers), s.mode);
    return {
      isFinished: true,
      winner: {
        players: s.winnerId ? [s.winnerId] : sorted[0] ? [sorted[0].id] : [],
        summary: s.winnerSummaryAr || "انتهت معركة كسيدة رويال 3D!",
      },
      scoreboard: sorted.map((r) => ({
        id: r.id,
        label: `${KSIDA_VEHICLES[r.vehicle]?.emoji || "🚕"} ${r.nickname} (${r.takedowns}💥)`,
        score: r.score,
      })),
    };
  },
};
