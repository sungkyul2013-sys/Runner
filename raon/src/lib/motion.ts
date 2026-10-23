// 화면 움직임을 한곳에서 다룬다: 화면 전환(View Transitions), 숫자 올라가기, 포인터 기울기.
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

/** 0 에서 목표값까지 부드럽게 올라가는 숫자 */
export function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(reducedMotion() ? target : 0);
  const from = useRef(0);
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

/** 마지막으로 누른 화면 위치. 시트가 그 자리에서 펼쳐지도록 쓴다. */
export const lastPointer = { x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0, y: 0 };

let installed = false;
/** 앱 전체에 한 번만 거는 포인터 처리: [data-tilt] 카드 기울기, 누른 위치 기억 */
export function installPointerEffects() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener(
    'pointerdown',
    (e) => {
      lastPointer.x = e.clientX;
      lastPointer.y = e.clientY;
    },
    { passive: true, capture: true },
  );
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let current: HTMLElement | null = null;
  window.addEventListener(
    'pointermove',
    (e) => {
      if (!fine.matches || reducedMotion()) return;
      const el = (e.target as HTMLElement | null)?.closest?.('[data-tilt]') as HTMLElement | null;
      if (current && current !== el) {
        current.style.setProperty('--rx', '0deg');
        current.style.setProperty('--ry', '0deg');
        current.style.setProperty('--gx', '50%');
        current.style.setProperty('--gy', '50%');
        current.classList.remove('is-tilting');
      }
      current = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      const max = Number(el.dataset.tilt) || 6;
      el.classList.add('is-tilting');
      el.style.setProperty('--ry', `${(x * max).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${(-y * max).toFixed(2)}deg`);
      el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
    },
    { passive: true },
  );
}

/** 처음 그려질 때만 차례로 떠오르게 하는 인덱스 스타일 */
export const rise = (i: number) => ({ ['--i' as string]: Math.min(i, 12) });
