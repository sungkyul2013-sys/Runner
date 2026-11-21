/* Royale Arena — simulation engine. Pure logic (no DOM/canvas). Team 0 = player (bottom), team 1 = opponent (top).
   Coordinates are in tiles (arena 18 x 32). Fixed-step update at 30 Hz. */
(function () {
  const RA = (window.RA = window.RA || {});
  const W = RA.W, H = RA.H, RY = RA.RIVER_Y, RH = RA.RIVER_HALF, BR = RA.BRIDGES, BHW = RA.BRIDGE_HW;
  const STEP = 1 / 30;
  let UID = 1;
  const hyp = Math.hypot, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const isAir = (e) => e.fly || e.airborne;

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function formation(n, sp) {
    if (n === 1) return [[0, 0]];
    const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols), out = [];
    for (let i = 0; i < n; i++) out.push([((i % cols) - (cols - 1) / 2) * sp, (Math.floor(i / cols) - (rows - 1) / 2) * sp]);
    return out;
  }

  class Game {
    constructor(o) {
      this.o = o; this.rules = o.rules || RA.Mods.rules(); const R = this.rules;
      this.practice = !!o.practice;
      this.t = 0; this.acc = 0; this.timeLeft = R.matchTime; this.phase = 'play'; this.result = null;
      this.ents = []; this.towers = []; this.projs = []; this.areas = []; this.fx = []; this.shake = 0;
      this.elixir = [R.startElixir, R.startElixir]; this.souls = [0, 0]; this.crowns = [0, 0];
      this.stats = { played: [0, 0], damage: [0, 0] };
      this.level = [o.level0 || 11, o.level1 || o.level0 || 11];
      this.hands = [this.makeHand(o.deck0), this.makeHand(o.deck1)];
      this.sfxT = {};
      this.makeTowers();
      this.hooks = RA.Mods.compileHooks();
      this.api = {
        game: this,
        spawn: (id, team, x, y) => { const d = RA.Mods.card(id); if (d && d.type !== 'spell') this.deploy(d, team, x, y); else if (d) this.castSpell(d, team, x, y); },
        hurt: (e, n) => this.hurt(e, n), heal: (e, n) => { e.hp = Math.min(e.maxHp, e.hp + n); },
        addElixir: (team, n) => { this.elixir[team] = clamp(this.elixir[team] + n, 0, R.maxElixir); },
        say: (txt) => this.fx.push({ k: 'banner', text: String(txt), t: 0, dur: 2.2 }),
        units: () => this.ents, towers: () => this.towers, time: () => this.t,
      };
      this.ai = o.ai === false ? null : new RA.AI(this, 1, o.difficulty || 'normal');
      this.hook('onMatchStart');
    }
    lv(team) { return this.level[team]; }
    hook(name, a, b) { for (const h of this.hooks) { if (typeof h[name] === 'function') { try { h[name](this.api, a, b); } catch (e) { console.warn('[mod hook]', name, e); } } } }
    sfx(n) { const now = performance.now(); if (this.sfxT[n] && now - this.sfxT[n] < 60) return; this.sfxT[n] = now; if (RA.Audio) RA.Audio.play(n); }

    // ---------------- setup ----------------
    makeHand(deck) {
      let d = (deck || []).slice(0, 8); const pool = RA.Mods.allIds();
      while (d.length < 8) { const c = pool[Math.floor(Math.random() * pool.length)]; if (!d.includes(c)) d.push(c); }
      shuffle(d);
      // never open a hand made only of spells/champion with nothing playable: fine for now
      return { hand: d.slice(0, 4), queue: d.slice(4) };
    }
    makeTowers() {
      const R = this.rules;
      [0, 1].forEach((team) => {
        const m = RA.lvlMul(this.lv(team));
        const my = (y) => (team === 0 ? y : H - y);
        const mk = (type, side, x, y) => {
          const b = RA.towerBase[type];
          this.towers.push({ uid: UID++, kind: 'tower', tower: type, side, team, x, y: my(y), r: b.r, maxHp: b.hp * m * R.towerHp, hp: b.hp * m * R.towerHp,
            dmg: b.dmg * m * R.towerDmg, hs: b.hs, range: b.range, atkCd: 0.6, target: null, active: type === 'princess' || R.kingAwake, dead: false, flash: 0, atkT: 0, fly: false, lvl: this.lv(team) });
        };
        mk('princess', 0, 3.5, 23.5); mk('princess', 1, 14.5, 23.5); mk('king', 2, 9, 29);
      });
    }
    towerOf(team, type, side) { return this.towers.find((t) => t.team === team && t.tower === type && (type === 'king' || t.side === side)); }

    // ---------------- cards ----------------
    canAfford(team, def) { if (this.practice && team === 0) return true; if (team === 0 && this.rules.infiniteElixir) return true; return this.elixir[team] >= def.cost - 1e-6; }
    inTower(x, y) { return this.towers.some((t) => !t.dead && Math.abs(x - t.x) < t.r + 0.1 && Math.abs(y - t.y) < t.r + 0.1); }
    canDeploy(team, def, x, y) {
      if (x < 0.3 || x > W - 0.3 || y < 0.3 || y > H - 0.3) return false;
      const own = team === 0 ? y >= RY + RH + 0.3 : y <= RY - RH - 0.3;
      if (def.type === 'spell') return def.spell.kind === 'log' ? own || this.rules.deployAnywhere : true;
      if (this.inTower(x, y)) return false;
      if (this.rules.deployAnywhere) return true;
      if (own) return true;
      for (let s = 0; s < 2; s++) {
        const tw = this.towerOf(1 - team, 'princess', s);
        if (tw && tw.dead && (s === 0 ? x < W / 2 : x >= W / 2) && (team === 0 ? y >= 10.5 : y <= 21.5)) return true;
      }
      return false;
    }
    championAlive(team) { return this.ents.some((e) => e.team === team && !e.dead && e.card.champion); }
    playable(team, id) { const d = RA.Mods.card(id); return this.canAfford(team, d) && !(d.champion && this.championAlive(team)); }
    playCard(team, slot, x, y) {
      if (this.phase === 'ended') return false;
      const h = this.hands[team], id = h.hand[slot]; if (!id) return false;
      const def = RA.Mods.card(id);
      if (!this.playable(team, id) || !this.canDeploy(team, def, x, y)) return false;
      if (!(this.practice && team === 0) && !(team === 0 && this.rules.infiniteElixir)) this.elixir[team] -= def.cost;
      let next = h.queue.shift();
      if (this.rules.randomCards) { const pool = RA.Mods.allIds().filter((c) => !h.hand.includes(c) || c === id); next = pool[Math.floor(Math.random() * pool.length)]; }
      h.hand[slot] = next; if (!this.rules.randomCards) h.queue.push(id); else h.queue.push(RA.Mods.allIds()[Math.floor(Math.random() * RA.Mods.allIds().length)]);
      this.stats.played[team]++;
      this.deploy(def, team, x, y); this.sfx(def.type === 'spell' ? 'spell' : 'deploy');
      this.hook('onPlayCard', team, id);
      return true;
    }
    deploy(def, team, x, y) {
      if (def.type === 'spell') return this.castSpell(def, team, x, y);
      const R = this.rules, m = RA.lvlMul(this.lv(team));
      const F = formation(def.count, 0.75 * R.unitSize);
      if (def.type === 'building') { x = Math.round(x * 2) / 2; this.spawnUnit(def, team, x, y); return; }
      F.forEach((o) => this.spawnUnit(def, team, clamp(x + o[0], 0.4, W - 0.4), y + o[1]));
      this.fx.push({ k: 'ring', x, y, r: 1.2, t: 0, dur: 0.4, col: team === 0 ? '#5aa7ff' : '#ff6a5a' });
      if (def.deployDmg) { this.areaHit(team, x, y, def.deployDmg.r, def.deployDmg.dmg * m * R.unitDmg, { air: true, ground: true, kb: 1.2 }); this.fx.push({ k: 'boom', x, y, r: def.deployDmg.r, t: 0, dur: 0.5 }); this.shake = 0.25; }
      if (def.deployZap) {
        const z = def.deployZap; this.areaHit(team, x, y, z.r, z.dmg * m, { air: true, ground: true, stun: z.stun, slow: z.slow });
        this.fx.push({ k: 'ring', x, y, r: z.r, t: 0, dur: 0.5, col: z.stun ? '#ffe44a' : '#8fe3ff' });
      }
    }
    spawnUnit(def, team, x, y, o) {
      const R = this.rules, m = RA.lvlMul(this.lv(team)), bld = def.type === 'building';
      const e = { uid: UID++, kind: bld ? 'building' : 'unit', team, card: def, cardId: def.id, token: !!def.token, art: def.portrait || RA.Mods.artOf(def.id),
        x, y, py: y, r: def.r * (bld ? 1 : R.unitSize), mass: def.mass * (bld ? 99 : R.unitSize * R.unitSize),
        maxHp: def.hp * m * R.unitHp, hp: def.hp * m * R.unitHp, dmg: def.dmg * m * R.unitDmg, hs: def.hs, speed: def.speed * R.unitSpeed,
        range: def.range, sight: bld ? def.range : def.sight, fly: def.fly, airborne: false, deployT: def.deploy, stun: 0, slowT: 0, slowPct: 0,
        target: null, atkCd: bld ? 0.3 : 0.5, atkT: 0, flash: 0, anim: Math.random() * 6, dead: false, lvl: this.lv(team), life: def.life || 0,
        chargeD: 0, charging: false, lockT: 0, lockTarget: null, rampT: 0, rampTarget: null, jumpCd: 0, abCd: 0, cloakT: 0, underground: 0, invuln: 0,
        spT: def.spawner ? def.spawner.first : 0, kbl: 0, kbdx: 0, kbdy: 0, dirx: 0, diry: team === 0 ? -1 : 1 };
      this.ents.push(e); this.hook('onSpawn', e); return e;
    }

    // ---------------- spells ----------------
    castSpell(def, team, x, y) {
      const s = def.spell, m = RA.lvlMul(this.lv(team)) * this.rules.spellDmg;
      const k = this.towerOf(team, 'king');
      const A = { kind: s.kind, team, x, y, t: 0, delay: s.delay || 0.2, r: s.r || 0, dmg: (s.dmg || 0) * m, dps: (s.dps || 0) * m, tdmg: s.tdmg, s: s, fired: false, vis: 0, life: s.dur || 0, tick: 0, from: { x: k ? k.x : W / 2, y: k ? k.y : (team === 0 ? H : 0) } };
      if (s.kind === 'log') { A.dir = team === 0 ? -1 : 1; A.trav = 0; A.hit = new Set(); A.sy = y; }
      this.areas.push(A);
    }
    updateAreas(dt) {
      for (const a of this.areas) {
        a.t += dt; const s = a.s;
        if (a.kind === 'instant') { if (!a.fired && a.t >= a.delay) { a.fired = true; this.areaHit(a.team, a.x, a.y, a.r, a.dmg, { air: true, ground: true, tmul: a.tdmg, stun: s.stun }); this.fx.push({ k: 'zap', x: a.x, y: a.y, r: a.r, t: 0, dur: 0.45 }); this.sfx('zap'); } if (a.t > a.delay + 0.1) a.done = true; }
        else if (a.kind === 'delayed') { if (!a.fired && a.t >= a.delay) { a.fired = true; this.areaHit(a.team, a.x, a.y, a.r, a.dmg, { air: true, ground: true, tmul: a.tdmg, kb: s.kb }); this.fx.push({ k: 'boom', x: a.x, y: a.y, r: a.r, t: 0, dur: 0.55 }); this.shake = 0.3; this.sfx('fireball'); } if (a.fired) a.done = true; }
        else if (a.kind === 'lightning') {
          if (!a.fired && a.t >= a.delay) {
            a.fired = true; const foes = this.foes(a.team).filter((e) => !e.dead && !e.hidden && hyp(e.x - a.x, e.y - a.y) <= a.r + e.r * 0.5 && !(e.cloakT > 0) && !(e.underground > 0));
            foes.sort((p, q) => q.hp - p.hp);
            foes.slice(0, s.hits).forEach((e, i) => { this.hurt(e, a.dmg, { tmul: a.tdmg, stun: s.stun }); this.fx.push({ k: 'bolt', x: e.x, y: e.y, t: -i * 0.12, dur: 0.4 }); });
            this.fx.push({ k: 'ring', x: a.x, y: a.y, r: a.r, t: 0, dur: 0.4, col: '#9fd0ff' }); this.shake = 0.2; this.sfx('zap');
          }
          if (a.fired && a.t > a.delay + 0.7) a.done = true;
        } else if (a.kind === 'poison') {
          if (a.t >= a.delay) {
            a.tick -= dt; a.life -= dt;
            if (a.tick <= 0) { a.tick = 0.5; this.areaHit(a.team, a.x, a.y, a.r, a.dps * 0.5, { air: true, ground: true, tmul: a.tdmg, slow: { pct: s.slow, t: 0.7 }, quiet: true }); }
            if (a.life <= 0) a.done = true;
          }
        } else if (a.kind === 'log') {
          if (a.t >= a.delay) {
            const mv = s.speed * dt; a.trav += mv; a.y += a.dir * mv;
            for (const e of this.foes(a.team)) {
              if (e.dead || isAir(e) || a.hit.has(e.uid) || e.underground > 0) continue;
              if (Math.abs(e.y - a.y) <= e.r + 0.45 && Math.abs(e.x - a.x) <= s.width / 2 + e.r * 0.7) {
                a.hit.add(e.uid); this.hurt(e, a.dmg, { tmul: a.tdmg });
                if (e.kind === 'unit' && e.mass < 15) { e.kbl = s.kb; e.kbdx = 0; e.kbdy = a.dir; e.atkCd = Math.max(e.atkCd, 0.4); }
              }
            }
            if (a.trav >= s.len || a.y < 0.5 || a.y > H - 0.5) a.done = true;
          }
        }
      }
      this.areas = this.areas.filter((a) => !a.done);
    }
    foes(team) { const out = []; for (const e of this.ents) if (e.team !== team && !e.dead) out.push(e); for (const t of this.towers) if (t.team !== team && !t.dead) out.push(t); return out; }
    areaHit(team, x, y, r, dmg, o) {
      o = o || {};
      for (const e of this.foes(team)) {
        if (e.underground > 0) continue;
        const air = isAir(e); if (air ? o.air === false : o.ground === false) continue;
        if (hyp(e.x - x, e.y - y) > r + e.r * 0.6) continue;
        this.hurt(e, dmg, { tmul: o.tmul, stun: o.stun, slow: o.slow, quiet: o.quiet });
        if (o.kb && e.kind === 'unit' && e.mass < 15) { const d = hyp(e.x - x, e.y - y) || 1; e.kbl = o.kb; e.kbdx = (e.x - x) / d; e.kbdy = (e.y - y) / d || (team === 0 ? -1 : 1); e.atkCd = Math.max(e.atkCd, 0.4); }
      }
    }

    // ---------------- damage ----------------
    hurt(e, amt, o) {
      o = o || {}; if (e.dead || e.invuln > 0 || e.underground > 0) return;
      if (e.kind === 'tower' && o.tmul) amt *= o.tmul;
      e.hp -= amt; e.flash = 0.12; this.stats.damage[1 - e.team] += amt;
      if (!o.quiet && RA.Save.data.settings.damageNumbers && amt >= 1) this.fx.push({ k: 'text', x: e.x + rnd(-0.3, 0.3), y: e.y - e.r - 0.2, text: Math.round(amt), t: 0, dur: 0.8, col: e.team === 0 ? '#ff9a9a' : '#ffffff' });
      if (e.kind === 'tower') { if (e.tower === 'king' && !e.active) e.active = true; this.sfx('tower_hit'); }
      if (o.stun) this.stunEnt(e, o.stun);
      if (o.slow) { e.slowT = Math.max(e.slowT, o.slow.t); e.slowPct = Math.max(e.slowPct, o.slow.pct); }
      if (e.hp <= 0) { e.hp = 0; e.dead = true; }
    }
    stunEnt(e, t) {
      if (e.kind === 'tower' || e.invuln > 0) return;
      e.stun = Math.max(e.stun, t); e.atkCd = e.card.chargeAtk ? e.hs : Math.max(e.atkCd, 0.5);
      e.chargeD = 0; e.charging = false; e.lockT = 0; e.rampT = 0;
    }

    // ---------------- targeting ----------------
    valid(u, t) {
      if (!t || t.dead || t.cloakT > 0 || t.underground > 0) return false;
      if (isAir(t) ? !u.card.atkAir : !(u.card.atkGround !== false)) return false;
      if (u.card.buildOnly && t.kind === 'unit') return false;
      return true;
    }
    edge(u, t) { return hyp(u.x - t.x, u.y - t.y) - u.r - t.r; }
    findTarget(u) {
      let best = null, bd = 1e9;
      const bo = u.card.buildOnly;
      for (const e of this.ents) {
        if (e.team === u.team || e.dead || !this.valid(u, e)) continue;
        if (bo && e.kind === 'unit') continue;
        const d = bo ? hyp(u.x - e.x, u.y - e.y) : this.edge(u, e);
        if (!bo && d > u.sight) continue;
        if (d < bd) { bd = d; best = e; }
      }
      if (best) { if (!bo) return best; }
      if (u.kind === 'building') { // turrets only look within range (towers too, e.g. X-Bow)
        for (const t of this.towers) { if (t.team === u.team || t.dead || !this.valid(u, t)) continue; const d = this.edge(u, t); if (d <= u.range && d < bd) { bd = d; best = t; } }
        return best;
      }
      for (const t of this.towers) { if (t.team === u.team || t.dead) continue; const d = hyp(u.x - t.x, u.y - t.y); if (d < bd) { bd = d; best = t; } }
      return best;
    }
    acquire(u) {
      const c = u.target;
      if (c && !c.dead && this.valid(u, c) && (this.edge(u, c) <= u.range || (!u.card.buildOnly && c.kind !== 'tower' && this.edge(u, c) <= u.sight))) {
        // prefer a nearer valid unit if current is a tower/building and something walked into sight
        if (c.kind === 'tower' && !u.card.buildOnly) { const n = this.findTarget(u); if (n && n.kind !== 'tower') return n; }
        return c;
      }
      return this.findTarget(u);
    }

    // ---------------- movement ----------------
    route(u, gx, gy) {
      if (u.fly || u.airborne || u.card.crossRiver) return [gx, gy];
      const side = (y) => (y < RY - RH ? -1 : y > RY + RH ? 1 : 0);
      const us = side(u.y), gs = side(gy);
      if (us === 0) { const bx = BR.reduce((b, c) => (Math.abs(u.x - c) < Math.abs(u.x - b) ? c : b), BR[0]); return [bx, RY + (gy > RY ? 1 : -1) * 1.8]; }
      if (gs !== 0 && us !== gs) {
        let bx = BR[0], bs = 1e9; for (const c of BR) { const s = Math.abs(u.x - c) + Math.abs(c - gx); if (s < bs) { bs = s; bx = c; } }
        if (Math.abs(u.x - bx) > 0.55) return [bx, RY + us * (RH + 1.0)];
        return [bx, RY - us * 1.8];
      }
      return [gx, gy];
    }
    moveToward(u, gx, gy, dt, mul) {
      const [wx, wy] = this.route(u, gx, gy); const dx = wx - u.x, dy = wy - u.y, d = hyp(dx, dy); if (d < 1e-4) return;
      let sp = u.speed * mul * (u.slowT > 0 ? 1 - u.slowPct : 1) * (u.cloakT > 0 && u.card.ability ? u.card.ability.speedMul : 1);
      if (u.charging) sp *= u.card.charge.speedMul;
      const step = Math.min(sp * dt, d); u.x += (dx / d) * step; u.y += (dy / d) * step; u.dirx = dx / d; u.diry = dy / d;
      if (u.card.charge && !u.charging) { u.chargeD += step; if (u.chargeD >= u.card.charge.dist) u.charging = true; }
    }
    enforceRiver(u) {
      if (isAir(u) || u.card.crossRiver) return;
      if (Math.abs(u.y - RY) < RH + 0.05) {
        let on = null; for (const bx of BR) if (Math.abs(u.x - bx) <= BHW) on = bx;
        if (on === null) u.y = u.py < RY ? RY - RH - 0.06 : RY + RH + 0.06;
        else u.x = clamp(u.x, on - BHW + 0.2, on + BHW - 0.2);
      }
      u.x = clamp(u.x, 0.4, W - 0.4); u.y = clamp(u.y, 0.4, H - 0.4);
    }

    // ---------------- unit update ----------------
    updateUnit(u, dt) {
      const c = u.card;
      u.anim += dt; if (u.flash > 0) u.flash -= dt; if (u.atkT > 0) u.atkT -= dt;
      if (u.kbl > 0) { const s = Math.min(u.kbl, 14 * dt); u.x += u.kbdx * s; u.y += u.kbdy * s; u.kbl -= s; this.enforceRiver(u); }
      if (u.deployT > 0) { u.deployT -= dt; return; }
      if (u.abCd > 0) u.abCd -= dt; if (u.cloakT > 0) u.cloakT -= dt; if (u.jumpCd > 0) u.jumpCd -= dt;
      if (u.slowT > 0) { u.slowT -= dt; if (u.slowT <= 0) u.slowPct = 0; }
      if (u.kind === 'building' && u.life) { u.life -= dt; u.hp -= (u.maxHp / (c.life)) * dt; if (u.life <= 0 || u.hp <= 0) { u.hp = 0; u.dead = true; return; } }
      if (u.stun > 0) { u.stun -= dt; return; }
      if (u.underground > 0) { u.underground -= dt; if (u.underground <= 0) { u.invuln = 0; u.x = clamp(W - u.x, 1, W - 1); u.fx = 1; this.fx.push({ k: 'puff', x: u.x, y: u.y, t: 0, dur: 0.5 }); } return; }
      if (u.dash && this.updateDash(u, dt)) return;
      if (u.summon) { u.summon.t -= dt; if (u.summon.t <= 0 && u.summon.left > 0) { u.summon.left--; u.summon.t = 0.25; const a = rnd(0, 6.28), d = Math.sqrt(Math.random()) * 4; this.spawnUnit(RA.Mods.card('skeleton'), u.team, clamp(u.x + Math.cos(a) * d, 0.5, W - 0.5), clamp(u.y + Math.sin(a) * d, 0.5, H - 0.5)).deployT = 0.2; } if (u.summon.left <= 0) u.summon = null; }
      if (u.jumping) { this.updateJump(u, dt); return; }
      if (c.spawner) { u.spT -= dt; if (u.spT <= 0) { u.spT = c.spawner.every; const F = formation(c.spawner.count, 0.6); F.forEach((o) => this.spawnUnit(RA.Mods.card(c.spawner.id), u.team, clamp(u.x + o[0], 0.4, W - 0.4), u.y + o[1] + (u.team === 0 ? -0.5 : 0.5))); this.fx.push({ k: 'ring', x: u.x, y: u.y, r: 1.2, t: 0, dur: 0.4, col: '#c05af0' }); } }

      u.py = u.y;
      const t = this.acquire(u); if (t !== u.target) { u.lockT = 0; u.rampT = 0; } u.target = t;
      const inR = t && this.edge(u, t) <= u.range;
      const as = (u.slowT > 0 ? 1 - u.slowPct : 1) * (u.cloakT > 0 && c.ability ? 1 / c.ability.hsMul : 1);
      if (!c.chargeAtk || inR) u.atkCd -= dt * as;
      if (t && inR) {
        u.dirx = (t.x - u.x); u.diry = (t.y - u.y); const dl = hyp(u.dirx, u.diry) || 1; u.dirx /= dl; u.diry /= dl;
        if (u.atkCd <= 0) { this.attack(u, t); u.atkCd = u.hs; }
        else if (c.inferno || c.ramp) { /* lock timers advance in attack() */ }
      } else if (u.kind === 'unit') {
        if (c.jump && t && u.jumpCd <= 0 && !isAir(t) && t.kind !== 'tower') { const d = hyp(t.x - u.x, t.y - u.y); if (d >= c.jump.min && d <= c.jump.max) { this.startJump(u, t); return; } }
        if (t) this.moveToward(u, t.x, t.y, dt, 1);
        this.enforceRiver(u);
      }
      if (!inR && (c.inferno)) u.lockT = 0;
    }
    startJump(u, t) {
      const d = hyp(t.x - u.x, t.y - u.y), k = Math.max(0, d - (u.r + t.r + 0.3)) / d;
      u.jumping = { t: 0, dur: 0.8, sx: u.x, sy: u.y, tx: u.x + (t.x - u.x) * k, ty: u.y + (t.y - u.y) * k }; u.airborne = true;
    }
    updateJump(u, dt) {
      const j = u.jumping; j.t += dt; const p = Math.min(1, j.t / j.dur);
      u.x = j.sx + (j.tx - j.sx) * p; u.y = j.sy + (j.ty - j.sy) * p; u.z = Math.sin(Math.PI * p) * 1.4;
      if (p >= 1) { u.jumping = null; u.airborne = false; u.z = 0; u.jumpCd = 1.2; this.areaHit(u.team, u.x, u.y, u.card.splash * 1.35, u.dmg * u.card.jump.mult, { ground: true, air: false, kb: 1.0 }); this.fx.push({ k: 'boom', x: u.x, y: u.y, r: 2.2, t: 0, dur: 0.5 }); this.shake = 0.3; this.sfx('explode'); this.enforceRiver(u); }
    }
    attack(u, t) {
      const c = u.card; let dmg = u.dmg; u.atkT = 0.25;
      if (c.ramp) { if (u.rampTarget !== t) { u.rampTarget = t; u.rampT = 0; } u.rampT += u.hs; const lvl = u.rampT < 1.2 ? 0 : u.rampT < 2.4 ? 1 : 2; dmg = c.ramp[lvl] * RA.lvlMul(u.lvl) * this.rules.unitDmg; u.rampLvl = lvl; }
      if (c.charge && u.charging) { dmg *= c.charge.dmgMul; u.charging = false; u.chargeD = 0; this.fx.push({ k: 'ring', x: t.x, y: t.y, r: 1.0, t: 0, dur: 0.3, col: '#ffe44a' }); }
      if (c.inferno) { if (u.lockTarget !== t) { u.lockTarget = t; u.lockT = 0; } u.lockT += u.hs; const s = c.inferno; const st = u.lockT < s.times[0] ? 0 : u.lockT < s.times[1] ? 1 : 2; dmg = u.dmg * u.hs * s.stages[st]; u.stage = st; }
      if (c.suicide) { this.areaHit(u.team, u.x, u.y, c.splash, dmg, { air: false, ground: true }); this.fx.push({ k: 'boom', x: u.x, y: u.y, r: c.splash, t: 0, dur: 0.45 }); this.sfx('explode'); u.hp = 0; u.dead = true; u.noDeath = true; return; }
      const targets = [t];
      if (c.multi > 1) { for (const e of this.foes(u.team)) { if (targets.length >= c.multi) break; if (e !== t && this.valid(u, e) && e.kind !== 'tower' && this.edge(u, e) <= u.range) targets.push(e); } }
      for (const tt of targets) {
        if (c.projectile) this.projs.push({ team: u.team, x: u.x, y: u.y, target: tt, lx: tt.x, ly: tt.y, speed: c.projSpeed, dmg: dmg / (c.multi > 1 && targets.length > 1 ? 1 : 1), kind: c.projectile, c, src: u, splash: c.splash, slow: c.slow, stun: c.stun, air: c.atkAir, ground: c.atkGround !== false });
        else this.melee(u, tt, dmg);
      }
      if (!c.inferno) this.sfx(c.projectile ? 'arrow' : 'hit');
    }
    melee(u, t, dmg) {
      const c = u.card;
      if (c.splash > 0) { const cx = c.splashMode === 'self' ? u.x : t.x, cy = c.splashMode === 'self' ? u.y : t.y; this.areaHit(u.team, cx, cy, c.splash, dmg, { air: c.atkAir, ground: c.atkGround !== false, slow: c.slow, stun: c.stun }); this.fx.push({ k: 'ring', x: cx, y: cy, r: c.splash * 0.7, t: 0, dur: 0.25, col: '#ffffff' }); }
      else this.hurt(t, dmg, { slow: c.slow, stun: c.stun });
    }
    updateProjs(dt) {
      for (const p of this.projs) {
        const t = p.target; if (t && !t.dead) { p.lx = t.x; p.ly = t.y; }
        const dx = p.lx - p.x, dy = p.ly - p.y, d = hyp(dx, dy), step = p.speed * dt; p.ang = Math.atan2(dy, dx);
        if (d <= step + (t && !t.dead ? Math.min(t.r * 0.6, 0.6) : 0.1)) {
          p.done = true;
          if (p.splash > 0) { this.areaHit(p.team, p.lx, p.ly, p.splash, p.dmg, { air: p.air, ground: p.ground, slow: p.slow, stun: p.stun }); this.fx.push({ k: 'ring', x: p.lx, y: p.ly, r: p.splash * 0.8, t: 0, dur: 0.3, col: p.kind === 'ice' ? '#8fe3ff' : p.kind === 'fire' ? '#ff9a3a' : '#d48aff' }); }
          else if (t && !t.dead) this.hurt(t, p.dmg, { slow: p.slow, stun: p.stun });
        } else { p.x += (dx / d) * step; p.y += (dy / d) * step; }
      }
      this.projs = this.projs.filter((p) => !p.done);
    }

    // ---------------- towers ----------------
    updateTower(t, dt) {
      if (t.flash > 0) t.flash -= dt; if (t.atkT > 0) t.atkT -= dt;
      if (t.dead || !t.active) return;
      t.atkCd -= dt;
      let best = null, bd = 1e9;
      for (const e of this.ents) { if (e.team === t.team || e.dead || e.cloakT > 0 || e.underground > 0) continue; const d = hyp(t.x - e.x, t.y - e.y) - e.r - t.r * 0.4; if (d <= t.range && d < bd) { bd = d; best = e; } }
      if (t.target && !t.target.dead && best && t.target.kind !== 'tower') { const d = hyp(t.x - t.target.x, t.y - t.target.y) - t.target.r - t.r * 0.4; if (d <= t.range && t.target.cloakT <= 0 && !(t.target.underground > 0)) best = t.target; }
      t.target = best;
      if (best && t.atkCd <= 0) { t.atkCd = t.hs; t.atkT = 0.25; this.projs.push({ team: t.team, x: t.x, y: t.y - (t.team === 0 ? 0.8 : -0.8), target: best, lx: best.x, ly: best.y, speed: 16, dmg: t.dmg, kind: 'bullet', splash: 0, air: true, ground: true }); this.sfx('arrow'); }
    }

    // ---------------- champion abilities ----------------
    abilityInfo(team) {
      const e = this.ents.find((x) => x.team === team && !x.dead && x.card.ability);
      if (!e) return null; const ab = e.card.ability;
      return { name: ab.name, cost: ab.cost, cd: Math.max(0, e.abCd), cdMax: ab.cd, ready: e.deployT <= 0 && e.abCd <= 0 && e.stun <= 0 && this.canAfford(team, { cost: ab.cost }) && !e.dash && !e.underground, art: e.art, ent: e };
    }
    useAbility(team) {
      const i = this.abilityInfo(team); if (!i || !i.ready || this.phase === 'ended') return false;
      const e = i.ent, ab = e.card.ability, m = RA.lvlMul(e.lvl);
      if (!(this.practice && team === 0) && !(team === 0 && this.rules.infiniteElixir)) this.elixir[team] -= ab.cost;
      e.abCd = ab.cd;
      if (ab.id === 'dash') { e.dash = { left: ab.chain, hit: new Set(), target: null, delay: 0.5 }; e.invuln = 1; this.fx.push({ k: 'ring', x: e.x, y: e.y, r: 1.5, t: 0, dur: 0.5, col: '#ffd84a' }); }
      else if (ab.id === 'souls') { const n = Math.min(ab.max, ab.base + this.souls[team]); this.souls[team] = 0; e.summon = { left: n, t: 0.8 }; this.fx.push({ k: 'ring', x: e.x, y: e.y, r: 4, t: 0, dur: 0.8, col: '#9aff9a' }); }
      else if (ab.id === 'cloak') { e.cloakT = ab.dur; e.target = null; this.fx.push({ k: 'puff', x: e.x, y: e.y, t: 0, dur: 0.5 }); }
      else if (ab.id === 'escape') { e.underground = 1.0; e.invuln = 1; e.target = null; this.areas.push({ kind: 'bomb', team, x: e.x, y: e.y, t: 0, delay: 1.0, r: ab.r, dmg: ab.bomb * m * this.rules.unitDmg, s: {}, fired: false }); this.fx.push({ k: 'puff', x: e.x, y: e.y, t: 0, dur: 0.5 }); }
      this.sfx('spell'); return true;
    }
    updateDash(u, dt) {
      const d = u.dash, ab = u.card.ability;
      if (d.delay > 0) { d.delay -= dt; return true; }
      if (!d.target || d.target.dead) {
        let best = null, bd = 1e9;
        for (const e of this.foes(u.team)) { if (e.dead || isAir(e) || d.hit.has(e.uid) || e.underground > 0 || e.cloakT > 0) continue; const x = hyp(u.x - e.x, u.y - e.y); if (x <= ab.range && x < bd) { bd = x; best = e; } }
        if (!best || d.left <= 0) { u.dash = null; u.invuln = 0; return false; }
        d.target = best;
      }
      const t = d.target, dx = t.x - u.x, dy = t.y - u.y, dist = hyp(dx, dy), gap = dist - u.r - t.r;
      if (gap <= 0.3) { this.hurt(t, ab.dmg * RA.lvlMul(u.lvl) * this.rules.unitDmg); d.hit.add(t.uid); d.left--; d.target = null; this.fx.push({ k: 'ring', x: t.x, y: t.y, r: 0.9, t: 0, dur: 0.25, col: '#ffd84a' }); this.sfx('hit'); }
      else { const s = Math.min(16 * dt, dist); u.x += (dx / dist) * s; u.y += (dy / dist) * s; u.x = clamp(u.x, 0.4, W - 0.4); u.y = clamp(u.y, 0.4, H - 0.4); }
      return true;
    }

    // ---------------- frame ----------------
    separate() {
      const L = this.ents, n = L.length;
      for (let i = 0; i < n; i++) {
        const a = L[i]; if (a.dead || a.dash || a.underground > 0 || a.jumping) continue;
        for (let j = i + 1; j < n; j++) {
          const b = L[j]; if (b.dead || b.dash || b.underground > 0 || b.jumping) continue;
          if (isAir(a) !== isAir(b)) continue; if (a.kind === 'building' && b.kind === 'building') continue;
          let dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy); const min = (a.r + b.r) * 0.92; if (d >= min) continue;
          if (d < 1e-4) { dx = rnd(-1, 1); dy = rnd(-1, 1); d = hyp(dx, dy); }
          const ov = (min - d) * 0.5, pa = b.mass / (a.mass + b.mass), pb = 1 - pa;
          a.x -= (dx / d) * ov * 2 * pa * 0.6; a.y -= (dy / d) * ov * 2 * pa * 0.6; b.x += (dx / d) * ov * 2 * pb * 0.6; b.y += (dy / d) * ov * 2 * pb * 0.6;
        }
        if (!isAir(a) && a.kind === 'unit') for (const t of this.towers) { if (t.dead) continue; const dx = a.x - t.x, dy = a.y - t.y, d = hyp(dx, dy), min = t.r * 0.85 + a.r; if (d < min && d > 1e-4) { a.x += (dx / d) * (min - d); a.y += (dy / d) * (min - d); } }
        if (a.kind === 'unit') this.enforceRiver(a);
      }
    }
    elixirRate(team) {
      const R = this.rules; let k = 1 / 2.8 * R.elixirRate; if (team === 1) { k *= R.aiElixirRate * (this.ai ? this.ai.elixirMul : 1); }
      if (this.phase === 'overtime') k *= 3; else if (R.doubleAlways || (this.timeLeft <= 60 && !this.practice)) k *= 2;
      return k;
    }
    update(dt) {
      this.acc += dt; let n = 0;
      while (this.acc >= STEP && n++ < 6) { this.acc -= STEP; this.step(STEP); }
      if (this.acc > STEP * 6) this.acc = 0;
      return this.acc / STEP;
    }
    step(dt) {
      if (this.phase === 'ended') { this.fx.forEach((f) => (f.t += dt)); this.fx = this.fx.filter((f) => f.t < f.dur); this.updateProjs(dt); return; }
      this.t += dt; const R = this.rules;
      for (let tm = 0; tm < 2; tm++) this.elixir[tm] = Math.min(R.maxElixir, this.elixir[tm] + dt * this.elixirRate(tm));
      if (!this.practice) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          if (this.phase === 'play') {
            if (this.crowns[0] !== this.crowns[1]) return this.finish(this.crowns[0] > this.crowns[1] ? 0 : 1, 'time');
            if (R.overtime > 0) { this.phase = 'overtime'; this.timeLeft = R.overtime; this.fx.push({ k: 'banner', text: '연장전! 먼저 타워를 부수면 승리', t: 0, dur: 2.5 }); }
            else return this.finishByHp();
          } else return this.finishByHp();
        }
      }
      if (this.ai) this.ai.update(dt);
      this.hook('onTick', dt);
      for (const e of this.ents) if (!e.dead) this.updateUnit(e, dt);
      for (const t of this.towers) this.updateTower(t, dt);
      this.updateProjs(dt); this.updateAreas(dt); this.updateBombs(dt);
      this.separate();
      this.cleanup();
      if (this.shake > 0) this.shake -= dt;
      for (const f of this.fx) f.t += dt; this.fx = this.fx.filter((f) => f.t < f.dur);
    }
    updateBombs(dt) {
      for (const a of this.areas) if (a.kind === 'bomb') { if (!a.fired && a.t >= a.delay) { a.fired = true; a.done = true; this.areaHit(a.team, a.x, a.y, a.r, a.dmg, { air: true, ground: true, kb: 1.8 }); this.fx.push({ k: 'boom', x: a.x, y: a.y, r: a.r, t: 0, dur: 0.5 }); this.sfx('explode'); } }
    }
    cleanup() {
      for (const e of this.ents) if (e.dead && !e.removed) {
        e.removed = true; this.fx.push({ k: 'puff', x: e.x, y: e.y, t: 0, dur: 0.5 }); if (e.kind === 'unit') this.fx.push({ k: 'ghost', x: e.x, y: e.y, art: e.art, r: e.r, team: e.team, fly: e.fly, t: 0, dur: 0.4 }); this.sfx('death');
        this.souls[0] = Math.min(10, this.souls[0] + 1); this.souls[1] = Math.min(10, this.souls[1] + 1);
        if (e.card.spawnOnDeath && !e.noDeath) { const sp = e.card.spawnOnDeath; formation(sp.count, 0.6).forEach((o) => { const u = this.spawnUnit(RA.Mods.card(sp.id), e.team, e.x + o[0], e.y + o[1]); u.deployT = 0.3; }); }
        this.hook('onDeath', e);
      }
      this.ents = this.ents.filter((e) => !e.removed);
      for (const t of this.towers) if (t.dead && !t.done) {
        t.done = true; const w = 1 - t.team; this.crowns[w] += t.tower === 'king' ? 3 : 1;
        this.fx.push({ k: 'boom', x: t.x, y: t.y, r: 3, t: 0, dur: 0.8 }); this.shake = 0.6; this.sfx('tower_destroy');
        if (t.tower === 'princess') { const k = this.towerOf(t.team, 'king'); if (k) k.active = true; }
        this.hook('onTowerDestroyed', t);
        if (t.tower === 'king') { this.crowns[w] = 3; this.finish(w, 'king'); return; }
      }
      if (this.phase === 'overtime' && this.crowns[0] !== this.crowns[1]) this.finish(this.crowns[0] > this.crowns[1] ? 0 : 1, 'overtime');
    }
    hpScore(team) { return this.towers.filter((t) => t.team === team).reduce((s, t) => s + (t.dead ? 0 : t.hp / t.maxHp), 0); }
    finishByHp() { const a = this.hpScore(0), b = this.hpScore(1); if (Math.abs(a - b) < 1e-3) this.finish(-1, 'draw'); else this.finish(a > b ? 0 : 1, 'hp'); }
    finish(winner, reason) {
      if (this.phase === 'ended') return;
      this.phase = 'ended'; this.result = { winner, reason, crowns: this.crowns.slice(), time: this.t };
      this.sfx(winner === 0 ? 'win' : winner === 1 ? 'lose' : 'click');
      if (this.o.onEnd) this.o.onEnd(this.result);
    }
    surrender() { this.finish(1, 'surrender'); }
  }
  RA.Game = Game;
})();
