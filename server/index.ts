import { WebSocketServer, type WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { clamp, collides, movementRadius, props, SPAWNS, stepKinematic, walls, type ClientMessage, type Phase, type PlayerState, type ServerMessage, type Snapshot } from '../src/shared.js';

type Actor = PlayerState & { socket?: WebSocket; ix: number; iz: number; run: boolean; viewYaw:number; vx:number; vz:number; lastInput: number; lastShot: number; aiNext: number; aiTarget: {x:number;z:number}|null };
type Room = { code: string; players: Map<string,Actor>; phase: Phase; endsAt: number; round: number; hunterId: string|null; hostId: string; rotation: string[] };
const rooms = new Map<string,Room>();
const clients = new Map<WebSocket,{room:Room;id:string}>();
const PORT=Number(process.env.PORT||8788);
const HIDE_MS=Number(process.env.HIDE_MS||30_000);
const HUNT_MS=Number(process.env.HUNT_MS||180_000);
const staticRoot=resolve(process.cwd(),'dist');
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.m4a':'audio/mp4','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
const httpServer=createServer(async(req,res)=>{
  if(req.url==='/health'){res.writeHead(200,{'content-type':'text/plain; charset=utf-8'});res.end('ok');return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  let path:string;
  try{path=decodeURIComponent(new URL(req.url||'/','http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
  if(path==='/')path='/index.html';
  const file=resolve(staticRoot,`.${path}`);
  if(!file.startsWith(staticRoot+sep)){res.writeHead(403);res.end();return;}
  try{
    const body=await readFile(file);
    const cache=path==='/index.html'?'no-cache':path.startsWith('/assets/')?'public, max-age=31536000, immutable':'public, max-age=3600';
    res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','content-length':body.length,'cache-control':cache});
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Ressource introuvable');}
});
const wss=new WebSocketServer({server:httpServer});
httpServer.listen(PORT,'0.0.0.0',()=>console.log(`Maison Masquée • HTTP + WebSocket sur le port ${PORT}`));

function send(ws:WebSocket,msg:ServerMessage):void { if(ws.readyState===ws.OPEN) ws.send(JSON.stringify(msg)); }
function broadcast(room:Room,msg:ServerMessage):void { for(const p of room.players.values()) if(p.socket) send(p.socket,msg); }
const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code():string {
  let value='';
  do{value=Array.from(randomBytes(4),byte=>CODE_ALPHABET[byte&31]).join('');}while(rooms.has(value));
  return value;
}
function cleanName(s:unknown):string { return String(s||'Joueur').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,18)||'Joueur'; }
function spawn(i:number):{x:number;z:number} {
  for(let k=0;k<SPAWNS.length;k++) { const q=SPAWNS[(i+k)%SPAWNS.length]; if(!collides(q.x,q.z,.36)) return q; }
  return {x:0,z:6};
}
function actor(id:string,name:string,bot:boolean,i:number):Actor { const q=spawn(i); return {id,name,bot,x:q.x,z:q.z,yaw:0,pitch:0,role:'prop',disguise:null,locked:false,alive:true,hp:100,score:0,moving:0,ix:0,iz:0,run:false,viewYaw:0,vx:0,vz:0,lastInput:0,lastShot:0,aiNext:0,aiTarget:null}; }
function snapshot(room:Room):Snapshot { return {type:'snapshot',code:room.code,phase:room.phase,endsAt:room.endsAt,round:room.round,hunterId:room.hunterId,hostId:room.hostId,players:[...room.players.values()].map(({id,name,x,z,yaw,pitch,role,disguise,locked,alive,hp,score,bot,moving})=>({id,name,x,z,yaw,pitch,role,disguise,locked,alive,hp,score,bot,moving})),connected:[...room.players.values()].filter(p=>!p.bot).length}; }
function start(room:Room):void {
  if(room.players.size<2) return;
  room.round++;
  const ids=[...room.players.keys()];
  if(!room.rotation.length) room.rotation=ids.sort(()=>Math.random()-.5);
  else room.rotation=room.rotation.filter(id=>room.players.has(id)).concat(ids.filter(id=>!room.rotation.includes(id)));
  room.hunterId=room.rotation[(room.round-1)%room.rotation.length];
  room.phase='hide'; room.endsAt=Date.now()+HIDE_MS;
  let i=0; for(const p of room.players.values()) { const q=spawn(i++); Object.assign(p,{x:q.x,z:q.z,yaw:0,viewYaw:0,vx:0,vz:0,role:p.id===room.hunterId?'hunter':'prop',disguise:null,locked:false,alive:true,hp:100,ix:0,iz:0,moving:0,aiTarget:null}); }
  broadcast(room,snapshot(room));
}
function finish(room:Room):void { if(room.phase==='results') return; room.phase='results';room.endsAt=0;for(const p of room.players.values()) if(p.role==='prop'&&p.alive) p.score+=100; broadcast(room,snapshot(room)); }
function maybeFinish(room:Room):void { if(room.phase==='hunt' && ![...room.players.values()].some(p=>p.role==='prop'&&p.alive)) finish(room); }
function validProp(room:Room,p:Actor,id:string):boolean { const d=props.find(q=>q.id===id); return !!d?.morph && Math.hypot(p.x-d.x,p.z-d.z)<2.25 && ![...room.players.values()].some(q=>q.id!==p.id&&q.alive&&q.disguise===id); }
function morph(room:Room,p:Actor,id:string):void { if(p.role!=='prop'||!p.alive||!['hide','hunt'].includes(room.phase)||!validProp(room,p,id)) return; const d=props.find(q=>q.id===id)!; p.disguise=id;p.locked=false;p.yaw=d.yaw;p.x=d.x;p.z=d.z;p.vx=p.vz=0;broadcast(room,{type:'event',event:'morph',x:p.x,z:p.z,id:p.id}); }
function alignDisguise(p:Actor):void {
  const d=props.find(q=>q.id===p.disguise);if(!d)return;
  const originalDistance=Math.hypot(p.x-d.x,p.z-d.z);
  if(originalDistance<.4){p.x=d.x;p.z=d.z;p.yaw=d.yaw;return;}
  let best:{x:number;z:number;distance:number}|null=null;
  for(const w of walls){if(w.h<1)continue;const vertical=w.w<w.d;
    for(const side of [-1,1]){
      const x=vertical?w.x+side*(w.w/2+d.w/2+.12):p.x;
      const z=vertical?p.z:w.z+side*(w.d/2+d.d/2+.12);
      const dist=Math.hypot(x-p.x,z-p.z);
      if(dist>.55||(best&&dist>=best.distance))continue;
      if(vertical&&Math.abs(z-w.z)>w.d/2-.2)continue;
      if(!vertical&&Math.abs(x-w.x)>w.w/2-.2)continue;
      if(!collides(x,z,movementRadius(p.disguise),p.disguise))best={x,z,distance:dist};
    }
  }
  if(best){p.x=best.x;p.z=best.z;}
}
function lineBlock(x:number,z:number,dx:number,dz:number,max:number,eye:number,dy:number,room:Room):number {
  let nearest=max;
  const occupied=new Set([...room.players.values()].filter(p=>p.alive&&p.disguise).map(p=>p.disguise));
  const boxes=[...walls.filter(w=>w.h>1).map(w=>({x:w.x,z:w.z,w:w.w,d:w.d,h:w.h})),...props.filter(p=>p.solid&&!occupied.has(p.id)).map(p=>({x:p.x,z:p.z,w:p.w,d:p.d,h:p.h}))];
  for(const b of boxes) {
    let t0=0,t1=nearest;
    for(const [o,v,min,maxi] of [[x,dx,b.x-b.w/2,b.x+b.w/2],[z,dz,b.z-b.d/2,b.z+b.d/2]]) {
      if(Math.abs(v)<1e-6) {if(o<min||o>maxi){t0=Infinity;break;}} else {let a=(min-o)/v,c=(maxi-o)/v;if(a>c)[a,c]=[c,a];t0=Math.max(t0,a);t1=Math.min(t1,c);}
    }
    if(t0<=t1 && t0>=0 && eye+dy*t0>=0 && eye+dy*t0<=b.h) nearest=Math.min(nearest,t0);
  }
  return nearest;
}
function fire(room:Room,p:Actor):void {
  const now=Date.now(); if(room.phase!=='hunt'||p.role!=='hunter'||!p.alive||now-p.lastShot<350) return;
  p.lastShot=now;
  const dx=-Math.sin(p.yaw)*Math.cos(p.pitch),dz=-Math.cos(p.yaw)*Math.cos(p.pitch),dy=Math.sin(p.pitch),eye=1.55;
  const block=lineBlock(p.x,p.z,dx,dz,24,eye,dy,room);
  let target:Actor|null=null,best=block;
  for(const other of room.players.values()) {
    if(other.role!=='prop'||!other.alive) continue;
    const d=other.disguise?props.find(q=>q.id===other.disguise):null;
    const radius=d?Math.max(.3,Math.min(.82,Math.max(d.w,d.d)*.46)):.4;
    const cy=d?d.h*.5:.95;
    const ox=other.x-p.x,oz=other.z-p.z,oy=cy-eye;
    const along=ox*dx+oz*dz+oy*dy;
    if(along<=0||along>=best) continue;
    const distance=Math.hypot(ox-dx*along,oz-dz*along,oy-dy*along);
    if(distance<radius) {target=other;best=along;}
  }
  broadcast(room,{type:'event',event:'fire',x:p.x+dx*Math.min(best,block),z:p.z+dz*Math.min(best,block),id:p.id,target:target?.id});
  if(target) {target.hp-=50;p.score+=25;broadcast(room,{type:'event',event:'hit',x:target.x,z:target.z,id:target.id});if(target.hp<=0){target.alive=false;target.disguise=null;p.score+=75;broadcast(room,{type:'event',event:'eliminate',x:target.x,z:target.z,id:target.id});maybeFinish(room);}}
  else {p.hp=Math.max(0,p.hp-8);broadcast(room,{type:'event',event:'penalty',x:p.x,z:p.z,id:p.id});if(p.hp<=0) finish(room);}
}
function addHuman(ws:WebSocket,room:Room,name:string):void { const id=randomBytes(6).toString('hex');const p=actor(id,name,false,room.players.size);p.socket=ws;room.players.set(id,p);clients.set(ws,{room,id});send(ws,{type:'welcome',id,code:room.code});broadcast(room,snapshot(room)); }
function roomIndex(x:number,z:number):number {return (z < -3?0:z<4?1:2)*3+(x < -5?0:x<5?1:2);}
function navWaypoint(x:number,z:number,tx:number,tz:number):{x:number;z:number} {
  const a=roomIndex(x,z),b=roomIndex(tx,tz);if(a===b)return {x:tx,z:tz};
  const queue=[a],previous=new Map<number,number>([[a,-1]]);
  while(queue.length){const n=queue.shift()!;if(n===b)break;for(const v of [n-3,n+3,n%3? n-1:-1,n%3<2?n+1:-1])if(v>=0&&v<9&&!previous.has(v)){previous.set(v,n);queue.push(v);}}
  let next=b;while(previous.get(next)!==a&&previous.get(next)!==-1)next=previous.get(next)!;
  const row=Math.floor(a/3),col=a%3,nextRow=Math.floor(next/3),nextCol=next%3;
  if(nextRow===row){const boundary=nextCol>col?[-5,5][col]:[-5,5][nextCol];return {x:boundary+(nextCol>col?1:-1)*.8,z:[-6.5,.5,7][row]};}
  const boundary=nextRow>row?[-3,4][row]:[-3,4][nextRow];return {x:[-9.5,0,9.5][col],z:boundary+(nextRow>row?1:-1)*.8};
}
wss.on('connection',ws=>{
  ws.on('message',raw=>{
    let msg:ClientMessage;try{msg=JSON.parse(String(raw));}catch{return;}
    if(!msg||typeof msg.type!=='string') return;
    const session=clients.get(ws);
    if(!session) {
      if(msg.type==='create') {const c=code();const room:Room={code:c,players:new Map(),phase:'lobby',endsAt:0,round:0,hunterId:null,hostId:'',rotation:[]};rooms.set(c,room);addHuman(ws,room,cleanName(msg.name));room.hostId=clients.get(ws)!.id;const bots=clamp(Math.floor(Number(msg.bots)||0),0,6);for(let i=0;i<bots;i++){const b=actor(`bot-${randomBytes(4).toString('hex')}`,['Milo','Luna','Nina','Oscar','Noé','Iris'][i],true,i+1);room.players.set(b.id,b);}broadcast(room,snapshot(room));return;}
      if(msg.type==='join') {const requested=String(msg.code||'').trim().toUpperCase();const room=requested.length===4?rooms.get(requested):undefined;if(!room||room.phase!=='lobby'||room.players.size>=7){send(ws,{type:'error',message:'Code à 4 caractères invalide, salon introuvable ou complet (7 joueurs maximum).'});return;}addHuman(ws,room,cleanName(msg.name));return;}
      return;
    }
    const {room,id}=session,p=room.players.get(id);if(!p)return;
    switch(msg.type) {
      case 'start': if(id===room.hostId&&room.phase==='lobby')start(room);break;
      case 'next': if(id===room.hostId&&room.phase==='results')start(room);break;
      case 'input': if(!p.alive)break;p.ix=clamp(Number(msg.x)||0,-1,1);p.iz=clamp(Number(msg.z)||0,-1,1);p.viewYaw=clamp(Number(msg.yaw)||0,-1000,1000);if(p.role==='hunter')p.yaw=p.viewYaw;p.pitch=clamp(Number(msg.pitch)||0,-1.25,1.25);p.run=!!msg.run;p.lastInput=Date.now();break;
      case 'morph': morph(room,p,String(msg.propId));break;
      case 'unmorph': if(p.role==='prop'&&p.alive){p.disguise=null;p.locked=false;p.vx=p.vz=0;}break;
      case 'lock': if(p.role==='prop'&&p.disguise){p.locked=!!msg.locked;if(p.locked){p.vx=p.vz=0;alignDisguise(p);}}break;
      case 'fire': fire(room,p);break;
    }
  });
  ws.on('close',()=>{const s=clients.get(ws);if(!s)return;clients.delete(ws);s.room.players.delete(s.id);if(s.room.hostId===s.id)s.room.hostId=[...s.room.players.values()].find(p=>!p.bot)?.id||'';if(![...s.room.players.values()].some(p=>!p.bot)){rooms.delete(s.room.code);return;}maybeFinish(s.room);broadcast(s.room,snapshot(s.room));});
});

function botTick(room:Room,p:Actor,dt:number):void {
  if(room.phase==='hide'&&p.role==='hunter')return;
  const now=Date.now();
  if(p.role==='prop' && !p.disguise && now>p.aiNext){const choices=props.filter(q=>q.morph&&Math.hypot(p.x-q.x,p.z-q.z)<5);const q=choices[Math.floor(Math.random()*choices.length)];if(q){p.aiTarget={x:q.x,z:q.z};p.aiNext=now+4000;}}
  if(p.role==='hunter'){
    const targets=[...room.players.values()].filter(q=>q.role==='prop'&&q.alive&&(!q.disguise||q.moving>.35||Math.hypot(q.x-p.x,q.z-p.z)<1.4));
    const nearest=targets.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
    if(nearest){const distance=Math.hypot(nearest.x-p.x,nearest.z-p.z);if(distance<8){p.aiTarget={x:nearest.x,z:nearest.z};if(now-p.lastShot>1100){p.yaw=Math.atan2(-(nearest.x-p.x),-(nearest.z-p.z));const h=nearest.disguise?props.find(q=>q.id===nearest.disguise)?.h||1:.95;p.pitch=Math.atan2(h*.5-1.55,distance);if(lineBlock(p.x,p.z,-Math.sin(p.yaw)*Math.cos(p.pitch),-Math.cos(p.yaw)*Math.cos(p.pitch),distance,1.55,Math.sin(p.pitch),room)>=distance-.5)fire(room,p);}}}
    else if(!p.aiTarget || Math.hypot(p.aiTarget.x-p.x,p.aiTarget.z-p.z)<1.4){const q=SPAWNS[Math.floor(Math.random()*SPAWNS.length)];p.aiTarget={x:q.x,z:q.z};}
  }
  const target=p.aiTarget;if(!target)return;
  const waypoint=navWaypoint(p.x,p.z,target.x,target.z);
  const dx=waypoint.x-p.x,dz=waypoint.z-p.z,dist=Math.hypot(dx,dz);
  if(Math.hypot(target.x-p.x,target.z-p.z)<1.4){if(p.role==='prop'&&!p.disguise){const q=props.find(v=>v.morph&&Math.hypot(v.x-p.x,v.z-p.z)<2.2);if(q)morph(room,p,q.id);}p.aiTarget=null;p.ix=p.iz=0;return;}
  p.yaw=Math.atan2(-dx,-dz);p.viewYaw=p.yaw;p.ix=0;p.iz=-1;p.run=room.phase==='hunt';
  // Les bots changent de cap s'ils sont bloqués par le mobilier.
  if(now>p.aiNext+5000){p.aiTarget=null;p.aiNext=now+1000;}
}
let last=Date.now(),broadcastAt=0;
setInterval(()=>{
  const now=Date.now(),dt=Math.min((now-last)/1000,.05);last=now;
  for(const room of rooms.values()) {
    if(room.phase==='hide'&&now>=room.endsAt){room.phase='hunt';room.endsAt=now+HUNT_MS;broadcast(room,snapshot(room));}
    if(room.phase==='hunt'&&now>=room.endsAt)finish(room);
    if(!['hide','hunt'].includes(room.phase))continue;
    for(const p of room.players.values()) {
      if(!p.alive)continue;
      if(p.bot)botTick(room,p,dt);
      if((room.phase==='hide'&&p.role==='hunter')||p.locked){p.vx=p.vz=p.moving=0;continue;}
      if(!p.bot&&now-p.lastInput>250){p.ix=0;p.iz=0;}
      const next=stepKinematic(p,{x:p.ix,z:p.iz,yaw:p.viewYaw,run:p.run,disguise:p.disguise},dt);
      p.x=next.x;p.z=next.z;p.vx=next.vx;p.vz=next.vz;p.moving=next.moving;
      if(p.role==='prop'&&p.moving>.14){const desired=Math.atan2(-p.vx,-p.vz),difference=Math.atan2(Math.sin(desired-p.yaw),Math.cos(desired-p.yaw));p.yaw+=clamp(difference,-dt*7,dt*7);}
    }
    if(now-broadcastAt>=50)broadcast(room,snapshot(room));
  }
  if(now-broadcastAt>=50)broadcastAt=now;
},50);
