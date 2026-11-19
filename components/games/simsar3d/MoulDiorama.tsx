"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { makeMoulCharacter, makeMoulScenery, makeMoulShop } from "./moulStreetArt";

type Site = { name: string; price: number; owner: string | null; level: number };
type Person = { id: string; name: string; color: string; emblem: string; character: number; position: number };
type Shot = { id: string; tile: number; kind: "BUY" | "RENT" | "TAX" | "BUILD" | "PRIZE"; amount: number; actor: string; recipient?: string };

interface DioramaProps {
  sites: Site[];
  people: Person[];
  activeId: string;
  highlight: string | null;
  shot: Shot | null;
  onInspect: (index: number) => void;
}

const Y = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3(0, .45, 0);
const VIEW = new THREE.Vector3(6.7, 15.1, 17.8);
const ease = (x: number) => { const p = Math.max(0, Math.min(1, x)); return p * p * (3 - 2 * p); };

function stopAt(index: number) {
  const angle = Math.floor(index / 4) * Math.PI / 2;
  const center = new THREE.Vector3((index % 4 - 1.5) * 2.24, 0, 4.8).applyAxisAngle(Y, angle);
  const inside = new THREE.Vector3(0, 0, -1).applyAxisAngle(Y, angle);
  // Open the front of every shop toward the overview camera. The cast never disappears behind its own shop.
  if (inside.dot(VIEW) < 0) inside.negate();
  return { center, inside, front: Math.atan2(inside.x, inside.z) };
}

function material(color: THREE.ColorRepresentation) {
  return new THREE.MeshStandardMaterial({ color, roughness: .85 });
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

function paintSign(text: string, emblem: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 100;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#2c252c";
  g.beginPath(); g.roundRect(3, 3, 314, 90, 20); g.fill();
  g.strokeStyle = color; g.lineWidth = 8; g.stroke();
  g.fillStyle = "#fff5db";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.font = "bold 45px system-ui, sans-serif";
  g.fillText(emblem + " " + text, 160, 48, 288);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const sign = new THREE.Sprite(mat);
  sign.scale.set(1.85, .58, 1);
  return sign;
}

// Small repeated details share draw calls across all sixteen shops.
function batchScenery(source: THREE.Group) {
  const result = new THREE.Group();
  const buckets = new Map<string, THREE.Mesh[]>();
  source.updateMatrixWorld(true);
  source.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || obj instanceof THREE.InstancedMesh || Array.isArray(obj.material)) return;
    const key = obj.geometry.uuid + obj.material.uuid;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(obj); else buckets.set(key, [obj]);
  });
  for (const meshes of buckets.values()) {
    const first = meshes[0];
    if (meshes.length === 1) {
      const mesh = new THREE.Mesh(first.geometry, first.material);
      mesh.applyMatrix4(first.matrixWorld);
      result.add(mesh);
    } else {
      const mesh = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
      meshes.forEach((item, i) => mesh.setMatrixAt(i, item.matrixWorld));
      mesh.computeBoundingSphere();
      result.add(mesh);
    }
  }
  // The artist may already batch parts or use a line for an architectural detail.
  source.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh || obj instanceof THREE.Line || obj instanceof THREE.Sprite ||
      (obj instanceof THREE.Mesh && Array.isArray(obj.material))) {
      const clone = obj.clone(false);
      clone.matrix.copy(obj.matrixWorld);
      clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
      result.add(clone);
    }
  });
  return result;
}

function makePlaza() {
  const art = new THREE.Group();
  const stone = material(0xf3caa2);
  const grout = material(0xf5e0b6);
  const jade = material(0x177b74);
  const brass = material(0xe0ae55);
  art.add(box(12.6, .5, 12.6, material(0xb97f72), 0, -.61, 0));
  art.add(box(12.68, .075, 12.68, brass, 0, -.39, 0));
  art.add(box(12.7, .38, 12.7, stone, 0, -.20, 0));
  art.add(box(9.1, .04, 9.1, material(0xc99e82), 0, .005, 0));
  art.add(box(7.75, .045, 7.75, grout, 0, .037, 0));
  const paving = document.createElement("canvas"); paving.width = paving.height = 256;
  const ctx = paving.getContext("2d")!;
  ctx.fillStyle = "#c9bca4"; ctx.fillRect(0, 0, 256, 256);
  const sandstone = ["#e4d4b8", "#e9d9bd", "#e4d1b0", "#efdfbf", "#e2caab"];
  for (let y = 0; y < 8; y++) {
    for (let x = -1; x < 8; x++) {
      ctx.fillStyle = sandstone[Math.abs(x * 7 + y * 11 + x * y) % sandstone.length];
      ctx.fillRect(x * 40 + (y % 2 ? 20 : 0) + 1, y * 32 + 1, 39, 31);
    }
  }
  const stones = new THREE.CanvasTexture(paving); stones.colorSpace = THREE.SRGBColorSpace;
  stones.wrapS = stones.wrapT = THREE.RepeatWrapping; stones.repeat.set(3, 3);
  const courtyard = new THREE.Mesh(new THREE.PlaneGeometry(7.62, 7.62), new THREE.MeshStandardMaterial({ map: stones, roughness: 1 }));
  courtyard.rotation.x = -Math.PI / 2; courtyard.position.y = .064; art.add(courtyard);
  const disk = new THREE.CylinderGeometry(1, 1, .025, 8);
  for (const [r, h, m] of [[2.32,.085,jade],[2.21,.112,grout],[2.03,.137,brass],[1.98,.163,grout]] as const) {
    const step = new THREE.Mesh(disk,m); step.rotation.y = Math.PI / 8;
    step.scale.set(r, 1, r); step.position.y = h; art.add(step);
  }
  const regularTile = new THREE.BoxGeometry(.17,.025,.17);
  for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 16;
    const enamel = new THREE.Mesh(regularTile, i % 2 ? jade : brass);
    enamel.position.set(1.68 * Math.sin(a), .19, 1.68 * Math.cos(a)); enamel.rotation.y = Math.PI / 4 + a; art.add(enamel);
  }
  // Lanterns and the mosaic are part of the square itself and stay out of the purchase close-ups.
  const post = new THREE.CylinderGeometry(.044, .061, 1.46, 6);
  const lamp = new THREE.OctahedronGeometry(.19);
  const wrought = material(0x48484b); const amber = material(0xffb948);
  for (const x of [-2.65, 2.65]) for (const z of [-2.65, 2.65]) {
    const iron = new THREE.Mesh(post, wrought); iron.position.set(x, .79, z);
    const flame = new THREE.Mesh(lamp, amber); flame.scale.set(1, 1.5, 1); flame.position.set(x, 1.58, z);
    const tip = new THREE.Mesh(lamp, wrought); tip.scale.set(.73, .67, .73); tip.position.set(x, 1.8, z);
    art.add(iron, flame, tip);
  }
  const mosaic = new THREE.BoxGeometry(.22, .025, .22);
  const edge = new THREE.BoxGeometry(11.8, .024, .055);
  for (let side = 0; side < 4; side++) {
    const strip = new THREE.Group();
    strip.rotation.y = side * Math.PI / 2;
    const border = new THREE.Mesh(edge, jade); border.position.set(0, .018, 6.04); strip.add(border);
    for (let i = -16; i <= 16; i++) {
      const tessera = new THREE.Mesh(mosaic, i % 2 ? jade : brass);
      tessera.position.set(i * .347, .018, 6.22);
      tessera.rotation.y = Math.PI / 4;
      strip.add(tessera);
    }
    art.add(strip);
  }
  const fountain = makeMoulScenery(); fountain.userData.cachedModel = true; fountain.position.y = .184; art.add(fountain);
  return art;
}

function landscape() {
  const canvas = document.createElement("canvas"); canvas.width = 1160; canvas.height = 600;
  const ctx = canvas.getContext("2d")!;
  const sky = ctx.createLinearGradient(0,0,0,600);
  sky.addColorStop(0,"#9fcbd6"); sky.addColorStop(.38,"#f4d6ac"); sky.addColorStop(.76,"#e6b389"); sky.addColorStop(1,"#c58c72");
  ctx.fillStyle = sky; ctx.fillRect(0,0,1160,600);
  const haze = ctx.createRadialGradient(230,100,3,230,100,150);
  haze.addColorStop(0,"#fff4ca"); haze.addColorStop(.15,"#fff1c5"); haze.addColorStop(.19,"#ffe7aa90"); haze.addColorStop(1,"#ffe7aa00");
  ctx.fillStyle=haze; ctx.fillRect(0,0,490,270);
  for (let layer=0;layer<3;layer++) {
    ctx.fillStyle=["#a39aa387","#c1a39b","#dcb99d"][layer];
    ctx.beginPath(); ctx.moveTo(0,600);
    for(let x=0;x<=1170;x+=9) {
      const ridge= Math.abs(Math.sin(x*.007 + layer*2.5)) * 40 + Math.sin(x*.021 + layer)*9 + Math.cos(x*.061)*3;
      ctx.lineTo(x,128 + layer*39 - ridge*(1-layer*.23));
    }
    ctx.lineTo(1170,600);ctx.fill();
  }
  const floor = ctx.createLinearGradient(0,183,0,600);
  floor.addColorStop(0,"#dcb99d00");floor.addColorStop(.45,"#e3bd98");floor.addColorStop(1,"#ba8977");
  ctx.fillStyle=floor;ctx.fillRect(0,183,1160,417);
  return "url(" + canvas.toDataURL() + ")";
}

function makeKey() {
  const root = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc647, metalness: .55, roughness: .29, emissive: 0x352009 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.20, .058, 6, 18), gold);
  ring.position.x = -.25;
  root.add(ring, box(.63, .09, .09, gold, .12, 0, 0), box(.09, .20, .09, gold, .37, -.07, 0),
    box(.08, .15, .09, gold, .22, -.05, 0));
  return root;
}

function makeReceipt() {
  const root = new THREE.Group();
  root.add(box(.42, .88, .025, material(0xfff1c6), 0, 0, 0));
  const ink = material(0x414048);
  for (let i = 0; i < 5; i++) root.add(box(i % 2 ? .19 : .30, .024, .01, ink, -.014, .29 - i * .12, .022));
  root.add(box(.22, .09, .015, material(0xb83e37), .035, -.30, .022));
  return root;
}

function disposeSprite(sprite?: THREE.Sprite) {
  if (!sprite) return;
  sprite.removeFromParent();
  sprite.material.map?.dispose();
  sprite.material.dispose();
}

function disposeParts(group: THREE.Object3D) {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  const visit = (o: THREE.Object3D) => {
    if (o.userData.cachedModel) return;
    if (o instanceof THREE.Mesh) {
      geos.add(o.geometry);
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) mats.add(mat);
    }
    o.children.forEach(visit);
  };
  visit(group);
  geos.forEach(g => g.dispose()); mats.forEach(m => {
    if (m instanceof THREE.MeshStandardMaterial) m.map?.dispose();
    m.dispose();
  });
}

function pawnPosition(tile: number, slot: number, size: number) {
  const { center, inside } = stopAt(tile);
  const pos = center.addScaledVector(inside, 1.08 + (size > 3 && slot >= 3 ? .53 : 0));
  const inRow = slot < 3 ? Math.min(size, 3) : size - 3;
  return pos.addScaledVector(new THREE.Vector3(inside.z, 0, -inside.x), ((slot < 3 ? slot : slot - 3) - (inRow - 1) / 2) * .47);
}

interface Lot {
  hit: THREE.Mesh;
  curb: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  nameplate?: THREE.Sprite;
  roof: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  height: number;
  badgeKey: string;
}
interface Pawn {
  base: THREE.Group;
  figure: THREE.Group;
  badge: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  goal: THREE.Vector3;
  tile: number;
  waypoints: THREE.Vector3[];
  character: number;
}

export default function MoulDiorama(props: DioramaProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const sync = useRef<(() => void) | null>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => { latest.current = props; sync.current?.(); }, [props]);

  useEffect(() => {
    const mount = host.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" }); }
    catch { setFallback(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:pan-y";
    mount.appendChild(canvas);
    mount.style.backgroundImage = landscape(); mount.style.backgroundSize = "100% 100%";
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffefdc, 0xe1aca1, 2.05));
    const sunlight = new THREE.DirectionalLight(0xffdb9b, 2.25);
    sunlight.position.set(-6, 12, 7); scene.add(sunlight);
    const camera = new THREE.OrthographicCamera(-10, 10, 8, -8, .1, 110);
    camera.position.copy(VIEW); camera.lookAt(ORIGIN);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const district = makePlaza();
    const lots: Lot[] = [];
    const interactive = new THREE.Group();
    const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
    const bodies = new Map<string, Pawn>();
    const ring = new THREE.Mesh(new THREE.RingGeometry(.29, .37, 36), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; scene.add(ring);
    let disposed = false;
    let raf = 0;
    let lastDraw = 0;
    let dirty = true;
    let lastShot: string | null = null;
    let theatre: { shot: Shot; start: number; duration: number; group: THREE.Group; prop: THREE.Group; ownedProps: THREE.Group; gesture?: THREE.Object3D; coins: THREE.Mesh[]; target: THREE.Vector3; eye: THREE.Vector3 } | null = null;
    let span = 10;
    const target = ORIGIN.clone();
    const stopShow = () => {
      if (!theatre) return;
      theatre.group.removeFromParent(); disposeParts(theatre.ownedProps);
      theatre = null;
    };

    const genericTile = (index: number) => {
      const {center, inside, front} = stopAt(index);
      const stand = new THREE.Group();
      stand.position.copy(center); stand.rotation.y = front;
      stand.add(box(1.95, .10, 1.65, material(index % 2 ? 0xe6b98e : 0xe0ad87), 0, .055, 0));
      const price = latest.current.sites[index].price;
      const variant = price >= 500 ? 7 : price >= 300 ? 3 + index % 4 : price === 0 ? 5 : index % 3;
      const shop = makeMoulShop(variant); shop.userData.cachedModel = true;
      const height = new THREE.Box3().setFromObject(shop).max.y + .115;
      shop.position.y = .115; stand.add(shop);
      district.add(stand);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.95, 1.7), hitMaterial);
      hit.position.copy(center); hit.position.y = 1.02; hit.rotation.y = front; hit.userData.tile = index; interactive.add(hit);
      const curb = box(1.9, .13, .21, material(0xf1cd9b), 0, 0, 0) as Lot["curb"];
      curb.position.copy(center).addScaledVector(inside, .80); curb.position.y = .105; curb.rotation.y = front;
      const roof = box(.92, .16, .56, material(0xfecc6c), 0, 0, 0) as Lot["roof"];
      roof.position.copy(center); roof.position.y = height; roof.rotation.y = front; roof.visible = false;
      scene.add(curb, roof);
      lots.push({hit, curb, roof, badgeKey: "", height});
    };
    latest.current.sites.forEach((_, i) => genericTile(i));
    const batched = batchScenery(district);
    scene.add(batched, interactive);

    const startShow = (shot: Shot) => {
      stopShow();
      if (!lots[shot.tile] || still.matches) return;
      const { center, inside, front } = stopAt(shot.tile);
      const props = latest.current;
      const landmark = (props.sites[shot.tile]?.price || 0) >= 280;
      const payment = shot.kind === "TAX" || shot.kind === "RENT";
      const group = new THREE.Group();
      group.position.copy(center).addScaledVector(inside, 1.05); group.rotation.y = front;
      const ownedProps = new THREE.Group(); group.add(ownedProps);
      const prop = payment ? makeReceipt() : makeKey(); ownedProps.add(prop);
      const coins: THREE.Mesh[] = [];
      if (payment || shot.kind === "PRIZE") {
        const geo = new THREE.CylinderGeometry(.116, .116, .037, 12);
        const gold = material(0xffca3e);
        for (let i = 0; i < 6; i++) { const coin = new THREE.Mesh(geo, gold); ownedProps.add(coin); coins.push(coin); }
      }
      const guest = (id: string | undefined, x: number, fallback?: number) => {
        const person = props.people.find(p => p.id === id);
        if (!person && fallback === undefined) return;
        const fig = makeMoulCharacter(person?.character ?? fallback!);
        fig.position.set(x, .12, .18); fig.rotation.y = x < 0 ? .36 : -.4;
        group.add(fig);
        return fig.getObjectByName("gesture");
      };
      guest(shot.actor, -.56);
      const gesture = payment ? guest(shot.recipient, .54, shot.kind === "TAX" ? 7 : undefined) : undefined;
      const focus = center.clone().addScaledVector(inside, .45); focus.y = .96;
      const eye = focus.clone().addScaledVector(inside, 8.6).add(new THREE.Vector3(inside.z * 2.2, landmark ? 3.35 : 4.1, -inside.x * 2.2));
      scene.add(group);
      theatre = { shot, start: performance.now(), duration: landmark ? 3300 : 2650, group, prop, ownedProps, gesture, coins, target: focus, eye };
    };

    const schedule = () => { if (!raf && !disposed && !document.hidden) raf = requestAnimationFrame(draw); };
    const update = () => {
      const { sites, people, activeId, highlight, shot } = latest.current;
      const byId = new Map(people.map(p => [p.id, p]));
      sites.forEach((site, i) => {
        const lot = lots[i]; if (!lot) return;
        const owner = site.owner ? byId.get(site.owner) : undefined;
        const color = owner?.color || "#f1cd9b";
        lot.curb.material.color.set(color);
        lot.curb.material.emissive.set(highlight && site.owner === highlight ? color : 0x000000);
        lot.curb.material.emissiveIntensity = .6;
        lot.curb.scale.y = highlight && site.owner === highlight ? 2.65 : 1;
        lot.roof.visible = site.level > 0;
        lot.roof.scale.y = 1 + .65 * site.level;
        const key = owner ? [owner.name, owner.emblem, color].join("|") : "";
        if (key !== lot.badgeKey) {
          disposeSprite(lot.nameplate); lot.nameplate = undefined; lot.badgeKey = key;
          if (owner) {
            const sprite = paintSign(owner.name, owner.emblem, color);
            sprite.position.copy(stopAt(i).center); sprite.position.y = lot.height + .39;
            scene.add(sprite); lot.nameplate = sprite;
          }
        }
        if (lot.nameplate) lot.nameplate.scale.set(1.85, .58, 1).multiplyScalar(highlight === site.owner ? 1.12 : 1);
      });
      const stacks = new Map<number, Person[]>();
      people.forEach(p => stacks.set(p.position, [...(stacks.get(p.position) || []), p]));
      people.forEach(p => {
        const stack = stacks.get(p.position)!;
        const goal = pawnPosition(p.position, stack.indexOf(p), stack.length);
        let pawn = bodies.get(p.id);
        if (!pawn) {
          const base = new THREE.Group();
          const figure = makeMoulCharacter(p.character);
          const badge = new THREE.Mesh(new THREE.CylinderGeometry(.30, .34, .112, 16), material(p.color));
          badge.position.y = .10;
          figure.position.y = .15; figure.scale.setScalar(.80);
          base.add(badge, figure); base.position.copy(goal); scene.add(base);
          pawn = { base, figure, badge, goal, character: p.character, tile: p.position, waypoints: [] }; bodies.set(p.id, pawn);
        } else {
          if (pawn.tile !== p.position) {
            const count = sites.length;
            const ahead = (p.position - pawn.tile + count) % count;
            const direction = ahead <= count / 2 ? 1 : -1;
            pawn.waypoints = [];
            for (let t = (pawn.tile + direction + count) % count; t !== p.position; t = (t + direction + count) % count) {
              pawn.waypoints.push(pawnPosition(t, 0, 1));
            }
            pawn.tile = p.position;
          }
          if (pawn.character !== p.character) {
            pawn.figure.removeFromParent();
            pawn.figure = makeMoulCharacter(p.character);
            pawn.figure.position.y = .15; pawn.figure.scale.setScalar(.80);
            pawn.base.add(pawn.figure); pawn.character = p.character;
          }
          pawn.goal.copy(goal);
        }
        pawn.badge.material.color.set(p.color);
        pawn.base.rotation.y = .4;
      });
      bodies.forEach((pawn, id) => {
        if (byId.has(id)) return;
        pawn.base.removeFromParent(); pawn.badge.geometry.dispose(); pawn.badge.material.dispose(); bodies.delete(id);
      });
      ring.visible = byId.has(activeId);
      if (shot && shot.id !== lastShot) { lastShot = shot.id; startShow(shot); }
      dirty = true; schedule();
    };

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      const aspect = w / h;
      span = Math.max(6.6, 8.8 / aspect);
      camera.left = -span * aspect; camera.right = span * aspect;
      camera.top = span; camera.bottom = -span; camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      dirty = true; schedule();
    };
    const travel = new THREE.Vector3();
    function draw(now: number) {
      raf = 0;
      if (disposed || document.hidden) return;
      const delta = Math.min(100, now - lastDraw);
      if (delta < 31 && !dirty) { schedule(); return; }
      lastDraw = now;
      let moving = false;
      const show = theatre;
      let blend = 0;
      if (show) {
        const t = (now - show.start) / show.duration;
        if (t >= 1 || still.matches) stopShow();
        else {
          moving = true;
          blend = ease(t / .22) * ease((1 - t) / .22);
          const bill = show.shot.kind === "TAX" || show.shot.kind === "RENT";
          show.prop.position.set(bill ? -.2 + .43 * ease((t - .25) * 2) : 0,
            (bill ? .96 : 1.45) + Math.sin(t * Math.PI) * .23, .55);
          show.prop.rotation.set(.04, bill ? -.1 : t * Math.PI * 2, bill ? .12 - .24 * t : Math.sin(t * Math.PI * 3) * .2);
          if (show.gesture) show.gesture.rotation.x = -.40 * Math.sin(t * Math.PI * 2);
          show.coins.forEach((coin, i) => {
            const frac = ((t * 2.5 - .09 * i) % 1 + 1) % 1;
            coin.position.set(-.55 + 1.1 * frac, .84 + Math.sin(frac * Math.PI) * .7, .36 + i * .023);
            coin.rotation.set(Math.PI / 2, 0, frac * Math.PI * 4);
            coin.visible = (t > .20 && t < .84);
          });
        }
      }
      bodies.forEach((pawn, id) => {
        const next = pawn.waypoints[0] || pawn.goal;
        const dist = pawn.base.position.distanceTo(next);
        if ((dist > .003 || pawn.waypoints.length > 0) && !still.matches) {
          const step = delta * .010;
          if (dist <= step) { pawn.base.position.copy(next); pawn.waypoints.shift(); }
          else pawn.base.position.addScaledVector(travel.subVectors(next, pawn.base.position), step / dist);
          pawn.figure.position.y = .15 + Math.abs(Math.sin(now * .016)) * Math.min(.14, dist / 2);
          moving = true;
        } else { pawn.waypoints.length = 0; pawn.base.position.copy(pawn.goal); pawn.figure.position.y = .15; }
        pawn.base.visible = !(theatre && blend > .2 && (id === theatre.shot.actor || id === theatre.shot.recipient));
        if (id === latest.current.activeId) ring.position.copy(pawn.base.position).y = .08;
      });
      if (theatre) {
        camera.position.lerpVectors(VIEW, theatre.eye, blend);
        target.lerpVectors(ORIGIN, theatre.target, blend);
        camera.zoom = 1 + (Math.min(span / 2.20, 4.85) - 1) * blend;
      } else {
        camera.position.copy(VIEW); target.copy(ORIGIN); camera.zoom = 1;
      }
      camera.lookAt(target); camera.updateProjectionMatrix(); renderer.render(scene, camera);
      dirty = false;
      if (moving) schedule();
    }
    const ray = new THREE.Raycaster();
    let pointer: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => { pointer = { x: e.clientX, y: e.clientY }; };
    const up = (e: PointerEvent) => {
      if (!pointer || Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 8) return;
      pointer = null;
      const rect = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2), camera);
      const hit = ray.intersectObjects(interactive.children, false)[0];
      if (hit) latest.current.onInspect(hit.object.userData.tile as number);
    };
    const visible = () => { if (!document.hidden) { dirty = true; schedule(); } };
    const lost = (e: Event) => { e.preventDefault(); setFallback(true); };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointerup", up);
    canvas.addEventListener("webglcontextlost", lost);
    document.addEventListener("visibilitychange", visible);
    sync.current = update; resize(); update();
    return () => {
      disposed = true; sync.current = null;
      cancelAnimationFrame(raf); observer.disconnect();
      document.removeEventListener("visibilitychange", visible);
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("webglcontextlost", lost);
      stopShow(); lots.forEach(l => { disposeSprite(l.nameplate); disposeParts(l.curb); disposeParts(l.roof); });
      bodies.forEach(p => { p.badge.geometry.dispose(); p.badge.material.dispose(); });
      batched.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
      disposeParts(district);
      disposeParts(interactive); disposeParts(ring);
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    };
  }, []);

  return <div style={{ position: "relative", overflow: "hidden", width: "100%", height: "clamp(260px, 47svh, 490px)", background: "radial-gradient(ellipse at 19% 17%, #ffe7b6 0%, transparent 41%), linear-gradient(160deg, #acced4 0%, #efc99e 51%, #ca9077 100%)" }}>
    <div ref={host} style={{ width: "100%", height: "100%" }} role="img" aria-label="الحي بثلاثة الأبعاد، علامة كل محل كاتبيّن شكون مولاه" />
    {fallback && <div dir="rtl" aria-label="خريطة الأملاك" style={{position:"absolute",inset:8,display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:4}}>
      {props.sites.map((site,i)=>{const owner=props.people.find(p=>p.id===site.owner);return <button key={i} onClick={()=>props.onInspect(i)} style={{background:"#293e36",color:"#fff3d1",border:"3px solid "+(owner?.color ?? "#c3986e"),borderRadius:8,padding:3,fontSize:13,fontWeight:700}}>{site.name}<br/>{owner ? owner.emblem+" "+owner.name : site.price || "الضريبة"}</button>})}
    </div>}
  </div>;
}
