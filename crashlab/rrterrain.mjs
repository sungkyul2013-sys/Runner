/* 롤스로이스 지형별 서스펜션 계측 — 인피니티 하이웨이 노선을 실제로 달리며
   차고 편차·바닥침(comp 포화)·힘 포화(fCap)·공중 프레임을 구간별로 기록 */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:420,height:300}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,200)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
const SETS=JSON.parse(process.argv[3]||'[{"name":"현재"}]');
const CAR=process.env.CARID||'rrghost';
for(const S of SETS){
  const r=await p.evaluate(({S,CAR})=>{
    const spec=CARS.find(c=>c.id===CAR);
    if(S.susp)Object.assign(spec.susp,S.susp);
    if(S.set)Object.assign(spec,S.set);
    Game.mode='free';Game.opts.carIdx=CARS.findIndex(c=>c.id===CAR);
    Game.opts.mapId='infinity';Game.startGame();
    const v=Game.veh,bd=v.body,w=Game.world,rt=(w.exRoutes||[])[0];
    const acc=[0];
    for(let k=1;k<rt.length;k++)acc.push(acc[k-1]+Math.hypot(rt[k].x-rt[k-1].x,rt[k].z-rt[k-1].z));
    const TOT=acc[acc.length-1];
    const at=t=>{const d=Math.max(0,Math.min(1,t))*TOT;let k=1;
      while(k<acc.length-1&&acc[k]<d)k++;
      const f=(d-acc[k-1])/Math.max(1e-6,acc[k]-acc[k-1]),a=rt[k-1],c=rt[k];
      return{x:a.x+(c.x-a.x)*f,y:a.y+(c.y-a.y)*f,z:a.z+(c.z-a.z)*f,
             yaw:Math.atan2(c.x-a.x,c.z-a.z)};};
    const SEG=[["요철",.03],["꿀렁임",.12],["시케인",.20],["모굴",.28],
               ["뱅크",.42],["편측턱",.50],["빨래판",.62],["직선",.85],["산고개",.965]];
    const out={};
    const V=22;                                  // 약 80km/h
    for(const[name,t0]of SEG){
      const s=at(t0);
      v.reset(s.x,s.z,s.yaw,true);
      if(s.y-w.height(s.x,s.z)>3)bd.pos.y=s.y+1.3;
      for(let i=0;i<160;i++){Game.state='play';Game.frame(1/120);Game.state='__p';}
      const rest=spec.susp.rest;
      /* 차고는 '접지점 대비'로 잰다 — w.height() 는 지형이라 계곡 대교 위에서는
         62m 짜리 가짜 상승이 찍힌다(실측: 꿀렁임 구간 +79.9m). */
      const rideH=()=>{let s=0,n=0;
        for(const q of v.wheels)if(q.onGround){s+=bd.pos.y-q.cW.y;n++;}
        return n?s/n:null;};
      const base=rideH()||0;
      const sx0=bd.pos.x,sz0=bd.pos.z;
      let hi=-9,lo=9,pMax=0,air=0,bottom=0,cap=0,n=0,fMin=1e9,fMax=0,jerk=0,pv=0;
      let prevA=0;
      for(let i=0;i<900;i++){
        // 노선 추종: 앞쪽 점을 향해 조향
        const here={x:bd.pos.x,z:bd.pos.z};
        let bt=0,bd2=1e9;
        for(let q=0;q<=40;q++){const tt=t0+q*.0008,pp=at(tt);
          const d=Math.hypot(pp.x-here.x,pp.z-here.z);if(d<bd2){bd2=d;bt=tt;}}
        const aim=at(bt+.0016);
        const dyaw=Math.atan2(aim.x-here.x,aim.z-here.z);
        const e=new THREE.Euler().setFromQuaternion(bd.quat,'YXZ');
        let dd=dyaw-e.y;while(dd>Math.PI)dd-=2*Math.PI;while(dd<-Math.PI)dd+=2*Math.PI;
        v.steerIn=Math.max(-1,Math.min(1,dd*1.6));
        /* 속도는 직접 구동한다 — Game.frame 이 입력을 다시 덮어써 throttle 이 먹지 않는다 */
        bd.vel.x=Math.sin(dyaw)*V;bd.vel.z=Math.cos(dyaw)*V;
        v.throttle=.2;v.brake=0;
        Game.state='play';Game.frame(1/120);Game.state='__p';
        const rh=rideH();
        if(rh!==null){const rel=rh-base;if(rel>hi)hi=rel;if(rel<lo)lo=rel;}
        if(Math.abs(e.x)>pMax)pMax=Math.abs(e.x);
        const g=v.wheels.filter(q=>q.onGround).length;
        if(g===0)air++;
        for(const q of v.wheels){n++;
          if(q.onGround&&q.comp>=rest-.012)bottom++;
          if(q.onGround&&q.susF>=spec.mass*9.81*(spec.susp.fCap||1.4)-30)cap++;
          if(q.onGround){if(q.susF<fMin)fMin=q.susF;if(q.susF>fMax)fMax=q.susF;
            if(q.susF<=1)pv++;}}
        const az=bd.vel.y;const jj=Math.abs(az-prevA)*120;prevA=az;
        if(jj>jerk)jerk=jj;}
      out[name]={주행m:Math.round(Math.hypot(bd.pos.x-sx0,bd.pos.z-sz0)),
        상승cm:+(hi*100).toFixed(1),하강cm:+(lo*100).toFixed(1),
        피치도:+(pMax*180/Math.PI).toFixed(1),공중:air,
        바닥침pct:+(bottom/n*100).toFixed(1),힘포화pct:+(cap/n*100).toFixed(1),
        지지0:pv,최대가속g:+(jerk/9.81).toFixed(2)};}
    return out;},{S,CAR});
  console.log('##',S.name);
  for(const k in r)console.log('  ',k.padEnd(6),JSON.stringify(r[k]));
}
await b.close();
