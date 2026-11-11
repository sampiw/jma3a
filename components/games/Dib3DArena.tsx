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
  hasMedinaLineOfSight,
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
  damp,
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
  s?: boolean;
  t: number;
}

export interface Dib3DFxEvent {
  k: "kill" | "vent" | "task" | "lights" | "fix" | "shoot" | "scan" | "shadow";
  i: string;
  v?: string;
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

function buildMedinaFloorTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    // Base warm Marrakesh sandstone
    ctx.fillStyle = "#e7d3b0";
    ctx.fillRect(0, 0, size, size);

    // 38x38 courtyard stone tiles (each tile = 2m in 76x76m arena)
    const cells = 38;
    const step = size / cells;
    for (let gx = 0; gx < cells; gx++) {
      for (let gz = 0; gz < cells; gz++) {
        ctx.fillStyle = (gx + gz) % 2 === 0 ? "#eee0c4" : "#dec69e";
        ctx.fillRect(gx * step, gz * step, step, step);
      }
    }

    // Warm ivory travertine grand Medina walkways along N-S & E-W axes
    const cx = size / 2;
    const pathHalf = (3.4 / 76) * size;
    ctx.fillStyle = "#f6eddc";
    ctx.fillRect(cx - pathHalf, 0, pathHalf * 2, size);
    ctx.fillRect(0, cx - pathHalf, size, pathHalf * 2);

    ctx.strokeStyle = "rgba(194, 65, 12, 0.30)";
    ctx.lineWidth = 4;
    ctx.strokeRect(cx - pathHalf, 0, pathHalf * 2, size);
    ctx.strokeRect(0, cx - pathHalf, size, pathHalf * 2);

    // Central Royal Zellige Riad Courtyard (-8.5m .. +8.5m)
    const riadHalf = (8.3 / 76) * size;
    ctx.fillStyle = "#fbf7ef";
    ctx.fillRect(cx - riadHalf, cx - riadHalf, riadHalf * 2, riadHalf * 2);

    ctx.strokeStyle = "#0284c7";
    ctx.lineWidth = 10;
    ctx.strokeRect(
      cx - riadHalf + 6,
      cx - riadHalf + 6,
      riadHalf * 2 - 12,
      riadHalf * 2 - 12
    );

    ctx.strokeStyle = "#0d9488";
    ctx.lineWidth = 5;
    ctx.strokeRect(
      cx - riadHalf + 18,
      cx - riadHalf + 18,
      riadHalf * 2 - 36,
      riadHalf * 2 - 36
    );

    // 8-Pointed Golden Moroccan Zellige Star Medallion at (0, 0)
    ctx.save();
    ctx.translate(cx, cx);
    for (let rot = 0; rot < 2; rot++) {
      ctx.save();
      ctx.rotate((rot * Math.PI) / 4);
      ctx.fillStyle = rot === 0 ? "rgba(2, 132, 199, 0.22)" : "rgba(245, 158, 11, 0.26)";
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 4;
      ctx.fillRect(-52, -52, 104, 104);
      ctx.strokeRect(-52, -52, 104, 104);
      ctx.restore();
    }
    ctx.restore();

    // Subtle cobblestone mortar grid across entire floor
    ctx.strokeStyle = "rgba(146, 64, 14, 0.14)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= cells; i++) {
      const p = i * step;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    // Warm amber lantern pools painted onto key task plazas & intersections
    const toPx = (coord: number) => ((coord + DIB3D_ARENA_HALF) / (DIB3D_ARENA_HALF * 2)) * size;
    for (const st of DIB3D_TASK_STATIONS) {
      const lx = toPx(st.x);
      const lz = toPx(st.z);
      const grad = ctx.createRadialGradient(lx, lz, 4, lx, lz, 48);
      grad.addColorStop(0, "rgba(251, 191, 36, 0.32)");
      grad.addColorStop(1, "rgba(251, 191, 36, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(lx, lz, 48, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function buildVisionVignetteTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    const c = size / 2;
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
    // Clear warm lantern circle inside 0..0.155 (maps to ~20m on 260m plane)
    grad.addColorStop(0.0, "rgba(15, 13, 36, 0.0)");
    grad.addColorStop(0.145, "rgba(15, 13, 36, 0.0)");
    grad.addColorStop(0.185, "rgba(24, 18, 48, 0.22)");
    grad.addColorStop(0.24, "rgba(15, 13, 38, 0.62)");
    grad.addColorStop(1.0, "rgba(12, 10, 30, 0.74)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
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

    // 1. Initialize Three.js Warm Lantern Medina Top-Down 3D Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1b1938);

    const initAspect = container.clientWidth / Math.max(1, container.clientHeight);
    const computeFov = (aspect: number) =>
      aspect < 1 ? Math.min(58, Math.max(50, 36 / Math.max(0.48, aspect))) : 46;

    const camera = new THREE.PerspectiveCamera(
      computeFov(initAspect),
      initAspect,
      0.5,
      130
    );
    const initPortrait = initAspect < 1;
    camera.position.set(
      localPosRef.current.x,
      initPortrait ? 20.5 : 16.5,
      localPosRef.current.z + (initPortrait ? 13.6 : 11.0)
    );
    camera.lookAt(localPosRef.current.x, 0.35, localPosRef.current.z - 0.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // 2. Warm Lantern Medina Lighting + Personal Hero Lantern
    const hemiLight = new THREE.HemisphereLight(0xfffbeb, 0x312e81, 1.25);
    scene.add(hemiLight);

    const moonLight = new THREE.DirectionalLight(0xffedd5, 1.45);
    moonLight.position.set(16, 36, 20);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.width = 1024;
    moonLight.shadow.mapSize.height = 1024;
    const dBound = 36;
    moonLight.shadow.camera.left = -dBound;
    moonLight.shadow.camera.right = dBound;
    moonLight.shadow.camera.top = dBound;
    moonLight.shadow.camera.bottom = -dBound;
    moonLight.shadow.bias = -0.0005;
    scene.add(moonLight);

    // Personal Warm Moroccan Lantern hovering above local hero
    const heroLantern = new THREE.PointLight(0xfbbf24, 2.2, 22, 1.35);
    heroLantern.position.set(localPosRef.current.x, 4.4, localPosRef.current.z);
    scene.add(heroLantern);

    // 3. Build 3D Moroccan Cutaway Medina Labyrinth Environment (76m x 76m)
    const envGroup = new THREE.Group();
    scene.add(envGroup);

    const medinaFloorTex = buildMedinaFloorTexture();
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(76, 76),
      new THREE.MeshStandardMaterial({
        map: medinaFloorTex,
        roughness: 0.72,
        metalness: 0.04,
      })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    envGroup.add(floorMesh);

    // Outer twilight terrace apron beyond the 76x76m ramparts
    const outerApron = new THREE.Mesh(
      new THREE.RingGeometry(53.5, 95, 4),
      new THREE.MeshBasicMaterial({ color: 0x15132e, side: THREE.DoubleSide })
    );
    outerApron.rotation.x = -Math.PI / 2;
    outerApron.rotation.z = Math.PI / 4;
    outerApron.position.y = -0.05;
    envGroup.add(outerApron);

    // Cutaway Medina Terracotta + Zellige + Sandstone Cap Materials (Zero Camera Obstruction!)
    const outerWallMat = new THREE.MeshStandardMaterial({
      color: 0xb45339,
      roughness: 0.72,
    });
    const innerWallMat = new THREE.MeshStandardMaterial({
      color: 0xc85a32,
      roughness: 0.68,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.35,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      roughness: 0.45,
    });

    const outerBound = DIB3D_ARENA_HALF - 0.4;
    const outerSpan = DIB3D_ARENA_HALF * 2;
    const outerH = 2.05;
    for (const ws of [
      { x: 0, z: -outerBound, w: outerSpan, d: 1.1 },
      { x: 0, z: outerBound, w: outerSpan, d: 1.1 },
      { x: -outerBound, z: 0, w: 1.1, d: outerSpan },
      { x: outerBound, z: 0, w: 1.1, d: outerSpan },
    ]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ws.w, outerH, ws.d), outerWallMat);
      wall.position.set(ws.x, outerH / 2, ws.z);
      wall.receiveShadow = true;
      wall.castShadow = true;
      envGroup.add(wall);

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(ws.w + 0.14, 0.2, ws.d + 0.14),
        capMat
      );
      cap.position.set(ws.x, outerH + 0.08, ws.z);
      envGroup.add(cap);
    }

    // Interior Cutaway Medina Walls (1.68m tall: Zellige base + Terracotta body + Cream cap)
    const cutawayH = 1.68;
    const lanternGlassMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
    const lanternBrassMat = new THREE.MeshStandardMaterial({
      color: 0x78350f,
      metalness: 0.6,
      roughness: 0.35,
    });

    DIB3D_WALL_SEGMENTS.forEach((seg, idx) => {
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(seg.w + 0.06, 0.28, seg.d + 0.06),
        trimMat
      );
      trim.position.set(seg.x, 0.14, seg.z);
      envGroup.add(trim);

      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(seg.w, cutawayH - 0.28, seg.d),
        innerWallMat
      );
      wall.position.set(seg.x, 0.28 + (cutawayH - 0.28) / 2, seg.z);
      wall.receiveShadow = true;
      wall.castShadow = true;
      envGroup.add(wall);

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(seg.w + 0.12, 0.18, seg.d + 0.12),
        capMat
      );
      cap.position.set(seg.x, cutawayH + 0.07, seg.z);
      envGroup.add(cap);

      // Decorative Moroccan Brass Lantern finials on the 8 Inner Riad Courtyard walls
      if (idx < 8) {
        const lx = seg.w > seg.d ? seg.x + (seg.x < 0 ? seg.w * 0.35 : -seg.w * 0.35) : seg.x;
        const lz = seg.d > seg.w ? seg.z + (seg.z < 0 ? seg.d * 0.35 : -seg.d * 0.35) : seg.z;
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.18, 0.14, 8),
          lanternBrassMat
        );
        base.position.set(lx, cutawayH + 0.22, lz);
        envGroup.add(base);

        const globe = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.2, 0),
          lanternGlassMat
        );
        globe.position.set(lx, cutawayH + 0.44, lz);
        envGroup.add(globe);
      }
    });

    // Soft Ground Vision Vignette Ring (shows active warm lantern vision radius!)
    const visionVignetteTex = buildVisionVignetteTexture();
    const visionMaskMat = new THREE.MeshBasicMaterial({
      map: visionVignetteTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.92,
    });
    const visionMaskMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      visionMaskMat
    );
    visionMaskMesh.rotation.x = -Math.PI / 2;
    visionMaskMesh.position.set(localPosRef.current.x, 0.055, localPosRef.current.z);
    visionMaskMesh.renderOrder = 2;
    scene.add(visionMaskMesh);

    // Central Emergency Drum Station at (0, 0)
    const drumStation = buildCentralDrumStation();
    drumStation.position.set(DIB3D_CENTRAL_DRUM.x, 0, DIB3D_CENTRAL_DRUM.z);
    envGroup.add(drumStation);

    // 10 Interactive 3D Moroccan Task Stations
    const taskStationBeacons = new Map<Dib3DTaskStationId, THREE.Group>();
    for (const st of DIB3D_TASK_STATIONS) {
      const built = buildTaskStation3D(st.id, st.color);
      built.root.position.set(st.x, 0, st.z);
      envGroup.add(built.root);
      taskStationBeacons.set(st.id, built.beacon);
    }

    // 6 Sewer Vents
    const ventMeshes = new Map<string, THREE.Group>();
    for (const v of DIB3D_VENTS) {
      const vm = buildSewerVentMesh();
      vm.position.set(v.x, 0, v.z);
      envGroup.add(vm);
      ventMeshes.set(v.id, vm);
    }

    // Electric Box at (28, 0)
    const electricBox = buildElectricBoxMesh();
    electricBox.root.position.set(DIB3D_ELECTRIC_BOX.x, 0, DIB3D_ELECTRIC_BOX.z);
    electricBox.root.rotation.y = -Math.PI / 2;
    envGroup.add(electricBox.root);

    // Local Player Halo Ring + Target Lock Ring
    const myRingMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.68, 0.88, 32),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
      })
    );
    myRingMesh.rotation.x = -Math.PI / 2;
    myRingMesh.position.y = 0.06;
    myRingMesh.renderOrder = 3;
    scene.add(myRingMesh);

    const targetHighlightRing = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 1.08, 28),
      new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
      })
    );
    targetHighlightRing.rotation.x = -Math.PI / 2;
    targetHighlightRing.position.y = 0.065;
    targetHighlightRing.renderOrder = 3;
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
      isShadow: boolean;
      lastX: number;
      lastZ: number;
    }

    const playerMeshes = new Map<string, CharacterEntry>();
    const bodyMeshes = new Map<string, THREE.Group>();

    const buildCharacter = (
      outfitColor: number,
      isGhost: boolean,
      isShadow: boolean,
      displayName: string,
      badgeText?: string,
      badgeColor?: string
    ): Omit<
      CharacterEntry,
      "ver" | "color" | "badgeKey" | "isGhost" | "isShadow" | "lastX" | "lastZ"
    > => {
      const root = new THREE.Group();
      const visual = new THREE.Group();
      root.add(visual);

      // Crisp ground ring under every character for Top-Down 3D readability
      const footRing = new THREE.Mesh(
        new THREE.RingGeometry(0.48, 0.62, 24),
        new THREE.MeshBasicMaterial({
          color: isGhost ? 0x38bdf8 : isShadow ? 0xa855f7 : outfitColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: isGhost ? 0.45 : 0.85,
        })
      );
      footRing.rotation.x = -Math.PI / 2;
      footRing.position.y = 0.045;
      footRing.renderOrder = 3;
      root.add(footRing);

      let mixer: THREE.AnimationMixer | null = null;
      const actions: Record<string, THREE.AnimationAction> = {};

      if (loadedAssets?.hunter) {
        loadedAssets.hunter.scene.updateMatrixWorld(true);
        const cloned = SkeletonUtils.clone(loadedAssets.hunter.scene);
        cloned.scale.setScalar((HUNTER_HEIGHT * 1.04) / 4.79);
        cloned.position.set(0, isGhost ? 0.35 : 0, 0);

        cloned.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = !isGhost && !isShadow;
            mesh.receiveShadow = !isGhost;
            mesh.frustumCulled = false;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (mat && "color" in mat) {
              const m = mat.clone();
              const name = (m.name || "").toLowerCase();
              if (isGhost) {
                m.color.set(0x38bdf8);
                m.transparent = true;
                m.opacity = 0.44;
              } else if (isShadow) {
                m.color.set(0x1e1b4b);
                if ("emissive" in m) {
                  m.emissive.set(0x6d28d9);
                  m.emissiveIntensity = 0.65;
                }
                m.transparent = true;
                m.opacity = 0.86;
              } else if (
                name.includes("main") ||
                name.includes("orange") ||
                name.includes("yellow")
              ) {
                m.color.set(outfitColor);
                m.roughness = 0.35;
                m.metalness = 0.12;
              } else if (name.includes("grey") || name.includes("gray")) {
                m.color.set(0xf8fafc);
                m.roughness = 0.32;
              } else if (name.includes("black")) {
                m.color.set(0x0f172a);
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
          new THREE.CapsuleGeometry(0.38, 0.78, 10, 16),
          new THREE.MeshStandardMaterial({
            color: isGhost ? 0x38bdf8 : isShadow ? 0x1e1b4b : outfitColor,
            transparent: isGhost || isShadow,
            opacity: isGhost ? 0.45 : isShadow ? 0.85 : 1,
          })
        );
        fallback.position.y = 0.82;
        visual.add(fallback);
      }

      const nameSprite = createNameTagSprite(displayName, badgeText, badgeColor);
      nameSprite.position.set(0, 2.38, 0);
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

    // 5. Keyboard Controls (Top-Down Broadcast Camera needs zero manual camera dragging!)
    const keysPressed: Record<string, boolean> = {};
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed[e.code] = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

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
    let smoothedVisionRadius = 13.5;

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
      const blindedBySabotage = isLightsOut && role !== "WOLF" && amIAlive;

      // Process instant FX queue
      if (fxQueueRef?.current && fxQueueRef.current.length > 0) {
        const q = fxQueueRef.current.splice(0, fxQueueRef.current.length);
        for (const fx of q) {
          if (fx.k === "kill" || fx.k === "shoot") {
            effects.poof(fx.x, fx.z);
          } else if (fx.k === "vent" || fx.k === "shadow") {
            effects.smoke(fx.x, fx.z);
          } else if (fx.k === "task" || fx.k === "fix" || fx.k === "scan") {
            effects.notes(fx.x, fx.z);
          }
        }
      }

      // Dynamic Warm Lantern Lighting + Vision Radius for Lights Sabotage!
      const targetHemi = blindedBySabotage ? 0.38 : 1.25;
      const targetMoon = blindedBySabotage ? 0.32 : 1.45;
      hemiLight.intensity += (targetHemi - hemiLight.intensity) * damp(6, dt);
      moonLight.intensity += (targetMoon - moonLight.intensity) * damp(6, dt);

      const targetVisionRadius = !amIAlive
        ? 999
        : role === "WOLF"
        ? 16.8
        : blindedBySabotage
        ? 5.8
        : 13.5;

      if (amIAlive) {
        smoothedVisionRadius +=
          (targetVisionRadius - smoothedVisionRadius) * damp(7, dt);
      }
      const activeVisionRadius = amIAlive ? smoothedVisionRadius : 999;

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

      // Local Player Direct Screen-Space Movement (1:1 with Top-Down Camera & Minimap!)
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
          const norm = Math.max(1, mag);
          const moveX = jx / norm;
          const moveZ = jy / norm;
          const baseSpeed = !amIAlive ? 8.4 : role === "WOLF" ? 7.4 : 6.9;

          const rawX = localPosRef.current.x + moveX * baseSpeed * dt;
          const rawZ = localPosRef.current.z + moveZ * baseSpeed * dt;
          const resolved = resolveDib3DCollisions(rawX, rawZ, 0.45, !amIAlive);

          localPosRef.current.x = resolved.x;
          localPosRef.current.z = resolved.z;

          const targetFacing = Math.atan2(moveX, moveZ);
          localPosRef.current.rotY +=
            angleDelta(localPosRef.current.rotY, targetFacing) * damp(16, dt);
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

      // Update Personal Hero Lantern & Soft Ground Vision Vignette Ring
      heroLantern.position.set(myX, 4.4, myZ);
      heroLantern.distance = blindedBySabotage ? 10.5 : 22;
      heroLantern.intensity = blindedBySabotage ? 2.65 : 2.15;

      if (!amIAlive) {
        visionMaskMesh.visible = false;
      } else {
        visionMaskMesh.visible = true;
        visionMaskMesh.position.set(myX, 0.055, myZ);
        const maskScale = Math.max(0.22, smoothedVisionRadius / 20.5);
        visionMaskMesh.scale.set(maskScale, maskScale, 1);
        const targetMaskOpacity = blindedBySabotage
          ? 0.96
          : role === "WOLF"
          ? 0.68
          : 0.82;
        visionMaskMat.opacity +=
          (targetMaskOpacity - visionMaskMat.opacity) * damp(7, dt);
      }

      // Sync Dead Bodies on the Ground (Hidden behind Medina walls & outside vision!)
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
        const distToBody = Math.hypot(b.x - myX, b.z - myZ);
        bMesh.visible =
          !amIAlive ||
          (distToBody <= activeVisionRadius &&
            hasMedinaLineOfSight(myX, myZ, b.x, b.z));
      }
      for (const [id, mesh] of bodyMeshes.entries()) {
        if (!seenBodyIds.has(id)) {
          scene.remove(mesh);
          bodyMeshes.delete(id);
        }
      }

      // Compute Smart Proximity Radar for Contextual Action Buttons (Requires Line-of-Sight!)
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
        if (dist <= 3.7 && hasMedinaLineOfSight(myX, myZ, px, pz)) {
          const ang = Math.atan2(px - myX, pz - myZ);
          const angDiff = Math.abs(angleDelta(localPosRef.current.rotY, ang));
          const score = dist + angDiff * 0.35;
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
        targetHighlightRing.position.set(nearestTargetPos.x, 0.065, nearestTargetPos.z);
      } else {
        targetHighlightRing.visible = false;
      }

      // Check nearest Dead Body (within 4.2m AND in Line-of-Sight!)
      let nearestBodyId: string | null = null;
      let nearestBodyVictim: string | null = null;
      let bestBodyDist = 4.2;
      for (const b of deadBodiesRef.current || []) {
        const d = Math.hypot(b.x - myX, b.z - myZ);
        if (d < bestBodyDist && hasMedinaLineOfSight(myX, myZ, b.x, b.z)) {
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

      // Render & Animate Players (with True 2D Medina Wall Line-of-Sight Stealth!)
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

        const isShadow =
          !isGhost &&
          (Boolean(ent.shadowUntil && nowEpoch < ent.shadowUntil) ||
            Boolean(isPeerFresh && peer?.s));

        // In 3D, NEVER show real player names! Show Moroccan Mask Icon + Title (or Shadow Cloak ❓)!
        const maskLabel = `${ent.maskEmoji || "🎭"} ${ent.maskName || "مقنّع"}`;
        const displayName = isShadow
          ? "طيف الظلام ❓"
          : isMe
          ? `${maskLabel} (أنت)`
          : maskLabel;

        const isFellowWolf =
          role === "WOLF" && fellowWolfIdsRef.current.includes(ent.playerId);
        const seerAlignment = seerKnownRef.current[ent.playerId];

        let badgeText: string | undefined;
        let badgeColor: string | undefined;
        if (isGhost) {
          badgeText = "👻";
          badgeColor = "#38bdf8";
        } else if (isShadow) {
          badgeText = "🌑";
          badgeColor = "#c084fc";
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

        const badgeKey = `${displayName}|${badgeText || ""}|${badgeColor || ""}|${isShadow ? 1 : 0}`;

        let entry = playerMeshes.get(ent.playerId);
        if (
          !entry ||
          entry.ver !== assetsVersion ||
          entry.color !== ent.outfitColor ||
          entry.isGhost !== isGhost ||
          entry.isShadow !== isShadow ||
          entry.badgeKey !== badgeKey
        ) {
          const prevX = entry?.lastX ?? ent.x;
          const prevZ = entry?.lastZ ?? ent.z;
          if (entry) scene.remove(entry.root);

          const built = buildCharacter(
            ent.outfitColor,
            isGhost,
            isShadow,
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
            isShadow,
            lastX: prevX,
            lastZ: prevZ,
          };
          playerMeshes.set(ent.playerId, entry);
        }

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
          myRingMesh.position.set(targetX, 0.06, targetZ);
          entry.root.visible = true;
        } else {
          const blend = damp(14, dt);
          entry.root.position.x += (targetX - entry.root.position.x) * blend;
          entry.root.position.z += (targetZ - entry.root.position.z) * blend;
          entry.root.rotation.y +=
            angleDelta(entry.root.rotation.y, targetRot) * blend;

          // Stealth Line-of-Sight Culling: Hide players behind Medina walls or outside lantern vision!
          if (!amIAlive) {
            entry.root.visible = true;
          } else {
            const distToMe = Math.hypot(
              entry.root.position.x - myX,
              entry.root.position.z - myZ
            );
            if (isFellowWolf && distToMe <= 18) {
              entry.root.visible = true;
            } else {
              entry.root.visible =
                distToMe <= activeVisionRadius &&
                hasMedinaLineOfSight(
                  myX,
                  myZ,
                  entry.root.position.x,
                  entry.root.position.z
                );
            }
          }
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

      // Fixed Angled Top-Down 3D Broadcast Camera (Portrait + Landscape Optimized!)
      const isPortrait = camera.aspect < 1;
      const camHeight = isPortrait ? 20.5 : 16.5;
      const camBackZ = isPortrait ? 13.6 : 11.0;
      const desiredCamX = myX;
      const desiredCamY = camHeight;
      const desiredCamZ = myZ + camBackZ;

      const camBlend = damp(12, dt);
      camera.position.x += (desiredCamX - camera.position.x) * camBlend;
      camera.position.y += (desiredCamY - camera.position.y) * camBlend;
      camera.position.z += (desiredCamZ - camera.position.z) * camBlend;
      camera.lookAt(camera.position.x, 0.35, camera.position.z - camBackZ - 0.5);

      renderer.render(scene, camera);
    };

    animFrameId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(animFrameId);
      resizeObs?.disconnect();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("resize", handleResize);
      medinaFloorTex.dispose();
      visionVignetteTex.dispose();
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
