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
  smoothShade:true,gloss:true,    // 초광택 클리어코트(환경 반사 강화) — 원본 도장 광택 재현
  /* 차고 — 계측: 차체 0.695m(포르쉐 0.557)로 14cm 높고, 그 때문에 타이어가 아치에
     1.6cm 모자라게 들어가 프레임과 안 맞아 보였다(포르쉐는 -8.8cm로 아치에 묻힌다).
     10cm 낮추면 아치여유가 포르쉐와 거의 같아진다. */
  groundClear:.13,wheelVisFit:1,rideFix:true,rideLift:-.10,fitBumper:true,
  /* 원본 휠을 쓰기 전에는 절차 휠이 아치보다 작아 보여 시각 배율 1.13을 넣었는데,
     이제 휠 지오메트리 반경(0.371)이 접지 반경과 정확히 같다. 배율을 남겨 두면
     보이는 타이어만 0.419가 돼 '휠과 타이어가 안 맞는' 상태가 된다 → 1로 되돌린다. */
  wheelVisScale:1,
  lampInset:.105,                 // 램프를 프레임 더 깊숙이(앞·뒤 모두) — 안에서 밖으로 비춘다
  wheelTuck:.018,                 // 실측 휠 폭(0.298)에 맞춰 인셋 축소
  chromeKit:{grilleW:.34,grilleH:.26,grilleY:.74,grilleZ:.20,slats:13,
             rocker:false,        // 사이드실 몰딩 제거(옆면을 가로지르는 줄로 보였다)
             ornament:true,ornY:.30,ornZ:.46,exhaust:2,rearY:.80},
  body:{hx:1.02,hy:.76,hz:2.775},
  wheels:{track:.9,front:1.6,rear:1.6,y:-.5,radius:.376,width:.28},
  /* 🛋️ 롤스로이스 승차감 패키지 — 무른 1차 스프링 + 프로그레시브 레이트 +
     스카이훅 + 비대칭 리바운드 + 노면 예측 + 자세 안정. 실차의 플래너/매직카펫 계열. */
  /* 포르쉐 직전 세팅(사용자 평: 그쪽이 더 부드럽고 흡수가 좋다)의 비율을 그대로 옮기고
     무게 2,490kg·긴 휠베이스에 맞춰 스트로크·스카이훅만 키웠다. */
  susp:{k:36000,c:6600,travel:.46,rest:.28,
        prog:1.7,        // 프로그레시브 레이트(바닥칠 직전만 단단)
        sky:26000,       // 스카이훅(차체 상하 요동 직접 감쇠)
        compMul:.18,     // 압축(흡수)은 부드럽게 — 충격이 차체로 안 올라간다
        rebMul:4.2,      // 신장은 조여 방지턱 후 차체·뒷축이 솟지 않게
        riseMul:3.4,     // 차체 상승 시 헤이브 댐퍼 강화
        fCap:.46,        // 블로우오프 — 서스가 차체를 밀어올릴 힘 상한(중력 배수)
        heave:30000,     // 상승 억제
        preview:.44,     // 노면 예측 — 턱을 미리 읽고 스트로크를 준비
        pvGain:11,
        attq:13},        // 피치·롤 각속도 감쇠
  arb:20000,
  engine:{maxT:850,redline:5600,idle:600},
  gears:[4.7,3.14,2.11,1.67,1.29,1.0,.84,.67],final:3.15,
  brakeF:19500,steerLo:.5,steerHi:.11,aero:{cd:1.15,df:16},gripF:1.06,gripR:1.06,
  colors:[0x0b0b0d,0xe8eef2,0x1c2a4a,0x6b1f28,0x2f3a34],
  stats:{spd:62,acc:74,grip:70,mass:88}},
 {id:"maybach",name:"메르세데스-마이바흐 GLS",icon:"🚘",drive:"4WD",mass:2560,hp:621,acc:"4.9초",top:240,
  desc:"실측 스캔 3D 모델(GLS 580). V8 4.0 트윈터보 · 롱휠베이스 · 최상급 럭셔리 SUV.",
  model:"maybach",style:"suv",rollFix:1.2,squashY:1,comFromWheels:true,realWheels:true,smoothShade:true,wheelVisFit:1.02,
  wheelStyle:"multi",          // GLS 순정 멀티스포크 알로이(밝은 폴리시드)
  /* 휠 치수 정합 — 계측: 아치 최고점이 타이어 위보다 12.7cm 높고(휠이 아치에 비해 너무 작다)
     휠 바깥면이 차체 최외곽보다 5.8cm 안으로 들어가 있었다. GLS 580 은 23인치(직경 0.8m)다.
     반경 0.269 → 0.40, 트랙 4.8cm 바깥으로. (기준: 포르쉐는 아치여유 -8.8cm·돌출 +4.5cm) */
  wheelRadMul:1.55, wheelOutset:.062,
  interior:true,               // 바닥·방화벽·프레임레일·시트·연료탱크 + 밀려드는 엔진 블록
  /* 마이바흐는 v6.0 그대로 둔다 — 크롬 킷·헤드램프 어셈블리·범퍼 피팅 등
     덧붙이던 장식은 전부 제거(요청: 6.0 버전대로). */
  body:{hx:1.0,hy:.82,hz:2.55},wheels:{track:.9,front:1.5,rear:1.55,y:-.34,radius:.36,width:.3},
  /* 서스펜션도 v6.0 거동으로 — 이후 전 차량에 들어간 비대칭 댐핑/차체 헤이브 댐퍼를
     이 차만 무효화한다(compMul 1 = 압축 감쇠 원래대로, riseMul 1·bodyDamp 0 = 헤이브 댐퍼 없음).
     rebMul은 지정하지 않아 v6.0과 같은 기본값 1.5가 쓰인다. */
  /* 롤스로이스·포르쉐와 같은 계열(부드러운 압축 + 조인 신장 + 예측·자세 안정)로 통일.
     v6.0 의 '보정 무효화'(compMul 1 / riseMul 1 / bodyDamp 0)는 해제한다. */
  susp:{k:60000,c:6200,travel:.30,rest:.28,
        prog:1.7,sky:24000,
        compMul:.20,rebMul:4.0,riseMul:3.2,
        fCap:.50,heave:28000,
        preview:.42,pvGain:10,attq:12},
  arb:16000,
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
  /* 포르쉐 — 스프링은 딱딱하게(노면 그대로), 대신 위로 흡수는 넉넉하게.
     계측(12cm 턱 40km/h): 트래블이 0.047m뿐이라 바퀴가 위로 못 움직여
     차 전체가 튀어올랐다(차체상승 12.3cm·피치 5.67°·공중 76프레임).
     스프링 강성은 그대로 두고 상방 스트로크와 압축 감쇠만 손본다. */
  /* 요청: 좀만 더 짧고 단단하게. 스트로크를 줄이고 스프링·압축 감쇠를 올린다. */
  susp:{k:118000,c:7900,travel:.235,rest:.2,
        prog:2.0,        // 프로그레시브 — 끝단이 급격히 단단(짧은 스트로크 보호)
        compMul:.26,     // 압축 감쇠 ↑ = 더 단단한 감각
        rebMul:4.0,
        sky:24000,heave:28000,
        fCap:.52,
        preview:.36,pvGain:9,attq:14},
  arb:60000,
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
  envMap:ENV_CAR,combine:1/*Mix*/,reflectivity:.09}); // 클리어코트 광택·양면(베이크 차량 투명 방지)
const MAT_CAR_SMOOTH=new THREE.MeshPhongMaterial({vertexColors:true,flatShading:false,shininess:210,specular:0xc2cdd8,side:THREE.DoubleSide,
  envMap:ENV_CAR,combine:1/*Mix*/,reflectivity:.13}); // 유광 클리어코트+환경반사 — 매끈하게 이어진 표면(포르쉐·GLS), 크롬부는 밝아서 더 강하게 비침
/* 크롬 — 거울에 가까운 금속(그릴·오너먼트·윈도 몰딩). 정점색 없이 단색 + 강한 환경반사 */
const MAT_CHROME=new THREE.MeshPhongMaterial({color:0xeef3f9,shininess:520,specular:0xffffff,
  envMap:ENV_CAR,combine:1/*Mix — 환경색이 베이스를 물들이지 않게*/,reflectivity:.72,flatShading:false});
/* 다크 크롬(그릴 안쪽·인테이크·램프 하우징·배기 팁).
   reflectivity를 높게 두면 Mix 합성이 환경(밝은 하늘)색으로 덮어써서 '검은 부품'이
   흰 원판처럼 보인다(배기 팁이 흰 공으로 보이던 원인) → 반사는 낮게, 하이라이트만. */
const MAT_CHROME_DARK=new THREE.MeshPhongMaterial({color:0x2d3238,shininess:420,specular:0x8f9aa8,
  envMap:ENV_CAR,combine:1,reflectivity:.16,flatShading:false});
/* 초광택 클리어코트 — 롤스로이스급 도장(반짝임·환경반사 강화) */
/* 반짝임은 specular/shininess가 만든다. reflectivity를 너무 올리면 환경색이 디퓨즈를
   덮어 검정 도장이 흰색처럼 떠 버리므로, 하이라이트는 강하게 두고 반사는 절제한다.
   측정값(쇼룸 검정 도장 도어 픽셀 / 하이라이트 피크):
     refl .26 spec f0f6ff → 133 / 255(포화·은색처럼 보임)
     refl .07 spec 4a5460 →  62 / 252(검정으로 읽히고 하이라이트는 그대로) ← 채택 */
const MAT_CAR_GLOSS=new THREE.MeshPhongMaterial({vertexColors:true,flatShading:false,shininess:420,
  specular:0x4a5460,side:THREE.DoubleSide,envMap:ENV_CAR,combine:1/*Mix*/,reflectivity:.07});
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
/* 원본 스캔 휠용 — 림이 매끈해야 하므로 평면음영을 끄고 금속 광택을 준다 */
/* 스페큘러를 넓고 밝게 주면 림 페이스처럼 큰 평면이 통째로 하얗게 탄다 —
   좁고(높은 shininess) 어두운 하이라이트로 금속감만 남긴다. */
const MAT_WHEEL_REAL=new THREE.MeshPhongMaterial({vertexColors:true,flatShading:false,
  shininess:280,specular:0x2e343d,side:THREE.DoubleSide});
/* 타이어는 무광 고무 — 림과 같은 스페큘러를 주면 검은 고무가 하얗게 타 버린다 */
const MAT_TIRE_REAL=new THREE.MeshPhongMaterial({vertexColors:true,flatShading:false,
  shininess:6,specular:0x101216,side:THREE.DoubleSide});
/* 모델에 실제 휠 지오메트리가 구워져 있으면(entry.wheel.v>0) 그것을 쓴다.
   좌우는 거울상이어야 타이어 바깥면·스포크 오목면이 제대로 바깥을 본다. */
const _realWheelCache={};
function realWheelGeo(e,scale,mirror){
  /* 구형 베이크에는 wheel.v 만 있고 실제 정점 데이터(p)는 없다 — 그때는 절차 휠을 쓴다 */
  if(!e||!e.wheel||!e.wheel.v||!e.wheel.p)return null;
  const k=(e.wheel.p.length)+"@"+scale.toFixed(4)+(mirror?"M":"");
  if(_realWheelCache[k])return _realWheelCache[k];
  const g=Assets.geo(e.wheel,{scale});
  if(mirror){
    const p=g.attributes.position.array,nr=g.attributes.normal.array;
    for(let i=0;i<p.length;i+=3){p[i]=-p[i];nr[i]=-nr[i];}
    const ix=g.index;                       // x 반전 → 삼각형 감김이 뒤집히므로 되돌린다
    if(ix){const a=ix.array;for(let i=0;i<a.length;i+=3){const t=a[i+1];a[i+1]=a[i+2];a[i+2]=t;}}}
  /* 인덱스 배치 = [타이어][림][캘리퍼].
     캘리퍼는 브레이크라 휠과 같이 돌면 안 되므로 회전 메시에서 잘라낸다. */
  const tot=g.index?g.index.count:0;
  const ti=Math.min(e.wheel.tire|0,tot);
  const cal=e.wheel.cal===undefined?tot:Math.min(e.wheel.cal,tot);
  if(g.index)g.setIndex(new THREE.BufferAttribute(g.index.array.slice(0,cal),1));
  g.clearGroups();
  if(ti>0&&ti<cal){g.addGroup(0,ti,0);g.addGroup(ti,cal-ti,1);}
  g.computeBoundingSphere();
  return _realWheelCache[k]=g;}
/* 회전하지 않는 브레이크(캘리퍼·디스크) — 원본 휠 인덱스의 캘리퍼 구간만 뽑는다 */
const _realCalCache={};
function realCaliperGeo(e,scale,mirror){
  if(!e||!e.wheel||!e.wheel.p||e.wheel.cal===undefined)return null;
  const k=(e.wheel.p.length)+"@"+scale.toFixed(4)+(mirror?"M":"");
  if(_realCalCache[k]!==undefined)return _realCalCache[k];
  const full=Assets.geo(e.wheel,{scale});
  const idx=full.index;
  if(!idx||e.wheel.cal>=idx.count){full.dispose();return _realCalCache[k]=null;}
  const p=full.attributes.position.array,nr=full.attributes.normal.array;
  const ia=Array.from(idx.array.slice(e.wheel.cal));
  if(mirror){
    for(let i=0;i<p.length;i+=3){p[i]=-p[i];nr[i]=-nr[i];}
    for(let i=0;i<ia.length;i+=3){const t=ia[i+1];ia[i+1]=ia[i+2];ia[i+2]=t;}}
  full.setIndex(new THREE.BufferAttribute(new Uint32Array(ia),1));
  full.clearGroups();full.computeBoundingSphere();
  return _realCalCache[k]=full;}
let _wheelGeoCache={};
/* style="multi": 밝은 폴리시드 멀티스포크(마이바흐 GLS 순정 23인치 계열).
   원본 GLS 메시의 휠은 휠당 600삼각형 남짓에 림·타이어가 같은 재질(Color_M02)이라
   그대로 옮기면 시커먼 원반이 된다 — 그래서 같은 디자인을 절차로 다시 만든다. */
function wheelGeo(r,wd,rimS,style){ // 실감형: 타이어(고무)+알로이 림+스포크+센터캡 (회전부). rimS=대구경 휠 배율
  rimS=Math.min(rimS||1,1.28);
  const k=(r*100|0)+"_"+(wd*100|0)+"_"+(rimS*100|0)+"_"+(style||"");
  if(!_wheelGeoCache[k]){
    const multi=style==="multi";
    const rim=r*(multi?.70:.62)*rimS;           // 림 페이스 반경(대구경일수록 사이드월 얇게)
    const tw=Math.min(Math.max(wd*.55,r*.19),(r-rim)*1.15+.02);
    /* 타이어 토러스는 '튜브 반경' 하나로 폭과 사이드월 두께를 동시에 정한다.
       두꺼운 타이어를 만들려고 tw 를 키우면 사이드월이 휠 페이스를 통째로 덮어
       림·스포크가 하나도 안 보이는 '민무늬 원반'이 된다.
       multi 는 단면을 얇게 잡고 축방향(로컬 z)만 늘려 폭을 되찾는다. */
    const ttR=multi?Math.max((r-rim)*.52,r*.06):tw;
    const items=[
      // 타이어: 토러스(림이 보이는 실제 단면)
      {geo:new THREE.TorusGeometry(r-ttR,ttR,10,multi?30:28),color:0x0c0d0f,ry:Math.PI/2,
       sx:1,sy:1,sz:multi?Math.max(1,(wd*.52)/ttR):1},
      // 림 배럴 (딥 건메탈)
      {geo:new THREE.CylinderGeometry(rim*1.03,rim*1.03,wd*.66,20),color:multi?0x23272d:0x17191d,rz:Math.PI/2},
      /* 림 디쉬. multi 는 얇게 만들어 안쪽으로 물린다 —
         두꺼운 원반이면 스포크가 그 속에 파묻혀 휠이 '민무늬 접시'로 보인다. */
      {geo:new THREE.CylinderGeometry(multi?rim*.94:rim,multi?rim*.94:rim,multi?wd*.26:wd*.68,multi?26:20),
       color:multi?0x0c0e11:0x2c3138,rz:Math.PI/2},
      // 폴리시드 림 립(밝은 링)
      {geo:new THREE.TorusGeometry(rim,r*.03,6,26),color:multi?0xdfe5ec:0xc7ced6,ry:Math.PI/2},
      // 센터 캡 + 허브 링
      {geo:new THREE.CylinderGeometry(r*.12,r*.12,wd*.74,12),color:0xd8dde3,rz:Math.PI/2},
      {geo:new THREE.TorusGeometry(r*.2,r*.02,5,16),color:multi?0xb6bec8:0x8f979f,ry:Math.PI/2},
      // 브레이크 디스크(회전부 — 휠과 함께 돈다)
      {geo:new THREE.CylinderGeometry(r*(multi?.34:.46),r*(multi?.34:.46),wd*.3,16),color:0x484d54,rz:Math.PI/2}];
    if(multi){
      /* 22개 얇은 폴리시드 스포크 — 디쉬(wd*.26)보다 넓게 만들어 양면 모두에서 도드라진다.
         (휠 지오메트리는 좌우 공용이라 한쪽 면에만 붙이면 반대편이 민무늬가 된다) */
      for(let sp=0;sp<22;sp++)
        items.push({geo:new THREE.BoxGeometry(wd*.72,rim*1.76,r*.028),
          color:sp%2?0xcdd5de:0xe8edf3,rx:sp*Math.PI/11});
      items.push({geo:new THREE.TorusGeometry(rim*.36,r*.030,6,22),color:0xb8c1cb,ry:Math.PI/2});
    }else{
      // 트윈 5-스포크(10개, 폴리시드 페이스 + 얇은 단면)
      for(let sp=0;sp<10;sp++){
        const a=sp*Math.PI/5+(sp%2?.11:-.11);
        items.push({geo:new THREE.BoxGeometry(wd*.62,rim*1.87,r*.055),color:sp%2?0xb9c2cc:0xd4dae0,rx:a});}}
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
  /* 차체 실루엣 반폭 측정 — (y,z) 근방 실제 차체의 최대 |x|.
     크롬 몰딩·램프 하우징·미러 같은 '얹는 부품'을 차체 밖으로 튀어나오지 않게
     붙이는 기준. 세단은 휠아치가 가장 넓어서 차체 최대폭(xR)을 그대로 쓰면
     좁은 사이드실·코·램프 높이에서 막대기가 공중에 뜬 것처럼 보인다. */
  /* 실루엣 격자 — (y,z) 칸마다 최대 |x| 를 한 번의 패스로 구워 둔다.
     예전에는 질의마다 차체 정점을 전부 훑었는데, tintWindowTrim 이 정점마다 이걸
     부르는 바람에 O(n²)가 됐다. 롤스로이스(17만 정점)에서 CarVisual 하나에 21.6초.
     격자를 쓰면 굽는 데 한 번 O(n), 질의는 O(1)이고 결과는 사실상 같다. */
  _silGrid(){
    if(this._sg)return this._sg;
    const a=this.bodyMesh.geometry.attributes.position.array;
    const CY=.020,CZ=.025;                     // 칸 크기(질의 허용치보다 촘촘하게)
    let y0=1e9,y1=-1e9,z0=1e9,z1=-1e9;
    for(let i=0;i<a.length;i+=3){
      const y=a[i+1],z=a[i+2];
      if(y<y0)y0=y;if(y>y1)y1=y;if(z<z0)z0=z;if(z>z1)z1=z;}
    const NY=Math.max(1,Math.ceil((y1-y0)/CY)+1),NZ=Math.max(1,Math.ceil((z1-z0)/CZ)+1);
    const mx=new Float32Array(NY*NZ);          // 최대 |x|
    for(let i=0;i<a.length;i+=3){
      const x=Math.abs(a[i]),yi=((a[i+1]-y0)/CY)|0,zi=((a[i+2]-z0)/CZ)|0;
      const k=yi*NZ+zi;
      if(x>mx[k])mx[k]=x;}
    return this._sg={mx,y0,z0,CY,CZ,NY,NZ};}
  bodySilWidth(y,z,tolY,tolZ){
    const g=this._silGrid();
    const yA=Math.max(0,Math.floor((y-tolY-g.y0)/g.CY)),yB=Math.min(g.NY-1,Math.floor((y+tolY-g.y0)/g.CY));
    const zA=Math.max(0,Math.floor((z-tolZ-g.z0)/g.CZ)),zB=Math.min(g.NZ-1,Math.floor((z+tolZ-g.z0)/g.CZ));
    let m=0;
    for(let yi=yA;yi<=yB;yi++){const row=yi*g.NZ;
      for(let zi=zA;zi<=zB;zi++){const q=g.mx[row+zi];if(q>m)m=q;}}
    return m;}
  /* (x,y) 근방 차체 앞면의 최전방 z — 앞면 장식이 코 안쪽에 파묻히거나
     밖으로 튀어나오지 않게 붙일 기준면 */
  bodyNoseZ(x,y,tolX,tolY){
    const a=this.bodyMesh.geometry.attributes.position.array;
    let mz=-1e9;
    for(let i=0;i<a.length;i+=3)
      if(Math.abs(a[i]-x)<tolX&&Math.abs(a[i+1]-y)<tolY&&a[i+2]>mz)mz=a[i+2];
    return mz>-1e8?mz:0;}
  /* (x,y) 근방 차체 뒷면의 최후방 z — 리어 장식을 뒷면에 딱 붙이는 기준.
     테일램프 앵커의 z를 그대로 쓰면 장식이 트렁크 안에 묻힌다(계측 확인). */
  bodyTailZ(x,y,tolX,tolY){
    const a=this.bodyMesh.geometry.attributes.position.array;
    let mz=1e9;
    for(let i=0;i<a.length;i+=3)
      if(Math.abs(a[i]-x)<tolX&&Math.abs(a[i+1]-y)<tolY&&a[i+2]<mz)mz=a[i+2];
    return mz<1e8?mz:0;}
  /* z 구간 전체에서 '가장 좁은' 반폭 — 길쭉한 몰딩(로커)이 양 끝에서 튀지 않게 한다 */
  bodySilMin(y,z0,z1,tolY,slices){
    let mn=1e9;
    for(let i=0;i<slices;i++){
      const z=z0+(z1-z0)*(i+.5)/slices;
      const w=this.bodySilWidth(y,z,tolY,Math.abs(z1-z0)/slices*.75);
      if(w>0&&w<mn)mn=w;}
    return mn<1e9?mn:0;}

  /* ===== 외부(베이크) 모델 차량 ===== */
  buildBaked(spec,colorHex){
    const e=this.baked,{hx,hy,hz}=spec.body;
    const split=Assets.geoSplit(e,{scale:spec.modelScale,sy:spec.squashY||1,
      cx:spec.modelCx,cy:spec.modelCy,cz:spec.modelCz,paint:new THREE.Color(colorHex)});
    this.bodyMesh=new THREE.Mesh(split.main,spec.gloss?MAT_CAR_GLOSS:(spec.smoothShade?MAT_CAR_SMOOTH:MAT_CAR));
    this.bodyMesh.castShadow=true;this.group.add(this.bodyMesh);
    /* ── 램프를 차체 프레임 안쪽으로 ──
       하우징·LED·립을 덧대는 대신, 원본 모델의 램프 렌즈면 자체를 개구부 안쪽으로
       후퇴시킨다. 그러면 차체 개구부 테두리가 렌즈보다 앞에 남아 램프가 프레임 속에
       박혀 보이고, 밖으로 튀어나온 조각이 하나도 없다. */
    if(spec.lampInset&&split.lamps){
      const pa=split.lamps.attributes.position.array;
      let zx=-1e9,zn=1e9;
      for(let i=2;i<pa.length;i+=3){if(pa[i]>zx)zx=pa[i];if(pa[i]<zn)zn=pa[i];}
      const mid=(zx+zn)/2,d=spec.lampInset;
      for(let i=0;i<pa.length;i+=3){
        pa[i+2]+=(pa[i+2]>mid?-d:d);       // 앞램프는 뒤로, 뒷램프는 앞으로 = 각자 차 안쪽
        pa[i]*=.985;}                       // 좌우도 살짝 안으로(펜더를 뚫지 않게)
      split.lamps.attributes.position.needsUpdate=true;
      split.lamps.computeVertexNormals();}
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
      if(lc&&rc)this.hlAnchor=[[lxS/lc,yS/yc,zMax-.02],[rxS/rc,yS/yc,zMax-.02]];
      /* 후미등 앵커(z 최소) — 실제로 빛나는 리어 램프를 위해 위치를 잡아 둔다 */
      let zMin=1e9;for(let i=2;i<pa.length;i+=3)if(pa[i]<zMin)zMin=pa[i];
      let tlS=0,tc=0,trS=0,tr=0,tyS=0,tyc=0;
      for(let i=0;i<pa.length;i+=3)if(pa[i+2]<zMin+.4){
        const x=pa[i];tyS+=pa[i+1];tyc++;
        if(x<-.12){tlS+=x;tc++;}else if(x>.12){trS+=x;tr++;}}
      if(tc&&tr)this.tlAnchor=[[tlS/tc,tyS/tyc,zMin+.02],[trS/tr,tyS/tyc,zMin+.02]];}
    if(split.glass){this.glassMesh=new THREE.Mesh(split.glass,glassMatFor(spec));
      this.glassMesh.castShadow=true;this.group.add(this.glassMesh);}
    /* 창틀 크롬 — 정점색만 바꾼다(덧붙이는 몰딩 없음). 래티스보다 먼저. */
    if(spec.chromeKit&&spec.chromeKit.window!==false&&split.glass)
      this.tintWindowTrim(split.glass,spec);
    this.lattice=new SoftLattice(spec,[this.bodyMesh,this.glassMesh,this.lampsMesh]);
    const bumpMat=new THREE.MeshPhongMaterial({color:0x191d24,flatShading:true,shininess:18});
    const by=Math.max(spec.modelWheelY,-hy*.62);
    // 범퍼/미러 파트를 실제 차체 바운딩에 밀착 (모델 중심 오프셋 대응)
    this.bodyMesh.geometry.computeBoundingBox();
    const bx=this.bodyMesh.geometry.boundingBox;
    const zF=bx.max.z,zR=bx.min.z,xR=Math.max(Math.abs(bx.min.x),Math.abs(bx.max.x));
    /* 범퍼 파트 폭 — 예전엔 차체 최대폭(hx)으로 잡아, 코가 좁아지는 세단에서는
       앞뒤로 '막대기'가 차체 밖으로 튀어나와 보였다. 해당 z 위치의 실제 차체 폭을 재서 맞춘다. */
    // 해당 z 단면의 최대 반폭(모든 y) — 실루엣 격자 질의
    const widthAt=(zt,tol)=>this.bodySilWidth(0,zt,1e9,tol)||hx;
    const fbZ=zF-.16, rbZ=zR+.16;
    const fbW=spec.fitBumper?widthAt(fbZ,.30)*.90:hx*1.02;
    const rbW=spec.fitBumper?widthAt(rbZ,.30)*.90:hx*1.02;
    /* 스캔 차체에는 사이드미러가 이미 메시로 들어 있다. 절차 미러를 또 붙이면
       중복인 데다, 이 부품들은 격자에 안 묶여 있어서 앞이 뭉개져도 제자리에 남는다
       → 포르쉐처럼 코가 짧은 차는 본넷에서 판때기 두 개가 튀어나온 꼴이 됐다. */
    this.parts={
      fb:this.mkPart(fbW,hy*.15,.09,0,by+hy*.06,fbZ,bumpMat),
      rb:this.mkPart(rbW,hy*.15,.09,0,by+hy*.06,rbZ,bumpMat)};
    this.partHp={fb:1.3,rb:1.3};
    /* 범퍼도 격자를 따라 움직인다 — 안 그러면 코가 접혀 들어가도 범퍼만 허공에 남는다 */
    this.partFollow=[];
    for(const k in this.parts)this.partFollow.push([this.parts[k],this.parts[k].position.clone(),
      this.latticeNodesAt(this.parts[k].position)]);
    /* ✨ 크롬 킷 — 스캔 모델은 텍스처가 없어 그릴·오너먼트·몰딩이 도장과 같은 색으로
       뭉쳐 나온다(원본이 단색 블랙 모델). 색이 구분되는 부위를 실제 부품으로 얹어
       크롬 그릴·조각·몰딩이 반짝이게 한다. */
    if(spec.chromeKit)this.buildChromeKit(spec,bx,by,hx,hy,split.glass);
    if(spec.interior)this.buildInterior(spec,bx,hy);
    if(spec.headlamp&&this.hlAnchor)this.buildHeadlamps(spec,bx,hy);
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
    const wg=wheelGeo(spec.wheels.radius,spec.wheels.width,spec.rimScale,spec.wheelStyle);
    const bg=brakeGeo(spec.wheels.radius,spec.wheels.width);
    this._wheelGeo=wg;this.wheelOff=[false,false,false,false];
    // 휠 아치에 꽉 끼는 시각 스케일(물리는 그대로) — 스캔 차량의 아치 개구부 충전
    const wf=spec.wheelVisFit||1;
    this.wheelYOff=(wf-1)*spec.wheels.radius;
    /* 시각 전용 휠 반경 배율 — 스캔 차체의 휠 아치가 타이어보다 커서 바퀴가
       작아 보이는 문제를 물리(접지 반경)를 건드리지 않고 보정한다.
       휠 지오메트리 축은 X이므로 Y·Z만 키우면 폭은 그대로다. */
    const wvs=spec.wheelVisScale||1;
    this.wheelMeshes=[];
    // 리프트업 차량: 바퀴가 차체에서 동떨어져 보이지 않게 서스펜션 링크(스트럿+하프샤프트)로 연결
    const linked=spec.id==="offroad"||spec.id==="offroadc";
    const linkMat=linked?new THREE.MeshPhongMaterial({color:0x2a2e35,flatShading:true,shininess:26}):null;
    const susLen=linked?spec.susp.rest*.62:0;   // 허브→차체 바닥까지만(펜더 위로 튀어나오지 않게)
    /* 원본 휠(림·타이어·브레이크까지 한 덩어리)이 있으면 절차 휠·브레이크를 대체한다 */
    const rwR=realWheelGeo(e,spec.modelScale,false),rwL=realWheelGeo(e,spec.modelScale,true);
    if(rwR)this._wheelGeo=rwR;
    /* 절차 휠은 spec.wheels.radius 로 만들어지지만 원본 휠은 모델 치수 그대로다.
       wheelRadMul 등으로 물리 반경을 손봤다면 그 비율만큼 시각 반경도 맞춘다. */
    const rwK=rwR?spec.wheels.radius/((((e.wheel.bb[4]-e.wheel.bb[1])/2)*spec.modelScale)||1):1;
    /* 휠 아치 천장을 실측해 시각 휠의 상한을 만든다(아치 천장 - 타이어 반경*0.92). */
    {const pa=this.bodyMesh.geometry.attributes.position.array;
     const zw=spec.wheels.front, xw=spec.wheels.trackVis||spec.wheels.track;
     let top=-1e9;
     for(let i=0;i<pa.length;i+=3)
       if(Math.abs(pa[i+2]-zw)<.22&&Math.abs(pa[i])>xw*.5&&pa[i+1]<hy&&pa[i+1]>top)top=pa[i+1];
     if(top>-1e8)this.wheelVisTop=top-spec.wheels.radius*.92;}
    for(let i=0;i<4;i++){
      const left=(i%2===0);                                   // 0,2 = 좌
      const m=new THREE.Mesh(rwR?(left?rwL:rwR):wg,
        rwR?(rwR.groups.length>1?[MAT_TIRE_REAL,MAT_WHEEL_REAL]:MAT_WHEEL_REAL):MAT_DETAIL);
      m.castShadow=true;
      /* 원본 휠의 캘리퍼는 회전부에서 빼내 여기(비회전 형제)로 붙인다 */
      const cg=rwR?realCaliperGeo(e,spec.modelScale,left):null;
      const br=cg?new THREE.Mesh(cg,MAT_WHEEL_REAL):(rwR?null:new THREE.Mesh(bg,MAT_DETAIL));
      if(wvs*rwK!==1){m.scale.set(1,wvs*rwK,wvs*rwK);if(br)br.scale.set(1,wvs*rwK,wvs*rwK);}
      const grp=new THREE.Group();grp.add(m);if(br)grp.add(br);
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
    const wg=wheelGeo(W.radius,W.width,spec.rimScale,spec.wheelStyle);
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
    const wg=wheelGeo(W.radius,W.width,spec.rimScale,spec.wheelStyle);
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
        /* 위치는 syncParts 가 매 프레임 격자에서 다시 쓰므로, 휨은 오프셋으로 누적한다 */
        const bo=p.userData.bendOff||(p.userData.bendOff={x:0,y:0,z:0});
        bo.x+=imp.ln.x*bend*.16;bo.y+=imp.ln.y*bend*.10;bo.z+=imp.ln.z*bend*.16;
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
  /* 🪟 사이드 크롬(윈도 서라운드) — '딱 맞게' 붙이는 게 전부다.
     예전 실패는 구간별 최대/최소값을 그대로 이어 붙여 라인이 들쭉날쭉했던 것.
     이번엔 유리 실루엣 점군에 수식을 피팅한다:
       · 벨트라인(창 하단) → 최소자승 '직선'  y = m·z + c   (실차도 직선이다)
       · 루프라인(창 상단) → 최소자승 '2차곡선'            (완만한 지붕 곡선)
     그 위에서 각 세그먼트의 x는 그 지점 차체 실루엣을 재서 붙이므로 뜨지 않는다. */
  /* ⚠ 반드시 SoftLattice 생성 전에 호출해야 한다 — 래티스가 정점색 원본을
     스냅샷해 두고 수리(reset) 때 되돌리기 때문. */
  tintWindowTrim(glassGeo,spec){
    const K=spec.chromeKit||{};
    const hx=spec.body.hx,hy=spec.body.hy;
    this.bodyMesh.geometry.computeBoundingBox();
    const _bb=this.bodyMesh.geometry.boundingBox,zF=_bb.max.z,zR=_bb.min.z;
    const a=glassGeo.attributes.position.array;
    let xMax=0;
    for(let i=0;i<a.length;i+=3){const q=Math.abs(a[i]);if(q>xMax)xMax=q;}
    const XT=xMax*.62;                                   // 측면 유리만
    const cab=Math.abs(zF-zR);
    for(const sg of[-1,1]){
      /* 구간별 상·하단 점 뽑기 */
      /* 1차 스캔: 차 전체 z를 촘촘히 나눠 '창 높이'를 재고, 높이가 충분한
         연속 구간만 남긴다 = 도어 윈도(캐빈). 유리 마스크에는 윈드실드·리어글래스
         조각도 섞여 있어 이 과정을 빼면 라인이 차 앞뒤로 뻗어 나간다. */
      const M0=40;
      const t0=new Array(M0).fill(NaN),b0=new Array(M0).fill(NaN);
      for(let i=0;i<a.length;i+=3){
        const x=a[i],y=a[i+1],z=a[i+2];
        if(Math.sign(x)!==sg||Math.abs(x)<XT)continue;
        let k=((z-zR)/(zF-zR)*M0)|0;if(k<0||k>=M0)continue;
        if(!(t0[k]>y))t0[k]=y;
        if(!(b0[k]<y))b0[k]=y;}
      let hMax=0,kBest=-1;
      for(let k=0;k<M0;k++){
        const hh=(t0[k]-b0[k]);
        if(hh>hMax){hMax=hh;kBest=k;}}
      if(kBest<0||!(hMax>.08))continue;
      /* B필러에서 유리가 끊겨 높이가 잠깐 낮아진다. 연속 조건만 쓰면 앞문 창에서
         멈춰 버리므로(계측: 캐빈이 0.83m로 잘림) 최대 2칸까지 건너뛴다. */
      const hh=k=>{const v2=t0[k]-b0[k];return isFinite(v2)?v2:0;};
      let kA=kBest,kB=kBest;
      for(let gap=0,k=kBest-1;k>=0;k--){
        if(hh(k)>hMax*.45){kA=k;gap=0;}else if(++gap>2)break;}
      for(let gap=0,k=kBest+1;k<M0;k++){
        if(hh(k)>hMax*.45){kB=k;gap=0;}else if(++gap>2)break;}
      let z0=zR+(kA/M0)*(zF-zR), z1=zR+((kB+1)/M0)*(zF-zR);
      z0=Math.max(z0,zR+cab*.05);z1=Math.min(z1,zF-cab*.05);
      if(!(z1-z0>.8))continue;
      const N=14;
      const top=new Array(N).fill(NaN),bot=new Array(N).fill(NaN),gx=new Array(N).fill(0);
      for(let i=0;i<a.length;i+=3){
        const x=a[i],y=a[i+1],z=a[i+2];
        if(Math.sign(x)!==sg||Math.abs(x)<XT)continue;
        if(z<z0||z>z1)continue;
        let k=((z-z0)/(z1-z0)*N)|0;if(k>=N)k=N-1;
        if(!(top[k]>y))top[k]=y;
        if(!(bot[k]<y))bot[k]=y;
        const q=Math.abs(x);if(q>gx[k])gx[k]=q;}
      const zAt=k=>z0+(k+.5)/N*(z1-z0);
      /* 유리면 x — 몰딩은 도어 어깨선이 아니라 '유리 평면'에 앉아야 한다.
         차체 실루엣(어깨)이 더 넓어서 그걸 쓰면 몰딩이 도어 안에 묻힌다. */
      {let last=0;for(let k=0;k<N;k++){if(gx[k]>0)last=gx[k];else gx[k]=last;}
       for(let k=N-1;k>=0;k--){if(gx[k]>0)last=gx[k];else gx[k]=last;}
       for(let pass=0;pass<2;pass++){const c2=gx.slice();
         for(let k=0;k<N;k++)gx[k]=(c2[Math.max(0,k-1)]+c2[k]*2+c2[Math.min(N-1,k+1)])/4;}}
      const glassX=z=>{
        let k=((z-z0)/(z1-z0)*N)|0;k=Math.max(0,Math.min(N-1,k));
        return gx[k];};
      /* ① 벨트라인 — 최소자승 직선 */
      let n=0,Sz=0,Sy=0,Szz=0,Szy=0;
      for(let k=0;k<N;k++){if(isNaN(bot[k]))continue;
        const z=zAt(k),y=bot[k];n++;Sz+=z;Sy+=y;Szz+=z*z;Szy+=z*y;}
      if(n<4)continue;
      const den=n*Szz-Sz*Sz;
      /* 실차 벨트라인은 거의 수평이다 — 피팅이 튀어도 기울기를 제한해 둔다 */
      const m1=clamp(Math.abs(den)>1e-9?(n*Szy-Sz*Sy)/den:0,-.10,.10), c1=(Sy-m1*Sz)/n;
      const beltY=z=>m1*z+c1+.014;
      /* ② 루프라인 — 최소자승 2차곡선(정규방정식 3×3) */
      let q0=0,q1=0,q2=0,q3=0,q4=0,r0=0,r1=0,r2=0,m=0;
      for(let k=0;k<N;k++){if(isNaN(top[k]))continue;
        const z=zAt(k)-((z0+z1)/2),y=top[k];
        m++;q0+=1;q1+=z;q2+=z*z;q3+=z*z*z;q4+=z*z*z*z;
        r0+=y;r1+=z*y;r2+=z*z*y;}
      let A=0,B=0,C=0;
      if(m>=5){
        const M=[[q4,q3,q2],[q3,q2,q1],[q2,q1,q0]],R=[r2,r1,r0];
        for(let i2=0;i2<3;i2++){                         // 가우스 소거
          let p=i2;for(let j2=i2+1;j2<3;j2++)if(Math.abs(M[j2][i2])>Math.abs(M[p][i2]))p=j2;
          [M[i2],M[p]]=[M[p],M[i2]];[R[i2],R[p]]=[R[p],R[i2]];
          const d=M[i2][i2];if(Math.abs(d)<1e-9)continue;
          for(let j2=i2+1;j2<3;j2++){
            const f=M[j2][i2]/d;
            for(let k2=i2;k2<3;k2++)M[j2][k2]-=f*M[i2][k2];
            R[j2]-=f*R[i2];}}
        C=Math.abs(M[2][2])>1e-9?R[2]/M[2][2]:0;
        B=Math.abs(M[1][1])>1e-9?(R[1]-M[1][2]*C)/M[1][1]:0;
        A=Math.abs(M[0][0])>1e-9?(R[0]-M[0][1]*B-M[0][2]*C)/M[0][0]:0;}
      const zc0=(z0+z1)/2;
      const roofY=z=>{const t=z-zc0;return A*t*t+B*t+C-.010;};
      /* ③ 창틀 = "덧붙이기"가 아니라 "원래 차체 정점의 색만 크롬으로".
         스캔 차체 위에 박스를 얹으면 아무리 맞춰도 덧댄 티가 나고 충돌 시 따로 논다.
         창틀 라인 근처의 기존 정점을 골라 정점색만 바꾸면 형상은 그대로면서
         크롬 몰딩처럼 보이고, 소프트바디 변형도 차체와 완전히 같이 움직인다. */
      const P=this.bodyMesh.geometry.attributes.position.array;
      const CC=this.bodyMesh.geometry.attributes.color.array;
      const CHR=[.76,.80,.86];                 // 밝은 크롬(정점색)
      const BW=.030;                           // 몰딩 두께(라인에서의 y 허용치)
      for(let i=0;i<P.length;i+=3){
        const x=P[i],y=P[i+1],z=P[i+2];
        if(Math.sign(x)!==sg)continue;
        if(z<z0-.03||z>z1+.03)continue;
        let sil=this.bodySilWidth(y,z,hy*.06,.10);
        if(sil>0&&Math.abs(x)<sil*.86)continue;   // 바깥 껍질만
        const db=Math.abs(y-beltY(z));
        const dr=K.roofTrim===false?9:Math.abs(y-roofY(z));
        /* A/C 필러 — 창틀 앞뒤 끝의 세로 구간 */
        const dpz=Math.min(Math.abs(z-z0),Math.abs(z-z1));
        const inWin=(y>beltY(z)-BW&&y<roofY(z)+BW);
        if(db<BW||dr<BW||(dpz<.045&&inWin)){
          CC[i]=CHR[0];CC[i+1]=CHR[1];CC[i+2]=CHR[2];}}
      this.bodyMesh.geometry.attributes.color.needsUpdate=true;}
  }
  buildChromeKit(spec,bx,by,hx,hy,glassGeo){
    const K=spec.chromeKit;
    const zF=bx.max.z,zR=bx.min.z;
    const xR=Math.max(Math.abs(bx.min.x),Math.abs(bx.max.x));
    const topY=bx.max.y;
    const cr=[],dk=[];                       // 밝은 크롬 / 다크 크롬
    const gW=hx*(K.grilleW||.62), gH=hy*(K.grilleH||.52);
    // 그릴은 범퍼 면보다 살짝 '안쪽'에 앉힌다(앞으로 튀어나오면 부착물처럼 보인다)
    const gY=by+hy*(K.grilleY||.62), gZ=zF-(K.grilleZ||.10);
    /* ── 프런트 그릴: 크롬 프레임 + 세로 슬랫(롤스로이스 판테온 / 마이바흐 수직 그릴) ── */
    cr.push({geo:new THREE.BoxGeometry(gW*2+.09,.055,.07),y:gY+gH,z:gZ});      // 상단 몰딩
    cr.push({geo:new THREE.BoxGeometry(gW*2+.09,.05,.07),y:gY-gH,z:gZ});       // 하단 몰딩
    for(const sg of[-1,1])
      cr.push({geo:new THREE.BoxGeometry(.05,gH*2+.05,.07),x:sg*(gW+.02),y:gY,z:gZ});
    dk.push({geo:new THREE.BoxGeometry(gW*2,gH*2,.04),y:gY,z:gZ-.03});          // 그릴 배경(다크)
    /* 판테온 그릴 — 세로 슬랫은 가운데가 굵고 바깥으로 갈수록 얇아지며,
       뒤로 살짝 물러난 곡면(배럴)을 이룬다. 상단에는 굵은 크롬 바가 얹힌다. */
    const NS=K.slats||13;
    for(let i=0;i<NS;i++){
      const t=(i+.5)/NS*2-1;
      const wSl=.030-Math.abs(t)*.010;                       // 중앙 굵고 바깥 얇게
      const zBack=Math.abs(t)*Math.abs(t)*.045;              // 배럴 곡면
      cr.push({geo:new THREE.BoxGeometry(wSl,gH*2-.035,.05),x:t*gW*.94,y:gY,z:gZ+.014-zBack});}
    /* 상단 크롬 바 — 그릴 '폭에 딱 맞춰' 얹는다.
       예전엔 그릴보다 넓게(+.14) 만들어 앞면을 가로지르는 별도의 줄로 보였다.
       프레임과 같은 폭이면 판테온 그릴의 두꺼운 윗변으로 자연스럽게 읽힌다. */
    cr.push({geo:new THREE.BoxGeometry(gW*2+.09,.052,.072),y:gY+gH+.042,z:gZ});
    /* 하단 에어인테이크 — 차체 안쪽으로 '들어간' 다크 메시만. 크롬 립은 넣지 않는다
       (앞으로 튀어나온 막대기처럼 보였다). 폭도 코 폭에 맞춰 좁게. */
    {const iw=hx*(K.intakeW||.52), ih=hy*.085, iy=by+hy*.30, iz=zF-.16;
     dk.push({geo:new THREE.BoxGeometry(iw*2,ih*2,.05),y:iy,z:iz});
     /* 세로 바 7개는 앞면을 잘게 쪼개 지저분했다 → 한 장의 매끈한 메시 패널로.
        대신 아래에 '풀 폭 크롬 블레이드'를 깔아 좌우가 한 줄로 이어져 보이게 한다. */
     dk.push({geo:new THREE.BoxGeometry(iw*1.94,ih*1.7,.030),y:iy,z:iz+.014});
     }
    /* ── 보닛 오너먼트(환희의 여신상 / 스리포인티드 스타 대용 조각) ── */
    if(K.ornament){
      const oy=topY*(K.ornY||.30)+hy*.02, oz=zF-(K.ornZ||.30);
      cr.push({geo:new THREE.CylinderGeometry(.045,.055,.022,14),y:oy,z:oz});          // 베이스
      cr.push({geo:new THREE.CylinderGeometry(.012,.016,.10,10),y:oy+.06,z:oz});       // 몸통
      cr.push({geo:new THREE.SphereGeometry(.021,10,8),y:oy+.125,z:oz});               // 머리
      for(const sg of[-1,1])                                                            // 날개
        cr.push({geo:new THREE.BoxGeometry(.075,.05,.012),x:sg*.045,y:oy+.10,z:oz-.02,
                 rz:sg*.5,ry:sg*.22});}
    /* 윈도 서라운드는 정점색 변경으로 처리한다(tintWindowTrim) — 덧붙이지 않는다 */
    /* ── 로커(사이드 스커트) 크롬 ──
       차체 '최대폭'(휠아치)에 붙이면 실제로 좁은 사이드실 높이에서는 막대가 차 밖으로
       떠 보인다 → 해당 높이·구간의 실제 차체 폭을 재서 그보다 살짝 안쪽에 붙인다. */
    if(K.rocker!==false){
      const ry=by+hy*.10, rz=(zF+zR)/2, rLen=Math.abs(zF-zR)*.40;
      /* 구간의 '최소' 폭 기준 — 최대폭(휠아치)으로 잡으면 도어 중앙에서 막대가 밖으로
         떠 버린다. 표면보다 확실히 안쪽(0.90)에 심어 몰딩처럼만 비치게 한다. */
      const rw=this.bodySilMin(ry,rz-rLen/2,rz+rLen/2,hy*.20,7)||xR*.86;
      for(const sg of[-1,1])
        cr.push({geo:new THREE.BoxGeometry(.036,.040,rLen),x:sg*rw*.90,y:ry,z:rz});}
    /* ── 배기 팁 — 실차처럼 범퍼에 '박혀 있는' 피니셔.
         예전엔 밝은 크롬 원통이 범퍼 밖으로 나와 흰 공을 붙인 것처럼 보였다 →
         팁 본체는 다크 크롬으로 범퍼 안쪽에 묻고, 테두리만 얇은 크롬 링으로. ── */
    const NE=K.exhaust||2;
    const exY=by+hy*.16, exZ=zR+.035;
    const exLim=this.bodySilWidth(exY,exZ+.05,hy*.22,.22);
    for(let i=0;i<NE;i++){
      const sg=i<NE/2?-1:1, k=(i%Math.max(1,NE/2));
      let ex=xR*.50+k*.13;
      if(exLim>0)ex=Math.min(ex,exLim*.80);
      /* 실차(고스트)는 원통이 아니라 '납작한 사각 피니셔'다. 원통 크롬 원판을 앞에 두면
         탁구공을 붙인 것처럼 보였으므로, 크롬 테두리 판을 깊은 쪽에 두고 그 앞에
         어두운 사각 팁을 얹어 얇은 크롬 테두리만 비치게 한다. */
      cr.push({geo:new THREE.BoxGeometry(.145,.062,.012),x:sg*ex,y:exY,z:exZ+.010});
      dk.push({geo:new THREE.BoxGeometry(.125,.044,.070),x:sg*ex,y:exY,z:exZ-.020});}
    /* 리어 크롬 바는 넣지 않는다 — 트렁크를 가로지르는 줄 두 개가 지저분했다.
       뒷면은 테일램프와 배기 피니셔만으로 정리한다. */
    const mk=(items,mat)=>{
      if(!items.length)return null;
      const m=new THREE.Mesh(mergeGeoms(items),mat);
      m.castShadow=true;this.group.add(m);return m;};
    this.chromeMesh=mk(cr,MAT_CHROME);
    this.chromeDarkMesh=mk(dk,MAT_CHROME_DARK);
    // 크롬도 소프트바디 격자에 물려 충돌 시 함께 찌그러진다
    if(this.chromeMesh)this.lattice.bind(this.chromeMesh);
    if(this.chromeDarkMesh)this.lattice.bind(this.chromeDarkMesh);
  }
  /* ═══ 실내·기계부 충진 ═══
     스캔 차체는 '껍데기'라서 판금이 찢어지면 안이 텅 빈 게 그대로 보인다.
     바닥 팬·방화벽·프레임 레일·시트·연료탱크로 속을 채우고, 이것들을 소프트바디 격자에
     물려 껍데기와 함께 찌그러지고 찢겨 나가게 한다.
     엔진 블록만은 격자에 묶지 않는다 — 쇳덩이는 찌그러지지 않고 '통째로 밀려 들어와야'
     하므로, 엔진룸 격자 노드의 평균 변위를 따라 강체로 이동시킨다. */
  buildInterior(spec,bx,hy){
    const zF=bx.max.z,zR=bx.min.z,xR=Math.max(Math.abs(bx.min.x),Math.abs(bx.max.x));
    const len=zF-zR;
    const by=Math.max(spec.modelWheelY,-hy*.62);      // 바닥 높이
    const fw=z=>Math.max(.12,this.bodySilWidth(by+hy*.35,z,hy*.55,.22)*.80); // 그 z의 내부 반폭
    const MI=new THREE.MeshPhongMaterial({vertexColors:true,flatShading:true,
      shininess:14,specular:0x1a1d22,side:THREE.DoubleSide});
    const G=[];
    const zEng=zF-len*.16;                             // 엔진룸 중심
    const zFire=zF-len*.30;                            // 방화벽
    const zTank=zR+len*.20;                            // 연료탱크
    /* ① 바닥 팬 — 언더바디를 막아 아래에서 봐도 뚫려 보이지 않는다 */
    for(let i=0;i<7;i++){
      const z=zR+len*(i+.5)/7, w=fw(z);
      G.push({geo:new THREE.BoxGeometry(w*2,.035,len/7*1.02),color:0x23272e,y:by+.02,z});}
    /* ② 세로 프레임 레일 2개 — 접히고 부러지는 뼈대(크럼플 존의 주역) */
    for(const sx of[-1,1])
      G.push({geo:new THREE.BoxGeometry(.09,.11,len*.94),color:0x2c3138,
        x:sx*xR*.52,y:by+.09,z:(zF+zR)/2});
    /* ③ 방화벽(벌크헤드) + 리어 벌크헤드 — 승객칸을 앞뒤로 닫는다 */
    G.push({geo:new THREE.BoxGeometry(fw(zFire)*2,hy*1.05,.05),color:0x2a2e35,y:by+hy*.55,z:zFire});
    G.push({geo:new THREE.BoxGeometry(fw(zTank)*2,hy*.75,.05),color:0x2a2e35,y:by+hy*.42,z:zTank});
    /* ④ 엔진 주변부(라디에이터·배터리·서스펜션 타워) — 엔진룸을 채운다 */
    G.push({geo:new THREE.BoxGeometry(fw(zF-len*.05)*1.5,hy*.55,.07),color:0x1b1f25,
      y:by+hy*.42,z:zF-len*.045});                                   // 라디에이터
    for(const sx of[-1,1])
      G.push({geo:new THREE.BoxGeometry(.16,hy*.62,.30),color:0x2b3037,
        x:sx*xR*.62,y:by+hy*.55,z:zEng});                            // 스트럿 타워
    /* ⑤ 좌석 4개 + 대시 + 센터 콘솔 */
    const zRow=[zFire-len*.10,zFire-len*.26];
    for(let r=0;r<2;r++)for(const sx of[-1,1]){
      const z=zRow[r], w=fw(z);
      G.push({geo:new THREE.BoxGeometry(.46,.14,.48),color:0x14161a,x:sx*w*.45,y:by+hy*.32,z});
      G.push({geo:new THREE.BoxGeometry(.46,.58,.13),color:0x14161a,x:sx*w*.45,y:by+hy*.62,z:z-.24});}
    G.push({geo:new THREE.BoxGeometry(fw(zFire)*1.7,.22,.34),color:0x181b20,
      y:by+hy*.72,z:zFire-.20});                                     // 대시보드
    G.push({geo:new THREE.BoxGeometry(.30,.26,len*.24),color:0x181b20,
      y:by+hy*.34,z:(zRow[0]+zRow[1])/2});                           // 센터 콘솔
    /* ⑥ 휠 하우스 라이너 — 없으면 낮은 각도에서 아치가 옆으로 뻥 뚫려 반대편이 보인다 */
    {const wf=spec.wheels.front,wr2=spec.wheels.rear,tv=spec.wheels.trackVis||spec.wheels.track;
     const R=spec.wheels.radius*1.24, wI=Math.max(.10,tv-spec.wheels.width*.62);
     for(const zc of[wf,-wr2])for(const sx of[-1,1]){
       // 아치 안쪽 벽(세로판) — 휠과 실내 사이를 막는다
       G.push({geo:new THREE.BoxGeometry(.035,R*1.15,R*2.0),color:0x1a1d22,
         x:sx*wI,y:by+R*.52,z:zc});
       // 아치 천장(반원 대신 납작한 아치 3장)
       for(let q=0;q<3;q++){
         const a2=(q-1)*.62;
         G.push({geo:new THREE.BoxGeometry(spec.wheels.width*1.5,.03,R*.78),
           color:0x1a1d22,x:sx*(tv-.01),y:by+R*.95-Math.abs(a2)*R*.22,
           z:zc+a2*R*.72,rx:a2*.5});}}}
    /* ⑦ 연료탱크 + 트렁크 바닥 */
    G.push({geo:new THREE.BoxGeometry(fw(zTank)*1.5,.22,.42),color:0x21262c,y:by+.16,z:zTank});
    G.push({geo:new THREE.BoxGeometry(fw(zR+len*.09)*1.7,.04,len*.16),color:0x23272e,
      y:by+hy*.30,z:zR+len*.09});
    this.interiorMesh=new THREE.Mesh(mergeGeoms(G),MI);
    this.group.add(this.interiorMesh);
    this.lattice.bind(this.interiorMesh);              // 껍데기와 함께 찌그러지고 찢긴다
    /* ⑧ 엔진 블록 — 격자에 묶지 않는 강체. 충돌 시 통째로 밀려 들어온다. */
    const E=[
      {geo:new THREE.BoxGeometry(.60,.52,.74),color:0x30353d},            // 블록
      {geo:new THREE.BoxGeometry(.66,.14,.56),color:0x3a4049,y:.32},      // 헤드커버
      {geo:new THREE.BoxGeometry(.40,.30,.44),color:0x272b31,z:-.56},     // 변속기
      {geo:new THREE.CylinderGeometry(.09,.09,.34,10),color:0x4a5058,rz:Math.PI/2,y:.20,z:.30}];
    this.engineMesh=new THREE.Mesh(mergeGeoms(E),MI);
    this.engineHome=new THREE.Vector3(0,by+hy*.44,zEng);
    /* 엔진이 방화벽을 뚫고 승객칸까지 들어가지는 않게 — 실차도 서브프레임이 엔진을
       바닥 밑으로 흘려보낸다. 계측: 무제한이면 110km/h에서 90cm 밀려 발밑까지 왔다. */
    this.engineMaxIn=Math.max(.10,(zEng-zFire)*.92);
    this.engineMesh.position.copy(this.engineHome);
    this.group.add(this.engineMesh);
    /* 엔진룸을 감싸는 격자 노드 8개 — 이 노드들의 평균 변위가 엔진의 이동량이다 */
    {const L=this.lattice,mn=L.min,ce=L.cell;
     const fx=clamp((this.engineHome.x-mn[0])/ce[0],0,L.NX-1.001);
     const fy=clamp((this.engineHome.y-mn[1])/ce[1],0,L.NY-1.001);
     const fz=clamp((this.engineHome.z-mn[2])/ce[2],0,L.NZ-1.001);
     const i0=fx|0,j0=fy|0,k0=fz|0;
     this.engNodes=[];
     for(let dk=0;dk<2;dk++)for(let dj=0;dj<2;dj++)for(let di=0;di<2;di++)
       this.engNodes.push(L.idx(i0+di,j0+dj,k0+dk)*3);}
  }
  /* 어떤 로컬 좌표를 감싸는 격자 노드 8개의 성분 오프셋 */
  latticeNodesAt(p){
    const L=this.lattice,mn=L.min,ce=L.cell,out=[];
    const fx=clamp((p.x-mn[0])/ce[0],0,L.NX-1.001);
    const fy=clamp((p.y-mn[1])/ce[1],0,L.NY-1.001);
    const fz=clamp((p.z-mn[2])/ce[2],0,L.NZ-1.001);
    const i0=fx|0,j0=fy|0,k0=fz|0;
    for(let dk=0;dk<2;dk++)for(let dj=0;dj<2;dj++)for(let di=0;di<2;di++)
      out.push(L.idx(i0+di,j0+dj,k0+dk)*3);
    return out;}
  /* 얹은 부품(범퍼)이 격자를 따라간다 — 탈락한 부품은 건드리지 않는다 */
  syncParts(){
    if(!this.partFollow)return;
    const L=this.lattice,P=L.pos,H=L.home;
    for(const[m,home,N]of this.partFollow){
      if(!m.parent)continue;                       // 탈락(제거)된 부품
      let dx=0,dy=0,dz=0;
      for(const a of N){dx+=P[a]-H[a];dy+=P[a+1]-H[a+1];dz+=P[a+2]-H[a+2];}
      const n=N.length;
      const b=m.userData.bendOff;
      m.position.set(home.x+dx/n+(b?b.x:0),home.y+dy/n+(b?b.y:0),home.z+dz/n+(b?b.z:0));}}
  /* 엔진 강체 추종 — 격자 노드 평균 변위를 그대로 따라간다(형상은 안 변한다) */
  syncEngine(){
    if(!this.engineMesh||!this.engNodes)return;
    const L=this.lattice,P=L.pos,H=L.home,N=this.engNodes;
    let dx=0,dy=0,dz=0;
    for(const a of N){dx+=P[a]-H[a];dy+=P[a+1]-H[a+1];dz+=P[a+2]-H[a+2];}
    const n=N.length;
    const lim=this.engineMaxIn||9;
    const iz=clamp(dz/n,-lim,lim);
    /* 밀려 들어간 만큼 아래로도 흘러내린다(서브프레임 이탈) */
    const drop=Math.max(0,-iz)*.22;
    this.engineMesh.position.set(this.engineHome.x+clamp(dx/n,-.35,.35),
      this.engineHome.y+dy/n*.6-drop,
      this.engineHome.z+iz);
    this.engineMesh.rotation.x=Math.max(0,-iz)*.30;   // 앞이 들리며 비스듬히 박힌다
  }
  /* 💡 헤드램프 어셈블리 — 동그란 구슬이 앞으로 튀어나온 모양이 아니라,
     실차처럼 '차체에 파인 램프 하우징 + 그 안의 여러 개 LED 프로젝터 + 앞면 유리 렌즈'로 만든다. */
  buildHeadlamps(spec,bx,hy){
    const H=spec.headlamp===true?{}:spec.headlamp;
    const w0=H.w||.34, h=H.h||.115, n=H.leds||4;
    const housing=[],leds=[];
    this.hlLens=[];
    this.hlBox=[];
    for(const[ax0,ay,az]of this.hlAnchor){
      const sgn=ax0<0?-1:1;
      /* ── 차체 실루엣 안으로 넣기 ──
         램프 앵커는 램프 마스크의 평균 위치라 하우징을 그대로 그리면 코가 좁아지는
         구간에서 베젤 바깥 끝이 차체 밖으로 삐져나온다(옆에서 보면 막대기).
         안쪽 끝은 그대로 두고 바깥 끝만 실루엣 안으로 당겨 폭을 다시 계산한다. */
      const lim=this.bodySilWidth(ay,az-.05,Math.max(h*1.3,.09),.20);
      const inner=Math.max(.06,Math.abs(ax0)-w0/2);
      let outer=Math.abs(ax0)+w0/2+.014;
      if(lim>0)outer=Math.min(outer,lim*.965);
      const w=Math.max(.16,outer-.014-inner);
      const ax=sgn*(inner+w/2);
      this.hlBox.push([ax,ay,az,w,h]);
      /* ── 깊이 ──
         예전엔 렌즈가 차체 면 바로 밑(1cm)이라 램프가 '흰 스티커'처럼 납작하게 보였다.
         렌즈를 4cm 안으로 넣고 그 앞에 하우징 개구부(테두리 립)를 두면, 어느 각도에서
         봐도 안쪽 벽·LED가 겹쳐 보여 램프 형상이 살아난다. */
      const DEEP=.040;                       // 렌즈를 차체 면에서 얼마나 안으로 넣을지
      // 하우징: 안쪽으로 파인 어두운 상자(램프가 차체 안에 들어가 보이게)
      housing.push({geo:new THREE.BoxGeometry(w,h,.13),x:ax,y:ay,z:az-DEEP-.070});
      // 개구부 립(상·하·좌·우) — 파인 구멍의 테두리. 이게 있어야 깊이가 읽힌다.
      housing.push({geo:new THREE.BoxGeometry(w+.030,.020,.052),x:ax,y:ay+h/2+.006,z:az-.020});
      housing.push({geo:new THREE.BoxGeometry(w+.030,.020,.052),x:ax,y:ay-h/2-.006,z:az-.020});
      for(const sx of[-1,1])
        housing.push({geo:new THREE.BoxGeometry(.020,h+.026,.052),x:ax+sx*(w/2+.008),y:ay,z:az-.020});
      // LED 프로젝터 여러 개 — 렌즈 뒤(더 깊은 곳)에 나란히
      for(let i=0;i<n;i++){
        const t=(i+.5)/n*2-1;
        leds.push({geo:new THREE.CylinderGeometry(h*.30,h*.30,.022,12),
          rx:Math.PI/2,x:ax+t*(w*.5-h*.34)*sgn,y:ay,z:az-DEEP-.026});
        // 각 LED 둘레의 크롬 리플렉터 컵 — 램프 알갱이가 또렷하게 보인다
        housing.push({geo:new THREE.CylinderGeometry(h*.40,h*.40,.030,12),
          rx:Math.PI/2,x:ax+t*(w*.5-h*.34)*sgn,y:ay,z:az-DEEP-.044});}
      // 앞면 유리 렌즈 — 개구부보다 안쪽에
      const lens=new THREE.Mesh(new THREE.BoxGeometry(w-.006,h-.006,.010),
        new THREE.MeshPhongMaterial({color:0x9fc4dd,transparent:true,opacity:.26,
          shininess:300,specular:0xffffff,side:THREE.DoubleSide}));
      lens.position.set(ax,ay,az-DEEP);
      this.group.add(lens);this.hlLens.push(lens);}
    this.hlHousing=new THREE.Mesh(mergeGeoms(housing),MAT_CHROME_DARK);
    this.hlHousing.castShadow=true;this.group.add(this.hlHousing);
    /* LED 본체 — 소등 시에도 흰 스티커처럼 튀지 않게 은은한 색으로 두고,
       점등은 sync()에서 색을 올려 표현한다(toneMapped:false 라 색이 곧 밝기). */
    this.hlLedMat=new THREE.MeshBasicMaterial({color:0x8c94a0,toneMapped:false});
    this.hlLed=new THREE.Mesh(mergeGeoms(leds),this.hlLedMat);
    this.group.add(this.hlLed);
    this.lattice.bind(this.hlHousing);this.lattice.bind(this.hlLed);
  }
  sync(veh,shakeT){
    // 렌더는 보간된 포즈를 쓴다(고정 스텝 물리 ↔ 가변 프레임 렌더 사이를 매끄럽게)
    this.group.position.copy(veh.body.rPos);
    this.group.quaternion.copy(veh.body.rQuat);
    if(this.engineMesh)this.syncEngine();
    if(this.partFollow)this.syncParts();
    if(shakeT>0&&Settings.camShake){
      this.group.position.x+=(Math.random()-.5)*.02;this.group.position.y+=(Math.random()-.5)*.02;}
    // 전조등 점등: 플레이어 차량만(광원 수 제한) — 밤에는 더 밝게. SpotLight는 최초 1회 지연 생성.
    if(this.hlAnchor){
      const on=typeof Game!=="undefined"&&Game.veh===veh;
      if(on&&!this.hl){                                    // 플레이어가 됐을 때 최초 생성
        this.hl=this.hlAnchor.map(([x0,y0,zl0],li)=>{
          /* 하우징이 실루엣에 맞춰 재계산됐다면 그 위치·폭을 그대로 쓴다 */
          const B=this.hlBox&&this.hlBox[li];
          const x=B?B[0]:x0, y=B?B[1]:y0, zl=B?B[2]:zl0;
          const s=new THREE.SpotLight(0xfff0cc,0,30,.52,.42,1.2);
          s.position.set(x,y,zl);s.target.position.set(x*.5,y-.4,zl+16);
          this.group.add(s);this.group.add(s.target);
          /* 발광은 '앞으로 튀어나온 구슬'이 아니라 렌즈면에 붙은 얇은 판으로 —
             램프가 차체 밖으로 돌출돼 보이던 문제를 없앤다. */
          const S=this.spec;
          const hw=B?B[3]:(S.headlamp?(S.headlamp===true?.34:(S.headlamp.w||.34)):.22);
          const hh=B?B[4]:(S.headlamp?(S.headlamp===true?.115:(S.headlamp.h||.115)):.10);
          const g=new THREE.Mesh(new THREE.BoxGeometry(hw*.94,hh*.9,.012),
            new THREE.MeshBasicMaterial({color:0xfff6d8,transparent:true,opacity:.8,
              blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));
          g.position.set(x,y,zl-.004);g.visible=false;this.group.add(g);
          return{s,g};});}
      if(this.hl){
        const inten=on?(Game.opts&&Game.opts.tod==="night"?4.6:1.9):0;
        if(this._hlI!==inten){this._hlI=inten;
          for(const h of this.hl){h.s.intensity=inten;h.g.visible=on&&inten>0;}
          // LED 알갱이도 점등 상태에 따라 밝기 변화(소등 시 은은한 회색)
          if(this.hlLedMat)this.hlLedMat.color.setHex(inten>0?0xfff4d8:0x8c94a0);}}}
    /* 🔴 후미등 발광 — 상시 미등 + 제동 시 급격히 밝아지는 브레이크등.
       (이 three 빌드에는 PointLight가 없어 가산합성 글로우 메시로 실제 발광을 표현) */
    if(this.tlAnchor){
      if(!this.tail){
        this.tail=this.tlAnchor.map(([x,y,z])=>{
          const g=new THREE.Mesh(new THREE.SphereGeometry(.085,10,8),
            new THREE.MeshBasicMaterial({color:0xff2a18,transparent:true,opacity:.55,
              blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));
          g.scale.z=.45;g.position.set(x,y,z-.02);this.group.add(g);
          const h=new THREE.Mesh(new THREE.SphereGeometry(.17,10,8),
            new THREE.MeshBasicMaterial({color:0xff3a20,transparent:true,opacity:.16,
              blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));
          h.scale.z=.3;h.position.set(x,y,z-.04);this.group.add(h);
          return{g,h};});}
      const night=typeof Game!=="undefined"&&Game.opts&&Game.opts.tod==="night";
      const brk=Math.min(1,(veh.brake||0)*1.4+(veh.handbrake?1:0));
      const lvl=(night?.42:.24)+brk*.95;
      if(this._tlL===undefined||Math.abs(this._tlL-lvl)>.02){
        this._tlL=lvl;
        for(const t of this.tail){
          t.g.material.opacity=Math.min(1,lvl);
          t.h.material.opacity=Math.min(.5,lvl*.34);
          const sc=1+brk*.5;t.g.scale.set(sc,sc,.45*sc);t.h.scale.set(sc,sc,.3*sc);}}}
    const tv=this.baked?this.spec.wheels.trackVis:0;
    for(let i=0;i<4;i++){
      if(this.wheelOff&&this.wheelOff[i])continue;   // 탈락한 바퀴는 재배치 안 함
      const w=veh.wheels[i],m=this.wheelMeshes[i];
      let vy=(w.rVisY===undefined?w.visY:w.rVisY);
      /* 시각 상한 — 트래블을 크게 준 차는 압축이 깊을 때 휠이 펜더를 뚫고 차체 위로
         올라온다(포르쉐). 물리 스트로크는 그대로 두고 '보이는 위치'만 아치 안에서 멈춘다. */
      if(this.wheelVisTop!==undefined&&vy>this.wheelVisTop)vy=this.wheelVisTop;
      m.position.set(this.baked?(w.left?-tv:tv):w.local.x,vy+(this.wheelYOff||0),w.local.z);
      const st=(w.front?veh.steer:0)+(w.left?-veh.toe:veh.toe)*8;
      m.rotation.set(0,st,0);
      m.children[0].rotation.x=(w.rSpin===undefined?w.spin:w.rSpin);}
  }
  dispose(){
    if(this.interiorMesh)this.interiorMesh.geometry.dispose();
    if(this.engineMesh)this.engineMesh.geometry.dispose();
    this.group.parent&&this.group.parent.remove(this.group);
    this.bodyMesh.geometry.dispose();
    if(this.glassMesh)this.glassMesh.geometry.dispose();
    if(this.lampsMesh)this.lampsMesh.geometry.dispose();
    if(this.detailMesh)this.detailMesh.geometry.dispose();
    if(this.lightsMesh)this.lightsMesh.geometry.dispose();
    for(const k in this.parts)this.parts[k].geometry.dispose();
  }
}
