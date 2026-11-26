// Aircraft definitions. Body axes (three.js): +X right, +Y up, -Z forward. Units SI.
export interface GearDef { p: [number, number, number]; travel: number; steer?: boolean; brake?: boolean; wheelR: number; nose?: boolean }
export interface Livery { name: string; base: number; accent: number; stripe: number; metal: number; rough: number }

export interface WingGeom { span: number; root: number; tip: number; sweep: number; dihedral: number; z: number; y: number; thick: number; flapFrac?: number }
export interface Geom {
  style: 'prop' | 'jet' | 'airliner' | 'stealth' | 'turboprop';
  length: number; radius: number; heightScale: number; noseLen: number; tailLen: number; tailUp: number;
  wing: WingGeom; hstab: WingGeom; vstab: { h: number; root: number; tip: number; sweep: number; z: number; twin?: number; cant?: number };
  canopy: { z: number; len: number; r: number; y: number; bubble: boolean };
  engines: { kind: 'prop'; z: number; r: number; blades: number }[] | { kind: 'jet'; x: number; y: number; z: number; r: number; len: number; pod?: boolean; intake?: 'chin' | 'side' | 'pod' }[] | { kind: 'turboprop'; x: number; y: number; z: number; r: number; blades: number }[];
  highWing?: boolean;
  struts?: boolean;
}

export interface AircraftSpec {
  id: string; name: string; ko: string; role: string; desc: string;
  stats: { speed: number; agility: number; armor: number; firepower: number; ease: number };
  mass: number; fuel: number; burn: number; burnAB?: number;
  S: number; b: number; c: number;
  CL0: number; CLa: number; alphaStall: number; CD0: number; k: number; flapCL: number; flapCD: number; flapNotches: number[]; gearCD: number; brakeCD: number; Mcrit: number;
  Cm0: number; Cma: number; Cmq: number; Cmde: number;
  Clb: number; Clp: number; Clda: number; Clr: number;
  Cnb: number; Cnr: number; Cndr: number; Cnda: number; CYb: number;
  I: [number, number, number]; // pitch, yaw, roll
  engine: { type: 'prop' | 'jet'; power?: number; staticT?: number; thrust: number; ab?: number; spool: number; count: number };
  gear: GearDef[]; retract: boolean; hook: boolean;
  vR: number; vRef: number; vStall: number; vMax: number; gMax: number; gMin: number;
  gun: number; missiles: number; flares: number;
  eye: [number, number, number]; chase: number;
  geom: Geom;
  liveries: Livery[];
}

const L = (name: string, base: number, accent: number, stripe: number, metal = 0.35, rough = 0.42): Livery => ({ name, base, accent, stripe, metal, rough });

export const AIRCRAFT: AircraftSpec[] = [
  {
    id: 'kestrel', name: 'Kestrel K-172', ko: '케스트럴 K-172', role: '훈련용 경비행기',
    desc: '안정적이고 관대한 고익 단발 프로펠러기. 이착륙 연습과 경치 감상에 최적.',
    stats: { speed: 22, agility: 35, armor: 20, firepower: 0, ease: 95 },
    mass: 800, fuel: 120, burn: 0.008,
    S: 16.2, b: 11, c: 1.5,
    CL0: 0.3, CLa: 4.9, alphaStall: 0.27, CD0: 0.028, k: 0.054, flapCL: 0.75, flapCD: 0.05, flapNotches: [0, 0.33, 0.66, 1], gearCD: 0.0, brakeCD: 0, Mcrit: 0.6,
    Cm0: 0.04, Cma: -0.95, Cmq: -14, Cmde: 0.34,
    Clb: -0.09, Clp: -0.48, Clda: 0.075, Clr: 0.08,
    Cnb: 0.075, Cnr: -0.1, Cndr: 0.045, Cnda: -0.006, CYb: -0.4,
    I: [1825, 2667, 1285],
    engine: { type: 'prop', power: 120000, staticT: 2600, thrust: 2600, spool: 1.2, count: 1 },
    gear: [
      { p: [0, -1.15, -1.55], travel: 0.25, steer: true, wheelR: 0.18, nose: true },
      { p: [-1.25, -1.15, 0.3], travel: 0.2, brake: true, wheelR: 0.22 },
      { p: [1.25, -1.15, 0.3], travel: 0.2, brake: true, wheelR: 0.22 },
    ],
    retract: false, hook: false,
    vR: 28, vRef: 33, vStall: 24, vMax: 85, gMax: 4.4, gMin: -1.8,
    gun: 0, missiles: 0, flares: 0,
    eye: [-0.3, 0.55, -0.5], chase: 14,
    geom: {
      style: 'prop', length: 8.2, radius: 0.62, heightScale: 1.25, noseLen: 1.8, tailLen: 4.0, tailUp: 0.25,
      wing: { span: 11, root: 1.6, tip: 1.15, sweep: 0, dihedral: 1.7, z: -1.1, y: 0.75, thick: 0.13, flapFrac: 0.45 },
      hstab: { span: 3.4, root: 1.1, tip: 0.75, sweep: 6, dihedral: 0, z: 2.95, y: 0.1, thick: 0.09 },
      vstab: { h: 1.6, root: 1.5, tip: 0.75, sweep: 35, z: 2.6 },
      canopy: { z: -0.9, len: 1.9, r: 0.6, y: 0.35, bubble: false },
      engines: [{ kind: 'prop', z: -4.05, r: 0.95, blades: 2 }],
      highWing: true, struts: true,
    },
    liveries: [L('클래식 화이트', 0xf2f2ee, 0x1d4e89, 0xd62828, 0.1, 0.35), L('선셋 오렌지', 0xf5efe6, 0xe76f51, 0x264653, 0.1, 0.35), L('포레스트', 0xe9edc9, 0x386641, 0xbc4749, 0.1, 0.4)],
  },
  {
    id: 'vortex', name: 'Vortex V-330', ko: '보텍스 V-330', role: '곡예 비행기',
    desc: '초고속 롤과 강력한 출력의 저익 곡예기. 루프, 롤, 나이프엣지를 자유롭게.',
    stats: { speed: 38, agility: 98, armor: 25, firepower: 0, ease: 60 },
    mass: 700, fuel: 80, burn: 0.014,
    S: 10.9, b: 8, c: 1.4,
    CL0: 0.05, CLa: 5.0, alphaStall: 0.3, CD0: 0.024, k: 0.06, flapCL: 0, flapCD: 0, flapNotches: [0], gearCD: 0, brakeCD: 0, Mcrit: 0.6,
    Cm0: 0.0, Cma: -0.55, Cmq: -10, Cmde: 0.42,
    Clb: -0.02, Clp: -0.42, Clda: 0.17, Clr: 0.04,
    Cnb: 0.06, Cnr: -0.09, Cndr: 0.07, Cnda: -0.004, CYb: -0.55,
    I: [900, 1400, 620],
    engine: { type: 'prop', power: 235000, staticT: 5200, thrust: 5200, spool: 0.7, count: 1 },
    gear: [
      { p: [-1.0, -1.05, -0.9], travel: 0.18, brake: true, wheelR: 0.22 },
      { p: [1.0, -1.05, -0.9], travel: 0.18, brake: true, wheelR: 0.22 },
      { p: [0, -0.35, 3.8], travel: 0.12, steer: true, wheelR: 0.08, nose: true },
    ],
    retract: false, hook: false,
    vR: 30, vRef: 36, vStall: 28, vMax: 115, gMax: 10, gMin: -10,
    gun: 0, missiles: 0, flares: 0,
    eye: [0, 0.55, 0.4], chase: 12,
    geom: {
      style: 'prop', length: 6.9, radius: 0.55, heightScale: 1.15, noseLen: 1.5, tailLen: 3.4, tailUp: 0.1,
      wing: { span: 8, root: 1.85, tip: 0.95, sweep: 4, dihedral: 0, z: -0.85, y: -0.3, thick: 0.15, flapFrac: 0 },
      hstab: { span: 3.1, root: 1.0, tip: 0.65, sweep: 8, dihedral: 0, z: 2.6, y: 0.05, thick: 0.1 },
      vstab: { h: 1.35, root: 1.4, tip: 0.8, sweep: 25, z: 2.4 },
      canopy: { z: 0.2, len: 1.7, r: 0.5, y: 0.42, bubble: true },
      engines: [{ kind: 'prop', z: -3.5, r: 1.0, blades: 3 }],
    },
    liveries: [L('레드 불꽃', 0xd00000, 0xffffff, 0x111111, 0.2, 0.3), L('스타버스트', 0x0b132b, 0xffd166, 0xef476f, 0.2, 0.3), L('일렉트릭', 0xf1f1f1, 0x00b4d8, 0x7209b7, 0.2, 0.3)],
  },
  {
    id: 'strix', name: 'Strix F-9', ko: '스트릭스 F-9', role: '다목적 전투기',
    desc: '플라이-바이-와이어 단발 전투기. 기관포·미사일·플레어 탑재, 항모 착함 가능.',
    stats: { speed: 85, agility: 90, armor: 60, firepower: 80, ease: 70 },
    mass: 9500, fuel: 3200, burn: 0.9, burnAB: 4.6,
    S: 28, b: 9.5, c: 3.5,
    CL0: 0.05, CLa: 3.6, alphaStall: 0.52, CD0: 0.019, k: 0.12, flapCL: 0.3, flapCD: 0.03, flapNotches: [0, 1], gearCD: 0.016, brakeCD: 0.06, Mcrit: 0.88,
    Cm0: 0.0, Cma: -0.35, Cmq: -6, Cmde: 0.34,
    Clb: -0.04, Clp: -0.36, Clda: 0.06, Clr: 0.02,
    Cnb: 0.09, Cnr: -0.25, Cndr: 0.03, Cnda: -0.003, CYb: -0.9,
    I: [75000, 85000, 13000],
    engine: { type: 'jet', thrust: 76000, ab: 127000, spool: 3.2, count: 1 },
    gear: [
      { p: [0, -1.65, -4.6], travel: 0.3, steer: true, wheelR: 0.3, nose: true },
      { p: [-1.2, -1.65, 0.6], travel: 0.28, brake: true, wheelR: 0.38 },
      { p: [1.2, -1.65, 0.6], travel: 0.28, brake: true, wheelR: 0.38 },
    ],
    retract: true, hook: true,
    vR: 72, vRef: 70, vStall: 58, vMax: 600, gMax: 9, gMin: -3,
    gun: 510, missiles: 6, flares: 40,
    eye: [0, 0.78, -3.4], chase: 22,
    geom: {
      style: 'jet', length: 15, radius: 0.85, heightScale: 1.05, noseLen: 4.2, tailLen: 4.5, tailUp: 0.2,
      wing: { span: 9.5, root: 5.2, tip: 1.3, sweep: 40, dihedral: -1, z: -1.4, y: -0.1, thick: 0.045, flapFrac: 0.4 },
      hstab: { span: 5.6, root: 2.4, tip: 0.9, sweep: 40, dihedral: -8, z: 4.9, y: -0.15, thick: 0.04 },
      vstab: { h: 3.4, root: 3.2, tip: 1.1, sweep: 45, z: 3.9 },
      canopy: { z: -3.1, len: 3.0, r: 0.62, y: 0.6, bubble: true },
      engines: [{ kind: 'jet', x: 0, y: 0, z: 7.2, r: 0.62, len: 1.4, intake: 'chin' }],
    },
    liveries: [L('에어 슈페리어리티 그레이', 0x8d99a6, 0x5c6773, 0x2b2d42, 0.45, 0.48), L('디지털 카모', 0x5b6a5a, 0x3f4a3a, 0x8a8f78, 0.3, 0.6), L('썬더 블루', 0x1f3b73, 0xffffff, 0xd90429, 0.5, 0.3), L('블랙 나이트', 0x15171a, 0x2e3238, 0xc9a227, 0.6, 0.35)],
  },
  {
    id: 'specter', name: 'Specter SF-7', ko: '스펙터 SF-7', role: '스텔스 쌍발 제공전투기',
    desc: '추력편향 쌍발 스텔스기. 압도적 추력과 고받음각 기동. 미사일 8발.',
    stats: { speed: 95, agility: 96, armor: 70, firepower: 95, ease: 65 },
    mass: 20000, fuel: 8000, burn: 1.8, burnAB: 9,
    S: 78, b: 13.5, c: 6.5,
    CL0: 0.04, CLa: 3.3, alphaStall: 0.62, CD0: 0.018, k: 0.11, flapCL: 0.25, flapCD: 0.03, flapNotches: [0, 1], gearCD: 0.015, brakeCD: 0.07, Mcrit: 0.92,
    Cm0: 0.0, Cma: -0.3, Cmq: -6, Cmde: 0.36,
    Clb: -0.04, Clp: -0.34, Clda: 0.055, Clr: 0.02,
    Cnb: 0.1, Cnr: -0.28, Cndr: 0.035, Cnda: -0.003, CYb: -1.0,
    I: [180000, 210000, 35000],
    engine: { type: 'jet', thrust: 2 * 116000, ab: 2 * 156000, spool: 3.6, count: 2 },
    gear: [
      { p: [0, -1.85, -6.0], travel: 0.32, steer: true, wheelR: 0.34, nose: true },
      { p: [-1.6, -1.85, 0.9], travel: 0.3, brake: true, wheelR: 0.45 },
      { p: [1.6, -1.85, 0.9], travel: 0.3, brake: true, wheelR: 0.45 },
    ],
    retract: true, hook: true,
    vR: 70, vRef: 68, vStall: 55, vMax: 680, gMax: 9, gMin: -3,
    gun: 480, missiles: 8, flares: 50,
    eye: [0, 0.9, -5.1], chase: 26,
    geom: {
      style: 'stealth', length: 19, radius: 1.05, heightScale: 0.8, noseLen: 5.5, tailLen: 5, tailUp: 0.1,
      wing: { span: 13.5, root: 8.5, tip: 1.7, sweep: 42, dihedral: 0, z: -1.0, y: 0, thick: 0.04, flapFrac: 0.45 },
      hstab: { span: 8.8, root: 3.4, tip: 1.2, sweep: 42, dihedral: 0, z: 6.6, y: 0, thick: 0.035 },
      vstab: { h: 3.2, root: 3.6, tip: 1.2, sweep: 42, z: 5.2, twin: 2.3, cant: 26 },
      canopy: { z: -4.6, len: 3.4, r: 0.7, y: 0.62, bubble: true },
      engines: [{ kind: 'jet', x: -0.95, y: 0, z: 9.3, r: 0.65, len: 1.2, intake: 'side' }, { kind: 'jet', x: 0.95, y: 0, z: 9.3, r: 0.65, len: 1.2, intake: 'side' }],
    },
    liveries: [L('스텔스 그레이', 0x6f7680, 0x575d66, 0x3a3f46, 0.35, 0.55), L('미드나잇', 0x1c1f26, 0x272b33, 0x5a6270, 0.4, 0.5), L('사막 섀도', 0xa39276, 0x7f715b, 0x4d4537, 0.3, 0.6)],
  },
  {
    id: 'meridian', name: 'Meridian M-320', ko: '메리디안 M-320', role: '쌍발 제트 여객기',
    desc: '대형 여객기. 오토파일럿·오토스로틀·ILS 자동착륙 지원. 부드러운 착륙에 도전하세요.',
    stats: { speed: 60, agility: 15, armor: 45, firepower: 0, ease: 75 },
    mass: 50000, fuel: 12000, burn: 1.4,
    S: 122.6, b: 34, c: 4.2,
    CL0: 0.25, CLa: 5.3, alphaStall: 0.25, CD0: 0.022, k: 0.042, flapCL: 1.25, flapCD: 0.07, flapNotches: [0, 0.25, 0.5, 0.75, 1], gearCD: 0.018, brakeCD: 0.05, Mcrit: 0.8,
    Cm0: 0.02, Cma: -1.3, Cmq: -22, Cmde: 0.4,
    Clb: -0.1, Clp: -0.45, Clda: 0.05, Clr: 0.1,
    Cnb: 0.11, Cnr: -0.18, Cndr: 0.05, Cnda: -0.005, CYb: -0.7,
    I: [3.6e6, 5.2e6, 2.0e6],
    engine: { type: 'jet', thrust: 2 * 120000, spool: 5, count: 2 },
    gear: [
      { p: [0, -4.0, -12.3], travel: 0.35, steer: true, wheelR: 0.42, nose: true },
      { p: [-3.8, -4.0, 1.2], travel: 0.45, brake: true, wheelR: 0.6 },
      { p: [3.8, -4.0, 1.2], travel: 0.45, brake: true, wheelR: 0.6 },
    ],
    retract: true, hook: false,
    vR: 75, vRef: 70, vStall: 62, vMax: 260, gMax: 2.5, gMin: -1,
    gun: 0, missiles: 0, flares: 0,
    eye: [-0.55, 1.2, -16.4], chase: 60,
    geom: {
      style: 'airliner', length: 37.5, radius: 2.0, heightScale: 1.08, noseLen: 5.5, tailLen: 9, tailUp: 0.8,
      wing: { span: 34, root: 7, tip: 1.6, sweep: 26, dihedral: 5, z: -3.0, y: -1.1, thick: 0.11, flapFrac: 0.55 },
      hstab: { span: 12.5, root: 3.6, tip: 1.3, sweep: 30, dihedral: 6, z: 15.2, y: 0.5, thick: 0.08 },
      vstab: { h: 6.2, root: 5.6, tip: 2.0, sweep: 38, z: 13.4 },
      canopy: { z: -16.1, len: 2.4, r: 1.3, y: 0.7, bubble: false },
      engines: [{ kind: 'jet', x: -5.8, y: -2.4, z: -4.6, r: 1.05, len: 4.3, pod: true, intake: 'pod' }, { kind: 'jet', x: 5.8, y: -2.4, z: -4.6, r: 1.05, len: 4.3, pod: true, intake: 'pod' }],
    },
    liveries: [L('호라이즌 에어', 0xf7f7f7, 0x0b4f8a, 0x27a3dd, 0.2, 0.3), L('선라이즈', 0xffffff, 0xe85d04, 0xfaa307, 0.2, 0.3), L('미드나잇 퍼플', 0xf3f0ff, 0x3c096c, 0x9d4edd, 0.2, 0.3)],
  },
  {
    id: 'atlas', name: 'Atlas C-40', ko: '아틀라스 C-40', role: '4발 터보프롭 수송기',
    desc: '튼튼한 고익 4발 수송기. 짧은 비포장 활주로와 산악 활주로에 강하다.',
    stats: { speed: 45, agility: 22, armor: 85, firepower: 0, ease: 80 },
    mass: 38000, fuel: 9000, burn: 0.9,
    S: 162, b: 40.4, c: 4.2,
    CL0: 0.35, CLa: 5.4, alphaStall: 0.26, CD0: 0.03, k: 0.045, flapCL: 1.1, flapCD: 0.06, flapNotches: [0, 0.33, 0.66, 1], gearCD: 0.0, brakeCD: 0, Mcrit: 0.68,
    Cm0: 0.03, Cma: -1.4, Cmq: -24, Cmde: 0.45,
    Clb: -0.1, Clp: -0.5, Clda: 0.06, Clr: 0.1,
    Cnb: 0.1, Cnr: -0.18, Cndr: 0.06, Cnda: -0.005, CYb: -0.7,
    I: [2.6e6, 4.1e6, 1.7e6],
    engine: { type: 'prop', power: 4 * 3400000, staticT: 4 * 62000, thrust: 4 * 62000, spool: 2.2, count: 4 },
    gear: [
      { p: [0, -3.6, -10.5], travel: 0.4, steer: true, wheelR: 0.55, nose: true },
      { p: [-2.4, -3.6, 1.0], travel: 0.45, brake: true, wheelR: 0.7 },
      { p: [2.4, -3.6, 1.0], travel: 0.45, brake: true, wheelR: 0.7 },
    ],
    retract: true, hook: false,
    vR: 55, vRef: 58, vStall: 46, vMax: 190, gMax: 3, gMin: -1,
    gun: 0, missiles: 0, flares: 60,
    eye: [-0.6, 1.9, -13.6], chase: 60,
    geom: {
      style: 'turboprop', length: 33, radius: 2.4, heightScale: 1.05, noseLen: 4.5, tailLen: 10, tailUp: 1.6,
      wing: { span: 40.4, root: 5, tip: 2.4, sweep: 3, dihedral: -1, z: -2.6, y: 2.0, thick: 0.15, flapFrac: 0.6 },
      hstab: { span: 16, root: 3.6, tip: 2.0, sweep: 10, dihedral: 4, z: 13.8, y: 2.6, thick: 0.1 },
      vstab: { h: 7.2, root: 6, tip: 2.6, sweep: 30, z: 12.0 },
      canopy: { z: -13.6, len: 2.6, r: 1.5, y: 1.0, bubble: false },
      engines: [
        { kind: 'turboprop', x: -5.2, y: 1.6, z: -5.2, r: 2.05, blades: 6 }, { kind: 'turboprop', x: 5.2, y: 1.6, z: -5.2, r: 2.05, blades: 6 },
        { kind: 'turboprop', x: -10.4, y: 1.5, z: -4.6, r: 2.05, blades: 6 }, { kind: 'turboprop', x: 10.4, y: 1.5, z: -4.6, r: 2.05, blades: 6 },
      ],
      highWing: true,
    },
    liveries: [L('택티컬 그레이', 0x7d8790, 0x5e6870, 0x2f363c, 0.3, 0.55), L('구조대 레드', 0xf2f2f2, 0xc1121f, 0x003049, 0.2, 0.4), L('올리브', 0x6b705c, 0x4f5442, 0x2c2e24, 0.25, 0.6)],
  },
];

export const getSpec = (id: string) => AIRCRAFT.find((a) => a.id === id) ?? AIRCRAFT[0];
