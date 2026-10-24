import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { CalSession } from '../../shared/types';
import { EVENT_LABEL } from '../../shared/types';
import { WEEKDAYS, addDays, dotDate, md, mdw, monthGrid, nowTimeIn, startOfWeek, timeRange, toDate, weekday } from '../../shared/date';
import { qs } from '../lib/api';
import { useApi, useMedia } from '../lib/hooks';
import { vt } from '../lib/motion';
import { Chevron, ExpandIcon, Segmented } from './ui';

/** 보강의 원래 수업: 10.13 (화) 수업분 */
export function originText(s: CalSession): string {
  return s.origin ? `${dotDate(s.origin.date)} 수업분` : '';
}

/** 앞에 '보강' 같은 표시가 붙으니 제목 끝의 같은 말은 뺀다: '고2 문학·독서 보강' → '고2 문학·독서' */
export function displayTitle(s: CalSession): string {
  const label = EVENT_LABEL[s.kind];
  return s.kind !== 'class' && s.title.endsWith(' ' + label) ? s.title.slice(0, -label.length - 1) : s.title;
}

export function kindTone(s: CalSession): string {
  if (s.cancelled) return 'cancel';
  return s.kind;
}

export function KindMark({ s }: { s: CalSession }) {
  if (s.cancelled) return <span className="kind kind-cancel">{s.cancelReason || '휴강'}</span>;
  if (s.kind === 'class') return null;
  return <span className={`kind kind-${s.kind}`}>{EVENT_LABEL[s.kind]}</span>;
}

/** 일정 한 줄: 시간 · 제목 · 메모 (묶음 목록 안의 한 줄) */
export function SessionLine({
  s,
  onClick,
  aside,
  showDate,
  children,
}: {
  s: CalSession;
  onClick?: () => void;
  aside?: ReactNode;
  showDate?: boolean;
  children?: ReactNode;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`sline sline-${kindTone(s)}${onClick ? ' is-click' : ''}`} onClick={onClick}>
      <span className="sline-time">
        {showDate && <span className="sline-date">{dotDate(s.date)}</span>}
        <span className="sline-start">{s.start ?? '종일'}</span>
        {s.end && !showDate && <span className="sline-end">{s.end}</span>}
      </span>
      <span className="sline-bar" style={{ ['--c' as string]: s.color }} />
      <span className="sline-main">
        <span className="sline-title">
          <KindMark s={s} />
          <span className="t">{displayTitle(s)}</span>
        </span>
        <span className="sline-meta">{[showDate ? timeRange(s.start, s.end) : '', originText(s), s.memo].filter(Boolean).join(' · ')}</span>
        {children}
      </span>
      {aside && <span className="sline-aside">{aside}</span>}
      {onClick && <Chevron />}
    </Tag>
  );
}

/** 달력 칸 안의 한 줄. 펼친 달력은 칸이 넓으니 시각도 함께. */
function shortLabel(s: CalSession, withTime: boolean) {
  if (s.kind === 'holiday' || !withTime) return displayTitle(s);
  const t = s.start ? s.start.replace(/^0/, '') : '';
  return `${t} ${displayTitle(s)}`.trim();
}

export function shiftMonth(month: string, n: number) {
  const d = toDate(month);
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** 달 넘기기. 앞뒤로 넘길 때 달력이 옆으로 밀려난다. */
export function MonthNav({ month, onChange, today }: { month: string; onChange(m: string): void; today: string }) {
  const d = toDate(month);
  const go = (m: string) => m !== month && vt(() => onChange(m), m > month ? 'next' : 'prev');
  return (
    <div className="month-nav">
      <h2 className="month-title">
        <b>{d.getUTCMonth() + 1}월</b> <span>{d.getUTCFullYear()}</span>
      </h2>
      <div className="stepper-nav">
        <button type="button" onClick={() => go(shiftMonth(month, -1))} aria-label="이전 달">
          <Chevron dir="left" />
        </button>
        <button type="button" className="today-btn" disabled={today.slice(0, 7) === month.slice(0, 7)} onClick={() => go(today.slice(0, 8) + '01')}>
          오늘
        </button>
        <button type="button" onClick={() => go(shiftMonth(month, 1))} aria-label="다음 달">
          <Chevron dir="right" />
        </button>
      </div>
    </div>
  );
}

function groupByDate(sessions: CalSession[]) {
  const m = new Map<string, CalSession[]>();
  for (const s of sessions) {
    const list = m.get(s.date) ?? [];
    list.push(s);
    m.set(s.date, list);
  }
  return m;
}

/**
 * 한 달 달력. 넓은 화면에서는 칸 안에 일정을 적고, 좁은 화면에서는 점으로만 표시한다.
 * full 이면 하루 일정을 모두 보여 준다(펼친 달력).
 */
export function MonthCalendar({
  month,
  sessions,
  today,
  selected,
  onSelect,
  onOpen,
  onMore,
  onSwipe,
  full,
  limit = 3,
}: {
  month: string;
  sessions: CalSession[];
  today: string;
  selected: string | null;
  onSelect(date: string): void;
  onOpen?(s: CalSession): void;
  onMore?(date: string): void;
  /** 손가락으로 옆으로 밀었을 때: 1 다음 달, -1 이전 달 */
  onSwipe?(dir: 1 | -1): void;
  full?: boolean;
  limit?: number;
}) {
  const days = useMemo(() => monthGrid(month), [month]);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const byDate = useMemo(() => groupByDate(sessions), [sessions]);
  const mo = month.slice(0, 7);
  // 마지막 줄이 통째로 다음 달이면 숨긴다
  const visible = days.slice(35, 42).every((d) => d.slice(0, 7) !== mo) ? days.slice(0, 35) : days;

  return (
    <div className={'cal' + (full ? ' is-full' : '')} style={{ ['--rows' as string]: visible.length / 7 }}>
      <div className="cal-head">
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>
            {w}
          </span>
        ))}
      </div>
      <div
        className="cal-grid"
        onPointerDown={(e) => {
          if (e.pointerType === 'touch' && onSwipe) swipe.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const s0 = swipe.current;
          swipe.current = null;
          if (!s0 || !onSwipe) return;
          const dx = e.clientX - s0.x;
          const dy = e.clientY - s0.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) onSwipe(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => (swipe.current = null)}
      >
        {visible.map((d) => {
          const list = byDate.get(d) ?? [];
          const holiday = list.find((s) => s.kind === 'holiday');
          const wd = weekday(d);
          const out = d.slice(0, 7) !== mo;
          const items = list.filter((s) => s.kind !== 'holiday');
          const shown = full ? items : items.slice(0, limit);
          return (
            <div
              key={d}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(d)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(d))}
              className={['cal-day', out && 'is-out', d === today && 'is-today', d === selected && 'is-selected', holiday && 'is-holiday', wd === 0 && 'sun', wd === 6 && 'sat']
                .filter(Boolean)
                .join(' ')}
              aria-label={`${dotDate(d)} 일정 ${list.length}개`}
            >
              <span className="cal-num">{Number(d.slice(8))}</span>
              {holiday && <span className="cal-holiday">{holiday.title}</span>}
              <span className="cal-items">
                {shown.map((s) => (
                  <span
                    key={s.key}
                    className={`cal-item cal-${kindTone(s)}${onOpen ? ' is-click' : ''}`}
                    style={{ ['--c' as string]: s.color }}
                    onClick={
                      onOpen
                        ? (e) => {
                            e.stopPropagation();
                            onOpen(s);
                          }
                        : undefined
                    }
                  >
                    <i />
                    {s.kind === 'makeup' && <b>보강</b>}
                    {s.kind === 'exam' && <b>시험</b>}
                    {s.cancelled && <b>휴강</b>}
                    <span className="cal-item-t">{shortLabel(s, !!full)}</span>
                  </span>
                ))}
                {!full && items.length > limit && (
                  <span
                    className="cal-more"
                    onClick={
                      onMore
                        ? (e) => {
                            e.stopPropagation();
                            onMore(d);
                          }
                        : undefined
                    }
                  >
                    {items.length - limit}개 더 보기
                  </span>
                )}
              </span>
              <span className="cal-dots" aria-hidden="true">
                {items.slice(0, 3).map((s) => (
                  <i key={s.key} className={`cal-${kindTone(s)}`} style={{ ['--c' as string]: s.color }} />
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 이번 주 일곱 칸 띠 */
export function WeekStrip({ days, sessions, today }: { days: string[]; sessions: CalSession[]; today: string }) {
  return (
    <div className="week-strip">
      {days.map((d) => {
        const list = sessions.filter((s) => s.date === d && s.kind !== 'holiday');
        const wd = weekday(d);
        return (
          <div key={d} className={'ws-day' + (d === today ? ' is-today' : '') + (wd === 0 ? ' sun' : wd === 6 ? ' sat' : '') + (list.length ? ' has' : '')}>
            <span className="ws-w">{WEEKDAYS[wd]}</span>
            <span className="ws-n">{Number(d.slice(8))}</span>
            <span className="ws-marks">
              {list.slice(0, 3).map((s) => (
                <i key={s.key} className={`cal-${kindTone(s)}`} style={{ ['--c' as string]: s.color }} />
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── 주간 시간표 ────────────────────────────────────────

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

interface Placed {
  s: CalSession;
  top: number;
  height: number;
  col: number;
  cols: number;
}

/** 하루 안에서 겹치는 일정을 옆으로 나란히 놓는다 */
function place(list: CalSession[], minStart: number, pxPerMin: number): Placed[] {
  const timed = list.filter((s) => s.start).sort((a, b) => a.start!.localeCompare(b.start!));
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const colsEnd: number[] = [];
  const flush = () => {
    const n = Math.max(1, colsEnd.length);
    cluster.forEach((p) => (p.cols = n));
    out.push(...cluster);
    cluster = [];
    colsEnd.length = 0;
  };
  for (const s of timed) {
    const a = toMin(s.start!);
    const b = s.end ? toMin(s.end) : a + 60;
    if (cluster.length && a >= clusterEnd) flush();
    let col = colsEnd.findIndex((e) => e <= a);
    if (col < 0) {
      col = colsEnd.length;
      colsEnd.push(b);
    } else colsEnd[col] = b;
    clusterEnd = Math.max(clusterEnd, b);
    cluster.push({ s, top: (a - minStart) * pxPerMin, height: Math.max(22, (b - a) * pxPerMin - 3), col, cols: 1 });
  }
  flush();
  return out;
}

export function WeekGrid({ start, sessions, today, onOpen }: { start: string; sessions: CalSession[]; today: string; onOpen?(s: CalSession): void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const inWeek = sessions.filter((s) => s.date >= days[0] && s.date <= days[6]);
  const timed = inWeek.filter((s) => s.start);
  const minH = Math.min(9, ...timed.map((s) => Math.floor(toMin(s.start!) / 60)));
  const maxH = Math.max(22, ...timed.map((s) => Math.ceil(toMin(s.end ?? s.start!) / 60)));
  const PX = 0.95; // 1분 = 0.95px → 1시간 57px
  const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);
  const byDate = groupByDate(inWeek);
  const [now, setNow] = useState(nowTimeIn());
  useEffect(() => {
    const t = setInterval(() => setNow(nowTimeIn()), 60000);
    return () => clearInterval(t);
  }, []);
  const nowTop = (toMin(now) - minH * 60) * PX;

  return (
    <div className="wk">
      <div className="wk-head">
        <span />
        {days.map((d) => {
          const wd = weekday(d);
          const allDay = (byDate.get(d) ?? []).filter((s) => !s.start);
          return (
            <div key={d} className={'wk-day' + (d === today ? ' is-today' : '') + (wd === 0 ? ' sun' : wd === 6 ? ' sat' : '')}>
              <span className="w">{WEEKDAYS[wd]}</span>
              <span className="n">{Number(d.slice(8))}</span>
              {allDay.map((s) => (
                <button key={s.key} type="button" className={`wk-allday cal-${kindTone(s)}`} style={{ ['--c' as string]: s.color }} onClick={() => onOpen?.(s)}>
                  {s.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <div className="wk-body" style={{ height: hours.length * 60 * PX }}>
        <div className="wk-hours">
          {hours.map((h) => (
            <span key={h} style={{ top: (h - minH) * 60 * PX }}>
              {h < 12 ? `오전 ${h}시` : h === 12 ? '정오' : `오후 ${h - 12}시`}
            </span>
          ))}
        </div>
        {days.map((d) => (
          <div key={d} className={'wk-col' + (d === today ? ' is-today' : '')}>
            {hours.map((h) => (
              <i key={h} className="wk-line" style={{ top: (h - minH) * 60 * PX }} />
            ))}
            {place(byDate.get(d) ?? [], minH * 60, PX).map((p) => (
              <button
                key={p.s.key}
                type="button"
                className={`wk-ev cal-${kindTone(p.s)}`}
                style={{ ['--c' as string]: p.s.color, top: p.top, height: p.height, left: `calc(${(p.col / p.cols) * 100}% + 2px)`, width: `calc(${100 / p.cols}% - 4px)` } as CSSProperties}
                onClick={() => onOpen?.(p.s)}
              >
                <span className="wk-ev-t">
                  {p.s.kind !== 'class' && <b>{p.s.cancelled ? '휴강' : EVENT_LABEL[p.s.kind]}</b>}
                  {displayTitle(p.s)}
                </span>
                <span className="wk-ev-m">
                  {timeRange(p.s.start, p.s.end)}
                </span>
              </button>
            ))}
            {d === today && nowTop > 0 && nowTop < hours.length * 60 * PX && (
              <span className="wk-now" style={{ top: nowTop }}>
                <i />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 한 달 목록 ─────────────────────────────────────────

export function MonthAgenda({ month, sessions, today, onOpen }: { month: string; sessions: CalSession[]; today: string; onOpen?(s: CalSession): void }) {
  const inMonth = sessions.filter((s) => s.date.slice(0, 7) === month.slice(0, 7));
  const byDate = [...groupByDate(inMonth).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const box = useRef<HTMLDivElement>(null);
  const ready = byDate.length > 0;
  useEffect(() => {
    // 지난 날은 위로 넘기고, 오늘(없으면 다음 일정)부터 보이게
    const el = box.current?.querySelector<HTMLElement>('.agenda-day:not(.is-past)');
    if (el && el !== box.current?.firstElementChild) el.scrollIntoView({ block: 'start' });
  }, [month, ready]);
  if (!byDate.length) return <p className="agenda-empty">이 달에는 일정이 없습니다.</p>;
  return (
    <div className="agenda" ref={box}>
      {byDate.map(([d, list]) => (
        <section key={d} className={'agenda-day' + (d === today ? ' is-today' : '') + (d < today ? ' is-past' : '')}>
          <h3 className="agenda-date">
            <span className="n">{Number(d.slice(8))}</span>
            <span className="w">{WEEKDAYS[weekday(d)]}요일</span>
            {d === today && <span className="today-pill">오늘</span>}
          </h3>
          <div className="list">
            {list.map((s) => (
              <SessionLine key={s.key} s={s} onClick={onOpen ? () => onOpen(s) : undefined} aside={s.students.length > 1 ? `${s.students.length}명` : undefined} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── 펼친 달력 (전체 화면) ──────────────────────────────

type View = 'month' | 'week' | 'list';

export function ExpandedCalendar({
  open,
  onClose,
  initial,
  today,
  query,
  title,
  toolbar,
  onOpenSession,
}: {
  open: boolean;
  onClose(): void;
  initial: string;
  today: string;
  query: Record<string, string | number | null | undefined>;
  title?: ReactNode;
  toolbar?: ReactNode;
  onOpenSession?(s: CalSession): void;
}) {
  const narrow = useMedia('(max-width: 720px)');
  const [view, setView] = useState<View>(narrow ? 'list' : 'month');
  const [anchor, setAnchor] = useState(initial);
  useEffect(() => {
    if (open) setAnchor(initial);
  }, [open, initial]);
  const month = anchor.slice(0, 8) + '01';
  const weekStart = startOfWeek(anchor);
  const grid = useMemo(() => monthGrid(month), [month]);
  const range = view === 'week' ? { from: weekStart, to: addDays(weekStart, 6) } : { from: grid[0], to: grid[41] };
  const { data } = useApi<CalSession[]>(open ? `/calendar${qs({ ...range, ...query })}` : null);
  const sessions = data ?? [];

  const step = (dir: 1 | -1) => vt(() => setAnchor(view === 'week' ? addDays(anchor, dir * 7) : shiftMonth(month, dir)), dir > 0 ? 'next' : 'prev');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, select, textarea')) return;
      // 위에 열린 시트가 있으면 그 시트가 먼저 닫힌다
      if (document.querySelector('.sheet-backdrop')) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  });

  if (!open) return null;
  const label =
    view === 'week'
      ? `${md(weekStart)} – ${Number(addDays(weekStart, 6).slice(5, 7)) !== Number(weekStart.slice(5, 7)) ? md(addDays(weekStart, 6)) : `${Number(addDays(weekStart, 6).slice(8))}일`}`
      : `${Number(month.slice(5, 7))}월`;

  return createPortal(
    <div className="calx" role="dialog" aria-modal="true" aria-label="펼친 달력" style={{ viewTransitionName: 'calendar' } as CSSProperties}>
      <header className="calx-bar">
        <div className="calx-title">
          <h2 className="month-title">
            <b>{label}</b> <span>{anchor.slice(0, 4)}</span>
          </h2>
          {title && <span className="calx-who">{title}</span>}
        </div>
        <div className="calx-tools">
          <Segmented
            size="sm"
            value={view}
            onChange={(v) => vt(() => setView(v), 'swap')}
            options={[
              { value: 'month' as View, label: '월' },
              { value: 'week' as View, label: '주' },
              { value: 'list' as View, label: '목록' },
            ]}
          />
          {toolbar}
          <div className="stepper-nav">
            <button type="button" onClick={() => step(-1)} aria-label="이전">
              <Chevron dir="left" />
            </button>
            <button
              type="button"
              className="today-btn"
              disabled={view === 'week' ? weekStart === startOfWeek(today) : month.slice(0, 7) === today.slice(0, 7)}
              onClick={() => vt(() => setAnchor(today), anchor < today ? 'next' : 'prev')}
            >
              오늘
            </button>
            <button type="button" onClick={() => step(1)} aria-label="다음">
              <Chevron dir="right" />
            </button>
          </div>
          <button type="button" className="btn btn-secondary btn-sm calx-close" onClick={onClose}>
            <span className="btn-in">
              <ExpandIcon collapse /> 접기
            </span>
          </button>
        </div>
      </header>
      <div className={`calx-body calx-${view}`}>
        <div className="calx-page">
          {view === 'month' && (
            <MonthCalendar
              month={month}
              sessions={sessions}
              today={today}
              selected={null}
              full
              onSelect={(d) => vt(() => (setAnchor(d), setView('week')), 'swap')}
              onOpen={onOpenSession}
              onSwipe={step}
            />
          )}
          {view === 'week' && <WeekGrid start={weekStart} sessions={sessions} today={today} onOpen={onOpenSession} />}
          {view === 'list' && <MonthAgenda month={month} sessions={sessions} today={today} onOpen={onOpenSession} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 일정 하나를 자세히: 시간·장소·메모, 그리고 필요하면 출석부 같은 내용 */
export function SessionDetail({ s, children }: { s: CalSession; children?: ReactNode }) {
  return (
    <div className="sdetail">
      <div className="sdetail-top">
        <span className="sdetail-bar" style={{ ['--c' as string]: s.cancelled ? 'var(--ink-4)' : s.color }} />
        <div>
          <p className="sdetail-title">
            <KindMark s={s} /> {displayTitle(s)}
          </p>
          <p className="sdetail-when">{mdw(s.date)}</p>
          <p className="sdetail-when">{timeRange(s.start, s.end)}</p>
          {s.origin && <p className="sdetail-meta">{originText(s)}</p>}
        </div>
      </div>
      {s.memo && <p className="sdetail-memo">{s.memo}</p>}
      {children}
    </div>
  );
}
