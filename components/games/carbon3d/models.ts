import * as THREE from "three";
import {
  CARBON_WEAPONS,
  CarbonBotArchetype,
  CarbonPickupKind,
  CarbonWeaponId,
} from "@/games/carbon3d/types";
import { createHexShieldMaterial } from "./shaders";
import { getCarbonPBRMaterials } from "./textures";

export interface StrikerRig {
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armR: THREE.Group;
  armL: THREE.Group;
  legL: THREE.Group;
  shinL: THREE.Group;
  legR: THREE.Group;
  shinR: THREE.Group;
  weaponAnchor: THREE.Group;
  weaponMeshes: Record<CarbonWeaponId, THREE.Group>;
  muzzleFlash: THREE.Mesh;
  thrusterConeL: THREE.Mesh;
  thrusterConeR: THREE.Mesh;
  gyroRing?: THREE.Mesh;
  shieldMesh: THREE.Mesh;
  shieldMat: THREE.ShaderMaterial;
  hudSprite: THREE.Sprite;
  hudCanvas: HTMLCanvasElement;
  hudTex: THREE.CanvasTexture;
  lastHudKey: string;
  activeWeapon: CarbonWeaponId;
  archetype: CarbonBotArchetype;
  recoil: number;
  shieldFlash: number;
  animPhase: number;
}

/** Builds each of the 4 iconic 3D sci-fi weapons with distinct silhouettes & glowing energy cores */
export function buildWeaponMesh(weaponId: CarbonWeaponId): THREE.Group {
  const mats = getCarbonPBRMaterials();
  const spec = CARBON_WEAPONS[weaponId];
  const g = new THREE.Group();

  const neonMat = new THREE.MeshStandardMaterial({
    color: spec.colorHex,
    emissive: spec.colorHex,
    emissiveIntensity: 1.8,
    roughness: 0.2,
    metalness: 0.3,
  });

  if (weaponId === "CARBINE") {
    // VX-4 Carbon Carbine: sleek bullpup receiver + twin barrels + holo-optic
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.62), mats.carbonFiber);
    body.position.set(0, 0, 0.14);
    g.add(body);

    const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.38), mats.titaniumLight);
    shroud.position.set(0, 0.02, 0.42);
    g.add(shroud);

    const barrelTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.36, 10),
      mats.titaniumDark
    );
    barrelTop.rotation.x = Math.PI / 2;
    barrelTop.position.set(0, 0.035, 0.56);
    g.add(barrelTop);

    const energyStrip = new THREE.Mesh(new THREE.BoxGeometry(0.116, 0.024, 0.42), neonMat);
    energyStrip.position.set(0, 0.03, 0.28);
    g.add(energyStrip);

    const optic = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.055, 0.14), mats.titaniumLight);
    optic.position.set(0, 0.11, 0.16);
    g.add(optic);

    const opticLens = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 0.02), neonMat);
    opticLens.position.set(0, 0.11, 0.23);
    g.add(opticLens);
  } else if (weaponId === "SHOTGUN") {
    // KR-8 Breacher: wide heavy dual-bore scattergun with glowing heat vents
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.18, 0.56), mats.titaniumDark);
    receiver.position.set(0, 0, 0.14);
    g.add(receiver);

    for (const ox of [-0.036, 0.036]) {
      const bore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.034, 0.52, 12),
        mats.titaniumLight
      );
      bore.rotation.x = Math.PI / 2;
      bore.position.set(ox, 0.03, 0.42);
      g.add(bore);
    }

    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.26), mats.carbonFiber);
    pump.position.set(0, -0.04, 0.38);
    g.add(pump);

    for (let v = 0; v < 3; v++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.158, 0.022, 0.045), neonMat);
      vent.position.set(0, 0.03, 0.24 + v * 0.1);
      g.add(vent);
    }
  } else if (weaponId === "RAILGUN") {
    // XR-1 Ion Railgun: long split twin-rail electromagnetic lance with glowing accelerator core
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.17, 0.54), mats.carbonFiber);
    chassis.position.set(0, 0, 0.1);
    g.add(chassis);

    for (const oy of [0.048, -0.022]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.032, 0.78), mats.titaniumLight);
      rail.position.set(0, oy, 0.56);
      g.add(rail);
    }

    const coreBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.74, 10),
      neonMat
    );
    coreBeam.rotation.x = Math.PI / 2;
    coreBeam.position.set(0, 0.013, 0.54);
    g.add(coreBeam);

    const scope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.036, 0.28, 12),
      mats.titaniumDark
    );
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.13, 0.18);
    g.add(scope);
  } else {
    // GL-6 Pulse Lobber: rotary plasma drum launcher + wide mortar muzzle
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.48), mats.carbonFiber);
    frame.position.set(0, 0, 0.12);
    g.add(frame);

    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 0.2, 14),
      mats.titaniumLight
    );
    drum.rotation.x = Math.PI / 2;
    drum.position.set(0, -0.01, 0.22);
    g.add(drum);

    const drumRing = new THREE.Mesh(new THREE.TorusGeometry(0.106, 0.014, 8, 20), neonMat);
    drumRing.position.set(0, -0.01, 0.22);
    g.add(drumRing);

    const mortar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.048, 0.34, 14),
      mats.titaniumDark
    );
    mortar.rotation.x = Math.PI / 2;
    mortar.position.set(0, 0.02, 0.46);
    g.add(mortar);
  }

  g.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
    }
  });

  return g;
}

/** Builds a floating rotating 3D pickup visual for arena weapon/shield/overdrive pads */
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
      color: 0x22d3ee,
      emissive: 0x0891b2,
      emissiveIntensity: 1.5,
      roughness: 0.15,
      metalness: 0.4,
    });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), mat);
    g.add(crystal);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.028, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9 })
    );
    halo.rotation.x = Math.PI / 3;
    g.add(halo);
  } else {
    // OVERDRIVE_AMP
    const mat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.9,
      roughness: 0.15,
      metalness: 0.65,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), mat);
    g.add(core);
    for (const rx of [Math.PI / 4, -Math.PI / 4]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.58, 0.03, 8, 28),
        new THREE.MeshBasicMaterial({ color: 0xfde047 })
      );
      ring.rotation.x = rx;
      g.add(ring);
    }
  }
  return g;
}

/** Creates an articulated 14-part 3D Cyber-Striker, Hovering Recon Drone, or Giant Goliath Mech */
export function createStrikerRig(
  accentHex: number,
  archetype: CarbonBotArchetype = "STRIKER",
  initialWeapon: CarbonWeaponId = "CARBINE"
): StrikerRig {
  const mats = getCarbonPBRMaterials();
  const root = new THREE.Group();

  const neonMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.9,
    roughness: 0.18,
    metalness: 0.3,
  });

  const trimArmorMat = mats.titaniumLight.clone();
  trimArmorMat.color = new THREE.Color(accentHex).lerp(new THREE.Color(0xdbeafe), 0.62);

  const pelvis = new THREE.Group();
  const torso = new THREE.Group();
  const head = new THREE.Group();
  const armR = new THREE.Group();
  const armL = new THREE.Group();
  const legL = new THREE.Group();
  const shinL = new THREE.Group();
  const legR = new THREE.Group();
  const shinR = new THREE.Group();
  const weaponAnchor = new THREE.Group();

  let gyroRing: THREE.Mesh | undefined;

  // Thruster flames
  const flameGeo = new THREE.ConeGeometry(0.085, 0.42, 8);
  flameGeo.rotateX(Math.PI);
  const flameMat = new THREE.MeshBasicMaterial({
    color: accentHex,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const thrusterConeL = new THREE.Mesh(flameGeo, flameMat);
  const thrusterConeR = new THREE.Mesh(flameGeo, flameMat);

  if (archetype === "DRONE") {
    // Agile Hovering Sci-Fi Recon Drone
    pelvis.position.set(0, 0.95, 0);
    root.add(pelvis);
    pelvis.add(torso);

    const coreSphere = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14), mats.carbonFiber);
    torso.add(coreSphere);

    const eyeLens = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), neonMat);
    eyeLens.position.set(0, 0.02, 0.28);
    torso.add(eyeLens);

    gyroRing = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.055, 10, 28), trimArmorMat);
    gyroRing.rotation.x = Math.PI / 2;
    torso.add(gyroRing);

    const finL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.26), mats.titaniumDark);
    finL.position.set(-0.42, 0.12, -0.1);
    torso.add(finL);
    const finR = finL.clone();
    finR.position.x = 0.42;
    torso.add(finR);

    weaponAnchor.position.set(0, -0.22, 0.05);
    torso.add(weaponAnchor);

    thrusterConeL.position.set(0, -0.35, 0);
    thrusterConeR.visible = false;
    torso.add(thrusterConeL);
  } else {
    // Articulated Humanoid Cyber-Striker (or scaled-up Heavy Goliath Boss Mech!)
    pelvis.position.set(0, 0.92, 0);
    root.add(pelvis);

    const hipBlock = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.28), mats.carbonFiber);
    pelvis.add(hipBlock);

    const beltGlow = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.035, 0.3), neonMat);
    beltGlow.position.y = 0.07;
    pelvis.add(beltGlow);

    // Torso & Sculpted Chest Armor
    torso.position.set(0, 0.1, 0);
    pelvis.add(torso);

    const abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.18, 0.28, 8), mats.carbonFiber);
    abdomen.position.y = 0.14;
    torso.add(abdomen);

    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.36, 0.34), trimArmorMat);
    chestPlate.position.set(0, 0.38, 0.02);
    torso.add(chestPlate);

    // Glowing Arc-Reactor Core on chest
    const reactor = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 6), neonMat);
    reactor.rotation.x = Math.PI / 2;
    reactor.position.set(0, 0.39, 0.185);
    torso.add(reactor);

    // Twin Jetpack Pods on Back
    const packCenter = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.16), mats.titaniumDark);
    packCenter.position.set(0, 0.38, -0.22);
    torso.add(packCenter);

    for (const [idx, sx] of [-0.16, 0.16].entries()) {
      const pod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068, 0.085, 0.32, 10),
        mats.titaniumLight
      );
      pod.position.set(sx, 0.34, -0.27);
      pod.rotation.x = 0.18;
      torso.add(pod);

      const cone = idx === 0 ? thrusterConeL : thrusterConeR;
      cone.position.set(sx, 0.05, -0.31);
      cone.rotation.x = 0.18;
      torso.add(cone);
    }

    // Extra Shoulder Missile Pods for BOSS_MECH or ENFORCER
    if (archetype === "BOSS_MECH") {
      for (const sx of [-0.36, 0.36]) {
        const missilePod = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.24, 0.28),
          mats.titaniumDark
        );
        missilePod.position.set(sx, 0.68, -0.08);
        torso.add(missilePod);
        const podGlow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.03), neonMat);
        podGlow.position.set(sx, 0.68, 0.07);
        torso.add(podGlow);
      }
    }

    // Angular Cyber-Helmet + Panoramic Glowing Visor
    head.position.set(0, 0.64, 0.02);
    torso.add(head);

    const helmetShell = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.3, 0.34), mats.carbonFiber);
    helmetShell.position.y = 0.12;
    head.add(helmetShell);

    const helmetCrest = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.36), trimArmorMat);
    helmetCrest.position.set(0, 0.28, -0.01);
    head.add(helmetCrest);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.11, 0.08), neonMat);
    visor.position.set(0, 0.14, 0.155);
    head.add(visor);

    for (const sx of [-0.17, 0.17]) {
      const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.06), trimArmorMat);
      antenna.position.set(sx, 0.22, -0.06);
      antenna.rotation.x = -0.25;
      head.add(antenna);
    }

    // Right Weapon Arm + Pauldron
    armR.position.set(-0.34, 0.5, 0.02);
    torso.add(armR);
    const pauldronR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.24), trimArmorMat);
    pauldronR.position.set(-0.03, 0.02, 0);
    armR.add(pauldronR);
    const upperArmR = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.06, 0.32, 8),
      mats.carbonFiber
    );
    upperArmR.position.set(0, -0.16, 0.08);
    upperArmR.rotation.x = -0.9;
    armR.add(upperArmR);

    weaponAnchor.position.set(0.08, -0.14, 0.22);
    armR.add(weaponAnchor);

    // Left Support Arm + Pauldron
    armL.position.set(0.34, 0.5, 0.02);
    torso.add(armL);
    const pauldronL = pauldronR.clone();
    pauldronL.position.set(0.03, 0.02, 0);
    armL.add(pauldronL);
    const upperArmL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.06, 0.38, 8),
      mats.carbonFiber
    );
    upperArmL.position.set(-0.08, -0.14, 0.18);
    upperArmL.rotation.x = -1.15;
    upperArmL.rotation.z = 0.38;
    armL.add(upperArmL);

    // Articulated Legs (Thigh -> Knee/Shin -> Armored Boot)
    const buildLeg = (legGroup: THREE.Group, shinGroup: THREE.Group, sideX: number) => {
      legGroup.position.set(sideX, -0.06, 0);
      pelvis.add(legGroup);

      const thigh = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.42, 0.18),
        mats.carbonFiber
      );
      thigh.position.y = -0.2;
      legGroup.add(thigh);

      const kneePlate = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.11, 0.08), trimArmorMat);
      kneePlate.position.set(0, -0.4, 0.08);
      legGroup.add(kneePlate);

      shinGroup.position.set(0, -0.42, 0);
      legGroup.add(shinGroup);

      const shin = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.38, 0.16),
        mats.titaniumDark
      );
      shin.position.y = -0.19;
      shinGroup.add(shin);

      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.28), trimArmorMat);
      boot.position.set(0, -0.39, 0.05);
      shinGroup.add(boot);

      const heelGlow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), neonMat);
      heelGlow.position.set(0, -0.38, -0.09);
      shinGroup.add(heelGlow);
    };

    buildLeg(legL, shinL, 0.135);
    buildLeg(legR, shinR, -0.135);
  }

  // Pre-build all 4 weapon meshes on the anchor so weapon swaps are instant zero-GC toggles!
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

  // Additive Muzzle Flash Star
  const muzzleGeo = new THREE.ConeGeometry(0.14, 0.45, 6);
  muzzleGeo.rotateX(Math.PI / 2);
  const muzzleMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const muzzleFlash = new THREE.Mesh(muzzleGeo, muzzleMat);
  muzzleFlash.position.set(0, 0.03, 0.88);
  weaponAnchor.add(muzzleFlash);

  // Hex-Fresnel Energy Shield Bubble
  const shieldMat = createHexShieldMaterial(accentHex);
  const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(0.95, 22, 18), shieldMat);
  shieldMesh.scale.set(0.85, 1.15, 0.85);
  shieldMesh.position.set(0, 1.05, 0);
  root.add(shieldMesh);

  // Overhead Crisp Nameplate + Shield/HP Bar Sprite
  const hudCanvas = document.createElement("canvas");
  hudCanvas.width = 256;
  hudCanvas.height = 72;
  const hudTex = new THREE.CanvasTexture(hudCanvas);
  hudTex.colorSpace = THREE.SRGBColorSpace;
  const spriteMat = new THREE.SpriteMaterial({
    map: hudTex,
    transparent: true,
    depthTest: false,
  });
  const hudSprite = new THREE.Sprite(spriteMat);
  hudSprite.scale.set(2.15, 0.6, 1);
  hudSprite.position.set(0, archetype === "DRONE" ? 1.85 : 2.35, 0);
  hudSprite.renderOrder = 10;
  root.add(hudSprite);

  if (archetype === "BOSS_MECH") {
    root.scale.setScalar(1.58);
  } else if (archetype === "ENFORCER") {
    root.scale.set(1.16, 1.12, 1.16);
  }

  root.traverse((child) => {
    const m = child as THREE.Mesh;
    if (m.isMesh && m !== shieldMesh && m !== muzzleFlash && m !== thrusterConeL && m !== thrusterConeR) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  return {
    root,
    pelvis,
    torso,
    head,
    armR,
    armL,
    legL,
    shinL,
    legR,
    shinR,
    weaponAnchor,
    weaponMeshes,
    muzzleFlash,
    thrusterConeL,
    thrusterConeR,
    gyroRing,
    shieldMesh,
    shieldMat,
    hudSprite,
    hudCanvas,
    hudTex,
    lastHudKey: "",
    activeWeapon: initialWeapon,
    archetype,
    recoil: 0,
    shieldFlash: 0,
    animPhase: Math.random() * 10,
  };
}

/** Redraws overhead nameplate + shield/HP bars ONLY when values change */
export function syncStrikerHudPlate(
  rig: StrikerRig,
  nickname: string,
  hp: number,
  maxHp: number,
  shield: number,
  maxShield: number,
  accentHex: number,
  overdrive: boolean
) {
  const hpQ = Math.max(0, Math.round((hp / Math.max(1, maxHp)) * 25));
  const shQ = Math.max(0, Math.round((shield / Math.max(1, maxShield)) * 25));
  const key = `${nickname}|${hpQ}|${shQ}|${overdrive ? 1 : 0}`;
  if (key === rig.lastHudKey) return;
  rig.lastHudKey = key;

  const ctx = rig.hudCanvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, 256, 72);

  // Dark pill backdrop
  ctx.fillStyle = "rgba(8, 13, 26, 0.82)";
  ctx.beginPath();
  ctx.roundRect(18, 6, 220, 58, 12);
  ctx.fill();

  const hexCss = `#${accentHex.toString(16).padStart(6, "0")}`;
  ctx.strokeStyle = overdrive ? "#fbbf24" : hexCss;
  ctx.lineWidth = overdrive ? 3 : 2;
  ctx.stroke();

  // Nickname
  ctx.font = "bold 19px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = overdrive ? "#fde047" : "#f8fafc";
  const label = nickname.length > 16 ? nickname.slice(0, 15) + "…" : nickname;
  ctx.fillText(overdrive ? `⚡ ${label}` : label, 128, 28);

  // Shield bar (Cyan)
  ctx.fillStyle = "rgba(30, 41, 59, 0.95)";
  ctx.fillRect(32, 36, 192, 8);
  if (shQ > 0) {
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(32, 36, (192 * shQ) / 25, 8);
  }

  // Health bar (Emerald -> Amber -> Crimson)
  ctx.fillStyle = "rgba(30, 41, 59, 0.95)";
  ctx.fillRect(32, 48, 192, 10);
  const hpRatio = hpQ / 25;
  ctx.fillStyle = hpRatio > 0.5 ? "#10b981" : hpRatio > 0.25 ? "#f59e0b" : "#f43f5e";
  ctx.fillRect(32, 48, 192 * hpRatio, 10);

  rig.hudTex.needsUpdate = true;
}

/** Animates joints, weapon recoil, jetpack flames, drone gyro-rings, and hex energy shield @ 60 FPS */
export function updateStrikerRig(
  rig: StrikerRig,
  dt: number,
  elapsedSec: number,
  speedXZ: number,
  aimPitch: number,
  weapon: CarbonWeaponId,
  isDashing: boolean,
  isAirborne: boolean,
  hasShield: boolean,
  overdrive: boolean
) {
  // Toggle active 3D weapon mesh if changed
  if (rig.activeWeapon !== weapon) {
    rig.weaponMeshes[rig.activeWeapon].visible = false;
    rig.weaponMeshes[weapon].visible = true;
    rig.activeWeapon = weapon;
  }

  // Decay recoil & muzzle flash
  rig.recoil = Math.max(0, rig.recoil - dt * 6.5);
  rig.shieldFlash = Math.max(0, rig.shieldFlash - dt * 3.2);

  const flashMat = rig.muzzleFlash.material as THREE.MeshBasicMaterial;
  if (flashMat.opacity > 0) {
    flashMat.opacity = Math.max(0, flashMat.opacity - dt * 16);
    rig.muzzleFlash.rotation.z += dt * 25;
  }

  // Hex shield shader pulse (subtle rim when overdrive/shielded, bright flare on hit!)
  rig.shieldMat.uniforms.uTime.value = elapsedSec;
  const baseShieldVis = overdrive ? 0.34 : hasShield ? 0.11 : 0.0;
  rig.shieldMat.uniforms.uOpacity.value = Math.min(0.92, baseShieldVis + rig.shieldFlash * 0.78);

  if (rig.archetype === "DRONE") {
    rig.animPhase += dt * (4.0 + speedXZ * 0.5);
    rig.pelvis.position.y = 0.95 + Math.sin(rig.animPhase) * 0.12;
    rig.torso.rotation.x = -aimPitch * 0.75 + Math.min(0.35, speedXZ * 0.04);
    if (rig.gyroRing) {
      rig.gyroRing.rotation.z += dt * 5.5;
    }
    rig.weaponAnchor.position.z = 0.05 - rig.recoil * 0.14;
    rig.thrusterConeL.scale.setScalar(0.8 + Math.sin(elapsedSec * 28) * 0.2);
    return;
  }

  // Humanoid Striker / Boss Mech procedural locomotion
  const clampedPitch = Math.max(-0.65, Math.min(0.65, aimPitch));
  rig.torso.rotation.x = -clampedPitch * 0.45 + (isDashing ? 0.28 : 0);
  rig.head.rotation.x = -clampedPitch * 0.45;
  rig.armR.rotation.x = -clampedPitch * 0.55 - rig.recoil * 0.26;
  rig.weaponAnchor.position.z = 0.22 - rig.recoil * 0.12;

  if (isAirborne || isDashing) {
    // Dynamic airborne / jet-dash pose
    rig.legL.rotation.x = 0.42;
    rig.shinL.rotation.x = 0.55;
    rig.legR.rotation.x = -0.28;
    rig.shinR.rotation.x = 0.45;
    rig.pelvis.position.y = 0.92;
  } else if (speedXZ > 0.35) {
    rig.animPhase += dt * (6.5 + speedXZ * 0.95);
    const swing = Math.sin(rig.animPhase) * Math.min(0.72, speedXZ * 0.1);
    rig.legL.rotation.x = swing;
    rig.legR.rotation.x = -swing;
    rig.shinL.rotation.x = Math.max(0, -swing * 0.85);
    rig.shinR.rotation.x = Math.max(0, swing * 0.85);
    rig.pelvis.position.y = 0.92 + Math.abs(Math.cos(rig.animPhase)) * 0.055;
  } else {
    // Crisp tactical idle breathe
    const idle = Math.sin(elapsedSec * 2.4 + rig.animPhase);
    rig.legL.rotation.x *= 0.82;
    rig.legR.rotation.x *= 0.82;
    rig.shinL.rotation.x *= 0.82;
    rig.shinR.rotation.x *= 0.82;
    rig.pelvis.position.y = 0.92 + idle * 0.018;
  }

  // Jetpack thruster cones flare when dashing, jumping, or sprinting fast!
  const thrustScale = isDashing
    ? 1.55 + Math.sin(elapsedSec * 45) * 0.25
    : isAirborne
    ? 1.2 + Math.sin(elapsedSec * 36) * 0.2
    : speedXZ > 4.5
    ? 0.55 + Math.sin(elapsedSec * 30) * 0.12
    : 0.01;
  const showFlame = thrustScale > 0.15;
  rig.thrusterConeL.visible = showFlame;
  rig.thrusterConeR.visible = showFlame;
  if (showFlame) {
    rig.thrusterConeL.scale.set(1, thrustScale, 1);
    rig.thrusterConeR.scale.set(1, thrustScale, 1);
  }
}
