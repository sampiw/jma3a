import { describe, it, expect } from "vitest";
import { Dib3DEngine } from "@/games/dib3d/engine";
import { Player } from "@/lib/types";
import { GameContext } from "@/games/registry";
import { Dib3DState, Dib3DSettings } from "@/games/dib3d/types";

const mockPlayers: Player[] = [
  {
    id: "p1",
    roomId: "TEST_DIB3D",
    nickname: "عصام",
    normalizedNickname: "عصام",
    status: "ACTIVE",
    joinedAt: 1000,
    avatarSeed: "1",
    isHost: true,
    deviceSessionId: "d1",
    isOnline: true,
  },
  {
    id: "p2",
    roomId: "TEST_DIB3D",
    nickname: "إلياس",
    normalizedNickname: "إلياس",
    status: "ACTIVE",
    joinedAt: 1001,
    avatarSeed: "2",
    isHost: false,
    deviceSessionId: "d2",
    isOnline: true,
  },
  {
    id: "p3",
    roomId: "TEST_DIB3D",
    nickname: "مهدي",
    normalizedNickname: "مهدي",
    status: "ACTIVE",
    joinedAt: 1002,
    avatarSeed: "3",
    isHost: false,
    deviceSessionId: "d3",
    isOnline: true,
  },
  {
    id: "p4",
    roomId: "TEST_DIB3D",
    nickname: "ياسين",
    normalizedNickname: "ياسين",
    status: "ACTIVE",
    joinedAt: 1003,
    avatarSeed: "4",
    isHost: false,
    deviceSessionId: "d4",
    isOnline: true,
  },
];

function makeCtx(
  state: Dib3DState,
  settings = Dib3DEngine.defaultSettings
): GameContext<Dib3DState, Dib3DSettings> {
  return {
    roomId: "JM-DIB3D",
    players: mockPlayers,
    settings,
    state,
    round: state.round,
    phase: state.phase,
    stateVersion: 1,
  };
}

describe("DIB 3D (الذيب 3D: الدرب المظلم) Engine", () => {
  it("initializes WOLF, SHERIFF, SEER, VILLAGER roles and sanitizes public view", () => {
    const state = Dib3DEngine.createInitialState(mockPlayers, Dib3DEngine.defaultSettings);
    expect(state.phase).toBe("ROAM_3D");

    const roles = Object.values(state.entities).map((e) => e.role);
    expect(roles.filter((r) => r === "WOLF").length).toBe(1);
    expect(roles.filter((r) => r === "SHERIFF").length).toBe(1);
    expect(roles.filter((r) => r === "SEER").length).toBe(1);
    expect(roles.filter((r) => r === "VILLAGER").length).toBe(1);

    // Public view must hide secret roles during ROAM_3D
    const pub = Dib3DEngine.getPublicView(makeCtx(state));
    const pubRoles = Object.values((pub.publicData as any).entities).map(
      (e: any) => e.role
    );
    expect(pubRoles.every((r) => r === "VILLAGER")).toBe(true);
  });

  it("handles Wolf Venting, Lights Sabotage, Wolf Kill, Dead Body Report, and Voting Ejection", () => {
    let state = Dib3DEngine.createInitialState(mockPlayers, Dib3DEngine.defaultSettings);

    const wolfEnt = Object.values(state.entities).find((e) => e.role === "WOLF")!;
    const innocentEnts = Object.values(state.entities).filter(
      (e) => e.role !== "WOLF"
    );
    const victim1 = innocentEnts[0];
    const reporter = innocentEnts[1];

    // 1. Wolf sabotages lights
    state = Dib3DEngine.handleAction(makeCtx(state), wolfEnt.playerId, {
      type: "SABOTAGE_LIGHTS",
    }).newState;
    expect(state.lightsOutUntil).toBeGreaterThan(Date.now());

    // 2. Reporter fixes lights at the Electric Box
    state = Dib3DEngine.handleAction(makeCtx(state), reporter.playerId, {
      type: "FIX_LIGHTS",
    }).newState;
    expect(state.lightsOutUntil).toBe(0);

    // 3. Wolf vents to another corner
    state = Dib3DEngine.handleAction(makeCtx(state), wolfEnt.playerId, {
      type: "WOLF_VENT",
    }).newState;

    // 4. Wolf kills victim1
    state.entities[wolfEnt.playerId].lastKillAt = 0;
    state = Dib3DEngine.handleAction(makeCtx(state), wolfEnt.playerId, {
      type: "WOLF_KILL",
      targetId: victim1.playerId,
      x: victim1.x,
      z: victim1.z,
      targetX: victim1.x,
      targetZ: victim1.z,
    }).newState;

    expect(state.entities[victim1.playerId].isAlive).toBe(false);
    expect(state.deadBodies.length).toBe(1);

    // 5. Reporter reports the dead body -> transitions to MEETING
    const bodyId = state.deadBodies[0].id;
    state = Dib3DEngine.handleAction(makeCtx(state), reporter.playerId, {
      type: "REPORT_BODY",
      bodyId,
    }).newState;
    expect(state.phase).toBe("MEETING");

    // 6. Alive players vote to eject the Wolf -> Villagers win!
    for (const ent of Object.values(state.entities)) {
      if (!ent.isAlive) continue;
      state = Dib3DEngine.handleAction(makeCtx(state), ent.playerId, {
        type: "CAST_VOTE",
        targetId: wolfEnt.playerId,
      }).newState;
    }

    expect(state.phase).toBe("GAME_OVER");
    expect(state.winnerTeam).toBe("VILLAGERS");
  });

  it("handles Sheriff shooting an innocent (target dies & Sheriff gun breaks forever)", () => {
    let state = Dib3DEngine.createInitialState(mockPlayers, Dib3DEngine.defaultSettings);

    const sheriff = Object.values(state.entities).find((e) => e.role === "SHERIFF")!;
    const villager = Object.values(state.entities).find((e) => e.role === "VILLAGER")!;

    // Sheriff mistakenly shoots an innocent Villager -> Villager dies, Sheriff stays alive & gun breaks!
    state = Dib3DEngine.handleAction(makeCtx(state), sheriff.playerId, {
      type: "SHERIFF_SHOOT",
      targetId: villager.playerId,
      x: sheriff.x,
      z: sheriff.z,
    }).newState;

    expect(state.entities[villager.playerId].isAlive).toBe(false);
    expect(state.entities[sheriff.playerId].isAlive).toBe(true);
    expect(state.entities[sheriff.playerId].sheriffGunBroken).toBe(true);
    expect(state.entities[sheriff.playerId].sheriffBullets).toBe(0);
    expect(state.deadBodies.length).toBe(1);
    expect(state.deadBodies[0].victimId).toBe(villager.playerId);
  });

  it("awards Task Victory to Villagers when 100% of Moroccan Derb tasks are completed", () => {
    let state = Dib3DEngine.createInitialState(mockPlayers, Dib3DEngine.defaultSettings);

    for (const ent of Object.values(state.entities)) {
      if (ent.role === "WOLF") continue;
      for (const taskId of ent.assignedTasks) {
        state = Dib3DEngine.handleAction(makeCtx(state), ent.playerId, {
          type: "COMPLETE_TASK",
          stationId: taskId,
        }).newState;
      }
    }

    expect(state.phase).toBe("GAME_OVER");
    expect(state.winnerTeam).toBe("VILLAGERS");
  });
});
