import { GameContext, GameDefinition, GameEndResult, TransitionResult, ValidationResult } from "@/games/registry";
import { Player, PublicGameView, PrivatePlayerGameView } from "@/lib/types";
import { KHIYAL_CARDS, getAllCardIds } from "./cards";
import { KhiyalAction, KhiyalCard, KhiyalPhase, KhiyalSettings, KhiyalState, RoundResult } from "./types";

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const KhiyalEngine: GameDefinition<KhiyalState, KhiyalAction, KhiyalSettings> = {
  id: "khiyal",
  slug: "khiyal",
  version: 1,
  displayNameKey: "games.khiyal.name",
  shortDescriptionKey: "games.khiyal.shortDesc",
  minPlayers: 3,
  maxPlayers: 12,
  capabilities: [
    "MULTI_PHONE",
    "ONE_PHONE",
    "HYBRID",
    "SCORES",
    "REALTIME",
    "ANONYMOUS_VOTING",
  ],
  defaultSettings: {
    targetScore: 30,
    handSize: 6,
    clueTimeLimitSeconds: 90,
    voteTimeLimitSeconds: 60,
    interactionMode: "MULTI_PHONE",
  },

  validateSetup(players: Player[], settings: KhiyalSettings): ValidationResult {
    if (players.length < 3) {
      return { isValid: false, errors: ["لعبة خيال تحتاج 3 لاعبين على الأقل للبدء"] };
    }
    if (players.length > 12) {
      return { isValid: false, errors: ["الحد الأقصى للعبة خيال هو 12 لاعباً"] };
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: KhiyalSettings): KhiyalState {
    const allCards = shuffleArray(getAllCardIds());
    const playerHands: Record<string, string[]> = {};
    const scores: Record<string, number> = {};

    let deckIndex = 0;
    const handSize = settings.handSize || 6;

    for (const p of players) {
      playerHands[p.id] = allCards.slice(deckIndex, deckIndex + handSize);
      deckIndex += handSize;
      scores[p.id] = 0;
    }

    const remainingDeck = allCards.slice(deckIndex);

    return {
      phase: "STORYTELLER_CLUE",
      round: 1,
      storytellerId: players[0].id,
      currentClue: null,
      storytellerCardId: null,
      deck: remainingDeck,
      discardPile: [],
      playerHands,
      submittedCards: {},
      tableCards: [],
      votes: {},
      scores,
      eventSequence: 1,
    };
  },

  start(ctx: GameContext<KhiyalState, KhiyalSettings>): TransitionResult<KhiyalState> {
    return {
      success: true,
      newState: ctx.state,
      newPhase: "STORYTELLER_CLUE",
      newRound: 1,
    };
  },

  handleAction(
    ctx: GameContext<KhiyalState, KhiyalSettings>,
    actorPlayerId: string,
    action: KhiyalAction
  ): TransitionResult<KhiyalState> {
    const { state, settings, players } = ctx;
    const actor = players.find((p) => p.id === actorPlayerId);

    if (!actor) {
      return { success: false, newState: state, newPhase: state.phase, error: "اللاعب غير موجود" };
    }

    switch (action.type) {
      // -----------------------------------------------------------------
      // ACTION: SUBMIT_CLUE (Storyteller chooses card and inputs clue)
      // -----------------------------------------------------------------
      case "SUBMIT_CLUE": {
        if (state.phase !== "STORYTELLER_CLUE") {
          return { success: false, newState: state, newPhase: state.phase, error: "ليس وقت تقديم التلميح" };
        }

        if (actorPlayerId !== state.storytellerId) {
          return { success: false, newState: state, newPhase: state.phase, error: "فقط الحكواتي من يمكنه تقديم التلميح" };
        }

        const hand = state.playerHands[actorPlayerId] || [];
        if (!hand.includes(action.cardId)) {
          return { success: false, newState: state, newPhase: state.phase, error: "البطاقة المختارة ليست في يدك" };
        }

        if (!action.clue || !action.clue.trim()) {
          return { success: false, newState: state, newPhase: state.phase, error: "يجب كتابة تلميح للبطاقة" };
        }

        // Remove card from storyteller's hand and put into submittedCards
        const nextHand = hand.filter((c) => c !== action.cardId);
        const nextHands = {
          ...state.playerHands,
          [actorPlayerId]: nextHand,
        };

        const nextSubmitted = {
          ...state.submittedCards,
          [actorPlayerId]: [action.cardId],
        };

        return {
          success: true,
          newState: {
            ...state,
            phase: "PLAYER_SUBMISSIONS",
            currentClue: action.clue.trim(),
            storytellerCardId: action.cardId,
            playerHands: nextHands,
            submittedCards: nextSubmitted,
            eventSequence: state.eventSequence + 1,
          },
          newPhase: "PLAYER_SUBMISSIONS",
        };
      }

      // -----------------------------------------------------------------
      // ACTION: SUBMIT_CARDS (Non-storytellers submit matching cards)
      // -----------------------------------------------------------------
      case "SUBMIT_CARDS": {
        if (state.phase !== "PLAYER_SUBMISSIONS") {
          return { success: false, newState: state, newPhase: state.phase, error: "ليس وقت اختيار البطاقات" };
        }

        if (actorPlayerId === state.storytellerId) {
          return { success: false, newState: state, newPhase: state.phase, error: "الحكواتي قدم بطاقته مسبقاً" };
        }

        const requiredCount = players.length === 3 ? 2 : 1;
        if (!action.cardIds || action.cardIds.length !== requiredCount) {
          return {
            success: false,
            newState: state,
            newPhase: state.phase,
            error: `يجب اختيار ${requiredCount} بطاقة بالضبط`,
          };
        }

        const hand = state.playerHands[actorPlayerId] || [];
        for (const cid of action.cardIds) {
          if (!hand.includes(cid)) {
            return { success: false, newState: state, newPhase: state.phase, error: "إحدى البطاقات المختارة ليست في يدك" };
          }
        }

        // Remove from hand and add to submittedCards
        const nextHand = hand.filter((c) => !action.cardIds.includes(c));
        const nextHands = {
          ...state.playerHands,
          [actorPlayerId]: nextHand,
        };

        const nextSubmitted = {
          ...state.submittedCards,
          [actorPlayerId]: action.cardIds,
        };

        // Check if all non-storytellers have submitted
        const nonStorytellers = players.filter((p) => p.id !== state.storytellerId);
        const allSubmitted = nonStorytellers.every(
          (p) => nextSubmitted[p.id] && nextSubmitted[p.id].length === requiredCount
        );

        if (!allSubmitted) {
          return {
            success: true,
            newState: {
              ...state,
              playerHands: nextHands,
              submittedCards: nextSubmitted,
              eventSequence: state.eventSequence + 1,
            },
            newPhase: state.phase,
          };
        }

        // Everyone submitted! Collect all cards and shuffle them onto the table
        const allSubmittedCards: string[] = [];
        for (const cards of Object.values(nextSubmitted)) {
          allSubmittedCards.push(...cards);
        }

        const shuffledTable = shuffleArray(allSubmittedCards).map((cardId, index) => ({
          cardId,
          anonymousIndex: index + 1,
        }));

        return {
          success: true,
          newState: {
            ...state,
            phase: "VOTING",
            playerHands: nextHands,
            submittedCards: nextSubmitted,
            tableCards: shuffledTable,
            votes: {},
            eventSequence: state.eventSequence + 1,
          },
          newPhase: "VOTING",
        };
      }

      // -----------------------------------------------------------------
      // ACTION: CAST_VOTE (Non-storytellers vote for Storyteller's card)
      // -----------------------------------------------------------------
      case "CAST_VOTE": {
        if (state.phase !== "VOTING") {
          return { success: false, newState: state, newPhase: state.phase, error: "ليس وقت التصويت" };
        }

        if (actorPlayerId === state.storytellerId) {
          return { success: false, newState: state, newPhase: state.phase, error: "الحكواتي لا يصوت في جولته" };
        }

        // A player cannot vote for their own submitted card!
        const mySubmitted = state.submittedCards[actorPlayerId] || [];
        if (mySubmitted.includes(action.cardId)) {
          return { success: false, newState: state, newPhase: state.phase, error: "لا يمكنك التصويت لبطاقتك الخاصة!" };
        }

        // Target card must exist on table
        const isValidCard = state.tableCards.some((tc) => tc.cardId === action.cardId);
        if (!isValidCard) {
          return { success: false, newState: state, newPhase: state.phase, error: "البطاقة المصوت عليها غير موجودة على الطاولة" };
        }

        const nextVotes = {
          ...state.votes,
          [actorPlayerId]: action.cardId,
        };

        const nonStorytellers = players.filter((p) => p.id !== state.storytellerId);
        const allVoted = nonStorytellers.every((p) => Boolean(nextVotes[p.id]));

        if (!allVoted) {
          return {
            success: true,
            newState: {
              ...state,
              votes: nextVotes,
              eventSequence: state.eventSequence + 1,
            },
            newPhase: state.phase,
          };
        }

        // ALL VOTES IN -> RESOLVE ROUND!
        return resolveRound(state, settings, players, nextVotes);
      }

      // -----------------------------------------------------------------
      // ACTION: NEXT_ROUND (Deal cards, rotate storyteller, advance)
      // -----------------------------------------------------------------
      case "NEXT_ROUND": {
        if (state.phase !== "ROUND_RESOLUTION") {
          return { success: false, newState: state, newPhase: state.phase, error: "ليس وقت الانتقال للجولة الموالية" };
        }

        // Replenish hands back to handSize (default 6)
        let curDeck = [...state.deck];
        let curDiscard = [...state.discardPile];

        // Discard all submitted cards of this round
        for (const cards of Object.values(state.submittedCards)) {
          curDiscard.push(...cards);
        }

        const nextHands = { ...state.playerHands };
        const handSize = settings.handSize || 6;

        for (const p of players) {
          const currentHand = [...(nextHands[p.id] || [])];
          while (currentHand.length < handSize) {
            if (curDeck.length === 0) {
              if (curDiscard.length === 0) break;
              curDeck = shuffleArray(curDiscard);
              curDiscard = [];
            }
            const drawn = curDeck.shift();
            if (drawn) currentHand.push(drawn);
          }
          nextHands[p.id] = currentHand;
        }

        // Rotate Storyteller to next seated player
        const currentIndex = players.findIndex((p) => p.id === state.storytellerId);
        const nextIndex = (currentIndex + 1) % players.length;
        const nextStorytellerId = players[nextIndex].id;

        return {
          success: true,
          newState: {
            ...state,
            phase: "STORYTELLER_CLUE",
            round: state.round + 1,
            storytellerId: nextStorytellerId,
            currentClue: null,
            storytellerCardId: null,
            deck: curDeck,
            discardPile: curDiscard,
            playerHands: nextHands,
            submittedCards: {},
            tableCards: [],
            votes: {},
            lastRoundResult: state.lastRoundResult,
            eventSequence: state.eventSequence + 1,
          },
          newPhase: "STORYTELLER_CLUE",
          newRound: state.round + 1,
        };
      }

      // -----------------------------------------------------------------
      // ACTION: RELAY_UNLOCK (One-Phone mode privacy curtain unlock)
      // -----------------------------------------------------------------
      case "RELAY_UNLOCK": {
        if (!state.relayState) {
          return { success: false, newState: state, newPhase: state.phase, error: "لا يوجد تتابع حالي" };
        }
        return {
          success: true,
          newState: {
            ...state,
            relayState: {
              ...state.relayState,
              privacyUnlocked: true,
            },
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      // -----------------------------------------------------------------
      // ACTION: RELAY_FINISH_TURN (Advance turn in One-Phone mode)
      // -----------------------------------------------------------------
      case "RELAY_FINISH_TURN": {
        if (!state.relayState) {
          return { success: false, newState: state, newPhase: state.phase, error: "لا يوجد تتابع حالي" };
        }
        const nextIndex = state.relayState.currentIndex + 1;
        if (nextIndex < state.relayState.queue.length) {
          return {
            success: true,
            newState: {
              ...state,
              relayState: {
                ...state.relayState,
                currentIndex: nextIndex,
                privacyUnlocked: false,
              },
              eventSequence: state.eventSequence + 1,
            },
            newPhase: state.phase,
          };
        }
        return {
          success: true,
          newState: {
            ...state,
            relayState: undefined,
            eventSequence: state.eventSequence + 1,
          },
          newPhase: state.phase,
        };
      }

      default:
        return { success: false, newState: state, newPhase: state.phase, error: "أمر غير معروف" };
    }
  },

  getPublicView(ctx: GameContext<KhiyalState, KhiyalSettings>): PublicGameView {
    const { state, players } = ctx;
    const isResolution = state.phase === "ROUND_RESOLUTION" || state.phase === "GAME_OVER";
    const isVoting = state.phase === "VOTING";

    const nonStorytellerCount = players.length - 1;
    const requiredCardsPerPlayer = players.length === 3 ? 2 : 1;

    // Submissions progress
    const submittedCount = Object.keys(state.submittedCards).filter(
      (pid) => pid !== state.storytellerId
    ).length;

    // Votes progress
    const votesCount = Object.keys(state.votes).length;

    // Table cards projection (anonymized during VOTING, revealed during RESOLUTION)
    const projectedTableCards = state.tableCards.map((tc) => {
      if (!isResolution) {
        return {
          cardId: tc.cardId,
          anonymousIndex: tc.anonymousIndex,
          ownerId: undefined,
          votes: [],
          isStorytellerCard: false,
        };
      }

      // In resolution: reveal card owner and who voted for it!
      const owner = Object.entries(state.submittedCards).find(([, cards]) =>
        cards.includes(tc.cardId)
      )?.[0];

      const voters = Object.entries(state.votes)
        .filter(([, cId]) => cId === tc.cardId)
        .map(([voterId]) => voterId);

      return {
        cardId: tc.cardId,
        anonymousIndex: tc.anonymousIndex,
        ownerId: owner,
        votes: voters,
        isStorytellerCard: tc.cardId === state.storytellerCardId,
      };
    });

    return {
      gameId: "khiyal",
      phase: state.phase,
      round: state.round,
      stateVersion: state.eventSequence,
      publicData: {
        phase: state.phase,
        round: state.round,
        storytellerId: state.storytellerId,
        storytellerNickname: players.find((p) => p.id === state.storytellerId)?.nickname || "",
        currentClue: state.currentClue,
        submittedCount,
        totalRequiredSubmissions: nonStorytellerCount,
        requiredCardsPerPlayer,
        votesCount,
        totalRequiredVotes: nonStorytellerCount,
        tableCards: isVoting || isResolution ? projectedTableCards : [],
        scores: state.scores,
        lastRoundResult: state.lastRoundResult,
        winner: state.winner,
        deckCount: state.deck.length,
        relay: state.relayState
          ? {
              currentIndex: state.relayState.currentIndex,
              totalTurns: state.relayState.queue.length,
              currentTurnPlayerId: state.relayState.queue[state.relayState.currentIndex],
              privacyUnlocked: state.relayState.privacyUnlocked,
            }
          : undefined,
      },
    };
  },

  getPlayerView(ctx: GameContext<KhiyalState, KhiyalSettings>, playerId: string): PrivatePlayerGameView {
    const { state } = ctx;
    const isStoryteller = playerId === state.storytellerId;
    const myHand = state.playerHands[playerId] || [];
    const mySubmittedCardIds = state.submittedCards[playerId] || [];
    const myVote = state.votes[playerId];

    const allowedActions: string[] = [];

    if (state.phase === "STORYTELLER_CLUE" && isStoryteller) {
      allowedActions.push("SUBMIT_CLUE");
    } else if (state.phase === "PLAYER_SUBMISSIONS" && !isStoryteller && mySubmittedCardIds.length === 0) {
      allowedActions.push("SUBMIT_CARDS");
    } else if (state.phase === "VOTING" && !isStoryteller && !myVote) {
      allowedActions.push("CAST_VOTE");
    } else if (state.phase === "ROUND_RESOLUTION") {
      allowedActions.push("NEXT_ROUND");
    }

    return {
      playerId,
      isHost: false,
      privateData: {
        isStoryteller,
        myHand,
        mySubmittedCardIds,
        myVote,
      },
      allowedActions,
    };
  },

  checkFinished(ctx: GameContext<KhiyalState, KhiyalSettings>): GameEndResult | null {
    const { state, settings, players } = ctx;
    const targetScore = settings.targetScore || 30;

    const highestScorePlayer = Object.entries(state.scores).reduce<{ id: string; score: number } | null>(
      (acc, [pid, score]) => {
        if (!acc || score > acc.score) return { id: pid, score };
        return acc;
      },
      null
    );

    if (highestScorePlayer && highestScorePlayer.score >= targetScore) {
      const winnerName = players.find((p) => p.id === highestScorePlayer.id)?.nickname || "الفائز";
      return {
        isFinished: true,
        winner: {
          players: [highestScorePlayer.id],
          summary: `فاز ${winnerName} بـ ${highestScorePlayer.score} نقطة! 🏆🎨`,
        },
        scoreboard: Object.entries(state.scores).map(([id, score]) => ({
          id,
          label: players.find((p) => p.id === id)?.nickname || id,
          score,
        })),
      };
    }

    return null;
  },
};

/**
 * Resolves the round using official Dixit scoring rules.
 */
function resolveRound(
  state: KhiyalState,
  settings: KhiyalSettings,
  players: Player[],
  votes: Record<string, string>
): TransitionResult<KhiyalState> {
  const storytellerId = state.storytellerId;
  const storytellerCardId = state.storytellerCardId!;
  const nonStorytellers = players.filter((p) => p.id !== storytellerId);
  const totalNonStorytellers = nonStorytellers.length;

  // Track correct voters
  const correctVoters = Object.entries(votes)
    .filter(([, cardId]) => cardId === storytellerCardId)
    .map(([voterId]) => voterId);

  const pointsDelta: Record<string, number> = {};
  for (const p of players) {
    pointsDelta[p.id] = 0;
  }

  let caseType: "ALL_CORRECT" | "NONE_CORRECT" | "BALANCED" = "BALANCED";
  let explanation = "";

  // CASE 1: All guessed correctly OR Nobody guessed correctly
  if (correctVoters.length === totalNonStorytellers) {
    caseType = "ALL_CORRECT";
    // Storyteller gets 0, all others get 2
    pointsDelta[storytellerId] = 0;
    for (const p of nonStorytellers) {
      pointsDelta[p.id] += 2;
    }
    explanation = "التلميح كان مفضوح بزاف! الكل عاق ببطاقة الحكواتي (الحكواتي: 0 نقط، والآخرون: نقطتان لكل واحد).";
  } else if (correctVoters.length === 0) {
    caseType = "NONE_CORRECT";
    // Storyteller gets 0, all others get 2
    pointsDelta[storytellerId] = 0;
    for (const p of nonStorytellers) {
      pointsDelta[p.id] += 2;
    }
    explanation = "التلميح كان غامض ومستحيل! حتى حد ما عاق ببطاقة الحكواتي (الحكواتي: 0 نقط، والآخرون: نقطتان لكل واحد).";
  } else {
    // CASE 2: Balanced clue! Storyteller gets 3, correct guessers get 3
    caseType = "BALANCED";
    pointsDelta[storytellerId] = 3;
    for (const voterId of correctVoters) {
      pointsDelta[voterId] += 3;
    }
    explanation = `ضربة معلم للحكواتي! تلميح متوازن عاقو بيه ${correctVoters.length} من أصل ${totalNonStorytellers} (الحكواتي والمخمنون: 3 نقط لكل واحد).`;
  }

  // DECOY BONUS: Every non-storyteller earns +1 point for each vote cast on their submitted card(s)
  const decoyBonusRecord: Record<string, number> = {};
  for (const p of nonStorytellers) {
    decoyBonusRecord[p.id] = 0;
  }

  for (const [voterId, votedCardId] of Object.entries(votes)) {
    // Find who submitted votedCardId
    const ownerId = Object.entries(state.submittedCards).find(([, cards]) =>
      cards.includes(votedCardId)
    )?.[0];

    // If card belongs to a non-storyteller, they fooled someone! +1 point
    if (ownerId && ownerId !== storytellerId && ownerId !== voterId) {
      pointsDelta[ownerId] = (pointsDelta[ownerId] || 0) + 1;
      decoyBonusRecord[ownerId] = (decoyBonusRecord[ownerId] || 0) + 1;
    }
  }

  // Update total scores
  const nextScores: Record<string, number> = { ...state.scores };
  for (const [pid, delta] of Object.entries(pointsDelta)) {
    nextScores[pid] = (nextScores[pid] || 0) + delta;
  }

  // Build card-by-card breakdown
  const cardsOnTable = state.tableCards.map((tc) => {
    const ownerId = Object.entries(state.submittedCards).find(([, cards]) =>
      cards.includes(tc.cardId)
    )?.[0] || "";

    const cardVoterIds = Object.entries(votes)
      .filter(([, cId]) => cId === tc.cardId)
      .map(([vId]) => vId);

    const isStorytellerCard = tc.cardId === storytellerCardId;
    const decoyBonus = ownerId !== storytellerId ? cardVoterIds.length : 0;

    return {
      cardId: tc.cardId,
      ownerId,
      voterIds: cardVoterIds,
      isStoryteller: isStorytellerCard,
      pointsEarned: isStorytellerCard ? pointsDelta[storytellerId] : decoyBonus,
      decoyBonus,
    };
  });

  const lastRoundResult: RoundResult = {
    round: state.round,
    storytellerId,
    storytellerCardId,
    clue: state.currentClue || "",
    cardsOnTable,
    pointsDelta,
    caseType,
    explanation,
  };

  // Check if someone reached targetScore (default 30)
  const targetScore = settings.targetScore || 30;
  const winners = Object.entries(nextScores).filter(([, score]) => score >= targetScore);

  let nextPhase: KhiyalPhase = "ROUND_RESOLUTION";
  let winner: string | null = null;

  if (winners.length > 0) {
    // Sort by highest score
    winners.sort((a, b) => b[1] - a[1]);
    winner = winners[0][0];
    nextPhase = "GAME_OVER";
  }

  return {
    success: true,
    newState: {
      ...state,
      phase: nextPhase,
      scores: nextScores,
      lastRoundResult,
      winner,
      eventSequence: state.eventSequence + 1,
    },
    newPhase: nextPhase,
  };
}
