/* GLS(마이바흐) 고해상 인덱스 베이크
   기존 bakeobj.mjs의 파이프라인을 그대로 쓰되 두 가지가 다르다.
     ① CELL을 인자로 받아 해상도를 크게 올린다
     ② 결과를 '인덱스 메시'로 낸다 — 기존 수프는 삼각형마다 정점 3개를 복제해
        같은 형상에 정점이 3배 들었다. 인덱싱하면 같은 용량으로 삼각형을 훨씬 많이 담는다.
   사용: node tools_mbhi.mjs <CELL> [--write] */
import{readFileSync,writeFileSync}from'fs';
const SP='/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad';
const OBJ=SP+'/mb2/uploads_files_2787791_Mercedes+Benz+GLS+580.obj';
const BAKEDJS=SP+'/crashlab/src/15_baked.js';
const KEY='maybach';
const CELL=+(process.argv[2]||0.055);
const WRITE=process.argv.includes('--write');

const MAT={
  Polar_White:{c:[232,232,236],paint:1},
  Color_M02:{c:[232,232,236],paint:1},
  Interior:{c:[20,22,26],paint:0},
  UnderCarriage:{c:[14,14,16],paint:0},
};
const srgb2lin=v=>Math.round(Math.pow(v/255,2.2)*255);
for(const k in MAT)MAT[k].c=MAT[k].c.map(srgb2lin);

console.log('CELL',CELL,'parsing OBJ...');
const data=readFileSync(OBJ,'utf8');
const V=[],N=[];const tris=[];
let curMat='Polar_White';
for(const ln of data.split('\n')){
  const c0=ln.charCodeAt(0);
  if(c0===118){
    const c1=ln.charCodeAt(1);
    if(c1===32){const p=ln.split(/\s+/);V.push(+p[1],+p[2],+p[3]);}
    else if(c1===110){const p=ln.split(/\s+/);N.push(+p[1],+p[2],+p[3]);}
  }else if(c0===117&&ln.startsWith('usemtl')){curMat=ln.slice(7).trim();}
  else if(c0===102&&ln.charCodeAt(1)===32){
    const p=ln.split(/\s+/),idx=[],nidx=[];
    for(let i=1;i<p.length;i++){
      if(!p[i])continue;
      const s=p[i].split('/');
      let vi=+s[0];if(vi<0)vi=V.length/3+vi+1;idx.push(vi-1);
      let ni=s[2]?+s[2]:0;if(ni<0)ni=N.length/3+ni+1;nidx.push(ni-1);}
    for(let i=1;i+1<idx.length;i++)
      tris.push({a:idx[0],b:idx[i],c:idx[i+1],na:nidx[0],nb:nidx[i],nc:nidx[i+1],mat:curMat});}
}
const nv=V.length/3;
console.log('source verts',nv,'source tris',tris.length);

let bb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
for(let i=0;i<nv;i++)for(let a=0;a<3;a++){const v=V[i*3+a];if(v<bb[a])bb[a]=v;if(v>bb[3+a])bb[3+a]=v;}
const cx=(bb[0]+bb[3])/2, cz=(bb[2]+bb[5])/2, y0=bb[1];
for(let i=0;i<nv;i++){V[i*3]-=cx;V[i*3+1]-=y0;V[i*3+2]-=cz;}
const H=bb[4]-bb[1], L=bb[5]-bb[2], W=bb[3]-bb[0];
for(let i=0;i<nv;i++){V[i*3]=-V[i*3];V[i*3+2]=-V[i*3+2];}
for(let i=0;i<N.length/3;i++){N[i*3]=-N[i*3];N[i*3+2]=-N[i*3+2];}

/* 휠 검출 (원본과 동일) */
const lowIdx=[];
for(let i=0;i<nv;i++)if(V[i*3+1]<H*0.30)lowIdx.push(i);
let cen=[[W*.35,L*.30],[-W*.35,L*.30],[W*.35,-L*.30],[-W*.35,-L*.30]];
for(let it=0;it<12;it++){
  const sum=[[0,0,0],[0,0,0],[0,0,0],[0,0,0]];
  for(const i of lowIdx){
    const x=V[i*3],z=V[i*3+2];let best=0,bd=1e9;
    for(let k=0;k<4;k++){const dx=x-cen[k][0],dz=z-cen[k][1],d=dx*dx+dz*dz;if(d<bd){bd=d;best=k;}}
    sum[best][0]+=x;sum[best][1]+=z;sum[best][2]++;}
  for(let k=0;k<4;k++)if(sum[k][2])cen[k]=[sum[k][0]/sum[k][2],sum[k][1]/sum[k][2]];}
let wr=0;
for(let k=0;k<4;k++){
  let ymax=0;
  for(const i of lowIdx){const dx=V[i*3]-cen[k][0],dz=V[i*3+2]-cen[k][1];
    if(dx*dx+dz*dz<(W*.16)*(W*.16)&&V[i*3+1]>ymax)ymax=V[i*3+1];}
  wr=Math.max(wr,ymax*.5);}
wr=wr||H*.18;
const wheels=cen.map(c=>[+c[0].toFixed(3),+wr.toFixed(3),+c[1].toFixed(3)]);

/* 그리드 클러스터 */
const gi=(x,y,z)=>((Math.round(x/CELL))+8192)*268435456+((Math.round(y/CELL))+8192)*16384+(Math.round(z/CELL)+8192);
const cellMap=new Map();
function rep(vi){
  const x=V[vi*3],y=V[vi*3+1],z=V[vi*3+2];
  const key=gi(x,y,z);
  let r=cellMap.get(key);
  if(!r){r={x:0,y:0,z:0,nx:0,ny:0,nz:0,nn:0,n:0};cellMap.set(key,r);}
  r.x+=x;r.y+=y;r.z+=z;r.n++;
  return key;}
function inWheel(x,y,z){
  if(y>wr*1.9)return false;
  for(const c of cen){const dx=x-c[0],dz=z-c[1];if(dx*dx+dz*dz<(wr*.98)*(wr*.98))return true;}
  return false;}
/* ── 원본 휠 한 짝 추출 ── */
const WCELL=CELL<0.004?0.004:CELL;      // 휠은 작아서 과도한 세분은 낭비
const wcell=new Map(),wtris=[];
function wkey(x,y,z){return((Math.round(x/WCELL))+8192)*268435456+((Math.round(y/WCELL))+8192)*16384+(Math.round(z/WCELL)+8192);}
function wrep(vi){
  const x=V[vi*3],y=V[vi*3+1],z=V[vi*3+2];
  const k=wkey(x,y,z);
  let r=wcell.get(k);
  if(!r){r={x:0,y:0,z:0,nx:0,ny:0,nz:0,nn:0,n:0};wcell.set(k,r);}
  r.x+=x;r.y+=y;r.z+=z;r.n++;return k;}
let WSEL=-1;                            // 어느 휠을 뜰지(가장 삼각형이 많은 것)
const wcount=[0,0,0,0];
function nearestWheel(x,z){let bi=0,bd=1e9;
  for(let k=0;k<4;k++){const dx=x-cen[k][0],dz=z-cen[k][1],d=dx*dx+dz*dz;if(d<bd){bd=d;bi=k;}}
  return bi;}
function wheelTri(t,mx,mz){
  const wi=nearestWheel(mx,mz);wcount[wi]++;
  wtris.push([t.a,t.b,t.c,t.na,t.nb,t.nc,wi]);}
const rn=(k,ni)=>{const r=cellMap.get(k);
  const nx=N[ni*3]||0,ny=N[ni*3+1]||0,nz=N[ni*3+2]||0;
  if(r.nn>0&&(r.nx*nx+r.ny*ny+r.nz*nz)<0)return;
  r.nx+=nx;r.ny+=ny;r.nz+=nz;r.nn++;};
const keptTris=[];const triSeen=new Set();
for(const t of tris){
  const mx=(V[t.a*3]+V[t.b*3]+V[t.c*3])/3;
  const my=(V[t.a*3+1]+V[t.b*3+1]+V[t.c*3+1])/3;
  const mz=(V[t.a*3+2]+V[t.b*3+2]+V[t.c*3+2])/3;
  if(inWheel(mx,my,mz)){wheelTri(t,mx,mz);continue;}
  const ka=rep(t.a),kb=rep(t.b),kc=rep(t.c);
  if(ka===kb||kb===kc||ka===kc)continue;
  rn(ka,t.na);rn(kb,t.nb);rn(kc,t.nc);
  const sk=ka+','+kb+','+kc+'|'+t.mat;
  const sk2=[ka,kb,kc].sort().join(',')+'|'+t.mat;
  if(triSeen.has(sk2))continue;
  triSeen.add(sk2);
  keptTris.push([ka,kb,kc,t.mat]);}
for(const r of cellMap.values()){r.x/=r.n;r.y/=r.n;r.z/=r.n;
  const l=Math.hypot(r.nx,r.ny,r.nz)||1;r.nx/=l;r.ny/=l;r.nz/=l;}
console.log('cells',cellMap.size,'kept tris',keptTris.length);

/* 라플라시안 스무딩 2회 */
{const nbm=new Map();
 const addN=(a,b)=>{let s1=nbm.get(a);if(!s1){s1=new Set();nbm.set(a,s1);}s1.add(b);};
 for(const[ka,kb,kc]of keptTris){addN(ka,kb);addN(kb,ka);addN(kb,kc);addN(kc,kb);addN(ka,kc);addN(kc,ka);}
 for(let it=0;it<2;it++){
   const nx=new Map();
   for(const[k,r]of cellMap){
     const ns=nbm.get(k);if(!ns||ns.size<3)continue;
     let ax=0,ay=0,az=0,n=0;
     for(const q of ns){const c2=cellMap.get(q);if(!c2)continue;ax+=c2.x;ay+=c2.y;az+=c2.z;n++;}
     if(n>=3)nx.set(k,[ax/n,ay/n,az/n]);}
   for(const[k,[ax,ay,az]]of nx){const r=cellMap.get(k);
     r.x+=(ax-r.x)*.4;r.y+=(ay-r.y)*.4;r.z+=(az-r.z)*.4;}}}

/* ── 인덱스 메시 조립 — 정점 키 = 셀 + 재질(+램프색) ── */
/* ── 램프 ──
   이 OBJ에는 램프 재질이 따로 없다. 위치로 골라 색을 입히는데, 예전에는 마스크를 0으로
   두는 바람에 그 삼각형들이 '차체'에 남아 뒷면을 가로지르는 붉은 얼룩으로 보였다.
   이제 마스크 4를 줘서 발광 램프 메시로 분리한다. */
const HEAD=[250,246,215].map(srgb2lin),TAIL=[196,24,24].map(srgb2lin);
const lampCol=r=>{
  const ax=Math.abs(r.x);
  if(r.z<-2.46&&r.y>.82&&r.y<1.16&&ax>.46&&ax<1.06)return HEAD;
  if(r.z>2.42&&r.y>.96&&r.y<1.30&&ax>.52&&ax<1.10)return TAIL;
  return null;};
/* ── 유리 ──
   그린하우스의 어두운(Interior 재질) 바깥 껍질 = 창유리다. 예전에는 이게 그냥 새까만
   패널로 구워져서 유리가 아예 없는 것처럼 보였다(앞유리 영역 정점 3,596개가 전부 색 1,1,2).
   마스크 2를 주면 게임이 유리 머티리얼로 따로 그린다. */
const BB=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
for(const r of cellMap.values())for(const[i,v]of[[0,r.x],[1,r.y],[2,r.z]]){
  if(v<BB[i])BB[i]=v;if(v>BB[3+i])BB[3+i]=v;}
const BELT=BB[1]+(BB[4]-BB[1])*.60;
const CEN=[0,BB[1]+(BB[4]-BB[1])*.55,(BB[2]+BB[5])/2];
/* 유리 색을 거의 검정(16,20,26 → 리니어 0,0,1)으로 두면 투명도 0.62를 곱해도
   그냥 시커먼 구멍으로 보인다. 유리답게 읽히는 밝기의 청회색으로 올린다. */
const GLASS=[92,104,120].map(srgb2lin);
const isGlass=(r,mat)=>{
  if(mat!=='Interior'&&mat!=='Color_M02')return false;   // 어두운 재질만
  if(r.y<BELT)return false;                              // 벨트라인 위(그린하우스)
  const dx=r.x-CEN[0],dy=r.y-CEN[1],dz=r.z-CEN[2];
  const L=Math.hypot(dx,dy,dz)||1;
  return (r.nx*dx+r.ny*dy+r.nz*dz)/L>.20;};              // 바깥을 보는 껍질만(시트 제외)
const vmap=new Map();
const pos=[],nrm=[],col=[],mask=[],IDX=[];
function vert(k,mat){
  const vk=k+'|'+mat;
  let vi=vmap.get(vk);
  if(vi!==undefined)return vi;
  const r=cellMap.get(k),m=MAT[mat]||MAT.Interior;
  const lp=lampCol(r);
  const gl=!lp&&isGlass(r,mat);
  const lc=lp||(gl?GLASS:m.c);
  vi=pos.length/3;vmap.set(vk,vi);
  pos.push(r.x,r.y,r.z);nrm.push(r.nx,r.ny,r.nz);
  col.push(lc[0],lc[1],lc[2]);
  mask.push(lp?4:(gl?2:m.paint));
  return vi;}
for(const[ka,kb,kc,mat]of keptTris)IDX.push(vert(ka,mat),vert(kb,mat),vert(kc,mat));
const nOut=pos.length/3;
console.log('indexed verts',nOut,'tris',IDX.length/3,
  '(수프였다면 정점 '+(IDX.length)+'개)');

/* 양자화 + base64 */
function quantize(){
  const n=nOut;let q=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
  for(let i=0;i<n;i++)for(let a=0;a<3;a++){const v=pos[i*3+a];if(v<q[a])q[a]=v;if(v>q[3+a])q[3+a]=v;}
  const P=new Int16Array(n*3),Nr=new Int8Array(n*3),C=new Uint8Array(n*3),M=new Uint8Array(n);
  for(let i=0;i<n;i++){
    for(let a=0;a<3;a++){const s=(q[3+a]-q[a])||1;
      P[i*3+a]=Math.round((pos[i*3+a]-q[a])/s*32767);
      Nr[i*3+a]=Math.round(Math.max(-1,Math.min(1,nrm[i*3+a]))*127);
      C[i*3+a]=col[i*3+a];}
    M[i]=mask[i];}
  const b64=ta=>Buffer.from(ta.buffer,ta.byteOffset,ta.byteLength).toString('base64');
  const u16=nOut<=65535;
  const Ii=u16?new Uint16Array(IDX):new Uint32Array(IDX);
  const out={v:n,bb:q.map(v=>+v.toFixed(4)),p:b64(P),n:b64(Nr),c:b64(C)};
  if(mask.some(x=>x))out.m=b64(M);
  out.i=b64(Ii);out.i16=u16;
  return out;}
const entry=quantize();
{let sr=0,sg=0,sb=0,cN=0;
 for(let i=0;i<mask.length;i++)if(mask[i]&1){sr+=col[i*3];sg+=col[i*3+1];sb+=col[i*3+2];cN++;}
 if(cN)entry.paintSrc=[Math.round(sr/cN),Math.round(sg/cN),Math.round(sb/cN)];}
/* ── 휠 엔트리 생성: 삼각형이 가장 많은 한 짝을 허브 원점으로 옮겨 굽는다 ── */
WSEL=wcount.indexOf(Math.max(...wcount));
const wsel=wtris.filter(t=>t[6]===WSEL);
console.log("wheel tris(원본)",wsel.length,"of",wtris.length,"sel",WSEL,wcount.join("/"));
let wheelEntry=null;
if(wsel.length>200){
  const wrn=(k,nx,ny,nz)=>{const r=wcell.get(k);
    if(r.nn>0&&(r.nx*nx+r.ny*ny+r.nz*nz)<0)return;
    r.nx+=nx;r.ny+=ny;r.nz+=nz;r.nn++;};
  const wkept=[],wseen=new Set();
  for(const[a,b,c,na,nb,nc]of wsel){
    const ka=wrep(a),kb=wrep(b),kc=wrep(c);
    if(ka===kb||kb===kc||ka===kc)continue;
    wrn(ka,N[na*3]||0,N[na*3+1]||0,N[na*3+2]||0);
    wrn(kb,N[nb*3]||0,N[nb*3+1]||0,N[nb*3+2]||0);
    wrn(kc,N[nc*3]||0,N[nc*3+1]||0,N[nc*3+2]||0);
    const sk=[ka,kb,kc].sort().join(",");
    if(wseen.has(sk))continue;wseen.add(sk);
    wkept.push([ka,kb,kc]);}
  for(const r of wcell.values()){r.x/=r.n;r.y/=r.n;r.z/=r.n;
    const l=Math.hypot(r.nx,r.ny,r.nz)||1;r.nx/=l;r.ny/=l;r.nz/=l;}
  /* 허브 원점으로 이동 — 게임은 이 지오메트리를 휠 마운트에 그대로 붙인다 */
  const hx0=cen[WSEL][0],hz0=cen[WSEL][1];
  const wm=new Map(),wp=[],wn=[],wc=[],wi=[];
  const RIM=[176,180,186].map(srgb2lin),TIRE=[16,16,18].map(srgb2lin);
  const wvert=k=>{
    let v=wm.get(k);if(v!==undefined)return v;
    const r=wcell.get(k);
    v=wp.length/3;wm.set(k,v);
    const rx=r.x-hx0, ry=r.y-wr, rz=r.z-hz0;
    const rad=Math.hypot(ry,rz);
    const col=rad>wr*.74?TIRE:RIM;        // 바깥 26%는 타이어(고무), 안쪽은 림
    wp.push(rx,ry,rz);wn.push(r.nx,r.ny,r.nz);wc.push(col[0],col[1],col[2]);
    return v;};
  for(const[ka,kb,kc]of wkept)wi.push(wvert(ka),wvert(kb),wvert(kc));
  const wv=wp.length/3;
  let wbb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
  for(let i=0;i<wv;i++)for(let a=0;a<3;a++){const q=wp[i*3+a];if(q<wbb[a])wbb[a]=q;if(q>wbb[3+a])wbb[3+a]=q;}
  const WP=new Int16Array(wv*3),WN=new Int8Array(wv*3),WC=new Uint8Array(wv*3);
  for(let i=0;i<wv;i++)for(let a=0;a<3;a++){const sc=(wbb[3+a]-wbb[a])||1;
    WP[i*3+a]=Math.round((wp[i*3+a]-wbb[a])/sc*32767);
    WN[i*3+a]=Math.round(Math.max(-1,Math.min(1,wn[i*3+a]))*127);
    WC[i*3+a]=wc[i*3+a];}
  const b64w=ta=>Buffer.from(ta.buffer,ta.byteOffset,ta.byteLength).toString("base64");
  const wu16=wv<=65535;
  wheelEntry={v:wv,bb:wbb.map(v=>+v.toFixed(4)),p:b64w(WP),n:b64w(WN),c:b64w(WC),
    i:b64w(wu16?new Uint16Array(wi):new Uint32Array(wi)),i16:wu16};
  console.log("wheel entry verts",wv,"tris",wi.length/3,
    "KB",(JSON.stringify(wheelEntry).length/1024|0));}
entry.wheel=wheelEntry||{v:0,bb:[-wr,0,-wr,wr,2*wr,wr]};
if(wheelEntry&&!wheelEntry.bb)entry.wheel.bb=[-wr,0,-wr,wr,2*wr,wr];
entry.wheels=wheels.sort((a,b)=>(a[2]-b[2])||(a[0]-b[0]));
const bytes=JSON.stringify(entry).length;
console.log('entry bytes',(bytes/1024|0),'KB  i16',entry.i16);

if(WRITE){
  const js=readFileSync(BAKEDJS,'utf8');
  const j0=js.indexOf('{'),j1=js.lastIndexOf('}');
  const head=js.slice(0,j0);
  const B=JSON.parse(js.slice(j0,j1+1));
  B[KEY]=entry;
  writeFileSync(BAKEDJS,head+JSON.stringify(B)+';\n');
  console.log('WRITTEN → 15_baked.js');
}
