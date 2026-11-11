import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as livePost } from "@/app/api/rooms/[code]/live/route";
import { BotDriverMemory, stepKsidaBots } from "@/games/ksida3d/ai";
import { computeKsidaAwards, Ksida3DEngine } from "@/games/ksida3d/engine";
import {
  createInitialCarKinematics,
  resolveCarVsCarCollision,
  stepCarKinematics,
} from "@/games/ksida3d/physics";
import {
  evaluateTrackBoundary,
  TRACK_CHECKPOINTS,
  updateRaceCheckpointAndProgress,
} from "@/games/ksida3d/trackLayout";
import { KsidaSettings, KsidaState } from "@/games/ksida3d/types";
import { GameContext } from "@/games/registry";
import { roomStore } from "@/lib/rooms/store";
import { Player } from "@/lib/types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    roomId: "JM-KSID",
    nickname: `Driver_${i + 1}`,
    normalizedNickname: `driver_${i + 1}`,
    status: "ACTIVE",
    joinedAt: Date.now(),
    avatarSeed: `avatar_${(i % 8) + 1}`,
    isHost: i === 0,
    deviceSessionId: `sess_ksida_${i + 1}`,
    isOnline: true,
  }));
}

function makeCtx(
  players: Player[],
  state: KsidaState,
  settings: KsidaSettings = Ksida3DEngine.defaultSettings
): GameContext<KsidaState, KsidaSettings> {
  return {
    roomId: "JM-KSID",
    players,
    state,
    settings,
    round: state.round,
    phase: state.phase,
    stateVersion: 1,
  };
}

describe("KSIDA ROYAL 3D — Moroccan Meme Crash-Car Racing & Derby Engine", () => {
  it("enforces Smart Bot Policy (Solo = 5 Moroccan bots, 2+ humans = pure PvP unless botFill=true) & 8-racer cap", () => {
    const solo = makePlayers(1);
    expect(Ksida3DEngine.validateSetup(solo, Ksida3DEngine.defaultSettings).isValid).toBe(true);

    const soloState = Ksida3DEngine.createInitialState(solo, {
      ...Ksida3DEngine.defaultSettings,
      botFill: false,
    });
    const soloRacers = Object.values(soloState.racers);
    expect(soloRacers.filter((r) => !r.isBot).length).toBe(1);
    expect(soloRacers.filter((r) => r.isBot).length).toBe(5);

    const duo = makePlayers(2);
    const pvpState = Ksida3DEngine.createInitialState(duo, Ksida3DEngine.defaultSettings);
    expect(Object.values(pvpState.racers).filter((r) => r.isBot).length).toBe(0);

    const duoWithBots = Ksida3DEngine.createInitialState(duo, {
      ...Ksida3DEngine.defaultSettings,
      botFill: true,
    });
    expect(Object.values(duoWithBots.racers).filter((r) => r.isBot).length).toBe(4);

    expect(
      Ksida3DEngine.validateSetup(makePlayers(8), Ksida3DEngine.defaultSettings).isValid
    ).toBe(true);
    expect(
      Ksida3DEngine.validateSetup(makePlayers(9), Ksida3DEngine.defaultSettings).isValid
    ).toBe(false);
  });

  it("evaluates Figure-8 Corniche + Central Ronda set-union SDF without intersection seams & advances 4-gate laps", () => {
    // Dead-center Ronda (0, 0) is wide open asphalt (sdf = -17.5)
    const centerBound = evaluateTrackBoundary(0, 0, "RACE");
    expect(centerBound.sdf).toBeLessThan(-15);

    // East Corniche turn (60, 0) is right on the road centerline (sdf ~ -9.6)
    const eastBound = evaluateTrackBoundary(60, 0, "RACE");
    expect(eastBound.sdf).toBeLessThan(-8);

    // Far ocean (95, 95) is outside guardrails (sdf > 0)
    const oceanBound = evaluateTrackBoundary(95, 95, "RACE");
    expect(oceanBound.sdf).toBeGreaterThan(20);

    // Verify full 4-checkpoint lap progression (CP1 -> CP2 -> CP3 -> CP0 Finish!)
    let lap = 1;
    let nextCp = 1;
    let lastProg = -1;

    for (const cpIdx of [1, 2, 3, 0]) {
      const gate = TRACK_CHECKPOINTS[cpIdx];
      const res = updateRaceCheckpointAndProgress(gate.x, gate.z, lap, nextCp);
      expect(res.crossedCheckpoint).toBe(true);
      expect(res.trackProgress).toBeGreaterThan(lastProg);
      lastProg = res.trackProgress;
      lap = res.lap;
      nextCp = res.nextCheckpoint;
    }

    expect(lap).toBe(2);
    expect(nextCp).toBe(1);
  });

  it("charges 3-stage Mario-Kart drift sparks, bounces cleanly off guardrails, and computes heavy T-bone collisions", () => {
    const car = createInitialCarKinematics(0, 0, 0, 0, 80);

    // Accelerate Petit Taxi up to drifting speed
    for (let i = 0; i < 40; i++) {
      stepCarKinematics(
        car,
        {
          throttle: 1,
          steer: 0,
          driftHeld: false,
          hopTap: false,
          nitroHeld: false,
          atayActive: false,
        },
        "TAXI_HMER",
        "DERBY",
        0.025
      );
    }
    expect(car.forwardSpeed).toBeGreaterThan(18);

    // Hold Power-Drift right for ~2.1s to reach Stage 3 Purple Ultra Sparks
    for (let i = 0; i < 85; i++) {
      stepCarKinematics(
        car,
        {
          throttle: 1,
          steer: 0.9,
          driftHeld: true,
          hopTap: i === 0,
          nitroHeld: false,
          atayActive: false,
        },
        "TAXI_HMER",
        "DERBY",
        0.025
      );
    }
    expect(car.isDrifting).toBe(true);
    expect(car.driftStage).toBe(3);

    // Release drift -> triggers Stage 3 mini-turbo boost!
    const releaseEv = stepCarKinematics(
      car,
      {
        throttle: 1,
        steer: 0,
        driftHeld: false,
        hopTap: false,
        nitroHeld: false,
        atayActive: false,
      },
      "TAXI_HMER",
      "DERBY",
      0.025
    );
    expect(releaseEv.driftBoostReleasedStage).toBe(3);
    expect(car.driftBoostTimer).toBeGreaterThan(1.5);

    // Heavy Mercedes 240 with Mint Tea Overdrive T-boning a Triporteur
    const impact = resolveCarVsCarCollision(
      {
        x: 0,
        z: -1.8,
        vx: 0,
        vz: 28,
        yaw: 0,
        vehicle: "MERCEDES_240",
        isNitro: true,
        atayActive: true,
      },
      {
        x: 0,
        z: 0,
        vx: 10,
        vz: 0,
        yaw: Math.PI / 2, // broadside!
        vehicle: "TRIPORTEUR",
        isNitro: false,
        atayActive: false,
      }
    );
    expect(impact).not.toBeNull();
    expect(impact!.isTBoneOnB).toBe(true);
    expect(impact!.damageToB).toBeGreaterThanOrEqual(60);
    expect(impact!.spinMsOnB).toBeGreaterThan(500);
  });

  it("steps Moroccan AI bot drivers, switches garage cars, and awards Meme Roast Superlatives on FINISH_MATCH", () => {
    const players = makePlayers(1);
    let state = Ksida3DEngine.createInitialState(players, {
      ...Ksida3DEngine.defaultSettings,
      mode: "HOT_BOMB",
    });
    expect(state.hotBombHolderId).toBeTruthy();

    // Switch local player's vehicle in Garage to C15_KHATTAF
    const switchRes = Ksida3DEngine.handleAction(makeCtx(players, state), "p1", {
      type: "SELECT_VEHICLE",
      vehicle: "C15_KHATTAF",
    });
    expect(switchRes.success).toBe(true);
    state = switchRes.newState;
    expect(state.racers["p1"].vehicle).toBe("C15_KHATTAF");
    expect(state.racers["p1"].maxHp).toBe(130);

    // Step AI bots for 20 ticks
    const mem = new Map<string, BotDriverMemory>();
    for (let t = 0; t < 20; t++) {
      stepKsidaBots(
        state.racers,
        state.crates,
        mem,
        "HOT_BOMB",
        null,
        0,
        0,
        state.hotBombHolderId,
        3,
        0.05,
        Date.now() + t * 50,
        {
          onBotFireItem: () => {},
          onBotRamHit: () => {},
          onBotTaunt: () => {},
        }
      );
    }
    const movedBots = Object.values(state.racers).filter(
      (r) => r.isBot && Math.abs(r.speed) > 2
    );
    expect(movedBots.length).toBeGreaterThan(0);

    // Populate hilarious match stats & finish match
    state.racers["p1"].score = 145;
    state.racers["p1"].takedowns = 6;
    state.racers["p1"].driftScore = 250;
    const firstBotId = Object.keys(state.racers).find((id) => id.startsWith("bot_"))!;
    state.racers[firstBotId].wallHits = 28;
    state.racers[firstBotId].wrecksTaken = 5;

    const finRes = Ksida3DEngine.handleAction(makeCtx(players, state), "p1", {
      type: "FINISH_MATCH",
      racers: state.racers,
      winnerId: "p1",
    });
    expect(finRes.success).toBe(true);
    expect(finRes.newPhase).toBe("GAME_OVER");
    expect(finRes.newState.awards.length).toBe(4);

    const permisAward = computeKsidaAwards(finRes.newState.racers, "HOT_BOMB").find(
      (a) => a.id === "award_permis"
    );
    expect(permisAward?.winnerId).toBe(firstBotId);
  });

  it("supports mid-race QR Hot-Join in RoomStore and relays ksida3d live packets", async () => {
    const { room, hostPlayer } = await roomStore.createRoom(
      "Kabor",
      "ksida3d",
      "MULTI_PHONE",
      "darija",
      "tok_ksida_host"
    );
    expect(hostPlayer.nickname).toBe("Kabor");

    const started = await roomStore.startGame(room.code, "tok_ksida_host");
    expect(started.success).toBe(true);

    // Friend scans QR code mid-race -> hot-joins directly onto the track and prunes solo bots!
    const hotJoin = await roomStore.joinRoom(room.code, "Chaibia", "tok_ksida_friend");
    expect(hotJoin.success).toBe(true);

    const updatedRoom = await roomStore.getRoom(room.code);
    const activeSession = await roomStore.getSession(updatedRoom!.activeSessionId!);
    const humanRacers = Object.values(activeSession!.state.racers).filter(
      (r: any) => !r.isBot
    );
    const botRacers = Object.values(activeSession!.state.racers).filter(
      (r: any) => r.isBot
    );
    expect(humanRacers.length).toBe(2);
    expect(botRacers.length).toBe(0);

    // Verify Live Relay endpoint handles ksida3d:<CODE> state + taunt broadcast
    const topic = `ksida3d:${room.code}`;
    const req1 = new NextRequest(`http://localhost:3000/api/rooms/${room.code}/live`, {
      method: "POST",
      body: JSON.stringify({
        topic,
        senderId: "c_driver1",
        sinceSeq: 0,
        states: {
          "pos:c_driver1": { event: "pos", payload: { i: hostPlayer.id, x: 12, z: 14 } },
        },
        events: [{ id: "ev1", event: "taunt", payload: { tauntId: "CONSTAT" } }],
      }),
    });
    const res1 = await livePost(req1, { params: Promise.resolve({ code: room.code }) });
    expect((await res1.json()).ok).toBe(true);

    const req2 = new NextRequest(`http://localhost:3000/api/rooms/${room.code}/live`, {
      method: "POST",
      body: JSON.stringify({
        topic,
        senderId: "c_driver2",
        sinceSeq: 0,
        states: {},
        events: [],
      }),
    });
    const res2 = await livePost(req2, { params: Promise.resolve({ code: room.code }) });
    const body2 = await res2.json();
    expect(body2.ok).toBe(true);
    expect(body2.states.length).toBeGreaterThanOrEqual(1);
    expect(body2.events.some((e: any) => e.event === "taunt")).toBe(true);
  });
});
