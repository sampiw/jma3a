import {
  GameDefinition,
  GameContext,
  ValidationResult,
  TransitionResult,
  GameEndResult,
} from "@/games/registry";
import { Player, PublicGameView, PrivatePlayerGameView } from "@/lib/types";
import {
  MawjaState,
  MawjaSettings,
  MawjaAction,
  MawjaSpectrum,
  MawjaGuessEvaluation,
  MawjaScoreZone,
  MawjaRoundResult,
  MawjaPlayerAward,
} from "./types";
import { drawRandomSpectrums, getSpectrumById } from "./spectrums";

function randomTarget(): number {
  // Keep target between 6 and 94 so the bullseye zone always fits cleanly on the 0-100 scale
  return Math.floor(Math.random() * 89) + 6;
}

export function evaluateZone(diff: number): { zone: MawjaScoreZone; basePoints: number } {
  if (diff <= 4) return { zone: "BULLSEYE", basePoints: 4 };
  if (diff <= 11) return { zone: "INNER", basePoints: 3 };
  if (diff <= 19) return { zone: "OUTER", basePoints: 2 };
  return { zone: "MISS", basePoints: 0 };
}

function resolveMawjaRound(
  state: MawjaState,
  players: Player[],
  settings: MawjaSettings
): TransitionResult<MawjaState> {
  const nextState: MawjaState = structuredClone(state);
  const target = nextState.targetValue;
  const guessEntries = Object.values(nextState.guesses);

  // Determine closest diff among all submitted guesses
  let minDiff = Infinity;
  for (const g of guessEntries) {
    const d = Math.abs(g.value - target);
    if (d < minDiff) minDiff = d;
  }

  // Only players who at least hit OUTER zone (diff <= 19) qualify as "closest" for side-bets
  const closestPlayerIds =
    minDiff <= 19
      ? guessEntries
          .filter((g) => Math.abs(g.value - target) === minDiff)
          .map((g) => g.playerId)
      : [];

  const evaluations: MawjaGuessEvaluation[] = [];
  let scoredReceiversCount = 0;
  let bullseyeHitCount = 0;

  for (const g of guessEntries) {
    const diff = Math.abs(g.value - target);
    const { zone, basePoints } = evaluateZone(diff);

    if (basePoints > 0) scoredReceiversCount += 1;
    if (zone === "BULLSEYE") {
      bullseyeHitCount += 1;
      nextState.bullseyeCount[g.playerId] = (nextState.bullseyeCount[g.playerId] || 0) + 1;
    }

    let doubleDownDelta = 0;
    if (g.doubleDown) {
      // Consume 1 chip
      nextState.doubleDownChipsLeft[g.playerId] = Math.max(
        0,
        (nextState.doubleDownChipsLeft[g.playerId] || 0) - 1
      );
      if (zone === "BULLSEYE" || zone === "INNER") {
        doubleDownDelta = basePoints; // Doubles 4 -> 8 or 3 -> 6
        nextState.doubleDownWins[g.playerId] = (nextState.doubleDownWins[g.playerId] || 0) + 1;
      } else if (zone === "OUTER") {
        doubleDownDelta = 1; // 2 -> 3
        nextState.doubleDownWins[g.playerId] = (nextState.doubleDownWins[g.playerId] || 0) + 1;
      } else {
        doubleDownDelta = -1; // Miss penalty when doubling down
      }
    }

    const sideBetWon = Boolean(
      g.predictedBestPlayerId &&
        closestPlayerIds.includes(g.predictedBestPlayerId) &&
        (guessEntries.length === 1 || g.predictedBestPlayerId !== g.playerId)
    );

    const totalDelta = Math.max(
      -1,
      basePoints + doubleDownDelta + (sideBetWon ? 1 : 0)
    );

    nextState.scores[g.playerId] = Math.max(
      0,
      (nextState.scores[g.playerId] || 0) + totalDelta
    );

    evaluations.push({
      playerId: g.playerId,
      value: g.value,
      diff,
      zone,
      basePoints,
      doubleDown: g.doubleDown,
      doubleDownDelta,
      predictedBestPlayerId: g.predictedBestPlayerId,
      sideBetWon,
      totalDelta,
    });
  }

  // Sort evaluations by closest first
  evaluations.sort((a, b) => a.diff - b.diff);

  // Transmitter scoring:
  // +1 pt for each receiver who landed in a scoring zone (diff <= 19)
  // +2 bonus pts if at least one receiver hit BULLSEYE!
  let transmitterPoints = scoredReceiversCount;
  if (bullseyeHitCount > 0) {
    transmitterPoints += 2;
  }

  nextState.scores[nextState.transmitterId] =
    (nextState.scores[nextState.transmitterId] || 0) + transmitterPoints;
  nextState.transmitterPointsTotal[nextState.transmitterId] =
    (nextState.transmitterPointsTotal[nextState.transmitterId] || 0) + transmitterPoints;

  // Generate Moroccan Darija commentary
  let headline = "";
  let commentary = "";

  if (bullseyeHitCount > 0) {
    headline = "تخاطر روحاني 100%! فوسط الهدف 🎯⚡";
    commentary = `واحد أو أكثر جابو التردد فـ القلب النابض (${target}%)! مول الموجة والمستقبلين دماغهم راكب على نفس الخيط.`;
  } else if (scoredReceiversCount === guessEntries.length && guessEntries.length > 0) {
    headline = "موجة صافية! الكل التقط الإشارة 📡✨";
    commentary = `التردد السري كان هو ${target}%، والجميع دخل فـ منطقة النقاط بلا ما يزكلها حتى واحد!`;
  } else if (scoredReceiversCount > 0) {
    headline = "إشارة نص نص... كاين لي قرا الدماغ وكاين لي تلف 🎛️😄";
    commentary = `الهدف كان فـ ${target}%. شي وحدين قربو بزاف، والباقي كان عندهم التشويش فالرادار!`;
  } else {
    headline = "انقطاع التغطية! التشويش التام فالرادار 😂💥";
    commentary = `الهدف كان فـ ${target}%، ولكن حتى واحد ما قدر يشد الموجة! واش التلميح كان طلاسم ولا الجماعة سارحة؟`;
  }

  const roundResult: MawjaRoundResult = {
    round: nextState.round,
    transmitterId: nextState.transmitterId,
    spectrum: nextState.currentSpectrum,
    clue: nextState.currentClue || "",
    targetValue: target,
    evaluations,
    transmitterPoints,
    closestPlayerIds,
    headline,
    commentary,
  };

  nextState.lastRoundResult = roundResult;
  nextState.history.push(roundResult);
  nextState.phase = "ROUND_REVEAL";

  return {
    success: true,
    newState: nextState,
    newPhase: "ROUND_REVEAL",
  };
}

function computeAwards(state: MawjaState, players: Player[]): MawjaPlayerAward[] {
  const awards: MawjaPlayerAward[] = [];

  // 1. Mind Reader (Most Bullseyes)
  const topBullseye = [...players].sort(
    (a, b) => (state.bullseyeCount[b.id] || 0) - (state.bullseyeCount[a.id] || 0)
  )[0];
  if (topBullseye && (state.bullseyeCount[topBullseye.id] || 0) > 0) {
    awards.push({
      playerId: topBullseye.id,
      title: "قارئ العقول",
      subtitle: `ضرب الهدف فـ القلب ${state.bullseyeCount[topBullseye.id]} مرات`,
      badge: "🧠🎯",
    });
  }

  // 2. Master Transmitter
  const topTransmitter = [...players].sort(
    (a, b) =>
      (state.transmitterPointsTotal[b.id] || 0) -
      (state.transmitterPointsTotal[a.id] || 0)
  )[0];
  if (topTransmitter && (state.transmitterPointsTotal[topTransmitter.id] || 0) > 0) {
    awards.push({
      playerId: topTransmitter.id,
      title: "ملك الإشارة",
      subtitle: `جمع ${state.transmitterPointsTotal[topTransmitter.id]} نقط من تلميحاتو الذكية`,
      badge: "📡👑",
    });
  }

  // 3. High Roller
  const topGambler = [...players].sort(
    (a, b) => (state.doubleDownWins[b.id] || 0) - (state.doubleDownWins[a.id] || 0)
  )[0];
  if (topGambler && (state.doubleDownWins[topGambler.id] || 0) > 0) {
    awards.push({
      playerId: topGambler.id,
      title: "المقامر الجريء",
      subtitle: `ربح الرهان المضاعف (x2) ${state.doubleDownWins[topGambler.id]} مرات`,
      badge: "🔥🎲",
    });
  }

  return awards;
}

export const MawjaEngine: GameDefinition<MawjaState, MawjaAction, MawjaSettings> = {
  id: "mawja",
  slug: "mawja",
  version: 1,
  displayNameKey: "موجة (Mawja) 📡🧠",
  shortDescriptionKey: "لعبة قراءة العقول، الترددات النفسية، والرهان السري بالتليفونات",
  minPlayers: 2,
  maxPlayers: 16,
  capabilities: ["MULTI_PHONE", "SCORES", "REALTIME", "ANONYMOUS_VOTING"],
  defaultSettings: {
    targetScore: 15,
    maxRounds: 8,
    doubleDownChipsPerPlayer: 2,
    interactionMode: "MULTI_PHONE",
  },

  validateSetup(players: Player[], _settings: MawjaSettings): ValidationResult {
    if (players.length < 2) {
      return {
        isValid: false,
        errors: ["خاص على الأقل 2 لاعبين باش تبدا لعبة موجة!"],
      };
    }
    if (players.length > 16) {
      return {
        isValid: false,
        errors: ["الحد الأقصى هو 16 لاعب."],
      };
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: MawjaSettings): MawjaState {
    const transmitterOrder = players.map((p) => p.id);
    const candidates = drawRandomSpectrums(3, []);
    const scores: Record<string, number> = {};
    const doubleDownChipsLeft: Record<string, number> = {};
    const bullseyeCount: Record<string, number> = {};
    const transmitterPointsTotal: Record<string, number> = {};
    const doubleDownWins: Record<string, number> = {};

    for (const p of players) {
      scores[p.id] = 0;
      doubleDownChipsLeft[p.id] = settings.doubleDownChipsPerPlayer ?? 2;
      bullseyeCount[p.id] = 0;
      transmitterPointsTotal[p.id] = 0;
      doubleDownWins[p.id] = 0;
    }

    return {
      phase: "TRANSMITTER_SELECT",
      round: 1,
      transmitterOrder,
      transmitterIndex: 0,
      transmitterId: transmitterOrder[0],
      usedSpectrumIds: [candidates[0].id],
      candidateSpectrums: candidates,
      currentSpectrum: candidates[0],
      targetValue: randomTarget(),
      guesses: {},
      scores,
      doubleDownChipsLeft,
      bullseyeCount,
      transmitterPointsTotal,
      doubleDownWins,
      history: [],
    };
  },

  start(ctx: GameContext<MawjaState, MawjaSettings>): TransitionResult<MawjaState> {
    return {
      success: true,
      newState: ctx.state,
      newPhase: ctx.state.phase,
    };
  },

  handleAction(
    ctx: GameContext<MawjaState, MawjaSettings>,
    actorPlayerId: string,
    action: MawjaAction
  ): TransitionResult<MawjaState> {
    const state = structuredClone(ctx.state);
    const isHost = ctx.players.find((p) => p.id === actorPlayerId)?.isHost ?? false;

    switch (action.type) {
      case "REROLL_SPECTRUMS": {
        if (state.phase !== "TRANSMITTER_SELECT") {
          return { success: false, newState: state, newPhase: state.phase, error: "ما يمكنش تبدل الطيف دابا" };
        }
        if (actorPlayerId !== state.transmitterId) {
          return { success: false, newState: state, newPhase: state.phase, error: "غير مول الموجة لي يقدر يبدل الطيف" };
        }
        const newCandidates = drawRandomSpectrums(3, state.usedSpectrumIds);
        state.candidateSpectrums = newCandidates;
        state.currentSpectrum = newCandidates[0];
        return {
          success: true,
          newState: state,
          newPhase: state.phase,
        };
      }

      case "SELECT_SPECTRUM": {
        if (state.phase !== "TRANSMITTER_SELECT") {
          return { success: false, newState: state, newPhase: state.phase, error: "المرحلة ما كتسمحش" };
        }
        if (actorPlayerId !== state.transmitterId) {
          return { success: false, newState: state, newPhase: state.phase, error: "غير مول الموجة لي يقدر يختار" };
        }
        const found =
          state.candidateSpectrums.find((s) => s.id === action.spectrumId) ||
          getSpectrumById(action.spectrumId);
        if (!found) {
          return { success: false, newState: state, newPhase: state.phase, error: "هاد الطيف ما كاينش" };
        }
        state.currentSpectrum = found;
        return {
          success: true,
          newState: state,
          newPhase: state.phase,
        };
      }

      case "SUBMIT_CLUE": {
        if (state.phase !== "TRANSMITTER_SELECT") {
          return { success: false, newState: state, newPhase: state.phase, error: "تم إرسال التلميح من قبل" };
        }
        if (actorPlayerId !== state.transmitterId) {
          return { success: false, newState: state, newPhase: state.phase, error: "غير مول الموجة لي كيعطي الإشارة" };
        }

        const cleanClue = (action.clue || "").trim();
        if (!cleanClue) {
          return { success: false, newState: state, newPhase: state.phase, error: "عفاك اكتب الإشارة أو التلميح ديالك" };
        }
        if (cleanClue.length > 100) {
          return { success: false, newState: state, newPhase: state.phase, error: "التلميح طويل بزاف! خليه مختصر وذكي" };
        }
        // Prevent cheating with numbers/percentages
        if (/\d/.test(cleanClue) || cleanClue.includes("%") || cleanClue.includes("فالمية")) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: "ممنوع تستعمل الأرقام أو النسب المئوية فالتلميح! عطي فكرة أو مثال 🧠",
          };
        }

        if (action.customLeft?.trim() && action.customRight?.trim()) {
          const customSpec: MawjaSpectrum = {
            id: "custom_" + Date.now(),
            leftLabel: action.customLeft.trim().slice(0, 45),
            rightLabel: action.customRight.trim().slice(0, 45),
            category: "spicy",
            categoryLabel: "✨ طيف من إبداعكم",
          };
          state.currentSpectrum = customSpec;
        } else if (action.spectrumId) {
          const found =
            state.candidateSpectrums.find((s) => s.id === action.spectrumId) ||
            getSpectrumById(action.spectrumId);
          if (found) state.currentSpectrum = found;
        }

        if (!state.usedSpectrumIds.includes(state.currentSpectrum.id)) {
          state.usedSpectrumIds.push(state.currentSpectrum.id);
        }

        state.currentClue = cleanClue;
        state.guesses = {};
        state.phase = "RECEIVERS_TUNE";

        return {
          success: true,
          newState: state,
          newPhase: "RECEIVERS_TUNE",
        };
      }

      case "LOCK_GUESS": {
        if (state.phase !== "RECEIVERS_TUNE") {
          return { success: false, newState: state, newPhase: state.phase, error: "سالينا مرحلة ضبط التردد" };
        }
        if (actorPlayerId === state.transmitterId) {
          return { success: false, newState: state, newPhase: state.phase, error: "أنت هو مول الموجة، ما كتصوتش فهاد الجولة" };
        }

        const clampedVal = Math.round(Math.max(0, Math.min(100, Number(action.value) || 50)));
        const canDouble = Boolean(
          action.doubleDown && (state.doubleDownChipsLeft[actorPlayerId] || 0) > 0
        );

        state.guesses[actorPlayerId] = {
          playerId: actorPlayerId,
          value: clampedVal,
          doubleDown: canDouble,
          predictedBestPlayerId: action.predictedBestPlayerId || undefined,
          lockedAt: Date.now(),
        };

        const receivers = ctx.players.filter((p) => p.id !== state.transmitterId);
        const allLocked = receivers.every((r) => Boolean(state.guesses[r.id]));

        if (allLocked) {
          return resolveMawjaRound(state, ctx.players, ctx.settings);
        }

        return {
          success: true,
          newState: state,
          newPhase: "RECEIVERS_TUNE",
        };
      }

      case "FORCE_REVEAL": {
        if (state.phase !== "RECEIVERS_TUNE") {
          return { success: false, newState: state, newPhase: state.phase, error: "المرحلة ماشي ديال الكشف" };
        }
        if (actorPlayerId !== state.transmitterId && !isHost) {
          return { success: false, newState: state, newPhase: state.phase, error: "غير مول الغرفة أو مول الموجة لي يقدر يكشف النتائج" };
        }
        if (Object.keys(state.guesses).length === 0) {
          return { success: false, newState: state, newPhase: state.phase, error: "خاص على الأقل لاعب واحد يقفل التردد ديالو" };
        }
        return resolveMawjaRound(state, ctx.players, ctx.settings);
      }

      case "NEXT_ROUND": {
        if (state.phase !== "ROUND_REVEAL") {
          return { success: false, newState: state, newPhase: state.phase, error: "مازال ما سالاتش الجولة" };
        }
        if (!isHost && actorPlayerId !== state.transmitterId) {
          return { success: false, newState: state, newPhase: state.phase, error: "غير المضيف أو مول الموجة يقدر يدوز للجولة الجاية" };
        }

        // Check if game should finish
        const maxScore = Math.max(...Object.values(state.scores), 0);
        const targetScore = ctx.settings.targetScore || 15;
        const maxRounds = ctx.settings.maxRounds || 8;

        if (maxScore >= targetScore || state.round >= maxRounds) {
          const sortedPlayers = [...ctx.players].sort(
            (a, b) => (state.scores[b.id] || 0) - (state.scores[a.id] || 0)
          );
          state.winnerId = sortedPlayers[0]?.id;
          state.awards = computeAwards(state, ctx.players);
          state.phase = "GAME_OVER";

          return {
            success: true,
            newState: state,
            newPhase: "GAME_OVER",
          };
        }

        // Advance to next round
        const activePlayerIds = ctx.players.map((p) => p.id);
        state.transmitterOrder = activePlayerIds;
        state.transmitterIndex = (state.transmitterIndex + 1) % activePlayerIds.length;
        state.transmitterId = activePlayerIds[state.transmitterIndex];
        state.round += 1;

        const nextCandidates = drawRandomSpectrums(3, state.usedSpectrumIds);
        state.candidateSpectrums = nextCandidates;
        state.currentSpectrum = nextCandidates[0];
        state.targetValue = randomTarget();
        state.currentClue = undefined;
        state.guesses = {};
        state.phase = "TRANSMITTER_SELECT";

        return {
          success: true,
          newState: state,
          newPhase: "TRANSMITTER_SELECT",
          newRound: state.round,
        };
      }

      case "RESTART_GAME": {
        const fresh = this.createInitialState(ctx.players, ctx.settings);
        return {
          success: true,
          newState: fresh,
          newPhase: fresh.phase,
          newRound: 1,
        };
      }

      default:
        return { success: false, newState: state, newPhase: state.phase, error: "حركة غير معروفة" };
    }
  },

  getPublicView(ctx: GameContext<MawjaState, MawjaSettings>): PublicGameView {
    const { state } = ctx;
    const isRevealed = state.phase === "ROUND_REVEAL" || state.phase === "GAME_OVER";
    const receivers = ctx.players.filter((p) => p.id !== state.transmitterId);

    return {
      gameId: "mawja",
      phase: state.phase,
      round: state.round,
      stateVersion: ctx.stateVersion,
      publicData: {
        phase: state.phase,
        round: state.round,
        targetScore: ctx.settings.targetScore || 15,
        maxRounds: ctx.settings.maxRounds || 8,
        transmitterId: state.transmitterId,
        currentSpectrum: state.currentSpectrum,
        currentClue: state.currentClue,
        // NEVER leak targetValue before ROUND_REVEAL!
        targetValue: isRevealed ? state.targetValue : undefined,
        lockedPlayerIds: Object.keys(state.guesses),
        doubleDownPlayerIds: Object.values(state.guesses)
          .filter((g) => g.doubleDown)
          .map((g) => g.playerId),
        totalReceiversCount: receivers.length,
        scores: state.scores,
        doubleDownChipsLeft: state.doubleDownChipsLeft,
        lastRoundResult: state.lastRoundResult,
        winnerId: state.winnerId,
        awards: state.awards,
      },
    };
  },

  getPlayerView(
    ctx: GameContext<MawjaState, MawjaSettings>,
    playerId: string
  ): PrivatePlayerGameView {
    const { state } = ctx;
    const isTransmitter = playerId === state.transmitterId;
    const isRevealed = state.phase === "ROUND_REVEAL" || state.phase === "GAME_OVER";
    const isHost = ctx.players.find((p) => p.id === playerId)?.isHost ?? false;

    const allowedActions: string[] = [];
    if (state.phase === "TRANSMITTER_SELECT" && isTransmitter) {
      allowedActions.push("REROLL_SPECTRUMS", "SELECT_SPECTRUM", "SUBMIT_CLUE");
    } else if (state.phase === "RECEIVERS_TUNE") {
      if (!isTransmitter) allowedActions.push("LOCK_GUESS");
      if (isTransmitter || isHost) allowedActions.push("FORCE_REVEAL");
    } else if (state.phase === "ROUND_REVEAL" && (isHost || isTransmitter)) {
      allowedActions.push("NEXT_ROUND");
    }

    return {
      playerId,
      isHost,
      myRole: isTransmitter ? "TRANSMITTER" : "RECEIVER",
      privateData: {
        isTransmitter,
        // Only the transmitter sees the secret target before ROUND_REVEAL
        secretTargetValue: isTransmitter || isRevealed ? state.targetValue : undefined,
        candidateSpectrums: isTransmitter ? state.candidateSpectrums : [],
        myGuess: state.guesses[playerId] || null,
        myDoubleDownChips: state.doubleDownChipsLeft[playerId] ?? 0,
      },
      allowedActions,
    };
  },

  checkFinished(ctx: GameContext<MawjaState, MawjaSettings>): GameEndResult | null {
    if (ctx.state.phase !== "GAME_OVER") return null;

    const winnerPlayer = ctx.players.find((p) => p.id === ctx.state.winnerId);
    const scoreboard = ctx.players
      .map((p) => ({
        id: p.id,
        label: p.nickname,
        score: ctx.state.scores[p.id] || 0,
      }))
      .sort((a, b) => b.score - a.score);

    return {
      isFinished: true,
      winner: {
        players: ctx.state.winnerId ? [ctx.state.winnerId] : [],
        summary: `فاز ${winnerPlayer?.nickname || "البطل"} بلعبة موجة! 📡🧠`,
      },
      scoreboard,
    };
  },
};
