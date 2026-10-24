"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import confetti from "canvas-confetti";
import { sound } from "@/lib/sound";
import {
  BoardGameMode,
  BoardPiece,
  MoveRecord,
  Onitama3DAction,
  OnitamaCardDef,
  PieceKind,
  PieceSide,
} from "@/games/onitama3d/types";
import {
  getCardDef,
  getChessLegalMovesForPiece,
  getOnitamaLegalMovesForPiece,
} from "@/games/onitama3d/engine";
import Onitama3DBoard from "./Onitama3DBoard";

export interface Onitama3DGameViewProps {
  publicData: Record<string, any>;
  privateData?: Record<string, any>;
  isHost?: boolean;
  onAction: (action: Onitama3DAction) => Promise<void> | void;
  players?: any[];
  activePlayerId?: string;
  roomCode?: string;
  onRefresh?: () => void;
}

const PIECE_EMOJI: Record<PieceKind, string> = {
  KING: "♔",
  QUEEN: "♕",
  ROOK: "♖",
  BISHOP: "♗",
  KNIGHT: "♘",
  PAWN: "♙",
  STUDENT: "🥋",
};

function OnitamaScrollCard({
  card,
  cardSide,
  viewSide,
  selected,
  disabled,
  compact,
  badgeText,
  onClick,
}: {
  card: OnitamaCardDef;
  cardSide: PieceSide;
  viewSide: PieceSide;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  badgeText?: string;
  onClick?: () => void;
}) {
  const moveSet = useMemo(() => {
    const s = new Set<string>();
    // When cardSide === viewSide (viewing your own cards from your own side of the table),
    // forward is UP (dr < 0) and right is RIGHT (dc > 0) on your screen.
    // When viewing a card belonging to the opposite side of the current camera view, rotate 180 deg.
    const flipForCamera = cardSide !== viewSide;
    for (const [dr, dc] of card.moves) {
      const screenDr = flipForCamera ? -dr : dr;
      const screenDc = flipForCamera ? -dc : dc;
      s.add(`${2 + screenDr},${2 + screenDc}`);
    }
    return s;
  }, [card.moves, cardSide, viewSide]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative flex items-center gap-2 rounded-2xl border-2 transition-all select-none ${
        compact ? "px-2 py-1.5" : "px-3 py-2"
      } ${
        selected
          ? "border-amber-400 bg-gradient-to-br from-amber-500/25 to-slate-900 shadow-[0_0_16px_rgba(251,191,36,0.45)]"
          : "border-slate-700/90 bg-slate-900/90 hover:border-slate-500"
      } ${disabled ? "opacity-85 cursor-default" : "cursor-pointer active:scale-95"}`}
    >
      {/* 5x5 Mini Grid — Explicit dir="ltr" so RTL never mirrors left/right moves! */}
      <div
        dir="ltr"
        className={`grid grid-cols-5 gap-0.5 rounded-lg bg-slate-950 p-1 border border-slate-700 shrink-0 ${
          compact ? "w-10 h-10" : "w-12 h-12 sm:w-14 sm:h-14"
        }`}
      >
        {Array.from({ length: 25 }).map((_, idx) => {
          const r = Math.floor(idx / 5);
          const c = idx % 5;
          const isCenter = r === 2 && c === 2;
          const isMove = moveSet.has(`${r},${c}`);
          return (
            <div
              key={idx}
              className={`rounded-[2px] ${
                isCenter
                  ? "bg-amber-300 shadow-[0_0_4px_#fde047]"
                  : isMove
                  ? "bg-emerald-400 shadow-[0_0_5px_#34d399]"
                  : "bg-slate-800/90"
              }`}
            />
          );
        })}
      </div>

      {/* Card Title */}
      <div className="text-right min-w-0">
        {badgeText && (
          <div className="text-[9px] font-black text-amber-300 truncate">
            {badgeText}
          </div>
        )}
        <div
          className={`font-black text-white flex items-center gap-1 truncate ${
            compact ? "text-[11px]" : "text-xs sm:text-sm"
          }`}
        >
          <span>{card.emoji}</span>
          <span className="truncate">{card.nameAr}</span>
        </div>
        <div className="text-[9px] font-bold text-slate-400 truncate">
          {card.nameEn}
        </div>
      </div>
    </button>
  );
}

export function Onitama3DGameView({
  publicData,
  privateData,
  onAction,
  players = [],
  activePlayerId,
}: Onitama3DGameViewProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const phase = String(publicData?.phase ?? "PLAYING") as
    | "PLAYING"
    | "GAME_OVER";
  const mode = (publicData?.mode as BoardGameMode) ?? "ONITAMA";
  const boardSize =
    (publicData?.boardSize as 5 | 8) ?? (mode === "ONITAMA" ? 5 : 8);
  const turn = (publicData?.turn as PieceSide) ?? "GOLD";
  const goldPlayerId = String(publicData?.goldPlayerId ?? "");
  const crimsonPlayerId = String(publicData?.crimsonPlayerId ?? "");
  const sharedControl = Boolean(publicData?.sharedControl);
  const aiEnabled = Boolean(publicData?.aiEnabled);
  const pieces = (publicData?.pieces as BoardPiece[]) ?? [];
  const goldCards = (publicData?.goldCards as string[]) ?? ["tiger", "crab"];
  const crimsonCards = (publicData?.crimsonCards as string[]) ?? [
    "dragon",
    "frog",
  ];
  const sideCard = String(publicData?.sideCard ?? "rabbit");
  const capturedByGold = (publicData?.capturedByGold as PieceKind[]) ?? [];
  const capturedByCrimson =
    (publicData?.capturedByCrimson as PieceKind[]) ?? [];
  const inCheckSide = (publicData?.inCheckSide as PieceSide | null) ?? null;
  const lastMove = (publicData?.lastMove as MoveRecord | null) ?? null;
  const winnerSide =
    (publicData?.winnerSide as PieceSide | "DRAW" | null) ?? null;
  const winMethodAr = (publicData?.winMethodAr as string | null) ?? null;
  const winSummaryAr = (publicData?.winSummaryAr as string | null) ?? null;

  const myPlayerId = activePlayerId || String(privateData?.playerId ?? "");

  // Determine which seat (GOLD or CRIMSON) this specific phone/player belongs to
  const myAssignedSide: PieceSide | null = useMemo(() => {
    if (
      myPlayerId &&
      myPlayerId === crimsonPlayerId &&
      goldPlayerId !== crimsonPlayerId
    ) {
      return "CRIMSON";
    }
    if (myPlayerId && myPlayerId === goldPlayerId) {
      return "GOLD";
    }
    if (privateData?.mySide === "CRIMSON") return "CRIMSON";
    if (privateData?.mySide === "GOLD") return "GOLD";
    return null;
  }, [myPlayerId, goldPlayerId, crimsonPlayerId, privateData?.mySide]);

  const isSingleDevicePassPlay =
    !aiEnabled &&
    (players.length < 2 || goldPlayerId === crimsonPlayerId || !myAssignedSide);

  const playerPerspectiveSide: PieceSide = myAssignedSide ?? turn;

  const goldPlayerName = useMemo(() => {
    return (
      players.find((p: any) => p.id === goldPlayerId)?.nickname || "الذهبي"
    );
  }, [players, goldPlayerId]);

  const crimsonPlayerName = useMemo(() => {
    if (aiEnabled) return "🤖 البوت الذكي";
    return (
      players.find((p: any) => p.id === crimsonPlayerId)?.nickname || "الأحمر"
    );
  }, [players, crimsonPlayerId, aiEnabled]);

  const canControlCurrentTurn = useMemo(() => {
    if (phase !== "PLAYING") return false;
    if (aiEnabled && turn === "CRIMSON") return false;
    if (
      sharedControl ||
      players.length < 2 ||
      goldPlayerId === crimsonPlayerId
    ) {
      return true;
    }
    const activeTurnPlayerId =
      turn === "GOLD" ? goldPlayerId : crimsonPlayerId;
    return myPlayerId === activeTurnPlayerId;
  }, [
    phase,
    aiEnabled,
    turn,
    sharedControl,
    players.length,
    goldPlayerId,
    crimsonPlayerId,
    myPlayerId,
  ]);

  // Which side's 2 cards are displayed in this phone's bottom hand bar
  const displayHandSide: PieceSide =
    !sharedControl && myAssignedSide ? myAssignedSide : turn;
  const activeHandIds = displayHandSide === "GOLD" ? goldCards : crimsonCards;
  const opponentSide: PieceSide =
    displayHandSide === "GOLD" ? "CRIMSON" : "GOLD";
  const opponentHandIds = opponentSide === "GOLD" ? goldCards : crimsonCards;

  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string>(
    activeHandIds[0] ?? "tiger"
  );
  const [cameraPreset, setCameraPreset] = useState<"GOLD" | "CRIMSON" | "TOP">(
    playerPerspectiveSide
  );
  const [showRulesModal, setShowRulesModal] = useState(false);

  // Automatically orient each phone's camera to its own seat (GOLD or CRIMSON),
  // or follow the active turn when playing pass-and-play on a single phone!
  useEffect(() => {
    if (myAssignedSide && !isSingleDevicePassPlay) {
      setCameraPreset((prev) => (prev === "TOP" ? "TOP" : myAssignedSide));
    } else if (isSingleDevicePassPlay) {
      setCameraPreset((prev) => (prev === "TOP" ? "TOP" : turn));
    }
  }, [myAssignedSide, isSingleDevicePassPlay, turn, goldPlayerId, crimsonPlayerId]);

  const viewSide: PieceSide =
    cameraPreset === "CRIMSON"
      ? "CRIMSON"
      : cameraPreset === "GOLD"
      ? "GOLD"
      : playerPerspectiveSide;

  // Sync default selected card and auto-select a piece with legal moves on turn start so green tiles appear immediately!
  useEffect(() => {
    const handToUse = displayHandSide === "GOLD" ? goldCards : crimsonCards;
    const nextCard =
      handToUse.length > 0 && handToUse.includes(selectedCardId)
        ? selectedCardId
        : handToUse[0] ?? "tiger";
    if (nextCard !== selectedCardId) {
      setSelectedCardId(nextCard);
    }

    if (!canControlCurrentTurn) {
      setSelectedPieceId(null);
      return;
    }

    // Auto-select King/Master (or first movable piece) in Onitama so player immediately sees green tiles on the board!
    if (mode === "ONITAMA") {
      const myPieces = pieces.filter((p) => p.side === turn);
      const king = myPieces.find((p) => p.kind === "KING");
      if (
        king &&
        getOnitamaLegalMovesForPiece(pieces, king, nextCard).length > 0
      ) {
        setSelectedPieceId(king.id);
        return;
      }
      const firstMovable = myPieces.find(
        (p) => getOnitamaLegalMovesForPiece(pieces, p, nextCard).length > 0
      );
      setSelectedPieceId(firstMovable?.id ?? null);
    } else {
      setSelectedPieceId(null);
    }
  }, [
    turn,
    displayHandSide,
    canControlCurrentTurn,
    mode,
    pieces.length,
    lastMove?.id,
  ]);

  // Trigger confetti on game over
  useEffect(() => {
    if (phase === "GAME_OVER") {
      sound.playSuccess();
      try {
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
      } catch {
        // Ignore confetti errors in headless tests
      }
    }
  }, [phase]);

  // Trigger AI move automatically when aiEnabled && turn === "CRIMSON"
  useEffect(() => {
    if (phase !== "PLAYING" || !aiEnabled || turn !== "CRIMSON") return;
    const timer = setTimeout(() => {
      sound.playCardFlip();
      onAction({ type: "AI_STEP" });
    }, 650);
    return () => clearTimeout(timer);
  }, [phase, aiEnabled, turn, onAction, lastMove?.id]);

  const legalDestinations = useMemo(() => {
    if (!selectedPieceId || !canControlCurrentTurn) return [];
    const piece = pieces.find((p) => p.id === selectedPieceId);
    if (!piece || piece.side !== turn) return [];

    if (mode === "ONITAMA") {
      const hand = turn === "GOLD" ? goldCards : crimsonCards;
      const cardId = hand.includes(selectedCardId) ? selectedCardId : hand[0];
      if (!cardId) return [];
      return getOnitamaLegalMovesForPiece(pieces, piece, cardId);
    }

    return getChessLegalMovesForPiece(pieces, piece);
  }, [
    selectedPieceId,
    canControlCurrentTurn,
    pieces,
    turn,
    mode,
    goldCards,
    crimsonCards,
    selectedCardId,
  ]);

  const handleSelectTileOrPiece = useCallback(
    async (r: number, c: number) => {
      if (!canControlCurrentTurn) return;

      // 1. If a piece is selected and (r, c) is a legal destination -> Execute Move!
      if (
        selectedPieceId &&
        legalDestinations.some((d) => d.r === r && d.c === c)
      ) {
        const targetOccupant = pieces.find((p) => p.r === r && p.c === c);
        if (targetOccupant) {
          sound.playGlassCrack();
        } else {
          sound.playCardFlip();
        }

        const moveCard =
          mode === "ONITAMA"
            ? (turn === "GOLD" ? goldCards : crimsonCards).includes(
                selectedCardId
              )
              ? selectedCardId
              : (turn === "GOLD" ? goldCards : crimsonCards)[0]
            : undefined;

        setSelectedPieceId(null);
        await onAction({
          type: "MAKE_MOVE",
          pieceId: selectedPieceId,
          toR: r,
          toC: c,
          cardId: moveCard,
        });
        return;
      }

      // 2. Otherwise, if the tapped tile contains one of the active side's pieces -> Select it!
      const clickedFriendly = pieces.find(
        (p) => p.r === r && p.c === c && p.side === turn
      );
      if (clickedFriendly) {
        sound.playCardFlip();
        setSelectedPieceId(clickedFriendly.id);
        return;
      }

      setSelectedPieceId(null);
    },
    [
      canControlCurrentTurn,
      selectedPieceId,
      legalDestinations,
      pieces,
      mode,
      turn,
      goldCards,
      crimsonCards,
      selectedCardId,
      onAction,
    ]
  );

  if (!mounted) return null;

  const content = (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9999] w-screen h-screen overflow-hidden bg-[#0b1120] text-white select-none font-sans flex flex-col"
    >
      {/* ZONE 1: COMPACT DOCKED TOP HEADER BAR (Never covers the 3D board!) */}
      <header className="shrink-0 z-20 bg-slate-950/95 border-b border-slate-800 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        {/* Mode Switcher + Turn Badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-xl border border-amber-400/40 bg-slate-900 p-0.5">
            <button
              type="button"
              onClick={() => {
                sound.playCardFlip();
                onAction({ type: "SWITCH_MODE", mode: "ONITAMA" });
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-black transition-all ${
                mode === "ONITAMA"
                  ? "bg-amber-500 text-slate-950 shadow"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              🐉 أونيتاما (5×5)
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playCardFlip();
                onAction({ type: "SWITCH_MODE", mode: "CHESS" });
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-black transition-all ${
                mode === "CHESS"
                  ? "bg-emerald-500 text-slate-950 shadow"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              ♟️ شطرنج (8×8)
            </button>
          </div>

          <div
            className={`rounded-xl border px-3 py-1 flex items-center gap-1.5 text-xs font-black ${
              turn === "GOLD"
                ? "border-amber-400/60 bg-amber-500/15 text-amber-200"
                : "border-rose-400/60 bg-rose-500/15 text-rose-200"
            }`}
          >
            <span>{turn === "GOLD" ? "👑" : "🐉"}</span>
            <span>
              دور: {turn === "GOLD" ? goldPlayerName : crimsonPlayerName}
            </span>
            {inCheckSide && (
              <span className="text-red-400 animate-pulse mr-1">
                ⚠️ كش ملك!
              </span>
            )}
          </div>

          {myAssignedSide && (
            <div
              className={`rounded-xl border px-2.5 py-1 flex items-center gap-1 text-[11px] font-black ${
                myAssignedSide === "GOLD"
                  ? "border-amber-400/40 bg-amber-500/10 text-amber-300"
                  : "border-rose-400/40 bg-rose-500/10 text-rose-300"
              }`}
            >
              <span>
                {myAssignedSide === "GOLD"
                  ? "👑 مقعدك: الذهبي"
                  : "🐉 مقعدك: الأحمر"}
              </span>
            </div>
          )}
        </div>

        {/* Compact Action Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              sound.playCardFlip();
              setCameraPreset((prev) =>
                prev === "GOLD" ? "CRIMSON" : prev === "CRIMSON" ? "TOP" : "GOLD"
              );
            }}
            className="rounded-xl border border-sky-400/40 bg-slate-900 px-2.5 py-1 text-[11px] font-black text-sky-200 hover:border-sky-300 active:scale-95"
          >
            🎥{" "}
            {cameraPreset === "GOLD"
              ? "منظور الذهبي"
              : cameraPreset === "CRIMSON"
              ? "منظور الأحمر"
              : "علوي 2D"}
          </button>

          {players.length >= 2 && !aiEnabled && (
            <button
              type="button"
              onClick={() => {
                sound.playCardFlip();
                onAction({ type: "SWAP_SEATS" });
              }}
              className="rounded-xl border border-purple-400/40 bg-slate-900 px-2.5 py-1 text-[11px] font-black text-purple-200 hover:border-purple-300 active:scale-95"
            >
              🔀 عكس الألوان
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              sound.playCardFlip();
              onAction({ type: "TOGGLE_AI" });
            }}
            className={`rounded-xl border px-2.5 py-1 text-[11px] font-black transition-all active:scale-95 ${
              aiEnabled
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                : "border-slate-700 bg-slate-900 text-slate-300"
            }`}
          >
            🤖 البوت: {aiEnabled ? "مفعّل ✓" : "مغلق"}
          </button>

          {players.length >= 2 && !aiEnabled && (
            <button
              type="button"
              onClick={() => {
                sound.playCardFlip();
                onAction({ type: "TOGGLE_SHARED_CONTROL" });
              }}
              className={`rounded-xl border px-2.5 py-1 text-[11px] font-black transition-all active:scale-95 ${
                sharedControl
                  ? "border-amber-400 bg-amber-500/20 text-amber-200"
                  : "border-slate-700 bg-slate-900 text-slate-300"
              }`}
            >
              📱 مشترك: {sharedControl ? "نعم" : "لا"}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowRulesModal(true)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-black text-amber-300"
          >
            📜 القواعد
          </button>
        </div>
      </header>

      {/* ZONE 2: UNOBSTRUCTED 3D BOARD VIEWPORT (Center flex-1) */}
      <main className="relative flex-1 min-h-0 w-full overflow-hidden">
        <Onitama3DBoard
          mode={mode}
          boardSize={boardSize}
          pieces={pieces}
          turn={turn}
          selectedPieceId={selectedPieceId}
          legalDestinations={legalDestinations}
          lastMove={lastMove}
          inCheckSide={inCheckSide}
          cameraPreset={cameraPreset}
          playerSide={playerPerspectiveSide}
          onSelectTileOrPiece={handleSelectTileOrPiece}
        />

        {/* Subtle Top-Center Instruction Pill */}
        <div className="pointer-events-none absolute top-2 inset-x-0 flex justify-center px-3">
          <div className="rounded-full bg-slate-950/80 border border-slate-700/80 px-3.5 py-1 text-[11px] font-bold text-slate-200 shadow">
            {!canControlCurrentTurn
              ? `⏳ دور ${turn === "GOLD" ? goldPlayerName : crimsonPlayerName} الآن — خطّط لحركتك القادمة!`
              : selectedPieceId
              ? "🟢 اضغط على إحدى الخانات الخضراء في الطاولة للتحرك إليها!"
              : "👆 اضغط على أي قطعة من قطعك في الطاولة لتحديدها"}
          </div>
        </div>
      </main>

      {/* ZONE 3: DOCKED BOTTOM TACTICAL BAR (Never overlaps the 3D board!) */}
      <footer className="shrink-0 z-20 bg-slate-950/95 border-t border-slate-800 px-3 py-2">
        {mode === "ONITAMA" ? (
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center sm:justify-between gap-2">
            {/* This Phone's / Active Player's 2 Cards */}
            <div className="flex items-center gap-2">
              {activeHandIds.map((cid) => (
                <OnitamaScrollCard
                  key={cid}
                  card={getCardDef(cid)}
                  cardSide={displayHandSide}
                  viewSide={viewSide}
                  selected={selectedCardId === cid}
                  badgeText={
                    selectedCardId === cid
                      ? "✓ البطاقة المختارة"
                      : "اضغط لاختيارها"
                  }
                  onClick={() => {
                    sound.playCardFlip();
                    setSelectedCardId(cid);
                    if (canControlCurrentTurn) {
                      const myPieces = pieces.filter((p) => p.side === turn);
                      const curPiece = myPieces.find(
                        (p) => p.id === selectedPieceId
                      );
                      if (
                        !curPiece ||
                        getOnitamaLegalMovesForPiece(pieces, curPiece, cid)
                          .length === 0
                      ) {
                        const movable = myPieces.find(
                          (p) =>
                            getOnitamaLegalMovesForPiece(pieces, p, cid)
                              .length > 0
                        );
                        if (movable) setSelectedPieceId(movable.id);
                      }
                    }
                  }}
                />
              ))}
            </div>

            {/* Center Rotating Spare Card + Opponent's Cards Preview */}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <OnitamaScrollCard
                card={getCardDef(sideCard)}
                cardSide={displayHandSide}
                viewSide={viewSide}
                disabled
                compact
                badgeText="🔄 البطاقة القادمة"
              />
              <div className="hidden md:flex items-center gap-1.5 opacity-80">
                {opponentHandIds.map((cid) => (
                  <OnitamaScrollCard
                    key={`opp_${cid}`}
                    card={getCardDef(cid)}
                    cardSide={opponentSide}
                    viewSide={viewSide}
                    disabled
                    compact
                    badgeText={
                      opponentSide === "GOLD"
                        ? "بطاقة الذهبي"
                        : "بطاقة الأحمر"
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-4">
              <span className="font-black text-amber-300">
                👑 أسر الذهبي:{" "}
                {capturedByGold.length > 0
                  ? capturedByGold.map((k, i) => (
                      <span key={i} className="text-sm mr-0.5">
                        {PIECE_EMOJI[k]}
                      </span>
                    ))
                  : "—"}
              </span>
              <span className="font-black text-rose-300">
                🐉 أسر الأحمر:{" "}
                {capturedByCrimson.length > 0
                  ? capturedByCrimson.map((k, i) => (
                      <span key={i} className="text-sm mr-0.5">
                        {PIECE_EMOJI[k]}
                      </span>
                    ))
                  : "—"}
              </span>
            </div>

            {lastMove && (
              <span className="text-slate-300 font-bold truncate max-w-xs">
                ⚡ {lastMove.textAr}
              </span>
            )}

            <button
              type="button"
              onClick={() => onAction({ type: "RESTART_GAME" })}
              className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1.5 text-amber-300 font-black"
            >
              🔄 جولة جديدة
            </button>
          </div>
        )}

        <div
          dir="ltr"
          className="mt-1.5 pt-1 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-3 text-[10px] font-bold text-slate-400"
        >
          <span>Created by sampiw:</span>
          <a
            href="https://www.instagram.com/sampiw/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-pink-400 hover:text-pink-300 underline-offset-2 hover:underline"
          >
            Instagram
          </a>
          <span>•</span>
          <a
            href="https://github.com/sampiw"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-200 hover:text-white underline-offset-2 hover:underline"
          >
            GitHub
          </a>
          <span>•</span>
          <a
            href="https://t.me/sampiw"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 hover:text-sky-300 underline-offset-2 hover:underline"
          >
            Telegram @sampiw
          </a>
        </div>
      </footer>

      {/* RULES MODAL */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-3xl border border-amber-400/50 bg-slate-900 p-6 text-right shadow-2xl space-y-3">
            <h3 className="text-xl font-black text-amber-300">
              📜 قواعد أونيتاما 3D والشطرنج الملكي
            </h3>
            <div className="space-y-2 text-xs sm:text-sm text-slate-200 leading-relaxed">
              <p>
                <strong className="text-amber-300">
                  🐉 وضع أونيتاما 3D (5×5):
                </strong>{" "}
                كل لاعب عندو سلطان (♔) و4 تلاميذ (🥋)، وبطاقتين ديال الحركة.
              </p>
              <p>
                • المربعات الخضراء فـ البطاقة كاتورّيك فين تقدر تنقّز بالقطعة ديالك من المربع الأصفر الوسطي.
              </p>
              <p>
                • ملّي كتلعب ببطاقة، كاتمشي للوسط وكاتاخد البطاقة القادمة بلاصتها!
              </p>
              <p>
                • <strong className="text-emerald-300">كيفاش تربح؟</strong> إما تاكل سلطان الخصم (
                <strong className="text-white">طريق الحجر 🗡️</strong>)، أو توصل بسلطانك لقوس معبد الخصم (
                <strong className="text-white">طريق الجدول ⛩️</strong>)!
              </p>
              <p>
                <strong className="text-sky-300">
                  ♟️ وضع الشطرنج الملكي 3D (8×8):
                </strong>{" "}
                شطرنج كامل بجميع القواعد القانونية، الترقية لوزير (♕)، وكش مات (👑)!
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRulesModal(false)}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-emerald-500 py-3 font-black text-slate-950"
            >
              فهمت، يلا نلعبو! 🔥
            </button>
          </div>
        </div>
      )}

      {/* GAME OVER VICTORY MODAL */}
      {phase === "GAME_OVER" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/88 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-3xl border-2 border-amber-400/70 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="text-5xl mb-2">
              {winnerSide === "GOLD"
                ? "👑🏆"
                : winnerSide === "CRIMSON"
                ? "🐉🔥"
                : "🤝"}
            </div>
            <div className="inline-block rounded-full bg-amber-500/20 border border-amber-400/40 px-3.5 py-1 text-xs font-black text-amber-300 mb-2">
              {winMethodAr || "نهاية المعركة"}
            </div>
            <h2 className="text-2xl font-black text-white mb-2">
              {winnerSide === "GOLD"
                ? `انتصر ${goldPlayerName}!`
                : winnerSide === "CRIMSON"
                ? `انتصر ${crimsonPlayerName}!`
                : "تعادل تكتيكي!"}
            </h2>
            <p className="text-sm font-bold text-slate-300 mb-6">
              {winSummaryAr}
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => onAction({ type: "RESTART_GAME" })}
                className="flex-1 rounded-2xl bg-gradient-to-r from-amber-500 to-emerald-500 py-3.5 text-sm font-black text-slate-950 shadow-xl hover:brightness-110 active:scale-95"
              >
                🔄 جولة جديدة (
                {mode === "ONITAMA" ? "أونيتاما 3D" : "شطرنج 3D"})
              </button>
              <button
                type="button"
                onClick={() => onAction({ type: "SWAP_SEATS" })}
                className="rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3.5 text-xs font-black text-slate-200 hover:bg-slate-700 active:scale-95"
              >
                🔀 عكس الألوان
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}

export default Onitama3DGameView;
