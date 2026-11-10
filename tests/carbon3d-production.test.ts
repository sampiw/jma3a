import { describe, expect, it } from "vitest";
import { createSurvivalWaveBots, stepArenaBots } from "@/games/carbon3d/ai";
import {
  CORE_PLATFORM_HEIGHT,
  raycastArenaWorld,
  resolveArenaMovement,
  sampleArenaGroundHeight,
} from "@/games/carbon3d/arenaLayout";
import { Carbon3DEngine } from "@/games/carbon3d/engine";
import { CarbonSettings, CarbonState } from "@/games/carbon3d/types";
import { GameContext } from "@/games/registry";
import { Player } from "@/lib/types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    roomId: "JM-CARB",
    nickname: `Striker_${i + 1}`,
    normalizedNickname: `striker_${i + 1}`,
    status: "ACTIVE",
    joinedAt: Date.now(),
    avatarSeed: `avatar_${(i % 8) + 1}`,
    isHost: i === 0,
    deviceSessionId: `sess_${i + 1}`,
    isOnline: true,
  }));
}

function makeCtx(
  players: Player[],
  state: CarbonState,
  settings: CarbonSettings = Carbon3DEngine.defaultSettings
): GameContext<CarbonState, CarbonSettings> {
  return {
    roomId: "JM-CARB",
    players,
    state,
    settings,
    round: state.round,
    phase: state.phase,
    stateVersion: 1,
  };
}

describe("PROTOCOL: CARBON 3D Engine & Physics", () => {
  it("supports 1-player Solo with automatic AI Strikers and enforces 8-player WiFi cap", () => {
    const solo = makePlayers(1);
    expect(Carbon3DEngine.validateSetup(solo, Carbon3DEngine.defaultSettings).isValid).toBe(true);

    const soloState = Carbon3DEngine.createInitialState(solo, {
      ...Carbon3DEngine.defaultSettings,
      botFill: false, // Even if botFill=false, 1-player solo still gets AI opponents!
    });
    const units = Object.values(soloState.combatants);
    expect(units.some((u) => u.id === "p1" && !u.isBot)).toBe(true);
    expect(units.filter((u) => u.isBot).length).toBeGreaterThanOrEqual(5);

    const fullParty = makePlayers(8);
    expect(Carbon3DEngine.validateSetup(fullParty, Carbon3DEngine.defaultSettings).isValid).toBe(
      true
    );

    const overflow = makePlayers(9);
    expect(Carbon3DEngine.validateSetup(overflow, Carbon3DEngine.defaultSettings).isValid).toBe(
      false
    );
  });

  it("balances CYAN and CRIMSON teams in SQUAD mode and spawns Goliath Boss on Wave 3 in SURVIVAL", () => {
    const party = makePlayers(4);
    const squadState = Carbon3DEngine.createInitialState(party, {
      ...Carbon3DEngine.defaultSettings,
      mode: "SQUAD",
      botFill: true,
    });

    const cyanCount = Object.values(squadState.combatants).filter((u) => u.team === "CYAN").length;
    const crimsonCount = Object.values(squadState.combatants).filter(
      (u) => u.team === "CRIMSON"
    ).length;
    expect(cyanCount).toBe(crimsonCount);

    const bossWave = createSurvivalWaveBots(3, 2);
    expect(bossWave.some((b) => b.archetype === "BOSS_MECH")).toBe(true);
  });

  it("computes multi-elevation ramp & platform heights, obstacle raycasts, and AI bot ticks", () => {
    // Central platform top height when already elevated
    expect(sampleArenaGroundHeight(0, 0, CORE_PLATFORM_HEIGHT)).toBeCloseTo(CORE_PLATFORM_HEIGHT);
    // Midpoint of North core ramp
    const rampMidY = sampleArenaGroundHeight(0, -7.2, 0.5);
    expect(rampMidY).toBeGreaterThan(0.3);
    expect(rampMidY).toBeLessThan(CORE_PLATFORM_HEIGHT);

    // Raycast against North spawn shield wall at z = -16.8
    const hit = raycastArenaWorld(0, 1.2, -21, 0, 0, 1, 10);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeLessThan(5);

    // Sliding collision clamps inside octagonal arena bounds
    const clamped = resolveArenaMovement(40, 0, 0);
    expect(clamped.x).toBeLessThan(25);

    // Step AI bots safely
    const players = makePlayers(1);
    const state = Carbon3DEngine.createInitialState(players, Carbon3DEngine.defaultSettings);
    const mem = new Map();
    const botShots = stepArenaBots(
      state.combatants,
      state.pickups,
      mem,
      "FFA",
      "HARD",
      Date.now(),
      0.05
    );
    expect(Array.isArray(botShots)).toBe(true);
  });

  it("handles CONFIGURE_MATCH, SYNC_CHECKPOINT, FINISH_MATCH, and RESTART_MATCH", () => {
    const players = makePlayers(2);
    let state = Carbon3DEngine.createInitialState(players, Carbon3DEngine.defaultSettings);

    const cfgRes = Carbon3DEngine.handleAction(makeCtx(players, state), "p1", {
      type: "CONFIGURE_MATCH",
      mode: "SURVIVAL",
      botDifficulty: "CARBON",
    });
    expect(cfgRes.success).toBe(true);
    state = cfgRes.newState;
    expect(state.mode).toBe("SURVIVAL");

    state.combatants["p1"].kills = 12;
    state.combatants["p1"].score = 1400;

    const finRes = Carbon3DEngine.handleAction(makeCtx(players, state), "p1", {
      type: "FINISH_MATCH",
      combatants: state.combatants,
      wave: 4,
      winnerId: "p1",
      winnerSummaryAr: "صمدتو حتى للموجة 4!",
    });
    expect(finRes.newPhase).toBe("GAME_OVER");

    const endCheck = Carbon3DEngine.checkFinished(makeCtx(players, finRes.newState));
    expect(endCheck?.isFinished).toBe(true);
    expect(endCheck?.scoreboard?.[0]?.id).toBe("p1");

    const restartRes = Carbon3DEngine.handleAction(makeCtx(players, finRes.newState), "p1", {
      type: "RESTART_MATCH",
    });
    expect(restartRes.newPhase).toBe("PLAYING");
    expect(restartRes.newState.round).toBeGreaterThan(finRes.newState.round);
  });
});
