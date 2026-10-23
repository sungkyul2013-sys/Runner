import { useMemo, type ReactNode } from 'react';
import type { CalSession } from '../../shared/types';
import { EVENT_LABEL } from '../../shared/types';
import { WEEKDAYS, dotDate, monthGrid, timeRange, toDate, weekday } from '../../shared/date';
import { Chevron } from './ui';

/** 보강의 원래 수업: 10.13 (화) 수업분 */
export function originText(s: CalSession): string {
  return s.origin ? `${dotDate(s.origin.date)} 수업분` : '';
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

/** 일정 한 줄: 시간 · 제목 · 강의실 */
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
      <span className="sline-bar" style={{ background: s.cancelled ? 'var(--ink-4)' : s.color }} />
      <span className="sline-time">
        {showDate && <span className="sline-date">{dotDate(s.date)}</span>}
        <span>{s.start ? timeRange(s.start, s.end) : '종일'}</span>
      </span>
      <span className="sline-main">
        <span className="sline-title">
          <KindMark s={s} />
          <span className="t">{s.title}</span>
        </span>
        <span className="sline-meta">
          {[s.room, originText(s), s.memo].filter(Boolean).join(' · ')}
        </span>
        {children}
      </span>
      {aside && <span className="sline-aside">{aside}</span>}
    </Tag>
  );
}

function shortLabel(s: CalSession) {
  if (s.kind === 'holiday') return s.title;
  const t = s.start ? s.start.replace(/^0/, '') : '';
  return `${t} ${s.title}`.trim();
}

export function MonthNav({ month, onChange, today }: { month: string; onChange(m: string): void; today: string }) {
  const d = toDate(month);
  const shift = (n: number) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
    onChange(`${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-01`);
  };
  return (
    <div className="month-nav">
      <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="이전 달">
        <Chevron dir="left" />
      </button>
      <h2 className="month-title">
        <span className="yr">{d.getUTCFullYear()}</span>
        <span className="mo">{d.getUTCMonth() + 1}월</span>
      </h2>
      <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="다음 달">
        <Chevron dir="right" />
      </button>
      {today.slice(0, 7) !== month.slice(0, 7) && (
        <button type="button" className="link today-link" onClick={() => onChange(today.slice(0, 8) + '01')}>
          오늘
        </button>
      )}
    </div>
  );
}

/**
 * 한 달 달력. 넓은 화면에서는 칸 안에 일정을 적고, 좁은 화면에서는 점으로만 표시한다.
 */
export function MonthCalendar({
  month,
  sessions,
  today,
  selected,
  onSelect,
}: {
  month: string;
  sessions: CalSession[];
  today: string;
  selected: string | null;
  onSelect(date: string): void;
}) {
  const days = useMemo(() => monthGrid(month), [month]);
  const byDate = useMemo(() => {
    const m = new Map<string, CalSession[]>();
    for (const s of sessions) {
      const list = m.get(s.date) ?? [];
      list.push(s);
      m.set(s.date, list);
    }
    return m;
  }, [sessions]);
  const mo = month.slice(0, 7);
  // 마지막 줄이 통째로 다음 달이면 숨긴다
  const visible = days.slice(35, 42).every((d) => d.slice(0, 7) !== mo) ? days.slice(0, 35) : days;

  return (
    <div className="cal">
      <div className="cal-head">
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>
            {w}
          </span>
        ))}
      </div>
      <div className="cal-grid">
        {visible.map((d) => {
          const list = byDate.get(d) ?? [];
          const holiday = list.find((s) => s.kind === 'holiday');
          const wd = weekday(d);
          const out = d.slice(0, 7) !== mo;
          const items = list.filter((s) => s.kind !== 'holiday');
          return (
            <button
              type="button"
              key={d}
              onClick={() => onSelect(d)}
              className={[
                'cal-day',
                out && 'is-out',
                d === today && 'is-today',
                d === selected && 'is-selected',
                holiday && 'is-holiday',
                wd === 0 && 'sun',
                wd === 6 && 'sat',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={`${dotDate(d)} 일정 ${list.length}개`}
            >
              <span className="cal-num">{Number(d.slice(8))}</span>
              {holiday && <span className="cal-holiday">{holiday.title}</span>}
              <span className="cal-items">
                {items.slice(0, 4).map((s) => (
                  <span key={s.key} className={`cal-item cal-${kindTone(s)}`} style={{ ['--c' as string]: s.color }}>
                    {s.kind === 'makeup' && <b>보강</b>}
                    {s.kind === 'exam' && <b>시험</b>}
                    {shortLabel(s)}
                  </span>
                ))}
                {items.length > 4 && <span className="cal-more">+{items.length - 4}</span>}
              </span>
              <span className="cal-dots" aria-hidden="true">
                {items.slice(0, 4).map((s) => (
                  <i key={s.key} className={`cal-${kindTone(s)}`} style={{ background: s.cancelled ? 'transparent' : s.color, borderColor: s.color }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarLegend() {
  return (
    <div className="legend">
      <span>
        <i className="lg-class" />
        정규 수업
      </span>
      <span>
        <i className="lg-makeup" />
        보강
      </span>
      <span>
        <i className="lg-exam" />
        시험
      </span>
      <span>
        <i className="lg-cancel" />
        휴강
      </span>
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
          <div key={d} className={'ws-day' + (d === today ? ' is-today' : '') + (wd === 0 ? ' sun' : wd === 6 ? ' sat' : '')}>
            <span className="ws-w">{WEEKDAYS[wd]}</span>
            <span className="ws-n">{Number(d.slice(8))}</span>
            <span className="ws-marks">
              {list.map((s) => (
                <i key={s.key} className={`cal-${kindTone(s)}`} style={{ background: s.cancelled ? 'transparent' : s.color, borderColor: s.color }} />
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
