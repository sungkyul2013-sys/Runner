import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { invalidate } from '../lib/hooks';
import { reducedMotion, useCountUp } from '../lib/motion';

// ── 브랜드: 라온의 다섯 자모(ㄹ·ㅏ·ㅇ·ㅗ·ㄴ)를 다섯 색 막대로 ─────────

export const AREAS = [
  { key: 'vocab', name: '어휘', jamo: 'ㄹ', color: '#e5483b' },
  { key: 'read', name: '독서', jamo: 'ㅏ', color: '#f2a91e' },
  { key: 'lit', name: '문학', jamo: 'ㅇ', color: '#2f6fde' },
  { key: 'gram', name: '문법', jamo: 'ㅗ', color: '#1f9e6e' },
  { key: 'write', name: '작문', jamo: 'ㄴ', color: '#8a56e2' },
] as const;

const BAR_H = [16, 11, 14, 8, 12];

/** 다섯 색 막대. 처음 그려질 때 차례로 솟아오르고, 마우스를 올리면 출렁인다. */
export function Mark({ scale = 1, intro = true }: { scale?: number; intro?: boolean }) {
  return (
    <span className={'mark' + (intro ? ' is-intro' : '')} style={{ ['--s' as string]: scale }} aria-hidden="true">
      {AREAS.map((a, i) => (
        <i key={a.key} style={{ height: BAR_H[i] * scale, width: 5 * scale, background: a.color, ['--i' as string]: i }} />
      ))}
    </span>
  );
}

export function Brand({ name, scale = 1 }: { name: string; scale?: number }) {
  return (
    <span className="brand" style={{ ['--s' as string]: scale }}>
      <Mark scale={scale} />
      <span className="brand-name">{name}</span>
    </span>
  );
}

/** 큰 숫자를 0 에서부터 올라가며 보여 준다 */
export function CountUp({ value }: { value: number }) {
  return <>{useCountUp(value)}</>;
}

// ── 버튼 ───────────────────────────────────────────────

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'plain' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  busy?: boolean;
};

export function Button({ variant = 'secondary', size = 'md', busy, className = '', children, disabled, ...rest }: BtnProps) {
  return (
    <button type="button" {...rest} disabled={disabled || busy} className={`btn btn-${variant} btn-${size}${busy ? ' is-busy' : ''} ${className}`}>
      <span className="btn-in">{children}</span>
    </button>
  );
}

// ── 폼 ────────────────────────────────────────────────

export function Field({ label, hint, children, wide }: { label: string; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={'field' + (wide ? ' field-wide' : '')}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** 고른 칸 뒤로 흰 표시가 미끄러져 따라가는 선택 버튼 묶음 (iOS 의 세그먼트) */
function useSlider(activeIndex: number, deps: unknown[]) {
  const box = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0 });
  const first = useRef(true);
  useLayoutEffect(() => {
    const measure = () => {
      const el = box.current?.querySelectorAll<HTMLElement>('[data-slot]')[activeIndex];
      if (!el) return setStyle({ opacity: 0 });
      setStyle({
        opacity: 1,
        width: el.offsetWidth,
        height: el.offsetHeight,
        transform: `translate(${el.offsetLeft}px, ${el.offsetTop}px)`,
        transition: first.current ? 'none' : undefined,
      });
      first.current = false;
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, ...deps]);
  return { box, style };
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
  label,
}: {
  value: T;
  options: { value: NoInfer<T>; label: ReactNode }[];
  onChange(v: NoInfer<T>): void;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const idx = options.findIndex((o) => o.value === value);
  const { box, style } = useSlider(idx, [options.length]);
  return (
    <div className={`seg seg-${size}`} role="radiogroup" aria-label={label} ref={box}>
      <span className="seg-thumb" style={style} aria-hidden="true" />
      {options.map((o) => (
        <button key={String(o.value)} data-slot type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { key: NoInfer<T>; label: ReactNode }[]; onChange(v: NoInfer<T>): void }) {
  const idx = tabs.findIndex((t) => t.key === value);
  const { box, style } = useSlider(idx, [tabs.length]);
  return (
    <nav className="seg seg-tabs" role="tablist" ref={box}>
      <span className="seg-thumb" style={style} aria-hidden="true" />
      {tabs.map((t) => (
        <button key={t.key} data-slot type="button" role="tab" aria-selected={value === t.key} className={value === t.key ? 'is-on' : ''} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

// ── 레이아웃 조각 ──────────────────────────────────────

export function SectionHead({ title, action, count }: { title: ReactNode; action?: ReactNode; count?: number }) {
  return (
    <div className="section-head">
      <h2>
        {title}
        {count !== undefined && count > 0 && <span className="count">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

export function PageHead({ title, sub, actions, eyebrow }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

/** 애플식 돌아가는 살 (잠깐이면 아예 보이지 않도록 조금 늦게 나타난다) */
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span className="spinner" style={{ width: size, height: size }} aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} style={{ ['--i' as string]: i }} />
      ))}
    </span>
  );
}

export function Loading({ label = '불러오는 중' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-label={label}>
      <Spinner />
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="link" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="dot" style={{ background: color, width: size, height: size }} />;
}

export type Tone = 'gray' | 'blue' | 'red' | 'orange' | 'green';

export function Tag({ children, tone = 'gray' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

/** 이름 첫 글자를 담은 동그라미 (연락처 앱처럼 회색) */
export function Avatar({ name, size = 'md', vtName }: { name: string; size?: 'sm' | 'md' | 'lg'; vtName?: string }) {
  return (
    <span className={`avatar avatar-${size}`} style={vtName ? ({ viewTransitionName: vtName } as CSSProperties) : undefined} aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}

// ── 시트: 넓은 화면에선 가운데 창, 좁은 화면에선 아래에서 올라오는 판 ──────

function useModalLife(open: boolean, ms: number) {
  const [shown, setShown] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setShown(true);
      setClosing(false);
      return;
    }
    if (!shown) return;
    if (reducedMotion()) {
      setShown(false);
      return;
    }
    setClosing(true);
    const t = setTimeout(() => {
      setShown(false);
      setClosing(false);
    }, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return { shown, closing };
}

function useModalFocus(open: boolean, panel: React.RefObject<HTMLDivElement | null>, onClose: () => void, focusFirstInput = true) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // 가장 위에 열린 창만 닫는다
      const all = document.querySelectorAll('.sheet-backdrop:not(.is-closing)');
      if (all[all.length - 1]?.contains(panel.current)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    requestAnimationFrame(() => {
      const first = focusFirstInput && window.matchMedia('(hover: hover)').matches ? panel.current?.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=hidden]), textarea, select') : null;
      (first ?? panel.current)?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      if (!document.querySelector('.sheet-backdrop:not(.is-closing)')) document.body.classList.remove('no-scroll');
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, onClose, panel, focusFirstInput]);
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  width = 560,
  vtName,
  className = '',
}: {
  open: boolean;
  onClose(): void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  vtName?: string;
  className?: string;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const { shown, closing } = useModalLife(open, 260);
  useModalFocus(open, panel, onClose);

  // 휴대폰에서는 손잡이나 머리를 잡고 아래로 끌어 닫는다
  const drag = useRef<{ y0: number; t0: number; dy: number } | null>(null);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = panel.current;
    if (!el || !window.matchMedia('(max-width: 720px)').matches) return;
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    drag.current = { y0: e.clientY, t0: performance.now(), dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    el.style.transition = 'none';
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = panel.current;
    if (!d || !el) return;
    const raw = e.clientY - d.y0;
    d.dy = raw > 0 ? raw : raw * 0.18;
    el.style.transform = `translateY(${d.dy}px)`;
  };
  const onUp = () => {
    const d = drag.current;
    const el = panel.current;
    drag.current = null;
    if (!d || !el) return;
    const v = d.dy / Math.max(1, performance.now() - d.t0);
    if (d.dy > 110 || (v > 0.5 && d.dy > 24)) {
      el.dataset.dragged = '1';
      el.style.transition = 'transform 0.26s cubic-bezier(0.4, 0, 1, 1)';
      el.style.transform = 'translateY(110%)';
      onClose();
    } else {
      el.style.transition = 'transform 0.55s cubic-bezier(0.3, 1.32, 0.5, 1)';
      el.style.transform = '';
    }
  };

  if (!shown) return null;
  return createPortal(
    <div className={'sheet-backdrop' + (closing ? ' is-closing' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'sheet ' + className} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel} tabIndex={-1} style={{ ['--w' as string]: `${width}px`, viewTransitionName: vtName } as CSSProperties}>
        <div className="sheet-drag" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span className="sheet-grabber" aria-hidden="true" />
          <div className="sheet-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="close-btn" onClick={onClose} aria-label="닫기">
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ── 확인 창 (애플식 알림) ──────────────────────────────

interface ConfirmOpts {
  title: string;
  body?: ReactNode;
  ok?: string;
  danger?: boolean;
}

function Alert({ opts, onDone }: { opts: ConfirmOpts | null; onDone(v: boolean): void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [last, setLast] = useState<ConfirmOpts | null>(opts);
  useEffect(() => {
    if (opts) setLast(opts);
  }, [opts]);
  const cancel = useCallback(() => onDone(false), [onDone]);
  const { shown, closing } = useModalLife(!!opts, 180);
  useModalFocus(!!opts, panel, cancel, false);
  const o = opts ?? last;
  if (!shown || !o) return null;
  return createPortal(
    <div className={'sheet-backdrop alert-backdrop' + (closing ? ' is-closing' : '')}>
      <div className="alert" role="alertdialog" aria-modal="true" aria-label={o.title} ref={panel} tabIndex={-1}>
        <div className="alert-text">
          <p className="alert-title">{o.title}</p>
          {o.body && <div className="alert-body">{o.body}</div>}
        </div>
        <div className="alert-actions">
          <button type="button" onClick={() => onDone(false)}>
            취소
          </button>
          <button type="button" className={o.danger ? 'is-danger' : 'is-default'} onClick={() => onDone(true)}>
            {o.ok ?? '확인'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── 알림·확인 ──────────────────────────────────────────

interface Feedback {
  toast(msg: string, tone?: 'ok' | 'err'): void;
  confirm(o: ConfirmOpts): Promise<boolean>;
  /** 저장 같은 작업을 실행하고, 성공하면 알림 + 화면 새로고침 */
  run<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined>;
}

const FeedbackCtx = createContext<Feedback>(null!);
export const useUi = () => useContext(FeedbackCtx);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: 'ok' | 'err'; out?: boolean }[]>([]);
  const [pending, setPending] = useState<(ConfirmOpts & { resolve(v: boolean): void }) | null>(null);

  const toast = useCallback((msg: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, tone }]);
    const life = tone === 'err' ? 4200 : 2400;
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, out: true } : x))), life);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), life + 260);
  }, []);

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })), []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string) => {
      try {
        const r = await fn();
        if (ok) toast(ok);
        invalidate();
        return r;
      } catch (e: any) {
        toast(e?.message ?? '처리하지 못했습니다.', 'err');
        return undefined;
      }
    },
    [toast],
  );

  const done = useCallback(
    (v: boolean) => {
      setPending((p) => {
        p?.resolve(v);
        return null;
      });
    },
    [],
  );

  return (
    <FeedbackCtx.Provider value={{ toast, confirm, run }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}${t.out ? ' is-out' : ''}`}>
            {t.tone === 'ok' ? (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 4.5v4.5M8 11.4v.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )}
            {t.msg}
          </div>
        ))}
      </div>
      <Alert opts={pending} onDone={done} />
    </FeedbackCtx.Provider>
  );
}

// ── 작은 아이콘 (선 하나로 그린 것만) ────────────────────

export function Chevron({ dir = 'right', size = 14 }: { dir?: 'left' | 'right' | 'down' | 'up'; size?: number }) {
  const d = dir === 'left' ? 'M9 2.5L4.5 7 9 11.5' : dir === 'right' ? 'M5 2.5L9.5 7 5 11.5' : dir === 'down' ? 'M2.5 5L7 9.5 11.5 5' : 'M2.5 9L7 4.5 11.5 9';
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" className="chev">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Plus({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="6" cy="6" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9.3 9.3L12.5 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** 네 모서리가 바깥으로 벌어지는 '펼치기' 아이콘 */
export function ExpandIcon({ size = 13, collapse }: { size?: number; collapse?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <path
        d={collapse ? 'M5 1.5V5H1.5M9 1.5V5h3.5M5 12.5V9H1.5M9 12.5V9h3.5' : 'M1.5 5V1.5H5M12.5 5V1.5H9M1.5 9v3.5H5M12.5 9v3.5H9'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 위아래로 펼쳐지는 칸. 높이를 재지 않고 grid 로 부드럽게 연다. */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
    else {
      const t = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(t);
    }
  }, [open]);
  return (
    <div className={'collapse' + (open ? ' is-open' : '')} aria-hidden={!open}>
      <div className="collapse-in">{mounted && children}</div>
    </div>
  );
}
