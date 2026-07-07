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
    this.plast=new Float32Array(n*3);   // 소성(영구) 변형 오프셋: 앵커가 home+plast로 복원 → 찌그러진 형태 영구 유지
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
      const cell=.08*central*central;                // 승객셀 강성(가운데)
      const floor=(j===0)?.012:0;                    // 바닥 프레임 살짝
      this.anchor[idx(i,j,k)]=.03+cell+floor;}       // 기본 앵커 ↑ → 소성(plast) 목표 형태를 확실히 유지
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
    // 속도비례 크럼플: (1)접점 국소 함몰 + (2)충격축 아코디언 압축.
    // 저속(방지턱 dv≤5)=거의 무변형, 고속(200km/h dv≈55)=형체불명 압착.
    // 속도 주입 없이 pos+prev를 함께 이동 → 오버슈트/팽창(스파이럴) 방지. 소성 빔이 영구 고정.
    const sev=Math.min(1,Math.max(0,(dv-6)/50));      // 0(범프)~1(초고속)
    if(dv<1.2&&sev<=0)return;
    let lx=ln.x,ly=ln.y,lz=ln.z;const il=1/(Math.hypot(lx,ly,lz)||1);lx*=il;ly*=il;lz*=il;
    const hx=-this.min[0],hy=-this.min[1],hz=-this.min[2];
    const axExt=Math.abs(lx)*hx+Math.abs(ly)*hy+Math.abs(lz)*hz||hz; // 충격축 반경
    const R=.55+.85*sev+.02*dv;                        // 국소 함몰 반경
    const dish=.12+1.3*sev*sev;                        // 국소 함몰 깊이
    const frac=Math.min(.82,sev*.98);                  // 붕괴 비율(고속일수록 크게)
    const s0=axExt*(.55-.9*sev);                       // 고정 붕괴면(강체 승객셀). 고속일수록 안쪽까지
    const P=this.pos,Q=this.prev,PL=this.plast;
    for(let i=0;i<this.n;i++){
      const a=i*3;
      // (1) 접점 국소 함몰(영구)
      const dx=P[a]-lp.x,dy=P[a+1]-lp.y,dz=P[a+2]-lp.z;
      const dist=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(dist<R){
        const t=1-(dist/R)*(dist/R),f=t*t*dish;
        const uy=ly>0?ly*.25:ly*.7;
        P[a]+=lx*f;P[a+1]+=uy*f;P[a+2]+=lz*f;
        PL[a]+=lx*f;PL[a+1]+=uy*f;PL[a+2]+=lz*f;     // 소성 오프셋에 누적
        Q[a]-=lx*f*.1;Q[a+2]-=lz*f*.1;}
      // (2) 아코디언 붕괴: 충격을 받은 앞쪽 영역(s>s0)을 고정면 s0 쪽으로 접음(전체 이동 없음)
      if(sev>.04){
        const s=-(P[a]*lx+P[a+1]*ly+P[a+2]*lz);   // 충격 반대(진행/전방) 좌표
        if(s>s0){
          const mvs=frac*(s-s0);                   // s를 s0쪽으로 감소 → 앞부분이 뒤로 접힘
          P[a]+=lx*mvs;P[a+1]+=ly*mvs;P[a+2]+=lz*mvs;
          PL[a]+=lx*mvs;PL[a+1]+=ly*mvs;PL[a+2]+=lz*mvs; // 영구 오프셋 → 스프링백 없음
          Q[a]+=lx*mvs;Q[a+1]+=ly*mvs;Q[a+2]+=lz*mvs;}}
    }
    // 클램프: 소성 오프셋과 위치 모두 차체 박스 안으로(반복 압착 시 폭주·반전·바닥관통 방지)
    const H=this.home,mn=this.min,mg=.22,pg=.35;
    for(let i=0;i<this.n;i++){const a=i*3;
      PL[a]  =clamp(PL[a],  mn[0]-mg-H[a],  -mn[0]+mg-H[a]);
      PL[a+1]=clamp(PL[a+1],mn[1]-mg-H[a+1],-mn[1]+mg-H[a+1]);
      PL[a+2]=clamp(PL[a+2],mn[2]-mg-H[a+2],-mn[2]+mg-H[a+2]);
      P[a]  =clamp(P[a],  mn[0]-pg,-mn[0]+pg); Q[a]  =clamp(Q[a],  mn[0]-pg,-mn[0]+pg);
      P[a+1]=clamp(P[a+1],mn[1]-pg,-mn[1]+pg); Q[a+1]=clamp(Q[a+1],mn[1]-pg,-mn[1]+pg);
      P[a+2]=clamp(P[a+2],mn[2]-pg,-mn[2]+pg); Q[a+2]=clamp(Q[a+2],mn[2]-pg,-mn[2]+pg);}
    this.hot=Math.min(this.hot+.6+sev*1.6,3.4);this.dirty=true;
  }
  update(dt){
    if(this.hot<=0){if(this.dirty){this.write();this.dirty=false;}return false;}
    this.hot-=dt;
    const P=this.pos,Q=this.prev,H=this.home,B=this.beams,A=this.anchor,PL=this.plast;
    const damp=.9;
    for(let s=0;s<2;s++){
      // verlet + anchor(→ home+plast: 소성 변형된 형태로 복원 = 영구 크럼플)
      for(let i=0;i<this.n;i++){
        const a=i*3;
        for(let c=0;c<3;c++){
          const v=(P[a+c]-Q[a+c])*damp;
          Q[a+c]=P[a+c];P[a+c]+=v;
          P[a+c]+=(H[a+c]+PL[a+c]-P[a+c])*A[i];}
        // 위로 말려 올라가는 노드 억제 → 크럼플은 앞뒤(아코디언)로 유지
        const yUp=P[a+1]-H[a+1];
        if(yUp>.28)P[a+1]-=(yUp-.28)*.5;}
      // beam constraints + plasticity
      for(let it=0;it<3;it++)
        for(let b=0;b<this.nb;b++){
          const o=b*4,ia=B[o]*3,ib=B[o+1]*3;
          const dx=P[ib]-P[ia],dy=P[ib+1]-P[ia+1],dz=P[ib+2]-P[ia+2];
          const len=Math.sqrt(dx*dx+dy*dy+dz*dz)||1e-6;
          if(it===0){                          // 소성 먼저: 붕괴된 현재 길이로 항복 → 재팽창 전에 영구 단축
            const rest0=B[o+3],rc=B[o+2],strain=(len-rc)/rest0;
            if(Math.abs(strain)>.014)           // 항복: 압축은 깊게(rest0*.05까지), 인장은 제한(1.2배)
              B[o+2]=clamp(rc+(len-rc)*.92,rest0*.05,rest0*1.2);}
          const rest=B[o+2];
          const diff=(len-rest)/len*.5*.42;
          P[ia]+=dx*diff;P[ia+1]+=dy*diff;P[ia+2]+=dz*diff;
          P[ib]-=dx*diff;P[ib+1]-=dy*diff;P[ib+2]-=dz*diff;}
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
    this.pos.set(this.home);this.prev.set(this.home);this.plast.fill(0);
    for(let b=0;b<this.nb;b++)this.beams[b*4+2]=this.beams[b*4+3];
    for(const bd of this.binds){
      bd.mesh.geometry.attributes.position.array.set(bd.orig);
      bd.mesh.geometry.attributes.position.needsUpdate=true;
      bd.mesh.geometry.computeVertexNormals();}
    this.hot=0;this.dirty=false;
  }
}
