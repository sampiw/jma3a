import {
  advance, aim, BEACON_RADIUS, BREAK_TIME, CLIP, EYE_HEIGHT, rayBox, RELOAD_TIME,
  RESPAWN_TIME, ROUND_TIME, ROUNDS, SHOT_DELAY, spawn, trace,
  type ArenaInput, type Spot, type Team,
} from "./arena";

export type Phase = "lobby" | "playing" | "break" | "finished";
export type Score = Record<Team, number>;
export type Fighter = Spot & {
  id: string; name: string; team: Team; yaw: number; pitch: number; tags: number; outs: number;
  respawnAt: number; shieldUntil: number; online: boolean;
};
export interface Participant extends Omit<Fighter, "online"> {
  credential: string; left: boolean; lastSeen: number; lastInput: number; lastShot: number;
  reloadUntil: number; ammo: number;
}
export interface PaintShot {
  id: number; shooter: string; team: Team; x: number; y: number; z: number;
  fromX: number; fromZ: number; at: number; hit: string | null;
}
export interface Room {
  code: string; host: string; version: number; phase: Phase; round: number; endsAt: number;
  score: Score; total: Score; rounds: Score[]; point: Team | "contested" | null;
  lastPointAt: number; players: Participant[]; shots: PaintShot[]; shotNumber: number;
}
export interface Snapshot {
  code: string; host: string; version: number; phase: Phase; round: number; endsAt: number;
  score: Score; total: Score; rounds: Score[]; point: Room["point"]; players: Fighter[];
  shots: PaintShot[]; now: number;
  self: { id: string; ammo: number; reloadUntil: number; lastShot: number };
}

const score = (): Score => ({ cyan: 0, coral: 0 });
const otherTeam = (team: Team): Team => team === "cyan" ? "coral" : "cyan";
const online = (p: Participant, now: number) => !p.left && now - p.lastSeen < 28_000;
const alive = (p: Participant, now: number) => online(p, now) && p.respawnAt === 0;

export function createRoom(code: string, host: Participant): Room {
  return { code, host: host.id, version: 0, phase: "lobby", round: 0, endsAt: 0,
    score: score(), total: score(), rounds: [], point: null, lastPointAt: 0,
    players: [host], shots: [], shotNumber: 0 };
}

export function participant(id: string, credential: string, name: string, room: Room | null, now: number): Participant {
  const active = room?.players.filter(p => !p.left) ?? [];
  const cyan = active.filter(p => p.team === "cyan").length;
  const coral = active.length - cyan;
  const team: Team = cyan <= coral ? "cyan" : "coral";
  return { id, name, credential, team, ...spawn(team, 1, team === "cyan" ? cyan : coral),
    tags: 0, outs: 0, respawnAt: 0, shieldUntil: 0, left: false, lastSeen: now,
    lastInput: now, lastShot: 0, reloadUntil: 0, ammo: CLIP };
}

function place(room: Room, p: Participant, now: number) {
  const index = room.players.filter(f => f.team === p.team && !f.left).indexOf(p);
  Object.assign(p, spawn(p.team, room.round, Math.max(0, index)), {
    ammo: CLIP, reloadUntil: 0, respawnAt: 0, shieldUntil: now + 1600, lastInput: now,
  });
}

function beginRound(room: Room, now: number) {
  room.round++;
  room.phase = "playing";
  room.endsAt = now + ROUND_TIME;
  room.score = score();
  room.point = null;
  room.lastPointAt = now;
  room.shots = [];
  for (const p of room.players) if (!p.left) place(room, p, now);
}

export function startMatch(room: Room, now: number): boolean {
  if (room.phase !== "lobby" && room.phase !== "finished") return false;
  const players = room.players.filter(p => online(p, now));
  if (players.length < 2) return false;
  room.players = players;
  room.round = 0;
  room.rounds = [];
  room.total = score();
  for (const [index, p] of players.entries()) {
    p.team = index % 2 ? "coral" : "cyan";
    p.tags = p.outs = 0;
  }
  beginRound(room, now);
  return true;
}

function addScore(room: Room, team: Team, value: number) {
  room.score[team] += value;
  room.total[team] += value;
}

export function updateClock(room: Room, now: number) {
  if (!room.players.some(p => p.id === room.host && online(p, now))) {
    const replacement = room.players.find(p => online(p, now));
    if (replacement) room.host = replacement.id;
  }
  if (room.phase === "break" && now >= room.endsAt) beginRound(room, now);
  if (room.phase !== "playing") return;
  if (now >= room.endsAt) {
    room.rounds.push({ ...room.score });
    room.phase = room.round < ROUNDS ? "break" : "finished";
    room.endsAt = room.phase === "break" ? now + BREAK_TIME : 0;
    room.point = null;
    return;
  }
  for (const p of room.players) {
    if (!online(p, now)) continue;
    if (p.respawnAt && now >= p.respawnAt) place(room, p, now);
    if (p.reloadUntil && now >= p.reloadUntil) {
      p.reloadUntil = 0;
      p.ammo = CLIP;
    }
  }
  const nearby = new Set(room.players.filter(p => alive(p, now) && Math.hypot(p.x, p.z) < BEACON_RADIUS).map(p => p.team));
  const control = nearby.size > 1 ? "contested" : nearby.values().next().value ?? null;
  if (control !== room.point) {
    room.point = control;
    room.lastPointAt = now;
  }
  if (control && control !== "contested" && now - room.lastPointAt >= 3000) {
    addScore(room, control, 1);
    room.lastPointAt = now;
  }
}

export function applyInput(room: Room, p: Participant, input: ArenaInput, now: number) {
  if (room.phase !== "playing" || !alive(p, now) || now - p.lastInput < 72) return;
  const seconds = Math.min(0.29, (now - p.lastInput) / 1000);
  p.lastInput = now;
  Object.assign(p, advance(p, input, seconds), { yaw: input.yaw, pitch: input.pitch });
  if (input.reload && p.ammo < CLIP && !p.reloadUntil) p.reloadUntil = now + RELOAD_TIME;
  if (!input.fire || p.reloadUntil || !p.ammo || now - p.lastShot < SHOT_DELAY) return;
  p.ammo--;
  p.lastShot = now;
  p.shieldUntil = 0;
  if (!p.ammo) p.reloadUntil = now + RELOAD_TIME;

  const targetRay = trace(p, input.yaw, input.pitch);
  const vector = aim(input.yaw, input.pitch);
  let target: Participant | undefined;
  let distance = targetRay.distance;
  for (const fighter of room.players) {
    if (fighter.team !== otherTeam(p.team) || !alive(fighter, now) || fighter.shieldUntil > now) continue;
    const crossing = rayBox(targetRay.origin, vector, { x: fighter.x, z: fighter.z, y: 0.88 }, { x: .51, z: .51, y: .88 });
    if (crossing < distance) {
      target = fighter;
      distance = crossing;
    }
  }
  if (target) {
    p.tags++;
    target.outs++;
    target.respawnAt = now + RESPAWN_TIME;
    addScore(room, p.team, 3);
  }
  room.shots.push({ id: ++room.shotNumber, shooter: p.id, team: p.team, fromX: p.x, fromZ: p.z,
    x: p.x + vector.x * distance, y: EYE_HEIGHT + vector.y * distance, z: p.z + vector.z * distance,
    hit: target?.id ?? null, at: now });
  room.shots = room.shots.filter(s => now - s.at < 2400).slice(-44);
}

export function getSnapshot(room: Room, p: Participant, now: number): Snapshot {
  const players = room.players.filter(f => !f.left).map(f => ({ id: f.id, name: f.name, team: f.team, x: f.x, z: f.z,
    yaw: f.yaw, pitch: f.pitch, tags: f.tags, outs: f.outs, respawnAt: f.respawnAt, shieldUntil: f.shieldUntil, online: online(f, now) }));
  return { code: room.code, host: room.host, version: room.version, phase: room.phase, round: room.round, endsAt: room.endsAt,
    score: room.score, total: room.total, rounds: room.rounds, point: room.point, players, now,
    shots: room.shots.filter(s => now - s.at < 1000), self: { id: p.id, ammo: p.ammo, reloadUntil: p.reloadUntil, lastShot: p.lastShot } };
}
