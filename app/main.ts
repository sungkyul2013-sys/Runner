import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/views.css';

import { h, icon, qs } from './core/dom';
import { Router, type Route } from './core/router';
import { applyTheme, nextTheme, store } from './core/store';
import { setTopbar, toast } from './core/ui';
import { Scene } from '../shared/three/Scene';
import type { ShapeName } from '../shared/three/shapes';

import { homeView } from './views/home';
import { quizView } from './views/quiz';
import { resultView } from './views/result';
import { labView } from './views/lab';
import { planView } from './views/plan';
import { coursesView, courseView } from './views/courses';
import { applyView } from './views/apply';

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
  { pattern: '/quiz', title: '진단', shape: 'grid', view: () => quizView(router) },
  { pattern: '/result', title: '진단 결과', nested: true, shape: 'wave', view: () => resultView(router) },
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
  ['/quiz', 'quiz', '진단'],
  ['/lab', 'lab', '첨삭'],
  ['/plan', 'plan', '플랜'],
  ['/apply', 'chat', '상담'],
];

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
  // /result belongs to the diagnosis flow; /courses to nothing in the bar.
  const owner = root === '/result' ? '/quiz' : root;

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

/* ───────────────────────────── 3D field ───────────────────────────── */

let scene: Scene | null = null;
const canvas = qs<HTMLCanvasElement>('#scene');

if (canvas) {
  try {
    scene = new Scene(canvas, 'glyph');
    scene.intro();
    scene.start();
  } catch (err) {
    // No WebGL: the app is fully usable without it, so just drop the layer.
    console.warn('[수] 3D layer unavailable.', err);
    qs('#backdrop')?.remove();
    scene = null;
  }
}

/* ─────────────────────── per-frame chrome updates ─────────────────── */

const topbar = qs('#topbar');
const topProgress = qs('#topProgress');

let ticking = false;

function onScroll(): void {
  if (ticking) return;
  ticking = true;

  requestAnimationFrame(() => {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 40 ? Math.min(1, y / max) : 0;

    topbar?.classList.toggle('is-scrolled', y > 6);
    if (topProgress) topProgress.style.width = `${p * 100}%`;
    scene?.setScroll(p);
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
  if (meta && scene) scene.morphTo(meta.shape);

  // A fresh view resets the reading progress.
  if (topProgress) topProgress.style.width = '0%';
  topbar?.classList.remove('is-scrolled');
});

router.start();

/* ────────────────────────────── boot out ──────────────────────────── */

function bootDone(): void {
  qs('#boot')?.classList.add('is-done');
}

if (document.readyState === 'complete') window.setTimeout(bootDone, 260);
else window.addEventListener('load', () => window.setTimeout(bootDone, 260), { once: true });

// Never trap someone behind the splash if an asset stalls.
window.setTimeout(bootDone, 3500);

if (import.meta.env.DEV) {
  import.meta.hot?.dispose(() => scene?.dispose());
}
