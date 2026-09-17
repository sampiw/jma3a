type Listener = (data: { type: string; version: number; payload?: unknown }) => void;

class RealtimeHub {
  private listeners: Map<string, Set<Listener>> = new Map();

  subscribe(roomCode: string, listener: Listener): () => void {
    const code = roomCode.toUpperCase();
    if (!this.listeners.has(code)) {
      this.listeners.set(code, new Set());
    }
    this.listeners.get(code)!.add(listener);

    return () => {
      const roomListeners = this.listeners.get(code);
      if (roomListeners) {
        roomListeners.delete(listener);
        if (roomListeners.size === 0) {
          this.listeners.delete(code);
        }
      }
    };
  }

  publish(roomCode: string, type: string, version: number, payload?: unknown) {
    const code = roomCode.toUpperCase();
    const roomListeners = this.listeners.get(code);
    if (roomListeners) {
      const msg = { type, version, payload };
      roomListeners.forEach((fn) => {
        try {
          fn(msg);
        } catch (e) {
          console.error("Realtime dispatch error:", e);
        }
      });
    }
  }
}

// Global singleton for server runtime
const globalForHub = global as unknown as { jma3aRealtimeHub?: RealtimeHub };
export const realtimeHub = globalForHub.jma3aRealtimeHub || new RealtimeHub();
if (process.env.NODE_ENV !== "production") globalForHub.jma3aRealtimeHub = realtimeHub;
