/* 인피니티 하이웨이 전 구간 실주행 — 출발부터 종착까지 막힘 없이 갈 수 있나 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:420,height:300}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,200)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
console.log(JSON.stringify(await p.evaluate(()=>{
  Game.mode='free';Game.opts.carIdx=CARS.findIndex(c=>c.id==='gt');
  Game.opts.mapId='infinity';Game.startGame();
  const v=Game.veh,bd=v.body,w=Game.world;
  const bad=[];
  /* 노선 중심선을 따라 30m 간격으로 점검: 그 자리에 놓고 전방으로 12m 가는지 */
  for(let z=-1700;z<=1660;z+=30){
    // 도로 x 는 지면 스캔으로 찾는다(노선식과 독립적으로 검증)
    let bx=0,bh=-1e9;
    for(let x=-260;x<=260;x+=4){const s=w.surf(x,z);if(s===SURF_ID.asphalt||s===SURF_ID.lane){bx=x;bh=w.height(x,z);break;}}
    if(bh<-1e8){bad.push({z,사유:"포장없음"});continue;}
    v.reset(bx,z,0,true);for(const q in v.dmg)v.dmg[q]=0;
    for(let i=0;i<40;i++){Game.state='play';Game.frame(1/120);Game.state='__p';}
    const x0=bd.pos.x,z0=bd.pos.z;
    for(let i=0;i<90;i++){bd.vel.x=0;bd.vel.z=16;v.throttle=.6;v.brake=0;v.steerIn=0;
      Game.state='play';Game.frame(1/120);Game.state='__p';}
    const moved=Math.hypot(bd.pos.x-x0,bd.pos.z-z0);
    if(moved<9.5)bad.push({z,x:+bx.toFixed(0),이동:+moved.toFixed(1),
      접지:v.wheels.filter(q=>q.onGround).length,y:+bd.pos.y.toFixed(1)});}
  const pl=(w.places||[]).length;
  return{점검수:Math.round(3360/30)+1,문제:bad.length,목록:bad.slice(0,14),장소:pl,
    맵크기:w.size,스폰:w.spawn};})));
await b.close();
