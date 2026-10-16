"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  GhammadaPhase,
  GhammadaPlayerEntity,
  GhammadaPropId,
  GhammadaWorldProp,
  GHAMMADA_PROPS,
} from "@/games/ghammada/types";
import {
  ARENA_HALF,
  FOUNTAIN_RADIUS,
  GHAMMADA_DECOR,
  PALM_POSITIONS,
  resolveCollisions,
  STATIC_COLLIDERS,
} from "@/games/ghammada/layout";
import {
  createDecorObject,
  createHunterRig,
  createPropObject,
  GhammadaAssets,
  HunterRig,
  loadGhammadaAssets,
  playHunterAnim,
  playHunterPunch,
  updateHunterFez,
} from "@/components/games/ghammada/assets";
import { GhammadaEffects } from "@/components/games/ghammada/effects";
import {
  angleDelta,
  applyLookDrag,
  cameraRelativeMove,
  damp,
  facingFromDirection,
} from "@/components/games/ghammada/controlsMath";
import { LIVE_STALE_MS, LiveFx, LivePos } from "@/components/games/ghammada/useGhammadaLive";

export interface LocalPlayerTransform {
  x: number;
  z: number;
  rotY: number;
  propId: GhammadaPropId;
  isLocked: boolean;
  camYaw: number;
  camPitch?: number;
  isMoving?: boolean;
}

interface Ghammada3DArenaProps {
  phase: GhammadaPhase;
  myPlayerId: string;
  entities: Record<string, GhammadaPlayerEntity>;
  worldProps: GhammadaWorldProp[];
  playersMap: Record<string, string>;
  localPosRef: React.MutableRefObject<LocalPlayerTransform>;
  joystickVecRef: React.MutableRefObject<{ dx: number; dz: number }>;
  peersRef?: React.MutableRefObject<Map<string, LivePos>>;
  fxQueueRef?: React.MutableRefObject<LiveFx[]>;
  fullScreen?: boolean;
  onPositionTick?: (x: number, z: number, rotY: number, isMoving: boolean) => void;
}

/**
 * Clamp camera distance so the camera never clips outside the courtyard walls.
 */
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

  return Math.max(1.4, maxDist);
}

export function Ghammada3DArena({
  phase,
  myPlayerId,
  entities,
  worldProps,
  localPosRef,
  joystickVecRef,
  peersRef,
  fxQueueRef,
  fullScreen = false,
  onPositionTick,
}: Ghammada3DArenaProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [loadProgress, setLoadProgress] = useState<number>(0);

  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;

  const worldPropsRef = useRef(worldProps);
  worldPropsRef.current = worldProps;

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const onPosTickRef = useRef(onPositionTick);
  onPosTickRef.current = onPositionTick;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;

    // 1. Initialize Scene, Camera & Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x131c31);
    scene.fog = new THREE.FogExp2(0x131c31, 0.014);

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / Math.max(1, container.clientHeight),
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
    renderer.toneMappingExposure = 1.1;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 2. Warm Moroccan Golden-Hour Lighting
    const hemiLight = new THREE.HemisphereLight(0xffe8c2, 0x1e293b, 0.85);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffdfa8, 1.45);
    sunLight.position.set(15, 26, 13);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 65;
    const shadowBound = 20;
    sunLight.shadow.camera.left = -shadowBound;
    sunLight.shadow.camera.right = shadowBound;
    sunLight.shadow.camera.top = shadowBound;
    sunLight.shadow.camera.bottom = -shadowBound;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const fountainLight = new THREE.PointLight(0x38bdf8, 1.6, 14);
    fountainLight.position.set(0, 2.2, 0);
    scene.add(fountainLight);

    // 3. Build Moroccan Riad Courtyard Architecture
    const envGroup = new THREE.Group();
    scene.add(envGroup);

    // Courtyard tile floor
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 36),
      new THREE.MeshStandardMaterial({ color: 0x263248, roughness: 0.82 })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    envGroup.add(floorMesh);

    // Subtle Zellij tile grid lines
    const grid = new THREE.GridHelper(34, 17, 0xd97706, 0x334155);
    grid.position.y = 0.015;
    envGroup.add(grid);

    // 4 Corner Zone Patios (color-coded so players orient fast)
    const zones = [
      { x: -10, z: -10, color: 0x7c2d12 }, // NW Café (Terracotta)
      { x: 10, z: -10, color: 0x065f46 }, // NE Souk Lounge (Emerald)
      { x: -10, z: 10, color: 0x1e3a8a }, // SW Plant Alley (Majorelle Blue)
      { x: 10, z: 10, color: 0x581c87 }, // SE Garden (Amber/Plum)
    ];
    for (const zc of zones) {
      const patio = new THREE.Mesh(
        new THREE.PlaneGeometry(9.5, 9.5),
        new THREE.MeshStandardMaterial({ color: zc.color, roughness: 0.9 })
      );
      patio.rotation.x = -Math.PI / 2;
      patio.position.set(zc.x, 0.02, zc.z);
      patio.receiveShadow = true;
      envGroup.add(patio);
    }

    // Riad Perimeter Walls with Moroccan crenellations
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xb4532a, roughness: 0.72 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.6 });
    const wallSegments = [
      { x: 0, z: -16.8, w: 34.6, d: 0.9 },
      { x: 0, z: 16.8, w: 34.6, d: 0.9 },
      { x: -16.8, z: 0, w: 0.9, d: 34.6 },
      { x: 16.8, z: 0, w: 0.9, d: 34.6 },
    ];
    for (const ws of wallSegments) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ws.w, 3.4, ws.d), wallMat);
      wall.position.set(ws.x, 1.7, ws.z);
      wall.receiveShadow = true;
      wall.castShadow = true;
      envGroup.add(wall);

      const crown = new THREE.Mesh(new THREE.BoxGeometry(ws.w, 0.22, ws.d + 0.12), trimMat);
      crown.position.set(ws.x, 3.5, ws.z);
      envGroup.add(crown);
    }

    // Central Zellij Fountain (radius ~2.9m)
    const fountainBasin = new THREE.Mesh(
      new THREE.CylinderGeometry(2.65, 2.85, 0.58, 12),
      new THREE.MeshStandardMaterial({ color: 0x0d9488, roughness: 0.35 })
    );
    fountainBasin.position.y = 0.29;
    fountainBasin.receiveShadow = true;
    fountainBasin.castShadow = true;
    envGroup.add(fountainBasin);

    const fountainWater = new THREE.Mesh(
      new THREE.CylinderGeometry(2.35, 2.35, 0.48, 24),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.45,
        roughness: 0.12,
      })
    );
    fountainWater.position.y = 0.32;
    envGroup.add(fountainWater);

    const fountainTier = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.85, 1.25, 12),
      new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.4 })
    );
    fountainTier.position.y = 0.75;
    fountainTier.castShadow = true;
    envGroup.add(fountainTier);

    // 4 Courtyard Date Palms
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.75 });
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.55 });
    for (const [px, pz] of PALM_POSITIONS) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 3.8, 12), trunkMat);
      trunk.position.set(px, 1.9, pz);
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      envGroup.add(trunk);

      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.9, 6), frondMat);
        frond.position.set(px + Math.cos(a) * 0.85, 3.85, pz + Math.sin(a) * 0.85);
        frond.rotation.z = -Math.cos(a) * 1.1;
        frond.rotation.x = Math.sin(a) * 1.1;
        frond.castShadow = true;
        envGroup.add(frond);
      }
    }

    // Decor group (populated once GLB assets finish loading)
    const decorGroup = new THREE.Group();
    envGroup.add(decorGroup);

    // Hunter Blindfold Cage (during HIDE_PHASE)
    const cageMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(FOUNTAIN_RADIUS + 0.25, FOUNTAIN_RADIUS + 0.25, 3.4, 18, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xf43f5e,
        emissive: 0xe11d48,
        emissiveIntensity: 0.65,
        wireframe: true,
      })
    );
    cageMesh.position.y = 1.7;
    scene.add(cageMesh);

    // Subtle ground ring under local player
    const myRingMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.78, 32),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
      })
    );
    myRingMesh.rotation.x = -Math.PI / 2;
    myRingMesh.position.y = 0.04;
    scene.add(myRingMesh);

    // Aim direction indicator in front of Hunter
    const hunterAimMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.22, 32),
      new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.42,
      })
    );
    hunterAimMesh.rotation.x = -Math.PI / 2;
    hunterAimMesh.position.y = 0.05;
    hunterAimMesh.visible = false;
    scene.add(hunterAimMesh);

    // 4. Particle Effects Manager
    const effects = new GhammadaEffects(scene);

    // 5. Load CC0 3D Assets (.glb models) & Populate Decor
    let loadedAssets: GhammadaAssets | null = null;
    let assetsVersion = 0;

    const worldPropMeshes = new Map<
      string,
      { group: THREE.Object3D; propId: GhammadaPropId; ver: number; wasDestroyed: boolean }
    >();

    interface PlayerRenderEntry {
      root: THREE.Group;
      visual: THREE.Group;
      currentType: string;
      ver: number;
      hunterRig?: HunterRig;
      hopPhase: number;
      lastX: number;
      lastZ: number;
      wasCaught: boolean;
      lastStrikeAt: number;
      lastTauntAt: number;
      lastDashAt: number;
    }
    const playerMeshes = new Map<string, PlayerRenderEntry>();

    loadGhammadaAssets((ratio) => {
      if (!disposed) setLoadProgress(ratio);
    }).then((assets) => {
      if (disposed) return;
      loadedAssets = assets;
      assetsVersion++;

      // Populate Riad furniture from GHAMMADA_DECOR
      decorGroup.clear();
      for (const d of GHAMMADA_DECOR) {
        const obj = createDecorObject(assets, d.model, d.height);
        if (obj) {
          obj.position.set(d.x, 0, d.z);
          obj.rotation.y = d.rotY;
          decorGroup.add(obj);
        }
      }
    });

    // 6. Keyboard Controls (Desktop WASD / Arrow Keys)
    const keysPressed: Record<string, boolean> = {};
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed[e.code] = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // 7. Dedicated Multi-Touch Camera Orbit (tracks specific pointerId so joystick never conflicts)
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

      const currentPitch = localPosRef.current.camPitch ?? 0.42;
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

    // 8. Responsive Resize Observer + Window Resize
    const handleResize = () => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);
    const resizeObs =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(handleResize) : null;
    resizeObs?.observe(container);

    // Pre-build collider list without center fountain for HIDE_PHASE hunter cage
    const collidersWithoutFountain = STATIC_COLLIDERS.filter(
      (c) => !(c.x === 0 && c.z === 0)
    );

    // 9. Main 60 FPS Game Loop
    let animFrameId = 0;
    let lastTime = performance.now();
    let lastServerSyncMs = 0;

    const animate = (nowMs: number) => {
      animFrameId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastTime) / 1000));
      lastTime = nowMs;

      const currentPhase = phaseRef.current;
      const allEntities = entitiesRef.current;
      const myServerEnt = allEntities[myPlayerId];

      // Process any queued instant FX (local or Supabase live broadcast)
      if (fxQueueRef?.current && fxQueueRef.current.length > 0) {
        const queue = fxQueueRef.current.splice(0, fxQueueRef.current.length);
        for (const fx of queue) {
          if (fx.k === "strike") {
            const hitX = fx.x + Math.sin(fx.r ?? 0) * 1.3;
            const hitZ = fx.z + Math.cos(fx.r ?? 0) * 1.3;
            effects.dust(hitX, hitZ);
            const pEntry = playerMeshes.get(fx.i);
            if (pEntry?.hunterRig) {
              playHunterPunch(pEntry.hunterRig);
            }
          } else if (fx.k === "whistle") {
            effects.notes(fx.x, fx.z);
          } else if (fx.k === "dash") {
            effects.smoke(fx.x, fx.z);
          } else if (fx.k === "morph") {
            effects.smoke(fx.x, fx.z);
          }
        }
      }

      // Toggle Hunter Blindfold Cage
      cageMesh.visible = currentPhase === "HIDE_PHASE";
      if (cageMesh.visible) {
        cageMesh.rotation.y += dt * 0.7;
      }

      // A. Sync World Decoy Props
      const activeWorldProps = worldPropsRef.current || [];
      const seenWpIds = new Set<string>();
      for (const wp of activeWorldProps) {
        seenWpIds.add(wp.id);
        let entry = worldPropMeshes.get(wp.id);
        if (!entry || entry.propId !== wp.propId || entry.ver !== assetsVersion) {
          const prevDestroyed = entry?.wasDestroyed ?? Boolean(wp.isDestroyed);
          if (entry) scene.remove(entry.group);
          const group = createPropObject(loadedAssets, wp.propId);
          scene.add(group);
          entry = {
            group,
            propId: wp.propId,
            ver: assetsVersion,
            wasDestroyed: prevDestroyed,
          };
          worldPropMeshes.set(wp.id, entry);
        }

        if (wp.isDestroyed && !entry.wasDestroyed) {
          entry.wasDestroyed = true;
          effects.shatter(wp.x, wp.z);
        } else if (!wp.isDestroyed) {
          entry.wasDestroyed = false;
        }

        entry.group.position.set(wp.x, 0, wp.z);
        entry.group.rotation.y = wp.rotY;
        entry.group.visible = !wp.isDestroyed;
      }
      for (const [id, entry] of worldPropMeshes.entries()) {
        if (!seenWpIds.has(id)) {
          scene.remove(entry.group);
          worldPropMeshes.delete(id);
        }
      }

      // B. Local Player Movement & Collisions (Camera-Relative!)
      let localMoving = false;
      if (myServerEnt && !myServerEnt.isCaught) {
        const isHunterInCage =
          myServerEnt.role === "HUNTER" && currentPhase === "HIDE_PHASE";
        let jx = joystickVecRef.current.dx;
        let jy = joystickVecRef.current.dz;

        if (keysPressed["KeyW"] || keysPressed["ArrowUp"]) jy -= 1;
        if (keysPressed["KeyS"] || keysPressed["ArrowDown"]) jy += 1;
        if (keysPressed["KeyA"] || keysPressed["ArrowLeft"]) jx -= 1;
        if (keysPressed["KeyD"] || keysPressed["ArrowRight"]) jx += 1;

        const inputMag = Math.hypot(jx, jy);
        if (inputMag > 0.04 && !isHunterInCage && !localPosRef.current.isLocked) {
          localMoving = true;
          const move = cameraRelativeMove(jx, jy, localPosRef.current.camYaw);
          const baseSpeed = myServerEnt.role === "HUNTER" ? 6.7 : 6.0;
          const propMult =
            myServerEnt.role === "HIDER"
              ? GHAMMADA_PROPS[localPosRef.current.propId]?.speedMultiplier || 1.0
              : 1.0;

          const rawX = localPosRef.current.x + move.x * baseSpeed * propMult * dt;
          const rawZ = localPosRef.current.z + move.z * baseSpeed * propMult * dt;

          const activeColliders =
            currentPhase === "HIDE_PHASE" ? collidersWithoutFountain : STATIC_COLLIDERS;
          const resolved = resolveCollisions(rawX, rawZ, 0.45, activeColliders);

          localPosRef.current.x = resolved.x;
          localPosRef.current.z = resolved.z;

          const targetFacing = facingFromDirection(move);
          localPosRef.current.rotY +=
            angleDelta(localPosRef.current.rotY, targetFacing) * damp(14, dt);
        }

        localPosRef.current.isMoving = localMoving;

        // Notify parent so it can broadcast over Supabase (80ms) and/or server (260ms)
        if (localMoving || nowMs - lastServerSyncMs > 300) {
          if (localMoving) lastServerSyncMs = nowMs;
          onPosTickRef.current?.(
            localPosRef.current.x,
            localPosRef.current.z,
            localPosRef.current.rotY,
            localMoving
          );
        }
      }

      // C. Render & Animate All Players (Local + Live Peers + Server Entities)
      const seenPlayerIds = new Set<string>();
      const nowEpoch = Date.now();

      for (const ent of Object.values(allEntities)) {
        seenPlayerIds.add(ent.playerId);
        const isMe = ent.playerId === myPlayerId;
        const livePeer = !isMe ? peersRef?.current.get(ent.playerId) : undefined;
        const isLiveFresh = Boolean(
          livePeer && nowMs - livePeer.t < LIVE_STALE_MS
        );

        const activePropId: GhammadaPropId = isMe
          ? localPosRef.current.propId
          : isLiveFresh && livePeer?.p
          ? livePeer.p
          : ent.propId;

        const desiredType = ent.role === "HUNTER" ? "HUNTER" : activePropId;

        let pEntry = playerMeshes.get(ent.playerId);
        if (!pEntry || pEntry.currentType !== desiredType || pEntry.ver !== assetsVersion) {
          const prevX = pEntry?.lastX ?? ent.x;
          const prevZ = pEntry?.lastZ ?? ent.z;
          const prevCaught = pEntry?.wasCaught ?? ent.isCaught;
          if (pEntry) scene.remove(pEntry.root);

          const root = new THREE.Group();
          const visual = new THREE.Group();
          root.add(visual);

          let hunterRig: HunterRig | undefined;
          if (desiredType === "HUNTER") {
            hunterRig = createHunterRig(loadedAssets);
            visual.add(hunterRig.root);
          } else {
            const propObj = createPropObject(loadedAssets, desiredType as GhammadaPropId);
            visual.add(propObj);
          }

          root.position.set(prevX, 0, prevZ);
          scene.add(root);

          pEntry = {
            root,
            visual,
            currentType: desiredType,
            ver: assetsVersion,
            hunterRig,
            hopPhase: 0,
            lastX: prevX,
            lastZ: prevZ,
            wasCaught: prevCaught,
            lastStrikeAt: ent.lastStrikeAt ?? 0,
            lastTauntAt: ent.lastTauntAt ?? 0,
            lastDashAt: ent.lastDashAt ?? 0,
          };
          playerMeshes.set(ent.playerId, pEntry);
        }

        // Trigger catch poof + stars when a hider transitions to caught
        if (ent.isCaught && !pEntry.wasCaught) {
          pEntry.wasCaught = true;
          effects.poof(pEntry.root.position.x, pEntry.root.position.z);
        } else if (!ent.isCaught) {
          pEntry.wasCaught = false;
        }

        // Trigger server-observed FX if not already triggered via live channel
        if (ent.lastStrikeAt && ent.lastStrikeAt !== pEntry.lastStrikeAt) {
          pEntry.lastStrikeAt = ent.lastStrikeAt;
          if (pEntry.hunterRig) playHunterPunch(pEntry.hunterRig);
          const hitX = pEntry.root.position.x + Math.sin(pEntry.root.rotation.y) * 1.3;
          const hitZ = pEntry.root.position.z + Math.cos(pEntry.root.rotation.y) * 1.3;
          effects.dust(hitX, hitZ);
        }
        if (ent.lastTauntAt && ent.lastTauntAt !== pEntry.lastTauntAt) {
          pEntry.lastTauntAt = ent.lastTauntAt;
          effects.notes(pEntry.root.position.x, pEntry.root.position.z);
        }
        if (ent.lastDashAt && ent.lastDashAt !== pEntry.lastDashAt) {
          pEntry.lastDashAt = ent.lastDashAt;
          effects.smoke(pEntry.root.position.x, pEntry.root.position.z);
        }

        pEntry.root.visible = !ent.isCaught;

        // Target position & rotation (Me -> localPosRef, Peer -> livePeer or server ent)
        const targetX = isMe
          ? localPosRef.current.x
          : isLiveFresh && livePeer
          ? livePeer.x
          : ent.x;
        const targetZ = isMe
          ? localPosRef.current.z
          : isLiveFresh && livePeer
          ? livePeer.z
          : ent.z;
        const targetRot = isMe
          ? localPosRef.current.rotY
          : isLiveFresh && livePeer
          ? livePeer.r
          : ent.rotY;
        const isLockedNow = isMe
          ? localPosRef.current.isLocked
          : isLiveFresh && livePeer?.l !== undefined
          ? livePeer.l
          : ent.isLocked;

        const prevX = pEntry.root.position.x;
        const prevZ = pEntry.root.position.z;

        if (isMe) {
          pEntry.root.position.set(targetX, 0, targetZ);
          pEntry.root.rotation.y = targetRot;
          myRingMesh.position.set(targetX, 0.04, targetZ);
          myRingMesh.visible = !ent.isCaught;

          if (ent.role === "HUNTER" && currentPhase === "HUNT_PHASE") {
            hunterAimMesh.visible = true;
            hunterAimMesh.position.set(
              targetX + Math.sin(targetRot) * 1.3,
              0.045,
              targetZ + Math.cos(targetRot) * 1.3
            );
          } else {
            hunterAimMesh.visible = false;
          }
        } else {
          const blend = damp(14, dt);
          pEntry.root.position.x += (targetX - pEntry.root.position.x) * blend;
          pEntry.root.position.z += (targetZ - pEntry.root.position.z) * blend;
          pEntry.root.rotation.y +=
            angleDelta(pEntry.root.rotation.y, targetRot) * blend;
        }

        const frameDist = Math.hypot(
          pEntry.root.position.x - prevX,
          pEntry.root.position.z - prevZ
        );
        const speed = frameDist / dt;
        const isMovingEntity = isMe
          ? localMoving
          : isLiveFresh && livePeer?.m !== undefined
          ? livePeer.m || speed > 0.25
          : speed > 0.25;

        pEntry.lastX = pEntry.root.position.x;
        pEntry.lastZ = pEntry.root.position.z;

        // Animate Hunter skeletal rig & hammer swing
        if (pEntry.hunterRig) {
          playHunterAnim(
            pEntry.hunterRig,
            isMovingEntity ? (speed > 2.0 || isMe ? "Running" : "Walking") : "Idle"
          );
          pEntry.hunterRig.mixer?.update(dt);
          updateHunterFez(pEntry.hunterRig);

          const strikeAge = pEntry.lastStrikeAt ? nowEpoch - pEntry.lastStrikeAt : 9999;
          if (strikeAge >= 0 && strikeAge < 520) {
            const t = strikeAge / 520;
            pEntry.hunterRig.hammerPivot.rotation.x = -0.35 + Math.sin(t * Math.PI) * 1.65;
          } else {
            pEntry.hunterRig.hammerPivot.rotation.x = -0.35;
          }
        } else {
          // Hider Prop Hop + Squash-and-Stretch when moving; completely still when locked/idle
          if (isMovingEntity && !isLockedNow) {
            pEntry.hopPhase += dt * 11.5;
            const hop = Math.abs(Math.sin(pEntry.hopPhase));
            pEntry.visual.position.y = hop * 0.24;
            pEntry.visual.rotation.z = Math.sin(pEntry.hopPhase) * 0.09;
            const sy = 1 + (hop - 0.35) * 0.14;
            const sxz = 1 / Math.sqrt(sy);
            pEntry.visual.scale.set(sxz, sy, sxz);
          } else {
            const settle = damp(16, dt);
            pEntry.visual.position.y += (0 - pEntry.visual.position.y) * settle;
            pEntry.visual.rotation.z += (0 - pEntry.visual.rotation.z) * settle;
            pEntry.visual.scale.x += (1 - pEntry.visual.scale.x) * settle;
            pEntry.visual.scale.y += (1 - pEntry.visual.scale.y) * settle;
            pEntry.visual.scale.z += (1 - pEntry.visual.scale.z) * settle;
          }
        }
      }

      for (const [id, entry] of playerMeshes.entries()) {
        if (!seenPlayerIds.has(id)) {
          scene.remove(entry.root);
          playerMeshes.delete(id);
        }
      }

      // D. Update 3D Particle System
      effects.update(dt);

      // E. Over-the-Shoulder 3rd-Person Follow Camera (synchronized with controlsMath!)
      const camYaw = localPosRef.current.camYaw;
      const camPitch = localPosRef.current.camPitch ?? 0.42;
      const focusX = localPosRef.current.x;
      const focusZ = localPosRef.current.z;

      if (myServerEnt?.role === "HUNTER" && currentPhase === "HIDE_PHASE") {
        // Blindfold orbital camera above central fountain
        const orbitAngle = nowMs * 0.0011;
        camera.position.set(
          Math.sin(orbitAngle) * 4.4,
          10.5,
          Math.cos(orbitAngle) * 4.4
        );
        camera.lookAt(0, 1.0, 0);
      } else {
        const isHunterRole = myServerEnt?.role === "HUNTER";
        const isLockedHider = !isHunterRole && localPosRef.current.isLocked;
        const baseDist = isHunterRole ? 4.9 : isLockedHider ? 5.8 : 4.5;
        const focusY = isHunterRole ? 1.35 : 0.85;

        // Camera sits BEHIND the player along -cameraForward(camYaw) = (-sin(yaw), -cos(yaw))
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
        const vertDist = baseDist * Math.sin(camPitch) * Math.max(0.55, distRatio);

        const desiredCamX = focusX + backDirX * clampedHorizDist;
        const desiredCamZ = focusZ + backDirZ * clampedHorizDist;
        const desiredCamY = Math.max(0.7, focusY + vertDist);

        const camBlend = damp(16, dt);
        camera.position.x += (desiredCamX - camera.position.x) * camBlend;
        camera.position.y += (desiredCamY - camera.position.y) * camBlend;
        camera.position.z += (desiredCamZ - camera.position.z) * camBlend;

        const shakeAmt = effects.shake * 0.3;
        const shakeX = shakeAmt > 0 ? (Math.random() - 0.5) * shakeAmt : 0;
        const shakeY = shakeAmt > 0 ? (Math.random() - 0.5) * shakeAmt : 0;
        camera.lookAt(focusX + shakeX, focusY + shakeY, focusZ);
      }

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
      effects.dispose();
      renderer.dispose();
    };
  }, [myPlayerId, localPosRef, joystickVecRef, peersRef, fxQueueRef]);

  return (
    <div
      className={
        fullScreen
          ? "relative w-full h-full overflow-hidden bg-slate-950 select-none touch-none"
          : "relative w-full h-[380px] sm:h-[460px] rounded-3xl overflow-hidden border-2 border-amber-500/40 shadow-2xl shadow-black/80 bg-slate-950 select-none touch-none"
      }
    >
      <div ref={mountRef} className="w-full h-full" />
      {loadProgress > 0 && loadProgress < 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/75 border border-amber-400/40 text-[11px] font-bold text-amber-300 pointer-events-none">
          جاري تحميل المجسمات 3D... {Math.round(loadProgress * 100)}%
        </div>
      )}
    </div>
  );
}
