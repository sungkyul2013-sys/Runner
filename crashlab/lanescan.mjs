/* 고속도로 '차선 위'에 서 있는 충돌체를 정확한 OBB 점검사로 훑는다
   — 노선 전 구간 × 폭 방향 9지점 × 높이 3점 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:400,height:300}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,250)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
for(const id of (process.argv[3]?[process.argv[3]]:['grand','infinity'])){
 const r=await p.evaluate(mapId=>{
  Game.mode='free';Game.opts.carIdx=1;Game.opts.mapId=mapId;Game.startGame();
  const w=Game.world,rs=w.exRoutes||[];
  if(!rs.length)return{오류:"노선 없음"};
  const HW=+13;                                   // 주행 차로 반폭(갓길 제외)
  const out={n:new THREE.Vector3(),depth:0},P=new THREE.Vector3();
  const hits=new Map();
  for(const route of rs)for(let k=0;k<route.length;k++){
    const a=route[k],b2=route[Math.min(route.length-1,k+1)],c=route[Math.max(0,k-1)];
    const yaw=Math.atan2(b2.x-c.x,b2.z-c.z);
    const nx=Math.cos(yaw),nz=-Math.sin(yaw);
    const gy=w.height(a.x,a.z), ry=Math.max(a.y,gy);
    for(let s=-4;s<=4;s++){
      const off=s/4*HW, px=a.x+nx*off, pz=a.z+nz*off;
      for(const bx of w.boxes){
        if(bx.tag==='bridge'||bx.tag==='pit')continue;
        if(Math.abs(bx.c.x-px)>bx.r+1||Math.abs(bx.c.z-pz)>bx.r+1)continue;
        let blocked=false;
        for(const dy of[.30,.75,1.20]){P.set(px,ry+dy,pz);
          if(bx.pointPen(P,out)){blocked=true;break;}}
        if(!blocked)continue;
        const key=(bx.tag||'?')+'|'+Math.round(bx.c.x)+','+Math.round(bx.c.z)+','+Math.round(bx.c.y);
        if(!hits.has(key))hits.set(key,{t:bx.tag||'?',x:Math.round(bx.c.x),z:Math.round(bx.c.z),
          off:+off.toFixed(1)});}}}
  const list=[...hits.values()],by={};
  for(const e of list)(by[e.t]=by[e.t]||[]).push(e);
  return{노선:rs.length,막힘:list.length,
    태그:Object.fromEntries(Object.entries(by).map(([k,v])=>[k,v.length])),
    예:Object.fromEntries(Object.entries(by).map(([k,v])=>[k,v.slice(0,4).map(e=>e.x+','+e.z+' off'+e.off)]))};
 },id);
 console.log('###',id,JSON.stringify(r));
}
await b.close();
