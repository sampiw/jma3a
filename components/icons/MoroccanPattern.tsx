import React from "react";

export function MoroccanPattern({ className = "w-full h-full opacity-5 pointer-events-none" }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="moroccanZellige" width="60" height="60" patternUnits="userSpaceOnUse">
            <path
              d="M30 0 L60 30 L30 60 L0 30 Z"
              fill="none"
              stroke="#E5A93B"
              strokeWidth="0.8"
            />
            <path
              d="M30 12 L48 30 L30 48 L12 30 Z"
              fill="none"
              stroke="#D94B34"
              strokeWidth="0.8"
            />
            <circle cx="30" cy="30" r="4" fill="#E5A93B" opacity="0.4" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#moroccanZellige)" />
      </svg>
    </div>
  );
}
