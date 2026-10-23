import type { Ctx, Route } from './http';
import { bad, idParam, input, notFound } from './http';
import { assertStudentAccess } from './auth';
import { pickColor } from './students';
import { placeholders } from './db';
import type { BookLog, BookStatus, StudentBook, Textbook } from '../../shared/types';
import { BOOK_CATEGORIES } from '../../shared/types';

const STATUSES: readonly BookStatus[] = ['current', 'planned', 'done'];

function toTextbook(r: any): Textbook {
  return {
    id: r.id,
    title: r.title,
    publisher: r.publisher,
    category: r.category,
    totalUnits: r.total_units,
    unitLabel: r.unit_label,
    color: r.color,
    memo: r.memo,
    inUse: r.in_use ?? 0,
  };
}

export function listTextbooks(ctx: Ctx, id?: number): Textbook[] {
  return ctx.db
    .all<any>(
      `SELECT t.*, (SELECT COUNT(*) FROM student_books sb WHERE sb.textbook_id = t.id AND sb.status = 'current') in_use
         FROM textbooks t ${id ? 'WHERE t.id = ?' : ''} ORDER BY t.category, t.title`,
      ...(id ? [id] : []),
    )
    .map(toTextbook);
}

export function listStudentBooks(ctx: Ctx, opt: { studentId?: number | null; id?: number; textbookId?: number | null }): StudentBook[] {
  const where: string[] = [];
  const params: number[] = [];
  if (opt.studentId) where.push('sb.student_id = ?'), params.push(opt.studentId);
  if (opt.id) where.push('sb.id = ?'), params.push(opt.id);
  if (opt.textbookId) where.push('sb.textbook_id = ?'), params.push(opt.textbookId);
  const rows = ctx.db.all<any>(
    `SELECT sb.*, s.name student_name, t.id t_id, t.title, t.publisher, t.category, t.total_units, t.unit_label, t.color, t.memo t_memo
       FROM student_books sb JOIN textbooks t ON t.id = sb.textbook_id JOIN students s ON s.id = sb.student_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE sb.status WHEN 'current' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END, sb.updated_at DESC`,
    ...params,
  );
  const logs = new Map<number, BookLog[]>();
  if (rows.length) {
    for (const l of ctx.db.all<any>(
      `SELECT * FROM book_logs WHERE student_book_id IN (${placeholders(rows.length)}) ORDER BY date DESC, id DESC`,
      ...rows.map((r) => r.id),
    )) {
      const list = logs.get(l.student_book_id) ?? [];
      if (list.length < 12) list.push({ id: l.id, date: l.date, progress: l.progress, note: l.note });
      logs.set(l.student_book_id, list);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    studentId: r.student_id,
    studentName: r.student_name,
    textbook: toTextbook({ ...r, id: r.t_id, memo: r.t_memo }),
    status: r.status,
    progress: r.progress,
    note: r.note,
    startedOn: r.started_on,
    finishedOn: r.finished_on,
    updatedAt: r.updated_at,
    logs: logs.get(r.id) ?? [],
  }));
}

function readTextbook(ctx: Ctx, partial: boolean) {
  const b = input(ctx.body);
  const out: Record<string, string | number> = {};
  if (!partial || b.has('title')) out.title = b.str('title', '교재 이름', { required: true, max: 60 });
  if (!partial || b.has('publisher')) out.publisher = b.str('publisher', '출판사', { max: 40 });
  if (!partial || b.has('category')) out.category = b.oneOf('category', '분류', BOOK_CATEGORIES, '기타');
  if (!partial || b.has('totalUnits')) out.total_units = b.int('totalUnits', '전체 분량', { min: 0, max: 2000 }) ?? 0;
  if (!partial || b.has('unitLabel')) out.unit_label = b.str('unitLabel', '단위', { max: 6 }) || '강';
  if (!partial || b.has('memo')) out.memo = b.text('memo', '메모', 1000);
  if (b.has('color')) out.color = b.color('color', '#2B3F5C');
  return out;
}

export const bookRoutes: Route[] = [
  { method: 'GET', path: '/textbooks', access: 'teacher', handler: (ctx) => listTextbooks(ctx) },
  {
    method: 'POST',
    path: '/textbooks',
    access: 'teacher',
    handler: (ctx) => {
      const t = readTextbook(ctx, false);
      const id = ctx.db.run(
        'INSERT INTO textbooks (title, publisher, category, total_units, unit_label, color, memo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        t.title,
        t.publisher,
        t.category,
        t.total_units,
        t.unit_label,
        (t.color as string) ?? pickColor(ctx, 'textbooks', undefined),
        t.memo,
        ctx.now,
      ).lastId;
      return listTextbooks(ctx, id)[0];
    },
  },
  {
    method: 'PATCH',
    path: '/textbooks/:id',
    access: 'teacher',
    handler: (ctx) => {
      const id = idParam(ctx);
      if (!ctx.db.get('SELECT 1 FROM textbooks WHERE id = ?', id)) throw notFound();
      const t = readTextbook(ctx, true);
      const keys = Object.keys(t);
      if (keys.length) ctx.db.run(`UPDATE textbooks SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => t[k]), id);
      return listTextbooks(ctx, id)[0];
    },
  },
  {
    method: 'DELETE',
    path: '/textbooks/:id',
    access: 'teacher',
    handler: (ctx) => {
      const r = ctx.db.run('DELETE FROM textbooks WHERE id = ?', idParam(ctx));
      if (!r.changes) throw notFound();
      return { ok: true };
    },
  },
  {
    method: 'GET',
    path: '/student-books',
    access: 'user',
    handler: (ctx) => {
      const studentId = Number(ctx.query.get('studentId')) || null;
      if (ctx.user!.role === 'teacher') return listStudentBooks(ctx, { studentId, textbookId: Number(ctx.query.get('textbookId')) || null });
      if (!studentId) throw bad('학생을 골라 주세요.');
      assertStudentAccess(ctx, studentId);
      return listStudentBooks(ctx, { studentId });
    },
  },
  {
    method: 'POST',
    path: '/student-books',
    access: 'teacher',
    handler: (ctx) => {
      const b = input(ctx.body);
      const textbookId = b.reqInt('textbookId', '교재');
      if (!ctx.db.get('SELECT 1 FROM textbooks WHERE id = ?', textbookId)) throw bad('교재를 찾을 수 없습니다.');
      const status = b.oneOf('status', '상태', STATUSES, 'current');
      let studentIds = b.ids('studentIds');
      const groupId = b.int('groupId', '반');
      if (groupId) {
        studentIds = [
          ...new Set([
            ...studentIds,
            ...ctx.db
              .all<{ student_id: number }>(
                "SELECT m.student_id FROM group_members m JOIN students s ON s.id = m.student_id WHERE m.group_id = ? AND s.status = 'active'",
                groupId,
              )
              .map((r) => r.student_id),
          ]),
        ];
      }
      if (!studentIds.length) throw bad('교재를 배정할 학생을 골라 주세요.');
      let added = 0;
      ctx.db.tx(() => {
        for (const sid of studentIds) {
          if (!ctx.db.get('SELECT 1 FROM students WHERE id = ?', sid)) throw bad('없는 학생이 포함되어 있습니다.');
          const r = ctx.db.run(
            `INSERT INTO student_books (student_id, textbook_id, status, started_on, updated_at) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(student_id, textbook_id) DO NOTHING`,
            sid,
            textbookId,
            status,
            status === 'current' ? ctx.today : null,
            ctx.now,
          );
          added += r.changes;
        }
      });
      return { added, skipped: studentIds.length - added };
    },
  },
  {
    method: 'PATCH',
    path: '/student-books/:id',
    access: 'teacher',
    handler: (ctx) => {
      const id = idParam(ctx);
      const cur = ctx.db.get<any>(
        'SELECT sb.*, t.total_units FROM student_books sb JOIN textbooks t ON t.id = sb.textbook_id WHERE sb.id = ?',
        id,
      );
      if (!cur) throw notFound();
      const b = input(ctx.body);
      const status = b.has('status') ? b.oneOf('status', '상태', STATUSES) : cur.status;
      let progress = b.has('progress') ? b.reqInt('progress', '진도', { min: 0, max: 2000 }) : cur.progress;
      if (cur.total_units && progress > cur.total_units) progress = cur.total_units;
      if (status === 'done' && cur.status !== 'done' && cur.total_units && !b.has('progress')) progress = cur.total_units;
      const note = b.has('note') ? b.str('note', '진도 메모', { max: 120 }) : cur.note;
      const logDate = b.date('date', '날짜', false) ?? ctx.today;
      ctx.db.tx(() => {
        ctx.db.run(
          `UPDATE student_books SET status = ?, progress = ?, note = ?, updated_at = ?,
                  started_on = CASE WHEN ? = 'current' AND started_on IS NULL THEN ? ELSE started_on END,
                  finished_on = CASE WHEN ? = 'done' THEN COALESCE(finished_on, ?) ELSE NULL END
            WHERE id = ?`,
          status,
          progress,
          note,
          ctx.now,
          status,
          ctx.today,
          status,
          ctx.today,
          id,
        );
        if (progress !== cur.progress || (b.has('note') && note !== cur.note)) {
          ctx.db.run('INSERT INTO book_logs (student_book_id, date, progress, note, created_at) VALUES (?, ?, ?, ?, ?)', id, logDate, progress, note, ctx.now);
        }
      });
      return listStudentBooks(ctx, { id })[0];
    },
  },
  {
    method: 'DELETE',
    path: '/student-books/:id',
    access: 'teacher',
    handler: (ctx) => {
      const r = ctx.db.run('DELETE FROM student_books WHERE id = ?', idParam(ctx));
      if (!r.changes) throw notFound();
      return { ok: true };
    },
  },
];
