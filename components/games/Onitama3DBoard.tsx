"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  BoardGameMode,
  BoardPiece,
  MoveRecord,
  PieceKind,
  PieceSide,
} from "@/games/onitama3d/types";

interface Onitama3DBoardProps {
  mode: BoardGameMode;
  boardSize: 5 | 8;
  pieces: BoardPiece[];
  turn: PieceSide;
  selectedPieceId: string | null;
  legalDestinations: Array<{ r: number; c: number }>;
  lastMove: MoveRecord | null;
  inCheckSide: PieceSide | null;
  cameraPreset: "GOLD" | "CRIMSON" | "TOP";
  onSelectTileOrPiece: (r: number, c: number) => void;
}

const TILE_SIZE = 1.28;
const TILE_TOP_Y = 0.12;

function gridToWorld(
  r: number,
  c: number,
  boardSize: number
): { x: number; z: number } {
  const half = (boardSize - 1) / 2;
  return {
    x: (c - half) * TILE_SIZE,
    z: (r - half) * TILE_SIZE,
  };
}

/**
 * Generates high-resolution procedural textures for the 3D board tiles & wooden frame
 */
function createBoardTextures() {
  // 1. Light Ivory Marble + Moroccan Geometric Inner Border
  const lightCanvas = document.createElement("canvas");
  lightCanvas.width = 256;
  lightCanvas.height = 256;
  const lCtx = lightCanvas.getContext("2d")!;
  const lGrad = lCtx.createLinearGradient(0, 0, 256, 256);
  lGrad.addColorStop(0, "#f8fafc");
  lGrad.addColorStop(0.5, "#e2e8f0");
  lGrad.addColorStop(1, "#cbd5e1");
  lCtx.fillStyle = lGrad;
  lCtx.fillRect(0, 0, 256, 256);

  // Subtle marble veins
  lCtx.strokeStyle = "rgba(100, 116, 139, 0.16)";
  lCtx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    lCtx.beginPath();
    lCtx.moveTo(0, 35 * i + 15);
    lCtx.bezierCurveTo(80, 35 * i - 20, 170, 35 * i + 40, 256, 35 * i + 5);
    lCtx.stroke();
  }

  // Ornate inner frame
  lCtx.strokeStyle = "rgba(180, 83, 9, 0.38)";
  lCtx.lineWidth = 4;
  lCtx.strokeRect(10, 10, 236, 236);
  lCtx.strokeStyle = "rgba(15, 23, 42, 0.15)";
  lCtx.lineWidth = 2;
  lCtx.strokeRect(18, 18, 220, 220);

  const lightTex = new THREE.CanvasTexture(lightCanvas);
  lightTex.anisotropy = 4;

  // 2. Dark Royal Emerald / Obsidian Tile + Gold Corner Motifs
  const darkCanvas = document.createElement("canvas");
  darkCanvas.width = 256;
  darkCanvas.height = 256;
  const dCtx = darkCanvas.getContext("2d")!;
  const dGrad = dCtx.createLinearGradient(0, 0, 256, 256);
  dGrad.addColorStop(0, "#0f2922");
  dGrad.addColorStop(0.5, "#091915");
  dGrad.addColorStop(1, "#040d0b");
  dCtx.fillStyle = dGrad;
  dCtx.fillRect(0, 0, 256, 256);

  // Gold filigree border & center rosette
  dCtx.strokeStyle = "rgba(245, 158, 11, 0.42)";
  dCtx.lineWidth = 4;
  dCtx.strokeRect(10, 10, 236, 236);
  dCtx.strokeStyle = "rgba(16, 185, 129, 0.25)";
  dCtx.lineWidth = 2;
  dCtx.strokeRect(20, 20, 216, 216);

  dCtx.beginPath();
  dCtx.arc(128, 128, 28, 0, Math.PI * 2);
  dCtx.stroke();

  const darkTex = new THREE.CanvasTexture(darkCanvas);
  darkTex.anisotropy = 4;

  // 3. Temple Shrine Tile Texture (Gold & Crimson)
  const makeTempleTex = (primary: string, accent: string) => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 236, 236);

    // Sacred sun/lotus emblem
    ctx.beginPath();
    ctx.arc(128, 128, 68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(128, 128, 36, 0, Math.PI * 2);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  };

  // 4. Carved Walnut Wood Frame Texture
  const woodCanvas = document.createElement("canvas");
  woodCanvas.width = 512;
  woodCanvas.height = 512;
  const wCtx = woodCanvas.getContext("2d")!;
  wCtx.fillStyle = "#2a120a";
  wCtx.fillRect(0, 0, 512, 512);
  wCtx.strokeStyle = "rgba(120, 53, 15, 0.45)";
  wCtx.lineWidth = 3;
  for (let y = 0; y < 512; y += 8) {
    wCtx.beginPath();
    wCtx.moveTo(0, y);
    wCtx.bezierCurveTo(170, y + 6, 340, y - 6, 512, y);
    wCtx.stroke();
  }
  const woodTex = new THREE.CanvasTexture(woodCanvas);

  return {
    lightTex,
    darkTex,
    goldTempleTex: makeTempleTex("#451a03", "#facc15"),
    crimsonTempleTex: makeTempleTex("#4c0519", "#fb7185"),
    woodTex,
  };
}

function createPieceBadgeSprite(symbol: string, side: PieceSide): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 128);

  ctx.fillStyle =
    side === "GOLD" ? "rgba(120, 53, 15, 0.9)" : "rgba(136, 19, 55, 0.9)";
  ctx.strokeStyle = side === "GOLD" ? "#fde047" : "#fda4af";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(64, 64, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.font = "900 54px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(symbol, 64, 68);

  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  );
  sprite.scale.set(0.46, 0.46, 1);
  return sprite;
}

const KIND_SYMBOL: Record<PieceKind, string> = {
  KING: "♔",
  QUEEN: "♕",
  ROOK: "♖",
  BISHOP: "♗",
  KNIGHT: "♘",
  PAWN: "♙",
  STUDENT: "🥋",
};

function createSculpted3DPiece(kind: PieceKind, side: PieceSide): THREE.Group {
  const group = new THREE.Group();

  const isGold = side === "GOLD";
  const mainMat = new THREE.MeshStandardMaterial({
    color: isGold ? 0xf59e0b : 0xe11d48,
    metalness: 0.45,
    roughness: 0.22,
    emissive: isGold ? 0x451a03 : 0x4c0519,
    emissiveIntensity: 0.25,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: isGold ? 0xfef08a : 0xfecdd3,
    metalness: 0.75,
    roughness: 0.15,
  });

  // Invisible generous touch cylinder so clicking/tapping a piece never misses!
  const hitBox = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.52, 1.8, 12),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitBox.position.y = 0.9;
  group.add(hitBox);

  // Pedestal base
  const base1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.48, 0.15, 24),
    mainMat
  );
  base1.position.y = 0.075;
  base1.castShadow = true;
  base1.receiveShadow = true;
  group.add(base1);

  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.39, 0.04, 10, 24),
    trimMat
  );
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = 0.15;
  group.add(baseRing);

  let badgeHeight = 1.25;

  switch (kind) {
    case "KING": {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.37, 0.95, 24),
        mainMat
      );
      stem.position.y = 0.62;
      stem.castShadow = true;
      group.add(stem);

      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.27, 0.16, 20),
        trimMat
      );
      collar.position.y = 1.12;
      group.add(collar);

      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.23, 0.3, 12),
        mainMat
      );
      crown.position.y = 1.35;
      group.add(crown);

      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.18, 0),
        trimMat
      );
      orb.position.y = 1.66;
      group.add(orb);
      badgeHeight = 2.05;
      break;
    }

    case "QUEEN": {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.35, 0.85, 24),
        mainMat
      );
      stem.position.y = 0.56;
      stem.castShadow = true;
      group.add(stem);

      const coronet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.31, 0.21, 0.24, 16),
        trimMat
      );
      coronet.position.y = 1.08;
      group.add(coronet);

      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.21, 18, 14),
        mainMat
      );
      dome.position.y = 1.26;
      group.add(dome);
      badgeHeight = 1.78;
      break;
    }

    case "ROOK": {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.29, 0.36, 0.74, 16),
        mainMat
      );
      tower.position.y = 0.5;
      tower.castShadow = true;
      group.add(tower);

      const battlement = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.33, 0.24, 8),
        trimMat
      );
      battlement.position.y = 0.96;
      group.add(battlement);
      badgeHeight = 1.45;
      break;
    }

    case "BISHOP": {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.33, 0.7, 20),
        mainMat
      );
      stem.position.y = 0.48;
      stem.castShadow = true;
      group.add(stem);

      const mitre = new THREE.Mesh(
        new THREE.ConeGeometry(0.27, 0.46, 20),
        mainMat
      );
      mitre.position.y = 1.02;
      group.add(mitre);
      badgeHeight = 1.55;
      break;
    }

    case "KNIGHT": {
      const ped = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.35, 0.46, 18),
        mainMat
      );
      ped.position.y = 0.36;
      group.add(ped);

      const neck = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.56, 0.38),
        mainMat
      );
      neck.position.set(0, 0.8, 0);
      neck.rotation.x = isGold ? -0.25 : 0.25;
      neck.castShadow = true;
      group.add(neck);

      const snout = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.44),
        trimMat
      );
      snout.position.set(0, 0.98, isGold ? -0.14 : 0.14);
      group.add(snout);
      badgeHeight = 1.48;
      break;
    }

    case "PAWN":
    case "STUDENT":
    default: {
      const body = new THREE.Mesh(
        new THREE.ConeGeometry(0.29, 0.58, 20),
        mainMat
      );
      body.position.y = 0.42;
      body.castShadow = true;
      group.add(body);

      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.19, 0.035, 8, 20),
        trimMat
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.68;
      group.add(collar);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 18, 16),
        mainMat
      );
      head.position.y = 0.85;
      head.castShadow = true;
      group.add(head);
      badgeHeight = 1.32;
      break;
    }
  }

  const badge = createPieceBadgeSprite(KIND_SYMBOL[kind], side);
  badge.position.y = badgeHeight;
  group.add(badge);

  return group;
}

function buildTempleArch(side: PieceSide): THREE.Group {
  const arch = new THREE.Group();
  const color = side === "GOLD" ? 0xfacc15 : 0xfb7185;
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.65,
    roughness: 0.22,
    emissive: color,
    emissiveIntensity: 0.25,
  });

  const leftPillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 1.45, 12),
    mat
  );
  leftPillar.position.set(-0.5, 0.72, 0);
  arch.add(leftPillar);

  const rightPillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 1.45, 12),
    mat
  );
  rightPillar.position.set(0.5, 0.72, 0);
  arch.add(rightPillar);

  const beam1 = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.11, 0.16), mat);
  beam1.position.set(0, 1.42, 0);
  arch.add(beam1);

  const beam2 = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.08, 0.12), mat);
  beam2.position.set(0, 1.2, 0);
  arch.add(beam2);

  return arch;
}

export default function Onitama3DBoard({
  mode,
  boardSize,
  pieces,
  selectedPieceId,
  legalDestinations,
  lastMove,
  inCheckSide,
  cameraPreset,
  onSelectTileOrPiece,
}: Onitama3DBoardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const propsRef = useRef({
    mode,
    boardSize,
    pieces,
    selectedPieceId,
    legalDestinations,
    lastMove,
    inCheckSide,
    cameraPreset,
    onSelectTileOrPiece,
  });
  propsRef.current = {
    mode,
    boardSize,
    pieces,
    selectedPieceId,
    legalDestinations,
    lastMove,
    inCheckSide,
    cameraPreset,
    onSelectTileOrPiece,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);

    const camera = new THREE.PerspectiveCamera(
      46,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      90
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

    // Warm Royal Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0xf8fafc, 0x1e293b, 1.35);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.1);
    keyLight.position.set(9, 18, 11);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x38bdf8, 1.5, 32);
    rimLight.position.set(-10, 12, -10);
    scene.add(rimLight);

    const textures = createBoardTextures();

    const boardGroup = new THREE.Group();
    scene.add(boardGroup);

    const highlightsGroup = new THREE.Group();
    scene.add(highlightsGroup);

    const piecesGroup = new THREE.Group();
    scene.add(piecesGroup);

    let tileMeshes: Array<{ mesh: THREE.Mesh; r: number; c: number }> = [];
    let builtBoardSize = 0;
    let builtMode: BoardGameMode | null = null;

    const rebuildBoardGeometry = (size: 5 | 8, currentMode: BoardGameMode) => {
      builtBoardSize = size;
      builtMode = currentMode;
      boardGroup.clear();
      tileMeshes = [];

      const boardSpan = size * TILE_SIZE;

      // 1. Carved Walnut Outer Table Base (strictly BELOW y = 0.0!)
      const tableBase = new THREE.Mesh(
        new THREE.BoxGeometry(boardSpan + 1.15, 0.36, boardSpan + 1.15),
        new THREE.MeshStandardMaterial({
          map: textures.woodTex,
          roughness: 0.5,
          metalness: 0.15,
        })
      );
      tableBase.position.y = -0.18; // Top surface at y = 0.00
      tableBase.receiveShadow = true;
      boardGroup.add(tableBase);

      // Golden brass border trim (top at y = 0.02, well below tile top at y = +0.12!)
      const brassBorder = new THREE.Mesh(
        new THREE.BoxGeometry(boardSpan + 0.28, 0.38, boardSpan + 0.28),
        new THREE.MeshStandardMaterial({
          color: 0xd97706,
          metalness: 0.65,
          roughness: 0.28,
        })
      );
      brassBorder.position.y = -0.17; // Top surface at y = +0.02
      boardGroup.add(brassBorder);

      // 2. Textured Checkered 3D Tiles sitting proudly from y = 0.02 to y = +0.12!
      const lightTileMat = new THREE.MeshStandardMaterial({
        map: textures.lightTex,
        roughness: 0.28,
        metalness: 0.08,
      });
      const darkTileMat = new THREE.MeshStandardMaterial({
        map: textures.darkTex,
        roughness: 0.34,
        metalness: 0.15,
      });
      const goldTempleMat = new THREE.MeshStandardMaterial({
        map: textures.goldTempleTex,
        roughness: 0.25,
        metalness: 0.3,
      });
      const crimsonTempleMat = new THREE.MeshStandardMaterial({
        map: textures.crimsonTempleTex,
        roughness: 0.25,
        metalness: 0.3,
      });

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const { x, z } = gridToWorld(r, c, size);
          const isEven = (r + c) % 2 === 0;
          let mat = isEven ? lightTileMat : darkTileMat;

          if (currentMode === "ONITAMA" && c === 2 && r === 4) {
            mat = goldTempleMat;
          } else if (currentMode === "ONITAMA" && c === 2 && r === 0) {
            mat = crimsonTempleMat;
          }

          const tileMesh = new THREE.Mesh(
            new THREE.BoxGeometry(TILE_SIZE * 0.94, 0.12, TILE_SIZE * 0.94),
            mat
          );
          // Bottom at y = 0.00, Top at y = +0.12 (TILE_TOP_Y)
          tileMesh.position.set(x, 0.06, z);
          tileMesh.receiveShadow = true;
          tileMesh.userData = { r, c };
          boardGroup.add(tileMesh);
          tileMeshes.push({ mesh: tileMesh, r, c });
        }
      }

      // Add Onitama Temple Arches on the outer edge of (0, 2) and (4, 2)
      if (currentMode === "ONITAMA") {
        const crimsonPos = gridToWorld(0, 2, 5);
        const crimsonArch = buildTempleArch("CRIMSON");
        crimsonArch.position.set(crimsonPos.x, TILE_TOP_Y, crimsonPos.z - 0.56);
        boardGroup.add(crimsonArch);

        const goldPos = gridToWorld(4, 2, 5);
        const goldArch = buildTempleArch("GOLD");
        goldArch.position.set(goldPos.x, TILE_TOP_Y, goldPos.z + 0.56);
        boardGroup.add(goldArch);
      }
    };

    const pieceNodes = new Map<
      string,
      {
        group: THREE.Group;
        kind: PieceKind;
        side: PieceSide;
        currX: number;
        currZ: number;
        targetX: number;
        targetZ: number;
        jumpT: number;
      }
    >();

    // Camera Orbit State
    let orbitYaw = 0;
    let orbitPitch = 0.88;
    let targetYaw = 0;
    let targetPitch = 0.88;
    let cameraDist = 11.5;
    let lastPreset: "GOLD" | "CRIMSON" | "TOP" | null = null;

    let pointerDownPos: { x: number; y: number } | null = null;
    let isDraggingOrbit = false;
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      isDraggingOrbit = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointerDownPos) return;
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (Math.hypot(dx, dy) > 9) {
        isDraggingOrbit = true;
        targetYaw -= dx * 0.0075;
        targetPitch = Math.max(0.42, Math.min(1.48, targetPitch + dy * 0.0065));
        pointerDownPos = { x: e.clientX, y: e.clientY };
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointerDownPos) return;
      const wasDrag = isDraggingOrbit;
      pointerDownPos = null;
      isDraggingOrbit = false;

      if (wasDrag) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointerNdc, camera);

      // 1. Check legal destination tiles FIRST if a piece is already selected!
      const hitTiles = raycaster.intersectObjects(
        tileMeshes.map((t) => t.mesh),
        false
      );
      if (hitTiles.length > 0 && propsRef.current.selectedPieceId) {
        const { r, c } = hitTiles[0].object.userData as {
          r: number;
          c: number;
        };
        const isLegalDest = propsRef.current.legalDestinations.some(
          (d) => d.r === r && d.c === c
        );
        if (isLegalDest) {
          propsRef.current.onSelectTileOrPiece(r, c);
          return;
        }
      }

      // 2. Check Piece intersection FIRST so angled clicks on tall 3D pieces always select the piece!
      const hitPieces = raycaster.intersectObjects(piecesGroup.children, true);
      if (hitPieces.length > 0) {
        let obj: THREE.Object3D | null = hitPieces[0].object;
        while (obj && !obj.userData?.pieceId) {
          obj = obj.parent;
        }
        if (obj?.userData?.pieceId) {
          const piece = propsRef.current.pieces.find(
            (p) => p.id === obj!.userData.pieceId
          );
          if (piece) {
            propsRef.current.onSelectTileOrPiece(piece.r, piece.c);
            return;
          }
        }
      }

      // 3. Fallback to any tapped tile
      if (hitTiles.length > 0) {
        const { r, c } = hitTiles[0].object.userData as {
          r: number;
          c: number;
        };
        propsRef.current.onSelectTileOrPiece(r, c);
      }
    };

    const domEl = renderer.domElement;
    domEl.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    const onResize = () => {
      if (!container) return;
      camera.aspect =
        container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    let animId = 0;
    let lastTime = performance.now();
    let lastHighlightHash = "";

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const {
        mode: curMode,
        boardSize: curSize,
        pieces: curPieces,
        selectedPieceId: curSelectedId,
        legalDestinations: curLegal,
        lastMove: curLastMove,
        inCheckSide: curCheckSide,
        cameraPreset: curPreset,
      } = propsRef.current;

      if (curSize !== builtBoardSize || curMode !== builtMode) {
        rebuildBoardGeometry(curSize, curMode);
        pieceNodes.forEach((n) => piecesGroup.remove(n.group));
        pieceNodes.clear();
        lastHighlightHash = "";
      }

      if (curPreset !== lastPreset) {
        lastPreset = curPreset;
        if (curPreset === "GOLD") {
          targetYaw = 0;
          targetPitch = 0.88;
        } else if (curPreset === "CRIMSON") {
          targetYaw = Math.PI;
          targetPitch = 0.88;
        } else {
          targetYaw = 0;
          targetPitch = 1.46;
        }
      }

      // Aspect-ratio aware zoom so mobile portrait never clips the left/right edges of the board!
      const aspect =
        container.clientWidth / Math.max(1, container.clientHeight);
      const portraitZoomMult =
        aspect < 1 ? 1 / Math.max(0.55, aspect * 0.92) : 1;
      const baseDist = curSize === 8 ? 13.8 : 9.4;
      const desiredDist = baseDist * portraitZoomMult;

      cameraDist += (desiredDist - cameraDist) * Math.min(1, dt * 6);
      orbitYaw += (targetYaw - orbitYaw) * Math.min(1, dt * 7);
      orbitPitch += (targetPitch - orbitPitch) * Math.min(1, dt * 7);

      const camX = Math.sin(orbitYaw) * Math.cos(orbitPitch) * cameraDist;
      const camY = Math.sin(orbitPitch) * cameraDist;
      const camZ = Math.cos(orbitYaw) * Math.cos(orbitPitch) * cameraDist;
      camera.position.set(camX, camY, camZ);
      camera.lookAt(0, 0.15, 0);

      // Sync Pieces & Animate Parabolic Leaps
      const activeIds = new Set(curPieces.map((p) => p.id));
      for (const [id, node] of pieceNodes.entries()) {
        if (!activeIds.has(id)) {
          piecesGroup.remove(node.group);
          pieceNodes.delete(id);
        }
      }

      for (const p of curPieces) {
        const worldPos = gridToWorld(p.r, p.c, curSize);
        let node = pieceNodes.get(p.id);

        if (!node || node.kind !== p.kind) {
          if (node) piecesGroup.remove(node.group);
          const group = createSculpted3DPiece(p.kind, p.side);
          group.userData = { pieceId: p.id };
          group.position.set(worldPos.x, TILE_TOP_Y, worldPos.z);
          piecesGroup.add(group);
          node = {
            group,
            kind: p.kind,
            side: p.side,
            currX: worldPos.x,
            currZ: worldPos.z,
            targetX: worldPos.x,
            targetZ: worldPos.z,
            jumpT: 1,
          };
          pieceNodes.set(p.id, node);
        }

        if (
          Math.abs(node.targetX - worldPos.x) > 0.01 ||
          Math.abs(node.targetZ - worldPos.z) > 0.01
        ) {
          node.targetX = worldPos.x;
          node.targetZ = worldPos.z;
          node.jumpT = 0;
        }

        if (node.jumpT < 1) {
          node.jumpT = Math.min(1, node.jumpT + dt * 3.4);
          node.currX += (node.targetX - node.currX) * Math.min(1, dt * 11);
          node.currZ += (node.targetZ - node.currZ) * Math.min(1, dt * 11);
        } else {
          node.currX = node.targetX;
          node.currZ = node.targetZ;
        }

        const isSelected = p.id === curSelectedId;
        const jumpArcY =
          node.jumpT < 1 ? Math.sin(node.jumpT * Math.PI) * 1.15 : 0;
        const hoverY = isSelected ? 0.32 + Math.sin(now * 0.008) * 0.08 : 0;

        node.group.position.set(
          node.currX,
          TILE_TOP_Y + jumpArcY + hoverY,
          node.currZ
        );
      }

      // Rebuild Tile Highlights ABOVE TILE_TOP_Y (+0.12)
      const highlightHash = `${curSelectedId}_${curLegal
        .map((d) => `${d.r},${d.c}`)
        .join(";")}_${curLastMove?.id ?? ""}_${curCheckSide ?? ""}`;

      if (highlightHash !== lastHighlightHash) {
        lastHighlightHash = highlightHash;
        highlightsGroup.clear();

        if (curLastMove) {
          for (const pt of [
            { r: curLastMove.fromR, c: curLastMove.fromC },
            { r: curLastMove.toR, c: curLastMove.toC },
          ]) {
            const wp = gridToWorld(pt.r, pt.c, curSize);
            const plane = new THREE.Mesh(
              new THREE.PlaneGeometry(TILE_SIZE * 0.88, TILE_SIZE * 0.88),
              new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.32,
                side: THREE.DoubleSide,
              })
            );
            plane.rotation.x = -Math.PI / 2;
            plane.position.set(wp.x, TILE_TOP_Y + 0.01, wp.z);
            highlightsGroup.add(plane);
          }
        }

        const selPiece = curPieces.find((p) => p.id === curSelectedId);
        if (selPiece) {
          const wp = gridToWorld(selPiece.r, selPiece.c, curSize);
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.42, 0.56, 28),
            new THREE.MeshBasicMaterial({
              color: 0xfacc15,
              side: THREE.DoubleSide,
            })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(wp.x, TILE_TOP_Y + 0.02, wp.z);
          highlightsGroup.add(ring);
        }

        for (const dest of curLegal) {
          const wp = gridToWorld(dest.r, dest.c, curSize);
          const hasEnemy = curPieces.some(
            (p) => p.r === dest.r && p.c === dest.c
          );

          // Glowing tile pad + 3D beacon so legal moves are impossible to miss!
          const pad = new THREE.Mesh(
            new THREE.PlaneGeometry(TILE_SIZE * 0.86, TILE_SIZE * 0.86),
            new THREE.MeshBasicMaterial({
              color: hasEnemy ? 0xf43f5e : 0x10b981,
              transparent: true,
              opacity: 0.42,
              side: THREE.DoubleSide,
            })
          );
          pad.rotation.x = -Math.PI / 2;
          pad.position.set(wp.x, TILE_TOP_Y + 0.015, wp.z);
          highlightsGroup.add(pad);

          const marker = new THREE.Mesh(
            hasEnemy
              ? new THREE.RingGeometry(0.38, 0.55, 28)
              : new THREE.CylinderGeometry(0.24, 0.24, 0.1, 24),
            new THREE.MeshBasicMaterial({
              color: hasEnemy ? 0xff0040 : 0x34d399,
              side: THREE.DoubleSide,
            })
          );
          if (hasEnemy) {
            marker.rotation.x = -Math.PI / 2;
            marker.position.set(wp.x, TILE_TOP_Y + 0.03, wp.z);
          } else {
            marker.position.set(wp.x, TILE_TOP_Y + 0.06, wp.z);
          }
          highlightsGroup.add(marker);
        }

        if (curCheckSide) {
          const checkedKing = curPieces.find(
            (p) => p.side === curCheckSide && p.kind === "KING"
          );
          if (checkedKing) {
            const wp = gridToWorld(checkedKing.r, checkedKing.c, curSize);
            const checkRing = new THREE.Mesh(
              new THREE.RingGeometry(0.45, 0.58, 28),
              new THREE.MeshBasicMaterial({
                color: 0xef4444,
                side: THREE.DoubleSide,
              })
            );
            checkRing.rotation.x = -Math.PI / 2;
            checkRing.position.set(wp.x, TILE_TOP_Y + 0.03, wp.z);
            highlightsGroup.add(checkRing);
          }
        }
      }

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      domEl.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none touch-none bg-[#0b1120] cursor-pointer"
    />
  );
}
