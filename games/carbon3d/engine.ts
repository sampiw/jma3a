import {
  GameContext,
  GameDefinition,
  GameEndResult,
  TransitionResult,
  ValidationResult,
} from "@/games/registry";
import { Player, PrivatePlayerGameView, PublicGameView } from "@/lib/types";
import { createArenaBots } from "./ai";
import {
  ARENA_SPAWN_POINTS,
  createInitialBarrels,
  createInitialPickupPads,
} from "./arenaLayout";
import {
  CarbonAction,
  CarbonCombatant,
  CarbonSettings,
  CarbonState,
  CarbonTeam,
  STRIKER_PALETTE,
} from "./types";

export const DEFAULT_CARBON_SETTINGS: CarbonSettings = {
  mode: "FFA",
  botFill: false, // Solo (1 human) auto-spawns 4 Spec-Ops bots; 2+ humans = clean PvP unless toggled ON!
  botDifficulty: "HARD",
  targetKillsFFA: 25,
  targetScoreSquad: 250,
  matchDurationSec: 420,
};

export function buildHumanCombatant(
  p: Player,
  idx: number,
  settings: CarbonSettings
): CarbonCombatant {
  const team: CarbonTeam =
    settings.mode === "SURVIVAL"
      ? "CYAN"
      : settings.mode === "SQUAD"
      ? idx % 2 === 0
        ? "CYAN"
        : "CRIMSON"
      : "SOLO";

  const spawnPool =
    settings.mode === "FFA"
      ? ARENA_SPAWN_POINTS
      : ARENA_SPAWN_POINTS.filter((s) => s.team === team);
  const sp = spawnPool[idx % spawnPool.length];
  const accentHex =
    settings.mode === "SQUAD"
      ? team === "CYAN"
        ? 0x38bdf8
        : 0xf43f5e
      : STRIKER_PALETTE[idx % STRIKER_PALETTE.length];

  return {
    id: p.id,
    nickname: p.nickname,
    isBot: false,
    archetype: "STRIKER",
    team,
    accentHex,
    x: sp.x,
    y: sp.y,
    z: sp.z,
    yaw: sp.yaw,
    pitch: 0,
    hp: 100,
    maxHp: 100,
    shield: 50,
    maxShield: 50,
    isAlive: true,
    respawnAt: 0,
    weapon: "CARBINE",
    secondaryWeapon: "SHOTGUN",
    kills: 0,
    deaths: 0,
    assists: 0,
    gems: 0,
    score: 0,
    streak: 0,
    overdriveUntil: 0,
    lastDamagedAt: 0,
    lastFiredAt: 0,
  };
}

function buildInitialCombatants(
  players: Player[],
  settings: CarbonSettings
): Record<string, CarbonCombatant> {
  const combatants: Record<string, CarbonCombatant> = {};
  const activeHumans = players.filter((p) => p.status !== "LEFT").slice(0, 8);

  activeHumans.forEach((p, idx) => {
    combatants[p.id] = buildHumanCombatant(p, idx, settings);
  });

  const bots = createArenaBots(activeHumans.length, settings.mode, settings.botFill);
  for (const bot of bots) {
    combatants[bot.id] = bot;
  }

  return combatants;
}

function createMatchState(
  players: Player[],
  rawSettings: Partial<CarbonSettings>,
  round = 1
): CarbonState {
  const settings: CarbonSettings = {
    ...DEFAULT_CARBON_SETTINGS,
    ...rawSettings,
  };
  const now = Date.now();
  const combatants = buildInitialCombatants(players, settings);
  const waveEnemies = Object.values(combatants).filter(
    (c) => c.isBot && c.team === "CRIMSON"
  ).length;

  return {
    phase: "PLAYING",
    mode: settings.mode,
    round,
    startedAt: now,
    endsAt:
      settings.mode === "SURVIVAL"
        ? now + 600 * 1000
        : now + settings.matchDurationSec * 1000,
    wave: 1,
    waveEnemiesRemaining: settings.mode === "SURVIVAL" ? waveEnemies : 0,
    hardpointIndex: 0,
    coreOwner: "NEUTRAL",
    coreProgress: 0,
    teamScores: {
      CYAN: 0,
      CRIMSON: 0,
    },
    combatants,
    pickups: createInitialPickupPads(),
    barrels: createInitialBarrels(),
    killFeed: [],
    winnerId: null,
    winnerTeam: null,
    winnerSummaryAr: null,
    settings,
  };
}

export const Carbon3DEngine: GameDefinition<CarbonState, CarbonAction, CarbonSettings> = {
  id: "carbon3d",
  slug: "carbon-3d",
  version: 3,
  displayNameKey: "عملية الأطلس 3D: فرقة النخبة 🪖🔥",
  shortDescriptionKey:
    "شووتير تكتيكي بمنظور الكتف (TPS) فـ جزيرة عسكرية عملاقة 168×168م! جري سريع ⚡، منصات قفز، وقناص AWP بالويفي!",
  minPlayers: 1,
  maxPlayers: 8,
  capabilities: ["MULTI_PHONE", "REALTIME", "SCORES", "TIMERS", "TEAM_MODE"],
  defaultSettings: DEFAULT_CARBON_SETTINGS,

  validateSetup(players: Player[], _settings: CarbonSettings): ValidationResult {
    const active = players.filter((p) => p.status !== "LEFT");
    if (active.length < 1) {
      return { isValid: false, errors: ["خاص على الأقل لاعب واحد باش تبدا العملية!"] };
    }
    if (active.length > 8) {
      return {
        isValid: false,
        errors: ["عملية الأطلس 3D مصممة لـ 1 حتى 8 لاعبين كحد أقصى باش تبقى سريعة 60FPS!"],
      };
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: CarbonSettings): CarbonState {
    return createMatchState(players, settings, 1);
  },

  start(ctx: GameContext<CarbonState, CarbonSettings>): TransitionResult<CarbonState> {
    const fresh = createMatchState(ctx.players, ctx.settings, 1);
    return {
      success: true,
      newState: fresh,
      newPhase: "PLAYING",
      newRound: 1,
    };
  },

  handleAction(
    ctx: GameContext<CarbonState, CarbonSettings>,
    actorPlayerId: string,
    action: CarbonAction
  ): TransitionResult<CarbonState> {
    const state = ctx.state;
    const actor = ctx.players.find((p) => p.id === actorPlayerId);

    switch (action.type) {
      case "CONFIGURE_MATCH": {
        if (!actor?.isHost && ctx.players.length > 1) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "غير قائد الغرفة يقدر يبدل طور المعركة",
          };
        }
        const nextSettings: CarbonSettings = {
          ...state.settings,
          ...(action.mode ? { mode: action.mode } : {}),
          ...(typeof action.botFill === "boolean" ? { botFill: action.botFill } : {}),
          ...(action.botDifficulty ? { botDifficulty: action.botDifficulty } : {}),
          ...(typeof action.matchDurationSec === "number"
            ? { matchDurationSec: Math.max(180, Math.min(900, action.matchDurationSec)) }
            : {}),
          ...(typeof action.targetScoreSquad === "number"
            ? { targetScoreSquad: Math.max(80, Math.min(600, action.targetScoreSquad)) }
            : {}),
          ...(typeof action.targetKillsFFA === "number"
            ? { targetKillsFFA: Math.max(10, Math.min(80, action.targetKillsFFA)) }
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

      case "SYNC_CHECKPOINT": {
        if (state.phase === "GAME_OVER") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const mergedCombatants: Record<string, CarbonCombatant> = {
          ...(action.combatants || state.combatants),
        };
        // Preserve any newly hot-joined human players so checkpoints never overwrite late-joiners
        for (const [id, unit] of Object.entries(state.combatants || {})) {
          if (!unit.isBot && !mergedCombatants[id]) {
            mergedCombatants[id] = unit;
          }
        }
        const nextState: CarbonState = {
          ...state,
          combatants: mergedCombatants,
          pickups: action.pickups || state.pickups,
          barrels: action.barrels || state.barrels,
          hardpointIndex: action.hardpointIndex ?? state.hardpointIndex ?? 0,
          teamScores: action.teamScores || state.teamScores,
          coreOwner: action.coreOwner ?? state.coreOwner,
          coreProgress: action.coreProgress ?? state.coreProgress,
          wave: action.wave ?? state.wave,
          waveEnemiesRemaining: action.waveEnemiesRemaining ?? state.waveEnemiesRemaining,
          killFeed: action.killFeed ? action.killFeed.slice(0, 8) : state.killFeed,
        };
        return {
          success: true,
          newState: nextState,
          newPhase: nextState.phase,
        };
      }

      case "FINISH_MATCH": {
        const finishedState: CarbonState = {
          ...state,
          phase: "GAME_OVER",
          combatants: action.combatants || state.combatants,
          teamScores: action.teamScores || state.teamScores,
          wave: action.wave ?? state.wave,
          winnerId: action.winnerId ?? null,
          winnerTeam: action.winnerTeam ?? null,
          winnerSummaryAr: action.winnerSummaryAr,
        };
        return {
          success: true,
          newState: finishedState,
          newPhase: "GAME_OVER",
        };
      }

      case "RESTART_MATCH": {
        const nextSettings: CarbonSettings = {
          ...state.settings,
          ...(action.mode ? { mode: action.mode } : {}),
        };
        const restarted = createMatchState(ctx.players, nextSettings, state.round + 1);
        return {
          success: true,
          newState: restarted,
          newPhase: "PLAYING",
          newRound: restarted.round,
        };
      }

      default:
        return {
          success: false,
          newState: state,
          newPhase: state.phase,
          error: "حركة غير معروفة",
        };
    }
  },

  getPublicView(ctx: GameContext<CarbonState, CarbonSettings>): PublicGameView {
    const s = ctx.state;
    return {
      gameId: "carbon3d",
      phase: s.phase,
      round: s.round,
      stateVersion: ctx.stateVersion,
      publicData: {
        phase: s.phase,
        mode: s.mode,
        round: s.round,
        startedAt: s.startedAt,
        endsAt: s.endsAt,
        wave: s.wave,
        waveEnemiesRemaining: s.waveEnemiesRemaining,
        hardpointIndex: s.hardpointIndex ?? 0,
        coreOwner: s.coreOwner,
        coreProgress: s.coreProgress,
        teamScores: s.teamScores,
        combatants: s.combatants,
        pickups: s.pickups,
        barrels: s.barrels,
        killFeed: s.killFeed,
        winnerId: s.winnerId,
        winnerTeam: s.winnerTeam,
        winnerSummaryAr: s.winnerSummaryAr,
        settings: s.settings,
      },
    };
  },

  getPlayerView(
    ctx: GameContext<CarbonState, CarbonSettings>,
    playerId: string
  ): PrivatePlayerGameView {
    const me = ctx.state.combatants[playerId];
    const p = ctx.players.find((pl) => pl.id === playerId);
    return {
      playerId,
      isHost: Boolean(p?.isHost),
      myRole: me?.team || "SOLO",
      myTeam: me?.team,
      privateData: {
        myStrikerId: playerId,
        isAlive: me ? me.isAlive : true,
      },
      allowedActions: ["CONFIGURE_MATCH", "SYNC_CHECKPOINT", "FINISH_MATCH", "RESTART_MATCH"],
    };
  },

  checkFinished(ctx: GameContext<CarbonState, CarbonSettings>): GameEndResult | null {
    const s = ctx.state;
    if (s.phase !== "GAME_OVER") return null;

    const sorted = Object.values(s.combatants).sort(
      (a, b) => b.score - a.score || b.kills - a.kills
    );

    return {
      isFinished: true,
      winner: {
        team: s.winnerTeam || undefined,
        players: s.winnerId ? [s.winnerId] : undefined,
        summary: s.winnerSummaryAr || "انتهت عملية الأطلس 3D!",
      },
      scoreboard: sorted.map((c) => ({
        id: c.id,
        label: c.nickname,
        score: c.score,
      })),
    };
  },
};
