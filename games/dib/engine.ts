import { GameCapability, Player, PublicGameView, PrivatePlayerGameView } from "@/lib/types";
import { GameContext, GameDefinition, GameEndResult, TransitionResult, ValidationResult } from "@/games/registry";

export type DibRole = "villager" | "wolf" | "seer" | "witch";

export interface DibPlayerState {
  playerId: string;
  role: DibRole;
  isAlive: boolean;
  deathRound?: number;
  deathReason?: "wolf" | "witch" | "vote";
}

export interface DibSettings {
  discussionDurationSeconds: number;
  seerRevealsRole: boolean;
  witchSeesVictim: boolean;
  customRoles?: Record<DibRole, number>;
}

export interface DibState {
  playerStates: Record<string, DibPlayerState>;
  phase: "ROLE_REVEAL" | "NIGHT_WOLF" | "NIGHT_SEER" | "NIGHT_WITCH" | "DAY_ANNOUNCEMENT" | "DISCUSSION" | "DAY_VOTE" | "GAME_OVER";
  round: number;
  wolfVotes: Record<string, string>; // wolfPlayerId -> targetPlayerId
  seerTarget?: string;
  seerHistory: Array<{ round: number; targetId: string; result: "wolf" | "village" | DibRole }>;
  witchHealUsed: boolean;
  witchPoisonUsed: boolean;
  witchActionDone: boolean;
  witchAction?: { action: "save" | "poison" | "none"; targetId?: string };
  nightPendingDeaths: Array<{ playerId: string; reason: "wolf" | "witch" }>;
  dayVotes: Record<string, string>; // voterPlayerId -> suspectPlayerId
  lastEliminatedPlayerId?: string;
  winner?: "village" | "wolves";
  narrationKey?: string;
}

export type DibAction =
  | { type: "ACK_ROLE" }
  | { type: "WOLF_VOTE"; targetPlayerId: string }
  | { type: "SEER_INSPECT"; targetPlayerId: string }
  | { type: "WITCH_DECIDE"; action: "save" | "poison" | "none"; targetPlayerId?: string }
  | { type: "SKIP_NIGHT_ACTION" }
  | { type: "START_VOTING" }
  | { type: "DAY_VOTE"; targetPlayerId: string }
  | { type: "NEXT_PHASE" };

export function getRecommendedRoleDistribution(playerCount: number): Record<DibRole, number> {
  if (playerCount <= 4) {
    return { wolf: 1, seer: 1, witch: 0, villager: playerCount - 2 };
  } else if (playerCount === 5) {
    return { wolf: 1, seer: 1, witch: 1, villager: 2 };
  } else if (playerCount <= 7) {
    return { wolf: 2, seer: 1, witch: 1, villager: playerCount - 4 };
  } else {
    return { wolf: 3, seer: 1, witch: 1, villager: playerCount - 5 };
  }
}

export const DibEngine: GameDefinition<DibState, DibAction, DibSettings> = {
  id: "dib",
  slug: "dib",
  version: 1,
  displayNameKey: "dib.name",
  shortDescriptionKey: "dib.description",
  minPlayers: 4,
  maxPlayers: 18,
  capabilities: [
    "MULTI_PHONE",
    "ONE_PHONE",
    "HYBRID",
    "PRIVATE_TURNS",
    "ANONYMOUS_VOTING",
    "REALTIME",
    "TIMERS",
    "NARRATION",
  ],
  defaultSettings: {
    discussionDurationSeconds: 120,
    seerRevealsRole: false,
    witchSeesVictim: true,
  },

  validateSetup(players: Player[], settings: DibSettings): ValidationResult {
    if (players.length < 4) {
      return { isValid: false, errors: ["DIB requires at least 4 players."] };
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: DibSettings): DibState {
    const dist = settings.customRoles || getRecommendedRoleDistribution(players.length);
    const roleDeck: DibRole[] = [];

    (Object.keys(dist) as DibRole[]).forEach((role) => {
      for (let i = 0; i < (dist[role] || 0); i++) {
        roleDeck.push(role);
      }
    });

    // Fill remaining with villagers if needed
    while (roleDeck.length < players.length) {
      roleDeck.push("villager");
    }

    // Shuffle roles deterministically
    const shuffledRoles = [...roleDeck].sort(() => Math.random() - 0.5);

    const playerStates: Record<string, DibPlayerState> = {};
    players.forEach((p, idx) => {
      playerStates[p.id] = {
        playerId: p.id,
        role: shuffledRoles[idx],
        isAlive: true,
      };
    });

    return {
      playerStates,
      phase: "ROLE_REVEAL",
      round: 1,
      wolfVotes: {},
      seerHistory: [],
      witchHealUsed: false,
      witchPoisonUsed: false,
      witchActionDone: false,
      nightPendingDeaths: [],
      dayVotes: {},
      narrationKey: "المدينة تنعس 🌙",
    };
  },

  start(ctx: GameContext<DibState, DibSettings>): TransitionResult<DibState> {
    return {
      success: true,
      newState: {
        ...ctx.state,
        phase: "ROLE_REVEAL",
      },
      newPhase: "ROLE_REVEAL",
    };
  },

  handleAction(
    ctx: GameContext<DibState, DibSettings>,
    actorPlayerId: string,
    action: DibAction
  ): TransitionResult<DibState> {
    const { state } = ctx;
    const actor = state.playerStates[actorPlayerId];

    if (!actor && action.type !== "NEXT_PHASE") {
      return { success: false, newState: state, newPhase: state.phase, error: "Player not in game" };
    }

    switch (action.type) {
      case "NEXT_PHASE": {
        // Phase stepping logic
        if (state.phase === "ROLE_REVEAL") {
          return {
            success: true,
            newState: {
              ...state,
              phase: "NIGHT_WOLF",
              wolfVotes: {},
              narrationKey: "الذيابة يفيقو 🐺",
            },
            newPhase: "NIGHT_WOLF",
            timerDurationMs: 30000,
          };
        }

        if (state.phase === "NIGHT_WOLF") {
          // Resolve wolves vote
          const votesCount: Record<string, number> = {};
          Object.values(state.wolfVotes).forEach((target) => {
            votesCount[target] = (votesCount[target] || 0) + 1;
          });

          let maxVotes = 0;
          let victimId: string | undefined;
          Object.entries(votesCount).forEach(([targetId, count]) => {
            if (count > maxVotes) {
              maxVotes = count;
              victimId = targetId;
            }
          });

          const pendingDeaths: Array<{ playerId: string; reason: "wolf" | "witch" }> = [];
          if (victimId) {
            pendingDeaths.push({ playerId: victimId, reason: "wolf" });
          }

          // Check if seer is alive
          const hasAliveSeer = Object.values(state.playerStates).some((p) => p.role === "seer" && p.isAlive);
          if (hasAliveSeer) {
            return {
              success: true,
              newState: {
                ...state,
                phase: "NIGHT_SEER",
                nightPendingDeaths: pendingDeaths,
                seerTarget: undefined,
                narrationKey: "الشوافة تفيق 🔮",
              },
              newPhase: "NIGHT_SEER",
              timerDurationMs: 20000,
            };
          }

          // Check if witch is alive
          const hasAliveWitch = Object.values(state.playerStates).some((p) => p.role === "witch" && p.isAlive);
          if (hasAliveWitch) {
            return {
              success: true,
              newState: {
                ...state,
                phase: "NIGHT_WITCH",
                nightPendingDeaths: pendingDeaths,
                witchActionDone: false,
                narrationKey: "السحارة كتفيق 🧪",
              },
              newPhase: "NIGHT_WITCH",
              timerDurationMs: 25000,
            };
          }

          // Night resolution -> Day announcement
          return resolveNightToDay(state, pendingDeaths, ctx.settings);
        }

        if (state.phase === "NIGHT_SEER") {
          const hasAliveWitch = Object.values(state.playerStates).some((p) => p.role === "witch" && p.isAlive);
          if (hasAliveWitch) {
            return {
              success: true,
              newState: {
                ...state,
                phase: "NIGHT_WITCH",
                witchActionDone: false,
                narrationKey: "السحارة كتفيق 🧪",
              },
              newPhase: "NIGHT_WITCH",
              timerDurationMs: 25000,
            };
          }
          return resolveNightToDay(state, state.nightPendingDeaths, ctx.settings);
        }

        if (state.phase === "NIGHT_WITCH") {
          return resolveNightToDay(state, state.nightPendingDeaths, ctx.settings);
        }

        if (state.phase === "DAY_ANNOUNCEMENT") {
          return {
            success: true,
            newState: {
              ...state,
              phase: "DISCUSSION",
              narrationKey: "المدينة فاقت! ناقشو بيناتكم 🗣️",
            },
            newPhase: "DISCUSSION",
            timerDurationMs: (ctx.settings.discussionDurationSeconds || 120) * 1000,
          };
        }

        if (state.phase === "DISCUSSION") {
          return {
            success: true,
            newState: {
              ...state,
              phase: "DAY_VOTE",
              dayVotes: {},
              narrationKey: "وقت التصويت السري 🗳️",
            },
            newPhase: "DAY_VOTE",
            timerDurationMs: 45000,
          };
        }

        if (state.phase === "DAY_VOTE") {
          // Resolve day vote
          const votesCount: Record<string, number> = {};
          Object.values(state.dayVotes).forEach((target) => {
            votesCount[target] = (votesCount[target] || 0) + 1;
          });

          let maxVotes = 0;
          let eliminatedId: string | undefined;
          let isTie = false;

          Object.entries(votesCount).forEach(([targetId, count]) => {
            if (count > maxVotes) {
              maxVotes = count;
              eliminatedId = targetId;
              isTie = false;
            } else if (count === maxVotes && maxVotes > 0) {
              isTie = true;
            }
          });

          const nextPlayerStates = { ...state.playerStates };
          let actuallyEliminated: string | undefined;

          if (!isTie && eliminatedId && nextPlayerStates[eliminatedId]) {
            nextPlayerStates[eliminatedId] = {
              ...nextPlayerStates[eliminatedId],
              isAlive: false,
              deathRound: state.round,
              deathReason: "vote",
            };
            actuallyEliminated = eliminatedId;
          }

          // Check win condition
          const win = evaluateWinCondition(nextPlayerStates);
          if (win) {
            return {
              success: true,
              newState: {
                ...state,
                playerStates: nextPlayerStates,
                phase: "GAME_OVER",
                lastEliminatedPlayerId: actuallyEliminated,
                winner: win,
              },
              newPhase: "GAME_OVER",
            };
          }

          // Next night
          return {
            success: true,
            newState: {
              ...state,
              playerStates: nextPlayerStates,
              round: state.round + 1,
              phase: "NIGHT_WOLF",
              wolfVotes: {},
              nightPendingDeaths: [],
              dayVotes: {},
              lastEliminatedPlayerId: actuallyEliminated,
              narrationKey: "المدينة تنعس من جديد... الذيابة يفيقو 🐺",
            },
            newPhase: "NIGHT_WOLF",
            timerDurationMs: 30000,
          };
        }

        return { success: false, newState: state, newPhase: state.phase };
      }

      case "WOLF_VOTE": {
        if (state.phase !== "NIGHT_WOLF" || actor.role !== "wolf" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "Action not permitted" };
        }
        return {
          success: true,
          newState: {
            ...state,
            wolfVotes: {
              ...state.wolfVotes,
              [actorPlayerId]: action.targetPlayerId,
            },
          },
          newPhase: state.phase,
        };
      }

      case "SEER_INSPECT": {
        if (state.phase !== "NIGHT_SEER" || actor.role !== "seer" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "Action not permitted" };
        }
        const target = state.playerStates[action.targetPlayerId];
        if (!target) return { success: false, newState: state, newPhase: state.phase, error: "Target not found" };

        const inspectResult = ctx.settings.seerRevealsRole
          ? target.role
          : target.role === "wolf"
          ? "wolf"
          : "village";

        return {
          success: true,
          newState: {
            ...state,
            seerTarget: action.targetPlayerId,
            seerHistory: [
              ...state.seerHistory,
              { round: state.round, targetId: action.targetPlayerId, result: inspectResult },
            ],
          },
          newPhase: state.phase,
        };
      }

      case "WITCH_DECIDE": {
        if (state.phase !== "NIGHT_WITCH" || actor.role !== "witch" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "Action not permitted" };
        }

        let pending = [...state.nightPendingDeaths];
        let healUsed = state.witchHealUsed;
        let poisonUsed = state.witchPoisonUsed;

        if (action.action === "save" && !state.witchHealUsed) {
          // Remove wolf victim
          pending = pending.filter((d) => d.reason !== "wolf");
          healUsed = true;
        } else if (action.action === "poison" && !state.witchPoisonUsed && action.targetPlayerId) {
          pending.push({ playerId: action.targetPlayerId, reason: "witch" });
          poisonUsed = true;
        }

        return {
          success: true,
          newState: {
            ...state,
            nightPendingDeaths: pending,
            witchHealUsed: healUsed,
            witchPoisonUsed: poisonUsed,
            witchActionDone: true,
          },
          newPhase: state.phase,
        };
      }

      case "DAY_VOTE": {
        if (state.phase !== "DAY_VOTE" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "Dead players cannot vote" };
        }
        return {
          success: true,
          newState: {
            ...state,
            dayVotes: {
              ...state.dayVotes,
              [actorPlayerId]: action.targetPlayerId,
            },
          },
          newPhase: state.phase,
        };
      }

      default:
        return { success: false, newState: state, newPhase: state.phase, error: "Unknown action" };
    }
  },

  getPublicView(ctx: GameContext<DibState, DibSettings>): PublicGameView {
    const { state, phase, round, stateVersion } = ctx;
    const livingPlayersCount = Object.values(state.playerStates).filter((p) => p.isAlive).length;
    const livingWolfVotesCount = Object.keys(state.wolfVotes).length;
    const totalLivingWolves = Object.values(state.playerStates).filter((p) => p.role === "wolf" && p.isAlive).length;

    return {
      gameId: "dib",
      phase,
      round,
      stateVersion,
      publicData: {
        phase: state.phase,
        narrationKey: state.narrationKey,
        livingPlayersCount,
        wolvesDone: livingWolfVotesCount >= totalLivingWolves,
        lastEliminatedPlayerId: state.lastEliminatedPlayerId,
        recentDeaths: state.phase === "DAY_ANNOUNCEMENT" ? state.nightPendingDeaths.map((d) => d.playerId) : [],
        votesSubmittedCount: Object.keys(state.dayVotes).length,
        winner: state.winner,
        alivePlayerIds: Object.values(state.playerStates).filter((p) => p.isAlive).map((p) => p.playerId),
      },
    };
  },

  getPlayerView(ctx: GameContext<DibState, DibSettings>, playerId: string): PrivatePlayerGameView {
    const { state } = ctx;
    const player = state.playerStates[playerId];

    if (!player) {
      return {
        playerId,
        isHost: false,
        privateData: {},
        allowedActions: [],
      };
    }

    const allowedActions: string[] = [];
    const privateData: Record<string, unknown> = {
      isAlive: player.isAlive,
    };

    // If game is over, reveal everyone's roles to all
    if (state.phase === "GAME_OVER") {
      privateData.allRoles = Object.fromEntries(
        Object.entries(state.playerStates).map(([id, p]) => [id, p.role])
      );
    }

    if (player.isAlive) {
      if (state.phase === "NIGHT_WOLF" && player.role === "wolf") {
        allowedActions.push("WOLF_VOTE");
        // Wolves can see other alive wolves
        privateData.packMembers = Object.values(state.playerStates)
          .filter((p) => p.role === "wolf" && p.isAlive)
          .map((p) => p.playerId);
        privateData.currentWolfVotes = state.wolfVotes;
      }

      if (state.phase === "NIGHT_SEER" && player.role === "seer") {
        allowedActions.push("SEER_INSPECT");
        privateData.seerHistory = state.seerHistory;
      }

      if (state.phase === "NIGHT_WITCH" && player.role === "witch") {
        allowedActions.push("WITCH_DECIDE");
        privateData.canHeal = !state.witchHealUsed;
        privateData.canPoison = !state.witchPoisonUsed;
        if (ctx.settings.witchSeesVictim) {
          const wolfVictim = state.nightPendingDeaths.find((d) => d.reason === "wolf");
          privateData.victimId = wolfVictim?.playerId;
        }
      }

      if (state.phase === "DAY_VOTE") {
        allowedActions.push("DAY_VOTE");
        privateData.myVote = state.dayVotes[playerId];
      }
    }

    return {
      playerId,
      isHost: false,
      myRole: player.role,
      privateData,
      allowedActions,
    };
  },

  checkFinished(ctx: GameContext<DibState, DibSettings>): GameEndResult | null {
    const { state } = ctx;
    if (state.phase !== "GAME_OVER" || !state.winner) {
      return null;
    }

    return {
      isFinished: true,
      winner: {
        team: state.winner,
        summary:
          state.winner === "village"
            ? "القرية انتصرات! تم القضاء على جميع الذيابة 🎉"
            : "الذيابة ربحو وسيطرو على القرية! 🐺",
      },
    };
  },
};

function resolveNightToDay(
  state: DibState,
  pendingDeaths: Array<{ playerId: string; reason: "wolf" | "witch" }>,
  settings: DibSettings
): TransitionResult<DibState> {
  const nextPlayerStates = { ...state.playerStates };
  pendingDeaths.forEach((d) => {
    if (nextPlayerStates[d.playerId]) {
      nextPlayerStates[d.playerId] = {
        ...nextPlayerStates[d.playerId],
        isAlive: false,
        deathRound: state.round,
        deathReason: d.reason,
      };
    }
  });

  const win = evaluateWinCondition(nextPlayerStates);
  if (win) {
    return {
      success: true,
      newState: {
        ...state,
        playerStates: nextPlayerStates,
        phase: "GAME_OVER",
        winner: win,
      },
      newPhase: "GAME_OVER",
    };
  }

  return {
    success: true,
    newState: {
      ...state,
      playerStates: nextPlayerStates,
      phase: "DAY_ANNOUNCEMENT",
      narrationKey: "المدينة فاقت! شوفو شكون توفى هاد الليلة ☀️",
    },
    newPhase: "DAY_ANNOUNCEMENT",
    timerDurationMs: 15000,
  };
}

function evaluateWinCondition(playerStates: Record<string, DibPlayerState>): "village" | "wolves" | null {
  const alivePlayers = Object.values(playerStates).filter((p) => p.isAlive);
  const aliveWolves = alivePlayers.filter((p) => p.role === "wolf");
  const aliveVillagers = alivePlayers.filter((p) => p.role !== "wolf");

  if (aliveWolves.length === 0) {
    return "village";
  }

  if (aliveWolves.length >= aliveVillagers.length) {
    return "wolves";
  }

  return null;
}
