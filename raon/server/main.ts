import express, { type Request, type Response } from 'express';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openNodeDb } from './node/sqlite';
import { nodeCrypto } from './node/crypto';
import { migrate } from './core/schema';
import { dispatch } from './core/routes';
import { HttpError } from './core/http';
import { userFromToken } from './core/auth';
import { seedDemo } from './core/seed';
import { todayIn } from '../shared/date';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = resolve(process.env.DATA_DIR || 'data');
const PROD = process.env.NODE_ENV === 'production';
// HTTPS 에서만 로그인 쿠키를 보낸다. 집에서 http 로 시험할 때는 COOKIE_SECURE=0
const SECURE_COOKIE = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === '1' : PROD;
const BACKUP_DAYS = Number(process.env.BACKUP_DAYS ?? 14);
const COOKIE = 'raon_session';
const here = dirname(fileURLToPath(import.meta.url));

mkdirSync(DATA_DIR, { recursive: true });
const db = openNodeDb(join(DATA_DIR, 'raon.db'));
migrate(db);

if (process.env.SEED_DEMO === '1' && !db.get('SELECT 1 FROM users LIMIT 1')) {
  seedDemo(db, nodeCrypto, todayIn());
  console.log('[raon] 데모 데이터를 넣었습니다. (원장 아이디: director / 비밀번호: raon1234)');
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function setCookie(res: Response, token: string | null) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (SECURE_COOKIE) attrs.push('Secure');
  if (token) attrs.push(`Max-Age=${30 * 86400}`);
  else attrs.push('Max-Age=0');
  res.append('Set-Cookie', `${COOKIE}=${token ? encodeURIComponent(token) : ''}; ${attrs.join('; ')}`);
}

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use('/api', express.json({ limit: '200kb' }));

app.all('/api/*path', (req, res) => {
  // 다른 사이트에서 보낸 쓰기 요청 차단 (JSON 본문만 받는다)
  if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json') && req.headers['content-length'] !== '0') {
    res.status(415).json({ error: 'JSON 요청만 받습니다.' });
    return;
  }
  const token = readCookie(req, COOKIE);
  const now = new Date();
  const nowIso = now.toISOString();
  try {
    const url = new URL(req.originalUrl, 'http://local');
    const result = dispatch(req.method, url.pathname.replace(/^\/api/, ''), {
      db,
      crypto: nodeCrypto,
      user: userFromToken(db, nodeCrypto, token, nowIso),
      query: url.searchParams,
      body: req.body ?? {},
      today: todayIn('Asia/Seoul', now),
      now: nowIso,
      ip: req.ip ?? '',
      token,
      setSessionToken: (t) => setCookie(res, t),
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json(result ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 401 && token) setCookie(res, null);
      res.status(e.status).json({ error: e.message });
      return;
    }
    console.error(e);
    res.status(500).json({ error: '서버에서 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.' });
  }
});

// 빌드된 화면 파일
const clientDir = [join(here, 'client'), join(here, '../dist/client')].find((d) => existsSync(join(d, 'index.html')));
if (clientDir) {
  app.use(
    express.static(clientDir, {
      index: false,
      setHeaders: (res, path) => {
        if (path.includes(`${'/'}assets${'/'}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  app.get('/{*path}', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(clientDir, 'index.html'));
  });
}

// 오래된 로그인 세션 정리
setInterval(() => db.run('DELETE FROM sessions WHERE expires_at < ?', new Date().toISOString()), 6 * 3600 * 1000).unref();

// 하루 한 번 데이터 백업 (data/backups/raon-날짜.db, 최근 BACKUP_DAYS 개 보관)
function backup() {
  if (!BACKUP_DAYS) return;
  const dir = join(DATA_DIR, 'backups');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `raon-${todayIn()}.db`);
  if (existsSync(file)) return;
  try {
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const old = readdirSync(dir).filter((f) => /^raon-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -BACKUP_DAYS);
    for (const f of old) rmSync(join(dir, f));
  } catch (e) {
    console.error('[raon] 백업 실패', e);
  }
}
backup();
setInterval(backup, 3600 * 1000).unref();

app.listen(PORT, () => {
  console.log(`[raon] http://localhost:${PORT} 에서 실행 중 (데이터: ${DATA_DIR})`);
});
