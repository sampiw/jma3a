import { NextRequest, NextResponse } from "next/server";
import { roomStore } from "@/lib/rooms/store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const room = roomStore.getRoom(code);
  if (!room) {
    return NextResponse.json({ success: false, error: "الغرفة غير موجودة" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    code: room.code,
    status: room.status,
    selectedGameId: room.selectedGameId,
    playersCount: room.players.length,
    interactionMode: room.settings.interactionMode,
  });
}
