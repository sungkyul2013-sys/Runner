import { useState } from 'react';
import { api } from '../lib/api';
import { useUi } from './ui';
import type { AttendanceStatus, CalSession, RosterEntry } from '../../shared/types';
import { ATTENDANCE_LABEL } from '../../shared/types';

const ORDER: AttendanceStatus[] = ['present', 'late', 'absent'];

/** 수업 하나의 출석부: 학생마다 출석·지각·결석 */
export function Roster({
  s,
  onChange,
  onMakeup,
}: {
  s: CalSession;
  onChange?(next: CalSession): void;
  onMakeup?(entry: RosterEntry): void;
}) {
  const ui = useUi();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [all, setAll] = useState(false);

  const mark = async (st: RosterEntry, status: AttendanceStatus) => {
    setBusyId(st.id);
    try {
      const next = await api.put<CalSession>('/attendance', {
        date: s.date,
        sessionKey: s.key,
        studentId: st.id,
        status: st.status === status ? null : status,
      });
      onChange?.(next);
    } catch (e: any) {
      ui.toast(e.message, 'err');
    } finally {
      setBusyId(null);
    }
  };

  const markAll = async () => {
    setAll(true);
    try {
      onChange?.(await api.post<CalSession>('/attendance/bulk', { date: s.date, sessionKey: s.key }));
    } catch (e: any) {
      ui.toast(e.message, 'err');
    } finally {
      setAll(false);
    }
  };

  if (s.cancelled) return <p className="fine roster-off">휴강된 수업입니다.</p>;
  if (!s.students.length) return <p className="fine roster-off">{s.allStudents ? '학원 전체 일정입니다.' : '듣는 학생이 없습니다.'}</p>;
  const unmarked = s.students.filter((x) => !x.status).length;

  return (
    <div className="roster">
      <ul>
        {s.students.map((st) => (
          <li key={st.id} className={st.status ? `is-${st.status}` : ''}>
            <span className="roster-name">{st.name}</span>
            <span className="att-buttons" role="group" aria-label={`${st.name} 출결`}>
              {ORDER.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`att att-${o}` + (st.status === o ? ' is-on' : '')}
                  aria-pressed={st.status === o}
                  disabled={busyId === st.id}
                  onClick={() => mark(st, o)}
                >
                  {ATTENDANCE_LABEL[o]}
                </button>
              ))}
            </span>
            {st.status === 'absent' && onMakeup && (
              <span className="roster-makeup">
                {st.makeupEventId ? (
                  <span className="fine">보강 잡힘</span>
                ) : (
                  <button type="button" className="link seal" onClick={() => onMakeup(st)}>
                    보강 잡기
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      {unmarked > 0 && (
        <button type="button" className="link roster-all" onClick={markAll} disabled={all}>
          나머지 {unmarked}명 모두 출석
        </button>
      )}
    </div>
  );
}
