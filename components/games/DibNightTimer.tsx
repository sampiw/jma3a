"use client";

import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import type { PublicGameView } from "@/lib/types";

const NIGHT_LABELS: Record<string, string> = {
  NIGHT_INTRO: "الحومة كتنعس",
  NIGHT_SEER: "وقت الشوافة",
  NIGHT_WOLVES: "وقت الذيابة",
  NIGHT_WITCH: "وقت السحارة",
};

interface DibNightTimerProps {
  phase: string;
  timer?: PublicGameView["timer"];
  isHost: boolean;
  onElapsed: (action: { type: "NIGHT_TIMER_EXPIRED"; phase: string; endsAt: number }) => Promise<boolean>;
}

export function DibNightTimer({ phase, timer, isHost, onElapsed }: DibNightTimerProps) {
  const [now, setNow] = useState(Date.now);
  const callback = useRef(onElapsed);
  useEffect(() => { callback.current = onElapsed; }, [onElapsed]);
  const endsAt = timer?.endsAt;
  const enabled = Boolean(NIGHT_LABELS[phase] && timer && !timer.isPaused);

  useEffect(() => {
    if (!enabled || endsAt === undefined) return;
    let disposed = false;
    let inFlight = false;
    let completed = false;
    let retryAt = 0;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (!isHost || time < endsAt || inFlight || completed || time < retryAt) return;
      inFlight = true;
      void callback.current({ type: "NIGHT_TIMER_EXPIRED", phase, endsAt })
        .then((success) => { if (!disposed) completed = success; })
        .catch(() => {})
        .finally(() => {
          inFlight = false;
          retryAt = Date.now() + 3000;
        });
    };
    tick();
    const interval = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      disposed = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, endsAt, phase, isHost]);

  if (!enabled || !timer) return null;
  const seconds = Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  const progress = Math.max(0, Math.min(100, ((timer.endsAt - now) / timer.durationMs) * 100));

  return (
    <div className="mx-auto mb-3 max-w-md rounded-2xl border border-indigo-500/30 bg-indigo-950/40 p-4 text-center">
      <div className="flex items-center justify-center gap-2 text-sm font-bold text-indigo-200">
        <Timer className="h-4 w-4" />
        <span>{NIGHT_LABELS[phase]}</span>
        <span role="timer" aria-label="الوقت المتبقي" className="min-w-12 font-mono text-xl tabular-nums text-white">{seconds}s</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-indigo-900/60" aria-hidden="true">
        <div className="h-full rounded-full bg-indigo-400 transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-xs text-indigo-300/80">
        {seconds > 0 ? "المرحلة الموالية كتبدا بوحدها ملي يسالي الوقت" : "كنتسناو المرحلة الموالية..."}
      </p>
    </div>
  );
}
