import * as THREE from "three";

/**
 * 1. Sunny Mediterranean / Overwatch Daylight Stadium Sky Shader
 * Bright azure zenith -> sky blue -> warm sunlit peach-gold horizon -> turquoise ocean below.
 */
export function createOrbitalSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldDir;

      void main() {
        vec3 d = normalize(vWorldDir);
        float y = d.y;

        vec3 zenith = vec3(0.06, 0.52, 0.88);
        vec3 midSky = vec3(0.32, 0.76, 0.98);
        vec3 horizon = vec3(0.99, 0.94, 0.80);
        vec3 seaBelow = vec3(0.12, 0.68, 0.82);

        vec3 col;
        if (y >= 0.0) {
          float t1 = smoothstep(0.0, 0.28, y);
          float t2 = smoothstep(0.22, 0.85, y);
          col = mix(horizon, midSky, t1);
          col = mix(col, zenith, t2);

          // Soft stylized sunlit clouds near horizon
          float cloudWave = sin(d.x * 6.0 + uTime * 0.08) * cos(d.z * 5.0 - uTime * 0.06);
          float cloudMask = smoothstep(0.25, 0.65, cloudWave) * exp(-abs(y - 0.16) * 8.0);
          col = mix(col, vec3(1.0, 0.99, 0.96), cloudMask * 0.45);
        } else {
          col = mix(horizon, seaBelow, smoothstep(0.0, 0.38, -y));
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/**
 * 2. Crisp Energy Shield Bubble Shader (readable in bright daylight)
 */
export function createHexShieldMaterial(colorHex: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.FrontSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vNormalW;
      varying vec3 vViewDir;

      void main() {
        if (uOpacity <= 0.005) discard;
        float fresnel = pow(1.0 - clamp(dot(normalize(vNormalW), normalize(vViewDir)), 0.0, 1.0), 2.0);
        float alpha = clamp(fresnel * 0.95 * uOpacity, 0.0, 0.85);
        vec3 col = mix(uColor, vec3(1.0), fresnel * 0.35);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

/**
 * 3. Brawl-Style Daylight Ground Zone / Jump-Pad Ring Shader
 * Uses NormalBlending with saturated colors so rings pop vividly on warm sandstone floors!
 */
export function createEnergyZoneMaterial(colorHex: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(colorHex) },
      uIntensity: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (r > 1.0) discard;

        float pulse = 0.5 + 0.5 * sin(r * 16.0 - uTime * 5.5);
        float outerRim = smoothstep(0.84, 0.93, r) * (1.0 - smoothstep(0.97, 1.0, r));
        float innerFill = 0.16 * (1.0 - r * 0.5) + pulse * 0.12 * (1.0 - r);
        float alpha = clamp((outerRim * 0.92 + innerFill) * uIntensity, 0.0, 0.92);

        vec3 col = mix(uColor, vec3(1.0), outerRim * 0.35);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}
