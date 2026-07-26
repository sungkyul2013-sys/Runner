import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
import{readFileSync,writeFileSync}from'fs';
writeFileSync('/tmp/rw.html','<!doctype html><html><head></head><body>'+readFileSync('/home/user/Runner/crashlab/crashlab-artifact.html','utf8')+'</body></html>');
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:420,height:820},hasTouch:true,isMobile:true});
const errs=[];p.on('pageerror',e=>errs.push('PE:'+String(e).slice(0,200)));p.on('console',m=>{if(m.type()==='error')errs.push('CE:'+m.text().slice(0,180));});
await p.goto('file:///tmp/rw.html');
for(let i=0;i<40;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>{const l=document.getElementById('loading');return l&&l.classList.contains('off');}))break;}
await p.waitForTimeout(900);
async function tap(s){const el=await p.$(s);if(!el)return false;await el.click();await p.waitForTimeout(700);return true;}
// crash mode (proving + compactor) — the exact failing case
await tap('.card.mode[data-m="crash"]');await tap('.carCard[data-i="4"]');await tap('#carNext');await tap('#mapNext');await tap('#go');
console.log('REPO crash+proving →',JSON.stringify(await p.evaluate(()=>({state:Game.state,veh:!!Game.veh,cars:CARS.length,maps:MAPS.length}))),'ERRS',errs.length,errs.slice(0,3).join('|'));
await b.close();
