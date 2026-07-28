/* 벨트웨이 한 바퀴 실주행 — 실제로 차를 몰아 막히는 지점을 찾는다 */
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
  Game.opts.mapId='grand';Game.startGame();
  const v=Game.veh,bd=v.body,w=Game.world;
  const R=1060, hits=[];
  /* 벨트웨이를 따라 차를 순간이동시키며 '앞으로 3m 지점이 막혔는지' 검사한다.
     막힘 판정: 차 높이대(y+0.3~1.6)에 정적 충돌체가 있는지 = 레이 대신
     그 지점에 차를 놓고 한 스텝 굴렸을 때 강한 반발이 나오는지로 본다. */
  const N=360;
  for(let k=0;k<N;k++){
    const a=k/N*Math.PI*2, ang=a+Math.PI/2;
    const x=Math.cos(a)*R, z=Math.sin(a)*R;
    v.reset(x,z,ang,true);
    for(const k2 in v.dmg)v.dmg[k2]=0;   // 표본마다 손상 초기화(누적되면 전 구간이 막힘으로 잡힌다)
    const gy=w.height(x,z);
    // 정지 안정화
    for(let i=0;i<40;i++){Game.state='play';Game.frame(1/120);Game.state='__p';}
    // 전방으로 밀어 본다
    const z0=bd.pos.z,x0=bd.pos.x;
    for(let i=0;i<90;i++){
      bd.vel.x=Math.cos(ang)*16;bd.vel.z=Math.sin(ang)*16;
      v.throttle=.6;v.brake=0;v.steerIn=0;
      Game.state='play';Game.frame(1/120);Game.state='__p';}
    const moved=Math.hypot(bd.pos.x-x0,bd.pos.z-z0);
    const dmg=(v.dmg.f|0)+(v.dmg.b|0)+(v.dmg.l|0)+(v.dmg.r|0);
    if(moved<9.5||dmg>6)
      hits.push({deg:+(a*180/Math.PI).toFixed(0),x:+x.toFixed(0),z:+z.toFixed(0),
        이동m:+moved.toFixed(1),손상:dmg,지면y:+gy.toFixed(2)});}
  return{막힘지점수:hits.length,지점:hits.slice(0,24)};})));
await b.close();
