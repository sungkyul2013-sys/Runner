/*
 * ui_deck.js - "덱" (deck) screen for the card-battle game.
 *
 * Classic script: no build step, no imports, vanilla DOM.
 *
 * Registers:  RA.UI.screens.deck = { render(root) }
 *   The host calls render(root) each time the deck screen opens. root is
 *   cleared here and filled. Opening always shows the active deck.
 *
 * Features:
 *   - 5 deck tabs, rename (prompt), average elixir cost
 *   - active deck's 8 slots (4x2): tap a slot to select it, then tap a
 *     collection card to swap it in
 *   - "이 덱으로 선택" (set active deck) and "랜덤 덱" (random valid deck)
 *   - collection grid sorted by cost then name; cards already in the deck
 *     are dimmed; custom mod cards show a MOD badge
 *   - info modal per card: stats at the player's level, texts, and quick
 *     swap into one of the 8 slots
 *
 * Host contract (every access is guarded so missing pieces degrade quietly):
 *   RA.Save.data     decks (5 x 8 card ids), activeDeck (0-4),
 *                    deckNames (5 strings), settings.cardLevel (1..16)
 *   RA.Save.save()   persist; decks are mutated in place
 *   RA.Mods.allIds() / card(id) / nameOf(id) / artOf(id) / isCustom(id)
 *   RA.CARD_TEXT[id] { ko, desc, strengths, weaknesses, tips }
 *   RA.RARITY[rarity] { name, color }
 *   RA.lvlMul(level) stat multiplier for a level
 *   RA.UI.toast(text), RA.Audio.play('click' | 'error')
 *
 * Styles live in css/deck.css. All class names are prefixed with .deck-.
 */
(function () {
  'use strict';

  var RA = (window.RA = window.RA || {});
  RA.UI = RA.UI || {};
  RA.UI.screens = RA.UI.screens || {};

  var DECK_COUNT = 5;
  var SLOTS = 8;
  var MAX_LEVEL = 16;
  var MAX_NAME = 12;

  var TYPE_LABEL = { troop: '유닛', spell: '주문', building: '건물' };

  /* ---------- per-render state ---------- */

  var S = {
    root: null,       // host root element
    view: 0,          // deck tab currently shown
    sel: -1,          // selected slot index, -1 for none
    modal: null,      // open info modal backdrop
    onKey: null       // Escape handler while modal is open
  };

  var fallbackData = {};

  /* ---------- small helpers ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function clamp(v, lo, hi) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) n = lo;
    return Math.min(hi, Math.max(lo, n));
  }

  function warn(e) {
    if (window.console) console.warn('[deck]', e);
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }

  function fmtStat(v) {
    var n = num(v);
    return String(n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
  }

  function speedLabel(s) {
    s = num(s);
    if (s <= 0) return '정지';
    if (s <= 0.75) return '느림';
    if (s <= 1) return '보통';
    if (s <= 1.5) return '빠름';
    return '매우 빠름';
  }

  function makeBtn(text, extraCls) {
    var b = el('button', 'deck-btn' + (extraCls ? ' ' + extraCls : ''), text);
    b.type = 'button';
    return b;
  }

  /* ---------- host access ---------- */

  function sfx(name) {
    try {
      if (RA.Audio && typeof RA.Audio.play === 'function') RA.Audio.play(name);
    } catch (e) { warn(e); }
  }

  function toast(msg) {
    try {
      if (RA.UI && typeof RA.UI.toast === 'function') RA.UI.toast(msg);
    } catch (e) { warn(e); }
  }

  function persist() {
    try {
      if (RA.Save && typeof RA.Save.save === 'function') RA.Save.save();
    } catch (e) { warn(e); }
  }

  function allIds() {
    try {
      var ids = RA.Mods && typeof RA.Mods.allIds === 'function' ? RA.Mods.allIds() : [];
      return Array.isArray(ids) ? ids : [];
    } catch (e) { warn(e); return []; }
  }

  function cardDef(id) {
    try {
      var d = RA.Mods && typeof RA.Mods.card === 'function' ? RA.Mods.card(id) : null;
      return d && typeof d === 'object' ? d : null;
    } catch (e) { return null; }
  }

  function nameOf(id) {
    try {
      if (RA.Mods && typeof RA.Mods.nameOf === 'function') return RA.Mods.nameOf(id) || String(id);
    } catch (e) { warn(e); }
    return String(id);
  }

  function artPath(id) {
    var art = id;
    try {
      if (RA.Mods && typeof RA.Mods.artOf === 'function') art = RA.Mods.artOf(id) || id;
    } catch (e) { warn(e); }
    return 'assets/cards/' + art + '.png';
  }

  function isCustom(id) {
    try {
      return !!(RA.Mods && typeof RA.Mods.isCustom === 'function' && RA.Mods.isCustom(id));
    } catch (e) { return false; }
  }

  function rarityOf(def) {
    var key = def && def.rarity;
    var r = RA.RARITY && RA.RARITY[key];
    return { name: (r && r.name) || String(key || ''), color: (r && r.color) || '#8fb5e8' };
  }

  function levelMul(level) {
    try {
      if (typeof RA.lvlMul === 'function') return num(RA.lvlMul(level)) || 1;
    } catch (e) { warn(e); }
    return 1;
  }

  /* ---------- profile shape ---------- */

  function isChampion(id) {
    var def = cardDef(id);
    return !!(def && def.champion === true);
  }

  // Keep the valid, unique, champion-limited ids from list, then pad with
  // random cards until the deck has SLOTS entries. Returns null if the pool
  // is unavailable (so a missing host never wipes a deck).
  function repairDeck(list) {
    var pool = allIds().filter(function (id) { return !!cardDef(id); });
    if (!pool.length) return null;
    var out = [];
    var seen = {};
    var champs = 0;
    function tryAdd(id) {
      if (out.length >= SLOTS || seen[id]) return;
      if (!cardDef(id)) return;
      var champ = isChampion(id);
      if (champ && champs >= 1) return;
      seen[id] = true;
      if (champ) champs++;
      out.push(id);
    }
    if (Array.isArray(list)) list.forEach(tryAdd);
    shuffle(pool.slice()).forEach(tryAdd);
    return out;
  }

  function sameList(a, b) {
    if (!Array.isArray(a) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // Returns the profile with the deck-related shape guaranteed.
  function data() {
    var d = RA.Save && RA.Save.data;
    if (!d || typeof d !== 'object') d = fallbackData;

    if (!d.settings || typeof d.settings !== 'object') d.settings = {};
    d.settings.cardLevel = clamp(d.settings.cardLevel, 1, MAX_LEVEL);
    if (d.settings.cardLevel === 0) d.settings.cardLevel = 11;

    if (!Array.isArray(d.decks)) d.decks = [];
    for (var i = 0; i < DECK_COUNT; i++) {
      var deck = d.decks[i];
      var fixed = repairDeck(deck);
      if (fixed && !sameList(deck, fixed)) {
        if (Array.isArray(deck)) {
          deck.length = 0;
          fixed.forEach(function (id) { deck.push(id); });
        } else {
          d.decks[i] = fixed;
        }
      }
    }
    d.decks.length = DECK_COUNT;

    if (!Array.isArray(d.deckNames)) d.deckNames = [];
    for (var n = 0; n < DECK_COUNT; n++) {
      if (typeof d.deckNames[n] !== 'string' || !d.deckNames[n]) {
        d.deckNames[n] = '덱 ' + (n + 1);
      }
    }
    d.deckNames.length = DECK_COUNT;

    d.activeDeck = clamp(d.activeDeck, 0, DECK_COUNT - 1);
    return d;
  }

  function currentDeck() {
    return data().decks[S.view];
  }

  function avgCost(deck) {
    var total = 0;
    var count = 0;
    deck.forEach(function (id) {
      var def = cardDef(id);
      if (def) { total += num(def.cost); count++; }
    });
    return count ? total / count : 0;
  }

  /* ---------- swap validation ---------- */

  // Returns an error message, or null when putting card id into slot idx is allowed.
  function swapError(deck, idx, id) {
    if (!cardDef(id)) return '사용할 수 없는 카드예요';
    for (var i = 0; i < deck.length; i++) {
      if (deck[i] === id) return '이미 덱에 있는 카드예요';
    }
    if (isChampion(id)) {
      var champs = 0;
      for (var j = 0; j < deck.length; j++) {
        if (j !== idx && isChampion(deck[j])) champs++;
      }
      if (champs >= 1) return '챔피언은 덱에 1장만 넣을 수 있어요';
    }
    return null;
  }

  function putInSlot(deck, idx, id) {
    var err = swapError(deck, idx, id);
    if (err) {
      sfx('error');
      toast(err);
      return false;
    }
    deck[idx] = id;
    persist();
    sfx('click');
    return true;
  }

  /* ---------- card visuals ---------- */

  // Card image, or a text plate if the image fails to load.
  function artNode(id, cls) {
    var wrap = el('div', cls);
    var img = el('img', 'deck-art-img');
    img.alt = nameOf(id);
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', function () {
      wrap.innerHTML = '';
      wrap.appendChild(el('div', 'deck-noart', nameOf(id)));
    });
    img.src = artPath(id);
    wrap.appendChild(img);
    return wrap;
  }

  function costBubble(def) {
    return el('span', 'deck-cost', def ? String(num(def.cost)) : '?');
  }

  function drop() {
    return el('span', 'deck-drop');
  }

  /* ---------- modal ---------- */

  function closeModal() {
    if (S.onKey) {
      document.removeEventListener('keydown', S.onKey);
      S.onKey = null;
    }
    if (S.modal && S.modal.parentNode) S.modal.parentNode.removeChild(S.modal);
    S.modal = null;
  }

  function openModal(box) {
    closeModal();
    var back = el('div', 'deck-modal-backdrop');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    back.appendChild(box);
    back.addEventListener('click', function (e) {
      if (e.target === back) closeModal();
    });
    S.onKey = function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') closeModal();
    };
    document.addEventListener('keydown', S.onKey);
    (document.body || document.documentElement).appendChild(back);
    S.modal = back;
  }

  function statRow(label, value) {
    var r = el('div', 'deck-stat');
    r.appendChild(el('span', 'deck-stat-k', label));
    r.appendChild(el('span', 'deck-stat-v', value));
    return r;
  }

  function textSection(title, body) {
    var s = el('div', 'deck-info-sec');
    s.appendChild(el('div', 'deck-info-sec-h', title));
    s.appendChild(el('p', 'deck-info-sec-p', body));
    return s;
  }

  function targetText(def) {
    var parts = [];
    if (def.atkGround) parts.push('지상');
    if (def.atkAir) parts.push('공중');
    return parts.length ? parts.join('/') : '없음';
  }

  function buildStats(def) {
    var box = el('div', 'deck-stats');
    var m = levelMul(data().settings.cardLevel);

    if (def.type === 'spell') {
      var sp = def.spell || {};
      if (sp.r != null) box.appendChild(statRow('반경', fmtStat(sp.r) + ' 타일'));
      if (sp.dmg != null) box.appendChild(statRow('피해', fmtStat(num(sp.dmg) * m)));
      if (sp.dur != null) box.appendChild(statRow('지속 시간', fmtStat(sp.dur) + '초'));
    } else {
      if (def.hp != null) box.appendChild(statRow('체력', fmtStat(num(def.hp) * m)));
      if (def.dmg != null && num(def.dmg) > 0) {
        box.appendChild(statRow('공격력', fmtStat(num(def.dmg) * m)));
      }
      if (def.hs != null && num(def.hs) > 0) {
        box.appendChild(statRow('공격 속도', fmtStat(def.hs) + '초'));
      }
      if (def.speed != null) box.appendChild(statRow('이동 속도', speedLabel(def.speed)));
      if (def.range != null) box.appendChild(statRow('사거리', fmtStat(def.range) + ' 타일'));
      if (def.count != null) box.appendChild(statRow('소환 수', num(def.count) + '기'));
      box.appendChild(statRow('대상', targetText(def)));
    }

    if (def.ability && typeof def.ability === 'object') {
      var ab = def.ability;
      var txt = (ab.name || '특수 능력') +
        (ab.cost != null ? ' (비용 ' + fmtStat(ab.cost) : ' (') +
        (ab.cd != null ? ', 쿨타임 ' + fmtStat(ab.cd) + '초)' : ')');
      box.appendChild(statRow('특수 능력', txt));
    }
    return box;
  }

  function openInfo(id) {
    var def = cardDef(id);
    var box = el('div', 'deck-modal');
    var lv = data().settings.cardLevel;

    var close = makeBtn('✕', 'deck-btn-x');
    close.setAttribute('aria-label', '닫기');
    close.addEventListener('click', closeModal);
    box.appendChild(close);

    if (!def) {
      box.appendChild(el('div', 'deck-info-name', nameOf(id)));
      box.appendChild(el('p', 'deck-info-sec-p', '카드 정보를 불러올 수 없어요.'));
      openModal(box);
      return;
    }

    var rar = rarityOf(def);
    box.setAttribute('aria-label', nameOf(id) + ' 정보');
    box.appendChild(artNode(id, 'deck-info-art'));
    box.appendChild(el('div', 'deck-info-name', nameOf(id)));

    var tags = el('div', 'deck-info-tags');
    var rtag = el('span', 'deck-tag', rar.name);
    rtag.style.background = rar.color;
    tags.appendChild(rtag);
    var cost = el('span', 'deck-tag deck-tag-cost');
    cost.appendChild(drop());
    cost.appendChild(el('span', null, String(num(def.cost))));
    tags.appendChild(cost);
    tags.appendChild(el('span', 'deck-tag', TYPE_LABEL[def.type] || '유닛'));
    if (isCustom(id)) tags.appendChild(el('span', 'deck-tag deck-tag-mod', 'MOD'));
    tags.appendChild(el('span', 'deck-tag deck-tag-lv', 'Lv ' + lv));
    box.appendChild(tags);

    box.appendChild(buildStats(def));

    var text = (RA.CARD_TEXT && RA.CARD_TEXT[id]) || null;
    var texts = el('div', 'deck-info-texts');
    if (text) {
      texts.appendChild(textSection('설명', text.desc || ''));
      if (text.strengths) texts.appendChild(textSection('강점', text.strengths));
      if (text.weaknesses) texts.appendChild(textSection('약점', text.weaknesses));
      if (text.tips) texts.appendChild(textSection('팁', text.tips));
    } else {
      texts.appendChild(textSection('설명', '모드 카드'));
    }
    box.appendChild(texts);

    // Quick swap: put this card into one of the current deck's slots.
    var deck = currentDeck();
    box.appendChild(el('div', 'deck-info-swap-h', '교체할 슬롯 선택'));
    var thumbs = el('div', 'deck-info-slots');
    deck.forEach(function (cur, i) {
      var b = el('button', 'deck-info-slot');
      b.type = 'button';
      b.setAttribute('aria-label', (i + 1) + '번 슬롯: ' + nameOf(cur));
      b.appendChild(artNode(cur, 'deck-info-slot-art'));
      b.addEventListener('click', function () {
        if (!putInSlot(deck, i, id)) return;
        closeModal();
        S.sel = -1;
        build();
      });
      thumbs.appendChild(b);
    });
    box.appendChild(thumbs);

    var done = makeBtn('닫기', 'deck-btn-wide deck-btn-ghost');
    done.addEventListener('click', closeModal);
    box.appendChild(done);

    openModal(box);
  }

  /* ---------- deck actions ---------- */

  function setActive() {
    var d = data();
    if (d.activeDeck === S.view) return;
    d.activeDeck = S.view;
    persist();
    sfx('click');
    toast((d.deckNames[S.view] || '덱') + ' 선택 완료');
    build();
  }

  function renameDeck() {
    var d = data();
    if (typeof window.prompt !== 'function') return;
    var v = window.prompt('덱 이름 (최대 ' + MAX_NAME + '자)', d.deckNames[S.view]);
    if (v == null) return;
    v = String(v).trim().slice(0, MAX_NAME);
    if (!v) {
      sfx('error');
      toast('이름을 입력하세요');
      return;
    }
    d.deckNames[S.view] = v;
    persist();
    sfx('click');
    build();
  }

  function randomDeck() {
    var pool = shuffle(allIds().filter(function (id) { return !!cardDef(id); }));
    var picked = [];
    var champs = 0;
    for (var i = 0; i < pool.length && picked.length < SLOTS; i++) {
      var champ = isChampion(pool[i]);
      if (champ && champs >= 1) continue;
      if (champ) champs++;
      picked.push(pool[i]);
    }
    if (picked.length < SLOTS) {
      sfx('error');
      toast('카드가 부족해요');
      return;
    }
    var deck = currentDeck();
    deck.length = 0;
    picked.forEach(function (id) { deck.push(id); });
    S.sel = -1;
    persist();
    sfx('coin');
    toast('랜덤 덱을 만들었어요');
    build();
  }

  /* ---------- sections ---------- */

  function buildTabs(d) {
    var row = el('div', 'deck-tabs');
    row.setAttribute('role', 'tablist');
    for (var i = 0; i < DECK_COUNT; i++) {
      (function (idx) {
        var on = idx === S.view;
        var b = el('button', 'deck-tab' + (on ? ' deck-tab-on' : ''));
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.appendChild(el('span', 'deck-tab-num', String(idx + 1)));
        if (d.activeDeck === idx) b.appendChild(el('span', 'deck-tab-live', '사용 중'));
        b.addEventListener('click', function () {
          if (S.view === idx) return;
          S.view = idx;
          S.sel = -1;
          sfx('click');
          build();
        });
        row.appendChild(b);
      })(i);
    }
    return row;
  }

  function buildHead(d, deck) {
    var head = el('div', 'deck-head');

    var name = makeBtn('', 'deck-name');
    name.appendChild(el('span', 'deck-name-text', d.deckNames[S.view]));
    name.appendChild(el('span', 'deck-name-edit', '✎'));
    name.setAttribute('aria-label', '덱 이름 바꾸기');
    name.addEventListener('click', renameDeck);
    head.appendChild(name);

    var stat = el('div', 'deck-elixir');
    stat.appendChild(drop());
    stat.appendChild(el('span', 'deck-elixir-val', avgCost(deck).toFixed(1)));
    stat.appendChild(el('span', 'deck-elixir-lbl', '평균 엘릭서'));
    head.appendChild(stat);
    return head;
  }

  function buildSlots(deck) {
    var grid = el('div', 'deck-slots');
    for (var i = 0; i < SLOTS; i++) {
      (function (idx) {
        var id = deck[idx];
        var def = id ? cardDef(id) : null;
        var on = S.sel === idx;
        var b = el('button', 'deck-slot' + (on ? ' deck-slot-sel' : ''));
        b.type = 'button';
        b.setAttribute('aria-label', (idx + 1) + '번 슬롯' + (on ? ' (선택됨)' : ''));
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (id && def) {
          b.appendChild(artNode(id, 'deck-slot-art'));
          b.appendChild(costBubble(def));
          b.appendChild(el('div', 'deck-slot-name', nameOf(id)));
        } else {
          b.classList.add('deck-slot-empty');
          b.appendChild(el('span', 'deck-slot-plus', '+'));
        }
        b.addEventListener('click', function () {
          S.sel = S.sel === idx ? -1 : idx;
          sfx('click');
          build();
        });
        grid.appendChild(b);
      })(i);
    }
    return grid;
  }

  function buildActions(d) {
    var row = el('div', 'deck-actions');
    var isActive = d.activeDeck === S.view;
    var useBtn = makeBtn(isActive ? '사용 중' : '이 덱으로 선택', 'deck-btn-use');
    if (isActive) {
      useBtn.disabled = true;
      useBtn.classList.add('deck-btn-live');
    }
    useBtn.addEventListener('click', setActive);
    row.appendChild(useBtn);

    var rnd = makeBtn('랜덤 덱', 'deck-btn-rand');
    rnd.addEventListener('click', randomDeck);
    row.appendChild(rnd);
    return row;
  }

  function buildCollection(deck) {
    var wrap = el('section', 'deck-section');
    var entries = allIds().map(function (id) {
      var def = cardDef(id);
      return def ? { id: id, def: def, name: nameOf(id), cost: num(def.cost) } : null;
    }).filter(Boolean);
    entries.sort(function (a, b) {
      if (a.cost !== b.cost) return a.cost - b.cost;
      return a.name.localeCompare(b.name, 'ko');
    });

    var h = el('h2', 'deck-h');
    h.appendChild(el('span', null, '카드 모음'));
    h.appendChild(el('span', 'deck-h-count', entries.length + '장'));
    wrap.appendChild(h);

    var grid = el('div', 'deck-coll');
    entries.forEach(function (e) {
      var inDeck = deck.indexOf(e.id) >= 0;
      var rar = rarityOf(e.def);
      var b = el('button', 'deck-card' + (inDeck ? ' deck-card-in' : ''));
      b.type = 'button';
      b.setAttribute('aria-label', e.name + (inDeck ? ' (덱에 있음)' : ''));

      var art = el('div', 'deck-card-art');
      art.appendChild(artNode(e.id, 'deck-card-img'));
      art.appendChild(costBubble(e.def));
      if (isCustom(e.id)) art.appendChild(el('span', 'deck-mod', 'MOD'));
      if (inDeck) art.appendChild(el('span', 'deck-check', '✓'));
      b.appendChild(art);

      var stripe = el('div', 'deck-card-stripe');
      stripe.style.background = rar.color;
      b.appendChild(stripe);
      b.appendChild(el('div', 'deck-card-name', e.name));

      b.addEventListener('click', function () { onCollectionTap(e.id); });
      grid.appendChild(b);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  function onCollectionTap(id) {
    if (S.sel >= 0) {
      var deck = currentDeck();
      if (!putInSlot(deck, S.sel, id)) return;
      S.sel = -1;
      build();
      return;
    }
    sfx('click');
    openInfo(id);
  }

  /* ---------- layout ---------- */

  function build() {
    var root = S.root;
    if (!root) return;
    closeModal();
    var d = data();
    var deck = currentDeck();

    root.innerHTML = '';
    root.classList.add('deck-root');

    var wrap = el('div', 'deck-wrap');
    wrap.appendChild(buildTabs(d));

    var panel = el('section', 'deck-panel');
    panel.appendChild(buildHead(d, deck));
    panel.appendChild(buildSlots(deck));

    var hint = el('p', 'deck-hint' + (S.sel >= 0 ? ' deck-hint-on' : ''),
      S.sel >= 0 ? '바꿀 카드를 아래에서 고르세요' : '슬롯을 누르면 카드를 바꿀 수 있어요');
    panel.appendChild(hint);
    panel.appendChild(buildActions(d));
    wrap.appendChild(panel);

    wrap.appendChild(buildCollection(deck));
    root.appendChild(wrap);
  }

  /* ---------- entry point ---------- */

  function render(root) {
    if (!root) return;
    S.root = root;
    S.view = data().activeDeck;
    S.sel = -1;
    build();
  }

  RA.UI.screens.deck = { render: render };
})();
