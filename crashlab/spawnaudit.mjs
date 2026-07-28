/* 전 맵 스폰·장소 지점이 실제 포장 위인지 검사 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:400,height:300}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,250)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
const ids=await p.evaluate(()=>MAPS.filter(m=>!m.custom).map(m=>m.id));
let tot=0,bad=0;
for(const id of ids){
  const r=await p.evaluate(mapId=>{
    Game.mode='free';Game.opts.carIdx=1;Game.opts.mapId=mapId;Game.startGame();
    const w=Game.world;
    const drive=s=>{const n=SURF_IDS[s];return n==="asphalt"||n==="lane"||n==="curb"||n==="concrete"||n==="sand"||n==="gravel"||n==="dirt"||n==="snow"||n==="ice";};
    const chk=(nm,x,z)=>{
      const s=w.surf(x,z);
      /* 실제 스폰처럼 차를 놓고 안정화시켜 본다 — 떨어지거나 기울면 나쁜 지점 */
      const v=Game.veh;v.reset(x,z,0,true);
      for(let i=0;i<180;i++){Game.state='play';Game.frame(1/120);Game.state='__p';}
      const bd=v.body;
      const e=new THREE.Euler().setFromQuaternion(bd.quat,'YXZ');
      const gy=w.height(x,z);
      return{이름:nm,x:Math.round(x),z:Math.round(z),포장:SURF_IDS[s],
        ok:drive(s)&&Math.abs(e.x)<.22&&Math.abs(e.z)<.22&&Math.abs(bd.pos.y-gy)<3,
        기울기도:+(Math.max(Math.abs(e.x),Math.abs(e.z))*180/Math.PI).toFixed(1),
        낙차:+(bd.pos.y-gy).toFixed(1)};};
    const out=[];
    out.push(chk("spawn",w.spawn.x,w.spawn.z));
    for(const pl of (w.places||[]))out.push(chk(pl.name,pl.x,pl.z));
    return out;},id);
  const nb=r.filter(o=>!o.ok);
  tot+=r.length;bad+=nb.length;
  if(nb.length)console.log(id,JSON.stringify(nb.slice(0,6)));
}
console.log("=== 총",tot,"지점 중 문제",bad,"===");
await b.close();
