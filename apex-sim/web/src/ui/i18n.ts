// Minimal i18n (§18.6: 한국어 기본 + 영어). The full catalogue and switcher arrive with the M5 UI.
export type Lang = 'ko' | 'en';
export type Localized = Record<Lang, string>;

const STRINGS = {
  subtitle: { ko: 'M1 물리 샌드박스 · 주행', en: 'M1 physics sandbox · driving' },
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
  noIsolation: {
    ko: '이 페이지는 교차 출처 격리(COOP/COEP)가 필요합니다. 제공된 개발 서버나 _headers 설정이 있는 호스팅에서 여십시오.',
    en: 'This page needs cross-origin isolation (COOP/COEP). Open it from the dev server or a host with the _headers file.',
  },
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
