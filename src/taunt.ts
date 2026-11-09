import { walls } from './shared';

export const TAUNT_COOLDOWN_MS=12_000;
export const TAUNT_RANGE=15;
export const TAUNT_VARIANTS=5;

// Only full-height walls block sound. Door gaps remain open, including their low lintels.
export function soundWallCount(ax:number,az:number,bx:number,bz:number):number {
  const dx=bx-ax,dz=bz-az;
  let count=0;
  for(const wall of walls){
    if(wall.h<1)continue;
    let near=0,far=1;
    for(const [origin,delta,min,max] of [[ax,dx,wall.x-wall.w/2,wall.x+wall.w/2],[az,dz,wall.z-wall.d/2,wall.z+wall.d/2]]){
      if(Math.abs(delta)<1e-8){if(origin<min||origin>max){near=2;break;}continue;}
      let a=(min-origin)/delta,b=(max-origin)/delta;
      if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);
    }
    if(near<=far&&near<1&&far>0)count++;
  }
  return count;
}

export function tauntAcoustics(listenerX:number,listenerZ:number,sourceX:number,sourceZ:number):{audible:boolean;distance:number;walls:number;gain:number;lowpassHz:number} {
  const distance=Math.hypot(sourceX-listenerX,sourceZ-listenerZ);
  if(distance>=TAUNT_RANGE)return {audible:false,distance,walls:0,gain:0,lowpassHz:0};
  const walls=soundWallCount(listenerX,listenerZ,sourceX,sourceZ);
  const distanceGain=Math.min(1,Math.max(0,(TAUNT_RANGE-distance)/(TAUNT_RANGE-1.2)));
  const wallGain=walls>1?.18:walls===1?.36:1;
  return {audible:true,distance,walls,gain:.64*distanceGain*wallGain,lowpassHz:walls>1?650:walls===1?1100:8500};
}
