import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import assert from 'node:assert/strict';
import type { ServerMessage, Snapshot } from '../src/shared';

const port=8799,url=`ws://127.0.0.1:${port}`;
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),HIDE_MS:'300',HUNT_MS:'20000'},stdio:'ignore'});
const clients:WebSocket[]=[];
function waitFor(ws:WebSocket,check:(m:ServerMessage)=>boolean,ms=2500):Promise<ServerMessage>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',onMessage);reject(new Error('Délai serveur dépassé'));},ms);function onMessage(raw:WebSocket.RawData){const msg=JSON.parse(String(raw)) as ServerMessage;if(check(msg)){clearTimeout(timer);ws.off('message',onMessage);resolve(msg);}}ws.on('message',onMessage);});}
async function connect():Promise<WebSocket>{for(let i=0;i<30;i++){try{const ws=await new Promise<WebSocket>((resolve,reject)=>{const w=new WebSocket(url);w.once('open',()=>resolve(w));w.once('error',reject);});clients.push(ws);return ws;}catch{await new Promise(r=>setTimeout(r,100));}}throw new Error('Serveur de test non démarré');}
function send(ws:WebSocket,msg:object):void{ws.send(JSON.stringify(msg));}
try{
  const host=await connect(),guest=await connect();
  const hw=waitFor(host,m=>m.type==='welcome');send(host,{type:'create',name:'Hôte',bots:0});const h=await hw;assert.equal(h.type,'welcome');assert.match(h.code,/^[A-HJ-NP-Z2-9]{4}$/);
  const gw=waitFor(guest,m=>m.type==='welcome');send(guest,{type:'join',code:h.code,name:'Invité'});const g=await gw;assert.equal(g.type,'welcome');
  const hunting=waitFor(host,m=>m.type==='snapshot'&&m.phase==='hunt',4000);send(host,{type:'start'});const first=await hunting as Snapshot;
  assert.equal(first.round,1);const hunter=first.players.find(p=>p.role==='hunter')!;const shooter=hunter.id===h.id?host:guest;
  const damaged=waitFor(shooter,m=>m.type==='snapshot'&&m.players.some(p=>p.id===hunter.id&&p.hp===92));send(shooter,{type:'fire'});await damaged;
  const result=waitFor(host,m=>m.type==='snapshot'&&m.phase==='results',9000);
  for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,380));send(shooter,{type:'fire'});}
  const final=await result as Snapshot;assert.equal(final.phase,'results');assert.ok(final.players.some(p=>p.role==='prop'&&p.alive));
  const next=waitFor(host,m=>m.type==='snapshot'&&m.phase==='hide'&&m.round===2);send(host,{type:'next'});const second=await next as Snapshot;
  assert.notEqual(second.hunterId,first.hunterId);
  const secondHunter=second.players.find(p=>p.role==='hunter')!,target=second.players.find(p=>p.role==='prop')!;
  const secondShooter=secondHunter.id===h.id?host:guest;
  await waitFor(secondShooter,m=>m.type==='snapshot'&&m.phase==='hunt',4000);
  const distance=Math.hypot(target.x-secondHunter.x,target.z-secondHunter.z);
  send(secondShooter,{type:'input',x:0,z:0,yaw:Math.atan2(-(target.x-secondHunter.x),-(target.z-secondHunter.z)),pitch:Math.atan2(.95-1.55,distance),run:false});
  await new Promise(r=>setTimeout(r,100));
  const hit=waitFor(secondShooter,m=>m.type==='snapshot'&&m.players.some(p=>p.id===target.id&&p.hp===50));send(secondShooter,{type:'fire'});await hit;
  await new Promise(r=>setTimeout(r,400));
  const won=waitFor(secondShooter,m=>m.type==='snapshot'&&m.phase==='results');send(secondShooter,{type:'fire'});const victory=await won as Snapshot;
  assert.equal(victory.players.find(p=>p.id===target.id)?.alive,false);
  console.log('OK manche : tir innocent, dégâts réels, élimination, résultat et rotation du chasseur');
}finally{for(const ws of clients)ws.close();server.kill();}
