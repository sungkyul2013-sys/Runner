import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { settings, Quality } from './Save';

export interface QualityProfile {
  dpr: number; shadow: number; smaa: boolean; terrainSplit: number; clouds: number; trees: number; far: number; bloomRes: number;
}
export const QUALITY: Record<Quality, QualityProfile> = {
  low: { dpr: 1, shadow: 1024, smaa: false, terrainSplit: 1.5, clouds: 70, trees: 1800, far: 42000, bloomRes: 0.35 },
  medium: { dpr: 1.5, shadow: 2048, smaa: false, terrainSplit: 2.0, clouds: 130, trees: 4000, far: 52000, bloomRes: 0.5 },
  high: { dpr: 2, shadow: 2048, smaa: true, terrainSplit: 2.5, clouds: 200, trees: 7000, far: 60000, bloomRes: 0.5 },
  ultra: { dpr: 2.5, shadow: 4096, smaa: true, terrainSplit: 3.2, clouds: 300, trees: 11000, far: 70000, bloomRes: 0.75 },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
    uChroma: { value: 0.0012 },
    uRedout: { value: 0 }, // +blackout / -redout
    uDamage: { value: 0 },
    uFlash: { value: 0 },
    uRain: { value: 0 },
    uSat: { value: 1.08 },
    uContrast: { value: 1.06 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime,uVignette,uGrain,uChroma,uRedout,uDamage,uFlash,uRain,uSat,uContrast;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    vec2 drop(vec2 uv){
      // cheap raindrops on the lens
      vec2 g = uv*vec2(14.0,8.0); g.y += uTime*0.25; vec2 id=floor(g); vec2 f=fract(g)-0.5;
      float r = h(id); if(r<0.55) return vec2(0.0);
      vec2 c = vec2(h(id+3.1)-0.5, fract(r*7.0+uTime*0.15)-0.5)*0.6;
      float d = length(f-c); float m = smoothstep(0.16,0.02,d);
      return (f-c)*m*0.06;
    }
    void main(){
      vec2 uv=vUv; vec2 c=uv-0.5;
      if(uRain>0.0) uv += drop(uv)*uRain;
      float ca = uChroma*(1.0+uDamage*4.0)*length(c)*2.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c*ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c*ca).b;
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col-0.5)*uContrast+0.5;
      float v = smoothstep(0.85, 0.2, length(c*vec2(1.0,0.85)));
      col *= mix(1.0, v, uVignette);
      // G-LOC tunnel
      float tunnel = smoothstep(0.75-abs(uRedout)*0.55, 0.15, length(c));
      if(uRedout>0.0){ col *= mix(1.0, tunnel, uRedout); col = mix(col, vec3(l*0.6), uRedout*0.6); }
      else if(uRedout<0.0){ col = mix(col, vec3(0.6,0.0,0.0)*l+vec3(0.25,0,0), -uRedout*(1.0-tunnel*0.5)); }
      col = mix(col, vec3(0.8,0.05,0.02), uDamage*0.25*(1.0-v));
      col += uFlash;
      col += (h(uv*vec2(1920.0,1080.0)+fract(uTime))-0.5)*uGrain;
      gl_FragColor = vec4(clamp(col,0.0,1.0),1.0);
    }`,
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  private smaa: SMAAPass | null = null;
  private renderPass: RenderPass;
  profile: QualityProfile;
  pixelRatio = 1;
  private frameAvg = 16;
  private adaptT = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false, logarithmicDepthBuffer: true });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.55;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 60000);
    this.profile = QUALITY[settings.quality];

    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.applyQuality();
    addEventListener('resize', () => this.resize());
  }

  applyQuality() {
    this.profile = QUALITY[settings.quality];
    const p = this.profile;
    this.pixelRatio = Math.min(devicePixelRatio || 1, p.dpr) * settings.resScale;
    this.renderer.shadowMap.enabled = settings.shadows;
    this.bloom.enabled = settings.bloom;
    this.camera.far = p.far;
    this.camera.updateProjectionMatrix();
    if (p.smaa && !this.smaa) {
      this.smaa = new SMAAPass(innerWidth, innerHeight);
      this.composer.addPass(this.smaa);
    } else if (!p.smaa && this.smaa) {
      this.composer.removePass(this.smaa);
      this.smaa = null;
    }
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * this.profile.bloomRes, h * this.profile.bloomRes);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Dynamic resolution: keeps mobile at a smooth frame rate. */
  adapt(dt: number) {
    this.frameAvg = this.frameAvg * 0.95 + dt * 1000 * 0.05;
    this.adaptT += dt;
    if (this.adaptT < 1.5) return;
    this.adaptT = 0;
    const cap = Math.min(devicePixelRatio || 1, this.profile.dpr) * settings.resScale;
    let pr = this.pixelRatio;
    if (this.frameAvg > 24 && pr > 0.6) pr = Math.max(0.6, pr - 0.15);
    else if (this.frameAvg < 15 && pr < cap) pr = Math.min(cap, pr + 0.1);
    if (pr !== this.pixelRatio) { this.pixelRatio = pr; this.resize(); }
  }

  render(dt: number, t: number) {
    this.grade.uniforms.uTime.value = t;
    this.composer.render(dt);
  }

  screenshot(): string {
    this.composer.render(0);
    return this.renderer.domElement.toDataURL('image/png');
  }
}
