// Test d'intégration à lancer avec le serveur déjà démarré : npm run test:network
import WebSocket from 'ws';
import assert from 'node:assert/strict';
import { props, type ServerMessage, type Snapshot } from '../src/shared';

const url=`ws://127.0.0.1:${Number(process.env.TEST_PORT||8788)}`;
function open():Promise<WebSocket>{return new Promise((resolve,reject)=>{const ws=new WebSocket(url);ws.once('open',()=>resolve(ws));ws.once('error',reject);});}
function waitFor(ws:WebSocket,check:(m:ServerMessage)=>boolean,timeout=3500):Promise<ServerMessage>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',onMessage);reject(new Error('Réponse serveur trop lente'));},timeout);const onMessage=(data:WebSocket.RawData)=>{const m=JSON.parse(String(data)) as ServerMessage;if(check(m)){clearTimeout(timer);ws.off('message',onMessage);resolve(m);}};ws.on('message',onMessage);});}
function send(ws:WebSocket,m:object):void{ws.send(JSON.stringify(m));}
const host=await open(),guest=await open(),extra:WebSocket[]=[];
try{
  const welcomeHost=waitFor(host,m=>m.type==='welcome');send(host,{type:'create',name:'Hôte',bots:0});const h=await welcomeHost;
  assert.equal(h.type,'welcome');const code=h.code;
  assert.match(code,/^[A-HJ-NP-Z2-9]{4}$/,'code de salon lisible à 4 caractères');
  const welcomeGuest=waitFor(guest,m=>m.type==='welcome');send(guest,{type:'join',name:'Invité',code});const g=await welcomeGuest;
  assert.equal(g.type,'welcome');
  const started=waitFor(host,m=>m.type==='snapshot'&&m.phase==='hide');send(host,{type:'start'});const snap=await started as Snapshot;
  assert.equal(snap.players.length,2);assert.equal(snap.players.filter(p=>p.role==='hunter').length,1);assert.equal(snap.hostId,h.id);
  const fugitive=snap.players.find(p=>p.role==='prop')!;const hunter=snap.players.find(p=>p.role==='hunter')!;
  const fugitiveWs=fugitive.id===h.id?host:guest,hunterWs=hunter.id===h.id?host:guest;
  const prop=props.filter(p=>p.morph).sort((a,b)=>Math.hypot(a.x-fugitive.x,a.z-fugitive.z)-Math.hypot(b.x-fugitive.x,b.z-fugitive.z))[0];
  assert.ok(Math.hypot(prop.x-fugitive.x,prop.z-fugitive.z)<2.25,'objet transformable près du départ');
  const morphed=waitFor(fugitiveWs,m=>m.type==='snapshot'&&m.players.some(p=>p.id===fugitive.id&&p.disguise===prop.id));send(fugitiveWs,{type:'morph',propId:prop.id});await morphed;
  const locked=waitFor(fugitiveWs,m=>m.type==='snapshot'&&m.players.some(p=>p.id===fugitive.id&&p.locked));send(fugitiveWs,{type:'lock',locked:true});await locked;
  send(hunterWs,{type:'input',x:0,z:-1,yaw:0,pitch:0,run:true});await new Promise(r=>setTimeout(r,500));
  const still=waitFor(hunterWs,m=>m.type==='snapshot');const after=await still as Snapshot;const hp=after.players.find(p=>p.id===hunter.id)!;
  assert.ok(Math.hypot(hp.x-hunter.x,hp.z-hunter.z)<.01,'chasseur immobilisé pendant la cachette');
  const capHost=await open();extra.push(capHost);
  const capWelcome=waitFor(capHost,m=>m.type==='welcome');send(capHost,{type:'create',name:'Capitaine',bots:0});const cap=await capWelcome;
  assert.equal(cap.type,'welcome');
  for(let i=0;i<6;i++){
    const next=await open();extra.push(next);
    const joined=waitFor(capHost,m=>m.type==='snapshot'&&m.players.length===i+2);
    send(next,{type:'join',name:`Invité ${i+1}`,code:cap.code});await joined;
  }
  const refused=await open();extra.push(refused);
  const error=waitFor(refused,m=>m.type==='error');send(refused,{type:'join',name:'Huitième',code:cap.code});await error;
  const botHost=await open();extra.push(botHost);
  const capped=waitFor(botHost,m=>m.type==='snapshot'&&m.players.length===7);send(botHost,{type:'create',name:'Bots',bots:99});await capped;
  console.log(`OK salon ${code} : déplacement, transformation, verrouillage, 7 places maximum et plafond de 6 bots`);
}finally{host.close();guest.close();for(const ws of extra)ws.close();}
