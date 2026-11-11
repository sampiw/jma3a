"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { isHostile } from "@/games/carbon3d/ai";
import {
  ARENA_HALF,
  ARENA_OBSTACLES,
  ARENA_PLATFORMS,
  ARENA_RAMPS,
  EYE_HEIGHT,
  HARDPOINT_ZONES,
  JOG_SPEED,
  raycastArenaWorld,
  resolveArenaMovement,
  ROLL_SPEED,
  sampleArenaGroundHeight,
  SPRINT_SPEED,
} from "@/games/carbon3d/arenaLayout";
import {
  CARBON_WEAPONS,
  CarbonBarrelExplodePacket,
  CarbonBarrelState,
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
  buildExplosiveBarrelMesh,
  buildPickupVisual,
  createStrikerRig,
  HeroVisualRole,
  loadCarbonHeroAsset,
  StrikerRig,
  syncStrikerHudPlate,
  triggerRigMuzzleFlash,
  updateStrikerRig,
} from "./carbon3d/models";
import { createEnergyZoneMaterial, createOrbitalSkyMaterial } from "./carbon3d/shaders";
import { carbonSfx } from "./carbon3d/soundFx";
import { animateCarbonMaterials, getCarbonPBRMaterials } from "./carbon3d/textures";
import { LocalPlayerPhysicsState } from "./carbon3d/useCarbonNet";

export interface ActiveShotCommand {
  dashRequested: boolean;
  jumpRequested?: boolean;
  grenadeRequested: boolean;
  reloadRequested: boolean;
}

export interface TpsLookInputState {
  deltaYaw: number;
  deltaPitch: number;
  fireHeld: boolean;
  fireTap: boolean;
  isAds: boolean;
  autoFireAssist: boolean;
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
  isAdsActive: boolean;
  pointerLocked: boolean;
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
  barrelsRef: React.MutableRefObject<CarbonBarrelState[]>;
  gemsRef: React.MutableRefObject<CarbonGemDrop[]>;
  hardpointIndexRef: React.MutableRefObject<number>;
  peersRef: React.MutableRefObject<Map<string, CarbonLivePeerPacket>>;
  coreOwnerRef: React.MutableRefObject<CarbonCombatant["team"] | "CONTESTED" | "NEUTRAL">;
  localPhysRef: React.MutableRefObject<LocalPlayerPhysicsState>;
  moveStickRef: React.MutableRefObject<{ dx: number; dz: number }>;
  lookInputRef: React.MutableRefObject<TpsLookInputState>;
  commandsRef: React.MutableRefObject<ActiveShotCommand>;
  remoteShotQueueRef: React.MutableRefObject<CarbonShotPacket[]>;
  barrelBoomQueueRef: React.MutableRefObject<CarbonBarrelExplodePacket[]>;
  killBurstQueueRef: React.MutableRefObject<Array<{ x: number; y: number; z: number; colorHex: number }>>;
  screenShakeRef: React.MutableRefObject<number>;
  onLocalPosTick: () => void;
  onBroadcastShot: (shot: CarbonShotPacket) => void;
  onClaimHit: (claim: CarbonHitClaimPacket) => void;
  onClaimBarrelHit: (barrelId: string, damage: number) => void;
  onHudWeaponUpdate: (hud: LocalWeaponHudState) => void;
}

/** Builds a solid sloped 3D wedge geometry matching ArenaRamp exactly */
function buildRampWedgeGeometry(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  lowY: number,
  highY: number,
  ascendDir: "+Z" | "-Z" | "+X" | "-X"
): THREE.BufferGeometry {
  const w = maxX - minX;
  const d = maxZ - minZ;
  const geo = new THREE.BoxGeometry(w, 1, d, 1, 1, 1);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i); // -w/2 .. +w/2
    const ly = pos.getY(i); // -0.5 .. +0.5
    const lz = pos.getZ(i); // -d/2 .. +d/2

    if (ly < 0) {
      pos.setY(i, 0);
    } else {
      let t = 0;
      if (ascendDir === "+Z") t = (lz + d / 2) / d;
      else if (ascendDir === "-Z") t = (d / 2 - lz) / d;
      else if (ascendDir === "+X") t = (lx + w / 2) / w;
      else t = (w / 2 - lx) / w;
      pos.setY(i, lowY + (highY - lowY) * Math.max(0, Math.min(1, t)));
    }
  }
  geo.computeVertexNormals();
  return geo;
}

export function Carbon3DArena({
  myId,
  mode,
  phase,
  combatantsRef,
  pickupsRef,
  barrelsRef,
  gemsRef,
  hardpointIndexRef,
  peersRef,
  coreOwnerRef,
  localPhysRef,
  moveStickRef,
  lookInputRef,
  commandsRef,
  remoteShotQueueRef,
  barrelBoomQueueRef,
  killBurstQueueRef,
  screenShakeRef,
  onLocalPosTick,
  onBroadcastShot,
  onClaimHit,
  onClaimBarrelHit,
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
    onClaimBarrelHit,
    onHudWeaponUpdate,
  });
  cbRef.current = {
    onLocalPosTick,
    onBroadcastShot,
    onClaimHit,
    onClaimBarrelHit,
    onHudWeaponUpdate,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    loadCarbonHeroAsset();

    // 1. Coastal Daylight Outpost WebGL Scene + Atmospheric Distance Haze
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7dd3fc);
    scene.fog = new THREE.FogExp2(0xbae6fd, 0.0042);

    const w0 = Math.max(1, container.clientWidth);
    const h0 = Math.max(1, container.clientHeight);
    const computeBaseFov = (aspect: number) => (aspect < 1 ? 66 : 56);

    const camera = new THREE.PerspectiveCamera(computeBaseFov(w0 / h0), w0 / h0, 0.25, 280);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    const currentDpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(currentDpr);
    renderer.setSize(w0, h0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Subtle PBR IBL Environment so metallic rifles, visors & ocean water gleam realistically!
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    // 2. Mediterranean Sky Dome + Golden Coastal Sun Lighting
    const skyMat = createOrbitalSkyMaterial();
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(220, 28, 20), skyMat);
    scene.add(skyDome);

    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0xd6c7a9, 1.05);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff7ed, 1.95);
    sunLight.position.set(34, 58, 28);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 8;
    sunLight.shadow.camera.far = 165;
    const sc = 54;
    sunLight.shadow.camera.left = -sc;
    sunLight.shadow.camera.right = sc;
    sunLight.shadow.camera.top = sc;
    sunLight.shadow.camera.bottom = -sc;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);

    const mats = getCarbonPBRMaterials();
    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    // 3. Surrounding Animated Mediterranean Ocean + 96m x 96m Coastal Island Base
    const oceanMesh = new THREE.Mesh(new THREE.PlaneGeometry(340, 340), mats.oceanWater);
    oceanMesh.rotation.x = -Math.PI / 2;
    oceanMesh.position.y = -0.65;
    worldGroup.add(oceanMesh);

    const islandSlab = new THREE.Mesh(
      new THREE.BoxGeometry(ARENA_HALF * 2, 1.2, ARENA_HALF * 2),
      mats.coastalGround
    );
    islandSlab.position.y = -0.6;
    islandSlab.receiveShadow = true;
    worldGroup.add(islandSlab);

    // Intersecting Tactical Asphalt Roadways across the 96m x 96m Island
    const roadNS = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, ARENA_HALF * 2 - 4),
      mats.asphaltRoad
    );
    roadNS.rotation.x = -Math.PI / 2;
    roadNS.position.y = 0.015;
    roadNS.receiveShadow = true;
    worldGroup.add(roadNS);

    const roadEW = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_HALF * 2 - 4, 7.2),
      mats.asphaltRoad
    );
    roadEW.rotation.x = -Math.PI / 2;
    roadEW.rotation.z = Math.PI / 2;
    roadEW.position.y = 0.018;
    roadEW.receiveShadow = true;
    worldGroup.add(roadEW);

    // Perimeter Concrete Seawall Curbs + Safety Bollards
    const wallLen = ARENA_HALF * 2 + 0.8;
    for (const [wx, wz, rotY] of [
      [0, -ARENA_HALF - 0.3, 0],
      [0, ARENA_HALF + 0.3, 0],
      [-ARENA_HALF - 0.3, 0, Math.PI / 2],
      [ARENA_HALF + 0.3, 0, Math.PI / 2],
    ] as Array<[number, number, number]>) {
      const seawall = new THREE.Mesh(new THREE.BoxGeometry(wallLen, 1.35, 0.7), mats.seawall);
      seawall.position.set(wx, 0.35, wz);
      seawall.rotation.y = rotY;
      seawall.castShadow = true;
      seawall.receiveShadow = true;
      worldGroup.add(seawall);
    }

    // 4. Elevated Multi-Level Platforms (Central Helipad, West Dock Pier, East Kasbah Terrace)
    for (const p of ARENA_PLATFORMS) {
      if (p.theme === "HELIPAD") {
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(p.halfX * 2, p.topY, p.halfZ * 2),
          mats.dockConcrete
        );
        base.position.set(p.x, p.topY * 0.5, p.z);
        base.castShadow = true;
        base.receiveShadow = true;
        worldGroup.add(base);

        const deckTop = new THREE.Mesh(
          new THREE.PlaneGeometry(p.halfX * 2 - 0.15, p.halfZ * 2 - 0.15),
          mats.helipadDeck
        );
        deckTop.rotation.x = -Math.PI / 2;
        deckTop.position.set(p.x, p.topY + 0.012, p.z);
        deckTop.receiveShadow = true;
        worldGroup.add(deckTop);
      } else if (p.theme === "DOCK_PIER") {
        const pier = new THREE.Mesh(
          new THREE.BoxGeometry(p.halfX * 2, p.topY, p.halfZ * 2),
          mats.dockConcrete
        );
        pier.position.set(p.x, p.topY * 0.5, p.z);
        pier.castShadow = true;
        pier.receiveShadow = true;
        worldGroup.add(pier);

        const woodTop = new THREE.Mesh(
          new THREE.PlaneGeometry(p.halfX * 2 - 0.2, p.halfZ * 2 - 0.2),
          mats.hardwoodCrate
        );
        woodTop.rotation.x = -Math.PI / 2;
        woodTop.position.set(p.x, p.topY + 0.012, p.z);
        woodTop.receiveShadow = true;
        worldGroup.add(woodTop);
      } else {
        const terrace = new THREE.Mesh(
          new THREE.BoxGeometry(p.halfX * 2, p.topY, p.halfZ * 2),
          mats.kasbahBrick
        );
        terrace.position.set(p.x, p.topY * 0.5, p.z);
        terrace.castShadow = true;
        terrace.receiveShadow = true;
        worldGroup.add(terrace);
      }
    }

    // 8 Sloped Ramps connecting ground y = 0 to Elevated Decks
    for (const r of ARENA_RAMPS) {
      const wedgeGeo = buildRampWedgeGeometry(
        r.minX,
        r.maxX,
        r.minZ,
        r.maxZ,
        r.lowY,
        r.highY,
        r.ascendDir
      );
      const mat =
        r.platformId === "kasbah_terrace" ? mats.kasbahBrick : mats.dockConcrete;
      const rampMesh = new THREE.Mesh(wedgeGeo, mat);
      rampMesh.position.set((r.minX + r.maxX) * 0.5, 0, (r.minZ + r.maxZ) * 0.5);
      rampMesh.castShadow = true;
      rampMesh.receiveShadow = true;
      worldGroup.add(rampMesh);
    }

    // 5. Outpost Buildings, ISO Shipping Containers, Kasbah Walls, Sandbags & Radar Towers
    const radarRotors: THREE.Object3D[] = [];
    for (const obs of ARENA_OBSTACLES) {
      if (obs.style === "RADAR_TOWER") {
        const towerGroup = new THREE.Group();
        towerGroup.position.set(obs.x, obs.baseY, obs.z);

        const basePedestal = new THREE.Mesh(
          new THREE.BoxGeometry(obs.halfX * 2, 1.8, obs.halfZ * 2),
          mats.concreteBarrier
        );
        basePedestal.position.y = 0.9;
        basePedestal.castShadow = true;
        basePedestal.receiveShadow = true;
        towerGroup.add(basePedestal);

        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.58, obs.height - 1.6, 8),
          mats.weaponDark
        );
        mast.position.y = 1.8 + (obs.height - 1.6) * 0.5;
        mast.castShadow = true;
        towerGroup.add(mast);

        const dishGroup = new THREE.Group();
        dishGroup.position.y = obs.height + 0.15;
        const dishBar = new THREE.Mesh(
          new THREE.BoxGeometry(2.4, 0.28, 0.36),
          mats.hazardStripe
        );
        dishGroup.add(dishBar);
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0xef4444 })
        );
        beacon.position.y = 0.35;
        dishGroup.add(beacon);
        towerGroup.add(dishGroup);
        radarRotors.push(dishGroup);

        worldGroup.add(towerGroup);
        continue;
      }

      const mat =
        obs.style === "CONTAINER_RED"
          ? mats.containerRed
          : obs.style === "CONTAINER_BLUE"
          ? mats.containerBlue
          : obs.style === "CONTAINER_OLIVE"
          ? mats.containerOlive
          : obs.style === "WOOD_CRATE"
          ? mats.hardwoodCrate
          : obs.style === "KASBAH_WALL" || obs.style === "KASBAH_LOW"
          ? mats.kasbahBrick
          : obs.style === "SANDBAG"
          ? mats.sandbag
          : mats.concreteBarrier;

      const box = new THREE.Mesh(
        new THREE.BoxGeometry(obs.halfX * 2, obs.height, obs.halfZ * 2),
        mat
      );
      box.position.set(obs.x, obs.baseY + obs.height * 0.5, obs.z);
      box.castShadow = true;
      box.receiveShadow = true;
      worldGroup.add(box);

      // Add authentic Moroccan fortress crenellations on tall Kasbah walls!
      if (obs.style === "KASBAH_WALL") {
        const spanX = obs.halfX * 2;
        const count = Math.max(2, Math.floor(spanX / 1.3));
        for (let m = 0; m < count; m++) {
          const mx = obs.x - obs.halfX + 0.45 + (m / Math.max(1, count - 1)) * (spanX - 0.9);
          const merlon = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.42, Math.min(0.65, obs.halfZ * 1.6)),
            mats.kasbahTrim
          );
          merlon.position.set(mx, obs.baseY + obs.height + 0.21, obs.z);
          merlon.castShadow = true;
          worldGroup.add(merlon);
        }
      }
    }

    // 6. Active Rotating Hardpoint 3D Capture Ring + Tall Sky Beacon
    const hardpointGroup = new THREE.Group();
    const coreZoneMat = createEnergyZoneMaterial(0x38bdf8);
    const coreZoneDisc = new THREE.Mesh(new THREE.PlaneGeometry(11.2, 11.2), coreZoneMat);
    coreZoneDisc.rotation.x = -Math.PI / 2;
    coreZoneDisc.position.y = 0.04;
    hardpointGroup.add(coreZoneDisc);

    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beaconPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(5.3, 5.3, 13.5, 28, 1, true),
      beaconMat
    );
    beaconPillar.position.y = 6.75;
    hardpointGroup.add(beaconPillar);
    scene.add(hardpointGroup);

    // 7. Weapon Racks, Armor Stations, Airdrop Crates & Shootable Red Barrels
    const pickupVisuals = new Map<string, { root: THREE.Group; floatItem: THREE.Group }>();
    const syncPickupMeshes = () => {
      for (const pad of pickupsRef.current) {
        let entry = pickupVisuals.get(pad.id);
        if (!entry) {
          const root = new THREE.Group();
          root.position.set(pad.x, pad.y, pad.z);

          const plinth = new THREE.Mesh(
            new THREE.CylinderGeometry(0.85, 0.96, 0.1, 20),
            mats.seawall
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
            new THREE.TorusGeometry(0.8, 0.045, 8, 28),
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

    const barrelVisuals = new Map<string, THREE.Group>();
    const syncBarrelMeshes = () => {
      for (const brl of barrelsRef.current) {
        let mesh = barrelVisuals.get(brl.id);
        if (!mesh) {
          mesh = buildExplosiveBarrelMesh();
          mesh.position.set(brl.x, brl.y, brl.z);
          scene.add(mesh);
          barrelVisuals.set(brl.id, mesh);
        }
        mesh.visible = brl.alive;
      }
    };
    syncBarrelMeshes();

    const airdropVisuals = new Map<string, THREE.Group>();
    const syncAirdropMeshes = (elapsedSec: number) => {
      const liveIds = new Set<string>();
      for (const dr of gemsRef.current) {
        liveIds.add(dr.id);
        let mesh = airdropVisuals.get(dr.id);
        if (!mesh) {
          mesh = buildCrystalGemMesh();
          scene.add(mesh);
          airdropVisuals.set(dr.id, mesh);
        }
        const baseY = dr.y ?? 0;
        mesh.position.set(
          dr.x,
          baseY + 0.42 + Math.sin(elapsedSec * 3.2 + dr.x) * 0.08,
          dr.z
        );
        mesh.rotation.y = elapsedSec * 1.6 + dr.z;
      }
      for (const [id, mesh] of airdropVisuals.entries()) {
        if (!liveIds.has(id)) {
          scene.remove(mesh);
          airdropVisuals.delete(id);
        }
      }
    };

    // 8. Soldier Rigs, Ballistic Projectiles & Explosion FX
    const rigsMap = new Map<string, StrikerRig>();
    const liveProjectiles: LiveProjectile[] = [];
    const transientFx: TransientFx[] = [];

    const tracerGeo = new THREE.CapsuleGeometry(0.045, 0.65, 4, 8);
    tracerGeo.rotateX(Math.PI / 2);
    const grenadeGeo = new THREE.SphereGeometry(0.18, 12, 10);
    const sparkGeo = new THREE.SphereGeometry(0.11, 8, 8);
    const blastSphereGeo = new THREE.SphereGeometry(1, 18, 14);

    let currentWeaponTrack: CarbonWeaponId = "CARBINE";
    let ammo = CARBON_WEAPONS.CARBINE.magSize;
    let reloadEndsAt = 0;
    let lastFireAt = 0;
    let dashReadyAt = 0;
    let dashActiveUntil = 0;
    let dashDirX = 0;
    let dashDirZ = 0;
    let grenadeReadyAt = 0;
    let lastHitAt = 0;
    let lastHitCrit = 0;
    let lastHudEmitAt = 0;

    // TPS Camera State
    let camYaw = localPhysRef.current.yaw;
    let camPitch = -0.06;
    let currentFov = camera.fov;
    let smoothArmDist = 3.9;
    let smoothRightOff = 0.68;
    let isPointerLocked = false;
    let pcFireHeld = false;
    let pcAdsHeld = false;

    // Desktop PC Keyboard + PointerLock Mouse Listeners
    const keysDown = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysDown.add(k);
      if (k === " ") commandsRef.current.jumpRequested = true;
      if (k === "c" || k === "alt") commandsRef.current.dashRequested = true;
      if (k === "g" || k === "e") commandsRef.current.grenadeRequested = true;
      if (k === "r") commandsRef.current.reloadRequested = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.key.toLowerCase());
    };

    const onCanvasMouseDown = (e: MouseEvent) => {
      if (!window.matchMedia?.("(pointer: fine)").matches) return;
      if (phaseRef.current !== "PLAYING") return;
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock?.();
      }
      if (e.button === 0) pcFireHeld = true;
      if (e.button === 2) pcAdsHeld = true;
    };
    const onWindowMouseUp = (e: MouseEvent) => {
      if (e.button === 0) pcFireHeld = false;
      if (e.button === 2) pcAdsHeld = false;
    };
    const onWindowMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      // Remember right-hand cross-product: moving mouse RIGHT (+movementX) decreases yaw!
      camYaw -= e.movementX * 0.0022;
      camPitch = Math.max(-0.52, Math.min(0.62, camPitch - e.movementY * 0.0019));
    };
    const onPointerLockChange = () => {
      isPointerLocked = document.pointerLockElement === renderer.domElement;
      if (!isPointerLocked) {
        pcFireHeld = false;
        pcAdsHeld = false;
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      if (window.matchMedia?.("(pointer: fine)").matches) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mouseup", onWindowMouseUp);
    window.addEventListener("mousemove", onWindowMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    renderer.domElement.addEventListener("mousedown", onCanvasMouseDown);
    renderer.domElement.addEventListener("contextmenu", onContextMenu);

    const onResize = () => {
      if (!container) return;
      const nw = Math.max(1, container.clientWidth);
      const nh = Math.max(1, container.clientHeight);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    const spawnSparks = (
      x: number,
      y: number,
      z: number,
      colorHex: number,
      count = 7,
      speed = 6.5
    ) => {
      for (let i = 0; i < count; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 1,
        });
        const m = new THREE.Mesh(sparkGeo, mat);
        m.position.set(x, y, z);
        scene.add(m);
        const a = Math.random() * Math.PI * 2;
        const up = 1.8 + Math.random() * speed * 0.7;
        const r = (0.3 + Math.random() * 0.7) * speed;
        transientFx.push({
          mesh: m,
          vx: Math.cos(a) * r,
          vy: up,
          vz: Math.sin(a) * r,
          gravity: 16,
          scaleSpeed: -1.6,
          life: 0.34,
          maxLife: 0.34,
        });
      }
    };

    const spawnExplosionDome = (
      x: number,
      y: number,
      z: number,
      radius: number,
      colorHex: number
    ) => {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      });
      const dome = new THREE.Mesh(blastSphereGeo, mat);
      dome.position.set(x, y, z);
      dome.scale.setScalar(0.35);
      scene.add(dome);
      transientFx.push({
        mesh: dome,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: 0,
        scaleSpeed: radius * 4.4,
        life: 0.3,
        maxLife: 0.3,
      });
      spawnSparks(x, y + 0.4, z, 0xf97316, 16, 12.5);
      spawnSparks(x, y + 0.6, z, 0xfef08a, 10, 9.0);
    };

    const spawnSupersonicBeam = (
      ox: number,
      oy: number,
      oz: number,
      tx: number,
      ty: number,
      tz: number,
      colorHex: number
    ) => {
      const start = new THREE.Vector3(ox, oy, oz);
      const end = new THREE.Vector3(tx, ty, tz);
      const dist = Math.max(0.1, start.distanceTo(end));
      const beamGeo = new THREE.CylinderGeometry(0.045, 0.045, dist, 8, 1, true);
      beamGeo.rotateX(Math.PI / 2);
      const beamMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.copy(start).lerp(end, 0.5);
      beam.lookAt(end);
      scene.add(beam);
      transientFx.push({
        mesh: beam,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: 0,
        scaleSpeed: 0,
        life: 0.2,
        maxLife: 0.2,
      });
    };

    // Raycast against living enemies AND shootable red barrels
    const raycastTargets = (
      shooterId: string,
      ox: number,
      oy: number,
      oz: number,
      dx: number,
      dy: number,
      dz: number,
      maxDist: number
    ):
      | { kind: "UNIT"; unit: CarbonCombatant; t: number; isCrit: boolean; hx: number; hy: number; hz: number }
      | { kind: "BARREL"; barrel: CarbonBarrelState; t: number; hx: number; hy: number; hz: number }
      | null => {
      const shooter = combatantsRef.current[shooterId];
      if (!shooter) return null;

      let bestT = maxDist;
      let result:
        | { kind: "UNIT"; unit: CarbonCombatant; t: number; isCrit: boolean; hx: number; hy: number; hz: number }
        | { kind: "BARREL"; barrel: CarbonBarrelState; t: number; hx: number; hy: number; hz: number }
        | null = null;

      // 1. Test enemy soldiers
      for (const u of Object.values(combatantsRef.current)) {
        if (!u.isAlive || !isHostile(shooter, u, modeRef.current)) continue;
        const hitR = u.archetype === "BOSS_MECH" ? 1.05 : 0.62;
        const unitH = u.archetype === "BOSS_MECH" ? 2.45 : 1.83;

        const rx = u.x - ox;
        const rz = u.z - oz;
        const horizLenSq = dx * dx + dz * dz;
        if (horizLenSq < 1e-6) continue;
        const projT = (rx * dx + rz * dz) / horizLenSq;
        if (projT < 0.1 || projT > bestT) continue;

        const cx = ox + dx * projT;
        const cy = oy + dy * projT;
        const cz = oz + dz * projT;
        const distXZ = Math.hypot(cx - u.x, cz - u.z);
        if (distXZ <= hitR && cy >= u.y - 0.12 && cy <= u.y + unitH + 0.15) {
          const isHeadshot = cy >= u.y + unitH * 0.72;
          bestT = projT;
          result = { kind: "UNIT", unit: u, t: projT, isCrit: isHeadshot, hx: cx, hy: cy, hz: cz };
        }
      }

      // 2. Test shootable explosive red barrels!
      for (const b of barrelsRef.current) {
        if (!b.alive) continue;
        const rx = b.x - ox;
        const rz = b.z - oz;
        const horizLenSq = dx * dx + dz * dz;
        if (horizLenSq < 1e-6) continue;
        const projT = (rx * dx + rz * dz) / horizLenSq;
        if (projT < 0.1 || projT > bestT) continue;

        const cx = ox + dx * projT;
        const cy = oy + dy * projT;
        const cz = oz + dz * projT;
        if (Math.hypot(cx - b.x, cz - b.z) <= 0.56 && cy >= b.y - 0.1 && cy <= b.y + 1.25) {
          bestT = projT;
          result = { kind: "BARREL", barrel: b, t: projT, hx: cx, hy: cy, hz: cz };
        }
      }

      return result;
    };

    const executeShotPacket = (shot: CarbonShotPacket, isLocalOwner: boolean) => {
      const shooterRig = rigsMap.get(shot.shooterId);
      const colorHex =
        shot.weapon === "GRENADE"
          ? 0x38bdf8
          : shot.overdrive
          ? 0xf59e0b
          : CARBON_WEAPONS[shot.weapon].colorHex;

      if (shooterRig) {
        triggerRigMuzzleFlash(shooterRig, colorHex);
      }
      carbonSfx.playWeaponFire(shot.weapon, isLocalOwner);

      if (shot.weapon === "GRENADE") {
        const mesh = new THREE.Mesh(
          grenadeGeo,
          new THREE.MeshStandardMaterial({
            color: 0x3f6212,
            emissive: 0xef4444,
            emissiveIntensity: 0.55,
            roughness: 0.45,
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
          vx: shot.dx * 24,
          vy: shot.dy * 24 + 5.8,
          vz: shot.dz * 24,
          gravity: 19,
          damage: 78,
          critMult: 1.0,
          splashRadius: 5.2,
          bouncesLeft: 1,
          distanceTraveled: 0,
          maxRange: 52,
          mesh,
        });
        return;
      }

      const spec = CARBON_WEAPONS[shot.weapon];

      // Hitscan Supersonic Sniper Round (AWP Atlas)
      if (spec.projectileSpeed === 0) {
        const wallHit = raycastArenaWorld(
          shot.ox,
          shot.oy,
          shot.oz,
          shot.dx,
          shot.dy,
          shot.dz,
          spec.range
        );
        const maxReach = wallHit ? wallHit.t : spec.range;
        const targetHit = raycastTargets(
          shot.shooterId,
          shot.ox,
          shot.oy,
          shot.oz,
          shot.dx,
          shot.dy,
          shot.dz,
          maxReach
        );

        const endT = targetHit ? targetHit.t : maxReach;
        const tx = shot.ox + shot.dx * endT;
        const ty = shot.oy + shot.dy * endT;
        const tz = shot.oz + shot.dz * endT;

        spawnSupersonicBeam(shot.ox, shot.oy, shot.oz, tx, ty, tz, colorHex);
        spawnSparks(tx, ty, tz, colorHex, 9, 8);

        if (isLocalOwner && targetHit) {
          if (targetHit.kind === "BARREL") {
            carbonSfx.playHitmarker(true);
            lastHitAt = performance.now();
            lastHitCrit = 1;
            cbRef.current.onClaimBarrelHit(targetHit.barrel.id, spec.damage);
          } else {
            const finalDmg = Math.round(
              spec.damage * (targetHit.isCrit ? spec.critMultiplier : 1)
            );
            carbonSfx.playHitmarker(targetHit.isCrit);
            lastHitAt = performance.now();
            lastHitCrit = targetHit.isCrit ? 2 : 1;
            const targetRig = rigsMap.get(targetHit.unit.id);
            if (targetRig) targetRig.shieldFlash = 1.0;

            cbRef.current.onClaimHit({
              shooterId: shot.shooterId,
              targetId: targetHit.unit.id,
              weapon: shot.weapon,
              damage: finalDmg,
              isCrit: targetHit.isCrit,
              hx: targetHit.hx,
              hy: targetHit.hy,
              hz: targetHit.hz,
              kx: shot.dx * spec.knockback,
              kz: shot.dz * spec.knockback,
            });
          }
        }
        return;
      }

      // Ballistic Projectiles (M4A1 Carbine, M870 Shotgun Pellets, M32 Rotary Grenade)
      const pelletCount = spec.pellets;
      const activeAds = isLocalOwner && (lookInputRef.current.isAds || pcAdsHeld);
      const effSpread = spec.spreadRad * (activeAds ? 0.3 : 1.0);

      for (let p = 0; p < pelletCount; p++) {
        let pdx = shot.dx;
        let pdy = shot.dy;
        let pdz = shot.dz;
        if (pelletCount > 1 || effSpread > 0.004) {
          const sx = (Math.random() - 0.5) * 2 * effSpread;
          const sy = (Math.random() - 0.5) * 1.4 * effSpread;
          const sz = (Math.random() - 0.5) * 2 * effSpread;
          pdx += sx;
          pdy += sy;
          pdz += sz;
          const il = 1 / Math.max(0.001, Math.hypot(pdx, pdy, pdz));
          pdx *= il;
          pdy *= il;
          pdz *= il;
        }

        const isExplosive = spec.splashRadius > 0;
        const projMesh = new THREE.Mesh(
          isExplosive ? grenadeGeo : tracerGeo,
          new THREE.MeshBasicMaterial({ color: isExplosive ? 0xc084fc : 0xfef08a })
        );
        projMesh.position.set(shot.ox, shot.oy, shot.oz);
        projMesh.lookAt(shot.ox + pdx, shot.oy + pdy, shot.oz + pdz);
        scene.add(projMesh);

        liveProjectiles.push({
          id: `${shot.id}_${p}`,
          shooterId: shot.shooterId,
          isLocalOwner,
          weapon: shot.weapon,
          x: shot.ox,
          y: shot.oy,
          z: shot.oz,
          vx: pdx * spec.projectileSpeed,
          vy: pdy * spec.projectileSpeed + (isExplosive ? 3.2 : 0),
          vz: pdz * spec.projectileSpeed,
          gravity: isExplosive ? 13.5 : 0,
          damage: spec.damage,
          critMult: spec.critMultiplier,
          splashRadius: spec.splashRadius,
          bouncesLeft: spec.bounces,
          distanceTraveled: 0,
          maxRange: spec.range,
          mesh: projMesh,
        });
      }
    };

    // 9. Main 60FPS Render & TPS Simulation Loop
    let animId = 0;
    let prevTime = performance.now();
    const startTime = prevTime;
    let lastKnownRespawnYaw = localPhysRef.current.yaw;

    const tick = () => {
      animId = requestAnimationFrame(tick);
      const nowPerf = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (nowPerf - prevTime) / 1000));
      prevTime = nowPerf;
      const elapsedSec = (nowPerf - startTime) / 1000;
      const nowEpoch = Date.now();

      // Animate Ocean Water Normals, Sky Clouds, Radar Towers & Active Hardpoint Ring
      animateCarbonMaterials(elapsedSec);
      skyMat.uniforms.uTime.value = elapsedSec;
      for (const r of radarRotors) {
        r.rotation.y = elapsedSec * 1.35;
      }

      const activeHp =
        HARDPOINT_ZONES[hardpointIndexRef.current % HARDPOINT_ZONES.length] || HARDPOINT_ZONES[0];
      hardpointGroup.visible = modeRef.current !== "SURVIVAL";
      hardpointGroup.position.set(activeHp.x, activeHp.y, activeHp.z);
      coreZoneMat.uniforms.uTime.value = elapsedSec;
      const owner = coreOwnerRef.current;
      const hpColor =
        owner === "CYAN"
          ? 0x38bdf8
          : owner === "CRIMSON"
          ? 0xef4444
          : owner === "CONTESTED"
          ? 0xf59e0b
          : 0xeab308;
      coreZoneMat.uniforms.uColor.value.setHex(hpColor);
      beaconMat.color.setHex(hpColor);

      syncPickupMeshes();
      syncBarrelMeshes();
      syncAirdropMeshes(elapsedSec);
      for (const pv of pickupVisuals.values()) {
        if (pv.floatItem.visible) {
          pv.floatItem.rotation.y = elapsedSec * 1.9;
          pv.floatItem.position.y = 0.85 + Math.sin(elapsedSec * 3.0) * 0.08;
        }
      }

      // Process Barrel Explosion Events from Arbiter
      while (barrelBoomQueueRef.current.length > 0) {
        const boom = barrelBoomQueueRef.current.shift()!;
        spawnExplosionDome(boom.x, boom.y + 0.6, boom.z, 5.8, 0xf97316);
        carbonSfx.playExplosion();
        const distMe = Math.hypot(
          localPhysRef.current.x - boom.x,
          localPhysRef.current.z - boom.z
        );
        if (distMe < 22) {
          screenShakeRef.current = Math.max(
            screenShakeRef.current,
            Math.max(0.08, (1 - distMe / 22) * 0.42)
          );
        }
      }

      const me = combatantsRef.current[myIdRef.current];
      const phys = localPhysRef.current;

      // Sync camera yaw on respawn if localPhysRef.yaw jumped cleanly
      if (Math.abs(phys.yaw - lastKnownRespawnYaw) > 0.8 && (!me || me.hp === me.maxHp)) {
        camYaw = phys.yaw;
      }

      // Apply Mobile Free-Look Touch Deltas (with Magnetic Aim-Assist!)
      const lookIn = lookInputRef.current;
      let lockedTarget: CarbonCombatant | null = null;
      let bestLockCos = Math.cos((5.8 * Math.PI) / 180); // 5.8° crosshair cone

      if (me && me.isAlive) {
        const lookDx = Math.sin(camYaw) * Math.cos(camPitch);
        const lookDy = Math.sin(camPitch);
        const lookDz = Math.cos(camYaw) * Math.cos(camPitch);

        for (const u of Object.values(combatantsRef.current)) {
          if (!u.isAlive || !isHostile(me, u, modeRef.current)) continue;
          const tx = u.x - camera.position.x;
          const ty = u.y + 1.25 - camera.position.y;
          const tz = u.z - camera.position.z;
          const d = Math.hypot(tx, ty, tz);
          if (d < 1.0 || d > 95) continue;
          const dot = (tx * lookDx + ty * lookDy + tz * lookDz) / d;
          if (dot > bestLockCos) {
            const wall = raycastArenaWorld(
              camera.position.x,
              camera.position.y,
              camera.position.z,
              tx / d,
              ty / d,
              tz / d,
              d - 0.55
            );
            if (!wall) {
              bestLockCos = dot;
              lockedTarget = u;
            }
          }
        }
      }

      if (lookIn.deltaYaw !== 0 || lookIn.deltaPitch !== 0) {
        const assistSlowdown = lockedTarget ? 0.58 : 1.0;
        const adsSlowdown = lookIn.isAds || pcAdsHeld ? 0.55 : 1.0;
        camYaw += lookIn.deltaYaw * assistSlowdown * adsSlowdown;
        camPitch = Math.max(
          -0.52,
          Math.min(0.62, camPitch + lookIn.deltaPitch * assistSlowdown * adsSlowdown)
        );
        lookIn.deltaYaw = 0;
        lookIn.deltaPitch = 0;
      }

      // Gentle Mobile Magnetic Tracking when locked onto an enemy while moving or holding fire
      if (lockedTarget && !isPointerLocked && (lookIn.fireHeld || Math.hypot(moveStickRef.current.dx, moveStickRef.current.dz) > 0.2)) {
        const toEx = lockedTarget.x - phys.x;
        const toEz = lockedTarget.z - phys.z;
        const desiredYaw = Math.atan2(toEx, toEz);
        let diffY = desiredYaw - camYaw;
        while (diffY > Math.PI) diffY -= Math.PI * 2;
        while (diffY < -Math.PI) diffY += Math.PI * 2;
        camYaw += diffY * Math.min(1, dt * 3.2);
      }

      // --- A. LOCAL SOLDIER TPS MOVEMENT, SPRINT, JUMP, ROLL & WEAPON BALLISTICS ---
      const activeAds = Boolean(me?.isAlive && (lookIn.isAds || pcAdsHeld));

      if (me && me.isAlive && phaseRef.current === "PLAYING") {
        if (me.weapon !== currentWeaponTrack) {
          currentWeaponTrack = me.weapon;
          ammo = CARBON_WEAPONS[currentWeaponTrack].magSize;
          reloadEndsAt = 0;
        }
        const spec = CARBON_WEAPONS[currentWeaponTrack];

        if (reloadEndsAt > 0 && nowPerf >= reloadEndsAt) {
          reloadEndsAt = 0;
          ammo = spec.magSize;
        }
        if (commandsRef.current.reloadRequested) {
          commandsRef.current.reloadRequested = false;
          if (reloadEndsAt === 0 && ammo < spec.magSize) {
            reloadEndsAt = nowPerf + spec.reloadMs;
          }
        }

        // Camera-Relative Input Vector:
        // Forward = (sin(camYaw), 0, cos(camYaw))
        // Right   = (-cos(camYaw), 0, sin(camYaw))
        let rightIn = moveStickRef.current.dx;
        let fwdIn = -moveStickRef.current.dz; // pushing stick UP (negative screen Y) = +1 forward!

        if (keysDown.has("w") || keysDown.has("arrowup") || keysDown.has("z")) fwdIn += 1;
        if (keysDown.has("s") || keysDown.has("arrowdown")) fwdIn -= 1;
        if (keysDown.has("d") || keysDown.has("arrowright")) rightIn += 1;
        if (keysDown.has("a") || keysDown.has("arrowleft") || keysDown.has("q")) rightIn -= 1;

        const inMag = Math.hypot(rightIn, fwdIn);
        const normFwd = inMag > 1 ? fwdIn / inMag : fwdIn;
        const normRight = inMag > 1 ? rightIn / inMag : rightIn;
        const clampedMag = Math.min(1, inMag);

        const sinY = Math.sin(camYaw);
        const cosY = Math.cos(camYaw);
        const moveWorldX = sinY * normFwd - cosY * normRight;
        const moveWorldZ = cosY * normFwd + sinY * normRight;

        const wantsSprint =
          !activeAds &&
          normFwd > 0.55 &&
          (clampedMag > 0.88 || keysDown.has("shift"));
        phys.isSprinting = wantsSprint;

        const speedCap =
          (wantsSprint ? SPRINT_SPEED : activeAds ? JOG_SPEED * 0.72 : JOG_SPEED) *
          (me.overdriveUntil > nowEpoch ? 1.15 : 1.0);

        // Jump / Vault
        if (commandsRef.current.jumpRequested) {
          commandsRef.current.jumpRequested = false;
          if (!phys.isAirborne) {
            phys.vy = 8.4;
            phys.isAirborne = true;
          }
        }

        // Tactical Combat Roll / Dash
        if (commandsRef.current.dashRequested) {
          commandsRef.current.dashRequested = false;
          if (nowPerf >= dashReadyAt) {
            dashReadyAt = nowPerf + 3200;
            dashActiveUntil = nowPerf + 230;
            if (clampedMag > 0.15) {
              const ml = Math.max(0.01, Math.hypot(moveWorldX, moveWorldZ));
              dashDirX = moveWorldX / ml;
              dashDirZ = moveWorldZ / ml;
            } else {
              dashDirX = sinY;
              dashDirZ = cosY;
            }
            carbonSfx.playDash();
          }
        }

        const isDashing = nowPerf < dashActiveUntil;
        phys.isDashing = isDashing;

        if (isDashing) {
          phys.vx = dashDirX * ROLL_SPEED;
          phys.vz = dashDirZ * ROLL_SPEED;
        } else {
          const targetVx = moveWorldX * speedCap;
          const targetVz = moveWorldZ * speedCap;
          const accel = phys.isAirborne ? 8 : 18;
          phys.vx += (targetVx - phys.vx) * Math.min(1, dt * accel);
          phys.vz += (targetVz - phys.vz) * Math.min(1, dt * accel);
        }

        // Apply Horizontal Collision & Multi-Level Ramp/Platform Elevation
        const resolved = resolveArenaMovement(
          phys.x + phys.vx * dt,
          phys.y,
          phys.z + phys.vz * dt
        );
        phys.x = resolved.x;
        phys.z = resolved.z;

        const groundY = sampleArenaGroundHeight(phys.x, phys.z, phys.y);
        if (!phys.isAirborne && groundY >= phys.y - 0.35) {
          phys.y = groundY;
          phys.vy = 0;
        } else {
          phys.vy -= 24.0 * dt;
          phys.y += phys.vy * dt;
          if (phys.y <= groundY) {
            phys.y = groundY;
            phys.vy = 0;
            phys.isAirborne = false;
          } else {
            phys.isAirborne = true;
          }
        }

        // Soldier faces camera aim direction in TPS (like PUBG / COD Mobile / Fortnite)
        phys.yaw = camYaw;
        phys.pitch = camPitch;
        lastKnownRespawnYaw = camYaw;

        // Compute Exact 3D Crosshair Convergence Point from TPS Camera!
        const camDirX = Math.sin(camYaw) * Math.cos(camPitch);
        const camDirY = Math.sin(camPitch);
        const camDirZ = Math.cos(camYaw) * Math.cos(camPitch);

        const camWallHit = raycastArenaWorld(
          camera.position.x,
          camera.position.y,
          camera.position.z,
          camDirX,
          camDirY,
          camDirZ,
          130
        );
        const camMaxDist = camWallHit ? camWallHit.t : 130;
        const camTargetHit = raycastTargets(
          me.id,
          camera.position.x,
          camera.position.y,
          camera.position.z,
          camDirX,
          camDirY,
          camDirZ,
          camMaxDist
        );
        const aimT = Math.max(
          4.5,
          camTargetHit ? camTargetHit.t : camMaxDist
        );
        const aimPointX = camera.position.x + camDirX * aimT;
        const aimPointY = camera.position.y + camDirY * aimT;
        const aimPointZ = camera.position.z + camDirZ * aimT;

        // Right-shoulder muzzle world position (-X right offset + +Z forward barrel)
        const muzzleX = phys.x - cosY * 0.22 + sinY * 0.68;
        const muzzleY = phys.y + 1.38;
        const muzzleZ = phys.z + sinY * 0.22 + cosY * 0.68;

        const rawShotX = aimPointX - muzzleX;
        const rawShotY = aimPointY - muzzleY;
        const rawShotZ = aimPointZ - muzzleZ;
        const rawShotLen = Math.max(0.01, Math.hypot(rawShotX, rawShotY, rawShotZ));
        const shotDirX = rawShotX / rawShotLen;
        const shotDirY = rawShotY / rawShotLen;
        const shotDirZ = rawShotZ / rawShotLen;

        // Throw Frag Grenade
        if (commandsRef.current.grenadeRequested) {
          commandsRef.current.grenadeRequested = false;
          if (nowPerf >= grenadeReadyAt) {
            grenadeReadyAt = nowPerf + 7500;
            const gShot: CarbonShotPacket = {
              id: `gr_${me.id}_${nowEpoch.toString(36)}`,
              shooterId: me.id,
              weapon: "GRENADE",
              ox: muzzleX,
              oy: muzzleY + 0.1,
              oz: muzzleZ,
              dx: shotDirX,
              dy: shotDirY,
              dz: shotDirZ,
            };
            executeShotPacket(gShot, true);
            cbRef.current.onBroadcastShot(gShot);
          }
        }

        // Fire Weapon (Manual Fire Hold / Tap / PC Left-Click / Optional Mobile Auto-Fire on Target Lock)
        const wantsFire =
          lookIn.fireHeld ||
          lookIn.fireTap ||
          pcFireHeld ||
          (lookIn.autoFireAssist && Boolean(lockedTarget));
        lookIn.fireTap = false;

        if (wantsFire && reloadEndsAt === 0) {
          if (ammo <= 0) {
            reloadEndsAt = nowPerf + spec.reloadMs;
          } else if (nowPerf - lastFireAt >= spec.fireIntervalMs) {
            lastFireAt = nowPerf;
            ammo -= 1;
            me.lastFiredAt = nowEpoch;
            if (ammo <= 0) {
              reloadEndsAt = nowPerf + spec.reloadMs;
            }

            // Subtle crisp vertical gun kick
            camPitch = Math.min(0.62, camPitch + (currentWeaponTrack === "RAILGUN" ? 0.032 : 0.009));

            const shotPkt: CarbonShotPacket = {
              id: `sh_${me.id}_${nowEpoch.toString(36)}_${ammo}`,
              shooterId: me.id,
              weapon: currentWeaponTrack,
              ox: muzzleX,
              oy: muzzleY,
              oz: muzzleZ,
              dx: shotDirX,
              dy: shotDirY,
              dz: shotDirZ,
              overdrive: me.overdriveUntil > nowEpoch,
            };

            executeShotPacket(shotPkt, true);
            cbRef.current.onBroadcastShot(shotPkt);
            screenShakeRef.current = Math.max(
              screenShakeRef.current,
              currentWeaponTrack === "SHOTGUN" || currentWeaponTrack === "RAILGUN"
                ? 0.075
                : 0.025
            );
          }
        }

        cbRef.current.onLocalPosTick();
      }

      // --- B. REMOTE GUNFIRE & KILL BURST QUEUES ---
      while (remoteShotQueueRef.current.length > 0) {
        const rShot = remoteShotQueueRef.current.shift()!;
        executeShotPacket(rShot, false);
      }

      while (killBurstQueueRef.current.length > 0) {
        const kb = killBurstQueueRef.current.shift()!;
        spawnExplosionDome(kb.x, kb.y + 0.9, kb.z, 2.2, kb.colorHex);
      }

      // --- C. STEP BALLISTIC PROJECTILES & SPLASH EXPLOSIONS ---
      for (let i = liveProjectiles.length - 1; i >= 0; i--) {
        const pr = liveProjectiles[i];
        pr.vy -= pr.gravity * dt;

        const stepX = pr.vx * dt;
        const stepY = pr.vy * dt;
        const stepZ = pr.vz * dt;
        const stepDist = Math.max(0.0001, Math.hypot(stepX, stepY, stepZ));
        const ndx = stepX / stepDist;
        const ndy = stepY / stepDist;
        const ndz = stepZ / stepDist;

        const wallHit = raycastArenaWorld(pr.x, pr.y, pr.z, ndx, ndy, ndz, stepDist + 0.14);
        const tgtHit = raycastTargets(
          pr.shooterId,
          pr.x,
          pr.y,
          pr.z,
          ndx,
          ndy,
          ndz,
          wallHit ? wallHit.t : stepDist + 0.16
        );

        let shouldDetonate = false;
        let impactX = pr.x + stepX;
        let impactY = pr.y + stepY;
        let impactZ = pr.z + stepZ;

        if (tgtHit) {
          impactX = tgtHit.hx;
          impactY = tgtHit.hy;
          impactZ = tgtHit.hz;
          shouldDetonate = true;

          if (pr.isLocalOwner && pr.splashRadius <= 0) {
            if (tgtHit.kind === "BARREL") {
              carbonSfx.playHitmarker(true);
              lastHitAt = nowPerf;
              lastHitCrit = 1;
              cbRef.current.onClaimBarrelHit(tgtHit.barrel.id, pr.damage);
            } else {
              const dmg = Math.round(pr.damage * (tgtHit.isCrit ? pr.critMult : 1));
              carbonSfx.playHitmarker(tgtHit.isCrit);
              lastHitAt = nowPerf;
              lastHitCrit = tgtHit.isCrit ? 2 : 1;
              const targetRig = rigsMap.get(tgtHit.unit.id);
              if (targetRig) targetRig.shieldFlash = 1.0;

              const kb =
                pr.weapon === "GRENADE" ? 4 : CARBON_WEAPONS[pr.weapon].knockback;
              cbRef.current.onClaimHit({
                shooterId: pr.shooterId,
                targetId: tgtHit.unit.id,
                weapon: pr.weapon,
                damage: dmg,
                isCrit: tgtHit.isCrit,
                hx: impactX,
                hy: impactY,
                hz: impactZ,
                kx: ndx * kb,
                kz: ndz * kb,
              });
            }
          }
        } else if (wallHit) {
          impactX = wallHit.hx;
          impactY = wallHit.hy;
          impactZ = wallHit.hz;

          if (pr.bouncesLeft > 0) {
            pr.bouncesLeft -= 1;
            const dot = pr.vx * wallHit.nx + pr.vy * wallHit.ny + pr.vz * wallHit.nz;
            pr.vx = (pr.vx - 2 * dot * wallHit.nx) * 0.65;
            pr.vy = (pr.vy - 2 * dot * wallHit.ny) * 0.65;
            pr.vz = (pr.vz - 2 * dot * wallHit.nz) * 0.65;
            pr.x = impactX + wallHit.nx * 0.08;
            pr.y = impactY + wallHit.ny * 0.08;
            pr.z = impactZ + wallHit.nz * 0.08;
            pr.mesh.position.set(pr.x, pr.y, pr.z);
            continue;
          }
          shouldDetonate = true;
        }

        pr.distanceTraveled += stepDist;
        if (pr.distanceTraveled >= pr.maxRange) {
          shouldDetonate = true;
        }

        if (shouldDetonate) {
          if (pr.splashRadius > 0) {
            const splashColor = pr.weapon === "GRENADE" ? 0xf97316 : 0xc084fc;
            spawnExplosionDome(impactX, impactY, impactZ, pr.splashRadius, splashColor);
            carbonSfx.playExplosion();

            if (pr.isLocalOwner) {
              const shooter = combatantsRef.current[pr.shooterId];
              if (shooter) {
                for (const u of Object.values(combatantsRef.current)) {
                  if (!u.isAlive || !isHostile(shooter, u, modeRef.current)) continue;
                  const d = Math.hypot(
                    u.x - impactX,
                    u.y + 0.95 - impactY,
                    u.z - impactZ
                  );
                  if (d <= pr.splashRadius) {
                    const falloff = 1 - (d / pr.splashRadius) * 0.55;
                    const dmg = Math.max(12, Math.round(pr.damage * falloff));
                    carbonSfx.playHitmarker(false);
                    lastHitAt = nowPerf;
                    lastHitCrit = 1;
                    cbRef.current.onClaimHit({
                      shooterId: pr.shooterId,
                      targetId: u.id,
                      weapon: pr.weapon,
                      damage: dmg,
                      isCrit: false,
                      hx: u.x,
                      hy: u.y + 0.9,
                      hz: u.z,
                      kx: 0,
                      kz: 0,
                    });
                  }
                }
                for (const b of barrelsRef.current) {
                  if (!b.alive) continue;
                  if (Math.hypot(b.x - impactX, b.z - impactZ) <= pr.splashRadius + 0.6) {
                    cbRef.current.onClaimBarrelHit(b.id, pr.damage);
                  }
                }
              }
            }
          } else {
            spawnSparks(impactX, impactY, impactZ, 0xfef08a, 5, 5.2);
          }

          scene.remove(pr.mesh);
          liveProjectiles.splice(i, 1);
          continue;
        }

        pr.x = impactX;
        pr.y = impactY;
        pr.z = impactZ;
        pr.mesh.position.set(pr.x, pr.y, pr.z);
        if (pr.splashRadius > 0) {
          pr.mesh.rotation.x += dt * 10;
        } else {
          pr.mesh.lookAt(pr.x + pr.vx, pr.y + pr.vy, pr.z + pr.vz);
        }
      }

      // --- D. UPDATE TRANSIENT FX ---
      for (let i = transientFx.length - 1; i >= 0; i--) {
        const fx = transientFx[i];
        fx.life -= dt;
        if (fx.life <= 0) {
          scene.remove(fx.mesh);
          transientFx.splice(i, 1);
          continue;
        }
        fx.vy -= fx.gravity * dt;
        fx.mesh.position.x += fx.vx * dt;
        fx.mesh.position.y += fx.vy * dt;
        fx.mesh.position.z += fx.vz * dt;
        if (fx.scaleSpeed !== 0) {
          const nextS = Math.max(0.05, fx.mesh.scale.x + fx.scaleSpeed * dt);
          fx.mesh.scale.setScalar(nextS);
        }
        const m = (fx.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (m && m.transparent) {
          m.opacity = Math.max(0, (fx.life / fx.maxLife) * 0.85);
        }
      }

      // --- E. UPDATE ALL SOLDIER RIGS (60FPS INTERPOLATION) ---
      const activeIds = new Set<string>();
      for (const u of Object.values(combatantsRef.current)) {
        activeIds.add(u.id);
        const isMe = u.id === myIdRef.current;
        const desiredRole: HeroVisualRole = isMe
          ? "ME"
          : me && !isHostile(me, u, modeRef.current)
          ? "ALLY"
          : "ENEMY";

        let rig = rigsMap.get(u.id);
        if (!rig || rig.role !== desiredRole) {
          if (rig) {
            rig.disposed = true;
            scene.remove(rig.root);
          }
          rig = createStrikerRig(u.accentHex, u.archetype, u.weapon, desiredRole);
          rig.root.position.set(u.x, u.y, u.z);
          rig.root.rotation.y = u.yaw;
          scene.add(rig.root);
          rigsMap.set(u.id, rig);
        }

        const isSniperScoped = isMe && activeAds && currentWeaponTrack === "RAILGUN" && currentFov < 33;
        rig.root.visible = u.isAlive && !isSniperScoped;
        if (!u.isAlive) continue;

        let moveSpd = 0;
        let isAir = false;
        let isDash = false;
        let pitchVal = u.pitch || 0;

        if (isMe) {
          rig.root.position.set(phys.x, phys.y, phys.z);
          rig.root.rotation.y = phys.yaw;
          moveSpd = Math.hypot(phys.vx, phys.vz);
          isAir = phys.isAirborne;
          isDash = phys.isDashing;
          pitchVal = phys.pitch;
          rig.activeWeapon = currentWeaponTrack;
        } else {
          const peer = peersRef.current.get(u.id);
          let tx = u.x;
          let ty = u.y;
          let tz = u.z;
          let tyaw = u.yaw;

          if (peer && nowPerf - peer.t < 1100) {
            const age = Math.min(0.11, (nowPerf - peer.t) / 1000);
            tx = peer.x + peer.vx * age;
            ty = peer.y;
            tz = peer.z + peer.vz * age;
            tyaw = peer.yw;
            pitchVal = peer.pt;
            moveSpd = Math.hypot(peer.vx, peer.vz);
            isDash = peer.d === 1;
            isAir = peer.ab === 1;
            rig.activeWeapon = peer.w;
          } else {
            rig.activeWeapon = u.weapon;
          }

          const distErr = Math.hypot(tx - rig.root.position.x, tz - rig.root.position.z);
          if (distErr > 8.0) {
            // Snap if soldier teleported on respawn
            rig.root.position.set(tx, ty, tz);
          } else {
            const k = Math.min(1, dt * 15);
            rig.root.position.x += (tx - rig.root.position.x) * k;
            rig.root.position.y += (ty - rig.root.position.y) * k;
            rig.root.position.z += (tz - rig.root.position.z) * k;
          }

          let diff = tyaw - rig.root.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          rig.root.rotation.y += diff * Math.min(1, dt * 16);
        }

        const shieldRatio = u.shield / Math.max(1, u.maxShield);
        updateStrikerRig(rig, dt, elapsedSec, moveSpd, isAir, isDash, pitchVal, shieldRatio);
        syncStrikerHudPlate(
          rig,
          u.nickname,
          u.hp,
          u.maxHp,
          u.shield,
          u.maxShield,
          u.overdriveUntil > nowEpoch,
          u.gems || 0
        );
      }

      for (const [id, rig] of rigsMap.entries()) {
        if (!activeIds.has(id)) {
          rig.disposed = true;
          scene.remove(rig.root);
          rigsMap.delete(id);
        }
      }

      // --- F. OVER-THE-SHOULDER RIGHT-SHOULDER TPS CAMERA + ADS ZOOM + SPRING-ARM COLLISION ---
      const isPortrait = camera.aspect < 1;
      const isSniperAds = activeAds && currentWeaponTrack === "RAILGUN";
      const baseFov = computeBaseFov(camera.aspect);
      const targetFov = isSniperAds ? 24 : activeAds ? 40 : baseFov;
      if (Math.abs(targetFov - currentFov) > 0.05) {
        currentFov += (targetFov - currentFov) * Math.min(1, dt * 14);
        camera.fov = currentFov;
        camera.updateProjectionMatrix();
      }

      const targetArmDist = isSniperAds
        ? 1.15
        : activeAds
        ? 2.15
        : isPortrait
        ? 4.35
        : 3.75;
      const targetRightOff = isSniperAds ? 0.36 : activeAds ? 0.54 : 0.68;
      smoothArmDist += (targetArmDist - smoothArmDist) * Math.min(1, dt * 14);
      smoothRightOff += (targetRightOff - smoothRightOff) * Math.min(1, dt * 14);

      const sinYaw = Math.sin(camYaw);
      const cosYaw = Math.cos(camYaw);
      const cosPitch = Math.cos(camPitch);
      const sinPitch = Math.sin(camPitch);

      // Right vector = (-cos(camYaw), 0, sin(camYaw)) -> places soldier cleanly on LEFT third!
      const pivotX = phys.x - cosYaw * smoothRightOff;
      const pivotY = phys.y + EYE_HEIGHT + 0.14;
      const pivotZ = phys.z + sinYaw * smoothRightOff;

      const lookFwdX = sinYaw * cosPitch;
      const lookFwdY = sinPitch;
      const lookFwdZ = cosYaw * cosPitch;

      const desiredCamX = pivotX - lookFwdX * smoothArmDist;
      const desiredCamY = Math.max(0.45, pivotY - lookFwdY * smoothArmDist + 0.22);
      const desiredCamZ = pivotZ - lookFwdZ * smoothArmDist;

      // Spring-arm wall raycast from player head center to desired camera position
      const headCenterX = phys.x;
      const headCenterY = phys.y + EYE_HEIGHT;
      const headCenterZ = phys.z;
      const armVecX = desiredCamX - headCenterX;
      const armVecY = desiredCamY - headCenterY;
      const armVecZ = desiredCamZ - headCenterZ;
      const armVecLen = Math.max(0.01, Math.hypot(armVecX, armVecY, armVecZ));

      const springHit = raycastArenaWorld(
        headCenterX,
        headCenterY,
        headCenterZ,
        armVecX / armVecLen,
        armVecY / armVecLen,
        armVecZ / armVecLen,
        armVecLen
      );

      const safeLen = springHit ? Math.max(0.7, springHit.t - 0.28) : armVecLen;
      let finalCamX = headCenterX + (armVecX / armVecLen) * safeLen;
      let finalCamY = Math.max(0.42, headCenterY + (armVecY / armVecLen) * safeLen);
      let finalCamZ = headCenterZ + (armVecZ / armVecLen) * safeLen;

      if (screenShakeRef.current > 0.002) {
        const sh = screenShakeRef.current;
        finalCamX += (Math.random() - 0.5) * sh;
        finalCamY += (Math.random() - 0.5) * sh * 0.7;
        finalCamZ += (Math.random() - 0.5) * sh;
        screenShakeRef.current = Math.max(0, sh - dt * 1.4);
      }

      camera.position.set(finalCamX, finalCamY, finalCamZ);
      camera.lookAt(
        finalCamX + lookFwdX * 25,
        finalCamY + lookFwdY * 25,
        finalCamZ + lookFwdZ * 25
      );

      // Keep shadow frustum centered around player so nearby containers, Kasbah & soldiers cast razor-sharp shadows!
      sunLight.position.set(phys.x + 30, 56, phys.z + 24);
      sunLight.target.position.set(phys.x, phys.y, phys.z);
      sunLight.target.updateMatrixWorld();

      // Emit HUD weapon & target-lock state @ ~12Hz
      if (nowPerf - lastHudEmitAt >= 80) {
        lastHudEmitAt = nowPerf;
        const curSpec = CARBON_WEAPONS[currentWeaponTrack];
        cbRef.current.onHudWeaponUpdate({
          weapon: currentWeaponTrack,
          secondaryWeapon: me?.secondaryWeapon ?? null,
          ammo,
          maxAmmo: curSpec.magSize,
          isReloading: reloadEndsAt > nowPerf,
          dashCooldownLeft: Math.max(0, (dashReadyAt - nowPerf) / 1000),
          grenadeCooldownLeft: Math.max(0, (grenadeReadyAt - nowPerf) / 1000),
          hasTargetLock: Boolean(lockedTarget),
          isAdsActive: activeAds,
          pointerLocked: isPointerLocked,
          lastHitIsCrit: nowPerf - lastHitAt < 220 ? lastHitCrit : 0,
          lastHitAt,
        });
      }

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mouseup", onWindowMouseUp);
      window.removeEventListener("mousemove", onWindowMouseMove);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("mousedown", onCanvasMouseDown);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      for (const rig of rigsMap.values()) {
        rig.disposed = true;
      }
      envTex.dispose();
      renderer.dispose();
    };
  }, [
    combatantsRef,
    pickupsRef,
    barrelsRef,
    gemsRef,
    hardpointIndexRef,
    peersRef,
    coreOwnerRef,
    localPhysRef,
    moveStickRef,
    lookInputRef,
    commandsRef,
    remoteShotQueueRef,
    barrelBoomQueueRef,
    killBurstQueueRef,
    screenShakeRef,
  ]);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full touch-none" />;
}
