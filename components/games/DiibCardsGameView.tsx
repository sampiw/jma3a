"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DIIB_CARDS_ROLE_META,
  DiibCardRole,
  PlayableDiibRole,
  SpeakerEntry,
  SpeakerTimerState,
} from "@/games/diib-cards/types";
import { getRecommendedDiibCardsDistribution } from "@/games/diib-cards/engine";
import { DiibTarotCard } from "@/components/games/diib-cards/DiibTarotCard";
import { DiibCardsIcon } from "@/components/icons/DiibCardsIcon";
import { sound } from "@/lib/sound";
import confetti from "canvas-confetti";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Crown,
  Dices,
  Eye,
  EyeOff,
  Flame,
  Gavel,
  Hand,
  Heart,
  Lock,
  Mic,
  MicOff,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ScrollText,
  Settings2,
  Shield,
  SkipForward,
  Skull,
  Sparkles,
  Sun,
  Swords,
  UserCheck,
  Users,
  VolumeX,
  Zap,
} from "lucide-react";

interface DiibCardsGameViewProps {
  publicData: any;
  privateData?: any;
  myRole?: string;
  isHost: boolean;
  onAction: (action: any, targetPlayerId?: string) => void;
  players: Array<{ id: string; nickname: string; isAlive?: boolean; avatarSeed?: string; isHost?: boolean }>;
  activePlayerId?: string;
  devicePlayers?: any[];
  onSelectPlayer?: (playerId: string) => void;
}

const DEATH_CAUSE_LABELS: Record<string, string> = {
  WOLF_ATTACK: "افترسوه الذيابة بالليل 🐺",
  WITCH_POISON: "تسمّم بقرعة السحارة 🧪",
  DAY_VOTE: "إعدام بتصويت الحومة ⚖️",
  HUNTER_SHOT: "رصاصة انتقام الصياد 🎯",
  MANAGER_DECREE: "سقط فظلام الليل 💀",
};

const PLAYABLE_ROLES_ORDER: PlayableDiibRole[] = [
  "wolf",
  "mute_wolf",
  "seer",
  "protector",
  "witch",
  "hunter",
];

export function DiibCardsGameView({
  publicData,
  privateData,
  myRole,
  isHost,
  onAction,
  players,
  activePlayerId,
  devicePlayers,
  onSelectPlayer,
}: DiibCardsGameViewProps) {
  const phase: string = publicData?.phase || "MANAGER_SELECT";
  const round: number = publicData?.round || 1;
  const matchNumber: number = publicData?.matchNumber || 1;

  // Resolve active local player on shared/personal device
  const currentDevicePlayer = devicePlayers?.find((p) => p.id === activePlayerId);
  const effectiveRole = (currentDevicePlayer?.privateView?.myRole || myRole || "villager") as DiibCardRole;
  const effectivePrivate = currentDevicePlayer?.privateView?.privateData || privateData || {};

  const managerId: string | undefined = publicData?.managerId;
  const isManager = Boolean(effectivePrivate?.isManager || (activePlayerId && activePlayerId === managerId));
  const isAlive = effectivePrivate?.isAlive !== false;
  const isMutedToday = Boolean(effectivePrivate?.isMutedToday || (activePlayerId && publicData?.mutedPlayerId === activePlayerId));

  // UI Local States
  const [cardFlipped, setCardFlipped] = useState(false);
  const [peekModalOpen, setPeekModalOpen] = useState(false);
  const [peekCardFlipped, setPeekCardFlipped] = useState(false);
  const [masterRosterOpen, setMasterRosterOpen] = useState(false);
  const [setupCustomizeOpen, setSetupCustomizeOpen] = useState(false);
  const [nightInputTab, setNightInputTab] = useState<"GUIDED" | "QUICK">("GUIDED");
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Custom role stepper draft in MANAGER_SELECT
  const playableCount = Math.max(3, players.length - 1);
  const effectiveSettings = publicData?.effectiveSettings || {};
  const [roleDraft, setRoleDraft] = useState<Record<PlayableDiibRole, number>>(() =>
    getRecommendedDiibCardsDistribution(playableCount)
  );

  useEffect(() => {
    if (effectiveSettings?.customRoles) {
      const base = getRecommendedDiibCardsDistribution(playableCount);
      setRoleDraft({
        ...base,
        ...effectiveSettings.customRoles,
      });
    } else {
      setRoleDraft(getRecommendedDiibCardsDistribution(playableCount));
    }
  }, [playableCount, effectiveSettings?.customRoles]);

  // Reset card flip when round/match or player changes
  useEffect(() => {
    setCardFlipped(false);
    setPeekModalOpen(false);
    setPeekCardFlipped(false);
  }, [matchNumber, activePlayerId, phase]);

  // Phase transition sound cues & celebrations
  const prevPhaseRef = useRef<string>(phase);
  const prevSpeakerRef = useRef<string | undefined>(publicData?.currentSpeakerId);
  const prevWarningIdRef = useRef<string | undefined>(publicData?.lastRuleWarning?.id);

  useEffect(() => {
    if (prevPhaseRef.current !== phase) {
      if (phase === "ROLE_REVEAL") {
        sound.playRoyalCrown();
      } else if (phase === "NIGHT") {
        sound.playWolfHowl();
      } else if (phase === "DAWN_ANNOUNCEMENT") {
        sound.playDawnChime();
        if (publicData?.mutedPlayerId) {
          setTimeout(() => sound.playMuteSeal(), 450);
        }
      } else if (phase === "HUNTER_REACTION") {
        sound.playEmergencySiren();
      } else if (phase === "DAY_VOTE" || phase === "DAY_RESOLUTION") {
        sound.playGavel();
      } else if (phase === "GAME_OVER") {
        if (publicData?.winner === "VILLAGE") {
          sound.playSuccess();
          confetti({ particleCount: 120, spread: 85, origin: { y: 0.6 } });
        } else {
          sound.playWolfKill();
          confetti({
            particleCount: 80,
            spread: 70,
            colors: ["#e11d48", "#fbbf24", "#4c0519"],
            origin: { y: 0.6 },
          });
        }
      }
      prevPhaseRef.current = phase;
    }
  }, [phase, publicData?.mutedPlayerId, publicData?.winner]);

  // Speaker change bell chime
  useEffect(() => {
    const curSpeaker = publicData?.currentSpeakerId;
    if (curSpeaker && curSpeaker !== prevSpeakerRef.current) {
      sound.playSpeakerBell();
    }
    prevSpeakerRef.current = curSpeaker;
  }, [publicData?.currentSpeakerId]);

  // Referee whistle sound on new rule warning
  useEffect(() => {
    const wId = publicData?.lastRuleWarning?.id;
    if (wId && wId !== prevWarningIdRef.current) {
      sound.playWhistle();
      prevWarningIdRef.current = wId;
    }
  }, [publicData?.lastRuleWarning?.id]);

  // Live timer ticker (100ms precision + last-5-seconds tick + 0s buzzer)
  const speakerTimer: SpeakerTimerState | undefined = publicData?.speakerTimer;
  const lastBeepSecRef = useRef<number | null>(null);

  useEffect(() => {
    if (!speakerTimer || speakerTimer.isPaused) return;
    lastBeepSecRef.current = null;

    const id = setInterval(() => {
      const t = Date.now();
      setNowMs(t);
      const remSec = Math.ceil((speakerTimer.endsAt - t) / 1000);
      if (remSec <= 5 && remSec > 0 && lastBeepSecRef.current !== remSec) {
        lastBeepSecRef.current = remSec;
        sound.playTick();
      } else if (remSec === 0 && lastBeepSecRef.current !== 0) {
        lastBeepSecRef.current = 0;
        sound.playBuzzer();
      }
    }, 150);

    return () => clearInterval(id);
  }, [speakerTimer?.endsAt, speakerTimer?.isPaused]);

  const dispatch = (action: any, explicitActorId?: string) => {
    onAction(action, explicitActorId || activePlayerId);
  };

  const getPlayerName = (id?: string) =>
    players.find((p) => p.id === id)?.nickname || "لاعب";

  const managerPlayer = players.find((p) => p.id === managerId);

  // Active rule warning toast (visible for 7 seconds)
  const activeWarning =
    publicData?.lastRuleWarning && nowMs - publicData.lastRuleWarning.issuedAt < 7000
      ? publicData.lastRuleWarning
      : null;

  // Pack member names for Wolves
  const packMemberNames: string[] = useMemo(() => {
    const ids: string[] = effectivePrivate?.packMembers || [];
    return ids.map((id) => getPlayerName(id));
  }, [effectivePrivate?.packMembers, players]);

  // Helper to compute countdown display
  const timerRemainingMs = speakerTimer
    ? speakerTimer.isPaused
      ? speakerTimer.pausedRemainingMs || 0
      : Math.max(0, speakerTimer.endsAt - nowMs)
    : 0;
  const timerSeconds = Math.ceil(timerRemainingMs / 1000);
  const timerProgress =
    speakerTimer && speakerTimer.durationMs > 0
      ? Math.max(0, Math.min(100, (timerRemainingMs / speakerTimer.durationMs) * 100))
      : 0;

  // =========================================================================
  // WRAPPER BACKDROP: LUXURY MOROCCAN TABLETOP TEXTURE
  // =========================================================================
  return (
    <div className="relative w-full max-w-2xl mx-auto pb-8">
      {/* Subtle Ambient Moroccan Tabletop Texture Card */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.14] z-0 bg-cover bg-center"
        style={{ backgroundImage: `url('/images/diib-cards/table-bg.png')` }}
      />

      <div className="relative z-10 space-y-4">
        {/* ===================================================================
            TOP GAME HUD RIBBON (Match #, Manager Badge, Peek Card, Master Sheet)
           =================================================================== */}
        {phase !== "MANAGER_SELECT" && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-jma3a-card/90 border border-amber-400/25 backdrop-blur-md shadow-lg">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-black flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>المانيجر: {managerPlayer?.nickname || "—"}</span>
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-jma3a-surface border border-jma3a-border text-jma3a-muted text-[11px] font-bold">
                الجولة {matchNumber} &bull; اليوم {round}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Regular Player: Discreet Secret Card Peek Button */}
              {!isManager && phase !== "ROLE_REVEAL" && phase !== "GAME_OVER" && (
                <button
                  onClick={() => {
                    sound.playCardFlip();
                    setPeekCardFlipped(false);
                    setPeekModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-jma3a-surface hover:bg-jma3a-border border border-amber-400/40 text-amber-200 text-xs font-black flex items-center gap-1.5 transition-all active:scale-95"
                >
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  <span>كارتتي 🃏</span>
                </button>
              )}

              {/* Manager: Always-available Master Roster & Whistle Drawer */}
              {isManager && phase !== "GAME_OVER" && (
                <button
                  onClick={() => {
                    sound.playCardFlip();
                    setMasterRosterOpen(!masterRosterOpen);
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 ${
                    masterRosterOpen
                      ? "bg-amber-500 text-jma3a-dark border-amber-300 shadow-md"
                      : "bg-amber-950/70 text-amber-200 border-amber-400/50 hover:bg-amber-900/60"
                  }`}
                >
                  <ScrollText className="w-3.5 h-3.5" />
                  <span>كشف الكوارط ({publicData?.alivePlayerIds?.length || 0} حيين)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================
            REFEREE YELLOW CARD / RULE WARNING BANNER
           =================================================================== */}
        {activeWarning && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/25 via-yellow-500/20 to-rose-600/25 border-2 border-amber-400 shadow-2xl flex items-center justify-between gap-3 animate-bounce">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-400 text-jma3a-dark flex items-center justify-center font-black text-xl shrink-0 shadow-md">
                🟨
              </div>
              <div className="text-right">
                <div className="text-sm font-black text-amber-200">
                  صفّارة القانون من المانيجر لـ {getPlayerName(activeWarning.targetPlayerId)}! 🔔
                </div>
                <div className="text-xs text-jma3a-sand/90 font-semibold">
                  {activeWarning.reason === "MUTED_SPOKE"
                    ? "🤐 راك مسكّت هاد النهار! ممنوع الهضرة بتاتاً!"
                    : activeWarning.reason === "DEAD_SPOKE"
                    ? "💀 الأموات ما كيهضروش وما كيلمّحوش للأحياء!"
                    : "🎙️ احترم نوبة الهضرة! تسنّى حتى تجي نوبتك بالتايمر!"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            PLAYER PERSISTENT STATUS BANNERS (MUTED 🤐 OR ELIMINATED 💀)
           =================================================================== */}
        {!isManager && phase !== "MANAGER_SELECT" && phase !== "ROLE_REVEAL" && phase !== "GAME_OVER" && (
          <>
            {!isAlive ? (
              <div className="p-3.5 rounded-2xl bg-rose-950/70 border border-rose-500/50 flex items-center gap-3 text-right shadow-lg">
                <div className="w-10 h-10 rounded-xl bg-rose-900/60 border border-rose-400/40 flex items-center justify-center shrink-0">
                  <Skull className="w-5 h-5 text-rose-300" />
                </div>
                <div>
                  <div className="text-sm font-black text-rose-200">أنت مقصى من الحومة 💀</div>
                  <div className="text-[11px] text-rose-200/80">
                    تفرّج فالأحداث والتصويت فصمت تام بلا ما تكشف حتى سر للأحياء 🤫
                  </div>
                </div>
              </div>
            ) : isMutedToday ? (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-fuchsia-950/90 via-purple-950/85 to-rose-950/80 border-2 border-fuchsia-400/70 flex items-center gap-3.5 text-right shadow-xl">
                <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/20 border border-fuchsia-400/60 flex items-center justify-center text-2xl shrink-0 animate-pulse">
                  🤐
                </div>
                <div>
                  <div className="text-base font-black text-fuchsia-200">
                    راك مسكّت هاد النهار! (الذيابة سدّو فمك) 🔒
                  </div>
                  <div className="text-xs text-fuchsia-100/85 leading-relaxed">
                    القانون واضح: ممنوع تنطق بحتى كلمة أو همسة حتى يسالي التصويت ويطيح الليل!
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* ===================================================================
            MANAGER EXPANDABLE MASTER ROSTER & REFEREE PANEL
           =================================================================== */}
        {isManager && masterRosterOpen && Array.isArray(effectivePrivate?.masterRoster) && (
          <div className="p-4 rounded-3xl bg-[#111622]/95 border-2 border-amber-400/60 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
              <h4 className="text-sm font-black text-amber-300 flex items-center gap-2">
                <Crown className="w-4 h-4" />
                <span>ورقة المانيجر السرية — جميع الكوارط والأدوار</span>
              </h4>
              <button
                onClick={() => setMasterRosterOpen(false)}
                className="text-xs font-bold text-jma3a-muted hover:text-white px-2 py-1 rounded-lg bg-white/5"
              >
                إخفاء ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {effectivePrivate.masterRoster.map((entry: any) => {
                const rMeta = DIIB_CARDS_ROLE_META[entry.role as DiibCardRole] || DIIB_CARDS_ROLE_META.villager;
                return (
                  <div
                    key={entry.playerId}
                    className={`p-2.5 rounded-2xl border flex items-center justify-between gap-2 ${
                      !entry.isAlive
                        ? "bg-black/40 border-rose-900/40 opacity-65"
                        : entry.team === "WOLVES"
                        ? "bg-rose-950/35 border-rose-500/40"
                        : "bg-jma3a-surface/80 border-jma3a-border"
                    }`}
                  >
                    <div className="min-w-0 text-right">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{rMeta.emoji}</span>
                        <span className={`text-sm font-black truncate ${!entry.isAlive ? "line-through text-jma3a-muted" : "text-jma3a-sand"}`}>
                          {getPlayerName(entry.playerId)}
                        </span>
                        {entry.isMutedToday && entry.isAlive && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-950 text-fuchsia-300 border border-fuchsia-400/40">
                            🤐 مسكّت
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-bold text-amber-300/90 mt-0.5">
                        {rMeta.title} {!entry.isAlive ? "— 💀 مقصى" : ""}
                      </div>
                    </div>

                    {/* Quick Referee Whistle Button */}
                    <button
                      onClick={() =>
                        dispatch({
                          type: "FLAG_RULE_WARNING",
                          targetPlayerId: entry.playerId,
                          reason: !entry.isAlive
                            ? "DEAD_SPOKE"
                            : entry.isMutedToday
                            ? "MUTED_SPOKE"
                            : "OUT_OF_TURN",
                        })
                      }
                      title="صفّارة إنذار القانون 🟨"
                      className="px-2 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/30 border border-amber-400/40 text-[11px] font-black text-amber-300 shrink-0 active:scale-95"
                    >
                      🟨 إنذار
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================================================================
            PHASE 1: MANAGER_SELECT ("شكون غادي يشد كارطة المانيجر؟ 👑")
           =================================================================== */}
        {phase === "MANAGER_SELECT" && (
          <div className="p-5 sm:p-6 rounded-3xl bg-jma3a-card/95 border border-amber-400/40 shadow-2xl text-right animate-fadeIn space-y-5">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-black mb-3">
                <Crown className="w-3.5 h-3.5" />
                <span>الجولة {matchNumber} &bull; بلا ما يخرج حتى واحد من الغرفة!</span>
              </div>
              <div className="w-16 h-16 mx-auto mb-3">
                <DiibCardsIcon className="w-16 h-16" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-jma3a-sand">
                شكون غادي يشد كارطة المانيجر؟ 👑📜
              </h2>
              <p className="text-xs sm:text-sm text-jma3a-muted mt-1.5 max-w-md mx-auto leading-relaxed">
                المانيجر كياخد <strong className="text-amber-300">كارطة الحكواتي</strong> باش يسيّر الليل، التسكيت، تايمر الهضرة والتصويت، والباقي ({playableCount} لاعبين) كياخدو كوارط الأدوار السرية!
              </p>
            </div>

            {/* Volunteer CTA for current player */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-jma3a-surface to-amber-500/10 border border-amber-400/40 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-jma3a-sand">
                  بغيتي نتا تسيّر هاد الطرح وتشد كارطة المانيجر؟
                </div>
                <div className="text-[11px] text-jma3a-muted">
                  أي واحد فالغرفة يقدر يطلبها، وفي الطرح الجاي تدوز لصاحبكم آخر!
                </div>
              </div>
              <button
                onClick={() => {
                  sound.playCardFlip();
                  dispatch({ type: "VOLUNTEER_MANAGER" });
                }}
                className={`w-full sm:w-auto px-5 py-3 rounded-2xl font-black text-xs sm:text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shrink-0 ${
                  publicData?.managerVolunteers?.includes(activePlayerId)
                    ? "bg-amber-400 text-jma3a-dark shadow-lg shadow-amber-500/30"
                    : "bg-jma3a-dark hover:bg-jma3a-surface text-amber-300 border border-amber-400/60"
                }`}
              >
                <Hand className="w-4 h-4" />
                <span>
                  {publicData?.managerVolunteers?.includes(activePlayerId)
                    ? "طلبتها! (إلغاء الطلب)"
                    : "بغيت نكون المانيجر! 🙋‍♂️👑"}
                </span>
              </button>
            </div>

            {/* Roster of all room players with Volunteer & Previous Manager badges + 1-tap Assign */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-black text-jma3a-sand flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-amber-400" />
                  <span>الحاضرين فالطاولة ({players.length}):</span>
                </span>
                <span className="text-[11px] text-jma3a-muted">
                  المتطوعين: {(publicData?.managerVolunteers || []).length}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {players.map((p) => {
                  const volunteered = (publicData?.managerVolunteers || []).includes(p.id);
                  const timesManaged = (publicData?.managerHistory || []).filter(
                    (id: string) => id === p.id
                  ).length;
                  const canConfirmThis =
                    isHost ||
                    (p.id === activePlayerId &&
                      ((publicData?.managerVolunteers || []).length === 0 ||
                        ((publicData?.managerVolunteers || []).length === 1 && volunteered))) ||
                    activePlayerId === (publicData?.managerHistory || []).at(-1);

                  return (
                    <div
                      key={p.id}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                        volunteered
                          ? "bg-amber-950/40 border-amber-400 shadow-md shadow-amber-500/10"
                          : "bg-jma3a-surface/75 border-jma3a-border"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-black text-jma3a-sand truncate">
                            {p.nickname}
                          </span>
                          {volunteered && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-400 text-jma3a-dark text-[10px] font-black animate-pulse shrink-0">
                              🙋‍♂️ متطوع
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-jma3a-muted mt-0.5">
                          {timesManaged > 0
                            ? `دار المانيجر ${timesManaged} مرة سابقاً 📜`
                            : "مازال ما دارش المانيجر ✨"}
                        </div>
                      </div>

                      {canConfirmThis && (
                        <button
                          onClick={() => {
                            sound.playRoyalCrown();
                            dispatch({ type: "CONFIRM_MANAGER", managerId: p.id });
                          }}
                          className="px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-jma3a-terracotta text-white font-black text-xs shadow-md hover:brightness-110 active:scale-95 shrink-0 flex items-center gap-1"
                        >
                          <Crown className="w-3.5 h-3.5" />
                          <span>اختارو 👑</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rules & Deck Customizer Accordion */}
            <div className="rounded-2xl bg-jma3a-surface/60 border border-jma3a-border overflow-hidden">
              <button
                onClick={() => {
                  sound.playCardFlip();
                  setSetupCustomizeOpen(!setupCustomizeOpen);
                }}
                className="w-full p-3.5 flex items-center justify-between text-xs font-black text-jma3a-sand hover:bg-white/5"
              >
                <span className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-amber-400" />
                  <span>قوانين الطاولة وتشكيلة الكوارط ({playableCount} كوارط لعب + 1 مانيجر)</span>
                </span>
                <span className="text-amber-300">
                  {setupCustomizeOpen ? "إغلاق ▲" : "تعديل ▼"}
                </span>
              </button>

              {setupCustomizeOpen && (
                <div className="p-4 border-t border-jma3a-border space-y-4">
                  {/* Speaking Duration Limit */}
                  <div>
                    <label className="text-xs font-bold text-jma3a-sand block mb-2">
                      ⏱️ وقت الهضرة لكل لاعب بالنهار:
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[30, 45, 60, 90].map((sec) => {
                        const active = (effectiveSettings?.speakingDurationSeconds || 45) === sec;
                        return (
                          <button
                            key={sec}
                            onClick={() =>
                              dispatch({
                                type: "UPDATE_INLINE_SETTINGS",
                                settings: { speakingDurationSeconds: sec },
                              })
                            }
                            className={`py-2 rounded-xl text-xs font-black border transition-all ${
                              active
                                ? "bg-amber-400 text-jma3a-dark border-amber-300"
                                : "bg-jma3a-dark text-jma3a-muted border-jma3a-border hover:text-white"
                            }`}
                          >
                            {sec} ثانية
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Toggles: Wolf Mute & Reveal Role on Death */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={() =>
                        dispatch({
                          type: "UPDATE_INLINE_SETTINGS",
                          settings: {
                            muteRule:
                              effectiveSettings?.muteRule === "OFF" ? "WOLVES_PACK" : "OFF",
                          },
                        })
                      }
                      className={`p-3 rounded-xl border text-right text-xs font-bold flex items-center justify-between ${
                        effectiveSettings?.muteRule !== "OFF"
                          ? "bg-fuchsia-950/50 border-fuchsia-400/60 text-fuchsia-200"
                          : "bg-jma3a-dark border-jma3a-border text-jma3a-muted"
                      }`}
                    >
                      <span>🤐 قانون التسكيت بالليل (الذيابة)</span>
                      <span>{effectiveSettings?.muteRule !== "OFF" ? "مفعّل ✅" : "معطّل"}</span>
                    </button>

                    <button
                      onClick={() =>
                        dispatch({
                          type: "UPDATE_INLINE_SETTINGS",
                          settings: {
                            roleRevealOnDeath: !effectiveSettings?.roleRevealOnDeath,
                          },
                        })
                      }
                      className={`p-3 rounded-xl border text-right text-xs font-bold flex items-center justify-between ${
                        effectiveSettings?.roleRevealOnDeath !== false
                          ? "bg-emerald-950/50 border-emerald-400/60 text-emerald-200"
                          : "bg-jma3a-dark border-jma3a-border text-jma3a-muted"
                      }`}
                    >
                      <span>🃏 كشف الكارطة عند الموت</span>
                      <span>{effectiveSettings?.roleRevealOnDeath !== false ? "مفعّل ✅" : "مخفي 🔒"}</span>
                    </button>
                  </div>

                  {/* Role Deck Steppers */}
                  <div>
                    <label className="text-xs font-bold text-jma3a-sand block mb-2">
                      🃏 تخصيص عدد الكوارط الخاصة (الباقي ولاد الحومة 👨‍🌾):
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {PLAYABLE_ROLES_ORDER.map((rKey) => {
                        const meta = DIIB_CARDS_ROLE_META[rKey];
                        const count = roleDraft[rKey] || 0;
                        return (
                          <div
                            key={rKey}
                            className="p-2.5 rounded-xl bg-jma3a-dark border border-jma3a-border flex items-center justify-between"
                          >
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  const next = {
                                    ...roleDraft,
                                    [rKey]: Math.max(0, count - 1),
                                  };
                                  setRoleDraft(next);
                                  dispatch({
                                    type: "UPDATE_INLINE_SETTINGS",
                                    settings: { customRoles: next },
                                  });
                                }}
                                className="w-7 h-7 rounded-lg bg-jma3a-surface text-white font-black text-sm"
                              >
                                -
                              </button>
                              <span className="w-5 text-center font-black text-amber-300 text-xs">
                                {count}
                              </span>
                              <button
                                onClick={() => {
                                  const next = {
                                    ...roleDraft,
                                    [rKey]: count + 1,
                                  };
                                  setRoleDraft(next);
                                  dispatch({
                                    type: "UPDATE_INLINE_SETTINGS",
                                    settings: { customRoles: next },
                                  });
                                }}
                                className="w-7 h-7 rounded-lg bg-jma3a-surface text-white font-black text-sm"
                              >
                                +
                              </button>
                            </div>
                            <span className="text-xs font-bold text-jma3a-sand">
                              {meta.emoji} {meta.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-center text-xs text-jma3a-muted">
                      ولاد الحومة المتبقون 👨‍🌾:{" "}
                      <strong className="text-amber-300">
                        {Math.max(
                          0,
                          playableCount -
                            PLAYABLE_ROLES_ORDER.reduce((s, k) => s + (roleDraft[k] || 0), 0)
                        )}
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Auto-Pick Fair Rotation CTA */}
            {isHost && (
              <button
                onClick={() => {
                  sound.playRoyalCrown();
                  dispatch({ type: "AUTO_PICK_MANAGER" });
                }}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-jma3a-terracotta via-amber-600 to-jma3a-accent text-white font-black text-base shadow-xl shadow-jma3a-terracotta/30 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Dices className="w-5 h-5" />
                <span>
                  {(publicData?.managerVolunteers || []).length > 0
                    ? "فرّق الكوارط واختار من المتطوعين! 🃏👑"
                    : "اختار مانيجر بالدور وفرّق الكوارط! 🎲🃏"}
                </span>
              </button>
            )}
          </div>
        )}

        {/* ===================================================================
            PHASE 2: ROLE_REVEAL ("توزيع الكوارط الملكية 🃏✨")
           =================================================================== */}
        {phase === "ROLE_REVEAL" && (
          <div className="animate-fadeIn">
            {/* ONE-PHONE DEAL RELAY CURTAIN (Ends on Manager!) */}
            {publicData?.dealRelay ? (
              <div className="max-w-md mx-auto p-5 rounded-3xl bg-jma3a-card/95 border border-amber-400/40 text-center shadow-2xl space-y-5">
                {!publicData.dealRelay.isRevealed ? (
                  <>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-black">
                      <Lock className="w-3.5 h-3.5" />
                      <span>
                        توزيع الكوارط بتلفون واحد ({publicData.dealRelay.currentIndex + 1} /{" "}
                        {publicData.dealRelay.totalCount})
                      </span>
                    </div>

                    <h3 className="text-xl font-bold text-jma3a-sand">دوز التلفون فصمت لـ:</h3>
                    <div className="py-4 px-6 rounded-2xl bg-jma3a-surface border border-amber-400/40 text-3xl font-black text-amber-300">
                      {publicData.dealRelay.currentNickname}
                    </div>
                    <p className="text-xs text-jma3a-muted">
                      {publicData.dealRelay.currentPlayerId === managerId
                        ? "👑 نتا هو المانيجر! التلفون غادي يبقى عندك دابا باش تسيّر الطرح."
                        : "شوف كارتتك غير بوحدك، عقل على دورك، ودوز التلفون للي حداك!"}
                    </p>
                    <button
                      onClick={() => {
                        sound.playCardFlip();
                        onSelectPlayer?.(publicData.dealRelay.currentPlayerId);
                        dispatch(
                          { type: "DEAL_RELAY_STEP" },
                          publicData.dealRelay.currentPlayerId
                        );
                      }}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-jma3a-terracotta text-white font-black text-base shadow-xl flex items-center justify-center gap-2 active:scale-95"
                    >
                      <UserCheck className="w-5 h-5" />
                      <span>أنا هو {publicData.dealRelay.currentNickname} — وريني كارتتي 👀</span>
                    </button>
                  </>
                ) : (
                  <>
                    <DiibTarotCard
                      role={effectiveRole}
                      playerName={publicData.dealRelay.currentNickname}
                      isFlipped={true}
                      packMemberNames={effectiveRole !== "manager" ? packMemberNames : undefined}
                    />
                    <button
                      onClick={() => {
                        sound.playCardFlip();
                        dispatch(
                          { type: "DEAL_RELAY_STEP" },
                          publicData.dealRelay.currentPlayerId
                        );
                      }}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-black text-base shadow-xl flex items-center justify-center gap-2 active:scale-95"
                    >
                      <EyeOff className="w-5 h-5" />
                      <span>
                        {publicData.dealRelay.currentPlayerId === managerId
                          ? "تفتح لوحة المانيجر 👑🚀"
                          : "خبي الكارطة ودوز التلفون 🤫➡️"}
                      </span>
                    </button>
                  </>
                )}
              </div>
            ) : (
              /* MULTI-PHONE / PERSONAL CARD REVEAL */
              <div className="flex flex-col items-center text-center space-y-5">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-jma3a-card border border-amber-400/40 text-amber-300 text-xs font-black shadow-md">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {isManager
                      ? "شدّيتي كارطة المانيجر (الحكواتي) 👑"
                      : "اقلب كارتتك السرية وعقل على دورك مزيان 👀"}
                  </span>
                </div>

                <DiibTarotCard
                  role={effectiveRole}
                  playerName={players.find((p) => p.id === activePlayerId)?.nickname}
                  isFlipped={cardFlipped}
                  onFlipChange={(next) => {
                    setCardFlipped(next);
                    if (next && !isManager && !effectivePrivate?.cardSeen) {
                      dispatch({ type: "MARK_CARD_SEEN" });
                    }
                  }}
                  packMemberNames={!isManager && effectivePrivate?.team === "WOLVES" ? packMemberNames : undefined}
                />

                {/* Live Seen Progress Indicator */}
                <div className="w-full max-w-sm p-3.5 rounded-2xl bg-jma3a-card/90 border border-jma3a-border flex items-center justify-between text-xs">
                  <span className="text-jma3a-muted font-semibold">اللاعبين لي قلبو كوارطهم:</span>
                  <span className="font-black text-amber-300">
                    {publicData?.cardsSeenCount || 0} / {publicData?.totalPlayableCount || playableCount} ✅
                  </span>
                </div>

                {isManager ? (
                  <div className="w-full max-w-md space-y-3">
                    {/* Quick Master Summary right under Manager's Card */}
                    {Array.isArray(effectivePrivate?.masterRoster) && (
                      <div className="p-4 rounded-2xl bg-jma3a-card/95 border border-amber-400/40 text-right">
                        <div className="text-xs font-black text-amber-300 mb-2">
                          📜 توزيع الكوارط على الطاولة هاد الطرح:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {effectivePrivate.masterRoster.map((r: any) => {
                            const rm = DIIB_CARDS_ROLE_META[r.role as DiibCardRole];
                            return (
                              <span
                                key={r.playerId}
                                className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${rm.badgeBg}`}
                              >
                                {rm.emoji} {getPlayerName(r.playerId)} ({rm.title})
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => {
                        sound.playWolfHowl();
                        dispatch({ type: "START_NIGHT" });
                      }}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-rose-600 text-white font-black text-base shadow-xl hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Moon className="w-5 h-5" />
                      <span>الكل شاف كارتتو؟ طيّح الليلة 1 🌙</span>
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-jma3a-muted max-w-xs leading-relaxed">
                    ملي تشوف كارتتك، عاود انقر عليها باش تتخبّى وحط تلفونك مرتاح... المانيجر{" "}
                    <strong className="text-amber-300">{managerPlayer?.nickname}</strong> غادي يبدا الليل!
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            PHASE 3: NIGHT ("الليل فالحومة — دفتر المانيجر 🌙📜")
           =================================================================== */}
        {phase === "NIGHT" && (
          <div className="animate-fadeIn">
            {!isManager ? (
              /* REGULAR PLAYER: ZERO-TECH MOONLIT SLEEP SCREEN */
              <div className="p-8 rounded-3xl bg-gradient-to-b from-indigo-950/85 via-[#0E1324] to-jma3a-card border border-indigo-400/35 text-center shadow-2xl space-y-4">
                <div className="w-20 h-20 rounded-3xl bg-indigo-950/90 border border-indigo-400/50 flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(99,102,241,0.3)]">
                  <Moon className="w-10 h-10 text-indigo-300 animate-pulse" />
                </div>
                <span className="inline-block px-3 py-1 rounded-full bg-indigo-950 border border-indigo-500/40 text-indigo-300 text-xs font-bold">
                  الليلة {round} فالحومة 🌙
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-jma3a-sand">
                  الليل هبط... غمّضو عينيكم! 🤫
                </h2>
                <p className="text-sm text-jma3a-muted max-w-sm mx-auto leading-relaxed">
                  ما تحتاج تقيس والو فالتلفون دابا! غير سد عينيك وتبّع صوت المانيجر{" "}
                  <strong className="text-amber-300">{managerPlayer?.nickname}</strong> فالواقع.
                </p>
              </div>
            ) : (
              /* MANAGER: THE NIGHT LEDGER & RULE ASSISTANT */
              <ManagerNightLedger
                round={round}
                players={players}
                publicData={publicData}
                privateData={effectivePrivate}
                nightInputTab={nightInputTab}
                setNightInputTab={setNightInputTab}
                onAction={dispatch}
              />
            )}
          </div>
        )}

        {/* ===================================================================
            PHASE 4: HUNTER_REACTION ("رصاصة انتقام الصياد 🎯💥")
           =================================================================== */}
        {phase === "HUNTER_REACTION" && (
          <div className="p-6 rounded-3xl bg-gradient-to-b from-orange-950/85 via-rose-950/60 to-jma3a-card border-2 border-orange-400/70 text-center shadow-2xl space-y-5 animate-fadeIn">
            <div className="w-20 h-20 rounded-3xl bg-orange-500/20 border-2 border-orange-400 flex items-center justify-center mx-auto text-4xl shadow-[0_0_35px_rgba(251,146,60,0.4)] animate-pulse">
              🎯
            </div>
            <div>
              <span className="px-3 py-1 rounded-full bg-orange-950 border border-orange-400/50 text-orange-300 text-xs font-black">
                قانون الصياد التلقائي 💥
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-jma3a-sand mt-2">
                الصياد <span className="text-orange-300">{getPlayerName(publicData?.pendingHunterId)}</span> طاح!
              </h2>
              <p className="text-xs sm:text-sm text-jma3a-sand/85 mt-1 max-w-md mx-auto">
                قبل ما يسلّم الروح، عندو الحق يختار لاعب حي يجرّو معاه برصاصتو الأخيرة!
              </p>
            </div>

            {isManager || activePlayerId === publicData?.pendingHunterId ? (
              <div className="space-y-3 text-right">
                <div className="text-xs font-black text-orange-200">
                  🎯 على من تيرا الصياد؟ (كليكي على الضحية):
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(publicData?.alivePlayerIds || []).map((id: string) => (
                    <button
                      key={id}
                      onClick={() => {
                        sound.playHunterShot();
                        dispatch({ type: "RESOLVE_HUNTER_SHOT", targetPlayerId: id });
                      }}
                      className="p-3.5 rounded-2xl bg-jma3a-surface hover:bg-orange-600 border border-orange-400/40 hover:border-orange-300 text-sm font-black text-jma3a-sand hover:text-white transition-all active:scale-95 flex items-center justify-between"
                    >
                      <span className="truncate">{getPlayerName(id)}</span>
                      <span>🎯</span>
                    </button>
                  ))}
                </div>
                {isManager && (
                  <button
                    onClick={() => dispatch({ type: "SKIP_HUNTER_SHOT" })}
                    className="w-full py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs font-bold text-jma3a-muted hover:text-white"
                  >
                    الصياد امتنع يضرب فالهواء (تخطي)
                  </button>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-black/40 border border-orange-500/30 text-xs text-orange-200 font-bold">
                حبسو الأنفاس... كنتسناو الصياد يعلن على من غادي يتيري! 🔥
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            PHASE 5: DAWN_ANNOUNCEMENT ("إشراقة الصباح وأخبار الليل ☀️📰")
           =================================================================== */}
        {phase === "DAWN_ANNOUNCEMENT" && (
          <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-b from-amber-950/55 via-jma3a-card to-jma3a-card border border-amber-400/45 shadow-2xl space-y-5 text-center animate-fadeIn">
            <div>
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center mx-auto mb-3 shadow-lg">
                <Sun className="w-9 h-9 text-amber-300 animate-spin-slow" />
              </div>
              <span className="text-xs font-black text-amber-300 uppercase tracking-wider">
                صباح اليوم {round} فالحومة ☀️
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-jma3a-sand mt-1">
                فيقو يا أهل الحومة! شوفو شنو وقع بالليل...
              </h2>
            </div>

            {/* Deaths Obituary Cards */}
            {(publicData?.lastDawnDeaths || []).length === 0 ? (
              <div className="p-5 rounded-2xl bg-emerald-950/45 border border-emerald-400/40">
                <div className="text-3xl mb-1">🕊️✨</div>
                <h3 className="text-lg font-black text-emerald-300">
                  ليلة سالمة! حتى واحد ما مات هاد الليلة!
                </h3>
                <p className="text-xs text-emerald-200/80 mt-1">
                  إما الحارس حمى الضحية، أو السحارة عتقات، أو الذيابة خاب هجومهم!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs font-black text-rose-300">
                  💀 ضحايا هاد الليلة ({publicData.lastDawnDeaths.length}):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
                  {publicData.lastDawnDeaths.map((d: any) => (
                    <div key={d.playerId} className="space-y-1.5">
                      {d.revealedRole ? (
                        <DiibTarotCard
                          role={d.revealedRole}
                          playerName={getPlayerName(d.playerId)}
                          isFlipped={true}
                          compact={true}
                          isDead={true}
                        />
                      ) : (
                        <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/50 text-center">
                          <Skull className="w-8 h-8 text-rose-400 mx-auto mb-1" />
                          <div className="text-base font-black text-jma3a-sand">
                            {getPlayerName(d.playerId)}
                          </div>
                          <div className="text-[11px] text-rose-300">الكارطة بقات سرية 🔒</div>
                        </div>
                      )}
                      <div className="text-[11px] font-bold text-rose-300/90">
                        {DEATH_CAUSE_LABELS[d.cause] || "سقط بالليل"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* WOLF MUTE ANNOUNCEMENT BANNER */}
            {publicData?.mutedPlayerId && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-fuchsia-950/85 via-purple-950/80 to-fuchsia-950/85 border-2 border-fuchsia-400/60 flex items-center justify-center gap-3 shadow-lg">
                <span className="text-3xl">🤐</span>
                <div className="text-right">
                  <div className="text-sm sm:text-base font-black text-fuchsia-200">
                    الذيابة سكّتو{" "}
                    <span className="underline decoration-fuchsia-400 text-white">
                      {getPlayerName(publicData.mutedPlayerId)}
                    </span>{" "}
                    هاد النهار!
                  </div>
                  <div className="text-xs text-fuchsia-200/80">
                    ممنوع عليه يهضر ولا يجاوب بالصوت طيلة جولة النقاش والتصويت!
                  </div>
                </div>
              </div>
            )}

            {isManager ? (
              <button
                onClick={() => {
                  sound.playSpeakerBell();
                  dispatch({ type: "START_SPEAKING" });
                }}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-jma3a-terracotta to-jma3a-accent text-white font-black text-base shadow-xl hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Mic className="w-5 h-5" />
                <span>بدا نوبة الهضرة بالتايمر ({effectiveSettings?.speakingDurationSeconds || 45}ث لكل واحد) 🎙️⏱️</span>
              </button>
            ) : (
              <div className="text-xs text-jma3a-muted font-semibold">
                المانيجر <strong className="text-amber-300">{managerPlayer?.nickname}</strong> غادي يطلق نوبة الهضرة دابا...
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            PHASE 6: SPEAKING_TURNS ("نوبة الهضرة بالوقت — Smart Speaker Spotlight 🎙️⏳")
           =================================================================== */}
        {phase === "SPEAKING_TURNS" && (
          <div className="p-5 sm:p-6 rounded-3xl bg-jma3a-card/95 border border-jma3a-border shadow-2xl space-y-5 animate-fadeIn">
            {/* Active Speaker Spotlight + Circular Timer */}
            {(() => {
              const currentSpeakerId: string | undefined = publicData?.currentSpeakerId;
              const isOpenFloor = speakerTimer?.mode === "OPEN_FLOOR";
              const isMeSpeaking = Boolean(currentSpeakerId && currentSpeakerId === activePlayerId);

              return (
                <div
                  className={`p-5 rounded-3xl border-2 text-center transition-all ${
                    isMeSpeaking
                      ? "bg-gradient-to-b from-emerald-950/80 to-jma3a-surface border-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.28)]"
                      : isOpenFloor
                      ? "bg-gradient-to-b from-amber-950/60 to-jma3a-surface border-amber-400/60"
                      : "bg-jma3a-surface/90 border-amber-400/35"
                  }`}
                >
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/45 border border-white/10 text-xs font-black text-amber-300 mb-3">
                    <Mic className="w-3.5 h-3.5" />
                    <span>
                      {isOpenFloor
                        ? "🔥 نقاش مفتوح حر بين الأحياء!"
                        : currentSpeakerId
                        ? isMeSpeaking
                          ? "🎙️ نوبتك تهضر دابا! دافع على راسك!"
                          : "🎙️ صاحب النوبة فالهضرة دابا:"
                        : "✅ الكل خدّى نوبتو فالهضرة!"}
                    </span>
                  </div>

                  {currentSpeakerId && !isOpenFloor && (
                    <h2 className="text-3xl sm:text-4xl font-black text-jma3a-sand mb-3">
                      {getPlayerName(currentSpeakerId)}
                    </h2>
                  )}

                  {/* Circular Countdown Ring */}
                  {speakerTimer && (
                    <div className="relative w-36 h-36 mx-auto my-2 flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                        <circle
                          cx="60"
                          cy="60"
                          r="52"
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth="10"
                          fill="none"
                        />
                        <circle
                          cx="60"
                          cy="60"
                          r="52"
                          stroke={
                            timerSeconds <= 10
                              ? "#f43f5e"
                              : isMeSpeaking
                              ? "#34d399"
                              : "#f59e0b"
                          }
                          strokeWidth="10"
                          strokeLinecap="round"
                          fill="none"
                          strokeDasharray={2 * Math.PI * 52}
                          strokeDashoffset={
                            2 * Math.PI * 52 * (1 - timerProgress / 100)
                          }
                          className="transition-[stroke-dashoffset] duration-150 ease-linear"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span
                          className={`font-mono text-3xl font-black tabular-nums ${
                            timerSeconds <= 10 ? "text-rose-400 animate-pulse" : "text-white"
                          }`}
                        >
                          {timerSeconds}s
                        </span>
                        <span className="text-[10px] font-bold text-jma3a-muted">
                          {speakerTimer.isPaused
                            ? "موقّف ⏸️"
                            : timerSeconds === 0
                            ? "سالا الوقت! 🔔"
                            : "الوقت المتبقي"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Manager Speaker Controls Bar */}
            {isManager && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  onClick={() => dispatch({ type: "NEXT_SPEAKER" })}
                  className="py-3 px-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-jma3a-dark font-black text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95"
                >
                  <SkipForward className="w-4 h-4" />
                  <span>المتحدث التالي ⏭️</span>
                </button>

                <button
                  onClick={() => dispatch({ type: "RANDOM_SPEAKER" })}
                  className="py-3 px-3 rounded-2xl bg-jma3a-surface hover:bg-jma3a-border border border-amber-400/40 text-amber-200 font-black text-xs flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <Dices className="w-4 h-4 text-amber-400" />
                  <span>اختيار عشوائي 🎲</span>
                </button>

                <button
                  onClick={() => dispatch({ type: "ADD_SPEAKER_TIME", extraSeconds: 15 })}
                  disabled={!speakerTimer}
                  className="py-3 px-3 rounded-2xl bg-jma3a-surface hover:bg-jma3a-border border border-jma3a-border text-jma3a-sand font-black text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-95"
                >
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <span>+15 ثانية ⏱️</span>
                </button>

                <button
                  onClick={() => dispatch({ type: "PAUSE_RESUME_SPEAKER" })}
                  disabled={!speakerTimer}
                  className="py-3 px-3 rounded-2xl bg-jma3a-surface hover:bg-jma3a-border border border-jma3a-border text-jma3a-sand font-black text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-95"
                >
                  {speakerTimer?.isPaused ? (
                    <>
                      <Play className="w-4 h-4 text-emerald-400" />
                      <span>كمّل الوقت</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4 text-amber-400" />
                      <span>وقّف مؤقتاً</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Speaking Queue Strip (Shows order, who spoke, who is muted 🤐, and lets Manager tap to jump!) */}
            <div className="text-right">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-jma3a-sand">
                  ترتيب الكلمة فالحومة ({(publicData?.speakingQueue || []).length} أحياء):
                </span>
                {isManager && (
                  <span className="text-[10px] text-jma3a-muted">
                    انقر على أي اسم باش تعطيه الميكرو أو 🟨 للإنذار
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(publicData?.speakingQueue || []).map((entry: SpeakerEntry, idx: number) => {
                  const isCurrent = idx === publicData?.currentSpeakerIndex;
                  return (
                    <div
                      key={entry.playerId}
                      className={`p-2.5 rounded-2xl border flex items-center justify-between gap-1.5 transition-all ${
                        entry.isMuted
                          ? "bg-fuchsia-950/35 border-fuchsia-500/40 text-fuchsia-300"
                          : isCurrent
                          ? "bg-amber-500/25 border-amber-400 text-white shadow-md"
                          : entry.hasSpoken
                          ? "bg-black/35 border-emerald-500/25 text-jma3a-muted"
                          : "bg-jma3a-surface/80 border-jma3a-border text-jma3a-sand"
                      }`}
                    >
                      <button
                        disabled={!isManager || entry.isMuted}
                        onClick={() =>
                          dispatch({ type: "SELECT_SPEAKER", targetPlayerId: entry.playerId })
                        }
                        className="flex-1 text-right min-w-0 flex items-center gap-1.5 disabled:cursor-default"
                      >
                        <span className="text-xs shrink-0">
                          {entry.isMuted
                            ? "🤐"
                            : isCurrent
                            ? "🎙️"
                            : entry.hasSpoken
                            ? "✅"
                            : "⏳"}
                        </span>
                        <span className="text-xs font-bold truncate">
                          {getPlayerName(entry.playerId)}
                        </span>
                      </button>

                      {isManager && (
                        <button
                          onClick={() =>
                            dispatch({
                              type: "FLAG_RULE_WARNING",
                              targetPlayerId: entry.playerId,
                              reason: entry.isMuted ? "MUTED_SPOKE" : "OUT_OF_TURN",
                            })
                          }
                          title="إنذار القانون 🟨"
                          className="px-1.5 py-0.5 rounded-lg bg-amber-400/15 hover:bg-amber-400/35 text-[10px] shrink-0"
                        >
                          🟨
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Open Floor Debate & Proceed to Courtroom Voting CTAs */}
            {isManager && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-jma3a-border/50">
                <button
                  onClick={() => dispatch({ type: "OPEN_FLOOR_DEBATE", durationSeconds: 60 })}
                  className="py-3.5 rounded-2xl bg-jma3a-surface hover:bg-jma3a-border border border-amber-400/40 text-amber-200 font-black text-xs flex items-center justify-center gap-2 active:scale-95"
                >
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span>نقاش مفتوح حر (60 ثانية) 🔥</span>
                </button>

                <button
                  onClick={() => {
                    sound.playGavel();
                    dispatch({ type: "START_VOTING" });
                  }}
                  className="py-3.5 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-rose-600 text-white font-black text-sm shadow-lg flex items-center justify-center gap-2 hover:brightness-110 active:scale-95"
                >
                  <Gavel className="w-4 h-4" />
                  <span>بدا التصويت والمحكمة ⚖️🗳️</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            PHASE 7: DAY_VOTE & RUNOFF_VOTE ("محكمة الحومة وعدّاد الأصوات ⚖️📊")
           =================================================================== */}
        {(phase === "DAY_VOTE" || phase === "RUNOFF_VOTE") && (
          <div className="p-5 sm:p-6 rounded-3xl bg-jma3a-card/95 border border-rose-500/40 shadow-2xl space-y-5 text-right animate-fadeIn">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-rose-500/15 border border-rose-400/40 text-rose-300 text-xs font-black mb-2">
                <Gavel className="w-3.5 h-3.5" />
                <span>
                  {phase === "RUNOFF_VOTE"
                    ? "⚔️ تصويت الحسم بين المتعادلين!"
                    : `⚖️ محكمة الحومة — اليوم ${round}`}
                </span>
              </div>
              <h2 className="text-2xl font-black text-jma3a-sand">
                شكون غادي يتقصى اليوم؟
              </h2>
              <p className="text-xs text-jma3a-muted mt-1">
                {isManager
                  ? "احسب اليدين المرفوعة فالغرفة بـ (+) و (-) أو خليهم يصوّتو بتلفوناتهم، ثم احسم الحكم!"
                  : "صوّت بيدك مع المانيجر (أو كليكي على المشتبه فيه لتحت) وشوف العداد المباشر!"}
              </p>
            </div>

            {/* Live Candidate Tally Bars + Manager (+/-) Pad / Player Vote Tap */}
            <div className="space-y-2.5">
              {(() => {
                const candidatePool: string[] =
                  phase === "RUNOFF_VOTE"
                    ? publicData?.tiedCandidates || []
                    : publicData?.alivePlayerIds || [];
                const totalLiving = (publicData?.alivePlayerIds || []).length || 1;
                const tallies: Record<string, number> = publicData?.candidateTallies || {};

                return candidatePool.map((candId) => {
                  const count = tallies[candId] || 0;
                  const pct = Math.min(100, Math.round((count / totalLiving) * 100));
                  const isMyBallot = effectivePrivate?.myBallot === candId;

                  return (
                    <div
                      key={candId}
                      className={`relative overflow-hidden p-3 rounded-2xl border transition-all ${
                        isMyBallot
                          ? "border-rose-400 bg-rose-950/40"
                          : count > 0
                          ? "border-amber-400/50 bg-jma3a-surface/90"
                          : "border-jma3a-border bg-jma3a-surface/65"
                      }`}
                    >
                      {/* Animated Live Vote Bar Fill */}
                      <div
                        className="absolute inset-y-0 right-0 bg-gradient-to-l from-rose-600/30 to-amber-500/15 transition-all duration-300 pointer-events-none"
                        style={{ width: `${pct}%` }}
                      />

                      <div className="relative z-10 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-black text-jma3a-sand truncate">
                            {getPlayerName(candId)}
                          </span>
                          {publicData?.mutedPlayerId === candId && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-950 text-fuchsia-300 border border-fuchsia-500/40">
                              🤐 مسكّت
                            </span>
                          )}
                        </div>

                        {isManager ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() =>
                                dispatch({
                                  type: "ADJUST_CANDIDATE_TALLY",
                                  candidateId: candId,
                                  delta: -1,
                                })
                              }
                              className="w-9 h-9 rounded-xl bg-jma3a-dark hover:bg-black border border-white/15 text-white font-black text-base active:scale-90"
                            >
                              -
                            </button>
                            <span className="w-9 text-center font-mono text-lg font-black text-amber-300">
                              {count}
                            </span>
                            <button
                              onClick={() => {
                                sound.playTick();
                                dispatch({
                                  type: "ADJUST_CANDIDATE_TALLY",
                                  candidateId: candId,
                                  delta: 1,
                                });
                              }}
                              className="w-9 h-9 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-base shadow-md active:scale-90"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-sm font-black text-amber-300 px-2.5 py-1 rounded-lg bg-black/40">
                              {count} أصوات
                            </span>
                            {isAlive && effectiveSettings?.allowPlayerPhoneVotes !== false && (
                              <button
                                onClick={() => {
                                  sound.playCardFlip();
                                  dispatch({
                                    type: "PLAYER_CAST_VOTE",
                                    targetPlayerId: isMyBallot ? "ABSTAIN" : candId,
                                  });
                                }}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 ${
                                  isMyBallot
                                    ? "bg-rose-600 text-white shadow-md"
                                    : "bg-jma3a-dark hover:bg-rose-950 text-jma3a-sand border border-white/15"
                                }`}
                              >
                                {isMyBallot ? "صوّتتي ✅" : "صوّت 🗳️"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {isManager && (
              <div className="space-y-2.5 pt-2 border-t border-jma3a-border/50">
                <button
                  onClick={() => {
                    sound.playGavel();
                    dispatch({ type: "COMMIT_VOTES" });
                  }}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 via-jma3a-terracotta to-amber-600 text-white font-black text-base shadow-xl hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Gavel className="w-5 h-5" />
                  <span>تأكيد الأصوات وإعلان الحكم ⚖️🔥</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => dispatch({ type: "RESET_TALLIES" })}
                    className="py-2.5 rounded-xl bg-jma3a-surface border border-jma3a-border text-xs font-bold text-jma3a-muted hover:text-white"
                  >
                    تصفير العداد (0)
                  </button>
                  <button
                    onClick={() => dispatch({ type: "SKIP_VOTE_NO_ELIMINATION" })}
                    className="py-2.5 rounded-xl bg-jma3a-surface border border-jma3a-border text-xs font-bold text-emerald-300 hover:bg-emerald-950/40"
                  >
                    لا إقصاء اليوم 🕊️
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            PHASE 7B: TIE_DECISION & RUNOFF_DEFENSE ("حسم التعادل ⚔️")
           =================================================================== */}
        {phase === "TIE_DECISION" && (
          <div className="p-6 rounded-3xl bg-jma3a-card border-2 border-amber-400/60 text-center shadow-2xl space-y-5 animate-fadeIn">
            <Swords className="w-12 h-12 text-amber-400 mx-auto animate-pulse" />
            <div>
              <h2 className="text-2xl font-black text-jma3a-sand">تعادل فالأصوات! ⚖️🔥</h2>
              <p className="text-xs text-jma3a-muted mt-1">
                المتعادلين فالمرتبة الأولى:{" "}
                <strong className="text-amber-300">
                  {(publicData?.tiedCandidates || []).map((id: string) => getPlayerName(id)).join(" ⚔️ ")}
                </strong>
              </p>
            </div>

            {isManager ? (
              <div className="space-y-2.5">
                <button
                  onClick={() => dispatch({ type: "START_RUNOFF_DEFENSE" })}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-jma3a-terracotta text-white font-black text-sm shadow-xl active:scale-95"
                >
                  ⚔️ جولة دفاع أمان الحومة ({effectiveSettings?.runoffDefenseSeconds || 30}ث لكل متعادل) ثم إعادة التصويت
                </button>
                <button
                  onClick={() => dispatch({ type: "RESOLVE_TIE_PEACEFUL" })}
                  className="w-full py-3.5 rounded-2xl bg-jma3a-surface border border-jma3a-border text-jma3a-sand font-bold text-xs active:scale-95"
                >
                  🕊️ تطبيق قانون التعادل السلمي (حتى واحد ما يتقصى اليوم)
                </button>
              </div>
            ) : (
              <p className="text-xs text-amber-200 font-bold">
                المانيجر كيحدد واش غادي نديرو جولة دفاع فاصلة أو لا إقصاء...
              </p>
            )}
          </div>
        )}

        {phase === "RUNOFF_DEFENSE" && (
          <div className="p-6 rounded-3xl bg-jma3a-card border-2 border-amber-400/60 text-center shadow-2xl space-y-4 animate-fadeIn">
            <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-black">
              ⚔️ كلمة الدفاع الأخيرة ({publicData.runoffSpeakerIndex + 1} /{" "}
              {(publicData.tiedCandidates || []).length})
            </span>
            <h2 className="text-3xl font-black text-jma3a-sand">
              {getPlayerName(publicData?.currentSpeakerId)}
            </h2>
            <div className="font-mono text-4xl font-black text-amber-300 tabular-nums">
              {timerSeconds}s
            </div>
            {isManager && (
              <button
                onClick={() => dispatch({ type: "NEXT_RUNOFF_SPEAKER" })}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-600 text-white font-black text-sm shadow-xl active:scale-95"
              >
                {publicData.runoffSpeakerIndex + 1 < (publicData.tiedCandidates || []).length
                  ? "المتعادل الموالي ⏭️"
                  : "افتح تصويت الحسم النهائي 🗳️⚖️"}
              </button>
            )}
          </div>
        )}

        {/* ===================================================================
            PHASE 8: DAY_RESOLUTION ("حكم المحكمة قبل الليل ⚖️🌙")
           =================================================================== */}
        {phase === "DAY_RESOLUTION" && (
          <div className="p-6 rounded-3xl bg-jma3a-card/95 border border-jma3a-border text-center shadow-2xl space-y-5 animate-fadeIn">
            {publicData?.lastDayElimination ? (
              <div className="space-y-3 max-w-xs mx-auto">
                <span className="px-3 py-1 rounded-full bg-rose-950 border border-rose-500/40 text-rose-300 text-xs font-black">
                  حكم الحومة نفّذ ⚖️
                </span>
                <h2 className="text-2xl font-black text-jma3a-sand">
                  تم إقصاء {getPlayerName(publicData.lastDayElimination.playerId)}!
                </h2>
                {publicData.lastDayElimination.revealedRole ? (
                  <DiibTarotCard
                    role={publicData.lastDayElimination.revealedRole}
                    playerName={getPlayerName(publicData.lastDayElimination.playerId)}
                    isFlipped={true}
                    compact={true}
                    isDead={true}
                  />
                ) : (
                  <p className="text-xs text-jma3a-muted">الكارطة بقات طي الكتمان 🔒</p>
                )}
              </div>
            ) : (
              <div className="space-y-2 py-3">
                <div className="text-4xl">🕊️</div>
                <h2 className="text-2xl font-black text-emerald-300">
                  النهار سالا بلا إقصاء!
                </h2>
                <p className="text-xs text-jma3a-muted">
                  الظلام بدا كيرجع على زناقي الحومة... وجّدو راسكم لليل جديد!
                </p>
              </div>
            )}

            {isManager ? (
              <button
                onClick={() => {
                  sound.playWolfHowl();
                  dispatch({ type: "NEXT_NIGHT" });
                }}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-rose-600 text-white font-black text-base shadow-xl hover:brightness-110 active:scale-95 flex items-center justify-center gap-2"
              >
                <Moon className="w-5 h-5" />
                <span>طيّح الليلة {round + 1} 🌙</span>
              </button>
            ) : (
              <p className="text-xs text-jma3a-muted">
                كنتسناو المانيجر يطيّح الليلة {round + 1}...
              </p>
            )}
          </div>
        )}

        {/* ===================================================================
            PHASE 9: GAME_OVER ("نهاية الطرح + كشف جميع الكوارط + مانيجر جديد 🏆👑")
           =================================================================== */}
        {phase === "GAME_OVER" && (
          <div className="p-5 sm:p-6 rounded-3xl bg-jma3a-card/95 border-2 border-amber-400/60 shadow-2xl space-y-6 text-center animate-fadeIn">
            <div className="space-y-2">
              <div className="text-5xl">
                {publicData?.winner === "VILLAGE"
                  ? "🏡🎉"
                  : publicData?.winner === "WOLVES"
                  ? "🐺🩸"
                  : "⚔️"}
              </div>
              <h2 className="text-3xl font-black text-jma3a-gold">
                {publicData?.winner === "VILLAGE"
                  ? "انتصرو ولاد الحومة!"
                  : publicData?.winner === "WOLVES"
                  ? "الذيابة سيطرو على الحومة!"
                  : "تعادل أسطوري فالحومة!"}
              </h2>
              <p className="text-xs text-jma3a-sand/80">
                تحية كبيرة للمانيجر{" "}
                <strong className="text-amber-300">👑 {managerPlayer?.nickname}</strong> على تسيير الطرح رقم{" "}
                {matchNumber}!
              </p>
            </div>

            {/* SEAMLESS NEXT GAME + NEW MANAGER CTA (NOBODY LEAVES THE ROOM!) */}
            {(isManager || isHost) && (
              <button
                onClick={() => {
                  sound.playRoyalCrown();
                  dispatch({ type: "NEW_GAME_NEW_MANAGER" });
                }}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-jma3a-terracotta to-jma3a-accent text-white font-black text-base shadow-xl shadow-amber-500/25 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-5 h-5" />
                <span>جولة جديدة + اختيار مانيجر جديد 👑🃏</span>
              </button>
            )}

            {/* Full Illustrated Tarot Table Reveal */}
            {effectivePrivate?.allRoles && (
              <div className="text-right space-y-2.5">
                <h3 className="text-sm font-black text-amber-300">
                  🃏 كشف جميع كوارط الطاولة:
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {players.map((p) => {
                    const pRole = (effectivePrivate.allRoles[p.id] || "villager") as DiibCardRole;
                    const wasDead = (publicData?.deadPlayers || []).some(
                      (d: any) => d.playerId === p.id
                    );
                    return (
                      <DiibTarotCard
                        key={p.id}
                        role={pRole}
                        playerName={p.nickname}
                        isFlipped={true}
                        compact={true}
                        isDead={wasDead}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Match Story Chronicle */}
            {Array.isArray(publicData?.chronicle) && publicData.chronicle.length > 0 && (
              <div className="p-4 rounded-2xl bg-jma3a-surface/75 border border-jma3a-border text-right space-y-2">
                <h4 className="text-xs font-black text-jma3a-gold flex items-center gap-1.5">
                  <ScrollText className="w-4 h-4" />
                  <span>سجل حكاية هاد الطرح:</span>
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs text-jma3a-sand/85">
                  {publicData.chronicle.map((c: any) => (
                    <div
                      key={c.id}
                      className="p-2 rounded-xl bg-black/35 border border-white/5"
                    >
                      {c.summary}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* =====================================================================
          PLAYER SECRET CARD PEEK MODAL (Safe Tap-to-Flip & Auto-Lock)
         ===================================================================== */}
      {peekModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-sm space-y-4 text-center">
            <DiibTarotCard
              role={effectiveRole}
              playerName={players.find((p) => p.id === activePlayerId)?.nickname}
              isFlipped={peekCardFlipped}
              onFlipChange={setPeekCardFlipped}
              packMemberNames={effectivePrivate?.team === "WOLVES" ? packMemberNames : undefined}
            />
            <button
              onClick={() => {
                sound.playCardFlip();
                setPeekCardFlipped(false);
                setPeekModalOpen(false);
              }}
              className="w-full py-3.5 rounded-2xl bg-jma3a-surface hover:bg-jma3a-border border border-amber-400/50 text-jma3a-sand font-black text-sm flex items-center justify-center gap-2"
            >
              <EyeOff className="w-4 h-4 text-amber-400" />
              <span>سد وخبي الكارطة 🔒</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   SUB-COMPONENT: MANAGER NIGHT LEDGER (Guided Step-by-Step + Fast Direct Mode)
   ============================================================================ */
function ManagerNightLedger({
  round,
  players,
  publicData,
  privateData,
  nightInputTab,
  setNightInputTab,
  onAction,
}: {
  round: number;
  players: Array<{ id: string; nickname: string }>;
  publicData: any;
  privateData: any;
  nightInputTab: "GUIDED" | "QUICK";
  setNightInputTab: (tab: "GUIDED" | "QUICK") => void;
  onAction: (action: any) => void;
}) {
  const roster: any[] = privateData?.masterRoster || [];
  const livingRoster = roster.filter((r) => r.isAlive);
  const rolesInPlay: Record<string, { total: number; alive: number }> =
    privateData?.rolesInPlay || {};
  const draft = privateData?.nightDraft || {};
  const outcome = privateData?.computedNightOutcome || { dyingRecords: [] };
  const witch = privateData?.witch || { healAvailable: false, poisonAvailable: false };
  const effectiveSettings = publicData?.effectiveSettings || {};

  const getPlayerName = (id?: string) =>
    players.find((p) => p.id === id)?.nickname || "لاعب";

  const wolvesList = roster.filter((r) => r.team === "WOLVES");
  const hasProtectorInDeck = Boolean(rolesInPlay.protector?.total);
  const isProtectorAlive = Boolean(rolesInPlay.protector?.alive);
  const hasSeerInDeck = Boolean(rolesInPlay.seer?.total);
  const isSeerAlive = Boolean(rolesInPlay.seer?.alive);
  const hasWitchInDeck = Boolean(rolesInPlay.witch?.total);
  const isWitchAlive = Boolean(rolesInPlay.witch?.alive);

  return (
    <div className="p-4 sm:p-6 rounded-3xl bg-[#111623]/95 border-2 border-indigo-400/50 shadow-2xl space-y-5 text-right">
      {/* Header + Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div>
          <span className="text-[11px] font-black text-indigo-300">
            🌙 دفتر المانيجر — الليلة {round}
          </span>
          <h2 className="text-xl font-black text-jma3a-sand">
            سيّر الليل وسجّل شنو وقع فالحومة
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-jma3a-dark border border-jma3a-border shrink-0">
          <button
            onClick={() => {
              onAction({ type: "UPDATE_NIGHT_DRAFT", draft: { useManualOverride: false } });
              setNightInputTab("GUIDED");
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
              nightInputTab === "GUIDED"
                ? "bg-indigo-600 text-white"
                : "text-jma3a-muted hover:text-white"
            }`}
          >
            📜 بالخطوات والقوانين
          </button>
          <button
            onClick={() => setNightInputTab("QUICK")}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
              nightInputTab === "QUICK"
                ? "bg-amber-500 text-jma3a-dark"
                : "text-jma3a-muted hover:text-white"
            }`}
          >
            ⚡ إدخال سريع مباشر
          </button>
        </div>
      </div>

      {nightInputTab === "GUIDED" ? (
        <div className="space-y-4">
          {/* STEP 1: PROTECTOR (الحارس) */}
          {hasProtectorInDeck && (
            <div className="p-4 rounded-2xl bg-sky-950/30 border border-sky-400/35 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-sky-300">
                  1. 🛡️ فيّق الحارس:{" "}
                  {roster
                    .filter((r) => r.role === "protector")
                    .map((r) => getPlayerName(r.playerId))
                    .join("، ")}
                </span>
                {!isProtectorAlive && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-500/40 font-bold">
                    💀 ميت (عيّط عليه بالصوت تمويهاً فقط!)
                  </span>
                )}
              </div>

              {isProtectorAlive && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {livingRoster.map((r) => {
                    const lockedPrev =
                      round > 1 &&
                      effectiveSettings?.preventConsecutiveProtect !== false &&
                      r.wasProtectedLastNight;
                    const selected = draft.protectedId === r.playerId;

                    return (
                      <button
                        key={r.playerId}
                        disabled={lockedPrev}
                        onClick={() =>
                          onAction({
                            type: "UPDATE_NIGHT_DRAFT",
                            draft: {
                              useManualOverride: false,
                              protectedId: selected ? undefined : r.playerId,
                            },
                          })
                        }
                        className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                          lockedPrev
                            ? "opacity-40 bg-black/30 border-white/10 text-jma3a-muted cursor-not-allowed"
                            : selected
                            ? "bg-sky-600 text-white border-sky-300 shadow-md"
                            : "bg-jma3a-surface border-jma3a-border text-jma3a-sand hover:border-sky-400"
                        }`}
                      >
                        <div>{getPlayerName(r.playerId)}</div>
                        {lockedPrev && (
                          <div className="text-[9px] text-amber-300">🚫 تحمى البارح</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: SEER (الشوافة) */}
          {hasSeerInDeck && (
            <div className="p-4 rounded-2xl bg-indigo-950/35 border border-indigo-400/35 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-indigo-300">
                  2. 🔮 فيّق الشوافة:{" "}
                  {roster
                    .filter((r) => r.role === "seer")
                    .map((r) => getPlayerName(r.playerId))
                    .join("، ")}
                </span>
                {!isSeerAlive && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-500/40 font-bold">
                    💀 ميتة (عيّط عليها تمويهاً فقط!)
                  </span>
                )}
              </div>

              {isSeerAlive && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {livingRoster
                      .filter((r) => r.role !== "seer")
                      .map((r) => {
                        const selected = draft.seerInspectId === r.playerId;
                        return (
                          <button
                            key={r.playerId}
                            onClick={() =>
                              onAction({
                                type: "UPDATE_NIGHT_DRAFT",
                                draft: {
                                  seerInspectId: selected ? undefined : r.playerId,
                                },
                              })
                            }
                            className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                              selected
                                ? "bg-indigo-600 text-white border-indigo-300 shadow-md"
                                : "bg-jma3a-surface border-jma3a-border text-jma3a-sand hover:border-indigo-400"
                            }`}
                          >
                            {getPlayerName(r.playerId)}
                          </button>
                        );
                      })}
                  </div>

                  {/* Instant Sign Helper for Manager! */}
                  {outcome.seerInspection && (
                    <div
                      className={`p-3 rounded-xl border text-center font-black text-sm ${
                        outcome.seerInspection.isWolf
                          ? "bg-rose-950/90 border-rose-400 text-rose-200"
                          : "bg-emerald-950/90 border-emerald-400 text-emerald-200"
                      }`}
                    >
                      {outcome.seerInspection.isWolf
                        ? `🐺 ${getPlayerName(outcome.seerInspection.targetId)} ذيب! (عطي للشوافة إشارة ذيب 👍)`
                        : `🕊️ ${getPlayerName(outcome.seerInspection.targetId)} بريء! (عطي للشوافة إشارة بريء 🙅‍♂️)`}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* STEP 3: WOLVES ATTACK & WOLF MUTE (الذيابة + التسكيت) */}
          <div className="p-4 rounded-2xl bg-rose-950/35 border border-rose-500/40 space-y-3">
            <div>
              <span className="text-sm font-black text-rose-300 block">
                3. 🐺 فيّق الذيابة:{" "}
                {wolvesList
                  .map(
                    (w) =>
                      `${getPlayerName(w.playerId)}${w.role === "mute_wolf" ? " (السكّات 🤐)" : ""}${
                        !w.isAlive ? " 💀" : ""
                      }`
                  )
                  .join(" ، ")}
              </span>
              <span className="text-[11px] text-jma3a-muted">
                عزلو ضحية الهجوم 💀، وعزلو شكون غادي يتسكّت بالنهار 🤐:
              </span>
            </div>

            {/* 3A: Wolf Attack Victim */}
            <div>
              <div className="text-xs font-black text-rose-200 mb-1.5">
                🩸 شكون بغاو ياكلو الذيابة هاد الليلة؟
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {livingRoster
                  .filter((r) => r.team !== "WOLVES")
                  .map((r) => {
                    const selected = draft.wolfTargetId === r.playerId;
                    const isShielded = draft.protectedId === r.playerId;
                    return (
                      <button
                        key={r.playerId}
                        onClick={() =>
                          onAction({
                            type: "UPDATE_NIGHT_DRAFT",
                            draft: {
                              useManualOverride: false,
                              wolfTargetId: selected ? undefined : r.playerId,
                            },
                          })
                        }
                        className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                          selected
                            ? "bg-rose-600 text-white border-rose-300 shadow-md"
                            : "bg-jma3a-surface border-jma3a-border text-jma3a-sand hover:border-rose-400"
                        }`}
                      >
                        <div>{getPlayerName(r.playerId)}</div>
                        {isShielded && (
                          <div className="text-[9px] text-sky-300 font-black">🛡️ محمي بالحارس</div>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* 3B: Wolf Mute Target */}
            {effectiveSettings?.muteRule !== "OFF" && (
              <div className="pt-2 border-t border-rose-500/20">
                <div className="text-xs font-black text-fuchsia-300 mb-1.5">
                  🤐 شكون سكّتو الذيابة للنهار الجاي؟ (ممنوع يهضر!)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {livingRoster.map((r) => {
                    const lockedPrev =
                      round > 1 &&
                      effectiveSettings?.preventConsecutiveMute !== false &&
                      r.wasMutedLastNight;
                    const selected = draft.mutedTargetId === r.playerId;
                    return (
                      <button
                        key={r.playerId}
                        disabled={lockedPrev}
                        onClick={() => {
                          sound.playMuteSeal();
                          onAction({
                            type: "UPDATE_NIGHT_DRAFT",
                            draft: {
                              mutedTargetId: selected ? undefined : r.playerId,
                            },
                          });
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                          lockedPrev
                            ? "opacity-40 bg-black/30 border-white/10 text-jma3a-muted cursor-not-allowed"
                            : selected
                            ? "bg-fuchsia-600 text-white border-fuchsia-300 shadow-md"
                            : "bg-jma3a-surface border-jma3a-border text-jma3a-sand hover:border-fuchsia-400"
                        }`}
                      >
                        <div>{getPlayerName(r.playerId)}</div>
                        {lockedPrev && (
                          <div className="text-[9px] text-amber-300">🚫 تسكّت البارح</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* STEP 4: WITCH (السحارة) */}
          {hasWitchInDeck && (
            <div className="p-4 rounded-2xl bg-emerald-950/35 border border-emerald-400/35 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-emerald-300">
                  4. 🧪 فيّق السحارة:{" "}
                  {roster
                    .filter((r) => r.role === "witch")
                    .map((r) => getPlayerName(r.playerId))
                    .join("، ")}
                </span>
                {!isWitchAlive && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-500/40 font-bold">
                    💀 ميتة (عيّط عليها تمويهاً فقط!)
                  </span>
                )}
              </div>

              {isWitchAlive && (
                <div className="space-y-2.5">
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-jma3a-sand">
                    ضحية الذيابة لي غادي تشير ليها:{" "}
                    <strong className="text-rose-300">
                      {draft.wolfTargetId && draft.wolfTargetId !== draft.protectedId
                        ? getPlayerName(draft.wolfTargetId)
                        : "حتى واحد ما معرّض للموت دابا 🕊️"}
                    </strong>
                  </div>

                  {/* Heal Potion Toggle */}
                  <button
                    disabled={
                      !witch.healAvailable ||
                      !draft.wolfTargetId ||
                      draft.wolfTargetId === draft.protectedId
                    }
                    onClick={() =>
                      onAction({
                        type: "UPDATE_NIGHT_DRAFT",
                        draft: {
                          useManualOverride: false,
                          witchSave: !draft.witchSave,
                        },
                      })
                    }
                    className={`w-full p-3 rounded-xl border text-xs font-black flex items-center justify-between transition-all ${
                      !witch.healAvailable
                        ? "opacity-45 bg-black/30 border-white/10 text-jma3a-muted cursor-not-allowed"
                        : draft.witchSave
                        ? "bg-emerald-600 text-white border-emerald-300 shadow-md"
                        : "bg-jma3a-surface border-emerald-500/40 text-emerald-200"
                    }`}
                  >
                    <span>❤️ قرعة الحياة (عتق ضحية الذيابة)</span>
                    <span>
                      {!witch.healAvailable
                        ? "مستهلكة سابقاً ❌"
                        : draft.witchSave
                        ? "تستعملات دابا ✅"
                        : "متاحة (1)"}
                    </span>
                  </button>

                  {/* Poison Target Grid */}
                  {witch.poisonAvailable ? (
                    <div className="space-y-1.5">
                      <div className="text-xs font-bold text-purple-300">
                        💀 قرعة السم (إيلا بغات تسمّم شي حد هاد الليلة):
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {livingRoster
                          .filter((r) => r.role !== "witch")
                          .map((r) => {
                            const poisoned = draft.witchPoisonId === r.playerId;
                            return (
                              <button
                                key={r.playerId}
                                onClick={() =>
                                  onAction({
                                    type: "UPDATE_NIGHT_DRAFT",
                                    draft: {
                                      useManualOverride: false,
                                      witchPoisonId: poisoned ? undefined : r.playerId,
                                    },
                                  })
                                }
                                className={`p-2 rounded-xl border text-xs font-bold transition-all ${
                                  poisoned
                                    ? "bg-purple-600 text-white border-purple-300 shadow-md"
                                    : "bg-jma3a-surface border-jma3a-border text-jma3a-sand hover:border-purple-400"
                                }`}
                              >
                                {getPlayerName(r.playerId)} {poisoned ? "🧪" : ""}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 rounded-xl bg-black/30 border border-white/10 text-center text-xs text-jma3a-muted">
                      💀 قرعة السم استهلكاتها السحارة فليلة سابقة
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* QUICK DIRECT MODE: Instant Who Died + Who Was Muted */
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-rose-950/35 border border-rose-500/40 space-y-2.5">
            <div className="text-sm font-black text-rose-300">
              💀 كليكي على شكون مات هاد الليلة (تقدر تختار 0، 1 أو أكثر):
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {livingRoster.map((r) => {
                const isDying = (outcome.dyingRecords || []).some(
                  (d: any) => d.playerId === r.playerId
                );
                return (
                  <button
                    key={r.playerId}
                    onClick={() =>
                      onAction({
                        type: "TOGGLE_MANUAL_NIGHT_DEATH",
                        targetPlayerId: r.playerId,
                      })
                    }
                    className={`p-3 rounded-xl border text-xs font-black transition-all ${
                      isDying
                        ? "bg-rose-600 text-white border-rose-300 shadow-md"
                        : "bg-jma3a-surface border-jma3a-border text-jma3a-sand"
                    }`}
                  >
                    {getPlayerName(r.playerId)} {isDying ? "💀" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-fuchsia-950/35 border border-fuchsia-500/40 space-y-2.5">
            <div className="text-sm font-black text-fuchsia-300">
              🤐 شكون سكّتو الذيابة للنهار الجاي؟
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {livingRoster.map((r) => {
                const selected = draft.mutedTargetId === r.playerId;
                return (
                  <button
                    key={r.playerId}
                    onClick={() => {
                      sound.playMuteSeal();
                      onAction({
                        type: "UPDATE_NIGHT_DRAFT",
                        draft: { mutedTargetId: selected ? undefined : r.playerId },
                      });
                    }}
                    className={`p-3 rounded-xl border text-xs font-black transition-all ${
                      selected
                        ? "bg-fuchsia-600 text-white border-fuchsia-300 shadow-md"
                        : "bg-jma3a-surface border-jma3a-border text-jma3a-sand"
                    }`}
                  >
                    {getPlayerName(r.playerId)} {selected ? "🤐" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* LIVE MORNING OUTCOME PREVIEW + COMMIT BUTTON */}
      <div className="p-4 rounded-2xl bg-black/55 border border-amber-400/40 space-y-3">
        <div className="text-xs font-bold text-jma3a-sand flex flex-wrap items-center justify-between gap-2">
          <span>
            📋 ملخص الفجر:{" "}
            {(outcome.dyingRecords || []).length === 0 ? (
              <strong className="text-emerald-300">حتى واحد ما مات 🕊️</strong>
            ) : (
              <strong className="text-rose-400">
                مات:{" "}
                {outcome.dyingRecords.map((d: any) => getPlayerName(d.playerId)).join(" ، ")} 💀
              </strong>
            )}
          </span>
          <span>
            المسكّت:{" "}
            <strong className="text-fuchsia-300">
              {outcome.mutedId ? `${getPlayerName(outcome.mutedId)} 🤐` : "حتى واحد"}
            </strong>
          </span>
        </div>

        <button
          onClick={() => onAction({ type: "COMMIT_NIGHT" })}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-jma3a-terracotta to-jma3a-accent text-white font-black text-base shadow-xl hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <Sun className="w-5 h-5" />
          <span>طلّع النهار وأعلن أخبار الصباح للجميع! ☀️📣</span>
        </button>
      </div>
    </div>
  );
}
