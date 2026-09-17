import { NextRequest, NextResponse } from "next/server";
import { roomStore } from "@/lib/rooms/store";
import { generateSessionToken, SESSION_COOKIE_NAME } from "@/lib/sessions/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { hostNickname, gameId, mode, locale, avatarSeed } = body;

    let sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const isNewToken = !sessionToken;
    if (!sessionToken) {
      sessionToken = generateSessionToken();
    }

    const { room, hostPlayer } = roomStore.createRoom(
      hostNickname || "Host",
      gameId || "dib",
      mode || "MULTI_PHONE",
      locale || "darija",
      sessionToken,
      avatarSeed || "avatar_1"
    );

    const response = NextResponse.json({
      success: true,
      roomCode: room.code,
      hostPlayerId: hostPlayer.id,
      selectedGameId: room.selectedGameId,
    });

    if (isNewToken) {
      response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: sessionToken,
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
    }

    return response;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
