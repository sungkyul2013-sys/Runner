import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
import{writeFileSync}from'fs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:400,height:300}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,200)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
const r=await p.evaluate(()=>{
  const out={};
  for(const id of['rrghost','maybach','veloce']){
    const s=CARS.find(c=>c.id===id),e=BAKED[s.model];
    const w=e.wheel;
    const wr=w&&w.bb?((w.bb[4]-w.bb[1])/2*s.modelScale):null;
    const ww=w&&w.bb?((w.bb[3]-w.bb[0])*s.modelScale):null;
    out[id]={물리반경:+s.wheels.radius.toFixed(3),휠지오반경:wr&&+wr.toFixed(3),
      휠폭:ww&&+ww.toFixed(3),물리폭:+s.wheels.width.toFixed(3),
      visScale:s.wheelVisScale||1,visFit:s.wheelVisFit||1,tuck:s.wheelTuck||0,
      마운트y:+s.wheels.y.toFixed(3),trackVis:+s.wheels.trackVis.toFixed(3),
      rest:+s.susp.rest.toFixed(3),travel:+s.susp.travel.toFixed(3),
      groundClear:s.groundClear||null,radMul:s.wheelRadMul||1};}
  /* 롤스로이스 휠 아치 개구부 실측: 앞바퀴 z 근방에서 차체 하단 가장자리 높이 */
  Game.mode='free';Game.opts.carIdx=CARS.findIndex(c=>c.id==='rrghost');
  Game.opts.mapId='proving';Game.startGame();
  const v=Game.vis,sp=Game.veh.spec;
  const a=v.bodyMesh.geometry.attributes.position.array;
  const zw=sp.wheels.front, xw=sp.wheels.trackVis;
  let arcTop=-9,arcMinY=9;
  for(let i=0;i<a.length;i+=3){
    if(Math.abs(a[i+2]-zw)<.18&&Math.abs(Math.abs(a[i])-xw)<.22){
      if(a[i+1]>arcTop)arcTop=a[i+1];
      if(a[i+1]<arcMinY)arcMinY=a[i+1];}}
  out.rr아치={아치최고y:+arcTop.toFixed(3),아치최저y:+arcMinY.toFixed(3),
    휠중심y:+(Game.vis.wheelMeshes[0].position.y).toFixed(3)};
  return out;});
console.log(JSON.stringify(r,null,1));
await b.close();
