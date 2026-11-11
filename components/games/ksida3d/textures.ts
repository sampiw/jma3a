import * as THREE from "three";

export interface KsidaMaterialSet {
  asphaltMat: THREE.MeshStandardMaterial;
  rondaZelligeMat: THREE.MeshStandardMaterial;
  curbMat: THREE.MeshStandardMaterial;
  boostRampMat: THREE.MeshStandardMaterial;
   boostTex: THREE.CanvasTexture;
  sandTerrainMat: THREE.MeshStandardMaterial;
}

let cachedMaterials: KsidaMaterialSet | null = null;

function createAsphaltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  // Rich dark tarmac base
  ctx.fillStyle = "#1e2430";
  ctx.fillRect(0, 0, 512, 512);

  // Fine aggregate asphalt grain
  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 24 + Math.floor(Math.random() * 30);
    ctx.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Yellow outer road shoulder lines
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(14, 0, 10, 512);
  ctx.fillRect(488, 0, 10, 512);

  // Crisp white dashed racing centerline
  ctx.fillStyle = "#f8fafc";
  for (let y = 24; y < 512; y += 128) {
    ctx.fillRect(250, y, 12, 72);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRondaZelligeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#1c2230";
  ctx.fillRect(0, 0, 512, 512);

  const cx = 256;
  const cy = 256;

  // Concentric Moroccan Zellige Roundabout Rings!
  const rings = [
    { r: 245, col: "#f59e0b", w: 10 },
    { r: 210, col: "#0ea5e9", w: 6 },
    { r: 150, col: "#10b981", w: 8 },
    { r: 85, col: "#f43f5e", w: 8 },
  ];
  for (const rg of rings) {
    ctx.beginPath();
    ctx.arc(cx, cy, rg.r, 0, Math.PI * 2);
    ctx.strokeStyle = rg.col;
    ctx.lineWidth = rg.w;
    ctx.stroke();
  }

  // 8-Pointed Moroccan Star Medallion in the center of the Ronda!
  ctx.save();
  ctx.translate(cx, cy);
  for (let k = 0; k < 2; k++) {
    ctx.rotate((k * Math.PI) / 4);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 6;
    ctx.strokeRect(-75, -75, 150, 150);
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRallyCurbTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;

  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#ef4444" : "#f8fafc";
    ctx.fillRect(i * 32, 0, 32, 64);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBoostRampTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, 256, 256);

  // Glowing neon cyan & gold turbo chevrons
  ctx.lineWidth = 18;
  for (let y = 32; y < 256; y += 64) {
    ctx.strokeStyle = y % 128 === 32 ? "#22d3ee" : "#fbbf24";
    ctx.beginPath();
    ctx.moveTo(28, y + 36);
    ctx.lineTo(128, y - 12);
    ctx.lineTo(228, y + 36);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function getKsidaMaterials(): KsidaMaterialSet {
  if (cachedMaterials) return cachedMaterials;

  const asphaltTex = createAsphaltTexture();
  const zelligeTex = createRondaZelligeTexture();
  const curbTex = createRallyCurbTexture();
  const boostTex = createBoostRampTexture();

  cachedMaterials = {
    asphaltMat: new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.72,
      metalness: 0.08,
    }),
    rondaZelligeMat: new THREE.MeshStandardMaterial({
      map: zelligeTex,
      roughness: 0.58,
      metalness: 0.14,
    }),
    curbMat: new THREE.MeshStandardMaterial({
      map: curbTex,
      roughness: 0.5,
      metalness: 0.1,
    }),
    boostRampMat: new THREE.MeshStandardMaterial({
      map: boostTex,
      emissive: new THREE.Color(0x0891b2),
      emissiveMap: boostTex,
      emissiveIntensity: 0.65,
      roughness: 0.35,
      metalness: 0.3,
    }),
    boostTex,
    sandTerrainMat: new THREE.MeshStandardMaterial({
      color: 0xe6be8a, // Warm Moroccan Coastal Sand & Ochre Earth
      roughness: 0.92,
      metalness: 0.02,
    }),
  };

  return cachedMaterials;
}

export function animateKsidaMaterials(dt: number) {
  if (!cachedMaterials) return;
  cachedMaterials.boostTex.offset.y -= dt * 1.8;
}
