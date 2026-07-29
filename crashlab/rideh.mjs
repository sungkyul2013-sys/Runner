/* 정지 차고 실측 — 차체 바닥/문턱 높이, 휠 중심, 아치 여유, 정하중 처짐 */
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
  for(const id of['rrghost','maybach','veloce']){
    Game.mode='free';Game.opts.carIdx=CARS.findIndex(c=>c.id===id);
    Game.opts.mapId='proving';Game.startGame();
    const v=Game.veh,bd=v.body,w=Game.world,sp=v.spec;
    w.bumps=[];w.potholes=[];w.rippleZones=null;w.roadRough=0;
    v.reset(0,-290,0,true);
    for(let i=0;i<400;i++){Game.state='play';Game.frame(1/120);Game.state='__p';}
    const gy=w.height(bd.pos.x,bd.pos.z);
    const comp=v.wheels.reduce((s,q)=>s+q.comp,0)/4;
    // 차체 메시 실제 최저점(월드)
    let minY=9;
    const g=Game.vis.bodyMesh.geometry.attributes.position.array;
    for(let i=1;i<g.length;i+=3)if(g[i]<minY)minY=g[i];
    out[id]={정지차고cm:+((bd.pos.y-gy)*100).toFixed(1),
      차체바닥cm:+((bd.pos.y+minY-gy)*100).toFixed(1),
      휠중심cm:+((Game.vis.wheelMeshes[0].getWorldPosition(new THREE.Vector3()).y-gy)*100).toFixed(1),
      처짐cm:+(comp*100).toFixed(1),
      스트로크cm:+(sp.susp.travel*100).toFixed(1),
      처짐비율pct:+(comp/sp.susp.travel*100).toFixed(0),
      범프여유cm:+((sp.susp.travel-comp)*100).toFixed(1),
      타이어반경cm:+(sp.wheels.radius*100).toFixed(1)};}
  return out;}),null,1));
await b.close();
