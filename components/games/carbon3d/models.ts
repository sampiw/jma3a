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

export interface SoldierGripBones {
  rightShoulder: THREE.Object3D;
  rightArm: THREE.Object3D;
  rightForeArm: THREE.Object3D;
  rightHand: THREE.Object3D;
  leftShoulder: THREE.Object3D;
  leftArm: THREE.Object3D;
  leftForeArm: THREE.Object3D;
  leftHand: THREE.Object3D;
  fingerPhalanges: THREE.Object3D[];
}

export interface StrikerRig {
  root: THREE.Group;
  bodyContainer: THREE.Group;
  groundRingGroup: THREE.Group;
  weaponAnchor: THREE.Group;
  rightWristSocket: THREE.Object3D;
  leftWristSocket: THREE.Object3D;
  weaponMeshes: Record<CarbonWeaponId, THREE.Group>;
  muzzleFlash: THREE.Mesh;
  dashTrailCone: THREE.Mesh;
  turboAuraRing: THREE.Mesh;
  shieldMesh: THREE.Mesh;
  shieldMat: THREE.ShaderMaterial;
  hudSprite: THREE.Sprite;
  hudCanvas: HTMLCanvasElement;
  hudTex: THREE.CanvasTexture;
  lastHudKey: string;
  mixer: THREE.AnimationMixer | null;
  actions: Record<string, THREE.AnimationAction>;
  gripBones: SoldierGripBones | null;
  currentAnim: string;
  activeWeapon: CarbonWeaponId;
  archetype: CarbonBotArchetype;
  role: HeroVisualRole;
  recoil: number;
  shieldFlash: number;
  animPhase: number;
  heroLoaded?: boolean;
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
 * Every weapon features an ergonomic Pistol Grip @ (0, -0.065, 0.01) & Foregrip/Handguard @ (0, -0.025, 0.30)
 * so the 2-Bone IK solver wraps both of the soldier's hands directly onto the weapon!
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

  // Shared Ergonomic Pistol Grip (Right Hand Trigger Grip)
  const pistolGrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.042, 0.115, 0.052),
    mats.weaponDark
  );
  pistolGrip.position.set(0, -0.062, 0.012);
  pistolGrip.rotation.x = -0.24;
  g.add(pistolGrip);

  if (weaponId === "CARBINE") {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, 0.22), mats.weaponDark);
    stock.position.set(0, -0.01, -0.13);
    g.add(stock);

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.11, 0.28), mats.weaponDark);
    receiver.position.set(0, 0.012, 0.09);
    g.add(receiver);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.17, 0.075), mats.weaponSteel);
    mag.position.set(0, -0.1, 0.145);
    mag.rotation.x = 0.22;
    g.add(mag);

    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.078, 0.28), mats.weaponTan);
    handguard.position.set(0, 0.02, 0.34);
    g.add(handguard);

    // Tactical Vertical Foregrip (Left Hand Support Grip)
    const foregrip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.02, 0.095, 8),
      mats.weaponDark
    );
    foregrip.position.set(0, -0.042, 0.31);
    g.add(foregrip);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.02, 0.28, 10),
      mats.weaponSteel
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.025, 0.56);
    g.add(barrel);

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

    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 10), mats.weaponTan);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.012, 0.33);
    g.add(pump);
  } else if (weaponId === "RAILGUN") {
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.12, 0.56), mats.weaponTan);
    chassis.position.set(0, 0.005, 0.1);
    g.add(chassis);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.024, 0.68, 12),
      mats.weaponDark
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.032, 0.64);
    g.add(barrel);

    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.038, 0.085), mats.weaponSteel);
    brake.position.set(0, 0.032, 0.98);
    g.add(brake);

    const scopeTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.024, 0.34, 14),
      mats.weaponDark
    );
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.11, 0.15);
    g.add(scopeTube);

    const scopeLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.015, 14),
      opticMat
    );
    scopeLens.rotation.x = Math.PI / 2;
    scopeLens.position.set(0, 0.11, 0.32);
    g.add(scopeLens);
  } else {
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

    const foregrip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.021, 0.095, 8),
      mats.weaponDark
    );
    foregrip.position.set(0, -0.045, 0.32);
    g.add(foregrip);

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
 * Shootable Red Hazard Explosive Barrel
 */
export function buildExplosiveBarrelMesh(): THREE.Group {
  const mats = getCarbonPBRMaterials();
  const group = new THREE.Group();

  const fallbackGroup = new THREE.Group();
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 1.16, 18),
    mats.explosiveBarrelRed
  );
  drum.position.y = 0.58;
  drum.castShadow = true;
  drum.receiveShadow = true;
  fallbackGroup.add(drum);

  for (const ry of [0.18, 0.58, 0.98]) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(0.43, 0.025, 8, 20),
      mats.weaponDark
    );
    rib.rotation.x = Math.PI / 2;
    rib.position.y = ry;
    fallbackGroup.add(rib);
  }
  group.add(fallbackGroup);

  const hazardBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.435, 0.435, 0.22, 18, 1, true),
    mats.hazardStripe
  );
  hazardBand.position.y = 0.58;
  group.add(hazardBand);

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
 * Golden Tactical Supply Drop Crate
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

  // Two-handed rifle arms on fallback mesh while Soldier.glb streams in
  const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.34, 4, 8), camoMat);
  rightArm.position.set(-0.18, 1.31, 0.08);
  rightArm.rotation.x = Math.PI / 2.2;
  g.add(rightArm);

  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.42, 4, 8), camoMat);
  leftArm.position.set(0.05, 1.32, 0.22);
  leftArm.rotation.set(Math.PI / 2.1, 0, 0.52);
  g.add(leftArm);

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

  const boneMap = new Map<string, THREE.Object3D>();
  const fingerPhalanges: THREE.Object3D[] = [];

  cloned.traverse((obj) => {
    if (obj.name) {
      const clean = obj.name.replace(/^mixamorig:?/i, "");
      boneMap.set(clean, obj);
      if (
        /^(Right|Left)Hand(Index|Middle|Ring|Pinky)[12]$/.test(clean)
      ) {
        fingerPhalanges.push(obj);
      }
    }

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
        std.emissive = new THREE.Color(0x450a0a);
        std.emissiveIntensity = 0.18;
      } else if (rig.role === "ALLY") {
        std.emissive = new THREE.Color(0x082f49);
        std.emissiveIntensity = 0.16;
      }
      mesh.material = std;
    }
  });

  const rSh = boneMap.get("RightShoulder");
  const rArm = boneMap.get("RightArm");
  const rFore = boneMap.get("RightForeArm");
  const rHand = boneMap.get("RightHand");
  const lSh = boneMap.get("LeftShoulder");
  const lArm = boneMap.get("LeftArm");
  const lFore = boneMap.get("LeftForeArm");
  const lHand = boneMap.get("LeftHand");

  if (rSh && rArm && rFore && rHand && lSh && lArm && lFore && lHand) {
    rig.gripBones = {
      rightShoulder: rSh,
      rightArm: rArm,
      rightForeArm: rFore,
      rightHand: rHand,
      leftShoulder: lSh,
      leftArm: lArm,
      leftForeArm: lFore,
      leftHand: lHand,
      fingerPhalanges,
    };
  }

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

  // 1. Tactical Ground Role Indicator Ring
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
    new THREE.RingGeometry(ringOuterR - 0.09, ringOuterR, 28),
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

  // 3. Two-Handed Shouldered Weapon Mount + Explicit Right/Left Wrist IK Sockets
  const scaleMult = archetype === "BOSS_MECH" ? 1.35 : 1.0;
  const weaponAnchor = new THREE.Group();
  weaponAnchor.position.set(-0.145 * scaleMult, 1.35 * scaleMult, 0.16 * scaleMult);
  weaponAnchor.rotation.y = 0.13;
  root.add(weaponAnchor);

  const rightWristSocket = new THREE.Object3D();
  rightWristSocket.position.set(0.0, -0.062 * scaleMult, -0.11 * scaleMult);
  const leftWristSocket = new THREE.Object3D();
  leftWristSocket.position.set(0.055 * scaleMult, -0.028 * scaleMult, 0.2 * scaleMult);
  weaponAnchor.add(rightWristSocket, leftWristSocket);

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

  // Tactical Combat Slide/Dash Wake
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

  // Active Ability: Turbo Sprint Adrenaline Speed Ring
  const turboMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const turboAuraRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.78, 0.95, 18, 1, true),
    turboMat
  );
  turboAuraRing.position.y = 0.72;
  root.add(turboAuraRing);

  // Ballistic Armor Hit-Flash Rim
  const shieldMat = createHexShieldMaterial(0x38bdf8);
  const shieldRadius = archetype === "BOSS_MECH" ? 1.35 : 0.85;
  const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(shieldRadius, 16, 12), shieldMat);
  shieldMesh.position.y = archetype === "BOSS_MECH" ? 1.35 : 1.0;
  root.add(shieldMesh);

  // Overhead Enemy / Teammate Nameplate + HP/Armor Bar
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
  hudSprite.scale.set(
    archetype === "BOSS_MECH" ? 2.9 : 2.1,
    archetype === "BOSS_MECH" ? 0.85 : 0.62,
    1
  );
  hudSprite.position.y = archetype === "BOSS_MECH" ? 2.85 : 2.18;
  hudSprite.visible = role !== "ME";
  root.add(hudSprite);

  const rig: StrikerRig = {
    root,
    bodyContainer,
    groundRingGroup,
    weaponAnchor,
    rightWristSocket,
    leftWristSocket,
    weaponMeshes,
    muzzleFlash,
    dashTrailCone,
    turboAuraRing,
    shieldMesh,
    shieldMat,
    hudSprite,
    hudCanvas,
    hudTex,
    lastHudKey: "",
    mixer: null,
    actions: {},
    gripBones: null,
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

  const shortName = nickname.length > 15 ? nickname.slice(0, 14) + "…" : nickname;
  const label = `${isOverdrive ? "⚡ " : ""}${shortName}`;
  ctx.font = "900 20px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(2, 6, 23, 0.92)";
  ctx.strokeText(label, 128, 24);
  ctx.fillStyle = isOverdrive ? "#fde047" : "#ffffff";
  ctx.fillText(label, 128, 24);

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

// Pre-allocated zero-GC scratch math objects for 60FPS Two-Bone Arm IK!
const _parentQuat = new THREE.Quaternion();
const _targetQuat = new THREE.Quaternion();
const _rootWorldQuat = new THREE.Quaternion();
const _gunWorldQuat = new THREE.Quaternion();
const _basisMat = new THREE.Matrix4();
const _dirY = new THREE.Vector3();
const _dirZ = new THREE.Vector3();
const _dirX = new THREE.Vector3();
const _rootPos = new THREE.Vector3();
const _elbowPos = new THREE.Vector3();
const _wristPos = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _bendDir = new THREE.Vector3();
const _solvedElbow = new THREE.Vector3();
const _solvedWrist = new THREE.Vector3();
const _handEnd = new THREE.Vector3();
const _rWristTarget = new THREE.Vector3();
const _lWristTarget = new THREE.Vector3();
const _rPoleWorld = new THREE.Vector3();
const _lPoleWorld = new THREE.Vector3();
const _rRollWorld = new THREE.Vector3();
const _lRollWorld = new THREE.Vector3();
const _gunFwdWorld = new THREE.Vector3();
const _lHandAimWorld = new THREE.Vector3();
const _shPos = new THREE.Vector3();
const _shAim = new THREE.Vector3();
const _shRoll = new THREE.Vector3();

function aimBoneYAxisWorld(
  bone: THREE.Object3D,
  worldFrom: THREE.Vector3,
  worldTo: THREE.Vector3,
  rollHintWorld: THREE.Vector3
) {
  const parent = bone.parent;
  if (!parent) return;
  parent.updateMatrixWorld(false);
  parent.getWorldQuaternion(_parentQuat);

  _dirY.subVectors(worldTo, worldFrom);
  if (_dirY.lengthSq() < 1e-8) return;
  _dirY.normalize();

  _dirZ.copy(rollHintWorld).addScaledVector(_dirY, -rollHintWorld.dot(_dirY));
  if (_dirZ.lengthSq() < 1e-5) {
    _dirZ.set(0, 1, 0).addScaledVector(_dirY, -_dirY.y);
  }
  _dirZ.normalize();

  _dirX.crossVectors(_dirY, _dirZ).normalize();
  _dirZ.crossVectors(_dirX, _dirY).normalize();

  _basisMat.makeBasis(_dirX, _dirY, _dirZ);
  _targetQuat.setFromRotationMatrix(_basisMat);
  bone.quaternion.copy(_parentQuat.invert().multiply(_targetQuat));
  bone.updateMatrixWorld(true);
}

function solveTwoBoneArmIK(
  upperBone: THREE.Object3D,
  foreBone: THREE.Object3D,
  handBone: THREE.Object3D,
  wristTargetWorld: THREE.Vector3,
  poleWorld: THREE.Vector3,
  palmRollWorld: THREE.Vector3,
  handAimWorld: THREE.Vector3
) {
  if (upperBone.parent) upperBone.parent.updateMatrixWorld(true);
  upperBone.getWorldPosition(_rootPos);
  foreBone.getWorldPosition(_elbowPos);
  handBone.getWorldPosition(_wristPos);

  const L1 = Math.max(0.12, _rootPos.distanceTo(_elbowPos));
  const L2 = Math.max(0.12, _elbowPos.distanceTo(_wristPos));

  _toTarget.subVectors(wristTargetWorld, _rootPos);
  const rawDist = _toTarget.length();
  const maxReach = (L1 + L2) * 0.992;
  const minReach = Math.abs(L1 - L2) + 0.03;
  const dist = Math.max(minReach, Math.min(maxReach, rawDist));
  if (rawDist > 1e-5) _toTarget.divideScalar(rawDist);
  else _toTarget.set(0, 0, 1);

  const cosA = Math.max(-1, Math.min(1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist)));
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

  _bendDir.subVectors(poleWorld, _rootPos);
  _bendDir.addScaledVector(_toTarget, -_bendDir.dot(_toTarget));
  if (_bendDir.lengthSq() < 1e-5) _bendDir.set(0, -1, 0);
  _bendDir.normalize();

  _solvedElbow
    .copy(_rootPos)
    .addScaledVector(_toTarget, L1 * cosA)
    .addScaledVector(_bendDir, L1 * sinA);
  _solvedWrist.copy(_rootPos).addScaledVector(_toTarget, dist);

  aimBoneYAxisWorld(upperBone, _rootPos, _solvedElbow, _bendDir);
  foreBone.getWorldPosition(_elbowPos);
  aimBoneYAxisWorld(foreBone, _elbowPos, _solvedWrist, palmRollWorld);
  handBone.getWorldPosition(_wristPos);
  _handEnd.copy(_wristPos).add(handAimWorld);
  aimBoneYAxisWorld(handBone, _wristPos, _handEnd, palmRollWorld);
}

export function updateStrikerRig(
  rig: StrikerRig,
  dt: number,
  elapsedSec: number,
  moveSpeed: number,
  isAirborne: boolean,
  isDashing: boolean,
  pitch: number,
  shieldRatio: number,
  isTurboSprint = false
) {
  // 1. Update Mixamo Skeletal Soldier Lower-Body & Torso Animations
  if (rig.mixer) {
    if (moveSpeed > 3.6 || isDashing || isTurboSprint) {
      const runSpeed = isDashing
        ? 1.6
        : isTurboSprint
        ? 1.48
        : Math.min(1.32, Math.max(0.82, moveSpeed / 6.0));
      fadeToSoldierAction(rig, "Run", runSpeed);
    } else if (moveSpeed > 0.32 && rig.actions["Walk"]) {
      fadeToSoldierAction(rig, "Walk", Math.min(1.35, Math.max(0.85, moveSpeed / 3.0)));
    } else {
      fadeToSoldierAction(rig, "Idle", 1.0);
    }
    rig.mixer.update(dt);
  } else {
    rig.animPhase += dt * (moveSpeed > 0.35 ? 10 : 2.2);
    rig.bodyContainer.position.y =
      moveSpeed > 0.35 && !isAirborne ? Math.abs(Math.sin(rig.animPhase)) * 0.05 : 0;
  }

  // Forward tactical lean during combat slide / turbo sprint
  const targetTiltX = isDashing ? 0.32 : isTurboSprint ? 0.16 : moveSpeed > 6.8 ? 0.08 : 0;
  rig.bodyContainer.rotation.x +=
    (targetTiltX - rig.bodyContainer.rotation.x) * Math.min(1, dt * 12);

  // 2. Active Weapon Visibility, Shouldered Stance, Vertical Aim Pitch & Recoil
  if (rig.weaponMeshes[rig.activeWeapon] && !rig.weaponMeshes[rig.activeWeapon].visible) {
    (Object.keys(rig.weaponMeshes) as CarbonWeaponId[]).forEach((wid) => {
      rig.weaponMeshes[wid].visible = wid === rig.activeWeapon;
    });
  }

  rig.recoil = Math.max(0, rig.recoil - dt * 7.5);
  const scaleMult = rig.archetype === "BOSS_MECH" ? 1.35 : 1.0;
  const clampedPitch = Math.max(-0.55, Math.min(0.65, pitch));
  const sprintBob =
    moveSpeed > 3.5 && !isAirborne ? Math.sin(elapsedSec * (isTurboSprint ? 15 : 11)) * 0.018 : 0;

  // Position rifle snug against right shoulder & chest; angle slightly across chest during Turbo Sprint
  rig.weaponAnchor.position.set(
    -0.145 * scaleMult,
    (1.345 + sprintBob) * scaleMult,
    (0.165 - rig.recoil * 0.085) * scaleMult
  );
  rig.weaponAnchor.rotation.set(
    -clampedPitch - rig.recoil * 0.22 + (isTurboSprint && rig.recoil < 0.05 ? 0.14 : 0),
    isTurboSprint && rig.recoil < 0.05 ? 0.34 : 0.13,
    0
  );

  // 3. Solve Two-Handed Rifle Grip IK so BOTH Hands Hold the Weapon in 3D!
  if (rig.gripBones) {
    rig.root.updateMatrixWorld(true);
    rig.root.getWorldQuaternion(_rootWorldQuat);
    rig.weaponAnchor.getWorldQuaternion(_gunWorldQuat);

    const gb = rig.gripBones;
    // Protract Left Clavicle slightly forward so Left Palm easily reaches the barrel handguard
    gb.leftShoulder.getWorldPosition(_shPos);
    _shAim.set(0.72, -0.15, 0.68).applyQuaternion(_rootWorldQuat).add(_shPos);
    _shRoll.set(0, 0, -1).applyQuaternion(_rootWorldQuat);
    aimBoneYAxisWorld(gb.leftShoulder, _shPos, _shAim, _shRoll);

    rig.rightWristSocket.getWorldPosition(_rWristTarget);
    rig.leftWristSocket.getWorldPosition(_lWristTarget);

    _rPoleWorld.set(-0.36 * scaleMult, 1.08 * scaleMult, -0.06 * scaleMult);
    rig.root.localToWorld(_rPoleWorld);
    _lPoleWorld.set(0.32 * scaleMult, 1.06 * scaleMult, 0.12 * scaleMult);
    rig.root.localToWorld(_lPoleWorld);

    _rRollWorld.set(1, 0, 0).applyQuaternion(_rootWorldQuat);
    _lRollWorld.set(-0.5, 0.85, 0).normalize().applyQuaternion(_rootWorldQuat);

    _gunFwdWorld.set(0, 0, 1).applyQuaternion(_gunWorldQuat);
    _lHandAimWorld.set(-0.42, 0.08, 0.9).normalize().applyQuaternion(_gunWorldQuat);

    solveTwoBoneArmIK(
      gb.rightArm,
      gb.rightForeArm,
      gb.rightHand,
      _rWristTarget,
      _rPoleWorld,
      _rRollWorld,
      _gunFwdWorld
    );
    solveTwoBoneArmIK(
      gb.leftArm,
      gb.leftForeArm,
      gb.leftHand,
      _lWristTarget,
      _lPoleWorld,
      _lRollWorld,
      _lHandAimWorld
    );

    // Curl fingers around pistol grip & foregrip
    for (let i = 0; i < gb.fingerPhalanges.length; i++) {
      gb.fingerPhalanges[i].rotation.z = gb.fingerPhalanges[i].name.includes("Right") ? -0.85 : 0.85;
    }
  }

  const muzzleMat = rig.muzzleFlash.material as THREE.MeshBasicMaterial;
  if (muzzleMat.opacity > 0) {
    muzzleMat.opacity = Math.max(0, muzzleMat.opacity - dt * 18);
    rig.muzzleFlash.rotation.z += dt * 28;
  }

  // 4. Combat Slide Trail & Turbo Sprint Speed Aura
  const dashMat = rig.dashTrailCone.material as THREE.MeshBasicMaterial;
  const targetDashOp = isDashing ? 0.48 : 0;
  dashMat.opacity += (targetDashOp - dashMat.opacity) * Math.min(1, dt * 16);

  const turboMat = rig.turboAuraRing.material as THREE.MeshBasicMaterial;
  const targetTurboOp = isTurboSprint ? 0.34 + Math.sin(elapsedSec * 14) * 0.08 : 0;
  turboMat.opacity += (targetTurboOp - turboMat.opacity) * Math.min(1, dt * 14);
  rig.turboAuraRing.visible = turboMat.opacity > 0.01;
  if (rig.turboAuraRing.visible) {
    rig.turboAuraRing.rotation.y = elapsedSec * 6.5;
  }

  // 5. Ballistic Armor Hit-Flash
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
