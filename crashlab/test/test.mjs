// CRASH LAB smoke test — loads game, drives through every mode, reports console errors
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const DIR='/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad/crashlab';
const url='file://'+DIR+'/crashlab.html';
const errors=[];
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=swiftshader','--enable-webgl','--no-sandbox']});
const page=await browser.newPage({viewport:{width:900,height:440}});
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text().slice(0,300));});
page.on('pageerror',e=>errors.push('pageerror: '+String(e).slice(0,300)));
await page.goto(url);
await page.waitForTimeout(1500);
const shot=(n)=>page.screenshot({path:DIR+'/shots/'+n+'.png'});
await shot('01_menu');

const step=async(desc,fn)=>{
  try{await fn();}catch(e){errors.push('step "'+desc+'": '+String(e).slice(0,200));}
  console.log('step done:',desc,'| errors so far:',errors.length);};

// helper: start a game via JS (deterministic)
const start=(mode,car,map,extra)=>page.evaluate(([mode,car,map,extra])=>{
  Game.mode=mode;Game.opts.carIdx=car;Game.opts.mapId=map;Object.assign(Game.opts,extra||{});
  Game.startGame();},[mode,car,map,extra]);
const state=()=>page.evaluate(()=>({
  state:Game.state,speed:+(Game.veh?.speed*3.6).toFixed(1),
  pos:Game.veh?[+Game.veh.body.pos.x.toFixed(1),+Game.veh.body.pos.y.toFixed(1),+Game.veh.body.pos.z.toFixed(1)]:null,
  ok:Game.veh?.body.ok(),grounded:Game.veh?.grounded,gear:Game.veh?.gear,rpm:Game.veh?.rpm|0,
  dmg:Game.veh?Object.values(Game.veh.dmg).map(v=>v|0):null,fps:+FPS.fps.toFixed(0)}));

await step('free drive pony on proving, accelerate 5s',async()=>{
  await start('free',0,'proving');
  await page.waitForTimeout(800);
  await page.keyboard.down('ArrowUp');
  let s=null;
  for(let k=0;k<24;k++){await page.waitForTimeout(500);s=await state();if(s.speed>40)break;}
  console.log('  drive:',JSON.stringify(s));
  if(s.speed<40)errors.push('car too slow after 12s throttle: '+s.speed+'km/h');
  if(!s.ok)errors.push('NaN in body state');
  await shot('02_drive');
  // steer
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowRight');
  const s2=await state();console.log('  after turn:',JSON.stringify(s2));
  await page.keyboard.up('ArrowUp');
  await shot('03_turn');});

await step('crash test 100km/h into wall',async()=>{
  await start('crash',1,'proving');
  await page.waitForTimeout(500);
  await page.evaluate(()=>{Game.crash.vTarget=100;Game.launch();});
  let rep=false;
  for(let k=0;k<50;k++){await page.waitForTimeout(600);
    rep=await page.evaluate(()=>$("reportPanel").classList.contains("on"));if(rep)break;}
  const r=await page.evaluate(()=>({phase:Game.crash.phase,report:$("reportPanel").classList.contains("on"),
    dmg:Object.values(Game.veh.dmg).map(v=>v|0),defVol:+Game.vis.defVol.toFixed(1),
    peakG:+Game.veh.peakG.toFixed(1),ok:Game.veh.body.ok()}));
  console.log('  crash:',JSON.stringify(r));
  if(!r.ok)errors.push('crash: NaN');
  if(r.dmg[0]<5)errors.push('crash: no front damage registered: '+JSON.stringify(r.dmg));
  if(!r.report)errors.push('crash: report panel not shown (phase='+r.phase+')');
  await shot('04_crash');});

await step('time attack raceway',async()=>{
  await start('time',4,'raceway');
  await page.waitForTimeout(500);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(6000);
  await page.keyboard.up('ArrowUp');
  const s=await state();console.log('  ta:',JSON.stringify(s));
  const t=await page.evaluate(()=>({started:Game.timing.started,cp:Game.timing.cp,t:Game.timing.t|0}));
  console.log('  timing:',JSON.stringify(t));
  if(!t.started)errors.push('time attack never started');
  await shot('05_timeattack');});

await step('AI race city 3 ai',async()=>{
  await start('race',1,'city',{aiCount:3,laps:1});
  await page.waitForTimeout(4000); // countdown
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(8000);
  await page.keyboard.up('ArrowUp');
  const r=await page.evaluate(()=>({started:Game.race.started,rank:Game.race.rank,
    ais:Game.ais.map(a=>({spd:+(a.veh.speed*3.6).toFixed(0),ok:a.veh.body.ok(),wp:a.wp}))}));
  console.log('  race:',JSON.stringify(r));
  if(!r.started)errors.push('race never started');
  for(const a of r.ais){if(!a.ok)errors.push('AI NaN');}
  if(r.ais.every(a=>a.spd<5))errors.push('all AIs stationary: '+JSON.stringify(r.ais));
  await shot('06_race');});

await step('drift GT on proving asphalt',async()=>{
  await start('drift',1,'proving');
  await page.waitForTimeout(400);
  const d=await page.evaluate(async()=>{
    const v=Game.veh;v.controlLock=true;v.driveMode='D';
    const t0=Date.now();let best=0;
    while(Date.now()-t0<26000){
      await new Promise(r=>setTimeout(r,200));
      const kmh=v.speed*3.6;
      if(kmh<65&&Game.drift.run===0){v.throttle=1;v.steerIn=0;v.handbrake=false;}
      else{v.throttle=.85;v.steerIn=-1;
        v.body.vecToLocal(v.body.vel,_vA);
        const beta=Math.abs(Math.atan2(_vA.x,Math.abs(_vA.z)))/DEG;
        v.handbrake=beta<20&&kmh>40;}
      best=Math.max(best,Game.drift.run+Game.drift.score);}
    v.controlLock=false;
    return{best:best|0,score:Game.drift.score|0,run:Game.drift.run|0,combo:+Game.drift.combo.toFixed(1)};});
  console.log('  drift:',JSON.stringify(d));
  if(d.best<=0)errors.push('drift never scored');
  await shot('07_drift');});

await step('all car x map load matrix',async()=>{
  const mapIds=await page.evaluate(()=>MAPS.map(m=>m.id));
  for(const m of mapIds)for(let c=0;c<5;c++){
    await start('free',c,m);
    await page.waitForTimeout(350);
    const s=await state();
    if(!s.ok)errors.push('NaN on '+m+' car'+c);
    if(s.pos[1]<-5)errors.push('fell through ground on '+m+' car'+c+' y='+s.pos[1]);}
  console.log('  matrix ok');});

await step('mountain drive downhill',async()=>{
  await start('free',2,'mountain');
  await page.waitForTimeout(600);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(5000);
  await page.keyboard.up('ArrowUp');
  const s=await state();console.log('  mountain:',JSON.stringify(s));
  await shot('08_mountain');});

await step('editor open/save/test',async()=>{
  await page.evaluate(()=>{Game.exitToMenu();Editor.open(null);});
  await page.waitForTimeout(400);
  await page.evaluate(()=>{
    // programmatically place tiles: road line + start
    const S=Store;
    S.set("maps:테스트맵",{name:"테스트맵",tiles:[
      {x:10,z:10,t:"start",r:0},{x:10,z:9,t:"road",r:0},{x:10,z:8,t:"road",r:0},
      {x:10,z:7,t:"curve",r:0},{x:11,z:7,t:"road",r:1},{x:12,z:7,t:"wall",r:0},{x:9,z:9,t:"cone",r:0}],v:1});});
  await shot('09_editor');
  await start('free',0,'custom:테스트맵');
  await page.waitForTimeout(800);
  const s=await state();console.log('  custom map:',JSON.stringify(s));
  if(!s.ok)errors.push('custom map NaN');
  await shot('10_custom');});

await step('night + titan rollover kick',async()=>{
  await start('free',3,'proving',{tod:'night'});
  await page.waitForTimeout(600);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(6000);
  await page.keyboard.up('ArrowUp');
  const s=await state();console.log('  titan night:',JSON.stringify(s));
  await shot('11_night');});

await step('pause/resume + reset + repair',async()=>{
  await page.evaluate(()=>Game.togglePause());
  await page.waitForTimeout(300);await shot('12_pause');
  await page.evaluate(()=>Game.togglePause(false));
  await page.evaluate(()=>{Game.repair();Game.resetCar();});
  await page.waitForTimeout(300);
  const s=await state();
  if(!s.ok)errors.push('after reset NaN');});

console.log('\n==== RESULT ====');
console.log(errors.length?errors.join('\n'):'NO ERRORS 🎉');
await browser.close();
process.exit(errors.length?1:0);
