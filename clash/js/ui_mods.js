/*
 * ui_mods.js - "MOD 모드" screen for the card-battle game.
 *
 * Classic script: no build step, no imports, vanilla DOM.
 * Uses the mod core in js/mods.js (RA.Mods) and card/rule data in js/data.js
 * (RA.RULE_DEFS, RA.BUILTIN_PACKS, RA.BASE_CARDS). Styles: css/mods.css (.mods- prefix).
 *
 * Registers:  RA.UI.screens.mods = { render(root) }
 *   The host calls render(root) every time the screen opens. root is cleared
 *   and refilled. The last selected tab is remembered in a module variable.
 *
 * Host contract (every access is optional and guarded):
 *   RA.Save.data.mods          { enabledPacks[], rules{}, cardOverrides{}, customCards[], scripts[{name,code,on}] }
 *   RA.Save.save()             persist (the RA.Mods functions already save)
 *   RA.UI.toast(text)          short message
 *   RA.UI.startBattle(mode)    'battle' | 'practice' - starts a match with the current mods
 *   RA.Audio.play(name)        optional: click, error, coin
 *   RA.CARD_TEXT[id].ko        card names (via RA.Mods.nameOf)
 */
(function () {
  'use strict';

  var RA = (window.RA = window.RA || {});
  RA.UI = RA.UI || {};
  RA.UI.screens = RA.UI.screens || {};

  var TABS = [
    { id: 'packs', label: '모드 팩' },
    { id: 'rules', label: '규칙' },
    { id: 'cards', label: '카드 편집' },
    { id: 'scripts', label: '스크립트' },
    { id: 'io', label: '가져오기/내보내기' }
  ];

  var FIELD_LABELS = {
    cost: '코스트', count: '소환 수', hp: '체력', dmg: '공격력', hs: '공격 간격(초)',
    speed: '이동 속도', range: '사거리', r: '반지름', sight: '시야', splash: '범위', deploy: '배치 시간'
  };
  var FLAG_LABELS = { fly: '공중', atkAir: '공중 공격', atkGround: '지상 공격', buildOnly: '건물만 공격' };
  var TYPE_NAMES = { troop: '유닛', spell: '주문', building: '건물' };

  /* ---------- module state (survives re-renders, reset on page load) ---------- */

  var BODY = null;                 // tab content container
  var CHIP = null;                 // MOD ON/OFF status chip
  var TAB_BTNS = [];               // tab buttons, repainted on switch
  var TAB = 'packs';               // last selected tab
  var SEL_CARD = 'knight';         // card selected in the card editor
  var EDIT_SCRIPT = -1;            // script index being edited, -1 = new script
  var SCRIPT_DRAFT = null;         // unsaved script editor contents {name, code}
  var IO = { name: 'My Mod', text: '' }; // import/export tab contents

  /* ---------- small helpers ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function mkBtn(text, cls, onClick) {
    var b = el('button', 'mods-btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function notice(text, cls) {
    return el('p', 'mods-notice' + (cls ? ' ' + cls : ''), text);
  }

  function warn(e) {
    if (window.console) console.warn('[mods]', e);
  }

  function toast(msg) {
    try { if (RA.UI && RA.UI.toast) RA.UI.toast(String(msg)); } catch (e) { warn(e); }
  }

  function play(name) {
    try { if (RA.Audio && RA.Audio.play) RA.Audio.play(name); } catch (e) { /* audio is optional */ }
  }

  function save() {
    try { if (RA.Save && RA.Save.save) RA.Save.save(); } catch (e) { warn(e); }
  }

  // Always read the live config object (RA.Mods.* and the host may replace it).
  function cfg() {
    var d = RA.Save.data;
    if (!d.mods) d.mods = {};
    var m = d.mods;
    if (!Array.isArray(m.enabledPacks)) m.enabledPacks = [];
    if (!m.rules) m.rules = {};
    if (!m.cardOverrides) m.cardOverrides = {};
    if (!Array.isArray(m.customCards)) m.customCards = [];
    if (!Array.isArray(m.scripts)) m.scripts = [];
    return m;
  }

  function customOf(id) {
    var list = RA.Mods.customs();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function sameNum(a, b) {
    return typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b;
  }

  function fmtRule(d, v) {
    if (d.type === 'bool') return v ? '켬' : '끔';
    return d.mult ? '×' + v : String(v);
  }

  // Human-readable list of effective rules that differ from the defaults.
  function changedRules() {
    var eff = RA.Mods.rules(), def = RA.Mods.ruleDefaults(), out = [];
    RA.RULE_DEFS.forEach(function (d) {
      if (!sameNum(eff[d.key], def[d.key])) out.push(d.label + ' ' + fmtRule(d, eff[d.key]));
    });
    return out;
  }

  function refreshChip() {
    if (!CHIP) return;
    var on = !!RA.Mods.active();
    CHIP.textContent = on ? 'MOD ON' : 'MOD OFF';
    CHIP.className = 'mods-chip ' + (on ? 'mods-chip-on' : 'mods-chip-off');
  }

  function startBattle(mode) {
    play('click');
    try {
      if (RA.UI && typeof RA.UI.startBattle === 'function') RA.UI.startBattle(mode);
      else toast('전투 시작 기능을 찾을 수 없습니다.');
    } catch (e) {
      warn(e);
      toast('전투를 시작하지 못했습니다.');
    }
  }

  /* ---------- frame: header, buttons, tab bar ---------- */

  function buildHeader() {
    var head = el('header', 'mods-header');
    var top = el('div', 'mods-head-top');
    top.appendChild(el('div', 'mods-title', 'MOD 모드'));
    CHIP = el('span', 'mods-chip');
    top.appendChild(CHIP);
    head.appendChild(top);
    head.appendChild(el('p', 'mods-sub', '규칙과 카드를 바꿔 나만의 전투를 만들어 보세요.'));
    return head;
  }

  function buildActions() {
    var acts = el('div', 'mods-actions');
    acts.appendChild(mkBtn('⚔️ Mod로 전투', 'mods-btn-go', function () { startBattle('battle'); }));
    acts.appendChild(mkBtn('🎯 Mod 연습', 'mods-btn-alt', function () { startBattle('practice'); }));
    return acts;
  }

  function buildTabBar() {
    var bar = el('nav', 'mods-tabs');
    bar.setAttribute('role', 'tablist');
    TAB_BTNS = TABS.map(function (t) {
      var b = el('button', 'mods-tab', t.label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('data-tab', t.id);
      b.addEventListener('click', function () {
        if (TAB !== t.id) play('click');
        TAB = t.id;
        renderTab();
      });
      bar.appendChild(b);
      return b;
    });
    return bar;
  }

  function paintTabs() {
    TAB_BTNS.forEach(function (b) {
      var on = b.getAttribute('data-tab') === TAB;
      b.className = 'mods-tab' + (on ? ' mods-tab-on' : '');
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  // Re-renders the active tab into BODY. Called after every change that affects it.
  function renderTab() {
    if (!BODY) return;
    BODY.innerHTML = '';
    paintTabs();
    var fn = { packs: renderPacks, rules: renderRules, cards: renderCards, scripts: renderScripts, io: renderIO }[TAB] || renderPacks;
    BODY.appendChild(fn());
  }

  /* ---------- tab 1: mod packs ---------- */

  function renderPacks() {
    var panel = el('section', 'mods-panel');
    panel.appendChild(el('h2', 'mods-h', '🧩 모드 팩'));
    panel.appendChild(el('p', 'mods-note', '팩을 켜고 끌 수 있습니다. 여러 팩을 함께 켜면 배율은 곱해지고, 나머지 설정은 나중 팩이 우선합니다.'));

    var list = el('div', 'mods-packs');
    (RA.BUILTIN_PACKS || []).forEach(function (p) {
      var on = cfg().enabledPacks.indexOf(p.id) >= 0;
      var card = el('button', 'mods-pack' + (on ? ' mods-pack-on' : ''));
      card.type = 'button';
      card.setAttribute('role', 'switch');
      card.setAttribute('aria-checked', on ? 'true' : 'false');
      card.appendChild(el('span', 'mods-pack-emoji', p.emoji));
      var info = el('span', 'mods-pack-info');
      info.appendChild(el('span', 'mods-pack-name', p.name));
      info.appendChild(el('span', 'mods-pack-desc', p.desc));
      card.appendChild(info);
      var sw = el('span', 'mods-switch');
      sw.appendChild(el('span', 'mods-switch-knob'));
      card.appendChild(sw);
      card.addEventListener('click', function () {
        RA.Mods.togglePack(p.id);
        play('click');
        refreshChip();
        renderTab();
      });
      list.appendChild(card);
    });
    panel.appendChild(list);

    var diffs = changedRules();
    var sum = el('div', 'mods-summary');
    sum.appendChild(el('strong', 'mods-summary-title', '현재 적용 규칙 (기본값과 다른 항목)'));
    sum.appendChild(el('p', 'mods-summary-text', diffs.length ? diffs.join(' · ') : '기본 규칙 그대로입니다.'));
    panel.appendChild(sum);
    return panel;
  }

  /* ---------- tab 2: rules ---------- */

  function renderRules() {
    var panel = el('section', 'mods-panel');
    panel.appendChild(el('h2', 'mods-h', '⚙️ 규칙'));
    panel.appendChild(el('p', 'mods-note', '값을 바꾸면 바로 저장됩니다. ↺ 는 그 항목의 직접 설정을 지워 모드 팩 기준값으로 되돌립니다. 노란 테두리는 직접 바꾼 항목입니다.'));

    var eff = RA.Mods.rules();
    var user = cfg().rules;
    var list = el('div', 'mods-rules');

    RA.RULE_DEFS.forEach(function (d) {
      var edited = Object.prototype.hasOwnProperty.call(user, d.key);
      var row = el('div', 'mods-rule' + (edited ? ' mods-rule-edited' : ''));

      var top = el('div', 'mods-rule-top');
      top.appendChild(el('span', 'mods-rule-label', d.label));
      var readout = el('span', 'mods-rule-val', fmtRule(d, eff[d.key]));
      top.appendChild(readout);
      row.appendChild(top);

      var ctl = el('div', 'mods-rule-ctl');
      if (d.type === 'bool') {
        var cb = el('input', 'mods-check');
        cb.type = 'checkbox';
        cb.checked = !!eff[d.key];
        cb.setAttribute('aria-label', d.label);
        cb.addEventListener('change', function () {
          cfg().rules[d.key] = cb.checked;
          save();
          play('click');
          refreshChip();
          renderTab();
        });
        ctl.appendChild(cb);
      } else {
        var rg = el('input', 'mods-range');
        rg.type = 'range';
        rg.min = String(d.min);
        rg.max = String(d.max);
        rg.step = String(d.step);
        rg.value = String(eff[d.key]);
        rg.setAttribute('aria-label', d.label);
        // 'input' fires while dragging: update the readout only. 'change' (release) re-renders.
        rg.addEventListener('input', function () {
          var v = Number(rg.value);
          cfg().rules[d.key] = v;
          save();
          readout.textContent = fmtRule(d, v);
          refreshChip();
        });
        rg.addEventListener('change', function () { renderTab(); });
        ctl.appendChild(rg);
      }

      var reset = mkBtn('↺', 'mods-btn-small', function () {
        delete cfg().rules[d.key];
        save();
        play('click');
        refreshChip();
        renderTab();
      });
      reset.disabled = !edited;
      reset.title = '기본값(모드 팩 기준)으로 되돌리기';
      reset.setAttribute('aria-label', d.label + ' 되돌리기');
      ctl.appendChild(reset);

      row.appendChild(ctl);
      list.appendChild(row);
    });
    panel.appendChild(list);

    var danger = el('div', 'mods-danger-zone');
    danger.appendChild(mkBtn('🗑 모든 규칙 초기화', 'mods-btn-danger', function () {
      if (!confirm('모든 규칙과 적용 중인 모드 팩을 초기화할까요?')) return;
      cfg().rules = {};
      cfg().enabledPacks = [];
      save();
      play('click');
      toast('규칙을 초기화했습니다.');
      refreshChip();
      renderTab();
    }));
    panel.appendChild(danger);
    return panel;
  }

  /* ---------- tab 3: card editor ---------- */

  function renderCards() {
    var panel = el('section', 'mods-panel');
    panel.appendChild(el('h2', 'mods-h', '🃏 카드 편집'));

    var ids = RA.Mods.allIds();
    if (ids.indexOf(SEL_CARD) < 0) SEL_CARD = 'knight';
    var ovr = cfg().cardOverrides;

    var sel = el('select', 'mods-select');
    sel.setAttribute('aria-label', '카드 선택');
    ids.forEach(function (id) {
      var custom = RA.Mods.isCustom(id);
      var label = (custom ? '★ ' : '') + RA.Mods.nameOf(id) + (!custom && ovr[id] ? ' ✎' : '');
      var o = el('option', '', label);
      o.value = id;
      sel.appendChild(o);
    });
    sel.value = SEL_CARD;
    sel.addEventListener('change', function () {
      SEL_CARD = sel.value;
      renderTab();
    });
    panel.appendChild(sel);

    var id = SEL_CARD;
    var custom = RA.Mods.isCustom(id);
    var overridden = !custom && !!ovr[id];
    var eff = RA.Mods.card(id);
    var isSpell = eff.type === 'spell';
    var rar = RA.RARITY && RA.RARITY[eff.rarity];

    // preview
    var prev = el('div', 'mods-preview');
    var img = el('img', 'mods-art');
    img.alt = RA.Mods.nameOf(id);
    img.src = 'assets/cards/' + RA.Mods.artOf(id) + '.png';
    img.onerror = function () { img.style.visibility = 'hidden'; };
    prev.appendChild(img);
    var meta = el('div', 'mods-meta');
    meta.appendChild(el('div', 'mods-meta-name', RA.Mods.nameOf(id)));
    var sub = [custom ? '커스텀 카드' : '기본 카드', TYPE_NAMES[eff.type] || eff.type];
    if (rar && rar.name) sub.push(rar.name);
    meta.appendChild(el('div', 'mods-meta-sub', sub.join(' · ')));
    if (custom) meta.appendChild(el('span', 'mods-badge', '★ 커스텀'));
    else if (overridden) meta.appendChild(el('span', 'mods-badge', '✎ 수정됨'));
    prev.appendChild(meta);
    panel.appendChild(prev);

    if (isSpell) {
      panel.appendChild(notice('주문 카드는 수치를 편집할 수 없습니다.'));
    } else {
      var grid = el('div', 'mods-grid');
      RA.Mods.EDITABLE.forEach(function (k) {
        var f = el('label', 'mods-field');
        f.appendChild(el('span', 'mods-field-label', FIELD_LABELS[k] || k));
        var inp = el('input', 'mods-input');
        inp.type = 'number';
        inp.step = 'any';
        inp.min = '0';
        inp.inputMode = 'decimal';
        inp.value = eff[k] != null ? String(eff[k]) : '0';
        inp.setAttribute('data-k', k);
        f.appendChild(inp);
        grid.appendChild(f);
      });
      panel.appendChild(grid);

      var flags = el('div', 'mods-flags');
      RA.Mods.FLAGS.forEach(function (k) {
        var f = el('label', 'mods-flag');
        var cb = el('input', 'mods-check');
        cb.type = 'checkbox';
        cb.checked = !!eff[k];
        cb.setAttribute('data-k', k);
        f.appendChild(cb);
        f.appendChild(el('span', '', FLAG_LABELS[k]));
        flags.appendChild(f);
      });
      panel.appendChild(flags);
    }

    var row = el('div', 'mods-row');
    if (!isSpell) row.appendChild(mkBtn('✅ 적용', 'mods-btn-go', function () { applyCard(panel, id, custom); }));
    if (!custom) {
      var orig = mkBtn('↺ 원래대로', 'mods-btn-alt', function () {
        RA.Mods.resetOverride(id);
        play('click');
        toast('원래 수치로 되돌렸습니다.');
        renderTab();
      });
      orig.disabled = !overridden;
      row.appendChild(orig);
    }
    row.appendChild(mkBtn('📄 복제해서 새 카드 만들기', '', function () { cloneCard(id); }));
    if (custom) row.appendChild(mkBtn('🗑 삭제', 'mods-btn-danger', function () { deleteCard(id); }));
    panel.appendChild(row);
    return panel;
  }

  function applyCard(panel, id, custom) {
    var vals = {}, bad = null;
    RA.Mods.EDITABLE.forEach(function (k) {
      var inp = panel.querySelector('input.mods-input[data-k="' + k + '"]');
      var raw = inp ? String(inp.value).trim() : '';
      var v = Number(raw);
      if (!inp || raw === '' || !isFinite(v) || v < 0) bad = bad || (FIELD_LABELS[k] || k);
      else vals[k] = v;
    });
    RA.Mods.FLAGS.forEach(function (k) {
      var cb = panel.querySelector('input[type="checkbox"][data-k="' + k + '"]');
      if (cb) vals[k] = !!cb.checked;
    });
    if (bad) {
      play('error');
      toast('"' + bad + '" 값을 확인하세요 (0 이상의 숫자).');
      return;
    }

    if (custom) {
      // custom cards keep every value
      RA.Mods.setOverride(id, vals);
    } else {
      // store only the values that differ from the base definition
      var base = RA.def(RA.BASE_CARDS[id]), patch = {};
      Object.keys(vals).forEach(function (k) { if (!sameNum(vals[k], base[k])) patch[k] = vals[k]; });
      RA.Mods.resetOverride(id);                 // clear stale keys first (setOverride only merges)
      if (Object.keys(patch).length) RA.Mods.setOverride(id, patch);
      if (!Object.keys(patch).length) { toast('변경된 값이 없습니다.'); renderTab(); return; }
    }
    play('coin');
    toast('적용했습니다.');
    renderTab();
  }

  function cloneCard(id) {
    var cu = customOf(id);
    var baseId = cu ? cu.base : id;
    var defName = RA.Mods.nameOf(id) + ' 개조';
    var name = prompt('새 카드 이름 (최대 20자)', defName);
    if (name == null) return;
    name = String(name).trim().slice(0, 20) || defName;

    var newId = RA.Mods.createCustom(baseId, name);
    // copy the source card's current values so edits carry over
    var eff = RA.Mods.card(id), vals = {};
    RA.Mods.EDITABLE.concat(RA.Mods.FLAGS).forEach(function (k) { if (eff[k] !== undefined) vals[k] = eff[k]; });
    if (eff.type !== 'spell' && Object.keys(vals).length) RA.Mods.setOverride(newId, vals);

    SEL_CARD = newId;
    play('coin');
    toast('새 카드를 만들었습니다: ' + name);
    renderTab();
  }

  function deleteCard(id) {
    if (!confirm('"' + RA.Mods.nameOf(id) + '" 커스텀 카드를 삭제할까요? 덱에서도 빠집니다.')) return;
    RA.Mods.deleteCustom(id);
    SEL_CARD = 'knight';
    play('click');
    toast('삭제했습니다.');
    renderTab();
  }

  /* ---------- tab 4: scripts ---------- */

  function renderScripts() {
    var panel = el('section', 'mods-panel');
    panel.appendChild(el('h2', 'mods-h', '📜 스크립트'));
    panel.appendChild(notice('⚠️ 스크립트는 이 페이지에서 임의의 JavaScript를 실행합니다. 직접 만들었거나 신뢰하는 스크립트만 추가하고 켜세요.', 'mods-warn'));

    var list = cfg().scripts;
    if (!list.length) panel.appendChild(el('p', 'mods-note', '등록된 스크립트가 없습니다.'));

    var ul = el('div', 'mods-scripts');
    list.forEach(function (s, i) {
      var row = el('div', 'mods-script' + (i === EDIT_SCRIPT ? ' mods-script-editing' : ''));
      var head = el('div', 'mods-script-head');
      head.appendChild(el('span', 'mods-script-name', s.name || ('스크립트 ' + (i + 1))));

      var sw = el('button', 'mods-pill-switch' + (s.on ? ' mods-pill-on' : ''));
      sw.type = 'button';
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-checked', s.on ? 'true' : 'false');
      sw.setAttribute('aria-label', (s.name || '스크립트') + ' 켜기/끄기');
      sw.appendChild(el('span', 'mods-pill-text', s.on ? 'ON' : 'OFF'));
      sw.appendChild(el('span', 'mods-pill-knob'));
      sw.addEventListener('click', function () { toggleScript(i); });
      head.appendChild(sw);
      row.appendChild(head);

      var acts = el('div', 'mods-row');
      acts.appendChild(mkBtn('✏️ 편집', 'mods-btn-small', function () { editScript(i); }));
      acts.appendChild(mkBtn('🗑 삭제', 'mods-btn-danger mods-btn-small', function () { deleteScript(i); }));
      row.appendChild(acts);
      ul.appendChild(row);
    });
    panel.appendChild(ul);

    // editor
    if (!SCRIPT_DRAFT) SCRIPT_DRAFT = { name: '', code: RA.Mods.EXAMPLE_SCRIPT };
    var ed = el('div', 'mods-editor');
    ed.appendChild(el('h3', 'mods-h2', EDIT_SCRIPT >= 0 ? '스크립트 편집 중' : '새 스크립트'));

    var nameIn = el('input', 'mods-input-text');
    nameIn.type = 'text';
    nameIn.maxLength = 30;
    nameIn.placeholder = '스크립트 이름 (비워 두면 자동 이름)';
    nameIn.setAttribute('aria-label', '스크립트 이름');
    nameIn.value = SCRIPT_DRAFT.name;
    nameIn.addEventListener('input', function () { SCRIPT_DRAFT.name = nameIn.value; });
    ed.appendChild(nameIn);

    var code = el('textarea', 'mods-code');
    code.rows = 10;
    code.spellcheck = false;
    code.setAttribute('autocapitalize', 'off');
    code.setAttribute('aria-label', '스크립트 코드');
    code.value = SCRIPT_DRAFT.code;
    code.addEventListener('input', function () { SCRIPT_DRAFT.code = code.value; });
    ed.appendChild(code);

    var eb = el('div', 'mods-row');
    eb.appendChild(mkBtn('💾 저장', 'mods-btn-go', saveScript));
    if (EDIT_SCRIPT >= 0) {
      eb.appendChild(mkBtn('편집 취소', 'mods-btn-alt', function () {
        EDIT_SCRIPT = -1;
        SCRIPT_DRAFT = null;
        renderTab();
      }));
    }
    ed.appendChild(eb);
    panel.appendChild(ed);

    // API help
    var help = el('div', 'mods-help');
    help.appendChild(el('h3', 'mods-h2', 'API 도움말'));
    var ul2 = el('ul', '');
    [
      'mod({ onMatchStart(api), onTick(api, dt), onSpawn(api, unit), onDeath(api, unit), onPlayCard(api, team, cardId), onTowerDestroyed(api, tower) })',
      'api.spawn(cardId, team, x, y): 카드 유닛 소환',
      'api.hurt(entity, n) / api.heal(entity, n): 피해 / 회복',
      'api.addElixir(team, n): 엘릭서 추가',
      'api.say(text): 화면에 메시지 표시',
      'api.units() / api.towers() / api.time(): 유닛 목록, 타워 목록, 경과 시간',
      '팀 0 = 플레이어(아래쪽 진영), 아레나 크기 18 x 32 타일',
      '본문은 RA, mod 인자를 받습니다. 저장한 스크립트는 꺼진 상태이므로 다시 켜야 적용됩니다.'
    ].forEach(function (t) { ul2.appendChild(el('li', '', t)); });
    help.appendChild(ul2);
    panel.appendChild(help);
    return panel;
  }

  function saveScript() {
    var draft = SCRIPT_DRAFT || { name: '', code: '' };
    var code = String(draft.code || '');
    if (!code.trim()) { play('error'); toast('코드를 입력하세요.'); return; }
    try {
      new Function('RA', 'mod', code); // syntax check only, nothing runs here
    } catch (e) {
      play('error');
      toast('문법 오류: ' + e.message);
      return;
    }
    var list = cfg().scripts;
    var name = String(draft.name || '').trim().slice(0, 30);
    if (EDIT_SCRIPT >= 0 && list[EDIT_SCRIPT]) {
      // edited code is stored OFF so the user must confirm it again
      list[EDIT_SCRIPT] = { name: name || list[EDIT_SCRIPT].name, code: code, on: false };
      toast('저장했습니다. 편집한 스크립트는 다시 켜야 적용됩니다.');
    } else {
      list.push({ name: name || ('스크립트 ' + (list.length + 1)), code: code, on: false });
      toast('스크립트를 저장했습니다. 켜야 적용됩니다.');
    }
    EDIT_SCRIPT = -1;
    SCRIPT_DRAFT = null;
    save();
    play('coin');
    refreshChip();
    renderTab();
  }

  function toggleScript(i) {
    var s = cfg().scripts[i];
    if (!s) return;
    if (!s.on) {
      if (!confirm('이 스크립트는 임의의 JavaScript를 실행합니다.\n페이지의 데이터와 게임 상태에 접근할 수 있습니다.\n신뢰하는 스크립트만 켜세요. 켤까요?')) return;
      s.on = true;
      toast('켰습니다. 다음 전투부터 적용됩니다.');
    } else {
      s.on = false;
      toast('껐습니다.');
    }
    save();
    play('click');
    refreshChip();
    renderTab();
  }

  function editScript(i) {
    var s = cfg().scripts[i];
    if (!s) return;
    EDIT_SCRIPT = i;
    SCRIPT_DRAFT = { name: s.name || '', code: s.code || '' };
    play('click');
    renderTab();
  }

  function deleteScript(i) {
    var list = cfg().scripts;
    var s = list[i];
    if (!s) return;
    if (!confirm('"' + (s.name || '스크립트') + '" 스크립트를 삭제할까요?')) return;
    list.splice(i, 1);
    if (EDIT_SCRIPT === i) { EDIT_SCRIPT = -1; SCRIPT_DRAFT = null; }
    else if (EDIT_SCRIPT > i) EDIT_SCRIPT--;
    save();
    play('click');
    toast('삭제했습니다.');
    refreshChip();
    renderTab();
  }

  /* ---------- tab 5: import / export ---------- */

  function copyText(text, ta) {
    var fallback = function () {
      ta.value = text;
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { warn(e); }
      toast(ok ? '복사했습니다.' : '복사하지 못했습니다. 텍스트를 직접 선택해 복사하세요.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast('클립보드에 복사했습니다.');
      }, fallback);
    } else {
      fallback();
    }
  }

  function doImport(text) {
    if (!String(text || '').trim()) {
      play('error');
      toast('가져올 JSON을 입력하거나 파일을 선택하세요.');
      return;
    }
    try {
      var n = RA.Mods.importJSON(text);
      play('coin');
      toast('가져오기 완료 — 규칙 ' + n.rules + ' · 카드 수정 ' + n.overrides + ' · 커스텀 ' + n.customs +
        ' · 스크립트 ' + n.scripts + ' · 팩 ' + n.packs);
      refreshChip();
    } catch (e) {
      play('error');
      toast(e && e.message ? e.message : String(e));
    }
  }

  function downloadText(text, fileName) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function renderIO() {
    var panel = el('section', 'mods-panel');
    panel.appendChild(el('h2', 'mods-h', '📦 가져오기/내보내기'));
    panel.appendChild(el('p', 'mods-note', 'Mod 설정을 JSON 텍스트로 주고받을 수 있습니다. 가져오면 현재 설정에 합쳐집니다.'));

    var nameField = el('label', 'mods-field');
    nameField.appendChild(el('span', 'mods-field-label', 'Mod 이름'));
    var nameIn = el('input', 'mods-input-text');
    nameIn.type = 'text';
    nameIn.maxLength = 30;
    nameIn.value = IO.name;
    nameIn.addEventListener('input', function () { IO.name = nameIn.value; });
    nameField.appendChild(nameIn);
    panel.appendChild(nameField);

    var ta = el('textarea', 'mods-io');
    ta.rows = 12;
    ta.spellcheck = false;
    ta.placeholder = 'Mod JSON을 붙여넣거나 "내보내기"를 누르세요.';
    ta.setAttribute('aria-label', 'Mod JSON');
    ta.value = IO.text;
    ta.addEventListener('input', function () { IO.text = ta.value; });
    panel.appendChild(ta);

    var exportNow = function () {
      var t = RA.Mods.exportJSON((IO.name || '').trim() || 'My Mod');
      IO.text = t;
      ta.value = t;
      return t;
    };

    var fileIn = el('input', 'mods-file');
    fileIn.type = 'file';
    fileIn.accept = '.json,application/json';
    fileIn.addEventListener('change', function () {
      var f = fileIn.files && fileIn.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var t = String(rd.result || '');
        IO.text = t;
        ta.value = t;
        doImport(t);
        fileIn.value = '';
      };
      rd.onerror = function () { play('error'); toast('파일을 읽지 못했습니다.'); };
      rd.readAsText(f);
    });

    var row = el('div', 'mods-row');
    row.appendChild(mkBtn('📤 내보내기', '', function () {
      exportNow();
      play('click');
      toast('내보내기 완료. 텍스트를 복사하거나 파일로 저장하세요.');
    }));
    row.appendChild(mkBtn('📋 복사', '', function () {
      copyText(ta.value.trim() ? ta.value : exportNow(), ta);
    }));
    row.appendChild(mkBtn('💾 파일로 저장', '', function () {
      var t = ta.value.trim() ? ta.value : exportNow();
      var safe = ((IO.name || '').trim() || 'My Mod').replace(/[\\/:*?"<>|]+/g, '_');
      downloadText(t, 'mod-' + safe + '.json');
      play('click');
    }));
    row.appendChild(mkBtn('📥 가져오기', 'mods-btn-go', function () { doImport(ta.value); }));
    row.appendChild(mkBtn('📂 파일 불러오기', 'mods-btn-alt', function () { fileIn.click(); }));
    panel.appendChild(row);
    panel.appendChild(fileIn);

    var danger = el('div', 'mods-danger-zone');
    danger.appendChild(el('span', 'mods-h2', '위험 구역'));
    danger.appendChild(mkBtn('☠️ 모든 Mod 초기화', 'mods-btn-danger', function () {
      if (!confirm('모든 Mod 설정(모드 팩, 규칙, 카드 수정, 커스텀 카드, 스크립트)을 삭제할까요?\n되돌릴 수 없습니다.')) return;
      RA.Mods.resetAll();
      SEL_CARD = 'knight';
      EDIT_SCRIPT = -1;
      SCRIPT_DRAFT = null;
      IO.text = '';
      play('click');
      toast('모든 Mod 설정을 초기화했습니다.');
      refreshChip();
      renderTab();
    }));
    panel.appendChild(danger);
    return panel;
  }

  /* ---------- entry point ---------- */

  RA.UI.screens.mods = {
    render: function (root) {
      root.innerHTML = '';
      var wrap = el('div', 'mods-root');
      if (!RA.Mods || !RA.Save || !RA.Save.data) {
        wrap.appendChild(notice('Mod 시스템을 불러오지 못했습니다.'));
        root.appendChild(wrap);
        BODY = null;
        CHIP = null;
        return;
      }
      cfg(); // make sure RA.Save.data.mods exists before RA.Mods.active() reads it
      var inner = el('div', 'mods-wrap');
      inner.appendChild(buildHeader());
      inner.appendChild(buildActions());
      inner.appendChild(buildTabBar());
      BODY = el('div', 'mods-body');
      inner.appendChild(BODY);
      wrap.appendChild(inner);
      root.appendChild(wrap);
      refreshChip();
      renderTab();
    }
  };
})();
