import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { Button, Empty, ErrorNote, Loading, PageHead, Plus, SectionHead, Tag, useUi } from '../../components/ui';
import { SessionLine } from '../../components/schedule';
import { EventSheet, type EventDraft } from './forms';
import { draftFromNeed, draftOf, NeedRow } from './TodayPage';
import { todayIn } from '../../../shared/date';
import type { MakeupNeed, MakeupOverview } from '../../../shared/types';

export function MakeupsPage() {
  const ui = useUi();
  const today = todayIn();
  const { data, error, reload } = useApi<MakeupOverview>('/makeups');
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [showPast, setShowPast] = useState(false);

  const skip = async (n: MakeupNeed) => {
    const yes = await ui.confirm({
      title: '보강 없이 넘길까요?',
      body: `${n.type === 'cancel' ? n.label : `${n.students[0]?.name} · ${n.label} 결석`} 건을 ‘보강 대기’에서 뺍니다.`,
      ok: '보강 안 함',
    });
    if (yes) await ui.run(() => api.post('/makeups/skip', { type: n.type, id: n.id }), '보강 대기에서 뺐습니다.');
  };

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Loading />;

  return (
    <div className="page">
      <PageHead
        title="보강"
        sub="결석하거나 휴강한 수업을 모아 두었습니다. 보강을 잡으면 학생·학부모 달력에 바로 보입니다."
        actions={
          <Button variant="seal" onClick={() => setDraft({ kind: 'makeup', date: today })}>
            <Plus /> 보강 잡기
          </Button>
        }
      />
      <div className="two-col">
        <section className="block">
          <SectionHead title="보강 대기" count={data.pending.length} />
          {data.pending.length ? (
            <div className="needs">
              {data.pending.map((n) => (
                <NeedRow key={n.type + n.id} n={n} onPlan={() => setDraft(draftFromNeed(n, today))} onSkip={() => skip(n)} />
              ))}
            </div>
          ) : (
            <Empty title="밀린 보강이 없습니다.">결석으로 체크하거나 반을 휴강하면 여기에 모입니다.</Empty>
          )}
        </section>
        <section className="block">
          <SectionHead title="예정된 보강" count={data.upcoming.length} />
          {data.upcoming.length ? (
            <div className="slist">
              {data.upcoming.map((s) => (
                <SessionLine key={s.key} s={s} showDate onClick={() => setDraft(draftOf(s))} aside={<StudentsAside names={s.students.map((x) => x.name)} />} />
              ))}
            </div>
          ) : (
            <Empty title="예정된 보강이 없습니다." />
          )}

          <SectionHead
            title="지난 보강"
            count={data.past.length}
            action={
              <button type="button" className="link" onClick={() => setShowPast(!showPast)}>
                {showPast ? '접기' : '펼치기'}
              </button>
            }
          />
          {showPast && (
            <div className="slist">
              {data.past.map((s) => {
                const done = s.students.filter((x) => x.status === 'present' || x.status === 'late').length;
                return (
                  <SessionLine
                    key={s.key}
                    s={s}
                    showDate
                    onClick={() => setDraft(draftOf(s))}
                    aside={done === s.students.length && s.students.length ? <Tag tone="moss">완료</Tag> : <Tag tone="mute">출결 미입력</Tag>}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
      <EventSheet draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}

function StudentsAside({ names }: { names: string[] }) {
  if (names.length <= 2) return <>{names.join(', ')}</>;
  return (
    <>
      {names.slice(0, 2).join(', ')} 외 {names.length - 2}명
    </>
  );
}
