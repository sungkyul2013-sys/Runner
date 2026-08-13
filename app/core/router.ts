import { mount, qs } from './dom';

/**
 * Hash routing, so the app works unchanged from a static host, a sub-path,
 * or a local file. Routes may carry a single `:param` segment.
 */

export interface RouteContext {
  path: string;
  param: string;
  /** true when the user arrived via back/forward or a back button */
  back: boolean;
}

export interface Route {
  /** e.g. "/", "/quiz", "/course/:id" */
  pattern: string;
  title: string;
  /** Shown in the top bar instead of the brand, with a back arrow. */
  nested?: boolean;
  view: (ctx: RouteContext) => HTMLElement;
}

type Hook = (route: Route, ctx: RouteContext) => void;

export class Router {
  private routes: Route[] = [];
  private hooks: Hook[] = [];
  private host: HTMLElement;
  private depth = 0;
  private current = '';

  constructor(hostSelector: string) {
    const host = qs(hostSelector);
    if (!host) throw new Error(`router host ${hostSelector} not found`);
    this.host = host;
  }

  add(route: Route): this {
    this.routes.push(route);
    return this;
  }

  onNavigate(fn: Hook): this {
    this.hooks.push(fn);
    return this;
  }

  start(): void {
    window.addEventListener('hashchange', () => this.render());
    this.render();
  }

  /** Programmatic navigation. */
  go(path: string): void {
    if (path === this.currentPath()) return;
    location.hash = `#${path}`;
  }

  back(): void {
    if (this.depth > 0) history.back();
    else this.go('/');
  }

  currentPath(): string {
    const raw = location.hash.replace(/^#/, '');
    return raw === '' ? '/' : raw;
  }

  private match(path: string): { route: Route; param: string } | null {
    for (const route of this.routes) {
      const pattern = route.pattern.split('/').filter(Boolean);
      const actual = path.split('/').filter(Boolean);
      if (pattern.length !== actual.length) continue;

      let param = '';
      let ok = true;
      for (let i = 0; i < pattern.length; i += 1) {
        if (pattern[i].startsWith(':')) param = decodeURIComponent(actual[i]);
        else if (pattern[i] !== actual[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { route, param };
    }
    return null;
  }

  private render(): void {
    const path = this.currentPath();
    const hit = this.match(path) ?? this.match('/');
    if (!hit) return;

    // Direction: going to a route we have seen shallower reads as "back".
    const wasNested = this.current.split('/').length;
    const isNested = path.split('/').length;
    const back = isNested < wasNested;

    this.current = path;
    this.depth += 1;

    const ctx: RouteContext = { path, param: hit.param, back };
    const el = hit.route.view(ctx);
    el.classList.add('view', back ? 'view--in-back' : 'view--in');

    mount(this.host, el);
    // A new page starts at the top — every native app does this.
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

    document.title = `${hit.route.title} · 수 국어논술`;
    for (const fn of this.hooks) fn(hit.route, ctx);
  }
}
