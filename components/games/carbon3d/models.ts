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

const SOLDIER_GLB_URL = "/models/shooter/Soldier.glb";
const BARREL_GLB_URL = "/models/food/barrel.glb";
const CRATE_GLB_URL = "/models/furniture/cardboardBoxClosed.glb";

let cachedSoldierGltf: GLTF | null = null;
let soldierLoadPromise: Promise<GLTF | null> | null = null;

let cachedBarrelGltf: GLTF | null = null;
let barrelLoadPromise: Promise<GLTF | null> | null = null;

let cachedCrateGltf: GLTF | null = null;
let crateLoadPromise: Promise<GLTF | null> | null = null;

export function loadCarbonHeroAsset(): Promise<GLTF | null> {
  if (cachedSoldierGltf) return Promise.resolve(cachedSoldierGltf);
  if (soldierLoadPromise) return soldierLoadPromise;
  if (typeof window === "undefined") return Promise.resolve(null);

  const loader = new GLTFLoader();
  soldierLoadPromise = new Promise<GLTF | null>((resolve) => {
    loader.load(
      SOLDIER_GLB_URL,
      (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        cachedSoldierGltf = gltf;
        resolve(gltf);
      },
      undefined,
      () => resolve(null)
    );
  });

  // Warm-cache barrel & airdrop crate GLBs in parallel
  loadExplosiveBarrelAsset();
  loadSupplyCrateAsset();

  return soldierLoadPromise;
}

export function loadExplosiveBarrelAsset(): Promise<GLTF | null> {
  if (cachedBarrelGltf) return Promise.resolve(cachedBarrelGltf);
  if (barrelLoadPromise) return barrelLoadPromise;
  if (typeof window === "undefined") return Promise.resolve(null);

  const loader = new GLTFLoader();
  barrelLoadPromise = new Promise<GLTF | null>((resolve) => {
    loader.load(
      BARREL_GLB_URL,
      (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        cachedBarrelGltf = gltf;
        resolve(gltf);
      },
      undefined,
      () => resolve(null)
    );
  });
  return barrelLoadPromise;
}

export function loadSupplyCrateAsset(): Promise<GLTF | null> {
  if (cachedCrateGltf) return Promise.resolve(cachedCrateGltf);
  if (crateLoadPromise) return crateLoadPromise;
  if (typeof window === "undefined") return Promise.resolve(null);

  const loader = new GLTFLoader();
  crateLoadPromise = new Promise<GLTF | null>((resolve) => {
    loader.load(
      CRATE_GLB_URL,
      (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        cachedCrateGltf = gltf;
        resolve(gltf);
      },
      undefined,
      () => resolve(null)
    );
  });
  return crateLoadPromise;
}

export interface StrikerRig {
  root: THREE.Group;
  bodyContainer: THREE.Group;
  groundRingGroup: THREE.Group;
  weaponAnchor: THREE.Group;
  weaponMeshes: Record<CarbonWeaponId, THREE.Group>;
  muzzleFlash: THREE.Mesh;
  dashTrailCone: THREE.Mesh;
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
      visor: 0xf59e0b,
      ring: 0xf59e0b,
      hpBar: "#f59e0b",
    };
  }
  if (role === "ME") {
    return {
      visor: 0x10b981,
      ring: 0x22c55e,
      hpBar: "#22c55e",
    };
  }
  if (role === "ALLY") {
    return {
      visor: 0x38bdf8,
      ring: 0x38bdf8,
      hpBar: "#38bdf8",
    };
  }
  return {
    visor: 0xef4444,
    ring: 0xef4444,
    hpBar: "#ef4444",
  };
}

/**
 * Builds Detailed Grounded Special-Ops 3D Weapons (+Z = Muzzle Forward)
 * 1. CARBINE  -> M4A1 Tactical Carbine with Holo Sight & STANAG Mag
 * 2. SHOTGUN  -> M870 Tactical Pump Breacher
 * 3. RAILGUN  -> AWP Atlas Magnified Sniper Rifle with Scope & Bipod
 * 4. LOBBER   -> M32 6-Shot Rotary Grenade Launcher
 */
export function buildWeaponMesh(weaponId: CarbonWeaponId): THREE.Group {
  const mats = getCarbonPBRMaterials();
  const spec = CARBON_WEAPONS[weaponId];
  const g = new THREE.Group();

  const opticMat = new THREE.MeshStandardMaterial({
    color: spec.colorHex,
    emissive: spec.colorHex,
    emissiveIntensity: 0.7,
    roughness: 0.2,
    metalness: 0.3,
  });

  if (weaponId === "CARBINE") {
    // Buttstock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, 0.22), mats.weaponDark);
    stock.position.set(0, -0.01, -0.14);
    g.add(stock);

    // Upper & Lower Receiver
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.11, 0.28), mats.weaponDark);
    receiver.position.set(0, 0.01, 0.08);
    g.add(receiver);

    // Curved Magazine
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.17, 0.075), mats.weaponSteel);
    mag.position.set(0, -0.1, 0.14);
    mag.rotation.x = 0.22;
    g.add(mag);

    // Quad-Rail Handguard + Barrel + Suppressor/Compensator
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.078, 0.28), mats.weaponTan);
    handguard.position.set(0, 0.02, 0.34);
    g.add(handguard);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.02, 0.28, 10),
      mats.weaponSteel
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.025, 0.56);
    g.add(barrel);

    // Holographic Optic Housing
    const holo = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.058, 0.09), mats.weaponDark);
    holo.position.set(0, 0.09, 0.1);
    g.add(holo);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.036, 0.015), opticMat);
    lens.position.set(0, 0.092, 0.145);
    g.add(lens);
  } else if (weaponId === "SHOTGUN") {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.12, 0.24), mats.weaponDark);
    stock.position.set(0, -0.02, -0.12);
    stock.rotation.x = -0.12;
    g.add(stock);

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, 0.28), mats.weaponSteel);
    receiver.position.set(0, 0.015, 0.1);
    g.add(receiver);

    // Main Top Barrel + Under-barrel Mag Tube
    const topBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.026, 0.52, 12),
      mats.weaponDark
    );
    topBarrel.rotation.x = Math.PI / 2;
    topBarrel.position.set(0, 0.042, 0.46);
    g.add(topBarrel);

    const magTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.021, 0.021, 0.44, 10),
      mats.weaponSteel
    );
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, -0.005, 0.42);
    g.add(magTube);

    // Tactical Pump Forend
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.22, 10), mats.weaponTan);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.008, 0.38);
    g.add(pump);
  } else if (weaponId === "RAILGUN") {
    // AWP Atlas Sniper Chassis (Olive/Tan Polymer + Long Fluted Bull Barrel + Magnified Scope)
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.12, 0.54), mats.weaponTan);
    chassis.position.set(0, 0, 0.06);
    g.add(chassis);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.024, 0.68, 12),
      mats.weaponDark
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.032, 0.62);
    g.add(barrel);

    // Muzzle Brake
    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.038, 0.085), mats.weaponSteel);
    brake.position.set(0, 0.032, 0.96);
    g.add(brake);

    // Long Sniper Scope Tube + Glowing Objective Lens
    const scopeTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.024, 0.34, 14),
      mats.weaponDark
    );
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.11, 0.14);
    g.add(scopeTube);

    const scopeLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.015, 14),
      opticMat
    );
    scopeLens.rotation.x = Math.PI / 2;
    scopeLens.position.set(0, 0.11, 0.31);
    g.add(scopeLens);
  } else {
    // M32 6-Chamber Rotary Grenade Launcher
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.22), mats.weaponDark);
    stock.position.set(0, 0, -0.1);
    g.add(stock);

    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 0.2, 16),
      mats.weaponTan
    );
    drum.rotation.x = Math.PI / 2;
    drum.position.set(0, -0.01, 0.16);
    g.add(drum);

    const shroud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.048, 0.34, 14),
      mats.weaponDark
    );
    shroud.rotation.x = Math.PI / 2;
    shroud.position.set(0, 0.02, 0.42);
    g.add(shroud);

    const optic = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.06), opticMat);
    optic.position.set(0, 0.11, 0.18);
    g.add(optic);
  }

  g.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
    }
  });
  return g;
}

/** Floating 3D Weapon Rack / Armor Medkit / Tactical Overdrive Pickup Visuals */
export function buildPickupVisual(kind: CarbonPickupKind): THREE.Group {
  const g = new THREE.Group();
  if (kind === "WEAPON_SHOTGUN") {
    const w = buildWeaponMesh("SHOTGUN");
    w.scale.setScalar(1.45);
    w.position.set(0, 0, -0.22);
    g.add(w);
  } else if (kind === "WEAPON_RAILGUN") {
    const w = buildWeaponMesh("RAILGUN");
    w.scale.setScalar(1.3);
    w.position.set(0, 0, -0.35);
    g.add(w);
  } else if (kind === "WEAPON_LOBBER") {
    const w = buildWeaponMesh("LOBBER");
    w.scale.setScalar(1.45);
    w.position.set(0, 0, -0.2);
    g.add(w);
  } else if (kind === "SHIELD_CELL") {
    // Tactical Ballistic Armor Vest / Medkit Case
    const vestMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.45,
      roughness: 0.35,
      metalness: 0.3,
    });
    const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.22), vestMat);
    g.add(caseMesh);
    const crossH = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.08, 0.24),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc })
    );
    const crossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.26, 0.24),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc })
    );
    g.add(crossH, crossV);
  } else {
    // OVERDRIVE_AMP (Tactical Adrenaline / Ammo Boost)
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.65,
      roughness: 0.25,
      metalness: 0.4,
    });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), mat);
    g.add(core);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.04, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xfde047 })
    );
    ring.rotation.x = Math.PI / 3;
    g.add(ring);
  }
  return g;
}

/**
 * Shootable Red Hazard Explosive Barrel (uses /models/food/barrel.glb tinted crimson + hazard band)
 */
export function buildExplosiveBarrelMesh(): THREE.Group {
  const mats = getCarbonPBRMaterials();
  const group = new THREE.Group();

  // Immediate crisp 55-gallon crimson explosive drum
  const fallbackGroup = new THREE.Group();
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 1.16, 20),
    mats.explosiveBarrelRed
  );
  drum.position.y = 0.58;
  drum.castShadow = true;
  drum.receiveShadow = true;
  fallbackGroup.add(drum);

  for (const ry of [0.18, 0.58, 0.98]) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(0.43, 0.025, 8, 24),
      mats.weaponDark
    );
    rib.rotation.x = Math.PI / 2;
    rib.position.y = ry;
    fallbackGroup.add(rib);
  }
  group.add(fallbackGroup);

  // Hazard yellow-black warning band around waist (always visible!)
  const hazardBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.435, 0.435, 0.22, 20, 1, true),
    mats.hazardStripe
  );
  hazardBand.position.y = 0.58;
  group.add(hazardBand);

  // Upgrade drum body with barrel.glb mesh if loaded while keeping crimson PBR material!
  const applyBarrelGlb = (gltf: GLTF | null) => {
    if (!gltf) return;
    const clone = gltf.scene.clone(true);
    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y > 0.01) {
      const s = 1.16 / size.y;
      clone.scale.setScalar(s);
      clone.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(clone);
      clone.position.y -= box2.min.y;
    }
    clone.traverse((child) => {
      const m = child as THREE.Mesh;
      if (m.isMesh) {
        m.material = mats.explosiveBarrelRed;
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    group.remove(fallbackGroup);
    group.add(clone);
  };

  if (cachedBarrelGltf) {
    applyBarrelGlb(cachedBarrelGltf);
  } else {
    loadExplosiveBarrelAsset().then(applyBarrelGlb);
  }

  return group;
}

/**
 * Golden Tactical Supply Drop Crate (replaces floating gems with Military Airdrop Cases!)
 */
export function buildCrystalGemMesh(): THREE.Group {
  const mats = getCarbonPBRMaterials();
  const g = new THREE.Group();

  const caseBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.46, 0.52),
    mats.hardwoodCrate
  );
  caseBox.castShadow = true;
  g.add(caseBox);

  const goldStrapMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xd97706,
    emissiveIntensity: 0.55,
    roughness: 0.25,
    metalness: 0.65,
  });
  for (const ox of [-0.2, 0.2]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.48, 0.54), goldStrapMat);
    strap.position.x = ox;
    g.add(strap);
  }

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  beacon.position.y = 0.32;
  g.add(beacon);

  return g;
}

export function buildTallGrassBushCluster(_halfX: number, _halfZ: number): THREE.Group {
  return new THREE.Group();
}

function buildFallbackSoldierMesh(visorHex: number): THREE.Group {
  const g = new THREE.Group();
  const camoMat = new THREE.MeshStandardMaterial({
    color: 0x4b5563,
    roughness: 0.75,
    metalness: 0.15,
  });
  const vestMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.6,
    metalness: 0.25,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: visorHex,
    emissive: visorHex,
    emissiveIntensity: 0.65,
    roughness: 0.2,
  });

  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 6, 12), camoMat);
  legs.position.y = 0.52;
  legs.castShadow = true;
  g.add(legs);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.28), vestMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  g.add(torso);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 14), camoMat);
  helmet.position.y = 1.62;
  helmet.castShadow = true;
  g.add(helmet);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.12), visorMat);
  visor.position.set(0, 1.61, 0.17);
  g.add(visor);

  return g;
}

function attachAnimatedSoldierGltf(
  rig: StrikerRig,
  gltf: GLTF,
  fallbackGroup: THREE.Group
) {
  if (rig.disposed) return;

  gltf.scene.updateMatrixWorld(true);
  const cloned = SkeletonUtils.clone(gltf.scene) as THREE.Group;

  // Soldier.glb is natively 1.83m tall at scale 1.0, facing -Z -> rotate Y by PI so soldier faces +Z!
  const targetScale = rig.archetype === "BOSS_MECH" ? 1.36 : 1.0;
  cloned.scale.setScalar(targetScale);
  cloned.rotation.y = Math.PI;

  const pal = getRolePalette(rig.role, rig.archetype);

  const visorMat = new THREE.MeshStandardMaterial({
    color: pal.visor,
    emissive: pal.visor,
    emissiveIntensity: 0.85,
    roughness: 0.18,
    metalness: 0.6,
  });

  cloned.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    const mName = (mesh.name || "").toLowerCase();
    if (mName.includes("visor")) {
      mesh.material = visorMat;
    } else if (mesh.material) {
      const orig = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const std = (orig as THREE.MeshStandardMaterial).clone();
      if (rig.archetype === "BOSS_MECH") {
        std.color.setHex(0xd97706);
        std.emissive = new THREE.Color(0x451a03);
        std.emissiveIntensity = 0.25;
      } else if (rig.role === "ENEMY") {
        // Subtle warm crimson rim identification while preserving authentic military PBR textures!
        std.emissive = new THREE.Color(0x450a0a);
        std.emissiveIntensity = 0.18;
      } else if (rig.role === "ALLY") {
        std.emissive = new THREE.Color(0x082f49);
        std.emissiveIntensity = 0.16;
      }
      mesh.material = std;
    }
  });

  rig.bodyContainer.remove(fallbackGroup);
  rig.bodyContainer.add(cloned);

  // Bind Mixamo Skeletal Animations: Idle, Walk, Run
  const mixer = new THREE.AnimationMixer(cloned);
  const actions: Record<string, THREE.AnimationAction> = {};
  for (const clip of gltf.animations) {
    actions[clip.name] = mixer.clipAction(clip);
  }
  rig.mixer = mixer;
  rig.actions = actions;

  const idleClip = actions["Idle"];
  if (idleClip) {
    idleClip.reset().fadeIn(0.1).play();
    rig.currentAnim = "Idle";
  }
}

export function createStrikerRig(
  _accentHex: number,
  archetype: CarbonBotArchetype,
  initialWeapon: CarbonWeaponId,
  role: HeroVisualRole = "ENEMY"
): StrikerRig {
  const root = new THREE.Group();
  const pal = getRolePalette(role, archetype);

  // 1. Tactical Ground Role Indicator Ring (subtle for ME, vivid for ALLY / ENEMY)
  const groundRingGroup = new THREE.Group();
  groundRingGroup.position.y = 0.03;

  const ringOuterR = archetype === "BOSS_MECH" ? 1.15 : 0.68;
  const ringMat = new THREE.MeshBasicMaterial({
    color: pal.ring,
    transparent: true,
    opacity: role === "ME" ? 0.42 : 0.78,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const baseRing = new THREE.Mesh(
    new THREE.RingGeometry(ringOuterR - 0.09, ringOuterR, 32),
    ringMat
  );
  baseRing.rotation.x = -Math.PI / 2;
  groundRingGroup.add(baseRing);
  root.add(groundRingGroup);

  // 2. Soldier Body Container
  const bodyContainer = new THREE.Group();
  root.add(bodyContainer);

  const fallbackHero = buildFallbackSoldierMesh(pal.visor);
  bodyContainer.add(fallbackHero);

  // 3. Right-Shoulder/Chest Tactical Weapon Mount
  // Note: When facing +Z with +Y up, the soldier's RIGHT hand is at -X!
  const scaleMult = archetype === "BOSS_MECH" ? 1.35 : 1.0;
  const weaponAnchor = new THREE.Group();
  weaponAnchor.position.set(-0.22 * scaleMult, 1.32 * scaleMult, 0.16 * scaleMult);
  root.add(weaponAnchor);

  const weaponMeshes: Record<CarbonWeaponId, THREE.Group> = {
    CARBINE: buildWeaponMesh("CARBINE"),
    SHOTGUN: buildWeaponMesh("SHOTGUN"),
    RAILGUN: buildWeaponMesh("RAILGUN"),
    LOBBER: buildWeaponMesh("LOBBER"),
  };
  (Object.keys(weaponMeshes) as CarbonWeaponId[]).forEach((wid) => {
    weaponMeshes[wid].visible = wid === initialWeapon;
    if (archetype === "BOSS_MECH") weaponMeshes[wid].scale.setScalar(1.32);
    weaponAnchor.add(weaponMeshes[wid]);
  });

  // Crisp Muzzle Flash Star
  const muzzleMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const muzzleFlash = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), muzzleMat);
  muzzleFlash.scale.set(1, 1, 2.4);
  muzzleFlash.position.set(0, 0.03, 0.82);
  weaponAnchor.add(muzzleFlash);

  // Tactical Combat Roll / Sprint Dust Wake
  const dashConeGeo = new THREE.ConeGeometry(0.42, 1.4, 12, 1, true);
  dashConeGeo.rotateX(-Math.PI / 2);
  const dashMat = new THREE.MeshBasicMaterial({
    color: 0xe2e8f0,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const dashTrailCone = new THREE.Mesh(dashConeGeo, dashMat);
  dashTrailCone.position.set(0, 0.65, -0.75);
  root.add(dashTrailCone);

  // Ballistic Armor Hit-Flash Rim
  const shieldMat = createHexShieldMaterial(0x38bdf8);
  const shieldRadius = archetype === "BOSS_MECH" ? 1.35 : 0.85;
  const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(shieldRadius, 18, 14), shieldMat);
  shieldMesh.position.y = archetype === "BOSS_MECH" ? 1.35 : 1.0;
  root.add(shieldMesh);

  // Overhead Enemy / Teammate Nameplate + HP/Armor Bar (hidden for ME in TPS so camera stays clean!)
  const hudCanvas = document.createElement("canvas");
  hudCanvas.width = 256;
  hudCanvas.height = 76;
  const hudTex = new THREE.CanvasTexture(hudCanvas);
  hudTex.minFilter = THREE.LinearFilter;
  const hudSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: hudTex,
      transparent: true,
      depthTest: false,
    })
  );
  hudSprite.renderOrder = 25;
  hudSprite.scale.set(archetype === "BOSS_MECH" ? 2.9 : 2.1, archetype === "BOSS_MECH" ? 0.85 : 0.62, 1);
  hudSprite.position.y = archetype === "BOSS_MECH" ? 2.85 : 2.18;
  hudSprite.visible = role !== "ME";
  root.add(hudSprite);

  const rig: StrikerRig = {
    root,
    bodyContainer,
    groundRingGroup,
    weaponAnchor,
    weaponMeshes,
    muzzleFlash,
    dashTrailCone,
    shieldMesh,
    shieldMat,
    hudSprite,
    hudCanvas,
    hudTex,
    lastHudKey: "",
    mixer: null,
    actions: {},
    currentAnim: "Idle",
    activeWeapon: initialWeapon,
    archetype,
    role,
    recoil: 0,
    shieldFlash: 0,
    animPhase: Math.random() * Math.PI * 2,
    disposed: false,
  };

  if (cachedSoldierGltf) {
    attachAnimatedSoldierGltf(rig, cachedSoldierGltf, fallbackHero);
  } else {
    loadCarbonHeroAsset().then((gltf) => {
      if (gltf) attachAnimatedSoldierGltf(rig, gltf, fallbackHero);
    });
  }

  return rig;
}

export function syncStrikerHudPlate(
  rig: StrikerRig,
  nickname: string,
  hp: number,
  maxHp: number,
  shield: number,
  maxShield: number,
  isOverdrive: boolean,
  airdropPts = 0
) {
  if (rig.role === "ME") {
    rig.hudSprite.visible = false;
    return;
  }
  rig.hudSprite.visible = true;

  const hpPct = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
  const shPct = Math.max(0, Math.min(1, shield / Math.max(1, maxShield)));
  const key = `${nickname}|${Math.round(hpPct * 25)}|${Math.round(shPct * 25)}|${
    isOverdrive ? 1 : 0
  }|${rig.role}|${airdropPts}`;
  if (rig.lastHudKey === key) return;
  rig.lastHudKey = key;

  const pal = getRolePalette(rig.role, rig.archetype);
  const ctx = rig.hudCanvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, 256, 76);

  // Tactical Callsign Label
  const shortName = nickname.length > 15 ? nickname.slice(0, 14) + "…" : nickname;
  const label = `${isOverdrive ? "⚡ " : ""}${shortName}`;
  ctx.font = "900 20px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(2, 6, 23, 0.92)";
  ctx.strokeText(label, 128, 24);
  ctx.fillStyle = isOverdrive ? "#fde047" : "#ffffff";
  ctx.fillText(label, 128, 24);

  // Segmented HP + Ballistic Armor Plate Bar
  const bx = 34;
  const bw = 188;
  ctx.fillStyle = "rgba(2, 6, 23, 0.85)";
  ctx.beginPath();
  ctx.roundRect(bx - 3, 33, bw + 6, 24, 7);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (shPct > 0.01) {
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(bx, 36, Math.max(4, bw * shPct), 6);
  }

  ctx.fillStyle = pal.hpBar;
  ctx.fillRect(bx, 44, Math.max(4, bw * hpPct), 10);

  rig.hudTex.needsUpdate = true;
}

function fadeToSoldierAction(rig: StrikerRig, nextName: string, timeScale = 1) {
  if (!rig.mixer) return;
  const next = rig.actions[nextName];
  if (!next) return;
  next.timeScale = timeScale;
  if (rig.currentAnim === nextName) return;

  const prev = rig.actions[rig.currentAnim];
  if (prev) prev.fadeOut(0.15);
  next.reset().fadeIn(0.15).play();
  rig.currentAnim = nextName;
}

export function updateStrikerRig(
  rig: StrikerRig,
  dt: number,
  elapsedSec: number,
  moveSpeed: number,
  isAirborne: boolean,
  isDashing: boolean,
  pitch: number,
  shieldRatio: number
) {
  // 1. Update Mixamo Skeletal Soldier Animations
  if (rig.mixer) {
    if (moveSpeed > 3.6 || isDashing) {
      const runSpeed = isDashing ? 1.55 : Math.min(1.32, Math.max(0.82, moveSpeed / 5.5));
      fadeToSoldierAction(rig, "Run", runSpeed);
    } else if (moveSpeed > 0.32 && rig.actions["Walk"]) {
      fadeToSoldierAction(rig, "Walk", Math.min(1.35, Math.max(0.85, moveSpeed / 2.8)));
    } else {
      fadeToSoldierAction(rig, "Idle", 1.0);
    }
    rig.mixer.update(dt);
  } else {
    rig.animPhase += dt * (moveSpeed > 0.35 ? 10 : 2.2);
    rig.bodyContainer.position.y =
      moveSpeed > 0.35 && !isAirborne ? Math.abs(Math.sin(rig.animPhase)) * 0.05 : 0;
  }

  // Forward tactical lean during combat roll / sprint
  const targetTiltX = isDashing ? 0.32 : moveSpeed > 6.2 ? 0.08 : 0;
  rig.bodyContainer.rotation.x += (targetTiltX - rig.bodyContainer.rotation.x) * Math.min(1, dt * 12);

  // 2. Active Weapon Visibility, Vertical Aim Pitch (-pitch tilts barrel UP when facing +Z!) & Recoil
  if (rig.weaponMeshes[rig.activeWeapon] && !rig.weaponMeshes[rig.activeWeapon].visible) {
    (Object.keys(rig.weaponMeshes) as CarbonWeaponId[]).forEach((wid) => {
      rig.weaponMeshes[wid].visible = wid === rig.activeWeapon;
    });
  }

  rig.recoil = Math.max(0, rig.recoil - dt * 7.5);
  const scaleMult = rig.archetype === "BOSS_MECH" ? 1.35 : 1.0;
  // Remember: facing +Z, rotation around +X by -pitch raises +Z tip upward when pitch > 0!
  rig.weaponAnchor.rotation.x = -pitch - rig.recoil * 0.22;
  rig.weaponAnchor.position.z = 0.16 * scaleMult - rig.recoil * 0.09;

  const muzzleMat = rig.muzzleFlash.material as THREE.MeshBasicMaterial;
  if (muzzleMat.opacity > 0) {
    muzzleMat.opacity = Math.max(0, muzzleMat.opacity - dt * 18);
    rig.muzzleFlash.rotation.z += dt * 28;
  }

  // 3. Combat Roll Dust Trail
  const dashMat = rig.dashTrailCone.material as THREE.MeshBasicMaterial;
  const targetDashOp = isDashing ? 0.45 : 0;
  dashMat.opacity += (targetDashOp - dashMat.opacity) * Math.min(1, dt * 16);

  // 4. Ballistic Armor Hit-Flash
  rig.shieldFlash = Math.max(0, rig.shieldFlash - dt * 3.8);
  rig.shieldMat.uniforms.uTime.value = elapsedSec;
  const targetShieldOp = shieldRatio > 0.02 ? rig.shieldFlash * 0.65 : 0;
  rig.shieldMat.uniforms.uOpacity.value = targetShieldOp;
  rig.shieldMesh.visible = targetShieldOp > 0.01;
}

export function triggerRigMuzzleFlash(rig: StrikerRig, colorHex: number) {
  rig.recoil = 1.0;
  const mat = rig.muzzleFlash.material as THREE.MeshBasicMaterial;
  mat.color.setHex(colorHex);
  mat.opacity = 0.95;
}
