import { NextRequest, NextResponse } from "next/server";
import { roomStore } from "@/lib/rooms/store";
import { SESSION_COOKIE_NAME } from "@/lib/sessions/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value || req.headers.get("x-session-token");

  const state = roomStore.getAuthorizedState(code, sessionToken);
  if (!state) {
    return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json(
    { success: true, state },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
      },
    }
  );
}
