import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// A single vertex-coloured mesh per street building. Pieces are assembled in local
// space once, so hundreds of cornice, mosaic and costume details cost few draw calls.
type Triple = [number, number, number];
const box = new THREE.BoxGeometry();
const ball = new THREE.SphereGeometry(0.5, 12, 8);
const post = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const urn = new THREE.CylinderGeometry(0.36, 0.5, 1, 12);
const robe = new THREE.CylinderGeometry(0.35, 0.5, 1, 12);
const taper = new THREE.ConeGeometry(0.5, 1, 8);
const roof = new THREE.ConeGeometry(0.5, 1, 4);
const archOutline = new THREE.Shape();
archOutline.moveTo(-0.40, 0);
archOutline.lineTo(-0.40, 0.49);
archOutline.bezierCurveTo(-0.64, 0.72, -0.27, 0.93, 0, 1);
archOutline.bezierCurveTo(0.27, 0.93, 0.64, 0.72, 0.40, 0.49);
archOutline.lineTo(0.40, 0);
archOutline.closePath();
const arch = new THREE.ShapeGeometry(archOutline, 6);
const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.83 });
const ink = "#27373c", cedar = "#674435", brass = "#e5ad55", ivory = "#ffebc3";
const teal = "#117b76", sea = "#26718c", berry = "#a4424b";
const noTurn: Triple = [0, 0, 0];

class PaintedModel {
  private pieces: THREE.BufferGeometry[] = [];

  part(shape: THREE.BufferGeometry, color: string, at: Triple, size: Triple, turn: Triple = noTurn) {
    const g = shape.index ? shape.toNonIndexed() : shape.clone();
    g.deleteAttribute("uv");
    g.scale(...size);
    g.rotateX(turn[0]);
    g.rotateY(turn[1]);
    g.rotateZ(turn[2]);
    g.translate(...at);
    const rgb = new THREE.Color(color);
    const values = new Float32Array(g.getAttribute("position").count * 3);
    for (let i = 0; i < values.length; i += 3) rgb.toArray(values, i);
    g.setAttribute("color", new THREE.BufferAttribute(values, 3));
    this.pieces.push(g);
  }

  slab(color: string, at: Triple, size: Triple, turn?: Triple) {
    this.part(box, color, at, size, turn);
  }

  oval(color: string, at: Triple, size: Triple) {
    this.part(ball, color, at, size);
  }

  finish() {
    const result = mergeGeometries(this.pieces)!;
    this.pieces.forEach(piece => piece.dispose());
    result.computeBoundingSphere();
    return result;
  }
}

function mesh(geometry: THREE.BufferGeometry) {
  const m = new THREE.Mesh(geometry, paint);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function doorway(m: PaintedModel, x: number, y: number, z: number, w: number, h: number, wood: string) {
  m.part(arch, ivory, [x, y, z], [w, h, 1]);
  m.part(arch, wood, [x, y, z + .004], [w * .80, h * .89, 1]);
  m.slab(brass, [x, y + h * .31, z + .008], [.012, h * .58, .008]);
  m.oval(brass, [x + w * .14, y + h * .35, z + .014], [.05, .05, .022]);
}

function tiles(m: PaintedModel, center: number, y: number, z: number, count: number, step: number, accent: string) {
  m.slab(ivory, [center, y, z], [count * step, step * .7, .026]);
  for (let i = 0; i < count; i++) {
    m.slab(i % 2 ? accent : sea, [center + (i - (count - 1) / 2) * step, y, z + .016],
      [step * .46, step * .46, .01], [0, 0, Math.PI / 4]);
  }
}

function awning(m: PaintedModel, x: number, y: number, z: number, w: number, color: string) {
  const count = 9;
  for (let j = 0; j < count; j++) {
    const stripe = j % 2 ? ivory : color;
    const xp = x + (j - 4) * w / count;
    m.slab(stripe, [xp, y, z], [w / count + .001, .045, .295], [0.23, 0, 0]);
    m.oval(stripe, [xp, y - .075, z + .135], [w / count, .115, .04]);
  }
}

function lantern(m: PaintedModel, x: number, y: number, z: number) {
  m.part(taper, cedar, [x,y+.10,z], [.14,.10,.14]);
  m.part(post, "#ffcb68", [x,y,z], [.112,.14,.112]);
  m.part(urn, brass, [x,y-.09,z], [.096,.065,.096]);
}

function palm(m: PaintedModel, x: number, y: number, z: number, k: number) {
  m.part(robe, cedar, [x,y+k*.43,z], [k*.11,k*.86,k*.11]);
  for (let i = 0; i < 7; i++) {
    const a = i * 2 * Math.PI / 7;
    m.part(ball, i % 2 ? "#397762" : "#6e9965",
      [x+Math.sin(a)*.185*k,y+.86*k,z+Math.cos(a)*.185*k],
      [.14*k,.09*k,.53*k], [.22,a,0]);
  }
}

const shops = new Map<number, THREE.BufferGeometry>();
const walls = ["#e3aa76","#de966d","#83c1c8","#c68169","#e6c8a0","#a2c5b5","#cd8463","#f3d3a3"];
const doors = [teal,berry,"#245a93","#53626c","#417563","#226c7e","#833b41",teal];

function buildShop(i: number) {
  const m = new PaintedModel();
  const wall = walls[i], door = doors[i];
  const height = [1.02,1.13,1.30,1.20,1.32,1.42,1.51,1.55][i];
  const facade = .315;
  m.slab("#bd9b77", [0,.047,0], [1.56,.094,1.13]);
  m.slab("#ead2ad", [0,.105,.075], [1.48,.055,.99]);
  m.slab(wall,[0,(height+.12)/2,-.095],[1.40,height-.12,.82]);
  m.slab(door,[0,.21,facade+.001],[1.39,.16,.024]);
  m.slab("#edcea3",[0,height-.06,-.096],[1.46,.062,.87]);
  m.slab(ivory,[0,height,-.095],[1.50,.060,.92]);
  m.slab("#bf8464",[0,height+.05,-.096],[1.44,.065,.85]);
  for (const x of [-.66,.66]) m.slab("#f5d8b1",[x,(height+.13)/2,facade+.006],[.055,height-.13,.045]);
  if (i < 3) {
    doorway(m,-.39,.134,facade+.03,.47,.72,door);
    m.slab(cedar,[.22,.47,facade+.024],[.59,.54,.04]);
    m.slab(ink,[.22,.52,facade+.048],[.49,.38,.03]);
    m.slab("#bc8557",[.22,.34,.43],[.70,.085,.245]);
    awning(m,.20,.80,.423,.83,door);
    // Street counter: citrus, tea glasses, or ceramic blue bowls.
    for (let n=0;n<4;n++) {
      const x = .005+n*.133;
      if (i===1) {
        m.part(post,ivory,[x,.414,.473],[.067,.10,.067]);
        m.part(post,cedar,[x,.465,.473],[.052,.004,.052]);
      } else {
        m.oval(i===0 ? "#ed9f34" : sea,[x,.398,.473],[.115,.10,.11]);
      }
    }
    if (i===2) {
      for (const x of [-.40,.26]) doorway(m,x,1.01,facade+.028,.25,.22,"#26679b");
    }
  } else {
    doorway(m,0,.132,facade+.025,.62,i===7 ? 1.14 : .92,door);
    for (const x of [-.45,.45]) {
      doorway(m,x,height*.51,facade+.028,.25,height*.27,ink);
      m.slab(cedar,[x,height*.51+.015,.363],[.32,.046,.114]);
      lantern(m,x,.43,.407);
    }
    tiles(m,0,height-.165,facade+.032,11,.103,door);
    if (i===4 || i===6) {
      m.slab(wall,[.24,height+.20,-.14],[.65,.32,.53]);
      m.slab(ivory,[.24,height+.37,-.14],[.73,.075,.60]);
      doorway(m,.24,height+.045,.134,.24,.25,door);
    } else if (i===7) {
      m.part(roof,teal,[0,height+.23,-.10],[1.33,.36,.95],[0,Math.PI/4,0]);
      m.part(post,brass,[0,height+.455,-.10],[.045,.15,.045]);
      m.oval(brass,[0,height+.517,-.10],[.077,.075,.077]);
    } else {
      m.slab(cedar,[-.38,height+.12,-.21],[.43,.15,.32]);
      m.slab(door,[-.38,height+.22,-.21],[.49,.065,.39]);
    }
  }
  // Rooftop parapets and a chipped band of zellige on the street-facing step.
  for (const x of [-.68,.68]) m.slab(wall,[x,height+.102,-.10],[.055,.10,.83]);
  tiles(m,0,.10,.553,14,.093,door);
  return m.finish();
}

/** Eight shop façades, ordered from everyday storefront to landmark riad. */
export function makeMoulShop(index: number): THREE.Group {
  const i = THREE.MathUtils.euclideanModulo(Math.floor(index),8);
  if (!shops.has(i)) shops.set(i,buildShop(i));
  return new THREE.Group().add(mesh(shops.get(i)!));
}

const costumes = ["#a64043","#21866f","#d4a467","#debc60","#378581","#527ba2","#b25143","#333956"];
const skins = ["#bc805c","#a66e52","#b78666","#965f44","#bc8357","#a26c4e","#b87956","#bc835e"];
const characters = new Map<number, [THREE.BufferGeometry, THREE.BufferGeometry]>();

function characterParts(i: number): [THREE.BufferGeometry,THREE.BufferGeometry] {
  const body = new PaintedModel(), arm = new PaintedModel();
  const coat = costumes[i], skin = skins[i];
  for (const x of [-.102,.102]) {
    body.oval(i===1 ? brass : "#403a35",[x,.070,.035],[.174,.13,.26]);
    body.part(post, i===7 ? "#333956" : "#4c5756",[x,.26,0],[.145,.32,.145]);
  }
  body.part(robe,coat,[0,i===1 ? .415 : .52,0],[i===1 ? .46 : .412,i===1 ? .58 : .42,.325]);
  body.part(post,skin,[0,.75,0],[.13,.12,.13]);
  body.oval(skin,[0,.887,.008],[.337,.345,.293]);
  body.oval("#44342f",[0,.991,-.026],[.334,.178,.283]);
  for (const x of [-.071,.071]) {
    body.oval(i===7 ? ink : "#282e30",[x,.914,.143],[i===7 ? .123 : .038,i===7 ? .064 : .042,.025]);
    body.slab("#483530",[x,.95,.138],[.072,.016,.020],[0,0,x>0 ? .10 : -.10]);
  }
  body.oval(skin,[0,.868,.155],[.074,.067,.079]);
  body.slab("#6f4538",[.009,.824,.137],[.077,.016,.013],[0,0,.1]);
  body.part(robe,coat,[-.207,.538,.020],[.144,.292,.157],[0,0,-.16]);
  body.oval(skin,[-.231,.413,.040],[.126,.131,.137]);
  // The right sleeve pivots at the shoulder; its local hand and prop follow.
  arm.part(robe,coat,[.021,-.093,.02],[.139,.225,.150],[-.20,0,.18]);
  arm.oval(skin,[.051,-.177,.099],[.128,.128,.137]);
  if (i===0) {
    body.oval(berry,[0,1.039,0],[.36,.146,.325]);
    body.slab(ink,[0,1.018,.127],[.32,.031,.162]);
    body.slab(ivory,[0,.577,.156],[.12,.24,.026]);
    body.part(taper,ink,[0,.596,.178],[.06,.177,.032],[0,0,Math.PI]);
    arm.slab(ink,[.05,-.154,.164],[.19,.13,.085]);
    arm.slab("#8ed1aa",[.05,-.138,.211],[.144,.053,.01]);
  } else if (i===1) {
    body.oval("#523a33",[0,.997,-.037],[.383,.25,.314]);
    body.part(post,brass,[0,1.058,.005],[.335,.067,.307]);
    for (const x of [-.11,0,.11]) body.part(taper,brass,[x,1.124,.050],[.105,.156,.101]);
    for (const y of [.27,.32,.57]) body.part(post,brass,[0,y,0],[y>.5 ? .36 : .425,.023,.30]);
    body.slab(brass,[0,.445,.152],[.035,.43,.027]);
    body.oval("#e36e72",[0,.675,.14],[.076,.08,.035]);
    for (const x of [-.174,.174]) body.oval(brass,[x,.866,.009],[.053,.089,.058]);
    arm.part(ball,brass,[.06,-.11,.148],[.222,.17,.032]);
  } else if (i===2) {
    body.part(urn,berry,[0,1.075,0],[.252,.179,.23]);
    body.slab(ink,[.085,1.119,.066],[.027,.099,.026],[0,0,.58]);
    body.oval("#594339",[0,.848,.146],[.127,.03,.024]);
    arm.part(urn,ivory,[.05,-.102,.141],[.117,.143,.108]);
    arm.part(post,"#a56b30",[.05,-.028,.141],[.085,.008,.082]);
  } else if (i===3) {
    body.oval("#3a302a",[0,1.041,-.012],[.322,.155,.295]);
    body.part(post,teal,[0,.722,0],[.27,.077,.247]);
    for (let n=0;n<4;n++) body.slab(n%2 ? ivory : teal,[-.081,.653-.053*n,.153],[.072,.055,.032]);
    arm.part(post,ink,[.055,-.087,.134],[.048,.235,.05],[-.18,0,.05]);
    arm.oval("#515e62",[.055,.039,.11],[.109,.124,.105]);
  } else if (i===4) {
    body.part(urn,"#d5a963",[0,1.055,-.006],[.325,.147,.286]);
    body.part(post,"#e1bf81",[0,1.018,0],[.49,.032,.42]);
    body.slab(ivory,[0,.485,.148],[.222,.293,.035]);
    arm.slab(cedar,[.046,-.175,.135],[.252,.075,.159]);
    for(const x of [-.033,.059,.135]) arm.oval("#f6a235",[x,-.105,.14],[.10,.094,.095]);
  } else if (i===5) {
    body.oval("#577394",[0,1.032,.005],[.345,.139,.32]);
    body.slab("#486987",[0,1.004,.137],[.307,.033,.137]);
    body.slab("#314d68",[0,.512,.147],[.22,.309,.039]);
    for (const x of [-.088,.088]) body.slab(brass,[x,.665,.146],[.048,.034,.02]);
    arm.slab("#aebdbe",[.058,-.104,.15],[.043,.187,.031]);
    for(const x of [.022,.095]) arm.slab("#b8cbca",[x,.004,.15],[.033,.07,.033],[0,0,x<.05 ? .23 : -.23]);
  } else if (i===6) {
    body.part(urn,"#94503a",[0,1.057,0],[.261,.145,.244]);
    body.slab(ivory,[-.095,.663,.125],[.084,.135,.045],[0,0,-.44]);
    body.oval("#e6a664",[-.003,.449,.201],[.25,.29,.104]);
    body.oval(cedar,[-.003,.486,.257],[.068,.069,.009]);
    body.slab(cedar,[.106,.623,.202],[.065,.324,.053],[0,0,-.49]);
    body.oval(brass,[.186,.769,.2],[.085,.084,.057]);
  } else {
    body.slab(ink,[0,.912,.143],[.072,.017,.019]);
    for(const x of [-.082,.082]) body.slab(ivory,[x,.551,.148],[.033,.301,.021],[0,0,x<0 ? -.2 : .2]);
    body.oval("#43352c",[0,1.065,-.035],[.285,.104,.218]);
    arm.slab(cedar,[.065,-.258,.108],[.246,.148,.094]);
    arm.slab(brass,[.065,-.222,.158],[.055,.027,.019]);
  }
  return [body.finish(),arm.finish()];
}

/** Positive Z faces the viewer. The 'gesture' shoulder pivot can wave or receive rent. */
export function makeMoulCharacter(seat: number): THREE.Group {
  const i = THREE.MathUtils.euclideanModulo(Math.floor(seat),8);
  if (!characters.has(i)) characters.set(i,characterParts(i));
  const [body,arm] = characters.get(i)!;
  const gesture = new THREE.Group();
  gesture.name = "gesture";
  gesture.position.set(.184,.650,.015);
  gesture.add(mesh(arm));
  return new THREE.Group().add(mesh(body),gesture);
}

let square: THREE.BufferGeometry | undefined;

/** Central octagonal mosaic fountain and a pair of dwarf palms, within a 3 × 2.5 footprint. */
export function makeMoulScenery(): THREE.Group {
  if (!square) {
    const m = new PaintedModel();
    const oct = new THREE.CylinderGeometry(.5,.5,1,8);
    for (const [d,y,h,c] of [[2.22,.026,.052,"#bc9674"],[2.03,.070,.060,ivory],
      [1.85,.135,.115,teal],[1.72,.197,.049,ivory],[1.57,.217,.032,"#69b5b4"]] as const)
      m.part(oct,c,[0,y,0],[d,h,d],[0,Math.PI/8,0]);
    for(let n=0;n<24;n++) {
      const a=n*Math.PI/12;
      m.slab(n%2 ? sea : brass,[Math.sin(a)*.81,.222,Math.cos(a)*.81],[.075,.009,.049],[0,a+Math.PI/4,0]);
    }
    m.part(urn,ivory,[0,.385,0],[.32,.323,.32]);
    m.part(urn,"#cf9d6d",[0,.57,0],[.49,.095,.49]);
    m.part(post,"#6dbbb9",[0,.625,0],[.36,.018,.36]);
    m.part(taper,"#a1d8d2",[0,.736,0],[.058,.225,.058]);
    for(const [x,z] of [[-1.13,-.55],[1.08,.43]]) {
      m.part(urn,"#b87251",[x,.161,z],[.40,.312,.40]);
      palm(m,x,.296,z,.80);
    }
    square=m.finish();
    oct.dispose();
  }
  return new THREE.Group().add(mesh(square));
}
