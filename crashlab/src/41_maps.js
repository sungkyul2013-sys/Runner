/* ============================================================
   Maps — heightfield terrain + static OBB structures + props
   ============================================================ */
const SURF_ID={};SURF_IDS.forEach((k,i)=>SURF_ID[k]=i);

class MapBuilder{
  constructor(size,res){
    this.world=new World(size,res);
    this.group=new THREE.Group();
    this.mergePos=[];this.mergeNor=[];this.mergeCol=[];
    this.props=[];this.laneDots=[];
  }
  fill(fn){ // fn(x,z) -> [height, surfId]
    const w=this.world,r=w.res;
    for(let j=0;j<=r;j++)for(let i=0;i<=r;i++){
      const x=i*w.cell-w.size*.5,z=j*w.cell-w.size*.5;
      const[h,s]=fn(x,z);
      w.setH(i,j,h);w.setS(i,j,s);}
  }
  stamp(x,z,rad,cb){ // cb(i,j,dist,x,z)
    const w=this.world,c=w.cell,half=w.size*.5;
    const i0=Math.max(0,Math.floor((x-rad+half)/c)),i1=Math.min(w.res,Math.ceil((x+rad+half)/c));
    const j0=Math.max(0,Math.floor((z-rad+half)/c)),j1=Math.min(w.res,Math.ceil((z+rad+half)/c));
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
      const px=i*c-half,pz=j*c-half;
      const d=Math.hypot(px-x,pz-z);
      if(d<=rad)cb(i,j,d,px,pz);}
  }
  paintPath(pts,width,surfId,flatten,lane){ // pts: [{x,y,z}]  y used when flatten
    const w=this.world,step=w.cell*.5;
    let dist=0;
    for(let k=0;k<pts.length-1;k++){
      const a=pts[k],b=pts[k+1];
      const len=Math.hypot(b.x-a.x,b.z-a.z),n=Math.max(1,Math.ceil(len/step));
      for(let s=0;s<=n;s++){
        const t=s/n,x=lerp(a.x,b.x,t),z=lerp(a.z,b.z,t),y=lerp(a.y,b.y,t);
        this.stamp(x,z,width*.5+(flatten?w.cell*1.6:0),(i,j,d)=>{
          const idx=w.idx(i,j);
          if(flatten){
            const f=clamp((d-width*.5)/(w.cell*1.6),0,1);
            w.hMap[idx]=lerp(y,w.hMap[idx],f*f);}
          if(d<=width*.5)w.sMap[idx]=surfId;});
        dist+=len/n;
        if(lane&&(dist%9)<4)this.laneDots.push([x,z]);}}
  }
  paintLanes(){ // 차선은 도로 도색이 모두 끝난 뒤 덧칠
    const w=this.world;
    for(const[x,z]of this.laneDots)
      this.stamp(x,z,w.cell*.55,(i,j)=>{
        if(w.sMap[w.idx(i,j)]===SURF_ID.asphalt)w.sMap[w.idx(i,j)]=SURF_ID.lane;});
    this.laneDots.length=0;}
  baked(name,x,z,scale,yaw,opt){ // 베이크 배경 모델 배치 (+선택 OBB)
    opt=opt||{};
    if(typeof BAKED==="undefined"||!BAKED[name])return;
    const e=BAKED[name],A=Assets.arrays(e);
    const y=opt.y!==undefined?opt.y:this.world.height(x,z);
    const ca=Math.cos(yaw||0),sa=Math.sin(yaw||0);
    for(let i=0;i<A.n;i++){
      const px=A.pos[i*3]*scale,py=A.pos[i*3+1]*scale,pz=A.pos[i*3+2]*scale;
      this.mergePos.push(px*ca+pz*sa+x,py+y,-px*sa+pz*ca+z);
      const nx=A.nor[i*3],nz=A.nor[i*3+2];
      this.mergeNor.push(nx*ca+nz*sa,A.nor[i*3+1],-nx*sa+nz*ca);
      this.mergeCol.push(A.col[i*3],A.col[i*3+1],A.col[i*3+2]);}
    if(opt.collide){
      const bb=e.bb;
      const hw=(bb[3]-bb[0])/2*scale*(opt.shrink||1),hh=(bb[4]-bb[1])/2*scale,hd=(bb[5]-bb[2])/2*scale*(opt.shrink||1);
      this.world.boxes.push(new OBB(x,y+hh,z,hw,hh,hd,yaw||0,0,0,{mu:.5,tag:name}));}
  }
  box(x,y,z,w,h,d,color,opt){ // opt:{yaw,pitch,roll,mu,bounce,tag,noVis}
    opt=opt||{};
    const obb=new OBB(x,y,z,w/2,h/2,d/2,opt.yaw||0,opt.pitch||0,opt.roll||0,opt);
    this.world.boxes.push(obb);
    if(!opt.noVis)this.visBox(x,y,z,w,h,d,color,opt);
    return obb;}
  visBox(x,y,z,w,h,d,color,opt){
    opt=opt||{};
    const g=new THREE.BoxGeometry(w,h,d).toNonIndexed();
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(opt.pitch||0,opt.yaw||0,opt.roll||0,"YXZ")));
    g.translate(x,y,z);
    const p=g.attributes.position.array,nr=g.attributes.normal.array;
    const c=new THREE.Color(color);
    for(let i=0;i<p.length;i++){this.mergePos.push(p[i]);this.mergeNor.push(nr[i]);}
    for(let i=0;i<p.length/3;i++)this.mergeCol.push(c.r,c.g,c.b);
    g.dispose();}
  bump(x,z,yaw,width){ // 과속방지턱: 9cm 낮은 사다리꼴(OBB) + 노랑/검정 표시
    const y=this.world.height(x,z);
    this.box(x,y+.045,z,width,.09,.85,0xe8b93c,{yaw,mu:1,tag:"bump"});
    // black stripes (visual only)
    const n=Math.max(2,Math.round(width/1.6));
    for(let i=0;i<n;i++){
      const t=(i+.5)/n-.5;
      this.visBox(x+Math.cos(yaw)*t*width,y+.095,z-Math.sin(yaw)*t*width,
        width/n*.5,.012,.86,0x23262c,{yaw});}
    return this;}
  ramp(x,z,yaw,pitchDeg,len,wid,color){ // ramp whose surface rises along +local z
    const pitch=-pitchDeg*DEG,h=.5;
    const rise=Math.sin(-pitch)*len;
    const cy=this.world.height(x,z)+rise*.5- h*.35;
    return this.box(x,cy,z,wid,h,len,color||0x8f98a3,{yaw,pitch,mu:1,tag:"ramp"});}
  prop(type,x,z,yaw){
    const w=this.world,y=w.height(x,z);
    const p=makeProp(type,x,y,z,yaw||0);
    w.props.push(p);this.group.add(p.mesh);return p;}
  finalize(mapDef){
    const w=this.world;
    // ground mesh
    const res=Math.min(w.res,192);
    const g=new THREE.PlaneGeometry(w.size,w.size,res,res);
    g.rotateX(-Math.PI/2);
    const pos=g.attributes.position,cols=new Float32Array(pos.count*3);
    const cTmp=new THREE.Color();
    for(let vi=0;vi<pos.count;vi++){
      const x=pos.getX(vi),z=pos.getZ(vi);
      pos.setY(vi,w.height(x,z));
      const s=w.surf(x,z);
      cTmp.set(SURF[SURF_IDS[s]].col);
      const n=.94+.06*Math.sin(x*12.9898+z*78.233);
      cols[vi*3]=cTmp.r*n;cols[vi*3+1]=cTmp.g*n;cols[vi*3+2]=cTmp.b*n;}
    g.setAttribute("color",new THREE.BufferAttribute(cols,3));
    g.computeVertexNormals();
    const ground=new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true}));
    ground.receiveShadow=true;
    this.group.add(ground);
    // merged static boxes
    if(this.mergePos.length){
      const mg=new THREE.BufferGeometry();
      mg.setAttribute("position",new THREE.Float32BufferAttribute(this.mergePos,3));
      mg.setAttribute("normal",new THREE.Float32BufferAttribute(this.mergeNor,3));
      mg.setAttribute("color",new THREE.Float32BufferAttribute(this.mergeCol,3));
      const mm=new THREE.Mesh(mg,new THREE.MeshLambertMaterial({vertexColors:true}));
      mm.castShadow=true;mm.receiveShadow=true;
      this.group.add(mm);}
    this.mergePos=this.mergeNor=this.mergeCol=null;
    w.mapDef=mapDef;
    return{world:w,group:this.group};}
}

/* path helpers */
function samplePath(ctrl,closed,n){
  const v=ctrl.map(p=>V3(p[0],p[2]!==undefined?p[2]:0,p[1]));
  const curve=new THREE.CatmullRomCurve3(v.map(p=>V3(p.x,p.y,p.z)),closed,"catmullrom",.5);
  const pts=[];
  for(let i=0;i<=n;i++){const p=curve.getPoint(i/n);pts.push({x:p.x,y:p.y,z:p.z});}
  return pts;}
function pathWaypoints(pts,closed,vmax){
  const wp=[];
  const N=pts.length-1;
  for(let i=0;i<N;i+=2){
    const a=pts[(i-2+N)%N],b=pts[i],c=pts[(i+2)%N];
    const v1x=b.x-a.x,v1z=b.z-a.z,v2x=c.x-b.x,v2z=c.z-b.z;
    const l1=Math.hypot(v1x,v1z)||1,l2=Math.hypot(v2x,v2z)||1;
    const cos=clamp((v1x*v2x+v1z*v2z)/(l1*l2),-1,1);
    const ang=Math.acos(cos),curvature=ang/((l1+l2)*.5+1e-3);
    const v=clamp(Math.sqrt(7.5/Math.max(curvature,1e-4)),9,vmax||55);
    wp.push({x:b.x,z:b.z,v});}
  // smooth speeds backward (braking anticipation)
  for(let k=0;k<3;k++)for(let i=wp.length-1;i>=0;i--){
    const nx=wp[(i+1)%wp.length];wp[i].v=Math.min(wp[i].v,nx.v+4.5);}
  return wp;}
function pathCheckpoints(pts,every,rad){
  const cp=[];
  for(let i=0;i<pts.length-1;i+=every)cp.push({x:pts[i].x,z:pts[i].z,r:rad||14});
  return cp;}
function railAlong(mb,pts,width,color,skip){ // guardrails both sides
  for(let i=0;i<pts.length-2;i+=2){
    const a=pts[i],b=pts[i+2];
    const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    if(len<1)continue;
    const yaw=Math.atan2(dx,dz),nx=dz/len,nz=-dx/len;
    for(const s of[-1,1]){
      if(skip&&skip(a,s))continue;
      const px=(a.x+b.x)/2+nx*s*(width/2+.6),pz=(a.z+b.z)/2+nz*s*(width/2+.6);
      const y=mb.world.height(px,pz);
      mb.box(px,y+.45,pz,.25,.7,len+.4,color||0xb9c2cc,{yaw,mu:.4,bounce:.25,tag:"rail"});}}
}

/* ---------- props ---------- */
const PROP_DEFS={
  cone:{r:.28,m:4,mk(){const g=new THREE.Group();
    const c=new THREE.Mesh(new THREE.ConeGeometry(.22,.55,8),new THREE.MeshLambertMaterial({color:0xff7518}));
    c.position.y=.28;g.add(c);
    const b=new THREE.Mesh(new THREE.BoxGeometry(.4,.05,.4),new THREE.MeshLambertMaterial({color:0xd85f10}));
    b.position.y=.025;g.add(b);return g;}},
  sign:{r:.35,m:14,mk(){const g=new THREE.Group();
    const p=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,2.1,6),new THREE.MeshLambertMaterial({color:0x8a94a0}));
    p.position.y=1.05;g.add(p);
    const s=new THREE.Mesh(new THREE.BoxGeometry(.62,.62,.04),new THREE.MeshLambertMaterial({color:0x2477ff}));
    s.position.y=1.9;g.add(s);return g;}},
  lamp:{r:.4,m:38,mk(){const g=new THREE.Group();
    const p=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,4.6,6),new THREE.MeshLambertMaterial({color:0x5b6570}));
    p.position.y=2.3;g.add(p);
    const a=new THREE.Mesh(new THREE.BoxGeometry(.12,.1,1.1),new THREE.MeshLambertMaterial({color:0x5b6570}));
    a.position.set(0,4.5,.5);g.add(a);
    const l=new THREE.Mesh(new THREE.BoxGeometry(.2,.08,.4),new THREE.MeshBasicMaterial({color:0xfff2b8}));
    l.position.set(0,4.42,.95);g.add(l);return g;}},
  bench:{r:.5,m:26,mk(){const g=new THREE.Group();
    const s=new THREE.Mesh(new THREE.BoxGeometry(1.5,.08,.45),new THREE.MeshLambertMaterial({color:0x9a6b3f}));
    s.position.y=.45;g.add(s);
    const b=new THREE.Mesh(new THREE.BoxGeometry(1.5,.4,.07),new THREE.MeshLambertMaterial({color:0x9a6b3f}));
    b.position.set(0,.72,-.2);g.add(b);
    const l=new THREE.Mesh(new THREE.BoxGeometry(1.3,.42,.35),new THREE.MeshLambertMaterial({color:0x4a4f57}));
    l.position.y=.22;g.add(l);return g;}},
  barrel:{r:.35,m:20,mk(){const m=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.9,10),
    new THREE.MeshLambertMaterial({color:0xd0662a}));m.position.y=.45;
    const g=new THREE.Group();g.add(m);return g;}},
};
function makeProp(type,x,y,z,yaw){
  const def=PROP_DEFS[type];
  const mesh=def.mk();mesh.position.set(x,y,z);mesh.rotation.y=yaw;
  return{type,mesh,def,home:{x,y,z,yaw},vel:V3(0,0,0),angVel:V3(0,0,0),awake:false,gone:false};}

/* prop vs vehicles — called from Vehicle.step */
function hitProps(veh){
  const props=veh.world.props,b=veh.body;
  for(let i=0;i<props.length;i++){
    const p=props[i];if(p.gone)continue;
    _t6.copy(p.mesh.position);_t6.y+=.4;
    _t7.copy(_t6).sub(b.pos);
    if(_t7.lengthSq()>36)continue;
    b.worldToLocal(_t6,_t8);
    const h=b.half,r=p.def.r;
    const cx=clamp(_t8.x,-h.x,h.x),cy=clamp(_t8.y,-h.y,h.y),cz=clamp(_t8.z,-h.z,h.z);
    const dx=_t8.x-cx,dy=_t8.y-cy,dz=_t8.z-cz;
    const d2=dx*dx+dy*dy+dz*dz;
    if(d2<r*r){
      _t9.set(cx,cy,cz);b.localToWorld(_t9,_t6);   // contact on car surface
      _t7.copy(_t6).sub(b.pos);
      b.velAt(_t7,_t8);
      const sp=_t8.length();
      if(sp>1){
        p.awake=true;
        p.vel.copy(_t8).multiplyScalar(1.15);
        p.vel.y+=sp*.28+1;
        p.angVel.set((Math.random()-.5)*8,(Math.random()-.5)*8,(Math.random()-.5)*8);
        b.vel.multiplyScalar(1-Math.min(.08,p.def.m/veh.spec.mass*.4));
        Fx.propHit(p,sp);}}}
}
function stepProps(world,dt){
  for(const p of world.props){
    if(!p.awake||p.gone)continue;
    p.vel.y-=GRAV*dt;
    p.mesh.position.addScaledVector(p.vel,dt);
    p.mesh.rotation.x+=p.angVel.x*dt;p.mesh.rotation.y+=p.angVel.y*dt;p.mesh.rotation.z+=p.angVel.z*dt;
    const gy=world.height(p.mesh.position.x,p.mesh.position.z);
    if(p.mesh.position.y<gy){
      p.mesh.position.y=gy;
      if(p.vel.y<0)p.vel.y*=-.3;
      p.vel.x*=.82;p.vel.z*=.82;p.angVel.multiplyScalar(.8);
      if(p.vel.lengthSq()<.05){p.awake=false;}}
    if(p.mesh.position.y<-40)p.gone=true;}
}
function resetProps(world){
  for(const p of world.props){
    p.gone=false;p.awake=false;p.vel.set(0,0,0);p.angVel.set(0,0,0);
    p.mesh.position.set(p.home.x,p.home.y,p.home.z);
    p.mesh.rotation.set(0,p.home.yaw,0);}
}
