"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  DIB3D_ARENA_HALF,
  DIB3D_CENTRAL_DRUM,
  DIB3D_ELECTRIC_BOX,
  DIB3D_TASK_STATIONS,
  DIB3D_VENTS,
  DIB3D_WALL_SEGMENTS,
  Dib3DDeadBody,
  Dib3DPhase,
  Dib3DPlayerEntity,
  Dib3DRole,
  Dib3DTaskStationId,
} from "@/games/dib3d/types";
import {
  buildProceduralProp,
  enableShadows,
  GhammadaAssets,
  HUNTER_HEIGHT,
  loadGhammadaAssets,
} from "@/components/games/ghammada/assets";
import { GhammadaEffects } from "@/components/games/ghammada/effects";
import {
  angleDelta,
  applyLookDrag,
  cameraRelativeMove,
  damp,
  facingFromDirection,
} from "@/components/games/ghammada/controlsMath";

export interface Dib3DLocalTransform {
  x: number;
  z: number;
  rotY: number;
  camYaw: number;
  camPitch?: number;
  isMoving?: boolean;
}

export interface Dib3DLivePacket {
  i: string;
  x: number;
  z: number;
  r: number;
  m?: boolean;
  t: number;
}

export interface Dib3DFxEvent {
  k: "kill" | "vent" | "task" | "lights" | "fix" | "shoot" | "scan";
  i: string;
  x: number;
  z: number;
}

export interface Dib3DProximityState {
  nearestTargetId: string | null;
  nearestBodyId: string | null;
  nearestBodyVictim: string | null;
  nearestTaskStationId: Dib3DTaskStationId | null;
  nearElectricBox: boolean;
  nearCentralDrum: boolean;
  nearVentId: string | null;
  playerX: number;
  playerZ: number;
  playerRotY: number;
}

interface Dib3DArenaProps {
  phase: Dib3DPhase;
  myPlayerId: string;
  myRole: Dib3DRole;
  isMyPlayerAlive: boolean;
  myAssignedTasks: Dib3DTaskStationId[];
  myCompletedTasks: Dib3DTaskStationId[];
  fellowWolfIds: string[];
  seerKnown: Record<string, "WOLF" | "INNOCENT">;
  entities: Record<string, Dib3DPlayerEntity>;
  deadBodies: Dib3DDeadBody[];
  lightsOutUntil?: number;
  playersMap: Record<string, string>;
  localPosRef: React.MutableRefObject<Dib3DLocalTransform>;
  joystickVecRef: React.MutableRefObject<{ dx: number; dz: number }>;
  peersRef?: React.MutableRefObject<Map<string, Dib3DLivePacket>>;
  fxQueueRef?: React.MutableRefObject<Dib3DFxEvent[]>;
  onPositionTick?: (x: number, z: number, rotY: number, isMoving: boolean) => void;
  onProximityChange?: (prox: Dib3DProximityState) => void;
}

function createNameTagSprite(
  name: string,
  badgeText?: string,
  badgeColor?: string
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 256, 72);
    // Pill background
    ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
    ctx.strokeStyle = badgeColor || "rgba(251, 191, 36, 0.65)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(14, 10, 228, 52, 24);
    ctx.fill();
    ctx.stroke();

    ctx.font = "900 24px Tahoma, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = badgeColor || "#ffffff";
    const label = badgeText ? `${badgeText} ${name}` : name;
    ctx.fillText(label.slice(0, 18), 128, 36);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.85, 0.52, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function buildCentralDrumStation(): THREE.Group {
  const g = new THREE.Group();

  // Raised Zellige Platform
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.35, 0.25, 24),
    new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.4 })
  );
  platform.position.y = 0.125;
  platform.receiveShadow = true;
  g.add(platform);

  // Gold Rim
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 2.38, 32),
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
    })
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.26;
  g.add(rim);

  // Wooden Arch Pillars
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
  for (const px of [-0.95, 0.95]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.4, 12), woodMat);
    pillar.position.set(px, 1.3, 0);
    pillar.castShadow = true;
    g.add(pillar);
  }
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.2), woodMat);
  crossbar.position.set(0, 2.45, 0);
  g.add(crossbar);

  // Giant Golden Moroccan Tbal / Gong
  const gong = new THREE.Mesh(
    new THREE.CylinderGeometry(0.68, 0.68, 0.22, 24),
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.65,
      roughness: 0.25,
      emissive: 0xd97706,
      emissiveIntensity: 0.35,
    })
  );
  gong.rotation.x = Math.PI / 2;
  gong.position.set(0, 1.55, 0);
  gong.castShadow = true;
  g.add(gong);

  return g;
}

function buildTaskStation3D(
  id: Dib3DTaskStationId,
  color: number
): { root: THREE.Group; beacon: THREE.Group } {
  const root = new THREE.Group();

  // Glowing Base Pad
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 1.45, 0.14, 24),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      emissive: color,
      emissiveIntensity: 0.25,
    })
  );
  pad.position.y = 0.07;
  pad.receiveShadow = true;
  root.add(pad);

  // Distinct 3D Moroccan Structure per Station
  if (id === "farran_bread") {
    // Brick Dome Bakery Oven + Fire Glow
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.85 })
    );
    dome.position.y = 0.14;
    root.add(dome);
    const fire = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    fire.position.set(0, 0.38, 0.65);
    root.add(fire);
  } else if (id === "hanout_kunnach") {
    // Blue Moroccan Hanout Counter + Blue Credit Notebook
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.95, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 })
    );
    counter.position.y = 0.55;
    root.add(counter);
    const kunnach = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.08, 0.6),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.4,
      })
    );
    kunnach.position.set(0, 1.08, 0);
    root.add(kunnach);
  } else if (id === "cafe_atay") {
    // Café Table + Giant Silver Berrad
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.7, 0.75, 18),
      new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.5 })
    );
    table.position.y = 0.45;
    root.add(table);
    const berrad = buildProceduralProp("berrad");
    berrad.position.set(0, 0.82, 0);
    root.add(berrad);
  } else if (id === "hammam_berma") {
    // Hammam Copper Cauldron + Red Buckets
    const berma = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.6, 0.9, 18),
      new THREE.MeshStandardMaterial({
        color: 0xb45309,
        metalness: 0.55,
        roughness: 0.35,
      })
    );
    berma.position.y = 0.52;
    root.add(berma);
    const bucket = buildProceduralProp("amphora");
    bucket.position.set(0.65, 0.14, 0.45);
    root.add(bucket);
  } else if (id === "sqaya_bucket") {
    // Zellige Fountain Wall + Water Stream
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.8, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x0e7490, roughness: 0.4 })
    );
    wall.position.set(0, 0.95, -0.2);
    root.add(wall);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.16, 1.1, 10),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 })
    );
    water.position.set(0, 0.65, 0.25);
    root.add(water);
  } else if (id === "attar_spices") {
    // Moroccan Spice Souk Stall + 4 Conical Spice Mounds
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.75, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 })
    );
    table.position.y = 0.42;
    root.add(table);
    const spiceColors = [0xef4444, 0xfacc15, 0xd97706, 0x84cc16];
    spiceColors.forEach((sc, idx) => {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.38, 12),
        new THREE.MeshStandardMaterial({ color: sc, roughness: 0.6 })
      );
      cone.position.set(-0.55 + idx * 0.36, 0.98, 0);
      root.add(cone);
    });
  } else if (id === "sebbagh_wool") {
    // Chouara Tannery Dye Vats (Saffron, Crimson, Indigo)
    const vatColors = [0xfacc15, 0xe11d48, 0x2563eb];
    vatColors.forEach((vc, idx) => {
      const angle = (idx / 3) * Math.PI * 2;
      const vx = Math.cos(angle) * 0.58;
      const vz = Math.sin(angle) * 0.58;
      const vat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.48, 0.55, 16),
        new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.85 })
      );
      vat.position.set(vx, 0.32, vz);
      root.add(vat);
      const dye = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 0.58, 14),
        new THREE.MeshBasicMaterial({ color: vc })
      );
      dye.position.set(vx, 0.33, vz);
      root.add(dye);
    });
  } else if (id === "souika_carpet") {
    // Hanging Amazigh Woven Carpet on Cedar Frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.75 });
    for (const px of [-0.85, 0.85]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 10), frameMat);
      post.position.set(px, 1.1, 0);
      root.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.9, 10), frameMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 2.15, 0);
    root.add(bar);
    const rug = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 1.65, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.8 })
    );
    rug.position.set(0, 1.25, 0);
    root.add(rug);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.38, 0),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    diamond.scale.set(1, 1.3, 0.25);
    diamond.position.set(0, 1.25, 0);
    root.add(diamond);
  } else if (id === "medersa_clock") {
    // Ornate Brass & Zellige Sundial Clock Pillar
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 1.85, 0.75),
      new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.45 })
    );
    pillar.position.y = 0.95;
    root.add(pillar);
    const dial = new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.07, 12, 24),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.7, roughness: 0.25 })
    );
    dial.position.set(0, 2.15, 0);
    root.add(dial);
  } else {
    // Wrought-Iron Street Lantern
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 2.3, 10),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6 })
    );
    pole.position.y = 1.2;
    root.add(pole);
    const lantern = buildProceduralProp("fanar");
    lantern.position.set(0, 2.1, 0);
    root.add(lantern);
  }

  // Floating Golden Task Beacon (!) above station
  const beacon = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.62, 8),
    new THREE.MeshBasicMaterial({ color: 0xfacc15 })
  );
  cone.rotation.x = Math.PI;
  cone.position.y = 2.55;
  beacon.add(cone);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.42, 1.68, 28),
    new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  beacon.add(ring);

  root.add(beacon);
  enableShadows(root);
  return { root, beacon };
}

function buildSewerVentMesh(): THREE.Group {
  const g = new THREE.Group();
  const cover = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.05, 0.08, 20),
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.75,
      roughness: 0.35,
    })
  );
  cover.position.y = 0.04;
  g.add(cover);

  const glowRing = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.18, 24),
    new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    })
  );
  glowRing.rotation.x = -Math.PI / 2;
  glowRing.position.y = 0.03;
  g.add(glowRing);
  return g;
}

function buildElectricBoxMesh(): { root: THREE.Group; hazardLight: THREE.Mesh } {
  const root = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 1.65, 0.65),
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.6,
      roughness: 0.4,
    })
  );
  box.position.y = 0.95;
  root.add(box);

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.55),
    new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
  );
  sign.position.set(0, 1.05, 0.34);
  root.add(sign);

  const hazardLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 14, 12),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  hazardLight.position.set(0, 1.95, 0);
  root.add(hazardLight);
  enableShadows(root);
  return { root, hazardLight };
}

function buildDeadBodyMesh(outfitColor: number, victimName: string): THREE.Group {
  const g = new THREE.Group();

  // Crimson pool under body
  const pool = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.05, 0.04, 20),
    new THREE.MeshStandardMaterial({
      color: 0xbe123c,
      emissive: 0x9f1239,
      emissiveIntensity: 0.5,
      roughness: 0.25,
    })
  );
  pool.position.y = 0.02;
  g.add(pool);

  // Fallen character torso + legs
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.65, 8, 14),
    new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.5 })
  );
  torso.rotation.z = Math.PI / 2;
  torso.position.set(0, 0.28, 0);
  g.add(torso);

  // White Bone / Skull Beacon above body
  const beaconRing = new THREE.Mesh(
    new THREE.RingGeometry(1.05, 1.32, 24),
    new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    })
  );
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = 0.04;
  g.add(beaconRing);

  const sprite = createNameTagSprite(`💀 جثة ${victimName}`, undefined, "#fb7185");
  sprite.position.set(0, 1.45, 0);
  g.add(sprite);

  return g;
}

function resolveDib3DCollisions(
  rawX: number,
  rawZ: number,
  radius: number,
  isGhost: boolean
): { x: number; z: number } {
  const limit = DIB3D_ARENA_HALF - 1.4;
  let x = Math.max(-limit, Math.min(limit, rawX));
  let z = Math.max(-limit, Math.min(limit, rawZ));

  if (isGhost) {
    return { x, z };
  }

  // Collide against Medina Labyrinth Wall Segments (AABB vs Circle)
  for (const w of DIB3D_WALL_SEGMENTS) {
    const halfW = w.w / 2;
    const halfD = w.d / 2;
    const closestX = Math.max(w.x - halfW, Math.min(w.x + halfW, x));
    const closestZ = Math.max(w.z - halfD, Math.min(w.z + halfD, z));
    const dx = x - closestX;
    const dz = z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq);
      if (dist > 1e-4) {
        const push = radius - dist;
        x += (dx / dist) * push;
        z += (dz / dist) * push;
      } else {
        x += radius;
      }
    }
  }

  // Soft circle push from Central Drum & Task Stations so players don't clip inside them
  const drumDist = Math.hypot(x - DIB3D_CENTRAL_DRUM.x, z - DIB3D_CENTRAL_DRUM.z);
  const drumMin = 1.45 + radius;
  if (drumDist < drumMin && drumDist > 1e-4) {
    x = DIB3D_CENTRAL_DRUM.x + ((x - DIB3D_CENTRAL_DRUM.x) / drumDist) * drumMin;
    z = DIB3D_CENTRAL_DRUM.z + ((z - DIB3D_CENTRAL_DRUM.z) / drumDist) * drumMin;
  }

  for (const st of DIB3D_TASK_STATIONS) {
    const sd = Math.hypot(x - st.x, z - st.z);
    const sMin = 1.05 + radius;
    if (sd < sMin && sd > 1e-4) {
      x = st.x + ((x - st.x) / sd) * sMin;
      z = st.z + ((z - st.z) / sd) * sMin;
    }
  }

  return {
    x: Math.max(-limit, Math.min(limit, x)),
    z: Math.max(-limit, Math.min(limit, z)),
  };
}

function clampCameraWallDist(
  focusX: number,
  focusZ: number,
  dirX: number,
  dirZ: number,
  desiredDist: number
): number {
  const wallLimit = DIB3D_ARENA_HALF - 0.5;
  let maxDist = desiredDist;

  if (Math.abs(dirX) > 1e-4) {
    const boundX = dirX > 0 ? wallLimit : -wallLimit;
    const dX = (boundX - focusX) / dirX;
    if (dX > 0) maxDist = Math.min(maxDist, dX);
  }
  if (Math.abs(dirZ) > 1e-4) {
    const boundZ = dirZ > 0 ? wallLimit : -wallLimit;
    const dZ = (boundZ - focusZ) / dirZ;
    if (dZ > 0) maxDist = Math.min(maxDist, dZ);
  }

  return Math.max(1.5, maxDist);
}

export function Dib3DArena({
  phase,
  myPlayerId,
  myRole,
  isMyPlayerAlive,
  myAssignedTasks,
  myCompletedTasks,
  fellowWolfIds,
  seerKnown,
  entities,
  deadBodies,
  lightsOutUntil,
  playersMap,
  localPosRef,
  joystickVecRef,
  peersRef,
  fxQueueRef,
  onPositionTick,
  onProximityChange,
}: Dib3DArenaProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [loadProgress, setLoadProgress] = useState<number>(0);

  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;

  const deadBodiesRef = useRef(deadBodies);
  deadBodiesRef.current = deadBodies;

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const myRoleRef = useRef(myRole);
  myRoleRef.current = myRole;

  const isAliveRef = useRef(isMyPlayerAlive);
  isAliveRef.current = isMyPlayerAlive;

  const assignedTasksRef = useRef(myAssignedTasks);
  assignedTasksRef.current = myAssignedTasks;

  const completedTasksRef = useRef(myCompletedTasks);
  completedTasksRef.current = myCompletedTasks;

  const fellowWolfIdsRef = useRef(fellowWolfIds);
  fellowWolfIdsRef.current = fellowWolfIds;

  const seerKnownRef = useRef(seerKnown);
  seerKnownRef.current = seerKnown;

  const lightsOutUntilRef = useRef(lightsOutUntil);
  lightsOutUntilRef.current = lightsOutUntil;

  const playersMapRef = useRef(playersMap);
  playersMapRef.current = playersMap;

  const onPosTickRef = useRef(onPositionTick);
  onPosTickRef.current = onPositionTick;

  const onProxChangeRef = useRef(onProximityChange);
  onProxChangeRef.current = onProximityChange;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;

    // 1. Initialize Three.js Night Derb Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);
    const sceneFog = new THREE.FogExp2(0x090d16, 0.018);
    scene.fog = sceneFog;

    const initAspect = container.clientWidth / Math.max(1, container.clientHeight);
    const computeFov = (aspect: number) =>
      aspect < 1 ? Math.min(76, 52 / Math.max(0.56, aspect)) : 55;

    const camera = new THREE.PerspectiveCamera(
      computeFov(initAspect),
      initAspect,
      0.15,
      110
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // 2. Night Derb Lighting + Personal Flashlight
    const hemiLight = new THREE.HemisphereLight(0xcbd5e1, 0x1e1b4b, 0.85);
    scene.add(hemiLight);

    const moonLight = new THREE.DirectionalLight(0x93c5fd, 1.15);
    moonLight.position.set(12, 26, 10);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.width = 1024;
    moonLight.shadow.mapSize.height = 1024;
    const dBound = 20;
    moonLight.shadow.camera.left = -dBound;
    moonLight.shadow.camera.right = dBound;
    moonLight.shadow.camera.top = dBound;
    moonLight.shadow.camera.bottom = -dBound;
    scene.add(moonLight);

    // Personal Flashlight Beam (Active during Lights Out!)
    const flashlight = new THREE.SpotLight(0xfffbeb, 3.2, 16, Math.PI / 3.2, 0.45, 1);
    flashlight.position.set(0, 1.6, 0);
    scene.add(flashlight);
    scene.add(flashlight.target);

    // 3. Build 3D Moroccan Medina Labyrinth Environment (76m x 76m)
    const envGroup = new THREE.Group();
    scene.add(envGroup);

    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    envGroup.add(floorMesh);

    const grid = new THREE.GridHelper(76, 38, 0x38bdf8, 0x1e293b);
    grid.position.y = 0.015;
    envGroup.add(grid);

    // Outer Medina Rampart Terracotta Walls (76x76m)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.82 });
    const innerWallMat = new THREE.MeshStandardMaterial({
      color: 0x9a3412,
      roughness: 0.78,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.4,
    });

    const outerBound = DIB3D_ARENA_HALF - 0.4;
    const outerSpan = DIB3D_ARENA_HALF * 2;
    for (const ws of [
      { x: 0, z: -outerBound, w: outerSpan, d: 1.1 },
      { x: 0, z: outerBound, w: outerSpan, d: 1.1 },
      { x: -outerBound, z: 0, w: 1.1, d: outerSpan },
      { x: outerBound, z: 0, w: 1.1, d: outerSpan },
    ]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ws.w, 4.4, ws.d), wallMat);
      wall.position.set(ws.x, 2.2, ws.z);
      wall.receiveShadow = true;
      wall.castShadow = true;
      envGroup.add(wall);
    }

    // Interior Medina Labyrinth Walls & Courtyards (block line-of-sight!)
    for (const seg of DIB3D_WALL_SEGMENTS) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(seg.w, seg.h, seg.d),
        innerWallMat
      );
      wall.position.set(seg.x, seg.h / 2, seg.z);
      wall.receiveShadow = true;
      wall.castShadow = true;
      envGroup.add(wall);

      // Moroccan Zellige Blue Base Strip
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(seg.w + 0.08, 0.45, seg.d + 0.08),
        trimMat
      );
      trim.position.set(seg.x, 0.225, seg.z);
      envGroup.add(trim);
    }

    // Central Emergency Drum Station at (0, 0)
    const drumStation = buildCentralDrumStation();
    drumStation.position.set(DIB3D_CENTRAL_DRUM.x, 0, DIB3D_CENTRAL_DRUM.z);
    envGroup.add(drumStation);

    // 6 Interactive 3D Moroccan Task Stations
    const taskStationBeacons = new Map<Dib3DTaskStationId, THREE.Group>();
    for (const st of DIB3D_TASK_STATIONS) {
      const built = buildTaskStation3D(st.id, st.color);
      built.root.position.set(st.x, 0, st.z);
      envGroup.add(built.root);
      taskStationBeacons.set(st.id, built.beacon);
    }

    // 4 Sewer Vents in the Corners
    const ventMeshes = new Map<string, THREE.Group>();
    for (const v of DIB3D_VENTS) {
      const vm = buildSewerVentMesh();
      vm.position.set(v.x, 0, v.z);
      envGroup.add(vm);
      ventMeshes.set(v.id, vm);
    }

    // Electric Box at (12.2, 0)
    const electricBox = buildElectricBoxMesh();
    electricBox.root.position.set(DIB3D_ELECTRIC_BOX.x, 0, DIB3D_ELECTRIC_BOX.z);
    electricBox.root.rotation.y = -Math.PI / 2;
    envGroup.add(electricBox.root);

    // Local Player Halo Ring + Target Lock Ring
    const myRingMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.8, 32),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      })
    );
    myRingMesh.rotation.x = -Math.PI / 2;
    myRingMesh.position.y = 0.04;
    scene.add(myRingMesh);

    const targetHighlightRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1.05, 28),
      new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      })
    );
    targetHighlightRing.rotation.x = -Math.PI / 2;
    targetHighlightRing.position.y = 0.05;
    targetHighlightRing.visible = false;
    scene.add(targetHighlightRing);

    const effects = new GhammadaEffects(scene);

    // 4. Load Rigged 3D Character Assets
    let loadedAssets: GhammadaAssets | null = null;
    let assetsVersion = 0;

    loadGhammadaAssets((ratio) => {
      if (!disposed) setLoadProgress(ratio);
    }).then((assets) => {
      if (!disposed) {
        loadedAssets = assets;
        assetsVersion++;
      }
    });

    interface CharacterEntry {
      root: THREE.Group;
      visual: THREE.Group;
      mixer: THREE.AnimationMixer | null;
      actions: Record<string, THREE.AnimationAction>;
      currentAnim: string;
      nameSprite: THREE.Sprite;
      ver: number;
      color: number;
      badgeKey: string;
      isGhost: boolean;
      lastX: number;
      lastZ: number;
    }

    const playerMeshes = new Map<string, CharacterEntry>();
    const bodyMeshes = new Map<string, THREE.Group>();

    const buildCharacter = (
      outfitColor: number,
      isGhost: boolean,
      displayName: string,
      badgeText?: string,
      badgeColor?: string
    ): Omit<
      CharacterEntry,
      "ver" | "color" | "badgeKey" | "isGhost" | "lastX" | "lastZ"
    > => {
      const root = new THREE.Group();
      const visual = new THREE.Group();
      root.add(visual);

      let mixer: THREE.AnimationMixer | null = null;
      const actions: Record<string, THREE.AnimationAction> = {};

      if (loadedAssets?.hunter) {
        loadedAssets.hunter.scene.updateMatrixWorld(true);
        const cloned = SkeletonUtils.clone(loadedAssets.hunter.scene);
        cloned.scale.setScalar((HUNTER_HEIGHT * 0.95) / 4.79);
        cloned.position.set(0, isGhost ? 0.35 : 0, 0);

        cloned.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = !isGhost;
            mesh.receiveShadow = !isGhost;
            mesh.frustumCulled = false;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (mat && "color" in mat) {
              const m = mat.clone();
              const name = (m.name || "").toLowerCase();
              if (isGhost) {
                m.color.set(0x38bdf8);
                m.transparent = true;
                m.opacity = 0.42;
              } else if (name.includes("main")) {
                m.color.set(outfitColor);
              } else if (name.includes("grey") || name.includes("gray")) {
                m.color.set(0x1e293b);
              }
              mesh.material = m;
            }
          }
        });

        visual.add(cloned);
        mixer = new THREE.AnimationMixer(cloned);
        for (const clip of loadedAssets.hunter.animations) {
          actions[clip.name] = mixer.clipAction(clip);
        }
      } else {
        const fallback = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.36, 0.75, 10, 16),
          new THREE.MeshStandardMaterial({
            color: isGhost ? 0x38bdf8 : outfitColor,
            transparent: isGhost,
            opacity: isGhost ? 0.45 : 1,
          })
        );
        fallback.position.y = 0.8;
        visual.add(fallback);
      }

      const nameSprite = createNameTagSprite(displayName, badgeText, badgeColor);
      nameSprite.position.set(0, 2.25, 0);
      root.add(nameSprite);

      return {
        root,
        visual,
        mixer,
        actions,
        currentAnim: "",
        nameSprite,
      };
    };

    const playCharAnim = (entry: CharacterEntry, name: string, fade = 0.18) => {
      if (!entry.mixer || entry.currentAnim === name) return;
      const next = entry.actions[name] || entry.actions["Idle"];
      if (!next) return;
      const prev = entry.actions[entry.currentAnim];
      next.reset().setEffectiveWeight(1).fadeIn(fade).play();
      if (prev && prev !== next) prev.fadeOut(fade);
      entry.currentAnim = name;
    };

    // 5. Keyboard + Multi-Touch Look Controls
    const keysPressed: Record<string, boolean> = {};
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed[e.code] = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    let lookPointerId: number | null = null;
    let lastPointerX = 0;
    let lastPointerY = 0;
    const domEl = renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (lookPointerId !== null) return;
      lookPointerId = e.pointerId;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== lookPointerId) return;
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;

      const currentPitch = localPosRef.current.camPitch ?? 0.52;
      const next = applyLookDrag(localPosRef.current.camYaw, currentPitch, dx, dy);
      localPosRef.current.camYaw = next.yaw;
      localPosRef.current.camPitch = next.pitch;
    };

    const onPointerUpOrCancel = (e: PointerEvent) => {
      if (e.pointerId === lookPointerId) {
        lookPointerId = null;
      }
    };

    domEl.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUpOrCancel);
    window.addEventListener("pointercancel", onPointerUpOrCancel);

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.fov = computeFov(camera.aspect);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);
    const resizeObs =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(handleResize) : null;
    resizeObs?.observe(container);

    // 6. Main 60 FPS Game Loop
    let animFrameId = 0;
    let lastTime = performance.now();
    let lastSyncMs = 0;
    let lastProxKey = "";

    const animate = (nowMs: number) => {
      animFrameId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastTime) / 1000));
      lastTime = nowMs;
      const nowEpoch = Date.now();

      const allEntities = entitiesRef.current;
      const role = myRoleRef.current;
      const amIAlive = isAliveRef.current;
      const isLightsOut = Boolean(
        lightsOutUntilRef.current && nowEpoch < lightsOutUntilRef.current
      );

      // Process instant FX queue
      if (fxQueueRef?.current && fxQueueRef.current.length > 0) {
        const q = fxQueueRef.current.splice(0, fxQueueRef.current.length);
        for (const fx of q) {
          if (fx.k === "kill" || fx.k === "shoot") {
            effects.poof(fx.x, fx.z);
          } else if (fx.k === "vent") {
            effects.smoke(fx.x, fx.z);
          } else if (fx.k === "task" || fx.k === "fix" || fx.k === "scan") {
            effects.notes(fx.x, fx.z);
          }
        }
      }

      // Dynamic Lighting & Fog for Lights Sabotage!
      const targetFogDensity =
        isLightsOut && role !== "WOLF" && amIAlive ? 0.115 : 0.016;
      sceneFog.density += (targetFogDensity - sceneFog.density) * damp(6, dt);
      hemiLight.intensity = isLightsOut && role !== "WOLF" && amIAlive ? 0.18 : 0.85;
      moonLight.intensity = isLightsOut && role !== "WOLF" && amIAlive ? 0.2 : 1.15;

      // Update Electric Box Hazard Beacon
      electricBox.hazardLight.scale.setScalar(
        isLightsOut ? 1 + Math.sin(nowMs * 0.018) * 0.35 : 0.8
      );

      // Update Task Station Beacons (Pulse only for uncompleted assigned tasks)
      for (const st of DIB3D_TASK_STATIONS) {
        const beacon = taskStationBeacons.get(st.id);
        if (!beacon) continue;
        const isMyTodo =
          role !== "WOLF" &&
          assignedTasksRef.current.includes(st.id) &&
          !completedTasksRef.current.includes(st.id);
        beacon.visible = isMyTodo;
        if (isMyTodo) {
          beacon.position.y = Math.sin(nowMs * 0.008) * 0.18;
          beacon.rotation.y += dt * 2.5;
        }
      }

      // Sync Dead Bodies on the Ground
      const seenBodyIds = new Set<string>();
      for (const b of deadBodiesRef.current || []) {
        seenBodyIds.add(b.id);
        let bMesh = bodyMeshes.get(b.id);
        if (!bMesh) {
          bMesh = buildDeadBodyMesh(b.outfitColor, b.victimName);
          bMesh.position.set(b.x, 0, b.z);
          scene.add(bMesh);
          bodyMeshes.set(b.id, bMesh);
        }
      }
      for (const [id, mesh] of bodyMeshes.entries()) {
        if (!seenBodyIds.has(id)) {
          scene.remove(mesh);
          bodyMeshes.delete(id);
        }
      }

      // Local Player Movement (Alive or Ghost!)
      let localMoving = false;
      if (phaseRef.current === "ROAM_3D") {
        let jx = joystickVecRef.current.dx;
        let jy = joystickVecRef.current.dz;
        if (keysPressed["KeyW"] || keysPressed["ArrowUp"]) jy -= 1;
        if (keysPressed["KeyS"] || keysPressed["ArrowDown"]) jy += 1;
        if (keysPressed["KeyA"] || keysPressed["ArrowLeft"]) jx -= 1;
        if (keysPressed["KeyD"] || keysPressed["ArrowRight"]) jx += 1;

        const mag = Math.hypot(jx, jy);
        if (mag > 0.04) {
          localMoving = true;
          const move = cameraRelativeMove(jx, jy, localPosRef.current.camYaw);
          const baseSpeed = !amIAlive ? 8.2 : role === "WOLF" ? 7.3 : 6.8;

          const rawX = localPosRef.current.x + move.x * baseSpeed * dt;
          const rawZ = localPosRef.current.z + move.z * baseSpeed * dt;
          const resolved = resolveDib3DCollisions(rawX, rawZ, 0.45, !amIAlive);

          localPosRef.current.x = resolved.x;
          localPosRef.current.z = resolved.z;

          const targetFacing = facingFromDirection(move);
          localPosRef.current.rotY +=
            angleDelta(localPosRef.current.rotY, targetFacing) * damp(15, dt);
        }

        localPosRef.current.isMoving = localMoving;

        if (localMoving || nowMs - lastSyncMs > 300) {
          if (localMoving) lastSyncMs = nowMs;
          onPosTickRef.current?.(
            localPosRef.current.x,
            localPosRef.current.z,
            localPosRef.current.rotY,
            localMoving
          );
        }
      }

      const myX = localPosRef.current.x;
      const myZ = localPosRef.current.z;
      const camYaw = localPosRef.current.camYaw;

      // Update Personal Flashlight position & target
      flashlight.position.set(myX, 1.8, myZ);
      flashlight.target.position.set(
        myX + Math.sin(camYaw) * 8,
        0.5,
        myZ + Math.cos(camYaw) * 8
      );

      // Compute Smart Proximity Radar for Contextual Action Buttons
      let nearestTargetId: string | null = null;
      let nearestTargetPos: { x: number; z: number } | null = null;
      let bestTargetScore = Infinity;

      for (const ent of Object.values(allEntities)) {
        if (ent.playerId === myPlayerId || !ent.isAlive) continue;
        if (role === "WOLF" && fellowWolfIdsRef.current.includes(ent.playerId)) {
          continue;
        }
        const peer = peersRef?.current.get(ent.playerId);
        const isFresh = Boolean(peer && nowMs - peer.t < 2000);
        const px = isFresh && peer ? peer.x : ent.x;
        const pz = isFresh && peer ? peer.z : ent.z;
        const dist = Math.hypot(px - myX, pz - myZ);
        if (dist <= 3.7) {
          const ang = Math.atan2(px - myX, pz - myZ);
          const angDiff = Math.abs(angleDelta(camYaw, ang));
          const score = dist + angDiff * 0.8;
          if (score < bestTargetScore) {
            bestTargetScore = score;
            nearestTargetId = ent.playerId;
            nearestTargetPos = { x: px, z: pz };
          }
        }
      }

      if (
        nearestTargetPos &&
        amIAlive &&
        (role === "WOLF" || role === "SHERIFF" || role === "SEER")
      ) {
        targetHighlightRing.visible = true;
        targetHighlightRing.position.set(nearestTargetPos.x, 0.05, nearestTargetPos.z);
      } else {
        targetHighlightRing.visible = false;
      }

      // Check nearest Dead Body (within 4.2m)
      let nearestBodyId: string | null = null;
      let nearestBodyVictim: string | null = null;
      let bestBodyDist = 4.2;
      for (const b of deadBodiesRef.current || []) {
        const d = Math.hypot(b.x - myX, b.z - myZ);
        if (d < bestBodyDist) {
          bestBodyDist = d;
          nearestBodyId = b.id;
          nearestBodyVictim = b.victimName;
        }
      }

      // Check nearest uncompleted Task Station (within 3.4m)
      let nearestTaskStationId: Dib3DTaskStationId | null = null;
      if (role !== "WOLF") {
        let bestTaskDist = 3.4;
        for (const st of DIB3D_TASK_STATIONS) {
          if (
            assignedTasksRef.current.includes(st.id) &&
            !completedTasksRef.current.includes(st.id)
          ) {
            const d = Math.hypot(st.x - myX, st.z - myZ);
            if (d < bestTaskDist) {
              bestTaskDist = d;
              nearestTaskStationId = st.id;
            }
          }
        }
      }

      // Check Electric Box, Central Drum, and Sewer Vents
      const nearElectricBox =
        Math.hypot(DIB3D_ELECTRIC_BOX.x - myX, DIB3D_ELECTRIC_BOX.z - myZ) <= 3.6;
      const nearCentralDrum =
        Math.hypot(DIB3D_CENTRAL_DRUM.x - myX, DIB3D_CENTRAL_DRUM.z - myZ) <= 3.6;

      let nearVentId: string | null = null;
      if (role === "WOLF" && amIAlive) {
        for (const v of DIB3D_VENTS) {
          if (Math.hypot(v.x - myX, v.z - myZ) <= 3.4) {
            nearVentId = v.id;
            break;
          }
        }
      }

      const gridX = Math.round(myX * 2) / 2;
      const gridZ = Math.round(myZ * 2) / 2;
      const proxKey = `${nearestTargetId || ""}|${nearestBodyId || ""}|${nearestTaskStationId || ""}|${nearElectricBox ? 1 : 0}|${nearCentralDrum ? 1 : 0}|${nearVentId || ""}|${gridX},${gridZ}`;
      if (proxKey !== lastProxKey) {
        lastProxKey = proxKey;
        onProxChangeRef.current?.({
          nearestTargetId,
          nearestBodyId,
          nearestBodyVictim,
          nearestTaskStationId,
          nearElectricBox,
          nearCentralDrum,
          nearVentId,
          playerX: myX,
          playerZ: myZ,
          playerRotY: localPosRef.current.rotY,
        });
      }

      // Render & Animate Players
      const seenIds = new Set<string>();
      for (const ent of Object.values(allEntities)) {
        const isMe = ent.playerId === myPlayerId;
        const isGhost = !ent.isAlive;

        // Alive players cannot see Ghosts! Only Ghosts see Ghosts!
        if (isGhost && amIAlive && !isMe) {
          const existing = playerMeshes.get(ent.playerId);
          if (existing) existing.root.visible = false;
          seenIds.add(ent.playerId);
          continue;
        }

        seenIds.add(ent.playerId);
        const peer = !isMe ? peersRef?.current.get(ent.playerId) : undefined;
        const isPeerFresh = Boolean(peer && nowMs - peer.t < 2000);

        const displayName = playersMapRef.current[ent.playerId] || "لاعب";
        const isFellowWolf =
          role === "WOLF" && fellowWolfIdsRef.current.includes(ent.playerId);
        const seerAlignment = seerKnownRef.current[ent.playerId];

        let badgeText: string | undefined;
        let badgeColor: string | undefined;
        if (isGhost) {
          badgeText = "👻";
          badgeColor = "#38bdf8";
        } else if (isFellowWolf) {
          badgeText = "🐺";
          badgeColor = "#f43f5e";
        } else if (seerAlignment === "WOLF") {
          badgeText = "🐺 ذيب!";
          badgeColor = "#f43f5e";
        } else if (seerAlignment === "INNOCENT") {
          badgeText = "🟢";
          badgeColor = "#34d399";
        }

        const badgeKey = `${displayName}|${badgeText || ""}|${badgeColor || ""}`;

        let entry = playerMeshes.get(ent.playerId);
        if (
          !entry ||
          entry.ver !== assetsVersion ||
          entry.color !== ent.outfitColor ||
          entry.isGhost !== isGhost ||
          entry.badgeKey !== badgeKey
        ) {
          const prevX = entry?.lastX ?? ent.x;
          const prevZ = entry?.lastZ ?? ent.z;
          if (entry) scene.remove(entry.root);

          const built = buildCharacter(
            ent.outfitColor,
            isGhost,
            displayName,
            badgeText,
            badgeColor
          );
          built.root.position.set(prevX, 0, prevZ);
          scene.add(built.root);

          entry = {
            ...built,
            ver: assetsVersion,
            color: ent.outfitColor,
            badgeKey,
            isGhost,
            lastX: prevX,
            lastZ: prevZ,
          };
          playerMeshes.set(ent.playerId, entry);
        }

        entry.root.visible = true;

        const targetX = isMe
          ? localPosRef.current.x
          : isPeerFresh && peer
          ? peer.x
          : ent.x;
        const targetZ = isMe
          ? localPosRef.current.z
          : isPeerFresh && peer
          ? peer.z
          : ent.z;
        const targetRot = isMe
          ? localPosRef.current.rotY
          : isPeerFresh && peer
          ? peer.r
          : ent.rotY;

        const prevX = entry.root.position.x;
        const prevZ = entry.root.position.z;

        if (isMe) {
          entry.root.position.set(targetX, 0, targetZ);
          entry.root.rotation.y = targetRot;
          myRingMesh.position.set(targetX, 0.04, targetZ);
        } else {
          const blend = damp(14, dt);
          entry.root.position.x += (targetX - entry.root.position.x) * blend;
          entry.root.position.z += (targetZ - entry.root.position.z) * blend;
          entry.root.rotation.y +=
            angleDelta(entry.root.rotation.y, targetRot) * blend;
        }

        const speed =
          Math.hypot(entry.root.position.x - prevX, entry.root.position.z - prevZ) / dt;
        const isMovingNow = isMe
          ? localMoving
          : isPeerFresh && peer?.m !== undefined
          ? peer.m || speed > 0.25
          : speed > 0.25;

        entry.lastX = entry.root.position.x;
        entry.lastZ = entry.root.position.z;

        if (isMovingNow) {
          playCharAnim(entry, "Running");
        } else {
          playCharAnim(entry, "Idle");
        }

        entry.mixer?.update(dt);
      }

      for (const [id, entry] of playerMeshes.entries()) {
        if (!seenIds.has(id)) {
          scene.remove(entry.root);
          playerMeshes.delete(id);
        }
      }

      effects.update(dt);

      // 3rd-Person Follow Camera
      const focusX = localPosRef.current.x;
      const focusZ = localPosRef.current.z;
      const camPitch = localPosRef.current.camPitch ?? 0.52;
      const baseDist = 5.5;
      const focusY = 1.25;

      const backDirX = -Math.sin(camYaw);
      const backDirZ = -Math.cos(camYaw);
      const desiredHorizDist = baseDist * Math.cos(camPitch);
      const clampedHorizDist = clampCameraWallDist(
        focusX,
        focusZ,
        backDirX,
        backDirZ,
        desiredHorizDist
      );
      const distRatio = clampedHorizDist / Math.max(0.01, desiredHorizDist);
      const vertDist = baseDist * Math.sin(camPitch) * Math.max(0.6, distRatio);

      const desiredCamX = focusX + backDirX * clampedHorizDist;
      const desiredCamZ = focusZ + backDirZ * clampedHorizDist;
      const desiredCamY = Math.max(0.9, focusY + vertDist);

      const camBlend = damp(16, dt);
      camera.position.x += (desiredCamX - camera.position.x) * camBlend;
      camera.position.y += (desiredCamY - camera.position.y) * camBlend;
      camera.position.z += (desiredCamZ - camera.position.z) * camBlend;
      camera.lookAt(focusX, focusY, focusZ);

      renderer.render(scene, camera);
    };

    animFrameId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(animFrameId);
      resizeObs?.disconnect();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      domEl.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUpOrCancel);
      window.removeEventListener("pointercancel", onPointerUpOrCancel);
      window.removeEventListener("resize", handleResize);
      envTarget.dispose();
      effects.dispose();
      renderer.dispose();
    };
  }, [myPlayerId, localPosRef, joystickVecRef, peersRef, fxQueueRef]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 select-none touch-none">
      <div ref={mountRef} className="w-full h-full" />
      {loadProgress > 0 && loadProgress < 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/75 border border-rose-400/40 text-[11px] font-bold text-rose-300 pointer-events-none">
          جاري تحضير الدرب المغربي 3D... {Math.round(loadProgress * 100)}%
        </div>
      )}
    </div>
  );
}
