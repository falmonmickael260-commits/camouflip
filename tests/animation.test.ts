import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Character } from '../src/character';

test('le pied reste au sol et ancré pendant la phase d’appui',()=>{
  const character=new Character('prop'),samples:{frame:number;z:number;y:number}[]=[];
  const dt=1/60,speed=3.3;
  for(let i=0;i<180;i++){
    character.root.position.z-=speed*dt;
    character.update(speed,dt);
    character.root.updateMatrixWorld(true);
    const gait=(character.phase/(Math.PI*2))%1;
    if(i>60&&gait>.08&&gait<.42){const foot=character.leftFoot.getWorldPosition(new Vector3());samples.push({frame:i,z:foot.z,y:foot.y});}
  }
  const first=samples[0],sameStep=samples.filter(s=>s.frame-first.frame<8);
  assert.ok(sameStep.length>=5);
  assert.ok(Math.max(...sameStep.map(s=>s.z))-Math.min(...sameStep.map(s=>s.z))<.025,'le pied ne glisse pas au sol');
  assert.ok(Math.max(...sameStep.map(s=>s.y))-Math.min(...sameStep.map(s=>s.y))<.025,'le pied reste à la même hauteur');
  assert.ok(character.phase>Math.PI*2,'plusieurs cycles de marche ont été joués');
});
