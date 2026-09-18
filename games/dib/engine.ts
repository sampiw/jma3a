import { GameCapability, Player, PublicGameView, PrivatePlayerGameView } from "@/lib/types";
import { GameContext, GameDefinition, GameEndResult, TransitionResult, ValidationResult } from "@/games/registry";

export type DibRole = "villager" | "wolf" | "seer" | "witch" | "hunter";

export type DeathCause = "WOLF_ATTACK" | "WITCH_POISON" | "DAY_VOTE" | "HUNTER_SHOT" | "FORFEIT";

export interface DeathRecord {
  playerId: string;
  round: number;
  sequence: number;
  causes: DeathCause[];
  primaryCause: DeathCause;
  revealedRole?: DibRole;
}

export interface PendingReaction {
  id: string;
  type: "HUNTER_SHOT";
  actorPlayerId: string;
  causedByEventId?: string;
  deadlineAt?: number;
}

export interface ResolutionSummary {
  deaths: DeathRecord[];
  survivors: string[];
  savedPlayerId?: string;
  wolfVictimId?: string;
}

export type DibPhase =
  | "ROLE_REVEAL"
  | "NIGHT_INTRO"
  | "NIGHT_SEER"
  | "NIGHT_WOLVES"
  | "NIGHT_WITCH"
  | "NIGHT_RESOLUTION"
  | "REACTION_QUEUE"
  | "DAY_ANNOUNCEMENT"
  | "DISCUSSION"
  | "DAY_VOTE"
  | "RUNOFF"
  | "DAY_RESOLUTION"
  | "GAME_OVER";

export interface DibPlayerState {
  playerId: string;
  role: DibRole;
  team: "VILLAGE" | "WOLVES";
  isAlive: boolean;
  death?: DeathRecord;
}

export interface DibSettings {
  discussionDurationSeconds: number;
  seerExactRole: boolean; // default false: alignment only (WOLF / NOT_WOLF)
  roleRevealOnDeath: boolean; // default true
  witchSeesVictim: boolean; // default true
  customRoles?: Partial<Record<DibRole, number>>;
  timingPreset?: "fast" | "classic" | "relaxed";
}

export interface SeerInspection {
  round: number;
  targetId: string;
  alignment: "WOLF" | "NOT_WOLF";
  role?: DibRole;
}

export interface DibState {
  playerStates: Record<string, DibPlayerState>;
  phase: DibPhase;
  round: number;
  eventSequence: number;

  // Seer
  seerCurrentInspection?: SeerInspection;
  seerHistory: SeerInspection[];

  // Wolves
  wolfVotes: Record<string, string>; // wolfPlayerId -> targetPlayerId
  wolfResolvedVictimId?: string; // Resolved target for Witch & Night Resolution

  // Witch
  witch: {
    healAvailable: boolean;
    poisonAvailable: boolean;
  };
  witchActionDone: boolean;
  witchSavedPlayerId?: string;
  witchPoisonTargetId?: string;

  // Reaction Queue (Chained hunter revenge shots)
  pendingReactions: PendingReaction[];
  activeReactionIndex: number;
  reactionReturnPhase?: DibPhase; // Where to return once reaction queue is empty

  // Resolution
  lastResolution?: ResolutionSummary;

  // Day voting & Runoff
  dayVotes: Record<string, string>; // voterId -> targetPlayerId | "ABSTAIN"
  runoffCandidates?: string[];
  runoffVotes?: Record<string, string>;

  // Timers & Narration
  phaseDeadlineAt?: number;
  narrationKey?: string;
  winner?: "VILLAGE" | "WOLVES" | "DRAW";
}

export type DibAction =
  | { type: "ACK_ROLE" }
  | { type: "SEER_INSPECT"; targetPlayerId: string }
  | { type: "WOLF_VOTE"; targetPlayerId: string }
  | { type: "WITCH_ACTION"; healWolfVictim: boolean; poisonTargetId?: string }
  | { type: "DAY_VOTE"; targetPlayerId: string }
  | { type: "RUNOFF_VOTE"; targetPlayerId: string }
  | { type: "HUNTER_SHOOT"; targetPlayerId: string }
  | { type: "NEXT_PHASE" };

/**
 * Standard JMA3A Role Distribution table (6 to 18 players)
 */
export function getRecommendedRoleDistribution(playerCount: number): Record<DibRole, number> {
  const count = Math.max(6, Math.min(18, playerCount));
  switch (count) {
    case 6:
      return { wolf: 2, seer: 1, witch: 0, hunter: 0, villager: 3 };
    case 7:
      return { wolf: 2, seer: 1, witch: 0, hunter: 0, villager: 4 };
    case 8:
      return { wolf: 2, seer: 1, witch: 1, hunter: 0, villager: 4 };
    case 9:
      return { wolf: 2, seer: 1, witch: 1, hunter: 1, villager: 4 };
    case 10:
      return { wolf: 3, seer: 1, witch: 1, hunter: 1, villager: 4 };
    case 11:
      return { wolf: 3, seer: 1, witch: 1, hunter: 1, villager: 5 };
    case 12:
      return { wolf: 3, seer: 1, witch: 1, hunter: 1, villager: 6 };
    case 13:
      return { wolf: 3, seer: 1, witch: 1, hunter: 1, villager: 7 };
    case 14:
      return { wolf: 4, seer: 1, witch: 1, hunter: 1, villager: 7 };
    case 15:
      return { wolf: 4, seer: 1, witch: 1, hunter: 1, villager: 8 };
    case 16:
      return { wolf: 4, seer: 1, witch: 1, hunter: 1, villager: 9 };
    case 17:
      return { wolf: 4, seer: 1, witch: 1, hunter: 1, villager: 10 };
    case 18:
    default:
      return { wolf: 4, seer: 1, witch: 1, hunter: 1, villager: 11 };
  }
}

/**
 * Evaluates winner behind resolution barrier:
 * Wolves >= living non-wolves => WOLVES
 * Wolves == 0 && non-wolves > 0 => VILLAGE
 * Wolves == 0 && non-wolves == 0 => DRAW
 */
export function determineWinner(playerStates: Record<string, DibPlayerState>): "VILLAGE" | "WOLVES" | "DRAW" | null {
  const living = Object.values(playerStates).filter((p) => p.isAlive);
  const livingWolves = living.filter((p) => p.role === "wolf").length;
  const livingNonWolves = living.length - livingWolves;

  if (livingWolves === 0 && livingNonWolves === 0) return "DRAW";
  if (livingWolves === 0 && livingNonWolves > 0) return "VILLAGE";
  if (livingWolves >= livingNonWolves) return "WOLVES";
  return null;
}

/**
 * Resolves plurality wolf target. Tie for first place = no kill.
 */
export function resolveWolfPlurality(
  votes: Record<string, string>,
  playerStates: Record<string, DibPlayerState>
): string | undefined {
  const counts: Record<string, number> = {};
  for (const targetId of Object.values(votes)) {
    if (!targetId || targetId === "ABSTAIN") continue;
    const target = playerStates[targetId];
    if (target && target.isAlive && target.role !== "wolf") {
      counts[targetId] = (counts[targetId] || 0) + 1;
    }
  }

  let topCount = 0;
  let topCandidates: string[] = [];

  for (const [candidateId, count] of Object.entries(counts)) {
    if (count > topCount) {
      topCount = count;
      topCandidates = [candidateId];
    } else if (count === topCount) {
      topCandidates.push(candidateId);
    }
  }

  // Unique plurality winner required
  if (topCount > 0 && topCandidates.length === 1) {
    return topCandidates[0];
  }

  // Tied for first place = no kill!
  return undefined;
}

export const DibEngine: GameDefinition<DibState, DibAction, DibSettings> = {
  id: "dib",
  slug: "dib",
  version: 2,
  displayNameKey: "dib.name",
  shortDescriptionKey: "dib.description",
  minPlayers: 6,
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
    seerExactRole: false,
    roleRevealOnDeath: true,
    witchSeesVictim: true,
    timingPreset: "classic",
  },

  validateSetup(players: Player[], settings: DibSettings): ValidationResult {
    if (players.length < 6) {
      return { isValid: false, errors: ["لعبة الذيب كتحتاج على الأقل 6 ديال اللاعبين (من المستحسن 8 فأكثر)."] };
    }
    if (players.length > 18) {
      return { isValid: false, errors: ["الحد الأقصى للاعبين هو 18."] };
    }

    if (settings.customRoles) {
      const wolves = settings.customRoles.wolf ?? 0;
      const seer = settings.customRoles.seer ?? 0;
      const witch = settings.customRoles.witch ?? 0;
      const hunter = settings.customRoles.hunter ?? 0;
      const specialsTotal = wolves + seer + witch + hunter;

      if (wolves < 1) {
        return { isValid: false, errors: ["ضروري تختار ذيب واحد على الأقل 🐺"] };
      }
      if (wolves >= players.length) {
        return { isValid: false, errors: ["عدد الذيابة ما يمكنش يتجاوز ولا يساوي عدد اللاعبين كاملاً."] };
      }
      if (specialsTotal > players.length) {
        return { isValid: false, errors: ["مجموع الشخصيات الخاصة أكبر من عدد اللاعبين المتاحين!"] };
      }
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: DibSettings): DibState {
    const roleCounts = settings.customRoles
      ? {
          wolf: settings.customRoles.wolf ?? 2,
          seer: settings.customRoles.seer ?? 1,
          witch: settings.customRoles.witch ?? 1,
          hunter: settings.customRoles.hunter ?? 0,
          villager: Math.max(
            0,
            players.length -
              ((settings.customRoles.wolf ?? 2) +
                (settings.customRoles.seer ?? 1) +
                (settings.customRoles.witch ?? 1) +
                (settings.customRoles.hunter ?? 0))
          ),
        }
      : getRecommendedRoleDistribution(players.length);

    // Build role deck
    const deck: DibRole[] = [];
    for (const [r, count] of Object.entries(roleCounts)) {
      for (let i = 0; i < count; i++) {
        deck.push(r as DibRole);
      }
    }

    // Fill remaining with villagers if needed
    while (deck.length < players.length) {
      deck.push("villager");
    }

    // Fisher-Yates Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    const playerStates: Record<string, DibPlayerState> = {};
    players.forEach((p, idx) => {
      const role = deck[idx];
      playerStates[p.id] = {
        playerId: p.id,
        role,
        team: role === "wolf" ? "WOLVES" : "VILLAGE",
        isAlive: true,
      };
    });

    return {
      playerStates,
      phase: "ROLE_REVEAL",
      round: 1,
      eventSequence: 1,
      seerHistory: [],
      wolfVotes: {},
      witch: {
        healAvailable: true,
        poisonAvailable: true,
      },
      witchActionDone: false,
      pendingReactions: [],
      activeReactionIndex: 0,
      dayVotes: {},
      narrationKey: "dib.roleReveal",
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
    const { state, settings } = ctx;
    const actor = state.playerStates[actorPlayerId];

    if (!actor) {
      return { success: false, newState: state, newPhase: state.phase, error: "لاعب غير معروف" };
    }

    switch (action.type) {
      // -------------------------------------------------------------
      // ACTION: SEER INSPECT
      // -------------------------------------------------------------
      case "SEER_INSPECT": {
        if (state.phase !== "NIGHT_SEER" || actor.role !== "seer" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "ليس دور الشوافة الآن" };
        }
        if (state.seerCurrentInspection) {
          return { success: false, newState: state, newPhase: state.phase, error: "قمتي بالكشف مسبقاً لهاته الليلة" };
        }

        const target = state.playerStates[action.targetPlayerId];
        if (!target || !target.isAlive || target.playerId === actorPlayerId) {
          return { success: false, newState: state, newPhase: state.phase, error: "الهدف غير صالح للكشف" };
        }

        const inspection: SeerInspection = {
          round: state.round,
          targetId: target.playerId,
          alignment: target.role === "wolf" ? "WOLF" : "NOT_WOLF",
          role: settings.seerExactRole ? target.role : undefined,
        };

        return {
          success: true,
          newState: {
            ...state,
            seerCurrentInspection: inspection,
            seerHistory: [...state.seerHistory, inspection],
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      // -------------------------------------------------------------
      // ACTION: WOLF VOTE
      // -------------------------------------------------------------
      case "WOLF_VOTE": {
        if (state.phase !== "NIGHT_WOLVES" || actor.role !== "wolf" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "ليس دور الذيابة الآن" };
        }

        const target = state.playerStates[action.targetPlayerId];
        if (!target || !target.isAlive || target.role === "wolf") {
          return { success: false, newState: state, newPhase: state.phase, error: "الهدف غير صالح (لا يمكن استهداف ذيب)" };
        }

        const newWolfVotes = {
          ...state.wolfVotes,
          [actorPlayerId]: action.targetPlayerId,
        };

        return {
          success: true,
          newState: {
            ...state,
            wolfVotes: newWolfVotes,
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      // -------------------------------------------------------------
      // ACTION: WITCH DUAL POTION ACTION
      // -------------------------------------------------------------
      case "WITCH_ACTION": {
        if (state.phase !== "NIGHT_WITCH" || actor.role !== "witch" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "ليس دور السحارة الآن" };
        }
        if (state.witchActionDone) {
          return { success: false, newState: state, newPhase: state.phase, error: "تم تسجيل قرارات السحارة مسبقاً" };
        }

        let healAvailable = state.witch.healAvailable;
        let poisonAvailable = state.witch.poisonAvailable;
        let savedPlayerId: string | undefined = undefined;
        let poisonTargetId: string | undefined = undefined;

        // Healing validation:
        if (action.healWolfVictim) {
          if (!healAvailable) {
            return { success: false, newState: state, newPhase: state.phase, error: "جرعة الحياة تم استهلاكها مسبقاً" };
          }
          if (state.wolfResolvedVictimId) {
            healAvailable = false;
            savedPlayerId = state.wolfResolvedVictimId;
          }
        }

        // Poisoning validation:
        if (action.poisonTargetId) {
          if (!poisonAvailable) {
            return { success: false, newState: state, newPhase: state.phase, error: "جرعة السم تم استهلاكها مسبقاً" };
          }
          const target = state.playerStates[action.poisonTargetId];
          if (!target || !target.isAlive || target.playerId === actorPlayerId) {
            return { success: false, newState: state, newPhase: state.phase, error: "هدف السم غير صالح (لا يمكن تسميم النفس)" };
          }
          poisonAvailable = false;
          poisonTargetId = action.poisonTargetId;
        }

        return {
          success: true,
          newState: {
            ...state,
            witch: {
              healAvailable,
              poisonAvailable,
            },
            witchActionDone: true,
            witchSavedPlayerId: savedPlayerId,
            witchPoisonTargetId: poisonTargetId,
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      // -------------------------------------------------------------
      // ACTION: HUNTER REVENGE SHOT
      // -------------------------------------------------------------
      case "HUNTER_SHOOT": {
        if (state.phase !== "REACTION_QUEUE" || state.pendingReactions.length === 0) {
          return { success: false, newState: state, newPhase: state.phase, error: "لا توجد رصاصة معلقة للصياد الآن" };
        }

        const activeReaction = state.pendingReactions[0];
        if (activeReaction.actorPlayerId !== actorPlayerId) {
          return { success: false, newState: state, newPhase: state.phase, error: "ليس دور هذا الصياد لإطلاق النار" };
        }

        const target = state.playerStates[action.targetPlayerId];
        if (!target || !target.isAlive || target.playerId === actorPlayerId) {
          return { success: false, newState: state, newPhase: state.phase, error: "الهدف ميت أو غير صالح للرصاصة" };
        }

        // Apply Hunter shot death
        const nextPlayerStates = { ...state.playerStates };
        const deathRecord: DeathRecord = {
          playerId: target.playerId,
          round: state.round,
          sequence: state.eventSequence + 1,
          causes: ["HUNTER_SHOT"],
          primaryCause: "HUNTER_SHOT",
          revealedRole: settings.roleRevealOnDeath ? target.role : undefined,
        };

        nextPlayerStates[target.playerId] = {
          ...target,
          isAlive: false,
          death: deathRecord,
        };

        // Pop current reaction
        const nextQueue = state.pendingReactions.slice(1);

        // Chain Hunter reaction if target was also Hunter!
        if (target.role === "hunter") {
          nextQueue.push({
            id: `react_hunter_${target.playerId}_${Date.now()}`,
            type: "HUNTER_SHOT",
            actorPlayerId: target.playerId,
          });
        }

        // Update resolution record
        const nextLastResolution: ResolutionSummary = state.lastResolution
          ? {
              ...state.lastResolution,
              deaths: [...state.lastResolution.deaths, deathRecord],
              survivors: Object.values(nextPlayerStates).filter((p) => p.isAlive).map((p) => p.playerId),
            }
          : {
              deaths: [deathRecord],
              survivors: Object.values(nextPlayerStates).filter((p) => p.isAlive).map((p) => p.playerId),
            };

        // If reaction queue has more items, stay in REACTION_QUEUE
        if (nextQueue.length > 0) {
          return {
            success: true,
            newState: {
              ...state,
              playerStates: nextPlayerStates,
              pendingReactions: nextQueue,
              lastResolution: nextLastResolution,
              eventSequence: state.eventSequence + 2,
            },
            newPhase: "REACTION_QUEUE",
          };
        }

        // When reaction queue finishes, evaluate win condition
        const win = determineWinner(nextPlayerStates);
        if (win) {
          return {
            success: true,
            newState: {
              ...state,
              playerStates: nextPlayerStates,
              pendingReactions: [],
              lastResolution: nextLastResolution,
              phase: "GAME_OVER",
              winner: win,
              eventSequence: state.eventSequence + 2,
            },
            newPhase: "GAME_OVER",
          };
        }

        // Return to designated phase (e.g. DAY_ANNOUNCEMENT after night, or NIGHT_INTRO after day)
        const returnPhase = state.reactionReturnPhase || "DAY_ANNOUNCEMENT";
        return {
          success: true,
          newState: {
            ...state,
            playerStates: nextPlayerStates,
            pendingReactions: [],
            lastResolution: nextLastResolution,
            phase: returnPhase,
            reactionReturnPhase: undefined,
            eventSequence: state.eventSequence + 2,
          },
          newPhase: returnPhase,
        };
      }

      // -------------------------------------------------------------
      // ACTION: DAY VOTE
      // -------------------------------------------------------------
      case "DAY_VOTE": {
        if (state.phase !== "DAY_VOTE" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "ليس وقت التصويت الآن أو اللاعب مقصى" };
        }

        if (action.targetPlayerId && action.targetPlayerId !== "ABSTAIN") {
          const target = state.playerStates[action.targetPlayerId];
          if (!target || !target.isAlive) {
            return { success: false, newState: state, newPhase: state.phase, error: "الهدف المصوت عليه غير صالح" };
          }
        }

        const newVotes = {
          ...state.dayVotes,
          [actorPlayerId]: action.targetPlayerId,
        };

        return {
          success: true,
          newState: {
            ...state,
            dayVotes: newVotes,
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      // -------------------------------------------------------------
      // ACTION: RUNOFF VOTE
      // -------------------------------------------------------------
      case "RUNOFF_VOTE": {
        if (state.phase !== "RUNOFF" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "ليس وقت تصويت جولة الحسم (الروندوف)" };
        }

        if (!state.runoffCandidates || !state.runoffCandidates.includes(action.targetPlayerId)) {
          if (action.targetPlayerId !== "ABSTAIN") {
            return { success: false, newState: state, newPhase: state.phase, error: "التصويت محصور فقط بين المرشحين المتعادلين" };
          }
        }

        const newRunoffVotes = {
          ...(state.runoffVotes || {}),
          [actorPlayerId]: action.targetPlayerId,
        };

        return {
          success: true,
          newState: {
            ...state,
            runoffVotes: newRunoffVotes,
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      // -------------------------------------------------------------
      // ACTION: NEXT_PHASE (Deterministic State Machine Transitions)
      // -------------------------------------------------------------
      case "NEXT_PHASE": {
        return advancePhase(state, settings);
      }

      default:
        return { success: false, newState: state, newPhase: state.phase, error: "أمر غير معروف" };
    }
  },

  getPublicView(ctx: GameContext<DibState, DibSettings>): PublicGameView {
    const { state } = ctx;
    const livingPlayers = Object.values(state.playerStates).filter((p) => p.isAlive);
    const livingWolvesCount = livingPlayers.filter((p) => p.role === "wolf").length;

    return {
      gameId: "dib",
      phase: state.phase,
      round: state.round,
      stateVersion: state.eventSequence,
      publicData: {
        phase: state.phase,
        round: state.round,
        narrationKey: state.narrationKey,
        livingPlayersCount: livingPlayers.length,
        totalLivingWolves: livingWolvesCount,
        livingWolfVotesCount: Object.keys(state.wolfVotes).length,
        alivePlayerIds: livingPlayers.map((p) => p.playerId),
        lastResolution: state.lastResolution,
        runoffCandidates: state.runoffCandidates,
        votesSubmittedCount: Object.keys(state.dayVotes).length,
        pendingReactionsCount: state.pendingReactions.length,
        currentShooterId: state.pendingReactions[0]?.actorPlayerId,
        winner: state.winner,
      },
    };
  },

  getPlayerView(ctx: GameContext<DibState, DibSettings>, playerId: string): PrivatePlayerGameView {
    const { state, settings } = ctx;
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
      role: player.role,
    };

    // Role reveal at game over
    if (state.phase === "GAME_OVER") {
      privateData.allRoles = Object.fromEntries(
        Object.entries(state.playerStates).map(([id, p]) => [id, p.role])
      );
    }

    if (player.isAlive) {
      // Seer View
      if (state.phase === "NIGHT_SEER" && player.role === "seer") {
        if (!state.seerCurrentInspection) {
          allowedActions.push("SEER_INSPECT");
        }
        privateData.seerCurrentInspection = state.seerCurrentInspection;
        privateData.seerHistory = state.seerHistory;
      }

      // Wolf View
      if (player.role === "wolf") {
        privateData.packMembers = Object.values(state.playerStates)
          .filter((p) => p.role === "wolf" && p.isAlive)
          .map((p) => p.playerId);
        if (state.phase === "NIGHT_WOLVES") {
          allowedActions.push("WOLF_VOTE");
          privateData.currentWolfVotes = state.wolfVotes;
          privateData.myWolfVote = state.wolfVotes[playerId];
        }
      }

      // Witch View
      if (state.phase === "NIGHT_WITCH" && player.role === "witch") {
        if (!state.witchActionDone) {
          allowedActions.push("WITCH_ACTION");
        }
        privateData.witchHealAvailable = state.witch.healAvailable;
        privateData.witchPoisonAvailable = state.witch.poisonAvailable;
        privateData.wolfVictimId = settings.witchSeesVictim && state.witch.healAvailable ? state.wolfResolvedVictimId : undefined;
        privateData.witchActionDone = state.witchActionDone;
      }

      // Day Voting View
      if (state.phase === "DAY_VOTE") {
        allowedActions.push("DAY_VOTE");
        privateData.myVote = state.dayVotes[playerId];
      }

      // Runoff Voting View
      if (state.phase === "RUNOFF") {
        allowedActions.push("RUNOFF_VOTE");
        privateData.myRunoffVote = state.runoffVotes?.[playerId];
        privateData.runoffCandidates = state.runoffCandidates;
      }

      // Hunter Reaction View
      if (state.phase === "REACTION_QUEUE" && state.pendingReactions.length > 0) {
        if (state.pendingReactions[0].actorPlayerId === playerId) {
          allowedActions.push("HUNTER_SHOOT");
        }
      }
    } else {
      // Dead hunter taking active revenge shot
      if (
        state.phase === "REACTION_QUEUE" &&
        state.pendingReactions.length > 0 &&
        state.pendingReactions[0].actorPlayerId === playerId
      ) {
        allowedActions.push("HUNTER_SHOOT");
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
    const winner = determineWinner(ctx.state.playerStates);
    if (winner) {
      return {
        isFinished: true,
        winner: {
          team: winner,
          players: Object.values(ctx.state.playerStates)
            .filter((p) => p.team === winner)
            .map((p) => p.playerId),
          summary:
            winner === "VILLAGE"
              ? "ربحو القرويين! تم القضاء على جميع الذيابة!"
              : "ربحو الذيابة! سيطروا على القرية!",
        },
      };
    }
    return null;
  },
};

/**
 * Advances the game through deterministic Loup-Garou phase cycles.
 */
function advancePhase(state: DibState, settings: DibSettings): TransitionResult<DibState> {
  const nextSeq = state.eventSequence + 1;

  switch (state.phase) {
    // ---------------------------------------------------------------
    // 1. ROLE_REVEAL -> NIGHT_INTRO
    // ---------------------------------------------------------------
    case "ROLE_REVEAL": {
      return {
        success: true,
        newState: {
          ...state,
          phase: "NIGHT_INTRO",
          narrationKey: "dib.nightIntro",
          eventSequence: nextSeq,
        },
        newPhase: "NIGHT_INTRO",
        timerDurationMs: 6000,
      };
    }

    // ---------------------------------------------------------------
    // 2. NIGHT_INTRO -> NIGHT_SEER (Always runs to prevent role deduction)
    // ---------------------------------------------------------------
    case "NIGHT_INTRO": {
      return {
        success: true,
        newState: {
          ...state,
          phase: "NIGHT_SEER",
          narrationKey: "dib.nightSeer",
          seerCurrentInspection: undefined,
          eventSequence: nextSeq,
        },
        newPhase: "NIGHT_SEER",
        timerDurationMs: 15000,
      };
    }

    // ---------------------------------------------------------------
    // 3. NIGHT_SEER -> NIGHT_WOLVES
    // ---------------------------------------------------------------
    case "NIGHT_SEER": {
      return {
        success: true,
        newState: {
          ...state,
          phase: "NIGHT_WOLVES",
          narrationKey: "dib.nightWolves",
          wolfVotes: {},
          wolfResolvedVictimId: undefined,
          eventSequence: nextSeq,
        },
        newPhase: "NIGHT_WOLVES",
        timerDurationMs: 25000,
      };
    }

    // ---------------------------------------------------------------
    // 4. NIGHT_WOLVES -> NIGHT_WITCH
    // ---------------------------------------------------------------
    case "NIGHT_WOLVES": {
      // Resolve wolf plurality ballot
      const wolfVictim = resolveWolfPlurality(state.wolfVotes, state.playerStates);

      return {
        success: true,
        newState: {
          ...state,
          phase: "NIGHT_WITCH",
          narrationKey: "dib.nightWitch",
          wolfResolvedVictimId: wolfVictim,
          witchActionDone: false,
          witchSavedPlayerId: undefined,
          witchPoisonTargetId: undefined,
          eventSequence: nextSeq,
        },
        newPhase: "NIGHT_WITCH",
        timerDurationMs: 20000,
      };
    }

    // ---------------------------------------------------------------
    // 5. NIGHT_WITCH -> NIGHT_RESOLUTION (Atomic multi-death barrier)
    // ---------------------------------------------------------------
    case "NIGHT_WITCH": {
      // Calculate final night deaths
      const nextPlayerStates = { ...state.playerStates };
      const newDeaths: DeathRecord[] = [];
      const pendingReactions: PendingReaction[] = [];

      // Determine who was attacked vs saved
      const wolfVictimId = state.wolfResolvedVictimId;
      const isSaved = wolfVictimId && state.witchSavedPlayerId === wolfVictimId;
      const poisonTargetId = state.witchPoisonTargetId;

      // Handle simultaneous deaths & deduplicate if poison targeted same as wolf
      const deathCausesMap: Record<string, DeathCause[]> = {};

      if (wolfVictimId && !isSaved) {
        if (!deathCausesMap[wolfVictimId]) deathCausesMap[wolfVictimId] = [];
        deathCausesMap[wolfVictimId].push("WOLF_ATTACK");
      }

      if (poisonTargetId) {
        if (!deathCausesMap[poisonTargetId]) deathCausesMap[poisonTargetId] = [];
        deathCausesMap[poisonTargetId].push("WITCH_POISON");
      }

      for (const [vId, causes] of Object.entries(deathCausesMap)) {
        const victim = nextPlayerStates[vId];
        if (victim && victim.isAlive) {
          const rec: DeathRecord = {
            playerId: vId,
            round: state.round,
            sequence: nextSeq,
            causes,
            primaryCause: causes[0],
            revealedRole: settings.roleRevealOnDeath ? victim.role : undefined,
          };
          nextPlayerStates[vId] = {
            ...victim,
            isAlive: false,
            death: rec,
          };
          newDeaths.push(rec);

          // Queue Hunter revenge shot if dead victim is Hunter!
          if (victim.role === "hunter") {
            pendingReactions.push({
              id: `react_hunter_${vId}_${Date.now()}`,
              type: "HUNTER_SHOT",
              actorPlayerId: vId,
            });
          }
        }
      }

      const resolutionSummary: ResolutionSummary = {
        deaths: newDeaths,
        survivors: Object.values(nextPlayerStates).filter((p) => p.isAlive).map((p) => p.playerId),
        savedPlayerId: isSaved ? wolfVictimId : undefined,
        wolfVictimId,
      };

      // If any Hunters died, jump to REACTION_QUEUE before day announcement
      if (pendingReactions.length > 0) {
        return {
          success: true,
          newState: {
            ...state,
            playerStates: nextPlayerStates,
            phase: "REACTION_QUEUE",
            pendingReactions,
            reactionReturnPhase: "DAY_ANNOUNCEMENT",
            lastResolution: resolutionSummary,
            narrationKey: "dib.hunterRevenge",
            eventSequence: nextSeq,
          },
          newPhase: "REACTION_QUEUE",
          timerDurationMs: 25000,
        };
      }

      // Check win condition behind resolution barrier
      const win = determineWinner(nextPlayerStates);
      if (win) {
        return {
          success: true,
          newState: {
            ...state,
            playerStates: nextPlayerStates,
            phase: "GAME_OVER",
            winner: win,
            lastResolution: resolutionSummary,
            narrationKey: "dib.gameOver",
            eventSequence: nextSeq,
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
          lastResolution: resolutionSummary,
          narrationKey: "dib.dayAnnouncement",
          eventSequence: nextSeq,
        },
        newPhase: "DAY_ANNOUNCEMENT",
        timerDurationMs: 8000,
      };
    }

    // ---------------------------------------------------------------
    // 6. DAY_ANNOUNCEMENT -> DISCUSSION
    // ---------------------------------------------------------------
    case "DAY_ANNOUNCEMENT": {
      return {
        success: true,
        newState: {
          ...state,
          phase: "DISCUSSION",
          narrationKey: "dib.discussion",
          eventSequence: nextSeq,
        },
        newPhase: "DISCUSSION",
        timerDurationMs: settings.discussionDurationSeconds * 1000,
      };
    }

    // ---------------------------------------------------------------
    // 7. DISCUSSION -> DAY_VOTE
    // ---------------------------------------------------------------
    case "DISCUSSION": {
      return {
        success: true,
        newState: {
          ...state,
          phase: "DAY_VOTE",
          dayVotes: {},
          narrationKey: "dib.dayVote",
          eventSequence: nextSeq,
        },
        newPhase: "DAY_VOTE",
        timerDurationMs: 30000,
      };
    }

    // ---------------------------------------------------------------
    // 8. DAY_VOTE -> RUNOFF or DAY_RESOLUTION
    // ---------------------------------------------------------------
    case "DAY_VOTE": {
      const livingPlayers = Object.values(state.playerStates).filter((p) => p.isAlive);
      const eligibleCount = livingPlayers.length;
      const votes = state.dayVotes;

      // Quorum check: >= 50% + 1 of living voters
      const validSubmissionsCount = Object.keys(votes).length;
      const quorumMet = validSubmissionsCount >= Math.floor(eligibleCount / 2) + 1;

      if (!quorumMet) {
        // Insufficient quorum => nobody eliminated!
        return {
          success: true,
          newState: {
            ...state,
            phase: "NIGHT_INTRO",
            round: state.round + 1,
            narrationKey: "dib.noQuorumNightIntro",
            lastResolution: {
              deaths: [],
              survivors: livingPlayers.map((p) => p.playerId),
            },
            eventSequence: nextSeq,
          },
          newPhase: "NIGHT_INTRO",
          timerDurationMs: 6000,
        };
      }

      // Count candidate votes
      const voteCounts: Record<string, number> = {};
      for (const targetId of Object.values(votes)) {
        if (!targetId || targetId === "ABSTAIN") continue;
        if (state.playerStates[targetId]?.isAlive) {
          voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
        }
      }

      let topCount = 0;
      let topCandidates: string[] = [];
      for (const [cId, count] of Object.entries(voteCounts)) {
        if (count > topCount) {
          topCount = count;
          topCandidates = [cId];
        } else if (count === topCount) {
          topCandidates.push(cId);
        }
      }

      // If tie for top candidate => trigger RUNOFF among tied candidates
      if (topCandidates.length > 1 && topCount > 0) {
        return {
          success: true,
          newState: {
            ...state,
            phase: "RUNOFF",
            runoffCandidates: topCandidates,
            runoffVotes: {},
            narrationKey: "dib.runoff",
            eventSequence: nextSeq,
          },
          newPhase: "RUNOFF",
          timerDurationMs: 20000,
        };
      }

      // If no votes cast or topCount === 0 => nobody eliminated
      if (topCandidates.length === 0 || topCount === 0) {
        return {
          success: true,
          newState: {
            ...state,
            phase: "NIGHT_INTRO",
            round: state.round + 1,
            narrationKey: "dib.nightIntro",
            lastResolution: {
              deaths: [],
              survivors: livingPlayers.map((p) => p.playerId),
            },
            eventSequence: nextSeq,
          },
          newPhase: "NIGHT_INTRO",
          timerDurationMs: 6000,
        };
      }

      // Unique winner eliminated!
      return resolveElimination(state, settings, topCandidates[0], nextSeq);
    }

    // ---------------------------------------------------------------
    // 9. RUNOFF -> DAY_RESOLUTION
    // ---------------------------------------------------------------
    case "RUNOFF": {
      const candidates = state.runoffCandidates || [];
      const votes = state.runoffVotes || {};
      const livingPlayers = Object.values(state.playerStates).filter((p) => p.isAlive);

      const counts: Record<string, number> = {};
      for (const c of candidates) counts[c] = 0;

      for (const targetId of Object.values(votes)) {
        if (candidates.includes(targetId)) {
          counts[targetId] = (counts[targetId] || 0) + 1;
        }
      }

      let topCount = 0;
      let topCandidates: string[] = [];
      for (const [cId, count] of Object.entries(counts)) {
        if (count > topCount) {
          topCount = count;
          topCandidates = [cId];
        } else if (count === topCount) {
          topCandidates.push(cId);
        }
      }

      // If runoff ties again => no elimination!
      if (topCandidates.length !== 1 || topCount === 0) {
        return {
          success: true,
          newState: {
            ...state,
            phase: "NIGHT_INTRO",
            round: state.round + 1,
            narrationKey: "dib.runoffTieNoElimination",
            lastResolution: {
              deaths: [],
              survivors: livingPlayers.map((p) => p.playerId),
            },
            runoffCandidates: undefined,
            runoffVotes: undefined,
            eventSequence: nextSeq,
          },
          newPhase: "NIGHT_INTRO",
          timerDurationMs: 6000,
        };
      }

      // Unique runoff winner eliminated!
      return resolveElimination(state, settings, topCandidates[0], nextSeq);
    }

    default:
      return { success: false, newState: state, newPhase: state.phase, error: "لا يمكن الانتقال من هاته المرحلة تلقائياً" };
  }
}

/**
 * Resolves day elimination, checks for hunter reactions and win conditions.
 */
function resolveElimination(
  state: DibState,
  settings: DibSettings,
  eliminatedPlayerId: string,
  seq: number
): TransitionResult<DibState> {
  const nextPlayerStates = { ...state.playerStates };
  const target = nextPlayerStates[eliminatedPlayerId];

  if (!target || !target.isAlive) {
    return {
      success: true,
      newState: {
        ...state,
        phase: "NIGHT_INTRO",
        round: state.round + 1,
        eventSequence: seq,
      },
      newPhase: "NIGHT_INTRO",
    };
  }

  const deathRecord: DeathRecord = {
    playerId: eliminatedPlayerId,
    round: state.round,
    sequence: seq,
    causes: ["DAY_VOTE"],
    primaryCause: "DAY_VOTE",
    revealedRole: settings.roleRevealOnDeath ? target.role : undefined,
  };

  nextPlayerStates[eliminatedPlayerId] = {
    ...target,
    isAlive: false,
    death: deathRecord,
  };

  const resolutionSummary: ResolutionSummary = {
    deaths: [deathRecord],
    survivors: Object.values(nextPlayerStates).filter((p) => p.isAlive).map((p) => p.playerId),
  };

  // If eliminated player is Hunter: enqueue reaction
  if (target.role === "hunter") {
    return {
      success: true,
      newState: {
        ...state,
        playerStates: nextPlayerStates,
        phase: "REACTION_QUEUE",
        pendingReactions: [
          {
            id: `react_hunter_${eliminatedPlayerId}_${Date.now()}`,
            type: "HUNTER_SHOT",
            actorPlayerId: eliminatedPlayerId,
          },
        ],
        reactionReturnPhase: "NIGHT_INTRO",
        lastResolution: resolutionSummary,
        narrationKey: "dib.hunterRevenge",
        runoffCandidates: undefined,
        runoffVotes: undefined,
        eventSequence: seq + 1,
      },
      newPhase: "REACTION_QUEUE",
      timerDurationMs: 25000,
    };
  }

  // Check win condition
  const win = determineWinner(nextPlayerStates);
  if (win) {
    return {
      success: true,
      newState: {
        ...state,
        playerStates: nextPlayerStates,
        phase: "GAME_OVER",
        winner: win,
        lastResolution: resolutionSummary,
        runoffCandidates: undefined,
        runoffVotes: undefined,
        eventSequence: seq + 1,
      },
      newPhase: "GAME_OVER",
    };
  }

  // Advance to next night
  return {
    success: true,
    newState: {
      ...state,
      playerStates: nextPlayerStates,
      phase: "NIGHT_INTRO",
      round: state.round + 1,
      lastResolution: resolutionSummary,
      runoffCandidates: undefined,
      runoffVotes: undefined,
      narrationKey: "dib.nightIntro",
      eventSequence: seq + 1,
    },
    newPhase: "NIGHT_INTRO",
    timerDurationMs: 6000,
  };
}
