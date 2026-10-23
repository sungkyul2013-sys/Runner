import type { Db } from './db';

const V1 = `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  school TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#2B3F5C',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','left')),
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('teacher','student','parent')),
  name TEXT NOT NULL,
  login_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  is_admin INTEGER NOT NULL DEFAULT 0,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE family_links (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, student_id)
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE class_groups (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE group_slots (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL
);

CREATE TABLE group_members (
  group_id INTEGER NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, student_id)
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('makeup','extra','cancel','exam','holiday','consult','etc')),
  title TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  group_id INTEGER REFERENCES class_groups(id) ON DELETE CASCADE,
  memo TEXT NOT NULL DEFAULT '',
  no_makeup INTEGER NOT NULL DEFAULT 0,
  origin_date TEXT,
  origin_label TEXT,
  resolved_by INTEGER REFERENCES events(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX events_date ON events(date);

CREATE TABLE event_students (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, student_id)
);

CREATE TABLE attendance (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  session_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','late','absent')),
  note TEXT NOT NULL DEFAULT '',
  makeup_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  makeup_skip INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE (student_id, date, session_key)
);
CREATE INDEX attendance_date ON attendance(date);

CREATE TABLE feedback (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  audience TEXT NOT NULL CHECK (audience IN ('student','parent')),
  category TEXT NOT NULL DEFAULT '수업',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  class_date TEXT,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX feedback_student ON feedback(student_id, audience);

CREATE TABLE feedback_reads (
  feedback_id INTEGER NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL,
  PRIMARY KEY (feedback_id, user_id)
);

CREATE TABLE textbooks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '기타',
  total_units INTEGER NOT NULL DEFAULT 0,
  unit_label TEXT NOT NULL DEFAULT '강',
  color TEXT NOT NULL DEFAULT '#2B3F5C',
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE student_books (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  textbook_id INTEGER NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('current','planned','done')),
  progress INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  started_on TEXT,
  finished_on TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (student_id, textbook_id)
);

CREATE TABLE book_logs (
  id INTEGER PRIMARY KEY,
  student_book_id INTEGER NOT NULL REFERENCES student_books(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  progress INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
`;

// 상담 신청: 로그인하지 않은 방문자가 남긴다
const V2 = `
CREATE TABLE consult_requests (
  id INTEGER PRIMARY KEY,
  student_name TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  preferred_time TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','done')),
  created_at TEXT NOT NULL,
  handled_at TEXT
);
CREATE INDEX consult_requests_status ON consult_requests(status, created_at);
`;

const MIGRATIONS = [V1, V2];

export function migrate(db: Db) {
  db.exec('PRAGMA foreign_keys = ON');
  const row = db.get<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.tx(() => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
