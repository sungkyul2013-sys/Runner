import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const DIR='/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad/crashlab';
const errors=[];
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:900,height:440}});
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text().slice(0,200));});
page.on('pageerror',e=>errors.push('pageerror: '+String(e).slice(0,200)));
await page.goto('file://'+DIR+'/crashlab.html');
await page.waitForTimeout(1200);

// 1. 200km/h wall, every car
for(let c=0;c<5;c++){
  await page.evaluate(async(c)=>{
    Game.mode='crash';Game.opts.carIdx=c;Game.opts.mapId='proving';Game.startGame();
    await new Promise(r=>setTimeout(r,200));
    Game.crash.vTarget=200;Game.launch();},c);
  let done=false;
  for(let k=0;k<80;k++){await page.waitForTimeout(500);
    done=await page.evaluate(()=>Game.crash.phase==='report');if(done)break;}
  const r=await page.evaluate(()=>({ok:Game.veh.body.ok(),phase:Game.crash.phase,
    g:+Game.veh.peakG.toFixed(0),vol:+Game.vis.defVol.toFixed(1)}));
  console.log('200km/h car'+c+':',JSON.stringify(r));
  if(!r.ok)errors.push('200km/h car'+c+' NaN');
  if(!done)errors.push('200km/h car'+c+' no report (phase='+r.phase+')');}
await page.screenshot({path:DIR+'/shots/20_wall200.png'});

// 2. drop tower 20m: teleport onto deck, drive off
await page.evaluate(async()=>{
  Game.mode='free';Game.opts.carIdx=0;Game.opts.mapId='proving';Game.startGame();
  await new Promise(r=>setTimeout(r,200));
  Game.veh.reset(220,140,0,false);
  Game.veh.body.pos.y=21;Game.veh.body.vel.set(0,0,9);
  Game.veh.controlLock=true;Game.veh.throttle=1;Game.veh.driveMode='D';});
await page.waitForTimeout(9000);
const drop=await page.evaluate(()=>({ok:Game.veh.body.ok(),y:+Game.veh.body.pos.y.toFixed(1),
  grounded:Game.veh.grounded,spd:+(Game.veh.speed*3.6).toFixed(0)}));
console.log('drop tower:',JSON.stringify(drop));
if(!drop.ok)errors.push('drop tower NaN');
if(drop.y<-5)errors.push('drop tower fell through: y='+drop.y);

// 3. flip prompt: put car upside down
await page.evaluate(async()=>{
  Game.veh.controlLock=false;
  Game.veh.reset(0,0,0,false);
  Game.veh.body.quat.setFromEuler(new THREE.Euler(0,0,Math.PI));
  Game.veh.body.pos.y=Game.world.height(0,0)+1.4;});
await page.waitForTimeout(13000);
const flip=await page.evaluate(()=>({flipT:+Game.veh.flipT.toFixed(1),
  blink:$("btnReset").classList.contains("blink")}));
console.log('flip:',JSON.stringify(flip));
if(!flip.blink)errors.push('flip prompt not blinking: '+JSON.stringify(flip));

// 4. editor: empty map save must not crash & must warn
const edited=await page.evaluate(()=>{
  Game.exitToMenu();Editor.open(null);
  $("edName").value="빈맵";
  $("edSave").click();
  const warned=$("toast").classList.contains("on");
  $("edExit").click();
  return warned;});
console.log('empty map save warned:',edited);
if(!edited)errors.push('empty map save: no warning toast');

// 5. rapid mode/map switching x18
await page.evaluate(async()=>{
  const combos=[['free',0,'ice'],['race',1,'raceway'],['time',2,'city'],['drift',3,'dunes'],
    ['crash',4,'proving'],['free',3,'mountain']];
  for(let k=0;k<18;k++){
    const[m,c,mp]=combos[k%combos.length];
    Game.mode=m;Game.opts.carIdx=c;Game.opts.mapId=mp;Game.startGame();
    await new Promise(r=>setTimeout(r,180));}});
await page.waitForTimeout(1000);
const fin=await page.evaluate(()=>({ok:Game.veh.body.ok(),state:Game.state}));
console.log('rapid switch:',JSON.stringify(fin));
if(!fin.ok)errors.push('rapid switch NaN');

// 6. 60s sustained drive memory sanity (drive loops on raceway with AI)
await page.evaluate(async()=>{
  Game.mode='race';Game.opts.carIdx=1;Game.opts.mapId='raceway';Game.opts.aiCount=5;Game.startGame();
  await new Promise(r=>setTimeout(r,4000));
  Game.veh.controlLock=true;});
for(let k=0;k<12;k++){
  await page.waitForTimeout(5000);
  const s=await page.evaluate(()=>{
    const v=Game.veh;v.throttle=.8;v.driveMode='D';
    // crude auto-steer to first AI's waypoint line
    const wps=Game.world.waypoints;if(wps){const a=Game.ais[0];
      const wp=wps[a.wp%wps.length];
      const yaw=Math.atan2(2*(v.body.quat.w*v.body.quat.y+v.body.quat.x*v.body.quat.z),
        1-2*(v.body.quat.y*v.body.quat.y+v.body.quat.x*v.body.quat.x));
      let ang=Math.atan2(wp.x-v.body.pos.x,wp.z-v.body.pos.z)-yaw;
      while(ang>Math.PI)ang-=2*Math.PI;while(ang<-Math.PI)ang+=2*Math.PI;
      v.steerIn=Math.max(-1,Math.min(1,ang));}
    return{ok:v.body.ok(),aisOk:Game.ais.every(a=>a.veh.body.ok()),
      mem:performance.memory?(performance.memory.usedJSHeapSize/1048576).toFixed(0):'?'};});
  if(!s.ok||!s.aisOk)errors.push('sustained drive NaN at '+k*5+'s');
  if(k%4===0)console.log('sustain t='+k*5+'s',JSON.stringify(s));}
await page.screenshot({path:DIR+'/shots/21_sustain.png'});

console.log('\n==== STRESS RESULT ====');
console.log(errors.length?errors.join('\n'):'NO ERRORS 🎉');
await browser.close();
process.exit(errors.length?1:0);
