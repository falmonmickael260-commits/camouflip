import { clamp, props, walls, type PropDef } from './shared';

export function propCameraDistance(prop:PropDef|null):number {
  return prop?clamp(3.5+Math.max(prop.w,prop.d)*.28,3.55,4.18):3.65;
}

export interface Point3 {x:number;y:number;z:number}
function rayBox(origin:Point3,dir:Point3,length:number,cx:number,cy:number,cz:number,hw:number,hh:number,hd:number,yaw=0):number {
  const c=Math.cos(yaw),s=Math.sin(yaw),ox=origin.x-cx,oz=origin.z-cz;
  const localOrigin=[ox*c+oz*s,origin.y-cy,-ox*s+oz*c];
  const localDir=[dir.x*c+dir.z*s,dir.y,-dir.x*s+dir.z*c];
  const half=[hw,hh,hd];let near=0,far=length;
  for(let i=0;i<3;i++){
    const o=localOrigin[i],d=localDir[i],h=half[i];
    if(Math.abs(d)<1e-7){if(o< -h||o>h)return Infinity;continue;}
    let a=(-h-o)/d,b=(h-o)/d;if(a>b)[a,b]=[b,a];
    near=Math.max(near,a);far=Math.min(far,b);
    if(near>far)return Infinity;
  }
  return near;
}
export function clearCameraDistance(focus:Point3,wanted:Point3,ignorePropId:string|null,padding=.18):number {
  const dx=wanted.x-focus.x,dy=wanted.y-focus.y,dz=wanted.z-focus.z;
  const length=Math.hypot(dx,dy,dz);if(length<.001)return 0;
  const dir={x:dx/length,y:dy/length,z:dz/length};let nearest=length;
  for(const w of walls){const y=w.h<1?2.79:w.h/2;const hit=rayBox(focus,dir,nearest,w.x,y,w.z,w.w/2,w.h/2,w.d/2);if(hit<nearest)nearest=hit;}
  for(const p of props){if(!p.solid||p.id===ignorePropId)continue;
    if(Math.hypot(p.x-focus.x,p.z-focus.z)>length+Math.max(p.w,p.d))continue;
    const hit=rayBox(focus,dir,nearest,p.x,p.h/2,p.z,p.w/2,p.h/2,p.d/2,p.yaw);
    if(hit<nearest)nearest=hit;
  }
  return Math.max(.28,nearest-padding);
}
