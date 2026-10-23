import type { Ctx, Route } from './http';
import { bad } from './http';
import { assertStudentAccess } from './auth';
import { buildSessions, makeupOverview, onlyStudent } from './calendar';
import { audienceFor, listFeedback, unreadCount } from './feedback';
import { listStudentBooks } from './books';
import { listConsults } from './consults';
import { addDays, nowTimeIn, startOfMonth } from '../../shared/date';
import type { AttendanceSummary, FamilyHome, StudentBrief, TeacherDashboard } from '../../shared/types';

function teacherDashboard(ctx: Ctx): TeacherDashboard {
  const { db, today } = ctx;
  const sessions = buildSessions(ctx, { from: today, to: addDays(today, 1) });
  const makeups = makeupOverview(ctx);
  const weekAgo = new Date(Date.parse(ctx.now) - 7 * 86400000).toISOString();
  return {
    today,
    sessions: sessions.filter((s) => s.date === today),
    tomorrow: sessions.filter((s) => s.date !== today),
    pendingMakeups: makeups.pending,
    upcomingMakeups: makeups.upcoming.slice(0, 8),
    recentFeedback: listFeedback(ctx, { limit: 6 }),
    newConsults: listConsults(ctx, 'new'),
    counts: {
      students: db.get<{ c: number }>("SELECT COUNT(*) c FROM students WHERE status = 'active'")!.c,
      groups: db.get<{ c: number }>('SELECT COUNT(*) c FROM class_groups')!.c,
      feedbackThisWeek: db.get<{ c: number }>('SELECT COUNT(*) c FROM feedback WHERE created_at >= ?', weekAgo)!.c,
    },
  };
}

export function attendanceSummary(ctx: Ctx, studentId: number, from: string, to: string): AttendanceSummary {
  const out: AttendanceSummary = { present: 0, late: 0, absent: 0 };
  for (const r of ctx.db.all<{ status: keyof AttendanceSummary; c: number }>(
    'SELECT status, COUNT(*) c FROM attendance WHERE student_id = ? AND date BETWEEN ? AND ? GROUP BY status',
    studentId,
    from,
    to,
  )) {
    out[r.status] = r.c;
  }
  return out;
}

function familyHome(ctx: Ctx, studentId: number): FamilyHome {
  const { db, today } = ctx;
  const student = db.get<StudentBrief>('SELECT id, name, school, grade, color FROM students WHERE id = ?', studentId)!;
  const ahead = onlyStudent(buildSessions(ctx, { from: today, to: addDays(today, 21), studentId }), studentId);
  const nowTime = nowTimeIn('Asia/Seoul', new Date(ctx.now));
  const next =
    ahead.find((s) => !s.cancelled && s.kind !== 'holiday' && s.start && (s.date > today || (s.end ?? s.start) > nowTime)) ?? null;
  return {
    student,
    today,
    next,
    week: ahead.filter((s) => s.date <= addDays(today, 6)),
    books: listStudentBooks(ctx, { studentId }).filter((b) => b.status === 'current'),
    feedback: listFeedback(ctx, { studentId, audience: audienceFor(ctx.user!.role), limit: 3 }),
    unread: unreadCount(ctx, studentId),
    makeups: ahead.filter((s) => s.kind === 'makeup'),
    attendance: attendanceSummary(ctx, studentId, startOfMonth(today), today),
  };
}

export const homeRoutes: Route[] = [
  { method: 'GET', path: '/dashboard', access: 'teacher', handler: teacherDashboard },
  {
    method: 'GET',
    path: '/home',
    access: 'user',
    handler: (ctx) => {
      const studentId = Number(ctx.query.get('studentId'));
      if (!studentId) throw bad('학생을 골라 주세요.');
      assertStudentAccess(ctx, studentId);
      return familyHome(ctx, studentId);
    },
  },
];
