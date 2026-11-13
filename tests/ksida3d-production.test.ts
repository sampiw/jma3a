import fs from "node:fs";
import path from "node:path";
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
  createInitialBarrels,
  DERBY_ARENA_RADIUS,
  evaluateTrackBoundary,
  findNearestTrackSample,
  RONDA_CENTER,
  TRACK_CHECKPOINTS,
  TRACK_POLYLINE,
  TRACK_TOTAL_LENGTH_M,
  TURBO_PADS,
  updateRaceCheckpointAndProgress,
} from "@/games/ksida3d/trackLayout";
import {
  KSIDA_VEHICLE_ORDER,
  KSIDA_VEHICLES,
  KsidaSettings,
  KsidaState,
} from "@/games/ksida3d/types";
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

describe("KSIDA ROYAL 3D v2 — Production Grand Circuit, GLB Assets, Controls & Meme Derby", () => {
  it("verifies all 6 Moroccan 3D vehicles & landmark .glb binary assets exist with valid glTF magic headers", () => {
    expect(KSIDA_VEHICLE_ORDER.length).toBe(6);
    expect(KSIDA_VEHICLE_ORDER).toContain("JADARMIYA");

    for (const vid of KSIDA_VEHICLE_ORDER) {
      const spec = KSIDA_VEHICLES[vid];
      const diskPath = path.join(process.cwd(), "public", spec.glbPath);
      expect(fs.existsSync(diskPath)).toBe(true);
      const magic = fs.readFileSync(diskPath).subarray(0, 4).toString("ascii");
      expect(magic).toBe("glTF");
    }

    const requiredWorldGlbs = [
      "models/cars/cone.glb",
      "models/cars/debris-tire.glb",
      "models/ksida/palm-bend.glb",
      "models/ksida/kasbah-tower.glb",
      "models/ksida/rocks-a.glb",
      "models/ksida/city/building-a.glb",
      "models/ksida/fantasy/fountain.glb",
      "models/ksida/fantasy/stall-red.glb",
    ];
    for (const rel of requiredWorldGlbs) {
      const full = path.join(process.cwd(), "public", rel);
      expect(fs.existsSync(full)).toBe(true);
      expect(fs.readFileSync(full).subarray(0, 4).toString("ascii")).toBe("glTF");
    }
  });

  it("enforces Smart Bot Policy (Solo = 5 Moroccan bots, 2+ humans = pure PvP unless botFill=true), countdown & 8-racer cap", () => {
    const solo = makePlayers(1);
    expect(Ksida3DEngine.validateSetup(solo, Ksida3DEngine.defaultSettings).isValid).toBe(true);

    const soloState = Ksida3DEngine.createInitialState(solo, {
      ...Ksida3DEngine.defaultSettings,
      botFill: false,
    });
    const soloRacers = Object.values(soloState.racers);
    expect(soloRacers.filter((r) => !r.isBot).length).toBe(1);
    expect(soloRacers.filter((r) => r.isBot).length).toBe(5);
    expect(soloState.countdownEndsAt).toBeGreaterThan(soloState.startedAt);
    expect(soloState.settings.targetDerbyScore).toBe(250);
    expect(soloState.settings.matchDurationSec).toBe(300);

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

  it("evaluates 1.35km 4-Biome Grand Circuit SDF (4.04km 3-lap distance), Ronda Stone Fountain island, 124m Derby Stadium & 8-gate lap progression", () => {
    expect(TRACK_POLYLINE.length).toBe(240);
    expect(TRACK_TOTAL_LENGTH_M).toBeGreaterThan(1300);
    expect(DERBY_ARENA_RADIUS).toBeGreaterThanOrEqual(60);
    expect(createInitialBarrels("RACE").length).toBeGreaterThanOrEqual(8);

    // Dead-center of Ronda (RONDA_CENTER) is occupied by the 5.2m Stone Fountain monument (sdf > 4)
    const fountainCenter = evaluateTrackBoundary(RONDA_CENTER.x, RONDA_CENTER.z, "RACE");
    expect(fountainCenter.sdf).toBeGreaterThan(4);

    // Wide roundabout asphalt ring around the fountain (offset +15m) is drivable asphalt (sdf < -8)
    const rondaRing = evaluateTrackBoundary(RONDA_CENTER.x + 15, RONDA_CENTER.z, "RACE");
    expect(rondaRing.sdf).toBeLessThan(-8);

    // Track centerline sample on Corniche is wide highway asphalt (sdf <= -11)
    const cornichePt = TRACK_POLYLINE[20];
    const cornicheBound = evaluateTrackBoundary(cornichePt.x, cornichePt.z, "RACE");
    expect(cornicheBound.sdf).toBeLessThan(-10);

    // Far Atlantic ocean (260, -210) is outside guardrails (sdf > 25)
    const oceanBound = evaluateTrackBoundary(260, -210, "RACE");
    expect(oceanBound.sdf).toBeGreaterThan(25);

    // Verify full 8-checkpoint monotonic lap progression (CP1 -> CP2 -> ... -> CP7 -> CP0 Finish!)
    expect(TRACK_CHECKPOINTS.length).toBe(8);
    let lap = 1;
    let nextCp = 1;
    let lastProg = -1;

    for (const cpIdx of [1, 2, 3, 4, 5, 6, 7, 0]) {
      const gate = TRACK_CHECKPOINTS[cpIdx];
      const res = updateRaceCheckpointAndProgress(gate.x, gate.z, lap, nextCp);
      expect(res.crossedCheckpoint).toBe(true);
      if (cpIdx !== 0) {
        expect(res.trackProgress).toBeGreaterThan(lastProg);
      }
      lastProg = res.trackProgress;
      lap = res.lap;
      nextCp = res.nextCheckpoint;
    }

    expect(lap).toBe(2);
    expect(nextCp).toBe(1);
  });

  it("handles countdown lock, progressive steering, 3-stage drift, turbo boost pads, wrong-way detection & T-bone impacts", () => {
    const car = createInitialCarKinematics(0, 0, 0, 0, 80);

    // 1. Countdown grid lock keeps car stationary even if holding throttle
    stepCarKinematics(
      car,
      {
        throttle: 1,
        steer: 0,
        driftHeld: false,
        hopTap: false,
        nitroHeld: false,
        atayActive: false,
        countdownLocked: true,
      },
      "TAXI_HMER",
      "DERBY",
      0.05
    );
    expect(car.forwardSpeed).toBe(0);

    // 2. Accelerate Petit Taxi up to drifting speed
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
    expect(car.forwardSpeed).toBeGreaterThan(20);

    // 3. Hold Power-Drift right for ~2.1s to reach Stage 3 Purple Ultra Sparks
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

    // 4. Driving over a Turbo Chevron Boost Pad triggers instant boost!
    const racePad = TURBO_PADS.find((p) => p.modes.includes("RACE"))!;
    const padCar = createInitialCarKinematics(racePad.x, 0, racePad.z, racePad.yaw, 50);
    padCar.forwardSpeed = 18;
    const padEv = stepCarKinematics(
      padCar,
      {
        throttle: 1,
        steer: 0,
        driftHeld: false,
        hopTap: false,
        nitroHeld: false,
        atayActive: false,
      },
      "JADARMIYA",
      "RACE",
      0.025
    );
    expect(padEv.hitTurboPad).toBe(true);
    expect(padCar.turboPadTimer).toBeGreaterThan(1.0);

    // 5. Wrong-way detection increments wrongWayTimer when driving opposite to track tangent
    const samplePt = findNearestTrackSample(TRACK_POLYLINE[5].x, TRACK_POLYLINE[5].z).sample;
    const wrongCar = createInitialCarKinematics(
      samplePt.x,
      0,
      samplePt.z,
      samplePt.yaw + Math.PI,
      50
    );
    wrongCar.forwardSpeed = 15;
    wrongCar.vx = Math.sin(wrongCar.yaw) * 15;
    wrongCar.vz = Math.cos(wrongCar.yaw) * 15;
    for (let i = 0; i < 30; i++) {
      stepCarKinematics(
        wrongCar,
        {
          throttle: 1,
          steer: 0,
          driftHeld: false,
          hopTap: false,
          nitroHeld: false,
          atayActive: false,
        },
        "TAXI_HMER",
        "RACE",
        0.05
      );
    }
    expect(wrongCar.wrongWayTimer).toBeGreaterThan(1.2);

    // 6. Heavy Mercedes 240 with Mint Tea Overdrive T-boning a Triporteur
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
        yaw: Math.PI / 2,
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

  it("steps Moroccan AI bot drivers (respecting countdown), switches to JADARMIYA in garage, and awards Meme Roast Superlatives", () => {
    const players = makePlayers(1);
    let state = Ksida3DEngine.createInitialState(players, {
      ...Ksida3DEngine.defaultSettings,
      mode: "HOT_BOMB",
    });
    expect(state.hotBombHolderId).toBeTruthy();

    // Switch local player's vehicle in Garage to JADARMIYA (Radar Patrol Van)
    const switchRes = Ksida3DEngine.handleAction(makeCtx(players, state), "p1", {
      type: "SELECT_VEHICLE",
      vehicle: "JADARMIYA",
    });
    expect(switchRes.success).toBe(true);
    state = switchRes.newState;
    expect(state.racers["p1"].vehicle).toBe("JADARMIYA");
    expect(state.racers["p1"].maxHp).toBe(KSIDA_VEHICLES.JADARMIYA.maxHp);

    // During countdown, bots remain locked on grid
    const mem = new Map<string, BotDriverMemory>();
    const startNow = Date.now();
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
      startNow,
      {
        onBotFireItem: () => {},
        onBotRamHit: () => {},
        onBotTaunt: () => {},
      },
      startNow + 3000
    );
    expect(Object.values(state.racers).every((r) => !r.isBot || r.speed === 0)).toBe(true);

    // After countdown expires, bots accelerate and battle
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
        startNow + 5000 + t * 50,
        {
          onBotFireItem: () => {},
          onBotRamHit: () => {},
          onBotTaunt: () => {},
        },
        startNow + 3000
      );
    }
    const movedBots = Object.values(state.racers).filter(
      (r) => r.isBot && Math.abs(r.speed) > 2
    );
    expect(movedBots.length).toBeGreaterThan(0);

    // Populate hilarious match stats & finish match
    state.racers["p1"].score = 265;
    state.racers["p1"].takedowns = 7;
    state.racers["p1"].driftScore = 320;
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
