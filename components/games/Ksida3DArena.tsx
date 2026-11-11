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
  DERBY_ARENA_RADIUS,
  evaluateTrackBoundary,
  RONDA_PLAZA_RADIUS,
  STUNT_RAMPS,
  TRACK_CHECKPOINTS,
  TRACK_HALF_WIDTH,
  TRACK_POLYLINE,
  TRACK_SAMPLES,
  updateRaceCheckpointAndProgress,
} from "@/games/ksida3d/trackLayout";
import {
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
  buildCornichePalmTree,
  buildMemeProjectileMesh,
  buildMysteryCrateMesh,
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
  targetLaps: number;
  racersRef: React.MutableRefObject<Record<string, KsidaRacer>>;
  cratesRef: React.MutableRefObject<KsidaCratePad[]>;
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
  projectileQueueRef: React.MutableRefObject<KsidaItemFirePacket[]>;
  boomQueueRef: React.MutableRefObject<VisualBoomEvent[]>;
  screenShakeRef: React.MutableRefObject<number>;
  onLocalPosTick: () => void;
  onClaimRamHit: (claim: KsidaRamClaimPacket) => void;
  onClaimProjectileHit: (hit: KsidaItemHitPacket) => void;
  onLapBanner?: (lap: number, targetLaps: number) => void;
}

/** Builds continuous 3D road ribbon along TRACK_POLYLINE */
function buildFigure8RoadRibbonGeometry(halfWidth: number, yOffset = 0.02): THREE.BufferGeometry {
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
    const vCoord = cumLen / 16.0;
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

/** Builds raised red-and-white rally curb border strip along left or right road edge */
function buildRoadCurbStripGeometry(side: -1 | 1): THREE.BufferGeometry {
  const innerOff = TRACK_HALF_WIDTH - 0.1;
  const outerOff = TRACK_HALF_WIDTH + 0.85;
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

    // Skip curb segments that pass inside the open Central Ronda Plaza so intersection stays wide open!
    const inRonda = Math.hypot(pt.x, pt.z) < RONDA_PLAZA_RADIUS - 1.2;
    const yH = inRonda ? -0.15 : 0.24;

    const ix = pt.x + pt.nx * side * innerOff;
    const iz = pt.z + pt.nz * side * innerOff;
    const ox = pt.x + pt.nx * side * outerOff;
    const oz = pt.z + pt.nz * side * outerOff;

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
function buildRampMesh(width: number, length: number, height: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.BoxGeometry(width, 1, length, 1, 1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const ly = pos.getY(i);
    const lz = pos.getZ(i); // -length/2 .. +length/2
    if (ly < 0) {
      pos.setY(i, 0);
    } else {
      const t = (lz + length * 0.5) / length;
      pos.setY(i, Math.max(0.04, t * height));
    }
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
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
  sp.scale.set(4.5, 1.5, 1);
  sp.renderOrder = 35;
  return sp;
}

export function Ksida3DArena({
  myId,
  mode,
  phase,
  targetLaps,
  racersRef,
  cratesRef,
  hazardsRef,
  peersRef,
  crownHolderRef,
  crownPosRef,
  hotBombHolderRef,
  localKinRef,
  localProgressRef,
  driveInputRef,
  projectileQueueRef,
  boomQueueRef,
  screenShakeRef,
  onLocalPosTick,
  onClaimRamHit,
  onClaimProjectileHit,
  onLapBanner,
}: Ksida3DArenaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cbsRef = useRef({
    onLocalPosTick,
    onClaimRamHit,
    onClaimProjectileHit,
    onLapBanner,
  });
  cbsRef.current = {
    onLocalPosTick,
    onClaimRamHit,
    onClaimProjectileHit,
    onLapBanner,
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
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.fog = new THREE.FogExp2(0xf97316, 0.0026);

    const camera = new THREE.PerspectiveCamera(
      64,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.3,
      460
    );

    // Golden-Hour Sunset Sky + Sparkling Atlantic Ocean
    const skyMat = createMoroccanSunsetSkyMaterial();
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(320, 28, 20), skyMat);
    scene.add(skyDome);

    const oceanMat = createCornicheOceanMaterial();
    const oceanPlane = new THREE.Mesh(new THREE.PlaneGeometry(680, 680), oceanMat);
    oceanPlane.rotation.x = -Math.PI / 2;
    oceanPlane.position.y = -2.2;
    scene.add(oceanPlane);

    // Lighting
    const hemi = new THREE.HemisphereLight(0xffe4b5, 0x334155, 0.95);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1d0, 1.85);
    sun.position.set(65, 58, 42);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 220;
    sun.shadow.camera.left = -85;
    sun.shadow.camera.right = 85;
    sun.shadow.camera.top = 65;
    sun.shadow.camera.bottom = -65;
    scene.add(sun);

    const mats = getKsidaMaterials();

    // Coastal Sandy Island Plateau under the circuit
    const islandMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(96, 104, 2.0, 48),
      mats.sandTerrainMat
    );
    islandMesh.scale.set(1.0, 1.0, 0.72);
    islandMesh.position.y = -1.05;
    islandMesh.receiveShadow = true;
    scene.add(islandMesh);

    // Build Mode-Specific Track or Derby Stadium
    const checkpointArches: Array<{ id: number; ringMat: THREE.MeshBasicMaterial }> = [];

    if (mode === "RACE") {
      const roadMesh = new THREE.Mesh(
        buildFigure8RoadRibbonGeometry(TRACK_HALF_WIDTH, 0.03),
        mats.asphaltMat
      );
      roadMesh.receiveShadow = true;
      scene.add(roadMesh);

      const leftCurb = new THREE.Mesh(buildRoadCurbStripGeometry(-1), mats.curbMat);
      const rightCurb = new THREE.Mesh(buildRoadCurbStripGeometry(1), mats.curbMat);
      scene.add(leftCurb, rightCurb);

      // Central Ronda Zellige Roundabout Plaza
      const rondaDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(RONDA_PLAZA_RADIUS, RONDA_PLAZA_RADIUS, 0.08, 48),
        mats.rondaZelligeMat
      );
      rondaDisc.position.y = 0.01;
      rondaDisc.receiveShadow = true;
      scene.add(rondaDisc);

      // 4 Neon Moroccan Checkpoint Arches
      for (const cp of TRACK_CHECKPOINTS) {
        const archGroup = new THREE.Group();
        archGroup.position.set(cp.x, 0, cp.z);
        archGroup.rotation.y = cp.yaw;

        const isFinish = cp.id === 0;
        const pillarMat = new THREE.MeshStandardMaterial({
          color: isFinish ? 0xf59e0b : 0x1e293b,
          metalness: 0.6,
          roughness: 0.3,
        });
        for (const sx of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 7.2, 10), pillarMat);
          p.position.set(sx * (TRACK_HALF_WIDTH + 0.3), 3.6, 0);
          archGroup.add(p);
        }

        const ringMat = new THREE.MeshBasicMaterial({
          color: isFinish ? 0xfbbf24 : 0x38bdf8,
        });
        const topBeam = new THREE.Mesh(
          new THREE.BoxGeometry(TRACK_HALF_WIDTH * 2 + 1.4, 1.1, 0.65),
          ringMat
        );
        topBeam.position.set(0, 7.0, 0);
        archGroup.add(topBeam);

        checkpointArches.push({ id: cp.id, ringMat });
        scene.add(archGroup);
      }

      // Coastal Palm Trees outside the track shoulders
      for (let i = 0; i < TRACK_SAMPLES; i += 4) {
        const pt = TRACK_POLYLINE[i];
        const side = i % 8 === 0 ? 1 : -1;
        const px = pt.x + pt.nx * side * (TRACK_HALF_WIDTH + 4.8);
        const pz = pt.z + pt.nz * side * (TRACK_HALF_WIDTH + 4.8);
        if (evaluateTrackBoundary(px, pz, "RACE").sdf > 2.2) {
          const palm = buildCornichePalmTree(6.8 + (i % 3) * 0.9);
          palm.position.set(px, 0, pz);
          palm.rotation.y = i * 1.1;
          scene.add(palm);
        }
      }
    } else {
      // === GRAND RONDA STADIUM BOWL (DERBY & HOT_BOMB) ===
      const arenaFloor = new THREE.Mesh(
        new THREE.CylinderGeometry(DERBY_ARENA_RADIUS, DERBY_ARENA_RADIUS, 0.1, 56),
        mats.asphaltMat
      );
      arenaFloor.position.y = -0.02;
      arenaFloor.receiveShadow = true;
      scene.add(arenaFloor);

      const centerMedallion = new THREE.Mesh(
        new THREE.CylinderGeometry(15.5, 15.5, 0.08, 40),
        mats.rondaZelligeMat
      );
      centerMedallion.position.y = 0.02;
      scene.add(centerMedallion);

      // Stadium Wall Ring + Rally Curb
      const wallRing = new THREE.Mesh(
        new THREE.CylinderGeometry(
          DERBY_ARENA_RADIUS + 0.6,
          DERBY_ARENA_RADIUS + 0.6,
          1.65,
          48,
          1,
          true
        ),
        mats.curbMat
      );
      wallRing.material.side = THREE.DoubleSide;
      wallRing.position.y = 0.8;
      scene.add(wallRing);

      // Decorative Palms & Stadium Pillars outside the bowl
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2;
        const r = DERBY_ARENA_RADIUS + 4.2;
        const palm = buildCornichePalmTree(7.4);
        palm.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
        scene.add(palm);
      }
    }

    // Stunt Boost Ramps
    for (const r of STUNT_RAMPS) {
      if (!r.modes.includes(mode)) continue;
      const rampMesh = buildRampMesh(r.width, r.length, r.height, mats.boostRampMat);
      rampMesh.position.set(r.x, 0, r.z);
      rampMesh.rotation.y = r.yaw;
      scene.add(rampMesh);
    }

    // Unclaimed Golden Tagine Crown Pedestal Beacon (for DERBY mode)
    const looseCrownGroup = new THREE.Group();
    const crownBeacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 8.0, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    crownBeacon.position.y = 4.0;
    looseCrownGroup.add(crownBeacon);
    const crownGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.95, 0),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xd97706,
        emissiveIntensity: 0.7,
        metalness: 0.85,
        roughness: 0.15,
      })
    );
    crownGem.position.y = 1.4;
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

    // Hazard Meshes (Beldi Soap Slicks & Rolling Watermelons)
    const hazardMeshes = new Map<string, THREE.Group>();

    // Car Rigs Map
    const carRigs = new Map<string, KsidaCarRig>();

    // Tire Skidmark Ring-Buffer Pool (160 persistent quads)
    const MAX_SKIDS = 160;
    const skidMeshes: THREE.Mesh[] = [];
    const skidGeo = new THREE.PlaneGeometry(0.36, 0.95);
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

    // Active Projectiles & Transient FX Particles
    const activeProjectiles: ActiveMemeProjectile[] = [];
    const particles: TransientParticle[] = [];
    const debrisBoxGeo = new THREE.BoxGeometry(0.32, 0.22, 0.32);

    const spawnComicPopup = (x: number, y: number, z: number, text: string, bg: string) => {
      const sp = createComicPopupSprite(text, bg);
      sp.position.set(x, y + 1.8, z);
      scene.add(sp);
      particles.push({
        mesh: sp,
        vx: (Math.random() - 0.5) * 1.2,
        vy: 3.4,
        vz: (Math.random() - 0.5) * 1.2,
        gravity: 1.5,
        scaleRate: 0.65,
        spinSpeed: 0,
        life: 0,
        maxLife: 1.15,
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
        const spd = 4 + Math.random() * 11;
        scene.add(m);
        particles.push({
          mesh: m,
          vx: Math.cos(ang) * spd,
          vy: 4.5 + Math.random() * 7.5,
          vz: Math.sin(ang) * spd,
          gravity: 22,
          scaleRate: -0.5,
          spinSpeed: 8 + Math.random() * 10,
          life: 0,
          maxLife: 0.85 + Math.random() * 0.35,
        });
      }

      if (withShockwave) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.6, 1.5, 24),
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
          scaleRate: 14.5,
          spinSpeed: 0,
          life: 0,
          maxLife: 0.45,
        });
      }
    };

    const spawnProjectileFromPacket = (pkt: KsidaItemFirePacket, isLocalOwner: boolean) => {
      if (pkt.item !== "SANDALA" && pkt.item !== "BUTAGAZ") return;
      const mesh = buildMemeProjectileMesh(pkt.item);
      const fx = Math.sin(pkt.yaw);
      const fz = Math.cos(pkt.yaw);
      const sx = pkt.x + fx * 2.4;
      const sz = pkt.z + fz * 2.4;
      mesh.position.set(sx, pkt.y, sz);
      mesh.rotation.y = pkt.yaw;
      scene.add(mesh);

      const launchSpeed =
        pkt.item === "SANDALA" ? 41.0 : Math.max(20, pkt.speed + 19.5);
      activeProjectiles.push({
        id: pkt.id,
        ownerId: pkt.ownerId,
        isLocalOwner,
        kind: pkt.item,
        x: sx,
        y: pkt.y,
        z: sz,
        vx: fx * launchSpeed,
        vy: pkt.item === "BUTAGAZ" ? 8.2 : 0,
        vz: fz * launchSpeed,
        yaw: pkt.yaw,
        targetId: pkt.targetId,
        bouncesLeft: pkt.item === "BUTAGAZ" ? 1 : 0,
        age: 0,
        mesh,
      });
    };

    // Resize listener
    const handleResize = () => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Smooth Chase Camera State
    let camYaw = localKinRef.current.yaw;
    let hitStopUntil = 0;
    const localRamCooldown = new Map<string, number>();
    let lastWallSoundAt = 0;

    let rafId = 0;
    let lastPerf = performance.now();

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const perfNow = performance.now();
      const rawDt = Math.min(0.05, (perfNow - lastPerf) / 1000);
      lastPerf = perfNow;

      // Micro Hit-Stop on mega T-bone impact!
      if (perfNow < hitStopUntil) {
        renderer.render(scene, camera);
        return;
      }

      const dt = rawDt;
      const nowMs = Date.now();
      const timeSec = perfNow * 0.001;

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
        spawnCrashDebris(bm.x, bm.y, bm.z, bm.colorHex, 14, true);
        if (bm.labelAr) {
          spawnComicPopup(bm.x, bm.y + 0.5, bm.z, bm.labelAr, "#dc2626");
        }
        screenShakeRef.current = Math.max(screenShakeRef.current, 0.75);
      }

      const racersMap = racersRef.current;
      const me = racersMap[myId];
      const kin = localKinRef.current;

      // 2. Step Local Car 60Hz Physics!
      if (me && me.isAlive && phase === "PLAYING") {
        const inp = driveInputRef.current;
        const hopTap = inp.hopRequested;
        inp.hopRequested = false;

        const stepEv = stepCarKinematics(
          kin,
          {
            throttle: me.finishedAt > 0 ? 0.25 : inp.throttle,
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

        if (stepEv.wallHitIntensity > 5.5) {
          localProgressRef.current.wallHits += 1;
          screenShakeRef.current = Math.max(
            screenShakeRef.current,
            Math.min(0.45, stepEv.wallHitIntensity * 0.025)
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

        // Lay down dual rear tire skidmarks when drifting or spinning out!
        if ((kin.isDrifting || kin.spinTimer > 0) && !kin.isAirborne) {
          if (Math.hypot(kin.x - lastSkidLeftX, kin.z - lastSkidLeftZ) > 0.75) {
            lastSkidLeftX = kin.x;
            lastSkidLeftZ = kin.z;
            const rx = -Math.cos(kin.yaw);
            const rz = Math.sin(kin.yaw);
            const bx = kin.x - Math.sin(kin.yaw) * 1.1;
            const bz = kin.z - Math.cos(kin.yaw) * 1.1;
            for (const side of [-0.72, 0.72]) {
              const sm = skidMeshes[skidCursor % MAX_SKIDS];
              skidCursor += 1;
              sm.position.set(bx + rx * side, kin.y + 0.045, bz + rz * side);
              sm.rotation.y = kin.yaw;
              sm.visible = true;
            }
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
            spawnComicPopup(kin.x, kin.y + 1.2, kin.z, `الدورة ${prog.lap}/${targetLaps}! 🏁`, "#16a34a");
          }
        }

        // Check Local Car vs Rivals Collision (Instant 60fps Ramming!)
        for (const other of Object.values(racersMap)) {
          if (other.id === myId || !other.isAlive) continue;
          if (perfNow - (localRamCooldown.get(other.id) || 0) < 420) continue;

          // Use interpolated peer coordinates if available
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
              isNitro: kin.isNitroActive,
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
            spawnCrashDebris(col.hitX, kin.y + 0.5, col.hitZ, me.accentHex, heavyHit ? 14 : 7, heavyHit);

            if (heavyHit) {
              hitStopUntil = perfNow + 38; // Crisp Burnout micro-freeze!
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
          kin.isNitroActive || me.atayUntil > nowMs,
          true
        );
      } else {
        ksidaSfx.updateEngineAndDrift(0, false, false, false);
      }

      // Highlight Active Next Checkpoint Arch in RACE mode
      if (mode === "RACE") {
        const nextCp = localProgressRef.current.nextCheckpoint;
        for (const arch of checkpointArches) {
          if (arch.id === nextCp) {
            arch.ringMat.color.setHex(0x22c55e); // Bright Emerald Beacon for next gate!
          } else {
            arch.ringMat.color.setHex(arch.id === 0 ? 0xfbbf24 : 0x38bdf8);
          }
        }
      }

      // Update Loose Golden Tagine Crown Beacon in DERBY mode
      if (mode === "DERBY" && !crownHolderRef.current) {
        looseCrownGroup.visible = true;
        looseCrownGroup.position.set(crownPosRef.current.x, 0, crownPosRef.current.z);
        crownGem.rotation.y = timeSec * 2.5;
        crownGem.position.y = 1.35 + Math.sin(timeSec * 4) * 0.22;
      } else {
        looseCrownGroup.visible = false;
      }

      // 3. Sync Mystery Crates
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

      // 4. Sync Hazards (Beldi Soap Slicks & Rolling Watermelons)
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

      // 5. Step Active Flying Projectiles (Homing Sandala & Arcing Butagaz)
      for (let i = activeProjectiles.length - 1; i >= 0; i--) {
        const proj = activeProjectiles[i];
        proj.age += dt;

        if (proj.kind === "SANDALA") {
          // Homing curve toward target!
          if (proj.targetId && racersMap[proj.targetId]?.isAlive) {
            const tgt = racersMap[proj.targetId];
            const peer = peersRef.current.get(proj.targetId);
            const tx = proj.targetId === myId ? kin.x : peer ? peer.x : tgt.x;
            const tz = proj.targetId === myId ? kin.z : peer ? peer.z : tgt.z;
            const desiredYaw = Math.atan2(tx - proj.x, tz - proj.z);
            const err = normalizeAngle(desiredYaw - proj.yaw);
            proj.yaw = normalizeAngle(proj.yaw + Math.max(-4.8 * dt, Math.min(4.8 * dt, err)));
            proj.vx = Math.sin(proj.yaw) * 41.0;
            proj.vz = Math.cos(proj.yaw) * 41.0;
          }
          proj.x += proj.vx * dt;
          proj.z += proj.vz * dt;
          proj.mesh.position.set(proj.x, 0.65 + Math.sin(timeSec * 18) * 0.12, proj.z);
          proj.mesh.rotation.y += dt * 18; // Spinning Chancla!

          // Check hit on any rival
          let hitVictim: KsidaRacer | null = null;
          for (const u of Object.values(racersMap)) {
            if (u.id === proj.ownerId || !u.isAlive) continue;
            const ux = u.id === myId ? kin.x : peersRef.current.get(u.id)?.x ?? u.x;
            const uz = u.id === myId ? kin.z : peersRef.current.get(u.id)?.z ?? u.z;
            if (Math.hypot(ux - proj.x, uz - proj.z) < 2.35) {
              hitVictim = u;
              break;
            }
          }

          if (hitVictim || proj.age > 4.2) {
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
          // BUTAGAZ Arcing Bomb
          proj.vy -= 22 * dt;
          proj.x += proj.vx * dt;
          proj.y += proj.vy * dt;
          proj.z += proj.vz * dt;
          proj.mesh.position.set(proj.x, Math.max(0.1, proj.y), proj.z);
          proj.mesh.rotation.x += dt * 9;
          proj.mesh.rotation.z += dt * 7;

          let detonate = proj.age > 2.8;
          if (proj.y <= 0.15) {
            if (proj.bouncesLeft > 0) {
              proj.bouncesLeft -= 1;
              proj.y = 0.16;
              proj.vy = 5.4;
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
              const BLAST_R = 7.6;
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

      // 7. Render & Interpolate All 3D Moroccan Vehicles!
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
        let nitroVis = false;
        let spinYawVis = 0;

        if (isMe) {
          rig.root.position.set(kin.x, kin.y, kin.z);
          rig.root.rotation.y = kin.yaw;
          forwardSpd = kin.forwardSpeed;
          steerVis = kin.steerAngle;
          driftStg = kin.driftStage;
          nitroVis = kin.isNitroActive;
          spinYawVis = kin.visualSpinYaw;
        } else {
          // Velocity-extrapolated smooth 60fps peer tracking
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

      // 8. Dynamic Speed-FOV Arcade Chase Camera!
      const targetCarX = me ? kin.x : 0;
      const targetCarY = me ? kin.y : 0;
      const targetCarZ = me ? kin.z : 0;
      const targetCarYaw = me ? kin.yaw : timeSec * 0.25;

      const lookBack = driveInputRef.current.lookBackHeld;
      const desiredCamYaw = lookBack ? normalizeAngle(targetCarYaw + Math.PI) : targetCarYaw;
      const camYawDiff = normalizeAngle(desiredCamYaw - camYaw);
      camYaw = normalizeAngle(camYaw + camYawDiff * Math.min(1, (lookBack ? 18 : 7.2) * dt));

      const isFastBoost = Boolean(
        me && (kin.isNitroActive || me.atayUntil > nowMs || kin.driftBoostTimer > 0)
      );
      const targetFov = isFastBoost ? 75 : 63 + Math.min(6, Math.abs(kin.forwardSpeed) * 0.18);
      camera.fov += (targetFov - camera.fov) * Math.min(1, 7 * dt);
      camera.updateProjectionMatrix();

      const camDist = isFastBoost ? 8.3 : 7.6;
      const camHeight = 3.85;
      let cx = targetCarX - Math.sin(camYaw) * camDist;
      let cy = targetCarY + camHeight;
      let cz = targetCarZ - Math.cos(camYaw) * camDist;

      // Directional Screen Shake decay
      if (screenShakeRef.current > 0.01) {
        const sh = screenShakeRef.current;
        cx += (Math.random() - 0.5) * sh * 0.9;
        cy += (Math.random() - 0.5) * sh * 0.65;
        cz += (Math.random() - 0.5) * sh * 0.9;
        screenShakeRef.current *= Math.pow(0.04, dt);
      } else {
        screenShakeRef.current = 0;
      }

      camera.position.set(cx, cy, cz);
      camera.lookAt(
        targetCarX + Math.sin(camYaw) * 4.5,
        targetCarY + 1.25,
        targetCarZ + Math.cos(camYaw) * 4.5
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
    targetLaps,
    racersRef,
    cratesRef,
    hazardsRef,
    peersRef,
    crownHolderRef,
    crownPosRef,
    hotBombHolderRef,
    localKinRef,
    localProgressRef,
    driveInputRef,
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
