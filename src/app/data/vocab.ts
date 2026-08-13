import type { VocabEntry } from '../core/types';

/** Flashcard deck driving the 어휘 트레이너 (Leitner SRS). */
export const VOCAB: VocabEntry[] = [
  /* ------------------------------ 한자성어 ------------------------------ */
  { id: 'v-001', word: '괄목상대', hanja: '刮目相對', kind: '한자성어', level: 2, meaning: '눈을 비비고 다시 볼 만큼 실력이 부쩍 늚.', example: '한 학기 만에 괄목상대할 만큼 성적이 올랐다.' },
  { id: 'v-002', word: '연목구어', hanja: '緣木求魚', kind: '한자성어', level: 3, meaning: '나무에서 물고기를 구하듯, 방법이 어긋나 이룰 수 없음.', example: '준비 없이 좋은 결과를 바라는 것은 연목구어다.' },
  { id: 'v-003', word: '침소봉대', hanja: '針小棒大', kind: '한자성어', level: 2, meaning: '작은 일을 크게 부풀려 말함.', example: '침소봉대된 소문에 휘둘리지 말자.' },
  { id: 'v-004', word: '견강부회', hanja: '牽强附會', kind: '한자성어', level: 3, meaning: '이치에 맞지 않는 말을 억지로 끌어다 붙임.', example: '자기 결론에 맞추려는 견강부회였다.' },
  { id: 'v-005', word: '오리무중', hanja: '五里霧中', kind: '한자성어', level: 2, meaning: '짙은 안개 속처럼 일의 갈피를 잡을 수 없음.', example: '사건의 실마리는 여전히 오리무중이다.' },
  { id: 'v-006', word: '설상가상', hanja: '雪上加霜', kind: '한자성어', level: 1, meaning: '눈 위에 서리가 내리듯 어려운 일이 잇따름.', example: '길이 막힌 데다 설상가상으로 비까지 왔다.' },
  { id: 'v-007', word: '고식지계', hanja: '姑息之計', kind: '한자성어', level: 3, meaning: '당장 편한 것만 택하는 임시방편.', example: '근본 대책 없는 고식지계에 그쳤다.' },
  { id: 'v-008', word: '역지사지', hanja: '易地思之', kind: '한자성어', level: 1, meaning: '처지를 바꾸어 생각함.', example: '역지사지의 태도로 상대의 말을 들었다.' },
  { id: 'v-009', word: '온고지신', hanja: '溫故知新', kind: '한자성어', level: 2, meaning: '옛것을 익혀 새것을 앎.', example: '고전 읽기는 온고지신의 길이다.' },
  { id: 'v-010', word: '와신상담', hanja: '臥薪嘗膽', kind: '한자성어', level: 3, meaning: '원수를 갚거나 뜻을 이루려 괴로움을 참고 견딤.', example: '와신상담 끝에 목표를 이루었다.' },
  { id: 'v-011', word: '수수방관', hanja: '袖手傍觀', kind: '한자성어', level: 2, meaning: '팔짱만 끼고 지켜보기만 함.', example: '문제를 수수방관해서는 안 된다.' },
  { id: 'v-012', word: '전전긍긍', hanja: '戰戰兢兢', kind: '한자성어', level: 2, meaning: '몹시 두려워 벌벌 떨며 조심함.', example: '결과 발표를 앞두고 전전긍긍했다.' },
  { id: 'v-013', word: '동병상련', hanja: '同病相憐', kind: '한자성어', level: 2, meaning: '같은 처지의 사람끼리 서로 가엾게 여김.', example: '동병상련의 마음으로 서로를 도왔다.' },
  { id: 'v-014', word: '조삼모사', hanja: '朝三暮四', kind: '한자성어', level: 2, meaning: '눈앞의 차이만 보고 속거나 속임.', example: '조삼모사에 지나지 않는 제안이었다.' },
  { id: 'v-015', word: '유비무환', hanja: '有備無患', kind: '한자성어', level: 1, meaning: '미리 준비해 두면 근심이 없음.', example: '유비무환이라 했으니 미리 점검하자.' },

  /* ------------------------------- 한자어 ------------------------------- */
  { id: 'v-101', word: '수렴', hanja: '收斂', kind: '한자어', level: 2, meaning: '의견이나 사상 등을 한데 모아 정리함.', example: '토론을 통해 의견을 수렴했다.' },
  { id: 'v-102', word: '천착', hanja: '穿鑿', kind: '한자어', level: 3, meaning: '어떤 원인이나 내용을 깊이 파고들어 연구함.', example: '한 주제를 오래 천착한 학자다.' },
  { id: 'v-103', word: '방증', hanja: '傍證', kind: '한자어', level: 3, meaning: '간접적으로 증명에 도움을 주는 증거.', example: '그 기록은 당시 상황을 보여 주는 방증이다.' },
  { id: 'v-104', word: '반증', hanja: '反證', kind: '한자어', level: 3, meaning: '어떤 주장이 틀렸음을 보이는 증거.', example: '반증 사례가 하나만 나와도 가설은 무너진다.' },
  { id: 'v-105', word: '지양', hanja: '止揚', kind: '한자어', level: 2, meaning: '더 높은 단계로 나아가기 위해 하지 않음.', example: '감정적 대응은 지양해야 한다.' },
  { id: 'v-106', word: '지향', hanja: '志向', kind: '한자어', level: 2, meaning: '어떤 목표로 뜻이 쏠려 나아감.', example: '공동체가 지향하는 가치를 정리했다.' },
  { id: 'v-107', word: '함의', hanja: '含意', kind: '한자어', level: 3, meaning: '말이나 글 속에 담긴 뜻.', example: '이 정책의 함의를 따져 볼 필요가 있다.' },
  { id: 'v-108', word: '규명', hanja: '糾明', kind: '한자어', level: 2, meaning: '어떤 사실을 자세히 따져 밝힘.', example: '사고 원인을 규명하는 조사가 시작됐다.' },
  { id: 'v-109', word: '와해', hanja: '瓦解', kind: '한자어', level: 3, meaning: '조직이나 계획이 무너져 흩어짐.', example: '내부 갈등으로 조직이 와해되었다.' },
  { id: 'v-110', word: '표방', hanja: '標榜', kind: '한자어', level: 3, meaning: '어떤 명목을 앞에 내세움.', example: '친환경을 표방한 제품이 늘었다.' },
  { id: 'v-111', word: '괴리', hanja: '乖離', kind: '한자어', level: 3, meaning: '서로 어그러져 동떨어짐.', example: '이상과 현실 사이의 괴리가 컸다.' },
  { id: 'v-112', word: '상충', hanja: '相衝', kind: '한자어', level: 2, meaning: '서로 맞지 않고 부딪침.', example: '두 조항의 내용이 상충한다.' },
  { id: 'v-113', word: '전제', hanja: '前提', kind: '한자어', level: 2, meaning: '어떤 결론을 이끌기 위해 먼저 내세우는 조건.', example: '이 주장은 자유 의지를 전제로 한다.' },
  { id: 'v-114', word: '귀납', hanja: '歸納', kind: '한자어', level: 3, meaning: '개별 사례에서 일반 원리를 이끌어 내는 추론.', example: '관찰을 모아 귀납적으로 결론을 냈다.' },
  { id: 'v-115', word: '연역', hanja: '演繹', kind: '한자어', level: 3, meaning: '일반 원리에서 개별 사실을 이끌어 내는 추론.', example: '공리에서 연역해 정리를 증명한다.' },
  { id: 'v-116', word: '보편', hanja: '普遍', kind: '한자어', level: 2, meaning: '두루 널리 미침.', example: '보편적 가치로 인정받는 원칙이다.' },
  { id: 'v-117', word: '자의적', hanja: '恣意的', kind: '한자어', level: 3, meaning: '일정한 기준 없이 제멋대로인.', example: '기준의 자의적 적용을 경계해야 한다.' },
  { id: 'v-118', word: '역설', hanja: '逆說', kind: '한자어', level: 2, meaning: '겉으로는 모순되어 보이나 속에 진리를 담은 표현.', example: '“지는 것이 이기는 것”은 역설이다.' },

  /* ------------------------------- 고유어 ------------------------------- */
  { id: 'v-201', word: '가멸다', kind: '고유어', level: 3, meaning: '재산이 넉넉하고 많다.', example: '가멸진 집안에서 자랐다.' },
  { id: 'v-202', word: '시나브로', kind: '고유어', level: 2, meaning: '모르는 사이에 조금씩.', example: '눈이 시나브로 쌓였다.' },
  { id: 'v-203', word: '오롯이', kind: '고유어', level: 2, meaning: '모자람 없이 온전하게.', example: '오롯이 자기 힘으로 해냈다.' },
  { id: 'v-204', word: '애먼', kind: '고유어', level: 3, meaning: '일의 결과가 다른 데로 돌아가 엉뚱한.', example: '애먼 사람이 야단을 맞았다.' },
  { id: 'v-205', word: '살갑다', kind: '고유어', level: 2, meaning: '마음씨가 부드럽고 상냥하다.', example: '살가운 말씨로 손님을 맞았다.' },
  { id: 'v-206', word: '짐짓', kind: '고유어', level: 2, meaning: '마음으로는 그렇지 않으나 일부러 그렇게.', example: '짐짓 모른 체했다.' },
  { id: 'v-207', word: '지레', kind: '고유어', level: 2, meaning: '어떤 일이 일어나기 전에 미리.', example: '지레 겁을 먹었다.' },
  { id: 'v-208', word: '자못', kind: '고유어', level: 3, meaning: '생각보다 매우.', example: '분위기가 자못 진지했다.' },
  { id: 'v-209', word: '한사코', kind: '고유어', level: 2, meaning: '죽기로 기를 쓰고.', example: '한사코 사양했다.' },
  { id: 'v-210', word: '넌지시', kind: '고유어', level: 1, meaning: '드러나지 않게 가만히.', example: '넌지시 뜻을 물었다.' },
  { id: 'v-211', word: '어름', kind: '고유어', level: 3, meaning: '두 물건의 끝이 맞닿은 자리, 또는 그 무렵.', example: '봄과 여름의 어름이었다.' },
  { id: 'v-212', word: '무람없다', kind: '고유어', level: 3, meaning: '예의를 지키지 않아 버릇없다.', example: '어른께 무람없이 굴어서는 안 된다.' },

  /* ------------------------------- 문학어 ------------------------------- */
  { id: 'v-301', word: '여울', kind: '문학어', level: 2, meaning: '강이나 바다에서 물살이 세게 흐르는 얕은 곳.', example: '여울을 건너는 소리가 요란했다.' },
  { id: 'v-302', word: '고샅', kind: '문학어', level: 3, meaning: '시골 마을의 좁은 골목길.', example: '고샅을 돌아 집으로 갔다.' },
  { id: 'v-303', word: '해거름', kind: '문학어', level: 2, meaning: '해가 서쪽으로 넘어가는 무렵.', example: '해거름에 길을 나섰다.' },
  { id: 'v-304', word: '너울', kind: '문학어', level: 2, meaning: '바다의 크고 사나운 물결.', example: '너울에 배가 크게 흔들렸다.' },
  { id: 'v-305', word: '자맥질', kind: '문학어', level: 3, meaning: '물속에서 떴다 잠겼다 하는 짓.', example: '아이들이 자맥질을 하며 놀았다.' },
  { id: 'v-306', word: '푸념', kind: '문학어', level: 1, meaning: '마음속 불평을 늘어놓음.', example: '긴 푸념을 묵묵히 들어 주었다.' },

  /* -------------------------------- 속담 -------------------------------- */
  { id: 'v-401', word: '티끌 모아 태산', kind: '속담', level: 1, meaning: '작은 것도 쌓이면 큰 것이 된다.', example: '매일 열 문제씩, 티끌 모아 태산이다.' },
  { id: 'v-402', word: '빈 수레가 요란하다', kind: '속담', level: 1, meaning: '실속 없는 사람이 더 떠들썩하다.', example: '빈 수레가 요란하다더니 말만 앞섰다.' },
  { id: 'v-403', word: '언 발에 오줌 누기', kind: '속담', level: 2, meaning: '효과가 잠시뿐인 임시방편.', example: '땜질식 처방은 언 발에 오줌 누기다.' },
  { id: 'v-404', word: '사공이 많으면 배가 산으로 간다', kind: '속담', level: 1, meaning: '주관하는 이가 많으면 일을 그르친다.', example: '역할을 나누지 않으면 배가 산으로 간다.' },
  { id: 'v-405', word: '개구리 올챙이 적 생각 못 한다', kind: '속담', level: 1, meaning: '형편이 나아지자 지난 어려움을 잊는다.', example: '초심을 잊으면 올챙이 적을 잊는 셈이다.' },
  { id: 'v-406', word: '등잔 밑이 어둡다', kind: '속담', level: 1, meaning: '가까이 있는 것을 도리어 알기 어렵다.', example: '등잔 밑이 어둡다고, 답은 지문 첫 줄에 있었다.' },

  /* ------------------------------- 관용구 ------------------------------- */
  { id: 'v-501', word: '발이 넓다', kind: '관용구', level: 1, meaning: '아는 사람이 많아 활동 범위가 넓다.', example: '그는 발이 넓어 모르는 사람이 없다.' },
  { id: 'v-502', word: '입이 무겁다', kind: '관용구', level: 1, meaning: '말을 함부로 옮기지 않는다.', example: '입이 무거운 친구라 믿고 말했다.' },
  { id: 'v-503', word: '귀가 얇다', kind: '관용구', level: 1, meaning: '남의 말을 쉽게 믿는다.', example: '귀가 얇아 늘 흔들린다.' },
  { id: 'v-504', word: '손을 씻다', kind: '관용구', level: 2, meaning: '나쁜 일에서 완전히 관계를 끊다.', example: '그 일에서 손을 씻은 지 오래다.' },
  { id: 'v-505', word: '눈에 밟히다', kind: '관용구', level: 2, meaning: '잊히지 않고 자꾸 떠오르다.', example: '떠나는 뒷모습이 눈에 밟혔다.' },
  { id: 'v-506', word: '코가 높다', kind: '관용구', level: 1, meaning: '잘난 체하며 거만하다.', example: '상을 받더니 코가 높아졌다.' },
];

export const VOCAB_BY_ID = new Map(VOCAB.map((v) => [v.id, v]));

export const VOCAB_KINDS = ['한자성어', '한자어', '고유어', '문학어', '속담', '관용구'] as const;
