import { GameCapability, Player, PublicGameView, PrivatePlayerGameView } from "@/lib/types";
import { GameContext, GameDefinition, GameEndResult, TransitionResult, ValidationResult } from "@/games/registry";
import mamnou3Content from "@/content/mamnou3.json";

export interface Mamnou3Settings {
  roundDurationSeconds: number;
  totalRoundsPerTeam: number;
  pointsForCorrect: number;
  pointsForTaboo: number;
  pointsForSkip: number;
}

export interface Mamnou3Team {
  id: string;
  name: string;
  playerIds: string[];
  score: number;
}

export interface Mamnou3Card {
  id: string;
  target: string;
  forbidden: string[];
  category: string;
  difficulty: string;
}

export interface Mamnou3State {
  teams: Mamnou3Team[];
  activeTeamIndex: number;
  activeDescriberId: string;
  currentCard: Mamnou3Card;
  usedCardIds: string[];
  phase: "TEAM_PREPARE" | "DESCRIBING" | "TURN_SUMMARY" | "GAME_OVER";
  round: number;
  timerDurationMs: number;
  turnCorrectCount: number;
  turnTabooCount: number;
  turnSkipCount: number;
}

export type Mamnou3Action =
  | { type: "START_DESCRIBING" }
  | { type: "MARK_CORRECT" }
  | { type: "MARK_TABOO" }
  | { type: "MARK_SKIP" }
  | { type: "END_TURN" }
  | { type: "NEXT_TEAM_TURN" };

function pickNextCard(usedIds: string[]): Mamnou3Card {
  const unused = mamnou3Content.cards.filter((c) => !usedIds.includes(c.id));
  const pool = unused.length > 0 ? unused : mamnou3Content.cards;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return {
    id: picked.id,
    target: picked.target,
    forbidden: picked.forbidden,
    category: picked.category,
    difficulty: picked.difficulty,
  };
}

export const Mamnou3Engine: GameDefinition<Mamnou3State, Mamnou3Action, Mamnou3Settings> = {
  id: "mamnou3",
  slug: "mamnou3",
  version: 1,
  displayNameKey: "mamnou3.name",
  shortDescriptionKey: "mamnou3.description",
  minPlayers: 2,
  maxPlayers: 20,
  capabilities: [
    "ONE_PHONE",
    "TEAM_MODE",
    "SHARED_SCREEN",
    "TIMERS",
    "SCORES",
  ],
  defaultSettings: {
    roundDurationSeconds: 60,
    totalRoundsPerTeam: 3,
    pointsForCorrect: 1,
    pointsForTaboo: -1,
    pointsForSkip: 0,
  },

  validateSetup(players: Player[], settings: Mamnou3Settings): ValidationResult {
    if (players.length < 2) {
      return { isValid: false, errors: ["ممنوع كتحتاج على الأقل 2 لاعبين."] };
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: Mamnou3Settings): Mamnou3State {
    const mid = Math.ceil(players.length / 2);
    const team1Players = players.slice(0, mid).map((p) => p.id);
    const team2Players = players.slice(mid).map((p) => p.id);

    const teams: Mamnou3Team[] = [
      { id: "team_1", name: "الفرقة الأولى 🔴", playerIds: team1Players, score: 0 },
      { id: "team_2", name: "الفرقة الثانية 🔵", playerIds: team2Players, score: 0 },
    ];

    const firstCard = pickNextCard([]);

    return {
      teams,
      activeTeamIndex: 0,
      activeDescriberId: team1Players[0] || players[0].id,
      currentCard: firstCard,
      usedCardIds: [firstCard.id],
      phase: "TEAM_PREPARE",
      round: 1,
      timerDurationMs: settings.roundDurationSeconds * 1000,
      turnCorrectCount: 0,
      turnTabooCount: 0,
      turnSkipCount: 0,
    };
  },

  start(ctx: GameContext<Mamnou3State, Mamnou3Settings>): TransitionResult<Mamnou3State> {
    return {
      success: true,
      newState: {
        ...ctx.state,
        phase: "TEAM_PREPARE",
      },
      newPhase: "TEAM_PREPARE",
    };
  },

  handleAction(
    ctx: GameContext<Mamnou3State, Mamnou3Settings>,
    actorPlayerId: string,
    action: Mamnou3Action
  ): TransitionResult<Mamnou3State> {
    const { state, settings } = ctx;

    switch (action.type) {
      case "START_DESCRIBING": {
        return {
          success: true,
          newState: {
            ...state,
            phase: "DESCRIBING",
            turnCorrectCount: 0,
            turnTabooCount: 0,
            turnSkipCount: 0,
          },
          newPhase: "DESCRIBING",
          timerDurationMs: settings.roundDurationSeconds * 1000,
        };
      }

      case "MARK_CORRECT": {
        if (state.phase !== "DESCRIBING") return { success: false, newState: state, newPhase: state.phase };

        const newTeams = [...state.teams];
        newTeams[state.activeTeamIndex].score += settings.pointsForCorrect;

        const nextC = pickNextCard(state.usedCardIds);
        return {
          success: true,
          newState: {
            ...state,
            teams: newTeams,
            turnCorrectCount: state.turnCorrectCount + 1,
            currentCard: nextC,
            usedCardIds: [...state.usedCardIds, nextC.id],
          },
          newPhase: state.phase,
        };
      }

      case "MARK_TABOO": {
        if (state.phase !== "DESCRIBING") return { success: false, newState: state, newPhase: state.phase };

        const newTeams = [...state.teams];
        newTeams[state.activeTeamIndex].score += settings.pointsForTaboo;

        const nextC = pickNextCard(state.usedCardIds);
        return {
          success: true,
          newState: {
            ...state,
            teams: newTeams,
            turnTabooCount: state.turnTabooCount + 1,
            currentCard: nextC,
            usedCardIds: [...state.usedCardIds, nextC.id],
          },
          newPhase: state.phase,
        };
      }

      case "MARK_SKIP": {
        if (state.phase !== "DESCRIBING") return { success: false, newState: state, newPhase: state.phase };

        const newTeams = [...state.teams];
        newTeams[state.activeTeamIndex].score += settings.pointsForSkip;

        const nextC = pickNextCard(state.usedCardIds);
        return {
          success: true,
          newState: {
            ...state,
            teams: newTeams,
            turnSkipCount: state.turnSkipCount + 1,
            currentCard: nextC,
            usedCardIds: [...state.usedCardIds, nextC.id],
          },
          newPhase: state.phase,
        };
      }

      case "END_TURN": {
        return {
          success: true,
          newState: {
            ...state,
            phase: "TURN_SUMMARY",
          },
          newPhase: "TURN_SUMMARY",
        };
      }

      case "NEXT_TEAM_TURN": {
        const nextTeamIdx = (state.activeTeamIndex + 1) % state.teams.length;
        const isNextRound = nextTeamIdx === 0;
        const nextRound = isNextRound ? state.round + 1 : state.round;

        if (nextRound > settings.totalRoundsPerTeam) {
          return {
            success: true,
            newState: {
              ...state,
              phase: "GAME_OVER",
            },
            newPhase: "GAME_OVER",
          };
        }

        const nextTeam = state.teams[nextTeamIdx];
        const nextActorIdx = (nextRound - 1) % (nextTeam.playerIds.length || 1);
        const nextActorId = nextTeam.playerIds[nextActorIdx] || nextTeam.playerIds[0];

        const nextC = pickNextCard(state.usedCardIds);

        return {
          success: true,
          newState: {
            ...state,
            activeTeamIndex: nextTeamIdx,
            activeDescriberId: nextActorId,
            currentCard: nextC,
            usedCardIds: [...state.usedCardIds, nextC.id],
            phase: "TEAM_PREPARE",
            round: nextRound,
            turnCorrectCount: 0,
            turnTabooCount: 0,
            turnSkipCount: 0,
          },
          newPhase: "TEAM_PREPARE",
        };
      }

      default:
        return { success: false, newState: state, newPhase: state.phase };
    }
  },

  getPublicView(ctx: GameContext<Mamnou3State, Mamnou3Settings>): PublicGameView {
    const { state, phase, round, stateVersion } = ctx;
    const activeTeam = state.teams[state.activeTeamIndex];

    return {
      gameId: "mamnou3",
      phase,
      round,
      stateVersion,
      publicData: {
        teams: state.teams.map((t) => ({ id: t.id, name: t.name, score: t.score, membersCount: t.playerIds.length })),
        activeTeamIndex: state.activeTeamIndex,
        activeTeamName: activeTeam?.name,
        activeDescriberId: state.activeDescriberId,
        turnCorrectCount: state.turnCorrectCount,
        turnTabooCount: state.turnTabooCount,
        turnSkipCount: state.turnSkipCount,
      },
    };
  },

  getPlayerView(ctx: GameContext<Mamnou3State, Mamnou3Settings>, playerId: string): PrivatePlayerGameView {
    const { state } = ctx;
    const isDescriber = playerId === state.activeDescriberId;

    return {
      playerId,
      isHost: false,
      myRole: isDescriber ? "describer" : "guesser",
      mySecret: isDescriber && state.phase === "DESCRIBING" ? state.currentCard.target : undefined,
      privateData: {
        isDescriber,
        card: isDescriber ? state.currentCard : undefined,
      },
      allowedActions: isDescriber && state.phase === "DESCRIBING" ? ["MARK_CORRECT", "MARK_TABOO", "MARK_SKIP", "END_TURN"] : [],
    };
  },

  checkFinished(ctx: GameContext<Mamnou3State, Mamnou3Settings>): GameEndResult | null {
    if (ctx.state.phase === "GAME_OVER") {
      const sorted = [...ctx.state.teams].sort((a, b) => b.score - a.score);
      const isTie = sorted[0].score === sorted[1]?.score;

      return {
        isFinished: true,
        winner: {
          team: isTie ? undefined : sorted[0].name,
          summary: isTie
            ? `تعادل رائع بين الفرق بمجموع ${sorted[0].score} نقطة! 🤝`
            : `الفرقة الفائزة هي ${sorted[0].name} بـ ${sorted[0].score} نقطة! 🏆`,
        },
      };
    }
    return null;
  },
};
