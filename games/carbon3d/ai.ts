import {
  ARENA_SPAWN_POINTS,
  EYE_HEIGHT,
  HARDPOINT_ZONES,
  isInsideArenaBush,
  raycastArenaWorld,
  resolveArenaMovement,
  sampleArenaGroundHeight,
} from "./arenaLayout";
import {
  CARBON_WEAPONS,
  CarbonBotArchetype,
  CarbonCombatant,
  CarbonGemDrop,
  CarbonMode,
  CarbonPickupPad,
  CarbonShotPacket,
  CarbonTeam,
  CarbonWeaponId,
  STRIKER_PALETTE,
} from "./types";

const BOT_CALLSIGNS = [
  "GHOST-1 🪖",
  "VIPER-2 🪖",
  "FALCON-3 🪖",
  "SHADOW-4 🪖",
  "ATLAS-5 🪖",
  "DELTA-6 🪖",
  "RECON-7 🪖",
];

export interface BotRuntimeMemory {
  strafeSign: number;
  nextStrafeFlipAt: number;
  lastShotAt: number;
  burstLeft: number;
  burstPauseUntil: number;
  velY: number;
  targetPadId: string | null;
}

export function createArenaBots(
  humanPlayersCount: number,
  mode: CarbonMode,
  botFill: boolean
): CarbonCombatant[] {
  if (mode === "SURVIVAL") {
    return createSurvivalWaveBots(1, Math.max(1, humanPlayersCount));
  }

  // Smart Bot Policy:
  // - 1 player (Solo): ALWAYS spawn 4 tactical Spec-Ops AI opponents so Solo is immediately exciting!
  // - 2+ real players (PC + Phone / Squad): Pure human PvP unless Host explicitly toggled botFill ON!
  if (!botFill && humanPlayersCount >= 2) return [];

  const desiredTotal =
    mode === "SQUAD"
      ? Math.max(6, humanPlayersCount + (humanPlayersCount % 2))
      : humanPlayersCount <= 1
      ? 5
      : Math.max(6, humanPlayersCount);
  const botCount = Math.min(8 - humanPlayersCount, Math.max(0, desiredTotal - humanPlayersCount));
  const bots: CarbonCombatant[] = [];

  for (let i = 0; i < botCount; i++) {
    const slotIdx = humanPlayersCount + i;
    const team: CarbonTeam =
      mode === "SQUAD" ? (slotIdx % 2 === 0 ? "CYAN" : "CRIMSON") : "SOLO";
    const teamSpawns =
      mode === "SQUAD"
        ? ARENA_SPAWN_POINTS.filter((s) => s.team === team)
        : ARENA_SPAWN_POINTS;
    const sp = teamSpawns[slotIdx % teamSpawns.length];
    const accentHex =
      mode === "SQUAD"
        ? team === "CYAN"
          ? 0x38bdf8
          : 0xf43f5e
        : STRIKER_PALETTE[slotIdx % STRIKER_PALETTE.length];

    const weaponsPool: CarbonWeaponId[] = ["CARBINE", "SHOTGUN", "CARBINE", "RAILGUN", "LOBBER"];
    const startWeapon = weaponsPool[i % weaponsPool.length];

    bots.push({
      id: `bot_${i + 1}`,
      nickname: BOT_CALLSIGNS[i % BOT_CALLSIGNS.length],
      isBot: true,
      archetype: "STRIKER",
      team,
      accentHex,
      x: sp.x + (i % 2 === 0 ? -1.4 : 1.4),
      y: sp.y,
      z: sp.z,
      yaw: sp.yaw,
      pitch: 0,
      hp: 100,
      maxHp: 100,
      shield: 50,
      maxShield: 50,
      isAlive: true,
      respawnAt: 0,
      weapon: startWeapon,
      secondaryWeapon: "CARBINE",
      kills: 0,
      deaths: 0,
      assists: 0,
      gems: 0,
      score: 0,
      streak: 0,
      overdriveUntil: 0,
      lastDamagedAt: 0,
      lastFiredAt: 0,
    });
  }

  return bots;
}

/**
 * Spawns a wave of Spec-Ops Commando AI enemies (Scouts, Heavy Breachers, Snipers, and Every-3rd-Wave Juggernaut Boss!)
 */
export function createSurvivalWaveBots(wave: number, humanCount: number): CarbonCombatant[] {
  const isBossWave = wave % 3 === 0;
  const baseCount = Math.min(7, 3 + Math.floor(wave * 0.8) + Math.floor(humanCount * 0.5));
  const crimsonSpawns = ARENA_SPAWN_POINTS.filter((s) => s.team === "CRIMSON");
  const enemies: CarbonCombatant[] = [];

  for (let i = 0; i < baseCount; i++) {
    const sp = crimsonSpawns[i % crimsonSpawns.length];
    const jitterAngle = (i / baseCount) * Math.PI * 2;
    const sx = sp.x + Math.cos(jitterAngle) * 2.5;
    const sz = sp.z + Math.sin(jitterAngle) * 2.0;

    let archetype: CarbonBotArchetype = "STRIKER";
    let name = `مغاوير الاقتحام W${wave}`;
    let maxHp = 85 + wave * 10;
    let maxShield = 25 + wave * 5;
    let weapon: CarbonWeaponId = "CARBINE";
    let accentHex = 0xf43f5e;

    if (isBossWave && i === 0) {
      archetype = "BOSS_MECH";
      name = `🔥 المدرع القائد JUGGERNAUT-${wave}`;
      maxHp = 360 + wave * 70 + humanCount * 60;
      maxShield = 150 + wave * 25;
      weapon = wave % 6 === 0 ? "LOBBER" : "SHOTGUN";
      accentHex = 0xf59e0b;
    } else if (i % 4 === 1 && wave >= 2) {
      archetype = "ENFORCER";
      name = `مقتحم مدرع #${i + 1}`;
      maxHp = 120 + wave * 14;
      maxShield = 60 + wave * 8;
      weapon = "SHOTGUN";
      accentHex = 0xfb923c;
    } else if (i % 4 === 2 && wave >= 2) {
      archetype = "SNIPER";
      name = `قناص الأطلس #${i + 1}`;
      maxHp = 85 + wave * 10;
      maxShield = 35 + wave * 6;
      weapon = "RAILGUN";
      accentHex = 0xc084fc;
    }

    enemies.push({
      id: `surv_w${wave}_${i}`,
      nickname: name,
      isBot: true,
      archetype,
      team: "CRIMSON",
      accentHex,
      x: sx,
      y: 0,
      z: sz,
      yaw: Math.PI,
      pitch: 0,
      hp: maxHp,
      maxHp,
      shield: maxShield,
      maxShield,
      isAlive: true,
      respawnAt: 0,
      weapon,
      secondaryWeapon: "CARBINE",
      kills: 0,
      deaths: 0,
      assists: 0,
      gems: 0,
      score: 0,
      streak: 0,
      overdriveUntil: archetype === "BOSS_MECH" ? Date.now() + 999_999 : 0,
      lastDamagedAt: 0,
      lastFiredAt: 0,
    });
  }

  return enemies;
}

export function isHostile(a: CarbonCombatant, b: CarbonCombatant, mode: CarbonMode): boolean {
  if (a.id === b.id) return false;
  if (mode === "FFA") return true;
  return a.team !== b.team;
}

export function isStealthedInBush(unit: CarbonCombatant, now: number): boolean {
  return (
    isInsideArenaBush(unit.x, unit.z) &&
    now - (unit.lastFiredAt || 0) > 900 &&
    now - (unit.lastDamagedAt || 0) > 900
  );
}

const HELIPAD_RAMP_ENTRIES = [
  { x: 0, z: -18.0 },
  { x: 0, z: 18.0 },
  { x: -18.0, z: 0 },
  { x: 18.0, z: 0 },
];

/**
 * Advances all Tactical Spec-Ops AI soldiers on the Host Arbiter by `dt` seconds.
 */
export function stepArenaBots(
  combatants: Record<string, CarbonCombatant>,
  pickups: CarbonPickupPad[],
  memoryMap: Map<string, BotRuntimeMemory>,
  mode: CarbonMode,
  difficulty: "NORMAL" | "HARD" | "CARBON",
  now: number,
  dt: number,
  looseAirdrops: CarbonGemDrop[] = [],
  hardpointIndex = 0
): CarbonShotPacket[] {
  const shots: CarbonShotPacket[] = [];
  const allUnits = Object.values(combatants);

  const fireCadenceMult = difficulty === "CARBON" ? 1.05 : difficulty === "HARD" ? 1.28 : 1.65;
  const aimJitter = difficulty === "CARBON" ? 0.032 : difficulty === "HARD" ? 0.062 : 0.1;
  const moveSpeedBase = difficulty === "CARBON" ? 6.9 : difficulty === "HARD" ? 6.2 : 5.4;

  const activeHp = HARDPOINT_ZONES[hardpointIndex % HARDPOINT_ZONES.length] || HARDPOINT_ZONES[0];

  for (const bot of allUnits) {
    if (!bot.isBot || !bot.isAlive) continue;

    let mem = memoryMap.get(bot.id);
    if (!mem) {
      mem = {
        strafeSign: Math.random() < 0.5 ? 1 : -1,
        nextStrafeFlipAt: now + 1400 + Math.random() * 1600,
        lastShotAt: now - Math.random() * 500,
        burstLeft: 4 + Math.floor(Math.random() * 4),
        burstPauseUntil: 0,
        velY: 0,
        targetPadId: null,
      };
      memoryMap.set(bot.id, mem);
    }

    if (now >= mem.nextStrafeFlipAt) {
      mem.strafeSign *= -1;
      mem.nextStrafeFlipAt = now + 1300 + Math.random() * 1800;
    }

    // Find closest / highest-priority hostile target
    let closestEnemy: CarbonCombatant | null = null;
    let closestDist = Infinity;

    for (const other of allUnits) {
      if (!other.isAlive || !isHostile(bot, other, mode)) continue;
      const d = Math.hypot(other.x - bot.x, other.z - bot.z);
      if (d < closestDist) {
        closestDist = d;
        closestEnemy = other;
      }
    }

    // Determine tactical goal (Airdrop Crate > Low-Armor Station > Active Hardpoint)
    let goalX = activeHp.x;
    let goalY = activeHp.y;
    let goalZ = activeHp.z;

    if (mode !== "SURVIVAL" && looseAirdrops.length > 0) {
      let bestDrop: CarbonGemDrop | null = null;
      let bestDropD = 22;
      for (const dr of looseAirdrops) {
        const dd = Math.hypot(dr.x - bot.x, dr.z - bot.z);
        if (dd < bestDropD) {
          bestDropD = dd;
          bestDrop = dr;
        }
      }
      if (bestDrop) {
        goalX = bestDrop.x;
        goalY = bestDrop.y ?? 0;
        goalZ = bestDrop.z;
      }
    }

    if (bot.shield < 20 || bot.hp < 65) {
      const freeArmor = pickups.find(
        (p) =>
          p.available &&
          p.kind === "SHIELD_CELL" &&
          Math.hypot(p.x - bot.x, p.z - bot.z) < 22
      );
      if (freeArmor) {
        goalX = freeArmor.x;
        goalY = freeArmor.y;
        goalZ = freeArmor.z;
      }
    }

    // Smart Ramp Routing when goal is on elevated Helipad (y >= 1.5m) and bot is on ground!
    if (goalY > 1.0 && bot.y < 0.9 && Math.abs(goalX) < 12.6 && Math.abs(goalZ) < 12.6) {
      const alignedWithNS = Math.abs(bot.x) <= 2.6 && Math.abs(bot.z) >= 11.8;
      const alignedWithEW = Math.abs(bot.z) <= 2.6 && Math.abs(bot.x) >= 11.8;
      if (!alignedWithNS && !alignedWithEW) {
        let bestRamp = HELIPAD_RAMP_ENTRIES[0];
        let bestRampD = Infinity;
        for (const re of HELIPAD_RAMP_ENTRIES) {
          const rd = Math.hypot(re.x - bot.x, re.z - bot.z);
          if (rd < bestRampD) {
            bestRampD = rd;
            bestRamp = re;
          }
        }
        goalX = bestRamp.x;
        goalZ = bestRamp.z;
      }
    }

    const spec = CARBON_WEAPONS[bot.weapon];
    const speed =
      bot.archetype === "BOSS_MECH"
        ? moveSpeedBase * 0.82
        : moveSpeedBase;

    let vx = 0;
    let vz = 0;

    if (closestEnemy && closestDist < 78) {
      const toEx = closestEnemy.x - bot.x;
      const toEz = closestEnemy.z - bot.z;
      const len = Math.max(0.001, Math.hypot(toEx, toEz));
      const dirX = toEx / len;
      const dirZ = toEz / len;
      const perpX = -dirZ * mem.strafeSign;
      const perpZ = dirX * mem.strafeSign;

      const idealRange =
        bot.weapon === "SHOTGUN"
          ? 8.5
          : bot.weapon === "RAILGUN"
          ? 34.0
          : bot.weapon === "LOBBER"
          ? 20.0
          : 19.0;

      let radialPush = 0;
      if (closestDist > idealRange + 4.0) radialPush = 0.78;
      else if (closestDist < idealRange - 3.5) radialPush = -0.55;
      if (bot.hp < 35 && bot.archetype !== "BOSS_MECH") radialPush = -0.75;

      // Gentle pull toward active Hardpoint so fights cluster naturally around landmarks
      const toGoalX = goalX - bot.x;
      const toGoalZ = goalZ - bot.z;
      const goalDist = Math.hypot(toGoalX, toGoalZ);
      const objPullX = goalDist > 4.5 ? (toGoalX / goalDist) * 0.42 : 0;
      const objPullZ = goalDist > 4.5 ? (toGoalZ / goalDist) * 0.42 : 0;

      vx = (dirX * radialPush + perpX * 0.62 + objPullX) * speed;
      vz = (dirZ * radialPush + perpZ * 0.62 + objPullZ) * speed;

      const desiredYaw = Math.atan2(toEx, toEz);
      bot.yaw = desiredYaw;
      const dyEye = closestEnemy.y + 1.25 - (bot.y + EYE_HEIGHT);
      bot.pitch = Math.atan2(dyEye, Math.max(1, closestDist));

      // Tactical Burst-Fire Line-of-Sight Check
      const fireInterval = spec.fireIntervalMs * fireCadenceMult;
      if (
        closestDist <= spec.range &&
        now >= mem.burstPauseUntil &&
        now - mem.lastShotAt >= fireInterval
      ) {
        const inv3d = 1 / Math.max(0.01, Math.hypot(toEx, dyEye, toEz));
        const rdx = toEx * inv3d;
        const rdy = dyEye * inv3d;
        const rdz = toEz * inv3d;
        const wallHit = raycastArenaWorld(
          bot.x,
          bot.y + EYE_HEIGHT * 0.92,
          bot.z,
          rdx,
          rdy,
          rdz,
          closestDist - 0.6
        );

        if (!wallHit) {
          mem.lastShotAt = now;
          bot.lastFiredAt = now;
          mem.burstLeft -= 1;
          if (mem.burstLeft <= 0) {
            mem.burstLeft = bot.weapon === "CARBINE" ? 4 + Math.floor(Math.random() * 4) : 2;
            mem.burstPauseUntil = now + (difficulty === "CARBON" ? 380 : 620);
          }

          const jitterYaw = (Math.random() - 0.5) * 2 * aimJitter;
          const jitterPitch = (Math.random() - 0.5) * aimJitter;
          const cosP = Math.cos(bot.pitch + jitterPitch);
          const sdx = Math.sin(bot.yaw + jitterYaw) * cosP;
          const sdy = Math.sin(bot.pitch + jitterPitch);
          const sdz = Math.cos(bot.yaw + jitterYaw) * cosP;

          shots.push({
            id: `bshot_${bot.id}_${now.toString(36)}`,
            shooterId: bot.id,
            weapon: bot.weapon,
            ox: bot.x + Math.sin(bot.yaw) * 0.62,
            oy: bot.y + (bot.archetype === "BOSS_MECH" ? 1.85 : 1.38),
            oz: bot.z + Math.cos(bot.yaw) * 0.62,
            dx: sdx,
            dy: sdy,
            dz: sdz,
            overdrive: bot.overdriveUntil > now,
          });
        }
      }
    } else {
      const toGx = goalX - bot.x;
      const toGz = goalZ - bot.z;
      const gLen = Math.hypot(toGx, toGz);
      if (gLen > 1.2) {
        vx = (toGx / gLen) * speed * 0.92;
        vz = (toGz / gLen) * speed * 0.92;
        bot.yaw = Math.atan2(vx, vz);
      }
    }

    const vMag = Math.hypot(vx, vz);
    if (vMag > speed) {
      vx = (vx / vMag) * speed;
      vz = (vz / vMag) * speed;
    }

    const nextPos = resolveArenaMovement(bot.x + vx * dt, bot.y, bot.z + vz * dt);
    bot.x = nextPos.x;
    bot.z = nextPos.z;

    const floorY = sampleArenaGroundHeight(bot.x, bot.z, bot.y);
    if (floorY > bot.y) {
      bot.y = floorY;
      mem.velY = 0;
    } else if (bot.y > floorY || mem.velY > 0) {
      mem.velY -= 24 * dt;
      bot.y += mem.velY * dt;
      if (bot.y <= floorY) {
        bot.y = floorY;
        mem.velY = 0;
      }
    } else {
      bot.y = floorY;
    }
  }

  return shots;
}
