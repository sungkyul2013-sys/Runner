/* ============================================================
   Input — multitouch (pointer-id tracked), keyboard, tilt,
   camera drag/pinch on canvas
   ============================================================ */
const Input=(()=>{
  const st={steer:0,gas:0,brake:0,hb:false};
  const keys={};
  let steerPtr=null,tiltVal=0;
  const camPtrs=new Map();let pinchD=0;

  function hookBtn(el,on,off){
    el.addEventListener("pointerdown",e=>{e.preventDefault();el.setPointerCapture(e.pointerId);
      el.classList.add("press");Sfx.resume();on(e);});
    const end=e=>{el.classList.remove("press");off&&off(e);};
    el.addEventListener("pointerup",end);
    el.addEventListener("pointercancel",end);
    el.addEventListener("lostpointercapture",end);
  }
  function init(){
    // pedals
    hookBtn($("pedalGas"),()=>st.gas=1,()=>st.gas=0);
    hookBtn($("pedalBrake"),()=>st.brake=1,()=>st.brake=0);
    hookBtn($("btnHB"),()=>st.hb=true,()=>st.hb=false);
    hookBtn($("btnStL"),()=>st.steer=-1,()=>{if(st.steer<0)st.steer=0;});
    hookBtn($("btnStR"),()=>st.steer=1,()=>{if(st.steer>0)st.steer=0;});
    // steering slider
    const sz=$("steerZone");
    const updSteer=e=>{
      const r=sz.getBoundingClientRect();
      st.steer=clamp(((e.clientX-r.left)/r.width-.5)*2.4,-1,1);};
    sz.addEventListener("pointerdown",e=>{e.preventDefault();Sfx.resume();
      steerPtr=e.pointerId;sz.setPointerCapture(e.pointerId);updSteer(e);});
    sz.addEventListener("pointermove",e=>{if(e.pointerId===steerPtr)updSteer(e);});
    const sEnd=e=>{if(e.pointerId===steerPtr){steerPtr=null;st.steer=0;}};
    sz.addEventListener("pointerup",sEnd);sz.addEventListener("pointercancel",sEnd);
    // camera gestures on canvas
    const gl=$("gl");
    gl.addEventListener("pointerdown",e=>{
      Sfx.resume();
      camPtrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(camPtrs.size===2){
        const a=[...camPtrs.values()];
        pinchD=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);}});
    gl.addEventListener("pointermove",e=>{
      const p=camPtrs.get(e.pointerId);if(!p)return;
      if(camPtrs.size===1&&Game.cam){
        Game.cam.onDrag(e.clientX-p.x,e.clientY-p.y);}
      p.x=e.clientX;p.y=e.clientY;
      if(camPtrs.size===2&&Game.cam){
        const a=[...camPtrs.values()];
        const d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
        if(pinchD>0)Game.cam.onPinch(d/pinchD);
        pinchD=d;}});
    const camEnd=e=>{camPtrs.delete(e.pointerId);pinchD=0;};
    gl.addEventListener("pointerup",camEnd);gl.addEventListener("pointercancel",camEnd);
    // keyboard (desktop testing)
    addEventListener("keydown",e=>{keys[e.code]=true;
      if(e.code==="Space")e.preventDefault();
      if(e.code==="KeyP"||e.code==="Escape")Game.togglePause();
      if(e.code==="KeyR")Game.state==="play"&&!Game.paused&&Game.resetCar();
      if(e.code==="KeyC")Game.state==="play"&&toast("카메라: "+Game.cam.cycle());
      Sfx.resume();});
    addEventListener("keyup",e=>{keys[e.code]=false;});
    // tilt
    addEventListener("deviceorientation",e=>{
      if(e.gamma!=null){
        const landscape=Math.abs(window.orientation||0)===90||innerWidth>innerHeight;
        tiltVal=clamp((landscape?e.beta:e.gamma)/26,-1,1)*(window.orientation===-90?-1:1);}});
    applySteerModeUI();
  }
  function applySteerModeUI(){
    $("steerZone").style.display=Settings.steerMode==="slider"?"":"none";
    $("steerBtns").style.display=Settings.steerMode==="buttons"?"flex":"none";
    $("ctlL").style.opacity=Settings.steerMode==="tilt"?"0":"1";
    $("ctlL").style.pointerEvents=Settings.steerMode==="tilt"?"none":"auto";
  }
  function requestTilt(){
    try{
      if(typeof DeviceOrientationEvent!=="undefined"&&DeviceOrientationEvent.requestPermission)
        DeviceOrientationEvent.requestPermission().catch(()=>{});
    }catch(e){}
  }
  function clear(){st.steer=0;st.gas=0;st.brake=0;st.hb=false;steerPtr=null;camPtrs.clear();
    for(const k in keys)keys[k]=false;
    document.querySelectorAll(".padBtn.press").forEach(b=>b.classList.remove("press"));}
  function read(){
    let steer=st.steer,gas=st.gas,brake=st.brake,hb=st.hb;
    if(Settings.steerMode==="tilt")steer=tiltVal;
    if(keys.ArrowLeft||keys.KeyA)steer=-1;
    if(keys.ArrowRight||keys.KeyD)steer=1;
    if(keys.ArrowUp||keys.KeyW)gas=1;
    if(keys.ArrowDown||keys.KeyS)brake=1;
    if(keys.Space)hb=true;
    return{steer:steer*Settings.sensitivity,gas,brake,hb};}
  // steering smoothing for knob visual
  let knobV=0;
  function updateKnob(){
    const t=read().steer;
    knobV+=(clamp(t,-1,1)-knobV)*.3;
    const k=$("steerKnob");
    if(k&&Settings.steerMode==="slider")k.style.left=(50+knobV*32)+"%";}
  function applyTo(v){
    const r=read();
    v.steerIn=r.steer;
    v.handbrake=r.hb;
    const fs=v.fwdSpeed();
    if(r.brake>0){
      if(fs>1||v.driveMode==="D"&&fs>-.2&&v.speed>1){v.brake=r.brake;v.throttle=r.gas;}
      else{v.driveMode="R";v.throttle=r.brake;v.brake=0;}}
    else{v.brake=0;v.throttle=r.gas;}
    if(r.gas>0&&v.driveMode==="R"&&fs>-1){v.driveMode="D";v.throttle=r.gas;v.brake=0;}
  }
  return{init,clear,read,applyTo,updateKnob,applySteerModeUI,requestTilt,state:st};
})();
