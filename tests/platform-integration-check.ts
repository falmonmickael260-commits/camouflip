import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import type { ServerMessage } from '../src/shared';

const port=8799,secret='camouflip-local-test-secret',base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),PLATFORM_SHARED_SECRET:secret,REVANCHE_GAMES_URL:''},stdio:'ignore'});
const sockets:WebSocket[]=[];
function identity(uid:string,name:string,exp=Math.floor(Date.now()/1000)+1800){const body=Buffer.from(JSON.stringify({uid,username:name,iat:Math.floor(Date.now()/1000),exp})).toString('base64url');return `${body}.${createHmac('sha256',secret).update(body).digest('base64url')}`;}
async function open(){const ws=await new Promise<WebSocket>((resolve,reject)=>{const ws=new WebSocket(base.replace('http','ws'));ws.once('open',()=>resolve(ws));ws.once('error',reject);});sockets.push(ws);return ws;}
function wait(ws:WebSocket,predicate:(message:ServerMessage)=>boolean,timeout=3000){return new Promise<ServerMessage>((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',onMessage);reject(new Error('Réponse attendue absente'));},timeout);const onMessage=(raw:WebSocket.RawData)=>{const m=JSON.parse(String(raw)) as ServerMessage;if(predicate(m)){clearTimeout(timer);ws.off('message',onMessage);resolve(m);}};ws.on('message',onMessage);});}
async function command(c:object,valid=true){const raw=JSON.stringify(c),stamp=Math.floor(Date.now()/1000).toString(),signature=createHmac('sha256',secret).update(`rg-connector-v1.${stamp}.${raw}`).digest('hex');const response=await fetch(`${base}/api/platform/connector`,{method:'POST',headers:{'content-type':'application/json','x-rg-signature':`${stamp}.${valid?signature:'0'.repeat(64)}`},body:raw});return {status:response.status,body:await response.json()};}
try{
  for(let i=0;i<50;i++){try{if((await fetch(`${base}/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const hostId=randomUUID(),host=await open();
  const welcome=wait(host,m=>m.type==='welcome');host.send(JSON.stringify({type:'create',name:'Faux nom',bots:0,rgToken:identity(hostId,'Hôte RG')}));const h=await welcome;
  assert.equal(h.type,'welcome');
  assert.equal(h.sessionToken.length>20,true);
  const proof={code:h.code,token:h.sessionToken,playerId:h.id};
  const info=await command({v:1,game:'camouflip',operation:'inspect',room:h.code,uid:hostId,name:'Hôte RG',proof});
  assert.equal(info.status,200);assert.equal(info.body.room.capacity,7);assert.equal(info.body.room.count,1);
  assert.equal((await command({v:1,game:'camouflip',operation:'inspect',room:h.code,uid:hostId,name:'Hôte RG',proof},false)).status,409);
  const admitted:{uid:string;ws:WebSocket;token:string}[]=[];
  let latest:ServerMessage|null=null;
  for(let i=0;i<6;i++){
    const uid=randomUUID(),invitation=randomUUID();
    const c={v:1,game:'camouflip',operation:'admit',room:h.code,uid,name:`Ami ${i}`,proof,inviter:hostId,instance:info.body.room.instance,invitation};
    const response=await command(c);assert.equal(response.status,200);
    const same=await command(c);assert.equal(same.body.session.token,response.body.session.token,'répétition idempotente');
    const ws=await open(),arrived=wait(ws,m=>m.type==='welcome'),updated=wait(host,m=>m.type==='snapshot'&&m.players.length===i+2);
    ws.send(JSON.stringify({type:'join',name:'Pseudo falsifié',code:h.code,rgToken:identity(uid,`Ami ${i}`),admissionToken:response.body.session.token}));
    await arrived;latest=await updated;admitted.push({uid,ws,token:response.body.session.token});
  }
  const eighth=await command({v:1,game:'camouflip',operation:'admit',room:h.code,uid:randomUUID(),name:'Huitième',proof,inviter:hostId,instance:info.body.room.instance,invitation:randomUUID()});
  assert.equal(eighth.status,409);assert.match(eighth.body.error,/complet/i);
  assert.equal(latest?.type,'snapshot');if(latest?.type!=='snapshot')throw new Error('Salon absent');assert.equal(latest.players[0].name,'Hôte RG');assert.equal(latest.players[1].name,'Ami 0');
  const started=wait(host,m=>m.type==='snapshot'&&m.phase==='hide');host.send(JSON.stringify({type:'start'}));await started;
  admitted[0].ws.close();
  const reconnect=await open(),reconnected=wait(reconnect,m=>m.type==='welcome'),afterReconnectPromise=wait(host,m=>m.type==='snapshot'&&m.phase==='hide'&&m.connected===7);
  reconnect.send(JSON.stringify({type:'join',name:'Faux retour',code:h.code,rgToken:identity(admitted[0].uid,'Ami 0'),admissionToken:admitted[0].token}));
  await reconnected;
  const afterReconnect=await afterReconnectPromise;
  assert.equal(afterReconnect.type,'snapshot');assert.equal(afterReconnect.players.length,7,'reconnexion sans huitième siège');
  const late=await command({v:1,game:'camouflip',operation:'admit',room:h.code,uid:randomUUID(),name:'Tardif',proof,inviter:hostId,instance:info.body.room.instance,invitation:randomUUID()});
  assert.equal(late.status,409);
  const expired=await open(),error=wait(expired,m=>m.type==='error');expired.send(JSON.stringify({type:'join',name:'Expiré',code:h.code,rgToken:identity(randomUUID(),'Expiré',1)}));await error;
  console.log('OK intégration locale : compte signé, connecteur, invitation directe, pseudo, 7 places et phase démarrée');
}finally{for(const ws of sockets)ws.close();server.kill();}
