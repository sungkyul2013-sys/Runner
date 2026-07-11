/* ============================================================
   Game — state machine, fixed-step loop, modes, AI, HUD
   ============================================================ */
const MODES=[
 {id:"free", name:"자유주행",icon:"🚗",desc:"모든 맵 × 모든 차량. 손상·시간대 설정 자유."},
 {id:"crash",name:"크래시 테스트",icon:"💥",desc:"벽·차대차·측면·후방·샌드위치 — 5가지 시나리오, 슬로모 리플레이와 손상 리포트."},
 {id:"lab",  name:"자동차 랩",icon:"🔬",desc:"차량 스펙·디자인 감상 + 원하는 지점을 눌러 힘을 가하는 변형 실험."},
 {id:"time", name:"타임어택",icon:"⏱️",desc:"랩타임 · 섹터 기록. 개인 베스트 영구 저장."},
 {id:"race", name:"AI 레이스",icon:"🏆",desc:"AI 3~5대와 접전. AI 차량에도 손상 물리 적용."},
 {id:"drift",name:"드리프트 스코어",icon:"🌀",desc:"각도×속도×콤보. 벽 스침 보너스, 스핀하면 콤보 소멸."},
 {id:"editor",name:"맵 에디터",icon:"🛠️",desc:"탑뷰 그리드에 도로·램프·벽 배치. 내 맵에서 바로 주행."},
];
/* 크래시 테스트 타깃 — 프루빙 그라운드 IIHS 배리어 좌표와 일치
   x:배리어 중심, z:배리어 위치, lx:차량 주행 라인(스몰오버랩은 오프셋으로 25% 중첩) */
const CRASH_LANES=[
  {x:-40,z:320,lx:-40, name:"정면 풀오버랩"},
  {x:30, z:320,lx:32.6,name:"25% 스몰오버랩"},
  {x:85, z:320,lx:85,  name:"폴 충돌"}];

const Game={
  state:"menu",paused:false,
  mode:"free",mapDef:null,world:null,mapGroup:null,
  veh:null,vis:null,ais:[],
  cam:null,acc:0,slowmoT:0,manualSlow:false,
  opts:{tod:"day",damage:true,laps:3,aiCount:3,color:0,carIdx:0,mapId:"proving"},
  physMs:0,shakeT:0,trapCool:0,
  /* mode-specific */
  crash:{phase:"idle",scen:"wall",target:0,vTarget:60,ang:0,off:0,peakG:0,impactV:0,parted:0,settleT:0,hitDone:false},
  drones:[],   // 시나리오용 무인 차량(차대차·샌드위치 등)
  timing:null,race:null,drift:null,

  startGame(){
    const o=this.opts;
    if(this.mode==="lab")o.mapId="proving";   // 랩은 프루빙 스키드패드를 쇼룸으로 사용
    // build map
    if(this.mapGroup){scene.remove(this.mapGroup);disposeGroup(this.mapGroup);}
    let built;
    if(o.mapId.startsWith("custom:")){
      const data=Store.get("maps:"+o.mapId.slice(7),null);
      if(!data){toast("맵 데이터를 찾을 수 없습니다");return;}
      built=buildCustomMap(data);
    }else built=MAPS.find(m=>m.id===o.mapId).build();
    this.world=built.world;this.mapGroup=built.group;
    scene.add(this.mapGroup);
    this.mapDef=this.world.mapDef;
    // player vehicle
    if(this.vis)this.vis.dispose();
    const spec=CARS[o.carIdx];
    this.veh=new Vehicle(spec,this.world);
    this.veh.damageOn=o.damage||this.mode==="crash";
    this.vis=new CarVisual(spec,spec.colors[o.color%spec.colors.length]);
    this.vis.storeHomes();
    scene.add(this.vis.group);
    const sp=this.world.spawn;
    this.veh.reset(sp.x,sp.z,sp.yaw);
    this.applyAssists(this.veh);
    // AI
    for(const a of this.ais)a.vis.dispose();
    this.ais=[];
    this.clearDrones();
    if(this.mode==="race")this.setupRace();
    if(this.mode==="time")this.setupTiming();
    if(this.mode==="drift")this.drift={score:0,run:0,combo:1,driftT:0,idleT:0,best:getRec("drift|"+o.mapId)||0,wallBonus:false};
    if(this.mode==="crash"){this.crash.phase="idle";this.crash.vTarget=parseInt($("crashSpeed").value);this.placeCrashCar();}
    if(this.mode==="lab")this.setupLab();
    Fx.reset();resetProps(this.world);
    buildMinimap();
    Store.set("lastPlay",{mode:this.mode,carIdx:o.carIdx,mapId:o.mapId,color:o.color,tod:o.tod});
    applyTimeOfDay(o.tod);
    this.cam.mode="chase";this.cam.dist=spec.id==="titan"?10:7;this.cam.orbitYaw=0;
    this.cam.pos.set(sp.x-Math.sin(sp.yaw)*8,this.world.height(sp.x,sp.z)+4,sp.z-Math.cos(sp.yaw)*8);
    if(typeof Showroom!=="undefined")Showroom.leave();
    this.state="play";this.paused=false;this.acc=0;this.slowmoT=0;this.manualSlow=false;
    $("btnSlow").classList.remove("on");
    $("menu").classList.remove("on");$("hud").classList.add("on");$("editorScr").classList.remove("on");
    $("pausePanel").classList.remove("on");$("reportPanel").classList.remove("on");$("resultPanel").classList.remove("on");
    $("crashPanel").classList.toggle("on",this.mode==="crash");
    $("labPanel").classList.toggle("on",this.mode==="lab");
    const noDrive=this.mode==="crash"||this.mode==="lab";
    $("speedo").style.display=noDrive?"none":"";
    $("ctlL").style.display=this.mode==="lab"?"none":"";
    $("ctlR").style.display=this.mode==="lab"?"none":"";
    $("btnHB").style.display=this.mode==="lab"?"none":"";
    $("minimap").style.display=(noDrive||$("minimap").dataset.off==="1")?"none":"";
    $("btnMap").classList.toggle("on",$("minimap").dataset.off==="1");
    $("btnRepair").style.display=(this.mode==="free"||this.mode==="crash"||this.mode==="drift"||this.mode==="lab")?"":"none";
    $("btnPlaces").style.display=(this.world.places&&!noDrive)?"":"none";
    $("placesPanel").classList.remove("on");
    Sfx.resume();
    updateModeWidget();
    toast(this.mapDef.name+" — "+spec.name,1800);
  },
  applyAssists(v){
    v.assists.abs=Settings.absOn;v.assists.tcs=Settings.tcsOn;
    v.assists.ctr=Settings.ctrSteer;v.assists.stab=Settings.stab;},
  exitToMenu(){
    this.state="menu";this.paused=false;
    $("hud").classList.remove("on");$("pausePanel").classList.remove("on");
    $("reportPanel").classList.remove("on");$("resultPanel").classList.remove("on");
    $("menu").classList.add("on");
    Sfx.engine(0,0,false);Sfx.skid(0);Sfx.wind(0);
    if(typeof Showroom!=="undefined")Showroom.enter();
    UI.show("home");},

  /* ---------- crash test ---------- */
  spawnDrone(carId,x,z,yaw,kmh){
    const spec=CARS.find(cc=>cc.id===carId)||CARS[1];
    const veh=new Vehicle(spec,this.world);
    veh.isAI=true;veh.isDrone=true;veh.damageOn=true;
    veh.assists.abs=veh.assists.tcs=veh.assists.ctr=veh.assists.stab=true;
    veh.reset(x,z,yaw);
    if(kmh){const v0=kmh/3.6;
      veh.body.vel.set(Math.sin(yaw)*v0,0,Math.cos(yaw)*v0);
      for(const w of veh.wheels)w.omega=v0/w.radius;}
    const vis=new CarVisual(spec,spec.colors[1%spec.colors.length]);
    vis.storeHomes();scene.add(vis.group);
    const d={veh,vis,go:!!kmh};
    this.drones.push(d);return d;},
  clearDrones(){for(const d of this.drones)d.vis.dispose();this.drones.length=0;},
  placeCrashCar(){
    this.clearDrones();
    const c=this.crash;
    const off=c.off||0,ang=(c.ang||0)*DEG;
    if(c.scen==="wall"){
      const L=CRASH_LANES[c.target]||CRASH_LANES[0];
      this.veh.reset(L.lx+off-Math.tan(ang)*68,L.z-70,ang,false);}   // 세부설정이 실제 출발 위치·각도에 반영
    else if(c.scen==="head")this.veh.reset(-140+off,-80,ang,false);
    else this.veh.reset(-140,40,0,false);        // 정차(피충돌) 시나리오
    this.vis.repair();this.veh.clearDamage();
    c.phase="idle";
    updateModeWidget();},
  launch(){
    const c=this.crash,v=this.veh;
    this.vis.repair();v.clearDamage();this.clearDrones();
    const v0=c.vTarget/3.6;
    const ang=(c.ang||0)*DEG,off=c.off||0;       // 세부 설정: 충돌 각도·위치 오프셋
    if(c.scen==="wall"){
      const L=CRASH_LANES[c.target]||CRASH_LANES[0];
      const z0=ang?Math.max(L.z-14-v0*1.1,-100):Math.max(L.z-16-v0*2.2,-220);
      // 각도 사출 시 시작 x를 역보정 → 궤적이 정확히 배리어(오프셋 지점)를 통과
      const aimX=L.lx+off-Math.tan(ang)*(L.z-2-z0);
      v.reset(aimX,z0,ang,false);
      v.body.vel.set(Math.sin(ang)*v0,0,Math.cos(ang)*v0);
      for(const w of v.wheels)w.omega=v0/w.radius;}
    else{
      const ram=c.rammer||"titan";               // 세부 설정에서 램머 차량 선택 가능
      if(c.scen==="head"){                       // 차대차 정면: 서로 마주보고 발사
        v.reset(-140,-40-v0*1.1,0,false);v.body.vel.set(0,0,v0);
        for(const w of v.wheels)w.omega=v0/w.radius;
        this.spawnDrone(ram,-140+off,120+v0*1.1,Math.PI+ang,c.vTarget);}
      else if(c.scen==="tbone"){                 // 측면: 정차한 내 차 옆구리를 강타
        v.reset(-140,40,0,false);
        this.spawnDrone(ram,-40-v0*1.4,40+off,-Math.PI/2+ang,c.vTarget);}
      else if(c.scen==="rear"){                  // 후방 추돌
        v.reset(-140,40,0,false);
        this.spawnDrone(ram,-140+off,-60-v0*1.4,ang,c.vTarget);}
      else if(c.scen==="sandwich"){              // 샌드위치: 앞뒤에서 조임
        v.reset(-140,40,0,false);
        this.spawnDrone(ram,-140+off,-70-v0*.9,ang,c.vTarget);
        this.spawnDrone(ram,-140-off,150+v0*.9,Math.PI-ang,c.vTarget);}}
    c.phase="run";c.peakG=0;c.impactV=0;c.parted=0;c.settleT=0;c.hitDone=false;
    v.peakG=0;
    toast("발사! "+c.vTarget+" km/h");Sfx.beep(660,.15,.2);},
  crashStep(dt){
    const c=this.crash,v=this.veh;
    $("crashPanel").classList.toggle("mini",c.phase!=="idle");   // 주행 중 옵션 패널 축소
    if(c.phase==="run"){
      v.controlLock=true;
      if(c.scen==="wall"||c.scen==="head"){
        const tx=-140,L=c.scen==="wall"?(CRASH_LANES[c.target]||CRASH_LANES[0]):{lx:tx};
        const userSteer=Input.steerValue?Input.steerValue():0;
        if(Math.abs(userSteer)>.06)v.steerIn=userSteer;   // 수동 조향 → 물리대로 빗나갈 수 있음
        else v.steerIn=c.ang?0:clamp((L.lx-v.body.pos.x)*.08-v.body.vel.x*.05,-.3,.3);
        const kmh=v.fwdSpeed()*3.6;
        v.throttle=kmh<c.vTarget?1:0;v.brake=0;v.driveMode="D";}
      else{v.throttle=0;v.brake=.25;v.steerIn=0;}   // 정차 시나리오: 제자리
      for(const d of this.drones)if(d.go){          // 드론: 전속 직진, 명중 후 브레이크
        d.veh.controlLock=true;d.veh.driveMode="D";
        d.veh.throttle=(d.veh.speed*3.6<c.vTarget)?1:0;d.veh.brake=0;
        if(c.hitDone){d.go=false;}}
      if(c.hitDone){c.phase="settle";c.settleT=0;
        for(const d of this.drones)d.go=false;}
    }else if(c.phase==="settle"){
      v.controlLock=true;v.throttle=0;v.brake=.4;
      c.settleT+=dt;
      if((v.speed<.4&&c.settleT>1.2)||c.settleT>6){
        c.phase="report";v.controlLock=false;showCrashReport();}}
  },

  /* ---------- time attack ---------- */
  setupTiming(){
    const cps=this.world.checkpoints||[];
    this.timing={cp:0,lap:1,t:0,lapT:0,best:getRec("time|"+this.opts.mapId+"|"+CARS[this.opts.carIdx].id)||null,
      lastLap:null,sprint:this.world.route==="sprint",started:false,sectors:[],secN:Math.max(1,Math.floor(cps.length/3))};},
  timingStep(dt){
    const T=this.timing,cps=this.world.checkpoints;
    if(!cps||cps.length<2)return;
    if(T.started)T.t+=dt*1000;
    const cp=cps[T.cp%cps.length];
    const dx=this.veh.body.pos.x-cp.x,dz=this.veh.body.pos.z-cp.z;
    if(dx*dx+dz*dz<cp.r*cp.r){
      if(!T.started){T.started=true;T.t=0;bigMsg("GO!",700);}
      T.cp++;
      if(T.cp%T.secN===0&&T.cp<cps.length)Sfx.beep(880,.1,.1);
      if(T.sprint&&T.cp>=cps.length){this.finishSprint();return;}
      if(!T.sprint&&T.cp>=cps.length){
        T.cp=0;T.lastLap=T.t;
        if(!T.best||T.t<T.best){T.best=T.t;setRec("time|"+this.opts.mapId+"|"+CARS[this.opts.carIdx].id,T.t);
          bigMsg(fmtTime(T.t),1400,"NEW BEST LAP");Sfx.beep(1046,.3,.2);}
        else bigMsg(fmtTime(T.t),1200,"LAP");
        T.t=0;}}
  },
  finishSprint(){
    const T=this.timing;T.started=false;
    const key="time|"+this.opts.mapId+"|"+CARS[this.opts.carIdx].id;
    const best=getRec(key);
    const isNew=!best||T.t<best;
    if(isNew)setRec(key,T.t);
    showResult("⏱️ 완주!",[["기록",fmtTime(T.t)],["베스트",fmtTime(isNew?T.t:best)],
      isNew?["","🎉 신기록!"]:["","" ]]);},

  /* ---------- race ---------- */
  setupRace(){
    const n=clamp(this.opts.aiCount,3,5);
    const sp=this.world.spawn,cps=this.world.checkpoints;
    this.race={lap:1,laps:this.opts.laps,cp:0,done:false,t:0,
      prog:new Array(n+1).fill(0),rank:1};
    const perp=[Math.cos(sp.yaw),-Math.sin(sp.yaw)];
    for(let i=0;i<n;i++){
      const spec=CARS[(this.opts.carIdx+1+i)%CARS.length];
      const veh=new Vehicle(spec,this.world);
      veh.isAI=true;veh.damageOn=this.opts.damage;
      veh.assists.abs=veh.assists.tcs=true;veh.assists.ctr=veh.assists.stab=true;
      const row=1+((i/2)|0),side=(i%2?1:-1);
      veh.reset(sp.x+perp[0]*side*4-Math.sin(sp.yaw)*row*9,
                sp.z+perp[1]*side*4-Math.cos(sp.yaw)*row*9,sp.yaw);
      const vis=new CarVisual(spec,spec.colors[(i+2)%spec.colors.length]);
      vis.storeHomes();scene.add(vis.group);
      this.ais.push({veh,vis,wp:0,cp:0,lap:1,stuckT:0,revT:0,rubber:1,finished:false});}
    // player also offset to grid
    this.veh.reset(sp.x+perp[0]*4,sp.z+perp[1]*4,sp.yaw);
    this.race.count=0;this.race.countT=0;this.race.started=false;
  },
  raceStep(dt){
    const R=this.race,cps=this.world.checkpoints;
    if(!R.started){
      R.countT+=dt;
      this.veh.controlLock=true;this.veh.throttle=0;this.veh.brake=1;
      const num=3-(R.countT|0);
      if(num!==R.count){R.count=num;if(num>0){bigMsg(num,800);Sfx.beep(440,.12,.18);}}
      if(R.countT>=3){R.started=true;this.veh.controlLock=false;bigMsg("GO!",800);Sfx.beep(880,.3,.22);}
      return;}
    R.t+=dt*1000;
    // player checkpoint
    const cp=cps[R.cp%cps.length];
    const dx=this.veh.body.pos.x-cp.x,dz=this.veh.body.pos.z-cp.z;
    if(dx*dx+dz*dz<cp.r*cp.r*1.44){
      R.cp++;
      if(R.cp>=cps.length){R.cp=0;R.lap++;
        if(R.lap>R.laps&&!R.done){R.done=true;this.finishRace();}
        else if(!R.done)bigMsg("LAP "+R.lap+"/"+R.laps,1000);}}
    // ranks
    const progOf=(cpI,lap,x,z)=>{
      const c=cps[cpI%cps.length];
      return lap*10000+cpI*100-Math.hypot(x-c.x,z-c.z)*.1;};
    let ahead=0;
    const myP=progOf(R.cp,R.lap,this.veh.body.pos.x,this.veh.body.pos.z);
    for(const a of this.ais){
      const p=progOf(a.cp,a.lap,a.veh.body.pos.x,a.veh.body.pos.z);
      if(p>myP)ahead++;
      // rubberband ±5%
      a.rubber=clamp(1+(myP-p)/8000*.05,.95,1.05);}
    R.rank=ahead+1;
  },
  finishRace(){
    const R=this.race;
    setRecIfBetter("race|"+this.opts.mapId,R.rank,(a,b)=>a<b);
    showResult(R.rank===1?"🏆 우승!":"🏁 완주 — "+R.rank+"위",
      [["최종 순위",R.rank+" / "+(this.ais.length+1)],["레이스 타임",fmtTime(R.t)],["랩",R.laps+"랩"]]);},

  /* ---------- drift ---------- */
  driftStep(dt){
    const D=this.drift,v=this.veh;
    const sp=v.speed;
    v.body.vecToLocal(v.body.vel,_vA);
    const ang=Math.abs(Math.atan2(_vA.x,Math.abs(_vA.z)))/DEG;
    const drifting=ang>15&&ang<120&&sp>5&&v.grounded>1;
    if(drifting){
      D.driftT+=dt;D.idleT=0;
      D.combo=Math.min(5,D.combo+dt*.25);
      // wall proximity bonus
      let wall=false;
      for(const b of this.world.boxes){
        _vB.copy(v.body.pos).sub(b.c);
        if(_vB.lengthSq()<(b.r+2.2)*(b.r+2.2)){wall=true;break;}}
      D.wallBonus=wall;
      D.run+=ang*sp*dt*.08*D.combo*(wall?2:1);
    }else{
      D.idleT+=dt;
      if(ang>=120&&sp>4){ // spin!
        if(D.run>0){bigMsg("스핀!",800,"콤보 소멸");D.run*=.5;}
        D.combo=1;}
      if(D.idleT>1&&D.run>0){
        D.score+=D.run|0;
        if(D.run>500)toast("+"+(D.run|0)+"점 적립!");
        D.run=0;D.combo=1;
        if(D.score>D.best){D.best=D.score;setRec("drift|"+this.opts.mapId,D.score);}}}
    if(sp<1&&D.run>0&&D.idleT>2){D.run=0;D.combo=1;}
  },

  /* ---------- per-physics-step ---------- */
  physStep(dt){
    const v=this.veh;
    // input → player (unless locked)
    if(!v.controlLock)Input.applyTo(v);
    if(this.mode==="crash")this.crashStep(dt);
    if(this.mode==="race")this.raceStep(dt);
    if(this.mode==="time")this.timingStep(dt);
    if(this.mode==="drift")this.driftStep(dt);
    if(this.world.movers.length)this.world.stepMovers(dt);   // 압착기 등 애니메이션 장애물
    v.step(dt);
    for(const a of this.ais){stepAI(a,this.world,dt);a.veh.step(dt);}
    for(const d of this.drones){
      if(!d.go){d.veh.throttle=0;d.veh.brake=1;}
      d.veh.step(dt);}
    // car-car collisions
    const all=[v,...this.ais.map(a=>a.veh),...this.drones.map(d=>d.veh)];
    for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)collideCars(all[i],all[j]);
    stepProps(this.world,dt);
    // world bounds / fall (안정성 4)
    for(const cv of all){
      if(cv.isDrone)continue;
      const p=cv.body.pos;
      if(p.y<-50||Math.abs(p.x)>this.world.bounds+40||Math.abs(p.z)>this.world.bounds+40){
        const sp=this.world.spawn;
        cv.reset(sp.x+(Math.random()-.5)*6,sp.z+(Math.random()-.5)*6,sp.yaw,true);
        if(cv===v)toast("월드 경계 — 리스폰");}}
    // triggers (speed trap)
    if(this.trapCool>0)this.trapCool-=dt;
    if(this.world.triggers)for(const tr of this.world.triggers){
      const dx=v.body.pos.x-tr.x,dz=v.body.pos.z-tr.z;
      if(dx*dx+dz*dz<tr.r*tr.r&&this.trapCool<=0){
        this.trapCool=4;toast("📡 스피드 트랩: "+(v.speed*3.6).toFixed(1)+" km/h",2200);Sfx.beep(1200,.1,.15);}}
  },

  /* ---------- per-frame ---------- */
  frame(dt){
    if(this.state!=="play")return;
    const ts=(this.slowmoT>0||this.manualSlow)?.15:1;
    if(this.slowmoT>0)this.slowmoT-=dt;
    if(!this.paused){
      this.acc+=dt*ts;
      let steps=0;const t0=performance.now();
      while(this.acc>=PHYS_DT&&steps<10){this.physStep(PHYS_DT);this.acc-=PHYS_DT;steps++;}
      if(steps>=10)this.acc=0;
      this.physMs=performance.now()-t0;
      // consume impacts → deform + fx
      this.consumeImpacts(this.veh,this.vis,true);
      for(const a of this.ais)this.consumeImpacts(a.veh,a.vis,false);
      for(const d of this.drones)this.consumeImpacts(d.veh,d.vis,false);
      this.vis.updateDeforms(dt*ts);
      for(const a of this.ais)a.vis.updateDeforms(dt*ts);
      for(const d of this.drones)d.vis.updateDeforms(dt*ts);
      // wheels fx + sound
      this.wheelFx(dt*ts);
      Fx.step(dt*ts,this.world);
      const v=this.veh;
      Sfx.engine(v.rpm,v.throttle,true);
      Sfx.skid(v.skidMax*(v.grounded?1:0));
      Sfx.wind(v.speed);
      // flip prompt
      $("btnReset").classList.toggle("blink",v.flipT>3);
    }else{Sfx.engine(0,0,false);Sfx.skid(0);Sfx.wind(0);}
    this.cam.update(dt,this.veh,this.world);
    // 속도감 FOV
    const tgtFov=66+clamp(this.veh.speed-18,0,60)*.16;
    if(Math.abs(camera.fov-tgtFov)>.05){
      camera.fov+=(tgtFov-camera.fov)*Math.min(1,dt*3);camera.updateProjectionMatrix();}
    this.vis.sync(this.veh,this.shakeT);
    for(const a of this.ais)a.vis.sync(a.veh,0);
    for(const d of this.drones)d.vis.sync(d.veh,0);
    if(this.shakeT>0)this.shakeT-=dt;
    updateHUD(dt);
  },
  consumeImpacts(v,vis,isPlayer){
    for(const imp of v.impacts){
      vis.applyImpact(imp,v);
      _vA.copy(imp.ln).applyQuaternion(v.body.quat);
      Fx.impactFx(imp.wp,_vA,imp.dv);
      if(isPlayer){
        this.cam.shake=Math.min(1,imp.dv/12);
        if(imp.dv>10&&Settings.autoSlowmo&&this.slowmoT<=0){this.slowmoT=1.2;bigMsg("💥",600);}
        if(this.mode==="crash"&&this.crash.phase==="run"&&imp.dv>3&&!this.crash.hitDone){
          this.crash.hitDone=true;this.crash.impactV=v.speed+imp.dv*.5;}}}
    v.impacts.length=0;},
  wheelFx(dt){
    const doFor=(v)=>{
      for(const w of v.wheels){
        if(!w.onGround)continue;
        if(w.skid>.3){
          const yaw=Math.atan2(2*(v.body.quat.w*v.body.quat.y+v.body.quat.x*v.body.quat.z),
            1-2*(v.body.quat.y*v.body.quat.y+v.body.quat.x*v.body.quat.x));
          const sid=SURF_IDS[w.surf];
          if(sid==="asphalt"||sid==="wet"||sid==="curb"){
            Fx.skidMark(w.cW.x,w.cW.y,w.cW.z,yaw);
            Fx.smokeAt(w.cW.x,w.cW.y+.1,w.cW.z,v.body.vel.x,v.body.vel.z,w.skid*.5);}
          else Fx.dustAt(w.cW.x,w.cW.y,w.cW.z,w.skid*.7);}
        else if((SURF_IDS[w.surf]==="sand"||SURF_IDS[w.surf]==="gravel")&&v.speed>8)
          Fx.dustAt(w.cW.x,w.cW.y,w.cW.z,.12);}};
    doFor(this.veh);for(const a of this.ais)doFor(a.veh);},

  resetCar(){
    const v=this.veh,sp=this.world.spawn;
    if((this.mode==="time"||this.mode==="race")&&this.world.checkpoints?.length){
      const T=this.mode==="time"?this.timing:this.race;
      const idx=(T.cp-1+this.world.checkpoints.length)%this.world.checkpoints.length;
      const c=this.world.checkpoints[idx],n=this.world.checkpoints[(idx+1)%this.world.checkpoints.length];
      v.reset(c.x,c.z,Math.atan2(n.x-c.x,n.z-c.z),true);}
    else if(this.mode==="crash")this.placeCrashCar();
    else v.reset(sp.x,sp.z,sp.yaw,true);
    toast("리셋");},
  spawnAt(p){   // 📍 장소 선택 스폰 (오픈월드)
    if(!p)return;
    this.veh.reset(p.x,p.z,p.yaw||0,true);this.repairSilent();
    if(this.cam){const sp=this.world.spawn;
      this.cam.pos.set(p.x-Math.sin(p.yaw||0)*8,this.world.height(p.x,p.z)+4,p.z-Math.cos(p.yaw||0)*8);}
    toast("📍 "+p.name);Sfx.beep(680,.1,.14);},
  /* ---------- 주행 중 차량 즉시 교체 ---------- */
  swapCar(i){
    if(this.state!=="play"||!this.veh)return;
    const b=this.veh.body;
    const pos=b.pos.clone(),quat=b.quat.clone(),vel=b.vel.clone(),av=b.angVel.clone();
    this.opts.carIdx=((i%CARS.length)+CARS.length)%CARS.length;
    const spec=CARS[this.opts.carIdx];
    this.vis.dispose();
    this.veh=new Vehicle(spec,this.world);
    this.veh.damageOn=this.opts.damage||this.mode==="crash";
    this.vis=new CarVisual(spec,spec.colors[this.opts.color%spec.colors.length]);
    this.vis.storeHomes();scene.add(this.vis.group);
    this.veh.reset(pos.x,pos.z,0,false);
    b2:{const nb=this.veh.body;
      nb.pos.copy(pos);nb.pos.y=Math.max(pos.y,this.world.height(pos.x,pos.z)+spec.wheels.radius+.4);
      nb.quat.copy(quat);nb.vel.copy(vel);nb.angVel.copy(av);}
    this.applyAssists(this.veh);
    if(this.mode==="crash")this.placeCrashCar();
    if(this.mode==="lab")showLabPanel();
    toast("🚗 "+spec.name);Sfx.beep(880,.08,.12);
    updateModeWidget();},

  /* ---------- 자동차 랩 ---------- */
  setupLab(){
    const v=this.veh;
    v.reset(-250,-150,Math.PI*.22,false);      // 스키드패드 = 쇼룸 무대
    v.controlLock=true;v.damageOn=true;
    this.cam.mode="orbit";this.cam.dist=7;
    this.lab={force:30};
    showLabPanel();},
  labPoke(px,py){                              // 화면 탭 → 차체 그 지점에 힘 가하기
    if(this.mode!=="lab"||!this.veh)return;
    const b=this.veh.body;
    const nx=px/innerWidth*2-1,ny=1-py/innerHeight*2;
    const p0=new THREE.Vector3(nx,ny,-1).unproject(camera);
    const p1=new THREE.Vector3(nx,ny,1).unproject(camera);
    const rd=p1.sub(p0).normalize();
    // 레이 → 차체 OBB 슬랩 교차(로컬)
    const ro=b.worldToLocal(p0,new THREE.Vector3());
    b.vecToLocal(rd,_vA);const ld=_vA.clone();
    const h=b.half;let t0=0,t1=1e9;
    for(const[ax,he]of[["x",h.x],["y",h.y],["z",h.z]]){
      const o=ro[ax],d=ld[ax];
      if(Math.abs(d)<1e-8){if(Math.abs(o)>he)return;continue;}
      let ta=(-he-o)/d,tb=(he-o)/d;if(ta>tb){const tmp=ta;ta=tb;tb=tmp;}
      t0=Math.max(t0,ta);t1=Math.min(t1,tb);if(t0>t1)return;}
    const lp=ro.clone().addScaledVector(ld,t0);         // 로컬 접점
    const ln=ld.clone().negate();                        // 충격 방향(누르는 쪽)
    const dv=this.lab.force;
    const wp=new THREE.Vector3(lp.x,lp.y,lp.z);b.localToWorld(lp,wp);
    this.vis.applyImpact({lp,ln:ln.negate(),wp,dv,soft:false},this.veh);  // 시각 크럼플 파이프라인 전체
    this.veh.addDamage(lp,dv*.5);
    b.vecToWorld(ln.negate(),_vA);
    Fx.impactFx(wp,_vA,dv);
    Sfx.crash?Sfx.crash(dv/40):Sfx.beep(180,.1,.3);
    this.slowmoT=Math.max(this.slowmoT,.4);},
  repairSilent(){this.veh.clearDamage();this.vis.repair();},
  repair(){
    if(this.veh.isFlipped())this.veh.uprightInPlace();   // 전복 시 정위치 복원
    this.veh.clearDamage();this.vis.repair();toast("🔧 수리 완료");Sfx.beep(760,.12,.12);},
  togglePause(force){
    if(this.state!=="play")return;
    this.paused=force!==undefined?force:!this.paused;
    $("pausePanel").classList.toggle("on",this.paused);
    if(this.paused){renderPauseMenu();Sfx.engine(0,0,false);Sfx.skid(0);Sfx.wind(0);}},
};
function setRecIfBetter(k,v,cmp){const cur=getRec(k);if(cur==null||cmp(v,cur))setRec(k,v);}

/* ---------- AI driver ---------- */
function stepAI(a,world,dt){
  const v=a.veh,wps=world.waypoints;
  if(!wps||!wps.length){v.throttle=0;v.brake=.5;return;}
  if(Game.mode==="race"&&Game.race&&!Game.race.started){v.throttle=0;v.brake=1;return;}
  const p=v.body.pos;
  let wp=wps[a.wp%wps.length];
  let dx=wp.x-p.x,dz=wp.z-p.z;
  if(dx*dx+dz*dz<144){a.wp=(a.wp+1)%wps.length;
    if(a.wp===0)a.lap++;
    wp=wps[a.wp%wps.length];}
  // race checkpoint progress
  if(Game.mode==="race"&&world.checkpoints){
    const cps=world.checkpoints,c=cps[a.cp%cps.length];
    const cdx=p.x-c.x,cdz=p.z-c.z;
    if(cdx*cdx+cdz*cdz<c.r*c.r*2.6){a.cp++;
      if(a.cp>=cps.length){a.cp=0;
        if(a.lap>Game.race.laps)a.finished=true;}}}
  // steering to lookahead
  const look=wps[(a.wp+1)%wps.length];
  const tx=lerp(wp.x,look.x,.45),tz=lerp(wp.z,look.z,.45);
  const yaw=Math.atan2(2*(v.body.quat.w*v.body.quat.y+v.body.quat.x*v.body.quat.z),
    1-2*(v.body.quat.y*v.body.quat.y+v.body.quat.x*v.body.quat.x));
  let ang=Math.atan2(tx-p.x,tz-p.z)-yaw;
  while(ang>Math.PI)ang-=Math.PI*2;while(ang<-Math.PI)ang+=Math.PI*2;
  v.steerIn=clamp(ang*1.6,-1,1);
  // speed
  const target=Math.min(wp.v,look.v+3)*a.rubber*(a.finished?.5:1);
  const sp=v.fwdSpeed();
  if(sp<target-1){v.throttle=clamp((target-sp)*.25,.25,1);v.brake=0;}
  else if(sp>target+2){v.throttle=0;v.brake=clamp((sp-target)*.14,.1,1);}
  else{v.throttle=.25;v.brake=0;}
  v.driveMode="D";v.handbrake=false;
  // stuck → reverse
  if(a.revT>0){a.revT-=dt;v.driveMode="R";v.throttle=.7;v.brake=0;v.steerIn=-v.steerIn;}
  else if(v.speed<.6){a.stuckT+=dt;if(a.stuckT>2.4){a.revT=1.3;a.stuckT=0;}}
  else a.stuckT=0;
  if(v.flipT>3)v.reset(wp.x,wp.z,Math.atan2(look.x-wp.x,look.z-wp.z),true);
}

/* ---------- HUD: arc gauge + minimap ---------- */
const GAUGE={ready:false};
function arcPath(cx,cy,r,a0,a1){
  const P=a=>[cx+r*Math.cos(a*DEG),cy+r*Math.sin(a*DEG)];
  const[x0,y0]=P(a0),[x1,y1]=P(a1);
  return"M "+x0+" "+y0+" A "+r+" "+r+" 0 "+(Math.abs(a1-a0)>180?1:0)+" 1 "+x1+" "+y1;}
function initGauge(){
  const d1=arcPath(80,66,54,160,380),d2=arcPath(80,66,41,160,380);
  for(const id of["gArcBg","gArcBg2","gArc"])$(id).setAttribute("d",d1);
  for(const id of["gArcRpmBg","gArcRpm"])$(id).setAttribute("d",d2);
  GAUGE.sL=$("gArc").getTotalLength();GAUGE.rL=$("gArcRpm").getTotalLength();
  for(const[id,L]of[["gArc",GAUGE.sL],["gArcRpm",GAUGE.rL]]){
    $(id).style.strokeDasharray=L;$(id).style.strokeDashoffset=L;}
  GAUGE.ready=true;}
function buildMinimap(){
  const w=Game.world,n=w.res+1;
  const c=document.createElement("canvas");c.width=n;c.height=n;
  const ctx=c.getContext("2d");
  const img=ctx.createImageData(n,n);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const sf=SURF_IDS[w.sMap[j*n+i]];
    let r=0,g=0,b=0,a=0;
    if(sf==="asphalt"||sf==="lane"){r=172;g=182;b=198;a=235;}
    else if(sf==="curb"){r=214;g=92;b=80;a=235;}
    else if(sf==="walk"){r=120;g=128;b=140;a=160;}
    else if(sf==="ice"||sf==="wet"){r=110;g=170;b=205;a=120;}
    else a=0;
    const o=(j*n+i)*4;img.data[o]=r;img.data[o+1]=g;img.data[o+2]=b;img.data[o+3]=a;}
  ctx.putImageData(img,0,0);
  Game.mm={cnv:c,size:w.size};}
let _mmT=0;
function drawMinimap(dt){
  _mmT+=dt;if(_mmT<.12||!Game.mm)return;_mmT=0;
  const cv=$("minimap"),ctx=cv.getContext("2d"),S=cv.width;
  ctx.clearRect(0,0,S,S);
  ctx.drawImage(Game.mm.cnv,0,0,S,S);
  const toPx=(x,z)=>[(x/Game.mm.size+.5)*S,(z/Game.mm.size+.5)*S];
  // next checkpoint
  const T=Game.mode==="time"?Game.timing:Game.mode==="race"?Game.race:null;
  if(T&&Game.world.checkpoints?.length){
    const cp=Game.world.checkpoints[T.cp%Game.world.checkpoints.length];
    const[cx,cy]=toPx(cp.x,cp.z);
    ctx.strokeStyle="#3ddc84";ctx.lineWidth=4;
    ctx.beginPath();ctx.arc(cx,cy,7+Math.sin(performance.now()*.008)*2,0,7);ctx.stroke();}
  // AI dots
  ctx.fillStyle="#ff5252";
  for(const a of Game.ais){
    const[ax,ay]=toPx(a.veh.body.pos.x,a.veh.body.pos.z);
    ctx.beginPath();ctx.arc(ax,ay,5,0,7);ctx.fill();}
  // player arrow
  const b=Game.veh.body;
  const yaw=Math.atan2(2*(b.quat.w*b.quat.y+b.quat.x*b.quat.z),
    1-2*(b.quat.y*b.quat.y+b.quat.x*b.quat.x));
  const[px,py]=toPx(b.pos.x,b.pos.z);
  ctx.save();ctx.translate(px,py);ctx.rotate(-yaw);
  ctx.fillStyle="#ffb25e";ctx.strokeStyle="#0b0e13";ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(-6,7);ctx.closePath();
  ctx.fill();ctx.stroke();ctx.restore();}
let _hudT=0;
function updateHUD(dt){
  const v=Game.veh;if(!v)return;
  _hudT+=dt;if(_hudT<.05)return;_hudT=0;
  const kmh=Math.abs(v.fwdSpeed())*3.6;
  $("speedVal").childNodes[0].nodeValue=String(kmh|0);
  $("gearVal").textContent=v.driveMode==="R"?"R":(v.speed<.3&&v.throttle===0?"N":v.gear);
  if(GAUGE.ready){
    $("gArc").style.strokeDashoffset=GAUGE.sL*(1-clamp(kmh/(v.spec.top+30),0,1));
    $("gArcRpm").style.strokeDashoffset=GAUGE.rL*(1-clamp(v.rpm/v.spec.engine.redline,0,1));}
  drawMinimap(.06);
  const dz=(el,val)=>{el.style.background=val>66?"var(--bad)":val>33?"var(--warn)":"var(--ok)";};
  dz($("dmgF"),v.dmg.f);dz($("dmgB"),v.dmg.b);dz($("dmgL"),v.dmg.l);dz($("dmgR"),v.dmg.r);
  updateModeWidget();
  if(Settings.debug){
    const w=v.wheels;
    $("debugHud").textContent=
      "FPS "+FPS.fps.toFixed(0)+"  phys "+Game.physMs.toFixed(1)+"ms\n"+
      "v "+(v.speed*3.6).toFixed(0)+"km/h  G "+v.peakG.toFixed(1)+"\n"+
      "slip FL "+(w[0].slipA/DEG).toFixed(0)+"° FR "+(w[1].slipA/DEG).toFixed(0)+"°\n"+
      "     RL "+(w[2].slipA/DEG).toFixed(0)+"° RR "+(w[3].slipA/DEG).toFixed(0)+"°\n"+
      "load "+w.map(x=>(x.load/1000).toFixed(1)).join(" ")+"\n"+
      "comp "+w.map(x=>(x.comp*100).toFixed(0)).join(" ")+"  surf "+SURF_IDS[w[0].surf];}
}
function updateModeWidget(){
  const el=$("modeWidget"),m=Game.mode;
  if(m==="time"&&Game.timing){
    const T=Game.timing;
    el.innerHTML='<div class="big">'+fmtTime(T.started?T.t:0)+'</div><div class="sub">베스트 '+fmtTime(T.best)+
      (T.sprint?"":" · CP "+T.cp+"/"+(Game.world.checkpoints?.length||0))+'</div>';}
  else if(m==="race"&&Game.race){
    const R=Game.race;
    el.innerHTML='<div class="big">'+R.rank+'<small>위</small> / '+(Game.ais.length+1)+'</div>'+
      '<div class="sub">LAP '+Math.min(R.lap,R.laps)+"/"+R.laps+'</div>';}
  else if(m==="drift"&&Game.drift){
    const D=Game.drift;
    el.innerHTML='<div class="big">'+((D.score+D.run)|0)+'</div><div class="sub">x'+D.combo.toFixed(1)+
      (D.wallBonus?" 🔥벽보너스":"")+' · 베스트 '+(D.best|0)+'</div>';}
  else if(m==="crash"){
    const c=Game.crash;
    el.innerHTML='<div class="big">'+(c.phase==="run"?(Game.veh.speed*3.6|0)+' km/h':'대기')+'</div>'+
      '<div class="sub">'+(c.phase==="run"?"주행 중… 피크 "+(Game.veh.peakG|0)+"G":
        c.phase!=="idle"?"피크 "+(Game.veh.peakG|0)+"G · 변형 "+Game.vis.defVol.toFixed(1):"속도 설정 후 발사")+'</div>';}
  else{
    const s=SURF_IDS[Game.veh.wheels[0].surf]||"asphalt";
    const names={asphalt:"아스팔트",lane:"아스팔트",wet:"젖은 노면",gravel:"자갈",grass:"잔디",sand:"모래",ice:"빙판",snow:"눈",curb:"연석",walk:"보도"};
    el.innerHTML='<div class="big">자유주행</div><div class="sub">'+(names[s]||s)+' · '+Game.mapDef.name+'</div>';}
}
let _toastT=null;
function toast(msg,ms){
  const el=$("toast");el.textContent=msg;el.classList.add("on");
  clearTimeout(_toastT);_toastT=setTimeout(()=>el.classList.remove("on"),ms||1600);}
let _bigT=null;
function bigMsg(msg,ms,sub){
  const el=$("bigMsg");el.innerHTML=esc(String(msg))+(sub?"<small>"+esc(sub)+"</small>":"");
  el.classList.add("on");clearTimeout(_bigT);_bigT=setTimeout(()=>el.classList.remove("on"),ms||900);}

/* ---------- 자동차 랩 패널 ---------- */
function showLabPanel(){
  const s=Game.veh.spec;
  const st=(v,l)=>'<div class="st"><b>'+v+'</b><span>'+l+'</span></div>';
  $("labStats").innerHTML=
    st(s.hp+"hp","최고출력")+st(s.mass+"kg","공차중량")+st(s.drive,"구동방식")+
    st(s.top+" km/h","최고속도")+st(s.acc,"0→100")+st((s.body.hz*2).toFixed(1)+" m","전장");
  $("labForce").value=Game.lab.force;$("labForceVal").textContent=Game.lab.force;
}

/* ---------- crash report ---------- */
function showCrashReport(){
  const c=Game.crash,v=Game.veh,vis=Game.vis;
  const parted=Object.keys(vis.detached).length;
  const vol=vis.defVol;
  const cost=Math.round(vol*900+parted*120+(v.dmg.f+v.dmg.b+v.dmg.l+v.dmg.r)*3);
  const grade=cost<80?"A":cost<300?"B":cost<800?"C":cost<1600?"D":"F";
  $("reportBox").innerHTML=
    '<h2>💥 크래시 리포트 <small>'+esc(Game.mapDef.name)+'</small></h2>'+
    '<div class="kv"><span>충돌 속도</span><b>'+(c.impactV*3.6).toFixed(1)+' km/h</b></div>'+
    '<div class="kv"><span>최대 감속</span><b>'+v.peakG.toFixed(1)+' G</b></div>'+
    '<div class="kv"><span>변형 부피 지수</span><b>'+vol.toFixed(1)+'</b></div>'+
    '<div class="kv"><span>분리된 파츠</span><b>'+parted+'개</b></div>'+
    '<div class="kv"><span>구역 손상</span><b>전 '+(v.dmg.f|0)+'% · 후 '+(v.dmg.b|0)+'% · 좌 '+(v.dmg.l|0)+'% · 우 '+(v.dmg.r|0)+'%</b></div>'+
    '<div class="kv"><span>수리비 환산</span><b>'+cost.toLocaleString()+'점 (등급 '+grade+')</b></div>'+
    '<div class="btnRow"><button class="btn" id="repAgain">🔁 다시 발사</button>'+
    '<button class="btn ghost" id="repFree">주변 살펴보기</button>'+
    '<button class="btn ghost" id="repExit">나가기</button></div>';
  $("reportPanel").classList.add("on");
  $("repAgain").onclick=()=>{$("reportPanel").classList.remove("on");Game.vis.repair();Game.veh.clearDamage();Game.launch();};
  $("repFree").onclick=()=>{$("reportPanel").classList.remove("on");Game.crash.phase="idle";Game.cam.mode="free";toast("프리 카메라 — 드래그로 감상");};
  $("repExit").onclick=()=>Game.exitToMenu();
}
function showResult(title,rows){
  $("resultBox").innerHTML='<h2>'+title+'</h2>'+
    rows.filter(r=>r[1]).map(r=>'<div class="kv"><span>'+r[0]+'</span><b>'+r[1]+'</b></div>').join("")+
    '<div class="btnRow"><button class="btn" id="resRetry">🔁 다시</button>'+
    '<button class="btn ghost" id="resExit">메뉴로</button></div>';
  $("resultPanel").classList.add("on");
  $("resRetry").onclick=()=>{$("resultPanel").classList.remove("on");Game.startGame();};
  $("resExit").onclick=()=>Game.exitToMenu();
}
function renderPauseMenu(){
  const box=$("pauseBtns");
  box.innerHTML='<button class="btn" id="pResume">▶ 계속하기</button>'+
    '<div class="seg" id="pAssist">'+["casual","sport","sim"].map(a=>
      '<button data-a="'+a+'" class="'+(Settings.assist===a?"sel":"")+'">'+
      ({casual:"캐주얼",sport:"스포츠",sim:"시뮬"})[a]+'</button>').join("")+'</div>'+
    '<button class="btn ghost" id="pRepair">🔧 수리 + 리셋</button>'+
    '<button class="btn ghost" id="pRestart">🔄 재시작</button>'+
    '<button class="btn danger" id="pExit">나가기</button>';
  $("pResume").onclick=()=>Game.togglePause(false);
  $("pRepair").onclick=()=>{Game.repair();Game.resetCar();Game.togglePause(false);};
  $("pRestart").onclick=()=>{$("pausePanel").classList.remove("on");Game.paused=false;Game.startGame();};
  $("pExit").onclick=()=>Game.exitToMenu();
  box.querySelectorAll("#pAssist button").forEach(b=>b.onclick=()=>{
    applyAssistPreset(b.dataset.a);Game.applyAssists(Game.veh);renderPauseMenu();toast("어시스트: "+b.textContent);});
}
