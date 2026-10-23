import type { Ctx, Route } from './http';
import { bad, idParam, input, notFound } from './http';
import { assertStudentAccess } from './auth';
import { placeholders } from './db';
import { addDays, diffDays, eachDay, isDate, weekday } from '../../shared/date';
import type { AttendanceStatus, CalSession, EventKind, MakeupNeed, MakeupOverview, RosterEntry } from '../../shared/types';
import { EVENT_LABEL } from '../../shared/types';

const EVENT_COLOR: Record<EventKind, string> = {
  makeup: '#B23A26',
  extra: '#2F6466',
  cancel: '#8A857A',
  exam: '#A87B2C',
  holiday: '#8A857A',
  consult: '#6E4A5E',
  etc: '#59606B',
};

const KINDS: readonly EventKind[] = ['makeup', 'extra', 'cancel', 'exam', 'holiday', 'consult', 'etc'];

export interface SessionQuery {
  from: string;
  to: string;
  studentId?: number | null;
  groupId?: number | null;
}

type Person = { id: number; name: string };

/**
 * 기간 안의 모든 수업·일정을 펼친다.
 * 정규 수업은 반 시간표(요일·시간)에서 날짜마다 만들어 내고,
 * 휴원·휴강 일정이 있으면 취소로 표시한다. 보강·시험 같은 일정은 그대로 얹는다.
 */
export function buildSessions(ctx: Ctx, q: SessionQuery): CalSession[] {
  const { db } = ctx;
  const groups = new Map(db.all<any>('SELECT id, name, color, room FROM class_groups').map((g) => [g.id as number, g]));
  const slots = db.all<any>('SELECT id, group_id, weekday, start_time, end_time FROM group_slots');
  const memberRows = db.all<any>(
    `SELECT m.group_id, s.id, s.name FROM group_members m JOIN students s ON s.id = m.student_id
      WHERE s.status = 'active' ORDER BY s.name`,
  );
  const members = new Map<number, Person[]>();
  for (const m of memberRows) {
    const list = members.get(m.group_id) ?? [];
    list.push({ id: m.id, name: m.name });
    members.set(m.group_id, list);
  }

  const events = db.all<any>('SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date, start_time', q.from, q.to);
  const evStudents = new Map<number, Person[]>();
  if (events.length) {
    const rows = db.all<any>(
      `SELECT es.event_id, s.id, s.name FROM event_students es JOIN students s ON s.id = es.student_id
        WHERE es.event_id IN (${placeholders(events.length)}) ORDER BY s.name`,
      ...events.map((e) => e.id),
    );
    for (const r of rows) {
      const list = evStudents.get(r.event_id) ?? [];
      list.push({ id: r.id, name: r.name });
      evStudents.set(r.event_id, list);
    }
  }

  const holidays = new Map<string, any>();
  const cancels = new Map<string, any>();
  for (const e of events) {
    if (e.kind === 'holiday') holidays.set(e.date, e);
    if (e.kind === 'cancel' && e.group_id) cancels.set(`${e.group_id}|${e.date}`, e);
  }

  const att = new Map<string, any>();
  for (const a of db.all<any>('SELECT * FROM attendance WHERE date BETWEEN ? AND ?', q.from, q.to)) {
    att.set(`${a.date}|${a.session_key}|${a.student_id}`, a);
  }
  const roster = (date: string, key: string, people: Person[]): RosterEntry[] =>
    people.map((p) => {
      const a = att.get(`${date}|${key}|${p.id}`);
      return {
        id: p.id,
        name: p.name,
        status: (a?.status as AttendanceStatus) ?? null,
        attendanceId: a?.id ?? null,
        note: a?.note ?? '',
        makeupEventId: a?.makeup_event_id ?? null,
      };
    });

  const out: CalSession[] = [];

  for (const date of eachDay(q.from, q.to)) {
    const wd = weekday(date);
    for (const s of slots) {
      if (s.weekday !== wd) continue;
      const g = groups.get(s.group_id);
      if (!g) continue;
      const key = `g${g.id}s${s.id}`;
      const hol = holidays.get(date);
      const can = cancels.get(`${g.id}|${date}`);
      const stop = can ?? hol;
      out.push({
        key,
        date,
        start: s.start_time,
        end: s.end_time,
        kind: 'class',
        title: g.name,
        groupId: g.id,
        groupName: g.name,
        color: g.color,
        room: g.room,
        memo: '',
        cancelled: !!stop,
        cancelReason: stop ? stop.title || EVENT_LABEL[stop.kind as EventKind] : '',
        cancelEventId: can?.id ?? null,
        eventId: null,
        origin: null,
        allStudents: false,
        students: roster(date, key, members.get(g.id) ?? []),
      });
    }
  }

  for (const e of events) {
    if (e.kind === 'cancel') continue; // 정규 수업 쪽에 취소로 표시됨
    const g = e.group_id ? groups.get(e.group_id) : null;
    const listed = evStudents.get(e.id);
    const people = listed?.length ? listed : g ? members.get(g.id) ?? [] : [];
    const key = `e${e.id}`;
    out.push({
      key,
      date: e.date,
      start: e.start_time,
      end: e.end_time,
      kind: e.kind,
      title: e.title || (g ? `${g.name} ${EVENT_LABEL[e.kind as EventKind]}` : EVENT_LABEL[e.kind as EventKind]),
      groupId: g?.id ?? null,
      groupName: g?.name ?? null,
      color: EVENT_COLOR[e.kind as EventKind],
      room: e.room || g?.room || '',
      memo: e.memo,
      cancelled: false,
      cancelReason: '',
      cancelEventId: null,
      eventId: e.id,
      origin: e.origin_date ? { date: e.origin_date, label: e.origin_label ?? '' } : null,
      allStudents: !listed?.length && !g,
      students: e.kind === 'holiday' ? [] : roster(e.date, key, people),
    });
  }

  let filtered = out;
  if (q.studentId) filtered = filtered.filter((s) => s.allStudents || s.students.some((p) => p.id === q.studentId));
  if (q.groupId) filtered = filtered.filter((s) => s.allStudents || s.groupId === q.groupId);

  return filtered.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? '') || a.title.localeCompare(b.title));
}

/** 학생·학부모에게는 다른 학생 이름이 보이지 않도록 자기 것만 남긴다 */
export function onlyStudent(sessions: CalSession[], studentId: number): CalSession[] {
  return sessions.map((s) => ({ ...s, students: s.students.filter((p) => p.id === studentId) }));
}

function rangeFromQuery(ctx: Ctx) {
  const from = ctx.query.get('from');
  const to = ctx.query.get('to');
  if (!isDate(from) || !isDate(to) || to < from) throw bad('기간을 확인해 주세요.');
  if (diffDays(from, to) > 62) throw bad('한 번에 두 달까지만 볼 수 있습니다.');
  return { from, to };
}

function sessionLabel(ctx: Ctx, key: string): { label: string; groupId: number | null } {
  const g = /^g(\d+)s\d+$/.exec(key);
  if (g) {
    const row = ctx.db.get<any>('SELECT id, name FROM class_groups WHERE id = ?', Number(g[1]));
    return { label: row?.name ?? '정규 수업', groupId: row?.id ?? null };
  }
  const e = /^e(\d+)$/.exec(key);
  if (e) {
    const row = ctx.db.get<any>('SELECT e.kind, e.title, e.group_id, g.name gname FROM events e LEFT JOIN class_groups g ON g.id = e.group_id WHERE e.id = ?', Number(e[1]));
    if (row) return { label: row.title || `${row.gname ?? ''} ${EVENT_LABEL[row.kind as EventKind]}`.trim(), groupId: row.group_id };
  }
  return { label: '수업', groupId: null };
}

export function makeupOverview(ctx: Ctx, studentId?: number): MakeupOverview {
  const { db, today } = ctx;
  const absences = db.all<any>(
    `SELECT a.id, a.date, a.session_key, a.note, s.id sid, s.name, s.school, s.grade, s.color
       FROM attendance a JOIN students s ON s.id = a.student_id
      WHERE a.status = 'absent' AND a.makeup_event_id IS NULL AND a.makeup_skip = 0 AND s.status != 'left'
        ${studentId ? 'AND s.id = ?' : ''}
      ORDER BY a.date`,
    ...(studentId ? [studentId] : []),
  );
  const pending: MakeupNeed[] = absences.map((a) => {
    const { label, groupId } = sessionLabel(ctx, a.session_key);
    return {
      type: 'absence',
      id: a.id,
      date: a.date,
      label,
      groupId,
      note: a.note,
      students: [{ id: a.sid, name: a.name, school: a.school, grade: a.grade, color: a.color }],
    };
  });

  if (!studentId) {
    const cancels = db.all<any>(
      `SELECT e.id, e.date, e.title, e.memo, g.id gid, g.name gname FROM events e JOIN class_groups g ON g.id = e.group_id
        WHERE e.kind = 'cancel' AND e.no_makeup = 0 AND e.resolved_by IS NULL ORDER BY e.date`,
    );
    for (const c of cancels) {
      const people = db.all<any>(
        `SELECT s.id, s.name, s.school, s.grade, s.color FROM group_members m JOIN students s ON s.id = m.student_id
          WHERE m.group_id = ? AND s.status = 'active' ORDER BY s.name`,
        c.gid,
      );
      pending.push({ type: 'cancel', id: c.id, date: c.date, label: `${c.gname} 휴강`, groupId: c.gid, note: c.title || c.memo, students: people });
    }
    pending.sort((a, b) => a.date.localeCompare(b.date));
  }

  const lookAhead = buildSessions(ctx, { from: addDays(today, -60), to: addDays(today, 60), studentId: studentId ?? null }).filter((s) => s.kind === 'makeup');
  const view = studentId ? onlyStudent(lookAhead, studentId) : lookAhead;
  return {
    pending,
    upcoming: view.filter((s) => s.date >= today),
    past: view.filter((s) => s.date < today).reverse(),
  };
}

function readEvent(ctx: Ctx, raw: unknown) {
  const b = input(raw);
  const kind = b.oneOf('kind', '종류', KINDS);
  const date = b.date('date', '날짜')!;
  const start = b.time('start', '시작 시간');
  const end = b.time('end', '끝 시간');
  if (start && end && end <= start) throw bad('끝나는 시간이 시작 시간보다 늦어야 합니다.');
  const groupId = b.int('groupId', '반');
  if (groupId && !ctx.db.get('SELECT 1 FROM class_groups WHERE id = ?', groupId)) throw bad('없는 반입니다.');
  if (kind === 'cancel' && !groupId) throw bad('휴강할 반을 골라 주세요. 학원 전체가 쉬는 날은 ‘휴원’으로 등록합니다.');
  const studentIds = b.ids('studentIds');
  if (kind === 'makeup' && !groupId && !studentIds.length) throw bad('보강을 들을 학생을 골라 주세요.');
  if (kind === 'makeup' && !start) throw bad('보강 시간을 정해 주세요.');
  for (const sid of studentIds) if (!ctx.db.get('SELECT 1 FROM students WHERE id = ?', sid)) throw bad('없는 학생이 포함되어 있습니다.');
  return {
    kind,
    date,
    start,
    end,
    groupId,
    studentIds,
    title: b.str('title', '제목', { max: 60 }),
    room: b.str('room', '강의실', { max: 30 }),
    memo: b.text('memo', '메모', 1000),
    noMakeup: b.bool('noMakeup'),
    originDate: b.date('originDate', '원래 수업 날짜', false),
    originLabel: b.str('originLabel', '원래 수업', { max: 60 }),
    attendanceIds: b.ids('attendanceIds'),
    cancelEventIds: b.ids('cancelEventIds'),
  };
}

function linkMakeup(ctx: Ctx, eventId: number, attendanceIds: number[], cancelEventIds: number[]) {
  for (const id of attendanceIds) ctx.db.run('UPDATE attendance SET makeup_event_id = ?, makeup_skip = 0 WHERE id = ?', eventId, id);
  for (const id of cancelEventIds) ctx.db.run("UPDATE events SET resolved_by = ? WHERE id = ? AND kind = 'cancel'", eventId, id);
}

function sessionAt(ctx: Ctx, date: string, key: string): CalSession | undefined {
  return buildSessions(ctx, { from: date, to: date }).find((s) => s.key === key);
}

export const calendarRoutes: Route[] = [
  {
    method: 'GET',
    path: '/calendar',
    access: 'user',
    handler: (ctx) => {
      const { from, to } = rangeFromQuery(ctx);
      const studentId = Number(ctx.query.get('studentId')) || null;
      const groupId = Number(ctx.query.get('groupId')) || null;
      if (ctx.user!.role === 'teacher') return buildSessions(ctx, { from, to, studentId, groupId });
      if (!studentId) throw bad('학생을 골라 주세요.');
      assertStudentAccess(ctx, studentId);
      return onlyStudent(buildSessions(ctx, { from, to, studentId }), studentId);
    },
  },
  {
    method: 'POST',
    path: '/events',
    access: 'teacher',
    handler: (ctx) => {
      const e = readEvent(ctx, ctx.body);
      const id = ctx.db.tx(() => {
        if (e.kind === 'cancel' && ctx.db.get("SELECT 1 FROM events WHERE kind = 'cancel' AND group_id = ? AND date = ?", e.groupId, e.date)) {
          throw bad('이미 휴강으로 등록된 수업입니다.');
        }
        const eid = ctx.db.run(
          `INSERT INTO events (kind, title, date, start_time, end_time, group_id, room, memo, no_makeup, origin_date, origin_label, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          e.kind,
          e.title,
          e.date,
          e.start,
          e.end,
          e.groupId,
          e.room,
          e.memo,
          e.noMakeup ? 1 : 0,
          e.originDate,
          e.originLabel || null,
          ctx.user!.id,
          ctx.now,
        ).lastId;
        for (const sid of e.studentIds) ctx.db.run('INSERT INTO event_students (event_id, student_id) VALUES (?, ?)', eid, sid);
        if (e.kind === 'makeup') linkMakeup(ctx, eid, e.attendanceIds, e.cancelEventIds);
        return eid;
      });
      return { id };
    },
  },
  {
    method: 'PATCH',
    path: '/events/:id',
    access: 'teacher',
    handler: (ctx) => {
      const id = idParam(ctx);
      const old = ctx.db.get<any>('SELECT * FROM events WHERE id = ?', id);
      if (!old) throw notFound('일정을 찾을 수 없습니다.');
      const e = readEvent(ctx, { kind: old.kind, ...ctx.body });
      ctx.db.tx(() => {
        ctx.db.run(
          `UPDATE events SET kind = ?, title = ?, date = ?, start_time = ?, end_time = ?, group_id = ?, room = ?, memo = ?, no_makeup = ?,
                  origin_date = COALESCE(?, origin_date), origin_label = COALESCE(?, origin_label) WHERE id = ?`,
          e.kind,
          e.title,
          e.date,
          e.start,
          e.end,
          e.groupId,
          e.room,
          e.memo,
          e.noMakeup ? 1 : 0,
          e.originDate,
          e.originLabel || null,
          id,
        );
        if (input(ctx.body).has('studentIds')) {
          ctx.db.run('DELETE FROM event_students WHERE event_id = ?', id);
          for (const sid of e.studentIds) ctx.db.run('INSERT INTO event_students (event_id, student_id) VALUES (?, ?)', id, sid);
        }
        if (e.kind === 'makeup') linkMakeup(ctx, id, e.attendanceIds, e.cancelEventIds);
      });
      return { id };
    },
  },
  {
    method: 'DELETE',
    path: '/events/:id',
    access: 'teacher',
    handler: (ctx) => {
      const id = idParam(ctx);
      ctx.db.tx(() => {
        // 이 보강에 묶여 있던 결석·휴강은 다시 '보강 대기'로 돌아간다
        ctx.db.run('UPDATE attendance SET makeup_event_id = NULL WHERE makeup_event_id = ?', id);
        ctx.db.run('UPDATE events SET resolved_by = NULL WHERE resolved_by = ?', id);
        ctx.db.run('DELETE FROM attendance WHERE session_key = ?', `e${id}`);
        const r = ctx.db.run('DELETE FROM events WHERE id = ?', id);
        if (!r.changes) throw notFound('일정을 찾을 수 없습니다.');
      });
      return { ok: true };
    },
  },
  {
    method: 'PUT',
    path: '/attendance',
    access: 'teacher',
    handler: (ctx) => {
      const b = input(ctx.body);
      const date = b.date('date', '날짜')!;
      const key = b.str('sessionKey', '수업', { required: true, max: 30 });
      const studentId = b.reqInt('studentId', '학생');
      const status = b.src.status === null ? null : b.oneOf('status', '출결', ['present', 'late', 'absent'] as const);
      const note = b.str('note', '메모', { max: 200 });
      const session = sessionAt(ctx, date, key);
      if (!session) throw bad('해당 날짜에 그 수업이 없습니다.');
      if (!session.students.some((s) => s.id === studentId)) throw bad('이 수업을 듣는 학생이 아닙니다.');
      if (status === null) {
        ctx.db.run('DELETE FROM attendance WHERE student_id = ? AND date = ? AND session_key = ?', studentId, date, key);
      } else {
        ctx.db.run(
          `INSERT INTO attendance (student_id, date, session_key, status, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(student_id, date, session_key) DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = excluded.updated_at,
             makeup_event_id = CASE WHEN excluded.status = 'absent' THEN attendance.makeup_event_id ELSE NULL END`,
          studentId,
          date,
          key,
          status,
          note,
          ctx.now,
        );
      }
      return sessionAt(ctx, date, key);
    },
  },
  {
    method: 'POST',
    path: '/attendance/bulk',
    access: 'teacher',
    handler: (ctx) => {
      const b = input(ctx.body);
      const date = b.date('date', '날짜')!;
      const key = b.str('sessionKey', '수업', { required: true, max: 30 });
      const session = sessionAt(ctx, date, key);
      if (!session) throw bad('해당 날짜에 그 수업이 없습니다.');
      ctx.db.tx(() => {
        for (const s of session.students) {
          if (s.status) continue;
          ctx.db.run(
            "INSERT INTO attendance (student_id, date, session_key, status, updated_at) VALUES (?, ?, ?, 'present', ?)",
            s.id,
            date,
            key,
            ctx.now,
          );
        }
      });
      return sessionAt(ctx, date, key);
    },
  },
  {
    method: 'GET',
    path: '/makeups',
    access: 'user',
    handler: (ctx) => {
      if (ctx.user!.role === 'teacher') return makeupOverview(ctx);
      const studentId = Number(ctx.query.get('studentId'));
      if (!studentId) throw bad('학생을 골라 주세요.');
      assertStudentAccess(ctx, studentId);
      const o = makeupOverview(ctx, studentId);
      return { ...o, pending: [] };
    },
  },
  {
    method: 'POST',
    path: '/makeups/skip',
    access: 'teacher',
    handler: (ctx) => {
      const b = input(ctx.body);
      const type = b.oneOf('type', '종류', ['absence', 'cancel'] as const);
      const id = b.reqInt('id', '항목');
      if (type === 'absence') ctx.db.run('UPDATE attendance SET makeup_skip = 1 WHERE id = ?', id);
      else ctx.db.run("UPDATE events SET no_makeup = 1 WHERE id = ? AND kind = 'cancel'", id);
      return { ok: true };
    },
  },
];

/** 오늘부터 며칠 동안의 학생 일정 (접근 권한은 호출하는 쪽에서 확인) */
export function upcomingFor(ctx: Ctx, studentId: number, days = 14) {
  return onlyStudent(buildSessions(ctx, { from: ctx.today, to: addDays(ctx.today, days), studentId }), studentId);
}
