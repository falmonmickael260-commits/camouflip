import * as THREE from 'three';
import { buildWorld, makePropClone } from './scene';
import { Character } from './character';
import { AudioEngine, type Surface } from './audio';
import { clearCameraDistance } from './camera-collision';
import { radialStick } from './input-math';
import { clamp, props, stepKinematic, type ClientMessage, type MotionBody, type PlayerState, type PropDef, type ServerMessage, type Snapshot } from './shared';
import './style.css';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<canvas id="game"></canvas>
<div class="vignette"></div><div id="rotate">Tournez votre téléphone en mode paysage</div>
<div id="menu" class="screen"><div class="brand"><div class="eyebrow">UN JEU DE CACHE-CACHE EN 3D</div><h1>MAISON<br><em>MASQUÉE</em></h1><p>Cachez-vous. Changez de forme. Ne bougez plus.</p></div>
  <div class="menu-card"><div class="card-title">Entrer dans la maison <span>01 / SALON</span></div><label>PSEUDO<input id="name" maxlength="18" placeholder="Votre pseudo" value="Joueur" autocomplete="off"></label><div class="menu-row"><button id="solo" class="primary">Jouer avec 3 bots <span>↗</span></button><button id="create">Créer un salon</button></div><div class="join-row"><input id="code" maxlength="4" placeholder="CODE À 4 CARACTÈRES" autocapitalize="characters" autocomplete="off"><button id="join">Rejoindre</button></div><div class="menu-foot">2 à 7 joueurs · même adresse de jeu · mobile et Mac</div><div id="error"></div></div>
  <div class="menu-bottom">MAISON MASQUÉE <span>ÉDITION LOCALE · V0.1</span></div></div>
<div id="lobby" class="screen hidden"><div class="panel"><div class="eyebrow">SALON PRIVÉ · <span id="lobby-count">1/7 JOUEURS</span></div><h2>Les invités arrivent</h2><p>Partagez ce code à 4 caractères aux joueurs qui ouvrent la même adresse. Sept places maximum.</p><div id="room-code">----</div><div id="roster"></div><button id="start" class="primary">Lancer la manche <span>↗</span></button><div class="hint">Un chasseur, jusqu'à six fugitifs. 30 s pour se cacher, puis 3 min de chasse.</div></div></div>
<div id="results" class="screen hidden"><div class="panel"><div class="eyebrow">FIN DE MANCHE</div><h2 id="result-title">Résultats</h2><div id="result-rows"></div><button id="next" class="primary">Manche suivante <span>↗</span></button></div></div>
<div id="hud" class="hidden"><div class="hud-top"><div class="hud-brand">M<span>•</span>M</div><div class="hud-pill"><span id="phase">CACHE-CACHE</span><strong id="timer">0:30</strong></div><div class="hud-stat"><span id="role">FUGITIF</span><strong id="life">100 PV</strong></div></div><div id="hud-board"><div class="board-title">JOUEURS <span id="board-count">0/7</span></div><div id="board-rows"></div></div><div id="notice"></div><button id="help" type="button" aria-label="Afficher les commandes" aria-expanded="false">?</button><section id="howto" class="hidden" aria-label="Comment jouer"><div class="howto-head"><span>COMMENT JOUER</span><strong id="howto-role"></strong></div><p id="howto-goal"></p><div class="howto-keys"><div class="howto-touch"><small>TÉLÉPHONE</small><p id="howto-touch"></p></div><div class="howto-desktop"><small>MAC</small><p id="howto-desktop"></p></div></div><div class="howto-foot"><span>Revoir avec <b>?</b> ou <b>H</b></span><button id="howto-close" type="button">J'AI COMPRIS</button></div></section><div id="crosshair">+</div><div id="aim-label">VISÉE</div><div id="hud-bottom-glow"></div><div class="hud-bottom"><div id="players-left">SURVIVANTS 0/0</div><div id="quality-wrap">SON <button id="sound">ON</button> SENSI <button id="sensitivity">1.0×</button> QUALITÉ <button id="quality">MOYENNE</button></div></div><div id="touch"><div id="move-zone"></div><div id="stick"><div id="nub"></div></div><div id="look-zone"></div><div id="actions"><button id="act-main" class="action main">TRANSFORMER</button><button id="act-aim" class="action">VISER</button><button id="act-lock" class="action">VERROUILLER</button><button id="act-run" class="action">COURIR</button></div></div><div id="desktop-help">ZQSD / WASD · souris pour regarder · Maj courir · E se transformer · F verrouiller · clic tirer · clic droit viser · H aide · Échap libérer</div></div>`;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('game');
canvas.tabIndex=0;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.16;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
const qualityModes=[{label:'BASSE',ratio:1,shadows:false},{label:'MOYENNE',ratio:1.25,shadows:true},{label:'HAUTE',ratio:1.7,shadows:true}];
let qualityIndex=matchMedia('(pointer:coarse)').matches?0:1;
$('quality').textContent=qualityModes[qualityIndex].label;
renderer.shadowMap.enabled=qualityModes[qualityIndex].shadows;
function resize():void {const w=window.innerWidth,h=window.innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,qualityModes[qualityIndex].ratio));renderer.setSize(w,h);}
const world=buildWorld(),camera=new THREE.PerspectiveCamera(67,1,.08,70);camera.position.set(1,5,13);camera.lookAt(0,0,0);world.scene.add(camera);
window.addEventListener('resize',resize);resize();
const audio=new AudioEngine();
$('sound').textContent=audio.isMuted()?'OFF':'ON';
let ws:WebSocket|null=null,myId='',hostId='',latest:Snapshot|null=null;
let yaw=0,pitch=0,desiredYaw=0,desiredPitch=0,run=false,moveX=0,moveZ=0;
let lastInputSent=0,lastStep=0,noticeUntil=0;
let aiming=false,aimBlend=0,lastCountdownSecond=-1,boardSignature='';
const sensitivityLevels=[.7,1,1.35];
let sensitivityIndex=clamp(Number(localStorage.getItem('maison-sensitivity')||1),0,2);
if(!Number.isInteger(sensitivityIndex))sensitivityIndex=1;
$('sensitivity').textContent=`${sensitivityLevels[sensitivityIndex].toFixed(1)}×`;
const keys=new Set<string>();
type Visual={root:THREE.Group;character:Character;role:'hunter'|'prop';prop:THREE.Group|null;disguise:string|null;x:number;z:number;yaw:number};
const visuals=new Map<string,Visual>();
const clock=new THREE.Timer();clock.connect(document);
const cameraTarget=new THREE.Vector3(),cameraWanted=new THREE.Vector3(),cameraFocus=new THREE.Vector3();
let cameraFocusReady=false;
type Predicted=MotionBody&{id:string;disguise:string|null;moving:number};
let predicted:Predicted|null=null;

function connect(onOpen:()=>void):void {
  if(ws)ws.close();
  const scheme=location.protocol==='https:'?'wss:':'ws:';
  const host=import.meta.env.DEV?`${location.hostname}:8788`:location.host;
  ws=new WebSocket(`${scheme}//${host}`);
  ws.onopen=onOpen;ws.onmessage=e=>{let msg:ServerMessage;try{msg=JSON.parse(e.data);}catch{return;}handle(msg);};
  ws.onerror=()=>{$('error').textContent=import.meta.env.DEV?'Serveur introuvable. Lancez npm run server dans un second terminal.':'Connexion au salon indisponible. Réessayez.';};
  ws.onclose=()=>{if(myId){hideHelp();showNotice('Connexion au serveur perdue');myId='';latest=null;$('hud').classList.add('hidden');$('menu').classList.remove('hidden');}};
}
function send(msg:ClientMessage):void {if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(msg));}
function current():PlayerState|null{return latest?.players.find(p=>p.id===myId)||null;}
function isPlaying():boolean{return !!latest&&['hide','hunt'].includes(latest.phase);}
function showNotice(s:string,duration=1800):void{$('notice').textContent=s;noticeUntil=performance.now()+duration;}
const seenHelpRoles=new Set<PlayerState['role']>();
let helpTimer=0;
function hideHelp():void {
  window.clearTimeout(helpTimer);helpTimer=0;
  $('howto').classList.add('hidden');$('help').setAttribute('aria-expanded','false');
}
function showHelp(role:PlayerState['role'],autoClose=false):void {
  seenHelpRoles.add(role);window.clearTimeout(helpTimer);
  const hunter=role==='hunter';
  $('howto-role').textContent=hunter?'CHASSEUR':'FUGITIF';
  $('howto').classList.toggle('hunter',hunter);
  $('howto-goal').textContent=hunter
    ?'Attendez 30 secondes, puis repérez les joueurs cachés parmi les meubles. Visez avant de tirer : chaque objet innocent touché coûte 8 PV.'
    :'Vous avez 30 secondes pour vous cacher. Approchez un meuble et devenez sa copie. Survivez jusqu’à la fin des 3 minutes de chasse.';
  $('howto-touch').textContent=hunter
    ?'Joystick gauche pour avancer · glissez à droite pour regarder · VISER pour ajuster · TIRER pour toucher · COURIR pour sprinter.'
    :'Joystick gauche pour avancer · glissez à droite pour regarder · approchez un objet puis touchez DEVENIR · VERROUILLER pour rester immobile · COURIR pour sprinter.';
  $('howto-desktop').textContent=hunter
    ?'ZQSD ou WASD pour bouger · souris pour regarder · clic droit pour viser · clic gauche pour tirer · Maj pour courir · Échap pour libérer la souris.'
    :'ZQSD ou WASD pour bouger · souris pour regarder · E pour devenir un objet proche ou en changer · F pour verrouiller · Maj pour courir · Échap pour libérer la souris.';
  $('notice').textContent='';$('howto').classList.remove('hidden');$('help').setAttribute('aria-expanded','true');
  if(autoClose)helpTimer=window.setTimeout(hideHelp,10000);
}
function surfaceAt(x:number,z:number):Surface {
  if((x>-5&&x<5&&z< -3)||(x>5&&z>4))return 'concrete';
  if((x< -5&&z>4&&x< -7&&z<9)||(x< -5&&z< -3&&x< -8))return 'carpet';
  return 'wood';
}
function setAim(active:boolean):void {
  const p=current();const next=active&&!!p&&p.role==='hunter'&&p.alive&&isPlaying();
  if(next===aiming)return;
  aiming=next;
  $('crosshair').classList.toggle('aiming',aiming);
  $('aim-label').classList.toggle('visible',aiming);
  $('act-aim').classList.toggle('active',aiming);
  if(aiming)audio.play('aim');
}
function reconcileSelf(snapshot:Snapshot,previous:Snapshot|null):void {
  const p=snapshot.players.find(q=>q.id===myId);if(!p){predicted=null;return;}
  if(snapshot.phase==='hide'&&previous?.phase!==snapshot.phase){yaw=desiredYaw=0;pitch=desiredPitch=0;predicted=null;cameraFocusReady=false;}
  const old=previous?.players.find(q=>q.id===myId);
  const teleport=!predicted||predicted.id!==p.id||predicted.disguise!==p.disguise||old?.locked!==p.locked;
  const error=predicted?Math.hypot(predicted.x-p.x,predicted.z-p.z):Infinity;
  if(teleport||error>.8){predicted={id:p.id,disguise:p.disguise,x:p.x,z:p.z,vx:0,vz:0,moving:0};if(teleport)cameraFocusReady=false;return;}
  if(error>.2){predicted!.x+=(p.x-predicted!.x)*.22;predicted!.z+=(p.z-predicted!.z)*.22;}
}
function updateRoster():void {if(!latest)return;$('room-code').textContent=latest.code;$('lobby-count').textContent=`${latest.players.length}/7 JOUEURS`;$('roster').innerHTML=latest.players.map(p=>`<div class="roster-item"><span class="roster-dot ${p.bot?'bot':''}"></span><span>${escapeHtml(p.name)}</span><small>${p.bot?'BOT':'JOUEUR'}</small></div>`).join('');$('start').style.display=hostId===myId?'flex':'none';}
function escapeHtml(s:string):string{return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
function updateBoard():void {
  if(!latest)return;
  const players=latest.players.slice().sort((a,b)=>Number(b.role==='hunter')-Number(a.role==='hunter')||b.score-a.score);
  const signature=players.map(p=>`${p.id}:${p.name}:${p.role}:${p.alive}:${p.score}`).join('|');
  if(signature===boardSignature)return;boardSignature=signature;
  $('board-count').textContent=`${players.length}/7`;
  $('board-rows').innerHTML=players.map(p=>`<div class="board-row ${p.id===myId?'self':''} ${p.alive?'':'out'}"><span class="board-status ${p.role==='hunter'?'hunter':p.alive?'alive':'eliminated'}"></span><span class="board-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span><strong>${p.score}<small> PT</small></strong></div>`).join('');
}
function handle(msg:ServerMessage):void {
  if(msg.type==='welcome'){myId=msg.id;hostId=msg.id;audio.play('button');return;}
  if(msg.type==='error'){$('error').textContent=msg.message;return;}
  if(msg.type==='event'){
    if(msg.event==='fire'){if(msg.id)visuals.get(msg.id)?.character.fire();audio.play('fire');burst(msg.x,msg.z,'#f7bb69');}
    if(msg.event==='hit'){audio.play('hit');burst(msg.x,msg.z,'#e8e0b6');if(msg.id===myId)showNotice('Touché !');}
    if(msg.event==='morph'){audio.play('morph');morphBurst(msg.x,msg.z);}
    if(msg.event==='eliminate'){audio.play('eliminate');burst(msg.x,msg.z,'#f2b6a1');if(msg.id===myId)showNotice('Vous avez été trouvé',2600);}
    if(msg.event==='penalty'&&msg.id===myId){audio.play('penalty');showNotice('Objet innocent · -8 PV');}
    return;
  }
  const old=latest;latest=msg;hostId=msg.hostId;reconcileSelf(msg,old);
  if(old?.phase!==msg.phase){
    lastCountdownSecond=-1;
    if(msg.phase==='hide'){
      canvas.focus({preventScroll:true});audio.setMusic('hide');audio.play('roundStart');showNotice('30 secondes pour se cacher !',3000);
      const me=msg.players.find(p=>p.id===myId);
      if(me&&!seenHelpRoles.has(me.role))showHelp(me.role,true);
    }
    if(msg.phase==='hunt'){audio.setMusic('hunt');audio.play('roundStart');showNotice('Le chasseur est libre !',3000);}
    if(msg.phase==='lobby'){hideHelp();audio.setMusic('menu');}
    if(msg.phase==='results'){
      hideHelp();
      audio.setMusic('menu');
      const me=msg.players.find(q=>q.id===myId),survivors=msg.players.filter(q=>q.role==='prop'&&q.alive);
      audio.play(me?.role==='hunter'?(survivors.length?'defeat':'victory'):(me?.alive?'victory':'defeat'));
    }
  }
  $('menu').classList.add('hidden');$('lobby').classList.toggle('hidden',msg.phase!=='lobby');$('results').classList.toggle('hidden',msg.phase!=='results');$('hud').classList.toggle('hidden',!['hide','hunt'].includes(msg.phase));
  if(msg.phase==='lobby')updateRoster();if(msg.phase==='results')updateResults();
  syncVisuals();updateHUD();updateBoard();
}
function updateResults():void {if(!latest)return;const hunter=latest.players.find(p=>p.role==='hunter');const survivors=latest.players.filter(p=>p.role==='prop'&&p.alive);$('result-title').textContent=survivors.length?`${survivors.length} fugitif${survivors.length>1?'s':''} sauvés`:`${hunter?.name||'Le chasseur'} a gagné`;$('result-rows').innerHTML=latest.players.slice().sort((a,b)=>b.score-a.score).map(p=>`<div class="result-row"><span>${escapeHtml(p.name)} <small>${p.role==='hunter'?'CHASSEUR':p.alive?'SURVIVANT':'RETROUVÉ'}</small></span><strong>${p.score} <small>PT</small></strong></div>`).join('');$('next').style.display=hostId===myId?'flex':'none';}
function updateHUD():void {
  const p=current();if(!p||!latest)return;
  $('role').textContent=p.role==='hunter'?'CHASSEUR':'FUGITIF';$('life').textContent=p.role==='hunter'?`${p.hp} PV`:p.alive?'EN VIE':'ÉLIMINÉ';
  $('phase').textContent=latest.phase==='hide'?'PHASE DE CACHETTE':'PHASE DE CHASSE';
  const total=latest.players.filter(q=>q.role==='prop').length,left=latest.players.filter(q=>q.role==='prop'&&q.alive).length;$('players-left').textContent=`SURVIVANTS ${left}/${total} · ${p.score} PT`;
  const candidate=nearestProp(p);const main=$<HTMLButtonElement>('act-main'),lock=$<HTMLButtonElement>('act-lock');
  if(p.role==='hunter'){main.textContent='TIRER';main.classList.remove('disabled');lock.style.display='none';$('act-aim').style.display='block';}
  else {setAim(false);$('act-aim').style.display='none';lock.style.display=p.disguise?'block':'none';lock.textContent=p.locked?'DÉVERROUILLER':'VERROUILLER';main.textContent=candidate&&candidate.id!==p.disguise?`DEVENIR ${label(candidate.kind)}`:p.disguise?'REPRENDRE FORME':'APPROCHER UN OBJET';main.classList.toggle('disabled',!candidate&&!p.disguise);}
  $('crosshair').style.display=p.role==='hunter'?'block':'none';
}
const labels:Record<string,string>={chair:'CHAISE',stool:'TABOURET',table:'TABLE',lamp:'LAMPE',plant:'PLANTE',vase:'VASE',box:'CAISSE',suitcase:'VALISE',bin:'POUBELLE',bookshelf:'BIBLIOTHÈQUE',tv:'TÉLÉVISION',speaker:'ENCEINTE',microwave:'MICRO-ONDES',toaster:'GRILLE-PAIN',coffee:'CAFETIÈRE',cabinet:'MEUBLE',toy:'JOUET',basket:'PANIER',toolbox:'BOÎTE À OUTILS',fan:'VENTILATEUR',vacuum:'ASPIRATEUR',barrel:'BARIL',chest:'COFFRE',ottoman:'POUF'};
function label(k:string):string{return labels[k]||k.toUpperCase();}
function nearestProp(p:PlayerState):PropDef|null {let best:PropDef|null=null,d=2.25;for(const q of props){if(!q.morph||q.id===p.disguise)continue;const v=Math.hypot(p.x-q.x,p.z-q.z);if(v<d){d=v;best=q;}}return best;}
function primary():void {const p=current();if(!p||!isPlaying()||!p.alive)return;audio.start();if(p.role==='hunter'){send({type:'fire'});return;}const q=nearestProp(p);if(q)send({type:'morph',propId:q.id});else if(p.disguise){send({type:'unmorph'});audio.play('unmorph');}}
function toggleLock():void{const p=current();if(p?.disguise)send({type:'lock',locked:!p.locked});}

function syncVisuals():void {if(!latest)return;const ids=new Set(latest.players.map(p=>p.id));for(const [id,v] of visuals)if(!ids.has(id)){world.scene.remove(v.root);visuals.delete(id);}
  const occupied=new Set(latest.players.map(p=>p.disguise).filter(Boolean));for(const [id,g] of world.propMeshes)g.visible=!occupied.has(id);
  for(const p of latest.players){let v=visuals.get(p.id);if(!v){const root=new THREE.Group(),character=new Character(p.role);root.add(character.root);world.scene.add(root);v={root,character,role:p.role,prop:null,disguise:null,x:p.x,z:p.z,yaw:p.yaw};visuals.set(p.id,v);}
    if(v.role!==p.role){v.root.remove(v.character.root);v.character=new Character(p.role);v.root.add(v.character.root);v.role=p.role;}
    if(p.disguise!==v.disguise){if(v.prop)v.root.remove(v.prop);v.prop=null;v.disguise=p.disguise;v.yaw=p.yaw;const def=props.find(q=>q.id===p.disguise);if(def){v.prop=makePropClone(def);v.root.add(v.prop);} }
    v.character.root.visible=!p.disguise&&p.alive;if(v.prop)v.prop.visible=p.alive;
    if(!p.alive)v.root.visible=false;else v.root.visible=true;
  }
}
function updateVisuals(dt:number):void {
  if(!latest)return;
  for(const p of latest.players){
    const v=visuals.get(p.id);if(!v)continue;
    const self=p.id===myId&&predicted?.id===p.id?predicted:null;
    const smoothing=1-Math.exp(-dt*12);
    if(self){v.x=self.x;v.z=self.z;}
    else {v.x=THREE.MathUtils.lerp(v.x,p.x,smoothing);v.z=THREE.MathUtils.lerp(v.z,p.z,smoothing);}
    let facing=p.yaw;
    if(self&&p.role==='prop'&&self.moving>.15)facing=Math.atan2(-self.vx,-self.vz);
    v.yaw+=Math.atan2(Math.sin(facing-v.yaw),Math.cos(facing-v.yaw))*(1-Math.exp(-dt*15));
    v.root.position.set(v.x,0,v.z);v.root.rotation.y=v.yaw;
    const speed=self?self.moving:p.moving;
    v.character.update(speed,dt);
    if(v.prop){v.prop.position.y=speed>.05?Math.abs(Math.sin(performance.now()*.012))*Math.min(.07,speed*.02):0;v.prop.rotation.z=speed>.05?Math.sin(performance.now()*.01)*.025:0;}
  }
}
const cameraDirection=new THREE.Vector3(),cameraAim=new THREE.Vector3();
function updateCamera(dt:number):void {
  const p=current();
  if(!p||!isPlaying())setAim(false);
  const targetAim=p?.role==='hunter'&&p.alive&&isPlaying()&&aiming?1:0;
  aimBlend+=(targetAim-aimBlend)*(1-Math.exp(-dt*8));
  const fov=67-6*aimBlend;if(Math.abs(camera.fov-fov)>.02){camera.fov=fov;camera.updateProjectionMatrix();}
  if(!p){camera.position.lerp(new THREE.Vector3(1,5,13),1-Math.exp(-dt*2));camera.lookAt(0,0,0);cameraFocusReady=false;return;}
  const v=visuals.get(p.id),px=v?.x??p.x,pz=v?.z??p.z;
  audio.setPosition(px,pz);
  const hunter=p.role==='hunter';
  const def=props.find(q=>q.id===p.disguise),height=hunter?1.35:def?Math.max(.6,Math.min(1.6,def.h*.7)):1.2;
  cameraTarget.set(px,height,pz);
  const snap=!cameraFocusReady;
  if(snap){cameraFocus.copy(cameraTarget);cameraFocusReady=true;}
  else cameraFocus.lerp(cameraTarget,1-Math.exp(-dt*12));
  const distance=hunter?3.45-.65*aimBlend:def?2.75:3.15;
  const lift=hunter ? .95 : .85,shoulder=hunter?1.15:0;
  cameraWanted.set(cameraFocus.x+Math.sin(yaw)*distance+Math.cos(yaw)*shoulder,Math.max(.35,cameraFocus.y+lift-Math.sin(pitch)*distance*.67),cameraFocus.z+Math.cos(yaw)*distance-Math.sin(yaw)*shoulder);
  cameraDirection.subVectors(cameraWanted,cameraFocus);
  const wantedLength=cameraDirection.length();cameraDirection.normalize();
  const clear=clearCameraDistance(cameraFocus,cameraWanted,p.disguise);
  cameraWanted.copy(cameraFocus).addScaledVector(cameraDirection,Math.min(wantedLength,clear));
  if(snap)camera.position.copy(cameraWanted);
  else camera.position.lerp(cameraWanted,1-Math.exp(-dt*(clear<wantedLength?16:9)));
  const safe=clearCameraDistance(cameraFocus,camera.position,p.disguise);
  cameraDirection.subVectors(camera.position,cameraFocus);
  const actual=cameraDirection.length();
  if(actual>safe+.001)camera.position.copy(cameraFocus).addScaledVector(cameraDirection.normalize(),safe);
  if(hunter){
    cameraAim.set(cameraFocus.x-Math.sin(yaw)*Math.cos(pitch)*10,1.55+Math.sin(pitch)*10,cameraFocus.z-Math.cos(yaw)*Math.cos(pitch)*10);
    camera.lookAt(cameraAim);
  }
  else camera.lookAt(cameraFocus);
}
type Particle={mesh:THREE.Mesh;v:THREE.Vector3;life:number;maxLife:number};const particles:Particle[]=[];
type Ring={mesh:THREE.Mesh;life:number};const rings:Ring[]=[];
function burst(x:number,z:number,color:string):void {for(let i=0;i<7;i++){const o=new THREE.Mesh(new THREE.SphereGeometry(.035,6,4),new THREE.MeshBasicMaterial({color,transparent:true}));o.position.set(x,.65,z);world.scene.add(o);particles.push({mesh:o,v:new THREE.Vector3((Math.random()-.5)*2,Math.random()*2,(Math.random()-.5)*2),life:.4,maxLife:.4});}}
function morphBurst(x:number,z:number):void {
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.34,.018,5,32),new THREE.MeshBasicMaterial({color:'#d3efdc',transparent:true,opacity:.65,depthWrite:false}));
  ring.rotation.x=Math.PI/2;ring.position.set(x,.07,z);world.scene.add(ring);rings.push({mesh:ring,life:.65});
  for(let i=0;i<14;i++){
    const a=i*Math.PI*2/14,r=.22+Math.random()*.26;
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(.025+Math.random()*.017,6,5),new THREE.MeshBasicMaterial({color:i%3?'#d8e5cb':'#e7c998',transparent:true,opacity:.9,depthWrite:false}));
    mesh.position.set(x+Math.cos(a)*r,.15+Math.random()*.65,z+Math.sin(a)*r);world.scene.add(mesh);
    particles.push({mesh,v:new THREE.Vector3(Math.cos(a)*(.28+Math.random()*.35),.45+Math.random()*.5,Math.sin(a)*(.28+Math.random()*.35)),life:.65,maxLife:.65});
  }
}
function updateParticles(dt:number):void {
  for(let i=particles.length-1;i>=0;i--){const q=particles[i];q.life-=dt;q.mesh.position.addScaledVector(q.v,dt);q.v.y-=dt*2.3;(q.mesh.material as THREE.MeshBasicMaterial).opacity=Math.max(0,q.life/q.maxLife);if(q.life<=0){world.scene.remove(q.mesh);q.mesh.geometry.dispose();(q.mesh.material as THREE.Material).dispose();particles.splice(i,1);}}
  for(let i=rings.length-1;i>=0;i--){const q=rings[i];q.life-=dt;const progress=1-q.life/.65;q.mesh.scale.setScalar(1+progress*2.4);(q.mesh.material as THREE.MeshBasicMaterial).opacity=Math.max(0,(1-progress)*.65);if(q.life<=0){world.scene.remove(q.mesh);q.mesh.geometry.dispose();(q.mesh.material as THREE.Material).dispose();rings.splice(i,1);}}
}

type ControlFrame={x:number;z:number;run:boolean};
function readControls():ControlFrame {
  const left=keys.has('KeyA')||keys.has('KeyQ')||keys.has('ArrowLeft'),right=keys.has('KeyD')||keys.has('ArrowRight'),up=keys.has('KeyW')||keys.has('KeyZ')||keys.has('ArrowUp'),down=keys.has('KeyS')||keys.has('ArrowDown');
  const x=clamp(moveX+(right?1:0)-(left?1:0),-1,1),z=clamp(moveZ+(down?1:0)-(up?1:0),-1,1);
  return {x,z,run:run||keys.has('ShiftLeft')||keys.has('ShiftRight')};
}
function updateLook(dt:number):void {
  yaw+=Math.atan2(Math.sin(desiredYaw-yaw),Math.cos(desiredYaw-yaw))*(1-Math.exp(-dt*24));
  pitch+=(desiredPitch-pitch)*(1-Math.exp(-dt*24));
}
function updateInput(now:number,controls:ControlFrame):void {
  const p=current();if(!p||!isPlaying())return;
  if(now-lastInputSent>30){send({type:'input',...controls,yaw,pitch});lastInputSent=now;}
  const speed=predicted?.moving??p.moving;
  if(speed>.65&&now-lastStep>(p.disguise?420:Math.max(160,650/speed))){audio.play(p.disguise?'shuffle':'step',surfaceAt(p.x,p.z));lastStep=now;}
}
function predictSelf(dt:number,controls:ControlFrame):void {
  const p=current();if(!p||!predicted||!isPlaying()||!p.alive)return;
  if(p.locked||(latest?.phase==='hide'&&p.role==='hunter')){predicted.vx=predicted.vz=predicted.moving=0;return;}
  const next=stepKinematic(predicted,{...controls,yaw,disguise:p.disguise},dt);
  Object.assign(predicted,next);
}
function updateTime():void {if(!latest)return;const s=Math.max(0,Math.ceil((latest.endsAt-Date.now())/1000));$('timer').textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;if(isPlaying()&&s>0&&s<=5&&s!==lastCountdownSecond){audio.play('countdown');lastCountdownSecond=s;}if(performance.now()>noticeUntil)$('notice').textContent='';}
let lastDraw=0;
renderer.setAnimationLoop(()=>{const now=performance.now();if(now-lastDraw<(isPlaying()?30:75))return;lastDraw=now;clock.update();const dt=clamp(clock.getDelta(),0,.05);updateLook(dt);const controls=readControls();updateInput(now,controls);predictSelf(dt,controls);updateVisuals(dt);updateCamera(dt);updateParticles(dt);updateTime();renderer.render(world.scene,camera);});
if(import.meta.env.DEV)(window as unknown as {__maisonDebug:unknown}).__maisonDebug={renderer,world,getSnapshot:()=>latest,getAudio:()=>audio.status(),getControls:()=>({yaw,pitch,moveX,moveZ,run,aiming,aimBlend,fov:camera.fov,cameraDistance:camera.position.distanceTo(cameraFocus),actions:readControls(),predicted,lastDraw,lastInputSent,now:performance.now(),frame:renderer.info.render.frame})};

$<HTMLButtonElement>('solo').onclick=()=>{audio.start();connect(()=>send({type:'create',name:$<HTMLInputElement>('name').value,bots:3}));};
$<HTMLButtonElement>('create').onclick=()=>{audio.start();connect(()=>send({type:'create',name:$<HTMLInputElement>('name').value,bots:0}));};
$<HTMLButtonElement>('join').onclick=()=>{audio.start();connect(()=>send({type:'join',name:$<HTMLInputElement>('name').value,code:$<HTMLInputElement>('code').value.toUpperCase()}));};
$<HTMLButtonElement>('start').onclick=()=>{audio.play('button');send({type:'start'});};
$<HTMLButtonElement>('next').onclick=()=>{audio.play('button');send({type:'next'});};
$<HTMLButtonElement>('quality').onclick=()=>{qualityIndex=(qualityIndex+1)%qualityModes.length;const q=qualityModes[qualityIndex];$('quality').textContent=q.label;renderer.shadowMap.enabled=q.shadows;resize();};
$<HTMLButtonElement>('sound').onclick=()=>{$('sound').textContent=audio.toggleMute()?'OFF':'ON';};
$<HTMLButtonElement>('sensitivity').onclick=()=>{sensitivityIndex=(sensitivityIndex+1)%sensitivityLevels.length;localStorage.setItem('maison-sensitivity',String(sensitivityIndex));$('sensitivity').textContent=`${sensitivityLevels[sensitivityIndex].toFixed(1)}×`;};
$<HTMLButtonElement>('act-main').onclick=primary;$<HTMLButtonElement>('act-lock').onclick=toggleLock;$<HTMLButtonElement>('act-aim').onclick=()=>setAim(!aiming);
$<HTMLButtonElement>('help').onclick=()=>{
  const p=current();if(!p||!isPlaying())return;
  audio.play('button');
  if($('howto').classList.contains('hidden'))showHelp(p.role);else hideHelp();
};
$<HTMLButtonElement>('howto-close').onclick=()=>{audio.play('button');hideHelp();};
const runButton=$<HTMLButtonElement>('act-run');let runId=-1;
runButton.addEventListener('pointerdown',e=>{e.preventDefault();if(runId!==-1)return;runId=e.pointerId;runButton.setPointerCapture(e.pointerId);run=true;runButton.classList.add('active');});
function releaseRun(e:PointerEvent):void {if(e.pointerId!==runId)return;runId=-1;run=false;runButton.classList.remove('active');}
for(const type of ['pointerup','pointercancel','lostpointercapture'])runButton.addEventListener(type,e=>releaseRun(e as PointerEvent));
window.addEventListener('keydown',e=>{
  if((e.target as HTMLElement).tagName==='INPUT')return;
  keys.add(e.code);
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.code==='Escape'){if(document.pointerLockElement===canvas)void document.exitPointerLock();hideHelp();}
  if(e.repeat)return;
  if(e.code==='KeyH'&&isPlaying()){const p=current();if(p){if($('howto').classList.contains('hidden'))showHelp(p.role);else hideHelp();}}
  if(e.code==='KeyE')primary();
  if(e.code==='KeyF')toggleLock();
  if(e.code==='Space'&&current()?.role==='hunter')primary();
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();moveX=moveZ=0;run=false;runId=-1;runButton.classList.remove('active');setAim(false);});
function lookDelta(dx:number,dy:number,pointerType:string):void {
  const factor=(pointerType==='mouse'?.0023:.0048)*sensitivityLevels[sensitivityIndex]*(aiming?.67:1);
  desiredYaw-=dx*factor;desiredPitch=clamp(desiredPitch-dy*factor,-1.15,1.15);
  if(pointerType==='mouse'){yaw=desiredYaw;pitch=desiredPitch;}
}
canvas.addEventListener('pointerdown',e=>{if(!isPlaying()||e.pointerType!=='mouse')return;audio.start();if(e.button===2){setAim(true);return;}if(e.button!==0)return;if(document.pointerLockElement!==canvas)void canvas.requestPointerLock();if(current()?.role==='hunter')primary();});
window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'&&e.button===2)setAim(false);});
canvas.addEventListener('pointermove',e=>{if(document.pointerLockElement===canvas)lookDelta(e.movementX,e.movementY,'mouse');});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
const stick=$('stick'),nub=$('nub'),moveZone=$('move-zone');let stickId=-1,stickX=0,stickY=0;
function stickMove(e:PointerEvent):void {
  const dx=e.clientX-stickX,dy=e.clientY-stickY,r=stick.offsetWidth*.35;
  const value=radialStick(dx,dy,r);
  moveX=value.x;moveZ=value.z;
  nub.style.transform=`translate(${value.visualX}px,${value.visualY}px)`;
}
function releaseStick(e:PointerEvent):void {if(e.pointerId!==stickId)return;stickId=-1;moveX=moveZ=0;nub.style.transform='translate(0,0)';stick.style.left='';stick.style.top='';stick.style.bottom='';stick.classList.remove('engaged');}
moveZone.addEventListener('pointerdown',e=>{
  if(stickId!==-1||!isPlaying())return;e.preventDefault();stickId=e.pointerId;moveZone.setPointerCapture(e.pointerId);
  const radius=stick.offsetWidth/2;
  stickX=clamp(e.clientX,radius+12,innerWidth*.49-radius-8);
  stickY=clamp(e.clientY,radius+64,innerHeight-radius-42);
  stick.style.left=`${stickX-radius}px`;stick.style.top=`${stickY-radius}px`;stick.style.bottom='auto';stick.classList.add('engaged');
  stickMove(e);
});
moveZone.addEventListener('pointermove',e=>{if(e.pointerId===stickId)stickMove(e);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])moveZone.addEventListener(type,e=>releaseStick(e as PointerEvent));
const lookZone=$('look-zone');let zoneId=-1,zx=0,zy=0;
lookZone.addEventListener('pointerdown',e=>{if(zoneId!==-1||!isPlaying())return;e.preventDefault();zoneId=e.pointerId;zx=e.clientX;zy=e.clientY;lookZone.setPointerCapture(e.pointerId);});
lookZone.addEventListener('pointermove',e=>{if(zoneId!==e.pointerId)return;lookDelta(e.clientX-zx,e.clientY-zy,e.pointerType);zx=e.clientX;zy=e.clientY;});
for(const type of ['pointerup','pointercancel','lostpointercapture'])lookZone.addEventListener(type,e=>{if((e as PointerEvent).pointerId===zoneId)zoneId=-1;});
