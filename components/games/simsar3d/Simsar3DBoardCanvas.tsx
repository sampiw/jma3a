"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  BOARD_TILE_COUNT,
  getTileWorldTransform,
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

export interface Simsar3DBoardCanvasProps {
  players: Record<string, SimsarPlayer>;
  properties: Record<number, SimsarPropertyState>;
  currentPlayerId: string;
  gardiennagePot: number;
  lastDice: SimsarDiceRoll | null;
  cameraMode: "AUTO" | "OVERVIEW";
  selectedTileIndex: number | null;
  onSelectTile?: (tileIndex: number) => void;
}

const gltfLoader = new GLTFLoader();
const glbCache = new Map<string, Promise<THREE.Group>>();

function loadCachedGlb(url: string): Promise<THREE.Group> {
  let existing = glbCache.get(url);
  if (!existing) {
    existing = new Promise((resolve, reject) => {
      gltfLoader.load(
        url,
        (gltf) => resolve(gltf.scene),
        undefined,
        (err) => reject(err)
      );
    });
    glbCache.set(url, existing);
  }
  return existing.then((scene) => scene.clone(true));
}

function fitModelToFootprint(model: THREE.Group, targetSpan: number): THREE.Group {
  const wrapper = new THREE.Group();
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxHoriz = Math.max(0.01, size.x, size.z);
  const scale = targetSpan / maxHoriz;
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

/** High-DPI 512x512 crisp Arabic & Emoji 3D Tile Top Texture */
function createTileTopTexture(tile: SimsarTileSpec, isCorner: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;

  // Warm cream marble card background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, 512);
  bgGrad.addColorStop(0, isCorner ? "#fefce8" : "#f8fafc");
  bgGrad.addColorStop(1, isCorner ? "#fde68a" : "#e2e8f0");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Outer gold/slate frame
  ctx.strokeStyle = isCorner ? "#d97706" : "#334155";
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, 494, 494);

  // Top Color Monopoly Header Band
  const bandH = isCorner ? 118 : 132;
  ctx.fillStyle = tile.colorHex;
  ctx.fillRect(18, 18, 476, bandH);

  // Subtle Moroccan Zellige geometric diamond stripe inside color band
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let x = 36; x < 480; x += 56) {
    ctx.beginPath();
    ctx.moveTo(x, 34);
    ctx.lineTo(x + 18, 52);
    ctx.lineTo(x, 70);
    ctx.lineTo(x - 18, 52);
    ctx.closePath();
    ctx.fill();
  }

  // Tile Index Badge in header corner
  ctx.fillStyle = "rgba(15,23,42,0.72)";
  ctx.beginPath();
  ctx.roundRect(30, 30, 82, 52, 16);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 32px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`#${tile.index}`, 71, 57);

  // Giant Crisp Emoji Centerpiece
  ctx.font = isCorner ? "148px system-ui, sans-serif" : "132px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(tile.emoji, 256, isCorner ? 248 : 238);

  // Bold Arabic Short Name (Huge & Readable on Portrait Phone!)
  ctx.fillStyle = "#0f172a";
  ctx.font = "900 58px system-ui, sans-serif";
  ctx.fillText(tile.shortAr, 256, 368);

  // Bottom Price or Action Pill
  const footerText = tile.price
    ? `${tile.price} DH`
    : tile.kind === "START"
    ? "+250 DH"
    : tile.kind === "JACKPOT"
    ? "الحصالة 💰"
    : tile.kind === "HEIST"
    ? "سرقة 🥷"
    : tile.kind === "TAX"
    ? "-120 DH"
    : tile.kind === "RADAR_TO_JAIL"
    ? "للفوريان!"
    : tile.shortAr;

  ctx.fillStyle = tile.price ? "#0f172a" : tile.colorHex;
  ctx.beginPath();
  ctx.roundRect(66, 412, 380, 72, 24);
  ctx.fill();

  ctx.fillStyle = tile.price ? "#fbbf24" : "#ffffff";
  ctx.font = "900 44px system-ui, sans-serif";
  ctx.fillText(footerText, 256, 450);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Creates 6 ivory & gold die face materials in Three.js BoxGeometry order: [+X:3, -X:4, +Y:1, -Y:6, +Z:2, -Z:5] */
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

    const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 175);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#fef3c7");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 242, 242);

    const isRed = val === 1 || val === 4;
    ctx.fillStyle = isRed ? "#dc2626" : "#0f172a";
    const radius = val === 1 ? 34 : 22;

    for (const [nx, ny] of pipCoords[val]) {
      ctx.beginPath();
      ctx.arc(nx * 256, ny * 256, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.22,
      metalness: 0.08,
    });
  });
}

/** Exact Euler target so `val` (1..6) lands face-up (+Y) */
function getDieTopEuler(val: number): { rx: number; rz: number } {
  switch (val) {
    case 1:
      return { rx: 0, rz: 0 };
    case 6:
      return { rx: Math.PI, rz: 0 };
    case 2:
      return { rx: -Math.PI / 2, rz: 0 };
    case 5:
      return { rx: Math.PI / 2, rz: 0 };
    case 3:
      return { rx: 0, rz: Math.PI / 2 };
    case 4:
      return { rx: 0, rz: -Math.PI / 2 };
    default:
      return { rx: 0, rz: 0 };
  }
}

function createFloatingBadgeSprite(
  label: string,
  accentColor: string
): { sprite: THREE.Sprite; updateText: (txt: string, bg: string) => void } {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 96;
  const ctx = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const draw = (txt: string, borderHex: string) => {
    ctx.clearRect(0, 0, 320, 96);
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.strokeStyle = borderHex;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(10, 14, 300, 68, 34);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 30px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(txt.slice(0, 16), 160, 49);
    tex.needsUpdate = true;
  };

  draw(label, accentColor);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  );
  sprite.scale.set(3.2, 0.96, 1);
  sprite.renderOrder = 25;
  return { sprite, updateText: draw };
}

interface TokenVisualRig {
  id: string;
  tokenType: SimsarTokenId;
  root: THREE.Group;
  bodyHolder: THREE.Group;
  badge: { sprite: THREE.Sprite; updateText: (txt: string, bg: string) => void };
  renderedTile: number;
  targetTile: number;
  lastMoveSeq: number;
  hopProgress: number; // 0..1 when hopping to next tile
  hopFromTile: number;
  hopToTile: number;
  stepCounter: number;
  lastLabelKey: string;
}

interface BuildingSlotRig {
  holder: THREE.Group;
  ownerRing: THREE.Mesh;
  mortgageBadge: THREE.Mesh;
  crownMesh: THREE.Mesh;
  currentLevel: number;
  currentOwnerId: string | null;
  popAnim: number; // 0..1 spring scale animation
}

interface BurstParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

export function Simsar3DBoardCanvas({
  players,
  properties,
  currentPlayerId,
  gardiennagePot,
  lastDice,
  cameraMode,
  selectedTileIndex,
  onSelectTile,
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
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c4a6e);
    scene.fog = new THREE.FogExp2(0x0ea5e9, 0.0068);

    const initW = Math.max(300, container.clientWidth);
    const initH = Math.max(300, container.clientHeight);

    const camera = new THREE.PerspectiveCamera(44, initW / initH, 0.5, 260);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(initW, initH);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    // Warm Moroccan Golden-Hour Lighting
    const hemi = new THREE.HemisphereLight(0xfff7ed, 0x0369a1, 0.95);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfffbeb, 2.05);
    sun.position.set(22, 38, 26);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 110;
    const shBounds = 22;
    sun.shadow.camera.left = -shBounds;
    sun.shadow.camera.right = shBounds;
    sun.shadow.camera.top = shBounds;
    sun.shadow.camera.bottom = -shBounds;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    const texLoader = new THREE.TextureLoader();

    // 1. Animated Normal-Mapped Atlantic Ocean Surrounding the Island
    const waterNormalTex = texLoader.load("/textures/shooter/waternormals.jpg");
    waterNormalTex.wrapS = THREE.RepeatWrapping;
    waterNormalTex.wrapT = THREE.RepeatWrapping;
    waterNormalTex.repeat.set(14, 14);

    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.16,
      metalness: 0.32,
      normalMap: waterNormalTex,
      normalScale: new THREE.Vector2(0.55, 0.55),
    });
    const oceanMesh = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), oceanMat);
    oceanMesh.rotation.x = -Math.PI / 2;
    oceanMesh.position.y = -0.85;
    scene.add(oceanMesh);

    // Warm Sunset Sky Dome
    const skyGeo = new THREE.SphereGeometry(125, 24, 16);
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 64;
    skyCanvas.height = 256;
    const sCtx = skyCanvas.getContext("2d")!;
    const sGrad = sCtx.createLinearGradient(0, 0, 0, 256);
    sGrad.addColorStop(0, "#0f172a");
    sGrad.addColorStop(0.42, "#0284c7");
    sGrad.addColorStop(0.74, "#f59e0b");
    sGrad.addColorStop(1, "#fde68a");
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 64, 256);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const skyDome = new THREE.Mesh(
      skyGeo,
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
    );
    scene.add(skyDome);

    // 2. Sculpted Moroccan Sandstone & Terracotta Island Pedestal
    const brickDiff = texLoader.load("/textures/shooter/brick_diffuse.jpg");
    const brickBump = texLoader.load("/textures/shooter/brick_bump.jpg");
    [brickDiff, brickBump].forEach((t) => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(6, 6);
    });
    brickDiff.colorSpace = THREE.SRGBColorSpace;

    // Sandy beach ring
    const sandBase = new THREE.Mesh(
      new THREE.CylinderGeometry(20.5, 22.8, 0.9, 48),
      new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.85 })
    );
    sandBase.position.y = -0.55;
    sandBase.receiveShadow = true;
    scene.add(sandBase);

    // Main squareKasbah stone deck
    const islandDeck = new THREE.Mesh(
      new THREE.BoxGeometry(29.8, 0.9, 29.8),
      new THREE.MeshStandardMaterial({
        map: brickDiff,
        bumpMap: brickBump,
        bumpScale: 0.08,
        color: 0xfed7aa,
        roughness: 0.72,
      })
    );
    islandDeck.position.y = -0.38;
    islandDeck.receiveShadow = true;
    islandDeck.castShadow = true;
    scene.add(islandDeck);

    // Inner Zellige Courtyard Floor
    const zelligeCanvas = document.createElement("canvas");
    zelligeCanvas.width = 512;
    zelligeCanvas.height = 512;
    const zCtx = zelligeCanvas.getContext("2d")!;
    zCtx.fillStyle = "#064e3b";
    zCtx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 64) {
      for (let x = 0; x < 512; x += 64) {
        zCtx.fillStyle = (x / 64 + y / 64) % 2 === 0 ? "#0f766e" : "#047857";
        zCtx.fillRect(x + 3, y + 3, 58, 58);
        zCtx.fillStyle = "#fbbf24";
        zCtx.beginPath();
        zCtx.moveTo(x + 32, y + 14);
        zCtx.lineTo(x + 48, y + 32);
        zCtx.lineTo(x + 32, y + 50);
        zCtx.lineTo(x + 16, y + 32);
        zCtx.closePath();
        zCtx.fill();
      }
    }
    const zelligeTex = new THREE.CanvasTexture(zelligeCanvas);
    zelligeTex.colorSpace = THREE.SRGBColorSpace;
    zelligeTex.wrapS = THREE.RepeatWrapping;
    zelligeTex.wrapT = THREE.RepeatWrapping;
    zelligeTex.repeat.set(4, 4);

    const courtyardMesh = new THREE.Mesh(
      new THREE.BoxGeometry(17.6, 0.16, 17.6),
      new THREE.MeshStandardMaterial({
        map: zelligeTex,
        roughness: 0.35,
        metalness: 0.12,
      })
    );
    courtyardMesh.position.y = 0.05;
    courtyardMesh.receiveShadow = true;
    scene.add(courtyardMesh);

    // Golden Center Branding Frame around Fountain
    const centerRing = new THREE.Mesh(
      new THREE.RingGeometry(2.7, 3.25, 36),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        roughness: 0.28,
        metalness: 0.65,
        side: THREE.DoubleSide,
      })
    );
    centerRing.rotation.x = -Math.PI / 2;
    centerRing.position.y = 0.15;
    scene.add(centerRing);

    // 3. Load Real .glb Moroccan Courtyard Landmarks!
    const swayPalms: THREE.Group[] = [];

    loadCachedGlb("/models/ksida/fantasy/fountain.glb")
      .then((raw) => {
        const ftn = fitModelToFootprint(raw, 4.4);
        ftn.position.set(0, 0.12, 0);
        scene.add(ftn);
      })
      .catch(() => {});

    const palmSpots: Array<[number, number, string, number]> = [
      [-6.5, -6.5, "/models/ksida/palm-bend.glb", 0.5],
      [6.5, -6.5, "/models/ksida/palm-straight.glb", 2.1],
      [-6.5, 6.5, "/models/ksida/palm-straight.glb", -1.2],
      [6.5, 6.5, "/models/ksida/palm-bend.glb", 3.0],
      [-14.2, 13.8, "/models/ksida/palm-bend.glb", 0.8],
      [14.2, -13.8, "/models/ksida/palm-straight.glb", -2.2],
    ];
    palmSpots.forEach(([px, pz, url, rot]) => {
      loadCachedGlb(url)
        .then((raw) => {
          const p = fitModelToFootprint(raw, 2.8);
          p.position.set(px, 0.08, pz);
          p.rotation.y = rot;
          scene.add(p);
          swayPalms.push(p);
        })
        .catch(() => {});
    });

    // Bab Mansour Arch at START (Tile 0: +10.8, +10.8)
    loadCachedGlb("/models/ksida/fantasy/arch-top.glb")
      .then((raw) => {
        const arch = fitModelToFootprint(raw, 3.8);
        arch.position.set(13.5, 0.06, 13.5);
        arch.rotation.y = Math.PI / 4;
        scene.add(arch);
      })
      .catch(() => {});

    // Watchtower at JAIL / الفوريان (Tile 6: -10.8, +10.8)
    loadCachedGlb("/models/ksida/watch-tower.glb")
      .then((raw) => {
        const twr = fitModelToFootprint(raw, 2.9);
        twr.position.set(-13.6, 0.06, 13.6);
        scene.add(twr);
      })
      .catch(() => {});

    // Giant Golden Tajine Monument near Heist Tile (Tile 14)
    loadCachedGlb("/models/food/tajine.glb")
      .then((raw) => {
        const tj = fitModelToFootprint(raw, 2.5);
        tj.position.set(-3.6, 0.1, -13.8);
        scene.add(tj);
      })
      .catch(() => {});

    // Atlas Rocks Accent near North-East Radar Corner (Tile 18)
    loadCachedGlb("/models/ksida/rocks-a.glb")
      .then((raw) => {
        const rk = fitModelToFootprint(raw, 3.4);
        rk.position.set(13.9, 0.02, -13.9);
        scene.add(rk);
      })
      .catch(() => {});

    // 4. Gardiennage 3D Golden Coin Pile (grows dynamically with `gardiennagePot`!)
    const jackpotGroup = new THREE.Group();
    jackpotGroup.position.set(-4.2, 0.14, -4.2);
    scene.add(jackpotGroup);

    const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.14, 18);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.22,
      metalness: 0.78,
    });
    const coinMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 24; i++) {
      const stackIdx = i % 4;
      const layer = Math.floor(i / 4);
      const offsets = [
        [-0.48, -0.45],
        [0.48, -0.45],
        [-0.45, 0.48],
        [0.45, 0.48],
      ];
      const cm = new THREE.Mesh(coinGeo, coinMat);
      cm.position.set(
        offsets[stackIdx][0],
        0.08 + layer * 0.15,
        offsets[stackIdx][1]
      );
      cm.castShadow = true;
      jackpotGroup.add(cm);
      coinMeshes.push(cm);
    }

    // 5. Build All 24 Interactive 3D Board Tiles + Outer Building Plots!
    const tilePickMeshes: THREE.Mesh[] = [];
    const buildingSlots = new Map<number, BuildingSlotRig>();
    const selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(1.85, 2.22, 32),
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      })
    );
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = 0.46;
    selectionRing.visible = false;
    scene.add(selectionRing);

    const sidePlinthMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.55,
      metalness: 0.2,
    });

    SIMSAR_BOARD_TILES.forEach((tile) => {
      const tf = getTileWorldTransform(tile.index);
      const span = tf.isCorner ? 3.52 : 3.32;
      const height = tf.isCorner ? 0.42 : 0.34;

      const topTex = createTileTopTexture(tile, tf.isCorner);
      const topMat = new THREE.MeshStandardMaterial({
        map: topTex,
        roughness: 0.34,
        metalness: 0.06,
      });

      const boxMats = [
        sidePlinthMat,
        sidePlinthMat,
        topMat,
        sidePlinthMat,
        sidePlinthMat,
        sidePlinthMat,
      ];

      const tileMesh = new THREE.Mesh(
        new THREE.BoxGeometry(span, height, span),
        boxMats
      );
      tileMesh.position.set(tf.x, height * 0.5 + 0.06, tf.z);
      tileMesh.receiveShadow = true;
      tileMesh.castShadow = true;
      tileMesh.userData = { tileIndex: tile.index };
      scene.add(tileMesh);
      tilePickMeshes.push(tileMesh);

      // Property Owner Ring + 3D Building Plot right outside the tile!
      if (tile.kind === "CITY" || tile.kind === "UTILITY") {
        const ownerRing = new THREE.Mesh(
          new THREE.RingGeometry(1.58, 1.82, 4),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
          })
        );
        ownerRing.rotation.x = -Math.PI / 2;
        ownerRing.rotation.z = Math.PI / 4;
        ownerRing.position.set(tf.x, height + 0.08, tf.z);
        ownerRing.visible = false;
        scene.add(ownerRing);

        const mortgageBadge = new THREE.Mesh(
          new THREE.CylinderGeometry(0.65, 0.65, 0.15, 16),
          new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 })
        );
        mortgageBadge.position.set(tf.x, height + 0.16, tf.z);
        mortgageBadge.visible = false;
        scene.add(mortgageBadge);

        const holder = new THREE.Group();
        holder.position.set(
          tf.x + tf.outwardNx * 2.75,
          0.08,
          tf.z + tf.outwardNz * 2.75
        );
        // Face inward toward the board road!
        holder.rotation.y = Math.atan2(-tf.outwardNx, -tf.outwardNz);
        scene.add(holder);

        const crownMesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.45, 0),
          new THREE.MeshStandardMaterial({
            color: 0xfacc15,
            emissive: 0xd97706,
            emissiveIntensity: 0.4,
            roughness: 0.18,
            metalness: 0.85,
          })
        );
        crownMesh.position.set(0, 3.8, 0);
        crownMesh.visible = false;
        holder.add(crownMesh);

        buildingSlots.set(tile.index, {
          holder,
          ownerRing,
          mortgageBadge,
          crownMesh,
          currentLevel: -1,
          currentOwnerId: null,
          popAnim: 1,
        });
      }
    });

    // 6. Real 3D Tumbling Dice Pair in Center Courtyard!
    const dieMats = createDieMaterials();
    const dieGeo = new THREE.BoxGeometry(1.48, 1.48, 1.48);
    const dieMesh1 = new THREE.Mesh(dieGeo, dieMats);
    const dieMesh2 = new THREE.Mesh(dieGeo, dieMats);
    dieMesh1.castShadow = true;
    dieMesh2.castShadow = true;
    dieMesh1.visible = false;
    dieMesh2.visible = false;
    scene.add(dieMesh1);
    scene.add(dieMesh2);

    let activeDiceSeq = liveRef.current.lastDice?.rollSeq ?? 0;
    let diceAnimTimer = 0; // counts 0 -> 1.05s during roll

    // 7. Particle Burst Pool (for Building Upgrades & Jackpots!)
    const bursts: BurstParticle[] = [];
    const sparkGeo = new THREE.OctahedronGeometry(0.22, 0);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });

    const spawnGoldenBurst = (bx: number, by: number, bz: number, count = 16) => {
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(sparkGeo, sparkMat);
        m.position.set(bx, by, bz);
        const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const spd = 2.5 + Math.random() * 4.5;
        scene.add(m);
        bursts.push({
          mesh: m,
          vx: Math.cos(ang) * spd,
          vy: 4.5 + Math.random() * 4.5,
          vz: Math.sin(ang) * spd,
          life: 0.85,
        });
      }
    };

    // 8. Player 3D Token Rigs Manager
    const tokenRigs = new Map<string, TokenVisualRig>();

    const populateTokenModel = (holder: THREE.Group, tokenType: SimsarTokenId) => {
      const spec = SIMSAR_TOKENS[tokenType] || SIMSAR_TOKENS.TAXI_HMER;
      while (holder.children.length > 0) holder.remove(holder.children[0]);

      loadCachedGlb(spec.glbPath)
        .then((raw) => {
          // Tint primary body mesh with signature Moroccan livery
          raw.traverse((node) => {
            if ((node as THREE.Mesh).isMesh && node.name.toLowerCase().includes("body")) {
              const mesh = node as THREE.Mesh;
              mesh.material = new THREE.MeshPhysicalMaterial({
                color: spec.bodyHex,
                roughness: 0.26,
                metalness: 0.18,
                clearcoat: 0.75,
              });
            }
          });
          const fitted = fitModelToFootprint(raw, 2.05);
          holder.add(fitted);

          if (tokenType === "WATERMELON_TRUCK") {
            loadCachedGlb("/models/food/watermelon.glb")
              .then((wm) => {
                const wFit = fitModelToFootprint(wm, 0.75);
                wFit.position.set(0, 0.65, -0.35);
                holder.add(wFit);
              })
              .catch(() => {});
          }
        })
        .catch(() => {
          const fallback = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.7, 1.6),
            new THREE.MeshStandardMaterial({ color: spec.bodyHex })
          );
          fallback.position.y = 0.35;
          holder.add(fallback);
        });
    };

    const populateBuildingLevel = (
      slot: BuildingSlotRig,
      level: number,
      tileIdx: number
    ) => {
      // Keep crownMesh, remove previous building meshes
      for (let i = slot.holder.children.length - 1; i >= 0; i--) {
        const ch = slot.holder.children[i];
        if (ch !== slot.crownMesh) slot.holder.remove(ch);
      }
      slot.crownMesh.visible = level === 3;
      if (level <= 0) return;

      let glbUrl = "/models/ksida/fantasy/stall-green.glb";
      let targetSpan = 1.95;
      if (level === 1) {
        glbUrl =
          tileIdx % 2 === 0
            ? "/models/ksida/fantasy/stall-green.glb"
            : "/models/ksida/fantasy/stall-red.glb";
        targetSpan = 1.95;
      } else if (level === 2) {
        glbUrl =
          tileIdx % 2 === 0
            ? "/models/ksida/city/building-a.glb"
            : "/models/ksida/city/building-c.glb";
        targetSpan = 2.25;
      } else {
        glbUrl =
          tileIdx % 2 === 0
            ? "/models/ksida/city/building-f.glb"
            : "/models/ksida/city/building-j.glb";
        targetSpan = 2.55;
      }

      loadCachedGlb(glbUrl)
        .then((raw) => {
          const fitted = fitModelToFootprint(raw, targetSpan);
          slot.holder.add(fitted);
          // Position crown right above building top!
          const bBox = new THREE.Box3().setFromObject(fitted);
          slot.crownMesh.position.y = bBox.max.y + 0.65;
        })
        .catch(() => {});
    };

    // 9. Portrait-Friendly Touch Orbit, Pinch-Zoom & Tile Tap Raycaster!
    let userOrbitOffset = 0; // radians dragged by finger
    let userZoomMult = 1.0; // 0.68 .. 1.35
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
        userZoomMult = Math.max(0.68, Math.min(1.35, userZoomMult + dy * 0.0018));
      } else if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (lastPinchDist > 10) {
          const ratio = lastPinchDist / Math.max(10, dist);
          userZoomMult = Math.max(0.65, Math.min(1.38, userZoomMult * ratio));
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
        const hits = raycaster.intersectObjects(tilePickMeshes, false);
        if (hits.length > 0) {
          const tIdx = hits[0].object.userData?.tileIndex;
          if (typeof tIdx === "number") {
            simsarSfx.playPopTap(1.1);
            liveRef.current.onSelectTile(tIdx);
          }
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userZoomMult = Math.max(0.65, Math.min(1.38, userZoomMult + e.deltaY * 0.0008));
    };

    domEl.addEventListener("pointerdown", onPointerDown);
    domEl.addEventListener("pointermove", onPointerMove);
    domEl.addEventListener("pointerup", onPointerUp);
    domEl.addEventListener("pointercancel", onPointerUp);
    domEl.addEventListener("wheel", onWheel, { passive: false });

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(280, container.clientWidth);
      const h = Math.max(240, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(container);

    // Smooth Camera Tracking State
    const camPos = new THREE.Vector3(0, 28, 28);
    const camLook = new THREE.Vector3(0, 0.5, 1.5);

    let rafId = 0;
    let lastPerf = performance.now();

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const nowPerf = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (nowPerf - lastPerf) * 0.001));
      lastPerf = nowPerf;
      const timeSec = nowPerf * 0.001;
      const nowWall = Date.now();

      const snap = liveRef.current;

      // Animate Ocean Waves & Swaying Palms
      waterNormalTex.offset.x = timeSec * 0.03;
      waterNormalTex.offset.y = timeSec * 0.022;
      swayPalms.forEach((p, idx) => {
        p.rotation.z = Math.sin(timeSec * 1.4 + idx) * 0.035;
      });

      // Sync Gardiennage Jackpot 3D Coin Pile height!
      const visibleCoins = Math.min(
        coinMeshes.length,
        Math.max(3, Math.floor(snap.gardiennagePot / 30))
      );
      coinMeshes.forEach((cm, idx) => {
        cm.visible = idx < visibleCoins;
      });

      // Highlight Selected Tile Ring
      if (snap.selectedTileIndex !== null) {
        const stf = getTileWorldTransform(snap.selectedTileIndex);
        selectionRing.visible = true;
        selectionRing.position.set(stf.x, 0.5, stf.z);
        const pulse = 1 + Math.sin(timeSec * 6) * 0.07;
        selectionRing.scale.set(pulse, pulse, 1);
      } else {
        selectionRing.visible = false;
      }

      // Sync Owned Property Borders & Popping 3D Buildings!
      for (const [tileIdx, slot] of buildingSlots.entries()) {
        const prop = snap.properties[tileIdx];
        const owner = prop?.ownerId ? snap.players[prop.ownerId] : null;

        if (prop && prop.ownerId && owner && !owner.isBankrupt) {
          slot.ownerRing.visible = true;
          (slot.ownerRing.material as THREE.MeshBasicMaterial).color.set(
            owner.accentHex
          );
          slot.mortgageBadge.visible = prop.isMortgaged;

          const effectiveLvl = prop.isMortgaged ? 0 : prop.level;
          if (slot.currentLevel !== effectiveLvl) {
            const grew = effectiveLvl > slot.currentLevel && slot.currentLevel >= 0;
            slot.currentLevel = effectiveLvl;
            populateBuildingLevel(slot, effectiveLvl, tileIdx);
            if (grew) {
              slot.popAnim = 0.01;
              simsarSfx.playBuildUpgrade(effectiveLvl);
              spawnGoldenBurst(
                slot.holder.position.x,
                1.4,
                slot.holder.position.z,
                18
              );
            }
          }
        } else {
          slot.ownerRing.visible = false;
          slot.mortgageBadge.visible = false;
          if (slot.currentLevel !== 0) {
            slot.currentLevel = 0;
            populateBuildingLevel(slot, 0, tileIdx);
          }
        }

        // Spring Pop Animation on Building Holder
        if (slot.popAnim < 1) {
          slot.popAnim = Math.min(1, slot.popAnim + dt * 2.8);
          const t = slot.popAnim;
          const elastic =
            t === 1
              ? 1
              : 1 - Math.pow(2, -9 * t) * Math.cos(t * Math.PI * 2.5);
          const s = Math.max(0.05, elastic);
          slot.holder.scale.set(s, s, s);
        } else {
          slot.holder.scale.set(1, 1, 1);
        }

        if (slot.crownMesh.visible) {
          slot.crownMesh.rotation.y = timeSec * 2.2;
        }
      }

      // Trigger 3D Tumbling Dice Roll when `lastDice.rollSeq` advances!
      if (snap.lastDice && snap.lastDice.rollSeq !== activeDiceSeq) {
        activeDiceSeq = snap.lastDice.rollSeq;
        diceAnimTimer = 0.001;
        dieMesh1.visible = true;
        dieMesh2.visible = true;
        simsarSfx.playDiceRoll();
      }

      if (diceAnimTimer > 0 && snap.lastDice) {
        diceAnimTimer += dt;
        const p = Math.min(1, diceAnimTimer / 0.92);
        const bounceY =
          0.9 +
          Math.max(0, (1 - p) * 6.5 * Math.abs(Math.cos(p * Math.PI * 2.5)));

        const e1 = getDieTopEuler(snap.lastDice.die1);
        const e2 = getDieTopEuler(snap.lastDice.die2);
        const spinFade = Math.pow(1 - p, 2);

        dieMesh1.position.set(-1.35, bounceY, 2.2 - (1 - p) * 2.5);
        dieMesh2.position.set(1.35, bounceY + (1 - p) * 0.4, 2.2 - (1 - p) * 2.0);

        dieMesh1.rotation.set(
          e1.rx + spinFade * 14,
          spinFade * 9,
          e1.rz + spinFade * 11
        );
        dieMesh2.rotation.set(
          e2.rx - spinFade * 13,
          -spinFade * 10,
          e2.rz + spinFade * 12
        );

        if (p >= 1 && diceAnimTimer > 3.8) {
          diceAnimTimer = 0;
        }
      }

      // Sync & Animate 3D Hopping Player Tokens!
      const alivePlayers = Object.values(snap.players).filter((p) => !p.isBankrupt);
      const seenIds = new Set<string>();

      // Group co-located tokens slightly so they never overlap on START!
      const tileOccupants = new Map<number, string[]>();
      alivePlayers.forEach((p) => {
        const rig = tokenRigs.get(p.id);
        const tIdx = rig ? rig.renderedTile : p.position;
        const arr = tileOccupants.get(tIdx) || [];
        arr.push(p.id);
        tileOccupants.set(tIdx, arr);
      });

      let activeFocusPos: THREE.Vector3 | null = null;

      for (const p of alivePlayers) {
        seenIds.add(p.id);
        let rig = tokenRigs.get(p.id);

        if (!rig) {
          const root = new THREE.Group();
          const bodyHolder = new THREE.Group();
          root.add(bodyHolder);
          populateTokenModel(bodyHolder, p.token);

          const badge = createFloatingBadgeSprite(p.nickname, p.accentHex);
          badge.sprite.position.set(0, 2.05, 0);
          root.add(badge.sprite);
          scene.add(root);

          const initTf = getTileWorldTransform(p.position);
          root.position.set(initTf.x, 0.48, initTf.z);
          root.rotation.y = initTf.forwardYaw;

          rig = {
            id: p.id,
            tokenType: p.token,
            root,
            bodyHolder,
            badge,
            renderedTile: p.position,
            targetTile: p.position,
            lastMoveSeq: p.moveSeq,
            hopProgress: 1,
            hopFromTile: p.position,
            hopToTile: p.position,
            stepCounter: 0,
            lastLabelKey: "",
          };
          tokenRigs.set(p.id, rig);
        }

        if (rig.tokenType !== p.token) {
          rig.tokenType = p.token;
          populateTokenModel(rig.bodyHolder, p.token);
        }

        // Update floating badge text (shows live Darija meme reaction when triggered!)
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

        // Wait 0.45s for dice tumble before hopping!
        const waitingOnDice =
          diceAnimTimer > 0 &&
          diceAnimTimer < 0.48 &&
          snap.lastDice?.rollerId === p.id;

        if (!waitingOnDice) {
          if (rig.hopProgress >= 1 && rig.renderedTile !== rig.targetTile) {
            rig.hopFromTile = rig.renderedTile;
            rig.hopToTile = (rig.renderedTile + 1) % BOARD_TILE_COUNT;
            rig.hopProgress = 0;
            rig.stepCounter += 1;
            simsarSfx.playTileHop(rig.stepCounter);
          }

          if (rig.hopProgress < 1) {
            rig.hopProgress = Math.min(1, rig.hopProgress + dt * 5.4);
            const fromTf = getTileWorldTransform(rig.hopFromTile);
            const toTf = getTileWorldTransform(rig.hopToTile);
            const t = rig.hopProgress;

            const curX = fromTf.x + (toTf.x - fromTf.x) * t;
            const curZ = fromTf.z + (toTf.z - fromTf.z) * t;
            const arcY = 0.46 + Math.sin(t * Math.PI) * 1.45;

            rig.root.position.set(curX, arcY, curZ);
            rig.root.rotation.y = toTf.forwardYaw;

            // Squash & stretch bounce!
            const stretch = 1 + Math.sin(t * Math.PI) * 0.16;
            rig.bodyHolder.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));

            if (rig.hopProgress >= 1) {
              rig.renderedTile = rig.hopToTile;
              rig.bodyHolder.scale.set(1, 1, 1);
            }
          } else {
            const tf = getTileWorldTransform(rig.renderedTile);
            const coList = tileOccupants.get(rig.renderedTile) || [p.id];
            const slotIdx = coList.indexOf(p.id);
            const spreadAngle = (slotIdx / Math.max(1, coList.length)) * Math.PI * 2;
            const spreadRad = coList.length > 1 ? 0.68 : 0;

            const targetX = tf.x + Math.cos(spreadAngle) * spreadRad;
            const targetZ = tf.z + Math.sin(spreadAngle) * spreadRad;
            const idleBob =
              p.id === snap.currentPlayerId
                ? Math.abs(Math.sin(timeSec * 4.2)) * 0.18
                : 0;

            rig.root.position.x += (targetX - rig.root.position.x) * Math.min(1, dt * 10);
            rig.root.position.z += (targetZ - rig.root.position.z) * Math.min(1, dt * 10);
            rig.root.position.y = 0.46 + idleBob;
            rig.root.rotation.y = tf.forwardYaw;
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

      // Step Golden Upgrade Burst Particles
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.life -= dt;
        if (b.life <= 0) {
          scene.remove(b.mesh);
          bursts.splice(i, 1);
          continue;
        }
        b.vy -= 12 * dt;
        b.mesh.position.x += b.vx * dt;
        b.mesh.position.y += b.vy * dt;
        b.mesh.position.z += b.vz * dt;
        b.mesh.rotation.x += dt * 8;
        b.mesh.scale.setScalar(Math.max(0.1, b.life));
      }

      // 10. Portrait-Smart Auto-Director Camera!
      const aspect = camera.aspect;
      // Scale distance seamlessly on tall narrow portrait phones so the full 3D board fits edge-to-edge!
      const portraitMult =
        aspect < 1.05 ? Math.min(1.72, 1.05 / Math.max(0.5, aspect)) : 1.0;

      let desiredLookX = 0;
      let desiredLookZ = 1.2;
      let baseDist = 27.5;
      let baseElev = 24.5;

      if (snap.cameraMode === "AUTO") {
        if (diceAnimTimer > 0 && diceAnimTimer < 0.9) {
          // Focus on tumbling 3D dice in center courtyard!
          desiredLookX = 0;
          desiredLookZ = 1.8;
          baseDist = 20.5;
          baseElev = 19.5;
        } else if (snap.selectedTileIndex !== null) {
          const stf = getTileWorldTransform(snap.selectedTileIndex);
          desiredLookX = stf.x * 0.55;
          desiredLookZ = stf.z * 0.55;
          baseDist = 21.5;
          baseElev = 19.5;
        } else if (activeFocusPos) {
          desiredLookX = activeFocusPos.x * 0.45;
          desiredLookZ = activeFocusPos.z * 0.45 + 0.8;
          baseDist = 22.8;
          baseElev = 20.5;
        }
      }

      const finalDist = baseDist * portraitMult * userZoomMult;
      const finalElev = baseElev * Math.pow(portraitMult, 0.72) * userZoomMult;
      const orbitYaw = userOrbitOffset;

      const targetCamX = desiredLookX + Math.sin(orbitYaw) * finalDist;
      const targetCamZ = desiredLookZ + Math.cos(orbitYaw) * finalDist;
      const targetCamY = finalElev;

      camPos.x += (targetCamX - camPos.x) * Math.min(1, dt * 5.2);
      camPos.y += (targetCamY - camPos.y) * Math.min(1, dt * 5.2);
      camPos.z += (targetCamZ - camPos.z) * Math.min(1, dt * 5.2);

      camLook.x += (desiredLookX - camLook.x) * Math.min(1, dt * 6.5);
      camLook.z += (desiredLookZ - camLook.z) * Math.min(1, dt * 6.5);

      camera.position.copy(camPos);
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
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full touch-none select-none cursor-grab active:cursor-grabbing"
    />
  );
}
