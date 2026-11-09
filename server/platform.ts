import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type Identity = { uid:string; username:string; avatar?:string };
export type Session = { code:string; token:string; playerId:string };
export type Command = { v:1; game:'camouflip'; operation:'inspect'|'admit'; room:string; uid:string; name:string; proof:Session; inviter?:string; instance?:string; invitation?:string };
export type RoomInfo = {code:string;instance:string;capacity:number;count:number;status:'open'|'started'|'closed'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function equal(a:string,b:string):boolean {const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}

export function verifyIdentity(token:unknown):Identity|null {
  const key=process.env.PLATFORM_SHARED_SECRET;
  if(!key||typeof token!=='string'||token.length>4096)return null;
  const parts=token.split('.');if(parts.length!==2)return null;
  const expected=createHmac('sha256',key).update(parts[0]).digest('base64url');
  if(!equal(parts[1],expected))return null;
  try{const p=JSON.parse(Buffer.from(parts[0],'base64url').toString());
    if(!uuid.test(p.uid)||typeof p.username!=='string'||!p.username.trim()||p.username.length>100||typeof p.exp!=='number'||p.exp<Date.now()/1000)return null;
    return {uid:p.uid,username:p.username,...(typeof p.avatar==='string'?{avatar:p.avatar}:{})};
  }catch{return null;}
}

function verifyCommand(raw:string,signature:unknown):Command {
  const key=process.env.PLATFORM_SHARED_SECRET;
  if(!key||typeof signature!=='string'||raw.length>8192)throw new Error('Autorisation de plateforme absente.');
  const [stamp,hex]=signature.split('.');
  if(!/^\d{10}$/.test(stamp||'')||!/^[a-f0-9]{64}$/.test(hex||'')||Math.abs(Date.now()/1000-Number(stamp))>30)throw new Error('Autorisation expirée.');
  const expected=createHmac('sha256',key).update(`rg-connector-v1.${stamp}.${raw}`).digest('hex');
  if(!equal(hex,expected))throw new Error('Signature invalide.');
  const c=JSON.parse(raw) as Command;
  if(c.v!==1||c.game!=='camouflip'||!['inspect','admit'].includes(c.operation)||!uuid.test(c.uid)||typeof c.name!=='string'||c.name.length>100||!(/^[A-Z0-9]{4}$/).test(c.room)||c.proof?.code!==c.room||typeof c.proof?.token!=='string'||typeof c.proof?.playerId!=='string')throw new Error('Commande invalide.');
  if(c.operation==='admit'&&(!uuid.test(c.inviter||'')||!uuid.test(c.invitation||'')||typeof c.instance!=='string'))throw new Error('Admission invalide.');
  return c;
}

export async function handleConnector(req:IncomingMessage,res:ServerResponse,adapter:{inspect:(command:Command)=>RoomInfo;admit:(command:Command)=>Session}):Promise<boolean>{
  if(new URL(req.url||'/','http://localhost').pathname!=='/api/platform/connector')return false;
  const json=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
  if(req.method!=='POST'){json(405,{error:'Méthode refusée.'});return true;}
  let raw='';for await(const chunk of req){raw+=String(chunk);if(raw.length>8192){json(413,{error:'Commande trop volumineuse.'});return true;}}
  try{const c=verifyCommand(raw,req.headers['x-rg-signature']);const room=adapter.inspect(c);
    if(c.operation==='inspect'){json(200,{room});return true;}
    if(room.instance!==c.instance)throw new Error('Ce salon a fermé ou a été remplacé.');
    const session=adapter.admit(c);json(200,{room,session});
  }catch(e){json(409,{error:e instanceof Error?e.message:'Entrée impossible.'});}
  return true;
}

export function signResult(raw:string):string {
  const key=process.env.PLATFORM_SHARED_SECRET;if(!key)throw new Error('Secret de plateforme absent.');
  const stamp=Math.floor(Date.now()/1000).toString();
  return `${stamp}.${createHmac('sha256',key).update(`rg-camouflip-result-v1.${stamp}.${raw}`).digest('hex')}`;
}
