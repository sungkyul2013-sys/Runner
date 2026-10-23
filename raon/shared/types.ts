// 서버와 화면이 함께 쓰는 데이터 모양

export type Role = 'teacher' | 'student' | 'parent';
export type StudentStatus = 'active' | 'paused' | 'left';
export type EventKind = 'makeup' | 'extra' | 'cancel' | 'exam' | 'holiday' | 'consult' | 'etc';
export type SessionKind = 'class' | EventKind;
export type AttendanceStatus = 'present' | 'late' | 'absent';
export type Audience = 'student' | 'parent';
export type BookStatus = 'current' | 'planned' | 'done';

export const EVENT_LABEL: Record<SessionKind, string> = {
  class: '정규 수업',
  makeup: '보강',
  extra: '추가 수업',
  cancel: '휴강',
  exam: '시험',
  holiday: '휴원',
  consult: '상담',
  etc: '일정',
};

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: '출석',
  late: '지각',
  absent: '결석',
};

export const FEEDBACK_CATEGORIES = ['수업', '과제', '시험', '태도', '상담'] as const;
export const BOOK_CATEGORIES = ['문학', '비문학', '문법', '어휘', '독서', '작문', '기출', '내신', '기타'] as const;

export interface AcademyInfo {
  name: string;
  phone: string;
  address: string;
}

export interface StudentBrief {
  id: number;
  name: string;
  school: string;
  grade: string;
  color: string;
}

export interface Me {
  id: number;
  role: Role;
  name: string;
  loginId: string;
  isAdmin: boolean;
  students: StudentBrief[];
  academy: AcademyInfo;
}

export interface GroupRef {
  id: number;
  name: string;
  color: string;
}

export interface AccountInfo {
  userId: number;
  loginId: string;
  lastLoginAt: string | null;
}

export interface ParentInfo extends AccountInfo {
  name: string;
  phone: string;
  relation: string;
}

export interface StudentRow extends StudentBrief {
  phone: string;
  memo: string;
  status: StudentStatus;
  createdAt: string;
  groups: GroupRef[];
  currentBook: string | null;
  hasAccount: boolean;
  parentCount: number;
}

export interface StudentDetail extends StudentRow {
  account: AccountInfo | null;
  parents: ParentInfo[];
}

export interface GroupSlot {
  id?: number;
  weekday: number;
  start: string;
  end: string;
}

export interface Group {
  id: number;
  name: string;
  color: string;
  memo: string;
  slots: GroupSlot[];
  members: StudentBrief[];
}

export interface RosterEntry {
  id: number;
  name: string;
  status: AttendanceStatus | null;
  attendanceId: number | null;
  note: string;
  makeupEventId: number | null;
}

export interface CalSession {
  key: string;
  date: string;
  start: string | null;
  end: string | null;
  kind: SessionKind;
  title: string;
  groupId: number | null;
  groupName: string | null;
  color: string;
  memo: string;
  cancelled: boolean;
  cancelReason: string;
  cancelEventId: number | null;
  eventId: number | null;
  origin: { date: string; label: string } | null;
  allStudents: boolean;
  students: RosterEntry[];
}

export interface EventInput {
  kind: EventKind;
  title?: string;
  date: string;
  start?: string | null;
  end?: string | null;
  groupId?: number | null;
  studentIds?: number[];
  memo?: string;
  noMakeup?: boolean;
  originDate?: string | null;
  originLabel?: string | null;
  attendanceIds?: number[];
  cancelEventIds?: number[];
}

export interface MakeupNeed {
  type: 'absence' | 'cancel';
  id: number; // attendanceId 또는 cancel eventId
  date: string;
  label: string;
  groupId: number | null;
  students: StudentBrief[];
  note: string;
}

export interface MakeupOverview {
  pending: MakeupNeed[];
  upcoming: CalSession[];
  past: CalSession[];
}

export interface Feedback {
  id: number;
  studentId: number;
  studentName: string;
  audience: Audience;
  category: string;
  title: string;
  body: string;
  classDate: string | null;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
  readers?: { name: string; role: Role; readAt: string }[];
}

export interface Textbook {
  id: number;
  title: string;
  publisher: string;
  category: string;
  totalUnits: number;
  unitLabel: string;
  color: string;
  memo: string;
  inUse: number;
}

export interface BookLog {
  id: number;
  date: string;
  progress: number;
  note: string;
}

export interface StudentBook {
  id: number;
  studentId: number;
  studentName: string;
  textbook: Textbook;
  status: BookStatus;
  progress: number;
  note: string;
  startedOn: string | null;
  finishedOn: string | null;
  updatedAt: string;
  logs: BookLog[];
}

export interface AttendanceSummary {
  present: number;
  late: number;
  absent: number;
}

export interface TeacherDashboard {
  today: string;
  sessions: CalSession[];
  tomorrow: CalSession[];
  pendingMakeups: MakeupNeed[];
  upcomingMakeups: CalSession[];
  recentFeedback: Feedback[];
  newConsults: ConsultRequest[];
  counts: { students: number; groups: number; feedbackThisWeek: number };
}

export interface FamilyHome {
  student: StudentBrief;
  today: string;
  next: CalSession | null;
  week: CalSession[];
  books: StudentBook[];
  feedback: Feedback[];
  unread: number;
  makeups: CalSession[];
  attendance: AttendanceSummary;
}

export interface TeacherAccount {
  id: number;
  name: string;
  loginId: string;
  phone: string;
  isAdmin: boolean;
  lastLoginAt: string | null;
}

export const CONSULT_GRADES = ['초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3', '기타'] as const;

export interface ConsultInput {
  studentName: string;
  grade: string;
  phone: string;
  preferredTime?: string;
  message?: string;
  agree: boolean;
}

export interface ConsultRequest {
  id: number;
  studentName: string;
  grade: string;
  phone: string;
  preferredTime: string;
  message: string;
  status: 'new' | 'done';
  createdAt: string;
  handledAt: string | null;
}
