import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { Avatar, Button, Chevron, Empty, ErrorNote, Field, Loading, PageHead, Plus, SectionHead, Segmented, Sheet, Tag, useUi } from '../../components/ui';
import { vt } from '../../lib/motion';
import { BookCover, ProgressBar } from '../../components/books';
import { slotText } from '../../components/pickers';
import { readStamp } from '../../components/letters';
import { AssignBookSheet, GroupSheet, ProgressSheet, TextbookSheet } from './forms';
import { ResetSheet } from './StudentPages';
import { WEEKDAYS, minutesBetween } from '../../../shared/date';
import type { Group, StudentBook, TeacherAccount, Textbook } from '../../../shared/types';

// ── 반·시간표 ─────────────────────────────────────────

export function GroupsPage() {
  const { data, error, reload } = useApi<Group[]>('/groups');
  const [editing, setEditing] = useState<Group | null | undefined>(undefined);
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const weekly = data.reduce((sum, g) => sum + g.slots.reduce((m, s) => m + minutesBetween(s.start, s.end), 0), 0);
  return (
    <div className="page">
      <PageHead
        title="반 · 시간표"
        sub={`${data.length}개 반 · 주 ${Math.round(weekly / 6) / 10}시간 수업`}
        actions={
          <Button variant="primary" onClick={() => setEditing(null)}>
            <Plus /> 새 반
          </Button>
        }
      />
      {data.length > 0 && <SectionHead title="주간 시간표" />}
      <WeekTable groups={data} />
      <SectionHead title="반" count={data.length} />
      {data.length ? (
        <div className="list">
          {data.map((g) => (
            <button type="button" key={g.id} className="row row-click group-row" onClick={() => setEditing(g)}>
              <span className="dot" style={{ background: g.color }} />
              <span className="row-main">
                <span className="row-title">
                  {g.name}
                </span>
                <span className="row-sub">{slotText(g.slots) || '시간 미정'}</span>
                <span className="row-sub">{g.members.map((m) => m.name).join(', ') || '학생 없음'}</span>
              </span>
              <span className="row-aside">{g.members.length}명</span>
              <Link viewTransition to={`/calendar?view=g${g.id}`} onClick={(e) => e.stopPropagation()} className="link small">
                달력
              </Link>
              <Chevron />
            </button>
          ))}
        </div>
      ) : (
        <Empty title="아직 만든 반이 없습니다.">반을 만들고 요일·시간을 정하면 달력에 정규 수업이 자동으로 채워집니다.</Empty>
      )}
      <GroupSheet open={editing !== undefined} group={editing} onClose={() => setEditing(undefined)} />
    </div>
  );
}

/** 주간 시간표 한눈에 보기 */
function WeekTable({ groups }: { groups: Group[] }) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const byDay = order.map((w) => ({
    w,
    items: groups
      .flatMap((g) => g.slots.filter((s) => s.weekday === w).map((s) => ({ g, s })))
      .sort((a, b) => a.s.start.localeCompare(b.s.start)),
  }));
  if (!groups.length) return null;
  return (
    <div className="card week-table">
      {byDay.map(({ w, items }) => (
        <div key={w} className={'wt-col' + (w === 0 ? ' sun' : w === 6 ? ' sat' : '')}>
          <span className="wt-day">{WEEKDAYS[w]}</span>
          {items.map(({ g, s }) => (
            <span key={g.id + s.start} className="wt-item">
              <i style={{ background: g.color }} />
              <span className="t">
                {s.start}–{s.end}
              </span>
              <span className="n">{g.name}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── 교재 ──────────────────────────────────────────────

export function BooksPage() {
  const { data, error, reload } = useApi<Textbook[]>('/textbooks');
  const [editing, setEditing] = useState<Textbook | null | undefined>(undefined);
  const [assign, setAssign] = useState<number | null>(null);
  const [focus, setFocus] = useState<Textbook | null>(null);
  const [cat, setCat] = useState('전체');
  const cats = useMemo(() => [...new Set((data ?? []).map((b) => b.category))].sort(), [data]);
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <div className="page">
      <PageHead
        title="교재"
        sub="교재를 등록하고 학생이나 반에 배정하세요. 진도는 학생 화면에서 기록합니다."
        actions={
          <>
            <Button onClick={() => setAssign(0)}>교재 배정</Button>
            <Button variant="primary" onClick={() => setEditing(null)}>
              <Plus /> 교재 추가
            </Button>
          </>
        }
      />
      {!data.length && <Empty title="등록한 교재가 없습니다." />}
      {data.length > 0 && (
        <div className="toolbar">
          <Segmented size="sm" value={cat} onChange={(c) => vt(() => setCat(c), 'swap')} options={['전체', ...cats].map((c) => ({ value: c, label: c }))} />
        </div>
      )}
      <div className="shelf swap-area">
        {data
          .filter((b) => cat === '전체' || b.category === cat)
          .map((b) => (
            <div key={b.id} className="shelf-item">
              <button type="button" className="shelf-cover" onClick={() => setFocus(b)} aria-label={`${b.title} 진도 보기`}>
                <BookCover book={b} size="lg" />
              </button>
              <span className="shelf-cat">{b.category}</span>
              <b className="shelf-title">{b.title}</b>
              <span className="fine">
                {b.publisher}
                {b.totalUnits ? ` · ${b.totalUnits}${b.unitLabel}` : ''}
              </span>
              <span className="fine">{b.inUse ? `${b.inUse}명 진행 중` : '진행 중인 학생 없음'}</span>
              <button type="button" className="link small" onClick={() => setEditing(b)}>
                고치기
              </button>
            </div>
          ))}
      </div>
      <TextbookSheet open={editing !== undefined} book={editing} onClose={() => setEditing(undefined)} />
      <AssignBookSheet open={assign !== null} textbookId={assign || undefined} onClose={() => setAssign(null)} />
      <BookStudentsSheet book={focus} onClose={() => setFocus(null)} onAssign={(id) => setAssign(id)} />
    </div>
  );
}

function BookStudentsSheet({ book, onClose, onAssign }: { book: Textbook | null; onClose(): void; onAssign(id: number): void }) {
  const { data } = useApi<StudentBook[]>(book ? `/student-books?textbookId=${book.id}` : null);
  const [editing, setEditing] = useState<StudentBook | null>(null);
  if (!book) return null;
  return (
    <Sheet
      open
      onClose={onClose}
      title={book.title}
      width={640}
      footer={
        <Button
          variant="primary"
          onClick={() => {
            onClose();
            onAssign(book.id);
          }}
        >
          <Plus /> 학생에게 배정
        </Button>
      }
    >
      {!data ? (
        <Loading />
      ) : data.length ? (
        <div className="list book-students">
          {data.map((sb) => (
            <div className="row" key={sb.id}>
              <span className="row-main">
                <span className="row-title">
                  <Link viewTransition to={`/students/${sb.studentId}?tab=books`} onClick={onClose}>
                    {sb.studentName}
                  </Link>{' '}
                  {sb.status !== 'current' && <Tag tone={sb.status === 'done' ? 'green' : 'gray'}>{{ current: '진행 중', planned: '예정', done: '완료' }[sb.status]}</Tag>}
                </span>
                <ProgressBar value={sb.progress} total={book.totalUnits} label={book.unitLabel} />
              </span>
              <button type="button" className="link" onClick={() => setEditing(sb)}>
                진도 기록
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="이 교재를 쓰는 학생이 없습니다." />
      )}
      <ProgressSheet sb={editing} onClose={() => setEditing(null)} />
    </Sheet>
  );
}

// ── 설정 ──────────────────────────────────────────────

export function SettingsPage() {
  const { me, academy, refresh } = useAuth();
  const ui = useUi();
  const teachers = useApi<TeacherAccount[]>('/teachers').data;
  const [f, setF] = useState(academy);
  const [adding, setAdding] = useState(false);
  const [reset, setReset] = useState<{ userId: number; name: string } | null>(null);
  useEffect(() => setF(academy), [academy]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (await ui.run(() => api.patch('/settings', f), '학원 정보를 저장했습니다.')) refresh();
  };
  const removeTeacher = async (t: TeacherAccount) => {
    const yes = await ui.confirm({ title: `${t.name} 선생님 계정을 지울까요?`, body: '이 선생님이 쓴 피드백은 남습니다.', ok: '지우기', danger: true });
    if (yes) await ui.run(() => api.del(`/teachers/${t.id}`), '계정을 지웠습니다.');
  };

  return (
    <div className="page">
      <PageHead title="설정" />
      <div className="two-col">
        <section className="block">
          <SectionHead title="학원 정보" />
          <form className="card form" onSubmit={save}>
            <Field label="학원 이름" wide>
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!me?.isAdmin} required />
            </Field>
            <Field label="전화번호" wide hint="로그인 화면과 상담 신청 안내에 보입니다">
              <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} disabled={!me?.isAdmin} />
            </Field>
            <Field label="주소" wide>
              <input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} disabled={!me?.isAdmin} />
            </Field>
            {me?.isAdmin && (
              <div className="form-actions">
                <Button type="submit" variant="primary">
                  저장
                </Button>
              </div>
            )}
          </form>
          <SectionHead title="내 비밀번호" />
          <PasswordForm />
        </section>
        <section className="block">
          <SectionHead
            title="선생님"
            count={teachers?.length}
            action={
              me?.isAdmin && (
                <button type="button" className="more" onClick={() => setAdding(true)}>
                  <Plus /> 선생님 추가
                </button>
              )
            }
          />
          {!teachers ? (
            <Loading />
          ) : (
            <div className="list">
              {teachers.map((t) => (
                <div className="row teacher-row" key={t.id}>
                  <Avatar name={t.name} size="sm" />
                  <span className="row-main">
                    <span className="row-title">
                      {t.name} {t.isAdmin && <Tag>원장</Tag>}
                    </span>
                    <span className="row-sub">
                      아이디 {t.loginId} · {t.lastLoginAt ? `${readStamp(t.lastLoginAt)} 접속` : '접속 기록 없음'}
                    </span>
                  </span>
                  {me?.isAdmin && t.id !== me.id && (
                    <span className="row-actions">
                      <button type="button" className="link" onClick={() => setReset({ userId: t.id, name: t.name })}>
                        비밀번호
                      </button>
                      <button type="button" className="link danger" onClick={() => removeTeacher(t)}>
                        지우기
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="fine">모든 선생님이 학생·일정·피드백을 똑같이 관리합니다. 학원 정보와 선생님 계정은 원장만 바꿀 수 있어요.</p>
        </section>
      </div>
      <TeacherSheet open={adding} onClose={() => setAdding(false)} />
      <ResetSheet target={reset} onClose={() => setReset(null)} />
    </div>
  );
}

function TeacherSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const ui = useUi();
  const [f, setF] = useState({ name: '', password: '', phone: '', isAdmin: false });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await ui.run<{ loginId: string }>(() => api.post('/teachers', f));
    if (r) {
      ui.toast(`선생님 계정을 만들었습니다. 아이디: ${r.loginId}`);
      setF({ name: '', password: '', phone: '', isAdmin: false });
      onClose();
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="선생님 추가"
      width={520}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" type="submit" form="teacher-form">
            만들기
          </Button>
        </>
      }
    >
      <form id="teacher-form" className="form" onSubmit={submit}>
        <div className="field-row">
          <Field label="이름" hint="로그인할 때 이 이름을 씁니다">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </Field>
          <Field label="연락처">
            <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
        </div>
        <Field label="처음 비밀번호" wide hint="6자 이상">
          <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} minLength={6} required />
        </Field>
        <label className="check">
          <input type="checkbox" checked={f.isAdmin} onChange={(e) => setF({ ...f, isAdmin: e.target.checked })} />
          원장 권한 <small>학원 정보와 선생님 계정을 관리할 수 있습니다</small>
        </label>
      </form>
    </Sheet>
  );
}

export function PasswordForm() {
  const ui = useUi();
  const [f, setF] = useState({ current: '', next: '', next2: '' });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.next !== f.next2) return ui.toast('새 비밀번호가 서로 다릅니다.', 'err');
    if (await ui.run(() => api.post('/auth/password', { current: f.current, next: f.next }), '비밀번호를 바꿨습니다.')) setF({ current: '', next: '', next2: '' });
  };
  return (
    <form className="card form" onSubmit={submit}>
      <Field label="지금 비밀번호" wide>
        <input type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required />
      </Field>
      <div className="field-row">
        <Field label="새 비밀번호" hint="6자 이상">
          <input type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} minLength={6} required />
        </Field>
        <Field label="새 비밀번호 확인">
          <input type="password" autoComplete="new-password" value={f.next2} onChange={(e) => setF({ ...f, next2: e.target.value })} required />
        </Field>
      </div>
      <div className="form-actions">
        <Button type="submit" variant="primary">
          비밀번호 바꾸기
        </Button>
      </div>
    </form>
  );
}

export function AccountPage() {
  const { me } = useAuth();
  return (
    <div className="page page-narrow">
      <PageHead eyebrow={`아이디 ${me?.loginId ?? ''}`} title="비밀번호 바꾸기" sub="바꾼 비밀번호는 다음 로그인부터 씁니다." />
      <PasswordForm />
    </div>
  );
}
