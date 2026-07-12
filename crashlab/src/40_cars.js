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
  wheelOutset:.12,groundClear:.42,           // 와이드 스탠스 + 높은 차고(리프트업)
  wheelRadMul:.92,wheelWidMul:1.4,           // 바퀴 약간 작게 + 아주 굵게(머드 타이어)
  body:{hx:.95,hy:.75,hz:2.2},wheels:{track:.88,front:1.4,rear:1.4,y:-.5,radius:.42,width:.3},
  susp:{k:56000,c:5600,travel:.25,rest:.3},arb:9000,
  engine:{maxT:400,redline:5200,idle:800},gears:[3.8,2.3,1.6,1.15,.9],final:4.0,
  brakeF:10500,steerLo:.58,steerHi:.15,aero:{cd:1.5,df:0},gripF:.95,gripR:.95,
  style:"suv",colors:[0x5f8b4c,0xc2a368,0x556270,0xb8443c,0x2b2b2b],
  stats:{spd:32,acc:38,grip:60,mass:55}},
 {id:"offroadc",name:"오프로드 몬스터 하드탑",icon:"🛻",drive:"4WD",mass:2210,hp:280,acc:"9.2초",top:158,
  desc:"뚜껑(하드탑)을 덮은 버전 — 동일 섀시 클로즈드 캐빈. 롱트래블 리프트업.",
  model:"offroadc",rollFix:1.3,squashY:1,comFromWheels:true,realWheels:true,
  wheelOutset:.12,groundClear:.42,           // 와이드 스탠스 + 높은 차고(리프트업)
  wheelRadMul:.92,wheelWidMul:1.4,           // 바퀴 약간 작게 + 아주 굵게(머드 타이어)
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
  wheelRadMul:1.03,wheelTuck:-.04,rimScale:1.28, // 바퀴·림 크게 + 바깥으로(스탠스) — 큰 바퀴만큼 차고도 살짝 상승
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
];

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
  /* super */ return[
    S(1,.7,-.8,-.56,-.5,.58),S(.85,.95,-.95,-.42,-.32,.8),S(.5,1,-1,-.3,-.16,.86),
    S(.27,1,-1,-.26,-.1,.86),S(.1,1,-1,-.24,.48,.6,0,1),S(-.02,.995,-1,-.22,.62,.56),
    S(-.3,1,-1,-.2,.66,.56,1),S(-.48,1,-1,-.18,.52,.6,1,1),
    S(-.72,.99,-.95,-.15,.32,.74),S(-1,.84,-.75,-.3,.2,.7)];
}
const GLASS_COL=new THREE.Color(0x151d28);
function buildCarBody(spec,colorHex){
  const st=carStations(spec);
  const body=new THREE.Color(colorHex);
  const shade=body.clone().multiplyScalar(.66);
  const dark=body.clone().multiplyScalar(.42);
  const roof=body.clone().multiplyScalar(.88);
  const pos=[],col=[];
  // 8 section points: 0 bl,1 br,2 rockerR,3 beltR,4 roofR,5 roofL,6 beltL,7 rockerL
  const P=(s,k)=>{
    const wf=s.w*1.04,yf=s.y0+(s.y1-s.y0)*.3,wb=s.w*.985;
    switch(k){case 0:return[-s.w*.92,s.y0];case 1:return[s.w*.92,s.y0];
      case 2:return[wf,yf];case 3:return[wb,s.y1];case 4:return[s.wt,s.y2];
      case 5:return[-s.wt,s.y2];case 6:return[-wb,s.y1];default:return[-wf,yf];}};
  const quad=(p1,p2,p3,p4,za,zb,c)=>{
    pos.push(p1[0],p1[1],za, p4[0],p4[1],zb, p3[0],p3[1],zb,
             p1[0],p1[1],za, p3[0],p3[1],zb, p2[0],p2[1],za);
    for(let i=0;i<6;i++)col.push(c.r,c.g,c.b);};
  for(let i=0;i<st.length-1;i++){
    const a=st[i],b=st[i+1];
    const sideGlass=(a.glass||b.glass)?GLASS_COL:body;
    const topC=(a.top||b.top)?GLASS_COL:roof;
    const edges=[[0,1,dark],[1,2,shade],[2,3,body],[3,4,sideGlass],[4,5,topC],
                 [5,6,sideGlass],[6,7,body],[7,0,shade]];
    for(const[k1,k2,c]of edges)
      quad(P(a,k1),P(a,k2),P(b,k2),P(b,k1),a.z,b.z,c);}
  // caps (front & rear faces) as fans
  const cap=(s,rev,c)=>{
    for(let k=1;k<7;k++){
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
    if(split.glass){this.glassMesh=new THREE.Mesh(split.glass,MAT_GLASS);
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
        {geo:new THREE.BoxGeometry(.1,.08,.14),color:0xb5443c,x:hx*.4,y:by+hy*.18,z:zR-.1}];
      // 하드탑: 짐칸 슬랫 케이지가 훤히 비쳐 보이던 것을 불투명 캐노피 쉘로 밀폐
      // (랜드로버 디펜더식 컨트라스트 화이트 루프 + 다크 윈도우 스트립)
      if(spec.id==="offroadc"){
        const zMid=zR+(zF-zR)*.47,cz=(zR+.05+zMid)/2,cl=zMid-zR-.1;
        const yTop=topY*.99,yBot=topY*.4,ch=yTop-yBot,cy=(yTop+yBot)/2;
        acc.push({geo:new THREE.BoxGeometry(hx*1.66,ch,cl),color:0xe6eaee,y:cy,z:cz});
        for(const s of[-1,1])acc.push({geo:new THREE.BoxGeometry(.03,ch*.4,cl*.68),color:0x141920,x:s*hx*.84,y:cy+ch*.14,z:cz});
        acc.push({geo:new THREE.BoxGeometry(hx*1.2,ch*.4,.03),color:0x141920,y:cy+ch*.14,z:zR+.03});
        acc.push({geo:new THREE.BoxGeometry(hx*1.7,.05,cl+.08),color:0xdfe4e9,y:yTop+.02,z:cz});} // 루프 캡
      this.accMesh=new THREE.Mesh(mergeGeoms(acc),MAT_DETAIL);
      this.accMesh.castShadow=true;this.group.add(this.accMesh);
      // LED 라이트바 발광 렌즈(자체발광)
      this.ledMesh=new THREE.Mesh(new THREE.BoxGeometry(hx*1.42,.055,.05),
        new THREE.MeshBasicMaterial({color:0xfff3c6,toneMapped:false}));
      this.ledMesh.position.set(0,topY+.06,zF*.32+.06);
      this.group.add(this.ledMesh);}
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
  buildProcedural(spec,colorHex){
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
    for(const k in this.parts){
      const p=this.parts[k];
      if(this.detached[k])continue;
      deformGeo(p,imp.lp,imp.ln,d,R,.62);
      _vA.copy(imp.lp).sub(p.position);
      if(_vA.length()<R+.5){
        this.partHp[k]-=dv*.042*(k==="fb"||k==="rb"?1.6:(k==="ml"||k==="mr")?3:1);
        if(this.partHp[k]<=0&&veh.damageOn)this.detachPart(k,veh,imp);}}
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
    if(this._glassCracked){this._glassCracked=false;this.glassMesh.material=MAT_GLASS;}   // 유리 교체
    for(const k in this.parts){
      const p=this.parts[k];restoreGeo(p);this.partHp[k]=this.hp0[k];
      if(this.detached[k]){Fx.reclaimDebris(p);this.group.add(p);
        p.material.opacity=1;p.material.transparent=false;
        p.position.copy(p.userData.home);p.quaternion.identity();
        delete this.detached[k];}}
  }
  storeHomes(){for(const k in this.parts)this.parts[k].userData.home=this.parts[k].position.clone();}
  sync(veh,shakeT){
    this.group.position.copy(veh.body.pos);
    this.group.quaternion.copy(veh.body.quat);
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
      m.position.set(this.baked?(w.left?-tv:tv):w.local.x,w.visY+(this.wheelYOff||0),w.local.z);
      const st=(w.front?veh.steer:0)+(w.left?-veh.toe:veh.toe)*8;
      m.rotation.set(0,st,0);
      m.children[0].rotation.x=w.spin;}
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
