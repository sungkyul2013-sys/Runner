/* 변경된 코드 경로 오류 점검: 풀/아티팩트 두 빌드 부팅 + 전 차량 쇼룸·주행 시작.
   결과는 stdout 버퍼링을 타지 않도록 /tmp/qe.json 에 직접 쓴다. */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
import{readFileSync,writeFileSync,appendFileSync}from'fs';
const DIR='/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad/crashlab';
const LOG='/tmp/qe.json';
writeFileSync(LOG,'start\n');
writeFileSync(DIR+'/art-wrapped.html','<!doctype html><html><head></head><body>'
  +readFileSync(DIR+'/crashlab-artifact.html','utf8')+'</body></html>');
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
let errs=0;
for(const f of [DIR+'/crashlab.html',DIR+'/art-wrapped.html']){
  const nm=f.split('/').pop();
  const p=await b.newPage({viewport:{width:480,height:320}});
  p.on('pageerror',e=>{errs++;appendFileSync(LOG,'PE '+nm+' '+String(e).slice(0,200)+'\n');});
  p.on('console',m=>{if(m.type()==='error'){errs++;appendFileSync(LOG,'CE '+nm+' '+m.text().slice(0,200)+'\n');}});
  await p.goto('file://'+f);
  for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
  for(let i=0;i<60;i++){await p.waitForTimeout(250);
    if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
  appendFileSync(LOG,nm+' booted\n');
  const ids=await p.evaluate(()=>(typeof CARS!=='undefined'?CARS.map(c=>c.id):[]));
  for(const id of ids){
    await p.evaluate(c=>{if(typeof Showroom!=='undefined'){
      Showroom.enter();Showroom.show(CARS.findIndex(x=>x.id===c),0);}},id);
    await p.waitForTimeout(120);
    await p.evaluate(c=>{Game.mode='free';Game.opts.carIdx=CARS.findIndex(x=>x.id===c);
      Game.opts.mapId='proving';Game.startGame();},id);
    await p.waitForTimeout(300);
    appendFileSync(LOG,'  '+id+' ok errs='+errs+'\n');}
  await p.close();}
appendFileSync(LOG,errs?('ERRORS '+errs+'\n'):'NO ERRORS\n');
await b.close();
