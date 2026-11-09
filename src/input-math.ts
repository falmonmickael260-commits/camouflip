export function radialStick(dx:number,dy:number,radius:number):{x:number;z:number;visualX:number;visualY:number} {
  const magnitude=Math.hypot(dx,dy),raw=Math.min(1,magnitude/Math.max(radius,1));
  const dead=.16,amount=raw<=dead?0:Math.pow((raw-dead)/(1-dead),1.08);
  const nx=magnitude?dx/magnitude:0,nz=magnitude?dy/magnitude:0;
  return {x:nx*amount,z:nz*amount,visualX:nx*raw*radius,visualY:nz*raw*radius};
}
