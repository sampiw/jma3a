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
  | "NIGHT_RELAY_PRIMARY"
  | "NIGHT_RELAY_WITCH"
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
  seatIndex: number;
  death?: DeathRecord;
}

export interface DibSettings {
  discussionDurationSeconds: number; // default: 180 (3 min)
  seerRevealMode: "EXACT_ROLE" | "ALIGNMENT_ONLY"; // default: "EXACT_ROLE" (Classic)
  dayTieRule: "NO_ELIMINATION" | "RUNOFF"; // default: "NO_ELIMINATION" (Classic)
  roleRevealOnDeath: boolean; // default: true
  witchSeesVictim: boolean; // default: true
  privacyTransitionMinMs: number; // default: 3000ms
  customRoles?: Partial<Record<DibRole, number>>;
  timingPreset?: "fast" | "classic" | "relaxed";
  preset?: "classic" | "quick";
  interactionMode?: "MULTI_PHONE" | "ONE_PHONE" | "HYBRID";
}

export interface SeerInspection {
  round: number;
  targetId: string;
  alignment: "WOLF" | "NOT_WOLF";
  role?: DibRole;
}

export interface RelayState {
  pass: "PRIMARY" | "WITCH";
  queue: string[]; // List of living player IDs in strict seating order (NEVER based on role!)
  currentIndex: number;
  turnStartedAt: number;
  privacyUnlocked: boolean;
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
  pendingWolfVictimId?: string; // PENDING attack, NOT a death record yet!
  wolfResolvedVictimId?: string; // Backwards-compatible alias

  // Witch
  witch: {
    healAvailable: boolean;
    poisonAvailable: boolean;
  };
  witchActionDone: boolean;
  witchSavedPlayerId?: string;
  witchPoisonTargetId?: string;

  // One-Phone Privacy Relay
  relayState?: RelayState;

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
  | { type: "NEXT_PHASE" }
  // One-Phone Relay Actions
  | { type: "RELAY_UNLOCK" }
  | { type: "RELAY_FINISH_TURN" };

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

/**
 * Builds relay queue for One-Phone mode.
 * STRICT SECURITY INVARIANT:
 * Sorted strictly by seatIndex (or player ID).
 * MUST NEVER inspect, sort by, filter by, or prioritize based on player.role!
 */
export function buildSeatingRelayQueue(playerStates: Record<string, DibPlayerState>): string[] {
  return Object.values(playerStates)
    .filter((p) => p.isAlive)
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((p) => p.playerId);
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
    discussionDurationSeconds: 180,
    seerRevealMode: "EXACT_ROLE",
    dayTieRule: "NO_ELIMINATION",
    roleRevealOnDeath: true,
    witchSeesVictim: true,
    privacyTransitionMinMs: 3000,
    preset: "classic",
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
        seatIndex: idx,
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
        const isOnePhoneSeer =
          state.phase === "NIGHT_RELAY_PRIMARY" &&
          state.relayState?.queue[state.relayState.currentIndex] === actorPlayerId;

        if (state.phase !== "NIGHT_SEER" && !isOnePhoneSeer) {
          return { success: false, newState: state, newPhase: state.phase, error: "ليس دور الشوافة الآن" };
        }
        if (actor.role !== "seer" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "فقط الشوافة الحية يمكنها الكشف" };
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
          role: settings.seerRevealMode === "ALIGNMENT_ONLY" ? undefined : target.role,
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
        const isOnePhoneWolf =
          state.phase === "NIGHT_RELAY_PRIMARY" &&
          state.relayState?.queue[state.relayState.currentIndex] === actorPlayerId;

        if (state.phase !== "NIGHT_WOLVES" && !isOnePhoneWolf) {
          return { success: false, newState: state, newPhase: state.phase, error: "ليس دور الذيابة الآن" };
        }
        if (actor.role !== "wolf" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "فقط الذيب الحي يمكنه التصويت" };
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
        const isOnePhoneWitch =
          state.phase === "NIGHT_RELAY_WITCH" &&
          state.relayState?.queue[state.relayState.currentIndex] === actorPlayerId;

        if (state.phase !== "NIGHT_WITCH" && !isOnePhoneWitch) {
          return { success: false, newState: state, newPhase: state.phase, error: "ليس دور السحارة الآن" };
        }
        if (actor.role !== "witch" || !actor.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "فقط الساحرة الحية من يمكنها التصرف" };
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
          const pendingVictim = state.pendingWolfVictimId || state.wolfResolvedVictimId;
          if (pendingVictim) {
            healAvailable = false;
            savedPlayerId = pendingVictim;
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
      // ACTION: RELAY UNLOCK (Unlock curtain on shared device)
      // -------------------------------------------------------------
      case "RELAY_UNLOCK": {
        if (!state.relayState) {
          return { success: false, newState: state, newPhase: state.phase, error: "لا يوجد دور تتابع حالي" };
        }
        const currentTurnId = state.relayState.queue[state.relayState.currentIndex];
        if (actorPlayerId !== currentTurnId) {
          return { success: false, newState: state, newPhase: state.phase, error: "ليس دورك في التتابع" };
        }

        return {
          success: true,
          newState: {
            ...state,
            relayState: {
              ...state.relayState,
              privacyUnlocked: true,
            },
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      // -------------------------------------------------------------
      // ACTION: RELAY FINISH TURN (Advance to next player or pass)
      // -------------------------------------------------------------
      case "RELAY_FINISH_TURN": {
        if (!state.relayState) {
          return { success: false, newState: state, newPhase: state.phase, error: "لا يوجد دور تتابع حالي" };
        }
        const currentTurnId = state.relayState.queue[state.relayState.currentIndex];
        if (actorPlayerId !== currentTurnId) {
          return { success: false, newState: state, newPhase: state.phase, error: "ليس دورك في التتابع" };
        }

        const nextIndex = state.relayState.currentIndex + 1;
        const total = state.relayState.queue.length;

        if (nextIndex < total) {
          return {
            success: true,
            newState: {
              ...state,
              relayState: {
                ...state.relayState,
                currentIndex: nextIndex,
                turnStartedAt: Date.now(),
                privacyUnlocked: false,
              },
              eventSequence: state.eventSequence + 1,
            },
            newPhase: state.phase,
          };
        }

        // Current pass is finished!
        if (state.relayState.pass === "PRIMARY") {
          // Pass A complete -> resolve wolf ballots
          const pendingWolfVictimId = resolveWolfPlurality(state.wolfVotes, state.playerStates);
          const passBQueue = buildSeatingRelayQueue(state.playerStates);

          return {
            success: true,
            newState: {
              ...state,
              phase: "NIGHT_RELAY_WITCH",
              pendingWolfVictimId,
              wolfResolvedVictimId: pendingWolfVictimId,
              witchActionDone: false,
              witchSavedPlayerId: undefined,
              witchPoisonTargetId: undefined,
              relayState: {
                pass: "WITCH",
                queue: passBQueue,
                currentIndex: 0,
                turnStartedAt: Date.now(),
                privacyUnlocked: false,
              },
              eventSequence: state.eventSequence + 1,
            },
            newPhase: "NIGHT_RELAY_WITCH",
          };
        } else {
          // Pass B complete -> transition directly to NIGHT_RESOLUTION
          return advancePhase(
            {
              ...state,
              phase: "NIGHT_WITCH", // Advances into NIGHT_RESOLUTION
            },
            settings
          );
        }
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
        relay: state.relayState
          ? {
              pass: state.relayState.pass,
              currentTurnPlayerId: state.relayState.queue[state.relayState.currentIndex],
              currentTurnNickname:
                ctx.players.find((p) => p.id === state.relayState!.queue[state.relayState!.currentIndex])?.nickname || "",
              turnIndex: state.relayState.currentIndex,
              totalTurns: state.relayState.queue.length,
              privacyUnlocked: state.relayState.privacyUnlocked,
            }
          : undefined,
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
      seatIndex: player.seatIndex,
    };

    // Role reveal at game over
    if (state.phase === "GAME_OVER") {
      privateData.allRoles = Object.fromEntries(
        Object.entries(state.playerStates).map(([id, p]) => [id, p.role])
      );
    }

    // -----------------------------------------------------------------
    // STRICT INFORMATION PROJECTION: WOLF ATTACK (ONLY FOR LIVING WITCH)
    // -----------------------------------------------------------------
    let wolfAttack:
      | { status: "TARGETED"; victim: { id: string; nickname: string } }
      | { status: "NO_TARGET" }
      | undefined = undefined;

    const isWitchInTurn =
      player.role === "witch" &&
      player.isAlive &&
      (state.phase === "NIGHT_WITCH" ||
        (state.phase === "NIGHT_RELAY_WITCH" &&
          state.relayState?.queue[state.relayState.currentIndex] === playerId));

    if (isWitchInTurn) {
      const pendingVictimId = state.pendingWolfVictimId || state.wolfResolvedVictimId;
      if (pendingVictimId) {
        const victimP = ctx.players.find((p) => p.id === pendingVictimId);
        wolfAttack = {
          status: "TARGETED",
          victim: {
            id: pendingVictimId,
            nickname: victimP?.nickname || "الضحية",
          },
        };
      } else {
        wolfAttack = { status: "NO_TARGET" };
      }
    }
    // Only assign wolfAttack if defined (strictly undefined for unauthorized clients)
    if (wolfAttack !== undefined) {
      privateData.wolfAttack = wolfAttack;
      // Maintain backwards-compatible fields for Witch
      privateData.wolfVictimId = wolfAttack.status === "TARGETED" ? wolfAttack.victim.id : undefined;
    }

    // -----------------------------------------------------------------
    // STRICT INFORMATION PROJECTION: SEER INSPECTION (ONLY FOR LIVING SEER)
    // -----------------------------------------------------------------
    if (player.role === "seer" && state.seerCurrentInspection) {
      const targetP = ctx.players.find((p) => p.id === state.seerCurrentInspection!.targetId);
      privateData.seerInspection = {
        targetId: state.seerCurrentInspection.targetId,
        targetNickname: targetP?.nickname || "المشتبه فيه",
        role: settings.seerRevealMode === "ALIGNMENT_ONLY" ? undefined : state.seerCurrentInspection.role,
        alignment: state.seerCurrentInspection.alignment,
      };
      privateData.seerCurrentInspection = state.seerCurrentInspection;
      privateData.seerHistory = state.seerHistory.map((h) => ({
        round: h.round,
        targetId: h.targetId,
        role: settings.seerRevealMode === "ALIGNMENT_ONLY" ? undefined : h.role,
        alignment: h.alignment,
      }));
    }

    // -----------------------------------------------------------------
    // WOLVES PROJECTION (ONLY LIVING WOLVES SEE PACK MEMBERS)
    // -----------------------------------------------------------------
    if (player.role === "wolf" && player.isAlive) {
      privateData.packMembers = Object.values(state.playerStates)
        .filter((p) => p.role === "wolf" && p.isAlive)
        .map((p) => p.playerId);
      if (state.phase === "NIGHT_WOLVES") {
        allowedActions.push("WOLF_VOTE");
        privateData.currentWolfVotes = state.wolfVotes;
        privateData.myWolfVote = state.wolfVotes[playerId];
      }
    }

    // -----------------------------------------------------------------
    // WITCH POTIONS PROJECTION
    // -----------------------------------------------------------------
    if (player.role === "witch") {
      privateData.witchHealAvailable = state.witch.healAvailable;
      privateData.witchPoisonAvailable = state.witch.poisonAvailable;
      privateData.witchActionDone = state.witchActionDone;
      if (isWitchInTurn && !state.witchActionDone) {
        allowedActions.push("WITCH_ACTION");
      }
    }

    // -----------------------------------------------------------------
    // ONE-PHONE RELAY PROJECTION
    // -----------------------------------------------------------------
    if (state.relayState) {
      const currentTurnPlayerId = state.relayState.queue[state.relayState.currentIndex];
      const isMyTurn = currentTurnPlayerId === playerId;
      privateData.relay = {
        pass: state.relayState.pass,
        currentTurnPlayerId,
        currentTurnNickname: ctx.players.find((p) => p.id === currentTurnPlayerId)?.nickname || "",
        isMyTurn,
        privacyUnlocked: state.relayState.privacyUnlocked,
        turnIndex: state.relayState.currentIndex,
        totalTurns: state.relayState.queue.length,
        minCurtainMs: settings.privacyTransitionMinMs || 3000,
      };

      if (isMyTurn) {
        if (!state.relayState.privacyUnlocked) {
          allowedActions.push("RELAY_UNLOCK");
        } else {
          allowedActions.push("RELAY_FINISH_TURN");
          if (state.relayState.pass === "PRIMARY") {
            if (player.role === "wolf" && player.isAlive) {
              allowedActions.push("WOLF_VOTE");
            } else if (player.role === "seer" && player.isAlive && !state.seerCurrentInspection) {
              allowedActions.push("SEER_INSPECT");
            }
          } else if (state.relayState.pass === "WITCH") {
            if (player.role === "witch" && player.isAlive && !state.witchActionDone) {
              allowedActions.push("WITCH_ACTION");
            }
          }
        }
      }
    }

    // Day actions
    if (player.isAlive) {
      if (state.phase === "NIGHT_SEER" && player.role === "seer" && !state.seerCurrentInspection) {
        allowedActions.push("SEER_INSPECT");
      }
      if (state.phase === "DAY_VOTE") {
        allowedActions.push("DAY_VOTE");
        privateData.myVote = state.dayVotes[playerId];
      }
      if (state.phase === "RUNOFF") {
        allowedActions.push("RUNOFF_VOTE");
        privateData.myRunoffVote = state.runoffVotes?.[playerId];
        privateData.runoffCandidates = state.runoffCandidates;
      }
      if (state.phase === "REACTION_QUEUE" && state.pendingReactions.length > 0) {
        if (state.pendingReactions[0].actorPlayerId === playerId) {
          allowedActions.push("HUNTER_SHOOT");
        }
      }
    } else {
      // Dead Hunter taking reaction shot
      if (state.phase === "REACTION_QUEUE" && state.pendingReactions.length > 0) {
        if (state.pendingReactions[0].actorPlayerId === playerId) {
          allowedActions.push("HUNTER_SHOOT");
        }
      }
    }

    return {
      playerId,
      isHost: false,
      myRole: player.role,
      myTeam: player.team,
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
    // 2. NIGHT_INTRO -> NIGHT_RELAY_PRIMARY (One-Phone) or NIGHT_SEER (Multi-Phone)
    // ---------------------------------------------------------------
    case "NIGHT_INTRO": {
      if (settings.interactionMode === "ONE_PHONE") {
        const queue = buildSeatingRelayQueue(state.playerStates);
        return {
          success: true,
          newState: {
            ...state,
            phase: "NIGHT_RELAY_PRIMARY",
            narrationKey: "dib.gm.night_fall",
            wolfVotes: {},
            pendingWolfVictimId: undefined,
            wolfResolvedVictimId: undefined,
            seerCurrentInspection: undefined,
            relayState: {
              pass: "PRIMARY",
              queue,
              currentIndex: 0,
              turnStartedAt: Date.now(),
              privacyUnlocked: false,
            },
            eventSequence: nextSeq,
          },
          newPhase: "NIGHT_RELAY_PRIMARY",
        };
      }

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
          pendingWolfVictimId: undefined,
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
          pendingWolfVictimId: wolfVictim,
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
      const wolfVictimId = state.pendingWolfVictimId || state.wolfResolvedVictimId;
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

      let dawnNarrationKey = "dib.gm.death_none";
      if (newDeaths.length === 1) dawnNarrationKey = "dib.gm.death_one";
      else if (newDeaths.length >= 2) dawnNarrationKey = "dib.gm.death_two";

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
            relayState: undefined,
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
            relayState: undefined,
            narrationKey: win === "VILLAGE" ? "dib.villageWin" : "dib.wolvesWin",
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
          relayState: undefined,
          narrationKey: dawnNarrationKey,
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

      // If tie for top candidate
      if (topCandidates.length > 1 && topCount > 0) {
        if (settings.dayTieRule === "RUNOFF") {
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
        } else {
          // Classic default: NO_ELIMINATION
          return {
            success: true,
            newState: {
              ...state,
              phase: "NIGHT_INTRO",
              round: state.round + 1,
              narrationKey: "dib.dayTieNoElimination",
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
