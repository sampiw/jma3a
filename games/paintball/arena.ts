export type Team = "cyan" | "coral";
export type Spot = { x: number; z: number };
export type Cover = Spot & { w: number; d: number; h: number; kind: "wall" | "crate" | "inflatable" };

export const LIMIT_X = 31;
export const LIMIT_Z = 25;
export const BEACON_RADIUS = 5.2;
export const WALK_SPEED = 8.6;
export const EYE_HEIGHT = 1.58;
export const PLAYER_RADIUS = 0.45;
export const CLIP = 12;
export const SHOT_DELAY = 195;
export const RELOAD_TIME = 1150;
export const RESPAWN_TIME = 2900;
export const ROUNDS = 4;
export const ROUND_TIME = 5 * 60 * 1000;
export const BREAK_TIME = 7000;
export const TEAMS: Record<Team, { label: string; hex: number; css: string }> = {
  cyan: { label: "Cyan", hex: 0x4af6f1, css: "#4af6f1" },
  coral: { label: "Coral", hex: 0xff735f, css: "#ff735f" },
};

export const COVER: Cover[] = [
  { x: -22, z: -8, w: 1.2, d: 8, h: 3.1, kind: "wall" },
  { x: 22, z: 8, w: 1.2, d: 8, h: 3.1, kind: "wall" },
  { x: -22, z: 10, w: 1.2, d: 6, h: 3.1, kind: "wall" },
  { x: 22, z: -10, w: 1.2, d: 6, h: 3.1, kind: "wall" },
  { x: -13, z: -12, w: 10, d: 1.28, h: 3.15, kind: "wall" },
  { x: 13, z: 12, w: 10, d: 1.28, h: 3.15, kind: "wall" },
  { x: -10, z: 12, w: 8, d: 1.28, h: 2.82, kind: "wall" },
  { x: 10, z: -12, w: 8, d: 1.28, h: 2.82, kind: "wall" },
  { x: 0, z: -17.8, w: 6.4, d: 3.8, h: 2.75, kind: "crate" },
  { x: 0, z: 17.8, w: 6.4, d: 3.8, h: 2.75, kind: "crate" },
  { x: -15.6, z: -1.4, w: 3.9, d: 3.3, h: 2.55, kind: "crate" },
  { x: 15.6, z: 1.4, w: 3.9, d: 3.3, h: 2.55, kind: "crate" },
  { x: -6.8, z: -5.1, w: 3.1, d: 2.2, h: 2.5, kind: "inflatable" },
  { x: 6.8, z: 5.1, w: 3.1, d: 2.2, h: 2.5, kind: "inflatable" },
  { x: -7.4, z: 5.8, w: 2.1, d: 2.1, h: 1.15, kind: "crate" },
  { x: 7.4, z: -5.8, w: 2.1, d: 2.1, h: 1.15, kind: "crate" },
  { x: -20.7, z: 19, w: 3.6, d: 3.2, h: 2.0, kind: "inflatable" },
  { x: 20.7, z: -19, w: 3.6, d: 3.2, h: 2.0, kind: "inflatable" },
  { x: -25.7, z: -19, w: 3.6, d: 3.0, h: 2.15, kind: "crate" },
  { x: 25.7, z: 19, w: 3.6, d: 3.0, h: 2.15, kind: "crate" },
];

export interface ArenaInput {
  right: number;
  forward: number;
  yaw: number;
  pitch: number;
  fire: boolean;
  reload: boolean;
}

export const idleInput: ArenaInput = { right: 0, forward: 0, yaw: 0, pitch: 0, fire: false, reload: false };

export function spawn(team: Team, round: number, index: number) {
  const sign = (team === "cyan" ? -1 : 1) * (round % 2 === 0 ? -1 : 1);
  return { x: sign * 27.2, z: (index % 4 - 1.5) * 2.5, yaw: -sign * Math.PI / 2, pitch: 0 };
}

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function clear(x: number, z: number) {
  return Math.abs(x) < LIMIT_X - PLAYER_RADIUS && Math.abs(z) < LIMIT_Z - PLAYER_RADIUS &&
    !COVER.some(c => Math.abs(x - c.x) < c.w / 2 + PLAYER_RADIUS && Math.abs(z - c.z) < c.d / 2 + PLAYER_RADIUS);
}

export function advance(position: Spot, input: ArenaInput, seconds: number): Spot {
  const length = Math.max(1, Math.hypot(input.right, input.forward));
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  const dx = (sin * input.forward - cos * input.right) * WALK_SPEED * seconds / length;
  const dz = (cos * input.forward + sin * input.right) * WALK_SPEED * seconds / length;
  const segments = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.28));
  let { x, z } = position;
  for (let i = 0; i < segments; i++) {
    const nx = x + dx / segments;
    const nz = z + dz / segments;
    if (clear(nx, z)) x = nx;
    if (clear(x, nz)) z = nz;
  }
  return { x, z };
}

type Vector = Spot & { y: number };

export function aim(yaw: number, pitch: number): Vector {
  return { x: Math.sin(yaw) * Math.cos(pitch), z: Math.cos(yaw) * Math.cos(pitch), y: Math.sin(pitch) };
}

export function rayBox(origin: Vector, dir: Vector, center: Vector, half: Vector): number {
  let near = 0;
  let far = Infinity;
  for (const axis of ["x", "y", "z"] as const) {
    const offset = origin[axis] - center[axis];
    if (Math.abs(dir[axis]) < 1e-8) {
      if (Math.abs(offset) > half[axis]) return Infinity;
      continue;
    }
    const first = (-half[axis] - offset) / dir[axis];
    const second = (half[axis] - offset) / dir[axis];
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return Infinity;
  }
  return near;
}

export function trace(position: Spot, yaw: number, pitch: number) {
  const origin = { ...position, y: EYE_HEIGHT };
  const dir = aim(yaw, pitch);
  const wallX = Math.abs(dir.x) > 1e-8 ? (Math.sign(dir.x) * LIMIT_X - origin.x) / dir.x : Infinity;
  const wallZ = Math.abs(dir.z) > 1e-8 ? (Math.sign(dir.z) * LIMIT_Z - origin.z) / dir.z : Infinity;
  let distance = Math.min(48, wallX, wallZ, dir.y < 0 ? -origin.y / dir.y : Infinity);
  for (const c of COVER) {
    distance = Math.min(distance, rayBox(origin, dir, { x: c.x, z: c.z, y: c.h / 2 }, { x: c.w / 2, z: c.d / 2, y: c.h / 2 }));
  }
  return { origin, dir, distance };
}
