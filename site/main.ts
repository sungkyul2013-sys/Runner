import './styles.css';

import { Scene } from './three/Scene';
import type { ShapeName } from './three/shapes';
import { initForm, initFaq } from './ui/form';
import {
  initCounters,
  initMagnetic,
  initReveals,
  initSpotlight,
  initSplitText,
  initTilt,
  initWordWash,
} from './ui/motion';
import { initNav } from './ui/nav';
import { initRedline } from './ui/redline';
import { initMarquee, initRail } from './ui/rail';
import { Scroller, type ScrollState } from './ui/scroll';

document.documentElement.classList.add('js');

/* ─────────────────────────── loading screen ───────────────────────────── */

const loader = document.getElementById('loader');
const loaderFill = document.getElementById('loaderFill');

let fake = 0;
const fakeTimer = window.setInterval(() => {
  fake = Math.min(0.9, fake + 0.06 + Math.random() * 0.08);
  if (loaderFill) loaderFill.style.width = `${fake * 100}%`;
}, 120);

function finishLoading(): void {
  window.clearInterval(fakeTimer);
  if (loaderFill) loaderFill.style.width = '100%';
  window.setTimeout(() => loader?.classList.add('is-done'), 320);
}

/* ──────────────────────────── 3D backdrop ─────────────────────────────── */

const canvas = document.getElementById('scene') as HTMLCanvasElement | null;

/**
 * Drives the particle field from the page: each `[data-scene]` section owns a
 * shape, and the canvas stops rendering entirely while only solid sections are
 * on screen — nothing to see there, no reason to burn a GPU.
 */
function initSceneDirector(scene: Scene): (s: ScrollState) => void {
  const scenes = Array.from(document.querySelectorAll<HTMLElement>('[data-scene]')).map((el) => ({
    el,
    name: el.dataset.scene as ShapeName,
  }));
  const voids = Array.from(document.querySelectorAll<HTMLElement>('[data-void]'));

  let current = scenes[0]?.name;
  let awake = true;

  return ({ vh, progress, v }: ScrollState) => {
    // Pause rendering when no transparent section is on screen.
    const onScreen = voids.some((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > -80 && r.top < vh + 80;
    });

    if (onScreen !== awake) {
      awake = onScreen;
      if (awake) scene.start();
      else scene.stop();
    }
    if (!awake) return;

    scene.setScroll(progress);
    scene.setVelocity(v);

    // Whichever scene section covers the most of the viewport wins.
    let best = '';
    let bestArea = 0;
    for (const s of scenes) {
      const r = s.el.getBoundingClientRect();
      const area = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (area > bestArea) {
        bestArea = area;
        best = s.name;
      }
    }

    if (best && best !== current) {
      current = best as ShapeName;
      scene.morphTo(current);
    }
  };
}

/* ──────────────────────────────── boot ────────────────────────────────── */

const scroller = new Scroller();

scroller.on(initNav());

const wordWash = initWordWash();
if (wordWash) scroller.on(wordWash);

const rail = initRail();
if (rail) scroller.on(rail);

const marquee = initMarquee();
if (marquee) scroller.on(marquee);

initSplitText();
initReveals();
initCounters();
initTilt();
initMagnetic();
initSpotlight();
initRedline();
initForm();
initFaq();

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

let scene: Scene | null = null;
if (canvas) {
  try {
    scene = new Scene(canvas, 'glyph');
    scene.intro();
    scene.start();
    scroller.on(initSceneDirector(scene));
  } catch (err) {
    // No WebGL (or it was blocked) — the CSS gradient backdrop carries the page.
    console.warn('[수] 3D backdrop unavailable, falling back to gradient.', err);
    document.getElementById('stage')?.classList.add('is-flat');
    scene = null;
  }
}

scroller.start();

if (document.readyState === 'complete') finishLoading();
else window.addEventListener('load', finishLoading, { once: true });

// Belt and braces: never let a stalled asset trap the visitor behind the loader.
window.setTimeout(finishLoading, 4000);

if (import.meta.env.DEV) {
  import.meta.hot?.dispose(() => {
    scene?.dispose();
    scroller.stop();
  });
}
