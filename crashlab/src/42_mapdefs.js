/* ============================================================
   Map definitions (6 built-in + custom loader)
   ============================================================ */
const S_ASP=SURF_ID.asphalt,S_GRS=SURF_ID.grass,S_SND=SURF_ID.sand,S_GRV=SURF_ID.gravel,
      S_ICE=SURF_ID.ice,S_SNW=SURF_ID.snow,S_CRB=SURF_ID.curb,S_WET=SURF_ID.wet,S_WLK=SURF_ID.walk;

const MAPS=[
/* ---------- 1. 프루빙 그라운드 ---------- */
{id:"proving",name:"프루빙 그라운드",icon:"🧪",desc:"가속로·충돌벽·램프·슬라럼·스키드패드·낙하 타워",
 modes:["free","crash","drift"],
 build(){
  const mb=new MapBuilder(560,224),w=mb.world;
  mb.fill((x,z)=>[0,S_ASP]);
  // perimeter grass ring
  mb.fill2=null;
  const half=270;
  for(let j=0;j<=w.res;j++)for(let i=0;i<=w.res;i++){
    const x=i*w.cell-280,z=j*w.cell-280;
    if(Math.abs(x)>half-18||Math.abs(z)>half-18)w.setS(i,j,S_GRS);}
  // 가속로: 선명한 노면 마킹
  mb.texPath([{x:-80,z:-225},{x:-80,z:214}],14,"rgb(58,62,70)");
  mb.texPath([{x:-80,z:-225},{x:-80,z:210}],.35,"rgba(244,248,252,.95)",[3,3]);
  for(let z=-200;z<=200;z+=50)mb.texRect(-80,z,14,.8,0,"rgba(213,90,80,.9)");
  mb.texRect(-80,180,14,1.2,0,"rgba(120,220,160,.95)"); // 스피드 트랩 라인
  // crash walls (concrete + barrier) at end of strip
  mb.box(-80,2.2,232,26,4.4,3,0x9aa2ab,{mu:.6,bounce:.05,tag:"wall"});
  mb.box(-40,1,210,14,2,2,0xd8433b,{mu:.5,bounce:.3,tag:"barrier"});
  // speed trap
  w.triggers=[{x:-80,z:180,r:10,type:"trap"}];
  // ramps 15/30/45
  mb.ramp(30,40,0,15,16,10);mb.ramp(52,40,0,30,12,10);mb.ramp(74,40,0,45,9,10);
  // kick ramp (banked → flips)
  mb.box(30,-0,120,10,1,9,0xc7742f,{pitch:-18*DEG,roll:14*DEG,mu:1,tag:"kick"});
  // slalom cones
  for(let k=0;k<8;k++)mb.prop("cone",10+((k%2)*8-4),-60-k*22);
  // 과속방지턱 시험 구간
  for(let k=0;k<5;k++)mb.bump(-20,-60-k*16,0,11);
  // skidpad R30 (선명한 링 + 중심점)
  mb.texCircle(150,-120,30,"rgba(244,248,252,.9)",.45);
  mb.texCircle(150,-120,.7,"rgba(244,248,252,.9)");
  mb.texPath([{x:10,z:-48},{x:10,z:-228}],.3,"rgba(255,210,80,.75)",[2,2]); // 슬라럼 기준선
  // drop towers 10m & 20m with access ramps
  const tower=(x,z,h)=>{
    mb.box(x,h-.5,z,26,1,26,0x7f8791,{mu:1,tag:"tower"});             // deck
    const rl=h/Math.tan(22*DEG);
    mb.box(x,h*.5-.5,z-13-rl*.5+.2,12,1,rl/Math.cos(22*DEG),0x8f98a3,{pitch:-22*DEG,mu:1,tag:"ramp"});
    for(const s of[-1,1])mb.box(x+s*13.2,h+.6,z,.4,1.6,26,0xb9c2cc,{mu:.4,tag:"rail"});}; // 전방(+z) 개방 → 낙하
  tower(160,120,10);tower(220,140,20);
  // barrels near barrier
  for(let k=0;k<4;k++)mb.prop("barrel",-40+k*3,200);
  for(let k=0;k<8;k++)mb.baked(k%2?"trees":"treesTall",-262+k*70,262,11,k,{});
  w.spawn={x:-80,z:-220,yaw:0};
  return mb.finalize(this);}},

/* ---------- 2. 네오시티 ---------- */
{id:"city",name:"네오시티",icon:"🏙️",desc:"6×6 블록 시가지 — 골목·고가도로·로터리·파괴 오브젝트",
 modes:["free","time","race","drift"],
 build(){
  const mb=new MapBuilder(640,224),w=mb.world;
  const pitch=96,half=288;
  mb.fill((x,z)=>{
    // roads on grid lines every 96m, width 16
    const rx=Math.abs(((x%pitch)+pitch*1.5)%pitch-pitch*.5),rz=Math.abs(((z%pitch)+pitch*1.5)%pitch-pitch*.5);
    const road=rx<8||rz<8;
    const walk=!road&&(rx<11||rz<11);
    if(Math.abs(x)>half||Math.abs(z)>half)return[0,S_GRS];
    return[0,road?S_ASP:walk?S_WLK:S_GRS];});
  // 차선 (도로 중앙 점선)
  for(let j=0;j<=w.res;j++)for(let i=0;i<=w.res;i++){
    const x=i*w.cell-320,z=j*w.cell-320;
    if(Math.abs(x)>half||Math.abs(z)>half)continue;
    if(w.sMap[w.idx(i,j)]!==S_ASP)continue;
    const rx=Math.abs(((x%pitch)+pitch*1.5)%pitch-pitch*.5),rz=Math.abs(((z%pitch)+pitch*1.5)%pitch-pitch*.5);
    if((rx<.9&&((z%9+9)%9)<4&&rz>10)||(rz<.9&&((x%9+9)%9)<4&&rx>10))w.setS(i,j,SURF_ID.lane);}
  // roundabout at center + 분수
  mb.stamp(0,0,22,(i,j,d)=>{w.setS(i,j,S_ASP);});
  mb.stamp(0,0,9,(i,j,d)=>{w.setS(i,j,S_WLK);});
  mb.baked("fountain",0,0,15,0,{y:0,collide:true,shrink:.75});
  // 선명한 도로/보도/차선 (벡터)
  for(let k=-2;k<=2;k++){
    mb.texPath([{x:-half,z:k*pitch},{x:half,z:k*pitch}],22,SURF_CSS[S_WLK]);
    mb.texPath([{x:k*pitch,z:-half},{x:k*pitch,z:half}],22,SURF_CSS[S_WLK]);}
  for(let k=-2;k<=2;k++){
    mb.texPath([{x:-half,z:k*pitch},{x:half,z:k*pitch}],16,SURF_CSS[S_ASP]);
    mb.texPath([{x:k*pitch,z:-half},{x:k*pitch,z:half}],16,SURF_CSS[S_ASP]);}
  for(let k=-2;k<=2;k++){
    mb.texPath([{x:-half,z:k*pitch},{x:half,z:k*pitch}],.32,"rgba(242,246,252,.9)",[4.5,4.5]);
    mb.texPath([{x:k*pitch,z:-half},{x:k*pitch,z:half}],.32,"rgba(242,246,252,.9)",[4.5,4.5]);}
  mb.texCircle(0,0,22,SURF_CSS[S_ASP]);
  mb.texCircle(0,0,9,SURF_CSS[S_WLK]);
  mb.texCircle(0,0,15.5,"rgba(242,246,252,.8)",.35);
  // 베이크 건물 (Kenney City Builder Kit)
  let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const BLD=["bldA","bldB","bldC","bldD","garage"];
  for(let bx=-2.5;bx<=2.5;bx++)for(let bz=-2.5;bz<=2.5;bz++){
    if(Math.abs(bx)<1&&Math.abs(bz)<1)continue;
    const cx=bx*pitch,cz=bz*pitch;
    const n=1+((rnd()*2)|0);
    for(let k=0;k<n;k++){
      const nm=BLD[(rnd()*5)|0];
      const sc=22+rnd()*16;
      const ox=cx+(rnd()-.5)*(66-sc),oz=cz+(rnd()-.5)*(66-sc);
      mb.baked(nm,ox,oz,sc,((rnd()*4)|0)*Math.PI/2,{y:0,collide:true,shrink:.92});}
    // 블록 코너 가로수
    if(rnd()<.75)mb.baked(rnd()<.5?"trees":"treesTall",cx+30,cz+30,11+rnd()*4,rnd()*6,{y:0});}
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
  // 과속방지턱: 로터리 진입로 4곳 + 스쿨존 2곳
  mb.bump(34,0,Math.PI/2,14);mb.bump(-34,0,Math.PI/2,14);
  mb.bump(0,34,0,14);mb.bump(0,-34,0,14);
  mb.bump(96,44,0,14);mb.bump(96,-44,0,14);
  mb.bump(-52,-96,Math.PI/2,14);mb.bump(52,-96,Math.PI/2,14);
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
   for(let k=0;k<26;k++){
     const p=road[(rr()*road.length)|0];
     const off=18+rr()*40,ang=rr()*Math.PI*2;
     const tx=p.x+Math.cos(ang)*off,tz=p.z+Math.sin(ang)*off;
     if(w.surf(tx,tz)===S_GRS)mb.baked("treesTall",tx,tz,9+rr()*5,rr()*6,{});}}
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
  // grandstand + 나무
  mb.box(-180,4,-268,60,8,10,0x39424e,{mu:.5,tag:"stand"});
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
  // 방지턱: 도심 스쿨존
  for(const[bx,bz,yaw]of[[45,0,Math.PI/2],[-45,0,Math.PI/2],[0,45,0],[0,-45,0],[90,50,0],[-90,-50,0]])
    mb.bump(bx,bz,yaw,13);
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
{id:"susp",name:"서스펜션 랩",icon:"🔩",desc:"높이별 방지턱·빨래판·트위스트·언덕 4단·경사 8/15/25°·자갈밭·계단",
 modes:["free"],
 build(){
  const mb=new MapBuilder(600,224),w=mb.world;
  const LANES=[-150,-90,-30,30,100,170];
  mb.fill((x,z)=>{
    let h=0;
    // 4레인: 언덕 4단 (가우시안 능선)
    if(Math.abs(x-30)<26){
      const edge=clamp((26-Math.abs(x-30))/8,0,1);
      for(const[zc,H]of[[-120,1.5],[-55,3],[15,5],[100,8]]){
        const s2=(H*2.2)*(H*2.2);
        h+=H*Math.exp(-((z-zc)*(z-zc))/(2*s2))*edge;}}
    // 5레인: 경사로 8/15/25° (오르막-정상-내리막 사다리꼴)
    if(Math.abs(x-100)<24){
      const edge=clamp((24-Math.abs(x-100))/8,0,1);
      const wedge=(z0,up,top,down,H)=>{
        if(z<z0||z>z0+up+top+down)return 0;
        if(z<z0+up)return H*(z-z0)/up;
        if(z<z0+up+top)return H;
        return H*(1-(z-z0-up-top)/down);};
      h+=(wedge(-160,36,12,26,5)+wedge(-70,30,12,24,8)+wedge(20,26,14,22,12))*edge;}
    if(Math.abs(x)>282||Math.abs(z)>282)return[h,S_GRS];
    return[h,S_ASP];});
  // 1레인: 높이별 방지턱 4~16cm
  const hs=[.04,.06,.08,.10,.13,.16];
  hs.forEach((h,k)=>{
    mb.bump(LANES[0],-140+k*38,0,13,h);
    mb.texText(LANES[0]-9,-146+k*38,3.2,Math.round(h*100)+"cm");});
  // 2레인: 빨래판 (슬랫 18개)
  for(let k=0;k<18;k++)
    mb.box(LANES[1],w.height(LANES[1],-140+k*1.35)+.018,-140+k*1.35,12,.036,.5,0x8f98a3,{mu:1,tag:"slat"});
  for(let k=0;k<8;k++)
    mb.box(LANES[1],.03,-60+k*3.4,12,.06,.9,0x8f98a3,{mu:1,tag:"slat"});
  mb.texText(LANES[1],-152,3.2,"빨래판");
  // 3레인: 트위스트 (좌우 엇갈림 → 대각 롤 유발)
  for(let k=0;k<10;k++)
    mb.bump(LANES[2]+(k%2?-3.2:3.2),-140+k*16,0,7,.11);
  mb.texText(LANES[2],-152,3.2,"트위스트");
  mb.texText(30,-152,3.2,"언덕 1.5~8m");
  mb.texText(100,-152,3.2,"경사 8°/15°/25°");
  // 6레인: 자갈밭(랜덤 슬랫) + 계단 + 연석 타격
  {let sd=41;const rr=()=>{sd=(sd*48271)%2147483647;return sd/2147483647;};
   for(let k=0;k<46;k++)
     mb.box(LANES[5]+(rr()-.5)*10,.014,-140+rr()*90,1.2+rr()*1.6,.028+rr()*.03,.8+rr(),0x77808c,
       {yaw:rr()*3,mu:1,tag:"cobble"});}
  for(let k=0;k<3;k++)
    mb.box(LANES[5],.06+k*.12,-20+k*1.4,12,.12,1.4,0x9aa2ab,{mu:1,tag:"stair"});
  mb.box(LANES[5],.09,30,12,.18,.9,0xb5443c,{mu:1,tag:"curb"});
  mb.texText(LANES[5],-152,3.2,"자갈·계단·연석");
  // 레인 구분선 + 출발 안내
  for(const lx of LANES)
    mb.texPath([{x:lx,z:-170},{x:lx,z:150}],.3,"rgba(255,210,80,.5)",[2.5,2.5]);
  mb.texText(0,-210,5,"SUSPENSION LAB","rgba(240,244,250,.85)");
  for(let k=0;k<4;k++)mb.baked(k%2?"trees":"treesTall",-250+k*160,250,11,k,{});
  w.spawn={x:0,z:-235,yaw:0};
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
