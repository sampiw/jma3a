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
  projectileSpeed: number; // 0 = instant hitscan supersonic round
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
    nameEn: "M4A1 Tactical Carbine",
    nameAr: "رشاش M4 التكتيكي",
    fireIntervalMs: 118,
    damage: 22,
    critMultiplier: 1.45,
    pellets: 1,
    spreadRad: 0.017,
    range: 82,
    projectileSpeed: 94,
    splashRadius: 0,
    bounces: 0,
    knockback: 1.0,
    magSize: 30,
    reloadMs: 1500,
    colorHex: 0x38bdf8,
    badgeColor: "text-sky-300 border-sky-400/50 bg-sky-950/70",
  },
  SHOTGUN: {
    id: "SHOTGUN",
    nameEn: "M870 Breacher",
    nameAr: "شوتغن الاقتحام M870",
    fireIntervalMs: 700,
    damage: 14,
    critMultiplier: 1.35,
    pellets: 7,
    spreadRad: 0.086,
    range: 25,
    projectileSpeed: 76,
    splashRadius: 0,
    bounces: 0,
    knockback: 6.2,
    magSize: 8,
    reloadMs: 1750,
    colorHex: 0xfb923c,
    badgeColor: "text-amber-300 border-amber-400/50 bg-amber-950/70",
  },
  RAILGUN: {
    id: "RAILGUN",
    nameEn: "AWP Atlas Sniper",
    nameAr: "قناص الأطلس AWP",
    fireIntervalMs: 1080,
    damage: 85,
    critMultiplier: 1.95, // 166 headshot damage = instant 1-shot headshot!
    pellets: 1,
    spreadRad: 0.0025,
    range: 125,
    projectileSpeed: 0, // Instant supersonic sniper round
    splashRadius: 0,
    bounces: 0,
    knockback: 4.2,
    magSize: 5,
    reloadMs: 1950,
    colorHex: 0xf43f5e,
    badgeColor: "text-rose-300 border-rose-400/50 bg-rose-950/70",
  },
  LOBBER: {
    id: "LOBBER",
    nameEn: "M32 Rotary Launcher",
    nameAr: "قاذف القنابل M32",
    fireIntervalMs: 800,
    damage: 62,
    critMultiplier: 1.15,
    pellets: 1,
    spreadRad: 0.015,
    range: 62,
    projectileSpeed: 38,
    splashRadius: 4.5,
    bounces: 1,
    knockback: 6.5,
    magSize: 6,
    reloadMs: 2000,
    colorHex: 0xc084fc,
    badgeColor: "text-purple-300 border-purple-400/50 bg-purple-950/70",
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
  gems: number; // Tactical Airdrop / Intel points
  score: number;
  streak: number;
  overdriveUntil: number;
  lastDamagedAt: number;
  lastFiredAt?: number;
}

/** Golden Tactical Supply Drop / Intel Crate */
export interface CarbonGemDrop {
  id: string;
  x: number;
  y?: number;
  z: number;
  spawnedAt: number;
}

/** Shootable Red Hazard Explosive Barrel */
export interface CarbonBarrelState {
  id: string;
  x: number;
  y: number;
  z: number;
  hp: number;
  alive: boolean;
  respawnAt: number;
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

export type CarbonDamageSource = CarbonWeaponId | "GRENADE" | "BARREL";

export interface CarbonKillFeedEntry {
  id: string;
  killerName: string;
  victimName: string;
  weapon: CarbonDamageSource;
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
  hardpointIndex?: number;
  coreOwner: CarbonTeam | "CONTESTED" | "NEUTRAL";
  coreProgress: number; // -100 (CRIMSON) .. +100 (CYAN)
  teamScores: {
    CYAN: number;
    CRIMSON: number;
  };
  combatants: Record<string, CarbonCombatant>;
  pickups: CarbonPickupPad[];
  barrels?: CarbonBarrelState[];
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
      barrels?: CarbonBarrelState[];
      hardpointIndex?: number;
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
// Ultra-compact Realtime Relay Packets (Upstash Redis 11Hz Live Channel)
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
  d?: number; // dashing/rolling flag (1 = rolling)
  ab?: number; // airborne flag
  sp?: number; // sprinting flag
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
  weapon: CarbonDamageSource;
  damage: number;
  isCrit: boolean;
  hx: number;
  hy: number;
  hz: number;
  kx: number;
  kz: number;
}

export interface CarbonBarrelHitPacket {
  shooterId: string;
  barrelId: string;
  damage: number;
}

export interface CarbonBarrelExplodePacket {
  barrelId: string;
  shooterId: string;
  x: number;
  y: number;
  z: number;
}

export interface CarbonKillEventPacket {
  id: string;
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  weapon: CarbonDamageSource;
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
  hpIdx?: number;
  coreOwner: CarbonTeam | "CONTESTED" | "NEUTRAL";
  coreProg: number;
  scores: { CYAN: number; CRIMSON: number };
  cdEnd?: number;
  cdWho?: string | null;
  gems?: Array<{
    i: string;
    x: number;
    y?: number;
    z: number;
  }>;
  barrels?: Array<{
    i: string;
    a: 0 | 1;
  }>;
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
    pt?: number;
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
    gm?: number;
    lf?: number;
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
  0x38bdf8, // Tactical Sky Cyan
  0xf43f5e, // Crimson OpFor
  0x10b981, // Ranger Emerald
  0xf59e0b, // Desert Gold
  0xa855f7, // Spec-Ops Violet
  0x3b82f6, // Navy Taskforce
  0xf97316, // Hazard Amber
  0x84cc16, // Recon Lime
];
