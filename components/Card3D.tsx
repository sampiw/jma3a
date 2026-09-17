"use client";

import React, { useState, useRef } from "react";
import { sound } from "@/lib/sound";

interface Card3DProps {
  frontContent: React.ReactNode;
  backContent?: React.ReactNode;
  isFlipped?: boolean;
  onFlipChange?: (flipped: boolean) => void;
  className?: string;
  allowTilt?: boolean;
}

export function Card3D({
  frontContent,
  backContent,
  isFlipped = false,
  onFlipChange,
  className = "",
  allowTilt = true,
}: Card3DProps) {
  const [internalFlipped, setInternalFlipped] = useState(isFlipped);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const activeFlipped = onFlipChange !== undefined ? isFlipped : internalFlipped;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!allowTilt || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setRotateX(-(y / rect.height) * 16);
    setRotateY((x / rect.width) * 16);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
  };

  const handleCardClick = () => {
    if (backContent) {
      sound.playCardFlip();
      const nextState = !activeFlipped;
      if (onFlipChange) {
        onFlipChange(nextState);
      } else {
        setInternalFlipped(nextState);
      }
    }
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleCardClick}
      className={`relative cursor-pointer select-none transition-transform duration-200 ease-out ${className}`}
      style={{
        perspective: "1200px",
      }}
    >
      <div
        className="relative w-full h-full rounded-2xl transition-transform duration-700 shadow-2xl"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateX(${rotateX}deg) rotateY(${rotateY + (activeFlipped ? 180 : 0)}deg)`,
        }}
      >
        {/* Front Face */}
        <div
          className="w-full h-full rounded-2xl overflow-hidden border border-jma3a-border/60 bg-gradient-to-b from-jma3a-card to-jma3a-dark p-6 backface-hidden"
          style={{ backfaceVisibility: "hidden" }}
        >
          {frontContent}
        </div>

        {/* Back Face */}
        {backContent && (
          <div
            className="absolute inset-0 w-full h-full rounded-2xl overflow-hidden border border-jma3a-gold/40 bg-gradient-to-b from-jma3a-surface to-jma3a-dark p-6 backface-hidden"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            {backContent}
          </div>
        )}
      </div>
    </div>
  );
}
