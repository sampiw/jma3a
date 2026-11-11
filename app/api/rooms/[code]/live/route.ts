import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/rooms/store";

export const dynamic = "force-dynamic";

interface StoredStateEntry {
  key?: string;
  senderId: string;
  event: string;
  payload: unknown;
  ts: number;
}

interface StoredEventEntry {
  seq: number;
  id: string;
  senderId: string;
  event: string;
  payload: unknown;
  ts: number;
}

interface MemoryTopicBucket {
  seq: number;
  states: Map<string, StoredStateEntry>;
  events: StoredEventEntry[];
  updatedAt: number;
}

const globalForLive = globalThis as unknown as {
  jma3aLiveBuckets?: Map<string, MemoryTopicBucket>;
};
const memBuckets =
  globalForLive.jma3aLiveBuckets || new Map<string, MemoryTopicBucket>();
globalForLive.jma3aLiveBuckets = memBuckets;

function safeParse<T>(raw: unknown): T | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as T;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const roomCode = (code || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const body = await req.json();

    const rawTopic = String(body?.topic || `room:${roomCode}`);
    const safeTopic = rawTopic.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 64);
    const senderId = String(body?.senderId || "").slice(0, 48);
    const rawSinceSeq = typeof body?.sinceSeq === "number" ? body.sinceSeq : -1;
    const isInitialSync = rawSinceSeq < 0;

    if (!senderId || !roomCode) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const now = Date.now();
    const incomingStates =
      body?.states && typeof body.states === "object"
        ? (body.states as Record<string, { event: string; payload: unknown }>)
        : {};
    const incomingEvents = Array.isArray(body?.events)
      ? (body.events as Array<{ id?: string; event: string; payload: unknown }>).slice(0, 32)
      : [];

    // 1. Upstash Redis Pipelined Fast Path (Production Multi-Device Sync)
    if (redis) {
      const stKey = `jma3a:live:st:${safeTopic}`;
      const evKey = `jma3a:live:ev:${safeTopic}`;
      const seqKey = `jma3a:live:sq:${safeTopic}`;

      let baseSeq = 0;
      if (incomingEvents.length > 0) {
        const endSeq = await redis.incrby(seqKey, incomingEvents.length);
        baseSeq = Number(endSeq) - incomingEvents.length;
      }

      const pipe = redis.pipeline();
      const stateEntries = Object.entries(incomingStates);
      if (stateEntries.length > 0) {
        const hmap: Record<string, string> = {};
        for (const [field, val] of stateEntries) {
          if (!val || typeof val.event !== "string") continue;
          const cleanField = field.slice(0, 64);
          const entry: StoredStateEntry = {
            key: cleanField,
            senderId,
            event: val.event,
            payload: val.payload,
            ts: now,
          };
          hmap[cleanField] = JSON.stringify(entry);
        }
        if (Object.keys(hmap).length > 0) {
          pipe.hset(stKey, hmap);
          pipe.expire(stKey, 45);
        }
      }

      if (incomingEvents.length > 0) {
        const serialized = incomingEvents.map((ev, idx) => {
          const entry: StoredEventEntry = {
            seq: baseSeq + idx + 1,
            id: String(ev.id || `${now}_${idx}`),
            senderId,
            event: String(ev.event || ""),
            payload: ev.payload,
            ts: now,
          };
          return JSON.stringify(entry);
        });
        pipe.rpush(evKey, ...serialized);
        pipe.ltrim(evKey, -64, -1);
        pipe.expire(evKey, 45);
        pipe.expire(seqKey, 60);
      }

      pipe.hgetall(stKey);
      pipe.lrange(evKey, -50, -1);

      const results = await pipe.exec();
      const rawStates = results[results.length - 2] as Record<string, unknown> | null;
      const rawEvents = results[results.length - 1] as unknown[] | null;

      const outStates: StoredStateEntry[] = [];
      if (rawStates && typeof rawStates === "object") {
        for (const [k, val] of Object.entries(rawStates)) {
          const parsed = safeParse<StoredStateEntry>(val);
          if (!parsed) continue;
          if (parsed.senderId === senderId) continue;
          if (now - parsed.ts > 10_000) continue;
          outStates.push({ ...parsed, key: parsed.key || k });
        }
      }

      let maxSeq = isInitialSync ? 0 : rawSinceSeq;
      const outEvents: StoredEventEntry[] = [];
      if (Array.isArray(rawEvents)) {
        for (const item of rawEvents) {
          const parsed = safeParse<StoredEventEntry>(item);
          if (!parsed) continue;
          if (parsed.seq > maxSeq) maxSeq = parsed.seq;
          if (!isInitialSync && parsed.seq > rawSinceSeq && parsed.senderId !== senderId) {
            outEvents.push(parsed);
          }
        }
      }

      return NextResponse.json(
        { ok: true, states: outStates, events: outEvents, maxSeq },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // 2. Local In-Memory Fallback (Dev / Automated Tests)
    let bucket = memBuckets.get(safeTopic);
    if (!bucket || now - bucket.updatedAt > 60_000) {
      bucket = { seq: 0, states: new Map(), events: [], updatedAt: now };
      memBuckets.set(safeTopic, bucket);
    }
    bucket.updatedAt = now;

    for (const [field, val] of Object.entries(incomingStates)) {
      if (!val || typeof val.event !== "string") continue;
      const cleanField = field.slice(0, 64);
      bucket.states.set(cleanField, {
        key: cleanField,
        senderId,
        event: val.event,
        payload: val.payload,
        ts: now,
      });
    }

    for (const ev of incomingEvents) {
      bucket.seq += 1;
      bucket.events.push({
        seq: bucket.seq,
        id: String(ev.id || `${now}_${bucket.seq}`),
        senderId,
        event: String(ev.event || ""),
        payload: ev.payload,
        ts: now,
      });
    }
    if (bucket.events.length > 64) {
      bucket.events.splice(0, bucket.events.length - 64);
    }

    const outStates: StoredStateEntry[] = [];
    for (const [k, st] of bucket.states.entries()) {
      if (now - st.ts > 10_000) {
        bucket.states.delete(k);
        continue;
      }
      if (st.senderId !== senderId) outStates.push(st);
    }

    const outEvents = isInitialSync
      ? []
      : bucket.events.filter((e) => e.seq > rawSinceSeq && e.senderId !== senderId);

    return NextResponse.json(
      { ok: true, states: outStates, events: outEvents, maxSeq: bucket.seq },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Relay error" },
      { status: 500 }
    );
  }
}
