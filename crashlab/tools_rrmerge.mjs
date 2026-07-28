/* 롤스로이스 원본 휠 = 두 소스의 합집합.
   · rr_wheel_gltf.json : 휠 재질(etk_wheel_05a·caliper) → 림·브레이크
   · rr_wheel.json      : 차체 수프의 휠 원통 → 타이어·나머지
   두 파일 모두 같은 휠(WSEL=3)을 허브 원점·좌측(-x) 규약으로 맞춰 두었으므로 그대로 합친다.
   합칠 때 '고무 삼각형을 앞으로' 재정렬해 게임의 두 머티리얼 그룹 분리를 유지한다. */
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad';
const SRC=SP+'/crashlab/src/15_baked.js';
const dec=(s,T)=>{const b=Buffer.from(s,'base64');return new T(b.buffer,b.byteOffset,b.byteLength/T.BYTES_PER_ELEMENT);};
function load(p){
  const e=JSON.parse(fs.readFileSync(p,'utf8'));
  const P=dec(e.p,Int16Array),N=dec(e.n,Int8Array),C=dec(e.c,Uint8Array);
  const I=dec(e.i,e.i16?Uint16Array:Uint32Array);
  const pos=new Float64Array(e.v*3),nor=new Float64Array(e.v*3);
  for(let i=0;i<e.v;i++)for(let a=0;a<3;a++){
    pos[i*3+a]=e.bb[a]+P[i*3+a]/32767*(e.bb[3+a]-e.bb[a]);
    nor[i*3+a]=N[i*3+a]/127;}
  return{e,pos,nor,C,I};}
const A=load(SP+'/rr_wheel_gltf.json'), B2=load(SP+'/rr_wheel.json');
console.log('gltf',A.e.v,'정점 /',A.I.length/3,'삼각형  soup',B2.e.v,'/',B2.I.length/3);

const pos=[],nor=[],col=[],tri=[];
function add(S){
  const off=pos.length/3;
  for(let i=0;i<S.e.v;i++){
    pos.push(S.pos[i*3],S.pos[i*3+1],S.pos[i*3+2]);
    nor.push(S.nor[i*3],S.nor[i*3+1],S.nor[i*3+2]);
    col.push(S.C[i*3],S.C[i*3+1],S.C[i*3+2]);}
  const cal=S.e.cal===undefined?S.I.length:S.e.cal;
  for(let t=0;t<S.I.length;t+=3){
    const cls=t<S.e.tire?1:(t<cal?0:2);          // 1=고무 0=림 2=캘리퍼
    if(S.drop&&S.drop.indexOf(cls)>=0)continue;
    tri.push([off+S.I[t],off+S.I[t+1],off+S.I[t+2],cls]);}}
/* 두 소스가 겹치는 부분이 있어 그대로 합치면 고무가 두 겹으로 쌓인다(Z파이팅).
   겹치는 것은 '타이어' 하나뿐이므로 그것만 한쪽에서 버린다.
     · soup(차체 수프의 휠 원통) → 타이어 + 림 면   ← 스포크 '면'과 바깥 트레드가 여기에 있다
     · gltf(휠 재질)             → 림 스포크 + 캘리퍼 (타이어만 버린다)
   (림을 통째로 버려 봤더니 한쪽은 속이 들여다보이고 다른 쪽은 민무늬 원반이 됐다) */
/* 타이어는 양쪽 소스 모두 버린다 — 게임이 림 치수에 맞춰 새로 만든다.
   원본 타이어는 두 소스가 겹쳐 지저분했고, 폭·반경이 아치와도 맞지 않았다. */
A.drop=[1]; B2.drop=[1];
add(A);add(B2);
/* 회전부는 '휠(림·스포크·센터캡) + 타이어'만, 브레이크(캘리퍼·디스크)는 비회전.
   구분은 gltf 재질 이름으로 한다(tools_rrwheel). x좌표로 안/밖을 가르려 했더니
   타이어 중앙면과 캘리퍼 평균 x가 똑같이 0.050 이어서 판별이 안 되고
   림 페이스가 잘못 옮겨졌다. */
const RANK={1:0,0:1,2:2};
tri.sort((a,b)=>RANK[a[3]]-RANK[b[3]]);          // 타이어 → 림 → 브레이크
const IDX=[];let tireIdx=0,calIdx=-1;
for(const t of tri){
  if(t[3]===1)tireIdx+=3;
  if(t[3]===2&&calIdx<0)calIdx=IDX.length;       // 여기부터 비회전
  IDX.push(t[0],t[1],t[2]);}
if(calIdx<0)calIdx=IDX.length;
/* ── 회전축 정확히 맞추기 ──
   허브 추정이 조금 어긋나 있어(계측: z 중심이 2.4cm 편심) 휠이 축을 벗어나 돌았다.
   남은 지오메트리(림)의 y·z 바운딩 중심을 원점으로 다시 잡는다. */
const v=pos.length/3;
{let yb=[1e9,-1e9],zb=[1e9,-1e9];
 /* 중심은 '회전부(타이어·림)'만으로 잡는다 — 비회전 캘리퍼까지 넣으면
    바운딩 중심이 캘리퍼 쪽으로 끌려가 휠이 축을 벗어나 돈다. */
 const rot=new Set();
 for(let q=0;q<calIdx;q++)rot.add(IDX[q]);
 for(const i of rot){const y=pos[i*3+1],z=pos[i*3+2];
   if(y<yb[0])yb[0]=y;if(y>yb[1])yb[1]=y;
   if(z<zb[0])zb[0]=z;if(z>zb[1])zb[1]=z;}
 const cy=(yb[0]+yb[1])/2, cz=(zb[0]+zb[1])/2;
 for(let i=0;i<v;i++){pos[i*3+1]-=cy;pos[i*3+2]-=cz;}
 console.log('회전축 보정 dy',cy.toFixed(4),'dz',cz.toFixed(4),
   '→ 림반경',((yb[1]-yb[0])/2).toFixed(3));}
/* 회전부(림)의 실제 최대 반경 — 게임이 이 값부터 타이어를 만든다.
   전체 bb 는 비회전 캘리퍼까지 포함하므로 쓸 수 없다. */
let rimR=0,rimHW=0;
{const seen=new Set();
 for(let t=0;t<calIdx;t+=3)for(let k=0;k<3;k++){
   const q=IDX[t+k];if(seen.has(q))continue;seen.add(q);
   const r=Math.hypot(pos[q*3+1],pos[q*3+2]);if(r>rimR)rimR=r;
   const ax=Math.abs(pos[q*3]);if(ax>rimHW)rimHW=ax;}}
console.log('회전 림 최대반경',rimR.toFixed(3),'반폭',rimHW.toFixed(3));
let bb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
for(let i=0;i<v;i++)for(let a=0;a<3;a++){const q=pos[i*3+a];
  if(q<bb[a])bb[a]=q;if(q>bb[3+a])bb[3+a]=q;}
const P=new Int16Array(v*3),N=new Int8Array(v*3),C=new Uint8Array(v*3);
for(let i=0;i<v;i++)for(let a=0;a<3;a++){const sc=(bb[3+a]-bb[a])||1;
  P[i*3+a]=Math.round((pos[i*3+a]-bb[a])/sc*32767);
  N[i*3+a]=Math.round(Math.max(-1,Math.min(1,nor[i*3+a]))*127);
  C[i*3+a]=col[i*3+a];}
const b64=ta=>Buffer.from(ta.buffer,ta.byteOffset,ta.byteLength).toString('base64');
const u16=v<=65535;
const entry={v,bb:bb.map(x=>+x.toFixed(4)),p:b64(P),n:b64(N),c:b64(C),
  i:b64(u16?new Uint16Array(IDX):new Uint32Array(IDX)),i16:u16,tire:tireIdx,cal:calIdx,rimR:+rimR.toFixed(4),rimHW:+rimHW.toFixed(4)};
let js=fs.readFileSync(SRC,'utf8');
const j0=js.indexOf('{',js.indexOf('const BAKED=')),j1=js.lastIndexOf('};')+1;
const BK=JSON.parse(js.slice(j0,j1));
BK.rrghost.wheel=entry;
fs.writeFileSync(SRC,js.slice(0,j0)+JSON.stringify(BK)+js.slice(j1));
console.log('합친 휠 정점',v,'삼각형',IDX.length/3,'고무',tireIdx/3,'캘리퍼시작',calIdx,
  'r',((bb[4]-bb[1])/2).toFixed(3),'폭',(bb[3]-bb[0]).toFixed(3),
  'KB',(JSON.stringify(entry).length/1024|0));
