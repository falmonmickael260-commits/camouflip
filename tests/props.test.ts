import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { buildWorld, makePropClone } from '../src/scene';
import { collides, movementRadius, props } from '../src/shared';

test('les nouveaux déguisements reprennent exactement leur modèle du décor',()=>{
  const world=buildWorld();
  const added=props.slice(65);
  assert.equal(new Set(props.filter(p=>p.morph).map(p=>p.kind)).size,30);
  assert.ok(added.length>=12);
  for(const p of added){
    assert.equal(p.morph,true);
    const original=world.propMeshes.get(p.id)!,clone=makePropClone(p);
    assert.ok(original.children.length>0,`${p.kind} possède un vrai volume`);
    assert.equal(clone.children.length,original.children.length);
    const a=new Box3().setFromObject(original).getSize(new Vector3());
    const b=new Box3().setFromObject(clone).getSize(new Vector3());
    assert.ok(a.distanceTo(b)<.001,`${p.kind} conserve ses proportions`);
  }
});
test('les nouvelles cachettes restent accessibles sans bloquer les passages',()=>{
  assert.equal(props.length,88);
  for(const p of props.slice(78))assert.equal(collides(p.x,p.z,movementRadius(p.id),p.id),false,p.id);
});
