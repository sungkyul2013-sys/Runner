/* ============================================================
   Cars — 5 specs + procedural high-detail deformable meshes
   (8-point loft, wheel wells, fenders, detachable parts)
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

/* ---------- generic non-indexed geometry merger ---------- */
/* items: {geo, color, x,y,z, rx,ry,rz, sx,sy,sz} — consumes geo */
const _mm=new THREE.Matrix4(),_me=new THREE.Euler();
function mergeGeoms(items){
  const pos=[],nor=[],col=[];
  for(const it of items){
    let g=it.geo.index?it.geo.toNonIndexed():it.geo;
    _me.set(it.rx||0,it.ry||0,it.rz||0);
    _mm.makeRotationFromEuler(_me);
    _mm.setPosition(it.x||0,it.y||0,it.z||0);
    if(it.sx||it.sy||it.sz)g.scale(it.sx||1,it.sy||1,it.sz||1);
    g.applyMatrix4(_mm);
    const p=g.attributes.position.array,n=g.attributes.normal.array;
    const c=new THREE.Color(it.color);
    for(let i=0;i<p.length;i++){pos.push(p[i]);nor.push(n[i]);}
    for(let i=0;i<p.length/3;i++)col.push(c.r,c.g,c.b);
    g.dispose();if(g!==it.geo)it.geo.dispose();}
  const out=new THREE.BufferGeometry();
  out.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  out.setAttribute("normal",new THREE.Float32BufferAttribute(nor,3));
  out.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
  return out;
}

/* ---------- body loft: 8-point cross-section stations ---------- */
/* station fields (normalized: w,x in hx / y in hy / z in hz):
   z, w(lower width), y0(floor), y1(belt), y2(roof), wt(roof width),
   glass(side glass segment), top(roof segment is glass e.g. windshield) */
function carStations(spec){
  const{hx,hy,hz}=spec.body,st=spec.style;
  const S=(z,w,y0,y1,y2,wt,glass,top)=>({z:z*hz,w:w*hx,y0:y0*hy,y1:y1*hy,y2:y2*hy,
    wt:(wt??.64)*hx,glass:glass||0,top:top||0});
  if(st==="hatch")return[
    S(1,.72,-.62,-.08,-.02,.58),S(.92,.92,-.78,.02,.1,.72),S(.62,1,-.85,.1,.18,.8),
    S(.38,1,-.86,.14,.24,.82),S(.14,1,-.86,.14,.9,.66,0,1),S(.02,.995,-.86,.14,.96,.64),
    S(-.3,1,-.86,.14,1,.64,1),S(-.62,.99,-.85,.12,.97,.63,1),S(-.8,.96,-.8,.1,.9,.62,1,1),
    S(-.92,.9,-.72,.05,.4,.6),S(-1,.74,-.6,-.05,.28,.56)];
  if(st==="coupe")return[
    S(1,.74,-.68,-.24,-.16,.6),S(.9,.94,-.85,-.12,-.02,.76),S(.55,1,-.9,-.02,.1,.84),
    S(.28,1,-.9,.02,.16,.84),S(.1,1,-.9,.04,.76,.62,0,1),S(-.02,.995,-.9,.05,.84,.58),
    S(-.35,1,-.9,.05,.86,.58,1),S(-.58,.99,-.88,.04,.72,.56,1,1),
    S(-.8,.97,-.82,.02,.3,.66),S(-1,.78,-.65,-.1,.16,.62)];
  if(st==="suv")return[
    S(1,.8,-.5,0,.1,.66),S(.9,.96,-.68,.12,.3,.8),S(.66,1,-.75,.18,.4,.84),
    S(.46,1,-.78,.2,.42,.84),S(.3,1,-.78,.2,1,.76,0,1),S(.18,.995,-.78,.2,1.05,.74),
    S(-.2,1,-.78,.2,1.06,.74,1),S(-.6,1,-.78,.2,1.05,.74,1),S(-.88,.98,-.74,.17,1,.72,1),
    S(-1,.8,-.55,.05,.92,.68)];
  if(st==="truck")return[
    S(1,.78,-.42,.12,.32,.66),S(.96,.95,-.5,.3,.55,.8),S(.88,.96,-.55,.32,.9,.78,0,1),
    S(.72,.96,-.6,.32,.95,.78,1),S(.54,.94,-.62,.3,.9,.76),
    S(.48,.99,-.65,.4,1.02,.92),S(-.9,.99,-.65,.4,1.02,.92),S(-1,.92,-.55,.3,.97,.86)];
  /* super */ return[
    S(1,.7,-.8,-.56,-.5,.58),S(.85,.95,-.95,-.42,-.32,.8),S(.5,1,-1,-.3,-.16,.86),
    S(.27,1,-1,-.26,-.1,.86),S(.1,1,-1,-.24,.48,.6,0,1),S(-.02,.995,-1,-.22,.62,.56),
    S(-.3,1,-1,-.2,.66,.56,1),S(-.48,1,-1,-.18,.52,.6,1,1),
    S(-.72,.99,-.95,-.15,.32,.74),S(-1,.84,-.75,-.3,.2,.7)];
}
const GLASS_COL=new THREE.Color(0x151d28);
function buildCarBody(spec,colorHex){
  const st=carStations(spec);
  const body=new THREE.Color(colorHex);
  const shade=body.clone().multiplyScalar(.66);
  const dark=body.clone().multiplyScalar(.42);
  const roof=body.clone().multiplyScalar(.88);
  const pos=[],col=[];
  // 8 section points: 0 bl,1 br,2 rockerR,3 beltR,4 roofR,5 roofL,6 beltL,7 rockerL
  const P=(s,k)=>{
    const wf=s.w*1.04,yf=s.y0+(s.y1-s.y0)*.3,wb=s.w*.985;
    switch(k){case 0:return[-s.w*.92,s.y0];case 1:return[s.w*.92,s.y0];
      case 2:return[wf,yf];case 3:return[wb,s.y1];case 4:return[s.wt,s.y2];
      case 5:return[-s.wt,s.y2];case 6:return[-wb,s.y1];default:return[-wf,yf];}};
  const quad=(p1,p2,p3,p4,za,zb,c)=>{
    pos.push(p1[0],p1[1],za, p4[0],p4[1],zb, p3[0],p3[1],zb,
             p1[0],p1[1],za, p3[0],p3[1],zb, p2[0],p2[1],za);
    for(let i=0;i<6;i++)col.push(c.r,c.g,c.b);};
  for(let i=0;i<st.length-1;i++){
    const a=st[i],b=st[i+1];
    const sideGlass=(a.glass||b.glass)?GLASS_COL:body;
    const topC=(a.top||b.top)?GLASS_COL:roof;
    const edges=[[0,1,dark],[1,2,shade],[2,3,body],[3,4,sideGlass],[4,5,topC],
                 [5,6,sideGlass],[6,7,body],[7,0,shade]];
    for(const[k1,k2,c]of edges)
      quad(P(a,k1),P(a,k2),P(b,k2),P(b,k1),a.z,b.z,c);}
  // caps (front & rear faces) as fans
  const cap=(s,rev,c)=>{
    for(let k=1;k<7;k++){
      const[x0,y0]=P(s,0),[x1,y1]=P(s,k),[x2,y2]=P(s,k+1);
      if(rev)pos.push(x0,y0,s.z,x1,y1,s.z,x2,y2,s.z);
      else pos.push(x0,y0,s.z,x2,y2,s.z,x1,y1,s.z);
      for(let i=0;i<3;i++)col.push(c.r,c.g,c.b);}};
  cap(st[0],false,body);cap(st[st.length-1],true,shade);
  // fake AO: darken toward floor
  let yMin=1e9,yMax=-1e9;
  for(let i=1;i<pos.length;i+=3){yMin=Math.min(yMin,pos[i]);yMax=Math.max(yMax,pos[i]);}
  for(let i=0;i<pos.length;i+=3){
    const t=.72+.28*clamp((pos[i+1]-yMin)/(yMax-yMin+1e-6),0,1);
    col[i]*=t;col[i+1]*=t;col[i+2]*=t;}
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
  g.computeVertexNormals();
  return g;
}
/* interpolate station roof height / belt at z (for part placement) */
function stationLerp(st,z,key){
  for(let i=0;i<st.length-1;i++){
    const a=st[i],b=st[i+1];
    if((z<=a.z&&z>=b.z)||(z>=a.z&&z<=b.z)){
      const t=(z-a.z)/((b.z-a.z)||1e-6);return lerp(a[key],b[key],t);}}
  return st[0][key];
}

const MAT_CAR=new THREE.MeshPhongMaterial({vertexColors:true,flatShading:true,shininess:70,specular:0x555555});
const MAT_DETAIL=new THREE.MeshPhongMaterial({vertexColors:true,flatShading:true,shininess:30,specular:0x222222});
let _wheelGeoCache={};
function wheelGeo(r,wd){ // merged tire+rim+spokes, vertex colors
  const k=(r*100|0)+"_"+(wd*100|0);
  if(!_wheelGeoCache[k]){
    const items=[
      {geo:new THREE.CylinderGeometry(r,r,wd,16),color:0x16181c,rz:Math.PI/2},
      {geo:new THREE.CylinderGeometry(r*.58,r*.58,wd+.015,10),color:0xb8bfc9,rz:Math.PI/2},
      {geo:new THREE.CylinderGeometry(r*.16,r*.16,wd+.05,8),color:0x30343c,rz:Math.PI/2}];
    for(let s=0;s<5;s++)items.push({geo:new THREE.BoxGeometry(wd+.03,r*.42,r*.16),
      color:0x585f6a,rx:s*Math.PI*2/5,y:0,z:0});
    // spokes rotate around x-axis: build them along y then rotate about x
    _wheelGeoCache[k]=mergeGeoms(items.map((it,i)=>{
      if(i>=3){const a=(i-3)*Math.PI*2/5;
        return{geo:new THREE.BoxGeometry(wd+.02,r*.9,r*.14),color:0x9aa2ad,rx:a};}
      return it;}));}
  return _wheelGeoCache[k];
}

/* deform helper (unchanged API) */
function deformGeo(mesh,lp,ln,d,R,cap){
  const g=mesh.geometry,posA=g.attributes.position;
  if(!posA)return 0;
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

/* ---------- car visual ---------- */
class CarVisual{
  constructor(spec,colorHex){
    this.spec=spec;
    this.group=new THREE.Group();
    const{hx,hy,hz}=spec.body,st=carStations(spec),W=spec.wheels;
    const bodyC=new THREE.Color(colorHex);
    const shadeC=bodyC.clone().multiplyScalar(.72);
    this.bodyMesh=new THREE.Mesh(buildCarBody(spec,colorHex),MAT_CAR);
    this.bodyMesh.castShadow=true;
    this.group.add(this.bodyMesh);

    /* --- static detail (merged, one draw call) --- */
    const det=[];
    const wellR=W.radius+.1;
    for(const[wx,wz]of[[-W.track,W.front],[W.track,W.front],[-W.track,-W.rear],[W.track,-W.rear]]){
      det.push({geo:new THREE.CylinderGeometry(wellR,wellR,W.width+.14,10,1,true,0,Math.PI),
        color:0x0c0e12,x:wx,y:W.y+.02,z:wz,rz:Math.PI/2});}
    // grille + plates + exhaust
    const noseY=stationLerp(st,hz*.97,"y1"),tailY=stationLerp(st,-hz*.97,"y1");
    det.push({geo:new THREE.BoxGeometry(hx*.9,hy*.18,.05),color:0x10141a,x:0,y:noseY*.65-hy*.18,z:hz-.02});
    det.push({geo:new THREE.BoxGeometry(.34,.12,.03),color:0xe8ecf2,x:0,y:-hy*.5,z:hz+.09});
    det.push({geo:new THREE.BoxGeometry(.34,.12,.03),color:0xe8ecf2,x:0,y:-hy*.5,z:-hz-.09});
    for(const ex of spec.style==="super"?[-.3,-.1,.1,.3]:[-.25,.25])
      det.push({geo:new THREE.CylinderGeometry(.045,.045,.14,7),color:0x2e343c,
        x:ex*hx,y:-hy*.72,z:-hz-.04,rx:Math.PI/2});
    // door handles
    const beltY=stationLerp(st,0,"y1");
    for(const s of[-1,1])det.push({geo:new THREE.BoxGeometry(.03,.03,.16),color:0x1c2026,
      x:s*hx*1.0,y:beltY-.05,z:hz*.06});
    // style extras
    if(spec.style==="coupe"){ // ducktail
      det.push({geo:new THREE.BoxGeometry(hx*1.6,.05,.24),color:shadeC.getHex(),
        x:0,y:stationLerp(st,-hz*.97,"y2")+.08,z:-hz*.95,rx:-.16});}
    if(spec.style==="super"){ // big wing + splitter
      const wy=stationLerp(st,-hz*.85,"y2")+.24;
      det.push({geo:new THREE.BoxGeometry(hx*1.9,.04,.34),color:0x14171c,x:0,y:wy,z:-hz*.88,rx:-.12});
      for(const s of[-1,1])det.push({geo:new THREE.BoxGeometry(.05,.24,.14),color:0x14171c,
        x:s*hx*.7,y:wy-.13,z:-hz*.88});
      det.push({geo:new THREE.BoxGeometry(hx*1.9,.05,.3),color:0x14171c,x:0,y:-hy*.96,z:hz*.92});}
    if(spec.style==="suv"){ // roof rails + spare wheel
      for(const s of[-1,1])det.push({geo:new THREE.BoxGeometry(.06,.07,hz*1.1),color:0x3a4048,
        x:s*hx*.62,y:stationLerp(st,-hz*.2,"y2")+.06,z:-hz*.05});
      det.push({geo:new THREE.CylinderGeometry(W.radius*.85,W.radius*.85,.2,12),color:0x1a1d22,
        x:0,y:tailY*.4,z:-hz-.12,rx:Math.PI/2});}
    if(spec.style==="truck"){ // cab/box divider + box ribs
      for(let i=0;i<5;i++)det.push({geo:new THREE.BoxGeometry(hx*2.01,hy*1.6,.04),color:shadeC.getHex(),
        x:0,y:hy*.38*.5+hy*.1,z:hz*.45-1.4-i*1.15,sy:1});}
    if(spec.style==="hatch"){ // roof lip
      det.push({geo:new THREE.BoxGeometry(hx*1.3,.04,.14),color:shadeC.getHex(),
        x:0,y:stationLerp(st,-hz*.8,"y2")+.03,z:-hz*.82,rx:-.3});}
    this.detailMesh=new THREE.Mesh(mergeGeoms(det),MAT_DETAIL);
    this.detailMesh.castShadow=true;
    this.group.add(this.detailMesh);

    /* --- lights (merged, MeshBasic) --- */
    const li=[];
    const hlY=spec.style==="super"?-hy*.45:noseY*.4;
    for(const s of[-1,1]){
      li.push({geo:new THREE.BoxGeometry(hx*.44,.1,.05),color:0xfff6d8,x:s*hx*.56,y:hlY,z:hz+.01});
      li.push({geo:new THREE.BoxGeometry(hx*.4,.09,.05),color:0xff2a2a,x:s*hx*.56,y:tailY*.5,z:-hz-.01});
      li.push({geo:new THREE.BoxGeometry(.08,.06,.1),color:0xffb340,x:s*hx*1.02,y:noseY*.4,z:hz*.94});}
    this.lightsMesh=new THREE.Mesh(mergeGeoms(li),new THREE.MeshBasicMaterial({vertexColors:true}));
    this.group.add(this.lightsMesh);

    /* --- detachable parts --- */
    const partMat=new THREE.MeshPhongMaterial({color:bodyC.clone().multiplyScalar(.92),flatShading:true,shininess:55});
    const bumpMat=new THREE.MeshPhongMaterial({color:0x191d24,flatShading:true,shininess:18});
    const mirrMat=new THREE.MeshPhongMaterial({color:bodyC.clone().multiplyScalar(.8),flatShading:true,shininess:55});
    const mk=(w,h,d,x,y,z,mat)=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d,2,1,2).toNonIndexed(),mat||partMat);
      m.position.set(x,y,z);m.castShadow=true;this.group.add(m);return m;};
    const hoodY=stationLerp(st,hz*.5,"y2");
    this.parts={
      fb:mk(hx*1.78,hy*.3,.18,0,-hy*.6,hz+.05,bumpMat),
      rb:mk(hx*1.78,hy*.3,.18,0,-hy*.6,-hz-.05,bumpMat),
      dl:mk(.05,hy*.66,hz*.56,-hx-.02,-hy*.2,hz*.04),
      dr:mk(.05,hy*.66,hz*.56,hx+.02,-hy*.2,hz*.04),
      ml:mk(.07,.09,.2,-hx-.1,stationLerp(st,hz*.12,"y1")+.14,hz*.14,mirrMat),
      mr:mk(.07,.09,.2,hx+.1,stationLerp(st,hz*.12,"y1")+.14,hz*.14,mirrMat)};
    if(spec.style!=="truck")
      this.parts.hood=mk(hx*1.5,.05,hz*.42,0,hoodY+.02,hz*.6);
    if(spec.style==="coupe"||spec.style==="super")
      this.parts.trunk=mk(hx*1.4,.05,hz*.24,0,stationLerp(st,-hz*.8,"y2")+.02,-hz*.8);
    else if(spec.style==="truck")
      this.parts.trunk=mk(hx*1.85,hy*1.5,.06,0,hy*.2,-hz-.03); // 화물칸 뒷문
    else // hatch/suv: 테일게이트 패널
      this.parts.trunk=mk(hx*1.35,hy*.55,.05,0,stationLerp(st,-hz*.99,"y1")+hy*.28,-hz-.02);
    this.partHp={fb:1,rb:1,hood:1,trunk:1,dl:1,dr:1,ml:.35,mr:.35};
    this.detached={};

    /* --- wheels --- */
    this.wheelMeshes=[];
    const wg=wheelGeo(W.radius,W.width);
    for(let i=0;i<4;i++){
      const m=new THREE.Mesh(wg,MAT_DETAIL);
      const grp=new THREE.Group();grp.add(m);
      grp.position.set(i%2?W.track:-W.track,W.y,i<2?W.front:-W.rear);
      this.group.add(grp);this.wheelMeshes.push(grp);}
    this.defVol=0;
  }
  applyImpact(imp,veh){
    const dv=imp.dv;
    const d=Math.min(.4,.015*dv),R=.5+.02*dv;
    this.defVol+=deformGeo(this.bodyMesh,imp.lp,imp.ln,d,R,.45);
    deformGeo(this.detailMesh,imp.lp,imp.ln,d*.8,R,.4);
    for(const k in this.parts){
      const p=this.parts[k];
      if(this.detached[k])continue;
      deformGeo(p,imp.lp,imp.ln,d,R,.4);
      _vA.copy(imp.lp).sub(p.position);
      if(_vA.length()<R+.5){
        this.partHp[k]-=dv*.02*(k==="fb"||k==="rb"?1.6:(k==="ml"||k==="mr")?3:1);
        if(this.partHp[k]<=0&&veh.damageOn)this.detachPart(k,veh,imp);}}
  }
  detachPart(k,veh,imp){
    if(this.detached[k])return;
    const p=this.parts[k];this.detached[k]=p;
    Fx.addDebris(p,veh,imp);
  }
  repair(){
    restoreGeo(this.bodyMesh);restoreGeo(this.detailMesh);this.defVol=0;
    const HP={ml:.35,mr:.35};
    for(const k in this.parts){
      const p=this.parts[k];restoreGeo(p);this.partHp[k]=HP[k]??1;
      if(this.detached[k]){Fx.reclaimDebris(p);this.group.add(p);
        p.material.opacity=1;p.material.transparent=false;
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
      m.children[0].rotation.x=w.spin;}
  }
  dispose(){
    this.group.parent&&this.group.parent.remove(this.group);
    this.bodyMesh.geometry.dispose();this.detailMesh.geometry.dispose();
    this.lightsMesh.geometry.dispose();
    for(const k in this.parts)this.parts[k].geometry.dispose();
  }
}
