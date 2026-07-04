/* ============================================================
   Bootstrap — renderer, lights, time-of-day, main loop,
   auto-quality, stability guards
   ============================================================ */
let renderer,scene,camera,sunLight,hemiLight,headlight,skyDome;
const FPS={fps:60,ema:60,lowT:0,okT:0,tier:0};

function disposeGroup(g){
  g.traverse(o=>{
    if(o.geometry)o.geometry.dispose();
    if(o.material&&!o.material._shared){
      if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());
      else o.material.dispose();}});
}

const TOD={
  day:{sky:0x87b8e8,fog:0xa8c8e8,fogD:.0016,sun:0xfff4e0,sunI:1.15,hemi:0xcfe5ff,hemiG:0x51584a,hemiI:.75,
    sunPos:[120,220,80],head:false},
  sunset:{sky:0xf2814d,fog:0xe0916a,fogD:.0022,sun:0xffb066,sunI:1.0,hemi:0xffc9a0,hemiG:0x4a4038,hemiI:.6,
    sunPos:[220,60,-140],head:false},
  night:{sky:0x0a1024,fog:0x0c1428,fogD:.0028,sun:0x8aa8e0,sunI:.28,hemi:0x36406a,hemiG:0x141820,hemiI:.5,
    sunPos:[-100,180,-60],head:true},
};
function applyTimeOfDay(tod){
  const t=TOD[tod]||TOD.day;
  scene.background=new THREE.Color(t.sky);
  scene.fog=new THREE.FogExp2(t.fog,t.fogD);
  sunLight.color.set(t.sun);sunLight.intensity=t.sunI;
  sunLight.position.set(...t.sunPos);
  hemiLight.color.set(t.hemi);hemiLight.groundColor.set(t.hemiG);hemiLight.intensity=t.hemiI;
  if(headlight)headlight.visible=t.head;
}
function applyShadows(){
  const on=Settings.shadows&&FPS.tier<1;
  renderer.shadowMap.enabled=on;
  sunLight.castShadow=on;
  scene.traverse(o=>{if(o.material)o.material.needsUpdate=true;});
}

function initRenderer(){
  renderer=new THREE.WebGLRenderer({canvas:$("gl"),antialias:true,powerPreference:"high-performance"});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.type=THREE.PCFShadowMap;
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(66,innerWidth/innerHeight,.1,1600);
  sunLight=new THREE.DirectionalLight(0xffffff,1);
  sunLight.shadow.mapSize.set(1024,1024);
  const sc=90;
  sunLight.shadow.camera.left=-sc;sunLight.shadow.camera.right=sc;
  sunLight.shadow.camera.top=sc;sunLight.shadow.camera.bottom=-sc;
  sunLight.shadow.camera.far=700;sunLight.shadow.bias=-.0004;
  scene.add(sunLight);scene.add(sunLight.target);
  hemiLight=new THREE.HemisphereLight(0xcfe5ff,0x51584a,.75);
  scene.add(hemiLight);
  headlight=new THREE.SpotLight(0xfff2cc,2.2,80,.5,.45,1);
  headlight.visible=false;
  scene.add(headlight);scene.add(headlight.target);
  Fx.init(scene);
  Game.cam=new GameCamera(camera);
  applyShadows();
  addEventListener("resize",()=>{
    camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);});
}

/* auto quality (안정성 6) */
function autoQuality(dt){
  FPS.ema=lerp(FPS.ema,1/Math.max(dt,1e-3),.05);FPS.fps=FPS.ema;
  if(Settings.quality!=="auto"||Game.state!=="play")return;
  if(FPS.ema<45){FPS.lowT+=dt;FPS.okT=0;}
  else{FPS.okT+=dt;FPS.lowT=0;}
  if(FPS.lowT>3&&FPS.tier<3){
    FPS.tier++;FPS.lowT=0;
    if(FPS.tier===1)applyShadows();
    if(FPS.tier===2)Fx.setQuality(.5);
    if(FPS.tier===3)renderer.setPixelRatio(Math.min(devicePixelRatio,2)*.85);}
}

/* main loop */
let _last=performance.now();
function mainLoop(t){
  requestAnimationFrame(mainLoop);
  let dt=(t-_last)/1000;_last=t;
  if(dt>.05)dt=.05;           // frame clamp (안정성 1)
  autoQuality(dt);
  try{
    if(Game.state==="play"){
      Game.frame(dt);
      Input.updateKnob();
      // headlight follows player
      if(headlight&&headlight.visible&&Game.veh){
        const b=Game.veh.body;
        _t6.set(0,0,Game.veh.spec.body.hz);b.localToWorld(_t6,headlight.position);
        _t7.set(0,-1.5,30);b.localToWorld(_t7,headlight.target.position);}
      sunLight.target.position.copy(Game.veh.body.pos);
      sunLight.position.set(Game.veh.body.pos.x+TOD[Game.opts.tod].sunPos[0]*.5,
        Game.veh.body.pos.y+TOD[Game.opts.tod].sunPos[1]*.5,
        Game.veh.body.pos.z+TOD[Game.opts.tod].sunPos[2]*.5);
      renderer.render(scene,camera);
    }else if(Game.state==="menu"&&Game.world){
      // idle orbit behind menu
      renderer.render(scene,camera);}
  }catch(err){
    console.error(err);
    if(!mainLoop._err){mainLoop._err=true;toast("⚠️ 오류 복구 중…");
      try{Game.veh&&Game.resetCar();}catch(e2){}
      setTimeout(()=>mainLoop._err=false,2000);}}
}

/* buttons */
function initHudButtons(){
  $("btnPause").onclick=()=>{Sfx.click();Game.togglePause();};
  $("btnReset").onclick=()=>{Sfx.click();Game.resetCar();};
  $("btnCam").onclick=()=>{Sfx.click();toast("카메라: "+Game.cam.cycle());};
  $("btnSlow").onclick=()=>{Sfx.click();Game.manualSlow=!Game.manualSlow;
    $("btnSlow").classList.toggle("on",Game.manualSlow);
    toast(Game.manualSlow?"슬로모션 ON":"슬로모션 OFF");};
  $("btnRepair").onclick=()=>{Sfx.click();Game.repair();};
  $("btnLaunch").onclick=()=>{Sfx.click();Game.crash.vTarget=+$("crashSpeed").value;Game.launch();};
  $("crashSpeed").oninput=e=>{
    $("crashSpeedVal").textContent=e.target.value+" km/h";
    Game.crash.vTarget=+e.target.value;};
  // crash target select
  const seg=$("crashTargetSeg");
  seg.innerHTML='<button class="sel">콘크리트 벽</button><button>배리어</button>';
  seg.children[0].onclick=()=>{Game.crash.target=0;seg.children[0].classList.add("sel");
    seg.children[1].classList.remove("sel");Game.placeCrashCar();};
  seg.children[1].onclick=()=>{Game.crash.target=1;seg.children[1].classList.add("sel");
    seg.children[0].classList.remove("sel");Game.placeCrashCar();};
  $("ctlHint").textContent="";
}

/* visibility → pause (안정성 5) */
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){Input.clear();if(Game.state==="play")Game.togglePause(true);}});
addEventListener("blur",()=>Input.clear());

/* global error net (안정성) */
addEventListener("error",e=>{console.warn("caught:",e.message);});
addEventListener("unhandledrejection",e=>{console.warn("caught rejection");e.preventDefault();});

/* boot */
function boot(){
  const steps=[
    ["렌더러 초기화…",()=>initRenderer()],
    ["입력 시스템…",()=>{Input.init();initHudButtons();}],
    ["에디터 준비…",()=>Editor.init()],
    ["메뉴 구성…",()=>{UI.init();$("debugHud").classList.toggle("on",Settings.debug);}],
    ["완료!",()=>{
      $("loading").classList.add("off");$("loading").classList.remove("on");
      requestAnimationFrame(mainLoop);}]];
  let i=0;
  const run=()=>{
    if(i>=steps.length)return;
    const[msg,fn]=steps[i];
    $("loadTip").textContent=msg;
    $("loadBar").firstElementChild.style.width=((i+1)/steps.length*100)+"%";
    try{fn();}catch(e){console.error(e);$("loadTip").textContent="⚠️ "+e.message;}
    i++;setTimeout(run,60);};
  run();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
else boot();
