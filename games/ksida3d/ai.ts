import {
  CarKinematicsState,
  createInitialCarKinematics,
  normalizeAngle,
  resolveCarVsCarCollision,
  stepCarKinematics,
} from "./physics";
import {
  getSpawnSlots,
  TRACK_POLYLINE,
  TRACK_SAMPLES,
  updateRaceCheckpointAndProgress,
} from "./trackLayout";
import {
  KSIDA_TAUNT_ORDER,
  KSIDA_VEHICLES,
  KsidaCratePad,
  KsidaItemFirePacket,
  KsidaMode,
  KsidaRacer,
  KsidaTauntId,
  KsidaVehicleId,
  RACER_ACCENT_PALETTE,
} from "./types";

interface BotPersona {
  nickname: string;
  vehicle: KsidaVehicleId;
  aggression: number; // 0.5..1.2
  laneBias: number; // -4..+4m
}

const MOROCCAN_BOT_PERSONAS: BotPersona[] = [
  { nickname: "الشيفور حميد 🚕", vehicle: "TAXI_HMER", aggression: 1.0, laneBias: -2.6 },
  { nickname: "عمي الحاج 240 🚘", vehicle: "MERCEDES_240", aggression: 1.15, laneBias: 2.8 },
  { nickname: "ولد الدرب C15 🚐", vehicle: "C15_KHATTAF", aggression: 1.2, laneBias: -1.2 },
  { nickname: "مول التريبورتور 🛺", vehicle: "TRIPORTEUR", aggression: 0.95, laneBias: 3.4 },
  { nickname: "المتعلم منير ⚠️", vehicle: "LOGAN_ECOLE", aggression: 0.88, laneBias: 0.5 },
  { nickname: "خالتي زهرة 🩴", vehicle: "TAXI_HMER", aggression: 1.1, laneBias: -3.5 },
  { nickname: "كبور الخطّاف 🔥", vehicle: "C15_KHATTAF", aggression: 1.05, laneBias: 1.9 },
];

export interface BotDriverMemory {
  kin: CarKinematicsState;
  splineCursor: number;
  laneOffset: number;
  nextItemUseAt: number;
  nextTauntAt: number;
  lastRamPairAt: Record<string, number>;
}

export function createKsidaBots(
  humanCount: number,
  mode: KsidaMode,
  botFill: boolean
): KsidaRacer[] {
  // Smart Bot Policy:
  // - Solo (1 human): automatically spawn 5 hilarious Moroccan bots (6 racers total!)
  // - 2+ humans: clean PvP unless botFill is enabled (fills up to 6 racers, max 8 total)
  const shouldSpawn = humanCount <= 1 || botFill;
  if (!shouldSpawn) return [];

  const targetTotal = Math.min(8, Math.max(humanCount + 1, 6));
  const botCount = Math.max(0, targetTotal - humanCount);
  const slots = getSpawnSlots(mode);
  const bots: KsidaRacer[] = [];

  for (let i = 0; i < botCount; i++) {
    const slotIdx = (humanCount + i) % slots.length;
    const sp = slots[slotIdx];
    const persona = MOROCCAN_BOT_PERSONAS[i % MOROCCAN_BOT_PERSONAS.length];
    const spec = KSIDA_VEHICLES[persona.vehicle];
    const accentHex = RACER_ACCENT_PALETTE[(humanCount + i) % RACER_ACCENT_PALETTE.length];

    bots.push({
      id: `bot_ksida_${i + 1}`,
      nickname: persona.nickname,
      isBot: true,
      vehicle: persona.vehicle,
      accentHex,
      x: sp.x,
      y: sp.y,
      z: sp.z,
      vx: 0,
      vz: 0,
      yaw: sp.yaw,
      speed: 0,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
      nitro: 60,
      isAlive: true,
      respawnAt: 0,
      heldItem: null,
      atayUntil: 0,
      spinUntil: 0,
      shieldUntil: Date.now() + 2000,
      lap: 1,
      nextCheckpoint: 1,
      trackProgress: 0,
      finishedAt: 0,
      score: 0,
      takedowns: 0,
      wrecksTaken: 0,
      wallHits: 0,
      driftScore: 0,
      streak: 0,
      lastDamagedBy: null,
      lastTauntId: null,
      lastTauntAt: 0,
    });
  }

  return bots;
}

export interface BotStepCallbacks {
  onBotFireItem: (pkt: KsidaItemFirePacket) => void;
  onBotRamHit: (
    attackerId: string,
    victimId: string,
    damage: number,
    ix: number,
    iz: number,
    spinMs: number,
    isTBone: boolean,
    hx: number,
    hz: number
  ) => void;
  onBotTaunt: (botId: string, nickname: string, tauntId: KsidaTauntId) => void;
}

export function stepKsidaBots(
  racers: Record<string, KsidaRacer>,
  crates: KsidaCratePad[],
  memMap: Map<string, BotDriverMemory>,
  mode: KsidaMode,
  crownHolderId: string | null,
  crownX: number,
  crownZ: number,
  hotBombHolderId: string | null,
  targetLaps: number,
  dt: number,
  now: number,
  cbs: BotStepCallbacks
): void {
  const allList = Object.values(racers);
  const aliveHumans = allList.filter((r) => !r.isBot && r.isAlive);
  const bestHumanProgress =
    aliveHumans.length > 0
      ? Math.max(...aliveHumans.map((h) => h.trackProgress))
      : 0;

  for (const bot of allList) {
    if (!bot.isBot) continue;

    let mem = memMap.get(bot.id);
    if (!mem) {
      const idxNum = Number(bot.id.replace(/\D+/g, "")) || 1;
      const persona = MOROCCAN_BOT_PERSONAS[(idxNum - 1) % MOROCCAN_BOT_PERSONAS.length];
      mem = {
        kin: createInitialCarKinematics(bot.x, bot.y, bot.z, bot.yaw, bot.nitro),
        splineCursor: 93,
        laneOffset: persona.laneBias,
        nextItemUseAt: now + 2800 + Math.random() * 2500,
        nextTauntAt: now + 6000 + Math.random() * 8000,
        lastRamPairAt: {},
      };
      memMap.set(bot.id, mem);
    }

    if (!bot.isAlive) {
      mem.kin.vx = 0;
      mem.kin.vz = 0;
      mem.kin.forwardSpeed = 0;
      continue;
    }

    // Sync external knockback / spinout applied to bot
    if (bot.spinUntil > now && mem.kin.spinTimer <= 0.05) {
      mem.kin.spinTimer = Math.min(1.1, (bot.spinUntil - now) / 1000);
    }

    // Determine AI target point (tx, tz)
    let targetX = 0;
    let targetZ = 0;
    let wantsNitro = false;

    if (mode === "RACE") {
      // Advance splineCursor when close
      let bestIdx = mem.splineCursor;
      let minD2 = Infinity;
      for (let step = -3; step <= 8; step++) {
        const idx = ((mem.splineCursor + step) % TRACK_SAMPLES + TRACK_SAMPLES) % TRACK_SAMPLES;
        const pt = TRACK_POLYLINE[idx];
        const d2 = (bot.x - pt.x) ** 2 + (bot.z - pt.z) ** 2;
        if (d2 < minD2) {
          minD2 = d2;
          bestIdx = idx;
        }
      }
      mem.splineCursor = bestIdx;

      const lookAhead = TRACK_POLYLINE[(bestIdx + 6) % TRACK_SAMPLES];
      targetX = lookAhead.x + lookAhead.nx * mem.laneOffset;
      targetZ = lookAhead.z + lookAhead.nz * mem.laneOffset;

      // Opportunistically grab nearby Mystery Crate
      if (!bot.heldItem) {
        for (const c of crates) {
          if (!c.available) continue;
          const dc = Math.hypot(c.x - bot.x, c.z - bot.z);
          if (dc < 13.5) {
            const fwdDot =
              Math.sin(bot.yaw) * ((c.x - bot.x) / (dc || 1)) +
              Math.cos(bot.yaw) * ((c.z - bot.z) / (dc || 1));
            if (fwdDot > 0.55) {
              targetX = c.x;
              targetZ = c.z;
              break;
            }
          }
        }
      }

      // Gentle rubber-banding so races stay thrillingly close!
      const gap = bestHumanProgress - bot.trackProgress;
      wantsNitro = gap > 0.16 && bot.nitro > 45;
    } else if (mode === "HOT_BOMB") {
      if (hotBombHolderId === bot.id) {
        // PANIC CHASE: ram nearest alive rival to pass the ticking Butagaz!
        let nearest: KsidaRacer | null = null;
        let bestD = Infinity;
        for (const other of allList) {
          if (other.id === bot.id || !other.isAlive) continue;
          const d = Math.hypot(other.x - bot.x, other.z - bot.z);
          if (d < bestD) {
            bestD = d;
            nearest = other;
          }
        }
        if (nearest) {
          targetX = nearest.x + nearest.vx * 0.28;
          targetZ = nearest.z + nearest.vz * 0.28;
        }
        wantsNitro = true;
      } else {
        // Evade bomb holder while skirmishing
        const bombHolder = hotBombHolderId ? racers[hotBombHolderId] : null;
        if (bombHolder && bombHolder.isAlive) {
          const dx = bot.x - bombHolder.x;
          const dz = bot.z - bombHolder.z;
          const d = Math.hypot(dx, dz) || 1;
          if (d < 18) {
            targetX = Math.max(-26, Math.min(26, bot.x + (dx / d) * 18 - dz * 0.4));
            targetZ = Math.max(-26, Math.min(26, bot.z + (dz / d) * 18 + dx * 0.4));
            wantsNitro = d < 10 && bot.nitro > 35;
          } else {
            targetX = Math.cos(now * 0.0007 + mem.laneOffset) * 18;
            targetZ = Math.sin(now * 0.0007 + mem.laneOffset) * 18;
          }
        }
      }
    } else {
      // DERBY Mode: chase Golden Tagine Crown or hunt Crown Holder / weakest rival!
      if (!crownHolderId) {
        targetX = crownX;
        targetZ = crownZ;
        wantsNitro = Math.hypot(crownX - bot.x, crownZ - bot.z) > 14 && bot.nitro > 60;
      } else if (crownHolderId === bot.id) {
        // Weave around stadium perimeter keeping speed high!
        const orbitAng = now * 0.0011 + (mem.laneOffset > 0 ? 0 : Math.PI);
        targetX = Math.cos(orbitAng) * 23;
        targetZ = Math.sin(orbitAng) * 23;
        wantsNitro = bot.nitro > 65;
      } else {
        const prey =
          racers[crownHolderId] && racers[crownHolderId].isAlive
            ? racers[crownHolderId]
            : allList.find((r) => r.id !== bot.id && r.isAlive) || null;
        if (prey) {
          targetX = prey.x + prey.vx * 0.25;
          targetZ = prey.z + prey.vz * 0.25;
          const distPrey = Math.hypot(prey.x - bot.x, prey.z - bot.z);
          wantsNitro = distPrey < 16 && distPrey > 4 && bot.nitro > 45;
        }
      }
    }

    const desiredYaw = Math.atan2(targetX - bot.x, targetZ - bot.z);
    const yawErr = normalizeAngle(desiredYaw - mem.kin.yaw);
    // Remember: steer = -1 turns Left (+yaw), steer = +1 turns Right (-yaw)
    const steerCmd = Math.max(-1, Math.min(1, -yawErr * 1.85));
    const sharpCorner = Math.abs(yawErr) > 0.44 && mem.kin.forwardSpeed > 15;

    let throttleCmd = bot.finishedAt > 0 ? 0.35 : 0.94;
    if (mode === "RACE" && aliveHumans.length > 0) {
      const gap = bot.trackProgress - bestHumanProgress;
      if (gap > 0.25) throttleCmd = 0.78; // Wait slightly so human can catch up and crash!
      else if (gap < -0.25) throttleCmd = 1.0;
    }

    const stepEv = stepCarKinematics(
      mem.kin,
      {
        throttle: throttleCmd,
        steer: steerCmd,
        driftHeld: sharpCorner,
        hopTap: false,
        nitroHeld: wantsNitro && Math.abs(yawErr) < 0.32,
        atayActive: bot.atayUntil > now,
      },
      bot.vehicle,
      mode,
      dt
    );

    if (stepEv.wallHitIntensity > 6) {
      bot.wallHits += 1;
    }
    if (stepEv.driftBoostReleasedStage > 0) {
      bot.driftScore += stepEv.driftBoostReleasedStage * 25;
      bot.score += stepEv.driftBoostReleasedStage * 5;
    }

    bot.x = Math.round(mem.kin.x * 100) / 100;
    bot.y = Math.round(mem.kin.y * 100) / 100;
    bot.z = Math.round(mem.kin.z * 100) / 100;
    bot.vx = Math.round(mem.kin.vx * 100) / 100;
    bot.vz = Math.round(mem.kin.vz * 100) / 100;
    bot.yaw = Math.round(mem.kin.yaw * 1000) / 1000;
    bot.speed = Math.round(mem.kin.forwardSpeed * 10) / 10;
    bot.nitro = Math.round(mem.kin.nitro);

    // Update RACE checkpoints & laps for bot
    if (mode === "RACE" && bot.finishedAt === 0) {
      const prog = updateRaceCheckpointAndProgress(
        bot.x,
        bot.z,
        bot.lap,
        bot.nextCheckpoint
      );
      bot.lap = prog.lap;
      bot.nextCheckpoint = prog.nextCheckpoint;
      bot.trackProgress = prog.trackProgress;
      if (prog.completedLap) {
        bot.score += 35;
        if (bot.lap > targetLaps) {
          bot.lap = targetLaps;
          bot.finishedAt = now;
          bot.score += 90;
        }
      }
    }

    // Bot fires held Meme Item!
    if (bot.heldItem && now >= mem.nextItemUseAt) {
      const item = bot.heldItem;
      bot.heldItem = null;
      mem.nextItemUseAt = now + 2600 + Math.random() * 2600;

      if (item === "ATAY_NITRO") {
        bot.atayUntil = now + 6200;
        bot.nitro = 100;
      } else {
        // Pick target ahead or nearest
        let bestTargetId: string | null = null;
        let bestScore = Infinity;
        for (const other of allList) {
          if (other.id === bot.id || !other.isAlive) continue;
          const d = Math.hypot(other.x - bot.x, other.z - bot.z);
          if (d < 42 && d < bestScore) {
            bestScore = d;
            bestTargetId = other.id;
          }
        }
        cbs.onBotFireItem({
          id: `itm_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          ownerId: bot.id,
          item,
          x: bot.x,
          y: bot.y + 0.7,
          z: bot.z,
          yaw: bot.yaw,
          speed: mem.kin.forwardSpeed,
          targetId: bestTargetId,
        });
      }
    }

    // Occasional hilarious Darija Meme Horn taunt!
    if (now >= mem.nextTauntAt) {
      mem.nextTauntAt = now + 9500 + Math.random() * 11_000;
      const tauntId =
        KSIDA_TAUNT_ORDER[Math.floor(Math.random() * KSIDA_TAUNT_ORDER.length)];
      bot.lastTauntId = tauntId;
      bot.lastTauntAt = now;
      cbs.onBotTaunt(bot.id, bot.nickname, tauntId);
    }
  }

  // Bot-vs-Bot & Bot-vs-Remote collisions on Arbiter (Note: Local human resolves collisions directly for instant 60fps feel!)
  const botsAlive = allList.filter((r) => r.isBot && r.isAlive);
  for (let i = 0; i < botsAlive.length; i++) {
    for (let j = i + 1; j < botsAlive.length; j++) {
      const a = botsAlive[i];
      const b = botsAlive[j];
      const memA = memMap.get(a.id);
      const memB = memMap.get(b.id);
      if (!memA || !memB) continue;

      const pairKey = `${a.id}:${b.id}`;
      if (now - (memA.lastRamPairAt[pairKey] || 0) < 420) continue;

      const col = resolveCarVsCarCollision(
        {
          x: a.x,
          z: a.z,
          vx: a.vx,
          vz: a.vz,
          yaw: a.yaw,
          vehicle: a.vehicle,
          isNitro: memA.kin.isNitroActive,
          atayActive: a.atayUntil > now,
        },
        {
          x: b.x,
          z: b.z,
          vx: b.vx,
          vz: b.vz,
          yaw: b.yaw,
          vehicle: b.vehicle,
          isNitro: memB.kin.isNitroActive,
          atayActive: b.atayUntil > now,
        }
      );

      if (col) {
        memA.lastRamPairAt[pairKey] = now;
        memA.kin.vx += col.impulseOnAX * 0.55;
        memA.kin.vz += col.impulseOnAZ * 0.55;
        memB.kin.vx += col.impulseOnBX * 0.55;
        memB.kin.vz += col.impulseOnBZ * 0.55;

        if (col.damageToB >= 8) {
          cbs.onBotRamHit(
            a.id,
            b.id,
            col.damageToB,
            col.impulseOnBX,
            col.impulseOnBZ,
            col.spinMsOnB,
            col.isTBoneOnB,
            col.hitX,
            col.hitZ
          );
        } else if (col.damageToA >= 8) {
          cbs.onBotRamHit(
            b.id,
            a.id,
            col.damageToA,
            col.impulseOnAX,
            col.impulseOnAZ,
            0,
            false,
            col.hitX,
            col.hitZ
          );
        }
      }
    }
  }
}
