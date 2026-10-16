/**
 * Camera & joystick math for Ghammada 3D.
 *
 * Conventions (world XZ plane, three.js Y-up):
 * - `yaw` is the direction the camera looks at, horizontally: forward = (sin(yaw), cos(yaw)).
 * - The camera sits BEHIND the player: cameraPos = player - forward * distance.
 * - Joystick: jx > 0 = thumb to the right, jy > 0 = thumb DOWN (screen coordinates).
 * - Model rotation: a model facing +Z rotated by `rotY` faces (sin(rotY), cos(rotY)).
 */

export interface Vec2 {
  x: number;
  z: number;
}

/** Horizontal forward direction of the camera */
export function cameraForward(yaw: number): Vec2 {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/** Horizontal right direction of the camera (forward × up) */
export function cameraRight(yaw: number): Vec2 {
  return { x: -Math.cos(yaw), z: Math.sin(yaw) };
}

/**
 * Converts joystick input into a world-space move direction relative to the camera.
 * Pushing the stick up always moves away from the camera, whatever the camera angle.
 * Output length equals the input length (clamped to 1), so partial tilt = slower walk.
 */
export function cameraRelativeMove(jx: number, jy: number, yaw: number): Vec2 {
  let mag = Math.hypot(jx, jy);
  if (mag < 1e-6) return { x: 0, z: 0 };
  if (mag > 1) {
    jx /= mag;
    jy /= mag;
    mag = 1;
  }
  const f = cameraForward(yaw);
  const r = cameraRight(yaw);
  const forwardAmount = -jy; // thumb up = forward
  return {
    x: r.x * jx + f.x * forwardAmount,
    z: r.z * jx + f.z * forwardAmount,
  };
}

/** Facing angle (rotY) for a model that should look along `dir` */
export function facingFromDirection(dir: Vec2): number {
  return Math.atan2(dir.x, dir.z);
}

/** Camera yaw that looks from `from` toward `to` */
export function yawLookingAt(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/** Smallest signed difference between two angles, in (-PI, PI] */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Frame-rate independent smoothing factor */
export function damp(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}

/** Look-drag sensitivity (radians per pixel) */
export const LOOK_SENSITIVITY_YAW = 0.0065;
export const LOOK_SENSITIVITY_PITCH = 0.0045;
export const PITCH_MIN = 0.12;
export const PITCH_MAX = 1.05;

/**
 * Applies a finger drag on the look area to the camera angles.
 * Dragging right turns the view right; dragging up looks up (camera goes lower).
 */
export function applyLookDrag(
  yaw: number,
  pitch: number,
  dxPx: number,
  dyPx: number
): { yaw: number; pitch: number } {
  const nextYaw = yaw - dxPx * LOOK_SENSITIVITY_YAW;
  const nextPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + dyPx * LOOK_SENSITIVITY_PITCH));
  return { yaw: nextYaw, pitch: nextPitch };
}
