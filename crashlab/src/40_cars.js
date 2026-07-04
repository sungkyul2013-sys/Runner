/* ============================================================
   Cars — 5 specs + procedural deformable meshes
   ============================================================ */
const CARS=[
 {id:"pony",name:"포니 시티",icon:"🚗",drive:"FF",mass:1050,hp:120,acc:"10.5초",top:168,
  desc:"입문용 해치백. 관대한 그립, 리프트오프 턱인 연습에 최적.",
  body:{hx:.8,hy:.55,hz:1.9},wheels:{track:.72,front:1.2,rear:1.2,y:-.3,radius:.3,width:.2},
  susp:{k:40000,c:3400,travel:.16,rest:.18},arb:14000,
  engine:{maxT:150,redline:6500,idle:900},gears:[3.4,2.0,1.35,1.0,.82],final:4.1,
  brakeF:5400,steerLo:.62,steerHi:.14,aero:{cd:.85,df:0},gripF:1.0,gripR:1.02,
  style:"hatch",colors:[0x4db3ff,0xffd23e,0xd9dee6,0xff6b6b,0x7dd87d],
  stats:{spd:30,acc:32,grip:55,mass:20}},
 {id:"gt",name:"드리프트킹 GT",icon:"🏎️",drive:"FR",mass:1380,hp:320,acc:"5.0초",top:255,
  desc:"파워 오버스티어의 교과서. 핸드브레이크 드리프트 진입 특화.",
  body:{hx:.86,hy:.5,hz:2.15},wheels:{track:.8,front:1.35,rear:1.4,y:-.28,radius:.32,width:.25},
  susp:{k:64000,c:5400,travel:.12,rest:.15},arb:26000,
  engine:{maxT:420,redline:7200,idle:950},gears:[3.2,2.1,1.5,1.15,.92],final:3.7,
  brakeF:7200,steerLo:.6,steerHi:.13,aero:{cd:.6,df:12},gripF:1.06,gripR:.97,
  style:"coupe",colors:[0xff7a1a,0x222831,0xe63946,0xf1f1f1,0x9d4edd],
  stats:{spd:70,acc:72,grip:70,mass:32}},
 {id:"offroad",name:"산악왕 4X4",icon:"🚙",drive:"4WD",mass:2150,hp:210,acc:"11.0초",top:170,
  desc:"서스펜션 트래블 250mm. 오프로드에서는 지배자.",
  body:{hx:.95,hy:.75,hz:2.2},wheels:{track:.88,front:1.4,rear:1.4,y:-.5,radius:.42,width:.3},
  susp:{k:56000,c:5600,travel:.25,rest:.3},arb:9000,
  engine:{maxT:400,redline:5200,idle:800},gears:[3.8,2.3,1.6,1.15,.9],final:4.0,
  brakeF:10500,steerLo:.58,steerHi:.15,aero:{cd:1.5,df:0},gripF:.95,gripR:.95,
  style:"suv",colors:[0x5f8b4c,0xc2a368,0x556270,0xb8443c,0x2b2b2b],
  stats:{spd:32,acc:38,grip:60,mass:55}},
 {id:"titan",name:"타이탄 카고",icon:"🚚",drive:"RWD",mass:8000,hp:450,acc:"25초",top:120,
  desc:"8톤의 질량. 높은 무게중심 = 전복 장인. 뭐든 밀어버린다.",
  body:{hx:1.15,hy:1.25,hz:3.5},wheels:{track:1.02,front:2.35,rear:2.1,y:-.85,radius:.5,width:.35},
  susp:{k:240000,c:27000,travel:.2,rest:.26},arb:40000,
  engine:{maxT:1650,redline:3800,idle:600},gears:[4.5,2.8,1.8,1.2,.9],final:4.3,
  brakeF:38000,steerLo:.5,steerHi:.1,aero:{cd:6,df:0},gripF:.85,gripR:.88,
  style:"truck",colors:[0x8899aa,0xcf6a2f,0x3d5a80,0x9b2226,0xdddddd],
  stats:{spd:18,acc:12,grip:35,mass:100}},
 {id:"veloce",name:"벨로체 R",icon:"🏁",drive:"4WD",mass:1480,hp:720,acc:"2.9초",top:330,
  desc:"720마력 + 다운포스. 시뮬 모드에서 진가를 발휘한다.",
  body:{hx:.92,hy:.42,hz:2.2},wheels:{track:.86,front:1.35,rear:1.42,y:-.24,radius:.33,width:.3},
  susp:{k:98000,c:7200,travel:.09,rest:.12},arb:60000,
  engine:{maxT:780,redline:8500,idle:1100},gears:[3.0,2.05,1.55,1.2,.97],final:3.4,
  brakeF:8600,steerLo:.56,steerHi:.11,aero:{cd:.42,df:95},gripF:1.16,gripR:1.14,
  style:"super",colors:[0xd7263d,0x04e762,0xffe600,0x101418,0x00a8e8],
  stats:{spd:100,acc:100,grip:95,mass:35}},
];

/* ----- loft body builder ----- */
/* station: {z,w,y0,y1,y2,wt, glass(side quads y1→y2 painted glass), top(roof quad glass)} */
function carStations(spec){
  const{hx,hy,hz}=spec.body,st=spec.style;
  const S=(z,w,y0,y1,y2,wt,glass,top)=>({z:z*hz,w:w*hx,y0:y0*hy,y1:y1*hy,y2:y2*hy,wt:wt*hx,glass,top});
  if(st==="hatch")return[
    S(1,.72,-.7,-.1,0,.6),S(.82,.94,-.85,.05,.14,.8),S(.42,1,-.9,.1,.22,.85,0,1),
    S(.1,1,-.9,.12,.95,.72,1,0),S(-.5,1,-.9,.12,1,.7,1,1),S(-.88,.96,-.85,.1,.6,.68,1,0),S(-1,.7,-.6,-.05,.35,.55)];
  if(st==="coupe")return[
    S(1,.7,-.65,-.15,-.08,.58),S(.85,.95,-.85,0,.06,.82),S(.35,1,-.9,.06,.14,.86,0,1),
    S(.05,1,-.9,.08,.85,.68,1,0),S(-.45,1,-.9,.08,.9,.64,1,1),S(-.8,.98,-.85,.05,.35,.72,1,0),S(-1,.74,-.6,-.1,.12,.6)];
  if(st==="suv")return[
    S(1,.74,-.6,-.05,.05,.62),S(.8,.96,-.8,.1,.2,.84),S(.45,1,-.85,.12,.3,.88,0,1),
    S(.2,1,-.85,.14,.95,.8,1,0),S(-.75,1,-.85,.14,1,.8,1,1),S(-.95,.94,-.75,.1,.9,.76,1,0),S(-1,.72,-.55,0,.75,.6)];
  if(st==="truck")return[
    S(1,.7,-.5,-.1,.1,.6),S(.92,.95,-.6,.15,.3,.85),S(.75,.98,-.65,.2,.85,.8,1,1),
    S(.52,.98,-.65,.2,.9,.8,1,0),S(.45,1,-.7,.3,1,.95),S(-.95,1,-.7,.3,1,.95),S(-1,.9,-.5,.2,.9,.85)];
  /* super */ return[
    S(1,.72,-.75,-.35,-.3,.6),S(.8,.97,-.95,-.25,-.15,.86),S(.3,1,-1,-.2,0,.9,0,1),
    S(0,1,-1,-.15,.7,.6,1,0),S(-.4,1,-1,-.15,.75,.56,1,1),S(-.72,1,-.95,-.1,.45,.7,1,0),S(-1,.8,-.7,-.2,.3,.66)];
}
const GLASS_COL=new THREE.Color(0x18222e);
function buildCarBody(spec,colorHex){
  const st=carStations(spec),body=new THREE.Color(colorHex);
  const shade=body.clone().multiplyScalar(.82);
  const pos=[],col=[];
  const P=(s,k)=>{ // section point k: 0..5
    switch(k){case 0:return[-s.w,s.y0];case 1:return[s.w,s.y0];case 2:return[s.w,s.y1];
      case 3:return[s.wt,s.y2];case 4:return[-s.wt,s.y2];default:return[-s.w,s.y1];}};
  const quad=(ax,ay,az,bx,by,bz,cx,cy,cz,dx,dy,dz,c)=>{
    pos.push(ax,ay,az,bx,by,bz,cx,cy,cz, ax,ay,az,cx,cy,cz,dx,dy,dz);
    for(let i=0;i<6;i++)col.push(c.r,c.g,c.b);};
  for(let i=0;i<st.length-1;i++){
    const a=st[i],b=st[i+1];
    const edges=[[0,1,shade],[1,2,body],[2,3,a.glass&&b.glass!==undefined&&(a.glass||b.glass)?GLASS_COL:body],
      [3,4,(a.top||b.top)&&(a.glass||b.glass)?GLASS_COL:body],[4,5,(a.glass||b.glass)&&a.glass!==0?GLASS_COL:body],[5,0,body]];
    // windshield/rear glass: roof quad where y2 jumps
    if(Math.abs(a.y2-b.y2)>spec.body.hy*.3)edges[3][2]=GLASS_COL;
    if(!(a.glass||b.glass)){edges[2][2]=body;edges[4][2]=body;}
    for(const[k1,k2,c]of edges){
      const[p1x,p1y]=P(a,k1),[p2x,p2y]=P(a,k2),[p3x,p3y]=P(b,k2),[p4x,p4y]=P(b,k1);
      quad(p1x,p1y,a.z,p4x,p4y,b.z,p3x,p3y,b.z,p2x,p2y,a.z,c);}}
  // caps
  const capC=(s,rev,c)=>{
    for(let k=1;k<5;k++){
      const[x0,y0]=P(s,0),[x1,y1]=P(s,k),[x2,y2]=P(s,(k+1)%6);
      if(rev){pos.push(x0,y0,s.z,x1,y1,s.z,x2,y2,s.z);}else{pos.push(x0,y0,s.z,x2,y2,s.z,x1,y1,s.z);}
      for(let i=0;i<3;i++)col.push(c.r,c.g,c.b);}
    const[x0,y0]=P(s,0),[x5,y5]=P(s,5),[x4,y4]=P(s,4);
    if(rev)pos.push(x0,y0,s.z,x5,y5,s.z,x4,y4,s.z);else pos.push(x0,y0,s.z,x4,y4,s.z,x5,y5,s.z);
    for(let i=0;i<3;i++)col.push(c.r,c.g,c.b);};
  capC(st[0],false,shade);capC(st[st.length-1],true,shade);
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
  g.computeVertexNormals();
  return g;
}

const MAT_CAR=new THREE.MeshPhongMaterial({vertexColors:true,flatShading:true,shininess:60,specular:0x333333});
const MAT_DARK=new THREE.MeshPhongMaterial({color:0x14181e,flatShading:true,shininess:10});
const MAT_HUB=new THREE.MeshPhongMaterial({color:0x9aa3ad,flatShading:true});
let _wheelGeoCache={};
function wheelGeo(r,wd){
  const k=r+"_"+wd;
  if(!_wheelGeoCache[k]){
    const tire=new THREE.CylinderGeometry(r,r,wd,14).toNonIndexed();
    tire.rotateZ(Math.PI/2);
    _wheelGeoCache[k]=tire;}
  return _wheelGeoCache[k];
}

/* deform helper: displace verts of geometry near lp along ln by depth d radius R */
function deformGeo(mesh,lp,ln,d,R,cap){
  const g=mesh.geometry,posA=g.attributes.position;
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

/* ----- car visual ----- */
class CarVisual{
  constructor(spec,colorHex){
    this.spec=spec;
    this.group=new THREE.Group();
    this.bodyMesh=new THREE.Mesh(buildCarBody(spec,colorHex),MAT_CAR.clone());
    this.bodyMesh.castShadow=true;
    this.group.add(this.bodyMesh);
    const{hx,hy,hz}=spec.body;
    const partMat=new THREE.MeshPhongMaterial({color:new THREE.Color(colorHex).multiplyScalar(.9),flatShading:true,shininess:50});
    const mk=(w,h,d,x,y,z,mat)=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d,2,1,2).toNonIndexed(),mat||partMat);
      m.position.set(x,y,z);m.castShadow=true;this.group.add(m);return m;};
    const bumpMat=new THREE.MeshPhongMaterial({color:0x1c2128,flatShading:true,shininess:20});
    this.parts={
      fb:mk(hx*1.7,hy*.34,.16,0,-hy*.55,hz+.06,bumpMat),
      rb:mk(hx*1.7,hy*.34,.16,0,-hy*.55,-hz-.06,bumpMat),
      hood:mk(hx*1.5,.05,hz*.5,0,hy*(spec.style==="super"?-.12:.16),hz*.62),
      trunk:mk(hx*1.5,.05,hz*.34,0,hy*(spec.style==="truck"?1.02:.1),-hz*.68),
      dl:mk(.06,hy*.7,hz*.62,-hx-.015,-hy*.15,hz*.02),
      dr:mk(.06,hy*.7,hz*.62,hx+.015,-hy*.15,hz*.02)};
    this.partHp={fb:1,rb:1,hood:1,trunk:1,dl:1,dr:1};
    this.detached={};
    // lights
    const em=(c,x,y,z,w)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,.09,.05),
      new THREE.MeshBasicMaterial({color:c}));m.position.set(x,y,z);this.group.add(m);return m;};
    this.headL=em(0xfff6d8,-hx*.55,-hy*.18,hz+.02,.3);this.headR=em(0xfff6d8,hx*.55,-hy*.18,hz+.02,.3);
    em(0xff2a2a,-hx*.55,-hy*.1,-hz-.02,.28);em(0xff2a2a,hx*.55,-hy*.1,-hz-.02,.28);
    // wheels
    this.wheelMeshes=[];
    for(const w of[[-spec.wheels.track,spec.wheels.front],[spec.wheels.track,spec.wheels.front],
                   [-spec.wheels.track,spec.wheels.rear*-1],[spec.wheels.track,-spec.wheels.rear]]){
      const grp=new THREE.Group();
      const tire=new THREE.Mesh(wheelGeo(spec.wheels.radius,spec.wheels.width),MAT_DARK);
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(spec.wheels.radius*.55,spec.wheels.radius*.55,spec.wheels.width+.02,8),MAT_HUB);
      hub.rotation.z=Math.PI/2;
      grp.add(tire);grp.add(hub);grp.position.set(w[0],spec.wheels.y,w[1]);
      this.group.add(grp);this.wheelMeshes.push(grp);}
    this.defVol=0;
  }
  applyImpact(imp,veh){
    const dv=imp.dv;
    const d=Math.min(.4,.015*dv),R=.5+.02*dv;
    this.defVol+=deformGeo(this.bodyMesh,imp.lp,imp.ln,d,R,.45);
    for(const k in this.parts){
      const p=this.parts[k];
      if(this.detached[k])continue;
      deformGeo(p,imp.lp,imp.ln,d,R,.4);
      _vA.copy(imp.lp).sub(p.position);
      if(_vA.length()<R+.6){
        this.partHp[k]-=dv*.02*(k==="fb"||k==="rb"?1.6:1);
        if(this.partHp[k]<=0&&veh.damageOn)this.detachPart(k,veh,imp);}}
  }
  detachPart(k,veh,imp){
    if(this.detached[k])return;
    const p=this.parts[k];this.detached[k]=p;
    Fx.addDebris(p,veh,imp);
  }
  repair(){
    restoreGeo(this.bodyMesh);this.defVol=0;
    for(const k in this.parts){
      const p=this.parts[k];restoreGeo(p);this.partHp[k]=1;
      if(this.detached[k]){Fx.reclaimDebris(p);this.group.add(p);
        p.material.opacity=1;p.material.transparent=false;
        // restore local placement
        p.position.copy(p.userData.home);p.quaternion.identity();
        delete this.detached[k];}}
  }
  storeHomes(){for(const k in this.parts)this.parts[k].userData.home=this.parts[k].position.clone();}
  sync(veh,shakeT){
    this.group.position.copy(veh.body.pos);
    this.group.quaternion.copy(veh.body.quat);
    if(shakeT>0&&Settings.camShake){
      this.group.position.x+=(Math.random()-.5)*.02;this.group.position.y+=(Math.random()-.5)*.02;}
    for(let i=0;i<4;i++){
      const w=veh.wheels[i],m=this.wheelMeshes[i];
      m.position.set(w.local.x,w.visY,w.local.z);
      const st=(w.front?veh.steer:0)+(w.left?-veh.toe:veh.toe)*8;
      m.rotation.set(0,st,0);
      m.children[0].rotation.x=w.spin;m.children[1].rotation.x=w.spin;
      m.children[1].rotation.z=Math.PI/2;}
  }
  dispose(){
    this.group.parent&&this.group.parent.remove(this.group);
    this.bodyMesh.geometry.dispose();
    for(const k in this.parts)this.parts[k].geometry.dispose();
  }
}
