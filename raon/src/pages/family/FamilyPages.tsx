import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { api, qs } from '../../lib/api';
import { useChild } from '../../components/Shell';
import { Chevron, Empty, ErrorNote, ExpandIcon, Loading, SectionHead, Segmented, Sheet, Tag } from '../../components/ui';
import { CalendarLegend, ExpandedCalendar, MonthCalendar, MonthNav, SessionDetail, SessionLine, WeekStrip } from '../../components/schedule';
import { AttendancePillars, FlipText } from '../../components/depth';
import { rise, vt } from '../../lib/motion';
import { BookCard, BookLogList } from '../../components/books';
import { Letter } from '../../components/letters';
import { addDays, dotDate, endOfMonth, fullDate, koTime, mdw, monthGrid, relativeDay, timeRange, todayIn } from '../../../shared/date';
import { givenName, nickname } from '../../../shared/josa';
import type { CalSession, Feedback, FamilyHome, StudentBook } from '../../../shared/types';

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
  const [ap, hm] = next?.start ? koTime(next.start).split(' ') : ['', ''];

  return (
    <div className="fam-home" key={data.student.id}>
      <header className="hero rise" style={rise(0)}>
        <p className="eyebrow">{fullDate(today)}</p>
        <h1 className="hero-title page-title">{isParent ? `${nickname(data.student.name)}의 이번 주` : `${givenName(data.student.name)}의 이번 주`}</h1>
      </header>

      <div className="bento">
        <section className="card card-next rise" style={rise(1)} data-tilt="3">
          <span className="next-glow" aria-hidden="true" />
          <div className="next-main">
            <span className="next-label">다음 수업</span>
            {next ? (
              <>
                <span className="next-when">
                  <span className="rel">{relativeDay(next.date, today)}</span>
                  <span className="ap">{ap}</span>
                  <FlipText text={hm} className="time" />
                </span>
                <span className="next-what">
                  {next.kind === 'makeup' && <Tag tone="red">보강</Tag>}
                  {next.kind === 'exam' && <Tag tone="ochre">시험</Tag>}
                  {next.title}
                </span>
                <span className="next-meta">{[mdw(next.date), timeRange(next.start, next.end), next.room].filter(Boolean).join(' · ')}</span>
              </>
            ) : (
              <span className="next-what">앞으로 3주 안에 잡힌 수업이 없어요.</span>
            )}
          </div>
          <Link to="/calendar" viewTransition className="next-week" aria-label="일정 달력으로">
            <WeekStrip days={weekDays} sessions={data.week} today={today} />
          </Link>
        </section>

        <section className={'card card-side rise' + (data.makeups.length ? ' card-makeup' : '')} style={rise(2)}>
          {data.makeups.length > 0 && (
            <>
              <div className="card-head">
                <h2>
                  잡혀 있는 보강 <span className="count">{data.makeups.length}</span>
                </h2>
              </div>
              <div className="slist">
                {data.makeups.map((s) => (
                  <SessionLine key={s.key} s={s} showDate />
                ))}
              </div>
            </>
          )}
          <div className={data.makeups.length ? 'card-side-att' : ''}>
            <div className="card-head">
              <h2>이번 달 출결</h2>
            </div>
            <AttendancePillars a={data.attendance} />
          </div>
        </section>

        <section className="card card-books rise" style={rise(3)}>
          <div className="card-head">
            <h2>지금 공부하는 교재</h2>
            <Link to="/books" viewTransition className="more">
              전체 <Chevron />
            </Link>
          </div>
          {data.books.length ? (
            <div className="book-list">
              {data.books.map((b) => (
                <BookCard key={b.id} sb={b} />
              ))}
            </div>
          ) : (
            <Empty title="아직 정해진 교재가 없어요." />
          )}
        </section>

        <section className="card card-letters rise" style={rise(4)}>
          <div className="card-head">
            <h2>
              {isParent ? '학부모님께 온 피드백' : '선생님 피드백'}
              {data.unread > 0 && <span className="count">{data.unread}</span>}
            </h2>
            <Link to="/feedback" viewTransition className="more">
              모두 <Chevron />
            </Link>
          </div>
          {data.feedback.length ? (
            <div className="letters">
              {data.feedback.map((f) => (
                <LetterWithRead key={f.id} f={f} salutation={isParent ? '학부모님께' : `${nickname(data.student.name)}에게`} />
              ))}
            </div>
          ) : (
            <Empty title="아직 받은 피드백이 없어요." />
          )}
        </section>

        <section className="card card-week rise" style={rise(5)}>
          <div className="card-head">
            <h2>앞으로 일주일</h2>
            <Link to="/calendar" viewTransition className="more">
              달력 <Chevron />
            </Link>
          </div>
          {data.week.length ? (
            <div className="slist">
              {data.week.map((s) => (
                <SessionLine key={s.key} s={s} showDate />
              ))}
            </div>
          ) : (
            <Empty title="일주일 안에 잡힌 일정이 없어요." />
          )}
        </section>

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

  return (
    <div className="page page-wide">
      <header className="page-head rise" style={rise(0)}>
        <div>
          <p className="eyebrow">{child?.name}</p>
          <h1 className="page-title">일정</h1>
          <p className="page-sub">
            {endOfMonth(month).slice(5, 7).replace(/^0/, '')}월 수업 {count}회
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-line" onClick={() => expand(true)}>
            <ExpandIcon /> 펼쳐 보기
          </button>
        </div>
      </header>
      <div className="cal-toolbar">
        <MonthNav
          month={month}
          today={today}
          onChange={(m) => {
            setMonth(m);
            setSelected(m.slice(0, 7) === today.slice(0, 7) ? today : m);
          }}
        />
        <CalendarLegend />
      </div>
      {error && <ErrorNote message={error} onRetry={reload} />}
      <div className="cal-layout">
        <div className={'cal-wrap' + (data ? '' : ' is-loading')} style={{ viewTransitionName: expanded ? undefined : 'calendar' }}>
          <MonthCalendar month={month} sessions={data ?? []} today={today} selected={selected} onSelect={setSelected} onMore={() => expand(true)} />
        </div>
        <aside className="day-panel">
          <p className="eyebrow">{relativeDay(selected, today) !== dotDate(selected) ? relativeDay(selected, today) : ' '}</p>
          <h2 className="day-title">{mdw(selected)}</h2>
          {day.length ? (
            <div className="slist" key={selected}>
              {day.map((s) => (
                <SessionLine key={s.key} s={s} onClick={() => setDetail(s)}>
                  {s.students[0]?.status && <AttendanceNote status={s.students[0].status} />}
                </SessionLine>
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
      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.title ?? ''} width={480}>
        {detail && (
          <SessionDetail s={detail}>{detail.students[0]?.status && <AttendanceNote status={detail.students[0].status} />}</SessionDetail>
        )}
      </Sheet>
    </div>
  );
}

function AttendanceNote({ status }: { status: 'present' | 'late' | 'absent' }) {
  const map = { present: ['출석', 'moss'], late: ['지각', 'ochre'], absent: ['결석', 'red'] } as const;
  const [label, tone] = map[status];
  return (
    <span className="att-note">
      <Tag tone={tone}>{label}</Tag>
    </span>
  );
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
      <header className="page-head">
        <div>
          <p className="eyebrow">{child.name}</p>
          <h1 className="page-title">{isParent ? "학부모님께 온 피드백" : "선생님 피드백"}</h1>
          <p className="page-sub">
            {isParent
              ? '학부모님께만 보이는 글입니다. 학생에게 보낸 피드백은 따로 전달됩니다.'
              : '선생님이 나에게 남긴 글이에요. 학부모님께 가는 글과는 따로 보관됩니다.'}
          </p>
        </div>
      </header>
      {cats.length > 2 && <Segmented size="sm" value={cat} onChange={setCat} options={cats.map((c) => ({ value: c, label: c }))} />}
      {list.length ? (
        <div className="letters letters-page">
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
      <header className="page-head">
        <div>
          <p className="eyebrow">{child.name}</p>
          <h1 className="page-title">교재와 진도</h1>
          <p className="page-sub">선생님이 수업마다 진도를 기록합니다.</p>
        </div>
      </header>
      {!data.length && <Empty title="아직 정해진 교재가 없어요." />}
      {groups.map((g) => {
        const list = data.filter((b) => b.status === g.key);
        if (!list.length) return null;
        return (
          <section className="block" key={g.key}>
            <SectionHead title={g.title} count={list.length} />
            <div className="book-list">
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
