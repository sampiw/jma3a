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

const TILE_SIZE = 1.25;

function gridToWorld(r: number, c: number, boardSize: number): { x: number; z: number } {
  const half = (boardSize - 1) / 2;
  return {
    x: (c - half) * TILE_SIZE,
    z: (r - half) * TILE_SIZE,
  };
}

function createSculpted3DPiece(kind: PieceKind, side: PieceSide): THREE.Group {
  const group = new THREE.Group();

  const isGold = side === "GOLD";
  const mainMat = new THREE.MeshStandardMaterial({
    color: isGold ? 0xf59e0b : 0xe11d48,
    metalness: 0.55,
    roughness: 0.25,
    emissive: isGold ? 0x78350f : 0x4c0519,
    emissiveIntensity: 0.22,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: isGold ? 0xfef08a : 0xfda4af,
    metalness: 0.75,
    roughness: 0.18,
  });

  // Common pedestal base
  const base1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.48, 0.14, 24),
    mainMat
  );
  base1.position.y = 0.07;
  base1.castShadow = true;
  base1.receiveShadow = true;
  group.add(base1);

  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.39, 0.035, 10, 24),
    trimMat
  );
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = 0.15;
  group.add(baseRing);

  switch (kind) {
    case "KING": {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.36, 0.92, 24),
        mainMat
      );
      stem.position.y = 0.6;
      stem.castShadow = true;
      group.add(stem);

      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.26, 0.16, 20),
        trimMat
      );
      collar.position.y = 1.1;
      group.add(collar);

      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.22, 0.28, 12),
        mainMat
      );
      crown.position.y = 1.32;
      group.add(crown);

      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.16, 0),
        trimMat
      );
      orb.position.y = 1.62;
      group.add(orb);
      break;
    }

    case "QUEEN": {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.21, 0.34, 0.82, 24),
        mainMat
      );
      stem.position.y = 0.55;
      stem.castShadow = true;
      group.add(stem);

      const coronet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.2, 0.22, 16),
        trimMat
      );
      coronet.position.y = 1.06;
      group.add(coronet);

      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 18, 14),
        mainMat
      );
      dome.position.y = 1.24;
      group.add(dome);

      const pearl = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 12, 12),
        trimMat
      );
      pearl.position.y = 1.46;
      group.add(pearl);
      break;
    }

    case "ROOK": {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.35, 0.72, 16),
        mainMat
      );
      tower.position.y = 0.5;
      tower.castShadow = true;
      group.add(tower);

      const battlement = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.32, 0.22, 8),
        trimMat
      );
      battlement.position.y = 0.94;
      group.add(battlement);
      break;
    }

    case "BISHOP": {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.32, 0.68, 20),
        mainMat
      );
      stem.position.y = 0.48;
      stem.castShadow = true;
      group.add(stem);

      const mitre = new THREE.Mesh(
        new THREE.ConeGeometry(0.26, 0.45, 20),
        mainMat
      );
      mitre.position.y = 1.0;
      group.add(mitre);

      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 12, 12),
        trimMat
      );
      tip.position.y = 1.25;
      group.add(tip);
      break;
    }

    case "KNIGHT": {
      const ped = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.34, 0.45, 18),
        mainMat
      );
      ped.position.y = 0.36;
      group.add(ped);

      const neck = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.55, 0.36),
        mainMat
      );
      neck.position.set(0, 0.78, 0);
      neck.rotation.x = isGold ? -0.25 : 0.25;
      neck.castShadow = true;
      group.add(neck);

      const snout = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.42),
        trimMat
      );
      snout.position.set(0, 0.96, isGold ? -0.14 : 0.14);
      group.add(snout);
      break;
    }

    case "PAWN":
    case "STUDENT":
    default: {
      const body = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 0.56, 20),
        mainMat
      );
      body.position.y = 0.42;
      body.castShadow = true;
      group.add(body);

      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.18, 0.03, 8, 20),
        trimMat
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.66;
      group.add(collar);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 18, 16),
        mainMat
      );
      head.position.y = 0.82;
      head.castShadow = true;
      group.add(head);
      break;
    }
  }

  return group;
}

function buildTempleArch(side: PieceSide): THREE.Group {
  const arch = new THREE.Group();
  const color = side === "GOLD" ? 0xfacc15 : 0xf43f5e;
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.65,
    roughness: 0.25,
    emissive: color,
    emissiveIntensity: 0.2,
  });

  const leftPillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.07, 1.35, 12),
    mat
  );
  leftPillar.position.set(-0.48, 0.68, 0);
  arch.add(leftPillar);

  const rightPillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.07, 1.35, 12),
    mat
  );
  rightPillar.position.set(0.48, 0.68, 0);
  arch.add(rightPillar);

  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.1, 0.14), mat);
  beam.position.set(0, 1.32, 0);
  arch.add(beam);

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
    scene.background = new THREE.Color(0x070b14);
    scene.fog = new THREE.FogExp2(0x070b14, 0.028);

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      80
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

    // Royal Salon Lighting
    const ambient = new THREE.AmbientLight(0x334155, 1.35);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xfef08a, 1.85);
    keyLight.position.set(8, 16, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x38bdf8, 1.4, 28);
    rimLight.position.set(-9, 10, -9);
    scene.add(rimLight);

    const warmLight = new THREE.PointLight(0xf43f5e, 1.2, 28);
    warmLight.position.set(9, 8, -9);
    scene.add(warmLight);

    // Dynamic Root Groups
    const boardGroup = new THREE.Group();
    scene.add(boardGroup);

    const highlightsGroup = new THREE.Group();
    scene.add(highlightsGroup);

    const piecesGroup = new THREE.Group();
    scene.add(piecesGroup);

    // Raycast targets for tiles
    let tileMeshes: Array<{ mesh: THREE.Mesh; r: number; c: number }> = [];
    let builtBoardSize = 0;
    let builtMode: BoardGameMode | null = null;

    const rebuildBoardGeometry = (size: 5 | 8, currentMode: BoardGameMode) => {
      builtBoardSize = size;
      builtMode = currentMode;
      boardGroup.clear();
      tileMeshes = [];

      const boardSpan = size * TILE_SIZE;
      // Rosewood Table Frame
      const tableBase = new THREE.Mesh(
        new THREE.BoxGeometry(boardSpan + 1.2, 0.45, boardSpan + 1.2),
        new THREE.MeshStandardMaterial({
          color: 0x3b1d14,
          roughness: 0.55,
          metalness: 0.2,
        })
      );
      tableBase.position.y = -0.24;
      tableBase.receiveShadow = true;
      boardGroup.add(tableBase);

      const goldRim = new THREE.Mesh(
        new THREE.BoxGeometry(boardSpan + 0.35, 0.48, boardSpan + 0.35),
        new THREE.MeshStandardMaterial({
          color: 0xd97706,
          metalness: 0.7,
          roughness: 0.25,
        })
      );
      goldRim.position.y = -0.23;
      boardGroup.add(goldRim);

      // Tiles
      const lightTileMat = new THREE.MeshStandardMaterial({
        color: currentMode === "ONITAMA" ? 0x1e293b : 0x334155,
        roughness: 0.4,
        metalness: 0.15,
      });
      const darkTileMat = new THREE.MeshStandardMaterial({
        color: currentMode === "ONITAMA" ? 0x0f172a : 0x090d16,
        roughness: 0.5,
        metalness: 0.2,
      });
      const goldTempleMat = new THREE.MeshStandardMaterial({
        color: 0x78350f,
        emissive: 0xb45309,
        emissiveIntensity: 0.35,
        roughness: 0.3,
      });
      const crimsonTempleMat = new THREE.MeshStandardMaterial({
        color: 0x881337,
        emissive: 0xbe123c,
        emissiveIntensity: 0.35,
        roughness: 0.3,
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
            new THREE.BoxGeometry(TILE_SIZE * 0.96, 0.14, TILE_SIZE * 0.96),
            mat
          );
          tileMesh.position.set(x, -0.07, z);
          tileMesh.receiveShadow = true;
          tileMesh.userData = { r, c };
          boardGroup.add(tileMesh);
          tileMeshes.push({ mesh: tileMesh, r, c });
        }
      }

      // Add Onitama Temple Arches at (0, 2) and (4, 2)
      if (currentMode === "ONITAMA") {
        const crimsonPos = gridToWorld(0, 2, 5);
        const crimsonArch = buildTempleArch("CRIMSON");
        crimsonArch.position.set(crimsonPos.x, 0, crimsonPos.z - 0.54);
        boardGroup.add(crimsonArch);

        const goldPos = gridToWorld(4, 2, 5);
        const goldArch = buildTempleArch("GOLD");
        goldArch.position.set(goldPos.x, 0, goldPos.z + 0.54);
        boardGroup.add(goldArch);
      }
    };

    // Track 3D Piece Nodes for smooth animation
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
    let orbitPitch = 0.85;
    let targetYaw = 0;
    let targetPitch = 0.85;
    let cameraDist = 11.2;
    let lastPreset: "GOLD" | "CRIMSON" | "TOP" | null = null;

    // Pointer interaction for raycasting vs camera drag
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
      if (Math.hypot(dx, dy) > 8) {
        isDraggingOrbit = true;
        targetYaw -= dx * 0.0075;
        targetPitch = Math.max(0.38, Math.min(1.48, targetPitch + dy * 0.0065));
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

      // Check tile intersection
      const hitTiles = raycaster.intersectObjects(
        tileMeshes.map((t) => t.mesh),
        false
      );
      if (hitTiles.length > 0) {
        const { r, c } = hitTiles[0].object.userData as {
          r: number;
          c: number;
        };
        propsRef.current.onSelectTileOrPiece(r, c);
        return;
      }

      // Or check piece intersection and map to its (r, c)
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
          }
        }
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

      // Update camera preset if changed
      if (curPreset !== lastPreset) {
        lastPreset = curPreset;
        if (curPreset === "GOLD") {
          targetYaw = 0;
          targetPitch = 0.82;
        } else if (curPreset === "CRIMSON") {
          targetYaw = Math.PI;
          targetPitch = 0.82;
        } else {
          targetYaw = 0;
          targetPitch = 1.46;
        }
      }

      const desiredDist = curSize === 8 ? 13.8 : 9.8;
      cameraDist += (desiredDist - cameraDist) * Math.min(1, dt * 6);
      orbitYaw += (targetYaw - orbitYaw) * Math.min(1, dt * 7);
      orbitPitch += (targetPitch - orbitPitch) * Math.min(1, dt * 7);

      const camX = Math.sin(orbitYaw) * Math.cos(orbitPitch) * cameraDist;
      const camY = Math.sin(orbitPitch) * cameraDist;
      const camZ = Math.cos(orbitYaw) * Math.cos(orbitPitch) * cameraDist;
      camera.position.set(camX, camY, camZ);
      camera.lookAt(0, 0.25, 0);

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
          group.position.set(worldPos.x, 0, worldPos.z);
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
        const hoverY = isSelected ? 0.28 + Math.sin(now * 0.008) * 0.07 : 0;

        node.group.position.set(
          node.currX,
          jumpArcY + hoverY,
          node.currZ
        );
      }

      // Rebuild Tile Highlights when selection or legal destinations change
      const highlightHash = `${curSelectedId}_${curLegal
        .map((d) => `${d.r},${d.c}`)
        .join(";")}_${curLastMove?.id ?? ""}_${curCheckSide ?? ""}`;

      if (highlightHash !== lastHighlightHash) {
        lastHighlightHash = highlightHash;
        highlightsGroup.clear();

        // Last Move From/To subtle gold trail
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
                opacity: 0.25,
                side: THREE.DoubleSide,
              })
            );
            plane.rotation.x = -Math.PI / 2;
            plane.position.set(wp.x, 0.02, wp.z);
            highlightsGroup.add(plane);
          }
        }

        // Selected Piece Ring
        const selPiece = curPieces.find((p) => p.id === curSelectedId);
        if (selPiece) {
          const wp = gridToWorld(selPiece.r, selPiece.c, curSize);
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.42, 0.54, 28),
            new THREE.MeshBasicMaterial({
              color: 0xfacc15,
              side: THREE.DoubleSide,
            })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(wp.x, 0.03, wp.z);
          highlightsGroup.add(ring);
        }

        // Legal Destination Beacons (Green for empty tile, Red ring for enemy capture!)
        for (const dest of curLegal) {
          const wp = gridToWorld(dest.r, dest.c, curSize);
          const hasEnemy = curPieces.some(
            (p) => p.r === dest.r && p.c === dest.c
          );

          const marker = new THREE.Mesh(
            hasEnemy
              ? new THREE.RingGeometry(0.38, 0.55, 28)
              : new THREE.CylinderGeometry(0.22, 0.22, 0.08, 20),
            new THREE.MeshBasicMaterial({
              color: hasEnemy ? 0xf43f5e : 0x10b981,
              transparent: true,
              opacity: 0.88,
              side: THREE.DoubleSide,
            })
          );
          if (hasEnemy) {
            marker.rotation.x = -Math.PI / 2;
            marker.position.set(wp.x, 0.04, wp.z);
          } else {
            marker.position.set(wp.x, 0.05, wp.z);
          }
          highlightsGroup.add(marker);
        }

        // Check Warning Ring around King in Chess mode
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
            checkRing.position.set(wp.x, 0.045, wp.z);
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
      className="relative w-full h-full overflow-hidden select-none touch-none bg-[#070b14] cursor-grab active:cursor-grabbing"
    />
  );
}
