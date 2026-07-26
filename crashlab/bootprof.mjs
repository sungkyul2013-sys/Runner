/* CarVisual 내부 단계별 비용 — 어떤 차의 무엇이 로딩을 잡아먹나 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
import{writeFileSync,appendFileSync}from'fs';
const LOG='/tmp/bootprof.json';writeFileSync(LOG,'');
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:480,height:320}});
p.on('pageerror',e=>appendFileSync(LOG,'PE '+String(e).slice(0,200)+'\n'));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<300;i++){await p.waitForTimeout(100);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
const r=await p.evaluate(()=>{
  const out=[];
  const OrigLat=window.SoftLattice;
  for(const spec of CARS){
    const t0=performance.now();
    const v=new CarVisual(spec,spec.colors[0]);
    const t1=performance.now();
    const lat=v.lattice;
    let nv=0;if(lat)for(const bd of lat.binds)nv+=bd.vc;
    v.dispose();
    out.push({id:spec.id,total:+(t1-t0).toFixed(0),latVerts:nv});}
  // 래티스 없이 만들면 얼마나 빨라지나 (bind 비용 분리)
  const saved=SoftLattice.prototype.bind;
  SoftLattice.prototype.bind=function(){};
  const out2=[];
  for(const spec of CARS){
    const t0=performance.now();
    const v=new CarVisual(spec,spec.colors[0]);
    const t1=performance.now();
    v.dispose();
    out2.push({id:spec.id,noBind:+(t1-t0).toFixed(0)});}
  SoftLattice.prototype.bind=saved;
  return out.map((o,i)=>({...o,...out2[i]}));});
appendFileSync(LOG,JSON.stringify(r,null,0)+'\n');
await b.close();
