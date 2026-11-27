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

export const ICON: Record<string, string> = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V3m0 1h12l-2 4 2 4H5"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  plane: '<svg viewBox="0 0 24 24"><path d="M2 13l8-2 4-8h2l-2 8 6 1 2-2h1l-1 4 1 4h-1l-2-2-6 1 2 8h-2l-4-8-8-2z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.9L22 9.3l-5.5 4.8L18.2 21 12 17.3 5.8 21l1.7-6.9L2 9.3l7.1-.4z"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg>',
};
const CODENAME: Record<string, string> = {
  m1: 'First Light', m2: 'Final Approach', m3: 'Crosswind', m4: 'Airshow', m5: 'Red Canyon', m6: 'Intercept', m7: 'Spearhead', m8: 'Trap', m9: 'Dead Stick', m10: 'Night ILS', m11: 'Skyshield', m12: 'Hammer', m13: 'Eagle Peak',
  c1: 'Coastline', c2: 'Canyon TT', c3: 'Gangnam Nights', c4: 'Alpine Circuit', x1: 'Touchdown', x2: 'Cat Shot', x3: 'Endless',
};
const RANKS: [number, string][] = [[0, 'Rookie'], [6, 'Wingman'], [16, 'Flight Lead'], [31, 'Ace'], [46, 'Legend']];

const h = (html: string) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const hh = (hr: number) => `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.round((hr % 1) * 60)).padStart(2, '0')}`;
const starsHtml = (n: number) => `<span class="marks" title="${n}/3">${[0, 1, 2].map((k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}</span>`;
const sep = '<i>/</i>';
const totalStars = () => Object.values(progress.stars).reduce((a, b) => a + b, 0);
const rank = () => { const s = totalStars(); let r = RANKS[0][1]; for (const [k, n] of RANKS) if (s >= k) r = n; return r; };

type Tab = 'home' | 'campaign' | 'free' | 'hangar' | 'settings';

export class Menus {
  readonly root: HTMLDivElement;
  private screens = new Map<string, HTMLElement>();
  current = '';
  selAc = progress.selectedAircraft;
  selLiv = 0;
  private missionTab: 'campaign' | 'course' | 'challenge' = 'campaign';
  private settingsTab = 'controls';
  sandbox: SandboxCfg = { aircraft: 'strix', livery: 0, spawn: 'runway', hour: 10, weather: 'scattered', windSpeed: 5, windDir: 350, turbulence: 0.2, invincible: false, infFuel: true, infAmmo: false, enemies: 0, ground: false, traffic: true };
  private bannerEl: HTMLElement | null = null;
  private tipEl: HTMLElement | null = null;
  private apEl: HTMLElement | null = null;
  private feedEl: HTMLElement;
  private wipeEl: HTMLElement;
  fpsEl: HTMLElement;

  constructor(private host: UIHost) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.root = document.createElement('div'); this.root.id = 'ui'; document.body.appendChild(this.root);
    this.selLiv = progress.liveries[this.selAc] ?? 0;
    this.fpsEl = h('<div class="fps" style="display:none"></div>'); this.root.appendChild(this.fpsEl);
    this.feedEl = h('<div class="feed"></div>'); this.root.appendChild(this.feedEl);
    this.wipeEl = h('<div class="wipe"><i></i><i></i></div>'); document.body.appendChild(this.wipeEl);
    addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' && e.code !== 'Backspace') return;
      const back = this.screens.get(this.current)?.querySelector<HTMLElement>('[data-back]');
      if (back && this.current !== 'pause') { e.preventDefault(); back.click(); }
    });
  }

  /* ================= infrastructure ================= */
  private screen(id: string, html: string): HTMLElement {
    this.screens.get(id)?.remove();
    const el = h(`<div class="scr" data-id="${id}">${html}</div>`);
    this.root.insertBefore(el, this.feedEl);
    this.screens.set(id, el);
    this.bindRanges(el);
    return el;
  }
  show(id: string) {
    for (const [k, el] of this.screens) el.classList.toggle('show', k === id);
    this.current = id;
  }
  hideAll() { this.show(''); }
  /** Diagonal slab wipe between full screens. */
  private go(fn: () => void) {
    const w = this.wipeEl;
    w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
    setTimeout(fn, 240);
    setTimeout(() => w.classList.remove('go'), 720);
  }
  /** White transition burst — a different motion per destination, then swap screens under it. */
  private fx(kind: string, fn: () => void) {
    const inner = kind === 'zig'
      ? `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="-5,30 15,55 35,25 55,60 75,30 105,55"/><polyline points="-5,60 20,40 40,70 60,40 80,72 105,45"/><polyline points="-5,80 18,62 42,88 66,60 88,85 105,70"/></svg>`
      : kind === 'shutter' ? '<i style="left:0"></i><i style="left:20%"></i><i style="left:40%"></i><i style="left:60%"></i><i style="left:80%"></i>'
      : kind === 'flash' ? '' : '<i></i><i></i><i></i>';
    const o = h(`<div class="fxo ${kind}">${inner}</div>`);
    document.body.appendChild(o);
    if (kind === 'sweep') o.querySelectorAll('i').forEach((i) => ((i as HTMLElement).style.left = '0'));
    setTimeout(fn, kind === 'shutter' ? 250 : 220);
    setTimeout(() => o.remove(), 700);
  }
  private on(el: HTMLElement, sel: string, fn: (e: HTMLElement) => void) {
    el.querySelectorAll<HTMLElement>(sel).forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); this.host.ui(); fn(b); }));
  }
  private bindRanges(el: HTMLElement) {
    el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((r) => {
      const upd = () => r.style.setProperty('--v', `${((+r.value - +r.min) / (+r.max - +r.min)) * 100}%`);
      upd(); r.addEventListener('input', upd);
    });
  }
  private who() {
    return `<div class="who"><span class="st2">★ <b>${totalStars()}</b>/${MISSIONS.length * 3}</span><span class="hide-p">Pilot · <b>${rank()}</b></span></div>`;
  }
  private top(title: string, sub: string, back = true) {
    return `<div class="top">
      ${back ? `<button class="back" data-back>${ICON.back}BACK</button><i class="divider"></i>` : ''}
      <div class="ttl"><div class="d">${title}</div><small>${sub}</small></div>
      <div class="sp"></div>${this.who()}
    </div>`;
  }
  private tabbar(_active: Tab) { return ''; }
  private bindTabbar(_el: HTMLElement) { /* navigation lives on the home screen + BACK */ }
  private tabsHtml(items: [string, string, string][], active: string) {
    return `<div class="tabs">${items.map(([k, en]) => `<button class="tab ${k === active ? 'on' : ''}" data-tab="${k}">${en}</button>`).join('')}<i class="ul"></i></div>`;
  }
  private placeUnderline(el: HTMLElement) {
    const tabs = el.querySelector<HTMLElement>('.tabs');
    const on = tabs?.querySelector<HTMLElement>('.tab.on');
    const ul = tabs?.querySelector<HTMLElement>('.ul');
    if (!tabs || !on || !ul) return;
    requestAnimationFrame(() => { ul.style.width = `${on.offsetWidth}px`; ul.style.transform = `translateX(${on.offsetLeft}px)`; });
  }
  private countUp(el: HTMLElement) {
    el.querySelectorAll<HTMLElement>('[data-count]').forEach((n) => {
      const target = +n.dataset.count!, dec = +(n.dataset.dec ?? 0), suf = n.dataset.suf ?? '';
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 900);
        const e = 1 - Math.pow(2, -10 * k);
        n.textContent = (target * e).toFixed(dec) + suf;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* ================= loading ================= */
  loading(p: number, tip: string) {
    let el = this.screens.get('loading');
    if (!el) {
      el = this.screen('loading', `<div class="boot"><div class="scanl"></div>
        <div class="c"><div class="d lg">Sky Ace</div><div class="sub">HORIZON</div>
        <div class="prog"><i></i></div>
        <div class="row2"><span class="tp"></span><span class="pc m">0%</span></div></div>
        <div class="legal">Map data © OpenStreetMap contributors (ODbL) · Fonts: Bebas Neue, Chakra Petch (OFL)</div></div>`);
      this.show('loading');
    }
    (el.querySelector('.prog i') as HTMLElement).style.transform = `scaleX(${p})`;
    (el.querySelector('.pc') as HTMLElement).textContent = `${Math.round(p * 100)}%`;
    (el.querySelector('.tp') as HTMLElement).textContent = tip;
  }

  /* ================= home ================= */
  private nextMission(): MissionDef {
    const camp = MISSIONS.filter((m) => m.cat === 'campaign');
    return camp.find((m) => !(progress.stars[m.id] > 0)) ?? camp.find((m) => (progress.stars[m.id] ?? 0) < 3) ?? camp[0];
  }
  main() {
    const spec = getSpec(this.selAc);
    const nm = this.nextMission();
    const idx = MISSIONS.filter((m) => m.cat === 'campaign').indexOf(nm) + 1;
    const items: [string, string, string][] = [['campaign', 'Campaign', '캠페인'], ['free', 'Free Flight', '자유 비행'], ['course', 'Challenges', '챌린지'], ['hangar', 'Hangar', '격납고']];
    const el = this.screen('main', `
      <div class="shade"></div>
      <div class="top"><div class="logo"><b>SKY ACE</b><span>HORIZON</span></div><div class="sp"></div>${this.who()}<button class="gear" data-a="settings" aria-label="설정">${ICON.gear}</button></div>
      <div class="home-stats">
        <div class="hs"><div class="m" data-count="${progress.flights}">0</div><span>FLIGHTS</span></div>
        <div class="hs"><div class="m" data-count="${progress.landings}">0</div><span>LANDINGS</span></div>
        <div class="hs"><div class="m" data-count="${progress.bestLanding}">0</div><span>BEST LANDING</span></div>
        <div class="hs"><div class="m" data-count="${progress.kills}">0</div><span>KILLS</span></div>
      </div>
      <div class="home-ac"><div class="eyebrow">Aircraft</div><div class="d">${spec.name}</div></div>
      <div class="home">
        <div class="cont">
          <div class="eyebrow"><b>Continue</b> · Mission ${String(idx).padStart(2, '0')}</div>
          <div class="hero"><span class="ghost">${String(idx).padStart(2, '0')}</span><i class="slash"></i><i class="slash s2"></i><i class="slash s3"></i><div class="d">${CODENAME[nm.id]}</div><i class="speedrule"></i></div>
          <div class="kt">${nm.title} — ${nm.sub}</div>
          <div class="meta">${getSpec(nm.aircraft).name}${sep}${WEATHER_PRESETS[nm.weather]?.name ?? 'Random'}${sep}${hh(nm.hour)}</div>
          <div class="launch">
            <svg class="streaks" viewBox="0 0 600 120" preserveAspectRatio="none">${Array.from({ length: 9 }, (_, i) => `<line x1="${(i * 67) % 600}" y1="${12 + i * 12}" x2="${(i * 67) % 600 + 120 + (i % 3) * 60}" y2="${12 + i * 12}" style="animation-delay:${-i * 0.27}s"/>`).join('')}</svg>
            <div class="chev">${'<i></i>'.repeat(6)}</div>
            <button class="play" data-cont><span class="tri"><svg viewBox="0 0 24 24"><path d="M6 3l15 9-15 9z"/></svg></span><span class="lbl">PLAY</span><span class="sub">${getSpec(this.selAc).name}</span></button>
          </div>
          <div class="quick">
            <button data-q="assist"><span>ASSIST</span><b>${({ beginner: '초보자', standard: '표준', realistic: '현실' } as Record<string, string>)[settings.assist]}</b></button>
            <button data-q="control"><span>CONTROL</span><b>${({ split: '분리 조종', stick: '통합 스틱', tilt: '기울기' } as Record<string, string>)[settings.controlMode]}</b></button>
            <button data-q="quality"><span>GRAPHICS</span><b>${settings.quality.toUpperCase()}</b></button>
            <button data-q="sound"><span>SOUND</span><b>${settings.volume > 0 ? 'ON' : 'OFF'}</b></button>
          </div>
        </div>
        <nav class="nav">${items.map(([k, en, ko], i) => `<button class="nv" data-a="${k}" style="animation-delay:${0.12 + i * 0.05}s"><span class="kr">${ko}</span><span class="d">${en}</span><span class="ix">0${i + 1}</span></button>`).join('')}</nav>
      </div>`);
    this.on(el, '[data-a]', (b) => {
      const a = b.dataset.a!;
      const kind = ({ campaign: 'sweep', free: 'burst', course: 'zig', hangar: 'shutter', settings: 'iris' } as Record<string, string>)[a] ?? 'flash';
      this.fx(kind, () => {
        if (a === 'campaign') { this.missionTab = 'campaign'; this.missions(); }
        else if (a === 'course') { this.missionTab = 'course'; this.missions(); }
        else if (a === 'free') this.sandboxScreen();
        else if (a === 'hangar') this.hangar();
        else this.settingsScreen('main');
      });
    });
    this.on(el, '[data-cont]', (b) => { b.classList.add('fire'); el.querySelector('.launch')?.classList.add('fire'); setTimeout(() => this.fx('flash', () => this.briefing(nm)), 260); });
    this.on(el, '[data-q]', (b) => {
      const q = b.dataset.q!;
      const cyc = <T,>(arr: T[], v: T) => arr[(arr.indexOf(v) + 1) % arr.length];
      if (q === 'assist') settings.assist = cyc(['beginner', 'standard', 'realistic'] as const, settings.assist) as typeof settings.assist;
      if (q === 'control') settings.controlMode = cyc(['split', 'stick', 'tilt'] as const, settings.controlMode) as typeof settings.controlMode;
      if (q === 'quality') settings.quality = cyc(['low', 'medium', 'high', 'ultra'] as const, settings.quality) as typeof settings.quality;
      if (q === 'sound') settings.volume = settings.volume > 0 ? 0 : 0.8;
      save();
      this.host.applySettings(q === 'quality');
      if (q === 'control' && settings.controlMode === 'tilt') this.host.requestTilt();
      const lab: Record<string, string> = { assist: ({ beginner: '초보자', standard: '표준', realistic: '현실' } as Record<string, string>)[settings.assist], control: ({ split: '분리 조종', stick: '통합 스틱', tilt: '기울기' } as Record<string, string>)[settings.controlMode], quality: settings.quality.toUpperCase(), sound: settings.volume > 0 ? 'ON' : 'OFF' };
      const bEl = b.querySelector('b')!; bEl.textContent = lab[q]; bEl.classList.remove('flip'); void bEl.offsetWidth; bEl.classList.add('flip');
    });
    this.bindTabbar(el);
    this.countUp(el);
    this.host.setMenuScene('title');
    this.show('main');
  }

  /* ================= missions ================= */
  missions() {
    const list = MISSIONS.filter((m) => m.cat === this.missionTab);
    const el = this.screen('missions', `
      <div class="shade full"></div>
      ${this.top(this.missionTab === 'campaign' ? 'Campaign' : 'Challenges', this.missionTab === 'campaign' ? '이착륙 훈련부터 실전까지' : '코스 & 챌린지')}
      <div class="page narrow" style="max-width:1100px">
        ${this.tabsHtml([['campaign', 'Campaign', '캠페인'], ['course', 'Courses', '링 코스'], ['challenge', 'Challenges', '챌린지']], this.missionTab)}
        <div class="mlist st">${list.map((m, i) => {
          const st = progress.stars[m.id] ?? 0;
          const best = progress.best[m.id];
          const isScore = m.cat === 'challenge' && m.objectives.some((o) => o.type === 'land');
          return `<button class="mrow" data-m="${m.id}">
            <span class="n">${String(i + 1).padStart(2, '0')}</span>
            <span><span class="d">${CODENAME[m.id] ?? m.title}</span><span class="kt" style="display:block">${m.title}</span></span>
            <span class="c3"><span class="sb" style="display:block">${m.sub}</span><span class="meta">${getSpec(m.aircraft).name}${sep}${WEATHER_PRESETS[m.weather]?.name ?? '무작위'}${sep}${hh(m.hour)}${best !== undefined ? `${sep}Best ${isScore ? best : fmtTime(best)}` : ''}</span></span>
            <span class="r">${starsHtml(st)}<svg class="go" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></span></button>`;
        }).join('')}</div>
      </div>
      ${this.tabbar(this.missionTab === 'campaign' ? 'campaign' : 'campaign')}`);
    this.on(el, '[data-back]', () => this.go(() => this.main()));
    this.on(el, '[data-tab]', (b) => { this.missionTab = b.dataset.tab as typeof this.missionTab; this.missions(); });
    this.on(el, '[data-m]', (b) => this.go(() => this.briefing(MISSIONS.find((m) => m.id === b.dataset.m)!)));
    this.bindTabbar(el);
    this.host.setMenuScene('title');
    this.show('missions');
    this.placeUnderline(el);
  }

  briefing(m: MissionDef) {
    const choice = m.choice ?? [m.aircraft];
    if (!choice.includes(this.selAc)) { this.selAc = m.aircraft; this.selLiv = progress.liveries[this.selAc] ?? 0; }
    const w = WEATHER_PRESETS[m.weather];
    const idx = MISSIONS.filter((x) => x.cat === m.cat).indexOf(m) + 1;
    const wind = m.wind ? `${String(Math.round(m.wind[0])).padStart(3, '0')}°/${Math.round(m.wind[1] * MS_TO_KT)}KT` : w ? `${Math.round(w.w.windSpeed * MS_TO_KT)}KT` : 'VAR';
    const el = this.screen('briefing', `
      <div class="shade r"></div>
      ${this.top('Briefing', m.sub)}
      <div class="brief">
        <div class="sc st">
          <div class="eyebrow"><b>${m.cat === 'campaign' ? 'Mission' : m.cat === 'course' ? 'Course' : 'Challenge'} ${String(idx).padStart(2, '0')}</b>${progress.stars[m.id] ? ` · ${starsHtml(progress.stars[m.id])}` : ''}</div>
          <div class="d big">${CODENAME[m.id] ?? m.title}</div>
          <div class="kt">${m.title}</div>
          <div class="facts"><div><span>TIME</span><b>${hh(m.hour)}</b></div><div><span>WEATHER</span><b>${w?.name ?? 'RANDOM'}</b></div><div><span>WIND</span><b>${wind}</b></div></div>
          <p>${m.briefing}</p>
          <div class="hdr2">Objectives</div>
          <div>${m.objectives.map((o, i) => `<div class="obj"><span class="n">0${i + 1}</span><span>${o.label}</span></div>`).join('')}</div>
          ${m.tips ? `<div class="hdr2">Notes</div><ul class="tips">${m.tips.map((t) => `<li>${t}</li>`).join('')}</ul>` : ''}
        </div>
        <div class="ft">
          ${choice.length > 1 ? `<div class="choose">${choice.map((id) => `<button data-ac="${id}" class="${id === this.selAc ? 'on' : ''}">${getSpec(id).name}</button>`).join('')}</div>` : `<div class="meta">${getSpec(this.selAc).name}</div>`}
          <button class="cta full" data-go>Launch ${ICON.play}</button>
        </div>
      </div>
      <div class="drag-hint hide-p">DRAG TO ROTATE</div>`);
    this.on(el, '[data-back]', () => this.go(() => this.missions()));
    this.on(el, '[data-ac]', (b) => { this.selAc = b.dataset.ac!; this.selLiv = progress.liveries[this.selAc] ?? 0; el.querySelectorAll('[data-ac]').forEach((x) => x.classList.toggle('on', x === b)); this.host.previewAircraft(this.selAc, this.selLiv); });
    this.on(el, '[data-go]', () => this.go(() => this.host.startMission(m, this.selAc, this.selLiv)));
    this.host.setMenuScene('briefing');
    this.host.previewAircraft(this.selAc, this.selLiv);
    this.show('briefing');
  }

  /* ================= hangar ================= */
  hangar(onPick?: (id: string, liv: number) => void, allowed?: string[]) {
    const list = allowed ? AIRCRAFT.filter((a) => allowed.includes(a.id)) : AIRCRAFT;
    if (!list.find((a) => a.id === this.selAc)) this.selAc = list[0].id;
    const el = this.screen('hangar', `
      <div class="shade lr"></div>
      ${this.top('Hangar', onPick ? '기체 선택' : '6종 기체 · 도색')}
      <div class="hg">
        <div class="hg-list">${list.map((a, i) => `<button class="hgi" data-id="${a.id}" style="animation-delay:${i * 0.04}s"><div class="r">${a.role}</div><div class="d">${a.name}</div></button>`).join('')}</div>
        <div class="hg-info"></div>
        <div class="drag-hint">DRAG TO ROTATE</div>
      </div>
      ${onPick ? '' : this.tabbar('hangar')}`);
    const info = el.querySelector('.hg-info') as HTMLElement;
    const render = () => {
      const s = getSpec(this.selAc);
      el.querySelectorAll('.hgi').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.id === s.id));
      const stat = (k: string, v: number, hot = false) => `<div class="statl"><span>${k}</span><span class="t"><i class="${hot ? 'hi' : ''}" style="transform:scaleX(${v / 100})"></i></span><b>${v}</b></div>`;
      info.innerHTML = `<div class="in"><div class="eyebrow"><b>${s.role}</b></div><div class="d big">${s.name}</div>
        <p>${s.desc}</p>
        ${stat('SPEED', s.stats.speed)}${stat('AGILITY', s.stats.agility)}${stat('ARMOR', s.stats.armor)}${stat('FIREPOWER', s.stats.firepower, true)}${stat('HANDLING', s.stats.ease)}
        <div class="dl">${this.specRows(s)}</div>
        <div class="eyebrow">Livery · ${s.liveries[this.selLiv % s.liveries.length].name}</div>
        <div class="livs">${s.liveries.map((l, i) => `<button class="liv ${i === this.selLiv ? 'on' : ''}" data-l="${i}" title="${l.name}" style="background:linear-gradient(135deg,#${l.base.toString(16).padStart(6, '0')} 50%,#${l.accent.toString(16).padStart(6, '0')} 50%)"></button>`).join('')}</div></div>
        <div class="ft"><button class="cta full" data-go>${onPick ? 'Select' : 'Confirm'} ${ICON.play}</button></div>`;
      this.on(info, '[data-l]', (b) => { this.selLiv = +b.dataset.l!; this.host.previewAircraft(this.selAc, this.selLiv); render(); });
      this.on(info, '[data-go]', () => {
        progress.selectedAircraft = this.selAc; progress.liveries[this.selAc] = this.selLiv; save();
        this.go(() => (onPick ? onPick(this.selAc, this.selLiv) : this.main()));
      });
    };
    this.on(el, '.hgi', (b) => { this.selAc = b.dataset.id!; this.selLiv = progress.liveries[this.selAc] ?? 0; this.host.previewAircraft(this.selAc, this.selLiv); render(); });
    this.on(el, '[data-back]', () => this.go(() => (onPick ? this.sandboxScreen() : this.main())));
    this.bindTabbar(el);
    render();
    this.host.setMenuScene('hangar');
    this.host.previewAircraft(this.selAc, this.selLiv);
    this.show('hangar');
  }
  private specRows(s: AircraftSpec) {
    const kt = (v: number) => `${Math.round(v * MS_TO_KT)} KT`;
    const thrust = s.engine.type === 'jet' ? `${Math.round((s.engine.ab ?? s.engine.thrust) / 1000)} kN` : `${Math.round((s.engine.power ?? 0) / 1000)} kW`;
    return [['MTOW', `${Math.round((s.mass + s.fuel) / 100) / 10} t`], ['WING', `${s.S} m²`], [s.engine.type === 'jet' ? 'THRUST' : 'POWER', thrust], ['STALL', kt(s.vStall)], ['VREF', kt(s.vRef)], ['G LIMIT', `+${s.gMax}/${s.gMin}`], ['ARMS', s.gun ? `GUN·${s.missiles} MSL` : '—'], ['SPECIAL', s.hook ? 'TAILHOOK' : s.id === 'specter' ? 'TVC' : s.retract ? 'RETRACT' : 'FIXED GEAR']]
      .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }

  /* ================= free flight ================= */
  sandboxScreen() {
    const c = this.sandbox;
    const seg = (key: keyof SandboxCfg, opts: [string | number, string][]) => `<div class="opts" data-k="${key}">${opts.map(([v, n]) => `<button data-v="${v}" class="${String(c[key]) === String(v) ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    const tog = (key: keyof SandboxCfg) => `<button class="tog ${c[key] ? 'on' : ''}" data-tog="${key}" aria-label="${key}"></button>`;
    const el = this.screen('sandbox', `
      <div class="shade full"></div>
      ${this.top('Free Flight', '샌드박스 — 세계를 직접 구성하세요')}
      <div class="page narrow" style="max-width:1000px"><div class="cols st">
        <div>
          <div class="sect"><h3>Aircraft</h3>
            <div class="row"><div class="l">${getSpec(c.aircraft).name}<small>${getSpec(c.aircraft).ko} · ${getSpec(c.aircraft).role}</small></div><button class="link" data-pick>Change ${ICON.play}</button></div>
            <div class="row stack"><div class="l">출발 위치</div>${seg('spawn', [['runway', '활주로'], ['air', '공중'], ['carrier', '항모 갑판'], ['catapult', '캐터펄트'], ['altiport', '산악 활주로'], ['far', '원거리 공항'], ['city', '서울 상공'], ['canyon', '협곡'], ['mountain', '설산']])}</div>
          </div>
          <div class="sect"><h3>World</h3>
            <div class="row"><div class="l">시각<small data-hv>${hh(c.hour)}</small></div><input type="range" min="0" max="23.9" step="0.1" value="${c.hour}" data-r="hour"></div>
            <div class="row stack"><div class="l">날씨</div>${seg('weather', Object.entries(WEATHER_PRESETS).map(([k, v]) => [k, v.name] as [string, string]))}</div>
            <div class="row"><div class="l">풍속<small data-wv>${Math.round(c.windSpeed * MS_TO_KT)} KT</small></div><input type="range" min="0" max="25" step="0.5" value="${c.windSpeed}" data-r="windSpeed"></div>
            <div class="row"><div class="l">풍향<small data-dv>${Math.round(c.windDir)}°</small></div><input type="range" min="0" max="359" step="1" value="${c.windDir}" data-r="windDir"></div>
            <div class="row"><div class="l">난기류<small data-tv>${Math.round(c.turbulence * 100)}%</small></div><input type="range" min="0" max="1" step="0.05" value="${c.turbulence}" data-r="turbulence"></div>
          </div>
        </div>
        <div>
          <div class="sect"><h3>Rules</h3>
            <div class="row"><div class="l">무적<small>충돌·피격에도 파손되지 않음</small></div>${tog('invincible')}</div>
            <div class="row"><div class="l">무한 연료</div>${tog('infFuel')}</div>
            <div class="row"><div class="l">무한 탄약</div>${tog('infAmmo')}</div>
          </div>
          <div class="sect"><h3>Traffic &amp; Threats</h3>
            <div class="row"><div class="l">적 전투기</div>${seg('enemies', [[0, '없음'], [1, '1'], [2, '2'], [4, '4'], [6, '6']])}</div>
            <div class="row"><div class="l">지상 목표<small>북부 계곡 적 기지</small></div>${tog('ground')}</div>
            <div class="row"><div class="l">민항기 교통</div>${tog('traffic')}</div>
          </div>
          <button class="cta full" data-go>Take Off ${ICON.play}</button>
        </div>
      </div></div>`);
    this.on(el, '[data-back]', () => this.go(() => this.main()));
    this.on(el, '[data-pick]', () => this.go(() => this.hangar((id, liv) => { c.aircraft = id; c.livery = liv; this.sandboxScreen(); })));
    el.querySelectorAll<HTMLElement>('.opts[data-k] button').forEach((b) => b.addEventListener('click', () => {
      const k = (b.parentElement as HTMLElement).dataset.k as keyof SandboxCfg;
      (c as unknown as Record<string, unknown>)[k] = typeof c[k] === 'number' ? +b.dataset.v! : b.dataset.v;
      b.parentElement!.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      this.host.ui();
    }));
    this.on(el, '[data-tog]', (b) => { const k = b.dataset.tog as keyof SandboxCfg; (c as unknown as Record<string, unknown>)[k] = !c[k]; b.classList.toggle('on', !!c[k]); });
    el.querySelectorAll<HTMLInputElement>('input[data-r]').forEach((inp) => inp.addEventListener('input', () => {
      const k = inp.dataset.r as 'hour' | 'windSpeed' | 'windDir' | 'turbulence';
      c[k] = +inp.value;
      (el.querySelector('[data-hv]') as HTMLElement).textContent = hh(c.hour);
      (el.querySelector('[data-wv]') as HTMLElement).textContent = `${Math.round(c.windSpeed * MS_TO_KT)} KT`;
      (el.querySelector('[data-dv]') as HTMLElement).textContent = `${Math.round(c.windDir)}°`;
      (el.querySelector('[data-tv]') as HTMLElement).textContent = `${Math.round(c.turbulence * 100)}%`;
    }));
    this.on(el, '[data-go]', () => { if (c.aircraft === this.selAc) c.livery = this.selLiv; this.go(() => this.host.startSandbox(c)); });
    this.bindTabbar(el);
    this.host.setMenuScene('title');
    this.show('sandbox');
  }

  /* ================= settings ================= */
  settingsScreen(from: 'main' | 'pause') {
    const s = settings;
    const seg = <K extends keyof Settings>(key: K, opts: [Settings[K], string][]) => `<div class="opts" data-s="${String(key)}">${opts.map(([v, n]) => `<button data-v="${String(v)}" class="${s[key] === v ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    const tog = (key: keyof Settings) => `<button class="tog ${s[key] ? 'on' : ''}" data-tog="${String(key)}"></button>`;
    const rng = (key: keyof Settings, min: number, max: number, step: number) => `<input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}" data-r="${String(key)}">`;
    const tabs: Record<string, string> = {
      controls: `<div class="sect">
        <div class="row"><div class="l">조작 방식<small>분리형: 오른손 십자 조종 — 상하는 피치, 좌우는 롤이 각각 독립 · 무장은 왼손 쪽</small></div>${seg('controlMode', [['split', '분리형'], ['stick', '가상 스틱'], ['tilt', '기울기']])}</div>
        <div class="row"><div class="l">좌우 반전<small>왼손잡이 레이아웃</small></div>${tog('swapSides')}</div>
        <div class="row"><div class="l">피치 반전</div>${tog('invertPitch')}</div>
        <div class="row"><div class="l">감도</div>${rng('sensitivity', 0.5, 1.5, 0.05)}</div>
        <div class="row"><div class="l">햅틱 진동</div>${tog('vibration')}</div></div>`,
      assist: `<div class="sect">
        <div class="row"><div class="l">비행 보조<small>초보: 자세 자동 복원·실속/지면 충돌 방지 · 표준: 플라이-바이-와이어 · 현실: 직접 조종 + 자동 트림</small></div>${seg('assist', [['beginner', '초보자'], ['standard', '표준'], ['realistic', '현실']])}</div>
        <div class="row"><div class="l">자동 러더<small>협조 선회</small></div>${tog('autoRudder')}</div>
        <div class="row"><div class="l">지상 주행 보조<small>중심선 유지 · 이륙 회전 보조</small></div>${tog('groundAssist')}</div>
        <div class="row"><div class="l">착륙 가이드<small>글라이드 경로 박스</small></div>${tog('landingAssist')}</div>
        <div class="row"><div class="l">단위</div>${seg('units', [['aviation', 'KT / FT'], ['metric', 'KM/H / M']])}</div>
        <div class="row"><div class="l">HUD 색상</div>${seg('hudColor', [['green', 'GREEN'], ['cyan', 'CYAN'], ['amber', 'AMBER']])}</div></div>`,
      graphics: `<div class="sect">
        <div class="row"><div class="l">품질 프리셋<small>${IS_MOBILE ? '모바일 감지 — 중간 권장' : '데스크톱'}</small></div>${seg('quality', [['low', 'LOW'], ['medium', 'MED'], ['high', 'HIGH'], ['ultra', 'ULTRA']])}</div>
        <div class="row"><div class="l">해상도 배율</div>${rng('resScale', 0.5, 1.25, 0.05)}</div>
        <div class="row"><div class="l">그림자</div>${tog('shadows')}</div>
        <div class="row"><div class="l">블룸</div>${tog('bloom')}</div>
        <div class="row"><div class="l">구름</div>${tog('clouds')}</div>
        <div class="row"><div class="l">수목 밀도</div>${rng('trees', 0, 1, 0.1)}</div>
        <div class="row"><div class="l">FPS 표시</div>${tog('showFps')}</div></div>`,
      audio: `<div class="sect">
        <div class="row"><div class="l">마스터</div>${rng('volume', 0, 1, 0.05)}</div>
        <div class="row"><div class="l">엔진</div>${rng('engineVol', 0, 1, 0.05)}</div>
        <div class="row"><div class="l">음성 콜아웃<small>Pull up · 고도 콜아웃</small></div>${tog('voice')}</div></div>
        <div class="sect"><div class="row"><div class="l">진행 상황 초기화</div><button class="link" data-reset>Reset</button></div></div>`,
    };
    const el = this.screen('settings', `
      <div class="shade full"></div>
      ${this.top('Settings', '변경 사항은 자동 저장됩니다')}
      <div class="page narrow">
        ${this.tabsHtml([['controls', 'Controls', '조작'], ['assist', 'Assist', '보조'], ['graphics', 'Graphics', '그래픽'], ['audio', 'Audio', '사운드']], this.settingsTab)}
        <div class="st">${tabs[this.settingsTab]}</div>
      </div>
      ${from === 'main' ? this.tabbar('settings') : ''}`);
    const gfx = ['quality', 'resScale', 'shadows', 'bloom', 'trees', 'clouds'];
    const apply = (k: string) => { save(); this.host.applySettings(gfx.includes(k)); };
    el.querySelectorAll<HTMLElement>('.opts[data-s] button').forEach((b) => b.addEventListener('click', () => {
      const k = (b.parentElement as HTMLElement).dataset.s as keyof Settings;
      (s as unknown as Record<string, unknown>)[k] = b.dataset.v;
      b.parentElement!.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      if (k === 'controlMode' && b.dataset.v === 'tilt') this.host.requestTilt();
      this.host.ui(); apply(k);
    }));
    this.on(el, '[data-tog]', (b) => { const k = b.dataset.tog as keyof Settings; (s as unknown as Record<string, unknown>)[k] = !s[k]; b.classList.toggle('on', !!s[k]); apply(k); });
    el.querySelectorAll<HTMLInputElement>('input[data-r]').forEach((inp) => inp.addEventListener('change', () => { (s as unknown as Record<string, unknown>)[inp.dataset.r!] = +inp.value; apply(inp.dataset.r!); }));
    this.on(el, '[data-tab]', (b) => { this.settingsTab = b.dataset.tab!; this.settingsScreen(from); });
    this.on(el, '[data-reset]', () => { if (confirm('모든 진행 상황을 초기화할까요?')) { resetProgress(); this.banner('RESET', '진행 상황 초기화 완료'); } });
    this.on(el, '[data-back]', () => (from === 'main' ? this.go(() => this.main()) : this.pause()));
    this.bindTabbar(el);
    this.show('settings');
    this.placeUnderline(el);
  }

  /* ================= in-flight menus ================= */
  pause(objective = '') {
    const items: [string, string, string][] = [['resume', 'Resume', '계속하기'], ['restart', 'Restart', '다시 시작'], ['photo', 'Photo Mode', '포토 모드'], ['settings', 'Settings', '설정'], ['quit', 'Quit', '메인 메뉴']];
    const el = this.screen('pause', `<div class="pz">
      <div class="l"><div class="eyebrow"><b>Flight</b> · Paused</div><div class="d big">Paused</div>
        <div class="list">${items.map(([k, en, ko], i) => `<button class="nv" data-a="${k}" style="animation-delay:${i * 0.05}s"><span class="ix">0${i + 1}</span><span class="d">${en}</span><span class="kr">${ko}</span></button>`).join('')}</div></div>
      <div class="r st">
        ${objective ? `<div class="hdr2">Objective</div><div class="obj" style="margin-bottom:18px"><span class="n">01</span><span>${objective}</span></div>` : ''}
        <div class="hdr2">Keyboard</div>
        <div class="keys">${[['W/S', '피치'], ['A/D', '롤'], ['Q/E', '러더'], ['⇧/Ctrl', '스로틀'], ['N', '애프터버너'], ['G', '기어'], ['F/V', '플랩'], ['B', '브레이크'], ['Z', '에어브레이크'], ['H', '테일훅'], ['J', '캐터펄트'], ['Space', '기관포'], ['R', '미사일'], ['X', '플레어'], ['Tab', '목표 전환'], ['C', '시점'], ['T', '오토파일럿'], ['Y', '자동 착륙'], ['L', '조명'], ['K', '스모크'], ['U', 'HUD'], ['O', '포토'], ['I', '엔진 시동']].map(([k, v]) => `<div><b>${k}</b>${v}</div>`).join('')}</div>
        <div class="hdr2" style="margin-top:22px">Gamepad</div>
        <div class="keys">${[['LS', '피치/롤'], ['RS', '러더'], ['RT/LT', '스로틀'], ['A', '기관포'], ['B', '미사일'], ['LB', '플레어'], ['RB', '기어'], ['Y', '시점']].map(([k, v]) => `<div><b>${k}</b>${v}</div>`).join('')}</div>
      </div></div>`);
    this.on(el, '[data-a]', (b) => {
      const a = b.dataset.a;
      if (a === 'resume') this.host.resume();
      else if (a === 'restart') this.go(() => this.host.restart());
      else if (a === 'photo') this.host.photo();
      else if (a === 'settings') this.settingsScreen('pause');
      else if (a === 'quit') this.go(() => this.host.quit());
    });
    this.show('pause');
  }

  photoUI() {
    const el = this.screen('photo', `<div class="photo-ui"><button class="link" data-a="shot">Save Image</button><button class="link" data-a="exit">Back</button></div>
      <div class="tipbox"><span class="m">PHOTO MODE</span>드래그: 회전 · 휠/핀치: 줌</div>`);
    this.on(el, '[data-a]', (b) => (b.dataset.a === 'shot' ? this.host.screenshot() : this.host.exitPhoto()));
    this.show('photo');
  }

  results(r: ResultData) {
    const lr = r.landing;
    const parse = (v: string) => { const m = v.match(/^(-?[\d.]+)(.*)$/); return m ? { n: +m[1], s: m[2], d: (m[1].split('.')[1] ?? '').length } : null; };
    const row = (k: string, v: string, i: number) => { const p = parse(v); return `<tr><td style="animation-delay:${0.5 + i * 0.06}s">${k}</td><td style="animation-delay:${0.5 + i * 0.06}s">${p ? `<span data-count="${p.n}" data-dec="${p.d}" data-suf="${p.s}">0</span>` : v}</td></tr>`; };
    const el = this.screen('results', `<div class="rs"><i class="lbx t"></i><i class="lbx b"></i>
      <div class="box">
        <div class="eyebrow"><b>${r.success ? 'Debrief' : 'Mission Failed'}</b> · ${r.title}</div>
        <div class="d big ${r.success ? '' : 'no'}">${r.success ? 'Mission<br>Complete' : 'Mission<br>Failed'}</div>
        <div class="why">${r.reason}</div>
        ${r.success && r.missionId ? `<div class="stars3">${[0, 1, 2].map((k) => `<i class="${k < r.stars ? 'on' : ''}" style="animation-delay:${0.45 + k * 0.2}s"></i>`).join('')}</div>` : ''}
        ${lr ? `<div class="grade"><div class="g ${lr.grade}">${lr.grade}</div><div><div class="eyebrow">Landing</div><div style="font-weight:800;font-size:19px;margin:4px 0 2px">${lr.title}</div><div class="m" style="font-size:13px;color:var(--ash)"><span style="color:var(--bone);font-size:22px" data-count="${lr.score}">0</span> / 100</div></div></div>
          <table class="rtab">${lr.items.map((it, i) => `<tr><td style="animation-delay:${0.6 + i * 0.06}s">${it.label}</td><td style="animation-delay:${0.6 + i * 0.06}s;color:var(--ash)">${it.value}</td><td style="animation-delay:${0.6 + i * 0.06}s">${it.pts}/${it.max}<span class="barline"><i style="transform:scaleX(${it.pts / it.max})"></i></span></td></tr>`).join('')}${lr.bounced ? '<tr><td>바운스 감점</td><td></td><td style="color:var(--burn)">-15</td></tr>' : ''}</table>` : ''}
        <table class="rtab">${[['비행 시간', fmtTime(r.time)], ...r.rows].map(([k, v], i) => row(k, v, i)).join('')}</table>
        <div class="actions">
          <button class="cta" data-a="quit">Continue ${ICON.play}</button>
          <button class="link" data-a="restart">Retry</button>
          <button class="link" data-a="replay" ${r.canReplay ? '' : 'disabled'}>Replay</button>
        </div></div></div>`);
    this.on(el, '[data-a]', (b) => {
      const a = b.dataset.a;
      if (a === 'replay' && r.canReplay) this.host.replay();
      else if (a === 'restart') this.go(() => this.host.restart());
      else if (a === 'quit') this.go(() => this.host.quit());
    });
    this.show('results');
    setTimeout(() => this.countUp(el), 450);
  }

  /* ================= overlays ================= */
  /** Angular banner (kill confirm / status). Legacy toast() maps here. */
  banner(title: string, sub = '', color = 'var(--burn)', ms = 1900) {
    this.bannerEl?.remove();
    const el = h(`<div class="banner"><div class="t">${title}</div><i class="a" style="background:${color}"></i>${sub ? `<small>${sub}</small>` : ''}</div>`);
    this.root.appendChild(el);
    this.bannerEl = el;
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
  }
  toast(text: string, color = 'var(--sky)', ms = 1700) {
    // split "TITLE — sub" style messages
    const [a, b] = text.split(' — ');
    this.banner(a, b ?? '', color, ms);
  }
  /** Small system notice (gear, flaps, autopilot…) — top centre, out of the way on phones. */
  notice(text: string) {
    let n = this.root.querySelector<HTMLElement>('.notice');
    if (!n) { n = h('<div class="notice"></div>'); this.root.appendChild(n); }
    n.textContent = text;
    n.classList.remove('on'); void n.offsetWidth; n.classList.add('on');
    clearTimeout((n as unknown as { _t: number })._t);
    (n as unknown as { _t: number })._t = window.setTimeout(() => n!.classList.remove('on'), 1500);
  }
  feed(text: string, tag = 'KILL') {
    const el = h(`<div><b>${tag}</b>${text}</div>`);
    this.feedEl.prepend(el);
    while (this.feedEl.children.length > 5) this.feedEl.lastElementChild!.remove();
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 5200);
  }
  intro(code: string, title: string, sub: string) {
    const el = h(`<div class="intro"><i class="lbx t"></i><i class="lbx b"></i><div class="card2"><div class="m">${code}</div><div class="d">${title}</div><div class="k">${sub}</div></div></div>`);
    this.root.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3300);
  }
  codename(id: string) { return CODENAME[id] ?? id; }
  tip(text: string | null) {
    if (!text) { this.tipEl?.remove(); this.tipEl = null; return; }
    if (this.tipEl && this.tipEl.dataset.t === text) return;
    this.tipEl?.remove();
    this.tipEl = h(`<div class="tipbox" data-t="${text.replace(/"/g, '')}"><span class="m">TIP</span>${text}</div>`);
    this.root.appendChild(this.tipEl);
  }
  toggleAP() {
    if (this.apEl) { this.apEl.remove(); this.apEl = null; return; }
    this.apEl = h(`<div class="ap"><div class="hh">AUTOPILOT</div>
      <div class="r"><button class="md" data-c="ap">A/P</button><button class="md" data-c="app">APP</button><button class="md" data-c="off">OFF</button></div>
      <div class="r"><button class="md" data-c="alt">ALT</button><button class="pm" data-c="alt-">−</button><span class="v" data-v="alt"></span><button class="pm" data-c="alt+">+</button></div>
      <div class="r"><button class="md" data-c="hdg">HDG</button><button class="pm" data-c="hdg-">−</button><span class="v" data-v="hdg"></span><button class="pm" data-c="hdg+">+</button></div>
      <div class="r"><button class="md" data-c="spd">SPD</button><button class="pm" data-c="spd-">−</button><span class="v" data-v="spd"></span><button class="pm" data-c="spd+">+</button></div>
      <div style="font-size:11px;color:var(--ash);margin-top:6px">APP — 가장 가까운 활주로/항모로 ILS 자동 접근·착륙</div></div>`);
    this.root.appendChild(this.apEl);
    this.apEl.querySelectorAll<HTMLElement>('[data-c]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); const c = b.dataset.c!; this.host.apCmd(c.replace(/[+-]$/, ''), c.endsWith('+') ? 1 : c.endsWith('-') ? -1 : 0); this.host.ui(); }));
  }
  updateAP() {
    if (!this.apEl) return;
    const ap = this.host.ap();
    if (!ap) return;
    const aviation = settings.units === 'aviation';
    (this.apEl.querySelector('[data-v=alt]') as HTMLElement).textContent = aviation ? `${Math.round(ap.altT * 3.28084)} FT` : `${Math.round(ap.altT)} M`;
    (this.apEl.querySelector('[data-v=hdg]') as HTMLElement).textContent = `${String(Math.round(ap.hdgT)).padStart(3, '0')}°`;
    (this.apEl.querySelector('[data-v=spd]') as HTMLElement).textContent = aviation ? `${Math.round(ap.spdT * MS_TO_KT)} KT` : `${Math.round(ap.spdT * 3.6)} KM/H`;
    const on = (k: string, v: boolean) => this.apEl!.querySelector(`[data-c=${k}]`)!.classList.toggle('on', v);
    on('ap', ap.on && !ap.app); on('app', ap.app); on('alt', ap.on && ap.alt); on('hdg', ap.on && ap.hdg); on('spd', ap.on && ap.spd);
  }
  closeAP() { this.apEl?.remove(); this.apEl = null; }
  get apOpen() { return !!this.apEl; }
}
