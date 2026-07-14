/* ============================================================
   Maps — heightfield terrain + static OBB structures + props
   ============================================================ */
const SURF_ID={};SURF_IDS.forEach((k,i)=>SURF_ID[k]=i);

const TEX_SIZE=2048;
const SURF_CSS={};  // surf id → css color (지면 텍스처용, sRGB)
SURF_IDS.forEach((k,i)=>{const c=new THREE.Color();c.setHex(SURF[k].col);
  // SURF.col은 linear로 취급돼 왔으므로 캔버스(sRGB)용으로 감마 보정
  SURF_CSS[i]="rgb("+[c.r,c.g,c.b].map(v=>Math.round(Math.pow(v,1/2.2)*255)).join(",")+")";});
class MapBuilder{
  constructor(size,res){
    this.world=new World(size,res);
    this.group=new THREE.Group();
    this.mergePos=[];this.mergeNor=[];this.mergeCol=[];
    this.props=[];this.laneDots=[];
    // 고해상 지면 텍스처 (도로·차선·마킹은 벡터로 선명하게)
    this.tex=document.createElement("canvas");
    this.tex.width=this.tex.height=TEX_SIZE;
    this.tctx=this.tex.getContext("2d");
    this.overlay=document.createElement("canvas");   // 벡터 마킹 레이어 (finalize에서 합성)
    this.overlay.width=this.overlay.height=TEX_SIZE;
    this.octx=this.overlay.getContext("2d");
    this.ppm=TEX_SIZE/size;               // pixels per meter
  }
  /* world(x,z) → tex px */
  tp(x,z){return[(x/this.world.size+.5)*TEX_SIZE,(z/this.world.size+.5)*TEX_SIZE];}
  texBase(){ // sMap 저해상 → 부드럽게 업스케일 (배경 지형색)
    const w=this.world,n=w.res+1;
    const c=document.createElement("canvas");c.width=c.height=n;
    const x=c.getContext("2d");
    const img=x.createImageData(n,n);
    const tmp=new THREE.Color();
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){
      tmp.setHex(SURF[SURF_IDS[w.sMap[j*n+i]]].col);
      const o=(j*n+i)*4;
      img.data[o]=Math.round(Math.pow(tmp.r,1/2.2)*255);
      img.data[o+1]=Math.round(Math.pow(tmp.g,1/2.2)*255);
      img.data[o+2]=Math.round(Math.pow(tmp.b,1/2.2)*255);
      img.data[o+3]=255;}
    x.putImageData(img,0,0);
    this.tctx.imageSmoothingEnabled=true;
    this.tctx.drawImage(c,0,0,TEX_SIZE,TEX_SIZE);
  }
  texPath(pts,widthM,color,dash){ // 벡터 도로 스트로크
    const ctx=this.octx;
    ctx.save();
    ctx.strokeStyle=color;ctx.lineWidth=widthM*this.ppm;
    ctx.lineJoin="round";ctx.lineCap="round";
    if(dash)ctx.setLineDash(dash.map(d=>d*this.ppm));
    ctx.beginPath();
    for(let i=0;i<pts.length;i++){
      const[px,py]=this.tp(pts[i].x,pts[i].z);
      i?ctx.lineTo(px,py):ctx.moveTo(px,py);}
    ctx.stroke();ctx.restore();}
  texCircle(x,z,rM,color,lineM){ // 원 (채움 or 스트로크)
    const ctx=this.octx,[px,py]=this.tp(x,z);
    ctx.save();
    ctx.beginPath();ctx.arc(px,py,rM*this.ppm,0,7);
    if(lineM){ctx.strokeStyle=color;ctx.lineWidth=lineM*this.ppm;ctx.stroke();}
    else{ctx.fillStyle=color;ctx.fill();}
    ctx.restore();}
  pothole(x,z,r,depth){ // 움푹 파인 곳: 매끈한 원형 함몰(물리) + 어두운 자국(비주얼)
    this.world.addPothole(x,z,r,depth||.16);
    this.texCircle(x,z,r,"rgba(26,27,30,.82)");
    this.texCircle(x,z,r*.62,"rgba(10,11,13,.9)");
    this.texCircle(x,z,r,"rgba(60,62,68,.7)",.16);
    return this;}
  texRect(x,z,wM,dM,yaw,color){
    const ctx=this.octx,[px,py]=this.tp(x,z);
    ctx.save();ctx.translate(px,py);ctx.rotate(yaw||0);
    ctx.fillStyle=color;
    ctx.fillRect(-wM*this.ppm/2,-dM*this.ppm/2,wM*this.ppm,dM*this.ppm);
    ctx.restore();}
  texGrain(){ // 노면 질감 노이즈
    const ctx=this.tctx;
    let seed=97;const rnd=()=>{seed=(seed*48271)%2147483647;return seed/2147483647;};
    ctx.save();
    for(let k=0;k<26000;k++){
      const x=rnd()*TEX_SIZE,y=rnd()*TEX_SIZE,l=rnd();
      ctx.fillStyle=l<.5?"rgba(0,0,0,.05)":"rgba(255,255,255,.04)";
      ctx.fillRect(x,y,1+rnd()*2.5,1+rnd()*2.5);}
    ctx.restore();}
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
    this.texPath(pts,width,SURF_CSS[surfId]);
    if(lane)this.texPath(pts,.32,"rgba(242,246,252,.9)",[4.5,4.5]);
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
    const hs=opt.hScale||1;   // 세로(높이)만 늘리는 배율 — 넓이 그대로 건물만 더 높게
    for(let i=0;i<A.n;i++){
      const px=A.pos[i*3]*scale,py=A.pos[i*3+1]*scale*hs,pz=A.pos[i*3+2]*scale;
      this.mergePos.push(px*ca+pz*sa+x,py+y,-px*sa+pz*ca+z);
      const nx=A.nor[i*3],nz=A.nor[i*3+2];
      this.mergeNor.push(nx*ca+nz*sa,A.nor[i*3+1],-nx*sa+nz*ca);
      this.mergeCol.push(A.col[i*3],A.col[i*3+1],A.col[i*3+2]);}
    if(opt.collide){
      const bb=e.bb;
      const hw=(bb[3]-bb[0])/2*scale*(opt.shrink||1),hh=(bb[4]-bb[1])/2*scale*hs,hd=(bb[5]-bb[2])/2*scale*(opt.shrink||1);
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
  mover(x,y,z,w,h,d,color,opt,anim){ // 애니메이션 장애물(압착기 램 등): 병합하지 않는 독립 메시+OBB
    opt=opt||{};
    const obb=new OBB(x,y,z,w/2,h/2,d/2,opt.yaw||0,0,0,opt);
    this.world.boxes.push(obb);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
      new THREE.MeshLambertMaterial({color}));
    mesh.position.set(x,y,z);if(opt.yaw)mesh.rotation.y=opt.yaw;
    mesh.castShadow=mesh.receiveShadow=true;
    this.group.add(mesh);
    this.world.movers.push({obb,mesh,baseY:y,meshY:y,anim:anim||(()=>0)});
    return obb;}
  bump(x,z,yaw,width,h,type){ // 과속방지턱: 지형 높이에 매끈히 반영(뚝뚝 끊김 없음) + 매칭 비주얼
    h=h||.1;type=type||"arch";yaw=yaw||0;
    const hw=width/2, y0=this.world.height(x,z);   // 방지턱 추가 전 지면 높이(더블카운트 방지)
    const hd=type==="flat"?1.9:type==="sharp"?.72:type==="round"?1.35:1.6; // 프로파일 반폭(진행방향)
    if(type==="rumble"){        // 럼블 스트립: 낮은 리지 다수 → 진동
      const si=Math.sin(yaw),co=Math.cos(yaw);
      for(let k=-3;k<=3;k++){const off=k*.62,bx=x+si*off,bz=z-co*off;
        this.world.addBump(bx,bz,yaw,hw,.26,.05,"round");
        this._bumpStrip(bx,bz,yaw,y0,hw,.26,.05,"round",(k&1)?[.85,.6,.06]:[.85,.86,.88]);}
      return this;}
    this.world.addBump(x,z,yaw,hw,hd,h,type);
    this._bumpStrip(x,z,yaw,y0,hw,hd,h,type);
    return this;}
  _bumpStrip(x,z,yaw,y0,hw,hd,h,type,solid){ // 아치 프로파일과 정확히 일치하는 매끈한 비주얼 스트립
    const NU=3,NV=18,W=NU+1,pos=[],idx=[];
    for(let iv=0;iv<=NV;iv++){const lz=-hd+2*hd*iv/NV;
      for(let iu=0;iu<=NU;iu++){const lx=-hw+2*hw*iu/NU;
        pos.push(lx,h*bumpProfile(lz/hd,type)*bumpTaper(Math.abs(lx),hw),lz);}}
    for(let iv=0;iv<NV;iv++)for(let iu=0;iu<NU;iu++){
      const a=iv*W+iu,b=a+1,c=a+W,d=c+1;idx.push(a,c,b,b,c,d);}
    let g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.BufferAttribute(new Float32Array(pos),3));
    g.setIndex(idx);g.computeVertexNormals();g=g.toNonIndexed();
    const stripe=solid?()=>solid:(lx,ly,lz)=>
      (Math.abs(Math.floor((lx+lz*1.04+200)/.5))%2)?[.9,.68,.09]:[.82,.84,.87];
    this.pushGeo(g,x,y0,z,yaw,stripe);
    return this;}
  texText(x,z,sizeM,str,color,yaw){ // 노면 텍스트 마킹
    const ctx=this.octx,[px,py]=this.tp(x,z);
    ctx.save();ctx.translate(px,py);ctx.rotate(yaw||0);
    ctx.fillStyle=color||"rgba(240,244,250,.92)";
    ctx.font="700 "+Math.round(sizeM*this.ppm)+"px sans-serif";
    ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText(str,0,0);ctx.restore();}
  pushGeo(geo,x,y,z,yaw,colorFn){ // 임의 지오메트리 병합(버텍스별 색)
    geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0,yaw||0,0)));
    const p=geo.attributes.position.array,nr=geo.attributes.normal.array;
    for(let i=0;i<p.length;i+=3){
      const col=colorFn(p[i],p[i+1],p[i+2]);
      this.mergePos.push(p[i]+x,p[i+1]+y,p[i+2]+z);
      this.mergeNor.push(nr[i],nr[i+1],nr[i+2]);
      this.mergeCol.push(col[0],col[1],col[2]);}
    geo.dispose();}
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
    // 포트홀 자동 산재 — 아스팔트/차선 위, 스폰·장소 주변 제외 (모든 맵에 다수)
    if(this.noPotholes!==true){
      let sd=(w.size*7|0)+13,rr=()=>{sd=(sd*1103515245+12345)&0x7fffffff;return sd/0x7fffffff;};
      const avoid=[w.spawn,...(w.places||[])];
      const N=Math.round(w.size/22);
      for(let k=0;k<N;k++){
        const x=(rr()-.5)*w.size*.9,z=(rr()-.5)*w.size*.9,s=w.surf(x,z);
        if(s!==SURF_ID.asphalt&&s!==SURF_ID.lane&&s!==SURF_ID.curb)continue;
        if(avoid.some(a=>a&&Math.hypot(x-a.x,z-a.z)<22))continue;
        this.pothole(x,z,1.3+rr()*1.9,.1+rr()*.14);}}
    this.texBase();
    this.tctx.drawImage(this.overlay,0,0);
    this.texGrain();
    // ground mesh (고해상 캔버스 텍스처)
    const res=Math.min(w.res,192);
    const g=new THREE.PlaneGeometry(w.size,w.size,res,res);
    g.rotateX(-Math.PI/2);
    const pos=g.attributes.position;
    for(let vi=0;vi<pos.count;vi++)
      pos.setY(vi,w.baseHeight(pos.getX(vi),pos.getZ(vi)));
    g.computeVertexNormals();
    const gtex=new THREE.CanvasTexture(this.tex);
    gtex.colorSpace=THREE.SRGBColorSpace;
    gtex.anisotropy=4;
    const ground=new THREE.Mesh(g,new THREE.MeshLambertMaterial({map:gtex}));
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
// 지형을 따라가는 도로 y 설정 → 오르막/내리막(경사 완만화 스무딩 포함)
function followTerrain(w,pts){
  for(const p of pts)p.y=w.baseHeight(p.x,p.z);
  for(let s=0;s<4;s++)for(let i=1;i<pts.length-1;i++)pts[i].y=(pts[i-1].y+pts[i].y*2+pts[i+1].y)/4;
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
// 계곡 메우기: 도로 y-프로파일의 깊은 골(급강하→급상승)을 최대 경사 maxG로 완만화 —
// 골 바닥을 끌어올려 도로가 계곡을 넘어가는 완만한 둑 형태(차가 곤두박질치는 구덩이 제거).
function bridgeValleys(pts,maxG){
  const seg=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z)||1;
  for(let i=1;i<pts.length;i++){const m=maxG*seg(pts[i-1],pts[i]);if(pts[i].y<pts[i-1].y-m)pts[i].y=pts[i-1].y-m;}
  for(let i=pts.length-2;i>=0;i--){const m=maxG*seg(pts[i],pts[i+1]);if(pts[i].y<pts[i+1].y-m)pts[i].y=pts[i+1].y-m;}
  return pts;}
// 넓은 도로 절개(코리도어 정지작업): 좁은 paintPath flatten이 남기는 잔여 언덕/절벽을
// 제거 — 경로 폭 halfW를 목표 y로 평탄화 + blend 폭으로 지형에 부드럽게 접합.
function flattenCorridor(mb,pts,halfW,blend,getY){
  const w=mb.world;
  for(let k=0;k<pts.length-1;k++){
    const a=pts[k],b=pts[k+1];
    const len=Math.hypot(b.x-a.x,b.z-a.z),n=Math.max(1,Math.ceil(len/(w.cell*.5)));
    for(let s=0;s<=n;s++){
      const t=s/n,x=lerp(a.x,b.x,t),z=lerp(a.z,b.z,t),y=getY?getY(x,z):lerp(a.y,b.y,t);
      mb.stamp(x,z,halfW+blend,(i,j,d)=>{
        const idx=w.idx(i,j),f=clamp((d-halfW)/blend,0,1);
        w.hMap[idx]=lerp(y,w.hMap[idx],f*f);});}}
}
// 고가교(다리): 계곡/절벽 위로 도로를 띄워 연결. pts=[{x,y,z}] 데크 상면 높이(부드러운 경사).
// 데크 위를 주행(강체 상판) + 교각(기둥) + 양측 난간.
function bridgeDeck(mb,pts,width,opt){
  opt=opt||{};
  const w=mb.world,th=opt.thick||.55;
  const deckC=opt.deck||0x555b66,railC=opt.rail||0xc7ccd4,pillC=opt.pillar||0x6b727c;
  for(let k=0;k<pts.length-1;k++){
    const a=pts[k],b=pts[k+1];
    const dx=b.x-a.x,dz=b.z-a.z,dy=b.y-a.y;
    const hlen=Math.hypot(dx,dz)||1,len3=Math.hypot(hlen,dy);
    const yaw=Math.atan2(dx,dz),pitch=-Math.atan2(dy,hlen);
    const cx=(a.x+b.x)/2,cz=(a.z+b.z)/2,cy=(a.y+b.y)/2-th*.5;
    mb.box(cx,cy,cz,width,th,len3+.4,deckC,{yaw,pitch,mu:1,tag:"bridge"});   // 상판(주행면)
    const nx=dz/hlen,nz=-dx/hlen;
    for(const s of[-1,1])
      mb.box(cx+nx*s*(width/2),cy+th*.5+.5,cz+nz*s*(width/2),.22,1.0,len3+.4,railC,{yaw,pitch,mu:.4,bounce:.2,tag:"rail"});
    if(k%3===0){                                             // 교각
      const terr=w.height(cx,cz),top=cy-th*.5,ph=top-terr;
      if(ph>2.2)mb.box(cx,(top+terr)/2,cz,1.7,ph,1.7,pillC,{mu:.6,tag:"pillar"});}
  }
  return pts;
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
