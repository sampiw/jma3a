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
  SandalaAction,
  SandalaFeedItem,
  SandalaPlayerEntity,
  SandalaSettings,
  SandalaState,
} from "./types";

const OUTFIT_COLORS = [
  0x2563eb, // Cobalt Blue
  0x16a34a, // Emerald Green
  0xd97706, // Amber Gold
  0x9333ea, // Royal Purple
  0x0891b2, // Cyan
  0xe11d48, // Crimson
  0xca8a04, // Yellow
  0x4f46e5, // Indigo
];

function clampArena(val: number): number {
  return Math.max(-15.5, Math.min(15.5, val));
}

function pushFeed(
  feed: SandalaFeedItem[],
  text: string,
  type: SandalaFeedItem["type"]
): SandalaFeedItem[] {
  const item: SandalaFeedItem = {
    id: `sf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    text,
    type,
  };
  return [item, ...feed].slice(0, 8);
}

function buildRoundState(
  players: Player[],
  settings: SandalaSettings,
  round: number,
  prevScores: Record<string, number>
): SandalaState {
  const now = Date.now();
  const count = players.length;
  const mamaIdx = (round - 1) % Math.max(1, count);
  const mamaId = players[mamaIdx]?.id || players[0]?.id || "p1";
  const mamaIds = [mamaId];

  const entities: Record<string, SandalaPlayerEntity> = {};
  const scores: Record<string, number> = { ...prevScores };

  players.forEach((p, idx) => {
    if (scores[p.id] === undefined) scores[p.id] = 0;
    const isMama = mamaIds.includes(p.id);
    // Mama spawns near the broken teapot in the center; Kids spawn in a wide circle around the salon
    const angle = (idx / Math.max(1, count)) * Math.PI * 2;
    const radius = isMama ? 1.8 : 9.5;
    const sx = isMama ? 0 : Math.round(Math.cos(angle) * radius * 10) / 10;
    const sz = isMama ? -2.2 : Math.round(Math.sin(angle) * radius * 10) / 10;

    entities[p.id] = {
      playerId: p.id,
      role: isMama ? "MAMA" : "KID",
      x: sx,
      z: sz,
      rotY: Math.atan2(-sx, -sz),
      hearts: isMama ? 99 : settings.kidHearts || 3,
      isKO: false,
      outfitColor: isMama ? 0xdc2626 : OUTFIT_COLORS[idx % OUTFIT_COLORS.length],
      betrayalsCount: 0,
      dodgesCount: 0,
      hitsCount: 0,
    };
  });

  const mamaName = players.find((p) => p.id === mamaId)?.nickname || "الواليدة";

  return {
    phase: "ROUND_PLAY",
    round,
    maxRounds: Math.max(settings.maxRounds || 3, Math.min(players.length, 5)),
    phaseStartedAt: now,
    phaseEndsAt: now + (settings.roundDurationSec || 65) * 1000,
    mamaIds,
    entities,
    traps: [],
    scores,
    feed: [
      {
        id: `init_${now}`,
        timestamp: now,
        text: `🚨 تهرّس البراد فـ الصالون! ${mamaName} جبدات الصندالة والشطابة — هربو ونبطحو!`,
        type: "SMACK",
      },
    ],
  };
}

function concludeRound(
  state: SandalaState,
  players: Player[],
  winner: "MAMA" | "KIDS"
): SandalaState {
  const next: SandalaState = {
    ...state,
    phase: "ROUND_END",
    roundWinner: winner,
  };

  const survivingKids = Object.values(next.entities).filter(
    (e) => e.role === "KID" && !e.isKO
  );

  if (winner === "KIDS") {
    for (const k of survivingKids) {
      next.scores[k.playerId] = (next.scores[k.playerId] || 0) + 120;
    }
    const names = survivingKids
      .map((k) => players.find((p) => p.id === k.playerId)?.nickname || "برهوش")
      .join("، ");
    next.roundHeadline = "🏃‍♂️😂 البراهش فلتو من الصندالة!";
    next.roundSummary = `سالا الوقت وبقاو واقفين بلا عصا: ${names || "الأبطال"} (+120 نقطة لكل واحد)!`;
  } else {
    for (const mid of next.mamaIds) {
      next.scores[mid] = (next.scores[mid] || 0) + 130;
    }
    const mamaName =
      players.find((p) => p.id === next.mamaIds[0])?.nickname || "الواليدة";
    next.roundHeadline = `🩴👑 ${mamaName} ربّات الصالون كامل!`;
    next.roundSummary = `حتّى واحد ما فلت من الصندالة الطايرة ديال ${mamaName} (+130 نقطة إضافية)!`;
  }

  return next;
}

export const SandalaEngine: GameDefinition<
  SandalaState,
  SandalaAction,
  SandalaSettings
> = {
  id: "sandala",
  slug: "sandala",
  version: 1,
  displayNameKey: "صندالة الواليدة 3D (La Chancla)",
  shortDescriptionKey:
    "البرهوش هرّس البراد فـ الصالون! هرب من الصندالة الطايرة، نبطح فـ الزربية، وغدر صحابك بـ الصابون البلدي!",
  minPlayers: 2,
  maxPlayers: 16,
  capabilities: ["MULTI_PHONE", "REALTIME", "SCORES", "TIMERS"],
  defaultSettings: {
    roundDurationSec: 65,
    maxRounds: 4,
    kidHearts: 3,
    interactionMode: "MULTI_PHONE",
  },

  validateSetup(players: Player[]): ValidationResult {
    if (players.length < 2) {
      return {
        isValid: false,
        errors: ["خاص على الأقل 2 لاعبين باش تلعبو صندالة الواليدة 3D!"],
      };
    }
    return { isValid: true };
  },

  createInitialState(players: Player[], settings: SandalaSettings): SandalaState {
    return buildRoundState(players, settings, 1, {});
  },

  start(ctx: GameContext<SandalaState, SandalaSettings>): TransitionResult<SandalaState> {
    const state = this.createInitialState(ctx.players, ctx.settings);
    return {
      success: true,
      newState: state,
      newPhase: state.phase,
      newRound: 1,
      timerDurationMs: (ctx.settings.roundDurationSec || 65) * 1000,
    };
  },

  handleAction(
    ctx: GameContext<SandalaState, SandalaSettings>,
    actorPlayerId: string,
    action: SandalaAction
  ): TransitionResult<SandalaState> {
    const state: SandalaState = structuredClone(ctx.state);
    const now = Date.now();
    const actorEnt = state.entities[actorPlayerId];
    const actorName =
      ctx.players.find((p) => p.id === actorPlayerId)?.nickname || "لاعب";

    switch (action.type) {
      case "SYNC_POS": {
        if (!actorEnt || actorEnt.isKO || state.phase !== "ROUND_PLAY") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        actorEnt.x = clampArena(action.x);
        actorEnt.z = clampArena(action.z);
        actorEnt.rotY = action.rotY;

        // Check if player stepped on an active Sabon Beldi trap (not their own for first 1.5s)
        for (const trap of state.traps) {
          if (trap.triggered) continue;
          if (trap.ownerId === actorPlayerId && now - trap.createdAt < 1800) continue;
          const dist = Math.hypot(actorEnt.x - trap.x, actorEnt.z - trap.z);
          if (dist < 1.15 && now > (actorEnt.slippedUntil || 0)) {
            trap.triggered = true;
            actorEnt.slippedUntil = now + 2100;
            const ownerName =
              ctx.players.find((p) => p.id === trap.ownerId)?.nickname || "برهوش";
            const ownerEnt = state.entities[trap.ownerId];
            if (ownerEnt && trap.ownerId !== actorPlayerId) {
              ownerEnt.betrayalsCount += 1;
              const pts = actorEnt.role === "MAMA" ? 65 : 45;
              state.scores[trap.ownerId] = (state.scores[trap.ownerId] || 0) + pts;
              state.feed = pushFeed(
                state.feed,
                actorEnt.role === "MAMA"
                  ? `🧼😂 الواليدة ${actorName} زلقات فـ الصابون البلدي ديال ${ownerName}! (+65 ن)`
                  : `🧼😈 غدر الصاحب! ${actorName} زلق فـ الصابون البلدي ديال ${ownerName}! (+45 ن)`,
                "BETRAY"
              );
            }
            break;
          }
        }
        state.traps = state.traps.filter((t) => !t.triggered);
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "KID_FLOP": {
        if (!actorEnt || actorEnt.role !== "KID" || actorEnt.isKO || state.phase !== "ROUND_PLAY") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        actorEnt.x = clampArena(action.x);
        actorEnt.z = clampArena(action.z);
        actorEnt.floppedUntil = now + 1500;
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "DROP_SABON": {
        if (!actorEnt || actorEnt.role !== "KID" || actorEnt.isKO || state.phase !== "ROUND_PLAY") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const activeMine = state.traps.filter((t) => t.ownerId === actorPlayerId && !t.triggered);
        if (activeMine.length >= 3) {
          // Remove oldest trap from this player
          const oldest = activeMine[0];
          state.traps = state.traps.filter((t) => t.id !== oldest.id);
        }
        state.traps.push({
          id: `sabon_${now}_${Math.random().toString(36).slice(2, 6)}`,
          ownerId: actorPlayerId,
          x: clampArena(action.x),
          z: clampArena(action.z),
          createdAt: now,
        });
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "TRIGGER_SABON": {
        if (!actorEnt || state.phase !== "ROUND_PLAY") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const trap = state.traps.find((t) => t.id === action.trapId && !t.triggered);
        if (trap && now > (actorEnt.slippedUntil || 0)) {
          trap.triggered = true;
          actorEnt.slippedUntil = now + 2100;
          const ownerName =
            ctx.players.find((p) => p.id === trap.ownerId)?.nickname || "برهوش";
          const ownerEnt = state.entities[trap.ownerId];
          if (ownerEnt && trap.ownerId !== actorPlayerId) {
            ownerEnt.betrayalsCount += 1;
            const pts = actorEnt.role === "MAMA" ? 65 : 45;
            state.scores[trap.ownerId] = (state.scores[trap.ownerId] || 0) + pts;
            state.feed = pushFeed(
              state.feed,
              actorEnt.role === "MAMA"
                ? `🧼😂 الواليدة ${actorName} زلقات فـ الصابون البلدي ديال ${ownerName}! (+65 ن)`
                : `🧼😈 غدر الصاحب! ${actorName} زلق فـ الصابون البلدي ديال ${ownerName}! (+45 ن)`,
              "BETRAY"
            );
          }
          state.traps = state.traps.filter((t) => !t.triggered);
        }
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "SNITCH_FRIEND": {
        if (!actorEnt || actorEnt.role !== "KID" || actorEnt.isKO || state.phase !== "ROUND_PLAY") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const otherKids = Object.values(state.entities).filter(
          (e) => e.role === "KID" && !e.isKO && e.playerId !== actorPlayerId
        );
        const victim =
          otherKids.length > 0
            ? otherKids[Math.floor(Math.random() * otherKids.length)]
            : actorEnt;
        victim.snitchedUntil = now + 4500;
        const victimName =
          ctx.players.find((p) => p.id === victim.playerId)?.nickname || "صاحبو";
        state.scores[actorPlayerId] = (state.scores[actorPlayerId] || 0) + 30;
        state.feed = pushFeed(
          state.feed,
          otherKids.length > 0
            ? `👉🐀 الشكاية! ${actorName}: «والله ما أنا أ الواليدة، راه ${victimName} اللي هرّس البراد!» (+30 ن)`
            : `👉😂 ${actorName} كيحلّف: «والله ما قست البراد أ الواليدة!» (+30 ن)`,
          "SNITCH"
        );
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "CHAABI_DANCE": {
        if (!actorEnt || actorEnt.isKO || state.phase !== "ROUND_PLAY") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        actorEnt.x = clampArena(action.x);
        actorEnt.z = clampArena(action.z);
        actorEnt.dancingUntil = now + 2200;
        state.scores[actorPlayerId] = (state.scores[actorPlayerId] || 0) + 40;
        state.feed = pushFeed(
          state.feed,
          `💃🎵 التفرعين! ${actorName} طلق شطيح الشعبي وسط الصالون! (+40 ن)`,
          "DANCE"
        );
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "MAMA_RAGE": {
        if (!actorEnt || actorEnt.role !== "MAMA" || state.phase !== "ROUND_PLAY") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        actorEnt.rageUntil = now + 4500;
        state.feed = pushFeed(
          state.feed,
          `😡🔥 ${actorName} طلع ليها الدم: «وااا بلاتي نجيكم يا البراهش!»`,
          "SMACK"
        );
        return { success: true, newState: state, newPhase: state.phase };
      }

      case "THROW_SANDALA": {
        if (!actorEnt || actorEnt.role !== "MAMA" || state.phase !== "ROUND_PLAY") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        if (actorEnt.lastThrowAt && now - actorEnt.lastThrowAt < 550) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        actorEnt.x = clampArena(action.x);
        actorEnt.z = clampArena(action.z);
        actorEnt.rotY = action.rotY;
        actorEnt.lastThrowAt = now;

        // Update Kid coordinates from live targets if within reasonable tolerance
        const liveFlopMap = new Map<string, boolean>();
        if (action.targets) {
          for (const t of action.targets) {
            const ent = state.entities[t.id];
            if (ent && ent.role === "KID" && !ent.isKO) {
              if (Math.hypot(t.x - ent.x, t.z - ent.z) <= 7.5) {
                ent.x = clampArena(t.x);
                ent.z = clampArena(t.z);
              }
              if (t.flopped !== undefined) liveFlopMap.set(t.id, t.flopped);
            }
          }
        }

        // Ray / homing cone check along Mama's throw direction (up to 15m range!)
        const dirX = Math.sin(action.rotY);
        const dirZ = Math.cos(action.rotY);
        let bestKid: SandalaPlayerEntity | null = null;
        let bestScore = Infinity;

        for (const ent of Object.values(state.entities)) {
          if (ent.role !== "KID" || ent.isKO) continue;
          if (action.targetId && ent.playerId === action.targetId) {
            bestKid = ent;
            break;
          }
          const dx = ent.x - actorEnt.x;
          const dz = ent.z - actorEnt.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 15.5) continue;

          // Project onto throw ray
          const along = dx * dirX + dz * dirZ;
          if (along < -0.5) continue;
          const perp = Math.abs(dx * dirZ - dz * dirX);
          // Homing corridor widens slightly with distance (La Chancla curves!)
          const maxCorridor = 1.65 + Math.min(1.4, Math.max(0, along) * 0.12);
          if (perp <= maxCorridor) {
            const score = perp * 2 + along * 0.25;
            if (score < bestScore) {
              bestScore = score;
              bestKid = ent;
            }
          }
        }

        if (bestKid) {
          const targetName =
            ctx.players.find((p) => p.id === bestKid!.playerId)?.nickname || "برهوش";
          const isFlopped =
            now <= (bestKid.floppedUntil || 0) ||
            Boolean(liveFlopMap.get(bestKid.playerId));

          if (isFlopped && !(bestKid.slippedUntil && now <= bestKid.slippedUntil)) {
            // MATRIX DODGE! The Kid flopped flat on the carpet!
            bestKid.dodgesCount += 1;
            state.scores[bestKid.playerId] = (state.scores[bestKid.playerId] || 0) + 35;
            state.feed = pushFeed(
              state.feed,
              `🕶️ فلتة Matrix! ${targetName} نبطح على الزربية والصندالة دازت فوق راسو! (+35 ن)`,
              "DODGE"
            );
          } else {
            // DIRECT SANDALA SMACK!
            bestKid.hearts = Math.max(0, bestKid.hearts - 1);
            bestKid.lastHitAt = now;
            // Knockback along throw vector
            bestKid.x = clampArena(bestKid.x + dirX * 3.6);
            bestKid.z = clampArena(bestKid.z + dirZ * 3.6);
            actorEnt.hitsCount += 1;

            if (bestKid.hearts <= 0) {
              bestKid.isKO = true;
              state.scores[actorPlayerId] = (state.scores[actorPlayerId] || 0) + 140;
              state.feed = pushFeed(
                state.feed,
                `🩴💀 K.O! ${targetName} شبع صندالة من عند ${actorName} وربّع يديه فـ القنت! (+140 ن)`,
                "KO"
              );
            } else {
              state.scores[actorPlayerId] = (state.scores[actorPlayerId] || 0) + 85;
              const roasts = [
                `🩴💥 طارت صندالة عابرة للقارات من يد ${actorName} ولصقات فـ الجبهة ديال ${targetName}! (+85 ن)`,
                `🩴🎯 سنايبر! ${actorName} صيفط صندالة بـ التوجيه الحراري لـ ${targetName}! (باقي ${bestKid.hearts} ❤️)`,
                `🩴🔥 طررراخ! ${targetName} كلَا صندالة ديال الحمام من عند ${actorName}!`,
              ];
              state.feed = pushFeed(
                state.feed,
                roasts[(bestKid.hearts + actorEnt.hitsCount) % roasts.length],
                "SMACK"
              );
            }
          }
        }

        const remainingKids = Object.values(state.entities).filter(
          (e) => e.role === "KID" && !e.isKO
        );
        if (remainingKids.length === 0) {
          const endState = concludeRound(state, ctx.players, "MAMA");
          return {
            success: true,
            newState: endState,
            newPhase: endState.phase,
          };
        }

        return { success: true, newState: state, newPhase: state.phase };
      }

      case "BROOM_SWEEP": {
        if (!actorEnt || actorEnt.role !== "MAMA" || state.phase !== "ROUND_PLAY") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        actorEnt.x = clampArena(action.x);
        actorEnt.z = clampArena(action.z);
        actorEnt.lastThrowAt = now;

        if (action.targets) {
          for (const t of action.targets) {
            const ent = state.entities[t.id];
            if (ent && ent.role === "KID" && !ent.isKO) {
              if (Math.hypot(t.x - ent.x, t.z - ent.z) <= 6.5) {
                ent.x = clampArena(t.x);
                ent.z = clampArena(t.z);
              }
            }
          }
        }

        // Broom Sweep hits any Kid within 2.5m (EVEN IF FLOPPED on the floor!)
        for (const ent of Object.values(state.entities)) {
          if (ent.role !== "KID" || ent.isKO) continue;
          const dx = ent.x - actorEnt.x;
          const dz = ent.z - actorEnt.z;
          const dist = Math.hypot(dx, dz);
          if (dist <= 2.55) {
            const targetName =
              ctx.players.find((p) => p.id === ent.playerId)?.nickname || "برهوش";
            ent.hearts = Math.max(0, ent.hearts - 1);
            ent.lastHitAt = now;
            ent.floppedUntil = 0;
            const nx = dist > 0.05 ? dx / dist : 1;
            const nz = dist > 0.05 ? dz / dist : 0;
            ent.x = clampArena(ent.x + nx * 3.2);
            ent.z = clampArena(ent.z + nz * 3.2);

            if (ent.hearts <= 0) {
              ent.isKO = true;
              state.scores[actorPlayerId] = (state.scores[actorPlayerId] || 0) + 140;
              state.feed = pushFeed(
                state.feed,
                `🧹💀 ${actorName} شطب الصالون بـ ${targetName}! (+140 ن)`,
                "KO"
              );
            } else {
              state.scores[actorPlayerId] = (state.scores[actorPlayerId] || 0) + 80;
              state.feed = pushFeed(
                state.feed,
                `🧹💥 ضربة بـ الشطابة من عند ${actorName} لـ ${targetName}! (باقي ${ent.hearts} ❤️)`,
                "SMACK"
              );
            }
          }
        }

        const remainingKids = Object.values(state.entities).filter(
          (e) => e.role === "KID" && !e.isKO
        );
        if (remainingKids.length === 0) {
          const endState = concludeRound(state, ctx.players, "MAMA");
          return {
            success: true,
            newState: endState,
            newPhase: endState.phase,
          };
        }

        return { success: true, newState: state, newPhase: state.phase };
      }

      case "TIME_UP": {
        if (state.phase !== "ROUND_PLAY") {
          return { success: true, newState: state, newPhase: state.phase };
        }
        if (action.forRound && action.forRound !== state.round) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        if (now < state.phaseEndsAt - 1500) {
          return { success: true, newState: state, newPhase: state.phase };
        }
        const survivingKids = Object.values(state.entities).filter(
          (e) => e.role === "KID" && !e.isKO
        );
        const endState = concludeRound(
          state,
          ctx.players,
          survivingKids.length > 0 ? "KIDS" : "MAMA"
        );
        return {
          success: true,
          newState: endState,
          newPhase: endState.phase,
        };
      }

      case "NEXT_ROUND": {
        if (state.round >= state.maxRounds) {
          state.phase = "GAME_OVER";
          let topId = ctx.players[0]?.id || "";
          let topScore = -1;
          for (const [pid, sc] of Object.entries(state.scores)) {
            if (sc > topScore) {
              topScore = sc;
              topId = pid;
            }
          }
          state.winnerId = topId;
          return {
            success: true,
            newState: state,
            newPhase: "GAME_OVER",
          };
        }
        const nextRound = state.round + 1;
        const nextState = buildRoundState(
          ctx.players,
          ctx.settings,
          nextRound,
          state.scores
        );
        return {
          success: true,
          newState: nextState,
          newPhase: nextState.phase,
          newRound: nextRound,
          timerDurationMs: (ctx.settings.roundDurationSec || 65) * 1000,
        };
      }

      case "RESTART_GAME": {
        const fresh = buildRoundState(ctx.players, ctx.settings, 1, {});
        return {
          success: true,
          newState: fresh,
          newPhase: fresh.phase,
          newRound: 1,
          timerDurationMs: (ctx.settings.roundDurationSec || 65) * 1000,
        };
      }

      default:
        return { success: true, newState: state, newPhase: state.phase };
    }
  },

  getPublicView(ctx: GameContext<SandalaState, SandalaSettings>): PublicGameView {
    return {
      gameId: "sandala",
      phase: ctx.state.phase,
      round: ctx.state.round,
      stateVersion: ctx.stateVersion,
      publicData: { ...ctx.state },
    };
  },

  getPlayerView(
    ctx: GameContext<SandalaState, SandalaSettings>,
    playerId: string
  ): PrivatePlayerGameView {
    const myEnt = ctx.state.entities[playerId] || null;
    return {
      playerId,
      isHost: ctx.players.find((p) => p.id === playerId)?.isHost || false,
      myRole: myEnt?.role || "KID",
      privateData: {
        myEntity: myEnt,
        myScore: ctx.state.scores[playerId] || 0,
      },
      allowedActions: [
        "SYNC_POS",
        "THROW_SANDALA",
        "BROOM_SWEEP",
        "MAMA_RAGE",
        "KID_FLOP",
        "DROP_SABON",
        "TRIGGER_SABON",
        "SNITCH_FRIEND",
        "CHAABI_DANCE",
        "TIME_UP",
        "NEXT_ROUND",
        "RESTART_GAME",
      ],
    };
  },

  checkFinished(ctx: GameContext<SandalaState, SandalaSettings>): GameEndResult | null {
    if (ctx.state.phase !== "GAME_OVER") return null;
    return {
      isFinished: true,
      winner: {
        players: ctx.state.winnerId ? [ctx.state.winnerId] : [],
        summary: "سالات بطولة صندالة الواليدة 3D!",
      },
    };
  },
};
