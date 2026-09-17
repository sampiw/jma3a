import { describe, it, expect } from "vitest";
import { RoomStore } from "@/lib/rooms/store";

describe("RoomStore Persistence & DIB Pass Mode", () => {
  it("persists room across separate store instances and transitions DIB into Night", async () => {
    const store1 = new RoomStore();
    const token1 = "host_device_tok_1";

    // 1. Create Room on store1
    const { room } = await store1.createRoom("HostPlayer", "dib", "ONE_PHONE", "darija", token1);
    expect(room.code).toBeDefined();

    await store1.addLocalPlayer(room.code, token1, "Player 2");
    await store1.addLocalPlayer(room.code, token1, "Player 3");
    await store1.addLocalPlayer(room.code, token1, "Player 4");

    // 2. Store2 (simulating a separate Vercel lambda instance)
    const store2 = new RoomStore();
    const retrievedRoom = await store2.getRoom(room.code);
    expect(retrievedRoom).toBeDefined();
    expect(retrievedRoom?.code).toBe(room.code);
    expect(retrievedRoom?.players.length).toBe(4);

    // 3. Start DIB game
    const startRes = await store1.startGame(room.code, token1);
    expect(startRes.success).toBe(true);

    let state = await store2.getAuthorizedState(room.code, token1);
    expect(state).toBeDefined();
    expect(state?.room.gameView?.publicData.phase).toBe("ROLE_REVEAL");
    expect(state?.passThePhone).toBeDefined();

    // 4. Host clicks "الكل شاف دوره؟ بدا الليل 🌙" (NEXT_PHASE)
    const actionRes = await store1.dispatchAction(room.code, token1, { type: "NEXT_PHASE" });
    expect(actionRes.success).toBe(true);

    // 5. Verify phase transitioned to NIGHT_SEER (Seer wakes up first in classic Loup-Garou)
    const seerState = await store2.getAuthorizedState(room.code, token1);
    expect(seerState?.room.gameView?.publicData.phase).toBe("NIGHT_SEER");
    expect(seerState?.passThePhone).toBeUndefined();

    // 6. Advance from Seer to Wolves
    const seerDoneRes = await store1.dispatchAction(room.code, token1, { type: "NEXT_PHASE" });
    expect(seerDoneRes.success).toBe(true);
    const wolfState = await store2.getAuthorizedState(room.code, token1);
    expect(wolfState?.room.gameView?.publicData.phase).toBe("NIGHT_WOLF");
  }, 25000);
});
