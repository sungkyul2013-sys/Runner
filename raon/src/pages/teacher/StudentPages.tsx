import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../lib/api';
import { peek, prefetch, useApi } from '../../lib/hooks';
import { markVt, vt } from '../../lib/motion';
import { Avatar, Button, Chevron, Empty, ErrorNote, Field, Loading, PageHead, Plus, SearchIcon, SectionHead, Segmented, Sheet, Tabs, Tag, useUi } from '../../components/ui';
import { BookCard, BookLogList } from '../../components/books';
import { SessionLine } from '../../components/schedule';
import { readStamp } from '../../components/letters';
import { AssignBookSheet, FeedbackSheet, ProgressSheet, StudentSheet } from './forms';
import { ScheduleBoard } from './CalendarPage';
import { FeedbackTable } from './FeedbackPages';
import { addDays, dotDate, todayIn } from '../../../shared/date';
import { AttendanceNumbers } from '../family/FamilyPages';
import type { CalSession, Feedback, MakeupOverview, StudentBook, StudentDetail, StudentRow } from '../../../shared/types';
import { ATTENDANCE_LABEL } from '../../../shared/types';

const STATUS_LABEL = { active: '재원', paused: '휴원', left: '퇴원' } as const;

export function StudentsPage() {
  const nav = useNavigate();
  const { data, error, reload } = useApi<StudentRow[]>('/students');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'paused' | 'left' | 'all'>('active');
  const [adding, setAdding] = useState(false);

  const list = useMemo(() => {
    const t = q.trim();
    return (data ?? []).filter(
      (s) =>
        (status === 'all' || s.status === status) &&
        (!t || s.name.includes(t) || s.school.includes(t) || s.grade.includes(t) || s.groups.some((g) => g.name.includes(t))),
    );
  }, [data, q, status]);
  const count = (st: string) => (data ?? []).filter((s) => s.status === st).length;

  return (
    <div className="page">
      <PageHead
        title="학생"
        sub={`재원 ${count('active')}명${count('paused') ? ` · 휴원 ${count('paused')}명` : ''}`}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus /> 학생 등록
          </Button>
        }
      />
      <div className="toolbar">
        <label className="search">
          <SearchIcon />
          <input placeholder="이름, 학교, 반으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Segmented
          size="sm"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'active' as const, label: '재원' },
            { value: 'paused' as const, label: '휴원' },
            { value: 'left' as const, label: '퇴원' },
            { value: 'all' as const, label: '전체' },
          ]}
        />
      </div>
      {error && <ErrorNote message={error} onRetry={reload} />}
      {!data ? (
        <Loading />
      ) : list.length ? (
        <div className="list table students-table">
          <div className="tr th">
            <span>이름</span>
            <span>학교 · 학년</span>
            <span>반</span>
            <span>지금 교재</span>
            <span>계정</span>
            <span />
          </div>
          {list.map((s) => (
            <Link
              viewTransition
              key={s.id}
              to={`/students/${s.id}`}
              className="tr"
              onClick={() => markVt('push')}
              onPointerEnter={() => prefetch([`/students/${s.id}`])}
            >
              <span className="td-name">
                <Avatar name={s.name} vtName={`stu-av-${s.id}`} />
                <span className="nm" style={{ viewTransitionName: `stu-${s.id}` } as CSSProperties}>
                  {s.name}
                </span>
                {s.status !== 'active' && <Tag>{STATUS_LABEL[s.status]}</Tag>}
              </span>
              <span className="td-mute">{[s.school, s.grade].filter(Boolean).join(' · ')}</span>
              <span className="td-mute">{s.groups.map((g) => g.name).join(', ') || '—'}</span>
              <span className="td-book">{s.currentBook ?? '—'}</span>
              <span className="td-acc">
                <span className={s.hasAccount ? 'on' : 'off'}>학생</span>
                <span className={s.parentCount ? 'on' : 'off'}>학부모{s.parentCount > 1 ? ` ${s.parentCount}` : ''}</span>
              </span>
              <Chevron />
            </Link>
          ))}
        </div>
      ) : (
        <Empty title={data.length ? '찾는 학생이 없습니다.' : '아직 등록한 학생이 없습니다.'}>
          {!data.length && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              첫 학생 등록하기
            </Button>
          )}
        </Empty>
      )}
      <StudentSheet open={adding} onClose={() => setAdding(false)} onSaved={(id) => (markVt('push'), nav(`/students/${id}`, { viewTransition: true }))} />
    </div>
  );
}

type Tab = 'schedule' | 'books' | 'feedback' | 'attendance' | 'account';
const TABS: { key: Tab; label: string }[] = [
  { key: 'schedule', label: '일정' },
  { key: 'books', label: '교재' },
  { key: 'feedback', label: '피드백' },
  { key: 'attendance', label: '출결·보강' },
  { key: 'account', label: '정보·계정' },
];

export function StudentDetailPage() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'schedule';
  const { data, error, reload } = useApi<StudentDetail>(`/students/${id}`);
  const [editing, setEditing] = useState(false);
  const [writing, setWriting] = useState(false);
  // 목록에서 넘어오는 동안에는 목록에 있던 정보로 머리말을 먼저 그린다 (이름이 그대로 이어지도록)
  const row = (peek<StudentRow[]>('/students') ?? []).find((r) => r.id === id);
  const s = data ?? (row ? ({ ...row, account: null, parents: [] } as StudentDetail) : undefined);

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!s) return <Loading />;

  return (
    <div className="page page-wide">
      <Link viewTransition to="/students" className="back" onClick={() => markVt('pop')}>
        <Chevron dir="left" /> 학생
      </Link>
      <header className="page-head student-head">
        <div className="student-id">
          <Avatar name={s.name} size="lg" vtName={`stu-av-${s.id}`} />
          <div className="page-head-text">
            <p className="eyebrow">{[s.school, s.grade].filter(Boolean).join(' · ') || '학생'}</p>
            <h1 className="page-title">
              <span style={{ viewTransitionName: `stu-${s.id}` } as CSSProperties}>{s.name}</span>
              {s.status !== 'active' && <Tag>{STATUS_LABEL[s.status]}</Tag>}
            </h1>
            <p className="page-sub">
              {s.groups.length ? s.groups.map((g) => g.name).join(' · ') : '반 없음'}
              {s.currentBook && <> · 「{s.currentBook}」</>}
            </p>
          </div>
        </div>
        <div className="page-actions">
          <Button onClick={() => setEditing(true)}>정보 고치기</Button>
          <Button variant="primary" onClick={() => setWriting(true)}>
            피드백 쓰기
          </Button>
        </div>
      </header>
      <Tabs value={tab} tabs={TABS} onChange={(t) => vt(() => setParams({ tab: t }, { replace: true }), 'swap')} />
      <div className="tab-panel" key={tab}>
        {!data ? (
          <Loading />
        ) : (
          <>
            {tab === 'schedule' && <ScheduleBoard studentId={data.id} compact />}
            {tab === 'books' && <StudentBooksTab s={data} />}
            {tab === 'feedback' && <StudentFeedbackTab s={data} onWrite={() => setWriting(true)} />}
            {tab === 'attendance' && <StudentAttendanceTab s={data} />}
            {tab === 'account' && <StudentAccountTab s={data} />}
          </>
        )}
      </div>
      <StudentSheet open={editing} student={data} onClose={() => setEditing(false)} />
      <FeedbackSheet open={writing} studentId={s.id} onClose={() => setWriting(false)} />
    </div>
  );
}

function StudentBooksTab({ s }: { s: StudentDetail }) {
  const { data } = useApi<StudentBook[]>(`/student-books?studentId=${s.id}`);
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState<StudentBook | null>(null);
  if (!data) return <Loading />;
  const sections = [
    ['current', '지금 진행 중'],
    ['planned', '다음 예정'],
    ['done', '끝낸 교재'],
  ] as const;
  return (
    <div className="tab-body">
      <div className="tab-actions">
        <p className="fine">여기서 정한 교재와 진도가 학생·학부모 화면에 그대로 보입니다.</p>
        <Button variant="primary" size="sm" onClick={() => setAssigning(true)}>
          <Plus /> 교재 배정
        </Button>
      </div>
      {!data.length && <Empty title="배정된 교재가 없습니다." />}
      {sections.map(([key, title]) => {
        const list = data.filter((b) => b.status === key);
        if (!list.length) return null;
        return (
          <section className="block" key={key}>
            <SectionHead title={title} count={list.length} />
            <div className="list books">
              {list.map((b) => (
                <BookCard key={b.id} sb={b} compact={key !== 'current'}>
                  {key === 'current' && <BookLogList sb={b} />}
                  <div className="book-actions">
                    <Button size="sm" variant={key === 'current' ? 'primary' : 'secondary'} onClick={() => setEditing(b)}>
                      {key === 'current' ? '진도 기록' : '상태 바꾸기'}
                    </Button>
                  </div>
                </BookCard>
              ))}
            </div>
          </section>
        );
      })}
      <AssignBookSheet open={assigning} studentId={s.id} onClose={() => setAssigning(false)} />
      <ProgressSheet sb={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function StudentFeedbackTab({ s, onWrite }: { s: StudentDetail; onWrite(): void }) {
  const [aud, setAud] = useState<'' | 'student' | 'parent'>('');
  const { data } = useApi<Feedback[]>(`/feedback${qs({ studentId: s.id, audience: aud })}`);
  return (
    <div className="tab-body">
      <div className="tab-actions">
        <Segmented
          size="sm"
          value={aud}
          onChange={setAud}
          options={[
            { value: '' as const, label: '전체' },
            { value: 'student' as const, label: '학생에게' },
            { value: 'parent' as const, label: '학부모님께' },
          ]}
        />
        <Button variant="primary" size="sm" onClick={onWrite}>
          피드백 쓰기
        </Button>
      </div>
      {!s.account && aud !== 'parent' && <p className="hint-line">학생 계정이 없어 학생에게 쓴 글을 볼 사람이 없습니다. ‘정보·계정’에서 만들 수 있어요.</p>}
      {!s.parents.length && aud !== 'student' && <p className="hint-line">연결된 학부모 계정이 없습니다.</p>}
      {data ? <FeedbackTable list={data} showStudent={false} /> : <Loading />}
    </div>
  );
}

function StudentAttendanceTab({ s }: { s: StudentDetail }) {
  const today = todayIn();
  const from = addDays(today, -59);
  const { data } = useApi<CalSession[]>(`/calendar${qs({ from, to: today, studentId: s.id })}`);
  const makeups = useApi<MakeupOverview>('/makeups').data;
  if (!data) return <Loading />;
  const rows = data
    .filter((x) => x.students.some((p) => p.id === s.id && p.status))
    .reverse();
  const mine = (x: CalSession) => x.students.find((p) => p.id === s.id)!;
  const count = (st: string) => rows.filter((x) => mine(x).status === st).length;
  const pending = makeups?.pending.filter((n) => n.students.some((p) => p.id === s.id)) ?? [];
  const upcoming = makeups?.upcoming.filter((x) => x.students.some((p) => p.id === s.id)) ?? [];

  return (
    <div className="tab-body two-col">
      <section className="block">
        <SectionHead title="최근 60일 출결" />
        <AttendanceNumbers a={{ present: count('present'), late: count('late'), absent: count('absent') }} />
        {rows.length ? (
          <div className="list">
            {rows.map((x) => {
              const p = mine(x);
              return (
                <SessionLine
                  key={x.date + x.key}
                  s={x}
                  showDate
                  aside={<Tag tone={p.status === 'absent' ? 'red' : p.status === 'late' ? 'orange' : 'gray'}>{ATTENDANCE_LABEL[p.status!]}</Tag>}
                />
              );
            })}
          </div>
        ) : (
          <Empty title="기록된 출결이 없습니다." />
        )}
      </section>
      <section className="block">
        <SectionHead title="보강 대기" count={pending.length} />
        {pending.length ? (
          <div className="list">
            {pending.map((n) => (
              <div className="row" key={n.type + n.id}>
                <span className="row-main">
                  <span className="row-title">{n.label}</span>
                  <span className="row-sub">
                    {dotDate(n.date)} {n.type === 'absence' ? '결석' : '휴강'}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="밀린 보강이 없습니다." />
        )}
        <p className="fine">
          <Link viewTransition to="/makeups">보강 화면</Link>에서 일정을 잡을 수 있어요.
        </p>
        <SectionHead title="예정된 보강" count={upcoming.length} />
        {upcoming.length ? (
          <div className="list">
            {upcoming.map((x) => (
              <SessionLine key={x.key} s={x} showDate />
            ))}
          </div>
        ) : (
          <Empty title="예정된 보강이 없습니다." />
        )}
      </section>
    </div>
  );
}

/** 설정 앱처럼: 왼쪽 이름표, 오른쪽 값 */
function KV({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="row kv">
      <span className="row-k">{k}</span>
      <span className="row-v">{children}</span>
    </div>
  );
}

function StudentAccountTab({ s }: { s: StudentDetail }) {
  const ui = useUi();
  const nav = useNavigate();
  const [acc, setAcc] = useState(false);
  const [parent, setParent] = useState(false);
  const [reset, setReset] = useState<{ userId: number; name: string } | null>(null);

  const removeParent = async (userId: number, name: string) => {
    const yes = await ui.confirm({ title: `${name} 님 연결을 끊을까요?`, body: '다른 자녀와 연결되어 있지 않으면 계정도 함께 지워집니다.', ok: '연결 끊기', danger: true });
    if (yes) await ui.run(() => api.del(`/students/${s.id}/parents/${userId}`), '연결을 끊었습니다.');
  };
  const removeStudent = async () => {
    const yes = await ui.confirm({
      title: `${s.name} 학생을 완전히 지울까요?`,
      body: '출결·피드백·교재 기록이 모두 지워지고 되돌릴 수 없습니다. 그만둔 학생은 ‘퇴원’으로 바꿔 두는 것을 권합니다.',
      ok: '완전히 지우기',
      danger: true,
    });
    if (yes && (await ui.run(() => api.del(`/students/${s.id}`), '학생을 지웠습니다.'))) (markVt('pop'), nav('/students', { viewTransition: true }));
  };
  const removeAccount = async () => {
    const yes = await ui.confirm({ title: '학생 계정을 지울까요?', body: '학생이 더 이상 로그인할 수 없습니다. 기록은 남습니다.', ok: '계정 지우기', danger: true });
    if (yes) await ui.run(() => api.del(`/students/${s.id}/account`), '학생 계정을 지웠습니다.');
  };

  return (
    <div className="tab-body two-col">
      <section className="block">
        <SectionHead title="학생 계정" />
        {s.account ? (
          <div className="list">
            <KV k="아이디">{s.account.loginId}</KV>
            <KV k="마지막 접속">{s.account.lastLoginAt ? readStamp(s.account.lastLoginAt) : '아직 없음'}</KV>
            <button type="button" className="row row-link" onClick={() => setAcc(true)}>
              아이디·비밀번호 바꾸기
            </button>
            <button type="button" className="row row-link is-danger" onClick={removeAccount}>
              계정 지우기
            </button>
          </div>
        ) : (
          <div className="list">
            <div className="row">
              <span className="row-main">
                <span className="row-sub">계정을 만들면 학생이 자기 일정·교재·피드백을 볼 수 있어요. 아이디는 학생 이름입니다.</span>
              </span>
            </div>
            <button type="button" className="row row-link" onClick={() => setAcc(true)}>
              학생 계정 만들기
            </button>
          </div>
        )}

        <SectionHead
          title="학부모 계정"
          count={s.parents.length}
          action={
            <button type="button" className="more" onClick={() => setParent(true)}>
              <Plus /> 학부모 추가
            </button>
          }
        />
        {s.parents.length ? (
          s.parents.map((p) => (
            <div className="list" key={p.userId}>
              <div className="row">
                <Avatar name={p.name} size="sm" />
                <span className="row-main">
                  <span className="row-title">
                    {p.name} <span className="row-light">{p.relation}</span>
                  </span>
                </span>
              </div>
              <KV k="아이디">{p.loginId}</KV>
              <KV k="연락처">{p.phone ? <a href={`tel:${p.phone}`}>{p.phone}</a> : '—'}</KV>
              <KV k="마지막 접속">{p.lastLoginAt ? readStamp(p.lastLoginAt) : '아직 없음'}</KV>
              <button type="button" className="row row-link" onClick={() => setReset({ userId: p.userId, name: p.name })}>
                비밀번호 새로 만들기
              </button>
              <button type="button" className="row row-link is-danger" onClick={() => removeParent(p.userId, p.name)}>
                연결 끊기
              </button>
            </div>
          ))
        ) : (
          <Empty title="연결된 학부모 계정이 없습니다." />
        )}
      </section>
      <section className="block">
        <SectionHead title="기본 정보" />
        <div className="list">
          <KV k="학교">{s.school || '—'}</KV>
          <KV k="학년">{s.grade || '—'}</KV>
          <KV k="연락처">{s.phone ? <a href={`tel:${s.phone}`}>{s.phone}</a> : '—'}</KV>
          <KV k="등록일">{s.createdAt.slice(0, 10).replace(/-/g, '.')}</KV>
        </div>
        {s.memo && (
          <>
            <SectionHead title="선생님 메모" />
            <p className="card memo-block">{s.memo}</p>
          </>
        )}
        <div className="list danger-zone">
          <button type="button" className="row row-link is-danger" onClick={removeStudent}>
            학생 기록 완전히 지우기
          </button>
        </div>
      </section>
      <AccountSheet open={acc} s={s} onClose={() => setAcc(false)} />
      <ParentSheet open={parent} s={s} onClose={() => setParent(false)} />
      <ResetSheet target={reset} onClose={() => setReset(null)} />
    </div>
  );
}

function AccountSheet({ open, s, onClose }: { open: boolean; s: StudentDetail; onClose(): void }) {
  const ui = useUi();
  const [loginId, setLoginId] = useState(s.account?.loginId ?? '');
  const [password, setPassword] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await ui.run<StudentDetail>(() => api.put(`/students/${s.id}/account`, { loginId: loginId || undefined, password: password || undefined }));
    if (r) {
      ui.toast(`학생 계정을 저장했습니다. 아이디: ${r.account?.loginId}`);
      onClose();
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={s.account ? '학생 계정 바꾸기' : '학생 계정 만들기'}
      width={460}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" type="submit" form="acc-form">
            저장
          </Button>
        </>
      }
    >
      <form id="acc-form" className="form" onSubmit={submit}>
        <Field label="아이디" wide hint={`비워 두면 학생 이름(${s.name})이 아이디가 됩니다. 같은 이름이 있으면 숫자가 붙어요.`}>
          <input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder={s.name} autoCapitalize="none" spellCheck={false} />
        </Field>
        <Field label={s.account ? '새 비밀번호' : '처음 비밀번호'} wide hint={s.account ? '비워 두면 그대로 둡니다' : '6자 이상. 학생에게 알려 주세요.'}>
          <input value={password} onChange={(e) => setPassword(e.target.value)} required={!s.account} minLength={6} />
        </Field>
      </form>
    </Sheet>
  );
}

function ParentSheet({ open, s, onClose }: { open: boolean; s: StudentDetail; onClose(): void }) {
  const ui = useUi();
  const [mode, setMode] = useState<'new' | 'link'>('new');
  const blank = { name: '', phone: '', relation: '어머니', password: '', existingLoginId: '' };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = mode === 'new' ? { name: f.name, phone: f.phone, relation: f.relation, password: f.password } : { existingLoginId: f.existingLoginId, relation: f.relation };
    const r = await ui.run<StudentDetail>(() => api.post(`/students/${s.id}/parents`, body));
    if (r) {
      const added = r.parents.find((p) => (mode === 'new' ? p.name === f.name : p.loginId === f.existingLoginId.replace(/\s+/g, '')));
      ui.toast(added ? `학부모 계정을 연결했습니다. 아이디: ${added.loginId}` : '학부모 계정을 연결했습니다.');
      setF(blank);
      onClose();
    }
  };
  const relation = (
    <Field label="관계">
      <select value={f.relation} onChange={set('relation')}>
        <option>어머니</option>
        <option>아버지</option>
        <option>보호자</option>
      </select>
    </Field>
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="학부모 추가"
      width={520}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" type="submit" form="parent-form">
            저장
          </Button>
        </>
      }
    >
      <form id="parent-form" className="form" onSubmit={submit}>
        <Segmented
          size="sm"
          value={mode}
          onChange={(m) => vt(() => setMode(m), 'swap')}
          options={[
            { value: 'new' as const, label: '새 계정' },
            { value: 'link' as const, label: '형제·자매 계정 연결' },
          ]}
        />
        {mode === 'new' ? (
          <>
            <div className="field-row">
              <Field label="이름" hint="로그인할 때 이 이름을 씁니다">
                <input value={f.name} onChange={set('name')} required />
              </Field>
              {relation}
            </div>
            <div className="field-row">
              <Field label="연락처">
                <input value={f.phone} onChange={set('phone')} inputMode="tel" />
              </Field>
              <Field label="처음 비밀번호" hint="6자 이상">
                <input value={f.password} onChange={set('password')} required minLength={6} />
              </Field>
            </div>
          </>
        ) : (
          <div className="field-row">
            <Field label="이미 있는 학부모 이름" hint="형제·자매가 함께 다니면 한 계정으로 두 아이를 볼 수 있어요">
              <input value={f.existingLoginId} onChange={set('existingLoginId')} spellCheck={false} required />
            </Field>
            {relation}
          </div>
        )}
      </form>
    </Sheet>
  );
}

export function ResetSheet({ target, onClose }: { target: { userId: number; name: string } | null; onClose(): void }) {
  const ui = useUi();
  const [pw, setPw] = useState('');
  if (!target) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await ui.run(() => api.post(`/users/${target.userId}/password`, { password: pw }), '새 비밀번호를 만들었습니다.')) {
      setPw('');
      onClose();
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${target.name} 님 비밀번호`}
      width={420}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" type="submit" form="reset-form">
            바꾸기
          </Button>
        </>
      }
    >
      <form id="reset-form" className="form" onSubmit={submit}>
        <Field label="새 비밀번호" wide hint="6자 이상. 바꾸면 이 계정은 모든 기기에서 로그아웃됩니다.">
          <input value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} required />
        </Field>
      </form>
    </Sheet>
  );
}
