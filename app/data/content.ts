/** Courses, the redline lab material, and the plan generator's inputs. */

/** 원장. One teacher takes a class from the first week to the last. */
export const TEACHER = {
  name: '윤원수',
  role: '원장',
  years: 20,
  line: '국어교육 전공 · 20년차',
  bio: '초등 독서논술부터 대입 논술까지 직접 맡습니다. 첨삭은 조교에게 넘기지 않고, 수업한 사람이 문장마다 이유를 답니다.',
  belief: '“잘 썼어요”는 첨삭이 아닙니다. 무엇을 왜 고쳐야 하는지 적어 주고, 학생이 같은 글을 다시 쓰는 데까지가 한 편입니다.',
} as const;

export interface Course {
  id: string;
  step: string;
  name: string;
  who: string;
  summary: string;
  hours: string;
  cap: number;
  points: string[];
  /** A week in this course, hour by hour. */
  week: { label: string; detail: string }[];
}

export const COURSES: Course[] = [
  {
    id: 'elem',
    step: 'STEP 01',
    name: '초등 독서논술',
    who: '초 3–6',
    summary: '한 권을 끝까지 읽고, 한 편을 끝까지 씁니다.',
    hours: '주 1회 · 90분',
    cap: 8,
    points: ['완독 도서 연 24권', '요약 · 감상 · 주장문', '어휘 노트 & 낭독', '월간 성장 리포트'],
    week: [
      { label: '0–20분', detail: '낭독과 어휘 확인 — 모르는 낱말을 먼저 건집니다.' },
      { label: '20–55분', detail: '토론 — 인물의 선택을 두고 찬반을 나눕니다.' },
      { label: '55–80분', detail: '쓰기 — 토론에서 나온 자기 말을 그대로 옮겨 적습니다.' },
      { label: '80–90분', detail: '낭독 발표와 다음 주 과제 배정.' },
    ],
  },
  {
    id: 'mid',
    step: 'STEP 02',
    name: '중등 국어 내신',
    who: '중 1–3',
    summary: '교과서 지문 분석부터 서술형·수행평가까지.',
    hours: '주 2회 · 100분',
    cap: 8,
    points: ['학교별 기출 분석', '서술형 답안 훈련', '수행평가 글쓰기 클리닉', '오답 노트 점검'],
    week: [
      { label: '0–25분', detail: '지난 서술형 오답 복기 — 왜 감점됐는지부터.' },
      { label: '25–65분', detail: '교과서 지문 정밀 분석과 문제화 연습.' },
      { label: '65–95분', detail: '서술형 답안 작성 후 즉석 첨삭.' },
      { label: '95–100분', detail: '다음 시험 범위 배분.' },
    ],
  },
  {
    id: 'high',
    step: 'STEP 03',
    name: '고등 국어 · 수능',
    who: '고 1–3',
    summary: '지문을 “푸는 법”이 아니라 “읽는 법”부터 다시 세웁니다.',
    hours: '주 2회 · 120분',
    cap: 10,
    points: ['평가원 기출 전 회차', '시간 관리 · 오답 리포트', '주간 모의 & 해설', '영역별 약점 추적'],
    week: [
      { label: '0–35분', detail: '주간 모의 — 실제 시간 배분으로 풉니다.' },
      { label: '35–85분', detail: '해설 — 정답이 아니라 읽는 순서를 고칩니다.' },
      { label: '85–115분', detail: '약점 영역 집중 훈련.' },
      { label: '115–120분', detail: '오답 리포트 확인.' },
    ],
  },
  {
    id: 'essay',
    step: 'STEP 04',
    name: '대입 논술 · 면접',
    who: '고3 · N수',
    summary: '기출을 해부하고, 실전 답안을 반복해서 다시 씁니다.',
    hours: '주 1회 · 150분 + 1:1',
    cap: 6,
    points: ['대학별 기출 & 예시답안', '주 2편 실전 첨삭', '모의 면접 & 촬영', '지원 대학별 전략'],
    week: [
      { label: '0–40분', detail: '대학별 기출 해부 — 출제 의도와 채점 기준.' },
      { label: '40–100분', detail: '실전 답안 작성 (제한 시간 동일).' },
      { label: '100–140분', detail: '상호 첨삭 후 담당 선생님 첨삭.' },
      { label: '140–150분', detail: '리라이팅 과제 배정, 1:1 일정 확정.' },
    ],
  },
];

export const courseById = (id: string): Course | undefined => COURSES.find((c) => c.id === id);

/* ─────────────────────────── 첨삭 랩 ──────────────────────────────── */

export interface LabTarget {
  /** Index into `LAB_PARAGRAPH` segments. */
  index: number;
  reason: string;
  note: string;
}

/** The student's paragraph, split so each phrase can be tapped. */
export const LAB_PARAGRAPH: string[] = [
  '나는 이 책이 정말 재미있었다고 생각한다.',
  '왜냐하면 주인공이 열심히 노력해서 결국 성공했기 때문이다.',
  '주인공은 실패를 여러 번 겪었다.',
  '그래서 나도 열심히 살아야겠다고 느꼈다.',
];

export const LAB_REASONS = [
  '감상어로 시작해 근거가 사라짐',
  '줄거리 요약에 그침',
  '교훈으로 닫아 자기 주장이 없음',
  '문제 없음',
];

export const LAB_TARGETS: LabTarget[] = [
  {
    index: 0,
    reason: LAB_REASONS[0],
    note: '“재미있었다”는 판단이 아니라 반응입니다. 첫 문장은 책이 던지는 질문에서 출발해야 합니다.',
  },
  {
    index: 1,
    reason: LAB_REASONS[1],
    note: '노력→성공은 줄거리입니다. 인물이 무엇을 선택했는지가 근거가 됩니다.',
  },
  {
    index: 3,
    reason: LAB_REASONS[2],
    note: '교훈으로 닫으면 글이 감상문에서 멈춥니다. 자기 주장으로 이어져야 논술이 됩니다.',
  },
];

export const LAB_REWRITE =
  '주인공은 실패할 것을 알면서도 같은 선택을 반복한다. 나는 이 반복을 성공담이 아니라 책임에 대한 이야기로 읽었다. 노력이 결과를 보장하지 않는데도 계속하는 이유 — 그것이 이 책이 끝까지 붙잡고 있는 질문이다.';

/* ─────────────────────────── 학습 플랜 ─────────────────────────────── */

export const GRADES = ['초 3–4', '초 5–6', '중 1–3', '고 1–2', '고3 · N수'] as const;
export const GOALS = ['읽기 습관', '내신 서술형', '수능 국어', '대입 논술'] as const;

export interface PlanWeek {
  week: number;
  read: string;
  write: string;
  redline: string;
}

/**
 * Builds a four-week cycle from the three inputs. Not a lookup table: the
 * reading load scales with sessions per week, and the writing task is
 * chosen by goal, so every combination produces a plan that reads as
 * deliberate rather than generic.
 */
export function buildPlan(goal: string, perWeek: number): PlanWeek[] {
  const booksPerWeek = perWeek >= 3 ? 1 : perWeek === 2 ? 0.5 : 0.5;

  const writeByGoal: Record<string, string[]> = {
    '읽기 습관': ['한 문단 요약', '인물 소개 글', '찬반 의견문', '완독 감상문'],
    '내신 서술형': ['핵심어 요약', '서술형 3문항', '수행평가 초안', '수행평가 완성본'],
    '수능 국어': ['지문 구조도', '오답 분석문', '주간 모의 리뷰', '취약 영역 정리'],
    '대입 논술': ['논제 분석', '개요 작성', '답안 1편', '답안 리라이팅'],
  };

  const readByGoal: Record<string, string> = {
    '읽기 습관': '문학 한 권 나눠 읽기',
    '내신 서술형': '교과서 단원 + 연계 지문',
    '수능 국어': '평가원 기출 지문 세트',
    '대입 논술': '대학별 제시문 묶음',
  };

  const writes = writeByGoal[goal] ?? writeByGoal['읽기 습관'];

  return [1, 2, 3, 4].map((week) => ({
    week,
    read: `${readByGoal[goal] ?? ''} · ${(booksPerWeek * perWeek).toFixed(1).replace('.0', '')}권 분량`,
    write: writes[week - 1],
    redline: week % 2 === 0 ? '1:1 첨삭 + 리라이팅' : '1:1 첨삭',
  }));
}

/** A rough weekly minute count, shown next to the plan. */
export function planMinutes(grade: string, perWeek: number): number {
  const base = grade.startsWith('초') ? 90 : grade.startsWith('중') ? 100 : 120;
  return base * perWeek;
}
