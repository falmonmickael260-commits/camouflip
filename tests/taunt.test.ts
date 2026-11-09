import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearCameraDistance, propCameraDistance } from '../src/camera-collision';
import { props } from '../src/shared';
import { soundWallCount, tauntAcoustics, TAUNT_COOLDOWN_MS, TAUNT_RANGE } from '../src/taunt';

test('caméra des objets : recul selon cinq tailles et rabattement devant un mur',()=>{
  const sizes=['toaster','chair','lamp','table','bookshelf'].map(kind=>props.find(p=>p.kind===kind&&p.morph)!);
  const distances=sizes.map(propCameraDistance);
  assert.ok(distances.every(distance=>distance>=3.55&&distance<=4.18));
  assert.ok(distances[0]<distances[3]&&distances[1]<distances[4]);
  const focus={x:-9.5,y:1,z:7},wanted={x:-15,y:1,z:7};
  const safe=clearCameraDistance(focus,wanted,null,.3);
  assert.ok(safe<5.5&&safe>0,'la caméra recule devant le mur extérieur');
  assert.equal(propCameraDistance(null),3.65);
});

test('nargue : portée, décroissance et masquage par les murs de plusieurs pièces',()=>{
  assert.equal(TAUNT_COOLDOWN_MS,12_000);
  assert.equal(TAUNT_RANGE,15);
  const living={x:-9.5,z:7},hall={x:-3,z:7};
  const kitchen={x:9.5,z:.5},corridor={x:0,z:.5};
  const bedroom={x:-9.5,z:-6.5},bath={x:0,z:-6.5};
  assert.equal(soundWallCount(living.x,living.z,hall.x,hall.z),0,'porte ouverte entre salon et entrée');
  assert.equal(soundWallCount(bedroom.x,bedroom.z,bath.x,bath.z),0,'porte ouverte entre chambre et salle de bains');
  assert.ok(soundWallCount(-12.5,6,-12.5,2)>0,'mur entre salon et salle à manger hors porte');
  assert.ok(soundWallCount(12.5,2.5,12.5,5.5)>0,'mur entre cuisine et garage hors porte');
  const nearby=tauntAcoustics(-9,7,-8,7),distant=tauntAcoustics(living.x,living.z,kitchen.x,kitchen.z);
  assert.ok(nearby.audible&&nearby.gain>0);
  assert.equal(distant.audible,false);
  const clear=tauntAcoustics(-12.5,5.5,-12.5,8),blocked=tauntAcoustics(-12.5,2,-12.5,4.5);
  assert.ok(blocked.walls>0&&blocked.gain<clear.gain&&blocked.lowpassHz<clear.lowpassHz);
  const door=tauntAcoustics(corridor.x,corridor.z,kitchen.x,kitchen.z);
  assert.ok(door.audible&&door.walls===0,'porte du couloir vers la cuisine');
});
