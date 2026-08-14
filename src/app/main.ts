/**
 * 수 국어논술 — application entry.
 *
 * The app presents as a phone-shaped game: a fixed HUD on top, a five-slot tab
 * bar at the bottom, and routed views scrolling between them. No framework —
 * views are functions returning an element plus lifecycle hooks.
 */

import './styles.css';

import { sfx, unlockAudioOnFirstGesture } from './core/audio';
import { h } from './core/dom';
import { burst, pruneScrollBindings } from './core/motion';
import { onRouteChange, register, setFallback, start, go, type ViewHandle } from './core/router';
import {
  applySettings,
  finishedQuests,
  levelFromXp,
  newBadges,
  pendingLevelUps,
  rankFor,
  store,
} from './core/store';
import { BADGE_BY_ID } from './data/badges';
import { toast } from './ui/components';

import { conceptsView } from './views/concepts';
import { dashboardView } from './views/dashboard';
import { diagnosticView } from './views/diagnostic';
import { homeView } from './views/home';
import { hubView } from './views/hub';
import { journeyView } from './views/journey';
import { mockView } from './views/mock';
import { onboardingView } from './views/onboarding';
import { practiceView } from './views/practice';
import { readingView } from './views/reading';
import { reviewView } from './views/review';
import { routineView } from './views/routine';
import { settingsView } from './views/settings';
import { spellingView } from './views/spelling';
import { vocabView } from './views/vocab';
import { writingView } from './views/writing';

/**
 * Tab icons are drawn rather than emoji: emoji render as somebody else's
 * illustrations at whatever size the OS decides, which reads as clip art in a
 * bar that is on screen the entire time.
 */
const ICONS: Record<string, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-5.5h5V20"/>',
  map: '<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z"/><path d="M9 4v13"/><path d="M15 6.5v13"/>',
  target: '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
  kit: '<rect x="3" y="7.6" width="18" height="12.4" rx="2.3"/><path d="M8.6 7.6V5.9a1.7 1.7 0 0 1 1.7-1.7h3.4a1.7 1.7 0 0 1 1.7 1.7v1.7"/><path d="M3 13h18"/><path d="M10.4 13v2.2h3.2V13"/>',
  me: '<circle cx="12" cy="8.2" r="3.9"/><path d="M4.6 20.2a7.6 7.6 0 0 1 14.8 0"/>',
};

const svgIcon = (name: string): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/** Bottom tabs. `match` lists routes that should light this tab up. */
const TABS = [
  { path: 'home', icon: 'home', label: '홈', match: ['home'] },
  { path: 'journey', icon: 'map', label: '맵', match: ['journey'] },
  { path: 'practice', icon: 'target', label: '풀이', match: ['practice', 'mock', 'review'] },
  { path: 'hub', icon: 'kit', label: '도구', match: ['hub', 'concepts', 'vocab', 'spelling', 'reading', 'writing', 'routine', 'diagnostic', 'settings'] },
  { path: 'dashboard', icon: 'me', label: '나', match: ['dashboard'] },
];

function buildShell(): { outlet: HTMLElement } {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');

  /* -------------------------------- HUD -------------------------------- */
  const lvlNum = h('b');
  const lvlRing = h('div.hud__lvl', lvlNum);
  const rankLabel = h('div.hud__rank');
  const xpFill = h('i');
  const coinValue = h('span');
  const fireValue = h('span');

  const themeBtn = h(
    'button.hud__btn',
    {
      title: '테마 전환',
      'aria-label': '테마 전환',
      onclick: () => {
        sfx.tap();
        const order = ['system', 'light', 'dark'] as const;
        const cur = store.profile.settings.theme;
        const next = order[(order.indexOf(cur) + 1) % order.length];
        store.update((p) => {
          p.settings.theme = next;
        });
        applySettings();
        syncTheme();
        toast(next === 'system' ? '시스템 테마' : next === 'light' ? '한지 테마' : '먹 테마', '🎨', 1400);
      },
    },
    '◐',
  );

  const hud = h(
    'header.hud',
    h(
      'button',
      {
        style: { display: 'contents' },
        'aria-label': '성취 리포트 열기',
        onclick: () => {
          sfx.nav();
          go('dashboard');
        },
      },
      lvlRing,
    ),
    h('div.hud__meta', rankLabel, h('div.hud__xp', xpFill)),
    h('div.hud__stat.hud__stat--coin', h('span', '🪙'), coinValue),
    h('div.hud__stat.hud__stat--fire', h('span', '🔥'), fireValue),
    themeBtn,
  );

  /* ------------------------------- tabs -------------------------------- */
  const tabEls = TABS.map((t) =>
    h(
      'a.tab',
      {
        href: `#/${t.path}`,
        'data-path': t.path,
        onclick: () => sfx.nav(),
      },
      h('i', { html: svgIcon(t.icon) }),
      h('span', t.label),
    ),
  );
  const tabs = h('nav.tabs', ...tabEls);

  const outlet = h('main#outlet');
  const fxLayer = h('div#fx-layer');
  const bezel = h('div.bezel');

  app.append(hud, outlet, tabs, fxLayer);
  document.body.appendChild(bezel);

  function syncTheme(): void {
    const t = store.profile.settings.theme;
    themeBtn.textContent = t === 'system' ? '◐' : t === 'light' ? '☀' : '☾';
  }
  syncTheme();

  function syncHud(): void {
    const p = store.profile;
    const { level, into, need } = levelFromXp(p.xp);
    lvlNum.textContent = String(level);
    lvlRing.style.setProperty('--p', String(Math.round((into / need) * 100)));
    rankLabel.textContent = rankFor(level);
    xpFill.style.width = `${(into / need) * 100}%`;
    coinValue.textContent = String(p.coins);
    fireValue.textContent = String(p.streak);
  }
  syncHud();
  store.subscribe(syncHud);

  onRouteChange(({ path }) => {
    for (let i = 0; i < TABS.length; i += 1) {
      tabEls[i].classList.toggle('is-on', TABS[i].match.includes(path));
    }
    pruneScrollBindings();
    drainRewards();
  });

  return { outlet };
}

/* ------------------------------------------------------------------ */
/* Reward feedback                                                     */
/* ------------------------------------------------------------------ */

let celebrating = false;

function celebrateLevel(level: number): void {
  if (celebrating) return;
  celebrating = true;
  sfx.levelUp();

  const close = () => {
    overlay.remove();
    celebrating = false;
    drainRewards();
  };

  const overlay = h(
    'div.levelup',
    { onclick: close },
    h(
      'div.levelup__inner',
      h('div.levelup__ring', h('b', String(level))),
      h('div.levelup__title', '레벨 업!'),
      h('div.levelup__rank', rankFor(level)),
      h('div.levelup__hint', '화면을 눌러 계속'),
    ),
  );
  document.body.appendChild(overlay);

  burst(window.innerWidth / 2, window.innerHeight / 2.4, 45, 44);
  window.setTimeout(() => burst(window.innerWidth / 2, window.innerHeight / 2.4, 12, 30), 260);
  window.setTimeout(close, 4200);
}

/** Turn queued unlocks into celebrations and toasts. */
function drainRewards(): void {
  if (pendingLevelUps.length) {
    const level = pendingLevelUps.pop() as number;
    pendingLevelUps.length = 0;
    celebrateLevel(level);
    return;
  }
  while (finishedQuests.length) {
    const q = finishedQuests.shift();
    if (!q) continue;
    window.setTimeout(() => {
      sfx.badge();
      toast(`과제 완료 — ${q.label}  +${q.reward}🪙`, '🎯', 2800);
    }, 260);
  }
  while (newBadges.length) {
    const id = newBadges.shift();
    if (!id) continue;
    const badge = BADGE_BY_ID.get(id);
    if (!badge) continue;
    window.setTimeout(() => {
      sfx.badge();
      toast(`뱃지 획득 — ${badge.name}`, badge.icon, 3000);
    }, 380);
  }
}

function notFound(): ViewHandle {
  const el = h(
    'div.wrap.section',
    h(
      'div.empty',
      h('div.empty__icon', '🧭'),
      h('h2.h1', { style: { marginBottom: '8px' } }, '없는 화면입니다'),
      h('p.lede', { style: { marginBottom: '20px' } }, '아래 탭에서 다시 골라 주세요.'),
      h('button.btn.btn--primary', { onclick: () => go('home') }, '홈으로'),
    ),
  );
  return { el, title: '없는 화면' };
}

function boot(): void {
  applySettings();
  unlockAudioOnFirstGesture();

  const { outlet } = buildShell();

  register('home', homeView);
  register('journey', journeyView);
  register('start', onboardingView);
  register('hub', hubView);
  register('diagnostic', diagnosticView);
  register('practice', practiceView);
  register('concepts', conceptsView);
  register('vocab', vocabView);
  register('spelling', spellingView);
  register('reading', readingView);
  register('writing', writingView);
  register('routine', routineView);
  register('mock', mockView);
  register('review', reviewView);
  register('dashboard', dashboardView);
  register('settings', settingsView);
  setFallback(notFound);

  start(outlet);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (store.profile.settings.theme === 'system') applySettings();
  });

  // Keyboard shortcuts (desktop convenience — the app is pointer-first).
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const map: Record<string, string> = {
      h: 'home',
      m: 'journey',
      p: 'practice',
      t: 'hub',
      g: 'dashboard',
    };
    const path = map[e.key.toLowerCase()];
    if (path) {
      sfx.nav();
      go(path);
    }
  });

  const bootEl = document.getElementById('boot');
  requestAnimationFrame(() => {
    window.setTimeout(() => {
      bootEl?.classList.add('is-gone');
      window.setTimeout(() => bootEl?.remove(), 600);
    }, 200);
  });

  drainRewards();
}

boot();
