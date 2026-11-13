import * as THREE from "three";

export interface KsidaMaterialSet {
  asphaltMat: THREE.MeshStandardMaterial;
  rondaZelligeMat: THREE.MeshStandardMaterial;
  curbMat: THREE.MeshStandardMaterial;
  jerseyBarrierMat: THREE.MeshStandardMaterial;
  boostRampMat: THREE.MeshStandardMaterial;
  turboPadMat: THREE.MeshStandardMaterial;
  boostTex: THREE.CanvasTexture;
  turboPadTex: THREE.CanvasTexture;
  sandTerrainMat: THREE.MeshStandardMaterial;
  oasisGrassMat: THREE.MeshStandardMaterial;
  kasbahBrickMat: THREE.MeshStandardMaterial;
  pierWoodMat: THREE.MeshStandardMaterial;
  checkeredBannerMat: THREE.MeshStandardMaterial;
  containerRedMat: THREE.MeshStandardMaterial;
  containerBlueMat: THREE.MeshStandardMaterial;
  containerGreenMat: THREE.MeshStandardMaterial;
}

let cachedMaterials: KsidaMaterialSet | null = null;
let sharedTexLoader: THREE.TextureLoader | null = null;

function loadRepeatingPhotoTex(
  url: string,
  repX: number,
  repY: number,
  isColor: boolean
): THREE.Texture {
  if (!sharedTexLoader) sharedTexLoader = new THREE.TextureLoader();
  const tex = sharedTexLoader.load(url);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repX, repY);
  tex.anisotropy = 8;
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

/**
 * Builds a high-res 1024x1024 4-Lane Highway Asphalt PBR set:
 * - Diffuse map (rich tarmac aggregate, dual tire-wear grooves, amber shoulders, lane dashes)
 * - Bump map (mineral aggregate micro-relief)
 * - Roughness map (polished rubber tire tracks vs matte shoulders & reflective paint)
 */
function createHighwayAsphaltPbrMaps(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const W = 1024;
  const H = 1024;

  const diffC = document.createElement("canvas");
  diffC.width = W;
  diffC.height = H;
  const dCtx = diffC.getContext("2d")!;

  const bumpC = document.createElement("canvas");
  bumpC.width = 512;
  bumpC.height = 512;
  const bCtx = bumpC.getContext("2d")!;

  const roughC = document.createElement("canvas");
  roughC.width = 512;
  roughC.height = 512;
  const rCtx = roughC.getContext("2d")!;

  // Base tarmac coat
  dCtx.fillStyle = "#1c222d";
  dCtx.fillRect(0, 0, W, H);

  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, 512, 512);

  rCtx.fillStyle = "#c8c8c8"; // ~0.78 roughness default
  rCtx.fillRect(0, 0, 512, 512);

  // Dual polished darker racing tire grooves per side!
  for (const laneCenterX of [270, 754]) {
    for (const wheelOff of [-68, 68]) {
      const gx = laneCenterX + wheelOff;
      const grad = dCtx.createLinearGradient(gx - 46, 0, gx + 46, 0);
      grad.addColorStop(0, "rgba(10,13,18,0)");
      grad.addColorStop(0.5, "rgba(10,13,18,0.42)");
      grad.addColorStop(1, "rgba(10,13,18,0)");
      dCtx.fillStyle = grad;
      dCtx.fillRect(gx - 46, 0, 92, H);

      // Smoother rubber sheen in roughnessMap
      const rGrad = rCtx.createLinearGradient((gx - 46) * 0.5, 0, (gx + 46) * 0.5, 0);
      rGrad.addColorStop(0, "rgba(120,120,120,0)");
      rGrad.addColorStop(0.5, "rgba(115,115,115,0.65)");
      rGrad.addColorStop(1, "rgba(120,120,120,0)");
      rCtx.fillStyle = rGrad;
      rCtx.fillRect((gx - 46) * 0.5, 0, 46, 512);
    }
  }

  // Realistic crushed-stone mineral aggregate speckle
  for (let i = 0; i < 24000; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const v = 20 + Math.floor(Math.random() * 38);
    dCtx.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
    const sz = Math.random() < 0.25 ? 3 : 2;
    dCtx.fillRect(x, y, sz, sz);

    const bv = 90 + Math.floor(Math.random() * 90);
    bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bCtx.fillRect(x * 0.5, y * 0.5, 2, 2);
  }

  // Subtle longitudinal asphalt roller seams
  dCtx.strokeStyle = "rgba(12, 15, 22, 0.35)";
  dCtx.lineWidth = 3;
  for (const sx of [256, 512, 768]) {
    dCtx.beginPath();
    dCtx.moveTo(sx, 0);
    dCtx.lineTo(sx, H);
    dCtx.stroke();
  }

  // Outer Saffron-Amber Highway Edge Lines + Rumble Strips
  dCtx.fillStyle = "#f59e0b";
  dCtx.fillRect(24, 0, 16, H);
  dCtx.fillRect(W - 40, 0, 16, H);

  for (let y = 0; y < H; y += 32) {
    dCtx.fillStyle = y % 64 === 0 ? "#ef4444" : "#f8fafc";
    dCtx.fillRect(4, y, 14, 24);
    dCtx.fillRect(W - 18, y, 14, 24);
    bCtx.fillStyle = "#ffffff";
    bCtx.fillRect(2, y * 0.5, 8, 12);
    bCtx.fillRect(502, y * 0.5, 8, 12);
  }

  // Double-Amber Center Median Line + Crisp White Lane Dashes
  dCtx.fillStyle = "#fbbf24";
  dCtx.fillRect(498, 0, 10, H);
  dCtx.fillRect(516, 0, 10, H);

  dCtx.fillStyle = "#f8fafc";
  rCtx.fillStyle = "#787878";
  for (let y = 36; y < H; y += 160) {
    dCtx.fillRect(262, y, 14, 88);
    dCtx.fillRect(748, y, 14, 88);
    rCtx.fillRect(131, y * 0.5, 7, 44);
    rCtx.fillRect(374, y * 0.5, 7, 44);
  }

  const map = new THREE.CanvasTexture(diffC);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(bumpC);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  const roughnessMap = new THREE.CanvasTexture(roughC);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap, roughnessMap };
}

function createRondaZelligePbr(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const S = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;

  const bumpC = document.createElement("canvas");
  bumpC.width = 512;
  bumpC.height = 512;
  const bCtx = bumpC.getContext("2d")!;

  ctx.fillStyle = "#19202c";
  ctx.fillRect(0, 0, S, S);
  bCtx.fillStyle = "#909090";
  bCtx.fillRect(0, 0, 512, 512);

  const cx = S / 2;
  const cy = S / 2;

  // Radial cobblestone & Zellige geometric rings
  for (let r = 90; r <= 490; r += 36) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = r % 72 === 18 ? "#0ea5e9" : "#334155";
    ctx.lineWidth = 4;
    ctx.stroke();

    bCtx.beginPath();
    bCtx.arc(256, 256, r * 0.5, 0, Math.PI * 2);
    bCtx.strokeStyle = "#404040";
    bCtx.lineWidth = 2;
    bCtx.stroke();
  }

  const rings = [
    { r: 486, col: "#f59e0b", w: 18 },
    { r: 410, col: "#0ea5e9", w: 12 },
    { r: 295, col: "#10b981", w: 14 },
    { r: 175, col: "#f43f5e", w: 14 },
  ];
  for (const rg of rings) {
    ctx.beginPath();
    ctx.arc(cx, cy, rg.r, 0, Math.PI * 2);
    ctx.strokeStyle = rg.col;
    ctx.lineWidth = rg.w;
    ctx.stroke();
  }

  // 16-Ray Moroccan Khatam Star Medallion
  ctx.save();
  ctx.translate(cx, cy);
  for (let k = 0; k < 4; k++) {
    ctx.rotate(Math.PI / 8);
    ctx.strokeStyle = k % 2 === 0 ? "#fbbf24" : "#2dd4bf";
    ctx.lineWidth = 10;
    ctx.strokeRect(-145, -145, 290, 290);
  }
  ctx.restore();

  const map = new THREE.CanvasTexture(canvas);
  map.anisotropy = 8;
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpC);
  return { map, bumpMap };
}

function createSandTerrainTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#dfb37c";
  ctx.fillRect(0, 0, 512, 512);

  // Wind-swept Moroccan coastal dune ripples & pebbles
  for (let y = 0; y < 512; y += 8) {
    ctx.fillStyle = y % 16 === 0 ? "rgba(255,235,200,0.18)" : "rgba(160,110,60,0.14)";
    ctx.fillRect(0, y, 512, 4);
  }
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,245,220,0.28)" : "rgba(135,92,48,0.28)";
    ctx.fillRect(x, y, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRallyCurbTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;

  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#dc2626" : "#f8fafc";
    ctx.fillRect(i * 32, 0, 32, 64);
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(i * 32, 52, 32, 12);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBoostChevronTexture(primaryHex: string, secondaryHex: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#090d16";
  ctx.fillRect(0, 0, 256, 256);

  // Glowing side rails
  ctx.fillStyle = primaryHex;
  ctx.fillRect(6, 0, 10, 256);
  ctx.fillRect(240, 0, 10, 256);

  ctx.lineWidth = 22;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let y = 32; y < 256; y += 64) {
    ctx.strokeStyle = y % 128 === 32 ? primaryHex : secondaryHex;
    ctx.beginPath();
    ctx.moveTo(32, y + 34);
    ctx.lineTo(128, y - 14);
    ctx.lineTo(224, y + 34);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createShippingContainerMaterial(
  baseColor: string,
  label: string
): THREE.MeshStandardMaterial {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 512, 256);

  // Corrugated steel vertical ribs
  for (let x = 0; x < 512; x += 16) {
    ctx.fillStyle = x % 32 === 0 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.22)";
    ctx.fillRect(x, 14, 8, 228);
  }

  // Heavy steel frame bars & hazard corner castings
  ctx.strokeStyle = "rgba(15,23,42,0.65)";
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, 500, 244);

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "900 40px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 256, 118);

  ctx.fillStyle = "#fbbf24";
  ctx.font = "800 20px monospace";
  ctx.fillText("MAROC CARGO • TANGER-MED ⚓", 256, 168);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  return new THREE.MeshStandardMaterial({
    map,
    roughness: 0.46,
    metalness: 0.48,
  });
}

function createCheckeredBannerMaterial(): THREE.MeshStandardMaterial {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 192;
  const ctx = c.getContext("2d")!;

  // Classic F1 checkered border + Moroccan Royal Gold banner
  const sq = 32;
  for (let y = 0; y < 192; y += sq) {
    for (let x = 0; x < 1024; x += sq) {
      ctx.fillStyle = ((x / sq + y / sq) & 1) === 0 ? "#0f172a" : "#f8fafc";
      ctx.fillRect(x, y, sq, sq);
    }
  }

  ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
  ctx.fillRect(150, 24, 724, 144);
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 8;
  ctx.strokeRect(150, 24, 724, 144);

  ctx.fillStyle = "#fbbf24";
  ctx.font = "900 54px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🏁 KSIDA ROYAL • كسيدة رويال 🏁", 512, 98);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    map: tex,
    emissive: new THREE.Color(0xfbbf24),
    emissiveIntensity: 0.18,
    roughness: 0.3,
    metalness: 0.25,
  });
}

export function getKsidaMaterials(): KsidaMaterialSet {
  if (cachedMaterials) return cachedMaterials;

  const asphalt = createHighwayAsphaltPbrMaps();
  const zellige = createRondaZelligePbr();
  const curbTex = createRallyCurbTexture();
  const boostTex = createBoostChevronTexture("#22d3ee", "#fbbf24");
  const turboPadTex = createBoostChevronTexture("#10b981", "#38bdf8");
  const sandTex = createSandTerrainTexture();

  // Real Multi-Map Photographic PBR Textures from /textures/shooter/!
  const brickDiff = loadRepeatingPhotoTex("/textures/shooter/brick_diffuse.jpg", 3, 2, true);
  const brickBump = loadRepeatingPhotoTex("/textures/shooter/brick_bump.jpg", 3, 2, false);
  const brickRough = loadRepeatingPhotoTex("/textures/shooter/brick_roughness.jpg", 3, 2, false);

  const woodDiff = loadRepeatingPhotoTex("/textures/shooter/hardwood2_diffuse.jpg", 4, 2, true);
  const woodBump = loadRepeatingPhotoTex("/textures/shooter/hardwood2_bump.jpg", 4, 2, false);
  const woodRough = loadRepeatingPhotoTex("/textures/shooter/hardwood2_roughness.jpg", 4, 2, false);

  const grassDiff = loadRepeatingPhotoTex("/textures/shooter/grasslight-big.jpg", 12, 12, true);

  cachedMaterials = {
    asphaltMat: new THREE.MeshStandardMaterial({
      map: asphalt.map,
      bumpMap: asphalt.bumpMap,
      bumpScale: 0.045,
      roughnessMap: asphalt.roughnessMap,
      roughness: 0.85,
      metalness: 0.08,
    }),
    rondaZelligeMat: new THREE.MeshStandardMaterial({
      map: zellige.map,
      bumpMap: zellige.bumpMap,
      bumpScale: 0.04,
      roughness: 0.52,
      metalness: 0.18,
    }),
    curbMat: new THREE.MeshStandardMaterial({
      map: curbTex,
      roughness: 0.48,
      metalness: 0.12,
    }),
    jerseyBarrierMat: new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      bumpMap: asphalt.bumpMap,
      bumpScale: 0.03,
      roughness: 0.82,
      metalness: 0.08,
    }),
    boostRampMat: new THREE.MeshStandardMaterial({
      map: boostTex,
      emissive: new THREE.Color(0x0891b2),
      emissiveMap: boostTex,
      emissiveIntensity: 0.72,
      roughness: 0.3,
      metalness: 0.35,
    }),
    turboPadMat: new THREE.MeshStandardMaterial({
      map: turboPadTex,
      emissive: new THREE.Color(0x10b981),
      emissiveMap: turboPadTex,
      emissiveIntensity: 0.95,
      roughness: 0.22,
      metalness: 0.4,
    }),
    boostTex,
    turboPadTex,
    sandTerrainMat: new THREE.MeshStandardMaterial({
      map: sandTex,
      bumpMap: sandTex,
      bumpScale: 0.08,
      roughness: 0.92,
      metalness: 0.02,
    }),
    oasisGrassMat: new THREE.MeshStandardMaterial({
      map: grassDiff,
      bumpMap: grassDiff,
      bumpScale: 0.05,
      roughness: 0.88,
      metalness: 0.02,
    }),
    kasbahBrickMat: new THREE.MeshStandardMaterial({
      map: brickDiff,
      bumpMap: brickBump,
      bumpScale: 0.12,
      roughnessMap: brickRough,
      roughness: 0.88,
      color: new THREE.Color(0xf2cbb0), // Warm Moroccan Terracotta Kasbah Brick
    }),
    pierWoodMat: new THREE.MeshStandardMaterial({
      map: woodDiff,
      bumpMap: woodBump,
      bumpScale: 0.06,
      roughnessMap: woodRough,
      roughness: 0.75,
    }),
    checkeredBannerMat: createCheckeredBannerMaterial(),
    containerRedMat: createShippingContainerMaterial("#b91c1c", "TANGER-MED"),
    containerBlueMat: createShippingContainerMaterial("#0369a1", "CASA-PORT"),
    containerGreenMat: createShippingContainerMaterial("#15803d", "ATLAS-LINE"),
  };

  return cachedMaterials;
}

export function animateKsidaMaterials(dt: number) {
  if (!cachedMaterials) return;
  cachedMaterials.boostTex.offset.y -= dt * 2.1;
  cachedMaterials.turboPadTex.offset.y -= dt * 3.2;
}
