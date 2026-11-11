"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { isHostile, isStealthedInBush } from "@/games/carbon3d/ai";
import {
  ARENA_BUSHES,
  ARENA_HALF,
  ARENA_JUMP_PADS,
  ARENA_OBSTACLES,
  CORE_CAPTURE_RADIUS,
  isInsideArenaBush,
  raycastArenaWorld,
  resolveArenaMovement,
  sampleArenaGroundHeight,
} from "@/games/carbon3d/arenaLayout";
import {
  CARBON_WEAPONS,
  CarbonCombatant,
  CarbonGemDrop,
  CarbonHitClaimPacket,
  CarbonLivePeerPacket,
  CarbonMode,
  CarbonPickupPad,
  CarbonShotPacket,
  CarbonWeaponId,
} from "@/games/carbon3d/types";
import {
  buildCrystalGemMesh,
  buildPickupVisual,
  buildTallGrassBushCluster,
  createStrikerRig,
  HeroVisualRole,
  loadCarbonHeroAsset,
  StrikerRig,
  syncStrikerHudPlate,
  updateStrikerRig,
} from "./carbon3d/models";
import { createEnergyZoneMaterial, createOrbitalSkyMaterial } from "./carbon3d/shaders";
import { carbonSfx } from "./carbon3d/soundFx";
import { getCarbonPBRMaterials } from "./carbon3d/textures";
import { LocalPlayerPhysicsState } from "./carbon3d/useCarbonNet";

export interface ActiveShotCommand {
  dashRequested: boolean;
  grenadeRequested: boolean;
  reloadRequested: boolean;
}

export interface AimStickState {
  active: boolean;
  dx: number;
  dz: number;
  mag: number;
  autoFireTap: boolean;
  manualReleaseShot: boolean;
  releaseDx: number;
  releaseDz: number;
  releaseMag: number;
}

export interface LocalWeaponHudState {
  weapon: CarbonWeaponId;
  secondaryWeapon: CarbonWeaponId | null;
  ammo: number;
  maxAmmo: number;
  isReloading: boolean;
  dashCooldownLeft: number;
  grenadeCooldownLeft: number;
  hasTargetLock: boolean;
  lastHitIsCrit: number;
  lastHitAt: number;
}

interface LiveProjectile {
  id: string;
  shooterId: string;
  isLocalOwner: boolean;
  weapon: CarbonWeaponId | "GRENADE";
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  damage: number;
  critMult: number;
  splashRadius: number;
  bouncesLeft: number;
  distanceTraveled: number;
  maxRange: number;
  mesh: THREE.Object3D;
}

interface TransientFx {
  mesh: THREE.Object3D;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  scaleSpeed: number;
  life: number;
  maxLife: number;
}

export interface Carbon3DArenaProps {
  myId: string;
  mode: CarbonMode;
  phase: "PLAYING" | "GAME_OVER";
  combatantsRef: React.MutableRefObject<Record<string, CarbonCombatant>>;
  pickupsRef: React.MutableRefObject<CarbonPickupPad[]>;
  gemsRef: React.MutableRefObject<CarbonGemDrop[]>;
  peersRef: React.MutableRefObject<Map<string, CarbonLivePeerPacket>>;
  coreOwnerRef: React.MutableRefObject<CarbonCombatant["team"] | "CONTESTED" | "NEUTRAL">;
  localPhysRef: React.MutableRefObject<LocalPlayerPhysicsState>;
  moveStickRef: React.MutableRefObject<{ dx: number; dz: number }>;
  aimStickRef: React.MutableRefObject<AimStickState>;
  commandsRef: React.MutableRefObject<ActiveShotCommand>;
  remoteShotQueueRef: React.MutableRefObject<CarbonShotPacket[]>;
  killBurstQueueRef: React.MutableRefObject<Array<{ x: number; y: number; z: number; colorHex: number }>>;
  screenShakeRef: React.MutableRefObject<number>;
  onLocalPosTick: () => void;
  onBroadcastShot: (shot: CarbonShotPacket) => void;
  onClaimHit: (claim: CarbonHitClaimPacket) => void;
  onHudWeaponUpdate: (hud: LocalWeaponHudState) => void;
}

function buildRoundedRectShape(halfW: number, halfH: number, radius: number): THREE.Shape {
  const s = new THREE.Shape();
  const r = Math.min(radius, halfW, halfH);
  s.moveTo(-halfW + r, -halfH);
  s.lineTo(halfW - r, -halfH);
  s.quadraticCurveTo(halfW, -halfH, halfW, -halfH + r);
  s.lineTo(halfW, halfH - r);
  s.quadraticCurveTo(halfW, halfH, halfW - r, halfH);
  s.lineTo(-halfW + r, halfH);
  s.quadraticCurveTo(-halfW, halfH, -halfW, halfH - r);
  s.lineTo(-halfW, -halfH + r);
  s.quadraticCurveTo(-halfW, -halfH, -halfW + r, -halfH);
  s.closePath();
  return s;
}

export function Carbon3DArena({
  myId,
  mode,
  phase,
  combatantsRef,
  pickupsRef,
  gemsRef,
  peersRef,
  coreOwnerRef,
  localPhysRef,
  moveStickRef,
  aimStickRef,
  commandsRef,
  remoteShotQueueRef,
  killBurstQueueRef,
  screenShakeRef,
  onLocalPosTick,
  onBroadcastShot,
  onClaimHit,
  onHudWeaponUpdate,
}: Carbon3DArenaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const myIdRef = useRef(myId);
  myIdRef.current = myId;

  const cbRef = useRef({
    onLocalPosTick,
    onBroadcastShot,
    onClaimHit,
    onHudWeaponUpdate,
  });
  cbRef.current = {
    onLocalPosTick,
    onBroadcastShot,
    onClaimHit,
    onHudWeaponUpdate,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Preload smooth animated hero GLB right away
    loadCarbonHeroAsset();

    // 1. Bright Daylight WebGL Scene & Elevated Angled Top-Down Broadcast Camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x38bdf8);

    const w0 = Math.max(1, container.clientWidth);
    const h0 = Math.max(1, container.clientHeight);
    const computeFov = (aspect: number) => {
      // Generous FOV in Portrait so holding phone normally shows wide left/right lanes!
      return aspect < 1 ? Math.min(58, Math.max(50, 36 / Math.max(0.48, aspect))) : 45;
    };

    const camera = new THREE.PerspectiveCamera(computeFov(w0 / h0), w0 / h0, 0.5, 220);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    let currentDpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(currentDpr);
    renderer.setSize(w0, h0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 2. Sunny Mediterranean Sky + Clean Daylight Lighting
    const skyMat = createOrbitalSkyMaterial();
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(155, 28, 20), skyMat);
    scene.add(skyDome);

    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0xfde68a, 1.25);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.75);
    sunLight.position.set(16, 36, 18);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 6;
    sunLight.shadow.camera.far = 90;
    const sc = 24;
    sunLight.shadow.camera.left = -sc;
    sunLight.shadow.camera.right = sc;
    sunLight.shadow.camera.top = sc;
    sunLight.shadow.camera.bottom = -sc;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const mats = getCarbonPBRMaterials();

    // 3. Build Clean Daylight Champion Stadium (38m x 38m, low 1.45m cover, zero clutter!)
    const arenaGroup = new THREE.Group();
    scene.add(arenaGroup);

    // Rounded-corner stadium floor slab
    const courtShape = buildRoundedRectShape(ARENA_HALF, ARENA_HALF, 4.2);
    const floorGeo = new THREE.ExtrudeGeometry(courtShape, {
      depth: 1.5,
      bevelEnabled: true,
      bevelThickness: 0.16,
      bevelSize: 0.16,
      bevelSegments: 2,
    });
    floorGeo.rotateX(Math.PI / 2);
    const posAttr = floorGeo.attributes.position;
    const uvAttr = floorGeo.attributes.uv;
    for (let i = 0; i < posAttr.count; i++) {
      uvAttr.setXY(
        i,
        (posAttr.getX(i) + ARENA_HALF) / (2 * ARENA_HALF),
        (posAttr.getZ(i) + ARENA_HALF) / (2 * ARENA_HALF)
      );
    }
    const floorMesh = new THREE.Mesh(floorGeo, mats.arenaFloor);
    floorMesh.receiveShadow = true;
    arenaGroup.add(floorMesh);

    // Clean low stadium perimeter curbs (0.75m tall — never blocks top-down sightlines!)
    const straightLen = (ARENA_HALF - 4.0) * 2;
    const wallSpecs: Array<{ x: number; z: number; rotY: number; len: number; accent: number }> = [
      { x: 0, z: -ARENA_HALF - 0.25, rotY: 0, len: straightLen, accent: 0x0ea5e9 }, // North (Sky Blue)
      { x: 0, z: ARENA_HALF + 0.25, rotY: 0, len: straightLen, accent: 0xef4444 }, // South (Coral Red)
      { x: -ARENA_HALF - 0.25, z: 0, rotY: Math.PI / 2, len: straightLen, accent: 0xf59e0b }, // West
      { x: ARENA_HALF + 0.25, z: 0, rotY: Math.PI / 2, len: straightLen, accent: 0xf59e0b }, // East
    ];
    for (const ws of wallSpecs) {
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(ws.len, 0.78, 0.65),
        mats.stadiumPerimeter
      );
      curb.position.set(ws.x, 0.39, ws.z);
      curb.rotation.y = ws.rotY;
      curb.castShadow = true;
      curb.receiveShadow = true;
      arenaGroup.add(curb);

      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(ws.len * 0.96, 0.16, 0.7),
        new THREE.MeshStandardMaterial({ color: ws.accent, roughness: 0.45 })
      );
      trim.position.set(ws.x, 0.78, ws.z);
      trim.rotation.y = ws.rotY;
      arenaGroup.add(trim);
    }

    // 4 Rounded Corner Bumpers
    for (const [cx, cz] of [
      [-ARENA_HALF + 2.8, -ARENA_HALF + 2.8],
      [ARENA_HALF - 2.8, -ARENA_HALF + 2.8],
      [-ARENA_HALF + 2.8, ARENA_HALF - 2.8],
      [ARENA_HALF - 2.8, ARENA_HALF - 2.8],
    ]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 0.85, 1.05, 18),
        mats.stadiumPerimeter
      );
      post.position.set(cx, 0.52, cz);
      post.castShadow = true;
      arenaGroup.add(post);

      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 0.18, 18),
        new THREE.MeshStandardMaterial({
          color: cz < 0 ? 0x0ea5e9 : 0xef4444,
          roughness: 0.4,
        })
      );
      cap.position.set(cx, 1.1, cz);
      arenaGroup.add(cap);
    }

    // Central Crystal Gem Mine (0, 0) + Energy Ring
    const coreZoneMat = createEnergyZoneMaterial(0xd946ef);
    const coreZoneDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(CORE_CAPTURE_RADIUS * 2, CORE_CAPTURE_RADIUS * 2),
      coreZoneMat
    );
    coreZoneDisc.rotation.x = -Math.PI / 2;
    coreZoneDisc.position.set(0, 0.025, 0);
    arenaGroup.add(coreZoneDisc);

    const gemMineGroup = new THREE.Group();
    const mineRim = new THREE.Mesh(
      new THREE.CylinderGeometry(1.18, 1.38, 0.24, 24),
      mats.stadiumPerimeter
    );
    mineRim.position.y = 0.12;
    mineRim.castShadow = true;
    mineRim.receiveShadow = true;
    gemMineGroup.add(mineRim);

    const minePortal = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 24),
      new THREE.MeshBasicMaterial({ color: 0x3b0764 })
    );
    minePortal.rotation.x = -Math.PI / 2;
    minePortal.position.y = 0.25;
    gemMineGroup.add(minePortal);

    const mineCrystalCore = new THREE.Group();
    for (const [ox, oz, sc, rotZ] of [
      [0, 0, 1.15, 0],
      [-0.36, 0.22, 0.72, 0.35],
      [0.36, -0.2, 0.78, -0.32],
    ]) {
      const shard = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.32 * sc, 0),
        new THREE.MeshStandardMaterial({
          color: 0xe879f9,
          emissive: 0xa21caf,
          emissiveIntensity: 0.85,
          roughness: 0.15,
        })
      );
      shard.scale.set(0.75, 1.45, 0.75);
      shard.position.set(ox, 0.42, oz);
      shard.rotation.z = rotZ;
      mineCrystalCore.add(shard);
    }
    gemMineGroup.add(mineCrystalCore);
    arenaGroup.add(gemMineGroup);

    // 6 Symmetrical Lush Emerald Tall Grass Stealth Bush Clusters!
    const bushMeshes: Array<{ zone: (typeof ARENA_BUSHES)[number]; mesh: THREE.Group }> = [];
    for (const bz of ARENA_BUSHES) {
      const bushCluster = buildTallGrassBushCluster(bz.halfX, bz.halfZ);
      bushCluster.position.set(bz.x, 0, bz.z);
      arenaGroup.add(bushCluster);
      bushMeshes.push({ zone: bz, mesh: bushCluster });
    }

    // 8 Clean Symmetrical Low Cover Blocks (1.35m - 1.45m tall)
    for (const obs of ARENA_OBSTACLES) {
      const isCrate = obs.style === "SUPPLY_CRATE";
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(obs.halfX * 2, obs.height, obs.halfZ * 2),
        isCrate ? mats.supplyCrate : mats.sandstoneWall
      );
      box.position.set(obs.x, obs.baseY + obs.height * 0.5, obs.z);
      box.castShadow = true;
      box.receiveShadow = true;
      arenaGroup.add(box);

      // Clean warm terracotta/gold cap on top so cover blocks read instantly from top-down!
      const topCap = new THREE.Mesh(
        new THREE.BoxGeometry(obs.halfX * 2 - 0.12, 0.1, obs.halfZ * 2 - 0.12),
        isCrate
          ? new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.55 })
          : mats.sandstoneTrim
      );
      topCap.position.set(obs.x, obs.baseY + obs.height + 0.03, obs.z);
      topCap.receiveShadow = true;
      arenaGroup.add(topCap);
    }

    // 4 Corner Jump-Pads
    const jumpPadMats: THREE.ShaderMaterial[] = [];
    for (const jp of ARENA_JUMP_PADS) {
      const baseRing = new THREE.Mesh(
        new THREE.CylinderGeometry(jp.radius, jp.radius + 0.18, 0.1, 24),
        mats.stadiumPerimeter
      );
      baseRing.position.set(jp.x, 0.05, jp.z);
      arenaGroup.add(baseRing);

      const vortexMat = createEnergyZoneMaterial(jp.colorHex);
      jumpPadMats.push(vortexMat);
      const vortexDisc = new THREE.Mesh(
        new THREE.PlaneGeometry(jp.radius * 2, jp.radius * 2),
        vortexMat
      );
      vortexDisc.rotation.x = -Math.PI / 2;
      vortexDisc.position.set(jp.x, 0.12, jp.z);
      arenaGroup.add(vortexDisc);
    }

    // 4. Pickup Pads
    const pickupVisuals = new Map<string, { root: THREE.Group; floatItem: THREE.Group }>();
    const syncPickupMeshes = () => {
      for (const pad of pickupsRef.current) {
        let entry = pickupVisuals.get(pad.id);
        if (!entry) {
          const root = new THREE.Group();
          root.position.set(pad.x, pad.y, pad.z);

          const plinth = new THREE.Mesh(
            new THREE.CylinderGeometry(0.82, 0.94, 0.1, 22),
            mats.stadiumPerimeter
          );
          plinth.position.y = 0.05;
          root.add(plinth);

          const padColor =
            pad.kind === "OVERDRIVE_AMP"
              ? 0xf59e0b
              : pad.kind === "SHIELD_CELL"
              ? 0x0ea5e9
              : pad.kind === "WEAPON_RAILGUN"
              ? 0xf43f5e
              : pad.kind === "WEAPON_LOBBER"
              ? 0xa855f7
              : 0xf97316;

          const glowRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.78, 0.05, 8, 28),
            new THREE.MeshBasicMaterial({ color: padColor })
          );
          glowRing.rotation.x = Math.PI / 2;
          glowRing.position.y = 0.11;
          root.add(glowRing);

          const floatItem = buildPickupVisual(pad.kind);
          floatItem.position.y = 0.85;
          root.add(floatItem);

          scene.add(root);
          entry = { root, floatItem };
          pickupVisuals.set(pad.id, entry);
        }
        entry.floatItem.visible = pad.available;
      }
    };
    syncPickupMeshes();

    // Dynamic 3D Crystal Gem Drops (💎) on the Stadium Floor
    const gemVisuals = new Map<string, THREE.Group>();
    const syncGemMeshes = (elapsedSec: number) => {
      const liveIds = new Set<string>();
      for (const gm of gemsRef.current) {
        liveIds.add(gm.id);
        let mesh = gemVisuals.get(gm.id);
        if (!mesh) {
          mesh = buildCrystalGemMesh();
          mesh.position.set(gm.x, 0.55, gm.z);
          scene.add(mesh);
          gemVisuals.set(gm.id, mesh);
        }
        mesh.position.x = gm.x;
        mesh.position.z = gm.z;
        mesh.position.y = 0.52 + Math.sin(elapsedSec * 3.8 + gm.x * 1.5) * 0.1;
        mesh.rotation.y = elapsedSec * 2.4 + gm.z;
      }
      for (const [id, mesh] of gemVisuals.entries()) {
        if (!liveIds.has(id)) {
          scene.remove(mesh);
          gemVisuals.delete(id);
        }
      }
    };
    syncGemMeshes(0);

    // 5. Brawl-Stars Live 3D Ground Aim Telegraph (Line, Shotgun Cone, & Lobber Blast Ring!)
    const telegraphGroup = new THREE.Group();
    telegraphGroup.visible = false;
    scene.add(telegraphGroup);

    // Line telegraph (Carbine / Railgun / Lobber stem)
    const lineGeo = new THREE.PlaneGeometry(0.36, 1);
    lineGeo.translate(0, 0.5, 0);
    lineGeo.rotateX(-Math.PI / 2);
    const lineMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const telegraphLine = new THREE.Mesh(lineGeo, lineMat);
    telegraphGroup.add(telegraphLine);

    const tipDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    tipDot.rotation.x = -Math.PI / 2;
    telegraphGroup.add(tipDot);

    // Wide Fan Cone telegraph (Shotgun)
    const fanHalfAngle = CARBON_WEAPONS.SHOTGUN.spreadRad * 1.45;
    const fanGeo = new THREE.CircleGeometry(
      1,
      24,
      Math.PI / 2 - fanHalfAngle,
      fanHalfAngle * 2
    );
    fanGeo.rotateX(-Math.PI / 2);
    // CircleGeometry at thetaStart=PI/2 points along -Z after rotateX(-PI/2); flip Y rot by PI so +Z is forward!
    fanGeo.rotateY(Math.PI);
    const fanMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const telegraphFan = new THREE.Mesh(fanGeo, fanMat);
    telegraphGroup.add(telegraphFan);

    // Blast Landing Ring telegraph (Lobber)
    const lobRingGroup = new THREE.Group();
    const lobDisc = new THREE.Mesh(
      new THREE.CircleGeometry(CARBON_WEAPONS.LOBBER.splashRadius, 32),
      new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      })
    );
    lobDisc.rotation.x = -Math.PI / 2;
    lobRingGroup.add(lobDisc);
    const lobRim = new THREE.Mesh(
      new THREE.RingGeometry(
        CARBON_WEAPONS.LOBBER.splashRadius - 0.14,
        CARBON_WEAPONS.LOBBER.splashRadius,
        36
      ),
      new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    lobRim.rotation.x = -Math.PI / 2;
    lobRingGroup.add(lobRim);
    telegraphGroup.add(lobRingGroup);

    // 6. Rigs, Projectiles & Crisp Daylight FX
    const rigsMap = new Map<string, StrikerRig>();
    const liveProjectiles: LiveProjectile[] = [];
    const transientFx: TransientFx[] = [];

    const boltGeo = new THREE.CapsuleGeometry(0.11, 0.55, 6, 10);
    boltGeo.rotateX(Math.PI / 2);
    const orbGeo = new THREE.SphereGeometry(0.28, 14, 12);
    const shardGeo = new THREE.SphereGeometry(0.14, 8, 8);
    const blastSphereGeo = new THREE.SphereGeometry(1, 18, 14);

    let currentWeaponTrack: CarbonWeaponId = "CARBINE";
    let ammo = CARBON_WEAPONS.CARBINE.magSize;
    let reloadStartedAt = 0;
    let reloadEndsAt = 0;
    let lastFireAt = 0;
    let dashReadyAt = 0;
    let dashActiveUntil = 0;
    let dashDirX = 0;
    let dashDirZ = 0;
    let grenadeReadyAt = 0;
    let lastJumpPadAt = 0;
    let lastHitAt = 0;
    let lastHitCrit = 0;
    let lastHudEmitAt = 0;

    // Smooth camera focus tracker
    let camFocusX = localPhysRef.current.x;
    let camFocusZ = localPhysRef.current.z;

    // Desktop Mouse Ground-Plane Aiming + Click Fire
    const mouseGroundTarget = { active: false, worldX: 0, worldZ: 0, mouseDown: false };
    const raycaster = new THREE.Raycaster();
    const mouseNdc = new THREE.Vector2();
    const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.95);
    const planeHit = new THREE.Vector3();

    const onMouseMove = (e: MouseEvent) => {
      if (e.buttons === 0 && !mouseGroundTarget.active) {
        // Activate desktop mouse aim only on non-touch fine pointers
        if (!window.matchMedia?.("(pointer: fine)").matches) return;
      }
      if (!window.matchMedia?.("(pointer: fine)").matches) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseNdc, camera);
      if (raycaster.ray.intersectPlane(aimPlane, planeHit)) {
        mouseGroundTarget.active = true;
        mouseGroundTarget.worldX = planeHit.x;
        mouseGroundTarget.worldZ = planeHit.z;
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || !window.matchMedia?.("(pointer: fine)").matches) return;
      onMouseMove(e);
      mouseGroundTarget.mouseDown = true;
    };
    const onMouseUp = () => {
      mouseGroundTarget.mouseDown = false;
    };
    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);

    const spawnExplosionFx = (x: number, y: number, z: number, radius: number, colorHex: number) => {
      const domeMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const dome = new THREE.Mesh(blastSphereGeo, domeMat);
      dome.position.set(x, y, z);
      dome.scale.setScalar(0.35);
      scene.add(dome);
      transientFx.push({
        mesh: dome,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: 0,
        scaleSpeed: radius * 4.2,
        life: 0,
        maxLife: 0.24,
      });
    };

    const spawnShatterBurst = (x: number, y: number, z: number, colorHex: number, count = 10) => {
      for (let i = 0; i < count; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? colorHex : 0xfef08a,
          transparent: true,
          opacity: 0.95,
        });
        const m = new THREE.Mesh(shardGeo, mat);
        m.position.set(x, y + 0.85, z);
        const ang = Math.random() * Math.PI * 2;
        const spd = 3.2 + Math.random() * 5.8;
        scene.add(m);
        transientFx.push({
          mesh: m,
          vx: Math.cos(ang) * spd,
          vy: 2.8 + Math.random() * 5.2,
          vz: Math.sin(ang) * spd,
          gravity: 19,
          scaleSpeed: -0.35,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.2,
        });
      }
    };

    const spawnRailBeamFx = (
      ox: number,
      oy: number,
      oz: number,
      dx: number,
      dy: number,
      dz: number,
      len: number,
      colorHex: number
    ) => {
      const beamGeo = new THREE.CylinderGeometry(0.11, 0.11, len, 8);
      beamGeo.translate(0, len * 0.5, 0);
      beamGeo.rotateX(Math.PI / 2);
      const beamMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(ox, oy, oz);
      beam.lookAt(ox + dx * 10, oy + dy * 10, oz + dz * 10);
      scene.add(beam);
      transientFx.push({
        mesh: beam,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: 0,
        scaleSpeed: 0,
        life: 0,
        maxLife: 0.22,
      });
    };

    const executeShotVisualAndSim = (shot: CarbonShotPacket, isLocalOwner: boolean) => {
      carbonSfx.playWeaponFire(shot.weapon, isLocalOwner);

      const shooterRig = rigsMap.get(shot.shooterId);
      if (shooterRig) {
        shooterRig.recoil = 1.0;
        const fMat = shooterRig.muzzleFlash.material as THREE.MeshBasicMaterial;
        fMat.color.setHex(
          shot.weapon === "GRENADE" ? 0x0ea5e9 : CARBON_WEAPONS[shot.weapon].colorHex
        );
        fMat.opacity = 0.95;
      }

      if (shot.weapon === "GRENADE") {
        const mesh = new THREE.Mesh(
          orbGeo,
          new THREE.MeshStandardMaterial({
            color: 0x0ea5e9,
            emissive: 0x0284c7,
            emissiveIntensity: 0.6,
          })
        );
        mesh.position.set(shot.ox, shot.oy, shot.oz);
        scene.add(mesh);
        liveProjectiles.push({
          id: shot.id,
          shooterId: shot.shooterId,
          isLocalOwner,
          weapon: "GRENADE",
          x: shot.ox,
          y: shot.oy,
          z: shot.oz,
          vx: shot.dx * 19,
          vy: 7.2,
          vz: shot.dz * 19,
          gravity: 21.0,
          damage: 62,
          critMult: 1.0,
          splashRadius: 4.4,
          bouncesLeft: 1,
          distanceTraveled: 0,
          maxRange: 30,
          mesh,
        });
        return;
      }

      const spec = CARBON_WEAPONS[shot.weapon];

      // Hitscan Railgun Beam!
      if (shot.weapon === "RAILGUN") {
        const wallHit = raycastArenaWorld(
          shot.ox,
          shot.oy,
          shot.oz,
          shot.dx,
          shot.dy,
          shot.dz,
          spec.range
        );
        const maxT = wallHit ? wallHit.t : spec.range;
        spawnRailBeamFx(
          shot.ox,
          shot.oy,
          shot.oz,
          shot.dx,
          shot.dy,
          shot.dz,
          maxT,
          shot.overdrive ? 0xf59e0b : 0xf43f5e
        );

        if (isLocalOwner) {
          const meUnit = combatantsRef.current[shot.shooterId];
          for (const target of Object.values(combatantsRef.current)) {
            if (!target.isAlive || !meUnit || !isHostile(meUnit, target, modeRef.current)) continue;
            const hitR = target.archetype === "BOSS_MECH" ? 1.2 : 0.78;
            const vx = target.x - shot.ox;
            const vz = target.z - shot.oz;
            const proj = vx * shot.dx + vz * shot.dz;
            if (proj <= 0 || proj > maxT) continue;

            const px = shot.ox + shot.dx * proj;
            const pz = shot.oz + shot.dz * proj;
            const perpDistXZ = Math.hypot(px - target.x, pz - target.z);

            if (perpDistXZ <= hitR) {
              const isCrit = perpDistXZ <= hitR * 0.35;
              const dmg = Math.round(spec.damage * (isCrit ? spec.critMultiplier : 1));
              carbonSfx.playHitmarker(isCrit);
              lastHitAt = Date.now();
              lastHitCrit = isCrit ? lastHitAt : 0;
              spawnShatterBurst(px, target.y + 0.5, pz, spec.colorHex, 6);
              cbRef.current.onClaimHit({
                shooterId: shot.shooterId,
                targetId: target.id,
                weapon: "RAILGUN",
                damage: dmg,
                isCrit,
                hx: px,
                hy: target.y + 1.0,
                hz: pz,
                kx: shot.dx * spec.knockback,
                kz: shot.dz * spec.knockback,
              });
            }
          }
        }
        return;
      }

      // Projectile Weapons (Carbine, Shotgun 8-pellet fan, Lobber mortar)
      const shooterUnit = combatantsRef.current[shot.shooterId];
      const myUnitNow = combatantsRef.current[myIdRef.current];
      const isEnemyShot =
        shooterUnit && myUnitNow ? isHostile(myUnitNow, shooterUnit, modeRef.current) : !isLocalOwner;

      const projColor = shot.overdrive
        ? 0xf59e0b
        : isEnemyShot
        ? 0xef4444
        : spec.colorHex;

      const count = spec.pellets;
      for (let p = 0; p < count; p++) {
        const fanOffset =
          count > 1
            ? ((p / (count - 1)) * 2 - 1) * spec.spreadRad * 1.25
            : (Math.random() - 0.5) * spec.spreadRad;

        const baseYaw = Math.atan2(shot.dx, shot.dz) + fanOffset;
        const pdx = Math.sin(baseYaw);
        const pdz = Math.cos(baseYaw);

        const isLobber = shot.weapon === "LOBBER";
        const mat = new THREE.MeshStandardMaterial({
          color: projColor,
          emissive: projColor,
          emissiveIntensity: 0.55,
          roughness: 0.25,
        });
        const mesh = new THREE.Mesh(isLobber ? orbGeo : boltGeo, mat);
        mesh.position.set(shot.ox, shot.oy, shot.oz);
        if (!isLobber) {
          mesh.lookAt(shot.ox + pdx * 5, shot.oy, shot.oz + pdz * 5);
        }
        scene.add(mesh);

        liveProjectiles.push({
          id: `${shot.id}_${p}`,
          shooterId: shot.shooterId,
          isLocalOwner,
          weapon: shot.weapon,
          x: shot.ox,
          y: shot.oy,
          z: shot.oz,
          vx: pdx * spec.projectileSpeed,
          vy: isLobber ? 5.6 : 0,
          vz: pdz * spec.projectileSpeed,
          gravity: isLobber ? 17.5 : 0,
          damage: spec.damage,
          critMult: spec.critMultiplier,
          splashRadius: spec.splashRadius,
          bouncesLeft: spec.bounces,
          distanceTraveled: 0,
          maxRange: spec.range,
          mesh,
        });
      }
    };

    // Desktop Keyboard Controls
    const keysDown = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      keysDown.add(e.code);
      if (e.code === "Space" || e.code === "ShiftLeft") commandsRef.current.dashRequested = true;
      if (e.code === "KeyG" || e.code === "KeyE") commandsRef.current.grenadeRequested = true;
      if (e.code === "KeyR") commandsRef.current.reloadRequested = true;
    };
    const onKeyUp = (e: KeyboardEvent) => keysDown.delete(e.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const onResize = () => {
      if (!container) return;
      const nw = Math.max(1, container.clientWidth);
      const nh = Math.max(1, container.clientHeight);
      camera.aspect = nw / nh;
      camera.fov = computeFov(nw / nh);
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    // Helper: Find closest unobstructed hostile enemy in range for Brawl-Stars Auto-Aim!
    const findBestAutoAimDirection = (
      me: CarbonCombatant,
      ox: number,
      oy: number,
      oz: number,
      maxRange: number
    ): { dx: number; dz: number; found: boolean } => {
      let bestTarget: CarbonCombatant | null = null;
      let bestDist = maxRange + 1.5;

      const nowAuto = Date.now();
      for (const other of Object.values(combatantsRef.current)) {
        if (!other.isAlive || !isHostile(me, other, modeRef.current)) continue;
        const ex = other.x - ox;
        const ez = other.z - oz;
        const dist = Math.hypot(ex, ez);
        if (dist > maxRange + 1.5 || dist < 0.25) continue;
        // Enemies hiding inside Tall Grass Stealth Bushes (> 3.8m) cannot be auto-aimed!
        if (isStealthedInBush(other, nowAuto) && dist > 3.8) continue;

        const inv = 1 / dist;
        const wall = raycastArenaWorld(ox, oy + 0.95, oz, ex * inv, 0, ez * inv, dist - 0.55);
        if (wall && me.weapon !== "LOBBER") continue;

        if (dist < bestDist) {
          bestDist = dist;
          bestTarget = other;
        }
      }

      if (!bestTarget) {
        return { dx: Math.sin(localPhysRef.current.yaw), dz: Math.cos(localPhysRef.current.yaw), found: false };
      }

      // Subtle velocity lead if peer packet is fresh
      let tx = bestTarget.x;
      let tz = bestTarget.z;
      const peer = peersRef.current.get(bestTarget.id);
      if (peer) {
        tx += peer.vx * 0.08;
        tz += peer.vz * 0.08;
      }
      const dx = tx - ox;
      const dz = tz - oz;
      const len = Math.max(0.001, Math.hypot(dx, dz));
      return { dx: dx / len, dz: dz / len, found: true };
    };

    // 7. Main 60 FPS Loop
    let rafId = 0;
    let prevTime = performance.now();
    let slowFrames = 0;
    const tmpVec3 = new THREE.Vector3();

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const perfNow = performance.now();
      const rawDt = (perfNow - prevTime) / 1000;
      prevTime = perfNow;
      const dt = Math.min(0.05, Math.max(0.001, rawDt));
      const elapsedSec = perfNow * 0.001;
      const nowMs = Date.now();

      if (rawDt > 0.024 && currentDpr > 1.15) {
        slowFrames++;
        if (slowFrames > 35) {
          currentDpr = 1.15;
          renderer.setPixelRatio(currentDpr);
          slowFrames = 0;
        }
      } else {
        slowFrames = Math.max(0, slowFrames - 1);
      }

      // Animate Daylight Sky & Stadium Zone Rings
      skyMat.uniforms.uTime.value = elapsedSec;
      coreZoneMat.uniforms.uTime.value = elapsedSec;
      const owner = coreOwnerRef.current;
      coreZoneMat.uniforms.uColor.value.setHex(
        owner === "CYAN"
          ? 0x0ea5e9
          : owner === "CRIMSON"
          ? 0xef4444
          : owner === "CONTESTED"
          ? 0xf59e0b
          : 0x94a3b8
      );
      for (const jm of jumpPadMats) jm.uniforms.uTime.value = elapsedSec;

      gemMineGroup.visible = modeRef.current !== "SURVIVAL";
      if (gemMineGroup.visible) {
        mineCrystalCore.rotation.y = elapsedSec * 1.35;
        mineCrystalCore.position.y = Math.sin(elapsedSec * 2.8) * 0.06;
      }

      for (let bi = 0; bi < bushMeshes.length; bi++) {
        const bm = bushMeshes[bi];
        bm.mesh.rotation.z = Math.sin(elapsedSec * 2.2 + bi * 1.1) * 0.025;
      }

      syncPickupMeshes();
      syncGemMeshes(elapsedSec);
      for (const [, pv] of pickupVisuals) {
        if (pv.floatItem.visible) {
          pv.floatItem.rotation.y = elapsedSec * 1.8;
          pv.floatItem.position.y = 0.85 + Math.sin(elapsedSec * 3.2) * 0.1;
        }
      }

      while (remoteShotQueueRef.current.length > 0) {
        const rs = remoteShotQueueRef.current.shift();
        if (rs) executeShotVisualAndSim(rs, false);
      }
      while (killBurstQueueRef.current.length > 0) {
        const kb = killBurstQueueRef.current.shift();
        if (kb) spawnShatterBurst(kb.x, kb.y, kb.z, kb.colorHex, 14);
      }

      const myUnit = combatantsRef.current[myIdRef.current];
      const phys = localPhysRef.current;

      if (myUnit && myUnit.weapon !== currentWeaponTrack) {
        currentWeaponTrack = myUnit.weapon;
        ammo = CARBON_WEAPONS[currentWeaponTrack].magSize;
        reloadStartedAt = 0;
        reloadEndsAt = 0;
      }

      const wSpec = CARBON_WEAPONS[currentWeaponTrack];

      if (commandsRef.current.reloadRequested) {
        commandsRef.current.reloadRequested = false;
        if (ammo < wSpec.magSize && reloadEndsAt === 0) {
          reloadStartedAt = nowMs;
          reloadEndsAt = nowMs + wSpec.reloadMs;
        }
      }
      if (reloadEndsAt > 0 && nowMs >= reloadEndsAt) {
        ammo = wSpec.magSize;
        reloadStartedAt = 0;
        reloadEndsAt = 0;
      }

      // --- SCREEN-SPACE MOVEMENT & BRAWL-STARS TWIN-STICK / AUTO-AIM SHOOTING ---
      let hasTargetLock = false;
      let aimLookAheadX = 0;
      let aimLookAheadZ = 0;

      if (myUnit && myUnit.isAlive && phaseRef.current === "PLAYING") {
        // 1. Direct Screen-Space Movement (Left Stick + WASD: UP = -Z, RIGHT = +X)
        let inX = moveStickRef.current.dx;
        let inZ = moveStickRef.current.dz;
        if (keysDown.has("KeyW") || keysDown.has("ArrowUp")) inZ -= 1;
        if (keysDown.has("KeyS") || keysDown.has("ArrowDown")) inZ += 1;
        if (keysDown.has("KeyA") || keysDown.has("ArrowLeft")) inX -= 1;
        if (keysDown.has("KeyD") || keysDown.has("ArrowRight")) inX += 1;
        const inMag = Math.hypot(inX, inZ);
        if (inMag > 1) {
          inX /= inMag;
          inZ /= inMag;
        }

        // 2. Jet-Dash Trigger
        if (commandsRef.current.dashRequested) {
          commandsRef.current.dashRequested = false;
          if (nowMs >= dashReadyAt) {
            dashReadyAt = nowMs + 4000;
            dashActiveUntil = nowMs + 230;
            dashDirX = inMag > 0.15 ? inX : Math.sin(phys.yaw);
            dashDirZ = inMag > 0.15 ? inZ : Math.cos(phys.yaw);
            screenShakeRef.current = Math.max(screenShakeRef.current, 0.1);
            carbonSfx.playDash();
          }
        }

        const isDashing = nowMs < dashActiveUntil;
        phys.isDashing = isDashing;
        const baseSpeed = myUnit.overdriveUntil > nowMs ? 8.8 : 7.6;

        if (isDashing) {
          phys.vx = dashDirX * 16.5;
          phys.vz = dashDirZ * 16.5;
        } else if (!phys.isAirborne) {
          phys.vx = inX * baseSpeed;
          phys.vz = inZ * baseSpeed;
        } else {
          phys.vx = phys.vx * (1 - dt * 1.4) + inX * baseSpeed * dt * 2.4;
          phys.vz = phys.vz * (1 - dt * 1.4) + inZ * baseSpeed * dt * 2.4;
        }

        const resolved = resolveArenaMovement(
          phys.x + phys.vx * dt,
          phys.y,
          phys.z + phys.vz * dt
        );
        phys.x = resolved.x;
        phys.z = resolved.z;

        // Jump-Pads (lets heroes leap right over the 1.45m sandstone cover blocks!)
        if (nowMs - lastJumpPadAt > 650) {
          for (const jp of ARENA_JUMP_PADS) {
            if (Math.hypot(phys.x - jp.x, phys.z - jp.z) <= jp.radius && phys.y < 0.45) {
              lastJumpPadAt = nowMs;
              phys.vx = jp.launchVx;
              phys.vy = jp.launchVy;
              phys.vz = jp.launchVz;
              phys.isAirborne = true;
              carbonSfx.playJumpPad();
              break;
            }
          }
        }

        const groundY = sampleArenaGroundHeight(phys.x, phys.z, phys.y);
        if (phys.y > groundY + 0.04 || phys.vy > 0) {
          phys.vy -= 25.0 * dt;
          phys.y += phys.vy * dt;
          if (phys.y <= groundY) {
            phys.y = groundY;
            phys.vy = 0;
            phys.isAirborne = false;
          } else {
            phys.isAirborne = true;
          }
        } else {
          phys.y = groundY;
          phys.vy = 0;
          phys.isAirborne = false;
        }

        // 3. Aiming & Shooting (Right Dual-Mode Attack Stick OR Desktop Mouse)
        const aimState = aimStickRef.current;
        const isManualDragAim = aimState.active && aimState.mag >= 0.24;
        const isCenterHoldAutoFire = aimState.active && aimState.mag < 0.24;

        let desiredYaw = phys.yaw;
        let fireNow = false;
        let fireDx = Math.sin(phys.yaw);
        let fireDz = Math.cos(phys.yaw);

        // Check nearest enemy lock indicator
        const autoCandidate = findBestAutoAimDirection(
          myUnit,
          phys.x,
          phys.y,
          phys.z,
          wSpec.range
        );
        hasTargetLock = autoCandidate.found;

        if (isManualDragAim) {
          // Manual 360° Drag Aim with Live 3D Ground Telegraph!
          fireDx = aimState.dx;
          fireDz = aimState.dz;
          desiredYaw = Math.atan2(fireDx, fireDz);
          aimLookAheadX = fireDx * 1.6 * aimState.mag;
          aimLookAheadZ = fireDz * 1.3 * aimState.mag;

          // Update 3D Ground Aim Telegraph at hero's feet
          telegraphGroup.visible = true;
          telegraphGroup.position.set(phys.x, 0.045, phys.z);

          if (currentWeaponTrack === "SHOTGUN") {
            telegraphLine.visible = false;
            tipDot.visible = false;
            lobRingGroup.visible = false;
            telegraphFan.visible = true;
            telegraphFan.scale.setScalar(wSpec.range);
            telegraphFan.rotation.y = desiredYaw;
          } else if (currentWeaponTrack === "LOBBER") {
            telegraphFan.visible = false;
            tipDot.visible = false;
            telegraphLine.visible = true;
            lobRingGroup.visible = true;
            const lobDist = Math.max(3.5, aimState.mag * wSpec.range);
            lineMat.color.setHex(0xa855f7);
            telegraphLine.scale.set(0.75, 1, lobDist);
            telegraphLine.rotation.y = desiredYaw;
            lobRingGroup.position.set(fireDx * lobDist, 0.005, fireDz * lobDist);
          } else {
            telegraphFan.visible = false;
            lobRingGroup.visible = false;
            telegraphLine.visible = true;
            tipDot.visible = true;
            const hitWall = raycastArenaWorld(
              phys.x,
              phys.y + 0.95,
              phys.z,
              fireDx,
              0,
              fireDz,
              wSpec.range
            );
            const sightLen = hitWall ? hitWall.t : wSpec.range;
            const col = currentWeaponTrack === "RAILGUN" ? 0xf43f5e : 0x06b6d4;
            lineMat.color.setHex(col);
            (tipDot.material as THREE.MeshBasicMaterial).color.setHex(col);
            telegraphLine.scale.set(currentWeaponTrack === "RAILGUN" ? 0.85 : 1.0, 1, sightLen);
            telegraphLine.rotation.y = desiredYaw;
            tipDot.position.set(fireDx * sightLen, 0.005, fireDz * sightLen);
          }

          // Continuous manual fire when thumb is pushed toward outer rim (>= 0.62)
          if (aimState.mag >= 0.62) {
            fireNow = true;
          }
        } else {
          telegraphGroup.visible = false;

          if (aimState.manualReleaseShot) {
            // Released after dragging in Aim Preview Zone -> fire along aimed angle!
            aimState.manualReleaseShot = false;
            fireDx = aimState.releaseDx;
            fireDz = aimState.releaseDz;
            desiredYaw = Math.atan2(fireDx, fireDz);
            fireNow = true;
          } else if (aimState.autoFireTap || isCenterHoldAutoFire) {
            // Quick-Tap OR Holding Center of Attack Button -> Brawl-Stars Auto-Aim!
            aimState.autoFireTap = false;
            fireDx = autoCandidate.dx;
            fireDz = autoCandidate.dz;
            desiredYaw = Math.atan2(fireDx, fireDz);
            fireNow = true;
          } else if (mouseGroundTarget.active) {
            // Desktop Mouse Ground Aim
            const mdx = mouseGroundTarget.worldX - phys.x;
            const mdz = mouseGroundTarget.worldZ - phys.z;
            const mLen = Math.hypot(mdx, mdz);
            if (mLen > 0.25) {
              fireDx = mdx / mLen;
              fireDz = mdz / mLen;
              desiredYaw = Math.atan2(fireDx, fireDz);
            }
            if (mouseGroundTarget.mouseDown) {
              fireNow = true;
            }
          } else if (inMag > 0.15) {
            // Face movement direction smoothly when running
            desiredYaw = Math.atan2(inX, inZ);
          }
        }

        // Clear stale flags if consumed
        aimState.autoFireTap = false;
        aimState.manualReleaseShot = false;

        // Smooth hero yaw turn
        let yawDiff = desiredYaw - phys.yaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        phys.yaw += yawDiff * Math.min(1, dt * (fireNow || isManualDragAim ? 26 : 16));
        phys.pitch = 0;

        const muzzleOx = phys.x + Math.sin(phys.yaw) * 0.65;
        const muzzleOy = phys.y + 1.05;
        const muzzleOz = phys.z + Math.cos(phys.yaw) * 0.65;

        // 4. EMP Shock Grenade Throw (auto-aims toward nearest enemy if not manually dragging!)
        if (commandsRef.current.grenadeRequested) {
          commandsRef.current.grenadeRequested = false;
          if (nowMs >= grenadeReadyAt) {
            grenadeReadyAt = nowMs + 8000;
            const gdx = isManualDragAim ? aimState.dx : autoCandidate.dx;
            const gdz = isManualDragAim ? aimState.dz : autoCandidate.dz;
            phys.yaw = Math.atan2(gdx, gdz);
            const gShot: CarbonShotPacket = {
              id: `gren_${myIdRef.current}_${nowMs.toString(36)}`,
              shooterId: myIdRef.current,
              weapon: "GRENADE",
              ox: phys.x + gdx * 0.6,
              oy: phys.y + 1.15,
              oz: phys.z + gdz * 0.6,
              dx: gdx,
              dy: 0,
              dz: gdz,
              overdrive: myUnit.overdriveUntil > nowMs,
            };
            executeShotVisualAndSim(gShot, true);
            cbRef.current.onBroadcastShot(gShot);
          }
        }

        // 5. Primary Weapon Fire
        if (fireNow && reloadEndsAt === 0 && nowMs - lastFireAt >= wSpec.fireIntervalMs) {
          if (ammo > 0) {
            lastFireAt = nowMs;
            ammo -= 1;
            phys.yaw = Math.atan2(fireDx, fireDz);
            screenShakeRef.current = Math.max(
              screenShakeRef.current,
              currentWeaponTrack === "RAILGUN" || currentWeaponTrack === "SHOTGUN" ? 0.11 : 0.035
            );

            const shotPkt: CarbonShotPacket = {
              id: `sh_${myIdRef.current}_${nowMs.toString(36)}`,
              shooterId: myIdRef.current,
              weapon: currentWeaponTrack,
              ox: muzzleOx,
              oy: muzzleOy,
              oz: muzzleOz,
              dx: fireDx,
              dy: 0,
              dz: fireDz,
              overdrive: myUnit.overdriveUntil > nowMs,
            };
            executeShotVisualAndSim(shotPkt, true);
            cbRef.current.onBroadcastShot(shotPkt);

            if (ammo <= 0) {
              reloadStartedAt = nowMs;
              reloadEndsAt = nowMs + wSpec.reloadMs;
            }
          } else {
            reloadStartedAt = nowMs;
            reloadEndsAt = nowMs + wSpec.reloadMs;
          }
        }

        cbRef.current.onLocalPosTick();
      } else {
        telegraphGroup.visible = false;
      }

      // --- FIXED ANGLED TOP-DOWN 3D BROADCAST CAMERA (PORTRAIT + LANDSCAPE) ---
      const shake = screenShakeRef.current;
      screenShakeRef.current = Math.max(0, shake - dt * 1.1);
      const shakeX = shake > 0.004 ? (Math.random() - 0.5) * shake : 0;
      const shakeZ = shake > 0.004 ? (Math.random() - 0.5) * shake : 0;

      const isPortrait = camera.aspect < 1.0;
      const desiredFocusX = Math.max(-13.5, Math.min(13.5, phys.x + aimLookAheadX));
      const desiredFocusZ = Math.max(-13.5, Math.min(14.5, phys.z + aimLookAheadZ));
      const camBlend = Math.min(1, dt * 10.5);
      camFocusX += (desiredFocusX - camFocusX) * camBlend;
      camFocusZ += (desiredFocusZ - camFocusZ) * camBlend;

      const camHeight = isPortrait ? 19.6 : 16.0;
      const camBackZ = isPortrait ? 13.0 : 10.8;

      camera.position.set(
        camFocusX + shakeX,
        camHeight,
        camFocusZ + camBackZ + shakeZ
      );
      camera.lookAt(camFocusX, 0.35, camFocusZ - 0.55);

      // --- STEP LIVE PROJECTILES ---
      for (let i = liveProjectiles.length - 1; i >= 0; i--) {
        const p = liveProjectiles[i];
        p.vy -= p.gravity * dt;
        const stepX = p.vx * dt;
        const stepY = p.vy * dt;
        const stepZ = p.vz * dt;
        const stepDist = Math.hypot(stepX, stepY, stepZ);
        if (stepDist < 1e-5) continue;

        const dirX = stepX / stepDist;
        const dirY = stepY / stepDist;
        const dirZ = stepZ / stepDist;

        let hitEnemy: CarbonCombatant | null = null;
        let isCritHit = false;
        const shooterUnit = combatantsRef.current[p.shooterId];

        for (const u of Object.values(combatantsRef.current)) {
          if (!u.isAlive || u.id === p.shooterId) continue;
          if (shooterUnit && !isHostile(shooterUnit, u, modeRef.current)) continue;
          const hitR = u.archetype === "BOSS_MECH" ? 1.25 : 0.75;
          const nx = p.x + stepX;
          const ny = p.y + stepY;
          const nz = p.z + stepZ;
          const dXZ = Math.hypot(nx - u.x, nz - u.z);
          const maxH = u.archetype === "BOSS_MECH" ? 3.2 : 2.15;
          if (dXZ <= hitR && ny >= u.y - 0.25 && ny <= u.y + maxH) {
            hitEnemy = u;
            isCritHit = dXZ <= hitR * 0.32;
            break;
          }
        }

        // Note: Lobber & Grenade arc OVER low 1.45m cover walls when p.y > 1.45!
        const worldHit = !hitEnemy
          ? raycastArenaWorld(p.x, p.y, p.z, dirX, dirY, dirZ, stepDist + 0.08)
          : null;

        if (worldHit && p.bouncesLeft > 0 && worldHit.ny < 0.7) {
          p.bouncesLeft -= 1;
          p.x = worldHit.hx + worldHit.nx * 0.08;
          p.y = worldHit.hy + worldHit.ny * 0.08;
          p.z = worldHit.hz + worldHit.nz * 0.08;
          const dot = p.vx * worldHit.nx + p.vy * worldHit.ny + p.vz * worldHit.nz;
          p.vx = (p.vx - 2 * dot * worldHit.nx) * 0.78;
          p.vy = (p.vy - 2 * dot * worldHit.ny) * 0.78;
          p.vz = (p.vz - 2 * dot * worldHit.nz) * 0.78;
          p.mesh.position.set(p.x, p.y, p.z);
          continue;
        }

        p.x += stepX;
        p.y += stepY;
        p.z += stepZ;
        p.distanceTraveled += stepDist;
        p.mesh.position.set(p.x, p.y, p.z);

        const expired = p.distanceTraveled >= p.maxRange || p.y < -0.2;

        if (hitEnemy || worldHit || expired) {
          const ix = worldHit ? worldHit.hx : p.x;
          const iy = worldHit ? worldHit.hy : Math.max(0.2, p.y);
          const iz = worldHit ? worldHit.hz : p.z;

          if (p.splashRadius > 0) {
            const blastHex = p.weapon === "GRENADE" ? 0x0ea5e9 : 0xa855f7;
            spawnExplosionFx(ix, iy, iz, p.splashRadius, blastHex);
            carbonSfx.playExplosion();

            if (p.isLocalOwner && shooterUnit) {
              for (const u of Object.values(combatantsRef.current)) {
                if (!u.isAlive || !isHostile(shooterUnit, u, modeRef.current)) continue;
                const d = Math.hypot(u.x - ix, u.z - iz);
                if (d <= p.splashRadius) {
                  const falloff = 1 - (d / p.splashRadius) * 0.52;
                  const splashDmg = Math.max(14, Math.round(p.damage * falloff));
                  carbonSfx.playHitmarker(false);
                  lastHitAt = nowMs;
                  cbRef.current.onClaimHit({
                    shooterId: p.shooterId,
                    targetId: u.id,
                    weapon: p.weapon,
                    damage: splashDmg,
                    isCrit: false,
                    hx: ix,
                    hy: iy,
                    hz: iz,
                    kx: dirX * 6,
                    kz: dirZ * 6,
                  });
                }
              }
            }
          } else if (hitEnemy) {
            const hitRig = rigsMap.get(hitEnemy.id);
            if (hitRig && hitEnemy.shield > 0) {
              hitRig.shieldFlash = 1.0;
            }
            spawnShatterBurst(ix, iy - 0.3, iz, 0xf97316, 4);

            if (p.isLocalOwner) {
              const dmg = Math.round(p.damage * (isCritHit ? p.critMult : 1));
              carbonSfx.playHitmarker(isCritHit);
              lastHitAt = nowMs;
              lastHitCrit = isCritHit ? nowMs : 0;
              cbRef.current.onClaimHit({
                shooterId: p.shooterId,
                targetId: hitEnemy.id,
                weapon: p.weapon,
                damage: dmg,
                isCrit: isCritHit,
                hx: ix,
                hy: iy,
                hz: iz,
                kx: dirX * 3,
                kz: dirZ * 3,
              });
            }
          } else if (worldHit) {
            spawnShatterBurst(ix, iy - 0.3, iz, 0xfbbf24, 2);
          }

          scene.remove(p.mesh);
          const m = (p.mesh as THREE.Mesh).material;
          if (m && !Array.isArray(m)) m.dispose();
          liveProjectiles.splice(i, 1);
        }
      }

      // --- STEP TRANSIENT FX ---
      for (let i = transientFx.length - 1; i >= 0; i--) {
        const fx = transientFx[i];
        fx.life += dt;
        if (fx.life >= fx.maxLife) {
          scene.remove(fx.mesh);
          const g = (fx.mesh as THREE.Mesh).geometry;
          if (g && g !== shardGeo && g !== blastSphereGeo) g.dispose();
          const m = (fx.mesh as THREE.Mesh).material;
          if (m && !Array.isArray(m)) m.dispose();
          transientFx.splice(i, 1);
          continue;
        }
        fx.vy -= fx.gravity * dt;
        fx.mesh.position.x += fx.vx * dt;
        fx.mesh.position.y += fx.vy * dt;
        fx.mesh.position.z += fx.vz * dt;
        if (fx.scaleSpeed !== 0) {
          const ns = Math.max(0.02, fx.mesh.scale.x + fx.scaleSpeed * dt);
          fx.mesh.scale.setScalar(ns);
        }
        const m = (fx.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (m && "opacity" in m) {
          m.opacity = Math.max(0, 1 - fx.life / fx.maxLife);
        }
      }

      // --- UPDATE ALL HERO / DRONE / BOSS 3D RIGS + BRAWL-STYLE OVERHEAD BARS ---
      const activeIds = new Set<string>();
      const localAmmoRatio =
        reloadEndsAt > nowMs && reloadEndsAt > reloadStartedAt
          ? Math.min(1, (nowMs - reloadStartedAt) / Math.max(1, reloadEndsAt - reloadStartedAt))
          : ammo / Math.max(1, wSpec.magSize);

      for (const u of Object.values(combatantsRef.current)) {
        activeIds.add(u.id);
        const isMe = u.id === myIdRef.current;
        const role: HeroVisualRole = isMe
          ? "ME"
          : myUnit && !isHostile(myUnit, u, modeRef.current)
          ? "ALLY"
          : "ENEMY";

        let rig = rigsMap.get(u.id);
        if (!rig || rig.archetype !== u.archetype || rig.role !== role) {
          if (rig) {
            rig.disposed = true;
            rig.hudTex.dispose();
            scene.remove(rig.root);
          }
          rig = createStrikerRig(role, u.archetype, u.weapon);
          scene.add(rig.root);
          rigsMap.set(u.id, rig);
        }

        if (!u.isAlive) {
          rig.root.visible = false;
          continue;
        }
        rig.root.visible = true;
        rig.hudSprite.visible = true;

        if (isMe) {
          rig.root.position.set(phys.x, phys.y, phys.z);
          rig.root.rotation.y = phys.yaw;
          const spd = Math.hypot(phys.vx, phys.vz);
          const stealthed =
            isInsideArenaBush(phys.x, phys.z) &&
            nowMs - (u.lastFiredAt || 0) > 900 &&
            nowMs - (u.lastDamagedAt || 0) > 900;

          syncStrikerHudPlate(
            rig,
            u.nickname,
            u.hp,
            u.maxHp,
            u.shield,
            u.maxShield,
            u.overdriveUntil > nowMs,
            localAmmoRatio,
            reloadEndsAt > nowMs,
            u.gems || 0,
            stealthed
          );
          updateStrikerRig(
            rig,
            dt,
            elapsedSec,
            spd,
            currentWeaponTrack,
            phys.isDashing,
            phys.isAirborne,
            u.shield > 0,
            u.overdriveUntil > nowMs
          );
        } else {
          const peer = peersRef.current.get(u.id);
          let tx = u.x;
          let ty = u.y;
          let tz = u.z;
          let tyaw = u.yaw;
          let spd = 0;
          let dashing = false;
          let airborne = false;

          if (peer && perfNow - peer.t < 1500) {
            const ageSec = Math.min(0.14, (perfNow - peer.t) / 1000);
            tx = peer.x + peer.vx * ageSec;
            ty = peer.y;
            tz = peer.z + peer.vz * ageSec;
            tyaw = peer.yw;
            spd = Math.hypot(peer.vx, peer.vz);
            dashing = Boolean(peer.d);
            airborne = Boolean(peer.ab);
          } else {
            spd = Math.hypot(tx - rig.root.position.x, tz - rig.root.position.z) / Math.max(0.016, dt);
          }

          const stealthed =
            isInsideArenaBush(tx, tz) &&
            nowMs - (u.lastFiredAt || 0) > 900 &&
            nowMs - (u.lastDamagedAt || 0) > 900;

          // True Brawl-Stars Bush Ambush: Enemies inside Tall Grass vanish beyond 3.8m!
          if (role === "ENEMY" && stealthed && Math.hypot(tx - phys.x, tz - phys.z) > 3.8) {
            rig.root.visible = false;
            continue;
          }

          tmpVec3.set(tx, ty, tz);
          if (rig.root.position.distanceTo(tmpVec3) > 8.0) {
            rig.root.position.copy(tmpVec3);
          } else {
            rig.root.position.lerp(tmpVec3, Math.min(1, dt * 15));
          }

          let yDiff = tyaw - rig.root.rotation.y;
          while (yDiff > Math.PI) yDiff -= Math.PI * 2;
          while (yDiff < -Math.PI) yDiff += Math.PI * 2;
          rig.root.rotation.y += yDiff * Math.min(1, dt * 14);

          syncStrikerHudPlate(
            rig,
            u.nickname,
            u.hp,
            u.maxHp,
            u.shield,
            u.maxShield,
            u.overdriveUntil > nowMs,
            -1,
            false,
            u.gems || 0,
            stealthed
          );
          updateStrikerRig(
            rig,
            dt,
            elapsedSec,
            spd,
            u.weapon,
            dashing,
            airborne,
            u.shield > 0,
            u.overdriveUntil > nowMs
          );
        }
      }

      for (const [id, rig] of rigsMap.entries()) {
        if (!activeIds.has(id)) {
          rig.disposed = true;
          scene.remove(rig.root);
          rig.hudTex.dispose();
          rigsMap.delete(id);
        }
      }

      if (perfNow - lastHudEmitAt >= 75) {
        lastHudEmitAt = perfNow;
        cbRef.current.onHudWeaponUpdate({
          weapon: currentWeaponTrack,
          secondaryWeapon: myUnit?.secondaryWeapon ?? null,
          ammo,
          maxAmmo: wSpec.magSize,
          isReloading: reloadEndsAt > nowMs,
          dashCooldownLeft: Math.max(0, (dashReadyAt - nowMs) / 1000),
          grenadeCooldownLeft: Math.max(0, (grenadeReadyAt - nowMs) / 1000),
          hasTargetLock,
          lastHitIsCrit: lastHitCrit,
          lastHitAt,
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      for (const [, rig] of rigsMap) {
        rig.disposed = true;
        rig.hudTex.dispose();
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full touch-none select-none overflow-hidden bg-sky-400"
    />
  );
}
