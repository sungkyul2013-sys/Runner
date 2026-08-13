/**
 * 진단 문항 — the diagnostic set.
 *
 * Four domains, three answer mechanics. Every item carries an explanation,
 * because a diagnosis the student can't learn from is just a score.
 */

export type Domain = '어휘' | '독해' | '교정' | '구성';

interface Base {
  id: string;
  domain: Domain;
  prompt: string;
  explain: string;
}

/** Multiple choice — 어휘 and 독해. */
export interface ChoiceQ extends Base {
  type: 'choice';
  passage?: string;
  options: string[];
  answer: number;
}

/** Tap the faulty part of a sentence — 교정. */
export interface TapQ extends Base {
  type: 'tap';
  /** The sentence, already split. One segment is wrong. */
  segments: string[];
  answer: number;
  /** What the segment should have been. */
  fix: string;
}

/** Drag the outline into order — 구성. */
export interface OrderQ extends Base {
  type: 'order';
  /** Presented shuffled; this is the correct sequence. */
  steps: string[];
}

export type Question = ChoiceQ | TapQ | OrderQ;

export const QUESTIONS: Question[] = [
  /* ── 어휘 ─────────────────────────────────────────────────────────── */
  {
    id: 'v1',
    domain: '어휘',
    type: 'choice',
    prompt: '밑줄 친 말의 뜻으로 알맞은 것은?\n\n“그의 주장은 근거와 결론 사이에 논리적 비약이 크다.”',
    options: [
      '주장이 빠르게 발전함',
      '거쳐야 할 논리 단계를 건너뜀',
      '근거를 지나치게 많이 덧붙임',
      '결론을 뒤로 미룸',
    ],
    answer: 1,
    explain:
      '비약(飛躍)은 거쳐야 할 중간 단계를 건너뛰는 것입니다. 근거에서 결론으로 가는 사이에 있어야 할 설명이 빠지면 “왜 그렇게 되는가”에 답하지 못합니다.',
  },
  {
    id: 'v2',
    domain: '어휘',
    type: 'choice',
    prompt: '빈칸에 들어갈 말이 바르게 짝지어진 것은?\n\n“우리는 성적 지상주의를 (  ㄱ  )하고, 스스로 질문하는 공부를 (  ㄴ  )해야 한다.”',
    options: ['ㄱ 지향 / ㄴ 지양', 'ㄱ 지양 / ㄴ 지향', 'ㄱ 지향 / ㄴ 지향', 'ㄱ 지양 / ㄴ 지양'],
    answer: 1,
    explain:
      '지양(止揚)은 하지 않으려는 것, 지향(志向)은 나아가려는 방향입니다. 버릴 것에는 지양, 목표에는 지향을 씁니다.',
  },
  {
    id: 'v3',
    domain: '어휘',
    type: 'choice',
    prompt: '‘반증’이 바르게 쓰인 문장은?',
    options: [
      '그가 침묵한 것은 동의했다는 반증이다.',
      '이 자료는 그의 주장을 무너뜨리는 반증이 된다.',
      '많은 사람이 모인 것이 인기의 반증이다.',
      '표정이 밝은 것은 결과가 좋았다는 반증이다.',
    ],
    answer: 1,
    explain:
      '반증(反證)은 주장을 뒤집는 증거입니다. “~라는 사실을 곁들여 보여 주는 증거”는 방증(傍證)이므로, 1·3·4번은 방증을 써야 합니다.',
  },

  /* ── 독해 ─────────────────────────────────────────────────────────── */
  {
    id: 'r1',
    domain: '독해',
    type: 'choice',
    passage:
      '기술은 오랫동안 인간의 노동을 대신해 왔다. 그러나 대체의 방향은 늘 같지 않았다. 초기의 기계는 힘든 일을 덜어 주었지만, 최근의 기술은 판단하는 일까지 넘겨받는다. 힘을 대신하는 기술 앞에서 인간은 여유를 얻었으나, 판단을 대신하는 기술 앞에서 인간은 판단하는 법을 잊을 위험에 놓인다.',
    prompt: '윗글의 중심 내용으로 가장 적절한 것은?',
    options: [
      '기술의 발전 속도가 점점 빨라지고 있다.',
      '기계는 인간의 노동을 완전히 대체할 수 있다.',
      '기술이 대신하는 대상이 힘에서 판단으로 옮겨 가면서 새로운 위험이 생긴다.',
      '인간은 기술을 사용하는 방법을 더 배워야 한다.',
    ],
    answer: 2,
    explain:
      '글은 “대체의 방향은 늘 같지 않았다”를 축으로 힘 → 판단의 이동을 말하고, 마지막 문장에서 그 이동이 낳는 위험을 제시합니다. 속도(1)나 학습(4)은 언급되지 않았습니다.',
  },
  {
    id: 'r2',
    domain: '독해',
    type: 'choice',
    passage:
      '어떤 도시는 광장을 없애고 그 자리에 도로를 놓았다. 통행 시간은 줄었다. 그러나 사람들이 우연히 마주치는 횟수도 함께 줄었다. 도시는 더 빨라졌지만, 더 조용해졌다.',
    prompt: '윗글에서 글쓴이가 “조용해졌다”로 나타내려 한 것은?',
    options: [
      '소음이 실제로 줄어들었다는 사실',
      '도로 때문에 주민이 이사를 갔다는 사실',
      '사람들 사이의 마주침과 대화가 줄었다는 것',
      '도시가 밤에 어두워졌다는 것',
    ],
    answer: 2,
    explain:
      '앞 문장이 “우연히 마주치는 횟수도 함께 줄었다”이므로, 마지막의 ‘조용함’은 물리적 소음이 아니라 관계의 감소를 가리키는 비유입니다.',
  },
  {
    id: 'r3',
    domain: '독해',
    type: 'choice',
    passage:
      '독서 기록을 남기라는 조언은 흔하다. 하지만 무엇을 읽었는지 적는 기록은 오래가지 않는다. 오래 남는 기록은 무엇을 읽고 무엇을 바꾸었는지 적은 기록이다.',
    prompt: '글쓴이가 권하는 독서 기록은?',
    options: [
      '읽은 책의 목록을 빠짐없이 적는 기록',
      '읽은 뒤 자신의 생각이 어떻게 달라졌는지 적는 기록',
      '줄거리를 요약해 두는 기록',
      '인상 깊은 문장을 옮겨 적는 기록',
    ],
    answer: 1,
    explain:
      '“무엇을 읽고 무엇을 바꾸었는지”가 핵심입니다. 목록·요약·발췌는 모두 “무엇을 읽었는지”에 머무릅니다.',
  },

  /* ── 교정 ─────────────────────────────────────────────────────────── */
  {
    id: 'c1',
    domain: '교정',
    type: 'tap',
    prompt: '문장에서 고쳐야 할 부분을 하나 고르세요.',
    segments: ['내가 하고 싶은 말은', '우리가', '더 노력해야', '한다.'],
    answer: 3,
    fix: '한다는 것이다.',
    explain:
      '주어 “말은”과 서술어 “한다”가 호응하지 않습니다. “~하고 싶은 말은 … 한다는 것이다”처럼 받아야 합니다.',
  },
  {
    id: 'c2',
    domain: '교정',
    type: 'tap',
    prompt: '문장에서 고쳐야 할 부분을 하나 고르세요.',
    segments: ['결코', '이것은', '좋은', '결과이다.'],
    answer: 3,
    fix: '좋은 결과가 아니다.',
    explain: '‘결코’는 부정 표현과 호응하는 부사입니다. 긍정으로 끝나면 문장이 어긋납니다.',
  },
  {
    id: 'c3',
    domain: '교정',
    type: 'tap',
    prompt: '문장에서 고쳐야 할 부분을 하나 고르세요.',
    segments: ['이 문제는', '반드시', '해결되어져야', '한다.'],
    answer: 2,
    fix: '해결되어야',
    explain:
      '‘해결되-’에 이미 피동의 뜻이 있는데 ‘-어지다’를 겹쳐 쓴 이중 피동입니다. “해결되어야 한다”로 충분합니다.',
  },
  {
    id: 'c4',
    domain: '교정',
    type: 'tap',
    prompt: '문장에서 고쳐야 할 부분을 하나 고르세요.',
    segments: ['우리 학교는', '학생 수가', '매년 증가하는 추세로 늘고', '있다.'],
    answer: 2,
    fix: '매년 늘고',
    explain: '‘증가하는 추세’와 ‘늘고’가 같은 뜻을 두 번 말합니다. 한 번만 쓰면 문장이 또렷해집니다.',
  },

  /* ── 구성 ─────────────────────────────────────────────────────────── */
  {
    id: 'o1',
    domain: '구성',
    type: 'order',
    prompt: '논술 답안의 개요를 순서대로 배열하세요.',
    steps: [
      '문제 제기 — 무엇을 다툴 것인가',
      '주장 — 나는 어느 쪽인가',
      '근거 — 왜 그렇게 보는가',
      '반론 수용 — 반대편의 타당한 지점',
      '재반박 — 그럼에도 내 주장이 서는 이유',
    ],
    explain:
      '반론을 먼저 인정하고 다시 반박하는 자리가 답안의 점수를 가릅니다. 반론 수용이 근거보다 앞서면 자기 주장이 약해 보입니다.',
  },
  {
    id: 'o2',
    domain: '구성',
    type: 'order',
    prompt: '한 문단이 자연스럽도록 문장을 배열하세요.',
    steps: [
      '도시는 빨라질수록 조용해진다.',
      '광장을 없애고 도로를 놓은 도시가 그렇다.',
      '통행 시간은 줄었지만 마주침도 함께 줄었다.',
      '속도를 얻는 대신 관계를 내준 셈이다.',
    ],
    explain:
      '주장(총론) → 사례 → 사례의 결과 → 해석의 순서입니다. 해석이 사례보다 앞서면 독자가 근거 없이 결론을 먼저 읽게 됩니다.',
  },
];

export const DOMAINS: Domain[] = ['어휘', '독해', '교정', '구성'];

export const DOMAIN_NOTE: Record<Domain, string> = {
  어휘: '뜻이 비슷해 보이는 말을 구분하는 힘',
  독해: '글이 실제로 말한 것과 말하지 않은 것을 가르는 힘',
  교정: '문장을 문법과 호응에 맞게 고치는 힘',
  구성: '주장을 순서대로 세우는 힘',
};

/** Which course a weak domain points to. */
export const DOMAIN_COURSE: Record<Domain, string> = {
  어휘: 'elem',
  독해: 'high',
  교정: 'mid',
  구성: 'essay',
};
