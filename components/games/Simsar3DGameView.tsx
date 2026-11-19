"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  Building2,
  Camera,
  Check,
  Coins,
  Copy,
  Flame,
  Gavel,
  Handshake,
  History,
  Maximize2,
  Minimize2,
  Repeat,
  RotateCcw,
  Settings2,
  Smile,
  Sparkles,
  Trophy,
  Unlock,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { DevicePlayerInfo } from "@/lib/types";
import { sound } from "@/lib/sound";
import { chooseNextBotAction } from "@/games/simsar3d/ai";
import {
  BUILDING_TIER_NAMES_AR,
  COLOR_GROUP_META,
  computePropertyRent,
  getGroupTileIndices,
  getSimsarUpgradeQuote,
  hasSimsarUpgradedTileThisTurn,
  isSimsarPropertyPhase,
  JAIL_BAIL_DH,
  ownsFullColorSet,
  SIMSAR_BOARD_TILES,
} from "@/games/simsar3d/boardData";
import { sortSimsarStandings } from "@/games/simsar3d/engine";
import {
  SIMSAR_REACTION_ORDER,
  SIMSAR_REACTIONS,
  SIMSAR_TOKEN_ORDER,
  SIMSAR_TOKENS,
  SimsarAction,
  SimsarHeistSymbol,
  SimsarMode,
  SimsarPlayer,
  SimsarState,
  SimsarTileSpec,
  SimsarTokenId,
} from "@/games/simsar3d/types";
import { Simsar3DBoardCanvas } from "./simsar3d/Simsar3DBoardCanvas";
import { SimsarMiniGames } from "./simsar3d/SimsarMiniGames";
import { SimsarPropertyDeals } from "./simsar3d/SimsarPropertyDeals";
import { SimsarRentReceipt, useRentReceipt } from "./simsar3d/SimsarRentReceipt";
import { simsarSfx } from "./simsar3d/soundFx";

export interface Simsar3DGameViewProps {
  publicData: any;
  privateData: any;
  isHost: boolean;
  onAction: (action: SimsarAction, targetPlayerId?: string) => void | Promise<boolean>;
  players: any[];
  activePlayerId?: string;
  devicePlayers?: DevicePlayerInfo[];
  onSelectPlayer?: (playerId: string) => void;
  roomCode?: string;
  onRefresh?: () => void;
}

const HEIST_SYMBOL_META: Record<
  SimsarHeistSymbol,
  { emoji: string; labelAr: string; rewardDh: number; pillCss: string }
> = {
  SILVER: {
    emoji: "🪙",
    labelAr: "فضة",
    rewardDh: 95,
    pillCss: "from-slate-300/30 to-slate-700/60 border-slate-300/60 text-slate-100",
  },
  GOLD: {
    emoji: "🥇",
    labelAr: "ذهب",
    rewardDh: 170,
    pillCss: "from-amber-400/35 to-amber-800/65 border-amber-300/75 text-amber-100",
  },
  DIAMOND: {
    emoji: "💎",
    labelAr: "ألماس",
    rewardDh: 280,
    pillCss: "from-cyan-400/35 to-indigo-900/70 border-cyan-300/80 text-cyan-100",
  },
};

const SPECIAL_TILE_DESC_AR: Partial<Record<SimsarTileSpec["kind"], string>> = {
  START: "نقطة الانطلاق! دوز عليها وشدّ +250 DH مانضا، أو حط فوقها نيشان وربح +350 DH!",
  HAMZA: "كارطة الهمزة المغربية! حظك بين يدي الله: همزة مبرعة، درع حماية 🛡️، أو ضريبة!",
  JAIL: "زيارة عادية للفوريان — يلا تشديتي بالرادار خصك ضوبل أو 100 DH كفالة باش تخرج!",
  JACKPOT: "پلاصة الكارديان 🦺! كل ضريبة وكفالة كتجمع الوسط — اللي حط هنا كيدي الصندوقة كاملة!",
  HEIST: "سطو الطاجين الملكي 🥷! قلّب 9 طواجن وطابق 3 رموز باش تسرق من أغنى سمسار فـ الطبلة!",
  RADAR_TO_JAIL: "رادار الدرك الملكي 📸🚓! السرعة المفرطة غتصيفطك نيشان للفوريان مع غرامة!",
  TAX: "الضريبة ومول الضو 🧾! كتخلص المساهمة وكتتزاد مباشرة فـ صندوقة الكارديان الوسط!",
};

function AnimatedNumber({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const [display, setDisplay] = useState<number>(value);
  const [flash, setFlash] = useState<"UP" | "DOWN" | null>(null);
  const curRef = useRef<number>(value);

  useEffect(() => {
    const startVal = curRef.current;
    if (startVal === value) return;
    setFlash(value > startVal ? "UP" : "DOWN");
    const flashTimer = setTimeout(() => setFlash(null), 520);

    const startTime = performance.now();
    const duration = 420;
    let rafId = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      const next = Math.round(startVal + (value - startVal) * ease);
      curRef.current = next;
      setDisplay(next);
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      }
    };
    rafId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(flashTimer);
    };
  }, [value]);

  const pulseCss =
    flash === "UP"
      ? "scale-110 text-amber-200 drop-shadow-[0_0_8px_rgba(251,191,36,0.75)]"
      : flash === "DOWN"
      ? "scale-105 text-rose-300"
      : "";

  return (
    <span className={`inline-block transition-transform duration-200 ${pulseCss} ${className}`}>
      {display}
    </span>
  );
}

export function Simsar3DGameView({
  publicData,
  privateData,
  isHost,
  onAction,
  activePlayerId,
  devicePlayers,
  onSelectPlayer,
  roomCode,
}: Simsar3DGameViewProps) {
  const state = publicData as SimsarState | undefined;

  const [mounted, setMounted] = useState(false);
  const [isImmersive, setIsImmersive] = useState(true);
  const [isMuted, setIsMuted] = useState(() => sound.isMuted);
  const [cameraMode, setCameraMode] = useState<"AUTO" | "OVERVIEW">("AUTO");
  const [rollMultiplier, setRollMultiplier] = useState<1 | 2>(1);
  const [autoRoll, setAutoRoll] = useState(false);
  const [inspectedTileIndex, setInspectedTileIndex] = useState<number | null>(null);
  const [empireOpen, setEmpireOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dealSheet, setDealSheet] = useState<{ tileIndex: number | null } | null>(null);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [rollCooldown, setRollCooldown] = useState(false);
  const [dismissedHeistSeq, setDismissedHeistSeq] = useState<string>("");
  const [nowTick, setNowTick] = useState(() => Date.now());

  const lastEventIdRef = useRef<string>("");
  const lastHeistResolvedRef = useRef<string>("");
  const lastGameOverConfettiRef = useRef<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Tick timer during AUCTION so countdown updates smoothly every 200ms
  useEffect(() => {
    if (state?.phase !== "AUCTION") return;
    const iv = setInterval(() => setNowTick(Date.now()), 200);
    return () => clearInterval(iv);
  }, [state?.phase]);

  // Determine effective local player ID (supports both MULTI_PHONE and shared ONE_PHONE seamlessly!)
  const fallbackMyId =
    activePlayerId ||
    (privateData?.myPlayerId as string | undefined) ||
    devicePlayers?.[0]?.id ||
    state?.turnOrder?.[0] ||
    "";

  const sharedPhonePlayerIds = useMemo(
    () => (devicePlayers && devicePlayers.length > 1 ? devicePlayers.map((d) => d.id) : []),
    [devicePlayers]
  );

  const effectiveMyId = useMemo(() => {
    if (!state) return fallbackMyId;
    if (sharedPhonePlayerIds.length > 1) {
      if (
        (state.phase === "ROLL_READY" || state.phase === "LANDED_DECISION") &&
        sharedPhonePlayerIds.includes(state.currentPlayerId)
      ) {
        return state.currentPlayerId;
      }
      if (
        state.phase === "HEIST" &&
        state.heist &&
        sharedPhonePlayerIds.includes(state.heist.raiderId)
      ) {
        return state.heist.raiderId;
      }
    }
    return fallbackMyId;
  }, [state, fallbackMyId, sharedPhonePlayerIds]);

  const dispatchSimsar = useCallback(
    (action: SimsarAction, explicitActorId?: string) => onAction(action, explicitActorId || effectiveMyId),
    [onAction, effectiveMyId]
  );

  // Trigger crisp WebAudio + haptic cues when new board events arrive!
  useEffect(() => {
    const topEv = state?.recentEvents?.[0];
    if (!topEv || topEv.id === lastEventIdRef.current) return;
    lastEventIdRef.current = topEv.id;
    if (topEv.id === "ev_welcome" || topEv.rent) return;

    if (topEv.emoji === "🚓" || topEv.emoji === "🔒") {
      simsarSfx.playRadarSiren();
    } else if (topEv.tone === "ROSE") {
      simsarSfx.playRentPaid();
    } else if (topEv.emoji === "🏗️") {
      simsarSfx.playBuildUpgrade(2);
    } else if (topEv.tone === "EMERALD" || topEv.tone === "GOLD") {
      simsarSfx.playCashGain();
    } else if (topEv.tone === "PURPLE") {
      simsarSfx.playFanfare();
    }
  }, [state?.recentEvents]);

  // Play fanfare + golden confetti burst when a 9-Tajine heist resolves
  useEffect(() => {
    const h = state?.heist;
    if (!h || !h.resolvedTier) return;
    const key = `${h.raiderId}_${h.victimId}_${h.resolvedTier}_${h.stolenAmount}`;
    if (lastHeistResolvedRef.current !== key) {
      lastHeistResolvedRef.current = key;
      simsarSfx.playFanfare();
      try {
        confetti({
          particleCount: 70,
          spread: 72,
          origin: { y: 0.58 },
          colors: ["#fbbf24", "#34d399", "#38bdf8", "#f43f5e"],
        });
      } catch {}
    }
  }, [state?.heist]);

  // Fire royal podium confetti when match concludes!
  useEffect(() => {
    if (state?.phase === "GAME_OVER") {
      if (!lastGameOverConfettiRef.current) {
        lastGameOverConfettiRef.current = true;
        simsarSfx.playFanfare();
        try {
          confetti({
            particleCount: 110,
            spread: 85,
            origin: { y: 0.5 },
            colors: ["#fbbf24", "#f59e0b", "#10b981", "#38bdf8"],
          });
        } catch {}
      }
    } else {
      lastGameOverConfettiRef.current = false;
    }
  }, [state?.phase]);

  // Reset inspected tile when turn changes so the 3D board stays unobstructed
  useEffect(() => {
    setInspectedTileIndex(null);
  }, [state?.currentPlayerId, state?.phase]);

  // Clamp x2 multiplier back to x1 if cash drops below 500 DH
  const me: SimsarPlayer | undefined = state?.players?.[effectiveMyId];
  useEffect(() => {
    if (me && me.cash < 500 && rollMultiplier === 2) {
      setRollMultiplier(1);
    }
  }, [me, rollMultiplier]);

  const isMyTurn = Boolean(me && !me.isBankrupt && state?.currentPlayerId === effectiveMyId);
  const canBuild = Boolean(state && isMyTurn && isSimsarPropertyPhase(state.phase) &&
    me?.inJailTurns === 0);
  const { visibleReceipt, waitingForReceipt, onLand } = useRentReceipt(state?.lastRent);
  const rentPacing = Boolean(waitingForReceipt && state?.phase === "LANDED_DECISION" &&
    state.lastRent?.payerId === state.currentPlayerId && state.lastRent.rollSeq === state.lastDice?.rollSeq);

  const handleRollDice = useCallback(() => {
    if (!state || !isMyTurn || state.phase !== "ROLL_READY" || rollCooldown) return;
    setRollCooldown(true);
    setTimeout(() => setRollCooldown(false), 700);
    setInspectedTileIndex(null);
    simsarSfx.playDiceRoll();
    dispatchSimsar({ type: "ROLL_DICE", multiplier: rollMultiplier });
  }, [state, isMyTurn, rollCooldown, dispatchSimsar, rollMultiplier]);

  const heistKey = state?.heist
    ? `${state.heist.raiderId}_${state.heist.victimId}_${state.lastDice?.rollSeq ?? 0}`
    : "";
  const showHeistModal =
    Boolean(state?.heist) &&
    (state?.phase === "HEIST" ||
      (Boolean(state?.heist?.resolvedTier) && dismissedHeistSeq !== heistKey));

  // === MONOPOLY-GO HANDS-FREE AUTO-ROLL ENGINE ===
  // Automatically rolls & ends non-purchase turns while pausing for Buy/Auction/Heist/Mini-Games!
  useEffect(() => {
    if (!autoRoll || !state || !isMyTurn) return;
    if (
      state.phase === "AUCTION" ||
      state.phase === "HEIST" ||
      state.phase === "MINIGAME" ||
      state.phase === "GAME_OVER" ||
      showHeistModal || empireOpen || inspectedTileIndex !== null || dealSheet || historyOpen || rentPacing
    ) {
      return;
    }

    if (state.phase === "ROLL_READY" && (me?.inJailTurns ?? 0) === 0 && !rollCooldown) {
      const t = setTimeout(() => {
        handleRollDice();
      }, 650);
      return () => clearTimeout(t);
    }

    if (state.phase === "LANDED_DECISION" && state.pendingTileIndex === null) {
      const msSinceRoll = state.lastDice ? Date.now() - state.lastDice.rolledAt : 9999;
      const waitMs = Math.max(950, 2250 - msSinceRoll);
      const t = setTimeout(() => {
        dispatchSimsar({ type: "END_TURN" });
      }, waitMs);
      return () => clearTimeout(t);
    }
  }, [
    autoRoll,
    state,
    isMyTurn,
    me?.inJailTurns,
    rollCooldown,
    showHeistModal,
    empireOpen,
    inspectedTileIndex,
    dealSheet,
    historyOpen,
    rentPacing,
    handleRollDice,
    dispatchSimsar,
  ]);

  // === AUTOMATED HOST / SOLO BOT & AUCTION TIMER DRIVER ===
  const humanCount = useMemo(() => {
    if (!state) return 1;
    return Object.values(state.players).filter((p) => !p.isBot).length;
  }, [state]);

  const shouldDriveBots = isHost || humanCount <= 1;

  useEffect(() => {
    if (!state || !shouldDriveBots || state.phase === "GAME_OVER") return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    // 1. Finalize live auction once countdown expires
    if (state.phase === "AUCTION" && state.auction) {
      const msToEnd = Math.max(220, state.auction.endsAt - Date.now() + 280);
      timers.push(
        setTimeout(() => {
          onAction({ type: "FINALIZE_AUCTION" }, effectiveMyId);
        }, msToEnd)
      );
    }

    // 2. Check if any Moroccan Tycoon Bot has a move to make right now!
    const botDecision = chooseNextBotAction(state);
    if (botDecision && !rentPacing) {
      const msSinceRoll = state.lastDice ? Date.now() - state.lastDice.rolledAt : 9999;
      let delayMs = 1150;
      if (state.phase === "AUCTION") {
        delayMs = 900;
      } else if (state.phase === "HEIST") {
        delayMs = msSinceRoll < 1850 ? 1950 : 880;
      } else if (msSinceRoll < 2150) {
        // Let the 3D rigid-body dice bounce, Pixar car hops & flying coins play out!
        delayMs = Math.max(1300, 2280 - msSinceRoll);
      }

      timers.push(
        setTimeout(() => {
          onAction({ type: "BOT_STEP" }, effectiveMyId);
        }, delayMs)
      );
    }

    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, [
    state,
    shouldDriveBots,
    onAction,
    effectiveMyId,
    rentPacing,
  ]);

  if (!state) {
    return (
      <div className="flex items-center justify-center p-10 text-amber-300 font-black text-sm animate-pulse">
        جاري تحضير جزيرة سمسار رويال 3D... 🎲🏝️
      </div>
    );
  }

  const standings = sortSimsarStandings(Object.values(state.players));
  const leaderId = standings[0]?.id;
  const currentPlayer = state.players[state.currentPlayerId];

  const pendingTile =
    state.pendingTileIndex !== null ? SIMSAR_BOARD_TILES[state.pendingTileIndex] : null;

  const myOwnedIndices = SIMSAR_BOARD_TILES.filter(
    (t) => state.properties[t.index]?.ownerId === effectiveMyId
  ).map((t) => t.index);

  // Prefer an affordable upgrade on the city the player is standing on.
  const quickUpgradeTile: SimsarTileSpec | null = (() => {
    if (!me || !canBuild) {
      return null;
    }
    const candidates = myOwnedIndices
      .map((idx) => SIMSAR_BOARD_TILES[idx])
      .filter((t) => {
        const quote = getSimsarUpgradeQuote(t.index, state.properties, effectiveMyId);
        return quote && quote.cost <= me.cash && !hasSimsarUpgradedTileThisTurn(state, t.index);
      });
    if (candidates.length === 0) return null;
    const onCurrentPos = candidates.find((t) => t.index === me.position);
    return onCurrentPos || candidates[candidates.length - 1];
  })();
  const quickQuote = quickUpgradeTile && getSimsarUpgradeQuote(quickUpgradeTile.index, state.properties, effectiveMyId);

  const inspectedTile =
    inspectedTileIndex !== null ? SIMSAR_BOARD_TILES[inspectedTileIndex] : null;
  const inspectedProp =
    inspectedTileIndex !== null ? state.properties[inspectedTileIndex] : null;
  const inspectedQuote = inspectedTile && getSimsarUpgradeQuote(inspectedTile.index, state.properties, effectiveMyId);
  const inspectedOwner = inspectedProp?.ownerId ? state.players[inspectedProp.ownerId] : null;
  const openOffers = state.propertyOffers?.filter((offer) => offer.toPlayerId === effectiveMyId).length ?? 0;

  const toggleSound = () => {
    sound.isMuted = !isMuted;
    setIsMuted(!isMuted);
    if (isMuted) simsarSfx.playPopTap();
  };

  const handleCopyCode = async () => {
    if (!roomCode) return;
    simsarSfx.playPopTap();
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${roomCode}`);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {}
  };

  const topEvent = state.recentEvents[0];
  const eventToneCss =
    topEvent?.tone === "EMERALD"
      ? "from-emerald-950/90 to-slate-950/90 border-emerald-400/55 text-emerald-100"
      : topEvent?.tone === "ROSE"
      ? "from-rose-950/90 to-slate-950/90 border-rose-400/55 text-rose-100"
      : topEvent?.tone === "PURPLE"
      ? "from-purple-950/90 to-slate-950/90 border-purple-400/55 text-purple-100"
      : topEvent?.tone === "CYAN"
      ? "from-cyan-950/90 to-slate-950/90 border-cyan-400/55 text-cyan-100"
      : "from-amber-950/90 to-slate-950/90 border-amber-400/60 text-amber-100";

  const gameScreen = (
    <div
      dir="rtl"
      className={
        isImmersive
          ? "fixed inset-0 z-50 h-[100dvh] w-full flex flex-col justify-between bg-slate-950 text-white select-none overflow-hidden"
          : "relative w-full h-[84dvh] min-h-[560px] rounded-3xl border border-amber-400/30 flex flex-col justify-between bg-slate-950 text-white select-none overflow-hidden shadow-2xl"
      }
    >
      {/* =====================================================================
          ZONE 1 (~10%): PORTRAIT TOP TYCOON STRIP (Zero Horizontal Overflow!)
      ===================================================================== */}
      <header className="shrink-0 z-20 px-2.5 pt-[max(0.45rem,env(safe-area-inset-top))] pb-1.5 bg-gradient-to-b from-slate-950 via-slate-900/95 to-slate-950/85 border-b border-amber-400/20">
        {/* Row 1: Round + Gardiennage Jackpot + Compact Utility Controls */}
        <div className="flex items-center justify-between gap-1.5 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="px-2 py-1 rounded-xl bg-slate-900 border border-amber-400/35 flex items-center gap-1 shrink-0">
              <span className="text-[11px] font-black text-amber-300">
                دورة {state.round}/{state.maxRounds}
              </span>
            </div>

            <div
              className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500/25 to-yellow-600/15 border border-amber-400/50 flex items-center gap-1 shrink-0 shadow-sm"
              title="صندوقة پلاصة الكارديان الوسط"
            >
              <span className="text-xs">🦺</span>
              <span dir="ltr" className="text-[11px] font-black text-amber-200 tabular-nums whitespace-nowrap">
                <AnimatedNumber value={state.gardiennagePot} /> DH
              </span>
            </div>

            {roomCode && (
              <button
                onClick={handleCopyCode}
                className="hidden xs:flex sm:flex px-2 py-1 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-white/10 items-center gap-1 text-[10px] font-bold text-slate-300 active:scale-95 transition-all"
                title="نسخ رابط الغرفة لصحابك"
              >
                <Copy className="w-3 h-3 text-amber-400" />
                <span>{copiedCode ? "تنسخ!" : roomCode}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {me && (
              <button
                onClick={() => {
                  simsarSfx.playPopTap();
                  setTokenModalOpen(true);
                }}
                className="w-8 h-8 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/15 flex items-center justify-center text-sm active:scale-95 transition-all"
                title="تبديل الطوموبيل 3D ديالك"
              >
                {SIMSAR_TOKENS[me.token]?.emoji || "🚕"}
              </button>
            )}

            <button
              onClick={() => {
                simsarSfx.playPopTap();
                setEmpireOpen(true);
              }}
              className="h-8 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-emerald-400/35 flex items-center gap-1 text-[11px] font-black text-emerald-300 active:scale-95 transition-all"
              title="عقاراتي والمدن"
              aria-label="عقاراتي والمدن"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">عقاراتي</span>
              <span className="tabular-nums">{myOwnedIndices.length}</span>
            </button>

            {humanCount > 1 && me && !me.isBankrupt && state.phase !== "GAME_OVER" && (
              <button
                onClick={() => setDealSheet({ tileIndex: null })}
                title="صفقات العقار"
                aria-label={openOffers ? `صفقات العقار، عندك ${openOffers} عروض` : "صفقات العقار"}
                className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-amber-400/35 bg-slate-900 text-amber-200"
              >
                <Handshake className="h-4 w-4" />
                {openOffers > 0 && (
                  <span className="absolute -left-1 -top-1 rounded-full bg-amber-300 px-1 text-[10px] font-black leading-4 text-slate-950">{openOffers}</span>
                )}
              </button>
            )}

            <button
              onClick={() => {
                simsarSfx.playPopTap();
                setSettingsModalOpen(true);
              }}
              className="w-8 h-8 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/15 flex items-center justify-center text-slate-200 active:scale-95 transition-all"
              title="إعدادات وقواعد اللعبة"
            >
              <Settings2 className="w-3.5 h-3.5 text-amber-300" />
            </button>

            <button
              onClick={toggleSound}
              className="w-8 h-8 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/15 flex items-center justify-center text-slate-200 active:scale-95 transition-all"
              title={isMuted ? "تشغيل الصوت" : "كتم الصوت"}
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-amber-300" />
              )}
            </button>

            <button
              onClick={() => {
                simsarSfx.playPopTap();
                setIsImmersive((v) => !v);
              }}
              className="w-8 h-8 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/15 flex items-center justify-center text-slate-200 active:scale-95 transition-all"
              title={isImmersive ? "إظهار شريط الغرفة و QR" : "ملء الشاشة"}
            >
              {isImmersive ? (
                <Minimize2 className="w-3.5 h-3.5 text-slate-300" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5 text-amber-300" />
              )}
            </button>
          </div>
        </div>

        {/* Row 2: Compact Tycoon Pills (Fits 4 players edge-to-edge on 360px!) */}
        <div
          className={
            state.turnOrder.length <= 4
              ? "grid grid-cols-4 gap-1"
              : "flex items-center gap-1 overflow-x-auto pb-0.5"
          }
        >
          {state.turnOrder.map((pid) => {
            const p = state.players[pid];
            if (!p) return null;
            const isTurn = pid === state.currentPlayerId && state.phase !== "GAME_OVER";
            const isMe = pid === effectiveMyId;
            const isLeader = pid === leaderId && !p.isBankrupt;
            const tok = SIMSAR_TOKENS[p.token];

            return (
              <div
                key={pid}
                className={`relative px-1.5 py-1 rounded-xl border transition-all min-w-[76px] ${
                  p.isBankrupt
                    ? "bg-slate-950/60 border-rose-900/40 opacity-50"
                    : isTurn
                    ? "bg-gradient-to-b from-amber-500/25 to-slate-900 border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]"
                    : isMe
                    ? "bg-slate-900/95 border-emerald-400/45"
                    : "bg-slate-900/75 border-white/10"
                }`}
              >
                <div className="flex items-center justify-between gap-0.5">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-xs shrink-0">{tok?.emoji || "🚕"}</span>
                    <span className="text-[10px] font-black text-white truncate">
                      {p.nickname}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {isLeader && <span className="text-[10px]">👑</span>}
                    {p.shields > 0 && <span className="text-[10px]">🛡️</span>}
                    {p.inJailTurns > 0 && <span className="text-[10px]">🔒</span>}
                    {p.isBankrupt && <span className="text-[10px]">💀</span>}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <span
                    dir="ltr"
                    className={`text-[10px] font-black tabular-nums whitespace-nowrap leading-none ${
                      p.cash < 120 ? "text-rose-300" : "text-emerald-300"
                    }`}
                  >
                    <AnimatedNumber value={p.cash} />{" "}
                    <span className="text-[8px] opacity-85">DH</span>
                  </span>
                  <span
                    dir="ltr"
                    title="قيمة الإمبراطورية"
                    aria-label={`قيمة الإمبراطورية ${p.netWorth} DH`}
                    className="flex items-center gap-0.5 text-[8.5px] font-bold text-amber-200/90 tabular-nums whitespace-nowrap leading-none"
                  >
                    <Trophy className="h-2.5 w-2.5" aria-hidden="true" />
                    <AnimatedNumber value={p.netWorth} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Shared-Phone Local Switcher (Only when 2+ humans share ONE phone during simultaneous Auction/MiniGame) */}
        {sharedPhonePlayerIds.length > 1 &&
          (state.phase === "AUCTION" || state.phase === "MINIGAME") &&
          devicePlayers && (
            <div className="mt-1.5 pt-1 border-t border-white/10 flex items-center gap-1 overflow-x-auto">
              <span className="text-[10px] font-bold text-amber-300 shrink-0">شكون كيلعب دابا:</span>
              {devicePlayers.map((dp) => {
                const active = dp.id === effectiveMyId;
                return (
                  <button
                    key={dp.id}
                    onClick={() => onSelectPlayer?.(dp.id)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 border transition-all ${
                      active
                        ? "bg-amber-400 text-slate-950 border-amber-300"
                        : "bg-slate-900 text-slate-300 border-white/15"
                    }`}
                  >
                    {dp.nickname}
                  </button>
                );
              })}
            </div>
          )}
      </header>

      {/* =====================================================================
          ZONE 2 (~62%): 60 FPS 3D MOROCCO ISLAND VIEWPORT + FLOATING HUD PILLS
      ===================================================================== */}
      <div className="flex-1 relative min-h-0 w-full overflow-hidden">
        <Simsar3DBoardCanvas
          propertyEvents={state.recentEvents}
          propertyBoardCovered={empireOpen || inspectedTileIndex !== null || Boolean(dealSheet) || historyOpen}
          players={state.players}
          properties={state.properties}
          currentPlayerId={state.currentPlayerId}
          gardiennagePot={state.gardiennagePot}
          lastDice={state.lastDice}
          cameraMode={cameraMode}
          selectedTileIndex={inspectedTileIndex ?? state.pendingTileIndex ?? visibleReceipt?.tileIndex ?? null}
          onLand={onLand}
          onSelectTile={(idx) => {
            simsarSfx.playPopTap();
            setInspectedTileIndex((prev) => (prev === idx ? null : idx));
          }}
        />

        {/* Floating Live Event Banner (Top of 3D Viewport — Spring Physics!) */}
        <div className="pointer-events-none absolute top-2 inset-x-2.5 z-10 flex justify-center">
          <AnimatePresence mode="popLayout">
            {topEvent && !topEvent.rent && (
              <motion.div
                key={topEvent.id}
                initial={{ opacity: 0, y: -26, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -18, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
                className={`max-w-md w-full px-3 py-1.5 rounded-2xl bg-gradient-to-r ${eventToneCss} border backdrop-blur-md shadow-xl flex items-center gap-2`}
              >
                <span className="text-lg shrink-0">{topEvent.emoji}</span>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-xs font-black truncate">{topEvent.titleAr}</div>
                  <div className="text-[10px] font-semibold opacity-85 truncate">
                    {topEvent.subtitleAr}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="pointer-events-none absolute inset-x-3 bottom-12 z-20 flex justify-center">
          <AnimatePresence>
            {visibleReceipt && state.phase !== "GAME_OVER" && (
              <SimsarRentReceipt key={visibleReceipt.id} receipt={visibleReceipt} players={state.players} myId={effectiveMyId} />
            )}
          </AnimatePresence>
        </div>

        {/* Bottom-Left Floating Last Dice Pill */}
        <AnimatePresence mode="popLayout">
          {state.lastDice && (
            <motion.div
              key={state.lastDice.rollSeq}
              initial={{ opacity: 0, scale: 0.72, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 460, damping: 22 }}
              className="pointer-events-none absolute bottom-2.5 left-2.5 z-10"
            >
              <div className="px-2.5 py-1 rounded-xl bg-slate-950/85 border border-amber-400/45 backdrop-blur-md shadow-lg flex items-center gap-1.5 text-xs font-black">
                <span>🎲</span>
                <span className="text-white tabular-nums">
                  {state.lastDice.die1} + {state.lastDice.die2} ={" "}
                  <strong className="text-amber-300">{state.lastDice.total}</strong>
                </span>
                {state.lastDice.multiplier === 2 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-orange-500 text-slate-950 text-[10px] font-black">
                    x2⚡
                  </span>
                )}
                {state.lastDice.isDoubles && (
                  <span className="px-1.5 py-0.5 rounded-md bg-cyan-400/20 border border-cyan-400/50 text-cyan-200 text-[10px] font-black">
                    ضوبل!
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom-Right Floating Camera Mode Toggle */}
        <div className="absolute bottom-2.5 right-2.5 z-10 flex items-center gap-1.5">
          <button
            onClick={() => setHistoryOpen(true)}
            title="آش وقع فالماتش؟"
            aria-label="آش وقع فالماتش؟"
            className="rounded-xl border border-white/20 bg-slate-950/90 p-2.5 text-amber-200 shadow-lg"
          >
            <History className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              simsarSfx.playPopTap();
              setCameraMode((m) => (m === "AUTO" ? "OVERVIEW" : "AUTO"));
            }}
            className="px-2.5 py-1.5 rounded-xl bg-slate-950/85 hover:bg-slate-900 border border-white/20 backdrop-blur-md shadow-lg flex items-center gap-1 text-[11px] font-black text-amber-200 active:scale-95 transition-all"
          >
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span>{cameraMode === "AUTO" ? "كاميرا ذكية" : "نظرة شاملة"}</span>
          </button>
        </div>

        {/* Floating Tap-to-Inspect 3D Tile Deed Popover */}
        <AnimatePresence>
          {inspectedTile && (
            <motion.div
              key={inspectedTile.index}
              initial={{ opacity: 0, y: 24, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 430, damping: 28 }}
              className="absolute inset-x-3 bottom-12 z-20 flex justify-center"
            >
              <div className="w-full max-w-sm rounded-2xl bg-slate-950/95 border border-amber-400/45 backdrop-blur-xl shadow-2xl overflow-hidden">
              <div
                className="px-3 py-2 flex items-center justify-between"
                style={{
                  background: `linear-gradient(90deg, ${inspectedTile.colorHex}44, rgba(15,23,42,0.95))`,
                  borderBottom: `2px solid ${inspectedTile.colorHex}`,
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl">{inspectedTile.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-black text-white truncate">
                      {inspectedTile.nameAr}
                    </div>
                    <div className="text-[10px] font-bold text-slate-300">
                      {inspectedTile.group
                        ? COLOR_GROUP_META[inspectedTile.group].nameAr
                        : "خانة خاصة فـ الجزيرة"}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setInspectedTileIndex(null)}
                  className="w-7 h-7 rounded-full bg-black/40 hover:bg-black/70 flex items-center justify-center text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 space-y-2 text-xs">
                {inspectedTile.kind === "CITY" || inspectedTile.kind === "UTILITY" ? (
                  <>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-bold">المالك دابا:</span>
                      {inspectedProp?.ownerId ? (
                        <span className="font-black text-amber-300">
                          {state.players[inspectedProp.ownerId]?.nickname || "سمسار"}
                          {inspectedProp.isMortgaged ? " (مرهونة 🏦)" : ""}
                        </span>
                      ) : (
                        <span className="font-black text-emerald-300">
                          متاحة للبيع بـ {inspectedTile.price} DH!
                        </span>
                      )}
                    </div>

                    {inspectedTile.kind === "CITY" && inspectedTile.rents && (
                      <div className="grid grid-cols-4 gap-1 text-center">
                        {(
                          [
                            { lvl: 0, label: "بقعة" },
                            { lvl: 1, label: "قهوة ☕" },
                            { lvl: 2, label: "رياض 🕌" },
                            { lvl: 3, label: "أوطيل 👑" },
                          ] as const
                        ).map((tier) => {
                          const isCur =
                            Boolean(inspectedProp?.ownerId) && inspectedProp?.level === tier.lvl;
                          return (
                            <div
                              key={tier.lvl}
                              className={`p-1.5 rounded-xl border ${
                                isCur
                                  ? "bg-amber-500/25 border-amber-400 text-amber-200"
                                  : "bg-slate-900/90 border-white/10 text-slate-300"
                              }`}
                            >
                              <div className="text-[9px] font-bold opacity-80">{tier.label}</div>
                              <div className="text-[11px] font-black tabular-nums">
                                {inspectedTile.rents![tier.lvl]} DH
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {inspectedTile.kind === "UTILITY" && (
                      <div className="p-2 rounded-xl bg-cyan-950/40 border border-cyan-400/30 text-[11px] text-cyan-200 font-semibold">
                        ⚡ الكرا كيتحسب بمجموع النرد: <strong>x11</strong> لمرفق واحد، و{" "}
                        <strong>x22</strong> يلا ملكتي البراق ولارام بجوج!
                      </div>
                    )}

                    {inspectedProp?.ownerId &&
                      inspectedTile.group &&
                      ownsFullColorSet(
                        inspectedProp.ownerId,
                        inspectedTile.group,
                        state.properties
                      ) && (
                        <div className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-[10px] font-black text-amber-200 text-center">
                          🔥 احتكار اللون كامل مفعل (الكرا مضروب فـ x2 فالبقعة!)
                        </div>
                      )}

                    {/* Direct 1-Tap Owner Actions right inside Inspect Card */}
                    {inspectedProp?.ownerId === effectiveMyId &&
                      isMyTurn &&
                      isSimsarPropertyPhase(state.phase) && (
                        <div className="flex items-center gap-2 pt-1">
                          {inspectedQuote && canBuild && !hasSimsarUpgradedTileThisTurn(state, inspectedTile.index) && (
                              <button
                                disabled={(me?.cash ?? 0) < inspectedQuote.cost}
                                onClick={() => {
                                  dispatchSimsar({
                                    type: "UPGRADE_PROPERTY",
                                    tileIndex: inspectedTile.index,
                                  });
                                  setInspectedTileIndex(null);
                                }}
                                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-black text-xs disabled:opacity-45 active:scale-95 transition-all"
                              >
                                🏗️ {BUILDING_TIER_NAMES_AR[inspectedQuote.nextLevel]} · {inspectedQuote.cost} DH
                                <span className="block text-[10px]">الكرا <bdi>{inspectedQuote.currentRent} → {inspectedQuote.nextRent} DH</bdi></span>
                              </button>
                            )}

                          {state.phase !== "LANDED_DECISION" ? null : !inspectedProp.isMortgaged ? (
                            <button
                              onClick={() => {
                                simsarSfx.playCashGain();
                                dispatchSimsar({
                                  type: "MORTGAGE_PROPERTY",
                                  tileIndex: inspectedTile.index,
                                });
                                setInspectedTileIndex(null);
                              }}
                              className="py-2 px-3 rounded-xl bg-slate-800 border border-white/15 text-slate-200 font-bold text-[11px] active:scale-95 transition-all"
                            >
                              🏦 رهن (+
                              {Math.round((inspectedTile.price || 0) * 0.5) +
                                inspectedProp.level *
                                  Math.round((inspectedTile.upgradeCost || 0) * 0.5)}{" "}
                              DH)
                            </button>
                          ) : (
                            <button
                              disabled={
                                (me?.cash ?? 0) < Math.round((inspectedTile.price || 0) * 0.55)
                              }
                              onClick={() => {
                                simsarSfx.playPopTap();
                                dispatchSimsar({
                                  type: "UNMORTGAGE_PROPERTY",
                                  tileIndex: inspectedTile.index,
                                });
                                setInspectedTileIndex(null);
                              }}
                              className="flex-1 py-2 rounded-xl bg-emerald-600 text-white font-black text-xs disabled:opacity-45 active:scale-95 transition-all"
                            >
                              🔓 فك الرهن (-{Math.round((inspectedTile.price || 0) * 0.55)} DH)
                            </button>
                          )}
                        </div>
                      )}
                    {me && !me.isBankrupt && inspectedOwner && inspectedOwner.id !== effectiveMyId &&
                      !inspectedOwner.isBot && !inspectedOwner.isBankrupt && !inspectedProp?.isMortgaged &&
                      isSimsarPropertyPhase(state.phase) && (
                        <button
                          onClick={() => setDealSheet({ tileIndex: inspectedTile.index })}
                          className="rounded-xl bg-amber-400/15 px-3 py-2 text-xs font-black text-amber-200"
                        >
                          🤝 دير عرض على هاد العقار
                        </button>
                      )}
                  </>
                ) : (
                  <p className="text-[11px] text-slate-200 leading-relaxed font-semibold">
                    {SPECIAL_TILE_DESC_AR[inspectedTile.kind]}
                  </p>
                )}
              </div>
            </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* =====================================================================
          ZONE 3 (~28%): SINGLE-THUMB CONTEXT ACTION DOCK (Bottom Ergonomic Zone!)
      ===================================================================== */}
      <footer className="shrink-0 z-20 px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-slate-950 via-slate-900/98 to-slate-900/95 border-t border-amber-400/25 shadow-[0_-12px_35px_rgba(0,0,0,0.7)]">
        {/* CASE A: LIVE ALL-PLAYERS ROOM AUCTION PADDLE */}
        {state.phase === "AUCTION" && state.auction ? (
          (() => {
            const auc = state.auction;
            const aucTile = SIMSAR_BOARD_TILES[auc.tileIndex];
            const secLeft = Math.max(0, Math.ceil((auc.endsAt - nowTick) / 1000));
            const highestBidder = auc.highestBidderId
              ? state.players[auc.highestBidderId]
              : null;
            const hasPassed = auc.passedPlayerIds.includes(effectiveMyId);
            const amHighest = auc.highestBidderId === effectiveMyId;
            const myCash = me?.cash ?? 0;

            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-base shrink-0">
                      {aucTile?.emoji || "🔨"}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-amber-300 truncate">
                        🔨 دلالة علنية: {aucTile?.nameAr}
                      </div>
                      <div className="text-[10px] font-bold text-slate-300 truncate">
                        الثمن الأصلي {aucTile?.price} DH •{" "}
                        {highestBidder
                          ? `أعلى عرض: ${highestBidder.nickname}`
                          : "مازال حتى واحد ما زايد!"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 font-black text-sm tabular-nums">
                      {auc.currentBid} DH
                    </div>
                    <div
                      className={`px-2 py-1 rounded-xl border font-black text-xs tabular-nums ${
                        secLeft <= 3
                          ? "bg-rose-600/35 border-rose-400 text-rose-200 animate-pulse"
                          : "bg-slate-800 border-white/15 text-amber-300"
                      }`}
                    >
                      ⏱️ {secLeft}s
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {[20, 50, 100].map((delta) => {
                    const nextAmount = auc.currentBid + delta;
                    const canAfford = Boolean(me && !me.isBankrupt && myCash >= nextAmount);
                    return (
                      <button
                        key={delta}
                        disabled={!canAfford || amHighest}
                        onClick={() => {
                          simsarSfx.playPopTap();
                          dispatchSimsar({ type: "PLACE_BID", amountDelta: delta });
                        }}
                        className="py-3 rounded-2xl bg-gradient-to-b from-amber-400 to-amber-600 text-slate-950 font-black text-xs shadow-md active:scale-95 transition-all disabled:opacity-35 disabled:grayscale"
                      >
                        +{delta} DH
                        <span className="block text-[9px] font-bold opacity-80 tabular-nums">
                          ({nextAmount})
                        </span>
                      </button>
                    );
                  })}

                  <button
                    disabled={hasPassed || amHighest}
                    onClick={() => {
                      simsarSfx.playPopTap();
                      dispatchSimsar({ type: "PASS_AUCTION" });
                    }}
                    className={`py-3 rounded-2xl border font-black text-xs active:scale-95 transition-all ${
                      amHighest
                        ? "bg-emerald-950/70 border-emerald-400/50 text-emerald-200"
                        : hasPassed
                        ? "bg-slate-900 border-white/10 text-slate-500"
                        : "bg-slate-800 hover:bg-slate-700 border-rose-400/40 text-rose-200"
                    }`}
                  >
                    {amHighest ? "👑 رابح دابا" : hasPassed ? "منسحب ✓" : "✋ انسحب"}
                  </button>
                </div>
              </div>
            );
          })()
        ) : /* CASE B: MY TURN TO ROLL THE 3D DICE! */ isMyTurn &&
          state.phase === "ROLL_READY" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-1.5">
              {/* x1 / x2 High-Roller Multiplier Chip */}
              <button
                disabled={(me?.cash ?? 0) < 500}
                onClick={() => {
                  simsarSfx.playPopTap();
                  setRollMultiplier((m) => (m === 1 ? 2 : 1));
                }}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-black flex items-center gap-1 transition-all active:scale-95 ${
                  rollMultiplier === 2
                    ? "bg-gradient-to-r from-orange-500 to-rose-600 border-amber-300 text-white shadow-lg shadow-orange-500/25"
                    : (me?.cash ?? 0) >= 500
                    ? "bg-slate-800 border-amber-400/40 text-amber-200"
                    : "bg-slate-900 border-white/10 text-slate-500"
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>
                  {rollMultiplier === 2
                    ? "مضاعف x2 🔥"
                    : (me?.cash ?? 0) >= 500
                    ? "مضاعف x1"
                    : "x2 (+500)"}
                </span>
              </button>

              <div className="flex items-center gap-1.5">
                {me && me.inJailTurns > 0 && (
                  <button
                    disabled={me.cash < JAIL_BAIL_DH}
                    onClick={() => {
                      simsarSfx.playCashGain();
                      dispatchSimsar({ type: "PAY_JAIL_BAIL" });
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 border border-cyan-300/60 text-white font-black text-[11px] flex items-center gap-1 active:scale-95 transition-all disabled:opacity-40"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>كفالة {JAIL_BAIL_DH} DH</span>
                  </button>
                )}

                {quickQuote && (
                  <button
                    onClick={() => setEmpireOpen(true)}
                    className="flex items-center gap-1 rounded-xl border border-amber-300/40 bg-amber-400/15 px-2.5 py-1.5 text-[11px] font-black text-amber-100 active:scale-95"
                  >
                    <Building2 className="h-3.5 w-3.5" /> طوّر عقار
                  </button>
                )}

                {/* Auto-Roll Toggle */}
                <button
                  onClick={() => {
                    simsarSfx.playPopTap();
                    setAutoRoll((v) => !v);
                  }}
                  className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all ${
                    autoRoll
                      ? "bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                      : "bg-slate-800 border-white/15 text-slate-300"
                  }`}
                  title="رمي النرد تلقائياً (كيوقف ملي تلقى عقار للشراء!)"
                >
                  <Repeat className={`w-3.5 h-3.5 ${autoRoll ? "animate-spin text-emerald-300" : ""}`} />
                  <span>{autoRoll ? "أوتو ✓" : "أوتو"}</span>
                </button>

                <button
                  onClick={() => {
                    simsarSfx.playPopTap();
                    setReactionsOpen((v) => !v);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-white/15 text-amber-200 text-[11px] font-black flex items-center gap-1 active:scale-95"
                >
                  <Smile className="w-3.5 h-3.5" />
                  <span>ميمز</span>
                </button>
              </div>
            </div>

            {reactionsOpen && (
              <div className="grid grid-cols-6 gap-1 pb-0.5 animate-fadeIn">
                {SIMSAR_REACTION_ORDER.map((rid) => {
                  const r = SIMSAR_REACTIONS[rid];
                  return (
                    <button
                      key={rid}
                      onClick={() => {
                        simsarSfx.playPopTap();
                        dispatchSimsar({ type: "SEND_REACTION", reactionId: rid });
                        setReactionsOpen(false);
                      }}
                      className="py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 flex flex-col items-center justify-center active:scale-90 transition-all"
                    >
                      <span className="text-base">{r.emoji}</span>
                      <span className="text-[8px] font-bold text-slate-300 truncate max-w-full px-0.5">
                        {r.textAr.split(" ")[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* GIANT ONE-THUMB 3D ROLL DICE HERO BUTTON WITH SHIMMER */}
            <motion.button
              whileTap={{ scale: 0.96, y: 3 }}
              onClick={handleRollDice}
              disabled={rollCooldown}
              className="relative overflow-hidden w-full py-4 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-500 text-slate-950 font-black text-lg sm:text-xl shadow-[0_5px_0_#b45309,0_10px_25px_rgba(245,158,11,0.45)] flex items-center justify-center gap-2.5 touch-manipulation"
            >
              <motion.span
                aria-hidden
                initial={{ x: "-130%" }}
                animate={{ x: "230%" }}
                transition={{ repeat: Infinity, repeatDelay: 1.8, duration: 1.25, ease: "easeInOut" }}
                className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent skew-x-[-20deg]"
              />
              <span className="text-2xl relative z-10">🎲</span>
              <span className="relative z-10">
                {me && me.inJailTurns > 0
                  ? "لوح النرد (جيب الضوبل باش تخرج!)"
                  : autoRoll
                  ? "كيلوح أوتو... (برك للرمي دابا!)"
                  : `لوح النرد دابا! ${rollMultiplier === 2 ? "⚡x2" : ""}`}
              </span>
            </motion.button>
          </div>
        ) : /* CASE C: MY TURN — LANDED ON UNOWNED CITY / UTILITY (BUY OR AUCTION!) */ isMyTurn &&
          state.phase === "LANDED_DECISION" &&
          pendingTile ? (
          (() => {
            const price = pendingTile.price || 120;
            const canBuy = (me?.cash ?? 0) >= price;
            const completesSet = (() => {
              if (!pendingTile.group) return false;
              const groupIndices = getGroupTileIndices(pendingTile.group);
              const others = groupIndices.filter((i) => i !== pendingTile.index);
              return (
                others.length > 0 &&
                others.every((i) => state.properties[i]?.ownerId === effectiveMyId)
              );
            })();

            return (
              <div className="space-y-2">
                <div
                  className="px-3 py-2 rounded-2xl border flex items-center justify-between gap-2"
                  style={{
                    background: `linear-gradient(90deg, ${pendingTile.colorHex}33, rgba(15,23,42,0.95))`,
                    borderColor: `${pendingTile.colorHex}99`,
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-2xl shrink-0">{pendingTile.emoji}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-white truncate">
                          {pendingTile.nameAr}
                        </span>
                        {completesSet && (
                          <span className="px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[9px] font-black shrink-0">
                            يكمل اللون x2 🔥
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-bold text-slate-300">
                        {pendingTile.rents
                          ? `الكرا: ${pendingTile.rents[0]} DH ⬅️ أوطيل: ${pendingTile.rents[3]} DH`
                          : "مرفق استراتيجي: الكرا حسب مجموع النرد!"}
                      </div>
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-sm font-black text-amber-300 tabular-nums">
                      {price} DH
                    </div>
                    <div className="text-[9px] font-bold text-slate-400">ثمن الأرض</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={!canBuy}
                    onClick={() => {
                      simsarSfx.playCashGain();
                      dispatchSimsar({ type: "BUY_PROPERTY" });
                    }}
                    className="py-3.5 px-3 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950 font-black text-sm shadow-[0_4px_0_#065f46] active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:grayscale"
                  >
                    <Coins className="w-4 h-4" />
                    <span>{canBuy ? `شري (${price} DH)` : `خاصك ${price} DH`}</span>
                  </button>

                  <button
                    onClick={() => {
                      simsarSfx.playPopTap();
                      dispatchSimsar({ type: "START_AUCTION" });
                    }}
                    className="py-3.5 px-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 font-black text-sm shadow-[0_4px_0_#9a3412] active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Gavel className="w-4 h-4" />
                    <span>دلالة علنية 🔨</span>
                  </button>
                </div>
              </div>
            );
          })()
        ) : /* CASE D: MY TURN — UPGRADE OR END TURN */ isMyTurn &&
          state.phase === "LANDED_DECISION" ? (
          <div className="space-y-2">
            {quickUpgradeTile && quickQuote && (
              <button
                onClick={() => {
                  dispatchSimsar({
                    type: "UPGRADE_PROPERTY",
                    tileIndex: quickUpgradeTile.index,
                  });
                }}
                className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-amber-500/25 to-orange-500/20 hover:from-amber-500/35 hover:to-orange-500/30 border border-amber-400/60 text-amber-200 font-black text-xs flex items-center justify-between active:scale-98 transition-all"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span>🏗️</span>
                  <span className="truncate">
                    بني{" "}
                    {BUILDING_TIER_NAMES_AR[quickQuote.nextLevel]}{" "}
                    فـ {quickUpgradeTile.shortAr}
                    <span className="block text-[10px] text-amber-100/80">الكرا <bdi>{quickQuote.currentRent} → {quickQuote.nextRent} DH</bdi></span>
                  </span>
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-amber-400 text-slate-950 font-black text-[11px] shrink-0 tabular-nums">
                  {quickQuote.cost} DH
                </span>
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  simsarSfx.playPopTap();
                  setEmpireOpen(true);
                }}
                className="py-3.5 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-white/15 text-slate-100 font-black text-xs flex items-center gap-1.5 shrink-0 active:scale-95 transition-all"
              >
                <Building2 className="w-4 h-4 text-emerald-400" />
                <span>عقاراتي ({myOwnedIndices.length})</span>
              </button>

              {autoRoll && (
                <button
                  onClick={() => {
                    simsarSfx.playPopTap();
                    setAutoRoll(false);
                  }}
                  className="py-3.5 px-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-400/60 text-emerald-200 font-black text-[11px] flex items-center gap-1 shrink-0 active:scale-95"
                  title="إيقاف الرمي التلقائي"
                >
                  <Repeat className="w-3.5 h-3.5 animate-spin" />
                  <span>حبس أوتو</span>
                </button>
              )}

              <button
                onClick={() => {
                  simsarSfx.playPopTap();
                  dispatchSimsar({ type: "END_TURN" });
                }}
                disabled={rentPacing}
                className="flex-1 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-500 text-slate-950 font-black text-base shadow-[0_4px_0_#0f766e] active:translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Check className="w-5 h-5 stroke-[3]" />
                <span>
                  {rentPacing ? "لحظة، الكرا كيدوز…" : state.extraRollGranted
                    ? "ارمي الضوبل الإضافي! 🎲🔥"
                    : "ساليت نوبتي (التالي)"}
                </span>
              </button>
            </div>
          </div>
        ) : (
          /* CASE E: SPECTATING ANOTHER PLAYER / BOT TURN — ENGAGING MEME REACTIONS + EMPIRE */
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-sm animate-bounce shrink-0">
                  {currentPlayer ? SIMSAR_TOKENS[currentPlayer.token]?.emoji : "🎲"}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-black text-amber-200 truncate">
                    نوبة {currentPlayer?.nickname || "السمسار"}...
                  </div>
                  <div className="text-[10px] font-semibold text-slate-400 truncate">
                    {state.phase === "HEIST"
                      ? "كيهجم على الخزنة فـ سطو الطاجين! 🥷"
                      : state.pendingTileIndex !== null
                      ? `كيفكر فـ ${SIMSAR_BOARD_TILES[state.pendingTileIndex]?.shortAr}...`
                      : "كيلوح النرد وكيتحرك فالجزيرة..."}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  simsarSfx.playPopTap();
                  setEmpireOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800 border border-emerald-400/35 text-emerald-300 text-[11px] font-black flex items-center gap-1 shrink-0 active:scale-95"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>عقاراتي ({myOwnedIndices.length})</span>
              </button>
            </div>

            {/* 1-Tap Darija Meme Reactions Bar */}
            <div className="grid grid-cols-6 gap-1">
              {SIMSAR_REACTION_ORDER.map((rid) => {
                const r = SIMSAR_REACTIONS[rid];
                return (
                  <button
                    key={rid}
                    onClick={() => {
                      simsarSfx.playPopTap();
                      dispatchSimsar({ type: "SEND_REACTION", reactionId: rid });
                    }}
                    className="py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-white/10 flex flex-col items-center justify-center active:scale-90 transition-all"
                    title={r.textAr}
                  >
                    <span className="text-base leading-none">{r.emoji}</span>
                    <span className="text-[8px] font-bold text-slate-300 mt-0.5 truncate max-w-full px-0.5">
                      {r.textAr.split(" ")[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </footer>

      {/* =====================================================================
          OVERLAY 1: 9-TAJINE ROYAL BANK HEIST MODAL
      ===================================================================== */}
      {showHeistModal && state.heist && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl bg-gradient-to-b from-slate-900 via-slate-950 to-purple-950/80 border border-amber-400/50 p-4 shadow-2xl">
            {(() => {
              const h = state.heist!;
              const raider = state.players[h.raiderId];
              const victim = state.players[h.victimId];
              const amRaider = h.raiderId === effectiveMyId;

              return (
                <>
                  <div className="text-center mb-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/25 border border-purple-400/50 text-purple-200 text-[11px] font-black mb-1.5">
                      <span>🥷 سطو الطاجين الملكي</span>
                    </span>
                    <h3 className="text-lg font-black text-white">
                      {amRaider
                        ? `اهجم على خزنة ${victim?.nickname || "السمسار"}!`
                        : `${raider?.nickname} كيسرق خزنة ${victim?.nickname}!`}
                    </h3>
                    <p className="text-[11px] text-slate-300 font-semibold mt-0.5">
                      {h.resolvedTier
                        ? `تم السطو! ربحتي ${h.stolenAmount} DH كاش!`
                        : amRaider
                        ? "برك على الطواجن باش تلقى 3 رموز متشابهة!"
                        : "تفرج فالطواجن كيتحلو مباشرة!"}
                    </p>
                  </div>

                  {/* Loot Tiers Legend */}
                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    {(["SILVER", "GOLD", "DIAMOND"] as SimsarHeistSymbol[]).map((sym) => {
                      const meta = HEIST_SYMBOL_META[sym];
                      const isWon = h.resolvedTier === sym;
                      return (
                        <div
                          key={sym}
                          className={`px-2 py-1.5 rounded-xl border bg-gradient-to-b text-center ${
                            meta.pillCss
                          } ${isWon ? "ring-2 ring-amber-300 scale-105" : "opacity-85"}`}
                        >
                          <div className="text-xs font-black">
                            {meta.emoji} {meta.labelAr}
                          </div>
                          <div className="text-[10px] font-black tabular-nums">
                            {meta.rewardDh} DH
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 3x3 Ornate Moroccan Tajine Grid */}
                  <div className="grid grid-cols-3 gap-2.5 mb-3">
                    {h.boxes.map((sym, idx) => {
                      const isOpen = h.revealedIndices.includes(idx) || Boolean(h.resolvedTier);
                      const wasPicked = h.revealedIndices.includes(idx);
                      const meta = HEIST_SYMBOL_META[sym];

                      return (
                        <motion.button
                          key={idx}
                          whileTap={!isOpen && amRaider ? { scale: 0.88 } : undefined}
                          animate={
                            wasPicked
                              ? { rotateY: [90, 0], scale: [0.85, 1.06, 1] }
                              : { rotateY: 0, scale: 1 }
                          }
                          transition={{ type: "spring", stiffness: 360, damping: 20 }}
                          disabled={!amRaider || isOpen || Boolean(h.resolvedTier)}
                          onClick={() => {
                            simsarSfx.playPopTap();
                            dispatchSimsar({ type: "PICK_HEIST_BOX", boxIndex: idx });
                          }}
                          className={`aspect-square rounded-2xl border flex flex-col items-center justify-center transition-colors ${
                            wasPicked
                              ? `bg-gradient-to-b ${meta.pillCss} shadow-lg`
                              : isOpen
                              ? "bg-slate-900/70 border-white/10 opacity-50"
                              : amRaider
                              ? "bg-gradient-to-b from-amber-600/40 to-orange-950/80 border-amber-400/60 hover:brightness-110 shadow-md"
                              : "bg-slate-900 border-amber-500/30"
                          }`}
                        >
                          {isOpen ? (
                            <>
                              <span className="text-3xl">{meta.emoji}</span>
                              <span className="text-[10px] font-black mt-1">{meta.labelAr}</span>
                            </>
                          ) : (
                            <>
                              <span className="text-3xl animate-pulse">🍲</span>
                              <span className="text-[9px] font-bold text-amber-200/80 mt-1">
                                طاجين #{idx + 1}
                              </span>
                            </>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>

                  {h.shieldBlocked && (
                    <div className="mb-3 p-2 rounded-xl bg-cyan-950/60 border border-cyan-400/50 text-center text-[11px] font-black text-cyan-200">
                      🛡️ درع الحماية ديال {victim?.nickname} صدّ 65% من السرقة!
                    </div>
                  )}

                  {h.resolvedTier && (
                    <button
                      onClick={() => {
                        simsarSfx.playPopTap();
                        setDismissedHeistSeq(heistKey);
                      }}
                      className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-black text-sm shadow-lg active:scale-95 transition-all"
                    >
                      🎉 بصحة الغنيمة (+{h.stolenAmount} DH) — كمّل اللعب!
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* =====================================================================
          OVERLAY 2: SIMULTANEOUS 20s MARIO-PARTY MINI-GAME
      ===================================================================== */}
      {state.phase === "MINIGAME" && state.miniGame && (
        <SimsarMiniGames
          miniGame={state.miniGame}
          myId={effectiveMyId}
          players={state.players}
          isHost={shouldDriveBots}
          onSubmitScore={(score) =>
            dispatchSimsar({ type: "SUBMIT_MINIGAME_SCORE", score })
          }
          onFinalizeMiniGame={() => dispatchSimsar({ type: "FINALIZE_MINIGAME" })}
        />
      )}

      {dealSheet && state.phase !== "GAME_OVER" && (
        <SimsarPropertyDeals
          key={effectiveMyId}
          playerId={effectiveMyId}
          initialTile={dealSheet.tileIndex}
          state={state}
          onAction={dispatchSimsar}
          onClose={() => setDealSheet(null)}
        />
      )}

      {historyOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/75 backdrop-blur-sm"
          onKeyDown={(event) => { if (event.key === "Escape") setHistoryOpen(false); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="simsar-activity-title"
            className="flex max-h-[76dvh] w-full max-w-md flex-col rounded-t-3xl border border-amber-300/30 bg-slate-950"
          >
            <header className="flex items-center justify-between border-b border-white/10 p-4">
              <h2 id="simsar-activity-title" className="flex items-center gap-2 font-black">
                <History className="h-5 w-5 text-amber-300" /> آش وقع فالماتش؟
              </h2>
              <button onClick={() => setHistoryOpen(false)} aria-label="سد سجل الماتش" className="rounded-lg bg-slate-900 p-2">
                <X className="h-5 w-5" />
              </button>
            </header>
            <ol className="space-y-2 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {state.recentEvents.map((event) => (
                <li key={event.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-900 p-3">
                  <span aria-hidden="true">{event.emoji}</span>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-white">{event.titleAr}</p>
                    <p className="break-words text-xs text-slate-300">{event.subtitleAr}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {/* =====================================================================
          OVERLAY 3: MY EMPIRE & PROPERTY MANAGER BOTTOM SHEET
      ===================================================================== */}
      {empireOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md max-h-[76dvh] rounded-t-3xl bg-slate-950 border-t border-amber-400/45 flex flex-col overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-black text-white">
                    إمبراطوريتي العقارية ({myOwnedIndices.length})
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setEmpireOpen(false)}
                aria-label="سد عقاراتي"
                className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 overflow-y-auto space-y-2 flex-1">
              {me && (
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                  <p className="flex justify-between gap-2 font-black">
                    <span>قيمة الإمبراطورية</span><bdi>{me.netWorth} DH</bdi>
                  </p>
                  <p className="mt-1 flex justify-between gap-2 text-slate-300">
                    <span>الرصيد <bdi>{me.cash} DH</bdi></span>
                    <span>العقار والبني <bdi>{Math.max(0, me.netWorth - me.cash)} DH</bdi></span>
                  </p>
                </div>
              )}
              {isMyTurn && myOwnedIndices.length > 0 && (
                <p className="px-1 text-xs text-amber-200">تقدر تطوّر بزاف ديال العقارات فـ نوبتك، مستوى واحد لكل عقار.</p>
              )}
              {myOwnedIndices.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 font-bold">
                  مازال ما شريتي حتى مدينة! لوح النرد وشري أول همزة فالمغرب 🏙️
                </div>
              ) : (
                myOwnedIndices.map((idx) => {
                  const tile = SIMSAR_BOARD_TILES[idx];
                  const prop = state.properties[idx];
                  if (!tile || !prop) return null;
                  const canAct = isMyTurn && state.phase === "LANDED_DECISION";
                  const quote = getSimsarUpgradeQuote(idx, state.properties, effectiveMyId);
                  const upgradedThisTurn = isMyTurn && hasSimsarUpgradedTileThisTurn(state, idx);
                  const curRent = computePropertyRent(idx, state.properties, 7);
                  const mortgageGain =
                    Math.round((tile.price || 0) * 0.5) +
                    prop.level * Math.round((tile.upgradeCost || 0) * 0.5);
                  const unmortgageCost = Math.round((tile.price || 0) * 0.55);

                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-slate-900/90 border border-white/10 space-y-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 border border-white/20"
                          style={{ backgroundColor: `${tile.colorHex}33` }}
                        >
                          {tile.emoji}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-black text-white truncate">
                            {tile.nameAr}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400">
                            {prop.isMortgaged ? (
                              <span className="text-rose-400">مرهونة 🏦</span>
                            ) : tile.kind === "CITY" ? (
                              <span>
                                {BUILDING_TIER_NAMES_AR[prop.level]} • الكرا{" "}
                                <strong className="text-emerald-300">{curRent} DH</strong>
                              </span>
                            ) : (
                              <span>مرفق استراتيجي • كرا النرد</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {(quote || canAct) && <div className="flex items-center gap-1.5">
                        {quote && (
                            <button
                              disabled={!canBuild || upgradedThisTurn || (me?.cash ?? 0) < quote.cost}
                              onClick={() => {
                                dispatchSimsar({
                                  type: "UPGRADE_PROPERTY",
                                  tileIndex: idx,
                                });
                              }}
                              className="flex min-h-11 flex-1 items-center justify-between gap-2 rounded-xl bg-amber-300 px-2.5 py-1.5 text-right text-xs font-black text-slate-950 disabled:bg-slate-800 disabled:text-slate-300"
                            >
                              <span>
                                {upgradedThisTurn ? "تطوّر فهاد النوبة" : `بني ${BUILDING_TIER_NAMES_AR[quote.nextLevel]}`}
                                <span className="block text-[10px] font-semibold">الكرا <bdi>{quote.currentRent} → {quote.nextRent} DH</bdi></span>
                              </span>
                              <bdi className="shrink-0">{quote.cost} DH</bdi>
                            </button>
                          )}

                        {canAct && !prop.isMortgaged && (
                          <button
                            onClick={() => {
                              simsarSfx.playCashGain();
                              dispatchSimsar({ type: "MORTGAGE_PROPERTY", tileIndex: idx });
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-white/15 text-slate-300 font-bold text-[10px] active:scale-95"
                          >
                            رهن +{mortgageGain}
                          </button>
                        )}

                        {canAct && prop.isMortgaged && (
                          <button
                            disabled={(me?.cash ?? 0) < unmortgageCost}
                            onClick={() => {
                              simsarSfx.playPopTap();
                              dispatchSimsar({ type: "UNMORTGAGE_PROPERTY", tileIndex: idx });
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white font-black text-[10px] disabled:opacity-40 active:scale-95"
                          >
                            فك -{unmortgageCost}
                          </button>
                        )}
                      </div>}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          OVERLAY 4: 3D MOROCCAN TOKEN PICKER MODAL
      ===================================================================== */}
      {tokenModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl bg-slate-950 border border-amber-400/45 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-black text-amber-300">
                اختار الطوموبيل 3D ديالك 🚕✨
              </h3>
              <button
                onClick={() => setTokenModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {SIMSAR_TOKEN_ORDER.map((tid: SimsarTokenId) => {
                const spec = SIMSAR_TOKENS[tid];
                const selected = me?.token === tid;
                return (
                  <button
                    key={tid}
                    onClick={() => {
                      simsarSfx.playPopTap();
                      dispatchSimsar({ type: "SELECT_TOKEN", token: tid });
                      setTokenModalOpen(false);
                    }}
                    className={`p-3 rounded-2xl border text-right transition-all flex items-center gap-2.5 active:scale-95 ${
                      selected
                        ? "bg-amber-500/20 border-amber-400 text-white shadow-md"
                        : "bg-slate-900 border-white/10 text-slate-300 hover:border-white/30"
                    }`}
                  >
                    <span className="text-2xl">{spec.emoji}</span>
                    <span className="text-xs font-black leading-tight">{spec.nameAr}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          OVERLAY 5: MATCH SETTINGS & QUICK RULES MODAL
      ===================================================================== */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl bg-slate-950 border border-amber-400/45 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-amber-300 flex items-center gap-1.5">
                <Settings2 className="w-4 h-4" />
                <span>إعدادات سمسار رويال 3D</span>
              </h3>
              <button
                onClick={() => setSettingsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-900/90 border border-white/10 text-[11px] text-slate-300 space-y-1.5 leading-relaxed">
              <div>
                👑 <strong>هدف الفوز:</strong> جمع أكبر ثروة فـ {state.maxRounds} دورات أو وصل لـ{" "}
                <strong className="text-amber-300">{state.empireTargetDh} DH</strong> فالحين!
              </div>
              <div>
                🏆 <strong>قيمة الإمبراطورية:</strong> الرصيد ديالك زائد قيمة العقار والبني.
              </div>
              <div>
                🏘️ <strong>احتكار اللون:</strong> إلا ملكتي المجموعة كاملة، كرا الأرض كيتضاعف وكرا البناية كيزيد بـ 35%.
              </div>
              <div>
                ⚡ <strong>التحدي الجماعي:</strong> فنهاية كل دورة كيلعب الجميع 20 ثانية على{" "}
                <strong className="text-amber-300">+300 DH</strong>!
              </div>
            </div>

            {isHost && (
              <div className="space-y-2.5">
                <div className="text-xs font-black text-white">طور المباراة (يعيد بدء الطرح):</div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: "BLITZ" as SimsarMode, label: "⚡ سمسار سريع (10 دورات)" },
                      { id: "EMPIRE" as SimsarMode, label: "👑 إمبراطور (15 دورة)" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        simsarSfx.playPopTap();
                        dispatchSimsar({
                          type: "CONFIGURE_MATCH",
                          mode: m.id,
                          botFill: state.settings.botFill,
                        });
                        setSettingsModalOpen(false);
                      }}
                      className={`py-2.5 px-2 rounded-xl border text-[11px] font-black transition-all ${
                        state.mode === m.id
                          ? "bg-amber-500/25 border-amber-400 text-amber-200"
                          : "bg-slate-900 border-white/15 text-slate-300"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    simsarSfx.playPopTap();
                    dispatchSimsar({
                      type: "CONFIGURE_MATCH",
                      mode: state.mode,
                      botFill: !state.settings.botFill,
                    });
                    setSettingsModalOpen(false);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border border-white/15 flex items-center justify-between text-xs font-bold text-slate-200"
                >
                  <span>🤖 إكمال الطاولة بالبوتات المغاربة</span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                      state.settings.botFill
                        ? "bg-emerald-500/25 text-emerald-300"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {state.settings.botFill ? "مفعل" : "تلقائي للسولو"}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          OVERLAY 6: GAME OVER PODIUM & TYCOON ROAST AWARDS CEREMONY
      ===================================================================== */}
      {state.phase === "GAME_OVER" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-3 bg-slate-950/92 backdrop-blur-lg overflow-y-auto animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl bg-gradient-to-b from-amber-950/60 via-slate-950 to-slate-950 border border-amber-400/60 p-5 shadow-2xl my-auto space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-amber-300 to-orange-500 text-slate-950 flex items-center justify-center mx-auto mb-2 shadow-xl shadow-amber-500/30">
                <Trophy className="w-9 h-9" />
              </div>
              <h2 className="text-2xl font-black text-amber-300">
                👑 إمبراطور العقار فالمغرب!
              </h2>
              <p className="text-xs font-bold text-slate-200 mt-1">
                {state.winnerSummaryAr}
              </p>
            </div>

            {topEvent?.rent && (
              <div className="flex justify-center">
                <SimsarRentReceipt key={topEvent.rent.id} receipt={topEvent.rent} players={state.players} myId={effectiveMyId} />
              </div>
            )}

            {/* Standings Table */}
            <div className="space-y-1.5">
              {standings.map((p, idx) => (
                <div
                  key={p.id}
                  className={`px-3 py-2 rounded-2xl border flex items-center justify-between ${
                    idx === 0
                      ? "bg-amber-500/20 border-amber-400 text-white"
                      : "bg-slate-900/90 border-white/10 text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base font-black w-6 text-center">
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                    </span>
                    <span className="text-base">{SIMSAR_TOKENS[p.token]?.emoji}</span>
                    <span className="text-xs font-black truncate">{p.nickname}</span>
                  </div>
                  <div className="text-left shrink-0">
                    <span className="text-xs font-black text-emerald-300 tabular-nums">
                      {p.netWorth} DH
                    </span>
                    <span className="block text-[9px] text-slate-400 tabular-nums">
                      كاش: {p.cash} DH
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Hilarious Moroccan Tycoon Roast Awards */}
            {state.awards && state.awards.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {state.awards.slice(0, 4).map((aw) => (
                  <div
                    key={aw.id}
                    className="p-2.5 rounded-2xl bg-slate-900/95 border border-amber-400/25 text-right"
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-lg">{aw.emoji}</span>
                      <span className="text-[9px] font-black text-amber-300 px-1.5 py-0.5 rounded bg-amber-500/15">
                        {aw.statLabel}
                      </span>
                    </div>
                    <div className="text-[11px] font-black text-white truncate">
                      {aw.titleAr}
                    </div>
                    <div className="text-[10px] font-bold text-emerald-300 truncate">
                      {aw.winnerName}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => {
                  simsarSfx.playFanfare();
                  dispatchSimsar({ type: "PLAY_AGAIN" });
                }}
                className="py-3.5 px-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg flex items-center justify-center gap-1.5 active:scale-95 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                <span>طرح جديد فالحين!</span>
              </button>

              <button
                onClick={() => setIsImmersive(false)}
                className="py-3.5 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-white/15 text-slate-200 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>إعدادات الغرفة</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (mounted && isImmersive && typeof document !== "undefined") {
    return createPortal(gameScreen, document.body);
  }

  return gameScreen;
}
