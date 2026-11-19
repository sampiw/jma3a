import { describe, expect, it } from "vitest";
import { advance, BEACON_RADIUS, BREAK_TIME, CLIP, idleInput, RELOAD_TIME, RESPAWN_TIME, ROUND_TIME, ROUNDS } from "../games/paintball/arena";
import { applyInput, createRoom, getSnapshot, participant, startMatch, updateClock } from "../games/paintball/match";

const now = 100_000;
const forward = { ...idleInput, forward: 1, yaw: Math.PI / 2 };
const fire = { ...forward, forward: 0, fire: true };

function match() {
  const host = participant("a", "secret-a", "Sam", null, now);
  const room = createRoom("JMA234", host);
  const guest = participant("b", "secret-b", "Friend", room, now);
  room.players.push(guest);
  expect(startMatch(room, now)).toBe(true);
  return { room, host, guest };
}

describe("Splat 3D", () => {
  it("blocks movement and paint behind shared cover", () => {
    const { room, host, guest } = match();
    Object.assign(host, { x: -20, z: -1.4 });
    Object.assign(guest, { x: -10, z: -1.4 });
    const blocked = advance(host, forward, 1.2);
    expect(blocked.x).toBeLessThan(-17.97);
    applyInput(room, host, fire, now + 2000);
    expect(room.shots[0]).toMatchObject({ hit: null });
    expect(room.shots[0].x).toBeCloseTo(-17.55);
    expect(room.score.cyan).toBe(0);
  });

  it("tags an exposed rival, handles reload and respawn, and omits credentials", () => {
    const { room, host, guest } = match();
    Object.assign(host, { x: -2, z: 0 });
    Object.assign(guest, { x: 3, z: 0 });
    const when = now + 2500;
    applyInput(room, host, fire, when);
    expect(room.score.cyan).toBe(3);
    expect(host.ammo).toBe(CLIP - 1);
    expect(guest.respawnAt).toBe(when + RESPAWN_TIME);
    applyInput(room, host, { ...idleInput, reload: true }, when + 200);
    updateClock(room, when + 200 + RELOAD_TIME);
    expect(host.ammo).toBe(CLIP);
    updateClock(room, when + RESPAWN_TIME);
    expect(guest.respawnAt).toBe(0);
    expect(guest.x).toBeGreaterThan(20);
    expect(JSON.stringify(getSnapshot(room, guest, when))).not.toContain("secret-");
  });

  it("awards beacon points only when one team controls the zone", () => {
    const { room, host, guest } = match();
    Object.assign(host, { x: -.5, z: 0 });
    updateClock(room, now + 500);
    updateClock(room, now + 3500);
    expect(room.score.cyan).toBe(1);
    Object.assign(guest, { x: BEACON_RADIUS - .5, z: 0 });
    updateClock(room, now + 3600);
    updateClock(room, now + 7000);
    expect(room.point).toBe("contested");
    expect(room.score).toEqual({ cyan: 1, coral: 0 });
  });

  it("switches ends between all four rounds and then supports a clean rematch", () => {
    const { room, host, guest } = match();
    let clock = now;
    for (let round = 1; round <= ROUNDS; round++) {
      expect(room.round).toBe(round);
      expect(Math.sign(host.x)).toBe(round % 2 ? -1 : 1);
      clock += ROUND_TIME;
      host.lastSeen = guest.lastSeen = clock;
      updateClock(room, clock);
      if (round < ROUNDS) {
        expect(room.phase).toBe("break");
        clock += BREAK_TIME;
        updateClock(room, clock);
      }
    }
    expect(room.phase).toBe("finished");
    expect(room.rounds).toHaveLength(ROUNDS);
    expect(startMatch(room, clock)).toBe(true);
    expect(room.rounds).toHaveLength(0);
    expect(room.round).toBe(1);
  });
});
