import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { api, qs } from '../../lib/api';
import { useChild } from '../../components/Shell';
import { Button, Chevron, CountUp, Empty, ErrorNote, ExpandIcon, Loading, PageHead, SectionHead, Segmented, Sheet, Tag } from '../../components/ui';
import { displayTitle, ExpandedCalendar, KindMark, MonthCalendar, MonthNav, SessionDetail, SessionLine, WeekStrip } from '../../components/schedule';
import { vt } from '../../lib/motion';
import { BookCard, BookLogList } from '../../components/books';
import { Letter } from '../../components/letters';
import { addDays, dotDate, endOfMonth, fullDate, koTime, mdw, monthGrid, relativeDay, timeRange, todayIn } from '../../../shared/date';
import { givenName, nickname } from '../../../shared/josa';
import type { AttendanceSummary, CalSession, Feedback, FamilyHome, StudentBook } from '../../../shared/types';

export function FamilyHomePage() {
  const { me } = useAuth();
  const { child } = useChild();
  const { data, error, reload } = useApi<FamilyHome>(child ? `/home?studentId=${child.id}` : null);
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const isParent = me?.role === 'parent';
  const today = data.today;
  const next = data.next;
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const name = isParent ? nickname(data.student.name) : givenName(data.student.name);

  return (
    <div className="page fam-home" key={data.student.id}>
      <PageHead eyebrow={fullDate(today)} title={`${name}의 이번 주`} />

      <div className="home-grid">
        <div className="home-col">
          <section className="card next" data-tilt="3">
            <p className="next-label">다음 수업</p>
            {next ? (
              <>
                <p className="next-when">
                  <span className="rel">{relativeDay(next.date, today)}</span>
                  <span className="time">{koTime(next.start)}</span>
                </p>
                <p className="next-what">
                  <KindMark s={next} />
                  {displayTitle(next)}
                </p>
                <p className="next-meta">{[mdw(next.date), timeRange(next.start, next.end)].filter(Boolean).join(' · ')}</p>
              </>
            ) : (
              <p className="next-what">앞으로 3주 안에 잡힌 수업이 없어요.</p>
            )}
            <Link to="/calendar" viewTransition className="next-week" aria-label="일정 달력으로">
              <WeekStrip days={weekDays} sessions={data.week} today={today} />
            </Link>
          </section>

          {data.makeups.length > 0 && (
            <section className="block">
              <SectionHead title="잡혀 있는 보강" count={data.makeups.length} />
              <div className="list">
                {data.makeups.map((s) => (
                  <SessionLine key={s.key} s={s} showDate />
                ))}
              </div>
            </section>
          )}

          <section className="block">
            <SectionHead
              title="앞으로 일주일"
              action={
                <Link to="/calendar" viewTransition className="more">
                  달력 <Chevron size={12} />
                </Link>
              }
            />
            {data.week.length ? (
              <div className="list">
                {data.week.map((s) => (
                  <SessionLine key={s.key} s={s} showDate />
                ))}
              </div>
            ) : (
              <Empty title="일주일 안에 잡힌 일정이 없어요." />
            )}
          </section>
        </div>

        <div className="home-col">
          <section className="block">
            <SectionHead
              title={isParent ? '학부모님께 온 피드백' : '선생님 피드백'}
              count={data.unread}
              action={
                <Link to="/feedback" viewTransition className="more">
                  모두 보기 <Chevron size={12} />
                </Link>
              }
            />
            {data.feedback.length ? (
              <div className="list letters">
                {data.feedback.map((f) => (
                  <LetterWithRead key={f.id} f={f} salutation={isParent ? '학부모님께' : `${nickname(data.student.name)}에게`} />
                ))}
              </div>
            ) : (
              <Empty title="아직 받은 피드백이 없어요." />
            )}
          </section>

          <section className="block">
            <SectionHead
              title="지금 공부하는 교재"
              action={
                <Link to="/books" viewTransition className="more">
                  전체 <Chevron size={12} />
                </Link>
              }
            />
            {data.books.length ? (
              <div className="list books">
                {data.books.map((b) => (
                  <BookCard key={b.id} sb={b} />
                ))}
              </div>
            ) : (
              <Empty title="아직 정해진 교재가 없어요." />
            )}
          </section>

          <section className="block">
            <SectionHead title="이번 달 출결" />
            <AttendanceNumbers a={data.attendance} />
          </section>
        </div>
      </div>
    </div>
  );
}

export function AttendanceNumbers({ a }: { a: AttendanceSummary }) {
  return (
    <div className="numbers">
      <div>
        <span className="n">
          <CountUp value={a.present} />
        </span>
        <span className="k">출석</span>
      </div>
      <div>
        <span className="n">
          <CountUp value={a.late} />
        </span>
        <span className="k">지각</span>
      </div>
      <div className={a.absent ? 'is-warn' : ''}>
        <span className="n">
          <CountUp value={a.absent} />
        </span>
        <span className="k">결석</span>
      </div>
    </div>
  );
}

function LetterWithRead({ f, salutation, defaultOpen }: { f: Feedback; salutation: string; defaultOpen?: boolean }) {
  const [read, setRead] = useState(f.readAt);
  return (
    <Letter
      f={{ ...f, readAt: read }}
      salutation={salutation}
      defaultOpen={defaultOpen}
      onOpen={() => {
        if (read) return;
        setRead(new Date().toISOString());
        api.post(`/feedback/${f.id}/read`).catch(() => setRead(null));
      }}
    />
  );
}

export function FamilyCalendarPage() {
  const { child } = useChild();
  const today = todayIn();
  const [month, setMonth] = useState(today.slice(0, 8) + '01');
  const [selected, setSelected] = useState<string>(today);
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<CalSession | null>(null);
  const grid = useMemo(() => monthGrid(month), [month]);
  const { data, error, reload } = useApi<CalSession[]>(child ? `/calendar${qs({ from: grid[0], to: grid[41], studentId: child.id })}` : null);
  const day = (data ?? []).filter((s) => s.date === selected);
  const count = (data ?? []).filter((s) => s.date.slice(0, 7) === month.slice(0, 7) && (s.kind === 'class' || s.kind === 'makeup') && !s.cancelled).length;
  const expand = (on: boolean) => vt(() => setExpanded(on), on ? 'expand' : 'collapse');
  const rel = relativeDay(selected, today);

  return (
    <div className="page page-wide">
      <PageHead
        eyebrow={child?.name}
        title="일정"
        sub={`${Number(endOfMonth(month).slice(5, 7))}월 수업 ${count}회`}
        actions={
          <Button onClick={() => expand(true)}>
            <ExpandIcon /> 펼쳐 보기
          </Button>
        }
      />
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
          <MonthCalendar month={month} sessions={data ?? []} today={today} selected={selected} onSelect={setSelected} onMore={() => expand(true)} />
        </div>
        <aside className="day-panel">
          <h2 className="day-title">
            {mdw(selected)}
            {rel !== dotDate(selected) && <span>{rel}</span>}
          </h2>
          {day.length ? (
            <div className="list" key={selected}>
              {day.map((s) => (
                <SessionLine key={s.key} s={s} onClick={() => setDetail(s)} aside={s.students[0]?.status && <AttendanceNote status={s.students[0].status} />} />
              ))}
            </div>
          ) : (
            <Empty title="이날은 일정이 없어요." />
          )}
        </aside>
      </div>
      <ExpandedCalendar
        open={expanded}
        onClose={() => expand(false)}
        initial={selected}
        today={today}
        query={{ studentId: child?.id }}
        title={child?.name}
        onOpenSession={setDetail}
      />
      <Sheet open={!!detail} onClose={() => setDetail(null)} title="일정" width={460}>
        {detail && (
          <SessionDetail s={detail}>
            {detail.students[0]?.status && (
              <p className="sdetail-att">
                출결 <AttendanceNote status={detail.students[0].status} />
              </p>
            )}
          </SessionDetail>
        )}
      </Sheet>
    </div>
  );
}

function AttendanceNote({ status }: { status: 'present' | 'late' | 'absent' }) {
  const map = { present: ['출석', 'gray'], late: ['지각', 'orange'], absent: ['결석', 'red'] } as const;
  const [label, tone] = map[status];
  return <Tag tone={tone}>{label}</Tag>;
}

export function FamilyFeedbackPage() {
  const { me } = useAuth();
  const { child } = useChild();
  const { data, error, reload } = useApi<Feedback[]>(child ? `/feedback?studentId=${child.id}` : null);
  const [cat, setCat] = useState('전체');
  const isParent = me?.role === 'parent';
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data || !child) return <Loading />;
  const cats = ['전체', ...new Set(data.map((f) => f.category))];
  const list = cat === '전체' ? data : data.filter((f) => f.category === cat);
  return (
    <div className="page page-narrow">
      <PageHead
        eyebrow={child.name}
        title={isParent ? '학부모님께 온 피드백' : '선생님 피드백'}
        sub={isParent ? '학부모님께만 보이는 글입니다. 학생에게 보낸 글은 따로 전달돼요.' : '선생님이 나에게 쓴 글이에요. 학부모님께 가는 글과는 따로 보관돼요.'}
      />
      {cats.length > 2 && (
        <div className="toolbar">
          <Segmented size="sm" value={cat} onChange={(c) => vt(() => setCat(c), 'swap')} options={cats.map((c) => ({ value: c, label: c }))} />
        </div>
      )}
      {list.length ? (
        <div className="list letters swap-area">
          {list.map((f, i) => (
            <LetterWithRead key={f.id} f={f} salutation={isParent ? '학부모님께' : `${nickname(child.name)}에게`} defaultOpen={i === 0 && !f.readAt} />
          ))}
        </div>
      ) : (
        <Empty title="아직 받은 피드백이 없어요." />
      )}
    </div>
  );
}

export function FamilyBooksPage() {
  const { child } = useChild();
  const { data, error, reload } = useApi<StudentBook[]>(child ? `/student-books?studentId=${child.id}` : null);
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data || !child) return <Loading />;
  const groups = [
    { key: 'current', title: '지금 공부하는 교재' },
    { key: 'planned', title: '다음에 할 교재' },
    { key: 'done', title: '끝낸 교재' },
  ] as const;
  return (
    <div className="page page-narrow">
      <PageHead eyebrow={child.name} title="교재와 진도" sub="선생님이 수업마다 진도를 기록합니다." />
      {!data.length && <Empty title="아직 정해진 교재가 없어요." />}
      {groups.map((g) => {
        const list = data.filter((b) => b.status === g.key);
        if (!list.length) return null;
        return (
          <section className="block" key={g.key}>
            <SectionHead title={g.title} count={list.length} />
            <div className="list books">
              {list.map((b) => (
                <BookCard key={b.id} sb={b} compact={g.key !== 'current'}>
                  {g.key === 'current' && <BookLogList sb={b} />}
                </BookCard>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
