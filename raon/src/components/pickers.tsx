import { useMemo, useState } from 'react';
import type { GroupSlot, StudentBrief } from '../../shared/types';
import { WEEKDAYS } from '../../shared/date';
import { Button, Plus } from './ui';

export const COLORS = ['#2B3F5C', '#B23A26', '#56684A', '#A87B2C', '#6E4A5E', '#2F6466', '#9A5B2E', '#59606B', '#6F6A35', '#A35D5D'];

export function ColorPicker({ value, onChange }: { value: string; onChange(c: string): void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="색">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value.toUpperCase() === c}
          aria-label={c}
          className={'swatch' + (value.toUpperCase() === c ? ' is-on' : '')}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export function StudentPicker({
  students,
  value,
  onChange,
  max = 260,
}: {
  students: (StudentBrief & { groups?: { name: string }[] })[];
  value: number[];
  onChange(ids: number[]): void;
  max?: number;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const t = q.trim();
    if (!t) return students;
    return students.filter((s) => s.name.includes(t) || s.school.includes(t) || s.grade.includes(t) || s.groups?.some((g) => g.name.includes(t)));
  }, [q, students]);
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="picker">
      <div className="picker-top">
        <input placeholder="이름·학교·반으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="picker-count">{value.length}명 선택</span>
      </div>
      <div className="picker-list" style={{ maxHeight: max }}>
        {list.map((s) => (
          <label key={s.id} className={'pick' + (value.includes(s.id) ? ' is-on' : '')}>
            <input type="checkbox" checked={value.includes(s.id)} onChange={() => toggle(s.id)} />
            <span className="pick-name">{s.name}</span>
            <span className="pick-meta">{[s.school, s.grade].filter(Boolean).join(' ')}</span>
          </label>
        ))}
        {!list.length && <p className="fine">찾는 학생이 없습니다.</p>}
      </div>
    </div>
  );
}

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function SlotEditor({ slots, onChange }: { slots: GroupSlot[]; onChange(s: GroupSlot[]): void }) {
  const set = (i: number, patch: Partial<GroupSlot>) => onChange(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="slots">
      {slots.map((s, i) => (
        <div className="slot-row" key={i}>
          <div className="slot-days">
            {ORDER.map((w) => (
              <button key={w} type="button" className={'day-chip' + (s.weekday === w ? ' is-on' : '') + (w === 0 ? ' sun' : w === 6 ? ' sat' : '')} onClick={() => set(i, { weekday: w })}>
                {WEEKDAYS[w]}
              </button>
            ))}
          </div>
          <div className="slot-times">
            <input type="time" value={s.start} onChange={(e) => set(i, { start: e.target.value })} aria-label="시작" />
            <span>–</span>
            <input type="time" value={s.end} onChange={(e) => set(i, { end: e.target.value })} aria-label="끝" />
            <button type="button" className="link danger" onClick={() => onChange(slots.filter((_, j) => j !== i))}>
              빼기
            </button>
          </div>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange([...slots, { weekday: slots.at(-1)?.weekday === 1 ? 3 : 1, start: slots.at(-1)?.start ?? '19:00', end: slots.at(-1)?.end ?? '21:00' }])}>
        <Plus /> 요일 추가
      </Button>
    </div>
  );
}

export function slotText(slots: GroupSlot[]): string {
  // 같은 시간대는 요일을 묶어서: 월·수 19:00–21:00
  const by = new Map<string, number[]>();
  for (const s of slots) {
    const k = `${s.start}–${s.end}`;
    by.set(k, [...(by.get(k) ?? []), s.weekday]);
  }
  return [...by.entries()]
    .map(([t, ws]) => `${ws.sort((a, b) => (a || 7) - (b || 7)).map((w) => WEEKDAYS[w]).join('·')} ${t}`)
    .join(', ');
}
