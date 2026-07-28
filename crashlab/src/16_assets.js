/* ============================================================
   Assets — baked CC0 model decoder (BAKED → BufferGeometry)
   차량: 도색 마스크 리틴트, 모델 기준으로 물리 스펙 보정
   ============================================================ */
const Assets=(()=>{
  const cache={};
  function b64ta(s,T){
    const bin=atob(s),u8=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
    return new T(u8.buffer);}
  /* entry → arrays (dequantized, model space) */
  function arrays(e){
    if(e._arr)return e._arr;
    const P=b64ta(e.p,Int16Array),N=b64ta(e.n,Int8Array),C=b64ta(e.c,Uint8Array);
    const M=e.m?b64ta(e.m,Uint8Array):null;
    /* 인덱스 메시(i) 지원 — 정점을 용접해 인덱스로 저장하면 같은 용량에 삼각형을
       2배 이상 담을 수 있어 판(패널)이 매끈하게 유지된다. 소프트바디가 스키닝할
       정점 수도 줄어 충돌 프레임까지 가벼워진다. */
    const idx=e.i?b64ta(e.i,e.i16?Uint16Array:Uint32Array):null;
    const n=e.v,bb=e.bb;
    const pos=new Float32Array(n*3),nor=new Float32Array(n*3),col=new Float32Array(n*3);
    for(let i=0;i<n;i++)for(let a=0;a<3;a++){
      pos[i*3+a]=bb[a]+P[i*3+a]/32767*(bb[3+a]-bb[a]);
      nor[i*3+a]=N[i*3+a]/127;
      col[i*3+a]=C[i*3+a]/255;}
    /* dominant paint color (리틴트 기준) — mask bit1=paint, bit2=glass
       ⚠ 단순 최다 색으로 뽑으면 안 된다. 스캔 모델은 겉 패널보다 안쪽 셸(도어 잼·엔진룸·
       하부)의 정점이 더 많은 경우가 흔해서, 최다 색이 '실내 검정'으로 잡히고 정작 겉면
       도색은 리틴트에서 빠진다(롤스로이스: 겉면 104,104,104 이 그대로 회색으로 남았다).
       그래서 '바깥 껍질다움'으로 가중해 최다 색을 고른다:
         · 법선이 바디 중심에서 바깥을 향할수록(코사인) 가중 ↑
         · 중심에서 멀수록(정규화 반경) 가중 ↑ */
    let dom=null;
    if(M){
      const cx0=(bb[0]+bb[3])/2,cy0=(bb[1]+bb[4])/2,cz0=(bb[2]+bb[5])/2;
      const ex=(bb[3]-bb[0])/2||1,ey=(bb[4]-bb[1])/2||1,ez=(bb[5]-bb[2])/2||1;
      const cnt={};
      for(let i=0;i<n;i++){
        if(!(M[i]&1))continue;
        const dx=(pos[i*3]-cx0)/ex,dy=(pos[i*3+1]-cy0)/ey,dz=(pos[i*3+2]-cz0)/ez;
        const r=Math.sqrt(dx*dx+dy*dy+dz*dz);
        let w=1;
        if(r>1e-4){
          const cs=(nor[i*3]*dx+nor[i*3+1]*dy+nor[i*3+2]*dz)/r;   // 바깥을 보는가
          w=Math.max(0,cs)*Math.min(1,r)*Math.min(1,r);}
        if(w<=0)continue;
        const k=C[i*3]+","+C[i*3+1]+","+C[i*3+2];
        cnt[k]=(cnt[k]||0)+w;}
      let mx=0;for(const k in cnt)if(cnt[k]>mx){mx=cnt[k];dom=k.split(",").map(Number);}
      /* 겉면 판정이 전부 걸러진 이상 케이스 → 옛 방식으로 폴백 */
      if(!dom){const c2={};
        for(let i=0;i<n;i++)if(M[i]&1){const k=C[i*3]+","+C[i*3+1]+","+C[i*3+2];c2[k]=(c2[k]||0)+1;}
        let m2=0;for(const k in c2)if(c2[k]>m2){m2=c2[k];dom=k.split(",").map(Number);}}}
    e._arr={pos,nor,col,M,dom,n,idx};
    return e._arr;}
  /* geometry: flip(+scale) → 게임 좌표(+z 전방), optional paint retint */
  function geo(e,opt){ // opt:{scale, sy(y-squash), cx,cy,cz(model-space center), paint:THREE.Color}
    opt=opt||{};
    const s=opt.scale||1,sy=(opt.sy||1)*s,A=arrays(e);
    const pos=new Float32Array(A.pos),nor=new Float32Array(A.nor),col=new Float32Array(A.col);
    const cx=opt.cx||0,cy=opt.cy||0,cz=opt.cz||0;
    /* 팔레트 텍스처 차량: 따뜻한 도색 클러스터를 휘도 보존하며 리틴트.
       paintSrc 가 없는 베이크(롤스로이스 등)는 '겉껍질 최다색' dom 을 기준색으로 써서
       같은 경로를 태운다 — 예전 '정확히 일치하는 정점만 교체' 방식은 겉면 도색이 두 개
       이상의 머티리얼로 쪼개진 모델에서 절반만 색이 바뀌는 문제가 있었다. */
    const ps=e.paintSrc||A.dom,pr=opt.paint;
    const psLum=ps?(ps[0]+ps[1]+ps[2])/3/255:1;
    // 원본 도색의 정규화 색조(밝기 1로 정규화) — 색조 비교 기준
    const psN=ps?[(ps[0]/255)/(psLum||1),(ps[1]/255)/(psLum||1),(ps[2]/255)/(psLum||1)]:[1,1,1];
    for(let i=0;i<A.n;i++){
      pos[i*3]  =-(A.pos[i*3]-cx)*s;   // rotate 180° about Y + scale
      pos[i*3+1]= (A.pos[i*3+1]-cy)*sy;
      pos[i*3+2]=-(A.pos[i*3+2]-cz)*s;
      nor[i*3]=-A.nor[i*3];nor[i*3+2]=-A.nor[i*3+2];
      if(pr&&A.M&&(A.M[i]&1)){
        const r=A.col[i*3],g=A.col[i*3+1],b=A.col[i*3+2];
        if(ps){
          /* 휘도보존 리틴트 — '정규화 색조'가 원본 도색과 비슷한 정점만 타깃색으로 바꾸고
             밝기(하이라이트·음영)는 그대로 살린다.
             예전에는 chroma>=0.02 조건을 썼는데, 실버·흰색처럼 무채색에 가까운 원본 도장
             (마이바흐 236,237,240 / 포르쉐 210,214,220)은 이 조건에 걸려 색이 아예
             바뀌지 않았다. 색조 유사도로 판정하면 무채색 도장도 정상 인식된다. */
          const lum=(r+g+b)/3;
          if(lum>.012){
            const nr=r/lum,ng=g/lum,nb=b/lum;
            const dh=Math.abs(nr-psN[0])+Math.abs(ng-psN[1])+Math.abs(nb-psN[2]);
            if(dh<.30){
              const f=clamp(lum/(psLum||1),.32,1.9);
              col[i*3]=clamp(pr.r*f,0,1);col[i*3+1]=clamp(pr.g*f,0,1);col[i*3+2]=clamp(pr.b*f,0,1);}}
        }else if(A.dom&&
           Math.abs(r*255-A.dom[0])<8&&Math.abs(g*255-A.dom[1])<8&&Math.abs(b*255-A.dom[2])<8){
          col[i*3]=pr.r;col[i*3+1]=pr.g;col[i*3+2]=pr.b;}}}
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.BufferAttribute(pos,3));
    g.setAttribute("normal",new THREE.BufferAttribute(nor,3));
    g.setAttribute("color",new THREE.BufferAttribute(col,3));
    if(A.idx)g.setIndex(new THREE.BufferAttribute(A.idx.slice(),1));
    return g;}
  /* 차체/유리/램프 분리 — 삼각형 단위 분류 (bit1 도색, bit2 유리, bit4 램프) */
  function geoSplit(e,opt){
    const A=arrays(e);
    if(!A.M)return{main:geo(e,opt),glass:null,lamps:null};
    const full=geo(e,opt);
    const P=full.attributes.position.array,N=full.attributes.normal.array,C=full.attributes.color.array;
    if(A.idx){
      /* 인덱스 메시: 삼각형을 그룹(차체/유리/램프)으로 나누고, 그룹별로 쓰인 정점만
         추려 다시 인덱싱한다 → 인덱스 이점을 유지하면서 분리도 된다. */
      const tri=A.idx.length/3,gm=[],gg=[],gl=[];
      for(let t=0;t<tri;t++){
        const a=A.idx[t*3],b=A.idx[t*3+1],c=A.idx[t*3+2];
        const mb=(A.M[a]|A.M[b]|A.M[c]);
        const d=(mb&4)?gl:(mb&2)?gg:gm;
        d.push(a,b,c);}
      const mk=(list)=>{
        if(!list.length)return null;
        const map=new Map(),vp=[],vn=[],vc=[],ii=[];
        for(let k=0;k<list.length;k++){
          const vi=list[k];
          let m2=map.get(vi);
          if(m2===undefined){m2=vp.length/3;map.set(vi,m2);
            vp.push(P[vi*3],P[vi*3+1],P[vi*3+2]);
            vn.push(N[vi*3],N[vi*3+1],N[vi*3+2]);
            vc.push(C[vi*3],C[vi*3+1],C[vi*3+2]);}
          ii.push(m2);}
        const g2=new THREE.BufferGeometry();
        g2.setAttribute("position",new THREE.Float32BufferAttribute(vp,3));
        g2.setAttribute("normal",new THREE.Float32BufferAttribute(vn,3));
        g2.setAttribute("color",new THREE.Float32BufferAttribute(vc,3));
        g2.setIndex(ii);
        return g2;};
      const r={main:mk(gm),glass:mk(gg),lamps:mk(gl)};
      full.dispose();
      return r;}
    const mp=[],mn=[],mc=[],gp=[],gn=[],gc=[],lp=[],ln=[],lc=[];
    for(let t=0;t<A.n/3;t++){
      const mb=(A.M[t*3]|A.M[t*3+1]|A.M[t*3+2]);
      const[dp,dn,dc]=(mb&4)?[lp,ln,lc]:(mb&2)?[gp,gn,gc]:[mp,mn,mc];
      for(let k=t*9;k<t*9+9;k++){dp.push(P[k]);dn.push(N[k]);dc.push(C[k]);}}
    full.dispose();
    const mk=(p,n2,c)=>{
      if(!p.length)return null;
      const g2=new THREE.BufferGeometry();
      g2.setAttribute("position",new THREE.Float32BufferAttribute(p,3));
      g2.setAttribute("normal",new THREE.Float32BufferAttribute(n2,3));
      g2.setAttribute("color",new THREE.Float32BufferAttribute(c,3));
      return g2;};
    return{main:mk(mp,mn,mc),glass:mk(gp,gn,gc),lamps:mk(lp,ln,lc)};}
  /* scenery geometry (no flip needed but flip is harmless & keeps one path) */
  function scenery(name,scale){
    const key=name+"@"+scale;
    if(!cache[key])cache[key]=geo(BAKED[name],{scale});
    return cache[key];}
  return{geo,geoSplit,scenery,arrays};
})();

/* 모델 기준 물리 스펙 보정 — CARS 로드 시 1회 */
function applyModelSpec(spec){
  const e=BAKED[spec.model];if(!e)return;
  const bb=e.bb;
  const len=bb[5]-bb[2],wid=bb[3]-bb[0],hgt=bb[4]-bb[1];
  const s=spec.body.hz*2/len;
  const sq=spec.squashY||1;                 // 차체 비례 보정(스포츠카 낮게)
  spec.modelScale=s;
  spec.body.hx=wid/2*s;
  spec.body.hy=hgt/2*s*sq;
  // com: 모델 높이 40% 지점 (전복 안정성)
  spec.modelCy=bb[1]+hgt*.42;
  spec.modelCx=(bb[0]+bb[3])/2;spec.modelCz=(bb[2]+bb[5])/2;
  // wheels (model: front=-z → flip) — 실제 차 비율로 타이어 축소(0.8×)
  const w=e.wheels;
  // 실측 모델은 휠베이스 중심을 CoM으로 (스페어타이어/루프백으로 bbox 중심이 치우침 보정)
  if(spec.comFromWheels&&w.length){
    let sx=0,sz=0;for(const p of w){sx+=p[0];sz+=p[2];}
    spec.modelCx=sx/w.length;spec.modelCz=sz/w.length;}
  const oldR=spec.wheels.radius;
  const wrFull=(e.wheel.bb[4]-e.wheel.bb[1])/2*s;
  let wr=spec.realWheels?wrFull:wrFull*.8;   // 실측 휠은 축소 없이 실제 반경
  if(spec.wheelRadMul)wr*=spec.wheelRadMul;  // 타이어 반경 미세 조정(펜더 뚫림 방지)
  const drop=wrFull-wr;                     // 휠 축소분만큼 마운트 하향 → 지상고 유지
  const fw=w.filter(p=>p[2]<spec.modelCz),rw=w.filter(p=>p[2]>=spec.modelCz);
  spec.wheels.radius=wr;
  spec.wheels.width=(e.wheel.bb[3]-e.wheel.bb[0])*s*.92*(spec.wheelWidMul||1);
  spec.wheels.trackVis=Math.abs(w[0][0])*s;
  spec.wheels.track=Math.abs(w[0][0])*s*(spec.rollFix||1.25);   // 물리 트랙 보정
  if(spec.wheelOutset){                       // 휠 스페이서: 시각·물리 트랙 모두 바깥으로 (와이드 스탠스)
    spec.wheels.trackVis+=spec.wheelOutset;
    spec.wheels.track+=spec.wheelOutset;}
  if(spec.wheelTuck)spec.wheels.trackVis-=spec.wheelTuck;  // 시각 트랙만 안으로(펜더 밖 돌출 방지)
  spec.wheels.front=Math.abs((fw[0]?fw[0][2]:-len*.35)-spec.modelCz)*s;
  spec.wheels.rear=Math.abs((rw[0]?rw[0][2]:len*.35)-spec.modelCz)*s;
  /* 휠베이스 미세 조정 — 스캔 모델의 휠 중심이 아치 중심과 어긋날 때 앞/뒤로 당긴다.
     (+)면 바깥쪽(앞바퀴는 더 앞, 뒷바퀴는 더 뒤), (-)면 안쪽으로 들어온다. */
  if(spec.wheelFrontAdj)spec.wheels.front+=spec.wheelFrontAdj;
  if(spec.wheelRearAdj)spec.wheels.rear+=spec.wheelRearAdj;
  spec.wheels.y=(w[0][1]-spec.modelCy)*s*sq+spec.susp.rest-drop;
  /* 정하중 처짐 보정(옵트인) — 스캔 모델은 '설계 차고'로 만들어져 있는데,
     휠 마운트를 모델 휠 위치+rest에 두면 정지 시 스프링이 눌린 만큼(compEq)
     차체가 그만큼 더 낮게 앉아 로커·언더바디가 지면을 파고든다.
     rideFix를 켜면 그 처짐량(+rideLift)만큼 마운트를 내려 설계 차고를 맞춘다. */
  if(spec.rideFix){
    const compEq=spec.mass*9.81/(4*spec.susp.k);
    spec.wheels.y-=compEq+(spec.rideLift||0);}
  spec.engine.maxT*=wr/oldR;                                     // 휠 반경 변화 보상
  // 실측(큰) 휠은 기어가 상대적으로 길어져 RPM이 낮게 걸림 → 최종감속비를
  // 휠 반경에 맞춰 짧게 보정 (변속이 정상 작동, 가속 펀치 확보)
  if(spec.realWheels)spec.final*=clamp(wr/.28,1,2.2);
  spec.modelWheelY=(w[0][1]-spec.modelCy)*s*sq-drop;
  // 실측 휠 차량: 충돌 박스 바닥이 타이어 바닥까지 내려가 차대가 지면에 닿아
  // 휠 접지 하중이 사라지고 주행 불가가 되는 문제 방지 → 휠 지지 평형에서
  // 차대(박스 바닥)가 지면 위 clr 만큼 뜨도록 hy 상한. (지상고 확보)
  if(spec.realWheels){
    const compEq=spec.mass*9.81/(4*spec.susp.k);                 // 정하중 스프링 압축량
    const maxRay=spec.susp.rest+spec.wheels.radius;
    const yEq=maxRay-compEq-spec.wheels.y;                       // 휠로 지지될 때 CoM 높이
    const clr=spec.groundClear!==undefined?spec.groundClear:.16; // 목표 지상고(m)
    spec.body.hy=Math.min(spec.body.hy,Math.max(.35,yEq-clr));
  }
}
