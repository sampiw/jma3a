"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  CORSAIR_STYLES,
  CannonShotRecord,
  CorsairStyleDef,
  PIRATES_ISLANDS,
  PirateShipState,
  SEA_ARENA_RADIUS,
  SeaIslandObstacle,
  SeaLootCrate,
} from "@/games/pirates3d/types";

export interface LocalShipControlRef {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  steerInput: number; // -1 (right) to +1 (left)
  throttleInput: number; // -1 (reverse) to +1 (full sails)
  aimYawOffset: number; // camera orbit offset relative to ship yaw
  aimDistance: number;
  lockedTargetId: string | null;
  targetWorldX: number;
  targetWorldZ: number;
}

interface Pirates3DCanvasProps {
  myShipId: string;
  ships: Record<string, PirateShipState>;
  lootCrates: SeaLootCrate[];
  recentShots: CannonShotRecord[];
  controlRef: React.MutableRefObject<LocalShipControlRef>;
  onQuickFire?: () => void;
}

function waveHeightAt(x: number, z: number, timeSec: number): number {
  return (
    Math.sin(x * 0.22 + timeSec * 2.1) * 0.22 +
    Math.cos(z * 0.19 + timeSec * 1.7) * 0.18 +
    Math.sin((x + z) * 0.14 - timeSec * 1.3) * 0.12
  );
}

/**
 * Generates high-resolution 512x512 procedural PBR textures & bump maps for ships, sails, water, and fortresses
 */
function createNavalPBRTextures() {
  // 1. Hull Wood Planks (Color + Bump)
  const woodCanvas = document.createElement("canvas");
  woodCanvas.width = 512;
  woodCanvas.height = 512;
  const wCtx = woodCanvas.getContext("2d")!;
  wCtx.fillStyle = "#4a2511";
  wCtx.fillRect(0, 0, 512, 512);

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bCtx = bumpCanvas.getContext("2d")!;
  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, 512, 512);

  const plankRows = 8;
  const plankH = 512 / plankRows;
  for (let r = 0; r < plankRows; r++) {
    const y = r * plankH;
    wCtx.fillStyle = r % 2 === 0 ? "#5c2e14" : "#43200d";
    wCtx.fillRect(0, y + 2, 512, plankH - 4);

    // Wood grain lines
    wCtx.strokeStyle = "rgba(25, 10, 3, 0.36)";
    wCtx.lineWidth = 2;
    for (let g = 0; g < 6; g++) {
      const gy = y + 8 + g * (plankH / 6);
      wCtx.beginPath();
      wCtx.moveTo(0, gy);
      wCtx.bezierCurveTo(170, gy + 5, 340, gy - 5, 512, gy);
      wCtx.stroke();
    }

    // Horizontal dark seam
    wCtx.fillStyle = "#1a0903";
    wCtx.fillRect(0, y, 512, 3);
    bCtx.fillStyle = "#202020";
    bCtx.fillRect(0, y, 512, 4);

    // Brass rivets & plank joints
    const jointX = ((r * 173) % 380) + 60;
    wCtx.fillRect(jointX, y, 3, plankH);
    wCtx.fillStyle = "#d97706";
    wCtx.beginPath();
    wCtx.arc(jointX - 10, y + plankH * 0.3, 3, 0, Math.PI * 2);
    wCtx.arc(jointX - 10, y + plankH * 0.7, 3, 0, Math.PI * 2);
    wCtx.arc(jointX + 12, y + plankH * 0.3, 3, 0, Math.PI * 2);
    wCtx.arc(jointX + 12, y + plankH * 0.7, 3, 0, Math.PI * 2);
    wCtx.fill();
  }

  const hullWoodTex = new THREE.CanvasTexture(woodCanvas);
  hullWoodTex.wrapS = THREE.RepeatWrapping;
  hullWoodTex.wrapT = THREE.RepeatWrapping;
  hullWoodTex.anisotropy = 4;

  const hullBumpTex = new THREE.CanvasTexture(bumpCanvas);
  hullBumpTex.wrapS = THREE.RepeatWrapping;
  hullBumpTex.wrapT = THREE.RepeatWrapping;

  // 2. Weathered Oak Deck Planks Texture
  const deckCanvas = document.createElement("canvas");
  deckCanvas.width = 512;
  deckCanvas.height = 512;
  const dCtx = deckCanvas.getContext("2d")!;
  dCtx.fillStyle = "#784421";
  dCtx.fillRect(0, 0, 512, 512);
  for (let c = 0; c < 12; c++) {
    const x = c * (512 / 12);
    dCtx.fillStyle = c % 2 === 0 ? "#8a5229" : "#6e3f1c";
    dCtx.fillRect(x + 2, 0, 512 / 12 - 3, 512);
    dCtx.fillStyle = "#2b1608";
    dCtx.fillRect(x, 0, 2, 512);
  }
  const deckTex = new THREE.CanvasTexture(deckCanvas);
  deckTex.anisotropy = 4;

  // 3. Animated Caustic Ocean Texture
  const oceanCanvas = document.createElement("canvas");
  oceanCanvas.width = 512;
  oceanCanvas.height = 512;
  const oCtx = oceanCanvas.getContext("2d")!;
  const oGrad = oCtx.createLinearGradient(0, 0, 512, 512);
  oGrad.addColorStop(0, "#0369a1");
  oGrad.addColorStop(0.5, "#0284c7");
  oGrad.addColorStop(1, "#0f4c81");
  oCtx.fillStyle = oGrad;
  oCtx.fillRect(0, 0, 512, 512);

  // Subtle caustic wave arcs
  oCtx.strokeStyle = "rgba(125, 211, 252, 0.26)";
  oCtx.lineWidth = 3;
  for (let i = 0; i < 36; i++) {
    const cx = (i * 97) % 512;
    const cy = (i * 149) % 512;
    oCtx.beginPath();
    oCtx.arc(cx, cy, 24 + (i % 5) * 9, 0.2, Math.PI - 0.2);
    oCtx.stroke();
  }
  const oceanTex = new THREE.CanvasTexture(oceanCanvas);
  oceanTex.wrapS = THREE.RepeatWrapping;
  oceanTex.wrapT = THREE.RepeatWrapping;
  oceanTex.repeat.set(14, 14);

  // 4. Kasbah / Sqala Sandstone Fortress Texture
  const stoneCanvas = document.createElement("canvas");
  stoneCanvas.width = 512;
  stoneCanvas.height = 512;
  const sCtx = stoneCanvas.getContext("2d")!;
  sCtx.fillStyle = "#b48352";
  sCtx.fillRect(0, 0, 512, 512);
  const blockRows = 8;
  const bh = 512 / blockRows;
  for (let r = 0; r < blockRows; r++) {
    const y = r * bh;
    const offset = (r % 2) * 48;
    for (let c = -1; c < 6; c++) {
      const x = c * 96 + offset;
      sCtx.fillStyle = (r + c) % 2 === 0 ? "#c69463" : "#a67446";
      sCtx.fillRect(x + 3, y + 3, 90, bh - 6);
      sCtx.strokeStyle = "#5c3a1e";
      sCtx.lineWidth = 3;
      sCtx.strokeRect(x + 2, y + 2, 92, bh - 4);
    }
  }
  const stoneTex = new THREE.CanvasTexture(stoneCanvas);
  stoneTex.wrapS = THREE.RepeatWrapping;
  stoneTex.wrapT = THREE.RepeatWrapping;
  stoneTex.repeat.set(2, 2);

  // 5. Golden Island Sand Texture
  const sandCanvas = document.createElement("canvas");
  sandCanvas.width = 256;
  sandCanvas.height = 256;
  const saCtx = sandCanvas.getContext("2d")!;
  saCtx.fillStyle = "#eab308";
  saCtx.fillRect(0, 0, 256, 256);
  saCtx.fillStyle = "#fde047";
  for (let i = 0; i < 180; i++) {
    saCtx.fillRect((i * 73) % 256, (i * 131) % 256, 3, 3);
  }
  const sandTex = new THREE.CanvasTexture(sandCanvas);

  return {
    hullWoodTex,
    hullBumpTex,
    deckTex,
    oceanTex,
    stoneTex,
    sandTex,
  };
}

function createCorsairSailTexture(style: CorsairStyleDef): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  // Woven linen sail base
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, style.sailPrimary);
  grad.addColorStop(1, "#e2e8f0");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Vertical stitched cloth panel lines
  ctx.strokeStyle = "rgba(15, 23, 42, 0.14)";
  ctx.lineWidth = 3;
  for (let x = 64; x < 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  // Royal top & bottom stripes in faction secondary color
  ctx.fillStyle = style.sailSecondary;
  ctx.fillRect(0, 0, 512, 48);
  ctx.fillRect(0, 464, 512, 48);

  // Ornate inner frame
  ctx.strokeStyle = style.sailSecondary;
  ctx.lineWidth = 10;
  ctx.strokeRect(22, 64, 468, 384);

  // Center Medallion Ring
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.beginPath();
  ctx.arc(256, 256, 118, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = style.sailSecondary;
  ctx.stroke();

  // Giant Corsair Emblem
  ctx.font = "900 130px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(style.emblem, 256, 266);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function createBowedSailGeometry(width: number, height: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, height, 14, 10);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const u = (x / width) + 0.5;
    const v = (y / height) + 0.5;
    // Billow forward in +Z like a wind-filled square sail
    const billow =
      Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.55 +
      Math.sin(v * Math.PI) * 0.18;
    pos.setZ(i, billow);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a multi-part 3D Corsair Galleon with hull planks, stern castle, 6 broadside cannons,
 * rotating deck cannon, 2 masts, crow's nest, 2 billowing sails, and animated pennant flag.
 */
function createCorsairGalleon3D(
  style: CorsairStyleDef,
  textures: ReturnType<typeof createNavalPBRTextures>,
  sailTexCache: Map<string, THREE.CanvasTexture>
): {
  root: THREE.Group;
  hullPivot: THREE.Group;
  turretPivot: THREE.Group;
  flagMesh: THREE.Mesh;
  mainSail: THREE.Mesh;
  foreSail: THREE.Mesh;
} {
  const root = new THREE.Group();
  const hullPivot = new THREE.Group();
  root.add(hullPivot);

  let sailTex = sailTexCache.get(style.id);
  if (!sailTex) {
    sailTex = createCorsairSailTexture(style);
    sailTexCache.set(style.id, sailTex);
  }

  const hullMat = new THREE.MeshStandardMaterial({
    map: textures.hullWoodTex,
    bumpMap: textures.hullBumpTex,
    bumpScale: 0.06,
    roughness: 0.52,
    metalness: 0.12,
  });

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: style.hullColor,
    roughness: 0.4,
    metalness: 0.25,
  });

  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: style.trimColor,
    roughness: 0.22,
    metalness: 0.78,
  });

  const deckMat = new THREE.MeshStandardMaterial({
    map: textures.deckTex,
    roughness: 0.6,
    metalness: 0.08,
  });

  const bronzeCannonMat = new THREE.MeshStandardMaterial({
    color: 0x27272a,
    metalness: 0.82,
    roughness: 0.25,
  });

  // 1. Main Midship Hull Body
  const lowerHull = new THREE.Mesh(
    new THREE.BoxGeometry(2.15, 0.95, 4.3),
    hullMat
  );
  lowerHull.position.set(0, 0.48, -0.1);
  lowerHull.castShadow = true;
  lowerHull.receiveShadow = true;
  hullPivot.add(lowerHull);

  // 2. Sculpted Pointed Bow (Front +Z)
  const bowCone = new THREE.Mesh(
    new THREE.ConeGeometry(1.52, 2.2, 4),
    hullMat
  );
  bowCone.rotation.x = Math.PI / 2;
  bowCone.rotation.y = Math.PI / 4;
  bowCone.scale.set(1, 1, 0.62);
  bowCone.position.set(0, 0.56, 2.95);
  bowCone.castShadow = true;
  hullPivot.add(bowCone);

  // Golden Bowsprit Spar & Ramming Figurehead
  const bowsprit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.09, 2.2, 10),
    hullMat
  );
  bowsprit.rotation.x = Math.PI / 2 - 0.28;
  bowsprit.position.set(0, 1.15, 3.85);
  hullPivot.add(bowsprit);

  const figurehead = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.24, 0),
    goldTrimMat
  );
  figurehead.position.set(0, 0.82, 3.65);
  hullPivot.add(figurehead);

  // 3. Wooden Main Deck + Gunwale Rails
  const mainDeck = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.12, 4.25),
    deckMat
  );
  mainDeck.position.set(0, 0.98, -0.1);
  mainDeck.receiveShadow = true;
  hullPivot.add(mainDeck);

  // Port & Starboard Gunwales with Gold Strakes
  for (const sideSign of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.34, 4.2),
      darkTrimMat
    );
    rail.position.set(sideSign * 1.04, 1.16, -0.1);
    hullPivot.add(rail);

    const goldStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.09, 4.35),
      goldTrimMat
    );
    goldStripe.position.set(sideSign * 1.1, 0.82, -0.1);
    hullPivot.add(goldStripe);
  }

  // 4. Raised Stern Castle (Aft Quarterdeck at -Z) with Glowing Captain Windows
  const sternCastle = new THREE.Mesh(
    new THREE.BoxGeometry(2.08, 0.85, 1.55),
    hullMat
  );
  sternCastle.position.set(0, 1.35, -1.55);
  sternCastle.castShadow = true;
  hullPivot.add(sternCastle);

  const sternRoof = new THREE.Mesh(
    new THREE.BoxGeometry(2.16, 0.12, 1.65),
    deckMat
  );
  sternRoof.position.set(0, 1.8, -1.55);
  hullPivot.add(sternRoof);

  // Glowing Amber Captain's Cabin Windows on Stern
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
  for (const wx of [-0.55, 0, 0.55]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.06), windowMat);
    win.position.set(wx, 1.4, -2.33);
    hullPivot.add(win);
  }

  // Stern Golden Lantern
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xfacc15 })
  );
  lantern.position.set(0, 2.08, -2.35);
  hullPivot.add(lantern);

  // 5. Six Broadside Cannons (3 Port, 3 Starboard)
  for (const sideSign of [-1, 1]) {
    for (const cz of [-0.4, 0.45, 1.3]) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.095, 0.55, 10),
        bronzeCannonMat
      );
      barrel.rotation.z = (sideSign * Math.PI) / 2;
      barrel.position.set(sideSign * 1.18, 1.15, cz);
      hullPivot.add(barrel);
    }
  }

  // 6. Rotating Central Swivel Cannon Turret (Visual Aim Indicator!)
  const turretPivot = new THREE.Group();
  turretPivot.position.set(0, 1.06, 0.85);
  hullPivot.add(turretPivot);

  const turretBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.38, 0.22, 14),
    goldTrimMat
  );
  turretBase.position.y = 0.11;
  turretPivot.add(turretBase);

  const mainCannonBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.15, 0.95, 12),
    bronzeCannonMat
  );
  mainCannonBarrel.rotation.x = Math.PI / 2 - 0.22;
  mainCannonBarrel.position.set(0, 0.28, 0.38);
  turretPivot.add(mainCannonBarrel);

  // 7. Masts, Crow's Nest, Yardarms & Curved Billowing Sails
  const sailMat = new THREE.MeshStandardMaterial({
    map: sailTex,
    roughness: 0.45,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  // Main Mast
  const mainMast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, 4.3, 12),
    hullMat
  );
  mainMast.position.set(0, 3.0, -0.15);
  mainMast.castShadow = true;
  hullPivot.add(mainMast);

  // Crow's Nest Basket
  const crowsNest = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.26, 0.32, 14),
    darkTrimMat
  );
  crowsNest.position.set(0, 4.65, -0.15);
  hullPivot.add(crowsNest);

  // Main Yardarm & Main Billowing Sail
  const mainYard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 2.9, 10),
    hullMat
  );
  mainYard.rotation.z = Math.PI / 2;
  mainYard.position.set(0, 4.15, -0.1);
  hullPivot.add(mainYard);

  const mainSail = new THREE.Mesh(createBowedSailGeometry(2.7, 2.2), sailMat);
  mainSail.position.set(0, 3.05, 0.02);
  mainSail.castShadow = true;
  hullPivot.add(mainSail);

  // Fore Mast & Fore Billowing Sail
  const foreMast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.11, 3.5, 12),
    hullMat
  );
  foreMast.position.set(0, 2.65, 1.55);
  foreMast.castShadow = true;
  hullPivot.add(foreMast);

  const foreYard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 2.25, 10),
    hullMat
  );
  foreYard.rotation.z = Math.PI / 2;
  foreYard.position.set(0, 3.65, 1.6);
  hullPivot.add(foreYard);

  const foreSail = new THREE.Mesh(createBowedSailGeometry(2.1, 1.65), sailMat);
  foreSail.position.set(0, 2.8, 1.68);
  foreSail.castShadow = true;
  hullPivot.add(foreSail);

  // 8. Topmast Waving Pennant Flag
  const flagGeo = new THREE.PlaneGeometry(1.15, 0.38, 8, 2);
  const flagMat = new THREE.MeshBasicMaterial({
    color: style.trimColor,
    side: THREE.DoubleSide,
  });
  const flagMesh = new THREE.Mesh(flagGeo, flagMat);
  flagMesh.position.set(0, 5.1, -0.72);
  flagMesh.rotation.y = Math.PI / 2;
  hullPivot.add(flagMesh);

  return {
    root,
    hullPivot,
    turretPivot,
    flagMesh,
    mainSail,
    foreSail,
  };
}

/**
 * Builds 3D Fortress & Lighthouse Islands with palm trees, towers, and surf rings
 */
function buildIsland3D(
  isl: SeaIslandObstacle,
  textures: ReturnType<typeof createNavalPBRTextures>
): { group: THREE.Group; surfRing: THREE.Mesh; beaconMesh?: THREE.Object3D } {
  const group = new THREE.Group();
  group.position.set(isl.x, 0, isl.z);

  const sandMat = new THREE.MeshStandardMaterial({
    map: textures.sandTex,
    roughness: 0.78,
    metalness: 0.05,
  });

  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.stoneTex,
    roughness: 0.62,
    metalness: 0.12,
  });

  // Expanding white surf foam ring on the water surface
  const surfRing = new THREE.Mesh(
    new THREE.RingGeometry(isl.radius * 0.96, isl.radius * 1.18, 36),
    new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    })
  );
  surfRing.rotation.x = -Math.PI / 2;
  surfRing.position.y = 0.08;
  group.add(surfRing);

  // Sandy Island Mound
  const mound = new THREE.Mesh(
    new THREE.CylinderGeometry(isl.radius * 0.78, isl.radius, 1.6, 24),
    sandMat
  );
  mound.position.y = 0.55;
  mound.receiveShadow = true;
  mound.castShadow = true;
  group.add(mound);

  let beaconMesh: THREE.Object3D | undefined;

  if (isl.kind === "FORTRESS") {
    // Sqala Fortress Keep in the center of the sea
    const outerWall = new THREE.Mesh(
      new THREE.CylinderGeometry(isl.radius * 0.62, isl.radius * 0.68, 3.2, 8),
      stoneMat
    );
    outerWall.position.y = 2.4;
    outerWall.castShadow = true;
    outerWall.receiveShadow = true;
    group.add(outerWall);

    // 4 Corner Bastion Towers
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + Math.PI / 4;
      const tx = Math.cos(ang) * (isl.radius * 0.58);
      const tz = Math.sin(ang) * (isl.radius * 0.58);
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(1.35, 1.55, 4.6, 12),
        stoneMat
      );
      tower.position.set(tx, 3.0, tz);
      tower.castShadow = true;
      group.add(tower);

      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1.15, 14, 12),
        new THREE.MeshStandardMaterial({
          color: 0xd97706,
          metalness: 0.65,
          roughness: 0.25,
        })
      );
      dome.position.set(tx, 5.3, tz);
      group.add(dome);
    }
  } else if (isl.kind === "LIGHTHOUSE") {
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.55, 6.2, 16),
      stoneMat
    );
    tower.position.y = 3.8;
    tower.castShadow = true;
    group.add(tower);

    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 1.1, 12),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    lantern.position.y = 7.3;
    group.add(lantern);
    beaconMesh = lantern;
  }

  // Add 3D Moroccan Palm Trees around the island beach
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    roughness: 0.8,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x15803d,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });

  const palmCount = isl.kind === "FORTRESS" ? 4 : 2;
  for (let p = 0; p < palmCount; p++) {
    const pang = (p / palmCount) * Math.PI * 2 + 0.4;
    const pr = isl.radius * 0.72;
    const palmGroup = new THREE.Group();
    palmGroup.position.set(Math.cos(pang) * pr, 1.25, Math.sin(pang) * pr);

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.24, 2.5, 8),
      trunkMat
    );
    trunk.position.y = 1.2;
    trunk.rotation.z = 0.12;
    palmGroup.add(trunk);

    for (let f = 0; f < 6; f++) {
      const fang = (f / 6) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 1.45), leafMat);
      frond.position.set(
        Math.sin(fang) * 0.65 - 0.15,
        2.4,
        Math.cos(fang) * 0.65
      );
      frond.rotation.y = fang;
      frond.rotation.x = 0.35;
      palmGroup.add(frond);
    }
    group.add(palmGroup);
  }

  return { group, surfRing, beaconMesh };
}

function updateShipOverheadCanvas(
  canvas: HTMLCanvasElement,
  ship: PirateShipState,
  style: CorsairStyleDef,
  isMe: boolean,
  isLockedTarget: boolean
) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background Pill
  ctx.fillStyle = isLockedTarget
    ? "rgba(159, 18, 57, 0.92)"
    : isMe
    ? "rgba(15, 23, 42, 0.92)"
    : "rgba(15, 23, 42, 0.82)";
  ctx.strokeStyle = isLockedTarget
    ? "#fda4af"
    : isMe
    ? "#facc15"
    : style.trimColor;
  ctx.lineWidth = isLockedTarget ? 5 : 3;

  ctx.beginPath();
  ctx.roundRect(8, 8, 240, 74, 18);
  ctx.fill();
  ctx.stroke();

  // Captain Name & Emblem
  ctx.font = "900 22px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const prefix = isLockedTarget ? "🎯 " : `${style.emblem} `;
  ctx.fillText(`${prefix}${ship.nickname.slice(0, 14)}`, 128, 30);

  // HP Bar Track
  ctx.fillStyle = "rgba(30, 41, 59, 0.95)";
  ctx.fillRect(24, 50, 208, 12);

  const hpPct = Math.max(0, Math.min(1, ship.hp / Math.max(1, ship.maxHp)));
  ctx.fillStyle =
    hpPct > 0.5 ? "#22c55e" : hpPct > 0.25 ? "#f59e0b" : "#ef4444";
  ctx.fillRect(24, 50, Math.round(208 * hpPct), 12);

  // Shield Bar Overlay
  if (ship.shield > 0) {
    const shPct = Math.max(0, Math.min(1, ship.shield / 80));
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(24, 65, Math.round(208 * shPct), 6);
  }
}

interface ActiveCannonballAnim {
  mesh: THREE.Mesh;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  progress: number;
  duration: number;
  peakHeight: number;
  hitShip: boolean;
}

interface WaterSplashEffect {
  ring: THREE.Mesh;
  droplets: Array<{
    mesh: THREE.Mesh;
    vx: number;
    vy: number;
    vz: number;
  }>;
  age: number;
  maxAge: number;
}

export default function Pirates3DCanvas({
  myShipId,
  ships,
  lootCrates,
  recentShots,
  controlRef,
}: Pirates3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const propsRef = useRef({
    myShipId,
    ships,
    lootCrates,
    recentShots,
  });
  propsRef.current = {
    myShipId,
    ships,
    lootCrates,
    recentShots,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c2d48);
    scene.fog = new THREE.FogExp2(0x0c2d48, 0.0065);

    const camera = new THREE.PerspectiveCamera(
      54,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.2,
      220
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Golden-Hour Atlantic Lighting
    const hemiLight = new THREE.HemisphereLight(0xfffbeb, 0x0369a1, 1.35);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfef08a, 2.2);
    sunLight.position.set(35, 52, 28);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 140;
    const d = 55;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);

    const textures = createNavalPBRTextures();
    const sailTexCache = new Map<string, THREE.CanvasTexture>();

    // Animated 3D Ocean Surface Mesh
    const oceanGeo = new THREE.PlaneGeometry(175, 175, 56, 56);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanBasePos = Float32Array.from(
      oceanGeo.attributes.position.array as ArrayLike<number>
    );
    const oceanMat = new THREE.MeshStandardMaterial({
      map: textures.oceanTex,
      roughness: 0.18,
      metalness: 0.38,
    });
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.receiveShadow = true;
    scene.add(oceanMesh);

    // Outer Sea Boundary Ring
    const boundaryRing = new THREE.Mesh(
      new THREE.RingGeometry(SEA_ARENA_RADIUS - 0.5, SEA_ARENA_RADIUS + 0.8, 64),
      new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
      })
    );
    boundaryRing.rotation.x = -Math.PI / 2;
    boundaryRing.position.y = 0.25;
    scene.add(boundaryRing);

    // Build 3D Islands & Sqala Fortress
    const islandNodes = PIRATES_ISLANDS.map((isl) => {
      const built = buildIsland3D(isl, textures);
      scene.add(built.group);
      return built;
    });

    const shipsGroup = new THREE.Group();
    scene.add(shipsGroup);

    const cratesGroup = new THREE.Group();
    scene.add(cratesGroup);

    const fxGroup = new THREE.Group();
    scene.add(fxGroup);

    // 3D Parabolic Aiming Trajectory Line & Water Target Reticle
    const aimPointsCount = 24;
    const aimPositions = new Float32Array(aimPointsCount * 3);
    const aimGeo = new THREE.BufferGeometry();
    aimGeo.setAttribute("position", new THREE.BufferAttribute(aimPositions, 3));
    const aimMat = new THREE.LineBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.88,
    });
    const aimArcLine = new THREE.Line(aimGeo, aimMat);
    scene.add(aimArcLine);

    const aimReticleGroup = new THREE.Group();
    const outerReticle = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 1.95, 28),
      new THREE.MeshBasicMaterial({
        color: 0x34d399,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      })
    );
    outerReticle.rotation.x = -Math.PI / 2;
    aimReticleGroup.add(outerReticle);

    const innerReticle = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.72, 20),
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      })
    );
    innerReticle.rotation.x = -Math.PI / 2;
    aimReticleGroup.add(innerReticle);
    scene.add(aimReticleGroup);

    const shipNodes = new Map<
      string,
      {
        root: THREE.Group;
        hullPivot: THREE.Group;
        turretPivot: THREE.Group;
        flagMesh: THREE.Mesh;
        badgeCanvas: HTMLCanvasElement;
        badgeTex: THREE.CanvasTexture;
        badgeSprite: THREE.Sprite;
        currX: number;
        currZ: number;
        currYaw: number;
        recoilRoll: number;
        lastBadgeHash: string;
        wakeCooldown: number;
      }
    >();

    const crateNodes = new Map<string, THREE.Group>();
    const seenShotIds = new Set<string>();
    const activeCannonballs: ActiveCannonballAnim[] = [];
    const activeSplashes: WaterSplashEffect[] = [];
    let cameraShake = 0;

    const spawnWaterOrHitExplosion = (
      x: number,
      z: number,
      isShipHit: boolean
    ) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.9, 28),
        new THREE.MeshBasicMaterial({
          color: isShipHit ? 0xf97316 : 0xe0f2fe,
          transparent: true,
          opacity: 0.95,
          side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.25, z);
      fxGroup.add(ring);

      const droplets: WaterSplashEffect["droplets"] = [];
      const count = isShipHit ? 16 : 12;
      const dropGeo = new THREE.DodecahedronGeometry(
        isShipHit ? 0.22 : 0.18,
        0
      );

      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + Math.random() * 0.3;
        const spd = (isShipHit ? 4.5 : 3.0) + Math.random() * 2.5;
        const mesh = new THREE.Mesh(
          dropGeo,
          new THREE.MeshBasicMaterial({
            color: isShipHit
              ? i % 2 === 0
                ? 0xfef08a
                : 0xea580c
              : 0xf0f9ff,
            transparent: true,
            opacity: 0.95,
          })
        );
        mesh.position.set(x, 0.5, z);
        fxGroup.add(mesh);
        droplets.push({
          mesh,
          vx: Math.cos(ang) * spd,
          vy: (isShipHit ? 7.5 : 6.0) + Math.random() * 2.5,
          vz: Math.sin(ang) * spd,
        });
      }

      activeSplashes.push({
        ring,
        droplets,
        age: 0,
        maxAge: isShipHit ? 0.75 : 0.6,
      });

      if (isShipHit) {
        cameraShake = 0.32;
      }
    };

    const spawnCannonballArc = (
      fromX: number,
      fromZ: number,
      toX: number,
      toZ: number,
      hitShip: boolean
    ) => {
      const ballMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 12, 12),
        new THREE.MeshStandardMaterial({
          color: 0x18181b,
          metalness: 0.85,
          roughness: 0.2,
          emissive: 0xf97316,
          emissiveIntensity: 0.55,
        })
      );
      ballMesh.position.set(fromX, 1.4, fromZ);
      fxGroup.add(ballMesh);

      const dist = Math.hypot(toX - fromX, toZ - fromZ);
      activeCannonballs.push({
        mesh: ballMesh,
        fromX,
        fromZ,
        toX,
        toZ,
        progress: 0,
        duration: Math.min(0.62, Math.max(0.28, dist * 0.015)),
        peakHeight: Math.min(6.5, Math.max(2.2, dist * 0.16)),
        hitShip,
      });
    };

    // Pointer Drag for Aiming Camera Orbit & Aim Distance
    let pointerDown: { x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      pointerDown = { x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pointerDown) return;
      const dx = e.clientX - pointerDown.x;
      const dy = e.clientY - pointerDown.y;
      pointerDown = { x: e.clientX, y: e.clientY };
      controlRef.current.aimYawOffset -= dx * 0.0065;
      controlRef.current.aimDistance = Math.max(
        10,
        Math.min(38, controlRef.current.aimDistance - dy * 0.09)
      );
    };
    const onPointerUp = () => {
      pointerDown = null;
    };

    // Keyboard WASD / Arrow Keys Support for Desktop
    const keysPressed = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      keysPressed.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.delete(e.code);
    };

    const domEl = renderer.domElement;
    domEl.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const onResize = () => {
      if (!container) return;
      camera.aspect =
        container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    let animId = 0;
    let lastTime = performance.now();
    let initializedLocalShip = false;

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const timeSec = now * 0.001;

      const {
        myShipId: curMyId,
        ships: curShips,
        lootCrates: curCrates,
        recentShots: curShots,
      } = propsRef.current;

      // 1. Animate 3D Ocean Waves & Caustic Scroll
      textures.oceanTex.offset.x = (timeSec * 0.04) % 1;
      textures.oceanTex.offset.y = (timeSec * 0.03) % 1;
      const posAttr = oceanGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const bx = oceanBasePos[i * 3];
        const bz = oceanBasePos[i * 3 + 2];
        posAttr.setY(i, waveHeightAt(bx, bz, timeSec) * 0.65);
      }
      posAttr.needsUpdate = true;

      // Pulse Island Surf Rings
      for (const islNode of islandNodes) {
        const s = 1 + Math.sin(timeSec * 2.2) * 0.04;
        islNode.surfRing.scale.set(s, s, 1);
      }

      // 2. Spawn 3D Cannonball Visuals for New Shots
      for (const shot of curShots) {
        if (!seenShotIds.has(shot.id)) {
          seenShotIds.add(shot.id);
          const hasHit = shot.hitShipIds.length > 0;
          if (shot.mode === "TRIPLE") {
            for (const offset of [-1.8, 0, 1.8]) {
              spawnCannonballArc(
                shot.fromX,
                shot.fromZ,
                shot.toX + offset,
                shot.toZ + offset,
                hasHit
              );
            }
          } else {
            spawnCannonballArc(
              shot.fromX,
              shot.fromZ,
              shot.toX,
              shot.toZ,
              hasHit
            );
          }
          const shooterNode = shipNodes.get(shot.shooterId);
          if (shooterNode) {
            shooterNode.recoilRoll = 0.28;
          }
        }
      }

      // 3. Advance Local Player Ship Physics (60fps responsive sailing!)
      const myServerShip = curShips[curMyId];
      const ctrl = controlRef.current;

      if (myServerShip && !initializedLocalShip) {
        ctrl.x = myServerShip.x;
        ctrl.z = myServerShip.z;
        ctrl.yaw = myServerShip.yaw;
        initializedLocalShip = true;
      }

      // Merge keyboard inputs if pressed
      let kbSteer = 0;
      let kbThrottle = 0;
      if (keysPressed.has("KeyA") || keysPressed.has("ArrowLeft")) kbSteer += 1;
      if (keysPressed.has("KeyD") || keysPressed.has("ArrowRight"))
        kbSteer -= 1;
      if (keysPressed.has("KeyW") || keysPressed.has("ArrowUp"))
        kbThrottle += 1;
      if (keysPressed.has("KeyS") || keysPressed.has("ArrowDown"))
        kbThrottle -= 0.6;

      const effectiveSteer =
        Math.abs(ctrl.steerInput) > 0.05 ? ctrl.steerInput : kbSteer;
      const effectiveThrottle =
        Math.abs(ctrl.throttleInput) > 0.05 ? ctrl.throttleInput : kbThrottle;

      if (myServerShip && myServerShip.sunkUntil === 0) {
        const boostMult =
          myServerShip.windBoostUntil > Date.now() ? 1.75 : 1.0;
        const targetSpeed = effectiveThrottle * 9.8 * boostMult;
        ctrl.speed += (targetSpeed - ctrl.speed) * Math.min(1, dt * 4.5);
        ctrl.yaw += effectiveSteer * 1.45 * dt;

        let nx = ctrl.x + Math.sin(ctrl.yaw) * ctrl.speed * dt;
        let nz = ctrl.z + Math.cos(ctrl.yaw) * ctrl.speed * dt;

        // Island Collision Pushout
        for (const isl of PIRATES_ISLANDS) {
          const dx = nx - isl.x;
          const dz = nz - isl.z;
          const dist = Math.hypot(dx, dz);
          const minD = isl.radius + 2.4;
          if (dist < minD) {
            const ang = Math.atan2(dz, dx);
            nx = isl.x + Math.cos(ang) * minD;
            nz = isl.z + Math.sin(ang) * minD;
          }
        }
        const rad = Math.hypot(nx, nz);
        if (rad > SEA_ARENA_RADIUS - 2.5) {
          const sc = (SEA_ARENA_RADIUS - 2.5) / rad;
          nx *= sc;
          nz *= sc;
        }
        ctrl.x = nx;
        ctrl.z = nz;
      } else if (myServerShip && myServerShip.sunkUntil > 0) {
        // Sync to respawn coordinates when sunk
        ctrl.x = myServerShip.x;
        ctrl.z = myServerShip.z;
        ctrl.yaw = myServerShip.yaw;
      }

      // 4. Compute Aiming Trajectory + Magnetic Soft-Lock onto Enemy Ships
      const aimWorldYaw = ctrl.yaw + ctrl.aimYawOffset;
      let aimX = ctrl.x + Math.sin(aimWorldYaw) * ctrl.aimDistance;
      let aimZ = ctrl.z + Math.cos(aimWorldYaw) * ctrl.aimDistance;
      let lockedEnemy: PirateShipState | null = null;
      let bestLockDist = 9.0; // Generous magnetic lock-on radius!

      for (const other of Object.values(curShips)) {
        if (other.id === curMyId || other.sunkUntil > 0) continue;
        const distFromMe = Math.hypot(other.x - ctrl.x, other.z - ctrl.z);
        if (distFromMe > 42) continue;
        const distToAim = Math.hypot(other.x - aimX, other.z - aimZ);
        if (distToAim < bestLockDist) {
          bestLockDist = distToAim;
          lockedEnemy = other;
        }
      }

      if (lockedEnemy) {
        aimX = lockedEnemy.x;
        aimZ = lockedEnemy.z;
        ctrl.lockedTargetId = lockedEnemy.id;
      } else {
        ctrl.lockedTargetId = null;
      }
      ctrl.targetWorldX = aimX;
      ctrl.targetWorldZ = aimZ;

      // Update 3D Parabolic Aiming Line & Reticle
      const arcPeak = Math.min(
        5.5,
        Math.max(2.0, Math.hypot(aimX - ctrl.x, aimZ - ctrl.z) * 0.15)
      );
      for (let i = 0; i < aimPointsCount; i++) {
        const t = i / (aimPointsCount - 1);
        const px = ctrl.x + (aimX - ctrl.x) * t;
        const pz = ctrl.z + (aimZ - ctrl.z) * t;
        const py = 1.3 * (1 - t) + 0.25 * t + Math.sin(t * Math.PI) * arcPeak;
        aimPositions[i * 3] = px;
        aimPositions[i * 3 + 1] = py;
        aimPositions[i * 3 + 2] = pz;
      }
      aimGeo.attributes.position.needsUpdate = true;
      aimMat.color.setHex(lockedEnemy ? 0xf43f5e : 0x34d399);
      (outerReticle.material as THREE.MeshBasicMaterial).color.setHex(
        lockedEnemy ? 0xf43f5e : 0x34d399
      );
      aimReticleGroup.position.set(aimX, 0.22, aimZ);
      const reticlePulse = 1 + Math.sin(timeSec * 7) * 0.12;
      aimReticleGroup.scale.set(reticlePulse, 1, reticlePulse);

      // 5. Sync & Animate All 3D Pirate Ships
      const activeIds = new Set(Object.keys(curShips));
      for (const [id, node] of shipNodes.entries()) {
        if (!activeIds.has(id)) {
          shipsGroup.remove(node.root);
          shipNodes.delete(id);
        }
      }

      for (const ship of Object.values(curShips)) {
        const style =
          CORSAIR_STYLES[ship.styleIndex % CORSAIR_STYLES.length] ??
          CORSAIR_STYLES[0];
        let node = shipNodes.get(ship.id);

        if (!node) {
          const built = createCorsairGalleon3D(style, textures, sailTexCache);
          shipsGroup.add(built.root);

          const badgeCanvas = document.createElement("canvas");
          badgeCanvas.width = 256;
          badgeCanvas.height = 96;
          const badgeTex = new THREE.CanvasTexture(badgeCanvas);
          const badgeSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: badgeTex,
              transparent: true,
              depthTest: false,
            })
          );
          badgeSprite.scale.set(4.2, 1.55, 1);
          badgeSprite.position.set(0, 6.25, 0);
          built.root.add(badgeSprite);

          node = {
            root: built.root,
            hullPivot: built.hullPivot,
            turretPivot: built.turretPivot,
            flagMesh: built.flagMesh,
            badgeCanvas,
            badgeTex,
            badgeSprite,
            currX: ship.x,
            currZ: ship.z,
            currYaw: ship.yaw,
            recoilRoll: 0,
            lastBadgeHash: "",
            wakeCooldown: 0,
          };
          shipNodes.set(ship.id, node);
        }

        const isMe = ship.id === curMyId;
        const targetX = isMe ? ctrl.x : ship.x;
        const targetZ = isMe ? ctrl.z : ship.z;
        const targetYaw = isMe ? ctrl.yaw : ship.yaw;

        node.currX += (targetX - node.currX) * Math.min(1, dt * (isMe ? 25 : 8));
        node.currZ += (targetZ - node.currZ) * Math.min(1, dt * (isMe ? 25 : 8));

        // Shortest-angle yaw interpolation
        let dYaw = targetYaw - node.currYaw;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        node.currYaw += dYaw * Math.min(1, dt * (isMe ? 20 : 8));

        const waveY = waveHeightAt(node.currX, node.currZ, timeSec);
        const isSunk = ship.sunkUntil > Date.now();

        if (isSunk) {
          node.root.position.set(node.currX, waveY - 1.85, node.currZ);
          node.hullPivot.rotation.set(-0.55, 0, 0.45);
        } else {
          node.root.position.set(node.currX, waveY - 0.15, node.currZ);
          node.root.rotation.y = node.currYaw;

          // Realistic wave pitch + steering heel + cannon recoil roll
          node.recoilRoll = Math.max(0, node.recoilRoll - dt * 0.9);
          const wavePitch =
            Math.sin(timeSec * 2.4 + node.currX * 0.2) * 0.055;
          const turnRoll = (isMe ? -effectiveSteer * 0.11 : -dYaw * 0.35) + node.recoilRoll;
          node.hullPivot.rotation.set(wavePitch, 0, turnRoll);
        }

        // Rotate deck swivel cannon toward aim direction
        if (isMe) {
          node.turretPivot.rotation.y = ctrl.aimYawOffset;
        }

        // Flutter topmast pennant flag
        node.flagMesh.rotation.y =
          Math.PI / 2 + Math.sin(timeSec * 8 + ship.styleIndex) * 0.24;

        // Refresh overhead nameplate & HP/Shield bar only when changed
        const isLocked = ctrl.lockedTargetId === ship.id;
        const badgeHash = `${ship.nickname}_${ship.hp}_${ship.shield}_${isLocked}_${isSunk}`;
        if (badgeHash !== node.lastBadgeHash) {
          node.lastBadgeHash = badgeHash;
          updateShipOverheadCanvas(
            node.badgeCanvas,
            ship,
            style,
            isMe,
            isLocked
          );
          node.badgeTex.needsUpdate = true;
        }
      }

      // 6. Render Floating 3D Sea Loot Crates
      const crateIds = new Set(curCrates.map((c) => c.id));
      for (const [cid, cGroup] of crateNodes.entries()) {
        if (!crateIds.has(cid)) {
          cratesGroup.remove(cGroup);
          crateNodes.delete(cid);
        }
      }

      for (const crate of curCrates) {
        let cGroup = crateNodes.get(crate.id);
        if (!cGroup) {
          cGroup = new THREE.Group();
          const colorHex =
            crate.kind === "GOLD_CHEST"
              ? 0xfacc15
              : crate.kind === "REPAIR"
              ? 0x22c55e
              : crate.kind === "DOUBLE_POWDER"
              ? 0xf97316
              : 0x38bdf8;

          const box = new THREE.Mesh(
            new THREE.BoxGeometry(1.15, 0.85, 0.95),
            new THREE.MeshStandardMaterial({
              color: colorHex,
              metalness: 0.45,
              roughness: 0.25,
            })
          );
          box.castShadow = true;
          cGroup.add(box);

          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.9, 1.25, 20),
            new THREE.MeshBasicMaterial({
              color: colorHex,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.75,
            })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = -0.2;
          cGroup.add(ring);

          cratesGroup.add(cGroup);
          crateNodes.set(crate.id, cGroup);
        }

        const wy = waveHeightAt(crate.x, crate.z, timeSec);
        cGroup.position.set(crate.x, wy + 0.35, crate.z);
        cGroup.rotation.y = timeSec * 1.4;
      }

      // 7. Animate Flying Cannonballs & Water/Ship Impact Explosions
      for (let i = activeCannonballs.length - 1; i >= 0; i--) {
        const cb = activeCannonballs[i];
        cb.progress = Math.min(1, cb.progress + dt / cb.duration);
        const t = cb.progress;
        const x = cb.fromX + (cb.toX - cb.fromX) * t;
        const z = cb.fromZ + (cb.toZ - cb.fromZ) * t;
        const y = 1.4 * (1 - t) + 0.3 * t + Math.sin(t * Math.PI) * cb.peakHeight;
        cb.mesh.position.set(x, y, z);

        if (cb.progress >= 1) {
          fxGroup.remove(cb.mesh);
          activeCannonballs.splice(i, 1);
          spawnWaterOrHitExplosion(cb.toX, cb.toZ, cb.hitShip);
        }
      }

      for (let i = activeSplashes.length - 1; i >= 0; i--) {
        const sp = activeSplashes[i];
        sp.age += dt;
        const p = Math.min(1, sp.age / sp.maxAge);
        const sc = 1 + p * 3.4;
        sp.ring.scale.set(sc, sc, 1);
        (sp.ring.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.9;

        for (const dr of sp.droplets) {
          dr.vy -= 14 * dt;
          dr.mesh.position.x += dr.vx * dt;
          dr.mesh.position.y = Math.max(0.1, dr.mesh.position.y + dr.vy * dt);
          dr.mesh.position.z += dr.vz * dt;
          (dr.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - p;
        }

        if (sp.age >= sp.maxAge) {
          fxGroup.remove(sp.ring);
          for (const dr of sp.droplets) fxGroup.remove(dr.mesh);
          activeSplashes.splice(i, 1);
        }
      }

      // 8. Smooth 3rd-Person Naval Chase Camera Following My Ship & Aim Yaw
      const camYaw = ctrl.yaw + ctrl.aimYawOffset;
      const camDist = 14.5;
      const camHeight = 7.4;
      const shakeX =
        cameraShake > 0.01 ? (Math.random() - 0.5) * cameraShake : 0;
      const shakeY =
        cameraShake > 0.01 ? (Math.random() - 0.5) * cameraShake : 0;
      cameraShake = Math.max(0, cameraShake - dt * 1.1);

      const desiredCamX = ctrl.x - Math.sin(camYaw) * camDist + shakeX;
      const desiredCamZ = ctrl.z - Math.cos(camYaw) * camDist + shakeY;
      camera.position.set(desiredCamX, camHeight, desiredCamZ);
      camera.lookAt(
        ctrl.x + Math.sin(camYaw) * 9,
        1.6,
        ctrl.z + Math.cos(camYaw) * 9
      );

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      domEl.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    };
  }, [controlRef]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none touch-none bg-[#0c2d48] cursor-crosshair"
    />
  );
}
