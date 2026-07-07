/* ============================================================
   SoftLattice — BeamNG식 노드-빔 소프트바디 (코어스 PBD 격자)
   · 노드: 차체를 감싸는 5×4×9 격자 (프레임 노드는 강한 앵커)
   · 빔: 이웃+대각 거리 구속, 항복 변형률 초과 시 소성(영구) 변형
   · 메시 버텍스는 트라이리니어 가중치로 격자를 따라간다
   ============================================================ */
class SoftLattice{
  constructor(spec,meshes){
    const hx=spec.body.hx*1.04,hy=spec.body.hy*1.04,hz=spec.body.hz*1.04;
    const NX=6,NY=4,NZ=11;   // 더 촘촘한 격자 → 부분별 미세 변형(BeamNG식)
    this.NX=NX;this.NY=NY;this.NZ=NZ;
    this.min=[-hx,-hy,-hz];
    this.cell=[2*hx/(NX-1),2*hy/(NY-1),2*hz/(NZ-1)];
    const n=NX*NY*NZ;this.n=n;
    this.home=new Float32Array(n*3);
    this.pos=new Float32Array(n*3);
    this.prev=new Float32Array(n*3);
    this.anchor=new Float32Array(n);
    const idx=(i,j,k)=>(k*NY+j)*NX+i;
    this.idx=idx;
    for(let k=0;k<NZ;k++)for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){
      const a=idx(i,j,k)*3;
      this.home[a]=this.min[0]+i*this.cell[0];
      this.home[a+1]=this.min[1]+j*this.cell[1];
      this.home[a+2]=this.min[2]+k*this.cell[2];
      // 크럼플 존 모델: 앞/뒤 끝은 앵커 거의 0(변형이 소성 빔으로 영구 고정),
      // 가운데 승객셀만 앵커 강함(강체 유지) → 정면 충돌 시 아코디언 압축(복원·팽창 없음)
      const zt=NZ>1?k/(NZ-1):.5;                     // 0(앞)~1(뒤)
      const central=1-Math.min(1,Math.abs(zt-.5)/.30);
      const cell=.09*central*central;                // 승객셀 강성(가운데)
      const floor=(j===0)?.015:0;                    // 바닥 프레임 살짝
      this.anchor[idx(i,j,k)]=.001+cell+floor;}
    this.pos.set(this.home);this.prev.set(this.home);
    // beams
    const dirs=[[1,0,0],[0,1,0],[0,0,1],[1,1,0],[1,-1,0],[1,0,1],[1,0,-1],[0,1,1],[0,1,-1],[1,1,1],[1,-1,1]];
    const beams=[];
    for(let k=0;k<NZ;k++)for(let j=0;j<NY;j++)for(let i=0;i<NX;i++)
      for(const[dx,dy,dz]of dirs){
        const i2=i+dx,j2=j+dy,k2=k+dz;
        if(i2<0||i2>=NX||j2<0||j2>=NY||k2<0||k2>=NZ)continue;
        const a=idx(i,j,k),b=idx(i2,j2,k2);
        const r=Math.hypot(dx*this.cell[0],dy*this.cell[1],dz*this.cell[2]);
        beams.push(a,b,r,r);}       // a,b,rest,rest0
    this.beams=new Float32Array(beams);
    this.nb=beams.length/4;
    // mesh bindings
    this.binds=[];
    for(const m of meshes)if(m)this.bind(m);
    this.hot=0;this.dirty=false;
  }
  bind(mesh){
    const arr=mesh.geometry.attributes.position.array;
    const orig=arr.slice();
    const vc=arr.length/3;
    const bi=new Uint16Array(vc*8),bw=new Float32Array(vc*8);
    const[mx,my,mz]=this.min,[cx,cy,cz]=this.cell;
    for(let v=0;v<vc;v++){
      const x=arr[v*3]-mesh.position.x,y=arr[v*3+1]-mesh.position.y,z=arr[v*3+2]-mesh.position.z;
      let fx=clamp((x-mx)/cx,0,this.NX-1.001),fy=clamp((y-my)/cy,0,this.NY-1.001),fz=clamp((z-mz)/cz,0,this.NZ-1.001);
      const i=fx|0,j=fy|0,k=fz|0;fx-=i;fy-=j;fz-=k;
      let o=v*8,c=0;
      for(let dk=0;dk<2;dk++)for(let dj=0;dj<2;dj++)for(let di=0;di<2;di++){
        bi[o+c]=this.idx(i+di,j+dj,k+dk);
        bw[o+c]=(di?fx:1-fx)*(dj?fy:1-fy)*(dk?fz:1-fz);c++;}}
    this.binds.push({mesh,orig,bi,bw,vc});
  }
  impact(lp,ln,dv){
    // 국소·안정 크럼플: 접점 부근만 충격 방향(ln)으로 함몰. 누적으로 깊어짐.
    // 위로 튀는 성분은 크게 억제 → 앞뒤(아코디언) 압축 유지.
    const R=.6+.03*dv,d=Math.min(1.9,.0008*dv*dv+.014*dv);
    for(let i=0;i<this.n;i++){
      const a=i*3;
      const dx=this.pos[a]-lp.x,dy=this.pos[a+1]-lp.y,dz=this.pos[a+2]-lp.z;
      const dist=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(dist<R){
        const t=1-(dist/R)*(dist/R);
        const f=t*t*d;
        const uy=ln.y>0?ln.y*.25:ln.y*.7;   // 상방 성분 억제(위로 말림 방지)
        this.pos[a]+=ln.x*f;this.pos[a+1]+=uy*f;this.pos[a+2]+=ln.z*f;
        // 속도 주입 최소 (오버슈트→소성 인장→팽창 방지). 소성 빔이 함몰을 영구 고정.
        this.prev[a]-=ln.x*f*.12;this.prev[a+2]-=ln.z*f*.12;}}
    this.hot=Math.min(this.hot+.5+d*.4,2.4);this.dirty=true;
  }
  update(dt){
    if(this.hot<=0){if(this.dirty){this.write();this.dirty=false;}return false;}
    this.hot-=dt;
    const P=this.pos,Q=this.prev,H=this.home,B=this.beams,A=this.anchor;
    const damp=.9;
    for(let s=0;s<2;s++){
      // verlet + anchor
      for(let i=0;i<this.n;i++){
        const a=i*3;
        for(let c=0;c<3;c++){
          const v=(P[a+c]-Q[a+c])*damp;
          Q[a+c]=P[a+c];P[a+c]+=v;
          P[a+c]+=(H[a+c]-P[a+c])*A[i];}
        // 위로 말려 올라가는 노드 억제 → 크럼플은 앞뒤(아코디언)로 유지
        const yUp=P[a+1]-H[a+1];
        if(yUp>.28)P[a+1]-=(yUp-.28)*.5;}
      // beam constraints + plasticity
      for(let it=0;it<3;it++)
        for(let b=0;b<this.nb;b++){
          const o=b*4,ia=B[o]*3,ib=B[o+1]*3;
          const dx=P[ib]-P[ia],dy=P[ib+1]-P[ia+1],dz=P[ib+2]-P[ia+2];
          const len=Math.sqrt(dx*dx+dy*dy+dz*dz)||1e-6;
          const rest=B[o+2];
          const diff=(len-rest)/len*.5*.42;
          P[ia]+=dx*diff;P[ia+1]+=dy*diff;P[ia+2]+=dz*diff;
          P[ib]-=dx*diff;P[ib+1]-=dy*diff;P[ib+2]-=dz*diff;
          if(it===0){
            const rest0=B[o+3],strain=(len-rest)/rest0;
            if(Math.abs(strain)>.012){       // 항복 → 소성(영구) 변형: 압축은 깊게, 인장(늘어남)은 제한
              B[o+2]=clamp(rest+(len-rest)*.92,rest0*.05,rest0*1.2);}}}
    }
    this.write();
    return true;
  }
  write(){
    const P=this.pos,H=this.home;
    for(const bd of this.binds){
      const arr=bd.mesh.geometry.attributes.position.array;
      for(let v=0;v<bd.vc;v++){
        const o=v*8;let dx=0,dy=0,dz=0;
        for(let c=0;c<8;c++){
          const ni=bd.bi[o+c]*3,w=bd.bw[o+c];
          dx+=(P[ni]-H[ni])*w;dy+=(P[ni+1]-H[ni+1])*w;dz+=(P[ni+2]-H[ni+2])*w;}
        arr[v*3]=bd.orig[v*3]+dx;arr[v*3+1]=bd.orig[v*3+1]+dy;arr[v*3+2]=bd.orig[v*3+2]+dz;}
      bd.mesh.geometry.attributes.position.needsUpdate=true;
      bd.mesh.geometry.computeVertexNormals();}
  }
  totalDisp(){
    let s=0;
    for(let i=0;i<this.n*3;i+=3){
      const dx=this.pos[i]-this.home[i],dy=this.pos[i+1]-this.home[i+1],dz=this.pos[i+2]-this.home[i+2];
      s+=Math.sqrt(dx*dx+dy*dy+dz*dz);}
    return s;
  }
  reset(){
    this.pos.set(this.home);this.prev.set(this.home);
    for(let b=0;b<this.nb;b++)this.beams[b*4+2]=this.beams[b*4+3];
    for(const bd of this.binds){
      bd.mesh.geometry.attributes.position.array.set(bd.orig);
      bd.mesh.geometry.attributes.position.needsUpdate=true;
      bd.mesh.geometry.computeVertexNormals();}
    this.hot=0;this.dirty=false;
  }
}
