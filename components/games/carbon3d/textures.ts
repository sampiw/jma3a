import * as THREE from "three";

export interface CarbonMaterialLibrary {
  arenaFloor: THREE.MeshStandardMaterial;
  sandstoneWall: THREE.MeshStandardMaterial;
  sandstoneTrim: THREE.MeshStandardMaterial;
  supplyCrate: THREE.MeshStandardMaterial;
  stadiumPerimeter: THREE.MeshStandardMaterial;
  weaponDark: THREE.MeshStandardMaterial;
  weaponLight: THREE.MeshStandardMaterial;
}

let cachedLibrary: CarbonMaterialLibrary | null = null;

function makeCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

/**
 * 1. Full-Stadium Bright Sunlit Sandstone & Painted Champion Court Texture (1024x1024)
 * Matte roughness (0.88) and ultra-low metalness (0.03) eliminate mobile specular glare
 * and give 100% crystal-clear silhouette contrast for Emerald, Blue, and Coral heroes!
 */
function createChampionCourtMaterial(): THREE.MeshStandardMaterial {
  const size = 1024;
  const canvas = makeCanvas(size, size);
  if (!canvas) {
    return new THREE.MeshStandardMaterial({ color: 0xf3e7ce, roughness: 0.88, metalness: 0.03 });
  }
  const ctx = canvas.getContext("2d")!;

  // Base warm sunlit sandstone court
  ctx.fillStyle = "#f4ead4";
  ctx.fillRect(0, 0, size, size);

  // Subtle alternating athletic court bands (like Brawl Ball / Overwatch Summer Stadium)
  const stripes = 10;
  const stripeH = size / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#f6eedb" : "#ede0c5";
    ctx.fillRect(0, i * stripeH, size, stripeH);
  }

  // Soft large stone tile grid (clean low-contrast lines, zero pixel static)
  ctx.strokeStyle = "rgba(180, 155, 118, 0.22)";
  ctx.lineWidth = 2;
  const step = size / 16;
  for (let i = 1; i < 16; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Outer stadium border track (terracotta-sand warm apron)
  const pad = 54;
  ctx.strokeStyle = "#e2cfb0";
  ctx.lineWidth = 36;
  ctx.strokeRect(pad, pad, size - pad * 2, size - pad * 2);

  // Crisp painted white stadium boundary line
  const linePad = 76;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.88)";
  ctx.lineWidth = 7;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.roundRect(linePad, linePad, size - linePad * 2, size - linePad * 2, 72);
  ctx.stroke();

  // Midfield painted white line
  ctx.beginPath();
  ctx.moveTo(linePad, size / 2);
  ctx.lineTo(size - linePad, size / 2);
  ctx.stroke();

  // North Spawn Team Zone Arc (Sky Cyan)
  ctx.strokeStyle = "rgba(14, 165, 233, 0.55)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(size / 2, linePad, 165, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.stroke();

  // South Spawn Team Zone Arc (Coral Red)
  ctx.strokeStyle = "rgba(239, 68, 68, 0.55)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(size / 2, size - linePad, 165, 1.12 * Math.PI, 1.88 * Math.PI);
  ctx.stroke();

  // Central Champion Medallion Ring
  const cx = size / 2;
  const cy = size / 2;
  ctx.fillStyle = "#e8dac0";
  ctx.beginPath();
  ctx.arc(cx, cy, 126, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, 126, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, 92, 0, Math.PI * 2);
  ctx.stroke();

  // 8-point geometric sun star in center medallion
  ctx.fillStyle = "rgba(245, 158, 11, 0.24)";
  for (let r = 0; r < 2; r++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((r * Math.PI) / 4);
    ctx.fillRect(-42, -42, 84, 84);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;

  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.88,
    metalness: 0.03,
  });
}

/**
 * 2. Smooth Stylized Sandstone Cover Wall Material (Warm Cream Stone + Terracotta Cap)
 */
function createSandstoneWallMaterial(): THREE.MeshStandardMaterial {
  const size = 256;
  const canvas = makeCanvas(size, size);
  if (!canvas) {
    return new THREE.MeshStandardMaterial({ color: 0xfff7ed, roughness: 0.82, metalness: 0.04 });
  }
  const ctx = canvas.getContext("2d")!;

  // Warm limestone gradient
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, "#fffbeb");
  grad.addColorStop(0.75, "#f5e6ca");
  grad.addColorStop(1, "#e5cfa8");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Clean architectural recessed panel
  ctx.strokeStyle = "rgba(180, 140, 95, 0.35)";
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 36, size - 36, size - 64);

  // Terracotta top accent stripe
  ctx.fillStyle = "#ea580c";
  ctx.fillRect(0, 0, size, 24);
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(0, 24, size, 6);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.82,
    metalness: 0.04,
  });
}

/**
 * 3. Vibrant Stylized Supply Crate Material (Cobalt Blue + Solar Gold Brackets)
 */
function createSupplyCrateMaterial(): THREE.MeshStandardMaterial {
  const size = 256;
  const canvas = makeCanvas(size, size);
  if (!canvas) {
    return new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.65, metalness: 0.1 });
  }
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#2563eb";
  ctx.fillRect(0, 0, size, size);

  // Inner recessed panel
  ctx.fillStyle = "#1d4ed8";
  ctx.beginPath();
  ctx.roundRect(22, 22, size - 44, size - 44, 18);
  ctx.fill();

  // Crisp diagonal reinforcement bar
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(34, 34);
  ctx.lineTo(size - 34, size - 34);
  ctx.stroke();

  // Bright Gold outer frame & corner bumpers
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, size - 14, size - 14);

  ctx.fillStyle = "#fef08a";
  for (const [cx, cy] of [
    [22, 22],
    [size - 22, 22],
    [22, size - 22],
    [size - 22, size - 22],
  ]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.62,
    metalness: 0.1,
  });
}

export function getCarbonPBRMaterials(): CarbonMaterialLibrary {
  if (cachedLibrary) return cachedLibrary;

  cachedLibrary = {
    arenaFloor: createChampionCourtMaterial(),
    sandstoneWall: createSandstoneWallMaterial(),
    sandstoneTrim: new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.55,
      metalness: 0.08,
    }),
    supplyCrate: createSupplyCrateMaterial(),
    stadiumPerimeter: new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.72,
      metalness: 0.06,
    }),
    weaponDark: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.22,
    }),
    weaponLight: new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.36,
      metalness: 0.15,
    }),
  };

  return cachedLibrary;
}
