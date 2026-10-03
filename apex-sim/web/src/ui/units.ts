// SI → display conversion lives only here (§1.3: 표시 단위 변환은 UI에서만). Full unit switching is M5 (§18.6).
export function formatEnergy(joules: number): string {
  const a = Math.abs(joules);
  if (a >= 1e6) return `${(joules / 1e6).toFixed(2)} MJ`;
  if (a >= 1e3) return `${(joules / 1e3).toFixed(2)} kJ`;
  return `${joules.toFixed(1)} J`;
}

export function formatSeconds(s: number): string {
  if (s < 60) return `${s.toFixed(2)} s`;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

export function formatMs(ms: number, digits = 2): string {
  return `${ms.toFixed(digits)} ms`;
}

export function formatPercent(fraction: number, digits = 2): string {
  return `${(fraction * 100).toFixed(digits)} %`;
}

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** m/s → km/h */
export function speedKmh(metresPerSecond: number): number {
  return metresPerSecond * 3.6;
}
