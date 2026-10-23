import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { invalidate } from '../lib/hooks';

// ── 낙관(도장) 로고 ─────────────────────────────────────

export function Seal({ size = 34, text = '라온' }: { size?: number; text?: string }) {
  const [a, b] = [text.slice(0, 1), text.slice(1, 2)];
  return (
    <svg className="seal" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="5" fill="var(--seal)" />
      <rect x="4.2" y="4.2" width="31.6" height="31.6" rx="2.5" fill="none" stroke="var(--seal-ink)" strokeWidth="1" opacity=".9" />
      <text x="20" y="18.6" textAnchor="middle" className="seal-char">
        {a}
      </text>
      <text x="20" y="32.4" textAnchor="middle" className="seal-char">
        {b}
      </text>
    </svg>
  );
}

export function Brand({ name, compact }: { name: string; compact?: boolean }) {
  return (
    <span className={'brand' + (compact ? ' brand-compact' : '')}>
      <Seal size={compact ? 28 : 34} text={name.slice(0, 2)} />
      <span className="brand-name">{name}</span>
    </span>
  );
}

// ── 버튼 ───────────────────────────────────────────────

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'line' | 'ghost' | 'danger' | 'seal';
  size?: 'sm' | 'md';
  busy?: boolean;
};

export function Button({ variant = 'line', size = 'md', busy, className = '', children, disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={`btn btn-${variant} btn-${size}${busy ? ' is-busy' : ''} ${className}`}
    >
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
  return (
    <div className={`seg seg-${size}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
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
        <h1>{title}</h1>
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

export function Loading({ label = '불러오는 중' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="loading-line" />
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

export function Tag({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'seal' | 'ink' | 'ochre' | 'moss' | 'mute' }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

// ── 시트(모달) ─────────────────────────────────────────

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  width = 560,
}: {
  open: boolean;
  onClose(): void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    requestAnimationFrame(() => {
      const first = panel.current?.querySelector<HTMLElement>('input, textarea, select');
      (first ?? panel.current)?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel} tabIndex={-1} style={{ maxWidth: width }}>
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.4" />
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

export function Chevron({ dir = 'right', size = 14 }: { dir?: 'left' | 'right' | 'down'; size?: number }) {
  const d = dir === 'left' ? 'M9 3L5 7l4 4' : dir === 'right' ? 'M5 3l4 4-4 4' : 'M3 5l4 4 4-4';
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" className="chev">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function Plus({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
