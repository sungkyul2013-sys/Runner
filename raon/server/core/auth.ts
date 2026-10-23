import type { Db } from './db';
import type { AuthUser, Crypto, Ctx, Route } from './http';
import { bad, HttpError, input, normalizeLoginId, validLoginId, validPassword, notFound, idParam } from './http';
import type { AcademyInfo, Me, StudentBrief, TeacherAccount } from '../../shared/types';

const SESSION_DAYS = 30;

export function getSetting(db: Db, key: string, fallback = ''): string {
  return db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? fallback;
}

export function setSetting(db: Db, key: string, value: string) {
  db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

export function academyInfo(db: Db): AcademyInfo {
  return {
    name: getSetting(db, 'academy_name', '라온국어'),
    phone: getSetting(db, 'academy_phone'),
    address: getSetting(db, 'academy_address'),
  };
}

export function createSession(db: Db, crypto: Crypto, userId: number, nowIso: string): string {
  const token = crypto.randomToken();
  const expires = new Date(Date.parse(nowIso) + SESSION_DAYS * 86400000).toISOString();
  db.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', crypto.hashToken(token), userId, nowIso, expires);
  db.run('UPDATE users SET last_login_at = ? WHERE id = ?', nowIso, userId);
  return token;
}

export function userFromToken(db: Db, crypto: Crypto, token: string | undefined, nowIso: string): AuthUser | null {
  if (!token) return null;
  const row = db.get<any>(
    `SELECT u.id, u.role, u.name, u.login_id, u.is_admin, u.student_id, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    crypto.hashToken(token),
  );
  if (!row) return null;
  if (row.expires_at < nowIso) {
    db.run('DELETE FROM sessions WHERE token_hash = ?', crypto.hashToken(token));
    return null;
  }
  return { id: row.id, role: row.role, name: row.name, loginId: row.login_id, isAdmin: !!row.is_admin, studentId: row.student_id };
}

/** 학생·학부모가 볼 수 있는 학생 목록 */
export function familyStudents(db: Db, user: AuthUser): StudentBrief[] {
  if (user.role === 'student') {
    return db.all<StudentBrief>('SELECT id, name, school, grade, color FROM students WHERE id = ?', user.studentId ?? -1);
  }
  if (user.role === 'parent') {
    return db.all<StudentBrief>(
      `SELECT s.id, s.name, s.school, s.grade, s.color FROM family_links f JOIN students s ON s.id = f.student_id
        WHERE f.user_id = ? AND s.status != 'left' ORDER BY s.name`,
      user.id,
    );
  }
  return [];
}

export function assertStudentAccess(ctx: Ctx, studentId: number) {
  const u = ctx.user!;
  if (u.role === 'teacher') {
    if (!ctx.db.get('SELECT 1 FROM students WHERE id = ?', studentId)) throw notFound('학생을 찾을 수 없습니다.');
    return;
  }
  if (u.role === 'student' && u.studentId === studentId) return;
  if (u.role === 'parent' && ctx.db.get('SELECT 1 FROM family_links WHERE user_id = ? AND student_id = ?', u.id, studentId)) return;
  throw new HttpError(403, '볼 수 없는 학생입니다.');
}

export function loginIdTaken(db: Db, loginId: string, exceptUserId?: number) {
  return !!db.get('SELECT 1 FROM users WHERE login_id = ? AND id != ?', loginId, exceptUserId ?? -1);
}

/**
 * 아이디를 정한다. 따로 적지 않으면 이름이 아이디가 되고,
 * 같은 이름이 이미 있으면 김민준2, 김민준3 … 처럼 숫자를 붙인다.
 * 직접 적은 아이디가 겹치면 알려 준다.
 */
export function chooseLoginId(db: Db, name: string, given: unknown, exceptUserId?: number): string {
  const typed = normalizeLoginId(given);
  if (typed) {
    validLoginId(typed);
    if (loginIdTaken(db, typed, exceptUserId)) throw bad(`'${typed}'는 이미 쓰고 있는 아이디입니다. 뒤에 숫자를 붙여 주세요.`);
    return typed;
  }
  const base = normalizeLoginId(name);
  validLoginId(base);
  if (!loginIdTaken(db, base, exceptUserId)) return base;
  for (let n = 2; ; n++) if (!loginIdTaken(db, base + n, exceptUserId)) return base + n;
}

// 같은 아이디로 연속 실패하면 잠시 막는다 (프로세스 메모리 기준)
const failures = new Map<string, { count: number; until: number }>();

function checkThrottle(key: string) {
  const f = failures.get(key);
  if (f && f.until > Date.now()) throw new HttpError(429, '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.');
}

function noteFailure(key: string) {
  const f = failures.get(key) ?? { count: 0, until: 0 };
  f.count++;
  if (f.count >= 8) {
    f.until = Date.now() + 5 * 60000;
    f.count = 0;
  }
  failures.set(key, f);
  if (failures.size > 5000) failures.clear();
}

function me(ctx: Ctx): Me {
  const u = ctx.user!;
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    loginId: u.loginId,
    isAdmin: u.isAdmin,
    students: familyStudents(ctx.db, u),
    academy: academyInfo(ctx.db),
  };
}

export const authRoutes: Route[] = [
  {
    method: 'GET',
    path: '/setup',
    access: 'public',
    handler: (ctx) => ({
      needsSetup: !ctx.db.get("SELECT 1 FROM users WHERE role = 'teacher' LIMIT 1"),
      academy: academyInfo(ctx.db),
    }),
  },
  {
    method: 'POST',
    path: '/setup',
    access: 'public',
    handler: (ctx) => {
      if (ctx.db.get("SELECT 1 FROM users WHERE role = 'teacher' LIMIT 1")) throw bad('이미 설정이 끝났습니다.');
      const b = input(ctx.body);
      const academy = b.str('academyName', '학원 이름', { max: 40 }) || '라온국어';
      const name = b.str('name', '이름', { required: true, max: 30 });
      const loginId = chooseLoginId(ctx.db, name, b.src.loginId);
      const pw = validPassword(b.src.password);
      const id = ctx.db.tx(() => {
        setSetting(ctx.db, 'academy_name', academy);
        return ctx.db.run(
          "INSERT INTO users (role, name, login_id, password_hash, is_admin, created_at) VALUES ('teacher', ?, ?, ?, 1, ?)",
          name,
          loginId,
          ctx.crypto.hashPassword(pw),
          ctx.now,
        ).lastId;
      });
      const token = createSession(ctx.db, ctx.crypto, id, ctx.now);
      ctx.setSessionToken(token);
      ctx.user = userFromToken(ctx.db, ctx.crypto, token, ctx.now);
      return me(ctx);
    },
  },
  {
    method: 'POST',
    path: '/auth/login',
    access: 'public',
    handler: (ctx) => {
      const b = input(ctx.body);
      const loginId = normalizeLoginId(b.str('loginId', '이름', { required: true, max: 40 }));
      const pw = typeof b.src.password === 'string' ? b.src.password : '';
      const key = `${ctx.ip}|${loginId.toLowerCase()}`;
      checkThrottle(key);
      const row = ctx.db.get<any>('SELECT id, password_hash FROM users WHERE login_id = ?', loginId);
      if (!row || !ctx.crypto.verifyPassword(pw, row.password_hash)) {
        noteFailure(key);
        throw new HttpError(401, '이름 또는 비밀번호가 맞지 않습니다.');
      }
      failures.delete(key);
      const token = createSession(ctx.db, ctx.crypto, row.id, ctx.now);
      ctx.setSessionToken(token);
      ctx.user = userFromToken(ctx.db, ctx.crypto, token, ctx.now);
      return me(ctx);
    },
  },
  {
    method: 'POST',
    path: '/auth/logout',
    access: 'public',
    handler: (ctx) => {
      if (ctx.token) ctx.db.run('DELETE FROM sessions WHERE token_hash = ?', ctx.crypto.hashToken(ctx.token));
      ctx.setSessionToken(null);
      return { ok: true };
    },
  },
  { method: 'GET', path: '/auth/me', access: 'user', handler: me },
  {
    method: 'POST',
    path: '/auth/password',
    access: 'user',
    handler: (ctx) => {
      const b = input(ctx.body);
      const row = ctx.db.get<any>('SELECT password_hash FROM users WHERE id = ?', ctx.user!.id);
      if (!row || !ctx.crypto.verifyPassword(String(b.src.current ?? ''), row.password_hash)) throw bad('현재 비밀번호가 맞지 않습니다.');
      const next = validPassword(b.src.next);
      ctx.db.run('UPDATE users SET password_hash = ? WHERE id = ?', ctx.crypto.hashPassword(next), ctx.user!.id);
      return { ok: true };
    },
  },
  {
    method: 'PATCH',
    path: '/settings',
    access: 'admin',
    handler: (ctx) => {
      const b = input(ctx.body);
      ctx.db.tx(() => {
        if (b.has('name')) setSetting(ctx.db, 'academy_name', b.str('name', '학원 이름', { required: true, max: 40 }));
        if (b.has('phone')) setSetting(ctx.db, 'academy_phone', b.str('phone', '전화번호', { max: 30 }));
        if (b.has('address')) setSetting(ctx.db, 'academy_address', b.str('address', '주소', { max: 100 }));
      });
      return academyInfo(ctx.db);
    },
  },
  {
    method: 'GET',
    path: '/teachers',
    access: 'teacher',
    handler: (ctx): TeacherAccount[] =>
      ctx.db
        .all<any>("SELECT id, name, login_id, phone, is_admin, last_login_at FROM users WHERE role = 'teacher' ORDER BY is_admin DESC, name")
        .map((r) => ({ id: r.id, name: r.name, loginId: r.login_id, phone: r.phone, isAdmin: !!r.is_admin, lastLoginAt: r.last_login_at })),
  },
  {
    method: 'POST',
    path: '/teachers',
    access: 'admin',
    handler: (ctx) => {
      const b = input(ctx.body);
      const name = b.str('name', '이름', { required: true, max: 30 });
      const loginId = chooseLoginId(ctx.db, name, b.src.loginId);
      const pw = validPassword(b.src.password);
      const id = ctx.db.run(
        "INSERT INTO users (role, name, login_id, password_hash, phone, is_admin, created_at) VALUES ('teacher', ?, ?, ?, ?, ?, ?)",
        name,
        loginId,
        ctx.crypto.hashPassword(pw),
        b.str('phone', '전화번호', { max: 30 }),
        b.bool('isAdmin') ? 1 : 0,
        ctx.now,
      ).lastId;
      return { id, loginId };
    },
  },
  {
    method: 'DELETE',
    path: '/teachers/:id',
    access: 'admin',
    handler: (ctx) => {
      const id = idParam(ctx);
      if (id === ctx.user!.id) throw bad('자기 자신은 지울 수 없습니다.');
      const r = ctx.db.run("DELETE FROM users WHERE id = ? AND role = 'teacher'", id);
      if (!r.changes) throw notFound();
      return { ok: true };
    },
  },
  {
    method: 'POST',
    path: '/users/:id/password',
    access: 'teacher',
    handler: (ctx) => {
      const id = idParam(ctx);
      const target = ctx.db.get<any>('SELECT role FROM users WHERE id = ?', id);
      if (!target) throw notFound();
      if (target.role === 'teacher' && !ctx.user!.isAdmin && id !== ctx.user!.id) throw bad('다른 선생님 비밀번호는 원장만 바꿀 수 있습니다.');
      const pw = validPassword(input(ctx.body).src.password);
      ctx.db.tx(() => {
        ctx.db.run('UPDATE users SET password_hash = ? WHERE id = ?', ctx.crypto.hashPassword(pw), id);
        ctx.db.run('DELETE FROM sessions WHERE user_id = ?', id);
      });
      return { ok: true };
    },
  },
];
