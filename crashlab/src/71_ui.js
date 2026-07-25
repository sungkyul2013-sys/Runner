/* ============================================================
   UI — menu flow: home → car → map → options → play
   ============================================================ */
const UI=(()=>{
  let view="home",pickMode="free",pickCar=0,pickColor=0,pickMap="proving";
  const body=()=>$("menuBody");

  function show(v){
    view=v;
    $("btnMenuBack").style.display=v==="home"?"none":"";
    $("menuCrumb").textContent={home:"",car:"차량 선택",map:"맵 선택",opts:"주행 설정",
      settings:"설정",editorList:"맵 에디터",garage:"커스텀 차고"}[v]||"";
    ({home,car,map,opts,settings,editorList,garage})[v]();
    body().scrollTop=0;
  }
  function back(){
    const order={car:"home",map:"car",opts:"map",settings:"home",editorList:"home",garage:"car"};
    show(order[view]||"home");}

  /* ---------- home ---------- */
  function home(){
    const last=Store.get("lastPlay",null);
    body().innerHTML=
      '<div class="hero"><div class="heroBadge">REAL DRIVING SANDBOX</div>'+
      '<div class="heroTitle">부서지는 게<br><b>진짜다</b></div>'+
      '<p class="heroSub">서스펜션·타이어 풀 시뮬레이션 × 충돌 변형 — 박은 자리가 박은 만큼 찌그러진다</p>'+
      '<div class="btnRow" style="margin-top:16px"><button class="btn" id="quickPlay">▶ 바로 주행'+
      (last?' <small style="font-weight:500;opacity:.8">('+esc(CARS[last.carIdx]?.name||"")+')</small>':'')+'</button></div></div>'+
      '<div class="h1">게임 모드 <small>차량 '+CARS.length+'종 · 맵 '+MAPS.length+'종 + 커스텀 에디터</small></div>'+
      '<div class="grid big">'+MODES.map(m=>
        '<button class="card mode" data-m="'+m.id+'"><span class="ic">'+m.icon+'</span>'+
        '<span class="nm">'+m.name+'</span><span class="ds">'+m.desc+'</span></button>').join("")+'</div>'+
      '<p class="note">실차 3D 모델(레인지로버 실측 스캔 + CC0 Kenney Car Kit) · 물리는 어떤 어시스트에서도 항상 풀 시뮬레이션 · 변형은 수리 전까지 영구 누적</p>';
    $("quickPlay").onclick=()=>{
      Sfx.resume();Sfx.click();
      Game.mode="free";
      if(last){Game.opts.carIdx=clamp(last.carIdx||0,0,CARS.length-1);
        Game.opts.color=last.color||0;Game.opts.tod=last.tod||"day";
        Game.opts.mapId=last.mapId&&!last.mapId.startsWith("custom:")?last.mapId:"proving";}
      Game.startGame();};
    body().querySelectorAll(".card").forEach(c=>c.onclick=()=>{
      Sfx.resume();Sfx.click();
      pickMode=c.dataset.m;
      if(pickMode==="editor")show("editorList");
      else show("car");});
  }
  /* ---------- car ---------- */
  function car(){
    body().innerHTML='<div class="h1">'+MODES.find(m=>m.id===pickMode).name+' <small>차량을 고르세요</small></div>'+
      '<div class="grid big">'+CARS.map((c,i)=>
        '<button class="card carCard'+(i===pickCar?" sel":"")+'" data-i="'+i+'">'+
        '<span class="tag">'+c.drive+' · '+c.hp+'hp</span>'+
        (typeof CARTHUMBS!=="undefined"&&CARTHUMBS[c.id]?
          '<img class="carImg" src="'+CARTHUMBS[c.id]+'" alt="">':
          '<span class="ic">'+c.icon+'</span>')+
        '<span class="nm">'+c.name+'</span>'+
        '<span class="ds">'+c.desc+'</span>'+
        stat("속도",c.stats.spd)+stat("가속",c.stats.acc)+stat("그립",c.stats.grip)+
        '<span class="ds">0→100 '+c.acc+' · '+c.mass.toLocaleString()+'kg</span>'+
        '<div class="statRow" data-cols="'+i+'">'+c.colors.map((col,ci)=>
          '<i data-c="'+ci+'" style="display:inline-block;width:20px;height:20px;border-radius:50%;background:#'+col.toString(16).padStart(6,"0")+
          ';border:2px solid '+(ci===pickColor&&i===pickCar?"#fff":"transparent")+'"></i>').join("")+'</div>'+
        '</button>').join("")+'</div>'+
      '<div class="btnRow"><button class="btn" id="carNext">다음 →</button>'+
      '<button class="btn sm" id="toGarage">🛠️ 커스텀 차 만들기</button></div>';
    body().querySelectorAll(".card").forEach(c=>c.onclick=e=>{
      const ci=e.target.dataset?.c;
      pickCar=+c.dataset.i;
      if(ci!==undefined)pickColor=+ci;
      if(typeof Showroom!=="undefined")Showroom.show(pickCar,pickColor);
      Sfx.click();car();});
    if(typeof Showroom!=="undefined")Showroom.show(pickCar,pickColor);
    $("carNext").onclick=()=>{Sfx.click();
      if(pickMode==="lab"){   // 자동차 랩: 맵/옵션 단계 없이 바로 입장
        Game.mode="lab";Game.opts.carIdx=pickCar;Game.opts.color=pickColor;
        Game.startGame();return;}
      show("map");};
    $("toGarage").onclick=()=>{Sfx.click();show("garage");};
  }
  function stat(nm,v){return '<div class="statRow"><em>'+nm+'</em><div class="bar"><i style="width:'+v+'%"></i></div></div>';}

  /* ---------- 🛠️ 커스텀 차고 (커스텀 차량 제작) ---------- */
  let CB=null;   // 편집 중인 커스텀 사양
  function garage(){
    if(!CB)CB=loadCustomCar()||Object.assign({},CUSTOM_DEFAULT);
    const spec=customToSpec(CB);
    const sl=(label,key,sub,fmt)=>
      '<div class="optRow"><div class="lb">'+label+'<small>'+(sub?sub+' · ':'')+fmt+'</small></div>'+
      '<div class="ct"><input type="range" data-cb="'+key+'" min="0" max="1" step="0.01" value="'+CB[key]+'"></div></div>';
    const grp=t=>'<div class="h2" style="margin:18px 0 8px;font-size:12px;font-weight:900;letter-spacing:.22em;color:var(--acc2)">'+t+'</div>';
    body().innerHTML='<div class="h1">🛠️ 커스텀 차고 <small>내 차를 직접 설계</small></div>'+
      // 실시간 사양 요약
      '<div class="hero" style="padding:18px 20px"><div class="heroBadge">MY MACHINE</div>'+
      '<div style="font-size:22px;font-weight:900">'+esc(CB.name)+'</div>'+
      '<div class="ds" style="color:var(--tx2);font-size:13px;margin-top:8px;line-height:1.7">'+
        spec.hp+' hp · '+spec.mass.toLocaleString()+' kg · '+spec.drive+'<br>'+
        '최고 '+spec.top+' km/h · 0→100 '+spec.acc+'<br>'+
        '트래블 '+(spec.susp.travel*100).toFixed(0)+' cm · 스프링 '+(spec.susp.k/1000).toFixed(0)+' kN/m · 그립 '+spec.gripF.toFixed(2)+
      '</div></div>'+
      '<div class="optRow"><div class="lb">이름</div><div class="ct">'+
        '<input type="text" id="cbName" value="'+esc(CB.name)+'" maxlength="14"></div></div>'+
      grp("파워트레인")+
      sl("출력","power","엔진 토크·레드라인",spec.hp+"hp / "+spec.engine.redline+"rpm")+
      seg("구동 방식","cbDrive",[["FF","전륜"],["FR","후륜"],["4WD","4륜"]],CB.drive)+
      grp("타이어 · 핸들링")+
      sl("접지력","grip","타이어 μ",spec.gripF.toFixed(2)+"×")+
      sl("핸들링","handling","조향각·응답",(spec.steerLo*57.3).toFixed(0)+"°")+
      grp("서스펜션")+
      sl("트래블","travel","서스펜션 행정",(spec.susp.travel*100).toFixed(0)+"cm")+
      sl("강성(딱딱함)","stiff","스프링·댐퍼",(spec.susp.k/1000).toFixed(0)+"kN/m")+
      grp("차체")+
      sl("공차중량","mass","",spec.mass.toLocaleString()+"kg")+
      seg("형상","cbStyle",[["coupe","쿠페"],["hatch","해치"],["sedan","세단"],["suv","SUV"],["super","슈퍼"],["truck","트럭"]],CB.style)+
      sl("전장","len","길이",(spec.body.hz*2).toFixed(2)+"m")+
      sl("전폭","wid","너비",(spec.body.hx*2).toFixed(2)+"m")+
      sl("전고","hei","높이",(spec.body.hy*2).toFixed(2)+"m")+
      '<div class="optRow"><div class="lb">색상</div><div class="ct"><div class="statRow" id="cbCols">'+
        [0xff7a1a,0xe63946,0x2a6df4,0x3ddc84,0xffd23e,0xe8eef2,0x12161b,0x9d4edd].map(c=>
        '<i data-col="'+c+'" style="display:inline-block;width:26px;height:26px;border-radius:50%;margin-right:6px;'+
        'background:#'+c.toString(16).padStart(6,"0")+';border:2px solid '+(c===CB.color?"#fff":"transparent")+'"></i>').join("")+
      '</div></div></div>'+
      '<div class="btnRow" style="margin-top:20px">'+
        '<button class="btn" id="cbSave">💾 저장하고 선택</button>'+
        '<button class="btn sm" id="cbReset">기본값</button>'+
        (Store.get("customCar",null)?'<button class="btn danger sm" id="cbDel">삭제</button>':'')+
      '</div>'+
      '<p class="note">저장하면 차량 목록에 추가됩니다. 차체는 형상 값에 따라 실시간 생성되며, 물리(출력·그립·서스펜션)는 그대로 시뮬레이션에 반영됩니다.</p>';
    body().querySelectorAll("[data-cb]").forEach(r=>{
      r.oninput=e=>{CB[r.dataset.cb]=+e.target.value;};
      r.onchange=()=>{Sfx.click();garage();};});
    $("cbName").oninput=e=>{CB.name=e.target.value;};
    body().querySelectorAll("[data-seg]").forEach(bn=>bn.onclick=()=>{
      const k=bn.dataset.seg;Sfx.click();
      if(k==="cbDrive")CB.drive=bn.dataset.v;
      else if(k==="cbStyle")CB.style=bn.dataset.v;
      garage();});
    body().querySelectorAll("#cbCols i").forEach(el=>el.onclick=()=>{
      CB.color=+el.dataset.col;Sfx.click();garage();});
    $("cbSave").onclick=()=>{Sfx.click();
      Store.set("customCar",CB);
      const idx=syncCustomCar();
      if(idx>=0){pickCar=idx;pickColor=0;}
      toast("커스텀 차 저장 — 차량 목록에 추가됨");
      show("car");};
    $("cbReset").onclick=()=>{Sfx.click();CB=Object.assign({},CUSTOM_DEFAULT);garage();};
    const del=$("cbDel");
    if(del)del.onclick=()=>{Sfx.click();Store.del("customCar");syncCustomCar();
      CB=Object.assign({},CUSTOM_DEFAULT);
      pickCar=clamp(pickCar,0,CARS.length-1);
      toast("커스텀 차 삭제");show("car");};
  }
  /* ---------- map ---------- */
  function map(){
    const avail=MAPS.filter(m=>m.modes.includes(pickMode));
    const customs=Store.keys("maps:").map(k=>Store.get(k,null)).filter(Boolean)
      .filter(d=>d.tiles.some(t=>t.t==="start"))
      .filter(d=>pickMode==="free"||(pickMode==="time"&&d.tiles.filter(t=>t.t==="check").length>1));
    if(!avail.find(m=>m.id===pickMap)&&!pickMap.startsWith("custom:"))pickMap=avail[0].id;
    body().innerHTML='<div class="h1">맵 선택</div><div class="grid big">'+
      avail.map(m=>{
        const rec=pickMode==="time"?getRec("time|"+m.id+"|"+CARS[pickCar].id):
                  pickMode==="drift"?getRec("drift|"+m.id):null;
        return '<button class="card'+(pickMap===m.id?" sel":"")+'" data-id="'+m.id+'">'+
        '<span class="ic">'+m.icon+'</span><span class="nm">'+m.name+'</span>'+
        '<span class="ds">'+m.desc+'</span>'+
        (rec?'<span class="recBadge">🏅 베스트 '+(pickMode==="drift"?(rec|0)+"점":fmtTime(rec))+'</span>':"")+
        '</button>';}).join("")+
      customs.map(d=>'<button class="card'+(pickMap==="custom:"+d.name?" sel":"")+'" data-id="custom:'+esc(d.name)+'">'+
        '<span class="ic">🛠️</span><span class="nm">'+esc(d.name)+'</span><span class="ds">커스텀 맵</span></button>').join("")+
      '</div><div class="btnRow"><button class="btn" id="mapNext">다음 →</button></div>';
    body().querySelectorAll(".card").forEach(c=>c.onclick=()=>{pickMap=c.dataset.id;Sfx.click();map();});
    $("mapNext").onclick=()=>{Sfx.click();show("opts");};
  }
  /* ---------- options ---------- */
  function opts(){
    const isRace=pickMode==="race";
    body().innerHTML='<div class="h1">주행 설정</div>'+
      seg("시간대","tod",[["day","낮"],["sunset","노을"],["night","밤"]],Game.opts.tod)+
      tglRow("손상 물리","damage","충돌 시 차체 변형·기능 손상"+(pickMode==="crash"?" (크래시 테스트는 항상 켜짐)":""),Game.opts.damage)+
      (isRace?seg("AI 수","aiCount",[["3","3대"],["4","4대"],["5","5대"]],String(Game.opts.aiCount))+
              seg("랩 수","laps",[["1","1랩"],["3","3랩"],["5","5랩"]],String(Game.opts.laps)):"")+
      seg("어시스트","assist",[["casual","캐주얼"],["sport","스포츠"],["sim","시뮬"]],Settings.assist)+
      '<p class="note">캐주얼: 속도감응 조향+자동 카운터스티어+TCS·ABS / 스포츠: ABS·TCS만 / 시뮬: 전부 OFF (물리는 어느 설정에서도 항상 풀 시뮬레이션)</p>'+
      '<div class="btnRow"><button class="btn" id="go" style="flex:1;font-size:18px">🏁 출발</button></div>';
    body().querySelectorAll("[data-seg]").forEach(b=>b.onclick=()=>{
      const k=b.dataset.seg,val=b.dataset.v;Sfx.click();
      if(k==="assist")applyAssistPreset(val);
      else if(k==="aiCount"||k==="laps")Game.opts[k]=+val;
      else Game.opts[k]=val;
      opts();});
    body().querySelectorAll("[data-tgl]").forEach(t=>t.onclick=()=>{
      Game.opts[t.dataset.tgl]=!Game.opts[t.dataset.tgl];Sfx.click();opts();});
    $("go").onclick=()=>{
      Game.mode=pickMode;
      Game.opts.carIdx=pickCar;Game.opts.color=pickColor;Game.opts.mapId=pickMap;
      Sfx.click();Game.startGame();};
  }
  function seg(label,key,items,cur){
    return '<div class="optRow"><div class="lb">'+label+'</div><div class="ct"><div class="seg">'+
      items.map(([v,n])=>'<button data-seg="'+key+'" data-v="'+v+'" class="'+(String(cur)===v?"sel":"")+'">'+n+'</button>').join("")+
      '</div></div></div>';}
  function tglRow(label,key,sub,on){
    return '<div class="optRow"><div class="lb">'+label+'<small>'+sub+'</small></div>'+
      '<div class="tgl'+(on?" on":"")+'" data-tgl="'+key+'"><i></i></div></div>';}

  /* ---------- settings ---------- */
  function settings(){
    const S=Settings;
    // 슬라이더 행 헬퍼: 값 표시 + 즉시 반영
    const sl=(label,key,min,max,stp,fmt,sub)=>
      '<div class="optRow"><div class="lb">'+label+'<small>'+(sub?sub+' · ':'')+
      (fmt?fmt(S[key]):S[key])+'</small></div>'+
      '<div class="ct"><input type="range" data-sl="'+key+'" min="'+min+'" max="'+max+
      '" step="'+stp+'" value="'+S[key]+'"></div></div>';
    const grp=t=>'<div class="h2" style="margin:18px 0 8px;font-size:12px;font-weight:900;letter-spacing:.22em;color:var(--acc2)">'+t+'</div>';
    body().innerHTML='<div class="h1">설정</div>'+
      grp("주행 · 어시스트")+
      seg2("어시스트 프리셋","assist",[["casual","캐주얼"],["sport","스포츠"],["sim","시뮬"]],S.assist)+
      tgl2("ABS","absOn",S.absOn)+tgl2("TCS (트랙션 컨트롤)","tcsOn",S.tcsOn)+
      tgl2("자동 카운터스티어","ctrSteer",S.ctrSteer)+tgl2("저속 안정화","stab",S.stab)+
      tgl2("전복 시 자동 복구","autoUpright",S.autoUpright)+
      grp("차량 물리")+
      sl("타이어 그립","gripMul",.6,1.4,.05,v=>v.toFixed(2)+"×","노면 접지력")+
      sl("서스펜션 댐핑","damperMul",.6,1.6,.05,v=>v.toFixed(2)+"×","감쇠 강도")+
      sl("조향 응답 속도","steerSpeed",.6,1.6,.05,v=>v.toFixed(2)+"×")+
      sl("손상 배율","damageMul",.3,2.5,.1,v=>v.toFixed(1)+"×","충돌 변형·파손 강도")+
      seg2("소프트바디 품질","softQuality",[["low","낮음"],["normal","보통"],["high","높음"]],S.softQuality)+
      grp("조작")+
      seg2("조향 방식","steerMode",[["slider","슬라이더"],["wheel","휠"],["buttons","버튼"],["tilt","틸트"]],S.steerMode)+
      sl("조향 감도","sensitivity",.5,1.5,.05,v=>v.toFixed(2))+
      grp("카메라")+
      sl("시야각 (FOV)","camFov",55,92,1,v=>v+"°")+
      tgl2("속도감 FOV 확장","speedFov",S.speedFov!==false)+
      tgl2("카메라 셰이크","camShake",S.camShake)+
      sl("셰이크 강도","camShakeAmt",0,2,.1,v=>v.toFixed(1)+"×")+
      grp("화면 · HUD")+
      tgl2("텔레메트리 표시 (G·슬립·서스·RPM)","showTelemetry",S.showTelemetry!==false)+
      seg2("속도 단위","units",[["kmh","km/h"],["mph","mph"]],S.units)+
      tgl2("코너 미니맵 표시","minimapOn",S.minimapOn!==false)+
      tgl2("그림자","shadows",S.shadows)+
      tgl2("자동 슬로모션 (강한 충돌 시)","autoSlowmo",S.autoSlowmo)+
      tgl2("충돌 리포트 자동 표시","autoReport",S.autoReport!==false)+
      tgl2("디버그 오버레이 (FPS·슬립각·접지력)","debug",S.debug)+
      grp("사운드")+
      tgl2("사운드","sound",S.sound)+
      '<div class="optRow"><div class="lb">볼륨</div><div class="ct"><input type="range" id="vol" min="0" max="1" step="0.05" value="'+S.volume+'"></div></div>'+
      '<div class="btnRow" style="margin-top:20px"><button class="btn sm" id="resetDef">기본값으로</button>'+
      '<button class="btn danger sm" id="wipe">저장 데이터 초기화</button></div>';
    // 슬라이더 공통 핸들러(즉시 반영)
    body().querySelectorAll("[data-sl]").forEach(r=>{
      r.oninput=e=>{S[r.dataset.sl]=+e.target.value;saveSettings();
        const lb=r.closest(".optRow").querySelector(".lb small");
        if(lb){const k=r.dataset.sl,v=S[k];
          lb.textContent=(k==="camFov")?v+"°":(k==="sensitivity")?v.toFixed(2):
            (k==="damageMul"||k==="camShakeAmt")?v.toFixed(1)+"×":v.toFixed(2)+"×";}};
      r.onchange=()=>settings();});
    const rd=$("resetDef");
    if(rd)rd.onclick=()=>{Sfx.click();
      Object.assign(S,{gripMul:1,damperMul:1,steerSpeed:1,damageMul:1,softQuality:"normal",
        camFov:66,camShakeAmt:1,speedFov:true,showTelemetry:true,units:"kmh",sensitivity:1});
      saveSettings();settings();toast("기본값 복원");};
    body().querySelectorAll("[data-seg]").forEach(b=>b.onclick=()=>{
      const k=b.dataset.seg;Sfx.click();
      if(k==="assist")applyAssistPreset(b.dataset.v);
      else{S[k]=b.dataset.v;saveSettings();
        if(k==="steerMode"){Input.applySteerModeUI();if(b.dataset.v==="tilt")Input.requestTilt();}}
      settings();});
    body().querySelectorAll("[data-tgl]").forEach(t=>t.onclick=()=>{
      const k=t.dataset.tgl;S[k]=!S[k];
      if(["absOn","tcsOn","ctrSteer","stab"].includes(k))S.assist="custom";
      saveSettings();Sfx.setMaster();Sfx.click();
      if(k==="debug")$("debugHud").classList.toggle("on",S.debug);
      if(k==="shadows")applyShadows();
      settings();});
    $("vol").oninput=e=>{S.volume=+e.target.value;saveSettings();Sfx.setMaster();};
    $("wipe").onclick=()=>{
      if(confirm("기록·설정·커스텀 맵을 모두 삭제할까요?")){
        for(const k of Store.keys(""))Store.del(k);
        location.reload();}};
    function seg2(l,k,items,cur){return seg(l,k,items,cur);}
    function tgl2(l,k,on){return '<div class="optRow"><div class="lb">'+l+'</div>'+
      '<div class="tgl'+(on?" on":"")+'" data-tgl="'+k+'"><i></i></div></div>';}
  }

  /* ---------- editor list ---------- */
  function editorList(){
    const maps=Store.keys("maps:").map(k=>Store.get(k,null)).filter(Boolean);
    body().innerHTML='<div class="h1">맵 에디터 <small>24×24 그리드 · 타일 20m</small></div>'+
      '<div class="grid big"><button class="card" id="edNew"><span class="ic">➕</span>'+
      '<span class="nm">새 맵 만들기</span><span class="ds">도로·커브·램프·벽·콘·체크포인트 배치</span></button>'+
      maps.map(d=>'<div class="card"><span class="ic">🗺️</span><span class="nm">'+esc(d.name)+'</span>'+
        '<span class="ds">타일 '+d.tiles.length+'개'+(d.tiles.some(t=>t.t==="start")?"":" · ⚠️ 출발점 없음")+'</span>'+
        '<div class="btnRow"><button class="btn sm" data-play="'+esc(d.name)+'">▶ 주행</button>'+
        '<button class="btn sm ghost" data-edit="'+esc(d.name)+'">✏️ 수정</button>'+
        '<button class="btn sm ghost" data-del="'+esc(d.name)+'">🗑</button></div></div>').join("")+'</div>';
    $("edNew").onclick=()=>{Sfx.click();Editor.open(null);};
    body().querySelectorAll("[data-play]").forEach(b=>b.onclick=()=>{
      const d=Store.get("maps:"+b.dataset.play,null);
      if(!d||!d.tiles.some(t=>t.t==="start")){toast("출발점이 없는 맵입니다");return;}
      Game.mode="free";Game.opts.carIdx=pickCar;Game.opts.mapId="custom:"+b.dataset.play;
      Game.startGame();});
    body().querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>Editor.open(b.dataset.edit));
    body().querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{
      if(confirm('"'+b.dataset.del+'" 맵을 삭제할까요?')){Store.del("maps:"+b.dataset.del);editorList();}});
  }
  function init(){
    $("btnMenuBack").onclick=()=>{Sfx.click();back();};
    $("btnSettings").onclick=()=>{Sfx.click();show(view==="settings"?"home":"settings");};
    show("home");
  }
  return{init,show};
})();
