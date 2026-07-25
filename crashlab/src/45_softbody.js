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
    /* 빔 데이터는 종류별 타입배열로 분리한다 —
       하나의 Float32Array에 인덱스까지 섞어 담으면 배열 첨자로 쓸 때마다 float→int 변환이
       끼어들어 솔버 내부 루프가 크게 느려진다(충돌 프레임의 남은 스파이크 원인). */
    const nb=beams.length/4;
    this.nb=nb;
    this.bA=new Int32Array(nb);this.bB=new Int32Array(nb);
    this.bRest=new Float32Array(nb);this.bR0=new Float32Array(nb);
    for(let b=0;b<nb;b++){
      this.bA[b]=beams[b*4]*3;this.bB[b]=beams[b*4+1]*3;   // 미리 *3 해 둔 성분 오프셋
      this.bRest[b]=beams[b*4+2];this.bR0[b]=beams[b*4+3];}
    // 빔 파열(tearing): 인장 변형률이 한계를 넘으면 끊어져 구속 해제 → 판금이 '찢어져' 벌어짐
    this.bbrk=new Uint8Array(this.nb);
    this.torn=0;
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
  /* 정점 스키닝 준비 —
     ① 8본 트라이리니어 가중치 중 무시할 만한 것(<2%)을 버리고 CSR로 압축해 재정규화.
        스캔 차체는 정점당 실제 유효 본이 4~5개라 연산량이 40% 이상 줄어든다.
     ② 정점이 많은 메시는 프레임마다 연속 구간(스트라이프) 하나씩만 갱신한다.
        총 작업량은 같지만 한 프레임에 몰리지 않아 '충돌 순간 뚝' 끊기는 스파이크가 사라진다. */
  ensureFast(bd){
    if(bd.wi)return;
    const vc=bd.vc,bi=bd.bi,bw=bd.bw;
    const wo=new Int32Array(vc+1);
    for(let v=0;v<vc;v++){
      const o=v*8;let c2=0;
      for(let c=0;c<8;c++)if(bw[o+c]>.02)c2++;
      wo[v+1]=c2||1;}
    for(let v=0;v<vc;v++)wo[v+1]+=wo[v];
    const tot=wo[vc],wi=new Int32Array(tot),ww=new Float32Array(tot);
    for(let v=0;v<vc;v++){
      const o=v*8;let p=wo[v],sum=0;
      for(let c=0;c<8;c++)if(bw[o+c]>.02){wi[p]=bi[o+c]*3;ww[p]=bw[o+c];sum+=bw[o+c];p++;}
      if(p===wo[v]){                        // 전부 미미하면 최대 가중치 본 하나로
        let best=0,bv=-1;
        for(let c=0;c<8;c++)if(bw[o+c]>bv){bv=bw[o+c];best=c;}
        wi[p]=bi[o+best]*3;ww[p]=1;sum=1;p++;}
      if(sum>0&&Math.abs(sum-1)>1e-6){const inv=1/sum;for(let q=wo[v];q<p;q++)ww[q]*=inv;}}
    bd.wi=wi;bd.ww=ww;bd.wo=wo;
    bd.big=vc>20000;
    bd.flat=!!(bd.mesh.material&&bd.mesh.material.flatShading);
    bd.stripes=clamp(Math.round(vc/16000),1,8);
    bd.sp=0;bd.cyc=0;}
  impact(lp,ln,dv){
    // 현실적 방향성 크럼플:
    //  (1) 국소 크럼플 — 충돌한 부위만 충격 방향으로 함몰(접점서 거리로 감쇠, 종이처럼 구겨짐).
    //  (2) 전역 프레임 충격 — 충격축을 따라 차 전체가 약하게 압축(뒷부분 프레임도 손상).
    // 모두 ln(충격 방향)에 따라 달라짐 → 정면/측면/후면/모서리 충돌이 각기 다르게 변형.
    // pos+prev 동시 이동(속도 0) + plast(영구 오프셋) → 스프링백 없음.
    const sev=Math.min(1,Math.max(0,(dv-6)/64));      // 0(범프)~1(300km/h급) — 충격량은 속도 제곱
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
    // 위에서 내리누르는 충격(전복 착지·낙하물·폴 위 구름): 루프는 필러가 꺾이며 깊게 주저앉음
    const topHit=ly<-.3;
    const depth=Math.min(.3+5.4*sev,axExt*(topHit?1.4:.92)); // 함몰 깊이 ≤ 구조 깊이(루프는 벨트라인까지 허용)
    const RH=.55+.34*sev;                              // 수평 직교 반경(좁게 = 부딪힌 부위만)
    const RV=hy*2.3+.4;                                // 수직 반경(바닥·지붕까지)
    const crushLen=Math.min(.5+3.3*sev,axExt*1.1);     // 압축 전파 ≤ 구조 깊이
    const gFrac=Math.min(.4,sev*sev*.34+sev*.2)*(.48+.52*axFrac); // 전역 프레임 손상: 속도 제곱 성분(고속일수록 전체가 굽음)
    const micro=Math.min(.05,Math.max(0,dv-5)*.0011); // 전신 미세 소성: 모든 부품·프레임이 충돌 가속도에 비례해 약간씩 틀어짐
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
      // (3) 전신 미세 소성: 재질 편차(rag)로 노드마다 다르게 → 프레임 전체가 가속도에 비례해 미세하게 뒤틀림
      if(micro>0){
        const mj=micro*(.35+.65*RG[i]);
        P[a]+=lx*mj;P[a+1]+=ly*mj*.5;P[a+2]+=lz*mj;
        PL[a]+=lx*mj;PL[a+1]+=ly*mj*.5;PL[a+2]+=lz*mj;
        Q[a]+=lx*mj;Q[a+1]+=ly*mj*.5;Q[a+2]+=lz*mj;}
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
      PL[a+1]=clamp(PL[a+1],mn[1]-.06-H[a+1],-mn[1]+mg-H[a+1]);
      PL[a+2]=clamp(PL[a+2],mn[2]-mg-H[a+2],-mn[2]+mg-H[a+2]);
      P[a]  =clamp(P[a],  mn[0]-pg,-mn[0]+pg); Q[a]  =clamp(Q[a],  mn[0]-pg,-mn[0]+pg);
      P[a+1]=clamp(P[a+1],mn[1]-.07,-mn[1]+pg); Q[a+1]=clamp(Q[a+1],mn[1]-.07,-mn[1]+pg); // 아래로는 7cm까지만(범퍼가 바닥 밑으로 안 들어감)
      P[a+2]=clamp(P[a+2],mn[2]-pg,-mn[2]+pg); Q[a+2]=clamp(Q[a+2],mn[2]-pg,-mn[2]+pg);}
    this.hot=Math.min(this.hot+.6+sev*1.6,3.4);this.dirty=true;
  }
  update(dt){
    if(this.hot<=0){
      /* 충돌 종료 시 최종 확정 기록 — 위치 반영과 법선 재계산을 두 프레임으로 나눈다.
         정점이 많은 메시(9만 삼각형대)는 둘을 한 프레임에 하면 70ms대 스파이크가 난다. */
      if(this.dirty){this.write(true,true);this.dirty=false;this._needN=true;return false;}
      if(this._needN){this._needN=false;
        for(const bd of this.binds){this.ensureFast(bd);
          if(!bd.flat)bd.mesh.geometry.computeVertexNormals();}}
      return false;}
    this.hot-=dt;
    const P=this.pos,Q=this.prev,H=this.home,A=this.anchor,PL=this.plast,BK=this.bbrk;
    const bA=this.bA,bB=this.bB,bRest=this.bRest,bR0=this.bR0,nb=this.nb;
    const damp=.9;
    // 솔버 품질: 설정(물리 품질) + 충격 세기에 따라 적응 — 강한 크래시일 때 더 정밀하게 수렴
    const QL=(typeof Settings!=="undefined"&&Settings.softQuality)||"normal";
    /* 솔버 품질은 설정값만으로 결정한다 — 프레임 시간에 따라 자동으로 낮추면
       같은 충돌인데도 기기·순간에 따라 변형 결과가 달라지므로 쓰지 않는다.
       부드러움은 '메시 반영을 스트라이프로 분산'해서 확보한다(결과는 그대로). */
    const subs=QL==="high"?3:QL==="low"?1:2;
    const iters=QL==="high"?6:QL==="low"?3:4;
    for(let s=0;s<subs;s++){
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
      /* beam constraints + plasticity + tearing
         소성·파열 판정은 첫 반복에서만 필요하므로 루프를 분리한다
         (핫 루프에서 분기를 빼 반복당 비용을 줄인다 — 결과는 동일). */
      for(let b=0;b<nb;b++){
        if(BK[b])continue;                     // 끊어진 빔: 구속 없음(판금 찢김)
        const ia=bA[b],ib=bB[b];
        const dx=P[ib]-P[ia],dy=P[ib+1]-P[ia+1],dz=P[ib+2]-P[ia+2];
        const len=Math.sqrt(dx*dx+dy*dy+dz*dz)||1e-6;
        const rest0=bR0[b],rc=bRest[b],strain=(len-rc)/rest0;
        // 파열: 인장이 한계(90%)를 넘으면 용접부가 뜯김 → 이후 구속 해제
        if(strain>.9){BK[b]=1;this.torn++;continue;}
        if(Math.abs(strain)>.014)              // 항복: 압축은 깊게, 인장은 찢김 허용(1.4배까지)
          bRest[b]=clamp(rc+(len-rc)*.92,rest0*.05,rest0*1.4);
        const rest=bRest[b];
        const diff=(len-rest)/len*.5*.42;
        P[ia]+=dx*diff;P[ia+1]+=dy*diff;P[ia+2]+=dz*diff;
        P[ib]-=dx*diff;P[ib+1]-=dy*diff;P[ib+2]-=dz*diff;}
      for(let it=1;it<iters;it++)
        for(let b=0;b<nb;b++){
          if(BK[b])continue;
          const ia=bA[b],ib=bB[b];
          const dx=P[ib]-P[ia],dy=P[ib+1]-P[ia+1],dz=P[ib+2]-P[ia+2];
          const len=Math.sqrt(dx*dx+dy*dy+dz*dz)||1e-6;
          const diff=(len-bRest[b])/len*.5*.42;
          P[ia]+=dx*diff;P[ia+1]+=dy*diff;P[ia+2]+=dz*diff;
          P[ib]-=dx*diff;P[ib+1]-=dy*diff;P[ib+2]-=dz*diff;}
    }
    /* 메시 반영: 매 프레임 스트라이프 하나씩 → 총 작업량은 같고 프레임당 부하는 균일.
       단, 격자가 사실상 안 움직인 프레임은 통째로 건너뛴다 —
       슬로모션에서는 프레임당 변형량이 극히 작아 다시 써도 화면상 차이가 없으므로,
       이 판정만으로 슬로모션 충돌의 메시 갱신 부하가 크게 줄어든다. */
    this._wr=(this._wr||0)+1;
    const skip=(typeof PERF!=="undefined"&&PERF.meshSkip)?1:0;
    if((!skip||(this._wr&1)===0)&&this.movedSinceWrite()>4e-4)
      this.write((this._wr&3)!==1);
    this.dirty=true;   // hot 종료 시 마지막 상태 확정 기록
    return true;
  }
  /* 마지막으로 메시에 쓴 격자 상태와 현재 상태의 최대 차이(m) */
  movedSinceWrite(){
    const P=this.pos,n3=this.n*3;
    let W=this._wsnap;
    if(!W){W=this._wsnap=new Float32Array(n3);W.set(P);return 1;}
    let m=0;
    for(let i=0;i<n3;i++){const d=P[i]-W[i],a=d<0?-d:d;if(a>m)m=a;}
    if(m>4e-4)W.set(P);
    return m;}
  write(skipNormals,full){
    const P=this.pos,H=this.home;
    for(const bd of this.binds){
      this.ensureFast(bd);
      const pAttr=bd.mesh.geometry.attributes.position,arr=pAttr.array;
      const cAttr=bd.col?bd.mesh.geometry.attributes.color:null,cArr=cAttr?cAttr.array:null;
      const wi=bd.wi,ww=bd.ww,wo=bd.wo,orig=bd.orig,col=bd.col;
      // 스트라이프 = 연속 구간이라 시간이 섞이는 경계가 삼각형 1개뿐(육안으로 보이지 않음)
      const K=full?1:bd.stripes;
      const chunk=Math.ceil(bd.vc/K);
      const v0=full?0:bd.sp*chunk, v1=full?bd.vc:Math.min(bd.vc,v0+chunk);
      /* 도장 크리즈(색) 갱신은 위치보다 훨씬 느리게 변하므로 한 사이클 걸러 한 번만.
         업로드 대역폭이 절반으로 준다(모바일에서 이게 프레임을 잡아먹는다). */
      const doCol=!!cArr&&(full||(bd.cyc&1)===0);
      if(!full&&bd.sp===0)bd.cyc++;
      for(let v=v0;v<v1;v++){
        let dx=0,dy=0,dz=0;
        for(let q=wo[v],qe=wo[v+1];q<qe;q++){
          const ni=wi[q],w=ww[q];
          dx+=(P[ni]-H[ni])*w;dy+=(P[ni+1]-H[ni+1])*w;dz+=(P[ni+2]-H[ni+2])*w;}
        const v3=v*3;
        arr[v3]=orig[v3]+dx;arr[v3+1]=orig[v3+1]+dy;arr[v3+2]=orig[v3+2]+dz;
        if(doCol){ // 구겨진 부위 도장 크리즈(음영): 변형 깊이에 비례해 어두워짐
          const d2=dx*dx+dy*dy+dz*dz;
          const f=d2<4e-4?1:Math.max(.42,1-Math.sqrt(d2)*.5);   // 안 구겨진 정점은 sqrt 생략
          cArr[v3]=col[v3]*f;cArr[v3+1]=col[v3+1]*f;cArr[v3+2]=col[v3+2]*f;}}
      /* ★ 바뀐 구간만 GPU로 올린다.
         updateRange를 지정하지 않으면 three는 정점 버퍼 '전체'를 매번 다시 올린다.
         스캔 차체(정점 12만)는 위치+색 전체가 약 2.9MB라, 프레임마다 이걸 통째로 올리면
         모바일에서는 그 자체로 프레임이 무너진다(실측 평균 1.5MB/프레임, 최대 3.0MB). */
      if(full){pAttr.updateRange.offset=0;pAttr.updateRange.count=-1;}
      else{pAttr.updateRange.offset=v0*3;pAttr.updateRange.count=(v1-v0)*3;}
      pAttr.needsUpdate=true;
      if(doCol){
        if(full){cAttr.updateRange.offset=0;cAttr.updateRange.count=-1;}
        else{cAttr.updateRange.offset=v0*3;cAttr.updateRange.count=(v1-v0)*3;}
        cAttr.needsUpdate=true;}
      if(!full)bd.sp=(bd.sp+1)%K;
      /* 법선 재계산은 정말 필요할 때만.
         · 플랫 셰이딩 메시는 셰이더가 면 법선을 미분으로 구하므로 정점 법선을 쓰지 않는다.
         · 정점이 아주 많은 스캔 차체는 충돌 중에는 미루고 충돌이 끝난 뒤 한 번만 갱신한다. */
      if(skipNormals||bd.flat)continue;
      if(bd.big&&this.hot>0&&!full)continue;
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
    this.bbrk.fill(0);this.torn=0;
    this.bRest.set(this.bR0);
    if(this._wsnap)this._wsnap.set(this.pos);
    for(const bd of this.binds){
      const pa=bd.mesh.geometry.attributes.position;
      pa.array.set(bd.orig);pa.updateRange.offset=0;pa.updateRange.count=-1;pa.needsUpdate=true;
      if(bd.col){const ca=bd.mesh.geometry.attributes.color;
        ca.array.set(bd.col);ca.updateRange.offset=0;ca.updateRange.count=-1;ca.needsUpdate=true;}
      this.ensureFast(bd);
      if(!bd.flat)bd.mesh.geometry.computeVertexNormals();}
    this.hot=0;this.dirty=false;
  }
}
