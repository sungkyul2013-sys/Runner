import { sfx } from '../core/audio';
import { fmt, h, mmss, pct } from '../core/dom';
import { enhance } from '../core/motion';
import { go, type ViewHandle } from '../core/router';
import { accuracy, levelFromXp, rankFor, store } from '../core/store';
import { DOMAINS, DOMAIN_HUE, DOMAIN_LABEL, SKILLS, type Skill } from '../core/types';
import { BADGES } from '../data/badges';
import { QUESTION_BY_ID, QUESTION_COUNT } from '../data/questions';
import { VOCAB } from '../data/vocab';
import {
  bar,
  emptyState,
  heatmap,
  progressRow,
  radar,
  ring,
  sectionHead,
  statCard,
} from '../ui/components';

export function dashboardView(): ViewHandle {
  const el = h('div.wrap.section--tight');
  const p = store.profile;
  const { level, into, need } = levelFromXp(p.xp);

  const totalSeen = DOMAINS.reduce((s, d) => s + p.byDomain[d].seen, 0);
  const totalCorrect = DOMAINS.reduce((s, d) => s + p.byDomain[d].correct, 0);
  const overall = totalSeen ? totalCorrect / totalSeen : 0;

  el.appendChild(
    sectionHead(
      'report',
      '성취 리포트',
      '누적 기록에서 <b>무엇이 실제로 늘고 있는지</b>를 봅니다. 모든 데이터는 이 브라우저에만 저장됩니다.',
    ),
  );

  if (totalSeen === 0) {
    el.appendChild(
      emptyState(
        '📈',
        '아직 기록이 없습니다',
        '진단 평가나 문제 풀이를 한 번만 해도 리포트가 채워집니다.',
        h(
          'div.row',
          { style: { justifyContent: 'center' } },
          h(
            'button.btn.btn--primary',
            {
              onclick: () => {
                sfx.nav();
                go('diagnostic');
              },
            },
            '진단 평가 시작',
          ),
          h(
            'button.btn.btn--ghost',
            {
              onclick: () => {
                sfx.nav();
                go('practice');
              },
            },
            '문제 풀기',
          ),
        ),
      ),
    );
    return { el, title: '성취 리포트' };
  }

  /* ------------------------------ level card ------------------------------ */
  el.appendChild(
    h(
      'div.card',
      { style: { marginBottom: '22px' }, 'data-reveal': '' },
      h(
        'div.spread',
        h(
          'div',
          h('div.eyebrow', { style: { marginBottom: '2px' } }, rankFor(level)),
          h('h3.h1', `레벨 ${level}`),
          h('p.small.muted', { style: { marginTop: '4px' } }, `${fmt(into)} / ${fmt(need)} XP · 누적 ${fmt(p.xp)} XP`),
        ),
        h(
          'div.row',
          h('span.tag', `🔥 ${p.streak}일 연속`),
          h('span.tag', `🪙 ${fmt(p.coins)}`),
          h('span.tag', `🏅 ${p.badges.length}/${BADGES.length}`),
        ),
      ),
      h('div', { style: { marginTop: '16px' } }, bar(need ? into / need : 0)),
    ),
  );

  /* -------------------------------- stats -------------------------------- */
  el.appendChild(
    h(
      'div.stat-grid',
      { style: { marginBottom: '22px' }, 'data-reveal-stagger': '40' },
      statCard(fmt(totalSeen), '푼 문항', `전체 ${QUESTION_COUNT}문항 중`),
      statCard(pct(overall), '누적 정답률'),
      statCard(String(p.bestStreak), '최고 연속일'),
      statCard(`${Math.round(p.minutes)}분`, '기록된 학습 시간'),
      statCard(String(p.wrong.length), '복습 대기'),
      statCard(String(p.srs.filter((c) => c.box >= 5).length), '어휘 졸업', `총 ${VOCAB.length}장`),
    ),
  );

  /* ------------------------------- radar row ------------------------------ */
  const skillValues = SKILLS.map((s) => accuracy(p.bySkill[s]));
  const seenSkills = SKILLS.filter((s) => p.bySkill[s].seen > 0);

  el.appendChild(
    h(
      'div.grid.grid--2',
      { style: { marginBottom: '22px' } },
      h(
        'div.card',
        { 'data-reveal': '' },
        h('h3.h3', { style: { marginBottom: '4px' } }, '역량 균형'),
        h('p.tiny.muted', { style: { marginBottom: '10px' } }, '푼 문항의 정답률을 여섯 역량으로 나눈 그림입니다.'),
        seenSkills.length >= 3
          ? radar(
              SKILLS.map((s) => s),
              [{ values: skillValues }],
              Math.min(340, window.innerWidth - 96),
            )
          : h(
              'p.small.muted',
              { style: { padding: '30px 0', textAlign: 'center' } },
              '역량 그래프는 세 개 이상의 역량을 풀어 본 뒤에 나타납니다.',
            ),
      ),
      h(
        'div.card',
        { 'data-reveal': '' },
        h('h3.h3', { style: { marginBottom: '16px' } }, '영역별 정답률'),
        ...DOMAINS.map((d) =>
          progressRow(
            DOMAIN_LABEL[d],
            accuracy(p.byDomain[d]),
            DOMAIN_HUE[d],
            p.byDomain[d].seen ? `${p.byDomain[d].correct}/${p.byDomain[d].seen}` : '기록 없음',
          ),
        ),
        h('div.divider'),
        h(
          'div.row',
          h(
            'button.btn.btn--ghost.btn--sm',
            {
              onclick: () => {
                const weakest = [...DOMAINS]
                  .filter((d) => p.byDomain[d].seen > 0)
                  .sort((a, b) => accuracy(p.byDomain[a]) - accuracy(p.byDomain[b]))[0];
                sfx.nav();
                go('practice', { domain: weakest });
              },
            },
            '약한 영역 풀러 가기 →',
          ),
        ),
      ),
    ),
  );

  /* ------------------------------- topics -------------------------------- */
  const topicRows = Object.entries(p.byTopic)
    .filter(([, t]) => t.seen >= 2)
    .sort((a, b) => accuracy(a[1]) - accuracy(b[1]));

  if (topicRows.length) {
    el.appendChild(
      h(
        'div.grid.grid--2',
        { style: { marginBottom: '22px' } },
        h(
          'div.card',
          { 'data-reveal': '' },
          h('h3.h3', { style: { marginBottom: '4px' } }, '보완이 필요한 유형'),
          h('p.tiny.muted', { style: { marginBottom: '14px' } }, '두 번 이상 만난 유형 중 정답률이 낮은 순서입니다.'),
          ...topicRows.slice(0, 6).map(([topic, t]) =>
            progressRow(topic, accuracy(t), 355, `${t.correct}/${t.seen}`),
          ),
        ),
        h(
          'div.card',
          { 'data-reveal': '' },
          h('h3.h3', { style: { marginBottom: '4px' } }, '자신 있는 유형'),
          h('p.tiny.muted', { style: { marginBottom: '14px' } }, '이 유형은 유지만 해도 충분합니다.'),
          ...[...topicRows]
            .reverse()
            .slice(0, 6)
            .map(([topic, t]) => progressRow(topic, accuracy(t), 155, `${t.correct}/${t.seen}`)),
        ),
      ),
    );
  }

  /* -------------------------------- streak -------------------------------- */
  el.appendChild(
    h(
      'div.card',
      { style: { marginBottom: '22px' }, 'data-reveal': '' },
      h(
        'div.spread',
        { style: { marginBottom: '14px' } },
        h('h3.h3', '학습 달력'),
        h('span.tag', `총 ${p.studyDates.length}일 학습`),
      ),
      heatmap(p.studyDates),
    ),
  );

  /* ------------------------------- recent --------------------------------- */
  const recent = [...p.attempts].reverse().slice(0, 12);
  if (recent.length) {
    el.appendChild(
      h(
        'div.card',
        { style: { marginBottom: '22px' }, 'data-reveal': '' },
        h('h3.h3', { style: { marginBottom: '14px' } }, '최근 푼 문항'),
        h(
          'div.stack',
          { style: { gap: '7px' } },
          ...recent.map((a) => {
            const q = QUESTION_BY_ID.get(a.qid);
            return h(
              'div.card.card--flat.card--pad-s',
              h(
                'div.spread',
                h(
                  'div',
                  { style: { minWidth: '0' } },
                  h('div.small', { style: { fontWeight: '600' } }, `${DOMAIN_LABEL[a.domain]} · ${a.topic}`),
                  h(
                    'div.tiny.muted',
                    `${q ? `난이도 ${'★'.repeat(q.level)} · ` : ''}${mmss(a.ms / 1000)} · ${new Date(a.at).toLocaleString('ko-KR')}`,
                  ),
                ),
                h('span.tag', { style: { color: a.correct ? 'var(--ok)' : 'var(--bad)' } }, a.correct ? '정답' : '오답'),
              ),
            );
          }),
        ),
      ),
    );
  }

  /* -------------------------------- badges --------------------------------- */
  el.appendChild(
    h(
      'div.card',
      { style: { marginBottom: '22px' }, 'data-reveal': '' },
      h(
        'div.spread',
        { style: { marginBottom: '16px' } },
        h('h3.h3', '뱃지'),
        h(
          'div.row',
          ring(p.badges.length / BADGES.length, `${p.badges.length}`),
        ),
      ),
      h(
        'div.grid',
        { style: { gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' } },
        ...BADGES.map((b) => {
          const owned = p.badges.includes(b.id);
          return h(
            'div.card.card--flat.card--pad-s',
            {
              style: {
                textAlign: 'center',
                opacity: owned ? '1' : '0.4',
                filter: owned ? 'none' : 'grayscale(1)',
              },
            },
            h('div', { style: { fontSize: '1.6rem' } }, b.icon),
            h('div.small', { style: { fontWeight: '650', marginTop: '4px' } }, b.name),
            h('div.tiny.muted', b.desc),
          );
        }),
      ),
    ),
  );

  /* ------------------------------ diagnostics ------------------------------ */
  if (p.diagnostics.length >= 2) {
    const first = p.diagnostics[0];
    const last = p.diagnostics[p.diagnostics.length - 1];
    const delta = (s: Skill) => {
      const a = first.bySkill[s];
      const b = last.bySkill[s];
      const av = a.seen ? a.correct / a.seen : 0;
      const bv = b.seen ? b.correct / b.seen : 0;
      return bv - av;
    };
    el.appendChild(
      h(
        'div.card',
        { 'data-reveal': '' },
        h('h3.h3', { style: { marginBottom: '4px' } }, '첫 진단 대비 변화'),
        h(
          'p.tiny.muted',
          { style: { marginBottom: '16px' } },
          `${new Date(first.at).toLocaleDateString('ko-KR')} → ${new Date(last.at).toLocaleDateString('ko-KR')}`,
        ),
        h(
          'div.stack',
          { style: { gap: '10px' } },
          ...SKILLS.map((s) => {
            const d = delta(s);
            return h(
              'div.spread',
              h('span.small', s),
              h(
                'span.small',
                { style: { fontWeight: '700', color: d > 0 ? 'var(--ok)' : d < 0 ? 'var(--bad)' : 'var(--ink-3)' } },
                `${d > 0 ? '▲' : d < 0 ? '▼' : '—'} ${Math.abs(Math.round(d * 100))}%p`,
              ),
            );
          }),
        ),
      ),
    );
  }

  return {
    el,
    title: '성취 리포트',
    mounted() {
      enhance(el);
    },
  };
}
