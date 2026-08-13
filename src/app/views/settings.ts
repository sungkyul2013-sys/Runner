import { sfx } from '../core/audio';
import { fmt, h } from '../core/dom';
import { enhance } from '../core/motion';
import { refresh, type ViewHandle } from '../core/router';
import { applySettings, setSetting, store } from '../core/store';
import { confirmDialog, modal, sectionHead, statCard, toast } from '../ui/components';

export function settingsView(): ViewHandle {
  const el = h('div.wrap.section--tight');
  const body = h('div');
  el.appendChild(body);

  function render(): void {
    body.replaceChildren();
    const s = store.profile.settings;
    const p = store.profile;

    body.appendChild(
      sectionHead('settings', '설정', '보기 방식과 학습 데이터를 관리합니다.'),
    );

    /* --------------------------- profile --------------------------- */
    body.appendChild(
      h(
        'div.card',
        { style: { marginBottom: '18px' } },
        h('h3.h3', { style: { marginBottom: '14px' } }, '학습자 정보'),
        h(
          'div.grid.grid--3',
          h(
            'div.field',
            h('label', '이름 (선택)'),
            h('input.input', {
              type: 'text',
              value: p.name,
              placeholder: '표시용 이름',
              oninput: (e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                store.update((prof) => {
                  prof.name = v;
                });
              },
            }),
          ),
          h(
            'div.field',
            h('label', '학년'),
            h(
              'select.select',
              {
                onchange: (e: Event) => {
                  const v = (e.target as HTMLSelectElement).value;
                  store.update((prof) => {
                    prof.grade = v;
                  });
                },
              },
              ...['', '초 4', '초 5', '초 6', '중 1', '중 2', '중 3', '고 1', '고 2', '고 3', 'N수·기타'].map((g) =>
                h('option', { value: g, selected: g === p.grade }, g || '선택 안 함'),
              ),
            ),
          ),
          h(
            'div.field',
            h('label', '목표'),
            h('input.input', {
              type: 'text',
              value: p.goal,
              placeholder: '예: 수능 국어 1등급',
              oninput: (e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                store.update((prof) => {
                  prof.goal = v;
                });
              },
            }),
          ),
        ),
      ),
    );

    /* ---------------------------- display ---------------------------- */
    body.appendChild(
      h(
        'div.card',
        { style: { marginBottom: '18px' } },
        h('h3.h3', { style: { marginBottom: '16px' } }, '화면'),

        h(
          'div.spread',
          { style: { marginBottom: '18px' } },
          h('div', h('div.small', { style: { fontWeight: '650' } }, '테마'), h('div.tiny.muted', '시스템 설정을 따르거나 직접 고를 수 있습니다.')),
          h(
            'div.seg',
            ...(
              [
                ['system', '시스템'],
                ['light', '밝게'],
                ['dark', '어둡게'],
              ] as const
            ).map(([v, label]) =>
              h(
                'button',
                {
                  class: s.theme === v ? 'is-on' : '',
                  onclick: () => {
                    sfx.tap();
                    setSetting('theme', v);
                    render();
                  },
                },
                label,
              ),
            ),
          ),
        ),

        h(
          'div.spread',
          { style: { marginBottom: '18px' } },
          h(
            'div',
            h('div.small', { style: { fontWeight: '650' } }, '모션'),
            h('div.tiny.muted', '‘줄이기’를 고르면 3D 배경과 등장 애니메이션이 멈춥니다.'),
          ),
          h(
            'div.seg',
            ...(
              [
                ['full', '기본'],
                ['reduced', '줄이기'],
              ] as const
            ).map(([v, label]) =>
              h(
                'button',
                {
                  class: s.motion === v ? 'is-on' : '',
                  onclick: () => {
                    sfx.tap();
                    setSetting('motion', v);
                    render();
                  },
                },
                label,
              ),
            ),
          ),
        ),

        h(
          'div.spread',
          { style: { marginBottom: '18px' } },
          h(
            'div',
            h('div.small', { style: { fontWeight: '650' } }, '3D 품질'),
            h('div.tiny.muted', '기기가 뜨겁거나 배터리가 걱정되면 ‘가볍게’를 고르세요.'),
          ),
          h(
            'div.seg',
            ...(
              [
                ['high', '높게'],
                ['lite', '가볍게'],
              ] as const
            ).map(([v, label]) =>
              h(
                'button',
                {
                  class: s.quality === v ? 'is-on' : '',
                  onclick: () => {
                    sfx.tap();
                    setSetting('quality', v);
                    toast('홈으로 가면 새 품질이 적용됩니다', '🎛️');
                    render();
                  },
                },
                label,
              ),
            ),
          ),
        ),

        h(
          'div',
          { style: { marginBottom: '18px' } },
          h(
            'div.spread',
            { style: { marginBottom: '6px' } },
            h('div.small', { style: { fontWeight: '650' } }, '글자 크기'),
            h('span.small.muted', `${Math.round(s.fontScale * 100)}%`),
          ),
          h('input', {
            type: 'range',
            min: '0.85',
            max: '1.3',
            step: '0.05',
            value: String(s.fontScale),
            oninput: (e: Event) => {
              setSetting('fontScale', Number((e.target as HTMLInputElement).value));
            },
            onchange: () => render(),
          }),
        ),

        h(
          'label.switch',
          h('input', {
            type: 'checkbox',
            checked: s.sound,
            onchange: (e: Event) => {
              setSetting('sound', (e.target as HTMLInputElement).checked);
              if ((e.target as HTMLInputElement).checked) sfx.correct();
            },
          }),
          h(
            'span',
            h('span.small', { style: { fontWeight: '650' } }, '효과음'),
            h('div.tiny.muted', '정답·오답·완료 사운드를 켭니다.'),
          ),
        ),
      ),
    );

    /* ------------------------------ data ------------------------------ */
    body.appendChild(
      h(
        'div.card',
        { style: { marginBottom: '18px' } },
        h('h3.h3', { style: { marginBottom: '6px' } }, '데이터'),
        h(
          'p.small.muted',
          { style: { marginBottom: '16px' } },
          '학습 기록은 이 브라우저의 localStorage에만 저장됩니다. 기기를 바꾸거나 브라우저 데이터를 지우면 사라지므로, 아래에서 내보내 두는 것을 권합니다.',
        ),
        h(
          'div.grid.grid--4',
          { style: { marginBottom: '18px' } },
          statCard(fmt(p.attempts.length), '기록된 풀이'),
          statCard(fmt(p.diagnostics.length), '진단 이력'),
          statCard(fmt(p.essays.length), '저장한 글'),
          statCard(fmt(p.srs.length), '어휘 카드'),
        ),
        h(
          'div.row',
          h(
            'button.btn.btn--ghost',
            {
              onclick: () => {
                const json = JSON.stringify(store.profile, null, 2);
                modal({
                  title: '데이터 내보내기',
                  body: h(
                    'div',
                    h('p.small.muted', { style: { marginBottom: '12px' } }, '아래 내용을 복사해 안전한 곳에 보관하세요.'),
                    h('textarea.textarea.textarea--mono', {
                      readonly: true,
                      style: { minHeight: '260px' },
                      onclick: (e: Event) => (e.target as HTMLTextAreaElement).select(),
                    }, json),
                  ),
                  actions: [
                    {
                      label: '클립보드에 복사',
                      primary: true,
                      onClick: () => {
                        navigator.clipboard
                          ?.writeText(json)
                          .then(() => toast('복사했습니다', '📋'))
                          .catch(() => toast('복사에 실패했습니다. 직접 선택해 주세요', '⚠️'));
                      },
                    },
                  ],
                });
              },
            },
            '내보내기',
          ),
          h(
            'button.btn.btn--ghost',
            {
              onclick: () => {
                const area = h('textarea.textarea.textarea--mono', {
                  placeholder: '내보낸 JSON을 붙여 넣으세요.',
                  style: { minHeight: '220px' },
                }) as HTMLTextAreaElement;
                modal({
                  title: '데이터 가져오기',
                  body: h(
                    'div',
                    h(
                      'p.small.muted',
                      { style: { marginBottom: '12px' } },
                      '현재 기록을 덮어씁니다. 되돌릴 수 없으니 먼저 내보내기를 해 두세요.',
                    ),
                    area,
                  ),
                  actions: [
                    {
                      label: '가져오기',
                      primary: true,
                      onClick: () => {
                        try {
                          const parsed = JSON.parse(area.value);
                          store.import(parsed);
                          applySettings();
                          toast('가져오기를 마쳤습니다', '📥');
                          refresh();
                        } catch {
                          toast('JSON 형식이 올바르지 않습니다', '⚠️');
                          return true;
                        }
                        return undefined;
                      },
                    },
                  ],
                });
              },
            },
            '가져오기',
          ),
          h(
            'button.btn.btn--ghost',
            {
              style: { color: 'var(--bad)' },
              onclick: () =>
                confirmDialog(
                  '모든 학습 기록을 지울까요?',
                  'XP, 정답률, 오답노트, 루틴, 저장한 글이 모두 사라집니다. 되돌릴 수 없습니다.',
                  () => {
                    store.reset();
                    applySettings();
                    toast('초기화했습니다', '🧹');
                    refresh();
                  },
                  '전부 삭제',
                ),
            },
            '전체 초기화',
          ),
        ),
      ),
    );

    /* ------------------------------ about ----------------------------- */
    body.appendChild(
      h(
        'div.card.card--flat',
        h('h3.h3', { style: { marginBottom: '10px' } }, '이 앱에 대하여'),
        h(
          'p.small.muted',
          { style: { lineHeight: '1.85' } },
          '수 국어논술 학습 앱 — 진단부터 루틴, 문제 풀이, 어휘, 논술까지 한 곳에서. ' +
            '서버 없이 브라우저 안에서만 동작하며, 어떤 데이터도 외부로 전송되지 않습니다. ' +
            '문학 지문은 저작권 보호 기간이 끝난 작품만 사용했습니다.',
        ),
        h(
          'div.row',
          { style: { marginTop: '14px' } },
          h('span.tag', '오프라인 동작'),
          h('span.tag', '계정 불필요'),
          h('span.tag', '로컬 저장'),
        ),
      ),
    );

    enhance(body);
  }

  render();
  return { el, title: '설정' };
}
