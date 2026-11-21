/* Royale Arena — battle screen: canvas arena + DOM hand/elixir HUD, drag-or-tap card deployment, pause, emotes, result. */
(function () {
  const RA = (window.RA = window.RA || {});
  const UI = (RA.UI = RA.UI || {});
  UI.screens = UI.screens || {};
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const play = (n) => { try { RA.Audio && RA.Audio.play(n); } catch (e) {} };

  const B = (RA.Battle = { game: null });
  let root, rend, canvas, hud = {}, ui = {}, sel = null, drag = null, paused = false, last = 0, raf = 0, handEls = [], running = false, endTimer = 0, rewardGiven = false, onWin, onMove, onUp, onVis;

  B.start = function (opts) {
    const d = RA.Save.data, decks = RA.Save.defaults().decks, s = d.settings;
    rewardGiven = false; clearTimeout(endTimer); sel = null; drag = null; paused = false; ui = {};
    B.opts = opts || {};
    B.game = new RA.Game({ deck0: d.decks[d.activeDeck].slice(), deck1: decks[Math.floor(Math.random() * decks.length)].slice(), level0: s.cardLevel, level1: s.aiSameLevel ? s.cardLevel : 11,
      difficulty: B.opts.practice ? 'easy' : s.difficulty, practice: !!B.opts.practice, onEnd: onEnd });
    UI.showScreen('battle');
  };
  B.stop = function () {
    running = false; cancelAnimationFrame(raf); clearTimeout(endTimer);
    document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); window.removeEventListener('resize', onWin); document.removeEventListener('visibilitychange', onVis);
    B.game = null; UI.showScreen('home');
  };

  UI.screens.battle = {
    render(r) {
      if (!B.game) { UI.showScreen('home'); return; }
      root = r; root.innerHTML = '';
      const wrap = el('div'); wrap.id = 'battle-root';
      wrap.innerHTML = '<div class="bt-top"><button class="bt-pause">⏸</button><div class="bt-crowns enemy" id="bt-ec"><i>👑</i><i>👑</i><i>👑</i></div><div class="bt-timer"><span id="bt-time">3:00</span><small id="bt-tag"></small></div><div class="bt-crowns you" id="bt-yc"><i>👑</i><i>👑</i><i>👑</i></div></div>' +
        '<div id="arena-wrap"><canvas id="arena"></canvas></div>' +
        '<div class="bt-bottom"><button class="bt-emote-btn">💬</button><button class="bt-guide-btn">📐</button><div class="bt-emotes"></div><button class="bt-ability"></button>' +
        '<div class="bt-hand"><div class="bt-next">다음<img alt=""></div><div class="bt-cards"></div></div>' +
        '<div class="bt-elixir"><i></i><div class="ticks"></div><b>5</b></div></div>';
      root.appendChild(wrap);
      canvas = wrap.querySelector('#arena'); rend = new RA.Renderer(canvas);
      hud = { time: wrap.querySelector('#bt-time'), tag: wrap.querySelector('#bt-tag'), ec: wrap.querySelector('#bt-ec'), yc: wrap.querySelector('#bt-yc'), fill: wrap.querySelector('.bt-elixir i'), num: wrap.querySelector('.bt-elixir b'),
        next: wrap.querySelector('.bt-next img'), ab: wrap.querySelector('.bt-ability'), emotes: wrap.querySelector('.bt-emotes'), cards: wrap.querySelector('.bt-cards'), wrap: wrap.querySelector('#arena-wrap') };
      handEls = [];
      for (let i = 0; i < 4; i++) {
        const b = el('button', 'bt-card', '<img alt=""><div class="cost"></div>'); b.dataset.slot = i; hud.cards.appendChild(b); handEls.push(b);
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (paused || B.game.phase === 'ended') return; sel = i; drag = { slot: i, sx: e.clientX, sy: e.clientY, moved: false, pt: e.pointerType }; play('click'); setPreview(e); });
      }
      wrap.querySelector('.bt-pause').onclick = pauseMenu;
      hud.ab.onclick = () => { if (!paused && B.game.useAbility(0)) play('spell'); else play('error'); };
      const gb = wrap.querySelector('.bt-guide-btn'); gb.onclick = () => { ui.guide = !ui.guide; gb.classList.toggle('on', !!ui.guide); play('click'); if (ui.guide) UI.toast('📐 배치 가이드: 4-3 / 3-3 건물 자리 · 카이팅 · 출발 지점'); };
      const eb = wrap.querySelector('.bt-emote-btn'); eb.onclick = () => { hud.emotes.classList.toggle('show'); };
      RA.Save.data.shop.emote.forEach((em) => { const b = el('button', '', em); b.onclick = () => { hud.emotes.classList.remove('show'); emote(em, 'you'); }; hud.emotes.appendChild(b); });
      canvas.addEventListener('pointermove', (e) => { if (!drag && sel != null && e.pointerType === 'mouse') setPreview(e); });
      canvas.addEventListener('pointerup', (e) => { if (!drag && sel != null && !paused) place(e, false); });
      onMove = (e) => { if (!drag) return; if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 12) drag.moved = true; setPreview(e); };
      onUp = (e) => { if (!drag) return; const d = drag; drag = null; if (d.moved) { if (overCanvas(e) && !paused) { drag = d; place(e, true); drag = null; } else { sel = null; ui.preview = null; ui.zone = false; } } };
      onWin = () => { if (rend) rend.resize(); }; onVis = () => { if (document.hidden && B.game && B.game.phase !== 'ended') { paused = true; } };
      document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); window.addEventListener('resize', onWin); document.addEventListener('visibilitychange', onVis);
      requestAnimationFrame(() => rend.resize());
      B.game.fx.push({ k: 'banner', text: B.opts.practice ? '연습 모드' : '전투 시작!', t: 0, dur: 2 });
      running = true; last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    },
  };

  function overCanvas(e) { const r = canvas.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; }
  function pointer(e, shift) { const p = rend.toArena(e.clientX, e.clientY); if (shift) p.y -= 1.6; return p; }
  function setPreview(e) {
    const slot = drag ? drag.slot : sel; if (slot == null || !B.game) { ui.preview = null; ui.zone = false; return; }
    const id = B.game.hands[0].hand[slot], def = RA.Mods.card(id), shift = drag && drag.moved && drag.pt === 'touch', p = pointer(e, shift);
    ui.zone = def.type !== 'spell' && !B.game.rules.deployAnywhere;
    ui.preview = overCanvas(e) ? { x: p.x, y: p.y, def, art: RA.Mods.artOf(id), valid: B.game.canDeploy(0, def, p.x, p.y) } : null;
  }
  function place(e, dragged) {
    const slot = drag ? drag.slot : sel; if (slot == null) return;
    const g = B.game, id = g.hands[0].hand[slot], def = RA.Mods.card(id), p = pointer(e, dragged && drag && drag.pt === 'touch');
    if (g.playCard(0, slot, p.x, p.y)) { sel = null; ui.preview = null; ui.zone = false; }
    else {
      play('error');
      if (!g.canAfford(0, def)) UI.toast('엘릭서가 부족해요'); else if (def.champion && g.championAlive(0)) UI.toast('챔피언은 한 번에 1명만'); else UI.toast('여기에는 낼 수 없어요');
      if (dragged) { sel = null; ui.preview = null; ui.zone = false; }
    }
  }
  function emote(em, who) {
    const b = el('div', 'bt-bubble ' + who, em); hud.wrap.appendChild(b); play('emote'); setTimeout(() => b.remove(), 2000);
    if (who === 'you' && Math.random() < 0.5) setTimeout(() => emote(['😀', '👍', '😡', '😭', '🤔'][Math.floor(Math.random() * 5)], 'enemy'), 900 + Math.random() * 800);
  }

  function frame(ts) {
    if (!running || !B.game) return; raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts; const g = B.game;
    if (!paused) g.update(dt);
    rend.draw(g, ui); updateHud(g);
  }
  function setCrowns(box, n) { [...box.children].forEach((c, i) => { const on = i < n; if (on && !c.classList.contains('on')) { c.classList.add('on', 'pop'); setTimeout(() => c.classList.remove('pop'), 600); } else if (!on) c.classList.remove('on'); }); }
  function fmt(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  function updateHud(g) {
    hud.time.textContent = g.practice ? '∞' : fmt(g.timeLeft);
    hud.tag.textContent = g.phase === 'overtime' ? '연장전 · 엘릭서 ×3' : (!g.practice && (g.rules.doubleAlways || g.timeLeft <= 60)) ? '엘릭서 ×2' : (g.practice ? '연습' : '');
    setCrowns(hud.ec, g.crowns[1]); setCrowns(hud.yc, g.crowns[0]); hud.time.parentNode.classList.toggle('warn', !g.practice && g.phase !== 'ended' && g.timeLeft <= 10);
    const free = g.practice || g.rules.infiniteElixir, ex = free ? g.rules.maxElixir : g.elixir[0];
    hud.fill.style.width = (ex / g.rules.maxElixir * 100) + '%'; hud.num.textContent = free ? '∞' : Math.floor(ex);
    const h = g.hands[0];
    handEls.forEach((b, i) => {
      const id = h.hand[i], d = RA.Mods.card(id), art = RA.Mods.artOf(id);
      if (b.dataset.id !== id) { b.dataset.id = id; b.firstChild.src = 'assets/cards/' + art + '.png'; b.lastChild.textContent = d.cost; b.classList.toggle('champ', !!d.champion); }
      b.classList.toggle('no', !g.playable(0, id)); b.classList.toggle('sel', sel === i);
    });
    const nid = h.queue[0]; if (hud.next.dataset.id !== nid) { hud.next.dataset.id = nid; hud.next.src = 'assets/cards/' + RA.Mods.artOf(nid) + '.png'; }
    const ai = g.abilityInfo(0);
    if (ai) { hud.ab.classList.add('show'); hud.ab.classList.toggle('no', !ai.ready); hud.ab.textContent = '✨ ' + ai.name + ' 💧' + ai.cost + (ai.cd > 0 ? ' (' + Math.ceil(ai.cd) + ')' : ''); } else hud.ab.classList.remove('show');
  }

  function pauseMenu() {
    if (!B.game || B.game.phase === 'ended') return; paused = true;
    const n = el('div'); n.dataset.sticky = '1'; n.innerHTML = '<h3>⏸ 일시정지</h3>';
    const m = UI.modal(n);
    const b1 = el('button', 'ra-btn gold', '▶ 계속하기'); b1.onclick = () => { paused = false; last = performance.now(); m.close(); };
    const b2 = el('button', 'ra-btn red', B.opts.practice ? '🏠 나가기' : '🏳️ 항복하기'); b2.onclick = () => { m.close(); paused = false; if (B.opts.practice) B.stop(); else B.game.surrender(); };
    n.appendChild(b1); n.appendChild(b2);
  }

  function onEnd(r) {
    const d = RA.Save.data, win = r.winner === 0, draw = r.winner === -1; let gold = 0, gems = 0, tr = 0;
    if (!B.opts.practice && !rewardGiven) {
      rewardGiven = true; d.matches++; d.crowns += r.crowns[0];
      if (win) { d.wins++; gold = 500 + r.crowns[0] * 200; gems = 20; tr = 30; } else if (draw) { d.draws++; gold = 200; tr = 0; } else { d.losses++; gold = 100; tr = -10; }
      d.gold += gold; d.gems += gems; d.trophies = Math.max(0, d.trophies + tr); RA.Save.save();
    }
    endTimer = setTimeout(() => showResult(r, gold, gems, tr), r.reason === 'surrender' ? 200 : 1600);
  }
  function showResult(r, gold, gems, tr) {
    if (!B.game) return; const win = r.winner === 0, draw = r.winner === -1;
    const n = el('div'); n.dataset.sticky = '1';
    const why = { king: '킹 타워 파괴', time: '시간 종료', overtime: '연장전 승부', hp: '타워 체력 비교', draw: '무승부', surrender: '항복' }[r.reason] || '';
    n.innerHTML = '<div class="res-title ' + (win ? 'win' : 'lose') + '">' + (draw ? '무승부' : win ? '🏆 승리!' : '패배') + '</div><div style="color:#9fb4e4;font-size:13px">' + why + '</div>' +
      '<div class="res-crowns"><span style="color:#ff7a6a">적 ' + (r.crowns[1] ? '👑'.repeat(r.crowns[1]) : '–') + '</span><span style="color:#6aa8ff">나 ' + (r.crowns[0] ? '👑'.repeat(r.crowns[0]) : '–') + '</span></div>' +
      (B.opts.practice ? '' : '<div class="res-rew">🪙 +' + gold + '　💎 +' + gems + '　🏆 ' + (tr >= 0 ? '+' : '') + tr + '</div>');
    const m = UI.modal(n); play(win ? 'win' : 'lose'); if (win) for (let i = 0; i < 22; i++) { const s = el('span', 'confetti', ['✨', '🎉', '⭐', '👑', '🎊'][i % 5]); s.style.cssText = 'left:' + Math.random() * 100 + '%;animation-delay:' + Math.random() * 1.2 + 's;animation-duration:' + (2 + Math.random() * 1.5) + 's'; m.el.parentNode.appendChild(s); }
    const b1 = el('button', 'ra-btn gold', '🔁 다시 하기'); b1.onclick = () => { m.close(); B.stop(); setTimeout(() => B.start(B.opts), 30); };
    const b2 = el('button', 'ra-btn', '🏠 홈으로'); b2.onclick = () => { m.close(); B.stop(); };
    n.appendChild(b1); n.appendChild(b2);
  }
})();
