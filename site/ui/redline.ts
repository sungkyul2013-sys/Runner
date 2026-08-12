/**
 * 첨삭 — the correction chapter.
 *
 * The marks are not decoration: each one is anchored to the phrase it
 * criticises, and they draw in sequence so the reader watches a page being
 * marked up rather than arriving at a finished graphic. The segmented control
 * swaps the student's draft for the rewrite that came out of those marks.
 */
export function initRedline(): void {
  const section = document.getElementById('redline');
  const sheet = document.getElementById('sheet-paper');
  const seg = document.getElementById('seg');
  if (!section || !sheet || !seg) return;

  const tabs = Array.from(seg.querySelectorAll<HTMLButtonElement>('button'));
  const panes = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls') ?? ''));

  /* ── draw the marks once the sheet is properly on screen ──────────── */

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced || !('IntersectionObserver' in window)) {
    sheet.classList.add('is-marked');
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          sheet.classList.add('is-marked');
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(sheet);
  }

  /* ── 학생 원문 ⇄ 다시 쓴 글 ───────────────────────────────────────── */

  let active = 0;

  const show = (next: number): void => {
    if (next === active) return;

    const from = panes[active];
    const to = panes[next];
    active = next;

    seg.classList.toggle('is-after', next === 1);
    tabs.forEach((t, i) => t.setAttribute('aria-selected', String(i === next)));

    if (!from || !to) return;

    // Hold the sheet's height so the swap doesn't jolt the page.
    const h = sheet.getBoundingClientRect().height;
    sheet.style.minHeight = `${h}px`;

    from.classList.add('pane--out');
    window.setTimeout(() => {
      from.hidden = true;
      from.classList.remove('pane--out');

      to.hidden = false;
      to.classList.add('pane--out');
      // Next frame, so the browser sees the starting state before easing off it.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          to.classList.remove('pane--out');
          sheet.style.minHeight = '';
        });
      });
    }, reduced ? 0 : 240);
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => show(i));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      tabs[next].focus();
      show(next);
    });
  });
}
