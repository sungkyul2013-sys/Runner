import * as THREE from 'three';
import { terrainHeight, CANYON_X, CITY, RUNWAYS, CARRIER } from '../world/WorldDef';
import { DEG } from '../core/math';

export type StartType = 'runway' | 'air' | 'carrier' | 'altiport' | 'catapult';
export interface StartDef { type: StartType; x?: number; z?: number; alt?: number; hdg?: number; speed?: number }
export type ObjDef =
  | { type: 'climb'; agl: number; label: string }
  | { type: 'rings'; rings: [number, number, number][]; radius: number; label: string }
  | { type: 'land'; where: 'main' | 'alti' | 'carrier' | 'any'; label: string }
  | { type: 'destroy'; air?: [string, number, number, number, number][]; ground?: [string, number, number][]; buildings?: number; label: string }
  | { type: 'reach'; x: number; z: number; r: number; label: string }
  | { type: 'aero'; moves: ('loop' | 'roll' | 'inverted' | 'knife')[]; label: string }
  | { type: 'protect'; bombers: number; escorts: number; label: string };

export interface MissionDef {
  id: string; title: string; sub: string; cat: 'campaign' | 'course' | 'challenge';
  aircraft: string; choice?: string[];
  start: StartDef; hour: number; weather: string; wind?: [number, number];
  objectives: ObjDef[]; par: number; briefing: string; tips?: string[];
  engineFail?: number; timeLimit?: number; smoke?: boolean;
}

function canyonRings(): [number, number, number][] {
  const r: [number, number, number][] = [];
  for (let z = 1600; z > -9000; z -= 650) {
    const x = CANYON_X + Math.sin(z * 0.00055) * 900 + Math.sin(z * 0.0017) * 220;
    let floor = Infinity;
    for (let dx = -40; dx <= 40; dx += 20) floor = Math.min(floor, terrainHeight(x + dx, z));
    r.push([x, Math.max(floor, 0) + 55, z]);
  }
  return r;
}
function citySlalom(): [number, number, number][] {
  const r: [number, number, number][] = [];
  const x0 = CITY.cx - CITY.hx;
  const roads = [3, 6, 9, 12, 15];
  let k = 0;
  for (let z = CITY.cz + CITY.hz - 200; z > CITY.cz - CITY.hz + 200; z -= 420) {
    const i = roads[k++ % roads.length];
    r.push([x0 + i * 140, CITY.elev + 70 + (k % 3) * 25, z]);
  }
  return r;
}
function coastRings(): [number, number, number][] {
  const r: [number, number, number][] = [];
  for (let a = 0; a < 14; a++) {
    const x = -3500 + a * 900;
    let z = 2000;
    for (; z < 14000; z += 50) if (terrainHeight(x, z) < 0) break;
    r.push([x, 60 + (a % 2) * 50, z + 200]);
  }
  return r;
}
function mountainRings(): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 1.6 + 0.2;
    const x = -800 + Math.cos(a) * 5200, z = -9500 + Math.sin(a) * 3200;
    let h = 0;
    for (let dx = -200; dx <= 200; dx += 100) for (let dz = -200; dz <= 200; dz += 100) h = Math.max(h, terrainHeight(x + dx, z + dz));
    pts.push([x, h + 140, z]);
  }
  return pts;
}

const R0 = RUNWAYS[0];
const FINAL = (km: number, alt: number): StartDef => ({ type: 'air', x: R0.cx, z: R0.cz + R0.length / 2 + km * 1000, alt: R0.elev + alt, hdg: 0 });

export const MISSIONS: MissionDef[] = [
  {
    id: 'm1', title: '첫 이륙', sub: '기본 조작 · 이륙 · 링 통과', cat: 'campaign', aircraft: 'kestrel',
    start: { type: 'runway' }, hour: 9.5, weather: 'clear', par: 160,
    objectives: [
      { type: 'climb', agl: 250, label: '스로틀 최대 → 속도 55kt에서 기수 들기 → 고도 250m 상승' },
      { type: 'rings', rings: [[0, 350, -3500], [-300, 420, -5200], [-1200, 480, -6600], [-2800, 500, -7200]], radius: 45, label: '링 4개 통과' },
    ],
    briefing: '호라이즌 국제공항 RWY 36에서 첫 비행을 시작합니다. 초보자 보조가 자세를 안정시켜 줍니다.',
    tips: ['스로틀을 끝까지 올리세요', '속도가 55kt를 넘으면 조종간을 당겨 기수를 드세요', '링은 HUD의 화살표를 따라가세요'],
  },
  {
    id: 'm2', title: '파이널 어프로치', sub: 'PAPI · ILS를 활용한 정밀 착륙', cat: 'campaign', aircraft: 'kestrel',
    start: { ...FINAL(4, 220), speed: 38 }, hour: 17.6, weather: 'clear', wind: [350, 4], par: 150,
    objectives: [{ type: 'land', where: 'main', label: 'RWY 36에 착륙 후 완전 정지' }],
    briefing: '석양 속 최종 접근. PAPI 등이 흰색 2개·빨간색 2개를 유지하면 정상 활공각(3°)입니다.',
    tips: ['플랩을 내리면 저속 비행이 쉬워집니다', '접지 직전 살짝 당겨 플레어하세요', '착륙 후 브레이크를 길게 누르세요'],
  },
  {
    id: 'm3', title: '측풍 착륙', sub: '시속 40km 측풍 속 크랩 & 디크랩', cat: 'campaign', aircraft: 'kestrel', choice: ['kestrel', 'meridian', 'atlas'],
    start: { ...FINAL(5, 280), speed: 40 }, hour: 13, weather: 'scattered', wind: [80, 11], par: 180,
    objectives: [{ type: 'land', where: 'main', label: '측풍을 이기고 RWY 36 착륙' }],
    briefing: '동쪽에서 강한 측풍이 붑니다. 바람 쪽으로 기수를 틀어(크랩) 접근하고, 접지 직전 러더로 정렬하세요.',
  },
  {
    id: 'm4', title: '에어쇼', sub: '루프 · 롤 · 배면 · 나이프엣지', cat: 'campaign', aircraft: 'vortex',
    start: { type: 'air', x: 0, z: -1500, alt: 700, hdg: 0, speed: 75 }, hour: 15, weather: 'clear', par: 120, smoke: true,
    objectives: [{ type: 'aero', moves: ['loop', 'roll', 'inverted', 'knife'], label: '곡예 기동 4종 수행' }],
    briefing: '관중이 지켜보는 공항 상공에서 스모크를 켜고 곡예 비행을 펼치세요. 현실 모드에 가까울수록 쉽습니다.',
    tips: ['루프: 속도를 충분히 붙이고 조종간을 끝까지 당기기', '롤: 좌우 조종을 끝까지', '배면 비행: 뒤집힌 채 5초 유지', '나이프엣지: 90° 뱅크 3초 유지'],
  },
  {
    id: 'm5', title: '협곡 질주', sub: '붉은 협곡의 좁은 링 코스', cat: 'campaign', aircraft: 'vortex', choice: ['vortex', 'strix', 'kestrel'],
    start: { type: 'air', x: CANYON_X - 400, z: 3600, alt: 420, hdg: 345, speed: 80 }, hour: 18.1, weather: 'clear', par: 170,
    objectives: [{ type: 'rings', rings: canyonRings(), radius: 40, label: '협곡 링 통과' }],
    briefing: '석양에 물든 협곡을 저공으로 통과합니다. 벽에 부딪히지 않도록 주의!',
  },
  {
    id: 'm6', title: '침입자 요격', sub: '적 전투기 3기 격추', cat: 'campaign', aircraft: 'strix', choice: ['strix', 'specter'],
    start: { type: 'air', x: 0, z: -2000, alt: 2500, hdg: 0, speed: 230 }, hour: 11, weather: 'scattered', par: 240,
    objectives: [{ type: 'destroy', air: [['fighter', 3, -1500, -14000, 3000]], label: '적 전투기 3기 격추' }],
    briefing: '북쪽 산맥 너머에서 미확인 전투기 편대가 접근 중. 미사일 락온(조준원 안에 1.2초) 후 발사하세요. 위협 시 플레어!',
    tips: ['적이 시야 콘 안에 들어오면 락온 톤이 울립니다', '미사일 경보 시 플레어 + 급선회', '기관포는 근거리에서'],
  },
  {
    id: 'm7', title: '정밀 타격', sub: '대공망 제압 및 연료 저장소 파괴', cat: 'campaign', aircraft: 'strix', choice: ['strix', 'specter'],
    start: { type: 'runway' }, hour: 7.2, weather: 'scattered', par: 300,
    objectives: [
      { type: 'climb', agl: 300, label: '이륙 후 300m 상승' },
      { type: 'destroy', ground: [['sam', 2600, -12400], ['sam', 3600, -11200], ['aaa', 3000, -11800], ['aaa', 2200, -11600], ['radar', 3100, -12200], ['fuel', 2800, -11000], ['tank', 2400, -11300], ['tank', 3300, -11500]], label: '북부 계곡 적 기지 파괴' },
      { type: 'land', where: 'any', label: '귀환 착륙' },
    ],
    briefing: '새벽, 북쪽 계곡에 배치된 SAM·대공포·레이더·연료 저장소를 파괴하고 귀환하세요.',
  },
  {
    id: 'm8', title: '항모 착함', sub: '어레스팅 와이어 #3을 노려라', cat: 'campaign', aircraft: 'strix', choice: ['strix', 'specter'],
    start: { type: 'air', x: CARRIER.cx, z: CARRIER.cz + CARRIER.length / 2 + 5500, alt: CARRIER.deck + 300, hdg: 0, speed: 75 }, hour: 12.5, weather: 'scattered', wind: [0, 9], par: 150,
    objectives: [{ type: 'land', where: 'carrier', label: '항공모함 착함 (테일훅 H 키/버튼)' }],
    briefing: '항모의 광학 착함 장치(미트볼)를 보세요. 노란 공이 녹색 기준선과 일치하면 정상 활공각(3.5°). 훅을 내리고 접근!',
    tips: ['기어·훅·플랩을 모두 내리세요', '접지 순간 스로틀을 줄이지 마세요(볼터 대비)', '와이어에 걸리면 스로틀 아이들'],
  },
  {
    id: 'm9', title: '엔진 정지!', sub: '활공으로 비상 착륙', cat: 'campaign', aircraft: 'kestrel', choice: ['kestrel', 'meridian'],
    start: { type: 'air', x: 2500, z: 9000, alt: 1100, hdg: 330, speed: 45 }, hour: 14, weather: 'scattered', par: 300, engineFail: 6,
    objectives: [{ type: 'land', where: 'any', label: '엔진 없이 활주로에 착륙' }],
    briefing: '순항 중 엔진이 멈춥니다. 최적 활공 속도를 유지하며 가장 가까운 활주로까지 활공하세요.',
    tips: ['최적 활공 속도 약 65kt (케스트럴)', '고도를 에너지로 생각하세요', '활주로 근처에서 플랩'],
  },
  {
    id: 'm10', title: '야간 ILS 착륙', sub: '비·야간 계기 접근', cat: 'campaign', aircraft: 'meridian', choice: ['meridian', 'atlas'],
    start: { ...FINAL(13, 900), speed: 85 }, hour: 22.5, weather: 'rain', wind: [20, 8], par: 360,
    objectives: [{ type: 'land', where: 'main', label: 'ILS 접근으로 RWY 36 착륙' }],
    briefing: '야간 비 속 계기 접근. HUD의 ILS 바와 활주로 접근등(래빗)을 따라가세요. 자동 접근(APP)도 사용 가능.',
    tips: ['A 메뉴 → APP로 자동 ILS 접근', '플랩 단계적으로, 기어는 3km 이전에'],
  },
  {
    id: 'm11', title: '폭격기 요격', sub: '도시 상공 방어', cat: 'campaign', aircraft: 'specter', choice: ['specter', 'strix'],
    start: { type: 'air', x: 1000, z: 0, alt: 1800, hdg: 30, speed: 220 }, hour: 16.5, weather: 'clear', par: 260, timeLimit: 420,
    objectives: [{ type: 'protect', bombers: 2, escorts: 2, label: '폭격기가 도시에 도달하기 전 격추' }],
    briefing: '북동쪽에서 폭격기 2기가 호위기와 함께 도시를 향합니다. 폭격기를 최우선으로 격추하세요!',
  },
  {
    id: 'm12', title: '도시 타격', sub: '지정 건물 파괴', cat: 'campaign', aircraft: 'specter', choice: ['specter', 'strix'],
    start: { type: 'air', x: 0, z: 2500, alt: 1200, hdg: 60, speed: 200 }, hour: 20.2, weather: 'clear', par: 240,
    objectives: [{ type: 'destroy', buildings: 4, label: '표시된 건물 4동 파괴' }],
    briefing: '훈련 시나리오: 도시의 지정된 고층 건물 4동(붉은 마커)을 미사일과 기관포로 파괴하세요.',
  },
  {
    id: 'm13', title: '이글 피크 착륙', sub: '해발 820m 산악 단거리 활주로', cat: 'campaign', aircraft: 'atlas', choice: ['atlas', 'kestrel'],
    start: { type: 'air', x: -1800, z: -8200 + 380 + 6000, alt: 1250, hdg: 0, speed: 70 }, hour: 10.5, weather: 'scattered', wind: [10, 6], par: 240,
    objectives: [{ type: 'land', where: 'alti', label: '산악 활주로(760m)에 착륙 후 정지' }],
    briefing: '산 정상 부근의 짧은 활주로. 플랩 최대, 정확한 속도 관리가 필수입니다.',
  },
  // ---- Courses ----
  { id: 'c1', title: '해안 링 레이스', sub: '남부 해안선 14링', cat: 'course', aircraft: 'vortex', choice: ['vortex', 'kestrel', 'strix', 'specter'], start: { type: 'air', x: -4400, z: 7000, alt: 120, hdg: 90, speed: 80 }, hour: 8, weather: 'clear', par: 150, objectives: [{ type: 'rings', rings: coastRings(), radius: 45, label: '해안 링 통과' }], briefing: '아침 햇살 속 해안을 따라 저공 비행.' },
  { id: 'c2', title: '협곡 타임어택', sub: '붉은 협곡', cat: 'course', aircraft: 'strix', choice: ['vortex', 'kestrel', 'strix', 'specter'], start: { type: 'air', x: CANYON_X - 400, z: 3600, alt: 420, hdg: 345, speed: 120 }, hour: 12, weather: 'clear', par: 110, objectives: [{ type: 'rings', rings: canyonRings(), radius: 40, label: '협곡 링 통과' }], briefing: '제트기로 협곡을 최고 속도로!' },
  { id: 'c3', title: '도심 슬라럼', sub: '마천루 사이를 누벼라', cat: 'course', aircraft: 'vortex', choice: ['vortex', 'kestrel', 'strix'], start: { type: 'air', x: CITY.cx - CITY.hx + 420, z: CITY.cz + CITY.hz + 1200, alt: 140, hdg: 0, speed: 70 }, hour: 21, weather: 'clear', par: 120, objectives: [{ type: 'rings', rings: citySlalom(), radius: 38, label: '도심 링 통과' }], briefing: '야경 속 빌딩 숲 슬라럼.' },
  { id: 'c4', title: '알파인 서킷', sub: '설산 고개 넘기', cat: 'course', aircraft: 'strix', choice: ['vortex', 'kestrel', 'strix', 'specter', 'atlas'], start: { type: 'air', x: 4400, z: -9500, alt: 2600, hdg: 270, speed: 160 }, hour: 14, weather: 'scattered', par: 220, objectives: [{ type: 'rings', rings: mountainRings(), radius: 70, label: '산악 링 통과' }], briefing: '만년설 봉우리 사이를 비행합니다.' },
  // ---- Challenges ----
  { id: 'x1', title: '랜딩 챌린지', sub: '무작위 조건 · 점수 경쟁', cat: 'challenge', aircraft: 'kestrel', choice: ['kestrel', 'vortex', 'strix', 'specter', 'meridian', 'atlas'], start: { ...FINAL(4, 220), speed: 45 }, hour: 12, weather: 'random', par: 200, objectives: [{ type: 'land', where: 'main', label: '최고 점수의 착륙' }], briefing: '매번 바뀌는 시간·날씨·바람 속에서 최고의 착륙 점수에 도전!' },
  { id: 'x2', title: '캐터펄트 발진', sub: '항모 사출 이륙 → 귀환 착함', cat: 'challenge', aircraft: 'strix', choice: ['strix', 'specter'], start: { type: 'catapult' }, hour: 6.6, weather: 'clear', wind: [0, 8], par: 400, objectives: [{ type: 'climb', agl: 400, label: '캐터펄트 발진 (스로틀 최대 후 발진 버튼)' }, { type: 'reach', x: CARRIER.cx, z: CARRIER.cz + 6000, r: 900, label: '항모 후방 6km 지점으로 이동' }, { type: 'land', where: 'carrier', label: '착함' }], briefing: '새벽의 항모에서 사출 이륙 후 패턴을 돌아 다시 착함하세요.' },
  { id: 'x3', title: '무한 공중전', sub: '끝없이 몰려오는 적기', cat: 'challenge', aircraft: 'strix', choice: ['strix', 'specter'], start: { type: 'air', x: 0, z: -3000, alt: 3000, hdg: 0, speed: 230 }, hour: 17.8, weather: 'scattered', par: 600, objectives: [{ type: 'destroy', air: [['fighter', 2, 0, -11000, 3000]], label: '웨이브 격추 (무한)' }], briefing: '얼마나 오래 살아남을 수 있을까?' },
];

/* ---------- runtime helpers ---------- */
export class RingSet {
  readonly group = new THREE.Group();
  meshes: THREE.Mesh[] = [];
  idx = 0;
  private mat: THREE.MeshBasicMaterial; private matNext: THREE.MeshBasicMaterial; private matDone: THREE.MeshBasicMaterial;
  constructor(public pts: [number, number, number][], public radius: number) {
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.2, 2.2), transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false });
    this.matNext = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.6, 0.2), toneMapped: false });
    this.matDone = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.5, 0.4), transparent: true, opacity: 0.12, toneMapped: false, depthWrite: false });
    const geo = new THREE.TorusGeometry(radius, Math.max(1.2, radius * 0.045), 10, 48);
    pts.forEach((p, i) => {
      const m = new THREE.Mesh(geo, this.mat);
      m.position.set(...p);
      const nxt = pts[i + 1] ?? pts[i];
      const prv = pts[i - 1] ?? [p[0], p[1], p[2] + 100];
      const dir = new THREE.Vector3(nxt[0] - prv[0], (nxt[1] - prv[1]) * 0.3, nxt[2] - prv[2]).normalize();
      m.lookAt(m.position.clone().add(dir));
      this.meshes.push(m);
      this.group.add(m);
    });
    this.refresh();
  }
  refresh() { this.meshes.forEach((m, i) => (m.material = i < this.idx ? this.matDone : i === this.idx ? this.matNext : this.mat)); }
  get next() { return this.meshes[this.idx]; }
  /** Returns true when the aircraft passed through the active ring this frame. */
  check(prev: THREE.Vector3, cur: THREE.Vector3): 'hit' | 'miss' | null {
    const m = this.meshes[this.idx];
    if (!m) return null;
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion);
    const d0 = prev.clone().sub(m.position).dot(n), d1 = cur.clone().sub(m.position).dot(n);
    if (d0 < 0 && d1 >= 0 || d0 > 0 && d1 <= 0) {
      const t = d0 / (d0 - d1);
      const p = prev.clone().lerp(cur, t);
      const r = p.distanceTo(m.position);
      if (r < this.radius * 1.05) { this.idx++; this.refresh(); return 'hit'; }
      if (r < this.radius * 3) { this.idx++; this.refresh(); return 'miss'; }
    }
    return null;
  }
  update(t: number) {
    const m = this.meshes[this.idx];
    if (m) { const s = 1 + Math.sin(t * 5) * 0.05; m.scale.setScalar(s); }
  }
}

export class AeroTracker {
  done = new Set<string>();
  private pitchAcc = 0; private rollAcc = 0; private invT = 0; private knifeT = 0; private loopT = 0; private rollT = 0;
  update(dt: number, q: number, p: number, roll: number, vs: number) {
    this.pitchAcc += q * dt; this.loopT += dt;
    if (this.loopT > 25 || Math.abs(this.rollAcc) > 2.5 && this.loopT > 6) { this.pitchAcc = 0; this.loopT = 0; }
    if (Math.abs(this.pitchAcc) > 5.6) { this.done.add('loop'); this.pitchAcc = 0; }
    this.rollAcc += p * dt; this.rollT += dt;
    if (this.rollT > 7) { this.rollAcc = 0; this.rollT = 0; }
    if (Math.abs(this.rollAcc) > 5.8) { this.done.add('roll'); this.rollAcc = 0; this.rollT = 0; }
    if (Math.abs(roll) > 150 * DEG) { this.invT += dt; if (this.invT > 5) this.done.add('inverted'); } else this.invT = 0;
    if (Math.abs(Math.abs(roll) - Math.PI / 2) < 17 * DEG && Math.abs(vs) < 10) { this.knifeT += dt; if (this.knifeT > 3) this.done.add('knife'); } else this.knifeT = 0;
  }
  progress() { return { inv: this.invT, knife: this.knifeT, loop: this.pitchAcc, roll: this.rollAcc }; }
}

export const MOVE_NAMES: Record<string, string> = { loop: '루프', roll: '에일러론 롤', inverted: '배면 비행 5초', knife: '나이프엣지 3초' };
