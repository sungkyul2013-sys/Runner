import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:900,height:620}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,200)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<60;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Showroom))break;}
await p.waitForTimeout(1500);
await p.evaluate(c=>{Showroom.enter();Showroom.show(CARS.findIndex(x=>x.id===c),0);},process.argv[3]);
await p.waitForTimeout(900);
const views=[['front',0,[0,.9,7.2],[0,.75,0],26],['rear',Math.PI,[0,.9,7.2],[0,.75,0],26],
             ['low',0,[2.6,.15,5.2],[0,.45,0],28],['under',0,[0,-1.6,5.0],[0,.2,0],30]];
for(const[nm,rot,cam,look,fov]of views){
  await p.evaluate(({rot,cam,look,fov})=>{
    document.querySelectorAll('#menu,#menuWrap,.menu,#hud,#srUI').forEach(e=>e&&(e.style.display='none'));
    Showroom.active=false;Showroom.spin=0;Showroom.drag=rot;Showroom.dragV=0;
    Showroom.carRoot.rotation.y=rot;camera.fov=fov;camera.updateProjectionMatrix();
    camera.position.set(cam[0],Showroom.Y+cam[1],cam[2]);camera.lookAt(look[0],Showroom.Y+look[1],look[2]);
    if(window.skyDome)skyDome.position.set(camera.position.x,Showroom.Y-300,camera.position.z);
    renderer.render(scene,camera);},{rot,cam,look,fov});
  await p.waitForTimeout(300);
  await p.screenshot({path:'/tmp/mb_'+nm+'.png'});}
console.log('ok');
await b.close();
