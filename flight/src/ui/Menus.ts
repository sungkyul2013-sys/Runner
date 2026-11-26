import { CSS } from './styles';
import { AIRCRAFT, getSpec, AircraftSpec } from '../aircraft/specs';
import { MISSIONS, MissionDef } from '../game/Missions';
import { settings, progress, save, resetProgress, Settings, IS_MOBILE } from '../core/Save';
import { WEATHER_PRESETS } from '../world/Sky';
import type { LandingReport } from '../game/LandingEval';
import { MS_TO_KT } from '../core/math';

export interface SandboxCfg {
  aircraft: string; livery: number; spawn: string; hour: number; weather: string; windSpeed: number; windDir: number; turbulence: number;
  invincible: boolean; infFuel: boolean; infAmmo: boolean; enemies: number; ground: boolean; traffic: boolean;
}
export interface ResultData {
  success: boolean; title: string; reason: string; time: number; stars: number; rows: [string, string][]; landing: LandingReport | null; missionId: string | null; canReplay: boolean;
}
export interface UIHost {
  ui(): void;
  previewAircraft(id: string, livery: number): void;
  setMenuScene(kind: 'title' | 'hangar' | 'briefing'): void;
  startMission(def: MissionDef, ac: string, livery: number): void;
  startSandbox(cfg: SandboxCfg): void;
  resume(): void; restart(): void; quit(): void; replay(): void; photo(): void; exitPhoto(): void; screenshot(): void;
  applySettings(graphics: boolean): void;
  ap(): { on: boolean; alt: boolean; hdg: boolean; spd: boolean; app: boolean; altT: number; hdgT: number; spdT: number } | null;
  apCmd(cmd: string, delta?: number): void;
  requestTilt(): void;
}

const ICON: Record<string, string> = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>',
  plane: '<svg viewBox="0 0 24 24"><path d="M2 13l8-2 4-8h2l-2 8 6 1 2-2h1l-1 4 1 4h-1l-2-2-6 1 2 8h-2l-4-8-8-2z"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4 M5 4h11l-2 4 2 4H5"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  land: '<svg viewBox="0 0 24 24"><path d="M2 20h20M4 14l6-1 5-6h2l-2 6 5 1v2l-16-1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="20" height="20" stroke="#e9f1f8" fill="none" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg>',
};

const h = (html: string) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export class Menus {
  readonly root: HTMLDivElement;
  private screens = new Map<string, HTMLElement>();
  current = '';
  selAc = progress.selectedAircraft;
  selLiv = 0;
  private pendingMission: MissionDef | null = null;
  private missionTab: 'campaign' | 'course' | 'challenge' = 'campaign';
  sandbox: SandboxCfg = { aircraft: 'strix', livery: 0, spawn: 'runway', hour: 10, weather: 'scattered', windSpeed: 5, windDir: 350, turbulence: 0.2, invincible: false, infFuel: true, infAmmo: false, enemies: 0, ground: false, traffic: true };
  private toastEl: HTMLElement | null = null;
  private tipEl: HTMLElement | null = null;
  private apEl: HTMLElement | null = null;
  fpsEl: HTMLElement;
  onTitleTap: () => void = () => {};

  constructor(private host: UIHost) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.root = document.createElement('div'); this.root.id = 'ui'; document.body.appendChild(this.root);
    this.selLiv = progress.liveries[this.selAc] ?? 0;
    this.fpsEl = h('<div class="fps" style="display:none"></div>'); this.root.appendChild(this.fpsEl);
  }

  private screen(id: string, html: string): HTMLElement {
    this.screens.get(id)?.remove();
    const el = h(`<div class="scr" data-id="${id}">${html}</div>`);
    this.root.appendChild(el);
    this.screens.set(id, el);
    return el;
  }
  show(id: string) {
    for (const [k, el] of this.screens) el.classList.toggle('show', k === id);
    this.current = id;
    const el = this.screens.get(id);
    if (el) { el.classList.remove('fade-in'); void el.offsetWidth; el.classList.add('fade-in'); }
  }
  hideAll() { this.show(''); }
  private click(el: HTMLElement, sel: string, fn: (e: HTMLElement) => void) {
    el.querySelectorAll<HTMLElement>(sel).forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); this.host.ui(); fn(b); }));
  }

  /* ---------------- loading ---------------- */
  loading(p: number, tip: string) {
    let el = this.screens.get('loading');
    if (!el) {
      el = this.screen('loading', `<div class="load"><div class="c"><div class="ring"></div>
        <div style="font-family:var(--f1);font-size:30px;letter-spacing:.3em;font-weight:700">SKY ACE</div>
        <div style="color:var(--am);letter-spacing:.5em;font-family:var(--f1);font-size:13px">HORIZON</div>
        <div class="pb"><div style="width:0"></div></div><div class="tip"></div></div></div>`);
      this.show('loading');
    }
    (el.querySelector('.pb div') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
    (el.querySelector('.tip') as HTMLElement).textContent = tip;
  }

  /* ---------------- title / main ---------------- */
  main() {
    const spec = getSpec(this.selAc);
    const el = this.screen('main', `
      <div class="vign"></div>
      <div class="brand"><div class="t1">SKY ACE</div><div class="t2">HORIZON</div><div class="t3">스카이 에이스 · 플라이트 &amp; 컴뱃 시뮬레이터</div></div>
      <nav class="mainnav">
        <button class="mi primary" data-a="campaign" style="animation-delay:.05s"><div class="ic">${ICON.play}</div><div><div class="nm">캠페인</div><div class="ds">이착륙 훈련부터 공중전·항모 착함까지 13개 미션</div></div></button>
        <button class="mi" data-a="sandbox" style="animation-delay:.1s"><div class="ic">${ICON.globe}</div><div><div class="nm">자유 비행</div><div class="ds">샌드박스 — 시간·날씨·스폰·적기 모두 자유롭게</div></div></button>
        <button class="mi" data-a="course" style="animation-delay:.15s"><div class="ic">${ICON.flag}</div><div><div class="nm">코스 &amp; 챌린지</div><div class="ds">링 레이스 · 랜딩 챌린지 · 캐터펄트 · 무한 공중전</div></div></button>
        <button class="mi" data-a="hangar" style="animation-delay:.2s"><div class="ic">${ICON.plane}</div><div><div class="nm">격납고</div><div class="ds">6종 기체 · 도색 선택</div></div></button>
        <button class="mi" data-a="settings" style="animation-delay:.25s"><div class="ic">${ICON.gear}</div><div><div class="nm">설정</div><div class="ds">그래픽 · 조작 모드 · 보조 기능 · 사운드</div></div></button>
      </nav>
      <div class="showcase"><div class="k">SELECTED AIRCRAFT</div><div class="v">${spec.name}</div><div class="k" style="letter-spacing:.1em">${spec.ko} · ${spec.role}</div></div>
      <div class="statbar">
        <div class="stat glass"><b>${progress.flights}</b><span>비행</span></div>
        <div class="stat glass"><b>${progress.landings}</b><span>착륙</span></div>
        <div class="stat glass"><b>${progress.bestLanding || '-'}</b><span>최고 착륙점수</span></div>
        <div class="stat glass"><b>${progress.kills}</b><span>격추/파괴</span></div>
        <div class="stat glass"><b>${(progress.flightTime / 3600).toFixed(1)}h</b><span>비행 시간</span></div>
      </div>`);
    this.click(el, '[data-a]', (b) => {
      const a = b.dataset.a!;
      if (a === 'campaign') { this.missionTab = 'campaign'; this.missions(); }
      else if (a === 'course') { this.missionTab = 'course'; this.missions(); }
      else if (a === 'sandbox') this.sandboxScreen();
      else if (a === 'hangar') this.hangar();
      else if (a === 'settings') this.settingsScreen('main');
    });
    this.host.setMenuScene('title');
    this.show('main');
  }

  /* ---------------- hangar ---------------- */
  hangar(onPick?: (id: string, liv: number) => void, allowed?: string[]) {
    const list = allowed ? AIRCRAFT.filter((a) => allowed.includes(a.id)) : AIRCRAFT;
    if (!list.find((a) => a.id === this.selAc)) this.selAc = list[0].id;
    const el = this.screen('hangar', `
      <div class="hdr"><button class="back">${ICON.back}</button><div><h2>${onPick ? '기체 선택' : '격납고'}</h2><div class="sub">드래그하여 기체를 회전 · 도색을 선택하세요</div></div></div>
      <div class="hangar">
        <div class="aclist">${list.map((a) => `<button class="acitem" data-id="${a.id}"><div class="r">${a.role}</div><div class="n">${a.name}</div></button>`).join('')}</div>
        <div></div>
        <div class="acinfo glass"></div>
      </div>`);
    const info = el.querySelector('.acinfo') as HTMLElement;
    const render = () => {
      const s = getSpec(this.selAc);
      el.querySelectorAll('.acitem').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.id === s.id));
      const bar = (k: string, v: number) => `<div class="bar"><span>${k}</span><div class="tr"><div class="fl" style="width:${v}%"></div></div><b>${v}</b></div>`;
      info.innerHTML = `<div class="role">${s.role}</div><h3>${s.name}</h3><div style="color:var(--tx2);font-size:12px">${s.ko}</div><p>${s.desc}</p>
        ${bar('속도', s.stats.speed)}${bar('기동성', s.stats.agility)}${bar('내구도', s.stats.armor)}${bar('화력', s.stats.firepower)}${bar('조종 난이도', 100 - s.stats.ease)}
        <div class="specs">${this.specRows(s)}</div>
        <div style="margin-top:12px;font-size:11px;color:var(--tx2);letter-spacing:.14em">LIVERY</div>
        <div class="livs">${s.liveries.map((l, i) => `<button class="liv ${i === this.selLiv ? 'on' : ''}" data-l="${i}" title="${l.name}" style="background:linear-gradient(135deg,#${l.base.toString(16).padStart(6, '0')} 50%,#${l.accent.toString(16).padStart(6, '0')} 50%)"></button>`).join('')}</div>
        <div style="font-size:12px;margin-top:6px">${s.liveries[this.selLiv % s.liveries.length].name}</div>
        <button class="btn pri full" style="margin-top:14px" data-go>${onPick ? '이 기체로 출격' : '선택'}</button>`;
      this.click(info, '[data-l]', (b) => { this.selLiv = +b.dataset.l!; this.host.previewAircraft(this.selAc, this.selLiv); render(); });
      this.click(info, '[data-go]', () => {
        progress.selectedAircraft = this.selAc; progress.liveries[this.selAc] = this.selLiv; save();
        if (onPick) onPick(this.selAc, this.selLiv); else this.main();
      });
    };
    this.click(el, '.acitem', (b) => { this.selAc = b.dataset.id!; this.selLiv = progress.liveries[this.selAc] ?? 0; this.host.previewAircraft(this.selAc, this.selLiv); render(); });
    this.click(el, '.back', () => (onPick ? this.missions() : this.main()));
    render();
    this.host.setMenuScene('hangar');
    this.host.previewAircraft(this.selAc, this.selLiv);
    this.show('hangar');
  }
  private specRows(s: AircraftSpec) {
    const kt = (v: number) => `${Math.round(v * MS_TO_KT)} kt`;
    const thrust = s.engine.type === 'jet' ? `${Math.round((s.engine.ab ?? s.engine.thrust) / 1000)} kN` : `${Math.round((s.engine.power ?? 0) / 1000)} kW`;
    return [['최대 이륙중량', `${Math.round((s.mass + s.fuel) / 100) / 10} t`], ['날개 면적', `${s.S} m²`], [s.engine.type === 'jet' ? '최대 추력' : '엔진 출력', thrust], ['실속 속도', kt(s.vStall)], ['접근 속도', kt(s.vRef)], ['G 한계', `+${s.gMax} / ${s.gMin}`], ['무장', s.gun ? `기관포 ${s.gun} · 미사일 ${s.missiles}` : '없음'], ['특수', s.hook ? '테일훅' : s.id === 'specter' ? '추력편향' : s.retract ? '접이식 기어' : '고정식 기어']]
      .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }

  /* ---------------- missions ---------------- */
  missions() {
    const tabs: [typeof this.missionTab, string][] = [['campaign', '캠페인'], ['course', '링 코스'], ['challenge', '챌린지']];
    const list = MISSIONS.filter((m) => m.cat === this.missionTab);
    const el = this.screen('missions', `
      <div class="vign"></div>
      <div class="hdr"><button class="back">${ICON.back}</button><div><h2>${this.missionTab === 'campaign' ? '캠페인' : '코스 & 챌린지'}</h2><div class="sub">별 ${Object.values(progress.stars).reduce((a, b) => a + b, 0)} / ${MISSIONS.length * 3}</div></div></div>
      <div class="body">
        <div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${k === this.missionTab ? 'on' : ''}" data-t="${k}">${n}</button>`).join('')}</div>
        <div class="grid">${list.map((m, i) => {
          const st = progress.stars[m.id] ?? 0;
          const best = progress.best[m.id];
          const ac = getSpec(m.aircraft);
          return `<button class="card" data-m="${m.id}" style="animation-delay:${i * 0.03}s"><div class="glow"></div>
            <div class="no">${m.cat === 'campaign' ? 'MISSION ' + String(i + 1).padStart(2, '0') : m.cat === 'course' ? 'COURSE' : 'CHALLENGE'}</div>
            <div class="ti">${m.title}</div><div class="sb">${m.sub}</div>
            <div class="meta"><span class="chip am">${ac.name}</span><span class="chip">${WEATHER_PRESETS[m.weather]?.name ?? '무작위'}</span><span class="chip">${String(Math.floor(m.hour)).padStart(2, '0')}:${String(Math.round((m.hour % 1) * 60)).padStart(2, '0')}</span>${best !== undefined ? `<span class="chip">최고 ${m.objectives.some((o) => o.type === 'land') && m.cat === 'challenge' ? best + '점' : fmtTime(best)}</span>` : ''}</div>
            <div class="stars">${[0, 1, 2].map((k) => `<span class="${k < st ? 'on' : ''}">★</span>`).join('')}</div></button>`;
        }).join('')}</div>
      </div>`);
    this.click(el, '.back', () => this.main());
    this.click(el, '[data-t]', (b) => { this.missionTab = b.dataset.t as typeof this.missionTab; this.missions(); });
    this.click(el, '[data-m]', (b) => this.briefing(MISSIONS.find((m) => m.id === b.dataset.m)!));
    this.host.setMenuScene('title');
    this.show('missions');
  }

  briefing(m: MissionDef) {
    this.pendingMission = m;
    const choice = m.choice ?? [m.aircraft];
    if (!choice.includes(this.selAc)) { this.selAc = m.aircraft; this.selLiv = progress.liveries[this.selAc] ?? 0; }
    const s = getSpec(this.selAc);
    const el = this.screen('briefing', `
      <div class="vign"></div>
      <div class="hdr"><button class="back">${ICON.back}</button><div><h2>브리핑</h2><div class="sub">${m.sub}</div></div></div>
      <div class="brief glass">
        <div class="k">${m.cat === 'campaign' ? 'CAMPAIGN' : m.cat.toUpperCase()} · ${WEATHER_PRESETS[m.weather]?.name ?? '무작위 날씨'}</div>
        <h3>${m.title}</h3>
        <p>${m.briefing}</p>
        ${m.objectives.map((o) => `<div class="obj"><i></i><span>${o.label}</span></div>`).join('')}
        ${m.tips ? `<ul>${m.tips.map((t) => `<li>${t}</li>`).join('')}</ul>` : ''}
        <div class="row" style="margin-top:12px;align-items:center">
          <button class="btn sec" data-ac style="flex:1;font-size:15px">✈ ${s.name}${choice.length > 1 ? ' ▾' : ''}</button>
          <button class="btn pri" data-go style="flex:1">출격</button>
        </div>
      </div>`);
    this.click(el, '.back', () => this.missions());
    this.click(el, '[data-ac]', () => { if (choice.length > 1) this.hangar((id, liv) => { this.selAc = id; this.selLiv = liv; this.briefing(m); }, choice); });
    this.click(el, '[data-go]', () => this.host.startMission(m, this.selAc, this.selLiv));
    this.host.previewAircraft(this.selAc, this.selLiv);
    this.host.setMenuScene('briefing');
    this.show('briefing');
  }

  /* ---------------- sandbox ---------------- */
  sandboxScreen() {
    const c = this.sandbox;
    const seg = (key: keyof SandboxCfg, opts: [string | number, string][]) => `<div class="seg" data-k="${key}">${opts.map(([v, n]) => `<button data-v="${v}" class="${String(c[key]) === String(v) ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    const tog = (key: keyof SandboxCfg) => `<button class="tog ${c[key] ? 'on' : ''}" data-tog="${key}"></button>`;
    const el = this.screen('sandbox', `
      <div class="vign"></div>
      <div class="hdr"><button class="back">${ICON.back}</button><div><h2>자유 비행</h2><div class="sub">샌드박스 — 원하는 대로 세계를 구성하세요</div></div></div>
      <div class="body"><div class="two">
        <div>
          <div class="panel glass"><h4>기체</h4>
            <div class="opt"><div class="l">기체<small>${getSpec(c.aircraft).ko}</small></div><button class="btn sec" data-pick style="padding:8px 14px;font-size:14px">${getSpec(c.aircraft).name} ▾</button></div>
          </div>
          <div class="panel glass"><h4>시작 위치</h4>
            ${seg('spawn', [['runway', '활주로'], ['air', '공중'], ['carrier', '항모 갑판'], ['catapult', '캐터펄트'], ['altiport', '산악 활주로'], ['city', '도시 상공'], ['canyon', '협곡'], ['mountain', '설산']])}
          </div>
          <div class="panel glass"><h4>세계</h4>
            <div class="opt"><div class="l">시각<small data-hv>${String(Math.floor(c.hour)).padStart(2, '0')}:${String(Math.round((c.hour % 1) * 60)).padStart(2, '0')}</small></div><input type="range" min="0" max="23.9" step="0.1" value="${c.hour}" data-r="hour"></div>
            <div class="opt"><div class="l">날씨</div>${seg('weather', Object.entries(WEATHER_PRESETS).map(([k, v]) => [k, v.name] as [string, string]))}</div>
            <div class="opt"><div class="l">풍속<small data-wv>${Math.round(c.windSpeed * MS_TO_KT)} kt</small></div><input type="range" min="0" max="25" step="0.5" value="${c.windSpeed}" data-r="windSpeed"></div>
            <div class="opt"><div class="l">풍향<small data-dv>${Math.round(c.windDir)}°</small></div><input type="range" min="0" max="359" step="1" value="${c.windDir}" data-r="windDir"></div>
            <div class="opt"><div class="l">난기류<small data-tv>${Math.round(c.turbulence * 100)}%</small></div><input type="range" min="0" max="1" step="0.05" value="${c.turbulence}" data-r="turbulence"></div>
          </div>
        </div>
        <div>
          <div class="panel glass"><h4>규칙</h4>
            <div class="opt"><div class="l">무적<small>충돌·피격에도 파손되지 않음</small></div>${tog('invincible')}</div>
            <div class="opt"><div class="l">무한 연료</div>${tog('infFuel')}</div>
            <div class="opt"><div class="l">무한 탄약</div>${tog('infAmmo')}</div>
          </div>
          <div class="panel glass"><h4>교전 &amp; 교통</h4>
            <div class="opt"><div class="l">적 전투기</div>${seg('enemies', [[0, '없음'], [1, '1'], [2, '2'], [4, '4'], [6, '6']])}</div>
            <div class="opt"><div class="l">지상 목표<small>북부 계곡 적 기지 생성</small></div>${tog('ground')}</div>
            <div class="opt"><div class="l">민항기 교통</div>${tog('traffic')}</div>
          </div>
          <button class="btn pri full" data-go>비행 시작</button>
        </div>
      </div></div>`);
    this.click(el, '.back', () => this.main());
    this.click(el, '[data-pick]', () => this.hangar((id, liv) => { c.aircraft = id; c.livery = liv; this.sandboxScreen(); }));
    el.querySelectorAll<HTMLElement>('.seg[data-k] button').forEach((b) => b.addEventListener('click', () => {
      const k = (b.parentElement as HTMLElement).dataset.k as keyof SandboxCfg;
      const v = b.dataset.v!;
      (c as unknown as Record<string, unknown>)[k] = typeof c[k] === 'number' ? +v : v;
      b.parentElement!.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      this.host.ui();
    }));
    this.click(el, '[data-tog]', (b) => { const k = b.dataset.tog as keyof SandboxCfg; (c as unknown as Record<string, unknown>)[k] = !c[k]; b.classList.toggle('on', !!c[k]); });
    el.querySelectorAll<HTMLInputElement>('input[data-r]').forEach((inp) => inp.addEventListener('input', () => {
      const k = inp.dataset.r as 'hour' | 'windSpeed' | 'windDir' | 'turbulence';
      c[k] = +inp.value;
      (el.querySelector('[data-hv]') as HTMLElement).textContent = `${String(Math.floor(c.hour)).padStart(2, '0')}:${String(Math.round((c.hour % 1) * 60)).padStart(2, '0')}`;
      (el.querySelector('[data-wv]') as HTMLElement).textContent = `${Math.round(c.windSpeed * MS_TO_KT)} kt`;
      (el.querySelector('[data-dv]') as HTMLElement).textContent = `${Math.round(c.windDir)}°`;
      (el.querySelector('[data-tv]') as HTMLElement).textContent = `${Math.round(c.turbulence * 100)}%`;
    }));
    this.click(el, '[data-go]', () => { c.livery = c.aircraft === this.selAc ? this.selLiv : c.livery; this.host.startSandbox(c); });
    this.host.setMenuScene('title');
    this.show('sandbox');
  }

  /* ---------------- settings ---------------- */
  settingsScreen(from: 'main' | 'pause') {
    const s = settings;
    const seg = <K extends keyof Settings>(key: K, opts: [Settings[K], string][]) => `<div class="seg" data-s="${String(key)}">${opts.map(([v, n]) => `<button data-v="${String(v)}" class="${s[key] === v ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    const tog = (key: keyof Settings) => `<button class="tog ${s[key] ? 'on' : ''}" data-tog="${String(key)}"></button>`;
    const rng = (key: keyof Settings, min: number, max: number, step: number) => `<input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}" data-r="${String(key)}">`;
    const el = this.screen('settings', `
      <div class="vign" style="background:rgba(3,6,10,.7)"></div>
      <div class="hdr"><button class="back">${ICON.back}</button><div><h2>설정</h2><div class="sub">변경 사항은 자동 저장됩니다</div></div></div>
      <div class="body"><div class="two">
        <div>
          <div class="panel glass"><h4>조작</h4>
            <div class="opt"><div class="l">조작 모드<small>분리형: 왼손 상하(피치) · 오른손 좌우(롤) 슬라이더</small></div>${seg('controlMode', [['split', '분리형 조종간'], ['stick', '가상 스틱'], ['tilt', '기울기']])}</div>
            <div class="opt"><div class="l">좌우 반전<small>왼손잡이 레이아웃</small></div>${tog('swapSides')}</div>
            <div class="opt"><div class="l">피치 반전</div>${tog('invertPitch')}</div>
            <div class="opt"><div class="l">감도</div>${rng('sensitivity', 0.5, 1.5, 0.05)}</div>
            <div class="opt"><div class="l">진동 피드백</div>${tog('vibration')}</div>
          </div>
          <div class="panel glass"><h4>비행 보조</h4>
            <div class="opt"><div class="l">보조 수준<small>초보: 자세 자동 복원·실속/지면 충돌 방지 · 표준: 플라이-바이-와이어 · 현실: 직접 조종</small></div>${seg('assist', [['beginner', '초보자'], ['standard', '표준'], ['realistic', '현실']])}</div>
            <div class="opt"><div class="l">자동 러더(협조 선회)</div>${tog('autoRudder')}</div>
            <div class="opt"><div class="l">지상 주행 보조<small>활주로 중심선 유지 · 이륙 회전 보조</small></div>${tog('groundAssist')}</div>
            <div class="opt"><div class="l">착륙 보조 가이드<small>글라이드 경로 박스 표시</small></div>${tog('landingAssist')}</div>
            <div class="opt"><div class="l">단위</div>${seg('units', [['aviation', '항공 (kt/ft)'], ['metric', '미터법']])}</div>
            <div class="opt"><div class="l">HUD 색상</div>${seg('hudColor', [['green', '그린'], ['cyan', '시안'], ['amber', '앰버']])}</div>
          </div>
        </div>
        <div>
          <div class="panel glass"><h4>그래픽</h4>
            <div class="opt"><div class="l">품질 프리셋<small>${IS_MOBILE ? '모바일 감지됨 — 중간 권장' : ''}</small></div>${seg('quality', [['low', '낮음'], ['medium', '중간'], ['high', '높음'], ['ultra', '울트라']])}</div>
            <div class="opt"><div class="l">해상도 배율</div>${rng('resScale', 0.5, 1.25, 0.05)}</div>
            <div class="opt"><div class="l">그림자</div>${tog('shadows')}</div>
            <div class="opt"><div class="l">블룸 / 글로우</div>${tog('bloom')}</div>
            <div class="opt"><div class="l">구름</div>${tog('clouds')}</div>
            <div class="opt"><div class="l">나무 밀도</div>${rng('trees', 0, 1, 0.1)}</div>
            <div class="opt"><div class="l">FPS 표시</div>${tog('showFps')}</div>
          </div>
          <div class="panel glass"><h4>사운드</h4>
            <div class="opt"><div class="l">마스터 볼륨</div>${rng('volume', 0, 1, 0.05)}</div>
            <div class="opt"><div class="l">엔진 볼륨</div>${rng('engineVol', 0, 1, 0.05)}</div>
            <div class="opt"><div class="l">음성 콜아웃<small>"Pull up", 고도 콜아웃 등</small></div>${tog('voice')}</div>
          </div>
          <div class="panel glass"><h4>데이터</h4><div class="opt"><div class="l">진행 상황 초기화</div><button class="btn sec" data-reset style="padding:6px 12px;font-size:13px">초기화</button></div></div>
        </div>
      </div></div>`);
    const gfxKeys = ['quality', 'resScale', 'shadows', 'bloom', 'trees', 'clouds'];
    const apply = (k: string) => { save(); this.host.applySettings(gfxKeys.includes(k)); };
    el.querySelectorAll<HTMLElement>('.seg[data-s] button').forEach((b) => b.addEventListener('click', () => {
      const k = (b.parentElement as HTMLElement).dataset.s as keyof Settings;
      (s as unknown as Record<string, unknown>)[k] = b.dataset.v;
      b.parentElement!.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      if (k === 'controlMode' && b.dataset.v === 'tilt') this.host.requestTilt();
      this.host.ui(); apply(k);
    }));
    this.click(el, '[data-tog]', (b) => { const k = b.dataset.tog as keyof Settings; (s as unknown as Record<string, unknown>)[k] = !s[k]; b.classList.toggle('on', !!s[k]); apply(k); });
    el.querySelectorAll<HTMLInputElement>('input[data-r]').forEach((inp) => inp.addEventListener('change', () => { (s as unknown as Record<string, unknown>)[inp.dataset.r!] = +inp.value; apply(inp.dataset.r!); }));
    this.click(el, '[data-reset]', () => { if (confirm('모든 진행 상황을 초기화할까요?')) { resetProgress(); this.toast('초기화 완료', 'var(--am)'); } });
    this.click(el, '.back', () => (from === 'main' ? this.main() : this.pause()));
    this.show('settings');
  }

  /* ---------------- in-flight ---------------- */
  pause() {
    const el = this.screen('pause', `<div class="modal"><div class="box glass">
      <h3>일시정지</h3><div class="col">
      <button class="btn pri" data-a="resume">계속하기</button>
      <button class="btn sec" data-a="restart">다시 시작</button>
      <button class="btn sec" data-a="photo">포토 모드</button>
      <button class="btn sec" data-a="settings">설정</button>
      <button class="btn sec" data-a="quit">메인 메뉴로</button>
      </div>
      <div style="margin-top:14px;font-size:11.5px;color:var(--tx2);line-height:1.7;text-align:left">
      <b style="color:var(--cy)">키보드</b> W/S 피치 · A/D 롤 · Q/E 러더 · Shift/Ctrl 스로틀 · N 애프터버너 · G 기어 · F/V 플랩 · B 브레이크 · Z 에어브레이크 · H 테일훅 · J 캐터펄트 · Space 기관포 · R 미사일 · X 플레어 · Tab 목표 · C 시점 · T 오토파일럿 · Y 자동착륙 · L 조명 · K 스모크 · U HUD · O 포토 · I 엔진 시동<br>
      <b style="color:var(--cy)">게임패드</b> 좌스틱 피치/롤 · 우스틱 러더 · RT/LT 스로틀 · A 기관포 · B 미사일 · LB 플레어 · RB 기어 · Y 시점</div>
      </div></div>`);
    this.click(el, '[data-a]', (b) => {
      const a = b.dataset.a;
      if (a === 'resume') this.host.resume();
      else if (a === 'restart') this.host.restart();
      else if (a === 'photo') this.host.photo();
      else if (a === 'settings') this.settingsScreen('pause');
      else if (a === 'quit') this.host.quit();
    });
    this.show('pause');
  }

  photoUI() {
    const el = this.screen('photo', `<div class="photo-ui"><button class="btn sec" data-a="shot">📷 저장</button><button class="btn pri" data-a="exit">돌아가기</button></div>
      <div class="tipbox glass" style="bottom:auto;top:calc(16px + var(--sat))">드래그: 회전 · 휠/핀치: 줌 · 시뮬레이션 정지됨</div>`);
    this.click(el, '[data-a]', (b) => (b.dataset.a === 'shot' ? this.host.screenshot() : this.host.exitPhoto()));
    this.show('photo');
  }

  results(r: ResultData) {
    const lr = r.landing;
    const gcol = lr ? ({ S: '#ffd166', A: '#4dff9a', B: '#5ce1ff', C: '#a78bfa', D: '#ffb547', F: '#ff4d5e' } as Record<string, string>)[lr.grade] : '';
    const el = this.screen('results', `<div class="modal"><div class="res glass">
      <div class="big ${r.success ? 'ok' : 'no'}">${r.success ? 'MISSION COMPLETE' : 'MISSION FAILED'}</div>
      <div style="color:var(--tx2);margin-top:6px">${r.title}${r.reason ? ' — ' + r.reason : ''}</div>
      ${r.success && r.missionId ? `<div class="st">${[0, 1, 2].map((k) => `<span class="${k < r.stars ? 'on' : ''}" style="animation-delay:${0.3 + k * 0.25}s">★</span>`).join('')}</div>` : ''}
      ${lr ? `<div style="display:flex;align-items:center;gap:16px;margin-top:8px"><div class="grade" style="color:${gcol}">${lr.grade}</div><div><div style="font-size:22px;font-weight:700">${lr.title}</div><div style="color:var(--tx2)">착륙 점수 <b style="color:var(--tx);font-family:var(--f1);font-size:22px">${lr.score}</b> / 100</div></div></div>
        <table>${lr.items.map((it) => `<tr><td>${it.label}</td><td style="color:var(--tx2);text-align:right">${it.value}</td><td>${it.pts}/${it.max}</td></tr>`).join('')}${lr.bounced ? '<tr><td>바운스 감점</td><td></td><td style="color:var(--rd)">-15</td></tr>' : ''}</table>` : ''}
      <table>${[['비행 시간', fmtTime(r.time)], ...r.rows].map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
      <div class="row" style="justify-content:center">
        <button class="btn sec" data-a="replay" ${r.canReplay ? '' : 'disabled style="opacity:.4"'}>▶ 리플레이</button>
        <button class="btn sec" data-a="restart">다시 하기</button>
        <button class="btn pri" data-a="quit">계속</button>
      </div></div></div>`);
    this.click(el, '[data-a]', (b) => {
      const a = b.dataset.a;
      if (a === 'replay' && r.canReplay) this.host.replay();
      else if (a === 'restart') this.host.restart();
      else if (a === 'quit') this.host.quit();
    });
    this.show('results');
  }

  /* ---------------- overlays ---------------- */
  toast(text: string, color = 'var(--cy)', ms = 1800) {
    this.toastEl?.remove();
    const el = h(`<div class="toast glass" style="color:${color}">${text}</div>`);
    this.root.appendChild(el);
    this.toastEl = el;
    setTimeout(() => { if (this.toastEl === el) { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); } }, ms);
  }
  tip(text: string | null) {
    if (!text) { this.tipEl?.remove(); this.tipEl = null; return; }
    if (this.tipEl && this.tipEl.textContent === text) return;
    this.tipEl?.remove();
    this.tipEl = h(`<div class="tipbox glass">💡 ${text}</div>`);
    this.root.appendChild(this.tipEl);
  }
  toggleAP() {
    if (this.apEl) { this.apEl.remove(); this.apEl = null; return; }
    this.apEl = h(`<div class="ap glass"><h4>AUTOPILOT</h4>
      <div class="r"><button class="md" data-c="ap">A/P</button><button class="md" data-c="app">APP</button><button class="md" data-c="off">OFF</button></div>
      <div class="r"><button class="md" data-c="alt">ALT</button><button class="pm" data-c="alt-">−</button><span class="v" data-v="alt"></span><button class="pm" data-c="alt+">+</button></div>
      <div class="r"><button class="md" data-c="hdg">HDG</button><button class="pm" data-c="hdg-">−</button><span class="v" data-v="hdg"></span><button class="pm" data-c="hdg+">+</button></div>
      <div class="r"><button class="md" data-c="spd">SPD</button><button class="pm" data-c="spd-">−</button><span class="v" data-v="spd"></span><button class="pm" data-c="spd+">+</button></div>
      <div style="font-size:11px;color:var(--tx2)">APP: 가장 가까운 활주로/항모로 ILS 자동 접근·착륙</div></div>`);
    this.root.appendChild(this.apEl);
    this.apEl.querySelectorAll<HTMLElement>('[data-c]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); const c = b.dataset.c!; this.host.apCmd(c.replace(/[+-]$/, ''), c.endsWith('+') ? 1 : c.endsWith('-') ? -1 : 0); this.host.ui(); }));
  }
  updateAP() {
    if (!this.apEl) return;
    const ap = this.host.ap();
    if (!ap) return;
    const aviation = settings.units === 'aviation';
    (this.apEl.querySelector('[data-v=alt]') as HTMLElement).textContent = aviation ? `${Math.round(ap.altT * 3.28084)} ft` : `${Math.round(ap.altT)} m`;
    (this.apEl.querySelector('[data-v=hdg]') as HTMLElement).textContent = `${String(Math.round(ap.hdgT)).padStart(3, '0')}°`;
    (this.apEl.querySelector('[data-v=spd]') as HTMLElement).textContent = aviation ? `${Math.round(ap.spdT * MS_TO_KT)} kt` : `${Math.round(ap.spdT * 3.6)} km/h`;
    const on = (k: string, v: boolean) => this.apEl!.querySelector(`[data-c=${k}]`)!.classList.toggle('on', v);
    on('ap', ap.on && !ap.app); on('app', ap.app); on('alt', ap.on && ap.alt); on('hdg', ap.on && ap.hdg); on('spd', ap.on && ap.spd);
  }
  closeAP() { this.apEl?.remove(); this.apEl = null; }
}
