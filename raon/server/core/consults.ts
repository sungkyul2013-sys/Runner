import type { Ctx, Route } from './http';
import { bad, HttpError, idParam, input, notFound } from './http';
import type { ConsultRequest } from '../../shared/types';
import { CONSULT_GRADES } from '../../shared/types';

// 한 곳(IP)에서 한 시간에 다섯 번까지만 받는다 (프로세스 메모리 기준)
const recent = new Map<string, number[]>();
const WINDOW = 60 * 60000;
const LIMIT = 5;

function throttle(ip: string) {
  const now = Date.now();
  const list = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW);
  if (list.length >= LIMIT) throw new HttpError(429, '신청이 너무 많습니다. 잠시 후 다시 시도하거나 학원으로 전화해 주세요.');
  list.push(now);
  recent.set(ip, list);
  if (recent.size > 5000) recent.clear();
}

const row = (r: any): ConsultRequest => ({
  id: r.id,
  studentName: r.student_name,
  grade: r.grade,
  phone: r.phone,
  preferredTime: r.preferred_time,
  message: r.message,
  status: r.status,
  createdAt: r.created_at,
  handledAt: r.handled_at,
});

export function listConsults(ctx: Ctx, status?: 'new' | 'done'): ConsultRequest[] {
  const where = status ? 'WHERE status = ?' : '';
  return ctx.db
    .all<any>(`SELECT * FROM consult_requests ${where} ORDER BY CASE status WHEN 'new' THEN 0 ELSE 1 END, created_at DESC`, ...(status ? [status] : []))
    .map(row);
}

export const consultRoutes: Route[] = [
  {
    method: 'POST',
    path: '/consults',
    access: 'public',
    handler: (ctx) => {
      const b = input(ctx.body);
      // 사람 눈에는 안 보이는 칸. 채워져 있으면 자동 입력으로 보고 조용히 넘긴다.
      if (b.src.website) return { ok: true };
      if (!b.bool('agree')) throw bad('개인정보 수집·이용에 동의해 주세요.');
      const studentName = b.str('studentName', '학생 이름', { required: true, max: 30 });
      const grade = b.oneOf('grade', '학년', CONSULT_GRADES);
      const phone = b.str('phone', '연락처', { required: true, max: 20 });
      if (!/^[0-9+\-() ]{9,20}$/.test(phone) || phone.replace(/\D/g, '').length < 9) throw bad('연락처를 확인해 주세요.');
      const preferredTime = b.str('preferredTime', '희망 시간', { max: 60 });
      const message = b.text('message', '문의 내용', 1000);
      throttle(ctx.ip);
      ctx.db.run(
        'INSERT INTO consult_requests (student_name, grade, phone, preferred_time, message, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        studentName,
        grade,
        phone,
        preferredTime,
        message,
        ctx.now,
      );
      return { ok: true };
    },
  },
  { method: 'GET', path: '/consults', access: 'teacher', handler: (ctx) => listConsults(ctx) },
  {
    method: 'PATCH',
    path: '/consults/:id',
    access: 'teacher',
    handler: (ctx) => {
      const id = idParam(ctx);
      const status = input(ctx.body).oneOf('status', '상태', ['new', 'done'] as const);
      const r = ctx.db.run('UPDATE consult_requests SET status = ?, handled_at = ? WHERE id = ?', status, status === 'done' ? ctx.now : null, id);
      if (!r.changes) throw notFound();
      return row(ctx.db.get('SELECT * FROM consult_requests WHERE id = ?', id));
    },
  },
  {
    method: 'DELETE',
    path: '/consults/:id',
    access: 'teacher',
    handler: (ctx) => {
      const r = ctx.db.run('DELETE FROM consult_requests WHERE id = ?', idParam(ctx));
      if (!r.changes) throw notFound();
      return { ok: true };
    },
  },
];
