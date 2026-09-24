// Minimal i18n (§18.6: 한국어 기본 + 영어). The full catalogue and switcher arrive with the M5 UI.
export type Lang = 'ko' | 'en';
export type Localized = Record<Lang, string>;

const STRINGS = {
  subtitle: { ko: 'M2 물리 샌드박스 · 주행 · 충돌', en: 'M2 physics sandbox · driving · crashes' },
  drive: { ko: '주행', en: 'Drive' },
  startDrive: { ko: '주행장에서 운전', en: 'Drive on the test ground' },
  driveHelp: {
    ko: 'W/↑ 가속 · S/↓ 브레이크(정지 후 길게: 후진) · A/D 조향 · Space 핸드브레이크 · E/Q 변속 · M 수동 · T TCS · B ABS · C 카메라 · V 골격 · R 재시작',
    en: 'W/↑ throttle · S/↓ brake (hold at rest: reverse) · A/D steer · Space handbrake · E/Q shift · M manual · T TCS · B ABS · C camera · V x-ray · R restart',
  },
  cameraChase: { ko: '추적', en: 'Chase' },
  cameraOrbit: { ko: '궤도', en: 'Orbit' },
  loadingVehicle: { ko: '차량 불러오는 중…', en: 'Loading vehicle…' },
  vehicleFailed: { ko: '차량을 불러오지 못했습니다', en: 'Vehicle failed to load' },
  backToSandbox: { ko: '샌드박스로', en: 'Sandbox' },
  restart: { ko: '재시작', en: 'Restart' },
  crashTitle: { ko: '충돌 시험', en: 'Crash lab' },
  tools: { ko: '도구', en: 'Tools' },
  toolGrab: { ko: '잡기', en: 'Grab' },
  toolGrabHelp: { ko: '노드를 끌어 당기거나 들어 올리기', en: 'Drag a node to pull or lift it' },
  toolCrane: { ko: '크레인', en: 'Crane' },
  toolCraneHelp: { ko: '노드를 눌러 4 m 위 갈고리에 걸기', en: 'Click a node to hook it to a crane 4 m above' },
  toolReelUp: { ko: '감기 (PageUp)', en: 'Reel in (PageUp)' },
  toolReelStop: { ko: '멈춤', en: 'Stop' },
  toolReelDown: { ko: '풀기 (PageDown)', en: 'Pay out (PageDown)' },
  toolRelease: { ko: '모두 풀어주기', en: 'Release all' },
  toolHelp: { ko: '잡기: 노드를 끌기(바디 무게의 2배까지) · 크레인: 노드 클릭 후 ▲▼ 또는 PageUp/PageDown(40 kN, 0.6 m/s)', en: 'Grab: drag a node (up to twice the body weight) · Crane: click a node, then ▲▼ or PageUp/PageDown (40 kN, 0.6 m/s)' },
  startCrash: { ko: '충돌 시험장', en: 'Crash lab' },
  crashScenario: { ko: '시나리오', en: 'Scenario' },
  crashFullWall: { ko: '고정벽 정면(풀랩)', en: 'Rigid wall, full width' },
  crashOffsetWall: { ko: '고정벽 오프셋', en: 'Rigid wall, offset' },
  crashCarToCar: { ko: '차 대 차', en: 'Car to car' },
  crashCarA: { ko: '차량 A', en: 'Car A' },
  crashCarB: { ko: '차량 B', en: 'Car B' },
  crashSpeedA: { ko: '속도 A', en: 'Speed A' },
  crashSpeedB: { ko: '속도 B', en: 'Speed B' },
  crashOverlap: { ko: '겹침', en: 'Overlap' },
  crashAngle: { ko: '각도', en: 'Angle' },
  crashOffset: { ko: '옆 오프셋', en: 'Offset' },
  crashLaunch: { ko: '발사', en: 'Launch' },
  crashXray: { ko: '투시', en: 'X-ray' },
  crashFollow: { ko: '따라가기', en: 'Follow' },
  crashRealtime: { ko: '실시간', en: 'Real time' },
  crashLog: { ko: '충돌 이벤트 로그', en: 'Collision events' },
  logTime: { ko: '시각 s', en: 'Time s' },
  logWhat: { ko: '대상', en: 'Between' },
  logWhere: { ko: '위치 m', en: 'At m' },
  logSpeed: { ko: '상대 속도 km/h', en: 'Rel. speed km/h' },
  logForce: { ko: '최대 힘 kN', en: 'Peak force kN' },
  logEnergy: { ko: '흡수 kJ', en: 'Absorbed kJ' },
  logG: { ko: '최대 감속 g', en: 'Peak g' },
  logWorld: { ko: '벽', en: 'wall' },
  logEmpty: { ko: '아직 충돌이 없습니다 — 발사를 누르세요', en: 'No collision yet — press Launch' },
  hideUi: { ko: 'H 화면 정보 숨기기', en: 'H hide overlays' },
  scene: { ko: '씬', en: 'Scene' },
  spawn: { ko: '스폰', en: 'Spawn' },
  time: { ko: '시간 제어', en: 'Time' },
  view: { ko: '표시', en: 'View' },
  pause: { ko: '일시정지', en: 'Pause' },
  resume: { ko: '재생', en: 'Resume' },
  step: { ko: '한 스텝', en: 'Step' },
  reset: { ko: '초기화', en: 'Reset' },
  nodes: { ko: '노드', en: 'Nodes' },
  beams: { ko: '빔', en: 'Beams' },
  fps: { ko: '프레임', en: 'Frame' },
  physicsStep: { ko: '물리 스텝', en: 'Physics step' },
  rtf: { ko: '실시간 배율', en: 'Real-time factor' },
  simTime: { ko: '시뮬레이션 시간', en: 'Sim time' },
  bodies: { ko: '바디 / 노드 / 빔', en: 'Bodies / nodes / beams' },
  contacts: { ko: '접촉 (정적 / 바디)', en: 'Contacts (static / body)' },
  ccd: { ko: 'CCD 보정', en: 'CCD clamps' },
  kinetic: { ko: '운동에너지', en: 'Kinetic energy' },
  potential: { ko: '위치에너지', en: 'Potential energy' },
  dissipated: { ko: '소산 (소성 포함)', en: 'Dissipated (incl. plastic)' },
  plastic: { ko: '소성 흡수', en: 'Plastic absorbed' },
  balance: { ko: '에너지 수지 오차', en: 'Energy balance error' },
  memory: { ko: 'WASM 메모리', en: 'WASM memory' },
  backend: { ko: '렌더러 / 물리 스레드', en: 'Renderer / physics threads' },
  drawCalls: { ko: '드로우콜', en: 'Draw calls' },
  overloaded: { ko: '물리 과부하 — 시간 감속 중', en: 'Physics overloaded — time slowed' },
  stabilityWarn: { ko: '안정성 경고', en: 'Stability warning' },
  singleThread: {
    ko: '교차 출처 격리(COOP/COEP)가 없는 페이지라 물리를 단일 스레드로 돌립니다. 무거운 장면은 느려질 수 있습니다.',
    en: 'No cross-origin isolation (COOP/COEP) on this page: physics runs single-threaded, heavy scenes may slow down.',
  },
  gaugeTemp: { ko: '수온', en: 'Temp' },
  gaugeOil: { ko: '유압', en: 'Oil' },
  gaugeFuel: { ko: '연료', en: 'Fuel' },
  warnEngine: { ko: '엔진 고장', en: 'ENGINE' },
  warnTemp: { ko: '과열', en: 'HOT' },
  warnCoolant: { ko: '냉각수 누출', en: 'COOLANT' },
  warnOil: { ko: '오일', en: 'OIL' },
  warnFuel: { ko: '연료', en: 'FUEL' },
  warnBrakes: { ko: '브레이크', en: 'BRAKE' },
  warnSteering: { ko: '조향', en: 'STEER' },
  warnDrive: { ko: '구동', en: 'DRIVE' },
  warnGearbox: { ko: '변속기', en: 'GEARBOX' },
  warnBattery: { ko: '전장', en: 'BATTERY' },
  hintOrbit: { ko: '드래그 회전 · 휠 줌 · WASD 이동 · Q/E 높이', en: 'Drag orbit · wheel zoom · WASD move · Q/E height' },
  hintTime: { ko: 'Space 일시정지 · . 한 스텝 · [ ] 속도 · R 초기화 · F 포커스', en: 'Space pause · . step · [ ] speed · R reset · F focus' },
} satisfies Record<string, Localized>;

export type StringKey = keyof typeof STRINGS;

// §18.6: Korean is the default language; `?lang=en` switches to English.
let lang: Lang = new URLSearchParams(globalThis.location?.search ?? '').get('lang') === 'en' ? 'en' : 'ko';

export function setLang(l: Lang): void {
  lang = l;
}
export function currentLang(): Lang {
  return lang;
}
export function t(key: StringKey): string {
  return STRINGS[key][lang];
}
export function tl(text: Localized): string {
  return text[lang];
}
