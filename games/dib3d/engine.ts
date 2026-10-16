import {
  GameContext,
  GameDefinition,
  GameEndResult,
  TransitionResult,
  ValidationResult,
} from "@/games/registry";
import {
  Player,
  PrivatePlayerGameView,
  PublicGameView,
} from "@/lib/types";
import {
  DIB3D_CENTRAL_DRUM,
  DIB3D_ELECTRIC_BOX,
  DIB3D_TASK_STATIONS,
  DIB3D_VENTS,
  Dib3DAction,
  Dib3DChatMsg,
  Dib3DDeadBody,
  Dib3DPlayerEntity,
  Dib3DRole,
  Dib3DSettings,
  Dib3DState,
  Dib3DTaskStationId,
} from "./types";

const DERB_OUTFIT_COLORS = [
  0xe11d48, // Rose Red
  0x2563eb, // Cobalt Blue
  0x16a34a, // Emerald Green
  0xd97706, // Amber Gold
  0x9333ea, // Royal Purple
  0x0891b2, // Cyan
  0xfacc15, // Yellow
  0xec4899, // Pink
  0x4f46e5, // Indigo
  0x65a30d, // Lime
];

function clampArena(val: number): number {
  return Math.max(-15.5, Math.min(15.5, val));
}

function getZoneNameAt(x: number, z: number): string {
  if (Math.hypot(x, z) < 4.2) return DIB3D_CENTRAL_DRUM.zoneName;
  if (Math.hypot(x - DIB3D_ELECTRIC_BOX.x, z - DIB3D_ELECTRIC_BOX.z) < 4.5) {
    return DIB3D_ELECTRIC_BOX.zoneName;
  }
  let best = "زناقي الدرب";
  let bestD = Infinity;
  for (const st of DIB3D_TASK_STATIONS) {
    const d = Math.hypot(x - st.x, z - st.z);
    if (d < bestD) {
      bestD = d;
      best = st.zoneName;
    }
  }
  return best;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickTasks(count: number): Dib3DTaskStationId[] {
  const allIds = DIB3D_TASK_STATIONS.map((s) => s.id);
  return shuffle(allIds).slice(0, Math.min(count, allIds.length));
}

function buildFreshMatchState(
  players: Player[],
  settings: Dib3DSettings,
  prevScores: Record<string, number>
): Dib3DState {
  const now = Date.now();
  const count = players.length;
  const numWolves = count >= 7 ? 2 : 1;
  const tasksPerPlayer = Math.max(2, Math.min(5, settings.tasksPerPlayer || 4));

  // Build role pool: Wolves + Sheriff + Seer + Villagers
  const rolePool: Dib3DRole[] = [];
  for (let i = 0; i < numWolves; i++) rolePool.push("WOLF");
  if (rolePool.length < count) rolePool.push("SHERIFF");
  if (rolePool.length < count) rolePool.push("SEER");
  while (rolePool.length < count) rolePool.push("VILLAGER");

  const shuffledRoles = shuffle(rolePool);

  const entities: Record<string, Dib3DPlayerEntity> = {};
  const scores: Record<string, number> = { ...prevScores };
  let totalTasksRequired = 0;

  players.forEach((p, idx) => {
    if (scores[p.id] === undefined) scores[p.id] = 0;
    const role = shuffledRoles[idx] || "VILLAGER";
    const angle = (idx / Math.max(1, count)) * Math.PI * 2;
    const spawnRadius = 3.8;
    const sx = Math.round(Math.cos(angle) * spawnRadius * 10) / 10;
    const sz = Math.round(Math.sin(angle) * spawnRadius * 10) / 10;

    const assignedTasks = pickTasks(tasksPerPlayer);
    if (role !== "WOLF") {
      totalTasksRequired += assignedTasks.length;
    }

    entities[p.id] = {
      playerId: p.id,
      role,
      x: sx,
      z: sz,
      rotY: Math.atan2(-sx, -sz),
      isAlive: true,
      outfitColor: DERB_OUTFIT_COLORS[idx % DERB_OUTFIT_COLORS.length],
      assignedTasks,
      completedTasks: [],
      sheriffBullets: role === "SHERIFF" ? 1 : 0,
      seerScansLeft: role === "SEER" ? 2 : 0,
      meetingsLeft: 1,
      lastKillAt: now - 4000, // short initial grace period
    };
  });

  return {
    phase: "ROAM_3D",
    round: 1,
    phaseStartedAt: now,
    phaseEndsAt: now + 300_000,
    entities,
    deadBodies: [],
    totalTasksCompleted: 0,
    totalTasksRequired: Math.max(3, totalTasksRequired),
    scores,
    seerKnownRoles: {},
    votes: {},
    chatFeed: [
      {
        id: `sys_${now}`,
        senderId: "SYSTEM",
        senderName: "البرّاح د الدرب",
        text: "🌙 طاح الليل على الدرب! كمّلو المهام فـ الفران والحانوت والقهوة، وحضيو راسكم من الذيب الخائن!",
        type: "SYSTEM",
        timestamp: now,
      },
    ],
  };
}

function checkAndApplyWinCondition(
  state: Dib3DState,
  players: Player[]
): boolean {
  const allEnts = Object.values(state.entities);
  const aliveWolves = allEnts.filter((e) => e.role === "WOLF" && e.isAlive);
  const aliveInnocents = allEnts.filter((e) => e.role !== "WOLF" && e.isAlive);

  // 1. All Wolves Eliminated -> Villagers Win!
  if (aliveWolves.length === 0) {
    state.phase = "GAME_OVER";
    state.winnerTeam = "VILLAGERS";
    state.winnerHeadline = "🎉 ولاد الدرب طردوا الذيب الخائن!";
    state.winnerSummary =
      "قضيتو على الذيب ورجع الأمان للدرب المغربي! كاملين ولاد الدرب ربحو +150 نقطة!";
    for (const e of allEnts) {
      if (e.role !== "WOLF") {
        state.scores[e.playerId] = (state.scores[e.playerId] || 0) + 150;
      }
    }
    return true;
  }

  // 2. 100% Tasks Completed -> Villagers Win!
  if (
    state.totalTasksRequired > 0 &&
    state.totalTasksCompleted >= state.totalTasksRequired
  ) {
    state.phase = "GAME_OVER";
    state.winnerTeam = "VILLAGERS";
    state.winnerHeadline = "🥖🍵 بركة الدرب كملات 100%!";
    state.winnerSummary =
      "ولاد الدرب كمّلو جميع المهام فـ الفران والحانوت والقهوة قبل ما يسيطر الذيب! (+150 نقطة)";
    for (const e of allEnts) {
      if (e.role !== "WOLF") {
        state.scores[e.playerId] = (state.scores[e.playerId] || 0) + 150;
      }
    }
    return true;
  }

  // 3. Wolves Outnumber Inocents (or 0 Innocents left in a 2-player duel) -> Wolves Win!
  const wolvesParityReached =
    players.length <= 2
      ? aliveInnocents.length === 0
      : aliveWolves.length >= aliveInnocents.length;

  if (wolvesParityReached) {
    state.phase = "GAME_OVER";
    state.winnerTeam = "WOLVES";
    const wolfNames = allEnts
      .filter((e) => e.role === "WOLF")
      .map((w) => players.find((p) => p.id === w.playerId)?.nickname || "الذيب")
      .join(" و ");
    state.winnerHeadline = `🐺🩸 الذيب (${wolfNames}) سيطر على الدرب!`;
    state.winnerSummary = `الذيب الخائن غدر الدرب فـ الظلام وما بقى حد يوقف قدامو! (+180 نقطة للذيب)`;
    for (const e of allEnts) {
      if (e.role === "WOLF") {
        state.scores[e.playerId] = (state.scores[e.playerId] || 0) + 180;
      }
    }
    return true;
  }

  return false;
}

function resolveMeetingVotes(state: Dib3DState, players: Player[]) {
  const now = Date.now();
  const tally: Record<string, number> = {};
  let skipCount = 0;

  for (const [voterId, targetId] of Object.entries(state.votes)) {
    const voter = state.entities[voterId];
    if (!voter || !voter.isAlive) continue;
    if (targetId === "SKIP") {
      skipCount++;
    } else {
      tally[targetId] = (tally[targetId] || 0) + 1;
    }
  }

  let topCandidate: string | null = null;
  let topVotes = 0;
  let isTie = false;

  for (const [candId, count] of Object.entries(tally)) {
    if (count > topVotes) {
      topVotes = count;
      topCandidate = candId;
      isTie = false;
    } else if (count === topVotes) {
      isTie = true;
    }
  }

  if (!topCandidate || isTie || topVotes <= skipCount) {
    state.ejectedPlayerId = null;
    state.ejectedHeadline = "🤷‍♂️ ما تافقتوا على حتّى واحد!";
    state.ejectedSubtitle =
      skipCount >= topVotes
        ? "الأغلبية اختارو تخطي التصويت — حتّى حد ما تطرد من الدرب هاد الليلة!"
        : "تعادل فـ الأصوات! حتّى واحد ما تطرد... ردّو بالكم فـ الزنقة!";
  } else {
    const ejectedEnt = state.entities[topCandidate];
    const ejectedName =
      players.find((p) => p.id === topCandidate)?.nickname || "لاعب";
    if (ejectedEnt) {
      ejectedEnt.isAlive = false;
      state.ejectedPlayerId = topCandidate;

      if (ejectedEnt.role === "WOLF") {
        state.ejectedHeadline = `🐺🎯 جبتوها لاصقة! ${ejectedName} كان هو الذيب الخائن!`;
        state.ejectedSubtitle = `طردتو ${ejectedName} من الدرب وطلع بصح هو الذيب!`;
        // Reward voters who voted for the Wolf
        for (const [voterId, targetId] of Object.entries(state.votes)) {
          if (targetId === topCandidate) {
            state.scores[voterId] = (state.scores[voterId] || 0) + 75;
          }
        }
      } else {
        const roleLabel =
          ejectedEnt.role === "SHERIFF"
            ? "الصياد 🎯"
            : ejectedEnt.role === "SEER"
            ? "الشوافة 🔮"
            : "ولد الدرب بريء 👨‍🌾";
        state.ejectedHeadline = `😱 ظلمتوه! ${ejectedName} ما كانش ذيب!`;
        state.ejectedSubtitle = `${ejectedName} كان غير ${roleLabel}... الذيب الحقيقي باقي كيدور بيناتكم!`;
      }
    }
  }

  // Check if this ejection ended the game
  if (checkAndApplyWinCondition(state, players)) {
    return;
  }

  state.phase = "EJECTION_REVEAL";
  state.phaseStartedAt = now;
  state.phaseEndsAt = now + 7000;
}

export const Dib3DEngine: GameDefinition<
  Dib3DState,
  Dib3DAction,
  Dib3DSettings
> = {
  id: "dib3d",
  slug: "dib3d",
  version: 1,
  displayNameKey: "الذيب 3D: الدرب المظلم (Among Us Marocain)",
  shortDescriptionKey:
    "تحرّك فـ الدرب المغربي 3D بالليل! كمّل المهام فـ الفران والحانوت والقهوة، وحضي راسك من الذيب اللي كيغدر فـ الظلام وكيتخشّى فـ القادوس!",
  minPlayers: 2,
  maxPlayers: 16,
  capabilities: ["MULTI_PHONE", "REALTIME", "SCORES", "TIMERS", "ANONYMOUS_VOTING"],
  defaultSettings: {
    tasksPerPlayer: 4,
    killCooldownSec: 12,
    meetingDurationSec: 55,
    interactionMode: "MULTI_PHONE",
  },

  validateSetup(players: Player[]): ValidationResult {
    if (players.length < 2) {
      return {
        isValid: false,
        errors: ["خاص على الأقل 2 لاعبين باش تلعبو الذيب 3D!"],
      };
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: Dib3DSettings): Dib3DState {
    return buildFreshMatchState(players, settings, {});
  },

  start(ctx: GameContext<Dib3DState, Dib3DSettings>): TransitionResult<Dib3DState> {
    const state = this.createInitialState(ctx.players, ctx.settings);
    return {
      success: true,
      newState: state,
      newPhase: state.phase,
      newRound: 1,
    };
  },

  handleAction(
    ctx: GameContext<Dib3DState, Dib3DSettings>,
    actorPlayerId: string,
    action: Dib3DAction
  ): TransitionResult<Dib3DState> {
    const state: Dib3DState = structuredClone(ctx.state);
    const now = Date.now();
    const actorEnt = state.entities[actorPlayerId];
    const actorName =
      ctx.players.find((p) => p.id === actorPlayerId)?.nickname || "لاعب";

    switch (action.type) {
      case "SYNC_POS": {
        if (!actorEnt || state.phase !== "ROAM_3D") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        actorEnt.x = clampArena(action.x);
        actorEnt.z = clampArena(action.z);
        actorEnt.rotY = action.rotY;
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "COMPLETE_TASK": {
        if (!actorEnt || state.phase !== "ROAM_3D") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        // Both alive & ghost villagers can complete their assigned tasks!
        if (
          actorEnt.role !== "WOLF" &&
          actorEnt.assignedTasks.includes(action.stationId) &&
          !actorEnt.completedTasks.includes(action.stationId)
        ) {
          actorEnt.completedTasks.push(action.stationId);
          state.totalTasksCompleted += 1;
          state.scores[actorPlayerId] = (state.scores[actorPlayerId] || 0) + 30;
          checkAndApplyWinCondition(state, ctx.players);
        }
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "WOLF_KILL": {
        if (
          !actorEnt ||
          !actorEnt.isAlive ||
          actorEnt.role !== "WOLF" ||
          state.phase !== "ROAM_3D"
        ) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const cooldownMs = (ctx.settings.killCooldownSec || 12) * 1000;
        if (actorEnt.lastKillAt && now - actorEnt.lastKillAt < cooldownMs - 1000) {
          return { success: true, newState: state, newPhase: state.phase };
        }

        const victim = state.entities[action.targetId];
        if (!victim || !victim.isAlive || victim.role === "WOLF") {
          return { success: true, newState: state, newPhase: state.phase };
        }

        const vx = action.targetX !== undefined ? clampArena(action.targetX) : victim.x;
        const vz = action.targetZ !== undefined ? clampArena(action.targetZ) : victim.z;
        const dist = Math.hypot(action.x - vx, action.z - vz);
        if (dist > 4.2) {
          return { success: true, newState: state, newPhase: state.phase };
        }

        actorEnt.x = clampArena(vx);
        actorEnt.z = clampArena(vz);
        actorEnt.lastKillAt = now;
        victim.isAlive = false;
        victim.x = vx;
        victim.z = vz;

        const victimName =
          ctx.players.find((p) => p.id === victim.playerId)?.nickname || "ضحية";
        const body: Dib3DDeadBody = {
          id: `body_${now}_${victim.playerId}`,
          victimId: victim.playerId,
          victimName,
          x: vx,
          z: vz,
          outfitColor: victim.outfitColor,
          zoneName: getZoneNameAt(vx, vz),
          createdAt: now,
        };
        state.deadBodies.push(body);
        state.scores[actorPlayerId] = (state.scores[actorPlayerId] || 0) + 95;

        checkAndApplyWinCondition(state, ctx.players);
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "WOLF_VENT": {
        if (
          !actorEnt ||
          !actorEnt.isAlive ||
          actorEnt.role !== "WOLF" ||
          state.phase !== "ROAM_3D"
        ) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        // Find current nearest vent and teleport to the next vent clockwise
        let currentIdx = 0;
        let bestDist = Infinity;
        DIB3D_VENTS.forEach((v, i) => {
          const d = Math.hypot(actorEnt.x - v.x, actorEnt.z - v.z);
          if (d < bestDist) {
            bestDist = d;
            currentIdx = i;
          }
        });
        const nextVent = DIB3D_VENTS[(currentIdx + 1) % DIB3D_VENTS.length];
        actorEnt.x = nextVent.x;
        actorEnt.z = nextVent.z;
        actorEnt.lastVentAt = now;
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "SABOTAGE_LIGHTS": {
        if (
          !actorEnt ||
          !actorEnt.isAlive ||
          actorEnt.role !== "WOLF" ||
          state.phase !== "ROAM_3D"
        ) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        if (state.lastSabotageAt && now - state.lastSabotageAt < 25000) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        state.lastSabotageAt = now;
        state.lightsOutUntil = now + 22000;
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "FIX_LIGHTS": {
        if (!actorEnt || !actorEnt.isAlive || state.phase !== "ROAM_3D") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        if (state.lightsOutUntil && now < state.lightsOutUntil) {
          state.lightsOutUntil = 0;
          state.scores[actorPlayerId] = (state.scores[actorPlayerId] || 0) + 35;
        }
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "SHERIFF_SHOOT": {
        if (
          !actorEnt ||
          !actorEnt.isAlive ||
          actorEnt.role !== "SHERIFF" ||
          actorEnt.sheriffBullets <= 0 ||
          state.phase !== "ROAM_3D"
        ) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const target = state.entities[action.targetId];
        if (!target || !target.isAlive) {
          return { success: true, newState: state, newPhase: state.phase };
        }

        actorEnt.sheriffBullets -= 1;

        if (target.role === "WOLF") {
          // Direct hit on the Wolf!
          target.isAlive = false;
          const targetName =
            ctx.players.find((p) => p.id === target.playerId)?.nickname || "الذيب";
          state.deadBodies.push({
            id: `body_${now}_${target.playerId}`,
            victimId: target.playerId,
            victimName: targetName,
            x: target.x,
            z: target.z,
            outfitColor: target.outfitColor,
            zoneName: getZoneNameAt(target.x, target.z),
            createdAt: now,
          });
          state.scores[actorPlayerId] = (state.scores[actorPlayerId] || 0) + 150;
        } else {
          // MISFIRE ON AN INNOCENT VILLAGER! Sheriff dies from guilt!
          actorEnt.isAlive = false;
          state.deadBodies.push({
            id: `body_${now}_${actorPlayerId}`,
            victimId: actorPlayerId,
            victimName: actorName,
            x: action.x,
            z: action.z,
            outfitColor: actorEnt.outfitColor,
            zoneName: getZoneNameAt(action.x, action.z),
            createdAt: now,
          });
        }

        checkAndApplyWinCondition(state, ctx.players);
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "SEER_SCAN": {
        if (
          !actorEnt ||
          !actorEnt.isAlive ||
          actorEnt.role !== "SEER" ||
          actorEnt.seerScansLeft <= 0 ||
          state.phase !== "ROAM_3D"
        ) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const target = state.entities[action.targetId];
        if (!target || !target.isAlive) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        actorEnt.seerScansLeft -= 1;
        if (!state.seerKnownRoles[actorPlayerId]) {
          state.seerKnownRoles[actorPlayerId] = {};
        }
        state.seerKnownRoles[actorPlayerId][target.playerId] =
          target.role === "WOLF" ? "WOLF" : "INNOCENT";
        state.scores[actorPlayerId] = (state.scores[actorPlayerId] || 0) + 25;
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "REPORT_BODY": {
        if (!actorEnt || !actorEnt.isAlive || state.phase !== "ROAM_3D") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const body =
          state.deadBodies.find((b) => b.id === action.bodyId) ||
          state.deadBodies[0];
        if (!body) {
          return { success: true, newState: state, newPhase: state.phase };
        }

        state.phase = "MEETING";
        state.phaseStartedAt = now;
        state.phaseEndsAt = now + (ctx.settings.meetingDurationSec || 55) * 1000;
        state.meetingCallerId = actorPlayerId;
        state.meetingReason = "BODY_REPORT";
        state.reportedBody = body;
        state.lightsOutUntil = 0;
        state.votes = {};
        state.chatFeed = [
          {
            id: `rep_${now}`,
            senderId: actorPlayerId,
            senderName: actorName,
            text: `🚨 وااا عباد الله! لقيت جثة ${body.victimName} طايحة ${body.zoneName}! شكون الذيب؟!`,
            type: "SYSTEM",
            timestamp: now,
          },
        ];
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "CALL_MEETING": {
        if (
          !actorEnt ||
          !actorEnt.isAlive ||
          actorEnt.meetingsLeft <= 0 ||
          state.phase !== "ROAM_3D"
        ) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        actorEnt.meetingsLeft -= 1;
        state.phase = "MEETING";
        state.phaseStartedAt = now;
        state.phaseEndsAt = now + (ctx.settings.meetingDurationSec || 55) * 1000;
        state.meetingCallerId = actorPlayerId;
        state.meetingReason = "EMERGENCY_DRUM";
        state.reportedBody = null;
        state.lightsOutUntil = 0;
        state.votes = {};
        state.chatFeed = [
          {
            id: `drum_${now}`,
            senderId: actorPlayerId,
            senderName: actorName,
            text: `🥁 ${actorName} دقّ طبل الساحة وجمع الدرب كامل لاجتماع طارئ!`,
            type: "SYSTEM",
            timestamp: now,
          },
        ];
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "QUICK_CHAT": {
        if (!actorEnt || !actorEnt.isAlive || state.phase !== "MEETING") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const msg: Dib3DChatMsg = {
          id: `chat_${now}_${Math.random().toString(36).slice(2, 6)}`,
          senderId: actorPlayerId,
          senderName: actorName,
          text: action.text.slice(0, 120),
          type: action.chatType,
          timestamp: now,
        };
        state.chatFeed = [msg, ...state.chatFeed].slice(0, 14);
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "CAST_VOTE": {
        if (!actorEnt || !actorEnt.isAlive || state.phase !== "MEETING") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        state.votes[actorPlayerId] = action.targetId;

        // Check if all alive players have voted
        const aliveIds = Object.values(state.entities)
          .filter((e) => e.isAlive)
          .map((e) => e.playerId);
        const allVoted = aliveIds.every((id) => Boolean(state.votes[id]));
        if (allVoted) {
          resolveMeetingVotes(state, ctx.players);
        }
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "FINALIZE_VOTES": {
        if (state.phase !== "MEETING") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        resolveMeetingVotes(state, ctx.players);
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "RESUME_ROAM": {
        if (state.phase !== "EJECTION_REVEAL") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        if (checkAndApplyWinCondition(state, ctx.players)) {
          return { success: true, newState: state, newPhase: state.phase };
        }

        state.phase = "ROAM_3D";
        state.round += 1;
        state.phaseStartedAt = now;
        state.phaseEndsAt = now + 300_000;
        state.deadBodies = [];
        state.votes = {};
        state.reportedBody = null;
        state.ejectedPlayerId = null;

        // Respawn players in a circle around the central plaza and reset kill cooldown
        const count = ctx.players.length;
        ctx.players.forEach((p, idx) => {
          const ent = state.entities[p.id];
          if (!ent) return;
          const angle = (idx / Math.max(1, count)) * Math.PI * 2;
          ent.x = Math.round(Math.cos(angle) * 3.8 * 10) / 10;
          ent.z = Math.round(Math.sin(angle) * 3.8 * 10) / 10;
          ent.lastKillAt = now;
        });

        return {
          success: true,
          newState: state,
          newPhase: state.phase,
          newRound: state.round,
        };
      }

      case "RESTART_GAME": {
        const next = buildFreshMatchState(ctx.players, ctx.settings, {});
        return {
          success: true,
          newState: next,
          newPhase: next.phase,
          newRound: 1,
        };
      }

      default:
        return { success: true, newState: state, newPhase: state.phase };
    }
  },

  getPublicView(ctx: GameContext<Dib3DState, Dib3DSettings>): PublicGameView {
    const s = ctx.state;
    // Sanitize roles in publicData while game is active so no one can peek roles!
    const sanitizedEntities: Record<string, Dib3DPlayerEntity> = {};
    for (const [id, ent] of Object.entries(s.entities)) {
      sanitizedEntities[id] = {
        ...ent,
        role: s.phase === "GAME_OVER" ? ent.role : "VILLAGER",
        assignedTasks: [],
        completedTasks: [],
      };
    }

    const alivePlayerIds = Object.values(s.entities)
      .filter((e) => e.isAlive)
      .map((e) => e.playerId);

    return {
      gameId: "dib3d",
      phase: s.phase,
      round: s.round,
      stateVersion: ctx.stateVersion,
      publicData: {
        phase: s.phase,
        round: s.round,
        phaseStartedAt: s.phaseStartedAt,
        phaseEndsAt: s.phaseEndsAt,
        entities: sanitizedEntities,
        deadBodies: s.deadBodies,
        lightsOutUntil: s.lightsOutUntil,
        totalTasksCompleted: s.totalTasksCompleted,
        totalTasksRequired: s.totalTasksRequired,
        scores: s.scores,
        alivePlayerIds,
        meetingCallerId: s.meetingCallerId,
        meetingReason: s.meetingReason,
        reportedBody: s.reportedBody,
        votes: s.votes,
        chatFeed: s.chatFeed,
        ejectedPlayerId: s.ejectedPlayerId,
        ejectedHeadline: s.ejectedHeadline,
        ejectedSubtitle: s.ejectedSubtitle,
        winnerTeam: s.winnerTeam,
        winnerHeadline: s.winnerHeadline,
        winnerSummary: s.winnerSummary,
      },
    };
  },

  getPlayerView(
    ctx: GameContext<Dib3DState, Dib3DSettings>,
    playerId: string
  ): PrivatePlayerGameView {
    const s = ctx.state;
    const myEnt = s.entities[playerId] || null;
    const isHost = Boolean(ctx.players.find((p) => p.id === playerId)?.isHost);
    const fellowWolfIds =
      myEnt?.role === "WOLF"
        ? Object.values(s.entities)
            .filter((e) => e.role === "WOLF")
            .map((e) => e.playerId)
        : [];

    return {
      playerId,
      isHost,
      myRole: myEnt?.role,
      allowedActions: [],
      privateData: {
        isAlive: myEnt?.isAlive ?? true,
        myEntity: myEnt,
        fellowWolfIds,
        seerKnown: s.seerKnownRoles[playerId] || {},
        myScore: s.scores[playerId] || 0,
      },
    };
  },

  checkFinished(ctx: GameContext<Dib3DState, Dib3DSettings>): GameEndResult | null {
    if (ctx.state.phase !== "GAME_OVER") return null;
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
        team: ctx.state.winnerTeam,
        summary: ctx.state.winnerSummary || "سالات اللعبة!",
      },
      scoreboard,
    };
  },
};
