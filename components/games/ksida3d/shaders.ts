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

        vec3 horizonCol = vec3(1.0, 0.56, 0.24);   // Warm Moroccan Terracotta Sunset
        vec3 midSkyCol  = vec3(0.95, 0.34, 0.44);  // Bougainvillea Coral Glow
        vec3 zenithCol  = vec3(0.07, 0.22, 0.52);  // Deep Majorelle Royal Sky

        vec3 sky = mix(horizonCol, midSkyCol, smoothstep(0.0, 0.28, h));
        sky = mix(sky, zenithCol, smoothstep(0.24, 0.82, h));

        // Glowing Atlantic Sun Disc in East-South-East sky
        vec3 sunDir = normalize(vec3(0.68, 0.26, 0.52));
        float sunDot = max(dot(dir, sunDir), 0.0);
        sky += vec3(1.0, 0.88, 0.55) * pow(sunDot, 48.0) * 1.1;
        sky += vec3(1.0, 0.62, 0.28) * pow(sunDot, 6.0) * 0.35;

        // Subtle animated high clouds
        float cloudWave = sin(dir.x * 9.0 + uTime * 0.08) * cos(dir.z * 7.0 - uTime * 0.05);
        float cloudMask = smoothstep(0.12, 0.55, h) * (1.0 - smoothstep(0.55, 0.9, h));
        sky += vec3(1.0, 0.78, 0.62) * max(0.0, cloudWave) * cloudMask * 0.12;

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
}

/**
 * Sparkling Atlantic Corniche Ocean Shader with Golden Sunset Specular Ripples
 */
export function createCornicheOceanMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: false,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vWorldXZ;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldXZ = wp.xz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vWorldXZ;

      void main() {
        vec2 uv = vWorldXZ * 0.09;
        float w1 = sin(uv.x * 2.4 + uTime * 1.3 + cos(uv.y * 1.8));
        float w2 = cos(uv.y * 3.1 - uTime * 1.05 + sin(uv.x * 2.1));
        float ripple = (w1 + w2) * 0.5;

        vec3 deepSea = vec3(0.03, 0.27, 0.46);
        vec3 shallowTurquoise = vec3(0.06, 0.56, 0.68);
        vec3 col = mix(deepSea, shallowTurquoise, smoothstep(-0.6, 0.75, ripple));

        // Golden sun sparkles
        float glint = smoothstep(0.76, 0.98, ripple);
        col += vec3(1.0, 0.84, 0.45) * glint * 0.65;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/**
 * Glowing Sonic Ring / Shockwave Shader for Wedding Horn & Butagaz Detonation
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
