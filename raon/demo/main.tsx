import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useNavigate } from 'react-router-dom';
import './fonts.css';
import '../src/styles/app.css';
import { App } from '../src/App';
import { api } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { invalidate } from '../src/lib/hooks';
import { resetPreview } from './transport';
import type { Me } from '../shared/types';

const ACCOUNTS = [
  { id: 'director', label: '선생님' },
  { id: 'taeyun', label: '학생 김태윤' },
  { id: 'taeyun.mom', label: '학부모 (태윤·하늘)' },
];

function PreviewBar() {
  const { me, setMe, refresh } = useAuth();
  const nav = useNavigate();
  const as = async (loginId: string) => {
    const m = await api.post<Me>('/auth/login', { loginId, password: 'raon1234' });
    setMe(m);
    nav('/');
    invalidate();
  };
  const reset = async () => {
    await resetPreview();
    await refresh();
    nav('/');
  };
  return (
    <div className="demo-bar">
      <b>미리보기</b>
      <span>예시 데이터입니다. 바꾼 내용은 이 브라우저에만 남아요.</span>
      {ACCOUNTS.map((a) => (
        <button key={a.id} type="button" className={me?.loginId === a.id ? 'is-on' : ''} onClick={() => as(a.id)}>
          {a.label}
        </button>
      ))}
      <button type="button" onClick={reset}>
        처음 상태로
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App banner={<PreviewBar />} />
  </StrictMode>,
);
