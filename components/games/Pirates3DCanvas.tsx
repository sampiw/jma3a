"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader, GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  angleDelta,
  applyLookDrag,
  cameraRelativeMove,
  damp,
  facingFromDirection,
} from "@/components/games/ghammada/controlsMath";
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

export interface PiratesLocalTransform {
  x: number;
  z: number;
  rotY: number;
  camYaw: number;
  camPitch: number;
  aimYaw: number;
  lockedTargetId: string | null;
  targetWorldX: number;
  targetWorldZ: number;
  isMoving: boolean;
}

export interface PiratesLivePacket {
  i: string;
  x: number;
  z: number;
  r: number;
  m?: boolean;
  t: number;
}

export interface PiratesFxEvent {
  k: "cannon" | "triple" | "boost";
  i: string;
  fx: number;
  fz: number;
  tx: number;
  tz: number;
  hit?: boolean;
}

interface Pirates3DCanvasProps {
  myShipId: string;
  ships: Record<string, PirateShipState>;
  lootCrates: SeaLootCrate[];
  recentShots: CannonShotRecord[];
  localPosRef: React.MutableRefObject<PiratesLocalTransform>;
  joystickVecRef: React.MutableRefObject<{ dx: number; dz: number }>;
  peersRef?: React.MutableRefObject<Map<string, PiratesLivePacket>>;
  fxQueueRef?: React.MutableRefObject<PiratesFxEvent[]>;
  onPositionTick?: (x: number, z: number, rotY: number, isMoving: boolean) => void;
  onLockedTargetChange?: (targetId: string | null) => void;
  onTapFire?: (aimYaw: number, targetX: number, targetZ: number, targetId?: string) => void;
}

const PIRATE_GLB_URLS = {
  shipPirateLarge: "/models/pirates/ship-pirate-large.glb",
  shipPirateMedium: "/models/pirates/ship-pirate-medium.glb",
  shipLarge: "/models/pirates/ship-large.glb",
  shipGhost: "/models/pirates/ship-ghost.glb",
  shipWreck: "/models/pirates/ship-wreck.glb",
  cannonMobile: "/models/pirates/cannon-mobile.glb",
  cannon: "/models/pirates/cannon.glb",
  cannonBall: "/models/pirates/cannon-ball.glb",
  chest: "/models/pirates/chest.glb",
  barrel: "/models/pirates/barrel.glb",
  crateBottles: "/models/pirates/crate-bottles.glb",
  towerLarge: "/models/pirates/tower-complete-large.glb",
  towerSmall: "/models/pirates/tower-complete-small.glb",
  towerWatch: "/models/pirates/tower-watch.glb",
  palmBend: "/models/pirates/palm-detailed-bend.glb",
  palmStraight: "/models/pirates/palm-detailed-straight.glb",
  rocksA: "/models/pirates/rocks-sand-a.glb",
  rocksB: "/models/pirates/rocks-sand-b.glb",
  rocksC: "/models/pirates/rocks-sand-c.glb",
  patchSand: "/models/pirates/patch-sand-foliage.glb",
  hunter: "/models/hunter.glb",
} as const;

type PirateAssetKey = keyof typeof PIRATE_GLB_URLS;

interface LoadedPirateAssets {
  models: Partial<Record<PirateAssetKey, THREE.Object3D>>;
  hunterGltf: GLTF | null;
}

let cachedPirateAssetsPromise: Promise<LoadedPirateAssets> | null = null;

function enableShadows(obj: THREE.Object3D, cast = true, receive = true) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.frustumCulled = false;
    }
  });
}

function normalizeAndCenterModel(
  source: THREE.Object3D,
  targetSpan: number,
  useHeight = true
): THREE.Object3D {
  const wrapper = new THREE.Group();
  const clone = source.clone(true);
  const box = new THREE.Box3().setFromObject(clone);
  const size = new THREE.Vector3();
  box.getSize(size);
  const refDim = useHeight ? size.y : Math.max(size.x, size.z);
  const scale = refDim > 1e-4 ? targetSpan / refDim : 1;
  clone.scale.multiplyScalar(scale);

  const scaledBox = new THREE.Box3().setFromObject(clone);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  clone.position.x -= center.x;
  clone.position.z -= center.z;
  clone.position.y -= scaledBox.min.y;

  enableShadows(clone);
  wrapper.add(clone);
  return wrapper;
}

function loadPirateAssets(
  onProgress?: (ratio: number) => void
): Promise<LoadedPirateAssets> {
  if (cachedPirateAssetsPromise) {
    onProgress?.(1);
    return cachedPirateAssetsPromise;
  }

  const loader = new GLTFLoader();
  const entries = Object.entries(PIRATE_GLB_URLS) as Array<[PirateAssetKey, string]>;
  let completed = 0;

  cachedPirateAssetsPromise = Promise.all(
    entries.map(
      ([key, url]) =>
        new Promise<{ key: PirateAssetKey; gltf: GLTF | null }>((resolve) => {
          loader.load(
            url,
            (gltf) => {
              completed++;
              onProgress?.(completed / entries.length);
              resolve({ key, gltf });
            },
            undefined,
            () => {
              completed++;
              onProgress?.(completed / entries.length);
              resolve({ key, gltf: null });
            }
          );
        })
    )
  ).then((results) => {
    const out: LoadedPirateAssets = { models: {}, hunterGltf: null };
    for (const { key, gltf } of results) {
      if (!gltf) continue;
      if (key === "hunter") {
        out.hunterGltf = gltf;
      } else {
        out.models[key] = gltf.scene;
      }
    }
    return out;
  });

  return cachedPirateAssetsPromise;
}

function waveHeightAt(x: number, z: number, timeSec: number): number {
  return (
    Math.sin(x * 0.2 + timeSec * 2.2) * 0.18 +
    Math.cos(z * 0.18 + timeSec * 1.8) * 0.15 +
    Math.sin((x + z) * 0.12 - timeSec * 1.4) * 0.1
  );
}

/**
 * Generates high-resolution ocean caustics & sky textures
 */
function createOceanCausticTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, "#0284c7");
  grad.addColorStop(0.5, "#0ea5e9");
  grad.addColorStop(1, "#0369a1");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Bright turquoise caustic ripples
  ctx.strokeStyle = "rgba(186, 230, 253, 0.35)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 42; i++) {
    const cx = (i * 89) % 512;
    const cy = (i * 137) % 512;
    ctx.beginPath();
    ctx.arc(cx, cy, 22 + (i % 5) * 8, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 28; i++) {
    const cx = (i * 113 + 40) % 512;
    const cy = (i * 79 + 60) % 512;
    ctx.beginPath();
    ctx.arc(cx, cy, 14 + (i % 4) * 6, Math.PI + 0.2, Math.PI * 2 - 0.2);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.anisotropy = 4;
  return tex;
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

  ctx.fillStyle = isLockedTarget
    ? "rgba(159, 18, 57, 0.94)"
    : isMe
    ? "rgba(15, 23, 42, 0.92)"
    : "rgba(15, 23, 42, 0.84)";
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

  ctx.font = "900 22px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const prefix = isLockedTarget ? "🎯 " : `${style.emblem} `;
  ctx.fillText(`${prefix}${ship.nickname.slice(0, 14)}`, 128, 30);

  // HP Bar
  ctx.fillStyle = "rgba(30, 41, 59, 0.95)";
  ctx.fillRect(24, 50, 208, 12);

  const hpPct = Math.max(0, Math.min(1, ship.hp / Math.max(1, ship.maxHp)));
  ctx.fillStyle =
    hpPct > 0.5 ? "#22c55e" : hpPct > 0.25 ? "#f59e0b" : "#ef4444";
  ctx.fillRect(24, 50, Math.round(208 * hpPct), 12);

  if (ship.shield > 0) {
    const shPct = Math.max(0, Math.min(1, ship.shield / 80));
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(24, 65, Math.round(208 * shPct), 6);
  }
}

export default function Pirates3DCanvas({
  myShipId,
  ships,
  lootCrates,
  recentShots,
  localPosRef,
  joystickVecRef,
  peersRef,
  fxQueueRef,
  onPositionTick,
  onLockedTargetChange,
  onTapFire,
}: Pirates3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadProgress, setLoadProgress] = useState<number>(0);

  const propsRef = useRef({
    myShipId,
    ships,
    lootCrates,
    recentShots,
    onPositionTick,
    onLockedTargetChange,
    onTapFire,
  });
  propsRef.current = {
    myShipId,
    ships,
    lootCrates,
    recentShots,
    onPositionTick,
    onLockedTargetChange,
    onTapFire,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;

    // 1. Scene, Sky & Filmic Renderer with RoomEnvironment IBL!
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0ea5e9);
    scene.fog = new THREE.FogExp2(0x0ea5e9, 0.0048);

    const initAspect =
      container.clientWidth / Math.max(1, container.clientHeight);
    const computeFov = (aspect: number) =>
      aspect < 1 ? Math.min(74, 54 / Math.max(0.58, aspect)) : 54;

    const camera = new THREE.PerspectiveCamera(
      computeFov(initAspect),
      initAspect,
      0.2,
      240
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
    renderer.toneMappingExposure = 1.2;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // 2. Bright Golden-Hour Mediterranean/Atlantic Lighting
    const hemiLight = new THREE.HemisphereLight(0xfffbeb, 0x0284c7, 1.25);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff7ed, 2.1);
    sunLight.position.set(36, 58, 32);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 150;
    const dBound = 58;
    sunLight.shadow.camera.left = -dBound;
    sunLight.shadow.camera.right = dBound;
    sunLight.shadow.camera.top = dBound;
    sunLight.shadow.camera.bottom = -dBound;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // 3. Animated Shimmering 3D Ocean Mesh
    const oceanTex = createOceanCausticTexture();
    const oceanGeo = new THREE.PlaneGeometry(190, 190, 60, 60);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanBasePos = Float32Array.from(
      oceanGeo.attributes.position.array as ArrayLike<number>
    );
    const oceanMat = new THREE.MeshStandardMaterial({
      map: oceanTex,
      roughness: 0.14,
      metalness: 0.32,
    });
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.receiveShadow = true;
    scene.add(oceanMesh);

    // Arena Boundary Buoy Ring
    const boundaryRing = new THREE.Mesh(
      new THREE.RingGeometry(SEA_ARENA_RADIUS - 0.4, SEA_ARENA_RADIUS + 0.6, 64),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      })
    );
    boundaryRing.rotation.x = -Math.PI / 2;
    boundaryRing.position.y = 0.25;
    scene.add(boundaryRing);

    const islandsGroup = new THREE.Group();
    scene.add(islandsGroup);

    const shipsGroup = new THREE.Group();
    scene.add(shipsGroup);

    const cratesGroup = new THREE.Group();
    scene.add(cratesGroup);

    const fxGroup = new THREE.Group();
    scene.add(fxGroup);

    // 4. Local Player Halo Ring + Viewport Aiming Beam + Parabolic Cannon Arc + Auto-Lock Ring
    const myShipHalo = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.1, 36),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
      })
    );
    myShipHalo.rotation.x = -Math.PI / 2;
    myShipHalo.position.y = 0.2;
    scene.add(myShipHalo);

    // Parabolic 3D Trajectory Ribbon/Line
    const aimPointsCount = 26;
    const aimPositions = new Float32Array(aimPointsCount * 3);
    const aimGeo = new THREE.BufferGeometry();
    aimGeo.setAttribute("position", new THREE.BufferAttribute(aimPositions, 3));
    const aimMat = new THREE.LineBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.95,
    });
    const aimArcLine = new THREE.Line(aimGeo, aimMat);
    scene.add(aimArcLine);

    // 3D Target Reticle & Lock-On Crosshair on Water / Locked Enemy Ship
    const lockRingGroup = new THREE.Group();
    const lockOuter = new THREE.Mesh(
      new THREE.RingGeometry(2.3, 2.85, 32),
      new THREE.MeshBasicMaterial({
        color: 0x10b981,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      })
    );
    lockOuter.rotation.x = -Math.PI / 2;
    lockRingGroup.add(lockOuter);

    const lockInner = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.35, 4),
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      })
    );
    lockInner.rotation.x = -Math.PI / 2;
    lockInner.position.y = 0.05;
    lockRingGroup.add(lockInner);

    const lockOverheadCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.65, 1.3, 6),
      new THREE.MeshBasicMaterial({ color: 0xf43f5e })
    );
    lockOverheadCone.rotation.x = Math.PI;
    lockOverheadCone.position.y = 7.8;
    lockOverheadCone.visible = false;
    lockRingGroup.add(lockOverheadCone);
    scene.add(lockRingGroup);

    // 5. Load Kenney CC0 Pirate Kit GLBs + Hunter Captain GLB
    let loadedAssets: LoadedPirateAssets | null = null;
    let assetsVersion = 0;
    const islandSurfRings: THREE.Mesh[] = [];

    const rebuildIslands = (assets: LoadedPirateAssets | null) => {
      islandsGroup.clear();
      islandSurfRings.length = 0;

      for (const isl of PIRATES_ISLANDS) {
        const g = new THREE.Group();
        g.position.set(isl.x, 0, isl.z);

        // Animated surf foam ring around every island
        const surfRing = new THREE.Mesh(
          new THREE.RingGeometry(isl.radius * 0.95, isl.radius * 1.2, 36),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
          })
        );
        surfRing.rotation.x = -Math.PI / 2;
        surfRing.position.y = 0.12;
        g.add(surfRing);
        islandSurfRings.push(surfRing);

        // Sandy Island Base
        if (assets?.models.patchSand) {
          const sandPatch = normalizeAndCenterModel(
            assets.models.patchSand,
            isl.radius * 2.15,
            false
          );
          sandPatch.position.y = -0.15;
          g.add(sandPatch);
        } else {
          const fallbackMound = new THREE.Mesh(
            new THREE.CylinderGeometry(isl.radius * 0.8, isl.radius, 1.6, 24),
            new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.8 })
          );
          fallbackMound.position.y = 0.5;
          g.add(fallbackMound);
        }

        // Fortress Towers / Lighthouses / Rocks & Palm Trees from GLB!
        if (isl.kind === "FORTRESS") {
          if (assets?.models.towerLarge) {
            const centerKeep = normalizeAndCenterModel(
              assets.models.towerLarge,
              9.5,
              true
            );
            centerKeep.position.y = 0.6;
            g.add(centerKeep);
          }
          for (let i = 0; i < 4; i++) {
            const ang = (i * Math.PI) / 2 + Math.PI / 4;
            const r = isl.radius * 0.56;
            if (assets?.models.towerSmall) {
              const bastion = normalizeAndCenterModel(
                assets.models.towerSmall,
                5.8,
                true
              );
              bastion.position.set(Math.cos(ang) * r, 0.5, Math.sin(ang) * r);
              g.add(bastion);
            }
            if (assets?.models.cannon) {
              const fortCannon = normalizeAndCenterModel(
                assets.models.cannon,
                1.3,
                true
              );
              fortCannon.position.set(
                Math.cos(ang) * (r + 1.4),
                0.7,
                Math.sin(ang) * (r + 1.4)
              );
              fortCannon.rotation.y = Math.atan2(Math.sin(ang), Math.cos(ang));
              g.add(fortCannon);
            }
          }
        } else if (isl.kind === "LIGHTHOUSE") {
          if (assets?.models.towerWatch) {
            const watch = normalizeAndCenterModel(
              assets.models.towerWatch,
              7.8,
              true
            );
            watch.position.y = 0.5;
            g.add(watch);
          }
        } else {
          if (assets?.models.rocksA) {
            const rock = normalizeAndCenterModel(
              assets.models.rocksA,
              4.2,
              true
            );
            rock.position.y = 0.3;
            g.add(rock);
          }
          if (assets?.models.chest) {
            const islandChest = normalizeAndCenterModel(
              assets.models.chest,
              1.6,
              true
            );
            islandChest.position.set(0, 1.1, 1.2);
            g.add(islandChest);
          }
        }

        // Palm trees & coastal rocks around the beach
        const palmModels = [
          assets?.models.palmBend,
          assets?.models.palmStraight,
        ].filter(Boolean) as THREE.Object3D[];
        const palmCount = isl.kind === "FORTRESS" ? 4 : 3;
        for (let p = 0; p < palmCount; p++) {
          const pang = (p / palmCount) * Math.PI * 2 + 0.5;
          const pr = isl.radius * 0.68;
          if (palmModels.length > 0) {
            const palm = normalizeAndCenterModel(
              palmModels[p % palmModels.length],
              4.6,
              true
            );
            palm.position.set(Math.cos(pang) * pr, 0.45, Math.sin(pang) * pr);
            palm.rotation.y = pang;
            g.add(palm);
          }
        }

        islandsGroup.add(g);
      }
    };

    rebuildIslands(null);

    loadPirateAssets((ratio) => {
      if (!disposed) setLoadProgress(ratio);
    }).then((assets) => {
      if (disposed) return;
      loadedAssets = assets;
      assetsVersion++;
      rebuildIslands(assets);
    });

    // 6. Ship Registry with Real GLB Galleons + Animated Captain + Swivel Cannon
    interface ShipVisualEntry {
      root: THREE.Group;
      hullPivot: THREE.Group;
      aliveVisual: THREE.Group;
      wreckVisual: THREE.Group;
      turretPivot: THREE.Group;
      captainMixer: THREE.AnimationMixer | null;
      captainActions: Record<string, THREE.AnimationAction>;
      badgeCanvas: HTMLCanvasElement;
      badgeTex: THREE.CanvasTexture;
      badgeSprite: THREE.Sprite;
      ver: number;
      currX: number;
      currZ: number;
      currYaw: number;
      recoilRoll: number;
      lastBadgeHash: string;
      wakeTimer: number;
    }

    const shipNodes = new Map<string, ShipVisualEntry>();
    const crateNodes = new Map<string, { group: THREE.Group; ver: number }>();
    const seenShotIds = new Set<string>();

    const buildShipVisual = (
      styleIndex: number,
      style: CorsairStyleDef
    ): Omit<
      ShipVisualEntry,
      | "ver"
      | "currX"
      | "currZ"
      | "currYaw"
      | "recoilRoll"
      | "lastBadgeHash"
      | "wakeTimer"
    > => {
      const root = new THREE.Group();
      const hullPivot = new THREE.Group();
      root.add(hullPivot);

      const aliveVisual = new THREE.Group();
      const wreckVisual = new THREE.Group();
      wreckVisual.visible = false;
      hullPivot.add(aliveVisual);
      hullPivot.add(wreckVisual);

      // Choose one of the real Kenney Pirate Ship GLBs
      const shipKeys: PirateAssetKey[] = [
        "shipPirateLarge",
        "shipPirateMedium",
        "shipLarge",
        "shipGhost",
      ];
      const chosenKey = shipKeys[styleIndex % shipKeys.length];
      const shipSrc =
        loadedAssets?.models[chosenKey] ||
        loadedAssets?.models.shipPirateLarge;

      if (shipSrc) {
        const shipMesh = normalizeAndCenterModel(shipSrc, 7.2, false);
        shipMesh.position.y = -0.35;

        // Tint flag/sail accents slightly per faction while keeping original colormap texture
        const factionColor = new THREE.Color(style.trimColor);
        shipMesh.traverse((child) => {
          const m = child as THREE.Mesh;
          if (m.isMesh && m.name.includes("flag")) {
            const clonedMat = (m.material as THREE.MeshStandardMaterial).clone();
            clonedMat.color.lerp(factionColor, 0.55);
            m.material = clonedMat;
          }
        });

        aliveVisual.add(shipMesh);
      } else {
        // Fallback while GLB finishes loading
        const fallbackHull = new THREE.Mesh(
          new THREE.BoxGeometry(2.4, 1.2, 6.2),
          new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.6 })
        );
        fallbackHull.position.y = 0.6;
        aliveVisual.add(fallbackHull);
      }

      // Shipwreck GLB when sunk!
      if (loadedAssets?.models.shipWreck) {
        const wreckMesh = normalizeAndCenterModel(
          loadedAssets.models.shipWreck,
          6.8,
          false
        );
        wreckMesh.position.y = -0.6;
        wreckVisual.add(wreckMesh);
      }

      // Swivel Bow Cannon Turret (`cannon-mobile.glb`)
      const turretPivot = new THREE.Group();
      turretPivot.position.set(0, 1.05, 1.45);
      aliveVisual.add(turretPivot);
      if (loadedAssets?.models.cannonMobile) {
        const cannonMesh = normalizeAndCenterModel(
          loadedAssets.models.cannonMobile,
          1.35,
          false
        );
        turretPivot.add(cannonMesh);
      }

      // Animated 3D Corsair Captain (`hunter.glb` with Moroccan Fez) on the Quarterdeck!
      let captainMixer: THREE.AnimationMixer | null = null;
      const captainActions: Record<string, THREE.AnimationAction> = {};
      if (loadedAssets?.hunterGltf) {
        loadedAssets.hunterGltf.scene.updateMatrixWorld(true);
        const captainClone = SkeletonUtils.clone(
          loadedAssets.hunterGltf.scene
        );
        captainClone.scale.setScalar(1.35 / 4.79);
        captainClone.position.set(0, 1.15, -1.55);

        const coatColor = new THREE.Color(style.sailSecondary);
        captainClone.traverse((c) => {
          const mesh = c as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.frustumCulled = false;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (mat && "color" in mat) {
              const m = mat.clone();
              if ((m.name || "").toLowerCase().includes("main")) {
                m.color.copy(coatColor);
              }
              mesh.material = m;
            }
          }
        });
        aliveVisual.add(captainClone);

        // Moroccan Red Fez on the Captain
        const fez = new THREE.Mesh(
          new THREE.CylinderGeometry(0.13, 0.16, 0.22, 16),
          new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 })
        );
        fez.position.set(0, 2.55, -1.55);
        aliveVisual.add(fez);

        captainMixer = new THREE.AnimationMixer(captainClone);
        for (const clip of loadedAssets.hunterGltf.animations) {
          captainActions[clip.name] = captainMixer.clipAction(clip);
        }
        captainActions["Idle"]?.play();
      }

      // Overhead Nameplate + HP/Shield Sprite
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
      badgeSprite.scale.set(4.4, 1.65, 1);
      badgeSprite.position.set(0, 6.4, 0);
      root.add(badgeSprite);

      return {
        root,
        hullPivot,
        aliveVisual,
        wreckVisual,
        turretPivot,
        captainMixer,
        captainActions,
        badgeCanvas,
        badgeTex,
        badgeSprite,
      };
    };

    // 7. Cannonballs, Wake Foam Rings & Explosions
    interface FlyingCannonball {
      group: THREE.Group;
      fromX: number;
      fromZ: number;
      toX: number;
      toZ: number;
      progress: number;
      duration: number;
      peakHeight: number;
      hitShip: boolean;
    }
    const activeCannonballs: FlyingCannonball[] = [];

    interface SplashOrWake {
      ring: THREE.Mesh;
      particles: Array<{
        mesh: THREE.Mesh;
        vx: number;
        vy: number;
        vz: number;
      }>;
      age: number;
      maxAge: number;
    }
    const activeEffects: SplashOrWake[] = [];
    let cameraShake = 0;

    const spawnWakeRing = (x: number, z: number) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.95, 20),
        new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.14, z);
      fxGroup.add(ring);
      activeEffects.push({
        ring,
        particles: [],
        age: 0,
        maxAge: 0.9,
      });
    };

    const spawnImpactExplosion = (x: number, z: number, isHit: boolean) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 1.3, 28),
        new THREE.MeshBasicMaterial({
          color: isHit ? 0xf97316 : 0xffffff,
          transparent: true,
          opacity: 0.95,
          side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.25, z);
      fxGroup.add(ring);

      const particles: SplashOrWake["particles"] = [];
      const count = isHit ? 18 : 12;
      const geo = new THREE.DodecahedronGeometry(isHit ? 0.26 : 0.2, 0);

      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + Math.random() * 0.3;
        const spd = (isHit ? 5.5 : 3.5) + Math.random() * 3.0;
        const pMesh = new THREE.Mesh(
          geo,
          new THREE.MeshBasicMaterial({
            color: isHit
              ? i % 2 === 0
                ? 0xfef08a
                : 0xea580c
              : 0xe0f2fe,
            transparent: true,
            opacity: 1,
          })
        );
        pMesh.position.set(x, 0.6, z);
        fxGroup.add(pMesh);
        particles.push({
          mesh: pMesh,
          vx: Math.cos(ang) * spd,
          vy: (isHit ? 8.5 : 6.8) + Math.random() * 3.0,
          vz: Math.sin(ang) * spd,
        });
      }

      activeEffects.push({
        ring,
        particles,
        age: 0,
        maxAge: isHit ? 0.8 : 0.65,
      });

      if (isHit) {
        cameraShake = 0.35;
      }
    };

    const spawnCannonballFlight = (
      fromX: number,
      fromZ: number,
      toX: number,
      toZ: number,
      hitShip: boolean
    ) => {
      const g = new THREE.Group();
      if (loadedAssets?.models.cannonBall) {
        const cb = normalizeAndCenterModel(
          loadedAssets.models.cannonBall,
          0.65,
          true
        );
        g.add(cb);
      } else {
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 12, 12),
          new THREE.MeshStandardMaterial({
            color: 0x18181b,
            metalness: 0.85,
            roughness: 0.2,
          })
        );
        g.add(sphere);
      }

      // Glowing tracer core
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.55,
        })
      );
      g.add(glow);

      g.position.set(fromX, 1.6, fromZ);
      fxGroup.add(g);

      const dist = Math.hypot(toX - fromX, toZ - fromZ);
      activeCannonballs.push({
        group: g,
        fromX,
        fromZ,
        toX,
        toZ,
        progress: 0,
        duration: Math.min(0.58, Math.max(0.25, dist * 0.014)),
        peakHeight: Math.min(6.8, Math.max(2.2, dist * 0.16)),
        hitShip,
      });
    };

    // 8. Smooth Independent Camera Orbit Drag + Tap-to-Fire (Just like Sandala3DArena!)
    let lookPointerId: number | null = null;
    let lastLookX = 0;
    let lastLookY = 0;
    let lookDragDist = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (lookPointerId !== null) return;
      lookPointerId = e.pointerId;
      lastLookX = e.clientX;
      lastLookY = e.clientY;
      lookDragDist = 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== lookPointerId) return;
      const dx = e.clientX - lastLookX;
      const dy = e.clientY - lastLookY;
      lastLookX = e.clientX;
      lastLookY = e.clientY;
      lookDragDist += Math.hypot(dx, dy);

      const next = applyLookDrag(
        localPosRef.current.camYaw,
        localPosRef.current.camPitch,
        dx,
        dy
      );
      localPosRef.current.camYaw = next.yaw;
      localPosRef.current.camPitch = Math.max(0.28, Math.min(0.95, next.pitch));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== lookPointerId) return;
      const wasTap = lookDragDist < 10;
      lookPointerId = null;

      // Quick tap on an enemy ship or water fires directly along your aim!
      if (wasTap && propsRef.current.onTapFire) {
        const lp = localPosRef.current;
        propsRef.current.onTapFire(
          lp.aimYaw,
          lp.targetWorldX,
          lp.targetWorldZ,
          lp.lockedTargetId ?? undefined
        );
      }
    };

    // Keyboard WASD / Arrow Keys Support
    const keysPressed = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => keysPressed.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => keysPressed.delete(e.code);

    const domEl = renderer.domElement;
    domEl.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      const asp = w / h;
      camera.fov = computeFov(asp);
      camera.aspect = asp;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // 9. Main 60FPS Render & Physics Loop
    let animId = 0;
    let lastTime = performance.now();
    let prevLockedId: string | null = null;

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
        onPositionTick: tickCb,
        onLockedTargetChange: lockCb,
      } = propsRef.current;

      // A. Animate Ocean Waves & Island Surf Rings
      oceanTex.offset.x = (timeSec * 0.035) % 1;
      oceanTex.offset.y = (timeSec * 0.025) % 1;
      const posAttr = oceanGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const bx = oceanBasePos[i * 3];
        const bz = oceanBasePos[i * 3 + 2];
        posAttr.setY(i, waveHeightAt(bx, bz, timeSec) * 0.55);
      }
      posAttr.needsUpdate = true;

      for (const sr of islandSurfRings) {
        const sc = 1 + Math.sin(timeSec * 2.5) * 0.04;
        sr.scale.set(sc, sc, 1);
      }

      // B. Process Live FX Queue & Server Cannon Shots
      if (fxQueueRef?.current && fxQueueRef.current.length > 0) {
        while (fxQueueRef.current.length > 0) {
          const ev = fxQueueRef.current.shift()!;
          if (ev.k === "triple") {
            for (const off of [-1.8, 0, 1.8]) {
              spawnCannonballFlight(
                ev.fx,
                ev.fz,
                ev.tx + off,
                ev.tz + off,
                Boolean(ev.hit)
              );
            }
          } else if (ev.k === "cannon") {
            spawnCannonballFlight(
              ev.fx,
              ev.fz,
              ev.tx,
              ev.tz,
              Boolean(ev.hit)
            );
          }
        }
      }

      for (const shot of curShots) {
        if (!seenShotIds.has(shot.id)) {
          seenShotIds.add(shot.id);
          const hasHit = shot.hitShipIds.length > 0;
          if (shot.mode === "TRIPLE") {
            for (const off of [-1.8, 0, 1.8]) {
              spawnCannonballFlight(
                shot.fromX,
                shot.fromZ,
                shot.toX + off,
                shot.toZ + off,
                hasHit
              );
            }
          } else {
            spawnCannonballFlight(
              shot.fromX,
              shot.fromZ,
              shot.toX,
              shot.toZ,
              hasHit
            );
          }
          const sNode = shipNodes.get(shot.shooterId);
          if (sNode) {
            sNode.recoilRoll = 0.25;
            sNode.captainActions["Punch"]?.reset().play();
          }
        }
      }

      // C. Camera-Relative Virtual Joystick + Keyboard Movement (Smooth & Effortless!)
      const lp = localPosRef.current;
      const myServerShip = curShips[curMyId];
      const isSunk = Boolean(myServerShip && myServerShip.sunkUntil > Date.now());

      let joyDx = joystickVecRef.current.dx;
      let joyDz = joystickVecRef.current.dz;

      if (Math.hypot(joyDx, joyDz) < 0.05) {
        let kx = 0;
        let kz = 0;
        if (keysPressed.has("KeyD") || keysPressed.has("ArrowRight")) kx += 1;
        if (keysPressed.has("KeyA") || keysPressed.has("ArrowLeft")) kx -= 1;
        if (keysPressed.has("KeyS") || keysPressed.has("ArrowDown")) kz += 1;
        if (keysPressed.has("KeyW") || keysPressed.has("ArrowUp")) kz -= 1;
        const kLen = Math.hypot(kx, kz);
        if (kLen > 0) {
          joyDx = kx / kLen;
          joyDz = kz / kLen;
        }
      }

      // Keyboard Q/E camera orbit support
      if (keysPressed.has("KeyQ")) lp.camYaw += 1.8 * dt;
      if (keysPressed.has("KeyE")) lp.camYaw -= 1.8 * dt;

      if (!isSunk && Math.hypot(joyDx, joyDz) > 0.06) {
        const moveVec = cameraRelativeMove(joyDx, joyDz, lp.camYaw);
        const boostMult =
          myServerShip && myServerShip.windBoostUntil > Date.now() ? 1.7 : 1.0;
        const speed = 11.2 * boostMult;

        let nx = lp.x + moveVec.x * speed * dt;
        let nz = lp.z + moveVec.z * speed * dt;

        // Island Collision Pushout
        for (const isl of PIRATES_ISLANDS) {
          const dx = nx - isl.x;
          const dz = nz - isl.z;
          const dist = Math.hypot(dx, dz);
          const minD = isl.radius + 2.5;
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

        lp.x = nx;
        lp.z = nz;
        const desiredHeading = facingFromDirection(moveVec);
        lp.rotY += angleDelta(lp.rotY, desiredHeading) * Math.min(1, dt * 8.5);
        lp.isMoving = true;
      } else {
        lp.isMoving = false;
        if (isSunk && myServerShip) {
          lp.x = myServerShip.x;
          lp.z = myServerShip.z;
          lp.rotY = myServerShip.yaw;
        }
      }

      tickCb?.(lp.x, lp.z, lp.rotY, lp.isMoving);

      // D. Viewport-Aligned Cannon Aim + Magnetic Auto-Lock onto Enemy Ships!
      // Camera sits at (lp.x - sin(camYaw)*dist, lp.z - cos(camYaw)*dist) looking along camYaw!
      const viewForwardYaw = lp.camYaw;
      const defaultRange = 24;
      let aimYaw = viewForwardYaw;
      let aimX = lp.x + Math.sin(viewForwardYaw) * defaultRange;
      let aimZ = lp.z + Math.cos(viewForwardYaw) * defaultRange;
      let lockedTarget: PirateShipState | null = null;
      let bestScore = Infinity;

      for (const other of Object.values(curShips)) {
        if (other.id === curMyId || other.sunkUntil > Date.now()) continue;

        let ox = other.x;
        let oz = other.z;
        const peer = peersRef?.current.get(other.id);
        if (peer && now - peer.t < 2000) {
          ox = peer.x;
          oz = peer.z;
        }

        const dx = ox - lp.x;
        const dz = oz - lp.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.5 || dist > 44) continue;

        const angToEnemy = Math.atan2(dx, dz);
        const angDiff = Math.abs(angleDelta(viewForwardYaw, angToEnemy));
        // 38-degree magnetic aim cone in front of viewport!
        if (angDiff <= 0.66) {
          const score = angDiff * 22 + dist * 0.35;
          if (score < bestScore) {
            bestScore = score;
            lockedTarget = { ...other, x: ox, z: oz };
            aimYaw = angToEnemy;
            aimX = ox;
            aimZ = oz;
          }
        }
      }

      lp.aimYaw = aimYaw;
      lp.targetWorldX = aimX;
      lp.targetWorldZ = aimZ;
      const nextLockedId = lockedTarget?.id ?? null;
      lp.lockedTargetId = nextLockedId;
      if (nextLockedId !== prevLockedId) {
        prevLockedId = nextLockedId;
        lockCb?.(nextLockedId);
      }

      // Update Parabolic 3D Trajectory Line & Lock-On Reticle
      myShipHalo.position.set(lp.x, 0.2, lp.z);
      const aimDist = Math.hypot(aimX - lp.x, aimZ - lp.z);
      const arcPeak = Math.min(6.0, Math.max(2.0, aimDist * 0.15));
      for (let i = 0; i < aimPointsCount; i++) {
        const t = i / (aimPointsCount - 1);
        aimPositions[i * 3] = lp.x + (aimX - lp.x) * t;
        aimPositions[i * 3 + 1] =
          1.45 * (1 - t) + 0.3 * t + Math.sin(t * Math.PI) * arcPeak;
        aimPositions[i * 3 + 2] = lp.z + (aimZ - lp.z) * t;
      }
      aimGeo.attributes.position.needsUpdate = true;

      const isLocked = Boolean(lockedTarget);
      aimMat.color.setHex(isLocked ? 0xf43f5e : 0x10b981);
      (lockOuter.material as THREE.MeshBasicMaterial).color.setHex(
        isLocked ? 0xf43f5e : 0x10b981
      );
      lockOverheadCone.visible = isLocked;
      lockRingGroup.position.set(aimX, 0.22, aimZ);
      lockInner.rotation.z = timeSec * 2.5;
      const lockPulse = 1 + Math.sin(timeSec * 8) * 0.12;
      lockOuter.scale.set(lockPulse, lockPulse, 1);

      // E. Sync & Animate All 3D Ships
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

        if (!node || node.ver !== assetsVersion) {
          const prevX = node?.currX ?? ship.x;
          const prevZ = node?.currZ ?? ship.z;
          const prevYaw = node?.currYaw ?? ship.yaw;
          if (node) shipsGroup.remove(node.root);

          const built = buildShipVisual(ship.styleIndex, style);
          shipsGroup.add(built.root);
          node = {
            ...built,
            ver: assetsVersion,
            currX: prevX,
            currZ: prevZ,
            currYaw: prevYaw,
            recoilRoll: 0,
            lastBadgeHash: "",
            wakeTimer: 0,
          };
          shipNodes.set(ship.id, node);
        }

        const isMe = ship.id === curMyId;
        let tx = ship.x;
        let tz = ship.z;
        let tyaw = ship.yaw;

        if (isMe) {
          tx = lp.x;
          tz = lp.z;
          tyaw = lp.rotY;
        } else if (peersRef?.current) {
          const peer = peersRef.current.get(ship.id);
          if (peer && now - peer.t < 2000) {
            tx = peer.x;
            tz = peer.z;
            tyaw = peer.r;
          }
        }

        const prevX = node.currX;
        const prevZ = node.currZ;
        const alpha = damp(10, dt);
        node.currX = isMe ? tx : node.currX + (tx - node.currX) * alpha;
        node.currZ = isMe ? tz : node.currZ + (tz - node.currZ) * alpha;
        node.currYaw +=
          angleDelta(node.currYaw, tyaw) * Math.min(1, dt * (isMe ? 18 : 10));

        const movedDist = Math.hypot(node.currX - prevX, node.currZ - prevZ);
        node.wakeTimer -= dt;
        if (movedDist > 0.02 && node.wakeTimer <= 0 && ship.sunkUntil <= Date.now()) {
          node.wakeTimer = 0.18;
          spawnWakeRing(
            node.currX - Math.sin(node.currYaw) * 2.5,
            node.currZ - Math.cos(node.currYaw) * 2.5
          );
        }

        const wy = waveHeightAt(node.currX, node.currZ, timeSec);
        const shipSunk = ship.sunkUntil > Date.now();
        node.aliveVisual.visible = !shipSunk;
        node.wreckVisual.visible = shipSunk;

        node.root.position.set(node.currX, wy, node.currZ);
        node.root.rotation.y = node.currYaw;

        // Wave pitch + turn heel + cannon recoil roll
        node.recoilRoll = Math.max(0, node.recoilRoll - dt * 0.85);
        const wavePitch = Math.sin(timeSec * 2.3 + node.currX * 0.2) * 0.05;
        const waveRoll =
          Math.cos(timeSec * 1.9 + node.currZ * 0.2) * 0.04 + node.recoilRoll;
        node.hullPivot.rotation.set(wavePitch, 0, waveRoll);

        if (isMe) {
          node.turretPivot.rotation.y = angleDelta(node.currYaw, lp.aimYaw);
        }

        node.captainMixer?.update(dt);

        const isTarget = lp.lockedTargetId === ship.id;
        const bHash = `${ship.nickname}_${ship.hp}_${ship.shield}_${isTarget}_${shipSunk}`;
        if (bHash !== node.lastBadgeHash) {
          node.lastBadgeHash = bHash;
          updateShipOverheadCanvas(
            node.badgeCanvas,
            ship,
            style,
            isMe,
            isTarget
          );
          node.badgeTex.needsUpdate = true;
        }
      }

      // F. Render Floating 3D Sea Loot Crates (Real GLB Chests, Barrels & Crates!)
      const activeCrateIds = new Set(curCrates.map((c) => c.id));
      for (const [cid, entry] of crateNodes.entries()) {
        if (!activeCrateIds.has(cid)) {
          cratesGroup.remove(entry.group);
          crateNodes.delete(cid);
        }
      }

      for (const crate of curCrates) {
        let entry = crateNodes.get(crate.id);
        if (!entry || entry.ver !== assetsVersion) {
          if (entry) cratesGroup.remove(entry.group);
          const g = new THREE.Group();
          const colorHex =
            crate.kind === "GOLD_CHEST"
              ? 0xfacc15
              : crate.kind === "REPAIR"
              ? 0x22c55e
              : crate.kind === "DOUBLE_POWDER"
              ? 0xf97316
              : 0x38bdf8;

          const modelSrc =
            crate.kind === "GOLD_CHEST"
              ? loadedAssets?.models.chest
              : crate.kind === "DOUBLE_POWDER"
              ? loadedAssets?.models.barrel
              : loadedAssets?.models.crateBottles;

          if (modelSrc) {
            const m = normalizeAndCenterModel(modelSrc, 1.5, true);
            g.add(m);
          } else {
            const box = new THREE.Mesh(
              new THREE.BoxGeometry(1.1, 0.9, 1.1),
              new THREE.MeshStandardMaterial({ color: colorHex })
            );
            g.add(box);
          }

          const halo = new THREE.Mesh(
            new THREE.RingGeometry(1.0, 1.4, 24),
            new THREE.MeshBasicMaterial({
              color: colorHex,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.85,
            })
          );
          halo.rotation.x = -Math.PI / 2;
          halo.position.y = 0.08;
          g.add(halo);

          cratesGroup.add(g);
          entry = { group: g, ver: assetsVersion };
          crateNodes.set(crate.id, entry);
        }

        const wy = waveHeightAt(crate.x, crate.z, timeSec);
        entry.group.position.set(crate.x, wy + 0.15, crate.z);
        entry.group.rotation.y = timeSec * 1.5;
      }

      // G. Animate Flying Cannonballs & Water/Explosion FX
      for (let i = activeCannonballs.length - 1; i >= 0; i--) {
        const cb = activeCannonballs[i];
        cb.progress = Math.min(1, cb.progress + dt / cb.duration);
        const t = cb.progress;
        const x = cb.fromX + (cb.toX - cb.fromX) * t;
        const z = cb.fromZ + (cb.toZ - cb.fromZ) * t;
        const y =
          1.6 * (1 - t) + 0.3 * t + Math.sin(t * Math.PI) * cb.peakHeight;
        cb.group.position.set(x, y, z);
        cb.group.rotation.x += 9 * dt;

        if (cb.progress >= 1) {
          fxGroup.remove(cb.group);
          activeCannonballs.splice(i, 1);
          spawnImpactExplosion(cb.toX, cb.toZ, cb.hitShip);
        }
      }

      for (let i = activeEffects.length - 1; i >= 0; i--) {
        const ef = activeEffects[i];
        ef.age += dt;
        const p = Math.min(1, ef.age / ef.maxAge);
        const sc = 1 + p * 2.8;
        ef.ring.scale.set(sc, sc, 1);
        (ef.ring.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.85;

        for (const pt of ef.particles) {
          pt.vy -= 15 * dt;
          pt.mesh.position.x += pt.vx * dt;
          pt.mesh.position.y = Math.max(0.1, pt.mesh.position.y + pt.vy * dt);
          pt.mesh.position.z += pt.vz * dt;
          (pt.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - p;
        }

        if (ef.age >= ef.maxAge) {
          fxGroup.remove(ef.ring);
          for (const pt of ef.particles) fxGroup.remove(pt.mesh);
          activeEffects.splice(i, 1);
        }
      }

      // H. Smooth Independent 3rd-Person Orbital Camera (Never jerks when turning ship!)
      const isPortrait = camera.aspect < 1;
      const camDist = isPortrait ? 15.5 : 13.5;
      const camPitch = lp.camPitch || 0.48;
      const horizDist = Math.cos(camPitch) * camDist;
      const vertDist = Math.sin(camPitch) * camDist;

      const shakeX =
        cameraShake > 0.01 ? (Math.random() - 0.5) * cameraShake : 0;
      const shakeY =
        cameraShake > 0.01 ? (Math.random() - 0.5) * cameraShake : 0;
      cameraShake = Math.max(0, cameraShake - dt * 1.2);

      const camX = lp.x - Math.sin(lp.camYaw) * horizDist + shakeX;
      const camY = Math.max(2.5, 2.2 + vertDist + shakeY);
      const camZ = lp.z - Math.cos(lp.camYaw) * horizDist;

      camera.position.set(camX, camY, camZ);
      camera.lookAt(
        lp.x + Math.sin(viewForwardYaw) * 6,
        1.8,
        lp.z + Math.cos(viewForwardYaw) * 6
      );

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      domEl.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    };
  }, [localPosRef, joystickVecRef, peersRef, fxQueueRef]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none touch-none bg-[#0284c7]">
      <div ref={containerRef} className="w-full h-full cursor-crosshair" />
      {loadProgress < 1 && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-slate-950/80 border border-sky-400/40 px-3 py-1 text-[10px] font-bold text-sky-200">
          ⛵ جاري تحميل مجسمات السفن 3D ({Math.round(loadProgress * 100)}%)...
        </div>
      )}
    </div>
  );
}
