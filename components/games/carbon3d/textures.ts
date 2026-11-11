import * as THREE from "three";

export interface CarbonMaterialLibrary {
  coastalGround: THREE.MeshStandardMaterial;
  asphaltRoad: THREE.MeshStandardMaterial;
  helipadDeck: THREE.MeshStandardMaterial;
  dockConcrete: THREE.MeshStandardMaterial;
  kasbahBrick: THREE.MeshStandardMaterial;
  kasbahTrim: THREE.MeshStandardMaterial;
  hardwoodCrate: THREE.MeshStandardMaterial;
  containerRed: THREE.MeshStandardMaterial;
  containerBlue: THREE.MeshStandardMaterial;
  containerOlive: THREE.MeshStandardMaterial;
  sandbag: THREE.MeshStandardMaterial;
  concreteBarrier: THREE.MeshStandardMaterial;
  oceanWater: THREE.MeshStandardMaterial;
  seawall: THREE.MeshStandardMaterial;
  explosiveBarrelRed: THREE.MeshStandardMaterial;
  hazardStripe: THREE.MeshStandardMaterial;
  weaponDark: THREE.MeshStandardMaterial;
  weaponSteel: THREE.MeshStandardMaterial;
  weaponTan: THREE.MeshStandardMaterial;
}

let cachedLibrary: CarbonMaterialLibrary | null = null;
let waterNormalTexRef: THREE.Texture | null = null;

function makeCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

function loadRepeatTex(
  loader: THREE.TextureLoader,
  url: string,
  repX: number,
  repY: number,
  isColor: boolean
): THREE.Texture {
  const tex = loader.load(url);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repX, repY);
  tex.anisotropy = 8;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  return tex;
}

/**
 * High-res 1024x1024 Concrete Helipad Deck ("H" + Yellow Hazard Circle + Expansion Joints)
 */
function createHelipadDeckMaterial(): THREE.MeshStandardMaterial {
  const size = 1024;
  const canvas = makeCanvas(size, size);
  if (!canvas) {
    return new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.78, metalness: 0.08 });
  }
  const ctx = canvas.getContext("2d")!;

  // Brushed tactical concrete slab
  ctx.fillStyle = "#576371";
  ctx.fillRect(0, 0, size, size);

  // Subtle concrete aggregate & surface variation
  for (let i = 0; i < 4200; i++) {
    const x = (i * 197) % size;
    const y = (i * 353) % size;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.035)" : "rgba(15,23,42,0.05)";
    ctx.fillRect(x, y, 4, 4);
  }

  // Concrete slab expansion grid
  ctx.strokeStyle = "rgba(15, 23, 42, 0.38)";
  ctx.lineWidth = 4;
  const step = size / 6;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }

  // Outer yellow-black safety hazard border
  const pad = 28;
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 22;
  ctx.strokeRect(pad, pad, size - pad * 2, size - pad * 2);

  // Helipad circular ring
  const cx = size / 2;
  const cy = size / 2;
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.arc(cx, cy, 290, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 10;
  ctx.setLineDash([36, 22]);
  ctx.beginPath();
  ctx.arc(cx, cy, 336, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Crisp White Helipad "H"
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(cx - 125, cy - 150, 44, 300);
  ctx.fillRect(cx + 81, cy - 150, 44, 300);
  ctx.fillRect(cx - 125, cy - 22, 250, 44);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;

  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.78,
    metalness: 0.08,
  });
}

/**
 * Tiled Tactical Asphalt Roadway Material
 */
function createAsphaltRoadMaterial(): THREE.MeshStandardMaterial {
  const size = 512;
  const canvas = makeCanvas(size, size);
  if (!canvas) {
    return new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.86, metalness: 0.05 });
  }
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#3a4350";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 3000; i++) {
    const x = (i * 89) % size;
    const y = (i * 233) % size;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
    ctx.fillRect(x, y, 3, 3);
  }

  // Edge shoulder lines + center dashed tactical lane line
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(14, 0, 8, size);
  ctx.fillRect(size - 22, 0, 8, size);

  ctx.fillStyle = "#f59e0b";
  for (let y = 16; y < size; y += 64) {
    ctx.fillRect(size / 2 - 5, y, 10, 34);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.86,
    metalness: 0.05,
  });
}

/**
 * Corrugated ISO Steel Shipping Container Material with Bump Ribs & Military Stencils
 */
function createShippingContainerMaterial(
  baseHex: string,
  darkHex: string,
  codeText: string
): THREE.MeshStandardMaterial {
  const w = 512;
  const h = 256;
  const canvas = makeCanvas(w, h);
  const bumpCanvas = makeCanvas(w, h);
  if (!canvas || !bumpCanvas) {
    return new THREE.MeshStandardMaterial({ color: baseHex, roughness: 0.52, metalness: 0.45 });
  }

  const ctx = canvas.getContext("2d")!;
  const bctx = bumpCanvas.getContext("2d")!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, w, h);
  bctx.fillStyle = "#808080";
  bctx.fillRect(0, 0, w, h);

  // Vertical corrugated steel ribs
  const ribCount = 32;
  const ribW = w / ribCount;
  for (let i = 0; i < ribCount; i++) {
    const rx = i * ribW;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.16)";
    ctx.fillRect(rx + 2, 18, ribW * 0.55, h - 36);

    bctx.fillStyle = i % 2 === 0 ? "#d4d4d4" : "#3a3a3a";
    bctx.fillRect(rx, 18, ribW * 0.65, h - 36);
  }

  // Heavy steel top/bottom/corner ISO rails
  ctx.fillStyle = darkHex;
  ctx.fillRect(0, 0, w, 18);
  ctx.fillRect(0, h - 18, w, 18);
  ctx.fillRect(0, 0, 18, h);
  ctx.fillRect(w - 18, 0, 18, h);

  // Crisp Cargo Stencil Badge
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "bold 24px monospace";
  ctx.fillText(codeText, 36, 62);
  ctx.fillStyle = "#facc15";
  ctx.fillRect(36, 72, 92, 6);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);

  return new THREE.MeshStandardMaterial({
    map: tex,
    bumpMap: bumpTex,
    bumpScale: 0.045,
    roughness: 0.48,
    metalness: 0.42,
  });
}

/**
 * Woven Military Sandbag Bunker Material
 */
function createSandbagMaterial(): THREE.MeshStandardMaterial {
  const size = 256;
  const canvas = makeCanvas(size, size);
  if (!canvas) {
    return new THREE.MeshStandardMaterial({ color: 0xc2a878, roughness: 0.92, metalness: 0.02 });
  }
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#bfa372";
  ctx.fillRect(0, 0, size, size);

  const rows = 4;
  const cols = 3;
  const rh = size / rows;
  const cw = size / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (cw * 0.5);
    for (let c = -1; c <= cols; c++) {
      const bx = c * cw + offset;
      const by = r * rh;
      ctx.fillStyle = (r + c) % 2 === 0 ? "#cab082" : "#b39666";
      ctx.beginPath();
      ctx.roundRect(bx + 3, by + 3, cw - 6, rh - 6, 12);
      ctx.fill();

      ctx.strokeStyle = "rgba(72, 54, 28, 0.45)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.colorSpace = THREE.SRGBColorSpace;

  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.92,
    metalness: 0.02,
  });
}

/**
 * Reinforced Concrete Blast Wall with Yellow/Black Hazard Base
 */
function createConcreteBarrierMaterial(): THREE.MeshStandardMaterial {
  const size = 256;
  const canvas = makeCanvas(size, size);
  if (!canvas) {
    return new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85, metalness: 0.06 });
  }
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, "#cbd5e1");
  grad.addColorStop(0.82, "#94a3b8");
  grad.addColorStop(1, "#64748b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Diagonal hazard stripes along bottom base
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, size - 36, size, 36);
  ctx.clip();
  ctx.fillStyle = "#facc15";
  ctx.fillRect(0, size - 36, size, 36);
  ctx.fillStyle = "#0f172a";
  for (let x = -size; x < size * 2; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, size);
    ctx.lineTo(x + 18, size);
    ctx.lineTo(x + 36, size - 36);
    ctx.lineTo(x + 18, size - 36);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.82,
    metalness: 0.08,
  });
}

function createHazardStripeMaterial(): THREE.MeshStandardMaterial {
  const size = 128;
  const canvas = makeCanvas(size, size);
  if (!canvas) {
    return new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 });
  }
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#facc15";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#111827";
  for (let x = -size; x < size * 2; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, size);
    ctx.lineTo(x + 16, size);
    ctx.lineTo(x + 48, 0);
    ctx.lineTo(x + 32, 0);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.25 });
}

export function getCarbonPBRMaterials(): CarbonMaterialLibrary {
  if (cachedLibrary) return cachedLibrary;

  const hasDom = typeof window !== "undefined";
  const loader = hasDom ? new THREE.TextureLoader() : null;

  let coastalGround: THREE.MeshStandardMaterial;
  let kasbahBrick: THREE.MeshStandardMaterial;
  let hardwoodCrate: THREE.MeshStandardMaterial;
  let oceanWater: THREE.MeshStandardMaterial;

  if (loader) {
    // 1. Photographic Coastal Grass/Dirt Island Terrain
    const grassMap = loadRepeatTex(loader, "/textures/shooter/grasslight-big.jpg", 18, 18, true);
    coastalGround = new THREE.MeshStandardMaterial({
      map: grassMap,
      color: 0xd9d2b6, // Sun-baked Mediterranean coastal scrubland tint
      roughness: 0.92,
      metalness: 0.02,
    });

    // 2. Photographic Multi-Map Brick/Masonry Kasbah Fortress
    const brickDiff = loadRepeatTex(loader, "/textures/shooter/brick_diffuse.jpg", 2.5, 1.5, true);
    const brickBump = loadRepeatTex(loader, "/textures/shooter/brick_bump.jpg", 2.5, 1.5, false);
    const brickRough = loadRepeatTex(
      loader,
      "/textures/shooter/brick_roughness.jpg",
      2.5,
      1.5,
      false
    );
    kasbahBrick = new THREE.MeshStandardMaterial({
      map: brickDiff,
      bumpMap: brickBump,
      bumpScale: 0.045,
      roughnessMap: brickRough,
      color: 0xe7d3b5,
      roughness: 0.88,
      metalness: 0.04,
    });

    // 3. Photographic Multi-Map Hardwood Supply Crates & Pier Planks
    const woodDiff = loadRepeatTex(loader, "/textures/shooter/hardwood2_diffuse.jpg", 1.5, 1.5, true);
    const woodBump = loadRepeatTex(loader, "/textures/shooter/hardwood2_bump.jpg", 1.5, 1.5, false);
    const woodRough = loadRepeatTex(
      loader,
      "/textures/shooter/hardwood2_roughness.jpg",
      1.5,
      1.5,
      false
    );
    hardwoodCrate = new THREE.MeshStandardMaterial({
      map: woodDiff,
      bumpMap: woodBump,
      bumpScale: 0.03,
      roughnessMap: woodRough,
      roughness: 0.76,
      metalness: 0.06,
    });

    // 4. Photographic Normal-Mapped Mediterranean Ocean
    const waterNormals = loadRepeatTex(
      loader,
      "/textures/shooter/waternormals.jpg",
      32,
      32,
      false
    );
    waterNormalTexRef = waterNormals;
    oceanWater = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      normalMap: waterNormals,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.16,
      metalness: 0.35,
    });
  } else {
    coastalGround = new THREE.MeshStandardMaterial({ color: 0xc8be9e, roughness: 0.9 });
    kasbahBrick = new THREE.MeshStandardMaterial({ color: 0xc29b75, roughness: 0.88 });
    hardwoodCrate = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.78 });
    oceanWater = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2 });
  }

  cachedLibrary = {
    coastalGround,
    asphaltRoad: createAsphaltRoadMaterial(),
    helipadDeck: createHelipadDeckMaterial(),
    dockConcrete: new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.82,
      metalness: 0.08,
    }),
    kasbahBrick,
    kasbahTrim: new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.72,
      metalness: 0.06,
    }),
    hardwoodCrate,
    containerRed: createShippingContainerMaterial("#b91c1c", "#7f1d1d", "ATLAS-01"),
    containerBlue: createShippingContainerMaterial("#1d4ed8", "#1e3a8a", "TANGER-04"),
    containerOlive: createShippingContainerMaterial("#3f6212", "#365314", "SPECOPS-7"),
    sandbag: createSandbagMaterial(),
    concreteBarrier: createConcreteBarrierMaterial(),
    oceanWater,
    seawall: new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.86,
      metalness: 0.1,
    }),
    explosiveBarrelRed: new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0x450a0a,
      emissiveIntensity: 0.25,
      roughness: 0.38,
      metalness: 0.52,
    }),
    hazardStripe: createHazardStripeMaterial(),
    weaponDark: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.68,
    }),
    weaponSteel: new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.32,
      metalness: 0.82,
    }),
    weaponTan: new THREE.MeshStandardMaterial({
      color: 0xa18868,
      roughness: 0.58,
      metalness: 0.22,
    }),
  };

  return cachedLibrary;
}

export function animateCarbonMaterials(elapsedSec: number): void {
  if (waterNormalTexRef) {
    waterNormalTexRef.offset.x = (elapsedSec * 0.035) % 1;
    waterNormalTexRef.offset.y = (elapsedSec * 0.024) % 1;
  }
}
