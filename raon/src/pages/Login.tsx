import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { vt } from '../lib/motion';
import { Button, Field, Mark, Sheet } from '../components/ui';
import { CONSULT_GRADES, type ConsultInput, type Me } from '../../shared/types';

const DEMO = import.meta.env.MODE === 'demo';

/** 칸 안에 이름표가 있다가, 글을 쓰면 위로 작게 올라가는 입력칸 */
function FloatInput({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  inputRef,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  type?: string;
  autoComplete?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className={'float' + (value ? ' has-value' : '')}>
      <input ref={inputRef} type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false} required placeholder=" " />
      <span>{label}</span>
    </label>
  );
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  const { academy } = useAuth();
  return (
    <div className="auth">
      <main className="auth-main">{children}</main>
      <footer className="auth-foot">
        <span>{academy.name}</span>
        {academy.address && <span>{academy.address}</span>}
        {academy.phone && <a href={`tel:${academy.phone}`}>{academy.phone}</a>}
      </footer>
    </div>
  );
}

/** 홈 화면 위로 떠오르는 로그인 창 */
export function LoginSheet({ open, onClose, onConsult }: { open: boolean; onClose(): void; onConsult(): void }) {
  const { academy, setMe } = useAuth();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setShake(0);
    const t = setTimeout(() => window.matchMedia('(hover: hover)').matches && nameRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const me = await api.post<Me>('/auth/login', { loginId: name.trim(), password });
      document.body.classList.remove('no-scroll');
      vt(() => setMe(me), 'enter');
    } catch (err: any) {
      setError(err.message);
      setShake((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="" width={420} className="sheet-login">
      <form className="login" onSubmit={submit}>
        <span className="login-mark">
          <Mark scale={1.6} />
        </span>
        <h2 className="login-title">{academy.name}에 로그인</h2>
        <p className="login-lead">이름과 비밀번호를 입력하세요.</p>
        <div className={'input-stack' + (error ? ' has-error' : '')} key={shake} data-shake={shake > 0 || undefined}>
          <FloatInput label="이름" value={name} onChange={setName} autoComplete="username" inputRef={nameRef} />
          <FloatInput label="비밀번호" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>
        <p className="form-error" role="alert">
          {error}
        </p>
        <Button type="submit" variant="primary" size="lg" busy={busy} className="btn-block">
          로그인
        </Button>
        <p className="login-help">
          비밀번호를 잊으셨다면 학원으로 연락해 주세요.
          {academy.phone && (
            <>
              {' '}
              <a href={`tel:${academy.phone}`}>{academy.phone}</a>
            </>
          )}
        </p>
        <p className="login-alt">
          아직 라온국어 학생이 아니신가요?{' '}
          <button type="button" className="link" onClick={onConsult}>
            상담 신청
          </button>
        </p>
        {DEMO && (
          <p className="auth-demo">
            미리보기 계정 — 선생님 <b>정다은</b> · 학생 <b>김태윤</b> · 학부모 <b>박미영</b>
            <br />
            비밀번호는 모두 <b>raon1234</b>
          </p>
        )}
      </form>
    </Sheet>
  );
}

// ── 상담 신청 ──────────────────────────────────────────

const EMPTY: ConsultInput & { website: string } = { studentName: '', grade: '', phone: '', preferredTime: '', message: '', agree: false, website: '' };

export function ConsultSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { academy } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (open) {
      setF(EMPTY);
      setDone(false);
      setError('');
    }
  }, [open]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.grade) return setError('학년을 골라 주세요.');
    setBusy(true);
    setError('');
    try {
      await api.post('/consults', f);
      vt(() => setDone(true), 'swap');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={done ? '' : '상담 신청'}
      width={520}
      footer={
        done ? (
          <Button variant="primary" className="btn-block" onClick={onClose}>
            확인
          </Button>
        ) : (
          <Button variant="primary" type="submit" form="consult-form" busy={busy} className="btn-block">
            신청하기
          </Button>
        )
      }
    >
      {done ? (
        <div className="consult-done">
          <span className="done-check" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 28 28">
              <path d="M7 14.5l4.6 4.6L21 9.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h3>신청을 받았어요</h3>
          <p>
            {academy.name}에서 남겨 주신 연락처로 곧 연락드릴게요.
            {academy.phone && (
              <>
                <br />
                급한 문의는 <a href={`tel:${academy.phone}`}>{academy.phone}</a>
              </>
            )}
          </p>
        </div>
      ) : (
        <form id="consult-form" className="form" onSubmit={submit}>
          <p className="sheet-lead">남겨 주신 연락처로 학원에서 직접 연락드립니다.</p>
          <Field label="학생 이름" wide>
            <input value={f.studentName} onChange={set('studentName')} required maxLength={30} autoComplete="off" />
          </Field>
          <div className="field field-wide" role="radiogroup" aria-label="학년">
            <span className="field-label">학년</span>
            <div className="choice-grid grades">
              {CONSULT_GRADES.map((g) => (
                <button key={g} type="button" role="radio" aria-checked={f.grade === g} className={'choice' + (f.grade === g ? ' is-on' : '')} onClick={() => setF({ ...f, grade: g })}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          <Field label="연락처" wide>
            <input value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="010-0000-0000" required maxLength={20} />
          </Field>
          <Field label="연락받기 좋은 시간 (선택)" wide>
            <input value={f.preferredTime} onChange={set('preferredTime')} placeholder="예: 평일 저녁 7시 이후" maxLength={60} />
          </Field>
          <Field label="궁금한 점 (선택)" wide>
            <textarea rows={3} value={f.message} onChange={set('message')} maxLength={1000} placeholder="성적, 원하는 반, 시간표 등 무엇이든 적어 주세요." />
          </Field>
          <input className="hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} aria-hidden="true" name="website" />
          <label className="check consent">
            <input type="checkbox" checked={f.agree} onChange={set('agree')} required />
            <span>
              <span className="consent-main">
                개인정보 수집·이용에 동의합니다 <em>(필수)</em>
              </span>
              <small>학생 이름·학년·연락처를 상담 연락에만 쓰며, 상담이 끝나면 지웁니다.</small>
            </span>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </Sheet>
  );
}

// ── 처음 설정 ──────────────────────────────────────────

export function SetupPage() {
  const { setMe } = useAuth();
  const [form, setForm] = useState({ academyName: '라온국어', name: '', password: '', password2: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.password2) return setError('비밀번호가 서로 다릅니다.');
    setBusy(true);
    setError('');
    try {
      const me = await api.post<Me>('/setup', form);
      vt(() => setMe(me), 'enter');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame>
      <form className="auth-form auth-setup" onSubmit={submit}>
        <span className="auth-mark">
          <Mark scale={1.7} />
        </span>
        <h1 className="auth-title">처음 설정</h1>
        <p className="auth-lead">원장님 계정을 만들면 학생·학부모·선생님 계정을 관리할 수 있어요.</p>
        <div className="form">
          <Field label="학원 이름" wide>
            <input value={form.academyName} onChange={set('academyName')} required />
          </Field>
          <Field label="원장님 이름" wide hint="로그인할 때 이 이름을 씁니다">
            <input value={form.name} onChange={set('name')} required autoComplete="username" />
          </Field>
          <Field label="비밀번호" wide hint="6자 이상">
            <input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required minLength={6} />
          </Field>
          <Field label="비밀번호 확인" wide>
            <input type="password" autoComplete="new-password" value={form.password2} onChange={set('password2')} required />
          </Field>
        </div>
        <p className="form-error" role="alert">
          {error}
        </p>
        <div className="auth-actions">
          <Button type="submit" variant="primary" size="lg" busy={busy}>
            시작하기
          </Button>
        </div>
      </form>
    </AuthFrame>
  );
}
