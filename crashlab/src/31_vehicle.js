/* ============================================================
   Vehicle — raycast suspension + simplified-Pacejka tires
   + powertrain + damage model.  Local axes: +Z forward, +Y up.
   ============================================================ */
const _vA=V3(0,0,0),_vB=V3(0,0,0),_vC=V3(0,0,0),_vD=V3(0,0,0),_vE=V3(0,0,0),
      _vF=V3(0,0,0),_vG=V3(0,0,0),_vH=V3(0,0,0),_vUp=V3(0,1,0),_vFw=V3(0,0,1),_vUp2=V3(0,1,0),_vB2=V3(0,0,0),
      _vAe1=V3(0,0,0),_vAe2=V3(0,0,0),_vAe3=V3(0,0,0),   // 에어로(다운포스) 전용 임시
      _vLx1=V3(0,0,0),_vLx2=V3(0,0,0);                   // 럭셔리 승차감 전용 임시
const _hit={dist:0,n:V3(0,1,0),mu:1,surf:0,box:null};

function pacejka(a){ // normalized lateral grip vs slip angle(rad); peak ~1.0 @ ~8°
  const B=8.5,C=1.55;return Math.sin(C*Math.atan(B*a));}

class Vehicle{
  constructor(spec,world){
    this.spec=spec;this.world=world;
    this.body=new Body(spec.mass,V3(spec.body.hx,spec.body.hy,spec.body.hz));
    this.comY=spec.body.comY??0;
    // wheels: 0 FL, 1 FR, 2 RL, 3 RR
    this.wheels=[];
    const w=spec.wheels;
    const pos=[V3(-w.track,w.y,w.front),V3(w.track,w.y,w.front),
               V3(-w.track,w.y,-w.rear),V3(w.track,w.y,-w.rear)];
    for(let i=0;i<4;i++)this.wheels.push({
      i,local:pos[i],front:i<2,left:i%2===0,radius:w.radius,width:w.width,
      steer:0,comp:0,prevComp:0,onGround:false,load:0,surf:0,skid:0,spin:0,omega:0,dmg:0,
      cW:V3(0,0,0),cN:V3(0,1,0),susF:0,slipA:0,visY:w.y-spec.susp.rest});
    // hull collision points
    const hx=spec.body.hx,hy=spec.body.hy,hz=spec.body.hz;
    this.hull=[];
    for(const sx of[-1,1])for(const sy of[-1,1])for(const sz of[-1,1])
      this.hull.push(V3(sx*hx,sy*hy,sz*hz));
    this.hull.push(V3(0,-hy*.25,hz),V3(0,-hy*.25,-hz),V3(-hx,-hy*.2,0),V3(hx,-hy*.2,0));
    // 지붕 상단 점 — 압착기·전복 시 지붕 접촉(짓눌림) 감지
    this.hull.push(V3(0,hy,0),V3(0,hy,hz*.55),V3(0,hy,-hz*.55));
    // 프레임 전역 접점 확충 — 부딪힌 어느 부위든 그 자리가 함몰(측면 상부·전후 상부·루프 레일)
    this.hull.push(V3(-hx,hy*.42,hz*.5),V3(hx,hy*.42,hz*.5),V3(-hx,hy*.42,-hz*.5),V3(hx,hy*.42,-hz*.5)); // 도어 상단/필러
    this.hull.push(V3(0,hy*.55,hz),V3(0,hy*.55,-hz));       // 윈드실드/리어글래스 프레임 상단
    this.hull.push(V3(-hx*.72,hy,0),V3(hx*.72,hy,0));       // 루프 좌우 레일
    this.assists={abs:true,tcs:true,ctr:true,stab:true};
    this.isAI=false;this.controlLock=false;
    this.impacts=[];   // {lp,ln,dv,wp} consumed by visuals each frame
    this.peakG=0;this._pv=V3(0,0,0);
    this.damageOn=true;
    this.reset(0,0,0);
  }
  reset(x,z,yaw,keepDamage){
    const b=this.body;
    b.pos.set(x,this.world.height(x,z)+this.spec.susp.rest+this.spec.body.hy+.1,z);
    b.quat.setFromEuler(new THREE.Euler(0,yaw,0));
    b.vel.set(0,0,0);b.angVel.set(0,0,0);b.force.set(0,0,0);b.torque.set(0,0,0);
    this.steerIn=0;this.throttle=0;this.brake=0;this.handbrake=false;
    this.steer=0;this.gear=1;this.rpm=this.spec.engine.idle;this.shiftT=0;this.driveMode="D";
    this.peakG=0;this._pv.copy(b.vel);
    for(const w of this.wheels){w.comp=0;w.prevComp=0;w.cVelF=0;w.pv=0;w.skid=0;w.omega=0;w.onGround=false;w.load=0;}
    if(!keepDamage)this.clearDamage();
    this.impacts.length=0;
    this.lastGood={pos:b.pos.clone(),quat:b.quat.clone()};
    this.flipT=0;this.airT=0;
    b.snap();                       // 렌더 보간 잔상 방지
    for(const w of this.wheels){w.pVisY=w.visY;w.rVisY=w.visY;w.pSpin=w.spin;w.rSpin=w.spin;}
  }
  isFlipped(){
    const u=_vUp2.set(0,1,0).applyQuaternion(this.body.quat);return u.y<.5;}
  uprightInPlace(){   // 현재 위치에서 똑바로 세우기 (전복 복구)
    const b=this.body;
    const f=_vUp2.set(0,0,1).applyQuaternion(b.quat);   // 월드 전방 → yaw
    let yaw=Math.atan2(f.x,f.z);if(!isFinite(yaw))yaw=0;
    b.quat.setFromEuler(new THREE.Euler(0,yaw,0));
    b.pos.y=this.world.height(b.pos.x,b.pos.z)+this.spec.susp.rest+this.spec.body.hy+.1;
    b.vel.set(0,0,0);b.angVel.set(0,0,0);b.force.set(0,0,0);b.torque.set(0,0,0);
    this.impacts.length=0;this.flipT=0;this.airT=0;this.throttle=0;this.brake=0;
    for(const w of this.wheels){w.comp=0;w.prevComp=0;w.cVelF=0;w.pv=0;w.skid=0;w.omega=0;w.onGround=false;w.load=0;}
    this.lastGood={pos:b.pos.clone(),quat:b.quat.clone()};
    b.snap();}                      // 렌더 보간 잔상 방지(순간 자세 변경)
  clearDamage(){
    this.dmg={f:0,b:0,l:0,r:0};
    this.powerMul=1;this.steerMul=1;this.suspMul=1;this.brakeMul=1;this.toe=0;this.defVol=0;
    this.partHp={fb:1,rb:1,hood:1,trunk:1,dl:1,dr:1};
    for(const w of this.wheels){w.dmg=0;if(w.local0)w.local.copy(w.local0);}   // 휠 손상·밀려난 마운트 복원
  }
  addDamage(lp,dv){
    if(!this.damageOn)return;
    const s=this.spec.body,dmul=(typeof Settings!=="undefined"&&Settings.damageMul)||1;
    const amt=clamp(dv*2.2*dmul,0,45);
    if(lp.z>s.hz*.45)this.dmg.f=Math.min(100,this.dmg.f+amt);
    else if(lp.z<-s.hz*.45)this.dmg.b=Math.min(100,this.dmg.b+amt);
    else if(lp.x<0)this.dmg.l=Math.min(100,this.dmg.l+amt*1.2);
    else this.dmg.r=Math.min(100,this.dmg.r+amt*1.2);
    // 부위별(휠) 손상: 충격점에 가장 가까운 휠의 서스/타이어가 상함 → 그립 저하·정렬 틀어짐
    if(dv>3.2){
      let best=-1,bd=1e9;
      for(let i=0;i<4;i++){const w=this.wheels[i],wl=w.local0||w.local;
        const d2=(lp.x-wl.x)**2+(lp.z-wl.z)**2;
        if(d2<bd){bd=d2;best=i;}}
      if(best>=0&&bd<(s.hz*.72)**2)
        this.wheels[best].dmg=Math.min(1,(this.wheels[best].dmg||0)+clamp((dv-3)*.045*dmul,0,.5));}
    const d=this.dmg;
    this.powerMul=1-.55*clamp((d.f-22)/78,0,1);                       // 엔진·라디에이터 손상
    this.steerMul=1-.4*clamp((d.f+(d.l+d.r)*.5)/160,0,1);             // 스티어링 랙 손상
    this.suspMul=1-.35*clamp((d.f+d.b+d.l+d.r)/320,0,1);
    this.brakeMul=1-.42*clamp((d.f+d.b*.5)/150,0,1);                  // 브레이크 라인 손상
    // 프레임 굽음 → 토우 틀어짐(차가 한쪽으로 쏠림). 휠 손상 편차도 쏠림에 가산.
    const wl=((this.wheels[0].dmg||0)+(this.wheels[2].dmg||0))*.5;
    const wr=((this.wheels[1].dmg||0)+(this.wheels[3].dmg||0))*.5;
    this.toe=clamp((d.l-d.r)*.00045+(wl-wr)*.028,-.06,.06)*(1+.2*Math.random());
  }
  get speed(){return this.body.vel.length();}
  fwdSpeed(){this.body.vecToWorld(_vFw.set(0,0,1),_vA);return this.body.vel.dot(_vA);}

  step(dt){
    const b=this.body,sp=this.spec,world=this.world;
    b.vecToWorld(_vUp.set(0,1,0),_vB);const up=_vB;            // car up (world)
    b.vecToWorld(_vFw.set(0,0,1),_vC);const fw=_vC;            // car forward
    const vFwd=b.vel.dot(fw);
    const speed=b.vel.length();

    /* ----- steering ----- */
    const maxSteer=lerp(sp.steerLo,sp.steerHi,clamp(Math.abs(vFwd)/38,0,1))*this.steerMul;
    let target=clamp(this.steerIn,-1,1)*maxSteer;
    if(this.assists.ctr&&Math.abs(vFwd)>4){
      b.vecToLocal(b.vel,_vD);
      const beta=Math.atan2(_vD.x,Math.abs(_vD.z)); // body slip
      target+=clamp(beta*.75,-sp.steerLo*.8,sp.steerLo*.8)*clamp(Math.abs(vFwd)/10,0,1);
      target=clamp(target,-sp.steerLo,sp.steerLo);}
    const sSpd=(typeof Settings!=="undefined"&&Settings.steerSpeed)||1;   // 조향 응답 속도(설정)
    const sRate=(Math.abs(target)<Math.abs(this.steer)?9:5.5)*sSpd;
    this.steer+=clamp(target-this.steer,-sRate*dt,sRate*dt);

    /* ----- transmission ----- */
    const eng=sp.engine,r=sp.wheels.radius;
    const wSpd=Math.max(Math.abs(vFwd),0)/r;
    let ratio=sp.gears[this.gear-1]*sp.final;
    this.rpm=lerp(this.rpm,clamp(wSpd*ratio*9.549,eng.idle,eng.redline),Math.min(1,dt*12));
    if(this.shiftT>0)this.shiftT-=dt;
    else if(this.driveMode==="D"){
      if(this.rpm>eng.redline*.94&&this.gear<sp.gears.length){this.gear++;this.shiftT=.28;if(!this.isAI)Sfx.gearShift();}
      else if(this.rpm<eng.redline*.4&&this.gear>1){this.gear--;this.shiftT=.2;}}
    ratio=sp.gears[this.gear-1]*sp.final;
    let engF=0;
    if(this.driveMode==="D"&&this.shiftT<=0&&this.throttle>0){
      const t=clamp(this.rpm/eng.redline,0,1);
      const curve=.62+.38*Math.sin(Math.PI*clamp((t-.02)/.98,0,1));
      const cutoff=(this.gear===sp.gears.length&&t>.985)?0:1;
      engF=eng.maxT*curve*this.throttle*ratio*.85/r*this.powerMul*cutoff;}
    else if(this.driveMode==="D"&&this.throttle===0&&Math.abs(vFwd)>1.2){
      engF=-sign(vFwd)*eng.maxT*ratio*.07/r*(this.rpm/eng.redline); // 엔진 브레이크
    }
    else if(this.driveMode==="R"&&this.throttle>0){
      const rvCap=clamp(1+vFwd/8.5,0,1); // vFwd negative when reversing
      engF=-eng.maxT*sp.gears[0]*sp.final*.55/r*this.throttle*this.powerMul*rvCap;
      this.rpm=lerp(this.rpm,eng.idle+Math.abs(vFwd)*260,dt*8);}
    // drive split
    const split=[0,0,0,0];
    if(sp.drive==="FF"){split[0]=split[1]=.5;}
    else if(sp.drive==="FR"||sp.drive==="RWD"){split[2]=split[3]=.5;}
    else{split[0]=split[1]=.2;split[2]=split[3]=.3;} // 4WD 40:60

    /* ----- wheels ----- */
    const susp=sp.susp,kMul=this.suspMul;
    const S_=(typeof Settings!=="undefined")?Settings:null;
    const gripMul=(S_&&S_.gripMul)||1, dampMul=(S_&&S_.damperMul)||1;   // 설정: 그립·댐핑 배율
    let groundCount=0,skidMax=0;
    const maxRay=susp.rest+r;
    for(let i=0;i<4;i++){
      const w=this.wheels[i];
      b.localToWorld(w.local,_vD);              // mount world
      _vE.copy(up).multiplyScalar(-1);          // ray dir
      w.prevComp=w.comp;
      if(world.raycast(_vD,_vE,maxRay,_hit)&&_hit.dist<maxRay){
        w.onGround=true;groundCount++;
        const dist=Math.max(_hit.dist,r*.6);
        w.comp=clamp(maxRay-dist,0,susp.travel);
        /* 노면 미세 요철 — 스프링 변위(compS)에만 더한다.
           ⚠ 예전에는 w.comp 자체에 더했는데, 이 노이즈의 파장이 한 스텝 이동거리보다
           짧아서 comp가 스텝마다 ±5mm씩 튀었다. 그걸 댐퍼가 미분하면 cVel이 ±0.6m/s가
           되어 평지에서도 서스펜션 힘이 0↔10,000N으로 요동쳤다(측정치).
           변위에만 반영하면 노면 결은 살아 있고 댐퍼는 조용하다. */
        let compS=w.comp;
        if(!_hit.box){
          const ra=SURF_ROUGH[_hit.surf];
          if(ra)compS=Math.max(0,w.comp+ra*Math.sin(w.cW.x*6.13)*Math.sin(w.cW.z*5.31)
            +ra*.5*Math.sin(w.cW.x*17.7+w.cW.z*13.1));}
        w.visY=w.local.y-(dist-r);
        w.cW.copy(_vD).addScaledVector(_vE,dist); // contact point
        w.cN.copy(_hit.n);w.surf=_hit.surf;
        // suspension (spring+damper) + anti-roll bar
        const other=this.wheels[w.front?(i===0?1:0):(i===2?3:2)];
        const arb=sp.arb*(w.comp-other.comp);
        // 댐퍼 속도 제한: 방지턱 모서리에서 comp가 급변해 코너가 튀어오르며 전복하는 것 방지
        const cVelRaw=clamp((w.comp-w.prevComp)/dt,-3.5,3.5);
        /* 댐퍼 유압 지연(1차 저역통과) — 실제 댐퍼는 오일·호스 컴플라이언스 때문에
           스텝 단위의 순간 속도를 그대로 힘으로 바꾸지 못한다. 이 필터가 없으면
           격자 보간의 미세 계단이 그대로 힘 잡음이 된다. */
        w.cVelF=(w.cVelF===undefined)?cVelRaw:w.cVelF+(cVelRaw-w.cVelF)*.42;
        const cVel=w.cVelF;
        // 비대칭 댐핑: 리바운드(늘어남)는 압축보다 강하게 → 방지턱 후 위로 튀는 요동 억제(실차 댐퍼)
        const cAsym=cVel<0?(susp.rebMul||1.5):1;
        /* 프로그레시브 스프링(susp.prog) — 승차 높이 부근은 아주 부드럽고, 바닥칠 직전에만
           급격히 단단해진다. 실차 에어스프링의 비선형 레이트를 흉내내 잔진동을 크게 줄인다. */
        const cRel=susp.travel>0?w.comp/susp.travel:0;
        const kEff=susp.prog?susp.k*(1+susp.prog*cRel*cRel*3):susp.k;
        const spring=kEff*kMul*compS;
        /* 리바운드 댐핑 하한 — 댐퍼가 스프링을 완전히 상쇄해 지지력이 0이 되면
           방지턱을 내려올 때 차체가 자유낙하했다가 쿵 하고 받는다(측정: 힘 0N 구간).
           댐퍼는 스프링 힘의 일부까지만 깎을 수 있게 한다. */
        let dF=susp.c*kMul*dampMul*cVel*cAsym;
        if(dF<0)dF=Math.max(dF,-(spring*.80+sp.mass*GRAV*.04));
        let sF=spring+dF+arb;
        /* 스카이훅·헤이브·프리뷰는 '보조'다. 이 셋이 합쳐 지지력을 무너뜨리면
           서스가 사라진 것처럼 느껴지므로, 총 감쇠량을 스프링 힘 기준으로 제한한다. */
        let aid=0;
        if(susp.sky)aid+=b.vel.y*susp.sky;     // 스카이훅(전자제어 에어서스): 차체 상하 요동 직접 감쇠
        /* 상승 억제 — 차체가 위로 뜨는 국면에서만 스프링력을 추가로 깎는다.
           방지턱을 넘을 때 서스가 차를 '들어올려' 꿀렁이는 것을 직접 없앤다
           (내려가는 국면은 건드리지 않아 접지력은 유지). */
        if(susp.heave&&b.vel.y>0)aid+=b.vel.y*susp.heave;
        /* 노면 예측(플래너/매직카펫) — 진행 방향 앞쪽 노면 높이를 미리 읽어,
           올라오는 요철은 미리 힘을 빼 충격을 흡수하고 내려가는 곳은 미리 받쳐 준다. */
        if(susp.preview&&!_hit.box){
          const lead=susp.preview;
          const ah=world.height(w.cW.x+b.vel.x*lead,w.cW.z+b.vel.z*lead);
          w.pv=lerp(w.pv||0,clamp(ah-w.cW.y,-.14,.14),.3);
          aid+=w.pv*(susp.pvGain||0)*sp.mass;}
        if(aid)sF-=clamp(aid,-sp.mass*GRAV*.35,spring*.40+sp.mass*GRAV*.05);
        /* 블로우오프 밸브 — 서스가 차체를 밀어올릴 수 있는 최대 힘을 제한한다.
           고급차 댐퍼의 블로우오프처럼, 큰 충격은 힘으로 전달하지 않고 흘려보낸다. */
        sF=clamp(sF,spring*.18,sp.mass*GRAV*(susp.fCap||1.4));
        w.susF=sF;w.load=lerp(w.load,sF,.5);
        _vF.copy(_hit.n).multiplyScalar(.4).addScaledVector(up,.6).normalize().multiplyScalar(sF);
        _vG.copy(w.cW).sub(b.pos);
        b.addForceAt(_vF,_vG);
        /* --- tire forces --- */
        const steerA=(w.front?this.steer:0)+(w.left?-this.toe:this.toe);
        _vF.set(Math.sin(steerA),0,Math.cos(steerA));      // wheel fwd (local)
        b.vecToWorld(_vF,_vH);
        _vH.addScaledVector(_hit.n,-_vH.dot(_hit.n)).normalize();  // project on ground
        b.velAt(_vG,_vA);                                   // contact velocity
        const side=_t2.copy(_hit.n).cross(_vH);             // right vector
        const vF2=_vA.dot(_vH),vS=_vA.dot(side);
        const load=Math.max(w.load,0);
        // 휠 손상 → 그립 저하(찌그러진 림·펑크 타이어). 손상 클수록 μ가 떨어져 차가 그쪽으로 쏠림.
        const mu=_hit.mu*(w.front?sp.gripF:sp.gripR)*(1-.55*(w.dmg||0))*gripMul;
        const maxF=mu*load;
        // longitudinal
        let longF=engF*split[i];
        let brk=this.brake*sp.brakeF*(w.front?.6:.4)*this.brakeMul;
        let locked=false;
        if(this.handbrake&&!w.front){brk=Math.max(brk,sp.brakeF*.8);locked=!this.assists.abs||true;}
        if(brk>0&&Math.abs(vF2)>.3){
          let bF=brk;
          if(this.assists.abs&&!(this.handbrake&&!w.front))bF=Math.min(bF,maxF*.95);
          else if(bF>maxF){locked=true;bF=maxF*.72;}
          longF+=-sign(vF2)*bF;}
        else if(brk>0){longF+=-clamp(vF2,-1,1)*brk;}
        // TCS: cap drive force at grip
        if(this.assists.tcs&&Math.abs(longF)>maxF*.92)longF=sign(longF)*maxF*.92;
        let spinExcess=0;
        if(Math.abs(longF)>maxF){spinExcess=(Math.abs(longF)-maxF)/Math.max(maxF,1);
          longF=sign(longF)*maxF*(locked?.72:.85);}
        // lateral (simplified Pacejka), low-speed blend
        const slipA=Math.atan2(vS,Math.abs(vF2)+.6);w.slipA=slipA;
        let latGrip=locked?.3:1;
        if(this.handbrake&&!w.front)latGrip=.32;
        let latF;
        if(speed<2.5){latF=-vS*load*1.9;latF=clamp(latF,-maxF,maxF);}
        else latF=-pacejka(slipA)*maxF*latGrip;
        // friction circle (long priority)
        const rem=Math.sqrt(Math.max(maxF*maxF-longF*longF,0));
        latF=clamp(latF,-rem,rem);
        _vA.copy(_vH).multiplyScalar(longF).addScaledVector(side,latF);
        b.addForceAt(_vA,_vG);
        // skid metric
        const slip=Math.abs(slipA)/ (8*DEG);
        w.skid=clamp(Math.max(slip-.85,spinExcess,locked?1:0)*clamp(speed/6,0,1),0,1);
        skidMax=Math.max(skidMax,w.skid);
        w.omega=vF2/r+spinExcess*18*sign(engF||1);
      }else{
        w.onGround=false;w.comp=0;w.load*=.7;w.skid=0;w.surf=0;
        w.visY=w.local.y-susp.rest;
        w.omega*=.99;}
      w.spin+=w.omega*dt;
    }
    this.skidMax=skidMax;this.grounded=groundCount;
    this.airT=groundCount===0?this.airT+dt:0;

    /* ----- aero + rolling resistance -----
       다운포스는 동압(v²)에 비례하며 '월드 기준 아래'로, 앞·뒤 액슬에 나눠 가한다.
       · 월드 아래 방향 → 차가 기울거나 떠도 항상 노면으로 눌러 뜸·전복을 억제
       · 액슬 분배 → 피치가 안정되고 좌우 하중이 늘어 롤을 억제
       · 하중이 늘면 타이어 한계(μ·load)가 함께 커져 고속 코너 그립이 자연히 상승 */
    b.force.addScaledVector(b.vel,-sp.aero.cd*speed);
    /* 🛋️ 자세 안정(플래너 계열) — 차체 피치·롤 각속도를 직접 감쇠한다.
       스프링을 무르게 두면 승차감은 좋아지지만 몸이 출렁이는데, 각속도만 따로 잡아 주면
       무른 스프링의 부드러움을 유지하면서 흔들림(뱃멀미)은 사라진다. */
    if(susp.attq&&groundCount>0){
      b.vecToWorld(_vLx1.set(1,0,0),_vLx2);                 // 피치 축
      b.torque.addScaledVector(_vLx2,-b.angVel.dot(_vLx2)*sp.mass*susp.attq);
      b.vecToWorld(_vLx1.set(0,0,1),_vLx2);                 // 롤 축
      b.torque.addScaledVector(_vLx2,-b.angVel.dot(_vLx2)*sp.mass*susp.attq*1.3);
      // 수직 요동도 한 번 더 — 네 바퀴 접지 시에만(공중에서 부양 방지)
      if(groundCount===4&&susp.sky)
        b.force.y-=b.vel.y*susp.sky*.6;}
    /* 🛋️ 차체 헤이브 댐퍼 — 휠 지지력(sF)과 무관한 '별도의' 힘이라 접지를 해치지
       않으면서 차체 상하 흔들림만 잡는다. 스프링을 깎는 방식(sky/heave)과 달리
       지지력이 0으로 무너질 수 없어, 승차감을 올려도 방지턱 뒷면에서 자유낙하하지
       않는다. 접지 바퀴 수에 비례시켜 공중에서는 작용하지 않는다. */
    if(groundCount>0){
      const bd=(susp.bodyDamp===undefined?.55:susp.bodyDamp)*sp.mass*(groundCount*.25);
      if(bd>0)b.force.y-=b.vel.y*bd;}
    if(sp.aero.df>0&&speed>5){
      const q=sp.aero.df*speed*speed*.01;
      for(const[frac,zoff]of[[.46,sp.wheels.front],[.54,-sp.wheels.rear]]){
        _vAe1.set(0,-sp.body.hy*.6,zoff);
        b.localToWorld(_vAe1,_vAe2);
        _vAe3.copy(_vAe2).sub(b.pos);
        b.addForceAt(_vAe1.set(0,-q*frac,0),_vAe3);}
      // 고속 롤 감쇠 + 롤 각도 제한 — 다운포스가 큰 차일수록 강하게(급조향 전복 방지)
      if(groundCount>0){
        b.vecToWorld(_vAe1.set(0,0,1),_vAe2);              // 차 전방축(롤 축)
        const dfK=Math.min(2.4,sp.aero.df/55);
        const rollR=b.angVel.dot(_vAe2);
        b.torque.addScaledVector(_vAe2,-rollR*sp.mass*Math.min(1.8,speed*.022)*dfK);
        // 롤 각(차체 좌우 기울기)이 커지면 되돌리는 복원 토크 — 넘어가기 전에 잡는다
        b.vecToWorld(_vAe1.set(1,0,0),_vAe3);              // 차 우측축
        const tilt=_vAe3.y;                                 // >0 이면 우측이 들림
        if(Math.abs(tilt)>.06)
          b.torque.addScaledVector(_vAe2,-sign(tilt)*(Math.abs(tilt)-.06)*sp.mass*10*dfK);}}
    if(groundCount>0)b.force.addScaledVector(b.vel,-14);

    /* ----- stability assist (yaw damp) ----- */
    if(this.assists.stab&&groundCount>2&&speed>3){
      const yawR=b.angVel.dot(up);
      _vA.copy(up).multiplyScalar(-yawR*sp.mass*.55);
      b.torque.add(_vA);}
    /* ----- 전복 저항 (롤 댐핑 + 기울기 복원, 공중 자세 안정 포함) ----- */
    {
      b.vecToWorld(_vFw.set(0,0,1),_vA);
      const rollR=b.angVel.dot(_vA);
      // 롤 각속도 댐핑 — 접지 시 강하게, 공중에서도 일부(급회전 방지)
      b.torque.addScaledVector(_vA,-rollR*sp.mass*(groundCount>0?1.15:.5));
      // 기울기 복원: ~20°부터 강하게 개입 → 전복 억제 (접지 강, 공중 중간)
      if(up.y<.94){
        const tilt=(.94-up.y)/.94;
        const kR=groundCount>0?6.0:2.4;
        _t2.copy(up).cross(_vUp2.set(0,1,0));      // carUp × worldUp = 복원축
        b.torque.addScaledVector(_t2,sp.mass*kR*tilt*tilt);}}

    /* ----- gravity ----- */
    b.force.y-=sp.mass*GRAV;

    /* ----- chassis collision ----- */
    if(this._udT>0)this._udT-=dt;
    const rigidCts=this._rigidCts||(this._rigidCts=[]);rigidCts.length=0;
    const ccd=speed*dt>.28;   // 고속: 한 스텝 이동량이 커 관통 위험 → 예측점 CCD
    for(let i=0;i<this.hull.length;i++){
      b.localToWorld(this.hull[i],_vD);
      let ct=world.pointContact(_vD);
      if(!ct&&ccd){
        _vH.copy(_vD).addScaledVector(b.vel,dt*.6);
        const c2=world.pointContact(_vH);
        if(c2){const t2=c2.box&&c2.box.tag;
          if(!(t2==="bump"||t2==="slat"||t2==="cobble"||t2==="stair"||t2==="curb"||t2==="ridge"||t2==="plank"||t2==="teeter"||t2==="crusher"))
            ct={n:c2.n,depth:.02,mu:c2.mu,bounce:c2.bounce,box:c2.box};}
        if(!ct){_vH.copy(_vD).addScaledVector(b.vel,dt*1.2);
          const c3=world.pointContact(_vH);
          if(c3){const t3=c3.box&&c3.box.tag;
            if(!(t3==="bump"||t3==="slat"||t3==="cobble"||t3==="stair"||t3==="curb"||t3==="ridge"||t3==="plank"||t3==="teeter"||t3==="crusher"))
              ct={n:c3.n,depth:.01,mu:c3.mu,bounce:c3.bounce,box:c3.box};}}}
      if(!ct)continue;
      const tg=ct.box&&ct.box.tag;
      // 방지턱(지형 아치) 위에서 차체 바닥이 스치면: 강체 충돌(퉁!) 금지 → 부드럽게 통과
      const onBump=!ct.box&&world.bumps.length&&world.bumpH(_vD.x,_vD.z)>.05;
      // 방지턱·빨래판·연석 등 차체보다 낮/높은 지형지물: 강체 충돌(퉁!) 금지
      const driveOver=onBump||tg==="slat"||tg==="cobble"||tg==="stair"||tg==="curb"||tg==="ridge"||tg==="plank"||tg==="teeter";
      if(driveOver){
        // 부드러운 스프링 통과 + 밑면만 함몰 (차는 그대로 진행)
        _vG.copy(_vD).sub(b.pos);b.velAt(_vG,_vA);
        const vn=_vA.dot(ct.n);
        let f=ct.depth*sp.mass*20;                        // 침투 비례 스프링(위로)
        if(vn<0)f+=-vn*sp.mass*2.4;                        // 접근 속도 완충
        b.addForceAt(_vB2.copy(ct.n).multiplyScalar(f),_vG);
        // 밑면 함몰(레이트 리밋·비손상): 장애물이 차체보다 높으면 살짝 움푹
        if(ct.depth>.05&&!(this._udT>0)){this._udT=.22;
          this.registerImpact(this.hull[i],_vD,ct.n,Math.min(4.5,2+ct.depth*26),true);}
        continue;
      }
      // 압착기: 램이 위에서 짓눌러 수직 압착(플래튼). 강체 반발 없이 아래로 고정 + 큰 변형.
      if(tg==="crusher"){
        const ramV=Math.max(0,-(ct.box.vy||0));            // 램 하강 속도
        _vG.copy(_vD).sub(b.pos);
        _vB2.set(0,-sp.mass*(2.4+ramV*.7),0);              // 차를 앤빌에 눌러 붙임
        b.addForceAt(_vB2,_vG);
        const pv=13+Math.max(0,ct.depth)*70+ramV*1.6;      // 압착 강도(침투·램속도 비례)
        this.registerImpact(this.hull[i],_vD,_vC.set(0,-1,0),Math.min(46,pv)); // 월드 하방 압착
        continue;}
      // 강체 접촉: 즉시 해결하지 않고 수집 → 사전 접근속도를 함께 기록.
      // (첫 접점을 먼저 풀면 나머지 접점의 접근속도가 0이 되어, 벽에 정면으로 박아도
      //  한쪽 모서리만 찌그러지는 순서 의존 비대칭이 생긴다. 수집 후 일괄 처리로 해결.)
      _vG.copy(_vD).sub(b.pos);b.velAt(_vG,_vA);
      rigidCts.push({i,wx:_vD.x,wy:_vD.y,wz:_vD.z,
        n:{x:ct.n.x,y:ct.n.y,z:ct.n.z},depth:ct.depth,mu:ct.mu,bounce:ct.bounce,
        vn:_vA.dot(ct.n)});}
    // 반복 접촉 솔버: 임펄스를 접점 수로 분배해 2회 반복 → 수렴(지터·침하·끼임 제거).
    // 위치 보정은 접점별로 누적하지 않고, 법선별 최대 침투만 모아 1회 적용(과보정으로 튀어오르는 현상 방지).
    const NC=rigidCts.length;
    if(NC){
      const dvOut=this._dvOut||(this._dvOut=[]);dvOut.length=0;
      for(let it=0;it<2;it++)
        for(let ri=0;ri<NC;ri++){
          const rc=rigidCts[ri];
          _vD.set(rc.wx,rc.wy,rc.wz);_vC.set(rc.n.x,rc.n.y,rc.n.z);
          _hit.n.copy(_vC);_hit.mu=rc.mu;
          const dv=resolvePointContact(b,_vD,
            {n:_vC,depth:0,mu:rc.mu,bounce:rc.bounce},0,1/NC);   // depth 0: 위치보정은 아래서 일괄
          if(it===0)dvOut[ri]=dv;}
      // 침투 해소: 가장 깊은 접점 방향으로 한 번만 밀어냄 + 파고드는 속도성분 상쇄(벽 경계 확실)
      let deepest=null;
      for(const rc of rigidCts)if(!deepest||rc.depth>deepest.depth)deepest=rc;
      if(deepest&&deepest.depth>.02){
        _vC.set(deepest.n.x,deepest.n.y,deepest.n.z);
        b.pos.addScaledVector(_vC,Math.min(deepest.depth*.9,.45));
        const vin=b.vel.dot(_vC);if(vin<0)b.vel.addScaledVector(_vC,-vin);}
      // 크럼플 등록: 사전 접근속도 기준 → 모든 접점이 동일 강도(순서 의존 비대칭 없음)
      for(let ri=0;ri<NC;ri++){
        const rc=rigidCts[ri];
        _vD.set(rc.wx,rc.wy,rc.wz);_vC.set(rc.n.x,rc.n.y,rc.n.z);
        const useDv=Math.max(dvOut[ri]||0,-rc.vn);
        // 전복 시 루프(상단 프레임)도 물리대로 손상: 지붕 접점은 문턱 낮게 + 압궤 가중
        const roofPt=this.hull[rc.i].y>sp.body.hy*.55;
        if(roofPt&&useDv>.9)this.registerImpact(this.hull[rc.i],_vD,_vC,useDv*1.35);
        else if(useDv>1.4)this.registerImpact(this.hull[rc.i],_vD,_vC,useDv);}}

    /* ----- props ----- */
    hitProps(this);

    /* ----- integrate ----- */
    b.integrate(dt);
    // parking friction
    if(speed<.5&&this.throttle===0&&groundCount>2){b.vel.multiplyScalar(.86);b.angVel.multiplyScalar(.86);}
    // peak G (50ms window — 실측 감속 펄스 기준)
    if(!this._gRing){this._gRing=[];for(let i=0;i<6;i++)this._gRing.push(b.vel.clone());this._gI=0;}
    const old=this._gRing[this._gI];
    _vA.copy(b.vel).sub(old);
    const g=_vA.length()/(dt*6)/GRAV;
    if(g>this.peakG&&g<200)this.peakG=g;
    old.copy(b.vel);this._gI=(this._gI+1)%6;
    // flip detection
    this.flipT=(up.y<.25&&speed<2)?this.flipT+dt:0;
    // NaN guard → rollback (안정성 2)
    if(!b.ok()){
      b.pos.copy(this.lastGood.pos);b.quat.copy(this.lastGood.quat);
      b.vel.set(0,0,0);b.angVel.set(0,0,0);b.force.set(0,0,0);b.torque.set(0,0,0);
      b.snap();}                    // 롤백도 순간이동 → 보간 잔상 방지
    else if((this._goodT=(this._goodT||0)+dt)>.5){this._goodT=0;
      this.lastGood.pos.copy(b.pos);this.lastGood.quat.copy(b.quat);}
  }
  registerImpact(lp,wp,n,dv,soft){
    this.body.vecToLocal(n,_vA);
    this.impacts.push({lp:lp.clone(),ln:_vA.clone(),wp:wp.clone(),dv,soft:!!soft});
    if(this.impacts.length>14)this.impacts.shift();
    if(!soft)this.addDamage(lp,dv);   // soft=밑면 스침: 손상 카운터/표시 없음
  }
}

/* car ↔ car collision (both dynamic) — 다중 접점 + 질량비 분리 + 접선 마찰 + 각운동량 교환.
   (구버전은 첫 접점에서 return 해 접점 1개만 풀렸다 → 차대차 충돌이 약하고 비대칭·관통되던 원인) */
const _ccCts=[];
function collideCars(a,c){
  _vA.copy(a.body.pos).sub(c.body.pos);
  const rr=a.body.half.length()+c.body.half.length();
  if(_vA.lengthSq()>rr*rr)return;
  _ccCts.length=0;
  // ① 양방향 접점 수집(사전 접근속도 기록 → 순서 의존 비대칭 제거)
  for(let pass=0;pass<2;pass++){
    const A=pass?c:a,B=pass?a:c;      // A's points vs B's box
    for(let hi=0;hi<A.hull.length;hi++){
      A.body.localToWorld(A.hull[hi],_vB);
      B.body.worldToLocal(_vB,_vC);
      const h=B.body.half;
      const dx=h.x-Math.abs(_vC.x),dy=h.y-Math.abs(_vC.y),dz=h.z-Math.abs(_vC.z);
      if(dx<0||dy<0||dz<0)continue;
      if(dx<=dy&&dx<=dz)_vD.set(sign(_vC.x),0,0);
      else if(dy<=dz)_vD.set(0,sign(_vC.y),0);
      else _vD.set(0,0,sign(_vC.z));
      B.body.vecToWorld(_vD,_vE);            // normal: A를 B에서 밀어내는 방향
      _vF.copy(_vB).sub(A.body.pos);A.body.velAt(_vF,_vH);
      _vG.copy(_vB).sub(B.body.pos);B.body.velAt(_vG,_t3);
      _ccCts.push({A,B,hi,wx:_vB.x,wy:_vB.y,wz:_vB.z,
        nx:_vE.x,ny:_vE.y,nz:_vE.z,depth:Math.min(dx,dy,dz),
        vn:_vH.sub(_t3).dot(_vE)});}}
  if(!_ccCts.length)return;
  const N=_ccCts.length;
  // ② 접점별 임펄스(접점 수로 분배) + 접선 마찰. 반복 2회로 수렴.
  for(let it=0;it<2;it++)
    for(const ct of _ccCts){
      const A=ct.A,B=ct.B;
      _vB.set(ct.wx,ct.wy,ct.wz);_vE.set(ct.nx,ct.ny,ct.nz);
      _vF.copy(_vB).sub(A.body.pos);_vG.copy(_vB).sub(B.body.pos);
      A.body.velAt(_vF,_vH);B.body.velAt(_vG,_t3);_vH.sub(_t3);
      const vn=_vH.dot(_vE);
      if(vn>=0)continue;
      // 유효질량: 회전항 포함(모서리 충돌이 실제처럼 차를 회전시킴)
      const kn=effMassInv(A.body,_vF,_vE)+effMassInv(B.body,_vG,_vE);
      const j=-(1+.12)*vn/Math.max(kn,1e-6)/N;
      _t4.copy(_vE).multiplyScalar(j);
      A.body.applyImpulse(_t4,_vF);
      _t4.multiplyScalar(-1);B.body.applyImpulse(_t4,_vG);
      // 접선 마찰(쓸림·회전 유발) — 쿨롱 한계 내
      A.body.velAt(_vF,_vH);B.body.velAt(_vG,_t3);_vH.sub(_t3);
      _t5.copy(_vH).addScaledVector(_vE,-_vH.dot(_vE));
      const tl=_t5.length();
      if(tl>1e-3){
        _t5.multiplyScalar(-1/tl);
        const kt=effMassInv(A.body,_vF,_t5)+effMassInv(B.body,_vG,_t5);
        const jt=Math.min(tl/Math.max(kt,1e-6),.6*Math.abs(j));
        _t4.copy(_t5).multiplyScalar(jt);
        A.body.applyImpulse(_t4,_vF);
        _t4.multiplyScalar(-1);B.body.applyImpulse(_t4,_vG);}
      // 크럼플 등록(사전 접근속도 기준 → 양측 동일 강도)
      const dv=-ct.vn;
      if(it===0&&dv>1.6){
        A.body.worldToLocal(_vB,_t6);A.registerImpact(_t6.clone(),_vB,_vE,dv);
        B.body.worldToLocal(_vB,_t6);_t7.copy(_vE).multiplyScalar(-1);
        B.registerImpact(_t6.clone(),_vB,_t7,dv);}}
  // ③ 위치 분리: 질량비로 나눠 밀어냄(무거운 차는 덜 밀림) — 관통·끼임 방지
  for(const ct of _ccCts){
    const A=ct.A,B=ct.B,ia=A.body.invMass,ib=B.body.invMass,s=ia+ib;
    if(s<=0)continue;
    const push=Math.min(ct.depth,.25)*.55/N*4;   // 접점 분배 후에도 충분히 분리
    _vE.set(ct.nx,ct.ny,ct.nz);
    A.body.pos.addScaledVector(_vE,push*(ia/s));
    B.body.pos.addScaledVector(_vE,-push*(ib/s));}
}
/* 접점 r·법선 n 방향 유효 역질량 (선형 + 회전) */
function effMassInv(body,r,n){
  _t8.copy(r).cross(n);
  body._qc.copy(body.quat).invert();
  _t9.copy(_t8).applyQuaternion(body._qc).multiply(body.invI).applyQuaternion(body.quat);
  _t9.cross(r);
  return body.invMass+_t9.dot(n);
}
