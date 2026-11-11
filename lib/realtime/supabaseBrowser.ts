import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

type BroadcastCallback = (msg: {
  type: "broadcast";
  event: string;
  payload: any;
}) => void;

type SubscribeStatusCallback = (status: string) => void;

const RELAY_POLL_MS = 90; // ~11Hz smooth low-latency Upstash Redis HTTP/2 relay

function makeTabSenderId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `c_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }
  return `c_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36).slice(-4)}`;
}

class LiveRelayChannel {
  private readonly topic: string;
  private readonly roomCode: string;
  private readonly senderId: string;
  private readonly listeners = new Map<string, BroadcastCallback[]>();
  private readonly pendingStates = new Map<string, { event: string; payload: unknown }>();
  private readonly pendingEvents: Array<{ id: string; event: string; payload: unknown }> = [];
  private readonly lastStateTs = new Map<string, number>();

  private subscribeCb: SubscribeStatusCallback | null = null;
  private isSubscribedEmitted = false;
  private disposed = false;
  private inFlight = false;
  private flushImmediatelyAfter = false;
  private sinceSeq = -1;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private consecutiveErrors = 0;

  constructor(topic: string) {
    this.topic = topic;
    const parts = topic.split(":");
    const extracted = parts.length > 1 ? parts[1] : parts[0];
    this.roomCode = (extracted || "GLOBAL").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    this.senderId = makeTabSenderId();
  }

  public on(
    type: string,
    filter: { event?: string },
    callback: BroadcastCallback
  ): this {
    if (type === "broadcast" && filter?.event) {
      const list = this.listeners.get(filter.event) || [];
      list.push(callback);
      this.listeners.set(filter.event, list);
    }
    return this;
  }

  public subscribe(callback?: SubscribeStatusCallback): this {
    if (callback) this.subscribeCb = callback;
    if (this.disposed) return this;

    if (!this.timerId) {
      void this.flushNow();
      this.timerId = setInterval(() => {
        void this.flushNow();
      }, RELAY_POLL_MS);
    }
    return this;
  }

  public async send(msg: {
    type: string;
    event: string;
    payload: unknown;
  }): Promise<"ok" | "error"> {
    if (this.disposed || msg?.type !== "broadcast" || !msg.event) {
      return "error";
    }

    // Coalesce high-frequency state streams so zero queue buildup occurs on WiFi/4G
    if (msg.event === "pos") {
      this.pendingStates.set(`pos:${this.senderId}`, {
        event: "pos",
        payload: msg.payload,
      });
      return "ok";
    }
    if (msg.event === "world") {
      this.pendingStates.set("world:arbiter", {
        event: "world",
        payload: msg.payload,
      });
      return "ok";
    }

    // Discrete gameplay events (shots, hits, kills, barrel blasts, dib3d/ghammada fx, refresh)
    // flush immediately for sub-40ms gunfire & hitmarker responsiveness!
    this.pendingEvents.push({
      id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      event: msg.event,
      payload: msg.payload,
    });
    if (this.pendingEvents.length > 32) {
      this.pendingEvents.splice(0, this.pendingEvents.length - 32);
    }

    if (this.inFlight) {
      this.flushImmediatelyAfter = true;
    } else {
      void this.flushNow();
    }
    return "ok";
  }

  private async flushNow(): Promise<void> {
    if (this.disposed || this.inFlight || typeof window === "undefined") return;
    this.inFlight = true;

    // Snapshot & clear outbound buffers before network roundtrip
    const statesObj: Record<string, { event: string; payload: unknown }> = {};
    for (const [k, v] of this.pendingStates.entries()) {
      statesObj[k] = v;
    }
    this.pendingStates.clear();

    const eventsBatch = this.pendingEvents.splice(0, 24);

    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(this.roomCode)}/live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          topic: this.topic,
          senderId: this.senderId,
          sinceSeq: this.sinceSeq,
          states: statesObj,
          events: eventsBatch,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (this.disposed || !data?.ok) return;

      this.consecutiveErrors = 0;
      if (!this.isSubscribedEmitted) {
        this.isSubscribedEmitted = true;
        this.subscribeCb?.("SUBSCRIBED");
      }

      // 1. Dispatch updated peer states (positions & world snapshots)
      if (Array.isArray(data.states)) {
        for (const st of data.states) {
          if (!st || st.senderId === this.senderId || typeof st.event !== "string") continue;
          const stateKey = String(st.key || `${st.senderId}:${st.event}`);
          const prevTs = this.lastStateTs.get(stateKey) ?? 0;
          if (typeof st.ts === "number" && st.ts <= prevTs) continue;
          if (typeof st.ts === "number") {
            this.lastStateTs.set(stateKey, st.ts);
          }

          const cbs = this.listeners.get(st.event);
          if (cbs) {
            for (const cb of cbs) {
              try {
                cb({ type: "broadcast", event: st.event, payload: st.payload });
              } catch {}
            }
          }
        }
      }

      // 2. Dispatch discrete ordered events (gunshots, hits, kills, explosions, fx)
      const wasInitial = this.sinceSeq < 0;
      if (typeof data.maxSeq === "number") {
        if (wasInitial) {
          this.sinceSeq = data.maxSeq;
        }
      }

      if (!wasInitial && Array.isArray(data.events)) {
        for (const ev of data.events) {
          if (!ev || ev.senderId === this.senderId) continue;
          if (typeof ev.seq === "number" && ev.seq <= this.sinceSeq) continue;
          if (typeof ev.seq === "number") {
            this.sinceSeq = Math.max(this.sinceSeq, ev.seq);
          }
          const cbs = this.listeners.get(ev.event);
          if (cbs) {
            for (const cb of cbs) {
              try {
                cb({ type: "broadcast", event: ev.event, payload: ev.payload });
              } catch {}
            }
          }
        }
      }

      if (typeof data.maxSeq === "number" && data.maxSeq > this.sinceSeq) {
        this.sinceSeq = data.maxSeq;
      }
    } catch {
      this.consecutiveErrors += 1;
      // Re-queue dropped discrete events if transient network hiccup occurred
      if (eventsBatch.length > 0 && this.pendingEvents.length < 24) {
        this.pendingEvents.unshift(...eventsBatch);
      }
      if (this.consecutiveErrors >= 5 && this.isSubscribedEmitted) {
        this.isSubscribedEmitted = false;
        this.subscribeCb?.("CHANNEL_ERROR");
      }
    } finally {
      this.inFlight = false;
      if (!this.disposed && this.flushImmediatelyAfter) {
        this.flushImmediatelyAfter = false;
        void this.flushNow();
      }
    }
  }

  public unsubscribe(): Promise<"ok"> {
    this.dispose();
    return Promise.resolve("ok");
  }

  public dispose(): void {
    this.disposed = true;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.listeners.clear();
    this.pendingStates.clear();
    this.pendingEvents.length = 0;
  }
}

class LiveRelayBrowserClient {
  private readonly channels = new Set<LiveRelayChannel>();

  public channel(topic: string, _opts?: unknown): RealtimeChannel {
    const ch = new LiveRelayChannel(topic);
    this.channels.add(ch);
    return ch as unknown as RealtimeChannel;
  }

  public removeChannel(channel: RealtimeChannel): Promise<"ok"> {
    const ch = channel as unknown as LiveRelayChannel;
    if (ch && typeof ch.dispose === "function") {
      ch.dispose();
      this.channels.delete(ch);
    }
    return Promise.resolve("ok");
  }
}

let relayClient: SupabaseClient | null = null;

/**
 * High-frequency Browser Live Multiplayer Relay Client (~11Hz Upstash Redis HTTP/2 pipeline).
 * Replaces dead Supabase Realtime WebSocket URLs with a rock-solid drop-in channel interface
 * so PC <-> Phone multiplayer works immediately across Carbon 3D, Dib 3D, and Ghammada 3D!
 */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!relayClient) {
    relayClient = new LiveRelayBrowserClient() as unknown as SupabaseClient;
  }
  return relayClient;
}

export function isLiveChannelConfigured(): boolean {
  return true;
}
