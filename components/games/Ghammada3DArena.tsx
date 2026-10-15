"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  GhammadaPhase,
  GhammadaPlayerEntity,
  GhammadaPropId,
  GhammadaWorldProp,
  GHAMMADA_PROPS,
} from "@/games/ghammada/types";

interface Ghammada3DArenaProps {
  phase: GhammadaPhase;
  myPlayerId: string;
  entities: Record<string, GhammadaPlayerEntity>;
  worldProps: GhammadaWorldProp[];
  playersMap: Record<string, string>; // id -> nickname
  localPosRef: React.MutableRefObject<{
    x: number;
    z: number;
    rotY: number;
    propId: GhammadaPropId;
    isLocked: boolean;
    camYaw: number;
  }>;
  joystickVecRef: React.MutableRefObject<{ dx: number; dz: number }>;
  onPositionTick?: (x: number, z: number, rotY: number) => void;
}

/**
 * Builds a recognizable, stylized 3D mesh for each of the 8 Moroccan props
 */
function buildPropMesh(propId: GhammadaPropId): THREE.Group {
  const group = new THREE.Group();

  switch (propId) {
    case "tajine": {
      // Base dish
      const baseGeo = new THREE.CylinderGeometry(0.75, 0.6, 0.22, 20);
      const clayMat = new THREE.MeshStandardMaterial({
        color: 0xc2410c,
        roughness: 0.55,
      });
      const base = new THREE.Mesh(baseGeo, clayMat);
      base.position.y = 0.11;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      // Conical lid
      const coneGeo = new THREE.ConeGeometry(0.7, 0.85, 20);
      const cone = new THREE.Mesh(coneGeo, clayMat);
      cone.position.y = 0.64;
      cone.castShadow = true;
      group.add(cone);

      // Gold decorative ring
      const ringGeo = new THREE.TorusGeometry(0.45, 0.035, 10, 24);
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        metalness: 0.6,
        roughness: 0.3,
      });
      const ring = new THREE.Mesh(ringGeo, goldMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.55;
      group.add(ring);

      // Top knob
      const knobGeo = new THREE.SphereGeometry(0.14, 14, 14);
      const knob = new THREE.Mesh(knobGeo, clayMat);
      knob.position.y = 1.08;
      group.add(knob);
      break;
    }

    case "berrad": {
      // Silver Moroccan Teapot
      const silverMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.8,
        roughness: 0.2,
      });
      const bellyGeo = new THREE.SphereGeometry(0.52, 20, 18);
      const belly = new THREE.Mesh(bellyGeo, silverMat);
      belly.scale.set(1, 1.15, 1);
      belly.position.y = 0.58;
      belly.castShadow = true;
      group.add(belly);

      // Foot base
      const footGeo = new THREE.CylinderGeometry(0.32, 0.42, 0.16, 16);
      const foot = new THREE.Mesh(footGeo, silverMat);
      foot.position.y = 0.08;
      group.add(foot);

      // Conical crown lid
      const lidGeo = new THREE.ConeGeometry(0.3, 0.42, 16);
      const lid = new THREE.Mesh(lidGeo, silverMat);
      lid.position.y = 1.25;
      group.add(lid);

      // Spout
      const spoutGeo = new THREE.CylinderGeometry(0.05, 0.11, 0.65, 12);
      const spout = new THREE.Mesh(spoutGeo, silverMat);
      spout.position.set(0.48, 0.72, 0);
      spout.rotation.z = -Math.PI / 4;
      group.add(spout);

      // Handle
      const handleGeo = new THREE.TorusGeometry(0.28, 0.045, 10, 20);
      const handle = new THREE.Mesh(handleGeo, silverMat);
      handle.position.set(-0.42, 0.68, 0);
      group.add(handle);
      break;
    }

    case "butagaz": {
      // Iconic Blue Moroccan Gas Cylinder
      const blueMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        roughness: 0.4,
        metalness: 0.3,
      });
      const cylGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.85, 20);
      const body = new THREE.Mesh(cylGeo, blueMat);
      body.position.y = 0.48;
      body.castShadow = true;
      group.add(body);

      const topDomeGeo = new THREE.SphereGeometry(0.52, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const topDome = new THREE.Mesh(topDomeGeo, blueMat);
      topDome.position.y = 0.9;
      group.add(topDome);

      // Collar guard
      const collarGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.25, 16, 1, true);
      const collar = new THREE.Mesh(collarGeo, blueMat);
      collar.position.y = 1.18;
      group.add(collar);

      // Brass valve
      const brassMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.7, roughness: 0.3 });
      const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 12), brassMat);
      valve.position.y = 1.15;
      group.add(valve);
      break;
    }

    case "chair": {
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.7 });
      const seatMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 });

      // Seat
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.1, 0.85), seatMat);
      seat.position.y = 0.55;
      seat.castShadow = true;
      group.add(seat);

      // 4 legs
      const legGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.55, 8);
      [
        [-0.35, -0.35],
        [0.35, -0.35],
        [-0.35, 0.35],
        [0.35, 0.35],
      ].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(legGeo, woodMat);
        leg.position.set(lx, 0.275, lz);
        group.add(leg);
      });

      // Backrest
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.65, 0.09), woodMat);
      back.position.set(0, 0.92, -0.38);
      back.castShadow = true;
      group.add(back);
      break;
    }

    case "crate": {
      const crateMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.75 });
      const trimMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 1.05), crateMat);
      box.position.y = 0.525;
      box.castShadow = true;
      box.receiveShadow = true;
      group.add(box);

      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 1.1), trimMat);
      frame.position.y = 0.95;
      group.add(frame);
      break;
    }

    case "amphora": {
      const terraMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 });
      const lower = new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 16), terraMat);
      lower.scale.set(1, 1.35, 1);
      lower.position.y = 0.62;
      lower.castShadow = true;
      group.add(lower);

      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.45, 16), terraMat);
      neck.position.y = 1.25;
      group.add(neck);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 10, 20), terraMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 1.46;
      group.add(rim);
      break;
    }

    case "della7a": {
      // Giant Striped Watermelon
      const greenMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.35 });
      const melon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 18), greenMat);
      melon.scale.set(1.2, 0.95, 1);
      melon.position.y = 0.52;
      melon.castShadow = true;
      group.add(melon);

      const stripeMat = new THREE.MeshStandardMaterial({ color: 0x052e16, roughness: 0.4 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.04, 8, 24), stripeMat);
      ring.position.y = 0.52;
      group.add(ring);
      break;
    }

    case "fanar":
    default: {
      // Glowing Moroccan Brass Lantern
      const brassMat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        metalness: 0.75,
        roughness: 0.25,
      });
      const glowMat = new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.9,
      });

      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.16, 6), brassMat);
      base.position.y = 0.08;
      group.add(base);

      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.75, 6), glowMat);
      core.position.y = 0.52;
      group.add(core);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.45, 6), brassMat);
      roof.position.y = 1.1;
      roof.castShadow = true;
      group.add(roof);
      break;
    }
  }

  return group;
}

/**
 * Builds the 3D Hunter Avatar (with Moroccan Fez hat & glowing 3D Hammer!)
 */
function buildHunterMesh(): { group: THREE.Group; hammerPivot: THREE.Group } {
  const group = new THREE.Group();

  // Body tunic
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.65, 12, 16), bodyMat);
  body.position.y = 0.75;
  body.castShadow = true;
  group.add(body);

  // Head
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.45 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 16), skinMat);
  head.position.y = 1.48;
  head.castShadow = true;
  group.add(head);

  // Sunglasses / Visor (facing +Z in local coordinates)
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.2 });
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.2), visorMat);
  visor.position.set(0, 1.5, 0.26);
  group.add(visor);

  // Moroccan Tarbouche (Fez Hat)
  const fezMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 });
  const fez = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.34, 16), fezMat);
  fez.position.y = 1.85;
  group.add(fez);

  // Hammer Pivot on Right Hand
  const hammerPivot = new THREE.Group();
  hammerPivot.position.set(0.55, 0.95, 0.2);

  const handleMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 10), handleMat);
  handle.position.y = 0.4;
  hammerPivot.add(handle);

  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    metalness: 0.6,
    roughness: 0.25,
    emissive: 0xd97706,
    emissiveIntensity: 0.3,
  });
  const hammerHead = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.58, 12), headMat);
  hammerHead.rotation.x = Math.PI / 2;
  hammerHead.position.y = 0.88;
  hammerPivot.add(hammerHead);

  group.add(hammerPivot);

  return { group, hammerPivot };
}

export function Ghammada3DArena({
  phase,
  myPlayerId,
  entities,
  worldProps,
  localPosRef,
  joystickVecRef,
  onPositionTick,
}: Ghammada3DArenaProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
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

    // 1. Initialize Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, 0.016);

    const camera = new THREE.PerspectiveCamera(
      58,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      120
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 2. Lighting (Warm Moroccan Sunset + Courtyard Glow)
    const ambientLight = new THREE.AmbientLight(0xffedd5, 0.75);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfde68a, 1.35);
    dirLight.position.set(16, 28, 14);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 2;
    dirLight.shadow.camera.far = 65;
    const d = 20;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    const fountainLight = new THREE.PointLight(0x22d3ee, 1.5, 14);
    fountainLight.position.set(0, 2.5, 0);
    scene.add(fountainLight);

    // 3. Build 3D Moroccan Courtyard & Souk Environment (34m x 34m)
    const envGroup = new THREE.Group();
    scene.add(envGroup);

    // Courtyard Floor
    const floorGeo = new THREE.PlaneGeometry(36, 36);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    envGroup.add(floor);

    // Zellij Decorative Grid Helper
    const grid = new THREE.GridHelper(34, 17, 0xf59e0b, 0x334155);
    grid.position.y = 0.02;
    envGroup.add(grid);

    // 4 Quadrant Zone Carpets / Patios so players can orient themselves easily
    const zoneConfigs = [
      { x: -9, z: -9, color: 0x7c2d12 }, // Café Terracotta
      { x: 9, z: -9, color: 0x065f46 },  // Souk Emerald
      { x: -9, z: 9, color: 0x1e3a8a },  // Medina Cobalt
      { x: 9, z: 9, color: 0x701a75 },   // Garden Majorelle
    ];
    zoneConfigs.forEach((zc) => {
      const rug = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.MeshStandardMaterial({ color: zc.color, roughness: 0.9 })
      );
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(zc.x, 0.03, zc.z);
      rug.receiveShadow = true;
      envGroup.add(rug);
    });

    // Outer Riad Perimeter Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.7 });
    const wallPositions = [
      { x: 0, z: -17, w: 35, d: 1 },
      { x: 0, z: 17, w: 35, d: 1 },
      { x: -17, z: 0, w: 1, d: 35 },
      { x: 17, z: 0, w: 1, d: 35 },
    ];
    wallPositions.forEach((wp) => {
      const wMesh = new THREE.Mesh(new THREE.BoxGeometry(wp.w, 3.2, wp.d), wallMat);
      wMesh.position.set(wp.x, 1.6, wp.z);
      wMesh.receiveShadow = true;
      wMesh.castShadow = true;
      envGroup.add(wMesh);
    });

    // Central Zellij Fountain (0, 0)
    const fountainWall = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.8, 0.55, 8),
      new THREE.MeshStandardMaterial({ color: 0x0d9488, roughness: 0.4 })
    );
    fountainWall.position.y = 0.275;
    fountainWall.receiveShadow = true;
    envGroup.add(fountainWall);

    const fountainWater = new THREE.Mesh(
      new THREE.CylinderGeometry(2.3, 2.3, 0.45, 16),
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x0891b2,
        emissiveIntensity: 0.4,
        roughness: 0.15,
      })
    );
    fountainWater.position.y = 0.3;
    envGroup.add(fountainWater);

    // 4 Courtyard Palm Pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.5 });
    [
      [-5.5, -5.5],
      [5.5, -5.5],
      [-5.5, 5.5],
      [5.5, 5.5],
    ].forEach(([px, pz]) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 3.4, 10), pillarMat);
      trunk.position.set(px, 1.7, pz);
      trunk.castShadow = true;
      envGroup.add(trunk);

      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.35, 12, 10), leafMat);
      canopy.scale.set(1.2, 0.6, 1.2);
      canopy.position.set(px, 3.5, pz);
      canopy.castShadow = true;
      envGroup.add(canopy);
    });

    // Hunter Blindfold Cage (Visible during HIDE_PHASE)
    const cageMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(2.9, 2.9, 3.5, 16, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xf43f5e,
        emissive: 0xe11d48,
        emissiveIntensity: 0.6,
        wireframe: true,
      })
    );
    cageMesh.position.y = 1.75;
    scene.add(cageMesh);

    // Local Player Selection Halo Ring on Ground
    const myRingMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.95, 28),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide })
    );
    myRingMesh.rotation.x = -Math.PI / 2;
    myRingMesh.position.y = 0.05;
    scene.add(myRingMesh);

    // 4. Dynamic Registries for World Props & Player Entities
    const worldPropMeshes = new Map<string, { group: THREE.Group; propId: GhammadaPropId }>();
    const playerMeshes = new Map<
      string,
      {
        root: THREE.Group;
        currentType: string; // "HUNTER" or propId
        hammerPivot?: THREE.Group;
        strikeRing?: THREE.Mesh;
        tauntRing?: THREE.Mesh;
      }
    >();

    // Keyboard state for Desktop testing (WASD / Arrows)
    const keysPressed: Record<string, boolean> = {};
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed[e.code] = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Pointer drag on canvas to orbit camera (360° look around)
    let isOrbiting = false;
    let lastPointerX = 0;
    const domEl = renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      isOrbiting = true;
      lastPointerX = e.clientX;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isOrbiting) return;
      const dx = e.clientX - lastPointerX;
      lastPointerX = e.clientX;
      localPosRef.current.camYaw -= dx * 0.008;
    };
    const onPointerUp = () => {
      isOrbiting = false;
    };

    domEl.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    // Handle Window Resize
    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    // 5. Main 60 FPS Animation & Physics Loop
    let animFrameId = 0;
    let lastTime = performance.now();
    let lastSyncSent = 0;

    const animate = (nowMs: number) => {
      animFrameId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (nowMs - lastTime) / 1000);
      lastTime = nowMs;

      const currentPhase = phaseRef.current;
      const allEntities = entitiesRef.current;
      const myServerEnt = allEntities[myPlayerId];

      // Toggle Hunter Cage visibility
      cageMesh.visible = currentPhase === "HIDE_PHASE";
      if (cageMesh.visible) {
        cageMesh.rotation.y += dt * 0.8;
      }

      // A. Update Static World Props
      const activeWorldProps = worldPropsRef.current || [];
      const seenWpIds = new Set<string>();
      for (const wp of activeWorldProps) {
        seenWpIds.add(wp.id);
        let entry = worldPropMeshes.get(wp.id);
        if (!entry || entry.propId !== wp.propId) {
          if (entry) scene.remove(entry.group);
          const g = buildPropMesh(wp.propId);
          scene.add(g);
          entry = { group: g, propId: wp.propId };
          worldPropMeshes.set(wp.id, entry);
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

      // B. Local Player Movement & Physics
      if (myServerEnt && !myServerEnt.isCaught) {
        const isHunterInCage = myServerEnt.role === "HUNTER" && currentPhase === "HIDE_PHASE";
        let inputX = joystickVecRef.current.dx;
        let inputZ = joystickVecRef.current.dz;

        if (keysPressed["KeyW"] || keysPressed["ArrowUp"]) inputZ -= 1;
        if (keysPressed["KeyS"] || keysPressed["ArrowDown"]) inputZ += 1;
        if (keysPressed["KeyA"] || keysPressed["ArrowLeft"]) inputX -= 1;
        if (keysPressed["KeyD"] || keysPressed["ArrowRight"]) inputX += 1;

        const mag = Math.hypot(inputX, inputZ);
        if (mag > 0.05 && !isHunterInCage && !localPosRef.current.isLocked) {
          const normX = inputX / Math.max(1, mag);
          const normZ = inputZ / Math.max(1, mag);

          // Rotate input vector relative to camera yaw
          const yaw = localPosRef.current.camYaw;
          const moveX = normX * Math.cos(yaw) + normZ * Math.sin(yaw);
          const moveZ = normZ * Math.cos(yaw) - normX * Math.sin(yaw);

          const baseSpeed = myServerEnt.role === "HUNTER" ? 6.6 : 6.0;
          const propSpeedMult =
            myServerEnt.role === "HIDER"
              ? GHAMMADA_PROPS[localPosRef.current.propId]?.speedMultiplier || 1.0
              : 1.0;

          let nextX = localPosRef.current.x + moveX * baseSpeed * propSpeedMult * dt;
          let nextZ = localPosRef.current.z + moveZ * baseSpeed * propSpeedMult * dt;

          // Keep outside center fountain radius (2.7m) during HUNT_PHASE
          const distFromCenter = Math.hypot(nextX, nextZ);
          if (distFromCenter < 2.75 && distFromCenter > 0.01 && currentPhase !== "HIDE_PHASE") {
            nextX = (nextX / distFromCenter) * 2.75;
            nextZ = (nextZ / distFromCenter) * 2.75;
          }

          localPosRef.current.x = Math.max(-15.8, Math.min(15.8, nextX));
          localPosRef.current.z = Math.max(-15.8, Math.min(15.8, nextZ));
          localPosRef.current.rotY = Math.atan2(moveX, moveZ);

          // Throttled network sync every 240ms while moving
          if (nowMs - lastSyncSent > 240) {
            lastSyncSent = nowMs;
            onPosTickRef.current?.(
              localPosRef.current.x,
              localPosRef.current.z,
              localPosRef.current.rotY
            );
          }
        }
      }

      // C. Render & Interpolate All Player Entities
      const seenPlayerIds = new Set<string>();
      const nowEpoch = Date.now();

      for (const ent of Object.values(allEntities)) {
        seenPlayerIds.add(ent.playerId);
        const isMe = ent.playerId === myPlayerId;
        const desiredType = ent.role === "HUNTER" ? "HUNTER" : isMe ? localPosRef.current.propId : ent.propId;

        let pMesh = playerMeshes.get(ent.playerId);
        if (!pMesh || pMesh.currentType !== desiredType) {
          if (pMesh) scene.remove(pMesh.root);
          const root = new THREE.Group();

          let hammerPivot: THREE.Group | undefined;
          if (desiredType === "HUNTER") {
            const built = buildHunterMesh();
            root.add(built.group);
            hammerPivot = built.hammerPivot;
          } else {
            const propGroup = buildPropMesh(desiredType as GhammadaPropId);
            root.add(propGroup);
          }

          // Strike shockwave ring (for Hunters)
          const strikeRing = new THREE.Mesh(
            new THREE.RingGeometry(0.4, 3.0, 32),
            new THREE.MeshBasicMaterial({
              color: 0xf43f5e,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0,
            })
          );
          strikeRing.rotation.x = -Math.PI / 2;
          strikeRing.position.y = 0.08;
          root.add(strikeRing);

          // Taunt soundwave ring (for Hiders whistling)
          const tauntRing = new THREE.Mesh(
            new THREE.RingGeometry(0.5, 2.2, 28),
            new THREE.MeshBasicMaterial({
              color: 0xfacc15,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0,
            })
          );
          tauntRing.rotation.x = -Math.PI / 2;
          tauntRing.position.y = 1.3;
          root.add(tauntRing);

          scene.add(root);
          pMesh = { root, currentType: desiredType, hammerPivot, strikeRing, tauntRing };
          playerMeshes.set(ent.playerId, pMesh);
        }

        pMesh.root.visible = !ent.isCaught;

        // Position interpolation
        const targetX = isMe ? localPosRef.current.x : ent.x;
        const targetZ = isMe ? localPosRef.current.z : ent.z;
        const targetRot = isMe ? localPosRef.current.rotY : ent.rotY;

        if (isMe) {
          pMesh.root.position.set(targetX, 0, targetZ);
          pMesh.root.rotation.y = targetRot;
          myRingMesh.position.set(targetX, 0.05, targetZ);
          myRingMesh.visible = !ent.isCaught;
        } else {
          pMesh.root.position.x += (targetX - pMesh.root.position.x) * Math.min(1, dt * 10);
          pMesh.root.position.z += (targetZ - pMesh.root.position.z) * Math.min(1, dt * 10);
          pMesh.root.rotation.y = targetRot;
        }

        // Animate Hunter Hammer Strike & Shockwave
        if (ent.lastStrikeAt && nowEpoch - ent.lastStrikeAt < 650) {
          const progress = (nowEpoch - ent.lastStrikeAt) / 650;
          if (pMesh.hammerPivot) {
            pMesh.hammerPivot.rotation.x = Math.sin(progress * Math.PI) * 1.45;
          }
          if (pMesh.strikeRing) {
            pMesh.strikeRing.scale.setScalar(0.3 + progress * 0.9);
            (pMesh.strikeRing.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - progress);
          }
        } else {
          if (pMesh.hammerPivot) pMesh.hammerPivot.rotation.x = 0;
          if (pMesh.strikeRing) (pMesh.strikeRing.material as THREE.MeshBasicMaterial).opacity = 0;
        }

        // Animate Hider Whistle Taunt Ring
        if (ent.lastTauntAt && nowEpoch - ent.lastTauntAt < 2200 && pMesh.tauntRing) {
          const p = ((nowEpoch - ent.lastTauntAt) % 700) / 700;
          pMesh.tauntRing.scale.setScalar(0.5 + p * 1.3);
          (pMesh.tauntRing.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - p);
        } else if (pMesh.tauntRing) {
          (pMesh.tauntRing.material as THREE.MeshBasicMaterial).opacity = 0;
        }
      }

      for (const [id, entry] of playerMeshes.entries()) {
        if (!seenPlayerIds.has(id)) {
          scene.remove(entry.root);
          playerMeshes.delete(id);
        }
      }

      // D. Update 3rd-Person Follow Camera
      const camYaw = localPosRef.current.camYaw;
      const focusX = localPosRef.current.x;
      const focusZ = localPosRef.current.z;

      // If Hunter during HIDE_PHASE: high orbiting blindfold camera
      if (myServerEnt?.role === "HUNTER" && currentPhase === "HIDE_PHASE") {
        const orbitAngle = nowMs * 0.0012;
        camera.position.set(Math.sin(orbitAngle) * 4.5, 11.5, Math.cos(orbitAngle) * 4.5);
        camera.lookAt(0, 1.0, 0);
      } else {
        const camDist = 6.8;
        const camHeight = 4.6;
        const desiredCamX = focusX - Math.sin(camYaw) * camDist;
        const desiredCamZ = focusZ + Math.cos(camYaw) * camDist;

        camera.position.x += (desiredCamX - camera.position.x) * Math.min(1, dt * 12);
        camera.position.y += (camHeight - camera.position.y) * Math.min(1, dt * 12);
        camera.position.z += (desiredCamZ - camera.position.z) * Math.min(1, dt * 12);
        camera.lookAt(focusX, 1.1, focusZ);
      }

      renderer.render(scene, camera);
    };

    animFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      domEl.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
    };
  }, [myPlayerId, localPosRef, joystickVecRef]);

  return (
    <div
      ref={mountRef}
      className="w-full h-[380px] sm:h-[460px] rounded-3xl overflow-hidden border-2 border-amber-500/40 shadow-2xl bg-slate-950 relative touch-none select-none"
    />
  );
}
