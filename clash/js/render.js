/* Royale Arena — canvas renderer. Draws a Game (read-only) in arena tile coordinates. */
(function () {
  const RA = (window.RA = window.RA || {});
  const W = RA.W, H = RA.H, RY = RA.RIVER_Y, RH = RA.RIVER_HALF, BR = RA.BRIDGES, BHW = RA.BRIDGE_HW;
  const TEAM = ['#2f86ff', '#ff4a3d'], TEAM_D = ['#1a4fae', '#a82219'];
  const SKIN = { classic: { stone: ['#a9a9c2', '#767690'], accent: null }, gold: { stone: ['#d9c58a', '#a58a45'], accent: '#ffd84a' }, shadow: { stone: ['#6a5a88', '#3d3358'], accent: '#c05af0' } };

  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  class Renderer {
    constructor(canvas) { this.cv = canvas; this.c = canvas.getContext('2d'); this.S = 20; this.ox = 0; this.oy = 0; this.bg = null; this.bgKey = ''; this.time = 0; this.resize(); }
    resize() {
      const cv = this.cv, dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth || 360, h = cv.clientHeight || 640;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); this.dpr = dpr; this.w = w; this.h = h;
      this.S = Math.min(w / W, h / H); this.ox = (w - this.S * W) / 2; this.oy = (h - this.S * H) / 2; this.bg = null;
    }
    toArena(cx, cy) { const r = this.cv.getBoundingClientRect(); return { x: (cx - r.left - this.ox) / this.S, y: (cy - r.top - this.oy) / this.S }; }
    X(x) { return this.ox + x * this.S; } Y(y) { return this.oy + y * this.S; }
    theme() { const id = RA.Save.data.shop.theme; return RA.THEMES.find((t) => t.id === id) || RA.THEMES[0]; }

    buildBg() {
      const th = this.theme(), S = this.S, off = document.createElement('canvas'); off.width = Math.round(this.w * this.dpr); off.height = Math.round(this.h * this.dpr);
      const c = off.getContext('2d'); c.scale(this.dpr, this.dpr);
      c.fillStyle = th.wall; c.fillRect(0, 0, this.w, this.h);
      c.save(); c.translate(this.ox, this.oy);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { c.fillStyle = (x + y) % 2 ? th.a : th.b; c.fillRect(x * S, y * S, S + 0.5, S + 0.5); }
      // paths + plazas
      c.fillStyle = th.path;
      BR.forEach((bx) => c.fillRect((bx - 0.85) * S, 5.2 * S, 1.7 * S, 21.6 * S));
      c.fillRect((BR[0] - 0.85) * S, 3.9 * S, (BR[1] - BR[0] + 1.7) * S, 1.3 * S); c.fillRect((BR[0] - 0.85) * S, 26.8 * S, (BR[1] - BR[0] + 1.7) * S, 1.3 * S);
      [[3.5, 6.5], [14.5, 6.5], [3.5, 25.5], [14.5, 25.5]].forEach(([x, y]) => c.fillRect((x - 1.8) * S, (y - 1.8) * S, 3.6 * S, 3.6 * S));
      [[9, 2.5], [9, 29.5]].forEach(([x, y]) => c.fillRect((x - 2.3) * S, (y - 2.3) * S, 4.6 * S, 4.6 * S));
      c.globalAlpha = 0.18; c.fillStyle = '#000'; for (let i = 0; i < 400; i++) { c.fillRect(Math.random() * W * S, Math.random() * H * S, 2, 2); } c.globalAlpha = 1;
      // river
      const g = c.createLinearGradient(0, (RY - RH) * S, 0, (RY + RH) * S); g.addColorStop(0, th.river); g.addColorStop(1, '#2a6fb0');
      c.fillStyle = g; c.fillRect(0, (RY - RH) * S, W * S, 2 * RH * S);
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, (RY - RH) * S, W * S, 3); c.fillRect(0, (RY + RH) * S - 2, W * S, 2);
      // bridges
      BR.forEach((bx) => {
        const x0 = (bx - BHW - 0.15) * S, w = (BHW * 2 + 0.3) * S, y0 = (RY - RH - 0.35) * S, h = (2 * RH + 0.7) * S;
        c.fillStyle = '#c98b2b'; c.fillRect(x0, y0, w, h); c.fillStyle = '#e8b04a'; for (let i = 0; i < 6; i++) c.fillRect(x0 + 2, y0 + 2 + i * (h / 6), w - 4, h / 6 - 3);
        c.fillStyle = '#ffd24a'; [x0, x0 + w - 0.5 * S].forEach((px) => { rr(c, px, y0 - 0.1 * S, 0.5 * S, h + 0.2 * S, 3); c.fill(); });
      });
      // frame
      c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 3; c.strokeRect(0, 0, W * S, H * S);
      c.restore(); this.bg = off; this.bgKey = th.id + this.S;
    }

    // ------------------------------------------------------------------
    draw(g, ui) {
      const c = this.c, S = this.S; this.time += 1 / 60; ui = ui || {};
      if (!this.bg || this.bgKey !== this.theme().id + this.S) this.buildBg();
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.w, this.h);
      c.save(); if (g.shake > 0) c.translate((Math.random() - 0.5) * 8 * g.shake, (Math.random() - 0.5) * 8 * g.shake);
      c.drawImage(this.bg, 0, 0, this.w, this.h);
      this.waves(c);
      if (ui.zone) this.zone(c, g);
      this.drawAreas(c, g, true);
      const list = []; g.towers.forEach((t) => list.push(t)); g.ents.forEach((e) => { if (!(e.fly || e.airborne)) list.push(e); });
      list.sort((a, b) => a.y - b.y);
      for (const e of list) e.kind === 'tower' ? this.tower(c, e, g) : this.unit(c, e, g);
      this.drawAreas(c, g, false);
      const fl = g.ents.filter((e) => e.fly || e.airborne).sort((a, b) => a.y - b.y); for (const e of fl) this.unit(c, e, g);
      for (const p of g.projs) this.proj(c, p);
      for (const f of g.fx) this.fxDraw(c, f);
      if (ui.preview) this.preview(c, ui.preview);
      c.restore();
    }
    waves(c) {
      const S = this.S, y = this.Y(RY); c.save(); c.globalAlpha = 0.35; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) { c.beginPath(); for (let x = 0; x <= W; x += 0.5) { const px = this.X(x), py = y + Math.sin(x * 1.7 + this.time * 2 + i * 1.3) * S * 0.12 + (i - 2) * S * 0.18; x ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); }
      c.restore();
    }
    zone(c, g) {
      const S = this.S; c.save(); c.fillStyle = 'rgba(255,40,40,0.22)';
      for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) { if (!g.canDeploy(0, { type: 'troop' }, tx + 0.5, ty + 0.5)) c.fillRect(this.X(tx), this.Y(ty), S, S); }
      c.restore();
    }
    bar(c, px, py, w, ratio, team, lvl, big) {
      const h = big ? 8 : 5; c.save(); c.fillStyle = 'rgba(0,0,0,0.6)'; rr(c, px - w / 2 - 1, py - 1, w + 2, h + 2, 3); c.fill();
      c.fillStyle = TEAM[team]; rr(c, px - w / 2, py, Math.max(1, w * Math.max(0, ratio)), h, 2); c.fill();
      if (lvl) { c.fillStyle = '#ffd84a'; c.strokeStyle = '#6b4a00'; c.lineWidth = 1.5; const bw = big ? 17 : 13; rr(c, px - w / 2 - bw + 3, py - 2, bw, h + 4, 3); c.fill(); c.stroke(); c.fillStyle = '#3a2600'; c.font = 'bold ' + (big ? 10 : 8) + 'px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lvl, px - w / 2 - bw / 2 + 3, py + h / 2); }
      c.restore();
    }

    unit(c, e, g) {
      const S = this.S, px = this.X(e.x), baseY = this.Y(e.y);
      if (e.underground > 0) { c.fillStyle = 'rgba(70,45,20,0.7)'; c.beginPath(); c.ellipse(px, baseY, S * 0.7, S * 0.35, 0, 0, 6.3); c.fill(); return; }
      const big = e.kind === 'building';
      let rad = Math.max(S * 0.5, e.r * S * 1.5);
      const lift = (e.fly ? 0.55 : 0) + (e.z || 0), py = baseY - lift * S;
      // shadow
      c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(px, baseY + rad * 0.45, rad * 0.9, rad * 0.4, 0, 0, 6.3); c.fill();
      let sc = 1, alpha = 1; if (e.deployT > 0) { const k = 1 - e.deployT / Math.max(0.1, e.card.deploy); sc = 0.55 + 0.45 * k; alpha = 0.55 + 0.45 * k; }
      if (e.cloakT > 0) alpha = e.team === 0 ? 0.45 : 0.25;
      const bob = e.kind === 'unit' && !e.target ? Math.sin(e.anim * 9) * 1.5 : 0;
      let ax = 0, ay = 0; if (e.atkT > 0) { const k = e.atkT / 0.25; ax = e.dirx * 4 * k; ay = e.diry * 4 * k; }
      c.save(); c.translate(px + ax, py + bob + ay); c.scale(sc, sc); c.globalAlpha = alpha;
      const img = RA.Img.ports[e.art] || RA.Img.ports.knight;
      if (big) { const s2 = rad * 1.9; c.fillStyle = TEAM_D[e.team]; rr(c, -s2 / 2 - 3, -s2 / 2 - 3, s2 + 6, s2 + 6, 8); c.fill(); c.save(); rr(c, -s2 / 2, -s2 / 2, s2, s2, 6); c.clip(); if (img.complete && img.naturalWidth) c.drawImage(img, -s2 / 2, -s2 / 2, s2, s2); c.restore(); }
      else {
        c.fillStyle = TEAM[e.team]; c.beginPath(); c.arc(0, 0, rad + 3, 0, 6.3); c.fill();
        c.save(); c.beginPath(); c.arc(0, 0, rad, 0, 6.3); c.clip(); c.fillStyle = '#334'; c.fillRect(-rad, -rad, rad * 2, rad * 2);
        if (img.complete && img.naturalWidth) c.drawImage(img, -rad, -rad, rad * 2, rad * 2); c.restore();
        c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, rad, 0, 6.3); c.stroke();
        if (e.card.champion) { c.strokeStyle = '#ffd84a'; c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, rad + 4.5, 0, 6.3); c.stroke(); }
      }
      if (e.flash > 0) { c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(0, 0, rad, 0, 6.3); c.fill(); }
      if (e.slowT > 0) { c.fillStyle = 'rgba(110,190,255,0.35)'; c.beginPath(); c.arc(0, 0, rad, 0, 6.3); c.fill(); }
      if (e.charging) { c.strokeStyle = '#ffe44a'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, rad + 6, this.time * 8, this.time * 8 + 4); c.stroke(); }
      if (e.stun > 0) { c.fillStyle = '#ffe44a'; for (let i = 0; i < 3; i++) { const a = this.time * 7 + i * 2.1; c.beginPath(); c.arc(Math.cos(a) * rad * 0.9, -rad - 4 + Math.sin(a) * 3, 3, 0, 6.3); c.fill(); } }
      if (e.dash) { c.strokeStyle = '#ffd84a'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, rad + 5, 0, 6.3); c.stroke(); }
      c.restore();
      // bars
      if (e.hp < e.maxHp || big || e.card.champion) { const w = Math.max(rad * 2, 26); this.bar(c, px, py - rad - 11, w, e.hp / e.maxHp, e.team, e.lvl, false); }
      if (e.card.champion && e.abCd > 0) { c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(px - 12, py + rad + 6, 24, 3); c.fillStyle = '#ffd84a'; c.fillRect(px - 12, py + rad + 6, 24 * (1 - e.abCd / e.card.ability.cd), 3); }
      if (e.rampLvl > 0 && e.card.ramp) { c.fillStyle = e.rampLvl === 2 ? '#ff5533' : '#ffb04a'; c.fillRect(px - 10, py + rad + 11, 20 * (e.rampLvl / 2), 3); }
    }

    tower(c, t, g) {
      const S = this.S, px = this.X(t.x), py = this.Y(t.y), king = t.tower === 'king', w = t.r * 2 * S * (king ? 0.95 : 1.0), h = w * 0.95;
      const sk = SKIN[RA.Save.data.shop.towerSkin] || SKIN.classic;
      if (t.dead) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(px, py + 4, w * 0.5, w * 0.3, 0, 0, 6.3); c.fill(); c.fillStyle = '#8a8a96'; [[-0.3, 0.05, 0.28], [0.15, -0.05, 0.22], [0.0, 0.2, 0.2], [-0.15, -0.15, 0.17], [0.32, 0.18, 0.15]].forEach(([dx, dy, r]) => { c.beginPath(); c.arc(px + dx * w, py + dy * w, r * w * 0.5, 0, 6.3); c.fill(); }); c.fillStyle = '#6b4a2a'; c.fillRect(px - w * 0.3, py - 2, w * 0.4, 5); return; }
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(px, py + h * 0.45, w * 0.55, w * 0.25, 0, 0, 6.3); c.fill();
      c.save(); if (t.flash > 0) c.globalAlpha = 0.85;
      // body
      const gr = c.createLinearGradient(px - w / 2, 0, px + w / 2, 0); gr.addColorStop(0, sk.stone[0]); gr.addColorStop(1, sk.stone[1]);
      c.fillStyle = gr; rr(c, px - w / 2, py - h * 0.2, w, h * 0.72, 5); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = sk.accent || TEAM[t.team]; c.fillRect(px - w / 2, py + h * 0.05, w, h * 0.12); c.fillStyle = TEAM_D[t.team]; c.fillRect(px - w / 2, py + h * 0.17, w, 2);
      // battlements
      c.fillStyle = sk.stone[0]; const n = king ? 5 : 4; for (let i = 0; i < n; i++) { const bw = w / (n * 1.6); c.fillRect(px - w / 2 + i * (w - bw) / (n - 1), py - h * 0.32, bw, h * 0.14); }
      c.fillStyle = TEAM[t.team]; c.fillRect(px - w / 2 - 2, py - h * 0.3, 4, h * 0.6);c.fillRect(px + w / 2 - 2, py - h * 0.3, 4, h * 0.6);
      // crown emblem
      c.fillStyle = '#ffd84a'; c.beginPath(); const cy2 = py + h * 0.32, cw = w * 0.22; c.moveTo(px - cw, cy2 + 5); c.lineTo(px - cw, cy2 - 4); c.lineTo(px - cw / 2, cy2); c.lineTo(px, cy2 - 6); c.lineTo(px + cw / 2, cy2); c.lineTo(px + cw, cy2 - 4); c.lineTo(px + cw, cy2 + 5); c.closePath(); c.fill();
      // occupant
      const dir = t.team === 0 ? -1 : 1, hy = py - h * 0.38;
      if (king) {
        c.fillStyle = '#555a66'; rr(c, px - 4, hy + (dir < 0 ? -h * 0.34 : -2), 8, h * 0.34, 3); c.fill(); c.fillStyle = '#2d3038'; c.beginPath(); c.arc(px, hy + (dir < 0 ? -h * 0.34 : h * 0.3 - 2), 5, 0, 6.3); c.fill();
        c.fillStyle = TEAM[t.team]; c.beginPath(); c.arc(px, hy + 4, w * 0.2, 0, 6.3); c.fill(); c.fillStyle = '#f2c9a0'; c.beginPath(); c.arc(px, hy - 2, w * 0.13, 0, 6.3); c.fill();
        c.fillStyle = '#5a3a1a'; c.beginPath(); c.arc(px, hy + 2, w * 0.1, 0, 3.14); c.fill(); c.fillStyle = '#ffd84a'; c.fillRect(px - w * 0.12, hy - w * 0.2, w * 0.24, w * 0.07);
        if (!t.active && t.hp >= t.maxHp) { c.fillStyle = '#fff'; c.font = 'bold ' + Math.round(S * 0.7) + 'px system-ui'; c.textAlign = 'center'; c.fillText('Zz', px + w * 0.3, hy - S * 0.2); }
      } else {
        c.fillStyle = TEAM[t.team]; c.beginPath(); c.arc(px, hy + 3, w * 0.17, 0, 6.3); c.fill(); c.fillStyle = '#f2c9a0'; c.beginPath(); c.arc(px, hy - 2, w * 0.12, 0, 6.3); c.fill();
        c.fillStyle = '#3a2410'; c.beginPath(); c.arc(px, hy - 4, w * 0.125, 3.2, 6.2); c.fill(); c.fillStyle = '#ffd84a'; c.fillRect(px - 3, hy - w * 0.18, 6, 3);
        if (t.atkT > 0) { c.strokeStyle = '#ddd'; c.lineWidth = 2; c.beginPath(); c.moveTo(px, hy); c.lineTo(px, hy + dir * 10); c.stroke(); }
      }
      c.restore();
      // hp bar (crown-level badge + number like the reference)
      const bw = w * 0.9, by = py - h * 0.52 - 16; this.bar(c, px, by, bw, t.hp / t.maxHp, t.team, t.lvl, true);
      c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2.5; c.font = 'bold ' + Math.round(S * 0.62) + 'px system-ui'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; const txt = String(Math.ceil(t.hp)); c.strokeText(txt, px, by - 3); c.fillText(txt, px, by - 3);
    }

    proj(c, p) {
      const S = this.S, x = this.X(p.x), y = this.Y(p.y), a = p.ang || 0; c.save(); c.translate(x, y - (p.kind === 'bullet' || p.kind === 'cannon' ? S * 0.5 : S * 0.3));
      switch (p.kind) {
        case 'arrow': c.rotate(a); c.strokeStyle = '#f0e8d0'; c.lineWidth = 2; c.beginPath(); c.moveTo(-S * 0.5, 0); c.lineTo(S * 0.15, 0); c.stroke(); c.fillStyle = '#ddd'; c.beginPath(); c.moveTo(S * 0.25, 0); c.lineTo(S * 0.1, -3); c.lineTo(S * 0.1, 3); c.fill(); break;
        case 'bolt': c.rotate(a); c.strokeStyle = '#aab'; c.lineWidth = 2; c.beginPath(); c.moveTo(-S * 0.4, 0); c.lineTo(S * 0.1, 0); c.stroke(); break;
        case 'cannon': c.fillStyle = '#222'; c.beginPath(); c.arc(0, 0, S * 0.2, 0, 6.3); c.fill(); break;
        case 'fire': c.fillStyle = '#ff8a2a'; c.beginPath(); c.arc(0, 0, S * 0.28, 0, 6.3); c.fill(); c.fillStyle = '#ffe27a'; c.beginPath(); c.arc(0, 0, S * 0.14, 0, 6.3); c.fill(); break;
        case 'magic': c.fillStyle = '#c05af0'; c.beginPath(); c.arc(0, 0, S * 0.22, 0, 6.3); c.fill(); c.fillStyle = '#f2c8ff'; c.beginPath(); c.arc(0, 0, S * 0.1, 0, 6.3); c.fill(); break;
        case 'ice': c.fillStyle = '#8fe3ff'; c.beginPath(); c.arc(0, 0, S * 0.24, 0, 6.3); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, S * 0.1, 0, 6.3); c.fill(); break;
        case 'zap': c.strokeStyle = '#fff36a'; c.lineWidth = 3; c.beginPath(); c.moveTo(-S * 0.5, 0); for (let i = 1; i < 5; i++) c.lineTo(-S * 0.5 + i * S * 0.2, (Math.random() - 0.5) * S * 0.3); c.stroke(); break;
        default: c.fillStyle = '#ffe66a'; c.beginPath(); c.arc(0, 0, S * 0.14, 0, 6.3); c.fill();
      }
      c.restore();
    }

    drawAreas(c, g, under) {
      const S = this.S;
      for (const a of g.areas) {
        const x = this.X(a.x), y = this.Y(a.y), col = a.team === 0 ? '47,134,255' : '255,74,61';
        if (a.kind === 'poison') {
          if (!under) continue; c.save(); const r = a.r * S; const gr = c.createRadialGradient(x, y, r * 0.2, x, y, r); gr.addColorStop(0, 'rgba(120,255,90,0.38)'); gr.addColorStop(1, 'rgba(60,170,40,0.22)'); c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill();
          c.strokeStyle = 'rgba(160,255,120,0.7)'; c.lineWidth = 2; c.setLineDash([8, 6]); c.lineDashOffset = -this.time * 20; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.stroke(); c.restore();
        } else if (a.kind === 'log') {
          if (under || a.t < a.delay) continue; const w = a.s.width * S, h = S * 0.95; c.save(); c.translate(x, y); c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(0, h * 0.45, w * 0.5, h * 0.25, 0, 0, 6.3); c.fill();
          const gr = c.createLinearGradient(0, -h / 2, 0, h / 2); gr.addColorStop(0, '#b97b3a'); gr.addColorStop(1, '#7a4a1e'); c.fillStyle = gr; rr(c, -w / 2, -h / 2, w, h, h / 2); c.fill(); c.strokeStyle = '#4a2a0e'; c.lineWidth = 2; c.stroke();
          c.strokeStyle = 'rgba(60,30,10,0.6)'; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * w * 0.18 + ((a.trav * 8) % 10) - 5, -h / 2 + 3); c.lineTo(i * w * 0.18 + ((a.trav * 8) % 10) - 5, h / 2 - 3); c.stroke(); } c.restore();
        } else if (a.kind === 'delayed') {
          const p = Math.min(1, a.t / a.delay), r = a.r * S;
          if (under) { c.fillStyle = 'rgba(' + col + ',0.14)'; c.strokeStyle = 'rgba(' + col + ',0.8)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill(); c.stroke(); }
          else { const fx = this.X(a.from.x + (a.x - a.from.x) * p), fy = this.Y(a.from.y + (a.y - a.from.y) * p) - Math.sin(Math.PI * p) * S * 4; c.fillStyle = '#ff7a1a'; c.beginPath(); c.arc(fx, fy, S * 0.6, 0, 6.3); c.fill(); c.fillStyle = '#ffe27a'; c.beginPath(); c.arc(fx, fy, S * 0.3, 0, 6.3); c.fill(); }
        } else if (a.kind === 'instant' || a.kind === 'lightning') {
          if (!under || a.fired) continue; c.strokeStyle = 'rgba(255,230,70,0.9)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, a.r * S * Math.min(1, a.t / a.delay + 0.3), 0, 6.3); c.stroke();
        } else if (a.kind === 'bomb') {
          if (!under) continue; c.fillStyle = '#222'; c.beginPath(); c.arc(x, y, S * 0.35, 0, 6.3); c.fill(); c.strokeStyle = 'rgba(255,120,40,' + (0.4 + 0.4 * Math.sin(this.time * 18)) + ')'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, a.r * S * (a.t / a.delay), 0, 6.3); c.stroke();
        }
      }
    }

    fxDraw(c, f) {
      if (f.t < 0) return; const S = this.S, p = f.t / f.dur, x = this.X(f.x || 0), y = this.Y(f.y || 0); c.save();
      switch (f.k) {
        case 'text': c.globalAlpha = 1 - p * p; c.font = 'bold ' + Math.round(S * 0.62) + 'px system-ui'; c.textAlign = 'center'; c.strokeStyle = '#000'; c.lineWidth = 3; c.fillStyle = f.col; c.strokeText(f.text, x, y - p * S * 1.5); c.fillText(f.text, x, y - p * S * 1.5); break;
        case 'ring': c.globalAlpha = 1 - p; c.strokeStyle = f.col; c.lineWidth = 3; c.beginPath(); c.arc(x, y, f.r * S * (0.3 + 0.7 * p), 0, 6.3); c.stroke(); break;
        case 'boom': { c.globalAlpha = 1 - p; const r = f.r * S * (0.4 + 0.6 * p), gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,240,150,0.95)'); gr.addColorStop(0.5, 'rgba(255,130,30,0.8)'); gr.addColorStop(1, 'rgba(180,40,0,0)'); c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill(); break; }
        case 'puff': c.globalAlpha = (1 - p) * 0.7; c.fillStyle = '#ddd'; for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.5; c.beginPath(); c.arc(x + Math.cos(a) * S * 0.5 * p * 1.5, y + Math.sin(a) * S * 0.4 * p * 1.5 - p * S * 0.4, S * 0.28 * (1 - p * 0.4), 0, 6.3); c.fill(); } break;
        case 'zap': c.globalAlpha = 1 - p; c.strokeStyle = '#fff36a'; c.lineWidth = 3; c.fillStyle = 'rgba(255,240,100,0.25)'; c.beginPath(); c.arc(x, y, f.r * S, 0, 6.3); c.fill(); c.stroke();
          for (let i = 0; i < 6; i++) { const a = i * 1.05 + this.time * 20; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * f.r * S * 0.9, y + Math.sin(a) * f.r * S * 0.9); c.stroke(); } break;
        case 'bolt': { c.globalAlpha = 1 - p; c.strokeStyle = '#cfe8ff'; c.lineWidth = 4; c.shadowColor = '#7ab8ff'; c.shadowBlur = 12; c.beginPath(); let bx = x + (Math.random() - 0.5) * 20, by = this.oy; c.moveTo(bx, by); const n = 7; for (let i = 1; i <= n; i++) { bx = x + (Math.random() - 0.5) * 22 * (1 - i / n); by = this.oy + (y - this.oy) * (i / n); c.lineTo(bx, by); } c.stroke(); break; }
        case 'banner': { c.globalAlpha = p < 0.15 ? p / 0.15 : p > 0.8 ? (1 - p) / 0.2 : 1; c.font = 'bold ' + Math.round(S * 1.1) + 'px system-ui'; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = '#2b1a55'; c.fillStyle = '#ffe36a'; c.strokeText(f.text, this.w / 2, this.h * 0.4); c.fillText(f.text, this.w / 2, this.h * 0.4); break; }
      }
      c.restore();
    }
    preview(c, pv) {
      const S = this.S, x = this.X(pv.x), y = this.Y(pv.y), d = pv.def, ok = pv.valid; c.save();
      if (d.type === 'spell') { const r = (d.spell.r || (d.spell.width ? d.spell.width / 2 : 1.5)) * S; c.fillStyle = ok ? 'rgba(255,255,255,0.18)' : 'rgba(255,60,60,0.25)'; c.strokeStyle = ok ? '#fff' : '#f55'; c.lineWidth = 2; c.beginPath(); if (d.spell.kind === 'log') { c.rect(x - r, y - d.spell.len * S * 0.5, r * 2, d.spell.len * S * 0.5); } else c.arc(x, y, r, 0, 6.3); c.fill(); c.stroke(); }
      else { const img = RA.Img.ports[pv.art], rad = Math.max(S * 0.5, d.r * S * 1.25); c.globalAlpha = ok ? 0.8 : 0.4; c.fillStyle = ok ? '#2f86ff' : '#f55'; c.beginPath(); c.arc(x, y, rad + 3, 0, 6.3); c.fill(); c.save(); c.beginPath(); c.arc(x, y, rad, 0, 6.3); c.clip(); if (img && img.complete) c.drawImage(img, x - rad, y - rad, rad * 2, rad * 2); c.restore(); }
      c.restore();
    }
  }
  RA.Renderer = Renderer;
})();
