/* ============================================================
   Cars — 5 specs + procedural high-detail deformable meshes
   (8-point loft, wheel wells, fenders, detachable parts)
   ============================================================ */
const CARS=[
 {id:"medivan",name:"메디밴 911",icon:"🚑",drive:"FF",mass:1250,hp:120,acc:"11초",top:155,
  desc:"입문용 구조 밴. 관대한 그립 — 아이러니하게도 크래시 테스트 단골.",
  model:"ambulance",rollFix:1.3,
  body:{hx:.8,hy:.55,hz:1.9},wheels:{track:.72,front:1.2,rear:1.2,y:-.3,radius:.3,width:.2},
  susp:{k:46000,c:3900,travel:.17,rest:.18},arb:16000,
  engine:{maxT:165,redline:6200,idle:900},gears:[3.4,2.0,1.35,1.0,.82],final:4.1,
  brakeF:6200,steerLo:.62,steerHi:.14,aero:{cd:1.1,df:0},gripF:1.0,gripR:1.02,
  style:"hatch",colors:[0xe8eef2,0xff6b6b,0x4db3ff,0xffd23e,0x7dd87d],
  stats:{spd:28,acc:30,grip:55,mass:26}},
 {id:"gt",name:"드리프트킹 GT",icon:"🏎️",drive:"FR",mass:1380,hp:320,acc:"5.0초",top:255,
  desc:"파워 오버스티어의 교과서. 핸드브레이크 드리프트 진입 특화.",
  model:"race",rollFix:1.35,squashY:.9,
  body:{hx:.86,hy:.5,hz:2.15},wheels:{track:.8,front:1.35,rear:1.4,y:-.28,radius:.32,width:.25},
  susp:{k:64000,c:5400,travel:.12,rest:.15},arb:26000,
  engine:{maxT:420,redline:7200,idle:950},gears:[3.2,2.1,1.5,1.15,.92],final:3.7,
  brakeF:7200,steerLo:.6,steerHi:.13,aero:{cd:.6,df:12},gripF:1.06,gripR:.97,
  style:"coupe",colors:[0xff7a1a,0x222831,0xe63946,0xf1f1f1,0x9d4edd],
  stats:{spd:70,acc:72,grip:70,mass:32}},
 {id:"offroad",name:"오프로드 몬스터",icon:"🚙",drive:"4WD",mass:2150,hp:280,acc:"9.0초",top:160,
  desc:"사용자 제공 로우폴리 오프로더. 롱트래블 서스 + 라이트 포드 + 루프랙.",
  model:"offroadx",rollFix:1.3,squashY:1,comFromWheels:true,realWheels:true,
  wheelOutset:.13,groundClear:.54,           // 와이드 스탠스 + 아주 높은 차고(빅 리프트업)
  wheelRadMul:1.06,wheelWidMul:1.42,         // 바퀴 크고(빅) + 아주 굵게(머드 타이어)
  body:{hx:.95,hy:.75,hz:2.2},wheels:{track:.88,front:1.4,rear:1.4,y:-.5,radius:.42,width:.3},
  susp:{k:56000,c:5600,travel:.25,rest:.3},arb:9000,
  engine:{maxT:400,redline:5200,idle:800},gears:[3.8,2.3,1.6,1.15,.9],final:4.0,
  brakeF:10500,steerLo:.58,steerHi:.15,aero:{cd:1.5,df:0},gripF:.95,gripR:.95,
  style:"suv",colors:[0x5f8b4c,0xc2a368,0x556270,0xb8443c,0x2b2b2b],
  stats:{spd:32,acc:38,grip:60,mass:55}},
 {id:"offroadc",name:"오프로드 몬스터 하드탑",icon:"🛻",drive:"4WD",mass:2210,hp:280,acc:"9.2초",top:158,
  desc:"뚜껑(하드탑)을 덮은 버전 — 동일 섀시 클로즈드 캐빈. 롱트래블 리프트업.",
  model:"offroadc",rollFix:1.3,squashY:1,comFromWheels:true,realWheels:true,
  wheelOutset:.13,groundClear:.54,           // 와이드 스탠스 + 아주 높은 차고(빅 리프트업)
  wheelRadMul:1.06,wheelWidMul:1.42,         // 바퀴 크고(빅) + 아주 굵게(머드 타이어)
  body:{hx:.95,hy:.78,hz:2.2},wheels:{track:.88,front:1.4,rear:1.4,y:-.5,radius:.42,width:.3},
  susp:{k:56000,c:5600,travel:.25,rest:.3},arb:9000,
  engine:{maxT:400,redline:5200,idle:800},gears:[3.8,2.3,1.6,1.15,.9],final:4.0,
  brakeF:10500,steerLo:.58,steerHi:.15,aero:{cd:1.4,df:0},gripF:.95,gripR:.95,
  style:"suv",colors:[0xb8443c,0x5f8b4c,0x556270,0xc2a368,0x2b2b2b],
  stats:{spd:32,acc:37,grip:60,mass:56}},
 {id:"rover",name:"레인지로버 오토바이오그래피",icon:"🛻",drive:"4WD",mass:2480,hp:530,acc:"4.4초",top:250,
  desc:"실차 스캔 3D 모델. 5.0L V8 · 에어 서스펜션. 럭셔리와 오프로드를 한 몸에.",
  model:"rangeRover",rollFix:1.22,squashY:1,comFromWheels:true,realWheels:true,
  body:{hx:1.02,hy:.82,hz:2.42},wheels:{track:.95,front:1.45,rear:1.45,y:-.5,radius:.44,width:.32},
  susp:{k:62000,c:6400,travel:.24,rest:.3},arb:14000,
  engine:{maxT:620,redline:6500,idle:760},gears:[3.6,2.2,1.5,1.1,.85],final:3.9,
  brakeF:12500,steerLo:.56,steerHi:.13,aero:{cd:1.4,df:0},gripF:1.02,gripR:1.02,
  style:"suv",colors:[0x1c3a2a,0x12161b,0xe9ecee,0x8a929a,0x2a3f66],
  stats:{spd:55,acc:60,grip:74,mass:64}},
 {id:"rrghost",name:"롤스로이스 고스트",icon:"🏛️",drive:"4WD",mass:2490,hp:571,acc:"4.8초",top:250,
  desc:"실측 스캔 3D 모델. 6.75L V12 · 플래너 서스펜션. 무결점 도장과 매끈한 차체의 초호화 세단.",
  model:"rrghost",style:"sedan",rollFix:1.2,squashY:1,comFromWheels:true,realWheels:true,
  smoothShade:true,               // 고광택 클리어코트 머티리얼(환경 반사) — 원본 광택 재현
  groundClear:.15,wheelVisFit:1.01,rideFix:true,rideLift:.07,
  body:{hx:1.02,hy:.76,hz:2.775},
  wheels:{track:.9,front:1.6,rear:1.6,y:-.5,radius:.376,width:.28},
  susp:{k:64000,c:8200,travel:.19,rest:.25},arb:26000,
  engine:{maxT:850,redline:5600,idle:600},
  gears:[4.7,3.14,2.11,1.67,1.29,1.0,.84,.67],final:3.15,
  brakeF:19500,steerLo:.5,steerHi:.11,aero:{cd:1.15,df:16},gripF:1.06,gripR:1.06,
  colors:[0x0b0b0d,0xe8eef2,0x1c2a4a,0x6b1f28,0x2f3a34],
  stats:{spd:62,acc:74,grip:70,mass:88}},
 {id:"maybach",name:"메르세데스-마이바흐 GLS",icon:"🚘",drive:"4WD",mass:2560,hp:621,acc:"4.9초",top:240,
  desc:"실측 스캔 3D 모델(GLS 580). V8 4.0 트윈터보 · 롱휠베이스 · 최상급 럭셔리 SUV.",
  model:"maybach",style:"suv",rollFix:1.2,squashY:1,comFromWheels:true,realWheels:true,smoothShade:true,wheelVisFit:1.02,
  body:{hx:1.0,hy:.82,hz:2.55},wheels:{track:.9,front:1.5,rear:1.55,y:-.34,radius:.36,width:.3},
  susp:{k:60000,c:6200,travel:.22,rest:.28},arb:16000,
  engine:{maxT:640,redline:6000,idle:600},gears:[3.5,2.15,1.5,1.15,.9],final:3.9,
  brakeF:12500,steerLo:.54,steerHi:.13,aero:{cd:1.1,df:0},gripF:1.02,gripR:1.02,
  colors:[0xe9ecee,0x0b0d10,0x14203a,0x8a929a,0x3a2c1a],
  stats:{spd:56,acc:60,grip:72,mass:66}},
 {id:"titan",name:"타이탄 카고",icon:"🚚",drive:"RWD",mass:8000,hp:450,acc:"25초",top:120,
  desc:"8톤의 질량. 높은 무게중심 = 전복 장인. 뭐든 밀어버린다.",
  model:"garbageTruck",rollFix:1.12,
  body:{hx:1.15,hy:1.25,hz:3.5},wheels:{track:1.02,front:2.35,rear:2.1,y:-.85,radius:.5,width:.35},
  susp:{k:240000,c:27000,travel:.2,rest:.26},arb:40000,
  engine:{maxT:1650,redline:3800,idle:600},gears:[4.5,2.8,1.8,1.2,.9],final:4.3,
  brakeF:38000,steerLo:.5,steerHi:.1,aero:{cd:6,df:0},gripF:.85,gripR:.88,
  style:"truck",colors:[0x8899aa,0xcf6a2f,0x3d5a80,0x9b2226,0xdddddd],
  stats:{spd:18,acc:12,grip:35,mass:100}},
 {id:"veloce",name:"포르쉐 911 터보",icon:"🏁",drive:"4WD",mass:1595,hp:520,acc:"3.2초",top:315,
  desc:"실차 3D 모델(911 터보 2014). 3.8L 수평대향 6기통 트윈터보 · 리어엔진 4WD.",
  model:"porsche",rollFix:1.34,squashY:1,comFromWheels:true,realWheels:true,smoothShade:true,
  wheelRadMul:1.03,wheelTuck:.01,rimScale:1.28,  // 바퀴·림 크게 + 살짝 안으로(펜더 안쪽으로 5cm 인셋)
  body:{hx:.92,hy:.42,hz:2.2},wheels:{track:.86,front:1.35,rear:1.42,y:-.24,radius:.33,width:.3},
  susp:{k:98000,c:7200,travel:.09,rest:.2},arb:60000,
  engine:{maxT:710,redline:7200,idle:900},gears:[3.15,2.1,1.55,1.2,.95],final:3.5,
  brakeF:9200,steerLo:.56,steerHi:.11,aero:{cd:.5,df:55},gripF:1.12,gripR:1.1,
  style:"super",colors:[0xd7dce2,0xd7263d,0xffe600,0x101418,0x00a8e8],
  stats:{spd:100,acc:100,grip:95,mass:35}},
 {id:"tractor",name:"막강 트랙터",icon:"🚜",drive:"4WD",mass:3200,hp:95,acc:"—",top:62,
  desc:"느리지만 절대 멈추지 않는다. 어떤 지형이든 기어오르는 괴물 토크.",
  model:"tractor",rollFix:1.18,
  body:{hx:.75,hy:.68,hz:1.75},wheels:{track:.72,front:1.1,rear:1.1,y:-.35,radius:.4,width:.3},
  susp:{k:95000,c:9500,travel:.22,rest:.24},arb:20000,
  engine:{maxT:520,redline:2600,idle:650},gears:[4.6,2.6,1.6,1.05],final:3.9,
  brakeF:15000,steerLo:.72,steerHi:.2,aero:{cd:8,df:0},gripF:1.05,gripR:1.08,
  style:"suv",colors:[0x62a844,0xd7263d,0x3d5a80,0xffb340,0x8899aa],
  stats:{spd:6,acc:14,grip:85,mass:62}},
 {id:"f1",name:"아폴로 F1-X",icon:"🏎️",drive:"RWD",mass:798,hp:1010,acc:"2.4초",top:355,
  desc:"포뮬러 원 머신. 1.6L V6 터보하이브리드 1010마력 · 798kg · 다운포스 3,200kg급.\n극단적 그립과 제동력 — 코너에서 5G, 100→0을 2초 안에.",
  // 급조향 전복 방지: 실차처럼 트랙을 넓히고(1.96m) 무게중심을 낮춘다.
  // 전복 한계 ≈ (트랙/2)/무게중심높이 → 넓은 트랙 + 낮은 CoG로 한계를 크게 끌어올림.
  style:"f1",procedural:true,rollFix:2.1,
  body:{hx:.9,hy:.26,hz:2.62},
  wheels:{track:.98,front:1.72,rear:1.66,y:-.16,radius:.34,width:.40},
  // 실제 F1에 가깝게 트래블을 더 짧게(7cm) — 대신 속도에 비례한 다운포스가 차를 눌러
  // 뜸·전복·미끄러짐을 막는다(고속일수록 접지하중↑ → 타이어 한계↑).
  susp:{k:96000,c:9200,travel:.07,rest:.125},arb:150000,   // 롤 강성 대폭↑(급조향 전복 방지)
  engine:{maxT:760,redline:14500,idle:3800},
  gears:[3.05,2.25,1.78,1.45,1.2,1.0,.86,.75],final:3.2,
  brakeF:26000,steerLo:.40,steerHi:.10,aero:{cd:1.05,df:128},  // 다운포스 지배적
  gripF:1.62,gripR:1.70,
  colors:[0xe10600,0x00d2be,0x0090ff,0xff8700,0xf5f5f5],
  stats:{spd:100,acc:100,grip:100,mass:8}},
];

/* ============================================================
   🔧 커스텀 차량 — 사용자가 출력·접지·핸들링·서스펜션·형상을 직접 설계
   튜닝값(0~1 정규화)을 실제 물리 스펙으로 환산해 CARS에 주입한다.
   차체는 절차 로프트(buildCarBody)로 생성되므로 형상 파라미터가 그대로 반영된다.
   ============================================================ */
const CUSTOM_DEFAULT={
  name:"마이 머신",icon:"🛠️",
  power:.55,        // 출력 (엔진 토크·레드라인)
  grip:.55,         // 접지력 (타이어 μ)
  handling:.55,     // 핸들링 (조향각·응답)
  travel:.4,        // 서스펜션 트래블
  stiff:.5,         // 서스펜션 강성(딱딱함)
  mass:.45,         // 공차중량
  drive:"4WD",      // FF | FR | 4WD
  style:"coupe",    // 차체 형상
  len:.5,wid:.5,hei:.5,   // 전장·전폭·전고
  glass:.45,        // 유리 틴팅 (0 투명 → 1 완전 블랙아웃)
  wheelR:.5,        // 휠 지름
  wheelW:.5,        // 타이어 폭
  rim:.55,          // 림 인치(대구경일수록 사이드월이 얇아진다)
  color:0xff7a1a,
};
function customToSpec(C){
  const L=lerp;
  const hz=L(1.7,2.9,C.len), hx=L(.74,1.12,C.wid), hy=L(.42,.92,C.hei);
  const mass=Math.round(L(820,3200,C.mass));
  const maxT=Math.round(L(150,760,C.power));
  const redline=Math.round(L(5200,8200,C.power));
  const hp=Math.round(L(90,720,C.power));
  const travel=+L(.10,.30,C.travel).toFixed(3);
  // 강성: 질량에 비례한 기준 스프링레이트에 강성 슬라이더를 곱함(무거운 차는 더 단단해야 뜨지 않음)
  const k=Math.round(mass*L(20,52,C.stiff));
  const c=Math.round(k*L(.075,.125,C.stiff));
  const grip=+L(.74,1.22,C.grip).toFixed(3);
  const steerLo=+L(.48,.72,C.handling).toFixed(3);
  const steerHi=+L(.09,.19,C.handling).toFixed(3);
  const rest=+L(.16,.34,C.travel).toFixed(3);
  const top=Math.round(L(130,320,C.power)*L(1.05,.92,C.mass));
  const acc0=(L(11.5,2.6,C.power)*L(.85,1.35,C.mass)).toFixed(1);
  return{
    id:"custom",name:C.name||"마이 머신",icon:C.icon||"🛠️",
    drive:C.drive,mass,hp,acc:acc0+"초",top,
    desc:"내가 설계한 커스텀 머신 — 출력·접지·핸들링·서스펜션·형상 사용자 조정.",
    isCustom:true,
    rollFix:1.28,squashY:1,
    body:{hx:+hx.toFixed(3),hy:+hy.toFixed(3),hz:+hz.toFixed(3)},
    wheels:{track:+(hx*.88).toFixed(3),front:+(hz*.62).toFixed(3),rear:+(hz*.64).toFixed(3),
            y:-hy*.55,
            radius:+(L(.30,.46,C.hei)*L(.82,1.34,C.wheelR??.5)).toFixed(3),
            width:+(L(.20,.34,C.wid)*L(.74,1.55,C.wheelW??.5)).toFixed(3)},
    rimScale:+L(.86,1.28,C.rim??.55).toFixed(3),
    glassTint:+(C.glass??.45).toFixed(3),
    susp:{k,c,travel,rest},arb:Math.round(k*L(.18,.46,C.stiff)),
    engine:{maxT,redline,idle:820},
    gears:[3.4,2.1,1.5,1.12,.9],final:3.9,
    brakeF:Math.round(mass*L(3.6,6.2,C.grip)),
    steerLo,steerHi,aero:{cd:L(.7,1.7,C.hei),df:Math.round(L(0,22,C.grip))},
    gripF:grip,gripR:+(grip*1.01).toFixed(3),
    style:C.style,colors:[C.color,0x222831,0xe8eef2,0x3d5a80,0x4a5a40],
    stats:{spd:Math.round(C.power*100),acc:Math.round(C.power*94),
           grip:Math.round(C.grip*100),mass:Math.round(C.mass*100)},
  };
}
function loadCustomCar(){
  const C=Store.get("customCar",null);
  if(!C)return null;
  return Object.assign({},CUSTOM_DEFAULT,C);
}
/* CARS 배열에 커스텀 차를 반영(있으면 갱신, 없으면 추가/제거) */
function syncCustomCar(){
  const C=loadCustomCar();
  const i=CARS.findIndex(c=>c.id==="custom");
  if(!C){if(i>=0)CARS.splice(i,1);return -1;}
  const spec=customToSpec(C);
  if(i>=0)CARS[i]=spec;else CARS.push(spec);
  return CARS.findIndex(c=>c.id==="custom");
}

/* ---------- generic non-indexed geometry merger ---------- */
/* items: {geo, color, x,y,z, rx,ry,rz, sx,sy,sz} — consumes geo */
const _mm=new THREE.Matrix4(),_me=new THREE.Euler();
function mergeGeoms(items){
  const pos=[],nor=[],col=[];
  for(const it of items){
    let g=it.geo.index?it.geo.toNonIndexed():it.geo;
    _me.set(it.rx||0,it.ry||0,it.rz||0);
    _mm.makeRotationFromEuler(_me);
    _mm.setPosition(it.x||0,it.y||0,it.z||0);
    if(it.sx||it.sy||it.sz)g.scale(it.sx||1,it.sy||1,it.sz||1);
    g.applyMatrix4(_mm);
    const p=g.attributes.position.array,n=g.attributes.normal.array;
    const c=new THREE.Color(it.color);
    for(let i=0;i<p.length;i++){pos.push(p[i]);nor.push(n[i]);}
    for(let i=0;i<p.length/3;i++)col.push(c.r,c.g,c.b);
    g.dispose();if(g!==it.geo)it.geo.dispose();}
  const out=new THREE.BufferGeometry();
  out.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  out.setAttribute("normal",new THREE.Float32BufferAttribute(nor,3));
  out.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
  return out;
}

/* ---------- body loft: 8-point cross-section stations ---------- */
/* station fields (normalized: w,x in hx / y in hy / z in hz):
   z, w(lower width), y0(floor), y1(belt), y2(roof), wt(roof width),
   glass(side glass segment), top(roof segment is glass e.g. windshield) */
function carStations(spec){
  const{hx,hy,hz}=spec.body,st=spec.style;
  const S=(z,w,y0,y1,y2,wt,glass,top)=>({z:z*hz,w:w*hx,y0:y0*hy,y1:y1*hy,y2:y2*hy,
    wt:(wt??.64)*hx,glass:glass||0,top:top||0});
  if(st==="hatch")return[
    S(1,.72,-.62,-.08,-.02,.58),S(.92,.92,-.78,.02,.1,.72),S(.62,1,-.85,.1,.18,.8),
    S(.38,1,-.86,.14,.24,.82),S(.14,1,-.86,.14,.9,.66,0,1),S(.02,.995,-.86,.14,.96,.64),
    S(-.3,1,-.86,.14,1,.64,1),S(-.62,.99,-.85,.12,.97,.63,1),S(-.8,.96,-.8,.1,.9,.62,1,1),
    S(-.92,.9,-.72,.05,.4,.6),S(-1,.74,-.6,-.05,.28,.56)];
  if(st==="coupe")return[
    S(1,.74,-.68,-.24,-.16,.6),S(.9,.94,-.85,-.12,-.02,.76),S(.55,1,-.9,-.02,.1,.84),
    S(.28,1,-.9,.02,.16,.84),S(.1,1,-.9,.04,.76,.62,0,1),S(-.02,.995,-.9,.05,.84,.58),
    S(-.35,1,-.9,.05,.86,.58,1),S(-.58,.99,-.88,.04,.72,.56,1,1),
    S(-.8,.97,-.82,.02,.3,.66),S(-1,.78,-.65,-.1,.16,.62)];
  if(st==="suv")return[
    S(1,.8,-.5,0,.1,.66),S(.9,.96,-.68,.12,.3,.8),S(.66,1,-.75,.18,.4,.84),
    S(.46,1,-.78,.2,.42,.84),S(.3,1,-.78,.2,1,.76,0,1),S(.18,.995,-.78,.2,1.05,.74),
    S(-.2,1,-.78,.2,1.06,.74,1),S(-.6,1,-.78,.2,1.05,.74,1),S(-.88,.98,-.74,.17,1,.72,1),
    S(-1,.8,-.55,.05,.92,.68)];
  if(st==="truck")return[
    S(1,.78,-.42,.12,.32,.66),S(.96,.95,-.5,.3,.55,.8),S(.88,.96,-.55,.32,.9,.78,0,1),
    S(.72,.96,-.6,.32,.95,.78,1),S(.54,.94,-.62,.3,.9,.76),
    S(.48,.99,-.65,.4,1.02,.92),S(-.9,.99,-.65,.4,1.02,.92),S(-1,.92,-.55,.3,.97,.86)];
  if(st==="sedan")return[   // 롱휠베이스 럭셔리 세단 (3박스: 롱후드·캐빈·트렁크)
    S(1,.7,-.52,-.2,-.12,.6),S(.93,.93,-.68,-.06,.03,.78),S(.72,1,-.74,.06,.16,.86),
    S(.5,1,-.76,.1,.22,.86),S(.34,1,-.76,.12,.9,.6,0,1),S(.2,.995,-.76,.12,1,.58),
    S(-.14,1,-.76,.12,1.02,.58,1),S(-.4,1,-.76,.12,.98,.58,1,1),S(-.6,.99,-.75,.1,.56,.68),
    S(-.84,.96,-.68,.02,.34,.66),S(-1,.76,-.54,-.14,.22,.6)];
  if(st==="f1")return[   // 오픈휠 포뮬러: 뾰족한 노즈 → 넓은 사이드포드 → 좁은 엔진커버
    S(1,.18,-.55,-.30,-.20,.16),S(.86,.34,-.72,-.30,-.10,.30),S(.62,.62,-.85,-.25,.10,.52),
    S(.36,.80,-.90,-.20,.36,.60),S(.10,.84,-.92,-.18,.62,.52),S(-.16,.80,-.92,-.18,.70,.42),
    S(-.44,.66,-.90,-.20,.62,.34),S(-.70,.50,-.86,-.24,.42,.28),S(-.90,.38,-.78,-.30,.24,.24),
    S(-1,.28,-.66,-.36,.10,.20)];
  /* super */ return[
    S(1,.7,-.8,-.56,-.5,.58),S(.85,.95,-.95,-.42,-.32,.8),S(.5,1,-1,-.3,-.16,.86),
    S(.27,1,-1,-.26,-.1,.86),S(.1,1,-1,-.24,.48,.6,0,1),S(-.02,.995,-1,-.22,.62,.56),
    S(-.3,1,-1,-.2,.66,.56,1),S(-.48,1,-1,-.18,.52,.6,1,1),
    S(-.72,.99,-.95,-.15,.32,.74),S(-1,.84,-.75,-.3,.2,.7)];
}
const GLASS_COL=new THREE.Color(0x151d28);
/* 종방향 세분화: 스테이션 사이를 카트멀-롬으로 보간해 차체 실루엣을 매끄럽게(각진 쐐기 → 유선형).
   glass/top 플래그는 원본 구간의 것을 유지하고, 유리 경계는 원 스테이션에서만 바뀌게 한다. */
function subdivStations(st,n){
  if(n<2||st.length<2)return st;
  const key=["z","w","y0","y1","y2","wt"];
  const cr=(p0,p1,p2,p3,t)=>{const t2=t*t,t3=t2*t;
    return .5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3);};
  const at=i=>st[clamp(i,0,st.length-1)];
  const out=[];
  for(let i=0;i<st.length-1;i++){
    const p0=at(i-1),p1=st[i],p2=st[i+1],p3=at(i+2);
    for(let s=0;s<n;s++){
      const t=s/n,o={};
      for(const k of key)o[k]=cr(p0[k],p1[k],p2[k],p3[k],t);
      // 유리 구간 플래그는 원 구간을 그대로 계승(경계가 흐려지지 않게)
      o.glass=p1.glass;o.top=p1.top;
      out.push(o);}}
  out.push(st[st.length-1]);
  return out;
}
function buildCarBody(spec,colorHex){
  // 실루엣 품질: 스테이션 3배 세분화 + 어깨(숄더) 라운딩 → 실차처럼 매끈한 바디
  const st=subdivStations(carStations(spec),3);
  const body=new THREE.Color(colorHex);
  const shade=body.clone().multiplyScalar(.66);
  const dark=body.clone().multiplyScalar(.42);
  const roof=body.clone().multiplyScalar(.88);
  const pos=[],col=[];
  // 12 section points (어깨 라운딩 추가): 0 bl,1 br,2 rockerR,3 beltR,
  //   4 shoulderR(벨트→루프 라운딩), 5 roofR, 6 roofL, 7 shoulderL, 8 beltL, 9 rockerL
  const P=(s,k)=>{
    const wf=s.w*1.04,yf=s.y0+(s.y1-s.y0)*.3,wb=s.w*.985;
    // 어깨: 벨트라인과 루프 사이를 안쪽으로 살짝 좁히며 올라가는 중간점(캐빈 곡면)
    const sw=lerp(wb,s.wt,.62),sy=lerp(s.y1,s.y2,.74);
    switch(k){
      case 0:return[-s.w*.92,s.y0]; case 1:return[s.w*.92,s.y0];
      case 2:return[wf,yf];         case 3:return[wb,s.y1];
      case 4:return[sw,sy];         case 5:return[s.wt,s.y2];
      case 6:return[-s.wt,s.y2];    case 7:return[-sw,sy];
      case 8:return[-wb,s.y1];      default:return[-wf,yf];}};
  const NP=10;   // 단면 점 개수
  const quad=(p1,p2,p3,p4,za,zb,c)=>{
    pos.push(p1[0],p1[1],za, p4[0],p4[1],zb, p3[0],p3[1],zb,
             p1[0],p1[1],za, p3[0],p3[1],zb, p2[0],p2[1],za);
    for(let i=0;i<6;i++)col.push(c.r,c.g,c.b);};
  for(let i=0;i<st.length-1;i++){
    const a=st[i],b=st[i+1];
    const sideGlass=(a.glass||b.glass)?GLASS_COL:body;
    const topC=(a.top||b.top)?GLASS_COL:roof;
    const edges=[[0,1,dark],[1,2,shade],[2,3,body],[3,4,sideGlass],[4,5,sideGlass],
                 [5,6,topC],[6,7,sideGlass],[7,8,sideGlass],[8,9,body],[9,0,shade]];
    for(const[k1,k2,c]of edges)
      quad(P(a,k1),P(a,k2),P(b,k2),P(b,k1),a.z,b.z,c);}
  // caps (front & rear faces) as fans
  const cap=(s,rev,c)=>{
    for(let k=1;k<NP-1;k++){
      const[x0,y0]=P(s,0),[x1,y1]=P(s,k),[x2,y2]=P(s,k+1);
      if(rev)pos.push(x0,y0,s.z,x1,y1,s.z,x2,y2,s.z);
      else pos.push(x0,y0,s.z,x2,y2,s.z,x1,y1,s.z);
      for(let i=0;i<3;i++)col.push(c.r,c.g,c.b);}};
  cap(st[0],false,body);cap(st[st.length-1],true,shade);
  // fake AO: darken toward floor
  let yMin=1e9,yMax=-1e9;
  for(let i=1;i<pos.length;i+=3){yMin=Math.min(yMin,pos[i]);yMax=Math.max(yMax,pos[i]);}
  for(let i=0;i<pos.length;i+=3){
    const t=.72+.28*clamp((pos[i+1]-yMin)/(yMax-yMin+1e-6),0,1);
    col[i]*=t;col[i+1]*=t;col[i+2]*=t;}
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
  g.computeVertexNormals();
  return g;
}
/* interpolate station roof height / belt at z (for part placement) */
function stationLerp(st,z,key){
  for(let i=0;i<st.length-1;i++){
    const a=st[i],b=st[i+1];
    if((z<=a.z&&z>=b.z)||(z>=a.z&&z<=b.z)){
      const t=(z-a.z)/((b.z-a.z)||1e-6);return lerp(a[key],b[key],t);}}
  return st[0][key];
}

/* 절차 생성 환경맵(하늘·지평선·지면 그라디언트 + 하이라이트 밴드) — 도장·크롬이 실제처럼 비침.
   슬림 THREE 빌드에 CubeTexture 클래스가 없어 CanvasTexture 인스턴스를 큐브 텍스처로 변환(렌더러는 isCubeTexture 플래그로 분기). */
function makeCarEnv(){
  const faces=[];
  for(let f=0;f<6;f++){
    const cv=document.createElement("canvas");cv.width=cv.height=64;
    const g=cv.getContext("2d");
    const gr=g.createLinearGradient(0,0,0,64);
    if(f===2){gr.addColorStop(0,"#f2f7fd");gr.addColorStop(1,"#cfe0f2");}       // +Y 하늘
    else if(f===3){gr.addColorStop(0,"#3a3f47");gr.addColorStop(1,"#282c33");}  // -Y 지면
    else{gr.addColorStop(0,"#e7eff9");gr.addColorStop(.52,"#a9bccf");
         gr.addColorStop(.6,"#68737f");gr.addColorStop(1,"#3f454e");}           // 지평선 측면
    g.fillStyle=gr;g.fillRect(0,0,64,64);
    if(f!==2&&f!==3){g.fillStyle="rgba(255,255,255,.9)";g.fillRect(0,20,64,4);} // 스튜디오 하이라이트 밴드
    faces.push(cv);}
  const t=new THREE.CanvasTexture(faces[0]);
  t.isCubeTexture=true;t.image=faces;      // 6면 큐브로 재구성
  t.mapping=301;                           // CubeReflectionMapping
  t.flipY=false;t.generateMipmaps=false;t.minFilter=1006/*LinearFilter*/;
  t.needsUpdate=true;return t;}
const ENV_CAR=(()=>{try{return makeCarEnv();}catch(e){return null;}})();
const MAT_CAR=new THREE.MeshPhongMaterial({vertexColors:true,flatShading:true,shininess:135,specular:0x9aa2ae,side:THREE.DoubleSide,
  envMap:ENV_CAR,combine:1/*Mix*/,reflectivity:.12}); // 클리어코트 광택·양면(베이크 차량 투명 방지)
const MAT_CAR_SMOOTH=new THREE.MeshPhongMaterial({vertexColors:true,flatShading:false,shininess:210,specular:0xc2cdd8,side:THREE.DoubleSide,
  envMap:ENV_CAR,combine:1/*Mix*/,reflectivity:.3}); // 유광 클리어코트+환경반사 — 매끈하게 이어진 표면(포르쉐·GLS), 크롬부는 밝아서 더 강하게 비침
const MAT_GLASS=new THREE.MeshPhongMaterial({vertexColors:true,flatShading:true,shininess:160,specular:0xaFC4d8,
  transparent:true,opacity:.62,side:THREE.DoubleSide}); // 진짜 투명 유리(실내 비침)
/* 유리 틴팅 — 커스텀 차의 glassTint(0 투명 ~ 1 블랙아웃)를 실제 머티리얼에 반영.
   기본 차량(틴트 미지정)은 공용 MAT_GLASS를 그대로 써서 머티리얼 수를 늘리지 않는다. */
const _tintMats={};
function glassMatFor(spec){
  const t=spec&&spec.glassTint;
  if(t===undefined||t===null)return MAT_GLASS;
  const k=(t*20|0);
  if(!_tintMats[k]){
    const m=MAT_GLASS.clone();
    m.opacity=lerp(.34,.94,t);
    m.shininess=lerp(220,110,t);
    m.specular=new THREE.Color().setHSL(.58,.18,lerp(.72,.3,t));
    _tintMats[k]=m;}
  return _tintMats[k];}
const MAT_LAMP=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.9,
  side:THREE.DoubleSide,toneMapped:false}); // 자체발광(조명 무시) 투명 렌즈 — 실제 빛나는 램프
const MAT_DETAIL=new THREE.MeshPhongMaterial({vertexColors:true,flatShading:true,shininess:30,specular:0x222222,side:THREE.DoubleSide}); // 양면 → 타이어 측벽이 비쳐 보이지 않음
let _wheelGeoCache={};
function wheelGeo(r,wd,rimS){ // 실감형: 타이어(고무)+알로이 림+스포크+센터캡 (회전부). rimS=대구경 휠 배율
  rimS=Math.min(rimS||1,1.28);
  const k=(r*100|0)+"_"+(wd*100|0)+"_"+(rimS*100|0);
  if(!_wheelGeoCache[k]){
    const rim=r*.62*rimS;                       // 림 페이스 반경(대구경일수록 사이드월 얇게)
    const tw=Math.min(Math.max(wd*.55,r*.19),(r-rim)*1.15+.02);
    const items=[
      // 타이어: 토러스(림이 보이는 실제 단면)
      {geo:new THREE.TorusGeometry(r-tw,tw,10,28),color:0x0c0d0f,ry:Math.PI/2,sx:1,sy:1,sz:1},
      // 림 배럴 (딥 건메탈)
      {geo:new THREE.CylinderGeometry(rim*1.03,rim*1.03,wd*.66,20),color:0x17191d,rz:Math.PI/2},
      // 림 디쉬 (다크 알로이 페이스 — AMG 스타일)
      {geo:new THREE.CylinderGeometry(rim,rim,wd*.68,20),color:0x2c3138,rz:Math.PI/2},
      // 폴리시드 림 립(밝은 링)
      {geo:new THREE.TorusGeometry(rim,r*.03,6,26),color:0xc7ced6,ry:Math.PI/2},
      // 센터 캡 + 허브 링
      {geo:new THREE.CylinderGeometry(r*.12,r*.12,wd*.74,12),color:0xd8dde3,rz:Math.PI/2},
      {geo:new THREE.TorusGeometry(r*.2,r*.02,5,16),color:0x8f979f,ry:Math.PI/2},
      // 브레이크 디스크(회전부 — 휠과 함께 돈다)
      {geo:new THREE.CylinderGeometry(r*.46,r*.46,wd*.3,16),color:0x484d54,rz:Math.PI/2}];
    // 트윈 5-스포크(10개, 폴리시드 페이스 + 얇은 단면)
    for(let sp=0;sp<10;sp++){
      const a=sp*Math.PI/5+(sp%2?.11:-.11);
      items.push({geo:new THREE.BoxGeometry(wd*.62,rim*1.87,r*.055),color:sp%2?0xb9c2cc:0xd4dae0,rx:a});}
    // 밸브 마커(오프센터 포인트) — 회전이 어느 속도에서도 또렷이 보임
    items.push({geo:new THREE.BoxGeometry(wd*.8,r*.09,r*.09),color:0xffd23e,y:r*.48});
    _wheelGeoCache[k]=mergeGeoms(items);}
  return _wheelGeoCache[k];
}
let _brakeGeoCache={};
function brakeGeo(r,wd){ // 비회전부: 캘리퍼만(디스크는 휠과 함께 회전)
  const k=(r*100|0)+"_"+(wd*100|0);
  if(!_brakeGeoCache[k])
    _brakeGeoCache[k]=mergeGeoms([
      {geo:new THREE.BoxGeometry(wd*.42,r*.34,r*.24),color:0xb33227,y:r*.28,z:r*.3}]);
  return _brakeGeoCache[k];
}

/* deform helper (unchanged API) */
function deformGeo(mesh,lp,ln,d,R,cap){
  const g=mesh.geometry,posA=g.attributes.position;
  if(!posA)return 0;
  if(!mesh.userData.orig)mesh.userData.orig=posA.array.slice();
  const arr=posA.array,off=mesh.position;
  const lx=lp.x-off.x,ly=lp.y-off.y,lz=lp.z-off.z;
  let moved=false,vol=0;
  for(let i=0;i<arr.length;i+=3){
    const dx=arr[i]-lx,dy=arr[i+1]-ly,dz=arr[i+2]-lz;
    const dist=Math.sqrt(dx*dx+dy*dy+dz*dz);
    if(dist<R){
      const t=1-(dist/R)*(dist/R),f=t*t*d;
      let nx=arr[i]+ln.x*f,ny=arr[i+1]+ln.y*f,nz=arr[i+2]+ln.z*f;
      const o=mesh.userData.orig;
      const tx=nx-o[i],ty=ny-o[i+1],tz=nz-o[i+2];
      const tot=Math.sqrt(tx*tx+ty*ty+tz*tz);
      if(tot>cap){const s=cap/tot;nx=o[i]+tx*s;ny=o[i+1]+ty*s;nz=o[i+2]+tz*s;}
      arr[i]=nx;arr[i+1]=ny;arr[i+2]=nz;moved=true;vol+=f;}}
  if(moved){posA.needsUpdate=true;g.computeVertexNormals();}
  return vol;
}
function restoreGeo(mesh){
  if(!mesh.userData.orig)return;
  mesh.geometry.attributes.position.array.set(mesh.userData.orig);
  mesh.geometry.attributes.position.needsUpdate=true;
  mesh.geometry.computeVertexNormals();
}

/* ---------- car visual ---------- */
class CarVisual{
  constructor(spec,colorHex){
    this.spec=spec;this.colorHex=colorHex;
    this.group=new THREE.Group();
    this.baked=(typeof BAKED!=="undefined")&&BAKED[spec.model]||null;
    if(this.baked)this.buildBaked(spec,colorHex);
    else this.buildProcedural(spec,colorHex);
    this.hp0=Object.assign({},this.partHp);
    this.detached={};
    this.defVol=0;
  }
  mkPart(w,h,d,x,y,z,mat){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d,2,1,2).toNonIndexed(),mat);
    m.position.set(x,y,z);m.castShadow=true;this.group.add(m);return m;}

  /* ===== 외부(베이크) 모델 차량 ===== */
  buildBaked(spec,colorHex){
    const e=this.baked,{hx,hy,hz}=spec.body;
    const split=Assets.geoSplit(e,{scale:spec.modelScale,sy:spec.squashY||1,
      cx:spec.modelCx,cy:spec.modelCy,cz:spec.modelCz,paint:new THREE.Color(colorHex)});
    this.bodyMesh=new THREE.Mesh(split.main,spec.smoothShade?MAT_CAR_SMOOTH:MAT_CAR);
    this.bodyMesh.castShadow=true;this.group.add(this.bodyMesh);
    if(split.lamps){this.lampsMesh=new THREE.Mesh(split.lamps,MAT_LAMP);
      this.group.add(this.lampsMesh);
      // 전조등 앵커만 계산해 저장(실제 SpotLight는 플레이어 차에서만 지연 생성 →
      // 썸네일·AI 차량에 광원이 붙어 셰이더가 재컴파일돼 부팅이 느려지는 문제 방지)
      const pa=split.lamps.attributes.position.array;
      let zMax=-1e9;for(let i=2;i<pa.length;i+=3)if(pa[i]>zMax)zMax=pa[i];
      let lxS=0,lc=0,rxS=0,rc=0,yS=0,yc=0;
      for(let i=0;i<pa.length;i+=3)if(pa[i+2]>zMax-.4){
        const x=pa[i];yS+=pa[i+1];yc++;
        if(x<-.12){lxS+=x;lc++;}else if(x>.12){rxS+=x;rc++;}}
      if(lc&&rc)this.hlAnchor=[[lxS/lc,yS/yc,zMax-.02],[rxS/rc,yS/yc,zMax-.02]];}
    if(split.glass){this.glassMesh=new THREE.Mesh(split.glass,glassMatFor(spec));
      this.glassMesh.castShadow=true;this.group.add(this.glassMesh);}
    this.lattice=new SoftLattice(spec,[this.bodyMesh,this.glassMesh,this.lampsMesh]);
    const bumpMat=new THREE.MeshPhongMaterial({color:0x191d24,flatShading:true,shininess:18});
    const by=Math.max(spec.modelWheelY,-hy*.62);
    // 범퍼/미러 파트를 실제 차체 바운딩에 밀착 (모델 중심 오프셋 대응)
    this.bodyMesh.geometry.computeBoundingBox();
    const bx=this.bodyMesh.geometry.boundingBox;
    const zF=bx.max.z,zR=bx.min.z,xR=Math.max(Math.abs(bx.min.x),Math.abs(bx.max.x));
    this.parts={
      fb:this.mkPart(hx*1.02,hy*.15,.09,0,by+hy*.06,zF-.16,bumpMat),
      rb:this.mkPart(hx*1.02,hy*.15,.09,0,by+hy*.06,zR+.16,bumpMat),
      ml:this.mkPart(.07,.08,.17,-xR*.96,hy*.1,zF*.34,bumpMat),
      mr:this.mkPart(.07,.08,.17,xR*.96,hy*.1,zF*.34,bumpMat)};
    this.partHp={fb:1.3,rb:1.3,ml:.3,mr:.3};
    // 오프로드 몬스터 전용 액세서리(지프 스타일): 불바·루프 LED바·록슬라이더
    if(spec.id==="offroad"||spec.id==="offroadc"){
      const topY=bx.max.y,botY=bx.min.y;
      const acc=[
        // 프런트 불바(그릴 가드): 가로 튜브 2 + 세로 튜브 2
        {geo:new THREE.CylinderGeometry(.05,.05,hx*1.55,10),color:0x272c33,rz:Math.PI/2,y:by+hy*.3,z:zF+.12},
        {geo:new THREE.CylinderGeometry(.042,.042,hx*1.25,10),color:0x272c33,rz:Math.PI/2,y:by+hy*.66,z:zF+.07},
        {geo:new THREE.CylinderGeometry(.038,.038,hy*.55,8),color:0x272c33,x:-hx*.48,y:by+hy*.48,z:zF+.1},
        {geo:new THREE.CylinderGeometry(.038,.038,hy*.55,8),color:0x272c33,x:hx*.48,y:by+hy*.48,z:zF+.1},
        // 루프 LED 라이트바 하우징
        {geo:new THREE.BoxGeometry(hx*1.5,.1,.13),color:0x14161a,y:topY+.06,z:zF*.32},
        // 사이드 록슬라이더(양쪽 스텝)
        {geo:new THREE.BoxGeometry(.11,.08,hz*1.1),color:0x1a1d22,x:-hx*1.04,y:botY+.1},
        {geo:new THREE.BoxGeometry(.11,.08,hz*1.1),color:0x1a1d22,x:hx*1.04,y:botY+.1},
        // 리어 견인 후크
        {geo:new THREE.BoxGeometry(.1,.08,.14),color:0xb5443c,x:-hx*.4,y:by+hy*.18,z:zR-.1},
        {geo:new THREE.BoxGeometry(.1,.08,.14),color:0xb5443c,x:hx*.4,y:by+hy*.18,z:zR-.1},
        // 윈치(불바 중앙) — 드럼 + 페어리드 + 와이어
        {geo:new THREE.CylinderGeometry(.09,.09,.34,12),color:0x3d444d,rz:Math.PI/2,y:by+hy*.44,z:zF+.02},
        {geo:new THREE.BoxGeometry(.3,.11,.045),color:0x9aa2ab,y:by+hy*.44,z:zF+.17},
        {geo:new THREE.CylinderGeometry(.012,.012,.2,6),color:0xc7ced6,rx:Math.PI/2,y:by+hy*.44,z:zF+.26},
        // 스키드 플레이트(언더가드) — 프런트/미드
        {geo:new THREE.BoxGeometry(hx*1.5,.05,hz*.5),color:0x6b727c,y:botY+.03,z:zF*.5},
        {geo:new THREE.BoxGeometry(hx*1.4,.05,hz*.42),color:0x565c66,y:botY+.03,z:zR*.42},
        // 리어 스페어 타이어(캐리어 + 타이어 + 림)
        {geo:new THREE.BoxGeometry(.08,.5,.1),color:0x272c33,y:by+hy*.75,z:zR-.14},
        {geo:new THREE.TorusGeometry(.3,.115,8,20),color:0x0c0d0f,y:by+hy*.9,z:zR-.3},
        {geo:new THREE.CylinderGeometry(.19,.19,.14,14),color:0x2c3138,rx:Math.PI/2,y:by+hy*.9,z:zR-.3},
        // 배기 스택(리어 우측) + 머드 플랩 4개
        {geo:new THREE.CylinderGeometry(.045,.05,.5,10),color:0x8f979f,x:hx*.72,y:by+hy*.5,z:zR+.2},
        {geo:new THREE.BoxGeometry(.24,.22,.02),color:0x14181d,x:-hx*.92,y:botY+.14,z:zF*.62},
        {geo:new THREE.BoxGeometry(.24,.22,.02),color:0x14181d,x:hx*.92,y:botY+.14,z:zF*.62},
        {geo:new THREE.BoxGeometry(.24,.22,.02),color:0x14181d,x:-hx*.92,y:botY+.14,z:zR*.72},
        {geo:new THREE.BoxGeometry(.24,.22,.02),color:0x14181d,x:hx*.92,y:botY+.14,z:zR*.72},
        // 루프 라이트바 마운트 브래킷
        {geo:new THREE.BoxGeometry(.05,.1,.05),color:0x14161a,x:-hx*.62,y:topY+.01,z:zF*.32},
        {geo:new THREE.BoxGeometry(.05,.1,.05),color:0x14161a,x:hx*.62,y:topY+.01,z:zF*.32}];
      // 프런트 스팟 램프 4구(불바 상단) — 하우징
      for(let sp=0;sp<4;sp++)
        acc.push({geo:new THREE.CylinderGeometry(.075,.075,.07,12),color:0x22262c,
          rx:Math.PI/2,x:(sp-1.5)*hx*.42,y:by+hy*.78,z:zF+.02});
      // 하드탑: 컴팩트 지프풍 캐빈 하드탑(짧고 낮게·멋지게) — 캐빈만 덮어 짐칸은 개방
      if(spec.id==="offroadc"){
        const zMid=zR+(zF-zR)*.34,cz=(zR+.12+zMid)/2,cl=zMid-zR-.16;  // 더 짧게(캐빈만)
        const yTop=topY*.9,yBot=topY*.42,ch=yTop-yBot,cy=(yTop+yBot)/2; // 더 낮게(슬릭)
        acc.push({geo:new THREE.BoxGeometry(hx*1.5,ch,cl),color:0x2b3138,y:cy,z:cz});             // 다크 하드탑 쉘
        // 사이드 윈도우(틴티드) + 리어 윈도우
        for(const s of[-1,1])acc.push({geo:new THREE.BoxGeometry(.025,ch*.44,cl*.66),color:0x0e1216,x:s*hx*.76,y:cy+ch*.1,z:cz});
        acc.push({geo:new THREE.BoxGeometry(hx*1.1,ch*.44,.025),color:0x0e1216,y:cy+ch*.1,z:zR+.06});
        // 루프 레일(양측 크로스바) — 지프풍 디테일
        acc.push({geo:new THREE.BoxGeometry(hx*1.56,.05,cl+.1),color:0x3a4149,y:yTop+.03,z:cz});    // 루프 캡
        for(let cb=0;cb<2;cb++)acc.push({geo:new THREE.BoxGeometry(hx*1.5,.05,.06),color:0x14181d,y:yTop+.08,z:cz-cl*.3+cb*cl*.6});
        // 스노클(우측 A필러) — 오프로드 포인트
        acc.push({geo:new THREE.CylinderGeometry(.05,.05,ch*1.5,8),color:0x14181d,x:hx*.92,y:cy+ch*.2,z:zMid-.05});}
      this.accMesh=new THREE.Mesh(mergeGeoms(acc),MAT_DETAIL);
      this.accMesh.castShadow=true;this.group.add(this.accMesh);
      // LED 라이트바 + 프런트 스팟 램프 렌즈(자체발광)
      const lensMat=new THREE.MeshBasicMaterial({color:0xfff3c6,toneMapped:false});
      this.ledMesh=new THREE.Mesh(new THREE.BoxGeometry(hx*1.42,.055,.05),lensMat);
      this.ledMesh.position.set(0,topY+.06,zF*.32+.06);
      this.group.add(this.ledMesh);
      {const pods=[];
       for(let sp=0;sp<4;sp++)
         pods.push({geo:new THREE.CylinderGeometry(.058,.058,.03,12),color:0xfff3c6,
           rx:Math.PI/2,x:(sp-1.5)*hx*.42,y:by+hy*.78,z:zF+.06});
       this.podMesh=new THREE.Mesh(mergeGeoms(pods),lensMat);
       this.group.add(this.podMesh);}}
    const wg=wheelGeo(spec.wheels.radius,spec.wheels.width,spec.rimScale);
    const bg=brakeGeo(spec.wheels.radius,spec.wheels.width);
    this._wheelGeo=wg;this.wheelOff=[false,false,false,false];
    // 휠 아치에 꽉 끼는 시각 스케일(물리는 그대로) — 스캔 차량의 아치 개구부 충전
    const wf=spec.wheelVisFit||1;
    this.wheelYOff=(wf-1)*spec.wheels.radius;
    this.wheelMeshes=[];
    // 리프트업 차량: 바퀴가 차체에서 동떨어져 보이지 않게 서스펜션 링크(스트럿+하프샤프트)로 연결
    const linked=spec.id==="offroad"||spec.id==="offroadc";
    const linkMat=linked?new THREE.MeshPhongMaterial({color:0x2a2e35,flatShading:true,shininess:26}):null;
    const susLen=linked?spec.susp.rest*.62:0;   // 허브→차체 바닥까지만(펜더 위로 튀어나오지 않게)
    for(let i=0;i<4;i++){
      const m=new THREE.Mesh(wg,MAT_DETAIL);m.castShadow=true;
      const br=new THREE.Mesh(bg,MAT_DETAIL);
      const grp=new THREE.Group();grp.add(m);grp.add(br);
      if(linked){
        const inX=(i%2===0?1:-1)*spec.wheels.radius*.5;         // 차체 안쪽 방향
        const strut=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,susLen,8),linkMat);
        strut.position.set(inX*.4,susLen*.5,0);strut.rotation.z=(i%2===0?-1:1)*.14;
        grp.add(strut);                                          // 코일오버 스트럿(위로 차체 속까지)
        const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,spec.wheels.radius*1.6,8),linkMat);
        shaft.rotation.z=Math.PI/2;shaft.position.set(inX,spec.wheels.radius*.12,0);
        grp.add(shaft);                                          // 하프샤프트(휠 허브 → 차체)
        const arm=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,spec.wheels.radius*1.5,8),linkMat);
        arm.rotation.x=Math.PI/2;arm.position.set(inX*.8,-spec.wheels.radius*.18,spec.wheels.radius*.55);
        grp.add(arm);}                                           // 트레일링 암
      if(wf!==1)grp.scale.setScalar(wf);
      this.group.add(grp);this.wheelMeshes.push(grp);}
  }

  /* ===== 절차 생성 차량 (폴백) ===== */
  /* 🏎️ F1 전용 고밀도 절차 생성 — 모노코크·사이드포드·노즈콘·프론트/리어 윙·
     할로·에어박스·엔진커버·디퓨저·서스펜션 위시본·배기까지 실루엣 재현 */
  buildF1(spec,colorHex){
    const{hx,hy,hz}=spec.body,W=spec.wheels;
    const C=new THREE.Color(colorHex);
    const dark=new THREE.Color(0x14171c), carbon=new THREE.Color(0x1b1f26);
    const trim=C.clone().lerp(new THREE.Color(0xffffff),.35);
    const det=[];
    const B=(w,h,d,col,x,y,z,rx,ry,rz)=>det.push({geo:new THREE.BoxGeometry(w,h,d),color:col,x,y,z,rx,ry,rz});
    const CY=(r1,r2,len,col,x,y,z,rx,ry,rz,seg)=>det.push({
      geo:new THREE.CylinderGeometry(r1,r2,len,seg||12),color:col,x,y,z,rx,ry,rz});
    // ── 모노코크(콕핏 튜브): 앞으로 좁아지는 단면 5단
    const mono=[[-.55,.62,.30],[.10,.56,.34],[.75,.44,.30],[1.35,.30,.24],[1.85,.18,.17]];
    for(let i=0;i<mono.length-1;i++){
      const[z0,w0,h0]=mono[i],[z1,w1,h1]=mono[i+1];
      B((w0+w1),(h0+h1)*.5,(z1-z0),C,0,-hy*.1+(h0+h1)*.12,(z0+z1)*.5);}
    // ── 노즈콘(가늘고 긴 앞코) + 프론트 윙
    CY(.10,.19,1.05,C,0,-hy*.28,hz*.72,Math.PI/2,0,0,10);
    B(1.72,.05,.46,carbon,0,-hy*.62,hz*.96);                    // 메인 플레이트
    B(1.72,.05,.30,trim,0,-hy*.48,hz*.92,-.22);                 // 상단 플랩
    for(const s of[-1,1])B(.05,.34,.50,carbon,s*.84,-hy*.42,hz*.94);   // 엔드플레이트
    // ── 사이드포드 + 라디에이터 인렛
    for(const s of[-1,1]){
      B(.46,.42,1.55,C,s*.60,-hy*.06,-.10);
      B(.40,.30,.10,dark,s*.62,-hy*.02,.68);                    // 인렛
      B(.30,.16,1.20,C,s*.55,hy*.30,-.30,0,0,s*.12);            // 어깨 페어링
      B(.60,.05,1.90,carbon,s*.70,-hy*.72,-.10);}               // 플로어
    // ── 바지보드 + 플로어/디퓨저
    for(const s of[-1,1])B(.04,.26,.70,carbon,s*.58,-hy*.44,.86,0,s*.16,0);
    B(1.30,.05,2.60,carbon,0,-hy*.78,-.30);
    B(1.18,.30,.44,dark,0,-hy*.56,-hz*.86,.30);                 // 디퓨저
    // ── 콕핏 개구부 + 할로 + 헤드레스트
    B(.52,.16,.86,dark,0,hy*.30,.28);
    CY(.045,.045,1.02,carbon,0,hy*.62,.30,0,0,Math.PI/2,8);     // 할로 전방 후프
    for(const s of[-1,1])CY(.045,.045,.52,carbon,s*.44,hy*.38,.30,0,0,s*.5,8);
    CY(.05,.05,.62,carbon,0,hy*.52,.78,.75,0,0,8);              // 할로 센터 스트럿
    B(.56,.22,.30,dark,0,hy*.44,-.24);                          // 헤드레스트
    // ── 에어박스 + 엔진커버 + 샤크핀
    CY(.20,.26,.30,dark,0,hy*.78,-.42,Math.PI/2,0,0,10);
    B(.46,.52,1.30,C,0,hy*.34,-1.02);
    B(.05,.42,1.20,trim,0,hy*.70,-1.20);                        // 샤크핀
    B(.30,.26,.34,C,0,hy*.16,-hz*.80);                          // 기어박스 케이싱
    for(const s of[-1,1])CY(.06,.075,.24,0x3a3f47,s*.10,hy*.10,-hz*.94,Math.PI/2,0,0,8); // 배기
    // ── 리어 윙(2단) + 엔드플레이트 + DRS 슬롯
    B(1.16,.055,.42,carbon,0,hy*1.42,-hz*.90,-.10);
    B(1.16,.05,.26,trim,0,hy*1.14,-hz*.86,-.30);
    for(const s of[-1,1])B(.05,.62,.56,carbon,s*.58,hy*1.20,-hz*.88);
    CY(.05,.05,.60,carbon,0,hy*.86,-hz*.86,0,0,0,8);            // 윙 파일런
    // ── 리어 크래시 스트럭처 + 후방 안테나 폴(포르쉐식 리어 로드)
    CY(.075,.055,.62,carbon,0,-hy*.10,-hz-.28,Math.PI/2,0,0,10); // 후방 임팩트 구조물
    CY(.028,.020,1.05,0xd0d5dc,0,hy*.55,-hz-.16,-.16,0,0,8);     // 리어 폴(막대)
    B(.10,.10,.10,0xffd23e,0,hy*1.02,-hz-.32);                   // 폴 끝 마커
    CY(.022,.022,.46,0xd0d5dc,0,hy*1.55,-hz*.90,0,0,0,8);        // 윙 위 안테나
    // ── 서스펜션 위시본(전/후) — 실제처럼 노출
    for(const[wz,sgn]of[[W.front,1],[-W.rear,-1]])
      for(const s of[-1,1])for(const dy of[-.08,.10]){
        const len=W.track-.16;
        CY(.028,.028,len,carbon,s*(W.track*.5),W.y+dy,wz+sgn*.06,0,0,Math.PI/2,6);}
    // ── 휠 허브 커버(에어로 휠)
    for(const[wx,wz]of[[-W.track,W.front],[W.track,W.front],[-W.track,-W.rear],[W.track,-W.rear]])
      CY(W.radius*.55,W.radius*.55,.03,0x2b2f36,wx+(wx<0?-1:1)*(W.width*.5+.02),W.y,wz,0,0,Math.PI/2,14);
    const g=mergeGeoms(det);
    this.bodyMesh=new THREE.Mesh(g,MAT_CAR);
    this.bodyMesh.castShadow=true;
    this.group.add(this.bodyMesh);
    this.partHp={fb:1,rb:1,hood:1,trunk:1,dl:1,dr:1};
    this.parts={};
    // 휠(슬릭 타이어) — 다른 절차 차량과 동일한 파이프라인
    this.wheelMeshes=[];
    const wg=wheelGeo(W.radius,W.width,spec.rimScale);
    const bg=brakeGeo(W.radius,W.width);
    this._wheelGeo=wg;this.wheelOff=[false,false,false,false];
    for(let i=0;i<4;i++){
      const m=new THREE.Mesh(wg,MAT_DETAIL);
      const grp=new THREE.Group();grp.add(m);grp.add(new THREE.Mesh(bg,MAT_DETAIL));
      this.group.add(grp);this.wheelMeshes.push(grp);}
    this.lattice=new SoftLattice(spec,[this.bodyMesh]);
  }
  buildProcedural(spec,colorHex){
    if(spec.style==="f1")return this.buildF1(spec,colorHex);
    const{hx,hy,hz}=spec.body,st=carStations(spec),W=spec.wheels;
    const bodyC=new THREE.Color(colorHex);
    const shadeC=bodyC.clone().multiplyScalar(.72);
    this.bodyMesh=new THREE.Mesh(buildCarBody(spec,colorHex),MAT_CAR);
    this.bodyMesh.castShadow=true;
    this.group.add(this.bodyMesh);
    const det=[];
    const wellR=W.radius+.1;
    for(const[wx,wz]of[[-W.track,W.front],[W.track,W.front],[-W.track,-W.rear],[W.track,-W.rear]])
      det.push({geo:new THREE.CylinderGeometry(wellR,wellR,W.width+.14,10,1,true,0,Math.PI),
        color:0x0c0e12,x:wx,y:W.y+.02,z:wz,rz:Math.PI/2});
    const noseY=stationLerp(st,hz*.97,"y1"),tailY=stationLerp(st,-hz*.97,"y1");
    det.push({geo:new THREE.BoxGeometry(hx*.9,hy*.18,.05),color:0x10141a,x:0,y:noseY*.65-hy*.18,z:hz-.02});
    det.push({geo:new THREE.BoxGeometry(.34,.12,.03),color:0xe8ecf2,x:0,y:-hy*.5,z:hz+.09});
    det.push({geo:new THREE.BoxGeometry(.34,.12,.03),color:0xe8ecf2,x:0,y:-hy*.5,z:-hz-.09});
    for(const ex of spec.style==="super"?[-.3,-.1,.1,.3]:[-.25,.25])
      det.push({geo:new THREE.CylinderGeometry(.045,.045,.14,7),color:0x2e343c,
        x:ex*hx,y:-hy*.72,z:-hz-.04,rx:Math.PI/2});
    const beltY=stationLerp(st,0,"y1");
    for(const s2 of[-1,1])det.push({geo:new THREE.BoxGeometry(.03,.03,.16),color:0x1c2026,
      x:s2*hx*1.0,y:beltY-.05,z:hz*.06});
    this.detailMesh=new THREE.Mesh(mergeGeoms(det),MAT_DETAIL);
    this.detailMesh.castShadow=true;
    this.group.add(this.detailMesh);
    const li=[];
    const hlY=spec.style==="super"?-hy*.45:noseY*.4;
    for(const s2 of[-1,1]){
      li.push({geo:new THREE.BoxGeometry(hx*.44,.1,.05),color:0xfff6d8,x:s2*hx*.56,y:hlY,z:hz+.01});
      li.push({geo:new THREE.BoxGeometry(hx*.4,.09,.05),color:0xff2a2a,x:s2*hx*.56,y:tailY*.5,z:-hz-.01});}
    this.lightsMesh=new THREE.Mesh(mergeGeoms(li),new THREE.MeshBasicMaterial({vertexColors:true}));
    this.group.add(this.lightsMesh);
    const partMat=new THREE.MeshPhongMaterial({color:bodyC.clone().multiplyScalar(.92),flatShading:true,shininess:55});
    const bumpMat=new THREE.MeshPhongMaterial({color:0x191d24,flatShading:true,shininess:18});
    const mirrMat=new THREE.MeshPhongMaterial({color:bodyC.clone().multiplyScalar(.8),flatShading:true,shininess:55});
    const hoodY=stationLerp(st,hz*.5,"y2");
    this.parts={
      fb:this.mkPart(hx*1.78,hy*.3,.18,0,-hy*.6,hz+.05,bumpMat),
      rb:this.mkPart(hx*1.78,hy*.3,.18,0,-hy*.6,-hz-.05,bumpMat),
      dl:this.mkPart(.05,hy*.66,hz*.56,-hx-.02,-hy*.2,hz*.04,partMat),
      dr:this.mkPart(.05,hy*.66,hz*.56,hx+.02,-hy*.2,hz*.04,partMat),
      ml:this.mkPart(.07,.09,.2,-hx-.1,stationLerp(st,hz*.12,"y1")+.14,hz*.14,mirrMat),
      mr:this.mkPart(.07,.09,.2,hx+.1,stationLerp(st,hz*.12,"y1")+.14,hz*.14,mirrMat),
      hood:this.mkPart(hx*1.5,.05,hz*.42,0,hoodY+.02,hz*.6,partMat),
      trunk:this.mkPart(hx*1.35,hy*.55,.05,0,stationLerp(st,-hz*.99,"y1")+hy*.28,-hz-.02,partMat)};
    this.partHp={fb:1,rb:1,hood:1,trunk:1,dl:1,dr:1,ml:.35,mr:.35};
    this.wheelMeshes=[];
    const wg=wheelGeo(W.radius,W.width,spec.rimScale);
    const bg=brakeGeo(W.radius,W.width);
    this._wheelGeo=wg;this.wheelOff=[false,false,false,false];
    for(let i=0;i<4;i++){
      const m=new THREE.Mesh(wg,MAT_DETAIL);
      const grp=new THREE.Group();grp.add(m);grp.add(new THREE.Mesh(bg,MAT_DETAIL));
      this.group.add(grp);this.wheelMeshes.push(grp);}
    this.lattice=new SoftLattice(spec,[this.bodyMesh,this.detailMesh]);
  }
  applyImpact(imp,veh){
    const dv=imp.dv;
    // 밑면 스침(방지턱 등): 약한 함몰만, 부품 손상/탈락 없음
    if(imp.soft){this.lattice.impact(imp.lp,imp.ln,dv);return;}
    // 슬라임식 대형 크럼플: 부품 변형 깊이·반경·탈락 확대
    const d=Math.min(.72,.026*dv),R=.72+.032*dv;
    // 차체: 노드-빔 소프트바디에 충격 주입 (소성 변형은 격자가 계산)
    this.lattice.impact(imp.lp,imp.ln,dv);
    /* 부품 손상은 '실제 타격 지점과의 거리'로 가중한다 — 정통으로 맞은 부품이 확실히
       뜯겨 나가고, 스친 부품은 휘기만 한다(예전엔 반경 안 모든 부품이 동일 피해). */
    const REACH=R+.5;
    for(const k in this.parts){
      const p=this.parts[k];
      if(this.detached[k])continue;
      deformGeo(p,imp.lp,imp.ln,d,R,.62);
      _vA.copy(imp.lp).sub(p.position);
      const dist=_vA.length();
      if(dist>=REACH)continue;
      const prox=1-dist/REACH;                       // 0(가장자리) ~ 1(정통)
      const kMul=(k==="fb"||k==="rb")?1.6:(k==="ml"||k==="mr")?3:1;
      this.partHp[k]-=dv*.042*kMul*(.3+1.9*prox*prox);
      // 살아남은 부품은 충격 방향으로 '휘어짐'(영구 회전·이동) — 판금이 접힌 느낌
      if(this.partHp[k]>0){
        const bend=Math.min(.42,dv*.013*prox);
        p.rotation.x+=imp.ln.z*bend*.5;
        p.rotation.z-=imp.ln.x*bend*.5;
        p.position.x+=imp.ln.x*bend*.16;
        p.position.y+=imp.ln.y*bend*.10;
        p.position.z+=imp.ln.z*bend*.16;}
      // 정통으로 세게 맞으면 즉시 탈락(경첩 파단)
      else if(veh.damageOn)this.detachPart(k,veh,imp);
      if(this.partHp[k]>0&&veh.damageOn&&prox>.72&&dv>16)this.detachPart(k,veh,imp);}
    // 바퀴: 충격과 함께 뒤로 밀려나고(휠 셋백), 아주 강한 충격이면 탈락
    if(dv>7&&veh.damageOn&&this.wheelOff){
      const W=this.spec.wheels,tv=(this.baked&&W.trackVis)?W.trackVis:W.track;
      const wpos=[[-tv,W.front],[tv,W.front],[-tv,-W.rear],[tv,-W.rear]];
      for(let i=0;i<4;i++){
        if(this.wheelOff[i])continue;
        const d=Math.hypot(imp.lp.x-wpos[i][0],imp.lp.z-wpos[i][1]);
        if(d>=1.45)continue;
        const w=veh.wheels[i];
        if(!w.local0)w.local0=w.local.clone();
        // 충격 방향으로 서스펜션 마운트가 밀림(휠베이스 축소·측면은 트랙 함몰) — 물리·비주얼 모두 반영
        const push=Math.sqrt(1-d/1.45)*Math.min(.55,dv*.02);
        w.local.x=clamp(w.local.x+imp.ln.x*push*.95,w.local0.x-.42,w.local0.x+.42);
        w.local.z=clamp(w.local.z+imp.ln.z*push,w.local0.z-.6,w.local0.z+.6);
        // 서스펜션 기능 손상: 바퀴 강타 시 감쇠·강성 저하(주행에 실제 영향)
        if(dv>10)veh.suspMul=Math.max(.55,(veh.suspMul||1)-dv*.004);
        // 셋백이 한계에 달한 상태에서 또 강타 → 탈락(측면 밀림 포함)
        const sb=Math.abs(w.local.z-w.local0.z)+Math.abs(w.local.x-w.local0.x);
        if(dv>17&&d<1.05+dv*.004&&sb>.22)this.detachWheel(i,veh,imp);}}
    // 부품 파편 스프레이: 강한 충격 시 잔해가 튀어나감(도장색+검정 혼합)
    if(dv>9&&veh.damageOn)this.sprayChunks(imp,veh,Math.min(11,(3+dv*.14)|0));
    // 유리 파손: 강충격 시 금 간 우윳빛 유리
    if(dv>13&&veh.damageOn&&this.glassMesh&&!this._glassCracked){
      this._glassCracked=true;
      const gm=this.glassMesh.material=this.glassMesh.material.clone();
      gm.color=new THREE.Color(.82,.86,.9);gm.shininess=25;gm.specular=new THREE.Color(.3,.3,.32);
      gm.transparent=true;gm.opacity=.92;
      if(veh===Game.veh&&typeof toast==="function")toast("🪟 유리 파손!");}
  }
  sprayChunks(imp,veh,count){
    if(!CarVisual._chunkGeo)CarVisual._chunkGeo=new THREE.BoxGeometry(.15,.05,.2);
    if(!CarVisual._chunkGeoS)CarVisual._chunkGeoS=new THREE.BoxGeometry(.08,.03,.1);
    if(!this._paintMat)this._paintMat=new THREE.MeshPhongMaterial({color:this.colorHex||0x999999,shininess:80});
    for(let c=0;c<count;c++){
      const m=new THREE.Mesh(c%2?CarVisual._chunkGeoS:CarVisual._chunkGeo,
        c%3===0?MAT_DETAIL:this._paintMat);   // 도장 파편 + 검정 부품 혼합
      m.position.copy(imp.wp);
      m.position.x+=(Math.random()-.5)*.6;m.position.y+=Math.random()*.5;m.position.z+=(Math.random()-.5)*.6;
      m.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);
      Fx.addDebris(m,veh,imp);}
  }
  detachWheel(i,veh,imp){
    if(this.wheelOff[i])return;
    this.wheelOff[i]=true;
    if(typeof toast==="function"&&veh===Game.veh)toast("💥 바퀴 탈락!");
    const src=this.wheelMeshes[i];src.visible=false;
    const dm=new THREE.Mesh(this._wheelGeo,MAT_DETAIL.clone());
    src.updateWorldMatrix(true,false);
    dm.position.setFromMatrixPosition(src.matrixWorld);
    dm.quaternion.setFromRotationMatrix(src.matrixWorld);
    dm.updateMatrixWorld(true);
    Fx.addDebris(dm,veh,imp);
    if(veh.loseWheel)veh.loseWheel(i);   // 물리: 해당 바퀴 접지력 상실(있으면)
  }
  updateDeforms(dt){ // 소프트바디 격자 스텝 (충격 후 ~1초간 활성)
    if(this.lattice.update(dt))this.defVol=this.lattice.totalDisp()*1.3;
  }
  detachPart(k,veh,imp){
    if(this.detached[k])return;
    const p=this.parts[k];this.detached[k]=p;
    Fx.addDebris(p,veh,imp);
    const nm={fb:"앞 범퍼",rb:"뒤 범퍼",hood:"본닛",trunk:"트렁크",dl:"좌측 도어",dr:"우측 도어",ml:"좌측 미러",mr:"우측 미러"}[k];
    if(nm&&typeof toast==="function"&&veh===Game.veh)toast("🔩 "+nm+" 탈락!");
  }
  repair(){
    this.lattice.reset();
    this.defVol=0;
    if(this.wheelOff)for(let i=0;i<4;i++){    // 탈락 바퀴 복원
      if(this.wheelOff[i]){this.wheelOff[i]=false;this.wheelMeshes[i].visible=true;}}
    if(this._glassCracked){this._glassCracked=false;this.glassMesh.material=glassMatFor(this.spec);}   // 유리 교체
    for(const k in this.parts){
      const p=this.parts[k];restoreGeo(p);this.partHp[k]=this.hp0[k];
      if(this.detached[k]){Fx.reclaimDebris(p);this.group.add(p);
        p.material.opacity=1;p.material.transparent=false;
        p.position.copy(p.userData.home);p.quaternion.identity();
        delete this.detached[k];}}
  }
  storeHomes(){for(const k in this.parts)this.parts[k].userData.home=this.parts[k].position.clone();}
  sync(veh,shakeT){
    // 렌더는 보간된 포즈를 쓴다(고정 스텝 물리 ↔ 가변 프레임 렌더 사이를 매끄럽게)
    this.group.position.copy(veh.body.rPos);
    this.group.quaternion.copy(veh.body.rQuat);
    if(shakeT>0&&Settings.camShake){
      this.group.position.x+=(Math.random()-.5)*.02;this.group.position.y+=(Math.random()-.5)*.02;}
    // 전조등 점등: 플레이어 차량만(광원 수 제한) — 밤에는 더 밝게. SpotLight는 최초 1회 지연 생성.
    if(this.hlAnchor){
      const on=typeof Game!=="undefined"&&Game.veh===veh;
      if(on&&!this.hl){                                    // 플레이어가 됐을 때 최초 생성
        this.hl=this.hlAnchor.map(([x,y,zl])=>{
          const s=new THREE.SpotLight(0xfff0cc,0,30,.52,.42,1.2);
          s.position.set(x,y,zl);s.target.position.set(x*.5,y-.4,zl+16);
          this.group.add(s);this.group.add(s.target);
          const g=new THREE.Mesh(new THREE.SphereGeometry(.075,8,6),
            new THREE.MeshBasicMaterial({color:0xfff6d8,transparent:true,opacity:.85,
              blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));
          g.scale.z=.4;g.position.set(x,y,zl+.05);g.visible=false;this.group.add(g);
          return{s,g};});}
      if(this.hl){
        const inten=on?(Game.opts&&Game.opts.tod==="night"?4.6:1.9):0;
        if(this._hlI!==inten){this._hlI=inten;
          for(const h of this.hl){h.s.intensity=inten;h.g.visible=on&&inten>0;}}}}
    const tv=this.baked?this.spec.wheels.trackVis:0;
    for(let i=0;i<4;i++){
      if(this.wheelOff&&this.wheelOff[i])continue;   // 탈락한 바퀴는 재배치 안 함
      const w=veh.wheels[i],m=this.wheelMeshes[i];
      const vy=(w.rVisY===undefined?w.visY:w.rVisY);
      m.position.set(this.baked?(w.left?-tv:tv):w.local.x,vy+(this.wheelYOff||0),w.local.z);
      const st=(w.front?veh.steer:0)+(w.left?-veh.toe:veh.toe)*8;
      m.rotation.set(0,st,0);
      m.children[0].rotation.x=(w.rSpin===undefined?w.spin:w.rSpin);}
  }
  dispose(){
    this.group.parent&&this.group.parent.remove(this.group);
    this.bodyMesh.geometry.dispose();
    if(this.glassMesh)this.glassMesh.geometry.dispose();
    if(this.lampsMesh)this.lampsMesh.geometry.dispose();
    if(this.detailMesh)this.detailMesh.geometry.dispose();
    if(this.lightsMesh)this.lightsMesh.geometry.dispose();
    for(const k in this.parts)this.parts[k].geometry.dispose();
  }
}
