export const ONITAMA3D_GAME_ID = "onitama3d" as const;

export type BoardGameMode = "ONITAMA" | "CHESS";

export type PieceSide = "GOLD" | "CRIMSON";

export type PieceKind =
  | "KING"
  | "QUEEN"
  | "ROOK"
  | "BISHOP"
  | "KNIGHT"
  | "PAWN"
  | "STUDENT";

export interface BoardPiece {
  id: string;
  side: PieceSide;
  kind: PieceKind;
  r: number;
  c: number;
  hasMoved?: boolean;
}

export interface OnitamaCardDef {
  id: string;
  nameAr: string;
  nameEn: string;
  emoji: string;
  color: string;
  /**
   * Relative (dr, dc) from GOLD's perspective (where moving forward toward CRIMSON is dr < 0,
   * and moving right is dc > 0).
   * For CRIMSON, offsets are automatically rotated 180 degrees: (-dr, -dc).
   */
  moves: Array<[number, number]>;
  stampSide: PieceSide;
}

export const ONITAMA_CARDS: OnitamaCardDef[] = [
  {
    id: "tiger",
    nameAr: "النمر الأطلسي",
    nameEn: "Tiger",
    emoji: "🐅",
    color: "#38bdf8",
    moves: [
      [-2, 0],
      [1, 0],
    ],
    stampSide: "GOLD",
  },
  {
    id: "dragon",
    nameAr: "التنين الأحمر",
    nameEn: "Dragon",
    emoji: "🐉",
    color: "#f43f5e",
    moves: [
      [-1, -2],
      [-1, 2],
      [1, -1],
      [1, 1],
    ],
    stampSide: "CRIMSON",
  },
  {
    id: "frog",
    nameAr: "الضفدع",
    nameEn: "Frog",
    emoji: "🐸",
    color: "#4ade80",
    moves: [
      [0, -2],
      [-1, -1],
      [1, 1],
    ],
    stampSide: "CRIMSON",
  },
  {
    id: "rabbit",
    nameAr: "الأرنب",
    nameEn: "Rabbit",
    emoji: "🐇",
    color: "#facc15",
    moves: [
      [0, 2],
      [-1, 1],
      [1, -1],
    ],
    stampSide: "GOLD",
  },
  {
    id: "crab",
    nameAr: "السلطعون",
    nameEn: "Crab",
    emoji: "🦀",
    color: "#fb7185",
    moves: [
      [-1, 0],
      [0, -2],
      [0, 2],
    ],
    stampSide: "GOLD",
  },
  {
    id: "elephant",
    nameAr: "الفيل الملكي",
    nameEn: "Elephant",
    emoji: "🐘",
    color: "#a78bfa",
    moves: [
      [-1, -1],
      [-1, 1],
      [0, -1],
      [0, 1],
    ],
    stampSide: "CRIMSON",
  },
  {
    id: "goose",
    nameAr: "الإوزة",
    nameEn: "Goose",
    emoji: "🪿",
    color: "#60a5fa",
    moves: [
      [-1, -1],
      [0, -1],
      [0, 1],
      [1, 1],
    ],
    stampSide: "GOLD",
  },
  {
    id: "rooster",
    nameAr: "الديك",
    nameEn: "Rooster",
    emoji: "🐓",
    color: "#fb923c",
    moves: [
      [-1, 1],
      [0, 1],
      [0, -1],
      [1, -1],
    ],
    stampSide: "CRIMSON",
  },
  {
    id: "monkey",
    nameAr: "قرد زعطوط",
    nameEn: "Monkey",
    emoji: "🐒",
    color: "#fbbf24",
    moves: [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ],
    stampSide: "GOLD",
  },
  {
    id: "mantis",
    nameAr: "السرعوف",
    nameEn: "Mantis",
    emoji: "🦗",
    color: "#34d399",
    moves: [
      [-1, -1],
      [-1, 1],
      [1, 0],
    ],
    stampSide: "CRIMSON",
  },
  {
    id: "horse",
    nameAr: "الفرس البربري",
    nameEn: "Horse",
    emoji: "🐎",
    color: "#f87171",
    moves: [
      [-1, 0],
      [0, -1],
      [1, 0],
    ],
    stampSide: "CRIMSON",
  },
  {
    id: "ox",
    nameAr: "الثور",
    nameEn: "Ox",
    emoji: "🐂",
    color: "#38bdf8",
    moves: [
      [-1, 0],
      [0, 1],
      [1, 0],
    ],
    stampSide: "GOLD",
  },
  {
    id: "crane",
    nameAr: "طائر الكركي",
    nameEn: "Crane",
    emoji: "🦩",
    color: "#c084fc",
    moves: [
      [-1, 0],
      [1, -1],
      [1, 1],
    ],
    stampSide: "GOLD",
  },
  {
    id: "boar",
    nameAr: "الخنزير البري",
    nameEn: "Boar",
    emoji: "🐗",
    color: "#f97316",
    moves: [
      [-1, 0],
      [0, -1],
      [0, 1],
    ],
    stampSide: "CRIMSON",
  },
  {
    id: "cobra",
    nameAr: "كوبرا ساحة جامع الفنا",
    nameEn: "Cobra",
    emoji: "🐍",
    color: "#10b981",
    moves: [
      [0, -1],
      [-1, 1],
      [1, 1],
    ],
    stampSide: "CRIMSON",
  },
  {
    id: "eagle",
    nameAr: "صقر الأطلس",
    nameEn: "Eagle",
    emoji: "🦅",
    color: "#eab308",
    moves: [
      [-1, -1],
      [1, -1],
      [0, 1],
    ],
    stampSide: "GOLD",
  },
];

export interface MoveRecord {
  id: string;
  side: PieceSide;
  pieceKind: PieceKind;
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  cardUsedId?: string;
  capturedKind?: PieceKind;
  promotedToQueen?: boolean;
  textAr: string;
  ts: number;
}

export interface Onitama3DState {
  phase: "PLAYING" | "GAME_OVER";
  mode: BoardGameMode;
  round: number;
  boardSize: 5 | 8;
  turn: PieceSide;
  goldPlayerId: string;
  crimsonPlayerId: string;
  /** Allows both sides to be controlled by any device or AI when practicing / sharing 1 phone */
  sharedControl: boolean;
  aiEnabled: boolean;
  pieces: BoardPiece[];
  /** Onitama 5-card state */
  goldCards: string[];
  crimsonCards: string[];
  sideCard: string;
  /** Captured pieces by each side */
  capturedByGold: PieceKind[];
  capturedByCrimson: PieceKind[];
  inCheckSide: PieceSide | null;
  lastMove: MoveRecord | null;
  moveHistory: MoveRecord[];
  winnerSide: PieceSide | "DRAW" | null;
  winMethodAr: string | null;
  winSummaryAr: string | null;
  scores: Record<string, number>;
}

export interface Onitama3DSettings {
  defaultMode: BoardGameMode;
  sharedControl: boolean;
  aiEnabled: boolean;
  interactionMode: "MULTI_PHONE" | "ONE_PHONE";
}

export type Onitama3DAction =
  | {
      type: "MAKE_MOVE";
      pieceId: string;
      toR: number;
      toC: number;
      cardId?: string;
    }
  | {
      type: "PASS_SWAP_CARD";
      cardId: string;
    }
  | {
      type: "SWITCH_MODE";
      mode: BoardGameMode;
    }
  | {
      type: "TOGGLE_AI";
      enabled?: boolean;
    }
  | {
      type: "TOGGLE_SHARED_CONTROL";
      enabled?: boolean;
    }
  | {
      type: "SWAP_SEATS";
      goldPlayerId?: string;
      crimsonPlayerId?: string;
    }
  | {
      type: "AI_STEP";
    }
  | {
      type: "RESTART_GAME";
      mode?: BoardGameMode;
    };
