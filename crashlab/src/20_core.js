'use strict';
/* ============================================================
   CRASH LAB — core utilities / storage / audio
   ============================================================ */
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
const sign=v=>v<0?-1:1;
const DEG=Math.PI/180;
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
const fin=v=>Number.isFinite(v);
function fmtTime(ms){if(ms==null||!fin(ms))return"--:--.---";ms=Math.max(0,ms|0);
  const m=(ms/60000)|0,s=((ms%60000)/1000)|0,x=ms%1000;
  return m+":"+String(s).padStart(2,"0")+"."+String(x).padStart(3,"0");}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

/* ---------- persistent storage (window.storage > localStorage > memory) ---------- */
const Store=(()=>{
  const mem={};let backend="mem";
  try{if(typeof localStorage!=="undefined"){localStorage.setItem("__cl_t","1");localStorage.removeItem("__cl_t");backend="ls";}}catch(e){}
  const rawGet=k=>{try{
      if(typeof window.storage?.getItem==="function"){const r=window.storage.getItem(k);if(r&&typeof r.then==="function")return null;return r;}
    }catch(e){}
    if(backend==="ls"){try{return localStorage.getItem(k);}catch(e){}}
    return (k in mem)?mem[k]:null;};
  const rawSet=(k,v)=>{let ok=false;
    try{if(typeof window.storage?.setItem==="function"){window.storage.setItem(k,v);ok=true;}}catch(e){}
    if(backend==="ls"){try{localStorage.setItem(k,v);ok=true;}catch(e){}}
    mem[k]=v;return ok;};
  const rawDel=k=>{try{window.storage?.removeItem&&window.storage.removeItem(k);}catch(e){}
    if(backend==="ls"){try{localStorage.removeItem(k);}catch(e){}}delete mem[k];};
  return{
    get(k,def){const s=rawGet("crashlab:"+k);if(s==null)return def;
      try{return JSON.parse(s);}catch(e){rawDel("crashlab:"+k);return def;}},
    set(k,v){try{const s=JSON.stringify(v);if(!rawSet("crashlab:"+k,s))setTimeout(()=>rawSet("crashlab:"+k,s),400);}catch(e){}},
    del(k){rawDel("crashlab:"+k);},
    keys(pre){const out=[];try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);
      if(k&&k.startsWith("crashlab:"+pre))out.push(k.slice(9));}}catch(e){for(const k in mem)if(k.startsWith("crashlab:"+pre))out.push(k.slice(9));}
      return out;}
  };
})();

/* ---------- settings ---------- */
const Settings=Object.assign({
  assist:"casual",       // casual | sport | sim
  absOn:true,tcsOn:true,ctrSteer:true,stab:true,
  steerMode:"slider",    // slider | buttons | tilt
  sensitivity:1.0,
  camShake:true,shadows:true,quality:"auto", // auto|high|low
  sound:true,volume:0.8,
  autoSlowmo:true,debug:false,
  autoReport:true,       // 충돌 후 리포트 자동 표시
},Store.get("settings",{}));
function applyAssistPreset(p){Settings.assist=p;
  if(p==="casual"){Settings.absOn=Settings.tcsOn=Settings.ctrSteer=Settings.stab=true;}
  else if(p==="sport"){Settings.absOn=Settings.tcsOn=true;Settings.ctrSteer=Settings.stab=false;}
  else{Settings.absOn=Settings.tcsOn=Settings.ctrSteer=Settings.stab=false;}
  saveSettings();}
function saveSettings(){Store.set("settings",Settings);}

/* ---------- records ---------- */
const Records=Store.get("records",{});   // key: mode|map|extra -> value
function getRec(k){return Records[k];}
function setRec(k,v){Records[k]=v;Store.set("records",Records);}

/* ---------- procedural audio ---------- */
const Sfx=(()=>{
  let ctx=null,master=null,engA=null,engB=null,engNoise=null,engGain=null,engBGain=null,noiseGain=null,
      skidSrc=null,skidGain=null,skidFilt=null,windGain=null,started=false;
  function noiseBuffer(c){const len=c.sampleRate*1.2,b=c.createBuffer(1,len,c.sampleRate),d=b.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=Math.random()*2-1;return b;}
  function init(){if(started)return;started=true;
    try{
      ctx=new (window.AudioContext||window.webkitAudioContext)();
      master=ctx.createGain();master.gain.value=Settings.sound?Settings.volume:0;master.connect(ctx.destination);
      const nb=noiseBuffer(ctx);
      // engine: two detuned saws + noise layer
      engA=ctx.createOscillator();engA.type="sawtooth";engA.frequency.value=40;
      engB=ctx.createOscillator();engB.type="square";engB.frequency.value=60;
      engGain=ctx.createGain();engGain.gain.value=0;engBGain=ctx.createGain();engBGain.gain.value=0;
      const engFilt=ctx.createBiquadFilter();engFilt.type="lowpass";engFilt.frequency.value=900;engFilt.Q.value=2;
      engA.connect(engGain);engB.connect(engBGain);engGain.connect(engFilt);engBGain.connect(engFilt);engFilt.connect(master);
      engNoise=ctx.createBufferSource();engNoise.buffer=nb;engNoise.loop=true;
      noiseGain=ctx.createGain();noiseGain.gain.value=0;
      const nf=ctx.createBiquadFilter();nf.type="bandpass";nf.frequency.value=300;nf.Q.value=.7;
      engNoise.connect(nf);nf.connect(noiseGain);noiseGain.connect(master);
      // skid
      skidSrc=ctx.createBufferSource();skidSrc.buffer=nb;skidSrc.loop=true;skidSrc.playbackRate.value=.8;
      skidFilt=ctx.createBiquadFilter();skidFilt.type="bandpass";skidFilt.frequency.value=1400;skidFilt.Q.value=1.6;
      skidGain=ctx.createGain();skidGain.gain.value=0;
      skidSrc.connect(skidFilt);skidFilt.connect(skidGain);skidGain.connect(master);
      // wind
      const wSrc=ctx.createBufferSource();wSrc.buffer=nb;wSrc.loop=true;
      const wf=ctx.createBiquadFilter();wf.type="lowpass";wf.frequency.value=500;
      windGain=ctx.createGain();windGain.gain.value=0;
      wSrc.connect(wf);wf.connect(windGain);windGain.connect(master);
      engA.start();engB.start();engNoise.start();skidSrc.start();wSrc.start();
    }catch(e){ctx=null;}
  }
  function resume(){if(!ctx){init();}if(ctx&&ctx.state==="suspended")ctx.resume().catch(()=>{});}
  function setMaster(){if(master)master.gain.value=Settings.sound?Settings.volume:0;}
  function engine(rpm,throttle,on){if(!ctx||!on){if(engGain){engGain.gain.value*=.9;engBGain.gain.value*=.9;noiseGain.gain.value*=.9;}return;}
    const f=30+rpm/7200*150;
    engA.frequency.setTargetAtTime(f,ctx.currentTime,.02);
    engB.frequency.setTargetAtTime(f*1.5,ctx.currentTime,.02);
    const g=.05+throttle*.12+rpm/7200*.05;
    engGain.gain.setTargetAtTime(g,ctx.currentTime,.05);
    engBGain.gain.setTargetAtTime(g*.4,ctx.currentTime,.05);
    noiseGain.gain.setTargetAtTime(.02+throttle*.05,ctx.currentTime,.05);}
  function skid(amt){if(!ctx)return;skidGain.gain.setTargetAtTime(clamp(amt,0,1)*.24,ctx.currentTime,.06);
    skidFilt.frequency.setTargetAtTime(1000+amt*900,ctx.currentTime,.06);}
  function wind(spd){if(!ctx)return;windGain.gain.setTargetAtTime(clamp(spd/60,0,1)*.08,ctx.currentTime,.15);}
  function impact(str){if(!ctx)return;str=clamp(str,0,1);const t=ctx.currentTime;
    const o=ctx.createOscillator();o.type="sine";o.frequency.setValueAtTime(90+str*60,t);o.frequency.exponentialRampToValueAtTime(35,t+.25);
    const g=ctx.createGain();g.gain.setValueAtTime(.5*str+.1,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);
    o.connect(g);g.connect(master);o.start(t);o.stop(t+.32);
    const n=ctx.createBufferSource();n.buffer=noiseBuffer(ctx);
    const nf=ctx.createBiquadFilter();nf.type="highpass";nf.frequency.value=1200;
    const ng=ctx.createGain();ng.gain.setValueAtTime(.4*str,t);ng.gain.exponentialRampToValueAtTime(.001,t+.22);
    n.connect(nf);nf.connect(ng);ng.connect(master);n.start(t);n.stop(t+.25);}
  function gearShift(){if(!ctx)return;const t=ctx.currentTime;
    const o=ctx.createOscillator();o.type="triangle";o.frequency.setValueAtTime(600,t);o.frequency.exponentialRampToValueAtTime(220,t+.07);
    const g=ctx.createGain();g.gain.setValueAtTime(.08,t);g.gain.exponentialRampToValueAtTime(.001,t+.09);
    o.connect(g);g.connect(master);o.start(t);o.stop(t+.1);}
  function beep(f,d,vol){if(!ctx)return;const t=ctx.currentTime;
    const o=ctx.createOscillator();o.type="sine";o.frequency.value=f||880;
    const g=ctx.createGain();g.gain.setValueAtTime(vol||.12,t);g.gain.exponentialRampToValueAtTime(.001,t+(d||.12));
    o.connect(g);g.connect(master);o.start(t);o.stop(t+(d||.12)+.02);}
  function click(){beep(1200,.05,.06);}
  return{resume,setMaster,engine,skid,wind,impact,gearShift,beep,click,get ready(){return !!ctx;}};
})();
