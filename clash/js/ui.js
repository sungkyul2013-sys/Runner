/* Royale Arena — UI shell: screens, navigation, toast, modal, home & settings screens.
   Other screens (shop, deck, mods, battle) register themselves in RA.UI.screens. */
(function () {
  const RA = (window.RA = window.RA || {});
  const UI = (RA.UI = RA.UI || {});
  UI.screens = UI.screens || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  UI.el = el;
  const play = (n) => { try { RA.Audio && RA.Audio.play(n); } catch (e) {} };

  let toastT = 0;
  UI.toast = function (text) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); };
  UI.refreshCurrency = function () { const d = RA.Save.data; $('#tb-gold').textContent = Math.floor(d.gold).toLocaleString(); $('#tb-gems').textContent = Math.floor(d.gems).toLocaleString(); $('#tb-trophy').textContent = d.trophies; };
  UI.modal = function (node) {
    const back = el('div', 'modal-back'); const m = el('div', 'modal'); m.appendChild(node); back.appendChild(m); $('#modal-root').appendChild(back);
    const api = { close() { back.remove(); }, el: m }; back.addEventListener('pointerdown', (e) => { if (e.target === back && node.dataset.sticky !== '1') api.close(); }); return api;
  };

  const NAV = [['shop', '🛒', '상점'], ['deck', '🃏', '덱'], ['home', '⚔️', '전투'], ['mods', '🧩', 'Mod'], ['settings', '⚙️', '설정']];
  UI.current = 'home';
  UI.showScreen = function (name) {
    const host = $('#screens'); let s = $('#screen-' + name);
    if (!s) { s = el('section', 'screen'); s.id = 'screen-' + name; host.appendChild(s); }
    document.querySelectorAll('.screen').forEach((x) => x.classList.remove('active')); s.classList.add('active');
    document.body.classList.toggle('in-battle', name === 'battle');
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.s === name));
    UI.current = name; const sc = UI.screens[name];
    if (sc && sc.render) { s.innerHTML = ''; try { sc.render(s); } catch (e) { console.error(e); s.innerHTML = '<p style="padding:20px">화면 오류: ' + e.message + '</p>'; } }
    UI.refreshCurrency(); s.scrollTop = 0;
  };
  UI.startBattle = function (mode) { play('click'); RA.Battle.start({ practice: mode === 'practice' }); };

  // ---------------- home ----------------
  UI.screens.home = {
    render(root) {
      const d = RA.Save.data, deck = d.decks[d.activeDeck], diff = d.settings.difficulty;
      const modOn = RA.Mods.active();
      root.innerHTML = '';
      const hero = el('div', 'home-hero', '<div class="home-logo">ROYALE ARENA' + (modOn ? '<span class="mod-on">MOD</span>' : '') + '</div><div class="home-sub">로얄 아레나 · 모든 카드 · 모든 아이템 무료</div>');
      root.appendChild(hero);
      const th = RA.THEMES.find((t) => t.id === d.shop.theme) || RA.THEMES[0];
      const arena = el('div', 'home-arena'); const imgs = [el('img', 'ha-img on'), el('img', 'ha-img')]; imgs.forEach((im) => { im.alt = ''; arena.appendChild(im); });
      arena.appendChild(el('div', 'ha-shade')); const tag = el('div', 'ha-tag', th.emoji + ' ' + th.name); arena.appendChild(tag); const lab = el('div', 'ha-card'); arena.appendChild(lab);
      let hi = 0, cur = 0; const showHero = () => { const id = deck[hi++ % deck.length], nx = 1 - cur; imgs[nx].onload = () => { imgs[cur].classList.remove('on'); imgs[nx].classList.add('on'); cur = nx; }; imgs[nx].src = 'assets/arena/' + RA.Mods.artOf(id) + '.jpg'; const dd = RA.Mods.card(id); lab.innerHTML = '<b>' + RA.Mods.nameOf(id) + '</b><span style="color:' + RA.RARITY[dd.rarity].color + '">' + RA.RARITY[dd.rarity].name + '</span><i>💧' + dd.cost + '</i>'; };
      showHero(); clearInterval(UI._hero); UI._hero = setInterval(() => { if (UI.current !== 'home') clearInterval(UI._hero); else showHero(); }, 3600);
      root.appendChild(arena);
      const avg = (deck.reduce((s, id) => s + RA.Mods.card(id).cost, 0) / 8).toFixed(1);
      const dk = el('div'); dk.innerHTML = '<div style="text-align:center;font-weight:800;font-size:13px;color:#9fb4e4">' + (d.deckNames[d.activeDeck] || '덱') + ' · 평균 💧' + avg + '</div>';
      const grid = el('div', 'home-deck'); deck.forEach((id) => { const im = new Image(); im.src = 'assets/cards/' + RA.Mods.artOf(id) + '.png'; grid.appendChild(im); }); dk.appendChild(grid); root.appendChild(dk);
      const chips = el('div', 'ra-chips'); Object.keys(RA.DIFFICULTY).forEach((k) => { const c = el('button', 'ra-chip' + (k === diff ? ' on' : ''), RA.DIFFICULTY[k].name); c.onclick = () => { d.settings.difficulty = k; RA.Save.save(); play('click'); UI.screens.home.render(root); }; chips.appendChild(c); }); root.appendChild(chips);
      const b1 = el('button', 'ra-btn gold', '⚔️ 전투 시작 (vs AI)'); b1.onclick = () => UI.startBattle('battle'); root.appendChild(b1);
      const row = el('div', 'ra-row'); row.style.marginTop = '10px';
      const b2 = el('button', 'ra-btn small', '🎯 연습 모드<br><small>무한 엘릭서·무제한 시간</small>'); b2.onclick = () => UI.startBattle('practice');
      const b3 = el('button', 'ra-btn small purple', '🧩 Mod 모드<br><small>' + (modOn ? '활성 Mod 적용 중' : '규칙·카드 개조') + '</small>'); b3.onclick = () => { play('click'); UI.showScreen('mods'); };
      row.appendChild(b2); row.appendChild(b3); root.appendChild(row);
      const bg = el('button', 'ra-btn small', '📘 아레나 가이드 · 배치 기준도'); bg.style.marginTop = '10px'; bg.onclick = () => { play('click'); UI.guideBack = 'home'; UI.showScreen('guide'); }; root.appendChild(bg);
      const st = el('div', 'home-stats', '<div><b>' + d.wins + '</b>승</div><div><b>' + d.losses + '</b>패</div><div><b>' + d.draws + '</b>무</div><div><b>' + d.crowns + '</b>👑</div><div><b>' + d.settings.cardLevel + '</b>카드 Lv</div>');
      root.appendChild(st);
    },
  };

  // ---------------- settings ----------------
  UI.screens.settings = {
    render(root) {
      const d = RA.Save.data, s = d.settings; root.innerHTML = '<div class="ra-banner">설정</div>';
      const toggle = (label, key, after) => { const r = el('div', 'set-row'); r.innerHTML = '<span>' + label + '</span>'; const sw = el('div', 'switch' + (s[key] ? ' on' : '')); sw.onclick = () => { s[key] = !s[key]; sw.classList.toggle('on', s[key]); RA.Save.save(); play('click'); after && after(); }; r.appendChild(sw); root.appendChild(r); };
      toggle('효과음', 'sound'); toggle('배경 음악', 'music', () => (s.music ? RA.Audio.startMusic() : RA.Audio.stopMusic()));
      toggle('데미지 숫자 표시', 'damageNumbers'); toggle('AI도 같은 카드 레벨 사용', 'aiSameLevel');
      const v = el('div', 'set-row', '<span>볼륨</span>'); const vr = el('input'); vr.type = 'range'; vr.min = 0; vr.max = 1; vr.step = 0.05; vr.value = s.volume; vr.oninput = () => { s.volume = +vr.value; RA.Audio.setVolume(s.volume); RA.Save.save(); }; v.appendChild(vr); root.appendChild(v);
      const l = el('div', 'set-row', '<span>카드 레벨 <b id="lv-read">' + s.cardLevel + '</b></span>'); const lr = el('input'); lr.type = 'range'; lr.min = 1; lr.max = 16; lr.step = 1; lr.value = s.cardLevel; lr.oninput = () => { s.cardLevel = +lr.value; $('#lv-read').textContent = s.cardLevel; RA.Save.save(); }; l.appendChild(lr); root.appendChild(l);
      const df = el('div', 'set-row', '<span>AI 난이도</span>'); const sel = el('select'); sel.style.cssText = 'padding:6px;border-radius:8px;font-weight:800'; Object.keys(RA.DIFFICULTY).forEach((k) => { const o = el('option', '', RA.DIFFICULTY[k].name); o.value = k; if (k === s.difficulty) o.selected = true; sel.appendChild(o); }); sel.onchange = () => { s.difficulty = sel.value; RA.Save.save(); }; df.appendChild(sel); root.appendChild(df);
      const gd = el('button', 'ra-btn small', '📘 아레나 가이드'); gd.style.marginTop = '12px'; gd.onclick = () => { UI.guideBack = 'settings'; UI.showScreen('guide'); }; root.appendChild(gd);
      const rs = el('button', 'ra-btn red small', '🗑️ 모든 저장 데이터 초기화'); rs.style.marginTop = '14px'; rs.onclick = () => { if (confirm('덱·Mod·설정을 모두 초기화할까요?')) { RA.Save.reset(); UI.refreshCurrency(); UI.showScreen('home'); UI.toast('초기화 완료'); } }; root.appendChild(rs);
      root.appendChild(el('p', '', '<br><small style="color:#9fb4e4;line-height:1.6">로얄 아레나는 개인용 팬 메이드 프로젝트입니다. 카드 이미지는 사용자가 직접 제공한 파일을 사용하며, 상용 배포용이 아닙니다.<br>조작: 카드를 눌러 선택 후 아레나를 탭하거나, 카드를 아레나로 드래그하세요. 챔피언 능력은 전투 화면의 노란 버튼.</small>'));
    },
  };

  UI.init = function () {
    const nav = $('#nav'); nav.innerHTML = '';
    NAV.forEach(([id, ico, label]) => { const b = el('button', 'nav-btn', '<span class="ni">' + ico + '</span>' + label); b.dataset.s = id; b.onclick = () => { play('click'); UI.showScreen(id); }; nav.appendChild(b); });
    UI.showScreen('home');
    document.addEventListener('pointerdown', function first() { document.removeEventListener('pointerdown', first); RA.Audio.init(); if (RA.Save.data.settings.music) RA.Audio.startMusic(); }, { once: true });
  };
})();
