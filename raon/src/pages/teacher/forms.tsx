import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { Button, Field, Segmented, Sheet, useUi } from '../../components/ui';
import { ColorPicker, COLORS, SlotEditor, StudentPicker } from '../../components/pickers';
import { BookCover } from '../../components/books';
import type {
  EventInput,
  EventKind,
  Group,
  GroupSlot,
  StudentBook,
  StudentDetail,
  StudentRow,
  Textbook,
} from '../../../shared/types';
import { BOOK_CATEGORIES, EVENT_LABEL, FEEDBACK_CATEGORIES } from '../../../shared/types';
import { dotDate, todayIn } from '../../../shared/date';

// ── 일정 (보강·휴강·시험·상담…) ─────────────────────────

export interface EventDraft extends Partial<EventInput> {
  eventId?: number;
  originText?: string;
}

const KIND_OPTIONS: EventKind[] = ['makeup', 'cancel', 'exam', 'consult', 'extra', 'holiday', 'etc'];

export function EventSheet({ draft, onClose }: { draft: EventDraft | null; onClose(): void }) {
  const ui = useUi();
  const groups = useApi<Group[]>(draft ? '/groups' : null).data ?? [];
  const students = useApi<StudentRow[]>(draft ? '/students' : null).data ?? [];
  const [f, setF] = useState<EventDraft>({});
  const [target, setTarget] = useState<'group' | 'students' | 'all'>('students');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!draft) return;
    const d: EventDraft = { kind: 'makeup', date: todayIn(), start: '', end: '', studentIds: [], groupId: null, title: '', room: '', memo: '', ...draft };
    setF(d);
    setTarget(d.groupId ? 'group' : d.studentIds?.length || d.kind === 'makeup' || d.kind === 'consult' ? 'students' : 'all');
  }, [draft]);

  if (!draft) return null;
  const kind = f.kind ?? 'makeup';
  const set = (patch: Partial<EventDraft>) => setF((x) => ({ ...x, ...patch }));
  const needsGroupOnly = kind === 'cancel';
  const allowAll = kind === 'holiday' || kind === 'exam' || kind === 'etc' || kind === 'extra';
  const effTarget = kind === 'holiday' ? 'all' : needsGroupOnly ? 'group' : target;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body: EventInput = {
      kind,
      date: f.date!,
      start: kind === 'holiday' || kind === 'cancel' ? null : f.start || null,
      end: kind === 'holiday' || kind === 'cancel' ? null : f.end || null,
      title: f.title,
      room: f.room,
      memo: f.memo,
      groupId: effTarget === 'group' ? f.groupId ?? null : null,
      studentIds: effTarget === 'students' ? f.studentIds ?? [] : [],
      noMakeup: f.noMakeup,
      originDate: f.originDate ?? null,
      originLabel: f.originLabel ?? null,
      attendanceIds: f.attendanceIds,
      cancelEventIds: f.cancelEventIds,
    };
    const ok = await ui.run(
      () => (draft.eventId ? api.patch(`/events/${draft.eventId}`, body) : api.post('/events', body)),
      draft.eventId ? '일정을 고쳤습니다.' : `${EVENT_LABEL[kind]} 일정을 등록했습니다.`,
    );
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!draft.eventId) return;
    const yes = await ui.confirm({
      title: '이 일정을 지울까요?',
      body: kind === 'makeup' ? '연결된 결석·휴강은 다시 ‘보강 대기’로 돌아갑니다.' : '지운 일정은 되돌릴 수 없습니다.',
      ok: '지우기',
      danger: true,
    });
    if (!yes) return;
    if (await ui.run(() => api.del(`/events/${draft.eventId}`), '일정을 지웠습니다.')) onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={draft.eventId ? `${EVENT_LABEL[kind]} 고치기` : draft.kind === 'makeup' && draft.originText ? '보강 잡기' : '일정 추가'}
      width={620}
      footer={
        <>
          {draft.eventId && (
            <Button variant="ghost" className="danger mr-auto" onClick={remove}>
              지우기
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant={kind === 'makeup' ? 'red' : 'primary'} type="submit" form="event-form" busy={busy}>
            저장
          </Button>
        </>
      }
    >
      <form id="event-form" className="form" onSubmit={submit}>
        {draft.originText && (
          <p className="origin-note">
            <span>원래 수업</span>
            {draft.originText}
          </p>
        )}
        {!draft.eventId && !draft.originText && (
          <Field label="종류" wide>
            <Segmented value={kind} onChange={(k) => set({ kind: k })} options={KIND_OPTIONS.map((k) => ({ value: k, label: EVENT_LABEL[k] }))} />
          </Field>
        )}
        <div className="field-row">
          <Field label="날짜">
            <input type="date" value={f.date ?? ''} onChange={(e) => set({ date: e.target.value })} required />
          </Field>
          {kind !== 'holiday' && kind !== 'cancel' && (
            <>
              <Field label="시작">
                <input type="time" value={f.start ?? ''} onChange={(e) => set({ start: e.target.value })} required={kind === 'makeup'} />
              </Field>
              <Field label="끝">
                <input type="time" value={f.end ?? ''} onChange={(e) => set({ end: e.target.value })} />
              </Field>
            </>
          )}
        </div>

        {kind !== 'holiday' && (
          <Field label={kind === 'cancel' ? '휴강할 반' : '대상'} wide>
            {!needsGroupOnly && (
              <Segmented
                size="sm"
                value={target}
                onChange={setTarget}
                options={[
                  { value: 'students' as const, label: '학생 고르기' },
                  { value: 'group' as const, label: '반 전체' },
                  ...(allowAll ? [{ value: 'all' as const, label: '학원 전체' }] : []),
                ]}
              />
            )}
            {effTarget === 'group' && (
              <select value={f.groupId ?? ''} onChange={(e) => set({ groupId: Number(e.target.value) || null })} required>
                <option value="">반을 고르세요</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
            {effTarget === 'students' && <StudentPicker students={students.filter((s) => s.status === 'active')} value={f.studentIds ?? []} onChange={(ids) => set({ studentIds: ids })} max={200} />}
          </Field>
        )}

        <div className="field-row">
          <Field label={kind === 'cancel' ? '사유' : '제목'} hint={kind === 'cancel' || kind === 'holiday' ? '학생·학부모 달력에 그대로 보입니다' : '비워 두면 자동으로 붙습니다'}>
            <input value={f.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder={kind === 'holiday' ? '예: 추석 연휴' : kind === 'cancel' ? '예: 학교 축제' : ''} />
          </Field>
          {kind !== 'holiday' && kind !== 'cancel' && (
            <Field label="강의실">
              <input value={f.room ?? ''} onChange={(e) => set({ room: e.target.value })} />
            </Field>
          )}
        </div>
        <Field label="메모" wide hint="학생·학부모에게도 보입니다">
          <textarea rows={2} value={f.memo ?? ''} onChange={(e) => set({ memo: e.target.value })} />
        </Field>
        {kind === 'cancel' && (
          <label className="check">
            <input type="checkbox" checked={!!f.noMakeup} onChange={(e) => set({ noMakeup: e.target.checked })} />
            보강하지 않음 <small>체크하지 않으면 ‘보강 대기’ 목록에 올라갑니다</small>
          </label>
        )}
      </form>
    </Sheet>
  );
}

// ── 피드백 쓰기 ────────────────────────────────────────

export function FeedbackSheet({ open, studentId, onClose }: { open: boolean; studentId?: number; onClose(): void }) {
  const ui = useUi();
  const students = useApi<StudentRow[]>(open && !studentId ? '/students' : null).data ?? [];
  const empty = { studentId: studentId ?? 0, classDate: todayIn(), category: '수업', title: '', toStudent: '', toParent: '' };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF({ ...empty, studentId: studentId ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, studentId]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: k === 'studentId' ? Number(e.target.value) : e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await ui.run(() => api.post('/feedback', f), '피드백을 보냈습니다.');
    setBusy(false);
    if (r) onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="피드백 쓰기"
      width={860}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" type="submit" form="fb-form" busy={busy}>
            보내기
          </Button>
        </>
      }
    >
      <form id="fb-form" className="form" onSubmit={submit}>
        <div className="field-row">
          {!studentId && (
            <Field label="학생">
              <select value={f.studentId || ''} onChange={set('studentId')} required>
                <option value="">학생을 고르세요</option>
                {students
                  .filter((s) => s.status !== 'left')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.grade} {s.groups[0]?.name ?? ''}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label="수업 날짜">
            <input type="date" value={f.classDate} onChange={set('classDate')} />
          </Field>
          <Field label="분류">
            <select value={f.category} onChange={set('category')}>
              {FEEDBACK_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="제목" wide hint="비워 두면 첫 줄이 제목처럼 보입니다">
          <input value={f.title} onChange={set('title')} maxLength={80} />
        </Field>
        <div className="fb-split">
          <Field label="학생에게" wide hint="학생 계정에만 보입니다">
            <textarea rows={9} value={f.toStudent} onChange={set('toStudent')} placeholder="오늘 수업에서 잘한 점, 다음 시간까지 할 일…" />
          </Field>
          <Field label="학부모님께" wide hint="학부모 계정에만 보입니다">
            <textarea rows={9} value={f.toParent} onChange={set('toParent')} placeholder="학습 상황, 가정에서 도와주실 부분…" />
          </Field>
        </div>
        <p className="fine">한쪽만 써도 됩니다. 쓴 쪽에만 전달됩니다.</p>
      </form>
    </Sheet>
  );
}

// ── 학생 등록·수정 ─────────────────────────────────────

export function StudentSheet({ open, student, onClose, onSaved }: { open: boolean; student?: StudentDetail; onClose(): void; onSaved?(id: number): void }) {
  const ui = useUi();
  const groups = useApi<Group[]>(open ? '/groups' : null).data ?? [];
  const init = () => ({
    name: student?.name ?? '',
    school: student?.school ?? '',
    grade: student?.grade ?? '',
    phone: student?.phone ?? '',
    memo: student?.memo ?? '',
    color: student?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)],
    status: student?.status ?? 'active',
    groupIds: student?.groups.map((g) => g.id) ?? [],
    makeAccount: false,
    loginId: '',
    password: '',
    makeParent: false,
    parentName: '',
    parentPhone: '',
    relation: '어머니',
    parentLoginId: '',
    parentPassword: '',
  });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student]);
  const set = (k: keyof ReturnType<typeof init>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body: any = {
      name: f.name,
      school: f.school,
      grade: f.grade,
      phone: f.phone,
      memo: f.memo,
      color: f.color,
      status: f.status,
      groupIds: f.groupIds,
    };
    if (!student && f.makeAccount) body.account = { loginId: f.loginId, password: f.password };
    if (!student && f.makeParent)
      body.parents = [{ name: f.parentName, phone: f.parentPhone, relation: f.relation, loginId: f.parentLoginId, password: f.parentPassword }];
    const r = await ui.run<StudentDetail>(
      () => (student ? api.patch(`/students/${student.id}`, body) : api.post('/students', body)),
      student ? '학생 정보를 고쳤습니다.' : `${f.name} 학생을 등록했습니다.`,
    );
    setBusy(false);
    if (r) {
      onClose();
      onSaved?.(r.id);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={student ? '학생 정보 고치기' : '학생 등록'}
      width={680}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" type="submit" form="student-form" busy={busy}>
            저장
          </Button>
        </>
      }
    >
      <form id="student-form" className="form" onSubmit={submit}>
        <div className="field-row">
          <Field label="이름">
            <input value={f.name} onChange={set('name')} required maxLength={30} />
          </Field>
          <Field label="학교">
            <input value={f.school} onChange={set('school')} maxLength={40} />
          </Field>
          <Field label="학년">
            <input value={f.grade} onChange={set('grade')} placeholder="예: 고2" maxLength={20} />
          </Field>
        </div>
        <div className="field-row">
          <Field label="학생 연락처">
            <input value={f.phone} onChange={set('phone')} inputMode="tel" />
          </Field>
          {student && (
            <Field label="상태">
              <select value={f.status} onChange={set('status')}>
                <option value="active">재원</option>
                <option value="paused">휴원</option>
                <option value="left">퇴원</option>
              </select>
            </Field>
          )}
        </div>
        <Field label="듣는 반" wide>
          <div className="chip-set">
            {groups.map((g) => (
              <label key={g.id} className={'chip' + (f.groupIds.includes(g.id) ? ' is-on' : '')}>
                <input
                  type="checkbox"
                  checked={f.groupIds.includes(g.id)}
                  onChange={() => setF({ ...f, groupIds: f.groupIds.includes(g.id) ? f.groupIds.filter((x) => x !== g.id) : [...f.groupIds, g.id] })}
                />
                <i style={{ background: g.color }} />
                {g.name}
              </label>
            ))}
            {!groups.length && <span className="fine">아직 만든 반이 없습니다.</span>}
          </div>
        </Field>
        <Field label="표시 색" wide>
          <ColorPicker value={f.color} onChange={(c) => setF({ ...f, color: c })} />
        </Field>
        <Field label="선생님 메모" wide hint="학생·학부모에게는 보이지 않습니다">
          <textarea rows={2} value={f.memo} onChange={set('memo')} />
        </Field>

        {!student && (
          <>
            <label className="check">
              <input type="checkbox" checked={f.makeAccount} onChange={set('makeAccount')} />
              학생 로그인 계정 만들기
            </label>
            {f.makeAccount && (
              <div className="field-row sub-block">
                <Field label="학생 아이디" hint="영문·숫자">
                  <input value={f.loginId} onChange={set('loginId')} autoCapitalize="none" spellCheck={false} required />
                </Field>
                <Field label="처음 비밀번호" hint="6자 이상">
                  <input value={f.password} onChange={set('password')} required minLength={6} />
                </Field>
              </div>
            )}
            <label className="check">
              <input type="checkbox" checked={f.makeParent} onChange={set('makeParent')} />
              학부모 계정도 만들기
            </label>
            {f.makeParent && (
              <div className="sub-block">
                <div className="field-row">
                  <Field label="학부모 이름">
                    <input value={f.parentName} onChange={set('parentName')} required />
                  </Field>
                  <Field label="관계">
                    <select value={f.relation} onChange={set('relation')}>
                      <option>어머니</option>
                      <option>아버지</option>
                      <option>보호자</option>
                    </select>
                  </Field>
                  <Field label="연락처">
                    <input value={f.parentPhone} onChange={set('parentPhone')} inputMode="tel" />
                  </Field>
                </div>
                <div className="field-row">
                  <Field label="학부모 아이디">
                    <input value={f.parentLoginId} onChange={set('parentLoginId')} autoCapitalize="none" spellCheck={false} required />
                  </Field>
                  <Field label="처음 비밀번호" hint="6자 이상">
                    <input value={f.parentPassword} onChange={set('parentPassword')} required minLength={6} />
                  </Field>
                </div>
              </div>
            )}
          </>
        )}
      </form>
    </Sheet>
  );
}

// ── 반 만들기·고치기 ───────────────────────────────────

export function GroupSheet({ open, group, onClose }: { open: boolean; group?: Group | null; onClose(): void }) {
  const ui = useUi();
  const students = useApi<StudentRow[]>(open ? '/students' : null).data ?? [];
  const init = () => ({
    name: group?.name ?? '',
    room: group?.room ?? '',
    memo: group?.memo ?? '',
    color: group?.color ?? COLORS[0],
    slots: (group?.slots ?? [{ weekday: 1, start: '19:00', end: '21:00' }]) as GroupSlot[],
    memberIds: group?.members.map((m) => m.id) ?? [],
  });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await ui.run(() => (group ? api.patch(`/groups/${group.id}`, f) : api.post('/groups', f)), group ? '반을 고쳤습니다.' : '반을 만들었습니다.');
    setBusy(false);
    if (r) onClose();
  };

  const remove = async () => {
    if (!group) return;
    const yes = await ui.confirm({
      title: `${group.name}을(를) 지울까요?`,
      body: '이 반의 정규 수업 일정이 달력에서 사라집니다. 학생 정보와 피드백은 남습니다.',
      ok: '지우기',
      danger: true,
    });
    if (yes && (await ui.run(() => api.del(`/groups/${group.id}`), '반을 지웠습니다.'))) onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={group ? '반 고치기' : '새 반 만들기'}
      width={680}
      footer={
        <>
          {group && (
            <Button variant="ghost" className="danger mr-auto" onClick={remove}>
              반 지우기
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" type="submit" form="group-form" busy={busy}>
            저장
          </Button>
        </>
      }
    >
      <form id="group-form" className="form" onSubmit={submit}>
        <div className="field-row">
          <Field label="반 이름">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="예: 고2 문학·독서" required />
          </Field>
          <Field label="강의실">
            <input value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} />
          </Field>
        </div>
        <Field label="정규 수업 시간" wide hint="매주 반복됩니다. 달력에 자동으로 표시돼요.">
          <SlotEditor slots={f.slots} onChange={(slots) => setF({ ...f, slots })} />
        </Field>
        <Field label="색" wide>
          <ColorPicker value={f.color} onChange={(color) => setF({ ...f, color })} />
        </Field>
        <Field label="학생" wide>
          <StudentPicker students={students.filter((s) => s.status !== 'left')} value={f.memberIds} onChange={(memberIds) => setF({ ...f, memberIds })} />
        </Field>
        <Field label="메모" wide>
          <textarea rows={2} value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} />
        </Field>
      </form>
    </Sheet>
  );
}

// ── 교재 ──────────────────────────────────────────────

export function TextbookSheet({ open, book, onClose }: { open: boolean; book?: Textbook | null; onClose(): void }) {
  const ui = useUi();
  const init = () => ({
    title: book?.title ?? '',
    publisher: book?.publisher ?? '',
    category: book?.category ?? '문학',
    totalUnits: book?.totalUnits ?? 20,
    unitLabel: book?.unitLabel ?? '강',
    color: book?.color ?? COLORS[0],
    memo: book?.memo ?? '',
  });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, book]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await ui.run(() => (book ? api.patch(`/textbooks/${book.id}`, f) : api.post('/textbooks', f)), book ? '교재를 고쳤습니다.' : '교재를 추가했습니다.');
    setBusy(false);
    if (r) onClose();
  };
  const remove = async () => {
    if (!book) return;
    const yes = await ui.confirm({ title: `「${book.title}」을 지울까요?`, body: '이 교재를 배정받은 학생들의 진도 기록도 함께 지워집니다.', ok: '지우기', danger: true });
    if (yes && (await ui.run(() => api.del(`/textbooks/${book.id}`), '교재를 지웠습니다.'))) onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={book ? '교재 고치기' : '교재 추가'}
      width={600}
      footer={
        <>
          {book && (
            <Button variant="ghost" className="danger mr-auto" onClick={remove}>
              지우기
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" type="submit" form="book-form" busy={busy}>
            저장
          </Button>
        </>
      }
    >
      <form id="book-form" className="form book-form" onSubmit={submit}>
        <div className="book-form-preview">
          <BookCover book={{ title: f.title || '교재 이름', publisher: f.publisher, color: f.color }} size="lg" />
        </div>
        <div className="book-form-fields">
          <Field label="교재 이름" wide>
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
          </Field>
          <div className="field-row">
            <Field label="출판사">
              <input value={f.publisher} onChange={(e) => setF({ ...f, publisher: e.target.value })} />
            </Field>
            <Field label="분류">
              <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                {BOOK_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="field-row">
            <Field label="전체 분량" hint="0이면 진도만 기록">
              <input type="number" min={0} max={2000} value={f.totalUnits} onChange={(e) => setF({ ...f, totalUnits: Number(e.target.value) })} />
            </Field>
            <Field label="단위">
              <select value={f.unitLabel} onChange={(e) => setF({ ...f, unitLabel: e.target.value })}>
                {['강', '단원', '회', '일', '주', '장', '쪽'].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="표지 색" wide>
            <ColorPicker value={f.color} onChange={(color) => setF({ ...f, color })} />
          </Field>
          <Field label="메모" wide>
            <input value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} />
          </Field>
        </div>
      </form>
    </Sheet>
  );
}

export function AssignBookSheet({ open, studentId, textbookId, onClose }: { open: boolean; studentId?: number; textbookId?: number; onClose(): void }) {
  const ui = useUi();
  const books = useApi<Textbook[]>(open ? '/textbooks' : null).data ?? [];
  const groups = useApi<Group[]>(open && !studentId ? '/groups' : null).data ?? [];
  const students = useApi<StudentRow[]>(open && !studentId ? '/students' : null).data ?? [];
  const [f, setF] = useState({ textbookId: textbookId ?? 0, status: 'current', target: 'students' as 'students' | 'group', groupId: 0, studentIds: [] as number[] });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF({ textbookId: textbookId ?? 0, status: 'current', target: 'students', groupId: 0, studentIds: studentId ? [studentId] : [] });
  }, [open, studentId, textbookId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body = {
      textbookId: f.textbookId,
      status: f.status,
      studentIds: f.target === 'students' ? f.studentIds : [],
      groupId: f.target === 'group' ? f.groupId : null,
    };
    const r = await ui.run<{ added: number; skipped: number }>(() => api.post('/student-books', body));
    setBusy(false);
    if (r) {
      ui.toast(r.skipped ? `${r.added}명에게 배정했습니다. (${r.skipped}명은 이미 배정됨)` : `${r.added}명에게 배정했습니다.`);
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="교재 배정"
      width={600}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" type="submit" form="assign-form" busy={busy}>
            배정
          </Button>
        </>
      }
    >
      <form id="assign-form" className="form" onSubmit={submit}>
        <Field label="교재" wide>
          <select value={f.textbookId || ''} onChange={(e) => setF({ ...f, textbookId: Number(e.target.value) })} required>
            <option value="">교재를 고르세요</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} · {b.publisher}
              </option>
            ))}
          </select>
        </Field>
        <Field label="상태" wide>
          <Segmented
            size="sm"
            value={f.status}
            onChange={(status) => setF({ ...f, status })}
            options={[
              { value: 'current', label: '지금 진행' },
              { value: 'planned', label: '다음 예정' },
            ]}
          />
        </Field>
        {!studentId && (
          <Field label="받을 학생" wide>
            <Segmented
              size="sm"
              value={f.target}
              onChange={(target) => setF({ ...f, target })}
              options={[
                { value: 'students' as const, label: '학생 고르기' },
                { value: 'group' as const, label: '반 전체' },
              ]}
            />
            {f.target === 'group' ? (
              <select value={f.groupId || ''} onChange={(e) => setF({ ...f, groupId: Number(e.target.value) })} required>
                <option value="">반을 고르세요</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.members.length}명)
                  </option>
                ))}
              </select>
            ) : (
              <StudentPicker students={students.filter((s) => s.status === 'active')} value={f.studentIds} onChange={(studentIds) => setF({ ...f, studentIds })} max={220} />
            )}
          </Field>
        )}
      </form>
    </Sheet>
  );
}

export function ProgressSheet({ sb, onClose }: { sb: StudentBook | null; onClose(): void }) {
  const ui = useUi();
  const [f, setF] = useState({ progress: 0, note: '', status: 'current', date: todayIn() });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (sb) setF({ progress: sb.progress, note: sb.note, status: sb.status, date: todayIn() });
  }, [sb]);
  if (!sb) return null;
  const t = sb.textbook;
  const max = t.totalUnits || 2000;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await ui.run(() => api.patch(`/student-books/${sb.id}`, f), '진도를 기록했습니다.');
    setBusy(false);
    if (r) onClose();
  };
  const remove = async () => {
    const yes = await ui.confirm({ title: '배정을 취소할까요?', body: `${sb.studentName} 학생의 「${t.title}」 진도 기록이 지워집니다.`, ok: '배정 취소', danger: true });
    if (yes && (await ui.run(() => api.del(`/student-books/${sb.id}`), '배정을 취소했습니다.'))) onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="진도 기록"
      width={520}
      footer={
        <>
          <Button variant="ghost" className="danger mr-auto" onClick={remove}>
            배정 취소
          </Button>
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button variant="primary" type="submit" form="progress-form" busy={busy}>
            저장
          </Button>
        </>
      }
    >
      <form id="progress-form" className="form" onSubmit={submit}>
        <div className="progress-head">
          <BookCover book={t} size="sm" />
          <div>
            <p className="eyebrow">{sb.studentName}</p>
            <h3>{t.title}</h3>
            <p className="fine">
              {t.publisher}
              {t.totalUnits ? ` · 전체 ${t.totalUnits}${t.unitLabel}` : ''}
            </p>
          </div>
        </div>
        <Field label="어디까지 했나요" wide>
          <div className="stepper">
            <button type="button" onClick={() => setF({ ...f, progress: Math.max(0, f.progress - 1) })} aria-label="하나 줄이기">
              −
            </button>
            <input type="number" min={0} max={max} value={f.progress} onChange={(e) => setF({ ...f, progress: Math.min(max, Math.max(0, Number(e.target.value))) })} />
            <span className="unit">
              {t.unitLabel}
              {t.totalUnits ? ` / ${t.totalUnits}` : ''}
            </span>
            <button type="button" onClick={() => setF({ ...f, progress: Math.min(max, f.progress + 1) })} aria-label="하나 늘리기">
              +
            </button>
          </div>
        </Field>
        <Field label="진도 메모" wide hint="학생·학부모 화면에 ‘최근 진도’로 보입니다">
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="예: 15강 현대시 ③ — 「사평역에서」" maxLength={120} />
        </Field>
        <div className="field-row">
          <Field label="수업 날짜">
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="상태">
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="current">진행 중</option>
              <option value="planned">예정</option>
              <option value="done">완료</option>
            </select>
          </Field>
        </div>
        {sb.logs.length > 0 && (
          <p className="fine">
            지난 기록: {sb.logs.slice(0, 3).map((l) => `${dotDate(l.date, false)} ${l.progress}${t.unitLabel}`).join(' · ')}
          </p>
        )}
      </form>
    </Sheet>
  );
}
