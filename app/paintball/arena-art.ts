import * as T from "three";
import { BEACON_RADIUS, COVER, LIMIT_X, LIMIT_Z, TEAMS } from "@/games/paintball/arena";

const TAU = Math.PI * 2;
const cube = () => new T.BoxGeometry(1, 1, 1);
export function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function surface(seed: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const random = rng(seed);
  const im = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    const value = 182 + 38 * random() + 11 * Math.sin(x * .027 + y * .014) + 7 * Math.sin(y * .16);
    im.data[i] = im.data[i + 1] = im.data[i + 2] = value;
    im.data[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  for (let i = 0; i < 410; i++) {
    ctx.fillStyle = i % 3 ? "#1b253823" : "#ffffff50";
    ctx.fillRect(256 * random(), 256 * random(), 2 + 5 * random(), .5 + 2 * random());
  }
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  return tex;
}

type Block = { x: number; y: number; z: number; w: number; h: number; d: number; r: number };

function groundMark(scene: T.Scene, name: string, color: string, x: number, z: number, angle: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.font = "900 76px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, 256, 66, 462);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const mark = new T.Mesh(new T.PlaneGeometry(7.9, 1.9), new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: .64 }));
  mark.rotation.set(-Math.PI / 2, 0, angle);
  mark.position.set(x, .035, z);
  scene.add(mark);
}

export function buildArena(scene: T.Scene) {
  const random = rng(2847);
  scene.background = new T.Color(0x081023);
  scene.fog = new T.FogExp2(0x151d35, .0136);
  const sky = new T.Mesh(new T.SphereGeometry(150, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false,
    vertexShader: `varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 p; void main(){
      vec3 d=normalize(p); float az=max(0.,d.y);
      vec3 col=mix(vec3(.212,.133,.149),vec3(.020,.035,.103),smoothstep(.0,.72,az));
      float l=pow(max(0.,dot(d,normalize(vec3(.30,.11,-.92)))),7.);
      col+=vec3(.28,.05,.12)*l*exp(-az*6.);
      vec3 moonDir=normalize(vec3(-.36,.23,-.90));
      float a=length(d-moonDir);
      col+=vec3(.13,.42,.50)*exp(-a*21.);
      float edge=1.-smoothstep(.029,.030,a);
      float grain=sin(d.x*440.)*sin(d.z*230.)*.08+sin(d.x*885.)*sin(d.y*590.)*.03;
      col=mix(col,vec3(.66,.93,1.)-grain,edge);
      float haze=sin(d.x*36.+d.y*51.)*sin(d.z*13.+d.y*46.)*.015;
      gl_FragColor=vec4(col+haze*exp(-az*5.),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  }));
  scene.add(sky);
  const st = new Float32Array(1000 * 3);
  for (let i = 0; i < st.length; i += 3) {
    const angle = random() * TAU; const elevation = .15 + random() * 1.31;
    st[i] = Math.cos(angle) * Math.cos(elevation) * 116;
    st[i + 1] = Math.sin(elevation) * 116;
    st[i + 2] = Math.sin(angle) * Math.cos(elevation) * 116;
  }
  const stars = new T.BufferGeometry(); stars.setAttribute("position", new T.BufferAttribute(st, 3));
  scene.add(new T.Points(stars, new T.PointsMaterial({ color: 0xb3ddea, size: .16, transparent: true, opacity: .71, depthWrite: false, fog: false })));
  scene.add(new T.HemisphereLight(0xb9dafe, 0x5f352c, 2.12));
  const key = new T.DirectionalLight(0xc9edff, 2.1); key.position.set(-22, 31, -15); scene.add(key);
  const fill = new T.DirectionalLight(0xffa166, 1.25); fill.position.set(13, 7, 22); scene.add(fill);

  const patina = surface(9167);
  const concrete = surface(49); concrete.repeat.set(24, 19);
  const ground = new T.Mesh(new T.PlaneGeometry(195, 195), new T.MeshStandardMaterial({ color: 0x293950, map: concrete, roughness: .9 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.018;
  scene.add(ground);

  const definitions = {
    sand: new T.MeshStandardMaterial({ color: 0x9d7860, map: patina, roughness: .83 }),
    clay: new T.MeshStandardMaterial({ color: 0x654555, map: patina, roughness: .92 }),
    paving: new T.MeshStandardMaterial({ color: 0x55647a, map: patina, roughness: .89 }),
    black: new T.MeshStandardMaterial({ color: 0x151e29, roughness: .78 }),
    metal: new T.MeshStandardMaterial({ color: 0x485976, map: patina, roughness: .55, metalness: .35 }),
    teal: new T.MeshStandardMaterial({ color: 0x187b91, map: patina, roughness: .58, metalness: .32 }),
    rust: new T.MeshStandardMaterial({ color: 0x9c4a34, map: patina, roughness: .64, metalness: .29 }),
    cyan: new T.MeshBasicMaterial({ color: 0x46f6f3, toneMapped: false }),
    coral: new T.MeshBasicMaterial({ color: 0xff6956, toneMapped: false }),
    gold: new T.MeshBasicMaterial({ color: 0xffc475, toneMapped: false }),
    quartz: new T.MeshStandardMaterial({ color: 0xc7a98b, roughness: .91 }),
    drape: new T.MeshStandardMaterial({ color: 0x9b3859, side: T.DoubleSide, roughness: .99, map: patina }),
  };
  type Palette = keyof typeof definitions;
  const batches = new Map<Palette, Block[]>();
  function block(m: Palette, x: number, y: number, z: number, w: number, h: number, d: number, r = 0) {
    const items = batches.get(m) ?? [];
    items.push({ x, y, z, w, h, d, r });
    batches.set(m, items);
  }

  // Every piece of usable cover has the same footprint as its server collider.
  for (const [index, c] of COVER.entries()) {
    const { x, z, w, d, h } = c;
    block("black", x, .017, z, w + .65, .05, d + .65);
    const mat = index % 4 < 2 ? "teal" : "rust";
    if (c.kind === "inflatable") {
      const shape = new T.Mesh(new T.CapsuleGeometry(1, .7, 5, 12), definitions[mat]);
      shape.scale.set(w / 2, h / 2.7, d / 2); shape.position.set(x, h / 2, z); scene.add(shape);
      block("metal", x, .14, z, w * .85, .24, d * .89);
      block(mat === "teal" ? "cyan" : "coral", x, h * .53, z + d * .46, w * .63, .10, .09);
      block(mat === "teal" ? "cyan" : "coral", x, h * .53, z - d * .46, w * .63, .10, .09);
    } else if (c.kind === "crate") {
      block(mat, x, h / 2, z, w, h, d);
      for (const side of [-1, 1]) {
        block("metal", x, .11, z + side * d / 2, w + .04, .21, .1);
        block("metal", x, h - .12, z + side * d / 2, w + .04, .2, .1);
        for (let j = 0; j < Math.floor(w / .43); j++) {
          block("black", x - w / 2 + j * .43 + .22, h / 2, z + side * d / 2, .045, h - .37, .09);
        }
        block(mat === "teal" ? "cyan" : "coral", x, h - .27, z + side * d / 2, w * .62, .025, .11);
      }
      for (const i of [-1, 1]) for (const j of [-1, 1]) block("metal", x + i * (w / 2 - .095), h / 2, z + j * (d / 2 - .095), .21, h, .21);
    } else {
      block("sand", x, h / 2, z, w, h, d);
      block("clay", x, .3, z, w + .09, .6, d + .09);
      block("quartz", x, h - .075, z, w + .12, .13, d + .12);
      const strip = w > d;
      for (let j = -.41; j <= .42; j += .16) {
        block("clay", x + (strip ? j * w : 0), h * .54, z + (!strip ? j * d : 0), strip ? .055 : w + .014, h * .7, strip ? d + .014 : .055);
        block("metal", x + (strip ? j * w : 0), h - .26, z + (!strip ? j * d : 0), strip ? .15 : w + .07, .24, strip ? d + .07 : .15);
      }
    }
  }

  function facade(x: number, z: number, w: number, d: number, h: number, faceZ: boolean, sign: number, far: boolean) {
    const stone: Palette = random() > .24 ? "sand" : "clay";
    block(stone, x, h/2, z, w, h, d);
    block("clay", x, h, z, w+.3, .38, d+.3);
    block("quartz", x, h+.21, z, w+.39, .12, d+.39);
    const steps = Math.floor((faceZ ? w : d) / 1.53);
    for (let i = 0; i < steps; i++) {
      const at = (i - (steps - 1) / 2) * 1.53;
      const xx = x + (faceZ ? at : sign * w * .5);
      const zz = z + (faceZ ? sign * d * .5 : at);
      if (i % 2 === 0) block(stone, xx, h + .45, zz, faceZ ? .64 : .24, .49, faceZ ? .24 : .64);
      for (let y = 2.4; y < h - .8; y += 2.17) {
        if (random() < .28) continue;
        const thin = .062;
        const lit: Palette = random() < (far ? .3 : .42) ? "gold" : "black";
        block("clay", xx, y+.065, zz, faceZ ? .62 : thin * 3, 1.05, faceZ ? thin * 3 : .62);
        block(lit, xx + (faceZ ? 0 : sign * .105), y, zz + (faceZ ? sign * .105 : 0), faceZ ? .35 : thin, .66, faceZ ? thin : .35);
        block("metal", xx + (faceZ ? 0 : sign * .145), y, zz + (faceZ ? sign * .145 : 0), faceZ ? .037 : thin, .69, faceZ ? thin : .037);
        block("quartz", xx + (faceZ ? 0 : sign * .11), y - .40, zz + (faceZ ? sign * .11 : 0), faceZ ? .62 : .27, .09, faceZ ? .27 : .62);
      }
    }
  }
  for (let i = 0; i < 12; i++) {
    const x = -31 + i * 5.65;
    for (const sign of [-1, 1]) {
      facade(x, sign * (28.5 + random()), 4.9 + random() * .55, 7, 4.5 + random() * 4.6, true, -sign, false);
      if (i % 2 === 0) facade(x + random() * 2, sign * (33.9 + random() * 8), 4 + random() * 3, 6, 7 + random()*9, true, -sign, true);
    }
  }
  for (let i = 0; i < 9; i++) for (const sign of [-1, 1]) {
    const z = -23 + i * 5.7;
    facade(sign * (34.9 + random() * .9), z, 6.7, 4.9 + random() * .4, 5.2 + random() * 4.8, false, -sign, false);
  }
  // A tiled minaret and its lantern mark the north end of the arena.
  const tower = new T.Group(); tower.position.set(-10, 0, -31.6); scene.add(tower);
  const cap = new T.Mesh(new T.ConeGeometry(1.26, 1.84, 8), definitions.teal);
  cap.position.y = 15.3; tower.add(cap);
  const finial = new T.Mesh(new T.SphereGeometry(.19, 10, 7), definitions.gold);
  finial.position.y = 16.27; tower.add(finial);
  block("sand", -10, 6.73, -31.6, 2.65, 13.46, 2.65);
  block("teal", -10, 13.11, -31.6, 2.81, .48, 2.81);
  block("quartz", -10, 13.56, -31.6, 3.05, .41, 3.05);
  block("sand", -10, 14.09, -31.6, 1.68, 1.07, 1.68);
  block("gold", -10, 14.08, -30.72, .73, .67, .078);
  for (let j = 0; j < 3; j++) {
    block("clay", -10, 8.2 + j * 1.46, -30.23, 1.28, .94, .17);
    block(j === 2 ? "gold" : "teal", -10, 8.2 + j * 1.46, -30.12, .67, .63, .058);
  }

  function arch(x: number, z: number, rotation: number, tint: Palette) {
    const map = (a: number) => [x + a * Math.cos(rotation), z - a * Math.sin(rotation)];
    for (const s of [-1, 1]) {
      const [px, pz] = map(s * 2.28);
      block("quartz", px, 1.38, pz, .63, 2.76, .54, rotation);
      block("clay", px, .35, pz, .79, .70, .64, rotation);
      block(tint, px, .38, pz, .34, .085, .68, rotation);
    }
    const shape = new T.Shape();
    shape.absarc(0, 0, 2.62, 0, Math.PI, false);
    shape.lineTo(-1.99, 0);
    shape.absarc(0, 0, 1.99, Math.PI, 0, true);
    shape.closePath();
    const band = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: .48, bevelEnabled: false, curveSegments: 17 }), definitions.quartz);
    band.position.set(x, 2.70, z); band.rotation.y = rotation;
    scene.add(band);
    block(tint, x, 5.39, z, 2.5, .055, .32, rotation);
  }
  arch(-31.35, 0, Math.PI / 2, "cyan"); arch(31.35, 0, Math.PI / 2, "coral");
  arch(0, -25.1, 0, "gold"); arch(0, 25.1, Math.PI, "gold");
  // Dark seams, lane markings, inset walls and hand-laid tiles.
  for (const sign of [-1, 1]) {
    block("black", sign * (LIMIT_X + .16), .093, 0, .34, .18, 50.1);
    block("black", 0, .093, sign * (LIMIT_Z + .17), 62, .18, .34);
    for (let n = -27; n <= 27; n += 2.45) {
      block("paving", n, .009, sign * 22.5, 2.2, .045, .69);
      if (Math.abs(n) > 1) block(sign === -1 ? "cyan" : "coral", n, .037, sign * 21.93, .39, .02, .035);
      block("metal", n, .013, sign * 24.45, .7, .045, .20);
    }
  }
  groundMark(scene, "J M A 3 A", "#c7d9ec", 0, -8.4, 0);
  groundMark(scene, "S P L A T", "#c7d9ec", 0, 8.4, Math.PI);
  groundMark(scene, "0 1  /  E A S T", "#4af6f1", -24.5, 7.8, -Math.PI / 2);
  groundMark(scene, "0 2  /  W E S T", "#ff735f", 24.5, -7.8, Math.PI / 2);

  const beacon = new T.Mesh(new T.RingGeometry(BEACON_RADIUS - .095, BEACON_RADIUS + .055, 64), new T.MeshBasicMaterial({ color: 0xf3ce98, side: T.DoubleSide, toneMapped: false }));
  beacon.rotation.x = -Math.PI / 2; beacon.position.y = .065; scene.add(beacon);
  const disk = new T.Mesh(new T.CylinderGeometry(2.2, 2.3, .038, 48), definitions.metal); disk.position.y = .028; scene.add(disk);
  const inner = new T.Mesh(new T.RingGeometry(1.97, 2.03, 48), beacon.material); inner.rotation.x = -Math.PI / 2; inner.position.y = .069; scene.add(inner);
  for (let angle = 0; angle < TAU; angle += TAU / 60) {
    const x = Math.cos(angle), z = Math.sin(angle);
    block("quartz", x * 5.48, .045, z * 5.48, .25, .038, .043, -angle);
  }
  const bannerGeo = new T.PlaneGeometry(2.7, 2.5, 12, 3);
  const pos = bannerGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 2.7) * .15 + Math.cos(pos.getY(i) * 3) * .06);
  bannerGeo.computeVertexNormals();
  for (const s of [-1, 1]) {
    const banner = new T.Mesh(bannerGeo, definitions.drape); banner.position.set(s * 10.6, 5.2, s * 24.98); scene.add(banner);
    block("gold", s * 10.6, 6.51, s * 24.98, 3, .08, .08);
  }

  const haloes = document.createElement("canvas"); haloes.width = haloes.height = 128;
  const ctx = haloes.getContext("2d")!;
  const bloom = ctx.createRadialGradient(64, 64, 0, 64, 64, 63);
  bloom.addColorStop(0, "#fff"); bloom.addColorStop(.22, "#fff8"); bloom.addColorStop(.62, "#fff2"); bloom.addColorStop(1, "#fff0");
  ctx.fillStyle = bloom; ctx.fillRect(0, 0, 128, 128);
  const glow = new T.CanvasTexture(haloes);
  for (const [x, z, color] of [[-21,-20,0x4af6f1],[-7,-20,0x4af6f1],[17,-21,0xff735f],
    [23,20,0xff735f],[-14,21,0x4af6f1],[13,13,0xff735f],[0,0,0xffcc81]]) {
    const pool = new T.Mesh(new T.PlaneGeometry(x === 0 ? 16 : 19, x === 0 ? 16 : 17), new T.MeshBasicMaterial({
      map: glow, color, transparent: true, opacity: x === 0 ? .17 : .32,
      depthWrite: false, blending: T.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1,
    }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, .011, z); scene.add(pool);
  }
  for (const [x, z, side] of [[-19,-23,-1],[-4,-23,-1],[14,-23,1],[24,22,1],[4,23,1],[-15,22,-1],[-27,12,-1],[27,-12,1]]) {
    block("black", x, 2.95, z, .21, 5.9, .21);
    block("black", x, 5.88, z, 1.37, .19, .3);
    const tone = side < 0 ? "cyan" : "coral";
    block(tone, x, 5.85, z + .216, 1.06, .095, .12);
    const haze = new T.Sprite(new T.SpriteMaterial({ map: glow, color: TEAMS[tone].hex, depthWrite: false, opacity: .63, blending: T.AdditiveBlending }));
    haze.scale.set(4.4, 4.4, 1); haze.position.set(x, 5.87, z + .17); scene.add(haze);
  }
  for (const [material, items] of batches) {
    const group = new T.InstancedMesh(cube(), definitions[material], items.length);
    const tmp = new T.Object3D();
    items.forEach((v, i) => {
      tmp.position.set(v.x, v.y, v.z); tmp.rotation.y = v.r; tmp.scale.set(v.w, v.h, v.d); tmp.updateMatrix();
      group.setMatrixAt(i, tmp.matrix);
    });
    scene.add(group);
  }

  return beacon;
}
