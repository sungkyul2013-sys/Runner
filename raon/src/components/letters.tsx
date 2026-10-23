import { useEffect, useState, type ReactNode } from 'react';
import type { Feedback } from '../../shared/types';
import { dotDate, md } from '../../shared/date';

function dateOf(f: Feedback) {
  return f.classDate ?? f.createdAt.slice(0, 10);
}

export function readStamp(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 편지처럼 보이는 피드백 */
export function Letter({
  f,
  salutation,
  onOpen,
  defaultOpen,
  actions,
}: {
  f: Feedback;
  salutation?: string;
  onOpen?: () => void;
  defaultOpen?: boolean;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const unread = !f.readAt && f.readers === undefined;
  useEffect(() => {
    // 처음부터 펼쳐 보여 준 글은 읽은 것으로 표시
    if (defaultOpen) onOpen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggle = () => {
    if (!open) onOpen?.();
    setOpen(!open);
  };
  return (
    <article className={'letter' + (open ? ' is-open' : '') + (unread ? ' is-unread' : '')}>
      <button type="button" className="letter-head" onClick={toggle} aria-expanded={open}>
        <span className="letter-date">
          <span className="d">{md(dateOf(f))}</span>
          <span className="c">{f.category}</span>
        </span>
        <span className="letter-title">
          {unread && <span className="new">새 글</span>}
          {f.title || firstLine(f.body)}
        </span>
        {!open && <span className="letter-preview">{preview(f.body)}</span>}
      </button>
      {open && (
        <div className="letter-body">
          {salutation && <p className="letter-salute">{salutation}</p>}
          <div className="letter-text">{f.body}</div>
          <p className="letter-sign">
            {dotDate(dateOf(f))} · {f.authorName} 선생님
          </p>
          {actions}
        </div>
      )}
    </article>
  );
}

function firstLine(s: string) {
  const l = s.split('\n')[0];
  return l.length > 34 ? l.slice(0, 34) + '…' : l;
}

function preview(s: string) {
  const t = s.replace(/\s+/g, ' ');
  return t.length > 90 ? t.slice(0, 90) + '…' : t;
}
