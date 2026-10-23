import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { Button, Empty, ErrorNote, Loading, PageHead, SectionHead, useUi } from '../../components/ui';
import { readStamp } from '../../components/letters';
import type { ConsultRequest } from '../../../shared/types';

function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.round(min / 60)}시간 전`;
  if (min < 60 * 24 * 7) return `${Math.round(min / 1440)}일 전`;
  return readStamp(iso).split(' ')[0];
}

function ConsultCard({ c }: { c: ConsultRequest }) {
  const ui = useUi();
  const toggle = () => ui.run(() => api.patch(`/consults/${c.id}`, { status: c.status === 'new' ? 'done' : 'new' }), c.status === 'new' ? '연락 완료로 옮겼습니다.' : '새 신청으로 되돌렸습니다.');
  const remove = async () => {
    const yes = await ui.confirm({ title: `${c.studentName} 상담 신청을 지울까요?`, body: '연락처를 포함한 신청 내용이 모두 지워집니다.', ok: '지우기', danger: true });
    if (yes) await ui.run(() => api.del(`/consults/${c.id}`), '상담 신청을 지웠습니다.');
  };
  return (
    <article className={'consult' + (c.status === 'done' ? ' is-done' : '')} data-tilt="3">
      <header className="consult-head">
        <span className="consult-name">
          {c.status === 'new' && <span className="letter-dot" />}
          <b>{c.studentName}</b>
          <span className="row-light">{c.grade}</span>
        </span>
        <span className="consult-time" title={readStamp(c.createdAt)}>
          {ago(c.createdAt)}
        </span>
      </header>
      <a className="consult-phone" href={`tel:${c.phone}`}>
        {c.phone}
      </a>
      {c.preferredTime && <p className="consult-pref">연락 희망 · {c.preferredTime}</p>}
      {c.message && <p className="consult-msg">{c.message}</p>}
      <footer className="consult-foot">
        {c.status === 'done' && c.handledAt && <span className="fine">{readStamp(c.handledAt)} 연락 완료</span>}
        <span className="consult-actions">
          <button type="button" className="link danger" onClick={remove}>
            지우기
          </button>
          <Button size="sm" variant={c.status === 'new' ? 'primary' : 'secondary'} onClick={toggle}>
            {c.status === 'new' ? '연락 완료' : '되돌리기'}
          </Button>
        </span>
      </footer>
    </article>
  );
}

export function ConsultsPage() {
  const { data, error, reload } = useApi<ConsultRequest[]>('/consults');
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const fresh = data.filter((c) => c.status === 'new');
  const done = data.filter((c) => c.status === 'done');
  return (
    <div className="page">
      <PageHead title="상담 신청" sub="로그인 화면의 ‘상담 신청’으로 들어온 문의입니다. 연락을 마치면 ‘연락 완료’를 눌러 주세요." />
      <section className="block">
        <SectionHead title="새 신청" count={fresh.length} />
        {fresh.length ? (
          <div className="consult-grid">
            {fresh.map((c) => (
              <ConsultCard key={c.id} c={c} />
            ))}
          </div>
        ) : (
          <Empty title="새로 들어온 신청이 없습니다." />
        )}
      </section>
      {done.length > 0 && (
        <section className="block">
          <SectionHead title="연락 완료" count={done.length} />
          <div className="consult-grid">
            {done.map((c) => (
              <ConsultCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
