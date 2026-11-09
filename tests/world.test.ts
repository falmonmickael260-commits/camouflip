import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collides, moveWithCollision, props, rooms, SPAWNS } from '../src/shared';

test('une seule maison contient neuf espaces et un catalogue d’objets identifiés',()=>{
  assert.equal(rooms.length,9);
  assert.ok(props.length>=55);
  assert.equal(new Set(props.map(p=>p.id)).size,props.length);
  assert.ok(new Set(props.filter(p=>p.morph).map(p=>p.kind)).size>=15);
});
test('les passages sont praticables et les murs arrêtent un joueur',()=>{
  assert.equal(collides(-5,.5,.34),false);
  assert.equal(collides(-5,2.9,.34),true);
  const moved=moveWithCollision(-4,2.9,-2,0,.34);
  assert.ok(moved.x>-4.7);
});
test('les points de départ ont au moins un accès libre',()=>{
  assert.ok(SPAWNS.filter(p=>!collides(p.x,p.z,.34)).length>=6);
});
