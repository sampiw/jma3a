"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/realtime/supabaseBrowser";
import { GhammadaPropId } from "@/games/ghammada/types";

/** Compact live position packet (sent ~12 times per second while moving) */
export interface LivePos {
  i: string; // player id
  x: number;
  z: number;
  r: number; // rotY
  p?: GhammadaPropId;
  l?: boolean; // locked
  m?: boolean; // moving
  t: number; // receive time (local clock)
}

export type LiveFxKind = "strike" | "whistle" | "dash" | "morph";

export interface LiveFx {
  k: LiveFxKind;
  i: string;
  x: number;
  z: number;
  r?: number;
  p?: GhammadaPropId;
}

const SEND_INTERVAL_MS = 80;
const HEARTBEAT_MS = 900;
export const LIVE_STALE_MS = 2000;

/**
 * Phone-to-phone live channel for one room.
 * - Positions go straight between phones (no server, nothing stored).
 * - "refresh" pings tell other phones to re-read the game state right away after important actions.
 */
export function useGhammadaLive(
  roomCode: string | undefined,
  myId: string,
  handlers: { onFx?: (fx: LiveFx) => void; onRefresh?: () => void }
) {
  const [isLive, setIsLive] = useState(false);
  const peersRef = useRef<Map<string, LivePos>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef<{ at: number; key: string }>({ at: 0, key: "" });
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase || !roomCode || !myId) return;

    const channel = supabase.channel(`ghammada:${roomCode.toUpperCase()}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    channel
      .on("broadcast", { event: "pos" }, ({ payload }) => {
        const p = payload as LivePos;
        if (!p || p.i === myId) return;
        peersRef.current.set(p.i, { ...p, t: performance.now() });
      })
      .on("broadcast", { event: "fx" }, ({ payload }) => {
        const fx = payload as LiveFx;
        if (!fx || fx.i === myId) return;
        handlersRef.current.onFx?.(fx);
      })
      .on("broadcast", { event: "refresh" }, () => {
        handlersRef.current.onRefresh?.();
      })
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    channelRef.current = channel;
    return () => {
      setIsLive(false);
      channelRef.current = null;
      peersRef.current.clear();
      supabase.removeChannel(channel);
    };
  }, [roomCode, myId]);

  /** Sends my position; throttled, and only re-sent when something changed (plus a slow heartbeat) */
  const sendPos = useCallback(
    (pos: Omit<LivePos, "t" | "i">) => {
      const ch = channelRef.current;
      if (!ch || !myId) return;
      const now = performance.now();
      const key = `${pos.x.toFixed(2)}|${pos.z.toFixed(2)}|${pos.r.toFixed(2)}|${pos.p}|${pos.l ? 1 : 0}`;
      const since = now - lastSentRef.current.at;
      if (since < SEND_INTERVAL_MS) return;
      if (key === lastSentRef.current.key && since < HEARTBEAT_MS) return;
      lastSentRef.current = { at: now, key };
      ch.send({
        type: "broadcast",
        event: "pos",
        payload: {
          i: myId,
          x: Math.round(pos.x * 100) / 100,
          z: Math.round(pos.z * 100) / 100,
          r: Math.round(pos.r * 100) / 100,
          p: pos.p,
          l: pos.l,
          m: pos.m,
          t: 0,
        },
      });
    },
    [myId]
  );

  const sendFx = useCallback(
    (fx: Omit<LiveFx, "i">) => {
      channelRef.current?.send({ type: "broadcast", event: "fx", payload: { ...fx, i: myId } });
    },
    [myId]
  );

  const sendRefresh = useCallback(() => {
    channelRef.current?.send({ type: "broadcast", event: "refresh", payload: {} });
  }, []);

  return { isLive, peersRef, sendPos, sendFx, sendRefresh };
}
