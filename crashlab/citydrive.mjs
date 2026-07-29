/* 도시 도로망 실주행 — 포장 '띠' 위 지점을 도로 방향으로 실제로 달려 막힘을 찾는다 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:420,height:300}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,250)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
const id=process.argv[3]||'grand', NP=+(process.argv[4]||120);
console.log(JSON.stringify(await p.evaluate(({mapId,NP})=>{
  Game.mode='free';Game.opts.carIdx=CARS.findIndex(c=>c.id==='gt');
  Game.opts.mapId=mapId;Game.startGame();
  const v=Game.veh,bd=v.body,w=Game.world,cell=w.cell,half=w.size*.5;
  const paved=(x,z)=>{const n=SURF_IDS[w.surf(x,z)];
    return n==="asphalt"||n==="lane"||n==="curb";};
  const RUN=46,ST=Math.max(1.6,cell*.5);
  const run=(x,z,dx,dz)=>{let d=ST;while(d<=RUN&&paved(x+dx*d,z+dz*d))d+=ST;return d-ST;};
  /* 도로 방향은 16방향 스윕으로 '포장이 가장 길게 이어지는 축'을 고른다
     (4방향만 보면 대각선 도로에서 갓길 밖으로 몰아 난간을 들이받는다) */
  const dirOf=(x,z)=>{if(!paved(x,z))return null;
    let best=null,bl=0;
    for(let a=0;a<16;a++){const th=a/16*Math.PI,dx=Math.sin(th),dz=Math.cos(th);
      const along=Math.min(run(x,z,dx,dz),run(x,z,-dx,-dz));
      if(along>bl){bl=along;best={dx,dz,px:dz,pz:-dx};}}
    if(!best||bl<20)return null;
    const l=run(x,z,best.px,best.pz),r=run(x,z,-best.px,-best.pz);
    if(l<3||r<3||Math.min(l,r)>14)return null;
    return best;};
  let sd=99991;const rr=()=>{sd=(sd*1103515245+12345)&0x7fffffff;return sd/0x7fffffff;};
  const pts=[];
  for(let k=0;k<NP*400&&pts.length<NP;k++){
    const x=(rr()-.5)*w.size*.92,z=(rr()-.5)*w.size*.92;
    const d=dirOf(x,z);if(!d)continue;
    if(pts.some(q=>Math.hypot(q.x-x,q.z-z)<60))continue;
    pts.push({x,z,d});}
  const bad=[];
  for(const q of pts){
    const yaw=Math.atan2(q.d.dx,q.d.dz);
    v.reset(q.x,q.z,yaw,true);for(const t in v.dmg)v.dmg[t]=0;
    for(let i=0;i<40;i++){Game.state='play';Game.frame(1/120);Game.state='__p';}
    const x0=bd.pos.x,z0=bd.pos.z;
    for(let i=0;i<110;i++){bd.vel.x=Math.sin(yaw)*15;bd.vel.z=Math.cos(yaw)*15;
      v.throttle=.6;v.brake=0;v.steerIn=0;Game.state='play';Game.frame(1/120);Game.state='__p';}
    const moved=Math.hypot(bd.pos.x-x0,bd.pos.z-z0);
    if(moved<9){
      // 멈춘 자리 주변 충돌체
      let near='';let bestd=1e9;
      for(const bx of w.boxes){const d2=Math.hypot(bx.c.x-bd.pos.x,bx.c.z-bd.pos.z);
        if(d2<bestd&&d2<14){bestd=d2;near=(bx.tag||'?')+'@'+Math.round(d2);}}
      bad.push({x:Math.round(q.x),z:Math.round(q.z),이동:+moved.toFixed(1),near});}}
  return{점검:pts.length,문제:bad.length,목록:bad.slice(0,14)};},{mapId:id,NP})));
await b.close();
