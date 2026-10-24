import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../lib/api';
import { invalidate, useApi } from '../../lib/hooks';
import { Button, Chevron, Collapse, Empty, ErrorNote, ExpandIcon, PageHead, Plus, Sheet, useUi } from '../../components/ui';
import { displayTitle, ExpandedCalendar, KindMark, MonthCalendar, MonthNav, originText, SessionDetail, shiftMonth } from '../../components/schedule';
import { vt } from '../../lib/motion';
import { Roster } from '../../components/attendance';
import { EventSheet, type EventDraft } from './forms';
import { draftFromAbsence, draftOf } from './TodayPage';
import { dotDate, monthGrid, mdw, relativeDay, timeRange, todayIn } from '../../../shared/date';
import type { CalSession, Group, StudentRow } from '../../../shared/types';

/** 달력 + 고른 날의 일정·출결. 학생 상세 화면에서도 studentId 를 고정해서 쓴다. */
export function ScheduleBoard({ studentId: fixedStudent, compact }: { studentId?: number; compact?: boolean }) {
  const ui = useUi();
  const today = todayIn();
  const [params, setParams] = useSearchParams();
  const [month, setMonth] = useState(today.slice(0, 8) + '01');
  const [selected, setSelected] = useState(today);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<CalSession | null>(null);
  const expand = (on: boolean) => vt(() => setExpanded(on), on ? 'expand' : 'collapse');
  const filter = fixedStudent ? `s${fixedStudent}` : params.get('view') ?? '';
  const studentId = filter.startsWith('s') ? Number(filter.slice(1)) : null;
  const groupId = filter.startsWith('g') ? Number(filter.slice(1)) : null;

  const groups = useApi<Group[]>(fixedStudent ? null : '/groups').data ?? [];
  const students = useApi<StudentRow[]>(fixedStudent ? null : '/students').data ?? [];
  const grid = useMemo(() => monthGrid(month), [month]);
  const { data, error, reload, setData } = useApi<CalSession[]>(`/calendar${qs({ from: grid[0], to: grid[41], studentId, groupId })}`);
  const sessions = data ?? [];
  const day = sessions.filter((s) => s.date === selected);
  const replace = (next: CalSession) => setData(sessions.map((s) => (s.key === next.key && s.date === next.date ? next : s)));
  const student = students.find((s) => s.id === studentId);
  const viewSelect = !fixedStudent && (
    <select
      className="view-select"
      value={filter}
      onChange={(e) => {
        const v = e.target.value;
        setParams(v ? { view: v } : {}, { replace: true });
      }}
      aria-label="보기"
    >
      <option value="">전체 일정</option>
      <optgroup label="반별">
        {groups.map((g) => (
          <option key={g.id} value={`g${g.id}`}>
            {g.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="학생별">
        {students
          .filter((s) => s.status !== 'left')
          .map((s) => (
            <option key={s.id} value={`s${s.id}`}>
              {s.name} · {s.grade}
            </option>
          ))}
      </optgroup>
    </select>
  );

  const cancelClass = async (s: CalSession) => {
    const yes = await ui.confirm({
      title: `${dotDate(s.date)} ${s.title} 수업을 휴강할까요?`,
      body: '학생·학부모 달력에 휴강으로 표시되고, ‘보강 대기’ 목록에 올라갑니다.',
      ok: '휴강하기',
    });
    if (yes) await ui.run(() => api.post('/events', { kind: 'cancel', date: s.date, groupId: s.groupId }), '휴강으로 바꿨습니다.');
  };
  const undoCancel = async (s: CalSession) => {
    if (!s.cancelEventId) return;
    const yes = await ui.confirm({ title: '휴강을 취소할까요?', body: '원래대로 정규 수업이 있는 날이 됩니다.', ok: '휴강 취소' });
    if (yes) await ui.run(() => api.del(`/events/${s.cancelEventId}`), '휴강을 취소했습니다.');
  };

  const rel = relativeDay(selected, today);
  const swipe = (dir: 1 | -1) =>
    vt(() => {
      const m = shiftMonth(month, dir);
      setMonth(m);
      setSelected(m.slice(0, 7) === today.slice(0, 7) ? today : m);
    }, dir > 0 ? 'next' : 'prev');

  return (
    <div className={'board' + (compact ? ' is-compact' : '')}>
      <div className="toolbar">
        {viewSelect}
        <div className="toolbar-end">
          <Button size="sm" onClick={() => expand(true)}>
            <ExpandIcon /> 펼치기
          </Button>
          <Button variant="primary" size="sm" onClick={() => setDraft({ kind: 'makeup', date: selected, studentIds: studentId ? [studentId] : [], groupId })}>
            <Plus /> 일정 추가
          </Button>
        </div>
      </div>
      {student && !fixedStudent && (
        <p className="view-note">
          <b>{student.name}</b> 학생의 일정만 보고 있습니다 · <Link viewTransition to={`/students/${student.id}`}>학생 정보</Link> ·{' '}
          <button type="button" className="link" onClick={() => setParams({}, { replace: true })}>
            전체 보기
          </button>
        </p>
      )}
      {error && <ErrorNote message={error} onRetry={reload} />}
      <div className="cal-layout">
        <div className={'card cal-card' + (data ? '' : ' is-loading')} style={{ viewTransitionName: expanded ? undefined : 'calendar' }}>
          <MonthNav
            month={month}
            today={today}
            onChange={(m) => {
              setMonth(m);
              setSelected(m.slice(0, 7) === today.slice(0, 7) ? today : m);
            }}
          />
          <MonthCalendar month={month} sessions={sessions} today={today} selected={selected} onSelect={setSelected} onMore={() => expand(true)} onSwipe={swipe} />
        </div>
        <aside className="day-panel">
          <h2 className="day-title">
            {mdw(selected)}
            {rel !== dotDate(selected) && <span>{rel}</span>}
          </h2>
          {day.length ? (
            <div className="list day-list" key={selected}>
              {day.map((s) => {
                const isOpen = openKey === s.date + s.key;
                return (
                  <div key={s.key} className={'day-item' + (s.cancelled ? ' is-cancelled' : '') + (isOpen ? ' is-open' : '')}>
                    <button type="button" className="day-item-head" onClick={() => setOpenKey(isOpen ? null : s.date + s.key)} aria-expanded={isOpen}>
                      <span className="sline-bar" style={{ ['--c' as string]: s.cancelled ? 'var(--ink-4)' : s.color }} />
                      <span className="day-item-main">
                        <span className="title">
                          <KindMark s={s} />
                          {displayTitle(s)}
                        </span>
                        <span className="meta">
                          {[timeRange(s.start, s.end), originText(s), s.students.length ? `${s.students.length}명` : s.allStudents ? '전체' : ''].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <Chevron dir={isOpen ? 'up' : 'down'} size={12} />
                    </button>
                    <Collapse open={isOpen}>
                      <div className="day-item-body">
                        {s.memo && <p className="memo">{s.memo}</p>}
                        {s.kind !== 'holiday' && <Roster s={s} onChange={replace} onMakeup={(st) => setDraft(draftFromAbsence(s, st, today))} />}
                        <div className="day-actions">
                          {s.kind === 'class' && !s.cancelled && (
                            <button type="button" className="link" onClick={() => cancelClass(s)}>
                              이날 휴강
                            </button>
                          )}
                          {s.kind === 'class' && s.cancelled && s.cancelEventId && (
                            <button type="button" className="link" onClick={() => undoCancel(s)}>
                              휴강 취소
                            </button>
                          )}
                          {s.kind === 'class' && s.cancelled && s.cancelEventId && (
                            <button
                              type="button"
                              className="link"
                              onClick={() =>
                                setDraft({
                                  kind: 'makeup',
                                  date: today,
                                  start: s.start ?? '',
                                  end: s.end ?? '',
                                  groupId: s.groupId,
                                  cancelEventIds: [s.cancelEventId!],
                                  originDate: s.date,
                                  originLabel: s.groupName ?? s.title,
                                  originText: `${dotDate(s.date)} ${s.title} 휴강`,
                                })
                              }
                            >
                              보강 잡기
                            </button>
                          )}
                          {s.eventId && (
                            <button type="button" className="link" onClick={() => setDraft(draftOf(s))}>
                              고치기
                            </button>
                          )}
                        </div>
                      </div>
                    </Collapse>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty title="이날은 일정이 없습니다." />
          )}
          <button type="button" className="link add-link" onClick={() => setDraft({ kind: 'makeup', date: selected, studentIds: studentId ? [studentId] : [], groupId })}>
            <Plus /> 이날 일정 추가
          </button>
        </aside>
      </div>
      <ExpandedCalendar
        open={expanded}
        onClose={() => expand(false)}
        initial={selected}
        today={today}
        query={{ studentId, groupId }}
        title={student ? student.name : groupId ? groups.find((g) => g.id === groupId)?.name : '전체 일정'}
        toolbar={viewSelect || undefined}
        onOpenSession={setDetail}
      />
      <Sheet open={!!detail} onClose={() => setDetail(null)} title="일정" width={520}>
        {detail && (
          <SessionDetail s={detail}>
            {detail.kind !== 'holiday' && (
              <Roster
                s={detail}
                onChange={(n) => {
                  setDetail(n);
                  replace(n);
                  invalidate();
                }}
                onMakeup={(st) => {
                  setDetail(null);
                  setDraft(draftFromAbsence(detail, st, today));
                }}
              />
            )}
            {detail.eventId && (
              <div className="day-actions">
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setDetail(null);
                    setDraft(draftOf(detail));
                  }}
                >
                  일정 고치기
                </button>
              </div>
            )}
          </SessionDetail>
        )}
      </Sheet>
      <EventSheet draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}

export function TeacherCalendarPage() {
  return (
    <div className="page page-wide">
      <PageHead title="달력" />
      <ScheduleBoard />
    </div>
  );
}
