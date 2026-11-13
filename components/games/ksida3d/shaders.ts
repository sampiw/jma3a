import * as THREE from "three";

/**
 * Golden-Hour Casablanca / Corniche Sunset Sky Dome Shader
 */
export function createMoroccanSunsetSkyMaterial(): THREE.ShaderMaterial {
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
        float h = clamp(dir.y * 0.85 + 0.12, 0.0, 1.0);

        vec3 horizonCol = vec3(1.0, 0.58, 0.25);   // Warm Moroccan Terracotta Sunset
        vec3 midSkyCol  = vec3(0.94, 0.35, 0.45);  // Bougainvillea Coral Glow
        vec3 zenithCol  = vec3(0.06, 0.21, 0.52);  // Deep Majorelle Royal Sky

        vec3 sky = mix(horizonCol, midSkyCol, smoothstep(0.0, 0.28, h));
        sky = mix(sky, zenithCol, smoothstep(0.24, 0.84, h));

        // Glowing Atlantic Sun Disc
        vec3 sunDir = normalize(vec3(0.68, 0.26, -0.52));
        float sunDot = max(dot(dir, sunDir), 0.0);
        sky += vec3(1.0, 0.90, 0.58) * pow(sunDot, 56.0) * 1.25;
        sky += vec3(1.0, 0.62, 0.28) * pow(sunDot, 6.0) * 0.36;

        // Layered animated high clouds
        float c1 = sin(dir.x * 8.5 + uTime * 0.07) * cos(dir.z * 6.5 - uTime * 0.05);
        float c2 = sin(dir.x * 17.0 - uTime * 0.11 + dir.z * 11.0) * 0.5;
        float cloudMask = smoothstep(0.10, 0.48, h) * (1.0 - smoothstep(0.52, 0.92, h));
        sky += vec3(1.0, 0.80, 0.64) * max(0.0, c1 + c2 * 0.5) * cloudMask * 0.15;

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
}

/**
 * Normal-Mapped Atlantic Corniche Ocean Shader using photographic `/textures/shooter/waternormals.jpg`!
 */
export function createCornicheOceanMaterial(): THREE.ShaderMaterial {
  const normalTex = new THREE.TextureLoader().load("/textures/shooter/waternormals.jpg");
  normalTex.wrapS = THREE.RepeatWrapping;
  normalTex.wrapT = THREE.RepeatWrapping;

  return new THREE.ShaderMaterial({
    transparent: false,
    uniforms: {
      uTime: { value: 0 },
      uWaterNormals: { value: normalTex },
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
      uniform sampler2D uWaterNormals;
      varying vec3 vWorldPos;

      void main() {
        vec2 uv1 = vWorldPos.xz * 0.018 + vec2(uTime * 0.025, uTime * 0.018);
        vec2 uv2 = vWorldPos.xz * 0.031 - vec2(uTime * 0.021, -uTime * 0.027);

        vec3 n1 = texture2D(uWaterNormals, uv1).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uWaterNormals, uv2).xyz * 2.0 - 1.0;
        vec3 normal = normalize(vec3(n1.xy + n2.xy, 2.4));

        vec3 sunDir = normalize(vec3(0.68, 0.36, -0.52));
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 halfVec = normalize(sunDir + viewDir);

        float fresnel = pow(1.0 - max(dot(viewDir, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);
        float spec = pow(max(dot(normal, halfVec), 0.0), 72.0);

        float distFromIsland = length(vWorldPos.xz * vec2(0.75, 1.0));
        float shallowMask = 1.0 - smoothstep(190.0, 340.0, distFromIsland);

        vec3 deepAtlantic = vec3(0.02, 0.20, 0.40);
        vec3 coastalTurquoise = vec3(0.05, 0.56, 0.66);
        vec3 col = mix(deepAtlantic, coastalTurquoise, shallowMask * 0.85);
        col = mix(col, vec3(0.95, 0.58, 0.35), fresnel * 0.32);

        // White coastal surf foam crests near peninsula shore
        float foamWave = sin(distFromIsland * 0.35 - uTime * 2.4 + n1.x * 3.0);
        float shoreBand = smoothstep(285.0, 220.0, distFromIsland) * smoothstep(160.0, 215.0, distFromIsland);
        col += vec3(0.92, 0.96, 1.0) * smoothstep(0.58, 0.95, foamWave) * shoreBand * 0.55;

        // Golden sunset specular glitter on normal-mapped waves
        col += vec3(1.0, 0.86, 0.52) * spec * 1.45;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/**
 * Glowing Sonic Ring / Shockwave Material for Wedding Horn & Butagaz Detonation
 */
export function createSonicShockwaveMaterial(colorHex: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
