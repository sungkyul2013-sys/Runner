/* ============================================================
   Map definitions (6 built-in + custom loader)
   ============================================================ */
const S_ASP=SURF_ID.asphalt,S_GRS=SURF_ID.grass,S_SND=SURF_ID.sand,S_GRV=SURF_ID.gravel,
      S_ICE=SURF_ID.ice,S_SNW=SURF_ID.snow,S_CRB=SURF_ID.curb,S_WET=SURF_ID.wet,S_WLK=SURF_ID.walk;

const MAPS=[
/* ---------- 1. 프루빙 그라운드 ---------- */
{id:"proving",name:"프루빙 그라운드",icon:"🧪",desc:"가속로·충돌벽·유압 압착기·서스펜션 시험장·러프 오프로드·램프·스키드패드·낙하타워",
 modes:["free","crash","drift"],
 build(){
  const mb=new MapBuilder(760,256),w=mb.world;
  const rough=(x,z)=>Math.hypot(x-250,z-250);          // 러프 오프로드 패치(남동)
  mb.fill((x,z)=>{
    const rd=rough(x,z);
    if(rd<105){
      let h=3.6*Math.sin(x*.055)*Math.cos(z*.05)+1.8*Math.sin(x*.12+1)*Math.cos(z*.1)
            +.9*Math.sin(x*.26)*Math.cos(z*.23);
      const e=clamp((105-rd)/22,0,1);
      return[h*e,rd<70?S_GRV:S_SND];}
    return[0,S_ASP];});
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
  for(const s of[-1,1])mb.box(cx+s*6,4.2,cz,1.4,8.4,4.4,0x33383f,{tag:"pillar"}); // 기둥
  mb.box(cx,8.6,cz,15,1.2,4.6,0x2b2f35,{tag:"frame"});                            // 상단 프레임
  mb.box(cx,.35,cz,11,.7,4.2,0x565b63,{mu:.95,tag:"anvil"});                      // 받침대
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
  // 1: 높이별 방지턱 6~30cm
  [.06,.10,.15,.22,.30].forEach((h,k)=>{mb.bump(lanes[0],sz0+k*22,0,11,h);
    mb.texText(lanes[0]-8,sz0+k*22-6,2.6,Math.round(h*100)+"cm");});
  // 2: 빨래판
  for(let k=0;k<18;k++)mb.box(lanes[1],.05,sz0+k*2,10,.1,.8,0x8f98a3,{mu:1,tag:"slat"});
  // 3: 모굴(지그재그)
  for(let k=0;k<12;k++)mb.bump(lanes[2]+((k%3)-1)*3.5,sz0+k*8,0,7,.14+(k%2)*.06);
  // 4: 트위스트
  for(let k=0;k<12;k++)mb.bump(lanes[3]+(k%2?-3:3),sz0+k*9,0,7,.16);
  // 5: 계단·연석
  for(let k=0;k<5;k++)mb.box(lanes[4],.1+k*.2,sz0+k*2.2,10,.2,2,0x9aa2ab,{mu:1,tag:"stair"});
  mb.box(lanes[4],.16,sz0+14,10,.32,1,0xb5443c,{mu:1,tag:"curb"});
  mb.texText(SX+14,sz0-16,5,"SUSPENSION","rgba(240,244,250,.6)");

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
  return mb.finalize(this);}},

/* ---------- 2. 네오시티 ---------- */
{id:"city",name:"네오시티",icon:"🏙️",desc:"대형 시가지 — 다운타운 마천루·골목·고가도로·로터리·공원·스타디움",
 modes:["free","time","race","drift"],
 build(){
  const mb=new MapBuilder(840,256),w=mb.world;
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
      const nm=BLD[(rnd()*5)|0];
      const sc=(downtown?30:22)+rnd()*(downtown?18:14);
      const ox=cx+(rnd()-.5)*(66-sc),oz=cz+(rnd()-.5)*(66-sc);
      mb.baked(nm,ox,oz,sc,((rnd()*4)|0)*Math.PI/2,{y:0,collide:true,shrink:.92});
      // 다운타운: 건물 위에 층 적층 → 마천루
      if(downtown){const floors=2+((rnd()*3)|0);let yy=BAKED[nm]?(BAKED[nm].bb[4]-BAKED[nm].bb[1])*sc*.92:14;
        for(let f=0;f<floors;f++){const fs=sc*(.88-f*.12);
          mb.baked(BLD[(rnd()*4)|0],ox,oz,fs,((rnd()*4)|0)*Math.PI/2,{y:yy,collide:false});
          yy+=(BAKED[BLD[0]]?18:14)*(fs/sc);}}}
    // 블록 코너 가로수
    if(rnd()<.7)mb.baked(rnd()<.5?"trees":"treesTall",cx+30,cz+30,11+rnd()*4,rnd()*6,{y:0});}
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
{id:"mountain",name:"미시령 와인딩",icon:"⛰️",desc:"헤어핀 7개 다운힐 — 가드레일 너머는 낭떠러지",
 modes:["free","time"],
 build(){
  const mb=new MapBuilder(760,224),w=mb.world;
  // base mountain: high at -x,-z corner
  mb.fill((x,z)=>{
    const d=Math.hypot(x+380,z+380)/760;
    let h=200*clamp(1-d,0,1);
    h+=8*Math.sin(x*.02)*Math.cos(z*.023)+4*Math.sin(x*.07+1)*Math.sin(z*.06);
    return[h,S_GRS];});
  // switchback road: hairpins descending
  const ctrl=[];let e=190;
  const xs=[-320,60,-40,120,-90,160,-140,200,-180,240];
  for(let k=0;k<xs.length;k++){
    const z=-330+k*68;e-=19;
    ctrl.push([xs[k],z,Math.max(e,2)]);}
  ctrl.push([320,330,2]);
  const road=samplePath(ctrl.map(c=>[c[0],c[1],c[2]]),false,420);
  mb.paintPath(road,11,S_ASP,true,true);
  railAlong(mb,road,11,0xc7ccd4);
  {let sd=23;const rr=()=>{sd=(sd*48271)%2147483647;return sd/2147483647;};
   for(let k=0;k<40;k++){
     const p=road[(rr()*road.length)|0];
     const off=18+rr()*48,ang=rr()*Math.PI*2;
     const tx=p.x+Math.cos(ang)*off,tz=p.z+Math.sin(ang)*off;
     if(w.surf(tx,tz)===S_GRS)mb.baked("treesTall",tx,tz,9+rr()*5,rr()*6,{});}
   // 낙석지대: 도로 옆 바위밭
   for(let k=0;k<22;k++){
     const p=road[(rr()*road.length)|0];
     const off=9+rr()*7,side=rr()<.5?-1:1,ang=Math.atan2(0,1);
     const tx=p.x+side*off,tz=p.z+ (rr()-.5)*14,sc=1.4+rr()*3;
     mb.box(tx,w.height(tx,tz)+sc*.3,tz,sc*1.8,sc,sc*1.5,0x6f675e,{yaw:rr()*3,roll:(rr()-.5)*.5,mu:.85,tag:"rock"});}}
  // 터널 (도로 중간 구간을 덮는 갱도) — 벽 2 + 지붕
  {const ti=Math.floor(road.length*.44),tj=Math.floor(road.length*.56);
   for(let i=ti;i<tj;i+=3){
     const a=road[i],b=road[Math.min(i+3,road.length-1)];
     const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1,yaw=Math.atan2(dx,dz);
     const nx=dz/l,nz=-dx/l,y=w.height(a.x,a.z);
     for(const s of[-1,1])mb.box(a.x+nx*s*7,y+2.4,a.z+nz*s*7,1.2,5,l+1,0x565049,{yaw,mu:.7,tag:"tunnelwall"});
     mb.box(a.x,y+5,a.z,15.5,1,l+1,0x4a453f,{yaw,mu:.7,tag:"tunnelroof"});}}
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
{id:"dunes",name:"황야",icon:"🏜️",desc:"1km² 오프로드 — 모래언덕·바위밭·점프 절벽·마른 강바닥",
 modes:["free","drift"],
 build(){
  const mb=new MapBuilder(1000,224),w=mb.world;
  mb.fill((x,z)=>{
    let h=6*Math.sin(x*.027)*Math.cos(z*.031)+3.5*Math.sin(x*.071+2)*Math.cos(z*.057+1)+1.5*Math.sin(x*.15)*Math.cos(z*.13);
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
{id:"raceway",name:"선셋 레이스웨이",icon:"🏁",desc:"3.1km 12코너 서킷 — 타임어택 기준 맵",
 modes:["free","time","race","drift"],
 build(){
  const mb=new MapBuilder(820,224),w=mb.world;
  mb.fill((x,z)=>[1.5*Math.sin(x*.01)*Math.cos(z*.012),S_GRS]);
  const ctrl=[[-300,-220],[-60,-300],[140,-260],[240,-140],[160,-40],[260,60],[280,200],[120,290],
              [-60,230],[-160,290],[-300,220],[-350,60],[-260,-40],[-340,-120]];
  const road=samplePath(ctrl,true,480);
  mb.paintPath(road,13,S_ASP,true,true);
  // curbs: paint stripe bands at corners (high curvature areas)
  for(let i=2;i<road.length-2;i+=2){
    const a=road[i-2],b=road[i],c=road[i+2];
    const ang=Math.abs(Math.atan2(c.x-b.x,c.z-b.z)-Math.atan2(b.x-a.x,b.z-a.z));
    if(ang>.045&&ang<3){
      const dx=c.x-a.x,dz=c.z-a.z,l=Math.hypot(dx,dz)||1;
      for(const s of[-1,1])mb.stamp(b.x+dz/l*s*7.2,b.z-dx/l*s*7.2,1.5,(ii,jj)=>w.setS(ii,jj,S_CRB));}}
  // tire walls at hard corners
  for(let i=0;i<road.length-4;i+=8){
    const a=road[i],b=road[i+4];
    const ang2=Math.atan2(b.x-a.x,b.z-a.z);
    const mid=road[i+2];
    const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1;
    const cv=Math.abs(Math.atan2(road[(i+8)%road.length].x-b.x,road[(i+8)%road.length].z-b.z)-ang2);
    if(cv>.35&&cv<3)for(const s of[-1,1])
      mb.box(mid.x+dz/l*s*13,w.height(mid.x+dz/l*s*13,mid.z-dx/l*s*13)+.5,mid.z-dx/l*s*13,
        1.2,1,7,s>0?0xd8433b:0xe8e8e8,{yaw:ang2,mu:.6,bounce:.3,tag:"tirewall"});}
  // 시케인 (스타트 직후 감속 시케인 — 타이어 스택 게이트)
  {const a=road[6],b=road[10];
   const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1,yaw=Math.atan2(dx,dz),nx=dz/l,nz=-dx/l;
   for(let s=0;s<5;s++){
     const t=s/4,cx=lerp(a.x,b.x,t),cz=lerp(a.z,b.z,t),off=(s%2?1:-1)*4;
     mb.box(cx+nx*off,w.height(cx+nx*off,cz+nz*off)+.5,cz+nz*off,1.4,1,3,s%2?0xd8433b:0xe8e8e8,{yaw,mu:.6,bounce:.3,tag:"tirewall"});}}
  // 피트 박스 (스탠드 앞 정비 구역)
  for(let k=0;k<5;k++)mb.box(-210+k*16,.06,-250,13,.12,7,0x33393f,{mu:.9,tag:"pit"});
  // grandstand + 나무 (관중석 3단)
  for(let t=0;t<3;t++)mb.box(-180,4+t*3,-268-t*4,60+t*8,2.6,7,t?0x2e3640:0x39424e,{mu:.5,tag:"stand"});
  mb.box(-90,4,-262,44,8,9,0x39424e,{mu:.5,tag:"stand"});
  {let sd=17;const rr=()=>{sd=(sd*48271)%2147483647;return sd/2147483647;};
   for(let k=0;k<22;k++){
     const a=rr()*Math.PI*2,r=120+rr()*220;
     const tx=Math.cos(a)*r,tz=Math.sin(a)*r*.9;
     if(w.surf(tx,tz)===S_GRS)mb.baked(rr()<.5?"trees":"treesTall",tx,tz,10+rr()*5,rr()*6,{});}}
  // 트랙 가장자리 흰 라인
  {const off=(pts,o)=>pts.map((p,i)=>{const q=pts[(i+1)%pts.length];
     const dx=q.x-p.x,dz=q.z-p.z,l=Math.hypot(dx,dz)||1;
     return{x:p.x+dz/l*o,z:p.z-dx/l*o};});
   mb.texPath(off(road,5.7),.35,"rgba(244,248,252,.85)");
   mb.texPath(off(road,-5.7),.35,"rgba(244,248,252,.85)");
   // 스타트/피니시 라인
   const a=road[0],b=road[4];
   mb.texRect(a.x,a.z,13,1.6,Math.atan2(b.x-a.x,b.z-a.z),"rgba(240,244,250,.95)");}
  w.checkpoints=pathCheckpoints(road,30,16);
  mb.paintLanes();
  w.waypoints=pathWaypoints(road,true,52);
  w.spawn={x:road[0].x,z:road[0].z,yaw:Math.atan2(road[4].x-road[0].x,road[4].z-road[0].z)};
  return mb.finalize(this);}},
];

/* ---------- 7. 그랜드 시티 (오픈월드) ---------- */
MAPS.push(
{id:"grand",name:"그랜드 시티",icon:"🌆",desc:"1.4km² 오픈월드 — 도심·순환고속도로·언덕·호수·공업지구·방지턱",
 modes:["free","time","race","drift"],
 build(){
  const mb=new MapBuilder(1200,224),w=mb.world;
  mb.fill((x,z)=>{
    let h=1.2*Math.sin(x*.008)*Math.cos(z*.009);
    const hd=Math.hypot(x-380,z+380);h+=22*Math.exp(-hd*hd/64800);   // 언덕(북동)
    const h2=Math.hypot(x-260,z+170);h+=9*Math.exp(-h2*h2/28800);
    const ld=Math.hypot(x+350,z-300);                                 // 호수(북서)
    let s=S_GRS;
    if(ld<95){h=Math.min(h,-.35);s=S_WET;}
    else if(ld<115){h*=.3;s=S_SND;}
    return[h,s];});
  // 도심 격자 (pitch 90, 5x5)
  for(let k=-2;k<=2;k++){
    mb.paintPath([{x:-185,y:0,z:k*90},{x:185,y:0,z:k*90}],14,S_ASP,true,true);
    mb.paintPath([{x:k*90,y:0,z:-185},{x:k*90,y:0,z:185}],14,S_ASP,true,true);}
  // 순환 고속도로 (r≈420) — 언덕을 절개하며 통과
  const ring=samplePath([[420,0],[300,300],[0,420],[-300,300],[-420,0],[-300,-300],[0,-420],[297,-297]],true,360);
  mb.paintPath(ring,19,S_ASP,true,true);
  railAlong(mb,ring,19,0xb9c2cc);
  // 연결로 4방향
  for(const[a,b]of[[[185,0],[418,0]],[[-185,0],[-418,0]],[[0,185],[0,418]],[[0,-185],[0,-418]]])
    mb.paintPath([{x:a[0],y:0,z:a[1]},{x:b[0],y:0,z:b[1]}],14,S_ASP,true);
  // 베이크 건물
  let seed=11;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const BLD2=["bldA","bldB","bldC","bldD"];
  for(let bx=-2;bx<2;bx++)for(let bz=-2;bz<2;bz++){
    const cx=bx*90+45,cz=bz*90+45;
    for(let k=0;k<2;k++){
      const sc=20+rnd()*16;
      mb.baked(BLD2[(rnd()*4)|0],cx+(rnd()-.5)*(60-sc),cz+(rnd()-.5)*(60-sc),sc,
        ((rnd()*4)|0)*Math.PI/2,{y:0,collide:true,shrink:.92});}
    if(rnd()<.6)mb.baked("trees",cx+26,cz-26,12,rnd()*6,{y:0});}
  // 교외 주택(남서) — 차고 모델 + 나무
  for(let k=0;k<7;k++){
    const hx2=-330+((k%3)*36),hz2=-260-((k/3)|0)*40;
    mb.baked("garage",hx2,hz2,14,((k%4))*Math.PI/2,{collide:true,shrink:.9});
    if(k%2)mb.baked("treesTall",hx2+18,hz2+8,10+(k%3)*2,k,{});}
  for(let k=0;k<4;k++)
    mb.box(300+k*46,w.height(300+k*46,330)+5,330,38,10,26,0x77808c,{mu:.5,tag:"warehouse"});
  for(let k=0;k<6;k++)mb.prop("barrel",310+k*5,300);
  // 방지턱: 도심 스쿨존 (대형 16~22cm)
  for(const[bx,bz,yaw,h]of[[45,0,Math.PI/2,.16],[-45,0,Math.PI/2,.16],[0,45,0,.16],[0,-45,0,.16],[90,50,0,.22],[-90,-50,0,.22]])
    mb.bump(bx,bz,yaw,13,h);
  // 마리나 (북서 호수): 부두 + 정박한 보트
  {const lx=-350,lz=300;
   for(let k=0;k<3;k++)mb.box(lx-40+k*40,.2,lz-70,6,.4,60,0x8a6b45,{mu:.8,tag:"dock"});
   for(let k=0;k<5;k++)mb.box(lx-60+k*30,.5,lz-40-k*8,4,1,9,k%2?0xd8433b:0xe8e8e8,{yaw:.1*k,mu:.5,tag:"boat"});}
  // 언덕 스위치백 등반로 (북동 언덕 정상까지)
  {const sb=samplePath([[280,-250],[350,-320],[290,-380],[380,-410],[430,-360]],false,120);
   mb.paintPath(sb,10,S_ASP,true,true);railAlong(mb,sb,10,0xb9c2cc);}
  // 공사장 (대형 갭 점프대 + 자재) — 격자와 순환로 사이 공터
  mb.ramp(250,250,0,24,22,14,0xd8433b);
  mb.ramp(250,312,Math.PI,20,20,14,0xc7742f);
  for(let k=0;k<6;k++)mb.box(220+k*7,.6,250,6,1.2,2,0xcaa23a,{yaw:k,mu:.8,tag:"beam"});
  for(let k=0;k<3;k++)mb.box(210,2.4+k*.1,270+k*4,10,.2,3.6,0x7a828c,{mu:.7,tag:"scaffold"});
  // 언덕 비포장길
  const dirt=samplePath([[220,-140],[300,-230],[380,-330],[430,-390]],false,80);
  for(const p of dirt)mb.stamp(p.x,p.z,6,(i,j)=>w.setS(i,j,SURF_ID.gravel));
  mb.texPath(dirt,11,SURF_CSS[SURF_ID.gravel]);
  // 언덕·호수 나무
  for(let k=0;k<16;k++){
    const tx=240+rnd()*220,tz=-160-rnd()*220;
    mb.baked(rnd()<.5?"trees":"treesTall",tx,tz,10+rnd()*5,rnd()*6,{});}
  for(let k=0;k<6;k++)mb.baked("treesTall",-350+Math.cos(k*1.05)*130,300+Math.sin(k*1.05)*130,11,k,{});
  // 가로등·표지판
  for(let k=-1;k<=1;k++){mb.prop("lamp",10,k*90+25,Math.PI);mb.prop("sign",k*90+10,10,0);}
  w.checkpoints=pathCheckpoints(ring,24,18);
  w.waypoints=pathWaypoints(ring,true,50);
  w.spawn={x:0,z:-60,yaw:0};
  mb.paintLanes();
  return mb.finalize(this);}});

/* ---------- 8. 서스펜션 랩 ---------- */
MAPS.push(
{id:"susp",name:"서스펜션 랩",icon:"🔩",desc:"높이별 방지턱 6~35cm·빨래판·트위스트·언덕 4단·경사 12/20/30°·모굴·시소·테이블탑 점프·록크롤",
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
    // 경사로 12/20/30° (오르막-정상-내리막 사다리꼴) — 더 높게
    if(Math.abs(x-RAMPX)<28){
      const edge=clamp((28-Math.abs(x-RAMPX))/9,0,1);
      const wedge=(z0,up,top,down,H)=>{
        if(z<z0||z>z0+up+top+down)return 0;
        if(z<z0+up)return H*(z-z0)/up;
        if(z<z0+up+top)return H;
        return H*(1-(z-z0-up-top)/down);};
      h+=(wedge(-190,38,14,30,8)+wedge(-90,34,14,26,14)+wedge(10,30,16,24,22))*edge;}
    if(Math.abs(x)>360||Math.abs(z)>360)return[h,S_GRS];
    return[h,S_ASP];});
  // 1레인: 높이별 방지턱 6~35cm (대형)
  const hs=[.06,.10,.15,.20,.27,.35];
  hs.forEach((h,k)=>{
    mb.bump(LANES[0],-150+k*42,0,15,h);
    mb.texText(LANES[0]-10,-158+k*42,4,Math.round(h*100)+"cm");});
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
  mb.texText(HILLX,-176,4,"언덕 3~18m");
  mb.texText(RAMPX,-176,4,"경사 12/20/30°");
  // 6레인: 모굴 필드 (지그재그 대형 범프) — 롤·피치 복합
  for(let k=0;k<16;k++){
    const off=((k%3)-1)*5;
    mb.bump(LANES[5]+off,-160+k*17,0,7,.14+ (k%2)*.06);}
  mb.texText(LANES[5],-176,4,"모굴 필드");
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
