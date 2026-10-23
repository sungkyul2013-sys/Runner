// 날짜는 모두 'YYYY-MM-DD' 문자열, 시각은 'HH:MM' 문자열로 다룬다.
// 내부 계산은 UTC 자정 기준 Date로 처리해서 시간대 영향을 받지 않게 한다.

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

export function toDate(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function fromDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function ymd(y: number, m: number, d: number): string {
  return fromDate(new Date(Date.UTC(y, m - 1, d)));
}

export function addDays(d: string, n: number): string {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromDate(x);
}

export function addMonths(d: string, n: number): string {
  const x = toDate(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return fromDate(x);
}

export function weekday(d: string): number {
  return toDate(d).getUTCDay();
}

export function diffDays(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function startOfWeek(d: string): string {
  return addDays(d, -weekday(d));
}

export function startOfMonth(d: string): string {
  return d.slice(0, 8) + '01';
}

export function endOfMonth(d: string): string {
  return addDays(addMonths(startOfMonth(d), 1), -1);
}

/** 일요일 시작 6주(42칸) 달력 */
export function monthGrid(month: string): string[] {
  const first = startOfWeek(startOfMonth(month));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function todayIn(timeZone = 'Asia/Seoul', now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function nowTimeIn(timeZone = 'Asia/Seoul', now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

export function isDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromDate(toDate(s)) === s;
}

export function isTime(s: unknown): s is string {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

// ── 표시용 ──────────────────────────────────────────────

export function md(d: string): string {
  const x = toDate(d);
  return `${x.getUTCMonth() + 1}월 ${x.getUTCDate()}일`;
}

export function mdw(d: string): string {
  return `${md(d)} ${WEEKDAYS[weekday(d)]}요일`;
}

/** 10.23 (금) */
export function dotDate(d: string, withWeekday = true): string {
  const x = toDate(d);
  const base = `${x.getUTCMonth() + 1}.${x.getUTCDate()}`;
  return withWeekday ? `${base} (${WEEKDAYS[weekday(d)]})` : base;
}

export function fullDate(d: string): string {
  const x = toDate(d);
  return `${x.getUTCFullYear()}년 ${mdw(d)}`;
}

/** 19:00 → 오후 7:00 */
export function koTime(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? '오전' : '오후';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${ap} ${hh}:${pad(m)}`;
}

export function timeRange(start: string | null, end: string | null): string {
  if (!start) return '종일';
  if (!end) return koTime(start);
  const [sh] = start.split(':').map(Number);
  const [eh] = end.split(':').map(Number);
  // 같은 오전/오후면 뒤쪽은 숫자만
  if ((sh < 12) === (eh < 12)) {
    const [h, m] = end.split(':').map(Number);
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${koTime(start)} – ${hh}:${pad(m)}`;
  }
  return `${koTime(start)} – ${koTime(end)}`;
}

export function relativeDay(d: string, today: string): string {
  const n = diffDays(today, d);
  if (n === 0) return '오늘';
  if (n === 1) return '내일';
  if (n === 2) return '모레';
  if (n === -1) return '어제';
  if (n > 0 && n < 7) return `${n}일 뒤`;
  if (n < 0 && n > -7) return `${-n}일 전`;
  return dotDate(d);
}

export function minutesBetween(start: string, end: string): number {
  const [a, b] = start.split(':').map(Number);
  const [c, d] = end.split(':').map(Number);
  return c * 60 + d - (a * 60 + b);
}
