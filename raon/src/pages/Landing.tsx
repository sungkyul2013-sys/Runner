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

const FEATURES = [
  {
    color: C.lit,
    k: '일정 · 보강',
    t: '내 수업만 보이는 달력',
    d: '정규 수업, 보강, 시험, 휴강까지. 결석하면 보강 일정이 잡히는 순간 달력에 바로 나타납니다.',
    vis: 'cal',
  },
  {
    color: C.vocab,
    k: '피드백',
    t: '학생에게, 학부모님께 따로',
    d: '선생님은 한 번에 두 통을 씁니다. 학생은 학생에게 온 글만, 학부모님은 학부모님께 온 글만 봅니다.',
    vis: 'letters',
  },
  {
    color: C.gram,
    k: '교재 · 진도',
    t: '어디까지 했는지 한눈에',
    d: '지금 공부하는 교재와 진도를 수업마다 기록합니다. 몇 강까지 왔는지, 다음엔 무엇을 하는지.',
    vis: 'books',
  },
  {
    color: C.read,
    k: '출결',
    t: '출석부터 보강까지 이어서',
    d: '출석·지각·결석을 수업 자리에서 바로 체크하고, 결석은 자동으로 보강 대기에 모입니다.',
    vis: 'att',
  },
] as const;

function FeatureVis({ kind, color }: { kind: string; color: string }) {
  if (kind === 'cal')
    return (
      <div className="fv fv-cal">
        {Array.from({ length: 21 }, (_, i) => (
          <span key={i} className={i === 9 ? 'is-today' : ''}>
            {[2, 4, 9, 11, 16, 18].includes(i) && <i style={{ background: i === 16 ? '#0071e3' : color }} />}
          </span>
        ))}
      </div>
    );
  if (kind === 'letters')
    return (
      <div className="fv fv-letters">
        <span>
          <i />
          학생에게 · 현대시 세 번째 시간
        </span>
        <span>
          <i />
          학부모님께 · 10월 셋째 주 수업 안내
        </span>
      </div>
    );
  if (kind === 'books')
    return (
      <div className="fv fv-books">
        {[
          ['#3A6EA5', 0.5],
          ['#B8762E', 0.58],
          ['#2F7D63', 0.27],
        ].map(([c, p], i) => (
          <span key={i}>
            <em style={{ background: c as string }} />
            <i style={{ ['--w' as string]: p, ['--d' as string]: `${i * 120}ms` } as CSSProperties} />
          </span>
        ))}
      </div>
    );
  return (
    <div className="fv fv-att">
      {[
        ['출석', 12],
        ['지각', 1],
        ['결석', 0],
      ].map(([k, n], i) => (
        <span key={k} style={{ ['--i' as string]: i } as CSSProperties}>
          <b>{n}</b>
          {k}
        </span>
      ))}
    </div>
  );
}

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

      <section className="lsec" id="features">
        <Reveal as="header" className="lsec-head">
          <p className="lsec-eyebrow">하나의 플랫폼</p>
          <h2 className="lsec-title">
            수업이 끝나도
            <br />
            수업은 이어집니다.
          </h2>
          <p className="lsec-lead">선생님이 기록하는 순간, 학생과 학부모의 화면이 함께 바뀝니다.</p>
        </Reveal>
        <div className="feat-grid">
          {FEATURES.map((f, i) => (
            <Reveal key={f.k} as="article" className="feat" i={i}>
              <div className="feat-card" data-tilt="5" style={{ ['--c' as string]: f.color } as CSSProperties}>
                <p className="feat-k">
                  <i />
                  {f.k}
                </p>
                <h3 className="feat-t">{f.t}</h3>
                <p className="feat-d">{f.d}</p>
                <FeatureVis kind={f.vis} color={f.color} />
              </div>
            </Reveal>
          ))}
        </div>
      </section>

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
