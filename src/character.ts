import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Role } from './shared';

const skin=new THREE.MeshStandardMaterial({color:'#d9a684',roughness:.8});
const hair=new THREE.MeshStandardMaterial({color:'#283c42',roughness:.9});
const sole=new THREE.MeshStandardMaterial({color:'#273940',roughness:.8});
const gold=new THREE.MeshStandardMaterial({color:'#d6a66b',metalness:.32,roughness:.38});
const cheek=new THREE.MeshStandardMaterial({color:'#c98e79',roughness:.86});
const ivory=new THREE.MeshStandardMaterial({color:'#f7f0df',roughness:.7});
const stitching=new THREE.MeshStandardMaterial({color:'#c6ac86',roughness:.88});
function cube(parent:THREE.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material,r=.04):THREE.Mesh {const o=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,r),m);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o;}
function ball(parent:THREE.Object3D,r:number,x:number,y:number,z:number,m:THREE.Material):THREE.Mesh {const o=new THREE.Mesh(new THREE.SphereGeometry(r,26,18),m);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o;}
function limb(parent:THREE.Object3D,r:number,length:number,x:number,y:number,z:number,m:THREE.Material):THREE.Mesh {const o=new THREE.Mesh(new THREE.CapsuleGeometry(r,length,4,12),m);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o;}
export class Character {
  root=new THREE.Group();
  body=new THREE.Group();
  leftLeg=new THREE.Group();rightLeg=new THREE.Group();leftShin=new THREE.Group();rightShin=new THREE.Group();
  leftArm=new THREE.Group();rightArm=new THREE.Group();
  leftFoot:THREE.Group;rightFoot:THREE.Group;
  weapon:Blaster|null=null;
  phase=0;blend=0;distance=0;
  constructor(role:Role){
    const coat=new THREE.MeshStandardMaterial({color:role==='hunter'?'#3c6670':'#b96d5f',roughness:.79});
    const pants=new THREE.MeshStandardMaterial({color:role==='hunter'?'#344d56':'#4d6070',roughness:.84});
    this.root.add(this.body);this.body.position.y=.06;
    const torso=ball(this.body,1,0,1.12,0,coat);torso.scale.set(.34,.43,.235);
    cube(this.body,.46,.39,.035,0,1.13,.226,coat,.025);
    cube(this.body,.37,.024,.022,0,1.31,.251,stitching,.008);
    for(const x of [-.2,.2])cube(this.body,.028,.34,.025,x,1.11,.244,stitching,.009);
    cube(this.body,.53,.13,.37,0,.79,0,coat,.065);
    cube(this.body,.51,.075,.35,0,.77,0,gold,.03);
    limb(this.body,.11,.12,0,1.51,0,skin);
    const head=ball(this.body,.29,0,1.71,-.012,skin);head.scale.set(1,.98,.93);
    for(const x of [-.285,.285]){const ear=ball(this.body,.075,x,1.7,0,skin);ear.scale.set(.6,1,.64);}
    const cap=ball(this.body,.31,0,1.835,.018,hair);cap.scale.set(1,.48,1.02);
    const backHair=ball(this.body,.285,0,1.76,.15,hair);backHair.scale.set(.94,.78,.58);
    const brim=ball(this.body,.27,0,1.78,-.2,hair);brim.scale.set(1.08,.15,.72);
    for(const x of [-.105,.105]){const eye=ball(this.body,.027,x,1.71,-.273,sole);eye.scale.set(1,1,.58);const blush=ball(this.body,.052,x*1.65,1.625,-.245,cheek);blush.scale.set(1,.48,.22);}
    for(const x of [-.105,.105]){cube(this.body,.075,.014,.018,x,1.774,-.282,hair,.006);ball(this.body,.008,x-.007,1.718,-.298,ivory);}
    const nose=ball(this.body,.035,0,1.64,-.282,skin);nose.scale.set(.7,.85,.65);
    cube(this.body,.1,.018,.018,0,1.575,-.282,hair,.008);
    if(role==='hunter'){
      cube(this.body,.47,.105,.065,0,1.75,-.27,gold,.045);cube(this.body,.17,.06,.05,0,1.86,-.26,sole,.01);
      cube(this.body,.28,.24,.045,0,1.09,.245,sole,.035);cube(this.body,.18,.045,.025,0,1.16,.273,gold,.012);
      for(const x of [-.22,.22])cube(this.body,.105,.24,.045,x,1.15,-.218,ivory,.035);
    }
    else {
      cube(this.body,.35,.035,.035,0,1.26,-.22,ivory,.012);cube(this.body,.1,.12,.026,.15,1.05,-.229,gold,.015);
      for(const x of [-.15,.15]){const lapel=cube(this.body,.105,.28,.032,x,1.25,-.214,ivory,.025);lapel.rotation.z=x<0?-.27:.27;}
      cube(this.body,.24,.12,.032,0,1.07,.245,stitching,.02);
    }
    for(const [side,upper,lower] of [[-1,this.leftLeg,this.leftShin],[1,this.rightLeg,this.rightShin]] as const){
      upper.position.set(side*.17,.76,0);this.body.add(upper);limb(upper,.12,.2,0,-.19,0,pants);
      lower.position.y=-.4;upper.add(lower);limb(lower,.105,.2,0,-.19,0,pants);
      const foot=new THREE.Group();foot.position.y=-.4;lower.add(foot);cube(foot,.24,.13,.36,0,-.045,-.085,sole,.05);
      cube(lower,.21,.07,.22,0,-.34,0,stitching,.02);
    }
    this.leftFoot=this.leftShin.children[1] as THREE.Group;this.rightFoot=this.rightShin.children[1] as THREE.Group;
    for(const [side,arm] of [[-1,this.leftArm],[1,this.rightArm]] as const){arm.position.set(side*.39,1.38,0);this.body.add(arm);ball(arm,.135,0,-.08,0,coat).scale.set(1,.85,.8);limb(arm,.105,.25,0,-.26,0,coat);cube(arm,.21,.045,.21,0,-.44,0,gold,.018);ball(arm,.095,0,-.51,0,skin);}
    if(role==='hunter'){
      this.weapon=new Blaster();
      this.weapon.group.scale.setScalar(.65);
      this.weapon.group.position.set(0,-.42,-.27);
      this.rightArm.add(this.weapon.group);
    }
  }
  fire():void {this.weapon?.fire();}
  update(speed:number,dt:number):void {
    const target=Math.min(1,speed/3.2);this.blend+= (target-this.blend)*(1-Math.exp(-dt*12));
    // La phase dépend de la distance réellement parcourue, pas du temps de rendu.
    this.distance+=speed*dt;this.phase+=speed*dt*2*Math.PI/1.3;
    const a=Math.sin(this.phase)*this.blend,b=Math.sin(this.phase+Math.PI)*this.blend;
    this.leftArm.rotation.x=-a*.54;this.rightArm.rotation.x=-b*.54;
    if(this.weapon){
      this.weapon.kick=Math.max(0,this.weapon.kick-dt*8);
      this.rightArm.rotation.x-=this.weapon.kick*.16;
      this.weapon.group.position.z=-.27+this.weapon.kick*.08;
    }
    this.body.position.y=.035+Math.abs(Math.sin(this.phase))*this.blend*.045;
    this.body.rotation.z=Math.sin(this.phase)*this.blend*.025;
    const solve=(upper:THREE.Group,lower:THREE.Group,foot:THREE.Group,offset:number)=>{
      const u=((this.phase/(2*Math.PI)+offset)%1+1)%1;
      let stride:number,lift=0;
      if(u<.5)stride=-.325+u*1.3; // pied posé : recul local égal à la distance du corps
      else {const t=(u-.5)*2,s=t*t*(3-2*t);stride=.325-.65*s;lift=.16*Math.sin(Math.PI*t);}
      const z=stride*this.blend,ankleY=.11-this.body.position.y+lift*this.blend;
      const dy=ankleY-.76,r=THREE.MathUtils.clamp(Math.hypot(dy,z),.1,.795);
      const direction=Math.atan2(-z,-dy),bend=Math.acos(THREE.MathUtils.clamp(r/.8,-1,1));
      upper.rotation.x=direction+bend;lower.rotation.x=-2*bend;foot.rotation.x=-upper.rotation.x-lower.rotation.x;
    };
    solve(this.leftLeg,this.leftShin,this.leftFoot,0);solve(this.rightLeg,this.rightShin,this.rightFoot,.5);
  }
}

export class Blaster {
  group=new THREE.Group();kick=0;
  constructor(){
    const navy=new THREE.MeshStandardMaterial({color:'#345969',metalness:.25,roughness:.38});
    const brass=new THREE.MeshStandardMaterial({color:'#d9a858',metalness:.62,roughness:.28});
    cube(this.group,.25,.24,.58,0,0,-.25,navy,.07);
    cube(this.group,.18,.1,.42,0,.085,-.46,brass,.035);
    cube(this.group,.12,.33,.12,0,-.22,-.05,navy,.025);
    cube(this.group,.14,.05,.12,0,.16,-.12,brass,.01);
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.075,.09,.27,12),brass);barrel.rotation.x=Math.PI/2;barrel.position.set(0,.01,-.67);this.group.add(barrel);
    cube(this.group,.25,.1,.11,0,-.055,-.48,brass,.035);
    this.group.position.set(.34,-.28,-.65);
  }
  fire():void{this.kick=1;}
  update(dt:number,moving:number,aim=0):void{this.kick=Math.max(0,this.kick-dt*7);this.group.position.set(.34-.3*aim,-.28-.09*aim+this.kick*.08+Math.sin(performance.now()*.009)*moving*.008*(1-aim),-.65-.22*aim+this.kick*.12);this.group.rotation.x=-this.kick*.15+aim*.035;}
}
