import { useEffect, useState, type ReactNode } from 'react';
import type { Feedback } from '../../shared/types';
import { dotDate, md } from '../../shared/date';
import { Collapse } from './ui';

function dateOf(f: Feedback) {
  return f.classDate ?? f.createdAt.slice(0, 10);
}

export function readStamp(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 선생님이 보낸 글 한 통. 메일 앱처럼 안 읽은 글엔 파란 점이 있고, 누르면 그 자리에서 펼쳐진다. */
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
        <span className="letter-dot" aria-label={unread ? '안 읽음' : undefined} />
        <span className="letter-main">
          <span className="letter-top">
            <span className="letter-from">{f.authorName} 선생님</span>
            <span className="letter-date">{md(dateOf(f))}</span>
          </span>
          <span className="letter-title">{f.title || firstLine(f.body)}</span>
          <span className="letter-preview">{preview(f.body)}</span>
        </span>
      </button>
      <Collapse open={open}>
        <div className="letter-body">
          {salutation && <p className="letter-salute">{salutation}</p>}
          <div className="letter-text">{f.body}</div>
          <p className="letter-sign">
            {dotDate(dateOf(f))} · {f.category} · {f.authorName} 선생님
          </p>
          {actions}
        </div>
      </Collapse>
    </article>
  );
}

function firstLine(s: string) {
  const l = s.split('\n')[0];
  return l.length > 40 ? l.slice(0, 40) + '…' : l;
}

function preview(s: string) {
  const t = s.replace(/\s+/g, ' ');
  return t.length > 110 ? t.slice(0, 110) + '…' : t;
}
