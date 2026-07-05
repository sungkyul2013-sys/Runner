// GLB → CRASH LAB baked asset format (quantized, paint-mask, texture-sampled)
// out: ../crashlab/src/15_baked.js  (const BAKED={...})
import{readFileSync,writeFileSync}from'fs';
import{PNG}from'pngjs';

const GLB_DIR='/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad/glb/';
const OUT='/tmp/claude-0/-home-user-Runner/40ffe11b-8311-5c4c-9817-c1f9ffde4576/scratchpad/crashlab/src/15_baked.js';

const COMP={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const NCOMP={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};

function parseGLB(path){
  const b=readFileSync(path);
  const jsonLen=b.readUInt32LE(12);
  const json=JSON.parse(b.toString('utf8',20,20+jsonLen));
  const binOff=20+jsonLen+8;
  const bin=b.subarray(binOff);
  return{json,bin};
}
function accessor(g,idx){
  const a=g.json.accessors[idx],bv=g.json.bufferViews[a.bufferView];
  const T=COMP[a.componentType],n=NCOMP[a.type];
  const byteOff=(bv.byteOffset||0)+(a.byteOffset||0);
  return{arr:new T(g.bin.buffer,g.bin.byteOffset+byteOff,a.count*n),n,count:a.count};
}
function png(g,imgIdx){
  const img=g.json.images[imgIdx];
  if(img.uri)return PNG.sync.read(readFileSync(GLB_DIR+decodeURIComponent(img.uri)));
  const bv=g.json.bufferViews[img.bufferView];
  const buf=Buffer.from(g.bin.buffer,g.bin.byteOffset+(bv.byteOffset||0),bv.byteLength);
  return PNG.sync.read(buf);
}
// node world transforms (TRS, no skins)
function nodeMatrices(g){
  const out=new Array(g.json.nodes.length).fill(null);
  const mul=(A,B)=>{const M=new Array(16).fill(0);
    for(let r=0;r<4;r++)for(let c=0;c<4;c++)for(let k=0;k<4;k++)M[c*4+r]+=A[k*4+r]*B[c*4+k];return M;};
  const trs=n=>{
    const[tx,ty,tz]=n.translation||[0,0,0];
    const[qx,qy,qz,qw]=n.rotation||[0,0,0,1];
    const[sx,sy,sz]=n.scale||[1,1,1];
    const x2=qx+qx,y2=qy+qy,z2=qz+qz;
    const xx=qx*x2,xy=qx*y2,xz=qx*z2,yy=qy*y2,yz=qy*z2,zz=qz*z2,wx=qw*x2,wy=qw*y2,wz=qw*z2;
    return[(1-(yy+zz))*sx,(xy+wz)*sx,(xz-wy)*sx,0,
           (xy-wz)*sy,(1-(xx+zz))*sy,(yz+wx)*sy,0,
           (xz+wy)*sz,(yz-wx)*sz,(1-(xx+yy))*sz,0,
           tx,ty,tz,1];};
  const walk=(idx,parent)=>{
    const m=mul(parent,trs(g.json.nodes[idx]));
    out[idx]=m;
    for(const c of g.json.nodes[idx].children||[])walk(c,m);};
  const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  for(const s of g.json.scenes[g.json.scene||0].nodes)walk(s,I);
  return out;
}
const xfp=(m,x,y,z)=>[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];
const xfn=(m,x,y,z)=>{const v=[m[0]*x+m[4]*y+m[8]*z,m[1]*x+m[5]*y+m[9]*z,m[2]*x+m[6]*y+m[10]*z];
  const l=Math.hypot(...v)||1;return v.map(c=>c/l);};

/* bake a set of nodes (matching filter) into one soup */
function bakeNodes(g,mats,filter,opts){
  opts=opts||{};
  const pos=[],nrm=[],col=[],mask=[];
  let tex=null;
  for(let ni=0;ni<g.json.nodes.length;ni++){
    const node=g.json.nodes[ni];
    if(node.mesh==null)continue;
    if(!filter(node,ni))continue;
    const m=mats[ni];
    const mesh=g.json.meshes[node.mesh];
    for(const prim of mesh.primitives){
      const P=accessor(g,prim.attributes.POSITION);
      const N=prim.attributes.NORMAL!=null?accessor(g,prim.attributes.NORMAL):null;
      const UV=prim.attributes.TEXCOORD_0!=null?accessor(g,prim.attributes.TEXCOORD_0):null;
      const I=prim.indices!=null?accessor(g,prim.indices).arr:null;
      const mat=g.json.materials?.[prim.material]||{};
      const pbr=mat.pbrMetallicRoughness||{};
      let rgb=[200,200,200],isPaint=0,useTex=false;
      if(pbr.baseColorTexture){useTex=true;
        if(!tex)tex=png(g,g.json.textures[pbr.baseColorTexture.index].source);}
      else if(pbr.baseColorFactor){
        rgb=pbr.baseColorFactor.slice(0,3).map(v=>Math.round(v*255));} // linear 저장 (r152 ColorManagement)
      const nm=(mat.name||"").toLowerCase();
      if(nm.startsWith("paint"))isPaint=1;
      if(nm==="window")rgb=[24,32,44];
      const count=I?I.length:P.count;
      for(let k=0;k<count;k++){
        const vi=I?I[k]:k;
        const[x,y,z]=xfp(m,P.arr[vi*3],P.arr[vi*3+1],P.arr[vi*3+2]);
        pos.push(x,y,z);
        if(N){const[nx,ny,nz]=xfn(m,N.arr[vi*3],N.arr[vi*3+1],N.arr[vi*3+2]);nrm.push(nx,ny,nz);}
        else nrm.push(0,1,0);
        let c=rgb;
        if(useTex&&UV){
          const u=UV.arr[vi*2],v=UV.arr[vi*2+1];
          const px=Math.min(tex.width-1,Math.max(0,Math.round(u*tex.width-0.5)));
          const py=Math.min(tex.height-1,Math.max(0,Math.round(v*tex.height-0.5)));
          const o=(py*tex.width+px)*4;
          c=[tex.data[o],tex.data[o+1],tex.data[o+2]].map(v=>Math.round(Math.pow(v/255,2.2)*255));} // sRGB→linear
        col.push(c[0],c[1],c[2]);
        mask.push(isPaint);}}}
  return{pos,nrm,col,mask};
}
function quantize(soup){
  const n=soup.pos.length/3;
  let bb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
  for(let i=0;i<n;i++){
    for(let a=0;a<3;a++){const v=soup.pos[i*3+a];
      if(v<bb[a])bb[a]=v;if(v>bb[3+a])bb[3+a]=v;}}
  const P=new Int16Array(n*3),Nr=new Int8Array(n*3),C=new Uint8Array(n*3),M=new Uint8Array(n);
  for(let i=0;i<n;i++){
    for(let a=0;a<3;a++){
      const s=(bb[3+a]-bb[a])||1;
      P[i*3+a]=Math.round((soup.pos[i*3+a]-bb[a])/s*32767);
      Nr[i*3+a]=Math.round(Math.max(-1,Math.min(1,soup.nrm[i*3+a]))*127);
      C[i*3+a]=soup.col[i*3+a];}
    M[i]=soup.mask[i];}
  const b64=ta=>Buffer.from(ta.buffer,ta.byteOffset,ta.byteLength).toString('base64');
  const out={v:n,bb:bb.map(v=>+v.toFixed(4)),p:b64(P),n:b64(Nr),c:b64(C)};
  if(soup.mask.some(x=>x))out.m=b64(M);
  return out;
}

const BAKED={};
/* ---- cars ---- */
const carFiles={race:"race.glb",raceFuture:"raceFuture.glb",suvLuxury:"suvLuxury.glb",
  garbageTruck:"garbageTruck.glb",ambulance:"ambulance.glb",tractor:"tractor.glb"};
for(const[key,file]of Object.entries(carFiles)){
  const g=parseGLB(GLB_DIR+file);
  const mats=nodeMatrices(g);
  const isWheel=n=>(n.name||"").toLowerCase().includes("wheel");
  const body=bakeNodes(g,mats,n=>!isWheel(n));
  // wheels: bake ONE wheel mesh centered at its node origin (strip translation)
  let wheelNode=null,wheelIdx=-1;
  g.json.nodes.forEach((n,i)=>{if(isWheel(n)&&wheelNode==null){wheelNode=n;wheelIdx=i;}});
  const wm=mats[wheelIdx].slice();wm[12]=0;wm[13]=0;wm[14]=0; // drop translation (keep parent scale≈1)
  const wheelSoup=bakeNodes(g,{[wheelIdx]:wm},(n,i)=>i===wheelIdx);
  // 휠 지오메트리 재중심화 (안쪽면 원점 → 중심 원점)
  let wcx=0,wcy=0,wcz=0,wn=wheelSoup.pos.length/3;
  {let bb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
   for(let i=0;i<wn;i++)for(let a=0;a<3;a++){const v=wheelSoup.pos[i*3+a];
     if(v<bb[a])bb[a]=v;if(v>bb[3+a])bb[3+a]=v;}
   wcx=(bb[0]+bb[3])/2;wcy=(bb[1]+bb[4])/2;wcz=(bb[2]+bb[5])/2;}
  for(let i=0;i<wn;i++){wheelSoup.pos[i*3]-=wcx;wheelSoup.pos[i*3+1]-=wcy;wheelSoup.pos[i*3+2]-=wcz;}
  const wheels=[];
  g.json.nodes.forEach((n,i)=>{if(isWheel(n)){
    const m=mats[i];
    const sx=m[12]<0?-1:1;
    wheels.push([+(m[12]+sx*Math.abs(wcx)).toFixed(3),+(m[13]+wcy).toFixed(3),+(m[14]+wcz).toFixed(3)]);}});
  if(wheels.length===3){ // raceFuture: 오른쪽 앞바퀴 누락 → 미러 합성
    const zs=wheels.map(w=>w[2]);
    const lone=wheels.find(w=>zs.filter(z=>Math.abs(z-w[2])<.05).length===1);
    wheels.push([-lone[0],lone[1],lone[2]]);}
  // order: FL,FR,RL,RR in MODEL space (front = -z)
  wheels.sort((a,b)=>(a[2]-b[2])||(a[0]-b[0]));
  const entry=quantize(body);
  entry.wheel=quantize(wheelSoup);
  entry.wheels=wheels;
  BAKED[key]=entry;
  console.log(key,"body v:",entry.v,"wheel v:",entry.wheel.v,"wheels:",JSON.stringify(wheels),"bb:",entry.bb.map(v=>+v.toFixed(2)));
}
/* ---- scenery ---- */
const scFiles={bldA:"building-small-a.glb",bldB:"building-small-b.glb",bldC:"building-small-c.glb",
  bldD:"building-small-d.glb",garage:"building-garage.glb",trees:"grass-trees.glb",
  treesTall:"grass-trees-tall.glb",fountain:"pavement-fountain.glb"};
for(const[key,file]of Object.entries(scFiles)){
  const g=parseGLB(GLB_DIR+file);
  const mats=nodeMatrices(g);
  BAKED[key]=quantize(bakeNodes(g,mats,()=>true));
  console.log(key,"v:",BAKED[key].v,"bb:",BAKED[key].bb.map(v=>+v.toFixed(2)));
}
let js="/* Baked CC0 3D assets — Kenney Car Kit 1.4 & City Builder Kit (CC0, kenney.nl) */\n";
js+="const BAKED="+JSON.stringify(BAKED)+";\n";
writeFileSync(OUT,js);
console.log("written",OUT,(js.length/1024).toFixed(0)+"KB");
