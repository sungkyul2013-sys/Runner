/* 등판 중 서스펜션 압축 — 일정 경사에서 납작해지는지 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:400,height:300}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,200)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
for(const id of (process.argv[3]||'rrghost,maybach,veloce').split(',')){
  console.log(id.padEnd(9),JSON.stringify(await p.evaluate(c=>{
    Game.mode='free';Game.opts.carIdx=CARS.findIndex(x=>x.id===c);
    Game.opts.mapId='proving';Game.startGame();
    const v=Game.veh,bd=v.body,w=Game.world;
    w.bumps=[];w.potholes=[];w.rippleZones=null;w.roadRough=0;
    /* 인공 등판: 지형을 z 에 대해 일정 기울기로 세운다(8%) */
    const R=w.res,half=w.size*.5;
    for(let j=0;j<=R;j++)for(let i=0;i<=R;i++){
      const z=j*w.cell-half;
      w.hMap[w.idx(i,j)]=Math.max(0,(z+300))*0.08;}
    v.reset(0,-290,0,true);
    let flat=0;
    for(let i=0;i<240;i++){Game.state='play';Game.frame(1/120);Game.state='__p';}
    flat=v.wheels.reduce((s,q)=>s+q.comp,0)/4;
    // 등판 주행
    let mx=0,sum=0,n=0;
    for(let i=0;i<900;i++){
      bd.vel.z=Math.min(22,bd.vel.z+0.05);v.throttle=.7;v.brake=0;v.steerIn=0;
      Game.state='play';Game.frame(1/120);Game.state='__p';
      if(i>200){const c=v.wheels.reduce((s,q)=>s+q.comp,0)/4;
        sum+=c;n++;if(c>mx)mx=c;}}
    const trav=v.spec.susp.travel;
    return{트래블:+trav.toFixed(3),평지압축:+flat.toFixed(3),
      등판평균압축:+(sum/n).toFixed(3),등판최대압축:+mx.toFixed(3),
      바닥친비율pct:+((mx/trav)*100).toFixed(0)};},id)));}
await b.close();
