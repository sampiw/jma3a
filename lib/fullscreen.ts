/**
 * Full-screen + orientation helpers for phone browsers.
 *
 * - Android Chrome: real fullscreen + landscape lock (must be called from a tap).
 * - iPhone Safari: websites can't go fullscreen. The only way to hide the browser bars is
 *   "Add to Home Screen" (then the page opens in standalone mode).
 */

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS 13+ reports itself as Mac with touch
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    // iOS Safari home-screen apps
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isFullscreenActive(): boolean {
  if (typeof document === "undefined") return false;
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return Boolean(document.fullscreenElement || d.webkitFullscreenElement);
}

export function canUseFullscreenApi(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  return Boolean(el.requestFullscreen || el.webkitRequestFullscreen) && !isIOS();
}

/** Enters fullscreen and tries to lock landscape. Safe to call on any device. */
export async function enterGameFullscreen(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  try {
    if (!isFullscreenActive()) {
      if (el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: "hide" } as FullscreenOptions);
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      }
    }
  } catch {
    // Not allowed (iOS, in-app browsers...) — keep going with the in-page fullscreen layout
  }
  await lockLandscape();
  return isFullscreenActive();
}

export async function exitGameFullscreen(): Promise<void> {
  if (typeof document === "undefined") return;
  const d = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
  try {
    const orientation = screen.orientation as ScreenOrientation & { unlock?: () => void };
    orientation?.unlock?.();
  } catch {}
  try {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
  } catch {}
}

export async function lockLandscape(): Promise<boolean> {
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: "landscape") => Promise<void>;
    };
    if (orientation?.lock) {
      await orientation.lock("landscape");
      return true;
    }
  } catch {
    // Only works in fullscreen on Android; ignored elsewhere
  }
  return false;
}

/** Short vibration on supported phones (Android). iPhone browsers ignore it. */
export function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {}
}
