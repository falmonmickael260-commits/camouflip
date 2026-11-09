export type Surface = 'wood' | 'carpet' | 'concrete';
export type Sound = 'fire' | 'hit' | 'morph' | 'unmorph' | 'eliminate' | 'penalty' | 'step' | 'shuffle' | 'button' | 'aim' | 'countdown' | 'roundStart' | 'victory' | 'defeat';

const files = [
  'footstep_wood_000.m4a','footstep_wood_002.m4a',
  'footstep_carpet_000.m4a','footstep_carpet_002.m4a',
  'footstep_concrete_000.m4a','footstep_concrete_002.m4a',
  'impactGeneric_light_001.m4a','impactMetal_light_002.m4a',
  'impactPlank_medium_000.m4a','cloth1.m4a','metalClick.m4a',
  'creak1.m4a','bookPlace1.m4a','dropLeather.m4a',
  'swish-soft.m4a','swish-strong.m4a',
] as const;
type File = typeof files[number];

export class AudioEngine {
  private ctx:AudioContext|null=null;
  private master:GainNode|null=null;
  private limiter:DynamicsCompressorNode|null=null;
  private effects:GainNode|null=null;
  private foley:GainNode|null=null;
  private music:GainNode|null=null;
  private musicDuck:GainNode|null=null;
  private ambience:GainNode|null=null;
  private buffers=new Map<File,AudioBuffer>();
  private loading:Promise<void>|null=null;
  private stepIndex=0;
  private menuMusic:HTMLAudioElement|null=null;
  private gameMusic:HTMLAudioElement|null=null;
  private roomTone:HTMLAudioElement|null=null;
  private menuGain:GainNode|null=null;
  private gameGain:GainNode|null=null;
  private roomGain:GainNode|null=null;
  private gameFilter:BiquadFilterNode|null=null;
  private musicMode:'menu'|'hide'|'hunt'|'off'='menu';
  private muted=localStorage.getItem('maison-muted')==='1';

  start():void {
    if(this.ctx){void this.ctx.resume();return;}
    const ctx=new AudioContext();this.ctx=ctx;
    this.master=ctx.createGain();this.master.gain.value=this.muted?0:.78;
    this.limiter=ctx.createDynamicsCompressor();this.limiter.threshold.value=-10;this.limiter.knee.value=8;this.limiter.ratio.value=3;this.limiter.attack.value=.006;this.limiter.release.value=.22;
    this.master.connect(this.limiter);this.limiter.connect(ctx.destination);
    this.effects=ctx.createGain();this.effects.gain.value=.72;this.effects.connect(this.master);
    this.foley=ctx.createGain();this.foley.gain.value=.55;this.foley.connect(this.master);
    this.music=ctx.createGain();this.music.gain.value=.46;
    this.musicDuck=ctx.createGain();this.musicDuck.gain.value=1;this.music.connect(this.musicDuck);this.musicDuck.connect(this.master);
    this.ambience=ctx.createGain();this.ambience.gain.value=.18;this.ambience.connect(this.master);
    this.loading=Promise.all(files.map(async file=>{
      try{
        const response=await fetch(`/audio/${file}`);
        if(!response.ok)return;
        this.buffers.set(file,await ctx.decodeAudioData(await response.arrayBuffer()));
      }catch{ /* A failed optional sound never stops a match. */ }
    })).then(()=>{});
    this.installMusic();
  }
  async ready():Promise<void>{this.start();await this.loading;}
  loadedCount():number{return this.buffers.size;}
  status():{loaded:number;mode:string;menuReady:number;gameReady:number;roomReady:number;menuPlaying:boolean;gamePlaying:boolean;roomPlaying:boolean}{return {loaded:this.buffers.size,mode:this.musicMode,menuReady:this.menuMusic?.readyState??0,gameReady:this.gameMusic?.readyState??0,roomReady:this.roomTone?.readyState??0,menuPlaying:!!this.menuMusic&&!this.menuMusic.paused,gamePlaying:!!this.gameMusic&&!this.gameMusic.paused,roomPlaying:!!this.roomTone&&!this.roomTone.paused};}
  isMuted():boolean{return this.muted;}
  toggleMute():boolean{this.muted=!this.muted;localStorage.setItem('maison-muted',this.muted?'1':'0');if(this.ctx&&this.master)this.master.gain.setTargetAtTime(this.muted?0:.78,this.ctx.currentTime,.08);return this.muted;}

  setMusic(mode:'menu'|'hide'|'hunt'|'off'):void {
    if(!this.ctx||!this.music)return;
    this.musicMode=mode;
    const t=this.ctx.currentTime;
    this.menuGain?.gain.setTargetAtTime(mode==='menu'?1:0,t,.45);
    this.gameGain?.gain.setTargetAtTime(mode==='hide' ? .64 : mode==='hunt' ? 1 : 0,t,.45);
    this.gameFilter?.frequency.setTargetAtTime(mode==='hide'?1750:9000,t,.7);
    const active=mode==='menu'?this.menuMusic:mode==='hide'||mode==='hunt'?this.gameMusic:null;
    if(active)void active.play().catch(()=>{});
    window.setTimeout(()=>{
      if(this.musicMode!=='menu')this.menuMusic?.pause();
      if(this.musicMode!=='hide'&&this.musicMode!=='hunt')this.gameMusic?.pause();
    },1800);
  }
  setPosition(x:number,z:number):void {
    if(!this.ctx||!this.roomGain)return;
    const distance=Math.hypot(x-9.5,z-.5);
    const level=Math.max(0,1-distance/8)*.32;
    if(Math.abs(this.roomGain.gain.value-level)>.015)this.roomGain.gain.setTargetAtTime(level,this.ctx.currentTime,.5);
  }
  private installMusic():void {
    if(!this.ctx||!this.music)return;
    const make=(src:string,volume:number,destination:AudioNode):[HTMLAudioElement,GainNode]=>{
      const element=new Audio(src);element.loop=true;element.preload='none';
      const gain=this.ctx!.createGain();gain.gain.value=volume;
      this.ctx!.createMediaElementSource(element).connect(gain);gain.connect(destination);
      return [element,gain];
    };
    this.gameFilter=this.ctx.createBiquadFilter();this.gameFilter.type='lowpass';this.gameFilter.frequency.value=9000;this.gameFilter.Q.value=.55;this.gameFilter.connect(this.music);
    [this.menuMusic,this.menuGain]=make('/audio/menu-premium.m4a',1,this.music);
    [this.gameMusic,this.gameGain]=make('/audio/hunt-premium.m4a',0,this.gameFilter);
    [this.roomTone,this.roomGain]=make('/audio/kitchen-roomtone.m4a',0,this.ambience!);
    void this.menuMusic.play().catch(()=>{});
    void this.roomTone.play().catch(()=>{});
  }

  private duckMusic(depth=.62):void {
    if(!this.ctx||!this.musicDuck)return;
    const t=this.ctx.currentTime,g=this.musicDuck.gain;
    g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);
    g.linearRampToValueAtTime(depth,t+.045);
    g.setValueAtTime(depth,t+.19);
    g.setTargetAtTime(1,t+.19,.27);
  }

  private one(file:File,volume:number,bus:'effects'|'foley'='effects',rate=1,delay=0):void {
    const ctx=this.ctx,buffer=this.buffers.get(file),destination=bus==='effects'?this.effects:this.foley;
    if(!ctx||!buffer||!destination)return;
    const source=ctx.createBufferSource(),gain=ctx.createGain();
    source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=volume;
    source.connect(gain);gain.connect(destination);
    source.onended=()=>{source.disconnect();gain.disconnect();};
    source.start(ctx.currentTime+delay);
  }
  play(kind:Sound,surface:Surface='wood'):void {
    if(!this.ctx)return;
    if(kind==='morph'||kind==='fire'||kind==='roundStart'||kind==='eliminate')this.duckMusic(kind==='roundStart' ? .55 : .68);
    if(kind==='step'){
      const file=`footstep_${surface}_${this.stepIndex++%2?'002':'000'}.m4a` as File;
      this.one(file,.31,'foley',.97+Math.random()*.06);return;
    }
    if(kind==='shuffle'){this.one('bookPlace1.m4a',.17,'foley',.9+Math.random()*.12);return;}
    if(kind==='fire'){
      this.one('metalClick.m4a',.36,'effects',1.05);
      this.one('swish-strong.m4a',.46,'effects',1.07);
      this.one('impactPlank_medium_000.m4a',.48,'effects',1.1,.025);
      return;
    }
    if(kind==='hit'){this.one('impactGeneric_light_001.m4a',.56);this.one('impactMetal_light_002.m4a',.15,'effects',1.35,.022);return;}
    if(kind==='morph'){
      this.one('swish-soft.m4a',.63,'effects',1.02);
      this.one('cloth1.m4a',.22,'foley',1.1,.035);
      this.one('impactGeneric_light_001.m4a',.18,'effects',1.25,.1);
      return;
    }
    if(kind==='unmorph'){this.one('swish-soft.m4a',.38,'effects',.84);this.one('cloth1.m4a',.2,'foley',.9,.03);return;}
    if(kind==='eliminate'){this.one('impactMetal_light_002.m4a',.48);return;}
    if(kind==='penalty'){this.one('dropLeather.m4a',.32,'foley',.84);return;}
    if(kind==='aim'){this.one('metalClick.m4a',.16,'foley',1.26);return;}
    if(kind==='button'){this.one('metalClick.m4a',.13,'foley',1.32);return;}
    if(kind==='countdown'){this.one('metalClick.m4a',.13,'foley',1.5);return;}
    if(kind==='roundStart'){this.one('swish-strong.m4a',.28);this.one('impactMetal_light_002.m4a',.27,'effects',1.13,.08);return;}
    if(kind==='victory'){this.one('impactMetal_light_002.m4a',.36);this.one('cloth1.m4a',.22,'foley',1.2,.14);return;}
    if(kind==='defeat')this.one('dropLeather.m4a',.35,'foley',.8);
  }
}
