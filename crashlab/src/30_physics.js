/* ============================================================
   Physics — rigid bodies, world queries, collision
   fixed step 120 Hz, all SI units
   ============================================================ */
const PHYS_DT=1/120, GRAV=9.81;
const SURF={asphalt:{mu:1.0,col:0x3a3f47},wet:{mu:.7,col:0x2e3640},gravel:{mu:.6,col:0x6b5f4e},
  grass:{mu:.55,col:0x3e6b34},sand:{mu:.5,col:0xc2a368},ice:{mu:.15,col:0xbfe4f2},
  snow:{mu:.35,col:0xe8eef2},curb:{mu:.95,col:0xb5443c},walk:{mu:.9,col:0x878e99},
  lane:{mu:1.0,col:0xdfe5ec}};
const SURF_IDS=Object.keys(SURF);
const SURF_MU=SURF_IDS.map(k=>SURF[k].mu);
/* 노면 미세 요철 진폭(m) — 서스펜션이 실제로 반응 */
const SURF_ROUGH=SURF_IDS.map(k=>({asphalt:.005,lane:.005,wet:.005,walk:.007,curb:.012,
  gravel:.02,sand:.013,grass:.022,snow:.011,ice:.002}[k]||0));

/* ---------- rigid body ---------- */
class Body{
  constructor(mass,half){ // box inertia
    this.mass=mass;this.invMass=mass>0?1/mass:0;
    this.half=half.clone();
    const m=mass/12;
    this.invI=V3(1/(m*(half.y*half.y+half.z*half.z)*4||1),
                 1/(m*(half.x*half.x+half.z*half.z)*4||1),
                 1/(m*(half.x*half.x+half.y*half.y)*4||1));
    this.pos=V3(0,0,0);this.vel=V3(0,0,0);
    this.quat=new THREE.Quaternion();this.angVel=V3(0,0,0);
    this.force=V3(0,0,0);this.torque=V3(0,0,0);
    this._q=new THREE.Quaternion();this._qc=new THREE.Quaternion();
  }
  localToWorld(l,out){return out.copy(l).applyQuaternion(this.quat).add(this.pos);}
  worldToLocal(w,out){this._qc.copy(this.quat).invert();return out.copy(w).sub(this.pos).applyQuaternion(this._qc);}
  vecToWorld(l,out){return out.copy(l).applyQuaternion(this.quat);}
  vecToLocal(w,out){this._qc.copy(this.quat).invert();return out.copy(w).applyQuaternion(this._qc);}
  velAt(rWorld,out){return out.copy(this.angVel).cross(rWorld).add(this.vel);} // r = point - pos
  applyImpulse(imp,rWorld){
    this.vel.addScaledVector(imp,this.invMass);
    _t0.copy(rWorld).cross(imp);this.applyAngImpulse(_t0);}
  applyAngImpulse(angImp){
    this._qc.copy(this.quat).invert();
    _t1.copy(angImp).applyQuaternion(this._qc);
    _t1.multiply(this.invI);
    _t1.applyQuaternion(this.quat);
    this.angVel.add(_t1);}
  addForceAt(f,rWorld){this.force.add(f);_t0.copy(rWorld).cross(f);this.torque.add(_t0);}
  integrate(dt){
    this.vel.addScaledVector(this.force,this.invMass*dt);
    this._qc.copy(this.quat).invert();
    _t1.copy(this.torque).applyQuaternion(this._qc).multiply(this.invI).applyQuaternion(this.quat);
    this.angVel.addScaledVector(_t1,dt);
    // clamps (안정성 3)
    const v2=this.vel.lengthSq();if(v2>140*140)this.vel.multiplyScalar(140/Math.sqrt(v2));
    const w2=this.angVel.lengthSq();if(w2>28*28)this.angVel.multiplyScalar(28/Math.sqrt(w2));
    this.pos.addScaledVector(this.vel,dt);
    const w=this.angVel;
    this._q.set(w.x*dt*.5,w.y*dt*.5,w.z*dt*.5,0).multiply(this.quat);
    this.quat.x+=this._q.x;this.quat.y+=this._q.y;this.quat.z+=this._q.z;this.quat.w+=this._q.w;
    this.quat.normalize();
    this.force.set(0,0,0);this.torque.set(0,0,0);}
  ok(){return fin(this.pos.x)&&fin(this.pos.y)&&fin(this.pos.z)&&fin(this.vel.x)&&fin(this.vel.y)&&fin(this.vel.z)
    &&fin(this.quat.x)&&fin(this.quat.w)&&fin(this.angVel.x)&&fin(this.angVel.y)&&fin(this.angVel.z);}
}
const _t0=V3(0,0,0),_t1=V3(0,0,0),_t2=V3(0,0,0),_t3=V3(0,0,0),_t4=V3(0,0,0),_t5=V3(0,0,0),
      _t6=V3(0,0,0),_t7=V3(0,0,0),_t8=V3(0,0,0),_t9=V3(0,0,0);

/* ---------- static OBB ---------- */
class OBB{
  constructor(cx,cy,cz,hx,hy,hz,yaw,pitch,roll,opt){
    this.c=V3(cx,cy,cz);this.half=V3(hx,hy,hz);
    this.quat=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch||0,yaw||0,roll||0,"YXZ"));
    this.inv=this.quat.clone().invert();
    this.mu=opt?.mu??.8;this.bounce=opt?.bounce??.1;this.tag=opt?.tag||"";
    this.r=this.half.length(); // broadphase radius
  }
  // point query: returns penetration {n(world), depth} or null
  pointPen(p,out){
    _t2.copy(p).sub(this.c).applyQuaternion(this.inv);
    const h=this.half;
    const dx=h.x-Math.abs(_t2.x),dy=h.y-Math.abs(_t2.y),dz=h.z-Math.abs(_t2.z);
    if(dx<0||dy<0||dz<0)return null;
    if(dx<=dy&&dx<=dz){out.n.set(sign(_t2.x),0,0);out.depth=dx;}
    else if(dy<=dz){out.n.set(0,sign(_t2.y),0);out.depth=dy;}
    else{out.n.set(0,0,sign(_t2.z));out.depth=dz;}
    out.n.applyQuaternion(this.quat);return out;}
  // ray: origin o, dir d (normalized), maxLen. returns dist or -1; sets normal in _obbN
  ray(o,d,maxLen){
    _t2.copy(o).sub(this.c).applyQuaternion(this.inv);
    _t3.copy(d).applyQuaternion(this.inv);
    let tmin=0,tmax=maxLen,ax=-1,sg=1;
    for(let i=0;i<3;i++){
      const oi=_t2.getComponent(i),di=_t3.getComponent(i),h=this.half.getComponent(i);
      if(Math.abs(di)<1e-8){if(oi<-h||oi>h)return -1;continue;}
      let t1=(-h-oi)/di,t2=(h-oi)/di,s=-1;
      if(t1>t2){const tt=t1;t1=t2;t2=tt;s=1;}
      if(t1>tmin){tmin=t1;ax=i;sg=s*sign(di)*-1;}
      if(t2<tmax)tmax=t2;
      if(tmin>tmax)return -1;}
    if(ax<0)return -1;
    _obbN.set(0,0,0);_obbN.setComponent(ax,sg);_obbN.applyQuaternion(this.quat);
    return tmin;}
}
const _obbN=V3(0,1,0);
const _pen={n:V3(0,1,0),depth:0};

/* 과속방지턱 아코디언 프로파일: 격자 해상도와 무관한 매끈한 아치(뚝뚝 끊김 없음).
   tz∈[-1,1](마루 가로 방향), 반환 0..1 높이 비율. 가장자리서 접선이 지면과 매끈히 만남(C1). */
function bumpProfile(tz,type){
  const a=Math.abs(tz);if(a>=1)return 0;
  if(type==="flat")return a<.5?1:.5*(1+Math.cos((a-.5)/.5*Math.PI)); // 스피드 테이블(평탄정상)
  const p=.5*(1+Math.cos(tz*Math.PI));                                // 완만한 아치
  return type==="sharp"?p*p:p;                                        // sharp=뾰족
}
function bumpTaper(ax,hw){const e=hw-.6;return ax>=hw?0:ax>e?.5*(1+Math.cos((ax-e)/.6*Math.PI)):1;}

/* ---------- world ---------- */
class World{
  constructor(size,res){
    this.size=size;this.res=res;this.cell=size/res;
    this.hMap=new Float32Array((res+1)*(res+1));
    this.sMap=new Uint8Array((res+1)*(res+1));
    this.boxes=[];this.props=[];this.debris=[];this.movers=[];this.bumps=[];this.potholes=[];this.t=0;
    this.spawn={x:0,z:0,yaw:0};this.checkpoints=[];this.waypoints=[];
    this.bounds=size*.5-2;
  }
  /* 매끈한 과속방지턱을 지형 높이에 직접 반영 → 서스펜션이 자연스레 흡수/충격, 박스 모서리 끊김 없음 */
  addBump(x,z,yaw,hw,hd,h,type){
    this.bumps.push({x,z,co:Math.cos(yaw||0),si:Math.sin(yaw||0),hw,hd,h,type:type||"arch",
      br2:(hw*hw+hd*hd)+1});
  }
  addPothole(x,z,r,depth){this.potholes.push({x,z,r2:r*r,r,depth});}
  bumpH(x,z){
    let add=0;
    const B=this.bumps;
    for(let bi=0;bi<B.length;bi++){
      const b=B[bi],dx=x-b.x,dz=z-b.z;
      if(dx*dx+dz*dz>b.br2)continue;
      const lx=dx*b.co+dz*b.si,lz=-dx*b.si+dz*b.co,ax=Math.abs(lx);
      if(ax>=b.hw)continue;const tz=lz/b.hd;if(tz<=-1||tz>=1)continue;
      add+=b.h*bumpProfile(tz,b.type)*bumpTaper(ax,b.hw);}
    const H=this.potholes;                       // 움푹 파인 곳(포트홀): 매끈한 원형 함몰
    for(let hi=0;hi<H.length;hi++){
      const h=H[hi],dx=x-h.x,dz=z-h.z,d2=dx*dx+dz*dz;
      if(d2>=h.r2)continue;
      const t=Math.sqrt(d2)/h.r;
      add-=h.depth*.5*(1+Math.cos(t*Math.PI));}   // 중심 최대 → 가장자리 0 (C1 매끈)
    return add;
  }
  /* 애니메이션 장애물(압착기 등): OBB + 메시를 매 프레임 anim(t)로 이동 */
  stepMovers(dt){
    this.t+=dt;
    for(const m of this.movers){
      const ny=m.baseY+m.anim(this.t);
      m.obb.vy=(ny-m.obb.c.y)/Math.max(dt,1e-4);   // 수직 속도(충돌 시 차체에 전달)
      m.obb.c.y=ny;
      if(m.mesh)m.mesh.position.y=m.meshY+(ny-m.baseY);}
  }
  idx(i,j){return j*(this.res+1)+i;}
  setH(i,j,h){this.hMap[this.idx(i,j)]=h;}
  setS(i,j,s){this.sMap[this.idx(i,j)]=s;}
  gridAt(x,z){
    const g=(x+this.size*.5)/this.cell,gz=(z+this.size*.5)/this.cell;
    return[clamp(g,0,this.res-.001),clamp(gz,0,this.res-.001)];}
  baseHeight(x,z){   // 방지턱 제외 기본 지형(비주얼 지형 메시용)
    const[g,gz]=this.gridAt(x,z);
    const i=g|0,j=gz|0,fx=g-i,fz=gz-j,m=this.hMap,r=this.res+1,b=j*r+i;
    return m[b]*(1-fx)*(1-fz)+m[b+1]*fx*(1-fz)+m[b+r]*(1-fx)*fz+m[b+r+1]*fx*fz;}
  height(x,z){
    let h=this.baseHeight(x,z);
    if(this.bumps.length||this.potholes.length)h+=this.bumpH(x,z);
    // 잔요철: 미세·고주파(꿀렁임 없이 서스펜션만 잘게 일함)
    if(this.ripple)h+=this.ripple*(Math.sin(x*2.1)*Math.sin(z*2.3)+.5*Math.sin(x*4.7+1.3)*Math.cos(z*4.1+.5));
    return h;}
  normal(x,z,out){
    const e=this.cell;
    out.set(this.height(x-e,z)-this.height(x+e,z),2*e,this.height(x,z-e)-this.height(x,z+e));
    return out.normalize();}
  surf(x,z){
    const[g,gz]=this.gridAt(x,z);
    return this.sMap[Math.round(gz)*(this.res+1)+Math.round(g)];}
  /* downward-ish raycast: returns {dist,nx..,mu,surf} into hit object, or false */
  raycast(o,d,maxLen,hit){
    let best=maxLen+1,bestBox=null;
    // ground (iterative for near-vertical rays)
    if(d.y<-.3){
      let t=0;
      for(let k=0;k<3;k++){
        const x=o.x+d.x*t,z=o.z+d.z*t;
        const h=this.height(x,z);
        t=(o.y-h)/(-d.y);
        if(t<0){t=-1;break;}}
      if(t>=0&&t<=maxLen){best=t;bestBox=null;
        this.normal(o.x+d.x*t,o.z+d.z*t,hit.n);
        hit.surf=this.surf(o.x+d.x*t,o.z+d.z*t);hit.mu=SURF_MU[hit.surf];}}
    for(let i=0;i<this.boxes.length;i++){
      const b=this.boxes[i];
      _t4.copy(o).sub(b.c);
      if(_t4.lengthSq()>(b.r+maxLen)*(b.r+maxLen))continue;
      const t=b.ray(o,d,Math.min(best,maxLen));
      if(t>=0&&t<best){best=t;bestBox=b;hit.n.copy(_obbN);hit.mu=b.mu;hit.surf=0;}}
    if(best>maxLen)return false;
    hit.dist=best;hit.box=bestBox;return true;}
  /* point contact vs ground+boxes. returns {n,depth,mu,bounce} or null */
  pointContact(p){
    const h=this.height(p.x,p.z);
    let best=null;
    if(p.y<h){this.normal(p.x,p.z,_pen.n);_pen.depth=h-p.y;
      best={n:_pen.n,depth:_pen.depth,mu:SURF_MU[this.surf(p.x,p.z)],bounce:.12};}
    for(let i=0;i<this.boxes.length;i++){
      const b=this.boxes[i];
      _t4.copy(p).sub(b.c);
      if(_t4.lengthSq()>b.r*b.r)continue;
      if(b.pointPen(p,_pen)){
        if(!best||_pen.depth<best.depth)
          best={n:_pen.n,depth:_pen.depth,mu:b.mu,bounce:b.bounce,box:b};}}
    return best;}
}

/* generic point-contact impulse vs static world; returns impact Δv (approach speed) */
function resolvePointContact(body,pWorld,ct,extraBounce){
  _t5.copy(pWorld).sub(body.pos);           // r
  body.velAt(_t5,_t6);                       // contact velocity
  const vn=_t6.dot(ct.n);
  let dv=0;
  if(vn<0){
    dv=-vn;
    // effective mass along n
    _t7.copy(_t5).cross(ct.n);
    body._qc.copy(body.quat).invert();
    _t8.copy(_t7).applyQuaternion(body._qc).multiply(body.invI).applyQuaternion(body.quat);
    _t8.cross(_t5);
    const kn=body.invMass+_t8.dot(ct.n);
    const e=(ct.bounce||0)+(extraBounce||0);
    const j=-(1+e)*vn/kn;
    _t9.copy(ct.n).multiplyScalar(j);
    body.applyImpulse(_t9,_t5);
    // friction
    body.velAt(_t5,_t6);
    _t7.copy(_t6).addScaledVector(ct.n,-_t6.dot(ct.n));
    const tl=_t7.length();
    if(tl>1e-4){
      _t7.multiplyScalar(-1/tl);
      const jt=Math.min(tl/ (body.invMass*2), ct.mu*j);
      _t9.copy(_t7).multiplyScalar(jt);
      body.applyImpulse(_t9,_t5);}
  }
  // positional correction
  body.pos.addScaledVector(ct.n,ct.depth*.35);
  return dv;
}
