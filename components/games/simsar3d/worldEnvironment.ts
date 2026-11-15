import * as THREE from "three";
import { SimsarTokenId } from "@/games/simsar3d/types";

/**
 * Golden-Hour Marrakech / Casablanca Sunset Sky Dome Shader
 */
export function createSimsarSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorldPos;

      void main() {
        vec3 dir = normalize(vWorldPos);
        float h = clamp(dir.y * 0.88 + 0.14, 0.0, 1.0);

        vec3 horizonCol = vec3(1.0, 0.62, 0.28);   // Golden Marrakech Sunset
        vec3 midSkyCol  = vec3(0.95, 0.38, 0.48);  // Warm Coral & Bougainvillea
        vec3 zenithCol  = vec3(0.05, 0.24, 0.58);  // Royal Majorelle Azure

        vec3 sky = mix(horizonCol, midSkyCol, smoothstep(0.0, 0.28, h));
        sky = mix(sky, zenithCol, smoothstep(0.24, 0.85, h));

        // Radiant Golden Sun Disc & Warm Atmospheric Halo
        vec3 sunDir = normalize(vec3(0.58, 0.30, -0.68));
        float sunDot = max(dot(dir, sunDir), 0.0);
        sky += vec3(1.15, 0.96, 0.65) * pow(sunDot, 72.0) * 1.4;
        sky += vec3(1.0, 0.64, 0.30) * pow(sunDot, 6.5) * 0.38;

        // Soft drifting sunset cloud bands
        float c1 = sin(dir.x * 8.0 + uTime * 0.06) * cos(dir.z * 6.0 - uTime * 0.04);
        float c2 = sin(dir.x * 16.0 - uTime * 0.09 + dir.z * 11.0) * 0.5;
        float band = smoothstep(0.08, 0.44, h) * (1.0 - smoothstep(0.48, 0.90, h));
        sky += vec3(1.0, 0.84, 0.68) * max(0.0, c1 + c2 * 0.5) * band * 0.16;

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
}

/**
 * Sparkling Turquoise Lagoon & Atlantic Surf Shader around the 25m Kasbah Island!
 */
export function createSimsarOceanMaterial(waterNormalTex: THREE.Texture): THREE.ShaderMaterial {
  waterNormalTex.wrapS = THREE.RepeatWrapping;
  waterNormalTex.wrapT = THREE.RepeatWrapping;

  return new THREE.ShaderMaterial({
    transparent: false,
    uniforms: {
      uTime: { value: 0 },
      uWaterNormals: { value: waterNormalTex },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      void main() {
        vec3 pos = position;
        float wave = sin(pos.x * 0.22 + uTime * 1.6) * cos(pos.y * 0.22 - uTime * 1.3) * 0.08;
        pos.z += wave;
        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform sampler2D uWaterNormals;
      varying vec3 vWorldPos;

      void main() {
        vec2 uv1 = vWorldPos.xz * 0.045 + vec2(uTime * 0.028, uTime * 0.020);
        vec2 uv2 = vWorldPos.xz * 0.078 - vec2(uTime * 0.022, -uTime * 0.031);

        vec3 n1 = texture2D(uWaterNormals, uv1).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uWaterNormals, uv2).xyz * 2.0 - 1.0;
        vec3 normal = normalize(vec3((n1.x + n2.x) * 0.85, 2.2, (n1.y + n2.y) * 0.85));

        vec3 sunDir = normalize(vec3(0.58, 0.42, -0.68));
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 halfVec = normalize(sunDir + viewDir);

        float fresnel = pow(1.0 - max(dot(viewDir, vec3(0.0, 1.0, 0.0)), 0.0), 3.2);
        float spec = pow(max(dot(normal, halfVec), 0.0), 96.0);

        // Rounded-square distance from the Kasbah island shore (~17.5m..22m)
        vec2 q = abs(vWorldPos.xz) - vec2(14.5, 14.5);
        float shoreDist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);

        float shallowLagoon = 1.0 - smoothstep(0.0, 16.0, shoreDist);

        vec3 deepOcean = vec3(0.02, 0.22, 0.46);
        vec3 turquoiseReef = vec3(0.06, 0.68, 0.74);
        vec3 col = mix(deepOcean, turquoiseReef, shallowLagoon * 0.92);
        col = mix(col, vec3(0.98, 0.62, 0.36), fresnel * 0.30);

        // Animated white surf foam rings lapping against the sandy island beach!
        float surfWave1 = sin(shoreDist * 1.65 - uTime * 2.8 + n1.x * 2.2);
        float surfMask1 = (1.0 - smoothstep(0.5, 6.2, shoreDist)) * smoothstep(-1.5, 0.8, shoreDist);
        col += vec3(0.95, 0.98, 1.0) * smoothstep(0.45, 0.92, surfWave1) * surfMask1 * 0.72;

        // Glittering golden sun diamonds on water ripples
        col += vec3(1.25, 0.95, 0.58) * spec * 1.65;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

const liveryCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Selectively recolors ONLY the saturated body paint pixels on a Kenney Car Kit UV colormap,
 * preserving crisp blue glass windows, headlights, taillights, dark tires, silver rims & baked AO!
 */
export function getCarLiveryMaterial(
  srcMat: THREE.MeshStandardMaterial,
  token: SimsarTokenId
): THREE.MeshStandardMaterial {
  const key = `${token}_${srcMat.uuid}`;
  if (liveryCache.has(key)) return liveryCache.get(key)!;

  if (token === "JADARMIYA" || token === "C15_KHATTAF") {
    const clean = srcMat.clone();
    clean.roughness = 0.28;
    clean.metalness = 0.24;
    liveryCache.set(key, clean);
    return clean;
  }

  const img: any = srcMat.map?.image;
  if (!img || !img.width || !img.height || typeof document === "undefined") {
    return srcMat;
  }

  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d");
  if (!ctx) return srcMat;

  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, c.width, c.height);
  const d = imgData.data;

  const targetRGB: [number, number, number] =
    token === "TAXI_HMER"
      ? [230, 28, 42] // Petit Taxi Crimson Red
      : token === "MERCEDES_240"
      ? [250, 234, 182] // Grand Taxi Ivory Gold
      : token === "WATERMELON_TRUCK"
      ? [22, 163, 74] // Souk Emerald Green
      : [168, 85, 247]; // VIP Royal Amethyst Purple

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC - minC;

    // Preserve tires, black bumpers, white stripes, silver rims, and cyan/blue window glass!
    const isWindowGlass = b > r + 18 && b > 108;
    if (sat < 50 || maxC < 82 || isWindowGlass) continue;

    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 210;
    const shade = Math.max(0.46, Math.min(1.2, lum));
    d[i] = Math.min(255, Math.round(targetRGB[0] * shade));
    d[i + 1] = Math.min(255, Math.round(targetRGB[1] * shade));
    d[i + 2] = Math.min(255, Math.round(targetRGB[2] * shade));
  }

  ctx.putImageData(imgData, 0, 0);
  const newTex = new THREE.CanvasTexture(c);
  newTex.colorSpace = THREE.SRGBColorSpace;
  newTex.flipY = srcMat.map?.flipY ?? false;
  newTex.needsUpdate = true;

  const mat = srcMat.clone();
  mat.map = newTex;
  mat.roughness = 0.25;
  mat.metalness = 0.28;
  liveryCache.set(key, mat);
  return mat;
}

/**
 * Builds the circular railway track + aerodynamic ONCF "Al Boraq" High-Speed Train
 * that glides continuously around the inner Moroccan plaza!
 */
export function buildAlBoraqTrainSystem(
  scene: THREE.Scene,
  trackRadius = 7.45
): {
  trainPivot: THREE.Group;
  updateTrain: (elapsed: number) => void;
} {
  // 1. Circular wooden sleepers + twin steel rails
  const railGroup = new THREE.Group();
  railGroup.position.y = 0.14;

  const sleeperGeo = new THREE.BoxGeometry(0.18, 0.04, 0.72);
  const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.85 });
  const sleeperCount = 68;
  for (let i = 0; i < sleeperCount; i++) {
    const ang = (i / sleeperCount) * Math.PI * 2;
    const sl = new THREE.Mesh(sleeperGeo, sleeperMat);
    sl.position.set(Math.cos(ang) * trackRadius, 0.02, Math.sin(ang) * trackRadius);
    sl.rotation.y = -ang + Math.PI / 2;
    sl.receiveShadow = true;
    railGroup.add(sl);
  }

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.25,
    metalness: 0.82,
  });
  for (const offset of [-0.22, 0.22]) {
    const railRing = new THREE.Mesh(
      new THREE.TorusGeometry(trackRadius + offset, 0.032, 8, 84),
      steelMat
    );
    railRing.rotation.x = Math.PI / 2;
    railRing.position.y = 0.05;
    railGroup.add(railRing);
  }
  scene.add(railGroup);

  // 2. Aerodynamic Al Boraq TGV Locomotive + 2 Coaches positioned along the circular arc!
  const trainPivot = new THREE.Group();
  trainPivot.position.y = 0.21;
  scene.add(trainPivot);

  const ivoryMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.22,
    metalness: 0.18,
  });
  const oncfOrangeMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xc2410c,
    emissiveIntensity: 0.22,
    roughness: 0.28,
  });
  const glassGlowMat = new THREE.MeshStandardMaterial({
    color: 0xbae6fd,
    emissive: 0xfef08a,
    emissiveIntensity: 0.65,
    roughness: 0.12,
  });
  const darkBogieMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });

  const createCoach = (isLead: boolean, isTail: boolean): THREE.Group => {
    const g = new THREE.Group();
    const bodyLen = 1.42;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.46, bodyLen), ivoryMat);
    body.position.y = 0.28;
    body.castShadow = true;
    g.add(body);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.12, bodyLen + 0.02),
      oncfOrangeMat
    );
    stripe.position.y = 0.22;
    g.add(stripe);

    const windows = new THREE.Mesh(
      new THREE.BoxGeometry(0.59, 0.13, bodyLen * 0.78),
      glassGlowMat
    );
    windows.position.y = 0.36;
    g.add(windows);

    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.1, bodyLen * 0.9),
      darkBogieMat
    );
    chassis.position.y = 0.06;
    g.add(chassis);

    if (isLead || isTail) {
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.62, 12), ivoryMat);
      nose.rotation.x = isLead ? Math.PI / 2 : -Math.PI / 2;
      nose.position.set(0, 0.22, isLead ? bodyLen * 0.5 + 0.28 : -(bodyLen * 0.5 + 0.28));
      nose.scale.set(1, 1, 0.82);
      nose.castShadow = true;
      g.add(nose);

      if (isLead) {
        const headlight = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xfef08a })
        );
        headlight.position.set(0, 0.2, bodyLen * 0.5 + 0.52);
        g.add(headlight);
      }
    }
    return g;
  };

  const coaches = [
    { mesh: createCoach(true, false), arcOffset: 0 },
    { mesh: createCoach(false, false), arcOffset: -0.23 },
    { mesh: createCoach(false, true), arcOffset: -0.46 },
  ];
  coaches.forEach((c) => trainPivot.add(c.mesh));

  const updateTrain = (elapsed: number) => {
    const baseAng = elapsed * 0.44;
    for (const c of coaches) {
      const a = baseAng + c.arcOffset;
      const x = Math.cos(a) * trackRadius;
      const z = Math.sin(a) * trackRadius;
      c.mesh.position.set(x, 0, z);
      // Tangent direction along counter-clockwise/clockwise circle
      c.mesh.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
    }
  };

  updateTrain(0);
  return { trainPivot, updateTrain };
}

/**
 * Builds a colorful Marrakech Royal Hot-Air Balloon that drifts gracefully above the horizon!
 */
export function buildRoyalHotAirBalloon(): {
  group: THREE.Group;
  flameMesh: THREE.Mesh;
} {
  const group = new THREE.Group();

  // Multi-striped envelope canvas texture
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const colors = ["#ef4444", "#fbbf24", "#10b981", "#0ea5e9", "#a855f7", "#f97316"];
  const stripeW = 256 / colors.length;
  colors.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(i * stripeW, 0, stripeW + 1, 128);
  });
  ctx.fillStyle = "#fef08a";
  ctx.fillRect(0, 52, 256, 20);

  const envTex = new THREE.CanvasTexture(c);
  envTex.colorSpace = THREE.SRGBColorSpace;

  const envelope = new THREE.Mesh(
    new THREE.SphereGeometry(1.65, 20, 16),
    new THREE.MeshStandardMaterial({ map: envTex, roughness: 0.45 })
  );
  envelope.scale.set(1, 1.24, 1);
  envelope.position.y = 2.4;
  envelope.castShadow = true;
  group.add(envelope);

  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.65, 0.36, 0.65, 14),
    new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 })
  );
  skirt.position.y = 0.68;
  group.add(skirt);

  const flameMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  flameMesh.position.y = 0.32;
  group.add(flameMesh);

  const basket = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.52, 0.68),
    new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 })
  );
  basket.position.y = -0.22;
  group.add(basket);

  return { group, flameMesh };
}
