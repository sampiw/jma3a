import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "jma3a_session_token";

export function generateSessionToken(): string {
  return "jma3a_" + crypto.randomUUID().replace(/-/g, "") + "_" + Date.now().toString(36);
}

export async function getSessionTokenFromRequest(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE_NAME);
    return cookie?.value || null;
  } catch {
    return null;
  }
}
