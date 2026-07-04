import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
import{readFileSync,writeFileSync}from'fs';
const DIR='/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad/crashlab';
// wrap artifact variant like the host does
writeFileSync(DIR+'/art-wrapped.html','<!doctype html><html><head></head><body>'+readFileSync(DIR+'/crashlab-artifact.html','utf8')+'</body></html>');
const errors=[];
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:900,height:440}});
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text().slice(0,200));});
page.on('pageerror',e=>errors.push('pageerror: '+String(e).slice(0,200)));
await page.goto('file://'+DIR+'/art-wrapped.html');
await page.waitForTimeout(1800);
const boot=await page.evaluate(()=>({loaded:$("loading").classList.contains("off"),hasGame:typeof Game!=='undefined'}));
console.log('artifact-variant boot:',JSON.stringify(boot));
if(!boot.loaded)errors.push('artifact variant stuck at loading');
// quick drive on grand map with GT over bumps
await page.evaluate(()=>{Game.mode='free';Game.opts.carIdx=1;Game.opts.mapId='grand';Game.startGame();});
await page.waitForTimeout(800);
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(6000);
const s=await page.evaluate(()=>({spd:+(Game.veh.speed*3.6).toFixed(0),ok:Game.veh.body.ok(),
  y:+Game.veh.body.pos.y.toFixed(2)}));
console.log('grand drive:',JSON.stringify(s));
if(!s.ok)errors.push('grand NaN');
await page.screenshot({path:DIR+'/shots/50_grand.png'});
await page.keyboard.up('ArrowUp');
// steering wheel UI
await page.evaluate(()=>{Settings.steerMode='wheel';Input.applySteerModeUI();});
await page.waitForTimeout(400);
await page.screenshot({path:DIR+'/shots/51_wheel.png'});
// bumps at proving
await page.evaluate(()=>{Settings.steerMode='slider';Input.applySteerModeUI();
  Game.mode='free';Game.opts.carIdx=0;Game.opts.mapId='proving';Game.startGame();
  Game.veh.reset(-20,-40,Math.PI,false);});
await page.waitForTimeout(300);
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(3500);
await page.keyboard.up('ArrowUp');
const b=await page.evaluate(()=>({spd:+(Game.veh.speed*3.6).toFixed(0),ok:Game.veh.body.ok(),z:Game.veh.body.pos.z|0}));
console.log('bump run:',JSON.stringify(b));
await page.screenshot({path:DIR+'/shots/52_bumps.png'});
console.log(errors.length?('ERRORS:\n'+errors.join('\n')):'ARTIFACT VARIANT OK 🎉');
await browser.close();
process.exit(errors.length?1:0);
