/* ============================================================
   Editor — 24×24 top-view tile grid
   ============================================================ */
const Editor=(()=>{
  const N=24;
  let tiles=[],name="",tool="road",rot=0,ordSeq=1,cv,ctx2,cell=20,ox=0,oy=0;
  function open(existing){
    if(existing){
      const d=Store.get("maps:"+existing,null);
      tiles=d?d.tiles.map(t=>({...t})):[];name=existing;
      ordSeq=Math.max(0,...tiles.map(t=>t.ord||0))+1;
    }else{tiles=[];name="";ordSeq=1;}
    rot=0;tool="road";
    $("edName").value=name;
    $("menu").classList.remove("on");$("editorScr").classList.add("on");
    buildPalette();resize();draw();
  }
  function close(){$("editorScr").classList.remove("on");$("menu").classList.add("on");UI.show("editorList");}
  function buildPalette(){
    $("edSide").innerHTML=ED_TILES.map(t=>
      '<button class="edTool'+(t.id===tool?" sel":"")+'" data-t="'+t.id+'">'+
      '<span class="sw" style="background:'+t.col+'"></span>'+t.name+'</button>').join("")+
      '<p class="note" style="padding:0 4px">탭=배치 · 회전 버튼으로 방향 전환 · 출발점 1개 필수</p>';
    $("edSide").querySelectorAll(".edTool").forEach(b=>b.onclick=()=>{tool=b.dataset.t;Sfx.click();buildPalette();});
  }
  function resize(){
    cv=$("edCanvas");
    const w=cv.clientWidth,h=cv.clientHeight;
    cv.width=w*devicePixelRatio;cv.height=h*devicePixelRatio;
    ctx2=cv.getContext("2d");ctx2.scale(devicePixelRatio,devicePixelRatio);
    cell=Math.floor(Math.min(w,h)/N);
    ox=(w-cell*N)/2;oy=(h-cell*N)/2;draw();
  }
  function draw(){
    if(!ctx2)return;
    const w=cv.clientWidth,h=cv.clientHeight;
    ctx2.clearRect(0,0,w,h);
    ctx2.fillStyle="#16331f";ctx2.fillRect(ox,oy,cell*N,cell*N);
    ctx2.strokeStyle="rgba(255,255,255,.07)";
    for(let i=0;i<=N;i++){
      ctx2.beginPath();ctx2.moveTo(ox+i*cell,oy);ctx2.lineTo(ox+i*cell,oy+N*cell);ctx2.stroke();
      ctx2.beginPath();ctx2.moveTo(ox,oy+i*cell);ctx2.lineTo(ox+N*cell,oy+i*cell);ctx2.stroke();}
    for(const t of tiles){
      const x=ox+t.x*cell,y=oy+t.z*cell,c=cell;
      const def=ED_TILES.find(d=>d.id===t.t);
      ctx2.save();ctx2.translate(x+c/2,y+c/2);ctx2.rotate(t.r*Math.PI/2);
      ctx2.fillStyle=def.col;
      if(t.t==="road"){ctx2.fillRect(-c*.3,-c/2,c*.6,c);}
      else if(t.t==="cross"){ctx2.fillRect(-c*.3,-c/2,c*.6,c);ctx2.fillRect(-c/2,-c*.3,c,c*.6);}
      else if(t.t==="curve"){
        ctx2.beginPath();ctx2.lineWidth=c*.6;ctx2.strokeStyle=def.col;
        ctx2.arc(c/2,-c/2,c/2,Math.PI/2,Math.PI);ctx2.stroke();}
      else if(t.t==="wall"){ctx2.fillRect(-c*.45,-c*.12,c*.9,c*.24);}
      else if(t.t==="bump"){ctx2.fillRect(-c*.4,-c*.08,c*.8,c*.16);
        ctx2.fillStyle="#23262c";
        for(let k=-1;k<=1;k+=2)ctx2.fillRect(k*c*.2-c*.05,-c*.08,c*.1,c*.16);}
      else if(t.t==="ramp"){ctx2.beginPath();ctx2.moveTo(-c*.35,-c*.35);ctx2.lineTo(c*.35,-c*.35);
        ctx2.lineTo(0,c*.4);ctx2.closePath();ctx2.fill();}
      else if(t.t==="cone"){ctx2.beginPath();ctx2.arc(0,0,c*.16,0,7);ctx2.fill();}
      else if(t.t==="check"){ctx2.globalAlpha=.7;ctx2.fillRect(-c*.4,-c*.4,c*.8,c*.8);
        ctx2.globalAlpha=1;ctx2.fillStyle="#0b0e13";ctx2.font="bold "+c*.4+"px sans-serif";
        ctx2.textAlign="center";ctx2.textBaseline="middle";ctx2.fillText(t.ord,0,0);}
      else if(t.t==="start"){ctx2.fillRect(-c*.4,-c*.4,c*.8,c*.8);
        ctx2.fillStyle="#0b0e13";ctx2.beginPath();ctx2.moveTo(0,-c*.25);
        ctx2.lineTo(c*.2,c*.15);ctx2.lineTo(-c*.2,c*.15);ctx2.closePath();ctx2.fill();}
      ctx2.restore();}
  }
  function place(gx,gz){
    if(gx<0||gz<0||gx>=N||gz>=N)return;
    const i=tiles.findIndex(t=>t.x===gx&&t.z===gz);
    if(tool==="erase"){if(i>=0)tiles.splice(i,1);draw();return;}
    if(i>=0)tiles.splice(i,1);
    const t={x:gx,z:gz,t:tool,r:rot};
    if(tool==="check")t.ord=ordSeq++;
    if(tool==="start")tiles=tiles.filter(x=>x.t!=="start"); // only one start
    tiles.push(t);draw();
  }
  function validate(){
    const starts=tiles.filter(t=>t.t==="start").length;
    if(!tiles.length)return"타일이 없습니다 — 도로부터 배치해 보세요";
    if(starts!==1)return"출발점(노란 타일)이 정확히 1개 필요합니다";
    return null;}
  function save(){
    name=($("edName").value||"").trim();
    if(!name){toast("맵 이름을 입력하세요");$("edName").focus();return false;}
    const err=validate();
    if(err){toast("⚠️ "+err,2400);return false;}
    Store.set("maps:"+name,{name,tiles,v:1});
    toast("💾 저장됨: "+name);return true;}
  function init(){
    $("edExit").onclick=()=>{Sfx.click();close();};
    $("edRotate").onclick=()=>{rot=(rot+1)%4;Sfx.click();toast("회전: "+rot*90+"°");};
    $("edSave").onclick=()=>{Sfx.click();save();};
    $("edTest").onclick=()=>{Sfx.click();
      if(!save())return;
      $("editorScr").classList.remove("on");
      Game.mode="free";Game.opts.mapId="custom:"+name;Game.startGame();};
    const pt=e=>{
      const r=cv.getBoundingClientRect();
      return[Math.floor((e.clientX-r.left-ox)/cell),Math.floor((e.clientY-r.top-oy)/cell)];};
    let painting=false;
    $("edCanvas").addEventListener("pointerdown",e=>{e.preventDefault();painting=true;
      $("edCanvas").setPointerCapture(e.pointerId);place(...pt(e));});
    $("edCanvas").addEventListener("pointermove",e=>{if(painting&&(tool==="road"||tool==="erase"||tool==="wall"))place(...pt(e));});
    $("edCanvas").addEventListener("pointerup",()=>painting=false);
    addEventListener("resize",()=>{if($("editorScr").classList.contains("on"))resize();});
  }
  return{open,init,resize};
})();
