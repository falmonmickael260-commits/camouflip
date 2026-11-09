export type Role = 'hunter' | 'prop';
export type Phase = 'lobby' | 'hide' | 'hunt' | 'results';
export type PropKind = 'chair' | 'stool' | 'table' | 'sofa' | 'lamp' | 'plant' | 'vase' | 'box' | 'suitcase' | 'bin' | 'bookshelf' | 'tv' | 'speaker' | 'microwave' | 'toaster' | 'coffee' | 'bed' | 'cabinet' | 'toy' | 'fridge' | 'tub' | 'sink' | 'car' | 'basket' | 'toolbox' | 'fan' | 'vacuum' | 'barrel' | 'chest' | 'ottoman' | 'globe' | 'guitar' | 'hamper' | 'lantern' | 'sideboard';
export interface PropDef { id: string; kind: PropKind; x: number; z: number; yaw: number; w: number; d: number; h: number; morph: boolean; solid: boolean; }
export interface WallDef { x: number; z: number; w: number; d: number; h: number; }
export interface PlayerState { id: string; name: string; x: number; z: number; yaw: number; pitch: number; role: Role; disguise: string | null; locked: boolean; alive: boolean; hp: number; score: number; bot: boolean; moving: number; }
export interface Snapshot { type: 'snapshot'; code: string; phase: Phase; endsAt: number; round: number; hunterId: string | null; hostId: string; players: PlayerState[]; connected: number; }
export type ClientMessage =
  | { type: 'create'; name: string; bots: number }
  | { type: 'join'; name: string; code: string }
  | { type: 'start' }
  | { type: 'next' }
  | { type: 'input'; x: number; z: number; yaw: number; pitch: number; run: boolean }
  | { type: 'morph'; propId: string }
  | { type: 'unmorph' }
  | { type: 'lock'; locked: boolean }
  | { type: 'fire' };
export type ServerMessage = Snapshot | { type: 'welcome'; id: string; code: string } | { type: 'event'; event: 'fire' | 'hit' | 'morph' | 'eliminate' | 'penalty'; x: number; z: number; id?: string; target?: string } | { type: 'error'; message: string };

const props: PropDef[] = [];
function add(kind: PropKind, x: number, z: number, yaw = 0, morph = true): void {
  const size: Record<PropKind, [number, number, number]> = {
    chair: [.58,.62,1.05], stool: [.48,.48,.72], table: [1.8,.95,.8], sofa: [2.5,.95,1.05], lamp: [.48,.48,1.55], plant: [.65,.65,1.45], vase: [.36,.36,.55], box: [.7,.65,.65], suitcase: [.62,.32,.84], bin: [.48,.48,.65], bookshelf: [1.6,.42,2.15], tv: [1.45,.25,.95], speaker: [.36,.34,.9], microwave: [.55,.42,.34], toaster: [.34,.25,.27], coffee: [.33,.3,.37], bed: [2.2,2.25,.85], cabinet: [1.35,.55,1.55], toy: [.52,.52,.45], fridge: [.85,.76,2.05], tub: [1.85,.88,.65], sink: [.7,.5,.84], car: [2.1,4.1,1.35],basket:[.58,.46,.5],toolbox:[.58,.33,.35],fan:[.5,.5,1.3],vacuum:[.42,.38,1.15],barrel:[.55,.55,.86],chest:[.92,.56,.58],ottoman:[.72,.72,.46],globe:[.58,.58,1.1],guitar:[.5,.32,1.27],hamper:[.62,.54,.75],lantern:[.34,.34,.52],sideboard:[1.25,.48,.98],
  };
  const [w,d,h] = size[kind];
  props.push({ id: `${kind}-${props.length}`, kind, x, z, yaw, w, d, h, morph: morph && w <= 2.25 && d <= 2.3 && h <= 2.16, solid: !['vase','toaster','coffee','toy','basket','toolbox'].includes(kind) });
}

// Plan de la maison: 3 colonnes, 3 rangées; chaque séparation a une porte de 2,4 m.
export const rooms = [
  { name: 'Chambre sauge', x: -9.5, z: -6.5, w: 9, d: 7, color: '#9daea1' },
  { name: 'Salle de bains', x: 0, z: -6.5, w: 10, d: 7, color: '#b0c8c7' },
  { name: 'Chambre terracotta', x: 9.5, z: -6.5, w: 9, d: 7, color: '#c8aa9f' },
  { name: 'Salle à manger', x: -9.5, z: .5, w: 9, d: 7, color: '#c3b79d' },
  { name: 'Galerie', x: 0, z: .5, w: 10, d: 7, color: '#d5cdbf' },
  { name: 'Cuisine', x: 9.5, z: .5, w: 9, d: 7, color: '#b7c4b4' },
  { name: 'Grand salon', x: -9.5, z: 7, w: 9, d: 6, color: '#c3b49f' },
  { name: 'Entrée', x: 0, z: 7, w: 10, d: 6, color: '#d1c6b2' },
  { name: 'Garage', x: 9.5, z: 7, w: 9, d: 6, color: '#a9b2ad' },
] as const;

export const walls: WallDef[] = [];
function wall(x: number, z: number, w: number, d: number, h = 3): void { walls.push({ x,z,w,d,h }); }
wall(0,-10,28,.28); wall(0,10,28,.28); wall(-14,0,.28,20); wall(14,0,.28,20);
for (const x of [-5,5]) {
  for (const [a,b,gap] of [[-10,-3,-6.5],[-3,4,.5],[4,10,7]]) {
    const doorA = gap - 1.2, doorB = gap + 1.2;
    wall(x,(a+doorA)/2,.22,doorA-a); wall(x,(doorB+b)/2,.22,b-doorB);
    wall(x,gap, .22,2.4, .42); // linteau, placé en haut dans le rendu
  }
}
for (const z of [-3,4]) {
  for (const [a,b,gap] of [[-14,-5,-9.5],[-5,5,0],[5,14,9.5]]) {
    const doorA = gap - 1.2, doorB = gap + 1.2;
    wall((a+doorA)/2,z,doorA-a,.22); wall((doorB+b)/2,z,b-doorB,.22);
    wall(gap,z,2.4,.22,.42);
  }
}

// Objets uniques: chaque instance garde son identifiant pour une transformation exacte.
add('bed',-11.1,-7.4,Math.PI/2,false); add('cabinet',-12.8,-4.2); add('lamp',-7,-8.6); add('plant',-6.1,-8.7); add('suitcase',-7.3,-4.4); add('vase',-12.2,-5.2); add('chair',-6.8,-5.7,.5);
add('tub',-2.9,-8.5,0,false); add('sink',2.8,-7.9); add('bin',3.4,-4.4); add('cabinet',-2.5,-4.2); add('plant',3.4,-8.8);
add('bed',10.7,-7.4,-Math.PI/2,false); add('cabinet',12.8,-4.3); add('lamp',6.5,-8.4); add('toy',8,-4.8); add('suitcase',6.6,-5.4); add('bookshelf',12.5,-8.7);
add('table',-9.6,.2); add('chair',-9.8,-1.15,Math.PI); add('chair',-9.8,1.55); add('chair',-12,.2,Math.PI/2); add('chair',-7.2,.2,-Math.PI/2); add('cabinet',-12.9,2.6); add('vase',-11.3,2.7); add('plant',-6.2,-1.9);
add('bookshelf',-3.8,1.5); add('plant',-3.5,-1.8); add('lamp',3.8,2.9); add('vase',2.9,-1.8); add('box',-1.8,2.4); add('stool',1.6,2.4); add('speaker',3.6,-1.5);
add('fridge',12.8,-1.9,0,false); add('cabinet',12.9,1.7); add('table',9.7,.4); add('stool',9.1,1.7); add('stool',10.9,1.7); add('microwave',11.7,-1.7); add('toaster',7.3,-1.8); add('coffee',7.3,2.7); add('bin',6.1,2.5); add('plant',12.7,2.8);
add('sofa',-11.2,7.7,Math.PI/2,false); add('table',-8.8,7.2); add('tv',-6.3,7.3,Math.PI/2); add('speaker',-6.2,5.2); add('speaker',-6.2,9); add('lamp',-12.9,5.1); add('plant',-12.9,9); add('stool',-8.5,9); add('box',-6.9,9);
add('cabinet',-3.8,9); add('plant',-3.6,5); add('suitcase',2.8,8.8); add('vase',3.5,5.1); add('chair',0,8.8); add('toy',1.2,5.1);
add('car',10.5,7,0,false); add('bookshelf',6.2,9); add('box',6.8,5); add('box',7.7,5); add('bin',12.8,5); add('stool',12.8,9); add('suitcase',6.1,7.3);
// Nouveaux objets de cachette : ajoutés après le catalogue historique pour garder ses identifiants.
add('ottoman',-7,-6.9);add('basket',1.1,-8.5);add('basket',7.7,-5.8);
add('chest',-6.7,2.4);add('ottoman',-8,5);add('basket',-12.5,5.9);
add('fan',7.2,2.3);add('toolbox',6.6,6.3);add('vacuum',6.5,8.1);add('barrel',12.6,6.4);
add('chest',2.4,5.5);add('toolbox',12.8,8.3);add('basket',-2.5,8.6);
// Cinq silhouettes supplémentaires, placées près des murs pour préserver les circulations.
add('globe',-12.1,8.6);add('guitar',-8.1,-9);add('hamper',-3.4,-5.2);add('lantern',-9.4,5.1);add('sideboard',-12.3,-1.9);
add('globe',3.5,7);add('guitar',6.5,-6.9);add('hamper',11.8,-5.3);add('lantern',-8.4,2.8);add('sideboard',1.8,-.4);
export { props };

export const SPAWNS = [{x:0,z:7.5},{x:-9,z:6},{x:8.5,z:1.5},{x:-9,z:-1},{x:8,z:-5},{x:-1,z:-5},{x:2,z:1.5}];
export function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max,v)); }
type Contact={nx:number;nz:number;depth:number};
function circleBox(x:number,z:number,r:number,bx:number,bz:number,hw:number,hd:number,yaw=0):Contact|null {
  const c=Math.cos(yaw),s=Math.sin(yaw),dx=x-bx,dz=z-bz;
  const lx=dx*c+dz*s,lz=-dx*s+dz*c;
  const cx=clamp(lx,-hw,hw),cz=clamp(lz,-hd,hd);
  let nx=lx-cx,nz=lz-cz,depth:number;
  const distance=Math.hypot(nx,nz);
  if(distance>=r) return null;
  if(distance>1e-6){nx/=distance;nz/=distance;depth=r-distance;}
  else {
    const left=lx+hw,right=hw-lx,front=lz+hd,back=hd-lz;
    const edge=Math.min(left,right,front,back);
    nx=edge===left?-1:edge===right?1:0;
    nz=edge===front?-1:edge===back?1:0;
    depth=r+edge;
  }
  return {nx:nx*c-nz*s,nz:nx*s+nz*c,depth};
}
function contactAt(x:number,z:number,radius:number,disguise:string|null):Contact|null {
  let best:Contact|null=null;
  const choose=(contact:Contact|null)=>{if(contact&&(!best||contact.depth>best.depth))best=contact;};
  const limitX=13.72-radius,limitZ=9.72-radius;
  if(x>limitX)choose({nx:-1,nz:0,depth:x-limitX});
  if(x< -limitX)choose({nx:1,nz:0,depth:-limitX-x});
  if(z>limitZ)choose({nx:0,nz:-1,depth:z-limitZ});
  if(z< -limitZ)choose({nx:0,nz:1,depth:-limitZ-z});
  for(const w of walls)if(w.h>1)choose(circleBox(x,z,radius,w.x,w.z,w.w/2,w.d/2));
  for(const p of props)if(p.solid&&p.id!==disguise)choose(circleBox(x,z,radius,p.x,p.z,p.w/2,p.d/2,p.yaw));
  return best;
}
export function collides(x:number,z:number,radius:number,disguise:string|null=null):boolean {return contactAt(x,z,radius,disguise)!==null;}
export function movementRadius(disguise:string|null):number {
  const p=props.find(q=>q.id===disguise);
  return p?clamp(Math.sqrt(p.w*p.d)*.42,.23,.55):.32;
}
export function moveWithCollision(x:number,z:number,dx:number,dz:number,radius:number,disguise:string|null=null):{x:number;z:number} {
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
  for(let i=0;i<steps;i++){
    const sx=dx/steps,sz=dz/steps,current=contactAt(x,z,radius,disguise);
    const hit=contactAt(x+sx,z+sz,radius,disguise);
    if(!hit||(current&&hit.depth<current.depth-.0001)){x+=sx;z+=sz;continue;}
    const into=Math.min(0,sx*hit.nx+sz*hit.nz);
    const tx=sx-into*hit.nx,tz=sz-into*hit.nz;
    const slide=contactAt(x+tx,z+tz,radius,disguise);
    if(!slide||(current&&slide.depth<current.depth-.0001)){x+=tx;z+=tz;continue;}
    const xHit=contactAt(x+sx,z,radius,disguise),zHit=contactAt(x,z+sz,radius,disguise);
    if(!xHit||(current&&xHit.depth<current.depth-.0001))x+=sx;
    if(!zHit||(current&&zHit.depth<current.depth-.0001))z+=sz;
  }
  return {x,z};
}
export interface MotionBody {x:number;z:number;vx:number;vz:number;}
export interface MotionInput {x:number;z:number;yaw:number;run:boolean;disguise:string|null;}
export function stepKinematic(body:MotionBody,input:MotionInput,dt:number):MotionBody&{moving:number} {
  const mag=Math.hypot(input.x,input.z),scale=mag>1?1/mag:1;
  const localX=input.x*scale,localZ=input.z*scale;
  const speed=input.disguise?(input.run?3.1:2.2):(input.run?4.6:3.25);
  const targetX=(localX*Math.cos(input.yaw)+localZ*Math.sin(input.yaw))*speed;
  const targetZ=(-localX*Math.sin(input.yaw)+localZ*Math.cos(input.yaw))*speed;
  let vx=body.vx,vz=body.vz;
  const deltaX=targetX-vx,deltaZ=targetZ-vz,delta=Math.hypot(deltaX,deltaZ);
  const acceleration=mag<.05?32:(targetX*vx+targetZ*vz<0?27:21);
  const change=acceleration*dt;
  if(delta<=change){vx=targetX;vz=targetZ;}
  else if(delta>0){vx+=deltaX/delta*change;vz+=deltaZ/delta*change;}
  if(mag<.05&&Math.hypot(vx,vz)<.07){vx=0;vz=0;}
  const next=moveWithCollision(body.x,body.z,vx*dt,vz*dt,movementRadius(input.disguise),input.disguise);
  const actualX=(next.x-body.x)/Math.max(dt,.001),actualZ=(next.z-body.z)/Math.max(dt,.001);
  return {x:next.x,z:next.z,vx:actualX,vz:actualZ,moving:Math.hypot(actualX,actualZ)};
}
