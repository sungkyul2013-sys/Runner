import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:400,height:300}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,200)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
console.log(JSON.stringify(await p.evaluate(()=>{
  const o={};
  for(const id of['maybach','rrghost']){
    Game.mode='free';Game.opts.carIdx=CARS.findIndex(c=>c.id===id);
    Game.opts.mapId='proving';Game.startGame();
    const v=Game.vis;
    const cnt=m=>m?m.geometry.attributes.position.count:0;
    // 앞유리 영역에 유리 정점이 있나
    let wsg=0;
    if(v.glassMesh){const a=v.glassMesh.geometry.attributes.position.array;
      for(let i=0;i<a.length;i+=3)if(a[i+1]>.25&&a[i+2]>.2)wsg++;}
    o[id]={body:cnt(v.bodyMesh),glass:cnt(v.glassMesh),lamps:cnt(v.lampsMesh),앞유리쪽유리정점:wsg};}
  return o;})));
await b.close();
