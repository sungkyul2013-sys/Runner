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
    const xw=sp.wheels.trackVis||sp.wheels.track, R=sp.wheels.radius;
    /* 아치 개구부 = 바퀴 높이대에서 차체 옆면이 '없는' z 구간.
       휠 중심 높이 근방(y ±0.12R)에서 |x|>0.55*xw 인 정점의 z 히스토그램을 만들고,
       비어 있는(=개구부) 구간의 중심을 앞/뒤로 찾는다. */
    const N=240, zmin=-3.2, zmax=3.2, bin=new Float64Array(N);
    for(let i=0;i<a.length;i+=3){
      if(Math.abs(a[i])<xw*.55)continue;
      if(a[i+1]>R*.55||a[i+1]<-R*.55)continue;
      const t=Math.floor((a[i+2]-zmin)/(zmax-zmin)*N);
      if(t>=0&&t<N)bin[t]++;}
    // 빈 구간(개구부) 찾기
    const empty=[];for(let i=0;i<N;i++)if(bin[i]<2)empty.push(i);
    const runs=[];let s0=null,pr=-9;
    for(const i of empty){if(i!==pr+1){if(s0!==null)runs.push([s0,pr]);s0=i;}pr=i;}
    if(s0!==null)runs.push([s0,pr]);
    const zc=r=>zmin+((r[0]+r[1])/2+.5)/N*(zmax-zmin);
    const big=runs.filter(r=>r[1]-r[0]>=4).map(r=>({z:+zc(r).toFixed(3),len:+(((r[1]-r[0]+1)/N)*(zmax-zmin)).toFixed(2)}));
    out[id]={현재_front:+sp.wheels.front.toFixed(3),현재_rear:+sp.wheels.rear.toFixed(3),
      개구부후보:big.slice(0,6)};}
  return out;})));
await b.close();
