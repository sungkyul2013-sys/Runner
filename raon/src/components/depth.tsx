// CSS 3D 로 만든 입체 조각들: 넘어가는 숫자판, 책, 편지봉투, 출결 기둥
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AttendanceSummary, Textbook } from '../../shared/types';
import { useCountUp } from '../lib/motion';

// ── 넘어가는 숫자판 (공항 시계처럼) ─────────────────────

function FlipChar({ ch, delay }: { ch: string; delay: number }) {
  const prev = useRef(' ');
  const [pair, setPair] = useState<[string, string]>([' ', ch]);
  const [k, setK] = useState(0);
  useEffect(() => {
    setPair([prev.current, ch]);
    setK((x) => x + 1);
    prev.current = ch;
  }, [ch]);
  const [from, to] = pair;
  if (ch === ':' || ch === '.') return <span className="flip-sep">{ch}</span>;
  return (
    <span className="flip" key={k} style={{ ['--d' as string]: `${delay}ms` }}>
      <span className="flip-half flip-top">
        <span>{to}</span>
      </span>
      <span className="flip-half flip-bottom">
        <span>{to}</span>
      </span>
      <span className="flip-half flip-bottom flip-old">
        <span>{from}</span>
      </span>
      <span className="flip-leaf">
        <span className="flip-half flip-top flip-front">
          <span>{from}</span>
        </span>
        <span className="flip-half flip-bottom flip-back">
          <span>{to}</span>
        </span>
      </span>
    </span>
  );
}

export function FlipText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={'flip-text ' + className} aria-label={text}>
      {[...text].map((c, i) => (
        <FlipChar key={i} ch={c} delay={i * 90} />
      ))}
    </span>
  );
}

// ── 입체 책 ────────────────────────────────────────────

type BookLike = Pick<Textbook, 'title' | 'publisher' | 'color'> & { totalUnits?: number };

/**
 * 표지·책등·책배(종이 단면)가 있는 책. 평소엔 책등이 보이게 서 있고,
 * 마우스를 올리면 돌아서며 책배에 '읽은 만큼'이 색으로 드러난다.
 */
export function Book3D({ book, progress = 0, size = 'md', still }: { book: BookLike; progress?: number; size?: 'sm' | 'md' | 'lg'; still?: boolean }) {
  const units = book.totalUnits ?? 20;
  const thick = Math.round(Math.min(26, Math.max(10, 8 + units * 0.5)) * (size === 'sm' ? 0.62 : size === 'lg' ? 1.25 : 1));
  const style = { ['--bc' as string]: book.color, ['--t' as string]: `${thick}px`, ['--p' as string]: Math.max(0, Math.min(1, progress)) } as CSSProperties;
  return (
    <span className={`book3d book3d-${size}${still ? ' is-still' : ''}`} style={style} aria-hidden="true" data-tilt="0">
      <span className="b3">
        <span className="b3-face b3-front">
          <span className="b3-title">{book.title}</span>
          <span className="b3-pub">{book.publisher}</span>
        </span>
        <span className="b3-face b3-back" />
        <span className="b3-face b3-spine">
          <span>{book.title}</span>
        </span>
        <span className="b3-face b3-pages">
          <i />
        </span>
        <span className="b3-face b3-top" />
        <span className="b3-face b3-bottom" />
      </span>
      <span className="b3-shadow" />
    </span>
  );
}

// ── 편지봉투 ───────────────────────────────────────────

export function Envelope({ open, sealed }: { open: boolean; sealed?: boolean }) {
  return (
    <span className={'env' + (open ? ' is-open' : '') + (sealed ? ' is-sealed' : '')} aria-hidden="true">
      <span className="env-back" />
      <span className="env-paper">
        <i />
        <i />
        <i />
      </span>
      <span className="env-front" />
      <span className="env-flap" />
      <span className="env-seal" />
    </span>
  );
}

// ── 출결 기둥 ──────────────────────────────────────────

function Pillar({ value, max, label, tone }: { value: number; max: number; label: string; tone: string }) {
  const shown = useCountUp(value);
  const h = 14 + (max ? (value / max) * 86 : 0);
  return (
    <div className={`pillar pillar-${tone}`} style={{ ['--h' as string]: `${h}px` }}>
      <span className="pillar-n">{shown}</span>
      <span className="pillar-3d">
        <span className="pf pf-front" />
        <span className="pf pf-side" />
        <span className="pf pf-top" />
      </span>
      <span className="pillar-k">{label}</span>
    </div>
  );
}

export function AttendancePillars({ a }: { a: AttendanceSummary }) {
  const max = Math.max(1, a.present, a.late, a.absent);
  return (
    <div className="pillars" role="img" aria-label={`출석 ${a.present}회, 지각 ${a.late}회, 결석 ${a.absent}회`}>
      <Pillar value={a.present} max={max} label="출석" tone="green" />
      <Pillar value={a.late} max={max} label="지각" tone="yellow" />
      <Pillar value={a.absent} max={max} label="결석" tone="red" />
    </div>
  );
}

/** 큰 숫자를 올라가며 보여 준다 */
export function CountUp({ value }: { value: number }) {
  return <>{useCountUp(value)}</>;
}
