import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import '../src/styles/app.css';
import { App } from '../src/App';

// 미리보기: 서버 대신 브라우저 안의 SQLite 로 돌아간다. 계정 안내는 로그인 화면에 있다.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
