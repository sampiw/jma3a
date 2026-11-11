import { InteractionMode } from "@/lib/types";

export type PlayableDiibRole =
  | "wolf"
  | "mute_wolf"
  | "seer"
  | "witch"
  | "protector"
  | "hunter"
  | "villager";

export type DiibCardRole = PlayableDiibRole | "manager";

export type DiibCardsTeam = "VILLAGE" | "WOLVES" | "MANAGER";

export type DiibDeathCause =
  | "WOLF_ATTACK"
  | "WITCH_POISON"
  | "DAY_VOTE"
  | "HUNTER_SHOT"
  | "MANAGER_DECREE";

export interface DiibDeathRecord {
  playerId: string;
  round: number;
  cause: DiibDeathCause;
  revealedRole?: PlayableDiibRole;
}

export type DiibCardsPhase =
  | "MANAGER_SELECT"
  | "ROLE_REVEAL"
  | "NIGHT"
  | "HUNTER_REACTION"
  | "DAWN_ANNOUNCEMENT"
  | "SPEAKING_TURNS"
  | "DAY_VOTE"
  | "TIE_DECISION"
  | "RUNOFF_DEFENSE"
  | "RUNOFF_VOTE"
  | "DAY_RESOLUTION"
  | "GAME_OVER";

export interface DiibCardsPlayerState {
  playerId: string;
  role: DiibCardRole;
  team: DiibCardsTeam;
  isAlive: boolean;
  seatIndex: number;
  cardSeen: boolean;
  death?: DiibDeathRecord;
}

export interface DiibCardsSettings {
  speakingDurationSeconds: number; // default: 45s per player
  runoffDefenseSeconds: number; // default: 30s per tied candidate
  openDebateSeconds: number; // default: 60s optional free debate
  roleRevealOnDeath: boolean; // default: true
  muteRule: "WOLVES_PACK" | "MUTE_WOLF_ONLY" | "OFF"; // default: "WOLVES_PACK"
  preventConsecutiveMute: boolean; // default: true
  preventConsecutiveProtect: boolean; // default: true
  allowPlayerPhoneVotes: boolean; // default: true (hybrid: players CAN tap vote OR Manager tallies hands!)
  customRoles?: Partial<Record<PlayableDiibRole, number>>;
  interactionMode?: InteractionMode;
}

export interface NightDraft {
  protectedId?: string;
  seerInspectId?: string;
  wolfTargetId?: string;
  mutedTargetId?: string;
  witchSave?: boolean;
  witchPoisonId?: string;
  useManualOverride?: boolean;
  manualDeathIds?: string[];
}

export interface ChronicleEntry {
  id: string;
  round: number;
  phase: "NIGHT" | "DAY" | "HUNTER";
  summary: string;
  deaths: string[];
  mutedId?: string;
  savedByShield?: boolean;
  savedByWitch?: boolean;
}

export interface SpeakerEntry {
  playerId: string;
  isMuted: boolean;
  hasSpoken: boolean;
  skippedReason?: "MUTED" | "MANAGER_SKIP";
}

export interface SpeakerTimerState {
  startsAt: number;
  endsAt: number;
  durationMs: number;
  isPaused: boolean;
  pausedRemainingMs?: number;
  mode: "TURN" | "OPEN_FLOOR" | "RUNOFF_DEFENSE";
}

export interface RuleWarningBanner {
  id: string;
  targetPlayerId: string;
  reason: "MUTED_SPOKE" | "OUT_OF_TURN" | "DEAD_SPOKE";
  issuedAt: number;
}

export interface DealRelayState {
  queue: string[]; // Non-manager players in seat order, ending with Manager last!
  currentIndex: number;
  isRevealed: boolean;
}

export interface DiibCardsState {
  matchNumber: number;
  phase: DiibCardsPhase;
  round: number;
  eventSequence: number;

  // Manager tracking & rotation across rounds (nobody leaves the room!)
  managerId?: string;
  managerVolunteers: string[];
  managerHistory: string[]; // Previous manager IDs in this room session

  // Role states (populated once Manager is confirmed and cards are dealt)
  playerStates: Record<string, DiibCardsPlayerState>;

  // One-Phone Card Deal Relay (passes phone privately once at start, ending on Manager!)
  dealRelay?: DealRelayState;

  // Persistent power rules across rounds
  witch: {
    healAvailable: boolean;
    poisonAvailable: boolean;
  };
  lastNightProtectedId?: string;
  lastNightMutedId?: string;
  seerLog: Array<{
    round: number;
    targetId: string;
    isWolf: boolean;
    role: PlayableDiibRole;
  }>;

  // Current Night working sheet (only visible to Manager)
  nightDraft: NightDraft;

  // Morning / Day active status
  mutedPlayerId?: string; // Silenced for the entire current day!
  lastDawnDeaths: DiibDeathRecord[];
  lastDayElimination?: DiibDeathRecord;

  // Hunter revenge queue
  pendingHunterIds: string[];
  hunterReturnPhase?: "DAWN_ANNOUNCEMENT" | "DAY_RESOLUTION";

  // Speaking Queue & Timer Engine
  speakingQueue: SpeakerEntry[];
  currentSpeakerIndex: number;
  speakerTimer?: SpeakerTimerState;
  lastRuleWarning?: RuleWarningBanner;

  // Voting & Tie Runoff Engine
  candidateTallies: Record<string, number>; // Manager hand-count tallies per candidateId
  playerBallots: Record<string, string>; // Optional phone votes: voterId -> candidateId | "ABSTAIN"
  tiedCandidates: string[];
  runoffSpeakerIndex: number;

  // Match Story Chronicle & Winner
  chronicle: ChronicleEntry[];
  winner?: "VILLAGE" | "WOLVES" | "DRAW";
}

export type DiibCardsAction =
  // Phase 1: Manager Selection & Setup
  | { type: "VOLUNTEER_MANAGER" }
  | { type: "CONFIRM_MANAGER"; managerId: string }
  | { type: "AUTO_PICK_MANAGER" }
  | { type: "UPDATE_INLINE_SETTINGS"; settings: Partial<DiibCardsSettings> }
  // Phase 2: Card Reveal & One-Phone Deal
  | { type: "MARK_CARD_SEEN" }
  | { type: "DEAL_RELAY_STEP" }
  | { type: "START_NIGHT" }
  // Phase 3: Night (Manager Ledger & Rule Helpers)
  | { type: "UPDATE_NIGHT_DRAFT"; draft: Partial<NightDraft> }
  | { type: "TOGGLE_MANUAL_NIGHT_DEATH"; targetPlayerId: string }
  | { type: "COMMIT_NIGHT" }
  // Phase 4: Hunter Revenge Interrupt
  | { type: "RESOLVE_HUNTER_SHOT"; targetPlayerId: string }
  | { type: "SKIP_HUNTER_SHOT" }
  // Phase 5: Dawn -> Speaking Turns
  | { type: "START_SPEAKING" }
  // Phase 6: Speaking Queue & Timer Controls
  | { type: "NEXT_SPEAKER" }
  | { type: "SELECT_SPEAKER"; targetPlayerId: string }
  | { type: "RANDOM_SPEAKER" }
  | { type: "ADD_SPEAKER_TIME"; extraSeconds: number }
  | { type: "PAUSE_RESUME_SPEAKER" }
  | { type: "OPEN_FLOOR_DEBATE"; durationSeconds?: number }
  | { type: "FLAG_RULE_WARNING"; targetPlayerId: string; reason: "MUTED_SPOKE" | "OUT_OF_TURN" | "DEAD_SPOKE" }
  | { type: "START_VOTING" }
  // Phase 7: Day Voting & Tie Runoff
  | { type: "ADJUST_CANDIDATE_TALLY"; candidateId: string; delta: number }
  | { type: "SET_CANDIDATE_TALLY"; candidateId: string; count: number }
  | { type: "RESET_TALLIES" }
  | { type: "PLAYER_CAST_VOTE"; targetPlayerId: string }
  | { type: "COMMIT_VOTES" }
  | { type: "FORCE_ELIMINATE"; targetPlayerId: string }
  | { type: "SKIP_VOTE_NO_ELIMINATION" }
  // Tie & Runoff actions
  | { type: "START_RUNOFF_DEFENSE" }
  | { type: "NEXT_RUNOFF_SPEAKER" }
  | { type: "RESOLVE_TIE_PEACEFUL" }
  // Day Resolution -> Next Night
  | { type: "NEXT_NIGHT" }
  // Game Over -> Seamless Next Round with New Manager (nobody leaves room!)
  | { type: "NEW_GAME_NEW_MANAGER" };

export interface DiibRoleMeta {
  id: DiibCardRole;
  title: string;
  subtitle: string;
  emoji: string;
  team: DiibCardsTeam;
  ruleBadge: string;
  description: string;
  themeGradient: string;
  borderColor: string;
  badgeBg: string;
}

export const DIIB_CARDS_ROLE_META: Record<DiibCardRole, DiibRoleMeta> = {
  manager: {
    id: "manager",
    title: "المانيجر (الحكواتي)",
    subtitle: "THE GAME MASTER",
    emoji: "👑",
    team: "MANAGER",
    ruleBadge: "سيّد الطاولة والقوانين 📜",
    description:
      "نتا هو عين الحومة وحكم القوانين! كتشوف كوارط الجميع، كتفيّق الأدوار بالليل، كتسجّل شكون مات وشكون تسكّت، وكتتحكم فتايمر الهضرة والتصويت!",
    themeGradient: "from-amber-500/30 via-yellow-900/40 to-jma3a-dark",
    borderColor: "border-amber-400/80",
    badgeBg: "bg-amber-950/90 text-amber-300 border-amber-400/50",
  },
  wolf: {
    id: "wolf",
    title: "الذيب",
    subtitle: "THE WEREWOLF",
    emoji: "🐺",
    team: "WOLVES",
    ruleBadge: "هجوم ليلي مع العصابة 🩸",
    description:
      "كتفيق بالليل فصمت مع خوتك الذيابة بـ إشارة المانيجر، وكتختارو ضحية تفترسوها... وبالنهار مثّل البراءة وقلب التهمة على القرويين!",
    themeGradient: "from-rose-600/30 via-rose-950/50 to-jma3a-dark",
    borderColor: "border-rose-500/80",
    badgeBg: "bg-rose-950/90 text-rose-300 border-rose-500/50",
  },
  mute_wolf: {
    id: "mute_wolf",
    title: "الذيب السكّات",
    subtitle: "SILENCER WOLF",
    emoji: "🤐",
    team: "WOLVES",
    ruleBadge: "افتراس + تسكيت لاعب بالنهار 🤐",
    description:
      "ذيب خطير من العصابة! كتفيق مع الذيابة باش تختارو الضحية، وعندك قوة تسكّت لاعب حي باش يصبح مبوّق وممنوع ينطق بحتى كلمة طيلة النهار!",
    themeGradient: "from-fuchsia-600/30 via-rose-950/50 to-jma3a-dark",
    borderColor: "border-fuchsia-500/80",
    badgeBg: "bg-fuchsia-950/90 text-fuchsia-300 border-fuchsia-500/50",
  },
  seer: {
    id: "seer",
    title: "الشوافة",
    subtitle: "THE MYSTIC SEER",
    emoji: "🔮",
    team: "VILLAGE",
    ruleBadge: "كشف الهوية كل ليلة 👁️",
    description:
      "كل ليلة كيفيّقك المانيجر بوحدك، كتأشّري ليه بيدك على لاعب واحد وكيعطيك الإشارة واش ذيب ولا بريء. وجّهي الحومة بالنهار بلا ما تفرشي راسك!",
    themeGradient: "from-indigo-500/30 via-indigo-950/50 to-jma3a-dark",
    borderColor: "border-indigo-400/80",
    badgeBg: "bg-indigo-950/90 text-indigo-300 border-indigo-400/50",
  },
  witch: {
    id: "witch",
    title: "السحارة",
    subtitle: "THE HERBALIST WITCH",
    emoji: "🧪",
    team: "VILLAGE",
    ruleBadge: "جرعة حياة ❤️ + جرعة سم 💀",
    description:
      "عندك جوج قراعي سحرية فالماتش كامل: قرعة الحياة كتعتق بيها ضحية الذيابة مرة وحدة، وقرعة السم كتقضي بيها على أي مشتبه فيه بالليل مرة وحدة!",
    themeGradient: "from-emerald-500/30 via-teal-950/50 to-jma3a-dark",
    borderColor: "border-emerald-400/80",
    badgeBg: "bg-emerald-950/90 text-emerald-300 border-emerald-400/50",
  },
  protector: {
    id: "protector",
    title: "الحارس",
    subtitle: "THE MEDINA GUARDIAN",
    emoji: "🛡️",
    team: "VILLAGE",
    ruleBadge: "درع ضد الذيابة (بلا تكرار متتالي) 🛡️",
    description:
      "عسّاس الحومة الشجاع! كل ليلة كتختار لاعب تحميه بدرعك من أنياب الذيابة (حتى راسك)، ولكن القانون كيمنع تحمي نفس الشخص جوج ليالي متابعين!",
    themeGradient: "from-sky-500/30 via-blue-950/50 to-jma3a-dark",
    borderColor: "border-sky-400/80",
    badgeBg: "bg-sky-950/90 text-sky-300 border-sky-400/50",
  },
  hunter: {
    id: "hunter",
    title: "الصياد",
    subtitle: "THE ATLAS HUNTER",
    emoji: "🎯",
    team: "VILLAGE",
    ruleBadge: "رصاصة الانتقام عند الموت 💥",
    description:
      "إيلا غدروك الذيابة بالليل ولا ظلموك الحومة بالتصويت، ما كتموتش بوحدك! قبل ما تسلم الروح كتيري رصاصتك الأخيرة على لاعب حي يمشي معاك!",
    themeGradient: "from-orange-500/30 via-amber-950/50 to-jma3a-dark",
    borderColor: "border-orange-400/80",
    badgeBg: "bg-orange-950/90 text-orange-300 border-orange-400/50",
  },
  villager: {
    id: "villager",
    title: "ولد الحومة",
    subtitle: "MEDINA VILLAGER",
    emoji: "👨‍🌾",
    team: "VILLAGE",
    ruleBadge: "قوة التحليل والتصويت 🏮",
    description:
      "ما عندك لا سحر لا سلاح بالليل، ولكن بالنهار عينك ميزانك! ركّز فملامح صحابك، حاصر المتناقضين فالهضرة، وصوّت بذكاء باش تنقي الحومة!",
    themeGradient: "from-amber-600/25 via-stone-900/50 to-jma3a-dark",
    borderColor: "border-jma3a-gold/60",
    badgeBg: "bg-stone-900/90 text-jma3a-sand border-jma3a-gold/40",
  },
};
