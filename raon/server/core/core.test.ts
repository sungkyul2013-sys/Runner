import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDb } from '../node/sqlite';
import { nodeCrypto } from '../node/crypto';
import { migrate } from './schema';
import { dispatch } from './routes';
import { HttpError } from './http';
import { userFromToken } from './auth';
import { seedDemo } from './seed';
import { addDays, weekday } from '../../shared/date';
import type { CalSession, Feedback, FamilyHome, MakeupOverview, Me, StudentBook } from '../../shared/types';

const TODAY = '2026-10-23';

function setup(seed = true) {
  const db = openNodeDb(':memory:');
  migrate(db);
  if (seed) seedDemo(db, nodeCrypto, TODAY);
  let token: string | undefined;
  const call = <T = any>(method: string, path: string, body: unknown = {}): T => {
    const url = new URL(path, 'http://x');
    const now = `${TODAY}T09:00:00.000Z`;
    return dispatch(method, url.pathname, {
      db,
      crypto: nodeCrypto,
      user: userFromToken(db, nodeCrypto, token, now),
      query: url.searchParams,
      body,
      today: TODAY,
      now,
      ip: 'test',
      token,
      setSessionToken: (t) => (token = t ?? undefined),
    }) as T;
  };
  const login = (id: string) => call<Me>('POST', '/auth/login', { loginId: id, password: 'raon1234' });
  const fails = (fn: () => unknown, status: number) =>
    assert.throws(fn, (e: unknown) => e instanceof HttpError && e.status === status);
  return { db, call, login, fails, logout: () => (token = undefined) };
}

test('첫 설정: 원장 계정을 만들고 바로 로그인된다', () => {
  const { call } = setup(false);
  assert.equal(call('GET', '/setup').needsSetup, true);
  const me = call<Me>('POST', '/setup', { academyName: '라온국어', name: '정다은', loginId: 'boss', password: 'secret12' });
  assert.equal(me.role, 'teacher');
  assert.equal(me.isAdmin, true);
  assert.equal(call<Me>('GET', '/auth/me').name, '정다은');
  assert.equal(call('GET', '/setup').needsSetup, false);
});

test('로그인 실패와 권한', () => {
  const { call, login, fails, logout } = setup();
  fails(() => call('POST', '/auth/login', { loginId: 'director', password: 'wrong' }), 401);
  fails(() => call('GET', '/students'), 401);
  login('taeyun');
  fails(() => call('GET', '/students'), 403);
  logout();
  login('director');
  assert.ok(call<any[]>('GET', '/students').length >= 10);
});

test('정규 수업은 요일마다 펼쳐지고 휴강은 취소로 표시된다', () => {
  const { call, login } = setup();
  login('director');
  const from = addDays(TODAY, -14);
  const sessions = call<CalSession[]>('GET', `/calendar?from=${from}&to=${TODAY}`);
  const m3 = sessions.filter((s) => s.title === '중3 내신반' && s.kind === 'class');
  assert.ok(m3.every((s) => [2, 4].includes(weekday(s.date))));
  assert.equal(m3.filter((s) => s.cancelled).length, 1);
});

test('학생은 자기 일정만, 다른 학생 이름 없이 본다', () => {
  const { call, login, fails } = setup();
  const me = login('taeyun');
  const sid = me.students[0].id;
  const sessions = call<CalSession[]>('GET', `/calendar?from=${TODAY}&to=${addDays(TODAY, 14)}&studentId=${sid}`);
  assert.ok(sessions.length > 0);
  for (const s of sessions) assert.ok(s.students.every((p) => p.id === sid));
  assert.ok(sessions.some((s) => s.kind === 'makeup'));
  const other = sid === 1 ? 2 : 1;
  fails(() => call('GET', `/calendar?from=${TODAY}&to=${TODAY}&studentId=${other}`), 403);
  fails(() => call('GET', `/feedback?studentId=${other}`), 403);
});

test('피드백은 학생용과 학부모용이 따로 보인다', () => {
  const { call, login, logout } = setup();
  const st = login('taeyun');
  const sid = st.students[0].id;
  const forStudent = call<Feedback[]>('GET', `/feedback?studentId=${sid}`);
  assert.ok(forStudent.length > 0 && forStudent.every((f) => f.audience === 'student'));
  logout();
  const pa = login('taeyun.mom');
  assert.equal(pa.students.length, 2);
  const forParent = call<Feedback[]>('GET', `/feedback?studentId=${sid}`);
  assert.ok(forParent.length > 0 && forParent.every((f) => f.audience === 'parent'));
  const home = call<FamilyHome>('GET', `/home?studentId=${sid}`);
  assert.equal(home.unread, forParent.length);
  call('POST', `/feedback/${forParent[0].id}/read`);
  assert.equal(call<FamilyHome>('GET', `/home?studentId=${sid}`).unread, forParent.length - 1);
});

test('선생님이 학생·학부모 피드백을 한 번에 따로 쓴다', () => {
  const { call, login } = setup();
  login('director');
  const sid = call<any[]>('GET', '/students').find((s) => s.name === '이도윤').id;
  const r = call('POST', '/feedback', { studentId: sid, toStudent: '도윤아 잘했어', toParent: '도윤이가 잘하고 있습니다', classDate: TODAY });
  assert.equal(r.ids.length, 2);
  const list = call<Feedback[]>('GET', `/feedback?studentId=${sid}`);
  assert.deepEqual(list.map((f) => f.audience).sort(), ['parent', 'student']);
});

test('결석 → 보강 대기 → 보강 등록 → 대기에서 빠짐 → 보강 삭제 시 다시 대기', () => {
  const { call, login } = setup();
  login('director');
  const before = call<MakeupOverview>('GET', '/makeups');
  const need = before.pending.find((p) => p.type === 'absence')!;
  assert.ok(need);
  const ev = call('POST', '/events', {
    kind: 'makeup',
    date: addDays(TODAY, 2),
    start: '15:00',
    end: '16:30',
    studentIds: need.students.map((s) => s.id),
    originDate: need.date,
    originLabel: need.label,
    attendanceIds: [need.id],
  });
  const after = call<MakeupOverview>('GET', '/makeups');
  assert.ok(!after.pending.some((p) => p.type === 'absence' && p.id === need.id));
  assert.ok(after.upcoming.some((s) => s.eventId === ev.id));
  call('DELETE', `/events/${ev.id}`);
  assert.ok(call<MakeupOverview>('GET', '/makeups').pending.some((p) => p.id === need.id));
});

test('출결 기록과 결석 처리', () => {
  const { call, login } = setup();
  login('director');
  // 오늘(금) 고1 수업
  const today = call<CalSession[]>('GET', `/calendar?from=${TODAY}&to=${TODAY}`).find((s) => s.title === '고1 국어 기본')!;
  const st = today.students[0];
  const updated = call<CalSession>('PUT', '/attendance', { date: TODAY, sessionKey: today.key, studentId: st.id, status: 'absent' });
  assert.equal(updated.students.find((p) => p.id === st.id)!.status, 'absent');
  assert.ok(call<MakeupOverview>('GET', '/makeups').pending.some((p) => p.date === TODAY && p.students[0].id === st.id));
  const bulk = call<CalSession>('POST', '/attendance/bulk', { date: TODAY, sessionKey: today.key });
  assert.ok(bulk.students.every((p) => p.status));
  assert.equal(bulk.students.find((p) => p.id === st.id)!.status, 'absent');
});

test('교재 배정과 진도 기록', () => {
  const { call, login, logout } = setup();
  login('director');
  const book = call('POST', '/textbooks', { title: '테스트 교재', totalUnits: 10, unitLabel: '강', category: '문학' });
  const groups = call<any[]>('GET', '/groups');
  const h2 = groups.find((g) => g.name.startsWith('고2'));
  const res = call('POST', '/student-books', { textbookId: book.id, groupId: h2.id });
  assert.equal(res.added, h2.members.length);
  const sb = call<StudentBook[]>('GET', `/student-books?textbookId=${book.id}`)[0];
  const upd = call<StudentBook>('PATCH', `/student-books/${sb.id}`, { progress: 4, note: '4강 김소월' });
  assert.equal(upd.progress, 4);
  assert.equal(upd.logs[0].note, '4강 김소월');
  const done = call<StudentBook>('PATCH', `/student-books/${sb.id}`, { status: 'done' });
  assert.equal(done.progress, 10);
  assert.equal(done.finishedOn, TODAY);
  logout();
  const me = login('taeyun');
  const mine = call<StudentBook[]>('GET', `/student-books?studentId=${me.students[0].id}`);
  assert.ok(mine.some((b) => b.status === 'current'));
});

test('반 시간표를 바꿔도 같은 시간의 출결 기록은 유지된다', () => {
  const { call, login, db } = setup();
  login('director');
  const g = call<any[]>('GET', '/groups').find((x) => x.name.startsWith('고2'));
  const before = db.get<any>('SELECT COUNT(*) c FROM attendance WHERE session_key LIKE ?', `g${g.id}s%`).c;
  call('PATCH', `/groups/${g.id}`, { slots: [...g.slots, { weekday: 6, start: '13:00', end: '15:00' }] });
  const kept = db.all<any>('SELECT id FROM group_slots WHERE group_id = ?', g.id).map((r: any) => r.id);
  for (const s of g.slots) assert.ok(kept.includes(s.id));
  assert.equal(db.get<any>('SELECT COUNT(*) c FROM attendance WHERE session_key LIKE ?', `g${g.id}s%`).c, before);
});

test('학부모 계정 추가와 형제 연결', () => {
  const { call, login, fails } = setup();
  login('director');
  const students = call<any[]>('GET', '/students');
  const a = students.find((s) => s.name === '박서윤');
  const b = students.find((s) => s.name === '정민서');
  call('POST', `/students/${a.id}/parents`, { name: '박부모', loginId: 'park.p', password: 'pass1234', relation: '어머니' });
  fails(() => call('POST', `/students/${b.id}/parents`, { name: '중복', loginId: 'park.p', password: 'pass1234' }), 400);
  const detail = call('POST', `/students/${b.id}/parents`, { existingLoginId: 'park.p', relation: '어머니' });
  assert.equal(detail.parents.length, 1);
  call('DELETE', `/students/${a.id}`);
  // 다른 자녀가 남아 있으므로 학부모 계정은 유지
  assert.equal(call('GET', `/students/${b.id}`).parents.length, 1);
});
