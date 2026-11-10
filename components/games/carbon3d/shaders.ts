import * as THREE from "three";

/**
 * 1. Orbital Sci-Fi Sky Dome Shader
 * Renders deep space stars, glowing nebula horizon, orbital ring silhouette, and sub-arena plasma glow.
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

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec3 d = normalize(vWorldDir);
        float y = d.y;

        // Deep space zenith to glowing atmospheric horizon
        vec3 zenith = vec3(0.015, 0.025, 0.065);
        vec3 horizon = vec3(0.05, 0.19, 0.34);
        vec3 abyss = vec3(0.08, 0.02, 0.14);

        vec3 col = y >= 0.0
          ? mix(horizon, zenith, pow(clamp(y, 0.0, 1.0), 0.52))
          : mix(horizon * 0.75, abyss, pow(clamp(-y, 0.0, 1.0), 0.65));

        // Glowing cyan/violet aurora band near horizon
        float band = exp(-abs(y - 0.06) * 11.0);
        float wave = 0.5 + 0.5 * sin(d.x * 5.0 + d.z * 3.0 + uTime * 0.25);
        col += mix(vec3(0.06, 0.55, 0.75), vec3(0.55, 0.12, 0.65), wave) * band * 0.42;

        // Giant orbital ring arc across the upper sky
        float ringPlane = abs(d.y * 0.65 - d.x * 0.76);
        if (y > -0.05) {
          float ringGlow = exp(-ringPlane * 42.0) * smoothstep(-0.05, 0.25, y);
          col += vec3(0.18, 0.72, 0.95) * ringGlow * 0.32;
        }

        // Crisp procedural starfield in upper hemisphere
        if (y > 0.08) {
          vec2 starUV = floor((d.xz / (d.y + 0.35)) * 150.0);
          float h = hash(starUV);
          if (h > 0.992) {
            float twinkle = 0.65 + 0.35 * sin(uTime * 2.8 + h * 90.0);
            col += vec3(0.85, 0.94, 1.0) * twinkle * smoothstep(0.08, 0.35, y);
          }
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/**
 * 2. Hexagonal Fresnel Energy Shield Shader
 * Wraps Strikers in a crisp sci-fi hex forcefield that flares when taking shield hits or during Overdrive.
 */
export function createHexShieldMaterial(colorHex: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;

      void main() {
        if (uOpacity <= 0.005) discard;
        float fresnel = pow(1.0 - clamp(dot(normalize(vNormalW), normalize(vViewDir)), 0.0, 1.0), 2.2);

        // Procedural scrolling hex-scan lattice
        float gridA = abs(sin((vLocalPos.y * 18.0 - uTime * 5.0)));
        float gridB = abs(sin((vLocalPos.x * 16.0 + vLocalPos.z * 16.0)));
        float lattice = smoothstep(0.84, 0.98, max(gridA, gridB));

        float alpha = clamp((fresnel * 0.85 + lattice * 0.38) * uOpacity, 0.0, 0.92);
        vec3 col = mix(uColor, vec3(1.0), lattice * 0.45);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

/**
 * 3. Animated Holographic Energy Zone / Jump-Pad Vortex Shader
 */
export function createEnergyZoneMaterial(colorHex: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
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

        float rings = 0.5 + 0.5 * sin(r * 20.0 - uTime * 6.5);
        float outerRim = smoothstep(0.84, 0.98, r) * (1.0 - smoothstep(0.98, 1.0, r));
        float innerGlow = (1.0 - r) * 0.35;
        float alpha = (rings * 0.28 * (1.0 - r * 0.4) + outerRim * 0.95 + innerGlow) * uIntensity;

        vec3 col = mix(uColor, vec3(1.0), outerRim * 0.55);
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
      }
    `,
  });
}
