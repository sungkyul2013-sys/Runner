// Map selection (§18.3-6 맵 선택): the map, the start point, time of day and weather, then start.
import { t, tl, type StringKey } from './i18n';
import { icon } from './icons';
import { settings } from './settings';

export interface MapChoice {
  id: string;
  label: { ko: string; en: string };
  desc: { ko: string; en: string };
  areaKm2: number;
  spawns: Array<{ id: string; label: { ko: string; en: string } }>;
}

const WEATHERS = ['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow', 'blizzard'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.append(...children);
  return e;
}

/** Opens the map selection over the menu; `start(mapId, spawnId)` when confirmed. */
export function openMapSelect(maps: MapChoice[], preselect: string, start: (map: string, spawn: string) => void): void {
  const layer = el('div', 'overlay-layer');
  const panel = el('div', 'overlay-card map-select');
  const close = el('button', 'icon-btn', icon('close'));
  close.ariaLabel = t('close');
  close.onclick = () => layer.remove();
  panel.append(el('header', 'ms-head', el('h2', '', t('mapSelect')), close));
  let map = maps.find((m) => m.id === preselect) ?? maps[0];
  let spawn = map.spawns[0]?.id ?? '';
  const mapList = el('div', 'ms-maps');
  const spawnList = el('div', 'chips ms-spawns');
  const renderSpawns = () => {
    spawnList.replaceChildren(...map.spawns.map((sp) => {
      const b = el('button', sp.id === spawn ? 'chip active' : 'chip', tl(sp.label));
      b.onclick = () => {
        spawn = sp.id;
        renderSpawns();
      };
      return b;
    }));
  };
  const renderMaps = () => {
    mapList.replaceChildren(...maps.map((m) => {
      const b = el('button', m.id === map.id ? 'ms-map active' : 'ms-map', el('b', '', tl(m.label)), el('small', '', tl(m.desc)), el('span', 'ms-area', m.areaKm2 ? `${m.areaKm2} km²` : ''));
      b.onclick = () => {
        map = m;
        spawn = m.spawns[0]?.id ?? '';
        renderMaps();
        renderSpawns();
      };
      return b;
    }));
  };
  renderMaps();
  renderSpawns();
  const s = settings.get();
  const hourOut = el('span', 'mono', '');
  const hour = el('input') as HTMLInputElement;
  hour.type = 'range';
  hour.min = '0';
  hour.max = '24';
  hour.step = '0.5';
  hour.value = String(s.worldHour);
  const showHour = () => (hourOut.textContent = `${String(Math.floor(Number(hour.value)) % 24).padStart(2, '0')}:${Number(hour.value) % 1 ? '30' : '00'}`);
  hour.oninput = showHour;
  showHour();
  let weather = s.worldWeather;
  const weatherChips = el('div', 'chips');
  const renderWeather = () => weatherChips.replaceChildren(...WEATHERS.map((w) => {
    const b = el('button', w === weather ? 'chip active' : 'chip', t(`weather_${w}` as StringKey));
    b.onclick = () => {
      weather = w;
      renderWeather();
    };
    return b;
  }));
  renderWeather();
  const go = el('button', 'primary wide', t('mapStart'));
  go.onclick = () => {
    settings.set({ worldHour: Number(hour.value) % 24, worldWeather: weather, lastMap: map.id });
    layer.remove();
    start(map.id, spawn);
  };
  panel.append(
    mapList,
    el('section', 'ms-section', el('h3', '', t('mapSpawn')), spawnList),
    el('section', 'ms-section', el('label', 'field', el('span', '', t('timeOfDay')), hourOut), hour),
    el('section', 'ms-section', el('h3', '', t('weather')), weatherChips),
    go,
  );
  layer.append(panel);
  layer.addEventListener('pointerdown', (e) => {
    if (e.target === layer) layer.remove();
  });
  document.body.append(layer);
}
