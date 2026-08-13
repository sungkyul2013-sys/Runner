import { sfx } from '../core/audio';
import { clamp, h, mmss } from '../core/dom';
import { burstFrom, enhance } from '../core/motion';
import { type ViewHandle } from '../core/router';
import { addMinutes, store } from '../core/store';
import type { EssayDraft } from '../core/types';
import { RUBRIC, WRITING_PROMPTS, type WritingPrompt } from '../data/writingPrompts';
import { CONCEPTS } from '../data/concepts';
import { bar, confirmDialog, emptyState, sectionHead, statCard, toast } from '../ui/components';

/** Rough but useful checks the learner can run on their own draft. */
interface StyleIssue {
  kind: string;
  hint: string;
  hits: string[];
}

const DOUBLE_PASSIVE = /(되어[지진]|되어질|보여지|쓰여지|잊혀지|불려지|모여지|나뉘어지|밝혀지어)/g;
const REDUNDANT: [RegExp, string][] = [
  [/앞으로의?\s*미래/g, '‘앞으로’와 ‘미래’가 겹칩니다'],
  [/미리\s*사전에|사전에\s*미리/g, '‘미리’와 ‘사전에’가 겹칩니다'],
  [/역전\s*앞/g, '‘역전’에 이미 ‘앞’의 뜻이 있습니다'],
  [/다시\s*재/g, '‘다시’와 ‘재-’가 겹칩니다'],
  [/과반수\s*이상/g, '‘과반수’에 이미 ‘이상’의 뜻이 있습니다'],
  [/스스로\s*자각/g, '‘자각’에 이미 ‘스스로’의 뜻이 있습니다'],
];
const HEDGES = /(인\s*것\s*같다|라고\s*할\s*수\s*있다|것으로\s*보여진다|듯\s*싶다|아닐까\s*싶다)/g;

function analyze(text: string): { chars: number; sentences: number; avgLen: number; issues: StyleIssue[] } {
  const clean = text.trim();
  const chars = clean.replace(/\s/g, '').length;
  const sentenceList = clean.split(/(?<=[.!?。])\s+|\n+/).filter((s) => s.trim().length > 1);
  const sentences = sentenceList.length;
  const avgLen = sentences ? Math.round(clean.replace(/\s/g, '').length / sentences) : 0;

  const issues: StyleIssue[] = [];

  const dp = clean.match(DOUBLE_PASSIVE);
  if (dp?.length) {
    issues.push({
      kind: '이중 피동',
      hint: '피동 접미사와 ‘-어지다’가 겹쳤습니다. ‘예상되어진다 → 예상된다’처럼 하나만 남기세요.',
      hits: [...new Set(dp)],
    });
  }

  for (const [re, hint] of REDUNDANT) {
    const m = clean.match(re);
    if (m?.length) issues.push({ kind: '겹말', hint, hits: [...new Set(m)] });
  }

  const hedge = clean.match(HEDGES);
  if (hedge && hedge.length >= 2) {
    issues.push({
      kind: '모호한 서술',
      hint: '추측 표현이 반복되면 주장이 약해 보입니다. 근거가 있는 문장은 단정해서 쓰세요.',
      hits: [...new Set(hedge)],
    });
  }

  const longOnes = sentenceList.filter((s) => s.replace(/\s/g, '').length > 90);
  if (longOnes.length) {
    issues.push({
      kind: '긴 문장',
      hint: '90자를 넘는 문장은 두 문장으로 나누는 편이 읽기 쉽습니다.',
      hits: longOnes.map((s) => `${s.slice(0, 24)}…`),
    });
  }

  const vagueRefs = clean.match(/(이것|그것|이러한 것|그런 것)/g);
  if (vagueRefs && vagueRefs.length >= 4) {
    issues.push({
      kind: '지시어 과다',
      hint: '지시어가 많으면 무엇을 가리키는지 흐려집니다. 핵심 명사로 바꿔 보세요.',
      hits: [...new Set(vagueRefs)],
    });
  }

  return { chars, sentences, avgLen, issues };
}

export function writingView(): ViewHandle {
  const el = h('div.wrap.section--tight');
  const body = h('div');
  el.appendChild(body);
  let autosave: number | null = null;

  function renderHome(): void {
    if (autosave) window.clearInterval(autosave);
    autosave = null;
    body.replaceChildren();

    const drafts = store.profile.essays;

    body.appendChild(
      sectionHead(
        'writing studio',
        '논술 훈련실',
        '개요 → 초고 → 점검의 순서를 강제합니다. 문장 점검기는 <b>이중 피동 · 겹말 · 긴 문장</b>을 자동으로 잡아 줍니다.',
      ),
    );

    body.appendChild(
      h(
        'div.grid.grid--4',
        { style: { marginBottom: '24px' }, 'data-reveal-stagger': '50' },
        statCard(String(drafts.length), '저장한 글'),
        statCard(String(drafts.reduce((s, d) => s + d.body.replace(/\s/g, '').length, 0)), '누적 글자'),
        statCard(String(WRITING_PROMPTS.length), '논제'),
        statCard(String(RUBRIC.length), '평가 항목'),
      ),
    );

    body.appendChild(
      h(
        'div.grid.grid--2',
        { 'data-reveal-stagger': '60' },
        ...WRITING_PROMPTS.map((p) => {
          const existing = drafts.find((d) => d.promptId === p.id);
          return h(
            'div.card',
            { 'data-reveal': '', 'data-tilt': '5' },
            h(
              'div.spread',
              { style: { marginBottom: '10px' } },
              h('span.tag', p.type),
              h('span.tiny.muted', `${p.minChars}~${p.maxChars}자 · ${p.minutes}분`),
            ),
            h('h3.h3', { style: { marginBottom: '8px' } }, p.title),
            h('p.small.muted', { style: { marginBottom: '16px', lineHeight: '1.75' } }, p.question),
            h(
              'div.row',
              h(
                'button.btn.btn--primary.btn--sm',
                {
                  onclick: () => {
                    sfx.nav();
                    openEditor(p);
                  },
                },
                existing ? '이어 쓰기' : '쓰기 시작',
              ),
              existing
                ? h(
                    'span.tag',
                    `${existing.body.replace(/\s/g, '').length}자 · ${new Date(existing.updatedAt).toLocaleDateString('ko-KR')}`,
                  )
                : null,
            ),
          );
        }),
      ),
    );

    const styleCard = CONCEPTS.find((c) => c.id === 'c-essay-style');
    if (styleCard) {
      body.appendChild(
        h(
          'div.card.card--flat',
          { style: { marginTop: '24px' } },
          h('h3.h3', { style: { marginBottom: '10px' } }, styleCard.title),
          h('ul.list-check', ...styleCard.points.map((pt) => h('li', pt))),
        ),
      );
    }

    if (drafts.length) {
      body.appendChild(
        h(
          'div.card',
          { style: { marginTop: '24px' } },
          h('h3.h3', { style: { marginBottom: '14px' } }, '내 글 보관함'),
          h(
            'div.stack',
            { style: { gap: '8px' } },
            ...[...drafts].reverse().map((d) => {
              const prompt = WRITING_PROMPTS.find((p) => p.id === d.promptId);
              return h(
                'div.card.card--flat.card--pad-s',
                h(
                  'div.spread',
                  h(
                    'div',
                    h('div.small', { style: { fontWeight: '650' } }, d.title || prompt?.title || '제목 없음'),
                    h(
                      'div.tiny.muted',
                      `${d.body.replace(/\s/g, '').length}자 · ${new Date(d.updatedAt).toLocaleString('ko-KR')}`,
                    ),
                  ),
                  h(
                    'div.row',
                    prompt
                      ? h(
                          'button.btn.btn--ghost.btn--sm',
                          {
                            onclick: () => {
                              sfx.tap();
                              openEditor(prompt);
                            },
                          },
                          '열기',
                        )
                      : null,
                    h(
                      'button.icon-btn',
                      {
                        title: '삭제',
                        onclick: () =>
                          confirmDialog('이 글을 삭제할까요?', '되돌릴 수 없습니다.', () => {
                            store.update((p) => {
                              p.essays = p.essays.filter((x) => x.id !== d.id);
                            });
                            renderHome();
                          }, '삭제'),
                      },
                      '🗑',
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      );
    }

    enhance(body);
  }

  /* ------------------------------ editor ------------------------------ */
  function openEditor(prompt: WritingPrompt): void {
    body.replaceChildren();
    const startedAt = Date.now();

    const existing = store.profile.essays.find((d) => d.promptId === prompt.id);
    const draft: EssayDraft = existing ?? {
      id: `e-${Date.now().toString(36)}`,
      promptId: prompt.id,
      title: '',
      outline: '',
      body: '',
      updatedAt: Date.now(),
      rubric: Object.fromEntries(RUBRIC.map((r) => [r.id, 0])),
    };

    const counter = h('span.small.muted');
    const timeLabel = h('span.small.muted');
    const analysisBox = h('div');

    const titleInput = h('input.input', {
      type: 'text',
      placeholder: '제목 (선택)',
      value: draft.title,
      oninput: (e: Event) => {
        draft.title = (e.target as HTMLInputElement).value;
      },
    }) as HTMLInputElement;

    const outlineArea = h('textarea.textarea.textarea--mono', {
      placeholder:
        '개요를 먼저 적습니다.\n\n주장:\n근거 1:\n근거 2:\n예상 반론:\n재반박:\n결론:',
      style: { minHeight: '190px' },
      oninput: (e: Event) => {
        draft.outline = (e.target as HTMLTextAreaElement).value;
      },
    }) as HTMLTextAreaElement;
    outlineArea.value = draft.outline;

    const bodyArea = h('textarea.textarea', {
      placeholder: '여기에 초고를 씁니다.',
      style: { minHeight: '360px' },
      oninput: () => {
        draft.body = bodyArea.value;
        updateMeta();
      },
    }) as HTMLTextAreaElement;
    bodyArea.value = draft.body;

    function updateMeta(): void {
      const chars = bodyArea.value.replace(/\s/g, '').length;
      const withinRange = chars >= prompt.minChars && chars <= prompt.maxChars;
      counter.textContent = `${chars}자 / 목표 ${prompt.minChars}~${prompt.maxChars}자`;
      counter.style.color = withinRange ? 'var(--ok)' : chars > prompt.maxChars ? 'var(--bad)' : 'var(--ink-3)';
      lengthBar.replaceChildren(bar(clamp(chars / prompt.maxChars, 0, 1)));
    }

    const lengthBar = h('div', { style: { marginTop: '8px' } });

    const rubricWrap = h('div.stack');
    function renderRubric(): void {
      rubricWrap.replaceChildren();
      for (const r of RUBRIC) {
        const score = draft.rubric[r.id] ?? 0;
        rubricWrap.appendChild(
          h(
            'div',
            h(
              'div.spread',
              { style: { marginBottom: '4px' } },
              h(
                'div',
                h('span.small', { style: { fontWeight: '650' } }, r.label),
                h('span.tiny.muted', ` · ${r.desc}`),
              ),
              h('span.small', { style: { fontWeight: '700' } }, `${score}/4`),
            ),
            h(
              'div.chips',
              ...[0, 1, 2, 3, 4].map((n) =>
                h(
                  `button.chip${score === n ? '.is-on' : ''}`,
                  {
                    style: { minWidth: '38px', justifyContent: 'center' },
                    onclick: () => {
                      sfx.tap();
                      draft.rubric[r.id] = n;
                      renderRubric();
                    },
                  },
                  String(n),
                ),
              ),
            ),
          ),
        );
      }
    }
    renderRubric();

    function runAnalysis(): void {
      const a = analyze(bodyArea.value);
      analysisBox.replaceChildren(
        h(
          'div.grid.grid--3',
          { style: { marginBottom: '16px' } },
          statCard(String(a.chars), '글자 수(공백 제외)'),
          statCard(String(a.sentences), '문장 수'),
          statCard(`${a.avgLen}자`, '문장 평균 길이'),
        ),
        a.issues.length
          ? h(
              'div.stack',
              ...a.issues.map((iss) =>
                h(
                  'div.card.card--flat.card--pad-s',
                  { style: { borderLeft: '3px solid var(--warn)' } },
                  h('div.small', { style: { fontWeight: '700', marginBottom: '4px' } }, `⚠️ ${iss.kind}`),
                  h('div.small.muted', { style: { marginBottom: '6px', lineHeight: '1.7' } }, iss.hint),
                  h('div.tiny.muted', `발견: ${iss.hits.slice(0, 5).join(' · ')}`),
                ),
              ),
            )
          : h(
              'div.card.card--flat.card--pad-s',
              { style: { borderLeft: '3px solid var(--ok)' } },
              h('div.small', { style: { fontWeight: '700', color: 'var(--ok)' } }, '✓ 자동 점검에서 걸리는 표현이 없습니다'),
              h('div.tiny.muted', '이중 피동 · 겹말 · 모호한 서술 · 긴 문장 · 지시어 과다를 검사했습니다.'),
            ),
      );
      enhance(analysisBox);
    }

    function save(silent = false): void {
      draft.body = bodyArea.value;
      draft.outline = outlineArea.value;
      draft.title = titleInput.value;
      draft.updatedAt = Date.now();
      store.update((p) => {
        const idx = p.essays.findIndex((d) => d.id === draft.id);
        if (idx >= 0) p.essays[idx] = draft;
        else p.essays.push(draft);
      });
      if (!silent) toast('저장했습니다', '💾', 1500);
    }

    body.appendChild(
      h(
        'div.spread',
        { style: { marginBottom: '16px' } },
        h(
          'div',
          h('span.tag', prompt.type),
          h('h2.h2', { style: { marginTop: '8px' } }, prompt.title),
        ),
        h(
          'div.row',
          timeLabel,
          h(
            'button.btn.btn--ghost.btn--sm',
            {
              onclick: () => {
                save();
                sfx.tap();
                renderHome();
              },
            },
            '저장하고 나가기',
          ),
        ),
      ),
    );

    body.appendChild(
      h(
        'div.card',
        { style: { marginBottom: '18px', borderLeft: '3px solid var(--a1)' } },
        h('p', { style: { lineHeight: '1.8' } }, prompt.question),
        ...(prompt.sources ?? []).map((s) =>
          h(
            'div',
            { style: { marginTop: '14px' } },
            h('div.tiny', { style: { fontWeight: '700', marginBottom: '5px' } }, s.label),
            h('div.q-boxed', s.text),
          ),
        ),
      ),
    );

    body.appendChild(
      h(
        'div.grid',
        { style: { gridTemplateColumns: '1fr', gap: '16px', alignItems: 'start' } },
        h(
          'div',
          h(
            'div.card',
            { style: { marginBottom: '18px' } },
            h('h3.h3', { style: { marginBottom: '10px' } }, '1. 개요'),
            h('p.tiny.muted', { style: { marginBottom: '10px' } }, '개요 없이 본문을 쓰면 결론에서 길을 잃습니다.'),
            outlineArea,
          ),
          h(
            'div.card',
            h(
              'div.spread',
              { style: { marginBottom: '10px' } },
              h('h3.h3', '2. 본문'),
              counter,
            ),
            titleInput,
            h('div', { style: { height: '10px' } }),
            bodyArea,
            lengthBar,
            h(
              'div.row',
              { style: { marginTop: '14px' } },
              h(
                'button.btn.btn--primary',
                {
                  onclick: (e: MouseEvent) => {
                    save();
                    runAnalysis();
                    addMinutes(Math.max(1, Math.round((Date.now() - startedAt) / 60000)));
                    sfx.done();
                    burstFrom(e.currentTarget as HTMLElement, 336);
                  },
                },
                '저장하고 점검하기',
              ),
              h(
                'button.btn.btn--ghost',
                {
                  onclick: () => {
                    runAnalysis();
                    sfx.tap();
                  },
                },
                '문장 점검만',
              ),
            ),
          ),
        ),
        h(
          'div',
          h(
            'div.card',
            { style: { marginBottom: '18px' } },
            h('h3.h3', { style: { marginBottom: '12px' } }, '3. 점검 체크리스트'),
            h(
              'div.stack',
              { style: { gap: '9px' } },
              ...prompt.checklist.map((c) =>
                h(
                  'label.switch',
                  { style: { alignItems: 'flex-start' } },
                  h('input', { type: 'checkbox' }),
                  h('span.small', { style: { lineHeight: '1.6' } }, c),
                ),
              ),
            ),
          ),
          h(
            'div.card',
            { style: { marginBottom: '18px' } },
            h('h3.h3', { style: { marginBottom: '4px' } }, '4. 루브릭 자기 평가'),
            h('p.tiny.muted', { style: { marginBottom: '14px' } }, '0 = 미흡, 4 = 우수. 정직하게 매길수록 다음 글이 좋아집니다.'),
            rubricWrap,
          ),
          h('div.card', h('h3.h3', { style: { marginBottom: '12px' } }, '문장 점검 결과'), analysisBox),
        ),
      ),
    );

    updateMeta();
    runAnalysis();

    // Autosave every 20 seconds, plus a live elapsed clock.
    autosave = window.setInterval(() => {
      save(true);
      timeLabel.textContent = `작성 ${mmss((Date.now() - startedAt) / 1000)}`;
    }, 20000);
    timeLabel.textContent = '작성 00:00';

    enhance(body);
  }

  if (!WRITING_PROMPTS.length) body.appendChild(emptyState('✍️', '논제가 없습니다', '데이터를 확인해 주세요.'));
  else renderHome();

  return {
    el,
    title: '논술 훈련실',
    destroy() {
      if (autosave) window.clearInterval(autosave);
    },
  };
}
