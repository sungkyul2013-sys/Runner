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
  /* 예약 코리도어 예외 태그 — 고가 데크·교각·터널 구조는 대로를 가로질러도 유지 */
  static RESV_KEEP=/^(pillar|deck|parapet|bdeck|brail|bpil|bridge|portal|tunnelwall|slab|kerb)$/;
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
  /* ===== 🚦 예약 코리도어 — '쭉 직진' 보장 =====
     간선/대로의 중심선을 예약해 두면, 이후 어떤 지구 콘텐츠도 그 안의 '주행 높이'에는
     물체(물리+비주얼)를 놓을 수 없다. 사후 제거가 아니라 애초에 생성되지 않으므로
     투명한 건물이 남는 일도 없다. 고가·데크·교각처럼 머리 위/구조물은 예외로 통과. */
  reserve(pts,halfW){(this._resv=this._resv||[]).push({pts,halfW});return this;}
  resvNear(x,z,ext){
    if(!this._resvOn||!this._resv)return false;
    for(const r of this._resv){
      const pts=r.pts,hw=r.halfW+(ext||0);
      for(let k=0;k<pts.length-1;k++){
        const a=pts[k],b=pts[k+1],dx=b.x-a.x,dz=b.z-a.z,L2=dx*dx+dz*dz;
        let t=L2?((x-a.x)*dx+(z-a.z)*dz)/L2:0;t=t<0?0:t>1?1:t;
        if(Math.hypot(x-(a.x+dx*t),z-(a.z+dz*t))<=hw)return true;}}
    return false;}
  resvBlock(x,z,y,h,ext,tag){    // 주행 높이(지면+0.45 ~ +3.4)에 걸치면 배치 금지
    if(MapBuilder.RESV_KEEP.test(tag||""))return false;
    if(!this.resvNear(x,z,ext))return false;
    const gy=this.world.height(x,z);
    return (y+h*.5)>gy+.45&&(y-h*.5)<gy+3.4;}
  baked(name,x,z,scale,yaw,opt){ // 베이크 배경 모델 배치 (+선택 OBB)
    opt=opt||{};
    if(typeof BAKED==="undefined"||!BAKED[name])return;
    if(this._resvOn){
      const bb=BAKED[name].bb,hh=(bb[4]-bb[1])/2*scale*(opt.hScale||1);
      const by=(opt.y!==undefined?opt.y:this.world.height(x,z))+hh;
      if(this.resvBlock(x,z,by,hh*2,Math.max(bb[3]-bb[0],bb[5]-bb[2])*scale*.5,name))return;}
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
    if(this._resvOn&&this.resvBlock(x,z,y,h,Math.max(w,d)*.5,opt.tag))return null;
    const obb=new OBB(x,y,z,w/2,h/2,d/2,opt.yaw||0,opt.pitch||0,opt.roll||0,opt);
    this.world.boxes.push(obb);
    if(!opt.noVis)this.visBox(x,y,z,w,h,d,color,opt);
    return obb;}
  visBox(x,y,z,w,h,d,color,opt){
    opt=opt||{};
    if(this._resvOn&&this.resvBlock(x,z,y,h,Math.max(w,d)*.5,opt.tag))return;
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
    if(this._resvOn&&this.resvNear(x,z,2.5))return null;
    const w=this.world,y=w.height(x,z);
    const p=makeProp(type,x,y,z,yaw||0);
    w.props.push(p);return p;}
  /* 🚧 도로 위 방해물 자동 제거 — 노면 '내부'에 놓인 난간·조형물·수목 등을 일괄 삭제.
     맵 제작 중 실수로 도로를 가로막는 벽/난간이 생겨도 여기서 구조적으로 걸러진다.
     (설계상 노면에 있어야 하는 것들 — 콘·타이어월·주차차량·교각·터널벽 등 — 은 보존) */
  clearRoadObstacles(){
    const w=this.world,R=w.res,N=R+1,cell=w.cell,half=w.size*.5;
    const S=SURF_IDS;
    const paved=s=>{const n=S[s];return n==="asphalt"||n==="lane"||n==="curb";};
    // 소형 장식물 + 대형 구조물까지 — 도로 '내부'를 막고 있으면 무엇이든 제거한다.
    // (활주로/도로를 가로막던 터미널·격납고·창고 같은 큰 벽이 남아 주행이 끊기는 문제 방지)
    const REMOVE=/^(rail|railpost|railbar|tree|treesTall|plinth|statue|monument|planter|hedge|bench|parasol|boat|dock|barrel|beam|scaffold|lightlamp|lighthouse|boathouse|terminal|hangar|warehouse|tower|towercab|cranleg|cranbeam|stand|building|roofunit|tank|mast)$/;
    const kept=[];let removed=0;
    for(const b of w.boxes){
      const t=b.tag||"";
      if(!REMOVE.test(t)){kept.push(b);continue;}
      const gy=w.height(b.c.x,b.c.z),bot=b.c.y-b.half.y,top=b.c.y+b.half.y;
      if(bot>gy+1.6||top<gy+.12){kept.push(b);continue;}      // 공중/지하는 무관
      const gi=Math.round((b.c.x+half)/cell),gj=Math.round((b.c.z+half)/cell);
      if(gi<2||gj<2||gi>R-2||gj>R-2){kept.push(b);continue;}
      const at=(i,j)=>paved(w.sMap[w.idx(i,j)]);
      // 노면 '내부' 판정: 좌우·전후 2셀이 모두 포장 → 도로 한가운데(가장자리 난간은 보존)
      if(at(gi,gj)&&at(gi-2,gj)&&at(gi+2,gj)&&at(gi,gj-2)&&at(gi,gj+2)){removed++;continue;}
      kept.push(b);}
    if(removed){w.boxes.length=0;for(const b of kept)w.boxes.push(b);}
    return removed;}
  finalize(mapDef){
    const w=this.world;
    this.roadObstaclesRemoved=this.clearRoadObstacles();
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
    /* ── 지면·정적 지오메트리를 공간 청크로 쪼갠다 ──
       예전에는 지면 전체(≈7만 삼각형)와 병합 정적물 전체(≈19만 삼각형)가 각각
       '하나의 메시'라 바운딩이 맵 전체를 덮었다 → 프러스텀 컬링이 전혀 듣지 않아
       카메라가 어디를 보든 매 프레임 전량이, 그림자 패스에서 한 번 더 그려졌다.
       청크로 나누면 보이는 부분만 그려져 실제 삼각형 수가 크게 준다.
       (드로우콜은 조금 늘지만 청크 수는 수십 개 수준이라 훨씬 이득) */
    const res=Math.min(w.res,192);
    const gtex=new THREE.CanvasTexture(this.tex);
    gtex.colorSpace=THREE.SRGBColorSpace;
    gtex.anisotropy=4;
    const groundMat=new THREE.MeshLambertMaterial({map:gtex});
    const G=w.size>1600?7:(w.size>900?5:4);            // 지면 청크 분할 수
    const sub=Math.max(4,Math.round(res/G));
    const _gn=V3(0,1,0);
    for(let cj=0;cj<G;cj++)for(let ci=0;ci<G;ci++){
      const cs=w.size/G;
      const ox=-w.size*.5+cs*(ci+.5),oz=-w.size*.5+cs*(cj+.5);
      const g=new THREE.PlaneGeometry(cs,cs,sub,sub);
      g.rotateX(-Math.PI/2);
      const pos=g.attributes.position,uv=g.attributes.uv,nor=g.attributes.normal;
      for(let vi=0;vi<pos.count;vi++){
        const x=pos.getX(vi)+ox,z=pos.getZ(vi)+oz;
        pos.setX(vi,x);pos.setZ(vi,z);pos.setY(vi,w.baseHeight(x,z));
        // 법선은 하이트필드에서 해석적으로 — 청크 경계에서 음영이 어긋나지 않게
        w.normal(x,z,_gn);nor.setXYZ(vi,_gn.x,_gn.y,_gn.z);
        uv.setXY(vi,x/w.size+.5,1-(z/w.size+.5));}
      const m=new THREE.Mesh(g,groundMat);
      m.receiveShadow=true;
      this.group.add(m);}
    // merged static boxes — 삼각형 중심 좌표로 청크에 배분
    if(this.mergePos.length){
      const P=this.mergePos,N=this.mergeNor,C=this.mergeCol;
      const CH=Math.max(140,w.size/9),half=w.size*.5;
      const nC=Math.max(1,Math.ceil(w.size/CH));
      const buckets=new Map();
      for(let t=0;t<P.length;t+=9){
        const cx=(P[t]+P[t+3]+P[t+6])/3,cz=(P[t+2]+P[t+5]+P[t+8])/3;
        const i=clamp(Math.floor((cx+half)/CH),0,nC-1);
        const j=clamp(Math.floor((cz+half)/CH),0,nC-1);
        const k=j*nC+i;
        let b=buckets.get(k);
        if(!b){b={p:[],n:[],c:[]};buckets.set(k,b);}
        for(let q=0;q<9;q++){b.p.push(P[t+q]);b.n.push(N[t+q]);b.c.push(C[t+q]);}}
      const mmMat=new THREE.MeshLambertMaterial({vertexColors:true});   // 청크끼리 머티리얼 공유
      for(const b of buckets.values()){
        if(!b.p.length)continue;
        const mg=new THREE.BufferGeometry();
        mg.setAttribute("position",new THREE.Float32BufferAttribute(b.p,3));
        mg.setAttribute("normal",new THREE.Float32BufferAttribute(b.n,3));
        mg.setAttribute("color",new THREE.Float32BufferAttribute(b.c,3));
        const mm=new THREE.Mesh(mg,mmMat);
        mm.castShadow=true;mm.receiveShadow=true;
        this.group.add(mm);}}
    this.mergePos=this.mergeNor=this.mergeCol=null;
    buildPropInstances(w,this.group);   // 프롭을 타입별 InstancedMesh로 합쳐 드로우콜 최소화
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

/* ============================================================
   🏢 procBuilding — 실사 지향 절차 건물
   층별 창문 밴드 · 수직 멀리언 · 코니스 · 셋백 · 저층부 리테일 · 옥상 설비 · 야간 점등
   창문/디테일은 visBox(비충돌 시각 전용)로 병합 → 물리 비용 없이 밀도 높은 파사드
   ============================================================ */
function procBuilding(mb,x,z,W,D,H,seed,opt){
  opt=opt||{};
  if(mb._resvOn&&mb.resvNear(x,z,Math.max(W,D)*.5))return 0;   // 예약 코리도어(대로) 위에는 짓지 않는다
  let s=(seed|0)||1;const rr=()=>{s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff;};
  const FLOOR=3.6;                                   // 층고
  const floors=Math.max(2,Math.round(H/FLOOR));
  // 외장 팔레트(콘크리트·석재·유리 커튼월·브릭)
  const SKIN=[
    {wall:0x9aa1a8,trim:0xb8bfc6,glass:0x2a3946,lit:0xffe9a8},  // 라이트 콘크리트
    {wall:0x7d848c,trim:0x969ea6,glass:0x24313c,lit:0xffe2a0},  // 그레이 스톤
    {wall:0x8d5f4a,trim:0xa87a62,glass:0x28323c,lit:0xffdf9c},  // 브릭
    {wall:0x5d6b74,trim:0x77858e,glass:0x1e3b4a,lit:0xcfeaff},  // 다크 커튼월
    {wall:0xb0a894,trim:0xc7c0ae,glass:0x2b3742,lit:0xffe6ad}]; // 샌드스톤
  const K=SKIN[(rr()*SKIN.length)|0];
  const night=opt.night===true;
  const V=(w,h,d,c,px,py,pz)=>mb.visBox(px,py,pz,w,h,d,c,{});   // 시각 전용
  let cw=W,cd=D,cy=0,tier=0;
  const tiers=H>44?(rr()<.6?3:2):(H>26&&rr()<.5?2:1);           // 셋백 단수
  const perTier=floors/tiers;
  for(let t=0;t<tiers;t++){
    const fCount=Math.round(t===tiers-1?floors-Math.round(perTier)*t:perTier);
    const th=fCount*FLOOR;
    // 본체(충돌 있음) — 한 단당 하나의 OBB
    mb.box(x,cy+th/2,z,cw,th,cd,K.wall,{mu:.6,tag:"building"});
    const hw=cw/2,hd=cd/2;
    // 층별 창문 밴드(4면) + 상하 슬래브 라인
    for(let f=0;f<fCount;f++){
      const by=cy+f*FLOOR+FLOOR*.62;
      const retail=(t===0&&f===0);
      const gh=retail?FLOOR*.62:FLOOR*.46;
      const gc=retail?K.glass:( night&&rr()<.42 ? K.lit : K.glass);
      V(cw*.94,gh,.14,gc,x,by,z+hd+.02);   V(cw*.94,gh,.14,gc,x,by,z-hd-.02);
      V(.14,gh,cd*.94,gc,x+hw+.02,by,z);   V(.14,gh,cd*.94,gc,x-hw-.02,by,z);
      // 슬래브(층 구분선)
      const sy=cy+f*FLOOR+FLOOR-.06;
      V(cw+.24,.16,.10,K.trim,x,sy,z+hd+.03); V(cw+.24,.16,.10,K.trim,x,sy,z-hd-.03);
      V(.10,.16,cd+.24,K.trim,x+hw+.03,sy,z); V(.10,.16,cd+.24,K.trim,x-hw-.03,sy,z);}
    // 수직 멀리언(창문 사이 기둥) — 파사드 리듬
    const mn=Math.max(2,Math.round(cw/4.6));
    for(let m=1;m<mn;m++){
      const mx=x-hw+(cw/mn)*m;
      V(.20,th-.2,.12,K.trim,mx,cy+th/2,z+hd+.04);
      V(.20,th-.2,.12,K.trim,mx,cy+th/2,z-hd-.04);}
    const dn=Math.max(2,Math.round(cd/4.6));
    for(let m=1;m<dn;m++){
      const mz=z-hd+(cd/dn)*m;
      V(.12,th-.2,.20,K.trim,x+hw+.04,cy+th/2,mz);
      V(.12,th-.2,.20,K.trim,x-hw-.04,cy+th/2,mz);}
    // 코니스(각 단 상부 돌출)
    V(cw+1.0,.5,cd+1.0,K.trim,x,cy+th+.1,z);
    cy+=th;
    if(t<tiers-1){cw*=.74+rr()*.12;cd*=.74+rr()*.12;}
  }
  // 옥상 설비: 기계실 · 물탱크 · 안테나 · 파라펫
  const hw=cw/2;
  V(cw+.6,.9,cd+.6,K.trim,x,cy+.45,z);                          // 파라펫
  mb.box(x+(rr()-.5)*hw,cy+2.0,z+(rr()-.5)*hw,cw*.34,3.2,cd*.34,0x6b727c,{mu:.5,tag:"roofunit"});
  if(rr()<.55)mb.box(x-(rr()*hw*.6),cy+2.6,z+(rr()*hw*.6),cw*.2,4.2,cd*.2,0x8a7a5c,{mu:.5,tag:"tank"});
  if(rr()<.6)mb.box(x+(rr()-.5)*hw*.5,cy+7.5,z+(rr()-.5)*hw*.5,.45,12,.45,0x8a929c,{mu:.5,tag:"mast"});
  if(rr()<.35)for(let a=0;a<3;a++)                              // 옥상 냉각탑 열
    mb.box(x-cw*.25+a*cw*.25,cy+1.5,z-cd*.3,2.4,2.2,2.4,0x59606b,{mu:.5,tag:"roofunit"});
  return cy;   // 총 높이
}

/* ---------- props ---------- */
/* 프롭 정의 — 파트별 (지오메트리 · 색 · 로컬 오프셋).
   예전에는 프롭 하나가 THREE.Group + 메시 2~3개 + '각자의' 머티리얼이었다.
   메가시티에는 프롭이 93개라 그것만으로 메시 250여 개 · 드로우콜 200여 개가 됐고,
   그림자 패스까지 더하면 프레임마다 400~500 드로우콜이 나가 모바일에서 치명적이었다.
   → 파트별 InstancedMesh 하나로 합쳐 드로우콜을 타입×파트 수(10여 개)로 줄인다. */
const PROP_DEFS={
  cone:{r:.28,m:4,parts:[
    {geo:()=>new THREE.ConeGeometry(.22,.55,8),color:0xff7518,y:.28},
    {geo:()=>new THREE.BoxGeometry(.4,.05,.4),color:0xd85f10,y:.025}]},
  sign:{r:.35,m:14,parts:[
    {geo:()=>new THREE.CylinderGeometry(.04,.04,2.1,6),color:0x8a94a0,y:1.05},
    {geo:()=>new THREE.BoxGeometry(.62,.62,.04),color:0x2477ff,y:1.9}]},
  lamp:{r:.4,m:38,parts:[
    {geo:()=>new THREE.CylinderGeometry(.07,.09,4.6,6),color:0x5b6570,y:2.3},
    {geo:()=>new THREE.BoxGeometry(.12,.1,1.1),color:0x5b6570,y:4.5,z:.5},
    {geo:()=>new THREE.BoxGeometry(.2,.08,.4),color:0xfff2b8,y:4.42,z:.95,basic:true}]},
  bench:{r:.5,m:26,parts:[
    {geo:()=>new THREE.BoxGeometry(1.5,.08,.45),color:0x9a6b3f,y:.45},
    {geo:()=>new THREE.BoxGeometry(1.5,.4,.07),color:0x9a6b3f,y:.72,z:-.2},
    {geo:()=>new THREE.BoxGeometry(1.3,.42,.35),color:0x4a4f57,y:.22}]},
  barrel:{r:.35,m:20,parts:[
    {geo:()=>new THREE.CylinderGeometry(.32,.32,.9,10),color:0xd0662a,y:.45}]},
};
/* 프롭 인스턴싱 — 맵 빌드가 끝난 뒤 타입별로 InstancedMesh를 만든다 */
const _propM4=new THREE.Matrix4(),_propQ=new THREE.Quaternion(),
      _propE=new THREE.Euler(),_propS=new THREE.Vector3(1,1,1),_propP=new THREE.Vector3();
function buildPropInstances(world,group){
  const byType={};
  for(const p of world.props)(byType[p.type]=byType[p.type]||[]).push(p);
  world.propIM=[];
  for(const type in byType){
    const list=byType[type],def=PROP_DEFS[type];
    def.parts.forEach((pt,pi)=>{
      const mat=pt.basic
        ? new THREE.MeshBasicMaterial({color:pt.color,toneMapped:false})
        : new THREE.MeshLambertMaterial({color:pt.color});
      const im=new THREE.InstancedMesh(pt.geo(),mat,list.length);
      im.castShadow=!pt.basic;im.receiveShadow=false;
      im.frustumCulled=false;          // 프롭은 맵 전역에 흩어져 있어 하나의 경계상자로 컬링 불가
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(im);
      world.propIM.push(im);
      list.forEach((p,k)=>{
        (p.im=p.im||[]).push(im);(p.imi=p.imi||[]).push(k);
        (p.off=p.off||[]).push([pt.x||0,pt.y||0,pt.z||0]);});});
  }
  for(const p of world.props)writePropMatrix(p);
}
/* 프롭 하나의 현재 위치·자세를 인스턴스 행렬에 반영 */
function writePropMatrix(p){
  if(!p.im)return;
  for(let k=0;k<p.im.length;k++){
    const o=p.off[k];
    if(p.gone){_propS.set(0,0,0);_propP.set(0,-9999,0);_propQ.identity();}
    else{
      _propS.set(1,1,1);
      _propE.set(p.rot.x,p.rot.y,p.rot.z,"YXZ");
      _propQ.setFromEuler(_propE);
      _propP.set(o[0],o[1],o[2]).applyQuaternion(_propQ).add(p.pos);}
    _propM4.compose(_propP,_propQ,_propS);
    p.im[k].setMatrixAt(p.imi[k],_propM4);
    p.im[k].instanceMatrix.needsUpdate=true;}
}
function makeProp(type,x,y,z,yaw){
  const def=PROP_DEFS[type];
  return{type,def,pos:V3(x,y,z),rot:V3(0,yaw,0),
    home:{x,y,z,yaw},vel:V3(0,0,0),angVel:V3(0,0,0),awake:false,gone:false};}

/* prop vs vehicles — called from Vehicle.step */
function hitProps(veh){
  const props=veh.world.props,b=veh.body;
  for(let i=0;i<props.length;i++){
    const p=props[i];if(p.gone)continue;
    _t6.copy(p.pos);_t6.y+=.4;
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
    p.pos.addScaledVector(p.vel,dt);
    p.rot.x+=p.angVel.x*dt;p.rot.y+=p.angVel.y*dt;p.rot.z+=p.angVel.z*dt;
    const gy=world.height(p.pos.x,p.pos.z);
    if(p.pos.y<gy){
      p.pos.y=gy;
      if(p.vel.y<0)p.vel.y*=-.3;
      p.vel.x*=.82;p.vel.z*=.82;p.angVel.multiplyScalar(.8);
      if(p.vel.lengthSq()<.05){p.awake=false;}}
    if(p.pos.y<-40)p.gone=true;
    writePropMatrix(p);}
}
function resetProps(world){
  for(const p of world.props){
    p.gone=false;p.awake=false;p.vel.set(0,0,0);p.angVel.set(0,0,0);
    p.pos.set(p.home.x,p.home.y,p.home.z);
    p.rot.set(0,p.home.yaw,0);
    writePropMatrix(p);}
}
