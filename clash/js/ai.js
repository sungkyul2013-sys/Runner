/* Royale Arena — computer opponent. Reads game state, plays cards like a human would:
   defend the threatened lane with a counter, otherwise build pushes (tank at back / win-condition at bridge). */
(function () {
  const RA = (window.RA = window.RA || {});
  const W = RA.W, H = RA.H, RY = RA.RIVER_Y;
  const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const LANE_X = [3.5, 14.5];

  class AI {
    constructor(g, team, diff) {
      this.g = g; this.team = team; this.d = RA.DIFFICULTY[diff] || RA.DIFFICULTY.normal; this.elixirMul = this.d.elixir;
      this.cool = rnd(2.5, 4.5); this.fwd = team === 1 ? 1 : -1; this.abT = 0;
    }
    update(dt) {
      const g = this.g; if (g.phase === 'ended') return;
      this.abT -= dt; if (this.abT <= 0) { this.abT = 1.2; this.tryAbility(); }
      this.cool -= dt; if (this.cool > 0) return;
      let played = false;
      try { played = this.think(); } catch (e) { console.warn('[ai]', e); }
      this.cool = this.d.react * rnd(0.6, 1.4) * (played ? 1 : 0.45);
    }
    tryAbility() {
      const g = this.g, i = g.abilityInfo(this.team); if (!i || !i.ready) return;
      const e = i.ent; if (!e.target || Math.hypot(e.x - e.target.x, e.y - e.target.y) > 7) return;
      if (Math.random() < 0.6) g.useAbility(this.team);
    }
    ownY(y) { return this.team === 1 ? clamp(y, 1.2, RY - 1.2) : clamp(y, RY + 1.2, H - 1.2); }
    pickLane() {
      const g = this.g; const hp = [0, 1].map((s) => { const t = g.towerOf(1 - this.team, 'princess', s); return t && !t.dead ? t.hp / t.maxHp : 0.05; });
      if (Math.abs(hp[0] - hp[1]) > 0.15 && Math.random() < 0.7) return hp[0] < hp[1] ? 0 : 1;
      return Math.random() < 0.5 ? 0 : 1;
    }
    threats() {
      const g = this.g, me = this.team, lanes = [[], []];
      for (const e of g.ents) {
        if (e.team === me || e.dead || e.kind !== 'unit') continue;
        const onMySide = me === 1 ? e.y < RY + 3 : e.y > RY - 3;
        if (!onMySide) continue; lanes[e.x < W / 2 ? 0 : 1].push(e);
      }
      return lanes;
    }
    think() {
      const g = this.g, me = this.team, el = g.elixir[me], hand = g.hands[me].hand;
      if (Math.random() < this.d.mistake) return false;
      const opts = hand.map((id, slot) => ({ id, slot, def: RA.Mods.card(id) })).filter((o) => g.playable(me, o.id));
      if (!opts.length) return false;
      const lanes = this.threats(); const sc = lanes.map((us) => us.reduce((s, e) => s + e.hp / 400 + (e.card.dmg || 0) / 120, 0));
      const lane = sc[0] >= sc[1] ? 0 : 1;
      if (sc[lane] > 0.8) return this.defend(lanes[lane], lane, opts);
      return this.attack(opts, el);
    }
    place(o, x, y) { const g = this.g; x = clamp(x + rnd(-0.4, 0.4), 0.8, W - 0.8); y = o.def.type === 'spell' ? y : this.ownY(y); return g.canDeploy(this.team, o.def, x, y) && g.playCard(this.team, o.slot, x, y); }
    defend(us, lane, opts) {
      const air = us.some((e) => e.fly), swarm = us.length >= 3 && us.reduce((s, e) => s + e.maxHp, 0) / us.length < 500;
      const tank = us.some((e) => e.maxHp >= 1800), fast = us.some((e) => e.card.crossRiver), cluster = us.length >= 2;
      const cx = us.reduce((s, e) => s + e.x, 0) / us.length, cy = us.reduce((s, e) => s + e.y, 0) / us.length;
      const tc = us.reduce((s, e) => s + (e.card.cost || 1) / (e.card.count || 1), 0);
      let best = null, bs = -99;
      for (const o of opts) {
        const d = o.def; let s = 0;
        if (d.type === 'spell') {
          const k = d.spell.kind;
          if (k === 'instant' || k === 'log') s = swarm ? 6 : cluster ? 2.5 : 0.5; if (k === 'log' && air) s -= 5;
          if (k === 'delayed') s = cluster ? 4 : 1; if (k === 'poison') s = cluster ? 3.5 : 0.5; if (k === 'lightning') s = us.length >= 2 ? 3 : 0.5;
        } else if (d.type === 'building') s = tank || fast ? 5.5 : 0.5;
        else {
          if (air && !d.atkAir) s -= 8; if (air && d.atkAir) s += 4;
          if (d.buildOnly && !tank) s -= 3;
          const dps = d.dmg / Math.max(0.2, d.hs); s += tank ? Math.min(5, dps / 120) : 2; if (swarm && d.splash > 0) s += 4; if (swarm && d.count >= 3) s += 1;
        }
        s -= Math.max(0, d.cost - tc) * 0.35; s += Math.random() * 0.6;
        if (s > bs) { bs = s; best = o; }
      }
      if (!best || bs < -2) return false;
      const d = best.def, tw = this.g.towerOf(this.team, 'princess', lane), ty = tw ? tw.y : (this.team === 1 ? 6.5 : 25.5);
      if (d.type === 'spell') { return this.place(best, cx, cy + this.fwd * 0.4); }
      if (d.type === 'building') return this.place(best, lane === 0 ? 5 : 13, ty + this.fwd * 4.5);
      return this.place(best, cx * 0.4 + LANE_X[lane] * 0.6, ty + this.fwd * (air ? 1.0 : 2.2));
    }
    attack(opts, el) {
      const g = this.g, me = this.team, need = { easy: 7.5, normal: 6.5, hard: 5.5, master: 5 }[Object.keys(RA.DIFFICULTY).find((k) => RA.DIFFICULTY[k] === this.d)] || 6;
      // finishing spells on weak towers
      for (const o of opts) {
        if (o.def.type !== 'spell' || !['delayed', 'lightning'].includes(o.def.spell.kind)) continue;
        for (const t of g.towers) if (t.team !== me && !t.dead && t.hp / t.maxHp < 0.3 && el >= o.def.cost + 1) return this.place(o, t.x, t.y + this.fwd * -0.5);
      }
      const mine = g.ents.filter((e) => e.team === me && !e.dead && e.kind === 'unit' && (me === 1 ? e.y > RY : e.y < RY));
      if (mine.length) { // support the push in progress
        const lead = mine.reduce((a, b) => (a.maxHp > b.maxHp ? a : b)); const sup = opts.filter((o) => o.def.type === 'troop' && !o.def.buildOnly && el >= o.def.cost + 0.5);
        if (sup.length && el >= 4) { const o = sup[Math.floor(Math.random() * sup.length)]; return this.place(o, lead.x, lead.y - this.fwd * 3.5); }
      }
      if (el < need && el < 9.3) return false;
      const lane = this.pickLane();
      const tanks = opts.filter((o) => o.def.type === 'troop' && (o.def.buildOnly || o.def.maxHpHint) && !o.def.crossRiver && o.def.cost >= 5 && el >= o.def.cost);
      const runners = opts.filter((o) => o.def.type === 'troop' && (o.def.crossRiver || o.def.charge || o.def.suicide) && el >= o.def.cost + 1);
      const any = opts.filter((o) => o.def.type !== 'spell' && el >= o.def.cost);
      if (el >= 9 && any.length) { const o = any[Math.floor(Math.random() * any.length)]; if (o.def.type === 'building') return this.place(o, 9 + rnd(-3, 3), me === 1 ? 10.5 : 21.5); return this.place(o, LANE_X[lane], me === 1 ? 4 : 28); }
      if (tanks.length && Math.random() < 0.6) return this.place(tanks[0], LANE_X[lane], me === 1 ? 4 : 28);
      if (runners.length) return this.place(runners[Math.floor(Math.random() * runners.length)], LANE_X[lane], me === 1 ? RY - 2.5 : RY + 2.5);
      const cheap = any.filter((o) => o.def.type === 'troop').sort((a, b) => a.def.cost - b.def.cost)[0];
      if (cheap && el >= 7) return this.place(cheap, LANE_X[lane], me === 1 ? 5 : 27);
      return false;
    }
  }
  RA.AI = AI;
})();
