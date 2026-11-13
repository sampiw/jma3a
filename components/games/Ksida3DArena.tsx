"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { sortRacersStandings } from "@/games/ksida3d/engine";
import {
  CarKinematicsState,
  normalizeAngle,
  resolveCarVsCarCollision,
  stepCarKinematics,
} from "@/games/ksida3d/physics";
import {
  ARENA_PILLARS,
  DERBY_ARENA_RADIUS,
  evaluateTrackBoundary,
  FINISH_SAMPLE_INDEX,
  RONDA_CENTER,
  RONDA_PLAZA_RADIUS,
  STUNT_RAMPS,
  TRACK_CHECKPOINTS,
  TRACK_HALF_WIDTH,
  TRACK_POLYLINE,
  TRACK_SAMPLES,
  TURBO_PADS,
  updateRaceCheckpointAndProgress,
} from "@/games/ksida3d/trackLayout";
import {
  KsidaBarrelProp,
  KsidaCratePad,
  KsidaHazardDrop,
  KsidaItemFirePacket,
  KsidaItemHitPacket,
  KsidaLivePeerPacket,
  KsidaMode,
  KsidaRacer,
  KsidaRamClaimPacket,
} from "@/games/ksida3d/types";
import {
  buildAtlasRocksProp,
  buildCityBuildingProp,
  buildCornichePalmTree,
  buildExplosiveBarrelMesh,
  buildKasbahTowerProp,
  buildMemeProjectileMesh,
  buildMysteryCrateMesh,
  buildRondaFountainMonument,
  buildSoukStallProp,
  buildTireBarrierStackMesh,
  buildTrafficConeMesh,
  createKsidaCarRig,
  KsidaCarRig,
  preloadKsidaPropAssets,
  syncKsidaDriverHudPlate,
  updateKsidaCarRigVisuals,
} from "./ksida3d/models";
import {
  createCornicheOceanMaterial,
  createMoroccanSunsetSkyMaterial,
  createSonicShockwaveMaterial,
} from "./ksida3d/shaders";
import { ksidaSfx } from "./ksida3d/soundFx";
import { animateKsidaMaterials, getKsidaMaterials } from "./ksida3d/textures";

export interface KsidaDriveInput {
  throttle: number; // -1..1
  steer: number; // -1 (left) .. +1 (right)
  driftHeld: boolean;
  hopRequested: boolean;
  nitroHeld: boolean;
  lookBackHeld: boolean;
}

interface ActiveMemeProjectile {
  id: string;
  ownerId: string;
  isLocalOwner: boolean;
  kind: "SANDALA" | "BUTAGAZ";
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  targetId: string | null;
  bouncesLeft: number;
  age: number;
  mesh: THREE.Group;
}

interface KnockableCone {
  homeX: number;
  homeZ: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  knockedUntil: number;
  mesh: THREE.Group;
}

interface TransientParticle {
  mesh: THREE.Object3D;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  scaleRate: number;
  spinSpeed: number;
  life: number;
  maxLife: number;
}

export interface VisualBoomEvent {
  x: number;
  y: number;
  z: number;
  colorHex: number;
  labelAr?: string;
}

export interface Ksida3DArenaProps {
  myId: string;
  mode: KsidaMode;
  phase: "PLAYING" | "GAME_OVER";
  countdownEndsAt: number;
  targetLaps: number;
  racersRef: React.MutableRefObject<Record<string, KsidaRacer>>;
  cratesRef: React.MutableRefObject<KsidaCratePad[]>;
  barrelsRef: React.MutableRefObject<KsidaBarrelProp[]>;
  hazardsRef: React.MutableRefObject<KsidaHazardDrop[]>;
  peersRef: React.MutableRefObject<Map<string, KsidaLivePeerPacket>>;
  crownHolderRef: React.MutableRefObject<string | null>;
  crownPosRef: React.MutableRefObject<{ x: number; z: number }>;
  hotBombHolderRef: React.MutableRefObject<string | null>;
  localKinRef: React.MutableRefObject<CarKinematicsState>;
  localProgressRef: React.MutableRefObject<{
    lap: number;
    nextCheckpoint: number;
    trackProgress: number;
    wallHits: number;
    driftScore: number;
  }>;
  driveInputRef: React.MutableRefObject<KsidaDriveInput>;
  revMeterRef?: React.MutableRefObject<number>;
  projectileQueueRef: React.MutableRefObject<KsidaItemFirePacket[]>;
  boomQueueRef: React.MutableRefObject<VisualBoomEvent[]>;
  screenShakeRef: React.MutableRefObject<number>;
  onLocalPosTick: () => void;
  onClaimRamHit: (claim: KsidaRamClaimPacket) => void;
  onClaimProjectileHit: (hit: KsidaItemHitPacket) => void;
  onLapBanner?: (lap: number, targetLaps: number) => void;
  onPerfectLaunch?: () => void;
}

/** Builds continuous 240-sample 4-lane highway ribbon along TRACK_POLYLINE */
function buildCircuitRoadRibbonGeometry(halfWidth: number, yOffset = 0.03): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let cumLen = 0;
  for (let i = 0; i <= TRACK_SAMPLES; i++) {
    const pt = TRACK_POLYLINE[i % TRACK_SAMPLES];
    if (i > 0) {
      const prev = TRACK_POLYLINE[(i - 1) % TRACK_SAMPLES];
      cumLen += Math.hypot(pt.x - prev.x, pt.z - prev.z);
    }

    const lx = pt.x - pt.nx * halfWidth;
    const lz = pt.z - pt.nz * halfWidth;
    const rx = pt.x + pt.nx * halfWidth;
    const rz = pt.z + pt.nz * halfWidth;

    positions.push(lx, yOffset, lz, rx, yOffset, rz);
    const vCoord = cumLen / 18.0;
    uvs.push(0, vCoord, 1, vCoord);

    if (i < TRACK_SAMPLES) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Builds raised red-and-white rally curb + concrete guardrail wall along road edges */
function buildRoadCurbStripGeometry(
  side: -1 | 1,
  innerOff: number,
  outerOff: number,
  heightY: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let cumLen = 0;
  for (let i = 0; i <= TRACK_SAMPLES; i++) {
    const pt = TRACK_POLYLINE[i % TRACK_SAMPLES];
    if (i > 0) {
      const prev = TRACK_POLYLINE[(i - 1) % TRACK_SAMPLES];
      cumLen += Math.hypot(pt.x - prev.x, pt.z - prev.z);
    }

    const ix = pt.x + pt.nx * side * innerOff;
    const iz = pt.z + pt.nz * side * innerOff;
    const ox = pt.x + pt.nx * side * outerOff;
    const oz = pt.z + pt.nz * side * outerOff;

    const inRonda =
      Math.hypot(ix - RONDA_CENTER.x, iz - RONDA_CENTER.z) < RONDA_PLAZA_RADIUS - 1.2;
    const yH = inRonda ? -0.25 : heightY;

    positions.push(ix, yH, iz, ox, yH, oz);
    uvs.push(cumLen / 8.0, 0, cumLen / 8.0, 1);

    if (i < TRACK_SAMPLES) {
      const base = i * 2;
      if (side === 1) {
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      } else {
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Builds a sloped 3D wedge ramp ascending toward +Z in local space */
function buildRampMesh(
  width: number,
  length: number,
  height: number,
  mat: THREE.Material
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(width, 1, length, 1, 1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const ly = pos.getY(i);
    const lz = pos.getZ(i);
    if (ly < 0) {
      pos.setY(i, 0);
    } else {
      const t = (lz + length * 0.5) / length;
      pos.setY(i, Math.max(0.05, t * height));
    }
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

function createComicPopupSprite(text: string, bgColor: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 128;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = bgColor;
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(18, 18, 348, 92, 28);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 34px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 6;
  ctx.fillText(text, 192, 64);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  );
  sp.scale.set(4.6, 1.55, 1);
  sp.renderOrder = 35;
  return sp;
}

export function Ksida3DArena({
  myId,
  mode,
  phase,
  countdownEndsAt,
  targetLaps,
  racersRef,
  cratesRef,
  barrelsRef,
  hazardsRef,
  peersRef,
  crownHolderRef,
  crownPosRef,
  hotBombHolderRef,
  localKinRef,
  localProgressRef,
  driveInputRef,
  revMeterRef,
  projectileQueueRef,
  boomQueueRef,
  screenShakeRef,
  onLocalPosTick,
  onClaimRamHit,
  onClaimProjectileHit,
  onLapBanner,
  onPerfectLaunch,
}: Ksida3DArenaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cbsRef = useRef({
    onLocalPosTick,
    onClaimRamHit,
    onClaimProjectileHit,
    onLapBanner,
    onPerfectLaunch,
  });
  cbsRef.current = {
    onLocalPosTick,
    onClaimRamHit,
    onClaimProjectileHit,
    onLapBanner,
    onPerfectLaunch,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    preloadKsidaPropAssets();

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.fog = new THREE.FogExp2(0xf58438, 0.00092);

    const camera = new THREE.PerspectiveCamera(
      64,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.35,
      1150
    );

    // Golden-Hour Sunset Sky + Normal-Mapped Atlantic Ocean
    const skyMat = createMoroccanSunsetSkyMaterial();
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(760, 28, 20), skyMat);
    scene.add(skyDome);

    const oceanMat = createCornicheOceanMaterial();
    const oceanPlane = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200), oceanMat);
    oceanPlane.rotation.x = -Math.PI / 2;
    oceanPlane.position.y = -2.4;
    scene.add(oceanPlane);

    // Lighting + Dynamic Car-Following Sun Shadow Rig
    const hemi = new THREE.HemisphereLight(0xffe6ba, 0x334155, 0.98);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1d0, 1.95);
    sun.position.set(80, 95, -60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 15;
    sun.shadow.camera.far = 260;
    sun.shadow.camera.left = -72;
    sun.shadow.camera.right = 72;
    sun.shadow.camera.top = 72;
    sun.shadow.camera.bottom = -72;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);

    const mats = getKsidaMaterials();

    // Sculpted Moroccan Coastal Peninsula Terrain
    const islandMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(285, 310, 2.4, 64),
      mats.sandTerrainMat
    );
    islandMesh.scale.set(1.02, 1.0, 0.78);
    islandMesh.position.y = -1.22;
    islandMesh.receiveShadow = true;
    scene.add(islandMesh);

    const checkpointArches: Array<{ id: number; ringMat: THREE.MeshBasicMaterial }> = [];
    const knockableCones: KnockableCone[] = [];

    if (mode === "RACE") {
      // Lush Oasis Grass Parklands inside the Peninsula
      const oasisPatch1 = new THREE.Mesh(
        new THREE.CylinderGeometry(85, 90, 0.14, 40),
        mats.oasisGrassMat
      );
      oasisPatch1.position.set(-18, -0.05, -20);
      oasisPatch1.receiveShadow = true;
      scene.add(oasisPatch1);

      const oasisPatch2 = new THREE.Mesh(
        new THREE.CylinderGeometry(62, 66, 0.14, 36),
        mats.oasisGrassMat
      );
      oasisPatch2.position.set(-142, -0.05, -64);
      oasisPatch2.receiveShadow = true;
      scene.add(oasisPatch2);

      // 1,560m 4-Lane PBR Highway Ribbon + Red/White Rally Curbs + Concrete Shoulders
      const roadMesh = new THREE.Mesh(
        buildCircuitRoadRibbonGeometry(TRACK_HALF_WIDTH, 0.03),
        mats.asphaltMat
      );
      roadMesh.receiveShadow = true;
      scene.add(roadMesh);

      const leftCurb = new THREE.Mesh(
        buildRoadCurbStripGeometry(-1, TRACK_HALF_WIDTH - 0.15, TRACK_HALF_WIDTH + 1.05, 0.24),
        mats.curbMat
      );
      const rightCurb = new THREE.Mesh(
        buildRoadCurbStripGeometry(1, TRACK_HALF_WIDTH - 0.15, TRACK_HALF_WIDTH + 1.05, 0.24),
        mats.curbMat
      );
      scene.add(leftCurb, rightCurb);

      // Concrete Jersey Guardrails along outer edges
      const leftRail = new THREE.Mesh(
        buildRoadCurbStripGeometry(-1, TRACK_HALF_WIDTH + 1.05, TRACK_HALF_WIDTH + 1.65, 0.88),
        mats.jerseyBarrierMat
      );
      const rightRail = new THREE.Mesh(
        buildRoadCurbStripGeometry(1, TRACK_HALF_WIDTH + 1.05, TRACK_HALF_WIDTH + 1.65, 0.88),
        mats.jerseyBarrierMat
      );
      scene.add(leftRail, rightRail);

      // === GRAND RONDA MONUMENT ROUNDABOUT & 3D STONE FOUNTAIN ===
      const rondaDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(RONDA_PLAZA_RADIUS, RONDA_PLAZA_RADIUS, 0.08, 56),
        mats.rondaZelligeMat
      );
      rondaDisc.position.set(RONDA_CENTER.x, 0.015, RONDA_CENTER.z);
      rondaDisc.receiveShadow = true;
      scene.add(rondaDisc);

      const rondaOuterCurb = new THREE.Mesh(
        new THREE.TorusGeometry(RONDA_PLAZA_RADIUS + 0.5, 0.65, 10, 56),
        mats.curbMat
      );
      rondaOuterCurb.rotation.x = Math.PI / 2;
      rondaOuterCurb.position.set(RONDA_CENTER.x, 0.35, RONDA_CENTER.z);
      scene.add(rondaOuterCurb);

      const fountainMonument = buildRondaFountainMonument(mats.kasbahBrickMat);
      fountainMonument.position.set(RONDA_CENTER.x, 0.02, RONDA_CENTER.z);
      scene.add(fountainMonument);

      // === GRAND CHECKERED START / FINISH STADIUM GANTRY & GRANDSTANDS ===
      const finishPt = TRACK_POLYLINE[FINISH_SAMPLE_INDEX];
      const finishGroup = new THREE.Group();
      finishGroup.position.set(finishPt.x, 0, finishPt.z);
      finishGroup.rotation.y = finishPt.yaw;

      const trussMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.75,
        roughness: 0.28,
      });
      for (const sx of [-1, 1]) {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(1.4, 9.5, 1.4), trussMat);
        tower.position.set(sx * (TRACK_HALF_WIDTH + 1.2), 4.75, 0);
        tower.castShadow = true;
        finishGroup.add(tower);

        // Tiered Spectator Grandstands flanking the Start/Finish Straight!
        const stand = new THREE.Group();
        stand.position.set(sx * (TRACK_HALF_WIDTH + 9.5), 0, -6);
        for (let tier = 0; tier < 4; tier++) {
          const bench = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 0.9 + tier * 0.85, 34),
            mats.pierWoodMat
          );
          bench.position.set(sx * tier * 2.1, (0.9 + tier * 0.85) * 0.5, 0);
          bench.castShadow = true;
          bench.receiveShadow = true;
          stand.add(bench);
        }
        const canopy = new THREE.Mesh(
          new THREE.BoxGeometry(10.5, 0.35, 35),
          new THREE.MeshStandardMaterial({
            color: sx < 0 ? 0xdc2626 : 0x0284c7,
            roughness: 0.5,
          })
        );
        canopy.position.set(sx * 3.2, 6.8, 0);
        canopy.rotation.z = sx * 0.16;
        stand.add(canopy);
        finishGroup.add(stand);
      }

      const bannerSign = new THREE.Mesh(
        new THREE.BoxGeometry(TRACK_HALF_WIDTH * 2 + 3.6, 2.5, 0.9),
        mats.checkeredBannerMat
      );
      bannerSign.position.set(0, 8.2, 0);
      bannerSign.castShadow = true;
      finishGroup.add(bannerSign);

      // Checkered painted start line on the asphalt
      const startStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 2 - 0.5, 2.8),
        mats.checkeredBannerMat
      );
      startStrip.rotation.x = -Math.PI / 2;
      startStrip.position.set(0, 0.055, 0);
      finishGroup.add(startStrip);

      scene.add(finishGroup);

      // === 8 SEQUENTIAL CHECKPOINT GATES ===
      for (const cp of TRACK_CHECKPOINTS) {
        if (cp.id === 0) continue; // Finish Gantry already built at CP 0!
        const archGroup = new THREE.Group();
        archGroup.position.set(cp.x, 0, cp.z);
        archGroup.rotation.y = cp.yaw;

        const spanHalf = cp.id === 7 ? RONDA_PLAZA_RADIUS - 1.5 : TRACK_HALF_WIDTH + 0.6;
        const isKasbahSector = cp.id === 4 || cp.id === 5;

        for (const sx of [-1, 1]) {
          const p = new THREE.Mesh(
            new THREE.BoxGeometry(1.3, 8.2, 1.3),
            isKasbahSector ? mats.kasbahBrickMat : mats.jerseyBarrierMat
          );
          p.position.set(sx * spanHalf, 4.1, 0);
          p.castShadow = true;
          archGroup.add(p);
        }

        const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const topBeam = new THREE.Mesh(
          new THREE.BoxGeometry(spanHalf * 2 + 1.6, 1.0, 0.7),
          ringMat
        );
        topBeam.position.set(0, 7.9, 0);
        archGroup.add(topBeam);

        checkpointArches.push({ id: cp.id, ringMat });
        scene.add(archGroup);
      }

      // === MULTI-BIOME 3D ARCHITECTURE & SCENERY ALONG ALL 4 SECTORS ===
      // 1. Sector 1: Corniche Luxury Hotel Skyline + Atlantic Wooden Pier!
      for (let k = 0; k < 7; k++) {
        const pt = TRACK_POLYLINE[(8 + k * 6) % TRACK_SAMPLES];
        const bldg = buildCityBuildingProp(k, 12.5 + (k % 3) * 2.2);
        bldg.position.set(pt.x - pt.nx * (TRACK_HALF_WIDTH + 19), 0, pt.z - pt.nz * (TRACK_HALF_WIDTH + 19));
        bldg.rotation.y = pt.yaw + Math.PI * 0.5;
        scene.add(bldg);
      }

      const oceanPier = new THREE.Mesh(
        new THREE.BoxGeometry(18, 1.2, 68),
        mats.pierWoodMat
      );
      oceanPier.position.set(85, -0.3, -172);
      oceanPier.receiveShadow = true;
      scene.add(oceanPier);

      // 2. Sector 2: Tanger-Med & Casa-Port Shipping Container Stacks + Watchtowers!
      const containerMats = [
        mats.containerRedMat,
        mats.containerBlueMat,
        mats.containerGreenMat,
      ];
      for (let i = 52; i <= 96; i += 6) {
        const pt = TRACK_POLYLINE[i];
        const side = i % 12 === 4 ? 1 : -1;
        const cx = pt.x + pt.nx * side * (TRACK_HALF_WIDTH + 8.5);
        const cz = pt.z + pt.nz * side * (TRACK_HALF_WIDTH + 8.5);
        if (evaluateTrackBoundary(cx, cz, "RACE").sdf > 4.5) {
          const cMat = containerMats[(i / 6) % containerMats.length | 0];
          const box1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 9.2), cMat);
          box1.position.set(cx, 1.7, cz);
          box1.rotation.y = pt.yaw;
          box1.castShadow = true;
          box1.receiveShadow = true;
          scene.add(box1);

          if (i % 12 === 4) {
            const box2 = new THREE.Mesh(
              new THREE.BoxGeometry(3.4, 3.4, 9.2),
              containerMats[((i / 6 + 1) % containerMats.length) | 0]
            );
            box2.position.set(cx, 5.1, cz);
            box2.rotation.y = pt.yaw + 0.04;
            box2.castShadow = true;
            scene.add(box2);
          }
        }
      }

      for (const watchIdx of [62, 98]) {
        const pt = TRACK_POLYLINE[watchIdx];
        const wt = buildKasbahTowerProp(2.8, true);
        wt.position.set(pt.x + pt.nx * (TRACK_HALF_WIDTH + 9), 0, pt.z + pt.nz * (TRACK_HALF_WIDTH + 9));
        scene.add(wt);
      }

      // 3. Sector 3: Kasbah PBR Brick Fortress Walls, Towers & Medina Souk Stalls!
      for (let i = 106; i <= 174; i += 5) {
        const pt = TRACK_POLYLINE[i];
        const side = i % 10 === 0 ? 1 : -1;
        const wx = pt.x + pt.nx * side * (TRACK_HALF_WIDTH + 7.8);
        const wz = pt.z + pt.nz * side * (TRACK_HALF_WIDTH + 7.8);
        if (evaluateTrackBoundary(wx, wz, "RACE").sdf > 4.2) {
          if (i % 15 === 1) {
            const tower = buildKasbahTowerProp(1.48, false);
            tower.position.set(wx, 0, wz);
            scene.add(tower);
          } else {
            const wall = new THREE.Mesh(
              new THREE.BoxGeometry(2.4, 7.2, 11.5),
              mats.kasbahBrickMat
            );
            wall.position.set(wx, 3.6, wz);
            wall.rotation.y = pt.yaw;
            wall.castShadow = true;
            wall.receiveShadow = true;
            scene.add(wall);
          }
        }
      }

      for (let s = 152; s <= 176; s += 6) {
        const pt = TRACK_POLYLINE[s];
        const sx = pt.x - pt.nx * (TRACK_HALF_WIDTH + 5.6);
        const sz = pt.z - pt.nz * (TRACK_HALF_WIDTH + 5.6);
        if (evaluateTrackBoundary(sx, sz, "RACE").sdf > 3.0) {
          const stall = buildSoukStallProp(s % 12 === 0, 3.4);
          stall.position.set(sx, 0, sz);
          stall.rotation.y = pt.yaw + Math.PI * 0.5;
          scene.add(stall);
        }
      }

      // 4. Sector 4: Atlas Sandstone Canyon Rock Formations!
      for (let i = 180; i <= 216; i += 4) {
        const pt = TRACK_POLYLINE[i];
        for (const side of [-1, 1]) {
          if ((i + (side > 0 ? 2 : 0)) % 8 !== 0) continue;
          const rx = pt.x + pt.nx * side * (TRACK_HALF_WIDTH + 10.5);
          const rz = pt.z + pt.nz * side * (TRACK_HALF_WIDTH + 10.5);
          if (evaluateTrackBoundary(rx, rz, "RACE").sdf > 5.0) {
            const rock = buildAtlasRocksProp(i + side, 2.5 + (i % 3) * 0.55);
            rock.position.set(rx, 0, rz);
            rock.rotation.y = i * 0.9;
            scene.add(rock);
          }
        }
      }

      // 5. Lush 3D Kenney Palm Avenues & Tire Stacks along the Circuit!
      for (let i = 0; i < TRACK_SAMPLES; i += 4) {
        const pt = TRACK_POLYLINE[i];
        const side = i % 8 === 0 ? 1 : -1;
        const px = pt.x + pt.nx * side * (TRACK_HALF_WIDTH + 5.4);
        const pz = pt.z + pt.nz * side * (TRACK_HALF_WIDTH + 5.4);
        if (evaluateTrackBoundary(px, pz, "RACE").sdf > 2.8) {
          const palm = buildCornichePalmTree(8.2 + (i % 3) * 1.1, i % 8 === 0);
          palm.position.set(px, 0, pz);
          palm.rotation.y = i * 1.3;
          scene.add(palm);
        }
      }

      // 6. Knockable 3D Traffic Cones (`cone.glb`) & Corner Tire Stacks!
      for (let i = 18; i < TRACK_SAMPLES; i += 14) {
        const pt = TRACK_POLYLINE[i];
        const side = i % 28 === 4 ? 1 : -1;
        const cx = pt.x + pt.nx * side * (TRACK_HALF_WIDTH - 1.2);
        const cz = pt.z + pt.nz * side * (TRACK_HALF_WIDTH - 1.2);
        const coneMesh = buildTrafficConeMesh();
        coneMesh.position.set(cx, 0, cz);
        scene.add(coneMesh);
        knockableCones.push({
          homeX: cx,
          homeZ: cz,
          x: cx,
          y: 0,
          z: cz,
          vx: 0,
          vy: 0,
          vz: 0,
          knockedUntil: 0,
          mesh: coneMesh,
        });

        // Tire barrier stack outside sharp apexes
        const tx = pt.x - pt.nx * side * (TRACK_HALF_WIDTH + 2.4);
        const tz = pt.z - pt.nz * side * (TRACK_HALF_WIDTH + 2.4);
        if (evaluateTrackBoundary(tx, tz, "RACE").sdf > 1.2) {
          const tires = buildTireBarrierStackMesh();
          tires.position.set(tx, 0, tz);
          scene.add(tires);
        }
      }
    } else {
      // === EXPANDED 124m GLADIATOR DERBY & HOT-BOMB STADIUM ===
      const arenaFloor = new THREE.Mesh(
        new THREE.CylinderGeometry(DERBY_ARENA_RADIUS, DERBY_ARENA_RADIUS, 0.12, 64),
        mats.asphaltMat
      );
      arenaFloor.position.y = -0.03;
      arenaFloor.receiveShadow = true;
      scene.add(arenaFloor);

      const centerMedallion = new THREE.Mesh(
        new THREE.CylinderGeometry(22.0, 22.0, 0.08, 48),
        mats.rondaZelligeMat
      );
      centerMedallion.position.y = 0.02;
      centerMedallion.receiveShadow = true;
      scene.add(centerMedallion);

      // Stadium Wall + Kasbah Battlements
      const wallRing = new THREE.Mesh(
        new THREE.CylinderGeometry(
          DERBY_ARENA_RADIUS + 0.6,
          DERBY_ARENA_RADIUS + 0.6,
          2.1,
          64,
          1,
          true
        ),
        mats.curbMat
      );
      wallRing.material.side = THREE.DoubleSide;
      wallRing.position.y = 1.05;
      scene.add(wallRing);

      // 4 Interior Kasbah Fortress Pillars matching `ARENA_PILLARS`!
      for (const pil of ARENA_PILLARS) {
        if (!pil.modes.includes(mode)) continue;
        const pillarDrum = new THREE.Mesh(
          new THREE.CylinderGeometry(pil.radius, pil.radius + 0.2, 2.4, 24),
          mats.kasbahBrickMat
        );
        pillarDrum.position.set(pil.x, 1.2, pil.z);
        pillarDrum.castShadow = true;
        pillarDrum.receiveShadow = true;
        scene.add(pillarDrum);

        const towerTop = buildKasbahTowerProp(1.25, false);
        towerTop.position.set(pil.x, 2.2, pil.z);
        scene.add(towerTop);
      }

      // Perimeter Palms, Shipping Containers & Kasbah Towers around the Bowl
      const containerMats = [
        mats.containerRedMat,
        mats.containerBlueMat,
        mats.containerGreenMat,
      ];
      for (let k = 0; k < 24; k++) {
        const ang = (k / 24) * Math.PI * 2;
        const r = DERBY_ARENA_RADIUS + 6.5;
        const px = Math.cos(ang) * r;
        const pz = Math.sin(ang) * r;
        if (k % 3 === 0) {
          const cont = new THREE.Mesh(
            new THREE.BoxGeometry(3.6, 3.6, 9.5),
            containerMats[(k / 3) % containerMats.length | 0]
          );
          cont.position.set(px, 1.8, pz);
          cont.rotation.y = -ang;
          cont.castShadow = true;
          scene.add(cont);
        } else {
          const palm = buildCornichePalmTree(8.8, k % 2 === 0);
          palm.position.set(px, 0, pz);
          palm.rotation.y = ang;
          scene.add(palm);
        }
      }
    }

    // === ASPHALT TURBO BOOST PADS ===
    for (const pad of TURBO_PADS) {
      if (!pad.modes.includes(mode)) continue;
      const padMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(pad.width, pad.length),
        mats.turboPadMat
      );
      padMesh.rotation.order = "YXZ";
      padMesh.rotation.y = pad.yaw;
      padMesh.rotation.x = -Math.PI / 2;
      padMesh.position.set(pad.x, 0.055, pad.z);
      scene.add(padMesh);
    }

    // === STUNT LAUNCH RAMPS ===
    for (const r of STUNT_RAMPS) {
      if (!r.modes.includes(mode)) continue;
      const rampMesh = buildRampMesh(r.width, r.length, r.height, mats.boostRampMat);
      rampMesh.position.set(r.x, 0, r.z);
      rampMesh.rotation.y = r.yaw;
      scene.add(rampMesh);
    }

    // Unclaimed Golden Tagine Crown Pedestal Beacon (DERBY mode)
    const looseCrownGroup = new THREE.Group();
    const crownBeacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 9.0, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    crownBeacon.position.y = 4.5;
    looseCrownGroup.add(crownBeacon);
    const crownGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.0, 0),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xd97706,
        emissiveIntensity: 0.75,
        metalness: 0.85,
        roughness: 0.15,
      })
    );
    crownGem.position.y = 1.45;
    looseCrownGroup.add(crownGem);
    looseCrownGroup.visible = false;
    scene.add(looseCrownGroup);

    // Mystery Crate Meshes
    const crateMeshes = new Map<string, THREE.Group>();
    for (const c of cratesRef.current) {
      const m = buildMysteryCrateMesh();
      m.position.set(c.x, c.y + 0.35, c.z);
      scene.add(m);
      crateMeshes.set(c.id, m);
    }

    // Destructible Explosive Barrel Meshes
    const barrelMeshes = new Map<string, THREE.Group>();
    for (const b of barrelsRef.current) {
      const bm = buildExplosiveBarrelMesh();
      bm.position.set(b.x, 0, b.z);
      scene.add(bm);
      barrelMeshes.set(b.id, bm);
    }

    const hazardMeshes = new Map<string, THREE.Group>();
    const carRigs = new Map<string, KsidaCarRig>();

    // Tire Skidmark Ring-Buffer Pool (220 persistent quads)
    const MAX_SKIDS = 220;
    const skidMeshes: THREE.Mesh[] = [];
    const skidGeo = new THREE.PlaneGeometry(0.38, 1.0);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x090b10,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    });
    for (let i = 0; i < MAX_SKIDS; i++) {
      const sm = new THREE.Mesh(skidGeo, skidMat);
      sm.visible = false;
      scene.add(sm);
      skidMeshes.push(sm);
    }
    let skidCursor = 0;
    let lastSkidLeftX = 0;
    let lastSkidLeftZ = 0;

    const activeProjectiles: ActiveMemeProjectile[] = [];
    const particles: TransientParticle[] = [];
    const debrisBoxGeo = new THREE.BoxGeometry(0.34, 0.24, 0.34);

    const spawnComicPopup = (x: number, y: number, z: number, text: string, bg: string) => {
      const sp = createComicPopupSprite(text, bg);
      sp.position.set(x, y + 1.9, z);
      scene.add(sp);
      particles.push({
        mesh: sp,
        vx: (Math.random() - 0.5) * 1.2,
        vy: 3.5,
        vz: (Math.random() - 0.5) * 1.2,
        gravity: 1.5,
        scaleRate: 0.65,
        spinSpeed: 0,
        life: 0,
        maxLife: 1.2,
      });
    };

    const spawnCrashDebris = (
      x: number,
      y: number,
      z: number,
      colorHex: number,
      count = 10,
      withShockwave = false
    ) => {
      for (let i = 0; i < count; i++) {
        const isMelon = i % 3 === 0;
        const mat = new THREE.MeshStandardMaterial({
          color: isMelon ? 0x16a34a : i % 2 === 0 ? colorHex : 0xfbbf24,
          roughness: 0.4,
          metalness: 0.3,
        });
        const m = new THREE.Mesh(debrisBoxGeo, mat);
        m.position.set(x, y + 0.6, z);
        const ang = Math.random() * Math.PI * 2;
        const spd = 4.5 + Math.random() * 12;
        scene.add(m);
        particles.push({
          mesh: m,
          vx: Math.cos(ang) * spd,
          vy: 4.8 + Math.random() * 8.0,
          vz: Math.sin(ang) * spd,
          gravity: 22,
          scaleRate: -0.5,
          spinSpeed: 8 + Math.random() * 10,
          life: 0,
          maxLife: 0.9 + Math.random() * 0.35,
        });
      }

      if (withShockwave) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.65, 1.6, 24),
          createSonicShockwaveMaterial(colorHex)
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, Math.max(0.15, y), z);
        scene.add(ring);
        particles.push({
          mesh: ring,
          vx: 0,
          vy: 0,
          vz: 0,
          gravity: 0,
          scaleRate: 15.5,
          spinSpeed: 0,
          life: 0,
          maxLife: 0.48,
        });
      }
    };

    const spawnProjectileFromPacket = (pkt: KsidaItemFirePacket, isLocalOwner: boolean) => {
      if (pkt.item !== "SANDALA" && pkt.item !== "BUTAGAZ") return;
      const mesh = buildMemeProjectileMesh(pkt.item);
      const fx = Math.sin(pkt.yaw);
      const fz = Math.cos(pkt.yaw);
      const sx = pkt.x + fx * 2.5;
      const sz = pkt.z + fz * 2.5;
      mesh.position.set(sx, pkt.y, sz);
      mesh.rotation.y = pkt.yaw;
      scene.add(mesh);

      const launchSpeed =
        pkt.item === "SANDALA" ? 45.0 : Math.max(22, pkt.speed + 21.0);
      activeProjectiles.push({
        id: pkt.id,
        ownerId: pkt.ownerId,
        isLocalOwner,
        kind: pkt.item,
        x: sx,
        y: pkt.y,
        z: sz,
        vx: fx * launchSpeed,
        vy: pkt.item === "BUTAGAZ" ? 8.5 : 0,
        vz: fz * launchSpeed,
        yaw: pkt.yaw,
        targetId: pkt.targetId,
        bouncesLeft: pkt.item === "BUTAGAZ" ? 1 : 0,
        age: 0,
        mesh,
      });
    };

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    let camYaw = localKinRef.current.yaw;
    let hitStopUntil = 0;
    const localRamCooldown = new Map<string, number>();
    let lastWallSoundAt = 0;

    let wasInCountdown = Date.now() < countdownEndsAt;
    let launchRevCharge = 0;

    let rafId = 0;
    let lastPerf = performance.now();

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const perfNow = performance.now();
      const rawDt = Math.min(0.05, (perfNow - lastPerf) / 1000);
      lastPerf = perfNow;

      if (perfNow < hitStopUntil) {
        renderer.render(scene, camera);
        return;
      }

      const dt = rawDt;
      const nowMs = Date.now();
      const timeSec = perfNow * 0.001;
      const inCountdown = nowMs < countdownEndsAt;

      skyMat.uniforms.uTime.value = timeSec;
      oceanMat.uniforms.uTime.value = timeSec;
      animateKsidaMaterials(dt);

      // 1. Drain newly fired projectiles & visual explosions
      while (projectileQueueRef.current.length > 0) {
        const pkt = projectileQueueRef.current.shift()!;
        spawnProjectileFromPacket(pkt, pkt.ownerId === myId);
      }
      while (boomQueueRef.current.length > 0) {
        const bm = boomQueueRef.current.shift()!;
        spawnCrashDebris(bm.x, bm.y, bm.z, bm.colorHex, 15, true);
        if (bm.labelAr) {
          spawnComicPopup(bm.x, bm.y + 0.5, bm.z, bm.labelAr, "#dc2626");
        }
        screenShakeRef.current = Math.max(screenShakeRef.current, 0.78);
      }

      const racersMap = racersRef.current;
      const me = racersMap[myId];
      const kin = localKinRef.current;

      // 2. Step Local Car 60Hz Physics + Perfect Countdown Launch!
      if (me && me.isAlive && phase === "PLAYING") {
        const inp = driveInputRef.current;

        if (inCountdown) {
          wasInCountdown = true;
          if (inp.throttle > 0.2) {
            launchRevCharge = Math.min(1.15, launchRevCharge + dt * 0.82);
          } else {
            launchRevCharge = Math.max(0, launchRevCharge - dt * 1.15);
          }
          if (revMeterRef) revMeterRef.current = Math.min(1, launchRevCharge);

          stepCarKinematics(
            kin,
            {
              throttle: 0,
              steer: inp.steer,
              driftHeld: false,
              hopTap: false,
              nitroHeld: false,
              atayActive: false,
              countdownLocked: true,
            },
            me.vehicle,
            mode,
            dt
          );
          ksidaSfx.updateEngineAndDrift(launchRevCharge * 29, false, launchRevCharge > 0.7, true);
        } else {
          // Check Mario-Kart Perfect Launch right as GO! fires!
          if (wasInCountdown) {
            wasInCountdown = false;
            if (launchRevCharge >= 0.48 && launchRevCharge <= 0.98) {
              kin.turboPadTimer = 1.65;
              kin.forwardSpeed = 34.0;
              kin.vx = Math.sin(kin.yaw) * 34.0;
              kin.vz = Math.cos(kin.yaw) * 34.0;
              kin.nitro = Math.min(100, kin.nitro + 30);
              ksidaSfx.playTurboPad();
              spawnComicPopup(kin.x, kin.y + 1.2, kin.z, "انطلاقة صاروخية! 🚀", "#10b981");
              cbsRef.current.onPerfectLaunch?.();
            }
            launchRevCharge = 0;
            if (revMeterRef) revMeterRef.current = 0;
          }

          const hopTap = inp.hopRequested;
          inp.hopRequested = false;

          const stepEv = stepCarKinematics(
            kin,
            {
              throttle: me.finishedAt > 0 ? 0.3 : inp.throttle,
              steer: inp.steer,
              driftHeld: inp.driftHeld,
              hopTap,
              nitroHeld: inp.nitroHeld,
              atayActive: me.atayUntil > nowMs,
            },
            me.vehicle,
            mode,
            dt
          );

          if (stepEv.hitTurboPad) {
            ksidaSfx.playTurboPad();
            spawnComicPopup(kin.x, kin.y + 0.9, kin.z, "تيربو خارق! ⚡", "#0ea5e9");
            screenShakeRef.current = Math.max(screenShakeRef.current, 0.25);
          }

          if (stepEv.wallHitIntensity > 5.5) {
            localProgressRef.current.wallHits += 1;
            screenShakeRef.current = Math.max(
              screenShakeRef.current,
              Math.min(0.45, stepEv.wallHitIntensity * 0.024)
            );
            if (perfNow - lastWallSoundAt > 260) {
              lastWallSoundAt = perfNow;
              ksidaSfx.playCrashImpact(stepEv.wallHitIntensity / 18, false);
            }
            spawnCrashDebris(kin.x, kin.y, kin.z, 0xfbbf24, 4, false);
          }

          const relStage = stepEv.driftBoostReleasedStage;
          if (relStage !== 0) {
            const pts = relStage * 25;
            localProgressRef.current.driftScore += pts;
            me.score += relStage * 5;
            ksidaSfx.playDriftBoost(relStage);
            if (relStage >= 2) {
              spawnComicPopup(
                kin.x,
                kin.y + 0.8,
                kin.z,
                relStage === 3 ? "أتاي دريفت! 🔥" : "دريفت ناضي! ⚡",
                relStage === 3 ? "#9333ea" : "#d97706"
              );
            }
          }

          if (stepEv.launchedRamp) {
            ksidaSfx.playDriftBoost(2);
            spawnComicPopup(kin.x, kin.y + 1.0, kin.z, "طيران جوي! 🦅", "#0284c7");
          }

          // Dual rear tire skidmarks when drifting or spinning out
          if ((kin.isDrifting || kin.spinTimer > 0) && !kin.isAirborne) {
            if (Math.hypot(kin.x - lastSkidLeftX, kin.z - lastSkidLeftZ) > 0.8) {
              lastSkidLeftX = kin.x;
              lastSkidLeftZ = kin.z;
              const rx = -Math.cos(kin.yaw);
              const rz = Math.sin(kin.yaw);
              const bx = kin.x - Math.sin(kin.yaw) * 1.15;
              const bz = kin.z - Math.cos(kin.yaw) * 1.15;
              for (const side of [-0.74, 0.74]) {
                const sm = skidMeshes[skidCursor % MAX_SKIDS];
                skidCursor += 1;
                sm.position.set(bx + rx * side, kin.y + 0.048, bz + rz * side);
                sm.rotation.y = kin.yaw;
                sm.visible = true;
              }
            }
          }

          // Knockable Traffic Cones (`cone.glb`)!
          for (const cone of knockableCones) {
            if (cone.knockedUntil < nowMs && Math.hypot(kin.x - cone.x, kin.z - cone.z) < 1.85) {
              cone.knockedUntil = nowMs + 8000;
              cone.vx = kin.vx * 1.25 + (Math.random() - 0.5) * 6;
              cone.vy = 6.5 + Math.random() * 4;
              cone.vz = kin.vz * 1.25 + (Math.random() - 0.5) * 6;
              me.score += 2;
              ksidaSfx.haptic(8);
            }
          }

          // Update RACE Checkpoints & Lap Progress
          if (mode === "RACE" && me.finishedAt === 0) {
            const prog = updateRaceCheckpointAndProgress(
              kin.x,
              kin.z,
              localProgressRef.current.lap,
              localProgressRef.current.nextCheckpoint
            );
            localProgressRef.current.lap = prog.lap;
            localProgressRef.current.nextCheckpoint = prog.nextCheckpoint;
            localProgressRef.current.trackProgress = prog.trackProgress;

            if (prog.completedLap && prog.lap <= targetLaps) {
              ksidaSfx.playLapFanfare(false);
              cbsRef.current.onLapBanner?.(prog.lap, targetLaps);
              spawnComicPopup(
                kin.x,
                kin.y + 1.2,
                kin.z,
                `الدورة ${prog.lap}/${targetLaps}! 🏁`,
                "#16a34a"
              );
            }
          }

          // Check Local Car vs Rivals Collision (Instant 60fps Ramming!)
          for (const other of Object.values(racersMap)) {
            if (other.id === myId || !other.isAlive) continue;
            if (perfNow - (localRamCooldown.get(other.id) || 0) < 420) continue;

            const peer = peersRef.current.get(other.id);
            const ox = peer ? peer.x : other.x;
            const oz = peer ? peer.z : other.z;
            const ovx = peer ? peer.vx : other.vx;
            const ovz = peer ? peer.vz : other.vz;
            const oyaw = peer ? peer.yw : other.yaw;

            const col = resolveCarVsCarCollision(
              {
                x: kin.x,
                z: kin.z,
                vx: kin.vx,
                vz: kin.vz,
                yaw: kin.yaw,
                vehicle: me.vehicle,
                isNitro: kin.isNitroActive || kin.turboPadTimer > 0,
                atayActive: me.atayUntil > nowMs,
              },
              {
                x: ox,
                z: oz,
                vx: ovx,
                vz: ovz,
                yaw: oyaw,
                vehicle: other.vehicle,
                isNitro: Boolean(peer?.nt),
                atayActive: other.atayUntil > nowMs,
              }
            );

            if (col) {
              localRamCooldown.set(other.id, perfNow);
              kin.vx += col.impulseOnAX;
              kin.vz += col.impulseOnAZ;
              kin.forwardSpeed =
                kin.vx * Math.sin(kin.yaw) + kin.vz * Math.cos(kin.yaw);

              const heavyHit = col.damageToB >= 22 || col.isTBoneOnB;
              ksidaSfx.playCrashImpact(col.impactSpeed / 14, heavyHit);
              screenShakeRef.current = Math.max(
                screenShakeRef.current,
                heavyHit ? 0.85 : 0.42
              );
              spawnCrashDebris(
                col.hitX,
                kin.y + 0.5,
                col.hitZ,
                me.accentHex,
                heavyHit ? 14 : 7,
                heavyHit
              );

              if (heavyHit) {
                hitStopUntil = perfNow + 36;
                spawnComicPopup(
                  col.hitX,
                  kin.y + 1.1,
                  col.hitZ,
                  col.isTBoneOnB ? "تي-بون قاتل! 💥" : "بااااك! 🚕",
                  "#ef4444"
                );
              }

              if (col.damageToB >= 5) {
                cbsRef.current.onClaimRamHit({
                  attackerId: myId,
                  victimId: other.id,
                  damage: col.damageToB,
                  impulseX: col.impulseOnBX,
                  impulseZ: col.impulseOnBZ,
                  spinMs: col.spinMsOnB,
                  isTBone: col.isTBoneOnB,
                  x: col.hitX,
                  y: kin.y,
                  z: col.hitZ,
                });
              }
            }
          }

          cbsRef.current.onLocalPosTick();
          ksidaSfx.updateEngineAndDrift(
            Math.abs(kin.forwardSpeed),
            kin.isDrifting,
            kin.isNitroActive || kin.turboPadTimer > 0 || me.atayUntil > nowMs,
            true
          );
        }
      } else {
        ksidaSfx.updateEngineAndDrift(0, false, false, false);
      }

      // Step Knockable Cones physics & auto-reset
      for (const cone of knockableCones) {
        if (cone.knockedUntil > 0) {
          if (nowMs >= cone.knockedUntil) {
            cone.knockedUntil = 0;
            cone.x = cone.homeX;
            cone.y = 0;
            cone.z = cone.homeZ;
            cone.mesh.position.set(cone.homeX, 0, cone.homeZ);
            cone.mesh.rotation.set(0, 0, 0);
          } else {
            cone.vy -= 20 * dt;
            cone.x += cone.vx * dt;
            cone.y = Math.max(0, cone.y + cone.vy * dt);
            cone.z += cone.vz * dt;
            if (cone.y === 0) {
              cone.vx *= 0.9;
              cone.vz *= 0.9;
            }
            cone.mesh.position.set(cone.x, cone.y, cone.z);
            cone.mesh.rotation.x += cone.vz * dt;
            cone.mesh.rotation.z -= cone.vx * dt;
          }
        }
      }

      // Highlight Active Next Checkpoint Gate in RACE mode
      if (mode === "RACE") {
        const nextCp = localProgressRef.current.nextCheckpoint;
        for (const arch of checkpointArches) {
          arch.ringMat.color.setHex(arch.id === nextCp ? 0x22c55e : 0x38bdf8);
        }
      }

      // Update Loose Golden Tagine Crown Beacon in DERBY mode
      if (mode === "DERBY" && !crownHolderRef.current) {
        looseCrownGroup.visible = true;
        looseCrownGroup.position.set(crownPosRef.current.x, 0, crownPosRef.current.z);
        crownGem.rotation.y = timeSec * 2.5;
        crownGem.position.y = 1.45 + Math.sin(timeSec * 4) * 0.22;
      } else {
        looseCrownGroup.visible = false;
      }

      // 3. Sync Mystery Crates & Explosive Barrels
      for (const pad of cratesRef.current) {
        let m = crateMeshes.get(pad.id);
        if (!m) {
          m = buildMysteryCrateMesh();
          scene.add(m);
          crateMeshes.set(pad.id, m);
        }
        m.visible = pad.available;
        if (pad.available) {
          m.position.set(pad.x, pad.y + 0.35 + Math.sin(timeSec * 3.2 + pad.x) * 0.16, pad.z);
          m.rotation.y = timeSec * 2.1;
        }
      }

      for (const brl of barrelsRef.current) {
        let bm = barrelMeshes.get(brl.id);
        if (!bm) {
          bm = buildExplosiveBarrelMesh();
          scene.add(bm);
          barrelMeshes.set(brl.id, bm);
        }
        bm.visible = brl.available;
        if (brl.available) {
          bm.position.set(brl.x, 0, brl.z);
          const pulse = 1 + Math.sin(timeSec * 5 + brl.x) * 0.04;
          bm.scale.setScalar(pulse);
        }
      }

      // 4. Sync Hazards
      const activeHazardIds = new Set<string>();
      for (const hz of hazardsRef.current) {
        activeHazardIds.add(hz.id);
        let hm = hazardMeshes.get(hz.id);
        if (!hm) {
          hm = buildMemeProjectileMesh(hz.kind);
          scene.add(hm);
          hazardMeshes.set(hz.id, hm);
        }
        hm.position.set(hz.x, 0, hz.z);
        if (hz.kind === "WATERMELON") {
          hm.rotation.x += Math.hypot(hz.vx, hz.vz) * dt;
          hm.rotation.y += dt * 2;
        }
      }
      for (const [hid, hm] of hazardMeshes.entries()) {
        if (!activeHazardIds.has(hid)) {
          scene.remove(hm);
          hazardMeshes.delete(hid);
        }
      }

      // 5. Step Active Flying Projectiles
      for (let i = activeProjectiles.length - 1; i >= 0; i--) {
        const proj = activeProjectiles[i];
        proj.age += dt;

        if (proj.kind === "SANDALA") {
          if (proj.targetId && racersMap[proj.targetId]?.isAlive) {
            const tgt = racersMap[proj.targetId];
            const peer = peersRef.current.get(proj.targetId);
            const tx = proj.targetId === myId ? kin.x : peer ? peer.x : tgt.x;
            const tz = proj.targetId === myId ? kin.z : peer ? peer.z : tgt.z;
            const desiredYaw = Math.atan2(tx - proj.x, tz - proj.z);
            const err = normalizeAngle(desiredYaw - proj.yaw);
            proj.yaw = normalizeAngle(proj.yaw + Math.max(-5.2 * dt, Math.min(5.2 * dt, err)));
            proj.vx = Math.sin(proj.yaw) * 45.0;
            proj.vz = Math.cos(proj.yaw) * 45.0;
          }
          proj.x += proj.vx * dt;
          proj.z += proj.vz * dt;
          proj.mesh.position.set(proj.x, 0.65 + Math.sin(timeSec * 18) * 0.12, proj.z);
          proj.mesh.rotation.y += dt * 18;

          let hitVictim: KsidaRacer | null = null;
          for (const u of Object.values(racersMap)) {
            if (u.id === proj.ownerId || !u.isAlive) continue;
            const ux = u.id === myId ? kin.x : peersRef.current.get(u.id)?.x ?? u.x;
            const uz = u.id === myId ? kin.z : peersRef.current.get(u.id)?.z ?? u.z;
            if (Math.hypot(ux - proj.x, uz - proj.z) < 2.45) {
              hitVictim = u;
              break;
            }
          }

          if (hitVictim || proj.age > 4.6) {
            scene.remove(proj.mesh);
            activeProjectiles.splice(i, 1);
            if (hitVictim) {
              ksidaSfx.playSandalaSlap();
              spawnCrashDebris(proj.x, 0.8, proj.z, 0xec4899, 12, true);
              spawnComicPopup(proj.x, 1.4, proj.z, "طرااااخ! 🩴", "#db2777");
              if (proj.isLocalOwner) {
                cbsRef.current.onClaimProjectileHit({
                  attackerId: proj.ownerId,
                  victimId: hitVictim.id,
                  item: "SANDALA",
                  damage: 38,
                  spinMs: 1050,
                  impulseX: Math.sin(proj.yaw) * 14,
                  impulseZ: Math.cos(proj.yaw) * 14,
                  x: proj.x,
                  y: 0.6,
                  z: proj.z,
                });
              }
            }
          }
        } else {
          proj.vy -= 22 * dt;
          proj.x += proj.vx * dt;
          proj.y += proj.vy * dt;
          proj.z += proj.vz * dt;
          proj.mesh.position.set(proj.x, Math.max(0.1, proj.y), proj.z);
          proj.mesh.rotation.x += dt * 9;
          proj.mesh.rotation.z += dt * 7;

          let detonate = proj.age > 2.9;
          if (proj.y <= 0.15) {
            if (proj.bouncesLeft > 0) {
              proj.bouncesLeft -= 1;
              proj.y = 0.16;
              proj.vy = 5.6;
              proj.vx *= 0.68;
              proj.vz *= 0.68;
            } else {
              detonate = true;
            }
          }

          if (detonate) {
            scene.remove(proj.mesh);
            activeProjectiles.splice(i, 1);
            ksidaSfx.playButagazExplosion();
            spawnCrashDebris(proj.x, 0.6, proj.z, 0xef4444, 18, true);
            spawnComicPopup(proj.x, 1.5, proj.z, "تفرگعات البوطا! 💥", "#dc2626");
            screenShakeRef.current = Math.max(screenShakeRef.current, 0.65);

            if (proj.isLocalOwner) {
              const BLAST_R = 8.2;
              for (const u of Object.values(racersMap)) {
                if (!u.isAlive) continue;
                const ux = u.id === myId ? kin.x : peersRef.current.get(u.id)?.x ?? u.x;
                const uz = u.id === myId ? kin.z : peersRef.current.get(u.id)?.z ?? u.z;
                const d = Math.hypot(ux - proj.x, uz - proj.z);
                if (d <= BLAST_R && u.id !== proj.ownerId) {
                  const nx = d > 0.01 ? (ux - proj.x) / d : 1;
                  const nz = d > 0.01 ? (uz - proj.z) / d : 0;
                  const falloff = 1 - (d / BLAST_R) * 0.55;
                  cbsRef.current.onClaimProjectileHit({
                    attackerId: proj.ownerId,
                    victimId: u.id,
                    item: "BUTAGAZ",
                    damage: Math.round(52 * falloff),
                    spinMs: 850,
                    impulseX: nx * 24 * falloff,
                    impulseZ: nz * 24 * falloff,
                    x: ux,
                    y: 0.5,
                    z: uz,
                  });
                }
              }
            }
          }
        }
      }

      // 6. Step Transient Debris, Popups & Shockwaves
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          scene.remove(p.mesh);
          particles.splice(i, 1);
          continue;
        }
        p.vy -= p.gravity * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vy * dt);
        p.mesh.position.z += p.vz * dt;
        if (p.spinSpeed !== 0) {
          p.mesh.rotation.x += p.spinSpeed * dt;
          p.mesh.rotation.y += p.spinSpeed * 0.8 * dt;
        }
        if (p.scaleRate !== 0) {
          const s = Math.max(0.05, p.mesh.scale.x + p.scaleRate * dt);
          if (p.mesh instanceof THREE.Sprite) {
            const ratio = p.life / p.maxLife;
            p.mesh.material.opacity = 1 - Math.pow(ratio, 2);
          } else {
            p.mesh.scale.setScalar(s);
          }
        }
      }

      // 7. Render & Interpolate All 3D Moroccan GLB Vehicles!
      const standings = sortRacersStandings(Object.values(racersMap), mode);
      const rankById = new Map<string, number>();
      standings.forEach((s, idx) => rankById.set(s.id, idx + 1));

      const seenIds = new Set<string>();
      for (const r of Object.values(racersMap)) {
        seenIds.add(r.id);
        let rig = carRigs.get(r.id);
        if (rig && rig.vehicle !== r.vehicle) {
          scene.remove(rig.root);
          carRigs.delete(r.id);
          rig = undefined;
        }
        if (!rig) {
          rig = createKsidaCarRig(r.vehicle, r.id === myId);
          rig.root.position.set(r.x, r.y, r.z);
          rig.root.rotation.y = r.yaw;
          scene.add(rig.root);
          carRigs.set(r.id, rig);
        }

        rig.root.visible = r.isAlive;
        if (!r.isAlive) continue;

        const isMe = r.id === myId;
        let forwardSpd = 0;
        let steerVis = 0;
        let driftStg: 0 | 1 | 2 | 3 = 0;
        let driftDirVis = 0;
        let brakingVis = false;
        let nitroVis = false;
        let spinYawVis = 0;

        if (isMe) {
          rig.root.position.set(kin.x, kin.y, kin.z);
          rig.root.rotation.y = kin.yaw;
          forwardSpd = inCountdown ? launchRevCharge * 18 : kin.forwardSpeed;
          steerVis = kin.steerAngle;
          driftStg = kin.driftStage;
          driftDirVis = kin.driftDir;
          brakingVis = driveInputRef.current.throttle < -0.15;
          nitroVis = kin.isNitroActive || kin.turboPadTimer > 0 || (inCountdown && launchRevCharge > 0.72);
          spinYawVis = kin.visualSpinYaw;
        } else {
          const peer = peersRef.current.get(r.id);
          let tx = r.x;
          let ty = r.y;
          let tz = r.z;
          let tyaw = r.yaw;
          if (peer) {
            const ageSec = Math.min(0.16, Math.max(0, (perfNow - peer.t) / 1000));
            tx = peer.x + peer.vx * ageSec * 0.65;
            ty = peer.y;
            tz = peer.z + peer.vz * ageSec * 0.65;
            tyaw = peer.yw;
            forwardSpd = peer.sp;
            steerVis = peer.st;
            driftStg = (peer.dr as 0 | 1 | 2 | 3) || 0;
            driftDirVis = peer.st >= 0 ? 1 : -1;
            nitroVis = peer.nt === 1;
          }
          const lerpAlpha = Math.min(1, 14 * dt);
          rig.root.position.x += (tx - rig.root.position.x) * lerpAlpha;
          rig.root.position.y += (ty - rig.root.position.y) * lerpAlpha;
          rig.root.position.z += (tz - rig.root.position.z) * lerpAlpha;
          const yd = normalizeAngle(tyaw - rig.root.rotation.y);
          rig.root.rotation.y = normalizeAngle(rig.root.rotation.y + yd * lerpAlpha);

          if (r.spinUntil > nowMs) {
            spinYawVis = timeSec * 12;
          }
        }

        updateKsidaCarRigVisuals(rig, {
          dt,
          forwardSpeed: forwardSpd,
          steerAngle: steerVis,
          driftStage: driftStg,
          driftDir: driftDirVis,
          isBraking: brakingVis,
          hpRatio: r.hp / Math.max(1, r.maxHp),
          isNitro: nitroVis,
          atayActive: r.atayUntil > nowMs,
          shieldActive: r.shieldUntil > nowMs,
          hasCrown: crownHolderRef.current === r.id,
          hasHotBomb: hotBombHolderRef.current === r.id,
          visualSpinYaw: spinYawVis,
          timeSec,
        });

        const activeTaunt =
          r.lastTauntId && nowMs - r.lastTauntAt < 3600 ? r.lastTauntId : null;
        syncKsidaDriverHudPlate(rig, {
          nickname: r.nickname,
          hp: r.hp,
          maxHp: r.maxHp,
          rankPos: rankById.get(r.id) || 1,
          isMe,
          activeTauntId: activeTaunt,
        });
      }

      for (const [rid, rig] of carRigs.entries()) {
        if (!seenIds.has(rid)) {
          scene.remove(rig.root);
          carRigs.delete(rid);
        }
      }

      // 8. Crisp Center-Locked Pro Arcade Chase Camera + Dynamic Shadow Tracking!
      const targetCarX = me ? kin.x : 0;
      const targetCarY = me ? kin.y : 0;
      const targetCarZ = me ? kin.z : 0;
      const targetCarYaw = me ? kin.yaw : timeSec * 0.25;

      // Move directional light shadow box smoothly with player (4m texel snap prevents shadow shimmer!)
      const snapX = Math.round(targetCarX / 4) * 4;
      const snapZ = Math.round(targetCarZ / 4) * 4;
      sun.position.set(snapX + 75, 92, snapZ - 55);
      sun.target.position.set(snapX, 0, snapZ);

      const lookBack = driveInputRef.current.lookBackHeld;
      const desiredCamYaw = lookBack ? normalizeAngle(targetCarYaw + Math.PI) : targetCarYaw;
      const camYawDiff = normalizeAngle(desiredCamYaw - camYaw);
      camYaw = normalizeAngle(camYaw + camYawDiff * Math.min(1, (lookBack ? 20 : 10.5) * dt));

      const isFastBoost = Boolean(
        me &&
          (kin.isNitroActive ||
            kin.turboPadTimer > 0 ||
            me.atayUntil > nowMs ||
            kin.driftBoostTimer > 0)
      );
      const targetFov = isFastBoost ? 76 : 63 + Math.min(6.5, Math.abs(kin.forwardSpeed) * 0.18);
      camera.fov += (targetFov - camera.fov) * Math.min(1, 7.5 * dt);
      camera.updateProjectionMatrix();

      const camDist = isFastBoost ? 8.6 : 7.8;
      const camHeight = 3.9;
      let cx = targetCarX - Math.sin(camYaw) * camDist;
      let cy = targetCarY + camHeight;
      let cz = targetCarZ - Math.cos(camYaw) * camDist;

      if (screenShakeRef.current > 0.01) {
        const sh = screenShakeRef.current;
        cx += (Math.random() - 0.5) * sh * 0.85;
        cy += (Math.random() - 0.5) * sh * 0.6;
        cz += (Math.random() - 0.5) * sh * 0.85;
        screenShakeRef.current *= Math.pow(0.04, dt);
      } else {
        screenShakeRef.current = 0;
      }

      camera.position.set(cx, cy, cz);
      // Look directly over the car's roof + forward velocity lead so the car stays centered on every hairpin!
      const leadSign = lookBack ? -1 : 1;
      camera.lookAt(
        targetCarX + Math.sin(targetCarYaw) * 3.2 * leadSign,
        targetCarY + 1.32,
        targetCarZ + Math.cos(targetCarYaw) * 3.2 * leadSign
      );

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      ksidaSfx.stopEngineLoop();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, [
    myId,
    mode,
    phase,
    countdownEndsAt,
    targetLaps,
    racersRef,
    cratesRef,
    barrelsRef,
    hazardsRef,
    peersRef,
    crownHolderRef,
    crownPosRef,
    hotBombHolderRef,
    localKinRef,
    localProgressRef,
    driveInputRef,
    revMeterRef,
    projectileQueueRef,
    boomQueueRef,
    screenShakeRef,
  ]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-hidden touch-none select-none"
    />
  );
}
