import { GameCapability, Player, PublicGameView, PrivatePlayerGameView } from "@/lib/types";
import { GameContext, GameDefinition, GameEndResult, TransitionResult, ValidationResult } from "@/games/registry";

export type DibRole = "villager" | "wolf" | "seer" | "witch" | "hunter";

export interface DibPlayerState {
  playerId: string;
  role: DibRole;
  isAlive: boolean;
  deathRound?: number;
  deathReason?: "wolf" | "witch" | "vote" | "hunter";
}

export interface DibSettings {
  discussionDurationSeconds: number;
  seerRevealsRole: boolean;
  witchSeesVictim: boolean;
  customRoles?: Partial<Record<DibRole, number>>;
}

export interface DibNightSummary {
  deaths: Array<{ playerId: string; reason: "wolf" | "witch" | "hunter" }>;
  savedPlayerId?: string;
  wolfVictimId?: string;
}

export interface DibState {
  playerStates: Record<string, DibPlayerState>;
  phase:
    | "ROLE_REVEAL"
    | "NIGHT_SEER"
    | "NIGHT_WOLF"
    | "NIGHT_WITCH"
    | "DAY_ANNOUNCEMENT"
    | "DISCUSSION"
    | "DAY_VOTE"
    | "HUNTER_REVENGE"
    | "GAME_OVER";
  round: number;
  wolfVotes: Record<string, string>; // wolfPlayerId -> targetPlayerId
  wolfSignals?: Array<{ wolfId: string; signal: string; timestamp: number }>;
  wolfVictimId?: string; // The single victim chosen by wolves
  seerTarget?: string; // The single target inspected tonight
  seerHistory: Array<{ round: number; targetId: string; result: "wolf" | "village" | DibRole }>;
  witchHealUsed: boolean;
  witchPoisonUsed: boolean;
  witchActionDone: boolean;
  witchSavedPlayerId?: string;
  nightPendingDeaths: Array<{ playerId: string; reason: "wolf" | "witch" | "hunter" }>;
  nightSummary?: DibNightSummary;
  dayVotes: Record<string, string>; // voterPlayerId -> suspectPlayerId
  lastEliminatedPlayerId?: string;
  hunterShooterId?: string;
  winner?: "village" | "wolves";
  narrationKey?: string;
}

export type DibAction =
  | { type: "ACK_ROLE" }
  | { type: "SEER_INSPECT"; targetPlayerId: string }
  | { type: "WOLF_VOTE"; targetPlayerId: string }
  | { type: "WOLF_SIGNAL"; signal: string }
  | { type: "WITCH_DECIDE"; action: "save" | "poison" | "none"; targetPlayerId?: string }
  | { type: "HUNTER_SHOOT"; targetPlayerId: string }
  | { type: "DAY_VOTE"; targetPlayerId: string }
  | { type: "NEXT_PHASE" };

export function getRecommendedRoleDistribution(playerCount: number): Record<DibRole, number> {
  if (playerCount <= 4) {
    return { wolf: 1, seer: 1, witch: 0, hunter: 0, villager: Math.max(1, playerCount - 2) };
  } else if (playerCount === 5) {
    return { wolf: 1, seer: 1, witch: 1, hunter: 0, villager: 2 };
  } else if (playerCount <= 7) {
    return { wolf: 2, seer: 1, witch: 1, hunter: 0, villager: Math.max(1, playerCount - 4) };
  } else if (playerCount <= 9) {
    return { wolf: 2, seer: 1, witch: 1, hunter: 1, villager: Math.max(1, playerCount - 5) };
  } else {
    return { wolf: 3, seer: 1, witch: 1, hunter: 1, villager: Math.max(1, playerCount - 6) };
  }
}

export const DibEngine: GameDefinition<DibState, DibAction, DibSettings> = {
  id: "dib",
  slug: "dib",
  version: 2,
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
    if (settings.customRoles) {
      const wolves = settings.customRoles.wolf ?? 0;
      if (wolves < 1) {
        return { isValid: false, errors: ["يجب اختيار ذيب واحد على الأقل 🐺"] };
      }
      if (wolves >= players.length) {
        return { isValid: false, errors: ["عدد الذيابة لا يمكن أن يساوي أو يتجاوز مجموع اللاعبين"] };
      }
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: DibSettings): DibState {
    const recommended = getRecommendedRoleDistribution(players.length);
    const dist = { ...recommended, ...(settings.customRoles || {}) };
    
    // Build deck
    const roleDeck: DibRole[] = [];
    const rolesOrder: DibRole[] = ["wolf", "seer", "witch", "hunter", "villager"];
    rolesOrder.forEach((role) => {
      const count = dist[role] ?? 0;
      for (let i = 0; i < count; i++) {
        if (roleDeck.length < players.length) {
          roleDeck.push(role);
        }
      }
    });

    // Fill any remainder with villagers
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
      wolfSignals: [],
      seerHistory: [],
      witchHealUsed: false,
      witchPoisonUsed: false,
      witchActionDone: false,
      nightPendingDeaths: [],
      dayVotes: {},
      narrationKey: "المدينة تنعس وتغمض عينيها 🌙",
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
        // Step 1: From ROLE_REVEAL -> Start Night!
        // Classic Order: Voyante (Seer) -> Loups (Wolves) -> Sorcière (Witch) -> Dawn
        if (state.phase === "ROLE_REVEAL") {
          const hasAliveSeer = Object.values(state.playerStates).some((p) => p.role === "seer" && p.isAlive);
          if (hasAliveSeer) {
            return {
              success: true,
              newState: {
                ...state,
                phase: "NIGHT_SEER",
                seerTarget: undefined,
                nightPendingDeaths: [],
                narrationKey: "المدينة تنعس 🌙 ... دابا الشوافة تفيق وتكشف سر واحد 🔮",
              },
              newPhase: "NIGHT_SEER",
              timerDurationMs: 25000,
            };
          }

          // If no Seer, go directly to Wolves
          return {
            success: true,
            newState: {
              ...state,
              phase: "NIGHT_WOLF",
              wolfVotes: {},
              nightPendingDeaths: [],
              narrationKey: "المدينة تنعس 🌙 ... دابا يفيقو الذيابة ويتفاهمو على الضحية 🐺",
            },
            newPhase: "NIGHT_WOLF",
            timerDurationMs: 35000,
          };
        }

        // Step 2: From NIGHT_SEER -> Move to NIGHT_WOLF
        if (state.phase === "NIGHT_SEER") {
          return {
            success: true,
            newState: {
              ...state,
              phase: "NIGHT_WOLF",
              wolfVotes: {},
              narrationKey: "الشوافة تنعس 😴 ... دابا يفيقو الذيابة ويتفاهمو على الضحية 🐺",
            },
            newPhase: "NIGHT_WOLF",
            timerDurationMs: 35000,
          };
        }

        // Step 3: From NIGHT_WOLF -> Move to NIGHT_WITCH or Dawn!
        // RULES: Wolves can only kill EXACTLY ONE victim per turn!
        if (state.phase === "NIGHT_WOLF") {
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

          const pendingDeaths: Array<{ playerId: string; reason: "wolf" | "witch" | "hunter" }> = [];
          if (victimId) {
            pendingDeaths.push({ playerId: victimId, reason: "wolf" });
          }

          const hasAliveWitch = Object.values(state.playerStates).some((p) => p.role === "witch" && p.isAlive);
          if (hasAliveWitch) {
            return {
              success: true,
              newState: {
                ...state,
                phase: "NIGHT_WITCH",
                wolfVictimId: victimId,
                nightPendingDeaths: pendingDeaths,
                witchActionDone: false,
                witchSavedPlayerId: undefined,
                narrationKey: "الذيابة ينعسو 😴 ... دابا تفيق السحارة 🧪",
              },
              newPhase: "NIGHT_WITCH",
              timerDurationMs: 25000,
            };
          }

          // No witch -> resolve night directly to dawn announcement
          return resolveNightToDay(state, pendingDeaths, victimId, undefined);
        }

        // Step 4: From NIGHT_WITCH -> Resolve night to Dawn!
        if (state.phase === "NIGHT_WITCH") {
          return resolveNightToDay(state, state.nightPendingDeaths, state.wolfVictimId, state.witchSavedPlayerId);
        }

        // Step 5: From DAY_ANNOUNCEMENT -> DISCUSSION
        if (state.phase === "DAY_ANNOUNCEMENT") {
          return {
            success: true,
            newState: {
              ...state,
              phase: "DISCUSSION",
              narrationKey: "ناقشو الشكوك بيناتكم ودافعو على ريوسكم 🗣️",
            },
            newPhase: "DISCUSSION",
            timerDurationMs: (ctx.settings.discussionDurationSeconds || 120) * 1000,
          };
        }

        // Step 6: From DISCUSSION -> DAY_VOTE
        if (state.phase === "DISCUSSION") {
          return {
            success: true,
            newState: {
              ...state,
              phase: "DAY_VOTE",
              dayVotes: {},
              narrationKey: "وقت الحساب! صوتو على شكون كتشك فيه ذيب 🗳️",
            },
            newPhase: "DAY_VOTE",
            timerDurationMs: 45000,
          };
        }

        // Step 7: From DAY_VOTE -> Resolve voting elimination!
        if (state.phase === "DAY_VOTE") {
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

          // Check if eliminated player is Hunter!
          if (actuallyEliminated && nextPlayerStates[actuallyEliminated].role === "hunter") {
            return {
              success: true,
              newState: {
                ...state,
                playerStates: nextPlayerStates,
                phase: "HUNTER_REVENGE",
                hunterShooterId: actuallyEliminated,
                lastEliminatedPlayerId: actuallyEliminated,
                narrationKey: "الصياد تصوت عليه ولكن عندو رصاصة أخيرة! 🎯",
              },
              newPhase: "HUNTER_REVENGE",
            };
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

          // Next night: Wakes up Seer first if alive!
          const hasAliveSeer = Object.values(nextPlayerStates).some((p) => p.role === "seer" && p.isAlive);
          const nextNightPhase = hasAliveSeer ? "NIGHT_SEER" : "NIGHT_WOLF";

          return {
            success: true,
            newState: {
              ...state,
              playerStates: nextPlayerStates,
              round: state.round + 1,
              phase: nextNightPhase,
              wolfVotes: {},
              wolfSignals: [],
              wolfVictimId: undefined,
              seerTarget: undefined,
              witchActionDone: false,
              witchSavedPlayerId: undefined,
              nightPendingDeaths: [],
              dayVotes: {},
              lastEliminatedPlayerId: actuallyEliminated,
              narrationKey: hasAliveSeer
                ? "المدينة تنعس من جديد... الشوافة تفيق 🔮"
                : "المدينة تنعس من جديد... الذيابة يفيقو 🐺",
            },
            newPhase: nextNightPhase,
            timerDurationMs: 30000,
          };
        }

        // Step 8: From HUNTER_REVENGE -> Advance
        if (state.phase === "HUNTER_REVENGE") {
          const win = evaluateWinCondition(state.playerStates);
          if (win) {
            return {
              success: true,
              newState: {
                ...state,
                phase: "GAME_OVER",
                winner: win,
              },
              newPhase: "GAME_OVER",
            };
          }

          const hasAliveSeer = Object.values(state.playerStates).some((p) => p.role === "seer" && p.isAlive);
          const nextNightPhase = hasAliveSeer ? "NIGHT_SEER" : "NIGHT_WOLF";

          return {
            success: true,
            newState: {
              ...state,
              round: state.round + 1,
              phase: nextNightPhase,
              wolfVotes: {},
              wolfSignals: [],
              wolfVictimId: undefined,
              seerTarget: undefined,
              witchActionDone: false,
              witchSavedPlayerId: undefined,
              nightPendingDeaths: [],
              dayVotes: {},
              narrationKey: hasAliveSeer
                ? "المدينة تنعس من جديد... الشوافة تفيق 🔮"
                : "المدينة تنعس من جديد... الذيابة يفيقو 🐺",
            },
            newPhase: nextNightPhase,
            timerDurationMs: 30000,
          };
        }

        return { success: false, newState: state, newPhase: state.phase };
      }

      // Action: Seer inspection (ONLY ONE PER NIGHT!)
      case "SEER_INSPECT": {
        if (state.phase !== "NIGHT_SEER" || actor.role !== "seer" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "Action not permitted" };
        }
        if (state.seerTarget) {
          return { success: false, newState: state, newPhase: state.phase, error: "الشوافة كتشوف غير شخص واحد فالليلة!" };
        }
        const target = state.playerStates[action.targetPlayerId];
        if (!target || !target.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "Target not found or dead" };
        }

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

      // Action: Wolf Vote (Negotiation between pack members)
      case "WOLF_VOTE": {
        if (state.phase !== "NIGHT_WOLF" || actor.role !== "wolf" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "Action not permitted" };
        }
        const target = state.playerStates[action.targetPlayerId];
        if (!target || !target.isAlive || target.role === "wolf") {
          return { success: false, newState: state, newPhase: state.phase, error: "Invalid target" };
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

      // Action: Wolf tactical signal for negotiation
      case "WOLF_SIGNAL": {
        if (state.phase !== "NIGHT_WOLF" || actor.role !== "wolf" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "Action not permitted" };
        }
        const newSignals = [
          ...(state.wolfSignals || []).slice(-8),
          { wolfId: actorPlayerId, signal: action.signal, timestamp: Date.now() },
        ];
        return {
          success: true,
          newState: {
            ...state,
            wolfSignals: newSignals,
          },
          newPhase: state.phase,
        };
      }

      // Action: Witch Decide
      case "WITCH_DECIDE": {
        if (state.phase !== "NIGHT_WITCH" || actor.role !== "witch" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "Action not permitted" };
        }

        let pending = [...state.nightPendingDeaths];
        let healUsed = state.witchHealUsed;
        let poisonUsed = state.witchPoisonUsed;
        let savedPlayerId = state.witchSavedPlayerId;

        if (action.action === "save" && !state.witchHealUsed) {
          // Save wolf victim
          pending = pending.filter((d) => d.reason !== "wolf");
          healUsed = true;
          savedPlayerId = state.wolfVictimId;
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
            witchSavedPlayerId: savedPlayerId,
            witchActionDone: true,
          },
          newPhase: state.phase,
        };
      }

      // Action: Hunter shoot on death
      case "HUNTER_SHOOT": {
        if (state.phase !== "HUNTER_REVENGE" || actorPlayerId !== state.hunterShooterId) {
          return { success: false, newState: state, newPhase: state.phase, error: "Only the dying hunter can shoot" };
        }
        const target = state.playerStates[action.targetPlayerId];
        if (!target || !target.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "Target dead or invalid" };
        }

        const nextPlayerStates = { ...state.playerStates };
        nextPlayerStates[action.targetPlayerId] = {
          ...nextPlayerStates[action.targetPlayerId],
          isAlive: false,
          deathRound: state.round,
          deathReason: "hunter",
        };

        const win = evaluateWinCondition(nextPlayerStates);
        if (win) {
          return {
            success: true,
            newState: {
              ...state,
              playerStates: nextPlayerStates,
              phase: "GAME_OVER",
              winner: win,
              hunterShooterId: undefined,
            },
            newPhase: "GAME_OVER",
          };
        }

        const hasAliveSeer = Object.values(nextPlayerStates).some((p) => p.role === "seer" && p.isAlive);
        const nextNightPhase = hasAliveSeer ? "NIGHT_SEER" : "NIGHT_WOLF";

        return {
          success: true,
          newState: {
            ...state,
            playerStates: nextPlayerStates,
            round: state.round + 1,
            phase: nextNightPhase,
            hunterShooterId: undefined,
            wolfVotes: {},
            wolfSignals: [],
            nightPendingDeaths: [],
            dayVotes: {},
            narrationKey: "الصياد قتل " + (ctx.players.find((p) => p.id === action.targetPlayerId)?.nickname || "") + "! المدينة تنعس من جديد 🌙",
          },
          newPhase: nextNightPhase,
          timerDurationMs: 30000,
        };
      }

      // Action: Day Vote
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
      phase: state.phase,
      round: state.round,
      stateVersion,
      publicData: {
        phase: state.phase,
        narrationKey: state.narrationKey,
        livingPlayersCount,
        livingWolfVotesCount,
        totalLivingWolves,
        lastEliminatedPlayerId: state.lastEliminatedPlayerId,
        hunterShooterId: state.hunterShooterId,
        nightSummary: state.nightSummary,
        recentDeaths: state.nightSummary?.deaths.map((d) => d.playerId) || [],
        savedPlayerId: state.nightSummary?.savedPlayerId,
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

    // If game is over, reveal all roles
    if (state.phase === "GAME_OVER") {
      privateData.allRoles = Object.fromEntries(
        Object.entries(state.playerStates).map(([id, p]) => [id, p.role])
      );
    }

    if (player.isAlive) {
      // Seer View
      if (state.phase === "NIGHT_SEER" && player.role === "seer") {
        allowedActions.push("SEER_INSPECT");
        privateData.seerHistory = state.seerHistory;
        privateData.seerTarget = state.seerTarget;
      }

      // Wolf View
      if (state.phase === "NIGHT_WOLF" && player.role === "wolf") {
        allowedActions.push("WOLF_VOTE", "WOLF_SIGNAL");
        privateData.packMembers = Object.values(state.playerStates)
          .filter((p) => p.role === "wolf" && p.isAlive)
          .map((p) => p.playerId);
        privateData.currentWolfVotes = state.wolfVotes;
        privateData.wolfSignals = state.wolfSignals || [];
      }

      // Witch View
      if (state.phase === "NIGHT_WITCH" && player.role === "witch") {
        allowedActions.push("WITCH_DECIDE");
        privateData.canHeal = !state.witchHealUsed;
        privateData.canPoison = !state.witchPoisonUsed;
        privateData.victimId = state.wolfVictimId;
        privateData.witchActionDone = state.witchActionDone;
      }

      // Hunter Revenge View
      if (state.phase === "HUNTER_REVENGE" && player.playerId === state.hunterShooterId) {
        allowedActions.push("HUNTER_SHOOT");
      }

      // Day Vote View
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
  pendingDeaths: Array<{ playerId: string; reason: "wolf" | "witch" | "hunter" }>,
  wolfVictimId?: string,
  savedPlayerId?: string
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

  const nightSummary: DibNightSummary = {
    deaths: pendingDeaths,
    wolfVictimId,
    savedPlayerId,
  };

  const win = evaluateWinCondition(nextPlayerStates);
  if (win) {
    return {
      success: true,
      newState: {
        ...state,
        playerStates: nextPlayerStates,
        phase: "GAME_OVER",
        nightSummary,
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
      nightSummary,
      narrationKey: "الصباح طلع والقرية كتفيق ☀️ ... شوفو شكون توفى هاد الليلة!",
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
