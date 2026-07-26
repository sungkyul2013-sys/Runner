/* rr_raw.json → 법선/재질그룹 인식 클러스터링 → '인덱스 메시'로 BAKED.rrghost 생성.
   비인덱스로는 정점당 13바이트가 삼각형마다 3번 중복돼 용량이 폭발한다.
   용접 후 인덱스로 저장하면 같은 용량에 삼각형을 2배 이상 담을 수 있어
   판(패널)이 매끈하게 유지된다. */
import fs from 'fs';
const RAW=JSON.parse(fs.readFileSync('/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad/rr_raw_nw.json','utf8'));
const SRC='src/15_baked.js';
const B=JSON.parse(fs.readFileSync(SRC,'utf8').match(/const BAKED=(\{[\s\S]*\});?\s*$/)[1]);
const taB64=(a)=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
const pos=Float64Array.from(RAW.P),nor=Float64Array.from(RAW.N),
      col=Float64Array.from(RAW.C),M=Uint8Array.from(RAW.M),n=RAW.P.length/3;

function cluster(g){
  const grp=new Int32Array(n/3);
  for(let t=0;t<n/3;t++)grp[t]=M[t*3]|M[t*3+1]|M[t*3+2];
  const gOf=(gr)=>(gr&2)?g*.5:((gr&4)?g*.5:g);
  const key=new Map(),cA=[],cid=new Int32Array(n);
  for(let t=0;t<n/3;t++){const gr=grp[t],gg=gOf(gr);
    for(let v=0;v<3;v++){const i=t*3+v;
      // 법선 방향을 키에 포함 → 얇은 판의 앞뒷면이 뭉쳐 표면이 우는 것을 막는다
      const k=gr+'|'+Math.round(nor[i*3]*2.2)+'/'+Math.round(nor[i*3+1]*2.2)+'/'+Math.round(nor[i*3+2]*2.2)
              +'|'+Math.round(pos[i*3]/gg)+','+Math.round(pos[i*3+1]/gg)+','+Math.round(pos[i*3+2]/gg);
      let id=key.get(k);
      if(id===undefined){id=cA.length/11;key.set(k,id);cA.push(0,0,0,0,0,0,0,0,0,0,gr);}
      cid[i]=id;const o=id*11;
      cA[o]+=pos[i*3];cA[o+1]+=pos[i*3+1];cA[o+2]+=pos[i*3+2];
      cA[o+6]+=col[i*3];cA[o+7]+=col[i*3+1];cA[o+8]+=col[i*3+2];cA[o+9]++;}}
  const nc=cA.length/11;
  for(let c=0;c<nc;c++){const o=c*11,w=cA[o+9]||1;
    cA[o]/=w;cA[o+1]/=w;cA[o+2]/=w;cA[o+6]/=w;cA[o+7]/=w;cA[o+8]/=w;}
  const seen=new Set(),tris=[];
  for(let t=0;t<n/3;t++){
    const a=cid[t*3],b=cid[t*3+1],c=cid[t*3+2];
    if(a===b||b===c||a===c)continue;
    const sk=a<b?(b<c?a+','+b+','+c:(a<c?a+','+c+','+b:c+','+a+','+b))
                :(a<c?b+','+a+','+c:(b<c?b+','+c+','+a:c+','+b+','+a));
    if(seen.has(sk))continue;seen.add(sk);
    const ax=cA[a*11],ay=cA[a*11+1],az=cA[a*11+2];
    const bx=cA[b*11],by=cA[b*11+1],bz=cA[b*11+2];
    const cx=cA[c*11],cy=cA[c*11+1],cz=cA[c*11+2];
    const nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay);
    const ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az);
    const nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
    if(Math.hypot(nx,ny,nz)<1e-13)continue;
    tris.push(a,b,c);
    for(const id of[a,b,c]){const o=id*11;cA[o+3]+=nx;cA[o+4]+=ny;cA[o+5]+=nz;}}
  for(let c=0;c<nc;c++){const o=c*11,L=Math.hypot(cA[o+3],cA[o+4],cA[o+5]);
    if(L>1e-13){cA[o+3]/=L;cA[o+4]/=L;cA[o+5]/=L;}else{cA[o+3]=0;cA[o+4]=1;cA[o+5]=0;}}
  // 실제 쓰인 클러스터만 추려 재인덱싱
  const used=new Map(),VP=[],VN=[],VC=[],VM=[],IDX=[];
  for(const id of tris){
    let m2=used.get(id);
    if(m2===undefined){m2=VP.length/3;used.set(id,m2);const o=id*11;
      VP.push(cA[o],cA[o+1],cA[o+2]);VN.push(cA[o+3],cA[o+4],cA[o+5]);
      VC.push(cA[o+6],cA[o+7],cA[o+8]);VM.push(cA[o+10]);}
    IDX.push(m2);}
  return{VP,VN,VC,VM,IDX,verts:VP.length/3,tris:IDX.length/3};
}
/* 목표: 삼각형 수 + 정점 65,535 이하(Uint16 인덱스) */
const TARGET_T=+(process.env.TARGET||96000), MAXV=+(process.env.MAXV||65535);
const NOWRITE=process.env.NOWRITE==="1";
const bb0=RAW.bb,diag=Math.hypot(bb0[3]-bb0[0],bb0[4]-bb0[1],bb0[5]-bb0[2]);
let lo=diag*2e-5,hi=diag*.05,best=null;
for(let it=0;it<24;it++){
  const g=Math.sqrt(lo*hi);
  const R=cluster(g);
  const tooBig=R.tris>TARGET_T||R.verts>MAXV;
  if(tooBig)lo=g;else{hi=g;best=R;}
  if(!tooBig&&R.tris>TARGET_T*.93){best=R;break;}
}
if(!best)best=cluster(hi);
console.log('rrghost',RAW.P.length/9,'→',best.tris,'tris /',best.verts,'verts (인덱스)');

const v=best.verts;
let bb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
for(let i=0;i<v;i++)for(let a=0;a<3;a++){
  const q=best.VP[i*3+a];if(q<bb[a])bb[a]=q;if(q>bb[3+a])bb[3+a]=q;}
const Pi=new Int16Array(v*3),Ni=new Int8Array(v*3),Ci=new Uint8Array(v*3),Mi=new Uint8Array(v);
for(let i=0;i<v;i++){
  Mi[i]=best.VM[i];
  for(let a=0;a<3;a++){
    Pi[i*3+a]=Math.max(-32767,Math.min(32767,Math.round((best.VP[i*3+a]-bb[a])/(bb[3+a]-bb[a])*32767)));
    Ni[i*3+a]=Math.max(-127,Math.min(127,Math.round(best.VN[i*3+a]*127)));
    Ci[i*3+a]=Math.max(0,Math.min(255,Math.round(best.VC[i*3+a]*255)));}}
const u16=v<=65535;
const Ii=u16?new Uint16Array(best.IDX):new Uint32Array(best.IDX);
const wr=RAW.tireR;
B.rrghost={v,bb:bb.map(x=>+x.toFixed(4)),p:taB64(Pi),n:taB64(Ni),c:taB64(Ci),m:taB64(Mi),
  i:taB64(Ii),i16:u16,
  wheel:JSON.parse(fs.readFileSync('/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad/rr_wheel.json','utf8')),
  wheels:RAW.wheels};
const mc={};for(let i=0;i<v;i++)mc[Mi[i]]=(mc[Mi[i]]||0)+1;
console.log('mask(정점) 분포',JSON.stringify(mc),'인덱스',u16?'Uint16':'Uint32');
console.log('추정 용량', Math.round((Pi.byteLength+Ni.byteLength+Ci.byteLength+Mi.byteLength+Ii.byteLength)*4/3/1024),'KB(base64)');
if(NOWRITE)process.exit(0);
fs.writeFileSync(SRC,'/* Baked 3D assets — Kenney(CC0) + Range Rover + Mercedes GLS(OBJ)\n'+
  '   + Rolls-Royce Ghost: "Rolls-Royce Ghost" (https://sketchfab.com/3d-models/rolls-royce-ghost-4a590f4afa094fa8b407a14db77a63a8)\n'+
  '     by Black Snow (https://sketchfab.com/BlackSnow02) licensed under CC-BY-4.0.\n'+
  '   ※ 차량 스캔 모델은 모바일 프레임을 위해 감면되어 있다. rrghost는 인덱스 메시(i/i16). */\n'+
  'const BAKED='+JSON.stringify(B)+';\n');
console.log('written');
