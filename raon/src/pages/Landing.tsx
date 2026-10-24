// 로그인하기 전 첫 화면. 라온국어가 무엇을 하는 곳인지 보여 주고, 여기서 로그인·상담 신청을 연다.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { reducedMotion, useReveal } from '../lib/motion';
import { AREAS, Brand, Button, Mark } from '../components/ui';
import { ConsultSheet, LoginSheet } from './Login';

const C = Object.fromEntries(AREAS.map((a) => [a.key, a.color])) as Record<(typeof AREAS)[number]['key'], string>;

/** 히어로 오른쪽: 실제 화면 조각들이 공중에 떠 있는 3D 장면. 포인터를 따라 살짝 돌아간다. */
function HeroStack() {
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el || reducedMotion()) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let raf = 0;
    let tx = 0,
      ty = 0,
      x = 0,
      y = 0,
      sp = 0,
      spT = 0;
    const loop = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      sp += (spT - sp) * 0.12;
      el.style.setProperty('--px', x.toFixed(3));
      el.style.setProperty('--py', y.toFixed(3));
      el.style.setProperty('--sp', sp.toFixed(3));
      raf = Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(spT - sp) > 0.001 ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onMove = (e: PointerEvent) => {
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
      kick();
    };
    const onScroll = () => {
      spT = Math.min(1, window.scrollY / (window.innerHeight * 0.9));
      kick();
    };
    if (fine) window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const week = [
    ['금', 23],
    ['토', 24],
    ['일', 25],
    ['월', 26],
    ['화', 27],
    ['수', 28],
    ['목', 29],
  ] as const;

  return (
    <div className="stack" ref={stage} aria-hidden="true">
      <div className="stack-scene">
        <div className="sk sk-next" style={{ ['--i' as string]: 0, ['--z' as string]: '0px' } as CSSProperties}>
          <div className="sk-in">
            <p className="sk-label">다음 수업</p>
            <p className="sk-when">
              <span>오늘</span> 오후 7:40
            </p>
            <p className="sk-what">고2 문학·독서</p>
            <div className="sk-week">
              {week.map(([w, n], i) => (
                <span key={n} className={i === 0 ? 'is-today' : ''}>
                  <small>{w}</small>
                  <b>{n}</b>
                  <i style={{ background: i === 0 || i === 4 ? C.lit : i === 2 ? '#0071e3' : 'transparent' }} />
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="sk sk-letter" style={{ ['--i' as string]: 1, ['--z' as string]: '90px' } as CSSProperties}>
          <div className="sk-in">
            <p className="sk-from">
              <i />
              정다은 선생님 <small>10월 23일</small>
            </p>
            <p className="sk-subj">현대시 세 번째 시간</p>
            <p className="sk-prev">태윤아, 오늘 「사평역에서」를 읽으면서 화자의 시선을 정리한 거, 정확했어.</p>
          </div>
        </div>

        <div className="sk sk-book" style={{ ['--i' as string]: 2, ['--z' as string]: '150px' } as CSSProperties}>
          <div className="sk-in">
            <span className="sk-cover" style={{ background: '#3A6EA5' }}>
              수능특강
              <br />
              문학
            </span>
            <div>
              <p className="sk-bt">수능특강 문학</p>
              <p className="sk-bp">
                <b>15</b> / 30강
              </p>
              <span className="sk-bar">
                <i />
              </span>
            </div>
          </div>
        </div>

        <div className="sk sk-att" style={{ ['--i' as string]: 3, ['--z' as string]: '60px' } as CSSProperties}>
          <div className="sk-in">
            <span>
              <b>12</b>출석
            </span>
            <span>
              <b>1</b>지각
            </span>
            <span>
              <b>0</b>결석
            </span>
          </div>
        </div>

        <div className="sk sk-toast" style={{ ['--i' as string]: 4, ['--z' as string]: '230px' } as CSSProperties}>
          <div className="sk-in">
            <span className="sk-check">
              <svg width="12" height="12" viewBox="0 0 16 16">
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            보강이 잡혔어요 · 일요일 오후 3:00
          </div>
        </div>
      </div>
      <div className="stack-floor" />
    </div>
  );
}

function Reveal({ children, className = '', as: As = 'div', i = 0 }: { children: ReactNode; className?: string; as?: 'div' | 'header' | 'article'; i?: number }) {
  const ref = useReveal<HTMLDivElement>(0.18);
  return (
    <As ref={ref as never} className={'reveal ' + className} style={{ ['--i' as string]: i } as CSSProperties}>
      {children}
    </As>
  );
}

// ── 기능 설명: 한 기능씩, 글과 3D 화면 예시를 나란히 ─────────────

/** 3D 로 기울어진 무대. 화면에 들어오면 카드들이 차례로 튀어 오른다. */
function Scene({ children, tilt = 'left' }: { children: ReactNode; tilt?: 'left' | 'right' }) {
  return (
    <div className={'scene scene-' + tilt} aria-hidden="true">
      <div className="scene-in">{children}</div>
      <div className="scene-floor" />
    </div>
  );
}

function Card({ i, z = 0, className = '', children }: { i: number; z?: number; className?: string; children: ReactNode }) {
  return (
    <div className={'mk ' + className} style={{ ['--i' as string]: i, ['--z' as string]: `${z}px` } as CSSProperties}>
      <div className="mk-in">{children}</div>
    </div>
  );
}

function CalendarMock() {
  const dots: Record<number, string[]> = { 1: [C.lit], 3: [C.lit], 6: [C.lit, '#0071e3'], 8: [C.lit], 10: [C.lit], 13: [C.lit], 15: [C.lit], 17: ['#c7c7cc'], 20: [C.lit], 22: [C.lit, '#1d1d1f'] };
  return (
    <Scene>
      <Card i={0} className="mk-cal">
        <p className="mk-h">
          <b>10월</b> 2026
        </p>
        <div className="mk-grid">
          {['일', '월', '화', '수', '목', '금', '토'].map((w) => (
            <small key={w}>{w}</small>
          ))}
          {Array.from({ length: 28 }, (_, i) => (
            <span key={i} className={i === 9 ? 'is-today' : ''}>
              <b>{i + 1}</b>
              <em>
                {(dots[i] ?? []).map((c, j) => (
                  <i key={j} style={{ background: c }} />
                ))}
              </em>
            </span>
          ))}
        </div>
      </Card>
      <Card i={1} z={90} className="mk-day">
        <p className="mk-k">10월 7일 수요일</p>
        <p className="mk-row">
          <span className="mk-bar" style={{ background: C.lit }} />
          <span>
            <b>고2 문학·독서</b>
            <small>오후 7:40 – 10:00</small>
          </span>
        </p>
        <p className="mk-row">
          <span className="mk-bar" style={{ background: '#0071e3' }} />
          <span>
            <b>
              <em className="mk-kind">보강</em> 고2 문학·독서
            </b>
            <small>오후 3:00 – 5:00 · 10.13 수업분</small>
          </span>
        </p>
      </Card>
      <Card i={2} z={160} className="mk-pill">
        <span className="mk-seg">
          <i>월</i>
          <i className="is-on">주</i>
          <i>목록</i>
        </span>
      </Card>
    </Scene>
  );
}

function MakeupMock() {
  return (
    <Scene tilt="right">
      <Card i={0} className="mk-step mk-step-1">
        <p className="mk-k">수업 출석부</p>
        <p className="mk-roster">
          <b>김태윤</b>
          <span className="mk-att">
            <i>출석</i>
            <i>지각</i>
            <i className="is-absent">결석</i>
          </span>
        </p>
      </Card>
      <Card i={1} z={70} className="mk-step mk-step-2">
        <p className="mk-k">보강 대기</p>
        <p className="mk-need">
          <span>
            <b>김태윤</b>
            <small>10.13 (화) · 고2 문학·독서 결석</small>
          </span>
          <em>보강 잡기</em>
        </p>
      </Card>
      <Card i={2} z={140} className="mk-step mk-step-3">
        <p className="mk-k">학생 · 학부모 달력</p>
        <p className="mk-row">
          <span className="mk-bar" style={{ background: '#0071e3' }} />
          <span>
            <b>
              <em className="mk-kind">보강</em> 고2 문학·독서
            </b>
            <small>10월 25일 일요일 · 오후 3:00</small>
          </span>
        </p>
      </Card>
      <svg className="mk-flow" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M30 30 C 45 38, 52 46, 58 52" />
        <path d="M58 60 C 52 68, 46 74, 40 80" />
      </svg>
    </Scene>
  );
}

function FeedbackMock() {
  return (
    <Scene>
      <Card i={0} className="mk-letter mk-letter-s">
        <p className="mk-to">
          <i />
          학생에게
        </p>
        <p className="mk-subj">현대시 세 번째 시간</p>
        <p className="mk-body">태윤아, 오늘 「사평역에서」를 읽으면서 화자의 시선을 정리한 거, 정확했어. 숙제는 수능특강 15강 3번·5번.</p>
        <p className="mk-read">10.23 21:04 읽음</p>
      </Card>
      <Card i={1} z={110} className="mk-letter mk-letter-p">
        <p className="mk-to" style={{ ['--c' as string]: C.vocab } as CSSProperties}>
          <i />
          학부모님께
        </p>
        <p className="mk-subj">10월 셋째 주 수업 안내</p>
        <p className="mk-body">이번 주 태윤이는 현대시 단원을 마무리했습니다. 가정에서는 매3비를 하루 20분씩 이어 갈 수 있도록…</p>
        <p className="mk-read is-new">안 읽음</p>
      </Card>
    </Scene>
  );
}

function BooksMock() {
  return (
    <Scene tilt="right">
      <Card i={0} className="mk-book">
        <span className="mk-cover" style={{ background: '#3A6EA5' }}>
          수능특강
          <br />
          문학
        </span>
        <span className="mk-bk">
          <small>문학 · EBS</small>
          <b>수능특강 문학</b>
          <span className="mk-prog">
            <em>
              <b>15</b> / 30강
            </em>
            <em>50%</em>
          </span>
          <span className="mk-track">
            <i style={{ ['--w' as string]: 0.5 } as CSSProperties} />
          </span>
        </span>
      </Card>
      <Card i={1} z={90} className="mk-logs">
        <p className="mk-k">진도 기록</p>
        {[
          ['10.23', '15강', '현대시 ③ — 「사평역에서」'],
          ['10.21', '14강', '현대시 ② — 「추천사」'],
          ['10.16', '12강', '고전시가 — 「관동별곡」'],
        ].map(([d, p, n]) => (
          <p key={d} className="mk-log">
            <small>{d}</small>
            <b>{p}</b>
            <span>{n}</span>
          </p>
        ))}
      </Card>
    </Scene>
  );
}

function AttendanceMock() {
  return (
    <Scene>
      <Card i={0} className="mk-roll">
        <p className="mk-h">
          <b>오후 7:40</b> 고2 문학·독서
        </p>
        {[
          ['김태윤', 0],
          ['이채원', 0],
          ['신유진', 1],
          ['박도윤', -1],
        ].map(([n, st]) => (
          <p key={n as string} className="mk-roster">
            <b>{n}</b>
            <span className="mk-att">
              <i className={st === 0 ? 'is-on' : ''}>출석</i>
              <i className={st === 1 ? 'is-late' : ''}>지각</i>
              <i>결석</i>
            </span>
          </p>
        ))}
        <p className="mk-all">나머지 1명 모두 출석</p>
      </Card>
      <Card i={1} z={120} className="mk-sum">
        <span>
          <b>12</b>출석
        </span>
        <span>
          <b>1</b>지각
        </span>
        <span className="is-warn">
          <b>0</b>결석
        </span>
      </Card>
    </Scene>
  );
}

function ConsultMock() {
  return (
    <Scene tilt="right">
      <Card i={0} className="mk-form">
        <p className="mk-h">
          <b>상담 신청</b>
        </p>
        <span className="mk-field">학생 이름</span>
        <span className="mk-chips">
          {['중1', '중2', '중3', '고1', '고2'].map((g, i) => (
            <i key={g} className={i === 2 ? 'is-on' : ''}>
              {g}
            </i>
          ))}
        </span>
        <span className="mk-field">010-0000-0000</span>
        <span className="mk-btn">신청하기</span>
      </Card>
      <Card i={1} z={110} className="mk-login">
        <Mark scale={0.9} />
        <span className="mk-field mk-filled">김태윤</span>
        <span className="mk-field mk-filled">••••••••</span>
        <span className="mk-btn">로그인</span>
      </Card>
    </Scene>
  );
}

const FEATURES: { id: string; color: string; k: string; t: ReactNode; d: string; points: string[]; vis: ReactNode }[] = [
  {
    id: 'f-calendar',
    color: C.lit,
    k: '일정',
    t: (
      <>
        내 수업만 보이는
        <br />
        달력.
      </>
    ),
    d: '반 시간표를 정하면 정규 수업이 달력에 저절로 채워집니다. 학생과 학부모에게는 자기 수업만 보입니다.',
    points: ['정규 수업 · 보강 · 시험 · 휴강 · 휴원을 한 달력에', '월 · 주 · 목록으로 펼쳐 보기, 지금 시각은 빨간 선으로', '휴대폰에서는 옆으로 밀어 달을 넘깁니다'],
    vis: <CalendarMock />,
  },
  {
    id: 'f-makeup',
    color: C.vocab,
    k: '보강',
    t: (
      <>
        결석하면,
        <br />
        보강이 따라옵니다.
      </>
    ),
    d: '출석부에서 결석을 누르거나 반을 휴강하면 보강 대기에 모입니다. 보강을 잡는 순간 학생·학부모 달력에 나타납니다.',
    points: ['결석·휴강은 자동으로 보강 대기에', '보강을 잡으면 원래 어느 수업분인지 함께 표시', '보강을 지우면 다시 대기로 돌아갑니다'],
    vis: <MakeupMock />,
  },
  {
    id: 'f-feedback',
    color: C.write,
    k: '피드백',
    t: (
      <>
        학생에게, 학부모님께
        <br />
        따로 씁니다.
      </>
    ),
    d: '선생님은 한 번에 두 통을 씁니다. 학생은 학생에게 온 글만, 학부모님은 학부모님께 온 글만 봅니다.',
    points: ['수업·과제·시험·태도·상담으로 나눠 보관', '누가 언제 읽었는지 선생님 화면에 표시', '안 읽은 글엔 파란 점, 메일함처럼 간단하게'],
    vis: <FeedbackMock />,
  },
  {
    id: 'f-books',
    color: C.gram,
    k: '교재 · 진도',
    t: (
      <>
        어디까지 했는지
        <br />
        한눈에.
      </>
    ),
    d: '교재를 학생이나 반 전체에 배정하고, 수업마다 몇 강까지 했는지 기록합니다. 기록할 때마다 이력이 쌓입니다.',
    points: ['지금 하는 교재 · 다음 교재 · 끝낸 교재', '진도 막대와 최근 진도 메모', '교재별로 누가 어디까지 했는지 모아 보기'],
    vis: <BooksMock />,
  },
  {
    id: 'f-attendance',
    color: C.read,
    k: '출결',
    t: (
      <>
        수업 자리에서
        <br />
        바로 체크.
      </>
    ),
    d: '오늘 화면에서 수업을 누르면 출석부가 펼쳐집니다. 출석·지각·결석을 한 번에 누르고, 나머지는 한꺼번에 출석으로.',
    points: ['학생·학부모 홈에 이번 달 출결 요약', '결석에서 보강 잡기까지 한 화면에서', '학생별 최근 60일 출결 기록'],
    vis: <AttendanceMock />,
  },
  {
    id: 'f-consult',
    color: C.lit,
    k: '상담 · 로그인',
    t: (
      <>
        처음 오는 분도,
        <br />
        다니는 분도.
      </>
    ),
    d: '처음이라면 로그인 없이 상담을 신청하고, 다니는 학생과 학부모님은 이름으로 로그인합니다.',
    points: ['상담 신청은 선생님 화면에 바로 모이고, 번호를 누르면 전화', '형제·자매는 학부모 계정 하나로 아이를 바꿔 가며', '비밀번호는 각자 바꿀 수 있어요'],
    vis: <ConsultMock />,
  },
];

// 앱 아이콘처럼 쓰는 흰 선 그림
const ICON: Record<string, ReactNode> = {
  cal: (
    <>
      <rect x="3" y="4.5" width="14" height="12.5" rx="2.6" />
      <path d="M3 8.5h14M7 2.8v3.2M13 2.8v3.2" />
    </>
  ),
  makeup: (
    <>
      <path d="M3.8 10a6.2 6.2 0 1 0 1.9-4.5" />
      <path d="M3.6 3v3.4H7" />
    </>
  ),
  feedback: (
    <>
      <rect x="2.8" y="4.5" width="14.4" height="11" rx="2.4" />
      <path d="M3.4 5.6 10 10.6l6.6-5" />
    </>
  ),
  books: (
    <>
      <path d="M10 5.6C8.6 4.4 6.3 4 3.5 4.2v11c2.8-.2 5.1.2 6.5 1.4 1.4-1.2 3.7-1.6 6.5-1.4v-11c-2.8-.2-5.1.2-6.5 1.4z" />
      <path d="M10 5.6v11" />
    </>
  ),
  att: (
    <>
      <rect x="3.5" y="3" width="13" height="14" rx="2.4" />
      <path d="M7 10.2l2 2 4-4.4" />
    </>
  ),
  consult: <path d="M4.5 4h11a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H9l-3.6 2.6v-2.6h-.9a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />,
};

const OVERVIEW = [
  { id: 'f-calendar', color: C.lit, icon: 'cal', k: '일정', d: '내 수업만 보이는 달력' },
  { id: 'f-makeup', color: C.vocab, icon: 'makeup', k: '보강', d: '결석하면 보강 대기로' },
  { id: 'f-feedback', color: C.write, icon: 'feedback', k: '피드백', d: '학생용 · 학부모용 따로' },
  { id: 'f-books', color: C.gram, icon: 'books', k: '교재 · 진도', d: '몇 강까지 했는지' },
  { id: 'f-attendance', color: C.read, icon: 'att', k: '출결', d: '수업 자리에서 바로' },
  { id: 'f-consult', color: C.lit, icon: 'consult', k: '상담 신청', d: '로그인 없이 신청' },
];

const ROLES = [
  { who: '학생', color: C.lit, items: ['다음 수업이 언제인지', '선생님이 나에게 쓴 피드백', '지금 교재를 어디까지 했는지'] },
  { who: '학부모', color: C.vocab, items: ['아이의 일정과 잡힌 보강', '학부모님께만 오는 수업 안내', '이번 달 출결'] },
  { who: '선생님', color: C.gram, items: ['오늘 수업과 출석부', '결석에서 보강까지 한 번에', '피드백과 교재 진도 기록'] },
];

export function LandingPage() {
  const { academy } = useAuth();
  const [login, setLogin] = useState(false);
  const [consult, setConsult] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  const openConsult = () => {
    setLogin(false);
    setTimeout(() => setConsult(true), login ? 220 : 0);
  };

  return (
    <div className="landing">
      <header className={'lnav' + (scrolled ? ' is-scrolled' : '')}>
        <div className="lnav-in">
          <a href="#top" className="lnav-brand" aria-label={`${academy.name} 처음으로`}>
            <Brand name={academy.name} />
          </a>
          <nav className="lnav-links" aria-label="둘러보기">
            <a href="#features">기능</a>
            <a href="#roles">누가 쓰나요</a>
            <a href="#start">시작하기</a>
          </nav>
          <div className="lnav-end">
            <button type="button" className="lnav-consult" onClick={openConsult}>
              상담 신청
            </button>
            <Button size="sm" variant="primary" onClick={() => setLogin(true)}>
              로그인
            </Button>
          </div>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="orbs" aria-hidden="true">
          {AREAS.map((a) => (
            <i key={a.key} style={{ ['--c' as string]: a.color } as CSSProperties} />
          ))}
        </div>
        <div className="hero-in">
          <div className="hero-copy">
            <p className="hero-eyebrow">
              <Mark scale={0.8} />
              {academy.name} 학습 플랫폼
            </p>
            <h1 className="hero-title">
              수업의 모든 순간을
              <br />
              <span className="grad-text">한 화면에.</span>
            </h1>
            <p className="hero-lead">오늘의 수업과 보강, 선생님의 피드백, 지금 공부하는 교재까지. 학생·학부모·선생님이 각자의 화면에서 바로 확인합니다.</p>
            <div className="hero-cta">
              <Button variant="primary" size="lg" onClick={() => setLogin(true)}>
                로그인
              </Button>
              <Button size="lg" onClick={openConsult}>
                상담 신청
              </Button>
            </div>
            <p className="hero-note">라온국어 학생·학부모님은 이름으로 로그인합니다.</p>
          </div>
          <HeroStack />
        </div>
      </section>

      <section className="lsec lsec-overview" id="features">
        <Reveal as="header" className="lsec-head">
          <p className="lsec-eyebrow">무엇을 할 수 있나요</p>
          <h2 className="lsec-title">수업에 필요한 여섯 가지.</h2>
          <p className="lsec-lead">선생님이 기록하는 순간, 학생과 학부모의 화면이 함께 바뀝니다.</p>
        </Reveal>
        <div className="ov-grid">
          {OVERVIEW.map((o, i) => (
            <Reveal key={o.id} className="ov" i={i}>
              <a href={'#' + o.id} className="ov-card" data-tilt="6" style={{ ['--c' as string]: o.color } as CSSProperties}>
                <span className="ov-dot">
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    {ICON[o.icon]}
                  </svg>
                </span>
                <b>{o.k}</b>
                <small>{o.d}</small>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {FEATURES.map((f, n) => (
        <section key={f.id} className={'feature' + (n % 2 ? ' is-flip' : '')} id={f.id} style={{ ['--c' as string]: f.color } as CSSProperties}>
          <div className="feature-in">
            <Reveal className="feature-copy">
              <p className="feature-k">
                <i />
                {f.k}
              </p>
              <h2 className="feature-t">{f.t}</h2>
              <p className="feature-d">{f.d}</p>
              <ul className="feature-points">
                {f.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Reveal>
            <Reveal className="feature-vis" i={1}>
              {f.vis}
            </Reveal>
          </div>
        </section>
      ))}

      <section className="lsec lsec-dark" id="roles">
        <Reveal as="header" className="lsec-head">
          <p className="lsec-eyebrow">누가 쓰나요</p>
          <h2 className="lsec-title">같은 수업, 세 개의 화면.</h2>
          <p className="lsec-lead">로그인한 사람에게 꼭 필요한 것만 보입니다. 다른 학생의 이름은 보이지 않습니다.</p>
        </Reveal>
        <div className="role-grid">
          {ROLES.map((r, i) => (
            <Reveal key={r.who} as="article" className="role" i={i}>
              <div className="role-card" style={{ ['--c' as string]: r.color } as CSSProperties}>
                <span className="role-dot" />
                <h3>{r.who}</h3>
                <ul>
                  {r.items.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="lsec lsec-cta" id="start">
        <Reveal className="cta-in">
          <span className="cta-mark">
            <Mark scale={2.4} />
          </span>
          <h2 className="lsec-title">지금 바로 시작하세요.</h2>
          <p className="lsec-lead">회원이라면 이름으로 로그인하고, 처음이라면 상담부터 신청해 주세요.</p>
          <div className="hero-cta">
            <Button variant="primary" size="lg" onClick={() => setLogin(true)}>
              로그인
            </Button>
            <Button size="lg" onClick={openConsult}>
              상담 신청
            </Button>
          </div>
        </Reveal>
      </section>

      <footer className="lfoot">
        <div className="lfoot-in">
          <Brand name={academy.name} scale={0.85} />
          <p>
            {[academy.address, academy.phone].filter(Boolean).map((t, i) => (
              <span key={i}>{t.includes('-') && /^\d/.test(t) ? <a href={`tel:${t}`}>{t}</a> : t}</span>
            ))}
          </p>
          <p className="lfoot-copy">© {new Date().getFullYear()} {academy.name}</p>
        </div>
      </footer>

      <LoginSheet open={login} onClose={() => setLogin(false)} onConsult={openConsult} />
      <ConsultSheet open={consult} onClose={() => setConsult(false)} />
    </div>
  );
}
