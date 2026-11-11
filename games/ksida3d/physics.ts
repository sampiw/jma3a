import {
  CAR_COLLISION_RADIUS,
  evaluateTrackBoundary,
  sampleRampHeight,
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
  driftDir: number; // -1 | 0 | 1
  driftCharge: number; // seconds charged
  driftStage: 0 | 1 | 2 | 3;
  driftBoostTimer: number; // mini-turbo remaining seconds
  nitro: number; // 0..100
  isNitroActive: boolean;
  isAirborne: boolean;
  spinTimer: number; // remaining spinout seconds
  visualSpinYaw: number; // extra spin visual offset
}

export interface CarControlInput {
  throttle: number; // -1 (reverse/brake) .. +1 (gas)
  steer: number; // -1 (right) .. +1 (left) OR convention: positive = steer left (+yaw) or right (-yaw)?
  // Convention: steerInput in [-1, +1] where -1 = Left, +1 = Right!
  // Note: In Three.js with forward = (+sin(yaw), +cos(yaw)), turning RIGHT decreases yaw!
  driftHeld: boolean;
  hopTap: boolean;
  nitroHeld: boolean;
  atayActive: boolean;
}

export interface CarStepEvents {
  wallHitIntensity: number; // >0 if bounced off guardrail
  driftBoostReleasedStage: 0 | 1 | 2 | 3;
  launchedRamp: boolean;
  landedAir: boolean;
}

export function createInitialCarKinematics(
  x: number,
  y: number,
  z: number,
  yaw: number,
  nitro = 55
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
    nitro,
    isNitroActive: false,
    isAirborne: false,
    spinTimer: 0,
    visualSpinYaw: 0,
  };
}

/**
 * Steps 60Hz arcade drift-racing physics with Mario-Kart 3-stage drift sparks,
 * stunt ramp launches, spinouts, and forgiving guardrail bounce!
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
  };

  const clampedDt = Math.min(0.05, Math.max(0.001, dt));

  // 1. Handle Spinout State (from Sandala / Soap Oil / Heavy T-bone)
  if (car.spinTimer > 0) {
    car.spinTimer = Math.max(0, car.spinTimer - clampedDt);
    car.visualSpinYaw += 13.5 * clampedDt;
    car.vx *= Math.pow(0.18, clampedDt);
    car.vz *= Math.pow(0.18, clampedDt);
    car.forwardSpeed *= Math.pow(0.18, clampedDt);
    car.isDrifting = false;
    car.driftCharge = 0;
    car.driftStage = 0;
    car.isNitroActive = false;
  } else {
    car.visualSpinYaw *= Math.pow(0.002, clampedDt);
    if (Math.abs(car.visualSpinYaw) < 0.01) car.visualSpinYaw = 0;

    // Smooth steering (-1 = Left => +yaw, +1 = Right => -yaw)
    const steerTarget = Math.max(-1, Math.min(1, input.steer));
    car.steerAngle += (steerTarget - car.steerAngle) * Math.min(1, 14 * clampedDt);

    // Passive & active Nitro management
    const wantsNitro = (input.nitroHeld && car.nitro > 4) || input.atayActive;
    if (input.atayActive) {
      car.isNitroActive = true;
      car.nitro = Math.min(100, car.nitro + 25 * clampedDt);
    } else if (wantsNitro) {
      car.isNitroActive = true;
      car.nitro = Math.max(0, car.nitro - 28 * clampedDt);
      if (car.nitro <= 0.5) car.isNitroActive = false;
    } else {
      car.isNitroActive = false;
      car.nitro = Math.min(100, car.nitro + 4.5 * clampedDt);
    }

    if (car.driftBoostTimer > 0) {
      car.driftBoostTimer = Math.max(0, car.driftBoostTimer - clampedDt);
    }

    // Hop on drift initiation
    if (input.hopTap && !car.isAirborne && car.y <= 0.08) {
      car.vy = 4.6;
      car.isAirborne = true;
    }

    // Power-Drift state machine (persists cleanly across initial hop & small bumps!)
    const canMaintainDrift = Math.abs(car.forwardSpeed) > 6.5;
    if (input.driftHeld && canMaintainDrift) {
      if (!car.isDrifting && Math.abs(car.forwardSpeed) > 9.5 && Math.abs(car.steerAngle) > 0.16) {
        car.isDrifting = true;
        car.driftDir = car.steerAngle > 0 ? 1 : -1; // +1 = drifting right, -1 = drifting left
        car.driftCharge = 0;
      }
    } else if (car.isDrifting) {
      // Release drift -> award mini-turbo burst!
      if (car.driftStage > 0) {
        events.driftBoostReleasedStage = car.driftStage;
        car.driftBoostTimer =
          car.driftStage === 3 ? 1.85 : car.driftStage === 2 ? 1.15 : 0.65;
        car.nitro = Math.min(100, car.nitro + car.driftStage * 10);
      }
      car.isDrifting = false;
      car.driftDir = 0;
      car.driftCharge = 0;
      car.driftStage = 0;
    }

    if (car.isDrifting) {
      // Counter-steering modulates tightness while maintaining drift direction
      const sameDir = car.steerAngle * car.driftDir > 0 ? 1.25 : 0.5;
      const groundContactMult = car.isAirborne && car.y > 0.9 ? 0.35 : 1.0;
      car.driftCharge += clampedDt * sameDir * groundContactMult;
      car.nitro = Math.min(100, car.nitro + 12 * clampedDt);
      if (car.driftCharge >= 1.65) car.driftStage = 3;
      else if (car.driftCharge >= 0.95) car.driftStage = 2;
      else if (car.driftCharge >= 0.4) car.driftStage = 1;
      else car.driftStage = 0;
    }

    // Top speed & acceleration multipliers
    const boostMult = input.atayActive
      ? 1.42
      : car.isNitroActive
      ? 1.34
      : car.driftBoostTimer > 0
      ? 1.22
      : 1.0;

    const maxFwd = spec.topSpeed * boostMult;
    const maxRev = -12.5;

    if (input.throttle > 0.05) {
      const accelBoost = car.isNitroActive || car.driftBoostTimer > 0 ? 1.55 : 1.0;
      car.forwardSpeed += spec.accel * accelBoost * input.throttle * clampedDt;
      if (car.forwardSpeed > maxFwd) {
        car.forwardSpeed += (maxFwd - car.forwardSpeed) * Math.min(1, 6 * clampedDt);
      }
    } else if (input.throttle < -0.05) {
      const brakePower = car.forwardSpeed > 1.5 ? spec.accel * 1.65 : spec.accel * 0.9;
      car.forwardSpeed += brakePower * input.throttle * clampedDt;
      if (car.forwardSpeed < maxRev) car.forwardSpeed = maxRev;
    } else {
      // Natural coasting drag
      car.forwardSpeed *= Math.pow(0.32, clampedDt);
      if (Math.abs(car.forwardSpeed) < 0.15) car.forwardSpeed = 0;
    }

    // Yaw Turning (invert steer when reversing)
    const speedFactor = Math.min(1, Math.abs(car.forwardSpeed) / 7.5);
    const reverseSign = car.forwardSpeed >= -0.3 ? 1 : -1;
    let yawDelta = 0;
    if (car.isDrifting) {
      // Base drift arc + counter-steer adjustment
      const driftTurn = car.driftDir * 0.72 + car.steerAngle * 0.58;
      yawDelta = -driftTurn * spec.turnRate * 1.12 * clampedDt;
    } else {
      yawDelta = -car.steerAngle * spec.turnRate * speedFactor * reverseSign * clampedDt;
    }
    car.yaw = normalizeAngle(car.yaw + yawDelta);

    // Forward & Lateral velocity blending (arcade traction + juicy drift slip!)
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    const targetVx = fx * car.forwardSpeed;
    const targetVz = fz * car.forwardSpeed;

    const gripRate = car.isAirborne
      ? 1.8
      : car.isDrifting
      ? 4.2 * spec.driftGrip
      : 13.5;
    const blend = Math.min(1, gripRate * clampedDt);
    car.vx += (targetVx - car.vx) * blend;
    car.vz += (targetVz - car.vz) * blend;
  }

  // 2. Integrate XZ Position
  car.x += car.vx * clampedDt;
  car.z += car.vz * clampedDt;

  // 3. Stunt Ramps & Vertical Gravity
  const ramp = sampleRampHeight(car.x, car.z, mode);
  if (!car.isAirborne && ramp.onRamp) {
    car.y = ramp.height;
    const speedHoriz = Math.hypot(car.vx, car.vz);
    if (ramp.nearLip && speedHoriz > 13.5) {
      car.vy = Math.min(12.5, 5.2 + speedHoriz * 0.24);
      car.isAirborne = true;
      car.forwardSpeed = Math.max(car.forwardSpeed, speedHoriz * 1.12);
      car.nitro = Math.min(100, car.nitro + 18);
      events.launchedRamp = true;
    }
  } else {
    if (car.y > ramp.height + 0.04 || car.vy > 0) {
      car.isAirborne = true;
      car.vy -= 24.5 * clampedDt;
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

  // 4. Guardrail / Stadium Wall Collision with Smooth Tangential Slide & Sparks
  const bound = evaluateTrackBoundary(car.x, car.z, mode);
  const pen = bound.sdf + CAR_COLLISION_RADIUS;
  if (pen > 0) {
    car.x -= bound.nx * pen;
    car.z -= bound.nz * pen;

    const vn = car.vx * bound.nx + car.vz * bound.nz;
    if (vn > 0) {
      events.wallHitIntensity = vn;
      // Reflect slightly off guardrail + retain 84% tangential momentum so nobody gets stuck!
      car.vx -= bound.nx * vn * 1.32;
      car.vz -= bound.nz * vn * 1.32;
      car.vx *= 0.9;
      car.vz *= 0.9;
      car.forwardSpeed *= 0.86;

      // Gently nudge car yaw parallel to guardrail if scraping hard at shallow angle
      const tangentX = -bound.nz;
      const tangentZ = bound.nx;
      const fx = Math.sin(car.yaw);
      const fz = Math.cos(car.yaw);
      const signT = fx * tangentX + fz * tangentZ >= 0 ? 1 : -1;
      const wallYaw = Math.atan2(tangentX * signT, tangentZ * signT);
      const yawDiff = normalizeAngle(wallYaw - car.yaw);
      car.yaw = normalizeAngle(car.yaw + yawDiff * Math.min(0.45, clampedDt * 8));
    }
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

  // Relative velocity of A closing into B along normal (A -> B)
  const relVx = a.vx - b.vx;
  const relVz = a.vz - b.vz;
  const closingSpeed = relVx * nx + relVz * nz;

  const specA = KSIDA_VEHICLES[a.vehicle] || KSIDA_VEHICLES.TAXI_HMER;
  const specB = KSIDA_VEHICLES[b.vehicle] || KSIDA_VEHICLES.TAXI_HMER;
  const totalMass = specA.mass + specB.mass;

  // Separate overlap
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

  // Determine how aggressively A rammed B vs B rammed A
  const aFwdDot = Math.sin(a.yaw) * nx + Math.cos(a.yaw) * nz; // +1 when A's bumper hits B
  const bFwdDot = -(Math.sin(b.yaw) * nx + Math.cos(b.yaw) * nz); // +1 when B's bumper hits A
  const bSideAlignment = Math.abs(-Math.cos(b.yaw) * nx + Math.sin(b.yaw) * nz); // ~1 when hit broadside (T-bone!)
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
