/*
 * ui_guide.js - "아레나 가이드" (arena guide) help screen for the card-battle game.
 *
 * Classic script: no build step, no imports, vanilla DOM. Read-only: the
 * screen shows static help text and never writes to the save profile.
 *
 * Registers:  RA.UI.screens.guide = { render(root) }
 *   The host calls render(root) each time the guide opens. root is an empty
 *   <div>; this file clears it and fills it.
 *
 * Host contract. Every access is optional and guarded, so a missing piece
 * degrades quietly instead of crashing:
 *   RA.UI.showScreen(name)     used by the "돌아가기" button; the target is
 *                              RA.UI.guideBack when set, otherwise 'home'
 *   RA.Audio.play('click')     optional click sound
 *   assets/guide_placement.jpg placement diagram; hidden via onerror if missing
 *
 * Content: part 1 (1-1 ... 1-8) of the arena guide, condensed, plus the
 * exchange cheat sheet from the appendix.
 *
 * Styles live in css/guide.css. All class names are prefixed with .guide-.
 */
(function () {
  'use strict';

  var RA = (window.RA = window.RA || {});
  RA.UI = RA.UI || {};
  RA.UI.screens = RA.UI.screens || {};

  var DIAGRAM_SRC = 'assets/guide_placement.jpg';

  /* ---------- static content ---------- */

  var LEGEND = [
    { mark: '①', name: '4-3 빌딩 타일',
      desc: '강에서 4칸, 옆 벽에서 3칸 떨어진 방어 건물의 표준 자리입니다 (캐논·테슬라·인페르노 타워).' },
    { mark: '②', name: '3-3 빌딩 타일',
      desc: '강에서 3칸 떨어진 자리로, 상대 유닛이 다리를 건너자마자 유인되는 앞쪽 위치입니다.' },
    { mark: '③', name: '중앙 카이팅 타일',
      desc: '킹 타워 앞 중앙(대략 7~10열, 25~26행)입니다. 적을 끌어오면 좌우 프린세스 타워가 동시에 공격합니다.' },
    { mark: '④', name: '킹 타워 뒤 출발 지점',
      desc: '맨 아래 1~2줄입니다. 여기서 내보내면 프린세스 타워까지 걷는 동안 엘릭서가 회복됩니다.' },
    { mark: '⑤', name: '다리',
      desc: '강을 건너는 폭 2타일 통로이며, 좌우에 하나씩 두 개뿐입니다.' }
  ];

  var SECTIONS = [
    { title: '1-1. 아레나 구조: 18 × 32 타일', lines: [
      '가로 18, 세로 32 타일 격자이며, 가운데를 폭 2타일 강이 가로로 흐릅니다.',
      '강을 건너는 길은 좌우 두 개의 폭 2타일 다리뿐입니다.',
      '타워는 양 진영에 킹 타워(4×4) 1개와 프린세스 타워(3×3) 2개, 총 6개입니다.',
      '유닛과 건물은 내 진영에만 놓을 수 있고, 상대 진영에는 스펠만 씁니다.'
    ] },
    { title: '1-2. 배치 시간과 등장 모션', lines: [
      '유닛과 건물은 배치 후 1초 동안 등장 모션을 취하며 공격도 이동도 할 수 없습니다.',
      '엑스보우는 배치에 3.5초가 걸리므로, 그 동안 무방비 상태로 노출됩니다.',
      '스펠은 즉시 발동하지만, 파이어볼처럼 투사체가 날아가는 스펠은 착탄까지 시간이 걸립니다.'
    ] },
    { title: '1-3. 시야와 어그로: 5.5타일의 법칙', lines: [
      '대부분의 유닛은 약 5.5타일 시야에 적 유닛이 들어오면 타워 대신 그 유닛을 공격합니다.',
      '놓는 자리가 이동 경로를 정합니다. 타워 정면에 두면 적을 끌어오고, 옆에 두면 적이 타워를 때립니다.',
      '호그 라이더·자이언트·프린스 등 건물 전용 유닛은 유닛을 무시하고, 캐논 같은 건물은 스스로 쫓아가지 않습니다.'
    ] },
    { title: '1-4. 카이팅과 유인: 시간을 버는 기술', lines: [
      '원거리 유닛을 근접 유닛의 진행 경로에서 살짝 비껴 두면, 접근하는 동안 두세 번 더 때릴 수 있습니다.',
      '탱커를 유인할 때는 진행 방향 정면이 아니라 옆구리에 내려놓아야 타워 쪽으로 돌아가지 못합니다.',
      '타워 앞 중앙에 캐논을 깔면 자이언트를 캐논 쪽으로 돌려 프린세스 타워가 무피해로 정리할 수 있습니다.',
      '적 유닛을 아레나 중앙으로 끌면 좌우 프린세스 타워가 동시에 사거리에 들어와 가장 강력합니다.'
    ] },
    { title: '1-5. 타워 사거리와 타워 타겟팅', lines: [
      '프린세스 타워 사거리는 7.5타일, 킹 타워는 7타일입니다. 프린세스 타워는 사거리 안 적을 자동 공격하고, 킹 타워는 평소 공격하지 않습니다.',
      '킹 타워는 내 프린세스 타워가 하나라도 부서지거나 자신이 공격받으면 활성화되어 사거리 안 적을 공격합니다.',
      '타워는 한 번 잡은 표적을 죽거나 사거리를 벗어날 때까지 공격하므로, 해골 병사로 어그로를 먼저 잡는 운영이 가능합니다.',
      '레벨 11 프린세스 타워는 1발에 약 100 피해를 주며, 해골 병사(81)는 한 발에 죽습니다.'
    ] },
    { title: '1-6. 스펠과 크라운 타워 피해 감소', lines: [
      '모든 공격 스펠은 크라운 타워에 약 27~30% 수준으로 감소된 피해를 줍니다.',
      '예: 파이어볼은 유닛에게 688, 크라운 타워에게 207이고, 라이트닝은 1057 → 286입니다.',
      '스펠의 가치는 유닛과 타워를 동시에 맞히는 각도에서 나오며, 상대 진영에 개입할 수 있는 유일한 수단입니다.'
    ] },
    { title: '1-7. 엘릭서와 교환: 이 게임의 본질', lines: [
      '엘릭서는 5에서 시작해 최대 10까지 모이며, 2.8초마다 1씩 회복됩니다. 2분 뒤에는 더블(1.4초당 1), 4분 뒤에는 트리플(약 0.9초당 1)이 됩니다.',
      '승패는 엘릭서 교환에서 갈립니다. 기사(3)로 미니 P.E.K.K.A(4)를 막으면 +1, 미니 P.E.K.K.A(4)로 메가 나이트(7)를 잡으면 +3입니다.',
      '반대로 파이어볼(4)로 해골 병사 3기(1)를 지우면 −3, 라이트닝(6)으로 단일 유닛(4)만 맞히면 −2입니다.',
      '엘릭서가 10에 가득 차면 회복이 멈추므로, 쓸 카드가 없을 때는 킹 타워 뒤에 느린 유닛을 내 사이클을 돌립니다.'
    ] },
    { title: '1-8. 경기 흐름과 승리 조건', lines: [
      '정규 시간은 4분(엘릭서 2분 + 더블 엘릭서 2분)입니다. 상대보다 타워를 많이 부수면 승리하고, 3개를 모두 부수면 즉시 승리합니다.',
      '정규 시간에 타워 수가 같으면 연장전(서든 데스, 트리플 엘릭서)이 시작되며, 타워가 하나라도 부서지는 순간 부순 쪽이 이깁니다.',
      '연장전에서도 타워가 부서지지 않으면 타이브레이커로 남은 타워 체력이 줄어, 먼저 0이 되는 쪽이 집니다.'
    ] }
  ];

  // Good trades come from the appendix cheat sheet; the two bad trades come
  // from section 1-7 of the guide.
  var CHEAT = [
    { kind: 'good', mine: '잽 (2)', theirs: '해골 군단 (3)', gain: '+1',
      tip: '0.5초 기절 + 16기 중 대부분 정리' },
    { kind: 'good', mine: '해골 병사 (1)', theirs: '프린스 돌진 (5)', gain: '+4',
      tip: '돌진을 해골 하나에 꽂아 취소' },
    { kind: 'good', mine: '캐논 (3)', theirs: '호그 라이더 (4)', gain: '+1',
      tip: '4-3 타일에 깔아 유인' },
    { kind: 'good', mine: '인페르노 타워 (5)', theirs: '메가 나이트 (7)', gain: '+2',
      tip: '스웜·잽으로 어그로가 분산되지 않게 주의' },
    { kind: 'good', mine: '파이어볼 (4)', theirs: '마법사 + 아처 (8)', gain: '+4',
      tip: '반경 2.5 안에 둘 다 들어와야 함' },
    { kind: 'bad', mine: '파이어볼 (4)', theirs: '해골 병사 3기 (1)', gain: '−3',
      tip: '값싼 유닛 여럿을 한 번에 지우는 비효율 교환' },
    { kind: 'bad', mine: '라이트닝 (6)', theirs: '단일 유닛 (4)', gain: '−2',
      tip: '한 대만 맞히면 손해, 여럿이 모인 곳에 쓰기' }
  ];

  /* ---------- per-render state ---------- */

  var zoomEl = null; // current full-screen zoom overlay, if open

  /* ---------- small helpers ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function warn(e) {
    if (window.console) console.warn('[guide]', e);
  }

  function sfx() {
    try {
      if (RA.Audio && typeof RA.Audio.play === 'function') RA.Audio.play('click');
    } catch (e) { warn(e); }
  }

  function closeZoom() {
    if (zoomEl && zoomEl.parentNode) zoomEl.parentNode.removeChild(zoomEl);
    zoomEl = null;
  }

  function openZoom() {
    closeZoom();
    var back = el('div', 'guide-zoom');
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-label', '아레나 배치도 확대');
    var img = el('img', 'guide-zoom-img');
    img.src = DIAGRAM_SRC;
    img.alt = '아레나 배치 기준도 (확대)';
    back.appendChild(img);
    back.appendChild(el('div', 'guide-zoom-hint', '화면을 터치하면 닫힙니다'));
    back.addEventListener('click', closeZoom);
    document.body.appendChild(back);
    zoomEl = back;
  }

  function goBack() {
    sfx();
    closeZoom();
    try {
      if (RA.UI && typeof RA.UI.showScreen === 'function') {
        RA.UI.showScreen(RA.UI.guideBack || 'home');
      }
    } catch (e) { warn(e); }
  }

  function heading(icon, text) {
    var h = el('h2', 'guide-h');
    h.appendChild(el('span', 'guide-h-icon', icon));
    h.appendChild(document.createTextNode(text));
    return h;
  }

  /* ---------- builders ---------- */

  function buildTop() {
    var top = el('div', 'guide-top');
    var back = el('button', 'guide-btn guide-btn-back', '← 돌아가기');
    back.type = 'button';
    back.addEventListener('click', goBack);
    top.appendChild(back);

    var banner = el('div', 'guide-banner');
    banner.appendChild(el('div', 'guide-title', '📘 아레나 가이드'));
    banner.appendChild(el('div', 'guide-sub', '배치 · 공격 · 수비 기초'));
    top.appendChild(banner);
    return top;
  }

  function buildDiagram() {
    var sec = el('section', 'guide-section guide-diagram-sec');
    sec.appendChild(heading('🗺️', '아레나 배치도'));

    var btn = el('button', 'guide-diagram-btn');
    btn.type = 'button';
    btn.setAttribute('aria-label', '배치도 크게 보기');
    var img = el('img', 'guide-diagram');
    img.alt = '아레나 배치 기준도';
    img.onerror = function () { btn.hidden = true; }; // hide quietly if the asset is missing
    img.src = DIAGRAM_SRC;
    btn.appendChild(img);
    btn.addEventListener('click', function () { sfx(); openZoom(); });
    sec.appendChild(btn);

    sec.appendChild(el('p', 'guide-note', '이미지를 누르면 크게 볼 수 있습니다.'));
    return sec;
  }

  function buildLegend() {
    var sec = el('section', 'guide-section');
    sec.appendChild(heading('🔢', '배치도 표시 설명'));
    var ul = el('ul', 'guide-legend');
    LEGEND.forEach(function (item) {
      var li = el('li', 'guide-legend-item');
      li.appendChild(el('span', 'guide-mark', item.mark));
      var txt = el('div', 'guide-legend-text');
      txt.appendChild(el('strong', 'guide-legend-name', item.name));
      txt.appendChild(el('span', 'guide-legend-desc', item.desc));
      li.appendChild(txt);
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    return sec;
  }

  function buildAccordion() {
    var sec = el('section', 'guide-section');
    sec.appendChild(heading('📖', '1부. 아레나 기초'));
    SECTIONS.forEach(function (s, i) {
      var det = el('details', 'guide-acc');
      if (i === 0) det.open = true; // first section starts expanded
      var sum = el('summary', 'guide-acc-sum', s.title);
      det.appendChild(sum);
      var body = el('ul', 'guide-acc-body');
      s.lines.forEach(function (line) {
        body.appendChild(el('li', null, line));
      });
      det.appendChild(body);
      sec.appendChild(det);
    });
    return sec;
  }

  function buildCheat() {
    var sec = el('section', 'guide-section');
    sec.appendChild(heading('🔄', '엘릭서 교환 치트시트'));

    var wrap = el('div', 'guide-table-wrap');
    var table = el('table', 'guide-table');
    var thead = el('thead');
    var hr = el('tr');
    ['구분', '내 카드', '상대 카드', '이득', '핵심'].forEach(function (t) {
      hr.appendChild(el('th', null, t));
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = el('tbody');
    CHEAT.forEach(function (r) {
      var tr = el('tr', 'guide-row-' + r.kind);
      tr.appendChild(el('td', 'guide-kind', r.kind === 'good' ? '👍 좋은 교환' : '👎 나쁜 교환'));
      tr.appendChild(el('td', null, r.mine));
      tr.appendChild(el('td', null, r.theirs));
      tr.appendChild(el('td', 'guide-gain', r.gain));
      tr.appendChild(el('td', 'guide-why', r.tip));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    sec.appendChild(wrap);
    sec.appendChild(el('p', 'guide-note', '이득은 엘릭서 기준이며, 괄호 안은 코스트입니다.'));
    return sec;
  }

  function buildTip() {
    var tip = el('div', 'guide-tip');
    tip.appendChild(el('span', 'guide-tip-icon', '💡'));
    tip.appendChild(el('p', 'guide-tip-text',
      '카드별 아레나 배치 그림은 덱 → 카드 상세에서 확인할 수 있습니다.'));
    return tip;
  }

  /* ---------- render ---------- */

  function render(root) {
    if (!root) return;
    closeZoom();

    root.innerHTML = '';
    root.classList.add('guide-root');

    var wrap = el('div', 'guide-wrap');
    wrap.appendChild(buildTop());
    wrap.appendChild(buildDiagram());
    wrap.appendChild(buildLegend());
    wrap.appendChild(buildAccordion());
    wrap.appendChild(buildCheat());
    wrap.appendChild(buildTip());
    root.appendChild(wrap);
  }

  RA.UI.screens.guide = { render: render };
})();
