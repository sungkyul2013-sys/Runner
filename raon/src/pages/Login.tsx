import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Brand, Button, Field, Manuscript } from '../components/ui';
import type { Me } from '../../shared/types';

export function LoginPage() {
  const { academy, setMe } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setMe(await api.post<Me>('/auth/login', { loginId: loginId.trim(), password }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <section className="auth-art" aria-hidden="true">
        <div className="auth-art-inner">
          <Manuscript text="읽는 일은 생각을 기르는 일, 쓰는 일은 생각을 다듬는 일." cols={11} circle="생각" />
          <p className="auth-foot">{[academy.name, academy.phone, academy.address].filter(Boolean).join('  ·  ')}</p>
        </div>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <Brand name={academy.name} />
          <h1>로그인</h1>
          <p className="auth-lead">선생님께 받은 아이디와 비밀번호를 입력해 주세요.</p>
          <Field label="아이디">
            <input autoComplete="username" autoCapitalize="none" spellCheck={false} value={loginId} onChange={(e) => setLoginId(e.target.value)} required />
          </Field>
          <Field label="비밀번호">
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" busy={busy} className="btn-block">
            들어가기
          </Button>
          <p className="auth-help">비밀번호를 잊었다면 학원으로 연락해 주세요. 선생님이 새 비밀번호를 만들어 드립니다.</p>
        </form>
      </section>
    </div>
  );
}

export function SetupPage() {
  const { setMe } = useAuth();
  const [form, setForm] = useState({ academyName: '라온국어', name: '', loginId: '', password: '', password2: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.password2) return setError('비밀번호가 서로 다릅니다.');
    setBusy(true);
    setError('');
    try {
      setMe(await api.post<Me>('/setup', form));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <section className="auth-art" aria-hidden="true">
        <div className="auth-art-inner">
          <Manuscript text={`${form.academyName || '라온국어'}의 첫 장을 엽니다.`} cols={11} />
        </div>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <h1>처음 설정</h1>
          <p className="auth-lead">이 계정으로 학생·학부모·선생님 계정을 만들고 관리합니다.</p>
          <Field label="학원 이름">
            <input value={form.academyName} onChange={set('academyName')} required />
          </Field>
          <Field label="원장님 이름">
            <input value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="아이디" hint="영문·숫자 3~30자">
            <input autoCapitalize="none" spellCheck={false} value={form.loginId} onChange={set('loginId')} required />
          </Field>
          <div className="field-row">
            <Field label="비밀번호" hint="6자 이상">
              <input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required />
            </Field>
            <Field label="비밀번호 확인">
              <input type="password" autoComplete="new-password" value={form.password2} onChange={set('password2')} required />
            </Field>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" busy={busy} className="btn-block">
            시작하기
          </Button>
        </form>
      </section>
    </div>
  );
}
