/* 익스프레스웨이 노선 실주행 — 월드에 기록된 중심선을 따라 진행 방향으로 달린다 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:420,height:300}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,250)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
console.log(JSON.stringify(await p.evaluate(mapId=>{
  Game.mode='free';Game.opts.carIdx=CARS.findIndex(c=>c.id==='gt');
  Game.opts.mapId=mapId;Game.startGame();
  const v=Game.veh,bd=v.body,w=Game.world;
  const rs=w.exRoutes||[];
  if(!rs.length)return{오류:"노선 없음"};
  const bad=[];let checked=0,totalLen=0;
  for(const route of rs){
    for(let k=1;k<route.length;k++)
      totalLen+=Math.hypot(route[k].x-route[k-1].x,route[k].z-route[k-1].z);
    const STEP=Math.max(1,Math.round(route.length/110));
    for(let k=0;k<route.length-1;k+=STEP){
      const a=route[k],b2=route[Math.min(route.length-1,k+1)];
      const yaw=Math.atan2(b2.x-a.x,b2.z-a.z);
      v.reset(a.x,a.z,yaw,true);for(const q in v.dmg)v.dmg[q]=0;
      for(let i=0;i<40;i++){Game.state='play';Game.frame(1/120);Game.state='__p';}
      const x0=bd.pos.x,z0=bd.pos.z;
      for(let i=0;i<90;i++){bd.vel.x=Math.sin(yaw)*16;bd.vel.z=Math.cos(yaw)*16;
        v.throttle=.6;v.brake=0;v.steerIn=0;Game.state='play';Game.frame(1/120);Game.state='__p';}
      const moved=Math.hypot(bd.pos.x-x0,bd.pos.z-z0);
      const surf=w.surf(a.x,a.z);
      checked++;
      if(moved<9.5)   // 다리 위는 지형 포장이 없는 게 정상이므로 이동거리만 본다
        bad.push({x:+a.x.toFixed(0),z:+a.z.toFixed(0),이동:+moved.toFixed(1),
          포장:SURF_IDS[surf],접지:v.wheels.filter(q=>q.onGround).length});}}
  return{노선수:rs.length,총길이m:totalLen|0,점검:checked,문제:bad.length,목록:bad.slice(0,12)};},
  process.argv[3]||'infinity')));
await b.close();
