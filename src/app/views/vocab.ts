import { sfx } from '../core/audio';
import { h, shuffle } from '../core/dom';
import { burstFrom, enhance } from '../core/motion';
import { type ViewHandle } from '../core/router';
import { questProgress, store, touchStreak } from '../core/store';
import type { VocabEntry } from '../core/types';
import { VOCAB, VOCAB_BY_ID, VOCAB_KINDS } from '../data/vocab';
import { bar, chipRow, emptyState, sectionHead, statCard, toast } from '../ui/components';

/**
 * Leitner boxes: 0 → today, 1 → +1d, 2 → +3d, 3 → +7d, 4 → +16d, 5 = 졸업.
 * Getting one wrong drops it two boxes (never below 0).
 */
const INTERVALS = [0, 1, 3, 7, 16, 40];
const DAY = 86400000;

function dueCards(): VocabEntry[] {
  const now = Date.now();
  const known = new Map(store.profile.srs.map((c) => [c.id, c]));
  const due: VocabEntry[] = [];
  for (const v of VOCAB) {
    const card = known.get(v.id);
    if (!card) continue;
    if (card.box >= 5) continue;
    if (card.due <= now) due.push(v);
  }
  return due;
}

function newCards(kind: string, limit: number): VocabEntry[] {
  const known = new Set(store.profile.srs.map((c) => c.id));
  return VOCAB.filter((v) => !known.has(v.id) && (kind === 'all' || v.kind === kind)).slice(0, limit);
}

export function vocabView(): ViewHandle {
  const el = h('div.wrap.section--tight');
  const body = h('div');
  el.appendChild(body);

  let kind = 'all';

  function renderHome(): void {
    body.replaceChildren();
    const p = store.profile;
    const due = dueCards();
    const learned = p.srs.length;
    const graduated = p.srs.filter((c) => c.box >= 5).length;

    body.appendChild(
      sectionHead(
        'vocabulary',
        '어휘 트레이너',
        '카드를 뒤집어 아는지 확인하고, <b>간격 반복</b>으로 다시 만납니다. 틀린 카드는 더 자주 돌아옵니다.',
      ),
    );

    body.appendChild(
      h(
        'div.grid.grid--4',
        { style: { marginBottom: '22px' }, 'data-reveal-stagger': '50' },
        statCard(String(VOCAB.length), '전체 카드'),
        statCard(String(learned), '학습 시작'),
        statCard(String(due.length), '오늘 복습'),
        statCard(String(graduated), '졸업'),
      ),
    );

    body.appendChild(
      h(
        'div.card',
        { style: { marginBottom: '20px' } },
        h('div.small', { style: { fontWeight: '700', marginBottom: '10px' } }, '갈래'),
        chipRow(
          [{ value: 'all', label: '전체' }, ...VOCAB_KINDS.map((k) => ({ value: k, label: k }))],
          kind,
          (v) => {
            kind = v;
            renderHome();
          },
          true,
        ),
        h('div.divider'),
        h(
          'div.row',
          h(
            'button.btn.btn--primary',
            {
              disabled: due.length === 0,
              'data-magnetic': '',
              onclick: () => {
                sfx.nav();
                startSession(shuffle(due).slice(0, 20), 'review');
              },
            },
            due.length ? `오늘 복습 ${due.length}장` : '복습할 카드 없음',
          ),
          h(
            'button.btn.btn--ghost',
            {
              onclick: () => {
                const fresh = newCards(kind, 10);
                if (!fresh.length) {
                  toast('이 갈래는 모두 학습을 시작했습니다', '✅');
                  return;
                }
                sfx.nav();
                startSession(fresh, 'new');
              },
            },
            '새 카드 10장',
          ),
          h(
            'button.btn.btn--ghost',
            {
              onclick: () => {
                sfx.nav();
                startSession(shuffle(VOCAB.filter((v) => kind === 'all' || v.kind === kind)).slice(0, 15), 'free');
              },
            },
            '자유 훑어보기',
          ),
        ),
      ),
    );

    // Box distribution.
    const boxes = [0, 1, 2, 3, 4, 5].map((b) => p.srs.filter((c) => c.box === b).length);
    body.appendChild(
      h(
        'div.card',
        { style: { marginBottom: '20px' }, 'data-reveal': '' },
        h('h3.h3', { style: { marginBottom: '14px' } }, '기억 상자'),
        h(
          'div.grid',
          { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '10px' } },
          ...boxes.map((count, i) =>
            h(
              'div.card.card--flat.card--pad-s',
              { style: { textAlign: 'center' } },
              h('div.tiny.muted', i === 5 ? '졸업' : `${INTERVALS[i]}일`),
              h('div', { style: { fontSize: '1.3rem', fontWeight: '750' } }, String(count)),
              h('div.tiny.muted', i === 5 ? '' : `상자 ${i}`),
            ),
          ),
        ),
        h('div', { style: { marginTop: '14px' } }, bar(learned ? graduated / VOCAB.length : 0)),
        h('p.tiny.muted', { style: { marginTop: '8px' } }, `전체 진도 ${Math.round((graduated / VOCAB.length) * 100)}%`),
      ),
    );

    // Browse list.
    const listed = VOCAB.filter((v) => kind === 'all' || v.kind === kind);
    body.appendChild(
      h(
        'div.card',
        h('h3.h3', { style: { marginBottom: '14px' } }, `카드 목록 (${listed.length})`),
        h(
          'div.grid',
          { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' } },
          ...listed.map((v) => {
            const card = store.profile.srs.find((c) => c.id === v.id);
            return h(
              'details.card.card--flat.card--pad-s',
              h(
                'summary',
                { style: { cursor: 'pointer', listStyle: 'none' } },
                h(
                  'div.spread',
                  h(
                    'div',
                    h('b', v.word),
                    v.hanja ? h('span.tiny.muted', ` ${v.hanja}`) : null,
                  ),
                  h('span.tag', card ? (card.box >= 5 ? '졸업' : `상자 ${card.box}`) : v.kind),
                ),
              ),
              h('p.small', { style: { marginTop: '10px' } }, v.meaning),
              h('p.tiny.muted', { style: { marginTop: '6px' } }, `예) ${v.example}`),
            );
          }),
        ),
      ),
    );

    enhance(body);
  }

  /* ----------------------------- session ----------------------------- */
  function startSession(cards: VocabEntry[], mode: 'new' | 'review' | 'free'): void {
    if (!cards.length) {
      body.replaceChildren(emptyState('💠', '카드가 없습니다', '다른 갈래를 골라 보세요.'));
      return;
    }
    let i = 0;
    let known = 0;

    const stage = h('div', { style: { maxWidth: '620px', marginInline: 'auto' } });
    body.replaceChildren(stage);

    const renderCard = () => {
      if (i >= cards.length) {
        finish();
        return;
      }
      const v = cards[i];
      stage.replaceChildren();

      stage.appendChild(
        h(
          'div.spread',
          { style: { marginBottom: '14px' } },
          h('span.small.muted', `${i + 1} / ${cards.length}`),
          h(
            'button.btn.btn--ghost.btn--sm',
            {
              onclick: () => {
                sfx.tap();
                renderHome();
              },
            },
            '나가기',
          ),
        ),
      );
      stage.appendChild(h('div.quiz__bar', h('i', { style: { width: `${(i / cards.length) * 100}%` } })));

      const flip = h(
        'div.flip',
        { style: { marginTop: '18px' } },
        h(
          'div.flip__in',
          h(
            'div.flip__face',
            h('span.tag', v.kind),
            h('div', { style: { fontSize: 'clamp(2rem, 7vw, 3.2rem)', fontWeight: '750', letterSpacing: '-0.03em' } }, v.word),
            v.hanja ? h('div.muted', { style: { fontSize: '1.1rem' } }, v.hanja) : null,
            h('p.tiny.muted', { style: { marginTop: '10px' } }, '카드를 눌러 뜻 확인'),
          ),
          h(
            'div.flip__face.flip__face--back',
            h('span.tag', v.kind),
            h('div', { style: { fontSize: '1.35rem', fontWeight: '700', marginTop: '6px' } }, v.word),
            h('p', { style: { marginTop: '8px', lineHeight: '1.7' } }, v.meaning),
            h('p.small.muted', { style: { marginTop: '12px' } }, `예) ${v.example}`),
          ),
        ),
      );
      flip.addEventListener('click', () => {
        flip.classList.toggle('is-flipped');
        sfx.flip();
        answerRow.style.opacity = '1';
        answerRow.style.pointerEvents = 'auto';
      });
      stage.appendChild(flip);

      const answerRow = h(
        'div.row',
        {
          style: {
            marginTop: '20px',
            justifyContent: 'center',
            opacity: '0',
            pointerEvents: 'none',
            transition: 'opacity .3s',
          },
        },
        h(
          'button.btn.btn--ghost.btn--lg',
          {
            onclick: (e: MouseEvent) => {
              grade(v, false);
              sfx.wrong();
              void e;
              i += 1;
              renderCard();
            },
          },
          '아직 모르겠어요',
        ),
        h(
          'button.btn.btn--primary.btn--lg',
          {
            onclick: (e: MouseEvent) => {
              grade(v, true);
              known += 1;
              sfx.correct();
              burstFrom(e.currentTarget as HTMLElement, 42);
              i += 1;
              renderCard();
            },
          },
          '알아요 ✓',
        ),
      );
      stage.appendChild(answerRow);
      stage.appendChild(
        h(
          'p.tiny.muted.center',
          { style: { marginTop: '14px' } },
          '카드를 뒤집은 뒤 스스로 채점하세요. 정직할수록 복습 간격이 정확해집니다.',
        ),
      );
    };

    const grade = (v: VocabEntry, ok: boolean) => {
      if (mode === 'free') return;
      store.update((p) => {
        let card = p.srs.find((c) => c.id === v.id);
        if (!card) {
          card = { id: v.id, box: 0, due: Date.now(), lapses: 0 };
          p.srs.push(card);
        }
        if (ok) card.box = Math.min(5, card.box + 1);
        else {
          card.box = Math.max(0, card.box - 2);
          card.lapses += 1;
        }
        card.due = Date.now() + INTERVALS[Math.min(card.box, INTERVALS.length - 1)] * DAY;
        p.xp += ok ? 5 : 2;
        touchStreak(p);
      });
      questProgress('vocab', 1);
    };

    const finish = () => {
      sfx.done();
      stage.replaceChildren(
        h(
          'div.card',
          { style: { textAlign: 'center' } },
          h('div', { style: { fontSize: '2.4rem' } }, '💠'),
          h('h2.h1', { style: { marginTop: '8px' } }, `${known} / ${cards.length}`),
          h(
            'p.lede',
            { style: { marginInline: 'auto', marginTop: '8px' } },
            mode === 'free'
              ? '훑어보기를 마쳤습니다.'
              : '모르겠다고 답한 카드는 곧 다시 나타납니다. 상자가 올라갈수록 간격이 길어집니다.',
          ),
          h(
            'div.row',
            { style: { justifyContent: 'center', marginTop: '22px' } },
            h(
              'button.btn.btn--primary',
              {
                onclick: () => {
                  sfx.tap();
                  renderHome();
                },
              },
              '어휘 홈으로',
            ),
            h(
              'button.btn.btn--ghost',
              {
                onclick: () => {
                  const more = dueCards();
                  if (more.length) startSession(shuffle(more).slice(0, 20), 'review');
                  else {
                    const fresh = newCards(kind, 10);
                    if (fresh.length) startSession(fresh, 'new');
                    else toast('오늘 학습할 카드를 모두 마쳤습니다', '🎉');
                  }
                },
              },
              '이어서 더',
            ),
          ),
        ),
      );
      enhance(stage);
    };

    renderCard();
  }

  renderHome();
  return { el, title: '어휘 트레이너' };
}

export const VOCAB_LOOKUP = VOCAB_BY_ID;
