import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks';
import { AREAS, Button, Empty, ErrorNote, Loading, PageHead, Plus, SectionHead, Tag } from '../../components/ui';
import { CountUp } from '../../components/depth';
import { rise } from '../../lib/motion';
import { KindMark, originText, SessionLine } from '../../components/schedule';
import { Roster } from '../../components/attendance';
import { readStamp } from '../../components/letters';
import { EventSheet, FeedbackSheet, type EventDraft } from './forms';
import { addDays, dotDate, fullDate, koTime, nowTimeIn, timeRange } from '../../../shared/date';
import type { CalSession, MakeupNeed, RosterEntry, TeacherDashboard } from '../../../shared/types';
import { autoTitle } from '../../../shared/titles';

export function draftFromAbsence(s: CalSession, st: RosterEntry, today: string): EventDraft {
  return {
    kind: 'makeup',
    date: addDays(today, 1),
    start: s.start ?? '',
    end: s.end ?? '',
    studentIds: [st.id],
    attendanceIds: st.attendanceId ? [st.attendanceId] : [],
    originDate: s.date,
    originLabel: s.groupName ?? s.title,
    originText: `${dotDate(s.date)} ${s.title} · ${st.name} 결석`,
  };
}

export function draftFromNeed(n: MakeupNeed, today: string): EventDraft {
  const base: EventDraft = {
    kind: 'makeup',
    date: addDays(today, 1),
    originDate: n.date,
    originLabel: n.type === 'cancel' ? n.label.replace(/ 휴강$/, '') : n.label,
  };
  if (n.type === 'cancel') {
    return { ...base, groupId: n.groupId, cancelEventIds: [n.id], originText: `${dotDate(n.date)} ${n.label}${n.note ? ` (${n.note})` : ''}` };
  }
  return { ...base, studentIds: n.students.map((s) => s.id), attendanceIds: [n.id], originText: `${dotDate(n.date)} ${n.label} · ${n.students[0]?.name} 결석` };
}

export function NeedRow({ n, onPlan, onSkip }: { n: MakeupNeed; onPlan(): void; onSkip?(): void }) {
  return (
    <div className="need">
      <span className="need-date">{dotDate(n.date)}</span>
      <span className="need-main">
        <span className="need-who">{n.type === 'cancel' ? `${n.label} · ${n.students.length}명` : n.students[0]?.name}</span>
        <span className="need-what">{n.type === 'cancel' ? n.note || '반 전체 휴강' : `${n.label} 결석${n.note ? ` · ${n.note}` : ''}`}</span>
      </span>
      <span className="need-actions">
        <Button size="sm" variant="line" onClick={onPlan}>
          보강 잡기
        </Button>
        {onSkip && (
          <button type="button" className="link mute" onClick={onSkip}>
            보강 안 함
          </button>
        )}
      </span>
    </div>
  );
}

export function TodayPage() {
  const { data, error, reload, setData } = useApi<TeacherDashboard>('/dashboard');
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [writing, setWriting] = useState(false);

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const now = nowTimeIn();
  const live = data.sessions.filter((s) => !s.cancelled && s.kind !== 'holiday');
  const replace = (next: CalSession) => setData({ ...data, sessions: data.sessions.map((s) => (s.key === next.key ? next : s)) });
  const nextKey = live.find((s) => (s.end ?? s.start ?? '') > now)?.key;

  return (
    <div className="page">
      <PageHead
        eyebrow={fullDate(data.today)}
        title="오늘"
        sub={
          <>
            수업 {live.length}개
            {data.pendingMakeups.length > 0 && (
              <>
                {' · '}
                <Link viewTransition to="/makeups" className="red-text">
                  보강 대기 {data.pendingMakeups.length}건
                </Link>
              </>
            )}
          </>
        }
        actions={
          <>
            <Button onClick={() => setDraft({ kind: 'makeup', date: data.today })}>
              <Plus /> 일정
            </Button>
            <Button variant="primary" onClick={() => setWriting(true)}>
              피드백 쓰기
            </Button>
          </>
        }
      />

      <div className="today-grid">
        <div>
          <SectionHead title="오늘 수업" count={live.length} />
          {data.sessions.length ? (
            <ol className="timeline">
              {data.sessions.map((s, idx) => {
                const marked = s.students.filter((x) => x.status).length;
                const isOpen = open === s.key;
                return (
                  <li key={s.key} style={rise(idx + 2)} className={'tl rise' + (s.key === nextKey ? ' is-next' : '') + (s.cancelled ? ' is-cancelled' : '') + ((s.end ?? '') < now && !s.cancelled ? ' is-past' : '')}>
                    <span className="tl-time">
                      <span className="t">{s.start ? koTime(s.start).replace(/^오[전후] /, '') : '종일'}</span>
                      <span className="ap">{s.start ? koTime(s.start).slice(0, 2) : ''}</span>
                    </span>
                    <div className="tl-card" style={{ ['--c' as string]: s.color }} data-tilt="2">
                      <button type="button" className="tl-head" onClick={() => setOpen(isOpen ? null : s.key)} aria-expanded={isOpen}>
                        <span className="tl-title">
                          <KindMark s={s} />
                          {s.title}
                        </span>
                        <span className="tl-meta">
                          {[timeRange(s.start, s.end), s.room, originText(s)].filter(Boolean).join(' · ')}
                        </span>
                        {!s.cancelled && s.students.length > 0 && (
                          <span className="tl-count">
                            {marked === s.students.length ? (
                              <Tag tone="moss">출결 완료</Tag>
                            ) : (
                              <span>
                                출결 {marked}/{s.students.length}
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                      {isOpen && <Roster s={s} onChange={replace} onMakeup={(st) => setDraft(draftFromAbsence(s, st, data.today))} />}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <Empty title="오늘은 수업이 없습니다." />
          )}

          {data.tomorrow.length > 0 && (
            <>
              <SectionHead title="내일" count={data.tomorrow.filter((s) => !s.cancelled).length} />
              <div className="slist">
                {data.tomorrow.map((s) => (
                  <SessionLine key={s.key} s={s} aside={s.students.length ? `${s.students.length}명` : undefined} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="today-side">
          <div className="figures">
            {[
              { to: '/students', n: data.counts.students, k: '재원생', c: AREAS[2].color },
              { to: '/groups', n: data.counts.groups, k: '반', c: AREAS[3].color },
              { to: '/makeups', n: data.pendingMakeups.length, k: '보강 대기', c: AREAS[0].color },
              { to: '/feedback', n: data.counts.feedbackThisWeek, k: '이번 주 피드백', c: AREAS[4].color },
            ].map((f, i) => (
              <Link viewTransition key={f.to} to={f.to} className="figure rise" style={{ ...rise(i + 1), ['--c' as string]: f.c }} data-tilt="8">
                <span className="n">
                  <CountUp value={f.n} />
                </span>
                <span className="k">{f.k}</span>
              </Link>
            ))}
          </div>

          <section className="block">
            <SectionHead title="보강 대기" count={data.pendingMakeups.length} action={<Link viewTransition to="/makeups" className="link">보강 관리</Link>} />
            {data.pendingMakeups.length ? (
              <div className="needs">
                {data.pendingMakeups.slice(0, 6).map((n) => (
                  <NeedRow key={n.type + n.id} n={n} onPlan={() => setDraft(draftFromNeed(n, data.today))} />
                ))}
              </div>
            ) : (
              <Empty title="밀린 보강이 없습니다." />
            )}
          </section>

          <section className="block">
            <SectionHead title="다가오는 보강" count={data.upcomingMakeups.length} />
            {data.upcomingMakeups.length ? (
              <div className="slist">
                {data.upcomingMakeups.map((s) => (
                  <SessionLine key={s.key} s={s} showDate aside={s.students.map((x) => x.name).join(', ')} onClick={() => setDraft({ ...draftOf(s) })} />
                ))}
              </div>
            ) : (
              <Empty title="예정된 보강이 없습니다." />
            )}
          </section>

          <section className="block">
            <SectionHead title="최근 피드백" action={<Link viewTransition to="/feedback" className="link">전체</Link>} />
            <ul className="fb-mini">
              {data.recentFeedback.map((f) => (
                <li key={f.id}>
                  <span className="who">
                    {f.studentName}
                    <Tag tone={f.audience === 'parent' ? 'ink' : 'plain'}>{f.audience === 'parent' ? '학부모' : '학생'}</Tag>
                  </span>
                  <span className="what">{f.title || f.body.split('\n')[0]}</span>
                  <span className="read">{f.readers?.length ? `${readStamp(f.readers[0].readAt)} 읽음` : '안 읽음'}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <EventSheet draft={draft} onClose={() => setDraft(null)} />
      <FeedbackSheet open={writing} onClose={() => setWriting(false)} />
    </div>
  );
}

/** 이미 있는 일정을 고칠 때 쓰는 초안 */
export function draftOf(s: CalSession): EventDraft {
  return {
    eventId: s.eventId ?? undefined,
    kind: s.kind === 'class' ? 'extra' : s.kind,
    date: s.date,
    start: s.start ?? '',
    end: s.end ?? '',
    title: s.kind !== 'class' && s.title === autoTitle(s.kind, s.groupName ?? (s.kind === 'makeup' ? s.origin?.label : null)) ? '' : s.title,
    room: s.room,
    memo: s.memo,
    groupId: s.groupId,
    studentIds: s.groupId ? [] : s.students.map((x) => x.id),
    originText: s.origin ? `${dotDate(s.origin.date)} ${s.origin.label}` : undefined,
  };
}
