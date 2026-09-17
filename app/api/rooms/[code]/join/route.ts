import { NextRequest, NextResponse } from "next/server";
import { roomStore } from "@/lib/rooms/store";
import { generateSessionToken, SESSION_COOKIE_NAME } from "@/lib/sessions/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const body = await req.json();
    const { nickname, avatarSeed } = body;

    let sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const isNewToken = !sessionToken;
    if (!sessionToken) {
      sessionToken = generateSessionToken();
    }

    const res = roomStore.joinRoom(code, nickname, sessionToken, avatarSeed);
    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 400 });
    }

    const response = NextResponse.json({
      success: true,
      player: res.player,
    });

    if (isNewToken) {
      response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: sessionToken,
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return response;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
