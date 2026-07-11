/* ============================================================
   Bootstrap — renderer, lights, time-of-day, main loop,
   auto-quality, stability guards
   ============================================================ */
let renderer,scene,camera,sunLight,hemiLight,headlight,skyDome,clouds;
const FPS={fps:60,ema:60,lowT:0,okT:0,tier:0};

function disposeGroup(g){
  g.traverse(o=>{
    if(o.geometry)o.geometry.dispose();
    if(o.material&&!o.material._shared){
      if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());
      else o.material.dispose();}});
}

const TOD={
  day:{horizon:0xaacdf0,zenith:0x2f6fd0,fog:0xa8c8e8,fogD:.0013,sun:0xfff4e0,sunI:1.5,
    hemi:0xcfe5ff,hemiG:0x4a5244,hemiI:.85,sunPos:[120,220,80],head:false,cloud:1},
  sunset:{horizon:0xffa25e,zenith:0x53306e,fog:0xe0916a,fogD:.0018,sun:0xffb066,sunI:1.3,
    hemi:0xffc9a0,hemiG:0x4a4038,hemiI:.7,sunPos:[220,60,-140],head:false,cloud:.9},
  night:{horizon:0x13203c,zenith:0x02040c,fog:0x0c1428,fogD:.0024,sun:0x8aa8e0,sunI:.4,
    hemi:0x36406a,hemiG:0x141820,hemiI:.65,sunPos:[-100,180,-60],head:true,cloud:.12},
};
function applyTimeOfDay(tod){
  const t=TOD[tod]||TOD.day;
  scene.background=null;
  scene.fog=new THREE.FogExp2(t.fog,t.fogD);
  sunLight.color.set(t.sun);sunLight.intensity=t.sunI;
  sunLight.position.set(...t.sunPos);
  hemiLight.color.set(t.hemi);hemiLight.groundColor.set(t.hemiG);hemiLight.intensity=t.hemiI;
  if(headlight)headlight.visible=t.head;
  // sky dome gradient
  const g=skyDome.geometry,pos=g.attributes.position;
  if(!g.attributes.color)g.setAttribute("color",new THREE.BufferAttribute(new Float32Array(pos.count*3),3));
  const col=g.attributes.color,hz2=new THREE.Color(t.horizon),zn=new THREE.Color(t.zenith),tmp=new THREE.Color();
  for(let i=0;i<pos.count;i++){
    const f=Math.pow(clamp(pos.getY(i)/1500,0,1),.55);
    tmp.copy(hz2).lerp(zn,f);
    col.setXYZ(i,tmp.r,tmp.g,tmp.b);}
  col.needsUpdate=true;
  if(clouds)clouds.material.opacity=.85*t.cloud;
}
function applyShadows(){
  const on=Settings.shadows&&FPS.tier<1;
  renderer.shadowMap.enabled=on;
  sunLight.castShadow=on;
  scene.traverse(o=>{if(o.material)o.material.needsUpdate=true;});
}

function initRenderer(){
  try{
    renderer=new THREE.WebGLRenderer({canvas:$("gl"),antialias:true,powerPreference:"high-performance"});
  }catch(err){
    $("loadTip").textContent="⚠️ WebGL을 사용할 수 없습니다 — 브라우저/기기 설정을 확인해 주세요";
    throw err;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(66,innerWidth/innerHeight,.1,2200);
  // sky dome + clouds
  skyDome=new THREE.Mesh(new THREE.SphereGeometry(1500,24,12),
    new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,fog:false}));
  skyDome.frustumCulled=false;
  scene.add(skyDome);
  const cl=[];let cseed=5;const crnd=()=>{cseed=(cseed*16807)%2147483647;return cseed/2147483647;};
  for(let k=0;k<14;k++)cl.push({geo:new THREE.SphereGeometry(1,7,5),color:0xeef2f7,
    x:(crnd()-.5)*2400,y:150+crnd()*120,z:(crnd()-.5)*2400,
    sx:60+crnd()*90,sy:10+crnd()*10,sz:40+crnd()*70});
  clouds=new THREE.Mesh(mergeGeoms(cl),new THREE.MeshBasicMaterial({vertexColors:true,fog:false,transparent:true,opacity:.85}));
  scene.add(clouds);
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
      skyDome.position.set(camera.position.x,0,camera.position.z);
      sunLight.target.position.copy(Game.veh.body.pos);
      sunLight.position.set(Game.veh.body.pos.x+TOD[Game.opts.tod].sunPos[0]*.5,
        Game.veh.body.pos.y+TOD[Game.opts.tod].sunPos[1]*.5,
        Game.veh.body.pos.z+TOD[Game.opts.tod].sunPos[2]*.5);
      renderer.render(scene,camera);
    }else if(Game.state==="menu"){
      if(Showroom.active)Showroom.update(dt);
      if(Showroom.active||Game.world)renderer.render(scene,camera);}
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
  // 🏠 홈으로(메인 메뉴)
  $("btnHome").onclick=()=>{Sfx.click();Game.exitToMenu();};
  // 🗺️ 미니맵 켜기/끄기
  $("btnMap").onclick=()=>{Sfx.click();
    const m=$("minimap");const off=m.dataset.off==="1";
    m.dataset.off=off?"0":"1";m.style.display=off?"":"none";
    $("btnMap").classList.toggle("on",!off);
    toast(off?"미니맵 ON":"미니맵 OFF");};
  // 📍 장소 이동(오픈월드)
  $("btnPlaces").onclick=()=>{Sfx.click();
    const ps=Game.world&&Game.world.places;if(!ps)return;
    const L=$("placesList");L.innerHTML="";
    ps.forEach(p=>{const b=document.createElement("button");
      b.className="btn sm";b.style.cssText="display:block;width:100%;margin:4px 0;text-align:left";
      b.textContent=p.name;
      b.onclick=()=>{Sfx.click();Game.spawnAt(p);$("placesPanel").classList.remove("on");};
      L.appendChild(b);});
    $("placesPanel").classList.add("on");};
  $("placesClose").onclick=()=>{Sfx.click();$("placesPanel").classList.remove("on");};
  $("btnLaunch").onclick=()=>{Sfx.click();Game.crash.vTarget=+$("crashSpeed").value;Game.launch();};
  $("crashSpeed").oninput=e=>{
    $("crashSpeedVal").textContent=e.target.value+" km/h";
    Game.crash.vTarget=+e.target.value;};
  // crash target select — IIHS 배리어
  const seg=$("crashTargetSeg");
  seg.innerHTML='<button class="sel">풀오버랩</button><button>스몰오버랩</button><button>폴</button>';
  for(let ti=0;ti<seg.children.length;ti++)seg.children[ti].onclick=()=>{
    Game.crash.target=ti;
    for(let k=0;k<seg.children.length;k++)seg.children[k].classList.toggle("sel",k===ti);
    Game.placeCrashCar();};
  // crash scenario select — 벽/차대차/측면/후방/샌드위치
  {const scSeg=$("crashScenSeg");
   const SCENS=[["wall","🧱 벽"],["head","🚗 차대차"],["tbone","🚙 측면"],["rear","💥 후방"],["sandwich","🚚 샌드위치"],["pole","🗼 측면 폴"]];
   scSeg.innerHTML=SCENS.map(([id,nm],i)=>'<button class="'+(i?'':'sel')+'">'+nm+'</button>').join('');
   for(let si=0;si<scSeg.children.length;si++)scSeg.children[si].onclick=()=>{
     Sfx.click();Game.crash.scen=SCENS[si][0];
     for(let k=0;k<scSeg.children.length;k++)scSeg.children[k].classList.toggle("sel",k===si);
     $("crashTargetSeg").style.display=SCENS[si][0]==="wall"?"":"none";
     Game.placeCrashCar();};}
  // 크래시 세부 설정: 충돌 각도·위치·상대 차량
  $("btnFine").onclick=()=>{Sfx.click();
    const f=$("crashFine");f.style.display=f.style.display==="none"?"":"none";};
  $("crashAng").oninput=e=>{Game.crash.ang=+e.target.value;$("crashAngVal").textContent=e.target.value+"°";
    if(Game.crash.phase==="idle")Game.placeCrashCar();};   // 실제 출발 위치·방향 즉시 이동
  $("crashOff").oninput=e=>{Game.crash.off=+e.target.value*.1;$("crashOffVal").textContent=(+e.target.value*.1).toFixed(1)+"m";
    if(Game.crash.phase==="idle")Game.placeCrashCar();};
  {const rs=$("crashRamSeg");
   rs.innerHTML=CARS.map((c,i)=>'<button class="'+(c.id==="titan"?"sel":"")+'" title="'+c.name+'">'+c.icon+'</button>').join('');
   for(let ri=0;ri<rs.children.length;ri++)rs.children[ri].onclick=()=>{
     Sfx.click();Game.crash.rammer=CARS[ri].id;
     for(let k=0;k<rs.children.length;k++)rs.children[k].classList.toggle("sel",k===ri);};}
  // 크래시 리포트 자동 표시 on/off
  {const rt=$("crashRepTgl");if(rt){rt.checked=Settings.autoReport!==false;
    rt.onchange=()=>{Settings.autoReport=rt.checked;saveSettings&&saveSettings();
      toast(rt.checked?"리포트 자동 표시 ON":"리포트 자동 표시 OFF");};}}
  // 하단 패널 접기/펼치기(충돌 테스트·자동차 랩)
  for(const[bid,pid]of[["crashHide","crashPanel"],["labHide","labPanel"]]){
    const bt=$(bid);if(!bt)continue;
    bt.onclick=()=>{Sfx.click();
      const on=$(pid).classList.toggle("tuck");
      bt.textContent=on?"▴":"▾";};}
  // 크래시 리포트 닫기(X)
  $("repClose").onclick=()=>{Sfx.click();
    $("reportPanel").classList.remove("on");
    if(Game.mode==="crash"){Game.crash.phase="idle";Game.placeCrashCar();}};
  // 주행 중 차량 즉시 교체(다음 차로 순환)
  $("btnCarSwap").onclick=()=>{Sfx.click();Game.swapCar(Game.opts.carIdx+1);};
  // 자동차 랩: 힘 슬라이더·차 넘기기·탭으로 힘 가하기
  $("labForce").oninput=e=>{$("labForceVal").textContent=e.target.value;if(Game.lab)Game.lab.force=+e.target.value;};
  $("labPrev").onclick=()=>{Sfx.click();Game.opts.carIdx=(Game.opts.carIdx-1+CARS.length)%CARS.length;Game.startGame();};
  $("labNext").onclick=()=>{Sfx.click();Game.opts.carIdx=(Game.opts.carIdx+1)%CARS.length;Game.startGame();};
  {const gl=$("gl");let px0=0,py0=0,mv=0;
   gl.addEventListener("pointerdown",e=>{px0=e.clientX;py0=e.clientY;mv=0;});
   gl.addEventListener("pointermove",e=>{mv=Math.max(mv,Math.hypot(e.clientX-px0,e.clientY-py0));});
   gl.addEventListener("pointerup",e=>{
     if(Game.mode==="lab"&&Game.state==="play"&&mv<9)Game.labPoke(e.clientX,e.clientY);});}
  $("ctlHint").textContent="";
}

/* visibility → pause (안정성 5) */
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){Input.clear();if(Game.state==="play")Game.togglePause(true);}});
addEventListener("blur",()=>Input.clear());

/* global error net (안정성) — 로딩 중이면 화면에 원인 표시 */
addEventListener("error",e=>{
  console.warn("caught:",e.message);
  try{
    const ld=$("loading");
    if(ld&&!ld.classList.contains("off"))
      $("loadTip").textContent="⚠️ "+(e.message||"오류")+(e.lineno?" (line "+e.lineno+")":"");
  }catch(_){}});
addEventListener("unhandledrejection",e=>{console.warn("caught rejection");e.preventDefault();});

/* ============ 3D 쇼룸 (메뉴 배경 라이브 씬) ============ */
const Showroom={
  group:null,vis:null,idx:-1,color:-1,t:0,active:false,Y:600,
  ensure(){
    if(this.group)return;
    this.group=new THREE.Group();
    this.group.position.y=this.Y;
    const plat=new THREE.Mesh(new THREE.CylinderGeometry(4.6,4.9,.26,40),
      new THREE.MeshPhongMaterial({color:0x171b22,shininess:90,specular:0x35404e}));
    plat.position.y=-.13;plat.receiveShadow=true;
    this.group.add(plat);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(4.75,.05,8,48),
      new THREE.MeshBasicMaterial({color:0xff7a1a}));
    ring.rotation.x=Math.PI/2;ring.position.y=.02;
    this.group.add(ring);
    const floor=new THREE.Mesh(new THREE.CylinderGeometry(30,30,.1,32),
      new THREE.MeshPhongMaterial({color:0x0d1017,shininess:30}));
    floor.position.y=-.3;floor.receiveShadow=true;
    this.group.add(floor);
    this.spot=new THREE.SpotLight(0xfff2dd,4.2,70,.75,.45,1);
    this.spot.position.set(6,12,6);this.spot.target=plat;
    this.group.add(this.spot);
    this.carRoot=new THREE.Group();
    this.group.add(this.carRoot);},
  show(idx,color){
    this.ensure();
    if(idx===this.idx&&color===this.color&&this.vis)return;
    if(this.vis){this.vis.dispose();this.vis=null;}
    this.idx=idx;this.color=color;
    const spec=CARS[idx];
    this.vis=new CarVisual(spec,spec.colors[color%spec.colors.length]);
    for(let i=0;i<4;i++){
      const m=this.vis.wheelMeshes[i];
      m.position.set((i%2?1:-1)*(spec.wheels.trackVis||spec.wheels.track),
        spec.modelWheelY!==undefined?spec.modelWheelY:spec.wheels.y,
        i<2?spec.wheels.front:-spec.wheels.rear);}
    const groundY=(spec.modelWheelY!==undefined?spec.modelWheelY:spec.wheels.y)-spec.wheels.radius;
    this.vis.group.position.y=-groundY;
    this.carRoot.clear();this.carRoot.add(this.vis.group);},
  enter(){
    this.ensure();
    if(!this.group.parent)scene.add(this.group);
    this.active=true;
    if(this.idx<0){
      const last=Store.get("lastPlay",null);
      this.show(clamp(last?.carIdx??1,0,CARS.length-1),last?.color??0);}
    applyTimeOfDay("sunset");},
  leave(){this.active=false;if(this.group?.parent)scene.remove(this.group);},
  update(dt){
    this.t+=dt;
    this.carRoot.rotation.y=this.t*.45;
    const wide=innerWidth>innerHeight;
    camera.position.set(-2.7,this.Y+2.0,6.6);
    camera.lookAt(wide?-2.15:0,this.Y+(wide?.75:1.7),0);   // 차가 화면 우측(가로)/하단(세로)에 오도록
    skyDome.position.set(camera.position.x,0,camera.position.z);},
};

/* 차량 3D 프리뷰 썸네일 (차량 선택 카드용) */
const CARTHUMBS={};
function makeCarThumbs(){ // 메인 렌더러의 렌더타겟 사용 (모바일에서 2차 GL 컨텍스트 실패 방지)
  try{
    const RW=560,RH=336;
    const rt=new THREE.WebGLRenderTarget(RW,RH);
    const sc=new THREE.Scene();
    const cam2=new THREE.PerspectiveCamera(28,RW/RH,.1,60);
    sc.add(new THREE.HemisphereLight(0xd8e8ff,0x3a4038,.95));
    const dl=new THREE.DirectionalLight(0xfff4e0,1.7);dl.position.set(4,7,3);sc.add(dl);
    const px=new Uint8Array(RW*RH*4);
    const cnv=document.createElement("canvas");cnv.width=RW;cnv.height=RH;
    const c2=cnv.getContext("2d");
    const img=c2.createImageData(RW,RH);
    for(const spec of CARS){
      const vis=new CarVisual(spec,spec.colors[0]);
      for(let i=0;i<4;i++){
        const m=vis.wheelMeshes[i];
        m.position.set((i%2?1:-1)*(spec.wheels.trackVis||spec.wheels.track),
          spec.modelWheelY!==undefined?spec.modelWheelY:spec.wheels.y,
          i<2?spec.wheels.front:-spec.wheels.rear);}
      vis.group.rotation.y=-.7;
      sc.add(vis.group);
      const L=spec.body.hz+spec.body.hy;
      cam2.position.set(L*1.35,L*.8,L*1.8);cam2.lookAt(0,-spec.body.hy*.15,0);
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000,0);
      renderer.clear();
      renderer.render(sc,cam2);
      renderer.readRenderTargetPixels(rt,0,0,RW,RH,px);
      renderer.setRenderTarget(null);
      // Y플립 + 감마 보정하여 2D 캔버스로
      for(let y=0;y<RH;y++)for(let x=0;x<RW;x++){
        const si=((RH-1-y)*RW+x)*4,di=(y*RW+x)*4;
        img.data[di]=Math.round(Math.pow(px[si]/255,1/2.2)*255);
        img.data[di+1]=Math.round(Math.pow(px[si+1]/255,1/2.2)*255);
        img.data[di+2]=Math.round(Math.pow(px[si+2]/255,1/2.2)*255);
        img.data[di+3]=px[si+3];}
      c2.putImageData(img,0,0);
      CARTHUMBS[spec.id]=cnv.toDataURL("image/png");
      sc.remove(vis.group);vis.dispose();}
    rt.dispose();
  }catch(e){console.warn("thumb fail:",e.message);}
}

/* boot */
function boot(){
  const steps=[
    ["차량 모델 로드…",()=>{for(const c of CARS){
      if(!c.modelScale)applyModelSpec(c);
      if(!c._tuned){c._tuned=true;                 // 서스펜션 튜닝(차종별 캐릭터 + 강한 롤저항)
        const sport=c.id==="gt"||c.id==="veloce";  // 스포츠카: 딱딱하게(짧은 스트로크·단단한 스프링)
        if(sport){
          c.susp.k*=1.45;                           // 스프링 강성 ↑ → 노면 그대로 전달(딱딱)
          c.susp.c*=1.25;                           // 댐핑 ↑ → 출렁임 억제
          c.susp.rebMul=1.3;                        // 리바운드 타이트(빠르고 절도있는 복귀 — 실차 스포츠 댐퍼)
          c.susp.travel*=.72;                       // 스트로크 짧게 → 방지턱 충격 그대로 느낌
          if(c.id==="veloce")c.susp.rest+=.04;      // 포르쉐: 차고 조금 상승(턱 긁힘 여유)
          c.arb*=2.1;}                              // 롤 강성 매우 높게(코너 평탄·전복 억제)
        else if(c.id==="maybach"){                  // 마이바흐 GLS: 에어서스(실차형)
          c.susp.k*=.68;                            // 더 부드러운 스프링 → 방지턱에서 스트로크가 크게 움직임
          c.susp.c*=.74;                            // 압축 댐핑 낮게 → 서스가 실제로 깊게 눌림(차체로 전달 안 됨)
          c.susp.rebMul=3.8;                        // 리바운드 댐핑 매우 강함 → 넘은 뒤 차체가 붕 뜨지 않음
          c.susp.sky=4300;                          // 스카이훅 강화: 방지턱 이후 차체 헤이브(부양)를 즉시 흡수
          c.susp.rest+=.07;                         // 에어서스 리프트: 정하중 처짐 보상 → 바퀴가 아치에 제대로 보임
          c.susp.travel*=2.6;                       // 위쪽 스트로크 넉넉히 → 더 높은 방지턱도 스트로크 안에서 흡수
          c.arb*=2.6;}                              // 매우 높은 롤 강성 → 롤·가속 쏠림 최소
        else if(c.id==="offroad"||c.id==="offroadc"){ // 오프로드 몬스터(오픈탑·하드탑): 지프식 하이 리프트 + 초롱트래블
          c.susp.travel*=2.1;                       // 트래블 엄청 크게(≈53cm) → 록크롤·후프스 흡수
          c.susp.rest+=.27;                         // 빅 리프트 킷 → 지프처럼 차고 대폭 상승(바퀴 위 아치갭 큼)
          c.susp.k*=.88;c.susp.c*=.95;              // 부드러운 롱스트로크 세팅
          c.susp.rebMul=1.15;                       // 리바운드 자유롭게 → 바퀴가 지형을 따라감(아티큘레이션)
          c.arb*=2.3;}                              // 높아진 무게중심 보상(전복 억제)
        else{
          c.susp.travel*=1.2;                       // 컴포트/오프로드: 스트로크 확대(다이브·바운스)
          c.susp.c*=.85;                            // 리바운드 완화 → 생동감
          c.arb*=1.5;}}}}],                         // 롤 강성 상향 → 전복 방지
    ["렌더러 초기화…",()=>initRenderer()],
    ["입력 시스템…",()=>{Input.init();initHudButtons();initGauge();}],
    ["차량 프리뷰 렌더링…",()=>makeCarThumbs()],
    ["에디터 준비…",()=>Editor.init()],
    ["메뉴 구성…",()=>{UI.init();$("debugHud").classList.toggle("on",Settings.debug);}],
    ["완료!",()=>{
      Showroom.enter();
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
/* 디버깅·테스트용 전역 노출 (미니파이 IIFE 대비) */
Object.assign(window,{$,Game,MAPS,CARS,Editor,Store,FPS,UI,Input,Settings,Sfx,CarVisual,Vehicle,
  applyAssistPreset,buildCustomMap,toast,SURF_ID,DEG});
Object.defineProperty(window,"scene",{get:()=>scene});
Object.defineProperty(window,"camera",{get:()=>camera});
Object.defineProperty(window,"renderer",{get:()=>renderer});
window._vA=_vA;
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
else boot();
