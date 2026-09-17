import { GameCapability, Player, PublicGameView, PrivatePlayerGameView } from "@/lib/types";
import { GameContext, GameDefinition, GameEndResult, TransitionResult, ValidationResult } from "@/games/registry";
import chkonFinaContent from "@/content/chkon-fina.json";

export interface ChkonFinaSettings {
  allowSelfVote: boolean;
  anonymousBallots: boolean;
  totalRounds: number;
}

export interface ChkonFinaState {
  currentPrompt: { id: string; prompt: string; category: string };
  usedPromptIds: string[];
  phase: "READ_PROMPT" | "VOTING" | "REVEAL_RESULTS" | "GAME_OVER";
  round: number;
  votes: Record<string, string>; // voterPlayerId -> candidatePlayerId
  results?: {
    counts: Record<string, number>;
    percentages: Record<string, number>;
    topCandidateId?: string;
    isUnanimous: boolean;
  };
  totalScores: Record<string, number>; // times voted for
}

export type ChkonFinaAction =
  | { type: "CAST_VOTE"; targetPlayerId: string }
  | { type: "REVEAL_RESULTS" }
  | { type: "NEXT_PROMPT" };

function pickNextPrompt(usedIds: string[]): { id: string; prompt: string; category: string } {
  const unused = chkonFinaContent.prompts.filter((p) => !usedIds.includes(p.id));
  const pool = unused.length > 0 ? unused : chkonFinaContent.prompts;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { id: picked.id, prompt: picked.prompt, category: picked.category };
}

export const ChkonFinaEngine: GameDefinition<ChkonFinaState, ChkonFinaAction, ChkonFinaSettings> = {
  id: "chkon-fina",
  slug: "chkon-fina",
  version: 1,
  displayNameKey: "chkonFina.name",
  shortDescriptionKey: "chkonFina.description",
  minPlayers: 3,
  maxPlayers: 20,
  capabilities: [
    "MULTI_PHONE",
    "ONE_PHONE",
    "ANONYMOUS_VOTING",
    "REALTIME",
    "SCORES",
  ],
  defaultSettings: {
    allowSelfVote: false,
    anonymousBallots: true,
    totalRounds: 8,
  },

  validateSetup(players: Player[], settings: ChkonFinaSettings): ValidationResult {
    if (players.length < 3) {
      return { isValid: false, errors: ["شكون فينا؟ كتحتاج على الأقل 3 لاعبين."] };
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: ChkonFinaSettings): ChkonFinaState {
    const firstPrompt = pickNextPrompt([]);
    const totalScores: Record<string, number> = {};
    players.forEach((p) => (totalScores[p.id] = 0));

    return {
      currentPrompt: firstPrompt,
      usedPromptIds: [firstPrompt.id],
      phase: "VOTING",
      round: 1,
      votes: {},
      totalScores,
    };
  },

  start(ctx: GameContext<ChkonFinaState, ChkonFinaSettings>): TransitionResult<ChkonFinaState> {
    return {
      success: true,
      newState: {
        ...ctx.state,
        phase: "VOTING",
      },
      newPhase: "VOTING",
    };
  },

  handleAction(
    ctx: GameContext<ChkonFinaState, ChkonFinaSettings>,
    actorPlayerId: string,
    action: ChkonFinaAction
  ): TransitionResult<ChkonFinaState> {
    const { state, settings, players } = ctx;

    switch (action.type) {
      case "CAST_VOTE": {
        if (state.phase !== "VOTING") {
          return { success: false, newState: state, newPhase: state.phase, error: "Not voting phase" };
        }
        if (!settings.allowSelfVote && action.targetPlayerId === actorPlayerId) {
          return { success: false, newState: state, newPhase: state.phase, error: "Self-voting is not allowed" };
        }

        const newVotes = {
          ...state.votes,
          [actorPlayerId]: action.targetPlayerId,
        };

        // If everyone has voted, auto-advance to REVEAL_RESULTS
        if (Object.keys(newVotes).length >= players.length) {
          return resolveChkonFinaVotes(state, newVotes, players.length);
        }

        return {
          success: true,
          newState: {
            ...state,
            votes: newVotes,
          },
          newPhase: state.phase,
        };
      }

      case "REVEAL_RESULTS": {
        return resolveChkonFinaVotes(state, state.votes, players.length);
      }

      case "NEXT_PROMPT": {
        if (state.round >= settings.totalRounds) {
          return {
            success: true,
            newState: {
              ...state,
              phase: "GAME_OVER",
            },
            newPhase: "GAME_OVER",
          };
        }

        const nextP = pickNextPrompt(state.usedPromptIds);
        return {
          success: true,
          newState: {
            ...state,
            currentPrompt: nextP,
            usedPromptIds: [...state.usedPromptIds, nextP.id],
            phase: "VOTING",
            round: state.round + 1,
            votes: {},
            results: undefined,
          },
          newPhase: "VOTING",
        };
      }

      default:
        return { success: false, newState: state, newPhase: state.phase };
    }
  },

  getPublicView(ctx: GameContext<ChkonFinaState, ChkonFinaSettings>): PublicGameView {
    const { state, phase, round, stateVersion } = ctx;

    return {
      gameId: "chkon-fina",
      phase,
      round,
      stateVersion,
      publicData: {
        currentPrompt: state.currentPrompt,
        votesCount: Object.keys(state.votes).length,
        results: state.results,
        totalScores: state.totalScores,
      },
    };
  },

  getPlayerView(ctx: GameContext<ChkonFinaState, ChkonFinaSettings>, playerId: string): PrivatePlayerGameView {
    const { state } = ctx;

    return {
      playerId,
      isHost: false,
      privateData: {
        myVote: state.votes[playerId],
      },
      allowedActions: state.phase === "VOTING" ? ["CAST_VOTE"] : [],
    };
  },

  checkFinished(ctx: GameContext<ChkonFinaState, ChkonFinaSettings>): GameEndResult | null {
    if (ctx.state.phase === "GAME_OVER") {
      return {
        isFinished: true,
        winner: {
          summary: "سالات أسئلة شكون فينا! ضحكة زوينة مع الجماعة 👏",
        },
      };
    }
    return null;
  },
};

function resolveChkonFinaVotes(state: ChkonFinaState, votes: Record<string, string>, totalPlayers: number): TransitionResult<ChkonFinaState> {
  const counts: Record<string, number> = {};
  Object.values(votes).forEach((candidate) => {
    counts[candidate] = (counts[candidate] || 0) + 1;
  });

  const percentages: Record<string, number> = {};
  const totalVotesCount = Object.keys(votes).length || 1;
  let maxCount = 0;
  let topCandidateId: string | undefined;

  Object.entries(counts).forEach(([candId, count]) => {
    percentages[candId] = Math.round((count / totalVotesCount) * 100);
    if (count > maxCount) {
      maxCount = count;
      topCandidateId = candId;
    }
  });

  const isUnanimous = maxCount === totalPlayers && totalPlayers > 1;

  const newTotalScores = { ...state.totalScores };
  if (topCandidateId) {
    newTotalScores[topCandidateId] = (newTotalScores[topCandidateId] || 0) + 1;
  }

  return {
    success: true,
    newState: {
      ...state,
      votes,
      phase: "REVEAL_RESULTS",
      results: {
        counts,
        percentages,
        topCandidateId,
        isUnanimous,
      },
      totalScores: newTotalScores,
    },
    newPhase: "REVEAL_RESULTS",
  };
}
