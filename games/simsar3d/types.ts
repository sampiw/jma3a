export type SimsarMode = "BLITZ" | "EMPIRE";

export type SimsarPhase =
  | "ROLL_READY"
  | "LANDED_DECISION"
  | "AUCTION"
  | "HEIST"
  | "MINIGAME"
  | "GAME_OVER";

export type SimsarTokenId =
  | "TAXI_HMER"
  | "MERCEDES_240"
  | "JADARMIYA"
  | "WATERMELON_TRUCK"
  | "C15_KHATTAF"
  | "VIP_SPORTS";

export interface SimsarTokenSpec {
  id: SimsarTokenId;
  nameAr: string;
  emoji: string;
  glbPath: string;
  bodyHex: number;
  accentCss: string;
}

export const SIMSAR_TOKENS: Record<SimsarTokenId, SimsarTokenSpec> = {
  TAXI_HMER: {
    id: "TAXI_HMER",
    nameAr: "طاكسي كازا الحمر",
    emoji: "🚕",
    glbPath: "/models/cars/taxi.glb",
    bodyHex: 0xdc2626,
    accentCss: "#ef4444",
  },
  MERCEDES_240: {
    id: "MERCEDES_240",
    nameAr: "الحاج مرسيدس 240",
    emoji: "🚘",
    glbPath: "/models/cars/sedan.glb",
    bodyHex: 0xfde68a,
    accentCss: "#f59e0b",
  },
  JADARMIYA: {
    id: "JADARMIYA",
    nameAr: "الكوميسير رادار",
    emoji: "🚓",
    glbPath: "/models/cars/police.glb",
    bodyHex: 0x1d4ed8,
    accentCss: "#3b82f6",
  },
  WATERMELON_TRUCK: {
    id: "WATERMELON_TRUCK",
    nameAr: "إمبراطور الدلاح",
    emoji: "🍉",
    glbPath: "/models/cars/delivery-flat.glb",
    bodyHex: 0x16a34a,
    accentCss: "#22c55e",
  },
  C15_KHATTAF: {
    id: "C15_KHATTAF",
    nameAr: "C15 السويقة",
    emoji: "🚐",
    glbPath: "/models/cars/van.glb",
    bodyHex: 0x0284c7,
    accentCss: "#38bdf8",
  },
  VIP_SPORTS: {
    id: "VIP_SPORTS",
    nameAr: "ولد الفشوش سبور",
    emoji: "🏎️",
    glbPath: "/models/cars/sedan-sports.glb",
    bodyHex: 0x9333ea,
    accentCss: "#c084fc",
  },
};

export const SIMSAR_TOKEN_ORDER: SimsarTokenId[] = [
  "TAXI_HMER",
  "MERCEDES_240",
  "JADARMIYA",
  "WATERMELON_TRUCK",
  "C15_KHATTAF",
  "VIP_SPORTS",
];

export type SimsarColorGroup =
  | "CHEFCHAOUEN_BLUE"
  | "SOUK_TERRACOTTA"
  | "CASA_EMERALD"
  | "MARRAKECH_GOLD"
  | "ROYAL_PURPLE"
  | "UTILITY";

export type SimsarTileKind =
  | "START"
  | "CITY"
  | "UTILITY"
  | "HAMZA"
  | "JAIL"
  | "JACKPOT"
  | "HEIST"
  | "RADAR_TO_JAIL"
  | "TAX";

export interface SimsarTileSpec {
  index: number;
  kind: SimsarTileKind;
  nameAr: string;
  shortAr: string;
  emoji: string;
  group?: SimsarColorGroup;
  colorHex: string;
  price?: number;
  upgradeCost?: number;
  /** [baselot, 1:Café, 2:Riad, 3:5-Star Hotel] */
  rents?: [number, number, number, number];
}

export interface SimsarPropertyState {
  ownerId: string | null;
  level: 0 | 1 | 2 | 3; // 0 = plot, 1 = Café, 2 = Riad, 3 = Luxury 5-Star Hotel
  isMortgaged: boolean;
}

export type SimsarReactionId =
  | "PAY_RENT"
  | "HAMZA_WIN"
  | "KARNI"
  | "TBARKALLAH"
  | "CHAFAR"
  | "BROKE";

export const SIMSAR_REACTIONS: Record<
  SimsarReactionId,
  { id: SimsarReactionId; emoji: string; textAr: string }
> = {
  PAY_RENT: { id: "PAY_RENT", emoji: "💸", textAr: "خلص الكرا أ صاحبي!" },
  HAMZA_WIN: { id: "HAMZA_WIN", emoji: "🔥", textAr: "همزة ديال بصح!" },
  KARNI: { id: "KARNI", emoji: "📝", textAr: "قيدها فالكارني!" },
  TBARKALLAH: { id: "TBARKALLAH", emoji: "🧿", textAr: "اللهم بارك بلا عين!" },
  CHAFAR: { id: "CHAFAR", emoji: "🥷", textAr: "شفّار بالعلالي!" },
  BROKE: { id: "BROKE", emoji: "🪙", textAr: "بقات فيا غير درهم!" },
};

export const SIMSAR_REACTION_ORDER: SimsarReactionId[] = [
  "PAY_RENT",
  "HAMZA_WIN",
  "KARNI",
  "TBARKALLAH",
  "CHAFAR",
  "BROKE",
];

export interface SimsarPlayer {
  id: string;
  nickname: string;
  isBot: boolean;
  token: SimsarTokenId;
  accentHex: string;
  cash: number;
  netWorth: number;
  position: number; // 0..23
  prevPosition: number; // used by 3D client to animate tile-by-tile hops!
  moveSeq: number; // increments every move so client knows when to hop
  inJailTurns: number; // 0 = free, 1..2 = turns remaining in الفوريان
  shields: number; // 0..2 Simsar Shields blocking Heist / Half-Rent!
  isBankrupt: boolean;

  // Match Roast Award Stats
  rentCollected: number;
  rentPaid: number;
  heistStolen: number;
  auctionsWon: number;
  miniGamesWon: number;
  jailVisits: number;

  lastReactionId: SimsarReactionId | null;
  lastReactionAt: number;
}

export interface SimsarDiceRoll {
  die1: number; // 1..6
  die2: number; // 1..6
  total: number;
  isDoubles: boolean;
  multiplier: 1 | 2;
  rollerId: string;
  rollSeq: number;
  rolledAt: number;
}

export interface SimsarAuctionState {
  tileIndex: number;
  currentBid: number;
  highestBidderId: string | null;
  passedPlayerIds: string[];
  startedAt: number;
  endsAt: number;
}

export type SimsarHeistSymbol = "SILVER" | "GOLD" | "DIAMOND";

export interface SimsarHeistState {
  raiderId: string;
  victimId: string;
  boxes: SimsarHeistSymbol[]; // length 9 hidden under 9 3D Tajines
  revealedIndices: number[];
  resolvedTier: SimsarHeistSymbol | null;
  stolenAmount: number;
  shieldBlocked: boolean;
}

export type SimsarMiniGameId =
  | "DIRHAM_RAIN"
  | "TAJINE_SHUFFLE"
  | "TAXI_METER"
  | "HOT_BUTAGAZ";

export interface SimsarMiniGameState {
  id: SimsarMiniGameId;
  roundNumber: number;
  seed: number;
  startedAt: number;
  endsAt: number;
  scores: Record<string, number>;
  submittedIds: string[];
  resolved: boolean;
  rankings?: Array<{ playerId: string; nickname: string; score: number; rewardDh: number }>;
}

export interface SimsarEventBanner {
  id: string;
  emoji: string;
  titleAr: string;
  subtitleAr: string;
  tone: "GOLD" | "EMERALD" | "ROSE" | "PURPLE" | "CYAN";
  createdAt: number;
}

export interface SimsarAwardBadge {
  id: string;
  emoji: string;
  titleAr: string;
  subtitleAr: string;
  winnerId: string;
  winnerName: string;
  statLabel: string;
}

export interface SimsarSettings {
  mode: SimsarMode;
  botFill: boolean;
  maxRounds: number;
  startingCash: number;
  empireTargetDh: number;
}

export interface SimsarState {
  phase: SimsarPhase;
  mode: SimsarMode;
  round: number;
  maxRounds: number;
  empireTargetDh: number;
  settings: SimsarSettings;

  turnOrder: string[]; // active player IDs
  currentTurnIndex: number;
  currentPlayerId: string;
  extraRollGranted: boolean;

  players: Record<string, SimsarPlayer>;
  properties: Record<number, SimsarPropertyState>;
  gardiennagePot: number; // accumulated center jackpot!

  lastDice: SimsarDiceRoll | null;
  pendingTileIndex: number | null; // tile awaiting buy/auction/end-turn decision
  hasUpgradedThisTurn: boolean;

  auction: SimsarAuctionState | null;
  heist: SimsarHeistState | null;
  miniGame: SimsarMiniGameState | null;

  recentEvents: SimsarEventBanner[];
  winnerId: string | null;
  winnerSummaryAr: string | null;
  awards: SimsarAwardBadge[];
  updatedAt: number;
}

export type SimsarAction =
  | { type: "ROLL_DICE"; multiplier?: 1 | 2 }
  | { type: "PAY_JAIL_BAIL" }
  | { type: "BUY_PROPERTY" }
  | { type: "START_AUCTION" }
  | { type: "PLACE_BID"; amountDelta: number }
  | { type: "PASS_AUCTION" }
  | { type: "FINALIZE_AUCTION" }
  | { type: "PICK_HEIST_BOX"; boxIndex: number }
  | { type: "UPGRADE_PROPERTY"; tileIndex: number }
  | { type: "MORTGAGE_PROPERTY"; tileIndex: number }
  | { type: "UNMORTGAGE_PROPERTY"; tileIndex: number }
  | { type: "END_TURN" }
  | { type: "SUBMIT_MINIGAME_SCORE"; score: number }
  | { type: "FINALIZE_MINIGAME" }
  | { type: "BOT_STEP" }
  | { type: "SEND_REACTION"; reactionId: SimsarReactionId }
  | { type: "SELECT_TOKEN"; token: SimsarTokenId }
  | { type: "CONFIGURE_MATCH"; mode?: SimsarMode; botFill?: boolean }
  | { type: "PLAY_AGAIN" };
