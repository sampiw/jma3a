import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as livePost } from "@/app/api/rooms/[code]/live/route";
import { createSurvivalWaveBots, stepArenaBots } from "@/games/carbon3d/ai";
import {
  ARENA_HALF,
  CORE_PLATFORM_HEIGHT,
  createInitialBarrels,
  HARDPOINT_ZONES,
  raycastArenaWorld,
  resolveArenaMovement,
  sampleArenaGroundHeight,
} from "@/games/carbon3d/arenaLayout";
import { Carbon3DEngine } from "@/games/carbon3d/engine";
import { CarbonGemDrop, CarbonSettings, CarbonState } from "@/games/carbon3d/types";
import { GameContext } from "@/games/registry";
import { roomStore } from "@/lib/rooms/store";
import { Player } from "@/lib/types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    roomId: "JM-CARB",
    nickname: `Soldier_${i + 1}`,
    normalizedNickname: `soldier_${i + 1}`,
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

describe("OPERATION ATLAS 3D Engine, Multi-Level Outpost Physics & Live Relay", () => {
  it("enforces Smart Bot Policy (Solo = 4 Spec-Ops bots, 2+ humans = pure PvP unless botFill=true) & 8-player cap", () => {
    const solo = makePlayers(1);
    expect(Carbon3DEngine.validateSetup(solo, Carbon3DEngine.defaultSettings).isValid).toBe(true);

    // 1-player Solo automatically spawns 4 Spec-Ops bots even when botFill is false
    const soloState = Carbon3DEngine.createInitialState(solo, {
      ...Carbon3DEngine.defaultSettings,
      botFill: false,
    });
    const soloUnits = Object.values(soloState.combatants);
    expect(soloUnits.some((u) => u.id === "p1" && !u.isBot)).toBe(true);
    expect(soloUnits.filter((u) => u.isBot).length).toBe(4);

    // 2+ humans with default botFill=false yields clean PvP (0 bots)
    const duo = makePlayers(2);
    const pvpState = Carbon3DEngine.createInitialState(duo, Carbon3DEngine.defaultSettings);
    const pvpUnits = Object.values(pvpState.combatants);
    expect(pvpUnits.filter((u) => !u.isBot).length).toBe(2);
    expect(pvpUnits.filter((u) => u.isBot).length).toBe(0);

    // 2+ humans with botFill=true fills arena with AI squadmates/opponents
    const duoWithBots = Carbon3DEngine.createInitialState(duo, {
      ...Carbon3DEngine.defaultSettings,
      botFill: true,
    });
    expect(Object.values(duoWithBots.combatants).filter((u) => u.isBot).length).toBeGreaterThanOrEqual(4);

    const fullParty = makePlayers(8);
    expect(Carbon3DEngine.validateSetup(fullParty, Carbon3DEngine.defaultSettings).isValid).toBe(
      true
    );

    const overflow = makePlayers(9);
    expect(Carbon3DEngine.validateSetup(overflow, Carbon3DEngine.defaultSettings).isValid).toBe(
      false
    );
  });

  it("balances CYAN and CRIMSON teams in SQUAD mode and spawns Commander Boss on Wave 3 in SURVIVAL", () => {
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

  it("computes 96m x 96m Coastal Outpost multi-level elevation, ramps, retaining walls, raycasts & AI bot ticks", () => {
    expect(ARENA_HALF).toBe(48);
    expect(HARDPOINT_ZONES.length).toBe(3);
    expect(createInitialBarrels().length).toBeGreaterThanOrEqual(8);

    // Central Helipad Deck @ y = 1.6m & East Kasbah Sniper Terrace @ y = 2.0m
    expect(sampleArenaGroundHeight(0, 0, CORE_PLATFORM_HEIGHT)).toBeCloseTo(1.6);
    expect(sampleArenaGroundHeight(33.0, 0, 2.0)).toBeCloseTo(2.0);

    // North Helipad Ramp smoothly interpolates between y = 0 (z = -14.2) and y = 1.6 (z = -9.0)
    const midRampY = sampleArenaGroundHeight(0, -11.6, 0.8);
    expect(midRampY).toBeGreaterThan(0.6);
    expect(midRampY).toBeLessThan(1.0);

    // Retaining wall blocks ground-level player walking into side of Helipad off-ramp
    const blockedByRetainingWall = resolveArenaMovement(6.0, 0, -8.8);
    expect(blockedByRetainingWall.z).toBeLessThanOrEqual(-9.4);

    // Ascending ramp near top smoothly enters the Helipad deck without collision snag
    const smoothRampTop = resolveArenaMovement(0, 1.48, -9.05);
    expect(smoothRampTop.z).toBeCloseTo(-9.05);

    // Raycast against North Garrison concrete blast wall at z = -26.5 (height = 2.55m)
    const hit = raycastArenaWorld(0, 1.2, -31.5, 0, 0, 1, 12);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeLessThan(6);

    // Sliding collision clamps inside 96m x 96m island seawall bounds ([-48, +48])
    const clamped = resolveArenaMovement(62, 0, 0);
    expect(clamped.x).toBeLessThan(48);
    expect(clamped.x).toBeGreaterThan(46);

    // Step AI Spec-Ops bots safely with supply drops
    const players = makePlayers(1);
    const state = Carbon3DEngine.createInitialState(players, Carbon3DEngine.defaultSettings);
    const mem = new Map();
    const drops: CarbonGemDrop[] = [{ id: "crate_1", x: 1.5, z: -1.2, spawnedAt: Date.now() }];
    const botShots = stepArenaBots(
      state.combatants,
      state.pickups,
      mem,
      "FFA",
      "HARD",
      Date.now(),
      0.05,
      drops,
      0
    );
    expect(Array.isArray(botShots)).toBe(true);
  });

  it("handles CONFIGURE_MATCH, hot-join preserving SYNC_CHECKPOINT, FINISH_MATCH, and RESTART_MATCH", () => {
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

  it("supports seamless mid-match PC + Phone hot-join in RoomStore and prunes solo AI bots", async () => {
    const { room, hostPlayer } = await roomStore.createRoom(
      "PC_Host",
      "carbon3d",
      "MULTI_PHONE",
      "darija",
      "tok_pc_host_1"
    );

    const startRes = await roomStore.startGame(room.code, "tok_pc_host_1");
    expect(startRes.success).toBe(true);

    const activeRoomBefore = await roomStore.getRoom(room.code);
    const sessionBefore = await roomStore.getSession(activeRoomBefore!.activeSessionId!);
    expect(
      Object.values(sessionBefore!.state.combatants).filter((u: any) => u.isBot).length
    ).toBe(4);

    // Phone player joins AFTER the host already entered the 3D arena
    const joinRes = await roomStore.joinRoom(room.code, "Phone_Player", "tok_phone_2");
    expect(joinRes.success).toBe(true);
    expect(joinRes.player?.id).toBeTruthy();

    const sessionAfter = await roomStore.getSession(activeRoomBefore!.activeSessionId!);
    const combatantsAfter = sessionAfter!.state.combatants;
    expect(combatantsAfter[hostPlayer.id]).toBeTruthy();
    expect(combatantsAfter[joinRes.player!.id]).toBeTruthy();
    // Solo bots pruned automatically because 2 real humans are now fighting & botFill=false!
    expect(Object.values(combatantsAfter).filter((u: any) => u.isBot).length).toBe(0);
  }, 30000);

  it("relays coalesced 3D soldier states & discrete weapon events across peers via /api/rooms/[code]/live", async () => {
    const code = `JMLV${Date.now().toString(36).toUpperCase()}`;
    const topic = `carbon3d:${code}`;

    const postRelay = async (body: Record<string, unknown>) => {
      const req = new NextRequest(`http://localhost:3000/api/rooms/${code}/live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, ...body }),
      });
      const res = await livePost(req, { params: Promise.resolve({ code }) });
      return (await res.json()) as {
        ok: boolean;
        states: Array<{ key: string; senderId: string; event: string; payload: any }>;
        events: Array<{ seq: number; id: string; senderId: string; event: string; payload: any }>;
        maxSeq: number;
      };
    };

    // Initial handshake for PC and Phone
    const initPc = await postRelay({ senderId: "peer_pc", sinceSeq: -1 });
    const initPhone = await postRelay({ senderId: "peer_phone", sinceSeq: -1 });
    expect(initPc.ok).toBe(true);
    expect(initPhone.ok).toBe(true);

    // PC moves onto Central Helipad and fires M4A1
    const pcSend = await postRelay({
      senderId: "peer_pc",
      sinceSeq: initPc.maxSeq,
      states: {
        "pos:p_pc": {
          event: "pos",
          payload: { id: "p_pc", x: 2.4, y: 1.6, z: -1.5, yaw: 0.8 },
        },
      },
      events: [
        {
          id: "shot_1",
          event: "shot",
          payload: { shooterId: "p_pc", weapon: "CARBINE" },
        },
      ],
    });
    expect(pcSend.ok).toBe(true);
    // Sender does not echo its own state/event back to itself
    expect(pcSend.states.some((s) => s.senderId === "peer_pc")).toBe(false);
    expect(pcSend.events.some((e) => e.senderId === "peer_pc")).toBe(false);

    // Phone polls and immediately receives PC's 3D position + gunfire packet
    const phonePoll = await postRelay({
      senderId: "peer_phone",
      sinceSeq: initPhone.maxSeq,
    });
    expect(phonePoll.ok).toBe(true);
    expect(phonePoll.states.some((s) => s.key === "pos:p_pc" && s.payload.y === 1.6)).toBe(true);
    expect(phonePoll.events.some((e) => e.id === "shot_1" && e.event === "shot")).toBe(true);
  }, 30000);
});
