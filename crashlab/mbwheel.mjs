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
  for(const id of['maybach','veloce']){
    Game.mode='free';Game.opts.carIdx=CARS.findIndex(c=>c.id===id);
    Game.opts.mapId='proving';Game.startGame();
    const v=Game.vis,sp=Game.veh.spec;
    const a=v.bodyMesh.geometry.attributes.position.array;
    const zw=sp.wheels.front,xw=sp.wheels.trackVis;
    // 앞 휠 중심 z 근방에서 아치 개구부의 최고점과 바깥 x
    let archTop=-9,outX=0;
    for(let i=0;i<a.length;i+=3){
      if(Math.abs(a[i+2]-zw)<.20&&Math.abs(a[i])>xw*.55){
        if(a[i+1]<1.0&&a[i+1]>archTop)archTop=a[i+1];
        const q=Math.abs(a[i]);if(q>outX)outX=q;}}
    const wm=v.wheelMeshes[0];
    const g=wm.children[0].geometry;g.computeBoundingBox();
    const bb=g.boundingBox, sc=wm.children[0].scale;
    out[id]={물리반경:+sp.wheels.radius.toFixed(3),
      휠메시반경:+((bb.max.y-bb.min.y)/2*sc.y).toFixed(3),
      휠메시폭:+((bb.max.x-bb.min.x)*sc.x).toFixed(3),
      아치최고y:+archTop.toFixed(3),차체최외x:+outX.toFixed(3),
      휠중심y:+wm.position.y.toFixed(3),trackVis:+xw.toFixed(3),
      아치여유cm:+(((archTop-wm.position.y)-(bb.max.y-bb.min.y)/2*sc.y)*100).toFixed(1),
      휠바깥돌출cm:+((xw+ (bb.max.x-bb.min.x)*sc.x/2 - outX)*100).toFixed(1)};}
  return out;})));
await b.close();
