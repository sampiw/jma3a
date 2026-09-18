import { GameCapability, Player, PublicGameView, PrivatePlayerGameView } from "@/lib/types";
import { GameContext, GameDefinition, GameEndResult, TransitionResult, ValidationResult } from "@/games/registry";
import missionContent from "@/content/mission-sirriya.json";

export type MissionAdjudication = "TARGET_CONFIRM" | "SELF_HONOR" | "GROUP_CONFIRM";
export type MissionStatus = "ACTIVE" | "CLAIM_PENDING" | "SUCCEEDED" | "CAUGHT" | "FAILED" | "SWAPPED";

export interface MissionDefinition {
  id: string;
  instruction: string;
  pack?: string;
  type?: string;
  difficulty?: string;
  adjudication: MissionAdjudication;
  copy?: {
    darijaArabic?: string;
    darijaLatin?: string;
    en?: string;
  };
}

export interface MissionAssignment {
  assignmentId: string;
  missionId: string;
  instruction: string;
  difficulty: string;
  adjudication: MissionAdjudication;
  status: MissionStatus;
  assignedAt: number;
  completedAt?: number;
  challengedAt?: number;
  targetPlayerId?: string;
}

export interface MissionPlayerState {
  playerId: string;
  assignments: MissionAssignment[];
  successes: number;
  caughtCount: number;
  challengeTokensRemaining: number;
  freeSwapAvailable: boolean;
}

export interface PendingChallenge {
  id: string;
  challengerId: string;
  challengedPlayerId: string;
  createdAt: number;
}

export interface PendingClaim {
  id: string;
  claimantId: string;
  assignmentId: string;
  targetPlayerId?: string;
  adjudication: MissionAdjudication;
  createdAt: number;
}

export interface MissionSirriyaSettings {
  preset: "quick" | "standard" | "long" | "timed";
  missionsPerPlayer: number;
  successesToWin: number;
  initialChallengeTokens: number;
  roundDurationMinutes?: number;
}

export interface MissionSirriyaState {
  phase: "SECRET_REVEAL" | "ACTIVE" | "GAME_OVER";
  round: number;
  players: Record<string, MissionPlayerState>;
  pendingChallenges: PendingChallenge[];
  pendingClaims: PendingClaim[];
  usedMissionIds: string[];
  winnerPlayerIds?: string[];
  startedAt: number;
  endsAt?: number;
  recentActivity: Array<{
    type: "SUCCESS" | "CAUGHT" | "WRONG_CHALLENGE";
    text: string;
    timestamp: number;
  }>;
}

export type MissionSirriyaAction =
  | { type: "ACK_REVEAL" }
  | { type: "SWAP_MISSION"; assignmentId: string }
  | { type: "CHALLENGE_PLAYER"; targetPlayerId: string }
  | { type: "RESPOND_CHALLENGE"; challengeId: string; wasCaught: boolean; caughtAssignmentId?: string }
  | { type: "CLAIM_MISSION"; assignmentId: string; targetPlayerId?: string }
  | { type: "RESPOND_CLAIM"; claimId: string; confirmed: boolean }
  | { type: "NEXT_PHASE" };

function getMissionPool(): MissionDefinition[] {
  return missionContent.missions.map((m: any) => {
    let adj: MissionAdjudication = "TARGET_CONFIRM";
    if (m.tags?.includes("physical") || m.tags?.includes("acting")) {
      adj = "SELF_HONOR";
    } else if (m.tags?.includes("football") || m.tags?.includes("culture") || m.tags?.includes("debate")) {
      adj = "GROUP_CONFIRM";
    }
    return {
      id: m.id,
      instruction: m.instruction,
      pack: m.pack || "s7ab",
      type: m.tags?.[0] || "social",
      difficulty: m.difficulty || "medium",
      adjudication: m.adjudication || adj,
      copy: m.copy,
    };
  });
}

function pickRandomUnusedMission(usedIds: string[]): MissionDefinition {
  const pool = getMissionPool();
  const unused = pool.filter((m) => !usedIds.includes(m.id));
  const candidates = unused.length > 0 ? unused : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export const MissionSirriyaEngine: GameDefinition<MissionSirriyaState, MissionSirriyaAction, MissionSirriyaSettings> = {
  id: "mission-sirriya",
  slug: "mission-sirriya",
  version: 2,
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
    "TIMERS",
  ],
  defaultSettings: {
    preset: "standard",
    missionsPerPlayer: 5,
    successesToWin: 3,
    initialChallengeTokens: 2,
  },

  validateSetup(players: Player[], settings: MissionSirriyaSettings): ValidationResult {
    if (players.length < 3) {
      return { isValid: false, errors: ["مهمة سرية كتحتاج على الأقل 3 ديال اللاعبين."] };
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: MissionSirriyaSettings): MissionSirriyaState {
    const usedIds: string[] = [];
    const playerStates: Record<string, MissionPlayerState> = {};
    const countPerPlayer = settings.missionsPerPlayer || (settings.preset === "quick" ? 3 : settings.preset === "long" ? 6 : 5);
    const tokens = settings.initialChallengeTokens ?? (settings.preset === "quick" ? 1 : settings.preset === "long" ? 3 : 2);

    players.forEach((p) => {
      const assignments: MissionAssignment[] = [];
      for (let i = 0; i < countPerPlayer; i++) {
        const m = pickRandomUnusedMission(usedIds);
        usedIds.push(m.id);
        assignments.push({
          assignmentId: `asg_${p.id}_${i}_${Date.now()}`,
          missionId: m.id,
          instruction: m.instruction,
          difficulty: m.difficulty || "medium",
          adjudication: m.adjudication,
          status: "ACTIVE",
          assignedAt: Date.now(),
        });
      }

      playerStates[p.id] = {
        playerId: p.id,
        assignments,
        successes: 0,
        caughtCount: 0,
        challengeTokensRemaining: tokens,
        freeSwapAvailable: true,
      };
    });

    const now = Date.now();
    const durationMs = settings.roundDurationMinutes ? settings.roundDurationMinutes * 60 * 1000 : undefined;

    return {
      phase: "SECRET_REVEAL",
      round: 1,
      players: playerStates,
      pendingChallenges: [],
      pendingClaims: [],
      usedMissionIds: usedIds,
      startedAt: now,
      endsAt: durationMs ? now + durationMs : undefined,
      recentActivity: [],
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
    const actor = state.players[actorPlayerId];

    if (!actor) {
      return { success: false, newState: state, newPhase: state.phase, error: "لاعب غير معترف به" };
    }

    switch (action.type) {
      // -------------------------------------------------------------
      // 1. ACK_REVEAL: Ready to start ambient active missions
      // -------------------------------------------------------------
      case "ACK_REVEAL":
      case "NEXT_PHASE": {
        if (state.phase === "SECRET_REVEAL") {
          return {
            success: true,
            newState: {
              ...state,
              phase: "ACTIVE",
            },
            newPhase: "ACTIVE",
          };
        }
        return { success: true, newState: state, newPhase: state.phase };
      }

      // -------------------------------------------------------------
      // 2. SWAP_MISSION: One-time free safety/preference pre-game swap
      // -------------------------------------------------------------
      case "SWAP_MISSION": {
        if (!actor.freeSwapAvailable) {
          return { success: false, newState: state, newPhase: state.phase, error: "استعملتي التبديل المجاني مسبقاً" };
        }

        const targetAsg = actor.assignments.find((a) => a.assignmentId === action.assignmentId);
        if (!targetAsg || targetAsg.status !== "ACTIVE") {
          return { success: false, newState: state, newPhase: state.phase, error: "المهمة غير صالحة للتبديل" };
        }

        const newMission = pickRandomUnusedMission(state.usedMissionIds);
        const nextUsed = [...state.usedMissionIds, newMission.id];

        const updatedAssignments = actor.assignments.map((a) => {
          if (a.assignmentId === action.assignmentId) {
            return {
              ...a,
              missionId: newMission.id,
              instruction: newMission.instruction,
              difficulty: newMission.difficulty || "medium",
              adjudication: newMission.adjudication,
              status: "ACTIVE" as MissionStatus,
              assignedAt: Date.now(),
            };
          }
          return a;
        });

        const nextPlayers = {
          ...state.players,
          [actorPlayerId]: {
            ...actor,
            assignments: updatedAssignments,
            freeSwapAvailable: false,
          },
        };

        return {
          success: true,
          newState: {
            ...state,
            players: nextPlayers,
            usedMissionIds: nextUsed,
          },
          newPhase: state.phase,
        };
      }

      // -------------------------------------------------------------
      // 3. CHALLENGE_PLAYER: "CHDDITEK! — شدّيتك! 👀"
      // -------------------------------------------------------------
      case "CHALLENGE_PLAYER": {
        if (state.phase !== "ACTIVE") {
          return { success: false, newState: state, newPhase: state.phase, error: "اللعبة غير نشطة حالياً" };
        }
        if (actor.challengeTokensRemaining <= 0) {
          return { success: false, newState: state, newPhase: state.phase, error: "ما بقاوش عندك محاولات للتشكيك (Tokens)" };
        }
        if (action.targetPlayerId === actorPlayerId) {
          return { success: false, newState: state, newPhase: state.phase, error: "ما يمكنش تشكك فراسك!" };
        }
        const target = state.players[action.targetPlayerId];
        if (!target) {
          return { success: false, newState: state, newPhase: state.phase, error: "اللاعب المستهدف غير موجود" };
        }

        const challengeId = `chal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const pending: PendingChallenge = {
          id: challengeId,
          challengerId: actorPlayerId,
          challengedPlayerId: action.targetPlayerId,
          createdAt: Date.now(),
        };

        return {
          success: true,
          newState: {
            ...state,
            pendingChallenges: [...state.pendingChallenges, pending],
          },
          newPhase: state.phase,
        };
      }

      // -------------------------------------------------------------
      // 4. RESPOND_CHALLENGE: Accused answers honestly
      // -------------------------------------------------------------
      case "RESPOND_CHALLENGE": {
        const challenge = state.pendingChallenges.find((c) => c.id === action.challengeId);
        if (!challenge) {
          return { success: false, newState: state, newPhase: state.phase, error: "التحدي غير موجود أو تم حسمه" };
        }
        if (challenge.challengedPlayerId !== actorPlayerId) {
          return { success: false, newState: state, newPhase: state.phase, error: "غير مصرح لك بالرد على هذا التحدي" };
        }

        const challenger = state.players[challenge.challengerId];
        const nextPlayers = { ...state.players };
        const remainingChallenges = state.pendingChallenges.filter((c) => c.id !== action.challengeId);
        const nextActivity = [...state.recentActivity];

        if (action.wasCaught) {
          // Mission caught!
          // Find assignment that was caught
          const caughtId = action.caughtAssignmentId || actor.assignments.find((a) => a.status === "ACTIVE")?.assignmentId;
          const updatedAssignments = actor.assignments.map((a) => {
            if (a.assignmentId === caughtId) {
              return { ...a, status: "CAUGHT" as MissionStatus, challengedAt: Date.now() };
            }
            return a;
          });

          // Accused caughtCount +1
          nextPlayers[actorPlayerId] = {
            ...actor,
            assignments: updatedAssignments,
            caughtCount: actor.caughtCount + 1,
          };

          // Challenger keeps/returns token (per spec, good detector is not penalized)
          // Challenger gains praise
          nextActivity.unshift({
            type: "CAUGHT",
            text: `🎯 تم صيد مهمة بنجاح!`,
            timestamp: Date.now(),
          });
        } else {
          // Wrong challenge!
          // Challenger loses 1 challenge token!
          if (challenger) {
            nextPlayers[challenge.challengerId] = {
              ...challenger,
              challengeTokensRemaining: Math.max(0, challenger.challengeTokensRemaining - 1),
            };
          }
          nextActivity.unshift({
            type: "WRONG_CHALLENGE",
            text: `😏 شك خاطئ! ما كايناش مهمة. ضاعت محاولة!`,
            timestamp: Date.now(),
          });
        }

        return {
          success: true,
          newState: {
            ...state,
            players: nextPlayers,
            pendingChallenges: remainingChallenges,
            recentActivity: nextActivity.slice(0, 10),
          },
          newPhase: state.phase,
        };
      }

      // -------------------------------------------------------------
      // 5. CLAIM_MISSION: Player claims success on an active mission
      // -------------------------------------------------------------
      case "CLAIM_MISSION": {
        if (state.phase !== "ACTIVE") {
          return { success: false, newState: state, newPhase: state.phase, error: "اللعبة غير نشطة حالياً" };
        }

        const asg = actor.assignments.find((a) => a.assignmentId === action.assignmentId);
        if (!asg || asg.status !== "ACTIVE") {
          return { success: false, newState: state, newPhase: state.phase, error: "المهمة غير نشطة للإنجاز" };
        }

        // If SELF_HONOR: Immediate success!
        if (asg.adjudication === "SELF_HONOR") {
          const updatedAssignments = actor.assignments.map((a) => {
            if (a.assignmentId === action.assignmentId) {
              return { ...a, status: "SUCCEEDED" as MissionStatus, completedAt: Date.now() };
            }
            return a;
          });

          const newSuccesses = actor.successes + 1;
          const nextPlayers = {
            ...state.players,
            [actorPlayerId]: {
              ...actor,
              assignments: updatedAssignments,
              successes: newSuccesses,
            },
          };

          const targetToWin = settings.successesToWin || (settings.preset === "quick" ? 2 : settings.preset === "long" ? 4 : 3);
          const isWinner = newSuccesses >= targetToWin;

          return {
            success: true,
            newState: {
              ...state,
              players: nextPlayers,
              phase: isWinner ? "GAME_OVER" : "ACTIVE",
              winnerPlayerIds: isWinner ? [actorPlayerId] : undefined,
              recentActivity: [
                { type: "SUCCESS" as const, text: `✅ نجحت مهمة جديدة! (${newSuccesses}/${targetToWin})`, timestamp: Date.now() },
                ...state.recentActivity,
              ].slice(0, 10),
            },
            newPhase: isWinner ? "GAME_OVER" : "ACTIVE",
          };
        }

        // Otherwise (TARGET_CONFIRM or GROUP_CONFIRM): Create pending claim
        const claimId = `claim_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const pending: PendingClaim = {
          id: claimId,
          claimantId: actorPlayerId,
          assignmentId: action.assignmentId,
          targetPlayerId: action.targetPlayerId,
          adjudication: asg.adjudication,
          createdAt: Date.now(),
        };

        const updatedAssignments = actor.assignments.map((a) => {
          if (a.assignmentId === action.assignmentId) {
            return { ...a, status: "CLAIM_PENDING" as MissionStatus, targetPlayerId: action.targetPlayerId };
          }
          return a;
        });

        return {
          success: true,
          newState: {
            ...state,
            players: {
              ...state.players,
              [actorPlayerId]: {
                ...actor,
                assignments: updatedAssignments,
              },
            },
            pendingClaims: [...state.pendingClaims, pending],
          },
          newPhase: state.phase,
        };
      }

      // -------------------------------------------------------------
      // 6. RESPOND_CLAIM: Target confirms or refutes claim
      // -------------------------------------------------------------
      case "RESPOND_CLAIM": {
        const claim = state.pendingClaims.find((c) => c.id === action.claimId);
        if (!claim) {
          return { success: false, newState: state, newPhase: state.phase, error: "طلب التأكيد غير موجود" };
        }

        const claimant = state.players[claim.claimantId];
        if (!claimant) {
          return { success: false, newState: state, newPhase: state.phase, error: "صاحب المهمة غير موجود" };
        }

        const nextPlayers = { ...state.players };
        const remainingClaims = state.pendingClaims.filter((c) => c.id !== action.claimId);
        const targetToWin = settings.successesToWin || (settings.preset === "quick" ? 2 : settings.preset === "long" ? 4 : 3);
        let nextWinnerIds = state.winnerPlayerIds;
        let nextPhase = state.phase;

        if (action.confirmed) {
          // Mission Succeeded!
          const updatedAssignments = claimant.assignments.map((a) => {
            if (a.assignmentId === claim.assignmentId) {
              return { ...a, status: "SUCCEEDED" as MissionStatus, completedAt: Date.now() };
            }
            return a;
          });
          const newSuccesses = claimant.successes + 1;
          nextPlayers[claim.claimantId] = {
            ...claimant,
            assignments: updatedAssignments,
            successes: newSuccesses,
          };

          if (newSuccesses >= targetToWin) {
            nextWinnerIds = [claim.claimantId];
            nextPhase = "GAME_OVER";
          }
        } else {
          // Confirmation rejected => Mission retired as FAILED
          const updatedAssignments = claimant.assignments.map((a) => {
            if (a.assignmentId === claim.assignmentId) {
              return { ...a, status: "FAILED" as MissionStatus };
            }
            return a;
          });
          nextPlayers[claim.claimantId] = {
            ...claimant,
            assignments: updatedAssignments,
          };
        }

        return {
          success: true,
          newState: {
            ...state,
            players: nextPlayers,
            pendingClaims: remainingClaims,
            phase: nextPhase,
            winnerPlayerIds: nextWinnerIds,
            recentActivity: [
              {
                type: (action.confirmed ? "SUCCESS" : "WRONG_CHALLENGE") as "SUCCESS" | "WRONG_CHALLENGE",
                text: action.confirmed ? `✅ تم تأكيد إنجاز المهمة!` : `❌ تم رفض التأكيد. أغلقت المهمة.`,
                timestamp: Date.now(),
              },
              ...state.recentActivity,
            ].slice(0, 10),
          },
          newPhase: nextPhase,
        };
      }

      default:
        return { success: false, newState: state, newPhase: state.phase, error: "أمر غير معروف" };
    }
  },

  getPublicView(ctx: GameContext<MissionSirriyaState, MissionSirriyaSettings>): PublicGameView {
    const { state, settings } = ctx;
    const targetToWin = settings.successesToWin || (settings.preset === "quick" ? 2 : settings.preset === "long" ? 4 : 3);

    const scores = Object.fromEntries(
      Object.entries(state.players).map(([id, p]) => [
        id,
        {
          successes: p.successes,
          caughtCount: p.caughtCount,
          challengeTokensRemaining: p.challengeTokensRemaining,
        },
      ])
    );

    return {
      gameId: "mission-sirriya",
      phase: state.phase,
      round: state.round,
      stateVersion: 1,
      publicData: {
        phase: state.phase,
        scores,
        targetToWin,
        winnerPlayerIds: state.winnerPlayerIds,
        recentActivity: state.recentActivity,
        endsAt: state.endsAt,
      },
    };
  },

  getPlayerView(ctx: GameContext<MissionSirriyaState, MissionSirriyaSettings>, playerId: string): PrivatePlayerGameView {
    const { state, settings } = ctx;
    const player = state.players[playerId];

    if (!player) {
      return {
        playerId,
        isHost: false,
        privateData: {},
        allowedActions: [],
      };
    }

    const allowedActions: string[] = [];
    if (state.phase === "SECRET_REVEAL") {
      allowedActions.push("ACK_REVEAL");
      if (player.freeSwapAvailable) {
        allowedActions.push("SWAP_MISSION");
      }
    }

    if (state.phase === "ACTIVE") {
      if (player.challengeTokensRemaining > 0) {
        allowedActions.push("CHALLENGE_PLAYER");
      }
      if (player.assignments.some((a) => a.status === "ACTIVE")) {
        allowedActions.push("CLAIM_MISSION");
      }
    }

    // Pending incoming challenges targeted at this player
    const myIncomingChallenges = state.pendingChallenges.filter(
      (c) => c.challengedPlayerId === playerId
    );
    if (myIncomingChallenges.length > 0) {
      allowedActions.push("RESPOND_CHALLENGE");
    }

    // Pending incoming claims requiring this player's confirmation
    const myIncomingClaims = state.pendingClaims.filter(
      (c) => c.targetPlayerId === playerId || (!c.targetPlayerId && c.claimantId !== playerId)
    );
    if (myIncomingClaims.length > 0) {
      allowedActions.push("RESPOND_CLAIM");
    }

    return {
      playerId,
      isHost: false,
      privateData: {
        assignments: player.assignments,
        successes: player.successes,
        caughtCount: player.caughtCount,
        challengeTokensRemaining: player.challengeTokensRemaining,
        freeSwapAvailable: player.freeSwapAvailable,
        myIncomingChallenges,
        myIncomingClaims,
      },
      allowedActions,
    };
  },

  checkFinished(ctx: GameContext<MissionSirriyaState, MissionSirriyaSettings>): GameEndResult | null {
    const { state, settings } = ctx;
    const targetToWin = settings.successesToWin || (settings.preset === "quick" ? 2 : settings.preset === "long" ? 4 : 3);

    const winner = Object.values(state.players).find((p) => p.successes >= targetToWin);
    if (winner) {
      const winnerPlayer = ctx.players.find((p) => p.id === winner.playerId);
      return {
        isFinished: true,
        winner: {
          players: [winner.playerId],
          summary: `${winnerPlayer?.nickname || "اللاعب"} أول من وصل لـ ${targetToWin} مهمات ناجحة! 🏆`,
        },
        scoreboard: Object.values(state.players).map((p) => {
          const pl = ctx.players.find((item) => item.id === p.playerId);
          return {
            id: p.playerId,
            label: pl?.nickname || p.playerId,
            score: p.successes,
          };
        }),
      };
    }

    if (state.endsAt && Date.now() >= state.endsAt) {
      // Find highest score
      const sorted = Object.values(state.players).sort((a, b) => b.successes - a.successes);
      if (sorted.length > 0) {
        const top = sorted[0];
        const topPlayer = ctx.players.find((p) => p.id === top.playerId);
        return {
          isFinished: true,
          winner: {
            players: [top.playerId],
            summary: `${topPlayer?.nickname || "اللاعب"} فاز بأعلى عدد مهمات! ⏱️`,
          },
          scoreboard: Object.values(state.players).map((p) => {
            const pl = ctx.players.find((item) => item.id === p.playerId);
            return {
              id: p.playerId,
              label: pl?.nickname || p.playerId,
              score: p.successes,
            };
          }),
        };
      }
    }

    return null;
  },
};
