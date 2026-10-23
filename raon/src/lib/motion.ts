// 화면 움직임을 한곳에서 다룬다. 짧고 빠르게, 그러나 끊기지 않게.
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
  }, 700);
}
