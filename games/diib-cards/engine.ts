import { Player, PublicGameView, PrivatePlayerGameView } from "@/lib/types";
import {
  GameContext,
  GameDefinition,
  GameEndResult,
  TransitionResult,
  ValidationResult,
} from "@/games/registry";
import {
  ChronicleEntry,
  DiibCardRole,
  DiibCardsAction,
  DiibCardsPhase,
  DiibCardsPlayerState,
  DiibCardsSettings,
  DiibCardsState,
  DiibDeathCause,
  DiibDeathRecord,
  NightDraft,
  PlayableDiibRole,
  SpeakerEntry,
} from "./types";

interface DiibCardsInternalState extends DiibCardsState {
  inlineSettings?: Partial<DiibCardsSettings>;
}

/**
 * Balanced role distribution for playable (non-manager) seats (3 to 19 players).
 */
export function getRecommendedDiibCardsDistribution(
  playableCount: number
): Record<PlayableDiibRole, number> {
  const n = Math.max(3, Math.min(19, playableCount));
  switch (n) {
    case 3:
      return { wolf: 1, mute_wolf: 0, seer: 1, protector: 0, witch: 0, hunter: 0, villager: 1 };
    case 4:
      return { wolf: 1, mute_wolf: 0, seer: 1, protector: 1, witch: 0, hunter: 0, villager: 1 };
    case 5:
      return { wolf: 1, mute_wolf: 0, seer: 1, protector: 1, witch: 0, hunter: 0, villager: 2 };
    case 6:
      return { wolf: 1, mute_wolf: 1, seer: 1, protector: 1, witch: 0, hunter: 0, villager: 2 };
    case 7:
      return { wolf: 1, mute_wolf: 1, seer: 1, protector: 1, witch: 1, hunter: 0, villager: 2 };
    case 8:
      return { wolf: 1, mute_wolf: 1, seer: 1, protector: 1, witch: 1, hunter: 1, villager: 2 };
    case 9:
      return { wolf: 1, mute_wolf: 1, seer: 1, protector: 1, witch: 1, hunter: 1, villager: 3 };
    case 10:
      return { wolf: 2, mute_wolf: 1, seer: 1, protector: 1, witch: 1, hunter: 1, villager: 3 };
    case 11:
      return { wolf: 2, mute_wolf: 1, seer: 1, protector: 1, witch: 1, hunter: 1, villager: 4 };
    case 12:
      return { wolf: 2, mute_wolf: 1, seer: 1, protector: 1, witch: 1, hunter: 1, villager: 5 };
    case 13:
      return { wolf: 2, mute_wolf: 1, seer: 1, protector: 1, witch: 1, hunter: 1, villager: 6 };
    default: {
      const wolves = n >= 16 ? 3 : 2;
      const specials = wolves + 1 + 1 + 1 + 1 + 1; // wolves + mute_wolf + seer + protector + witch + hunter
      return {
        wolf: wolves,
        mute_wolf: 1,
        seer: 1,
        protector: 1,
        witch: 1,
        hunter: 1,
        villager: Math.max(1, n - specials),
      };
    }
  }
}

export function evaluateDiibCardsWinner(
  playerStates: Record<string, DiibCardsPlayerState>
): "VILLAGE" | "WOLVES" | "DRAW" | null {
  const playable = Object.values(playerStates).filter((p) => p.role !== "manager");
  if (playable.length === 0) return null;

  const living = playable.filter((p) => p.isAlive);
  const livingWolves = living.filter((p) => p.team === "WOLVES").length;
  const livingVillage = living.filter((p) => p.team === "VILLAGE").length;

  if (livingWolves === 0 && livingVillage === 0) return "DRAW";
  if (livingWolves === 0 && livingVillage > 0) return "VILLAGE";
  if (livingWolves >= livingVillage) return "WOLVES";
  return null;
}

export interface ComputedNightOutcome {
  dyingRecords: Array<{ playerId: string; cause: DiibDeathCause }>;
  savedByShield: boolean;
  savedByWitch: boolean;
  mutedId?: string;
  seerInspection?: {
    targetId: string;
    isWolf: boolean;
    role: PlayableDiibRole;
  };
}

export function computeNightOutcome(
  state: DiibCardsInternalState,
  settings: DiibCardsSettings
): ComputedNightOutcome {
  const draft = state.nightDraft || {};
  const playableLiving = Object.values(state.playerStates).filter(
    (p) => p.role !== "manager" && p.isAlive
  );
  const livingSet = new Set(playableLiving.map((p) => p.playerId));

  // Seer inspection helper
  let seerInspection: ComputedNightOutcome["seerInspection"] = undefined;
  if (draft.seerInspectId && livingSet.has(draft.seerInspectId)) {
    const t = state.playerStates[draft.seerInspectId];
    if (t && t.role !== "manager") {
      seerInspection = {
        targetId: t.playerId,
        isWolf: t.team === "WOLVES",
        role: t.role as PlayableDiibRole,
      };
    }
  }

  // Manual override mode: Manager directly specifies who died
  if (draft.useManualOverride) {
    const manualDeaths = (draft.manualDeathIds || [])
      .filter((id) => livingSet.has(id))
      .map((playerId) => ({ playerId, cause: "MANAGER_DECREE" as DiibDeathCause }));

    const dyingSet = new Set(manualDeaths.map((d) => d.playerId));
    const mutedId =
      draft.mutedTargetId && livingSet.has(draft.mutedTargetId) && !dyingSet.has(draft.mutedTargetId)
        ? draft.mutedTargetId
        : undefined;

    return {
      dyingRecords: manualDeaths,
      savedByShield: false,
      savedByWitch: false,
      mutedId,
      seerInspection,
    };
  }

  // Guided rule resolution:
  const dyingMap = new Map<string, DiibDeathCause>();
  let savedByShield = false;
  let savedByWitch = false;

  const wolfTarget =
    draft.wolfTargetId && livingSet.has(draft.wolfTargetId) ? draft.wolfTargetId : undefined;
  const protectedId =
    draft.protectedId && livingSet.has(draft.protectedId) ? draft.protectedId : undefined;

  if (wolfTarget) {
    if (protectedId && wolfTarget === protectedId) {
      savedByShield = true;
    } else if (draft.witchSave && state.witch.healAvailable) {
      savedByWitch = true;
    } else {
      dyingMap.set(wolfTarget, "WOLF_ATTACK");
    }
  }

  if (
    draft.witchPoisonId &&
    state.witch.poisonAvailable &&
    livingSet.has(draft.witchPoisonId)
  ) {
    if (!dyingMap.has(draft.witchPoisonId)) {
      dyingMap.set(draft.witchPoisonId, "WITCH_POISON");
    }
  }

  const dyingRecords = Array.from(dyingMap.entries()).map(([playerId, cause]) => ({
    playerId,
    cause,
  }));

  const dyingSet = new Set(dyingRecords.map((d) => d.playerId));
  const mutedId =
    settings.muteRule !== "OFF" &&
    draft.mutedTargetId &&
    livingSet.has(draft.mutedTargetId) &&
    !dyingSet.has(draft.mutedTargetId)
      ? draft.mutedTargetId
      : undefined;

  return {
    dyingRecords,
    savedByShield,
    savedByWitch,
    mutedId,
    seerInspection,
  };
}

function getEffectiveSettings(
  ctxSettings: DiibCardsSettings,
  state: DiibCardsInternalState
): DiibCardsSettings {
  return {
    ...ctxSettings,
    ...(state.inlineSettings || {}),
  };
}

function buildRoleDeck(
  playableCount: number,
  customRoles?: Partial<Record<PlayableDiibRole, number>>
): PlayableDiibRole[] {
  let dist: Record<PlayableDiibRole, number>;

  if (customRoles) {
    const wolf = Math.max(0, customRoles.wolf ?? 0);
    const mute_wolf = Math.max(0, customRoles.mute_wolf ?? 0);
    const seer = Math.max(0, customRoles.seer ?? 0);
    const protector = Math.max(0, customRoles.protector ?? 0);
    const witch = Math.max(0, customRoles.witch ?? 0);
    const hunter = Math.max(0, customRoles.hunter ?? 0);

    // Ensure at least 1 wolf and at least 1 non-wolf even if room size changed after saving custom roles
    let finalWolf = wolf;
    let finalMuteWolf = mute_wolf;
    if (finalWolf + finalMuteWolf < 1) {
      finalWolf = 1;
    }
    if (finalWolf + finalMuteWolf >= playableCount) {
      finalMuteWolf = 0;
      finalWolf = Math.max(1, playableCount - 1);
    }

    dist = {
      wolf: finalWolf,
      mute_wolf: finalMuteWolf,
      seer,
      protector,
      witch,
      hunter,
      villager: 0,
    };

    const deck: PlayableDiibRole[] = [];
    const priorityOrder: PlayableDiibRole[] = [
      "wolf",
      "mute_wolf",
      "seer",
      "protector",
      "witch",
      "hunter",
    ];
    for (const r of priorityOrder) {
      for (let i = 0; i < dist[r] && deck.length < playableCount; i++) {
        deck.push(r);
      }
    }
    while (deck.length < playableCount) {
      deck.push("villager");
    }
    return shuffleArray(deck);
  }

  dist = getRecommendedDiibCardsDistribution(playableCount);
  const deck: PlayableDiibRole[] = [];
  for (const [role, count] of Object.entries(dist)) {
    for (let i = 0; i < count; i++) {
      deck.push(role as PlayableDiibRole);
    }
  }
  while (deck.length < playableCount) {
    deck.push("villager");
  }
  return shuffleArray(deck.slice(0, playableCount));
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function dealRolesForMatch(
  state: DiibCardsInternalState,
  players: Player[],
  managerId: string,
  settings: DiibCardsSettings
): DiibCardsInternalState {
  const playablePlayers = players.filter((p) => p.id !== managerId);
  const deck = buildRoleDeck(playablePlayers.length, settings.customRoles);

  const playerStates: Record<string, DiibCardsPlayerState> = {};
  let playableIdx = 0;

  players.forEach((p, seatIdx) => {
    if (p.id === managerId) {
      playerStates[p.id] = {
        playerId: p.id,
        role: "manager",
        team: "MANAGER",
        isAlive: true,
        seatIndex: seatIdx,
        cardSeen: true,
      };
    } else {
      const role = deck[playableIdx++];
      playerStates[p.id] = {
        playerId: p.id,
        role,
        team: role === "wolf" || role === "mute_wolf" ? "WOLVES" : "VILLAGE",
        isAlive: true,
        seatIndex: seatIdx,
        cardSeen: false,
      };
    }
  });

  const isOnePhone = settings.interactionMode === "ONE_PHONE";
  const dealRelay = isOnePhone
    ? {
        // Non-managers peek privately first, ending on the Manager who holds the phone!
        queue: [...playablePlayers.map((p) => p.id), managerId],
        currentIndex: 0,
        isRevealed: false,
      }
    : undefined;

  return {
    ...state,
    phase: "ROLE_REVEAL",
    round: 1,
    managerId,
    managerHistory: [...state.managerHistory, managerId],
    playerStates,
    dealRelay,
    witch: {
      healAvailable: true,
      poisonAvailable: true,
    },
    lastNightProtectedId: undefined,
    lastNightMutedId: undefined,
    seerLog: [],
    nightDraft: {},
    mutedPlayerId: undefined,
    lastDawnDeaths: [],
    lastDayElimination: undefined,
    pendingHunterIds: [],
    hunterReturnPhase: undefined,
    speakingQueue: [],
    currentSpeakerIndex: -1,
    speakerTimer: undefined,
    lastRuleWarning: undefined,
    candidateTallies: {},
    playerBallots: {},
    tiedCandidates: [],
    runoffSpeakerIndex: 0,
    chronicle: [],
    winner: undefined,
    eventSequence: state.eventSequence + 1,
  };
}

function buildSpeakingQueue(
  playerStates: Record<string, DiibCardsPlayerState>,
  mutedPlayerId: string | undefined,
  round: number,
  matchNumber: number
): { queue: SpeakerEntry[]; firstIndex: number } {
  const living = Object.values(playerStates)
    .filter((p) => p.role !== "manager" && p.isAlive)
    .sort((a, b) => a.seatIndex - b.seatIndex);

  if (living.length === 0) {
    return { queue: [], firstIndex: -1 };
  }

  const offset = (round - 1 + matchNumber - 1) % living.length;
  const rotated = [...living.slice(offset), ...living.slice(0, offset)];

  const queue: SpeakerEntry[] = rotated.map((p) => {
    const isMuted = p.playerId === mutedPlayerId;
    return {
      playerId: p.playerId,
      isMuted,
      hasSpoken: false,
      skippedReason: isMuted ? "MUTED" : undefined,
    };
  });

  const firstIndex = queue.findIndex((entry) => !entry.isMuted);
  return { queue, firstIndex };
}

function isManagerOrHost(
  actorPlayerId: string,
  state: DiibCardsInternalState,
  players: Player[]
): boolean {
  if (state.managerId && actorPlayerId === state.managerId) return true;
  const actor = players.find((p) => p.id === actorPlayerId);
  return Boolean(actor?.isHost);
}

export const DiibCardsEngine: GameDefinition<
  DiibCardsInternalState,
  DiibCardsAction,
  DiibCardsSettings
> = {
  id: "diib-cards",
  slug: "diib-cards",
  version: 1,
  displayNameKey: "diibCards.name",
  shortDescriptionKey: "diibCards.description",
  minPlayers: 4,
  maxPlayers: 20,
  capabilities: [
    "MULTI_PHONE",
    "ONE_PHONE",
    "HYBRID",
    "PRIVATE_TURNS",
    "REALTIME",
    "TIMERS",
    "NARRATION",
  ],
  defaultSettings: {
    speakingDurationSeconds: 45,
    runoffDefenseSeconds: 30,
    openDebateSeconds: 60,
    roleRevealOnDeath: true,
    muteRule: "WOLVES_PACK",
    preventConsecutiveMute: true,
    preventConsecutiveProtect: true,
    allowPlayerPhoneVotes: true,
  },

  validateSetup(players: Player[], settings: DiibCardsSettings): ValidationResult {
    if (players.length < 4) {
      return {
        isValid: false,
        errors: [
          "لعبة Diib Cards كتحتاج على الأقل 4 حاضرين فالغرفة (1 ياخد كارطة المانيجر 👑 + 3 لاعبين على الأقل).",
        ],
      };
    }
    if (players.length > 20) {
      return { isValid: false, errors: ["الحد الأقصى هو 20 حاضر فالغرفة."] };
    }

    const playableCount = players.length - 1;
    if (settings.customRoles) {
      const wolves = (settings.customRoles.wolf ?? 0) + (settings.customRoles.mute_wolf ?? 0);
      const specials =
        wolves +
        (settings.customRoles.seer ?? 0) +
        (settings.customRoles.protector ?? 0) +
        (settings.customRoles.witch ?? 0) +
        (settings.customRoles.hunter ?? 0);

      if (wolves < 1) {
        return { isValid: false, errors: ["ضروري يكون على الأقل ذيب واحد فالتشكيلة 🐺"] };
      }
      if (wolves >= playableCount) {
        return {
          isValid: false,
          errors: ["عدد الذيابة خاصو يكون أقل من عدد اللاعبين (تذكر أن 1 غادي ياخد كارطة المانيجر 👑)."],
        };
      }
      if (specials > playableCount) {
        return {
          isValid: false,
          errors: [`مجموع الكوارط الخاصة (${specials}) كبر من عدد اللاعبين بلا مانيجر (${playableCount})!`],
        };
      }
    }

    return { isValid: true };
  },

  createInitialState(players: Player[]): DiibCardsInternalState {
    const playerStates: Record<string, DiibCardsPlayerState> = {};
    players.forEach((p, idx) => {
      playerStates[p.id] = {
        playerId: p.id,
        role: "villager",
        team: "VILLAGE",
        isAlive: true,
        seatIndex: idx,
        cardSeen: false,
      };
    });

    return {
      matchNumber: 1,
      phase: "MANAGER_SELECT",
      round: 1,
      eventSequence: 1,
      managerId: undefined,
      managerVolunteers: [],
      managerHistory: [],
      playerStates,
      witch: {
        healAvailable: true,
        poisonAvailable: true,
      },
      seerLog: [],
      nightDraft: {},
      lastDawnDeaths: [],
      pendingHunterIds: [],
      speakingQueue: [],
      currentSpeakerIndex: -1,
      candidateTallies: {},
      playerBallots: {},
      tiedCandidates: [],
      runoffSpeakerIndex: 0,
      chronicle: [],
    };
  },

  start(ctx: GameContext<DiibCardsInternalState, DiibCardsSettings>): TransitionResult<DiibCardsInternalState> {
    return {
      success: true,
      newState: {
        ...ctx.state,
        phase: "MANAGER_SELECT",
      },
      newPhase: "MANAGER_SELECT",
    };
  },

  handleAction(
    ctx: GameContext<DiibCardsInternalState, DiibCardsSettings>,
    actorPlayerId: string,
    action: DiibCardsAction
  ): TransitionResult<DiibCardsInternalState> {
    const { state, players } = ctx;
    const settings = getEffectiveSettings(ctx.settings, state);
    const actorExists = players.some((p) => p.id === actorPlayerId);

    if (!actorExists) {
      return { success: false, newState: state, newPhase: state.phase, error: "لاعب غير معروف فالغرفة" };
    }

    switch (action.type) {
      // ===============================================================
      // 1. MANAGER SELECTION & INLINE SETTINGS
      // ===============================================================
      case "VOLUNTEER_MANAGER": {
        if (state.phase !== "MANAGER_SELECT") {
          return { success: false, newState: state, newPhase: state.phase, error: "تم اختيار المانيجر مسبقاً" };
        }
        const already = state.managerVolunteers.includes(actorPlayerId);
        const nextVolunteers = already
          ? state.managerVolunteers.filter((id) => id !== actorPlayerId)
          : [...state.managerVolunteers, actorPlayerId];

        return {
          success: true,
          newState: {
            ...state,
            managerVolunteers: nextVolunteers,
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      case "UPDATE_INLINE_SETTINGS": {
        const canEdit =
          isManagerOrHost(actorPlayerId, state, players) ||
          (state.phase === "MANAGER_SELECT" && state.managerVolunteers.includes(actorPlayerId));

        if (!canEdit) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "غير المانيجر أو مول الغرفة لي يقدر يبدل القوانين",
          };
        }

        const mergedInline: Partial<DiibCardsSettings> = {
          ...(state.inlineSettings || {}),
          ...action.settings,
        };

        // Validate custom roles if updated during MANAGER_SELECT
        const check = DiibCardsEngine.validateSetup(players, {
          ...ctx.settings,
          ...mergedInline,
        });
        if (!check.isValid) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: check.errors?.[0] || "إعدادات غير صالحة",
          };
        }

        return {
          success: true,
          newState: {
            ...state,
            inlineSettings: mergedInline,
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      case "CONFIRM_MANAGER": {
        if (state.phase !== "MANAGER_SELECT") {
          return { success: false, newState: state, newPhase: state.phase, error: "اللعبة بدات ديجا" };
        }
        const targetManager = players.find((p) => p.id === action.managerId);
        if (!targetManager) {
          return { success: false, newState: state, newPhase: state.phase, error: "اللاعب المختار غير موجود" };
        }

        // Allow Host, previous Manager, or the sole volunteer claiming the Manager card
        const isHostActor = Boolean(players.find((p) => p.id === actorPlayerId)?.isHost);
        const isSelfClaim =
          actorPlayerId === action.managerId &&
          (state.managerVolunteers.length === 0 ||
            (state.managerVolunteers.length === 1 && state.managerVolunteers[0] === actorPlayerId));

        if (!isHostActor && !isSelfClaim && actorPlayerId !== state.managerHistory.at(-1)) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "مول الغرفة كياكّد اختيار المانيجر ملي يكون أكثر من متطوع!",
          };
        }

        const dealtState = dealRolesForMatch(state, players, targetManager.id, settings);
        return {
          success: true,
          newState: dealtState,
          newPhase: "ROLE_REVEAL",
        };
      }

      case "AUTO_PICK_MANAGER": {
        if (state.phase !== "MANAGER_SELECT") {
          return { success: false, newState: state, newPhase: state.phase, error: "اللعبة بدات ديجا" };
        }

        const countManaged = (id: string) => state.managerHistory.filter((m) => m === id).length;
        const pool =
          state.managerVolunteers.length > 0
            ? players.filter((p) => state.managerVolunteers.includes(p.id))
            : players;

        const minTimes = Math.min(...pool.map((p) => countManaged(p.id)));
        const freshestCandidates = pool.filter((p) => countManaged(p.id) === minTimes);
        const chosen =
          freshestCandidates[Math.floor(Math.random() * freshestCandidates.length)] || players[0];

        const dealtState = dealRolesForMatch(state, players, chosen.id, settings);
        return {
          success: true,
          newState: dealtState,
          newPhase: "ROLE_REVEAL",
        };
      }

      // ===============================================================
      // 2. ROLE REVEAL & ONE-PHONE CARD DEAL RELAY
      // ===============================================================
      case "MARK_CARD_SEEN": {
        const ps = state.playerStates[actorPlayerId];
        if (!ps) {
          return { success: false, newState: state, newPhase: state.phase, error: "لاعب غير موجود" };
        }
        if (ps.cardSeen) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        return {
          success: true,
          newState: {
            ...state,
            playerStates: {
              ...state.playerStates,
              [actorPlayerId]: { ...ps, cardSeen: true },
            },
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      case "DEAL_RELAY_STEP": {
        if (!state.dealRelay) {
          return { success: false, newState: state, newPhase: state.phase, error: "ما كاينش تمرير التلفون" };
        }
        const currentId = state.dealRelay.queue[state.dealRelay.currentIndex];
        if (!state.dealRelay.isRevealed) {
          const ps = state.playerStates[currentId];
          return {
            success: true,
            newState: {
              ...state,
              playerStates: ps
                ? { ...state.playerStates, [currentId]: { ...ps, cardSeen: true } }
                : state.playerStates,
              dealRelay: {
                ...state.dealRelay,
                isRevealed: true,
              },
              eventSequence: state.eventSequence + 1,
            },
            newPhase: state.phase,
          };
        } else {
          const nextIdx = state.dealRelay.currentIndex + 1;
          if (nextIdx >= state.dealRelay.queue.length) {
            return {
              success: true,
              newState: {
                ...state,
                dealRelay: undefined,
                eventSequence: state.eventSequence + 1,
              },
              newPhase: state.phase,
            };
          }
          return {
            success: true,
            newState: {
              ...state,
              dealRelay: {
                ...state.dealRelay,
                currentIndex: nextIdx,
                isRevealed: false,
              },
              eventSequence: state.eventSequence + 1,
            },
            newPhase: state.phase,
          };
        }
      }

      case "START_NIGHT": {
        if (state.phase !== "ROLE_REVEAL") {
          return { success: false, newState: state, newPhase: state.phase, error: "ماشي مرحلة توزيع الكوارط" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "غير المانيجر لي يقدر يطيّح الليل 🌙",
          };
        }
        return {
          success: true,
          newState: {
            ...state,
            phase: "NIGHT",
            dealRelay: undefined,
            nightDraft: {},
            eventSequence: state.eventSequence + 1,
          },
          newPhase: "NIGHT",
        };
      }

      // ===============================================================
      // 3. NIGHT PHASE — MANAGER LEDGER & RULE ENFORCEMENT
      // ===============================================================
      case "UPDATE_NIGHT_DRAFT": {
        if (state.phase !== "NIGHT") {
          return { success: false, newState: state, newPhase: state.phase, error: "حنا ماشي فالليل دابا" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }

        const incoming = action.draft;

        // Enforce Protector consecutive protection rule
        if (
          incoming.protectedId &&
          settings.preventConsecutiveProtect &&
          state.round > 1 &&
          incoming.protectedId === state.lastNightProtectedId
        ) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "🛡️ القانون كيمنع الحارس يحمي نفس اللاعب جوج ليالي متابعين!",
          };
        }

        // Enforce Wolf Mute consecutive mute rule
        if (
          incoming.mutedTargetId &&
          settings.preventConsecutiveMute &&
          state.round > 1 &&
          incoming.mutedTargetId === state.lastNightMutedId
        ) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "🤐 القانون كيمنع تسكيت نفس اللاعب جوج ليالي متابعين!",
          };
        }

        // Enforce Witch potions availability
        if (incoming.witchSave && !state.witch.healAvailable) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "🧪 قرعة الحياة استهلكاتها السحارة فليلة سابقة!",
          };
        }
        if (incoming.witchPoisonId && !state.witch.poisonAvailable) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "🧪 قرعة السم استهلكاتها السحارة فليلة سابقة!",
          };
        }

        return {
          success: true,
          newState: {
            ...state,
            nightDraft: {
              ...state.nightDraft,
              ...incoming,
            },
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      case "TOGGLE_MANUAL_NIGHT_DEATH": {
        if (state.phase !== "NIGHT") {
          return { success: false, newState: state, newPhase: state.phase, error: "حنا ماشي فالليل دابا" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }
        const target = state.playerStates[action.targetPlayerId];
        if (!target || target.role === "manager" || !target.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "لاعب غير صالح" };
        }

        // Seed manual list from current computed deaths when toggling manual override for the first time
        const existingManual = state.nightDraft.useManualOverride
          ? state.nightDraft.manualDeathIds || []
          : computeNightOutcome(state, settings).dyingRecords.map((d) => d.playerId);

        const nextManual = existingManual.includes(action.targetPlayerId)
          ? existingManual.filter((id) => id !== action.targetPlayerId)
          : [...existingManual, action.targetPlayerId];

        return {
          success: true,
          newState: {
            ...state,
            nightDraft: {
              ...state.nightDraft,
              useManualOverride: true,
              manualDeathIds: nextManual,
            },
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      case "COMMIT_NIGHT": {
        if (state.phase !== "NIGHT") {
          return { success: false, newState: state, newPhase: state.phase, error: "حنا ماشي فالليل دابا" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }

        const outcome = computeNightOutcome(state, settings);
        const nextPlayerStates = { ...state.playerStates };
        const dawnDeaths: DiibDeathRecord[] = [];
        const newHunters: string[] = [];

        for (const rec of outcome.dyingRecords) {
          const ps = nextPlayerStates[rec.playerId];
          if (ps && ps.isAlive && ps.role !== "manager") {
            const deathRecord: DiibDeathRecord = {
              playerId: rec.playerId,
              round: state.round,
              cause: rec.cause,
              revealedRole: settings.roleRevealOnDeath ? (ps.role as PlayableDiibRole) : undefined,
            };
            nextPlayerStates[rec.playerId] = {
              ...ps,
              isAlive: false,
              death: deathRecord,
            };
            dawnDeaths.push(deathRecord);

            if (ps.role === "hunter") {
              newHunters.push(rec.playerId);
            }
          }
        }

        // Consume Witch potions if used in guided mode
        const nextWitch = { ...state.witch };
        if (!state.nightDraft.useManualOverride) {
          if (outcome.savedByWitch) {
            nextWitch.healAvailable = false;
          }
          if (state.nightDraft.witchPoisonId && state.witch.poisonAvailable) {
            nextWitch.poisonAvailable = false;
          }
        }

        // Append Seer inspection log
        const nextSeerLog = outcome.seerInspection
          ? [
              ...state.seerLog,
              {
                round: state.round,
                targetId: outcome.seerInspection.targetId,
                isWolf: outcome.seerInspection.isWolf,
                role: outcome.seerInspection.role,
              },
            ]
          : state.seerLog;

        // Build public chronicle entry (no secret roles leaked!)
        const victimNames = dawnDeaths
          .map((d) => players.find((p) => p.id === d.playerId)?.nickname || "لاعب")
          .join("، ");
        const mutedName = outcome.mutedId
          ? players.find((p) => p.id === outcome.mutedId)?.nickname
          : undefined;

        const nightSummary =
          dawnDeaths.length === 0
            ? `الليلة ${state.round}: دازت ليلة سالمة بلا ضحايا${mutedName ? `، وتسكّت ${mutedName} 🤐` : ""}.`
            : `الليلة ${state.round}: سقط فـ الظلام (${victimNames})${mutedName ? `، وتسكّت ${mutedName} 🤐` : ""}.`;

        const newChronicleEntry: ChronicleEntry = {
          id: `chr_night_${state.round}_${Date.now()}`,
          round: state.round,
          phase: "NIGHT",
          summary: nightSummary,
          deaths: dawnDeaths.map((d) => d.playerId),
          mutedId: outcome.mutedId,
          savedByShield: outcome.savedByShield,
          savedByWitch: outcome.savedByWitch,
        };

        const baseNextState: DiibCardsInternalState = {
          ...state,
          playerStates: nextPlayerStates,
          witch: nextWitch,
          lastNightProtectedId: state.nightDraft.protectedId,
          lastNightMutedId: outcome.mutedId,
          seerLog: nextSeerLog,
          nightDraft: {},
          mutedPlayerId: outcome.mutedId,
          lastDawnDeaths: dawnDeaths,
          chronicle: [...state.chronicle, newChronicleEntry],
          eventSequence: state.eventSequence + 1,
        };

        // If a Hunter died tonight, trigger immediate Hunter Revenge Shot!
        if (newHunters.length > 0) {
          return {
            success: true,
            newState: {
              ...baseNextState,
              phase: "HUNTER_REACTION",
              pendingHunterIds: newHunters,
              hunterReturnPhase: "DAWN_ANNOUNCEMENT",
            },
            newPhase: "HUNTER_REACTION",
          };
        }

        const win = evaluateDiibCardsWinner(nextPlayerStates);
        if (win) {
          return {
            success: true,
            newState: {
              ...baseNextState,
              phase: "GAME_OVER",
              winner: win,
            },
            newPhase: "GAME_OVER",
          };
        }

        return {
          success: true,
          newState: {
            ...baseNextState,
            phase: "DAWN_ANNOUNCEMENT",
          },
          newPhase: "DAWN_ANNOUNCEMENT",
        };
      }

      // ===============================================================
      // 4. HUNTER REVENGE INTERRUPT
      // ===============================================================
      case "RESOLVE_HUNTER_SHOT": {
        if (state.phase !== "HUNTER_REACTION" || state.pendingHunterIds.length === 0) {
          return { success: false, newState: state, newPhase: state.phase, error: "ما كاينش انتقام صياد دابا" };
        }
        const currentHunterId = state.pendingHunterIds[0];
        if (!isManagerOrHost(actorPlayerId, state, players) && actorPlayerId !== currentHunterId) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "غير المانيجر أو الصياد لي يقدر يحدد هدف الرصاصة",
          };
        }

        const target = state.playerStates[action.targetPlayerId];
        if (!target || target.role === "manager" || !target.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "الهدف خاصو يكون لاعب حي!" };
        }

        const nextPlayerStates = { ...state.playerStates };
        const shotRecord: DiibDeathRecord = {
          playerId: target.playerId,
          round: state.round,
          cause: "HUNTER_SHOT",
          revealedRole: settings.roleRevealOnDeath ? (target.role as PlayableDiibRole) : undefined,
        };

        nextPlayerStates[target.playerId] = {
          ...target,
          isAlive: false,
          death: shotRecord,
        };

        const remainingHunters = state.pendingHunterIds.slice(1);
        if (target.role === "hunter") {
          remainingHunters.push(target.playerId);
        }

        // Clear mute if the muted player got shot by the Hunter!
        const nextMutedId =
          state.mutedPlayerId === target.playerId ? undefined : state.mutedPlayerId;

        const hunterName = players.find((p) => p.id === currentHunterId)?.nickname || "الصياد";
        const targetName = players.find((p) => p.id === target.playerId)?.nickname || "لاعب";
        const chr: ChronicleEntry = {
          id: `chr_hunter_${state.round}_${Date.now()}`,
          round: state.round,
          phase: "HUNTER",
          summary: `🎯 الصياد ${hunterName} أطلق رصاصتو الأخيرة وأردى ${targetName}!`,
          deaths: [target.playerId],
        };

        const updatedDawnDeaths =
          state.hunterReturnPhase === "DAWN_ANNOUNCEMENT"
            ? [...state.lastDawnDeaths, shotRecord]
            : state.lastDawnDeaths;

        if (remainingHunters.length > 0) {
          return {
            success: true,
            newState: {
              ...state,
              playerStates: nextPlayerStates,
              pendingHunterIds: remainingHunters,
              mutedPlayerId: nextMutedId,
              lastDawnDeaths: updatedDawnDeaths,
              chronicle: [...state.chronicle, chr],
              eventSequence: state.eventSequence + 1,
            },
            newPhase: "HUNTER_REACTION",
          };
        }

        const win = evaluateDiibCardsWinner(nextPlayerStates);
        if (win) {
          return {
            success: true,
            newState: {
              ...state,
              playerStates: nextPlayerStates,
              pendingHunterIds: [],
              mutedPlayerId: nextMutedId,
              lastDawnDeaths: updatedDawnDeaths,
              chronicle: [...state.chronicle, chr],
              phase: "GAME_OVER",
              winner: win,
              eventSequence: state.eventSequence + 1,
            },
            newPhase: "GAME_OVER",
          };
        }

        const returnPhase = state.hunterReturnPhase || "DAWN_ANNOUNCEMENT";
        return {
          success: true,
          newState: {
            ...state,
            playerStates: nextPlayerStates,
            pendingHunterIds: [],
            hunterReturnPhase: undefined,
            mutedPlayerId: nextMutedId,
            lastDawnDeaths: updatedDawnDeaths,
            chronicle: [...state.chronicle, chr],
            phase: returnPhase,
            eventSequence: state.eventSequence + 1,
          },
          newPhase: returnPhase,
        };
      }

      case "SKIP_HUNTER_SHOT": {
        if (state.phase !== "HUNTER_REACTION") {
          return { success: false, newState: state, newPhase: state.phase, error: "ما كاينش صياد دابا" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }
        const remaining = state.pendingHunterIds.slice(1);
        if (remaining.length > 0) {
          return {
            success: true,
            newState: {
              ...state,
              pendingHunterIds: remaining,
              eventSequence: state.eventSequence + 1,
            },
            newPhase: "HUNTER_REACTION",
          };
        }

        const win = evaluateDiibCardsWinner(state.playerStates);
        if (win) {
          return {
            success: true,
            newState: {
              ...state,
              pendingHunterIds: [],
              phase: "GAME_OVER",
              winner: win,
              eventSequence: state.eventSequence + 1,
            },
            newPhase: "GAME_OVER",
          };
        }

        const returnPhase = state.hunterReturnPhase || "DAWN_ANNOUNCEMENT";
        return {
          success: true,
          newState: {
            ...state,
            pendingHunterIds: [],
            hunterReturnPhase: undefined,
            phase: returnPhase,
            eventSequence: state.eventSequence + 1,
          },
          newPhase: returnPhase,
        };
      }

      // ===============================================================
      // 5. DAWN -> SPEAKING TURNS & SYNCHRONIZED TIMER ENGINE
      // ===============================================================
      case "START_SPEAKING": {
        if (state.phase !== "DAWN_ANNOUNCEMENT") {
          return { success: false, newState: state, newPhase: state.phase, error: "ماشي مرحلة الصباح" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }

        const { queue, firstIndex } = buildSpeakingQueue(
          state.playerStates,
          state.mutedPlayerId,
          state.round,
          state.matchNumber
        );
        const durationMs = settings.speakingDurationSeconds * 1000;
        const now = Date.now();

        return {
          success: true,
          newState: {
            ...state,
            phase: "SPEAKING_TURNS",
            speakingQueue: queue,
            currentSpeakerIndex: firstIndex,
            speakerTimer:
              firstIndex >= 0
                ? {
                    startsAt: now,
                    endsAt: now + durationMs,
                    durationMs,
                    isPaused: false,
                    mode: "TURN",
                  }
                : undefined,
            lastRuleWarning: undefined,
            eventSequence: state.eventSequence + 1,
          },
          newPhase: "SPEAKING_TURNS",
          timerDurationMs: firstIndex >= 0 ? durationMs : undefined,
        };
      }

      case "NEXT_SPEAKER": {
        if (state.phase !== "SPEAKING_TURNS") {
          return { success: false, newState: state, newPhase: state.phase, error: "ماشي مرحلة النقاش" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }

        const nextQueue = state.speakingQueue.map((item, idx) =>
          idx === state.currentSpeakerIndex ? { ...item, hasSpoken: true } : { ...item }
        );

        let nextIdx = -1;
        // Look forward from current speaker first, then wrap around for any unvisited unmuted speakers
        const total = nextQueue.length;
        const startSearch = state.currentSpeakerIndex >= 0 ? state.currentSpeakerIndex + 1 : 0;
        for (let step = 0; step < total; step++) {
          const candidateIdx = (startSearch + step) % total;
          const entry = nextQueue[candidateIdx];
          if (!entry.isMuted && !entry.hasSpoken) {
            nextIdx = candidateIdx;
            break;
          }
        }

        const durationMs = settings.speakingDurationSeconds * 1000;
        const now = Date.now();

        return {
          success: true,
          newState: {
            ...state,
            speakingQueue: nextQueue,
            currentSpeakerIndex: nextIdx,
            speakerTimer:
              nextIdx >= 0
                ? {
                    startsAt: now,
                    endsAt: now + durationMs,
                    durationMs,
                    isPaused: false,
                    mode: "TURN",
                  }
                : undefined,
            eventSequence: state.eventSequence + 1,
          },
          newPhase: "SPEAKING_TURNS",
          timerDurationMs: nextIdx >= 0 ? durationMs : undefined,
        };
      }

      case "SELECT_SPEAKER": {
        if (state.phase !== "SPEAKING_TURNS") {
          return { success: false, newState: state, newPhase: state.phase, error: "ماشي مرحلة النقاش" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }

        const idx = state.speakingQueue.findIndex((s) => s.playerId === action.targetPlayerId);
        if (idx === -1) {
          return { success: false, newState: state, newPhase: state.phase, error: "اللاعب ما داخلش فالنقاش" };
        }
        if (state.speakingQueue[idx].isMuted) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "🤐 هاد اللاعب مسكّت هاد النهار! القانون كيمنعو يهضر!",
          };
        }

        const nextQueue = state.speakingQueue.map((item, i) =>
          i === state.currentSpeakerIndex ? { ...item, hasSpoken: true } : item
        );
        const durationMs = settings.speakingDurationSeconds * 1000;
        const now = Date.now();

        return {
          success: true,
          newState: {
            ...state,
            speakingQueue: nextQueue,
            currentSpeakerIndex: idx,
            speakerTimer: {
              startsAt: now,
              endsAt: now + durationMs,
              durationMs,
              isPaused: false,
              mode: "TURN",
            },
            eventSequence: state.eventSequence + 1,
          },
          newPhase: "SPEAKING_TURNS",
          timerDurationMs: durationMs,
        };
      }

      case "RANDOM_SPEAKER": {
        if (state.phase !== "SPEAKING_TURNS") {
          return { success: false, newState: state, newPhase: state.phase, error: "ماشي مرحلة النقاش" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }

        const nextQueue = state.speakingQueue.map((item, i) =>
          i === state.currentSpeakerIndex ? { ...item, hasSpoken: true } : item
        );

        const eligibleIndices = nextQueue
          .map((item, idx) => ({ item, idx }))
          .filter(({ item }) => !item.isMuted && !item.hasSpoken)
          .map(({ idx }) => idx);

        // If all spoke already, allow random pick from any unmuted living speaker!
        const fallbackIndices = nextQueue
          .map((item, idx) => ({ item, idx }))
          .filter(({ item }) => !item.isMuted)
          .map(({ idx }) => idx);

        const pool = eligibleIndices.length > 0 ? eligibleIndices : fallbackIndices;
        if (pool.length === 0) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "ما بقى حتى متحدث متاح",
          };
        }

        const pickedIdx = pool[Math.floor(Math.random() * pool.length)];
        const durationMs = settings.speakingDurationSeconds * 1000;
        const now = Date.now();

        return {
          success: true,
          newState: {
            ...state,
            speakingQueue: nextQueue,
            currentSpeakerIndex: pickedIdx,
            speakerTimer: {
              startsAt: now,
              endsAt: now + durationMs,
              durationMs,
              isPaused: false,
              mode: "TURN",
            },
            eventSequence: state.eventSequence + 1,
          },
          newPhase: "SPEAKING_TURNS",
          timerDurationMs: durationMs,
        };
      }

      case "ADD_SPEAKER_TIME": {
        if (!isManagerOrHost(actorPlayerId, state, players) || !state.speakerTimer) {
          return { success: false, newState: state, newPhase: state.phase, error: "ما كاينش عداد شغال" };
        }
        const addMs = Math.max(5, Math.min(120, action.extraSeconds)) * 1000;
        const now = Date.now();

        if (state.speakerTimer.isPaused) {
          const nextRem = (state.speakerTimer.pausedRemainingMs || 0) + addMs;
          return {
            success: true,
            newState: {
              ...state,
              speakerTimer: {
                ...state.speakerTimer,
                pausedRemainingMs: nextRem,
                durationMs: state.speakerTimer.durationMs + addMs,
              },
              eventSequence: state.eventSequence + 1,
            },
            newPhase: state.phase,
          };
        }

        const baseEnd = Math.max(now, state.speakerTimer.endsAt);
        const newEndsAt = baseEnd + addMs;
        const remainingMs = newEndsAt - now;

        return {
          success: true,
          newState: {
            ...state,
            speakerTimer: {
              ...state.speakerTimer,
              endsAt: newEndsAt,
              durationMs: Math.max(state.speakerTimer.durationMs, remainingMs),
            },
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
          timerDurationMs: remainingMs,
        };
      }

      case "PAUSE_RESUME_SPEAKER": {
        if (!isManagerOrHost(actorPlayerId, state, players) || !state.speakerTimer) {
          return { success: false, newState: state, newPhase: state.phase, error: "ما كاينش عداد شغال" };
        }
        const now = Date.now();
        if (!state.speakerTimer.isPaused) {
          const remaining = Math.max(0, state.speakerTimer.endsAt - now);
          return {
            success: true,
            newState: {
              ...state,
              speakerTimer: {
                ...state.speakerTimer,
                isPaused: true,
                pausedRemainingMs: remaining,
              },
              eventSequence: state.eventSequence + 1,
            },
            newPhase: state.phase,
          };
        } else {
          const rem = state.speakerTimer.pausedRemainingMs ?? 15000;
          return {
            success: true,
            newState: {
              ...state,
              speakerTimer: {
                ...state.speakerTimer,
                startsAt: now,
                endsAt: now + rem,
                isPaused: false,
                pausedRemainingMs: undefined,
              },
              eventSequence: state.eventSequence + 1,
            },
            newPhase: state.phase,
            timerDurationMs: rem,
          };
        }
      }

      case "OPEN_FLOOR_DEBATE": {
        if (state.phase !== "SPEAKING_TURNS") {
          return { success: false, newState: state, newPhase: state.phase, error: "ماشي مرحلة النقاش" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }
        const durMs = (action.durationSeconds || settings.openDebateSeconds || 60) * 1000;
        const now = Date.now();

        return {
          success: true,
          newState: {
            ...state,
            currentSpeakerIndex: -1,
            speakerTimer: {
              startsAt: now,
              endsAt: now + durMs,
              durationMs: durMs,
              isPaused: false,
              mode: "OPEN_FLOOR",
            },
            eventSequence: state.eventSequence + 1,
          },
          newPhase: "SPEAKING_TURNS",
          timerDurationMs: durMs,
        };
      }

      case "FLAG_RULE_WARNING": {
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }
        return {
          success: true,
          newState: {
            ...state,
            lastRuleWarning: {
              id: `warn_${Date.now()}`,
              targetPlayerId: action.targetPlayerId,
              reason: action.reason,
              issuedAt: Date.now(),
            },
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      case "START_VOTING": {
        if (state.phase !== "SPEAKING_TURNS" && state.phase !== "DAWN_ANNOUNCEMENT") {
          return { success: false, newState: state, newPhase: state.phase, error: "ماشي وقت فتح التصويت" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }
        return {
          success: true,
          newState: {
            ...state,
            phase: "DAY_VOTE",
            speakerTimer: undefined,
            candidateTallies: {},
            playerBallots: {},
            tiedCandidates: [],
            eventSequence: state.eventSequence + 1,
          },
          newPhase: "DAY_VOTE",
        };
      }

      // ===============================================================
      // 6. DAY VOTING, TALLIES & TIE RUNOFF ENGINE
      // ===============================================================
      case "ADJUST_CANDIDATE_TALLY": {
        if (state.phase !== "DAY_VOTE" && state.phase !== "RUNOFF_VOTE") {
          return { success: false, newState: state, newPhase: state.phase, error: "ماشي مرحلة التصويت" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }
        const cand = state.playerStates[action.candidateId];
        if (!cand || cand.role === "manager" || !cand.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "مرشح غير صالح" };
        }
        if (state.phase === "RUNOFF_VOTE" && !state.tiedCandidates.includes(action.candidateId)) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "فجولة الحسم التصويت محصور غير بين المتعادلين!",
          };
        }

        const livingVotersCount = Object.values(state.playerStates).filter(
          (p) => p.role !== "manager" && p.isAlive
        ).length;
        const curCount = state.candidateTallies[action.candidateId] || 0;
        const nextCount = Math.max(0, Math.min(livingVotersCount, curCount + action.delta));

        return {
          success: true,
          newState: {
            ...state,
            candidateTallies: {
              ...state.candidateTallies,
              [action.candidateId]: nextCount,
            },
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      case "SET_CANDIDATE_TALLY": {
        if (state.phase !== "DAY_VOTE" && state.phase !== "RUNOFF_VOTE") {
          return { success: false, newState: state, newPhase: state.phase, error: "ماشي مرحلة التصويت" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }
        const livingVotersCount = Object.values(state.playerStates).filter(
          (p) => p.role !== "manager" && p.isAlive
        ).length;
        const clamped = Math.max(0, Math.min(livingVotersCount, action.count));
        return {
          success: true,
          newState: {
            ...state,
            candidateTallies: {
              ...state.candidateTallies,
              [action.candidateId]: clamped,
            },
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      case "RESET_TALLIES": {
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }
        return {
          success: true,
          newState: {
            ...state,
            candidateTallies: {},
            playerBallots: {},
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      case "PLAYER_CAST_VOTE": {
        if (state.phase !== "DAY_VOTE" && state.phase !== "RUNOFF_VOTE") {
          return { success: false, newState: state, newPhase: state.phase, error: "ماشي وقت التصويت" };
        }
        const voter = state.playerStates[actorPlayerId];
        if (!voter || voter.role === "manager" || !voter.isAlive) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "غير اللاعبين الأحياء لي يقدرو يصوتو!",
          };
        }
        if (action.targetPlayerId !== "ABSTAIN") {
          const target = state.playerStates[action.targetPlayerId];
          if (!target || target.role === "manager" || !target.isAlive) {
            return { success: false, newState: state, newPhase: state.phase, error: "الهدف غير صالح" };
          }
          if (state.phase === "RUNOFF_VOTE" && !state.tiedCandidates.includes(action.targetPlayerId)) {
            return {
              success: false,
              newState: state,
              newPhase: state.phase,
              error: "التصويت محصور بين المتعادلين فقط!",
            };
          }
        }

        const nextBallots = {
          ...state.playerBallots,
          [actorPlayerId]: action.targetPlayerId,
        };

        // Sync candidateTallies from ballots if Manager hasn't manually overridden tallies above ballot counts
        const ballotCounts: Record<string, number> = {};
        for (const tId of Object.values(nextBallots)) {
          if (tId && tId !== "ABSTAIN") {
            ballotCounts[tId] = (ballotCounts[tId] || 0) + 1;
          }
        }

        return {
          success: true,
          newState: {
            ...state,
            playerBallots: nextBallots,
            candidateTallies: ballotCounts,
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      case "COMMIT_VOTES": {
        if (state.phase !== "DAY_VOTE" && state.phase !== "RUNOFF_VOTE") {
          return { success: false, newState: state, newPhase: state.phase, error: "ماشي مرحلة التصويت" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }

        let topCount = 0;
        let topCandidates: string[] = [];

        for (const [candId, count] of Object.entries(state.candidateTallies)) {
          const p = state.playerStates[candId];
          if (!p || p.role === "manager" || !p.isAlive || count <= 0) continue;
          if (state.phase === "RUNOFF_VOTE" && !state.tiedCandidates.includes(candId)) continue;

          if (count > topCount) {
            topCount = count;
            topCandidates = [candId];
          } else if (count === topCount) {
            topCandidates.push(candId);
          }
        }

        // No votes cast -> peaceful day
        if (topCount === 0 || topCandidates.length === 0) {
          return finishDayPeacefully(state, "ما تصوّت على حتى واحد — الحومة ما قصات حد هاد النهار.");
        }

        // Tie detected!
        if (topCandidates.length > 1) {
          if (state.phase === "RUNOFF_VOTE") {
            // Second tie in runoff -> automatic peaceful resolution per official rules
            return finishDayPeacefully(state, "بقي التعادل فجولة الحسم — لا إقصاء هاد النهار!");
          }
          return {
            success: true,
            newState: {
              ...state,
              phase: "TIE_DECISION",
              tiedCandidates: topCandidates,
              eventSequence: state.eventSequence + 1,
            },
            newPhase: "TIE_DECISION",
          };
        }

        // Single clear elimination!
        return executeDayElimination(state, players, settings, topCandidates[0]);
      }

      case "FORCE_ELIMINATE": {
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }
        const target = state.playerStates[action.targetPlayerId];
        if (!target || target.role === "manager" || !target.isAlive) {
          return { success: false, newState: state, newPhase: state.phase, error: "لاعب غير صالح للإقصاء" };
        }
        return executeDayElimination(state, players, settings, action.targetPlayerId);
      }

      case "SKIP_VOTE_NO_ELIMINATION":
      case "RESOLVE_TIE_PEACEFUL": {
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }
        return finishDayPeacefully(state, "قررت الحومة عدم إقصاء أي لاعب هاد النهار 🕊️.");
      }

      case "START_RUNOFF_DEFENSE": {
        if (state.phase !== "TIE_DECISION" || state.tiedCandidates.length < 2) {
          return { success: false, newState: state, newPhase: state.phase, error: "ما كاينش تعادل حالياً" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }

        const durMs = (settings.runoffDefenseSeconds || 30) * 1000;
        const now = Date.now();
        return {
          success: true,
          newState: {
            ...state,
            phase: "RUNOFF_DEFENSE",
            runoffSpeakerIndex: 0,
            speakerTimer: {
              startsAt: now,
              endsAt: now + durMs,
              durationMs: durMs,
              isPaused: false,
              mode: "RUNOFF_DEFENSE",
            },
            eventSequence: state.eventSequence + 1,
          },
          newPhase: "RUNOFF_DEFENSE",
          timerDurationMs: durMs,
        };
      }

      case "NEXT_RUNOFF_SPEAKER": {
        if (state.phase !== "RUNOFF_DEFENSE") {
          return { success: false, newState: state, newPhase: state.phase, error: "ماشي جولة الدفاع" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }

        const nextIdx = state.runoffSpeakerIndex + 1;
        if (nextIdx < state.tiedCandidates.length) {
          const durMs = (settings.runoffDefenseSeconds || 30) * 1000;
          const now = Date.now();
          return {
            success: true,
            newState: {
              ...state,
              runoffSpeakerIndex: nextIdx,
              speakerTimer: {
                startsAt: now,
                endsAt: now + durMs,
                durationMs: durMs,
                isPaused: false,
                mode: "RUNOFF_DEFENSE",
              },
              eventSequence: state.eventSequence + 1,
            },
            newPhase: "RUNOFF_DEFENSE",
            timerDurationMs: durMs,
          };
        }

        // All tied candidates finished defense -> Runoff Vote!
        return {
          success: true,
          newState: {
            ...state,
            phase: "RUNOFF_VOTE",
            speakerTimer: undefined,
            candidateTallies: {},
            playerBallots: {},
            eventSequence: state.eventSequence + 1,
          },
          newPhase: "RUNOFF_VOTE",
        };
      }

      // ===============================================================
      // 7. DAY RESOLUTION -> NEXT NIGHT & SEAMLESS NEW MANAGER REMATCH
      // ===============================================================
      case "NEXT_NIGHT": {
        if (state.phase !== "DAY_RESOLUTION") {
          return { success: false, newState: state, newPhase: state.phase, error: "مازال ما سالاش النهار" };
        }
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص بالمانيجر فقط" };
        }

        const nextRound = state.round + 1;
        return {
          success: true,
          newState: {
            ...state,
            phase: "NIGHT",
            round: nextRound,
            mutedPlayerId: undefined, // Previous day's mute expires at nightfall!
            lastDayElimination: undefined,
            nightDraft: {},
            candidateTallies: {},
            playerBallots: {},
            tiedCandidates: [],
            eventSequence: state.eventSequence + 1,
          },
          newPhase: "NIGHT",
          newRound: nextRound,
        };
      }

      case "NEW_GAME_NEW_MANAGER": {
        // Anyone who is Manager or Host can kick off the next round right inside the room!
        if (!isManagerOrHost(actorPlayerId, state, players)) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "المانيجر أو مول الغرفة يقدر يطلق جولة جديدة بمانيجر جديد",
          };
        }

        const resetStates: Record<string, DiibCardsPlayerState> = {};
        players.forEach((p, idx) => {
          resetStates[p.id] = {
            playerId: p.id,
            role: "villager",
            team: "VILLAGE",
            isAlive: true,
            seatIndex: idx,
            cardSeen: false,
          };
        });

        return {
          success: true,
          newState: {
            ...state,
            matchNumber: state.matchNumber + 1,
            phase: "MANAGER_SELECT",
            round: 1,
            managerId: undefined,
            managerVolunteers: [],
            playerStates: resetStates,
            dealRelay: undefined,
            witch: { healAvailable: true, poisonAvailable: true },
            lastNightProtectedId: undefined,
            lastNightMutedId: undefined,
            seerLog: [],
            nightDraft: {},
            mutedPlayerId: undefined,
            lastDawnDeaths: [],
            lastDayElimination: undefined,
            pendingHunterIds: [],
            hunterReturnPhase: undefined,
            speakingQueue: [],
            currentSpeakerIndex: -1,
            speakerTimer: undefined,
            lastRuleWarning: undefined,
            candidateTallies: {},
            playerBallots: {},
            tiedCandidates: [],
            runoffSpeakerIndex: 0,
            chronicle: [],
            winner: undefined,
            eventSequence: state.eventSequence + 1,
          },
          newPhase: "MANAGER_SELECT",
          newRound: 1,
        };
      }

      default:
        return { success: false, newState: state, newPhase: state.phase, error: "أمر غير معروف" };
    }
  },

  getPublicView(ctx: GameContext<DiibCardsInternalState, DiibCardsSettings>): PublicGameView {
    const { state, players } = ctx;
    const effectiveSettings = getEffectiveSettings(ctx.settings, state);
    const playableStates = Object.values(state.playerStates).filter((p) => p.role !== "manager");
    const livingPlayable = playableStates.filter((p) => p.isAlive);
    const deadPlayable = playableStates.filter((p) => !p.isAlive);
    const cardsSeenCount = playableStates.filter((p) => p.cardSeen).length;

    const currentSpeakerId =
      state.phase === "SPEAKING_TURNS" &&
      state.currentSpeakerIndex >= 0 &&
      state.currentSpeakerIndex < state.speakingQueue.length
        ? state.speakingQueue[state.currentSpeakerIndex].playerId
        : state.phase === "RUNOFF_DEFENSE" &&
          state.runoffSpeakerIndex >= 0 &&
          state.runoffSpeakerIndex < state.tiedCandidates.length
        ? state.tiedCandidates[state.runoffSpeakerIndex]
        : undefined;

    const dealRelayCurrentId = state.dealRelay?.queue[state.dealRelay.currentIndex];

    return {
      gameId: "diib-cards",
      phase: state.phase,
      round: state.round,
      stateVersion: state.eventSequence,
      publicData: {
        phase: state.phase,
        round: state.round,
        matchNumber: state.matchNumber,
        managerId: state.managerId,
        managerVolunteers: state.managerVolunteers,
        managerHistory: state.managerHistory,
        alivePlayerIds: livingPlayable.map((p) => p.playerId),
        deadPlayers: deadPlayable.map((p) => ({
          playerId: p.playerId,
          round: p.death?.round ?? state.round,
          cause: p.death?.cause ?? "WOLF_ATTACK",
          revealedRole:
            state.phase === "GAME_OVER" || effectiveSettings.roleRevealOnDeath
              ? (p.role as PlayableDiibRole)
              : undefined,
        })),
        mutedPlayerId: state.mutedPlayerId,
        cardsSeenCount,
        totalPlayableCount: playableStates.length,
        lastDawnDeaths: state.lastDawnDeaths,
        lastDayElimination: state.lastDayElimination,
        pendingHunterId: state.pendingHunterIds[0],
        speakingQueue: state.speakingQueue,
        currentSpeakerIndex: state.currentSpeakerIndex,
        currentSpeakerId,
        speakerTimer: state.speakerTimer,
        lastRuleWarning: state.lastRuleWarning,
        candidateTallies: state.candidateTallies,
        votedPlayerIds: Object.keys(state.playerBallots),
        tiedCandidates: state.tiedCandidates,
        runoffSpeakerIndex: state.runoffSpeakerIndex,
        chronicle: state.chronicle,
        winner: state.winner,
        effectiveSettings: {
          speakingDurationSeconds: effectiveSettings.speakingDurationSeconds,
          runoffDefenseSeconds: effectiveSettings.runoffDefenseSeconds,
          openDebateSeconds: effectiveSettings.openDebateSeconds,
          roleRevealOnDeath: effectiveSettings.roleRevealOnDeath,
          muteRule: effectiveSettings.muteRule,
          preventConsecutiveMute: effectiveSettings.preventConsecutiveMute,
          preventConsecutiveProtect: effectiveSettings.preventConsecutiveProtect,
          allowPlayerPhoneVotes: effectiveSettings.allowPlayerPhoneVotes,
          customRoles: effectiveSettings.customRoles,
        },
        dealRelay: state.dealRelay
          ? {
              currentPlayerId: dealRelayCurrentId,
              currentNickname: players.find((p) => p.id === dealRelayCurrentId)?.nickname || "",
              currentIndex: state.dealRelay.currentIndex,
              totalCount: state.dealRelay.queue.length,
              isRevealed: state.dealRelay.isRevealed,
            }
          : undefined,
      },
    };
  },

  getPlayerView(
    ctx: GameContext<DiibCardsInternalState, DiibCardsSettings>,
    playerId: string
  ): PrivatePlayerGameView {
    const { state, players } = ctx;
    const settings = getEffectiveSettings(ctx.settings, state);
    const pState = state.playerStates[playerId];
    const roomPlayer = players.find((p) => p.id === playerId);
    const isHost = Boolean(roomPlayer?.isHost);

    if (!pState) {
      return {
        playerId,
        isHost,
        privateData: {},
        allowedActions: [],
      };
    }

    // Before Manager is confirmed, nobody has a secret role yet
    if (state.phase === "MANAGER_SELECT") {
      return {
        playerId,
        isHost,
        privateData: {
          isAlive: true,
          isVolunteered: state.managerVolunteers.includes(playerId),
        },
        allowedActions: ["VOLUNTEER_MANAGER"],
      };
    }

    // In One-Phone mode while dealRelay is active, strictly gate secret projections behind curtain!
    if (state.dealRelay) {
      const activeRelayPlayerId = state.dealRelay.queue[state.dealRelay.currentIndex];
      if (!state.dealRelay.isRevealed || activeRelayPlayerId !== playerId) {
        return {
          playerId,
          isHost,
          privateData: {
            isAlive: pState.isAlive,
            curtainLocked: true,
          },
          allowedActions: ["DEAL_RELAY_STEP"],
        };
      }
    }

    // -----------------------------------------------------------------
    // MANAGER PRIVATE VIEW: Sees the Master Roster, Potions & Rule Helpers!
    // -----------------------------------------------------------------
    if (playerId === state.managerId) {
      const computedOutcome = computeNightOutcome(state, settings);
      const playableList = Object.values(state.playerStates)
        .filter((p) => p.role !== "manager")
        .sort((a, b) => a.seatIndex - b.seatIndex)
        .map((p) => ({
          playerId: p.playerId,
          role: p.role as PlayableDiibRole,
          team: p.team,
          isAlive: p.isAlive,
          cardSeen: p.cardSeen,
          isMutedToday: state.mutedPlayerId === p.playerId,
          wasProtectedLastNight: state.lastNightProtectedId === p.playerId,
          wasMutedLastNight: state.lastNightMutedId === p.playerId,
          death: p.death,
        }));

      const rolesInPlay = playableList.reduce<Record<string, { total: number; alive: number }>>(
        (acc, item) => {
          if (!acc[item.role]) acc[item.role] = { total: 0, alive: 0 };
          acc[item.role].total += 1;
          if (item.isAlive) acc[item.role].alive += 1;
          return acc;
        },
        {}
      );

      return {
        playerId,
        isHost,
        myRole: "manager",
        myTeam: "MANAGER",
        privateData: {
          isManager: true,
          isAlive: true,
          role: "manager",
          masterRoster: playableList,
          rolesInPlay,
          nightDraft: state.nightDraft,
          computedNightOutcome: computedOutcome,
          witch: state.witch,
          lastNightProtectedId: state.lastNightProtectedId,
          lastNightMutedId: state.lastNightMutedId,
          seerLog: state.seerLog,
          playerBallots: state.playerBallots,
          allRoles:
            state.phase === "GAME_OVER"
              ? Object.fromEntries(
                  Object.entries(state.playerStates).map(([id, s]) => [id, s.role])
                )
              : undefined,
        },
        allowedActions: ["MANAGER_CONTROLS"],
      };
    }

    // -----------------------------------------------------------------
    // REGULAR PLAYER PRIVATE VIEW: Luxury Secret Card + Companion Status
    // -----------------------------------------------------------------
    const privateData: Record<string, unknown> = {
      isManager: false,
      isAlive: pState.isAlive,
      role: pState.role,
      team: pState.team,
      cardSeen: pState.cardSeen,
      isMutedToday: state.mutedPlayerId === playerId,
      myBallot: state.playerBallots[playerId],
    };

    // Wolves know their fellow wolf pack members
    if (pState.team === "WOLVES") {
      privateData.packMembers = Object.values(state.playerStates)
        .filter((p) => p.team === "WOLVES")
        .map((p) => p.playerId);
    }

    // Reveal all roles ONLY when the match is completely over
    if (state.phase === "GAME_OVER") {
      privateData.allRoles = Object.fromEntries(
        Object.entries(state.playerStates).map(([id, s]) => [id, s.role])
      );
    }

    const allowedActions: string[] = ["MARK_CARD_SEEN"];
    if (
      pState.isAlive &&
      settings.allowPlayerPhoneVotes &&
      (state.phase === "DAY_VOTE" || state.phase === "RUNOFF_VOTE")
    ) {
      allowedActions.push("PLAYER_CAST_VOTE");
    }

    return {
      playerId,
      isHost,
      myRole: pState.role,
      myTeam: pState.team,
      privateData,
      allowedActions,
    };
  },

  checkFinished(ctx: GameContext<DiibCardsInternalState, DiibCardsSettings>): GameEndResult | null {
    const { state } = ctx;
    if (state.phase !== "GAME_OVER" || !state.winner) {
      return null;
    }

    return {
      isFinished: true,
      winner: {
        team: state.winner,
        players: Object.values(state.playerStates)
          .filter((p) => p.team === state.winner)
          .map((p) => p.playerId),
        summary:
          state.winner === "VILLAGE"
            ? "ربحو ولاد الحومة! تم كشف وإقصاء جميع الذيابة 🎉🏡"
            : state.winner === "WOLVES"
            ? "ربحو الذيابة! سيطرو على الحومة فظلام الليل 🐺🩸"
            : "تعادل تاريخي! سقط الجميع فنفس اللحظة ⚔️",
      },
    };
  },
};

function finishDayPeacefully(
  state: DiibCardsInternalState,
  summaryText: string
): TransitionResult<DiibCardsInternalState> {
  const chr: ChronicleEntry = {
    id: `chr_day_${state.round}_${Date.now()}`,
    round: state.round,
    phase: "DAY",
    summary: `النهار ${state.round}: ${summaryText}`,
    deaths: [],
  };

  return {
    success: true,
    newState: {
      ...state,
      phase: "DAY_RESOLUTION",
      lastDayElimination: undefined,
      tiedCandidates: [],
      speakerTimer: undefined,
      chronicle: [...state.chronicle, chr],
      eventSequence: state.eventSequence + 1,
    },
    newPhase: "DAY_RESOLUTION",
  };
}

function executeDayElimination(
  state: DiibCardsInternalState,
  players: Player[],
  settings: DiibCardsSettings,
  eliminatedPlayerId: string
): TransitionResult<DiibCardsInternalState> {
  const target = state.playerStates[eliminatedPlayerId];
  if (!target || target.role === "manager" || !target.isAlive) {
    return finishDayPeacefully(state, "لا إقصاء هاد النهار.");
  }

  const deathRecord: DiibDeathRecord = {
    playerId: eliminatedPlayerId,
    round: state.round,
    cause: "DAY_VOTE",
    revealedRole: settings.roleRevealOnDeath ? (target.role as PlayableDiibRole) : undefined,
  };

  const nextPlayerStates: Record<string, DiibCardsPlayerState> = {
    ...state.playerStates,
    [eliminatedPlayerId]: {
      ...target,
      isAlive: false,
      death: deathRecord,
    },
  };

  const targetName = players.find((p) => p.id === eliminatedPlayerId)?.nickname || "لاعب";
  const chr: ChronicleEntry = {
    id: `chr_day_${state.round}_${Date.now()}`,
    round: state.round,
    phase: "DAY",
    summary: `النهار ${state.round}: صوتت الحومة على إقصاء ${targetName} ⚖️.`,
    deaths: [eliminatedPlayerId],
  };

  // If eliminated player is Hunter -> immediate revenge shot before day resolution / game over!
  if (target.role === "hunter") {
    return {
      success: true,
      newState: {
        ...state,
        playerStates: nextPlayerStates,
        phase: "HUNTER_REACTION",
        pendingHunterIds: [eliminatedPlayerId],
        hunterReturnPhase: "DAY_RESOLUTION",
        lastDayElimination: deathRecord,
        tiedCandidates: [],
        speakerTimer: undefined,
        chronicle: [...state.chronicle, chr],
        eventSequence: state.eventSequence + 1,
      },
      newPhase: "HUNTER_REACTION",
    };
  }

  const win = evaluateDiibCardsWinner(nextPlayerStates);
  if (win) {
    return {
      success: true,
      newState: {
        ...state,
        playerStates: nextPlayerStates,
        phase: "GAME_OVER",
        winner: win,
        lastDayElimination: deathRecord,
        tiedCandidates: [],
        speakerTimer: undefined,
        chronicle: [...state.chronicle, chr],
        eventSequence: state.eventSequence + 1,
      },
      newPhase: "GAME_OVER",
    };
  }

  return {
    success: true,
    newState: {
      ...state,
      playerStates: nextPlayerStates,
      phase: "DAY_RESOLUTION",
      lastDayElimination: deathRecord,
      tiedCandidates: [],
      speakerTimer: undefined,
      chronicle: [...state.chronicle, chr],
      eventSequence: state.eventSequence + 1,
    },
    newPhase: "DAY_RESOLUTION",
  };
}
