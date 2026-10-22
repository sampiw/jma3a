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

/**
 * Renders the 5x5 miniature movement matrix on each Onitama Martial Arts Scroll Card
 */
function OnitamaScrollCard({
  card,
  side,
  selected,
  disabled,
  compact,
  badgeText,
  onClick,
}: {
  card: OnitamaCardDef;
  side: PieceSide;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  badgeText?: string;
  onClick?: () => void;
}) {
  const moveSet = useMemo(() => {
    const s = new Set<string>();
    for (const [dr, dc] of card.moves) {
      const actualDr = side === "GOLD" ? dr : -dr;
      const actualDc = side === "GOLD" ? dc : -dc;
      s.add(`${2 + actualDr},${2 + actualDc}`);
    }
    return s;
  }, [card.moves, side]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative flex items-center gap-2.5 rounded-2xl border-2 transition-all select-none ${
        compact ? "px-2.5 py-1.5" : "px-3.5 py-2.5"
      } ${
        selected
          ? "border-amber-300 bg-gradient-to-br from-amber-500/30 to-slate-900 shadow-[0_0_22px_rgba(251,191,36,0.55)] -translate-y-1 scale-[1.03]"
          : "border-slate-700/90 bg-slate-950/90 hover:border-slate-500"
      } ${disabled ? "opacity-85 cursor-default" : "cursor-pointer active:scale-95"}`}
    >
      {/* 5x5 Mini Grid */}
      <div
        className={`grid grid-cols-5 gap-0.5 rounded-lg bg-slate-900 p-1 border border-slate-700 ${
          compact ? "w-11 h-11" : "w-14 h-14 sm:w-16 sm:h-16"
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
                  : "bg-slate-800/80"
              }`}
            />
          );
        })}
      </div>

      {/* Card Title & Stamp */}
      <div className="text-right">
        {badgeText && (
          <div className="text-[9px] font-black text-sky-300 mb-0.5">
            {badgeText}
          </div>
        )}
        <div
          className={`font-black text-white flex items-center gap-1 ${
            compact ? "text-xs" : "text-sm sm:text-base"
          }`}
        >
          <span>{card.emoji}</span>
          <span>{card.nameAr}</span>
        </div>
        <div className="text-[10px] font-bold text-slate-400">
          {card.nameEn}
        </div>
        {selected && !compact && (
          <div className="mt-1 inline-block rounded-full bg-amber-400/20 border border-amber-400/50 px-2 py-0.5 text-[10px] font-black text-amber-200">
            ✓ البطاقة المختارة
          </div>
        )}
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
  const boardSize = (publicData?.boardSize as 5 | 8) ?? (mode === "ONITAMA" ? 5 : 8);
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
  const capturedByCrimson = (publicData?.capturedByCrimson as PieceKind[]) ?? [];
  const inCheckSide = (publicData?.inCheckSide as PieceSide | null) ?? null;
  const lastMove = (publicData?.lastMove as MoveRecord | null) ?? null;
  const winnerSide =
    (publicData?.winnerSide as PieceSide | "DRAW" | null) ?? null;
  const winMethodAr = (publicData?.winMethodAr as string | null) ?? null;
  const winSummaryAr = (publicData?.winSummaryAr as string | null) ?? null;

  const myPlayerId = activePlayerId || String(privateData?.playerId ?? "");

  const goldPlayerName = useMemo(() => {
    return (
      players.find((p: any) => p.id === goldPlayerId)?.nickname || "الجيش الذهبي"
    );
  }, [players, goldPlayerId]);

  const crimsonPlayerName = useMemo(() => {
    if (aiEnabled) return "🤖 الذكاء الاصطناعي";
    return (
      players.find((p: any) => p.id === crimsonPlayerId)?.nickname ||
      "الجيش الأحمر"
    );
  }, [players, crimsonPlayerId, aiEnabled]);

  // Determine whether this device can control the current turn
  const canControlCurrentTurn = useMemo(() => {
    if (phase !== "PLAYING") return false;
    if (aiEnabled && turn === "CRIMSON") return false;
    if (sharedControl || players.length < 2 || goldPlayerId === crimsonPlayerId) {
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

  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string>(
    turn === "GOLD" ? goldCards[0] : crimsonCards[0]
  );
  const [cameraPreset, setCameraPreset] = useState<"GOLD" | "CRIMSON" | "TOP">(
    "GOLD"
  );
  const [showRulesModal, setShowRulesModal] = useState(false);

  // Sync default selected card when turn or hand changes
  useEffect(() => {
    const activeHand = turn === "GOLD" ? goldCards : crimsonCards;
    if (activeHand.length > 0 && !activeHand.includes(selectedCardId)) {
      setSelectedCardId(activeHand[0]);
    }
    setSelectedPieceId(null);
  }, [turn, goldCards, crimsonCards, selectedCardId, mode]);

  // Auto-perspective when not in TOP view if playing on separate phones
  useEffect(() => {
    if (
      !sharedControl &&
      players.length >= 2 &&
      goldPlayerId !== crimsonPlayerId &&
      myPlayerId === crimsonPlayerId &&
      cameraPreset === "GOLD"
    ) {
      setCameraPreset("CRIMSON");
    }
  }, [sharedControl, players.length, goldPlayerId, crimsonPlayerId, myPlayerId, cameraPreset]);

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
    }, 680);
    return () => clearTimeout(timer);
  }, [phase, aiEnabled, turn, onAction, lastMove?.id]);

  // Compute legal destination squares for the currently selected piece
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

      // 1. If a piece is already selected and (r, c) is a legal destination -> Execute Move!
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
        setSelectedPieceId((prev) =>
          prev === clickedFriendly.id ? null : clickedFriendly.id
        );
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

  const activeHandIds = turn === "GOLD" ? goldCards : crimsonCards;
  const waitingHandIds = turn === "GOLD" ? crimsonCards : goldCards;

  if (!mounted) return null;

  const content = (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9999] w-screen h-screen overflow-hidden bg-[#070b14] text-white select-none font-sans flex flex-col justify-between"
    >
      {/* 3D Three.js Chess & Onitama Board Canvas */}
      <div className="absolute inset-0 z-0">
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
          onSelectTileOrPiece={handleSelectTileOrPiece}
        />
      </div>

      {/* TOP BAR: Mode Switcher + Turn Banner + Camera & AI Controls */}
      <div className="relative z-20 pointer-events-none p-3 flex flex-wrap items-start justify-between gap-2">
        {/* Right Group: Mode Switcher & Turn Indicator */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          {/* Mode Toggle Pill: Onitama 3D vs Chess 3D */}
          <div className="flex items-center rounded-2xl border border-amber-400/40 bg-slate-950/90 backdrop-blur-md p-1 shadow-xl">
            <button
              type="button"
              onClick={() => {
                sound.playCardFlip();
                onAction({ type: "SWITCH_MODE", mode: "ONITAMA" });
              }}
              className={`rounded-xl px-3 py-1.5 text-xs sm:text-sm font-black transition-all ${
                mode === "ONITAMA"
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              🐉 أونيتاما 3D (5×5)
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playCardFlip();
                onAction({ type: "SWITCH_MODE", mode: "CHESS" });
              }}
              className={`rounded-xl px-3 py-1.5 text-xs sm:text-sm font-black transition-all ${
                mode === "CHESS"
                  ? "bg-gradient-to-r from-amber-500 to-emerald-500 text-slate-950 shadow-md"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              ♟️ شطرنج 3D (8×8)
            </button>
          </div>

          {/* Turn & Match Banner */}
          <div
            className={`rounded-2xl border px-3.5 py-2 backdrop-blur-md shadow-xl flex items-center gap-2.5 ${
              turn === "GOLD"
                ? "border-amber-400/60 bg-amber-950/80 text-amber-200"
                : "border-rose-400/60 bg-rose-950/80 text-rose-200"
            }`}
          >
            <span className="text-lg">{turn === "GOLD" ? "👑" : "🐉"}</span>
            <div>
              <div className="text-xs sm:text-sm font-black">
                دور:{" "}
                {turn === "GOLD"
                  ? `${goldPlayerName} (الذهبي)`
                  : `${crimsonPlayerName} (الأحمر)`}
              </div>
              <div className="text-[10px] text-slate-300 font-bold">
                {inCheckSide
                  ? "⚠️ كش ملك! احمِ السلطان فوراً!"
                  : mode === "ONITAMA"
                  ? "اختر بطاقة ⬅ اضغط على قطعتك ⬅ اضغط على الخانة الخضراء"
                  : "اضغط على قطعتك في الـ 3D ثم اختر الخانة المتاحة"}
              </div>
            </div>
          </div>
        </div>

        {/* Left Group: Opponent Cards (in Onitama) + Camera & AI Controls */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              sound.playCardFlip();
              setCameraPreset((prev) =>
                prev === "GOLD" ? "TOP" : prev === "TOP" ? "CRIMSON" : "GOLD"
              );
            }}
            className="rounded-2xl border border-sky-400/40 bg-slate-950/85 backdrop-blur-md px-3 py-2 text-xs font-black text-sky-200 hover:border-sky-300 active:scale-95"
          >
            🎥 زاوية الكاميرا:{" "}
            {cameraPreset === "GOLD"
              ? "الذهبي 3D"
              : cameraPreset === "CRIMSON"
              ? "الأحمر 3D"
              : "علوية 2D/3D"}
          </button>

          <button
            type="button"
            onClick={() => {
              sound.playCardFlip();
              onAction({ type: "TOGGLE_AI" });
            }}
            className={`rounded-2xl border px-3 py-2 text-xs font-black backdrop-blur-md transition-all active:scale-95 ${
              aiEnabled
                ? "border-emerald-400 bg-emerald-950/85 text-emerald-200"
                : "border-slate-700 bg-slate-950/85 text-slate-300"
            }`}
          >
            🤖 ضد الذكاء الاصطناعي: {aiEnabled ? "مفعّل ✓" : "مغلق"}
          </button>

          {players.length >= 2 && !aiEnabled && (
            <button
              type="button"
              onClick={() => {
                sound.playCardFlip();
                onAction({ type: "TOGGLE_SHARED_CONTROL" });
              }}
              className={`rounded-2xl border px-3 py-2 text-xs font-black backdrop-blur-md transition-all active:scale-95 ${
                sharedControl
                  ? "border-amber-400 bg-amber-950/85 text-amber-200"
                  : "border-slate-700 bg-slate-950/85 text-slate-300"
              }`}
            >
              📱 تليفون مشترك: {sharedControl ? "نعم" : "كل واحد بتليفونو"}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowRulesModal(true)}
            className="rounded-2xl border border-slate-700 bg-slate-950/85 px-3 py-2 text-xs font-black text-amber-300 hover:border-amber-400"
          >
            📜 القواعد
          </button>
        </div>
      </div>

      {/* MIDDLE SIDEBARS: Center Spare Card (Onitama) or Captured Pieces (Chess) */}
      <div className="relative z-20 pointer-events-none px-3 flex items-center justify-between">
        {/* Right Floating Panel: Center Rotating Card (Onitama) or Captured Tray */}
        {mode === "ONITAMA" ? (
          <div className="pointer-events-auto flex flex-col gap-2">
            <OnitamaScrollCard
              card={getCardDef(sideCard)}
              side={turn}
              disabled
              compact
              badgeText="🔄 البطاقة الوسطى (تتبادل بعد الحركة)"
            />
          </div>
        ) : (
          <div className="pointer-events-auto rounded-2xl border border-slate-700/80 bg-slate-950/85 backdrop-blur-md p-3 shadow-xl space-y-2 max-w-[210px]">
            <div className="text-[11px] font-black text-amber-300">
              👑 غنائم الذهبي:{" "}
              {capturedByGold.length > 0
                ? capturedByGold.map((k, i) => (
                    <span key={i} className="text-base mr-0.5">
                      {PIECE_EMOJI[k]}
                    </span>
                  ))
                : "—"}
            </div>
            <div className="text-[11px] font-black text-rose-300">
              🐉 غنائم الأحمر:{" "}
              {capturedByCrimson.length > 0
                ? capturedByCrimson.map((k, i) => (
                    <span key={i} className="text-base mr-0.5">
                      {PIECE_EMOJI[k]}
                    </span>
                  ))
                : "—"}
            </div>
          </div>
        )}

        {/* Left Floating Panel: Opponent's 2 Cards in Onitama */}
        {mode === "ONITAMA" && (
          <div className="pointer-events-auto hidden sm:flex flex-col gap-1.5 items-end">
            <div className="text-[10px] font-black text-slate-400 px-1">
              بطاقات الطرف الآخر ({turn === "GOLD" ? "الأحمر 🐉" : "الذهبي 👑"}):
            </div>
            <div className="flex gap-2">
              {waitingHandIds.map((cid) => (
                <OnitamaScrollCard
                  key={cid}
                  card={getCardDef(cid)}
                  side={turn === "GOLD" ? "CRIMSON" : "GOLD"}
                  disabled
                  compact
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM TACTICAL DECK: Active Hand Cards (Onitama) or Move Feed (Chess) */}
      <div className="relative z-20 pointer-events-none p-3 flex flex-col items-center gap-2">
        {lastMove && (
          <div className="rounded-full border border-slate-700/80 bg-slate-950/85 backdrop-blur-md px-4 py-1 text-xs font-bold text-slate-200 shadow-lg">
            ⚡ آخر حركة: {lastMove.textAr}
          </div>
        )}

        {mode === "ONITAMA" ? (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
            {activeHandIds.map((cid) => (
              <OnitamaScrollCard
                key={cid}
                card={getCardDef(cid)}
                side={turn}
                selected={selectedCardId === cid}
                disabled={!canControlCurrentTurn}
                badgeText={
                  turn === "GOLD"
                    ? "👑 بطاقة الذهبي"
                    : "🐉 بطاقة الأحمر"
                }
                onClick={() => {
                  sound.playCardFlip();
                  setSelectedCardId(cid);
                }}
              />
            ))}
          </div>
        ) : (
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/85 backdrop-blur-md px-4 py-2 text-xs font-bold text-slate-300">
            <span>💡 نصيحة: اسحب الشاشة لتدوير الطاولة 360°، أو اضغط على أي قطعة لتحريكها!</span>
            <button
              type="button"
              onClick={() => onAction({ type: "RESTART_GAME" })}
              className="rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-1 text-amber-300 font-black"
            >
              🔄 إعادة الجولة
            </button>
          </div>
        )}
      </div>

      {/* RULES MODAL */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-3xl border border-amber-400/50 bg-slate-900 p-6 text-right shadow-2xl space-y-3">
            <h3 className="text-xl font-black text-amber-300">
              📜 قواعد أونيتاما 3D والشطرنج الملكي
            </h3>
            <div className="space-y-2 text-xs sm:text-sm text-slate-200 leading-relaxed">
              <p>
                <strong className="text-amber-300">🐉 وضع أونيتاما 3D (5×5):</strong>{" "}
                لعبة فنون قتالية تكتيكية! كل لاعب عندو معلّم كبير (السلطان ♔) و4 تلاميذ، وبطاقتين ديال الحركة.
              </p>
              <p>
                • المربعات الخضراء فـ البطاقة كاتورّيك فين تقدر تنقّز بالقطعة ديالك من المربع الأصفر الوسطي.
              </p>
              <p>
                • ملّي كتلعب ببطاقة، كاتمشي للوسط وكاتاخد البطاقة الوسطى بلاصتها!
              </p>
              <p>
                • <strong className="text-emerald-300">كيفاش تربح فـ أونيتاما؟</strong> إما تاكل سلطان الخصم (<strong className="text-white">طريق الحجر 🗡️</strong>)، أو توصل بسلطانك لقوس معبد الخصم (<strong className="text-white">طريق الجدول ⛩️</strong>)!
              </p>
              <p>
                <strong className="text-sky-300">♟️ وضع الشطرنج الملكي 3D (8×8):</strong>{" "}
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
                🔄 جولة جديدة ({mode === "ONITAMA" ? "أونيتاما 3D" : "شطرنج 3D"})
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
