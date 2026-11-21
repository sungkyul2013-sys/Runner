/*
 * ui_shop.js - "상점" (shop) screen for the card-battle game.
 *
 * Classic script: no build step, no imports, vanilla DOM. Everything in the
 * shop is FREE. Prices appear only as struck-through decoration.
 *
 * Registers:  RA.UI.screens.shop = { render(root) }
 *   The host calls render(root) each time the shop opens. root is an empty
 *   <div>; this file clears it and fills it.
 *
 * Host contract. Every access is optional and guarded, so a missing piece
 * degrades quietly instead of crashing:
 *   RA.Save.data               { gold, gems,
 *                                settings: { cardLevel (1..16), aiSameLevel },
 *                                shop: { theme, towerSkin, emote[6], freeClaims } }
 *   RA.Save.save()             persist the profile
 *   RA.Save.addGold(n) / addGems(n)
 *   RA.Audio.play(name)        names: click, coin, chest, error
 *   RA.UI.toast(text)          short message
 *   RA.UI.refreshCurrency()    refresh the top currency bar
 *   RA.THEMES, RA.TOWER_SKINS  [{ id, name, emoji }]  (built-in defaults if absent)
 *   RA.EMOTE_POOL              [emoji string]         (built-in defaults if absent)
 *
 * Styles live in css/shop.css. All class names are prefixed with .shop-.
 */
(function () {
  'use strict';

  var RA = (window.RA = window.RA || {});
  RA.UI = RA.UI || {};
  RA.UI.screens = RA.UI.screens || {};

  var MAX_LEVEL = 16;
  var EMOTE_SLOTS = 6;

  /* ---------- built-in defaults (used when host data is missing) ---------- */

  var DEFAULT_THEMES = [
    { id: 'grass', name: '초원', emoji: '🌿' },
    { id: 'snow', name: '설원', emoji: '❄️' },
    { id: 'desert', name: '사막', emoji: '🏜️' },
    { id: 'night', name: '밤하늘', emoji: '🌌' }
  ];

  var DEFAULT_SKINS = [
    { id: 'classic', name: '클래식', emoji: '🏰' },
    { id: 'gold', name: '황금', emoji: '👑' },
    { id: 'shadow', name: '그림자', emoji: '🌑' }
  ];

  var DEFAULT_EMOTES = [
    '😀', '😂', '😎', '😡', '😭', '😱',
    '🥳', '🤔', '😴', '🤩', '👍', '👏',
    '🔥', '💀', '🎉', '❤️', '👋', '🙏'
  ];

  /* ---------- static content ---------- */

  // gold/gems are [min, max] reward ranges; fake = struck-through "original" price.
  var CHESTS = [
    { id: 'wood', name: '나무 상자', emoji: '📦', fake: 4900,
      gold: [5000, 15000], gems: [50, 150] },
    { id: 'gold', name: '황금 상자', emoji: '🧰', fake: 9900,
      gold: [20000, 35000], gems: [150, 300] },
    { id: 'magic', name: '마법 상자', emoji: '🔮', fake: 19900,
      gold: [40000, 50000], gems: [300, 500] }
  ];

  var GOLD_PACKS = [
    { amount: 10000, fake: 3900 },
    { amount: 50000, fake: 14900 },
    { amount: 150000, fake: 39900 }
  ];

  var GEM_PACKS = [
    { amount: 100, fake: 1900 },
    { amount: 500, fake: 7900 },
    { amount: 2000, fake: 24900 }
  ];

  /* ---------- per-render state (rebuilt on every render) ---------- */

  var R = {};                              // DOM refs for live updates
  var EMOTE_UI = { openIdx: -1 };          // which emote slot the picker is open for
  var busyChest = {};                      // chest id -> true while shaking
  var modalEl = null;                      // current reward modal backdrop
  var fallbackData = {};                   // used only if RA.Save.data is missing

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

  function fmt(n) {
    return num(n).toLocaleString('ko-KR');
  }

  function clampLevel(v) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) n = 1;
    return Math.min(MAX_LEVEL, Math.max(1, n));
  }

  function roll(range, step) {
    var v = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
    return Math.round(v / step) * step;
  }

  function warn(e) {
    if (window.console) console.warn('[shop]', e);
  }

  function makeBtn(text, extraCls) {
    var b = el('button', 'shop-btn' + (extraCls ? ' ' + extraCls : ''), text);
    b.type = 'button';
    return b;
  }

  function priceRow(fakePrice) {
    var row = el('div', 'shop-price');
    row.appendChild(el('s', 'shop-fake', '정가 ₩' + fmt(fakePrice)));
    row.appendChild(el('span', 'shop-free', '무료'));
    return row;
  }

  function flash(node) {
    node.classList.remove('shop-flash');
    void node.offsetWidth; // restart the animation
    node.classList.add('shop-flash');
  }

  /* ---------- host data access ---------- */

  function normalize(list, fallback) {
    var src = Array.isArray(list) && list.length ? list : fallback;
    return src.map(function (it, i) {
      if (typeof it === 'string') return { id: it, name: it, emoji: '🎴' };
      it = it || {};
      return {
        id: String(it.id != null ? it.id : i),
        name: String(it.name || it.id || '#' + (i + 1)),
        emoji: String(it.emoji || '🎴')
      };
    });
  }

  function themes() { return normalize(RA.THEMES, DEFAULT_THEMES); }
  function skins() { return normalize(RA.TOWER_SKINS, DEFAULT_SKINS); }

  function emotePool() {
    var pool = Array.isArray(RA.EMOTE_POOL)
      ? RA.EMOTE_POOL.filter(function (e) { return typeof e === 'string' && e; })
      : [];
    return pool.length ? pool : DEFAULT_EMOTES;
  }

  // Returns the profile with the shop-related shape guaranteed.
  function data() {
    var d = RA.Save && RA.Save.data;
    if (!d || typeof d !== 'object') d = fallbackData;

    d.gold = num(d.gold);
    d.gems = num(d.gems);

    if (!d.settings || typeof d.settings !== 'object') d.settings = {};
    d.settings.cardLevel = clampLevel(d.settings.cardLevel);

    if (!d.shop || typeof d.shop !== 'object') d.shop = {};
    var s = d.shop;
    if (typeof s.theme !== 'string') s.theme = themes()[0].id;
    if (typeof s.towerSkin !== 'string') s.towerSkin = skins()[0].id;
    if (!Array.isArray(s.emote)) s.emote = [];
    var pool = emotePool();
    for (var i = 0; i < EMOTE_SLOTS; i++) {
      if (typeof s.emote[i] !== 'string') s.emote[i] = pool[i % pool.length];
    }
    s.emote.length = EMOTE_SLOTS;
    s.freeClaims = num(s.freeClaims);
    return d;
  }

  /* ---------- host calls (all guarded) ---------- */

  function persist() {
    try {
      if (RA.Save && typeof RA.Save.save === 'function') RA.Save.save();
    } catch (e) { warn(e); }
  }

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

  function refreshCurrency() {
    try {
      if (RA.UI && typeof RA.UI.refreshCurrency === 'function') RA.UI.refreshCurrency();
    } catch (e) { warn(e); }
  }

  function grant(kind, amount) {
    try {
      var save = RA.Save;
      if (kind === 'gold' && save && typeof save.addGold === 'function') {
        save.addGold(amount);
      } else if (kind === 'gems' && save && typeof save.addGems === 'function') {
        save.addGems(amount);
      } else {
        var d = data();
        d[kind] = num(d[kind]) + amount;
      }
    } catch (e) { warn(e); }
  }

  // Every action ends here: persist, sound, currency bar.
  function commit(sound) {
    persist();
    sfx(sound || 'click');
    refreshCurrency();
  }

  function countClaim() {
    data().shop.freeClaims += 1;
    updateClaims();
  }

  function updateClaims() {
    if (R.claims) R.claims.textContent = '무료 수령 ' + fmt(data().shop.freeClaims) + '회';
  }

  /* ---------- reward modal ---------- */

  function closeModal() {
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
  }

  function rewardRow(label, value) {
    var r = el('div', 'shop-reward');
    r.appendChild(el('span', null, label));
    r.appendChild(el('span', 'shop-reward-val', value));
    return r;
  }

  function showReward(title, reward) {
    closeModal();
    var back = el('div', 'shop-modal-backdrop');
    var box = el('div', 'shop-modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', title + ' 보상');

    box.appendChild(el('div', 'shop-modal-emoji', '🎉'));
    box.appendChild(el('div', 'shop-modal-title', title + ' 개봉!'));

    var list = el('div', 'shop-reward-list');
    list.appendChild(rewardRow('🪙 골드', '+' + fmt(reward.gold)));
    list.appendChild(rewardRow('💎 보석', '+' + fmt(reward.gems)));
    box.appendChild(list);

    var ok = makeBtn('확인', 'shop-btn-wide');
    ok.addEventListener('click', closeModal);
    box.appendChild(ok);

    back.appendChild(box);
    back.addEventListener('click', function (e) {
      if (e.target === back) closeModal();
    });

    (document.body || document.documentElement).appendChild(back);
    modalEl = back;
  }

  /* ---------- section 1: free chests ---------- */

  function openChest(chest, card, btn) {
    if (busyChest[chest.id]) return;
    busyChest[chest.id] = true;
    btn.disabled = true;
    sfx('chest');
    flash(card);
    card.classList.add('shop-shaking');

    setTimeout(function () {
      card.classList.remove('shop-shaking');
      busyChest[chest.id] = false;
      btn.disabled = false;

      var reward = { gold: roll(chest.gold, 100), gems: roll(chest.gems, 10) };
      grant('gold', reward.gold);
      grant('gems', reward.gems);
      countClaim();
      commit('coin');
      showReward(chest.name, reward);
    }, 1000);
  }

  function buildChests() {
    var grid = el('div', 'shop-chests');
    CHESTS.forEach(function (c) {
      var card = el('div', 'shop-chest shop-chest-' + c.id);
      card.appendChild(el('div', 'shop-chest-emoji', c.emoji));

      var info = el('div', 'shop-chest-info');
      info.appendChild(el('div', 'shop-chest-name', c.name));
      info.appendChild(el('div', 'shop-chest-desc',
        '골드 ' + fmt(c.gold[0]) + '~' + fmt(c.gold[1]) +
        ' · 보석 ' + fmt(c.gems[0]) + '~' + fmt(c.gems[1])));
      info.appendChild(priceRow(c.fake));
      card.appendChild(info);

      var b = makeBtn('무료 열기', 'shop-btn-free');
      b.addEventListener('click', function () { openChest(c, card, b); });
      card.appendChild(b);

      grid.appendChild(card);
    });
    return grid;
  }

  /* ---------- sections 2-3: gold and gem packs ---------- */

  function claimPack(row, kind, amount) {
    grant(kind, amount);
    countClaim();
    commit('coin');
    flash(row);
    toast((kind === 'gold' ? '골드 +' : '보석 +') + fmt(amount) + ' 받았어요! (무료)');
  }

  function buildPacks(list, kind) {
    var box = el('div', 'shop-packs');
    list.forEach(function (p) {
      var row = el('div', 'shop-pack');
      row.appendChild(el('div', 'shop-pack-icon', kind === 'gold' ? '🪙' : '💎'));

      var info = el('div', 'shop-pack-info');
      info.appendChild(el('div', 'shop-pack-title',
        (kind === 'gold' ? '골드 ' : '보석 ') + fmt(p.amount)));
      info.appendChild(priceRow(p.fake));
      row.appendChild(info);

      var b = makeBtn('무료 받기', 'shop-btn-free');
      b.addEventListener('click', function () { claimPack(row, kind, p.amount); });
      row.appendChild(b);

      box.appendChild(row);
    });
    return box;
  }

  /* ---------- section 4: card level ---------- */

  function setLevel(level) {
    data().settings.cardLevel = clampLevel(level);
    persist();
    syncLevel();
  }

  function syncLevel() {
    if (!R.slider) return;
    var d = data();
    var lv = d.settings.cardLevel;
    R.slider.value = String(lv);
    R.levelVal.textContent = 'Lv. ' + lv + ' / ' + MAX_LEVEL;
    R.levelNote.textContent = '이 레벨은 플레이어의 카드에 적용돼요. ' +
      (d.settings.aiSameLevel
        ? 'AI 카드도 같은 레벨이 됩니다 (aiSameLevel 켜짐).'
        : 'AI 카드는 AI 설정을 따릅니다 (aiSameLevel 꺼짐).');
  }

  function buildLevel() {
    var wrap = el('div', 'shop-level');

    var big = makeBtn('무료 · 모든 카드 최대 레벨 (' + MAX_LEVEL + ')', 'shop-btn-big');
    big.addEventListener('click', function () {
      setLevel(MAX_LEVEL);
      commit('click');
      toast('모든 카드 최대 레벨! (무료)');
    });
    wrap.appendChild(big);
    wrap.appendChild(priceRow(29900));

    var row = el('div', 'shop-slider-row');
    row.appendChild(el('span', 'shop-slider-min', '1'));
    var input = el('input', 'shop-slider');
    input.type = 'range';
    input.min = '1';
    input.max = String(MAX_LEVEL);
    input.step = '1';
    row.appendChild(input);
    row.appendChild(el('span', 'shop-slider-max', String(MAX_LEVEL)));
    wrap.appendChild(row);

    R.levelVal = el('div', 'shop-level-val');
    R.levelNote = el('p', 'shop-note');
    wrap.appendChild(R.levelVal);
    wrap.appendChild(R.levelNote);
    R.slider = input;

    // Live save while dragging; click sound only when the drag ends.
    input.addEventListener('input', function () { setLevel(input.value); });
    input.addEventListener('change', function () { sfx('click'); });

    return wrap;
  }

  /* ---------- sections 5-6: theme and tower skin pickers ---------- */

  function renderChoices(container, items, key) {
    container.innerHTML = '';
    var current = data().shop[key];

    items.forEach(function (it, i) {
      var on = it.id === current;
      var card = el('div', 'shop-choice' + (on ? ' shop-choice-on' : ''));
      card.appendChild(el('div', 'shop-choice-emoji', it.emoji));
      card.appendChild(el('div', 'shop-choice-name', it.name));
      card.appendChild(priceRow(2900 + (i % 4) * 1000));

      if (on) {
        card.appendChild(el('div', 'shop-badge', '사용 중'));
      } else {
        var b = makeBtn('무료 장착');
        b.addEventListener('click', function () {
          data().shop[key] = it.id;
          commit('click');
          toast('"' + it.name + '" 장착 완료! (무료)');
          renderChoices(container, items, key);
        });
        card.appendChild(b);
      }
      container.appendChild(card);
    });
  }

  function buildChoices(key, items) {
    var grid = el('div', 'shop-grid');
    renderChoices(grid, items, key);
    return grid;
  }

  /* ---------- section 7: emotes ---------- */

  function closePicker() {
    EMOTE_UI.openIdx = -1;
    if (R.emotePicker) {
      R.emotePicker.hidden = true;
      R.emotePicker.innerHTML = '';
    }
    renderEmoteSlots();
  }

  function pickEmote(emoji) {
    var i = EMOTE_UI.openIdx;
    if (i < 0) return;
    data().shop.emote[i] = emoji;
    commit('click');
    toast('이모트 교체 완료! (무료)');
    closePicker();
  }

  function renderPicker() {
    var p = R.emotePicker;
    if (!p) return;
    p.innerHTML = '';
    p.hidden = false;

    var head = el('div', 'shop-picker-head');
    head.appendChild(el('span', 'shop-picker-title',
      '슬롯 ' + (EMOTE_UI.openIdx + 1) + ' 이모트 선택'));
    var close = makeBtn('닫기', 'shop-btn-ghost');
    close.addEventListener('click', closePicker);
    head.appendChild(close);
    p.appendChild(head);

    var grid = el('div', 'shop-picker-grid');
    var current = data().shop.emote[EMOTE_UI.openIdx];
    emotePool().forEach(function (emoji) {
      var cell = el('button', 'shop-picker-cell' + (emoji === current ? ' shop-picker-cur' : ''), emoji);
      cell.type = 'button';
      cell.setAttribute('aria-label', emoji);
      cell.addEventListener('click', function () { pickEmote(emoji); });
      grid.appendChild(cell);
    });
    p.appendChild(grid);
    p.appendChild(priceRow(1900));
  }

  function renderEmoteSlots() {
    var box = R.emoteSlots;
    if (!box) return;
    box.innerHTML = '';
    data().shop.emote.forEach(function (emoji, i) {
      var b = el('button', 'shop-emote-slot' + (EMOTE_UI.openIdx === i ? ' shop-emote-open' : ''));
      b.type = 'button';
      b.setAttribute('aria-label', '이모트 슬롯 ' + (i + 1) + ': ' + emoji);
      b.appendChild(el('span', 'shop-emote-emoji', emoji));
      b.appendChild(el('span', 'shop-emote-cap', '무료 교체'));
      b.addEventListener('click', function () { togglePicker(i); });
      box.appendChild(b);
    });
  }

  function togglePicker(i) {
    if (EMOTE_UI.openIdx === i) {
      closePicker();
      return;
    }
    EMOTE_UI.openIdx = i;
    sfx('click');
    renderEmoteSlots();
    renderPicker();
  }

  function buildEmotes() {
    var wrap = el('div', 'shop-emotes');
    R.emoteSlots = el('div', 'shop-emote-slots');
    R.emotePicker = el('div', 'shop-picker');
    R.emotePicker.hidden = true;
    wrap.appendChild(R.emoteSlots);
    wrap.appendChild(R.emotePicker);
    wrap.appendChild(el('p', 'shop-note', '칸을 눌러 이모트를 바꾸세요. 전부 무료!'));
    renderEmoteSlots();
    if (EMOTE_UI.openIdx >= 0) renderPicker();
    return wrap;
  }

  /* ---------- layout ---------- */

  function section(icon, title, body) {
    var s = el('section', 'shop-section');
    var h = el('h2', 'shop-h');
    h.appendChild(el('span', 'shop-h-icon', icon));
    h.appendChild(el('span', null, title));
    s.appendChild(h);
    s.appendChild(body);
    return s;
  }

  function buildHeader() {
    var h = el('div', 'shop-header');
    var titles = el('div', 'shop-titles');
    titles.appendChild(el('div', 'shop-title', '🛒 상점'));
    titles.appendChild(el('div', 'shop-sub', '모든 것이 무료!'));
    h.appendChild(titles);
    R.claims = el('div', 'shop-claims');
    h.appendChild(R.claims);
    return h;
  }

  /* ---------- entry point ---------- */

  function render(root) {
    if (!root) return;
    closeModal();
    R = {};
    EMOTE_UI.openIdx = -1;

    root.innerHTML = '';
    root.classList.add('shop-root');
    data(); // make sure the host profile has the shop shape

    var wrap = el('div', 'shop-wrap');
    wrap.appendChild(buildHeader());
    wrap.appendChild(section('🎁', '무료 상자', buildChests()));
    wrap.appendChild(section('🪙', '골드 팩', buildPacks(GOLD_PACKS, 'gold')));
    wrap.appendChild(section('💎', '보석 팩', buildPacks(GEM_PACKS, 'gems')));
    wrap.appendChild(section('🃏', '카드 레벨', buildLevel()));
    wrap.appendChild(section('🏟️', '아레나 테마', buildChoices('theme', themes())));
    wrap.appendChild(section('🏰', '타워 스킨', buildChoices('towerSkin', skins())));
    wrap.appendChild(section('😀', '이모트', buildEmotes()));
    root.appendChild(wrap);

    updateClaims();
    syncLevel();
  }

  RA.UI.screens.shop = { render: render };
})();
