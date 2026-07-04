/* ============================================================
   Vehicle — raycast suspension + simplified-Pacejka tires
   + powertrain + damage model.  Local axes: +Z forward, +Y up.
   ============================================================ */
const _vA=V3(0,0,0),_vB=V3(0,0,0),_vC=V3(0,0,0),_vD=V3(0,0,0),_vE=V3(0,0,0),
      _vF=V3(0,0,0),_vG=V3(0,0,0),_vH=V3(0,0,0),_vUp=V3(0,1,0),_vFw=V3(0,0,1);
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
      steer:0,comp:0,prevComp:0,onGround:false,load:0,surf:0,skid:0,spin:0,omega:0,
      cW:V3(0,0,0),cN:V3(0,1,0),susF:0,slipA:0,visY:w.y-spec.susp.rest});
    // hull collision points
    const hx=spec.body.hx,hy=spec.body.hy,hz=spec.body.hz;
    this.hull=[];
    for(const sx of[-1,1])for(const sy of[-1,1])for(const sz of[-1,1])
      this.hull.push(V3(sx*hx,sy*hy,sz*hz));
    this.hull.push(V3(0,-hy*.25,hz),V3(0,-hy*.25,-hz),V3(-hx,-hy*.2,0),V3(hx,-hy*.2,0));
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
    for(const w of this.wheels){w.comp=0;w.prevComp=0;w.skid=0;w.omega=0;w.onGround=false;w.load=0;}
    if(!keepDamage)this.clearDamage();
    this.impacts.length=0;
    this.lastGood={pos:b.pos.clone(),quat:b.quat.clone()};
    this.flipT=0;this.airT=0;
  }
  clearDamage(){
    this.dmg={f:0,b:0,l:0,r:0};
    this.powerMul=1;this.steerMul=1;this.suspMul=1;this.toe=0;this.defVol=0;
    this.partHp={fb:1,rb:1,hood:1,trunk:1,dl:1,dr:1};
  }
  addDamage(lp,dv){
    if(!this.damageOn)return;
    const s=this.spec.body,amt=clamp(dv*2.2,0,45);
    if(lp.z>s.hz*.45)this.dmg.f=Math.min(100,this.dmg.f+amt);
    else if(lp.z<-s.hz*.45)this.dmg.b=Math.min(100,this.dmg.b+amt);
    else if(lp.x<0)this.dmg.l=Math.min(100,this.dmg.l+amt*1.2);
    else this.dmg.r=Math.min(100,this.dmg.r+amt*1.2);
    const d=this.dmg;
    this.powerMul=1-.5*clamp((d.f-25)/75,0,1);
    this.steerMul=1-.38*clamp((d.f+ (d.l+d.r)*.5)/160,0,1);
    this.suspMul=1-.35*clamp((d.f+d.b+d.l+d.r)/320,0,1);
    this.toe=clamp((d.l-d.r)*.00045,-.045,.045)*(1+.2*Math.random());
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
    const sRate=(Math.abs(target)<Math.abs(this.steer)?9:5.5);
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
        w.visY=w.local.y-(dist-r);
        w.cW.copy(_vD).addScaledVector(_vE,dist); // contact point
        w.cN.copy(_hit.n);w.surf=_hit.surf;
        // suspension (spring+damper) + anti-roll bar
        const other=this.wheels[w.front?(i===0?1:0):(i===2?3:2)];
        const arb=sp.arb*(w.comp-other.comp);
        let sF=susp.k*kMul*w.comp+susp.c*kMul*(w.comp-w.prevComp)/dt+arb;
        sF=clamp(sF,0,sp.mass*GRAV*1.6);
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
        const mu=_hit.mu*(w.front?sp.gripF:sp.gripR);
        const maxF=mu*load;
        // longitudinal
        let longF=engF*split[i];
        let brk=this.brake*sp.brakeF*(w.front?.6:.4);
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

    /* ----- aero + rolling resistance ----- */
    b.force.addScaledVector(b.vel,-sp.aero.cd*speed);
    if(sp.aero.df>0&&speed>15)b.force.addScaledVector(up,-sp.aero.df*speed*speed*.01);
    if(groundCount>0)b.force.addScaledVector(b.vel,-14);

    /* ----- stability assist (yaw damp) ----- */
    if(this.assists.stab&&groundCount>2&&speed>3){
      const yawR=b.angVel.dot(up);
      _vA.copy(up).multiplyScalar(-yawR*sp.mass*.55);
      b.torque.add(_vA);}

    /* ----- gravity ----- */
    b.force.y-=sp.mass*GRAV;

    /* ----- chassis collision ----- */
    for(let i=0;i<this.hull.length;i++){
      b.localToWorld(this.hull[i],_vD);
      const ct=world.pointContact(_vD);
      if(ct){
        const dv=resolvePointContact(b,_vD,ct,0);
        if(dv>2)this.registerImpact(this.hull[i],_vD,ct.n,dv);}}

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
      b.vel.set(0,0,0);b.angVel.set(0,0,0);b.force.set(0,0,0);b.torque.set(0,0,0);}
    else if((this._goodT=(this._goodT||0)+dt)>.5){this._goodT=0;
      this.lastGood.pos.copy(b.pos);this.lastGood.quat.copy(b.quat);}
  }
  registerImpact(lp,wp,n,dv){
    this.body.vecToLocal(n,_vA);
    this.impacts.push({lp:lp.clone(),ln:_vA.clone(),wp:wp.clone(),dv});
    if(this.impacts.length>8)this.impacts.shift();
    this.addDamage(lp,dv);
  }
}

/* car ↔ car collision (both dynamic) */
function collideCars(a,c){
  _vA.copy(a.body.pos).sub(c.body.pos);
  const rr=a.body.half.length()+c.body.half.length();
  if(_vA.lengthSq()>rr*rr)return;
  for(let pass=0;pass<2;pass++){
    const A=pass?c:a,B=pass?a:c;      // A's points vs B's box
    for(const hp of A.hull){
      A.body.localToWorld(hp,_vB);
      B.body.worldToLocal(_vB,_vC);
      const h=B.body.half;
      const dx=h.x-Math.abs(_vC.x),dy=h.y-Math.abs(_vC.y),dz=h.z-Math.abs(_vC.z);
      if(dx<0||dy<0||dz<0)continue;
      if(dx<=dy&&dx<=dz)_vD.set(sign(_vC.x),0,0);
      else if(dy<=dz)_vD.set(0,sign(_vC.y),0);
      else _vD.set(0,0,sign(_vC.z));
      const depth=Math.min(dx,dy,dz);
      B.body.vecToWorld(_vD,_vE);            // normal pushing A away from B
      _vF.copy(_vB).sub(A.body.pos);         // rA
      _vG.copy(_vB).sub(B.body.pos);         // rB
      A.body.velAt(_vF,_vH);B.body.velAt(_vG,_t3);
      _vH.sub(_t3);
      const vn=_vH.dot(_vE);
      if(vn<0){
        const kn=A.body.invMass+B.body.invMass;
        const j=-(1.25)*vn/Math.max(kn,1e-6)*.7;
        _t3.copy(_vE).multiplyScalar(j);
        A.body.applyImpulse(_t3,_vF);
        _t3.multiplyScalar(-1);
        B.body.applyImpulse(_t3,_vG);
        if(-vn>2){
          A.body.worldToLocal(_vB,_t4);A.registerImpact(_t4.clone(),_vB,_vE,-vn);
          B.body.worldToLocal(_vB,_t4);_t5.copy(_vE).multiplyScalar(-1);
          B.registerImpact(_t4.clone(),_vB,_t5,-vn);}}
      A.body.pos.addScaledVector(_vE,depth*.25);
      B.body.pos.addScaledVector(_vE,-depth*.25);
      return; // one contact per pair per step is enough
    }
  }
}
