/** 논술 훈련실 — 논제와 자기 평가 루브릭. */

export interface WritingPrompt {
  id: string;
  type: '요약' | '비교' | '적용' | '비판' | '자유';
  title: string;
  question: string;
  /** Optional short source texts the learner must work from. */
  sources?: { label: string; text: string }[];
  minChars: number;
  maxChars: number;
  minutes: number;
  checklist: string[];
}

export const RUBRIC = [
  { id: 'answer', label: '논제 충족', desc: '물음에 정면으로 답했는가' },
  { id: 'structure', label: '구성', desc: '서론–본론–결론의 흐름과 분량 배분' },
  { id: 'evidence', label: '근거', desc: '주장을 뒷받침하는 근거의 구체성' },
  { id: 'logic', label: '논리', desc: '비약·순환·모순이 없는가' },
  { id: 'style', label: '표현', desc: '호응·간결성·정확한 어휘' },
];

export const WRITING_PROMPTS: WritingPrompt[] = [
  {
    id: 'w-sum-1',
    type: '요약',
    title: '핵심을 400자로',
    question:
      '‘공유지의 비극과 제도의 설계’를 읽고, 글의 논지를 400자 내외로 요약하시오. 문제 상황 · 두 가지 전통적 처방 · 제3의 길이 모두 드러나야 한다.',
    minChars: 350,
    maxChars: 500,
    minutes: 20,
    checklist: [
      '원문에 없는 자신의 의견을 넣지 않았는가',
      '중심 문장을 골라 상위 개념으로 묶었는가',
      '지시어를 그대로 옮겨 뜻이 흐려지지 않았는가',
      '분량 오차가 ±10% 이내인가',
    ],
  },
  {
    id: 'w-cmp-1',
    type: '비교',
    title: '두 관점 견주기',
    question:
      '‘기억과 서사적 정체성’에 나타난 심리적 연속성론과 서사적 정체성론을 비교하고, 각 입장의 강점과 한계를 600자 내외로 서술하시오.',
    minChars: 500,
    maxChars: 750,
    minutes: 30,
    checklist: [
      '두 입장의 기준(무엇으로 동일성을 판단하는가)을 명시했는가',
      '비교의 축을 세우고 그 축을 끝까지 유지했는가',
      '강점과 한계를 각각 근거와 함께 제시했는가',
      '한쪽으로 치우친 요약이 되지 않았는가',
    ],
  },
  {
    id: 'w-app-1',
    type: '적용',
    title: '원리를 사례에 적용하기',
    question:
      '아래 사례를 ‘공유지의 비극’의 원리로 분석하고, 오스트롬의 조건을 참고해 해결 방안을 700자 내외로 제안하시오.',
    sources: [
      {
        label: '사례',
        text:
          '한 대학의 공용 스터디룸은 예약제로 운영되지만, 예약만 하고 나타나지 않는 학생이 많아 실제 이용률이 절반에 못 미친다. ' +
          '예약을 취소해도 얻는 것이 없고, 나타나지 않아도 잃는 것이 없다.',
      },
    ],
    minChars: 600,
    maxChars: 850,
    minutes: 35,
    checklist: [
      '이익의 집중과 비용의 분산 구조로 사례를 설명했는가',
      '제안한 방안에 감시·제재 비용을 누가 부담하는지 밝혔는가',
      '오스트롬의 조건 중 최소 두 가지를 근거로 삼았는가',
      '실행 가능성에 대한 검토가 있는가',
    ],
  },
  {
    id: 'w-cri-1',
    type: '비판',
    title: '주장에 반론 세우기',
    question:
      '“인공지능이 쓴 글도 저작권으로 보호해야 한다”는 주장에 대해 자신의 입장을 정하고, 예상 반론과 재반박을 포함하여 800자 내외로 논술하시오.',
    minChars: 700,
    maxChars: 950,
    minutes: 40,
    checklist: [
      '주장을 한 문장으로 명확히 제시했는가',
      '저작권 제도의 목적(창작 유인)을 근거로 삼았는가',
      '가장 강한 반론을 골랐는가, 약한 반론을 세워 무너뜨리지 않았는가',
      '재반박이 반론을 실제로 겨냥하는가',
    ],
  },
  {
    id: 'w-free-1',
    type: '자유',
    title: '한 편의 생각 글',
    question: '‘내가 다시 읽고 싶은 문장’을 하나 고르고, 그 문장이 나에게 남긴 것을 600자 내외로 쓰시오.',
    minChars: 500,
    maxChars: 800,
    minutes: 25,
    checklist: [
      '고른 문장을 정확히 인용했는가',
      '개인적 경험과 문장의 연결이 구체적인가',
      '감상에 머무르지 않고 생각으로 나아갔는가',
      '마지막 문단이 글 전체를 닫아 주는가',
    ],
  },
];
