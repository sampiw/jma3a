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

    // 2. Host adds a second friend to Phone 1
    const addP2 = await store.addLocalPlayer(room.code, hostToken, "FriendPhone1");
    expect(addP2.success).toBe(true);

    // 3. Guest joins from Phone 2
    const joinRes = await store.joinRoom(room.code, "GuestPhone2", guestToken);
    expect(joinRes.success).toBe(true);

    // 4. Non-host (Guest) adds a friend to Phone 2!
    const addP4 = await store.addLocalPlayer(room.code, guestToken, "FriendPhone2");
    expect(addP4.success).toBe(true);

    // Verify 4 players total
    const roomBeforeSettings = await store.getRoom(room.code);
    expect(roomBeforeSettings?.players.length).toBe(4);

    // 5. Host configures custom roles (1 wolf, 1 seer, 0 witch, 0 hunter, 2 villagers)
    const settingsRes = await store.updateGameSettings(room.code, hostToken, {
      customRoles: { wolf: 1, seer: 1, witch: 0, hunter: 0 },
    });
    expect(settingsRes.success).toBe(true);

    // 6. Test Player Removal: Add temporary player and remove them
    const tempJoin = await store.joinRoom(room.code, "TempPlayer", "phone_3_token");
    expect(tempJoin.success).toBe(true);
    expect((await store.getRoom(room.code))?.players.length).toBe(5);

    const removeRes = await store.removePlayer(room.code, hostToken, tempJoin.player!.id);
    expect(removeRes.success).toBe(true);
    expect((await store.getRoom(room.code))?.players.length).toBe(4);

    // 7. Start Game
    const startRes = await store.startGame(room.code, hostToken);
    expect(startRes.success).toBe(true);

    // 8. Verify Device Privacy:
    // Phone 1 should receive devicePlayers containing ONLY Phone 1 players
    const phone1State = await store.getAuthorizedState(room.code, hostToken);
    expect(phone1State?.devicePlayers?.length).toBe(2);
    expect(phone1State?.devicePlayers?.map((p) => p.nickname)).toContain("HostPhone1");
    expect(phone1State?.devicePlayers?.map((p) => p.nickname)).toContain("FriendPhone1");
    expect(phone1State?.devicePlayers?.map((p) => p.nickname)).not.toContain("GuestPhone2");

    // Phone 2 should receive devicePlayers containing ONLY Phone 2 players
    const phone2State = await store.getAuthorizedState(room.code, guestToken);
    expect(phone2State?.devicePlayers?.length).toBe(2);
    expect(phone2State?.devicePlayers?.map((p) => p.nickname)).toContain("GuestPhone2");
    expect(phone2State?.devicePlayers?.map((p) => p.nickname)).toContain("FriendPhone2");
    expect(phone2State?.devicePlayers?.map((p) => p.nickname)).not.toContain("HostPhone1");

    // 9. Check Game Flow: ROLE_REVEAL -> NIGHT_SEER -> NIGHT_WOLF -> DAY_ANNOUNCEMENT
    expect(phone1State?.room.gameView?.publicData.phase).toBe("ROLE_REVEAL");

    // Advance to NIGHT_SEER
    await store.dispatchAction(room.code, hostToken, { type: "NEXT_PHASE" });
    const seerPhaseState = await store.getAuthorizedState(room.code, hostToken);
    expect(seerPhaseState?.room.gameView?.publicData.phase).toBe("NIGHT_SEER");

    // Advance to NIGHT_WOLF
    await store.dispatchAction(room.code, hostToken, { type: "NEXT_PHASE" });
    const wolfPhaseState = await store.getAuthorizedState(room.code, hostToken);
    expect(wolfPhaseState?.room.gameView?.publicData.phase).toBe("NIGHT_WOLF");

    // Wolf votes for a target
    const currentRoom = await store.getRoom(room.code);
    const session = await store.getSession(currentRoom!.activeSessionId!);
    const wolfPlayer = Object.values(session!.state.playerStates).find((p: any) => p.role === "wolf") as any;
    const nonWolf = Object.values(session!.state.playerStates).find((p: any) => p.role !== "wolf") as any;

    const wolfOwnerToken = currentRoom!.players.find((p) => p.id === wolfPlayer.playerId)!.deviceSessionId;

    const wolfVoteRes = await store.dispatchAction(
      room.code,
      wolfOwnerToken,
      { type: "WOLF_VOTE", targetPlayerId: nonWolf.playerId },
      wolfPlayer.playerId
    );
    expect(wolfVoteRes.success).toBe(true);

    // Wolf sends signal
    const wolfSignalRes = await store.dispatchAction(
      room.code,
      wolfOwnerToken,
      { type: "WOLF_SIGNAL", signal: "نقتلو هذا 💀" },
      wolfPlayer.playerId
    );
    expect(wolfSignalRes.success).toBe(true);

    // Advance to DAY_ANNOUNCEMENT
    await store.dispatchAction(room.code, hostToken, { type: "NEXT_PHASE" });
    const dayAnnounceState = await store.getAuthorizedState(room.code, hostToken);
    expect(dayAnnounceState?.room.gameView?.publicData.phase).toBe("DAY_ANNOUNCEMENT");
    expect(dayAnnounceState?.room.gameView?.publicData.nightSummary?.deaths.length).toBe(1);
    expect(dayAnnounceState?.room.gameView?.publicData.nightSummary?.deaths[0].playerId).toBe(nonWolf.playerId);
  }, 45000);
});
