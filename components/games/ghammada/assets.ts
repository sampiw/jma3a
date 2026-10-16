import * as THREE from "three";
import { GLTFLoader, GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { GhammadaPropId } from "@/games/ghammada/types";
import { GhammadaDecorModel } from "@/games/ghammada/layout";

/**
 * Model sources (all CC0 / free to use):
 * - Kenney "Food Kit" + "Furniture Kit" (kenney.nl, CC0)
 * - RobotExpressive by Tomás Laulhé (Quaternius), CC0 — animated hunter
 * Moroccan-only items (berrad, butagaz, qolla, fanar) are hand-built below.
 */

const PROP_GLB: Partial<Record<GhammadaPropId, string>> = {
  tajine: "/models/food/tajine.glb",
  della7a: "/models/food/watermelon.glb",
  chair: "/models/furniture/chair.glb",
  crate: "/models/furniture/cardboardBoxClosed.glb",
};

/** Target heights (meters) — props are a bit oversized so a player fits "inside" */
export const PROP_HEIGHT: Record<GhammadaPropId, number> = {
  tajine: 0.85,
  berrad: 1.05,
  butagaz: 1.15,
  chair: 1.15,
  crate: 0.95,
  amphora: 1.35,
  della7a: 0.8,
  fanar: 1.2,
};

const DECOR_GLB: Record<GhammadaDecorModel, string> = {
  tableRound: "/models/furniture/tableRound.glb",
  stoolBar: "/models/furniture/stoolBar.glb",
  loungeSofa: "/models/furniture/loungeSofa.glb",
  benchCushion: "/models/furniture/benchCushion.glb",
  pottedPlant: "/models/furniture/pottedPlant.glb",
  plantSmall1: "/models/furniture/plantSmall1.glb",
  plantSmall2: "/models/furniture/plantSmall2.glb",
  lampRoundFloor: "/models/furniture/lampRoundFloor.glb",
  rugRound: "/models/furniture/rugRound.glb",
  rugRectangle: "/models/furniture/rugRectangle.glb",
};

const HUNTER_GLB = "/models/hunter.glb";
export const HUNTER_HEIGHT = 1.85;

export interface GhammadaAssets {
  props: Partial<Record<GhammadaPropId, THREE.Object3D>>;
  decor: Partial<Record<GhammadaDecorModel, THREE.Object3D>>;
  hunter: GLTF | null;
}

let assetsPromise: Promise<GhammadaAssets> | null = null;

/** Loads every model once (cached for the whole session). Missing files fall back to hand-built shapes. */
export function loadGhammadaAssets(onProgress?: (ratio: number) => void): Promise<GhammadaAssets> {
  if (assetsPromise) {
    onProgress?.(1);
    return assetsPromise;
  }

  const loader = new GLTFLoader();
  const jobs: Array<{ key: string; url: string }> = [
    ...Object.entries(PROP_GLB).map(([k, url]) => ({ key: `prop:${k}`, url: url as string })),
    ...Object.entries(DECOR_GLB).map(([k, url]) => ({ key: `decor:${k}`, url })),
    { key: "hunter", url: HUNTER_GLB },
  ];
  let done = 0;

  assetsPromise = Promise.all(
    jobs.map(
      (job) =>
        new Promise<{ key: string; gltf: GLTF | null }>((resolve) => {
          loader.load(
            job.url,
            (gltf) => {
              done++;
              onProgress?.(done / jobs.length);
              resolve({ key: job.key, gltf });
            },
            undefined,
            () => {
              done++;
              onProgress?.(done / jobs.length);
              resolve({ key: job.key, gltf: null });
            }
          );
        })
    )
  ).then((results) => {
    const assets: GhammadaAssets = { props: {}, decor: {}, hunter: null };
    for (const { key, gltf } of results) {
      if (!gltf) continue;
      if (key === "hunter") {
        assets.hunter = gltf;
      } else if (key.startsWith("prop:")) {
        const id = key.slice(5) as GhammadaPropId;
        assets.props[id] = normalizeModel(gltf.scene, PROP_HEIGHT[id]);
      } else if (key.startsWith("decor:")) {
        assets.decor[key.slice(6) as GhammadaDecorModel] = gltf.scene;
      }
    }
    return assets;
  });

  return assetsPromise;
}

/** Scales a model to a target height, centers it on X/Z and puts its base on the ground */
export function normalizeModel(source: THREE.Object3D, targetHeight: number): THREE.Object3D {
  const wrapper = new THREE.Group();
  const model = source.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  // Flat models (rugs) use their width instead of height
  const reference = targetHeight < 0.1 ? Math.max(size.x, size.z) : size.y;
  const scale = reference > 1e-4 ? (targetHeight < 0.1 ? 2.4 : targetHeight) / reference : 1;
  model.scale.multiplyScalar(scale);
  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= scaledBox.min.y;
  wrapper.add(model);
  enableShadows(wrapper);
  return wrapper;
}

export function enableShadows(obj: THREE.Object3D, cast = true, receive = true) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
    }
  });
}

/** Creates a fresh 3D object for a disguise prop */
export function createPropObject(assets: GhammadaAssets | null, propId: GhammadaPropId): THREE.Object3D {
  const loaded = assets?.props[propId];
  if (loaded) return loaded.clone(true);
  return buildProceduralProp(propId);
}

/** Creates a decor object scaled to the requested height */
export function createDecorObject(
  assets: GhammadaAssets | null,
  model: GhammadaDecorModel,
  height: number
): THREE.Object3D | null {
  const src = assets?.decor[model];
  if (!src) return null;
  const obj = normalizeModel(src, height);
  if (model.startsWith("rug")) enableShadows(obj, false, true);
  return obj;
}

// ---------------------------------------------------------------------------
// Hunter (animated)
// ---------------------------------------------------------------------------

export interface HunterRig {
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  actions: Record<string, THREE.AnimationAction>;
  current: string;
  hammerPivot: THREE.Group;
  headBone: THREE.Object3D | null;
  fez: THREE.Object3D;
  model: THREE.Object3D;
}

export function createHunterRig(assets: GhammadaAssets | null): HunterRig {
  const root = new THREE.Group();
  let model: THREE.Object3D;
  let mixer: THREE.AnimationMixer | null = null;
  const actions: Record<string, THREE.AnimationAction> = {};
  let headBone: THREE.Object3D | null = null;

  if (assets?.hunter) {
    const cloned = SkeletonUtils.clone(assets.hunter.scene);
    const box = new THREE.Box3().setFromObject(cloned);
    const h = box.max.y - box.min.y;
    const s = h > 1e-4 ? HUNTER_HEIGHT / h : 1;
    cloned.scale.multiplyScalar(s);
    cloned.position.y -= box.min.y * s;
    // Warm Moroccan outfit colors
    cloned.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && "color" in mat) {
          const m = mat.clone();
          const name = (m.name || "").toLowerCase();
          if (name.includes("main")) m.color.set(0xb91c1c);
          else if (name.includes("grey") || name.includes("gray")) m.color.set(0x3f2a1d);
          m.metalness = Math.min(m.metalness ?? 0, 0.2);
          mesh.material = m;
        }
      }
      if (!headBone && /^head/i.test(child.name)) headBone = child;
    });
    model = cloned;
    mixer = new THREE.AnimationMixer(cloned);
    for (const clip of assets.hunter.animations) {
      actions[clip.name] = mixer.clipAction(clip);
    }
    const punch = actions["Punch"];
    if (punch) {
      punch.setLoop(THREE.LoopOnce, 1);
      punch.clampWhenFinished = false;
    }
  } else {
    model = buildFallbackHunterBody();
  }
  root.add(model);

  // Red tarbouche (fez) that follows the head
  const fez = new THREE.Group();
  const fezMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.55 });
  const fezBody = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.26, 20), fezMat);
  fezBody.castShadow = true;
  fez.add(fezBody);
  const tassel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  tassel.position.set(0.12, 0.02, 0);
  tassel.rotation.z = -0.5;
  fez.add(tassel);
  fez.position.set(0, HUNTER_HEIGHT + 0.05, 0);
  root.add(fez);

  // Big wooden hammer on the right side
  const hammerPivot = new THREE.Group();
  hammerPivot.position.set(-0.42, 1.15, 0.1);
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.04, 1.0, 10),
    new THREE.MeshStandardMaterial({ color: 0x7c4a1e, roughness: 0.8 })
  );
  handle.position.y = 0.38;
  hammerPivot.add(handle);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.7, roughness: 0.3 });
  const hammerHead = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 18), headMat);
  hammerHead.rotation.z = Math.PI / 2;
  hammerHead.position.y = 0.9;
  hammerHead.castShadow = true;
  hammerPivot.add(hammerHead);
  for (const side of [-0.2, 0.2]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 20), bandMat);
    band.rotation.y = Math.PI / 2;
    band.position.set(side, 0.9, 0);
    hammerPivot.add(band);
  }
  hammerPivot.rotation.x = -0.35;
  root.add(hammerPivot);

  const rig: HunterRig = {
    root,
    mixer,
    actions,
    current: "",
    hammerPivot,
    headBone,
    fez,
    model,
  };
  playHunterAnim(rig, "Idle");
  return rig;
}

export function playHunterAnim(rig: HunterRig, name: "Idle" | "Running" | "Walking", fade = 0.2) {
  if (!rig.mixer || rig.current === name) return;
  const next = rig.actions[name] || rig.actions["Idle"];
  if (!next) return;
  const prev = rig.actions[rig.current];
  next.reset().setEffectiveWeight(1).fadeIn(fade).play();
  if (prev && prev !== next) prev.fadeOut(fade);
  rig.current = name;
}

export function playHunterPunch(rig: HunterRig) {
  const punch = rig.actions["Punch"];
  if (!punch) return;
  punch.reset();
  punch.setEffectiveWeight(1);
  punch.fadeIn(0.05).play();
}

const tmpVec = new THREE.Vector3();
/** Keeps the fez on top of the animated head */
export function updateHunterFez(rig: HunterRig) {
  if (!rig.headBone) return;
  rig.headBone.getWorldPosition(tmpVec);
  rig.root.worldToLocal(tmpVec);
  rig.fez.position.set(tmpVec.x, tmpVec.y + 0.42, tmpVec.z);
}

function buildFallbackHunterBody(): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.38, 0.75, 10, 18),
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5 })
  );
  body.position.y = 0.8;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xf2c08a, roughness: 0.5 })
  );
  head.position.y = 1.55;
  head.castShadow = true;
  g.add(head);
  return g;
}

// ---------------------------------------------------------------------------
// Hand-built Moroccan props (smooth lathe shapes, proper materials)
// ---------------------------------------------------------------------------

function lathe(points: Array<[number, number]>, segments = 32): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments
  );
}

function tube(points: Array<[number, number, number]>, radius: number): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.TubeGeometry(curve, 24, radius, 10, false);
}

export function buildProceduralProp(propId: GhammadaPropId): THREE.Object3D {
  const g = new THREE.Group();

  switch (propId) {
    case "berrad": {
      // Moroccan silver teapot
      const silver = new THREE.MeshStandardMaterial({ color: 0xd9dee6, metalness: 0.85, roughness: 0.22 });
      const gold = new THREE.MeshStandardMaterial({ color: 0xe0b14a, metalness: 0.8, roughness: 0.3 });
      const body = new THREE.Mesh(
        lathe([
          [0.0, 0.0],
          [0.26, 0.0],
          [0.3, 0.05],
          [0.24, 0.1],
          [0.36, 0.25],
          [0.4, 0.42],
          [0.34, 0.6],
          [0.2, 0.7],
          [0.16, 0.74],
          [0.0, 0.74],
        ]),
        silver
      );
      g.add(body);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.395, 0.018, 8, 40), gold);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.42;
      g.add(band);
      const lid = new THREE.Mesh(
        lathe([
          [0.0, 0.72],
          [0.17, 0.72],
          [0.15, 0.8],
          [0.07, 0.95],
          [0.03, 1.0],
          [0.0, 1.02],
        ]),
        silver
      );
      g.add(lid);
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 12), gold);
      finial.position.y = 1.04;
      g.add(finial);
      g.add(new THREE.Mesh(tube([[0.3, 0.3, 0], [0.45, 0.45, 0], [0.55, 0.62, 0], [0.62, 0.7, 0]], 0.035), silver));
      g.add(new THREE.Mesh(tube([[-0.3, 0.62, 0], [-0.5, 0.62, 0], [-0.55, 0.45, 0], [-0.36, 0.25, 0]], 0.03), silver));
      break;
    }

    case "butagaz": {
      // Iconic blue butane cylinder
      const blue = new THREE.MeshStandardMaterial({ color: 0x1f6fd1, metalness: 0.35, roughness: 0.35 });
      const white = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
      const brass = new THREE.MeshStandardMaterial({ color: 0xd4a72c, metalness: 0.8, roughness: 0.3 });
      const steel = new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.7, roughness: 0.35 });
      const body = new THREE.Mesh(
        lathe([
          [0.0, 0.06],
          [0.34, 0.06],
          [0.4, 0.12],
          [0.42, 0.2],
          [0.42, 0.78],
          [0.39, 0.88],
          [0.3, 0.95],
          [0.14, 0.98],
          [0.0, 0.98],
        ]),
        blue
      );
      g.add(body);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.08, 28, 1, true), steel);
      foot.position.y = 0.04;
      g.add(foot);
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.425, 0.425, 0.14, 32, 1, true), white);
      label.position.y = 0.55;
      g.add(label);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.18, 24, 1, true), blue);
      collar.position.y = 1.06;
      (collar.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      g.add(collar);
      const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.14, 14), brass);
      valve.position.y = 1.04;
      g.add(valve);
      break;
    }

    case "amphora": {
      // Clay qolla with handles and painted band
      const clay = new THREE.MeshStandardMaterial({ color: 0xc2703d, roughness: 0.75 });
      const paint = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.6 });
      const body = new THREE.Mesh(
        lathe([
          [0.0, 0.0],
          [0.16, 0.0],
          [0.2, 0.06],
          [0.34, 0.3],
          [0.4, 0.55],
          [0.34, 0.85],
          [0.17, 1.05],
          [0.13, 1.18],
          [0.17, 1.28],
          [0.15, 1.3],
          [0.11, 1.2],
          [0.0, 1.2],
        ]),
        clay
      );
      g.add(body);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.405, 0.405, 0.08, 36, 1, true), paint);
      band.position.y = 0.6;
      g.add(band);
      g.add(new THREE.Mesh(tube([[0.15, 1.12, 0], [0.32, 1.12, 0], [0.33, 0.95, 0], [0.26, 0.85, 0]], 0.03), clay));
      g.add(new THREE.Mesh(tube([[-0.15, 1.12, 0], [-0.32, 1.12, 0], [-0.33, 0.95, 0], [-0.26, 0.85, 0]], 0.03), clay));
      break;
    }

    case "fanar":
    default: {
      // Brass Moroccan lantern with glowing glass
      const brass = new THREE.MeshStandardMaterial({ color: 0xc8902f, metalness: 0.85, roughness: 0.28 });
      const glass = new THREE.MeshStandardMaterial({
        color: 0xffe2a0,
        emissive: 0xff9f1c,
        emissiveIntensity: 1.1,
        roughness: 0.4,
        transparent: true,
        opacity: 0.92,
      });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.1, 6), brass);
      base.position.y = 0.05;
      g.add(base);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 6), glass);
      core.position.y = 0.38;
      g.add(core);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.58, 0.03), brass);
        bar.position.set(Math.cos(a) * 0.22, 0.38, Math.sin(a) * 0.22);
        g.add(bar);
      }
      const roof = new THREE.Mesh(
        lathe(
          [
            [0.0, 0.66],
            [0.3, 0.66],
            [0.24, 0.76],
            [0.12, 0.9],
            [0.05, 1.0],
            [0.0, 1.02],
          ],
          6
        ),
        brass
      );
      g.add(roof);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 8, 16), brass);
      ring.position.y = 1.08;
      g.add(ring);
      break;
    }

    case "tajine": {
      const clay = new THREE.MeshStandardMaterial({ color: 0xb4532a, roughness: 0.6 });
      g.add(new THREE.Mesh(lathe([[0, 0], [0.45, 0], [0.55, 0.12], [0.5, 0.16], [0, 0.16]]), clay));
      g.add(new THREE.Mesh(lathe([[0, 0.14], [0.48, 0.14], [0.3, 0.35], [0.12, 0.65], [0.08, 0.78], [0, 0.8]]), clay));
      break;
    }

    case "della7a": {
      const green = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.4 });
      const melon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 18), green);
      melon.scale.set(1.25, 1, 1);
      melon.position.y = 0.4;
      g.add(melon);
      break;
    }

    case "chair": {
      const wood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7 });
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.6), wood);
      seat.position.y = 0.5;
      g.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.06), wood);
      back.position.set(0, 0.85, -0.27);
      g.add(back);
      for (const [lx, lz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), wood);
        leg.position.set(lx, 0.25, lz);
        g.add(leg);
      }
      break;
    }

    case "crate": {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.85, 0.85),
        new THREE.MeshStandardMaterial({ color: 0xc08a4a, roughness: 0.8 })
      );
      box.position.y = 0.425;
      g.add(box);
      break;
    }
  }

  enableShadows(g);
  return normalizeModel(g, PROP_HEIGHT[propId]);
}
