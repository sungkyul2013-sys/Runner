/* ============================================================
   Map definitions (6 built-in + custom loader)
   ============================================================ */
const S_ASP=SURF_ID.asphalt,S_GRS=SURF_ID.grass,S_SND=SURF_ID.sand,S_GRV=SURF_ID.gravel,
      S_ICE=SURF_ID.ice,S_SNW=SURF_ID.snow,S_CRB=SURF_ID.curb,S_WET=SURF_ID.wet,S_WLK=SURF_ID.walk;

const MAPS=[
/* ---------- 1. 프루빙 그라운드 ---------- */
{id:"proving",name:"프루빙 그라운드",icon:"🧪",desc:"초대형 뱅크드 오벌·가속로·충돌벽·압착기·서스펜션 랩(대형턱·급단차·뱅크·잔요철·자갈·젖은노면·오르막턱)·힐클라임·오프로드·램프·스키드패드·낙하타워·IIHS",
 modes:["free","crash","drift"],
 build(){
  const mb=new MapBuilder(1020,288),w=mb.world;
  const rough=(x,z)=>Math.hypot(x-250,z-250);          // 러프 오프로드 패치(남동)
  mb.fill((x,z)=>{
    // 초대형 뱅크드 오벌(남측): 직선 440m + 턴 반경 100m.
    // 뱅크는 조향이 필요한 턴에서만 높게(최대 7m, 설계속도 ~110km/h 무조향) — 직선은 1.2m
    if(z<-296){
      const sxo=clamp(x-60,-220,220);
      const dRing=Math.hypot(x-60-sxo,z+408)-100;
      if(Math.abs(dRing)<10.5){
        const t=(dRing+10.5)/21;
        const tf=clamp((Math.abs(x-60)-190)/70,0,1);   // 0 직선 → 1 턴
        return[t*t*(1.2+5.8*tf),S_ASP];}}
    const rd=rough(x,z);
    if(rd<105){
      let h=3.6*Math.sin(x*.055)*Math.cos(z*.05)+1.8*Math.sin(x*.12+1)*Math.cos(z*.1)
            +.9*Math.sin(x*.26)*Math.cos(z*.23);
      const e=clamp((105-rd)/22,0,1);
      return[h*e,rd<70?S_GRV:S_SND];}
    // 힐클라임 언덕(서측 공터) — 오르막/내리막 시험 (가속로·스키드패드와 이격)
    const hd=Math.hypot(x+325,z+30);
    if(hd<95){const e=clamp((95-hd)/95,0,1);
      return[24*e*e+2*Math.sin(x*.05)*Math.cos(z*.05)*e, hd<74?S_GRS:S_GRV];}
    // 서스 시험 오르막 레인(x≈334): 완만한 언덕 — 방지턱이 경사를 그대로 따라감
    if(x>320&&x<348&&z>-262&&z<-92){const t=(z+262)/170;return[6.5*Math.sin(Math.PI*t),S_ASP];}
    return[0,S_ASP];});
  // 힐클라임 등반 도로 (지형 따라 오르막→정상→내리막)
  {const hc=followTerrain(w,samplePath([[-250,10],[-300,-10],[-330,-30],[-360,-60],[-320,-70],[-280,-40]],false,100));
   mb.paintPath(hc,9,S_ASP,true,true);railAlong(mb,hc,9,0xb9c2cc);
   mb.texText(-325,30,5,"HILL CLIMB","rgba(240,244,250,.5)");}
  // perimeter grass ring
  const half=370;
  for(let j=0;j<=w.res;j++)for(let i=0;i<=w.res;i++){
    const x=i*w.cell-380,z=j*w.cell-380;
    if(Math.abs(x)>half-18||Math.abs(z)>half-18)w.setS(i,j,S_GRS);}
  // 가속로: 선명한 노면 마킹
  mb.texPath([{x:-140,z:-300},{x:-140,z:290}],14,"rgb(58,62,70)");
  mb.texPath([{x:-140,z:-300},{x:-140,z:286}],.35,"rgba(244,248,252,.95)",[3,3]);
  for(let z=-260;z<=260;z+=50)mb.texRect(-140,z,14,.8,0,"rgba(213,90,80,.9)");
  mb.texRect(-140,240,14,1.2,0,"rgba(120,220,160,.95)"); // 스피드 트랩 라인
  // crash walls (concrete + barrier) at end of strip
  mb.box(-140,2.2,300,26,4.4,3,0x9aa2ab,{mu:.6,bounce:.05,tag:"wall"});
  mb.box(-100,1,278,14,2,2,0xd8433b,{mu:.5,bounce:.3,tag:"barrier"});
  w.triggers=[{x:-140,z:240,r:10,type:"trap"}];
  // ramps 15/30/45
  mb.ramp(-30,40,0,15,16,10);mb.ramp(-8,40,0,30,12,10);mb.ramp(14,40,0,45,9,10);
  // 메가 키커 (대형 점프대) + 착지 램프
  mb.ramp(-8,96,0,28,22,12,0xd8433b);
  mb.ramp(-8,150,Math.PI,20,20,12,0xc7742f);
  // kick ramp (banked → flips)
  mb.box(-30,-0,120,10,1,9,0xc7742f,{pitch:-18*DEG,roll:14*DEG,mu:1,tag:"kick"});
  // 뱅크 하프파이프 벽 (월라이드)
  for(const s of[-1,1])
    mb.box(40,1.6,150,3,3.2,40,0x8f98a3,{yaw:0,roll:s*28*DEG,mu:.9,tag:"bank"});

  /* === 유압 압착기 (COMPACTOR) === */
  const cx=110,cz=-40;
  for(const s of[-1,1])mb.box(cx+s*6.4,4.2,cz,1.4,8.4,4.4,0x33383f,{tag:"pillar"}); // 기둥(간격 넓힘)
  mb.box(cx,8.6,cz,15,1.2,4.6,0x2b2f35,{tag:"frame"});                            // 상단 프레임
  mb.box(cx,.06,cz,11,.12,4.4,0x565b63,{mu:.95,tag:"anvil"});                     // 받침대(평평 → 차 진입 가능)
  mb.mover(cx,4.8,cz,10.4,1.6,4,0xb5443c,{mu:.95,tag:"crusher"},                  // 내려찍는 램(급강하 슬램)
    t=>{const T=4,ph=(t%T)/T;
      if(ph<.5)return 0;                        // 대기(위) 2s
      if(ph<.58)return -4*((ph-.5)/.08);        // 급강하 ~0.32s
      if(ph<.82)return -4;                      // 유지 ~1s(짓눌림)
      return -4*(1-(ph-.82)/.18);});            // 복귀
  mb.texRect(cx,cz,12,6,0,"rgba(230,180,40,.5)");
  mb.texText(cx,cz+5,3.4,"⚠ 압착기 CRUSHER","rgba(240,220,120,.9)");

  /* === 서스펜션 시험장 (5레인) === */
  const sz0=-260, SX=180;
  const lanes=[SX-42,SX-14,SX+14,SX+42,SX+70];
  // 1: 방지턱 종류별 (아치·라운드·테이블·샤프·럼블)
  [["arch",.12],["round",.16],["flat",.14],["sharp",.1],["rumble",.06]].forEach(([ty,h],k)=>{
    mb.bump(lanes[0],sz0+k*22,0,11,h,ty);
    mb.texText(lanes[0]-8,sz0+k*22-6,2.4,ty,"rgba(240,244,250,.55)");});
  // 2: 빨래판
  for(let k=0;k<18;k++)mb.box(lanes[1],.05,sz0+k*2,10,.1,.8,0x8f98a3,{mu:1,tag:"slat"});
  // 3: 모굴(지그재그)
  for(let k=0;k<12;k++)mb.bump(lanes[2]+((k%3)-1)*3.5,sz0+k*8,0,7,.14+(k%2)*.06);
  // 4: 트위스트
  for(let k=0;k<12;k++)mb.bump(lanes[3]+(k%2?-3:3),sz0+k*9,0,7,.16);
  // 5: 계단·연석
  for(let k=0;k<5;k++)mb.box(lanes[4],.1+k*.2,sz0+k*2.2,10,.2,2,0x9aa2ab,{mu:1,tag:"stair"});
  mb.box(lanes[4],.16,sz0+14,10,.32,1,0xb5443c,{mu:1,tag:"curb"});
  // 6: 대형 턱(35/45cm) + 짧고 날카로운 급단차
  [.35,.45].forEach((h,k)=>{mb.bump(278,sz0+14+k*30,0,11,h,"round");
    mb.texText(278-8,sz0+8+k*30,2.6,Math.round(h*100)+"cm");});
  mb.bump(278,sz0+74,0,11,.12,"sharp");mb.bump(278,sz0+86,0,11,.09,"sharp");
  // (6b) 기울어진 노면(뱅크 8°) — 좌우 교대, 낮은 진입단차 + 소프트 통과(plank)
  for(let k=0;k<3;k++)mb.box(278,.3,sz0+112+k*26,11,.16,22,0x8f98a3,{roll:(k%2?-1:1)*.14,mu:1,tag:"plank"});
  // 7: 불규칙 잔요철(랜덤 소형 턱 다수) + 오프로드 자갈면
  {let sd=97;const rr=()=>{sd=(sd*48271)%2147483647;return sd/2147483647;};
   mb.stamp(306,sz0+40,20,(i,j,d)=>w.setS(i,j,S_GRV));
   mb.stamp(306,sz0+80,20,(i,j,d)=>w.setS(i,j,S_GRV));
   for(let k=0;k<16;k++)
     mb.bump(306+(rr()-.5)*5,sz0+8+k*8+(rr()-.5)*3,(rr()-.5)*.6,7,.03+rr()*.06,rr()<.5?"round":"arch");}
  // (7b) 미끄러운 노면(젖음) 위 방지턱
  mb.stamp(306,sz0+150,17,(i,j,d)=>w.setS(i,j,SURF_ID.wet));
  mb.texCircle(306,sz0+150,16,SURF_CSS[SURF_ID.wet],.8);
  mb.bump(306,sz0+146,0,11,.14,"round");
  // 8: 오르막(터레인 경사) 위 방지턱 — 경사를 따라 기울어짐
  [.1,.16,.22].forEach((h,k)=>mb.bump(334,sz0+26+k*34,0,11,h,k%2?"round":"arch"));
  mb.texText(334,sz0-6,2.8,"UPHILL","rgba(240,244,250,.7)");
  mb.texText(SX+56,sz0-16,5,"SUSPENSION LAB","rgba(240,244,250,.6)");

  // slalom cones (지그재그)
  for(let k=0;k<10;k++)mb.prop("cone",-70+((k%2)*10-5),-60-k*20);
  // skidpad R30
  mb.texCircle(-250,-150,30,"rgba(244,248,252,.9)",.45);
  mb.texCircle(-250,-150,.7,"rgba(244,248,252,.9)");
  // 러프 오프로드: 바위 흩뿌리기
  {let sd=61;const rr=()=>{sd=(sd*48271)%2147483647;return sd/2147483647;};
   for(let k=0;k<20;k++){
     const a=rr()*6.28,rd=rr()*85,rx=250+Math.cos(a)*rd,rz=250+Math.sin(a)*rd,sc=1+rr()*2.6;
     mb.box(rx,w.height(rx,rz)+sc*.3,rz,sc*1.7,sc,sc*1.4,0x7a7169,{yaw:rr()*3,roll:(rr()-.5)*.4,mu:.85,tag:"rock"});}}
  mb.texText(250,250,7,"OFF-ROAD","rgba(210,190,150,.5)");
  // drop towers 10m & 20m with access ramps
  const tower=(x,z,h)=>{
    mb.box(x,h-.5,z,26,1,26,0x7f8791,{mu:1,tag:"tower"});
    const rl=h/Math.tan(22*DEG);
    mb.box(x,h*.5-.5,z-13-rl*.5+.2,12,1,rl/Math.cos(22*DEG),0x8f98a3,{pitch:-22*DEG,mu:1,tag:"ramp"});
    for(const s of[-1,1])mb.box(x+s*13.2,h+.6,z,.4,1.6,26,0xb9c2cc,{mu:.4,tag:"rail"});};
  tower(-250,130,10);tower(-300,250,20);
  /* === IIHS 충돌시험 배리어 라인업 (북측) === */
  const iihs=[[-40,14,"풀오버랩"],[30,4,"25% 스몰오버랩"],[85,.8,"폴 충돌"]];
  for(const[bx,bw,label]of iihs){
    mb.box(bx,2.4,320,bw,4.8,4,bw<1?0xb5443c:0x9aa2ab,{mu:.6,bounce:.02,tag:bw<1?"pole":"wall"});
    for(const s of[-1,1])mb.box(bx+ (bw/2+.6)*s,2.4,320,.4,4.8,4,0x33383f,{tag:"wall"}); // 노란 프레임 대용
    mb.texRect(bx,300,bw+2,26,0,"rgba(70,74,82,.9)");                                        // 접근로
    mb.texPath([{x:bx,z:270},{x:bx,z:314}],.3,"rgba(244,248,252,.9)",[3,3]);
    mb.texText(bx,296,2.6,label,"rgba(240,220,120,.85)");}
  mb.texText(30,262,4.2,"IIHS CRASH TEST","rgba(240,220,120,.7)");
  // barrels + trees
  for(let k=0;k<4;k++)mb.prop("barrel",-100+k*3,268);
  for(let k=0;k<8;k++)mb.baked(k%2?"trees":"treesTall",-350+k*95,352,11,k,{});
  w.spawn={x:-140,z:-290,yaw:0};
  // 뱅크드 오벌 센터라인 마킹(지형 뱅크와 정확히 일치하는 해석적 스타디움 경로)
  {const ovalPts=[];
   const arc=(cx2,a0,a1)=>{for(let k=0;k<=30;k++){const a=a0+(a1-a0)*k/30;
     ovalPts.push({x:cx2+Math.cos(a)*100,y:0,z:-408+Math.sin(a)*100});}};
   arc(280,-Math.PI/2,Math.PI/2);                        // 우측 턴(아래→위)
   for(let k=1;k<15;k++)ovalPts.push({x:280-k*29.3,y:0,z:-308});   // 상단 직선
   arc(-160,Math.PI/2,Math.PI*1.5);                      // 좌측 턴
   for(let k=1;k<15;k++)ovalPts.push({x:-160+k*29.3,y:0,z:-508});  // 하단 직선
   mb.texPath(ovalPts,.4,"rgba(244,248,252,.8)",[5,5]);
   mb.texText(60,-408,7,"BANKED OVAL","rgba(244,248,252,.5)");}
  // 잔요철 존(프루빙 접근로 2곳 — 실제 도로처럼)
  w.addRippleZone(-60,-120,42,.012,2.2,1);
  w.addRippleZone(-260,60,38,.016,2.9,2);
  // 📍 프루빙 그라운드 시설 이동
  w.places=[
    {name:"🏁 가속로 출발",x:-140,z:-290,yaw:0},
    {name:"🏟️ 뱅크드 오벌",x:60,z:-308,yaw:Math.PI/2},
    {name:"💥 충돌벽",x:-140,z:250,yaw:0},
    {name:"🗜️ 압착기",x:110,z:-58,yaw:0},
    {name:"🔩 서스펜션 시험장",x:180,z:-282,yaw:0},
    {name:"⛰️ 힐클라임 오르막",x:-250,z:12,yaw:Math.PI},
    {name:"🏔️ 러프 오프로드",x:250,z:250,yaw:0},
    {name:"🛞 스키드패드",x:-250,z:-150,yaw:0},
    {name:"🎢 램프·점프대",x:-8,z:20,yaw:0},
    {name:"🗼 낙하 타워",x:-300,z:230,yaw:0},
    {name:"🚧 IIHS 충돌시험",x:30,z:270,yaw:0}];
  return mb.finalize(this);}},

/* ---------- 2. 네오시티 ---------- */
{id:"city",name:"네오시티",icon:"🏙️",desc:"대형 시가지 — 다운타운 마천루·골목·고가도로·로터리·공원·스타디움·요철 구간",
 modes:["free","time","race","drift"],
 build(){
  const mb=new MapBuilder(840,256),w=mb.world;
  // 잔요철 존(도로 일부에만, 패턴 3종 — 실제 노후 도로처럼)
  w.addRippleZone(0,64,40,.012,2.3,1);
  w.addRippleZone(96,-30,34,.018,2.8,2);
  w.addRippleZone(-96,-64,38,.014,1.0,3);
  w.addRippleZone(-96,-180,36,.013,2.0,3);   // 시작(스폰) 구간: 완만한 꿀렁임 조금
  const pitch=96,half=396;
  mb.fill((x,z)=>{
    // roads on grid lines every 96m, width 16
    const rx=Math.abs(((x%pitch)+pitch*1.5)%pitch-pitch*.5),rz=Math.abs(((z%pitch)+pitch*1.5)%pitch-pitch*.5);
    const road=rx<8||rz<8;
    const walk=!road&&(rx<11||rz<11);
    if(Math.abs(x)>half||Math.abs(z)>half)return[0,S_GRS];
    return[0,road?S_ASP:walk?S_WLK:S_GRS];});
  // 차선 (도로 중앙 점선)
  for(let j=0;j<=w.res;j++)for(let i=0;i<=w.res;i++){
    const x=i*w.cell-w.size*.5,z=j*w.cell-w.size*.5;
    if(Math.abs(x)>half||Math.abs(z)>half)continue;
    if(w.sMap[w.idx(i,j)]!==S_ASP)continue;
    const rx=Math.abs(((x%pitch)+pitch*1.5)%pitch-pitch*.5),rz=Math.abs(((z%pitch)+pitch*1.5)%pitch-pitch*.5);
    if((rx<.9&&((z%9+9)%9)<4&&rz>10)||(rz<.9&&((x%9+9)%9)<4&&rx>10))w.setS(i,j,SURF_ID.lane);}
  // roundabout at center + 분수
  mb.stamp(0,0,22,(i,j,d)=>{w.setS(i,j,S_ASP);});
  mb.stamp(0,0,9,(i,j,d)=>{w.setS(i,j,S_WLK);});
  mb.baked("fountain",0,0,15,0,{y:0,collide:true,shrink:.75});
  // 선명한 도로/보도/차선 (벡터)
  for(let k=-4;k<=4;k++){
    mb.texPath([{x:-half,z:k*pitch},{x:half,z:k*pitch}],22,SURF_CSS[S_WLK]);
    mb.texPath([{x:k*pitch,z:-half},{x:k*pitch,z:half}],22,SURF_CSS[S_WLK]);}
  for(let k=-4;k<=4;k++){
    mb.texPath([{x:-half,z:k*pitch},{x:half,z:k*pitch}],16,SURF_CSS[S_ASP]);
    mb.texPath([{x:k*pitch,z:-half},{x:k*pitch,z:half}],16,SURF_CSS[S_ASP]);}
  for(let k=-4;k<=4;k++){
    mb.texPath([{x:-half,z:k*pitch},{x:half,z:k*pitch}],.32,"rgba(242,246,252,.9)",[4.5,4.5]);
    mb.texPath([{x:k*pitch,z:-half},{x:k*pitch,z:half}],.32,"rgba(242,246,252,.9)",[4.5,4.5]);}
  mb.texCircle(0,0,22,SURF_CSS[S_ASP]);
  mb.texCircle(0,0,9,SURF_CSS[S_WLK]);
  mb.texCircle(0,0,15.5,"rgba(242,246,252,.8)",.35);
  // 베이크 건물 (Kenney City Builder Kit)
  let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const BLD=["bldA","bldB","bldC","bldD","garage"];
  for(let bx=-3.5;bx<=3.5;bx++)for(let bz=-3.5;bz<=3.5;bz++){
    if(Math.abs(bx)<1&&Math.abs(bz)<1)continue;
    if(bx===1.5&&bz===1.5)continue;    // 공원 블록
    if(bx===-1.5&&bz===1.5)continue;   // 스타디움 블록
    const cx=bx*pitch,cz=bz*pitch;
    const downtown=Math.abs(bx)<=1.5&&Math.abs(bz)<=1.5;   // 다운타운 = 마천루
    const n=1+((rnd()*2)|0);
    for(let k=0;k<n;k++){
      if(downtown){
        // 마천루 = 경량 톨 박스 (스카이라인, 성능 최적화)
        const w2=15+rnd()*9,H=28+rnd()*48;
        const ox=cx+(rnd()-.5)*(58-w2),oz=cz+(rnd()-.5)*(58-w2);
        const col=[0x39424e,0x4a5460,0x2e3742,0x5b6673][(rnd()*4)|0];
        mb.box(ox,H*.5,oz,w2,H,w2,col,{mu:.5,tag:"tower"});
        // 옥상 디테일
        mb.box(ox,H+1.2,oz,w2*.4,2.4,w2*.4,0x6b7683,{mu:.5,tag:"tower"});
      }else{
        const nm=BLD[(rnd()*5)|0];
        const sc=22+rnd()*14;
        const ox=cx+(rnd()-.5)*(66-sc),oz=cz+(rnd()-.5)*(66-sc);
        mb.baked(nm,ox,oz,sc,((rnd()*4)|0)*Math.PI/2,{y:0,collide:true,shrink:.92});}}
    // 블록 코너 가로수
    if(rnd()<.6)mb.baked(rnd()<.5?"trees":"treesTall",cx+30,cz+30,11+rnd()*4,rnd()*6,{y:0});}
  // overpass across x axis (z=~ -96 row): ramps + elevated deck
  const oy=7;
  mb.box(-40,oy-.5,-96,160,1,14,0x69707c,{mu:1,tag:"deck"});
  const rl=oy/Math.tan(9*DEG);
  mb.box(-120-rl*.5+.1,oy*.5-.5,-96,rl/Math.cos(9*DEG),1,14,0x7d8591,{roll:9*DEG,mu:1,tag:"ramp"});
  mb.box(40+rl*.5-.1,oy*.5-.5,-96,rl/Math.cos(9*DEG),1,14,0x7d8591,{roll:-9*DEG,mu:1,tag:"ramp"});
  for(const s of[-1,1])mb.box(-40,oy+.5,-96+s*7.2,160,1.2,.4,0xb9c2cc,{mu:.4,tag:"rail"});
  // props along roads
  for(let k=-2;k<=2;k++){
    mb.prop("lamp",12,k*pitch+30,Math.PI);mb.prop("lamp",-12,k*pitch-30,0);
    mb.prop("sign",k*pitch+12,12,0);mb.prop("bench",k*pitch-14,-14,Math.PI/2);}
  // 과속방지턱: 로터리 진입로 4곳(대형 16cm) + 스쿨존 2곳(대형 20cm)
  mb.bump(34,0,Math.PI/2,14,.16);mb.bump(-34,0,Math.PI/2,14,.16);
  mb.bump(0,34,0,14,.16);mb.bump(0,-34,0,14,.16);
  mb.bump(96,44,0,14,.2);mb.bump(96,-44,0,14,.2);
  mb.bump(-52,-96,Math.PI/2,14,.2);mb.bump(52,-96,Math.PI/2,14,.2);
  // 도심 공원 블록 (144,144): 잔디·연못·가로수
  mb.stamp(144,144,34,(i,j,d)=>w.setS(i,j,d<15?SURF_ID.wet:S_GRS));
  mb.texCircle(144,144,15,SURF_CSS[SURF_ID.wet]);
  for(let k=0;k<10;k++)mb.baked(k%2?"trees":"treesTall",144+Math.cos(k*.9)*26,144+Math.sin(k*.9)*26,11+ (k%3)*3,k,{});
  for(let k=0;k<4;k++)mb.prop("bench",144+Math.cos(k*1.6)*19,144+Math.sin(k*1.6)*19,k*1.6);
  // 소형 스타디움 블록 (-144,144): 관중석 링 + 필드
  {const sx=-144,sz=144;
   mb.stamp(sx,sz,32,(i,j,d)=>w.setS(i,j,d<20?S_GRS:S_WLK));
   for(let a=0;a<Math.PI*2;a+=Math.PI/10){
     const rx=sx+Math.cos(a)*27,rz=sz+Math.sin(a)*27;
     mb.box(rx,2,rz,7,4,7,0x39424e,{yaw:-a,mu:.5,tag:"stand"});}}
  // city loop route (time attack / race)
  const loop=samplePath([[-96,-192],[96,-192],[192,-96],[192,96],[96,192],[-96,192],[-192,96],[-192,-96]],true,160);
  w.checkpoints=pathCheckpoints(loop,20,15);
  w.waypoints=pathWaypoints(loop,true,32);
  w.spawn={x:-96,z:-192,yaw:Math.PI/2};
  mb.paintLanes();
  return mb.finalize(this);}},

/* ---------- 3. 미시령 와인딩 ---------- */
{id:"mountain",name:"미시령 와인딩",icon:"⛰️",desc:"헤어핀 7개 다운힐 + 정상까지 이어지는 완전 오프로드 자갈 트레일",
 modes:["free","time"],
 build(){
  const mb=new MapBuilder(760,224),w=mb.world;
  // base mountain: high at -x,-z corner
  mb.fill((x,z)=>{
    const d=Math.hypot(x+380,z+380)/760;
    let h=200*clamp(1-d,0,1);
    h+=8*Math.sin(x*.02)*Math.cos(z*.023)+4*Math.sin(x*.07+1)*Math.sin(z*.06);
    return[h,S_GRS];});
  // switchback road: 완만한 스위핑 헤어핀 다운힐(급커브 완화) — 넓은 코리도어 정지작업으로
  // 산 사면을 확실히 절개해 도로가 막히지 않게(가드레일·지형벽에 길 막힘 방지)
  const road=followTerrain(w,samplePath([[-300,-320],[-70,-300],[130,-210],[10,-70],
              [-210,-10],[-70,140],[150,230],[340,340]],false,420));
  flattenCorridor(mb,road,9,20);   // 지형을 따르는 도로를 넓게 사면 절개(길 막힘 방지)
  mb.paintPath(road,13,S_ASP,true,true);
  railAlong(mb,road,13,0xc7ccd4);
  {let sd=23;const rr=()=>{sd=(sd*48271)%2147483647;return sd/2147483647;};
   for(let k=0;k<40;k++){
     const p=road[(rr()*road.length)|0];
     const off=18+rr()*48,ang=rr()*Math.PI*2;
     const tx=p.x+Math.cos(ang)*off,tz=p.z+Math.sin(ang)*off;
     if(w.surf(tx,tz)===S_GRS)mb.baked("treesTall",tx,tz,9+rr()*5,rr()*6,{});}
  }
  // 완전 오프로드 트레일: 자갈 산길 — 포장로 중턱에서 갈라져 능선을 타고 정상까지
  {const trail=followTerrain(w,samplePath([[-60,-60],[-150,-120],[-240,-200],[-310,-280],[-350,-340],[-300,-300],[-250,-250]],false,220));
   mb.paintPath(trail,7,S_GRV,true,true);
   mb.texText(-150,-120,4,"OFFROAD TRAIL","rgba(210,190,150,.7)");}
  // 터널 (직선 구간을 덮는 갱도) — 도로에서 넉넉히 떨어진 벽(±10) + 높은 지붕(길 막힘 방지)
  {const ti=Math.floor(road.length*.30),tj=Math.floor(road.length*.40);   // 3번째 스트레이트(완만)
   for(let i=ti;i<tj;i+=3){
     const a=road[i],b=road[Math.min(i+3,road.length-1)];
     const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1,yaw=Math.atan2(dx,dz);
     const nx=dz/l,nz=-dx/l,y=w.height(a.x,a.z);
     for(const s of[-1,1])mb.box(a.x+nx*s*10,y+2.6,a.z+nz*s*10,1.2,5.4,l+1,0x565049,{yaw,mu:.7,tag:"tunnelwall"});
     mb.box(a.x,y+5.6,a.z,21,1,l+1,0x4a453f,{yaw,mu:.7,tag:"tunnelroof"});}}
  // 전망대 플랫폼 (계곡 조망)
  {const p=road[Math.floor(road.length*.3)];
   const nx=1,ox=p.x+16,oz=p.z+16,oy=w.height(ox,oz);
   mb.box(ox,oy+.4,oz,20,.8,16,0x8a837a,{mu:.9,tag:"overlook"});
   for(const s of[-1,1])mb.box(ox+s*9.6,oy+1.3,oz,.4,1.4,16,0xb9c2cc,{mu:.4,tag:"rail"});
   mb.box(ox,oy+1.3,oz+7.6,20,1.4,.4,0xb9c2cc,{mu:.4,tag:"rail"});}
  mb.paintLanes();
  w.checkpoints=pathCheckpoints(road,42,15);
  w.waypoints=pathWaypoints(road,false,30);
  w.spawn={x:road[2].x,z:road[2].z,yaw:Math.atan2(road[6].x-road[2].x,road[6].z-road[2].z)};
  w.route="sprint";
  return mb.finalize(this);}},

/* ---------- 4. 황야 ---------- */
{id:"dunes",name:"황야",icon:"🏜️",desc:"1.7km² 오프로드 — 모래언덕·바위밭·점프 절벽·마른 강바닥·등반 가능한 산(62m)",
 modes:["free","drift"],
 build(){
  const mb=new MapBuilder(1300,256),w=mb.world;
  mb.fill((x,z)=>{
    let h=6*Math.sin(x*.027)*Math.cos(z*.031)+3.5*Math.sin(x*.071+2)*Math.cos(z*.057+1)+1.5*Math.sin(x*.15)*Math.cos(z*.13);
    // 등반 가능한 사막 산(북서): 완만한 콘 — 오프로드 차로 정상까지
    const md=Math.hypot(x+400,z-340);
    if(md<260){const e2=Math.exp(-md*md/36000);h+=62*e2;
      if(md<90)return[h,S_GRV];}
    // plateau with jump cliff on east side
    const p=clamp((x-160)/60,0,1);h+=16*p*p*(3-2*p);
    // dry riverbed winding north-south
    const rb=Math.abs(x+180+60*Math.sin(z*.012));
    if(rb<26)h-=4*(1-rb/26);
    let s=S_SND;
    if(rb<20)s=S_GRV;
    if(p>.6)s=S_GRV;
    return[h,s];});
  // rocks
  let seed=3;const rnd=()=>{seed=(seed*48271)%2147483647;return seed/2147483647;};
  for(let k=0;k<26;k++){
    const x=(rnd()-.5)*860,z=(rnd()-.5)*860;
    const sc=1.2+rnd()*3;
    mb.box(x,w.height(x,z)+sc*.32,z,sc*2,sc,sc*1.6,0x7a7169,{yaw:rnd()*3,roll:(rnd()-.5)*.4,mu:.8,tag:"rock"});}
  // desert ramp + barrels
  mb.ramp(120,0,Math.PI/2,20,14,12,0xa08055);
  // 메가 점프대 (플래토 절벽에서 도약)
  mb.ramp(150,-120,Math.PI,26,24,16,0xb5824e);
  mb.ramp(150,140,0,22,22,16,0xb5824e);
  // 오아시스 (북서): 물웅덩이 + 야자수 군락
  mb.stamp(-260,240,40,(i,j,d)=>{if(d<20)w.setS(i,j,S_WET);else if(d<30)w.setS(i,j,S_GRS);});
  mb.texCircle(-260,240,20,SURF_CSS[S_WET]);
  for(let k=0;k<8;k++)mb.baked("treesTall",-260+Math.cos(k*.8)*26,240+Math.sin(k*.8)*26,10+ (k%3)*3,k,{});
  // 바위 아치 (통과형 게이트)
  for(const[ax,az]of[[-60,-140],[40,180],[-160,40]]){
    for(const s of[-1,1])mb.box(ax+s*5,w.height(ax,az)+3.5,az,3,8,3.5,0x6f645a,{mu:.85,tag:"rock"});
    mb.box(ax,w.height(ax,az)+7.4,az,13,3,3.5,0x6f645a,{mu:.85,tag:"rock"});}
  // 모래 와시(whoops) 연속 둔덕
  for(let k=0;k<12;k++)mb.bump(-380+k*7,-80,Math.PI/2,12,.22+ (k%2)*.1);
  for(let k=0;k<5;k++)mb.prop("barrel",-40+k*4,60);
  w.spawn={x:-300,z:-300,yaw:Math.PI/4};
  return mb.finalize(this);}},

/* ---------- 4.5 극한 오프로드 ---------- */
{id:"extreme",name:"극한 오프로드",icon:"🪨",desc:"롱트래블 전용 캐년 — 후프스·록가든·진흙 늪·러트·V도랑·바위계단·36° 힐클라임·테라스 산·협곡·사구·북부 능선까지 복합 지형",
 modes:["free"],
 build(){
  const mb=new MapBuilder(820,256),w=mb.world;
  const HX=250,HZ=-40;                                  // 힐클라임 산 중심
  mb.fill((x,z)=>{
    // 거친 황무지 기본 굴곡(더 극한 — 큰 물결·중간 요철·잔물결 증폭) — 전 구간이 살아있는 지형
    let h=3.6*Math.sin(x*.024)*Math.cos(z*.021)+1.9*Math.sin(x*.061+1)*Math.cos(z*.054+2)
         +.95*Math.sin(x*.11+3)*Math.cos(z*.09+1)+.5*Math.sin(x*.19+2)*Math.cos(z*.17);
    let s=S_GRV;
    // 동쪽 힐클라임 산: 더 가파른 사면(슬로프 0.8≈39°) + 평탄한 정상 크롤링 능선(정상 40m)
    const hd=Math.hypot(x-HX,z-HZ);
    if(hd<160)h+=Math.min(40,(160-hd)*.8);
    // 남서쪽 제2 산: 테라스(계단식 단차) — 단을 하나씩 기어오르는 코스 (정상 22m)
    const td=Math.hypot(x+250,z-240);
    if(td<130){const raw=Math.min(22,(130-td)*.34);
      h+=Math.floor(raw/3.2)*3.2+Math.min(1,(raw%3.2))*3.2*.5;}    // 3.2m 단 + 완만한 립
    // 북쪽 능선 체인: 낮은 산줄기 3봉(넘나드는 새들 구간)
    if(z<-160){const rd=Math.abs(z+270);
      h+=Math.max(0,14-rd*.14)*(1+.4*Math.sin(x*.02));}
    // 중부 협곡(캐년): 동서로 가르는 골짜기 — 절벽 벽 사이 바닥길
    const cy=Math.abs(z-92+16*Math.sin(x*.014));
    if(cy<26&&x>-200&&x<170&&hd>150){h-=Math.min(7,(26-cy)*.55);if(cy<18)s=S_GRV;}
    // 남동쪽 사구 파도: 모래 언덕 물결
    if(x>60&&z>170){const dn=Math.min((x-60)/60,1)*Math.min((z-170)/60,1);
      h+=dn*(3.2*Math.sin(x*.05+1)*Math.cos(z*.04)+2);s=dn>.4?S_SND:s;}
    // V도랑(남북으로 굽이침, 깊이 4m): 크로스액슬 — 한쪽 바퀴씩 걸치는 코스
    const vd=Math.abs(x+16+14*Math.sin(z*.02));
    if(vd<9&&Math.abs(z)<230&&hd>160)h-=(9-vd)*.46;
    // 진흙 늪(저지대 웅덩이 2곳): 초저마찰 + 함몰
    for(const[mx,mz,mr]of[[-120,170,44],[-60,258,32]]){
      const md=Math.hypot(x-mx,z-mz);
      if(md<mr){h-=1.3*(1-md/mr);if(md<mr*.82)s=S_WET;}}
    if(x<-330&&z<100)s=S_SND;                           // 서쪽 모래 협곡
    return[h,s];});
  // ① 후프스 필드(서쪽): 연속 대형 둔덕 22개 — 더 크고 깊게(롱트래블 서스 한계)
  for(let k=0;k<22;k++)
    mb.bump(-290,-210+k*9,Math.PI/2,15,.42+(k%3)*.13,k%2?"round":"arch");
  mb.texText(-290,-234,5,"WHOOPS","rgba(220,200,160,.8)");
  // ①-b 대형 테이블탑 점프 + 착지 경사(서중부) — 공중 점프 구간
  mb.ramp(-150,-80,0,26,20,16,0x8a7b5a);
  mb.ramp(-150,-8,Math.PI,24,18,14,0x7a6a4a);
  mb.texText(-150,-44,6,"BIG JUMP","rgba(240,230,200,.8)");
  // ② 록가든(중서부): 랜덤 바위 60개 — 저속 크롤링
  {let sd=77;const rr=()=>{sd=(sd*48271)%2147483647;return sd/2147483647;};
   for(let k=0;k<60;k++){
     const x=-190+(rr()-.5)*70,z=-160+rr()*260;
     mb.box(x,w.height(x,z)+.12+rr()*.2,z,1.2+rr()*2.4,.3+rr()*.6,1+rr()*2,0x77706a,
       {yaw:rr()*3,roll:(rr()-.5)*.5,pitch:(rr()-.5)*.3,mu:.9,tag:"rock"});}
   mb.texText(-190,-184,5,"ROCK GARDEN","rgba(200,200,205,.8)");
   // 정상 능선 볼더 필드(크롤링)
   for(let k=0;k<16;k++){
     const a=rr()*Math.PI*2,d=20+rr()*38;
     const x=HX+Math.cos(a)*d,z=HZ+Math.sin(a)*d;
     mb.box(x,w.height(x,z)+.15,z,1.5+rr()*2,.4+rr()*.5,1.4+rr()*1.6,0x6f6862,
       {yaw:rr()*3,roll:(rr()-.5)*.4,mu:.9,tag:"rock"});}}
  // ③ 워시보드 러트(빨래판 흙길): 리플존 강하게 — 트레일 중간 3곳
  w.addRippleZone(60,120,46,.055,1.6,2);
  w.addRippleZone(-60,-260,42,.045,1.9,2);
  w.addRippleZone(120,-180,40,.05,1.2,3);
  // ④ 바위 계단(힐클라임 남쪽 사면 진입로): 단차 5단 → 턱턱 치고 오르기
  for(let k=0;k<5;k++){
    const x=HX-150+k*6,z=HZ+96;
    mb.box(x,w.height(x,z)+.18,z,6,.36,10,0x8a8178,{mu:1,tag:"stair"});}
  mb.texText(HX-140,HZ+116,5,"ROCK STEPS","rgba(200,200,205,.8)");
  // ⑤ 시소 통나무 브리지(V도랑 위)
  mb.box(-16,w.height(-16,40)+.5,40,10,.5,3.2,0x9a7b4f,{mu:1,tag:"plank"});
  // 진흙 늪 시각화
  mb.texCircle(-120,170,36,"rgba(72,58,38,.85)");
  mb.texCircle(-60,258,26,"rgba(72,58,38,.85)");
  mb.texText(-120,170,5,"MUD BOG","rgba(240,230,200,.75)");
  // 메인 트레일: 전 구간을 잇는 자갈길 (스폰→후프스→록가든→진흙→V도랑→계단→정상)
  {const trail=followTerrain(w,samplePath([[-300,-300],[-290,-120],[-290,40],[-190,120],[-120,170],
     [-16,120],[-16,-40],[60,-120],[120,-180],[HX-150,HZ+96],[HX-60,HZ+40],[HX,HZ]],false,360));
   mb.paintPath(trail,8,S_GRV,true,true);}
  // 장식: 마른 나무·배럴·콘
  {let sd=91;const rr=()=>{sd=(sd*48271)%2147483647;return sd/2147483647;};
   for(let k=0;k<14;k++){
     const x=(rr()-.5)*700,z=(rr()-.5)*700;
     if(Math.hypot(x-HX,z-HZ)>170)mb.baked(k%2?"trees":"treesTall",x,z,7+rr()*5,rr()*6,{});}}
  for(let k=0;k<4;k++)mb.prop("barrel",-260+k*5,-240);
  mb.texText(0,-330,7,"EXTREME OFFROAD","rgba(240,244,250,.85)");
  w.spawn={x:-300,z:-320,yaw:0};
  // 협곡 림·테라스 단 위 볼더 + 사구 깃발 배럴
  {let sd=57;const rr=()=>{sd=(sd*48271)%2147483647;return sd/2147483647;};
   for(let k=0;k<22;k++){
     const x=-180+rr()*330,z=92+16*Math.sin(x*.014)+(rr()<.5?-30:30)+(rr()-.5)*8;
     mb.box(x,w.height(x,z)+.2,z,1.2+rr()*2,.4+rr()*.6,1+rr()*1.8,0x6f6862,
       {yaw:rr()*3,roll:(rr()-.5)*.4,mu:.9,tag:"rock"});}
   for(let k=0;k<12;k++){
     const a=rr()*6.28,d=40+rr()*80,x=-250+Math.cos(a)*d,z=240+Math.sin(a)*d;
     mb.box(x,w.height(x,z)+.25,z,1.4+rr()*2.2,.5+rr()*.7,1.2+rr()*2,0x77706a,
       {yaw:rr()*3,roll:(rr()-.5)*.5,mu:.9,tag:"rock"});}}
  for(let k=0;k<4;k++)mb.prop("barrel",130+k*18,230);
  mb.texText(-250,240,6,"TERRACE MT","rgba(220,210,190,.7)");
  mb.texText(0,92,5,"CANYON","rgba(200,200,205,.7)");
  mb.texText(150,240,5,"DUNES","rgba(230,215,170,.75)");
  w.places=[
    {name:"🌊 후프스 필드",x:-290,z:-220,yaw:0},
    {name:"🪨 록가든",x:-190,z:-170,yaw:0},
    {name:"🟤 진흙 늪",x:-120,z:120,yaw:.6},
    {name:"↯ V도랑 크로스액슬",x:-16,z:-200,yaw:0},
    {name:"🧗 바위계단·힐클라임",x:HX-190,z:HZ+96,yaw:Math.PI/2},
    {name:"⛰️ 정상 능선",x:HX,z:HZ-60,yaw:Math.PI},
    {name:"🏔️ 테라스 산(계단식)",x:-250,z:120,yaw:Math.PI},
    {name:"🏜️ 사구 파도",x:120,z:210,yaw:.8},
    {name:"🏞️ 협곡 바닥길",x:-160,z:92,yaw:Math.PI/2},
    {name:"⛰️ 북부 능선 새들",x:0,z:-270,yaw:Math.PI/2}];
  return mb.finalize(this);}},

/* ---------- 5. 빙판 호수 ---------- */
{id:"ice",name:"빙판 호수",icon:"❄️",desc:"μ0.15 초저마찰 — 드리프트 서클과 눈벽 안전지대",
 modes:["free","drift"],
 build(){
  const mb=new MapBuilder(520,192),w=mb.world;
  mb.fill((x,z)=>{
    const d=Math.hypot(x,z);
    if(d<170)return[0,S_ICE];
    if(d<225)return[.3+(d-170)*.02,S_SNW];
    return[2+(d-225)*.06,S_SNW];});
  // drift circles (선명한 링)
  mb.texCircle(0,0,35,"rgba(213,85,75,.85)",1.1);
  mb.texCircle(0,0,80,"rgba(213,85,75,.7)",1.1);
  mb.texCircle(0,0,1.2,"rgba(213,85,75,.9)");
  // snow wall ring
  for(let a=0;a<Math.PI*2;a+=Math.PI/26){
    const x=Math.cos(a)*205,z=Math.sin(a)*205;
    mb.box(x,w.height(x,z)+.9,z,4,1.8,22,0xf0f4f8,{yaw:-a,mu:.3,bounce:.35,tag:"snow"});}
  // 얼음 모굴 필드 (저마찰 위 둔덕 → 예측불가 점프)
  for(let k=0;k<14;k++){
    const a=k*1.3,r=95+ (k%3)*22;
    mb.bump(Math.cos(a)*r,Math.sin(a)*r,a,9,.16+ (k%2)*.08);}
  // 압력 능선 (갈라진 얼음판 융기)
  for(let k=0;k<7;k++)
    mb.box(-120+k*40,.12,-30+ (k%2?18:-18),3,.24,26,0xdfe9f2,{yaw:.3*(k%2?1:-1),mu:.16,tag:"ridge"});
  // 얼음 점프 램프 → 눈벽 착지
  mb.ramp(0,60,0,16,18,12,0xdce8f2);
  // 콘 슬라럼 (드리프트 라인)
  for(let k=0;k<10;k++)mb.prop("cone",((k%2)*16-8),-90+k*16);
  for(let k=0;k<6;k++)mb.prop("cone",Math.cos(k)*35,Math.sin(k)*35);
  w.spawn={x:0,z:-120,yaw:0};
  return mb.finalize(this);}},

/* ---------- 6. 선셋 레이스웨이 ---------- */
{id:"raceway",name:"선셋 인터내셔널",icon:"🏁",desc:"4.6km 15코너 국제 서킷 — 고저차 언덕·크레스트·시케인·헤어핀·피트레인·그랜드스탠드·소시지커브",
 modes:["free","time","race","drift"],
 build(){
  const mb=new MapBuilder(920,256),w=mb.world;
  // 고저차 있는 지형(트랙 고도와 대략 맞춰 완만한 둔덕/저지)
  mb.fill((x,z)=>{
    let h=1.2*Math.sin(x*.009)*Math.cos(z*.011);
    h+=10*Math.exp(-(Math.hypot(x-360,z+30)**2)/38000);   // 동측 언덕(트랙 크레스트)
    h-=4*Math.exp(-(Math.hypot(x+120,z-330)**2)/26000);    // 백스트레이트 저지
    return[h,S_GRS];});
  // 국제 서킷 레이아웃 — 스윕·크레스트·시케인·헤어핀(3요소 [x,z,고도])
  const ctrl=[[-340,-260,0],[-40,-320,1],[190,-315,4],[340,-210,9],[400,-40,13],  // T1~T4 업힐·크레스트
              [345,120,7],[385,255,2],[240,340,0],[70,300,0],[15,352,0],           // 다운힐 스윕·시케인
              [-95,300,1],[-255,345,3],[-390,205,6],[-360,15,4],[-400,-165,1]];    // 백섹션·업힐 헤어핀
  const road=samplePath(ctrl,true,600);   // 설계 고도(ctrl 3번째 값) 사용 — 고저차 서킷
  flattenCorridor(mb,road,10,22);          // 지형을 트랙 고도에 맞춰 넓게 정지(둔덕/절개)
  mb.paintPath(road,16,S_ASP,true,true);
  // 트랙 가장자리 흰 라인
  {const off=(pts,o)=>pts.map((p,i)=>{const q=pts[(i+1)%pts.length];
     const dx=q.x-p.x,dz=q.z-p.z,l=Math.hypot(dx,dz)||1;return{x:p.x+dz/l*o,z:p.z-dx/l*o};});
   mb.texPath(off(road,7.4),.35,"rgba(244,248,252,.9)");mb.texPath(off(road,-7.4),.35,"rgba(244,248,252,.9)");}
  // 코너 커브(홍백 커빙) + 소시지 커브(연석 둔덕) — 곡률 큰 지점
  for(let i=2;i<road.length-2;i+=2){
    const a=road[i-2],b=road[i],c=road[i+2];
    const ang=Math.abs(Math.atan2(c.x-b.x,c.z-b.z)-Math.atan2(b.x-a.x,b.z-a.z));
    if(ang>.05&&ang<3){
      const dx=c.x-a.x,dz=c.z-a.z,l=Math.hypot(dx,dz)||1,nx=dz/l,nz=-dx/l;
      const turnR=(a.x*c.z-a.z*c.x)>0?1:-1;                 // 안쪽 방향 근사
      for(const s of[-1,1]){                                 // 홍백 커빙 텍스처(양측)
        const cx=b.x+nx*s*8.4,cz=b.z+nz*s*8.4;
        mb.stamp(cx,cz,1.6,(ii,jj)=>w.setS(ii,jj,S_CRB));}
      if(ang>.14){                                           // 급코너: 안쪽 apex에 소시지 커브
        const cx=b.x+nx*turnR*8.8,cz=b.z+nz*turnR*8.8;
        mb.bump(cx,cz,Math.atan2(dx,dz),3.2,.12,"round");}}}
  // 하드 코너 타이어월(런오프 안쪽)
  for(let i=0;i<road.length-4;i+=6){
    const a=road[i],b=road[i+4],mid=road[i+2];
    const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1,yaw=Math.atan2(dx,dz);
    const nx3=road[(i+8)%road.length].x-b.x,nz3=road[(i+8)%road.length].z-b.z;
    const cv=Math.abs(Math.atan2(nx3,nz3)-yaw);
    if(cv>.28&&cv<3)for(const s of[-1,1])
      mb.box(mid.x+dz/l*s*17,w.height(mid.x+dz/l*s*17,mid.z-dx/l*s*17)+.5,mid.z-dx/l*s*17,
        1.2,1,7,s>0?0xd8433b:0xe8e8e8,{yaw,mu:.6,bounce:.3,tag:"tirewall"});}
  // 패스트 코너 그래블 런오프(T3/T4 바깥)
  for(const[gx,gz]of[[380,-150],[430,-20],[300,180]])
    mb.stamp(gx,gz,26,(ii,jj,d)=>{if(d<24)w.setS(ii,jj,SURF_ID.gravel);});
  // 🏁 피트레인(스타트 스트레이트 안쪽 병렬 레인) + 피트박스 + 피트월
  {const a=road[0],b=road[8];const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1,nx=dz/l,nz=-dx/l;
   const pit=[];for(let k=0;k<=10;k++){const t=k/10;pit.push({x:lerp(a.x,b.x,t)+nx*20,y:0,z:lerp(a.z,b.z,t)+nz*20});}
   mb.paintPath(pit,9,S_ASP,true);
   for(let k=0;k<6;k++){const t=k/6,px=lerp(a.x,b.x,t)+nx*26,pz=lerp(a.z,b.z,t)+nz*26;
     mb.box(px,.06,pz,7,.12,4,k%2?0x33393f:0x3c434b,{mu:.95,tag:"pit"});}
   mb.box(a.x+nx*12,1,a.z+nz*12,.5,2,120,0xb9c2cc,{yaw:Math.atan2(dx,dz),mu:.4,tag:"pitwall"});}
  // 🏁 스타트/피니시 게이트(오버헤드 갠트리) + 라인
  {const a=road[0],b=road[3];const yaw=Math.atan2(b.x-a.x,b.z-a.z),nx=Math.cos(yaw),nz=-Math.sin(yaw);
   mb.texRect(a.x,a.z,16,1.8,yaw,"rgba(240,244,250,.95)");
   for(const s of[-1,1])mb.box(a.x+nx*s*9,4,a.z+nz*s*9,1.2,8,1.2,0x2e3640,{mu:.5,tag:"gantry"});
   mb.box(a.x,8.2,a.z,20,1.2,1.4,0xd8433b,{yaw,mu:.5,tag:"gantry"});}
  // 그랜드스탠드 3동(계단식) + 마샬 포스트
  for(const[gx,gz,gyaw]of[[-300,-320,0],[-120,-330,0],[380,80,Math.PI/2]])
    for(let t=0;t<3;t++)mb.box(gx,4+t*3,gz-t*4*Math.cos(gyaw),(56-t*6),2.6,7,t?0x2e3640:0x39424e,{yaw:gyaw,mu:.5,tag:"stand"});
  for(let k=0;k<8;k++){const rp=road[(k*70)%road.length];mb.box(rp.x,w.height(rp.x,rp.z)+1.1,rp.z-0,.4,2.2,.4,0xffd23e,{mu:.5,tag:"marshal",noVis:false});}
  // 나무(트랙 밖)
  {let sd=17;const rr=()=>{sd=(sd*48271)%2147483647;return sd/2147483647;};
   for(let k=0;k<26;k++){const a=rr()*Math.PI*2,r=140+rr()*260,tx=Math.cos(a)*r,tz=Math.sin(a)*r*.92;
     if(w.surf(tx,tz)===S_GRS)mb.baked(rr()<.5?"trees":"treesTall",tx,tz,10+rr()*5,rr()*6,{});}}
  w.checkpoints=pathCheckpoints(road,30,16);
  mb.paintLanes();
  w.waypoints=pathWaypoints(road,true,58);
  w.spawn={x:road[0].x,z:road[0].z,yaw:Math.atan2(road[4].x-road[0].x,road[4].z-road[0].z)};
  return mb.finalize(this);}},
];

/* ---------- 7. 그랜드 시티 (오픈월드) ---------- */
MAPS.push(
{id:"grand",name:"메가시티 (오픈월드)",icon:"🌆",desc:"3.4km² 확장 오픈월드 — 고층 도심·순환고속도로·메가 외곽루프·마운틴 루프·호수·공업·공항·비치·스타디움. 📍장소 선택 스폰",
 modes:["free","time","race","drift"],
 build(){
  const mb=new MapBuilder(1840,332),w=mb.world;   // 맵 확대(1600→1840)
  mb.fill((x,z)=>{
    // 완만한 롤링(요철 지형) — 도로가 오르막/내리막을 따라감
    let h=1.6*Math.sin(x*.006)*Math.cos(z*.007)+.9*Math.sin(x*.015+1)*Math.cos(z*.013);
    if(Math.abs(x)<290&&Math.abs(z)<290)h*=.35;    // 다운타운은 평평하게(잔물결만) — 높낮이는 고가 뷰덕트로
    const hd=Math.hypot(x-420,z+430);h+=36*Math.exp(-hd*hd/82000);   // 산(북동) — 오르막
    const h2=Math.hypot(x-250,z+180);h+=13*Math.exp(-h2*h2/30000);
    const h3=Math.hypot(x+620,z+560);h+=27*Math.exp(-h3*h3/66000);   // 언덕(남서)
    const ld=Math.hypot(x+350,z-300);                                 // 호수(북서)
    let s=S_GRS;
    if(ld<95){h=Math.min(h,-.35);s=S_WET;}
    else if(ld<115){h*=.3;s=S_SND;}
    if(x>790){s=x>840?S_WET:S_SND;h=x>840?Math.min(h,-.3):h*.3;}      // 동측 해안(더 멀리)
    return[h,s];});
  // 도심 격자 (pitch 90, 7x7 — 약간 더 큰 다운타운)
  for(let k=-3;k<=3;k++){
    mb.paintPath([{x:-275,y:0,z:k*90},{x:275,y:0,z:k*90}],14,S_ASP,true,true);
    mb.paintPath([{x:k*90,y:0,z:-275},{x:k*90,y:0,z:275}],14,S_ASP,true,true);}
  // 순환 고속도로 (r≈420) — 언덕을 절개하며 통과
  const ring=samplePath([[420,0],[300,300],[0,420],[-300,300],[-420,0],[-300,-300],[0,-420],[297,-297]],true,360);
  // 산 구간 잔여 언덕/절벽 제거: 넓은 코리도어 정지작업으로 노면을 완전 평탄화(장애물 해소)
  flattenCorridor(mb,ring,11,16,()=>0);
  mb.paintPath(ring,19,S_ASP,true,true);
  // 가드레일: 연결로·스퍼 교차 지점은 뚫어 둠(진입로 차단 버그 방지)
  railAlong(mb,ring,19,0xb9c2cc,(a)=>(Math.abs(a.x)<16&&Math.abs(a.z)>396)||(Math.abs(a.z)<16&&Math.abs(a.x)>396));
  // 연결로 4방향
  for(const[a,b]of[[[185,0],[418,0]],[[-185,0],[-418,0]],[[0,185],[0,418]],[[0,-185],[0,-418]]])
    mb.paintPath([{x:a[0],y:0,z:a[1]},{x:b[0],y:0,z:b[1]}],14,S_ASP,true);
  // 메가 외곽 고속도로: 지형을 따라 오르막·내리막(산 구간 힐클라임), 남측은 광폭 차선.
  // 깊은 계곡(지형 0m으로 곤두박질치던 구덩이)은 bridgeValleys로 완만한 둑을 만들고
  // flattenCorridor로 노면을 그 프로파일에 맞춰 메워 — 어디서든 매끈히 주행 가능(구덩이 제거).
  // 더 크고 매끈한 루프(난잡함 정돈 + 더 길게 ≈6km). 스포크 접속부는 난간 개방.
  const megaCtrl=[[748,23],[644,-414],[276,-661],[-207,-690],[-644,-495],[-794,-46],[-713,391],[-368,656],[92,736],[529,541]];
  const spokeEnds=[[729,29],[81,733],[-789,-52],[-202,-688]];   // E·N·W·S 스포크 접속점(맵 확대)
  const mega=followTerrain(w,samplePath(megaCtrl,true,600));
  bridgeValleys(mega,.1);
  flattenCorridor(mb,mega,11,18);
  mb.paintPath(mega,19,S_ASP,true,true);
  railAlong(mb,mega,19,0xb9c2cc,(a)=>spokeEnds.some(e=>Math.hypot(a.x-e[0],a.z-e[1])<36));
  {const wide=mega.filter(p=>p.z<-520);            // 남측 광폭 구간
   if(wide.length>4)mb.paintPath(wide,27,S_ASP,true);}
  mb.texText(644,-253,7,"MOUNTAIN HWY","rgba(240,244,250,.45)");
  // 메가 꿀렁임·요철(구간별, 실제 노후 고속도로처럼)
  w.addRippleZone(696,-242,66,.015,1.8,2);
  w.addRippleZone(-494,-587,68,.013,1.2,3);
  w.addRippleZone(-759,173,62,.017,2.1,2);
  w.addRippleZone(-138,701,62,.012,1.5,1);
  w.addRippleZone(552,494,58,.016,2.0,2);
  // 내부 순환로(r434) ↔ 메가 연결 스포크(4방향) — 지형추종(계곡 절개 방지)
  for(const[a2,b2]of[[[434,0],spokeEnds[0]],[[0,434],spokeEnds[1]],[[-434,0],spokeEnds[2]],[[0,-434],spokeEnds[3]]]){
    const sp=bridgeValleys(followTerrain(w,samplePath([a2,b2],false,70)),.14);
    mb.paintPath(sp,14,S_ASP,true,true);}
  // 🌀 드리프트 광장(도심 서측): 넓은 아스팔트 오픈 스페이스
  mb.stamp(-280,120,58,(i,j,d)=>{w.setS(i,j,S_ASP);});
  mb.texCircle(-280,120,56,SURF_CSS[S_ASP]);
  mb.texCircle(-280,120,26,"rgba(244,248,252,.85)",.4);
  mb.texCircle(-280,120,1,"rgba(244,248,252,.9)");
  mb.texText(-280,120-40,6,"DRIFT PLAZA","rgba(244,248,252,.55)");
  for(let k=0;k<10;k++)mb.prop("cone",-280+Math.cos(k*.628)*50,120+Math.sin(k*.628)*50);
  // ⛲ 도심 중앙 광장: 다단 분수(약간 축소) + 절제된 조경(동상·화단·가로등). 방사형 패턴 제거로 깔끔하게.
  {const fx=0,fz=0;
   mb.stamp(fx,fz,90,(i,j,d)=>w.setS(i,j,S_ASP));      // 광장 바닥(아스팔트, 주행/드리프트 가능)
   mb.texCircle(fx,fz,88,SURF_CSS[S_ASP]);
   mb.texCircle(fx,fz,52,"rgba(226,231,238,.26)",.7);  // 은은한 원형 프롬나드 1줄만
   // 다단 분수(약간 축소): 수반 + 4단 + 중앙 첨탑
   mb.texCircle(fx,fz,9,SURF_CSS[SURF_ID.wet]);
   mb.baked("fountain",fx,fz,7,0,{y:0});
   mb.box(fx,.3,fz,18,.6,18,0x9aa2ab,{mu:.7,tag:"fountain"});
   for(let k=0;k<4;k++)mb.box(fx,.5+k*.5,fz,11-k*2.4,.9,11-k*2.4,k%2?0x9aa2ab:0x818b96,{mu:.7,tag:"fountain"});
   mb.box(fx,2.9,fz,1.0,2.6,1.0,0xb6bcc4,{mu:.7,tag:"fountain"});
   // 4방위 기념 동상
   for(let q=0;q<4;q++){const a=q*Math.PI/2,sx=fx+Math.cos(a)*34,sz=fz+Math.sin(a)*34;
     mb.box(sx,1.0,sz,2.8,2.0,2.8,0x8b8378,{mu:.6,tag:"plinth"});
     mb.box(sx,2.7,sz,1.0,1.8,1.0,0xcfd3d8,{mu:.5,tag:"statue"});}
   // 화단(4곳으로 축소) + 관목
   for(let k=0;k<4;k++){const a=(k+.5)/4*6.283,px=fx+Math.cos(a)*56,pz=fz+Math.sin(a)*56;
     mb.box(px,.4,pz,7,.8,7,0x8a7a5c,{yaw:-a,mu:.7,tag:"planter"});
     mb.box(px,1.0,pz,6,.8,6,0x3f6b3a,{yaw:-a,mu:.7,tag:"hedge"});}
   for(let k=0;k<6;k++){const a=k/6*6.283+.3;mb.baked("treesTall",fx+Math.cos(a)*78,fz+Math.sin(a)*78,10,a,{});}
   mb.texText(fx,fz-64,7,"⛲ CENTRAL PLAZA","rgba(240,244,250,.5)");}
  // 🅿️ 대형 주차장(도심 북서 블록) — 실제 주차장 배치: 열/통로 + 주차선 + 정차 차량
  {const px0=-150,pz0=150;                                // 격자 블록 하나를 주차장으로
   mb.stamp(px0,pz0,42,(i,j,d)=>w.setS(i,j,S_ASP));
   mb.texRect(px0,pz0,80,80,0,SURF_CSS[S_ASP]);
   const COLR=[0x9b2226,0x3d5a80,0x4a5a40,0xcfc9bd,0x2b2f36,0xc07a2f];
   for(let row=0;row<4;row++){const rz=pz0-30+row*20;      // 4열(사이 통로)
     mb.texRect(px0,rz-6.5,72,.4,0,"rgba(238,242,248,.6)"); // 열 경계선
     for(let s=0;s<12;s++){const sx=px0-33+s*6;
       mb.texRect(sx,rz-3,.3,7,0,"rgba(238,242,248,.55)"); // 주차 구획선
       if((s*7+row*3)%5<2)mb.box(sx+3,.5,rz-3,4.2,1.3,1.9,COLR[(s+row)%6],{mu:.5,tag:"parkedcar"});}}
   mb.texRect(px0,pz0+34,72,5,0,"rgba(226,231,238,.28)");   // 진입 통로
   for(const sx of[px0-38,px0+38])for(let k=0;k<3;k++)mb.prop("lamp",sx,pz0-24+k*24,0);
   mb.box(px0-40,1.4,pz0,1.6,2.8,80,0x6b727c,{mu:.6,tag:"parkwall"}); // 서측 경계벽
   mb.texText(px0,pz0-40,6,"🅿 PARKING","rgba(240,244,250,.5)");}
  let seed=11;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const BLD2=["bldA","bldB","bldC","bldD"];
  // 🌉 스폰 인터체인지 — 스폰(0,-60) 옆 4단 입체 교차: 지하 터널 · 지상 · L1 고가 · L3 고가(고가 위 고가)
  //   L1(하부 고가, 동서 z=-30) / L2(상부 고가, 동서 z=-96) / L3(N-S 플라이오버, L1 위를 가로지름)
  //   지하 딥: 지상 x=0 도로가 L1 밑에서 지하로 꺼졌다 나옴(옹벽+터널 루프). 전 구간 난간·촘촘한 교각.
  const heightAt=(pts,x)=>{for(let s=0;s<pts.length-1;s++){const a=pts[s],b=pts[s+1];
    if((x>=a.x&&x<=b.x)||(x<=a.x&&x>=b.x)){const t=(x-a.x)/((b.x-a.x)||1);return a.y+(b.y-a.y)*t;}}return 0;};
  const heightAt2=(pts,z)=>{for(let s=0;s<pts.length-1;s++){const a=pts[s],b=pts[s+1];
    if((z>=a.z&&z<=b.z)||(z<=a.z&&z>=b.z)){const t=(z-a.z)/((b.z-a.z)||1);return a.y+(b.y-a.y)*t;}}return 0;};
  {const Z1=-30, l1=[[-178,0],[-124,9],[-64,4],[0,12],[64,4],[124,9],[178,0]].map(([px,py])=>({x:px,z:Z1,y:py}));
   const Z2=-96, l2=[[-152,0],[-96,10],[-58,19],[58,19],[96,10],[152,0]].map(([px,py])=>({x:px,z:Z2,y:py}));
   // ── 지하 딥(언더그라운드): x=0 도로가 L1 밑에서 -5.4m까지 꺼졌다 복귀 (터널)
   const dipC=z=>{const t=(z+30)/26;return -5.4*Math.max(0,1-t*t);};
   for(let z=-58;z<=-2;z+=1)mb.stamp(0,z,7.6,(i,j,d,px,pz)=>{w.setH(i,j,dipC(pz));w.setS(i,j,S_ASP);});
   for(let z=-52;z<=-8;z+=4){const y0=dipC(z),wh=1.1-y0;         // 옹벽(양측)
     for(const s of[-1,1])mb.box(s*8.2,(y0+1.1)/2,z,1.0,wh,4.4,0x40474f,{mu:.7,tag:"wall"});}
   mb.box(0,1.2,-30,17,.7,15,0x33393f,{mu:.7,tag:"portal"});      // 터널 루프(지하 천장)
   for(const z of[-46,-14])mb.prop("lamp",8.4,z,Math.PI/2);
   // ── L1 하부 고가(난간 포함)
   bridgeDeck(mb,l1,15,{deck:0x565d68,rail:0xc9ced6});
   // ── L2 상부 고가(더 높음)
   bridgeDeck(mb,l2,15,{deck:0x50565f,rail:0xbfc4cc});
   // ── 연결 램프: L1 동단(≈9m) → L2(≈19m)
   bridgeDeck(mb,[{x:150,z:-42,y:8},{x:150,z:-66,y:13},{x:128,z:-90,y:19}],13,{deck:0x5a616c,rail:0xc9ced6});
   // ── L3 플라이오버(N-S, x=-90 그리드 도로): L1(z=-30) 위를 y=22로 가로질러 고가 위 고가.
   //    양끝은 지상 도로로 내려옴(광장 밖 — 분수 광장은 건드리지 않음).
   const L3X=-90, l3=[[72,0],[24,15],[-30,22],[-72,0]].map(([pz,py])=>({x:L3X,z:pz,y:py}));
   bridgeDeck(mb,l3,12,{deck:0x5b626d,rail:0xc9ced6});
   for(let z=-64;z<=64;z+=16){const dy=heightAt2(l3,z);         // L3 교각(도로 밖 ±10)
     if(dy>3){const terr=Math.max(0,w.height(L3X,z));
       for(const s of[-1,1])mb.box(L3X+s*10,(dy+terr)/2,z,1.4,dy-terr,1.4,0x616872,{mu:.6,tag:"pillar"});}}
   // ── 촘촘한 교각(L1·L2 아래를 꽉 채움) — 단, x=0 지하도로 위는 비움
   for(const[pts,zc]of[[l1,Z1],[l2,Z2]])
     for(let x=-150;x<=150;x+=20){if(Math.abs(x)<14)continue;const dy=heightAt(pts,x);
       if(dy>2.4){const terr=Math.max(0,w.height(x,zc));
         for(const zo of[-5.5,0,5.5])mb.box(x,(dy+terr)/2,zc+zo,1.5,dy-terr,1.5,zo?0x616872:0x6b727c,{mu:.6,tag:"pillar"});}}
   mb.texText(0,-2,6,"UNDERGROUND","rgba(240,244,250,.5)");
   mb.texText(0,-96,7,"SPAWN INTERCHANGE","rgba(240,244,250,.5)");}
  // 🚧 시작점(스폰 0,-60) 근처 방지턱 — 두 개는 멀리 떨어뜨리고 전체적으로 추가
  w.addRippleZone(0,-150,40,.014,2.2,3);
  w.addRippleZone(0,-220,34,.012,2.6,1);
  for(const[bx2,bz2,h,ty]of[
      [0,-150,.13,"round"],[0,-220,.16,"arch"],       // 스폰 뒤 직선: 두 방지턱을 멀리 이격
      [0,150,.15,"sharp"],                             // 언더패스/플라이오버 북측(램프 밖)
      [-90,-45,.12,"round"],[90,-45,.14,"rumble"],     // 좌우 세로도로
      [-90,80,.13,"arch"],[90,80,.12,"flat"]])
    mb.bump(bx2,bz2,0,13,h,ty);
  // 🛣️ 스폰/도심 코어 도로 경계 명확화: 흰 실선 가장자리 + 연석(사이드워크)만. 방해물(조형물·난간)은 두지 않음.
  //   스폰 주변·인터체인지 풋프린트는 도로변 물체도 생략, 가로등만 드문드문(48m).
  {const V=[-90,0,90],H=[-90,0,90],EXT=190,edge=7,curb=8.4;
   const nearSpawn=(x,z)=>Math.hypot(x,z+60)<52;
   const inItc=(x,z)=>z<-4&&z>-140&&Math.abs(x)<185;
   for(const X of V){                                    // 세로 도로
     for(const s of[-1,1])mb.texRect(X+s*edge,0,.42,2*EXT,0,"rgba(244,248,252,.92)"); // 가장자리 실선
     for(const s of[-1,1])mb.texRect(X+s*curb,0,1.4,2*EXT,0,SURF_CSS[S_WLK]);          // 연석/사이드워크
     for(let z=-EXT+30;z<=EXT-30;z+=48){if(nearSpawn(X+10.5,z)||inItc(X+10.5,z))continue;
       mb.prop("lamp",X+10.5,z,Math.PI/2);}}
   for(const Z of H){                                    // 가로 도로
     for(const s of[-1,1])mb.texRect(0,Z+s*edge,2*EXT,.42,0,"rgba(244,248,252,.92)");
     for(const s of[-1,1])mb.texRect(0,Z+s*curb,2*EXT,1.4,0,SURF_CSS[S_WLK]);
     for(let x=-EXT+30;x<=EXT-30;x+=48){if(nearSpawn(x,Z+10.5)||inItc(x,Z+10.5))continue;
       mb.prop("lamp",x,Z+10.5,0);}}}
  // 베이크 건물(지상) — 중앙 광장(r110)·뷰덕트 라인(x=VX, z>190) 비우고 종류·높이 다양하게
  for(let bx=-3;bx<=2;bx++)for(let bz=-3;bz<=2;bz++){
    const cx=bx*90+45,cz=bz*90+45;
    if(Math.hypot(cx,cz)<110)continue;                 // 중앙 광장 비움
    if(Math.hypot(cx+150,cz-150)<58)continue;          // 대형 주차장 블록 비움
    if(cz<-4&&cz>-140&&Math.abs(cx)<185)continue;      // 스폰 인터체인지 풋프린트 비움(고가 방해 건물 제거)
    const dense=Math.hypot(cx,cz)<250;
    for(let k=0;k<(dense?2:1);k++){
      const sc=(dense?24:16)+rnd()*(dense?20:12);
      const hsc=dense?1.7+rnd()*1.3:1.3+rnd()*.7;         // 도심은 더 높은 고층(넓이 그대로 높이만 ↑)
      mb.baked(BLD2[(rnd()*4)|0],cx+(rnd()-.5)*(64-sc),cz+(rnd()-.5)*(64-sc),sc,
        ((rnd()*4)|0)*Math.PI/2,{y:0,collide:true,shrink:.92,hScale:hsc});}
    if(rnd()<.5)mb.baked(rnd()<.5?"trees":"treesTall",cx+28,cz-28,10+rnd()*4,rnd()*6,{y:0});}
  // 랜드마크 타워(도심 남동) — 초고층 + 소공원(도심 북서)
  mb.baked("bldA",250,250,58,0,{y:0,collide:true,shrink:.9,hScale:3.0});
  mb.stamp(-250,-250,44,(i,j,d)=>w.setS(i,j,d<40?S_GRS:S_ASP));
  for(let k=0;k<7;k++)mb.baked("treesTall",-250+Math.cos(k)*30,-250+Math.sin(k*1.3)*30,11,k,{});
  // 교외 주택(남서) — 차고 모델 + 나무
  for(let k=0;k<7;k++){   // 순환로 안쪽(r<400)으로 — 고속도로 위 장애물 금지
    const hx2=-262+((k%3)*30),hz2=-206-((k/3)|0)*32;
    mb.baked("garage",hx2,hz2,14,((k%4))*Math.PI/2,{collide:true,shrink:.9});
    if(k%2)mb.baked("treesTall",hx2+18,hz2+8,10+(k%3)*2,k,{});}
  for(let k=0;k<4;k++)
    mb.box(300+k*46,w.height(300+k*46,356)+5,356,38,10,26,0x77808c,{mu:.5,tag:"warehouse"});
  for(let k=0;k<6;k++)mb.prop("barrel",310+k*5,300);
  // 방지턱: 도심 스쿨존 — 종류 다양(arch·round·flat·sharp·rumble)
  for(const[bx,bz,yaw,h,ty]of[
      [45,0,Math.PI/2,.16,"arch"],[-45,0,Math.PI/2,.14,"round"],
      [0,45,0,.16,"flat"],[0,-45,0,.13,"sharp"],
      [90,50,0,.2,"arch"],[-90,-50,0,.18,"round"],
      [45,90,Math.PI/2,.1,"rumble"],[-45,-90,Math.PI/2,.22,"flat"]])
    mb.bump(bx,bz,yaw,13,h,ty);
  // 순환로·연결로 요철(낮은 방지턱 산재) — 실제 도로처럼 약간의 굴곡
  for(let k=0;k<ring.length;k+=44){const p=ring[k],p2=ring[(k+2)%ring.length];
    const yaw=Math.atan2(p2.x-p.x,p2.z-p.z);
    mb.bump(p.x,p.z,yaw,17,.06+.04*((k/44)%2),(k/44)%2?"round":"rumble");}
  // 🌊 레이크사이드 (북서 호수) — 본래 목적대로 재설계: 물가 프롬나드·모래 해변·잔교(피어)·정박 보트·보트하우스·등대
  {const lx=-350,lz=300;   // 순환로(r≈420) 안쪽·호수 주변(도로 침범 금지)
   mb.texCircle(lx,lz,95,"rgba(38,92,140,.5)");           // 수면(블루 틴트)
   mb.texCircle(lx,lz,95,"rgba(120,170,205,.35)",1.2);    // 물가 라인
   // 물가 순환 프롬나드(드라이브/산책 가능) — 해변 바깥을 한 바퀴
   const prom=[];for(let k=0;k<=48;k++){const a=k/48*6.283;prom.push({x:lx+Math.cos(a)*126,y:0,z:lz+Math.sin(a)*126});}
   mb.paintPath(prom,8,S_WLK,true);
   for(let k=0;k<12;k++){const a=k/12*6.283;mb.prop("lamp",lx+Math.cos(a)*126,lz+Math.sin(a)*126,-a);}
   // 해변(남안) 벤치·파라솔
   for(let k=0;k<6;k++){const a=(k/5-.5)*1.4-1.57;
     mb.box(lx+Math.cos(a)*106,.25,lz+Math.sin(a)*106,2.2,.5,.8,0x6f5a3f,{yaw:a+1.57,mu:.8,tag:"bench"});
     if(k%2)mb.box(lx+Math.cos(a)*100,1.4,lz+Math.sin(a)*100,.4,2.8,.4,0xcaa23a,{mu:.6,tag:"parasol"});}
   // 피어(잔교): 북안에서 수면 위로 뻗음 + 가로 워크
   for(let k=0;k<4;k++)mb.box(lx-60+k*40,.3,lz+50,6,.5,70,0x8a6b45,{mu:.8,tag:"dock"});
   mb.box(lx,.3,lz+8,110,.5,7,0x8a6b45,{mu:.8,tag:"dock"});
   // 정박 보트
   for(let k=0;k<7;k++)mb.box(lx-84+k*28,.7,lz+20+((k%2)*11),4.4,1.1,10,[0xd8433b,0xe8e8e8,0x3d5a80][k%3],{yaw:.08*k,mu:.5,tag:"boat"});
   // 보트하우스 + 등대
   mb.box(lx+120,3,lz-72,20,6,14,0x8a5a3c,{mu:.6,tag:"boathouse"});
   mb.box(lx-122,5,lz-92,4,10,4,0xe8e8e8,{mu:.6,tag:"lighthouse"});
   mb.box(lx-122,10.6,lz-92,3,1.4,3,0xd8433b,{mu:.5,tag:"lightlamp"});
   for(let k=0;k<7;k++)mb.baked("treesTall",lx+Math.cos(k*.9)*138,lz+Math.sin(k*.9)*138,11,k,{});
   // 접근로: 순환로 서측 스퍼(-185,0) → 호수 프롬나드(남측 진입)
   mb.paintPath([{x:-185,y:0,z:0},{x:-250,y:0,z:90},{x:lx,y:0,z:lz-126}],10,S_ASP,true,true);
   mb.texText(lx,lz+134,9,"LAKESIDE","rgba(240,244,250,.5)");}
  // 🏔️ 마운틴 루프 — 순환로에서 갈라져 산(420,-430)을 넘어 다시 순환로로 돌아오는 '깨끗한 순환 도로'.
  //   막다른 스위치백·비포장·와인딩 조각들을 이 1개의 연결된 루프로 대체(주행 가능·비난잡).
  //   순환로 접속 구간만 가드레일 개방(도로 막힘 없음).
  {const mloop=bridgeValleys(followTerrain(w,samplePath(
     [[300,-300],[420,-370],[520,-450],[500,-560],[380,-585],[260,-520],[220,-410],[255,-345]],true,300)),.12);
   flattenCorridor(mb,mloop,8,14);
   mb.paintPath(mloop,13,S_ASP,true,true);
   railAlong(mb,mloop,13,0xb9c2cc,(a)=>{const r=Math.hypot(a.x,a.z);return r>392&&r<452;});
   mb.texText(400,-470,8,"MOUNTAIN LOOP","rgba(240,244,250,.5)");}
  // 공사장 (대형 갭 점프대 + 자재) — 격자와 순환로 사이 공터
  mb.ramp(250,236,0,24,22,14,0xd8433b);
  mb.ramp(250,296,Math.PI,20,20,14,0xc7742f);   // 착지 램프를 순환로 안쪽으로(고속도로 침범 금지)
  for(let k=0;k<6;k++)mb.box(220+k*7,.6,250,6,1.2,2,0xcaa23a,{yaw:k,mu:.8,tag:"beam"});
  for(let k=0;k<3;k++)mb.box(210,2.4+k*.1,270+k*4,10,.2,3.6,0x7a828c,{mu:.7,tag:"scaffold"});
  // 언덕·산 나무 — 마운틴 루프(도로) 노면 위엔 배치 금지
  for(let k=0;k<18;k++){
    const tx=240+rnd()*300,tz=-200-rnd()*360,r=Math.hypot(tx,tz);
    if(r>392&&r<452)continue;                              // 순환로 노면 위 금지
    if(Math.abs(Math.hypot(tx-400,tz+470)-160)<40)continue; // 마운틴 루프 노면 근처 금지
    mb.baked(rnd()<.5?"trees":"treesTall",tx,tz,10+rnd()*5,rnd()*6,{});}
  for(let k=0;k<6;k++)mb.baked("treesTall",-350+Math.cos(k*1.05)*130,300+Math.sin(k*1.05)*130,11,k,{});
  // 가로등·표지판
  for(let k=-1;k<=1;k++){mb.prop("lamp",10,k*90+25,Math.PI);mb.prop("sign",k*90+10,10,0);}

  /* ===== 외곽 구역 확장 (통합 오픈월드) ===== */
  // 공항 활주로 (남측) — 훨씬 긴 대형 직선 활주로(840m) + 유도로 + 격납고·관제탑. 약간의 요철 꿀렁임.
  {const ax=-120,az=-660;
   mb.paintPath([{x:ax-420,y:0,z:az},{x:ax+420,y:0,z:az}],44,S_ASP,true);       // 활주로 840m
   for(let k=-18;k<=18;k++)mb.texRect(ax+k*22,az,10,1.2,0,"rgba(244,248,252,.8)");  // 중앙선 파선
   for(const side of[-1,1])for(let k=0;k<6;k++)for(const s of[-1,1])                 // 접지대 마킹(양끝)
     mb.texRect(ax+side*(384-k*14),az+s*11,9,2.6,0,"rgba(244,248,252,.85)");
   mb.texText(ax-372,az,12,"09","rgba(240,244,250,.55)");
   mb.texText(ax+372,az,12,"27","rgba(240,244,250,.55)");
   // 유도로(활주로 남측 평행) + 연결 유도로
   mb.paintPath([{x:ax-380,y:0,z:az+72},{x:ax+380,y:0,z:az+72}],14,S_ASP,true);
   for(const tx of[-300,0,300])mb.paintPath([{x:ax+tx,y:0,z:az},{x:ax+tx,y:0,z:az+72}],12,S_ASP,true);
   for(let k=0;k<4;k++)mb.box(ax-210+k*140,7,az+122,60,14,34,0x6f7883,{mu:.5,tag:"hangar"});   // 격납고
   mb.box(ax+420,11,az+108,10,22,10,0x8a929c,{mu:.5,tag:"tower"});                  // 관제탑
   mb.box(ax+420,23,az+108,16,4,16,0x2b3138,{mu:.5,tag:"towercab"});
   w.addRippleZone(ax-220,az,84,.010,1.4,3);   // 노면 잔요철(오래된 활주로 느낌)
   w.addRippleZone(ax+180,az,84,.012,1.7,1);
   // 접근 연결로 (도심 → 공항)
   mb.paintPath([{x:0,y:0,z:-418},{x:-40,y:0,z:-540},{x:ax,y:0,z:az-4}],13,S_ASP,true,true);}
  // (해안도로·해안 연결로 제거 — 메가 하이웨이 동측과 중복되어 난잡했음. 메가 루프가 동측 도로 역할)
  // 해변 야자·표지만 남김(해안 경관)
  for(let k=0;k<7;k++)mb.baked("treesTall",760+Math.sin(k)*24,-240+k*90,10,k,{});
  mb.texText(772,60,12,"EAST BEACH","rgba(240,244,250,.4)");
  // 스타디움 (남서 언덕 옆)
  {const sx=-620,sz=560;
   mb.stamp(sx,sz,70,(i,j,d)=>w.setS(i,j,d<44?S_GRS:S_WLK));
   for(let k=0;k<26;k++){const a=k/26*6.283;
     mb.box(sx+Math.cos(a)*58,w.height(sx+Math.cos(a)*58,sz+Math.sin(a)*58)+5,sz+Math.sin(a)*58,9,10,9,0x39424e,{yaw:-a,mu:.5,tag:"stand"});}
   mb.paintPath([{x:-185,y:0,z:0},{x:-360,y:0,z:260},{x:sx+70,y:0,z:sz-40}],13,S_ASP,true,true);
   mb.texText(sx,sz,14,"ARENA","rgba(240,244,250,.5)");}

  // 잔요철 패치: 전 도로가 아니라 일부 구간에만, 패턴 다양 (1=미세요철 2=워시보드 3=완만한 물결)
  w.addRippleZone(0,240,60,.012,2.1,1);      // 북부 연결로: 미세 요철
  w.addRippleZone(300,300,55,.02,2.8,2);     // 동측 순환로 부근: 워시보드
  w.addRippleZone(-410,120,70,.016,.9,3);    // 서측 순환로: 완만한 물결
  w.addRippleZone(90,-90,45,.01,2.4,1);      // 도심 남동 블록: 미세 요철
  w.addRippleZone(0,-45,38,.013,1.9,3);      // 다운타운 스폰 앞: 완만한 꿀렁임
  w.addRippleZone(-60,60,34,.011,2.6,1);     // 다운타운 북서 블록: 잔요철
  w.addRippleZone(0,-500,60,.018,2.2,2);     // 남부 고속도로: 워시보드
  w.addRippleZone(-240,-420,55,.015,1.1,3);  // 남서 교외로: 물결
  w.addRippleZone(-150,150,50,.014,2.0,2);   // 주차장 진입로: 워시보드
  w.addRippleZone(-70,0,40,.012,2.5,1);      // 도심 중앙로: 미세 요철
  w.addRippleZone(140,60,42,.016,1.3,3);     // 도심 동측: 완만한 물결
  w.checkpoints=pathCheckpoints(mega,26,20);
  w.waypoints=pathWaypoints(mega,true,56);
  w.spawn={x:0,z:-60,yaw:0};
  // 📍 장소(스폰 포인트) — HUD에서 선택 시 즉시 이동
  w.places=[
    {name:"🏙️ 다운타운",x:0,z:-60,yaw:0},
    {name:"🌉 스폰 고가(인터체인지)",x:-178,z:-30,yaw:Math.PI/2},
    {name:"🛣️ 순환 고속도로",x:418,z:0,yaw:0},
    {name:"🏔️ 마운틴 루프",x:300,z:-300,yaw:Math.PI*.7},
    {name:"🌊 레이크사이드",x:-350,z:172,yaw:0},
    {name:"🌀 드리프트 광장",x:-280,z:70,yaw:0},
    {name:"🛣️ 메가 하이웨이(외곽)",x:729,z:29,yaw:Math.PI},
    {name:"⛰️ 하이웨이 산악 구간",x:644,z:-414,yaw:Math.PI*.7},
    {name:"🏘️ 교외 주택가",x:-232,z:-235,yaw:0},
    {name:"🏭 공업지구",x:330,z:340,yaw:Math.PI},
    {name:"🏗️ 공사장 점프대",x:250,z:225,yaw:0},
    {name:"✈️ 공항 활주로",x:-120,z:-656,yaw:Math.PI/2},
    {name:"🏖️ 이스트 비치",x:740,z:60,yaw:Math.PI},
    {name:"🏟️ 스타디움",x:-620,z:640,yaw:0},
    {name:"⛲ 분수 광장",x:0,z:90,yaw:Math.PI},
    {name:"🅿️ 대형 주차장",x:-150,z:186,yaw:Math.PI},
    {name:"🌉 협곡 대교",x:500,z:-455,yaw:Math.PI*.75},
    {name:"🌉 상부 고가(L2)",x:-152,z:-96,yaw:Math.PI/2},
    {name:"🛣️ 지하 터널",x:0,z:-64,yaw:0}];
  mb.paintLanes();
  return mb.finalize(this);}});

/* ---------- 8. 서스펜션 랩 ---------- */
MAPS.push(
{id:"susp",name:"서스펜션 랩",icon:"🔩",desc:"높이별 방지턱 6~35cm·빨래판·트위스트·모굴·언덕 4단·경사 15/25/35/45°·시소·테이블탑 점프·록크롤",
 modes:["free","crash"],
 build(){
  const mb=new MapBuilder(760,256),w=mb.world;
  const LANES=[-300,-230,-160,-88,-8,72,150,232,300];
  const HILLX=-8, RAMPX=72;
  mb.fill((x,z)=>{
    let h=0;
    // 언덕 4단 (가우시안 능선) — 훨씬 크게 (3/6/11/18m)
    if(Math.abs(x-HILLX)<30){
      const edge=clamp((30-Math.abs(x-HILLX))/9,0,1);
      for(const[zc,H]of[[-150,3],[-70,6],[30,11],[150,18]]){
        const s2=(H*2.0)*(H*2.0);
        h+=H*Math.exp(-((z-zc)*(z-zc))/(2*s2))*edge;}}
    if(Math.abs(x)>360||Math.abs(z)>360)return[h,S_GRS];
    return[h,S_ASP];});
  // 1레인: 방지턱 종류별 (아치·라운드·테이블·샤프·럼블·대형)
  const bt=[["arch","아치 10",.1],["round","라운드 16",.16],["flat","테이블 12",.12],
            ["sharp","샤프 14",.14],["rumble","럼블",.05],["arch","대형 30",.30]];
  bt.forEach(([t,nm,h],k)=>{
    mb.bump(LANES[0],-150+k*40,0,14,h,t);
    mb.texText(LANES[0]-10,-160+k*40,3.2,nm);});
  // 2레인: 빨래판/워시보드 (슬랫 24개, 더 큼)
  for(let k=0;k<24;k++)
    mb.box(LANES[1],w.height(LANES[1],-160+k*1.6)+.03,-160+k*1.6,13,.06,.6,0x8f98a3,{mu:1,tag:"slat"});
  for(let k=0;k<10;k++)
    mb.box(LANES[1],.055,-40+k*4,13,.11,1.1,0x8f98a3,{mu:1,tag:"slat"});
  mb.texText(LANES[1],-176,4,"빨래판");
  // 3레인: 트위스트 (좌우 엇갈림 → 대각 롤) — 더 크게
  for(let k=0;k<12;k++)
    mb.bump(LANES[2]+(k%2?-4:4),-160+k*18,0,8,.18);
  mb.texText(LANES[2],-176,4,"트위스트");
  // 4레인(-88): 모굴 필드 (지그재그 대형 범프) — 평지, 롤·피치 복합
  for(let k=0;k<16;k++){
    const off=((k%3)-1)*5;
    mb.bump(LANES[3]+off,-160+k*17,0,7,.14+ (k%2)*.06);}
  mb.texText(LANES[3],-176,4,"모굴 필드");
  mb.texText(HILLX,-176,4,"언덕 3~18m");
  // 6레인(72): 경사 램프 각도별 분리 (제대로 기울어진 박스 램프) 15/25/35/45°
  [[15,-155,20],[25,-95,18],[35,-30,16],[45,40,14]].forEach(([deg,z,len])=>{
    mb.ramp(RAMPX,z,0,deg,len,14,0xc7742f);
    mb.texText(RAMPX,z-len*.6,3.4,deg+"°");});
  mb.texText(RAMPX,-176,4,"경사 15/25/35/45°");
  // 7레인: 시소(테이터) + 흔들다리 슬랫
  mb.box(LANES[6],.02,-140,13,.6,10,0x9aa2ab,{roll:0,pitch:9*DEG,mu:1,tag:"teeter"});
  mb.box(LANES[6],.02,-118,13,.6,10,0x9aa2ab,{pitch:-9*DEG,mu:1,tag:"teeter"});
  for(let k=0;k<14;k++)
    mb.box(LANES[6]+(k%2?-2:2),.04+ (k%2)*.16,-80+k*4.2,10,.09,1.2,0xa2842f,{mu:1,tag:"plank"});
  mb.texText(LANES[6],-176,4,"시소·흔들다리");
  // 8레인: 테이블탑 점프대 + 갭 점프 (착지 램프)
  mb.ramp(LANES[7],-150,0,20,20,13,0xc7742f);        // 이륙
  mb.box(LANES[7],2.4,-110,13,.8,26,0x8f98a3,{mu:1,tag:"table"}); // 상판
  mb.ramp(LANES[7],-72,Math.PI,20,20,13,0xc7742f);   // 착지(반대 경사)
  mb.ramp(LANES[7],40,0,26,22,13,0xd8433b);          // 대형 갭 점프대
  mb.texText(LANES[7],-176,4,"테이블탑·갭 점프");
  // 9레인: 록크롤 (랜덤 바위 + 계단 + 연석 타격)
  {let sd=41;const rr=()=>{sd=(sd*48271)%2147483647;return sd/2147483647;};
   for(let k=0;k<40;k++)
     mb.box(LANES[8]+(rr()-.5)*12,w.height(LANES[8],-160+rr()*120)+.1,-160+rr()*120,
       1.4+rr()*2.2,.2+rr()*.5,1+rr()*1.4,0x77808c,{yaw:rr()*3,roll:(rr()-.5)*.5,mu:.95,tag:"rock"});}
  for(let k=0;k<5;k++)
    mb.box(LANES[8],.12+k*.24,-10+k*2,13,.24,2,0x9aa2ab,{mu:1,tag:"stair"});
  mb.box(LANES[8],.18,40,13,.36,1.2,0xb5443c,{mu:1,tag:"curb"});
  mb.texText(LANES[8],-176,4,"록크롤·계단·연석");
  // 레인 구분선
  for(const lx of LANES)
    mb.texPath([{x:lx,z:-190},{x:lx,z:180}],.34,"rgba(255,210,80,.5)",[3,3]);
  mb.texText(0,-250,6,"SUSPENSION LAB","rgba(240,244,250,.85)");
  // 되돌아오는 스타트 존 + 장식
  for(let k=0;k<6;k++)mb.baked(k%2?"trees":"treesTall",-320+k*128,320,12,k,{});
  for(let k=0;k<8;k++)mb.prop("cone",-300+k*80,-270);
  w.spawn={x:0,z:-300,yaw:0};
  return mb.finalize(this);}});

/* ---------- custom map from editor tiles ---------- */
const ED_TILES=[
  {id:"road", name:"직선로", col:"#4a5058"},
  {id:"curve",name:"커브",   col:"#5a6270"},
  {id:"cross",name:"교차로", col:"#3e444d"},
  {id:"ramp", name:"램프",   col:"#c7742f"},
  {id:"wall", name:"벽",     col:"#9aa2ab"},
  {id:"bump", name:"방지턱", col:"#e8b93c"},
  {id:"cone", name:"콘",     col:"#ff7518"},
  {id:"check",name:"체크포인트",col:"#3ddc84"},
  {id:"start",name:"출발점", col:"#ffd23e"},
  {id:"erase",name:"지우개", col:"#20242b"},
];
function buildCustomMap(data){
  const N=24,TS=20,size=N*TS+80;
  const mb=new MapBuilder(size,192),w=mb.world;
  mb.fill(()=>[0,S_GRS]);
  const at=(gx,gz)=>({x:(gx-N/2+.5)*TS,z:(gz-N/2+.5)*TS});
  const cps=[];
  for(const t of data.tiles){
    const{x,z}=at(t.x,t.z),rot=t.r*Math.PI/2;
    switch(t.t){
      case"road":mb.paintPath([{x:x-Math.sin(rot)*TS/2,y:0,z:z-Math.cos(rot)*TS/2},
                      {x:x+Math.sin(rot)*TS/2,y:0,z:z+Math.cos(rot)*TS/2}],12,S_ASP,false);break;
      case"cross":mb.paintPath([{x:x-TS/2,y:0,z},{x:x+TS/2,y:0,z}],12,S_ASP,false);
        mb.paintPath([{x,y:0,z:z-TS/2},{x,y:0,z:z+TS/2}],12,S_ASP,false);break;
      case"curve":{
        // quarter arc: north-edge mid → east-edge mid (then rotated clockwise by r)
        const p=[],ca=Math.cos(rot),sa=Math.sin(rot);
        for(let a=0;a<=8;a++){
          const t2=a/8*Math.PI/2;
          const lx=TS/2-Math.cos(t2)*TS/2,lz=-TS/2+Math.sin(t2)*TS/2;
          p.push({x:x+lx*ca-lz*sa,y:0,z:z+lx*sa+lz*ca});}
        mb.paintPath(p,12,S_ASP,false);break;}
      case"ramp":mb.ramp(x,z,rot,20,14,10);break;
      case"wall":mb.box(x,1.2,z,TS*.9,2.4,1.2,0x9aa2ab,{yaw:rot,mu:.6,tag:"wall"});break;
      case"bump":mb.bump(x,z,rot,12);break;
      case"cone":mb.prop("cone",x,z);break;
      case"check":cps.push({x,z,r:12,ord:t.ord||0});break;
      case"start":w.spawn={x,z,yaw:rot+Math.PI};break;}}
  cps.sort((a,b)=>a.ord-b.ord);
  w.checkpoints=cps;
  if(cps.length>1)w.waypoints=cps.map(c=>({x:c.x,z:c.z,v:20}));
  w.route=cps.length>1?"loop":null;
  return mb.finalize({id:"custom:"+data.name,name:data.name,icon:"🛠️",custom:true,
    modes:cps.length>1?["free","time"]:["free"]});
}
