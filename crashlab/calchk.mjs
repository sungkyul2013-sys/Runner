/* 캘리퍼가 휠과 함께 도는지 확인 — 회전 메시(children[0])와 형제 메시를 구분해 본다 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:400,height:300}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,200)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
console.log(JSON.stringify(await p.evaluate(()=>{
  Game.mode='free';Game.opts.carIdx=CARS.findIndex(c=>c.id==='rrghost');
  Game.opts.mapId='proving';Game.startGame();
  const g=Game.vis.wheelMeshes[0];
  const kids=g.children.map(o=>({
    tris:o.geometry?o.geometry.index?o.geometry.index.count/3:o.geometry.attributes.position.count/3:0,
    빨강정점:(()=>{const c=o.geometry&&o.geometry.attributes.color;if(!c)return 0;
      let n=0;const a=c.array;for(let i=0;i<a.length;i+=3)if(a[i]>a[i+1]*2.2&&a[i]>.1)n++;return n;})()}));
  // 스핀은 children[0] 에만 걸린다
  Game.vis.wheelMeshes[0].children[0].rotation.x=1.234;
  return{자식수:g.children.length,자식들:kids,
    회전메시_x:g.children[0].rotation.x,
    형제_x:g.children[1]?g.children[1].rotation.x:null};})));
await b.close();
