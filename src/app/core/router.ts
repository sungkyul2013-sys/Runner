/**
 * Hash router. Routes look like `#/practice?domain=grammar&level=2`.
 *
 * Views are plain functions that return an element plus optional lifecycle
 * hooks, so a view can start a timer or a 3D scene and clean it up on exit.
 */

export interface ViewHandle {
  el: HTMLElement;
  /** Called after the element is in the document. */
  mounted?: () => void;
  /** Called just before the element is torn down. */
  destroy?: () => void;
  /** Optional per-view title suffix. */
  title?: string;
}

export type ViewFactory = (params: URLSearchParams) => ViewHandle;

export interface RouteChange {
  path: string;
  params: URLSearchParams;
}

const routes = new Map<string, ViewFactory>();
const changeListeners = new Set<(c: RouteChange) => void>();

let outlet: HTMLElement | null = null;
let current: ViewHandle | null = null;
let fallback: ViewFactory | null = null;

export function register(path: string, factory: ViewFactory): void {
  routes.set(path, factory);
}

export function setFallback(factory: ViewFactory): void {
  fallback = factory;
}

export function onRouteChange(fn: (c: RouteChange) => void): void {
  changeListeners.add(fn);
}

export function parseHash(hash: string): RouteChange {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { path: path || 'home', params: new URLSearchParams(query) };
}

export function currentRoute(): RouteChange {
  return parseHash(location.hash);
}

export function go(path: string, params?: Record<string, string | number | undefined>): void {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const q = qs.toString();
  location.hash = `#/${path}${q ? `?${q}` : ''}`;
}

/** Replace the hash without pushing a history entry. */
export function replace(path: string, params?: Record<string, string | number | undefined>): void {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const q = qs.toString();
  history.replaceState(null, '', `#/${path}${q ? `?${q}` : ''}`);
}

function render(): void {
  if (!outlet) return;
  const { path, params } = currentRoute();
  const factory = routes.get(path) ?? fallback;
  if (!factory) return;

  current?.destroy?.();
  current = null;
  while (outlet.firstChild) outlet.removeChild(outlet.firstChild);

  const handle = factory(params);
  current = handle;
  handle.el.classList.add('view-enter');
  outlet.appendChild(handle.el);
  // Force a frame so the enter transition actually plays.
  void handle.el.offsetHeight;
  handle.el.classList.add('view-enter-active');
  handle.mounted?.();

  document.title = handle.title ? `${handle.title} · 수 국어논술` : '수 국어논술 · 국어의 감각을 설계하다';
  for (const l of changeListeners) l({ path, params });

  // A fresh view always starts at the top unless it opted out.
  if (!handle.el.hasAttribute('data-keep-scroll')) {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }
}

export function start(mount: HTMLElement): void {
  outlet = mount;
  window.addEventListener('hashchange', render);
  if (!location.hash) replace('home');
  render();
}

/** Re-run the current route (used after a data reset). */
export function refresh(): void {
  render();
}
