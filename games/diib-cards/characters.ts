import type { DiibCardsSettings, PlayableDiibRole } from "./types";

export const DIIB_CARD_CHARACTERS = ["wolf", "mute_wolf", "seer", "witch", "hunter", "protector"] as const satisfies readonly PlayableDiibRole[];
export type DiibCardsCharacters = Record<(typeof DIIB_CARD_CHARACTERS)[number], number>;

export const DEFAULT_DIIB_CARD_CHARACTERS: Readonly<DiibCardsCharacters> = {
  wolf: 1,
  mute_wolf: 1,
  seer: 0,
  witch: 1,
  hunter: 1,
  protector: 0,
};

export const countDiibCardsCharacters = (roles: DiibCardsCharacters) =>
  DIIB_CARD_CHARACTERS.reduce((total, role) => total + roles[role], 0);

export function parseDiibCardsCharacters(input: unknown): DiibCardsCharacters | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const data = input as Record<string, unknown>;
  const roles = { ...DEFAULT_DIIB_CARD_CHARACTERS };
  for (const role of DIIB_CARD_CHARACTERS) {
    const count = data[role] === undefined ? 0 : data[role];
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > 19) return;
    roles[role] = count;
  }
  const wolves = roles.wolf + roles.mute_wolf;
  if (wolves < 1 || wolves >= 19 || countDiibCardsCharacters(roles) > 19) return;
  return roles;
}

export function requiredDiibCardsPlayers(roles: DiibCardsCharacters) {
  return 1 + Math.max(3, countDiibCardsCharacters(roles), roles.wolf + roles.mute_wolf + 1);
}

export function diibCardsWolfPowers(
  roster: Array<{ role: string; isAlive: boolean }>,
  muteRule: DiibCardsSettings["muteRule"],
) {
  const killer = roster.some(p => p.isAlive && p.role === "wolf");
  const silencer = roster.some(p => p.isAlive && p.role === "mute_wolf");
  return {
    attack: killer || (muteRule === "WOLVES_PACK" && silencer),
    mute: muteRule === "WOLVES_PACK" ? killer || silencer : muteRule === "MUTE_WOLF_ONLY" && silencer,
  };
}
