import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { Button, Empty, ErrorNote, Plus, useUi } from '../../components/ui';
import { CalendarLegend, KindMark, MonthCalendar, MonthNav, originText } from '../../components/schedule';
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

  return (
    <div className={'board' + (compact ? ' is-compact' : '')}>
      <div className="cal-toolbar">
        <MonthNav
          month={month}
          today={today}
          onChange={(m) => {
            setMonth(m);
            setSelected(m.slice(0, 7) === today.slice(0, 7) ? today : m);
          }}
        />
        {!fixedStudent && (
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
        )}
        <CalendarLegend />
        <Button variant="primary" size="sm" onClick={() => setDraft({ kind: 'makeup', date: selected, studentIds: studentId ? [studentId] : [], groupId })}>
          <Plus /> 일정 추가
        </Button>
      </div>
      {student && !fixedStudent && (
        <p className="view-note">
          <b>{student.name}</b> 학생의 일정만 보고 있습니다 · <Link to={`/students/${student.id}`}>학생 정보</Link> ·{' '}
          <button type="button" className="link" onClick={() => setParams({}, { replace: true })}>
            전체 보기
          </button>
        </p>
      )}
      {error && <ErrorNote message={error} onRetry={reload} />}
      <div className="cal-layout">
        <div className={'cal-wrap' + (data ? '' : ' is-loading')}>
          <MonthCalendar month={month} sessions={sessions} today={today} selected={selected} onSelect={setSelected} />
        </div>
        <aside className="day-panel">
          <p className="eyebrow">{relativeDay(selected, today) !== dotDate(selected) ? relativeDay(selected, today) : ' '}</p>
          <h2 className="day-title">{mdw(selected)}</h2>
          {day.length ? (
            <div className="day-list">
              {day.map((s) => {
                const isOpen = openKey === s.date + s.key;
                return (
                  <div key={s.key} className={'day-item' + (s.cancelled ? ' is-cancelled' : '')} style={{ ['--c' as string]: s.cancelled ? 'var(--ink-4)' : s.color }}>
                    <button type="button" className="day-item-head" onClick={() => setOpenKey(isOpen ? null : s.date + s.key)} aria-expanded={isOpen}>
                      <span className="time">{timeRange(s.start, s.end)}</span>
                      <span className="title">
                        <KindMark s={s} />
                        {s.title}
                      </span>
                      <span className="meta">
                        {[s.room, originText(s), s.students.length ? `${s.students.length}명` : s.allStudents ? '전체' : ''].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                    {isOpen && (
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
                              className="link seal"
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
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty title="이날은 일정이 없습니다." />
          )}
          <Button variant="ghost" size="sm" onClick={() => setDraft({ kind: 'makeup', date: selected, studentIds: studentId ? [studentId] : [], groupId })}>
            <Plus /> 이날 일정 추가
          </Button>
        </aside>
      </div>
      <EventSheet draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}

export function TeacherCalendarPage() {
  return (
    <div className="page page-wide">
      <ScheduleBoard />
    </div>
  );
}
