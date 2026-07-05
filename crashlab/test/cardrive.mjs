import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const DIR='/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad/crashlab';
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:900,height:440}});
page.on('pageerror',e=>console.log('PAGEERR',String(e).slice(0,250)));
await page.goto('file://'+DIR+'/crashlab.html');
await page.waitForTimeout(1500);
for(let c=0;c<6;c++){
  await page.evaluate(c=>{Game.mode='free';Game.opts.carIdx=c;Game.opts.mapId='proving';Game.startGame();},c);
  await page.waitForTimeout(600);
  await page.evaluate(()=>{Game.cam.orbitYaw=Math.PI/2;Game.cam.orbitPitch=.18;Game.cam.dist=5.5;Game.cam.userT=99;});
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2600);
  await page.keyboard.up('ArrowUp');
  const s=await page.evaluate(()=>({
    id:Game.veh.spec.id,spd:+(Game.veh.speed*3.6).toFixed(0),y:+Game.veh.body.pos.y.toFixed(2),
    grounded:Game.veh.grounded,ok:Game.veh.body.ok(),
    hx:+Game.veh.spec.body.hx.toFixed(2),hy:+Game.veh.spec.body.hy.toFixed(2),
    track:+Game.veh.spec.wheels.track.toFixed(2),r:+Game.veh.spec.wheels.radius.toFixed(2),
    wy:+Game.veh.spec.wheels.y.toFixed(2)}));
  console.log(JSON.stringify(s));
  await page.screenshot({path:DIR+'/shots/60_car'+c+'.png'});}
await browser.close();
