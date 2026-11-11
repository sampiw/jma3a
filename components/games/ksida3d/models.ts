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

const gltfCache = new Map<string, GLTF>();
const gltfPromises = new Map<string, Promise<GLTF | null>>();

export function preloadKsidaPropAssets(): void {
  if (typeof window === "undefined") return;
  for (const url of [WATERMELON_GLB, TAJINE_GLB, BARREL_GLB, BOX_GLB]) {
    loadPropGltf(url);
  }
}

function loadPropGltf(url: string): Promise<GLTF | null> {
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

function attachClonedProp(target: THREE.Group, url: string, scale: number, yOffset = 0) {
  loadPropGltf(url).then((gltf) => {
    if (!gltf) return;
    const clone = gltf.scene.clone(true);
    clone.scale.setScalar(scale);
    clone.position.y = yOffset;
    target.add(clone);
  });
}

export interface KsidaCarRig {
  root: THREE.Group;
  chassis: THREE.Group;
  vehicle: KsidaVehicleId;
  frontSteerPivots: THREE.Group[];
  wheelMeshes: THREE.Object3D[];
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

function buildWheelMesh(radius = 0.36, width = 0.26): THREE.Group {
  const g = new THREE.Group();
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 18);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x141619,
    roughness: 0.85,
    metalness: 0.1,
  });
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = true;
  g.add(tire);

  const rimGeo = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.02, 12);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.25,
    metalness: 0.82,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  g.add(rim);

  // Spoke bar so wheel rotation is visibly dramatic at 60fps!
  const spoke = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.03, radius * 1.05, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.3 })
  );
  g.add(spoke);

  return g;
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
  ctx.font = "900 38px system-ui, sans-serif";
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

  // Subtle player halo ring under the car so you always spot yourself & rivals clearly
  const ringGeo = new THREE.RingGeometry(1.38, 1.62, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isMe ? 0x22c55e : spec.bodyHex,
    transparent: true,
    opacity: isMe ? 0.72 : 0.36,
    depthWrite: false,
  });
  const groundRing = new THREE.Mesh(ringGeo, ringMat);
  groundRing.position.y = 0.04;
  root.add(groundRing);

  const paintMat = new THREE.MeshStandardMaterial({
    color: spec.bodyHex,
    roughness: 0.24,
    metalness: 0.52,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: spec.secondaryHex,
    roughness: 0.55,
    metalness: 0.25,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.16,
    metalness: 0.9,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.08,
    metalness: 0.85,
  });
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff1e42 });

  const frontSteerPivots: THREE.Group[] = [];
  const wheelMeshes: THREE.Object3D[] = [];

  if (vehicle === "TRIPORTEUR") {
    // === ICONIC MOROCCAN 3-WHEELER TRIPORTEUR ===
    // Single front wheel + fork + rider fairing + orange flatbed loaded with watermelons & tagine!
    const steerPivot = new THREE.Group();
    steerPivot.position.set(0, 0.36, 1.38);
    const fw = buildWheelMesh(0.36, 0.22);
    steerPivot.add(fw);
    chassis.add(steerPivot);
    frontSteerPivots.push(steerPivot);
    wheelMeshes.push(fw);

    // Rear left & right wheels
    for (const sx of [-0.88, 0.88]) {
      const rw = buildWheelMesh(0.37, 0.26);
      rw.position.set(sx, 0.37, -1.05);
      chassis.add(rw);
      wheelMeshes.push(rw);
    }

    // Front mudguard & fairing
    const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.82, 0.72), paintMat);
    fairing.position.set(0, 0.78, 0.92);
    fairing.rotation.x = -0.18;
    fairing.castShadow = true;
    chassis.add(fairing);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.52, 0.08), glassMat);
    windshield.position.set(0, 1.34, 0.86);
    windshield.rotation.x = -0.25;
    chassis.add(windshield);

    const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), headlightMat);
    headlight.position.set(0, 0.88, 1.3);
    chassis.add(headlight);

    // Driver silhouette seat
    const driverTorso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.26, 0.62, 10),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 })
    );
    driverTorso.position.set(0, 1.05, 0.36);
    chassis.add(driverTorso);
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.25, metalness: 0.4 })
    );
    helmet.position.set(0, 1.5, 0.36);
    chassis.add(helmet);

    // Open Cargo Flatbed Box
    const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.22, 1.85), trimMat);
    bedFloor.position.set(0, 0.56, -0.78);
    bedFloor.castShadow = true;
    chassis.add(bedFloor);

    for (const sx of [-0.82, 0.82]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.48, 1.85), trimMat);
      rail.position.set(sx, 0.88, -0.78);
      chassis.add(rail);
    }
    const backGate = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.48, 0.09), trimMat);
    backGate.position.set(0, 0.88, -1.66);
    chassis.add(backGate);

    // Cargo: Procedural + Kenney GLB Watermelons & Tagine!
    const cargoGroup = new THREE.Group();
    cargoGroup.position.set(0, 0.68, -0.78);
    chassis.add(cargoGroup);

    const melonMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.35 });
    for (const [mx, mz] of [
      [-0.42, -0.35],
      [0.42, -0.38],
      [-0.35, 0.32],
    ]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), melonMat);
      m.scale.set(1.15, 0.92, 0.95);
      m.position.set(mx, 0.24, mz);
      cargoGroup.add(m);
    }
    attachClonedProp(cargoGroup, TAJINE_GLB, 1.55, 0.05);
  } else {
    // === 4-WHEELED MOROCCAN CARS (TAXI_HMER, MERCEDES_240, C15_KHATTAF, LOGAN_ECOLE) ===
    const isLongSedan = vehicle === "MERCEDES_240";
    const isVan = vehicle === "C15_KHATTAF";
    const bodyLen = isLongSedan ? 3.85 : isVan ? 3.55 : 3.35;
    const bodyWidth = isLongSedan ? 1.78 : 1.68;
    const wheelZFront = bodyLen * 0.33;
    const wheelZRear = -bodyLen * 0.33;
    const wheelX = bodyWidth * 0.51;

    // 4 Articulated Wheels
    for (const sx of [-1, 1]) {
      const fp = new THREE.Group();
      fp.position.set(sx * wheelX, 0.36, wheelZFront);
      const fw = buildWheelMesh(0.36, 0.26);
      fp.add(fw);
      chassis.add(fp);
      frontSteerPivots.push(fp);
      wheelMeshes.push(fw);

      const rw = buildWheelMesh(0.36, 0.26);
      rw.position.set(sx * wheelX, 0.36, wheelZRear);
      chassis.add(rw);
      wheelMeshes.push(rw);
    }

    // Lower Sculpted Body Hull
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth, 0.62, bodyLen),
      paintMat
    );
    hull.position.set(0, 0.66, 0);
    hull.castShadow = true;
    hull.receiveShadow = true;
    chassis.add(hull);

    // Black side rub-strips
    const sideTrim = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth + 0.04, 0.12, bodyLen * 0.72),
      trimMat
    );
    sideTrim.position.set(0, 0.56, 0);
    chassis.add(sideTrim);

    // Chrome Front & Rear Bumpers
    const fBumper = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth + 0.08, 0.2, 0.22),
      isLongSedan ? chromeMat : trimMat
    );
    fBumper.position.set(0, 0.44, bodyLen * 0.5 + 0.04);
    chassis.add(fBumper);

    const rBumper = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth + 0.08, 0.2, 0.22),
      isLongSedan ? chromeMat : trimMat
    );
    rBumper.position.set(0, 0.44, -bodyLen * 0.5 - 0.04);
    chassis.add(rBumper);

    // Cabin / Greenhouse
    if (isVan) {
      // C15 Boxy Cargo Van Rear + Sloped Front Cab
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(bodyWidth * 0.92, 0.64, 1.25),
        paintMat
      );
      cab.position.set(0, 1.25, 0.42);
      cab.castShadow = true;
      chassis.add(cab);

      const cargoBox = new THREE.Mesh(
        new THREE.BoxGeometry(bodyWidth * 0.96, 0.86, 1.72),
        new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.48, metalness: 0.25 })
      );
      cargoBox.position.set(0, 1.36, -0.88);
      cargoBox.castShadow = true;
      chassis.add(cargoBox);

      const frontGlass = new THREE.Mesh(
        new THREE.BoxGeometry(bodyWidth * 0.84, 0.48, 0.08),
        glassMat
      );
      frontGlass.position.set(0, 1.28, 1.06);
      frontGlass.rotation.x = -0.22;
      chassis.add(frontGlass);

      // Iconic Butagaz Cylinders strapped to the C15 roof!
      for (const [bx, bz, col] of [
        [-0.36, -0.65, 0xdc2626],
        [0.36, -0.65, 0x2563eb],
        [0.0, -1.22, 0xdc2626],
      ]) {
        const cyl = buildButagazCylinderMesh(col, 0.88);
        cyl.position.set(bx, 1.78, bz);
        chassis.add(cyl);
      }
    } else {
      const cabLen = isLongSedan ? 1.88 : 1.72;
      const cabOffsetZ = isLongSedan ? -0.12 : -0.16;
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(bodyWidth * 0.88, 0.58, cabLen),
        paintMat
      );
      cabin.position.set(0, 1.24, cabOffsetZ);
      cabin.castShadow = true;
      chassis.add(cabin);

      const glassBlock = new THREE.Mesh(
        new THREE.BoxGeometry(bodyWidth * 0.9, 0.44, cabLen * 0.88),
        glassMat
      );
      glassBlock.position.set(0, 1.24, cabOffsetZ);
      chassis.add(glassBlock);

      const roofCap = new THREE.Mesh(
        new THREE.BoxGeometry(bodyWidth * 0.86, 0.09, cabLen * 0.84),
        paintMat
      );
      roofCap.position.set(0, 1.53, cabOffsetZ);
      chassis.add(roofCap);

      // Vehicle-Specific Iconic Roof Props!
      if (vehicle === "TAXI_HMER") {
        const taxiTex = createSignTexture("#ffffff", "#dc2626", "TAXI طاكسي", "#dc2626");
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(0.86, 0.26, 0.28),
          new THREE.MeshBasicMaterial({ map: taxiTex })
        );
        sign.position.set(0, 1.7, -0.05);
        chassis.add(sign);
      } else if (vehicle === "MERCEDES_240") {
        // Classic hood ornament ring + Tall Moroccan Grand Taxi Roof Luggage Rack!
        const starRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.11, 0.02, 8, 16),
          chromeMat
        );
        starRing.position.set(0, 1.09, bodyLen * 0.46);
        chassis.add(starRing);

        const rackFrame = new THREE.Mesh(
          new THREE.BoxGeometry(1.36, 0.08, 1.44),
          chromeMat
        );
        rackFrame.position.set(0, 1.61, -0.14);
        chassis.add(rackFrame);

        const suitcase1 = new THREE.Mesh(
          new THREE.BoxGeometry(0.68, 0.28, 0.54),
          new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.6 })
        );
        suitcase1.position.set(-0.26, 1.79, 0.12);
        suitcase1.rotation.y = 0.14;
        chassis.add(suitcase1);

        const blueBarrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.24, 0.52, 12),
          new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 })
        );
        blueBarrel.position.set(0.34, 1.9, -0.32);
        chassis.add(blueBarrel);

        const roofPropAnchor = new THREE.Group();
        roofPropAnchor.position.set(-0.24, 1.65, -0.45);
        chassis.add(roofPropAnchor);
        attachClonedProp(roofPropAnchor, BOX_GLB, 1.15, 0);
      } else if (vehicle === "LOGAN_ECOLE") {
        const ecoleTex = createSignTexture("#fef08a", "#ef4444", "AUTO-ÉCOLE", "#b91c1c");
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(1.08, 0.34, 0.32),
          new THREE.MeshBasicMaterial({ map: ecoleTex })
        );
        sign.position.set(0, 1.74, -0.1);
        chassis.add(sign);
      }
    }

    // Headlights, Chrome Grille & Taillights
    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth * 0.52, 0.26, 0.08),
      chromeMat
    );
    grille.position.set(0, 0.68, bodyLen * 0.5 + 0.02);
    chassis.add(grille);

    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.08), headlightMat);
      hl.position.set(sx * bodyWidth * 0.35, 0.72, bodyLen * 0.5 + 0.02);
      chassis.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), taillightMat);
      tl.position.set(sx * bodyWidth * 0.34, 0.72, -bodyLen * 0.5 - 0.02);
      chassis.add(tl);
    }
  }

  // Twin Nitro Exhaust Flame Cones
  const exhaustFlames: THREE.Mesh[] = [];
  const flameGeo = new THREE.ConeGeometry(0.16, 0.95, 10);
  flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (const sx of [-0.42, 0.42]) {
    const fl = new THREE.Mesh(flameGeo, flameMat.clone());
    fl.position.set(sx, 0.42, -2.05);
    fl.visible = false;
    chassis.add(fl);
    exhaustFlames.push(fl);
  }

  // Rear Tire Drift Sparks (Blue -> Gold -> Purple!)
  const driftSparks: THREE.Mesh[] = [];
  const sparkGeo = new THREE.OctahedronGeometry(0.26, 0);
  for (const sx of [-0.82, 0.82]) {
    const sp = new THREE.Mesh(
      sparkGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    sp.position.set(sx, 0.24, -1.25);
    sp.visible = false;
    chassis.add(sp);
    driftSparks.push(sp);
  }

  // Spawn Shield / Mint Tea Overdrive Aura Bubble
  const shieldBubble = new THREE.Mesh(
    new THREE.SphereGeometry(2.15, 18, 14),
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
    new THREE.ConeGeometry(0.45, 0.58, 12),
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 0.55,
      metalness: 0.85,
      roughness: 0.18,
    })
  );
  crownGroup.add(crownCone);
  const crownBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.54, 0.42, 0.14, 14),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8, roughness: 0.2 })
  );
  crownBase.position.y = -0.26;
  crownGroup.add(crownBase);
  root.add(crownGroup);

  // Ticking Hot Butagaz Roof Bomb Group (HOT_BOMB mode)
  const hotBombGroup = new THREE.Group();
  hotBombGroup.position.set(0, 2.35, 0);
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
  hudSprite.position.set(0, 3.15, 0);
  hudSprite.renderOrder = 25;
  root.add(hudSprite);

  return {
    root,
    chassis,
    vehicle,
    frontSteerPivots,
    wheelMeshes,
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
    isNitro: boolean;
    atayActive: boolean;
    shieldActive: boolean;
    hasCrown: boolean;
    hasHotBomb: boolean;
    visualSpinYaw: number;
    timeSec: number;
  }
) {
  // 1. Spin wheels & steer front axle
  rig.wheelSpinAngle += (opts.forwardSpeed / 0.36) * opts.dt;
  for (const w of rig.wheelMeshes) {
    w.rotation.x = rig.wheelSpinAngle;
  }
  const steerYaw = -opts.steerAngle * 0.46;
  for (const fp of rig.frontSteerPivots) {
    fp.rotation.y = steerYaw;
  }

  // 2. Dynamic Suspension Body Roll, Drift Slip & Triporteur Nitro Wheelie!
  const targetRoll = opts.steerAngle * Math.min(1, Math.abs(opts.forwardSpeed) / 18) * 0.11;
  const targetPitch =
    rig.vehicle === "TRIPORTEUR" && (opts.isNitro || opts.atayActive)
      ? -0.22
      : opts.isNitro
      ? -0.05
      : 0;
  const driftYawSlip =
    opts.driftStage > 0 ? -opts.steerAngle * 0.24 : 0;

  rig.chassis.rotation.z += (targetRoll - rig.chassis.rotation.z) * Math.min(1, 12 * opts.dt);
  rig.chassis.rotation.x += (targetPitch - rig.chassis.rotation.x) * Math.min(1, 10 * opts.dt);
  rig.chassis.rotation.y = opts.visualSpinYaw + driftYawSlip;
  rig.chassis.position.y = Math.sin(opts.timeSec * 22) * 0.012;

  // 3. Twin Nitro / Atay Overdrive Exhaust Flames
  const showFlame = opts.isNitro || opts.atayActive;
  for (let i = 0; i < rig.exhaustFlames.length; i++) {
    const fl = rig.exhaustFlames[i];
    fl.visible = showFlame;
    if (showFlame) {
      const mat = fl.material as THREE.MeshBasicMaterial;
      mat.color.setHex(opts.atayActive ? 0x10b981 : 0x38bdf8);
      const pulse = 0.85 + Math.sin(opts.timeSec * 45 + i * 2) * 0.32;
      fl.scale.set(pulse, pulse, 0.9 + pulse * 0.45);
    }
  }

  // 4. 3-Stage Drift Sparks (Cyan -> Gold -> Purple!)
  const showSparks = opts.driftStage > 0;
  const sparkHex =
    opts.driftStage === 3 ? 0xd946ef : opts.driftStage === 2 ? 0xf59e0b : 0x22d3ee;
  for (let i = 0; i < rig.driftSparks.length; i++) {
    const sp = rig.driftSparks[i];
    sp.visible = showSparks;
    if (showSparks) {
      (sp.material as THREE.MeshBasicMaterial).color.setHex(sparkHex);
      const s = (0.65 + opts.driftStage * 0.28) * (0.8 + Math.sin(opts.timeSec * 50 + i) * 0.35);
      sp.scale.setScalar(s);
      sp.rotation.y += opts.dt * 14;
      sp.rotation.x += opts.dt * 11;
    }
  }

  // 5. Shield / Mint Tea Aura
  rig.shieldBubble.visible = opts.shieldActive || opts.atayActive;
  if (rig.shieldBubble.visible) {
    (rig.shieldBubble.material as THREE.MeshBasicMaterial).color.setHex(
      opts.atayActive ? 0x10b981 : 0x38bdf8
    );
    rig.shieldBubble.rotation.y += opts.dt * 2.2;
  }

  // 6. Crown & Ticking Hot Butagaz
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

  // Active Comic-Book Meme Speech Bubble on top!
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

  // Driver Name Pill + Rank Badge + HP Bar (hide redundant bar on self unless taunting)
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

    // HP Bar
    const ratio = Math.max(0, Math.min(1, opts.hp / Math.max(1, opts.maxHp)));
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(84, 114, 216, 12);
    ctx.fillStyle = ratio > 0.5 ? "#22c55e" : ratio > 0.25 ? "#f59e0b" : "#ef4444";
    ctx.fillRect(84, 114, Math.round(216 * ratio), 12);
  }

  rig.hudTex.needsUpdate = true;
}

/**
 * Glowing Spinning Moroccan Zellige Mystery Crate!
 */
export function buildMysteryCrateMesh(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 1.18, 1.18),
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.42,
      roughness: 0.22,
      metalness: 0.65,
    })
  );
  box.rotation.set(0.45, 0.45, 0.3);
  g.add(box);

  const wire = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.02, 0),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
    })
  );
  g.add(wire);

  const padRing = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1.15, 20),
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    })
  );
  padRing.rotation.x = -Math.PI / 2;
  padRing.position.y = -0.54;
  g.add(padRing);

  return g;
}

/**
 * Builds hilarious 3D Meme Projectile & Hazard Meshes (Giant Sandala, Butagaz, Soap Slick, Watermelon)
 */
export function buildMemeProjectileMesh(kind: KsidaItemId): THREE.Group {
  const g = new THREE.Group();

  if (kind === "SANDALA") {
    // Giant Pink/Magenta Moroccan Mother's Slipper ("صندالة الواليدة")!
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
    g.add(buildButagazCylinderMesh(0xef4444, 1.4));
  } else if (kind === "SOAP_OIL") {
    const puddle = new THREE.Mesh(
      new THREE.CylinderGeometry(2.15, 2.25, 0.08, 20),
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
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.32 })
    );
    sphere.position.y = 0.72;
    g.add(sphere);
    attachClonedProp(g, WATERMELON_GLB, 2.4, 0.1);
  }

  return g;
}

/**
 * Stylized Moroccan Corniche Palm Tree for high-FPS coastal scenery!
 */
export function buildCornichePalmTree(height = 7.5): THREE.Group {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x15803d,
    roughness: 0.65,
    side: THREE.DoubleSide,
  });

  const segments = 5;
  for (let i = 0; i < segments; i++) {
    const segH = height / segments;
    const rBot = 0.36 - i * 0.04;
    const rTop = 0.32 - i * 0.04;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBot, segH + 0.1, 8),
      trunkMat
    );
    seg.position.set(Math.sin(i * 0.25) * 0.25, i * segH + segH * 0.5, 0);
    seg.rotation.z = -0.05 * i;
    g.add(seg);
  }

  const crownY = height;
  const crownX = Math.sin((segments - 1) * 0.25) * 0.25;
  for (let k = 0; k < 7; k++) {
    const ang = (k / 7) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.1, 5), leafMat);
    frond.position.set(
      crownX + Math.cos(ang) * 1.15,
      crownY - 0.15,
      Math.sin(ang) * 1.15
    );
    frond.rotation.z = -Math.PI * 0.38;
    frond.rotation.y = -ang;
    g.add(frond);
  }

  return g;
}
