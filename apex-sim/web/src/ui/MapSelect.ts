// Map selection (§18.3-6 맵 선택): a full-screen 3D choice. The chosen map stands as a model on the studio floor
// (MapStage), with pins at its start points; tabs switch the map, the side panel picks the start point, the time of
// day and the weather (previewed on the model), and the big button starts. Phones in portrait get the panel as a
// bottom sheet under the model.
import { t, tl, type Localized, type StringKey } from './i18n';
import { icon, type IconName } from './icons';
import type { MapStage, MapStageState } from './MapStage';
import { settings } from './settings';
import { MAP_STAGES } from '../world/loadMap';

export interface MapChoice {
  id: string;
  label: Localized;
  desc: Localized;
  areaKm2: number;
  kind?: 'open' | 'test' | 'grid';
  spawns: Array<{ id: string; label: Localized }>;
}

const WEATHERS: Array<[string, IconName]> = [
  ['clear', 'sun'], ['cloudy', 'cloud'], ['rain', 'rain'], ['storm', 'storm'], ['fog', 'fog'], ['snow', 'snow'], ['blizzard', 'blizzard'],
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.append(...children);
  return e;
}

const hhmm = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;

/**
 * Opens the map selection; `start(mapId, spawnId)` when confirmed, `closed()` when left without starting.
 * With a `stage`, the choice is previewed in 3D on the menu scene.
 */
export function openMapSelect(maps: MapChoice[], preselect: string, start: (map: string, spawn: string) => void, stage: MapStage | null = null, closed: () => void = () => {}): void {
  const root = el('div', 'ms3');
  let map = maps.find((m) => m.id === preselect) ?? maps[0];
  let spawn = map.spawns[0]?.id ?? '';
  const s = settings.get();
  let hour = s.worldHour;
  let weather = s.worldWeather;

  // ---- top: back, kicker, map tabs ----
  const back = el('button', 'ms3-back', icon('back'), el('span', '', t('mapBack')));
  const tabs = el('nav', 'ms3-tabs');
  const top = el('header', 'ms3-top', back, el('div', 'ms3-kicker', t('mapSelect')), tabs);

  // ---- left: the map's title card ----
  const kind = el('small', 'ms3-kind');
  const title = el('h1', 'ms3-title');
  const desc = el('p', 'ms3-desc');
  const status = el('div', 'ms3-status');
  const info = el('section', 'ms3-info', kind, title, desc, status);

  // ---- right: start point, time, weather, start ----
  const spawnList = el('div', 'ms3-spawns');
  const hourOut = el('b', 'mono');
  const hourIcon = el('span', 'ms3-hour-ic');
  const range = el('input', 'ms3-range') as HTMLInputElement;
  range.type = 'range';
  range.min = '0';
  range.max = '23.5';
  range.step = '0.5';
  range.value = String(hour);
  const weatherRow = el('div', 'ms3-weather');
  const go = el('button', 'ms3-go', el('span', '', t('mapStart')), icon('chevron'));
  const overview = el('button', 'ms3-mini', icon('orbit'), el('span', '', t('mapOverview')));
  const panel = el('aside', 'ms3-panel',
    el('div', 'ms3-h', el('span', '', t('mapSpawn')), overview),
    spawnList,
    el('div', 'ms3-h', el('span', '', t('timeOfDay')), el('span', 'ms3-hour', hourIcon, hourOut)),
    range,
    el('div', 'ms3-h', el('span', '', t('weather'))),
    weatherRow,
    go,
  );
  const labels = el('div', 'ms3-labels');
  const hint = el('div', 'ms3-hint', t(matchMedia('(pointer: coarse)').matches ? 'mapPinHint' : 'mapKeys'));
  root.append(labels, top, info, panel, hint);

  const renderTabs = () => tabs.replaceChildren(...maps.map((m) => {
    const b = el('button', m.id === map.id ? 'on' : '', tl(m.label).replace(/\s*\(.*\)$/, ''));
    b.onclick = () => setMap(m);
    return b;
  }));
  const renderInfo = () => {
    kind.textContent = [t(map.kind === 'open' ? 'mapKindOpen' : 'mapKindTest'), map.areaKm2 ? `${map.areaKm2} km²` : ''].filter(Boolean).join(' · ');
    title.textContent = tl(map.label).replace(/\s*\(.*\)$/, '');
    desc.textContent = tl(map.desc);
    for (const e of [title, desc, kind]) {
      e.classList.remove('in');
      void e.offsetWidth;
      e.classList.add('in');
    }
  };
  const pinLabels = new Map<string, HTMLElement>();
  const renderSpawns = () => {
    spawnList.replaceChildren(...map.spawns.map((sp, i) => {
      const b = el('button', sp.id === spawn ? 'ms3-spawn on' : 'ms3-spawn', el('i', '', String(i + 1)), el('span', '', tl(sp.label)));
      b.onclick = () => setSpawn(sp.id);
      return b;
    }));
    labels.replaceChildren();
    pinLabels.clear();
    map.spawns.forEach((sp, i) => {
      const l = el('button', sp.id === spawn ? 'ms3-pin on' : 'ms3-pin', el('i', '', String(i + 1)), el('span', '', tl(sp.label)));
      l.onclick = () => setSpawn(sp.id);
      labels.append(l);
      pinLabels.set(sp.id, l);
    });
  };
  const renderWeather = () => weatherRow.replaceChildren(...WEATHERS.map(([w, ic]) => {
    const b = el('button', w === weather ? 'on' : '', icon(ic), el('span', '', t(`weather_${w}` as StringKey)));
    b.onclick = () => {
      weather = w;
      renderWeather();
      stage?.setWeather(w);
    };
    return b;
  }));
  const showHour = () => {
    hourOut.textContent = hhmm(hour);
    const night = hour < 6 || hour >= 19;
    hourIcon.replaceChildren(icon(night ? 'moon' : 'sun'));
    range.style.setProperty('--p', String(hour / 23.5));
  };
  range.oninput = () => {
    hour = Number(range.value);
    showHour();
    stage?.setHour(hour);
  };

  const setSpawn = (id: string) => {
    spawn = id;
    spawnList.querySelectorAll('.ms3-spawn').forEach((b, i) => b.classList.toggle('on', map.spawns[i]?.id === id));
    pinLabels.forEach((l, k) => l.classList.toggle('on', k === id));
    stage?.select(id);
    spawnList.querySelector('.on')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const setMap = (m: MapChoice) => {
    map = m;
    spawn = m.spawns[0]?.id ?? '';
    renderTabs();
    renderInfo();
    renderSpawns();
    stage?.select(spawn);
    void stage?.show(m.id, m.spawns.map((sp) => sp.id));
  };

  const onState = (st: MapStageState) => {
    status.classList.toggle('on', st.loading || !!st.error);
    if (st.error) status.replaceChildren(el('span', 'err', t('mapFailed')));
    else if (st.loading) {
      const p = st.stage ? MAP_STAGES[st.stage] : null;
      const bar = el('i');
      bar.style.width = `${Math.round(((p?.[0] ?? 0.12) / 0.72) * 100)}%`;
      status.replaceChildren(el('span', 'spin'), el('span', '', `${t('mapBuilding')}${p ? ` · ${t(p[1])}` : ''}`), el('span', 'track', bar));
    } else status.replaceChildren();
  };

  const close = (started: boolean) => {
    window.removeEventListener('keydown', onKey);
    root.classList.add('out');
    setTimeout(() => root.remove(), 260);
    if (stage) {
      stage.onFrame = () => {};
      stage.onPick = () => {};
      stage.onState = () => {};
    }
    if (!started) closed();
  };
  back.onclick = () => close(false);
  overview.onclick = () => stage?.overview();
  go.onclick = () => {
    settings.set({ worldHour: hour, worldWeather: weather, lastMap: map.id });
    close(true);
    start(map.id, spawn);
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' && e.key !== 'Escape' && e.key !== 'Enter') return;
    const i = maps.indexOf(map), j = map.spawns.findIndex((sp) => sp.id === spawn);
    if (e.key === 'Escape') close(false);
    else if (e.key === 'Enter') go.click();
    else if (e.key === 'ArrowLeft') setMap(maps[(i + maps.length - 1) % maps.length]);
    else if (e.key === 'ArrowRight') setMap(maps[(i + 1) % maps.length]);
    else if (e.key === 'ArrowUp') setSpawn(map.spawns[(j + map.spawns.length - 1) % map.spawns.length].id);
    else if (e.key === 'ArrowDown') setSpawn(map.spawns[(j + 1) % map.spawns.length].id);
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey);

  if (stage) {
    stage.onState = onState;
    stage.onPick = setSpawn;
    // Labels that would overlap an already placed one (the chosen pin first, then front to back) shrink to their
    // number.
    const placed: Array<[number, number, number]> = [];
    stage.onFrame = (pins) => {
      placed.length = 0;
      const order = [...pins].sort((a, b) => (a.id === spawn ? -1 : b.id === spawn ? 1 : b.y - a.y));
      for (const p of order) {
        const l = pinLabels.get(p.id);
        if (!l) continue;
        l.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
        l.classList.toggle('hid', !p.visible);
        if (!p.visible) continue;
        const full = l.dataset.w ? Number(l.dataset.w) : (l.dataset.w = String(l.offsetWidth || 120), Number(l.dataset.w));
        const hit = (w: number) => placed.some(([x, y, pw]) => Math.abs(x - p.x) < (w + pw) / 2 + 4 && Math.abs(y - p.y) < 28);
        const mini = p.id !== spawn && hit(full);
        l.classList.toggle('mini', mini);
        placed.push([p.x, p.y, mini ? 30 : full]);
      }
      if (!pins.length) pinLabels.forEach((l) => l.classList.add('hid'));
    };
    // The model centres in what the panels leave free.
    const measure = () => {
      if (!root.isConnected) return;
      const portrait = innerWidth < 700 && innerHeight > innerWidth;
      const r = panel.getBoundingClientRect();
      stage.insets = portrait ? { right: 0, bottom: innerHeight - r.top + 8 } : { right: innerWidth - r.left + 8, bottom: 0 };
    };
    requestAnimationFrame(measure);
    window.addEventListener('resize', () => requestAnimationFrame(measure));
    stage.setHour(hour);
    stage.setWeather(weather);
  } else root.classList.add('flat');

  renderTabs();
  renderInfo();
  renderSpawns();
  renderWeather();
  showHour();
  document.body.append(root);
  stage?.select(spawn);
  void stage?.show(map.id, map.spawns.map((sp) => sp.id));
}
