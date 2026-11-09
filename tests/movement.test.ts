import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collides, moveWithCollision, movementRadius, props, stepKinematic, type MotionBody } from '../src/shared';
import { radialStick } from '../src/input-math';
import { clearCameraDistance } from '../src/camera-collision';

test('le joystick filtre la dérive et garde une amplitude diagonale régulière',()=>{
  assert.equal(radialStick(4,3,50).x,0);
  assert.equal(radialStick(4,3,50).z,0);
  const diagonal=radialStick(50,50,50);
  assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.z)-1)<.001);
  assert.ok(diagonal.x>0&&diagonal.z>0);
});

test('la marche démarre vite, freine court et ne gagne pas de vitesse en diagonale',()=>{
  let body:MotionBody={x:0,z:7.5,vx:0,vz:0};
  const input={x:0,z:-1,yaw:0,run:false,disguise:null};
  body=stepKinematic(body,input,.05);
  assert.ok(Math.hypot(body.vx,body.vz)>0&&Math.hypot(body.vx,body.vz)<3.25);
  for(let i=0;i<8;i++)body=stepKinematic(body,input,.05);
  assert.ok(Math.abs(Math.hypot(body.vx,body.vz)-3.25)<.05);
  const before=body.z;
  for(let i=0;i<4;i++)body=stepKinematic(body,{...input,x:0,z:0},.05);
  assert.ok(Math.hypot(body.vx,body.vz)<.08);
  assert.ok(before-body.z<.25,'arrêt sans glissade longue');
  const straight=stepKinematic({x:0,z:7.5,vx:0,vz:0},input,.05);
  const diagonal=stepKinematic({x:0,z:7.5,vx:0,vz:0},{...input,x:1},.05);
  assert.ok(Math.abs(straight.moving-diagonal.moving)<.001);
});

test('le personnage glisse le long du mur et traverse les pièces par les portes',()=>{
  const slide=moveWithCollision(-4,2.9,-2,-1,.32);
  assert.ok(slide.x> -4.7&&slide.z<2.3,'le déplacement tangent reste possible');
  assert.equal(collides(slide.x,slide.z,.32),false);
  let body:MotionBody={x:-9,z:6,vx:0,vz:0};
  const route:[number,number][]=[[-6,6],[-4,7],[0,7],[0,.5],[3,.5],[6,.5],[8,1.5],[8,2.6],[10.5,2.6],[11.5,2.6]];
  for(const [tx,tz] of route){
    let reached=false;
    for(let i=0;i<160;i++){
      const dx=tx-body.x,dz=tz-body.z,d=Math.hypot(dx,dz);
      if(d<.45){reached=true;break;}
      body=stepKinematic(body,{x:dx/d,z:dz/d,yaw:0,run:false,disguise:null},.05);
      assert.equal(collides(body.x,body.z,.32),false);
    }
    assert.ok(reached,`passage bloqué vers ${tx}, ${tz}`);
  }
});

test('la chaise déguisée se déplace et garde une collision adaptée à sa taille',()=>{
  const chair=props.find(p=>p.kind==='chair'&&p.x===0)!;
  let body:MotionBody={x:chair.x,z:chair.z,vx:0,vz:0};
  for(let i=0;i<20;i++)body=stepKinematic(body,{x:0,z:-1,yaw:0,run:false,disguise:chair.id},.05);
  assert.ok(chair.z-body.z>1.8,'objet mobile après transformation');
  assert.ok(movementRadius(chair.id)<movementRadius(props.find(p=>p.kind==='table')!.id));
  assert.equal(collides(body.x,body.z,movementRadius(chair.id),chair.id),false);
});

test('la caméra s’arrête devant les murs et les meubles hauts',()=>{
  const wall=clearCameraDistance({x:0,y:1.2,z:7.5},{x:0,y:1.5,z:12},null);
  assert.ok(wall<3);
  const shelf=clearCameraDistance({x:-3.8,y:1.2,z:0},{x:-3.8,y:1.8,z:3},null);
  assert.ok(shelf<2);
});
