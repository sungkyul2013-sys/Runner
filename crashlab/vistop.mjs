import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:400,height:300}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,200)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
console.log(JSON.stringify(await p.evaluate(()=>{
  const out={};
  for(const id of['veloce','rrghost','maybach']){
    Game.mode='free';Game.opts.carIdx=CARS.findIndex(c=>c.id===id);
    Game.opts.mapId='proving';Game.startGame();
    const v=Game.veh,w=Game.world,vis=Game.vis;
    w.bumps=[];w.potholes=[];w.rippleZones=null;w.roadRough=0;
    w.addBump(0,-265,0,7,1.1,.16,'arch');
    v.reset(0,-296,0,true);
    for(let i=0;i<400;i++){v.body.vel.set(0,v.body.vel.y,0);Game.state='play';Game.frame(1/120);Game.state='__p';}
    let maxVis=-9,maxClamped=-9;
    for(let i=0;i<520;i++){v.body.vel.z=45/3.6;v.throttle=.18;
      Game.state='play';Game.frame(1/120);Game.state='__p';
      for(const q of v.wheels){const y=q.rVisY===undefined?q.visY:q.rVisY;if(y>maxVis)maxVis=y;}
      for(const m of vis.wheelMeshes)if(m.position.y>maxClamped)maxClamped=m.position.y;}
    out[id]={상한:vis.wheelVisTop===undefined?null:+vis.wheelVisTop.toFixed(3),
      물리최대visY:+maxVis.toFixed(3),실제표시최대y:+maxClamped.toFixed(3),
      아치돌출막음cm:vis.wheelVisTop===undefined?null:+((maxVis-maxClamped)*100).toFixed(1)};}
  return out;})));
await b.close();
