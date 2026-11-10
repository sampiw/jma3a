"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { isHostile } from "@/games/carbon3d/ai";
import {
  ARENA_HALF,
  ARENA_JUMP_PADS,
  ARENA_OBSTACLES,
  ARENA_RAMPS,
  CORE_CAPTURE_RADIUS,
  CORE_PLATFORM_HEIGHT,
  CORE_PLATFORM_RADIUS,
  EYE_HEIGHT,
  raycastArenaWorld,
  resolveArenaMovement,
  sampleArenaGroundHeight,
} from "@/games/carbon3d/arenaLayout";
import {
  CARBON_WEAPONS,
  CarbonCombatant,
  CarbonHitClaimPacket,
  CarbonLivePeerPacket,
  CarbonMode,
  CarbonPickupPad,
  CarbonShotPacket,
  CarbonWeaponId,
} from "@/games/carbon3d/types";
import {
  buildPickupVisual,
  createStrikerRig,
  StrikerRig,
  syncStrikerHudPlate,
  updateStrikerRig,
} from "./carbon3d/models";
import { createEnergyZoneMaterial, createOrbitalSkyMaterial } from "./carbon3d/shaders";
import { carbonSfx } from "./carbon3d/soundFx";
import { getCarbonPBRMaterials } from "./carbon3d/textures";
import { LocalPlayerPhysicsState } from "./carbon3d/useCarbonNet";

export type CarbonCameraMode = "TPS" | "TACTICAL";

export interface ActiveShotCommand {
  manualFiring: boolean;
  autoFireEnabled: boolean;
  dashRequested: boolean;
  grenadeRequested: boolean;
  reloadRequested: boolean;
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
  lastHitIsCrit: number; // timestamp of last hitmarker
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
  mesh: THREE.Mesh;
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
  cameraMode: CarbonCameraMode;
  combatantsRef: React.MutableRefObject<Record<string, CarbonCombatant>>;
  pickupsRef: React.MutableRefObject<CarbonPickupPad[]>;
  peersRef: React.MutableRefObject<Map<string, CarbonLivePeerPacket>>;
  coreOwnerRef: React.MutableRefObject<CarbonCombatant["team"] | "CONTESTED" | "NEUTRAL">;
  localPhysRef: React.MutableRefObject<LocalPlayerPhysicsState>;
  moveStickRef: React.MutableRefObject<{ dx: number; dz: number }>;
  lookDeltaRef: React.MutableRefObject<{ dYaw: number; dPitch: number; isDragging: boolean }>;
  commandsRef: React.MutableRefObject<ActiveShotCommand>;
  remoteShotQueueRef: React.MutableRefObject<CarbonShotPacket[]>;
  killBurstQueueRef: React.MutableRefObject<Array<{ x: number; y: number; z: number; colorHex: number }>>;
  screenShakeRef: React.MutableRefObject<number>;
  onLocalPosTick: () => void;
  onBroadcastShot: (shot: CarbonShotPacket) => void;
  onClaimHit: (claim: CarbonHitClaimPacket) => void;
  onHudWeaponUpdate: (hud: LocalWeaponHudState) => void;
}

export function Carbon3DArena({
  myId,
  mode,
  phase,
  cameraMode,
  combatantsRef,
  pickupsRef,
  peersRef,
  coreOwnerRef,
  localPhysRef,
  moveStickRef,
  lookDeltaRef,
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
  const camModeRef = useRef(cameraMode);
  camModeRef.current = cameraMode;
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

    // 1. WebGLRenderer & ACES Filmic PBR Setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060d1f, 0.0085);

    const w0 = Math.max(1, container.clientWidth);
    const h0 = Math.max(1, container.clientHeight);
    const computeFov = (aspect: number, cm: CarbonCameraMode) => {
      if (cm === "TACTICAL") return aspect < 1 ? 64 : 50;
      return aspect < 1 ? Math.min(78, 56 / Math.max(0.55, aspect)) : 62;
    };

    const camera = new THREE.PerspectiveCamera(
      computeFov(w0 / h0, camModeRef.current),
      w0 / h0,
      0.15,
      220
    );

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
    renderer.toneMappingExposure = 1.22;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Metallic PBR Environment Map
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    pmrem.dispose();

    // 2. Orbital Skybox + Lighting + Colossal Outer Station Ring
    const skyMat = createOrbitalSkyMaterial();
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(165, 32, 24), skyMat);
    scene.add(skyDome);

    const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x1e1b4b, 0.85);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xe0f2fe, 1.65);
    sunLight.position.set(22, 38, -18);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 95;
    const sc = 30;
    sunLight.shadow.camera.left = -sc;
    sunLight.shadow.camera.right = sc;
    sunLight.shadow.camera.top = sc;
    sunLight.shadow.camera.bottom = -sc;
    sunLight.shadow.bias = -0.0006;
    scene.add(sunLight);

    const rimLightCrimson = new THREE.DirectionalLight(0xf43f5e, 0.55);
    rimLightCrimson.position.set(-24, 14, 24);
    scene.add(rimLightCrimson);

    const mats = getCarbonPBRMaterials();

    // Giant rotating Orbital Halo outside the colosseum for AAA scale!
    const orbitalHalo = new THREE.Group();
    const haloTorus = new THREE.Mesh(
      new THREE.TorusGeometry(68, 0.9, 10, 64),
      mats.titaniumDark
    );
    haloTorus.rotation.x = Math.PI / 2.3;
    orbitalHalo.add(haloTorus);
    const haloNeon = new THREE.Mesh(
      new THREE.TorusGeometry(66.8, 0.22, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    haloNeon.rotation.x = Math.PI / 2.3;
    orbitalHalo.add(haloNeon);
    scene.add(orbitalHalo);

    // 3. Build Orbital Carbon Colosseum Architecture
    const arenaGroup = new THREE.Group();
    scene.add(arenaGroup);

    // Octagonal main floor slab
    const floorShape = new THREE.Shape();
    const octR = ARENA_HALF;
    const bev = 12.5;
    floorShape.moveTo(-octR + bev, -octR);
    floorShape.lineTo(octR - bev, -octR);
    floorShape.lineTo(octR, -octR + bev);
    floorShape.lineTo(octR, octR - bev);
    floorShape.lineTo(octR - bev, octR);
    floorShape.lineTo(-octR + bev, octR);
    floorShape.lineTo(-octR, octR - bev);
    floorShape.lineTo(-octR, -octR + bev);
    floorShape.closePath();

    const floorGeo = new THREE.ExtrudeGeometry(floorShape, {
      depth: 1.4,
      bevelEnabled: true,
      bevelThickness: 0.15,
      bevelSize: 0.15,
      bevelSegments: 2,
    });
    floorGeo.rotateX(Math.PI / 2);
    // Normalize UVs so tiled hex floor texture looks crisp
    const posAttr = floorGeo.attributes.position;
    const uvAttr = floorGeo.attributes.uv;
    for (let i = 0; i < posAttr.count; i++) {
      uvAttr.setXY(i, (posAttr.getX(i) + octR) / (2 * octR), (posAttr.getZ(i) + octR) / (2 * octR));
    }
    const floorMesh = new THREE.Mesh(floorGeo, mats.arenaFloor);
    floorMesh.receiveShadow = true;
    arenaGroup.add(floorMesh);

    // Perimeter low energy guardrails + 8 corner beacon towers
    const octVertices: Array<[number, number]> = [
      [-octR + bev, -octR],
      [octR - bev, -octR],
      [octR, -octR + bev],
      [octR, octR - bev],
      [octR - bev, octR],
      [-octR + bev, octR],
      [-octR, octR - bev],
      [-octR, -octR + bev],
    ];
    for (let i = 0; i < octVertices.length; i++) {
      const [ax, az] = octVertices[i];
      const [bx, bz] = octVertices[(i + 1) % octVertices.length];
      const segLen = Math.hypot(bx - ax, bz - az);
      const midX = (ax + bx) * 0.5;
      const midZ = (az + bz) * 0.5;
      const angle = Math.atan2(bx - ax, bz - az);
      const isNorth = midZ < 0;
      const railAccent = isNorth ? 0x22d3ee : 0xf43f5e;

      // Low titanium parapet
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 1.15, segLen),
        mats.titaniumDark
      );
      wall.position.set(midX, 0.57, midZ);
      wall.rotation.y = angle;
      wall.castShadow = true;
      wall.receiveShadow = true;
      arenaGroup.add(wall);

      // Glowing energy barrier strip along top of parapet
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.14, segLen * 0.96),
        new THREE.MeshBasicMaterial({ color: railAccent })
      );
      beam.position.set(midX, 1.2, midZ);
      beam.rotation.y = angle;
      arenaGroup.add(beam);

      // Octagon corner pylon
      const pylon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.6, 3.8, 8),
        mats.carbonFiber
      );
      pylon.position.set(ax, 1.9, az);
      pylon.castShadow = true;
      arenaGroup.add(pylon);

      const pylonCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.45, 8),
        new THREE.MeshBasicMaterial({ color: railAccent })
      );
      pylonCap.position.set(ax, 3.95, az);
      arenaGroup.add(pylonCap);
    }

    // Central Elevated Overdrive Platform (y = 1.15m) + Holographic Capture Ring
    const corePlat = new THREE.Mesh(
      new THREE.CylinderGeometry(CORE_PLATFORM_RADIUS, CORE_PLATFORM_RADIUS + 0.45, CORE_PLATFORM_HEIGHT, 32),
      mats.coreDeck
    );
    corePlat.position.set(0, CORE_PLATFORM_HEIGHT * 0.5, 0);
    corePlat.castShadow = true;
    corePlat.receiveShadow = true;
    arenaGroup.add(corePlat);

    const coreZoneMat = createEnergyZoneMaterial(0x22d3ee);
    const coreZoneDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(CORE_CAPTURE_RADIUS * 2, CORE_CAPTURE_RADIUS * 2),
      coreZoneMat
    );
    coreZoneDisc.rotation.x = -Math.PI / 2;
    coreZoneDisc.position.set(0, CORE_PLATFORM_HEIGHT + 0.03, 0);
    arenaGroup.add(coreZoneDisc);

    // 8 Sloped Ramps (4 Central Core Ramps + 4 Sniper Overlook Ramps)
    for (const r of ARENA_RAMPS) {
      const width = r.ascendDir === "N" || r.ascendDir === "S" ? r.halfX * 2 : r.halfZ * 2;
      const runLen = r.ascendDir === "N" || r.ascendDir === "S" ? r.halfZ * 2 : r.halfX * 2;
      const rise = r.topY - r.baseY;
      const slopeLen = Math.hypot(runLen, rise);
      const slopeAngle = Math.atan2(rise, runLen);

      const rampPivot = new THREE.Group();
      rampPivot.position.set(r.x, (r.baseY + r.topY) * 0.5 - 0.08, r.z);
      if (r.ascendDir === "S") rampPivot.rotation.y = 0;
      else if (r.ascendDir === "N") rampPivot.rotation.y = Math.PI;
      else if (r.ascendDir === "E") rampPivot.rotation.y = Math.PI / 2;
      else if (r.ascendDir === "W") rampPivot.rotation.y = -Math.PI / 2;

      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.2, slopeLen),
        mats.rampTread
      );
      slab.rotation.x = -slopeAngle;
      slab.receiveShadow = true;
      slab.castShadow = true;
      rampPivot.add(slab);
      arenaGroup.add(rampPivot);
    }

    // Cover Bunkers, Sniper Decks & Orbital Pillars
    for (const obs of ARENA_OBSTACLES) {
      const mat =
        obs.style === "ENERGY_BUNKER"
          ? mats.carbonFiber
          : obs.style === "SNIPER_DECK"
          ? mats.coreDeck
          : mats.titaniumLight;

      const box = new THREE.Mesh(
        new THREE.BoxGeometry(obs.halfX * 2, obs.height, obs.halfZ * 2),
        mat
      );
      box.position.set(obs.x, obs.baseY + obs.height * 0.5, obs.z);
      box.castShadow = true;
      box.receiveShadow = true;
      arenaGroup.add(box);

      // Accent neon trim band near top of every obstacle for crisp mobile silhouette readability!
      if (obs.accentHex) {
        const trim = new THREE.Mesh(
          new THREE.BoxGeometry(obs.halfX * 2 + 0.05, 0.09, obs.halfZ * 2 + 0.05),
          new THREE.MeshBasicMaterial({ color: obs.accentHex })
        );
        trim.position.set(obs.x, obs.baseY + obs.height - 0.14, obs.z);
        arenaGroup.add(trim);
      }
    }

    // 4 Corner Gravity Jump-Pads
    const jumpPadMats: THREE.ShaderMaterial[] = [];
    for (const jp of ARENA_JUMP_PADS) {
      const baseRing = new THREE.Mesh(
        new THREE.CylinderGeometry(jp.radius, jp.radius + 0.2, 0.14, 24),
        mats.titaniumDark
      );
      baseRing.position.set(jp.x, 0.07, jp.z);
      arenaGroup.add(baseRing);

      const vortexMat = createEnergyZoneMaterial(jp.colorHex);
      jumpPadMats.push(vortexMat);
      const vortexDisc = new THREE.Mesh(
        new THREE.PlaneGeometry(jp.radius * 2, jp.radius * 2),
        vortexMat
      );
      vortexDisc.rotation.x = -Math.PI / 2;
      vortexDisc.position.set(jp.x, 0.16, jp.z);
      arenaGroup.add(vortexDisc);
    }

    // 4. Pickup Pads Visuals
    const pickupVisuals = new Map<string, { root: THREE.Group; floatItem: THREE.Group }>();
    const syncPickupMeshes = () => {
      for (const pad of pickupsRef.current) {
        let entry = pickupVisuals.get(pad.id);
        if (!entry) {
          const root = new THREE.Group();
          root.position.set(pad.x, pad.y, pad.z);

          const plinth = new THREE.Mesh(
            new THREE.CylinderGeometry(0.85, 0.98, 0.12, 20),
            mats.titaniumDark
          );
          plinth.position.y = 0.06;
          root.add(plinth);

          const padColor =
            pad.kind === "OVERDRIVE_AMP"
              ? 0xfbbf24
              : pad.kind === "SHIELD_CELL"
              ? 0x22d3ee
              : pad.kind === "WEAPON_RAILGUN"
              ? 0xf43f5e
              : pad.kind === "WEAPON_LOBBER"
              ? 0xc084fc
              : 0xfb923c;

          const glowRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.82, 0.04, 8, 28),
            new THREE.MeshBasicMaterial({ color: padColor })
          );
          glowRing.rotation.x = Math.PI / 2;
          glowRing.position.y = 0.13;
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

    // 5. Live 3D Laser Sight (visible when local player aims XR-1 Railgun or locks onto target!)
    const laserGeo = new THREE.CylinderGeometry(0.016, 0.016, 1, 6);
    laserGeo.translate(0, 0.5, 0);
    laserGeo.rotateX(Math.PI / 2);
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const laserSightMesh = new THREE.Mesh(laserGeo, laserMat);
    laserSightMesh.visible = false;
    scene.add(laserSightMesh);

    // 6. Striker Rigs, Projectiles & Transient FX Pools
    const rigsMap = new Map<string, StrikerRig>();
    const liveProjectiles: LiveProjectile[] = [];
    const transientFx: TransientFx[] = [];

    const boltGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.95, 6);
    boltGeo.rotateX(Math.PI / 2);
    const orbGeo = new THREE.SphereGeometry(0.22, 12, 10);
    const shardGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const blastSphereGeo = new THREE.SphereGeometry(1, 18, 14);

    // Local weapon magazine & cooldown state
    let currentWeaponTrack: CarbonWeaponId = "CARBINE";
    let ammo = CARBON_WEAPONS.CARBINE.magSize;
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

    const spawnExplosionFx = (x: number, y: number, z: number, radius: number, colorHex: number) => {
      const domeMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
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
        scaleSpeed: radius * 4.5,
        life: 0,
        maxLife: 0.24,
      });
    };

    const spawnShatterBurst = (x: number, y: number, z: number, colorHex: number, count = 14) => {
      for (let i = 0; i < count; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? colorHex : 0xffffff,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
        });
        const m = new THREE.Mesh(shardGeo, mat);
        m.position.set(x, y + 0.9, z);
        const ang = Math.random() * Math.PI * 2;
        const spd = 3.5 + Math.random() * 6.5;
        scene.add(m);
        transientFx.push({
          mesh: m,
          vx: Math.cos(ang) * spd,
          vy: 3.0 + Math.random() * 6.0,
          vz: Math.sin(ang) * spd,
          gravity: 19,
          scaleSpeed: -0.35,
          life: 0,
          maxLife: 0.55 + Math.random() * 0.25,
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
      const beamGeo = new THREE.CylinderGeometry(0.075, 0.075, len, 8);
      beamGeo.translate(0, len * 0.5, 0);
      beamGeo.rotateX(Math.PI / 2);
      const beamMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
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

      // Trigger recoil + muzzle flash on shooter's 3D rig
      const shooterRig = rigsMap.get(shot.shooterId);
      if (shooterRig) {
        shooterRig.recoil = 1.0;
        const fMat = shooterRig.muzzleFlash.material as THREE.MeshBasicMaterial;
        fMat.color.setHex(
          shot.weapon === "GRENADE"
            ? 0x38bdf8
            : CARBON_WEAPONS[shot.weapon].colorHex
        );
        fMat.opacity = 0.95;
      }

      if (shot.weapon === "GRENADE") {
        const mesh = new THREE.Mesh(
          orbGeo,
          new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
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
          vx: shot.dx * 21,
          vy: shot.dy * 21 + 5.8,
          vz: shot.dz * 21,
          gravity: 18.5,
          damage: 62,
          critMult: 1.0,
          splashRadius: 4.5,
          bouncesLeft: 1,
          distanceTraveled: 0,
          maxRange: 36,
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
          shot.overdrive ? 0xfbbf24 : spec.colorHex
        );

        if (isLocalOwner) {
          const meUnit = combatantsRef.current[shot.shooterId];
          for (const target of Object.values(combatantsRef.current)) {
            if (!target.isAlive || !meUnit || !isHostile(meUnit, target, modeRef.current)) continue;
            const hitR = target.archetype === "BOSS_MECH" ? 1.1 : 0.68;
            const targetCenterY = target.y + (target.archetype === "BOSS_MECH" ? 1.65 : 1.12);
            const vx = target.x - shot.ox;
            const vy = targetCenterY - shot.oy;
            const vz = target.z - shot.oz;
            const proj = vx * shot.dx + vy * shot.dy + vz * shot.dz;
            if (proj <= 0 || proj > maxT) continue;

            const px = shot.ox + shot.dx * proj;
            const py = shot.oy + shot.dy * proj;
            const pz = shot.oz + shot.dz * proj;
            const perpDistXZ = Math.hypot(px - target.x, pz - target.z);
            const minY = target.y - 0.1;
            const maxY = target.y + (target.archetype === "BOSS_MECH" ? 3.2 : 2.1);

            if (perpDistXZ <= hitR && py >= minY && py <= maxY) {
              const isHead = py >= target.y + (target.archetype === "BOSS_MECH" ? 2.2 : 1.45);
              const dmg = Math.round(spec.damage * (isHead ? spec.critMultiplier : 1));
              carbonSfx.playHitmarker(isHead);
              lastHitAt = Date.now();
              lastHitCrit = isHead ? lastHitAt : 0;
              spawnShatterBurst(px, py - 0.7, pz, spec.colorHex, 6);
              cbRef.current.onClaimHit({
                shooterId: shot.shooterId,
                targetId: target.id,
                weapon: "RAILGUN",
                damage: dmg,
                isCrit: isHead,
                hx: px,
                hy: py,
                hz: pz,
                kx: shot.dx * spec.knockback,
                kz: shot.dz * spec.knockback,
              });
            }
          }
        }
        return;
      }

      // Projectile Weapons (Carbine, Shotgun 8-pellet spread, Bouncing Lobber)
      const count = spec.pellets;
      for (let p = 0; p < count; p++) {
        // Deterministic spread from shot id + pellet index so peers render similar spread
        const seedA = Math.sin((p + 1) * 12.9898 + shot.ox * 4.1) * 43758.5453;
        const seedB = Math.cos((p + 1) * 78.233 + shot.oz * 3.7) * 29143.112;
        const jYaw = (count === 1 && p === 0 ? (Math.random() - 0.5) : (seedA - Math.floor(seedA) - 0.5) * 2) * spec.spreadRad;
        const jPitch = (count === 1 && p === 0 ? (Math.random() - 0.5) : (seedB - Math.floor(seedB) - 0.5) * 2) * spec.spreadRad * 0.65;

        const baseYaw = Math.atan2(shot.dx, shot.dz) + jYaw;
        const basePitch = Math.asin(Math.max(-0.98, Math.min(0.98, shot.dy))) + jPitch;
        const cosP = Math.cos(basePitch);
        const pdx = Math.sin(baseYaw) * cosP;
        const pdy = Math.sin(basePitch);
        const pdz = Math.cos(baseYaw) * cosP;

        const isLobber = shot.weapon === "LOBBER";
        const mat = new THREE.MeshBasicMaterial({
          color: shot.overdrive ? 0xfde047 : spec.colorHex,
        });
        const mesh = new THREE.Mesh(isLobber ? orbGeo : boltGeo, mat);
        mesh.position.set(shot.ox, shot.oy, shot.oz);
        if (!isLobber) {
          mesh.lookAt(shot.ox + pdx * 5, shot.oy + pdy * 5, shot.oz + pdz * 5);
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
          vy: pdy * spec.projectileSpeed + (isLobber ? 4.2 : 0),
          vz: pdz * spec.projectileSpeed,
          gravity: isLobber ? 14.5 : 0,
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

    // Keyboard + Mouse Desktop Controls (seamless cross-play with phones!)
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
      camera.fov = computeFov(nw / nh, camModeRef.current);
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    // 7. Main 60 FPS Render, Physics, Aim-Assist & Combat Loop
    let rafId = 0;
    let prevTime = performance.now();
    let slowFrames = 0;
    const tmpVec3 = new THREE.Vector3();
    const camTarget = new THREE.Vector3();

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const perfNow = performance.now();
      const rawDt = (perfNow - prevTime) / 1000;
      prevTime = perfNow;
      const dt = Math.min(0.05, Math.max(0.001, rawDt));
      const elapsedSec = perfNow * 0.001;
      const nowMs = Date.now();

      // Dynamic DPR down-step if an older mobile GPU drops below 46 FPS
      if (rawDt > 0.022 && currentDpr > 1.15) {
        slowFrames++;
        if (slowFrames > 35) {
          currentDpr = 1.15;
          renderer.setPixelRatio(currentDpr);
          slowFrames = 0;
        }
      } else {
        slowFrames = Math.max(0, slowFrames - 1);
      }

      // Animate shaders & orbital ring
      skyMat.uniforms.uTime.value = elapsedSec;
      coreZoneMat.uniforms.uTime.value = elapsedSec;
      const owner = coreOwnerRef.current;
      coreZoneMat.uniforms.uColor.value.setHex(
        owner === "CYAN"
          ? 0x22d3ee
          : owner === "CRIMSON"
          ? 0xf43f5e
          : owner === "CONTESTED"
          ? 0xfbbf24
          : 0x64748b
      );
      for (const jm of jumpPadMats) jm.uniforms.uTime.value = elapsedSec;
      orbitalHalo.rotation.y = elapsedSec * 0.04;

      // Update pickup pad bobbing & availability
      syncPickupMeshes();
      for (const [, pv] of pickupVisuals) {
        if (pv.floatItem.visible) {
          pv.floatItem.rotation.y = elapsedSec * 1.8;
          pv.floatItem.position.y = 0.86 + Math.sin(elapsedSec * 3.2) * 0.1;
        }
      }

      // Drain remote shot & kill shatter queues
      while (remoteShotQueueRef.current.length > 0) {
        const rs = remoteShotQueueRef.current.shift();
        if (rs) executeShotVisualAndSim(rs, false);
      }
      while (killBurstQueueRef.current.length > 0) {
        const kb = killBurstQueueRef.current.shift();
        if (kb) spawnShatterBurst(kb.x, kb.y, kb.z, kb.colorHex, 18);
      }

      const myUnit = combatantsRef.current[myIdRef.current];
      const phys = localPhysRef.current;

      // Sync weapon switch / pickup ammo reset
      if (myUnit && myUnit.weapon !== currentWeaponTrack) {
        currentWeaponTrack = myUnit.weapon;
        ammo = CARBON_WEAPONS[currentWeaponTrack].magSize;
        reloadEndsAt = 0;
      }

      if (commandsRef.current.reloadRequested) {
        commandsRef.current.reloadRequested = false;
        const maxMag = CARBON_WEAPONS[currentWeaponTrack].magSize;
        if (ammo < maxMag && reloadEndsAt === 0) {
          reloadEndsAt = nowMs + CARBON_WEAPONS[currentWeaponTrack].reloadMs;
        }
      }
      if (reloadEndsAt > 0 && nowMs >= reloadEndsAt) {
        ammo = CARBON_WEAPONS[currentWeaponTrack].magSize;
        reloadEndsAt = 0;
      }

      // --- LOCAL PLAYER LOOK, MAGNETIC AIM-ASSIST, MOVEMENT & JUMP-PADS ---
      let hasTargetLock = false;
      let aimRayOriginX = phys.x;
      let aimRayOriginY = phys.y + EYE_HEIGHT;
      let aimRayOriginZ = phys.z;
      let aimDirX = Math.sin(phys.yaw) * Math.cos(phys.pitch);
      let aimDirY = Math.sin(phys.pitch);
      let aimDirZ = Math.cos(phys.yaw) * Math.cos(phys.pitch);

      if (myUnit && myUnit.isAlive && phaseRef.current === "PLAYING") {
        // Consume right-thumb touch look deltas
        let dYaw = lookDeltaRef.current.dYaw;
        let dPitch = lookDeltaRef.current.dPitch;
        const isDraggingLook = lookDeltaRef.current.isDragging;
        lookDeltaRef.current.dYaw = 0;
        lookDeltaRef.current.dPitch = 0;

        // Magnetic Aim-Assist: find closest enemy near aim cone
        const wSpec = CARBON_WEAPONS[currentWeaponTrack];
        let bestAssistYawDiff = 0;
        let bestAssistScore = 0.13; // ~7.4 deg magnetic cone

        for (const other of Object.values(combatantsRef.current)) {
          if (!other.isAlive || !isHostile(myUnit, other, modeRef.current)) continue;
          const ex = other.x - phys.x;
          const ez = other.z - phys.z;
          const distXZ = Math.hypot(ex, ez);
          if (distXZ > wSpec.range || distXZ < 0.4) continue;

          const ey = other.y + 1.15 - (phys.y + EYE_HEIGHT);
          const inv3d = 1 / Math.hypot(ex, ey, ez);
          const losHit = raycastArenaWorld(
            phys.x,
            phys.y + EYE_HEIGHT,
            phys.z,
            ex * inv3d,
            ey * inv3d,
            ez * inv3d,
            distXZ - 0.5
          );
          if (losHit) continue;

          const targetYaw = Math.atan2(ex, ez);
          let diff = targetYaw - phys.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;

          if (Math.abs(diff) < bestAssistScore) {
            bestAssistScore = Math.abs(diff);
            bestAssistYawDiff = diff;
            if (Math.abs(diff) < 0.085) {
              hasTargetLock = true;
              // Gently align vertical pitch to elevated/ground enemy automatically on mobile!
              const targetPitch = Math.atan2(ey, distXZ);
              phys.pitch += (targetPitch - phys.pitch) * Math.min(1, dt * 8.0);
            }
          }
        }

        // Apply aim-assist friction + soft pull while dragging
        if (bestAssistScore < 0.12 && isDraggingLook) {
          dYaw *= 0.62;
          phys.yaw += bestAssistYawDiff * Math.min(1, dt * 6.5);
        }

        phys.yaw += dYaw;
        phys.pitch = Math.max(-0.62, Math.min(0.62, phys.pitch + dPitch));

        // Combine Virtual Thumbstick + WASD
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

        // Camera-relative movement: stick UP (-inZ) moves forward along camera yaw!
        const sinY = Math.sin(phys.yaw);
        const cosY = Math.cos(phys.yaw);
        // Forward = (sinY, cosY), Right = (-cosY, sinY)
        const moveWorldX = -inZ * sinY - inX * cosY;
        const moveWorldZ = -inZ * cosY + inX * sinY;

        // Jet-Dash Trigger
        if (commandsRef.current.dashRequested) {
          commandsRef.current.dashRequested = false;
          if (nowMs >= dashReadyAt) {
            dashReadyAt = nowMs + 4000;
            dashActiveUntil = nowMs + 240;
            const dLen = Math.hypot(moveWorldX, moveWorldZ);
            dashDirX = dLen > 0.15 ? moveWorldX / dLen : sinY;
            dashDirZ = dLen > 0.15 ? moveWorldZ / dLen : cosY;
            screenShakeRef.current = Math.max(screenShakeRef.current, 0.12);
            carbonSfx.playDash();
          }
        }

        const isDashing = nowMs < dashActiveUntil;
        phys.isDashing = isDashing;
        const baseSpeed = myUnit.overdriveUntil > nowMs ? 8.6 : 7.4;

        if (isDashing) {
          phys.vx = dashDirX * 16.5;
          phys.vz = dashDirZ * 16.5;
        } else if (!phys.isAirborne) {
          phys.vx = moveWorldX * baseSpeed;
          phys.vz = moveWorldZ * baseSpeed;
        } else {
          // Responsive air-control while flying off Jump-Pads!
          phys.vx = phys.vx * (1 - dt * 1.4) + moveWorldX * baseSpeed * dt * 2.2;
          phys.vz = phys.vz * (1 - dt * 1.4) + moveWorldZ * baseSpeed * dt * 2.2;
        }

        // Resolve X/Z sliding collision
        const resolved = resolveArenaMovement(
          phys.x + phys.vx * dt,
          phys.y,
          phys.z + phys.vz * dt
        );
        phys.x = resolved.x;
        phys.z = resolved.z;

        // Check Corner Gravity Jump-Pads!
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

        // Vertical Gravity & Smooth Ramp/Platform Height Tracking
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

        // In Tactical camera mode while moving without right-thumb aiming, face movement direction if no lock
        if (camModeRef.current === "TACTICAL" && !isDraggingLook && !hasTargetLock && inMag > 0.25) {
          // Keep smooth yaw control intuitive
        }

        aimRayOriginX = phys.x + Math.sin(phys.yaw) * 0.55 - Math.cos(phys.yaw) * 0.16;
        aimRayOriginY = phys.y + 1.32;
        aimRayOriginZ = phys.z + Math.cos(phys.yaw) * 0.55 + Math.sin(phys.yaw) * 0.16;
        const cosP = Math.cos(phys.pitch);
        aimDirX = Math.sin(phys.yaw) * cosP;
        aimDirY = Math.sin(phys.pitch);
        aimDirZ = Math.cos(phys.yaw) * cosP;

        // EMP Grenade Throw
        if (commandsRef.current.grenadeRequested) {
          commandsRef.current.grenadeRequested = false;
          if (nowMs >= grenadeReadyAt) {
            grenadeReadyAt = nowMs + 8000;
            const gShot: CarbonShotPacket = {
              id: `gren_${myIdRef.current}_${nowMs.toString(36)}`,
              shooterId: myIdRef.current,
              weapon: "GRENADE",
              ox: aimRayOriginX,
              oy: aimRayOriginY + 0.15,
              oz: aimRayOriginZ,
              dx: aimDirX,
              dy: aimDirY,
              dz: aimDirZ,
              overdrive: myUnit.overdriveUntil > nowMs,
            };
            executeShotVisualAndSim(gShot, true);
            cbRef.current.onBroadcastShot(gShot);
          }
        }

        // Primary Weapon Fire (Manual Fire Button OR Smart Auto-Fire when locked onto enemy!)
        const wantsFire =
          commandsRef.current.manualFiring ||
          (commandsRef.current.autoFireEnabled && hasTargetLock);

        if (wantsFire && reloadEndsAt === 0 && nowMs - lastFireAt >= wSpec.fireIntervalMs) {
          if (ammo > 0) {
            lastFireAt = nowMs;
            ammo -= 1;
            screenShakeRef.current = Math.max(
              screenShakeRef.current,
              currentWeaponTrack === "RAILGUN" || currentWeaponTrack === "SHOTGUN" ? 0.14 : 0.045
            );

            const shotPkt: CarbonShotPacket = {
              id: `sh_${myIdRef.current}_${nowMs.toString(36)}`,
              shooterId: myIdRef.current,
              weapon: currentWeaponTrack,
              ox: aimRayOriginX,
              oy: aimRayOriginY,
              oz: aimRayOriginZ,
              dx: aimDirX,
              dy: aimDirY,
              dz: aimDirZ,
              overdrive: myUnit.overdriveUntil > nowMs,
            };
            executeShotVisualAndSim(shotPkt, true);
            cbRef.current.onBroadcastShot(shotPkt);

            if (ammo <= 0) {
              reloadEndsAt = nowMs + wSpec.reloadMs;
            }
          } else {
            reloadEndsAt = nowMs + wSpec.reloadMs;
          }
        }

        cbRef.current.onLocalPosTick();
      }

      // Live 3D Laser Sight for XR-1 Railgun (or Tactical mode aiming!)
      if (
        myUnit &&
        myUnit.isAlive &&
        (currentWeaponTrack === "RAILGUN" || camModeRef.current === "TACTICAL")
      ) {
        const wSpec = CARBON_WEAPONS[currentWeaponTrack];
        const hitW = raycastArenaWorld(
          aimRayOriginX,
          aimRayOriginY,
          aimRayOriginZ,
          aimDirX,
          aimDirY,
          aimDirZ,
          wSpec.range
        );
        const sightLen = hitW ? hitW.t : wSpec.range;
        laserSightMesh.visible = true;
        laserSightMesh.position.set(aimRayOriginX, aimRayOriginY, aimRayOriginZ);
        laserSightMesh.scale.set(1, 1, sightLen);
        laserSightMesh.lookAt(
          aimRayOriginX + aimDirX * 10,
          aimRayOriginY + aimDirY * 10,
          aimRayOriginZ + aimDirZ * 10
        );
        laserMat.color.setHex(hasTargetLock ? 0xf43f5e : wSpec.colorHex);
      } else {
        laserSightMesh.visible = false;
      }

      // --- CAMERA POSITIONING & ANTI-CLIPPING ---
      const shake = screenShakeRef.current;
      screenShakeRef.current = Math.max(0, shake - dt * 0.95);
      const shakeX = shake > 0.005 ? (Math.random() - 0.5) * shake : 0;
      const shakeY = shake > 0.005 ? (Math.random() - 0.5) * shake : 0;

      const targetFov = computeFov(camera.aspect, camModeRef.current);
      if (Math.abs(camera.fov - targetFov) > 0.5) {
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8);
        camera.updateProjectionMatrix();
      }

      if (camModeRef.current === "TPS") {
        // Right-shoulder Over-The-Shoulder Shooter Camera
        const sinY = Math.sin(phys.yaw);
        const cosY = Math.cos(phys.yaw);
        // Right of forward (sinY, cosY) in Three.js RH coords is (-cosY, sinY)
        const shoulderX = phys.x - cosY * 0.56 + shakeX;
        const shoulderY = phys.y + 1.66 + shakeY;
        const shoulderZ = phys.z + sinY * 0.56;

        const desiredBack = 3.65;
        const backDirX = -sinY * Math.cos(phys.pitch * 0.65);
        const backDirY = Math.sin(-phys.pitch * 0.65) + 0.14;
        const backDirZ = -cosY * Math.cos(phys.pitch * 0.65);
        const bLen = Math.hypot(backDirX, backDirY, backDirZ);

        const camWall = raycastArenaWorld(
          shoulderX,
          shoulderY,
          shoulderZ,
          backDirX / bLen,
          backDirY / bLen,
          backDirZ / bLen,
          desiredBack
        );
        const safeDist = camWall ? Math.max(1.15, camWall.t - 0.28) : desiredBack;

        camera.position.set(
          shoulderX + (backDirX / bLen) * safeDist,
          Math.max(0.45, shoulderY + (backDirY / bLen) * safeDist),
          shoulderZ + (backDirZ / bLen) * safeDist
        );

        camTarget.set(
          shoulderX + sinY * 18,
          shoulderY + Math.sin(phys.pitch) * 18 - 0.35,
          shoulderZ + cosY * 18
        );
        camera.lookAt(camTarget);
      } else {
        // Wide Tactical 3D Arena View
        const sinY = Math.sin(phys.yaw);
        const cosY = Math.cos(phys.yaw);
        camera.position.set(
          phys.x - sinY * 9.2 + shakeX,
          phys.y + 10.6 + shakeY,
          phys.z - cosY * 9.2
        );
        camTarget.set(phys.x + sinY * 3.2, phys.y + 1.0, phys.z + cosY * 3.2);
        camera.lookAt(camTarget);
      }

      // --- STEP LIVE PROJECTILES, WALL RICOCHETS & SPLASH / DIRECT HITS ---
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

        // 1. Check direct hit against hostile Strikers
        let hitEnemy: CarbonCombatant | null = null;
        let isCritHit = false;
        const shooterUnit = combatantsRef.current[p.shooterId];

        for (const u of Object.values(combatantsRef.current)) {
          if (!u.isAlive || u.id === p.shooterId) continue;
          if (shooterUnit && !isHostile(shooterUnit, u, modeRef.current)) continue;
          const hitR = u.archetype === "BOSS_MECH" ? 1.15 : 0.65;
          const nx = p.x + stepX;
          const ny = p.y + stepY;
          const nz = p.z + stepZ;
          const dXZ = Math.hypot(nx - u.x, nz - u.z);
          const maxH = u.archetype === "BOSS_MECH" ? 3.1 : 2.05;
          if (dXZ <= hitR && ny >= u.y - 0.1 && ny <= u.y + maxH) {
            hitEnemy = u;
            isCritHit = ny >= u.y + (u.archetype === "BOSS_MECH" ? 2.2 : 1.42);
            break;
          }
        }

        // 2. Check arena world obstacle / floor collision
        const worldHit = !hitEnemy
          ? raycastArenaWorld(p.x, p.y, p.z, dirX, dirY, dirZ, stepDist + 0.08)
          : null;

        // Handle wall bounce for GL-6 Lobber & EMP Grenade!
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

        const expired = p.distanceTraveled >= p.maxRange || p.y < -0.5;

        if (hitEnemy || worldHit || expired) {
          const ix = worldHit ? worldHit.hx : p.x;
          const iy = worldHit ? worldHit.hy : p.y;
          const iz = worldHit ? worldHit.hz : p.z;

          if (p.splashRadius > 0) {
            // Explosive Lobber / EMP Grenade Detonation!
            const blastHex = p.weapon === "GRENADE" ? 0x38bdf8 : 0xc084fc;
            spawnExplosionFx(ix, iy, iz, p.splashRadius, blastHex);
            carbonSfx.playExplosion();

            if (p.isLocalOwner && shooterUnit) {
              for (const u of Object.values(combatantsRef.current)) {
                if (!u.isAlive || !isHostile(shooterUnit, u, modeRef.current)) continue;
                const d = Math.hypot(u.x - ix, u.y + 0.9 - iy, u.z - iz);
                if (d <= p.splashRadius) {
                  const falloff = 1 - (d / p.splashRadius) * 0.55;
                  const splashDmg = Math.max(12, Math.round(p.damage * falloff));
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
            spawnShatterBurst(ix, iy - 0.6, iz, 0x22d3ee, 4);

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
            spawnShatterBurst(ix, iy - 0.7, iz, 0x94a3b8, 2);
          }

          scene.remove(p.mesh);
          (p.mesh.material as THREE.Material).dispose();
          liveProjectiles.splice(i, 1);
        }
      }

      // --- STEP TRANSIENT EXPLOSIONS, RAILBEAMS & SHATTER PARTICLES ---
      for (let i = transientFx.length - 1; i >= 0; i--) {
        const fx = transientFx[i];
        fx.life += dt;
        if (fx.life >= fx.maxLife) {
          scene.remove(fx.mesh);
          if ((fx.mesh as THREE.Mesh).geometry && (fx.mesh as THREE.Mesh).geometry !== shardGeo && (fx.mesh as THREE.Mesh).geometry !== blastSphereGeo) {
            (fx.mesh as THREE.Mesh).geometry.dispose();
          }
          if ((fx.mesh as THREE.Mesh).material) {
            ((fx.mesh as THREE.Mesh).material as THREE.Material).dispose();
          }
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

      // --- UPDATE ALL STRIKER / DRONE / MECH 3D RIGS WITH HERMITE VELOCITY SMOOTHING ---
      const activeIds = new Set<string>();
      for (const u of Object.values(combatantsRef.current)) {
        activeIds.add(u.id);
        let rig = rigsMap.get(u.id);
        if (!rig || rig.archetype !== u.archetype) {
          if (rig) scene.remove(rig.root);
          rig = createStrikerRig(u.accentHex, u.archetype, u.weapon);
          scene.add(rig.root);
          rigsMap.set(u.id, rig);
        }

        if (!u.isAlive) {
          rig.root.visible = false;
          continue;
        }
        rig.root.visible = true;

        const isMe = u.id === myIdRef.current;
        rig.hudSprite.visible = !isMe; // Don't block own TPS crosshair with own nameplate!

        if (isMe) {
          rig.root.position.set(phys.x, phys.y, phys.z);
          rig.root.rotation.y = phys.yaw;
          const spd = Math.hypot(phys.vx, phys.vz);
          updateStrikerRig(
            rig,
            dt,
            elapsedSec,
            spd,
            phys.pitch,
            currentWeaponTrack,
            phys.isDashing,
            phys.isAirborne,
            u.shield > 0,
            u.overdriveUntil > nowMs
          );
        } else {
          // Smooth WiFi peer velocity extrapolation + exponential blend
          const peer = peersRef.current.get(u.id);
          let tx = u.x;
          let ty = u.y;
          let tz = u.z;
          let tyaw = u.yaw;
          let tpitch = u.pitch;
          let spd = 0;
          let dashing = false;
          let airborne = false;

          if (peer && perfNow - peer.t < 1500) {
            const ageSec = Math.min(0.14, (perfNow - peer.t) / 1000);
            tx = peer.x + peer.vx * ageSec;
            ty = peer.y;
            tz = peer.z + peer.vz * ageSec;
            tyaw = peer.yw;
            tpitch = peer.pt;
            spd = Math.hypot(peer.vx, peer.vz);
            dashing = Boolean(peer.d);
            airborne = Boolean(peer.ab);
          }

          tmpVec3.set(tx, ty, tz);
          const distSnap = rig.root.position.distanceTo(tmpVec3);
          if (distSnap > 8.0) {
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
            u.accentHex,
            u.overdriveUntil > nowMs
          );
          updateStrikerRig(
            rig,
            dt,
            elapsedSec,
            spd,
            tpitch,
            u.weapon,
            dashing,
            airborne,
            u.shield > 0,
            u.overdriveUntil > nowMs
          );
        }
      }

      // Prune removed rigs (e.g. cleared survival wave bots)
      for (const [id, rig] of rigsMap.entries()) {
        if (!activeIds.has(id)) {
          scene.remove(rig.root);
          rig.hudTex.dispose();
          rigsMap.delete(id);
        }
      }

      // Emit local weapon/cooldown HUD state ~15Hz
      if (perfNow - lastHudEmitAt >= 65) {
        lastHudEmitAt = perfNow;
        cbRef.current.onHudWeaponUpdate({
          weapon: currentWeaponTrack,
          secondaryWeapon: myUnit?.secondaryWeapon ?? null,
          ammo,
          maxAmmo: CARBON_WEAPONS[currentWeaponTrack].magSize,
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
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      envRT.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full touch-none select-none overflow-hidden bg-slate-950"
    />
  );
}
