import type { ReactNode } from 'react';
import type { StudentBook, Textbook } from '../../shared/types';
import { dotDate } from '../../shared/date';

export function BookCover({ book, size = 'md' }: { book: Pick<Textbook, 'title' | 'publisher' | 'color'>; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`cover cover-${size}`} style={{ ['--bc' as string]: book.color }} aria-hidden="true">
      <span className="cover-title">{book.title}</span>
      <span className="cover-pub">{book.publisher}</span>
    </span>
  );
}

/** 자 모양 진도 표시: 칸마다 눈금, 지나온 곳은 먹색 */
export function ProgressRuler({ value, total, label = '강' }: { value: number; total: number; label?: string }) {
  if (!total) {
    return (
      <div className="ruler-text">
        <b>{value}</b>
        {label}까지
      </div>
    );
  }
  const pct = Math.min(100, Math.round((value / total) * 100));
  const ticks = total <= 60 ? total : 0;
  return (
    <div className="ruler" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} aria-label={`${total}${label} 중 ${value}${label}`}>
      <div className="ruler-track">
        <span className="ruler-fill" style={{ width: pct + '%' }} />
        {ticks > 0 &&
          Array.from({ length: ticks - 1 }, (_, i) => (
            <span key={i} className={'ruler-tick' + ((i + 1) % 5 === 0 ? ' major' : '')} style={{ left: `${((i + 1) / total) * 100}%` }} />
          ))}
      </div>
      <div className="ruler-label">
        <span>
          <b>{value}</b> / {total}
          {label}
        </span>
        <span className="pct">{pct}%</span>
      </div>
    </div>
  );
}

const STATUS_LABEL = { current: '진행 중', planned: '예정', done: '완료' } as const;

export function BookCard({ sb, children, compact }: { sb: StudentBook; children?: ReactNode; compact?: boolean }) {
  const t = sb.textbook;
  const last = sb.logs[0];
  return (
    <article className={'book-card' + (compact ? ' is-compact' : '') + ` is-${sb.status}`}>
      <BookCover book={t} size={compact ? 'sm' : 'md'} />
      <div className="book-body">
        <div className="book-top">
          <span className="book-cat">
            {t.category} · {STATUS_LABEL[sb.status]}
          </span>
          <h3 className="book-title">{t.title}</h3>
          <span className="book-pub">{t.publisher}</span>
        </div>
        {sb.status !== 'planned' && <ProgressRuler value={sb.progress} total={t.totalUnits} label={t.unitLabel} />}
        {sb.note && (
          <p className="book-note">
            <span className="book-note-k">{sb.status === 'planned' ? '메모' : '최근 진도'}</span>
            {last && sb.status !== 'planned' && <span className="book-note-d">{dotDate(last.date, false)}</span>}
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
