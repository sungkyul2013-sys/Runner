import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/views.css';
import './styles/showcase.css';

import { h, icon, qs } from './core/dom';
import { Router, type Route } from './core/router';
import { applyTheme, nextTheme, store } from './core/store';
import { setTopbar, toast } from './core/ui';
import { initStage, morph, stage, tickScroll } from './core/stage';
import type { ShapeName } from '../shared/three/shapes';

import { homeView } from './views/home';
import { quizView } from './views/quiz';
import { resultView } from './views/result';
import { labView } from './views/lab';
import { planView } from './views/plan';
import { coursesView, courseView } from './views/courses';
import { applyView } from './views/apply';
import { trialView } from './views/trial';
import { mapView } from './views/map';
import { studyView } from './views/study';

/* ────────────────────────────── theme ─────────────────────────────── */

applyTheme(store.get().theme);

const themeBtn = qs('#themeBtn');

function paintThemeButton(): void {
  const mode = store.get().theme;
  themeBtn?.replaceChildren(icon(mode === 'light' ? 'sun' : mode === 'dark' ? 'moon' : 'spark', 19));
  themeBtn?.setAttribute(
    'aria-label',
    `테마: ${mode === 'system' ? '시스템' : mode === 'light' ? '밝게' : '어둡게'}`,
  );
}

themeBtn?.addEventListener('click', () => {
  const mode = nextTheme(store.get().theme);
  store.set({ theme: mode });
  applyTheme(mode);
  paintThemeButton();
  toast(mode === 'system' ? '시스템 설정을 따릅니다' : mode === 'light' ? '밝게' : '어둡게');
});

paintThemeButton();

// Follow the OS while the app is in "system" mode.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (store.get().theme === 'system') applyTheme('system');
});

/* ────────────────────────────── router ────────────────────────────── */

const router = new Router('#view');

const ROUTES: (Route & { shape: ShapeName })[] = [
  { pattern: '/', title: '홈', shape: 'glyph', view: () => homeView(router) },
  {
    pattern: '/try',
    title: '프로그램 체험',
    nested: true,
    shape: 'helix',
    view: () => trialView(router),
  },
  { pattern: '/study', title: '학습 시스템', shape: 'grid', view: () => studyView(router) },
  { pattern: '/quiz', title: '진단', shape: 'grid', view: () => quizView(router) },
  { pattern: '/result', title: '진단 결과', nested: true, shape: 'wave', view: () => resultView(router) },
  { pattern: '/map', title: '학습 맵', nested: true, shape: 'wave', view: () => mapView(router) },
  { pattern: '/lab', title: '첨삭 랩', shape: 'book', view: () => labView(router) },
  { pattern: '/plan', title: '학습 플랜', shape: 'helix', view: () => planView(router) },
  { pattern: '/courses', title: '과정', nested: true, shape: 'book', view: () => coursesView(router) },
  {
    pattern: '/course/:id',
    title: '과정',
    nested: true,
    shape: 'sphere',
    view: (ctx) => courseView(router, ctx.param),
  },
  { pattern: '/apply', title: '상담 신청', shape: 'plane', view: () => applyView(router) },
];

for (const route of ROUTES) router.add(route);

/* ───────────────────────── navigation chrome ──────────────────────── */

const TABS: [string, string, string][] = [
  ['/', 'home', '홈'],
  ['/study', 'cal', '학습'],
  ['/quiz', 'quiz', '진단'],
  ['/lab', 'lab', '첨삭'],
  ['/apply', 'chat', '상담'],
];

/** Screens that live under a tab without being it. */
const TAB_OWNER: Record<string, string> = {
  '/result': '/quiz',
  '/plan': '/study',
  '/map': '/study',
  '/courses': '/study',
  '/course': '/study',
};

/** The same markup fills the bottom bar on phones and the side rail on desktop. */
function buildTabs(host: HTMLElement | null): void {
  if (!host) return;
  host.replaceChildren(
    ...TABS.map(([path, ic, label]) =>
      h(
        'a',
        { class: 'tab', href: `#${path}`, 'data-path': path },
        icon(ic, 22),
        h('span', { text: label }),
        h('i', { class: 'tab__dot', 'aria-hidden': 'true' }),
      ),
    ),
  );
}

const tabbar = qs('#tabbar');
const rail = qs('#rail');
buildTabs(tabbar);
buildTabs(rail);

function paintTabs(path: string): void {
  const root = path === '/' ? '/' : `/${path.split('/').filter(Boolean)[0]}`;
  const owner = TAB_OWNER[root] ?? root;

  for (const tab of [...(tabbar?.children ?? []), ...(rail?.children ?? [])]) {
    const el = tab as HTMLElement;
    el.classList.toggle('is-on', el.dataset.path === owner);
    el.setAttribute('aria-current', el.dataset.path === owner ? 'page' : 'false');
  }
}

/** A dot on the 진단 tab until the visitor has actually taken it. */
function paintBadges(): void {
  const taken = store.get().runs.length > 0;
  for (const dot of document.querySelectorAll<HTMLElement>('.tab[data-path="/quiz"] .tab__dot')) {
    dot.classList.toggle('is-on', !taken);
  }
}
paintBadges();
store.subscribe(paintBadges);

/* ───────────────────────────── 3D layer ───────────────────────────── */

const canvas = qs<HTMLCanvasElement>('#scene');
if (canvas && !initStage(canvas)) qs('#backdrop')?.remove();

/* ─────────────────────── per-frame chrome updates ─────────────────── */

const topbar = qs('#topbar');
const topProgress = qs('#topProgress');

let ticking = false;

function onScroll(): void {
  if (ticking) return;
  ticking = true;

  requestAnimationFrame(() => {
    // One layout read per frame, shared by the chrome and every view.
    const { y, progress } = tickScroll();

    topbar?.classList.toggle('is-scrolled', y > 6);
    if (topProgress) topProgress.style.width = `${progress * 100}%`;
    stage()?.setScroll(progress);
    ticking = false;
  });
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll, { passive: true });

/* ──────────────────────────── navigation ──────────────────────────── */

router.onNavigate((route) => {
  const meta = ROUTES.find((r) => r.pattern === route.pattern);

  setTopbar(route.nested ? route.title : null, () => router.back());
  paintTabs(router.currentPath());
  if (meta) morph(meta.shape);

  // Only the home showcase paints the page ground; leaving it must clear.
  document.body.classList.remove('is-dark-chapter', 'is-paper-chapter');

  // A fresh view resets the reading progress.
  if (topProgress) topProgress.style.width = '0%';
  topbar?.classList.remove('is-scrolled');
});

router.start();

/* ────────────────────────────── boot out ──────────────────────────── */

const bootBar = qs('#bootBar');
let bootAt = 0;

// A determinate line: it advances on real milestones, not a fake timer.
function bootProgress(to: number): void {
  bootAt = Math.max(bootAt, Math.min(1, to));
  if (bootBar) bootBar.style.width = `${bootAt * 100}%`;
}

function bootDone(): void {
  bootProgress(1);
  window.setTimeout(() => qs('#boot')?.classList.add('is-done'), 260);
}

bootProgress(0.4); // styles parsed, shell built
if (stage()) bootProgress(0.75); // 3D layer up

if (document.readyState === 'complete') window.setTimeout(bootDone, 420);
else window.addEventListener('load', () => window.setTimeout(bootDone, 420), { once: true });

// Never trap someone behind the splash if an asset stalls.
window.setTimeout(bootDone, 3500);

if (import.meta.env.DEV) {
  import.meta.hot?.dispose(() => stage()?.dispose());
}
