// 화면 움직임을 한곳에서 다룬다. 통통 튀되 짧게, 끊기지 않게.
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

const reducedMq = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reducedMotion = () => !!reducedMq?.matches;

type Doc = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void>; ready: Promise<void> };
};

/**
 * 상태 변화를 화면 전환으로 감싼다. kind 는 CSS 에서 html[data-vt="..."] 로 방향을 고를 때 쓴다.
 * 지원하지 않는 브라우저에서는 그냥 바로 바뀐다.
 */
export function vt(update: () => void, kind?: string) {
  const d = document as Doc;
  if (!d.startViewTransition || reducedMotion()) {
    update();
    return;
  }
  const root = document.documentElement;
  if (kind) root.dataset.vt = kind;
  const t = d.startViewTransition(() => flushSync(update));
  t.finished.finally(() => {
    if (root.dataset.vt === kind) delete root.dataset.vt;
  });
}

let clearTimer = 0;
/**
 * 링크로 화면이 바뀔 때(라우터가 전환을 시작할 때) 쓸 방향을 미리 적어 둔다.
 * push: 안으로 들어가기, pop: 밖으로 나오기
 */
export function markVt(kind: 'push' | 'pop') {
  const root = document.documentElement;
  root.dataset.vt = kind;
  clearTimeout(clearTimer);
  clearTimer = window.setTimeout(() => {
    if (root.dataset.vt === kind) delete root.dataset.vt;
  }, 800);
}

/** 0 에서 목표값까지 올라가는 숫자 */
export function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(() => (reducedMotion() ? target : 0));
  const from = useRef(reducedMotion() ? target : 0);
  useEffect(() => {
    if (reducedMotion()) {
      setV(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 4);
      setV(Math.round(a + (target - a) * e));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

let installed = false;
/**
 * 앱 전체에 한 번만 거는 포인터 처리: [data-tilt] 카드가 포인터 쪽으로 살짝 기운다.
 * 손을 떼면 용수철처럼 제자리로 돌아온다 (CSS 의 .tilt-release 전환).
 */
export function installTilt() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let current: HTMLElement | null = null;
  const release = (el: HTMLElement) => {
    el.classList.add('tilt-release');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    window.setTimeout(() => el.classList.remove('tilt-release'), 700);
  };
  window.addEventListener(
    'pointermove',
    (e) => {
      if (!fine.matches || reducedMotion()) return;
      const el = (e.target as HTMLElement | null)?.closest?.('[data-tilt]') as HTMLElement | null;
      if (current && current !== el) release(current);
      current = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      const max = Number(el.dataset.tilt) || 4;
      el.classList.remove('tilt-release');
      el.style.setProperty('--ry', `${(x * max).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${(-y * max).toFixed(2)}deg`);
      el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => current && release(current));
}

/** 화면에 들어올 때 .is-in 을 붙인다 (소개 화면의 3D 떠오르기). 한 번 들어오면 그대로 둔다. */
export function useReveal<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion() || !('IntersectionObserver' in window)) {
      el.classList.add('is-in');
      return;
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((x) => {
          if (x.isIntersecting) {
            el.classList.add('is-in');
            io.disconnect();
          }
        }),
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}
