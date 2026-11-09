import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { props, type ServerMessage, type Snapshot } from '../src/shared';
import { TAUNT_RANGE } from '../src/taunt';

const port=8798,url=`ws://127.0.0.1:${port}`;
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),HIDE_MS:'5000'},stdio:'ignore'});
const sockets:WebSocket[]=[];
async function open():Promise<WebSocket>{
  const ws=await new Promise<WebSocket>((resolve,reject)=>{const candidate=new WebSocket(url);candidate.once('open',()=>resolve(candidate));candidate.once('error',reject);});
  sockets.push(ws);return ws;
}
function send(ws:WebSocket,message:object):void{ws.send(JSON.stringify(message));}
function waitFor(ws:WebSocket,check:(message:ServerMessage)=>boolean,timeout=3000):Promise<ServerMessage>{
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ws.off('message',onMessage);reject(new Error('Événement réseau attendu absent'));},timeout);
    const onMessage=(raw:WebSocket.RawData)=>{const message=JSON.parse(String(raw)) as ServerMessage;if(check(message)){clearTimeout(timer);ws.off('message',onMessage);resolve(message);}};
    ws.on('message',onMessage);
  });
}
try{
  let ready=false;
  for(let i=0;i<40;i++){try{const response=await fetch(`http://127.0.0.1:${port}/health`);if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(ready,true);
  const host=await open(),guest=await open(),third=await open(),fourth=await open(),fifth=await open();
  const welcome=waitFor(host,m=>m.type==='welcome');send(host,{type:'create',name:'Hôte',bots:0});const h=await welcome;
  assert.equal(h.type,'welcome');
  const gw=waitFor(guest,m=>m.type==='welcome');send(guest,{type:'join',name:'Fugitif A',code:h.code});const g=await gw;
  const tw=waitFor(third,m=>m.type==='welcome');send(third,{type:'join',name:'Fugitif B',code:h.code});const t=await tw;
  const fw=waitFor(fourth,m=>m.type==='welcome');send(fourth,{type:'join',name:'Fugitif C',code:h.code});const f=await fw;
  const vw=waitFor(fifth,m=>m.type==='welcome');send(fifth,{type:'join',name:'Fugitif D',code:h.code});const v=await vw;
  assert.equal(g.type,'welcome');assert.equal(t.type,'welcome');assert.equal(f.type,'welcome');assert.equal(v.type,'welcome');
  const started=waitFor(host,m=>m.type==='snapshot'&&m.phase==='hide');send(host,{type:'start'});const snapshot=await started as Snapshot;
  const endpoints=new Map([[h.id,host],[g.id,guest],[t.id,third],[f.id,fourth],[v.id,fifth]]);
  const pair=snapshot.players.filter(p=>p.role==='prop'&&p.id!==h.id).flatMap(source=>{
    const closest=props.filter(p=>p.morph).sort((a,b)=>Math.hypot(a.x-source.x,a.z-source.z)-Math.hypot(b.x-source.x,b.z-source.z))[0];
    return snapshot.players.filter(distant=>distant.id!==source.id&&Math.hypot(closest.x-distant.x,closest.z-distant.z)>TAUNT_RANGE).map(distant=>({source,distant,closest}));
  })[0];
  assert.ok(pair,'une paire de joueurs est séparée de plus de 15 mètres');
  const {source,distant,closest}=pair;
  const hunter=snapshot.players.find(p=>p.role==='hunter')!;
  const sourceSocket=endpoints.get(source.id)!,distantSocket=endpoints.get(distant.id)!,hunterSocket=endpoints.get(hunter.id)!;
  const events=new Map<WebSocket,Extract<ServerMessage,{type:'taunt'}>[]>(sockets.map(ws=>[ws,[]]));
  for(const ws of sockets)ws.on('message',raw=>{const msg=JSON.parse(String(raw)) as ServerMessage;if(msg.type==='taunt')events.get(ws)!.push(msg);});
  send(hunterSocket,{type:'taunt'});send(sourceSocket,{type:'taunt'});
  await new Promise(resolve=>setTimeout(resolve,150));
  assert.equal([...events.values()].flat().length,0,'un chasseur ou fugitif sans objet ne peut pas narguer');
  assert.ok(Math.hypot(closest.x-source.x,closest.z-source.z)<2.25);
  const morphed=waitFor(sourceSocket,m=>m.type==='snapshot'&&m.players.some(p=>p.id===source.id&&p.disguise===closest.id));
  send(sourceSocket,{type:'morph',propId:closest.id});await morphed;
  assert.ok(Math.hypot(closest.x-distant.x,closest.z-distant.z)>TAUNT_RANGE);
  const received=waitFor(sourceSocket,m=>m.type==='taunt'&&m.id===source.id);
  send(sourceSocket,{type:'taunt'});send(sourceSocket,{type:'taunt'});
  const event=await received;
  assert.equal(event.type,'taunt');assert.equal(event.cooldownMs,12_000);
  assert.equal(event.x,closest.x);assert.equal(event.z,closest.z);
  await new Promise(resolve=>setTimeout(resolve,250));
  assert.equal(events.get(sourceSocket)!.length,1,'pas de doublon malgré deux commandes');
  const nearby=snapshot.players.filter(p=>p.id!==source.id&&Math.hypot(closest.x-p.x,closest.z-p.z)<TAUNT_RANGE);
  assert.ok(nearby.length>0,'au moins un autre joueur est proche');
  for(const player of nearby)assert.equal(events.get(endpoints.get(player.id)!)!.length,1,'un joueur proche reçoit la nargue');
  assert.equal(events.get(distantSocket)!.length,0,'un joueur lointain ne reçoit aucun événement sonore');
  console.log('OK nargue réseau : rôle, déguisement, portée, position, son unique et recharge serveur');
}finally{
  for(const ws of sockets)ws.close();
  server.kill();
}
