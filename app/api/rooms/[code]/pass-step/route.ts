import { NextRequest, NextResponse } from "next/server";
import { roomStore } from "@/lib/rooms/store";
import { SESSION_COOKIE_NAME } from "@/lib/sessions/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value || req.headers.get("x-session-token");
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const res = roomStore.advancePassThePhone(code, sessionToken);
    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
