import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { z } from "zod";
import { applyInput, createRoom, getSnapshot, participant, startMatch, updateClock, type Room } from "@/games/paintball/match";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ttl = 3 * 60 * 60;
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomCode = z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/);
const name = z.string().trim().min(1).max(20).regex(/^[^\p{Cc}\p{Cf}]+$/u);
const credentials = { code: roomCode, token: z.string().regex(/^[a-f0-9]{48}$/) };
const input = z.object({ right: z.number().min(-1).max(1), forward: z.number().min(-1).max(1),
  yaw: z.number().min(-Math.PI).max(Math.PI), pitch: z.number().min(-1.28).max(1.28), fire: z.boolean(), reload: z.boolean() });
const schema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"), name }),
  z.object({ op: z.literal("join"), name, code: roomCode }),
  z.object({ op: z.literal("start"), ...credentials }),
  z.object({ op: z.literal("leave"), ...credentials }),
  z.object({ op: z.literal("sync"), ...credentials, input: input.optional() }),
]);

const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const local = process.env.NODE_ENV !== "production" && process.env.PAINTBALL_LOCAL_STORE === "1";
const redis = !local && redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken, retry: { retries: 1 } }) : null;
const memory = globalThis as typeof globalThis & { paintballRooms?: Map<string, { room: Room; expires: number }> };
const rooms = memory.paintballRooms ??= new Map();
const key = (code: string) => `jma3a:paintball:v1:${code}`;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(24).toString("hex");
const codeForRoom = () => Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");

const casScript = `
  local current = redis.call('GET', KEYS[1])
  if not current then return {0} end
  if cjson.decode(current).version ~= tonumber(ARGV[1]) then return {-1, current} end
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return {1}
`;

function prune() {
  const now = Date.now();
  for (const [code, entry] of rooms) if (entry.expires <= now) rooms.delete(code);
}

async function read(code: string): Promise<Room | null> {
  if (redis) return redis.get<Room>(key(code));
  const entry = rooms.get(code);
  return entry && entry.expires > Date.now() ? structuredClone(entry.room) : null;
}

async function insert(room: Room) {
  if (redis) return (await redis.set(key(room.code), room, { ex: ttl, nx: true })) === "OK";
  prune();
  if (rooms.has(room.code)) return false;
  rooms.set(room.code, { room, expires: Date.now() + ttl * 1000 });
  return true;
}

async function save(room: Room): Promise<true | Room | null> {
  const expected = room.version++;
  if (redis) {
    const [status, current] = await redis.eval<[number, string, number], [number, (string | Room)?]>(
      casScript, [key(room.code)], [expected, JSON.stringify(room), ttl],
    );
    if (status === 1) return true;
    if (!current) return null;
    return typeof current === "string" ? JSON.parse(current) as Room : current;
  }
  const stored = rooms.get(room.code);
  if (!stored || stored.expires <= Date.now()) return null;
  if (stored.room.version !== expected) return structuredClone(stored.room);
  rooms.set(room.code, { room, expires: Date.now() + ttl * 1000 });
  return true;
}

const answer = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const fail = (error: string, status: number) => answer({ error }, status);

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site") return fail("Open Splat on JMA3A to play.", 403);
  if (origin) {
    let host: string;
    try { host = new URL(origin).host; } catch { return fail("Open Splat on JMA3A to play.", 403); }
    const requestHosts = [request.headers.get("host"), request.headers.get("x-forwarded-host"), new URL(request.url).host];
    if (!requestHosts.includes(host)) return fail("Open Splat on JMA3A to play.", 403);
  }
  const raw = await request.text();
  if (raw.length > 2048) return fail("Input is too large.", 413);
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return fail("Invalid room request.", 400); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return fail("Enter a name and a valid six-character room code.", 400);
  if (!redis && process.env.NODE_ENV === "production") return fail("Matchmaking storage is unavailable.", 503);
  const action = parsed.data;
  try {
    if (action.op === "create") {
      const now = Date.now();
      const token = newToken();
      const p = participant(randomUUID(), digest(token), action.name, null, now);
      for (let i = 0; i < 5; i++) {
        const room = createRoom(codeForRoom(), p);
        if (await insert(room)) return answer({ token, snapshot: getSnapshot(room, p, now) });
      }
      return fail("Couldn't allocate a room. Try again.", 503);
    }

    let room = await read(action.code);
    const token = action.op === "join" ? newToken() : action.token;
    const hashed = digest(token);
    const id = action.op === "join" ? randomUUID() : "";
    for (let attempt = 0; room && attempt < 7; attempt++) {
      const now = Date.now();
      if (action.op === "join") {
        if (room.phase !== "lobby") return fail("That match has already started. Ask for the next room.", 409);
        room.players = room.players.filter(p => !p.left && now - p.lastSeen < 28_000);
        if (room.players.length >= 8) return fail("That room is full.", 409);
        const p = participant(id, hashed, action.name, room, now);
        room.players.push(p);
        updateClock(room, now);
        const result = await save(room);
        if (result === true) return answer({ token, snapshot: getSnapshot(room, p, now) });
        room = result;
        continue;
      }

      const p = room.players.find(player => player.credential === hashed && !player.left);
      if (!p) return fail("Your spot expired. Join the room again.", 401);
      if (action.op === "sync" && room.phase !== "playing" && room.phase !== "break" && now - p.lastSeen < 4000) {
        return answer({ snapshot: getSnapshot(room, p, now) });
      }
      p.lastSeen = now;
      updateClock(room, now);
      if (action.op === "leave") {
        p.left = true;
        updateClock(room, now);
      } else if (action.op === "start") {
        if (p.id !== room.host) return fail("Only the room host can start the match.", 403);
        if (!startMatch(room, now)) return fail("You need at least two connected players to start.", 409);
      } else if (action.input) {
        applyInput(room, p, action.input, now);
      }
      const result = await save(room);
      if (result === true) return answer(action.op === "leave" ? {} : { snapshot: getSnapshot(room, p, now) });
      room = result;
    }
    return room ? fail("The arena is syncing. Retrying…", 429) : fail("That room code could not be found.", 404);
  } catch (error) {
    console.error("Splat room storage error", error instanceof Error ? error.name : "UnknownError");
    return fail("The arena is temporarily unreachable. Try again.", 503);
  }
}
