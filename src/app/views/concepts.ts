import { sfx } from '../core/audio';
import { h } from '../core/dom';
import { enhance } from '../core/motion';
import { go, replace, type ViewHandle } from '../core/router';
import { DOMAIN_HUE, DOMAIN_ICON, DOMAIN_LABEL, type Domain } from '../core/types';
import { CONCEPTS } from '../data/concepts';
import { chipRow, emptyState, sectionHead } from '../ui/components';

export function conceptsView(params: URLSearchParams): ViewHandle {
  const el = h('div.wrap.section--tight');
  const body = h('div');
  el.appendChild(body);

  let domain = (params.get('domain') ?? 'all') as Domain | 'all';
  let query = '';

  const domains = [...new Set(CONCEPTS.map((c) => c.domain))];

  function render(): void {
    body.replaceChildren();

    body.appendChild(
      sectionHead(
        'concepts',
        '개념 사전',
        '개념 하나에 <b>요지 · 핵심 정리 · 예시 · 함정</b>이 함께 붙어 있습니다. 시험에서 걸리는 지점부터 확인하세요.',
      ),
    );

    const filters = h('div.card', { style: { marginBottom: '22px' } });
    filters.appendChild(
      chipRow(
        [
          { value: 'all', label: `전체 ${CONCEPTS.length}` },
          ...domains.map((d) => ({
            value: d,
            label: `${DOMAIN_ICON[d]} ${DOMAIN_LABEL[d]} ${CONCEPTS.filter((c) => c.domain === d).length}`,
          })),
        ],
        domain,
        (v) => {
          domain = v as Domain | 'all';
          replace('concepts', { domain: domain === 'all' ? undefined : domain });
          render();
        },
        true,
      ),
    );
    const search = h('input.input', {
      type: 'search',
      placeholder: '개념 검색 (예: 사동, 반어, 소실점)',
      value: query,
      style: { marginTop: '14px' },
      oninput: (e: Event) => {
        query = (e.target as HTMLInputElement).value;
        renderList();
      },
    }) as HTMLInputElement;
    filters.appendChild(search);
    body.appendChild(filters);

    const listWrap = h('div');
    body.appendChild(listWrap);

    function renderList(): void {
      const q = query.trim().toLowerCase();
      const items = CONCEPTS.filter((c) => {
        if (domain !== 'all' && c.domain !== domain) return false;
        if (!q) return true;
        const hay = [c.title, c.summary, c.group, ...c.points, ...c.examples, c.trap ?? ''].join(' ').toLowerCase();
        return hay.includes(q);
      });

      listWrap.replaceChildren();

      if (!items.length) {
        listWrap.appendChild(emptyState('🔍', '검색 결과가 없습니다', '다른 낱말로 찾아보세요.'));
        return;
      }

      // Group by `group` within the current filter.
      const groups = new Map<string, typeof items>();
      for (const c of items) {
        const arr = groups.get(c.group) ?? [];
        arr.push(c);
        groups.set(c.group, arr);
      }

      for (const [groupName, group] of groups) {
        listWrap.appendChild(
          h(
            'div',
            { style: { marginBottom: '30px' } },
            h(
              'div.row',
              { style: { marginBottom: '14px' } },
              h('h3.h2', groupName),
              h('span.tag', `${group.length}개`),
            ),
            h(
              'div.grid.grid--2',
              { 'data-reveal-stagger': '60' },
              ...group.map((c) =>
                h(
                  'div.card',
                  { 'data-reveal': '', 'data-tilt': '5', style: `--h:${DOMAIN_HUE[c.domain]}` },
                  h(
                    'div.row',
                    { style: { marginBottom: '10px' } },
                    h('span.tag.tag--h', { style: `--h:${DOMAIN_HUE[c.domain]}` }, DOMAIN_LABEL[c.domain]),
                  ),
                  h('h4.h3', { style: { marginBottom: '8px' } }, c.title),
                  h('p.small.muted', { style: { marginBottom: '16px' } }, c.summary),
                  h('ul.list-check', ...c.points.map((pt) => h('li', { html: pt }))),
                  h(
                    'div',
                    { style: { marginTop: '16px' } },
                    h('div.tiny', { style: { fontWeight: '700', marginBottom: '6px' } }, '예시'),
                    ...c.examples.map((ex) =>
                      h(
                        'div.small.muted',
                        { style: { lineHeight: '1.7' }, html: `· ${ex}` },
                      ),
                    ),
                  ),
                  c.trap
                    ? h(
                        'div',
                        {
                          style: {
                            marginTop: '16px',
                            padding: '13px 15px',
                            borderRadius: '14px',
                            background: 'color-mix(in oklab, var(--warn) 12%, transparent)',
                            borderLeft: '3px solid var(--warn)',
                          },
                        },
                        h('div.tiny', { style: { fontWeight: '700', marginBottom: '4px' } }, '⚠️ 시험 함정'),
                        h('div.small', { style: { lineHeight: '1.7' }, html: c.trap }),
                      )
                    : null,
                  h(
                    'div.row',
                    { style: { marginTop: '18px' } },
                    h(
                      'button.btn.btn--ghost.btn--sm',
                      {
                        onclick: () => {
                          sfx.nav();
                          go('practice', { domain: c.domain, start: '1' });
                        },
                      },
                      `${DOMAIN_LABEL[c.domain]} 문제로 확인하기 →`,
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      }
      enhance(listWrap);
    }

    renderList();
    enhance(body);
  }

  render();
  return { el, title: '개념 사전' };
}
