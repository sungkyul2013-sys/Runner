/* 충돌 반동 — 벽에 박은 뒤 피치(뒤 들림)와 후방 밀림을 잰다 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:400,height:300}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,200)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
for(const id of (process.argv[3]||'veloce,maybach').split(',')){
  console.log(id.padEnd(9),JSON.stringify(await p.evaluate(c=>{
    Game.mode='free';Game.opts.carIdx=CARS.findIndex(x=>x.id===c);
    Game.opts.mapId='proving';Game.startGame();Game.veh.damageOn=true;
    const v=Game.veh,bd=v.body;
    v.reset(-140,285,0,false);bd.vel.set(0,0,70/3.6);
    let zMax=-1e9,pitchMax=0,pitchMin=0,backV=0,yMax=-9;
    const z0=bd.pos.z;
    for(let i=0;i<420;i++){
      Game.state='play';Game.frame(1/120);Game.state='__p';
      const e=new THREE.Euler().setFromQuaternion(bd.quat,'YXZ');
      if(bd.pos.z>zMax)zMax=bd.pos.z;
      if(e.x>pitchMax)pitchMax=e.x; if(e.x<pitchMin)pitchMin=e.x;
      if(bd.vel.z<backV)backV=bd.vel.z;
      if(bd.pos.y>yMax)yMax=bd.pos.y;}
    return{최전진z:+zMax.toFixed(2),최종z:+bd.pos.z.toFixed(2),
      뒤로밀린m:+(zMax-bd.pos.z).toFixed(2),최대후진속도:+backV.toFixed(2),
      피치최대도:+(pitchMax*180/Math.PI).toFixed(1),피치최소도:+(pitchMin*180/Math.PI).toFixed(1),
      최고차체y:+yMax.toFixed(2)};},id)));}
await b.close();
