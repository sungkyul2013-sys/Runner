import type { Ctx, Route } from './http';
import { bad, idParam, input, notFound } from './http';
import { pickColor } from './students';
import { isTime, minutesBetween } from '../../shared/date';
import type { Group, GroupSlot, StudentBrief } from '../../shared/types';

export function listGroups(ctx: Ctx, id?: number): Group[] {
  const groups = ctx.db.all<any>(`SELECT * FROM class_groups ${id ? 'WHERE id = ?' : ''} ORDER BY name`, ...(id ? [id] : []));
  const slots = ctx.db.all<any>('SELECT id, group_id, weekday, start_time, end_time FROM group_slots ORDER BY weekday, start_time');
  const members = ctx.db.all<any>(
    `SELECT m.group_id, s.id, s.name, s.school, s.grade, s.color
       FROM group_members m JOIN students s ON s.id = m.student_id
      WHERE s.status != 'left' ORDER BY s.name`,
  );
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    memo: g.memo,
    slots: slots
      .filter((s) => s.group_id === g.id)
      // 월요일부터 보이도록 정렬 (일요일은 맨 뒤)
      .sort((a, b) => (a.weekday || 7) - (b.weekday || 7) || a.start_time.localeCompare(b.start_time))
      .map((s): GroupSlot => ({ id: s.id, weekday: s.weekday, start: s.start_time, end: s.end_time })),
    members: members
      .filter((m) => m.group_id === g.id)
      .map((m): StudentBrief => ({ id: m.id, name: m.name, school: m.school, grade: m.grade, color: m.color })),
  }));
}

function readSlots(raw: unknown): GroupSlot[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw bad('수업 시간 형식이 올바르지 않습니다.');
  return raw.map((s: any) => {
    const weekday = Number(s?.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw bad('요일을 확인해 주세요.');
    if (!isTime(s?.start) || !isTime(s?.end)) throw bad('수업 시간을 확인해 주세요.');
    if (minutesBetween(s.start, s.end) <= 0) throw bad('끝나는 시간이 시작 시간보다 늦어야 합니다.');
    return { weekday, start: s.start, end: s.end };
  });
}

function writeSlotsAndMembers(ctx: Ctx, id: number, slots: GroupSlot[] | null, memberIds: number[] | null) {
  if (slots) {
    // 기존 시간표 id 는 출석 기록(session_key)에 쓰이므로, 같은 요일·시간이면 그대로 둔다
    const old = ctx.db.all<any>('SELECT id, weekday, start_time, end_time FROM group_slots WHERE group_id = ?', id);
    const keep = new Set<number>();
    for (const s of slots) {
      const same = old.find((o) => !keep.has(o.id) && o.weekday === s.weekday && o.start_time === s.start && o.end_time === s.end);
      if (same) keep.add(same.id);
      else ctx.db.run('INSERT INTO group_slots (group_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)', id, s.weekday, s.start, s.end);
    }
    for (const o of old) if (!keep.has(o.id)) ctx.db.run('DELETE FROM group_slots WHERE id = ?', o.id);
  }
  if (memberIds) {
    ctx.db.run('DELETE FROM group_members WHERE group_id = ?', id);
    for (const sid of memberIds) {
      if (!ctx.db.get('SELECT 1 FROM students WHERE id = ?', sid)) throw bad('없는 학생이 포함되어 있습니다.');
      ctx.db.run('INSERT INTO group_members (group_id, student_id) VALUES (?, ?)', id, sid);
    }
  }
}

export const groupRoutes: Route[] = [
  { method: 'GET', path: '/groups', access: 'teacher', handler: (ctx) => listGroups(ctx) },
  {
    method: 'POST',
    path: '/groups',
    access: 'teacher',
    handler: (ctx) => {
      const b = input(ctx.body);
      const name = b.str('name', '반 이름', { required: true, max: 30 });
      const slots = readSlots(b.src.slots);
      const id = ctx.db.tx(() => {
        const gid = ctx.db.run(
          'INSERT INTO class_groups (name, color, memo, created_at) VALUES (?, ?, ?, ?)',
          name,
          pickColor(ctx, 'class_groups', b.src.color),
          b.text('memo', '메모', 1000),
          ctx.now,
        ).lastId;
        writeSlotsAndMembers(ctx, gid, slots, b.ids('memberIds'));
        return gid;
      });
      return listGroups(ctx, id)[0];
    },
  },
  {
    method: 'PATCH',
    path: '/groups/:id',
    access: 'teacher',
    handler: (ctx) => {
      const id = idParam(ctx);
      if (!ctx.db.get('SELECT 1 FROM class_groups WHERE id = ?', id)) throw notFound();
      const b = input(ctx.body);
      ctx.db.tx(() => {
        if (b.has('name')) ctx.db.run('UPDATE class_groups SET name = ? WHERE id = ?', b.str('name', '반 이름', { required: true, max: 30 }), id);
        if (b.has('color')) ctx.db.run('UPDATE class_groups SET color = ? WHERE id = ?', b.color('color', '#2B3F5C'), id);
        if (b.has('memo')) ctx.db.run('UPDATE class_groups SET memo = ? WHERE id = ?', b.text('memo', '메모', 1000), id);
        writeSlotsAndMembers(ctx, id, b.has('slots') ? readSlots(b.src.slots) : null, b.has('memberIds') ? b.ids('memberIds') : null);
      });
      return listGroups(ctx, id)[0];
    },
  },
  {
    method: 'DELETE',
    path: '/groups/:id',
    access: 'teacher',
    handler: (ctx) => {
      const r = ctx.db.run('DELETE FROM class_groups WHERE id = ?', idParam(ctx));
      if (!r.changes) throw notFound();
      return { ok: true };
    },
  },
];
