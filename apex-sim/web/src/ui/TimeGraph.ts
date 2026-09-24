// Real-time line graph (§5.3 디버그 패널: 에너지·운동량 그래프, §12.8 텔레메트리 패널의 기초): named series over
// simulated time in a scrolling window, auto-scaled, drawn on a 2D canvas at the display's pixel ratio.
export interface Series {
  label: string;
  color: string;
}

export class TimeGraph {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private t: number[] = [];
  private values: number[][];
  private dirty = true;

  /** @param window [s] of simulated time shown @param unit axis unit label */
  constructor(title: string, private readonly series: Series[], private readonly unit: string, private readonly window = 6) {
    this.values = series.map(() => []);
    this.root = document.createElement('figure');
    this.root.className = 'graph';
    const caption = document.createElement('figcaption');
    const name = document.createElement('b');
    name.textContent = title;
    caption.append(name);
    for (const s of series) {
      const key = document.createElement('span');
      key.style.setProperty('--c', s.color);
      key.textContent = s.label;
      caption.append(key);
    }
    this.canvas = document.createElement('canvas');
    this.root.append(caption, this.canvas);
  }

  clear(): void {
    this.t = [];
    this.values = this.series.map(() => []);
    this.dirty = true;
  }

  /** Adds a sample at simulated time `time` [s] (earlier than the last: the history restarts). */
  push(time: number, values: number[]): void {
    const last = this.t.length ? this.t[this.t.length - 1] : -Infinity;
    if (time < last) this.clear();
    else if (time === last) return;
    this.t.push(time);
    values.forEach((v, i) => this.values[i].push(v));
    const keepFrom = this.t.findIndex((x) => x >= time - this.window);
    if (keepFrom > 0) {
      this.t.splice(0, keepFrom);
      for (const v of this.values) v.splice(0, keepFrom);
    }
    this.dirty = true;
  }

  get samples(): number {
    return this.t.length;
  }

  /** Latest value of series `i` (tests). */
  latest(i: number): number {
    const v = this.values[i];
    return v.length ? v[v.length - 1] : NaN;
  }

  draw(): void {
    if (!this.dirty || this.root.offsetParent === null) return;
    this.dirty = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const g = this.canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (this.t.length < 2) return;
    let lo = Infinity, hi = -Infinity;
    for (const v of this.values) for (const x of v) if (Number.isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    if (!Number.isFinite(lo)) return;
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
    const pad = (hi - lo) * 0.08 || 1;
    lo -= pad;
    hi += pad;
    const left = 44, right = 6, top = 6, bottom = 16;
    const t1 = this.t[this.t.length - 1], t0 = Math.max(this.t[0], t1 - this.window);
    const X = (t: number) => left + ((t - t0) / Math.max(t1 - t0, 1e-6)) * (w - left - right);
    const Y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (h - top - bottom);
    const style = getComputedStyle(this.root);
    g.font = `11px ${style.getPropertyValue('--font-num') || 'monospace'}`;
    g.fillStyle = style.getPropertyValue('--text-3') || '#5e6673';
    g.strokeStyle = style.getPropertyValue('--border') || 'rgba(255,255,255,0.08)';
    g.lineWidth = 1;
    const labelled: number[] = [];
    for (const v of [0, hi - pad, lo + pad]) {
      const y = Y(v);
      if (labelled.some((l) => Math.abs(l - y) < 12)) continue; // the extremes may sit on the zero line
      labelled.push(y);
      g.beginPath();
      g.moveTo(left, y);
      g.lineTo(w - right, y);
      g.stroke();
      g.fillText(`${formatValue(v)}`, 2, y + 4);
    }
    g.fillText(`${this.unit} · ${t1.toFixed(2)} s`, w - right - 90, h - 3);
    this.series.forEach((s, i) => {
      g.strokeStyle = s.color;
      g.lineWidth = 1.5;
      g.beginPath();
      this.values[i].forEach((v, k) => (k === 0 ? g.moveTo(X(this.t[k]), Y(v)) : g.lineTo(X(this.t[k]), Y(v))));
      g.stroke();
    });
  }
}

function formatValue(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
