import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks';
import { Button, Chevron, Collapse, Empty, ErrorNote, Loading, PageHead, Plus, SectionHead, Tag } from '../../components/ui';
import { displayTitle, KindMark, originText, SessionLine } from '../../components/schedule';
import { Roster } from '../../components/attendance';
import { readStamp } from '../../components/letters';
import { EventSheet, FeedbackSheet, type EventDraft } from './forms';
import { addDays, dotDate, fullDate, nowTimeIn, timeRange } from '../../../shared/date';
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
    <div className="row need">
      <span className="row-main">
        <span className="row-title">{n.type === 'cancel' ? `${n.label} · ${n.students.length}명` : n.students[0]?.name}</span>
        <span className="row-sub">
          {dotDate(n.date)} · {n.type === 'cancel' ? n.note || '반 전체 휴강' : `${n.label} 결석${n.note ? ` · ${n.note}` : ''}`}
        </span>
      </span>
      <span className="row-actions">
        {onSkip && (
          <button type="button" className="link mute" onClick={onSkip}>
            보강 안 함
          </button>
        )}
        <Button size="sm" onClick={onPlan}>
          보강 잡기
        </Button>
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
  const figures = [
    { to: '/students', n: data.counts.students, k: '재원생' },
    { to: '/groups', n: data.counts.groups, k: '반' },
    { to: '/makeups', n: data.pendingMakeups.length, k: '보강 대기', warn: data.pendingMakeups.length > 0 },
    { to: '/feedback', n: data.counts.feedbackThisWeek, k: '이번 주 피드백' },
  ];

  return (
    <div className="page">
      <PageHead
        eyebrow={fullDate(data.today)}
        title="오늘"
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

      <div className="figures">
        {figures.map((f) => (
          <Link viewTransition key={f.to} to={f.to} className={'figure' + (f.warn ? ' is-warn' : '')}>
            <span className="n">{f.n}</span>
            <span className="k">{f.k}</span>
          </Link>
        ))}
      </div>

      {data.newConsults.length > 0 && (
        <Link viewTransition to="/consults" className="notice">
          <span className="notice-dot" />
          <span className="notice-text">
            <b>새 상담 신청 {data.newConsults.length}건</b>
            <span>
              {data.newConsults
                .slice(0, 2)
                .map((c) => `${c.studentName}(${c.grade})`)
                .join(', ')}
              {data.newConsults.length > 2 && ` 외 ${data.newConsults.length - 2}명`}
            </span>
          </span>
          <Chevron />
        </Link>
      )}

      <div className="today-grid">
        <section className="block">
          <SectionHead title="오늘 수업" count={live.length} />
          {data.sessions.length ? (
            <div className="list classes">
              {data.sessions.map((s) => {
                const marked = s.students.filter((x) => x.status).length;
                const isOpen = open === s.key;
                const past = (s.end ?? '') < now && !s.cancelled;
                return (
                  <div key={s.key} className={'class-row' + (s.key === nextKey ? ' is-next' : '') + (s.cancelled ? ' is-cancelled' : '') + (past ? ' is-past' : '') + (isOpen ? ' is-open' : '')}>
                    <button type="button" className="class-head" onClick={() => setOpen(isOpen ? null : s.key)} aria-expanded={isOpen}>
                      <span className="class-time">
                        <b>{s.start ?? '종일'}</b>
                        {s.end && <span>{s.end}</span>}
                      </span>
                      <span className="sline-bar" style={{ ['--c' as string]: s.color }} />
                      <span className="class-main">
                        <span className="class-title">
                          <KindMark s={s} />
                          {displayTitle(s)}
                          {s.key === nextKey && <span className="now-pill">다음</span>}
                        </span>
                        <span className="class-meta">{[timeRange(s.start, s.end), originText(s)].filter(Boolean).join(' · ')}</span>
                      </span>
                      {!s.cancelled && s.students.length > 0 && (
                        <span className="class-count">{marked === s.students.length ? <Tag>출결 완료</Tag> : `출결 ${marked}/${s.students.length}`}</span>
                      )}
                      <Chevron dir={isOpen ? 'up' : 'down'} size={12} />
                    </button>
                    <Collapse open={isOpen}>
                      <Roster s={s} onChange={replace} onMakeup={(st) => setDraft(draftFromAbsence(s, st, data.today))} />
                    </Collapse>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty title="오늘은 수업이 없습니다." />
          )}

          {data.tomorrow.length > 0 && (
            <>
              <SectionHead title="내일" count={data.tomorrow.filter((s) => !s.cancelled).length} />
              <div className="list">
                {data.tomorrow.map((s) => (
                  <SessionLine key={s.key} s={s} aside={s.students.length ? `${s.students.length}명` : undefined} />
                ))}
              </div>
            </>
          )}
        </section>

        <div className="today-side">
          <section className="block">
            <SectionHead
              title="보강 대기"
              count={data.pendingMakeups.length}
              action={
                <Link viewTransition to="/makeups" className="more">
                  보강 관리 <Chevron size={12} />
                </Link>
              }
            />
            {data.pendingMakeups.length ? (
              <div className="list">
                {data.pendingMakeups.slice(0, 5).map((n) => (
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
              <div className="list">
                {data.upcomingMakeups.map((s) => (
                  <SessionLine key={s.key} s={s} showDate aside={s.students.map((x) => x.name).join(', ')} onClick={() => setDraft({ ...draftOf(s) })} />
                ))}
              </div>
            ) : (
              <Empty title="예정된 보강이 없습니다." />
            )}
          </section>

          <section className="block">
            <SectionHead
              title="최근 피드백"
              action={
                <Link viewTransition to="/feedback" className="more">
                  전체 <Chevron size={12} />
                </Link>
              }
            />
            <div className="list">
              {data.recentFeedback.map((f) => (
                <div className="row" key={f.id}>
                  <span className="row-main">
                    <span className="row-title">
                      {f.studentName} <span className="row-light">{f.audience === 'parent' ? '학부모님께' : '학생에게'}</span>
                    </span>
                    <span className="row-sub">{f.title || f.body.split('\n')[0]}</span>
                  </span>
                  <span className={'row-aside' + (f.readers?.length ? '' : ' is-unread')}>{f.readers?.length ? `${readStamp(f.readers[0].readAt)} 읽음` : '안 읽음'}</span>
                </div>
              ))}
            </div>
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
    memo: s.memo,
    groupId: s.groupId,
    studentIds: s.groupId ? [] : s.students.map((x) => x.id),
    originText: s.origin ? `${dotDate(s.origin.date)} ${s.origin.label}` : undefined,
  };
}
