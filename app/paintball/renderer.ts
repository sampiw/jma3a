import * as T from "three";
import { advance, aim, COVER, EYE_HEIGHT, LIMIT_X, LIMIT_Z, SHOT_DELAY, TEAMS, trace, type ArenaInput } from "@/games/paintball/arena";
import type { Fighter, PaintShot, Snapshot } from "@/games/paintball/match";
import { buildArena, rng } from "./arena-art";

const time = () => performance.now();
const bodyMaterial = new T.MeshStandardMaterial({ color: 0x162339, roughness: .55, metalness: .25 });
const gripMaterial = new T.MeshStandardMaterial({ color: 0x374b64, roughness: .39, metalness: .43 });
const visorMaterial = new T.MeshStandardMaterial({ color: 0x1e3a50, roughness: .17, metalness: .76 });

function block(parent: T.Object3D, material: T.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
  const obj = new T.Mesh(new T.BoxGeometry(w, h, d), material);
  obj.position.set(x, y, z); parent.add(obj);
  return obj;
}

function playerAvatar(f: Fighter) {
  const root = new T.Group();
  const accent = new T.MeshStandardMaterial({ color: TEAMS[f.team].hex, roughness: .46, metalness: .35, emissive: TEAMS[f.team].hex, emissiveIntensity: .22 });
  const cloth = new T.MeshStandardMaterial({ color: f.team === "cyan" ? 0x19505f : 0x713447, roughness: .78 });
  const shadow = new T.Mesh(new T.CircleGeometry(.54, 16), new T.MeshBasicMaterial({ color: 0x121625, transparent: true, opacity: .5, depthWrite: false }));
  shadow.rotation.x = -Math.PI/2; shadow.position.y = .045; root.add(shadow);
  const hips = block(root, cloth, 0, .78, 0, .58, .31, .32);
  block(root, bodyMaterial, 0, 1.05, 0, .72, .47, .39);
  block(root, accent, 0, 1.09, .199, .6, .17, .046);
  block(root, accent, 0, 1.09, -.199, .6, .17, .046);
  block(root, gripMaterial, 0, 1.01, -.253, .42, .31, .12);
  const legs: T.Group[] = [];
  for (const sign of [-1, 1]) {
    const leg = new T.Group(); leg.position.set(sign * .20, .82, 0); hips.parent!.add(leg);
    block(leg, cloth, 0, -.25, 0, .235, .49, .23);
    block(leg, bodyMaterial, 0, -.57, .028, .21, .3, .25);
    block(leg, gripMaterial, 0, -.73, .071, .25, .15, .34);
    legs.push(leg);
    const sleeve = block(root, cloth, sign * .43, 1.09, .07, .2, .40, .2);
    sleeve.rotation.x = -.55;
    block(root, accent, sign * .43, 1.22, .057, .19, .10, .23);
  }
  const helmet = new T.Mesh(new T.SphereGeometry(.29, 14, 8), bodyMaterial); helmet.position.y = 1.515; root.add(helmet);
  const visor = new T.Mesh(new T.SphereGeometry(.245, 12, 7), visorMaterial); visor.scale.set(1.03, .56, .45); visor.position.set(0, 1.55, .227); root.add(visor);
  block(root, accent, 0, 1.55, .308, .37, .032, .035);
  const marker = block(root, gripMaterial, .19, 1.19, .45, .19, .22, .64);
  const muzzle = block(root, accent, .19, 1.23, .79, .11, .1, .23); muzzle.rotation.y = marker.rotation.y;

  const canvas = document.createElement("canvas"); canvas.width = 384; canvas.height = 72;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#101725dd"; ctx.roundRect(7, 8, 370, 56, 23); ctx.fill();
  ctx.fillStyle = TEAMS[f.team].css; ctx.textAlign = "center"; ctx.font = "700 37px Arial"; ctx.fillText(f.name, 192, 50, 331);
  const labelTexture = new T.CanvasTexture(canvas); labelTexture.colorSpace = T.SRGBColorSpace;
  const label = new T.Sprite(new T.SpriteMaterial({ map: labelTexture, depthWrite: false, transparent: true }));
  label.position.y = 2.11; label.scale.set(2.19, .41, 1); root.add(label);
  return { root, legs, team: f.team, goal: new T.Vector3(f.x, 0, f.z), yaw: f.yaw };
}

function paintMarker(camera: T.Camera) {
  const marker = new T.Group();
  marker.position.set(.34, -.29, -.64);
  marker.rotation.y = -.18;
  marker.scale.setScalar(.84);
  camera.add(marker);
  const color = new T.MeshStandardMaterial({ color: TEAMS.cyan.hex, emissive: 0x124b5c, metalness: .51, roughness: .4 });
  block(marker, bodyMaterial, 0,.008, 0, .19,.175,.32);
  block(marker, color, 0,.068, -.07, .202,.06,.225);
  block(marker, gripMaterial, .002,.014, -.22, .115,.119,.149);
  const barrel = new T.Mesh(new T.CylinderGeometry(.035, .044, .37, 9), gripMaterial);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, .042, -.31); marker.add(barrel);
  const tip = new T.Mesh(new T.CylinderGeometry(.044, .044, .08, 10), color);
  tip.rotation.x = Math.PI / 2; tip.position.set(0, .042, -.495); marker.add(tip);
  const hopper = new T.Mesh(new T.SphereGeometry(.125, 16, 9), bodyMaterial);
  hopper.position.set(-.016, .17, .032); hopper.scale.set(.78, .65, 1.43); marker.add(hopper);
  block(marker, color, -.015,.243,.049, .108,.016,.112);
  const glove = block(marker, gripMaterial, .018,-.112,.055, .145,.224,.186);
  glove.rotation.x = .24;
  block(marker, bodyMaterial, -.017,-.1,-.126, .17,.13,.145).rotation.z = -.22;
  return { marker, color };
}

type Effect = { object: T.Object3D; expires: number; fades: T.Material };

function splatterTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!; ctx.translate(64, 64); ctx.fillStyle = "white";
  const random = rng(638);
  ctx.beginPath();
  for (let i = 0; i < 30; i++) {
    const a = i * (Math.PI * 2 / 30), r = 19 + random() * 16;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
  for (let i = 0; i < 28; i++) {
    const a = random() * Math.PI * 2, r = 25 + random() * 36;
    ctx.beginPath(); ctx.ellipse(Math.cos(a) * r, Math.sin(a) * r, 1.1 + random() * 5, 1 + random() * 2.5, a, 0, Math.PI * 2); ctx.fill();
  }
  return new T.CanvasTexture(canvas);
}

function disposeObject(root: T.Object3D) {
  const geometry = new Set<T.BufferGeometry>(); const materials = new Set<T.Material>(); const textures = new Set<T.Texture>();
  root.traverse(node => {
    const item = node as T.Mesh;
    if (item.geometry) geometry.add(item.geometry);
    if (item.material) for (const mat of Array.isArray(item.material) ? item.material : [item.material]) materials.add(mat);
  });
  for (const material of materials) {
    if ([bodyMaterial, gripMaterial, visorMaterial].includes(material as T.MeshStandardMaterial)) continue;
    for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value);
    material.dispose();
  }
  for (const geo of geometry) geo.dispose();
  for (const texture of textures) texture.dispose();
}

export class ArenaRenderer {
  private graphics: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(67, 1, .05, 175);
  private beacon: ReturnType<typeof buildArena>;
  private weapon: ReturnType<typeof paintMarker>;
  private paint = splatterTexture();
  private foes = new Map<string, ReturnType<typeof playerAvatar>>();
  private effects: Effect[] = [];
  private view: Snapshot | null = null;
  private raf = 0;
  private previous = time();
  private lastRemoteShot = 0;
  private lastFX = 0;
  private lastMap = 0;
  private recoil = 0;
  private sway = 0;
  private local = { x: 0, z: 0 };
  private map: CanvasRenderingContext2D | null;
  private resize: ResizeObserver;
  private zoom: number;

  constructor(private host: HTMLElement, minimap: HTMLCanvasElement, private control: ArenaInput, low: boolean) {
    this.map = minimap.getContext("2d");
    this.zoom = low ? .86 : Math.min(1.35, window.devicePixelRatio || 1);
    this.graphics = new T.WebGLRenderer({ antialias: !low, alpha: false, powerPreference: "high-performance" });
    this.graphics.toneMapping = T.ACESFilmicToneMapping;
    this.graphics.toneMappingExposure = 1.26;
    this.graphics.setPixelRatio(this.zoom);
    this.graphics.domElement.className = "pb-world";
    this.host.appendChild(this.graphics.domElement);
    this.beacon = buildArena(this.scene);
    this.scene.add(this.camera);
    this.weapon = paintMarker(this.camera);
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(this.host);
    this.fit();
    this.render(time());
  }

  private fit() {
    const width = this.host.clientWidth || window.innerWidth;
    const height = this.host.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.fov = width < height ? 75 : 65;
    this.camera.updateProjectionMatrix();
    this.graphics.setSize(width, height, false);
  }

  sync(next: Snapshot, sentAt: number) {
    const me = next.players.find(p => p.id === next.self.id);
    const previousMe = this.view?.players.find(p => p.id === me?.id);
    if (me && next.phase === "playing") {
      const teleported = this.view?.phase !== "playing" || next.round !== this.view.round || (previousMe?.respawnAt && !me.respawnAt);
      if (teleported || Math.hypot(me.x - this.local.x, me.z - this.local.z) > 5) {
        this.local = { x: me.x, z: me.z };
        if (teleported) { this.control.yaw = me.yaw; this.control.pitch = me.pitch; }
      } else {
        const target = advance(me, this.control, Math.min(.24, (time() - sentAt) / 1000));
        if (Math.hypot(target.x - this.local.x, target.z - this.local.z) > .28) {
          this.local.x += (target.x - this.local.x) * .29; this.local.z += (target.z - this.local.z) * .29;
        }
      }
      this.weapon.color.color.setHex(TEAMS[me.team].hex);
    }
    for (const p of next.players) {
      if (p.id === next.self.id) continue;
      let model = this.foes.get(p.id);
      if (model?.team !== p.team) {
        if (model) { this.scene.remove(model.root); disposeObject(model.root); }
        model = playerAvatar(p); model.root.position.copy(model.goal); this.foes.set(p.id, model); this.scene.add(model.root);
      }
      model.goal.set(p.x, 0, p.z);
      if (model.root.position.distanceTo(model.goal) > 10) model.root.position.copy(model.goal);
      model.root.visible = next.phase === "playing" && !p.respawnAt && p.online;
      model.yaw = p.yaw;
    }
    for (const [id, model] of this.foes) {
      if (next.players.some(p => p.id === id)) continue;
      this.scene.remove(model.root); disposeObject(model.root); this.foes.delete(id);
    }
    for (const shot of next.shots) {
      if (shot.id <= this.lastRemoteShot) continue;
      this.lastRemoteShot = shot.id;
      if (shot.shooter !== next.self.id || shot.hit) this.effect(shot, shot.shooter === next.self.id);
    }
    this.view = next;
  }

  reset() {
    this.view = null;
    this.lastRemoteShot = 0;
    for (const model of this.foes.values()) { this.scene.remove(model.root); disposeObject(model.root); }
    this.foes.clear();
  }

  trigger() {
    const state = this.view;
    const me = state?.players.find(p => p.id === state.self.id);
    const now = time();
    if (!state || state.phase !== "playing" || !me || me.respawnAt || !state.self.ammo || state.self.reloadUntil || now - this.lastFX < SHOT_DELAY) return;
    this.lastFX = now;
    const { origin, dir, distance } = trace(this.local, this.control.yaw, this.control.pitch);
    this.recoil = .14;
    this.effect({ id: 0, shooter: me.id, team: me.team, fromX: origin.x, fromZ: origin.z,
      x: origin.x + dir.x * distance, y: origin.y + dir.y * distance, z: origin.z + dir.z * distance, at: 0, hit: null }, false);
  }

  private effect(shot: PaintShot, impactOnly: boolean) {
    const color = TEAMS[shot.team].hex;
    const hit = new T.Vector3(shot.x, shot.y, shot.z);
    const begin = new T.Vector3(shot.fromX, EYE_HEIGHT, shot.fromZ);
    const offset = begin.clone().sub(hit).normalize().multiplyScalar(.20);
    if (!impactOnly) {
      const material = new T.LineBasicMaterial({ color, transparent: true, opacity: .95, toneMapped: false });
      const line = new T.Line(new T.BufferGeometry().setFromPoints([begin.lerp(hit, .06), hit]), material);
      this.scene.add(line); this.effects.push({ object: line, expires: time() + 100, fades: material });
    }
    const mat = new T.SpriteMaterial({ map: this.paint, color, depthWrite: false, transparent: true, opacity: .83, toneMapped: false, rotation: shot.x * 1.7 });
    const splat = new T.Sprite(mat); splat.position.copy(hit).add(offset);
    splat.scale.setScalar(shot.hit ? 1.08 : .76);
    this.scene.add(splat); this.effects.push({ object: splat, expires: time() + (shot.hit ? 650 : 2500), fades: mat });
    if (this.effects.length > 100) this.removeEffect(this.effects.shift()!);
  }

  private removeEffect(effect: Effect) {
    this.scene.remove(effect.object);
    if (effect.object instanceof T.Line) effect.object.geometry.dispose();
    effect.fades.dispose();
  }

  private mini(me: Fighter | undefined) {
    const ctx = this.map;
    if (!ctx || !me) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const scale = Math.min((w - 15) / (LIMIT_X*2), (h - 14) / (LIMIT_Z*2));
    const x = (v: number) => w / 2 + v * scale;
    const z = (v: number) => h / 2 + v * scale;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#c9dff75e"; ctx.strokeRect(x(-LIMIT_X), z(-LIMIT_Z), LIMIT_X * scale * 2, LIMIT_Z * scale * 2);
    ctx.fillStyle = "#9dabc274";
    for (const c of COVER) ctx.fillRect(x(c.x - c.w/2), z(c.z - c.d/2), c.w * scale, c.d * scale);
    ctx.beginPath(); ctx.arc(x(0), z(0), 5.2 * scale, 0, Math.PI * 2);
    const point = this.view?.point;
    ctx.strokeStyle = point === "cyan" || point === "coral" ? TEAMS[point].css : "#f4c47c"; ctx.stroke();
    for (const p of this.view?.players ?? []) {
      if (p.id === me.id || p.team !== me.team || !p.online || p.respawnAt) continue;
      ctx.fillStyle = TEAMS[p.team].css; ctx.beginPath(); ctx.arc(x(p.x), z(p.z), 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save(); ctx.translate(x(this.local.x), z(this.local.z)); ctx.rotate(-this.control.yaw);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(-4.5, -4); ctx.lineTo(4.5, -4); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  private render = (now: number) => {
    this.raf = requestAnimationFrame(this.render);
    const dt = Math.min(.055, (now - this.previous) / 1000); this.previous = now;
    const state = this.view;
    const me = state?.players.find(p => p.id === state.self.id);
    const fighting = state?.phase === "playing" && Boolean(me);
    this.weapon.marker.visible = fighting && !me?.respawnAt;
    if (fighting) {
      if (!me?.respawnAt) this.local = advance(this.local, this.control, dt);
      const steps = me?.respawnAt ? 0 : Math.hypot(this.control.right, this.control.forward);
      this.sway += dt * (steps ? 13 : 3);
      const y = EYE_HEIGHT + Math.sin(this.sway) * steps * .045;
      this.camera.position.set(this.local.x, me?.respawnAt ? 2.8 : y, this.local.z);
      const dir = aim(this.control.yaw, this.control.pitch);
      this.camera.lookAt(this.local.x + dir.x, this.camera.position.y + dir.y, this.local.z + dir.z);
      this.recoil *= Math.exp(-dt * 17);
      this.weapon.marker.position.set(.34 + Math.cos(this.sway * .5) * steps * .012, -.30 + Math.sin(this.sway) * steps * .012, -.64 + this.recoil);
      if (this.control.fire) this.trigger();
      if (now - this.lastMap > 75) { this.mini(me); this.lastMap = now; }
    } else {
      const angle = .72 + Math.sin(now / 11000) * .17;
      this.camera.position.set(Math.cos(angle) * 26, 8.8 + Math.sin(now / 7300) * 1.5, Math.sin(angle) * 27);
      this.camera.lookAt(-4, 2.1, -3);
    }
    for (const f of this.foes.values()) {
      const pace = f.root.position.distanceTo(f.goal);
      f.root.position.lerp(f.goal, 1 - Math.exp(-dt * 12));
      const turn = Math.atan2(Math.sin(f.yaw - f.root.rotation.y), Math.cos(f.yaw - f.root.rotation.y));
      f.root.rotation.y += turn * (1 - Math.exp(-dt * 16));
      f.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(now / 85 + i * Math.PI) * Math.min(1, pace) * .38; });
    }
    this.beacon.material.color.setHex(state?.point === "cyan" ? TEAMS.cyan.hex : state?.point === "coral" ? TEAMS.coral.hex : 0xf3ce98);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]; const left = effect.expires - now;
      if (left <= 0) { this.removeEffect(effect); this.effects.splice(i, 1); }
      else effect.fades.opacity = Math.min(.86, left / 170);
    }
    this.graphics.render(this.scene, this.camera);
  };

  close() {
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    for (const effect of this.effects) this.removeEffect(effect);
    this.paint.dispose();
    disposeObject(this.scene);
    this.graphics.dispose();
    this.graphics.domElement.remove();
  }
}
