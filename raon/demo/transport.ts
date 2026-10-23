// 미리보기 전용 전송 계층: 서버 코드를 브라우저 안에서 그대로 돌린다.
// 데이터는 예시이고, 바꾼 내용은 이 브라우저(localStorage)에만 남는다.
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { migrate } from '../server/core/schema';
import { dispatch } from '../server/core/routes';
import { HttpError, type Crypto } from '../server/core/http';
import { userFromToken } from '../server/core/auth';
import { seedDemo } from '../server/core/seed';
import type { Db } from '../server/core/db';
import { todayIn } from '../shared/date';
import { ApiError } from '../src/lib/transport';
import { wrapSqlJs, type SqlJsDatabase } from './sqljs';

export { ApiError };

const DB_KEY = 'raon.preview.db';
const DAY_KEY = 'raon.preview.day';
const TOKEN_KEY = 'raon.preview.token';

const demoCrypto: Crypto = {
  // 미리보기에서는 예시 계정만 쓰므로 단순하게 처리한다
  hashPassword: (pw) => 'preview$' + pw,
  verifyPassword: (pw, stored) => stored === 'preview$' + pw,
  randomToken: () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''),
  hashToken: (t) => t,
};

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* 저장소를 못 쓰면 새로고침 때 처음 상태로 돌아간다 */
    }
  },
};

let token: string | undefined = store.get(TOKEN_KEY) ?? undefined;
let state: Promise<{ db: Db; raw: SqlJsDatabase }> | null = null;

function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function open(fresh = false) {
  const SQL = await (initSqlJs as unknown as () => Promise<{ Database: new (data?: Uint8Array) => SqlJsDatabase }>)();
  const today = todayIn();
  const saved = !fresh && store.get(DAY_KEY) === today ? store.get(DB_KEY) : null;
  let raw: SqlJsDatabase | null = null;
  if (saved) {
    try {
      raw = new SQL.Database(fromBase64(saved));
    } catch {
      raw = null;
    }
  }
  const seeded = !!raw;
  raw ??= new SQL.Database();
  const db = wrapSqlJs(raw);
  migrate(db);
  if (!seeded) {
    seedDemo(db, demoCrypto, today);
    token = undefined;
    store.set(TOKEN_KEY, null);
    persist(raw);
  }
  return { db, raw };
}

function persist(raw: SqlJsDatabase) {
  try {
    store.set(DB_KEY, toBase64(raw.export()));
    store.set(DAY_KEY, todayIn());
  } catch {
    /* 용량 초과 등은 무시 */
  }
  // export 뒤에는 연결이 다시 열려 PRAGMA 가 초기화된다
  raw.exec('PRAGMA foreign_keys = ON');
}

export async function resetPreview() {
  state = open(true);
  await state;
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  state ??= open();
  const { db, raw } = await state;
  const url = new URL(path, 'http://preview.local');
  const now = new Date();
  const nowIso = now.toISOString();
  try {
    const result = dispatch(method, url.pathname, {
      db,
      crypto: demoCrypto,
      user: userFromToken(db, demoCrypto, token, nowIso),
      query: url.searchParams,
      body: body ?? {},
      today: todayIn('Asia/Seoul', now),
      now: nowIso,
      ip: 'preview',
      token,
      setSessionToken: (t) => {
        token = t ?? undefined;
        store.set(TOKEN_KEY, t);
      },
    });
    if (method !== 'GET') persist(raw);
    return JSON.parse(JSON.stringify(result ?? { ok: true })) as T;
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 401) {
        token = undefined;
        store.set(TOKEN_KEY, null);
      }
      throw new ApiError(e.status, e.message);
    }
    console.error(e);
    throw new ApiError(500, '처리하지 못했습니다. 다시 시도해 주세요.');
  }
}
