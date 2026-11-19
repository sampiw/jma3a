"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  BOARD_TILE_COUNT,
  getTileWorldTransform as classicTransform,
  SIMSAR_BOARD_TILES,
} from "@/games/simsar3d/boardData";
import {
  SIMSAR_REACTIONS,
  SIMSAR_TOKENS,
  SimsarDiceRoll,
  SimsarPlayer,
  SimsarPropertyState,
  SimsarTileSpec,
  SimsarTokenId,
} from "@/games/simsar3d/types";
import { simsarSfx } from "./soundFx";
import {
  buildAlBoraqTrainSystem,
  buildRoyalHotAirBalloon,
  createSimsarOceanMaterial,
  createSimsarSkyMaterial,
  getCarLiveryMaterial,
} from "./worldEnvironment";

import type { MoulShot } from "@/games/simsar3d/moulBoard";
import type { createMoulTableau } from "./moulTableau";

export interface Simsar3DBoardCanvasProps {
  players: Record<string, SimsarPlayer>;
  properties: Record<number, SimsarPropertyState>;
  currentPlayerId: string;
  gardiennagePot: number;
  lastDice: SimsarDiceRoll | null;
  cameraMode: "AUTO" | "OVERVIEW";
  selectedTileIndex: number | null;
  neighborhood?: { tiles: SimsarTileSpec[]; cast: Record<string,number>; emblems: Record<string,string>; focusOwner: string | null; routes: number[]; shot: MoulShot | null; createTableau: typeof createMoulTableau };
  onGraphicsFailure?: () => void;
  onSelectTile?: (tileIndex: number) => void;
  onLand?: (playerId: string, moveSeq: number, tileIndex: number) => void;
}

const gltfLoader = new GLTFLoader();
const gltfAssetCache = new Map<string, Promise<GLTF>>();

function loadCachedGltf(url: string): Promise<GLTF> {
  let existing = gltfAssetCache.get(url);
  if (!existing) {
    existing = new Promise((resolve, reject) => {
      gltfLoader.load(
        url,
        (gltf) => {
          gltf.scene.updateMatrixWorld(true);
          resolve(gltf);
        },
        undefined,
        (err) => reject(err)
      );
    });
    gltfAssetCache.set(url, existing);
  }
  return existing;
}

function loadClonedModel(url: string, isSkinned = false): Promise<{
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}> {
  return loadCachedGltf(url).then((gltf) => {
    const cloned = (
      isSkinned ? SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(true)
    ) as THREE.Group;
    return { scene: cloned, animations: gltf.animations || [] };
  });
}

function fitModelToFootprint(
  model: THREE.Object3D,
  targetSpan: number,
  maxHeight = targetSpan * 1.45
): THREE.Group {
  const wrapper = new THREE.Group();
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxHoriz = Math.max(0.01, size.x, size.z);
  const scaleXZ = targetSpan / maxHoriz;
  const scaleY = maxHeight / Math.max(0.01, size.y);
  const scale = Math.min(scaleXZ, scaleY);

  model.scale.multiplyScalar(scale);
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  model.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  wrapper.add(model);
  return wrapper;
}

function shortestAngleDiff(from: number, to: number): number {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/** Elastic overshoot spring curve (0..1 -> 0..1.24..1.0) for juicy 3D building & coin pops! */
function easeOutBackOvershoot(x: number): number {
  const c1 = 2.45;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** High-DPI 512x512 Royal Obsidian-Slate & Gold Zellige 3D Tile Top Texture (Zero White Glare!) */
function createTileTopTexture(tile: SimsarTileSpec, isCorner: boolean, taxDh = 120): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;

  const bgGrad = ctx.createLinearGradient(0, 0, 512, 512);
  bgGrad.addColorStop(0, isCorner ? "#3b1d06" : "#0f172a");
  bgGrad.addColorStop(0.55, isCorner ? "#451a03" : "#1e293b");
  bgGrad.addColorStop(1, isCorner ? "#1c1917" : "#090d16");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle geometric Moroccan star watermark in background
  ctx.strokeStyle = isCorner ? "rgba(251,191,36,0.18)" : "rgba(148,163,184,0.12)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(256, 258, 108, 0, Math.PI * 2);
  ctx.stroke();

  // Outer brushed gold & royal frame
  ctx.strokeStyle = isCorner ? "#fbbf24" : "#d97706";
  ctx.lineWidth = 18;
  ctx.strokeRect(10, 10, 492, 492);

  ctx.strokeStyle = isCorner ? "#fef08a" : tile.colorHex;
  ctx.lineWidth = 5;
  ctx.strokeRect(24, 24, 464, 464);

  // Top Color Monopoly Header Band
  const bandH = isCorner ? 116 : 136;
  const hdrGrad = ctx.createLinearGradient(0, 24, 0, 24 + bandH);
  hdrGrad.addColorStop(0, tile.colorHex);
  hdrGrad.addColorStop(1, tile.colorHex);
  ctx.fillStyle = hdrGrad;
  ctx.fillRect(24, 24, 464, bandH);

  // Glossy top sheen & Zellige diamonds on header band
  ctx.fillStyle = "rgba(255,255,255,0.24)";
  ctx.fillRect(24, 24, 464, 26);
  for (let x = 48; x < 472; x += 56) {
    ctx.beginPath();
    ctx.moveTo(x, 52);
    ctx.lineTo(x + 15, 69);
    ctx.lineTo(x, 86);
    ctx.lineTo(x - 15, 69);
    ctx.closePath();
    ctx.fill();
  }

  // Tile Index Pill
  ctx.fillStyle = "rgba(2,6,23,0.88)";
  ctx.beginPath();
  ctx.roundRect(34, 36, 86, 52, 16);
  ctx.fill();
  ctx.fillStyle = "#fde047";
  ctx.font = "900 31px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`#${tile.index}`, 77, 63);

  // Giant Crisp Centerpiece Emoji with golden drop glow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.font = isCorner ? "148px system-ui, sans-serif" : "132px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(tile.emoji, 256, isCorner ? 246 : 240);
  ctx.restore();

  // Bold Crisp White Arabic Short Name
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 58px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(tile.shortAr, 256, 362, 425);

  // Bottom Price / Bonus Pill
  const footerText = tile.price
    ? `${tile.price} DH`
    : tile.kind === "START"
    ? "+250 DH"
    : tile.kind === "JACKPOT"
    ? "الحصالة 💰"
    : tile.kind === "HEIST"
    ? "سرقة 🥷"
    : tile.kind === "TAX"
    ? `-${taxDh} DH`
    : tile.kind === "RADAR_TO_JAIL"
    ? "للفوريان!"
    : tile.shortAr;

  ctx.fillStyle = tile.price ? "#020617" : tile.colorHex;
  ctx.beginPath();
  ctx.roundRect(54, 406, 404, 74, 26);
  ctx.fill();

  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = tile.price ? "#fde047" : "#ffffff";
  ctx.font = "900 45px system-ui, sans-serif";
  ctx.fillText(footerText, 256, 445);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Creates 6 glossy ivory & gold die face materials: [+X:3, -X:4, +Y:1, -Y:6, +Z:2, -Z:5] */
function createDieMaterials(): THREE.MeshStandardMaterial[] {
  const faceOrder = [3, 4, 1, 6, 2, 5];
  const pipCoords: Record<number, Array<[number, number]>> = {
    1: [[0.5, 0.5]],
    2: [
      [0.27, 0.27],
      [0.73, 0.73],
    ],
    3: [
      [0.25, 0.25],
      [0.5, 0.5],
      [0.75, 0.75],
    ],
    4: [
      [0.27, 0.27],
      [0.73, 0.27],
      [0.27, 0.73],
      [0.73, 0.73],
    ],
    5: [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.5, 0.5],
      [0.25, 0.75],
      [0.75, 0.75],
    ],
    6: [
      [0.27, 0.23],
      [0.73, 0.23],
      [0.27, 0.5],
      [0.73, 0.5],
      [0.27, 0.77],
      [0.73, 0.77],
    ],
  };

  return faceOrder.map((val) => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d")!;

    const g = ctx.createRadialGradient(128, 128, 16, 128, 128, 180);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.75, "#fefce8");
    g.addColorStop(1, "#fde68a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.roundRect(10, 10, 236, 236, 36);
    ctx.stroke();

    const isRed = val === 1 || val === 4;
    for (const [nx, ny] of pipCoords[val]) {
      const px = nx * 256;
      const py = ny * 256;
      const radius = val === 1 ? 36 : 23;

      // Recessed gold rim around pip
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(px, py, radius + 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isRed ? "#dc2626" : "#0f172a";
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.16,
      metalness: 0.12,
    });
  });
}

function getDieTopQuaternion(val: number, yaw = 0): THREE.Quaternion {
  let rx = 0;
  let rz = 0;
  switch (val) {
    case 1:
      rx = 0;
      rz = 0;
      break;
    case 6:
      rx = Math.PI;
      rz = 0;
      break;
    case 2:
      rx = -Math.PI / 2;
      rz = 0;
      break;
    case 5:
      rx = Math.PI / 2;
      rz = 0;
      break;
    case 3:
      rx = 0;
      rz = Math.PI / 2;
      break;
    case 4:
      rx = 0;
      rz = -Math.PI / 2;
      break;
  }
  const qFace = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz, "XYZ"));
  const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  return qYaw.multiply(qFace);
}

function createFloatingBadgeSprite(
  label: string,
  accentColor: string
): { sprite: THREE.Sprite; updateText: (txt: string, bg: string) => void } {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 104;
  const ctx = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const draw = (txt: string, borderHex: string) => {
    ctx.clearRect(0, 0, 384, 104);
    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.strokeStyle = borderHex;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.roundRect(12, 14, 360, 74, 37);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 32px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(txt.slice(0, 18), 192, 52);
    tex.needsUpdate = true;
  };

  draw(label, accentColor);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  );
  sprite.scale.set(3.45, 0.94, 1);
  sprite.renderOrder = 30;
  return { sprite, updateText: draw };
}

function createPopupTextSprite(text: string, bgHex: string, textHex = "#ffffff"): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 112;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = bgHex;
  ctx.strokeStyle = "#fef08a";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.roundRect(16, 16, 288, 80, 40);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textHex;
  ctx.font = "900 40px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 160, 57);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  );
  sp.scale.set(3.4, 1.2, 1);
  sp.renderOrder = 40;
  return sp;
}

function build3DCrownGroup(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.55,
    roughness: 0.16,
    metalness: 0.88,
  });
  const rubyMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });

  const baseRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.38, 0.24, 12),
    goldMat
  );
  g.add(baseRing);

  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 6), goldMat);
    spike.position.set(Math.cos(ang) * 0.38, 0.26, Math.sin(ang) * 0.38);
    g.add(spike);

    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), rubyMat);
    gem.position.set(Math.cos(ang) * 0.42, 0.02, Math.sin(ang) * 0.42);
    g.add(gem);
  }

  g.scale.setScalar(scale);
  return g;
}

interface TileAnimRig {
  group: THREE.Group;
  baseY: number;
  pressY: number;
  pressVel: number;
}

interface TokenVisualRig {
  id: string;
  tokenType: SimsarTokenId;
  root: THREE.Group;
  bodyHolder: THREE.Group;
  wheelNodes: THREE.Object3D[];
  sirenRed: THREE.Mesh | null;
  sirenBlue: THREE.Mesh | null;
  leaderCrown: THREE.Group;
  shieldDome: THREE.Mesh;
  jailCage: THREE.Group;
  badge: { sprite: THREE.Sprite; updateText: (txt: string, bg: string) => void };
  renderedTile: number;
  targetTile: number;
  lastMoveSeq: number;
  hopProgress: number; // -0.18..0 = crouch anticipation, 0..1 = airborne arc
  hopFromTile: number;
  hopToTile: number;
  isFinalStep: boolean;
  stepCounter: number;
  joyBounce: number; // 0..1 when receiving coins!
  smoothYaw: number;
  lastLabelKey: string;
}

interface BuildingSlotRig {
  holder: THREE.Group;
  ownerRing: THREE.Mesh;
  mortgageBadge: THREE.Mesh;
  crownGroup: THREE.Group;
  skybeam: THREE.Mesh;
  beamLife: number;
  currentLevel: number;
  currentOwnerId: string | null;
  popAnim: number; // 0..1 elastic drop/scale
}

interface RigidDieBody {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  targetQuat: THREE.Quaternion;
  bounces: number;
  settled: boolean;
}

interface FlyingCoin {
  mesh: THREE.Object3D;
  delay: number;
  t: number; // 0..1
  speed: number;
  startPos: THREE.Vector3;
  targetPlayerId: string | null; // if null, targets fallbackTargetPos
  fallbackTargetPos: THREE.Vector3;
  peakHeight: number;
  swirlSign: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxScale: number;
}

interface BurstParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  rotSpd: number;
  life: number;
  maxLife: number;
  gravity: number;
}

interface FloatingWorldPopup {
  sprite: THREE.Sprite;
  life: number;
  maxLife: number;
}

interface SailingShipRig {
  root: THREE.Group;
  sails: THREE.Object3D[];
  orbitRadius: number;
  orbitSpeed: number;
  phase: number;
}

const VILLA_GLBS = [
  "/models/simsar/suburban/villa-d.glb",
  "/models/simsar/suburban/villa-g.glb",
  "/models/simsar/suburban/villa-k.glb",
  "/models/simsar/suburban/villa-n.glb",
  "/models/simsar/suburban/villa-r.glb",
  "/models/simsar/suburban/villa-t.glb",
];

const SKYSCRAPER_GLBS = [
  "/models/simsar/commercial/skyscraper-a.glb",
  "/models/simsar/commercial/skyscraper-b.glb",
  "/models/simsar/commercial/skyscraper-c.glb",
  "/models/simsar/commercial/skyscraper-d.glb",
  "/models/ksida/city/building-f.glb",
  "/models/ksida/city/building-j.glb",
];

export function Simsar3DBoardCanvas({
  players,
  properties,
  currentPlayerId,
  gardiennagePot,
  lastDice,
  cameraMode,
  selectedTileIndex,
  onSelectTile,
  onLand,
  neighborhood,
  onGraphicsFailure,
}: Simsar3DBoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const liveRef = useRef({
    players,
    properties,
    currentPlayerId,
    gardiennagePot,
    lastDice,
    cameraMode,
    selectedTileIndex,
    onSelectTile,
    onLand, neighborhood, onGraphicsFailure,
  });
  liveRef.current = {
    players,
    properties,
    currentPlayerId,
    gardiennagePot,
    lastDice,
    cameraMode,
    selectedTileIndex,
    onSelectTile,
    onLand, neighborhood, onGraphicsFailure,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const district = liveRef.current.neighborhood;
    const tiles = district?.tiles ?? SIMSAR_BOARD_TILES;
    const getTileWorldTransform = (index:number) => classicTransform(index * BOARD_TILE_COUNT / tiles.length);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x062444);
    // Keep fog strictly beyond 90m on the distant ocean horizon — ZERO haze over the 3D board!
    scene.fog = new THREE.Fog(0x0b3b60, 92, 215);

    const initW = Math.max(300, container.clientWidth);
    const initH = Math.max(300, container.clientHeight);

    const camera = new THREE.PerspectiveCamera(40, initW / initH, 0.5, 320);
    const dpr = Math.min(window.devicePixelRatio || 1, district ? 1.5 : 2);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: "high-performance"});
    } catch (err) {
      if (!liveRef.current.onGraphicsFailure) throw err;
      liveRef.current.onGraphicsFailure();
      return;
    }
    const graphicsLost = () => liveRef.current.onGraphicsFailure?.();
    renderer.domElement.addEventListener("webglcontextlost", graphicsLost);
    const tableau = district?.createTableau(scene);
    renderer.setPixelRatio(dpr);
    renderer.setSize(initW, initH);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    (scene as any).environmentIntensity = 0.42;

    // Crisp High-Contrast Golden-Hour Moroccan Lighting Rig (Zero Exposure Washout!)
    const hemi = new THREE.HemisphereLight(0xffe8c2, 0x1e3a8a, 0.68);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1d0, 1.68);
    sun.position.set(22, 36, -24);
    sun.castShadow = true;
    const shadowSize = district && initW < 650 ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.camera.near = 6;
    sun.shadow.camera.far = 96;
    const shBounds = 21;
    sun.shadow.camera.left = -shBounds;
    sun.shadow.camera.right = shBounds;
    sun.shadow.camera.top = shBounds;
    sun.shadow.camera.bottom = -shBounds;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // Subtle warm front fill so car grilles & doors read crisply
    const frontFill = new THREE.DirectionalLight(0xfde68a, 0.34);
    frontFill.position.set(-10, 14, 24);
    scene.add(frontFill);

    const texLoader = new THREE.TextureLoader();

    // =========================================================================
    // 1. CUSTOM GLSL SKY DOME + SPARKLING TURQUOISE SURF OCEAN + DRIFTING CLOUDS
    // =========================================================================
    const skyMat = createSimsarSkyMaterial();
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(165, 28, 18), skyMat);
    scene.add(skyDome);

    const waterNormals = texLoader.load("/textures/shooter/waternormals.jpg");
    const oceanMat = createSimsarOceanMaterial(waterNormals);
    const oceanGeo = new THREE.PlaneGeometry(280, 280, 48, 48);
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.rotation.x = -Math.PI / 2;
    oceanMesh.position.y = -0.82;
    scene.add(oceanMesh);

    // Royal Marrakech Hot-Air Balloon + 6 Fluffy 3D Clouds
    const balloon = buildRoyalHotAirBalloon();
    balloon.group.position.set(-19, 13.5, -18);
    balloon.group.scale.setScalar(1.25);
    scene.add(balloon.group);

    const cloudRigs: Array<{ mesh: THREE.Group; radius: number; speed: number; angle: number; y: number }> = [];
    loadClonedModel("/models/simsar/props/cloud.glb")
      .then(({ scene: cloudProto }) => {
        for (let i = 0; i < 6; i++) {
          const clone = fitModelToFootprint(cloudProto.clone(true), 4.8 + (i % 3) * 1.4);
          const ang = (i / 6) * Math.PI * 2;
          const rad = 34 + (i % 2) * 8;
          const y = 14 + (i % 3) * 2.8;
          clone.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
          scene.add(clone);
          cloudRigs.push({
            mesh: clone,
            radius: rad,
            speed: 0.035 + (i % 3) * 0.012,
            angle: ang,
            y,
          });
        }
      })
      .catch(() => {});

    // Two 3D Ships Sailing & Bobbing Around the Island Lagoon!
    const shipRigs: SailingShipRig[] = [];
    const shipSpecs: Array<[string, number, number, number, number]> = [
      ["/models/simsar/maritime/ship-large.glb", 5.2, 23.8, 0.16, 0.2],
      ["/models/simsar/maritime/ship-medium.glb", 4.4, 25.8, -0.13, 3.3],
    ];
    shipSpecs.forEach(([url, span, rad, spd, ph]) => {
      loadClonedModel(url)
        .then(({ scene: raw }) => {
          const sails: THREE.Object3D[] = [];
          raw.traverse((n) => {
            if (n.name.includes("sail") || n.name.includes("flag")) sails.push(n);
          });
          const ship = fitModelToFootprint(raw, span);
          // Add white foam wake V-ring behind ship
          const wake = new THREE.Mesh(
            new THREE.RingGeometry(0.6, 1.9, 18),
            new THREE.MeshBasicMaterial({
              color: 0xf8fafc,
              transparent: true,
              opacity: 0.42,
              side: THREE.DoubleSide,
            })
          );
          wake.rotation.x = -Math.PI / 2;
          wake.scale.set(0.85, 2.2, 1);
          wake.position.set(0, 0.08, -1.8);
          ship.add(wake);

          scene.add(ship);
          shipRigs.push({
            root: ship,
            sails,
            orbitRadius: rad,
            orbitSpeed: spd,
            phase: ph,
          });
        })
        .catch(() => {});
    });

    // =========================================================================
    // 2. MULTI-TIERED MOROCCAN KASBAH ISLAND, MARINA PIER & ZELLIGE PLAZA
    // =========================================================================
    const brickDiff = texLoader.load("/textures/shooter/brick_diffuse.jpg");
    const brickBump = texLoader.load("/textures/shooter/brick_bump.jpg");
    const brickRough = texLoader.load("/textures/shooter/brick_roughness.jpg");
    [brickDiff, brickBump, brickRough].forEach((t) => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(7, 7);
    });
    brickDiff.colorSpace = THREE.SRGBColorSpace;

    const woodDiff = texLoader.load("/textures/shooter/hardwood2_diffuse.jpg");
    woodDiff.wrapS = THREE.RepeatWrapping;
    woodDiff.wrapT = THREE.RepeatWrapping;
    woodDiff.repeat.set(4, 2);
    woodDiff.colorSpace = THREE.SRGBColorSpace;

    // Warm Coastal Atlantic Sand Cove Ring
    const sandCove = new THREE.Mesh(
      new THREE.CylinderGeometry(20.4, 23.2, 0.95, 56),
      new THREE.MeshStandardMaterial({ color: 0xd6b07a, roughness: 0.92 })
    );
    sandCove.position.y = -0.62;
    sandCove.receiveShadow = true;
    scene.add(sandCove);

    // Lower Beveled Terracotta Kasbah Cliff Base
    const lowerCliff = new THREE.Mesh(
      new RoundedBoxGeometry(31.6, 1.1, 31.6, 4, 0.45),
      new THREE.MeshStandardMaterial({
        map: brickDiff,
        bumpMap: brickBump,
        bumpScale: 0.1,
        roughnessMap: brickRough,
        color: 0xc2410c,
        roughness: 0.76,
      })
    );
    lowerCliff.position.y = -0.52;
    lowerCliff.receiveShadow = true;
    lowerCliff.castShadow = true;
    scene.add(lowerCliff);

    // Upper Warm Marrakech Sandstone Boulevard Deck (Rich contrast, zero whiteout!)
    const upperDeck = new THREE.Mesh(
      new RoundedBoxGeometry(29.6, 0.62, 29.6, 4, 0.28),
      new THREE.MeshStandardMaterial({
        map: brickDiff,
        bumpMap: brickBump,
        bumpScale: 0.05,
        color: 0xd97706,
        roughness: 0.68,
      })
    );
    upperDeck.position.y = -0.24;
    upperDeck.receiveShadow = true;
    upperDeck.castShadow = true;
    scene.add(upperDeck);

    // Sleek Dark Asphalt & Gold Rim Road Ring under the 24 Tiles
    const roadBed = new THREE.Mesh(
      new RoundedBoxGeometry(25.4, 0.16, 25.4, 3, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55, metalness: 0.15 })
    );
    roadBed.position.y = 0.03;
    roadBed.receiveShadow = true;
    scene.add(roadBed);

    // Wooden Marina Dock Pier extending East into the Turquoise Lagoon!
    const marinaPier = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.26, 2.8),
      new THREE.MeshStandardMaterial({ map: woodDiff, roughness: 0.65 })
    );
    marinaPier.position.set(17.2, -0.18, 0);
    marinaPier.castShadow = true;
    marinaPier.receiveShadow = true;
    scene.add(marinaPier);

    // Sculpted Royal Medina Stone Courtyard (Clean dark-slate & inlaid gold compass — ZERO noisy grid!)
    const cCanvas = document.createElement("canvas");
    cCanvas.width = 512;
    cCanvas.height = 512;
    const cCtx = cCanvas.getContext("2d")!;
    const cGrad = cCtx.createRadialGradient(256, 256, 30, 256, 256, 340);
    cGrad.addColorStop(0, "#1e293b");
    cGrad.addColorStop(0.65, "#0f172a");
    cGrad.addColorStop(1, "#1c1917");
    cCtx.fillStyle = cGrad;
    cCtx.fillRect(0, 0, 512, 512);

    // Subtle Royal Gold Compass Rings & Cross Walkways
    cCtx.strokeStyle = "rgba(251,191,36,0.35)";
    cCtx.lineWidth = 8;
    cCtx.strokeRect(18, 18, 476, 476);
    cCtx.beginPath();
    cCtx.arc(256, 256, 195, 0, Math.PI * 2);
    cCtx.stroke();
    cCtx.strokeStyle = "rgba(56,189,248,0.25)";
    cCtx.lineWidth = 5;
    cCtx.beginPath();
    cCtx.arc(256, 256, 118, 0, Math.PI * 2);
    cCtx.stroke();

    const plazaTex = new THREE.CanvasTexture(cCanvas);
    plazaTex.colorSpace = THREE.SRGBColorSpace;

    const courtyardMesh = new THREE.Mesh(
      new RoundedBoxGeometry(17.8, 0.22, 17.8, 3, 0.08),
      new THREE.MeshStandardMaterial({
        map: plazaTex,
        roughness: 0.42,
        metalness: 0.14,
      })
    );
    courtyardMesh.position.y = 0.05;
    courtyardMesh.receiveShadow = true;
    scene.add(courtyardMesh);

    // 4 Lush Sculpted Emerald Riad Garden Quadrants + Miniature Medina Stalls inside Courtyard!
    const lawnMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.78 });
    const lawnCurbMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.38, metalness: 0.45 });
    const gardenQuadrants: Array<[number, number, string, number]> = [
      [-4.9, 4.9, "/models/ksida/fantasy/stall-green.glb", 0.6],
      [4.9, 4.9, "/models/ksida/fantasy/stall-red.glb", -0.6],
      [4.9, -4.9, "/models/simsar/medina/cart-high.glb", -2.2],
      [-4.9, -4.9, "", 0], // Reserved for Animated Treasure Chest & Gold Coin Mountain!
    ];
    gardenQuadrants.forEach(([gx, gz, propUrl, rotY]) => {
      const curb = new THREE.Mesh(new RoundedBoxGeometry(3.8, 0.14, 3.8, 3, 0.06), lawnCurbMat);
      curb.position.set(gx, 0.17, gz);
      curb.receiveShadow = true;
      scene.add(curb);

      const lawn = new THREE.Mesh(new RoundedBoxGeometry(3.5, 0.16, 3.5, 3, 0.06), lawnMat);
      lawn.position.set(gx, 0.19, gz);
      lawn.receiveShadow = true;
      scene.add(lawn);

      if (propUrl) {
        loadClonedModel(propUrl)
          .then(({ scene: raw }) => {
            const pFit = fitModelToFootprint(raw, 1.85, 2.2);
            pFit.position.set(gx, 0.26, gz);
            pFit.rotation.y = rotY;
            scene.add(pFit);
          })
          .catch(() => {});
      }
    });

    // Animated ONCF "Al Boraq" High-Speed Train circling the inner courtyard!
    const boraqTrain = buildAlBoraqTrainSystem(scene, 7.55);

    // =========================================================================
    // 3. LIVING CENTER PLAZA, TURQUOISE OASIS POOL, SKINNED CHARACTERS & LANDMARKS!
    // =========================================================================
    const mixers: THREE.AnimationMixer[] = [];
    let showmanActions: Record<string, THREE.AnimationAction> = {};
    let activeShowmanClip = "";
    let showmanCelebrationTimer = 0;

    const triggerShowmanCelebration = (clipPref: "Dance" | "Jump" | "ThumbsUp" = "Dance") => {
      const nextAct =
        showmanActions[clipPref] || showmanActions.Dance || showmanActions.Jump;
      if (!nextAct) return;
      if (activeShowmanClip !== clipPref) {
        const prev = showmanActions[activeShowmanClip];
        nextAct.reset().fadeIn(0.2).play();
        if (prev && prev !== nextAct) prev.fadeOut(0.2);
        activeShowmanClip = clipPref;
      }
      showmanCelebrationTimer = 2.8;
    };

    // Sunken Glowing Turquoise Oasis Pool + Golden Zellige Rim + Grand 3D Fountain!
    const oasisRim = new THREE.Mesh(
      new THREE.CylinderGeometry(3.25, 3.45, 0.22, 44),
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.28,
        metalness: 0.65,
      })
    );
    oasisRim.position.y = 0.2;
    oasisRim.receiveShadow = true;
    scene.add(oasisRim);

    const oasisWater = new THREE.Mesh(
      new THREE.CylinderGeometry(2.98, 2.98, 0.24, 44),
      new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x0284c7,
        emissiveIntensity: 0.35,
        roughness: 0.12,
        metalness: 0.25,
      })
    );
    oasisWater.position.y = 0.21;
    scene.add(oasisWater);

    loadClonedModel("/models/ksida/fantasy/fountain.glb")
      .then(({ scene: raw }) => {
        const ftn = fitModelToFootprint(raw, 4.1, 3.6);
        ftn.position.set(0, 0.28, 0);
        scene.add(ftn);
      })
      .catch(() => {});

    // 16 Sparkling Fountain Water Droplets arcing continuously!
    const dropletGeo = new THREE.SphereGeometry(0.11, 8, 8);
    const dropletMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.88,
    });
    const waterDroplets: Array<{ mesh: THREE.Mesh; angle: number; phase: number }> = [];
    for (let i = 0; i < 16; i++) {
      const dm = new THREE.Mesh(dropletGeo, dropletMat);
      scene.add(dm);
      waterDroplets.push({
        mesh: dm,
        angle: (i % 8) * ((Math.PI * 2) / 8),
        phase: i / 16,
      });
    }

    // Animated Skinned Moroccan Showman Host (`hunter.glb`) on Golden Stage!
    const stagePedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.12, 0.26, 20),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.25, metalness: 0.72 })
    );
    stagePedestal.position.set(3.6, 0.22, -3.2);
    stagePedestal.castShadow = true;
    scene.add(stagePedestal);

    loadClonedModel("/models/hunter.glb", true)
      .then(({ scene: raw, animations }) => {
        const char = fitModelToFootprint(raw, 1.55);
        char.position.set(3.6, 0.34, -3.2);
        char.rotation.y = -0.55;
        scene.add(char);

        if (animations.length > 0) {
          const mixer = new THREE.AnimationMixer(raw);
          mixers.push(mixer);
          for (const clip of animations) {
            showmanActions[clip.name] = mixer.clipAction(clip);
          }
          const idle = showmanActions.Wave || showmanActions.Idle;
          if (idle) {
            idle.play();
            activeShowmanClip = showmanActions.Wave ? "Wave" : "Idle";
          }
        }
      })
      .catch(() => {});

    // 2 Animated Mascots (`character.glb`) cheering at START & JACKPOT!
    const mascotSpots: Array<[number, number, number]> = [
      [5.2, 5.2, -0.7],
      [-5.2, -2.6, 0.8],
    ];
    mascotSpots.forEach(([mx, mz, mrot], idx) => {
      loadClonedModel("/models/simsar/props/character.glb", true)
        .then(({ scene: raw, animations }) => {
          const mFit = fitModelToFootprint(raw, 1.25);
          mFit.position.set(mx, 0.14, mz);
          mFit.rotation.y = mrot;
          scene.add(mFit);
          if (animations.length > 0) {
            const mixer = new THREE.AnimationMixer(raw);
            mixers.push(mixer);
            const clip =
              animations.find((a) => a.name === (idx === 0 ? "jump" : "idle")) ||
              animations[0];
            if (clip) mixer.clipAction(clip).play();
          }
        })
        .catch(() => {});
    });

    // Animated Treasure Chest (`chest.glb`) + 3D `coin.glb` Jackpot Mountain!
    const jackpotOrigin = new THREE.Vector3(-4.9, 0.28, -4.9);
    const jackpotGroup = new THREE.Group();
    jackpotGroup.position.copy(jackpotOrigin);
    scene.add(jackpotGroup);

    loadClonedModel("/models/simsar/maritime/chest.glb", true)
      .then(({ scene: raw, animations }) => {
        const chestFit = fitModelToFootprint(raw, 1.9, 1.85);
        chestFit.rotation.y = Math.PI / 4;
        jackpotGroup.add(chestFit);
        if (animations.length > 0) {
          const mixer = new THREE.AnimationMixer(raw);
          mixers.push(mixer);
          const openLoop =
            animations.find((a) => a.name === "open-close") || animations[0];
          if (openLoop) {
            const act = mixer.clipAction(openLoop);
            act.timeScale = 0.45;
            act.play();
          }
        }
      })
      .catch(() => {});

    // Preload 3D Coin Prototype (`coin.glb`) for Jackpot Pile & Flying Coin Streams!
    let coinProto: THREE.Group | null = null;
    const jackpotCoins: THREE.Object3D[] = [];
    loadClonedModel("/models/simsar/props/coin.glb")
      .then(({ scene: raw }) => {
        coinProto = fitModelToFootprint(raw, 0.72, 0.72);
        for (let i = 0; i < 24; i++) {
          const cMesh = coinProto.clone(true);
          const ringAng = (i % 8) * ((Math.PI * 2) / 8) + Math.floor(i / 8) * 0.35;
          const ringRad = 1.05 + (i % 2) * 0.28;
          cMesh.position.set(
            Math.cos(ringAng) * ringRad,
            0.05 + Math.floor(i / 8) * 0.24,
            Math.sin(ringAng) * ringRad
          );
          cMesh.rotation.y = ringAng;
          jackpotGroup.add(cMesh);
          jackpotCoins.push(cMesh);
        }
      })
      .catch(() => {});

    // Swaying Oasis Palms + Essaouira Spinning Windmill + Corner Fortresses!
    const swayPalms: THREE.Group[] = [];
    const palmSpots: Array<[number, number, string, number, number]> = [
      [-6.2, -6.2, "/models/ksida/palm-bend.glb", 0.5, 3.0],
      [6.2, -6.2, "/models/ksida/palm-straight.glb", 2.1, 3.0],
      [-6.2, 6.2, "/models/ksida/palm-straight.glb", -1.2, 3.0],
      [6.2, 6.2, "/models/ksida/palm-bend.glb", 3.0, 3.0],
      [-14.6, 14.2, "/models/ksida/palm-bend.glb", 0.8, 3.4],
      [14.6, -14.2, "/models/ksida/palm-straight.glb", -2.2, 3.4],
      [15.6, 2.2, "/models/ksida/palm-bend.glb", 1.4, 3.1],
      [-15.6, -2.2, "/models/ksida/palm-straight.glb", -0.6, 3.1],
    ];
    palmSpots.forEach(([px, pz, url, rot, span]) => {
      loadClonedModel(url)
        .then(({ scene: raw }) => {
          const p = fitModelToFootprint(raw, span, 4.6);
          p.position.set(px, 0.08, pz);
          p.rotation.y = rot;
          scene.add(p);
          swayPalms.push(p);
        })
        .catch(() => {});
    });

    // START Corner (Tile 0: +10.8, +10.8): Bab Mansour Gate + Kasbah Tower + Royal Banners!
    loadClonedModel("/models/ksida/fantasy/arch-top.glb")
      .then(({ scene: raw }) => {
        const arch = fitModelToFootprint(raw, 4.1);
        arch.position.set(13.6, 0.06, 13.6);
        arch.rotation.y = Math.PI / 4;
        scene.add(arch);
      })
      .catch(() => {});

    loadClonedModel("/models/ksida/kasbah-tower.glb")
      .then(({ scene: raw }) => {
        const kt = fitModelToFootprint(raw, 2.8);
        kt.position.set(14.8, 0.06, 11.4);
        scene.add(kt);
      })
      .catch(() => {});

    loadClonedModel("/models/simsar/medina/banner-red.glb")
      .then(({ scene: raw }) => {
        const bn = fitModelToFootprint(raw, 1.1);
        bn.position.set(12.2, 0.08, 14.4);
        bn.rotation.y = Math.PI / 4;
        scene.add(bn);
      })
      .catch(() => {});

    // JACKPOT Corner (Tile 12: -10.8, -10.8): Essaouira Spinning Windmill Monument!
    let windmillBladePivot: THREE.Group | null = null;
    loadClonedModel("/models/simsar/medina/windmill.glb")
      .then(({ scene: raw }) => {
        const mount = new THREE.Group();
        mount.position.set(-13.7, 0.06, -13.7);
        mount.rotation.y = Math.PI / 4;

        const wm = fitModelToFootprint(raw, 2.85, 4.2);
        wm.updateMatrixWorld(true);
        const wmBox = new THREE.Box3().setFromObject(wm);
        const wmSize = new THREE.Vector3();
        wmBox.getSize(wmSize);
        mount.add(wm);
        scene.add(mount);

        loadClonedModel("/models/simsar/medina/blade.glb")
          .then(({ scene: bRaw }) => {
            bRaw.updateMatrixWorld(true);
            const bBox = new THREE.Box3().setFromObject(bRaw);
            const bSize = new THREE.Vector3();
            const bCenter = new THREE.Vector3();
            bBox.getSize(bSize);
            bBox.getCenter(bCenter);

            const bScale = 2.35 / Math.max(0.01, bSize.x, bSize.y, bSize.z);
            bRaw.scale.multiplyScalar(bScale);
            bRaw.position.set(
              -bCenter.x * bScale,
              -bCenter.y * bScale,
              -bCenter.z * bScale
            );
            bRaw.traverse((node) => {
              if ((node as THREE.Mesh).isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
              }
            });

            const pivot = new THREE.Group();
            pivot.position.set(0, wmSize.y * 0.68, wmSize.z * 0.5 + 0.08);
            pivot.add(bRaw);
            mount.add(pivot);
            windmillBladePivot = pivot;
          })
          .catch(() => {});
      })
      .catch(() => {});

    // JAIL Corner (Tile 6: -10.8, +10.8): Watchtower + Cannon!
    loadClonedModel("/models/ksida/watch-tower.glb")
      .then(({ scene: raw }) => {
        const twr = fitModelToFootprint(raw, 3.1);
        twr.position.set(-13.8, 0.06, 13.8);
        scene.add(twr);
      })
      .catch(() => {});

    loadClonedModel("/models/simsar/maritime/cannon.glb")
      .then(({ scene: raw }) => {
        const cn = fitModelToFootprint(raw, 1.65);
        cn.position.set(-14.5, 0.08, 11.6);
        cn.rotation.y = -Math.PI / 3;
        scene.add(cn);
      })
      .catch(() => {});

    // HEIST Monument (Tile 14): Giant Steaming Golden Tajine!
    loadClonedModel("/models/food/tajine.glb")
      .then(({ scene: raw }) => {
        const tj = fitModelToFootprint(raw, 2.75);
        tj.position.set(-3.6, 0.08, -14.1);
        scene.add(tj);
      })
      .catch(() => {});

    // RADAR Corner (Tile 18: +10.8, -10.8): Fortress + Sweeping Police Radar Cones + Rocks!
    loadClonedModel("/models/simsar/maritime/tower-small.glb")
      .then(({ scene: raw }) => {
        const rt = fitModelToFootprint(raw, 2.9);
        rt.position.set(13.7, 0.06, -13.7);
        scene.add(rt);
      })
      .catch(() => {});

    const radarSweepPivot = new THREE.Group();
    radarSweepPivot.position.set(13.7, 2.6, -13.7);
    const beamGeo = new THREE.ConeGeometry(1.35, 5.5, 16, 1, true);
    beamGeo.translate(0, -2.75, 0);
    beamGeo.rotateX(Math.PI / 2.6);
    const redRadarCone = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const blueRadarCone = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    blueRadarCone.rotation.y = Math.PI;
    radarSweepPivot.add(redRadarCone, blueRadarCone);
    scene.add(radarSweepPivot);

    // Coastal Sea Rocks around the Sandy Cove!
    const rockPlacements: Array<[number, number, string, number]> = [
      [18.5, -17.5, "/models/ksida/rocks-a.glb", 4.2],
      [-18.8, -16.8, "/models/ksida/rocks-b.glb", 3.9],
      [-18.5, 17.5, "/models/ksida/rocks-a.glb", 3.6],
      [18.2, 17.8, "/models/ksida/rocks-b.glb", 3.8],
    ];
    rockPlacements.forEach(([rx, rz, rUrl, rSpan]) => {
      loadClonedModel(rUrl)
        .then(({ scene: raw }) => {
          const rk = fitModelToFootprint(raw, rSpan);
          rk.position.set(rx, -0.68, rz);
          rk.rotation.y = rx * 0.5;
          scene.add(rk);
        })
        .catch(() => {});
    });

    // 8 Ornate Moroccan Medina Street Lanterns (True human scale ~1.45m, warm amber glow!)
    loadClonedModel("/models/simsar/medina/lantern.glb")
      .then(({ scene: raw }) => {
        const lanternCoords: Array<[number, number]> = [
          [-8.5, -8.5],
          [0, -8.5],
          [8.5, -8.5],
          [8.5, 0],
          [8.5, 8.5],
          [0, 8.5],
          [-8.5, 8.5],
          [-8.5, 0],
        ];
        const glowOrbGeo = new THREE.SphereGeometry(0.11, 8, 8);
        const glowOrbMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
        lanternCoords.forEach(([lx, lz]) => {
          const ln = fitModelToFootprint(raw.clone(true), 0.55, 1.45);
          ln.position.set(lx, 0.08, lz);
          const orb = new THREE.Mesh(glowOrbGeo, glowOrbMat);
          orb.position.set(0, 1.08, 0);
          ln.add(orb);
          scene.add(ln);
        });
      })
      .catch(() => {});

    // =========================================================================
    // 4. ALL 24 BEVELED ROUNDED-BOX MARBLE TILES + PRE-DRESSED SKYLINE PLOTS!
    // =========================================================================
    const tilePickMeshes: THREE.Object3D[] = [];
    const tileRigs = new Map<number, TileAnimRig>();
    const buildingSlots = new Map<number, BuildingSlotRig>();

    const selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(1.88, 2.28, 36),
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
      })
    );
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = 0.5;
    selectionRing.visible = false;
    scene.add(selectionRing);

    const goldPlinthMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      roughness: 0.34,
      metalness: 0.62,
    });
    const cornerGoldMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.24,
      metalness: 0.78,
    });

    const ownerSigns = new Map<number, ReturnType<typeof createFloatingBadgeSprite> & {key:string}>();
    const routeRings: THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>[] = [];
    if (district) {
      for (const color of [0xffdd68,0x5ae9fd]) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(2.15,2.35,40), new THREE.MeshBasicMaterial({color, side:THREE.DoubleSide}));
        ring.rotation.x = -Math.PI/2; ring.visible = false; scene.add(ring); routeRings.push(ring);
      }
    }
    tiles.forEach((tile) => {
      const tf = getTileWorldTransform(tile.index);
      const span = district ? 4.26 : tf.isCorner ? 3.54 : 3.34;
      const height = tf.isCorner ? 0.46 : 0.36;

      const tileGroup = new THREE.Group();
      const baseY = 0.06;
      tileGroup.position.set(tf.x, baseY, tf.z);
      scene.add(tileGroup);

      // Beveled Rounded-Box Marble Slab
      const slabGeo = new RoundedBoxGeometry(span, height, span, 3, 0.09);
      const slabMesh = new THREE.Mesh(
        slabGeo,
        tf.isCorner ? cornerGoldMat : goldPlinthMat
      );
      slabMesh.position.y = height * 0.5;
      slabMesh.castShadow = true;
      slabMesh.receiveShadow = true;
      slabMesh.userData = { tileIndex: tile.index };
      tileGroup.add(slabMesh);
      tilePickMeshes.push(slabMesh);

      // Crisp High-DPI Top Card Inlay
      const topTex = createTileTopTexture(tile, tf.isCorner, district ? 80 : 120);
      const topCard = new THREE.Mesh(
        new THREE.PlaneGeometry(span - 0.14, span - 0.14),
        new THREE.MeshStandardMaterial({
          map: topTex,
          roughness: 0.28,
          metalness: 0.08,
        })
      );
      topCard.rotation.x = -Math.PI / 2;
      topCard.position.y = height + 0.008;
      topCard.receiveShadow = true;
      topCard.userData = { tileIndex: tile.index };
      tileGroup.add(topCard);
      tilePickMeshes.push(topCard);

      // Raised 3D Color Curb along outer edge of City/Utility tiles!
      if (tile.kind === "CITY" || tile.kind === "UTILITY") {
        const curb = new THREE.Mesh(
          new THREE.BoxGeometry(span * 0.88, 0.14, 0.24),
          new THREE.MeshStandardMaterial({
            color: tile.colorHex,
            emissive: tile.colorHex,
            emissiveIntensity: 0.2,
            roughness: 0.3,
          })
        );
        curb.position.set(
          tf.outwardNx * (span * 0.42),
          height + 0.06,
          tf.outwardNz * (span * 0.42)
        );
        curb.rotation.y = Math.atan2(tf.outwardNx, tf.outwardNz);
        tileGroup.add(curb);
      }

      tileRigs.set(tile.index, {
        group: tileGroup,
        baseY,
        pressY: 0,
        pressVel: 0,
      });

      // Outer 3D Skyline Plot for Cities & Utilities
      if (tile.kind === "CITY" || tile.kind === "UTILITY") {
        const ownerRing = new THREE.Mesh(
          new THREE.RingGeometry(1.62, 1.88, 4),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
          })
        );
        ownerRing.rotation.x = -Math.PI / 2;
        ownerRing.rotation.z = Math.PI / 4;
        ownerRing.position.set(tf.x, height + 0.09, tf.z);
        ownerRing.visible = false;
        scene.add(ownerRing);

        const mortgageBadge = new THREE.Mesh(
          new THREE.CylinderGeometry(0.62, 0.62, 0.16, 18),
          new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35 })
        );
        mortgageBadge.position.set(tf.x, height + 0.17, tf.z);
        mortgageBadge.visible = false;
        scene.add(mortgageBadge);

        const holder = new THREE.Group();
        holder.position.set(
          tf.x + tf.outwardNx * 3.15,
          0.08,
          tf.z + tf.outwardNz * 3.15
        );
        holder.rotation.y = Math.atan2(-tf.outwardNx, -tf.outwardNz);
        scene.add(holder);

        const crownGroup = build3DCrownGroup(0.92);
        crownGroup.position.set(0, 4.2, 0);
        crownGroup.visible = false;
        holder.add(crownGroup);

        // Additive Golden Construction Skybeam!
        const skybeam = new THREE.Mesh(
          new THREE.CylinderGeometry(1.15, 1.45, 9.5, 20, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0xfde047,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        skybeam.position.set(0, 4.75, 0);
        skybeam.visible = false;
        holder.add(skybeam);

        if (district) {
          const sign = createFloatingBadgeSprite("", "#f9ce71");
          sign.sprite.position.copy(holder.position).y = 3.45;
          sign.sprite.visible = false;
          sign.sprite.userData.tileIndex = tile.index;
          scene.add(sign.sprite);tilePickMeshes.push(sign.sprite);
          ownerSigns.set(tile.index,{...sign,key:""});
        }
        buildingSlots.set(tile.index, {
          holder,
          ownerRing,
          mortgageBadge,
          crownGroup,
          skybeam,
          beamLife: 0,
          currentLevel: -2, // forces initial population so unowned gardens appear immediately!
          currentOwnerId: null,
          popAnim: 1,
        });
      }
    });

    // =========================================================================
    // 5. RIGID-BODY 3D DICE PHYSICS + SHOCKWAVES + PARTICLES + FLYING 3D COINS!
    // =========================================================================
    const dieMats = createDieMaterials();
    const dieGeo = new RoundedBoxGeometry(1.52, 1.52, 1.52, 4, 0.2);
    const dieMesh1 = new THREE.Mesh(dieGeo, dieMats);
    const dieMesh2 = new THREE.Mesh(dieGeo, dieMats);
    dieMesh1.castShadow = true;
    dieMesh2.castShadow = true;
    dieMesh1.visible = false;
    dieMesh2.visible = false;
    scene.add(dieMesh1, dieMesh2);

    const diceBodies: [RigidDieBody, RigidDieBody] = [
      {
        mesh: dieMesh1,
        x: -1.1,
        y: 0.9,
        z: 1.5,
        vx: 0,
        vy: 0,
        vz: 0,
        wx: 0,
        wy: 0,
        wz: 0,
        targetQuat: new THREE.Quaternion(),
        bounces: 0,
        settled: true,
      },
      {
        mesh: dieMesh2,
        x: 1.1,
        y: 0.9,
        z: 1.5,
        vx: 0,
        vy: 0,
        vz: 0,
        wx: 0,
        wy: 0,
        wz: 0,
        targetQuat: new THREE.Quaternion(),
        bounces: 0,
        settled: true,
      },
    ];

    let activeDiceSeq = liveRef.current.lastDice?.rollSeq ?? 0;
    let diceRollElapsed = 99;
    let diceCalloutSpawned = true;
    let camShake = 0;

    // VFX Pools: Shockwaves, Burst Sparks/Dust, World Floating Callouts & Flying 3D Coins!
    const shockwaves: ShockwaveRing[] = [];
    const bursts: BurstParticle[] = [];
    const worldPopups: FloatingWorldPopup[] = [];
    const flyingCoins: FlyingCoin[] = [];

    const ringGeo = new THREE.RingGeometry(0.45, 0.78, 28);
    const sparkGeo = new THREE.OctahedronGeometry(0.24, 0);
    const dustGeo = new THREE.SphereGeometry(0.28, 8, 8);
    const goldSparkMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const dustPuffMat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.75,
    });

    const spawnShockwave = (x: number, y: number, z: number, colorHex = 0xfef08a, maxScale = 4.2) => {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      scene.add(mesh);
      shockwaves.push({ mesh, mat, life: 0.52, maxScale });
    };

    const spawnConstructionBurst = (bx: number, by: number, bz: number, count = 20) => {
      spawnShockwave(bx, 0.22, bz, 0xfbbf24, 5.2);
      for (let i = 0; i < count; i++) {
        const isDust = i % 2 === 0;
        const m = new THREE.Mesh(
          isDust ? dustGeo : sparkGeo,
          isDust ? dustPuffMat : goldSparkMat
        );
        m.position.set(bx, by, bz);
        const ang = (i / count) * Math.PI * 2 + Math.random() * 0.35;
        const spd = isDust ? 2.2 + Math.random() * 2.8 : 3.2 + Math.random() * 5.2;
        const maxLife = isDust ? 0.65 : 0.92;
        scene.add(m);
        bursts.push({
          mesh: m,
          vx: Math.cos(ang) * spd,
          vy: isDust ? 1.8 + Math.random() * 2.2 : 5.5 + Math.random() * 5.5,
          vz: Math.sin(ang) * spd,
          rotSpd: 6 + Math.random() * 8,
          life: maxLife,
          maxLife,
          gravity: isDust ? -4 : -15,
        });
      }
    };

    const spawnDustPuffs = (bx: number, by: number, bz: number, count = 6) => {
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(dustGeo, dustPuffMat);
        m.position.set(bx, by, bz);
        const ang = (i / count) * Math.PI * 2;
        const spd = 1.6 + Math.random() * 1.5;
        scene.add(m);
        bursts.push({
          mesh: m,
          vx: Math.cos(ang) * spd,
          vy: 1.2 + Math.random() * 1.4,
          vz: Math.sin(ang) * spd,
          rotSpd: 2,
          life: 0.45,
          maxLife: 0.45,
          gravity: -3,
        });
      }
    };

    const spawnWorldPopup = (
      x: number,
      y: number,
      z: number,
      text: string,
      bgHex: string,
      textHex = "#ffffff"
    ) => {
      const sp = createPopupTextSprite(text, bgHex, textHex);
      sp.position.set(x, y, z);
      scene.add(sp);
      worldPopups.push({ sprite: sp, life: 1.45, maxLife: 1.45 });
    };

    const fallbackCoinGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.12, 16);
    fallbackCoinGeo.rotateX(Math.PI / 2);
    const fallbackCoinMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xd97706,
      emissiveIntensity: 0.35,
      roughness: 0.18,
      metalness: 0.85,
    });

    const spawnCoinTransferStream = (
      startPos: THREE.Vector3,
      targetPlayerId: string | null,
      fallbackTargetPos: THREE.Vector3,
      coinCount = 16
    ) => {
      for (let i = 0; i < coinCount; i++) {
        const mesh = coinProto
          ? coinProto.clone(true)
          : new THREE.Mesh(fallbackCoinGeo, fallbackCoinMat);
        mesh.position.copy(startPos);
        mesh.visible = false;
        scene.add(mesh);
        flyingCoins.push({
          mesh,
          delay: i * 0.032,
          t: 0,
          speed: 1.48 + (i % 3) * 0.12,
          startPos: startPos.clone(),
          targetPlayerId,
          fallbackTargetPos: fallbackTargetPos.clone(),
          peakHeight: 4.4 + (i % 4) * 0.55,
          swirlSign: i % 2 === 0 ? 1 : -1,
        });
      }
    };

    // Track cash values frame-to-frame to trigger Monopoly-GO Flying 3D Coin Streams!
    const prevCashMap = new Map<string, number>();
    let prevPotValue = liveRef.current.gardiennagePot;
    for (const p of Object.values(liveRef.current.players)) {
      prevCashMap.set(p.id, p.cash);
    }

    // =========================================================================
    // 6. UV-PRESERVED 3D PLAYER CARS + SHIELDS + CROWNS + SKYLINE BUILDER!
    // =========================================================================
    const tokenRigs = new Map<string, TokenVisualRig>();

    const populateTokenModel = (rig: TokenVisualRig, tokenType: SimsarTokenId) => {
      const spec = SIMSAR_TOKENS[tokenType] || SIMSAR_TOKENS.TAXI_HMER;
      while (rig.bodyHolder.children.length > 0) {
        rig.bodyHolder.remove(rig.bodyHolder.children[0]);
      }
      rig.wheelNodes = [];
      rig.sirenRed = null;
      rig.sirenBlue = null;

      // Choose upgraded supercar model for VIP_SPORTS if available!
      const glbUrl =
        tokenType === "VIP_SPORTS"
          ? "/models/cars/race-future.glb"
          : spec.glbPath;

      loadClonedModel(glbUrl)
        .then(({ scene: raw }) => {
          raw.traverse((node) => {
            if (node.name.toLowerCase().includes("wheel")) {
              rig.wheelNodes.push(node);
            }
            if ((node as THREE.Mesh).isMesh) {
              const mesh = node as THREE.Mesh;
              if (Array.isArray(mesh.material)) {
                mesh.material = mesh.material.map((m) =>
                  (m as THREE.MeshStandardMaterial).isMeshStandardMaterial
                    ? getCarLiveryMaterial(m as THREE.MeshStandardMaterial, tokenType)
                    : m
                );
              } else if (
                mesh.material &&
                (mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial
              ) {
                mesh.material = getCarLiveryMaterial(
                  mesh.material as THREE.MeshStandardMaterial,
                  tokenType
                );
              }
            }
          });

          const fitted = fitModelToFootprint(raw, 2.58, 1.95);
          rig.bodyHolder.add(fitted);

          // Glowing Twin Headlight Flares
          const hlGeo = new THREE.SphereGeometry(0.1, 8, 8);
          const hlMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
          for (const sx of [-0.46, 0.46]) {
            const hl = new THREE.Mesh(hlGeo, hlMat);
            hl.position.set(sx, 0.48, 1.12);
            rig.bodyHolder.add(hl);
          }

          // Petit Taxi Roof Sign on TAXI_HMER!
          if (tokenType === "TAXI_HMER") {
            const taxiSign = new THREE.Mesh(
              new THREE.BoxGeometry(0.56, 0.2, 0.24),
              new THREE.MeshBasicMaterial({ color: 0xfef08a })
            );
            taxiSign.position.set(0, 1.32, 0.05);
            rig.bodyHolder.add(taxiSign);
          }

          // Police Red/Blue Strobe Bar on JADARMIYA!
          if (tokenType === "JADARMIYA") {
            const rLight = new THREE.Mesh(
              new THREE.BoxGeometry(0.32, 0.16, 0.2),
              new THREE.MeshBasicMaterial({ color: 0xef4444 })
            );
            rLight.position.set(-0.2, 1.36, 0);
            const bLight = new THREE.Mesh(
              new THREE.BoxGeometry(0.32, 0.16, 0.2),
              new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
            );
            bLight.position.set(0.2, 1.36, 0);
            rig.bodyHolder.add(rLight, bLight);
            rig.sirenRed = rLight;
            rig.sirenBlue = bLight;
          }

          // Stacked 3D Watermelons in the back of WATERMELON_TRUCK!
          if (tokenType === "WATERMELON_TRUCK") {
            loadClonedModel("/models/food/watermelon.glb")
              .then(({ scene: wm }) => {
                for (const [wx, wy, wz] of [
                  [-0.25, 0.68, -0.44],
                  [0.25, 0.68, -0.44],
                  [0, 1.0, -0.44],
                ]) {
                  const wFit = fitModelToFootprint(wm.clone(true), 0.7, 0.7);
                  wFit.position.set(wx, wy, wz);
                  rig.bodyHolder.add(wFit);
                }
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    };

    const populateBuildingSlot = (
      slot: BuildingSlotRig,
      level: number,
      ownerId: string | null,
      tileIdx: number
    ) => {
      for (let i = slot.holder.children.length - 1; i >= 0; i--) {
        const ch = slot.holder.children[i];
        if (ch !== slot.crownGroup && ch !== slot.skybeam) {
          slot.holder.remove(ch);
        }
      }
      slot.crownGroup.visible = Boolean(ownerId && level === 3);

      // UNOWNED PLOT: Rich 3D Moroccan Neighborhood Architecture & Gardens from Frame 1!
      if (!ownerId) {
        const unownedBuildingUrls = [
          "/models/ksida/city/building-a.glb",
          "/models/ksida/city/building-c.glb",
          "/models/simsar/suburban/villa-g.glb",
          "/models/simsar/commercial/plaza-fountain.glb",
        ];
        const price = tiles[tileIdx].price ?? 0;
        const previewUrl = district && price >= 500 ? SKYSCRAPER_GLBS[tileIdx % SKYSCRAPER_GLBS.length]
          : district && price >= 300 ? VILLA_GLBS[tileIdx % VILLA_GLBS.length] : unownedBuildingUrls[tileIdx % unownedBuildingUrls.length];
        loadClonedModel(previewUrl)
          .then(({ scene: raw }) => {
            const bFit = fitModelToFootprint(raw, district && price >= 300 ? 2.6 : 1.95, district && price >= 500 ? 4.4 : 2.2);
            slot.holder.add(bFit);
          })
          .catch(() => {});

        const sideTreeUrl =
          tileIdx % 2 === 0
            ? "/models/simsar/suburban/tree-large.glb"
            : "/models/simsar/suburban/planter.glb";
        loadClonedModel(sideTreeUrl)
          .then(({ scene: raw }) => {
            const tFit = fitModelToFootprint(raw, 0.95, 1.65);
            tFit.position.set(1.05, 0, 0.45);
            slot.holder.add(tFit);
          })
          .catch(() => {});
        return;
      }

      const ownerColor = liveRef.current.players[ownerId]?.accentHex || "#fbbf24";

      // Helper to plant 3D Ownership Flag beside owned plot!
      const attachOwnerFlag = (offsetX = -1.1) => {
        loadClonedModel("/models/simsar/props/flag.glb")
          .then(({ scene: raw }) => {
            raw.traverse((n) => {
              if ((n as THREE.Mesh).isMesh && n.name.includes("flag")) {
                (n as THREE.Mesh).material = new THREE.MeshStandardMaterial({
                  color: ownerColor,
                  emissive: ownerColor,
                  emissiveIntensity: 0.3,
                  roughness: 0.35,
                });
              }
            });
            const fFit = fitModelToFootprint(raw, 0.85, 1.6);
            fFit.position.set(offsetX, 0, 0.72);
            slot.holder.add(fFit);
          })
          .catch(() => {});
      };

      // LEVEL 0 (OWNED LAND): Ownership Flag + Cozy 3D Moroccan Villa / Pavilion!
      if (level <= 0) {
        attachOwnerFlag(-1.05);
        const lotUrl =
          tileIdx % 2 === 0
            ? "/models/simsar/suburban/villa-k.glb"
            : "/models/ksida/city/building-a.glb";
        loadClonedModel(lotUrl)
          .then(({ scene: raw }) => {
            const fitted = fitModelToFootprint(raw, 2.15, 2.45);
            slot.holder.add(fitted);
          })
          .catch(() => {});
        return;
      }

      // LEVEL 1 (قهوة شعبية ☕): Bustling Moroccan Café Stall + Villa Backdrop + Outdoor Table!
      if (level === 1) {
        attachOwnerFlag(-1.2);
        const stallUrl =
          tileIdx % 2 === 0
            ? "/models/ksida/fantasy/stall-green.glb"
            : "/models/ksida/fantasy/stall-red.glb";
        loadClonedModel(stallUrl)
          .then(({ scene: raw }) => {
            const fitted = fitModelToFootprint(raw, 2.35, 2.65);
            slot.holder.add(fitted);
          })
          .catch(() => {});
        loadClonedModel("/models/furniture/tableRound.glb")
          .then(({ scene: tRaw }) => {
            const tb = fitModelToFootprint(tRaw, 0.85, 0.9);
            tb.position.set(1.08, 0, 0.6);
            slot.holder.add(tb);
          })
          .catch(() => {});
        return;
      }

      // LEVEL 2 (رياض سياحي 🕌): Diverse Multi-Story Villas & Riads + Oasis Palm!
      if (level === 2) {
        attachOwnerFlag(-1.25);
        const villaUrl = VILLA_GLBS[tileIdx % VILLA_GLBS.length];
        loadClonedModel(villaUrl)
          .then(({ scene: raw }) => {
            const fitted = fitModelToFootprint(raw, 2.75, 3.35);
            slot.holder.add(fitted);
          })
          .catch(() => {});
        loadClonedModel("/models/ksida/palm-bend.glb")
          .then(({ scene: pRaw }) => {
            const plm = fitModelToFootprint(pRaw, 2.1, 3.5);
            plm.position.set(1.3, 0, 0.55);
            slot.holder.add(plm);
          })
          .catch(() => {});
        return;
      }

      // LEVEL 3 (أوطيل 5 نجوم 👑): Towering Luxury Skyscraper Hotel + Twin Palms + Levitating Crown!
      attachOwnerFlag(-1.35);
      const hotelUrl = SKYSCRAPER_GLBS[tileIdx % SKYSCRAPER_GLBS.length];
      loadClonedModel(hotelUrl)
        .then(({ scene: raw }) => {
          const fitted = fitModelToFootprint(raw, 2.95, 5.1);
          slot.holder.add(fitted);
          const bBox = new THREE.Box3().setFromObject(fitted);
          slot.crownGroup.position.y = bBox.max.y + 0.72;
        })
        .catch(() => {});

      loadClonedModel("/models/ksida/palm-straight.glb")
        .then(({ scene: pRaw }) => {
          for (const sx of [-1.35, 1.35]) {
            const plm = fitModelToFootprint(pRaw.clone(true), 2.15, 3.8);
            plm.position.set(sx, 0, 0.68);
            slot.holder.add(plm);
          }
        })
        .catch(() => {});
    };

    // =========================================================================
    // 7. PORTRAIT-FRIENDLY TOUCH ORBIT, PINCH-ZOOM & TILE RAYCASTER
    // =========================================================================
    let userOrbitOffset = district ? .18 : 0;
    let userZoomMult = 1.0;
    const activePointers = new Map<number, { x: number; y: number }>();
    let downStart = { x: 0, y: 0, moved: false };
    let lastPinchDist = 0;

    const domEl = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 1) {
        downStart = { x: e.clientX, y: e.clientY, moved: false };
      } else if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        downStart.moved = true;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const prev = activePointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (Math.hypot(e.clientX - downStart.x, e.clientY - downStart.y) > 9) {
        downStart.moved = true;
      }

      if (activePointers.size === 1) {
        userOrbitOffset -= dx * 0.0075;
        userZoomMult = Math.max(0.65, Math.min(1.36, userZoomMult + dy * 0.0018));
      } else if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (lastPinchDist > 10) {
          const ratio = lastPinchDist / Math.max(10, dist);
          userZoomMult = Math.max(0.62, Math.min(1.38, userZoomMult * ratio));
        }
        lastPinchDist = dist;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasSingleTap = activePointers.size === 1 && !downStart.moved;
      activePointers.delete(e.pointerId);

      if (wasSingleTap && liveRef.current.onSelectTile) {
        const rect = domEl.getBoundingClientRect();
        ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(tilePickMeshes, false).filter(hit => hit.object.visible);
        if (hits.length > 0) {
          const tIdx = hits[0].object.userData?.tileIndex;
          if (typeof tIdx === "number") {
            const tRig = tileRigs.get(tIdx);
            if (tRig) tRig.pressVel = -3.8; // tactile press bounce on tap!
            simsarSfx.playPopTap(1.1);
            liveRef.current.onSelectTile(tIdx);
          }
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userZoomMult = Math.max(0.62, Math.min(1.38, userZoomMult + e.deltaY * 0.0008));
    };

    domEl.addEventListener("pointerdown", onPointerDown);
    domEl.addEventListener("pointermove", onPointerMove);
    domEl.addEventListener("pointerup", onPointerUp);
    domEl.addEventListener("pointercancel", onPointerUp);
    domEl.addEventListener("wheel", onWheel, { passive: false });

    const resizeObs = new ResizeObserver(() => {
      const w = Math.max(240, container.clientWidth);
      const h = Math.max(240, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObs.observe(container);

    // =========================================================================
    // 8. 60 FPS MASTER ANIMATION & CHOREOGRAPHY LOOP
    // =========================================================================
    const camPos = new THREE.Vector3(0, 26, 28);
    const camLook = new THREE.Vector3(0, 0.5, 1.5);
    const clock = new THREE.Clock();
    let rafId = 0;

    let lastFrame = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const now = performance.now();
      if (district && (document.hidden || now-lastFrame < 1000/32)) return;
      const cameraBlend = Math.min(1, (now-lastFrame)/170);
      lastFrame = now;
      const dt = Math.min(0.05, clock.getDelta());
      const elapsed = clock.elapsedTime;
      const snap = liveRef.current;

      // A. Update Shaders, Mixers, Train, Ships, Balloon, Windmill & Fountain Jets!
      skyMat.uniforms.uTime.value = elapsed;
      oceanMat.uniforms.uTime.value = elapsed;
      for (const mx of mixers) mx.update(dt);

      if (showmanCelebrationTimer > 0) {
        showmanCelebrationTimer -= dt;
        if (showmanCelebrationTimer <= 0) {
          const idleName = showmanActions.Wave ? "Wave" : "Idle";
          const idleAct = showmanActions[idleName];
          if (idleAct && activeShowmanClip !== idleName) {
            const prev = showmanActions[activeShowmanClip];
            idleAct.reset().fadeIn(0.3).play();
            if (prev) prev.fadeOut(0.3);
            activeShowmanClip = idleName;
          }
        }
      }

      boraqTrain.updateTrain(elapsed);
      radarSweepPivot.rotation.y = elapsed * 2.1;
      if (windmillBladePivot) windmillBladePivot.rotation.z = -elapsed * 1.45;

      // Balloon gentle sky float & burner flicker
      balloon.group.position.x = -18 + Math.sin(elapsed * 0.18) * 5.5;
      balloon.group.position.y = 13.5 + Math.sin(elapsed * 0.65) * 0.85;
      balloon.group.rotation.y = elapsed * 0.15;
      balloon.flameMesh.scale.setScalar(0.85 + Math.sin(elapsed * 16) * 0.25);

      for (const cl of cloudRigs) {
        cl.angle += cl.speed * dt;
        cl.mesh.position.set(
          Math.cos(cl.angle) * cl.radius,
          cl.y + Math.sin(elapsed * 0.5 + cl.angle) * 0.35,
          Math.sin(cl.angle) * cl.radius
        );
        cl.mesh.rotation.y = -cl.angle;
      }

      for (const sh of shipRigs) {
        sh.phase += sh.orbitSpeed * dt;
        const sx = Math.cos(sh.phase) * sh.orbitRadius;
        const sz = Math.sin(sh.phase) * sh.orbitRadius;
        sh.root.position.set(sx, -0.68 + Math.sin(elapsed * 2.2 + sh.phase) * 0.12, sz);
        const dirSign = sh.orbitSpeed >= 0 ? 1 : -1;
        sh.root.rotation.y = Math.atan2(-Math.sin(sh.phase) * dirSign, Math.cos(sh.phase) * dirSign);
        sh.root.rotation.z = Math.sin(elapsed * 2.0 + sh.phase) * 0.065;
        sh.root.rotation.x = Math.cos(elapsed * 1.6 + sh.phase) * 0.04;
        for (const sNode of sh.sails) {
          sNode.scale.z = 1 + Math.sin(elapsed * 4.5 + sh.phase) * 0.08;
        }
      }

      swayPalms.forEach((p, idx) => {
        p.rotation.z = Math.sin(elapsed * 1.6 + idx * 1.1) * 0.045;
        p.rotation.x = Math.cos(elapsed * 1.2 + idx) * 0.025;
      });

      // Fountain Parabolic Crystal Water Jets
      for (const wd of waterDroplets) {
        const t = (elapsed * 0.95 + wd.phase) % 1;
        const r = 0.25 + t * 1.65;
        const y = 1.65 + Math.sin(t * Math.PI) * 1.45 - t * 1.15;
        wd.mesh.position.set(Math.cos(wd.angle) * r, y, Math.sin(wd.angle) * r);
        wd.mesh.scale.setScalar(0.55 + Math.sin(t * Math.PI) * 0.65);
      }

      // Gardiennage Coin Pile Growth & Spin
      const visibleCoins = Math.min(
        jackpotCoins.length,
        Math.max(4, Math.floor(snap.gardiennagePot / 32))
      );
      jackpotCoins.forEach((cm, idx) => {
        cm.visible = idx < visibleCoins;
        cm.rotation.y = elapsed * 2.2 + idx * 0.4;
      });

      // B. Spring-Loaded Piano-Key Tile Physics & Selection Halo
      for (const tRig of tileRigs.values()) {
        const springF = -160 * tRig.pressY - 16 * tRig.pressVel;
        tRig.pressVel += springF * dt;
        tRig.pressY += tRig.pressVel * dt;
        if (Math.abs(tRig.pressY) < 0.001 && Math.abs(tRig.pressVel) < 0.005) {
          tRig.pressY = 0;
          tRig.pressVel = 0;
        }
        tRig.group.position.y = tRig.baseY + tRig.pressY;
      }

      if (snap.selectedTileIndex !== null && snap.selectedTileIndex >= 0) {
        const stf = getTileWorldTransform(snap.selectedTileIndex);
        selectionRing.visible = true;
        selectionRing.position.set(stf.x, 0.54, stf.z);
        selectionRing.scale.setScalar(1 + Math.sin(elapsed * 6.5) * 0.08);
      } else {
        selectionRing.visible = false;
      }

      // C. Sync 3D Skyline Buildings + Skybeams + Overshoot Drop-In!
      for (const [tileIdx, slot] of buildingSlots.entries()) {
        const prop = snap.properties[tileIdx];
        const ownerId = prop?.ownerId || null;
        const tier = prop?.level ?? 0;
        const price = tiles[tileIdx].price ?? 0;
        const level = ownerId ? district ? Math.min(3,tier+(price>=500?3:price>=300?2:1)) : tier : 0;
        const sign = ownerSigns.get(tileIdx);
        if (sign) {
          const owner = ownerId ? snap.players[ownerId] : undefined;
          sign.sprite.visible = !!owner;
          if (owner) {
            const name = (snap.neighborhood?.emblems[owner.id] ?? "")+" "+owner.nickname;
            const key = name+owner.accentHex;
            if(sign.key!==key){sign.updateText(name,owner.accentHex);sign.key=key;}
            const lit = snap.neighborhood?.focusOwner===owner.id;
            const pixelSize = 2 * camera.position.distanceTo(sign.sprite.position) * .364 / Math.max(1,container.clientHeight);
            const width = Math.max(3.8, Math.min(8.0, pixelSize * (lit ? 74 : 61)));
            sign.sprite.scale.set(width, width * .27, 1);
            sign.sprite.position.y=level>=3?5.7:level===2?4.1:3.05;
            slot.ownerRing.scale.setScalar(lit?1.38:1.15);
          }
        }

        if (ownerId) {
          const owner = snap.players[ownerId];
          slot.ownerRing.visible = true;
          (slot.ownerRing.material as THREE.MeshBasicMaterial).color.set(
            owner?.accentHex || "#fbbf24"
          );
          slot.mortgageBadge.visible = Boolean(prop?.isMortgaged);
        } else {
          slot.ownerRing.visible = false;
          slot.mortgageBadge.visible = false;
        }

        if (slot.currentLevel !== level || slot.currentOwnerId !== ownerId) {
          const isInitialBoot = slot.currentLevel === -2;
          const wasUpgradeOrPurchase =
            !isInitialBoot &&
            ownerId !== null &&
            (level > Math.max(0, slot.currentLevel) || slot.currentOwnerId !== ownerId);

          slot.currentLevel = level;
          slot.currentOwnerId = ownerId;
          populateBuildingSlot(slot, level, ownerId, tileIdx);

          if (wasUpgradeOrPurchase) {
            slot.popAnim = 0.01;
            slot.beamLife = 0.72;
            slot.skybeam.visible = true;
            camShake = Math.max(camShake, level >= 2 ? 0.42 : 0.25);
            triggerShowmanCelebration(level === 3 ? "Dance" : "Jump");
            spawnConstructionBurst(
              slot.holder.position.x,
              1.1,
              slot.holder.position.z,
              level === 3 ? 28 : 18
            );
          }
        }

        if (slot.popAnim < 1) {
          slot.popAnim = Math.min(1, slot.popAnim + dt * 2.8);
          const sc = Math.max(0.05, easeOutBackOvershoot(slot.popAnim));
          const dropY = (1 - slot.popAnim) * (1 - slot.popAnim) * 4.2;
          slot.holder.position.y = 0.08 + dropY;
          slot.holder.scale.set(sc, sc, sc);
        } else {
          slot.holder.position.y = 0.08;
          slot.holder.scale.setScalar(1);
        }

        if (slot.beamLife > 0) {
          slot.beamLife -= dt;
          (slot.skybeam.material as THREE.MeshBasicMaterial).opacity =
            Math.max(0, slot.beamLife / 0.72) * 0.55;
          slot.skybeam.scale.x = 0.5 + (1 - slot.beamLife / 0.72) * 1.1;
          slot.skybeam.scale.z = slot.skybeam.scale.x;
          if (slot.beamLife <= 0) slot.skybeam.visible = false;
        }

        if (slot.crownGroup.visible) {
          slot.crownGroup.rotation.y = elapsed * 2.4;
          slot.crownGroup.position.y += Math.sin(elapsed * 4) * 0.004;
        }
      }

      // D. Real Rigid-Body 3D Dice Throw, Bounce & Clatter!
      const ld = snap.lastDice;
      if (ld) {
        if (ld.rollSeq !== activeDiceSeq) {
          activeDiceSeq = ld.rollSeq;
          diceRollElapsed = 0;
          diceCalloutSpawned = false;

          const targets = [ld.die1, ld.die2];
          diceBodies.forEach((b, idx) => {
            const sign = idx === 0 ? -1 : 1;
            b.mesh.visible = true;
            // Launch from foreground onto the open stone plaza in front of the Oasis Fountain!
            b.x = sign * 2.1;
            b.y = 5.0 + idx * 0.55;
            b.z = 8.8;
            b.vx = -sign * (1.05 + Math.random() * 0.75);
            b.vy = 2.4 + Math.random() * 1.3;
            b.vz = -(4.3 + Math.random() * 1.1);
            b.wx = (Math.random() > 0.5 ? 1 : -1) * (15 + Math.random() * 8);
            b.wy = (Math.random() - 0.5) * 14;
            b.wz = (Math.random() > 0.5 ? 1 : -1) * (14 + Math.random() * 8);
            b.targetQuat = getDieTopQuaternion(
              targets[idx],
              (idx === 0 ? 0.18 : -0.22) + (Math.random() - 0.5) * 0.2
            );
            b.bounces = 0;
            b.settled = false;
          });
        }

        diceRollElapsed += dt;
        const floorY = 0.9;

        for (const b of diceBodies) {
          b.mesh.visible = true;
          if (!b.settled) {
            b.vy -= 42 * dt; // crisp arcade gravity
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.z += b.vz * dt;

            // Keep inside open front stone plaza (clear of the center fountain!)
            if (Math.abs(b.x) > 2.6) {
              b.x = Math.sign(b.x) * 2.6;
              b.vx *= -0.6;
            }
            if (b.z < 3.6) {
              b.z = 3.6;
              b.vz = Math.abs(b.vz) * 0.55;
            } else if (b.z > 5.6) {
              b.z = 5.6;
              b.vz = -Math.abs(b.vz) * 0.55;
            }

            if (b.y <= floorY) {
              b.y = floorY;
              b.bounces += 1;
              if (Math.abs(b.vy) > 2.4 && b.bounces <= 3) {
                b.vy = -b.vy * 0.48;
                b.vx *= 0.68;
                b.vz *= 0.68;
                b.wx *= 0.65;
                b.wy *= 0.65;
                b.wz *= 0.65;
                spawnShockwave(b.x, 0.18, b.z, 0xfef08a, 2.4);
                camShake = Math.max(camShake, 0.16);
              } else {
                b.vy = 0;
                b.vx = 0;
                b.vz = 0;
                b.settled = true;
              }
            }

            // Integrate angular velocity while tumbling, then smoothly slerp into exact target face!
            if (diceRollElapsed < 0.56 && !b.settled) {
              b.mesh.rotation.x += b.wx * dt;
              b.mesh.rotation.y += b.wy * dt;
              b.mesh.rotation.z += b.wz * dt;
            } else {
              b.mesh.quaternion.slerp(b.targetQuat, Math.min(1, dt * 15));
            }
          } else {
            b.mesh.quaternion.slerp(b.targetQuat, Math.min(1, dt * 18));
            b.y = floorY;
          }
          b.mesh.position.set(b.x, b.y, b.z);
        }

        // Prevent dice overlap if they landed too close
        const dx = diceBodies[1].x - diceBodies[0].x;
        const dz = diceBodies[1].z - diceBodies[0].z;
        const dDist = Math.hypot(dx, dz);
        if (dDist < 1.85 && dDist > 0.001) {
          const push = (1.85 - dDist) * 0.5;
          const nx = dx / dDist;
          const nz = dz / dDist;
          diceBodies[0].x -= nx * push;
          diceBodies[0].z -= nz * push;
          diceBodies[1].x += nx * push;
          diceBodies[1].z += nz * push;
        }

        if (!diceCalloutSpawned && diceRollElapsed > 0.64) {
          diceCalloutSpawned = true;
          const midX = (diceBodies[0].x + diceBodies[1].x) * 0.5;
          const midZ = (diceBodies[0].z + diceBodies[1].z) * 0.5;
          const callTxt = ld.isDoubles
            ? `🔥 ضوبل ${ld.total}!`
            : `🎲 مجموع ${ld.total}!`;
          spawnWorldPopup(
            midX,
            2.35,
            midZ,
            callTxt,
            ld.isDoubles ? "#7c3aed" : "#0f172a",
            "#fde047"
          );
          if (ld.isDoubles) triggerShowmanCelebration("Dance");
        }
      }

      // E. Detect Cash Transfers & Launch Flying 3D Gold Coin Streams!
      const alivePlayers = Object.values(snap.players).filter((p) => !p.isBankrupt);
      let topWealthId = "";
      let topWealthVal = -1;
      for (const p of alivePlayers) {
        if (p.netWorth > topWealthVal) {
          topWealthVal = p.netWorth;
          topWealthId = p.id;
        }
      }

      const gainers: Array<{ id: string; delta: number }> = [];
      const losers: Array<{ id: string; delta: number }> = [];
      for (const p of Object.values(snap.players)) {
        const oldCash = prevCashMap.get(p.id);
        if (oldCash !== undefined && oldCash !== p.cash) {
          const delta = p.cash - oldCash;
          if (delta >= 20) gainers.push({ id: p.id, delta });
          else if (delta <= -20) losers.push({ id: p.id, delta: -delta });
        }
        prevCashMap.set(p.id, p.cash);
      }
      const potDelta = snap.gardiennagePot - prevPotValue;
      prevPotValue = snap.gardiennagePot;

      const getPlayerWorldPos = (pid: string): THREE.Vector3 => {
        const r = tokenRigs.get(pid);
        if (r) return r.root.position.clone().add(new THREE.Vector3(0, 0.8, 0));
        const pObj = snap.players[pid];
        const tf = getTileWorldTransform(pObj?.position ?? 0);
        return new THREE.Vector3(tf.x, 1.1, tf.z);
      };

      if (gainers.length > 0 && losers.length > 0) {
        // Direct Player-to-Player Transfer (Rent Paid or Bank Heist!)
        const srcPos = getPlayerWorldPos(losers[0].id);
        for (const g of gainers) {
          const dstPos = getPlayerWorldPos(g.id);
          spawnCoinTransferStream(
            srcPos,
            g.id,
            dstPos,
            Math.min(26, Math.max(12, Math.floor(g.delta / 14)))
          );
          spawnWorldPopup(dstPos.x, dstPos.y + 1.8, dstPos.z, `+${g.delta} DH`, "#059669", "#fef08a");
        }
        const lPos = getPlayerWorldPos(losers[0].id);
        spawnWorldPopup(lPos.x, lPos.y + 1.8, lPos.z, `-${losers[0].delta} DH`, "#be123c", "#ffffff");
        triggerShowmanCelebration("ThumbsUp");
      } else if (gainers.length > 0) {
        // Bank / Salary / Gardiennage Jackpot / Mini-Game Reward -> Player!
        const fromJackpot = potDelta < -40;
        const startTf = getTileWorldTransform(0);
        const bankPos = fromJackpot
          ? jackpotOrigin.clone().add(new THREE.Vector3(0, 1.0, 0))
          : new THREE.Vector3(startTf.x, 1.3, startTf.z);

        for (const g of gainers) {
          const dstPos = getPlayerWorldPos(g.id);
          spawnCoinTransferStream(
            bankPos,
            g.id,
            dstPos,
            Math.min(24, Math.max(10, Math.floor(g.delta / 18)))
          );
          spawnWorldPopup(dstPos.x, dstPos.y + 1.8, dstPos.z, `+${g.delta} DH`, "#059669", "#fef08a");
        }
        if (fromJackpot) triggerShowmanCelebration("Dance");
      } else if (losers.length > 0 && potDelta > 0) {
        // Tax / Radar Fine / Bail -> Flying Coins into the Center Treasure Chest!
        const srcPos = getPlayerWorldPos(losers[0].id);
        spawnCoinTransferStream(
          srcPos,
          null,
          jackpotOrigin.clone().add(new THREE.Vector3(0, 0.9, 0)),
          14
        );
        spawnWorldPopup(srcPos.x, srcPos.y + 1.8, srcPos.z, `-${losers[0].delta} DH`, "#be123c", "#ffffff");
      }

      // F. Sync & Animate Pixar-Style Hopping 3D Player Vehicles!
      const seenIds = new Set<string>();
      const tileOccupants = new Map<number, string[]>();
      for (const p of alivePlayers) {
        const rig = tokenRigs.get(p.id);
        const tIdx = rig ? rig.renderedTile : p.position;
        const arr = tileOccupants.get(tIdx) || [];
        arr.push(p.id);
        tileOccupants.set(tIdx, arr);
      }

      let activeFocusPos: THREE.Vector3 | null = null;
      const nowWall = Date.now();

      for (const p of alivePlayers) {
        seenIds.add(p.id);
        let rig = tokenRigs.get(p.id);

        if (!rig) {
          const root = new THREE.Group();
          const bodyHolder = new THREE.Group();
          root.add(bodyHolder);

          const leaderCrown = build3DCrownGroup(0.62);
          leaderCrown.position.set(0, 1.72, 0);
          leaderCrown.visible = false;
          root.add(leaderCrown);

          const shieldDome = new THREE.Mesh(
            new THREE.SphereGeometry(1.38, 18, 14),
            new THREE.MeshBasicMaterial({
              color: 0x38bdf8,
              transparent: true,
              opacity: 0.22,
              wireframe: true,
            })
          );
          shieldDome.position.y = 0.65;
          shieldDome.visible = false;
          root.add(shieldDome);

          // 3D Iron Jail Cage when locked in الفوريان!
          const jailCage = new THREE.Group();
          const barMat = new THREE.MeshStandardMaterial({
            color: 0x475569,
            roughness: 0.35,
            metalness: 0.85,
          });
          const barGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.55, 8);
          for (let bx = -0.85; bx <= 0.85; bx += 0.425) {
            for (const bz of [-0.95, 0.95]) {
              const bar = new THREE.Mesh(barGeo, barMat);
              bar.position.set(bx, 0.78, bz);
              jailCage.add(bar);
            }
          }
          const roofFrame = new THREE.Mesh(
            new THREE.BoxGeometry(1.85, 0.08, 2.05),
            barMat
          );
          roofFrame.position.y = 1.56;
          jailCage.add(roofFrame);
          jailCage.visible = false;
          root.add(jailCage);

          const badge = createFloatingBadgeSprite(p.nickname, p.accentHex);
          badge.sprite.position.set(0, 2.38, 0);
          root.add(badge.sprite);
          scene.add(root);

          const initTf = getTileWorldTransform(p.position);
          root.position.set(initTf.x, 0.5, initTf.z);
          root.rotation.y = initTf.forwardYaw;

          rig = {
            id: p.id,
            tokenType: p.token,
            root,
            bodyHolder,
            wheelNodes: [],
            sirenRed: null,
            sirenBlue: null,
            leaderCrown,
            shieldDome,
            jailCage,
            badge,
            renderedTile: p.position,
            targetTile: p.position,
            lastMoveSeq: p.moveSeq,
            hopProgress: 1,
            hopFromTile: p.position,
            hopToTile: p.position,
            isFinalStep: false,
            stepCounter: 0,
            joyBounce: 0,
            smoothYaw: initTf.forwardYaw,
            lastLabelKey: "",
          };
          populateTokenModel(rig, p.token);
          tokenRigs.set(p.id, rig);
        }

        if (rig.tokenType !== p.token) {
          rig.tokenType = p.token;
          populateTokenModel(rig, p.token);
        }

        rig.leaderCrown.visible = p.id === topWealthId;
        if (rig.leaderCrown.visible) {
          rig.leaderCrown.rotation.y = elapsed * 2.5;
        }
        rig.shieldDome.visible = p.shields > 0;
        if (rig.shieldDome.visible) {
          rig.shieldDome.rotation.y = -elapsed * 1.4;
        }
        rig.jailCage.visible = p.inJailTurns > 0 && rig.hopProgress >= 1;

        if (rig.sirenRed && rig.sirenBlue) {
          const flash = Math.sin(elapsed * 18) > 0;
          rig.sirenRed.scale.setScalar(flash ? 1.35 : 0.85);
          rig.sirenBlue.scale.setScalar(flash ? 0.85 : 1.35);
        }

        const activeReaction =
          p.lastReactionId && nowWall - p.lastReactionAt < 3800
            ? SIMSAR_REACTIONS[p.lastReactionId]
            : null;
        const badgeText = activeReaction
          ? `${activeReaction.emoji} ${activeReaction.textAr}`
          : p.inJailTurns > 0
          ? `🔒 ${p.nickname}`
          : p.nickname;
        const labelKey = `${badgeText}|${p.accentHex}`;
        if (rig.lastLabelKey !== labelKey) {
          rig.lastLabelKey = labelKey;
          rig.badge.updateText(badgeText, p.accentHex);
        }

        if (p.moveSeq !== rig.lastMoveSeq) {
          rig.lastMoveSeq = p.moveSeq;
          rig.targetTile = p.position;
        }

        // Wait ~0.62s for the rigid-body 3D dice bounce before starting car hops!
        const waitingOnDice =
          diceRollElapsed < 0.62 && snap.lastDice?.rollerId === p.id;

        if (!waitingOnDice) {
          if (rig.hopProgress >= 1 && rig.renderedTile !== rig.targetTile) {
            rig.hopFromTile = rig.renderedTile;
            const distance = (rig.targetTile-rig.renderedTile+tiles.length)%tiles.length;
            const dir = district && distance>tiles.length/2 ? -1 : 1;
            rig.hopToTile = (rig.renderedTile + dir + tiles.length) % tiles.length;
            rig.isFinalStep = rig.hopToTile === rig.targetTile;
            // Pre-jump crouch anticipation on first step!
            rig.hopProgress = rig.stepCounter === 0 ? -0.14 : 0;
            rig.stepCounter += 1;
            simsarSfx.playTileHop(rig.stepCounter);
            spawnDustPuffs(rig.root.position.x, 0.5, rig.root.position.z, 4);
          }

          if (rig.hopProgress < 0) {
            // Pixar Crouch Anticipation!
            rig.hopProgress = Math.min(0, rig.hopProgress + dt * 2.2);
            const crouchT = 1 + rig.hopProgress / 0.14; // 0 -> 1
            rig.bodyHolder.scale.set(
              1 + Math.sin(crouchT * Math.PI) * 0.18,
              1 - Math.sin(crouchT * Math.PI) * 0.24,
              1 + Math.sin(crouchT * Math.PI) * 0.14
            );
            rig.bodyHolder.rotation.x = -0.18 * Math.sin(crouchT * Math.PI);
          } else if (rig.hopProgress < 1) {
            const hopSpd = rig.isFinalStep ? 3.8 : 5.2;
            rig.hopProgress = Math.min(1, rig.hopProgress + dt * hopSpd);
            const fromTf = getTileWorldTransform(rig.hopFromTile);
            const toTf = getTileWorldTransform(rig.hopToTile);
            const t = rig.hopProgress;

            const curX = fromTf.x + (toTf.x - fromTf.x) * t;
            const curZ = fromTf.z + (toTf.z - fromTf.z) * t;
            const peak = rig.isFinalStep ? 2.55 : 1.72;
            const arcY = 0.52 + Math.sin(t * Math.PI) * peak;

            rig.root.position.set(curX, arcY, curZ);

            // Smooth shortest-angle yaw interpolation + corner banking!
            const yawDelta = shortestAngleDiff(rig.smoothYaw, district ? Math.atan2(toTf.x-fromTf.x,toTf.z-fromTf.z) : toTf.forwardYaw);
            rig.smoothYaw += yawDelta * Math.min(1, dt * 14);
            rig.root.rotation.y = rig.smoothYaw;

            // Pitch nose up going up, nose down descending!
            const pitchAngle = -Math.cos(t * Math.PI) * (rig.isFinalStep ? 0.34 : 0.24);
            rig.bodyHolder.rotation.x = pitchAngle;
            rig.bodyHolder.rotation.z = Math.max(-0.25, Math.min(0.25, -yawDelta * 0.45));

            // Airborne stretch!
            const stretch = 1 + Math.sin(t * Math.PI) * 0.18;
            const squash = 1 / Math.sqrt(stretch);
            rig.bodyHolder.scale.set(squash, stretch, squash);

            // Spin 3D wheels rapidly!
            for (const w of rig.wheelNodes) {
              w.rotation.x += dt * 24;
            }

            // Touchdown on Tile!
            if (rig.hopProgress >= 1) {
              rig.renderedTile = rig.hopToTile;
              rig.bodyHolder.rotation.set(0, 0, 0);
              rig.bodyHolder.scale.set(1.18, 0.78, 1.18); // landing squash!

              // Depress the landed 3D marble tile like a piano key!
              const landedTileRig = tileRigs.get(rig.renderedTile);
              if (landedTileRig) {
                landedTileRig.pressVel = rig.isFinalStep ? -5.6 : -3.4;
              }
              spawnShockwave(
                toTf.x,
                0.52,
                toTf.z,
                rig.isFinalStep ? 0xfef08a : 0x38bdf8,
                rig.isFinalStep ? 4.4 : 2.6
              );
              if (rig.isFinalStep) {
                rig.stepCounter = 0;
                snap.onLand?.(p.id, rig.lastMoveSeq, rig.renderedTile);
                camShake = Math.max(camShake, 0.24);
                spawnDustPuffs(toTf.x, 0.55, toTf.z, 8);
              }
            }
          } else {
            // Parked Idle + Co-located Offset + Joy Bounce when receiving coins!
            const baseTf = getTileWorldTransform(rig.renderedTile);
            const occ = tileOccupants.get(rig.renderedTile) || [p.id];
            const slotIdx = Math.max(0, occ.indexOf(p.id));
            const spread = occ.length > 1 ? 0.68 : 0;
            const ang = (slotIdx / Math.max(1, occ.length)) * Math.PI * 2;
            const targetX = baseTf.x + Math.cos(ang) * spread;
            const targetZ = baseTf.z + Math.sin(ang) * spread;

            // Follow depressed tile height!
            const tileOffsetY = tileRigs.get(rig.renderedTile)?.pressY ?? 0;

            let joyY = 0;
            if (rig.joyBounce > 0) {
              rig.joyBounce = Math.max(0, rig.joyBounce - dt * 2.8);
              joyY = Math.abs(Math.sin(rig.joyBounce * Math.PI * 2)) * 0.75;
            }

            const isTurnIdle =
              p.id === snap.currentPlayerId
                ? Math.abs(Math.sin(elapsed * 4.2)) * 0.14
                : Math.sin(elapsed * 2.2 + slotIdx) * 0.03;

            rig.root.position.x += (targetX - rig.root.position.x) * Math.min(1, dt * 10);
            rig.root.position.z += (targetZ - rig.root.position.z) * Math.min(1, dt * 10);
            rig.root.position.y = Math.max(0.28, 0.52 + tileOffsetY + isTurnIdle + joyY);

            const yawDelta = shortestAngleDiff(rig.smoothYaw, baseTf.forwardYaw);
            rig.smoothYaw += yawDelta * Math.min(1, dt * 10);
            rig.root.rotation.y = rig.smoothYaw;

            // Recover landing squash back to (1,1,1) smoothly
            rig.bodyHolder.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 12));
            rig.bodyHolder.rotation.x *= 0.85;
            rig.bodyHolder.rotation.z *= 0.85;
          }
        }

        if (p.id === snap.currentPlayerId) {
          activeFocusPos = rig.root.position.clone();
        }
      }

      for (const [rid, rig] of tokenRigs.entries()) {
        if (!seenIds.has(rid)) {
          scene.remove(rig.root);
          tokenRigs.delete(rid);
        }
      }

      // G. Step Flying 3D Gold Coin Transfers (`coin.glb`)!
      for (let i = flyingCoins.length - 1; i >= 0; i--) {
        const fc = flyingCoins[i];
        if (fc.delay > 0) {
          fc.delay -= dt;
          continue;
        }
        fc.mesh.visible = true;
        fc.t += dt * fc.speed;

        const targetRig = fc.targetPlayerId ? tokenRigs.get(fc.targetPlayerId) : undefined;
        const endPos = targetRig
          ? targetRig.root.position.clone().add(new THREE.Vector3(0, 0.85, 0))
          : fc.fallbackTargetPos;

        if (fc.t >= 1) {
          scene.remove(fc.mesh);
          flyingCoins.splice(i, 1);
          if (targetRig) targetRig.joyBounce = Math.max(targetRig.joyBounce, 0.55);
          continue;
        }

        const u = fc.t;
        const lateralSwirl = Math.sin(u * Math.PI) * 0.85 * fc.swirlSign;
        fc.mesh.position.x =
          fc.startPos.x + (endPos.x - fc.startPos.x) * u + lateralSwirl * 0.4;
        fc.mesh.position.z =
          fc.startPos.z + (endPos.z - fc.startPos.z) * u - lateralSwirl * 0.4;
        fc.mesh.position.y =
          fc.startPos.y +
          (endPos.y - fc.startPos.y) * u +
          Math.sin(u * Math.PI) * fc.peakHeight;

        fc.mesh.rotation.y += dt * 16;
        fc.mesh.rotation.x += dt * 8;
      }

      // H. Step Shockwave Rings, Burst Particles & World Popups
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.life -= dt;
        if (sw.life <= 0) {
          scene.remove(sw.mesh);
          sw.mat.dispose();
          shockwaves.splice(i, 1);
          continue;
        }
        const prog = 1 - sw.life / 0.52;
        sw.mesh.scale.setScalar(0.5 + prog * sw.maxScale);
        sw.mat.opacity = (1 - prog) * 0.88;
      }

      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.life -= dt;
        if (b.life <= 0) {
          scene.remove(b.mesh);
          bursts.splice(i, 1);
          continue;
        }
        b.vy += b.gravity * dt;
        b.mesh.position.x += b.vx * dt;
        b.mesh.position.y += b.vy * dt;
        b.mesh.position.z += b.vz * dt;
        b.mesh.rotation.x += b.rotSpd * dt;
        b.mesh.rotation.y += b.rotSpd * dt;
        b.mesh.scale.setScalar(Math.max(0.08, b.life / b.maxLife));
      }

      for (let i = worldPopups.length - 1; i >= 0; i--) {
        const wp = worldPopups[i];
        wp.life -= dt;
        if (wp.life <= 0) {
          scene.remove(wp.sprite);
          (wp.sprite.material as THREE.SpriteMaterial).map?.dispose();
          (wp.sprite.material as THREE.SpriteMaterial).dispose();
          worldPopups.splice(i, 1);
          continue;
        }
        wp.sprite.position.y += dt * 1.65;
        const alpha = Math.min(1, (wp.life / wp.maxLife) * 2.2);
        (wp.sprite.material as THREE.SpriteMaterial).opacity = alpha;
      }

      // I. Monopoly-GO Portrait Action Director Camera + Micro Camera Shake!
      const aspect = camera.aspect;
      const overviewPortraitMult =
        aspect < 1.05 ? Math.min(1.52, 1.05 / Math.max(0.54, aspect)) : 1.0;
      const closePortraitMult = aspect < 0.78 ? 1.22 : 1.0;

      let desiredLookX = 0;
      let desiredLookZ = 0.8;
      let finalDist = 24.8 * overviewPortraitMult * userZoomMult;
      let finalElev = 23.2 * Math.pow(overviewPortraitMult, 0.72) * userZoomMult;

      if (snap.cameraMode === "AUTO") {
        if (diceRollElapsed < 0.92) {
          // Hero close-up onto tumbling rigid-body 3D dice on the front Oasis Plaza!
          desiredLookX = 0;
          desiredLookZ = 2.6;
          finalDist = 17.2 * closePortraitMult * userZoomMult;
          finalElev = 15.6 * closePortraitMult * userZoomMult;
        } else if (snap.selectedTileIndex !== null) {
          const stf = getTileWorldTransform(snap.selectedTileIndex);
          desiredLookX = stf.x * 0.68;
          desiredLookZ = stf.z * 0.68;
          finalDist = 17.8 * closePortraitMult * userZoomMult;
          finalElev = 15.6 * closePortraitMult * userZoomMult;
        } else if (activeFocusPos) {
          desiredLookX = activeFocusPos.x * 0.64;
          desiredLookZ = activeFocusPos.z * 0.64 + 0.4;
          finalDist = 18.8 * closePortraitMult * userZoomMult;
          finalElev = 16.2 * closePortraitMult * userZoomMult;
        }
      }

      let orbitYaw = userOrbitOffset;
      let neighborhoodOverview = false;
      if (district && snap.neighborhood) {
        const n=snap.neighborhood;
        routeRings.forEach((ring,i)=>{
          const tile=n.routes[i];ring.visible=tile!==undefined;
          if(tile!==undefined){const t=getTileWorldTransform(tile);ring.position.set(t.x,.58,t.z);}
        });
        dieMesh2.visible=false;
        dieMesh1.visible=!!snap.lastDice;
        const spot=n.shot ? getTileWorldTransform(n.shot.tile) : null;
        const playing=tableau?.update(n.shot,n.cast,spot);
        if(spot && playing && snap.cameraMode==="AUTO" && !reducedMotion.matches) {
          desiredLookX=spot.x;desiredLookZ=spot.z;
          finalDist=8.7*closePortraitMult;finalElev=6.2;
          orbitYaw=Math.atan2(-spot.outwardNx,-spot.outwardNz)+.22;
        } else if (snap.cameraMode==="OVERVIEW" || n.routes.length || reducedMotion.matches) {
          neighborhoodOverview = true;
          desiredLookX = 0;
          desiredLookZ = 0;
          // Fit the estate signs and outer buildings at all four corners, even after orbiting.
          const pitch = .76;
          const sinPitch = Math.sin(pitch), cosPitch = Math.cos(pitch);
          const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
          const side = 16.5 * (Math.abs(Math.cos(orbitYaw)) + Math.abs(Math.sin(orbitYaw)));
          const nearEdge = side * cosPitch + 5.7 * sinPitch;
          const distance = nearEdge + Math.max(side / (tanV * aspect), (side * sinPitch + 5.7 * cosPitch) / tanV);
          finalDist = distance * cosPitch * userZoomMult;
          finalElev = distance * sinPitch * userZoomMult;
        }
      }

      const targetCamX = desiredLookX + Math.sin(orbitYaw) * finalDist;
      const targetCamZ = desiredLookZ + Math.cos(orbitYaw) * finalDist;
      const targetCamY = finalElev;

      camPos.x += (targetCamX - camPos.x) * Math.min(1, dt * 5.2);
      camPos.y += (targetCamY - camPos.y) * Math.min(1, dt * 5.2);
      camPos.z += (targetCamZ - camPos.z) * Math.min(1, dt * 5.2);

      camLook.x += (desiredLookX - camLook.x) * Math.min(1, dt * 6.5);
      camLook.z += (desiredLookZ - camLook.z) * Math.min(1, dt * 6.5);

      let shakeX = 0;
      let shakeY = 0;
      if (camShake > 0.005) {
        shakeX = (Math.random() - 0.5) * camShake * 1.1;
        shakeY = (Math.random() - 0.5) * camShake * 0.9;
        camShake = Math.max(0, camShake - dt * 1.85);
      }

      if (district && (neighborhoodOverview || reducedMotion.matches)) {
        const blend = reducedMotion.matches ? 1 : cameraBlend;
        camPos.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), blend);
        camLook.x += (desiredLookX-camLook.x)*blend;
        camLook.z += (desiredLookZ-camLook.z)*blend;
      }
      camera.position.set(camPos.x + shakeX, camPos.y + shakeY, camPos.z);
      camera.lookAt(camLook);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      domEl.removeEventListener("pointerdown", onPointerDown);
      domEl.removeEventListener("pointermove", onPointerMove);
      domEl.removeEventListener("pointerup", onPointerUp);
      domEl.removeEventListener("pointercancel", onPointerUp);
      domEl.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("webglcontextlost",graphicsLost);
      tableau?.dispose();
      for (const sign of ownerSigns.values()) { sign.sprite.material.map?.dispose(); sign.sprite.material.dispose(); }
      for (const ring of routeRings) { ring.geometry.dispose(); ring.material.dispose(); }
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden touch-none select-none"
      aria-label="رقعة سمسار رويال الثلاثية الأبعاد"
    />
  );
}
