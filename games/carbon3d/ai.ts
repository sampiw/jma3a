import {
  ARENA_BUSHES,
  ARENA_JUMP_PADS,
  ARENA_SPAWN_POINTS,
  EYE_HEIGHT,
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
  "CYBER-VEX 🤖",
  "NOVA-9 🤖",
  "KRONOS 🤖",
  "SPECTRE 🤖",
  "VALKYRIE 🤖",
  "ZERO-X 🤖",
  "ORION 🤖",
];

export interface BotRuntimeMemory {
  strafeSign: number;
  nextStrafeFlipAt: number;
  lastShotAt: number;
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

  // In Solo (1 human), ALWAYS spawn bots even if botFill was toggled off so Solo works immediately!
  if (!botFill && humanPlayersCount >= 2) return [];

  const desiredTotal = mode === "SQUAD" ? Math.max(6, humanPlayersCount + (humanPlayersCount % 2)) : Math.max(6, humanPlayersCount);
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
          ? 0x22d3ee
          : 0xf43f5e
        : STRIKER_PALETTE[slotIdx % STRIKER_PALETTE.length];

    const weaponsPool: CarbonWeaponId[] = ["CARBINE", "SHOTGUN", "CARBINE", "LOBBER", "RAILGUN"];
    const startWeapon = weaponsPool[i % weaponsPool.length];

    bots.push({
      id: `bot_${i + 1}`,
      nickname: BOT_CALLSIGNS[i % BOT_CALLSIGNS.length],
      isBot: true,
      archetype: "STRIKER",
      team,
      accentHex,
      x: sp.x + (i % 2 === 0 ? -1.1 : 1.1),
      y: sp.y,
      z: sp.z,
      yaw: sp.yaw,
      pitch: 0,
      hp: 100,
      maxHp: 100,
      shield: 60,
      maxShield: 60,
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
 * Spawns a wave of Cyber-Survival AI enemies (Drones, Enforcers, Snipers, and Every-3rd-Wave Goliath Mech Boss!)
 */
export function createSurvivalWaveBots(wave: number, humanCount: number): CarbonCombatant[] {
  const isBossWave = wave % 3 === 0;
  const baseCount = Math.min(7, 3 + Math.floor(wave * 0.8) + Math.floor(humanCount * 0.5));
  const crimsonSpawns = ARENA_SPAWN_POINTS.filter((s) => s.team === "CRIMSON");
  const enemies: CarbonCombatant[] = [];

  for (let i = 0; i < baseCount; i++) {
    const sp = crimsonSpawns[i % crimsonSpawns.length];
    const jitterAngle = (i / baseCount) * Math.PI * 2;
    const sx = sp.x + Math.cos(jitterAngle) * 2.2;
    const sz = sp.z + Math.sin(jitterAngle) * 1.6;

    let archetype: CarbonBotArchetype = "DRONE";
    let name = `درون استطلاع W${wave}`;
    let maxHp = 70 + wave * 10;
    let maxShield = 20 + wave * 5;
    let weapon: CarbonWeaponId = "CARBINE";
    let accentHex = 0xf43f5e;

    if (isBossWave && i === 0) {
      archetype = "BOSS_MECH";
      name = `⚡ العملاق المدرع GOLIATH-${wave}`;
      maxHp = 340 + wave * 65 + humanCount * 55;
      maxShield = 160 + wave * 25;
      weapon = wave % 6 === 0 ? "LOBBER" : "SHOTGUN";
      accentHex = 0xf59e0b;
    } else if (i % 4 === 1 && wave >= 2) {
      archetype = "ENFORCER";
      name = `مدرع الصدمة #${i + 1}`;
      maxHp = 115 + wave * 14;
      maxShield = 65 + wave * 8;
      weapon = "SHOTGUN";
      accentHex = 0xfb923c;
    } else if (i % 4 === 2 && wave >= 2) {
      archetype = "SNIPER";
      name = `قناص الليزر #${i + 1}`;
      maxHp = 80 + wave * 10;
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
      y: archetype === "DRONE" ? 0.55 : 0,
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

/**
 * Advances all AI units on the Host Arbiter by `dt` seconds and returns any shots fired by bots.
 */
export function stepArenaBots(
  combatants: Record<string, CarbonCombatant>,
  pickups: CarbonPickupPad[],
  memoryMap: Map<string, BotRuntimeMemory>,
  mode: CarbonMode,
  difficulty: "NORMAL" | "HARD" | "CARBON",
  now: number,
  dt: number,
  looseGems: CarbonGemDrop[] = []
): CarbonShotPacket[] {
  const shots: CarbonShotPacket[] = [];
  const allUnits = Object.values(combatants);

  const fireCadenceMult = difficulty === "CARBON" ? 0.95 : difficulty === "HARD" ? 1.15 : 1.42;
  const aimJitter = difficulty === "CARBON" ? 0.035 : difficulty === "HARD" ? 0.068 : 0.11;
  const moveSpeedBase = difficulty === "CARBON" ? 6.9 : difficulty === "HARD" ? 6.2 : 5.5;

  for (const bot of allUnits) {
    if (!bot.isBot || !bot.isAlive) continue;

    let mem = memoryMap.get(bot.id);
    if (!mem) {
      mem = {
        strafeSign: Math.random() < 0.5 ? 1 : -1,
        nextStrafeFlipAt: now + 1200 + Math.random() * 1400,
        lastShotAt: now - Math.random() * 500,
        velY: 0,
        targetPadId: null,
      };
      memoryMap.set(bot.id, mem);
    }

    if (now >= mem.nextStrafeFlipAt) {
      mem.strafeSign *= -1;
      mem.nextStrafeFlipAt = now + 1100 + Math.random() * 1600;
    }

    // Find highest-priority visible living enemy (ignore bush-stealthed enemies > 3.8m away!)
    let closestEnemy: CarbonCombatant | null = null;
    let closestDist = Infinity;
    let bestTargetScore = Infinity;

    for (const other of allUnits) {
      if (!other.isAlive || !isHostile(bot, other, mode)) continue;
      const d = Math.hypot(other.x - bot.x, other.z - bot.z);
      if (isStealthedInBush(other, now) && d > 3.8) continue;

      // Focus enemy gem carriers holding 6+ gems!
      const priorityDist = (other.gems || 0) >= 8 ? d * 0.58 : (other.gems || 0) >= 5 ? d * 0.78 : d;
      if (priorityDist < bestTargetScore) {
        bestTargetScore = priorityDist;
        closestDist = d;
        closestEnemy = other;
      }
    }

    // Decide desired objective point (Loose Gems > Shield Pads > Central Gem Mine)
    let goalX = 0;
    let goalZ = 0;
    let nearestGem: CarbonGemDrop | null = null;
    let nearestGemDist = Infinity;
    if (mode !== "SURVIVAL" && looseGems.length > 0) {
      for (const gm of looseGems) {
        const gd = Math.hypot(gm.x - bot.x, gm.z - bot.z);
        if (gd < nearestGemDist) {
          nearestGemDist = gd;
          nearestGem = gm;
        }
      }
    }

    const spec = CARBON_WEAPONS[bot.weapon];
    const speed =
      bot.archetype === "DRONE"
        ? moveSpeedBase * 1.18
        : bot.archetype === "BOSS_MECH"
        ? moveSpeedBase * 0.78
        : moveSpeedBase;

    const botGems = bot.gems || 0;

    if (botGems >= 9 && mode !== "SURVIVAL") {
      // Carrying game-winning gems -> sneak into nearest Tall Grass Stealth Bush!
      let bestBush = ARENA_BUSHES[0];
      let bestBushD = Infinity;
      for (const b of ARENA_BUSHES) {
        const bd = Math.hypot(b.x - bot.x, b.z - bot.z);
        if (bd < bestBushD) {
          bestBushD = bd;
          bestBush = b;
        }
      }
      goalX = bestBush.x;
      goalZ = bestBush.z;
    } else if (nearestGem && nearestGemDist < 16) {
      goalX = nearestGem.x;
      goalZ = nearestGem.z;
    } else if (bot.shield < 25 || !closestEnemy || closestDist > 22) {
      const freePad = pickups.find(
        (p) =>
          p.available &&
          Math.hypot(p.x - bot.x, p.z - bot.z) < 13 &&
          (bot.shield < 30 ? p.kind === "SHIELD_CELL" : true)
      );
      if (freePad) {
        goalX = freePad.x;
        goalZ = freePad.z;
      }
    }

    let vx = 0;
    let vz = 0;

    if (closestEnemy) {
      const toEx = closestEnemy.x - bot.x;
      const toEz = closestEnemy.z - bot.z;
      const len = Math.max(0.001, Math.hypot(toEx, toEz));
      const dirX = toEx / len;
      const dirZ = toEz / len;
      const perpX = -dirZ * mem.strafeSign;
      const perpZ = dirX * mem.strafeSign;

      // Preferred combat range per weapon
      const idealRange =
        bot.weapon === "SHOTGUN"
          ? 6.5
          : bot.weapon === "RAILGUN"
          ? 20.0
          : bot.weapon === "LOBBER"
          ? 14.0
          : 13.5;

      let radialPush = 0;
      if (closestDist > idealRange + 2.5) radialPush = 0.85;
      else if (closestDist < idealRange - 2.5) radialPush = -0.65;
      if ((bot.hp < 40 || botGems >= 9) && bot.archetype !== "BOSS_MECH") radialPush = -0.85;

      // Pull strongly toward loose gems or defensive bush!
      let objPullX = 0;
      let objPullZ = 0;
      if (nearestGem && nearestGemDist < 9.5 && botGems < 10 && bot.hp > 45) {
        const gx = nearestGem.x - bot.x;
        const gz = nearestGem.z - bot.z;
        const gl = Math.max(0.1, Math.hypot(gx, gz));
        objPullX = (gx / gl) * 0.95;
        objPullZ = (gz / gl) * 0.95;
      } else if (botGems >= 9) {
        const gx = goalX - bot.x;
        const gz = goalZ - bot.z;
        const gl = Math.max(0.1, Math.hypot(gx, gz));
        if (gl > 1.2) {
          objPullX = (gx / gl) * 0.85;
          objPullZ = (gz / gl) * 0.85;
        }
      } else if (mode !== "SURVIVAL" && Math.hypot(bot.x, bot.z) > 8.5) {
        objPullX = -bot.x * 0.035;
        objPullZ = -bot.z * 0.035;
      }

      vx = (dirX * radialPush + perpX * 0.72 + objPullX) * speed;
      vz = (dirZ * radialPush + perpZ * 0.72 + objPullZ) * speed;

      // Smoothly aim toward enemy
      const desiredYaw = Math.atan2(toEx, toEz);
      bot.yaw = desiredYaw;
      const dyEye = closestEnemy.y + 1.15 - (bot.y + EYE_HEIGHT);
      bot.pitch = Math.atan2(dyEye, Math.max(1, closestDist));

      // Check Line-of-Sight & Fire if ready
      const fireInterval = spec.fireIntervalMs * fireCadenceMult;
      if (closestDist <= spec.range && now - mem.lastShotAt >= fireInterval) {
        const inv3d = 1 / Math.max(0.01, Math.hypot(toEx, dyEye, toEz));
        const rdx = toEx * inv3d;
        const rdy = dyEye * inv3d;
        const rdz = toEz * inv3d;
        const wallHit = raycastArenaWorld(
          bot.x,
          bot.y + EYE_HEIGHT * 0.9,
          bot.z,
          rdx,
          rdy,
          rdz,
          closestDist - 0.55
        );

        if (!wallHit) {
          mem.lastShotAt = now;
          bot.lastFiredAt = now;
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
            ox: bot.x + Math.sin(bot.yaw) * 0.65,
            oy: bot.y + (bot.archetype === "BOSS_MECH" ? 1.95 : 1.28),
            oz: bot.z + Math.cos(bot.yaw) * 0.65,
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
      if (gLen > 1.0) {
        vx = (toGx / gLen) * speed * 0.8;
        vz = (toGz / gLen) * speed * 0.8;
        bot.yaw = Math.atan2(vx, vz);
      }
    }

    // Apply movement & gravity/jump-pads
    const nextPos = resolveArenaMovement(bot.x + vx * dt, bot.y, bot.z + vz * dt);
    bot.x = nextPos.x;
    bot.z = nextPos.z;

    for (const jpad of ARENA_JUMP_PADS) {
      if (Math.hypot(bot.x - jpad.x, bot.z - jpad.z) < jpad.radius && bot.y < 0.35) {
        mem.velY = jpad.launchVy * 0.85;
      }
    }

    const floorY =
      sampleArenaGroundHeight(bot.x, bot.z, bot.y) + (bot.archetype === "DRONE" ? 0.55 : 0);
    if (bot.y > floorY || mem.velY > 0) {
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
