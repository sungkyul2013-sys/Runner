/** Static content for the 학원 소개 sections. */

export interface Pillar {
  icon: string;
  title: string;
  copy: string;
  detail: string[];
}

export interface CourseTrack {
  id: string;
  name: string;
  target: string;
  hue: number;
  tagline: string;
  weekly: string;
  modules: { label: string; desc: string }[];
  outcome: string;
}

export interface Teacher {
  name: string;
  role: string;
  initial: string;
  hue: number;
  focus: string;
  words: string;
}

export interface TimelineStep {
  step: string;
  title: string;
  copy: string;
}

export const BRAND = {
  name: '수 국어논술',
  tagline: '국어의 감각을 설계하다',
  lead:
    '읽는 힘, 따지는 힘, 쓰는 힘. 수 국어논술은 이 세 가지를 하나의 흐름으로 잇습니다. ' +
    '문제 풀이로 시작해 사고의 습관으로 끝나는 수업.',
  since: 2011,
  slogan: ['읽고', '따지고', '쓴다'],
};

export const HERO_STATS = [
  { value: 14, suffix: '년', label: '누적 운영' },
  { value: 3200, suffix: '명', label: '함께한 학생' },
  { value: 92, suffix: '%', label: '재등록률' },
  { value: 6, suffix: '단계', label: '수준별 트랙' },
];

export const PILLARS: Pillar[] = [
  {
    icon: '🧭',
    title: '진단이 먼저입니다',
    copy: '무엇을 모르는지 모르는 상태로는 아무리 풀어도 늘지 않습니다.',
    detail: [
      '6개 역량(사실·추론·비판·어휘·감상·논리)으로 나눈 진단 평가',
      '틀린 이유를 유형으로 분류해 원인을 특정',
      '진단 결과가 그대로 학습 루틴의 설계도가 됩니다',
    ],
  },
  {
    icon: '🔍',
    title: '지문을 구조로 봅니다',
    copy: '문장을 따라 읽는 독해에서, 글의 뼈대를 먼저 보는 독해로.',
    detail: [
      '문단별 기능 표시(도입·전개·전환·반론·정리) 훈련',
      '중심 문장과 뒷받침 문장을 분리하는 표시 독해',
      '정보량이 많은 과학·경제 지문의 처리 순서 고정',
    ],
  },
  {
    icon: '⚖️',
    title: '근거로 답을 고릅니다',
    copy: '“느낌상 3번”을 없애는 것이 우리 수업의 첫 목표입니다.',
    detail: [
      '선택지마다 지문의 근거 위치를 표시하는 습관',
      '오답의 유형(과장·축소·범위 오류·인과 역전) 학습',
      '정답률보다 근거 일치율을 먼저 확인',
    ],
  },
  {
    icon: '✍️',
    title: '쓰면서 완성됩니다',
    copy: '읽은 것을 자기 문장으로 다시 세울 때 비로소 자기 것이 됩니다.',
    detail: [
      '개요 → 초고 → 첨삭 → 재고의 4단 사이클',
      '주장·근거·예상 반론·재반박의 논증 골격 훈련',
      '문장 다듬기: 호응, 중복, 모호한 지시어 점검',
    ],
  },
];

export const TRACKS: CourseTrack[] = [
  {
    id: 'seed',
    name: '씨앗 트랙',
    target: '초 4–6',
    hue: 155,
    tagline: '읽는 재미부터, 문해력의 기초 체력',
    weekly: '주 2회 · 회당 80분',
    modules: [
      { label: '이야기 읽기', desc: '인물의 마음과 사건의 흐름을 따라가며 요약하기' },
      { label: '어휘 씨앗', desc: '하루 10개, 문맥 속에서 익히는 낱말' },
      { label: '생각 글쓰기', desc: '한 편의 짧은 글을 스스로 완성하는 경험' },
    ],
    outcome: '400자 분량의 글을 개요부터 스스로 세워 완성합니다.',
  },
  {
    id: 'root',
    name: '뿌리 트랙',
    target: '중 1–2',
    hue: 200,
    tagline: '문법의 뼈대와 설명문 독해',
    weekly: '주 2회 · 회당 90분',
    modules: [
      { label: '국어 문법 기본', desc: '음운·형태소·품사·문장 성분을 한 번에 정리' },
      { label: '설명문 구조 독해', desc: '정의·예시·비교·인과 구조 파악' },
      { label: '요약과 개요', desc: '문단 요약에서 글 전체 개요로' },
    ],
    outcome: '문법 개념어를 정확히 쓰고, 800자 설명문을 구조적으로 씁니다.',
  },
  {
    id: 'stem',
    name: '줄기 트랙',
    target: '중 3 – 고 1',
    hue: 218,
    tagline: '문학 감상과 비문학 정보 처리',
    weekly: '주 2회 · 회당 100분',
    modules: [
      { label: '문학 갈래별 독법', desc: '시·소설·수필·극의 감상 포인트' },
      { label: '비문학 5영역', desc: '인문·사회·과학·기술·예술 지문 대응' },
      { label: '논증 글쓰기', desc: '주장–근거–반론의 3단 구성' },
    ],
    outcome: '낯선 지문에서도 20분 안에 구조를 잡고 근거로 답을 고릅니다.',
  },
  {
    id: 'branch',
    name: '가지 트랙',
    target: '고 2–3',
    hue: 268,
    tagline: '수능 국어 실전 운영 전략',
    weekly: '주 3회 · 회당 110분',
    modules: [
      { label: '시간 운영 설계', desc: '화작·언매/문학/독서의 개인별 배분표' },
      { label: '고난도 추론', desc: '보기 결합, 관점 비교, 사례 적용' },
      { label: '오답 원인 분석', desc: '주간 오답노트 리뷰와 재출제' },
    ],
    outcome: '실전 80분 운영이 안정되고, 틀린 문제의 원인을 스스로 설명합니다.',
  },
  {
    id: 'fruit',
    name: '열매 트랙',
    target: '논술 대비',
    hue: 330,
    tagline: '대학별 논술의 문제 해결형 글쓰기',
    weekly: '주 1회 · 회당 150분',
    modules: [
      { label: '제시문 관계 분석', desc: '요약·비교·적용·비판의 유형별 접근' },
      { label: '답안 설계', desc: '분량 배분과 문단 설계, 채점 기준 역산' },
      { label: '실전 첨삭', desc: '매주 실채점 기준 기반 1:1 첨삭' },
    ],
    outcome: '제한 시간 안에 채점 기준을 충족하는 답안을 안정적으로 씁니다.',
  },
  {
    id: 'atelier',
    name: '아틀리에',
    target: '전 학년 선택',
    hue: 32,
    tagline: '토론과 창작, 국어를 즐기는 시간',
    weekly: '월 2회 · 회당 120분',
    modules: [
      { label: '독서 토론', desc: '입론–반론–최종 발언의 형식 토론' },
      { label: '창작 워크숍', desc: '시·엽편소설·에세이 합평' },
      { label: '문집 발간', desc: '학기말 학생 문집 제작' },
    ],
    outcome: '자기 목소리로 말하고 쓰는 즐거움을 경험합니다.',
  },
];

export const TEACHERS: Teacher[] = [
  {
    name: '김수현',
    role: '원장 · 논술 총괄',
    initial: '수',
    hue: 268,
    focus: '대학별 논술 · 답안 설계',
    words: '좋은 답안은 화려한 문장이 아니라, 물음에 정확히 답하는 문장에서 시작합니다.',
  },
  {
    name: '이지안',
    role: '비문학 · 독서',
    initial: '지',
    hue: 168,
    focus: '과학·기술 지문 · 정보 처리',
    words: '어려운 지문은 없습니다. 읽는 순서가 정해지지 않은 지문이 있을 뿐입니다.',
  },
  {
    name: '박도현',
    role: '문학',
    initial: '도',
    hue: 336,
    focus: '현대시 · 고전시가 감상',
    words: '시는 외우는 것이 아니라, 화자의 자리에 서 보는 일입니다.',
  },
  {
    name: '정하람',
    role: '문법 · 언어와 매체',
    initial: '하',
    hue: 205,
    focus: '음운·통사 · 개념 체계화',
    words: '문법은 규칙의 목록이 아니라, 말이 작동하는 원리의 지도입니다.',
  },
];

export const PROCESS: TimelineStep[] = [
  { step: '01', title: '진단', copy: '6역량 진단 평가와 상담으로 현재 좌표를 확인합니다.' },
  { step: '02', title: '설계', copy: '약점과 가용 시간을 반영한 주간 루틴을 함께 만듭니다.' },
  { step: '03', title: '수업', copy: '개념 → 적용 → 실전의 순서로 매주 한 단계씩 올라갑니다.' },
  { step: '04', title: '점검', copy: '주간 오답 리뷰와 월간 성취도 리포트로 방향을 조정합니다.' },
  { step: '05', title: '확장', copy: '읽은 것을 쓰기로 옮겨, 배운 것을 자기 언어로 남깁니다.' },
];

export const FAQ = [
  {
    q: '국어는 원래 잘하거나 못하거나, 타고나는 과목 아닌가요?',
    a:
      '독해는 습관의 결과입니다. 글의 구조를 표시하며 읽는 훈련, 선택지의 근거를 지문에서 찾는 훈련은 ' +
      '모두 반복으로 만들어집니다. 진단으로 어떤 습관이 빠져 있는지 먼저 확인합니다.',
  },
  {
    q: '문제를 많이 풀면 성적이 오르나요?',
    a:
      '양보다 복기입니다. 같은 유형에서 반복해 틀리는 원인을 찾지 않으면 문제 수는 의미가 없습니다. ' +
      '수 국어논술은 푼 문제의 30%를 다시 보는 시간에 씁니다.',
  },
  {
    q: '논술은 언제부터 준비해야 하나요?',
    a:
      '고3에 시작해도 늦지 않지만, 중등 때부터 요약과 개요 훈련을 해온 학생은 출발선이 다릅니다. ' +
      '학년과 무관하게 “읽은 것을 정리해 쓰는” 습관을 권합니다.',
  },
  {
    q: '수업을 따라가기 어려우면 어떻게 하나요?',
    a: '트랙은 학년이 아니라 진단 결과로 배정합니다. 필요하면 학기 중에도 트랙을 조정합니다.',
  },
  {
    q: '이 앱만으로도 공부가 되나요?',
    a:
      '진단 → 문제 풀이 → 오답노트 → 루틴까지 혼자 학습에 필요한 흐름이 모두 들어 있습니다. ' +
      '앱은 매일의 훈련을, 수업은 방향의 교정을 맡습니다.',
  },
];

export const CONTACT = {
  address: '서울특별시 성북구 국어로 24, 3층',
  hours: '평일 14:00 – 22:00 · 토 10:00 – 18:00',
  phone: '02-000-0000',
  email: 'hello@soo-korean.example',
  note: '상담은 사전 예약제로 운영합니다.',
};

export const TESTIMONIALS = [
  {
    who: '고3 학부모',
    text: '아이가 “왜 이 답인지” 설명하기 시작한 게 가장 큰 변화였습니다.',
  },
  { who: '중2 학생', text: '문단마다 표시하면서 읽으니까 긴 지문이 안 무서워졌어요.' },
  { who: '고1 학생', text: '오답노트를 다시 푸는 시간이 제일 도움이 됐습니다.' },
  { who: '초6 학부모', text: '글쓰기를 싫어하던 아이가 문집에 실린 자기 글을 자랑합니다.' },
];
