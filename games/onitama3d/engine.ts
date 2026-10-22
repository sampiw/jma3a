import {
  GameContext,
  GameDefinition,
  GameEndResult,
  TransitionResult,
  ValidationResult,
} from "@/games/registry";
import { Player, PrivatePlayerGameView, PublicGameView } from "@/lib/types";
import {
  BoardGameMode,
  BoardPiece,
  MoveRecord,
  ONITAMA3D_GAME_ID,
  ONITAMA_CARDS,
  Onitama3DAction,
  Onitama3DSettings,
  Onitama3DState,
  OnitamaCardDef,
  PieceKind,
  PieceSide,
} from "./types";

const PIECE_NAMES_AR: Record<PieceKind, string> = {
  KING: "السلطان (الشاه)",
  QUEEN: "الوزير",
  ROOK: "القلعة",
  BISHOP: "الفيل",
  KNIGHT: "الفرس",
  PAWN: "البيدق",
  STUDENT: "التلميذ المحارب",
};

const PIECE_VALUES: Record<PieceKind, number> = {
  KING: 1000,
  QUEEN: 90,
  ROOK: 50,
  BISHOP: 32,
  KNIGHT: 30,
  PAWN: 10,
  STUDENT: 20,
};

export function getCardDef(cardId: string): OnitamaCardDef {
  return ONITAMA_CARDS.find((c) => c.id === cardId) ?? ONITAMA_CARDS[0];
}

function buildOnitamaPieces(): BoardPiece[] {
  const pieces: BoardPiece[] = [];
  for (let c = 0; c < 5; c++) {
    const isKing = c === 2;
    pieces.push({
      id: `crimson_${c}`,
      side: "CRIMSON",
      kind: isKing ? "KING" : "STUDENT",
      r: 0,
      c,
    });
    pieces.push({
      id: `gold_${c}`,
      side: "GOLD",
      kind: isKing ? "KING" : "STUDENT",
      r: 4,
      c,
    });
  }
  return pieces;
}

function buildChessPieces(): BoardPiece[] {
  const backRank: PieceKind[] = [
    "ROOK",
    "KNIGHT",
    "BISHOP",
    "QUEEN",
    "KING",
    "BISHOP",
    "KNIGHT",
    "ROOK",
  ];
  const pieces: BoardPiece[] = [];

  for (let c = 0; c < 8; c++) {
    pieces.push({
      id: `crimson_back_${c}`,
      side: "CRIMSON",
      kind: backRank[c],
      r: 0,
      c,
      hasMoved: false,
    });
    pieces.push({
      id: `crimson_pawn_${c}`,
      side: "CRIMSON",
      kind: "PAWN",
      r: 1,
      c,
      hasMoved: false,
    });
    pieces.push({
      id: `gold_pawn_${c}`,
      side: "GOLD",
      kind: "PAWN",
      r: 6,
      c,
      hasMoved: false,
    });
    pieces.push({
      id: `gold_back_${c}`,
      side: "GOLD",
      kind: backRank[c],
      r: 7,
      c,
      hasMoved: false,
    });
  }

  return pieces;
}

function pickFiveOnitamaCards(round: number): string[] {
  const pool = [...ONITAMA_CARDS];
  // Deterministic-friendly shuffle mixed with Math.random
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const chosen = pool.slice(0, 5).map((c) => c.id);
  // Ensure variety across rounds if needed
  if (chosen.length < 5) {
    return ["tiger", "dragon", "frog", "rabbit", "crab"];
  }
  void round;
  return chosen;
}

function findPieceAt(
  pieces: BoardPiece[],
  r: number,
  c: number
): BoardPiece | undefined {
  return pieces.find((p) => p.r === r && p.c === c);
}

/**
 * Computes all legal destinations for a piece in ONITAMA mode given a specific cardId.
 */
export function getOnitamaLegalMovesForPiece(
  pieces: BoardPiece[],
  piece: BoardPiece,
  cardId: string
): Array<{ r: number; c: number }> {
  const card = getCardDef(cardId);
  const moves: Array<{ r: number; c: number }> = [];

  for (const [dr, dc] of card.moves) {
    // GOLD moves "up" (dr as-is, dc as-is). CRIMSON is rotated 180 deg (-dr, -dc).
    const actualDr = piece.side === "GOLD" ? dr : -dr;
    const actualDc = piece.side === "GOLD" ? dc : -dc;
    const nr = piece.r + actualDr;
    const nc = piece.c + actualDc;

    if (nr < 0 || nr >= 5 || nc < 0 || nc >= 5) continue;
    const occupant = findPieceAt(pieces, nr, nc);
    if (occupant && occupant.side === piece.side) continue;

    moves.push({ r: nr, c: nc });
  }

  return moves;
}

/**
 * Computes pseudo-legal moves for a piece in CHESS mode (before filtering self-check).
 */
function getChessPseudoMoves(
  pieces: BoardPiece[],
  piece: BoardPiece
): Array<{ r: number; c: number }> {
  const moves: Array<{ r: number; c: number }> = [];
  const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

  const addRay = (dr: number, dc: number) => {
    let nr = piece.r + dr;
    let nc = piece.c + dc;
    while (inBounds(nr, nc)) {
      const occ = findPieceAt(pieces, nr, nc);
      if (!occ) {
        moves.push({ r: nr, c: nc });
      } else {
        if (occ.side !== piece.side) {
          moves.push({ r: nr, c: nc });
        }
        break;
      }
      nr += dr;
      nc += dc;
    }
  };

  switch (piece.kind) {
    case "PAWN": {
      const dir = piece.side === "GOLD" ? -1 : 1;
      const startRow = piece.side === "GOLD" ? 6 : 1;
      const oneR = piece.r + dir;

      if (inBounds(oneR, piece.c) && !findPieceAt(pieces, oneR, piece.c)) {
        moves.push({ r: oneR, c: piece.c });
        const twoR = piece.r + dir * 2;
        if (
          piece.r === startRow &&
          inBounds(twoR, piece.c) &&
          !findPieceAt(pieces, twoR, piece.c)
        ) {
          moves.push({ r: twoR, c: piece.c });
        }
      }

      // Captures
      for (const dc of [-1, 1]) {
        const capR = piece.r + dir;
        const capC = piece.c + dc;
        if (!inBounds(capR, capC)) continue;
        const occ = findPieceAt(pieces, capR, capC);
        if (occ && occ.side !== piece.side) {
          moves.push({ r: capR, c: capC });
        }
      }
      break;
    }

    case "KNIGHT": {
      const jumps = [
        [-2, -1],
        [-2, 1],
        [-1, -2],
        [-1, 2],
        [1, -2],
        [1, 2],
        [2, -1],
        [2, 1],
      ];
      for (const [dr, dc] of jumps) {
        const nr = piece.r + dr;
        const nc = piece.c + dc;
        if (!inBounds(nr, nc)) continue;
        const occ = findPieceAt(pieces, nr, nc);
        if (!occ || occ.side !== piece.side) {
          moves.push({ r: nr, c: nc });
        }
      }
      break;
    }

    case "BISHOP": {
      addRay(-1, -1);
      addRay(-1, 1);
      addRay(1, -1);
      addRay(1, 1);
      break;
    }

    case "ROOK": {
      addRay(-1, 0);
      addRay(1, 0);
      addRay(0, -1);
      addRay(0, 1);
      break;
    }

    case "QUEEN": {
      addRay(-1, -1);
      addRay(-1, 1);
      addRay(1, -1);
      addRay(1, 1);
      addRay(-1, 0);
      addRay(1, 0);
      addRay(0, -1);
      addRay(0, 1);
      break;
    }

    case "KING": {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = piece.r + dr;
          const nc = piece.c + dc;
          if (!inBounds(nr, nc)) continue;
          const occ = findPieceAt(pieces, nr, nc);
          if (!occ || occ.side !== piece.side) {
            moves.push({ r: nr, c: nc });
          }
        }
      }
      break;
    }

    default:
      break;
  }

  return moves;
}

export function isSideInCheckChess(
  pieces: BoardPiece[],
  side: PieceSide
): boolean {
  const king = pieces.find((p) => p.side === side && p.kind === "KING");
  if (!king) return true;
  const enemySide: PieceSide = side === "GOLD" ? "CRIMSON" : "GOLD";
  for (const enemy of pieces) {
    if (enemy.side !== enemySide) continue;
    const moves = getChessPseudoMoves(pieces, enemy);
    if (moves.some((m) => m.r === king.r && m.c === king.c)) {
      return true;
    }
  }
  return false;
}

export function getChessLegalMovesForPiece(
  pieces: BoardPiece[],
  piece: BoardPiece
): Array<{ r: number; c: number }> {
  const pseudo = getChessPseudoMoves(pieces, piece);
  const legal: Array<{ r: number; c: number }> = [];

  for (const dest of pseudo) {
    const simulated = pieces
      .filter((p) => !(p.r === dest.r && p.c === dest.c))
      .map((p) =>
        p.id === piece.id ? { ...p, r: dest.r, c: dest.c, hasMoved: true } : p
      );
    if (!isSideInCheckChess(simulated, piece.side)) {
      legal.push(dest);
    }
  }

  return legal;
}

export function hasAnyLegalChessMoves(
  pieces: BoardPiece[],
  side: PieceSide
): boolean {
  for (const p of pieces) {
    if (p.side !== side) continue;
    if (getChessLegalMovesForPiece(pieces, p).length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Smart Tactical AI move selector for both ONITAMA and CHESS!
 */
export function computeBestMoveForSide(
  state: Onitama3DState,
  side: PieceSide
): {
  pieceId: string;
  toR: number;
  toC: number;
  cardId?: string;
} | null {
  if (state.mode === "ONITAMA") {
    const hand = side === "GOLD" ? state.goldCards : state.crimsonCards;
    const templeGoalR = side === "GOLD" ? 0 : 4;
    const templeGoalC = 2;

    let bestMove: {
      pieceId: string;
      toR: number;
      toC: number;
      cardId: string;
      score: number;
    } | null = null;

    for (const cardId of hand) {
      for (const piece of state.pieces) {
        if (piece.side !== side) continue;
        const legal = getOnitamaLegalMovesForPiece(state.pieces, piece, cardId);
        for (const dest of legal) {
          let score = (Math.random() - 0.5) * 4;
          const target = findPieceAt(state.pieces, dest.r, dest.c);

          // Instant Win #1: Capture Enemy Master (Way of the Stone)
          if (target && target.kind === "KING") {
            score += 10000;
          } else if (target) {
            score += 45;
          }

          // Instant Win #2: Master reaches Enemy Temple Arch (Way of the Stream)
          if (
            piece.kind === "KING" &&
            dest.r === templeGoalR &&
            dest.c === templeGoalC
          ) {
            score += 10000;
          }

          // Center control & advancement
          const distToCenter = Math.abs(2 - dest.r) + Math.abs(2 - dest.c);
          score += (4 - distToCenter) * 3;

          if (piece.kind === "KING") {
            const distToTemple =
              Math.abs(templeGoalR - dest.r) + Math.abs(templeGoalC - dest.c);
            score += (6 - distToTemple) * 2.5;
          }

          if (!bestMove || score > bestMove.score) {
            bestMove = {
              pieceId: piece.id,
              toR: dest.r,
              toC: dest.c,
              cardId,
              score,
            };
          }
        }
      }
    }

    return bestMove
      ? {
          pieceId: bestMove.pieceId,
          toR: bestMove.toR,
          toC: bestMove.toC,
          cardId: bestMove.cardId,
        }
      : null;
  }

  // CHESS AI
  let bestChessMove: {
    pieceId: string;
    toR: number;
    toC: number;
    score: number;
  } | null = null;

  for (const piece of state.pieces) {
    if (piece.side !== side) continue;
    const legal = getChessLegalMovesForPiece(state.pieces, piece);
    for (const dest of legal) {
      let score = (Math.random() - 0.5) * 3;
      const target = findPieceAt(state.pieces, dest.r, dest.c);
      if (target) {
        score += PIECE_VALUES[target.kind] * 1.4;
      }

      // Promotion bonus
      if (piece.kind === "PAWN" && (dest.r === 0 || dest.r === 7)) {
        score += 80;
      }

      // Center control bonus
      const centerDist = Math.abs(3.5 - dest.r) + Math.abs(3.5 - dest.c);
      score += (7 - centerDist) * 1.5;

      if (!bestChessMove || score > bestChessMove.score) {
        bestChessMove = {
          pieceId: piece.id,
          toR: dest.r,
          toC: dest.c,
          score,
        };
      }
    }
  }

  return bestChessMove
    ? {
        pieceId: bestChessMove.pieceId,
        toR: bestChessMove.toR,
        toC: bestChessMove.toC,
      }
    : null;
}

function buildFreshMatchState(
  players: Player[],
  mode: BoardGameMode,
  round: number,
  existingScores: Record<string, number>,
  sharedControl = false,
  aiEnabled = false,
  customGoldId?: string,
  customCrimsonId?: string
): Onitama3DState {
  const scores: Record<string, number> = { ...existingScores };
  for (const p of players) {
    if (typeof scores[p.id] !== "number") {
      scores[p.id] = 0;
    }
  }

  const goldPlayerId = customGoldId ?? players[0]?.id ?? "gold_player";
  const crimsonPlayerId =
    customCrimsonId ?? players[1]?.id ?? players[0]?.id ?? "crimson_player";

  // If only 1 player is in the room or both seats belong to the same player, enable sharedControl so they can test/play immediately
  const effectiveSharedControl =
    sharedControl || players.length < 2 || goldPlayerId === crimsonPlayerId;

  if (mode === "ONITAMA") {
    const dealt = pickFiveOnitamaCards(round);
    const sideCardDef = getCardDef(dealt[4]);

    return {
      phase: "PLAYING",
      mode: "ONITAMA",
      round,
      boardSize: 5,
      turn: sideCardDef.stampSide,
      goldPlayerId,
      crimsonPlayerId,
      sharedControl: effectiveSharedControl,
      aiEnabled,
      pieces: buildOnitamaPieces(),
      goldCards: [dealt[0], dealt[1]],
      crimsonCards: [dealt[2], dealt[3]],
      sideCard: dealt[4],
      capturedByGold: [],
      capturedByCrimson: [],
      inCheckSide: null,
      lastMove: null,
      moveHistory: [],
      winnerSide: null,
      winMethodAr: null,
      winSummaryAr: null,
      scores,
    };
  }

  return {
    phase: "PLAYING",
    mode: "CHESS",
    round,
    boardSize: 8,
    turn: "GOLD",
    goldPlayerId,
    crimsonPlayerId,
    sharedControl: effectiveSharedControl,
    aiEnabled,
    pieces: buildChessPieces(),
    goldCards: [],
    crimsonCards: [],
    sideCard: "tiger",
    capturedByGold: [],
    capturedByCrimson: [],
    inCheckSide: null,
    lastMove: null,
    moveHistory: [],
    winnerSide: null,
    winMethodAr: null,
    winSummaryAr: null,
    scores,
  };
}

function executeMoveOnState(
  state: Onitama3DState,
  players: Player[],
  pieceId: string,
  toR: number,
  toC: number,
  cardId?: string
): TransitionResult<Onitama3DState> {
  const piece = state.pieces.find((p) => p.id === pieceId);
  if (!piece || piece.side !== state.turn) {
    return {
      success: false,
      newState: state,
      newPhase: state.phase,
      error: "هذه ليست قطعتك أو ليس دورك الآن!",
    };
  }

  const sideLabel = piece.side === "GOLD" ? "الذهبي 👑" : "الأحمر 🐉";

  if (state.mode === "ONITAMA") {
    const hand = piece.side === "GOLD" ? state.goldCards : state.crimsonCards;
    const chosenCardId = cardId && hand.includes(cardId) ? cardId : hand[0];
    if (!chosenCardId || !hand.includes(chosenCardId)) {
      return {
        success: false,
        newState: state,
        newPhase: state.phase,
        error: "اختر بطاقة حركة صالحة من يدك!",
      };
    }

    const legal = getOnitamaLegalMovesForPiece(
      state.pieces,
      piece,
      chosenCardId
    );
    if (!legal.some((m) => m.r === toR && m.c === toC)) {
      return {
        success: false,
        newState: state,
        newPhase: state.phase,
        error: "هذه الخانة غير متاحة حسب مخطط البطاقة المختارة!",
      };
    }

    const fromR = piece.r;
    const fromC = piece.c;
    const captured = findPieceAt(state.pieces, toR, toC);

    // Move piece & remove captured
    state.pieces = state.pieces
      .filter((p) => p.id !== captured?.id)
      .map((p) => (p.id === piece.id ? { ...p, r: toR, c: toC } : p));

    if (captured) {
      if (piece.side === "GOLD") state.capturedByGold.push(captured.kind);
      else state.capturedByCrimson.push(captured.kind);
    }

    // Rotate used card with Center Spare Card (Onitama's signature mechanic!)
    const prevSideCard = state.sideCard;
    state.sideCard = chosenCardId;
    if (piece.side === "GOLD") {
      state.goldCards = state.goldCards.map((c) =>
        c === chosenCardId ? prevSideCard : c
      );
    } else {
      state.crimsonCards = state.crimsonCards.map((c) =>
        c === chosenCardId ? prevSideCard : c
      );
    }

    const cardDef = getCardDef(chosenCardId);
    const moveRecord: MoveRecord = {
      id: `mv_${Date.now()}`,
      side: piece.side,
      pieceKind: piece.kind,
      fromR,
      fromC,
      toR,
      toC,
      cardUsedId: chosenCardId,
      capturedKind: captured?.kind,
      textAr: `${sideLabel} حرّك ${PIECE_NAMES_AR[piece.kind]} ببطاقة [${cardDef.emoji} ${cardDef.nameAr}]${
        captured ? ` وأسر ${PIECE_NAMES_AR[captured.kind]}!` : ""
      }`,
      ts: Date.now(),
    };
    state.lastMove = moveRecord;
    state.moveHistory = [moveRecord, ...state.moveHistory].slice(0, 12);

    // Check Onitama Win Condition #1: Way of the Stone (Captured Enemy KING)
    const capturedMaster = captured?.kind === "KING";
    // Check Onitama Win Condition #2: Way of the Stream (Moved KING onto Enemy Temple Arch)
    const templeRow = piece.side === "GOLD" ? 0 : 4;
    const reachedTemple =
      piece.kind === "KING" && toR === templeRow && toC === 2;

    if (capturedMaster || reachedTemple) {
      state.phase = "GAME_OVER";
      state.winnerSide = piece.side;
      const winnerPlayerId =
        piece.side === "GOLD" ? state.goldPlayerId : state.crimsonPlayerId;
      const winnerName =
        players.find((p) => p.id === winnerPlayerId)?.nickname || sideLabel;

      state.scores[winnerPlayerId] = (state.scores[winnerPlayerId] || 0) + 120;

      if (capturedMaster) {
        state.winMethodAr = "🗡️ طريق الحجر (أسر المعلّم الكبير)";
        state.winSummaryAr = `انتصر ${winnerName} (${sideLabel}) عبر أسر سلطان الخصم ببطاقة ${cardDef.emoji} ${cardDef.nameAr}!`;
      } else {
        state.winMethodAr = "⛩️ طريق الجدول (السيطرة على قوس المعبد)";
        state.winSummaryAr = `انتصر ${winnerName} (${sideLabel}) بوصول السلطان إلى قوس معبد الخصم ببطاقة ${cardDef.emoji} ${cardDef.nameAr}!`;
      }

      return {
        success: true,
        newState: state,
        newPhase: state.phase,
      };
    }

    state.turn = piece.side === "GOLD" ? "CRIMSON" : "GOLD";
    return {
      success: true,
      newState: state,
      newPhase: state.phase,
    };
  }

  // CHESS MODE (8x8)
  const legal = getChessLegalMovesForPiece(state.pieces, piece);
  if (!legal.some((m) => m.r === toR && m.c === toC)) {
    return {
      success: false,
      newState: state,
      newPhase: state.phase,
      error: "حركة غير قانونية في الشطرنج (أو تترك الملك في حالة كش)!",
    };
  }

  const fromR = piece.r;
  const fromC = piece.c;
  const captured = findPieceAt(state.pieces, toR, toC);

  const promotedToQueen =
    piece.kind === "PAWN" &&
    ((piece.side === "GOLD" && toR === 0) ||
      (piece.side === "CRIMSON" && toR === 7));

  state.pieces = state.pieces
    .filter((p) => p.id !== captured?.id)
    .map((p) =>
      p.id === piece.id
        ? {
            ...p,
            r: toR,
            c: toC,
            hasMoved: true,
            kind: promotedToQueen ? "QUEEN" : p.kind,
          }
        : p
    );

  if (captured) {
    if (piece.side === "GOLD") state.capturedByGold.push(captured.kind);
    else state.capturedByCrimson.push(captured.kind);
  }

  const moveRecord: MoveRecord = {
    id: `mv_${Date.now()}`,
    side: piece.side,
    pieceKind: piece.kind,
    fromR,
    fromC,
    toR,
    toC,
    capturedKind: captured?.kind,
    promotedToQueen,
    textAr: `${sideLabel} حرّك ${PIECE_NAMES_AR[piece.kind]}${
      captured ? ` وأخذ ${PIECE_NAMES_AR[captured.kind]}` : ""
    }${promotedToQueen ? " وترقّى إلى وزير ♕!" : ""}`,
    ts: Date.now(),
  };
  state.lastMove = moveRecord;
  state.moveHistory = [moveRecord, ...state.moveHistory].slice(0, 12);

  const nextSide: PieceSide = piece.side === "GOLD" ? "CRIMSON" : "GOLD";
  const nextInCheck = isSideInCheckChess(state.pieces, nextSide);
  state.inCheckSide = nextInCheck ? nextSide : null;

  const nextHasMoves = hasAnyLegalChessMoves(state.pieces, nextSide);

  if (!nextHasMoves) {
    state.phase = "GAME_OVER";
    if (nextInCheck) {
      state.winnerSide = piece.side;
      const winnerPlayerId =
        piece.side === "GOLD" ? state.goldPlayerId : state.crimsonPlayerId;
      const winnerName =
        players.find((p) => p.id === winnerPlayerId)?.nickname || sideLabel;
      state.scores[winnerPlayerId] = (state.scores[winnerPlayerId] || 0) + 150;
      state.winMethodAr = "👑 كش مات (Checkmate)!";
      state.winSummaryAr = `حسم ${winnerName} (${sideLabel}) معركة الشطرنج الملكي 3D بكش مات أسطوري!`;
    } else {
      state.winnerSide = "DRAW";
      state.winMethodAr = "🤝 تعادل (Stalemate)";
      state.winSummaryAr = "انتهت المباراة بالتعادل لعدم وجود حركات قانونية متاحة!";
    }
    return {
      success: true,
      newState: state,
      newPhase: state.phase,
    };
  }

  state.turn = nextSide;
  return {
    success: true,
    newState: state,
    newPhase: state.phase,
  };
}

export const Onitama3DEngine: GameDefinition<
  Onitama3DState,
  Onitama3DAction,
  Onitama3DSettings
> = {
  id: ONITAMA3D_GAME_ID,
  slug: ONITAMA3D_GAME_ID,
  version: 1,
  displayNameKey: "شطرنج وأونيتاما 3D ♟️🐉",
  shortDescriptionKey:
    "طاولة شطرنج ثلاثية الأبعاد بوضعين: أونيتاما 3D (شطرنج البطاقات القتالية 5×5) والشطرنج الملكي الكلاسيكي 3D (8×8) مع كاميرا 360°!",
  minPlayers: 1,
  maxPlayers: 8,
  capabilities: ["MULTI_PHONE", "ONE_PHONE", "HYBRID", "SCORES"],
  defaultSettings: {
    defaultMode: "ONITAMA",
    sharedControl: false,
    aiEnabled: false,
    interactionMode: "MULTI_PHONE",
  },

  validateSetup(players: Player[]): ValidationResult {
    if (players.length < 1) {
      return {
        isValid: false,
        errors: ["خاص على الأقل لاعب واحد باش تبدا شطرنج وأونيتاما 3D!"],
      };
    }
    return { isValid: true };
  },

  createInitialState(
    players: Player[],
    settings?: Onitama3DSettings
  ): Onitama3DState {
    return buildFreshMatchState(
      players,
      settings?.defaultMode ?? "ONITAMA",
      1,
      {},
      settings?.sharedControl ?? players.length < 2,
      settings?.aiEnabled ?? players.length === 1
    );
  },

  start(
    ctx: GameContext<Onitama3DState, Onitama3DSettings>
  ): TransitionResult<Onitama3DState> {
    const state = this.createInitialState(ctx.players, ctx.settings);
    return {
      success: true,
      newState: state,
      newPhase: state.phase,
      newRound: 1,
    };
  },

  handleAction(
    ctx: GameContext<Onitama3DState, Onitama3DSettings>,
    actorPlayerId: string,
    action: Onitama3DAction
  ): TransitionResult<Onitama3DState> {
    const state: Onitama3DState = structuredClone(ctx.state);

    if (action.type === "RESTART_GAME") {
      const nextMode = action.mode ?? state.mode;
      const next = buildFreshMatchState(
        ctx.players,
        nextMode,
        state.round + 1,
        state.scores,
        state.sharedControl,
        state.aiEnabled,
        state.goldPlayerId,
        state.crimsonPlayerId
      );
      return {
        success: true,
        newState: next,
        newPhase: next.phase,
        newRound: next.round,
      };
    }

    if (action.type === "SWITCH_MODE") {
      const next = buildFreshMatchState(
        ctx.players,
        action.mode,
        state.round + 1,
        state.scores,
        state.sharedControl,
        state.aiEnabled,
        state.goldPlayerId,
        state.crimsonPlayerId
      );
      return {
        success: true,
        newState: next,
        newPhase: next.phase,
        newRound: next.round,
      };
    }

    if (action.type === "TOGGLE_AI") {
      state.aiEnabled =
        typeof action.enabled === "boolean" ? action.enabled : !state.aiEnabled;
      return {
        success: true,
        newState: state,
        newPhase: state.phase,
      };
    }

    if (action.type === "TOGGLE_SHARED_CONTROL") {
      state.sharedControl =
        typeof action.enabled === "boolean"
          ? action.enabled
          : !state.sharedControl;
      return {
        success: true,
        newState: state,
        newPhase: state.phase,
      };
    }

    if (action.type === "SWAP_SEATS") {
      const nextGold = action.goldPlayerId ?? state.crimsonPlayerId;
      const nextCrimson = action.crimsonPlayerId ?? state.goldPlayerId;
      const next = buildFreshMatchState(
        ctx.players,
        state.mode,
        state.round + 1,
        state.scores,
        state.sharedControl,
        state.aiEnabled,
        nextGold,
        nextCrimson
      );
      return {
        success: true,
        newState: next,
        newPhase: next.phase,
        newRound: next.round,
      };
    }

    if (state.phase === "GAME_OVER") {
      return {
        success: false,
        newState: state,
        newPhase: state.phase,
        error: "انتهت الجولة بالفعل! اضغط جولة جديدة للعب مجدداً.",
      };
    }

    if (action.type === "AI_STEP") {
      const aiMove = computeBestMoveForSide(state, state.turn);
      if (!aiMove) {
        if (state.mode === "ONITAMA") {
          const hand =
            state.turn === "GOLD" ? state.goldCards : state.crimsonCards;
          const swapCard = hand[0];
          const prevSide = state.sideCard;
          state.sideCard = swapCard;
          if (state.turn === "GOLD") state.goldCards[0] = prevSide;
          else state.crimsonCards[0] = prevSide;
          state.turn = state.turn === "GOLD" ? "CRIMSON" : "GOLD";
        }
        return {
          success: true,
          newState: state,
          newPhase: state.phase,
        };
      }
      return executeMoveOnState(
        state,
        ctx.players,
        aiMove.pieceId,
        aiMove.toR,
        aiMove.toC,
        aiMove.cardId
      );
    }

    // Check seat ownership unless sharedControl is active
    const expectedPlayerId =
      state.turn === "GOLD" ? state.goldPlayerId : state.crimsonPlayerId;
    if (
      !state.sharedControl &&
      ctx.players.length >= 2 &&
      state.goldPlayerId !== state.crimsonPlayerId &&
      actorPlayerId !== expectedPlayerId
    ) {
      return {
        success: false,
        newState: state,
        newPhase: state.phase,
        error: "ليس دورك الآن! انتظر حركة خصمك أو فعّل اللعب المشترك.",
      };
    }

    if (action.type === "PASS_SWAP_CARD") {
      if (state.mode !== "ONITAMA") {
        return {
          success: false,
          newState: state,
          newPhase: state.phase,
          error: "تبديل البطاقة متاح فقط في وضع أونيتاما!",
        };
      }
      const hand =
        state.turn === "GOLD" ? state.goldCards : state.crimsonCards;
      if (!hand.includes(action.cardId)) {
        return {
          success: false,
          newState: state,
          newPhase: state.phase,
          error: "هذه البطاقة ليست في يدك!",
        };
      }
      const prevSide = state.sideCard;
      state.sideCard = action.cardId;
      if (state.turn === "GOLD") {
        state.goldCards = state.goldCards.map((c) =>
          c === action.cardId ? prevSide : c
        );
      } else {
        state.crimsonCards = state.crimsonCards.map((c) =>
          c === action.cardId ? prevSide : c
        );
      }
      state.turn = state.turn === "GOLD" ? "CRIMSON" : "GOLD";
      return {
        success: true,
        newState: state,
        newPhase: state.phase,
      };
    }

    if (action.type === "MAKE_MOVE") {
      return executeMoveOnState(
        state,
        ctx.players,
        action.pieceId,
        action.toR,
        action.toC,
        action.cardId
      );
    }

    return {
      success: true,
      newState: state,
      newPhase: state.phase,
    };
  },

  getPublicView(
    ctx: GameContext<Onitama3DState, Onitama3DSettings>
  ): PublicGameView {
    const s = ctx.state;
    return {
      gameId: ONITAMA3D_GAME_ID,
      phase: s.phase,
      round: s.round,
      stateVersion: ctx.stateVersion,
      publicData: {
        phase: s.phase,
        mode: s.mode,
        round: s.round,
        boardSize: s.boardSize,
        turn: s.turn,
        goldPlayerId: s.goldPlayerId,
        crimsonPlayerId: s.crimsonPlayerId,
        sharedControl: s.sharedControl,
        aiEnabled: s.aiEnabled,
        pieces: s.pieces,
        goldCards: s.goldCards,
        crimsonCards: s.crimsonCards,
        sideCard: s.sideCard,
        capturedByGold: s.capturedByGold,
        capturedByCrimson: s.capturedByCrimson,
        inCheckSide: s.inCheckSide,
        lastMove: s.lastMove,
        moveHistory: s.moveHistory,
        winnerSide: s.winnerSide,
        winMethodAr: s.winMethodAr,
        winSummaryAr: s.winSummaryAr,
        scores: s.scores,
      },
    };
  },

  getPlayerView(
    ctx: GameContext<Onitama3DState, Onitama3DSettings>,
    playerId: string
  ): PrivatePlayerGameView {
    const s = ctx.state;
    const isHost = Boolean(ctx.players.find((p) => p.id === playerId)?.isHost);
    const mySide: PieceSide | "SPECTATOR" =
      playerId === s.goldPlayerId
        ? "GOLD"
        : playerId === s.crimsonPlayerId
        ? "CRIMSON"
        : "SPECTATOR";

    return {
      playerId,
      isHost,
      allowedActions: [],
      privateData: {
        isAlive: true,
        mySide,
        myScore: s.scores[playerId] ?? 0,
      },
    };
  },

  checkFinished(
    ctx: GameContext<Onitama3DState, Onitama3DSettings>
  ): GameEndResult | null {
    if (ctx.state.phase !== "GAME_OVER") return null;
    const scoreboard = ctx.players
      .map((p) => ({
        id: p.id,
        label: p.nickname,
        score: ctx.state.scores[p.id] ?? 0,
      }))
      .sort((a, b) => b.score - a.score);

    const winnerPlayerId =
      ctx.state.winnerSide === "GOLD"
        ? ctx.state.goldPlayerId
        : ctx.state.winnerSide === "CRIMSON"
        ? ctx.state.crimsonPlayerId
        : null;

    return {
      isFinished: true,
      winner: {
        players: winnerPlayerId ? [winnerPlayerId] : [],
        summary: ctx.state.winSummaryAr || "انتهت المباراة!",
      },
      scoreboard,
    };
  },
};
