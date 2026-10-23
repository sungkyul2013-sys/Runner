// 처음 둘러볼 때 쓰는 예시 데이터. 날짜는 '오늘'을 기준으로 앞뒤에 배치한다.
import type { Db } from './db';
import type { Crypto } from './http';
import { setSetting } from './auth';
import { addDays, eachDay, weekday } from '../../shared/date';

const PW = 'raon1234';

export function seedDemo(db: Db, crypto: Crypto, today: string) {
  const now = new Date().toISOString();
  const hash = crypto.hashPassword(PW);
  const d = (n: number) => addDays(today, n);

  db.tx(() => {
    setSetting(db, 'academy_name', '라온국어');
    setSetting(db, 'academy_phone', '02-6952-0418');
    setSetting(db, 'academy_address', '서울 마포구 성미산로 17, 3층');

    const user = (role: string, name: string, loginId: string, extra: { phone?: string; admin?: boolean; studentId?: number } = {}) =>
      db.run(
        'INSERT INTO users (role, name, login_id, password_hash, phone, is_admin, student_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        role,
        name,
        loginId,
        hash,
        extra.phone ?? '',
        extra.admin ? 1 : 0,
        extra.studentId ?? null,
        now,
      ).lastId;

    const director = user('teacher', '정다은', 'director', { admin: true, phone: '010-4821-0093' });
    const teacher2 = user('teacher', '한서준', 'seojun', { phone: '010-7730-2164' });

    // ── 반과 시간표 ──
    const group = (name: string, color: string, room: string, slots: [number, string, string][], memo = '') => {
      const id = db.run('INSERT INTO class_groups (name, color, room, memo, created_at) VALUES (?, ?, ?, ?, ?)', name, color, room, memo, now).lastId;
      for (const [w, s, e] of slots) db.run('INSERT INTO group_slots (group_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)', id, w, s, e);
      return id;
    };
    const g = {
      m2: group('중2 문학반', '#56684A', '1강의실', [[1, '17:00', '18:30'], [3, '17:00', '18:30']]),
      m3: group('중3 내신반', '#2F6466', '2강의실', [[2, '17:30', '19:30'], [4, '17:30', '19:30']], '2학기 기말 대비. 교과서 출판사별 프린트 별도.'),
      h1: group('고1 국어 기본', '#A87B2C', '1강의실', [[1, '19:00', '21:00'], [3, '19:00', '21:00'], [5, '19:00', '21:00']]),
      h2: group('고2 문학·독서', '#2B3F5C', '2강의실', [[2, '19:40', '22:00'], [4, '19:40', '22:00']], '수능특강 병행. 매주 목요일 주간 테스트.'),
      h3: group('고3 수능 파이널', '#6E4A5E', '세미나실', [[6, '10:00', '13:00'], [3, '21:10', '22:40']]),
      one: group('1:1 논술 클리닉', '#9A5B2E', '상담실', [[5, '17:00', '18:30']]),
    };

    // ── 학생 ──
    const student = (name: string, school: string, grade: string, color: string, groups: number[], phone = '', memo = '') => {
      const id = db.run(
        'INSERT INTO students (name, school, grade, phone, memo, color, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        name,
        school,
        grade,
        phone,
        memo,
        color,
        'active',
        now,
      ).lastId;
      for (const gid of groups) db.run('INSERT INTO group_members (group_id, student_id) VALUES (?, ?)', gid, id);
      return id;
    };
    const s = {
      haneul: student('김하늘', '성미중', '중2', '#56684A', [g.m2], '010-2234-1180'),
      seoyun: student('박서윤', '성미중', '중2', '#A35D5D', [g.m2]),
      doyun: student('이도윤', '망원중', '중2', '#59606B', [g.m2]),
      jiwoo: student('최지우', '성미중', '중3', '#2F6466', [g.m3], '', '서술형에서 감점 잦음. 문장 끝맺음 연습.'),
      minseo: student('정민서', '망원중', '중3', '#6F6A35', [g.m3]),
      yejun: student('강예준', '성미중', '중3', '#B23A26', [g.m3]),
      seoa: student('윤서아', '상암중', '중3', '#6E4A5E', [g.m3, g.one]),
      hajun: student('오하준', '홍익사대부고', '고1', '#A87B2C', [g.h1]),
      jian: student('서지안', '성서고', '고1', '#2B3F5C', [g.h1]),
      sua: student('임수아', '홍익사대부고', '고1', '#9A5B2E', [g.h1]),
      taeyun: student('김태윤', '성서고', '고2', '#2B3F5C', [g.h2], '010-5512-7781', '문학 감상 탄탄. <보기> 문항 시간 관리가 과제.'),
      chaewon: student('이채원', '상암고', '고2', '#B23A26', [g.h2]),
      yujin: student('신유진', '성서고', '고2', '#56684A', [g.h2]),
      dohyun: student('장도현', '홍익사대부고', '고3', '#59606B', [g.h3]),
      gaeun: student('문가은', '상암고', '고3', '#6E4A5E', [g.h3]),
    };

    // ── 계정 ──
    user('student', '김태윤', 'taeyun', { studentId: s.taeyun });
    user('student', '김하늘', 'haneul', { studentId: s.haneul });
    user('student', '이채원', 'chaewon', { studentId: s.chaewon });
    user('student', '최지우', 'jiwoo', { studentId: s.jiwoo });
    const mom = user('parent', '박미영', 'taeyun.mom', { phone: '010-9917-2045' });
    db.run('INSERT INTO family_links (user_id, student_id, relation) VALUES (?, ?, ?)', mom, s.taeyun, '어머니');
    db.run('INSERT INTO family_links (user_id, student_id, relation) VALUES (?, ?, ?)', mom, s.haneul, '어머니');
    const cwDad = user('parent', '이정훈', 'chaewon.dad', { phone: '010-3381-6620' });
    db.run('INSERT INTO family_links (user_id, student_id, relation) VALUES (?, ?, ?)', cwDad, s.chaewon, '아버지');
    const jwMom = user('parent', '김수정', 'jiwoo.mom', { phone: '010-4402-9183' });
    db.run('INSERT INTO family_links (user_id, student_id, relation) VALUES (?, ?, ?)', jwMom, s.jiwoo, '어머니');

    // ── 일정 ──
    const event = (
      kind: string,
      date: string,
      opt: { title?: string; start?: string; end?: string; group?: number; students?: number[]; memo?: string; room?: string; originDate?: string; originLabel?: string; noMakeup?: boolean } = {},
    ) => {
      const id = db.run(
        `INSERT INTO events (kind, title, date, start_time, end_time, group_id, room, memo, no_makeup, origin_date, origin_label, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        kind,
        opt.title ?? '',
        date,
        opt.start ?? null,
        opt.end ?? null,
        opt.group ?? null,
        opt.room ?? '',
        opt.memo ?? '',
        opt.noMakeup ? 1 : 0,
        opt.originDate ?? null,
        opt.originLabel ?? null,
        director,
        now,
      ).lastId;
      for (const sid of opt.students ?? []) db.run('INSERT INTO event_students (event_id, student_id) VALUES (?, ?)', id, sid);
      return id;
    };

    const nextWd = (from: string, wd: number) => {
      let x = from;
      while (weekday(x) !== wd) x = addDays(x, 1);
      return x;
    };
    const prevWd = (from: string, wd: number) => {
      let x = from;
      while (weekday(x) !== wd) x = addDays(x, -1);
      return x;
    };

    // 지난주 화요일 중3 내신반 휴강 → 이번 주말 보강
    const m3Cancel = prevWd(d(-5), 2);
    const cancelId = event('cancel', m3Cancel, { group: g.m3, title: '선생님 연수', memo: '교육청 연수로 휴강' });
    const m3Makeup = event('makeup', nextWd(d(1), 6), {
      group: g.m3,
      start: '14:00',
      end: '16:00',
      room: '2강의실',
      originDate: m3Cancel,
      originLabel: '중3 내신반',
    });
    db.run('UPDATE events SET resolved_by = ? WHERE id = ?', m3Makeup, cancelId);

    event('holiday', nextWd(d(14), 6), { title: '학원 정기 휴원', memo: '정규 수업 없음' });
    event('exam', nextWd(d(18), 3), { title: '11월 전국연합학력평가', group: g.h2, memo: '고1·고2 학평. 전날 수업은 실전 모의로 진행.' });
    event('exam', nextWd(d(18), 3), { title: '11월 전국연합학력평가', group: g.h1 });
    event('etc', nextWd(d(24), 4), { title: '대학수학능력시험', group: g.h3, memo: '수험표·신분증 꼭 챙기기' });
    event('extra', nextWd(d(1), 6), { title: '고3 파이널 특강 · 화법과 작문', group: g.h3, start: '14:00', end: '17:00', room: '세미나실' });
    event('consult', nextWd(d(3), 4), { title: '태윤 학부모 상담', students: [s.taeyun], start: '18:30', end: '19:10', room: '상담실', memo: '11월 학평 대비 계획 공유' });
    event('exam', nextWd(d(2), 4), { title: '주간 테스트 · 현대소설', group: g.h2, start: '19:40', end: '20:20' });

    // ── 지난 3주 출결 ──
    let seed = 7;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const slots = db.all<any>('SELECT s.id, s.group_id, s.weekday FROM group_slots s');
    const members = db.all<any>('SELECT group_id, student_id FROM group_members');
    const absences: { id: number; student: number; date: string; group: number; key: string }[] = [];
    for (const date of eachDay(d(-21), d(-1))) {
      if (date === m3Cancel) continue;
      for (const sl of slots.filter((x) => x.weekday === weekday(date))) {
        if (sl.group_id === g.m3 && date === m3Cancel) continue;
        const key = `g${sl.group_id}s${sl.id}`;
        for (const m of members.filter((x) => x.group_id === sl.group_id)) {
          const r = rand();
          const status = r < 0.05 ? 'absent' : r < 0.12 ? 'late' : 'present';
          const id = db.run(
            'INSERT INTO attendance (student_id, date, session_key, status, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            m.student_id,
            date,
            key,
            status,
            status === 'late' ? '10분 지각' : '',
            now,
          ).lastId;
          if (status === 'absent') absences.push({ id, student: m.student_id, date, group: sl.group_id, key });
        }
      }
    }
    // 태윤이 결석 한 번 + 보강 잡힘, 하늘이 결석 한 번 (보강 대기)
    const h2Slot = slots.find((x) => x.group_id === g.h2 && x.weekday === 2)!;
    const tyAbsentDate = prevWd(d(-8), 2);
    db.run('DELETE FROM attendance WHERE student_id = ? AND date = ?', s.taeyun, tyAbsentDate);
    const tyAbs = db.run(
      "INSERT INTO attendance (student_id, date, session_key, status, note, updated_at) VALUES (?, ?, ?, 'absent', '학교 수행평가 일정', ?)",
      s.taeyun,
      tyAbsentDate,
      `g${g.h2}s${h2Slot.id}`,
      now,
    ).lastId;
    const tyMakeup = event('makeup', nextWd(d(1), 0), {
      students: [s.taeyun],
      start: '15:00',
      end: '17:00',
      room: '상담실',
      originDate: tyAbsentDate,
      originLabel: '고2 문학·독서',
      memo: '현대소설 「삼대」 부분 진도 + 주간 테스트 재응시',
    });
    db.run('UPDATE attendance SET makeup_event_id = ? WHERE id = ?', tyMakeup, tyAbs);

    const m2Slot = slots.find((x) => x.group_id === g.m2 && x.weekday === 3)!;
    const hnDate = prevWd(d(-2), 3);
    db.run('DELETE FROM attendance WHERE student_id = ? AND date = ?', s.haneul, hnDate);
    db.run(
      "INSERT INTO attendance (student_id, date, session_key, status, note, updated_at) VALUES (?, ?, ?, 'absent', '감기', ?)",
      s.haneul,
      hnDate,
      `g${g.m2}s${m2Slot.id}`,
      now,
    );
    // 오래된 결석 일부는 보강 처리 완료
    for (const a of absences.slice(0, Math.max(0, absences.length - 3))) {
      const ev = event('makeup', addDays(a.date, 3), {
        students: [a.student],
        start: '16:00',
        end: '17:30',
        room: '상담실',
        originDate: a.date,
        originLabel: db.get<any>('SELECT name FROM class_groups WHERE id = ?', a.group)!.name,
      });
      db.run('UPDATE attendance SET makeup_event_id = ? WHERE id = ?', ev, a.id);
      if (addDays(a.date, 3) < today) {
        db.run("INSERT INTO attendance (student_id, date, session_key, status, updated_at) VALUES (?, ?, ?, 'present', ?)", a.student, addDays(a.date, 3), `e${ev}`, now);
      }
    }

    // ── 교재 ──
    const book = (title: string, publisher: string, category: string, total: number, unit: string, color: string, memo = '') =>
      db.run(
        'INSERT INTO textbooks (title, publisher, category, total_units, unit_label, color, memo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        title,
        publisher,
        category,
        total,
        unit,
        color,
        memo,
        now,
      ).lastId;
    const b = {
      litSp: book('수능특강 문학', 'EBS', '문학', 30, '강', '#2B3F5C', '2027 수능 연계'),
      readSp: book('수능특강 독서', 'EBS', '독서', 28, '강', '#2F6466'),
      m3b: book('매3비', '키출판사', '비문학', 36, '일', '#B23A26', '매일 3지문'),
      m3m: book('매3문', '키출판사', '문학', 36, '일', '#A87B2C'),
      gram: book('떠먹는 국어문법', '쏠티북스', '문법', 22, '강', '#56684A'),
      ppajak: book('빠작 중학 국어 비문학 독해 2', '동아출판', '비문학', 24, '회', '#6F6A35'),
      naesin: book('라온 2학기 기말 대비 프린트', '라온국어 자체 교재', '내신', 12, '회', '#6E4A5E', '학교별 교과서 반영'),
      past: book('마더텅 수능기출 국어 문학', '마더텅', '기출', 40, '회', '#59606B'),
      essay: book('생각을 여는 논술 노트', '라온국어 자체 교재', '작문', 16, '주', '#9A5B2E'),
    };
    const assign = (sid: number, tid: number, status: string, progress: number, note: string, started: number, logs: [number, number, string][] = []) => {
      const id = db.run(
        'INSERT INTO student_books (student_id, textbook_id, status, progress, note, started_on, finished_on, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        sid,
        tid,
        status,
        progress,
        note,
        d(started),
        status === 'done' ? d(-12) : null,
        now,
      ).lastId;
      for (const [day, p, n] of logs) db.run('INSERT INTO book_logs (student_book_id, date, progress, note, created_at) VALUES (?, ?, ?, ?, ?)', id, d(day), p, n, now);
    };
    const h2 = [s.taeyun, s.chaewon, s.yujin];
    assign(s.taeyun, b.litSp, 'current', 15, '15강 현대시 ③ — 「사평역에서」, 「추천사」', -60, [
      [-1, 15, '15강 현대시 ③ — 「사평역에서」, 「추천사」'],
      [-3, 14, '14강 현대시 ② — 김수영 「풀」'],
      [-8, 13, '13강 현대시 ①'],
      [-10, 12, '12강 고전시가 종합'],
    ]);
    assign(s.taeyun, b.m3b, 'current', 21, '21일차까지 — 과학·기술 지문', -40, [
      [-2, 21, '21일차 과학·기술'],
      [-6, 18, '18일차 사회·문화'],
    ]);
    assign(s.taeyun, b.gram, 'done', 22, '전 범위 완료', -120);
    assign(s.taeyun, b.readSp, 'planned', 0, '학평 후 시작', -1);
    for (const sid of h2.slice(1)) {
      assign(sid, b.litSp, 'current', sid === s.chaewon ? 15 : 13, sid === s.chaewon ? '15강 현대시 ③' : '13강 현대시 ① (보충 필요)', -60, [[-1, sid === s.chaewon ? 15 : 13, '수업 진도']]);
    }
    assign(s.chaewon, b.m3b, 'current', 24, '24일차', -40, [[-3, 24, '24일차']]);
    for (const sid of [s.haneul, s.seoyun, s.doyun]) assign(sid, b.ppajak, 'current', sid === s.haneul ? 11 : 12, '12회 — 설명문 구조 파악', -50, [[-2, sid === s.haneul ? 11 : 12, '설명문 구조 파악']]);
    assign(s.haneul, b.gram, 'current', 6, '6강 품사의 분류', -20, [[-4, 6, '6강 품사의 분류'], [-9, 4, '4강 음운의 변동']]);
    for (const sid of [s.jiwoo, s.minseo, s.yejun, s.seoa]) assign(sid, b.naesin, 'current', 5, '5회 — 소설 「동백꽃」 서술형', -14, [[-2, 5, '5회 「동백꽃」 서술형'], [-7, 3, '3회 비문학 요약']]);
    for (const sid of [s.hajun, s.jian, s.sua]) assign(sid, b.m3m, 'current', sid === s.jian ? 19 : 17, '현대소설 파트', -45, [[-1, sid === s.jian ? 19 : 17, '현대소설 파트']]);
    for (const sid of [s.dohyun, s.gaeun]) {
      assign(sid, b.past, 'current', sid === s.dohyun ? 34 : 31, '실전 회차 — 시간 재고 풀기', -70, [[-1, sid === s.dohyun ? 34 : 31, '실전 회차']]);
      assign(sid, b.litSp, 'done', 30, '전 범위 완료', -150);
    }
    assign(s.seoa, b.essay, 'current', 6, '6주차 — 주장과 근거 세우기', -42, [[-7, 6, '6주차 주장과 근거']]);

    // ── 피드백 ──
    const fb = (sid: number, aud: 'student' | 'parent', day: number, category: string, title: string, body: string, author = director, readBy?: number) => {
      const at = new Date(Date.parse(now) + day * 86400000).toISOString();
      const id = db.run(
        'INSERT INTO feedback (student_id, audience, category, title, body, class_date, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        sid,
        aud,
        category,
        title,
        body,
        d(day),
        author,
        at,
        at,
      ).lastId;
      if (readBy) db.run('INSERT INTO feedback_reads (feedback_id, user_id, read_at) VALUES (?, ?, ?)', id, readBy, at);
    };
    const tyUser = db.get<any>("SELECT id FROM users WHERE login_id = 'taeyun'")!.id;

    fb(s.taeyun, 'student', -1, '수업', '현대시 세 번째 시간', `태윤아, 오늘 「사평역에서」를 읽으면서 화자가 대합실 사람들을 바라보는 시선을 '거리를 둔 연민'이라고 정리한 거, 선생님도 메모해 둘 만큼 정확했어.

다만 <보기> 문제에서 아직도 보기 내용을 먼저 외우고 지문을 끼워 맞추는 습관이 남아 있어. 지문 → 보기 순서로, 근거 문장에 밑줄부터 긋자.

숙제: 수능특강 15강 3번·5번 다시 풀기, 틀린 이유 한 줄씩 적어 오기.`);
    fb(s.taeyun, 'parent', -1, '수업', '10월 셋째 주 수업 안내', `안녕하세요, 태윤이 국어 담당 정다은입니다.

이번 주 태윤이는 현대시 단원을 마무리했습니다. 작품을 읽고 정서와 태도를 짚어 내는 힘은 반에서 가장 안정적인 편이고, 발표도 적극적으로 합니다.

보완할 점은 <보기> 문항 풀이 시간입니다. 실전에서는 한 문항에 3분 이상 쓰는 경우가 있어, 다음 2주 동안은 시간을 재며 푸는 연습을 함께 하겠습니다.

가정에서는 매3비를 하루 20분, 주 4회 정도만 꾸준히 이어 갈 수 있도록 격려 부탁드립니다. 다음 주 목요일 상담 때 11월 학평 대비 계획을 자세히 말씀드리겠습니다.`);
    fb(s.taeyun, 'student', -6, '시험', '주간 테스트 결과', `이번 주간 테스트 18문항 중 15개. 지난주보다 두 개 올랐어.

틀린 세 문제 모두 '서술상의 특징'을 묻는 문제였어. 시점·서술자·장면 전환, 이 세 가지를 먼저 확인하는 순서를 다시 연습해 보자.`, director, tyUser);
    fb(s.taeyun, 'parent', -6, '시험', '주간 테스트 결과 공유', `이번 주 주간 테스트에서 18문항 중 15문항을 맞혀 지난주보다 점수가 올랐습니다. 소설의 서술상 특징을 묻는 유형에서 실수가 반복되어 수업 시간에 따로 정리해 주었습니다.`);
    fb(s.taeyun, 'student', -13, '과제', '매3비 과제 확인', `매3비 15~18일차 꼼꼼히 해 왔더라. 특히 지문마다 핵심어에 동그라미 친 거 아주 좋아.

다음 주부터는 지문 하나에 4분 안쪽으로 끊어 보자.`, director, tyUser);

    fb(s.haneul, 'student', -3, '수업', '품사 공부 잘 따라오고 있어', `하늘아, 오늘 품사 분류에서 '형용사와 동사 구별하기'를 친구들 앞에서 설명해 준 거 정말 고마웠어. 설명하면서 더 확실히 알게 됐지?

감기 다 나으면 지난 수요일 빠진 부분은 보강 때 같이 채우자.`);
    fb(s.haneul, 'parent', -3, '수업', '하늘이 수업 안내', `안녕하세요, 하늘이 담당 정다은입니다.

이번 주 수요일 수업에 감기로 결석하여 보강 일정을 곧 따로 안내드리겠습니다. 문법 단원은 품사 분류를 마쳤고, 수업 태도와 과제 수행 모두 좋습니다.

비문학 독해는 설명문 구조를 그림으로 정리하는 연습을 하고 있으니, 집에서 교재를 보실 때 함께 칭찬해 주시면 큰 힘이 됩니다.`);

    fb(s.chaewon, 'student', -1, '수업', '현대시 정리', `채원아, 오늘 「추천사」에서 '그네'의 상징을 두 가지로 나눠 설명한 거 좋았어. 다음 시간엔 근거를 시어에서 한 번 더 찾아보는 연습!`, teacher2);
    fb(s.chaewon, 'parent', -2, '태도', '채원이 학습 태도', `채원이는 요즘 질문이 부쩍 늘었습니다. 모르는 부분을 그냥 넘기지 않는 태도가 성적으로 이어지고 있어 지켜보는 저도 기쁩니다.`, teacher2);

    fb(s.jiwoo, 'student', -2, '과제', '서술형 답안 쓰는 법', `지우야, 「동백꽃」 서술형 답안 다시 봤어. 내용은 다 맞는데 문장을 '~것 같다'로 끝내서 감점될 수 있어. '~이다'로 단정해서 쓰는 연습만 하면 바로 만점이야.`);
    fb(s.jiwoo, 'parent', -2, '시험', '기말 대비 진행 상황', `기말고사 대비 프린트 5회까지 진행했습니다. 지우는 내용 이해는 충분하나 서술형 문장 마무리에서 감점 요인이 있어, 남은 기간 동안 매 수업 서술형 1문항씩 첨삭하겠습니다.`);

    fb(s.dohyun, 'student', -1, '시험', '실전 34회차', `도현아, 34회차 문학 전부 맞았다. 이제 독서 첫 지문에서 시간 쓰는 것만 줄이면 돼. 수능까지 남은 기간, 리듬 그대로 가자.`);
    fb(s.seoa, 'student', -7, '수업', '논술 6주차', `서아야, 이번 주 글은 주장은 분명한데 근거가 하나뿐이었어. 반대 의견을 먼저 인정하고 반박하는 문단을 하나 더 넣어 보자.`);
  });
}

export const DEMO_PASSWORD = PW;
