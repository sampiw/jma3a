import { describe, it, expect } from "vitest";
import { RoomStore } from "@/lib/rooms/store";

describe("DIB v2 Features & Hybrid Multi-Device Logic", () => {
  it("allows non-host to add local players, isolates device secrets, supports custom roles and player removal", async () => {
    const store = new RoomStore();
    const hostToken = "phone_1_token";
    const guestToken = "phone_2_token";

    // 1. Host creates room on Phone 1
    const { room } = await store.createRoom("HostPhone1", "dib", "MULTI_PHONE", "darija", hostToken);
    expect(room.players.length).toBe(1);

    // 2. Host adds friends to Phone 1
    const addP2 = await store.addLocalPlayer(room.code, hostToken, "Friend1Phone1");
    expect(addP2.success).toBe(true);
    const addP3 = await store.addLocalPlayer(room.code, hostToken, "Friend2Phone1");
    expect(addP3.success).toBe(true);

    // 3. Guest joins from Phone 2
    const joinRes = await store.joinRoom(room.code, "GuestPhone2", guestToken);
    expect(joinRes.success).toBe(true);

    // 4. Non-host (Guest) adds friends to Phone 2!
    const addP5 = await store.addLocalPlayer(room.code, guestToken, "Friend1Phone2");
    expect(addP5.success).toBe(true);
    const addP6 = await store.addLocalPlayer(room.code, guestToken, "Friend2Phone2");
    expect(addP6.success).toBe(true);

    // Verify 6 players total
    const roomBeforeSettings = await store.getRoom(room.code);
    expect(roomBeforeSettings?.players.length).toBe(6);

    // 5. Host configures custom roles (2 wolves, 1 seer, 0 witch, 0 hunter)
    const settingsRes = await store.updateGameSettings(room.code, hostToken, {
      customRoles: { wolf: 2, seer: 1, witch: 0, hunter: 0 },
    });
    expect(settingsRes.success).toBe(true);

    // 6. Test Player Removal: Add temporary player and remove them
    const tempJoin = await store.joinRoom(room.code, "TempPlayer", "phone_3_token");
    expect(tempJoin.success).toBe(true);
    expect((await store.getRoom(room.code))?.players.length).toBe(7);

    const removeRes = await store.removePlayer(room.code, hostToken, tempJoin.player!.id);
    expect(removeRes.success).toBe(true);
    expect((await store.getRoom(room.code))?.players.length).toBe(6);

    // 7. Start Game
    const startRes = await store.startGame(room.code, hostToken);
    expect(startRes.success).toBe(true);

    // 8. Verify Device Privacy:
    // Phone 1 should receive devicePlayers containing ONLY Phone 1 players (3 players)
    const phone1State = await store.getAuthorizedState(room.code, hostToken);
    expect(phone1State?.devicePlayers?.length).toBe(3);
    expect(phone1State?.devicePlayers?.map((p) => p.nickname)).toContain("HostPhone1");
    expect(phone1State?.devicePlayers?.map((p) => p.nickname)).toContain("Friend1Phone1");
    expect(phone1State?.devicePlayers?.map((p) => p.nickname)).toContain("Friend2Phone1");
    expect(phone1State?.devicePlayers?.map((p) => p.nickname)).not.toContain("GuestPhone2");

    // Phone 2 should receive devicePlayers containing ONLY Phone 2 players (3 players)
    const phone2State = await store.getAuthorizedState(room.code, guestToken);
    expect(phone2State?.devicePlayers?.length).toBe(3);
    expect(phone2State?.devicePlayers?.map((p) => p.nickname)).toContain("GuestPhone2");
    expect(phone2State?.devicePlayers?.map((p) => p.nickname)).toContain("Friend1Phone2");
    expect(phone2State?.devicePlayers?.map((p) => p.nickname)).toContain("Friend2Phone2");
    expect(phone2State?.devicePlayers?.map((p) => p.nickname)).not.toContain("HostPhone1");

    // 9. Check Game Flow: ROLE_REVEAL -> NIGHT_INTRO -> NIGHT_SEER -> NIGHT_WOLVES -> NIGHT_WITCH -> DAY_ANNOUNCEMENT
    expect(phone1State?.room.gameView?.publicData.phase).toBe("ROLE_REVEAL");

    // Advance to NIGHT_INTRO
    await store.dispatchAction(room.code, hostToken, { type: "NEXT_PHASE" });
    const introState = await store.getAuthorizedState(room.code, hostToken);
    expect(introState?.room.gameView?.publicData.phase).toBe("NIGHT_INTRO");

    // Advance to NIGHT_SEER
    await store.dispatchAction(room.code, hostToken, { type: "NEXT_PHASE" });
    const seerPhaseState = await store.getAuthorizedState(room.code, hostToken);
    expect(seerPhaseState?.room.gameView?.publicData.phase).toBe("NIGHT_SEER");

    // Advance to NIGHT_WOLVES
    await store.dispatchAction(room.code, hostToken, { type: "NEXT_PHASE" });
    const wolfPhaseState = await store.getAuthorizedState(room.code, hostToken);
    expect(wolfPhaseState?.room.gameView?.publicData.phase).toBe("NIGHT_WOLVES");

    // Both wolves vote for the same target to ensure plurality consensus
    const currentRoom = await store.getRoom(room.code);
    const session = await store.getSession(currentRoom!.activeSessionId!);
    const wolves = Object.values(session!.state.playerStates).filter((p: any) => p.role === "wolf") as any[];
    const nonWolf = Object.values(session!.state.playerStates).find((p: any) => p.role !== "wolf") as any;

    for (const w of wolves) {
      const wolfToken = currentRoom!.players.find((p) => p.id === w.playerId)!.deviceSessionId;
      const wolfVoteRes = await store.dispatchAction(
        room.code,
        wolfToken,
        { type: "WOLF_VOTE", targetPlayerId: nonWolf.playerId },
        w.playerId
      );
      expect(wolfVoteRes.success).toBe(true);
    }

    // Advance to NIGHT_WITCH
    await store.dispatchAction(room.code, hostToken, { type: "NEXT_PHASE" });
    const witchPhaseState = await store.getAuthorizedState(room.code, hostToken);
    expect(witchPhaseState?.room.gameView?.publicData.phase).toBe("NIGHT_WITCH");

    // Advance to DAY_ANNOUNCEMENT
    await store.dispatchAction(room.code, hostToken, { type: "NEXT_PHASE" });
    const dayAnnounceState = await store.getAuthorizedState(room.code, hostToken);
    expect(dayAnnounceState?.room.gameView?.publicData.phase).toBe("DAY_ANNOUNCEMENT");
    expect(dayAnnounceState?.room.gameView?.publicData.lastResolution?.deaths.length).toBe(1);
    expect(dayAnnounceState?.room.gameView?.publicData.lastResolution?.deaths[0].playerId).toBe(nonWolf.playerId);
  }, 45000);
});
