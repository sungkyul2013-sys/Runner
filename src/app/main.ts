/**
 * 수 국어논술 — application entry.
 *
 * Wires the persistent shell (nav, FX layer, toasts) to the hash router and
 * registers every view. No framework: views are functions returning an element
 * plus lifecycle hooks.
 */

import './styles.css';

import { sfx, unlockAudioOnFirstGesture } from './core/audio';
import { h } from './core/dom';
import { pruneScrollBindings } from './core/motion';
import { onRouteChange, register, setFallback, start, go, type ViewHandle } from './core/router';
import { applySettings, levelFromXp, newBadges, store } from './core/store';
import { BADGE_BY_ID } from './data/badges';
import { toast } from './ui/components';

import { conceptsView } from './views/concepts';
import { dashboardView } from './views/dashboard';
import { diagnosticView } from './views/diagnostic';
import { homeView } from './views/home';
import { mockView } from './views/mock';
import { practiceView } from './views/practice';
import { readingView } from './views/reading';
import { reviewView } from './views/review';
import { routineView } from './views/routine';
import { settingsView } from './views/settings';
import { spellingView } from './views/spelling';
import { vocabView } from './views/vocab';
import { writingView } from './views/writing';

const NAV = [
  { path: 'home', label: '홈' },
  { path: 'diagnostic', label: '진단' },
  { path: 'practice', label: '문제 풀이' },
  { path: 'concepts', label: '개념' },
  { path: 'vocab', label: '어휘' },
  { path: 'spelling', label: '맞춤법' },
  { path: 'reading', label: '독해' },
  { path: 'writing', label: '논술' },
  { path: 'routine', label: '루틴' },
  { path: 'mock', label: '모의고사' },
  { path: 'review', label: '오답노트' },
  { path: 'dashboard', label: '리포트' },
];

function buildShell(): { outlet: HTMLElement } {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');

  /* ------------------------------- nav ------------------------------- */
  const links = NAV.map((n) =>
    h(
      'a.nav__link',
      {
        href: `#/${n.path}`,
        'data-path': n.path,
        onclick: () => sfx.nav(),
      },
      n.label,
    ),
  );

  const lvlBadge = h('span.nav__lvl');
  const xpLabel = h('span');
  const xpPill = h('div.nav__xp', lvlBadge, xpLabel);

  const themeBtn = h(
    'button.icon-btn',
    {
      title: '테마 전환',
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
        toast(next === 'system' ? '시스템 테마' : next === 'light' ? '밝은 테마' : '어두운 테마', '🎨', 1400);
      },
    },
    '◐',
  );

  const settingsBtn = h(
    'button.icon-btn',
    {
      title: '설정',
      onclick: () => {
        sfx.nav();
        go('settings');
      },
    },
    '⚙',
  );

  const nav = h(
    'nav.nav',
    h(
      'div.nav__inner',
      h(
        'a.brand',
        { href: '#/home', onclick: () => sfx.nav() },
        h('span.brand__mark', '수'),
        h('span', '수 국어논술'),
      ),
      h('div.nav__links', ...links),
      h('div.nav__right', xpPill, themeBtn, settingsBtn),
    ),
  );

  const outlet = h('main#outlet');
  const fxLayer = h('div#fx-layer');

  app.append(nav, outlet, fxLayer);

  function syncTheme(): void {
    const t = store.profile.settings.theme;
    themeBtn.textContent = t === 'system' ? '◐' : t === 'light' ? '☀' : '☾';
  }
  syncTheme();

  function syncXp(): void {
    const { level, into, need } = levelFromXp(store.profile.xp);
    lvlBadge.textContent = String(level);
    xpLabel.textContent = `${into}/${need} XP`;
  }
  syncXp();
  store.subscribe(syncXp);

  // Nav shadow once the page moves.
  const onScroll = () => nav.classList.toggle('is-stuck', window.scrollY > 6);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  onRouteChange(({ path }) => {
    for (const link of links) {
      link.classList.toggle('is-active', link.dataset.path === path);
    }
    // Keep the active nav pill in view on narrow screens.
    const active = links.find((l) => l.classList.contains('is-active'));
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    pruneScrollBindings();
    drainBadges();
  });

  return { outlet };
}

/** Show a toast for anything unlocked since the last check. */
function drainBadges(): void {
  while (newBadges.length) {
    const id = newBadges.shift();
    if (!id) continue;
    const badge = BADGE_BY_ID.get(id);
    if (!badge) continue;
    window.setTimeout(() => {
      sfx.badge();
      toast(`뱃지 획득 — ${badge.name}`, badge.icon, 3200);
    }, 400);
  }
}

function notFound(): ViewHandle {
  const el = h(
    'div.wrap.section',
    h(
      'div.empty',
      h('div.empty__icon', '🧭'),
      h('h2.h1', { style: { marginBottom: '10px' } }, '없는 페이지입니다'),
      h('p.lede', { style: { marginInline: 'auto', marginBottom: '24px' } }, '주소를 다시 확인하거나 홈으로 돌아가세요.'),
      h(
        'button.btn.btn--primary',
        {
          onclick: () => go('home'),
        },
        '홈으로',
      ),
    ),
  );
  return { el, title: '페이지 없음' };
}

function boot(): void {
  applySettings();
  unlockAudioOnFirstGesture();

  const { outlet } = buildShell();

  register('home', homeView);
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

  // Re-apply theme-dependent bits when the OS flips appearance.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (store.profile.settings.theme === 'system') applySettings();
  });

  // Global shortcuts.
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const map: Record<string, string> = {
      h: 'home',
      d: 'diagnostic',
      p: 'practice',
      c: 'concepts',
      v: 'vocab',
      r: 'routine',
      g: 'dashboard',
    };
    const path = map[e.key.toLowerCase()];
    if (path) {
      sfx.nav();
      go(path);
    }
  });

  // Fade out the boot screen once the first view is on screen.
  const bootEl = document.getElementById('boot');
  requestAnimationFrame(() => {
    window.setTimeout(() => {
      bootEl?.classList.add('is-gone');
      window.setTimeout(() => bootEl?.remove(), 600);
    }, 220);
  });

  drainBadges();
}

boot();
