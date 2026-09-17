"use client";

import React, { useEffect, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AuthorizedGameState, GameId } from "@/lib/types";
import { QRCodeModal } from "@/components/QRCodeModal";
import { PassThePhoneCurtain } from "@/components/PassThePhoneCurtain";
import { DibGameView } from "@/components/games/DibGameView";
import { IntrusGameView } from "@/components/games/IntrusGameView";
import { ChkonFinaGameView } from "@/components/games/ChkonFinaGameView";
import { MettelhaGameView } from "@/components/games/MettelhaGameView";
import { Mamnou3GameView } from "@/components/games/Mamnou3GameView";
import { MissionSirriyaGameView } from "@/components/games/MissionSirriyaGameView";
import { sound } from "@/lib/sound";
import {
  QrCode,
  Copy,
  Users,
  Play,
  RotateCcw,
  Sparkles,
  Crown,
  Volume2,
  VolumeX,
  Plus,
  ArrowRightLeft,
  X,
  AlertCircle,
} from "lucide-react";

const GAME_NAMES: Record<GameId, string> = {
  dib: "الذيب (DIB)",
  intrus: "الدخيل (L'Intrus)",
  "chkon-fina": "شكون فينا؟",
  mettelha: "مثلها (Mettelha)",
  mamnou3: "ممنوع (Mamnou3)",
  "mission-sirriya": "مهمة سرية",
};

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = use(params);
  const roomCode = resolvedParams.code.toUpperCase();
  const router = useRouter();

  const [gameState, setGameState] = useState<AuthorizedGameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Switch game modal & local player modal state
  const [switchModalOpen, setSwitchModalOpen] = useState(false);
  const [addLocalModalOpen, setAddLocalModalOpen] = useState(false);
  const [localPlayerNick, setLocalPlayerNick] = useState("");
  const [actionError, setActionError] = useState("");

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomCode}/state`, { cache: "no-store" });
      const data = await res.json();
      if (data.success && data.state) {
        setGameState(data.state);
      }
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [roomCode]);

  useEffect(() => {
    fetchState();

    // SSE Realtime Subscription
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/rooms/${roomCode}/stream`);
      eventSource.onmessage = () => {
        fetchState();
      };
      eventSource.addEventListener("ROOM_UPDATED", () => fetchState());
      eventSource.addEventListener("PLAYER_JOINED", () => fetchState());
      eventSource.addEventListener("GAME_STARTED", () => fetchState());
      eventSource.addEventListener("STATE_CHANGED", () => fetchState());
      eventSource.addEventListener("PASS_THE_PHONE_STEP", () => fetchState());
      eventSource.addEventListener("GAME_SWITCHED", () => fetchState());
    } catch {}

    // Polling fallback every 3s
    const pollInterval = setInterval(fetchState, 3000);

    return () => {
      clearInterval(pollInterval);
      if (eventSource) eventSource.close();
    };
  }, [roomCode, fetchState]);

  const toggleSound = () => {
    sound.isMuted = !isMuted;
    setIsMuted(!isMuted);
    if (isMuted) sound.playCardFlip();
  };

  const handleCopyLink = async () => {
    sound.playCardFlip();
    const url = `${window.location.origin}/join/${roomCode}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartGame = async () => {
    sound.playCardFlip();
    setActionError("");
    try {
      const res = await fetch(`/api/rooms/${roomCode}/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionError(data.error || "تعذر بدء اللعبة");
      } else {
        fetchState();
      }
    } catch {
      setActionError("خطأ فالشبكة");
    }
  };

  const handleSwitchGame = async (newGameId: GameId) => {
    sound.playCardFlip();
    setSwitchModalOpen(false);
    try {
      await fetch(`/api/rooms/${roomCode}/switch-game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newGameId }),
      });
      fetchState();
    } catch {}
  };

  const handleAddLocalPlayer = async () => {
    if (!localPlayerNick.trim()) return;
    sound.playCardFlip();
    setAddLocalModalOpen(false);
    try {
      await fetch(`/api/rooms/${roomCode}/local-player`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: localPlayerNick.trim(),
          avatarSeed: "avatar_" + Math.floor(Math.random() * 8 + 1),
        }),
      });
      setLocalPlayerNick("");
      fetchState();
    } catch {}
  };

  const handleGameAction = async (action: any) => {
    sound.playCardFlip();
    try {
      await fetch(`/api/rooms/${roomCode}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      fetchState();
    } catch {}
  };

  const handlePassStep = async () => {
    try {
      await fetch(`/api/rooms/${roomCode}/pass-step`, { method: "POST" });
      fetchState();
    } catch {}
  };

  if (loading || !gameState) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-jma3a-gold border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-jma3a-muted">جاري تحميل حالة الغرفة...</p>
        </div>
      </div>
    );
  }

  const { room, player, privateView, passThePhone } = gameState;
  const isHost = Boolean(player?.isHost);
  const isOnePhone = room.settings.interactionMode === "ONE_PHONE";
  const isLobby = room.status === "LOBBY";

  return (
    <div className="flex flex-col min-h-screen">
      {/* Room Header */}
      <header className="w-full border-b border-jma3a-border/40 bg-jma3a-dark/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="font-black text-jma3a-gold text-lg tracking-wider px-2.5 py-1 rounded-xl bg-jma3a-surface border border-jma3a-border hover:border-jma3a-gold"
            >
              JMA3A
            </button>

            {/* Room Code Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-jma3a-card border border-jma3a-border">
              <span className="text-xs text-jma3a-muted">كود:</span>
              <span className="font-mono font-black text-jma3a-gold text-sm tracking-wider">{room.code}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="p-2 rounded-xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand text-xs font-semibold flex items-center gap-1.5 border border-jma3a-border"
              title="نسخ الرابط"
            >
              <Copy className="w-4 h-4 text-jma3a-gold" />
              <span className="hidden sm:inline">{copied ? "تم النسخ!" : "نسخ الرابط"}</span>
            </button>

            <button
              onClick={() => setQrOpen(true)}
              className="p-2 rounded-xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand border border-jma3a-border"
              title="عرض QR Code"
            >
              <QrCode className="w-4 h-4 text-jma3a-gold" />
            </button>

            <button
              onClick={toggleSound}
              className="p-2 rounded-xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand border border-jma3a-border"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-jma3a-gold" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-4xl mx-auto w-full p-4 flex flex-col justify-between">
        {/* VIEW 1: LOBBY */}
        {isLobby && (
          <div className="max-w-md mx-auto w-full py-4 text-right animate-fadeIn">
            {/* Game Badge Banner */}
            <div className="p-5 rounded-3xl bg-gradient-to-br from-jma3a-surface to-jma3a-card border border-jma3a-border mb-6 text-center shadow-2xl relative overflow-hidden">
              <span className="text-[11px] text-jma3a-muted block mb-1">اللعبة المختارة دابا</span>
              <h2 className="text-2xl font-black text-jma3a-gold mb-3">{GAME_NAMES[room.selectedGameId]}</h2>

              <div className="flex justify-center gap-3">
                {isHost && (
                  <button
                    onClick={() => setSwitchModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-jma3a-surface hover:bg-jma3a-border border border-jma3a-border text-xs font-bold text-jma3a-sand flex items-center gap-1.5 transition-all"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 text-jma3a-gold" />
                    <span>بدلو اللعبة</span>
                  </button>
                )}
                <button
                  onClick={() => setQrOpen(true)}
                  className="px-4 py-2 rounded-xl bg-jma3a-surface hover:bg-jma3a-border border border-jma3a-border text-xs font-bold text-jma3a-sand flex items-center gap-1.5"
                >
                  <QrCode className="w-3.5 h-3.5 text-jma3a-gold" />
                  <span>عرض QR</span>
                </button>
              </div>
            </div>

            {/* Players Roster */}
            <div className="p-5 rounded-3xl bg-jma3a-card border border-jma3a-border mb-6 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs text-jma3a-gold font-bold">
                  {room.players.length} لاعبين مجموعين
                </span>
                <h3 className="text-base font-black text-jma3a-sand flex items-center gap-2">
                  <Users className="w-4 h-4 text-jma3a-gold" />
                  <span>اللاعبين فالمجموعة:</span>
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-2.5 mb-4">
                {room.players.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-2xl bg-jma3a-surface/80 border border-jma3a-border flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-sm font-bold text-jma3a-sand">{p.nickname}</span>
                    </div>
                    {p.isHost && (
                      <span title="مول الغرفة">
                        <Crown className="w-4 h-4 text-jma3a-gold" />
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Add local player button for shared device */}
              {(isHost || isOnePhone) && (
                <button
                  onClick={() => setAddLocalModalOpen(true)}
                  className="w-full py-2.5 rounded-xl bg-jma3a-surface hover:bg-jma3a-border border border-jma3a-border text-xs font-bold text-jma3a-sand flex items-center justify-center gap-1.5 transition-all"
                >
                  <Plus className="w-4 h-4 text-jma3a-gold" />
                  <span>زيد لاعب كيلعب فهاد التليفون</span>
                </button>
              )}
            </div>

            {actionError && (
              <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-semibold mb-5 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Start Game CTA */}
            {isHost ? (
              <button
                onClick={handleStartGame}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-black text-lg shadow-xl shadow-jma3a-terracotta/40 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5 fill-white" />
                <span>الكل مجموع؟ يلا نبداو! 🚀</span>
              </button>
            ) : (
              <div className="w-full py-4 rounded-2xl bg-jma3a-surface border border-jma3a-border text-center text-sm font-bold text-jma3a-muted animate-pulse">
                كنتسناو مول الغرفة يبدا اللعبة...
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: ACTIVE GAME */}
        {!isLobby && room.gameView && (
          <div className="w-full py-2 flex-1">
            {/* If ONE_PHONE mode and private step is active: Wrap in curtain! */}
            {isOnePhone && passThePhone && (
              <PassThePhoneCurtain
                currentPlayerNickname={passThePhone.currentPlayerNickname}
                isRevealed={passThePhone.isRevealed}
                onStep={handlePassStep}
              >
                {/* Render active game */}
                {renderActiveGameView(
                  room.selectedGameId,
                  room.gameView.publicData,
                  privateView?.privateData,
                  privateView?.mySecret,
                  privateView?.myRole,
                  isHost,
                  handleGameAction,
                  room.players
                )}
              </PassThePhoneCurtain>
            )}

            {/* MULTI_PHONE / Normal mode: Render directly! */}
            {(!isOnePhone || !passThePhone) &&
              renderActiveGameView(
                room.selectedGameId,
                room.gameView.publicData,
                privateView?.privateData,
                privateView?.mySecret,
                privateView?.myRole,
                isHost,
                handleGameAction,
                room.players
              )}
          </div>
        )}

        {/* Floating Post-Game Controls (Preserves room & players!) */}
        {!isLobby && (
          <div className="py-4 border-t border-jma3a-border/40 mt-6 flex gap-3 justify-center">
            {isHost && (
              <>
                <button
                  onClick={() => setSwitchModalOpen(true)}
                  className="py-3 px-5 rounded-2xl bg-jma3a-surface hover:bg-jma3a-border text-jma3a-sand font-bold text-xs border border-jma3a-border flex items-center gap-2"
                >
                  <ArrowRightLeft className="w-4 h-4 text-jma3a-gold" />
                  <span>بدلو اللعبة</span>
                </button>

                <button
                  onClick={() => handleSwitchGame(room.selectedGameId)}
                  className="py-3 px-5 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-bold text-xs shadow-md flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>نعاودو نلعبو</span>
                </button>
              </>
            )}
          </div>
        )}
      </main>

      {/* QR Code Modal */}
      <QRCodeModal isOpen={qrOpen} onClose={() => setQrOpen(false)} roomCode={room.code} />

      {/* Switch Game Modal */}
      {switchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-md rounded-3xl border border-jma3a-border bg-jma3a-card p-6 shadow-2xl text-right">
            <button
              onClick={() => setSwitchModalOpen(false)}
              className="absolute top-4 left-4 p-2 rounded-full text-jma3a-muted hover:text-white bg-jma3a-surface"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black text-jma3a-sand mb-1">بدلو اللعبة وحافظو على الغرفة</h3>
            <p className="text-xs text-jma3a-muted mb-4">
              ما كاين لاش تعاودو تسكانيو QR، الكل كيبقى مجموع فالغرفة!
            </p>

            <div className="space-y-2">
              {(Object.keys(GAME_NAMES) as GameId[]).map((gId) => (
                <button
                  key={gId}
                  onClick={() => handleSwitchGame(gId)}
                  className={`w-full p-3.5 rounded-2xl border text-right font-bold text-sm transition-all flex items-center justify-between ${
                    room.selectedGameId === gId
                      ? "bg-jma3a-surface border-jma3a-gold text-jma3a-gold"
                      : "bg-jma3a-dark border-jma3a-border text-jma3a-sand hover:border-white/20"
                  }`}
                >
                  <span>{GAME_NAMES[gId]}</span>
                  <Sparkles className="w-4 h-4 text-jma3a-gold opacity-60" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Local Player Modal */}
      {addLocalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-sm rounded-3xl border border-jma3a-border bg-jma3a-card p-6 shadow-2xl text-right">
            <button
              onClick={() => setAddLocalModalOpen(false)}
              className="absolute top-4 left-4 p-2 rounded-full text-jma3a-muted hover:text-white bg-jma3a-surface"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-jma3a-sand mb-1">زيد لاعب فهاد التليفون</h3>
            <p className="text-xs text-jma3a-muted mb-4">
              مناسب يلا شي صاحبكم ما عندوش شارج فتيليفونو
            </p>

            <input
              type="text"
              value={localPlayerNick}
              onChange={(e) => setLocalPlayerNick(e.target.value)}
              placeholder="اكتب سميتو..."
              className="w-full px-4 py-3 rounded-xl bg-jma3a-surface border border-jma3a-border text-jma3a-sand text-sm font-semibold mb-4 focus:outline-none focus:border-jma3a-gold"
              autoFocus
            />

            <button
              onClick={handleAddLocalPlayer}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-bold text-sm shadow-md"
            >
              إضافة اللاعب
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function renderActiveGameView(
  gameId: GameId,
  publicData: any,
  privateData: any,
  mySecret: string | undefined,
  myRole: string | undefined,
  isHost: boolean,
  onAction: (action: any) => void,
  players: any[]
) {
  switch (gameId) {
    case "dib":
      return (
        <DibGameView
          publicData={publicData}
          privateData={privateData}
          myRole={myRole}
          isHost={isHost}
          onAction={onAction}
          players={players}
        />
      );
    case "intrus":
      return (
        <IntrusGameView
          publicData={publicData}
          privateData={privateData}
          mySecret={mySecret}
          isHost={isHost}
          onAction={onAction}
          players={players}
        />
      );
    case "chkon-fina":
      return (
        <ChkonFinaGameView
          publicData={publicData}
          privateData={privateData}
          isHost={isHost}
          onAction={onAction}
          players={players}
        />
      );
    case "mettelha":
      return (
        <MettelhaGameView
          publicData={publicData}
          privateData={privateData}
          mySecret={mySecret}
          isHost={isHost}
          onAction={onAction}
          players={players}
        />
      );
    case "mamnou3":
      return (
        <Mamnou3GameView
          publicData={publicData}
          privateData={privateData}
          mySecret={mySecret}
          isHost={isHost}
          onAction={onAction}
          players={players}
        />
      );
    case "mission-sirriya":
      return (
        <MissionSirriyaGameView
          publicData={publicData}
          privateData={privateData}
          mySecret={mySecret}
          isHost={isHost}
          onAction={onAction}
          players={players}
        />
      );
    default:
      return <div className="text-center text-sm text-jma3a-muted">اللعبة قيد التحميل...</div>;
  }
}
