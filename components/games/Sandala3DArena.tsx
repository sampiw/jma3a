"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  SandalaPhase,
  SandalaPlayerEntity,
  SandalaTrap,
} from "@/games/sandala/types";
import {
  ARENA_HALF,
  GHAMMADA_DECOR,
  resolveCollisions,
  STATIC_COLLIDERS,
} from "@/games/ghammada/layout";
import {
  buildProceduralProp,
  createDecorObject,
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

export interface SandalaLocalTransform {
  x: number;
  z: number;
  rotY: number;
  camYaw: number;
  camPitch?: number;
  aimYaw?: number;
  lockedTargetId?: string | null;
  isMoving?: boolean;
  floppedUntil?: number;
  slippedUntil?: number;
  dancingUntil?: number;
}

export interface SandalaLivePacket {
  i: string;
  x: number;
  z: number;
  r: number;
  m?: boolean;
  f?: boolean; // flopped
  s?: boolean; // slipped
  d?: boolean; // dancing
  t: number;
}

export interface SandalaFxEvent {
  k: "sandala" | "broom" | "flop" | "sabon" | "slip" | "snitch" | "dance" | "rage";
  i: string;
  x: number;
  z: number;
  r?: number;
  tx?: number;
  tz?: number;
  targetId?: string;
}

interface Sandala3DArenaProps {
  phase: SandalaPhase;
  myPlayerId: string;
  entities: Record<string, SandalaPlayerEntity>;
  traps: SandalaTrap[];
  localPosRef: React.MutableRefObject<SandalaLocalTransform>;
  joystickVecRef: React.MutableRefObject<{ dx: number; dz: number }>;
  peersRef?: React.MutableRefObject<Map<string, SandalaLivePacket>>;
  fxQueueRef?: React.MutableRefObject<SandalaFxEvent[]>;
  onPositionTick?: (x: number, z: number, rotY: number, isMoving: boolean) => void;
  onTriggerTrap?: (trapId: string, x: number, z: number) => void;
  onLockedTargetChange?: (targetId: string | null) => void;
  onTapThrow?: (aimYaw: number, targetId?: string) => void;
}

/**
 * Builds a recognizable, vibrant 3D Moroccan Hammam Sandala (Slipper) mesh!
 */
function build3DSandalaMesh(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const soleMat = new THREE.MeshStandardMaterial({
    color: 0xec4899, // Hot Pink La Chancla
    roughness: 0.35,
    metalness: 0.15,
    emissive: 0x9d174d,
    emissiveIntensity: 0.25,
  });
  const strapMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24, // Gold strap
    roughness: 0.3,
    metalness: 0.45,
  });

  // Oval sole
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.68), soleMat);
  sole.castShadow = true;
  g.add(sole);

  // Rounded toe & heel caps
  const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.07, 16), soleMat);
  toe.position.z = 0.28;
  g.add(toe);

  const heel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.07, 16), soleMat);
  heel.position.z = -0.28;
  g.add(heel);

  // Arching strap across top of foot
  const strap = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.045, 10, 20, Math.PI),
    strapMat
  );
  strap.position.set(0, 0.03, 0.08);
  g.add(strap);

  g.scale.setScalar(scale);
  return g;
}

/**
 * Builds a 3D Moroccan Straw Broom (شطابة)
 */
function build3DBroomMesh(): THREE.Group {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 1.15, 10),
    new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.7 })
  );
  stick.position.y = 0.45;
  g.add(stick);

  const straw = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 0.52, 12),
    new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.85 })
  );
  straw.position.y = 0.98;
  straw.rotation.x = Math.PI;
  g.add(straw);

  return g;
}

/**
 * Builds a 3D Sabon Beldi (Slippery Soap Puddle + Soap Bar)
 */
function buildSabonTrapMesh(): THREE.Group {
  const g = new THREE.Group();
  const puddle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.9, 0.04, 24),
    new THREE.MeshStandardMaterial({
      color: 0xa3e635,
      emissive: 0x4d7c0f,
      emissiveIntensity: 0.35,
      roughness: 0.12,
      metalness: 0.2,
      transparent: true,
      opacity: 0.88,
    })
  );
  puddle.position.y = 0.025;
  g.add(puddle);

  // Soap bar in center
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.14, 0.24),
    new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.25 })
  );
  bar.position.y = 0.09;
  bar.rotation.y = 0.4;
  g.add(bar);

  // Foam bubbles
  const bubbleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.1,
    transparent: true,
    opacity: 0.9,
  });
  for (const [bx, bz, br] of [
    [0.35, 0.2, 0.1],
    [-0.3, 0.28, 0.12],
    [0.15, -0.38, 0.09],
    [-0.28, -0.25, 0.11],
  ]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(br, 10, 8), bubbleMat);
    b.position.set(bx, br * 0.8, bz);
    g.add(b);
  }

  return g;
}

function clampCameraWallDist(
  focusX: number,
  focusZ: number,
  dirX: number,
  dirZ: number,
  desiredDist: number
): number {
  const wallLimit = ARENA_HALF - 0.35;
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

export function Sandala3DArena({
  phase,
  myPlayerId,
  entities,
  traps,
  localPosRef,
  joystickVecRef,
  peersRef,
  fxQueueRef,
  onPositionTick,
  onTriggerTrap,
  onLockedTargetChange,
  onTapThrow,
}: Sandala3DArenaProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [loadProgress, setLoadProgress] = useState<number>(0);

  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;

  const trapsRef = useRef(traps);
  trapsRef.current = traps;

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const onPosTickRef = useRef(onPositionTick);
  onPosTickRef.current = onPositionTick;

  const onTriggerTrapRef = useRef(onTriggerTrap);
  onTriggerTrapRef.current = onTriggerTrap;

  const onLockedTargetChangeRef = useRef(onLockedTargetChange);
  onLockedTargetChangeRef.current = onLockedTargetChange;

  const onTapThrowRef = useRef(onTapThrow);
  onTapThrowRef.current = onTapThrow;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;

    // 1. Initialize Scene, Camera & Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1025);
    scene.fog = new THREE.FogExp2(0x1a1025, 0.013);

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
    renderer.toneMappingExposure = 1.18;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // 2. Warm Salon Marocain Chandelier Lighting
    const hemiLight = new THREE.HemisphereLight(0xfff1d6, 0x2e1065, 0.9);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffe4b5, 1.4);
    sunLight.position.set(14, 26, 12);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 65;
    const dBound = 20;
    sunLight.shadow.camera.left = -dBound;
    sunLight.shadow.camera.right = dBound;
    sunLight.shadow.camera.top = dBound;
    sunLight.shadow.camera.bottom = -dBound;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // 3. Build Grand Moroccan Salon (الصالون المغربي الكبير)
    const envGroup = new THREE.Group();
    scene.add(envGroup);

    // Salon Royal Carpet Floor
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 36),
      new THREE.MeshStandardMaterial({ color: 0x450a0a, roughness: 0.85 })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    envGroup.add(floorMesh);

    // Gold Zellij Carpet Grid
    const grid = new THREE.GridHelper(34, 17, 0xfbbf24, 0x7f1d1d);
    grid.position.y = 0.015;
    envGroup.add(grid);

    // 4 Corner Salon Rugs
    for (const [rx, rz, col] of [
      [-10, -10, 0x991b1b],
      [10, -10, 0x065f46],
      [-10, 10, 0x1e3a8a],
      [10, 10, 0x78350f],
    ]) {
      const rug = new THREE.Mesh(
        new THREE.PlaneGeometry(9.2, 9.2),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 })
      );
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(rx, 0.02, rz);
      rug.receiveShadow = true;
      envGroup.add(rug);
    }

    // Salon Walls with Gold Trim
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.7 });
    const goldTrimMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.4,
      roughness: 0.3,
    });
    for (const ws of [
      { x: 0, z: -16.8, w: 34.6, d: 0.9 },
      { x: 0, z: 16.8, w: 34.6, d: 0.9 },
      { x: -16.8, z: 0, w: 0.9, d: 34.6 },
      { x: 16.8, z: 0, w: 0.9, d: 34.6 },
    ]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ws.w, 3.5, ws.d), wallMat);
      wall.position.set(ws.x, 1.75, ws.z);
      wall.receiveShadow = true;
      wall.castShadow = true;
      envGroup.add(wall);

      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(ws.w, 0.22, ws.d + 0.14),
        goldTrimMat
      );
      trim.position.set(ws.x, 3.55, ws.z);
      envGroup.add(trim);
    }

    // THE CRIME SCENE AT (0, 0): Broken Peacock Plate + Spilled Silver Berrad + Mint Tea Puddle!
    const crimeGroup = new THREE.Group();
    const teaSpill = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.6, 0.06, 28),
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.35,
        roughness: 0.15,
      })
    );
    teaSpill.position.y = 0.03;
    crimeGroup.add(teaSpill);

    // Broken Peacock Plate rim
    const brokenPlate = new THREE.Mesh(
      new THREE.CylinderGeometry(2.75, 2.85, 0.35, 16),
      new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.4 })
    );
    brokenPlate.position.y = 0.18;
    crimeGroup.add(brokenPlate);

    // Toppled giant Silver Berrad on its side
    const fallenBerrad = buildProceduralProp("berrad");
    fallenBerrad.scale.setScalar(1.45);
    fallenBerrad.rotation.z = Math.PI / 2.3;
    fallenBerrad.position.set(0.2, 0.65, 0);
    crimeGroup.add(fallenBerrad);
    envGroup.add(crimeGroup);

    const decorGroup = new THREE.Group();
    envGroup.add(decorGroup);

    // Local Player Halo Ring
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

    // Mama Aim Laser Group (Always rotates cleanly around Y axis along aimYaw!)
    const mamaAimGroup = new THREE.Group();
    mamaAimGroup.position.y = 0.045;
    mamaAimGroup.visible = false;

    const mamaAimBeamMat = new THREE.MeshBasicMaterial({
      color: 0xec4899,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.48,
    });
    const mamaAimBeamMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.45, 1),
      mamaAimBeamMat
    );
    mamaAimBeamMesh.rotation.x = -Math.PI / 2;
    mamaAimGroup.add(mamaAimBeamMesh);

    const mamaAimTipMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const mamaAimTipMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.55, 24),
      mamaAimTipMat
    );
    mamaAimTipMesh.rotation.x = -Math.PI / 2;
    mamaAimGroup.add(mamaAimTipMesh);
    scene.add(mamaAimGroup);

    // 3D Target Lock-On Crosshair Ring around the Kid currently in Mama's sights!
    const mamaLockRingGroup = new THREE.Group();
    mamaLockRingGroup.visible = false;
    const lockOuterRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1.05, 32),
      new THREE.MeshBasicMaterial({
        color: 0x10b981,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      })
    );
    lockOuterRing.rotation.x = -Math.PI / 2;
    lockOuterRing.position.y = 0.05;
    mamaLockRingGroup.add(lockOuterRing);

    const lockInnerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 4),
      new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      })
    );
    lockInnerRing.rotation.x = -Math.PI / 2;
    lockInnerRing.position.y = 0.06;
    mamaLockRingGroup.add(lockInnerRing);

    const lockOverheadCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.55, 6),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    lockOverheadCone.rotation.x = Math.PI;
    lockOverheadCone.position.y = 2.25;
    mamaLockRingGroup.add(lockOverheadCone);
    scene.add(mamaLockRingGroup);

    const effects = new GhammadaEffects(scene);

    // 4. Load 3D Assets
    let loadedAssets: GhammadaAssets | null = null;
    let assetsVersion = 0;

    loadGhammadaAssets((ratio) => {
      if (!disposed) setLoadProgress(ratio);
    }).then((assets) => {
      if (!disposed) {
        loadedAssets = assets;
        assetsVersion++;

        decorGroup.clear();
        for (const d of GHAMMADA_DECOR) {
          const obj = createDecorObject(assets, d.model, d.height);
          if (obj) {
            obj.position.set(d.x, 0, d.z);
            obj.rotation.y = d.rotY;
            decorGroup.add(obj);
          }
        }
      }
    });

    // 5. Dynamic Registries for Players, Sabon Traps & Flying Sandalas
    interface CharacterEntry {
      root: THREE.Group;
      visual: THREE.Group;
      mixer: THREE.AnimationMixer | null;
      actions: Record<string, THREE.AnimationAction>;
      currentAnim: string;
      sandalaPivot: THREE.Group;
      broomPivot: THREE.Group;
      snitchArrow: THREE.Mesh;
      rageRing: THREE.Mesh;
      ver: number;
      role: "MAMA" | "KID";
      color: number;
      lastX: number;
      lastZ: number;
      lastThrowAt: number;
      lastHitAt: number;
    }

    const playerMeshes = new Map<string, CharacterEntry>();
    const trapMeshes = new Map<string, THREE.Group>();
    const triggeredLocalTraps = new Set<string>();

    interface FlyingProjectile {
      mesh: THREE.Group;
      vx: number;
      vz: number;
      life: number;
      targetId?: string;
    }
    const projectiles: FlyingProjectile[] = [];

    const spawnFlyingSandala = (
      x: number,
      z: number,
      rotY: number,
      targetId?: string
    ) => {
      const mesh = build3DSandalaMesh(1.75);
      mesh.position.set(x + Math.sin(rotY) * 0.7, 1.25, z + Math.cos(rotY) * 0.7);
      mesh.rotation.y = rotY;
      scene.add(mesh);
      projectiles.push({
        mesh,
        vx: Math.sin(rotY) * 22,
        vz: Math.cos(rotY) * 22,
        life: 0.75,
        targetId,
      });
    };

    const buildCharacter = (
      role: "MAMA" | "KID",
      outfitColor: number
    ): Omit<
      CharacterEntry,
      "ver" | "role" | "color" | "lastX" | "lastZ" | "lastThrowAt" | "lastHitAt"
    > => {
      const root = new THREE.Group();
      const visual = new THREE.Group();
      root.add(visual);

      let mixer: THREE.AnimationMixer | null = null;
      const actions: Record<string, THREE.AnimationAction> = {};

      if (loadedAssets?.hunter) {
        loadedAssets.hunter.scene.updateMatrixWorld(true);
        const cloned = SkeletonUtils.clone(loadedAssets.hunter.scene);
        const targetH = role === "MAMA" ? HUNTER_HEIGHT * 1.08 : HUNTER_HEIGHT * 0.92;
        cloned.scale.setScalar(targetH / 4.79);
        cloned.position.set(0, 0, 0);

        cloned.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = false;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (mat && "color" in mat) {
              const m = mat.clone();
              const name = (m.name || "").toLowerCase();
              if (name.includes("main")) m.color.set(outfitColor);
              else if (name.includes("grey") || name.includes("gray")) {
                m.color.set(role === "MAMA" ? 0xfbbf24 : 0x1e293b);
              }
              m.metalness = 0.18;
              m.roughness = 0.5;
              mesh.material = m;
            }
          }
        });

        visual.add(cloned);
        mixer = new THREE.AnimationMixer(cloned);
        for (const clip of loadedAssets.hunter.animations) {
          actions[clip.name] = mixer.clipAction(clip);
        }
        if (actions["Punch"]) {
          actions["Punch"].setLoop(THREE.LoopOnce, 1);
          actions["Punch"].clampWhenFinished = false;
        }
      } else {
        const fallback = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.36, 0.75, 10, 16),
          new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.5 })
        );
        fallback.position.y = 0.8;
        enableShadows(fallback);
        visual.add(fallback);
      }

      // Right-hand Sandala Pivot (Visible on Mama)
      const sandalaPivot = new THREE.Group();
      sandalaPivot.position.set(-0.45, 1.25, 0.25);
      const heldSandala = build3DSandalaMesh(1.3);
      heldSandala.position.y = 0.15;
      sandalaPivot.add(heldSandala);
      sandalaPivot.visible = role === "MAMA";
      visual.add(sandalaPivot);

      // Left-hand Broom Pivot (Visible on Mama)
      const broomPivot = new THREE.Group();
      broomPivot.position.set(0.45, 0.95, 0.2);
      const heldBroom = build3DBroomMesh();
      broomPivot.add(heldBroom);
      broomPivot.visible = role === "MAMA";
      visual.add(broomPivot);

      // Snitch Arrow (Floating above Kid when snitched!)
      const snitchArrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 0.65, 8),
        new THREE.MeshStandardMaterial({
          color: 0xfacc15,
          emissive: 0xef4444,
          emissiveIntensity: 0.85,
        })
      );
      snitchArrow.rotation.x = Math.PI;
      snitchArrow.position.y = 2.45;
      snitchArrow.visible = false;
      root.add(snitchArrow);

      // Mama Rage Ring
      const rageRing = new THREE.Mesh(
        new THREE.RingGeometry(0.75, 1.15, 28),
        new THREE.MeshBasicMaterial({
          color: 0xf43f5e,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.75,
        })
      );
      rageRing.rotation.x = -Math.PI / 2;
      rageRing.position.y = 0.06;
      rageRing.visible = false;
      root.add(rageRing);

      return {
        root,
        visual,
        mixer,
        actions,
        currentAnim: "",
        sandalaPivot,
        broomPivot,
        snitchArrow,
        rageRing,
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

    // 6. Keyboard + Multi-Touch Look Controls
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
    let downPointerX = 0;
    let downPointerY = 0;
    let downTimeMs = 0;
    let maxDragPx = 0;
    const domEl = renderer.domElement;
    const tapRaycaster = new THREE.Raycaster();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const onPointerDown = (e: PointerEvent) => {
      if (lookPointerId !== null) return;
      lookPointerId = e.pointerId;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      downPointerX = e.clientX;
      downPointerY = e.clientY;
      downTimeMs = performance.now();
      maxDragPx = 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== lookPointerId) return;
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      maxDragPx = Math.max(
        maxDragPx,
        Math.hypot(e.clientX - downPointerX, e.clientY - downPointerY)
      );

      const currentPitch = localPosRef.current.camPitch ?? 0.52;
      const next = applyLookDrag(localPosRef.current.camYaw, currentPitch, dx, dy);
      localPosRef.current.camYaw = next.yaw;
      localPosRef.current.camPitch = next.pitch;
    };

    const onPointerUpOrCancel = (e: PointerEvent) => {
      if (e.pointerId === lookPointerId) {
        const tapElapsed = performance.now() - downTimeMs;
        const wasQuickTap =
          e.type === "pointerup" && tapElapsed < 240 && maxDragPx < 14;
        lookPointerId = null;

        // If Mama quick-taps a Kid or spot on the 3D screen, turn and throw Sandala right there!
        const myEnt = entitiesRef.current[myPlayerId];
        if (
          wasQuickTap &&
          myEnt?.role === "MAMA" &&
          phaseRef.current === "ROUND_PLAY"
        ) {
          const rect = domEl.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            // 1. Check if Mama tapped near any Kid on screen (generous 95px radius!)
            let tappedKidId: string | undefined;
            let bestScreenDist = 95;
            const projVec = new THREE.Vector3();
            for (const ent of Object.values(entitiesRef.current)) {
              if (ent.role !== "KID" || ent.isKO) continue;
              const entry = playerMeshes.get(ent.playerId);
              const kx = entry ? entry.root.position.x : ent.x;
              const kz = entry ? entry.root.position.z : ent.z;
              projVec.set(kx, 1.0, kz).project(camera);
              if (projVec.z >= -1 && projVec.z <= 1) {
                const sx = ((projVec.x + 1) * 0.5) * rect.width + rect.left;
                const sy = ((-projVec.y + 1) * 0.5) * rect.height + rect.top;
                const sDist = Math.hypot(e.clientX - sx, e.clientY - sy);
                if (sDist < bestScreenDist) {
                  bestScreenDist = sDist;
                  tappedKidId = ent.playerId;
                }
              }
            }

            if (tappedKidId) {
              const entry = playerMeshes.get(tappedKidId);
              const ent = entitiesRef.current[tappedKidId];
              const kx = entry ? entry.root.position.x : ent.x;
              const kz = entry ? entry.root.position.z : ent.z;
              const yawToKid = Math.atan2(
                kx - localPosRef.current.x,
                kz - localPosRef.current.z
              );
              localPosRef.current.rotY = yawToKid;
              localPosRef.current.aimYaw = yawToKid;
              localPosRef.current.lockedTargetId = tappedKidId;
              onTapThrowRef.current?.(yawToKid, tappedKidId);
            } else {
              // 2. Raycast onto floor plane and throw toward that 3D spot
              tapRaycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
              const hitPt = new THREE.Vector3();
              if (tapRaycaster.ray.intersectPlane(floorPlane, hitPt)) {
                const yawToSpot = Math.atan2(
                  hitPt.x - localPosRef.current.x,
                  hitPt.z - localPosRef.current.z
                );
                localPosRef.current.rotY = yawToSpot;
                localPosRef.current.aimYaw = yawToSpot;
                onTapThrowRef.current?.(
                  yawToSpot,
                  localPosRef.current.lockedTargetId || undefined
                );
              }
            }
          }
        }
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

    // 7. Main 60 FPS Game Loop
    let animFrameId = 0;
    let lastTime = performance.now();
    let lastSyncMs = 0;
    let lastReportedLockedId: string | null = null;

    const animate = (nowMs: number) => {
      animFrameId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastTime) / 1000));
      lastTime = nowMs;
      const nowEpoch = Date.now();

      const allEntities = entitiesRef.current;
      const myServerEnt = allEntities[myPlayerId];

      // Process instant FX queue
      if (fxQueueRef?.current && fxQueueRef.current.length > 0) {
        const q = fxQueueRef.current.splice(0, fxQueueRef.current.length);
        for (const fx of q) {
          if (fx.k === "sandala") {
            spawnFlyingSandala(fx.x, fx.z, fx.r ?? 0, fx.targetId);
            const ce = playerMeshes.get(fx.i);
            if (ce?.actions["Punch"]) {
              ce.actions["Punch"].reset().setEffectiveWeight(1).fadeIn(0.05).play();
            }
          } else if (fx.k === "broom") {
            effects.dust(fx.x, fx.z);
          } else if (fx.k === "flop") {
            effects.smoke(fx.x, fx.z);
          } else if (fx.k === "sabon" || fx.k === "slip") {
            effects.poof(fx.x, fx.z);
          } else if (fx.k === "dance" || fx.k === "snitch") {
            effects.notes(fx.x, fx.z);
          } else if (fx.k === "rage") {
            effects.dust(fx.x, fx.z);
          }
        }
      }

      // Update Flying Sandala Projectiles (with La Chancla Heat-Seeking!)
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.life -= dt;

        if (p.targetId) {
          const targetEntry = playerMeshes.get(p.targetId);
          if (targetEntry) {
            const tx = targetEntry.root.position.x - p.mesh.position.x;
            const tz = targetEntry.root.position.z - p.mesh.position.z;
            const distToTarget = Math.hypot(tx, tz);
            if (distToTarget < 0.75) {
              effects.poof(targetEntry.root.position.x, targetEntry.root.position.z);
              scene.remove(p.mesh);
              projectiles.splice(i, 1);
              continue;
            } else if (distToTarget > 0.1) {
              const desiredVx = (tx / distToTarget) * 23;
              const desiredVz = (tz / distToTarget) * 23;
              const steer = damp(12, dt);
              p.vx += (desiredVx - p.vx) * steer;
              p.vz += (desiredVz - p.vz) * steer;
            }
          }
        }

        p.mesh.position.x += p.vx * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += dt * 28;
        p.mesh.rotation.z += dt * 12;

        if (
          p.life <= 0 ||
          Math.abs(p.mesh.position.x) > ARENA_HALF ||
          Math.abs(p.mesh.position.z) > ARENA_HALF
        ) {
          effects.dust(p.mesh.position.x, p.mesh.position.z);
          scene.remove(p.mesh);
          projectiles.splice(i, 1);
        }
      }

      // A. Sync Sabon Beldi Traps
      const activeTraps = trapsRef.current || [];
      const seenTrapIds = new Set<string>();
      for (const tr of activeTraps) {
        if (tr.triggered) continue;
        seenTrapIds.add(tr.id);
        let tMesh = trapMeshes.get(tr.id);
        if (!tMesh) {
          tMesh = buildSabonTrapMesh();
          scene.add(tMesh);
          trapMeshes.set(tr.id, tMesh);
        }
        tMesh.position.set(tr.x, 0, tr.z);
        tMesh.rotation.y += dt * 1.2;

        // Check local player stepping on trap
        if (
          myServerEnt &&
          !myServerEnt.isKO &&
          !triggeredLocalTraps.has(tr.id) &&
          !(tr.ownerId === myPlayerId && nowEpoch - tr.createdAt < 1800)
        ) {
          const d = Math.hypot(
            localPosRef.current.x - tr.x,
            localPosRef.current.z - tr.z
          );
          if (d < 1.12 && nowEpoch > (localPosRef.current.slippedUntil || 0)) {
            triggeredLocalTraps.add(tr.id);
            localPosRef.current.slippedUntil = nowEpoch + 2100;
            effects.poof(tr.x, tr.z);
            onTriggerTrapRef.current?.(
              tr.id,
              localPosRef.current.x,
              localPosRef.current.z
            );
          }
        }
      }
      for (const [id, mesh] of trapMeshes.entries()) {
        if (!seenTrapIds.has(id)) {
          scene.remove(mesh);
          trapMeshes.delete(id);
        }
      }

      // B. Smart Viewport Aiming & Target Lock-On Radar for Mama
      let lockedKidId: string | null = null;
      let lockedKidDist = 11.5;
      let lockedKidPos: { x: number; z: number } | null = null;
      let computedAimYaw = localPosRef.current.camYaw;

      if (myServerEnt?.role === "MAMA" && phaseRef.current === "ROUND_PLAY") {
        let bestTargetScore = Infinity;
        const myX = localPosRef.current.x;
        const myZ = localPosRef.current.z;
        const camYaw = localPosRef.current.camYaw;

        for (const ent of Object.values(allEntities)) {
          if (ent.role !== "KID" || ent.isKO) continue;
          const peer = peersRef?.current.get(ent.playerId);
          const isFresh = Boolean(peer && nowMs - peer.t < 2000);
          const kx = isFresh && peer ? peer.x : ent.x;
          const kz = isFresh && peer ? peer.z : ent.z;

          const dx = kx - myX;
          const dz = kz - myZ;
          const dist = Math.hypot(dx, dz);
          if (dist > 16.5) continue;

          const angleToKid = Math.atan2(dx, dz);
          const angDiff = Math.abs(angleDelta(camYaw, angleToKid));

          // Lock on if Kid is inside a wide ±58° viewport cone, or very close (< 3.8m)
          if (angDiff <= 1.02 || dist <= 3.8) {
            const score = angDiff * 5.5 + dist * 0.28;
            if (score < bestTargetScore) {
              bestTargetScore = score;
              lockedKidId = ent.playerId;
              lockedKidDist = dist;
              lockedKidPos = { x: kx, z: kz };
              computedAimYaw = angleToKid;
            }
          }
        }

        localPosRef.current.lockedTargetId = lockedKidId;
        localPosRef.current.aimYaw = computedAimYaw;

        if (lockedKidId !== lastReportedLockedId) {
          lastReportedLockedId = lockedKidId;
          onLockedTargetChangeRef.current?.(lockedKidId);
        }
      } else if (lastReportedLockedId !== null) {
        lastReportedLockedId = null;
        localPosRef.current.lockedTargetId = null;
        onLockedTargetChangeRef.current?.(null);
      }

      // B2. Local Player Movement & Collisions
      let localMoving = false;
      if (myServerEnt && !myServerEnt.isKO && phaseRef.current === "ROUND_PLAY") {
        const isFlopped =
          nowEpoch <=
          Math.max(
            myServerEnt.floppedUntil || 0,
            localPosRef.current.floppedUntil || 0
          );
        const isSlipped =
          nowEpoch <=
          Math.max(
            myServerEnt.slippedUntil || 0,
            localPosRef.current.slippedUntil || 0
          );

        let jx = joystickVecRef.current.dx;
        let jy = joystickVecRef.current.dz;
        if (keysPressed["KeyW"] || keysPressed["ArrowUp"]) jy -= 1;
        if (keysPressed["KeyS"] || keysPressed["ArrowDown"]) jy += 1;
        if (keysPressed["KeyA"] || keysPressed["ArrowLeft"]) jx -= 1;
        if (keysPressed["KeyD"] || keysPressed["ArrowRight"]) jx += 1;

        const mag = Math.hypot(jx, jy);
        if (mag > 0.04 && !isFlopped && !isSlipped) {
          localMoving = true;
          const move = cameraRelativeMove(jx, jy, localPosRef.current.camYaw);
          const isRaging =
            myServerEnt.role === "MAMA" && nowEpoch <= (myServerEnt.rageUntil || 0);
          const baseSpeed =
            myServerEnt.role === "MAMA" ? (isRaging ? 8.4 : 6.7) : 6.4;

          const rawX = localPosRef.current.x + move.x * baseSpeed * dt;
          const rawZ = localPosRef.current.z + move.z * baseSpeed * dt;
          const resolved = resolveCollisions(rawX, rawZ, 0.45, STATIC_COLLIDERS);

          localPosRef.current.x = resolved.x;
          localPosRef.current.z = resolved.z;

          // For Mama: if locked onto a Kid in viewport, keep facing the Kid while strafing; otherwise face move direction
          const targetFacing =
            myServerEnt.role === "MAMA" && lockedKidId
              ? computedAimYaw
              : facingFromDirection(move);
          localPosRef.current.rotY +=
            angleDelta(localPosRef.current.rotY, targetFacing) * damp(15, dt);
        } else if (myServerEnt.role === "MAMA" && !isSlipped) {
          // When Mama stands still and turns the camera viewport, smoothly turn Mama to face the viewport aim!
          localPosRef.current.rotY +=
            angleDelta(localPosRef.current.rotY, computedAimYaw) * damp(14, dt);
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

      // C. Render & Animate All Players
      const seenIds = new Set<string>();
      for (const ent of Object.values(allEntities)) {
        seenIds.add(ent.playerId);
        const isMe = ent.playerId === myPlayerId;
        const peer = !isMe ? peersRef?.current.get(ent.playerId) : undefined;
        const isPeerFresh = Boolean(peer && nowMs - peer.t < 2000);

        let entry = playerMeshes.get(ent.playerId);
        if (
          !entry ||
          entry.ver !== assetsVersion ||
          entry.role !== ent.role ||
          entry.color !== ent.outfitColor
        ) {
          const prevX = entry?.lastX ?? ent.x;
          const prevZ = entry?.lastZ ?? ent.z;
          if (entry) scene.remove(entry.root);

          const built = buildCharacter(ent.role, ent.outfitColor);
          built.root.position.set(prevX, 0, prevZ);
          scene.add(built.root);

          entry = {
            ...built,
            ver: assetsVersion,
            role: ent.role,
            color: ent.outfitColor,
            lastX: prevX,
            lastZ: prevZ,
            lastThrowAt: ent.lastThrowAt || 0,
            lastHitAt: ent.lastHitAt || 0,
          };
          playerMeshes.set(ent.playerId, entry);
        }

        // Trigger server-observed throw or smack FX
        if (ent.lastThrowAt && ent.lastThrowAt !== entry.lastThrowAt) {
          entry.lastThrowAt = ent.lastThrowAt;
          if (!isMe) {
            spawnFlyingSandala(entry.root.position.x, entry.root.position.z, ent.rotY);
          }
        }
        if (ent.lastHitAt && ent.lastHitAt !== entry.lastHitAt) {
          entry.lastHitAt = ent.lastHitAt;
          effects.poof(entry.root.position.x, entry.root.position.z);
          if (isMe) {
            // Apply server knockback position
            localPosRef.current.x = ent.x;
            localPosRef.current.z = ent.z;
          }
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
          myRingMesh.position.set(targetX, 0.04, targetZ);

          if (ent.role === "MAMA") {
            const aimLen = lockedKidId ? Math.max(1.2, lockedKidDist) : 11.5;
            mamaAimGroup.visible = true;
            mamaAimGroup.position.set(targetX, 0.045, targetZ);
            mamaAimGroup.rotation.y = computedAimYaw;

            mamaAimBeamMesh.scale.set(lockedKidId ? 1.25 : 1, aimLen, 1);
            mamaAimBeamMesh.position.set(0, 0, aimLen * 0.5);
            mamaAimBeamMat.color.setHex(lockedKidId ? 0x10b981 : 0xec4899);
            mamaAimBeamMat.opacity = lockedKidId ? 0.65 : 0.36;

            mamaAimTipMesh.position.set(0, 0.01, aimLen);
            mamaAimTipMat.color.setHex(lockedKidId ? 0x10b981 : 0xfbbf24);

            if (lockedKidId && lockedKidPos) {
              mamaLockRingGroup.visible = true;
              mamaLockRingGroup.position.set(lockedKidPos.x, 0, lockedKidPos.z);
              lockInnerRing.rotation.z += dt * 4.5;
              const pulse = 1 + Math.sin(nowMs * 0.014) * 0.14;
              lockOuterRing.scale.setScalar(pulse);
              lockOverheadCone.position.y = 2.25 + Math.sin(nowMs * 0.015) * 0.22;
              lockOverheadCone.rotation.y += dt * 5;
            } else {
              mamaLockRingGroup.visible = false;
            }
          } else {
            mamaAimGroup.visible = false;
            mamaLockRingGroup.visible = false;
          }
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

        // Evaluate active meme states
        const isFlopped =
          nowEpoch <=
            Math.max(
              ent.floppedUntil || 0,
              isMe ? localPosRef.current.floppedUntil || 0 : 0
            ) || Boolean(!isMe && isPeerFresh && peer?.f);
        const isSlipped =
          nowEpoch <=
            Math.max(
              ent.slippedUntil || 0,
              isMe ? localPosRef.current.slippedUntil || 0 : 0
            ) || Boolean(!isMe && isPeerFresh && peer?.s);
        const isDancing =
          nowEpoch <=
            Math.max(
              ent.dancingUntil || 0,
              isMe ? localPosRef.current.dancingUntil || 0 : 0
            ) || Boolean(!isMe && isPeerFresh && peer?.d);

        const hitAge = ent.lastHitAt ? nowEpoch - ent.lastHitAt : 9999;

        // Snitch Arrow & Mama Rage Ring
        entry.snitchArrow.visible =
          !ent.isKO && nowEpoch <= (ent.snitchedUntil || 0);
        if (entry.snitchArrow.visible) {
          entry.snitchArrow.position.y = 2.4 + Math.sin(nowMs * 0.012) * 0.25;
          entry.snitchArrow.rotation.y += dt * 4;
        }

        entry.rageRing.visible =
          ent.role === "MAMA" && nowEpoch <= (ent.rageUntil || 0);

        // Pose & Skeletal Animation
        if (ent.isKO) {
          playCharAnim(entry, "Sitting");
          entry.visual.rotation.x = 0;
          entry.visual.position.y = 0;
        } else if (hitAge >= 0 && hitAge < 600) {
          // Yeeted into the air by a Sandala!
          const t = hitAge / 600;
          playCharAnim(entry, "Jump");
          entry.visual.position.y = Math.sin(t * Math.PI) * 2.1;
          entry.visual.rotation.x = t * Math.PI * 2;
        } else if (isSlipped) {
          // Spinning on back on Sabon Beldi!
          entry.visual.rotation.x = -Math.PI / 2.2;
          entry.visual.position.y = 0.32;
          entry.visual.rotation.y += dt * 15;
        } else if (isFlopped) {
          // Flat on belly on the carpet (Matrix dodge!)
          entry.visual.rotation.x += (Math.PI / 2 - entry.visual.rotation.x) * damp(18, dt);
          entry.visual.position.y = 0.22;
          entry.visual.rotation.y = 0;
        } else {
          // Normal upright posture
          entry.visual.rotation.x += (0 - entry.visual.rotation.x) * damp(16, dt);
          entry.visual.rotation.y = 0;
          entry.visual.position.y += (0 - entry.visual.position.y) * damp(16, dt);

          if (isDancing) {
            playCharAnim(entry, "Dance");
          } else if (isMovingNow) {
            playCharAnim(entry, "Running");
          } else {
            playCharAnim(entry, "Idle");
          }
        }

        // Swing Mama's arm on throw/sweep
        const throwAge = ent.lastThrowAt ? nowEpoch - ent.lastThrowAt : 9999;
        if (throwAge >= 0 && throwAge < 450) {
          const p = throwAge / 450;
          entry.sandalaPivot.rotation.x = -Math.sin(p * Math.PI) * 1.8;
          entry.broomPivot.rotation.z = Math.sin(p * Math.PI) * 1.5;
        } else {
          entry.sandalaPivot.rotation.x = 0;
          entry.broomPivot.rotation.z = 0;
        }

        entry.mixer?.update(dt);
      }

      for (const [id, entry] of playerMeshes.entries()) {
        if (!seenIds.has(id)) {
          scene.remove(entry.root);
          playerMeshes.delete(id);
        }
      }

      // D. Update Particle System
      effects.update(dt);

      // E. 3rd-Person Follow Camera
      const camYaw = localPosRef.current.camYaw;
      const camPitch = localPosRef.current.camPitch ?? 0.52;
      const focusX = localPosRef.current.x;
      const focusZ = localPosRef.current.z;

      const baseDist = myServerEnt?.role === "MAMA" ? 5.8 : 5.4;
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

      const shakeAmt = effects.shake * 0.35;
      const shakeX = shakeAmt > 0 ? (Math.random() - 0.5) * shakeAmt : 0;
      const shakeY = shakeAmt > 0 ? (Math.random() - 0.5) * shakeAmt : 0;
      camera.lookAt(focusX + shakeX, focusY + shakeY, focusZ);

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
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/75 border border-pink-400/40 text-[11px] font-bold text-pink-300 pointer-events-none">
          جاري تحضير الصالون والصندالة 3D... {Math.round(loadProgress * 100)}%
        </div>
      )}
    </div>
  );
}
