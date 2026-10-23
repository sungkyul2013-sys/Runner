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
import { lastPointer, reducedMotion } from '../lib/motion';

// ── 브랜드: 라온의 다섯 자모(ㄹ·ㅏ·ㅇ·ㅗ·ㄴ)를 다섯 색 막대로 ─────────

export const AREAS = [
  { key: 'vocab', name: '어휘', jamo: 'ㄹ', color: '#e5483b' },
  { key: 'read', name: '독서', jamo: 'ㅏ', color: '#f2a91e' },
  { key: 'lit', name: '문학', jamo: 'ㅇ', color: '#2f6fde' },
  { key: 'gram', name: '문법', jamo: 'ㅗ', color: '#1f9e6e' },
  { key: 'write', name: '작문', jamo: 'ㄴ', color: '#8a56e2' },
] as const;

const BAR_H = [16, 11, 14, 8, 12];

export function Mark({ scale = 1, live }: { scale?: number; live?: boolean }) {
  return (
    <span className={'mark' + (live ? ' is-live' : '')} style={{ ['--s' as string]: scale }} aria-hidden="true">
      {AREAS.map((a, i) => (
        <i key={a.key} style={{ height: BAR_H[i] * scale, background: a.color, ['--i' as string]: i }} />
      ))}
    </span>
  );
}

export function Brand({ name, compact }: { name: string; compact?: boolean }) {
  return (
    <span className={'brand' + (compact ? ' brand-compact' : '')}>
      <Mark scale={compact ? 1 : 1.15} live />
      <span className="brand-name">{name}</span>
    </span>
  );
}

// ── 버튼 ───────────────────────────────────────────────

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'line' | 'ghost' | 'danger' | 'red';
  size?: 'sm' | 'md';
  busy?: boolean;
};

export function Button({ variant = 'line', size = 'md', busy, className = '', children, disabled, ...rest }: BtnProps) {
  return (
    <button type="button" {...rest} disabled={disabled || busy} className={`btn btn-${variant} btn-${size}${busy ? ' is-busy' : ''} ${className}`}>
      {children}
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

/** 고른 칸 뒤로 둥근 표시가 미끄러져 따라가는 선택 버튼 묶음 */
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
}: {
  value: T;
  options: { value: NoInfer<T>; label: ReactNode }[];
  onChange(v: NoInfer<T>): void;
  size?: 'sm' | 'md';
}) {
  const idx = options.findIndex((o) => o.value === value);
  const { box, style } = useSlider(idx, [options.length]);
  return (
    <div className={`seg seg-${size}`} role="radiogroup" ref={box}>
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
    <nav className="tabs" role="tablist" ref={box}>
      <span className="tabs-ink" style={style} aria-hidden="true" />
      {tabs.map((t) => (
        <button key={t.key} data-slot type="button" role="tab" aria-selected={value === t.key} className={value === t.key ? 'is-on' : ''} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

// ── 레이아웃 조각 ──────────────────────────────────────

export function SectionHead({ title, action, count }: { title: string; action?: ReactNode; count?: number }) {
  return (
    <div className="section-head">
      <h2>
        {title}
        {count !== undefined && <span className="count">{count}</span>}
      </h2>
      <span className="section-rule" />
      {action}
    </div>
  );
}

export function PageHead({ title, sub, actions, eyebrow }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
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
      <Mark scale={0.8} />
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function Loading({ label = '불러오는 중' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <Mark scale={1.3} live />
      <span>{label}</span>
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

export function Tag({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'red' | 'green' | 'ink' | 'ochre' | 'moss' | 'mute' | 'blue' | 'purple' }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

// ── 시트(모달): 누른 자리에서 펼쳐지고, 닫을 때 그 자리로 접힌다 ──────

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  width = 560,
  vtName,
}: {
  open: boolean;
  onClose(): void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  vtName?: string;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(open);
  const [closing, setClosing] = useState(false);
  const origin = useRef({ x: lastPointer.x, y: lastPointer.y });

  useEffect(() => {
    if (open) {
      origin.current = { x: lastPointer.x, y: lastPointer.y };
      setShown(true);
      setClosing(false);
    } else if (shown) {
      if (reducedMotion()) {
        setShown(false);
        return;
      }
      setClosing(true);
      const t = setTimeout(() => {
        setShown(false);
        setClosing(false);
      }, 240);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!shown || !panel.current) return;
    const r = panel.current.getBoundingClientRect();
    panel.current.style.transformOrigin = `${origin.current.x - r.left}px ${origin.current.y - r.top}px`;
  }, [shown]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    requestAnimationFrame(() => {
      const first = panel.current?.querySelector<HTMLElement>('input:not([type=checkbox]), textarea, select');
      (first ?? panel.current)?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!shown) return null;
  return createPortal(
    <div className={'sheet-backdrop' + (closing ? ' is-closing' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panel}
        tabIndex={-1}
        style={{ maxWidth: width, viewTransitionName: vtName } as CSSProperties}
      >
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ── 알림·확인 ──────────────────────────────────────────

interface ConfirmOpts {
  title: string;
  body?: ReactNode;
  ok?: string;
  danger?: boolean;
}

interface Feedback {
  toast(msg: string, tone?: 'ok' | 'err'): void;
  confirm(o: ConfirmOpts): Promise<boolean>;
  /** 저장 같은 작업을 실행하고, 성공하면 알림 + 화면 새로고침 */
  run<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined>;
}

const FeedbackCtx = createContext<Feedback>(null!);
export const useUi = () => useContext(FeedbackCtx);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: 'ok' | 'err' }[]>([]);
  const [pending, setPending] = useState<(ConfirmOpts & { resolve(v: boolean): void }) | null>(null);

  const toast = useCallback((msg: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'err' ? 4200 : 2600);
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

  const close = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };

  return (
    <FeedbackCtx.Provider value={{ toast, confirm, run }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <span className="toast-dot" />
            {t.msg}
          </div>
        ))}
      </div>
      <Sheet
        open={!!pending}
        onClose={() => close(false)}
        title={pending?.title}
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              취소
            </Button>
            <Button variant={pending?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {pending?.ok ?? '확인'}
            </Button>
          </>
        }
      >
        {pending?.body && <div className="confirm-body">{pending.body}</div>}
      </Sheet>
    </FeedbackCtx.Provider>
  );
}

// ── 작은 아이콘 (선 하나로 그린 것만) ────────────────────

export function Chevron({ dir = 'right', size = 14 }: { dir?: 'left' | 'right' | 'down' | 'up'; size?: number }) {
  const d = dir === 'left' ? 'M9 3L5 7l4 4' : dir === 'right' ? 'M5 3l4 4-4 4' : dir === 'down' ? 'M3 5l4 4 4-4' : 'M3 9l4-4 4 4';
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" className="chev">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Plus({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** 네 모서리가 바깥으로 벌어지는 '펼치기' 아이콘 */
export function ExpandIcon({ size = 14, collapse }: { size?: number; collapse?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <path
        d={collapse ? 'M5 1v4H1M9 1v4h4M5 13V9H1M9 13V9h4' : 'M1 5V1h4M13 5V1H9M1 9v4h4M13 9v4H9'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
