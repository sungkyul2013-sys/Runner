import type { ReactNode } from 'react';
import type { StudentBook, Textbook } from '../../shared/types';
import { dotDate } from '../../shared/date';
import { Book3D } from './depth';

/** 예전 이름 호환: 표지만 필요할 때도 입체 책으로 그린다 */
export function BookCover({ book, size = 'md', progress }: { book: Pick<Textbook, 'title' | 'publisher' | 'color'> & { totalUnits?: number }; size?: 'sm' | 'md' | 'lg'; progress?: number }) {
  return <Book3D book={book} size={size} progress={progress} />;
}

/** 진도 막대: 지나온 곳은 브랜드 색으로 채우고, 끝에 책갈피 */
export function ProgressRuler({ value, total, label = '강', color }: { value: number; total: number; label?: string; color?: string }) {
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
    <div className="ruler" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} aria-label={`${total}${label} 중 ${value}${label}`} style={{ ['--bc' as string]: color }}>
      <div className="ruler-label">
        <span>
          <b>{value}</b>
          <span className="of">
            {' '}
            / {total}
            {label}
          </span>
        </span>
        <span className="pct">{pct}%</span>
      </div>
      <div className="ruler-track">
        <span className="ruler-fill" style={{ ['--w' as string]: pct / 100 }} />
        {ticks > 0 &&
          Array.from({ length: ticks - 1 }, (_, i) => (
            <span key={i} className={'ruler-tick' + ((i + 1) % 5 === 0 ? ' major' : '')} style={{ left: `${((i + 1) / total) * 100}%` }} />
          ))}
      </div>
    </div>
  );
}

const STATUS_LABEL = { current: '진행 중', planned: '예정', done: '완료' } as const;

export function BookCard({ sb, children, compact }: { sb: StudentBook; children?: ReactNode; compact?: boolean }) {
  const t = sb.textbook;
  const last = sb.logs[0];
  const p = t.totalUnits ? sb.progress / t.totalUnits : 0;
  return (
    <article className={'book-card' + (compact ? ' is-compact' : '') + ` is-${sb.status}`} style={{ ['--bc' as string]: t.color }} data-tilt="4">
      <span className="book-card-stage">
        <Book3D book={t} size={compact ? 'sm' : 'md'} progress={p} />
      </span>
      <div className="book-body">
        <div className="book-top">
          <span className="book-cat">
            <i />
            {t.category} · {STATUS_LABEL[sb.status]}
          </span>
          <h3 className="book-title">{t.title}</h3>
          <span className="book-pub">{t.publisher}</span>
        </div>
        {sb.status !== 'planned' && <ProgressRuler value={sb.progress} total={t.totalUnits} label={t.unitLabel} color={t.color} />}
        {sb.note && (
          <p className="book-note">
            <span className="book-note-k">{sb.status === 'planned' ? '메모' : '최근 진도'}</span>
            {last && sb.status !== 'planned' && <span className="book-note-d">{dotDate(last.date, false)}</span>}
            <span className="book-note-t">{sb.note}</span>
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
      {sb.logs.map((l, i) => (
        <li key={l.id} style={{ ['--i' as string]: i }}>
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
