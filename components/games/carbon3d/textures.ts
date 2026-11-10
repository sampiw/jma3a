import * as THREE from "three";

export interface CarbonPBRMaterialLibrary {
  carbonFiber: THREE.MeshStandardMaterial;
  titaniumLight: THREE.MeshStandardMaterial;
  titaniumDark: THREE.MeshStandardMaterial;
  arenaFloor: THREE.MeshStandardMaterial;
  coreDeck: THREE.MeshStandardMaterial;
  rampTread: THREE.MeshStandardMaterial;
}

let cachedLibrary: CarbonPBRMaterialLibrary | null = null;

/**
 * Converts a 2D scalar heightfield [0..1] into a crisp tangent-space RGB normal map DataTexture
 * using a wrapped 3x3 Sobel gradient operator so seamless tiled textures never show border seams.
 */
function buildNormalMapFromHeight(
  height: Float32Array,
  size: number,
  strength: number,
  repeatX = 1,
  repeatY = 1
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const sample = (x: number, y: number) => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return height[wy * size + wx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dX = tr + 2 * r + br - (tl + 2 * l + bl);
      const dY = bl + 2 * b + br - (tl + 2 * t + tr);

      let nx = -dX * strength;
      let ny = -dY * strength;
      let nz = 1.0;
      const invLen = 1.0 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

function buildGrayDataTexture(
  values: Float32Array,
  size: number,
  repeatX = 1,
  repeatY = 1
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, Math.round(values[i] * 255)));
    const idx = i * 4;
    data[idx] = v;
    data[idx + 1] = v;
    data[idx + 2] = v;
    data[idx + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

function buildRGBADataTexture(
  rgba: Uint8Array,
  size: number,
  srgb: boolean,
  repeatX = 1,
  repeatY = 1
): THREE.DataTexture {
  const tex = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

/** 1. Anodized 2x2 Twill Carbon-Fiber Weave PBR Set */
function createCarbonWeaveMaterial(): THREE.MeshStandardMaterial {
  const size = 128;
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const rgba = new Uint8Array(size * size * 4);

  const cell = 8; // 8px per fiber tow
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tx = Math.floor(x / cell);
      const ty = Math.floor(y / cell);
      const lx = (x % cell) / cell;
      const ly = (y % cell) / cell;

      // 2x2 twill pattern: diagonal alternating warp & weft fibers
      const phase = (tx + ty) % 4;
      const isHorizontalTow = phase < 2;

      const profile = isHorizontalTow
        ? Math.sin(ly * Math.PI) * (0.85 + 0.15 * Math.sin(lx * Math.PI * 2))
        : Math.sin(lx * Math.PI) * (0.85 + 0.15 * Math.sin(ly * Math.PI * 2));

      const i = y * size + x;
      height[i] = profile;
      rough[i] = isHorizontalTow ? 0.24 + (1 - profile) * 0.28 : 0.34 + (1 - profile) * 0.25;

      const shade = (isHorizontalTow ? 26 : 19) + Math.round(profile * 26);
      const blueTint = Math.round(shade * 1.18);
      const idx = i * 4;
      rgba[idx] = shade;
      rgba[idx + 1] = Math.round(shade * 1.06);
      rgba[idx + 2] = blueTint;
      rgba[idx + 3] = 255;
    }
  }

  return new THREE.MeshStandardMaterial({
    map: buildRGBADataTexture(rgba, size, true, 3, 3),
    normalMap: buildNormalMapFromHeight(height, size, 1.85, 3, 3),
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: buildGrayDataTexture(rough, size, 3, 3),
    roughness: 0.9,
    metalness: 0.68,
  });
}

/** 2. Specular Hexagonal Basalt & Glowing Conduit Arena Floor */
function createArenaHexFloorMaterial(): THREE.MeshStandardMaterial {
  const size = 256;
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const rgba = new Uint8Array(size * size * 4);
  const emissive = new Uint8Array(size * size * 4);

  // Seamless hex distance helper on scaled UV grid
  const hexScaleX = 6.0;
  const hexScaleY = 6.0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * hexScaleX;
      const v = (y / size) * hexScaleY;

      // Rectangular-tiled sci-fi hex-tech grid (strictly periodic in [0..size])
      const gx = u - Math.floor(u) - 0.5;
      const gy = v - Math.floor(v) - 0.5;
      const chamferDist = Math.max(Math.abs(gx), Math.abs(gy), (Math.abs(gx) + Math.abs(gy)) * 0.74);

      const seam = chamferDist > 0.445;
      const bevel = chamferDist > 0.405 && !seam;
      const innerCircuit = Math.abs(chamferDist - 0.26) < 0.016 && ((Math.floor(u) + Math.floor(v)) % 3 === 0);

      // Subtle micro-grain so stone tiles never look flat plastic
      const grain = (((x * 73856093) ^ (y * 19349663)) & 255) / 255;

      const i = y * size + x;
      const idx = i * 4;

      if (seam) {
        height[i] = 0.12;
        rough[i] = 0.16; // glossy recessed channel
        rgba[idx] = 10;
        rgba[idx + 1] = 22;
        rgba[idx + 2] = 34;
        rgba[idx + 3] = 255;

        emissive[idx] = 8;
        emissive[idx + 1] = 72;
        emissive[idx + 2] = 96;
        emissive[idx + 3] = 255;
      } else if (bevel) {
        height[i] = 0.65;
        rough[i] = 0.24; // polished metallic rim
        rgba[idx] = 44;
        rgba[idx + 1] = 56;
        rgba[idx + 2] = 74;
        rgba[idx + 3] = 255;

        emissive[idx] = 0;
        emissive[idx + 1] = 0;
        emissive[idx + 2] = 0;
        emissive[idx + 3] = 255;
      } else {
        height[i] = 0.92 + grain * 0.08;
        rough[i] = 0.62 + grain * 0.16;
        const base = 22 + Math.round(grain * 10);
        rgba[idx] = base;
        rgba[idx + 1] = base + 5;
        rgba[idx + 2] = base + 14;
        rgba[idx + 3] = 255;

        if (innerCircuit) {
          emissive[idx] = 18;
          emissive[idx + 1] = 155;
          emissive[idx + 2] = 195;
        } else {
          emissive[idx] = 0;
          emissive[idx + 1] = 0;
          emissive[idx + 2] = 0;
        }
        emissive[idx + 3] = 255;
      }
    }
  }

  return new THREE.MeshStandardMaterial({
    map: buildRGBADataTexture(rgba, size, true, 12, 12),
    normalMap: buildNormalMapFromHeight(height, size, 2.4, 12, 12),
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: buildGrayDataTexture(rough, size, 12, 12),
    emissiveMap: buildRGBADataTexture(emissive, size, true, 12, 12),
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.75,
    roughness: 0.95,
    metalness: 0.55,
  });
}

/** 3. Brushed Titanium Sci-Fi Bulkhead Panel Material (with bolts, seams & brushed grain) */
function createTitaniumBulkheadMaterial(brightVariant: boolean): THREE.MeshStandardMaterial {
  const size = 256;
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const rgba = new Uint8Array(size * size * 4);
  const emissive = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const brushStreak = (((y * 2654435761) >>> 16) & 255) / 255;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const idx = i * 4;

      const border = x < 5 || x >= size - 5 || y < 5 || y >= size - 5;
      const midRib = Math.abs(y - size / 2) < 3;
      const cautionBand = y > size - 26 && y < size - 10;
      const chevron = ((x + y) % 24) < 12;

      // Corner rivets
      const corners = [
        [18, 18],
        [size - 18, 18],
        [18, size - 34],
        [size - 18, size - 34],
      ];
      let isRivet = false;
      for (const [cx, cy] of corners) {
        if (Math.hypot(x - cx, y - cy) < 4.5) {
          isRivet = true;
          break;
        }
      }

      const glowStrip = Math.abs(y - 36) <= 2 && x > 28 && x < size - 28;

      if (border || midRib) {
        height[i] = 0.15;
        rough[i] = 0.45;
        rgba[idx] = 16;
        rgba[idx + 1] = 22;
        rgba[idx + 2] = 32;
      } else if (cautionBand) {
        height[i] = 0.78;
        rough[i] = 0.38;
        if (chevron) {
          rgba[idx] = 218;
          rgba[idx + 1] = 142;
          rgba[idx + 2] = 24;
        } else {
          rgba[idx] = 24;
          rgba[idx + 1] = 28;
          rgba[idx + 2] = 36;
        }
      } else if (isRivet) {
        height[i] = 1.0;
        rough[i] = 0.22;
        rgba[idx] = 115;
        rgba[idx + 1] = 132;
        rgba[idx + 2] = 152;
      } else {
        const base = brightVariant ? 66 : 36;
        const grain = Math.round(brushStreak * 14 + (((x * 17 + y * 31) & 15) - 7) * 0.4);
        height[i] = 0.72 + brushStreak * 0.08;
        rough[i] = (brightVariant ? 0.3 : 0.38) + brushStreak * 0.12;
        rgba[idx] = base + grain;
        rgba[idx + 1] = base + grain + 8;
        rgba[idx + 2] = base + grain + 20;
      }
      rgba[idx + 3] = 255;

      if (glowStrip) {
        emissive[idx] = 34;
        emissive[idx + 1] = 211;
        emissive[idx + 2] = 238;
      } else {
        emissive[idx] = 0;
        emissive[idx + 1] = 0;
        emissive[idx + 2] = 0;
      }
      emissive[idx + 3] = 255;
    }
  }

  return new THREE.MeshStandardMaterial({
    map: buildRGBADataTexture(rgba, size, true, 2, 1),
    normalMap: buildNormalMapFromHeight(height, size, 2.2, 2, 1),
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: buildGrayDataTexture(rough, size, 2, 1),
    emissiveMap: buildRGBADataTexture(emissive, size, true, 2, 1),
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.9,
    roughness: 0.85,
    metalness: 0.72,
  });
}

/** 4. High-Traction Metallic Chevron Ramp & Overlook Deck Material */
function createRampTreadMaterial(): THREE.MeshStandardMaterial {
  const size = 128;
  const height = new Float32Array(size * size);
  const rgba = new Uint8Array(size * size * 4);
  const emissive = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const idx = i * 4;
      const edgeRail = x < 8 || x >= size - 8;
      const edgeGlow = (x >= 8 && x < 12) || (x >= size - 12 && x < size - 8);
      const cx = Math.abs(x - size / 2);
      const tread = ((y + Math.floor(cx * 0.65)) % 16) < 5;

      if (edgeRail) {
        height[i] = 0.95;
        rgba[idx] = 58;
        rgba[idx + 1] = 68;
        rgba[idx + 2] = 84;
      } else if (tread) {
        height[i] = 0.85;
        rgba[idx] = 48;
        rgba[idx + 1] = 58;
        rgba[idx + 2] = 74;
      } else {
        height[i] = 0.35;
        rgba[idx] = 24;
        rgba[idx + 1] = 30;
        rgba[idx + 2] = 42;
      }
      rgba[idx + 3] = 255;

      if (edgeGlow) {
        emissive[idx] = 34;
        emissive[idx + 1] = 211;
        emissive[idx + 2] = 238;
      }
      emissive[idx + 3] = 255;
    }
  }

  return new THREE.MeshStandardMaterial({
    map: buildRGBADataTexture(rgba, size, true, 1, 2),
    normalMap: buildNormalMapFromHeight(height, size, 2.0, 1, 2),
    emissiveMap: buildRGBADataTexture(emissive, size, true, 1, 2),
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.85,
    roughness: 0.38,
    metalness: 0.74,
  });
}

export function getCarbonPBRMaterials(): CarbonPBRMaterialLibrary {
  if (cachedLibrary) return cachedLibrary;

  const carbonFiber = createCarbonWeaveMaterial();
  const titaniumLight = createTitaniumBulkheadMaterial(true);
  const titaniumDark = createTitaniumBulkheadMaterial(false);
  const arenaFloor = createArenaHexFloorMaterial();
  const rampTread = createRampTreadMaterial();

  const coreDeck = titaniumLight.clone();
  coreDeck.metalness = 0.78;
  coreDeck.roughness = 0.28;

  cachedLibrary = {
    carbonFiber,
    titaniumLight,
    titaniumDark,
    arenaFloor,
    coreDeck,
    rampTread,
  };
  return cachedLibrary;
}
