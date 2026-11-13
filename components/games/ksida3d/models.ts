import * as THREE from "three";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  KSIDA_TAUNTS,
  KSIDA_VEHICLES,
  KsidaItemId,
  KsidaTauntId,
  KsidaVehicleId,
} from "@/games/ksida3d/types";

const WATERMELON_GLB = "/models/food/watermelon.glb";
const TAJINE_GLB = "/models/food/tajine.glb";
const BARREL_GLB = "/models/food/barrel.glb";
const BOX_GLB = "/models/furniture/cardboardBoxClosed.glb";

const PALM_BEND_GLB = "/models/ksida/palm-bend.glb";
const PALM_STRAIGHT_GLB = "/models/ksida/palm-straight.glb";
const ROCKS_A_GLB = "/models/ksida/rocks-a.glb";
const ROCKS_B_GLB = "/models/ksida/rocks-b.glb";
const KASBAH_TOWER_GLB = "/models/ksida/kasbah-tower.glb";
const WATCH_TOWER_GLB = "/models/ksida/watch-tower.glb";

const BUILDING_GLBS = [
  "/models/ksida/city/building-a.glb",
  "/models/ksida/city/building-c.glb",
  "/models/ksida/city/building-f.glb",
  "/models/ksida/city/building-j.glb",
];

const FOUNTAIN_GLB = "/models/ksida/fantasy/fountain.glb";
const STALL_RED_GLB = "/models/ksida/fantasy/stall-red.glb";
const STALL_GREEN_GLB = "/models/ksida/fantasy/stall-green.glb";

const CONE_GLB = "/models/cars/cone.glb";
const TIRE_GLB = "/models/cars/debris-tire.glb";

const gltfCache = new Map<string, GLTF>();
const gltfPromises = new Map<string, Promise<GLTF | null>>();
const tintedCarMatCache = new Map<string, THREE.MeshStandardMaterial>();

export function preloadKsidaPropAssets(): void {
  if (typeof window === "undefined") return;
  const allUrls = [
    ...Object.values(KSIDA_VEHICLES).map((v) => v.glbPath),
    WATERMELON_GLB,
    TAJINE_GLB,
    BARREL_GLB,
    BOX_GLB,
    PALM_BEND_GLB,
    PALM_STRAIGHT_GLB,
    ROCKS_A_GLB,
    ROCKS_B_GLB,
    KASBAH_TOWER_GLB,
    WATCH_TOWER_GLB,
    ...BUILDING_GLBS,
    FOUNTAIN_GLB,
    STALL_RED_GLB,
    STALL_GREEN_GLB,
    CONE_GLB,
    TIRE_GLB,
  ];
  for (const url of allUrls) {
    loadPropGltf(url);
  }
}

export function loadPropGltf(url: string): Promise<GLTF | null> {
  if (gltfCache.has(url)) return Promise.resolve(gltfCache.get(url)!);
  if (gltfPromises.has(url)) return gltfPromises.get(url)!;
  if (typeof window === "undefined") return Promise.resolve(null);

  const loader = new GLTFLoader();
  const p = new Promise<GLTF | null>((resolve) => {
    loader.load(
      url,
      (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        gltfCache.set(url, gltf);
        resolve(gltf);
      },
      undefined,
      () => resolve(null)
    );
  });
  gltfPromises.set(url, p);
  return p;
}

function attachClonedProp(
  target: THREE.Group,
  url: string,
  scale: number,
  yOffset = 0,
  onReady?: (root: THREE.Object3D) => void
) {
  loadPropGltf(url).then((gltf) => {
    if (!gltf) return;
    const clone = gltf.scene.clone(true);
    clone.scale.setScalar(scale);
    clone.position.y = yOffset;
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    if (onReady) onReady(clone);
    target.add(clone);
  });
}

/**
 * Selectively recolors the primary body paint swatch on a Kenney Car Kit colormap texture
 * while keeping dark tires, black bumpers, silver rims, headlights, and blue glass windows untouched!
 */
function getMoroccanLiveryMaterial(
  srcMat: THREE.MeshStandardMaterial,
  vehicle: KsidaVehicleId
): THREE.MeshStandardMaterial {
  const cacheKey = `${vehicle}_${srcMat.uuid}`;
  if (tintedCarMatCache.has(cacheKey)) {
    return tintedCarMatCache.get(cacheKey)!;
  }

  // Vehicles whose native Kenney palette already matches their Moroccan persona perfectly:
  if (
    vehicle === "C15_KHATTAF" ||
    vehicle === "TRIPORTEUR" ||
    vehicle === "JADARMIYA"
  ) {
    const cleanClone = srcMat.clone();
    cleanClone.roughness = 0.34;
    cleanClone.metalness = 0.22;
    tintedCarMatCache.set(cacheKey, cleanClone);
    return cleanClone;
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

  // Target RGB livery color:
  // TAXI_HMER -> Casablanca Petit Taxi Crimson Red
  // MERCEDES_240 -> Grand Taxi Warm Ivory / Champagne Cream
  // LOGAN_ECOLE -> Driving School Sunny Yellow
  const targetRGB =
    vehicle === "TAXI_HMER"
      ? [225, 29, 46]
      : vehicle === "MERCEDES_240"
      ? [248, 232, 184]
      : [250, 204, 21];

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC - minC;

    // Skip dark tires/trim, neutral grays/whites, and cyan/blue window glass!
    const isWindowBlue = b > r + 18 && b > 110;
    if (sat < 52 || maxC < 85 || isWindowBlue) continue;

    // Preserve original baked shading luminance!
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 215;
    const shade = Math.max(0.45, Math.min(1.18, lum));
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
  mat.roughness = 0.3;
  mat.metalness = 0.28;
  tintedCarMatCache.set(cacheKey, mat);
  return mat;
}

export interface KsidaCarRig {
  root: THREE.Group;
  chassis: THREE.Group;
  vehicle: KsidaVehicleId;
  frontSteerPivots: THREE.Group[];
  wheelMeshes: THREE.Object3D[];
  brakeLights: THREE.Mesh[];
  sirenLights: THREE.Mesh[];
  damageSmokePuffs: THREE.Mesh[];
  exhaustFlames: THREE.Mesh[];
  driftSparks: THREE.Mesh[];
  shieldBubble: THREE.Mesh;
  crownGroup: THREE.Group;
  hotBombGroup: THREE.Group;
  hudSprite: THREE.Sprite;
  hudCanvas: HTMLCanvasElement;
  hudTex: THREE.CanvasTexture;
  lastHudKey: string;
  wheelSpinAngle: number;
}

export function buildButagazCylinderMesh(colorHex = 0xdc2626, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28 * scale, 0.28 * scale, 0.56 * scale, 14),
    new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.38,
      metalness: 0.45,
    })
  );
  body.position.y = 0.28 * scale;
  g.add(body);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.275 * scale, 14, 10),
    new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.38,
      metalness: 0.45,
    })
  );
  dome.position.y = 0.52 * scale;
  g.add(dome);

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.16 * scale, 0.035 * scale, 8, 14),
    new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.6, roughness: 0.3 })
  );
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.76 * scale;
  g.add(collar);

  return g;
}

function createSignTexture(
  bg: string,
  border: string,
  text: string,
  textColor: string
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = border;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 86);
  ctx.fillStyle = textColor;
  ctx.font = "900 36px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createKsidaCarRig(
  vehicle: KsidaVehicleId,
  isMe: boolean
): KsidaCarRig {
  const spec = KSIDA_VEHICLES[vehicle] || KSIDA_VEHICLES.TAXI_HMER;
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);

  // Subtle player halo ring under the car
  const ringGeo = new THREE.RingGeometry(1.42, 1.68, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isMe ? 0x22c55e : spec.bodyHex,
    transparent: true,
    opacity: isMe ? 0.75 : 0.36,
    depthWrite: false,
  });
  const groundRing = new THREE.Mesh(ringGeo, ringMat);
  groundRing.position.y = 0.04;
  root.add(groundRing);

  const frontSteerPivots: THREE.Group[] = [];
  const wheelMeshes: THREE.Object3D[] = [];
  const brakeLights: THREE.Mesh[] = [];
  const sirenLights: THREE.Mesh[] = [];

  // Instant placeholder hull for ~1 frame until cached GLB attaches
  const placeholderHull = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.85, 3.55),
    new THREE.MeshStandardMaterial({ color: spec.bodyHex, roughness: 0.35 })
  );
  placeholderHull.position.y = 0.65;
  chassis.add(placeholderHull);

  // Load & mount real Kenney Car Kit 3D .glb vehicle + articulated wheels!
  const CAR_SCALE = 1.38;
  loadPropGltf(spec.glbPath).then((gltf) => {
    if (!gltf) return;
    chassis.remove(placeholderHull);

    const carModel = gltf.scene.clone(true);
    carModel.scale.setScalar(CAR_SCALE);

    // Apply Moroccan Livery Paint & enable crisp shadows
    carModel.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material && (mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          mesh.material = getMoroccanLiveryMaterial(
            mesh.material as THREE.MeshStandardMaterial,
            vehicle
          );
        }
      }
    });

    // Discover named GLB wheel nodes (`wheel-front-left`, `wheel-front-right`, `wheel-back-*`)
    const frontNodes: THREE.Object3D[] = [];
    const rearNodes: THREE.Object3D[] = [];
    carModel.traverse((node) => {
      const nm = (node.name || "").toLowerCase();
      if (nm.startsWith("wheel-front")) {
        frontNodes.push(node);
      } else if (nm.startsWith("wheel-back") && nm !== "wheel-back") {
        rearNodes.push(node);
      }
    });

    for (const fw of frontNodes) {
      const parent = fw.parent;
      if (parent) {
        const pivot = new THREE.Group();
        pivot.position.copy(fw.position);
        parent.add(pivot);
        fw.position.set(0, 0, 0);
        pivot.add(fw);
        frontSteerPivots.push(pivot);
      }
      wheelMeshes.push(fw);
    }
    for (const rw of rearNodes) {
      wheelMeshes.push(rw);
    }

    chassis.add(carModel);
  });

  // === SIGNATURE MOROCCAN ROOF & CARGO 3D ATTACHMENTS ===
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.18,
    metalness: 0.88,
  });

  if (vehicle === "TAXI_HMER") {
    const taxiTex = createSignTexture("#ffffff", "#dc2626", "TAXI طاكسي", "#dc2626");
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.28, 0.3),
      new THREE.MeshBasicMaterial({ map: taxiTex })
    );
    sign.position.set(0, 1.92, -0.04);
    chassis.add(sign);
  } else if (vehicle === "MERCEDES_240") {
    const rackFrame = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.07, 1.38), chromeMat);
    rackFrame.position.set(0, 1.66, -0.08);
    chassis.add(rackFrame);

    const suitcase = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.26, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.58 })
    );
    suitcase.position.set(-0.26, 1.82, 0.16);
    suitcase.rotation.y = 0.15;
    chassis.add(suitcase);

    const roofPropAnchor = new THREE.Group();
    roofPropAnchor.position.set(0.26, 1.68, -0.25);
    chassis.add(roofPropAnchor);
    attachClonedProp(roofPropAnchor, BOX_GLB, 1.15, 0);
    attachClonedProp(roofPropAnchor, TAJINE_GLB, 1.35, 0.38);
  } else if (vehicle === "C15_KHATTAF") {
    for (const [bx, bz, col] of [
      [-0.36, -0.45, 0xdc2626],
      [0.36, -0.45, 0x2563eb],
      [0.0, -1.02, 0xdc2626],
    ]) {
      const cyl = buildButagazCylinderMesh(col, 0.82);
      cyl.position.set(bx, 1.64, bz);
      chassis.add(cyl);
    }
  } else if (vehicle === "TRIPORTEUR") {
    // Load real 3D Watermelons & Tagine onto the open flatbed of `delivery-flat.glb`!
    const cargoGroup = new THREE.Group();
    cargoGroup.position.set(0, 0.62, -0.78);
    chassis.add(cargoGroup);

    for (const [mx, mz] of [
      [-0.38, -0.35],
      [0.38, -0.35],
      [-0.32, 0.25],
      [0.32, 0.25],
    ]) {
      const slot = new THREE.Group();
      slot.position.set(mx, 0, mz);
      cargoGroup.add(slot);
      attachClonedProp(slot, WATERMELON_GLB, 1.65, 0);
    }
    attachClonedProp(cargoGroup, TAJINE_GLB, 1.65, 0.18);
  } else if (vehicle === "LOGAN_ECOLE") {
    const ecoleTex = createSignTexture("#fef08a", "#dc2626", "AUTO-ÉCOLE", "#b91c1c");
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(1.08, 0.34, 0.32),
      new THREE.MeshBasicMaterial({ map: ecoleTex })
    );
    sign.position.set(0, 1.48, -0.06);
    chassis.add(sign);
  } else if (vehicle === "JADARMIYA") {
    // Flashing Red & Blue Jadarmiya Roof Lightbar!
    const redBeacon = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.16, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xff1e42 })
    );
    redBeacon.position.set(-0.28, 1.62, -0.05);
    const blueBeacon = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.16, 0.22),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    blueBeacon.position.set(0.28, 1.62, -0.05);
    chassis.add(redBeacon, blueBeacon);
    sirenLights.push(redBeacon, blueBeacon);
  }

  // Glowing Rear Brake Lights
  const brakeGeo = new THREE.BoxGeometry(0.32, 0.14, 0.08);
  const brakeMat = new THREE.MeshBasicMaterial({
    color: 0xff1e42,
    transparent: true,
    opacity: 0.85,
  });
  for (const sx of [-0.62, 0.62]) {
    const bl = new THREE.Mesh(brakeGeo, brakeMat.clone());
    bl.position.set(sx, 0.62, -1.92);
    chassis.add(bl);
    brakeLights.push(bl);
  }

  // Low-HP Hood Damage Smoke Puffs (visible when HP < 45%)
  const damageSmokePuffs: THREE.Mesh[] = [];
  const smokeGeo = new THREE.DodecahedronGeometry(0.28, 0);
  for (let i = 0; i < 3; i++) {
    const sm = new THREE.Mesh(
      smokeGeo,
      new THREE.MeshBasicMaterial({
        color: 0x334155,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    sm.visible = false;
    chassis.add(sm);
    damageSmokePuffs.push(sm);
  }

  // Twin Nitro Exhaust Flame Cones
  const exhaustFlames: THREE.Mesh[] = [];
  const flameGeo = new THREE.ConeGeometry(0.18, 1.1, 10);
  flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (const sx of [-0.45, 0.45]) {
    const fl = new THREE.Mesh(flameGeo, flameMat.clone());
    fl.position.set(sx, 0.38, -2.15);
    fl.visible = false;
    chassis.add(fl);
    exhaustFlames.push(fl);
  }

  // Rear Tire 3-Stage Drift Sparks (Cyan -> Gold -> Purple!)
  const driftSparks: THREE.Mesh[] = [];
  const sparkGeo = new THREE.OctahedronGeometry(0.28, 0);
  for (const sx of [-0.85, 0.85]) {
    const sp = new THREE.Mesh(
      sparkGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.94,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    sp.position.set(sx, 0.24, -1.22);
    sp.visible = false;
    chassis.add(sp);
    driftSparks.push(sp);
  }

  // Spawn Shield / Mint Tea Overdrive Aura Bubble
  const shieldBubble = new THREE.Mesh(
    new THREE.SphereGeometry(2.25, 18, 14),
    new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.24,
      wireframe: true,
      depthWrite: false,
    })
  );
  shieldBubble.position.y = 0.95;
  shieldBubble.visible = false;
  root.add(shieldBubble);

  // Golden Tagine Crown Holder Group (DERBY mode)
  const crownGroup = new THREE.Group();
  crownGroup.position.set(0, 2.55, 0);
  crownGroup.visible = false;
  const crownCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.46, 0.6, 12),
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 0.6,
      metalness: 0.85,
      roughness: 0.18,
    })
  );
  crownGroup.add(crownCone);
  const crownBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.56, 0.44, 0.14, 14),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8, roughness: 0.2 })
  );
  crownBase.position.y = -0.26;
  crownGroup.add(crownBase);
  root.add(crownGroup);

  // Ticking Hot Butagaz Roof Bomb Group (HOT_BOMB mode)
  const hotBombGroup = new THREE.Group();
  hotBombGroup.position.set(0, 2.38, 0);
  hotBombGroup.visible = false;
  const giantButa = buildButagazCylinderMesh(0xef4444, 1.55);
  hotBombGroup.add(giantButa);
  const fuseSpark = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.28, 0),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  fuseSpark.position.y = 1.32;
  hotBombGroup.add(fuseSpark);
  root.add(hotBombGroup);

  // Overhead Driver Nameplate + HP + Meme Speech Bubble Sprite
  const hudCanvas = document.createElement("canvas");
  hudCanvas.width = 384;
  hudCanvas.height = 160;
  const hudTex = new THREE.CanvasTexture(hudCanvas);
  hudTex.colorSpace = THREE.SRGBColorSpace;
  const hudSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: hudTex, transparent: true, depthTest: false })
  );
  hudSprite.scale.set(4.2, 1.75, 1);
  hudSprite.position.set(0, 3.25, 0);
  hudSprite.renderOrder = 25;
  root.add(hudSprite);

  return {
    root,
    chassis,
    vehicle,
    frontSteerPivots,
    wheelMeshes,
    brakeLights,
    sirenLights,
    damageSmokePuffs,
    exhaustFlames,
    driftSparks,
    shieldBubble,
    crownGroup,
    hotBombGroup,
    hudSprite,
    hudCanvas,
    hudTex,
    lastHudKey: "",
    wheelSpinAngle: 0,
  };
}

export function updateKsidaCarRigVisuals(
  rig: KsidaCarRig,
  opts: {
    dt: number;
    forwardSpeed: number;
    steerAngle: number; // -1..1
    driftStage: 0 | 1 | 2 | 3;
    driftDir?: number; // -1 | 0 | 1
    isBraking?: boolean;
    hpRatio?: number;
    isNitro: boolean;
    atayActive: boolean;
    shieldActive: boolean;
    hasCrown: boolean;
    hasHotBomb: boolean;
    visualSpinYaw: number;
    timeSec: number;
  }
) {
  // 1. Spin real GLB wheels & steer front axle!
  rig.wheelSpinAngle += (opts.forwardSpeed / 0.38) * opts.dt;
  for (const w of rig.wheelMeshes) {
    w.rotation.x = rig.wheelSpinAngle;
  }
  const steerYaw = -opts.steerAngle * 0.44;
  for (const fp of rig.frontSteerPivots) {
    fp.rotation.y = steerYaw;
  }

  // 2. Dynamic Suspension Roll, Authentic Drift Slip & Pickup Wheelie!
  const activeDriftDir =
    opts.driftDir !== undefined && opts.driftDir !== 0
      ? opts.driftDir
      : opts.steerAngle >= 0
      ? 1
      : -1;
  const steerInDrift = Math.max(0, opts.steerAngle * activeDriftDir);
  const targetDriftYawSlip =
    opts.driftStage > 0 ? -activeDriftDir * (0.22 + steerInDrift * 0.1) : 0;

  const targetRoll = opts.steerAngle * Math.min(1, Math.abs(opts.forwardSpeed) / 18) * 0.09;
  const targetPitch =
    rig.vehicle === "TRIPORTEUR" && (opts.isNitro || opts.atayActive)
      ? -0.18
      : opts.isNitro
      ? -0.045
      : opts.isBraking && opts.forwardSpeed > 5
      ? 0.05
      : 0;

  rig.chassis.rotation.z += (targetRoll - rig.chassis.rotation.z) * Math.min(1, 12 * opts.dt);
  rig.chassis.rotation.x += (targetPitch - rig.chassis.rotation.x) * Math.min(1, 10 * opts.dt);
  const targetYRot = opts.visualSpinYaw + targetDriftYawSlip;
  rig.chassis.rotation.y += (targetYRot - rig.chassis.rotation.y) * Math.min(1, 12 * opts.dt);
  rig.chassis.position.y = Math.sin(opts.timeSec * 22) * 0.01;

  // 3. Brake Lights & Jadarmiya Police Siren!
  const brakeGlow = Boolean(opts.isBraking || opts.driftStage > 0);
  for (const bl of rig.brakeLights) {
    bl.scale.setScalar(brakeGlow ? 1.35 : 0.9);
    (bl.material as THREE.MeshBasicMaterial).opacity = brakeGlow ? 1.0 : 0.45;
  }

  if (rig.sirenLights.length === 2) {
    const flash = Math.sin(opts.timeSec * 24) > 0;
    rig.sirenLights[0].scale.setScalar(flash ? 1.35 : 0.85);
    rig.sirenLights[1].scale.setScalar(!flash ? 1.35 : 0.85);
  }

  // 4. Low-HP Engine Smoke Puffs
  const showSmoke = (opts.hpRatio ?? 1) < 0.45;
  for (let i = 0; i < rig.damageSmokePuffs.length; i++) {
    const sm = rig.damageSmokePuffs[i];
    sm.visible = showSmoke;
    if (showSmoke) {
      const cycle = (opts.timeSec * 1.8 + i * 0.33) % 1;
      sm.position.set(Math.sin(opts.timeSec * 6 + i) * 0.18, 0.95 + cycle * 1.35, 1.25 - cycle * 0.6);
      sm.scale.setScalar(0.55 + cycle * 1.1);
      (sm.material as THREE.MeshBasicMaterial).opacity = (1 - cycle) * 0.55;
    }
  }

  // 5. Twin Nitro / Atay Overdrive Exhaust Flames
  const showFlame = opts.isNitro || opts.atayActive;
  for (let i = 0; i < rig.exhaustFlames.length; i++) {
    const fl = rig.exhaustFlames[i];
    fl.visible = showFlame;
    if (showFlame) {
      const mat = fl.material as THREE.MeshBasicMaterial;
      mat.color.setHex(opts.atayActive ? 0x10b981 : 0x38bdf8);
      const pulse = 0.88 + Math.sin(opts.timeSec * 45 + i * 2) * 0.34;
      fl.scale.set(pulse, pulse, 0.95 + pulse * 0.45);
    }
  }

  // 6. 3-Stage Drift Sparks (Cyan -> Gold -> Purple!)
  const showSparks = opts.driftStage > 0;
  const sparkHex =
    opts.driftStage === 3 ? 0xd946ef : opts.driftStage === 2 ? 0xf59e0b : 0x22d3ee;
  for (let i = 0; i < rig.driftSparks.length; i++) {
    const sp = rig.driftSparks[i];
    sp.visible = showSparks;
    if (showSparks) {
      (sp.material as THREE.MeshBasicMaterial).color.setHex(sparkHex);
      const s = (0.68 + opts.driftStage * 0.3) * (0.82 + Math.sin(opts.timeSec * 50 + i) * 0.35);
      sp.scale.setScalar(s);
      sp.rotation.y += opts.dt * 14;
      sp.rotation.x += opts.dt * 11;
    }
  }

  // 7. Shield / Mint Tea Aura
  rig.shieldBubble.visible = opts.shieldActive || opts.atayActive;
  if (rig.shieldBubble.visible) {
    (rig.shieldBubble.material as THREE.MeshBasicMaterial).color.setHex(
      opts.atayActive ? 0x10b981 : 0x38bdf8
    );
    rig.shieldBubble.rotation.y += opts.dt * 2.2;
  }

  // 8. Crown & Ticking Hot Butagaz
  rig.crownGroup.visible = opts.hasCrown;
  if (opts.hasCrown) {
    rig.crownGroup.rotation.y = opts.timeSec * 2.6;
    rig.crownGroup.position.y = 2.55 + Math.sin(opts.timeSec * 4) * 0.12;
  }

  rig.hotBombGroup.visible = opts.hasHotBomb;
  if (opts.hasHotBomb) {
    const pulse = 1 + Math.sin(opts.timeSec * 16) * 0.14;
    rig.hotBombGroup.scale.setScalar(pulse);
    rig.hotBombGroup.rotation.y = opts.timeSec * 4.2;
  }
}

export function syncKsidaDriverHudPlate(
  rig: KsidaCarRig,
  opts: {
    nickname: string;
    hp: number;
    maxHp: number;
    rankPos: number;
    isMe: boolean;
    activeTauntId: KsidaTauntId | null;
  }
) {
  const hpBucket = Math.ceil(opts.hp / 5);
  const key = `${opts.nickname}|${hpBucket}|${opts.rankPos}|${opts.isMe ? 1 : 0}|${opts.activeTauntId || ""}`;
  if (rig.lastHudKey === key) return;
  rig.lastHudKey = key;

  const ctx = rig.hudCanvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, 384, 160);

  if (opts.activeTauntId && KSIDA_TAUNTS[opts.activeTauntId]) {
    const t = KSIDA_TAUNTS[opts.activeTauntId];
    ctx.fillStyle = "#fef08a";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(22, 6, 340, 56, 18);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#0f172a";
    ctx.font = "900 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${t.emoji} ${t.textAr}`, 192, 34);
  }

  if (!opts.isMe || opts.activeTauntId) {
    ctx.fillStyle = "rgba(15, 23, 42, 0.84)";
    ctx.strokeStyle = opts.isMe ? "#22c55e" : "rgba(251, 191, 36, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(62, 74, 260, 62, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = opts.isMe ? "#86efac" : "#fef3c7";
    ctx.font = "800 20px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`#${opts.rankPos} ${opts.nickname.slice(0, 15)}`, 192, 98);

    const ratio = Math.max(0, Math.min(1, opts.hp / Math.max(1, opts.maxHp)));
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(84, 114, 216, 12);
    ctx.fillStyle = ratio > 0.5 ? "#22c55e" : ratio > 0.25 ? "#f59e0b" : "#ef4444";
    ctx.fillRect(84, 114, Math.round(216 * ratio), 12);
  }

  rig.hudTex.needsUpdate = true;
}

export function buildMysteryCrateMesh(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.24, 1.24, 1.24),
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.48,
      roughness: 0.22,
      metalness: 0.68,
    })
  );
  box.rotation.set(0.45, 0.45, 0.3);
  g.add(box);

  const wire = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.08, 0),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.8,
    })
  );
  g.add(wire);

  const padRing = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1.28, 24),
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    })
  );
  padRing.rotation.x = -Math.PI / 2;
  padRing.position.y = -0.54;
  g.add(padRing);

  return g;
}

export function buildExplosiveBarrelMesh(): THREE.Group {
  const g = new THREE.Group();
  const dangerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.32, 24),
    new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    })
  );
  dangerRing.rotation.x = -Math.PI / 2;
  dangerRing.position.y = 0.04;
  g.add(dangerRing);

  const cyl = buildButagazCylinderMesh(0xdc2626, 1.55);
  g.add(cyl);

  attachClonedProp(g, BARREL_GLB, 1.85, 0, (clone) => {
    clone.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && m.material) {
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        mat.color.setHex(0xef4444);
        mat.emissive = new THREE.Color(0x7f1d1d);
        mat.emissiveIntensity = 0.35;
        m.material = mat;
      }
    });
  });

  return g;
}

export function buildTrafficConeMesh(): THREE.Group {
  const g = new THREE.Group();
  attachClonedProp(g, CONE_GLB, 1.85, 0);
  return g;
}

export function buildTireBarrierStackMesh(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const slot = new THREE.Group();
    slot.position.set(0, 0.22 + i * 0.36, 0);
    slot.rotation.z = Math.PI / 2;
    g.add(slot);
    attachClonedProp(slot, TIRE_GLB, 1.65, 0);
  }
  return g;
}

export function buildMemeProjectileMesh(kind: KsidaItemId): THREE.Group {
  const g = new THREE.Group();

  if (kind === "SANDALA") {
    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.18, 1.95),
      new THREE.MeshStandardMaterial({
        color: 0xec4899,
        emissive: 0xbe185d,
        emissiveIntensity: 0.4,
        roughness: 0.35,
      })
    );
    g.add(sole);

    const strap = new THREE.Mesh(
      new THREE.TorusGeometry(0.44, 0.12, 10, 16, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.3 })
    );
    strap.position.set(0, 0.1, 0.25);
    g.add(strap);

    const aura = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.15, 16),
      new THREE.MeshBasicMaterial({
        color: 0xf472b6,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      })
    );
    aura.rotation.x = -Math.PI / 2;
    g.add(aura);
  } else if (kind === "BUTAGAZ") {
    g.add(buildButagazCylinderMesh(0xef4444, 1.45));
  } else if (kind === "SOAP_OIL") {
    const puddle = new THREE.Mesh(
      new THREE.CylinderGeometry(2.25, 2.35, 0.08, 22),
      new THREE.MeshStandardMaterial({
        color: 0x84cc16,
        emissive: 0x4d7c0f,
        emissiveIntensity: 0.35,
        roughness: 0.06,
        metalness: 0.75,
        transparent: true,
        opacity: 0.88,
      })
    );
    puddle.position.y = 0.05;
    g.add(puddle);
  } else if (kind === "WATERMELON") {
    attachClonedProp(g, WATERMELON_GLB, 3.2, 0.05);
    const fallbackSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.68, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.32 })
    );
    fallbackSphere.position.y = 0.68;
    g.add(fallbackSphere);
  }

  return g;
}

/**
 * Real Kenney 3D Palm Tree (.glb) with lush fronds & curved coastal trunk!
 */
export function buildCornichePalmTree(height = 8.5, bent = true): THREE.Group {
  const g = new THREE.Group();
  const url = bent ? PALM_BEND_GLB : PALM_STRAIGHT_GLB;
  // Raw GLB height is ~4.25m
  attachClonedProp(g, url, height / 4.25, 0);
  return g;
}

/**
 * Real Kenney 3D Kasbah Fortress Tower & Watchtower (.glb)
 */
export function buildKasbahTowerProp(scale = 1.45, watchStyle = false): THREE.Group {
  const g = new THREE.Group();
  attachClonedProp(g, watchStyle ? WATCH_TOWER_GLB : KASBAH_TOWER_GLB, scale, 0);
  return g;
}

/**
 * Real Kenney 3D Atlas Sandstone Boulder Formation (.glb)
 */
export function buildAtlasRocksProp(variant = 0, scale = 2.4): THREE.Group {
  const g = new THREE.Group();
  attachClonedProp(g, variant % 2 === 0 ? ROCKS_A_GLB : ROCKS_B_GLB, scale, -0.15);
  return g;
}

/**
 * Real Kenney 3D Corniche Hotel / Medina Apartment Building (.glb)
 */
export function buildCityBuildingProp(variant = 0, scale = 12.5): THREE.Group {
  const g = new THREE.Group();
  const url = BUILDING_GLBS[((variant % BUILDING_GLBS.length) + BUILDING_GLBS.length) % BUILDING_GLBS.length];
  attachClonedProp(g, url, scale, 0);
  return g;
}

/**
 * Grand Ronda Centerpiece: Ornate 3D Stone Fountain Monument (.glb)!
 */
export function buildRondaFountainMonument(plinthMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(5.1, 5.4, 0.65, 32), plinthMat);
  plinth.position.y = 0.32;
  plinth.receiveShadow = true;
  g.add(plinth);

  attachClonedProp(g, FOUNTAIN_GLB, 4.8, 0.62);

  // Glowing golden Moroccan lantern finial in center of fountain
  const finial = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.85, 0),
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 0.75,
      metalness: 0.85,
      roughness: 0.15,
    })
  );
  finial.position.y = 3.85;
  g.add(finial);
  return g;
}

/**
 * Moroccan Medina Souk Market Stall (.glb)
 */
export function buildSoukStallProp(isRed = true, scale = 3.2): THREE.Group {
  const g = new THREE.Group();
  attachClonedProp(g, isRed ? STALL_RED_GLB : STALL_GREEN_GLB, scale, 0);
  return g;
}
