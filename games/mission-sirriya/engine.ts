import { GameCapability, Player, PublicGameView, PrivatePlayerGameView } from "@/lib/types";
import { GameContext, GameDefinition, GameEndResult, TransitionResult, ValidationResult } from "@/games/registry";
import missionContent from "@/content/mission-sirriya.json";

export interface MissionSirriyaSettings {
  roundDurationMinutes: number; // 0 for unlimited
  allowMissionSwap: boolean;
  totalRounds: number;
}

export interface PlayerMission {
  missionId: string;
  instruction: string;
  difficulty: string;
  claimed: boolean;
  confirmed?: boolean;
  swappedOnce: boolean;
}

export interface MissionSirriyaState {
  playerMissions: Record<string, PlayerMission>;
  phase: "SECRET_REVEAL" | "ACTIVE_MISSIONS" | "CONFIRMATION" | "ROUND_REVEAL" | "GAME_OVER";
  round: number;
  currentClaimPlayerId?: string;
  confirmationVotes: Record<string, boolean>; // voterId -> isConfirmed
  scores: Record<string, number>;
  usedMissionIds: string[];
}

export type MissionSirriyaAction =
  | { type: "ACK_MISSION" }
  | { type: "SWAP_MISSION" }
  | { type: "CLAIM_COMPLETION" }
  | { type: "VOTE_CONFIRM"; confirm: boolean }
  | { type: "RESOLVE_CONFIRMATION" }
  | { type: "END_ROUND_REVEAL" }
  | { type: "NEXT_ROUND" };

function pickUniqueMission(usedIds: string[]): { id: string; instruction: string; difficulty: string } {
  const unused = missionContent.missions.filter((m) => !usedIds.includes(m.id));
  const pool = unused.length > 0 ? unused : missionContent.missions;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { id: picked.id, instruction: picked.instruction, difficulty: picked.difficulty };
}

export const MissionSirriyaEngine: GameDefinition<MissionSirriyaState, MissionSirriyaAction, MissionSirriyaSettings> = {
  id: "mission-sirriya",
  slug: "mission-sirriya",
  version: 1,
  displayNameKey: "missionSirriya.name",
  shortDescriptionKey: "missionSirriya.description",
  minPlayers: 3,
  maxPlayers: 20,
  capabilities: [
    "MULTI_PHONE",
    "ONE_PHONE",
    "HYBRID",
    "PRIVATE_TURNS",
    "REALTIME",
    "SCORES",
  ],
  defaultSettings: {
    roundDurationMinutes: 15,
    allowMissionSwap: true,
    totalRounds: 3,
  },

  validateSetup(players: Player[], settings: MissionSirriyaSettings): ValidationResult {
    if (players.length < 3) {
      return { isValid: false, errors: ["مهمة سرية كتحتاج على الأقل 3 لاعبين."] };
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: MissionSirriyaSettings): MissionSirriyaState {
    const usedIds: string[] = [];
    const playerMissions: Record<string, PlayerMission> = {};
    const scores: Record<string, number> = {};

    players.forEach((p) => {
      scores[p.id] = 0;
      const m = pickUniqueMission(usedIds);
      usedIds.push(m.id);
      playerMissions[p.id] = {
        missionId: m.id,
        instruction: m.instruction,
        difficulty: m.difficulty,
        claimed: false,
        swappedOnce: false,
      };
    });

    return {
      playerMissions,
      phase: "SECRET_REVEAL",
      round: 1,
      confirmationVotes: {},
      scores,
      usedMissionIds: usedIds,
    };
  },

  start(ctx: GameContext<MissionSirriyaState, MissionSirriyaSettings>): TransitionResult<MissionSirriyaState> {
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
    ctx: GameContext<MissionSirriyaState, MissionSirriyaSettings>,
    actorPlayerId: string,
    action: MissionSirriyaAction
  ): TransitionResult<MissionSirriyaState> {
    const { state, settings } = ctx;
    const playerM = state.playerMissions[actorPlayerId];

    switch (action.type) {
      case "ACK_MISSION": {
        // Transition to active missions
        return {
          success: true,
          newState: {
            ...state,
            phase: "ACTIVE_MISSIONS",
          },
          newPhase: "ACTIVE_MISSIONS",
        };
      }

      case "SWAP_MISSION": {
        if (!playerM || playerM.swappedOnce || !settings.allowMissionSwap || playerM.claimed) {
          return { success: false, newState: state, newPhase: state.phase, error: "Cannot swap mission" };
        }

        const newM = pickUniqueMission(state.usedMissionIds);
        return {
          success: true,
          newState: {
            ...state,
            playerMissions: {
              ...state.playerMissions,
              [actorPlayerId]: {
                missionId: newM.id,
                instruction: newM.instruction,
                difficulty: newM.difficulty,
                claimed: false,
                swappedOnce: true,
              },
            },
            usedMissionIds: [...state.usedMissionIds, newM.id],
          },
          newPhase: state.phase,
        };
      }

      case "CLAIM_COMPLETION": {
        if (!playerM || playerM.claimed) {
          return { success: false, newState: state, newPhase: state.phase, error: "Already claimed" };
        }

        return {
          success: true,
          newState: {
            ...state,
            phase: "CONFIRMATION",
            currentClaimPlayerId: actorPlayerId,
            confirmationVotes: {},
          },
          newPhase: "CONFIRMATION",
        };
      }

      case "VOTE_CONFIRM": {
        if (state.phase !== "CONFIRMATION" || actorPlayerId === state.currentClaimPlayerId) {
          return { success: false, newState: state, newPhase: state.phase };
        }

        return {
          success: true,
          newState: {
            ...state,
            confirmationVotes: {
              ...state.confirmationVotes,
              [actorPlayerId]: action.confirm,
            },
          },
          newPhase: state.phase,
        };
      }

      case "RESOLVE_CONFIRMATION": {
        if (!state.currentClaimPlayerId) {
          return { success: false, newState: state, newPhase: state.phase };
        }

        const yesVotes = Object.values(state.confirmationVotes).filter(Boolean).length;
        const totalVotes = Object.values(state.confirmationVotes).length || 1;
        const isConfirmed = yesVotes >= totalVotes / 2;

        const newScores = { ...state.scores };
        const newMissions = { ...state.playerMissions };

        if (isConfirmed) {
          newScores[state.currentClaimPlayerId] = (newScores[state.currentClaimPlayerId] || 0) + 1;
        }

        if (newMissions[state.currentClaimPlayerId]) {
          newMissions[state.currentClaimPlayerId] = {
            ...newMissions[state.currentClaimPlayerId],
            claimed: true,
            confirmed: isConfirmed,
          };
        }

        return {
          success: true,
          newState: {
            ...state,
            scores: newScores,
            playerMissions: newMissions,
            phase: "ACTIVE_MISSIONS",
            currentClaimPlayerId: undefined,
            confirmationVotes: {},
          },
          newPhase: "ACTIVE_MISSIONS",
        };
      }

      case "END_ROUND_REVEAL": {
        return {
          success: true,
          newState: {
            ...state,
            phase: "ROUND_REVEAL",
          },
          newPhase: "ROUND_REVEAL",
        };
      }

      case "NEXT_ROUND": {
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

        const usedIds = [...state.usedMissionIds];
        const newPlayerMissions: Record<string, PlayerMission> = {};

        ctx.players.forEach((p) => {
          const m = pickUniqueMission(usedIds);
          usedIds.push(m.id);
          newPlayerMissions[p.id] = {
            missionId: m.id,
            instruction: m.instruction,
            difficulty: m.difficulty,
            claimed: false,
            swappedOnce: false,
          };
        });

        return {
          success: true,
          newState: {
            ...state,
            playerMissions: newPlayerMissions,
            phase: "SECRET_REVEAL",
            round: state.round + 1,
            confirmationVotes: {},
            usedMissionIds: usedIds,
          },
          newPhase: "SECRET_REVEAL",
        };
      }

      default:
        return { success: false, newState: state, newPhase: state.phase };
    }
  },

  getPublicView(ctx: GameContext<MissionSirriyaState, MissionSirriyaSettings>): PublicGameView {
    const { state, phase, round, stateVersion } = ctx;

    const publicData: Record<string, unknown> = {
      scores: state.scores,
      completedMissionsCount: Object.values(state.playerMissions).filter((m) => m.claimed && m.confirmed).length,
    };

    if (phase === "CONFIRMATION" && state.currentClaimPlayerId) {
      const claimM = state.playerMissions[state.currentClaimPlayerId];
      publicData.currentClaimPlayerId = state.currentClaimPlayerId;
      publicData.revealedMissionInstruction = claimM?.instruction;
      publicData.confirmationVotes = state.confirmationVotes;
    }

    if (phase === "ROUND_REVEAL" || phase === "GAME_OVER") {
      publicData.allMissions = Object.fromEntries(
        Object.entries(state.playerMissions).map(([id, m]) => [
          id,
          { instruction: m.instruction, claimed: m.claimed, confirmed: m.confirmed },
        ])
      );
    }

    return {
      gameId: "mission-sirriya",
      phase,
      round,
      stateVersion,
      publicData,
    };
  },

  getPlayerView(ctx: GameContext<MissionSirriyaState, MissionSirriyaSettings>, playerId: string): PrivatePlayerGameView {
    const { state } = ctx;
    const m = state.playerMissions[playerId];

    const allowedActions: string[] = [];
    if (state.phase === "ACTIVE_MISSIONS" && m && !m.claimed) {
      allowedActions.push("CLAIM_COMPLETION");
      if (!m.swappedOnce) allowedActions.push("SWAP_MISSION");
    }
    if (state.phase === "CONFIRMATION" && playerId !== state.currentClaimPlayerId) {
      allowedActions.push("VOTE_CONFIRM");
    }

    return {
      playerId,
      isHost: false,
      myRole: "agent",
      mySecret: m?.instruction,
      privateData: {
        mission: m
          ? {
              instruction: m.instruction,
              difficulty: m.difficulty,
              claimed: m.claimed,
              confirmed: m.confirmed,
              canSwap: !m.swappedOnce,
            }
          : undefined,
      },
      allowedActions,
    };
  },

  checkFinished(ctx: GameContext<MissionSirriyaState, MissionSirriyaSettings>): GameEndResult | null {
    if (ctx.state.phase === "GAME_OVER") {
      return {
        isFinished: true,
        winner: {
          summary: "سالات المهمات السرية! كشفتو الأسرار والضحك كان فالموعد 🕵️",
        },
      };
    }
    return null;
  },
};
