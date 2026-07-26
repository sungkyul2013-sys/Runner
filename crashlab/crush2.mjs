/* 크럼플 존 계측 v2 — 게임의 크래시 모드(벽 정면)로 실제 충돌시킨 뒤 z구간별 변형 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:520,height:340}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,180)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<60;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<40;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
const KMH=+(process.argv[4]||110);
for(const id of (process.argv[3]||'rrghost,maybach,gt').split(',')){
  await p.evaluate(({c,KMH})=>{Game.mode='crash';Game.opts.carIdx=CARS.findIndex(x=>x.id===c);
    Game.opts.mapId='proving';Game.startGame();
    Game.crash.vTarget=KMH;Game.launch();},{c:id,KMH});
  for(let t=0;t<40;t++){await p.waitForTimeout(700);
    if(await p.evaluate(()=>Game.crash&&Game.crash.phase!=='run'))break;}
  await p.waitForTimeout(1800);
  console.log(id.padEnd(9),JSON.stringify(await p.evaluate(()=>{
    const v=Game.veh,L=Game.vis.lattice;
    const NZ=L.NZ,NY=L.NY,NX=L.NX,H=L.home,P=L.pos;
    const bins=new Array(5).fill(0),cnt=new Array(5).fill(0);
    for(let k=0;k<NZ;k++)for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){
      const a=((k*NY+j)*NX+i)*3;
      const d=Math.hypot(P[a]-H[a],P[a+1]-H[a+1],P[a+2]-H[a+2]);
      const zt=k/(NZ-1), bi=Math.min(4,(zt*5)|0);
      bins[bi]+=d;cnt[bi]++;}
    const seg=bins.map((s,i)=>+(s/cnt[i]*100).toFixed(1));
    let tf=0,tc=0,tr=0;
    for(let q=0;q<L.nb;q++)if(L.bbrk[q]){
      const node=L.bA[q]/3, k=Math.floor(node/(NY*NX)), zt=k/(NZ-1);
      if(zt>L.cellZ[1])tf++;else if(zt<L.cellZ[0])tr++;else tc++;}
    /* 구간 '길이 수축' — 강체 이동분을 빼고 각 z구간이 실제로 몇 % 짧아졌는지 */
    const zsH=new Array(5).fill(0),zsP=new Array(5).fill(0);
    for(let k=0;k<NZ;k++)for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){
      const a=((k*NY+j)*NX+i)*3, bi=Math.min(4,((k/(NZ-1))*5)|0);
      zsH[bi]+=H[a+2];zsP[bi]+=P[a+2];}
    const zmH=zsH.map((v,i)=>v/cnt[i]),zmP=zsP.map((v,i)=>v/cnt[i]);
    const shrink=[];
    for(let i=0;i<4;i++){const L0=zmH[i+1]-zmH[i],L1=zmP[i+1]-zmP[i];
      shrink.push(+((1-L1/L0)*100).toFixed(1));}
    const cellAvg=(seg[1]+seg[2]+seg[3])/3;
    return {셀범위:L.cellZ.map(x=>+x.toFixed(2)),
      구간변형cm:seg, 구간수축pct:shrink, 앞대셀_배수:+(seg[4]/Math.max(cellAvg,.01)).toFixed(1),
      찢김_뒤:tr,셀:tc,앞:tf, 전체찢김:L.torn,
      dmg:[v.dmg.f|0,v.dmg.b|0], defVol:+Game.vis.defVol.toFixed(0),
      엔진밀림cm:Game.vis.engineMesh?+((Game.vis.engineHome.z-Game.vis.engineMesh.position.z)*100).toFixed(1):null};})));
}
await b.close();
