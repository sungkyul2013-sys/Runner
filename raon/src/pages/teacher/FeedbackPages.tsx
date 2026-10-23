import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { Button, Empty, ErrorNote, Field, Loading, PageHead, Segmented, Sheet, Tag, useUi } from '../../components/ui';
import { readStamp } from '../../components/letters';
import { FeedbackSheet } from './forms';
import { dotDate } from '../../../shared/date';
import type { Feedback, StudentRow } from '../../../shared/types';
import { FEEDBACK_CATEGORIES } from '../../../shared/types';

function FeedbackEditSheet({ f, onClose }: { f: Feedback | null; onClose(): void }) {
  const ui = useUi();
  const [form, setForm] = useState({ title: '', body: '', category: '수업', classDate: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (f) setForm({ title: f.title, body: f.body, category: f.category, classDate: f.classDate ?? '' });
  }, [f]);
  if (!f) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await ui.run(() => api.patch(`/feedback/${f.id}`, { ...form, classDate: form.classDate || null }), '피드백을 고쳤습니다.');
    setBusy(false);
    if (r) onClose();
  };
  const remove = async () => {
    const yes = await ui.confirm({ title: '이 피드백을 지울까요?', body: `${f.studentName} ${f.audience === 'parent' ? '학부모님' : '학생'} 화면에서도 사라집니다.`, ok: '지우기', danger: true });
    if (yes && (await ui.run(() => api.del(`/feedback/${f.id}`), '피드백을 지웠습니다.'))) onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${f.studentName} · ${f.audience === 'parent' ? '학부모님께' : '학생에게'}`}
      width={640}
      footer={
        <>
          <Button variant="ghost" className="danger mr-auto" onClick={remove}>
            지우기
          </Button>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" type="submit" form="fb-edit" busy={busy}>
            저장
          </Button>
        </>
      }
    >
      <form id="fb-edit" className="form" onSubmit={submit}>
        <div className="field-row">
          <Field label="수업 날짜">
            <input type="date" value={form.classDate} onChange={(e) => setForm({ ...form, classDate: e.target.value })} />
          </Field>
          <Field label="분류">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {FEEDBACK_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="제목" wide>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="내용" wide>
          <textarea rows={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
        </Field>
      </form>
    </Sheet>
  );
}

/** 선생님이 보는 피드백 목록 (읽음 표시 포함) */
export function FeedbackTable({ list, showStudent = true }: { list: Feedback[]; showStudent?: boolean }) {
  const [editing, setEditing] = useState<Feedback | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  if (!list.length) return <Empty title="아직 쓴 피드백이 없습니다." />;
  return (
    <>
      <ul className="fb-table">
        {list.map((f) => (
          <li key={f.id} className={open === f.id ? 'is-open' : ''}>
            <button type="button" className="fb-row" onClick={() => setOpen(open === f.id ? null : f.id)} aria-expanded={open === f.id}>
              <span className="fb-date">{dotDate(f.classDate ?? f.createdAt.slice(0, 10))}</span>
              {showStudent && <span className="fb-student">{f.studentName}</span>}
              <span className="fb-aud">
                <Tag tone={f.audience === 'parent' ? 'ink' : 'plain'}>{f.audience === 'parent' ? '학부모님께' : '학생에게'}</Tag>
              </span>
              <span className="fb-title">
                <span className="cat">{f.category}</span>
                {f.title || f.body.split('\n')[0]}
              </span>
              <span className={'fb-read' + (f.readers?.length ? ' is-read' : '')}>
                {f.readers?.length ? `${f.readers.map((r) => r.name).join(', ')} ${readStamp(f.readers[0].readAt)} 읽음` : '안 읽음'}
              </span>
            </button>
            {open === f.id && (
              <div className="fb-detail">
                <div className="letter-text">{f.body}</div>
                <div className="fb-detail-foot">
                  <span className="fine">
                    {f.authorName} 선생님 · {readStamp(f.createdAt)} 작성
                  </span>
                  <button type="button" className="link" onClick={() => setEditing(f)}>
                    고치기
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <FeedbackEditSheet f={editing} onClose={() => setEditing(null)} />
    </>
  );
}

export function TeacherFeedbackPage() {
  const [aud, setAud] = useState<'' | 'student' | 'parent'>('');
  const [studentId, setStudentId] = useState<number | ''>('');
  const [writing, setWriting] = useState(false);
  const students = useApi<StudentRow[]>('/students').data ?? [];
  const { data, error, reload } = useApi<Feedback[]>(`/feedback${qs({ audience: aud, studentId })}`);
  const unread = (data ?? []).filter((f) => !f.readers?.length).length;
  return (
    <div className="page">
      <PageHead
        title="피드백"
        sub={
          <>
            학생과 학부모님께 따로 전달됩니다. 각자 자기에게 온 글만 볼 수 있어요.
            {data && unread > 0 && <> · 아직 안 읽은 글 {unread}개</>}
          </>
        }
        actions={
          <Button variant="primary" onClick={() => setWriting(true)}>
            피드백 쓰기
          </Button>
        }
      />
      <div className="filters">
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
        <select value={studentId} onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : '')} aria-label="학생">
          <option value="">모든 학생</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.grade}
            </option>
          ))}
        </select>
        {studentId && (
          <Link className="link" to={`/students/${studentId}?tab=feedback`}>
            학생 화면으로
          </Link>
        )}
      </div>
      {error && <ErrorNote message={error} onRetry={reload} />}
      {data ? <FeedbackTable list={data} /> : <Loading />}
      <FeedbackSheet open={writing} studentId={studentId || undefined} onClose={() => setWriting(false)} />
    </div>
  );
}
