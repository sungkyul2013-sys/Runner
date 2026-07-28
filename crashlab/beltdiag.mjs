/* 막힌 지점에 무엇이 있는지 — 주변 충돌체 태그 + 전방 지형 프로파일 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:400,height:300}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,200)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
const r=await p.evaluate(()=>{
  Game.mode='free';Game.opts.carIdx=CARS.findIndex(c=>c.id==='gt');
  Game.opts.mapId='grand';Game.startGame();
  const v=Game.veh,bd=v.body,w=Game.world,R=1060,N=360;
  const out=[];
  for(let k=0;k<N;k++){
    const a=k/N*Math.PI*2, ang=a+Math.PI/2;
    const x=Math.cos(a)*R, z=Math.sin(a)*R;
    v.reset(x,z,ang,true);for(const q in v.dmg)v.dmg[q]=0;
    for(let i=0;i<40;i++){Game.state='play';Game.frame(1/120);Game.state='__p';}
    const x0=bd.pos.x,z0=bd.pos.z;
    for(let i=0;i<90;i++){bd.vel.x=Math.cos(ang)*16;bd.vel.z=Math.sin(ang)*16;
      v.throttle=.6;v.brake=0;v.steerIn=0;Game.state='play';Game.frame(1/120);Game.state='__p';}
    const moved=Math.hypot(bd.pos.x-x0,bd.pos.z-z0);
    if(moved>=9.5)continue;
    // 전방 12m 지형 프로파일
    const prof=[];for(let d=0;d<=12;d+=2)prof.push(+w.height(x+Math.cos(ang)*d,z+Math.sin(ang)*d).toFixed(2));
    // 주변 충돌체
    const near=[];
    for(const bx of w.boxes){
      const dd=Math.hypot(bx.x-x,bx.z-z);
      if(dd<16&&bx.y+bx.hy>0.2)near.push({tag:bx.opt&&bx.opt.tag||'?',d:+dd.toFixed(1),
        y:+bx.y.toFixed(1),hy:+bx.hy.toFixed(1),hx:+bx.hx.toFixed(1),hz:+bx.hz.toFixed(1)});}
    near.sort((m,n)=>m.d-n.d);
    const pr=[];
    for(const q of (w.props||[])){const dd=Math.hypot(q.x-x,q.z-z);
      if(dd<18)pr.push({t:q.type||q.kind||'?',d:+dd.toFixed(1)});}
    const mv=[];
    for(const q of (w.movers||[])){const dd=Math.hypot((q.x||0)-x,(q.z||0)-z);
      if(dd<25)mv.push({d:+dd.toFixed(1)});}
    const cr=[];
    for(const q of (w.crushers||[])){const dd=Math.hypot((q.x||0)-x,(q.z||0)-z);if(dd<25)cr.push(+dd.toFixed(1));}
    out.push({deg:+(a*180/Math.PI).toFixed(0),x:+x.toFixed(0),z:+z.toFixed(0),
      이동:+moved.toFixed(1),지형:prof,충돌체:near.slice(0,4),소품:pr.slice(0,4),무버:mv.slice(0,3),기타:cr,
      최종y:+bd.pos.y.toFixed(2),속도:+Math.hypot(bd.vel.x,bd.vel.z).toFixed(1),접지:v.wheels.filter(q=>q.onGround).length});}
  return out;});
console.log(JSON.stringify(r,null,0));
await b.close();
