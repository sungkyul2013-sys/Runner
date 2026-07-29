/* 전 맵: '도로라는 띠' 위에 남아 있는 충돌체 (주차장·광장·야적장은 제외되는 판정) */
import{chromium}from'/opt/node22/lib/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:400,height:300}});
p.on('pageerror',e=>console.log('PE',String(e).slice(0,250)));
await p.goto('file://'+process.argv[2]);
for(let i=0;i<80;i++){await p.waitForTimeout(300);if(await p.evaluate(()=>!!window.Game))break;}
for(let i=0;i<60;i++){await p.waitForTimeout(250);
  if(await p.evaluate(()=>document.getElementById('loading').classList.contains('off')))break;}
const ids=await p.evaluate(()=>MAPS.filter(m=>!m.custom).map(m=>m.id));
let tot=0;
for(const id of ids){
  const r=await p.evaluate(mapId=>{
    Game.mode='free';Game.opts.carIdx=1;Game.opts.mapId=mapId;Game.startGame();
    const w=Game.world,cell=w.cell,half=w.size*.5;
    const paved=(x,z)=>{const n=SURF_IDS[w.surf(x,z)];
      return n==="asphalt"||n==="lane"||n==="curb";};
    const RUN=46,ST=Math.max(1.6,cell*.5);
    const run=(x,z,dx,dz)=>{let d=ST;while(d<=RUN&&paved(x+dx*d,z+dz*d))d+=ST;return d-ST;};
    const onRoad=(x,z)=>{if(!paved(x,z))return false;
      const D=[[1,0],[0,1],[.7071,.7071],[.7071,-.7071]];
      for(let a=0;a<4;a++){const[dx,dz]=D[a],[px,pz]=D[(a+2)%4];
        if(Math.min(run(x,z,dx,dz),run(x,z,-dx,-dz))<20)continue;
        const l=run(x,z,px,pz),r=run(x,z,-px,-pz);
        if(l<3||r<3)continue;
        if(Math.min(l,r)<=14)return true;}
      return false;};
    const tags={};let n=0;const ex=[];
    for(const bx of w.boxes){
      const c=bx.c,h=bx.half,gy=w.height(c.x,c.z);
      if(c.y-h.y>gy+1.6||c.y+h.y<gy+.12)continue;
      if(c.y+h.y-gy<.35)continue;
      if(Math.abs(c.x)>half-cell*3||Math.abs(c.z)>half-cell*3)continue;
      if(!onRoad(c.x,c.z))continue;
      const t=bx.tag||"?";tags[t]=(tags[t]||0)+1;n++;
      if(ex.length<6)ex.push(t+' '+Math.round(c.x)+','+Math.round(c.z));}
    return{n,tags,ex};},id);
  tot+=r.n;
  if(r.n)console.log(id.padEnd(9),String(r.n).padStart(4),JSON.stringify(r.tags),r.ex.join(' | '));
}
console.log("=== 도로(띠) 위 잔존 충돌체 총",tot,"===");
await b.close();
