export type CarbonMode = "FFA" | "SQUAD" | "SURVIVAL";

export type CarbonTeam = "CYAN" | "CRIMSON" | "SOLO";

export type CarbonWeaponId = "CARBINE" | "SHOTGUN" | "RAILGUN" | "LOBBER";

export type CarbonPickupKind =
  | "WEAPON_SHOTGUN"
  | "WEAPON_RAILGUN"
  | "WEAPON_LOBBER"
  | "SHIELD_CELL"
  | "OVERDRIVE_AMP";

export type CarbonBotArchetype = "STRIKER" | "DRONE" | "ENFORCER" | "SNIPER" | "BOSS_MECH";

export interface CarbonWeaponSpec {
  id: CarbonWeaponId;
  nameEn: string;
  nameAr: string;
  fireIntervalMs: number;
  damage: number;
  critMultiplier: number;
  pellets: number;
  spreadRad: number;
  range: number;
  projectileSpeed: number; // 0 = instant hitscan beam
  splashRadius: number;
  bounces: number;
  knockback: number;
  magSize: number;
  reloadMs: number;
  colorHex: number;
  badgeColor: string;
}

export const CARBON_WEAPONS: Record<CarbonWeaponId, CarbonWeaponSpec> = {
  CARBINE: {
    id: "CARBINE",
    nameEn: "VX-4 Carbon Carbine",
    nameAr: "رشاش كاربون VX-4",
    fireIntervalMs: 135,
    damage: 19,
    critMultiplier: 1.4,
    pellets: 1,
    spreadRad: 0.022,
    range: 36,
    projectileSpeed: 64,
    splashRadius: 0,
    bounces: 0,
    knockback: 1.2,
    magSize: 28,
    reloadMs: 1300,
    colorHex: 0x22d3ee,
    badgeColor: "text-cyan-300 border-cyan-400/50 bg-cyan-950/60",
  },
  SHOTGUN: {
    id: "SHOTGUN",
    nameEn: "KR-8 Breacher",
    nameAr: "شوتغن الصدمة KR-8",
    fireIntervalMs: 660,
    damage: 13,
    critMultiplier: 1.3,
    pellets: 8,
    spreadRad: 0.125,
    range: 15.5,
    projectileSpeed: 54,
    splashRadius: 0,
    bounces: 0,
    knockback: 8.5,
    magSize: 6,
    reloadMs: 1500,
    colorHex: 0xfb923c,
    badgeColor: "text-amber-300 border-amber-400/50 bg-amber-950/60",
  },
  RAILGUN: {
    id: "RAILGUN",
    nameEn: "XR-1 Ion Railgun",
    nameAr: "قناص الليزر XR-1",
    fireIntervalMs: 1120,
    damage: 78,
    critMultiplier: 1.45,
    pellets: 1,
    spreadRad: 0.003,
    range: 54,
    projectileSpeed: 0, // Hitscan piercing beam
    splashRadius: 0,
    bounces: 0,
    knockback: 4.5,
    magSize: 5,
    reloadMs: 1750,
    colorHex: 0xf43f5e,
    badgeColor: "text-rose-300 border-rose-400/50 bg-rose-950/60",
  },
  LOBBER: {
    id: "LOBBER",
    nameEn: "GL-6 Pulse Lobber",
    nameAr: "قاذف البلازما GL-6",
    fireIntervalMs: 740,
    damage: 56,
    critMultiplier: 1.15,
    pellets: 1,
    spreadRad: 0.018,
    range: 29,
    projectileSpeed: 28,
    splashRadius: 3.8,
    bounces: 1,
    knockback: 7.0,
    magSize: 6,
    reloadMs: 1600,
    colorHex: 0xc084fc,
    badgeColor: "text-purple-300 border-purple-400/50 bg-purple-950/60",
  },
};

export interface CarbonCombatant {
  id: string;
  nickname: string;
  isBot: boolean;
  archetype: CarbonBotArchetype;
  team: CarbonTeam;
  accentHex: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  isAlive: boolean;
  respawnAt: number;
  weapon: CarbonWeaponId;
  secondaryWeapon: CarbonWeaponId | null;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  streak: number;
  overdriveUntil: number;
  lastDamagedAt: number;
}

export interface CarbonPickupPad {
  id: string;
  kind: CarbonPickupKind;
  x: number;
  y: number;
  z: number;
  available: boolean;
  respawnAt: number;
}

export interface CarbonKillFeedEntry {
  id: string;
  killerName: string;
  victimName: string;
  weapon: CarbonWeaponId | "GRENADE";
  isHeadshot?: boolean;
  streak?: number;
  at: number;
}

export interface CarbonSettings {
  mode: CarbonMode;
  botFill: boolean;
  botDifficulty: "NORMAL" | "HARD" | "CARBON";
  targetKillsFFA: number;
  targetScoreSquad: number;
  matchDurationSec: number;
}

export interface CarbonState {
  phase: "PLAYING" | "GAME_OVER";
  mode: CarbonMode;
  round: number;
  startedAt: number;
  endsAt: number;
  wave: number;
  waveEnemiesRemaining: number;
  coreOwner: CarbonTeam | "CONTESTED" | "NEUTRAL";
  coreProgress: number; // -100 (CRIMSON) .. +100 (CYAN)
  teamScores: {
    CYAN: number;
    CRIMSON: number;
  };
  combatants: Record<string, CarbonCombatant>;
  pickups: CarbonPickupPad[];
  killFeed: CarbonKillFeedEntry[];
  winnerId: string | null;
  winnerTeam: CarbonTeam | null;
  winnerSummaryAr: string | null;
  settings: CarbonSettings;
}

export type CarbonAction =
  | {
      type: "CONFIGURE_MATCH";
      mode?: CarbonMode;
      botFill?: boolean;
      botDifficulty?: "NORMAL" | "HARD" | "CARBON";
    }
  | {
      type: "SYNC_CHECKPOINT";
      combatants: Record<string, CarbonCombatant>;
      pickups?: CarbonPickupPad[];
      teamScores?: { CYAN: number; CRIMSON: number };
      coreOwner?: CarbonTeam | "CONTESTED" | "NEUTRAL";
      coreProgress?: number;
      wave?: number;
      waveEnemiesRemaining?: number;
      killFeed?: CarbonKillFeedEntry[];
    }
  | {
      type: "FINISH_MATCH";
      combatants: Record<string, CarbonCombatant>;
      teamScores?: { CYAN: number; CRIMSON: number };
      wave?: number;
      winnerId?: string | null;
      winnerTeam?: CarbonTeam | null;
      winnerSummaryAr: string;
    }
  | {
      type: "RESTART_MATCH";
      mode?: CarbonMode;
    };

// ---------------------------------------------------------------------------
// Ultra-compact Realtime WebSocket Packets (Supabase Broadcast @ 20Hz)
// ---------------------------------------------------------------------------

export interface CarbonLivePeerPacket {
  i: string; // player id
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yw: number; // yaw
  pt: number; // pitch
  w: CarbonWeaponId;
  d?: number; // dashing flag (1 = dashing)
  ab?: number; // airborne flag
  t: number; // local receive timestamp
}

export interface CarbonShotPacket {
  id: string;
  shooterId: string;
  weapon: CarbonWeaponId | "GRENADE";
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
  overdrive?: boolean;
}

export interface CarbonHitClaimPacket {
  shooterId: string;
  targetId: string;
  weapon: CarbonWeaponId | "GRENADE";
  damage: number;
  isCrit: boolean;
  hx: number;
  hy: number;
  hz: number;
  kx: number;
  kz: number;
}

export interface CarbonKillEventPacket {
  id: string;
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  weapon: CarbonWeaponId | "GRENADE";
  isHeadshot: boolean;
  streak: number;
  vx: number;
  vy: number;
  vz: number;
  colorHex: number;
}

export interface CarbonWorldSyncPacket {
  arbiterId: string;
  seq: number;
  mode: CarbonMode;
  phase: "PLAYING" | "GAME_OVER";
  endsAt: number;
  wave: number;
  waveRem: number;
  coreOwner: CarbonTeam | "CONTESTED" | "NEUTRAL";
  coreProg: number;
  scores: { CYAN: number; CRIMSON: number };
  units: Array<{
    i: string;
    n: string;
    b: 0 | 1;
    ar: CarbonBotArchetype;
    tm: CarbonTeam;
    c: number;
    x: number;
    y: number;
    z: number;
    yw: number;
    hp: number;
    mhp: number;
    sh: number;
    msh: number;
    al: 0 | 1;
    ra: number;
    w: CarbonWeaponId;
    sw: CarbonWeaponId | null;
    k: number;
    d: number;
    sc: number;
    st: number;
    od: number;
  }>;
  pads: Array<{
    i: string;
    a: 0 | 1;
  }>;
  winnerSummaryAr?: string | null;
}

export const STRIKER_PALETTE: number[] = [
  0x22d3ee, // Electric Cyan
  0xf43f5e, // Hyper Crimson
  0xa855f7, // Neon Violet
  0xf59e0b, // Solar Gold
  0x10b981, // Cyber Emerald
  0x3b82f6, // Cobalt Pulse
  0xec4899, // Magenta Laser
  0x84cc16, // Volt Lime
];
