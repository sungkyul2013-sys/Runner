// 2 px line icons (§18.2 아이콘: 일관된 2px 라인 아이콘 세트, drawn for this project), 24 × 24 viewBox, currentColor.
const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  pause: svg('<path d="M9 5v14M15 5v14"/>'),
  play: svg('<path d="M7 5l12 7-12 7z"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  xray: svg('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  slow: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>'),
  gauge: svg('<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  restart: svg('<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v4h4"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  chevron: svg('<path d="M9 6l6 6-6 6"/>'),
  back: svg('<path d="M15 6l-6 6 6 6"/>'),
  panel: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  car: svg('<path d="M3 16v-3l2-5h14l2 5v3z"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>'),
  crash: svg('<path d="M3 17h7l2-5h5"/><path d="M17 5v14M20 8l-3 4 3 4"/>'),
  cube: svg('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>'),
  map: svg('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  garage: svg('<path d="M3 20V9l9-5 9 5v11"/><path d="M7 20v-7h10v7M7 16h10"/>'),
  flag: svg('<path d="M5 21V4h11l-2 4 2 4H5"/>'),
  hand: svg('<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-12 0v-2a1.5 1.5 0 0 1 3 0"/>'),
  crane: svg('<path d="M5 21V4h9M5 8l9-4M14 4v6"/><path d="M12 10h4v3h-4z"/>'),
  eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  cloud: svg('<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.3 1.6A3.3 3.3 0 0 0 7 18z"/>'),
  rain: svg('<path d="M7 14h10a3.5 3.5 0 0 0 .4-7 5.5 5.5 0 0 0-10.4 1.4A2.9 2.9 0 0 0 7 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>'),
  storm: svg('<path d="M7 13h10a3.5 3.5 0 0 0 .4-7 5.5 5.5 0 0 0-10.4 1.4A2.9 2.9 0 0 0 7 13z"/><path d="M12 14l-2 4h4l-2 4"/>'),
  fog: svg('<path d="M4 8h16M6 12h12M4 16h16M8 20h8"/>'),
  snow: svg('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5L12 6l2.5-1.5M9.5 19.5L12 18l2.5 1.5"/>'),
  blizzard: svg('<path d="M10 3v12M4.8 6l10.4 6M4.8 12L15.2 6"/><path d="M14 17h7M12 20h9M17 14h4"/>'),
  pin: svg('<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>'),
  orbit: svg('<path d="M12 3l7 4v8l-7 4-7-4V7z"/><path d="M12 11l7-4M12 11v8M12 11L5 7"/><ellipse cx="12" cy="12" rx="10.5" ry="4" transform="rotate(-18 12 12)"/>'),
  touch: svg('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'),
  alert: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'),
  check: svg('<path d="M4 12.5l5 5L20 6.5"/>'),
  wrench: svg('<path d="M14.5 5.5a4.5 4.5 0 0 0 5.6 5.6l-8.9 8.9a2.1 2.1 0 0 1-3-3l8.9-8.9a4.5 4.5 0 0 1-2.6-2.6z"/><path d="M14.5 5.5L17 3l1 3 3 1-2.5 2.5"/>'),
  swap: svg('<path d="M4 8h14l-3-3M20 16H6l3 3"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  unlock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
  step: svg('<path d="M6 5l9 7-9 7z"/><path d="M18 5v14"/>'),
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 13l3.5-3.5M10 2h4"/>'),
  drag: svg('<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>'),
  reset: svg('<path d="M12 3v4M12 3L9 6M12 3l3 3"/><path d="M5.6 9.5A7.5 7.5 0 1 0 12 7"/>'),
  target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  layers: svg('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5" opacity=".5"/>'),
  sliders: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  volume: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  mute: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  truck: svg('<path d="M2 16V7h11v9M13 10h4l4 3.5V16"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'),
  grid: svg('<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'),
  road: svg('<path d="M8 3L5 21M16 3l3 18M12 4v2M12 10v3M12 17v3"/>'),
  mountain: svg('<path d="M2 20l7-12 4 6 3-4 6 10z"/>'),
  fullscreen: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): HTMLElement {
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = ICONS[name];
  return span;
}
