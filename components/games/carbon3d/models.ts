import * as THREE from "three";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  CARBON_WEAPONS,
  CarbonBotArchetype,
  CarbonPickupKind,
  CarbonWeaponId,
} from "@/games/carbon3d/types";
import { createHexShieldMaterial } from "./shaders";
import { getCarbonPBRMaterials } from "./textures";

export type HeroVisualRole = "ME" | "ALLY" | "ENEMY";

const HERO_GLB_URL = "/models/hunter.glb";
const HERO_TARGET_HEIGHT = 1.82;
const NATIVE_GLB_HEIGHT = 4.79;

let cachedHeroGltf: GLTF | null = null;
let heroLoadPromise: Promise<GLTF | null> | null = null;

export function loadCarbonHeroAsset(): Promise<GLTF | null> {
  if (cachedHeroGltf) return Promise.resolve(cachedHeroGltf);
  if (heroLoadPromise) return heroLoadPromise;
  if (typeof window === "undefined") return Promise.resolve(null);

  const loader = new GLTFLoader();
  heroLoadPromise = new Promise<GLTF | null>((resolve) => {
    loader.load(
      HERO_GLB_URL,
      (gltf) => {
        cachedHeroGltf = gltf;
        resolve(gltf);
      },
      undefined,
      () => resolve(null)
    );
  });
  return heroLoadPromise;
}

export interface StrikerRig {
  root: THREE.Group;
  bodyContainer: THREE.Group;
  groundRingGroup: THREE.Group;
  weaponAnchor: THREE.Group;
  weaponMeshes: Record<CarbonWeaponId, THREE.Group>;
  muzzleFlash: THREE.Mesh;
  dashTrailCone: THREE.Mesh;
  gyroRing?: THREE.Mesh;
  shieldMesh: THREE.Mesh;
  shieldMat: THREE.ShaderMaterial;
  hudSprite: THREE.Sprite;
  hudCanvas: HTMLCanvasElement;
  hudTex: THREE.CanvasTexture;
  lastHudKey: string;
  mixer: THREE.AnimationMixer | null;
  actions: Record<string, THREE.AnimationAction>;
  currentAnim: string;
  activeWeapon: CarbonWeaponId;
  archetype: CarbonBotArchetype;
  role: HeroVisualRole;
  recoil: number;
  shieldFlash: number;
  animPhase: number;
  disposed: boolean;
}

function getRolePalette(role: HeroVisualRole, archetype: CarbonBotArchetype) {
  if (archetype === "BOSS_MECH") {
    return {
      primary: 0xf59e0b, // Royal Gold
      secondary: 0xb91c1c, // Deep Crimson
      ring: 0xf59e0b,
      hpBar: "#f59e0b",
    };
  }
  if (role === "ME") {
    return {
      primary: 0x10b981, // Vibrant Emerald
      secondary: 0xf8fafc, // Pearl White
      ring: 0x22c55e,
      hpBar: "#22c55e",
    };
  }
  if (role === "ALLY") {
    return {
      primary: 0x0ea5e9, // Bright Sky Blue
      secondary: 0xf8fafc, // Pearl White
      ring: 0x38bdf8,
      hpBar: "#38bdf8",
    };
  }
  return {
    primary: 0xef4444, // Vivid Coral Red
    secondary: 0x1e293b, // Clean Slate
    ring: 0xef4444,
    hpBar: "#ef4444",
  };
}

/** Builds clean, readable stylized Overwatch/Brawl-proportioned 3D weapons */
export function buildWeaponMesh(weaponId: CarbonWeaponId): THREE.Group {
  const mats = getCarbonPBRMaterials();
  const spec = CARBON_WEAPONS[weaponId];
  const g = new THREE.Group();

  const accentMat = new THREE.MeshStandardMaterial({
    color: spec.colorHex,
    emissive: spec.colorHex,
    emissiveIntensity: 0.45,
    roughness: 0.3,
    metalness: 0.15,
  });

  if (weaponId === "CARBINE") {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.46, 6, 12), mats.weaponLight);
    body.rotation.x = Math.PI / 2;
    body.position.set(0, 0, 0.2);
    g.add(body);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.036, 0.38, 12),
      mats.weaponDark
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, 0.54);
    g.add(barrel);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.38), accentMat);
    stripe.position.set(0, 0.03, 0.24);
    g.add(stripe);
  } else if (weaponId === "SHOTGUN") {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.48), mats.weaponDark);
    receiver.position.set(0, 0, 0.18);
    g.add(receiver);

    for (const ox of [-0.045, 0.045]) {
      const bore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.044, 0.048, 0.5, 12),
        mats.weaponLight
      );
      bore.rotation.x = Math.PI / 2;
      bore.position.set(ox, 0.03, 0.44);
      g.add(bore);
    }

    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.28, 10), accentMat);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.045, 0.38);
    g.add(pump);
  } else if (weaponId === "RAILGUN") {
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.17, 0.48), mats.weaponLight);
    chassis.position.set(0, 0, 0.12);
    g.add(chassis);

    for (const oy of [0.052, -0.028]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.036, 0.82), mats.weaponDark);
      rail.position.set(0, oy, 0.58);
      g.add(rail);
    }

    const coreBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.78, 10),
      accentMat
    );
    coreBeam.rotation.x = Math.PI / 2;
    coreBeam.position.set(0, 0.012, 0.56);
    g.add(coreBeam);
  } else {
    // LOBBER
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.26, 16),
      mats.weaponLight
    );
    drum.rotation.x = Math.PI / 2;
    drum.position.set(0, 0, 0.22);
    g.add(drum);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.02, 8, 20), accentMat);
    ring.position.set(0, 0, 0.22);
    g.add(ring);

    const mortar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.062, 0.36, 14),
      mats.weaponDark
    );
    mortar.rotation.x = Math.PI / 2;
    mortar.position.set(0, 0.02, 0.48);
    g.add(mortar);
  }

  g.scale.setScalar(1.18);
  g.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
    }
  });
  return g;
}

/** Floating 3D Pickup Visuals */
export function buildPickupVisual(kind: CarbonPickupKind): THREE.Group {
  const g = new THREE.Group();
  if (kind === "WEAPON_SHOTGUN") {
    const w = buildWeaponMesh("SHOTGUN");
    w.scale.setScalar(1.35);
    w.position.set(0, 0, -0.22);
    g.add(w);
  } else if (kind === "WEAPON_RAILGUN") {
    const w = buildWeaponMesh("RAILGUN");
    w.scale.setScalar(1.25);
    w.position.set(0, 0, -0.32);
    g.add(w);
  } else if (kind === "WEAPON_LOBBER") {
    const w = buildWeaponMesh("LOBBER");
    w.scale.setScalar(1.35);
    w.position.set(0, 0, -0.22);
    g.add(w);
  } else if (kind === "SHIELD_CELL") {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.15,
    });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), mat);
    g.add(crystal);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.54, 0.04, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    halo.rotation.x = Math.PI / 3;
    g.add(halo);
  } else {
    // OVERDRIVE_AMP
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.75,
      roughness: 0.2,
      metalness: 0.25,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), mat);
    g.add(core);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.045, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    ring.rotation.x = Math.PI / 4;
    g.add(ring);
  }
  return g;
}

function buildSmoothFallbackHero(primaryHex: number, secondaryHex: number): THREE.Group {
  const g = new THREE.Group();
  const primaryMat = new THREE.MeshStandardMaterial({
    color: primaryHex,
    roughness: 0.42,
    metalness: 0.1,
  });
  const secondaryMat = new THREE.MeshStandardMaterial({
    color: secondaryHex,
    roughness: 0.38,
    metalness: 0.08,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.35,
    roughness: 0.2,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.62, 10, 18), primaryMat);
  torso.position.y = 0.78;
  torso.castShadow = true;
  g.add(torso);

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.24), secondaryMat);
  backpack.position.set(0, 0.88, -0.24);
  backpack.castShadow = true;
  g.add(backpack);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), secondaryMat);
  head.position.y = 1.48;
  head.castShadow = true;
  g.add(head);

  const visor = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.24, 6, 12), visorMat);
  visor.rotation.z = Math.PI / 2;
  visor.position.set(0, 1.49, 0.24);
  g.add(visor);

  return g;
}

function attachAnimatedGltfHero(
  rig: StrikerRig,
  gltf: GLTF,
  primaryHex: number,
  secondaryHex: number
) {
  if (rig.disposed) return;

  // IMPORTANT: updateMatrixWorld before SkeletonUtils.clone, and NEVER call Box3.setFromObject on cloned armature!
  gltf.scene.updateMatrixWorld(true);
  const cloned = SkeletonUtils.clone(gltf.scene);
  const scale = HERO_TARGET_HEIGHT / NATIVE_GLB_HEIGHT;
  cloned.scale.setScalar(scale);
  cloned.position.set(0, 0, 0);

  cloned.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;

      const srcMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const tinted = srcMats.map((mat) => {
        const std = mat as THREE.MeshStandardMaterial;
        if (!std || !("color" in std)) return mat;
        const m = std.clone();
        const name = (m.name || "").toLowerCase();
        if (name.includes("main") || name.includes("orange") || name.includes("yellow")) {
          m.color.setHex(primaryHex);
        } else if (name.includes("grey") || name.includes("gray")) {
          m.color.setHex(secondaryHex);
        } else if (name.includes("black")) {
          m.color.setHex(0x0f172a);
        }
        m.metalness = 0.1;
        m.roughness = 0.45;
        return m;
      });
      mesh.material = Array.isArray(mesh.material) ? tinted : tinted[0];
    }
  });

  rig.bodyContainer.clear();
  rig.bodyContainer.add(cloned);

  const mixer = new THREE.AnimationMixer(cloned);
  const actions: Record<string, THREE.AnimationAction> = {};
  for (const clip of gltf.animations) {
    actions[clip.name] = mixer.clipAction(clip);
  }
  rig.mixer = mixer;
  rig.actions = actions;
  rig.currentAnim = "";
  playHeroClip(rig, "Idle", 0.05);
}

function playHeroClip(rig: StrikerRig, clipName: "Idle" | "Running" | "Walking" | "Jump", fade = 0.16) {
  if (!rig.mixer || rig.currentAnim === clipName) return;
  const next = rig.actions[clipName] || rig.actions["Idle"];
  if (!next) return;
  const prev = rig.actions[rig.currentAnim];
  next.reset().setEffectiveWeight(1).fadeIn(fade).play();
  if (prev && prev !== next) prev.fadeOut(fade);
  rig.currentAnim = clipName;
}

/**
 * Creates a smooth stylized Hero / Hover-Drone / Boss rig with Brawl-style ground ring & overhead bar.
 */
export function createStrikerRig(
  role: HeroVisualRole,
  archetype: CarbonBotArchetype = "STRIKER",
  initialWeapon: CarbonWeaponId = "CARBINE"
): StrikerRig {
  const palette = getRolePalette(role, archetype);
  const root = new THREE.Group();
  const bodyContainer = new THREE.Group();
  root.add(bodyContainer);

  // 1. Crisp Brawl-Stars Ground Circle Indicator at y = 0.03
  const groundRingGroup = new THREE.Group();
  groundRingGroup.position.y = 0.03;

  const ringRadius = archetype === "BOSS_MECH" ? 1.05 : 0.72;
  const fillDisc = new THREE.Mesh(
    new THREE.CircleGeometry(ringRadius, 32),
    new THREE.MeshBasicMaterial({
      color: palette.ring,
      transparent: true,
      opacity: role === "ME" ? 0.24 : 0.15,
      depthWrite: false,
    })
  );
  fillDisc.rotation.x = -Math.PI / 2;
  groundRingGroup.add(fillDisc);

  const rimRing = new THREE.Mesh(
    new THREE.RingGeometry(ringRadius - 0.1, ringRadius, 36),
    new THREE.MeshBasicMaterial({
      color: palette.ring,
      transparent: true,
      opacity: role === "ME" ? 0.95 : 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  rimRing.rotation.x = -Math.PI / 2;
  groundRingGroup.add(rimRing);

  // Forward direction arrow on local player's ground ring
  if (role === "ME") {
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.26);
    arrowShape.lineTo(-0.2, -0.05);
    arrowShape.lineTo(0.2, -0.05);
    arrowShape.closePath();
    const arrowMesh = new THREE.Mesh(
      new THREE.ShapeGeometry(arrowShape),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    arrowMesh.rotation.x = Math.PI / 2;
    arrowMesh.position.set(0, 0.005, ringRadius + 0.14);
    groundRingGroup.add(arrowMesh);
  }
  root.add(groundRingGroup);

  // 2. Weapon Anchor + Dash Trail Cone
  const weaponAnchor = new THREE.Group();
  let gyroRing: THREE.Mesh | undefined;

  const dashGeo = new THREE.ConeGeometry(0.22, 0.75, 10);
  dashGeo.rotateX(-Math.PI / 2);
  const dashTrailCone = new THREE.Mesh(
    dashGeo,
    new THREE.MeshBasicMaterial({
      color: palette.ring,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    })
  );
  dashTrailCone.position.set(0, 0.85, -0.65);
  dashTrailCone.visible = false;
  root.add(dashTrailCone);

  if (archetype === "DRONE") {
    // Smooth Stylized Hovering Recon Drone
    bodyContainer.position.y = 0.95;
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 22, 18),
      new THREE.MeshStandardMaterial({
        color: palette.secondary,
        roughness: 0.35,
        metalness: 0.1,
      })
    );
    shell.castShadow = true;
    bodyContainer.add(shell);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.41, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45),
      new THREE.MeshStandardMaterial({
        color: palette.primary,
        roughness: 0.4,
        metalness: 0.1,
      })
    );
    bodyContainer.add(cap);

    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 12),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.85,
      })
    );
    eye.position.set(0, 0.02, 0.32);
    bodyContainer.add(eye);

    gyroRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.055, 10, 28),
      new THREE.MeshStandardMaterial({
        color: palette.primary,
        roughness: 0.35,
        metalness: 0.15,
      })
    );
    gyroRing.rotation.x = Math.PI / 2;
    bodyContainer.add(gyroRing);

    weaponAnchor.position.set(0, -0.25, 0.12);
    bodyContainer.add(weaponAnchor);
  } else {
    // Smooth Stylized Humanoid Hero (loads /models/hunter.glb with instant smooth capsule fallback)
    bodyContainer.add(buildSmoothFallbackHero(palette.primary, palette.secondary));
    weaponAnchor.position.set(-0.36, 0.96, 0.22);
    root.add(weaponAnchor);
  }

  const weaponMeshes: Record<CarbonWeaponId, THREE.Group> = {
    CARBINE: buildWeaponMesh("CARBINE"),
    SHOTGUN: buildWeaponMesh("SHOTGUN"),
    RAILGUN: buildWeaponMesh("RAILGUN"),
    LOBBER: buildWeaponMesh("LOBBER"),
  };
  for (const [id, mesh] of Object.entries(weaponMeshes) as Array<[CarbonWeaponId, THREE.Group]>) {
    mesh.visible = id === initialWeapon;
    weaponAnchor.add(mesh);
  }

  // Crisp Muzzle Flash Pop
  const muzzleGeo = new THREE.SphereGeometry(0.2, 10, 8);
  const muzzleMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const muzzleFlash = new THREE.Mesh(muzzleGeo, muzzleMat);
  muzzleFlash.position.set(0, 0.02, 0.88);
  weaponAnchor.add(muzzleFlash);

  // Energy Shield Bubble
  const shieldMat = createHexShieldMaterial(0x38bdf8);
  const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(0.92, 20, 16), shieldMat);
  shieldMesh.scale.set(0.86, 1.12, 0.86);
  shieldMesh.position.set(0, 1.0, 0);
  root.add(shieldMesh);

  // Overhead Brawl-Style Floating Bar (Nickname + Shield + HP + Ammo for Local Player!)
  const hudCanvas = document.createElement("canvas");
  hudCanvas.width = 280;
  hudCanvas.height = 96;
  const hudTex = new THREE.CanvasTexture(hudCanvas);
  hudTex.colorSpace = THREE.SRGBColorSpace;
  const spriteMat = new THREE.SpriteMaterial({
    map: hudTex,
    transparent: true,
    depthTest: false,
  });
  const hudSprite = new THREE.Sprite(spriteMat);
  hudSprite.scale.set(2.45, 0.84, 1);
  hudSprite.position.set(0, archetype === "DRONE" ? 1.95 : 2.38, 0);
  hudSprite.renderOrder = 15;
  root.add(hudSprite);

  if (archetype === "BOSS_MECH") {
    bodyContainer.scale.setScalar(1.52);
    weaponAnchor.scale.setScalar(1.38);
    weaponAnchor.position.set(-0.54, 1.42, 0.3);
    hudSprite.position.y = 3.25;
    hudSprite.scale.set(3.0, 1.0, 1);
  } else if (archetype === "ENFORCER") {
    bodyContainer.scale.set(1.16, 1.12, 1.16);
  }

  const rig: StrikerRig = {
    root,
    bodyContainer,
    groundRingGroup,
    weaponAnchor,
    weaponMeshes,
    muzzleFlash,
    dashTrailCone,
    gyroRing,
    shieldMesh,
    shieldMat,
    hudSprite,
    hudCanvas,
    hudTex,
    lastHudKey: "",
    mixer: null,
    actions: {},
    currentAnim: "",
    activeWeapon: initialWeapon,
    archetype,
    role,
    recoil: 0,
    shieldFlash: 0,
    animPhase: Math.random() * 10,
    disposed: false,
  };

  if (archetype !== "DRONE") {
    if (cachedHeroGltf) {
      attachAnimatedGltfHero(rig, cachedHeroGltf, palette.primary, palette.secondary);
    } else {
      loadCarbonHeroAsset().then((gltf) => {
        if (gltf && !rig.disposed) {
          attachAnimatedGltfHero(rig, gltf, palette.primary, palette.secondary);
        }
      });
    }
  }

  return rig;
}

/**
 * Redraws Brawl-Stars-style overhead nameplate + Shield + HP + (for ME) Orange Ammo Bar!
 */
export function syncStrikerHudPlate(
  rig: StrikerRig,
  nickname: string,
  hp: number,
  maxHp: number,
  shield: number,
  maxShield: number,
  overdrive: boolean,
  ammoRatio = -1,
  isReloading = false
) {
  const hpQ = Math.max(0, Math.round((hp / Math.max(1, maxHp)) * 28));
  const shQ = Math.max(0, Math.round((shield / Math.max(1, maxShield)) * 24));
  const amQ = ammoRatio >= 0 ? Math.max(0, Math.round(ammoRatio * 20)) : -1;
  const hpNum = Math.max(0, Math.round(hp + shield));
  const key = `${nickname}|${hpQ}|${shQ}|${amQ}|${isReloading ? 1 : 0}|${overdrive ? 1 : 0}|${rig.role}`;
  if (key === rig.lastHudKey) return;
  rig.lastHudKey = key;

  const ctx = rig.hudCanvas.getContext("2d");
  if (!ctx) return;

  const palette = getRolePalette(rig.role, rig.archetype);
  ctx.clearRect(0, 0, 280, 96);

  // Nickname with crisp dark outline for perfect readability against sunlit sandstone!
  const cleanName = nickname.length > 14 ? nickname.slice(0, 13) + "…" : nickname;
  const title = overdrive ? `⚡ ${cleanName}` : cleanName;
  ctx.font = "900 20px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(15, 23, 42, 0.95)";
  ctx.strokeText(title, 140, 22);
  ctx.fillStyle = overdrive ? "#fde047" : rig.role === "ME" ? "#86efac" : "#ffffff";
  ctx.fillText(title, 140, 22);

  // Bar container pill
  const barX = 34;
  const barW = 212;
  const pillH = amQ >= 0 ? 52 : 38;
  ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
  ctx.beginPath();
  ctx.roundRect(barX - 6, 29, barW + 12, pillH, 11);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = overdrive ? "#fbbf24" : "rgba(255,255,255,0.35)";
  ctx.stroke();

  // Shield Bar (Sky Cyan)
  ctx.fillStyle = "rgba(51, 65, 85, 0.9)";
  ctx.fillRect(barX, 34, barW, 7);
  if (shQ > 0) {
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(barX, 34, (barW * shQ) / 24, 7);
  }

  // Health Bar (Emerald for ME, Sky Blue for ALLY, Coral Red for ENEMY)
  ctx.fillStyle = "rgba(51, 65, 85, 0.95)";
  ctx.fillRect(barX, 44, barW, 15);
  const hpFrac = hpQ / 28;
  ctx.fillStyle = palette.hpBar;
  ctx.fillRect(barX, 44, barW * hpFrac, 15);

  // Crisp numeric total HP centered inside HP bar
  ctx.font = "900 12px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`${hpNum}`, 140, 56);

  // Local Player Ammo / Reload Bar (Vibrant Brawl-style Orange!)
  if (amQ >= 0) {
    ctx.fillStyle = "rgba(51, 65, 85, 0.95)";
    ctx.fillRect(barX, 63, barW, 10);
    ctx.fillStyle = isReloading ? "#fde047" : "#fb923c";
    ctx.fillRect(barX, 63, barW * (amQ / 20), 10);

    // 3 segment ticks like Brawl Stars ammo slots
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(barX + barW * 0.333, 63, 2.5, 10);
    ctx.fillRect(barX + barW * 0.666, 63, 2.5, 10);
  }

  rig.hudTex.needsUpdate = true;
}

/** Updates skeletal animations, weapon recoil, muzzle flash, shield pulse & dash trail @ 60 FPS */
export function updateStrikerRig(
  rig: StrikerRig,
  dt: number,
  elapsedSec: number,
  speedXZ: number,
  weapon: CarbonWeaponId,
  isDashing: boolean,
  isAirborne: boolean,
  hasShield: boolean,
  overdrive: boolean
) {
  if (rig.activeWeapon !== weapon) {
    rig.weaponMeshes[rig.activeWeapon].visible = false;
    rig.weaponMeshes[weapon].visible = true;
    rig.activeWeapon = weapon;
  }

  rig.recoil = Math.max(0, rig.recoil - dt * 7.5);
  rig.shieldFlash = Math.max(0, rig.shieldFlash - dt * 3.5);

  const flashMat = rig.muzzleFlash.material as THREE.MeshBasicMaterial;
  if (flashMat.opacity > 0) {
    flashMat.opacity = Math.max(0, flashMat.opacity - dt * 18);
    rig.muzzleFlash.scale.setScalar(0.6 + flashMat.opacity * 0.7);
  }

  rig.shieldMat.uniforms.uTime.value = elapsedSec;
  const baseShield = overdrive ? 0.35 : hasShield ? 0.08 : 0.0;
  rig.shieldMat.uniforms.uOpacity.value = Math.min(0.85, baseShield + rig.shieldFlash * 0.75);

  rig.dashTrailCone.visible = isDashing;
  if (isDashing) {
    rig.dashTrailCone.scale.set(1, 1, 0.9 + Math.sin(elapsedSec * 40) * 0.25);
  }

  if (rig.archetype === "DRONE") {
    rig.animPhase += dt * (4.2 + speedXZ * 0.5);
    rig.bodyContainer.position.y = 0.95 + Math.sin(rig.animPhase) * 0.1;
    rig.bodyContainer.rotation.x = Math.min(0.28, speedXZ * 0.035);
    if (rig.gyroRing) rig.gyroRing.rotation.z += dt * 5.5;
    rig.weaponAnchor.position.z = 0.12 - rig.recoil * 0.15;
    return;
  }

  // Advance GLB Skeletal Animation Mixer!
  if (rig.mixer) {
    const desiredClip = isAirborne
      ? "Jump"
      : speedXZ > 0.45 || isDashing
      ? "Running"
      : "Idle";
    playHeroClip(rig, desiredClip);
    rig.mixer.timeScale = isDashing ? 1.55 : speedXZ > 0.45 ? Math.min(1.35, 0.75 + speedXZ * 0.07) : 1.0;
    rig.mixer.update(dt);
  } else {
    // Smooth hop while GLB loads
    if (speedXZ > 0.45) {
      rig.animPhase += dt * 11;
      rig.bodyContainer.position.y = Math.abs(Math.sin(rig.animPhase)) * 0.12;
    } else {
      rig.bodyContainer.position.y = 0;
    }
  }

  const baseZ = rig.archetype === "BOSS_MECH" ? 0.3 : 0.22;
  rig.weaponAnchor.position.z = baseZ - rig.recoil * 0.16;
}
