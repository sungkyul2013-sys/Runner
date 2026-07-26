/* Rolls-Royce Ghost (CC-BY-4.0, Black Snow) glTF → BAKED 엔트리
   텍스처가 없는 머티리얼 색 모델이라 정점색으로 그대로 구울 수 있다. */
import fs from 'fs';
const DIR='/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad/rr';
const G=JSON.parse(fs.readFileSync(DIR+'/scene.gltf','utf8'));
const BIN=fs.readFileSync(DIR+'/scene.bin');
const bufFor=(i)=>BIN;   // 단일 .bin
const CT={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const NC={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function acc(idx){
  const a=G.accessors[idx],bv=G.bufferViews[a.bufferView];
  const T=CT[a.componentType],nc=NC[a.type];
  const base=(bv.byteOffset||0)+(a.byteOffset||0);
  const stride=bv.byteStride;
  const out=new Float64Array(a.count*nc);
  if(!stride||stride===nc*T.BYTES_PER_ELEMENT){
    const ta=new T(BIN.buffer,BIN.byteOffset+base,a.count*nc);
    for(let i=0;i<out.length;i++)out[i]=ta[i];
  }else{
    for(let i=0;i<a.count;i++){
      const ta=new T(BIN.buffer,BIN.byteOffset+base+i*stride,nc);
      for(let c=0;c<nc;c++)out[i*nc+c]=ta[c];}}
  return{data:out,count:a.count,nc};
}
/* 노드 트리 → 월드 행렬 */
function mul(a,b){const o=new Array(16);
  for(let i=0;i<4;i++)for(let j=0;j<4;j++){let s=0;
    for(let k=0;k<4;k++)s+=a[k*4+j]*b[i*4+k];o[i*4+j]=s;}return o;}
function trs(n){
  if(n.matrix)return n.matrix.slice();
  const t=n.translation||[0,0,0],r=n.rotation||[0,0,0,1],s=n.scale||[1,1,1];
  const[x,y,z,w]=r;
  const x2=x+x,y2=y+y,z2=z+z;
  const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  return[(1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,
         (xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0,
         (xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0,
         t[0],t[1],t[2],1];}
const xf=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],
                 m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],
                 m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const xfn=(m,p)=>{const v=[m[0]*p[0]+m[4]*p[1]+m[8]*p[2],
                          m[1]*p[0]+m[5]*p[1]+m[9]*p[2],
                          m[2]*p[0]+m[6]*p[1]+m[10]*p[2]];
  const L=Math.hypot(...v)||1;return[v[0]/L,v[1]/L,v[2]/L];};

/* 머티리얼 → 색 + 마스크 분류 */
const MATS=G.materials.map(m=>{
  const pbr=m.pbrMetallicRoughness||{};
  const bc=pbr.baseColorFactor||[.8,.8,.8,1];
  const nm=(m.name||'').toLowerCase();
  let mask=0;
  if(/glass|window|windshield|screen/.test(nm))mask|=2;
  else if(/lowbeam|highbeam|signal|light|lamp|brake|reverse|runninglight/.test(nm))mask|=4;
  else if(/paint|rrghost_main|^rrghost$|body/.test(nm))mask|=1;
  return{col:[bc[0],bc[1],bc[2]],alpha:bc[3],mask,name:m.name||''};
});

/* ══ 원본 롤스로이스 휠 한 짝 추출 ══
   tools_rr.mjs 는 휠 프리미티브를 버리고 위치·반경만 넘긴다(게임이 절차 휠을 붙였다).
   여기서는 같은 판정으로 걸러낸 프리미티브를 '버리는 대신' 모아 굽는다. */
const WRE=/wheel|tyre|_tire|rim|caliper|brakedisc|disc$/;
const wtris=[];
function walk(ni,parent){
  const n=G.nodes[ni];
  const m=mul(parent,trs(n));
  const nm=(n.name||'').toLowerCase();
  if(n.mesh!==undefined){
    for(const prim of G.meshes[n.mesh].primitives){
      const mat=MATS[prim.material]??{col:[.7,.7,.7],alpha:1,mask:0,name:''};
      const mlow=mat.name.toLowerCase();
      /* 재질 이름으로만 판정한다 — 노드 이름으로 걸면 'wheel' 이 들어간 부모 노드 밑의
         차체 페인트(rrghost_main_b, 15만 삼각형)까지 딸려 들어온다(계측 확인). */
      if(!WRE.test(mlow))continue;
      const pa=acc(prim.attributes.POSITION);
      const na=prim.attributes.NORMAL!==undefined?acc(prim.attributes.NORMAL):null;
      const idx=prim.indices!=null?acc(prim.indices):null;
      const cnt=idx?idx.count:pa.count;
      /* 재질 이름으로 고무/금속 구분 — 한 머티리얼로 그리면 림 스페큘러가 타이어를 태운다 */
      /* 비회전 브레이크류 — 캘리퍼(amdb11_caliper.002)와 디스크(etk_wheel_05a.002).
         .002 재질은 림 본체(etk_wheel_05a)와 따로 분리돼 있어 브레이크 로터로 본다. */
      const caliper=/caliper/.test(mlow)||/\.002$/.test(mlow);
      for(let i=0;i<cnt;i+=3){
        const T=[];
        for(let k=0;k<3;k++){
          const vi=idx?idx.data[i+k]:(i+k);
          const p=xf(m,[pa.data[vi*3],pa.data[vi*3+1],pa.data[vi*3+2]]);
          const q=na?xfn(m,[na.data[vi*3],na.data[vi*3+1],na.data[vi*3+2]]):[0,1,0];
          T.push([-p[0],p[1],-p[2],-q[0],q[1],-q[2]]);}   // 차체와 같은 Y 180° 규약
        wtris.push({T,caliper});}
    }}
  for(const c of (n.children||[]))walk(c,m);
}
const I4=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
for(const ni of G.scenes[G.scene||0].nodes)walk(ni,I4);
console.log('휠 삼각형(4바퀴 합)',wtris.length);

const SRC='/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad/crashlab/src/15_baked.js';
let js=fs.readFileSync(SRC,'utf8');
const j0=js.indexOf('{',js.indexOf('const BAKED=')),j1=js.lastIndexOf('};')+1;
const B=JSON.parse(js.slice(j0,j1));
const CEN=B.rrghost.wheels;
console.log('휠 중심(베이크 기준)',JSON.stringify(CEN));

/* 삼각형을 가장 가까운 휠에 배정 → 삼각형이 가장 많은 한 짝 선택 */
const buck=[[],[],[],[]];
for(const t of wtris){
  const mx=(t.T[0][0]+t.T[1][0]+t.T[2][0])/3, mz=(t.T[0][2]+t.T[1][2]+t.T[2][2])/3;
  let bi=0,bd=1e9;
  for(let k=0;k<CEN.length;k++){const dx=mx-CEN[k][0],dz=mz-CEN[k][2],d=dx*dx+dz*dz;
    if(d<bd){bd=d;bi=k;}}
  buck[bi].push(t);}
let sel=process.env.WSEL!==undefined?+process.env.WSEL:0;
if(process.env.WSEL===undefined)for(let k=1;k<4;k++)if(buck[k].length>buck[sel].length)sel=k;
const WT=buck[sel];
console.log('선택 휠',sel,'삼각형',WT.length,buck.map(b=>b.length).join('/'));

/* ── 휠 원통으로 잘라내기 ──
   etk_wheel_05a 재질은 휠뿐 아니라 허브 캐리어·드라이브샤프트까지 덮는다(계측: 선택 버킷이
   x 0.00~0.92, z -1.71~-0.13 로 차 중심까지 뻗어 있었다). 알려진 휠 중심을 축으로
   반경·폭으로 잘라 진짜 바퀴만 남긴다. */
const hub=[CEN[sel][0],CEN[sel][1],CEN[sel][2]];
const RCUT=+(process.env.RCUT||0.44), XCUT=+(process.env.XCUT||0.19);
{const keep=[];
 for(const t of WT){
   let ok=true;
   for(const v of t.T){
     const dy=v[1]-hub[1],dz=v[2]-hub[2],dx=v[0]-hub[0];
     if(Math.hypot(dy,dz)>RCUT||Math.abs(dx)>XCUT){ok=false;break;}}
   if(ok)keep.push(t);}
 console.log('원통 클립',WT.length,'→',keep.length);
 /* 좌우 규약 통일 — 저장 휠은 항상 '모델공간 -x(좌)' 쪽이어야 한다.
    Assets.geo 가 Y축 180°를 돌리므로 -x 휠이 게임의 우측 휠이 되고, 게임은 좌측용으로
    한 번 더 거울을 뜬다. +x 휠을 그대로 저장하면 안팎이 뒤집혀 림 속이 들여다보인다.
    허브를 기준으로 국소 x 만 뒤집고(감김도 되돌린다) 허브 위치는 그대로 둔다. */
 if(CEN[sel][0]>0){
   const hx0=CEN[sel][0];
   for(const t of keep){
     for(const v of t.T){v[0]=2*hx0-v[0];v[3]=-v[3];}
     const tmp=t.T[1];t.T[1]=t.T[2];t.T[2]=tmp;}
   console.log('휠 좌우 반전 적용');}
 WT.length=0;WT.push(...keep);}
let tb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
for(const t of WT)for(const v of t.T)
  for(let a=0;a<3;a++){if(v[a]<tb[a])tb[a]=v[a];if(v[a]>tb[3+a])tb[3+a]=v[a];}
const RMAX=Math.max((tb[4]-tb[1])/2,(tb[5]-tb[2])/2);
console.log('허브',hub.map(v=>+v.toFixed(3)),'반경',RMAX.toFixed(3),'폭',(tb[3]-tb[0]).toFixed(3));
/* 삼각형 분류: 캘리퍼(빨강) / 타이어(바깥 밴드, 검정 고무) / 림(밝은 알로이) */
/* 저편평 타이어 — 21인치 림에 사이드월이 3.5cm 남짓이라 0.80 로 자르면 림 스포크의
   바깥 절반까지 '고무'로 분류돼 휠이 새까맣게 나온다(계측으로 확인). */
const RUB=+(process.env.RUB||0.885)*RMAX;
for(const t of WT){
  const my=(t.T[0][1]+t.T[1][1]+t.T[2][1])/3-hub[1];
  const mz=(t.T[0][2]+t.T[1][2]+t.T[2][2])/3-hub[2];
  t.rad=Math.hypot(my,mz);
  t.cls=t.caliper?2:(t.rad>RUB?1:0);}          // 0=림 1=타이어 2=캘리퍼
const sl=v=>Math.round(Math.pow(v/255,2.2)*255);   // 베이크 색은 리니어 바이트
const CLSCOL=[[126,132,142].map(sl),[18,18,20].map(sl),[172,40,32].map(sl)];
{const n=[0,0,0];for(const t of WT)n[t.cls]++;console.log('림/타이어/캘리퍼',n.join('/'));}

/* 클러스터 감면 — 휠은 작아서 아주 촘촘하게 */
const CELL=+(process.env.WCELL||0.004);
/* 셀 키에 '법선 방향 버킷'을 넣는다 — 스포크 판은 4mm보다 얇아서 앞·뒷면이 같은 칸에
   들어가고, 그러면 반대 법선끼리 상쇄돼 면이 새까맣게 죽는다(림 페이스가 검게 나온 원인). */
const nb=v=>((Math.round(v[3]*1.5)+2)*25+(Math.round(v[4]*1.5)+2)*5+(Math.round(v[5]*1.5)+2));
const key=(x,y,z,c,nk)=>(((Math.round(x/CELL)+8192)*268435456+(Math.round(y/CELL)+8192)*16384
                      +(Math.round(z/CELL)+8192))*4+c)*128+nk;
const cells=new Map();
function rep(v,cls){
  const x=v[0]-hub[0],y=v[1]-hub[1],z=v[2]-hub[2];
  const k=key(x,y,z,cls,nb(v));
  let r=cells.get(k);
  if(!r){r={x:0,y:0,z:0,nx:0,ny:0,nz:0,nn:0,n:0,cls};cells.set(k,r);}
  r.x+=x;r.y+=y;r.z+=z;r.n++;
  if(r.nn===0||(r.nx*v[3]+r.ny*v[4]+r.nz*v[5])>=0){r.nx+=v[3];r.ny+=v[4];r.nz+=v[5];r.nn++;}
  return k;}
const kept=[],seen=new Set();
for(const t of WT){
  const ka=rep(t.T[0],t.cls),kb=rep(t.T[1],t.cls),kc=rep(t.T[2],t.cls);
  if(ka===kb||kb===kc||ka===kc)continue;
  const sk=[ka,kb,kc].sort().join(',');
  if(seen.has(sk))continue;seen.add(sk);
  kept.push([ka,kb,kc,t.cls]);}
for(const r of cells.values()){r.x/=r.n;r.y/=r.n;r.z/=r.n;
  const L=Math.hypot(r.nx,r.ny,r.nz)||1;r.nx/=L;r.ny/=L;r.nz/=L;}
/* 고무 삼각형을 앞으로 정렬 → 게임에서 두 머티리얼 그룹으로 분리 */
/* 정렬 순서 = 타이어 → 림 → 캘리퍼.
   캘리퍼(브레이크)는 휠과 함께 돌면 안 되므로 게임이 인덱스 뒷부분만 떼어
   회전하지 않는 별도 메시로 그린다. */
const RANK={1:0,0:1,2:2};
kept.sort((a,b)=>RANK[a[3]]-RANK[b[3]]);
const map=new Map(),wp=[],wn=[],wc=[],widx=[];
let tireIdx=0;
const vert=k=>{
  let v=map.get(k);if(v!==undefined)return v;
  const r=cells.get(k);v=wp.length/3;map.set(k,v);
  wp.push(r.x,r.y,r.z);wn.push(r.nx,r.ny,r.nz);
  const col=CLSCOL[r.cls];wc.push(col[0],col[1],col[2]);
  return v;};
let calIdx=-1;
for(const[ka,kb,kc,cls]of kept){
  if(cls===1)tireIdx+=3;
  if(cls===2&&calIdx<0)calIdx=widx.length;
  widx.push(vert(ka),vert(kb),vert(kc));}
if(calIdx<0)calIdx=widx.length;
const wv=wp.length/3;
let wbb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
for(let i=0;i<wv;i++)for(let a=0;a<3;a++){const q=wp[i*3+a];
  if(q<wbb[a])wbb[a]=q;if(q>wbb[3+a])wbb[3+a]=q;}
const WP=new Int16Array(wv*3),WN=new Int8Array(wv*3),WC=new Uint8Array(wv*3);
for(let i=0;i<wv;i++)for(let a=0;a<3;a++){const sc=(wbb[3+a]-wbb[a])||1;
  WP[i*3+a]=Math.round((wp[i*3+a]-wbb[a])/sc*32767);
  WN[i*3+a]=Math.round(Math.max(-1,Math.min(1,wn[i*3+a]))*127);
  WC[i*3+a]=wc[i*3+a];}
const b64=ta=>Buffer.from(ta.buffer,ta.byteOffset,ta.byteLength).toString('base64');
const u16=wv<=65535;
const OUT={v:wv,bb:wbb.map(x=>+x.toFixed(4)),p:b64(WP),n:b64(WN),c:b64(WC),
  i:b64(u16?new Uint16Array(widx):new Uint32Array(widx)),i16:u16,tire:tireIdx,cal:calIdx};
fs.writeFileSync('/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad/rr_wheel_gltf.json',JSON.stringify(OUT));
console.log('휠(gltf) 정점',wv,'삼각형',widx.length/3,'고무',tireIdx/3,'캘리퍼시작',calIdx,
  'r',((wbb[4]-wbb[1])/2).toFixed(3),'폭',(wbb[3]-wbb[0]).toFixed(3),
  'KB',(JSON.stringify(OUT).length/1024|0));
