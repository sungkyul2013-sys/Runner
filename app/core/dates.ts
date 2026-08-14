/**
 * Calendar helpers.
 *
 * Everything here works in the *viewer's local calendar*. `toISOString()`
 * is deliberately avoided: it converts to UTC first, so for anyone east of
 * Greenwich — Seoul included — an evening study session would be filed
 * under yesterday.
 */

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in local time. */
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses `YYYY-MM-DD` as a local midnight, never as UTC. */
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export const todayISO = (): string => toISO(new Date());

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Whole days from `a` to `b`; negative when `b` is in the past. */
export function daysBetween(a: string, b: string): number {
  const ms = fromISO(b).getTime() - fromISO(a).getTime();
  return Math.round(ms / 86400000);
}

/** Monday-based week key, used to group sessions into "이번 주". */
export function weekStart(iso: string): string {
  const d = fromISO(iso);
  const back = (d.getDay() + 6) % 7;
  return addDays(iso, -back);
}

/**
 * Six weeks of dates covering `month`, Sunday first — the shape every
 * phone calendar uses, so the grid never changes height between months.
 */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toISO(d);
  });
}

export const monthLabel = (year: number, month: number): string =>
  `${year}년 ${month + 1}월`;

/** `8월 14일 (금)` — the form used in day headers. */
export function dayLabel(iso: string): string {
  const d = fromISO(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

/** 오늘 / 내일 / 어제 where it helps, a day count where it does not. */
export function relativeDay(iso: string, from: string = todayISO()): string {
  const diff = daysBetween(from, iso);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === -1) return '어제';
  return diff > 0 ? `${diff}일 뒤` : `${-diff}일 전`;
}
