import * as THREE from "three";

interface Particle {
  mesh: THREE.Mesh | THREE.Sprite;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  bounce: boolean;
  grow: number;
  baseScale: number;
  fade: boolean;
}

const MAX_PARTICLES = 260;

/**
 * Lightweight particle effects (no textures, no extra downloads).
 * Every effect is a short burst of small meshes that fly, fall and fade.
 */
export class GhammadaEffects {
  private scene: THREE.Scene;
  private particles: Particle[] = [];
  private sphereGeo = new THREE.SphereGeometry(0.12, 8, 6);
  private boxGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
  private starGeo = new THREE.OctahedronGeometry(0.11, 0);
  private ringGeo = new THREE.RingGeometry(0.6, 0.8, 36);
  private noteTexture: THREE.Texture | null = null;
  shake = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private add(p: Omit<Particle, "life"> & { life?: number }) {
    if (this.particles.length >= MAX_PARTICLES) {
      const old = this.particles.shift();
      if (old) this.disposeParticle(old);
    }
    this.scene.add(p.mesh);
    this.particles.push({ ...p, life: p.life ?? p.maxLife });
  }

  private mat(color: number, opacity = 1, emissive = 0) {
    return new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      roughness: 0.8,
      emissive,
      emissiveIntensity: emissive ? 0.8 : 0,
      depthWrite: false,
    });
  }

  /** Hammer hits the ground */
  dust(x: number, z: number) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 2.2;
      const mesh = new THREE.Mesh(this.sphereGeo, this.mat(0xd6b98c, 0.85));
      mesh.position.set(x, 0.15, z);
      this.add({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * s, 1 + Math.random() * 1.6, Math.sin(a) * s),
        spin: new THREE.Vector3(),
        maxLife: 0.55 + Math.random() * 0.25,
        gravity: 4,
        bounce: false,
        grow: 2.2,
        baseScale: 0.8 + Math.random() * 0.6,
        fade: true,
      });
    }
    this.ring(x, z, 0xf5d0a0);
  }

  /** A hider got caught: big poof + yellow stars */
  poof(x: number, z: number, y = 0.6) {
    for (let i = 0; i < 22; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize();
      const mesh = new THREE.Mesh(this.sphereGeo, this.mat(0xffffff, 0.95));
      mesh.position.set(x, y, z);
      this.add({
        mesh,
        vel: dir.multiplyScalar(2.5 + Math.random() * 2.5),
        spin: new THREE.Vector3(),
        maxLife: 0.7 + Math.random() * 0.3,
        gravity: -0.5,
        bounce: false,
        grow: 3,
        baseScale: 1.2 + Math.random(),
        fade: true,
      });
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const mesh = new THREE.Mesh(this.starGeo, this.mat(0xfacc15, 1, 0xf59e0b));
      mesh.position.set(x, y + 0.4, z);
      this.add({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * 3, 4 + Math.random() * 2, Math.sin(a) * 3),
        spin: new THREE.Vector3(6, 8, 4),
        maxLife: 1.1,
        gravity: 9,
        bounce: true,
        grow: 0,
        baseScale: 1.4,
        fade: true,
      });
    }
    this.ring(x, z, 0xffffff);
    this.shake = Math.max(this.shake, 0.35);
  }

  /** A fake prop got smashed into pieces */
  shatter(x: number, z: number, color = 0xb4532a) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 2.5;
      const mesh = new THREE.Mesh(this.boxGeo, this.mat(i % 3 === 0 ? 0x8b5a2b : color, 1));
      mesh.position.set(x, 0.5 + Math.random() * 0.4, z);
      this.add({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * s, 3 + Math.random() * 3, Math.sin(a) * s),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        maxLife: 1.4,
        gravity: 12,
        bounce: true,
        grow: 0,
        baseScale: 0.6 + Math.random() * 0.9,
        fade: true,
      });
    }
    this.shake = Math.max(this.shake, 0.25);
  }

  /** Smoke trail when a hider dashes */
  smoke(x: number, z: number) {
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(this.sphereGeo, this.mat(0x9ca3af, 0.7));
      mesh.position.set(x + (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.6);
      this.add({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.8 + Math.random(), (Math.random() - 0.5) * 0.6),
        spin: new THREE.Vector3(),
        maxLife: 0.9,
        gravity: -0.3,
        bounce: false,
        grow: 2.5,
        baseScale: 1.4,
        fade: true,
      });
    }
  }

  /** Music notes floating up when a hider whistles */
  notes(x: number, z: number) {
    const tex = this.getNoteTexture();
    for (let i = 0; i < 4; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xfde047 })
      );
      sprite.position.set(x + (Math.random() - 0.5) * 0.6, 1.2 + i * 0.25, z + (Math.random() - 0.5) * 0.6);
      this.add({
        mesh: sprite,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.1 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8),
        spin: new THREE.Vector3(),
        maxLife: 1.6 + i * 0.15,
        gravity: -0.2,
        bounce: false,
        grow: 0.3,
        baseScale: 0.55,
        fade: true,
      });
    }
  }

  private ring(x: number, z: number, color: number) {
    const mesh = new THREE.Mesh(
      this.ringGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.06, z);
    this.add({
      mesh,
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      maxLife: 0.45,
      gravity: 0,
      bounce: false,
      grow: 5,
      baseScale: 0.5,
      fade: true,
    });
  }

  private getNoteTexture(): THREE.Texture {
    if (this.noteTexture) return this.noteTexture;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 52px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♪", 32, 34);
    this.noteTexture = new THREE.CanvasTexture(c);
    return this.noteTexture;
  }

  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 1.6);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.disposeParticle(p);
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.bounce && p.mesh.position.y < 0.07) {
        p.mesh.position.y = 0.07;
        p.vel.y = Math.abs(p.vel.y) * 0.35;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      const t = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(p.baseScale * (1 + p.grow * t));
      if (p.fade) {
        const m = p.mesh.material as THREE.Material & { opacity: number };
        m.opacity = Math.min(1, (1 - t) * 1.4);
      }
    }
  }

  private disposeParticle(p: Particle) {
    this.scene.remove(p.mesh);
    (p.mesh.material as THREE.Material).dispose();
  }

  dispose() {
    for (const p of this.particles) this.disposeParticle(p);
    this.particles = [];
    this.sphereGeo.dispose();
    this.boxGeo.dispose();
    this.starGeo.dispose();
    this.ringGeo.dispose();
    this.noteTexture?.dispose();
  }
}
