"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildProceduralProp } from "./ghammada/assets";
import {
  RIYAD3D_ARENA_HALF,
  RIYAD3D_HIDING_SPOTS,
  RIYAD3D_VAN_ZONE,
  RIYAD3D_WALL_SEGMENTS,
  Riyad3DHidingSpot,
  Riyad3DMonsterAlert,
  Riyad3DPoseBroadcast,
  Riyad3DPlayerState,
  Riyad3DTreasureItem,
  Riyad3DTreasurePropKind,
} from "@/games/riyad3d/types";

export interface Riyad3DNearbyContext {
  nearestLoot: { loot: Riyad3DTreasureItem; dist: number } | null;
  inVanZone: boolean;
  nearestHidingSpot: { spot: Riyad3DHidingSpot; dist: number } | null;
  nearestShoveTarget: { playerId: string; name: string; dist: number; hasLoot: boolean } | null;
  monsterDist: number;
  monsterX: number;
  monsterZ: number;
  myX: number;
  myZ: number;
}

interface Riyad3DArenaProps {
  myPlayer: Riyad3DPlayerState;
  players: Riyad3DPlayerState[];
  treasures: Riyad3DTreasureItem[];
  lastMonsterAlert: Riyad3DMonsterAlert | null;
  remotePosesRef: React.MutableRefObject<Record<string, Riyad3DPoseBroadcast>>;
  joystickRef: React.MutableRefObject<{ x: number; y: number }>;
  lookDeltaRef: React.MutableRefObject<{ dx: number; dy: number }>;
  sprintRef: React.MutableRefObject<boolean>;
  onBroadcastPose: (pose: Riyad3DPoseBroadcast) => void;
  onNearbyContextChange: (ctx: Riyad3DNearbyContext) => void;
  onWallBumpWhileCarrying: (x: number, z: number) => void;
  onMonsterStrikeMe: (dropX: number, dropZ: number) => void;
}

const PLAYER_COLORS = [
  0x38bdf8,
  0xfacc15,
  0x4ade80,
  0xf472b6,
  0xa78bfa,
  0xfb923c,
  0x2dd4bf,
  0xe879f9,
];

function buildThiefCharacter(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.36, 0.72, 10, 16),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45 })
  );
  body.position.y = 0.8;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 14),
    new THREE.MeshStandardMaterial({ color: 0xf2c08a, roughness: 0.5 })
  );
  head.position.y = 1.52;
  head.castShadow = true;
  g.add(head);

  const fez = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 0.24, 16),
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.55 })
  );
  fez.position.y = 1.82;
  g.add(fez);

  return g;
}

function createTextSprite(
  text: string,
  bgColor = "rgba(15, 23, 42, 0.88)",
  borderColor = "#f59e0b",
  textColor = "#ffffff"
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(12, 16, 488, 96, 28);
  ctx.fill();
  ctx.stroke();

  ctx.font = "900 34px Cairo, Tajawal, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = textColor;
  ctx.fillText(text.slice(0, 28), 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.4, 0.85, 1);
  return sprite;
}

function build3DTreasureMesh(propKind: Riyad3DTreasurePropKind): THREE.Group {
  const group = new THREE.Group();

  if (propKind === "amphora" || propKind === "berrad" || propKind === "tajine") {
    const base = buildProceduralProp(propKind);
    base.scale.setScalar(1.15);
    group.add(base);
  } else if (propKind === "crown") {
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.75,
      roughness: 0.2,
      emissive: 0x78350f,
      emissiveIntensity: 0.35,
    });
    const cushion = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.5, 0.25, 16),
      new THREE.MeshStandardMaterial({ color: 0xbe123c, roughness: 0.6 })
    );
    cushion.position.y = 0.15;
    group.add(cushion);

    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.34, 0.32, 12), goldMat);
    ring.position.y = 0.42;
    group.add(ring);

    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 0.7,
      })
    );
    gem.position.y = 0.68;
    group.add(gem);
  } else if (propKind === "chandelier") {
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      metalness: 0.5,
      roughness: 0.15,
      emissive: 0x0891b2,
      emissiveIntensity: 0.45,
    });
    const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.35, 0.4, 12), crystalMat);
    tier1.position.y = 0.55;
    group.add(tier1);
    const tier2 = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.45, 12), crystalMat);
    tier2.position.y = 0.25;
    tier2.rotation.x = Math.PI;
    group.add(tier2);
  } else if (propKind === "chest") {
    const base = buildProceduralProp("crate");
    base.scale.set(1.1, 0.85, 0.85);
    group.add(base);
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.14, 0.72),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        metalness: 0.8,
        roughness: 0.2,
      })
    );
    trim.position.y = 0.55;
    group.add(trim);
  } else if (propKind === "clock") {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 1.35, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.45 })
    );
    body.position.y = 0.68;
    group.add(body);
    const dial = new THREE.Mesh(
      new THREE.CircleGeometry(0.22, 16),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    dial.position.set(0, 1.0, 0.22);
    group.add(dial);
  } else {
    // TV / Antique
    const tv = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.65, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.5, roughness: 0.35 })
    );
    tv.position.y = 0.35;
    group.add(tv);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.65, 0.45),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    screen.position.set(0, 0.36, 0.23);
    group.add(screen);
  }

  return group;
}

function build3DExtractionVan(): THREE.Group {
  const van = new THREE.Group();

  // Classic Moroccan "سطافيط الهوندا" Pickup/Van body
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a8a,
    roughness: 0.4,
    metalness: 0.3,
  });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 2.2), bodyMat);
  cabin.position.set(-1.6, 1.4, 0);
  van.add(cabin);

  // Open Cargo Bed with Golden Rugs
  const cargoFloor = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.4, 2.3),
    new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.6 })
  );
  cargoFloor.position.set(1.4, 0.6, 0);
  van.add(cargoFloor);

  const railMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.6 });
  const sideRail1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 0.15), railMat);
  sideRail1.position.set(1.4, 1.2, 1.1);
  van.add(sideRail1);
  const sideRail2 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 0.15), railMat);
  sideRail2.position.set(1.4, 1.2, -1.1);
  van.add(sideRail2);

  // Glowing Extraction Zone Ring around the Van
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.6, 5.4, 36),
    new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  van.add(ring);

  const label = createTextSprite(
    "🚐 سطافيط الهوندا (حطّ الكنوز هنا!)",
    "rgba(6, 78, 59, 0.94)",
    "#10b981",
    "#ecfdf5"
  );
  label.position.set(0, 3.6, 0);
  label.scale.set(4.5, 1.1, 1);
  van.add(label);

  return van;
}

function build3DHauntedGhoul(): THREE.Group {
  const ghoul = new THREE.Group();

  const cloakMat = new THREE.MeshStandardMaterial({
    color: 0x090d16,
    emissive: 0x4c0519,
    emissiveIntensity: 0.55,
    roughness: 0.8,
  });

  const torso = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.9, 10), cloakMat);
  torso.position.y = 1.45;
  ghoul.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.52, 14, 14),
    new THREE.MeshStandardMaterial({
      color: 0x1e1b4b,
      emissive: 0x881337,
      emissiveIntensity: 0.5,
    })
  );
  head.position.y = 2.95;
  ghoul.add(head);

  // Glowing Red Eyes
  const eyeGeo = new THREE.SphereGeometry(0.11, 8, 8);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff003c });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.18, 3.0, 0.45);
  ghoul.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.18, 3.0, 0.45);
  ghoul.add(rightEye);

  // Curved Horns
  const hornGeo = new THREE.ConeGeometry(0.12, 0.65, 8);
  const hornMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
  const leftHorn = new THREE.Mesh(hornGeo, hornMat);
  leftHorn.position.set(-0.35, 3.45, 0);
  leftHorn.rotation.z = 0.35;
  ghoul.add(leftHorn);
  const rightHorn = new THREE.Mesh(hornGeo, hornMat);
  rightHorn.position.set(0.35, 3.45, 0);
  rightHorn.rotation.z = -0.35;
  ghoul.add(rightHorn);

  // Danger Ring
  const dangerRing = new THREE.Mesh(
    new THREE.RingGeometry(1.7, 2.15, 24),
    new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    })
  );
  dangerRing.rotation.x = -Math.PI / 2;
  dangerRing.position.y = 0.06;
  ghoul.add(dangerRing);

  const label = createTextSprite(
    "👹 الغول المسكون — هرب أو تخبّا!",
    "rgba(127, 29, 29, 0.92)",
    "#ef4444",
    "#fecaca"
  );
  label.position.set(0, 4.1, 0);
  ghoul.add(label);

  return ghoul;
}

const MONSTER_WAYPOINTS: Array<{ x: number; z: number }> = [
  { x: 0, z: -20 },
  { x: -21, z: -18 },
  { x: -22, z: 6 },
  { x: -12, z: 12 },
  { x: 12, z: 12 },
  { x: 22, z: 6 },
  { x: 21, z: -18 },
  { x: 0, z: -6 },
];

export default function Riyad3DArena({
  myPlayer,
  players,
  treasures,
  lastMonsterAlert,
  remotePosesRef,
  joystickRef,
  lookDeltaRef,
  sprintRef,
  onBroadcastPose,
  onNearbyContextChange,
  onWallBumpWhileCarrying,
  onMonsterStrikeMe,
}: Riyad3DArenaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const myPlayerRef = useRef(myPlayer);
  myPlayerRef.current = myPlayer;

  const playersRef = useRef(players);
  playersRef.current = players;

  const treasuresRef = useRef(treasures);
  treasuresRef.current = treasures;

  const lastMonsterAlertRef = useRef(lastMonsterAlert);
  lastMonsterAlertRef.current = lastMonsterAlert;

  const callbacksRef = useRef({
    onBroadcastPose,
    onNearbyContextChange,
    onWallBumpWhileCarrying,
    onMonsterStrikeMe,
  });
  callbacksRef.current = {
    onBroadcastPose,
    onNearbyContextChange,
    onWallBumpWhileCarrying,
    onMonsterStrikeMe,
  };

  const myPoseRef = useRef({
    x: myPlayer.spawnX,
    y: 0,
    z: myPlayer.spawnZ,
    rotY: Math.PI,
    pitch: 0.06,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060a12);
    scene.fog = new THREE.FogExp2(0x060a12, 0.036);

    const camera = new THREE.PerspectiveCamera(
      72,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
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
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Atmospheric Haunted Riyad Lighting
    const ambient = new THREE.AmbientLight(0x1e293b, 0.85);
    scene.add(ambient);

    const moonLight = new THREE.DirectionalLight(0x6366f1, 0.7);
    moonLight.position.set(16, 36, -14);
    scene.add(moonLight);

    // Player Personal Flashlight
    const flashlight = new THREE.SpotLight(
      0xfef08a,
      4.2,
      34,
      Math.PI / 3.4,
      0.45,
      1.2
    );
    flashlight.castShadow = true;
    scene.add(flashlight);
    scene.add(flashlight.target);

    const playerAuraLight = new THREE.PointLight(0x38bdf8, 1.3, 12);
    scene.add(playerAuraLight);

    // Riyad Zellij Floor
    const floorGeo = new THREE.PlaneGeometry(RIYAD3D_ARENA_HALF * 2, RIYAD3D_ARENA_HALF * 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.82,
      metalness: 0.15,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(
      RIYAD3D_ARENA_HALF * 2,
      34,
      0x10b981,
      0x1e293b
    );
    grid.position.y = 0.02;
    scene.add(grid);

    // Outer Riyad Walls
    const outerWallMat = new THREE.MeshStandardMaterial({
      color: 0x3b1d2e,
      roughness: 0.85,
    });
    const wallHeight = 5.4;
    const outerWalls = [
      { x: 0, z: -RIYAD3D_ARENA_HALF, w: RIYAD3D_ARENA_HALF * 2, d: 1.4 },
      { x: 0, z: RIYAD3D_ARENA_HALF, w: RIYAD3D_ARENA_HALF * 2, d: 1.4 },
      { x: -RIYAD3D_ARENA_HALF, z: 0, w: 1.4, d: RIYAD3D_ARENA_HALF * 2 },
      { x: RIYAD3D_ARENA_HALF, z: 0, w: 1.4, d: RIYAD3D_ARENA_HALF * 2 },
    ];
    for (const ow of outerWalls) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(ow.w, wallHeight, ow.d),
        outerWallMat
      );
      m.position.set(ow.x, wallHeight / 2, ow.z);
      scene.add(m);
    }

    // Inner Riyad Pillars, Walls & Central Fountain
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x4c1d3d,
      roughness: 0.78,
    });
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x065f46,
      roughness: 0.6,
    });
    for (const seg of RIYAD3D_WALL_SEGMENTS) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(seg.w, seg.h, seg.d),
        seg.kind === "pillar" ? pillarMat : wallMat
      );
      mesh.position.set(seg.x, seg.h / 2, seg.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    // Extraction Van ("🚐 سطافيط الهوندا") at South Gate
    const vanGroup = build3DExtractionVan();
    vanGroup.position.set(RIYAD3D_VAN_ZONE.x, 0, RIYAD3D_VAN_ZONE.z);
    scene.add(vanGroup);

    const vanLight = new THREE.PointLight(0x10b981, 2.8, 18);
    vanLight.position.set(RIYAD3D_VAN_ZONE.x, 3.8, RIYAD3D_VAN_ZONE.z);
    scene.add(vanLight);

    // 6 Hiding Spots (Tables / Wardrobes)
    const hidingGroup = new THREE.Group();
    scene.add(hidingGroup);
    for (const spot of RIYAD3D_HIDING_SPOTS) {
      const spotNode = new THREE.Group();
      spotNode.position.set(spot.x, 0, spot.z);

      const tableTop = new THREE.Mesh(
        new THREE.CylinderGeometry(1.35, 1.35, 0.16, 16),
        new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.65 })
      );
      tableTop.position.y = 1.05;
      spotNode.add(tableTop);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.35, 1.65, 24),
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      spotNode.add(ring);

      const label = createTextSprite(
        `${spot.emoji} ${spot.titleAr} (تخبّا)`,
        "rgba(15, 23, 42, 0.88)",
        "#38bdf8",
        "#e0f2fe"
      );
      label.position.set(0, 2.0, 0);
      spotNode.add(label);

      hidingGroup.add(spotNode);
    }

    // 3D Haunted Ghoul Monster
    const ghoulGroup = build3DHauntedGhoul();
    ghoulGroup.position.set(0, 0, -20);
    scene.add(ghoulGroup);

    const ghoulLight = new THREE.PointLight(0xef4444, 2.6, 14);
    ghoulLight.position.set(0, 3.2, -20);
    scene.add(ghoulLight);

    // Held Treasure in First-Person View (R.E.P.O. style hands!)
    const heldItemAnchor = new THREE.Group();
    scene.add(heldItemAnchor);
    let currentHeldPropKind: Riyad3DTreasurePropKind | null = null;

    // Ground Treasures Map
    const groundTreasureNodes = new Map<
      string,
      {
        group: THREE.Group;
        label: THREE.Sprite;
        lastDurability: number;
      }
    >();

    // Remote Players Map
    const remoteNodes = new Map<
      string,
      {
        group: THREE.Group;
        heldGroup: THREE.Group;
        lastPropKind: Riyad3DTreasurePropKind | null;
      }
    >();

    // Build initial Ground Treasures
    for (const t of treasuresRef.current) {
      const node = new THREE.Group();
      const mesh = build3DTreasureMesh(t.propKind);
      node.add(mesh);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.75, 1.0, 24),
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.75,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      node.add(ring);

      const label = createTextSprite(
        `${t.emoji} ${t.titleAr} • ${t.currentValueDh} DH`,
        "rgba(20, 83, 45, 0.92)",
        "#facc15",
        "#fef08a"
      );
      label.position.set(0, 1.75, 0);
      node.add(label);

      node.position.set(t.x, 0, t.z);
      scene.add(node);
      groundTreasureNodes.set(t.id, {
        group: node,
        label,
        lastDurability: t.durability,
      });
    }

    // Keyboard controls for desktop testing
    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // Wall collision helper: returns { x, z, hitWall }
    const resolveCollisions = (nextX: number, nextZ: number) => {
      const pad = 0.65;
      const limit = RIYAD3D_ARENA_HALF - 1.1;
      let hitWall = false;

      let rx = nextX;
      let rz = nextZ;
      if (rx < -limit || rx > limit) {
        rx = Math.max(-limit, Math.min(limit, rx));
        hitWall = true;
      }
      if (rz < -limit || rz > limit) {
        rz = Math.max(-limit, Math.min(limit, rz));
        hitWall = true;
      }

      for (const w of RIYAD3D_WALL_SEGMENTS) {
        const halfW = w.w / 2 + pad;
        const halfD = w.d / 2 + pad;
        if (
          rx > w.x - halfW &&
          rx < w.x + halfW &&
          rz > w.z - halfD &&
          rz < w.z + halfD
        ) {
          hitWall = true;
          const overlapLeft = rx - (w.x - halfW);
          const overlapRight = w.x + halfW - rx;
          const overlapTop = rz - (w.z - halfD);
          const overlapBottom = w.z + halfD - rz;
          const minOverlap = Math.min(
            overlapLeft,
            overlapRight,
            overlapTop,
            overlapBottom
          );
          if (minOverlap === overlapLeft) rx = w.x - halfW;
          else if (minOverlap === overlapRight) rx = w.x + halfW;
          else if (minOverlap === overlapTop) rz = w.z - halfD;
          else rz = w.z + halfD;
        }
      }
      return { x: rx, z: rz, hitWall };
    };

    let animId = 0;
    let lastTime = performance.now();
    let lastBroadcastAt = 0;
    let lastContextUpdateAt = 0;
    let lastWallBumpAt = 0;
    let lastMonsterStrikeAt = 0;
    let cameraShakeIntensity = 0;

    // Monster state (synchronized seed + reactive pursuit)
    let monsterX = 0;
    let monsterZ = -20;
    let monsterRotY = 0;

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const me = myPlayerRef.current;
      const allTreasures = treasuresRef.current;
      const myCarriedLoot = me.carryingLootId
        ? allTreasures.find((t) => t.id === me.carryingLootId) ?? null
        : null;

      // Look rotation
      const look = lookDeltaRef.current;
      if (look.dx !== 0 || look.dy !== 0) {
        myPoseRef.current.rotY -= look.dx * 0.0046;
        myPoseRef.current.pitch = Math.max(
          -0.55,
          Math.min(0.55, myPoseRef.current.pitch - look.dy * 0.0034)
        );
        lookDeltaRef.current.dx = 0;
        lookDeltaRef.current.dy = 0;
      }

      if (keys["ArrowLeft"]) myPoseRef.current.rotY += 2.1 * dt;
      if (keys["ArrowRight"]) myPoseRef.current.rotY -= 2.1 * dt;

      // Movement input
      let moveForward = -joystickRef.current.y;
      let moveRight = joystickRef.current.x;
      if (keys["KeyW"] || keys["ArrowUp"]) moveForward += 1;
      if (keys["KeyS"] || keys["ArrowDown"]) moveForward -= 1;
      if (keys["KeyD"]) moveRight += 1;
      if (keys["KeyA"]) moveRight -= 1;

      const isStunned = Boolean(
        me.stunnedUntilAt && me.stunnedUntilAt > Date.now()
      );
      const isHidden = Boolean(me.hiddenSpotId);

      // Weight speed multiplier (R.E.P.O. physics!)
      let weightMult = 1.0;
      if (myCarriedLoot) {
        if (myCarriedLoot.weight === "heavy") weightMult = 0.62;
        else if (myCarriedLoot.weight === "medium") weightMult = 0.76;
        else weightMult = 0.88;
      }

      const isSprinting = sprintRef.current || Boolean(keys["ShiftLeft"]);
      const baseSpeed = isSprinting ? 7.6 : 5.2;
      const effectiveSpeed = isStunned || isHidden ? 0 : baseSpeed * weightMult;

      let isMovingFast = false;

      if ( isHidden ) {
        const spot = RIYAD3D_HIDING_SPOTS.find((s) => s.id === me.hiddenSpotId);
        if (spot) {
          myPoseRef.current.x = spot.x;
          myPoseRef.current.z = spot.z;
        }
      } else if (Math.abs(moveForward) > 0.01 || Math.abs(moveRight) > 0.01) {
        const len = Math.min(1, Math.hypot(moveForward, moveRight));
        const normF = (moveForward / Math.max(0.001, Math.hypot(moveForward, moveRight))) * len;
        const normR = (moveRight / Math.max(0.001, Math.hypot(moveForward, moveRight))) * len;

        const sinY = Math.sin(myPoseRef.current.rotY);
        const cosY = Math.cos(myPoseRef.current.rotY);

        const dx = (-sinY * normF + cosY * normR) * effectiveSpeed * dt;
        const dz = (-cosY * normF - sinY * normR) * effectiveSpeed * dt;

        const resolved = resolveCollisions(
          myPoseRef.current.x + dx,
          myPoseRef.current.z + dz
        );
        myPoseRef.current.x = resolved.x;
        myPoseRef.current.z = resolved.z;

        isMovingFast = len > 0.65 && (isSprinting || effectiveSpeed > 4.2);

        // R.E.P.O. Fragile Wall Slam Detection!
        if (
          resolved.hitWall &&
          myCarriedLoot &&
          isMovingFast &&
          now - lastWallBumpAt > 1850
        ) {
          lastWallBumpAt = now;
          cameraShakeIntensity = 0.25;
          callbacksRef.current.onWallBumpWhileCarrying(
            myPoseRef.current.x,
            myPoseRef.current.z
          );
        }
      }

      // Update Camera with subtle bobbing + shake + crouch when hidden
      const eyeHeight = isHidden ? 0.65 : isStunned ? 0.9 : 1.68;
      const shakeX =
        cameraShakeIntensity > 0.01
          ? (Math.random() - 0.5) * cameraShakeIntensity
          : 0;
      const shakeY =
        cameraShakeIntensity > 0.01
          ? (Math.random() - 0.5) * cameraShakeIntensity
          : 0;
      cameraShakeIntensity = Math.max(0, cameraShakeIntensity - dt * 0.9);

      camera.position.set(
        myPoseRef.current.x + shakeX,
        eyeHeight + shakeY,
        myPoseRef.current.z
      );

      const lookDirX =
        -Math.sin(myPoseRef.current.rotY) * Math.cos(myPoseRef.current.pitch);
      const lookDirY = Math.sin(myPoseRef.current.pitch);
      const lookDirZ =
        -Math.cos(myPoseRef.current.rotY) * Math.cos(myPoseRef.current.pitch);

      camera.lookAt(
        camera.position.x + lookDirX * 10,
        camera.position.y + lookDirY * 10,
        camera.position.z + lookDirZ * 10
      );

      flashlight.position.copy(camera.position);
      flashlight.target.position.set(
        camera.position.x + lookDirX * 14,
        camera.position.y + lookDirY * 14,
        camera.position.z + lookDirZ * 14
      );
      playerAuraLight.position.set(
        myPoseRef.current.x,
        2.2,
        myPoseRef.current.z
      );

      // Update Held 3D Treasure in Hands (First-Person R.E.P.O. Carry)
      if (myCarriedLoot) {
        heldItemAnchor.visible = true;
        if (currentHeldPropKind !== myCarriedLoot.propKind) {
          currentHeldPropKind = myCarriedLoot.propKind;
          heldItemAnchor.clear();
          const mesh = build3DTreasureMesh(myCarriedLoot.propKind);
          mesh.scale.setScalar(0.55);
          heldItemAnchor.add(mesh);
        }
        const bobOffset = Math.sin(now * 0.01) * 0.04;
        heldItemAnchor.position.set(
          camera.position.x + lookDirX * 1.15,
          camera.position.y - 0.38 + bobOffset,
          camera.position.z + lookDirZ * 1.15
        );
        heldItemAnchor.rotation.y = myPoseRef.current.rotY + Math.sin(now * 0.004) * 0.15;
      } else {
        heldItemAnchor.visible = false;
        currentHeldPropKind = null;
      }

      // Update Ground Treasures
      for (const t of allTreasures) {
        const entry = groundTreasureNodes.get(t.id);
        if (!entry) continue;

        if (t.status === "available") {
          entry.group.visible = true;
          entry.group.position.set(t.x, Math.sin(now * 0.003 + t.x) * 0.06, t.z);
          entry.group.rotation.y += dt * 0.7;

          if (entry.lastDurability !== t.durability) {
            entry.lastDurability = t.durability;
            entry.group.remove(entry.label);
            const nextLabel = createTextSprite(
              `${t.emoji} ${t.titleAr} • ${t.currentValueDh} DH (${t.durability}%)`,
              t.durability < 60 ? "rgba(127, 29, 29, 0.92)" : "rgba(20, 83, 45, 0.92)",
              t.durability < 60 ? "#ef4444" : "#facc15",
              "#fef08a"
            );
            nextLabel.position.set(0, 1.75, 0);
            entry.group.add(nextLabel);
            entry.label = nextLabel;
          }
        } else {
          entry.group.visible = false;
        }
      }

      // Update Haunted Ghoul Monster AI
      const worldSec = Date.now() / 1000;
      const wpIdx = Math.floor(worldSec / 7) % MONSTER_WAYPOINTS.length;
      const nextWpIdx = (wpIdx + 1) % MONSTER_WAYPOINTS.length;
      const wpProgress = (worldSec % 7) / 7;

      let targetGoalX =
        MONSTER_WAYPOINTS[wpIdx].x * (1 - wpProgress) +
        MONSTER_WAYPOINTS[nextWpIdx].x * wpProgress;
      let targetGoalZ =
        MONSTER_WAYPOINTS[wpIdx].z * (1 - wpProgress) +
        MONSTER_WAYPOINTS[nextWpIdx].z * wpProgress;

      // If a treasure shattered recently (< 10s), Monster rushes to that crash location!
      const alert = lastMonsterAlertRef.current;
      if (alert && Date.now() - new Date(alert.createdAt).getTime() < 10000) {
        targetGoalX = alert.x;
        targetGoalZ = alert.z;
      }

      // If local player is unhidden, not at the Extraction Van safe gate, and within 11.5m, Ghoul stalks them!
      const distToMe = Math.hypot(
        myPoseRef.current.x - monsterX,
        myPoseRef.current.z - monsterZ
      );
      const inSafeVanGate =
        Math.hypot(
          myPoseRef.current.x - RIYAD3D_VAN_ZONE.x,
          myPoseRef.current.z - RIYAD3D_VAN_ZONE.z
        ) <=
        RIYAD3D_VAN_ZONE.radius + 1.5;

      if (!isHidden && !inSafeVanGate && distToMe < 11.5) {
        targetGoalX = myPoseRef.current.x;
        targetGoalZ = myPoseRef.current.z;
      }

      const mdx = targetGoalX - monsterX;
      const mdz = targetGoalZ - monsterZ;
      const mDist = Math.hypot(mdx, mdz);
      const monsterSpeed = !isHidden && distToMe < 11.5 ? 4.35 : 3.4;

      if (mDist > 0.15) {
        monsterX += (mdx / mDist) * Math.min(mDist, monsterSpeed * dt);
        monsterZ += (mdz / mDist) * Math.min(mDist, monsterSpeed * dt);
        monsterRotY = Math.atan2(mdx, mdz);
      }

      ghoulGroup.position.set(
        monsterX,
        Math.sin(now * 0.005) * 0.14,
        monsterZ
      );
      ghoulGroup.rotation.y = monsterRotY;
      ghoulLight.position.set(monsterX, 3.2, monsterZ);

      // Check if Ghoul caught the local player!
      const updatedMonsterDist = Math.hypot(
        myPoseRef.current.x - monsterX,
        myPoseRef.current.z - monsterZ
      );
      if (
        !isHidden &&
        !inSafeVanGate &&
        updatedMonsterDist < 2.1 &&
        now - lastMonsterStrikeAt > 6500
      ) {
        lastMonsterStrikeAt = now;
        cameraShakeIntensity = 0.45;
        const dropX = myPoseRef.current.x;
        const dropZ = myPoseRef.current.z;
        // Knock player back to the South Courtyard entrance
        myPoseRef.current.x = me.spawnX;
        myPoseRef.current.z = me.spawnZ;
        callbacksRef.current.onMonsterStrikeMe(dropX, dropZ);
      }

      // Render Remote Players
      const poses = remotePosesRef.current;
      for (const p of playersRef.current) {
        if (p.id === me.id) continue;
        const pose = poses[p.id];
        let rNode = remoteNodes.get(p.id);

        if (!rNode) {
          const group = new THREE.Group();
          const colorIdx =
            Math.abs(
              p.id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
            ) % PLAYER_COLORS.length;
          const charMesh = buildThiefCharacter(PLAYER_COLORS[colorIdx]);
          group.add(charMesh);

          const nameSprite = createTextSprite(
            `🏃 ${p.name}`,
            "rgba(15, 23, 42, 0.88)",
            "#38bdf8",
            "#f8fafc"
          );
          nameSprite.position.set(0, 2.35, 0);
          group.add(nameSprite);

          const heldGroup = new THREE.Group();
          heldGroup.position.set(0, 1.1, 0.65);
          group.add(heldGroup);

          scene.add(group);
          rNode = { group, heldGroup, lastPropKind: null };
          remoteNodes.set(p.id, rNode);
        }

        if (!pose || p.hiddenSpotId) {
          rNode.group.visible = false;
          continue;
        }

        rNode.group.visible = true;
        rNode.group.position.lerp(new THREE.Vector3(pose.x, 0, pose.z), 0.25);
        rNode.group.rotation.y = pose.rotY;

        if (pose.carryingPropKind !== rNode.lastPropKind) {
          rNode.lastPropKind = pose.carryingPropKind;
          rNode.heldGroup.clear();
          if (pose.carryingPropKind) {
            const propMesh = build3DTreasureMesh(pose.carryingPropKind);
            propMesh.scale.setScalar(0.65);
            rNode.heldGroup.add(propMesh);
          }
        }
      }

      // Broadcast pose at ~12Hz
      if (now - lastBroadcastAt > 85) {
        lastBroadcastAt = now;
        callbacksRef.current.onBroadcastPose({
          playerId: me.id,
          name: me.name,
          x: Number(myPoseRef.current.x.toFixed(2)),
          y: 0,
          z: Number(myPoseRef.current.z.toFixed(2)),
          rotY: Number(myPoseRef.current.rotY.toFixed(2)),
          carryingLootId: myCarriedLoot?.id ?? null,
          carryingPropKind: myCarriedLoot?.propKind ?? null,
          carryingValueDh: myCarriedLoot?.currentValueDh ?? 0,
          carryingDurability: myCarriedLoot?.durability ?? 100,
          hiddenSpotId: me.hiddenSpotId,
          stunned: isStunned,
          sprinting: isSprinting,
          ts: Date.now(),
        });
      }

      // Update Nearby Context for HUD Buttons (~10Hz)
      if (now - lastContextUpdateAt > 100) {
        lastContextUpdateAt = now;

        // Nearest available loot
        let nearestLoot: { loot: Riyad3DTreasureItem; dist: number } | null = null;
        for (const t of allTreasures) {
          if (t.status !== "available") continue;
          const d = Math.hypot(myPoseRef.current.x - t.x, myPoseRef.current.z - t.z);
          if (d <= 3.3 && (!nearestLoot || d < nearestLoot.dist)) {
            nearestLoot = { loot: t, dist: d };
          }
        }

        // In Extraction Van Zone
        const distToVan = Math.hypot(
          myPoseRef.current.x - RIYAD3D_VAN_ZONE.x,
          myPoseRef.current.z - RIYAD3D_VAN_ZONE.z
        );
        const inVanZone = distToVan <= RIYAD3D_VAN_ZONE.radius;

        // Nearest Hiding Spot
        let nearestHidingSpot: { spot: Riyad3DHidingSpot; dist: number } | null =
          null;
        for (const s of RIYAD3D_HIDING_SPOTS) {
          const d = Math.hypot(myPoseRef.current.x - s.x, myPoseRef.current.z - s.z);
          if (d <= 3.0 && (!nearestHidingSpot || d < nearestHidingSpot.dist)) {
            nearestHidingSpot = { spot: s, dist: d };
          }
        }

        // Nearest Shove Target (Friend within 3.4m)
        let nearestShoveTarget: {
          playerId: string;
          name: string;
          dist: number;
          hasLoot: boolean;
        } | null = null;
        for (const p of playersRef.current) {
          if (p.id === me.id || p.hiddenSpotId) continue;
          const pose = remotePosesRef.current[p.id];
          if (!pose) continue;
          const d = Math.hypot(
            myPoseRef.current.x - pose.x,
            myPoseRef.current.z - pose.z
          );
          if (d <= 3.4 && (!nearestShoveTarget || d < nearestShoveTarget.dist)) {
            nearestShoveTarget = {
              playerId: p.id,
              name: p.name,
              dist: d,
              hasLoot: Boolean(p.carryingLootId || pose.carryingLootId),
            };
          }
        }

        callbacksRef.current.onNearbyContextChange({
          nearestLoot,
          inVanZone,
          nearestHidingSpot,
          nearestShoveTarget,
          monsterDist: updatedMonsterDist,
          monsterX,
          monsterZ,
          myX: myPoseRef.current.x,
          myZ: myPoseRef.current.z,
        });
      }

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none touch-none bg-[#060a12]"
    />
  );
}
