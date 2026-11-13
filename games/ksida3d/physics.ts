import {
  CAR_COLLISION_RADIUS,
  evaluateTrackBoundary,
  findNearestTrackSample,
  sampleRampHeight,
  sampleTurboPad,
} from "./trackLayout";
import { KSIDA_VEHICLES, KsidaMode, KsidaVehicleId } from "./types";

export interface CarKinematicsState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  forwardSpeed: number;
  steerAngle: number; // -1..1 smoothed
  isDrifting: boolean;
  driftDir: number; // -1 (left) | 0 | +1 (right)
  driftCharge: number; // seconds charged
  driftStage: 0 | 1 | 2 | 3;
  driftBoostTimer: number; // mini-turbo remaining seconds
  turboPadTimer: number; // floor turbo chevron boost remaining seconds
  lastTurboPadId: string;
  lastTurboPadAt: number;
  nitro: number; // 0..100
  isNitroActive: boolean;
  isAirborne: boolean;
  spinTimer: number; // remaining spinout seconds
  visualSpinYaw: number; // extra spin visual offset
  wrongWayTimer: number; // seconds spent driving opposite track tangent in RACE
}

export interface CarControlInput {
  throttle: number; // -1 (reverse/brake) .. +1 (gas)
  steer: number; // -1 (left) .. +1 (right)
  driftHeld: boolean;
  hopTap: boolean;
  nitroHeld: boolean;
  atayActive: boolean;
  countdownLocked?: boolean;
}

export interface CarStepEvents {
  wallHitIntensity: number; // >0 if bounced off guardrail
  driftBoostReleasedStage: 0 | 1 | 2 | 3;
  launchedRamp: boolean;
  landedAir: boolean;
  hitTurboPad: boolean;
}

export function createInitialCarKinematics(
  x: number,
  y: number,
  z: number,
  yaw: number,
  nitro = 65
): CarKinematicsState {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw,
    forwardSpeed: 0,
    steerAngle: 0,
    isDrifting: false,
    driftDir: 0,
    driftCharge: 0,
    driftStage: 0,
    driftBoostTimer: 0,
    turboPadTimer: 0,
    lastTurboPadId: "",
    lastTurboPadAt: 0,
    nitro,
    isNitroActive: false,
    isAirborne: false,
    spinTimer: 0,
    visualSpinYaw: 0,
    wrongWayTimer: 0,
  };
}

/**
 * Steps 60Hz pro-arcade drift-racing physics with speed-sensitive progressive steering,
 * Mario-Kart 3-stage drift sparks, Brake-to-Drift, Turbo Chevron Pads, Stunt Ramps, and Guardrail Slide!
 */
export function stepCarKinematics(
  car: CarKinematicsState,
  input: CarControlInput,
  vehicleId: KsidaVehicleId,
  mode: KsidaMode,
  dt: number
): CarStepEvents {
  const spec = KSIDA_VEHICLES[vehicleId] || KSIDA_VEHICLES.TAXI_HMER;
  const events: CarStepEvents = {
    wallHitIntensity: 0,
    driftBoostReleasedStage: 0,
    launchedRamp: false,
    landedAir: false,
    hitTurboPad: false,
  };

  const clampedDt = Math.min(0.05, Math.max(0.001, dt));

  // Starting Grid Countdown Lock (allows front wheel wiggle without rolling off grid)
  if (input.countdownLocked) {
    const steerTarget = Math.max(-1, Math.min(1, input.steer));
    car.steerAngle += (steerTarget - car.steerAngle) * Math.min(1, 14 * clampedDt);
    car.vx = 0;
    car.vz = 0;
    car.vy = 0;
    car.forwardSpeed = 0;
    car.isDrifting = false;
    car.driftStage = 0;
    car.isNitroActive = false;
    return events;
  }

  // 1. Handle Spinout State (from Sandala / Soap Oil / Heavy T-bone)
  if (car.spinTimer > 0) {
    car.spinTimer = Math.max(0, car.spinTimer - clampedDt);
    car.visualSpinYaw += 13.5 * clampedDt;
    car.vx *= Math.pow(0.2, clampedDt);
    car.vz *= Math.pow(0.2, clampedDt);
    car.forwardSpeed *= Math.pow(0.2, clampedDt);
    car.isDrifting = false;
    car.driftCharge = 0;
    car.driftStage = 0;
    car.isNitroActive = false;
  } else {
    car.visualSpinYaw *= Math.pow(0.002, clampedDt);
    if (Math.abs(car.visualSpinYaw) < 0.01) car.visualSpinYaw = 0;

    // Responsive steering with crisp snap-to-center when neutral so straightaways never feel floaty!
    const steerTarget = Math.max(-1, Math.min(1, input.steer));
    const steerRate = Math.abs(steerTarget) < 0.08 ? 18.5 : 11.8;
    car.steerAngle += (steerTarget - car.steerAngle) * Math.min(1, steerRate * clampedDt);
    if (Math.abs(steerTarget) < 0.04 && Math.abs(car.steerAngle) < 0.02) {
      car.steerAngle = 0;
    }

    // Passive & active Nitro management
    const wantsNitro = (input.nitroHeld && car.nitro > 4) || input.atayActive;
    if (input.atayActive) {
      car.isNitroActive = true;
      car.nitro = Math.min(100, car.nitro + 25 * clampedDt);
    } else if (wantsNitro) {
      car.isNitroActive = true;
      car.nitro = Math.max(0, car.nitro - 26 * clampedDt);
      if (car.nitro <= 0.5) car.isNitroActive = false;
    } else {
      car.isNitroActive = false;
      car.nitro = Math.min(100, car.nitro + 5.2 * clampedDt);
    }

    if (car.driftBoostTimer > 0) {
      car.driftBoostTimer = Math.max(0, car.driftBoostTimer - clampedDt);
    }
    if (car.turboPadTimer > 0) {
      car.turboPadTimer = Math.max(0, car.turboPadTimer - clampedDt);
    }

    // Subtle suspension hop on drift initiation (snappy 0.18m pop, never floaty!)
    if (input.hopTap && !car.isAirborne && car.y <= 0.08 && Math.abs(car.forwardSpeed) > 7) {
      car.vy = 2.85;
      car.isAirborne = true;
    }

    // Power-Drift + Brake-to-Drift state machine
    const brakeDriftTrigger =
      input.throttle < -0.25 && car.forwardSpeed > 15.5 && Math.abs(steerTarget) > 0.45;
    const wantsDrift = input.driftHeld || brakeDriftTrigger;
    const canMaintainDrift = car.forwardSpeed > 7.0;

    if (wantsDrift && canMaintainDrift) {
      const activeSteerSignal =
        Math.abs(steerTarget) > 0.18 ? steerTarget : car.steerAngle;
      if (!car.isDrifting && car.forwardSpeed > 9.5 && Math.abs(activeSteerSignal) > 0.15) {
        car.isDrifting = true;
        car.driftDir = activeSteerSignal > 0 ? 1 : -1; // +1 = drifting right, -1 = drifting left
        car.driftCharge = 0;
      }
    } else if (car.isDrifting) {
      // Release drift -> award mini-turbo burst!
      if (car.driftStage > 0) {
        events.driftBoostReleasedStage = car.driftStage;
        car.driftBoostTimer =
          car.driftStage === 3 ? 1.95 : car.driftStage === 2 ? 1.25 : 0.72;
        car.nitro = Math.min(100, car.nitro + car.driftStage * 11);
      }
      car.isDrifting = false;
      car.driftDir = 0;
      car.driftCharge = 0;
      car.driftStage = 0;
    }

    if (car.isDrifting) {
      // Steering into the turn charges sparks faster; counter-steering still builds charge steadily
      const steerInDrift = car.steerAngle * car.driftDir; // -1..+1
      const chargeRate = steerInDrift > 0.1 ? 1.28 : steerInDrift < -0.2 ? 0.58 : 0.92;
      const groundContactMult = car.isAirborne && car.y > 0.9 ? 0.4 : 1.0;
      car.driftCharge += clampedDt * chargeRate * groundContactMult;
      car.nitro = Math.min(100, car.nitro + 12.5 * clampedDt);
      if (car.driftCharge >= 1.6) car.driftStage = 3;
      else if (car.driftCharge >= 0.92) car.driftStage = 2;
      else if (car.driftCharge >= 0.38) car.driftStage = 1;
      else car.driftStage = 0;
    }

    // Top speed & acceleration multipliers
    const boostMult = input.atayActive
      ? 1.42
      : car.turboPadTimer > 0
      ? 1.35
      : car.isNitroActive
      ? 1.33
      : car.driftBoostTimer > 0
      ? 1.24
      : car.isDrifting
      ? 0.96
      : 1.0;

    const maxFwd = spec.topSpeed * boostMult;
    const maxRev = -13.5;

    // During Brake-to-Drift, keep power flowing so tapping S to kick the tail out doesn't stall you!
    const effectiveThrottle =
      car.isDrifting && input.throttle < 0 && car.forwardSpeed > 12 ? 0.65 : input.throttle;

    if (effectiveThrottle > 0.05) {
      const accelBoost =
        car.turboPadTimer > 0 || car.isNitroActive || car.driftBoostTimer > 0 ? 1.6 : 1.0;
      car.forwardSpeed += spec.accel * accelBoost * effectiveThrottle * clampedDt;
      if (car.forwardSpeed > maxFwd) {
        car.forwardSpeed += (maxFwd - car.forwardSpeed) * Math.min(1, 5.5 * clampedDt);
      }
    } else if (effectiveThrottle < -0.05) {
      const brakePower = car.forwardSpeed > 1.5 ? spec.accel * 1.75 : spec.accel * 0.95;
      car.forwardSpeed += brakePower * effectiveThrottle * clampedDt;
      if (car.forwardSpeed < maxRev) car.forwardSpeed = maxRev;
    } else {
      // Natural coasting drag
      car.forwardSpeed *= Math.pow(0.38, clampedDt);
      if (Math.abs(car.forwardSpeed) < 0.15) car.forwardSpeed = 0;
    }

    // Speed-Sensitive Progressive Yaw Turning
    const speedAbs = Math.abs(car.forwardSpeed);
    const lowSpeedRamp = Math.min(1, speedAbs / 6.2);
    const highSpeedStability =
      1.0 - 0.3 * Math.min(1, Math.max(0, (speedAbs - 18.0) / 22.0));
    const reverseSign = car.forwardSpeed >= -0.3 ? 1 : -1;

    let yawDelta = 0;
    if (car.isDrifting) {
      // Natural drift arc: steer into turn = tight hairpin (1.04), neutral = smooth sweep (0.56), counter-steer = wide exit (0.08)
      const steerInDrift = car.steerAngle * car.driftDir;
      const driftTurnFactor = Math.max(0.08, 0.56 + steerInDrift * 0.48);
      yawDelta = -car.driftDir * driftTurnFactor * spec.turnRate * 1.06 * clampedDt;
    } else {
      yawDelta =
        -car.steerAngle *
        spec.turnRate *
        lowSpeedRamp *
        highSpeedStability *
        reverseSign *
        clampedDt;
    }
    car.yaw = normalizeAngle(car.yaw + yawDelta);

    // Forward & Lateral velocity blending (crisp planted grip when driving straight, juicy slide when drifting!)
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    const targetVx = fx * car.forwardSpeed;
    const targetVz = fz * car.forwardSpeed;

    const gripRate = car.isAirborne
      ? 2.0
      : car.isDrifting
      ? 4.6 * spec.driftGrip
      : 15.5;
    const blend = Math.min(1, gripRate * clampedDt);
    car.vx += (targetVx - car.vx) * blend;
    car.vz += (targetVz - car.vz) * blend;
  }

  // 2. Integrate XZ Position
  car.x += car.vx * clampedDt;
  car.z += car.vz * clampedDt;

  // 3. Asphalt Turbo Chevron Boost Pads!
  if (!car.isAirborne) {
    const pad = sampleTurboPad(car.x, car.z, mode);
    const nowPerf = Date.now();
    if (
      pad &&
      (car.lastTurboPadId !== pad.id || nowPerf - car.lastTurboPadAt > 1800)
    ) {
      car.lastTurboPadId = pad.id;
      car.lastTurboPadAt = nowPerf;
      car.turboPadTimer = 1.4;
      car.forwardSpeed = Math.max(car.forwardSpeed, spec.topSpeed * 1.3);
      const fx = Math.sin(car.yaw);
      const fz = Math.cos(car.yaw);
      car.vx = fx * car.forwardSpeed;
      car.vz = fz * car.forwardSpeed;
      car.nitro = Math.min(100, car.nitro + 22);
      events.hitTurboPad = true;
    }
  }

  // 4. Stunt Ramps & Vertical Gravity
  const ramp = sampleRampHeight(car.x, car.z, mode);
  if (!car.isAirborne && ramp.onRamp) {
    car.y = ramp.height;
    const speedHoriz = Math.hypot(car.vx, car.vz);
    if (ramp.nearLip && speedHoriz > 14.0) {
      car.vy = Math.min(13.2, 5.5 + speedHoriz * 0.24);
      car.isAirborne = true;
      car.forwardSpeed = Math.max(car.forwardSpeed, speedHoriz * 1.14);
      car.nitro = Math.min(100, car.nitro + 20);
      events.launchedRamp = true;
    }
  } else {
    if (car.y > ramp.height + 0.04 || car.vy > 0) {
      car.isAirborne = true;
      car.vy -= 24.0 * clampedDt;
      car.y += car.vy * clampedDt;
      if (car.y <= ramp.height) {
        car.y = ramp.height;
        if (car.vy < -4.0) events.landedAir = true;
        car.vy = 0;
        car.isAirborne = false;
      }
    } else {
      car.y = ramp.height;
      car.vy = 0;
      car.isAirborne = false;
    }
  }

  // 5. Guardrail / Stadium Wall / Monument Pillar Collision with Smooth Tangential Slide
  const bound = evaluateTrackBoundary(car.x, car.z, mode);
  const pen = bound.sdf + CAR_COLLISION_RADIUS;
  if (pen > 0) {
    car.x -= bound.nx * pen;
    car.z -= bound.nz * pen;

    const vn = car.vx * bound.nx + car.vz * bound.nz;
    if (vn > 0) {
      events.wallHitIntensity = vn;
      car.vx -= bound.nx * vn * 1.28;
      car.vz -= bound.nz * vn * 1.28;
      car.vx *= 0.92;
      car.vz *= 0.92;
      car.forwardSpeed *= 0.89;

      // Gently align car tangent to guardrail on glancing scrapes so nobody ever gets wedged!
      const tangentX = -bound.nz;
      const tangentZ = bound.nx;
      const fx = Math.sin(car.yaw);
      const fz = Math.cos(car.yaw);
      const signT = fx * tangentX + fz * tangentZ >= 0 ? 1 : -1;
      const wallYaw = Math.atan2(tangentX * signT, tangentZ * signT);
      const yawDiff = normalizeAngle(wallYaw - car.yaw);
      car.yaw = normalizeAngle(car.yaw + yawDiff * Math.min(0.45, clampedDt * 8.5));
    }
  }

  // 6. Wrong-Way Detector in RACE Mode
  if (mode === "RACE" && Math.abs(car.forwardSpeed) > 4.5 && car.spinTimer <= 0) {
    const nearest = findNearestTrackSample(car.x, car.z);
    const fx = Math.sin(car.yaw) * (car.forwardSpeed >= 0 ? 1 : -1);
    const fz = Math.cos(car.yaw) * (car.forwardSpeed >= 0 ? 1 : -1);
    const dot = fx * nearest.sample.tx + fz * nearest.sample.tz;
    if (dot < -0.45) {
      car.wrongWayTimer = Math.min(10, car.wrongWayTimer + clampedDt);
    } else {
      car.wrongWayTimer = Math.max(0, car.wrongWayTimer - clampedDt * 3);
    }
  } else {
    car.wrongWayTimer = Math.max(0, car.wrongWayTimer - clampedDt * 2);
  }

  return events;
}

export interface CarCollisionResolution {
  collided: boolean;
  impactSpeed: number;
  damageToB: number;
  damageToA: number;
  isTBoneOnB: boolean;
  impulseOnBX: number;
  impulseOnBZ: number;
  impulseOnAX: number;
  impulseOnAZ: number;
  spinMsOnB: number;
  hitX: number;
  hitZ: number;
}

/**
 * Computes momentum-conserving arcade ramming & Burnout-style T-bone damage between Car A and Car B.
 */
export function resolveCarVsCarCollision(
  a: {
    x: number;
    z: number;
    vx: number;
    vz: number;
    yaw: number;
    vehicle: KsidaVehicleId;
    isNitro: boolean;
    atayActive: boolean;
  },
  b: {
    x: number;
    z: number;
    vx: number;
    vz: number;
    yaw: number;
    vehicle: KsidaVehicleId;
    isNitro: boolean;
    atayActive: boolean;
  }
): CarCollisionResolution | null {
  const minDist = CAR_COLLISION_RADIUS * 2.05;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist >= minDist) return null;

  const nx = dist > 1e-4 ? dx / dist : Math.sin(a.yaw);
  const nz = dist > 1e-4 ? dz / dist : Math.cos(a.yaw);

  const relVx = a.vx - b.vx;
  const relVz = a.vz - b.vz;
  const closingSpeed = relVx * nx + relVz * nz;

  const specA = KSIDA_VEHICLES[a.vehicle] || KSIDA_VEHICLES.TAXI_HMER;
  const specB = KSIDA_VEHICLES[b.vehicle] || KSIDA_VEHICLES.TAXI_HMER;
  const totalMass = specA.mass + specB.mass;

  const overlap = minDist - dist + 0.06;
  const pushA = overlap * (specB.mass / totalMass);
  const pushB = overlap * (specA.mass / totalMass);

  const effClosing = Math.max(4.5, closingSpeed);
  const restitution = 1.48;
  const j = (effClosing * restitution) / totalMass;

  const impulseOnAX = -nx * j * specB.mass - nx * pushA * 8;
  const impulseOnAZ = -nz * j * specB.mass - nz * pushA * 8;
  const impulseOnBX = nx * j * specA.mass + nx * pushB * 10;
  const impulseOnBZ = nz * j * specA.mass + nz * pushB * 10;

  const aFwdDot = Math.sin(a.yaw) * nx + Math.cos(a.yaw) * nz;
  const bFwdDot = -(Math.sin(b.yaw) * nx + Math.cos(b.yaw) * nz);
  const bSideAlignment = Math.abs(-Math.cos(b.yaw) * nx + Math.sin(b.yaw) * nz);
  const isTBoneOnB = aFwdDot > 0.55 && bSideAlignment > 0.65 && closingSpeed > 10;

  const speedA = Math.hypot(a.vx, a.vz);
  const speedB = Math.hypot(b.vx, b.vz);

  let damageToB = 0;
  let damageToA = 0;
  let spinMsOnB = 0;

  if (closingSpeed > 5.0) {
    const baseImpact = closingSpeed * 1.65;
    if (aFwdDot > 0.25 && speedA > 7.0) {
      const multA =
        (specA.mass / specB.mass) *
        (a.atayActive ? 2.1 : a.isNitro ? 1.45 : 1.0) *
        (isTBoneOnB ? 1.35 : 1.0);
      damageToB = Math.min(85, Math.round(baseImpact * multA));
      if (a.atayActive || (isTBoneOnB && closingSpeed > 15)) {
        spinMsOnB = a.atayActive ? 950 : 620;
      }
    }
    if (bFwdDot > 0.25 && speedB > 7.0 && !a.atayActive) {
      const multB = (specB.mass / specA.mass) * (b.atayActive ? 2.1 : b.isNitro ? 1.45 : 1.0);
      damageToA = Math.min(85, Math.round(baseImpact * multB));
    }
  }

  return {
    collided: true,
    impactSpeed: Math.max(closingSpeed, 4.5),
    damageToB,
    damageToA,
    isTBoneOnB,
    impulseOnBX,
    impulseOnBZ,
    impulseOnAX,
    impulseOnAZ,
    spinMsOnB,
    hitX: (a.x + b.x) * 0.5,
    hitZ: (a.z + b.z) * 0.5,
  };
}

export function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
