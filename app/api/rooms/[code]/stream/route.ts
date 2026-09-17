import { NextRequest } from "next/server";
import { realtimeHub } from "@/lib/realtime/pubsub";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const roomCode = code.toUpperCase();

  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  // Send initial connected message
  writer.write(encoder.encode(`event: connected\ndata: ${JSON.stringify({ roomCode, time: Date.now() })}\n\n`));

  // Subscribe to room hub events
  const unsubscribe = realtimeHub.subscribe(roomCode, (event) => {
    try {
      const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
      writer.write(encoder.encode(payload));
    } catch {
      unsubscribe();
    }
  });

  // Keep-alive heartbeat interval
  const heartbeatInterval = setInterval(() => {
    try {
      writer.write(encoder.encode(": heartbeat\n\n"));
    } catch {
      clearInterval(heartbeatInterval);
      unsubscribe();
    }
  }, 15000);

  req.signal.addEventListener("abort", () => {
    clearInterval(heartbeatInterval);
    unsubscribe();
    try {
      writer.close();
    } catch {}
  });

  return new Response(responseStream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
