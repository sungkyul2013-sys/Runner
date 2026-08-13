import type { Badge, Profile } from '../core/types';

const attempts = (p: Profile) => p.attempts.length;
const correct = (p: Profile) => p.attempts.filter((a) => a.correct).length;
const domainSeen = (p: Profile, d: keyof Profile['byDomain']) => p.byDomain[d]?.seen ?? 0;

export const BADGES: Badge[] = [
  { id: 'b-first', name: '첫 걸음', icon: '🌱', desc: '첫 문제를 풀었다', test: (p) => attempts(p) >= 1 },
  { id: 'b-ten', name: '열 문제', icon: '📗', desc: '누적 10문제', test: (p) => attempts(p) >= 10 },
  { id: 'b-fifty', name: '오십 고개', icon: '📘', desc: '누적 50문제', test: (p) => attempts(p) >= 50 },
  { id: 'b-hundred', name: '백 문백답', icon: '📚', desc: '누적 100문제', test: (p) => attempts(p) >= 100 },
  { id: 'b-correct50', name: '정답 수집가', icon: '🎯', desc: '정답 50개', test: (p) => correct(p) >= 50 },
  { id: 'b-diag', name: '좌표 확인', icon: '🧭', desc: '진단 평가 완료', test: (p) => p.diagnostics.length >= 1 },
  { id: 'b-diag3', name: '성장 곡선', icon: '📈', desc: '진단 평가 3회', test: (p) => p.diagnostics.length >= 3 },
  { id: 'b-routine', name: '설계자', icon: '🗓️', desc: '학습 루틴 생성', test: (p) => p.routine !== null },
  { id: 'b-streak3', name: '사흘의 힘', icon: '🔥', desc: '3일 연속 학습', test: (p) => p.bestStreak >= 3 },
  { id: 'b-streak7', name: '일주일', icon: '🔥', desc: '7일 연속 학습', test: (p) => p.bestStreak >= 7 },
  { id: 'b-streak30', name: '한 달의 습관', icon: '🏆', desc: '30일 연속 학습', test: (p) => p.bestStreak >= 30 },
  { id: 'b-lit', name: '문학의 결', icon: '📖', desc: '문학 20문제', test: (p) => domainSeen(p, 'literature') >= 20 },
  { id: 'b-gram', name: '문법의 뼈대', icon: '🧩', desc: '문법 20문제', test: (p) => domainSeen(p, 'grammar') >= 20 },
  { id: 'b-nonf', name: '지문 해부', icon: '🔬', desc: '비문학 20문제', test: (p) => domainSeen(p, 'nonfiction') >= 20 },
  { id: 'b-vocab', name: '어휘 창고', icon: '💠', desc: '어휘 20문제', test: (p) => domainSeen(p, 'vocab') >= 20 },
  { id: 'b-write', name: '쓰는 사람', icon: '✍️', desc: '논술 초안 저장', test: (p) => p.essays.length >= 1 },
  { id: 'b-review', name: '되돌아보기', icon: '♻️', desc: '오답을 5개 정복', test: (p) => correct(p) >= 5 && p.wrong.length === 0 && attempts(p) >= 20 },
  { id: 'b-srs', name: '기억의 서랍', icon: '🗂️', desc: '어휘 카드 30장 학습', test: (p) => p.srs.length >= 30 },
  { id: 'b-mock', name: '실전 감각', icon: '⏱️', desc: '모의고사 1회 완료', test: (p) => p.mocks.length >= 1 },
  { id: 'b-level5', name: '레벨 5', icon: '⭐', desc: '레벨 5 달성', test: (p) => p.xp >= 900 },
  { id: 'b-level10', name: '레벨 10', icon: '🌟', desc: '레벨 10 달성', test: (p) => p.xp >= 2800 },
  { id: 'b-time', name: '집중의 시간', icon: '⌛', desc: '누적 300분 학습', test: (p) => p.minutes >= 300 },
  { id: 'b-perfect', name: '무결점', icon: '💎', desc: '한 세션 10문제 연속 정답', test: (p) => {
      let run = 0;
      for (const a of p.attempts) {
        run = a.correct ? run + 1 : 0;
        if (run >= 10) return true;
      }
      return false;
    },
  },
  { id: 'b-allround', name: '전 영역 주파', icon: '🌈', desc: '다섯 영역을 모두 학습', test: (p) =>
      (['literature', 'grammar', 'nonfiction', 'vocab', 'writing'] as const).every((d) => p.byDomain[d].seen > 0),
  },
];

export const BADGE_BY_ID = new Map(BADGES.map((b) => [b.id, b]));
