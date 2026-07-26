/* 후방 충돌 크럼플 계측 — 차를 180° 돌려 뒤로 벽에 박는다 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:520,height:340}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,180)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
const KMH=+(process.argv[4]||110);
for(const id of (process.argv[3]||'maybach,rrghost').split(',')){
  await p.evaluate(({c,KMH})=>{
    Game.mode='free';Game.opts.carIdx=CARS.findIndex(x=>x.id===c);
    Game.opts.mapId='proving';Game.startGame();
    Game.veh.damageOn=true;
    Game.veh.reset(-140,285,Math.PI,false);      // 180° = 뒤가 벽(z=300)을 향한다
    Game.veh.body.vel.set(0,0,KMH/3.6);},{c:id,KMH});
  await p.waitForTimeout(4200);
  console.log(id.padEnd(9),JSON.stringify(await p.evaluate(()=>{
    const v=Game.veh,L=Game.vis.lattice;
    const NZ=L.NZ,NY=L.NY,NX=L.NX,H=L.home,P=L.pos;
    const bins=new Array(5).fill(0),cnt=new Array(5).fill(0);
    const zsH=new Array(5).fill(0),zsP=new Array(5).fill(0);
    for(let k=0;k<NZ;k++)for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){
      const a=((k*NY+j)*NX+i)*3, bi=Math.min(4,((k/(NZ-1))*5)|0);
      const d=Math.hypot(P[a]-H[a],P[a+1]-H[a+1],P[a+2]-H[a+2]);
      bins[bi]+=d;cnt[bi]++;zsH[bi]+=H[a+2];zsP[bi]+=P[a+2];}
    const seg=bins.map((s,i)=>+(s/cnt[i]*100).toFixed(1));
    const zmH=zsH.map((x,i)=>x/cnt[i]),zmP=zsP.map((x,i)=>x/cnt[i]);
    const shrink=[];
    for(let i=0;i<4;i++){const L0=zmH[i+1]-zmH[i],L1=zmP[i+1]-zmP[i];
      shrink.push(+((1-L1/L0)*100).toFixed(1));}
    let tf=0,tc=0,tr=0;
    for(let q=0;q<L.nb;q++)if(L.bbrk[q]){
      const node=L.bA[q]/3,k=Math.floor(node/(NY*NX)),zt=k/(NZ-1);
      if(zt>L.cellZ[1])tf++;else if(zt<L.cellZ[0])tr++;else tc++;}
    const cellAvg=(seg[1]+seg[2]+seg[3])/3;
    return{구간변형cm:seg,구간수축pct:shrink,
      뒤대셀_배수:+(seg[0]/Math.max(cellAvg,.01)).toFixed(1),
      찢김_뒤:tr,셀:tc,앞:tf,dmg:[v.dmg.f|0,v.dmg.b|0],
      defVol:+Game.vis.defVol.toFixed(0)};})));
}
await b.close();
