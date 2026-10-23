import type { Db } from './db';
import type { Role } from '../../shared/types';
import { isDate, isTime } from '../../shared/date';
import { josa } from '../../shared/josa';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const bad = (msg: string) => new HttpError(400, msg);
export const notFound = (msg = '찾을 수 없습니다.') => new HttpError(404, msg);
export const forbidden = (msg = '권한이 없습니다.') => new HttpError(403, msg);

export interface AuthUser {
  id: number;
  role: Role;
  name: string;
  loginId: string;
  isAdmin: boolean;
  studentId: number | null;
}

export interface Crypto {
  hashPassword(pw: string): string;
  verifyPassword(pw: string, stored: string): boolean;
  randomToken(): string;
  hashToken(token: string): string;
}

export interface Ctx {
  db: Db;
  crypto: Crypto;
  user: AuthUser | null;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  today: string;
  now: string; // ISO 시각
  ip: string;
  token: string | undefined;
  setSessionToken(token: string | null): void;
}

export type Access = 'public' | 'user' | 'teacher' | 'admin';
export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface Route {
  method: Method;
  path: string;
  access: Access;
  handler: (ctx: Ctx) => unknown;
}

interface Compiled extends Route {
  re: RegExp;
  keys: string[];
}

export function createRouter(routes: Route[]) {
  const compiled: Compiled[] = routes.map((r) => {
    const keys: string[] = [];
    const re = new RegExp(
      '^' +
        r.path.replace(/:([a-zA-Z]+)/g, (_, k) => {
          keys.push(k);
          return '([^/]+)';
        }) +
        '$',
    );
    return { ...r, re, keys };
  });

  return function dispatch(method: string, path: string, ctx: Omit<Ctx, 'params'>) {
    let pathMatched = false;
    for (const r of compiled) {
      const m = r.re.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      const full: Ctx = { ...ctx, params };
      if (r.access !== 'public') {
        if (!full.user) throw new HttpError(401, '로그인이 필요합니다.');
        if (r.access === 'teacher' && full.user.role !== 'teacher') throw forbidden();
        if (r.access === 'admin' && !(full.user.role === 'teacher' && full.user.isAdmin)) throw forbidden('원장 계정만 할 수 있습니다.');
      }
      return r.handler(full);
    }
    throw new HttpError(pathMatched ? 405 : 404, pathMatched ? '허용되지 않은 요청입니다.' : '없는 주소입니다.');
  };
}

// ── 입력 검증 ──────────────────────────────────────────

type Src = Record<string, unknown>;

export function input(raw: unknown) {
  const src: Src = raw && typeof raw === 'object' ? (raw as Src) : {};
  const has = (k: string) => src[k] !== undefined;

  function str(k: string, label: string, opt: { max?: number; required?: boolean } = {}): string {
    const v = src[k];
    if (v === undefined || v === null) {
      if (opt.required) throw bad(`${josa(label, '을/를')} 입력해 주세요.`);
      return '';
    }
    if (typeof v !== 'string') throw bad(`${label} 형식이 올바르지 않습니다.`);
    const t = v.trim();
    if (opt.required && !t) throw bad(`${josa(label, '을/를')} 입력해 주세요.`);
    if (t.length > (opt.max ?? 200)) throw bad(`${josa(label, '이/가')} 너무 깁니다.`);
    return t;
  }

  function text(k: string, label: string, max = 5000, required = false): string {
    const v = src[k];
    if (v === undefined || v === null || v === '') {
      if (required) throw bad(`${josa(label, '을/를')} 입력해 주세요.`);
      return '';
    }
    if (typeof v !== 'string') throw bad(`${label} 형식이 올바르지 않습니다.`);
    const t = v.replace(/\r\n/g, '\n').trim();
    if (required && !t) throw bad(`${josa(label, '을/를')} 입력해 주세요.`);
    if (t.length > max) throw bad(`${josa(label, '은/는')} ${max}자까지 쓸 수 있습니다.`);
    return t;
  }

  function int(k: string, label: string, opt: { min?: number; max?: number; required?: boolean } = {}): number | null {
    const v = src[k];
    if (v === undefined || v === null || v === '') {
      if (opt.required) throw bad(`${josa(label, '을/를')} 선택해 주세요.`);
      return null;
    }
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isInteger(n)) throw bad(`${label} 형식이 올바르지 않습니다.`);
    if (opt.min !== undefined && n < opt.min) throw bad(`${label} 값이 너무 작습니다.`);
    if (opt.max !== undefined && n > opt.max) throw bad(`${label} 값이 너무 큽니다.`);
    return n;
  }

  function reqInt(k: string, label: string, opt: { min?: number; max?: number } = {}): number {
    return int(k, label, { ...opt, required: true }) as number;
  }

  function ids(k: string): number[] {
    const v = src[k];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.some((x) => !Number.isInteger(x))) throw bad('목록 형식이 올바르지 않습니다.');
    return [...new Set(v as number[])];
  }

  function date(k: string, label: string, required = true): string | null {
    const v = src[k];
    if ((v === undefined || v === null || v === '') && !required) return null;
    if (!isDate(v)) throw bad(`${josa(label, '을/를')} 확인해 주세요.`);
    return v;
  }

  function time(k: string, label: string): string | null {
    const v = src[k];
    if (v === undefined || v === null || v === '') return null;
    if (!isTime(v)) throw bad(`${josa(label, '을/를')} 확인해 주세요.`);
    return v;
  }

  function oneOf<T extends string>(k: string, label: string, values: readonly T[], fallback?: T): T {
    const v = src[k];
    if ((v === undefined || v === null) && fallback !== undefined) return fallback;
    if (!values.includes(v as T)) throw bad(`${josa(label, '을/를')} 확인해 주세요.`);
    return v as T;
  }

  function bool(k: string): boolean {
    return src[k] === true || src[k] === 1 || src[k] === 'true';
  }

  function color(k: string, fallback: string): string {
    const v = src[k];
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) throw bad('색상 형식이 올바르지 않습니다.');
    return v.toUpperCase();
  }

  return { src, has, str, text, int, reqInt, ids, date, time, oneOf, bool, color };
}

export function idParam(ctx: Ctx, key = 'id'): number {
  const n = Number(ctx.params[key]);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
}

export function validLoginId(id: string) {
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(id)) throw bad('아이디는 영문, 숫자, . _ - 로 3~30자입니다.');
}

export function validPassword(pw: unknown): string {
  if (typeof pw !== 'string' || pw.length < 6) throw bad('비밀번호는 6자 이상이어야 합니다.');
  if (pw.length > 100) throw bad('비밀번호가 너무 깁니다.');
  return pw;
}
