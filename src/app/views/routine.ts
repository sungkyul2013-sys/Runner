import { sfx } from '../core/audio';
import { clamp, h } from '../core/dom';
import { burstFrom, enhance } from '../core/motion';
import { go, type ViewHandle } from '../core/router';
import { store, todayISO } from '../core/store';
import { DOMAINS, DOMAIN_HUE, DOMAIN_ICON, DOMAIN_LABEL, type Domain } from '../core/types';
import { GOAL_PRESETS, WEEKDAY_LABEL, buildRoutine, routineTotals, weakestDomains } from '../data/routineBuilder';
import { bar, confirmDialog, emptyState, heatmap, sectionHead, statCard, toast } from '../ui/components';

export function routineView(params: URLSearchParams): ViewHandle {
  const el = h('div.wrap.section--tight');
  const body = h('div');
  el.appendChild(body);

  const cameFromDiagnostic = params.get('from') === 'diagnostic';

  /* ------------------------------ wizard ------------------------------ */
  function renderWizard(): void {
    body.replaceChildren();

    const suggested = weakestDomains(store.profile).slice(0, 3);
    let presetId = cameFromDiagnostic ? 'balance' : 'suneung';
    let minutes = 45;
    let days = [1, 2, 3, 4, 5];
    let focus: Domain[] = [...suggested];
    let goalText = '';

    body.appendChild(
      sectionHead(
        'routine',
        '학습 루틴 설계',
        '목표와 <b>실제로 낼 수 있는 시간</b>을 넣으면, 약점을 먼저 채우는 주간 계획을 만들어 드립니다.',
      ),
    );

    if (cameFromDiagnostic) {
      body.appendChild(
        h(
          'div.card.card--flat',
          { style: { marginBottom: '20px', borderLeft: '3px solid var(--a1)' } },
          h('div.small', { style: { fontWeight: '650' } }, '진단 결과를 반영했습니다'),
          h(
            'div.tiny.muted',
            `약한 순서: ${suggested.map((d) => DOMAIN_LABEL[d]).join(' → ')}`,
          ),
        ),
      );
    }

    /* --- goal --- */
    const goalCard = h('div.card', { style: { marginBottom: '18px' } });
    goalCard.appendChild(h('h3.h3', { style: { marginBottom: '12px' } }, '1. 목표'));
    const goalChips = h('div.chips');
    const renderGoalChips = () => {
      goalChips.replaceChildren();
      for (const g of GOAL_PRESETS) {
        goalChips.appendChild(
          h(
            `button.chip.chip--grad${g.id === presetId ? '.is-on' : ''}`,
            {
              onclick: () => {
                sfx.tap();
                presetId = g.id;
                focus = g.focus.length ? [...g.focus] : [...suggested];
                renderGoalChips();
                renderFocusChips();
              },
            },
            g.label,
          ),
        );
      }
    };
    renderGoalChips();
    goalCard.appendChild(goalChips);
    const goalInput = h('input.input', {
      type: 'text',
      placeholder: '한 줄 목표 (예: 비문학 정답률 80% 만들기)',
      style: { marginTop: '14px' },
      oninput: (e: Event) => {
        goalText = (e.target as HTMLInputElement).value;
      },
    }) as HTMLInputElement;
    goalCard.appendChild(goalInput);
    body.appendChild(goalCard);

    /* --- days --- */
    const daysCard = h('div.card', { style: { marginBottom: '18px' } });
    daysCard.appendChild(h('h3.h3', { style: { marginBottom: '4px' } }, '2. 학습 요일'));
    daysCard.appendChild(
      h('p.tiny.muted', { style: { marginBottom: '12px' } }, '지킬 수 있는 만큼만 고르세요. 빈 날이 있어야 루틴이 오래갑니다.'),
    );
    const dayChips = h('div.chips');
    const renderDayChips = () => {
      dayChips.replaceChildren();
      WEEKDAY_LABEL.forEach((label, i) => {
        dayChips.appendChild(
          h(
            `button.chip${days.includes(i) ? '.is-on' : ''}`,
            {
              onclick: () => {
                sfx.tap();
                days = days.includes(i) ? days.filter((d) => d !== i) : [...days, i];
                renderDayChips();
                renderSummary();
              },
            },
            label,
          ),
        );
      });
    };
    renderDayChips();
    daysCard.appendChild(dayChips);
    body.appendChild(daysCard);

    /* --- minutes --- */
    const minutesCard = h('div.card', { style: { marginBottom: '18px' } });
    const minutesLabel = h('span', { style: { fontWeight: '700' } }, `${minutes}분`);
    minutesCard.appendChild(
      h(
        'div.spread',
        { style: { marginBottom: '10px' } },
        h('h3.h3', '3. 하루 학습 시간'),
        minutesLabel,
      ),
    );
    minutesCard.appendChild(
      h('input', {
        type: 'range',
        min: '15',
        max: '120',
        step: '5',
        value: String(minutes),
        oninput: (e: Event) => {
          minutes = Number((e.target as HTMLInputElement).value);
          minutesLabel.textContent = `${minutes}분`;
          renderSummary();
        },
      }),
    );
    minutesCard.appendChild(
      h('p.tiny.muted', { style: { marginTop: '8px' } }, '30분 이상이면 어휘 블록이, 40분 이상이면 두 번째 영역이 추가됩니다.'),
    );
    body.appendChild(minutesCard);

    /* --- focus --- */
    const focusCard = h('div.card', { style: { marginBottom: '18px' } });
    focusCard.appendChild(h('h3.h3', { style: { marginBottom: '4px' } }, '4. 집중 영역'));
    focusCard.appendChild(
      h('p.tiny.muted', { style: { marginBottom: '12px' } }, '비워 두면 진단·풀이 기록에서 약한 순서로 자동 선택합니다.'),
    );
    const focusChips = h('div.chips');
    const renderFocusChips = () => {
      focusChips.replaceChildren();
      for (const d of DOMAINS) {
        focusChips.appendChild(
          h(
            `button.chip${focus.includes(d) ? '.is-on' : ''}`,
            {
              onclick: () => {
                sfx.tap();
                focus = focus.includes(d) ? focus.filter((x) => x !== d) : [...focus, d];
                renderFocusChips();
                renderSummary();
              },
            },
            `${DOMAIN_ICON[d]} ${DOMAIN_LABEL[d]}`,
          ),
        );
      }
    };
    renderFocusChips();
    focusCard.appendChild(focusChips);
    body.appendChild(focusCard);

    /* --- summary --- */
    const summary = h('div.card');
    body.appendChild(summary);

    function renderSummary(): void {
      const weekly = days.length * minutes;
      summary.replaceChildren(
        h(
          'div.spread',
          h(
            'div',
            h('div', { style: { fontWeight: '700', fontSize: '1.05rem' } }, `주 ${days.length}일 · 하루 ${minutes}분`),
            h('div.tiny.muted', `주간 총 ${weekly}분 (약 ${(weekly / 60).toFixed(1)}시간) · 월 약 ${Math.round((weekly * 4.3) / 60)}시간`),
          ),
          h(
            'button.btn.btn--primary.btn--lg',
            {
              disabled: days.length === 0,
              'data-magnetic': '',
              onclick: () => {
                const chosenPreset = GOAL_PRESETS.find((g) => g.id === presetId) ?? GOAL_PRESETS[0];
                const routine = buildRoutine(
                  {
                    goal: goalText.trim() || chosenPreset.label,
                    targetLabel: chosenPreset.target,
                    minutesPerDay: minutes,
                    activeDays: days,
                    focus,
                  },
                  store.profile,
                );
                store.update((p) => {
                  p.routine = routine;
                  p.xp += 30;
                });
                sfx.levelUp();
                toast('루틴이 만들어졌습니다', '🗓️');
                renderRoutine();
              },
            },
            '루틴 만들기 →',
          ),
        ),
      );
    }
    renderSummary();
    enhance(body);
  }

  /* ------------------------------ routine ----------------------------- */
  function renderRoutine(): void {
    body.replaceChildren();
    const routine = store.profile.routine;
    if (!routine) {
      renderWizard();
      return;
    }

    const totals = routineTotals(routine);
    const todayWeekday = new Date().getDay();
    const todayPlan = routine.days.find((d) => d.weekday === todayWeekday);

    body.appendChild(
      sectionHead('my routine', '나의 학습 루틴', `${routine.targetLabel} · ${routine.goal}`),
    );

    body.appendChild(
      h(
        'div.grid.grid--4',
        { style: { marginBottom: '24px' }, 'data-reveal-stagger': '50' },
        statCard(`${routine.activeDays.length}일`, '주간 학습일'),
        statCard(`${routine.minutesPerDay}분`, '하루 목표'),
        statCard(`${totals.done}/${totals.tasks}`, '이번 주 완료'),
        statCard(`${Math.round(totals.minutes / 60 * 10) / 10}시간`, '주간 계획 시간'),
      ),
    );

    /* today */
    const todayCard = h('div.card', { style: { marginBottom: '24px' }, 'data-reveal': '' });
    todayCard.appendChild(
      h(
        'div.spread',
        { style: { marginBottom: '14px' } },
        h(
          'div',
          h('div.eyebrow', { style: { marginBottom: '4px' } }, 'today'),
          h('h3.h2', `${WEEKDAY_LABEL[todayWeekday]}요일 · 오늘의 학습`),
        ),
        h('span.tag', todayPlan ? `${todayPlan.tasks.filter((t) => t.done).length}/${todayPlan.tasks.length} 완료` : '휴식일'),
      ),
    );

    if (!todayPlan) {
      todayCard.appendChild(
        h(
          'p.small.muted',
          '오늘은 계획된 학습일이 아닙니다. 쉬어 가도 좋고, 아래 주간 계획에서 원하는 블록을 골라 해도 좋습니다.',
        ),
      );
    } else {
      const list = h('div.stack', { style: { gap: '10px' } });
      for (const task of todayPlan.tasks) {
        const row = h(
          'div.card.card--flat.card--pad-s',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              opacity: task.done ? '0.55' : '1',
              transition: 'opacity .3s',
            },
          },
          h(
            'button',
            {
              style: {
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                flexShrink: '0',
                border: `2px solid ${task.done ? 'transparent' : 'var(--line-2)'}`,
                background: task.done ? 'var(--grad)' : 'transparent',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontSize: '0.7rem',
              },
              onclick: (e: MouseEvent) => {
                store.update((p) => {
                  const t = p.routine?.days
                    .find((d) => d.weekday === todayWeekday)
                    ?.tasks.find((x) => x.id === task.id);
                  if (t) t.done = !t.done;
                  const iso = todayISO();
                  const doneCount =
                    p.routine?.days.find((d) => d.weekday === todayWeekday)?.tasks.filter((x) => x.done).length ?? 0;
                  if (p.routine) p.routine.history[iso] = doneCount;
                });
                if (!task.done) {
                  sfx.correct();
                  burstFrom(e.currentTarget as HTMLElement, DOMAIN_HUE[task.domain]);
                } else {
                  sfx.tap();
                }
                renderRoutine();
              },
            },
            task.done ? '✓' : '',
          ),
          h(
            'div',
            { style: { flex: '1', minWidth: '0' } },
            h(
              'div.small',
              { style: { fontWeight: '650', textDecoration: task.done ? 'line-through' : 'none' } },
              task.label,
            ),
            h('div.tiny.muted', `${DOMAIN_LABEL[task.domain]} · ${task.minutes}분`),
          ),
          task.href
            ? h(
                'button.btn.btn--ghost.btn--sm',
                {
                  onclick: () => {
                    sfx.nav();
                    location.hash = task.href as string;
                  },
                },
                '이동',
              )
            : null,
        );
        list.appendChild(row);
      }
      todayCard.appendChild(list);

      const doneRatio = todayPlan.tasks.filter((t) => t.done).length / todayPlan.tasks.length;
      todayCard.appendChild(h('div', { style: { marginTop: '16px' } }, bar(doneRatio)));
      if (doneRatio === 1) {
        todayCard.appendChild(
          h('p.small', { style: { marginTop: '12px', color: 'var(--ok)', fontWeight: '650' } }, '오늘 몫을 다 했습니다. 내일 또 만나요.'),
        );
      }
    }
    body.appendChild(todayCard);

    /* week */
    body.appendChild(
      h(
        'div.card',
        { style: { marginBottom: '24px' }, 'data-reveal': '' },
        h('h3.h3', { style: { marginBottom: '16px' } }, '주간 계획'),
        h(
          'div.grid',
          { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' } },
          ...routine.days.map((day) => {
            const isToday = day.weekday === todayWeekday;
            return h(
              'div.card.card--flat',
              {
                style: {
                  padding: '16px',
                  border: isToday ? '2px solid var(--a1)' : undefined,
                },
              },
              h(
                'div.spread',
                { style: { marginBottom: '10px' } },
                h('b', `${WEEKDAY_LABEL[day.weekday]}요일`),
                h('span.tiny.muted', `${day.tasks.reduce((s, t) => s + t.minutes, 0)}분`),
              ),
              h(
                'div.stack',
                { style: { gap: '7px' } },
                ...day.tasks.map((t) =>
                  h(
                    'div',
                    { style: { display: 'flex', gap: '8px', alignItems: 'flex-start' } },
                    h('span', { style: { fontSize: '0.8rem' } }, DOMAIN_ICON[t.domain]),
                    h(
                      'div',
                      h('div.tiny', { style: { fontWeight: '600', lineHeight: '1.45' } }, t.label),
                      h('div.tiny.muted', `${t.minutes}분`),
                    ),
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );

    /* streak + heatmap */
    body.appendChild(
      h(
        'div.card',
        { style: { marginBottom: '24px' }, 'data-reveal': '' },
        h(
          'div.spread',
          { style: { marginBottom: '14px' } },
          h('h3.h3', '학습 기록'),
          h('span.tag', `🔥 연속 ${store.profile.streak}일 · 최고 ${store.profile.bestStreak}일`),
        ),
        heatmap(store.profile.studyDates),
        h('p.tiny.muted', { style: { marginTop: '10px' } }, '문제를 풀거나 학습 시간을 기록한 날이 표시됩니다.'),
      ),
    );

    body.appendChild(
      h(
        'div.row',
        h(
          'button.btn.btn--primary',
          {
            onclick: () => {
              sfx.nav();
              const first = todayPlan?.tasks.find((t) => !t.done);
              if (first?.href) location.hash = first.href;
              else go('practice');
            },
          },
          '지금 시작하기 →',
        ),
        h(
          'button.btn.btn--ghost',
          {
            onclick: () => {
              sfx.tap();
              store.update((p) => {
                if (!p.routine) return;
                for (const d of p.routine.days) for (const t of d.tasks) t.done = false;
              });
              toast('이번 주 체크를 초기화했습니다', '🔄');
              renderRoutine();
            },
          },
          '주간 체크 초기화',
        ),
        h(
          'button.btn.btn--ghost',
          {
            onclick: () =>
              confirmDialog('루틴을 다시 만들까요?', '지금 루틴과 이번 주 체크 상태가 사라집니다.', () => {
                store.update((p) => {
                  p.routine = null;
                });
                renderWizard();
              }, '다시 만들기'),
          },
          '루틴 다시 설계',
        ),
      ),
    );

    enhance(body);
  }

  if (store.profile.routine && !cameFromDiagnostic) renderRoutine();
  else if (store.profile.routine && cameFromDiagnostic) renderWizard();
  else renderWizard();

  return { el, title: '학습 루틴' };
}

export const ROUTINE_CLAMP = clamp;
export const ROUTINE_EMPTY = emptyState;
