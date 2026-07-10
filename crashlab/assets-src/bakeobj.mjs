// OBJ → CRASH LAB baked (grid-cluster decimation, material-name colors, geometric wheel detect)
import{readFileSync,writeFileSync}from'fs';
const OBJ='/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad/mb_extract/uploads_files_2787791_Mercedes+Benz+GLS+580.obj';
const BAKEDJS='/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad/crashlab/src/15_baked.js';
const KEY='maybach';

// material → [linear rgb 0-255], isPaint(bit1), isGlass(bit2)
const MAT={
  Polar_White:{c:[232,232,236],paint:1},   // 차체 도색(리틴트)
  Color_M02:{c:[232,232,236],paint:1},      // 차체 2차(도색과 동일 취급)
  Interior:{c:[20,22,26],paint:0},          // 실내(어둡게)
  UnderCarriage:{c:[14,14,16],paint:0},     // 하부
};
const srgb2lin=v=>Math.round(Math.pow(v/255,2.2)*255);
for(const k in MAT)MAT[k].c=MAT[k].c.map(srgb2lin);

console.log('parsing OBJ...');
const data=readFileSync(OBJ,'utf8');
const V=[],N=[];
const tris=[];   // {a,b,c (vert idx), na,nb,nc, mat}
let curMat='Polar_White';
const lines=data.split('\n');
for(let li=0;li<lines.length;li++){
  const ln=lines[li];
  const c0=ln.charCodeAt(0);
  if(c0===118){ // 'v'
    const c1=ln.charCodeAt(1);
    if(c1===32){const p=ln.split(/\s+/);V.push(+p[1],+p[2],+p[3]);}
    else if(c1===110){const p=ln.split(/\s+/);N.push(+p[1],+p[2],+p[3]);}
  } else if(c0===117&&ln.startsWith('usemtl')){curMat=ln.slice(7).trim();}
  else if(c0===102&&ln.charCodeAt(1)===32){ // 'f '
    const p=ln.split(/\s+/);
    const idx=[],nidx=[];
    for(let i=1;i<p.length;i++){
      if(!p[i])continue;
      const s=p[i].split('/');
      let vi=+s[0];if(vi<0)vi=V.length/3+vi+1;idx.push(vi-1);
      let ni=s[2]?+s[2]:0;if(ni<0)ni=N.length/3+ni+1;nidx.push(ni-1);
    }
    // fan triangulate
    for(let i=1;i+1<idx.length;i++)
      tris.push({a:idx[0],b:idx[i],c:idx[i+1],na:nidx[0],nb:nidx[i],nc:nidx[i+1],mat:curMat});
  }
}
const nv=V.length/3;
console.log('verts',nv,'tris',tris.length);

// bbox + recenter (x,z center; y ground=0)
let bb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
for(let i=0;i<nv;i++){for(let a=0;a<3;a++){const v=V[i*3+a];if(v<bb[a])bb[a]=v;if(v>bb[3+a])bb[3+a]=v;}}
const cx=(bb[0]+bb[3])/2, cz=(bb[2]+bb[5])/2, y0=bb[1];
for(let i=0;i<nv;i++){V[i*3]-=cx;V[i*3+1]-=y0;V[i*3+2]-=cz;}
const H=bb[4]-bb[1], L=bb[5]-bb[2], W=bb[3]-bb[0];
console.log('dims WxHxL',W.toFixed(2),H.toFixed(2),L.toFixed(2));
// yaw180: 앞(+z)을 model -z 로 (파이프라인 플립과 일치 → 전진 방향에 그릴)
for(let i=0;i<nv;i++){V[i*3]=-V[i*3];V[i*3+2]=-V[i*3+2];}
for(let i=0;i<N.length/3;i++){N[i*3]=-N[i*3];N[i*3+2]=-N[i*3+2];}

// ---- wheel detection: 4-means on low-y verts ----
const lowIdx=[];
for(let i=0;i<nv;i++)if(V[i*3+1] < H*0.30)lowIdx.push(i);   // 하부 30%
let cen=[[W*0.35,L*0.30],[-W*0.35,L*0.30],[W*0.35,-L*0.30],[-W*0.35,-L*0.30]]; // x,z init corners
for(let it=0;it<12;it++){
  const sum=[[0,0,0],[0,0,0],[0,0,0],[0,0,0]];
  for(const i of lowIdx){
    const x=V[i*3],z=V[i*3+2];let best=0,bd=1e9;
    for(let k=0;k<4;k++){const dx=x-cen[k][0],dz=z-cen[k][1],d=dx*dx+dz*dz;if(d<bd){bd=d;best=k;}}
    sum[best][0]+=x;sum[best][1]+=z;sum[best][2]++;}
  for(let k=0;k<4;k++)if(sum[k][2]){cen[k]=[sum[k][0]/sum[k][2],sum[k][1]/sum[k][2]];}
}
// wheel radius: median low-y cluster vertical extent near each center → use bbox of nearest verts
let wr=0;
for(let k=0;k<4;k++){
  let ymax=0,cnt=0;
  for(const i of lowIdx){const dx=V[i*3]-cen[k][0],dz=V[i*3+2]-cen[k][1];
    if(dx*dx+dz*dz< (W*0.16)*(W*0.16)){if(V[i*3+1]>ymax)ymax=V[i*3+1];cnt++;}}
  wr=Math.max(wr,ymax*0.5);
}
wr=wr||H*0.18;
const wheels=cen.map(c=>[+c[0].toFixed(3), +(wr).toFixed(3), +c[1].toFixed(3)]);
console.log('wheels',JSON.stringify(wheels),'radius',wr.toFixed(3));

// ---- decimate via grid clustering, strip tire geometry ----
const CELL=0.055;  // 클러스터 셀(작을수록 고해상) — 실차 품질 우선
const gi=(x,y,z)=>((Math.round(x/CELL))+2048)*4194304 + ((Math.round(y/CELL))+2048)*2048 + (Math.round(z/CELL)+2048);
// representative per cell: accumulate
const cellMap=new Map();
function rep(vi,mat){
  const x=V[vi*3],y=V[vi*3+1],z=V[vi*3+2];
  const key=gi(x,y,z);
  let r=cellMap.get(key);
  if(!r){r={x:0,y:0,z:0,nx:0,ny:0,nz:0,n:0,mat};cellMap.set(key,r);}
  r.x+=x;r.y+=y;r.z+=z;r.n++;
  return key;
}
// is triangle inside a wheel (strip tires)
function inWheel(x,y,z){
  if(y>wr*1.9)return false;
  for(const c of cen){const dx=x-c[0],dz=z-c[2];if(dx*dx+dz*dz < (wr*0.98)*(wr*0.98))return true;}
  return false;
}
// first pass: assign cells + accumulate original normals (smooth shading)
// 얇은 패널(기둥/미러)에서 앞뒤 노멀이 상쇄돼 검게 되는 문제 방지: 반대편 면은 누적 제외
const rn=(k,ni)=>{const r=cellMap.get(k);
  const nx=N[ni*3]||0,ny=N[ni*3+1]||0,nz=N[ni*3+2]||0;
  if(r.nn>0&&(r.nx*nx+r.ny*ny+r.nz*nz)<0)return;   // 첫 면과 반대 방향 → 무시
  r.nx+=nx;r.ny+=ny;r.nz+=nz;r.nn=(r.nn||0)+1;};
const keptTris=[];
const triSeen=new Set();   // 동일 셀 조합 삼각형 중복 제거(오버드로 제거 → 셀 예산을 해상도에 사용)
for(const t of tris){
  const ax=V[t.a*3],ay=V[t.a*3+1],az=V[t.a*3+2];
  const bx=V[t.b*3],by=V[t.b*3+1],bz=V[t.b*3+2];
  const ccx=V[t.c*3],ccy=V[t.c*3+1],ccz=V[t.c*3+2];
  const mx=(ax+bx+ccx)/3,my=(ay+by+ccy)/3,mz=(az+bz+ccz)/3;
  if(inWheel(mx,my,mz))continue;   // 타이어 제거 → 절차 휠 사용
  const ka=rep(t.a,t.mat),kb=rep(t.b,t.mat),kc=rep(t.c,t.mat);
  if(ka===kb||kb===kc||ka===kc)continue;   // 붕괴 삼각형 제거
  rn(ka,t.na);rn(kb,t.nb);rn(kc,t.nc);      // 원본 노멀 누적 → 스무스
  const sk=[ka,kb,kc].sort().join(',')+'|'+t.mat;
  if(triSeen.has(sk))continue;
  triSeen.add(sk);
  keptTris.push([ka,kb,kc,t.mat]);
}
// finalize cell centroids + smooth normals
for(const r of cellMap.values()){r.x/=r.n;r.y/=r.n;r.z/=r.n;
  const l=Math.hypot(r.nx,r.ny,r.nz)||1;r.nx/=l;r.ny/=l;r.nz/=l;}
console.log('cells',cellMap.size,'kept tris',keptTris.length);

// build soup (non-indexed): 스무스 노멀 (셀 평균) → 매끈한 실차 표면
const pos=[],nrm=[],col=[],mask=[];
// 헤드라이트/테일램프: 전후 끝단 외측 밴드의 비도색 셀을 램프 색으로 (재질 분리가 없는 OBJ 보완)
let lampN=0;
const HEAD=[236,233,206].map(srgb2lin),TAIL=[172,26,26].map(srgb2lin);
const lampCol=(r,mat)=>{   // 모델 원좌표는 전면=-z (인게임에서 yaw 플립)
  const ax=Math.abs(r.x);
  // 헤드라이트: 전면 코너 밴드(도색 재질 포함 — 램프 하우징이 차체 재질로 지정된 모델)
  if(r.z<-2.52&&r.y>.78&&r.y<1.14&&ax>.46&&ax<1.04)return HEAD;
  if(mat==='Polar_White'||mat==='Color_M02')return null;
  if(r.z>2.42&&r.y>.68&&r.y<1.3&&ax>.38)return TAIL;
  return null;};
for(const[ka,kb,kc,mat] of keptTris){
  const ra=cellMap.get(ka),rb=cellMap.get(kb),rc=cellMap.get(kc);
  const m=MAT[mat]||MAT.Interior;
  for(const r of[ra,rb,rc]){
    const lc=lampCol(r,mat)||m.c;
    if(lc!==m.c)lampN++;
    pos.push(r.x,r.y,r.z);nrm.push(r.nx,r.ny,r.nz);col.push(lc[0],lc[1],lc[2]);
    mask.push(lc===m.c?m.paint:0);}   // 램프 셀은 도색 마스크 해제(리틴트로 덮어써지지 않게)
}
console.log('soup verts',pos.length/3,'lamp verts',lampN);

// ---- quantize (matches Assets decoder) ----
function quantize(pos,nrm,col,mask){
  const n=pos.length/3;let bb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
  for(let i=0;i<n;i++)for(let a=0;a<3;a++){const v=pos[i*3+a];if(v<bb[a])bb[a]=v;if(v>bb[3+a])bb[3+a]=v;}
  const P=new Int16Array(n*3),Nr=new Int8Array(n*3),C=new Uint8Array(n*3),M=new Uint8Array(n);
  for(let i=0;i<n;i++){for(let a=0;a<3;a++){const s=(bb[3+a]-bb[a])||1;
    P[i*3+a]=Math.round((pos[i*3+a]-bb[a])/s*32767);
    Nr[i*3+a]=Math.round(Math.max(-1,Math.min(1,nrm[i*3+a]))*127);
    C[i*3+a]=col[i*3+a];}M[i]=mask[i];}
  const b64=ta=>Buffer.from(ta.buffer,ta.byteOffset,ta.byteLength).toString('base64');
  const out={v:n,bb:bb.map(v=>+v.toFixed(4)),p:b64(P),n:b64(Nr),c:b64(C)};
  if(mask.some(x=>x))out.m=b64(M);
  return out;
}
const entry=quantize(pos,nrm,col,mask);
// paint source (warm/white cluster mean) for luminance retint
{let sr=0,sg=0,sb=0,cN=0;for(let i=0;i<mask.length;i++)if(mask[i]&1){sr+=col[i*3];sg+=col[i*3+1];sb+=col[i*3+2];cN++;}
 if(cN)entry.paintSrc=[Math.round(sr/cN),Math.round(sg/cN),Math.round(sb/cN)];}
// wheel bb (radius source) — synthetic from wr
entry.wheel={v:0,bb:[-wr,0,-wr,wr,2*wr,wr]};
entry.wheels=wheels.sort((a,b)=>(a[2]-b[2])||(a[0]-b[0]));

// ---- merge into 15_baked.js ----
let js=readFileSync(BAKEDJS,'utf8');
const j0=js.indexOf('{'), j1=js.lastIndexOf('}');
const B=JSON.parse(js.slice(j0,j1+1));
// ---- decimate an existing baked entry (grid cluster) to shrink size ----
function b64ta(str,T){const bin=Buffer.from(str,'base64');return new T(bin.buffer,bin.byteOffset,bin.byteLength/T.BYTES_PER_ELEMENT);}
function decimateEntry(e,cell){
  const n=e.v,bb=e.bb;
  const P=b64ta(e.p,Int16Array),Nr=b64ta(e.n,Int8Array),C=b64ta(e.c,Uint8Array),M=e.m?b64ta(e.m,Uint8Array):null;
  const pos=new Float32Array(n*3);
  for(let i=0;i<n;i++)for(let a=0;a<3;a++)pos[i*3+a]=bb[a]+P[i*3+a]/32767*(bb[3+a]-bb[a]);
  const cellMap=new Map();
  const gi=(x,y,z)=>((Math.round(x/cell))+2048)*4194304+((Math.round(y/cell))+2048)*2048+(Math.round(z/cell)+2048);
  for(let i=0;i<n;i++){const k=gi(pos[i*3],pos[i*3+1],pos[i*3+2]);let r=cellMap.get(k);if(!r){r={x:0,y:0,z:0,ci:i,n:0};cellMap.set(k,r);}r.x+=pos[i*3];r.y+=pos[i*3+1];r.z+=pos[i*3+2];r.n++;}
  for(const r of cellMap.values()){r.x/=r.n;r.y/=r.n;r.z/=r.n;}
  const op=[],on=[],oc=[],om=[];
  for(let t=0;t<n/3;t++){
    const a=t*3,b=t*3+1,c=t*3+2;
    const ka=gi(pos[a*3],pos[a*3+1],pos[a*3+2]),kb=gi(pos[b*3],pos[b*3+1],pos[b*3+2]),kc=gi(pos[c*3],pos[c*3+1],pos[c*3+2]);
    if(ka===kb||kb===kc||ka===kc)continue;
    for(const[vk,vi] of [[ka,a],[kb,b],[kc,c]]){const r=cellMap.get(vk);
      op.push(r.x,r.y,r.z);on.push(Nr[vi*3]/127,Nr[vi*3+1]/127,Nr[vi*3+2]/127);oc.push(C[vi*3],C[vi*3+1],C[vi*3+2]);om.push(M?M[vi]:0);}}
  // recompute face normals for the clustered tris
  for(let t=0;t<op.length/9;t++){const o=t*9;
    const ux=op[o+3]-op[o],uy=op[o+4]-op[o+1],uz=op[o+5]-op[o+2],vx=op[o+6]-op[o],vy=op[o+7]-op[o+1],vz=op[o+8]-op[o+2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
    for(let j=0;j<3;j++){on[o+j*3]=nx;on[o+j*3+1]=ny;on[o+j*3+2]=nz;}}
  const q=quantize(op,on,oc,om);
  q.wheel=e.wheel;q.wheels=e.wheels;if(e.paintSrc)q.paintSrc=e.paintSrc;
  return q;
}
B[KEY]=entry;
// RR 데시메이션 제거(사용자 요청: 경량화 금지)
let outjs='/* Baked CC0 3D assets — Kenney + Range Rover + Mercedes GLS(OBJ) */\n';
outjs+='const BAKED='+JSON.stringify(B)+';\n';
writeFileSync(BAKEDJS,outjs);
console.log('written. entry v:',entry.v,'bb:',entry.bb.map(v=>+v.toFixed(2)),'file KB:',(outjs.length/1024|0));
