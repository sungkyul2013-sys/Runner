/* ============================================================
   SoftLattice — BeamNG식 노드-빔 소프트바디 (코어스 PBD 격자)
   · 노드: 차체를 감싸는 5×4×9 격자 (프레임 노드는 강한 앵커)
   · 빔: 이웃+대각 거리 구속, 항복 변형률 초과 시 소성(영구) 변형
   · 메시 버텍스는 트라이리니어 가중치로 격자를 따라간다
   ============================================================ */
class SoftLattice{
  constructor(spec,meshes){
    const hx=spec.body.hx*1.04,hy=spec.body.hy*1.04,hz=spec.body.hz*1.04;
    const NX=8,NY=5,NZ=15;   // 고해상 격자(600노드) → 부위별 미세 주름·뜯김
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
    // 노드별 재질 편차(찢김 재현): 같은 충격에도 노드마다 밀리는 양이 달라 면이 아닌 '뜯긴' 형태가 됨
    this.rag=new Float32Array(n);
    for(let i=0;i<n;i++){const s=Math.sin(i*127.1+13.7)*43758.5453;this.rag[i]=s-Math.floor(s);}
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
    const colAttr=mesh.geometry.attributes.color;
    this.binds.push({mesh,orig,bi,bw,vc,col:colAttr?colAttr.array.slice():null});
  }
  impact(lp,ln,dv){
    // 현실적 방향성 크럼플:
    //  (1) 국소 크럼플 — 충돌한 부위만 충격 방향으로 함몰(접점서 거리로 감쇠, 종이처럼 구겨짐).
    //  (2) 전역 프레임 충격 — 충격축을 따라 차 전체가 약하게 압축(뒷부분 프레임도 손상).
    // 모두 ln(충격 방향)에 따라 달라짐 → 정면/측면/후면/모서리 충돌이 각기 다르게 변형.
    // pos+prev 동시 이동(속도 0) + plast(영구 오프셋) → 스프링백 없음.
    const sev=Math.min(1,Math.max(0,(dv-6)/50));      // 0(범프)~1(초고속)
    if(dv<1.2&&sev<=0)return;
    let lx=ln.x,ly=ln.y,lz=ln.z;const il=1/(Math.hypot(lx,ly,lz)||1);lx*=il;ly*=il;lz*=il;
    const hx=-this.min[0],hy=-this.min[1],hz=-this.min[2];
    const axExt=Math.abs(lx)*hx+Math.abs(ly)*hy+Math.abs(lz)*hz||hz; // 충격축 반경
    // 이방성 국소 크럼플: 충격축(깊이) 방향으로 파고들되, 좌우(수평 직교)는 좁게 국소화
    // → 스몰오버랩은 부딪힌 쪽(왼쪽 코너)만 파이고, 수직은 바닥(언더바디)까지 도달.
    // 축 인지 물리: 충격축의 구조 깊이(axExt)가 변형 한계를 정한다.
    // 정면/후면(축≈차 길이)은 깊은 아코디언, 측면(축≈차 폭)은 도어 함몰까지만 —
    // 실차처럼 로커·루프레일이 차체를 지지해 옆에서 맞아도 차가 반으로 접히지 않음.
    const axFrac=axExt/hz;                             // 1=종방향, ~0.4=측면
    const depth=Math.min(.3+5.4*sev,axExt*.8);         // 함몰 깊이 ≤ 구조 깊이의 80%
    const RH=.55+.34*sev;                              // 수평 직교 반경(좁게 = 부딪힌 부위만)
    const RV=hy*2.3+.4;                                // 수직 반경(바닥·지붕까지)
    const crushLen=Math.min(.5+3.3*sev,axExt*1.1);     // 압축 전파 ≤ 구조 깊이
    const gFrac=Math.min(.34,sev*.4)*(.35+.65*axFrac); // 전역 굽음: 측면 충돌엔 크게 감소
    const s0=-axExt*1.05;
    const P=this.pos,Q=this.prev,PL=this.plast,HM=this.home,RG=this.rag;
    for(let i=0;i<this.n;i++){
      const a=i*3;
      const dx=P[a]-lp.x,dy=P[a+1]-lp.y,dz=P[a+2]-lp.z;
      const proj=dx*lx+dy*ly+dz*lz;                    // 충격축 방향(차 안쪽 +)
      const ex=dx-proj*lx,ey=dy-proj*ly,ez=dz-proj*lz; // 직교 성분
      const perpH=Math.hypot(ex,ez),perpV=Math.abs(ey);// 수평 직교 / 수직
      // (1) 국소 크럼플 — 노드별 재질 편차(rag)로 한 면이 아닌 뜯기고 찢긴 형태
      if(proj>-.65&&proj<crushLen&&perpH<RH&&perpV<RV){
        const wh=1-perpH/RH,wv=1-perpV/RV;
        const wl=proj<0?1:1-proj/crushLen;             // 접촉면서 최대 → 안쪽으로 감쇠
        const f=depth*wh*wh*wv*Math.max(0,wl)*(.55+.9*RG[i]);
        const uy=ly>0?ly*.3:ly*.72;                    // 위로 솟구침 억제
        // 포아송 팽출: 앞뒤로 눌린 재료가 위아래로 밀려남 → 프레임이 상하로 약간 늘어남
        const by=f*.22*(HM[a+1]>.02?1:HM[a+1]<-.02?-1:0)*(1-Math.abs(ly));
        P[a]+=lx*f;P[a+1]+=uy*f+by;P[a+2]+=lz*f;
        PL[a]+=lx*f;PL[a+1]+=uy*f+by;PL[a+2]+=lz*f;
        Q[a]+=lx*f;Q[a+1]+=uy*f+by;Q[a+2]+=lz*f;}
      // (2) 전역 프레임 충격: 충격축 따라 차 전체 약하게 압축(뒤 프레임도 굽음)
      if(gFrac>0){
        const s=-(P[a]*lx+P[a+1]*ly+P[a+2]*lz);
        if(s>s0){
          const mvs=gFrac*(s-s0)*.4;
          P[a]+=lx*mvs;P[a+1]+=ly*mvs;P[a+2]+=lz*mvs;
          PL[a]+=lx*mvs;PL[a+1]+=ly*mvs;PL[a+2]+=lz*mvs;
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
      for(let it=0;it<4;it++)
        for(let b=0;b<this.nb;b++){
          const o=b*4,ia=B[o]*3,ib=B[o+1]*3;
          const dx=P[ib]-P[ia],dy=P[ib+1]-P[ia+1],dz=P[ib+2]-P[ia+2];
          const len=Math.sqrt(dx*dx+dy*dy+dz*dz)||1e-6;
          if(it===0){                          // 소성 먼저: 붕괴된 현재 길이로 항복 → 재팽창 전에 영구 단축
            const rest0=B[o+3],rc=B[o+2],strain=(len-rc)/rest0;
            if(Math.abs(strain)>.014)           // 항복: 압축은 깊게(rest0*.05까지), 인장은 찢김 허용(1.4배까지 늘어남)
              B[o+2]=clamp(rc+(len-rc)*.92,rest0*.05,rest0*1.4);}
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
      const cAttr=bd.col?bd.mesh.geometry.attributes.color:null,cArr=cAttr?cAttr.array:null;
      for(let v=0;v<bd.vc;v++){
        const o=v*8;let dx=0,dy=0,dz=0;
        for(let c=0;c<8;c++){
          const ni=bd.bi[o+c]*3,w=bd.bw[o+c];
          dx+=(P[ni]-H[ni])*w;dy+=(P[ni+1]-H[ni+1])*w;dz+=(P[ni+2]-H[ni+2])*w;}
        arr[v*3]=bd.orig[v*3]+dx;arr[v*3+1]=bd.orig[v*3+1]+dy;arr[v*3+2]=bd.orig[v*3+2]+dz;
        if(cArr){ // 구겨진 부위 도장 크리즈(음영): 변형 깊이에 비례해 어두워짐
          const disp=Math.sqrt(dx*dx+dy*dy+dz*dz);
          const f=disp<.02?1:Math.max(.42,1-disp*.5);
          cArr[v*3]=bd.col[v*3]*f;cArr[v*3+1]=bd.col[v*3+1]*f;cArr[v*3+2]=bd.col[v*3+2]*f;}}
      bd.mesh.geometry.attributes.position.needsUpdate=true;
      if(cAttr)cAttr.needsUpdate=true;
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
      if(bd.col){bd.mesh.geometry.attributes.color.array.set(bd.col);
        bd.mesh.geometry.attributes.color.needsUpdate=true;}
      bd.mesh.geometry.computeVertexNormals();}
    this.hot=0;this.dirty=false;
  }
}
