/* 롤스로이스 서스펜션 스윕 — 한 브라우저에서 파라미터 세트를 갈아 끼우며 큰 턱 통과 계측 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:400,height:280}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,180)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
const SETS=JSON.parse(process.argv[3]);
const H=+(process.argv[4]||.16), KMH=+(process.argv[5]||45);
console.log('== bump h='+H+' v='+KMH+' ==');
for(const S of SETS){
  const r=await p.evaluate(({S,H,KMH})=>{
    const spec=CARS.find(c=>c.id==='rrghost');
    Object.assign(spec.susp,S.susp||{});
    Game.mode='free';Game.opts.carIdx=CARS.findIndex(c=>c.id==='rrghost');
    Game.opts.mapId='proving';Game.startGame();
    const v=Game.veh,bd=v.body,w=Game.world;
    w.bumps=[];w.potholes=[];w.rippleZones=null;w.roadRough=0;
    const Z0=-296,ZB=-265,V=KMH/3.6,DT=1/120;
    w.addBump(0,ZB,0,7,1.1,H,'arch');
    v.reset(0,Z0,0,true);
    for(let i=0;i<420;i++){bd.vel.set(0,bd.vel.y,0);v.throttle=0;v.brake=0;v.steerIn=0;
      Game.state='play';Game.frame(DT);Game.state='__prof';}
    const y0=bd.pos.y;let yMax=-9,yMin=9,pMax=0,air=0,zero=0,rearUp=0;
    let lastBad=0,i2=0;
    for(let i=0;i<560;i++){
      bd.vel.z=V;bd.vel.x=0;v.throttle=.18;v.brake=0;v.steerIn=0;
      Game.state='play';Game.frame(DT);Game.state='__prof';
      const e=new THREE.Euler().setFromQuaternion(bd.quat,'YXZ');
      const gh=w.height(bd.pos.x,bd.pos.z);
      const rel=bd.pos.y-gh-(y0-w.height(0,Z0));
      if(rel>yMax)yMax=rel;if(rel<yMin)yMin=rel;
      if(Math.abs(e.x)>pMax)pMax=Math.abs(e.x);
      const g=v.wheels.filter(q=>q.onGround).length;
      if(g===0)air++;
      // 뒷바퀴만 뜨는 프레임
      if(v.wheels[2].onGround===false&&v.wheels[3].onGround===false&&g>0)rearUp++;
      for(const q of v.wheels)if(q.susF<=1)zero++;
      if(Math.abs(rel)>.012||Math.abs(e.x)>.012){lastBad=i;}
      i2=i;}
    return{차체상승:+(yMax*100).toFixed(1),차체하강:+(yMin*100).toFixed(1),
      피치도:+(pMax*180/Math.PI).toFixed(2),공중:air,뒤들림:rearUp,힘0:zero,
      안정거리m:+((560-lastBad)/120*KMH/3.6).toFixed(1)};},{S,H,KMH});
  console.log(S.name.padEnd(10),JSON.stringify(r));}
await b.close();
