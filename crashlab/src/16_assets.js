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
    const n=e.v,bb=e.bb;
    const pos=new Float32Array(n*3),nor=new Float32Array(n*3),col=new Float32Array(n*3);
    for(let i=0;i<n;i++)for(let a=0;a<3;a++){
      pos[i*3+a]=bb[a]+P[i*3+a]/32767*(bb[3+a]-bb[a]);
      nor[i*3+a]=N[i*3+a]/127;
      col[i*3+a]=C[i*3+a]/255;}
    // dominant paint color (리틴트 기준) — mask bit1=paint, bit2=glass
    let dom=null;
    if(M){const cnt={};
      for(let i=0;i<n;i++)if(M[i]&1){const k=C[i*3]+","+C[i*3+1]+","+C[i*3+2];cnt[k]=(cnt[k]||0)+1;}
      let mx=0;for(const k in cnt)if(cnt[k]>mx){mx=cnt[k];dom=k.split(",").map(Number);}}
    e._arr={pos,nor,col,M,dom,n};
    return e._arr;}
  /* geometry: flip(+scale) → 게임 좌표(+z 전방), optional paint retint */
  function geo(e,opt){ // opt:{scale, sy(y-squash), cx,cy,cz(model-space center), paint:THREE.Color}
    opt=opt||{};
    const s=opt.scale||1,sy=(opt.sy||1)*s,A=arrays(e);
    const pos=new Float32Array(A.pos),nor=new Float32Array(A.nor),col=new Float32Array(A.col);
    const cx=opt.cx||0,cy=opt.cy||0,cz=opt.cz||0;
    // 팔레트 텍스처 차량: 따뜻한 도색 클러스터를 휘도 보존하며 리틴트
    const ps=e.paintSrc,pr=opt.paint;
    const psLum=ps?(ps[0]+ps[1]+ps[2])/3/255:1;
    for(let i=0;i<A.n;i++){
      pos[i*3]  =-(A.pos[i*3]-cx)*s;   // rotate 180° about Y + scale
      pos[i*3+1]= (A.pos[i*3+1]-cy)*sy;
      pos[i*3+2]=-(A.pos[i*3+2]-cz)*s;
      nor[i*3]=-A.nor[i*3];nor[i*3+2]=-A.nor[i*3+2];
      if(pr&&A.M&&(A.M[i]&1)){
        const r=A.col[i*3],g=A.col[i*3+1],b=A.col[i*3+2];
        if(ps){ // 휘도보존: 따뜻한(유채색·r≥b) 도색만 타깃색으로 · 검정 클래딩/광택 트림 보존
          const chroma=Math.max(r,g,b)-Math.min(r,g,b);
          if(chroma>=.02&&r>=b-.006){
            const f=clamp(((r+g+b)/3)/(psLum||1),.32,1.9);
            col[i*3]=clamp(pr.r*f,0,1);col[i*3+1]=clamp(pr.g*f,0,1);col[i*3+2]=clamp(pr.b*f,0,1);}
        }else if(A.dom&&
           Math.abs(r*255-A.dom[0])<8&&Math.abs(g*255-A.dom[1])<8&&Math.abs(b*255-A.dom[2])<8){
          col[i*3]=pr.r;col[i*3+1]=pr.g;col[i*3+2]=pr.b;}}}
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.BufferAttribute(pos,3));
    g.setAttribute("normal",new THREE.BufferAttribute(nor,3));
    g.setAttribute("color",new THREE.BufferAttribute(col,3));
    return g;}
  /* 차체/유리/램프 분리 — 삼각형 단위 분류 (bit1 도색, bit2 유리, bit4 램프) */
  function geoSplit(e,opt){
    const full=geo(e,opt),A=arrays(e);
    if(!A.M)return{main:full,glass:null,lamps:null};
    const P=full.attributes.position.array,N=full.attributes.normal.array,C=full.attributes.color.array;
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
  spec.wheels.y=(w[0][1]-spec.modelCy)*s*sq+spec.susp.rest-drop;
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
