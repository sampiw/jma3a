const SAFE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateRoomCode(): string {
  let result = "JM-";
  for (let i = 0; i < 4; i++) {
    result += SAFE_CHARS.charAt(Math.floor(Math.random() * SAFE_CHARS.length));
  }
  return result;
}

export function normalizeRoomCode(code: string): string {
  let clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.startsWith("JM") && clean.length > 2) {
    clean = "JM-" + clean.substring(2);
  } else if (!clean.startsWith("JM-") && clean.length === 4) {
    clean = "JM-" + clean;
  }
  return clean;
}
