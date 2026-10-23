import type { Ctx, Route } from './http';
import { bad, idParam, input, notFound, validLoginId, validPassword } from './http';
import { loginIdTaken } from './auth';
import { placeholders } from './db';
import type { GroupRef, StudentDetail, StudentRow, StudentStatus } from '../../shared/types';

export const PALETTE = ['#2F6FDE', '#1F9E6E', '#8A56E2', '#F2A91E', '#E5483B', '#0A84A8', '#D9622B', '#5E5CE6', '#7A8A2C', '#C2457A'];

const STATUSES: readonly StudentStatus[] = ['active', 'paused', 'left'];

function nextColor(ctx: Ctx, table: 'students' | 'class_groups' | 'textbooks') {
  const n = ctx.db.get<{ c: number }>(`SELECT COUNT(*) c FROM ${table}`)!.c;
  return PALETTE[n % PALETTE.length];
}

export function pickColor(ctx: Ctx, table: 'students' | 'class_groups' | 'textbooks', given: unknown) {
  return input({ c: given }).color('c', nextColor(ctx, table));
}

function studentRows(ctx: Ctx, where = '', ...params: (string | number)[]): StudentRow[] {
  const rows = ctx.db.all<any>(
    `SELECT s.*,
            (SELECT COUNT(*) FROM users u WHERE u.student_id = s.id) AS has_account,
            (SELECT COUNT(*) FROM family_links f WHERE f.student_id = s.id) AS parent_count,
            (SELECT t.title FROM student_books sb JOIN textbooks t ON t.id = sb.textbook_id
              WHERE sb.student_id = s.id AND sb.status = 'current' ORDER BY sb.updated_at DESC LIMIT 1) AS current_book
       FROM students s ${where}
      ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, s.name`,
    ...params,
  );
  if (!rows.length) return [];
  const groups = ctx.db.all<any>(
    `SELECT m.student_id, g.id, g.name, g.color FROM group_members m JOIN class_groups g ON g.id = m.group_id
      WHERE m.student_id IN (${placeholders(rows.length)}) ORDER BY g.name`,
    ...rows.map((r) => r.id),
  );
  const byStudent = new Map<number, GroupRef[]>();
  for (const g of groups) {
    const list = byStudent.get(g.student_id) ?? [];
    list.push({ id: g.id, name: g.name, color: g.color });
    byStudent.set(g.student_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    school: r.school,
    grade: r.grade,
    color: r.color,
    phone: r.phone,
    memo: r.memo,
    status: r.status,
    createdAt: r.created_at,
    groups: byStudent.get(r.id) ?? [],
    currentBook: r.current_book ?? null,
    hasAccount: r.has_account > 0,
    parentCount: r.parent_count,
  }));
}

function studentDetail(ctx: Ctx, id: number): StudentDetail {
  const [row] = studentRows(ctx, 'WHERE s.id = ?', id);
  if (!row) throw notFound('학생을 찾을 수 없습니다.');
  const acc = ctx.db.get<any>('SELECT id, login_id, last_login_at FROM users WHERE student_id = ?', id);
  const parents = ctx.db.all<any>(
    `SELECT u.id, u.name, u.login_id, u.phone, u.last_login_at, f.relation
       FROM family_links f JOIN users u ON u.id = f.user_id WHERE f.student_id = ? ORDER BY u.name`,
    id,
  );
  return {
    ...row,
    account: acc ? { userId: acc.id, loginId: acc.login_id, lastLoginAt: acc.last_login_at } : null,
    parents: parents.map((p) => ({
      userId: p.id,
      name: p.name,
      loginId: p.login_id,
      phone: p.phone,
      relation: p.relation,
      lastLoginAt: p.last_login_at,
    })),
  };
}

function setGroups(ctx: Ctx, studentId: number, groupIds: number[]) {
  ctx.db.run('DELETE FROM group_members WHERE student_id = ?', studentId);
  for (const gid of groupIds) {
    if (!ctx.db.get('SELECT 1 FROM class_groups WHERE id = ?', gid)) throw bad('없는 반이 포함되어 있습니다.');
    ctx.db.run('INSERT INTO group_members (group_id, student_id) VALUES (?, ?)', gid, studentId);
  }
}

function upsertStudentAccount(ctx: Ctx, studentId: number, name: string, raw: unknown) {
  const b = input(raw);
  const loginId = b.str('loginId', '학생 아이디', { required: true, max: 30 });
  validLoginId(loginId);
  const existing = ctx.db.get<{ id: number }>('SELECT id FROM users WHERE student_id = ?', studentId);
  if (loginIdTaken(ctx.db, loginId, existing?.id)) throw bad(`'${loginId}'는 이미 쓰고 있는 아이디입니다.`);
  if (existing) {
    ctx.db.run('UPDATE users SET login_id = ?, name = ? WHERE id = ?', loginId, name, existing.id);
    if (b.src.password) {
      ctx.db.run('UPDATE users SET password_hash = ? WHERE id = ?', ctx.crypto.hashPassword(validPassword(b.src.password)), existing.id);
      ctx.db.run('DELETE FROM sessions WHERE user_id = ?', existing.id);
    }
    return existing.id;
  }
  const pw = validPassword(b.src.password);
  return ctx.db.run(
    "INSERT INTO users (role, name, login_id, password_hash, student_id, created_at) VALUES ('student', ?, ?, ?, ?, ?)",
    name,
    loginId,
    ctx.crypto.hashPassword(pw),
    studentId,
    ctx.now,
  ).lastId;
}

function addParent(ctx: Ctx, studentId: number, raw: unknown) {
  const b = input(raw);
  const relation = b.str('relation', '관계', { max: 10 });
  const existingLogin = b.str('existingLoginId', '아이디', { max: 30 });
  let userId: number;
  if (existingLogin) {
    const u = ctx.db.get<{ id: number; role: string }>('SELECT id, role FROM users WHERE login_id = ?', existingLogin);
    if (!u || u.role !== 'parent') throw bad('해당 아이디의 학부모 계정이 없습니다.');
    userId = u.id;
  } else {
    const name = b.str('name', '학부모 이름', { required: true, max: 30 });
    const loginId = b.str('loginId', '학부모 아이디', { required: true, max: 30 });
    validLoginId(loginId);
    if (loginIdTaken(ctx.db, loginId)) throw bad(`'${loginId}'는 이미 쓰고 있는 아이디입니다. 형제·자매라면 '기존 계정 연결'을 써 주세요.`);
    const pw = validPassword(b.src.password);
    userId = ctx.db.run(
      "INSERT INTO users (role, name, login_id, password_hash, phone, created_at) VALUES ('parent', ?, ?, ?, ?, ?)",
      name,
      loginId,
      ctx.crypto.hashPassword(pw),
      b.str('phone', '연락처', { max: 30 }),
      ctx.now,
    ).lastId;
  }
  ctx.db.run(
    'INSERT INTO family_links (user_id, student_id, relation) VALUES (?, ?, ?) ON CONFLICT(user_id, student_id) DO UPDATE SET relation = excluded.relation',
    userId,
    studentId,
    relation,
  );
  return userId;
}

function readStudentFields(raw: unknown, partial: boolean) {
  const b = input(raw);
  const out: Record<string, string> = {};
  if (!partial || b.has('name')) out.name = b.str('name', '이름', { required: true, max: 30 });
  if (!partial || b.has('school')) out.school = b.str('school', '학교', { max: 40 });
  if (!partial || b.has('grade')) out.grade = b.str('grade', '학년', { max: 20 });
  if (!partial || b.has('phone')) out.phone = b.str('phone', '연락처', { max: 30 });
  if (!partial || b.has('memo')) out.memo = b.text('memo', '메모', 2000);
  if (b.has('status')) out.status = b.oneOf('status', '상태', STATUSES);
  if (b.has('color')) out.color = b.color('color', PALETTE[0]);
  return { out, b };
}

export const studentRoutes: Route[] = [
  {
    method: 'GET',
    path: '/students',
    access: 'teacher',
    handler: (ctx) => studentRows(ctx),
  },
  {
    method: 'POST',
    path: '/students',
    access: 'teacher',
    handler: (ctx) => {
      const { out, b } = readStudentFields(ctx.body, false);
      const groupIds = b.ids('groupIds');
      const id = ctx.db.tx(() => {
        const sid = ctx.db.run(
          'INSERT INTO students (name, school, grade, phone, memo, color, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          out.name,
          out.school,
          out.grade,
          out.phone,
          out.memo,
          out.color ?? pickColor(ctx, 'students', undefined),
          out.status ?? 'active',
          ctx.now,
        ).lastId;
        setGroups(ctx, sid, groupIds);
        if (b.src.account) upsertStudentAccount(ctx, sid, out.name, b.src.account);
        if (Array.isArray(b.src.parents)) for (const p of b.src.parents) addParent(ctx, sid, p);
        return sid;
      });
      return studentDetail(ctx, id);
    },
  },
  {
    method: 'GET',
    path: '/students/:id',
    access: 'teacher',
    handler: (ctx) => studentDetail(ctx, idParam(ctx)),
  },
  {
    method: 'PATCH',
    path: '/students/:id',
    access: 'teacher',
    handler: (ctx) => {
      const id = idParam(ctx);
      if (!ctx.db.get('SELECT 1 FROM students WHERE id = ?', id)) throw notFound();
      const { out, b } = readStudentFields(ctx.body, true);
      ctx.db.tx(() => {
        const keys = Object.keys(out);
        if (keys.length) {
          ctx.db.run(`UPDATE students SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => out[k]), id);
        }
        if (out.name) ctx.db.run('UPDATE users SET name = ? WHERE student_id = ?', out.name, id);
        if (b.has('groupIds')) setGroups(ctx, id, b.ids('groupIds'));
      });
      return studentDetail(ctx, id);
    },
  },
  {
    method: 'DELETE',
    path: '/students/:id',
    access: 'teacher',
    handler: (ctx) => {
      const id = idParam(ctx);
      ctx.db.tx(() => {
        const parents = ctx.db.all<{ user_id: number }>('SELECT user_id FROM family_links WHERE student_id = ?', id);
        const r = ctx.db.run('DELETE FROM students WHERE id = ?', id);
        if (!r.changes) throw notFound();
        // 다른 자녀와 연결되지 않은 학부모 계정은 함께 정리
        for (const p of parents) {
          if (!ctx.db.get('SELECT 1 FROM family_links WHERE user_id = ?', p.user_id)) ctx.db.run('DELETE FROM users WHERE id = ?', p.user_id);
        }
      });
      return { ok: true };
    },
  },
  {
    method: 'PUT',
    path: '/students/:id/account',
    access: 'teacher',
    handler: (ctx) => {
      const id = idParam(ctx);
      const s = ctx.db.get<{ name: string }>('SELECT name FROM students WHERE id = ?', id);
      if (!s) throw notFound();
      ctx.db.tx(() => upsertStudentAccount(ctx, id, s.name, ctx.body));
      return studentDetail(ctx, id);
    },
  },
  {
    method: 'DELETE',
    path: '/students/:id/account',
    access: 'teacher',
    handler: (ctx) => {
      const id = idParam(ctx);
      ctx.db.run('DELETE FROM users WHERE student_id = ?', id);
      return studentDetail(ctx, id);
    },
  },
  {
    method: 'POST',
    path: '/students/:id/parents',
    access: 'teacher',
    handler: (ctx) => {
      const id = idParam(ctx);
      if (!ctx.db.get('SELECT 1 FROM students WHERE id = ?', id)) throw notFound();
      ctx.db.tx(() => addParent(ctx, id, ctx.body));
      return studentDetail(ctx, id);
    },
  },
  {
    method: 'DELETE',
    path: '/students/:id/parents/:userId',
    access: 'teacher',
    handler: (ctx) => {
      const id = idParam(ctx);
      const userId = idParam(ctx, 'userId');
      ctx.db.tx(() => {
        ctx.db.run('DELETE FROM family_links WHERE user_id = ? AND student_id = ?', userId, id);
        if (!ctx.db.get('SELECT 1 FROM family_links WHERE user_id = ?', userId)) {
          ctx.db.run("DELETE FROM users WHERE id = ? AND role = 'parent'", userId);
        }
      });
      return studentDetail(ctx, id);
    },
  },
];
