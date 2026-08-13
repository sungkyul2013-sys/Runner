import type { ScrollState } from './scroll';

/**
 * Nav bar, mobile sheet, in-page anchors, scroll progress bar and the
 * iOS-style bottom dock. All the chrome that reacts to scrolling.
 */
export function initNav(): (s: ScrollState) => void {
  const nav = document.getElementById('nav') as HTMLElement;
  const burger = document.getElementById('burger') as HTMLButtonElement;
  const sheet = document.getElementById('sheet') as HTMLElement;
  const dock = document.getElementById('dock') as HTMLElement;
  const bar = document.getElementById('progressFill') as HTMLElement;

  const chapters = document.getElementById('chapters');

  // The top bar and the margin index track the same sections.
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('.nav__links a[href^="#"], .chapters a[href^="#"]'),
  );
  const sections = links
    .map((a) => document.querySelector<HTMLElement>(a.getAttribute('href') as string))
    .map((el, i) => (el ? { el, link: links[i] } : null))
    .filter((v): v is { el: HTMLElement; link: HTMLAnchorElement } => v !== null);

  const lightSections = Array.from(document.querySelectorAll<HTMLElement>('.section--light'));
  // The pinned horizontal chapter scrolls cards clear across the page, right
  // under the margin index — so the index steps out of the way while it runs.
  const pinned = document.querySelector<HTMLElement>('.rail');

  /* ── mobile sheet ─────────────────────────────────────────────────── */

  const setSheet = (open: boolean): void => {
    sheet.classList.toggle('is-open', open);
    sheet.setAttribute('aria-hidden', String(!open));
    burger.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    document.body.classList.toggle('is-locked', open);

    if (open) {
      // Stagger the menu rows in.
      sheet.querySelectorAll<HTMLElement>('.sheet__nav a').forEach((a, i) => {
        a.style.animationDelay = `${60 + i * 45}ms`;
      });
    }
  };

  burger.addEventListener('click', () => setSheet(!sheet.classList.contains('is-open')));
  sheet.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) setSheet(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.classList.contains('is-open')) setSheet(false);
  });

  /* ── anchors (respect the fixed header) ───────────────────────────── */

  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector<HTMLElement>(id);
      if (!target) return;

      e.preventDefault();
      setSheet(false);

      const offset = nav.offsetHeight + 14;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
      history.replaceState(null, '', id);
    });
  });

  /* ── per-frame state ──────────────────────────────────────────────── */

  let lastY = 0;

  return ({ y, progress }: ScrollState) => {
    bar.style.width = `${progress * 100}%`;

    nav.classList.toggle('is-stuck', y > 12);

    // Auto-hide going down, reveal going up — but never while the menu is open.
    const goingDown = y > lastY + 2;
    const goingUp = y < lastY - 2;
    if (!sheet.classList.contains('is-open')) {
      if (goingDown && y > 480) nav.classList.add('is-hidden');
      else if (goingUp || y < 200) nav.classList.remove('is-hidden');
    }

    dock.classList.toggle('is-up', y > 420);

    // Flip the bar to its light treatment while a paper section is under it.
    const band = nav.offsetHeight * 0.6;
    let onLight = false;
    for (const s of lightSections) {
      const r = s.getBoundingClientRect();
      if (r.top <= band && r.bottom >= band) {
        onLight = true;
        break;
      }
    }
    nav.classList.toggle('is-light', onLight);

    // The margin index inverts against whatever chapter it is sitting on.
    if (chapters) {
      const mid = window.innerHeight / 2;
      let railOnLight = false;
      for (const sec of lightSections) {
        const r = sec.getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid) {
          railOnLight = true;
          break;
        }
      }
      chapters.classList.toggle('is-light', railOnLight);

      if (pinned) {
        const r = pinned.getBoundingClientRect();
        chapters.classList.toggle('is-away', r.top <= 0 && r.bottom >= window.innerHeight);
      }
    }

    // Active = whichever section owns the top third of the screen. Both link
    // sets point at the same targets, so mark every link for that href.
    const line = window.innerHeight * 0.34;
    let activeHref = '';
    for (const { el, link } of sections) {
      const r = el.getBoundingClientRect();
      if (r.top <= line && r.bottom > line) activeHref = link.getAttribute('href') ?? '';
    }
    for (const l of links) {
      l.classList.toggle('is-active', activeHref !== '' && l.getAttribute('href') === activeHref);
    }

    lastY = y;
  };
}
