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

// ── 로고: 원고지 칸에 쓴 학원 이름 ───────────────────────

export function Mark({ text, size = 26 }: { text: string; size?: number }) {
  return (
    <span className="mark" style={{ ['--m' as string]: `${size}px` }} aria-hidden="true">
      {[...text].slice(0, 6).map((ch, i) => (
        <span key={i} className="mark-cell">
          {ch}
        </span>
      ))}
    </span>
  );
}

export function Brand({ name, compact }: { name: string; compact?: boolean }) {
  return (
    <span className={'brand' + (compact ? ' brand-compact' : '')} role="img" aria-label={name}>
      <Mark text={name} size={compact ? 24 : 28} />
    </span>
  );
}

/**
 * 원고지에 옮겨 쓴 문장. 한 칸에 한 글자, 띄어쓰기도 한 칸.
 * 문장 부호 뒤에는 칸을 비우지 않고, 줄 첫 칸에 오는 빈칸은 생략한다.
 */
export function Manuscript({ text, cols, circle }: { text: string; cols: number; circle?: string }) {
  const cells: string[] = [' '];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ' && /[,.]/.test(text[i - 1] ?? '')) continue;
    cells.push(ch);
  }
  const rows: string[][] = [];
  let row: string[] = [];
  for (const c of cells) {
    if (row.length === 0 && c === ' ' && rows.length > 0) continue;
    row.push(c);
    if (row.length === cols) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push([...row, ...Array(cols - row.length).fill(' ')]);
  // 빨간펜 동그라미를 칠 위치 (처음 나오는 곳 한 번)
  let mark: { r: number; c: number; len: number } | null = null;
  for (let ri = 0; circle && ri < rows.length && !mark; ri++) {
    const at = rows[ri].join('').indexOf(circle);
    if (at >= 0) mark = { r: ri, c: at, len: circle.length };
  }
  return (
    <div className="ms" style={{ ['--cols' as string]: cols }} aria-label={text}>
      {rows.map((r, ri) => (
        <div className="ms-row" key={ri}>
          {r.map((ch, ci) => (
            <span key={ci} className="ms-cell">
              {ch.trim()}
            </span>
          ))}
          {mark?.r === ri && (
            <svg
              className="ms-circle"
              style={{ left: `calc(${mark.c} * 100% / ${cols} - 6px)`, width: `calc(${mark.len} * 100% / ${cols} + 12px)` }}
              viewBox="0 0 100 50"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d="M8 27 C 6 9, 40 3, 62 5 C 88 7, 98 18, 94 32 C 89 46, 50 49, 26 45 C 8 42, 3 33, 9 21 C 13 14, 22 10, 30 8" />
            </svg>
          )}
        </div>
      ))}
    </div>
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

export function Tag({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'red' | 'green' | 'ink' | 'ochre' | 'moss' | 'mute' }) {
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
