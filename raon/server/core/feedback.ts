import type { Ctx, Route } from './http';
import { bad, forbidden, idParam, input, notFound } from './http';
import { assertStudentAccess } from './auth';
import { placeholders } from './db';
import type { Audience, Feedback, Role } from '../../shared/types';
import { FEEDBACK_CATEGORIES } from '../../shared/types';

interface FeedbackFilter {
  studentId?: number | null;
  audience?: Audience | null;
  id?: number;
  limit?: number;
  since?: string;
}

export function listFeedback(ctx: Ctx, f: FeedbackFilter): Feedback[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (f.id) where.push('f.id = ?'), params.push(f.id);
  if (f.studentId) where.push('f.student_id = ?'), params.push(f.studentId);
  if (f.audience) where.push('f.audience = ?'), params.push(f.audience);
  if (f.since) where.push('f.created_at >= ?'), params.push(f.since);
  const rows = ctx.db.all<any>(
    `SELECT f.*, s.name student_name, u.name author_name,
            (SELECT read_at FROM feedback_reads r WHERE r.feedback_id = f.id AND r.user_id = ?) my_read
       FROM feedback f JOIN students s ON s.id = f.student_id LEFT JOIN users u ON u.id = f.author_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY COALESCE(f.class_date, substr(f.created_at, 1, 10)) DESC, f.created_at DESC
      ${f.limit ? `LIMIT ${Math.floor(f.limit)}` : ''}`,
    ctx.user!.id,
    ...params,
  );
  const isTeacher = ctx.user!.role === 'teacher';
  const readers = new Map<number, { name: string; role: Role; readAt: string }[]>();
  if (isTeacher && rows.length) {
    for (const r of ctx.db.all<any>(
      `SELECT r.feedback_id, r.read_at, u.name, u.role FROM feedback_reads r JOIN users u ON u.id = r.user_id
        WHERE r.feedback_id IN (${placeholders(rows.length)}) AND u.role != 'teacher' ORDER BY r.read_at`,
      ...rows.map((r) => r.id),
    )) {
      const list = readers.get(r.feedback_id) ?? [];
      list.push({ name: r.name, role: r.role, readAt: r.read_at });
      readers.set(r.feedback_id, list);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    studentId: r.student_id,
    studentName: r.student_name,
    audience: r.audience,
    category: r.category,
    title: r.title,
    body: r.body,
    classDate: r.class_date,
    authorName: r.author_name ?? '선생님',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    readAt: r.my_read ?? null,
    ...(isTeacher ? { readers: readers.get(r.id) ?? [] } : {}),
  }));
}

export function audienceFor(role: Role): Audience {
  if (role === 'student') return 'student';
  if (role === 'parent') return 'parent';
  throw forbidden();
}

export function unreadCount(ctx: Ctx, studentId: number): number {
  return ctx.db.get<{ c: number }>(
    `SELECT COUNT(*) c FROM feedback f
      WHERE f.student_id = ? AND f.audience = ?
        AND NOT EXISTS (SELECT 1 FROM feedback_reads r WHERE r.feedback_id = f.id AND r.user_id = ?)`,
    studentId,
    audienceFor(ctx.user!.role),
    ctx.user!.id,
  )!.c;
}

export const feedbackRoutes: Route[] = [
  {
    method: 'GET',
    path: '/feedback',
    access: 'user',
    handler: (ctx) => {
      const studentId = Number(ctx.query.get('studentId')) || null;
      if (ctx.user!.role === 'teacher') {
        const aud = ctx.query.get('audience');
        return listFeedback(ctx, {
          studentId,
          audience: aud === 'student' || aud === 'parent' ? aud : null,
          limit: Number(ctx.query.get('limit')) || 200,
        });
      }
      if (!studentId) throw bad('학생을 골라 주세요.');
      assertStudentAccess(ctx, studentId);
      return listFeedback(ctx, { studentId, audience: audienceFor(ctx.user!.role) });
    },
  },
  {
    method: 'POST',
    path: '/feedback',
    access: 'teacher',
    handler: (ctx) => {
      const b = input(ctx.body);
      const studentId = b.reqInt('studentId', '학생');
      if (!ctx.db.get('SELECT 1 FROM students WHERE id = ?', studentId)) throw bad('학생을 찾을 수 없습니다.');
      const category = b.oneOf('category', '분류', FEEDBACK_CATEGORIES, '수업');
      const classDate = b.date('classDate', '수업 날짜', false);
      const title = b.str('title', '제목', { max: 80 });
      const toStudent = b.text('toStudent', '학생에게 보낼 내용', 5000);
      const toParent = b.text('toParent', '학부모님께 보낼 내용', 5000);
      if (!toStudent && !toParent) throw bad('학생 또는 학부모님께 보낼 내용을 적어 주세요.');
      const ids = ctx.db.tx(() => {
        const out: number[] = [];
        for (const [aud, body] of [
          ['student', toStudent],
          ['parent', toParent],
        ] as const) {
          if (!body) continue;
          out.push(
            ctx.db.run(
              `INSERT INTO feedback (student_id, audience, category, title, body, class_date, author_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              studentId,
              aud,
              category,
              title,
              body,
              classDate,
              ctx.user!.id,
              ctx.now,
              ctx.now,
            ).lastId,
          );
        }
        return out;
      });
      return { ids };
    },
  },
  {
    method: 'PATCH',
    path: '/feedback/:id',
    access: 'teacher',
    handler: (ctx) => {
      const id = idParam(ctx);
      if (!ctx.db.get('SELECT 1 FROM feedback WHERE id = ?', id)) throw notFound();
      const b = input(ctx.body);
      ctx.db.run(
        'UPDATE feedback SET category = ?, title = ?, body = ?, class_date = ?, updated_at = ? WHERE id = ?',
        b.oneOf('category', '분류', FEEDBACK_CATEGORIES, '수업'),
        b.str('title', '제목', { max: 80 }),
        b.text('body', '내용', 5000, true),
        b.date('classDate', '수업 날짜', false),
        ctx.now,
        id,
      );
      return listFeedback(ctx, { id })[0];
    },
  },
  {
    method: 'DELETE',
    path: '/feedback/:id',
    access: 'teacher',
    handler: (ctx) => {
      const r = ctx.db.run('DELETE FROM feedback WHERE id = ?', idParam(ctx));
      if (!r.changes) throw notFound();
      return { ok: true };
    },
  },
  {
    method: 'POST',
    path: '/feedback/:id/read',
    access: 'user',
    handler: (ctx) => {
      const id = idParam(ctx);
      const f = ctx.db.get<{ student_id: number; audience: Audience }>('SELECT student_id, audience FROM feedback WHERE id = ?', id);
      if (!f) throw notFound();
      if (ctx.user!.role === 'teacher') return { ok: true };
      assertStudentAccess(ctx, f.student_id);
      if (f.audience !== audienceFor(ctx.user!.role)) throw forbidden();
      ctx.db.run('INSERT OR IGNORE INTO feedback_reads (feedback_id, user_id, read_at) VALUES (?, ?, ?)', id, ctx.user!.id, ctx.now);
      return { ok: true, readAt: ctx.now };
    },
  },
];
