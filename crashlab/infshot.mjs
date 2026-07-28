import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:960,height:620}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,200)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
await p.evaluate(()=>{Game.mode='free';Game.opts.carIdx=CARS.findIndex(c=>c.id==='gt');
  Game.opts.mapId='infinity';Game.startGame();});
await p.waitForTimeout(1200);
const views=[['end',[0,150,1300],[0,60,1640]],['bridge',[220,90,-40],[0,20,230]],
             ['start',[90,45,-1780],[0,3,-1300]],['mtn',[260,140,480],[0,50,760]]];
for(const[nm,cam,look]of views){
  await p.evaluate(({cam,look})=>{
    Game.state='__shot';window.requestAnimationFrame=()=>0;
    document.querySelectorAll('.hud,#hud,#touch,.touch,#topbar,.topbar,#dash,.dash').forEach(e=>e&&(e.style.display='none'));
    camera.fov=58;camera.updateProjectionMatrix();
    camera.position.set(cam[0],cam[1],cam[2]);camera.lookAt(look[0],look[1],look[2]);
    renderer.render(scene,camera);renderer.render(scene,camera);},{cam,look});
  await p.waitForTimeout(250);
  await p.screenshot({path:'/tmp/inf_'+nm+'.png'});}
console.log('ok');
await b.close();
