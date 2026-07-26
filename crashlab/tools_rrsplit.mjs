/* rr_raw.json 에서 '원본 휠'을 분리한다.
   tools_rr.mjs 는 재질/노드 이름으로 휠을 걸렀지만, 이 모델의 휠 일부는 차체 페인트
   재질(rrghost_main_b)을 쓰고 노드 이름도 휠이 아니라서 차체 메시에 그대로 남아 있었다.
   그래서 게임이 붙인 휠 뒤에 '돌지 않는 원본 휠'이 겹쳐 보였다(계측: 휠 그룹을 숨겨도
   타이어·5스포크가 그대로 남음).
   여기서는 재질이 아니라 '휠 원통'이라는 기하 조건으로 잘라
   ① 차체(휠 없음) ② 휠 한 짝 을 만든다. */
import fs from 'fs';
const SP='/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad';
const RAW=JSON.parse(fs.readFileSync(SP+'/rr_raw.json','utf8'));
const P=RAW.P,N=RAW.N,C=RAW.C,M=RAW.M;
const CEN=RAW.wheels, R0=RAW.tireR;
const RCUT=+(process.env.RCUT||R0*1.10), XCUT=+(process.env.XCUT||0.185);
console.log('휠중심',JSON.stringify(CEN.map(c=>c.map(v=>+v.toFixed(2)))),'tireR',R0,'RCUT',RCUT.toFixed(3));

const nt=P.length/9;
const bodyT=[],wheelT=[[],[],[],[]];
for(let t=0;t<nt;t++){
  let hit=-1,all=true;
  for(let k=0;k<3;k++){
    const x=P[t*9+k*3],y=P[t*9+k*3+1],z=P[t*9+k*3+2];
    let bi=-1;
    for(let w=0;w<CEN.length;w++){
      const dy=y-CEN[w][1],dz=z-CEN[w][2],dx=x-CEN[w][0];
      if(Math.hypot(dy,dz)<=RCUT&&Math.abs(dx)<=XCUT){bi=w;break;}}
    if(bi<0){all=false;break;}
    if(hit<0)hit=bi;else if(hit!==bi){all=false;break;}}
  if(all&&hit>=0)wheelT[hit].push(t);else bodyT.push(t);}
console.log('삼각형 총',nt,'차체',bodyT.length,'휠',wheelT.map(a=>a.length).join('/'));

/* ── ① 휠 없는 차체 ── */
{const P2=[],N2=[],C2=[],M2=[];
 for(const t of bodyT){
   for(let k=0;k<9;k++){P2.push(P[t*9+k]);N2.push(N[t*9+k]);C2.push(C[t*9+k]);}
   for(let k=0;k<3;k++)M2.push(M[t*3+k]);}
 let bb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
 for(let i=0;i<P2.length/3;i++)for(let a=0;a<3;a++){
   const q=P2[i*3+a];if(q<bb[a])bb[a]=q;if(q>bb[3+a])bb[3+a]=q;}
 fs.writeFileSync(SP+'/rr_raw_nw.json',JSON.stringify({P:P2,N:N2,C:C2,M:M2,bb,
   wheels:RAW.wheels,tireR:RAW.tireR}));
 console.log('차체 저장 rr_raw_nw.json  bb',bb.map(v=>+v.toFixed(2)).join(','));}

/* ── ② 휠 한 짝 굽기 ── */
let sel=0;for(let w=1;w<4;w++)if(wheelT[w].length>wheelT[sel].length)sel=w;
const WT=wheelT[sel],hub=CEN[sel];
console.log('선택 휠',sel,'삼각형',WT.length,'허브',hub.map(v=>+v.toFixed(3)));
/* 반경으로 고무/림 구분 — 저편평 타이어라 바깥 12%만 고무 */
let RMAX=0;
for(const t of WT)for(let k=0;k<3;k++){
  const r=Math.hypot(P[t*9+k*3+1]-hub[1],P[t*9+k*3+2]-hub[2]);if(r>RMAX)RMAX=r;}
const RUB=RMAX*(+(process.env.RUB||0.88));
console.log('휠 최대반경',RMAX.toFixed(3),'고무 경계',RUB.toFixed(3));
/* 좌우 규약: 저장 휠은 모델공간 -x(좌). Assets.geo 가 180° 돌려 우측 휠이 되고
   게임이 좌측용으로 한 번 더 거울을 뜬다. */
const MIR=hub[0]>0;
const CELL=+(process.env.WCELL||0.004);
const nbk=(nx,ny,nz)=>((Math.round(nx*1.5)+2)*25+(Math.round(ny*1.5)+2)*5+(Math.round(nz*1.5)+2));
const cells=new Map();
const kOf=(x,y,z,c,nk)=>(((Math.round(x/CELL)+8192)*268435456+(Math.round(y/CELL)+8192)*16384
                        +(Math.round(z/CELL)+8192))*2+c)*128+nk;
const sl=v=>Math.round(Math.pow(v/255,2.2)*255);   // 베이크 색은 리니어 바이트
const RIMC=[118,124,134].map(sl), RUBC=[18,18,20].map(sl);
function rep(t,k,cls){
  const o=t*9+k*3;
  let x=P[o]-hub[0],y=P[o+1]-hub[1],z=P[o+2]-hub[2];
  let nx=N[o],ny=N[o+1],nz=N[o+2];
  if(MIR){x=-x;nx=-nx;}
  const key=kOf(x,y,z,cls,nbk(nx,ny,nz));
  let r=cells.get(key);
  if(!r){r={x:0,y:0,z:0,nx:0,ny:0,nz:0,n:0,cls,cr:0,cg:0,cb:0};cells.set(key,r);}
  r.x+=x;r.y+=y;r.z+=z;r.nx+=nx;r.ny+=ny;r.nz+=nz;r.n++;
  /* 색은 원본을 쓰지 않는다 — 이 휠은 소스에서 차체 페인트(밝은 실버) 재질이라
     그대로 두면 림 페이스가 차체색 원반으로 보인다. 부위별 알로이/고무 색으로 덮는다. */
  const CO=cls===1?RUBC:RIMC;
  r.cr+=CO[0]/255;r.cg+=CO[1]/255;r.cb+=CO[2]/255;
  return key;}
const kept=[],seen=new Set();
for(const t of WT){
  const my=(P[t*9+1]+P[t*9+4]+P[t*9+7])/3-hub[1];
  const mz=(P[t*9+2]+P[t*9+5]+P[t*9+8])/3-hub[2];
  const cls=Math.hypot(my,mz)>RUB?1:0;                  // 1=고무 0=림/브레이크
  const ka=rep(t,0,cls),kb=rep(t,1,cls),kc=rep(t,2,cls);
  if(ka===kb||kb===kc||ka===kc)continue;
  const sk=[ka,kb,kc].sort().join(',');
  if(seen.has(sk))continue;seen.add(sk);
  kept.push(MIR?[ka,kc,kb,cls]:[ka,kb,kc,cls]);}        // 거울 → 감김 되돌리기
for(const r of cells.values()){r.x/=r.n;r.y/=r.n;r.z/=r.n;
  const L=Math.hypot(r.nx,r.ny,r.nz)||1;r.nx/=L;r.ny/=L;r.nz/=L;
  r.cr/=r.n;r.cg/=r.n;r.cb/=r.n;}
kept.sort((a,b)=>b[3]-a[3]);                            // 고무 먼저 → 머티리얼 그룹 분리
const map=new Map(),wp=[],wn=[],wc=[],widx=[];
let tireIdx=0;
const vert=k=>{
  let v=map.get(k);if(v!==undefined)return v;
  const r=cells.get(k);v=wp.length/3;map.set(k,v);
  wp.push(r.x,r.y,r.z);wn.push(r.nx,r.ny,r.nz);
  wc.push(Math.round(r.cr*255),Math.round(r.cg*255),Math.round(r.cb*255));
  return v;};
for(const[ka,kb,kc,cls]of kept){
  if(cls===1)tireIdx+=3;
  widx.push(vert(ka),vert(kb),vert(kc));}
const wv=wp.length/3;
let wbb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
for(let i=0;i<wv;i++)for(let a=0;a<3;a++){const q=wp[i*3+a];
  if(q<wbb[a])wbb[a]=q;if(q>wbb[3+a])wbb[3+a]=q;}
const WP=new Int16Array(wv*3),WN=new Int8Array(wv*3),WC=new Uint8Array(wv*3);
for(let i=0;i<wv;i++)for(let a=0;a<3;a++){const sc=(wbb[3+a]-wbb[a])||1;
  WP[i*3+a]=Math.round((wp[i*3+a]-wbb[a])/sc*32767);
  WN[i*3+a]=Math.round(Math.max(-1,Math.min(1,wn[i*3+a]))*127);
  WC[i*3+a]=Math.max(0,Math.min(255,wc[i*3+a]));}
const b64=ta=>Buffer.from(ta.buffer,ta.byteOffset,ta.byteLength).toString('base64');
const u16=wv<=65535;
const entry={v:wv,bb:wbb.map(x=>+x.toFixed(4)),p:b64(WP),n:b64(WN),c:b64(WC),
  i:b64(u16?new Uint16Array(widx):new Uint32Array(widx)),i16:u16,tire:tireIdx};
fs.writeFileSync(SP+'/rr_wheel.json',JSON.stringify(entry));
console.log('휠 엔트리 정점',wv,'삼각형',widx.length/3,'고무',tireIdx/3,
  'r',((wbb[4]-wbb[1])/2).toFixed(3),'폭',(wbb[3]-wbb[0]).toFixed(3),
  'KB',(JSON.stringify(entry).length/1024|0));
