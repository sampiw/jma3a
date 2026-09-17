import { GameCapability, Player, PublicGameView, PrivatePlayerGameView } from "@/lib/types";
import { GameContext, GameDefinition, GameEndResult, TransitionResult, ValidationResult } from "@/games/registry";
import mettelhaContent from "@/content/mettelha.json";

export interface MettelhaSettings {
  roundDurationSeconds: number;
  totalRoundsPerTeam: number;
  pointsForCorrect: number;
  pointsForSkip: number;
}

export interface MettelhaTeam {
  id: string;
  name: string;
  playerIds: string[];
  score: number;
}

export interface MettelhaState {
  teams: MettelhaTeam[];
  activeTeamIndex: number;
  activeActorId: string;
  currentPrompt: { id: string; prompt: string; category: string; difficulty: string };
  usedPromptIds: string[];
  phase: "TEAM_PREPARE" | "ACTING" | "TURN_SUMMARY" | "GAME_OVER";
  round: number;
  timerDurationMs: number;
  turnCorrectCount: number;
  turnSkipCount: number;
}

export type MettelhaAction =
  | { type: "START_ACTING" }
  | { type: "MARK_CORRECT" }
  | { type: "MARK_SKIP" }
  | { type: "END_TURN" }
  | { type: "NEXT_TEAM_TURN" };

function pickNextPrompt(usedIds: string[]): { id: string; prompt: string; category: string; difficulty: string } {
  const unused = mettelhaContent.prompts.filter((p) => !usedIds.includes(p.id));
  const pool = unused.length > 0 ? unused : mettelhaContent.prompts;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { id: picked.id, prompt: picked.prompt, category: picked.category, difficulty: picked.difficulty };
}

export const MettelhaEngine: GameDefinition<MettelhaState, MettelhaAction, MettelhaSettings> = {
  id: "mettelha",
  slug: "mettelha",
  version: 1,
  displayNameKey: "mettelha.name",
  shortDescriptionKey: "mettelha.description",
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
    pointsForSkip: 0,
  },

  validateSetup(players: Player[], settings: MettelhaSettings): ValidationResult {
    if (players.length < 2) {
      return { isValid: false, errors: ["مثلها كتحتاج على الأقل 2 لاعبين."] };
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: MettelhaSettings): MettelhaState {
    // Split players into 2 teams
    const mid = Math.ceil(players.length / 2);
    const team1Players = players.slice(0, mid).map((p) => p.id);
    const team2Players = players.slice(mid).map((p) => p.id);

    const teams: MettelhaTeam[] = [
      { id: "team_1", name: "الفرقة الأولى 🔴", playerIds: team1Players, score: 0 },
      { id: "team_2", name: "الفرقة الثانية 🔵", playerIds: team2Players, score: 0 },
    ];

    const firstPrompt = pickNextPrompt([]);

    return {
      teams,
      activeTeamIndex: 0,
      activeActorId: team1Players[0] || players[0].id,
      currentPrompt: firstPrompt,
      usedPromptIds: [firstPrompt.id],
      phase: "TEAM_PREPARE",
      round: 1,
      timerDurationMs: settings.roundDurationSeconds * 1000,
      turnCorrectCount: 0,
      turnSkipCount: 0,
    };
  },

  start(ctx: GameContext<MettelhaState, MettelhaSettings>): TransitionResult<MettelhaState> {
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
    ctx: GameContext<MettelhaState, MettelhaSettings>,
    actorPlayerId: string,
    action: MettelhaAction
  ): TransitionResult<MettelhaState> {
    const { state, settings } = ctx;

    switch (action.type) {
      case "START_ACTING": {
        return {
          success: true,
          newState: {
            ...state,
            phase: "ACTING",
            turnCorrectCount: 0,
            turnSkipCount: 0,
          },
          newPhase: "ACTING",
          timerDurationMs: settings.roundDurationSeconds * 1000,
        };
      }

      case "MARK_CORRECT": {
        if (state.phase !== "ACTING") return { success: false, newState: state, newPhase: state.phase };

        const newTeams = [...state.teams];
        newTeams[state.activeTeamIndex].score += settings.pointsForCorrect;

        const nextP = pickNextPrompt(state.usedPromptIds);
        return {
          success: true,
          newState: {
            ...state,
            teams: newTeams,
            turnCorrectCount: state.turnCorrectCount + 1,
            currentPrompt: nextP,
            usedPromptIds: [...state.usedPromptIds, nextP.id],
          },
          newPhase: state.phase,
        };
      }

      case "MARK_SKIP": {
        if (state.phase !== "ACTING") return { success: false, newState: state, newPhase: state.phase };

        const newTeams = [...state.teams];
        newTeams[state.activeTeamIndex].score += settings.pointsForSkip;

        const nextP = pickNextPrompt(state.usedPromptIds);
        return {
          success: true,
          newState: {
            ...state,
            teams: newTeams,
            turnSkipCount: state.turnSkipCount + 1,
            currentPrompt: nextP,
            usedPromptIds: [...state.usedPromptIds, nextP.id],
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

        const nextP = pickNextPrompt(state.usedPromptIds);

        return {
          success: true,
          newState: {
            ...state,
            activeTeamIndex: nextTeamIdx,
            activeActorId: nextActorId,
            currentPrompt: nextP,
            usedPromptIds: [...state.usedPromptIds, nextP.id],
            phase: "TEAM_PREPARE",
            round: nextRound,
            turnCorrectCount: 0,
            turnSkipCount: 0,
          },
          newPhase: "TEAM_PREPARE",
        };
      }

      default:
        return { success: false, newState: state, newPhase: state.phase };
    }
  },

  getPublicView(ctx: GameContext<MettelhaState, MettelhaSettings>): PublicGameView {
    const { state, phase, round, stateVersion } = ctx;
    const activeTeam = state.teams[state.activeTeamIndex];

    return {
      gameId: "mettelha",
      phase,
      round,
      stateVersion,
      publicData: {
        teams: state.teams.map((t) => ({ id: t.id, name: t.name, score: t.score, membersCount: t.playerIds.length })),
        activeTeamIndex: state.activeTeamIndex,
        activeTeamName: activeTeam?.name,
        activeActorId: state.activeActorId,
        turnCorrectCount: state.turnCorrectCount,
        turnSkipCount: state.turnSkipCount,
      },
    };
  },

  getPlayerView(ctx: GameContext<MettelhaState, MettelhaSettings>, playerId: string): PrivatePlayerGameView {
    const { state } = ctx;
    const isActor = playerId === state.activeActorId;

    return {
      playerId,
      isHost: false,
      myRole: isActor ? "actor" : "guesser",
      mySecret: isActor && state.phase === "ACTING" ? state.currentPrompt.prompt : undefined,
      privateData: {
        isActor,
        prompt: isActor ? state.currentPrompt : undefined,
      },
      allowedActions: isActor && state.phase === "ACTING" ? ["MARK_CORRECT", "MARK_SKIP", "END_TURN"] : [],
    };
  },

  checkFinished(ctx: GameContext<MettelhaState, MettelhaSettings>): GameEndResult | null {
    if (ctx.state.phase === "GAME_OVER") {
      const sorted = [...ctx.state.teams].sort((a, b) => b.score - a.score);
      const isTie = sorted[0].score === sorted[1]?.score;

      return {
        isFinished: true,
        winner: {
          team: isTie ? undefined : sorted[0].name,
          summary: isTie
            ? `تعادل حماسي بين الفرق بمجموع ${sorted[0].score} نقطة! 🤝`
            : `الفرقة الفائزة هي ${sorted[0].name} بـ ${sorted[0].score} نقطة! 🏆`,
        },
      };
    }
    return null;
  },
};
