import { useEffect, useState, type ReactNode } from 'react';
import type { Feedback } from '../../shared/types';
import { dotDate, md } from '../../shared/date';
import { reducedMotion, vt } from '../lib/motion';
import { Envelope } from './depth';

function dateOf(f: Feedback) {
  return f.classDate ?? f.createdAt.slice(0, 10);
}

export function readStamp(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 선생님 편지. 안 읽은 글은 봉투가 닫혀 있고, 누르면 봉투가 열리며 편지가 펼쳐진다.
 */
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
  const [opening, setOpening] = useState(false);
  const unread = !f.readAt && f.readers === undefined;
  const sealed = unread && !open && !opening;

  useEffect(() => {
    // 처음부터 펼쳐 보여 준 글은 읽은 것으로 표시
    if (defaultOpen) onOpen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    if (open) {
      vt(() => setOpen(false), 'fold');
      return;
    }
    onOpen?.();
    if (sealed && !reducedMotion()) {
      // 봉투 덮개가 열리는 걸 보여 준 뒤 편지를 펼친다
      setOpening(true);
      window.setTimeout(() => {
        vt(() => {
          setOpen(true);
          setOpening(false);
        }, 'unfold');
      }, 420);
      return;
    }
    vt(() => setOpen(true), 'unfold');
  };

  return (
    <article className={'letter' + (open ? ' is-open' : '') + (unread ? ' is-unread' : '')} style={{ viewTransitionName: `letter-${f.id}` }}>
      <button type="button" className="letter-head" onClick={toggle} aria-expanded={open}>
        <span className="letter-env">
          <Envelope open={open || opening || !unread} sealed={sealed} />
        </span>
        <span className="letter-main">
          <span className="letter-date">
            <span className="d">{md(dateOf(f))}</span>
            <span className="c">{f.category}</span>
            {unread && <span className="new">새 글</span>}
          </span>
          <span className="letter-title">{f.title || firstLine(f.body)}</span>
          {!open && <span className="letter-preview">{preview(f.body)}</span>}
        </span>
      </button>
      {open && (
        <div className="letter-body">
          {salutation && <p className="letter-salute">{salutation}</p>}
          <div className="letter-text">{f.body}</div>
          <p className="letter-sign">
            <span className="d">{dotDate(dateOf(f))}</span>
            <span className="pen">{f.authorName} 선생님</span>
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
