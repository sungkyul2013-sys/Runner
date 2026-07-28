/* 고가 구간에서 '노선 설계 고도' vs '실제 지면 높이' 비교 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:400,height:300}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,250)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
for(const m of (process.argv[3]||'grand,infinity').split(',')){
  console.log(m, JSON.stringify(await p.evaluate(mapId=>{
    Game.mode='free';Game.opts.carIdx=CARS.findIndex(c=>c.id==='gt');
    Game.opts.mapId=mapId;Game.startGame();
    const w=Game.world, rs=w.exRoutes||[];
    const out=[];
    for(const route of rs)
      for(let k=0;k<route.length;k+=Math.max(1,Math.round(route.length/60))){
        const p2=route[k];
        if(p2.y<3)continue;                    // 고가 구간만
        out.push({x:+p2.x.toFixed(0),z:+p2.z.toFixed(0),설계y:+p2.y.toFixed(1),
          지면y:+w.height(p2.x,p2.z).toFixed(1),
          차이:+(p2.y-w.height(p2.x,p2.z)).toFixed(1)});}
    const bad=out.filter(o=>Math.abs(o.차이)>2);
    return{고가점검:out.length,불일치:bad.length,예:bad.slice(0,8),정상예:out.slice(0,3)};},m)));}
await b.close();
