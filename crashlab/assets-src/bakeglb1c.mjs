/* 로우폴리 오프로드카 GLB → baked 엔트리(머지) — 재질명 분류·타이어 실측 휠 */
import{readFileSync,writeFileSync}from'fs';
const GLB='/root/.claude/uploads/40ffe11b-8311-5c4c-9817-c1f9ffde4576/82aaeb6d-lowpoly_offroad_car.glb';
const BAKEDJS='/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad/crashlab/src/15_baked.js';
const KEY='offroadc';
const b=readFileSync(GLB);
const jsonLen=b.readUInt32LE(12);
const j=JSON.parse(b.toString('utf8',20,20+jsonLen));
const bin=b.subarray(20+jsonLen+8);
const COMP={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const NC={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function acc(i){const a=j.accessors[i],bv=j.bufferViews[a.bufferView];
  const T=COMP[a.componentType],n=NC[a.type];
  return{arr:new T(bin.buffer,bin.byteOffset+(bv.byteOffset||0)+(a.byteOffset||0),a.count*n),n,count:a.count};}
/* 노드 월드 행렬 */
const mats=new Array(j.nodes.length).fill(null);
const mul=(A,B)=>{const M=new Array(16).fill(0);
  for(let r=0;r<4;r++)for(let c=0;c<4;c++)for(let k=0;k<4;k++)M[c*4+r]+=A[k*4+r]*B[c*4+k];return M;};
function trs(n){
  const[tx,ty,tz]=n.translation||[0,0,0];
  const[qx,qy,qz,qw]=n.rotation||[0,0,0,1];
  const[sx,sy,sz]=n.scale||[1,1,1];
  const x2=qx+qx,y2=qy+qy,z2=qz+qz;
  const xx=qx*x2,xy=qx*y2,xz=qx*z2,yy=qy*y2,yz=qy*z2,zz=qz*z2,wx=qw*x2,wy=qw*y2,wz=qw*z2;
  return[(1-(yy+zz))*sx,(xy+wz)*sx,(xz-wy)*sx,0,
         (xy-wz)*sy,(1-(xx+zz))*sy,(yz+wx)*sy,0,
         (xz+wy)*sz,(yz-wx)*sz,(1-(xx+yy))*sz,0,
         tx,ty,tz,1];}
function walk(ni,parent){
  const n=j.nodes[ni];
  const m=n.matrix?n.matrix.slice():trs(n);
  const wm=parent?mul(parent,m):m;
  mats[ni]=wm;
  for(const c of n.children||[])walk(c,wm);}
for(const s of j.scenes[0].nodes)walk(s,null);
const xf=(m,x,y,z)=>[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];

/* 노드명 기반 분류(재질명이 뒤섞인 모델) — x>0 쪽 차 한 대만 사용 */
const lin=v=>Math.round(Math.max(0,Math.min(1,v))*255);
function paintColor(){
  for(const m of j.materials||[])if(m.name==='carbody'){
    const f=(m.pbrMetallicRoughness&&m.pbrMetallicRoughness.baseColorFactor)||[.7,.45,.2,1];
    return[lin(f[0]),lin(f[1]),lin(f[2])];}
  return[190,110,40];}
const PAINT=paintColor();
function pname(ni){for(let i=0;i<j.nodes.length;i++)if((j.nodes[i].children||[]).includes(ni))return j.nodes[i].name||'';return'';}
function clsOfNode(nm){
  if(/^(TIre|Tire|Cylinder|Cube|Circle)/.test(nm))return'WHEEL';
  if(/^Windows/.test(nm))return{c:[16,20,26],mask:2};
  if(/Forntlights|frontlight/i.test(nm))return{c:[248,244,214],mask:4,front:1};
  if(/offroadlights/i.test(nm))return{c:[248,244,214],mask:4,front:1};   // 보조 라이트 포드
  if(/taillight/i.test(nm))return{c:[205,24,24],mask:4};
  if(/CarBody|hood/i.test(nm))return{c:PAINT,mask:1};
  if(/Bumper|Grille|bumper/i.test(nm))return{c:[26,28,32],mask:0};
  return{c:[30,32,36],mask:0};}                                  // 루프바·액세서리 등

const allTris=[],tirePts=[];
j.nodes.forEach((n,ni)=>{
  if(n.mesh==null)return;
  const nm=pname(ni);
  const cls0=clsOfNode(nm);
  const wm=mats[ni];
  for(const p of j.meshes[n.mesh].primitives){
    const P=acc(p.attributes.POSITION);
    const idx=p.indices!=null?acc(p.indices).arr:null;
    const cnt=idx?idx.length:P.count;
    const W=[];
    let cxs=0;
    for(let i=0;i<P.count;i++){const w=xf(wm,P.arr[i*3],P.arr[i*3+1],P.arr[i*3+2]);W.push(w);cxs+=w[0];}
    if(cxs/P.count>=0){continue;}                                 // 오른쪽(오픈탑) 차 스킵 — 왼쪽=하드탑
    if(cls0==='WHEEL'){for(const w of W)if(w[1]<0.55)tirePts.push(w);continue;}   // 지붕 액세서리 오검 제외
    for(let t=0;t<cnt;t+=3){
      const a=idx?idx[t]:t,b2=idx?idx[t+1]:t+1,c2=idx?idx[t+2]:t+2;
      allTris.push({a:W[a],b:W[b2],c:W[c2],cls:cls0});}}});
console.log('tris',allTris.length,'tirePts',tirePts.length);

/* 정규화(축·스케일) — 목표 길이 4.6m */
let bb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
for(const t of allTris)for(const p of[t.a,t.b,t.c])for(let a=0;a<3;a++){if(p[a]<bb[a])bb[a]=p[a];if(p[a]>bb[3+a])bb[3+a]=p[a];}
const span=[bb[3]-bb[0],bb[4]-bb[1],bb[5]-bb[2]];
// glTF는 Y-up 표준 → 높이=1 고정, 길이=x/z 중 긴 축
const hgtAxis=1;
const lenAxis=span[0]>span[2]?0:2;
const widAxis=lenAxis===0?2:0;
const scale=4.6/span[lenAxis];
console.log('bb',bb.map(v=>+v.toFixed(1)).join(','),'axes L/W/H:',lenAxis,widAxis,hgtAxis,'scale',scale.toFixed(4));
const remap=p=>[
  (p[widAxis]-(bb[widAxis]+bb[3+widAxis])/2)*scale,
  (p[hgtAxis]-bb[hgtAxis])*scale,
  (p[lenAxis]-(bb[lenAxis]+bb[3+lenAxis])/2)*scale];
function permSign(){const perm=[widAxis,hgtAxis,lenAxis];let sg=1;
  for(let i=0;i<3;i++)for(let jx=i+1;jx<3;jx++)if(perm[i]>perm[jx])sg=-sg;return sg;}
const psign=permSign();

/* 휠 4-means */
let wr=.4,cen=[];
if(tirePts.length){
  const TP=tirePts.map(remap);
  let maxY=-1e9,minY=1e9;for(const p of TP){maxY=Math.max(maxY,p[1]);minY=Math.min(minY,p[1]);}
  wr=(maxY-minY)/2;const cy0=(maxY+minY)/2;
  cen=[[-1,1],[1,1],[-1,-1.5],[1,-1.5]].map(s=>[s[0],cy0,s[1]]);
  for(let it=0;it<12;it++){
    const a2=cen.map(()=>[0,0,0,0]);
    for(const p of TP){let bi=0,bd=1e9;
      for(let k=0;k<4;k++){const d=(p[0]-cen[k][0])**2+(p[2]-cen[k][2])**2;if(d<bd){bd=d;bi=k;}}
      a2[bi][0]+=p[0];a2[bi][1]+=p[1];a2[bi][2]+=p[2];a2[bi][3]++;}
    for(let k=0;k<4;k++)if(a2[k][3])cen[k]=[a2[k][0]/a2[k][3],a2[k][1]/a2[k][3],a2[k][2]/a2[k][3]];}}
console.log('wheel r',wr.toFixed(3),'cen',JSON.stringify(cen.map(c=>c.map(v=>+v.toFixed(2)))));

/* 클러스터 */
const CELL=0.04;
const gi=(x,y,z)=>((Math.round(x/CELL))+2048)*4194304+((Math.round(y/CELL))+2048)*2048+(Math.round(z/CELL)+2048);
const cellMap=new Map();
function rep(p,clsId,cls){
  const key=gi(p[0],p[1],p[2])*8+clsId;
  let r=cellMap.get(key);
  if(!r){r={x:0,y:0,z:0,nx:0,ny:0,nz:0,nn:0,n:0,cls};cellMap.set(key,r);}
  r.x+=p[0];r.y+=p[1];r.z+=p[2];r.n++;
  return key;}
const rn=(k,nx,ny,nz)=>{const r=cellMap.get(k);
  if(r.nn>0&&(r.nx*nx+r.ny*ny+r.nz*nz)<0)return;
  r.nx+=nx;r.ny+=ny;r.nz+=nz;r.nn++;};
const keptTris=[];const seen=new Set();
let lampZ=0,lampN=0;
for(const t of allTris){
  const cls=t.cls;
  const A=remap(t.a),B2=remap(t.b),C2=remap(t.c);
  if(cls.mask===4&&cls.front){lampZ+=(A[2]+B2[2]+C2[2])/3;lampN++;}
  const ux=B2[0]-A[0],uy=B2[1]-A[1],uz=B2[2]-A[2],vx=C2[0]-A[0],vy=C2[1]-A[1],vz=C2[2]-A[2];
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const l=Math.hypot(nx,ny,nz)||1;
  nx=nx/l*psign;ny=ny/l*psign;nz=nz/l*psign;
  const clsId=cls.mask===4?(cls.front?3:4):cls.mask;
  const ka=rep(A,clsId,cls),kb=rep(B2,clsId,cls),kc=rep(C2,clsId,cls);
  if(ka===kb||kb===kc||ka===kc)continue;
  rn(ka,nx,ny,nz);rn(kb,nx,ny,nz);rn(kc,nx,ny,nz);
  const sk=[ka,kb,kc].sort().join(',');
  if(seen.has(sk))continue;seen.add(sk);
  keptTris.push([ka,kb,kc,cls]);}
for(const r of cellMap.values()){r.x/=r.n;r.y/=r.n;r.z/=r.n;
  const l=Math.hypot(r.nx,r.ny,r.nz)||1;r.nx/=l;r.ny/=l;r.nz/=l;}
console.log('cells',cellMap.size,'kept',keptTris.length);

const frontNeg=lampN?(lampZ/lampN<0):true;
const flip=frontNeg?1:-1;
console.log('lamp z',lampN?(lampZ/lampN).toFixed(2):'n/a','flip',flip);
const pos=[],nrm=[],col=[],mask=[];
for(const[ka,kb,kc,cls] of keptTris){
  const ra=cellMap.get(ka),rb=cellMap.get(kb),rc=cellMap.get(kc);
  const ord=(flip*psign===-1)?[ra,rc,rb]:[ra,rb,rc];   // 반사(미러) 시 와인딩 스왑 → 백페이스 컬링 정상
  for(const r of ord){
    pos.push(r.x*flip,r.y,r.z*flip);
    nrm.push(r.nx*flip,r.ny,r.nz*flip);
    col.push(cls.c[0],cls.c[1],cls.c[2]);mask.push(cls.mask);}}
console.log('soup',pos.length/3);

function quantize(pos,nrm,col,mask){
  const n=pos.length/3;let b2=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
  for(let i=0;i<n;i++)for(let a=0;a<3;a++){const v=pos[i*3+a];if(v<b2[a])b2[a]=v;if(v>b2[3+a])b2[3+a]=v;}
  const P=new Int16Array(n*3),Nr=new Int8Array(n*3),C=new Uint8Array(n*3),M=new Uint8Array(n);
  for(let i=0;i<n;i++){for(let a=0;a<3;a++){const s=(b2[3+a]-b2[a])||1;
    P[i*3+a]=Math.round((pos[i*3+a]-b2[a])/s*32767);
    Nr[i*3+a]=Math.round(Math.max(-1,Math.min(1,nrm[i*3+a]))*127);
    C[i*3+a]=col[i*3+a];}M[i]=mask[i];}
  const b64=ta=>Buffer.from(ta.buffer,ta.byteOffset,ta.byteLength).toString('base64');
  const out={v:n,bb:b2.map(v=>+v.toFixed(4)),p:b64(P),n:b64(Nr),c:b64(C)};
  if(mask.some(x=>x))out.m=b64(M);
  return out;}
const entry=quantize(pos,nrm,col,mask);
{let sr=0,sg=0,sb=0,cN=0;for(let i=0;i<mask.length;i++)if(mask[i]&1){sr+=col[i*3];sg+=col[i*3+1];sb+=col[i*3+2];cN++;}
 if(cN)entry.paintSrc=[Math.round(sr/cN),Math.round(sg/cN),Math.round(sb/cN)];}
entry.wheel={v:0,bb:[-.16,0,-wr,.16,2*wr,wr]};
entry.wheels=cen.map(c=>[+(c[0]*flip).toFixed(3),+wr.toFixed(3),+(c[2]*flip).toFixed(3)])
  .sort((a,b)=>(a[2]-b[2])||(a[0]-b[0]));

let js=readFileSync(BAKEDJS,'utf8');
const m0=js.indexOf('const BAKED=');
const jsonStart=js.indexOf('{',m0);
const jsonEnd=js.lastIndexOf('};')+1;
const B=JSON.parse(js.slice(jsonStart,jsonEnd));
B[KEY]=entry;
writeFileSync(BAKEDJS,js.slice(0,jsonStart)+JSON.stringify(B)+js.slice(jsonEnd));
console.log('written',KEY,'v:',entry.v,'wheels:',JSON.stringify(entry.wheels));
