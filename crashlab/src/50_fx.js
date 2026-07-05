/* ============================================================
   FX — particle pools, skid marks, debris, slow-mo bookkeeping
   ============================================================ */
const Fx=(()=>{
  let scene=null,quality=1,softTex=null;
  function getSoftTex(){
    if(softTex)return softTex;
    const c=document.createElement("canvas");c.width=c.height=64;
    const x=c.getContext("2d");
    const g=x.createRadialGradient(32,32,2,32,32,30);
    g.addColorStop(0,"rgba(255,255,255,1)");g.addColorStop(.6,"rgba(255,255,255,.55)");
    g.addColorStop(1,"rgba(255,255,255,0)");
    x.fillStyle=g;x.fillRect(0,0,64,64);
    softTex=new THREE.CanvasTexture(c);
    return softTex;}
  /* particle pool */
  function makePool(n,size,color,additive,gravity,drag){
    const geo=new THREE.BufferGeometry();
    const pos=new Float32Array(n*3);pos.fill(1e5);
    geo.setAttribute("position",new THREE.BufferAttribute(pos,3));
    const mat=new THREE.PointsMaterial({size,color,transparent:true,opacity:.9,map:getSoftTex(),
      blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,depthWrite:false,sizeAttenuation:true});
    const pts=new THREE.Points(geo,mat);pts.frustumCulled=false;
    return{n,pos,geo,pts,vel:new Float32Array(n*3),life:new Float32Array(n),maxLife:new Float32Array(n),
      head:0,gravity,drag,alive:0};}
  let sparks,smoke,shards,dust;
  const pools=[];
  function emit(p,x,y,z,vx,vy,vz,life){
    const i=p.head;p.head=(p.head+1)%p.n;
    p.pos[i*3]=x;p.pos[i*3+1]=y;p.pos[i*3+2]=z;
    p.vel[i*3]=vx;p.vel[i*3+1]=vy;p.vel[i*3+2]=vz;
    p.life[i]=life;p.maxLife[i]=life;}
  function stepPool(p,dt){
    let any=false;
    for(let i=0;i<p.n;i++){
      if(p.life[i]<=0)continue;
      any=true;p.life[i]-=dt;
      if(p.life[i]<=0){p.pos[i*3+1]=1e5;continue;}
      p.vel[i*3+1]-=p.gravity*dt;
      p.vel[i*3]*=p.drag;p.vel[i*3+1]*=p.drag;p.vel[i*3+2]*=p.drag;
      p.pos[i*3]+=p.vel[i*3]*dt;p.pos[i*3+1]+=p.vel[i*3+1]*dt;p.pos[i*3+2]+=p.vel[i*3+2]*dt;}
    if(any)p.geo.attributes.position.needsUpdate=true;}

  /* skid marks */
  let skidMesh,skidN=520,skidHead=0;
  const _m4=new THREE.Matrix4(),_q1=new THREE.Quaternion(),_s1=V3(1,1,1),_e1=new THREE.Euler();

  /* debris */
  const debris=[];const DEBRIS_MAX=12;

  function init(sc){
    scene=sc;
    sparks=makePool(160,.14,0xffb25e,true,14,.985);
    smoke=makePool(140,1.1,0x8a8f96,false,-1.5,.97);
    shards=makePool(120,.09,0xbfe4f2,true,18,.99);
    dust=makePool(160,.9,0xb9a684,false,1,.96);
    pools.length=0;pools.push(sparks,smoke,shards,dust);
    for(const p of pools)scene.add(p.pts);
    const g=new THREE.PlaneGeometry(.3,.72);g.rotateX(-Math.PI/2);
    skidMesh=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial({color:0x14171c,transparent:true,opacity:.45,depthWrite:false}),skidN);
    skidMesh.frustumCulled=false;
    _m4.makeScale(0,0,0);
    for(let i=0;i<skidN;i++)skidMesh.setMatrixAt(i,_m4);
    skidMesh.instanceMatrix.needsUpdate=true;
    scene.add(skidMesh);
  }
  function reset(){
    for(const p of pools){p.life.fill(0);p.pos.fill(1e5);p.geo.attributes.position.needsUpdate=true;}
    _m4.makeScale(0,0,0);
    for(let i=0;i<skidN;i++)skidMesh.setMatrixAt(i,_m4);
    skidMesh.instanceMatrix.needsUpdate=true;
    for(const d of debris)finishDebris(d,true);
    debris.length=0;
  }
  function setQuality(q){quality=q;}

  function skidMark(x,y,z,yaw){
    _e1.set(0,yaw,0);_q1.setFromEuler(_e1);
    _m4.compose(_t6.set(x,y+.025,z),_q1,_s1);
    skidMesh.setMatrixAt(skidHead,_m4);
    skidHead=(skidHead+1)%skidN;
    skidMesh.instanceMatrix.needsUpdate=true;}

  function impactFx(wp,n,dv){
    const cnt=Math.min(3+dv|0,16)*quality|0;
    for(let i=0;i<cnt;i++)
      emit(sparks,wp.x,wp.y,wp.z,
        n.x*3+(Math.random()-.5)*6,Math.random()*4+1,n.z*3+(Math.random()-.5)*6,.3+Math.random()*.4);
    if(dv>5)for(let i=0;i<cnt*.6;i++)
      emit(shards,wp.x,wp.y+.3,wp.z,(Math.random()-.5)*7,Math.random()*5,(Math.random()-.5)*7,.4+Math.random()*.5);
    Sfx.impact(clamp(dv/16,0,1));}
  function smokeAt(x,y,z,vx,vz,amt){
    if(Math.random()>amt*quality)return;
    emit(smoke,x,y,z,vx*.3+(Math.random()-.5),1+Math.random(),vz*.3+(Math.random()-.5),.8+Math.random()*.8);}
  function dustAt(x,y,z,amt){
    if(Math.random()>amt*quality)return;
    emit(dust,x,y+.2,z,(Math.random()-.5)*2,.8+Math.random(),(Math.random()-.5)*2,.5+Math.random()*.6);}
  function propHit(p,speed){
    Sfx.impact(clamp(speed/22,0,.55));
    for(let i=0;i<6;i++)
      emit(sparks,p.mesh.position.x,p.mesh.position.y+.4,p.mesh.position.z,
        (Math.random()-.5)*5,Math.random()*4,(Math.random()-.5)*5,.3);}

  /* debris: detached car part */
  function addDebris(mesh,veh,imp){
    if(debris.length>=DEBRIS_MAX)finishDebris(debris.shift(),true);
    mesh.updateWorldMatrix(true,false);
    const wp=V3(0,0,0),wq=new THREE.Quaternion(),ws=V3(1,1,1);
    mesh.matrixWorld.decompose(wp,wq,ws);
    if(mesh.parent)mesh.parent.remove(mesh);
    scene.add(mesh);
    mesh.position.copy(wp);mesh.quaternion.copy(wq);
    if(!(mesh.material.transparent)){mesh.material=mesh.material.clone();mesh.material.transparent=true;}
    mesh.material.opacity=1;
    const vel=V3(0,0,0);
    veh.body.velAt(_t6.copy(wp).sub(veh.body.pos),vel);
    vel.multiplyScalar(.8);vel.y+=2+Math.random()*2;
    if(imp)vel.addScaledVector(_t7.copy(imp.wp).sub(veh.body.pos).normalize(),2);
    debris.push({mesh,vel,angVel:V3((Math.random()-.5)*7,(Math.random()-.5)*7,(Math.random()-.5)*7),t:0});
  }
  function reclaimDebris(mesh){
    for(let i=0;i<debris.length;i++)
      if(debris[i].mesh===mesh){scene.remove(mesh);debris.splice(i,1);return;}
    if(mesh.parent===scene)scene.remove(mesh);
  }
  function finishDebris(d,now){
    if(scene&&d.mesh.parent===scene)scene.remove(d.mesh);}
  function step(dt,world){
    for(const p of pools)stepPool(p,dt);
    for(let i=debris.length-1;i>=0;i--){
      const d=debris[i];d.t+=dt;
      d.vel.y-=GRAV*dt;
      d.mesh.position.addScaledVector(d.vel,dt);
      d.mesh.rotation.x+=d.angVel.x*dt;d.mesh.rotation.y+=d.angVel.y*dt;d.mesh.rotation.z+=d.angVel.z*dt;
      const gy=world?world.height(d.mesh.position.x,d.mesh.position.z):0;
      if(d.mesh.position.y<gy+.1){
        d.mesh.position.y=gy+.1;
        if(d.vel.y<0)d.vel.y*=-.35;
        d.vel.x*=.85;d.vel.z*=.85;d.angVel.multiplyScalar(.75);}
      if(d.t>4)d.mesh.material.opacity=Math.max(0,1-(d.t-4));
      if(d.t>5){finishDebris(d);debris.splice(i,1);}}
  }
  return{init,reset,setQuality,skidMark,impactFx,smokeAt,dustAt,propHit,addDebris,reclaimDebris,step};
})();

/* ============================================================
   Camera
   ============================================================ */
class GameCamera{
  constructor(cam){
    this.cam=cam;
    this.modes=["chase","hood","bumper","top","free"];
    this.modeNames={chase:"체이스",hood:"후드",bumper:"범퍼",top:"탑뷰",free:"프리"};
    this.mode="chase";
    this.orbitYaw=0;this.orbitPitch=.32;this.dist=7;
    this.userT=0;this.shake=0;
    this.pos=V3(0,8,-10);this.look=V3(0,0,0);
  }
  cycle(){this.mode=this.modes[(this.modes.indexOf(this.mode)+1)%this.modes.length];
    return this.modeNames[this.mode];}
  onDrag(dx,dy){
    this.orbitYaw-=dx*.008;
    this.orbitPitch=clamp(this.orbitPitch+dy*.006,5*DEG,80*DEG);
    this.userT=2.2;}
  onPinch(scale){this.dist=clamp(this.dist/scale,3,14);this.userT=2.2;}
  update(dt,veh,world){
    const b=veh.body,sp=veh.speed;
    this.userT=Math.max(0,this.userT-dt);
    if(this.shake>0)this.shake=Math.max(0,this.shake-dt*2.4);
    const yaw=Math.atan2(2*(b.quat.w*b.quat.y+b.quat.x*b.quat.z),1-2*(b.quat.y*b.quat.y+b.quat.x*b.quat.x));
    let tx,ty,tz,lx,ly,lz;
    if(this.mode==="chase"||this.mode==="free"){
      const behind=(this.mode==="free"&&sp<1.5)||this.userT>0?this.orbitYaw+yaw:yaw;
      const recenter=this.mode==="chase"&&this.userT<=0;
      if(recenter)this.orbitYaw*=Math.max(0,1-dt*3);
      const d=this.dist+sp*.05,pi=this.orbitPitch;
      tx=b.pos.x-Math.sin(behind)*Math.cos(pi)*d;
      tz=b.pos.z-Math.cos(behind)*Math.cos(pi)*d;
      ty=b.pos.y+Math.sin(pi)*d;
      const ahead=this.mode==="chase"?clamp(sp*.25,0,7):0;
      lx=b.pos.x+Math.sin(yaw)*ahead;ly=b.pos.y+.6;lz=b.pos.z+Math.cos(yaw)*ahead;
      const k=this.mode==="chase"?1-Math.pow(.0018,dt):1-Math.pow(.0001,dt);
      this.pos.x+=(tx-this.pos.x)*k;this.pos.y+=(ty-this.pos.y)*k;this.pos.z+=(tz-this.pos.z)*k;
    }else if(this.mode==="hood"){
      _t6.set(0,veh.spec.body.hy*.55,veh.spec.body.hz*.35);b.localToWorld(_t6,this.pos);
      lx=b.pos.x+Math.sin(yaw)*30;ly=this.pos.y;lz=b.pos.z+Math.cos(yaw)*30;
    }else if(this.mode==="bumper"){
      _t6.set(0,-veh.spec.body.hy*.1,veh.spec.body.hz+.3);b.localToWorld(_t6,this.pos);
      lx=b.pos.x+Math.sin(yaw)*30;ly=this.pos.y;lz=b.pos.z+Math.cos(yaw)*30;
    }else{ // top
      this.pos.set(b.pos.x,b.pos.y+26+sp*.12,b.pos.z-6);
      lx=b.pos.x;ly=b.pos.y;lz=b.pos.z;}
    if(lx===undefined){lx=b.pos.x;ly=b.pos.y;lz=b.pos.z;}
    // keep above terrain
    if(world){const gy=world.height(this.pos.x,this.pos.z)+.5;if(this.pos.y<gy)this.pos.y=gy;}
    this.cam.position.copy(this.pos);
    if(this.shake>0&&Settings.camShake){
      this.cam.position.x+=(Math.random()-.5)*this.shake*.5;
      this.cam.position.y+=(Math.random()-.5)*this.shake*.5;}
    this.look.set(lx,ly,lz);
    this.cam.lookAt(this.look);
  }
}
