import { GameCapability, Player, PublicGameView, PrivatePlayerGameView } from "@/lib/types";
import { GameContext, GameDefinition, GameEndResult, TransitionResult, ValidationResult } from "@/games/registry";
import intrusContent from "@/content/intrus.json";

export interface IntrusSettings {
  variant: "no_word" | "close_words";
  clueRoundsCount: number;
  intruderCanStealWin: boolean;
}

export interface IntrusState {
  secretWord: string;
  intruderWord?: string;
  intruderPlayerId: string;
  phase: "SECRET_REVEAL" | "CLUE_ROUNDS" | "VOTING" | "VOTE_RESULT" | "INTRUDER_GUESS" | "ROUND_END" | "GAME_OVER";
  round: number;
  clueRoundIndex: number;
  turnOrder: string[]; // playerIds
  currentTurnPlayerId: string;
  votes: Record<string, string>; // voterId -> targetId
  intruderCaught: boolean;
  intruderGuessText?: string;
  intruderGuessCorrect?: boolean;
  scores: Record<string, number>;
}

export type IntrusAction =
  | { type: "ACK_SECRET" }
  | { type: "NEXT_CLUE_TURN" }
  | { type: "START_VOTING" }
  | { type: "VOTE_INTRUDER"; targetPlayerId: string }
  | { type: "RESOLVE_VOTES" }
  | { type: "INTRUDER_GUESS"; guessedWord: string }
  | { type: "NEXT_ROUND" };

export const IntrusEngine: GameDefinition<IntrusState, IntrusAction, IntrusSettings> = {
  id: "intrus",
  slug: "intrus",
  version: 1,
  displayNameKey: "intrus.name",
  shortDescriptionKey: "intrus.description",
  minPlayers: 3,
  maxPlayers: 16,
  capabilities: [
    "MULTI_PHONE",
    "ONE_PHONE",
    "HYBRID",
    "PRIVATE_TURNS",
    "ANONYMOUS_VOTING",
    "REALTIME",
    "SCORES",
  ],
  defaultSettings: {
    variant: "no_word",
    clueRoundsCount: 2,
    intruderCanStealWin: true,
  },

  validateSetup(players: Player[], settings: IntrusSettings): ValidationResult {
    if (players.length < 3) {
      return { isValid: false, errors: ["L'Intrus requires at least 3 players."] };
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: IntrusSettings): IntrusState {
    const scores: Record<string, number> = {};
    players.forEach((p) => (scores[p.id] = 0));

    // Pick random intruder
    const intruderIdx = Math.floor(Math.random() * players.length);
    const intruderPlayerId = players[intruderIdx].id;

    let secretWord = "طاجين بالبرقوق";
    let intruderWord: string | undefined = undefined;

    if (settings.variant === "close_words") {
      const pair = intrusContent.pairs[Math.floor(Math.random() * intrusContent.pairs.length)];
      secretWord = pair.wordA;
      intruderWord = pair.wordB;
    } else {
      const wordObj = intrusContent.words[Math.floor(Math.random() * intrusContent.words.length)];
      secretWord = wordObj.word;
    }

    // Shuffle turn order
    const turnOrder = [...players.map((p) => p.id)].sort(() => Math.random() - 0.5);

    return {
      secretWord,
      intruderWord,
      intruderPlayerId,
      phase: "SECRET_REVEAL",
      round: 1,
      clueRoundIndex: 1,
      turnOrder,
      currentTurnPlayerId: turnOrder[0],
      votes: {},
      intruderCaught: false,
      scores,
    };
  },

  start(ctx: GameContext<IntrusState, IntrusSettings>): TransitionResult<IntrusState> {
    return {
      success: true,
      newState: {
        ...ctx.state,
        phase: "SECRET_REVEAL",
      },
      newPhase: "SECRET_REVEAL",
    };
  },

  handleAction(
    ctx: GameContext<IntrusState, IntrusSettings>,
    actorPlayerId: string,
    action: IntrusAction
  ): TransitionResult<IntrusState> {
    const { state, settings } = ctx;

    switch (action.type) {
      case "START_VOTING": {
        return {
          success: true,
          newState: {
            ...state,
            phase: "VOTING",
            votes: {},
          },
          newPhase: "VOTING",
        };
      }

      case "NEXT_CLUE_TURN": {
        const currentIdx = state.turnOrder.indexOf(state.currentTurnPlayerId);
        const nextIdx = currentIdx + 1;

        if (nextIdx < state.turnOrder.length) {
          return {
            success: true,
            newState: {
              ...state,
              currentTurnPlayerId: state.turnOrder[nextIdx],
            },
            newPhase: state.phase,
          };
        } else {
          // Completed one full round of clues
          if (state.clueRoundIndex < settings.clueRoundsCount) {
            return {
              success: true,
              newState: {
                ...state,
                clueRoundIndex: state.clueRoundIndex + 1,
                currentTurnPlayerId: state.turnOrder[0],
              },
              newPhase: state.phase,
            };
          } else {
            // Transition to voting
            return {
              success: true,
              newState: {
                ...state,
                phase: "VOTING",
                votes: {},
              },
              newPhase: "VOTING",
            };
          }
        }
      }

      case "VOTE_INTRUDER": {
        if (state.phase !== "VOTING") {
          return { success: false, newState: state, newPhase: state.phase, error: "Not voting phase" };
        }
        return {
          success: true,
          newState: {
            ...state,
            votes: {
              ...state.votes,
              [actorPlayerId]: action.targetPlayerId,
            },
          },
          newPhase: state.phase,
        };
      }

      case "RESOLVE_VOTES": {
        const votesCount: Record<string, number> = {};
        Object.values(state.votes).forEach((target) => {
          votesCount[target] = (votesCount[target] || 0) + 1;
        });

        let maxVotes = 0;
        let votedPlayerId: string | undefined;
        Object.entries(votesCount).forEach(([targetId, count]) => {
          if (count > maxVotes) {
            maxVotes = count;
            votedPlayerId = targetId;
          }
        });

        const intruderCaught = votedPlayerId === state.intruderPlayerId;
        const newScores = { ...state.scores };

        if (!intruderCaught) {
          // Intruder escaped! +2 points to intruder
          newScores[state.intruderPlayerId] = (newScores[state.intruderPlayerId] || 0) + 2;
          return {
            success: true,
            newState: {
              ...state,
              intruderCaught: false,
              phase: "ROUND_END",
              scores: newScores,
            },
            newPhase: "ROUND_END",
          };
        } else {
          // Intruder caught! If can steal, give chance to guess
          if (settings.intruderCanStealWin) {
            return {
              success: true,
              newState: {
                ...state,
                intruderCaught: true,
                phase: "INTRUDER_GUESS",
              },
              newPhase: "INTRUDER_GUESS",
            };
          } else {
            // Normal players get +1
            Object.keys(newScores).forEach((id) => {
              if (id !== state.intruderPlayerId) {
                newScores[id] = (newScores[id] || 0) + 1;
              }
            });
            return {
              success: true,
              newState: {
                ...state,
                intruderCaught: true,
                phase: "ROUND_END",
                scores: newScores,
              },
              newPhase: "ROUND_END",
            };
          }
        }
      }

      case "INTRUDER_GUESS": {
        if (state.phase !== "INTRUDER_GUESS" || actorPlayerId !== state.intruderPlayerId) {
          return { success: false, newState: state, newPhase: state.phase, error: "Only intruder can guess" };
        }

        const normGuess = action.guessedWord.trim().toLowerCase();
        const normSecret = state.secretWord.trim().toLowerCase();
        const isCorrect = normGuess === normSecret || normSecret.includes(normGuess);

        const newScores = { ...state.scores };
        if (isCorrect) {
          newScores[state.intruderPlayerId] = (newScores[state.intruderPlayerId] || 0) + 3;
        } else {
          Object.keys(newScores).forEach((id) => {
            if (id !== state.intruderPlayerId) {
              newScores[id] = (newScores[id] || 0) + 1;
            }
          });
        }

        return {
          success: true,
          newState: {
            ...state,
            intruderGuessText: action.guessedWord,
            intruderGuessCorrect: isCorrect,
            phase: "ROUND_END",
            scores: newScores,
          },
          newPhase: "ROUND_END",
        };
      }

      case "NEXT_ROUND": {
        // Next round fresh setup
        const intruderIdx = Math.floor(Math.random() * ctx.players.length);
        const intruderPlayerId = ctx.players[intruderIdx].id;

        let secretWord = "كسكسو مغربي";
        let intruderWord: string | undefined = undefined;

        if (settings.variant === "close_words") {
          const pair = intrusContent.pairs[Math.floor(Math.random() * intrusContent.pairs.length)];
          secretWord = pair.wordA;
          intruderWord = pair.wordB;
        } else {
          const wordObj = intrusContent.words[Math.floor(Math.random() * intrusContent.words.length)];
          secretWord = wordObj.word;
        }

        const turnOrder = [...ctx.players.map((p) => p.id)].sort(() => Math.random() - 0.5);

        return {
          success: true,
          newState: {
            ...state,
            secretWord,
            intruderWord,
            intruderPlayerId,
            phase: "SECRET_REVEAL",
            round: state.round + 1,
            clueRoundIndex: 1,
            turnOrder,
            currentTurnPlayerId: turnOrder[0],
            votes: {},
            intruderCaught: false,
            intruderGuessText: undefined,
            intruderGuessCorrect: undefined,
          },
          newPhase: "SECRET_REVEAL",
        };
      }

      default:
        return { success: false, newState: state, newPhase: state.phase };
    }
  },

  getPublicView(ctx: GameContext<IntrusState, IntrusSettings>): PublicGameView {
    const { state, phase, round, stateVersion } = ctx;

    const publicData: Record<string, unknown> = {
      clueRoundIndex: state.clueRoundIndex,
      turnOrder: state.turnOrder,
      currentTurnPlayerId: state.currentTurnPlayerId,
      scores: state.scores,
      votesCount: Object.keys(state.votes).length,
    };

    if (phase === "VOTE_RESULT" || phase === "INTRUDER_GUESS" || phase === "ROUND_END" || phase === "GAME_OVER") {
      publicData.intruderPlayerId = state.intruderPlayerId;
      publicData.secretWord = state.secretWord;
      publicData.intruderCaught = state.intruderCaught;
      publicData.intruderGuessCorrect = state.intruderGuessCorrect;
      publicData.votes = state.votes;
    }

    return {
      gameId: "intrus",
      phase,
      round,
      stateVersion,
      publicData,
    };
  },

  getPlayerView(ctx: GameContext<IntrusState, IntrusSettings>, playerId: string): PrivatePlayerGameView {
    const { state, settings } = ctx;
    const isIntruder = playerId === state.intruderPlayerId;

    let mySecret = state.secretWord;
    if (isIntruder) {
      mySecret = settings.variant === "close_words" ? (state.intruderWord || "") : "INTRUDER";
    }

    const allowedActions: string[] = [];
    if (state.phase === "CLUE_ROUNDS" && state.currentTurnPlayerId === playerId) {
      allowedActions.push("NEXT_CLUE_TURN");
    }
    if (state.phase === "VOTING") {
      allowedActions.push("VOTE_INTRUDER");
    }
    if (state.phase === "INTRUDER_GUESS" && isIntruder) {
      allowedActions.push("INTRUDER_GUESS");
    }

    return {
      playerId,
      isHost: false,
      myRole: isIntruder ? "intruder" : "civilian",
      mySecret,
      privateData: {
        isIntruder,
        hasVoted: Boolean(state.votes[playerId]),
      },
      allowedActions,
    };
  },

  checkFinished(ctx: GameContext<IntrusState, IntrusSettings>): GameEndResult | null {
    if (ctx.state.round >= 5) {
      return {
        isFinished: true,
        winner: {
          summary: "نهاية جولات الدخيل! تفقدو جدول النقاط 🏆",
        },
      };
    }
    return null;
  },
};
