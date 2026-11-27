import * as THREE from 'three';
import waterUrl from '../assets/waternormals.jpg';
import { terrainHeight } from './WorldDef';

const DEPTH_RES = 256, DEPTH_SPAN = 56000, FAR_SPAN = 524288;

export class Ocean {
  readonly mesh: THREE.Mesh;
  private uniforms = { uTime: { value: 0 }, uDepth: { value: null as THREE.Texture | null }, uFar: { value: null as THREE.Texture | null }, uRough: { value: 0 } };

  constructor() {
    const nrm = new THREE.TextureLoader().load(waterUrl);
    nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
    // Bake a coarse depth map so shallows read turquoise and coasts get foam.
    const data = new Uint8Array(DEPTH_RES * DEPTH_RES * 4);
    for (let j = 0; j < DEPTH_RES; j++) for (let i = 0; i < DEPTH_RES; i++) {
      const x = (i / (DEPTH_RES - 1) - 0.5) * DEPTH_SPAN, z = (j / (DEPTH_RES - 1) - 0.5) * DEPTH_SPAN;
      const h = terrainHeight(x, z);
      const d = Math.min(255, Math.max(0, -h * 1.4));
      const k = (j * DEPTH_RES + i) * 4;
      data[k] = d; data[k + 1] = h > 0 ? 255 : 0; data[k + 2] = 0; data[k + 3] = 255;
    }
    const dt = new THREE.DataTexture(data, DEPTH_RES, DEPTH_RES, THREE.RGBAFormat);
    // coarse continental-shelf map for the whole world (shallows + coast foam far from home)
    const FR = 320;
    const fdata = new Uint8Array(FR * FR * 4);
    for (let j = 0; j < FR; j++) for (let i = 0; i < FR; i++) {
      const x = (i / (FR - 1) - 0.5) * FAR_SPAN, z = (j / (FR - 1) - 0.5) * FAR_SPAN;
      const h = terrainHeight(x, z);
      const k = (j * FR + i) * 4;
      fdata[k] = Math.min(255, Math.max(0, -h * 0.4)); fdata[k + 3] = 255;
    }
    const ft = new THREE.DataTexture(fdata, FR, FR, THREE.RGBAFormat);
    ft.magFilter = THREE.LinearFilter; ft.minFilter = THREE.LinearFilter; ft.needsUpdate = true;
    this.uniforms.uFar.value = ft;
    dt.magFilter = THREE.LinearFilter; dt.minFilter = THREE.LinearFilter; dt.needsUpdate = true;
    this.uniforms.uDepth.value = dt;

    const mat = new THREE.MeshStandardMaterial({ color: 0x0b3244, roughness: 0.06, metalness: 0.0, normalMap: nrm, envMapIntensity: 1.1 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos=(modelMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos; uniform float uTime; uniform sampler2D uDepth; uniform sampler2D uFar; uniform float uRough;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 duv = vWPos.xz/${DEPTH_SPAN.toFixed(1)} + 0.5;
          vec4 dep = texture2D(uDepth, duv);
          vec2 fuv2 = vWPos.xz/524288.0 + 0.5;
          float depth = (duv.x<0.0||duv.x>1.0||duv.y<0.0||duv.y>1.0) ? texture2D(uFar, fuv2).r : dep.r;
          vec3 shallow = vec3(0.06,0.42,0.42);
          vec3 deep = vec3(0.012,0.06,0.1);
          diffuseColor.rgb = mix(shallow, deep, smoothstep(0.0, 0.5, depth));
          float shore = smoothstep(0.06, 0.0, depth) * (0.6+0.4*sin(uTime*1.3 + vWPos.x*0.05 + vWPos.z*0.04));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85,0.9,0.92), shore*0.7);`)
        .replace('#include <normal_fragment_maps>', `
          float wd = length(vWPos - cameraPosition);
          vec3 n1 = texture2D(normalMap, vWPos.xz*0.011 + uTime*vec2(0.008,0.005)).xyz*2.0-1.0;
          vec3 n2 = texture2D(normalMap, vWPos.xz*0.043 - uTime*vec2(0.011,-0.017)).xyz*2.0-1.0;
          vec3 n3 = texture2D(normalMap, vWPos.xz*0.0017 + uTime*vec2(0.0012,0.0007)).xyz*2.0-1.0;
          float fade = 1.0 - smoothstep(300.0, 6000.0, wd);
          vec2 nxy = (n1.xy*0.55 + n2.xy*0.3)*fade*(1.0+uRough) + n3.xy*(0.55+uRough*0.6);
          vec3 nw = normalize(vec3(nxy.x, 1.0, nxy.y));
          normal = normalize((viewMatrix*vec4(nw,0.0)).xyz);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(0.04, 0.22, smoothstep(1500.0, 20000.0, length(vWPos - cameraPosition))) + uRough*0.1;`);
    };
    const g = new THREE.PlaneGeometry(420000, 420000, 1, 1);
    g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }

  update(cam: THREE.Vector3, t: number, roughSea: number) {
    this.mesh.position.set(Math.round(cam.x / 100) * 100, 0, Math.round(cam.z / 100) * 100);
    this.uniforms.uTime.value = t;
    this.uniforms.uRough.value = roughSea;
  }
}
