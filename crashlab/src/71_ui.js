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
      settings:"설정",editorList:"맵 에디터"}[v]||"";
    ({home,car,map,opts,settings,editorList})[v]();
    body().scrollTop=0;
  }
  function back(){
    const order={car:"home",map:"car",opts:"map",settings:"home",editorList:"home"};
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
      '<div class="btnRow"><button class="btn" id="carNext">다음 →</button></div>';
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
  }
  function stat(nm,v){return '<div class="statRow"><em>'+nm+'</em><div class="bar"><i style="width:'+v+'%"></i></div></div>';}
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
    body().innerHTML='<div class="h1">설정</div>'+
      seg2("어시스트 프리셋","assist",[["casual","캐주얼"],["sport","스포츠"],["sim","시뮬"]],S.assist)+
      tgl2("ABS","absOn",S.absOn)+tgl2("TCS (트랙션 컨트롤)","tcsOn",S.tcsOn)+
      tgl2("자동 카운터스티어","ctrSteer",S.ctrSteer)+tgl2("저속 안정화","stab",S.stab)+
      seg2("조향 방식","steerMode",[["slider","슬라이더"],["wheel","휠"],["buttons","버튼"],["tilt","틸트"]],S.steerMode)+
      '<div class="optRow"><div class="lb">조향 감도 <small>'+S.sensitivity.toFixed(2)+'</small></div>'+
      '<div class="ct"><input type="range" id="sens" min="0.5" max="1.5" step="0.05" value="'+S.sensitivity+'"></div></div>'+
      tgl2("사운드","sound",S.sound)+
      '<div class="optRow"><div class="lb">볼륨</div><div class="ct"><input type="range" id="vol" min="0" max="1" step="0.05" value="'+S.volume+'"></div></div>'+
      tgl2("카메라 셰이크","camShake",S.camShake)+
      tgl2("그림자","shadows",S.shadows)+
      tgl2("자동 슬로모션 (강한 충돌 시)","autoSlowmo",S.autoSlowmo)+
      tgl2("충돌 리포트 자동 표시","autoReport",S.autoReport!==false)+
      tgl2("코너 미니맵 표시","minimapOn",S.minimapOn!==false)+
      tgl2("디버그 오버레이 (FPS·슬립각·접지력)","debug",S.debug)+
      '<div class="btnRow"><button class="btn danger sm" id="wipe">저장 데이터 초기화</button></div>';
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
    $("sens").oninput=e=>{S.sensitivity=+e.target.value;saveSettings();};
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
