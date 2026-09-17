"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Share2, X, Check } from "lucide-react";
import { sound } from "@/lib/sound";

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
}

export function QRCodeModal({ isOpen, onClose, roomCode }: QRCodeModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/join/${roomCode}` : `/join/${roomCode}`;

  useEffect(() => {
    if (isOpen && roomCode) {
      QRCode.toDataURL(joinUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: "#0B0E14",
          light: "#FBF8F2",
        },
      }).then(setQrDataUrl);
    }
  }, [isOpen, roomCode, joinUrl]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    sound.playCardFlip();
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    sound.playCardFlip();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "JMA3A — دخل تلعب معنا!",
          text: `دخل تلعب معنا فـ JMA3A! كود الغرفة: ${roomCode}`,
          url: joinUrl,
        });
      } catch {}
    } else {
      handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-sm rounded-3xl border border-jma3a-border bg-jma3a-card p-6 text-center shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-jma3a-muted hover:text-white bg-jma3a-surface"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold text-jma3a-sand mt-2">سكان كود الغرفة</h3>
        <p className="text-sm text-jma3a-muted mt-1">سكان بالكاميرا باش تدخل تلعب مباشرة</p>

        {/* QR Image */}
        <div className="my-5 flex justify-center">
          <div className="p-3 bg-jma3a-sand rounded-2xl shadow-inner">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={`QR for ${roomCode}`} className="w-56 h-56 rounded-xl" />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center text-jma3a-dark">جاري التحميل...</div>
            )}
          </div>
        </div>

        {/* Room Code Badge */}
        <div className="inline-block px-5 py-2 rounded-xl bg-jma3a-surface border border-jma3a-border mb-5">
          <span className="text-xs text-jma3a-muted block">كود الغرفة</span>
          <span className="text-2xl font-mono font-extrabold tracking-widest text-jma3a-gold">{roomCode}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-jma3a-surface hover:bg-jma3a-surface/80 text-jma3a-sand font-semibold transition-all border border-jma3a-border"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? "تم النسخ!" : "نسخ الرابط"}</span>
          </button>
          <button
            onClick={handleShare}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-jma3a-terracotta to-jma3a-accent text-white font-semibold shadow-lg shadow-jma3a-terracotta/30 transition-all hover:brightness-110"
          >
            <Share2 className="w-4 h-4" />
            <span>بارطاجي</span>
          </button>
        </div>
      </div>
    </div>
  );
}
