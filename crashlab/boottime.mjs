/* 부팅 시간 프로파일 — 어디서 시간이 가는지 단계별로 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
import{writeFileSync,appendFileSync}from'fs';
const LOG='/tmp/boot.json';writeFileSync(LOG,'');
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:480,height:320}});
p.on('pageerror',e=>appendFileSync(LOG,'PE '+String(e).slice(0,200)+'\n'));
const t0=Date.now();
await p.goto('file://'+process.argv[2]);
let tGame=0,tLoad=0;
for(let i=0;i<200;i++){await p.waitForTimeout(100);
  if(await p.evaluate(()=>!!window.Game)){tGame=Date.now()-t0;break;}}
for(let i=0;i<300;i++){await p.waitForTimeout(100);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off'))){tLoad=Date.now()-t0;break;}}
appendFileSync(LOG,'script-eval(Game 정의) '+tGame+'ms\n로딩완료 '+tLoad+'ms\n');
/* 내부 단계 계측 */
const prof=await p.evaluate(()=>{
  const r={};
  const t=()=>performance.now();
  // 베이크 디코드 비용(캐시 비우고 재측정)
  const names=Object.keys(BAKED);
  r.baked={};
  for(const n of names){const e=BAKED[n];
    const sz=(e.p?e.p.length:0)+(e.i?e.i.length:0);
    const had=!!e._arr;
    if(!had){const a=t();Assets.arrays(e);r.baked[n]=[+(t()-a).toFixed(1),(sz/1024)|0,'cold'];}
    else r.baked[n]=[0,(sz/1024)|0,'warm'];}
  r.perf=(performance.getEntriesByType('navigation')[0]||{}).duration|0;
  return r;});
appendFileSync(LOG,JSON.stringify(prof,null,1)+'\n');
await b.close();
