import type { ReactNode } from 'react';
import type { StudentBook, Textbook } from '../../shared/types';
import { dotDate } from '../../shared/date';

type BookLike = Pick<Textbook, 'title' | 'publisher' | 'color'>;

/** 표지: 교재 색 한 장에 제목만. 그림자도 아주 얕게. */
export function BookCover({ book, size = 'md' }: { book: BookLike; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`cover cover-${size}`} style={{ ['--bc' as string]: book.color }} aria-hidden="true">
      <span className="cover-title">{book.title}</span>
      {size !== 'sm' && <span className="cover-pub">{book.publisher}</span>}
    </span>
  );
}

/** 진도 막대 */
export function ProgressBar({ value, total, label = '강' }: { value: number; total: number; label?: string }) {
  if (!total) {
    return (
      <div className="progress">
        <span className="progress-top">
          <span>
            <b>{value}</b>
            {label}까지
          </span>
        </span>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((value / total) * 100));
  return (
    <div className="progress" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} aria-label={`${total}${label} 중 ${value}${label}`}>
      <span className="progress-top">
        <span>
          <b>{value}</b>
          <span className="of">
            {' '}
            / {total}
            {label}
          </span>
        </span>
        <span className="pct">{pct}%</span>
      </span>
      <span className="progress-track">
        <span className="progress-fill" style={{ ['--w' as string]: pct / 100 }} />
      </span>
    </div>
  );
}

const STATUS_LABEL = { current: '진행 중', planned: '예정', done: '완료' } as const;

export function BookCard({ sb, children, compact }: { sb: StudentBook; children?: ReactNode; compact?: boolean }) {
  const t = sb.textbook;
  const last = sb.logs[0];
  return (
    <article className={'book' + (compact ? ' is-compact' : '') + ` is-${sb.status}`}>
      <BookCover book={t} size={compact ? 'sm' : 'md'} />
      <div className="book-body">
        <p className="book-meta">
          {t.category}
          {sb.status !== 'current' && ` · ${STATUS_LABEL[sb.status]}`}
        </p>
        <h3 className="book-title">{t.title}</h3>
        <p className="book-pub">{t.publisher}</p>
        {sb.status !== 'planned' && <ProgressBar value={sb.progress} total={t.totalUnits} label={t.unitLabel} />}
        {sb.note && (
          <p className="book-note">
            {last && sb.status !== 'planned' && <span className="d">{dotDate(last.date, false)}</span>}
            {sb.note}
          </p>
        )}
        {children}
      </div>
    </article>
  );
}

export function BookLogList({ sb }: { sb: StudentBook }) {
  if (!sb.logs.length) return null;
  return (
    <ol className="book-logs">
      {sb.logs.map((l) => (
        <li key={l.id}>
          <span className="d">{dotDate(l.date)}</span>
          <span className="p">
            {l.progress}
            {sb.textbook.unitLabel}
          </span>
          <span className="n">{l.note}</span>
        </li>
      ))}
    </ol>
  );
}
