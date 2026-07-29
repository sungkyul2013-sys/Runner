/* ============================================================
   Map definitions (6 built-in + custom loader)
   ============================================================ */
const S_ASP=SURF_ID.asphalt,S_GRS=SURF_ID.grass,S_SND=SURF_ID.sand,S_GRV=SURF_ID.gravel,
      S_ICE=SURF_ID.ice,S_SNW=SURF_ID.snow,S_CRB=SURF_ID.curb,S_WET=SURF_ID.wet,S_WLK=SURF_ID.walk;

const MAPS=[
/* ---------- 1. 프루빙 그라운드 ---------- */
{id:"proving",name:"프루빙 그라운드",icon:"🧪",desc:"초대형 뱅크드 오벌·가속로·충돌벽·압착기·서스펜션 랩 14레인(대형턱·급단차·뱅크·럼블스트립·편측턱·포트홀·주파수스윕·자갈길·젖은노면·오르막턱)·힐클라임·오프로드·램프·스키드패드·낙하타워·IIHS",
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

  /* 9: 꿀렁임(롱웨이브) 레인 — 파장이 긴 노면 굴곡으로 서스펜션이 계속 상하로 일한다.
        짧은 방지턱과 달리 차체가 통째로 출렁이며 댐퍼·리바운드 특성이 드러난다. */
  {const LX=362;
   mb.stamp(LX,sz0+82,26,(i,j,d)=>w.setS(i,j,S_ASP));
   mb.texRect(LX,sz0+82,24,186,0,SURF_CSS[S_ASP]);
   for(let k=0;k<10;k++)
     w.addRippleZone(LX,sz0+6+k*18,15,.05+.022*(k%3),3.0+1.5*(k%3),1+(k%2));
   for(let k=0;k<6;k++)mb.bump(LX,sz0+20+k*30,0,13,.20+.05*(k%3),"flat");
   mb.texText(LX,sz0-8,2.8,"UNDULATION","rgba(240,244,250,.7)");}

  /* ══ 서스펜션 시험장 확장 (10~14레인) — 실제 시험장의 대표 노면들 ══ */

  /* 10: 럼블 스트립 레인 — 홈 간격 3단계(0.35 / 0.55 / 0.90m).
        '두두둑' 진동이 속도에 따라 어떻게 변하는지 그대로 느껴지는 구간. */
  {const RX=386;
   mb.stamp(RX,sz0+80,15,(i,j)=>w.setS(i,j,S_ASP));
   mb.texRect(RX,sz0+80,26,190,0,SURF_CSS[S_ASP]);
   [[.35,.009],[.55,.012],[.90,.016]].forEach(([pitch,amp],k)=>{
     mb.rumbleZone(RX,sz0+22+k*56,0,22,amp,pitch);
     mb.texText(RX-9,sz0+22+k*56-26,2.2,(pitch*100|0)+"mm","rgba(240,244,250,.6)");});
   mb.texText(RX,sz0-8,2.8,"RUMBLE","rgba(240,244,250,.7)");}

  /* 11: 스플릿(편측) 레인 — 좌·우 한쪽 바퀴만 타는 턱.
        롤 강성·안티롤바·좌우 하중 이동이 드러난다. */
  {const PX=412;
   mb.stamp(PX,sz0+80,14,(i,j)=>w.setS(i,j,S_ASP));
   mb.texRect(PX,sz0+80,24,190,0,SURF_CSS[S_ASP]);
   for(let k=0;k<12;k++){
     const sgn=k%2?1:-1;                       // 좌/우 교대
     /* 폭 2.6m·중심 ±1.0m — 한쪽 바퀴만 정확히 타고 반대쪽은 평지에 남는다 */
     mb.bump(PX+sgn*1.0,sz0+12+k*14,0,2.6,.10+.03*(k%3),k%3===2?"sharp":"round");}
   mb.texText(PX,sz0-8,2.8,"SPLIT","rgba(240,244,250,.7)");}

  /* 12: 포트홀 군집 레인 — 깊이·지름이 다른 구덩이 연속.
        리바운드가 부족하면 바퀴가 구덩이를 못 따라가고 '쿵' 하고 받는다. */
  {const HX2=438;
   mb.stamp(HX2,sz0+80,13,(i,j)=>w.setS(i,j,S_ASP));
   mb.texRect(HX2,sz0+80,22,190,0,SURF_CSS[S_ASP]);
   let sd=311;const rr=()=>{sd=(sd*48271)%2147483647;return sd/2147483647;};
   for(let k=0;k<22;k++)
     mb.pothole(HX2+(rr()-.5)*11,sz0+8+k*8+(rr()-.5)*3,1.1+rr()*1.8,.09+rr()*.15);
   mb.texText(HX2,sz0-8,2.8,"POTHOLE","rgba(240,244,250,.7)");}

  /* 13: 주파수 스윕 레인 — 턱 간격이 12m→2m로 점점 좁아진다.
        일정 속도로 달리면 어느 지점에서 차체가 공진하는지(울렁임 최대) 바로 보인다. */
  {const FX=462;
   mb.stamp(FX,sz0+80,13,(i,j)=>w.setS(i,j,S_ASP));
   mb.texRect(FX,sz0+80,22,190,0,SURF_CSS[S_ASP]);
   let zz=sz0+10;
   for(let k=0;k<16&&zz<sz0+178;k++){
     mb.bump(FX,zz,0,12,.055,"round");
     zz+=12-k*.62;}                            // 간격 12m → 2.7m
   mb.texText(FX,sz0-8,2.8,"SWEEP","rgba(240,244,250,.7)");}

  /* 14: 자갈·돌길(코블스톤) — 자잘한 요철이 촘촘. 잔진동 흡수 능력 시험 */
  {const CB=486;
   mb.stamp(CB,sz0+80,12,(i,j)=>w.setS(i,j,S_GRV));
   let sd=733;const rr=()=>{sd=(sd*48271)%2147483647;return sd/2147483647;};
   for(let k=0;k<70;k++)
     mb.rough(CB+(rr()-.5)*18,sz0+6+rr()*180,rr()*3.14,2.2+rr()*2.4,.02+rr()*.05,
              rr()<.5?"round":"sharp");
   mb.rumbleZone(CB,sz0+90,0,24,.007,.42,false);
   mb.texText(CB,sz0-8,2.8,"COBBLE","rgba(240,244,250,.7)");}

  /* ══ 서스펜션 시험장 확장 2차 (15~18레인) ══ */

  /* 15: 저턱 레인 — 3~7cm짜리 낮고 완만한 턱 연속.
        큰 턱에서는 안 보이는 '잔거동'(초기 감쇠·미세 상하 진동)을 본다. */
  {const LB=510;
   /* stamp 는 반경만큼의 '원' 하나라 레인 전체가 칠해지지 않는다 —
      레인 축을 따라 포장한다 */
   mb.paintPath([{x:510,y:0,z:sz0-4},{x:510,y:0,z:sz0+188}],24,S_ASP,false,true);
   mb.texRect(LB,sz0+80,20,190,0,SURF_CSS[S_ASP]);
   for(let k=0;k<14;k++)
     mb.bump(LB,sz0+10+k*12.5,0,11,.030+(k%4)*.013,"round");
   mb.texText(LB,sz0-8,2.8,"LOW BUMP","rgba(240,244,250,.7)");}

  /* 16: 꿀렁임(롱웨이브) 레인 — 파장 9~16m의 완만한 기복.
        차체 고유진동(1~1.5Hz)을 정면으로 때려 '출렁임'을 그대로 드러낸다. */
  {const WV=534;
   /* stamp 는 반경만큼의 '원' 하나라 레인 전체가 칠해지지 않는다 —
      레인 축을 따라 포장한다 */
   mb.paintPath([{x:534,y:0,z:sz0-4},{x:534,y:0,z:sz0+188}],24,S_ASP,false,true);
   mb.texRect(WV,sz0+80,20,190,0,SURF_CSS[S_ASP]);
   let zz=sz0+12;
   for(let k=0;k<13&&zz<sz0+180;k++){
     const wl=9+(k%3)*3.5;                       // 파장 9 / 12.5 / 16m
     mb.bump(WV,zz,0,11,.085+(k%2)*.035,"round");
     zz+=wl;}
   mb.texText(WV,sz0-8,2.8,"WAVE","rgba(240,244,250,.7)");}

  /* 17: 트위스트 레인 — 좌·우 턱이 엇갈려 배치된다.
        한쪽 앞바퀴가 올라갈 때 반대쪽은 내려가 차체가 비틀린다(대각 비틀림 강성 시험). */
  {const TW=558;
   /* stamp 는 반경만큼의 '원' 하나라 레인 전체가 칠해지지 않는다 —
      레인 축을 따라 포장한다 */
   mb.paintPath([{x:558,y:0,z:sz0-4},{x:558,y:0,z:sz0+188}],26,S_ASP,false,true);
   mb.texRect(TW,sz0+80,22,190,0,SURF_CSS[S_ASP]);
   for(let k=0;k<16;k++){
     const sx=(k%2)?1:-1;                        // 한 칸 걸러 좌·우
     mb.bump(TW+sx*4.6,sz0+10+k*11,0,6.4,.115,"round");}
   mb.texText(TW,sz0-8,2.8,"TWIST","rgba(240,244,250,.7)");}

  /* 18: 숏하이 레인 — 짧고 높은 턱(폭 0.7m·높이 18~26cm).
        천천히 넘으면 스트로크, 빠르게 넘으면 충격 — 블로우오프 특성이 드러난다. */
  {const SH=582;
   /* stamp 는 반경만큼의 '원' 하나라 레인 전체가 칠해지지 않는다 —
      레인 축을 따라 포장한다 */
   mb.paintPath([{x:582,y:0,z:sz0-4},{x:582,y:0,z:sz0+188}],24,S_ASP,false,true);
   mb.texRect(SH,sz0+80,20,190,0,SURF_CSS[S_ASP]);
   for(let k=0;k<7;k++)
     mb.bump(SH,sz0+18+k*24,0,11,.18+(k%3)*.04,"sharp");
   mb.texText(SH,sz0-8,2.8,"SHORT-HIGH","rgba(240,244,250,.7)");}

  /* 신설 레인 진입·탈출 에이프런 — 기존 시험장 포장과 이어 붙여 고립 구역이 생기지 않게.
     (감사 결과 신설 레인만 별도 섬으로 잡히던 문제) */
  {const A0=sz0-16, A1=sz0+192;
   for(const az of[A0,A1])
     mb.paintPath([{x:352,y:0,z:az},{x:594,y:0,z:az}],20,S_ASP,false,false);
   mb.paintPath([{x:352,y:0,z:A0},{x:352,y:0,z:A1}],18,S_ASP,false,false);
   mb.paintPath([{x:494,y:0,z:A0},{x:494,y:0,z:A1}],18,S_ASP,false,false);
   mb.paintPath([{x:594,y:0,z:A0},{x:594,y:0,z:A1}],18,S_ASP,false,false);
   /* 시험장 본체(x≈180, '🔩 서스펜션 시험장' 지점)까지 연결 — 동쪽 레인 전체가
      별도 네트워크로 떨어져 차로 갈 수 없던 문제(꿀렁임 레인 포함)를 함께 해결 */
   mb.paintPath([{x:150,y:0,z:A0},{x:352,y:0,z:A0}],20,S_ASP,false,false);
   mb.paintPath([{x:150,y:0,z:A0},{x:150,y:0,z:sz0+40}],18,S_ASP,false,false);}

  /* === 🏁 핸들링 서킷(인필드 로드코스) — 헤어핀·에스·고속 코너 복합 폐곡선 === */
  {const CX=110,CZ=150;
   const raw=[[CX-96,CZ-84],[CX-20,CZ-98],[CX+62,CZ-74],[CX+98,CZ-18],
              [CX+58,CZ+22],[CX+90,CZ+64],[CX+40,CZ+94],[CX-32,CZ+86],
              [CX-54,CZ+40],[CX-98,CZ+14]];
   const trk=samplePath(raw,true,26);
   for(const p of trk)p.y=0;
   flattenCorridor(mb,trk,10,15,()=>0);
   mb.paintPath(trk,17,S_ASP,true,true);
   for(let k=0;k<trk.length;k+=3){          // 커브(연석) — 낮게 깔아 주행을 막지 않음
     const a=trk[k],b=trk[(k+1)%trk.length];
     const dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz)||1,nx=-dz/L,nz=dx/L;
     for(const sgn of[-1,1])
       mb.box(a.x+nx*sgn*9.4,.04,a.z+nz*sgn*9.4,1.5,.08,3.4,((k/3)|0)%2?0xd8433b:0xe9eef4,
         {yaw:Math.atan2(dx,dz),mu:1,tag:"curb"});}
   // 서킷 노면 위에 남은 기존 오브젝트(바위·뱅크 등) 정리 — 코스가 막히지 않게
   {const kept=[];let n=0;
    for(const o of w.boxes){
      if(o.tag==="curb"){kept.push(o);continue;}
      let near=false;
      for(let k=0;k<trk.length;k+=2){
        if(Math.hypot(o.c.x-trk[k].x,o.c.z-trk[k].z)<12+Math.max(o.half.x,o.half.z)){near=true;break;}}
      const gy=w.height(o.c.x,o.c.z);
      if(near&&o.c.y+o.half.y>gy+.3&&o.c.y-o.half.y<gy+3.2){n++;continue;}
      kept.push(o);}
    if(n){w.boxes.length=0;for(const o of kept)w.boxes.push(o);}}
   mb.texRect(CX-96,CZ-84,1.2,15,0,"rgba(244,248,252,.9)");   // 스타트/피니시 라인
   mb.texText(CX,CZ,9,"HANDLING CIRCUIT","rgba(240,244,250,.4)");}


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
    {name:"🥁 럼블 스트립",x:386,z:-278,yaw:0},
    {name:"↔️ 편측 턱(스플릿)",x:412,z:-278,yaw:0},
    {name:"🕳️ 포트홀 구간",x:438,z:-278,yaw:0},
    {name:"📈 주파수 스윕",x:462,z:-278,yaw:0},
    {name:"🪨 자갈·돌길",x:486,z:-278,yaw:0},
    {name:"⛰️ 힐클라임 오르막",x:-250,z:12,yaw:Math.PI},
    {name:"🏔️ 러프 오프로드",x:250,z:250,yaw:0},
    {name:"🛞 스키드패드",x:-250,z:-150,yaw:0},
    {name:"🎢 램프·점프대",x:-8,z:20,yaw:0},
    {name:"🗼 낙하 타워",x:-300,z:230,yaw:0},
    {name:"🚧 IIHS 충돌시험",x:30,z:270,yaw:0},
    {name:"🌊 꿀렁임 레인",x:362,z:-266,yaw:0},
    {name:"🪶 저턱 레인",x:510,z:-266,yaw:0},
    {name:"🌀 트위스트 레인",x:558,z:-266,yaw:0},
    {name:"⛰️ 숏하이 레인",x:582,z:-266,yaw:0},
    {name:"🏁 핸들링 서킷",x:14,z:66,yaw:Math.PI*.35}];
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
  /* 마샬 포스트는 트랙 '옆'에 세운다 — 예전에는 중심선 좌표를 그대로 써서
     주행선 한가운데에 기둥 8개가 박혀 있었다(실측: 레이스웨이 도로중앙 장애물 6건). */
  for(let k=0;k<8;k++){
    const i=(k*70)%road.length, rp=road[i], nx2=road[(i+3)%road.length];
    const dx=nx2.x-rp.x,dz=nx2.z-rp.z,l=Math.hypot(dx,dz)||1;
    const px=rp.x+dz/l*19, pz=rp.z-dx/l*19;
    mb.box(px,w.height(px,pz)+1.1,pz,.4,2.2,.4,0xffd23e,{mu:.5,tag:"marshal",noVis:false});}
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
{id:"grand",name:"메가시티 (오픈월드)",icon:"🌆",desc:"11.6km² 체계적 오픈월드 — 외곽 익스프레스웨이(요철·터널·뱅크·점프·스카이 링) 통합 — 도로 위계(벨트웨이·순환·8방 방사·격자)와 9개 지구: CBD·미드타운·워터프론트·모터스포츠·항만·공항·아레나·산악·교외. 📍장소 선택 스폰",
 modes:["free","time","race","drift"],
 build(){
  /* ==========================================================================
     MEGACITY — 체계적 도시 계획
     ① 지형(지구별 성격) → ② 대지 정지(플라토) → ③ 도로 그래프(위계) →
     ④ 도색(간선 먼저, 지역 나중) → ⑤ 지구 콘텐츠 → ⑥ 간선 재확정(연결 보장)
     ※ 도로는 '그래프'로 먼저 정의하므로 연결성이 구조적으로 보장된다.
     ========================================================================== */
  /* 외곽 익스프레스웨이(인피니티 하이웨이)를 품기 위해 맵을 넓혔다.
     셀 크기는 그대로 유지(2400/420=5.71 → 3400/600=5.67)해 기존 지구는 영향이 없다. */
  const SZ=3400;
  const mb=new MapBuilder(SZ,600),w=mb.world;      // cell ≈ 5.67m
  /* ---- 도시 상수(위계 반경) ---- */
  const R_CBD=340,          // CBD 격자 반경
        R_INNER=680,        // 내부 순환도로
        R_BELT=1060;        // 외곽 벨트웨이(고속)
  const GRID=100;           // CBD 블록 피치
  /* ---- 지구 중심 ---- */
  const D={
    lake:   [-780, 620],    // 워터프론트(북서)
    sport:  [ 760, 700],    // 모터스포츠 파크(북동)
    port:   [ 980,-120],    // 항만·공업(동)
    airport:[-140,-880],     // 공항(남)
    arena:  [-880,-720],    // 아레나(남서)
    mtn:    [ 830,-780],    // 산악 힐클라임(남동, 벨트웨이 바깥)
    burb:   [-960, 120],    // 교외 주택(서)
    mid:    [   0, 520],     // 미드타운(북)
  };

  /* ===== ① 지형 ===== */
  mb.fill((x,z)=>{
    // 완만한 롤링 기저
    let h=1.9*Math.sin(x*.0045)*Math.cos(z*.005)+1.1*Math.sin(x*.011+1)*Math.cos(z*.0095);
    /* 벨트웨이 회랑 억제 계수 —
       산·언덕의 가우시안 치맛자락이 외곽 순환 고속도로를 그대로 덮어
       도로가 30m 넘게 솟구치는 '거대한 언덕'이 생겼다(실측 (686,-737)에서 +34m).
       벨트 반경 부근에서는 지형 융기를 0으로 눌러 고속도로를 평탄하게 유지한다. */
    const rB=Math.hypot(x,z);
    const bf=clamp((Math.abs(rB-R_BELT)-80)/200,0,1);
    const beltEase=bf*bf*(3-2*bf);
    // 산악(남동, 벨트웨이 바깥) — 힐클라임용 큰 산
    const dm=Math.hypot(x-D.mtn[0],z-D.mtn[1]);h+=46*Math.exp(-dm*dm/74000)*beltEase;
    // 남서 언덕(아레나 배후)
    const da=Math.hypot(x-(D.arena[0]-120),z-(D.arena[1]-140));h+=26*Math.exp(-da*da/72000)*beltEase;
    // 북동 완만한 고원(모터스포츠 파크에 고저차 제공)
    const ds=Math.hypot(x-(D.sport[0]+130),z-(D.sport[1]+60));h+=15*Math.exp(-ds*ds/56000)*beltEase;
    // 도심권은 평평(높낮이는 입체교차로 표현)
    const rc=Math.hypot(x,z);
    if(rc<R_CBD+120)h*=.28;
    else if(rc<R_INNER)h*=.55;
    let s=S_GRS;
    // 호수(워터프론트)
    const ld=Math.hypot(x-D.lake[0],z-D.lake[1]);
    if(ld<150){h=Math.min(h,-.4);s=S_WET;}
    else if(ld<178){h*=.28;s=S_SND;}
    // 동측 해안(맵 끝)
    if(x>1090){s=x>1150?S_WET:S_SND;h=x>1150?Math.min(h,-.35):h*.28;}
    return[h,s];});

  /* ===== ② 대지 정지 — 반드시 도로보다 먼저 (경사지 강제 절개로 생기던 협곡·고립 방지) ===== */
  const plateau=(cx,cz,hx,hz,blend,y)=>{
    mb.stamp(cx,cz,hx+hz+blend,(i,j,d,px,pz)=>{
      const dx=Math.max(0,Math.abs(px-cx)-hx),dz=Math.max(0,Math.abs(pz-cz)-hz);
      const f=clamp(Math.hypot(dx,dz)/blend,0,1),idx=w.idx(i,j);
      w.hMap[idx]=lerp(y||0,w.hMap[idx],f*f);});};
  plateau(D.airport[0],D.airport[1]+50,500,190,150);   // 공항 대지
  plateau(D.port[0],D.port[1],230,290,130);            // 항만 야드
  plateau(D.sport[0],D.sport[1],300,240,160,8);        // 모터스포츠 파크(살짝 높은 대지)
  plateau(D.arena[0],D.arena[1],170,170,140,4);        // 아레나 대지

  /* ===== ③ 도로 그래프 (위계) =====
     간선은 '링(폐곡선)'과 '방사(간선)'으로만 정의하고, 지역 도로는 반드시 간선에 접속시킨다. */
  const ringPts=(r,n,jitter)=>{const a=[];
    for(let k=0;k<n;k++){const t=k/n*Math.PI*2;
      const rr=r*(1+(jitter||0)*Math.sin(t*3+1));
      a.push([Math.cos(t)*rr,Math.sin(t)*rr]);}
    return a;};
  // L0 외곽 벨트웨이 — 지형을 따라 오르내리며 계곡은 다리로
  const belt=bridgeValleys(followTerrain(w,samplePath(ringPts(R_BELT,14,.055),true,760)),.095);
  // L1 내부 순환 — 도심권이라 평탄
  const inner=samplePath(ringPts(R_INNER,12,.03),true,520);
  for(const p of inner)p.y=0;
  // L2 방사 간선 8방 — 내부 순환 ↔ 벨트웨이
  const RAD=8, radials=[];
  for(let k=0;k<RAD;k++){
    const a=k/RAD*Math.PI*2;
    const pIn=[Math.cos(a)*(R_INNER-6),Math.sin(a)*(R_INNER-6)];
    const pOut=[Math.cos(a)*(R_BELT-6),Math.sin(a)*(R_BELT-6)];
    const mid=[Math.cos(a)*(R_INNER+R_BELT)*.5+Math.sin(a)*54,
               Math.sin(a)*(R_INNER+R_BELT)*.5-Math.cos(a)*54];
    radials.push(bridgeValleys(followTerrain(w,samplePath([pIn,mid,pOut],false,150)),.11));}
  // L2b 도심 진입 간선 8방 — CBD 격자 ↔ 내부 순환
  const feeders=[];
  for(let k=0;k<RAD;k++){
    const a=k/RAD*Math.PI*2;
    feeders.push([[Math.cos(a)*(R_CBD-30),Math.sin(a)*(R_CBD-30)],
                  [Math.cos(a)*(R_INNER+8),Math.sin(a)*(R_INNER+8)]]);}

  /* L0b 그랜드 불러바드 — 도시를 동서/남북으로 완전히 관통하는 8차선 초장거리 직선.
     한 번도 꺾이지 않고 벨트웨이에서 벨트웨이까지 '쭉 직진'할 수 있도록 만든 축이다.
     · 동서축 z=+300 (중앙광장 로터리 r112·입체교차·지하 홀 북단 286 모두 회피)
     · 남북축 x=+200 (로터리·입체교차·터널 회피, 지하 홀 구간은 데크 위로 통과)
     도심권(r<620)은 격자와 높이를 맞추려 강제 평탄, 외곽은 지형을 따라 오르내린다. */
  const BLV_Z=300, BLV_X=200, BLR=R_BELT+40;
  const blvdFlat=(pts)=>{for(const p of pts){
      const f=clamp((Math.hypot(p.x,p.z)-620)/320,0,1);p.y*=f*f*(3-2*f);}
    return pts;};
  const blvdH=bridgeValleys(blvdFlat(followTerrain(w,samplePath([[-BLR,BLV_Z],[BLR,BLV_Z]],false,70))),.075);
  const blvdV=bridgeValleys(blvdFlat(followTerrain(w,samplePath([[BLV_X,-BLR],[BLV_X,BLR]],false,70))),.075);
  const paintBlvd=()=>{
    for(const bp of[blvdH,blvdV]){
      flattenCorridor(mb,bp,18,26);
      mb.paintPath(bp,32,S_ASP,true,true);}};

  /* ===== ④ 도색: 간선 먼저 ===== */
  // 벨트웨이(6차선급)
  flattenCorridor(mb,belt,17,30);
  mb.paintPath(belt,26,S_ASP,true,true);
  // 내부 순환(4차선)
  flattenCorridor(mb,inner,12,16,()=>0);
  mb.paintPath(inner,20,S_ASP,true,true);
  // 방사 간선
  for(const rp of radials){flattenCorridor(mb,rp,9,14);mb.paintPath(rp,16,S_ASP,true,true);}
  // 도심 진입 간선
  for(const[a,b]of feeders)
    mb.paintPath([{x:a[0],y:0,z:a[1]},{x:b[0],y:0,z:b[1]}],15,S_ASP,true,true);
  // 그랜드 불러바드(관통 직선) — 도색 후 코리도어를 '예약'해서
  // 이후 어떤 지구 콘텐츠(건물·난간·가로수·조형물)도 이 위에 생성되지 않게 한다.
  paintBlvd();
  mb.reserve(blvdH,19).reserve(blvdV,19);
  mb._resvOn=true;
  /* L3 CBD 격자 (pitch 100, |k|<=3 → 7×7 블록)
     ※ 중앙 광장(분수)은 로터리로 둘러싼다 — 예전엔 x=0/z=0 도로가 분수와 동상을 관통해
       시작 지점에서 주행이 막혔다. 광장 반경 안쪽(r<PL_R)에는 격자 도로를 깔지 않고,
       네 갈래 도로를 로터리에 접속시킨다. */
  const GK=3, PL_R=112, TUN=[-292,-216];        // 광장 반경 / 지하터널 구간(재확정 제외)
  const gridSeg=(a,b,horiz)=>{               // 광장 안쪽을 피해 분할 도색
    const pts=horiz?[{x:a,y:0,z:b},{x:-a,y:0,z:b}]:[{x:b,y:0,z:a},{x:b,y:0,z:-a}];
    mb.paintPath(pts,14,S_ASP,true,true);};
  const paintGrid=(skipTunnel)=>{
    for(let k=-GK;k<=GK;k++){
      const off=k*GRID;
      if(Math.abs(off)<PL_R){   // 광장을 지나는 축: 로터리 바깥 구간만
        mb.paintPath([{x:-R_CBD,y:0,z:off},{x:-PL_R+4,y:0,z:off}],14,S_ASP,true,true);
        mb.paintPath([{x:PL_R-4,y:0,z:off},{x:R_CBD,y:0,z:off}],14,S_ASP,true,true);
        // 세로축: 지하터널 구간(z∈TUN)은 건드리지 않음(정지작업이 터널을 메우던 버그 방지)
        if(skipTunnel&&off===0){
          mb.paintPath([{x:off,y:0,z:-R_CBD},{x:off,y:0,z:TUN[0]}],14,S_ASP,true,true);
          mb.paintPath([{x:off,y:0,z:TUN[1]},{x:off,y:0,z:-PL_R+4}],14,S_ASP,true,true);
        }else{
          mb.paintPath([{x:off,y:0,z:-R_CBD},{x:off,y:0,z:-PL_R+4}],14,S_ASP,true,true);}
        mb.paintPath([{x:off,y:0,z:PL_R-4},{x:off,y:0,z:R_CBD}],14,S_ASP,true,true);
      }else{
        mb.paintPath([{x:-R_CBD,y:0,z:off},{x:R_CBD,y:0,z:off}],14,S_ASP,true,true);
        mb.paintPath([{x:off,y:0,z:-R_CBD},{x:off,y:0,z:R_CBD}],14,S_ASP,true,true);}}
    // 광장 로터리(원형 도로) — 네 갈래가 모두 여기에 접속
    const rot=[];for(let k2=0;k2<=64;k2++){const a=k2/64*6.283;
      rot.push({x:Math.cos(a)*PL_R,y:0,z:Math.sin(a)*PL_R});}
    mb.paintPath(rot,15,S_ASP,true,true);};
  paintGrid(false);
  // 벨트웨이 가드레일 — 방사 간선 접속부는 개방(도로 막힘 금지)
  const radEnds=radials.map(rp=>rp[rp.length-1]);
  railAlong(mb,belt,26,0xb9c2cc,(a)=>radEnds.some(e=>Math.hypot(a.x-e.x,a.z-e.z)<44));
  // 내부 순환 가드레일 — 방사/피더 접속부 개방
  {const open=[];
   for(let k=0;k<RAD;k++){const a=k/RAD*Math.PI*2;
     open.push([Math.cos(a)*R_INNER,Math.sin(a)*R_INNER]);}
   railAlong(mb,inner,20,0xb9c2cc,(a)=>open.some(e=>Math.hypot(a.x-e[0],a.z-e[1])<50));}

  let seed=11;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const BLD2=["bldA","bldB","bldC","bldD"];

  /* ===== ⑤ 지구 콘텐츠 ===== */

  /* --- 지구 1: CBD (중앙 광장 + 다단 입체교차 + 고층) --- */
  // 중앙 광장(분수)
  {const fx=0,fz=0;
   mb.stamp(fx,fz,104,(i,j,d)=>w.setS(i,j,d>96?S_ASP:(d>92?S_WLK:S_ASP)));
   mb.texCircle(fx,fz,102,SURF_CSS[S_ASP]);
   mb.texCircle(fx,fz,94,SURF_CSS[S_WLK]);      // 로터리 안쪽 보도 링(광장 경계 명확)
   mb.texCircle(fx,fz,90,SURF_CSS[S_ASP]);
   mb.texCircle(fx,fz,54,"rgba(226,231,238,.26)",.7);
   mb.texCircle(fx,fz,9,SURF_CSS[SURF_ID.wet]);
   mb.baked("fountain",fx,fz,7,0,{y:0});
   mb.box(fx,.3,fz,18,.6,18,0x9aa2ab,{mu:.7,tag:"fountain"});
   for(let k=0;k<4;k++)mb.box(fx,.5+k*.5,fz,11-k*2.4,.9,11-k*2.4,k%2?0x9aa2ab:0x818b96,{mu:.7,tag:"fountain"});
   mb.box(fx,2.9,fz,1.0,2.6,1.0,0xb6bcc4,{mu:.7,tag:"fountain"});
   for(let q=0;q<4;q++){const a=q*Math.PI/2,sx=fx+Math.cos(a)*34,sz=fz+Math.sin(a)*34;
     mb.box(sx,1.0,sz,2.8,2.0,2.8,0x8b8378,{mu:.6,tag:"plinth"});
     mb.box(sx,2.7,sz,1.0,1.8,1.0,0xcfd3d8,{mu:.5,tag:"statue"});}
   for(let k=0;k<4;k++){const a=(k+.5)/4*6.283,px=fx+Math.cos(a)*58,pz=fz+Math.sin(a)*58;
     mb.box(px,.4,pz,7,.8,7,0x8a7a5c,{yaw:-a,mu:.7,tag:"planter"});
     mb.box(px,1.0,pz,6,.8,6,0x3f6b3a,{yaw:-a,mu:.7,tag:"hedge"});}
   for(let k=0;k<8;k++){const a=(k+.5)/8*6.283;mb.prop("lamp",fx+Math.cos(a)*76,fz+Math.sin(a)*76,-a);}
   mb.texText(fx,fz-66,7,"⛲ CENTRAL PLAZA","rgba(240,244,250,.5)");}
  // 4단 입체교차(지하 터널 · 지상 · L1 고가 · L3 플라이오버) — 스폰 바로 옆
  const heightAt=(pts,x)=>{for(let s=0;s<pts.length-1;s++){const a=pts[s],b=pts[s+1];
    if((x>=a.x&&x<=b.x)||(x<=a.x&&x>=b.x)){const t=(x-a.x)/((b.x-a.x)||1);return a.y+(b.y-a.y)*t;}}return 0;};
  const heightAt2=(pts,z)=>{for(let s=0;s<pts.length-1;s++){const a=pts[s],b=pts[s+1];
    if((z>=a.z&&z<=b.z)||(z<=a.z&&z>=b.z)){const t=(z-a.z)/((b.z-a.z)||1);return a.y+(b.y-a.y)*t;}}return 0;};
  /* 입체교차 스택은 광장 로터리(r=112) 남쪽으로 배치한다 — 예전엔 광장과 겹쳐
     터널 출구가 분수로 직결되고 데크가 광장을 가로질렀다. IZ만큼 남쪽으로 이동. */
  {const IZ=-220;
   const Z1=IZ-30, l1=[[-178,0],[-124,9],[-64,4],[0,12],[64,4],[124,9],[178,0]].map(([px,py])=>({x:px,z:Z1,y:py}));
   const Z2=IZ-96, l2=[[-152,0],[-96,10],[-58,19],[58,19],[96,10],[152,0]].map(([px,py])=>({x:px,z:Z2,y:py}));
   // 지하 딥(터널)은 '간선 재확정' 뒤에 판다(평탄화로 메워지는 버그 방지)
   bridgeDeck(mb,l1,15,{deck:0x565d68,rail:0xc9ced6});
   bridgeDeck(mb,l2,15,{deck:0x50565f,rail:0xbfc4cc});
   bridgeDeck(mb,[{x:150,z:IZ-42,y:8},{x:150,z:IZ-66,y:13},{x:128,z:IZ-90,y:19}],13,{deck:0x5a616c,rail:0xc9ced6});
   const L3X=-100, l3=[[IZ+72,0],[IZ+24,15],[IZ-30,22],[IZ-72,0]].map(([pz,py])=>({x:L3X,z:pz,y:py}));
   bridgeDeck(mb,l3,12,{deck:0x5b626d,rail:0xc9ced6});
   for(let z=IZ-64;z<=IZ+64;z+=16){const dy=heightAt2(l3,z);
     if(dy>3){const terr=Math.max(0,w.height(L3X,z));
       for(const s of[-1,1])mb.box(L3X+s*10,(dy+terr)/2,z,1.4,dy-terr,1.4,0x616872,{mu:.6,tag:"pillar"});}}
   for(const[pts,zc]of[[l1,Z1],[l2,Z2]])
     for(let x=-150;x<=150;x+=20){if(Math.abs(x)<14)continue;const dy=heightAt(pts,x);
       if(dy>2.4){const terr=Math.max(0,w.height(x,zc));
         for(const zo of[-5.5,0,5.5])mb.box(x,(dy+terr)/2,zc+zo,1.5,dy-terr,1.5,zo?0x616872:0x6b727c,{mu:.6,tag:"pillar"});}}
   mb.texText(0,IZ-96,7,"SPAWN INTERCHANGE","rgba(240,244,250,.5)");}
  // CBD 도로 경계(실선 + 연석) — 방해물 없이 경계만 명확히
  {const EXT=R_CBD,edge=7,curb=8.4,V=[-GRID,0,GRID],H=[-GRID,0,GRID];
   const nearSpawn=(x,z)=>Math.hypot(x,z+200)<56;
   const inItc=(x,z)=>z<-150&&z>-345&&Math.abs(x)<196;
   for(const X of V){
     for(const s of[-1,1])mb.texRect(X+s*edge,0,.42,2*EXT,0,"rgba(244,248,252,.92)");
     for(const s of[-1,1])mb.texRect(X+s*curb,0,1.4,2*EXT,0,SURF_CSS[S_WLK]);
     for(let z=-EXT+34;z<=EXT-34;z+=52){if(nearSpawn(X+10.5,z)||inItc(X+10.5,z))continue;
       mb.prop("lamp",X+10.5,z,Math.PI/2);}}
   for(const Z of H){
     for(const s of[-1,1])mb.texRect(0,Z+s*edge,2*EXT,.42,0,"rgba(244,248,252,.92)");
     for(const s of[-1,1])mb.texRect(0,Z+s*curb,2*EXT,1.4,0,SURF_CSS[S_WLK]);
     for(let x=-EXT+34;x<=EXT-34;x+=52){if(nearSpawn(x,Z+10.5)||inItc(x,Z+10.5))continue;
       mb.prop("lamp",x,Z+10.5,0);}}}
  // 스폰 주변 방지턱(간격 넓게) + 잔요철
  w.addRippleZone(0,-160,40,.014,2.2,3);
  w.addRippleZone(0,-330,34,.012,2.6,1);
  for(const[bx2,bz2,h,ty]of[[0,-160,.13,"round"],[0,-340,.16,"arch"],[0,150,.15,"sharp"],
      [-GRID,-45,.12,"round"],[GRID,-45,.14,"rumble"],[-GRID,80,.13,"arch"],[GRID,80,.12,"flat"]])
    mb.bump(bx2,bz2,0,13,h,ty);
  // CBD 고층 빌딩(블록 내부, 도로·광장·교차로 회피) + 옥상 디테일
  for(let bx=-GK;bx<GK;bx++)for(let bz=-GK;bz<GK;bz++){
    const cx=bx*GRID+GRID/2,cz=bz*GRID+GRID/2;
    if(Math.hypot(cx,cz)<112)continue;                       // 중앙 광장
    if(cz<-160&&cz>-340&&Math.abs(cx)<196)continue;          // 입체교차 풋프린트(광장 남측)
    if(Math.abs(cx+100)<26&&cz>-310&&cz<-140)continue;       // L3 플라이오버 라인
    /* 🏢 실사 지향 절차 건물 — 층별 창문·멀리언·코니스·셋백·옥상 설비.
       블록 내부에 도로 이격을 두고 1~2동 배치(도심은 초고층, 외곽은 중층). */
    const dense=Math.hypot(cx,cz)<230;
    const isNight=(Game&&Game.opts&&Game.opts.tod)==="night";
    for(let k=0;k<(dense?2:1);k++){
      const bw=(dense?22:18)+rnd()*(dense?16:10);
      const bd=(dense?22:18)+rnd()*(dense?16:10);
      const bh=dense?(46+rnd()*72):(18+rnd()*26);            // 도심 최고 118m급
      const jitter=(GRID-30-Math.max(bw,bd))*.5;
      const px=cx+(rnd()-.5)*Math.max(0,jitter)*2*(k?1:.4);
      const pz=cz+(rnd()-.5)*Math.max(0,jitter)*2*(k?.4:1);
      procBuilding(mb,px,pz,bw,bd,bh,(px*37+pz*91)|0,{night:isNight});}
    if(rnd()<.4)mb.baked(rnd()<.5?"trees":"treesTall",cx+34,cz-34,10+rnd()*4,rnd()*6,{y:0});}
  // 랜드마크 초고층 타워(셋백 3단 + 첨탑)
  {const top=procBuilding(mb,250,250,42,42,168,20250,{night:(Game&&Game.opts&&Game.opts.tod)==="night"});
   mb.box(250,top+11,250,1.2,22,1.2,0xd8433b,{mu:.5,tag:"mast"});
   mb.box(250,top+23,250,.5,4,.5,0xffd23e,{mu:.5,tag:"mast"});}

  /* --- 지구 2: 미드타운(북) — 중층 + 대형 주차장 + 드리프트 광장 --- */
  {const[mx,mz]=D.mid;
   // 집분로 루프(내부 순환에 접속)
   const loop=[];for(let k=0;k<=40;k++){const a=k/40*6.283;
     loop.push({x:mx+Math.cos(a)*168,y:0,z:mz+Math.sin(a)*118});}
   mb.paintPath(loop,13,S_ASP,true,true);
   mb.paintPath([{x:mx,y:0,z:mz-118},{x:mx,y:0,z:R_CBD}],14,S_ASP,true,true);   // CBD 연결
   // 대형 주차장
   {const px0=mx-210,pz0=mz-10;
    mb.stamp(px0,pz0,46,(i,j,d)=>w.setS(i,j,S_ASP));
    mb.texRect(px0,pz0,84,84,0,SURF_CSS[S_ASP]);
    const COLR=[0x9b2226,0x3d5a80,0x4a5a40,0xcfc9bd,0x2b2f36,0xc07a2f];
    for(let row=0;row<4;row++){const rz=pz0-31+row*21;
      mb.texRect(px0,rz-6.8,76,.4,0,"rgba(238,242,248,.6)");
      for(let s=0;s<12;s++){const sx=px0-34+s*6.2;
        mb.texRect(sx,rz-3,.3,7,0,"rgba(238,242,248,.55)");
        if((s*7+row*3)%5<2)mb.box(sx+3,.5,rz-3,4.2,1.3,1.9,COLR[(s+row)%6],{mu:.5,tag:"parkedcar"});}}
    mb.texRect(px0,pz0+36,76,5,0,"rgba(226,231,238,.28)");
    mb.paintPath([{x:px0,y:0,z:pz0+42},{x:px0,y:0,z:mz-118}],11,S_ASP,true);
    mb.texText(px0,pz0-42,6,"🅿 PARKING","rgba(240,244,250,.5)");}
   // 드리프트 광장
   mb.stamp(mx+210,mz+10,60,(i,j,d)=>w.setS(i,j,S_ASP));
   mb.texCircle(mx+210,mz+10,58,SURF_CSS[S_ASP]);
   mb.texCircle(mx+210,mz+10,28,"rgba(244,248,252,.85)",.4);
   mb.texText(mx+210,mz-32,6,"DRIFT PLAZA","rgba(244,248,252,.55)");
   for(let k=0;k<10;k++)mb.prop("cone",mx+210+Math.cos(k*.628)*52,mz+10+Math.sin(k*.628)*52);
   // 중층 빌딩
   for(let k=0;k<16;k++){
     const a=k/16*6.283,rr=138+rnd()*22;
     const px=mx+Math.cos(a)*rr,pz=mz+Math.sin(a)*rr*.72;
     const sc=18+rnd()*12;
     mb.baked(BLD2[(rnd()*4)|0],px,pz,sc,((rnd()*4)|0)*Math.PI/2,
       {y:0,collide:true,shrink:.92,hScale:1.2+rnd()*.7});}
   mb.texText(mx,mz+126,10,"MIDTOWN","rgba(240,244,250,.45)");
   w.addRippleZone(mx,mz-60,54,.013,2.0,2);}

  /* --- 지구 3: 워터프론트(북서) — 호수·프롬나드·마리나·등대 --- */
  {const[lx,lz]=D.lake;
   mb.texCircle(lx,lz,150,"rgba(38,92,140,.5)");
   mb.texCircle(lx,lz,150,"rgba(120,170,205,.35)",1.2);
   const prom=[];for(let k=0;k<=52;k++){const a=k/52*6.283;
     prom.push({x:lx+Math.cos(a)*196,y:0,z:lz+Math.sin(a)*196});}
   mb.paintPath(prom,9,S_WLK,true);
   for(let k=0;k<14;k++){const a=k/14*6.283;mb.prop("lamp",lx+Math.cos(a)*196,lz+Math.sin(a)*196,-a);}
   for(let k=0;k<7;k++){const a=(k/6-.5)*1.5-1.57;
     mb.box(lx+Math.cos(a)*168,.25,lz+Math.sin(a)*168,2.2,.5,.8,0x6f5a3f,{yaw:a+1.57,mu:.8,tag:"bench"});
     if(k%2)mb.box(lx+Math.cos(a)*160,1.4,lz+Math.sin(a)*160,.4,2.8,.4,0xcaa23a,{mu:.6,tag:"parasol"});}
   for(let k=0;k<5;k++)mb.box(lx-90+k*45,.3,lz+86,6,.5,86,0x8a6b45,{mu:.8,tag:"dock"});
   mb.box(lx,.3,lz+22,150,.5,7,0x8a6b45,{mu:.8,tag:"dock"});
   for(let k=0;k<9;k++)mb.box(lx-110+k*28,.7,lz+34+((k%2)*12),4.4,1.1,10,
     [0xd8433b,0xe8e8e8,0x3d5a80][k%3],{yaw:.08*k,mu:.5,tag:"boat"});
   mb.box(lx+178,3,lz-118,22,6,15,0x8a5a3c,{mu:.6,tag:"boathouse"});
   mb.box(lx-186,5,lz-142,4,10,4,0xe8e8e8,{mu:.6,tag:"lighthouse"});
   mb.box(lx-186,10.6,lz-142,3,1.4,3,0xd8433b,{mu:.5,tag:"lightlamp"});
   for(let k=0;k<9;k++)mb.baked("treesTall",lx+Math.cos(k*.72)*212,lz+Math.sin(k*.72)*212,11,k,{});
   mb.texText(lx,lz+206,11,"LAKESIDE","rgba(240,244,250,.5)");}

  /* --- 지구 4: 모터스포츠 파크(북동) — 상설 서킷 + 그랜드스탠드 + 피트 --- */
  {const[sx,sz]=D.sport;
   const trk=samplePath([[sx-240,sz-40],[sx-120,sz-150],[sx+70,sz-165],[sx+215,sz-70],
                         [sx+240,sz+80],[sx+110,sz+165],[sx-90,sz+150],[sx-235,sz+70]],true,420);
   for(const p of trk)p.y=8;                        // 대지(plateau y=8)에 평탄 서킷
   flattenCorridor(mb,trk,10,18,()=>8);
   mb.paintPath(trk,16,S_ASP,true,true);
   // 홍백 커빙 + 타이어월
   for(let i=2;i<trk.length-2;i+=3){
     const a=trk[i-2],b=trk[i],c=trk[i+2];
     const ang=Math.abs(Math.atan2(c.x-b.x,c.z-b.z)-Math.atan2(b.x-a.x,b.z-a.z));
     if(ang>.05&&ang<3){
       const dx=c.x-a.x,dz=c.z-a.z,l=Math.hypot(dx,dz)||1,nx=dz/l,nz=-dx/l;
       for(const s of[-1,1])mb.stamp(b.x+nx*s*8.6,b.z+nz*s*8.6,1.7,(ii,jj)=>w.setS(ii,jj,S_CRB));}}
   for(let i=0;i<trk.length-6;i+=26){
     const a=trk[i],b=trk[i+4],mid=trk[i+2];
     const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1,yaw=Math.atan2(dx,dz);
     for(const s of[-1,1])mb.box(mid.x+dz/l*s*17,8.5,mid.z-dx/l*s*17,1.2,1,7,
       s>0?0xd8433b:0xe8e8e8,{yaw,mu:.6,bounce:.3,tag:"tirewall"});}
   // 피트 + 갠트리 + 그랜드스탠드
   {const a=trk[0],b=trk[10];
    const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1,nx=dz/l,nz=-dx/l,yaw=Math.atan2(dx,dz);
    const pit=[];for(let k=0;k<=10;k++){const t=k/10;pit.push({x:lerp(a.x,b.x,t)+nx*22,y:8,z:lerp(a.z,b.z,t)+nz*22});}
    mb.paintPath(pit,10,S_ASP,true);
    for(let k=0;k<6;k++){const t=k/6;
      mb.box(lerp(a.x,b.x,t)+nx*28,8.06,lerp(a.z,b.z,t)+nz*28,7,.12,4,k%2?0x33393f:0x3c434b,{mu:.95,tag:"pit"});}
    mb.texRect(a.x,a.z,16,1.8,yaw,"rgba(240,244,250,.95)");
    for(const s of[-1,1])mb.box(a.x+Math.cos(yaw)*s*9,12,a.z-Math.sin(yaw)*s*9,1.2,8,1.2,0x2e3640,{mu:.5,tag:"gantry"});
    mb.box(a.x,16.2,a.z,20,1.2,1.4,0xd8433b,{yaw,mu:.5,tag:"gantry"});}
   for(const[gx,gz,gy]of[[sx-60,sz-200,0],[sx+200,sz+130,Math.PI/2]])
     for(let t=0;t<3;t++)mb.box(gx,12+t*3,gz-t*4*Math.cos(gy),56-t*6,2.6,7,t?0x2e3640:0x39424e,{yaw:gy,mu:.5,tag:"stand"});
   // 파크 접근로: 서킷 ↔ 내부 순환(북동 피더)
   {const acc=bridgeValleys(followTerrain(w,samplePath([[sx-240,sz-40],[sx-330,sz-160],
      [Math.cos(Math.PI*.25)*R_INNER,Math.sin(Math.PI*.25)*R_INNER]],false,140)),.11);
    flattenCorridor(mb,acc,8,14);mb.paintPath(acc,13,S_ASP,true,true);}
   mb.texText(sx,sz,16,"MOTORSPORT PARK","rgba(240,244,250,.4)");}

  /* --- 지구 5: 항만·공업(동) — 컨테이너 야드 + 창고 + 크레인 --- */
  {const[px,pz]=D.port;
   mb.stamp(px,pz,300,(i,j,d,qx,qz)=>{
     if(Math.abs(qx-px)<220&&Math.abs(qz-pz)<280)w.setS(i,j,S_ASP);});
   mb.texRect(px,pz,440,560,0,SURF_CSS[S_ASP]);
   // 야드 통로 격자
   for(let k=-2;k<=2;k++){
     mb.paintPath([{x:px-210,y:0,z:pz+k*110},{x:px+210,y:0,z:pz+k*110}],13,S_ASP,true,true);
     mb.paintPath([{x:px+k*100,y:0,z:pz-270},{x:px+k*100,y:0,z:pz+270}],13,S_ASP,true,true);}
   // 컨테이너 스택
   const CC=[0xb8443c,0x2f6f8f,0x4a7a4a,0xc0902f,0x8a5a3c,0x55606e];
   // 야드 통로(가로 pz+k*110 · 세로 px+k*100)는 반드시 비워 둔다 — 컨테이너가 주행 차선을 막지 않게
   const onAisle=(qx,qz)=>{
     for(let k=-2;k<=2;k++){
       if(Math.abs(qz-(pz+k*110))<17)return true;
       if(Math.abs(qx-(px+k*100))<17)return true;}
     return false;};
   for(let k=0;k<64;k++){
     const gx=px-170+((k%8))*46+(rnd()-.5)*8, gz=pz-230+((k/8)|0)*62+(rnd()-.5)*8;
     if(onAisle(gx,gz))continue;
     const st=1+((rnd()*3)|0);
     for(let s=0;s<st;s++)
       mb.box(gx,1.3+s*2.6,gz,12,2.5,5,CC[(rnd()*6)|0],{yaw:(rnd()<.5?0:Math.PI/2),mu:.6,tag:"container"});}
   // 창고 + 갠트리 크레인
   for(let k=0;k<4;k++)mb.box(px-150+k*100,7,pz+300,68,14,34,0x77808c,{mu:.5,tag:"warehouse"});
   for(let k=0;k<3;k++){const cx2=px+150,cz2=pz-160+k*160;
     for(const s of[-1,1])mb.box(cx2+s*26,11,cz2,4,22,4,0xd9a12b,{mu:.5,tag:"cranleg"});
     mb.box(cx2,23,cz2,60,3,6,0xd9a12b,{mu:.5,tag:"cranbeam"});}
   // 접근로: 야드 ↔ 내부 순환(동측 피더)
   {const acc=bridgeValleys(followTerrain(w,samplePath([[px-220,pz],[px-360,pz+40],[R_INNER,20]],false,130)),.11);
    flattenCorridor(mb,acc,8,14);mb.paintPath(acc,14,S_ASP,true,true);}
   mb.texText(px,pz-300,14,"PORT · INDUSTRIAL","rgba(240,244,250,.4)");
   w.addRippleZone(px,pz+120,70,.017,2.4,2);}

  /* --- 지구 6: 공항(남) — 1000m 활주로 + 유도로 + 격납고 + 관제탑 --- */
  {const[ax,az]=D.airport;
   mb.paintPath([{x:ax-500,y:0,z:az},{x:ax+500,y:0,z:az}],46,S_ASP,true);
   for(let k=-22;k<=22;k++)mb.texRect(ax+k*22,az,10,1.2,0,"rgba(244,248,252,.8)");
   for(const side of[-1,1])for(let k=0;k<6;k++)for(const s of[-1,1])
     mb.texRect(ax+side*(462-k*14),az+s*11,9,2.6,0,"rgba(244,248,252,.85)");
   mb.texText(ax-452,az,12,"09","rgba(240,244,250,.55)");
   mb.texText(ax+452,az,12,"27","rgba(240,244,250,.55)");
   mb.paintPath([{x:ax-460,y:0,z:az+80},{x:ax+460,y:0,z:az+80}],14,S_ASP,true);
   for(const tx of[-360,-120,120,360])mb.paintPath([{x:ax+tx,y:0,z:az},{x:ax+tx,y:0,z:az+80}],12,S_ASP,true);
   for(let k=0;k<5;k++)mb.box(ax-260+k*140,7,az+136,62,14,34,0x6f7883,{mu:.5,tag:"hangar"});
   mb.box(ax+560,11,az+150,10,22,10,0x8a929c,{mu:.5,tag:"tower"});      // 관제탑(진입로 밖)
   mb.box(ax+560,23,az+150,16,4,16,0x2b3138,{mu:.5,tag:"towercab"});
   // 터미널 — 진입로 코리도어(동측 우회) 밖, 격납고 열 서측에 배치
   mb.box(ax-230,9,az+196,190,18,44,0x8f98a4,{mu:.5,tag:"terminal"});
   w.addRippleZone(ax-250,az,90,.010,1.4,3);
   w.addRippleZone(ax+220,az,90,.012,1.7,1);
   /* 접근로: 내부 순환 → 공항. 예전 경로는 터미널·격납고 열을 정면으로 관통해
      활주로 진입 전에 거대한 벽이 길을 막았다 → 시설 동쪽을 크게 우회해 활주로 동단으로 진입. */
   {const acc=bridgeValleys(followTerrain(w,samplePath(
      [[0,-R_INNER],[140,-560],[268,-730],[ax+470,az+8]],false,160)),.11);
    flattenCorridor(mb,acc,8,14);mb.paintPath(acc,14,S_ASP,true,true);}
   mb.texText(ax,az+230,12,"✈ INTL AIRPORT","rgba(240,244,250,.45)");}

  /* --- 지구 7: 아레나(남서) --- */
  {const[sx,sz]=D.arena;
   mb.stamp(sx,sz,110,(i,j,d)=>w.setS(i,j,d<66?S_GRS:S_WLK));
   for(let k=0;k<30;k++){const a=k/30*6.283;
     mb.box(sx+Math.cos(a)*82,w.height(sx+Math.cos(a)*82,sz+Math.sin(a)*82)+6,sz+Math.sin(a)*82,
       11,12,11,0x39424e,{yaw:-a,mu:.5,tag:"stand"});}
   // 주변 주차 + 접근로
   mb.texRect(sx+150,sz,120,160,0,SURF_CSS[S_ASP]);
   mb.stamp(sx+150,sz,100,(i,j,d,qx,qz)=>{if(Math.abs(qx-sx-150)<60&&Math.abs(qz-sz)<80)w.setS(i,j,S_ASP);});
   {const acc=bridgeValleys(followTerrain(w,samplePath([[sx+150,sz],[sx+330,sz+90],
      [Math.cos(Math.PI*1.25)*R_INNER,Math.sin(Math.PI*1.25)*R_INNER]],false,140)),.11);
    flattenCorridor(mb,acc,8,14);mb.paintPath(acc,13,S_ASP,true,true);}
   mb.texText(sx,sz,16,"ARENA","rgba(240,244,250,.5)");}

  /* --- 지구 8: 산악 힐클라임(남동, 벨트웨이 바깥) --- */
  {const[hx,hz]=D.mtn;
   const mloop=bridgeValleys(followTerrain(w,samplePath(
     [[hx-190,hz+150],[hx-40,hz+210],[hx+150,hz+150],[hx+215,hz-10],
      [hx+120,hz-175],[hx-70,hz-205],[hx-200,hz-90]],true,340)),.12);
   flattenCorridor(mb,mloop,8,14);
   mb.paintPath(mloop,13,S_ASP,true,true);
   railAlong(mb,mloop,13,0xb9c2cc,(a)=>Math.hypot(a.x-(hx-190),a.z-(hz+150))<54);
   // 벨트웨이 → 산악 루프 진입 램프
   {const a=Math.atan2(hz,hx);
    const mramp=bridgeValleys(followTerrain(w,samplePath(
      [[Math.cos(a)*(R_BELT-8),Math.sin(a)*(R_BELT-8)],[hx-300,hz+240],[hx-190,hz+150]],false,120)),.115);
    flattenCorridor(mb,mramp,7,12);mb.paintPath(mramp,12,S_ASP,true,true);}
   for(let k=0;k<16;k++){
     const tx=hx+(rnd()-.5)*520,tz=hz+(rnd()-.5)*520;
     if(Math.abs(Math.hypot(tx-hx,tz-hz)-195)<44)continue;
     mb.baked(rnd()<.5?"trees":"treesTall",tx,tz,10+rnd()*5,rnd()*6,{});}
   mb.texText(hx,hz,12,"HILLCLIMB","rgba(240,244,250,.45)");}

  /* --- 지구 9: 교외(서) — 주택 + 컬드삭 --- */
  {const[bx,bz]=D.burb;
   for(let r=0;r<4;r++){
     const rz=bz-160+r*106;
     mb.paintPath([{x:bx-140,y:0,z:rz},{x:bx+150,y:0,z:rz}],11,S_ASP,true,true);
     for(let k=0;k<5;k++){
       const hx2=bx-120+k*62,hz2=rz+((r%2)?30:-30);
       mb.baked("garage",hx2,hz2,15,((k+r)%4)*Math.PI/2,{collide:true,shrink:.9});
       if((k+r)%2)mb.baked("treesTall",hx2+22,hz2+12,10+((k)%3)*2,k,{});}}
   mb.paintPath([{x:bx+150,y:0,z:bz-160},{x:bx+150,y:0,z:bz+160}],12,S_ASP,true,true);
   {const acc=bridgeValleys(followTerrain(w,samplePath([[bx+150,bz],[bx+330,bz-40],
      [-R_INNER,0]],false,130)),.11);
    flattenCorridor(mb,acc,8,14);mb.paintPath(acc,13,S_ASP,true,true);}
   mb.texText(bx,bz+190,11,"SUBURBS","rgba(240,244,250,.4)");
   w.addRippleZone(bx,bz,70,.015,1.2,3);}

  /* --- 부가: 공사장 점프대 — 그랜드 불러바드(z=300)·애비뉴(x=200)를 피해 북동쪽 공터로 --- */
  mb.ramp(322,392,Math.PI*.75,26,22,14,0xd8433b);
  mb.ramp(382,452,Math.PI*1.75,22,20,14,0xc7742f);
  for(let k=0;k<6;k++)mb.box(290+k*7,.6,360,6,1.2,2,0xcaa23a,{yaw:k,mu:.8,tag:"beam"});
  mb.texText(352,422,7,"CONSTRUCTION","rgba(240,244,250,.4)");

  /* --- 벨트웨이 구간별 꿀렁임(실제 노후 고속도로 느낌) --- */
  for(let k=0;k<8;k++){const a=k/8*6.283;
    w.addRippleZone(Math.cos(a)*R_BELT,Math.sin(a)*R_BELT,72,.013+.005*(k%3),1.2+.4*(k%4),1+(k%3));}
  w.addRippleZone(0,-45,38,.013,1.9,3);
  w.addRippleZone(-70,0,40,.012,2.5,1);
  w.addRippleZone(140,60,42,.016,1.3,3);

  /* ===== ⑥ 간선 재확정 — 이후 어떤 작업도 간선을 덮어 길을 끊지 못하게 (구조적 보장) ===== */
  flattenCorridor(mb,inner,12,16,()=>0);
  mb.paintPath(inner,20,S_ASP,true,true);
  flattenCorridor(mb,belt,17,30);
  mb.paintPath(belt,26,S_ASP,true,true);
  for(const rp of radials){flattenCorridor(mb,rp,9,14);mb.paintPath(rp,16,S_ASP,true,true);}
  for(const[a,b]of feeders)
    mb.paintPath([{x:a[0],y:0,z:a[1]},{x:b[0],y:0,z:b[1]}],15,S_ASP,true,true);
  // 격자 재확정 — 단, 지하터널 구간(x=0, z∈TUN)은 제외해야 터널이 메워지지 않는다.
  paintGrid(true);
  // 그랜드 불러바드 재확정 — 어떤 지구 콘텐츠도 관통 직선을 끊지 못하게(마지막에 한 번 더)
  paintBlvd();

  /* ═══ ⑦ 외곽 익스프레스웨이 — 인피니티 하이웨이를 도시에 통합 ═══
     벨트웨이(r=1060)에서 두 곳으로 갈라져 나가 외곽(r=1500)을 크게 돌고,
     반대편에서 다시 벨트웨이로 합류한다. 도시에서 그대로 진입할 수 있다. */
  {const R_EX=1500, A0=.35, A1=2*Math.PI-.35;      // 진입각 ~20°, 합류각 ~340°
   const ex=[];
   // 진입 램프: 벨트웨이 → 외곽
   for(let i=0;i<=14;i++){const t=i/14;
     const r=lerp(R_BELT,R_EX,t), a=lerp(A0-.16,A0,t);
     ex.push({x:Math.cos(a)*r,y:0,z:Math.sin(a)*r});}
   // 외곽 대순환 (고도 변화 포함 — 언덕 넘고 계곡 건너기)
   const NA=260;
   for(let i=0;i<=NA;i++){
     const t=i/NA, a=lerp(A0,A1,t);
     let y=0;
     if(t>.20&&t<.32){const u=(t-.20)/.12;y=Math.sin(u*Math.PI)*34;}   // 언덕 고가
     if(t>.55&&t<.66){const u=(t-.55)/.11;y=Math.sin(u*Math.PI)*26;}   // 두 번째 융기
     ex.push({x:Math.cos(a)*R_EX,y,z:Math.sin(a)*R_EX});}
   // 합류 램프: 외곽 → 벨트웨이
   for(let i=1;i<=14;i++){const t=i/14;
     const r=lerp(R_EX,R_BELT,t), a=lerp(A1,A1+.16,t);
     ex.push({x:Math.cos(a)*r,y:0,z:Math.sin(a)*r});}
   // 외곽 지형을 완만하게(도시 밖은 평원 + 낮은 구릉)
   mb.stamp(0,0,SZ*.5,(i,j,d,x,z)=>{
     const r=Math.hypot(x,z);
     if(r<R_BELT+90)return;
     const idx=w.idx(i,j);
     const base=Math.sin(x/460)*Math.cos(z/510)*7+Math.sin(x/121+z/143)*1.8;
     w.hMap[idx]=base;w.sMap[idx]=SURF_ID.grass;});
   buildExpressway(mb,{route:ex,halfWidth:15,
     sections:[["rumble",.06,.13],["wave",.13,.20],["chicane",.20,.27],
               ["mogul",.27,.34],["tunnel",.34,.41],["banked",.41,.49],
               ["split",.49,.56],["jump",.56,.61],["washboard",.61,.68],
               ["wave",.68,.75],["straight",.75,.93]],
     finale:true});
   /* 접속부 가드레일 개방 — 벨트웨이 난간은 익스프레스웨이보다 먼저 세워져
      진입·합류 램프를 가로막는다(실주행 감사: 합류부 2지점에서 3.2m 만 전진). */
   {const jn=[{x:Math.cos(A0-.16)*R_BELT,z:Math.sin(A0-.16)*R_BELT},
              {x:Math.cos(A1+.16)*R_BELT,z:Math.sin(A1+.16)*R_BELT}];
    const keep=[];let cut=0;
    for(const bx of w.boxes){
      const t=bx.tag||"";
      if(/^(rail|railpost|railbar)$/.test(t)&&
         jn.some(j=>Math.hypot(bx.c.x-j.x,bx.c.z-j.z)<70)){cut++;continue;}
      keep.push(bx);}
    if(cut){w.boxes.length=0;for(const bx of keep)w.boxes.push(bx);}}
   // 벨트웨이 접속부 안내
   {const p0={x:Math.cos(A0-.16)*R_BELT,z:Math.sin(A0-.16)*R_BELT};
    mb.texText(p0.x,p0.z,8,"EXPRESSWAY →","rgba(255,210,80,.75)");}
   (w.places=w.places||[]).push(
     {name:"🛣️ 익스프레스웨이 진입",x:Math.cos(A0-.16)*R_BELT,z:Math.sin(A0-.16)*R_BELT,yaw:A0},
     {name:"🕳️ 익스프레스 터널",x:Math.cos(lerp(A0,A1,.37))*R_EX,z:Math.sin(lerp(A0,A1,.37))*R_EX,yaw:0},
     {name:"🚀 익스프레스 점프대",x:Math.cos(lerp(A0,A1,.58))*R_EX,z:Math.sin(lerp(A0,A1,.58))*R_EX,yaw:0},
     {name:"✨ 스카이 링(종착)",x:Math.cos(A1+.16)*R_BELT,z:Math.sin(A1+.16)*R_BELT,yaw:0});}

  // 불러바드 중앙분리 도색 + 표지
  for(const bp of[blvdH,blvdV])for(let k=6;k<bp.length-6;k+=3){const p=bp[k];
    mb.texRect(p.x,p.z,bp===blvdH?12:.5,bp===blvdH?.5:12,0,"rgba(240,214,120,.5)");}
  mb.texText(-560,BLV_Z-20,11,"◀  GRAND  BLVD  ▶","rgba(238,244,252,.42)");
  mb.texText(BLV_X+22,-560,11,"GRAND  AVE","rgba(238,244,252,.42)",Math.PI/2);
  mb._resvOn=false;   // 이후 지하 구조물(데크·기둥)은 예약 코리도어와 무관하게 건설
  /* 🛣️ 지하 터널 — 모든 정지작업이 끝난 뒤에 파낸다(이전 버전은 재확정이 터널을 메우고
     옹벽·천장만 남겨 시작 지점 주행이 완전히 막혔다). 램프 경사는 완만하게. */
  {const TZ=-254;                                          // 터널 중심(=L1 데크 아래)
   const dipC=z=>{const t=(z-TZ)/30;return -5.2*Math.max(0,1-t*t);};
   for(let z=TZ-30;z<=TZ+30;z+=1)
     mb.stamp(0,z,8.2,(i,j,d,px,pz)=>{w.setH(i,j,dipC(pz));w.setS(i,j,S_ASP);});
   for(let z=TZ-24;z<=TZ+24;z+=4){const y0=dipC(z);
     if(y0>-.5)continue;                                  // 지표 근처는 옹벽 생략(턱 방지)
     for(const s of[-1,1])mb.box(s*8.6,(y0+1.0)/2,z,1.0,1.0-y0,4.4,0x40474f,{mu:.7,tag:"wall"});}
   mb.box(0,4.2,TZ,18,.7,16,0x33393f,{mu:.7,tag:"portal"});   // 천장은 차 위로 충분히(4.2m)
   for(const z of[TZ-16,TZ+16])mb.prop("lamp",9,z,Math.PI/2);
   mb.texText(0,TZ+44,6,"UNDERGROUND","rgba(240,244,250,.5)");}

  /* 🅿️ 지하 주차장 B1 — "지하를 아래에 만든다"
     지상(y=0)은 데크로 완전히 덮여 평범한 광장/도로처럼 그대로 직진 주행이 가능하고,
     그 '아래' 층고 8.9m 공간에 기둥 격자·조명·주차구획을 갖춘 대형 지하 주차장이 있다.
     진입은 동/서 두 개의 램프뿐이며, 램프 입구(트렌치)만 하늘로 열려 있다. */
  {const UY=-9.5, HX=250, HZ=86, UZ=200;         // 바닥 깊이 / 홀 반폭·반깊이 / 홀 중심 z
   const DKY=-.6;                                // 데크 하면(=천장) 높이 — 데크 상면은 정확히 y=0
   const RW=11, RX0=HX, RX1=390, CX=320;         // 램프 반폭 / 램프 x구간 / 데크 덮개 끝
   const inHall=(x,z)=>Math.abs(x)<=HX&&Math.abs(z-UZ)<=HZ;
   /* 램프 프로파일 — 예전엔 전 구간 S커브(smoothstep)라 경사가 계속 변해 어지러웠다.
      가운데는 '일정 경사 직선', 양 끝 12%만 짧게 완화해 깔끔한 업/다운으로 만든다. */
   const rampY=(ax)=>{
     const t=clamp((ax-RX0)/(RX1-RX0),0,1),E=.12;
     let f;
     if(t<E)f=t*t/(2*E);                       // 진입 완화
     else if(t>1-E)f=1-(1-t)*(1-t)/(2*E);      // 진출 완화
     else f=t-E/2;
     f/=(1-E);                                  // 전체를 0~1로 정규화
     return lerp(UY,0,clamp(f,0,1));};
   const inRamp=(x,z)=>Math.abs(z-UZ)<=RW&&Math.abs(x)>HX&&Math.abs(x)<=RX1;
   /* ① 데크 주변 지표를 정확히 y=0으로 정지 — 데크 상면과 지면 사이 단차(턱)를 없앤다 */
   mb.stamp(0,UZ,HX+HZ+140,(i,j,d,px,pz)=>{
     const dx=Math.max(0,Math.abs(px)-(HX+8)),dz=Math.max(0,Math.abs(pz-UZ)-(HZ+8));
     const f=clamp(Math.hypot(dx,dz)/38,0,1),id=w.idx(i,j);
     w.hMap[id]=lerp(0,w.hMap[id],f*f);});
   /* ② 굴착 — 홀은 완전 평면(UY), 램프는 부드러운 S커브, 그 외는 손대지 않는다 */
   mb.stamp(0,UZ,RX1+HZ+40,(i,j,d,px,pz)=>{
     if(inHall(px,pz)){w.setH(i,j,UY);w.setS(i,j,S_ASP);}
     else if(inRamp(px,pz)){w.setH(i,j,rampY(Math.abs(px)));w.setS(i,j,S_ASP);}});
   /* ③ 외벽(콘크리트 옹벽) — 바닥에서 천장까지만. 지상으로 절대 튀어나오지 않는다 */
   const WH=DKY-UY, WY=(UY+DKY)/2;
   for(const s of[-1,1]){
     mb.box(0,WY,UZ+s*(HZ+1),2*HX+4,WH,2,0x272b31,{mu:.8,tag:"wall"});
     const seg=(HZ-RW)/2;                        // 램프 개구부 위·아래로 분할
     for(const t of[-1,1])
       mb.box(s*(HX+1),WY,UZ+t*(RW+seg),2,WH,seg*2,0x272b31,{mu:.8,tag:"wall"});}
   /* ④ 램프 측벽 — 덮개 아래는 천장까지, 입구 트렌치 구간은 지상 옹벽(추락 방지) */
   for(const s of[-1,1])for(const t of[-1,1])
     for(let ax=RX0;ax<RX1;ax+=10){
       const lo=Math.min(rampY(ax),rampY(ax+10))-.3, hi=ax<CX-6?DKY:.95;
       if(hi<=lo)continue;
       mb.box(s*(ax+5),(lo+hi)/2,UZ+t*(RW+1),10,hi-lo,2,0x2b3037,{mu:.8,tag:"wall"});}
   /* ⑤ 지상 데크(= 지하의 천장). 굴착부 전체 + 램프 덮개까지 이어 붙여
        위에서는 구덩이가 전혀 보이지 않고 도시 도로가 그대로 관통한다. */
   /* 데크는 굴착 경계보다 12m 더 넓게 깐다 — 하이트맵은 셀 단위로 보간되므로
      경계에 폭 1셀(≈6m)의 급경사 노치가 생긴다. 데크를 내밀어 그 위를 덮으면
      지면(y=0)과 데크 상면(y=0)이 완전히 같은 평면이 되어 턱 없이 관통 주행된다. */
   {const EX=HX+12,EZ=HZ+12;
    const NX=17,NZ=7,TX=2*EX/NX,TZ=2*EZ/NZ;
    for(let i=0;i<NX;i++)for(let j=0;j<NZ;j++)
      mb.box(-EX+TX*(i+.5),DKY/2,UZ-EZ+TZ*(j+.5),TX+.4,-DKY,TZ+.4,0x5a616c,{mu:1,tag:"deck"});
    const CL=CX-HX,NC=4,TC=CL/NC;                // 램프 덮개(진입로 위를 덮는 슬래브)
    for(const s of[-1,1])for(let i=0;i<NC;i++)
      mb.box(s*(HX+TC*(i+.5)),DKY/2,UZ,TC+.4,-DKY,2*RW+8,0x5a616c,{mu:1,tag:"deck"});
    // 덮개 끝(램프 입구 위) 파라펫 — 트렌치로 떨어지지 않게
    for(const s of[-1,1])mb.box(s*(CX+.4),.45,UZ,.8,1.5,2*RW+8,0xb9c2cc,{mu:.5,tag:"parapet"});}
   /* ⑥ 데크 상면 차선 도색(시각 전용) — 지상 도로처럼 보이게 */
   for(const gx of[-200,-100,0,100,200])
     for(let z=UZ-HZ+7;z<UZ+HZ-2;z+=14)mb.visBox(gx,.03,z,.34,.06,7,0xe9eef6);
   for(let x=-HX+7;x<HX-2;x+=14)mb.visBox(x,.03,UZ,7,.06,.34,0xe9eef6);
   for(const s of[-1,1])mb.visBox(0,.03,UZ+s*(HZ-6),2*HX-14,.06,.34,0xd8e0ea);
   /* ⑦ 지하 내부 — 기둥 격자 / 스트립 조명 / 주차 구획 / 주차 차량 */
   for(let x=-HX+34;x<HX;x+=58)for(let z=UZ-58;z<=UZ+58;z+=58){
     if(Math.abs(z-UZ)<=RW+4&&Math.abs(x)>HX-34)continue;   // 램프 진입 축은 비운다
     mb.box(x,(UY+DKY)/2,z,2.6,DKY-UY,2.6,0x3c434b,{mu:.7,tag:"pillar"});
     mb.box(x,UY+.1,z,4.2,.2,4.2,0x31373e,{mu:.8,tag:"pillarbase"});
     mb.visBox(x,UY+1.1,z,2.8,.5,2.8,0xe4c257);}            // 기둥 경고 도색
   for(let x=-HX+20;x<HX;x+=40)for(const z of[UZ-56,UZ-18,UZ+18,UZ+56])
     mb.box(x,DKY-.18,z,5.4,.14,.46,0xfff3c0,{mu:.5,tag:"striplight"});
   mb.texRect(0,UZ,2*HX,2*HZ,0,"rgba(24,27,32,.74)");
   for(const s of[-1,1])mb.texRect(0,UZ+s*44,2*HX-20,.5,0,"rgba(226,232,240,.42)");
   for(let k=0;k<26;k++){const px=-HX+22+k*19;
     for(const s of[-1,1]){
       mb.texRect(px,UZ+s*66,.34,11,0,"rgba(214,222,232,.40)");
       if(k%3===1)mb.box(px+4.6,UY+.75,UZ+s*66,4.2,1.3,1.9,
         [0x4c5560,0x5f5443,0x39424e,0x6a4a44][k%4],{mu:.5,tag:"parkedcar"});}}
   mb.texText(0,UZ,18,"PARKING  B1","rgba(206,214,226,.24)");
   for(const s of[-1,1])mb.texText(s*(HX-52),UZ,8,s>0?"EXIT ▶":"◀ EXIT","rgba(224,186,96,.55)");
   /* ⑦a 램프 감속 방지턱 — 지하 주차장 진입로답게 내려가는 길에 3개씩 */
   for(const sg of[-1,1])for(const f of[.24,.48,.72]){
     const ax=RX0+(RX1-RX0)*f;
     mb.bump(sg*ax,UZ,Math.PI/2,2*RW-2,.085,f<.5?"round":"arch");}
   /* ⑦b 램프 진입로 — 램프 입구(x=±390)를 지상 도로망(그랜드 불러바드 z=300)에 연결한다.
        이게 없으면 지하 주차장이 지상망과 끊긴 별도 네트워크가 된다. */
   for(const sg of[-1,1]){
     const acc=[{x:sg*(RX1-8),y:0,z:UZ},{x:sg*(RX1+22),y:0,z:UZ+34},
                {x:sg*(RX1+22),y:0,z:BLV_Z}];
     flattenCorridor(mb,acc,8,13,()=>0);
     mb.paintPath(acc,16,S_ASP,true,true);}
   /* ⑧ 램프 입구 안내 — 지상에서 찾기 쉽게 */
   for(const s of[-1,1]){
     mb.texText(s*(CX+40),UZ-24,7,"P  B1 ▼","rgba(232,196,96,.75)");
     mb.prop("lamp",s*(RX1-14),UZ+RW+5,0);}}

  /* 🚧 메가시티 도로 위 방지턱·요철·꿀렁임 — 가끔씩(도심 격자·순환로 일부 구간에만) */
  const inUG=(x,z)=>Math.abs(x)<=252&&Math.abs(z-200)<=88;   // 지하 홀 데크 위는 제외
  for(let k=-GK;k<=GK;k++){
    if(k===0)continue;                                  // 광장 축은 비움
    const off=k*GRID, bz=(k>0?1:-1)*160, bx=(k>0?1:-1)*160;
    if(k%2===0&&!inUG(off,bz))mb.bump(off,bz,0,13,.10+.03*Math.abs(k),k%4?"round":"arch");
    if(k%3===0&&!inUG(bx,off))mb.bump(bx,off,Math.PI/2,13,.12,"rumble");}
  /* 🚧 시작 지점(스폰 0,-200) 방지턱 · 요철 · 꿀렁임 — 출발하자마자 서스펜션을 느끼도록.
     x=0 축(로터리 남쪽 진입로) 위에 종류를 섞어 배치하고, 스폰 주변엔 완만한 웨이브를 깐다. */
  for(const[bz,bh,bk]of[[-206,.11,"round"],[-192,.13,"arch"],[-178,.10,"rumble"],
                        [-162,.15,"round"],[-146,.12,"arch"],[-130,.10,"rumble"]])
    mb.bump(0,bz,0,14,bh,bk);
  w.addRippleZone(0,-186,30,.020,1.7,2);                // 스폰 직후 꿀렁임
  w.addRippleZone(0,-140,26,.016,2.3,1);
  for(const[rx,rz]of[[-100,-200],[100,-200]]){          // 좌우 진입로에도 요철
    mb.bump(rx,rz+18,0,13,.12,"round");
    w.addRippleZone(rx,rz-16,24,.015,2.0,2);}
  mb.texText(0,-224,6,"⚠ BUMPS AHEAD","rgba(240,214,120,.6)");
  for(let k=0;k<6;k++){const a=(k+.5)/6*6.283;
    w.addRippleZone(Math.cos(a)*R_INNER,Math.sin(a)*R_INNER,58,.012+.004*(k%3),1.4+.3*(k%3),1+(k%3));}
  for(const[bx3,bz3]of[[GRID,GRID],[-GRID,GRID],[GRID,-GRID],[-GRID,-GRID]])
    w.addRippleZone(bx3,bz3,44,.011,2.2,1+((bx3+bz3)%2));

  /* ══ 🏙️ 메가시티 잔요철 — 실제 도심 노면처럼 '어디를 달려도 노면이 살아 있게' ══
     전역 roadRough(㎜급)에 더해, 도심 특유의 국소 노면을 손으로 깐다.
     - 노후 포장 구간: 아스팔트색 잔요철 다발(눈에 띄는 마킹 없음)
     - 럼블 스트립: 교차로 진입·터널 입구 '두두둑'
     - 보수 패치/맨홀: 작은 단차
     예약 코리도어(대로 직진축)는 건드리지 않으므로 '쭉 직진'은 그대로 유지된다. */
  {let sd=20250726;const rr=()=>{sd=(sd*1103515245+12345)&0x7fffffff;return sd/0x7fffffff;};
   const okAt=(x,z)=>{
     if(inUG(x,z))return false;                       // 지하 데크 위는 제외
     const s=w.surf(x,z);
     return s===SURF_ID.asphalt||s===SURF_ID.lane;};
   /* ① 노후 포장 — 아스팔트색 잔요철 다발 34곳 × 4~7개 */
   let laid=0;
   for(let k=0;k<900&&laid<34;k++){
     const cx=(rr()-.5)*2100, cz=(rr()-.5)*2100;
     if(!okAt(cx,cz)||!okAt(cx+6,cz)||!okAt(cx-6,cz)||!okAt(cx,cz+6)||!okAt(cx,cz-6))continue;
     if(Math.hypot(cx,cz+200)<70)continue;            // 스폰 주변은 비움
     const yaw=rr()<.5?0:Math.PI/2, n=4+((rr()*4)|0);
     for(let q=0;q<n;q++){
       const ox=(rr()-.5)*16, oz=(rr()-.5)*16;
       if(!okAt(cx+ox,cz+oz))continue;
       mb.rough(cx+ox,cz+oz,yaw+(rr()-.5)*.4,7+rr()*6,.016+rr()*.030,
                rr()<.34?"flat":rr()<.7?"round":"arch");}
     laid++;}
   /* ② 럼블 스트립 — 격자 교차로 진입부(두두둑). 대로 축(k=0)은 제외 */
   let rz2=0;
   for(let k=-4;k<=4&&rz2<14;k++){
     if(k===0)continue;
     for(const[ax,az,yw]of[[k*GRID,GRID*1.5,0],[GRID*1.5,k*GRID,Math.PI/2],
                           [k*GRID,-GRID*1.5,0],[-GRID*1.5,k*GRID,Math.PI/2]]){
       if(rz2>=14)break;
       if(!okAt(ax,az))continue;
       mb.rumbleZone(ax,az,yw,11,.010+.004*(k&1),.45+.2*(k&1));
       rz2++;}}
   /* ③ 보수 패치·맨홀 — 작은 단차(높이 2~4cm) */
   let pat=0;
   for(let k=0;k<700&&pat<46;k++){
     const px=(rr()-.5)*2150, pz=(rr()-.5)*2150;
     if(!okAt(px,pz))continue;
     if(Math.hypot(px,pz+200)<56)continue;
     mb.rough(px,pz,rr()*3.14,2.4+rr()*2.6,.020+rr()*.022,"flat");
     mb.texCircle(px,pz,1.5+rr()*1.2,"rgba(38,41,46,.42)");
     pat++;}
   /* ④ 순환 벨트웨이 — 완만한 노면 굴곡(고속에서 서스가 계속 일한다) */
   for(let k=0;k<10;k++){
     const a=(k+.5)/10*6.283;
     w.addRippleZone(Math.cos(a)*R_BELT,Math.sin(a)*R_BELT,50,.008,2.9+(k%3)*.5,1+(k%3));}}

  w.checkpoints=pathCheckpoints(belt,30,22);
  w.waypoints=pathWaypoints(belt,true,60);
  w.spawn={x:0,z:-200,yaw:0};
  /* 📍 장소(지구별) */
  w.places=[
    {name:"🏙️ CBD 다운타운",x:0,z:-200,yaw:0},
    {name:"⛲ 중앙 광장",x:0,z:100,yaw:Math.PI},
    {name:"🌉 스폰 입체교차",x:-178,z:-250,yaw:Math.PI/2},
    {name:"🛣️ 지하 터널",x:0,z:-300,yaw:0},
    {name:"🅿️ 지하주차장 B1",x:0,z:200,yaw:Math.PI/2},
    {name:"🅿️ B1 진입 램프",x:368,z:200,yaw:-Math.PI/2},
    {name:"🛣️ 그랜드 불러바드(동서)",x:-600,z:300,yaw:Math.PI/2},
    {name:"🛣️ 그랜드 애비뉴(남북)",x:200,z:-620,yaw:0},
    {name:"🛣️ 내부 순환도로",x:R_INNER,z:0,yaw:Math.PI/2},
    {name:"🛣️ 외곽 벨트웨이",x:R_BELT,z:0,yaw:Math.PI/2},
    {name:"🏢 미드타운",x:D.mid[0],z:D.mid[1]-118,yaw:0},
    {name:"🅿️ 대형 주차장",x:D.mid[0]-210,z:D.mid[1]+30,yaw:Math.PI},
    {name:"🌀 드리프트 광장",x:D.mid[0]+210,z:D.mid[1]+10,yaw:0},
    {name:"🌊 레이크사이드",x:D.lake[0],z:D.lake[1]-196,yaw:0},
    {name:"🏁 모터스포츠 파크",x:D.sport[0]-240,z:D.sport[1]-40,yaw:Math.PI*.4},
    {name:"🏗️ 항만 컨테이너 야드",x:D.port[0]-220,z:D.port[1],yaw:Math.PI/2},
    {name:"✈️ 국제공항 활주로",x:D.airport[0],z:D.airport[1],yaw:Math.PI/2},
    {name:"🏟️ 아레나",x:D.arena[0]+150,z:D.arena[1],yaw:Math.PI},
    {name:"⛰️ 산악 힐클라임",x:D.mtn[0]-190,z:D.mtn[1]+150,yaw:0},
    {name:"🏘️ 교외 주택가",x:D.burb[0]+150,z:D.burb[1],yaw:Math.PI},
    {name:"🏗️ 공사장 점프대",x:322,z:392,yaw:Math.PI*.75}];
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

/* ═══════════════════════════════════════════════════════════════════
   🛣️ 인피니티 하이웨이 — 5.6km 단독 노선.
   구간 12종을 순서대로 통과하고 종착 '스카이 링'에 닿는다.
   메가시티에도 같은 생성기로 통합돼 있다(외곽 익스프레스웨이).
   ═══════════════════════════════════════════════════════════════════ */
MAPS.push(
{id:"infinity",name:"인피니티 하이웨이",icon:"🛣️",
 desc:"5.6km 단독 고속도로 — 요철·꿀렁임·시케인·모굴·터널·뱅크·편측턱·점프·빨래판·초고속 직선, 계곡 대교와 산악 고갯길을 지나 종착지 '스카이 링'",
 modes:["free","crash","time"],
 build(){
  const SZ=4000;
  const mb=new MapBuilder(SZ,340),w=mb.world;
  const S_ASP=SURF_ID.asphalt,S_GRS=SURF_ID.grass,S_DRT=SURF_ID.dirt;

  /* 노선 — 뱀처럼 접어 5.6km 를 4km 맵 안에 담는다.
     왕복 3열: 남→북(x=-1150) → 북 U턴 → 북→남(x=0) → 남 U턴 → 남→북(x=1150, 종착) */
  const route=[];
  const push=(x,y,z)=>route.push({x,y,z});
  const arc=(cx,cz,r,a0,a1,y0,y1,n)=>{
    for(let i=0;i<=n;i++){const t=i/n,a=lerp(a0,a1,t);
      push(cx+Math.cos(a)*r,lerp(y0,y1,t),cz+Math.sin(a)*r);}};
  /* ① 남→북 (계곡 대교 포함) */
  /* 대교는 진입·탈출 경사로로 이어 붙인다 — 바로 24m 를 세우면 절벽이 생겨
     차가 벽에 박는다(실주행 감사에서 확인). */
  for(let z=-1780;z<=1380;z+=20){
    let y=0;
    if(z>=-460&&z<-300)y=24*(z+460)/160;        // 진입 경사
    else if(z>=-300&&z<=160)y=24;               // 계곡 대교(수평)
    else if(z>160&&z<=340)y=24*(1-(z-160)/180); // 탈출 경사
    else if(z>500&&z<1180){const t=(z-500)/680;y=Math.sin(t*Math.PI)*40;}  // 산 고갯길
    push(-1150,y,z);}
  /* ② 북쪽 U턴 */
  arc(-575,1380,575,Math.PI,0,0,0,54);
  /* ③ 북→남 */
  for(let z=1380;z>=-1380;z-=20)push(0,0,z);
  /* ④ 남쪽 U턴 */
  arc(575,-1380,575,Math.PI,2*Math.PI,0,0,54);
  /* ⑤ 남→북 (종착) */
  for(let z=-1380;z<=1500;z+=20)push(1150,0,z);

  /* ── 지형 ── */
  const onRoute=(x,z)=>{
    let best=1e9;
    for(const p of route){const d=Math.hypot(p.x-x,p.z-z);if(d<best)best=d;}
    return best;};
  mb.fill((x,z)=>{
    let h=Math.sin(x/420)*Math.cos(z/470)*11+Math.sin(x/103+z/131)*2.4;
    // 계곡 (x≈-1150, z -300~160)
    /* 협곡은 다리 경간(-300~160) '안쪽'에만 판다 — 밖으로 삐져나오면
       진입·탈출 경사로가 구멍 위에 놓여 차가 걸린다(실주행 감사에서 확인). */
    if(x>-1420&&x<-880&&z>-285&&z<145){
      const t=(z+285)/430;h-=Math.sin(t*Math.PI)*62;}
    // 산맥 (x≈-1150, z 500~1180)
    if(x>-1500&&x<-800&&z>460&&z<1220){
      const t=(z-460)/760;h+=Math.sin(t*Math.PI)*58;}
    return[h,S_GRS];});

  /* ── 고속도로 생성 ── */
  const EX=buildExpressway(mb,{route,halfWidth:15,
    isBridge:p=>p.x<-900&&p.z>=-300&&p.z<=160});

  /* ── 장소·스폰 ── */
  const P=EX.at;
  w.places=[
    {name:"🚦 출발 게이트",x:P(0).x,z:P(0).z,yaw:0},
    {name:"🌊 꿀렁임",x:P(.14).x,z:P(.14).z,yaw:0},
    {name:"🕳️ 터널",x:P(.36).x,z:P(.36).z,yaw:0},
    {name:"🏔️ 뱅크 커브",x:P(.44).x,z:P(.44).z,yaw:0},
    {name:"🚀 점프대",x:P(.575).x,z:P(.575).z,yaw:0},
    {name:"🏁 초고속 직선",x:P(.88).x,z:P(.88).z,yaw:0},
    {name:"✨ 스카이 링(종착)",x:P(.98).x,z:P(.98).z,yaw:0}];
  w.spawn={x:P(0).x,z:P(0).z,yaw:0};
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

/* ═══════════════════════════════════════════════════════════════════════════
   고속도로 생성기 — 주어진 중심선을 따라 '재미 구간'을 순서대로 깔고,
   끝에 종착 광장을 세운다. 인피니티 하이웨이(단독 맵)와 메가시티(통합)가
   같은 코드를 쓴다.
     · 회랑은 항상 평탄화 + 포장 + 양측 가드레일 → 주행 불가 구역이 생기지 않는다
     · 구간은 노선 진행률 t(0~1)로 배치한다
   ═══════════════════════════════════════════════════════════════════════════ */
function buildExpressway(mb,cfg){
  const w=mb.world;
  const S_ASP=SURF_ID.asphalt;
  const route=cfg.route;                  // [{x,y,z}] 중심선(고도 포함)
  /* 감사·AI 용으로 노선을 월드에 남긴다(여러 노선이면 이어 붙인다) */
  (w.exRoutes=w.exRoutes||[]).push(route);
  const HW=cfg.halfWidth||15;             // 반폭
  const finale=cfg.finale!==false;
  /* 이 시점까지 세워져 있던 것(= 기존 도시 구조물)만 회랑 청소 대상. 아래에서
     고속도로가 직접 세우는 터널벽·가드레일·점프대는 인덱스가 뒤라 건드리지 않는다.
     (실측: 메가시티 차로 한가운데에 창고 1동이 그대로 서 있었다) */
  const _preCount=w.boxes.length;
  /* 누적 거리 → 진행률 */
  const acc=[0];
  for(let k=1;k<route.length;k++)
    acc.push(acc[k-1]+Math.hypot(route[k].x-route[k-1].x,route[k].z-route[k-1].z));
  const TOTAL=acc[acc.length-1];
  const at=t=>{                            // 진행률 t 의 노선 점 + 진행 방향
    const d=clamp(t,0,1)*TOTAL;
    let k=1;while(k<acc.length-1&&acc[k]<d)k++;
    const f=(d-acc[k-1])/Math.max(1e-6,acc[k]-acc[k-1]);
    const a=route[k-1],b=route[k];
    const yaw=Math.atan2(b.x-a.x,b.z-a.z);
    return{x:lerp(a.x,b.x,f),y:lerp(a.y,b.y,f),z:lerp(a.z,b.z,f),yaw};};
  const side=(p,off)=>({x:p.x+Math.cos(p.yaw)*off,z:p.z-Math.sin(p.yaw)*off});

  /* ── 노반: 평탄화 + 포장 (다리 구간은 지형을 깎지 않는다) ── */
  const isBridge=cfg.isBridge||(()=>false);
  const land=[],bridge=[];
  {let cur=null;
   for(let k=0;k<route.length;k++){
     /* 판정은 '점'으로 한다. t(호길이)로 인덱스를 역산하면 직선·호의 점 간격이
        달라 다리/지상 경계가 어긋나고, 램프가 평탄화되지 않아 노면이 지면에
        남은 채 난간만 공중에 뜬다(실측: 설계 18.7m 지점의 지면이 -3.4m). */
     const br=isBridge(route[k],k,acc[k]/TOTAL);
     if(br){if(cur!=='b'){bridge.push([]);cur='b';}bridge[bridge.length-1].push(route[k]);}
     else{if(cur!=='l'){land.push([]);cur='l';}land[land.length-1].push(route[k]);}}}
  for(const seg of land){
    if(seg.length<2)continue;
    flattenCorridor(mb,seg,HW+9,26);
    mb.paintPath(seg,HW*2,S_ASP,true,true);
    mb.paintPath(seg,HW*2+16,S_ASP,false,false);}   // 갓길
  for(const seg of bridge){
    if(seg.length<2)continue;
    bridgeDeck(mb,seg,HW*2,{deck:0x4e5560,rail:0xd7dee6,pillar:0x7b838e});}
  mb.clearCorridor(route,HW+4,_preCount);   // 차로를 가로막는 기존 구조물 제거

  /* ── 재미 구간 ── */
  const SEC=cfg.sections||[
    ["rumble",  .02,.10],["wave",  .10,.18],["chicane",.18,.26],
    ["mogul",   .26,.33],["tunnel",.33,.40],["banked", .40,.48],
    ["split",   .48,.55],["jump",  .55,.60],["washboard",.60,.67],
    ["wave",    .67,.74],["rumble",.74,.80],["straight",.80,.95]];
  for(const[kind,t0,t1]of SEC){
    const L=(t1-t0)*TOTAL;
    switch(kind){
      case"rumble":{                       // 잔요철 + 럼블
        const n=Math.max(4,L/24|0);
        for(let i=0;i<n;i++){const p=at(t0+(t1-t0)*i/n);
          mb.bump(p.x,p.z,p.yaw,HW*2,.04+(i%3)*.012,"round");}
        const pm=at((t0+t1)/2);
        mb.rumbleZone(pm.x,pm.z,pm.yaw,Math.min(70,L/3),.010,.5,false);
        mb.texText(pm.x,pm.z,6,"ROUGH","rgba(240,244,250,.55)",pm.yaw);break;}
      case"wave":{                         // 롱웨이브 꿀렁임
        const n=Math.max(4,L/16|0);
        for(let i=0;i<n;i++){const p=at(t0+(t1-t0)*i/n);
          mb.bump(p.x,p.z,p.yaw,HW*2,.10+(i%3)*.04,"round");}
        const pm=at((t0+t1)/2);
        mb.texText(pm.x,pm.z,6,"WAVE","rgba(240,244,250,.55)",pm.yaw);break;}
      case"chicane":{                       // 좌우로 흔드는 시케인 콘 게이트
        const n=Math.max(4,L/40|0);
        for(let i=0;i<n;i++){const p=at(t0+(t1-t0)*i/n);
          const off=(i%2?1:-1)*HW*.55;
          const g=side(p,off);
          for(let c=0;c<3;c++){const q=side(at(t0+(t1-t0)*(i+c*.08)/n),off);
            mb.prop("cone",q.x,q.z);}}
        const pm=at((t0+t1)/2);
        mb.texText(pm.x,pm.z,6,"CHICANE","rgba(255,210,80,.6)",pm.yaw);break;}
      case"mogul":{                         // 좌우 엇갈린 모굴
        const n=Math.max(6,L/18|0);
        for(let i=0;i<n;i++){const p=at(t0+(t1-t0)*i/n);
          const q=side(p,(i%2?1:-1)*HW*.42);
          mb.bump(q.x,q.z,p.yaw,HW*.9,.15,"round");}
        const pm=at((t0+t1)/2);
        mb.texText(pm.x,pm.z,6,"MOGUL","rgba(240,244,250,.55)",pm.yaw);break;}
      case"tunnel":{                        // 터널 — 벽 + 천장
        const n=Math.max(6,L/14|0);
        for(let i=0;i<=n;i++){const p=at(t0+(t1-t0)*i/n);
          for(const s of[-1,1]){const q=side(p,s*(HW+1.6));
            mb.box(q.x,p.y+3.4,q.z,1.6,6.8,15,0x39414d,{yaw:p.yaw,mu:.8,tag:"tunwall"});}
          mb.visBox(p.x,p.y+7.2,p.z,HW*2+6,1.2,15,0x2b323c,{yaw:p.yaw});
          if(i%2===0)mb.visBox(p.x,p.y+6.4,p.z,3.2,.5,3.2,0xffe9a8,{yaw:p.yaw});}
        const pm=at(t0);
        mb.texText(pm.x,pm.z,6,"TUNNEL","rgba(255,233,168,.7)",pm.yaw);break;}
      case"banked":{                        // 뱅크 커브 — 바깥쪽을 들어 올린다
        const n=Math.max(8,L/10|0);
        for(let i=0;i<=n;i++){const p=at(t0+(t1-t0)*i/n);
          const ph=Math.sin(i/n*Math.PI);
          for(let s=1;s<=3;s++){const q=side(p,-(HW*s/3));
            mb.stamp(q.x,q.z,7,(ii,jj,d)=>{
              const idx=w.idx(ii,jj);
              w.hMap[idx]=Math.max(w.hMap[idx],p.y+ph*1.7*(s/3));});}}
        const pm=at((t0+t1)/2);
        mb.texText(pm.x,pm.z,6,"BANKED","rgba(240,244,250,.55)",pm.yaw);break;}
      case"split":{                         // 편측턱 — 한쪽 바퀴만 탄다
        const n=Math.max(5,L/22|0);
        for(let i=0;i<n;i++){const p=at(t0+(t1-t0)*i/n);
          const q=side(p,(i%2?1:-1)*HW*.5);
          mb.bump(q.x,q.z,p.yaw,HW*.8,.13,"sharp");}
        const pm=at((t0+t1)/2);
        mb.texText(pm.x,pm.z,6,"SPLIT","rgba(240,244,250,.55)",pm.yaw);break;}
      case"jump":{                          // 점프대 + 착지 램프
        const p=at((t0+t1)/2);
        mb.ramp(p.x,p.z,p.yaw,17,26,HW*2,0xd8a13a);
        const l=at((t0+t1)/2+.018);
        mb.ramp(l.x,l.z,l.yaw+Math.PI,9,20,HW*2,0xd8a13a);
        mb.texText(at(t0).x,at(t0).z,6,"JUMP","rgba(255,210,80,.75)",p.yaw);break;}
      case"washboard":{                     // 빨래판
        const n=Math.max(20,L/3|0);
        for(let i=0;i<n;i++){const p=at(t0+(t1-t0)*i/n);
          mb.box(p.x,w.height(p.x,p.z)+.03,p.z,HW*1.9,.07,.7,0x8f98a3,{yaw:p.yaw,mu:1,tag:"slat"});}
        const pm=at((t0+t1)/2);
        mb.texText(pm.x,pm.z,6,"WASHBOARD","rgba(240,244,250,.55)",pm.yaw);break;}
      case"straight":{                      // 초고속 직선 — 차선 마킹
        const n=Math.max(10,L/40|0);
        for(let i=0;i<n;i++){
          const a=at(t0+(t1-t0)*i/n),b=at(t0+(t1-t0)*(i+.5)/n);
          for(const s of[-1,1]){
            const p1=side(a,s*HW*.42),p2=side(b,s*HW*.42);
            mb.texPath([{x:p1.x,z:p1.z},{x:p2.x,z:p2.z}],.5,"rgba(255,255,255,.75)");}}
        const pm=at((t0+t1)/2);
        mb.texText(pm.x,pm.z,10,"FULL THROTTLE","rgba(255,210,80,.7)",pm.yaw);break;}
    }}

  /* ── 가드레일: 노선 전체(다리 구간 제외 — 다리는 자체 난간) ── */
  for(const seg of land)
    if(seg.length>2)railAlong(mb,seg,HW*2+5,0xb9c2cc);

  /* ── 종착 광장 '스카이 링' ── */
  if(finale){
    const e=at(1), CZ=e.z, CX=e.x;
    const _rv=mb._resvOn;mb._resvOn=false;   // 도로 위 구조물이 예약에 걸리지 않게
    mb.stamp(CX,CZ,220,(i,j)=>w.setS(i,j,S_ASP));
    mb.texCircle(CX,CZ,210,"rgba(26,30,38,.85)");
    mb.texCircle(CX,CZ,140,"rgba(255,210,80,.10)");
    // 발사 램프(진입 방향)
    const r0=at(.985);
    mb.ramp(r0.x,r0.z,r0.yaw,24,52,HW*2,0xd8a13a);
    // 공중 고리
    {const RR=60,cy=50;
     for(let k=0;k<40;k++){const a=k/40*Math.PI*2;
       const yy=cy+Math.sin(a)*RR;if(yy<2)continue;
       const q=side(e,Math.cos(a)*RR);
       mb.visBox(q.x,yy,q.z,7,7,9,k%2?0xffd23e:0x3ddc84,{roll:a,yaw:e.yaw});}
     for(const s of[-1,1]){const q=side(e,s*RR);
       mb.box(q.x,cy/2,q.z,9,cy,9,0x6f7883,{mu:.9,tag:"ringleg"});}}
    // 나선 타워 + 부유 링
    for(let k=0;k<170;k++){
      const t=k/170,a=t*Math.PI*8,r=52*(1-t*.62),y=6+t*234;
      mb.visBox(CX+Math.cos(a)*r,y,CZ+70+Math.sin(a)*r,11,3.4,11,
        k%3===0?0x6ee7ff:(k%3===1?0xffd23e:0xff7ab8),{yaw:a});}
    mb.box(CX,120,CZ+70,14,240,14,0x39414d,{mu:.9,tag:"towercore"});
    for(let ring=0;ring<3;ring++){
      const ry=96+ring*58,rr2=84-ring*17;
      for(let k=0;k<28;k++){const a=k/28*Math.PI*2;
        mb.visBox(CX+Math.cos(a)*rr2,ry,CZ+70+Math.sin(a)*rr2,6,2.4,6,
          ring===0?0xffd23e:(ring===1?0x6ee7ff:0x3ddc84),{yaw:a});}}
    // 네온 기둥 서클
    for(let k=0;k<24;k++){const a=k/24*Math.PI*2,r=190;
      mb.visBox(CX+Math.cos(a)*r,44,CZ+Math.sin(a)*r,5,88,5,k%2?0x6ee7ff:0xff7ab8,{});
      mb.box(CX+Math.cos(a)*r,6,CZ+Math.sin(a)*r,6,12,6,0x2a3038,{mu:.9,tag:"pillar"});}
    mb.texText(CX,CZ+185,12,"THE END OF THE ROAD","rgba(255,255,255,.85)");
    mb._resvOn=_rv;}
  return{at,TOTAL};
}
