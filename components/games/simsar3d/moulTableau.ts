import * as THREE from "three";
import type { MoulShot } from "@/games/simsar3d/moulBoard";
import { makeMoulCharacter } from "./moulStreetArt";
import type { TileWorldTransform } from "@/games/simsar3d/boardData";

// A transaction plays on the deed itself so everyone sees which building changed hands.
export function createMoulTableau(scene: THREE.Scene) {
  const stage = new THREE.Group();
  stage.name = "Property transaction";
  const gold = new THREE.MeshStandardMaterial({color:0xffc749,metalness:.75,roughness:.24});
  const ivory = new THREE.MeshStandardMaterial({color:0xffedc6,roughness:.8});
  const ink = new THREE.MeshBasicMaterial({color:0x4f3441});
  const key = new THREE.Group(), bill = new THREE.Group();
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.10,20),gold);
  coin.rotation.x = Math.PI/2;
  function block(group:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    mesh.position.set(x,y,z);group.add(mesh);
  }
  const bow=new THREE.Mesh(new THREE.TorusGeometry(.28,.08,8,24),gold);
  bow.position.x=-.3;key.add(bow);
  block(key,.86,.13,.12,.25,0,0,gold);
  block(key,.14,.27,.12,.58,-.09,0,gold);
  block(bill,.65,1.22,.045,0,0,0,ivory);
  for(let n=0;n<6;n++) block(bill,n===5?.23:.46,.036,.018,0,.43-.16*n,.035,ink);
  const cast = new THREE.Group();
  stage.add(key,bill,coin,cast);stage.visible=false;scene.add(stage);
  let started=0, duration=0, lastId:string|undefined, gesture:THREE.Object3D|undefined;
  return {
    update(shot:MoulShot|null,characters:Record<string,number>,tf:TileWorldTransform|null, premium:boolean) {
      if (!shot || !tf) { stage.visible=false; return false; }
      if (shot.id!==lastId) {
        lastId=shot.id;started=performance.now();
        duration=shot.kind==="BUY" && premium ? 3300 : 2450;
        stage.position.set(tf.x-tf.outwardNx*1.25,.63,tf.z-tf.outwardNz*1.25);
        stage.rotation.y=Math.atan2(-tf.outwardNx,-tf.outwardNz);
        cast.clear();gesture=undefined;
        const add=(index:number,x:number)=>{
          const figure=makeMoulCharacter(index);
          figure.scale.setScalar(1.8);figure.position.x=x;
          figure.rotation.y=x<0?.38:-.38;cast.add(figure);return figure;
        };
        add(characters[shot.actor]??0,-.90);
        const paying=shot.kind==="RENT" || shot.kind==="TAX";
        if(paying || shot.recipient) gesture=add(shot.recipient ? characters[shot.recipient] : 7,.90).getObjectByName("gesture");
        key.visible=shot.kind==="BUY" || shot.kind==="BUILD";bill.visible=paying;coin.visible=paying||shot.kind==="PRIZE";
      }
      const t=(performance.now()-started)/duration;
      stage.visible=t>=0 && t<1;
      if (!stage.visible) return false;
      const arc=Math.sin(t*Math.PI);
      key.position.set(-.1,2.05+.34*arc,.18);key.rotation.y=t*5;
      bill.position.set(-.45+t*.9,1.14+.12*arc,.47);bill.rotation.z=.12-t*.24;
      coin.position.set(-.75+t*1.5,1.57+arc*.65,.50);coin.rotation.z=t*6;
      if(gesture) gesture.rotation.x=-.5*arc;
      return true;
    },
    dispose() {
      scene.remove(stage);cast.clear();
      stage.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose()});
      gold.dispose();ivory.dispose();ink.dispose();
    },
  };
}
