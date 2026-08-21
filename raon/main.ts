import './styles.css';

import { Scene } from '../shared/three/Scene';
import type { ShapeName } from '../shared/three/shapes';
import { initForm } from './ui/form';
import {
  initBar,
  initCounters,
  initFlow,
  initMagnetic,
  initMarquee,
  initReveals,
  initSplit,
  initTilt,
} from './ui/motion';
import { Scroller, type ScrollState } from './ui/scroll';

/**
 * 라온국어 — 홍보 사이트.
 *
 * 수 국어논술 앱과 3D 엔진은 함께 쓰지만, 브랜드 글자만 갈아 끼웁니다:
 * 블록이 쌓아 올리는 마크는 '라온', 그 아래 빛으로 적히는 말은 '즐거운'.
 * 이름의 뜻을 3D가 그대로 옮겨 적는 셈입니다.
 */

/* ───────────────────────────── 로딩 ─────────────────────────────── */

const load = document.getElementById('load');
const loadFill = document.getElementById('loadFill');

let at = 0;
const bump = (to: number): void => {
  at = Math.max(at, Math.min(1, to));
  if (loadFill) loadFill.style.width = `${at * 100}%`;
};

function loaded(): void {
  bump(1);
  window.setTimeout(() => load?.classList.add('is-done'), 300);
}

bump(0.35);

/* ──────────────────────────── 3D 무대 ───────────────────────────── */

const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
const stage = document.getElementById('stage');

let scene: Scene | null = null;

if (canvas) {
  try {
    scene = new Scene(canvas, 'glyph', { mark: '라온', word: '즐거운' });
    scene.setTheme(false); // 종이 위에 먹으로: 밝은 바탕에서는 가산 혼합이 사라집니다.
    scene.intro();
    scene.start();
    bump(0.7);
  } catch (err) {
    // WebGL이 없으면 레이어만 접습니다. 페이지는 그대로 읽힙니다.
    console.warn('[라온] 3D 레이어를 쓸 수 없어 그라데이션으로 대신합니다.', err);
    stage?.classList.add('is-flat');
    scene = null;
  }
}

/**
 * 섹션마다 형태를 하나씩 맡습니다. 화면을 가장 많이 덮은 섹션이 이기므로
 * 두 섹션이 매 프레임 서로 다른 형태를 주장하는 일이 없습니다.
 */
function director(s: Scene): (state: ScrollState) => void {
  const owners = Array.from(document.querySelectorAll<HTMLElement>('[data-scene]')).map((el) => ({
    el,
    name: el.dataset.scene as ShapeName,
  }));
  const voids = Array.from(document.querySelectorAll<HTMLElement>('[data-void]'));
  const hero = document.getElementById('heroStage');
  const root = document.documentElement;

  if (hero) s.setFocusEl(hero);

  let current: ShapeName | null = null;
  let awake = true;

  return ({ vh, progress, v }: ScrollState) => {
    // 3D가 비치지 않는 구간에서는 렌더를 멈춥니다. 볼 것이 없으면 GPU도 쉽니다.
    const visible = voids.some((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > -100 && r.top < vh + 100;
    });
    if (visible !== awake) {
      awake = visible;
      if (awake) s.start();
      else s.stop();
    }
    if (!awake) return;

    s.setScroll(progress);
    s.setVelocity(v);

    let best: ShapeName | null = null;
    let area = 0;
    for (const o of owners) {
      const r = o.el.getBoundingClientRect();
      const seen = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (seen > area) {
        area = seen;
        best = o.name;
      }
    }
    if (best && best !== current) {
      current = best;
      s.morphTo(best);
    }

    // 캔버스 위 워시(가장자리를 종이색으로 덮는 층)의 투명한 중심을
    // 3D가 서 있는 자리로 옮깁니다. 안 그러면 로고 위에 종이를 덮습니다.
    if (hero) {
      const r = hero.getBoundingClientRect();
      const on = r.bottom > 0 && r.top < vh;

      root.style.setProperty('--wx', on ? `${((r.x + r.width / 2) / window.innerWidth) * 100}%` : '50%');
      root.style.setProperty('--wy', on ? `${((r.y + r.height / 2) / vh) * 100}%` : '38%');

      // 히어로에서는 로고가 온전히 보이도록 종이를 걷고, 그 아래 본문
      // 구간에서는 다시 덮습니다 — 글자 위에 형상이 겹치면 못 읽습니다.
      root.style.setProperty('--stage-a', on ? '0.92' : '0.62');
      root.style.setProperty('--veil-a', on ? '0' : '0.74');
    }
  };
}

/* ───────────────────────────── 시작 ─────────────────────────────── */

const scroller = new Scroller();

scroller.on(initBar());

const flow = initFlow();
if (flow) scroller.on(flow);

const marquee = initMarquee();
if (marquee) scroller.on(marquee);

if (scene) scroller.on(director(scene));

initSplit();
initReveals();
initCounters();
initTilt();
initMagnetic();
initForm();

const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

scroller.start();

if (document.readyState === 'complete') loaded();
else window.addEventListener('load', loaded, { once: true });

// 자산 하나가 멈춰도 방문자를 로딩 화면에 가두지 않습니다.
window.setTimeout(loaded, 3600);

if (import.meta.env.DEV) {
  // 개발 중에만 열어 두는 손잡이입니다. 배포 번들에는 남지 않습니다.
  (window as unknown as { __raon?: unknown }).__raon = { scene, scroller };

  import.meta.hot?.dispose(() => {
    scene?.dispose();
    scroller.stop();
  });
}
