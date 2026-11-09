import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { props, rooms, walls, type PropDef, type PropKind } from './shared';

export type World = { scene: THREE.Scene; propMeshes: Map<string,THREE.Group>; solids: THREE.Object3D[]; lights: THREE.Light[] };
const mat=(color:string,roughness=.8,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const M={cream:mat('#e8d9bd'),wall:mat('#e9e1d5'),trim:mat('#f7f0e5'),wood:mat('#795c49'),woodLight:mat('#b78f6d'),woodDark:mat('#453d37'),sage:mat('#6e8a7c'),olive:mat('#536e5e'),clay:mat('#b97763'),navy:mat('#334c58'),teal:mat('#82a9a5'),gold:mat('#c6a36a',.35,.55),metal:mat('#a9aaa5',.32,.65),black:mat('#242e32',.55,.15),glass:mat('#a9c9ca',.16,.25),screen:mat('#172d38',.2,.12),leaf:mat('#53785d'),leaf2:mat('#77946c'),soil:mat('#504439'),linen:mat('#ddd1bc'),white:mat('#f5eee2'),rubber:mat('#292b2b'),pink:mat('#c78779'),peach:mat('#dfb394'),blue:mat('#698d9a'),plum:mat('#806f82'),warm:new THREE.MeshStandardMaterial({color:'#f4d9aa',emissive:'#bd8753',emissiveIntensity:.35,roughness:.8})};
function surfaceTexture(kind:'wood'|'plaster'|'fabric'|'tile',repeatX=1,repeatY=1):THREE.DataTexture {
  const size=128,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const noise=((x*37+y*73+x*y*3)%101)/101-.5;
    let shade=247;
    if(kind==='wood')shade=243+4*Math.sin(y*.29+x*.018)+noise*5;
    if(kind==='plaster')shade=248+noise*5;
    if(kind==='fabric')shade=242+((x%6===0||y%6===0)?-6:2)+noise*3;
    if(kind==='tile')shade=(x%32<2||y%32<2)?204:241+noise*8;
    const i=(y*size+x)*4,v=Math.max(0,Math.min(255,Math.round(shade)));data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(repeatX,repeatY);texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=2;texture.needsUpdate=true;
  return texture;
}
const plasterTexture=surfaceTexture('plaster',2,2),woodTexture=surfaceTexture('wood'),woodFloorTexture=surfaceTexture('wood',5,5),fabricTexture=surfaceTexture('fabric',3,2),tileTexture=surfaceTexture('tile',5,4);
M.wall.map=plasterTexture;
for(const finish of [M.wood,M.woodLight,M.woodDark])finish.map=woodTexture;
M.linen.map=fabricTexture;
function contactShadowTexture():THREE.DataTexture {
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const distance=Math.hypot((x+.5-size/2)/(size/2),(y+.5-size/2)/(size/2));
    const alpha=Math.pow(Math.max(0,1-distance),2)*92;
    const i=(y*size+x)*4;data[i]=38;data[i+1]=43;data[i+2]=39;data[i+3]=Math.round(alpha);
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.needsUpdate=true;return texture;
}
const boxCache=new Map<string,THREE.BufferGeometry>();
const cylinderCache=new Map<string,THREE.BufferGeometry>();
const sphereGeometry=new THREE.SphereGeometry(1,12,8);
const geoBox=(w:number,h:number,d:number,r=.045)=>{const key=`${w}:${h}:${d}:${r}`;let g=boxCache.get(key);if(!g){g=new RoundedBoxGeometry(w,h,d,2,Math.min(r,w*.2,h*.2,d*.2));boxCache.set(key,g);}return g;};
function box(g:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material,r=.045):THREE.Mesh {const o=new THREE.Mesh(geoBox(w,h,d,r),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;}
function cyl(g:THREE.Group,rt:number,rb:number,h:number,x:number,y:number,z:number,m:THREE.Material,n=12):THREE.Mesh {const key=`${rt}:${rb}:${h}:${n}`;let geometry=cylinderCache.get(key);if(!geometry){geometry=new THREE.CylinderGeometry(rt,rb,h,n);cylinderCache.set(key,geometry);}const o=new THREE.Mesh(geometry,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;}
function sphere(g:THREE.Group,rx:number,ry:number,rz:number,x:number,y:number,z:number,m:THREE.Material):THREE.Mesh {const o=new THREE.Mesh(sphereGeometry,m);o.scale.set(rx,ry,rz);o.position.set(x,y,z);o.castShadow=true;g.add(o);return o;}
function legs(g:THREE.Group,w:number,d:number,h:number,m:THREE.Material):void {for(const x of [-w/2+.1,w/2-.1])for(const z of [-d/2+.1,d/2-.1])box(g,.095,h,.095,x,h/2,z,m,.025);}
function lathe(g:THREE.Group,profile:[number,number][],m:THREE.Material,x=0,y=0,z=0):THREE.Mesh {const o=new THREE.Mesh(new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(p[0],p[1])),16),m);o.position.set(x,y,z);o.castShadow=true;g.add(o);return o;}
function compact(g:THREE.Group):void {
  const byMaterial=new Map<THREE.Material,THREE.BufferGeometry[]>();
  for(const child of g.children){if(!(child instanceof THREE.Mesh))continue;child.updateMatrix();let geometry=child.geometry.clone().applyMatrix4(child.matrix);if(geometry.index){const nonIndexed=geometry.toNonIndexed();geometry.dispose();geometry=nonIndexed;}const list=byMaterial.get(child.material)||[];list.push(geometry);byMaterial.set(child.material,list);}
  g.clear();
  for(const [material,geometries] of byMaterial){const geometry=geometries.length===1?geometries[0]:mergeGeometries(geometries,false);if(!geometry)continue;const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);if(geometries.length>1)for(const part of geometries)part.dispose();}
}
function detail(g:THREE.Group,p:PropDef):void {
  const {kind:k,w,d,h}=p;
  switch(k){
    case 'chair': {
      legs(g,.48,.49,.43,M.woodDark);box(g,.54,.11,.53,0,.48,0,M.woodLight);box(g,.48,.06,.47,0,.55,0,M.clay);
      for(const x of [-.22,.22])box(g,.065,.48,.065,x,.79,.22,M.woodDark);
      box(g,.57,.12,.09,0,1,.22,M.woodLight);box(g,.43,.26,.05,0,.82,.24,M.woodLight);break;
    }
    case 'stool': {legs(g,.41,.41,.6,M.woodDark);cyl(g,.25,.25,.11,0,.68,0,M.woodLight);for(const z of [-.18,.18])box(g,.39,.045,.05,0,.24,z,M.wood);break;}
    case 'table': {legs(g,w-.25,d-.2,.68,M.woodDark);box(g,w,.11,d,0,.75,0,M.woodLight,.09);box(g,w-.12,.025,d-.1,0,.817,0,M.cream,.02);break;}
    case 'sofa': {
      box(g,w,.18,d,0,.19,0,M.woodDark);legs(g,w-.2,d-.2,.13,M.woodDark);
      box(g,w,.56,.66,0,.59,-.13,M.sage,.14);box(g,w,.88,.25,0,.61,.38,M.olive,.12);
      for(const x of [-w/2+.18,w/2-.18])box(g,.3,.62,d,x,.57,0,M.sage,.11);
      for(let i=0;i<3;i++){const x=-.76+i*.76;box(g,.7,.16,.57,x,.67,-.12,i===1?M.linen:M.teal,.1);box(g,.67,.37,.11,x,.83,.25,M.sage,.07);}break;
    }
    case 'lamp': {
      cyl(g,.19,.23,.045,0,.025,0,M.gold);cyl(g,.032,.038,1.08,0,.57,0,M.gold);
      lathe(g,[[.19,0],[.33,.03],[.24,.38],[.16,.41]],M.cream,0,1.17,0);
      cyl(g,.17,.17,.025,0,1.59,0,M.gold);break;
    }
    case 'plant': {
      lathe(g,[[.23,0],[.29,.08],[.25,.42],[.2,.46]],M.clay);
      cyl(g,.22,.22,.02,0,.43,0,M.soil);
      cyl(g,.035,.045,.78,0,.81,0,M.wood);
      for(let i=0;i<9;i++){const a=i*2.4;const y=.7+(i%4)*.18;const rr=.23+(i%3)*.07;sphere(g,.13,.29,.075,Math.cos(a)*rr,y,Math.sin(a)*rr,i%2?M.leaf:M.leaf2).rotation.z=-Math.cos(a)*.5;}break;
    }
    case 'vase': {lathe(g,[[.08,0],[.17,.04],[.19,.16],[.14,.37],[.1,.53],[.12,.55]],M.teal);break;}
    case 'box': {box(g,w,h-.04,d,0,(h-.04)/2,0,M.woodLight,.018);box(g,w,.04,d,0,h-.02,0,M.cream,.008);for(const x of [-w*.35,w*.35])box(g,.035,h,.02,x,h/2,d/2+.012,M.wood);break;}
    case 'suitcase': {box(g,w,h,d,0,h/2,0,M.navy,.09);box(g,w-.08,h-.08,.018,0,h/2,d/2+.01,M.teal,.03);box(g,.22,.07,.08,0,h+.03,0,M.black);for(const x of [-.19,.19])cyl(g,.06,.06,.04,x,.05,0,M.rubber);break;}
    case 'bin': {lathe(g,[[.17,0],[.23,.05],[.23,.59],[.25,.61]],M.metal);cyl(g,.24,.24,.035,0,.63,0,M.black);break;}
    case 'bookshelf': {
      box(g,w,h,d,0,h/2,0,M.woodDark,.035);box(g,w-.14,h-.14,d+.01,0,h/2,.025,M.woodLight,.02);
      for(let i=0;i<4;i++){const y=.28+i*.5;box(g,w-.12,.06,d+.03,0,y,0,M.woodDark);if(i<3)for(let j=0;j<7;j++){const hue=[M.clay,M.olive,M.navy,M.cream,M.teal][(i*3+j)%5];box(g,.12+((j*3)%3)*.025,.23+((i+j)%3)*.06,.25,-.58+j*.19,y+.15,-.07,hue,.01);}}break;
    }
    case 'tv': {box(g,w,.82,.065,0,.52,0,M.black,.06);box(g,w-.08,.73,.015,0,.52,.04,M.screen,.025);box(g,.1,.32,.1,0,.17,0,M.metal);box(g,.48,.025,.3,0,.025,0,M.black);break;}
    case 'speaker': {box(g,w,h,d,0,h/2,0,M.woodDark,.04);for(const y of [.24,.61]){const o=cyl(g,y>.4?.12:.08,y>.4?.12:.08,.016,0,y,d/2+.012,M.black,20);o.rotation.x=Math.PI/2;cyl(g,.04,.04,.018,0,y,d/2+.028,M.gold,16).rotation.x=Math.PI/2;}break;}
    case 'microwave': {box(g,w,h,d,0,h/2,0,M.metal,.035);box(g,.36,.23,.015,-.06,.18,d/2+.01,M.screen,.015);box(g,.035,.21,.025,.205,.18,d/2+.022,M.black);for(const y of [.13,.24])cyl(g,.016,.016,.018,.225,y,d/2+.022,M.black,10).rotation.x=Math.PI/2;break;}
    case 'toaster': {box(g,w,h,d,0,h/2,0,M.cream,.07);for(const x of [-.09,.09])box(g,.075,.008,.16,x,h+.005,0,M.black,.002);cyl(g,.018,.018,.02,.17,.14,.06,M.gold).rotation.z=Math.PI/2;break;}
    case 'coffee': {box(g,.25,.29,.26,0,.16,-.025,M.black,.04);cyl(g,.13,.13,.035,0,.36,-.05,M.metal);cyl(g,.08,.08,.12,0,.08,.06,M.glass);box(g,.06,.14,.035,.11,.12,.07,M.black);break;}
    case 'bed': {legs(g,w-.18,d-.2,.17,M.woodDark);box(g,w,.2,d,0,.27,0,M.woodDark);box(g,w-.12,.27,d-.18,0,.5,0,M.white,.08);box(g,w-.1,.055,1.22,0,.68,.43,M.sage,.04);box(g,w,.88,.19,0,.46,-d/2+.05,M.woodLight,.08);for(const x of [-.52,.52])box(g,.8,.12,.4,x,.72,-.62,M.linen,.08);break;}
    case 'cabinet': {box(g,w,h-.1,d,0,(h+.1)/2,0,M.woodLight,.05);legs(g,w-.12,d-.1,.12,M.woodDark);for(const x of [-w*.25,w*.25]){box(g,w*.48,h-.18,.015,x,(h+.1)/2,d/2+.01,M.wood,.02);sphere(g,.025,.025,.025,x+(x<0?.15:-.15),h*.55,d/2+.04,M.gold);}break;}
    case 'toy': {cyl(g,.2,.2,.12,0,.06,0,M.clay);sphere(g,.16,.16,.16,0,.24,0,M.cream);for(const x of [-.11,.11])sphere(g,.06,.08,.06,x,.38,0,M.clay);sphere(g,.05,.04,.02,0,.25,.16,M.black);break;}
    case 'fridge': {box(g,w,h,d,0,h/2,0,M.cream,.07);box(g,w-.04,.025,d+.025,0,.72,0,M.metal,.008);box(g,.035,.34,.045,-.28,1.35,d/2+.03,M.gold);box(g,.035,.27,.045,-.28,.41,d/2+.03,M.gold);break;}
    case 'tub': {box(g,w,.48,d,0,.29,0,M.white,.23);box(g,w-.16,.035,d-.14,0,.55,0,M.glass,.05);cyl(g,.02,.02,.3,-.65,.75,-.29,M.gold);break;}
    case 'sink': {box(g,w,.63,d,0,.34,0,M.woodLight);box(g,w,.09,d,0,.7,0,M.white);sphere(g,.23,.05,.15,0,.76,0,M.glass);cyl(g,.02,.02,.17,0,.89,-.13,M.gold);break;}
    case 'car': {box(g,1.86,.58,3.55,0,.55,0,M.navy,.2);box(g,1.52,.65,1.9,0,1.12,-.18,M.navy,.22);box(g,1.42,.32,.026,0,1.26,.81,M.glass,.04);for(const x of [-.95,.95])for(const z of [-1.14,1.14]){const tire=cyl(g,.34,.34,.19,x,.36,z,M.rubber,16);tire.rotation.z=Math.PI/2;}for(const x of [-.6,.6])sphere(g,.13,.1,.025,x,.64,-1.77,M.cream);break;}
    case 'basket': {lathe(g,[[.18,0],[.27,.06],[.29,.42],[.26,.47]],M.woodLight);cyl(g,.25,.25,.02,0,.45,0,M.woodDark);for(const x of [-.27,.27]){const handle=new THREE.Mesh(new THREE.TorusGeometry(.1,.022,6,12,Math.PI),M.woodDark);handle.position.set(x,.43,0);handle.rotation.y=Math.PI/2;g.add(handle);}for(let i=0;i<8;i++){const a=i*Math.PI/4;box(g,.018,.35,.018,Math.cos(a)*.265,.23,Math.sin(a)*.265,M.cream,.005);}break;}
    case 'toolbox': {box(g,w,.25,d,0,.16,0,M.clay,.045);box(g,w-.02,.07,d+.02,0,.315,0,M.woodDark,.025);for(const x of [-.13,.13])box(g,.04,.12,.04,x,.4,0,M.gold,.01);box(g,.31,.045,.07,0,.45,0,M.gold,.015);for(const x of [-.2,.2])box(g,.04,.09,.025,x,.24,d/2+.012,M.gold,.006);break;}
    case 'fan': {cyl(g,.23,.25,.045,0,.025,0,M.metal);cyl(g,.025,.034,.82,0,.46,0,M.gold);sphere(g,.18,.18,.09,0,1.02,-.04,M.cream);const guard=new THREE.Mesh(new THREE.TorusGeometry(.22,.016,6,24),M.metal);guard.position.set(0,1.02,-.15);g.add(guard);for(let i=0;i<4;i++){const blade=box(g,.085,.32,.025,0,1.02,-.17,M.teal,.025);blade.rotation.z=i*Math.PI/2;}cyl(g,.045,.045,.04,0,1.02,-.18,M.gold).rotation.x=Math.PI/2;break;}
    case 'vacuum': {box(g,.35,.13,.36,0,.08,-.04,M.black,.055);for(const x of [-.17,.17])cyl(g,.06,.06,.04,x,.07,.1,M.rubber).rotation.z=Math.PI/2;box(g,.25,.66,.21,0,.47,.04,M.navy,.08);box(g,.2,.26,.16,0,.64,-.095,M.teal,.06);cyl(g,.027,.027,.48,0,.94,.09,M.metal);box(g,.22,.05,.06,0,1.16,.09,M.black,.02);break;}
    case 'barrel': {cyl(g,.27,.27,.81,0,.43,0,M.navy,18);for(const y of [.12,.43,.74])cyl(g,.28,.28,.045,0,y,0,M.metal,18);cyl(g,.24,.24,.025,0,.85,0,M.woodDark,18);cyl(g,.055,.055,.018,.11,.87,0,M.gold);break;}
    case 'chest': {box(g,w,.42,d,0,.24,0,M.woodLight,.045);box(g,w+.025,.12,d+.025,0,.5,0,M.woodDark,.04);for(const x of [-.31,.31])box(g,.05,.47,d+.04,x,.27,0,M.gold,.015);box(g,.15,.09,.025,0,.29,d/2+.022,M.gold,.012);legs(g,w-.2,d-.13,.07,M.woodDark);break;}
    case 'ottoman': {cyl(g,.34,.35,.34,0,.25,0,M.sage,18);cyl(g,.35,.35,.08,0,.44,0,M.teal,18);for(let i=0;i<8;i++){const a=i*Math.PI/4;box(g,.016,.23,.018,Math.cos(a)*.34,.26,Math.sin(a)*.34,M.olive,.005);}for(const x of [-.22,.22])for(const z of [-.22,.22])box(g,.065,.08,.065,x,.04,z,M.woodDark,.015);break;}
    case 'globe': {cyl(g,.24,.25,.06,0,.04,0,M.woodDark,18);cyl(g,.03,.035,.62,0,.37,0,M.gold,12);sphere(g,.28,.28,.28,0,.81,0,M.blue);for(const y of [.67,.81,.95]){const ring=new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(.28*.28-(y-.81)**2),.008,4,24),M.gold);ring.rotation.x=Math.PI/2;ring.position.y=y;g.add(ring);}sphere(g,.075,.17,.015,.08,.84,-.27,M.sage).rotation.z=.35;break;}
    case 'guitar': {sphere(g,.2,.28,.09,0,.35,0,M.woodLight);sphere(g,.17,.2,.085,0,.57,0,M.woodLight);cyl(g,.07,.07,.018,0,.49,-.092,M.woodDark,18).rotation.x=Math.PI/2;box(g,.085,.54,.055,0,.91,0,M.woodDark,.025);box(g,.14,.18,.055,0,1.22,0,M.woodLight,.025);for(const x of [-.05,0,.05]){box(g,.008,.84,.01,x,.78,-.105,M.cream,.002);sphere(g,.018,.018,.018,x,1.23,-.04,M.gold);}box(g,.28,.04,.15,0,.04,0,M.black,.012);break;}
    case 'hamper': {lathe(g,[[.24,0],[.3,.08],[.31,.68],[.28,.72]],M.cream);cyl(g,.29,.29,.055,0,.7,0,M.woodLight,18);for(const y of [.15,.28,.41,.54])cyl(g,.315,.315,.012,0,y,0,M.woodLight,18);for(const x of [-.31,.31])box(g,.035,.13,.07,x,.69,0,M.gold,.01);sphere(g,.17,.06,.19,0,.76,0,M.teal);break;}
    case 'lantern': {cyl(g,.16,.16,.04,0,.04,0,M.woodDark,12);cyl(g,.13,.16,.07,0,.43,0,M.gold,12);for(const x of [-.11,.11])for(const z of [-.11,.11])box(g,.018,.38,.018,x,.24,z,M.gold,.004);cyl(g,.115,.115,.34,0,.23,0,M.glass,12);sphere(g,.06,.09,.06,0,.2,0,M.cream);const handle=new THREE.Mesh(new THREE.TorusGeometry(.085,.014,6,16,Math.PI),M.woodDark);handle.position.y=.48;g.add(handle);break;}
    case 'sideboard': {legs(g,w-.12,d-.08,.14,M.woodDark);box(g,w,.72,d,0,.53,0,M.woodLight,.055);box(g,w+.03,.06,d+.035,0,.91,0,M.woodDark,.025);for(const x of [-.3,.3]){box(g,.55,.59,.022,x,.53,d/2+.013,M.cream,.025);sphere(g,.026,.026,.026,x+(x<0?.16:-.16),.54,d/2+.04,M.gold);}for(const x of [-.42,.42])box(g,.08,.05,.2,x,.95,0,M.gold,.015);break;}
  }
}
function decorateWorld(scene:THREE.Scene):void {
  const g=new THREE.Group();g.name='Décor fin de la maison';scene.add(g);
  const book=(x:number,y:number,z:number,m:THREE.Material,rotation=0)=>{const b=box(g,.25,.035,.18,x,y,z,m,.008);b.rotation.y=rotation;};
  const cup=(x:number,y:number,z:number,m:THREE.Material)=>{cyl(g,.055,.045,.095,x,y,z,m,12);cyl(g,.051,.051,.008,x,y+.052,z,M.cream,12);};
  const frame=(x:number,y:number,z:number,w:number,h:number,m:THREE.Material)=>{box(g,w+.08,h+.08,.035,x,y,z,M.woodDark,.008);box(g,w,h,.042,x,y,z-.025,m,.008);box(g,w*.38,.025,.047,x-.11,y-.07,z-.052,M.gold,.004);};
  const botanical=(x:number,y:number,z:number,accent:THREE.Material)=>{
    box(g,1.08,.78,.045,x,y,z,M.woodDark,.014);
    box(g,.98,.68,.052,x,y,z+.026,M.cream,.008);
    const stem=box(g,.025,.46,.015,x,y-.02,z+.062,M.olive,.005);stem.rotation.z=-.18;
    for(const [dx,dy,turn] of [[-.16,-.05,-.5],[.14,.03,.5],[-.11,.18,-.4],[.1,.27,.4]] as const){
      const leaf=sphere(g,.13,.055,.018,x+dx,y+dy,z+.078,accent);leaf.rotation.z=turn;
    }
    sphere(g,.09,.09,.022,x+.17,y-.21,z+.08,M.gold);
  };
  // Salon : textile, livres et petits objets posés sur des surfaces existantes.
  for(const z of [6.25,8.05]){box(g,.07,1.53,.28,-13.72,1.6,z,M.linen,.02);box(g,.08,.07,.29,-13.71,2.35,z,M.gold,.01);}
  box(g,.46,.13,.42,-11.75,.75,7.35,M.peach,.08);box(g,.45,.12,.39,-10.55,.75,7.24,M.plum,.08);
  box(g,.27,.025,.18,-8.93,.86,7.23,M.black,.008);book(-8.53,.85,7.04,M.blue,.18);
  cyl(g,.22,.17,.075,-9.05,.87,6.95,M.cream,16);sphere(g,.065,.07,.065,-9.12,.94,6.93,M.clay);sphere(g,.055,.065,.055,-8.98,.94,6.98,M.gold);
  for(let i=0;i<5;i++)book(-6.38,1.02+i*.045,8.62,[M.clay,M.cream,M.blue,M.olive,M.gold][i],.13);
  frame(-10.2,1.73,3.84,1.13,.69,M.peach);frame(-7.15,1.72,3.84,.9,.64,M.sage);
  // Lambris bas : variation de relief sans changer les collisions ni les passages.
  for(const z of [9.77,3.88]){
    box(g,8.2,.055,.035,-9.5,1.08,z,M.woodLight,.012);
    for(const x of [-13.15,-11.9,-10.65,-9.4,-8.15,-6.9,-5.65]){
      box(g,.035,.74,.034,x,.63,z,M.woodLight,.009);
      box(g,.94,.018,.035,x+.48,.28,z,M.cream,.004);
    }
  }
  for(const x of [-13.72,-5.28]){box(g,.035,.055,5.6,x,1.08,7,M.woodLight,.012);for(const z of [4.55,5.85,7.15,8.45])box(g,.035,.74,.035,x,.63,z,M.woodLight,.008);}
  // Salle à manger : centre de table et vaisselle.
  cyl(g,.28,.19,.065,-9.6,.87,.2,M.cream,18);for(const [x,z,m] of [[-9.68,.18,M.clay],[-9.49,.2,M.gold],[-9.58,.31,M.leaf2]] as const)sphere(g,.07,.075,.07,x,.94,z,m);
  for(const [x,z] of [[-10.15,-.1],[-9.1,.48]]){cyl(g,.13,.13,.012,x,.84,z,M.white,16);cup(x+.18,.89,z-.06,M.teal);}
  // Cuisine : bocaux, vaisselle, fruits, planche et torchon sur le plan de travail.
  box(g,.58,.035,.32,8.26,.81,-2.48,M.woodLight,.012);for(const [x,m] of [[7.42,M.clay],[7.65,M.gold],[7.88,M.leaf2]] as const)sphere(g,.09,.08,.09,x,.86,-2.41,m);
  for(const x of [8.85,9.15]){cyl(g,.085,.085,.22,x,.88,-2.51,M.glass,12);cyl(g,.09,.09,.022,x,1.01,-2.51,M.gold,12);}
  for(let ix=0;ix<14;ix++)for(let iy=0;iy<3;iy++){
    const x=6.95+ix*.38,y=1.02+iy*.18;
    box(g,.355,.155,.022,x,y,-2.79,(ix+iy)%7===0?M.teal:M.cream,.006);
  }
  for(const z of [-.7,-.45,-.2])cyl(g,.15,.15,.014,12.8,.81,z,M.white,16);
  box(g,.3,.3,.025,12.67,.52,1.1,M.linen,.015);box(g,.42,.025,.18,12.75,.81,1.42,M.woodDark,.008);
  // Chambres : tissus supplémentaires, objets de chevet et cadres doux.
  for(const [x,z,side] of [[-11.1,-7.4,-1],[10.7,-7.4,1]] as const){
    box(g,1.33,.027,.52,x,.69,z+.26,M.peach,.015);box(g,1.14,.026,.2,x,.707,z+.02,M.cream,.012);
    box(g,.38,.10,.27,x-.47,.76,z-.62,M.white,.06);box(g,.38,.10,.27,x+.47,.76,z-.62,M.white,.06);
    frame(x+side*.7,1.73,-9.77,.85,.54,side<0?M.teal:M.clay);
    for(const px of [x-1.2,x,x+1.2])box(g,.025,.64,.026,px,.56,-9.76,M.woodLight,.006);
    box(g,3.7,.045,.028,x,1.04,-9.76,M.woodLight,.01);
  }
  cup(-12.8,1.63,-4.25,M.plum);book(-12.55,1.64,-4.27,M.cream);cup(12.8,1.63,-4.35,M.blue);
  for(const x of [-7.6,8.3]){box(g,.025,1.28,.4,x,1.6,-9.72,M.linen,.008);box(g,.03,.04,.45,x,2.25,-9.72,M.gold,.006);}
  // Salle de bains : miroir encadré, produits et serviettes.
  box(g,1.08,1.27,.055,2.8,1.82,-9.73,M.gold,.025);box(g,.92,1.11,.062,2.8,1.82,-9.685,M.glass,.015);
  for(const [x,m] of [[2.47,M.teal],[2.68,M.cream],[3.02,M.plum]] as const){cyl(g,.045,.05,.18,x,.86,-7.79,m,12);cyl(g,.05,.05,.015,x,.96,-7.79,M.gold,12);}
  box(g,.58,.035,.045,4.77,1.15,-8.1,M.gold,.01);box(g,.5,.52,.035,4.77,.86,-8.1,M.linen,.012);box(g,.29,.34,.025,4.77,.88,-7.63,M.teal,.01);
  // Galerie et entrée : console, cadres et objets légers.
  for(const [x,z,m] of [[-2.4,3.84,M.peach],[1.9,3.84,M.plum],[3.1,-2.84,M.blue]] as const)frame(x,1.66,z,.67,.53,m);
  botanical(-1.95,1.72,4.17,M.sage);botanical(1.95,1.72,4.17,M.clay);
  for(const x of [-3.65,3.65]){
    box(g,.19,.31,.085,x,1.86,4.18,M.gold,.035);
    cyl(g,.14,.19,.19,x,2.07,4.21,M.warm,16);
  }
  cup(1.5,1.02,-.4,M.clay);book(2.05,1.02,-.41,M.cream,.21);
  box(g,1.58,.012,.42,-1.15,.03,6.1,M.sage,.01);box(g,1.17,.015,.023,-1.15,.05,6.1,M.cream,.004);
  // Garage : rangements suspendus et pièces mécaniques, sans obstacle caché au sol.
  for(const x of [8.1,8.72,9.34,9.96]){box(g,.42,.055,.33,x,1.25,9.66,M.woodLight,.01);box(g,.06,.2,.06,x,1.39,9.64,M.metal,.012);}
  cyl(g,.38,.38,.12,13.54,1.25,8.18,M.rubber,20).rotation.z=Math.PI/2;
  cyl(g,.17,.17,.13,13.46,1.25,8.18,M.metal,20).rotation.z=Math.PI/2;
  box(g,.58,.32,.055,13.65,1.87,6.76,M.woodDark,.012);for(let i=0;i<3;i++)box(g,.12,.05,.065,13.6,1.74+i*.11,6.76,M.gold,.007);
  // Les détails partagent leurs matériaux : un groupe compact limite les appels de rendu.
  compact(g);for(const child of g.children)if(child instanceof THREE.Mesh)child.castShadow=false;
}
export function buildWorld():World {
  const scene=new THREE.Scene();scene.background=new THREE.Color('#c6d8d5');scene.fog=new THREE.Fog('#c6d8d5',24,46);
  const hemi=new THREE.HemisphereLight('#e9f4e9','#695d56',1.65);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#ffe9cc',2.45);sun.position.set(-7,17,11);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-19;sun.shadow.camera.right=19;sun.shadow.camera.top=17;sun.shadow.camera.bottom=-17;sun.shadow.camera.near=.5;sun.shadow.camera.far=45;sun.shadow.normalBias=.04;scene.add(sun);
  const floorMaterial=new Map<string,THREE.MeshStandardMaterial>();
  for(const r of rooms){
    let fm=floorMaterial.get(r.color);if(!fm){fm=mat(r.color,.9);fm.map=['Salle de bains','Garage','Cuisine'].includes(r.name)?tileTexture:woodFloorTexture;floorMaterial.set(r.color,fm);}
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(r.w-.12,r.d-.12),fm);floor.rotation.x=-Math.PI/2;floor.position.set(r.x,.005,r.z);floor.receiveShadow=true;scene.add(floor);
    const base=new THREE.Group();base.position.set(r.x,0,r.z);scene.add(base);
    // Lames de parquet et plinthes : relief discret sans textures externes.
    if(!['Salle de bains','Garage'].includes(r.name))for(let z=-r.d/2+.55;z<r.d/2;z+=.72)box(base,r.w-.2,.015,.015,0,.018,z,M.woodLight,.004);
    if(['Grand salon','Chambre sauge','Chambre terracotta','Salle à manger'].includes(r.name)){
      const rugMat=mat(r.name==='Grand salon'?'#ad9b80':'#a8a99a',1);rugMat.map=fabricTexture;
      const rug=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(r.w-2,4),Math.min(r.d-1.4,3)),rugMat);rug.rotation.x=-Math.PI/2;rug.position.set(r.name==='Grand salon'?-.4:0,.03,.2);base.add(rug);
      for(const x of [-1.85,1.85])box(base,.035,.015,2.8,x,.036,.2,M.cream,.004);
    }
  }
  const solids:THREE.Object3D[]=[];
  for(const w of walls){const g=new THREE.Group();scene.add(g);const y=w.h<1?2.79:w.h/2;const o=box(g,w.w,w.h,w.d,w.x,y,w.z,M.wall,.02);o.castShadow=false;o.receiveShadow=true;solids.push(o);if(w.h>1){const trim=box(g,w.w+.04,.12,w.d+.04,w.x,.08,w.z,M.trim,.015);trim.castShadow=false;}}
  // Cadres d'ouvertures et panneaux décoratifs, collés aux murs.
  for(const x of [-5,5])for(const z of [-6.5,.5,7]){const frame=new THREE.Group();frame.position.set(x,0,z);scene.add(frame);for(const q of [-1.25,1.25])box(frame,.08,2.65,.08,0,1.33,q,M.woodLight,.01);box(frame,.08,.1,2.56,0,2.66,0,M.woodLight,.01);}
  for(const z of [-3,4])for(const x of [-9.5,0,9.5]){const frame=new THREE.Group();frame.position.set(x,0,z);scene.add(frame);for(const q of [-1.25,1.25])box(frame,.08,2.65,.08,q,1.33,0,M.woodLight,.01);box(frame,2.56,.1,.08,0,2.66,0,M.woodLight,.01);}
  for(const x of [-11.3,-7,7.1,11.2]){const g=new THREE.Group();scene.add(g);box(g,1.55,1.14,.06,x,1.67,-9.84,M.woodLight);box(g,1.38,.98,.03,x,1.67,-9.79,M.glass);box(g,.04,1.04,.045,x,1.67,-9.76,M.white);box(g,1.42,.04,.045,x,1.67,-9.76,M.white);}
  for(const [x,z] of [[-13.83,-6.5],[-13.83,.4],[-13.83,7.1],[13.83,0]]){const g=new THREE.Group();scene.add(g);box(g,.04,1.15,1.52,x,1.68,z,M.woodLight);box(g,.035,1.01,1.38,x+(x>0?-.026:.026),1.68,z,M.glass);}
  // Décor architectural : tableaux en relief, luminaires, cuisine et garage.
  for(const [x,z,w,h,c] of [[-12.7,-2.84,1.3,.82,M.clay],[-8.2,-2.84,1.05,.72,M.olive],[-2.5,3.84,1.32,.7,M.navy],[8.1,3.84,1.42,.76,M.sage],[-11.9,3.84,1.24,.79,M.teal]] as const){
    const g=new THREE.Group();scene.add(g);box(g,w+.1,h+.1,.07,x,1.7,z,M.woodDark,.015);box(g,w,h,.08,x,1.7,z+(z>0?-.04:.04),c,.015);
    const accent=new THREE.Mesh(new THREE.TorusGeometry(Math.min(w,h)*.27,.035,6,20),M.gold);accent.position.set(x,1.7,z+(z>0?-.09:.09));g.add(accent);
  }
  for(const [x,z] of [[-9.5,.5],[-9.2,7.2],[9.5,.4],[0,7]]){
    const g=new THREE.Group();scene.add(g);cyl(g,.025,.025,.42,x,2.78,z,M.gold);cyl(g,.31,.12,.19,x,2.5,z,M.cream);cyl(g,.13,.13,.02,x,2.39,z,M.gold);
  }
  // Plans de travail continus qui cadrent la cuisine sans bloquer les portes.
  for(const [x,z,w,d] of [[8.1,-2.48,3.5,.55],[12.95,.1,.55,3.7]] as const){const g=new THREE.Group();scene.add(g);box(g,w,.68,d,x,.36,z,M.woodLight,.035);box(g,w,.065,d,x,.73,z,M.cream,.025);}
  // Rail de rangement et outils stylisés dans le garage.
  {const g=new THREE.Group();scene.add(g);box(g,3.1,1.15,.06,9.5,1.75,9.82,M.woodDark,.015);for(let i=0;i<7;i++){const x=8.3+i*.38;box(g,.05,.55,.08,x,1.72,9.72,i%2?M.metal:M.gold,.01);box(g,.23,.065,.08,x,1.43,9.69,M.metal,.015);}}
  const propMeshes=new Map<string,THREE.Group>();
  for(const p of props){const g=new THREE.Group();g.name=p.id;g.position.set(p.x,0,p.z);g.rotation.y=p.yaw;detail(g,p);compact(g);scene.add(g);propMeshes.set(p.id,g);}
  const shadow=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:contactShadowTexture(),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),props.length);
  const marker=new THREE.Object3D();for(let i=0;i<props.length;i++){const p=props[i];marker.position.set(p.x,.021,p.z);marker.rotation.set(-Math.PI/2,0,0);marker.scale.set(Math.max(.5,p.w*1.45),Math.max(.5,p.d*1.45),1);marker.updateMatrix();shadow.setMatrixAt(i,marker.matrix);}shadow.instanceMatrix.needsUpdate=true;shadow.frustumCulled=false;scene.add(shadow);
  decorateWorld(scene);
  // Lumières locales peu coûteuses : seuls le soleil et ses ombres sont dynamiques.
  const lights:THREE.Light[]=[];for(const [x,z,c] of [[-9,6,'#ffd6ab'],[9,0,'#e7f4dc'],[-9,-6,'#f8ddbd'],[0,-6,'#d6f2ed']] as const){const l=new THREE.PointLight(c,7,7,2);l.position.set(x,2.65,z);scene.add(l);lights.push(l);}
  return {scene,propMeshes,solids,lights};
}
export function makePropClone(p:PropDef):THREE.Group {const g=new THREE.Group();detail(g,p);compact(g);return g;}
