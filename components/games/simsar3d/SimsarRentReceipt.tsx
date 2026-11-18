"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Building2, Coins } from "lucide-react";
import { SIMSAR_BOARD_TILES } from "@/games/simsar3d/boardData";
import { SimsarRentReceipt as RentReceipt, SimsarState } from "@/games/simsar3d/types";
import { simsarSfx } from "./soundFx";

const LANDING_FALLBACK_MS = 3200;
const RECEIPT_DURATION_MS = 4500;

export function useRentReceipt(receipt: RentReceipt | null | undefined) {
  const [presentedId, setPresentedId] = useState<string | null>(null);
  const [releasedId, setReleasedId] = useState<string | null>(null);
  const { id, createdAt, payerId, moveSeq, tileIndex } = receipt ?? {};

  const isFresh = id !== undefined && Math.abs(Date.now() - (createdAt ?? 0)) < 8000;
  const isVisible = id !== undefined && presentedId === id;

  useEffect(() => {
    if (!id || !isFresh || isVisible || releasedId === id) return;
    const timer = setTimeout(() => setPresentedId(id), LANDING_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [id, isFresh, isVisible, releasedId]);

  useEffect(() => {
    if (!id || !isVisible) return;
    simsarSfx.playRentPaid();
    const releaseTimer = setTimeout(() => setReleasedId(id), 1050);
    const dismissTimer = setTimeout(() => setPresentedId(null), RECEIPT_DURATION_MS);
    return () => {
      clearTimeout(releaseTimer);
      clearTimeout(dismissTimer);
    };
  }, [id, isVisible]);

  const onLand = useCallback((playerId: string, landedMoveSeq: number, landedTile: number) => {
    if (id && isFresh && releasedId !== id && playerId === payerId &&
        landedMoveSeq === moveSeq && landedTile === tileIndex) {
      setPresentedId(id);
    }
  }, [id, isFresh, releasedId, payerId, moveSeq, tileIndex]);

  return {
    visibleReceipt: isVisible ? receipt : null,
    waitingForReceipt: isFresh && releasedId !== id,
    onLand,
  };
}

export function SimsarRentReceipt({ receipt, players, myId }: {
  receipt: RentReceipt;
  players: SimsarState["players"];
  myId: string;
}) {
  const reduceMotion = useReducedMotion();
  const tile = SIMSAR_BOARD_TILES[receipt.tileIndex];
  const payer = players[receipt.payerId]?.nickname ?? "السمسار";
  const owner = players[receipt.ownerId]?.nickname ?? "مول العقار";
  const isPayer = myId === receipt.payerId;
  const isOwner = myId === receipt.ownerId;
  const amountColor = isPayer ? "text-rose-300" : isOwner ? "text-emerald-300" : "text-amber-200";

  return (
    <motion.div
      role="status"
      dir="rtl"
      initial={{ opacity: 0, y: reduceMotion ? 0 : 14, scale: reduceMotion ? 1 : 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="w-full max-w-xs rounded-2xl border border-amber-300/35 bg-slate-950/95 px-4 py-3 text-center shadow-xl shadow-black/50"
    >
      <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-200">
        <Building2 className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
        {tile?.nameAr}
      </div>
      <p className={`my-0.5 flex items-center justify-center gap-2 text-2xl font-black tabular-nums ${amountColor}`}>
        <Coins className="h-5 w-5" aria-hidden="true" />
        <bdi dir="ltr">{isPayer ? "−" : isOwner ? "+" : ""}{receipt.paidDh} DH</bdi>
      </p>
      <p className="text-sm font-bold text-white">
        <bdi>{payer}</bdi> خلّص الكرا لـ <bdi>{owner}</bdi>
      </p>
      {receipt.shieldUsed && <p className="mt-0.5 text-xs text-sky-200">🛡️ الدرع نقص الكرا للنص</p>}
      {receipt.paidDh < receipt.dueDh && (
        <p className="mt-0.5 text-xs text-rose-200">الكرا المطلوب كان <bdi>{receipt.dueDh} DH</bdi></p>
      )}
    </motion.div>
  );
}
