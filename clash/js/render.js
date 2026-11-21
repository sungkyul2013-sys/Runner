/* Royale Arena — canvas renderer (v2 polish). Draws a Game (read-only) in arena tile coordinates.
   Layout follows the arena placement guide: 18x32 tiles, river rows 15-17, 2-tile bridges at x=4 / x=14. */
(function () {
  const RA = (window.RA = window.RA || {});
  const W = RA.W, H = RA.H, RY = RA.RIVER_Y, RH = RA.RIVER_HALF, BR = RA.BRIDGES, BHW = RA.BRIDGE_HW;
  const TEAM = ['#2f86ff', '#ff4a3d'], TEAM_D = ['#1a4fae', '#a82219'], TEAM_L = ['#8cc4ff', '#ff9d92'];
  const SKIN = { classic: { stone: ['#b4b4cc', '#7a7a96'], accent: null }, gold: { stone: ['#e0cc90', '#a58a45'], accent: '#ffd84a' }, shadow: { stone: ['#7a6a98', '#3d3358'], accent: '#c05af0' } };
  const DECO = { grass: ['#4a9a3c', '#2f6f2c', '#7bd25a'], snow: ['#e8f4ff', '#a9c4de', '#ffffff'], desert: ['#c9a05a', '#8a6a34', '#e8c47a'], night: ['#6a4ad0', '#3a2a80', '#b49aff'] };
  const TAU = Math.PI * 2;

  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  const seeded = (n) => { let s = n * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };

  class Renderer {
    constructor(canvas) { this.cv = canvas; this.c = canvas.getContext('2d'); this.S = 20; this.ox = 0; this.oy = 0; this.bg = null; this.bgKey = ''; this.time = 0; this.resize(); }
    resize() {
      const cv = this.cv, dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth || 360, h = cv.clientHeight || 640;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); this.dpr = dpr; this.w = w; this.h = h;
      this.S = Math.min(w / (W + 1.6), h / (H + 1.0)); this.ox = (w - this.S * W) / 2; this.oy = (h - this.S * H) / 2; this.bg = null;
    }
    toArena(cx, cy) { const r = this.cv.getBoundingClientRect(); return { x: (cx - r.left - this.ox) / this.S, y: (cy - r.top - this.oy) / this.S }; }
    X(x) { return this.ox + x * this.S; } Y(y) { return this.oy + y * this.S; }
    theme() { const id = RA.Save.data.shop.theme; return RA.THEMES.find((t) => t.id === id) || RA.THEMES[0]; }

    // ------------------------------------------------------------------ static background (cached)
    buildBg() {
      const th = this.theme(), S = this.S, rnd = seeded(7), off = document.createElement('canvas'); off.width = Math.round(this.w * this.dpr); off.height = Math.round(this.h * this.dpr);
      const c = off.getContext('2d'); c.scale(this.dpr, this.dpr);
      // 1) stone backdrop with bricks (visible in the side margins)
      c.fillStyle = th.wall; c.fillRect(0, 0, this.w, this.h);
      const bw = S * 0.9, bh = S * 0.45;
      for (let row = 0, y = 0; y < this.h; row++, y += bh) for (let x = -(row % 2) * bw / 2; x < this.w; x += bw) {
        const k = rnd(); c.fillStyle = k > 0.5 ? 'rgba(255,255,255,' + (k - 0.5) * 0.14 + ')' : 'rgba(0,0,0,' + (0.5 - k) * 0.18 + ')'; c.fillRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
      }
      c.save(); c.translate(this.ox, this.oy);
      // 2) grass: checker + per-tile noise + tufts
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        c.fillStyle = (x + y) % 2 ? th.a : th.b; c.fillRect(x * S, y * S, S + 0.6, S + 0.6);
        const k = rnd(); c.fillStyle = k > 0.5 ? 'rgba(255,255,255,' + (k - 0.5) * 0.08 + ')' : 'rgba(0,0,0,' + (0.5 - k) * 0.1 + ')'; c.fillRect(x * S, y * S, S + 0.6, S + 0.6);
      }
      c.strokeStyle = 'rgba(0,0,0,0.13)'; c.lineWidth = 1.2; for (let i = 0; i < 260; i++) { const x = rnd() * W * S, y = rnd() * H * S; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2, y - 4); c.moveTo(x, y); c.lineTo(x + 2, y - 4); c.stroke(); }
      // 3) stone-tile paths + plazas
      const stone = (x, y, w, h, rad) => {
        c.fillStyle = th.path; rr(c, x * S, y * S, w * S, h * S, rad); c.fill(); c.save(); rr(c, x * S, y * S, w * S, h * S, rad); c.clip();
        c.strokeStyle = 'rgba(0,0,0,0.14)'; c.lineWidth = 1; for (let gx = Math.floor(x); gx <= x + w; gx += 1) { c.beginPath(); c.moveTo(gx * S, y * S); c.lineTo(gx * S, (y + h) * S); c.stroke(); }
        for (let gy = Math.floor(y * 2) / 2, i = 0; gy <= y + h; gy += 0.5, i++) { c.beginPath(); c.moveTo(x * S, gy * S); c.lineTo((x + w) * S, gy * S); c.stroke(); }
        const g = c.createLinearGradient(0, y * S, 0, (y + h) * S); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.1)'); c.fillStyle = g; c.fillRect(x * S, y * S, w * S, h * S); c.restore();
        c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 1.5; rr(c, x * S, y * S, w * S, h * S, rad); c.stroke();
      };
      BR.forEach((bx) => stone(bx - 0.9, 8.5, 1.8, 15, 4));
      stone(3.5, 2.3, 11, 1.4, 4); stone(3.5, 28.3, 11, 1.4, 4);
      [[3.5, 8.5], [14.5, 8.5], [3.5, 23.5], [14.5, 23.5]].forEach(([x, y]) => stone(x - 1.95, y - 1.95, 3.9, 3.9, 5));
      [[9, 3], [9, 29]].forEach(([x, y]) => stone(x - 2.5, y - 2.5, 5, 5, 6));
      // 4) inner wall shading
      const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => { const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(rx, ry, rw, rh); };
      edge(0, 0, 0.7 * S, 0, 0, 0, 0.7 * S, H * S); edge(W * S, 0, (W - 0.7) * S, 0, (W - 0.7) * S, 0, 0.7 * S, H * S); edge(0, 0, 0, 0.6 * S, 0, 0, W * S, 0.6 * S); edge(0, H * S, 0, (H - 0.6) * S, 0, (H - 0.6) * S, W * S, 0.6 * S);
      // 5) river with sandy banks
      const ry0 = (RY - RH) * S, rh = 2 * RH * S;
      c.fillStyle = '#d9c28a'; c.fillRect(0, ry0 - 0.35 * S, W * S, 0.4 * S); c.fillRect(0, ry0 + rh - 0.05 * S, W * S, 0.4 * S);
      const g = c.createLinearGradient(0, ry0, 0, ry0 + rh); g.addColorStop(0, '#59b6f0'); g.addColorStop(0.5, th.river); g.addColorStop(1, '#2a6fb4'); c.fillStyle = g; c.fillRect(0, ry0, W * S, rh);
      c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(0, ry0, W * S, 3); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(0, ry0 + rh - 2, W * S, 2);
      // 6) bridges
      BR.forEach((bx) => {
        const x0 = (bx - BHW - 0.05) * S, w = (BHW * 2 + 0.1) * S, y0 = (RY - RH - 0.45) * S, h = (2 * RH + 0.9) * S;
        c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x0 + 4, y0 + 7, w, h);
        c.fillStyle = '#b9822e'; c.fillRect(x0, y0, w, h);
        const n = 9; for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? '#e7b24c' : '#f0c15f'; c.fillRect(x0 + 2, y0 + 1 + i * (h / n), w - 4, h / n - 1.6); }
        c.strokeStyle = '#7a4f12'; c.lineWidth = 3; c.beginPath(); c.moveTo(x0 + 1, y0); c.lineTo(x0 + 1, y0 + h); c.moveTo(x0 + w - 1, y0); c.lineTo(x0 + w - 1, y0 + h); c.stroke();
        [[x0, y0], [x0 + w, y0], [x0, y0 + h], [x0 + w, y0 + h]].forEach(([px, py]) => { c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(px, py, S * 0.27, 0, TAU); c.fill(); c.strokeStyle = '#7a4f12'; c.lineWidth = 1.5; c.stroke(); c.fillStyle = '#fff6'; c.beginPath(); c.arc(px - 2, py - 2, S * 0.09, 0, TAU); c.fill(); });
      });
      // 7) frame
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 3; c.strokeRect(0, 0, W * S, H * S); c.restore();
      // 8) margin decoration (torches / bushes) + vignette
      const dc = DECO[th.id] || DECO.grass, mx = this.ox / 2;
      if (this.ox > S * 0.45) for (let i = 0; i < 8; i++) for (const side of [0, 1]) {
        const x = side ? this.w - mx : mx, y = this.oy + (i + 0.5) * (H / 8) * S;
        if (i % 2) { c.fillStyle = dc[1]; c.beginPath(); c.arc(x, y, S * 0.34, 0, TAU); c.fill(); c.fillStyle = dc[0]; c.beginPath(); c.arc(x - 1, y - 2, S * 0.27, 0, TAU); c.fill(); c.fillStyle = dc[2]; c.beginPath(); c.arc(x - 3, y - 4, S * 0.1, 0, TAU); c.fill(); }
        else { c.fillStyle = '#3a2a1a'; c.fillRect(x - 2, y - 2, 4, S * 0.55); c.fillStyle = '#ffb04a'; c.beginPath(); c.ellipse(x, y - 4, 4, 7, 0, 0, TAU); c.fill(); c.fillStyle = '#fff2a0'; c.beginPath(); c.ellipse(x, y - 3, 2, 4, 0, 0, TAU); c.fill(); }
      }
      const vg = c.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)'); c.fillStyle = vg; c.fillRect(0, 0, this.w, this.h);
      this.bg = off; this.bgKey = th.id + '|' + this.S;
    }

    // ------------------------------------------------------------------ frame
    draw(g, ui) {
      const c = this.c; this.time += 1 / 60; ui = ui || {};
      if (!this.bg || this.bgKey !== this.theme().id + '|' + this.S) this.buildBg();
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.w, this.h);
      c.save(); if (g.shake > 0) c.translate((Math.random() - 0.5) * 8 * g.shake, (Math.random() - 0.5) * 8 * g.shake);
      c.drawImage(this.bg, 0, 0, this.w, this.h);
      this.waves(c);
      if (ui.guide) this.guideOverlay(c);
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
      const S = this.S, y = this.Y(RY); c.save(); c.lineWidth = 1.6; c.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        c.strokeStyle = i % 2 ? 'rgba(255,255,255,0.32)' : 'rgba(200,240,255,0.22)'; c.beginPath(); let pen = false;
        for (let x = 0; x <= W; x += 0.4) {
          const onBridge = BR.some((b) => Math.abs(x - b) < BHW + 0.2);
          if (onBridge) { pen = false; continue; }
          const px = this.X(x), py = y + Math.sin(x * 1.9 + this.time * 2.2 + i * 1.7) * S * 0.1 + (i - 2.5) * S * 0.3; pen ? c.lineTo(px, py) : c.moveTo(px, py); pen = true;
        }
        c.stroke();
      }
      c.restore();
    }
    zone(c, g) {
      const S = this.S; c.save(); c.fillStyle = 'rgba(255,50,50,0.2)';
      for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) { if (!g.canDeploy(0, { type: 'troop' }, tx + 0.5, ty + 0.5)) c.fillRect(this.X(tx), this.Y(ty), S + 0.5, S + 0.5); }
      c.restore();
    }
    guideOverlay(c) {
      const S = this.S; c.save(); c.font = 'bold ' + Math.round(S * 0.5) + 'px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.strokeStyle = 'rgba(120,190,255,0.35)'; c.lineWidth = 1.5; [[3.5, 23.5, 7.5], [14.5, 23.5, 7.5], [9, 29, 7]].forEach(([x, y, r]) => { c.beginPath(); c.arc(this.X(x), this.Y(y), r * S, 0, TAU); c.stroke(); });
      const tag = (x, y, w, h, col, txt) => { c.fillStyle = col + 'aa'; c.strokeStyle = col; c.lineWidth = 2.5; c.fillRect(this.X(x), this.Y(y), w * S, h * S); c.strokeRect(this.X(x), this.Y(y), w * S, h * S); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3; c.strokeText(txt, this.X(x + w / 2), this.Y(y + h / 2)); c.fillText(txt, this.X(x + w / 2), this.Y(y + h / 2)); };
      [3, 14].forEach((x) => { tag(x, 21, 1.4, 1, '#e8a000', '4-3'); tag(x, 20, 1.4, 1, '#e8a000', '3-3'); });
      tag(7, 25, 4, 2, '#c05af0', '카이팅'); tag(7, 31, 4, 1, '#3bd88a', '출발'); c.restore();
    }
    bar(c, px, py, w, ratio, team, lvl, big) {
      const h = big ? 9 : 6; c.save(); c.fillStyle = 'rgba(0,0,0,0.72)'; rr(c, px - w / 2 - 1.5, py - 1.5, w + 3, h + 3, h / 2 + 1); c.fill();
      const fw = Math.max(h, w * Math.max(0, ratio)); const g = c.createLinearGradient(0, py, 0, py + h); g.addColorStop(0, TEAM_L[team]); g.addColorStop(0.5, TEAM[team]); g.addColorStop(1, TEAM_D[team]); c.fillStyle = g; rr(c, px - w / 2, py, fw, h, h / 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)'; rr(c, px - w / 2 + 1, py + 1, Math.max(0, fw - 2), h * 0.35, h * 0.2); c.fill();
      if (lvl) { const bw = big ? 19 : 14, bx = px - w / 2 - bw / 2 + 2; c.fillStyle = '#ffd84a'; c.strokeStyle = '#6b4a00'; c.lineWidth = 1.5; rr(c, bx - bw / 2, py - 2.5, bw, h + 5, 4); c.fill(); c.stroke(); c.fillStyle = '#3a2600'; c.font = 'bold ' + (big ? 11 : 8.5) + 'px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lvl, bx, py + h / 2 + 0.5); }
      c.restore();
    }
    token(c, rad, art, team, gloss) {
      const img = RA.Img.ports[art] || RA.Img.ports.knight; const rg = c.createLinearGradient(0, -rad, 0, rad); rg.addColorStop(0, TEAM_L[team]); rg.addColorStop(0.5, TEAM[team]); rg.addColorStop(1, TEAM_D[team]);
      c.fillStyle = rg; c.beginPath(); c.arc(0, 0, rad + 3.2, 0, TAU); c.fill();
      c.save(); c.beginPath(); c.arc(0, 0, rad, 0, TAU); c.clip(); c.fillStyle = '#2a3350'; c.fillRect(-rad, -rad, rad * 2, rad * 2); if (img.complete && img.naturalWidth) c.drawImage(img, -rad, -rad, rad * 2, rad * 2);
      if (gloss) { const gl = c.createLinearGradient(0, -rad, 0, rad); gl.addColorStop(0, 'rgba(255,255,255,0.22)'); gl.addColorStop(0.45, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,0.25)'); c.fillStyle = gl; c.fillRect(-rad, -rad, rad * 2, rad * 2); }
      c.restore(); c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, rad, 0, TAU); c.stroke();
    }

    unit(c, e, g) {
      const S = this.S, px = this.X(e.x), baseY = this.Y(e.y);
      if (e.underground > 0) { c.fillStyle = 'rgba(70,45,20,0.75)'; c.beginPath(); c.ellipse(px, baseY, S * 0.75, S * 0.38, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(120,80,40,0.8)'; c.beginPath(); c.ellipse(px, baseY - 2, S * 0.5, S * 0.22, 0, 0, TAU); c.fill(); return; }
      const big = e.kind === 'building', rad = Math.max(S * 0.5, e.r * S * 1.5);
      const lift = (e.fly ? 0.55 : 0) + (e.z || 0), py = baseY - lift * S;
      // ground platform: soft shadow + team ring (ground units/buildings only)
      c.save(); c.globalAlpha = e.cloakT > 0 ? 0.4 : 1; c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(px, baseY + rad * 0.5, rad * (e.fly ? 0.75 : 1.0), rad * 0.4, 0, 0, TAU); c.fill();
      if (!e.fly && !big) { c.fillStyle = TEAM[e.team] + '33'; c.strokeStyle = TEAM[e.team] + 'cc'; c.lineWidth = 2; c.beginPath(); c.ellipse(px, baseY + rad * 0.5, rad * 1.12, rad * 0.46, 0, 0, TAU); c.fill(); c.stroke(); }
      c.restore();
      let sc = 1, alpha = 1; if (e.deployT > 0) { const k = 1 - e.deployT / Math.max(0.1, e.card.deploy), ease = 1 - Math.pow(1 - k, 3); sc = 0.45 + 0.55 * ease + Math.sin(k * Math.PI) * 0.12; alpha = 0.5 + 0.5 * k; }
      if (e.cloakT > 0) alpha = e.team === 0 ? 0.45 : 0.25;
      const bob = e.kind === 'unit' && !e.target ? Math.sin(e.anim * 9) * 1.6 : 0;
      let ax = 0, ay = 0; if (e.atkT > 0) { const k = e.atkT / 0.25; ax = e.dirx * 5 * k; ay = e.diry * 5 * k; }
      c.save(); c.translate(px + ax, py + bob + ay); c.scale(sc, sc); c.globalAlpha = alpha;
      if (big) {
        const s2 = rad * 1.9; c.fillStyle = TEAM_D[e.team]; rr(c, -s2 / 2 - 3.5, -s2 / 2 - 3.5, s2 + 7, s2 + 7, 9); c.fill(); c.strokeStyle = TEAM_L[e.team]; c.lineWidth = 1.5; c.stroke();
        c.save(); rr(c, -s2 / 2, -s2 / 2, s2, s2, 7); c.clip(); const img = RA.Img.ports[e.art] || RA.Img.ports.knight; if (img.complete && img.naturalWidth) c.drawImage(img, -s2 / 2, -s2 / 2, s2, s2); c.restore();
      } else this.token(c, rad, e.art, e.team, true);
      if (e.card.champion) { c.strokeStyle = '#ffd84a'; c.lineWidth = 2.6; c.shadowColor = '#ffd84a'; c.shadowBlur = 8; c.beginPath(); c.arc(0, 0, rad + 5, 0, TAU); c.stroke(); c.shadowBlur = 0; }
      if (e.flash > 0) { c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(0, 0, rad, 0, TAU); c.fill(); }
      if (e.slowT > 0) { c.fillStyle = 'rgba(110,190,255,0.38)'; c.beginPath(); c.arc(0, 0, rad, 0, TAU); c.fill(); }
      if (e.charging) { c.strokeStyle = '#ffe44a'; c.lineWidth = 2.4; c.beginPath(); c.arc(0, 0, rad + 7, this.time * 8, this.time * 8 + 4); c.stroke(); }
      if (e.stun > 0) { c.fillStyle = '#ffe44a'; for (let i = 0; i < 3; i++) { const a = this.time * 7 + i * 2.1; c.beginPath(); c.arc(Math.cos(a) * rad * 0.9, -rad - 5 + Math.sin(a) * 3, 3.2, 0, TAU); c.fill(); } }
      if (e.dash) { c.strokeStyle = '#ffd84a'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, rad + 6, 0, TAU); c.stroke(); }
      c.restore();
      if (e.hp < e.maxHp || big || e.card.champion) { const w = Math.max(rad * 2, 28); this.bar(c, px, py - rad - 13, w, e.hp / e.maxHp, e.team, e.lvl, false); }
      if (e.card.champion && e.abCd > 0) { c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(px - 13, py + rad + 7, 26, 4); c.fillStyle = '#ffd84a'; c.fillRect(px - 13, py + rad + 7, 26 * (1 - e.abCd / e.card.ability.cd), 4); }
      if (e.rampLvl > 0 && e.card.ramp) { c.fillStyle = e.rampLvl === 2 ? '#ff5533' : '#ffb04a'; c.fillRect(px - 11, py + rad + 13, 22 * (e.rampLvl / 2), 3); }
    }

    tower(c, t, g) {
      const S = this.S, px = this.X(t.x), py = this.Y(t.y), king = t.tower === 'king', w = t.r * 2 * S * (king ? 0.92 : 0.98), h = w * 0.95;
      const sk = SKIN[RA.Save.data.shop.towerSkin] || SKIN.classic;
      if (t.dead) {
        c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(px, py + 5, w * 0.55, w * 0.32, 0, 0, TAU); c.fill();
        [[-0.3, 0.05, 0.3, '#8a8a96'], [0.15, -0.05, 0.24, '#9a9aa6'], [0, 0.2, 0.22, '#7a7a88'], [-0.15, -0.15, 0.18, '#a6a6b2'], [0.32, 0.18, 0.16, '#8a8a96'], [-0.35, 0.28, 0.14, '#7a7a88']].forEach(([dx, dy, r, col]) => { c.fillStyle = col; c.beginPath(); c.arc(px + dx * w, py + dy * w, r * w * 0.5, 0, TAU); c.fill(); });
        c.fillStyle = '#6b4a2a'; c.save(); c.translate(px, py); c.rotate(0.4); c.fillRect(-w * 0.3, -2, w * 0.45, 5); c.rotate(-1.1); c.fillRect(-w * 0.1, 2, w * 0.4, 4); c.restore(); return;
      }
      c.fillStyle = 'rgba(0,0,0,0.32)'; c.beginPath(); c.ellipse(px + 4, py + h * 0.46, w * 0.58, w * 0.26, 0, 0, TAU); c.fill();
      c.save(); if (t.flash > 0) c.globalAlpha = 0.82;
      const gr = c.createLinearGradient(px - w / 2, 0, px + w / 2, 0); gr.addColorStop(0, sk.stone[0]); gr.addColorStop(1, sk.stone[1]);
      c.fillStyle = gr; rr(c, px - w / 2, py - h * 0.2, w, h * 0.72, 5); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1.6; c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(px - w / 2, py - h * 0.2 + i * h * 0.18); c.lineTo(px + w / 2, py - h * 0.2 + i * h * 0.18); c.stroke(); }
      c.fillStyle = sk.accent || TEAM[t.team]; c.fillRect(px - w / 2, py + h * 0.05, w, h * 0.12); c.fillStyle = TEAM_D[t.team]; c.fillRect(px - w / 2, py + h * 0.17, w, 2);
      c.fillStyle = 'rgba(20,20,40,0.75)'; for (const dx of [-0.25, 0.25]) { rr(c, px + dx * w - 3, py - h * 0.08, 6, h * 0.14, 3); c.fill(); }
      c.fillStyle = sk.stone[0]; const n = king ? 5 : 4; for (let i = 0; i < n; i++) { const bw = w / (n * 1.6); c.fillRect(px - w / 2 + i * (w - bw) / (n - 1), py - h * 0.33, bw, h * 0.15); c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1; c.strokeRect(px - w / 2 + i * (w - bw) / (n - 1), py - h * 0.33, bw, h * 0.15); }
      c.fillStyle = TEAM[t.team]; c.fillRect(px - w / 2 - 2, py - h * 0.3, 4, h * 0.6); c.fillRect(px + w / 2 - 2, py - h * 0.3, 4, h * 0.6);
      c.fillStyle = '#ffd84a'; c.beginPath(); const cy2 = py + h * 0.33, cw = w * 0.2; c.moveTo(px - cw, cy2 + 5); c.lineTo(px - cw, cy2 - 4); c.lineTo(px - cw / 2, cy2); c.lineTo(px, cy2 - 6); c.lineTo(px + cw / 2, cy2); c.lineTo(px + cw, cy2 - 4); c.lineTo(px + cw, cy2 + 5); c.closePath(); c.fill(); c.strokeStyle = '#7a4f00'; c.lineWidth = 1; c.stroke();
      const ratio = t.hp / t.maxHp;
      if (ratio < 0.55) { c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(px - w * 0.2, py - h * 0.18); c.lineTo(px - w * 0.1, py - h * 0.02); c.lineTo(px - w * 0.2, py + h * 0.12); c.moveTo(px + w * 0.25, py - h * 0.1); c.lineTo(px + w * 0.15, py + h * 0.06); c.stroke(); }
      const dir = t.team === 0 ? -1 : 1, hy = py - h * 0.4;
      if (king) {
        c.fillStyle = '#555a66'; rr(c, px - 4.5, hy + (dir < 0 ? -h * 0.34 : -2), 9, h * 0.34, 3); c.fill(); c.fillStyle = '#2d3038'; c.beginPath(); c.arc(px, hy + (dir < 0 ? -h * 0.34 : h * 0.3 - 2), 5.5, 0, TAU); c.fill();
        c.fillStyle = TEAM[t.team]; c.beginPath(); c.arc(px, hy + 4, w * 0.21, 0, TAU); c.fill(); c.fillStyle = '#f2c9a0'; c.beginPath(); c.arc(px, hy - 2, w * 0.14, 0, TAU); c.fill();
        c.fillStyle = '#5a3a1a'; c.beginPath(); c.arc(px, hy + 2, w * 0.11, 0, Math.PI); c.fill(); c.fillStyle = '#ffd84a'; c.fillRect(px - w * 0.13, hy - w * 0.22, w * 0.26, w * 0.08); c.fillRect(px - w * 0.13, hy - w * 0.27, w * 0.05, w * 0.06); c.fillRect(px + w * 0.08, hy - w * 0.27, w * 0.05, w * 0.06); c.fillRect(px - w * 0.025, hy - w * 0.3, w * 0.05, w * 0.09);
        if (!t.active && ratio >= 1) { c.fillStyle = '#fff'; c.strokeStyle = '#2b1a55'; c.lineWidth = 3; c.font = 'bold ' + Math.round(S * 0.62) + 'px system-ui'; c.textAlign = 'center'; const zy = hy - S * 0.2 - Math.sin(this.time * 2) * 3; c.strokeText('Zz', px + w * 0.32, zy); c.fillText('Zz', px + w * 0.32, zy); }
      } else {
        c.fillStyle = TEAM[t.team]; c.beginPath(); c.arc(px, hy + 3, w * 0.18, 0, TAU); c.fill(); c.fillStyle = '#f2c9a0'; c.beginPath(); c.arc(px, hy - 2, w * 0.13, 0, TAU); c.fill();
        c.fillStyle = '#3a2410'; c.beginPath(); c.arc(px, hy - 4, w * 0.135, 3.2, 6.2); c.fill(); c.fillStyle = '#ffd84a'; c.fillRect(px - 4, hy - w * 0.2, 8, 3.5);
        if (t.atkT > 0) { c.strokeStyle = '#eee'; c.lineWidth = 2; c.beginPath(); c.moveTo(px, hy); c.lineTo(px, hy + dir * 11); c.stroke(); }
      }
      c.restore();
      if (ratio < 0.3) { c.fillStyle = 'rgba(70,70,80,0.55)'; for (let i = 0; i < 3; i++) { const p = ((this.time * 0.8 + i / 3) % 1); c.globalAlpha = 0.6 * (1 - p); c.beginPath(); c.arc(px + (i - 1) * w * 0.2 + Math.sin(p * 6) * 3, py - h * 0.45 - p * S * 1.6, S * (0.2 + p * 0.3), 0, TAU); c.fill(); } c.globalAlpha = 1; }
      const bw = w * 0.92, by = py - h * 0.55 - 18; this.bar(c, px, by, bw, ratio, t.team, t.lvl, true);
      c.fillStyle = '#fff'; c.strokeStyle = '#0a0a20'; c.lineWidth = 3; c.font = 'bold ' + Math.round(S * 0.64) + 'px system-ui'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; const txt = String(Math.ceil(t.hp)); c.strokeText(txt, px, by - 3); c.fillText(txt, px, by - 3);
    }

    proj(c, p) {
      const S = this.S, x = this.X(p.x), y = this.Y(p.y), a = p.ang || 0; c.save(); c.translate(x, y - (p.kind === 'bullet' || p.kind === 'cannon' ? S * 0.5 : S * 0.3));
      switch (p.kind) {
        case 'arrow': c.rotate(a); c.strokeStyle = '#f0e8d0'; c.lineWidth = 2; c.beginPath(); c.moveTo(-S * 0.55, 0); c.lineTo(S * 0.15, 0); c.stroke(); c.fillStyle = '#ddd'; c.beginPath(); c.moveTo(S * 0.28, 0); c.lineTo(S * 0.1, -3); c.lineTo(S * 0.1, 3); c.fill(); break;
        case 'bolt': c.rotate(a); c.strokeStyle = '#b8bcd0'; c.lineWidth = 2; c.beginPath(); c.moveTo(-S * 0.45, 0); c.lineTo(S * 0.1, 0); c.stroke(); break;
        case 'cannon': c.fillStyle = '#1b1b22'; c.beginPath(); c.arc(0, 0, S * 0.21, 0, TAU); c.fill(); c.fillStyle = '#fff4'; c.beginPath(); c.arc(-2, -2, S * 0.07, 0, TAU); c.fill(); break;
        case 'fire': { const g = c.createRadialGradient(0, 0, 1, 0, 0, S * 0.45); g.addColorStop(0, '#fff3a0'); g.addColorStop(0.45, '#ff9a2a'); g.addColorStop(1, 'rgba(255,60,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, S * 0.45, 0, TAU); c.fill(); break; }
        case 'magic': { const g = c.createRadialGradient(0, 0, 1, 0, 0, S * 0.38); g.addColorStop(0, '#f6d8ff'); g.addColorStop(0.5, '#c05af0'); g.addColorStop(1, 'rgba(150,40,220,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, S * 0.38, 0, TAU); c.fill(); break; }
        case 'ice': { const g = c.createRadialGradient(0, 0, 1, 0, 0, S * 0.38); g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#8fe3ff'); g.addColorStop(1, 'rgba(80,190,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, S * 0.38, 0, TAU); c.fill(); break; }
        case 'zap': c.strokeStyle = '#fff36a'; c.lineWidth = 3; c.shadowColor = '#ffe44a'; c.shadowBlur = 8; c.beginPath(); c.moveTo(-S * 0.5, 0); for (let i = 1; i < 5; i++) c.lineTo(-S * 0.5 + i * S * 0.2, (Math.random() - 0.5) * S * 0.3); c.stroke(); break;
        default: c.fillStyle = '#ffe66a'; c.shadowColor = '#ffe66a'; c.shadowBlur = 6; c.beginPath(); c.arc(0, 0, S * 0.14, 0, TAU); c.fill();
      }
      c.restore();
    }

    drawAreas(c, g, under) {
      const S = this.S;
      for (const a of g.areas) {
        const x = this.X(a.x), y = this.Y(a.y), col = a.team === 0 ? '47,134,255' : '255,74,61';
        if (a.kind === 'poison') {
          if (!under) continue; c.save(); const r = a.r * S; const gr = c.createRadialGradient(x, y, r * 0.2, x, y, r); gr.addColorStop(0, 'rgba(120,255,90,0.4)'); gr.addColorStop(1, 'rgba(60,170,40,0.22)'); c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
          c.fillStyle = 'rgba(190,255,150,0.5)'; for (let i = 0; i < 7; i++) { const aa = this.time * 0.8 + i * 0.9, rr2 = (0.2 + ((i * 0.37) % 0.7)) * r; c.beginPath(); c.arc(x + Math.cos(aa) * rr2, y + Math.sin(aa) * rr2 * 0.9 - ((this.time * 12 + i * 9) % 12), 3 + (i % 3), 0, TAU); c.fill(); }
          c.strokeStyle = 'rgba(160,255,120,0.75)'; c.lineWidth = 2; c.setLineDash([8, 6]); c.lineDashOffset = -this.time * 20; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); c.restore();
        } else if (a.kind === 'log') {
          if (under || a.t < a.delay) continue; const w = a.s.width * S, h = S * 0.95; c.save(); c.translate(x, y); c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(0, h * 0.5, w * 0.5, h * 0.25, 0, 0, TAU); c.fill();
          const gr = c.createLinearGradient(0, -h / 2, 0, h / 2); gr.addColorStop(0, '#c98a44'); gr.addColorStop(1, '#7a4a1e'); c.fillStyle = gr; rr(c, -w / 2, -h / 2, w, h, h / 2); c.fill(); c.strokeStyle = '#4a2a0e'; c.lineWidth = 2; c.stroke();
          c.fillStyle = '#e0b070'; c.beginPath(); c.ellipse(w / 2 - h * 0.35, 0, h * 0.3, h * 0.42, 0, 0, TAU); c.fill(); c.strokeStyle = '#6a3e14'; c.beginPath(); c.ellipse(w / 2 - h * 0.35, 0, h * 0.16, h * 0.24, 0, 0, TAU); c.stroke();
          c.strokeStyle = 'rgba(60,30,10,0.55)'; for (let i = -2; i <= 2; i++) { const xx = i * w * 0.16 + ((a.trav * 8) % 10) - 5; c.beginPath(); c.moveTo(xx, -h / 2 + 3); c.lineTo(xx, h / 2 - 3); c.stroke(); } c.restore();
        } else if (a.kind === 'delayed') {
          const p = Math.min(1, a.t / a.delay), r = a.r * S;
          if (under) { c.fillStyle = 'rgba(' + col + ',0.14)'; c.strokeStyle = 'rgba(' + col + ',0.85)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.arc(x, y, r * p, 0, TAU); c.stroke(); }
          else { const fx = this.X(a.from.x + (a.x - a.from.x) * p), fy = this.Y(a.from.y + (a.y - a.from.y) * p) - Math.sin(Math.PI * p) * S * 4; const gg = c.createRadialGradient(fx, fy, 2, fx, fy, S * 0.9); gg.addColorStop(0, '#fff6b0'); gg.addColorStop(0.35, '#ff9a2a'); gg.addColorStop(1, 'rgba(255,60,0,0)'); c.fillStyle = gg; c.beginPath(); c.arc(fx, fy, S * 0.9, 0, TAU); c.fill(); }
        } else if (a.kind === 'instant' || a.kind === 'lightning') {
          if (!under || a.fired) continue; c.strokeStyle = 'rgba(255,230,70,0.95)'; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, a.r * S * Math.min(1, a.t / a.delay + 0.3), 0, TAU); c.stroke();
        } else if (a.kind === 'bomb') {
          if (!under) continue; c.fillStyle = '#222'; c.beginPath(); c.arc(x, y, S * 0.36, 0, TAU); c.fill(); c.fillStyle = '#ff6a2a'; c.beginPath(); c.arc(x + 4, y - S * 0.36, 3, 0, TAU); c.fill(); c.strokeStyle = 'rgba(255,120,40,' + (0.4 + 0.4 * Math.sin(this.time * 18)) + ')'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, a.r * S * (a.t / a.delay), 0, TAU); c.stroke();
        }
      }
    }

    fxDraw(c, f) {
      if (f.t < 0) return; const S = this.S, p = f.t / f.dur, x = this.X(f.x || 0), y = this.Y(f.y || 0); c.save();
      switch (f.k) {
        case 'text': c.globalAlpha = 1 - p * p; c.font = 'bold ' + Math.round(S * 0.66) + 'px system-ui'; c.textAlign = 'center'; c.strokeStyle = '#000'; c.lineWidth = 3.2; c.fillStyle = f.col; c.strokeText(f.text, x, y - p * S * 1.5); c.fillText(f.text, x, y - p * S * 1.5); break;
        case 'ring': c.globalAlpha = 1 - p; c.strokeStyle = f.col; c.lineWidth = 3.5 * (1 - p) + 1; c.beginPath(); c.ellipse(x, y, f.r * S * (0.3 + 0.7 * p), f.r * S * (0.3 + 0.7 * p) * 0.8, 0, 0, TAU); c.stroke(); break;
        case 'boom': { c.globalAlpha = 1 - p; const r = f.r * S * (0.4 + 0.6 * p), gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,245,170,0.95)'); gr.addColorStop(0.5, 'rgba(255,130,30,0.8)'); gr.addColorStop(1, 'rgba(180,40,0,0)'); c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.strokeStyle = 'rgba(255,230,160,' + (1 - p) + ')'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r * 1.05, 0, TAU); c.stroke(); break; }
        case 'puff': c.globalAlpha = (1 - p) * 0.7; c.fillStyle = '#e6e6ee'; for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.5; c.beginPath(); c.arc(x + Math.cos(a) * S * 0.5 * p * 1.6, y + Math.sin(a) * S * 0.4 * p * 1.6 - p * S * 0.4, S * 0.28 * (1 - p * 0.4), 0, TAU); c.fill(); } break;
        case 'ghost': { const rad = Math.max(S * 0.5, f.r * S * 1.5); c.globalAlpha = (1 - p) * 0.9; c.translate(x, y - (f.fly ? 0.55 * S : 0) - p * S * 0.7); c.scale(1 - p * 0.45, 1 - p * 0.45); c.rotate(p * (f.team ? 0.6 : -0.6)); this.token(c, rad, f.art, f.team, false); break; }
        case 'zap': c.globalAlpha = 1 - p; c.strokeStyle = '#fff36a'; c.lineWidth = 3; c.fillStyle = 'rgba(255,240,100,0.25)'; c.beginPath(); c.arc(x, y, f.r * S, 0, TAU); c.fill(); c.stroke();
          for (let i = 0; i < 6; i++) { const a = i * 1.05 + this.time * 20; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * f.r * S * 0.9, y + Math.sin(a) * f.r * S * 0.9); c.stroke(); } break;
        case 'bolt': { c.globalAlpha = 1 - p; c.strokeStyle = '#cfe8ff'; c.lineWidth = 4; c.shadowColor = '#7ab8ff'; c.shadowBlur = 14; c.beginPath(); let bx = x + (Math.random() - 0.5) * 20, by = this.oy; c.moveTo(bx, by); const n = 7; for (let i = 1; i <= n; i++) { bx = x + (Math.random() - 0.5) * 22 * (1 - i / n); by = this.oy + (y - this.oy) * (i / n); c.lineTo(bx, by); } c.stroke(); break; }
        case 'banner': { const k = p < 0.15 ? p / 0.15 : p > 0.8 ? (1 - p) / 0.2 : 1; c.globalAlpha = k; c.font = 'bold ' + Math.round(S * 1.15) + 'px system-ui'; c.textAlign = 'center'; c.lineWidth = 6; c.strokeStyle = '#2b1a55'; c.fillStyle = '#ffe36a'; const sc = 0.8 + 0.2 * Math.min(1, p / 0.15); c.translate(this.w / 2, this.h * 0.4); c.scale(sc, sc); c.strokeText(f.text, 0, 0); c.fillText(f.text, 0, 0); break; }
      }
      c.restore();
    }
    preview(c, pv) {
      const S = this.S, x = this.X(pv.x), y = this.Y(pv.y), d = pv.def, ok = pv.valid; c.save();
      if (d.type === 'spell') { const r = (d.spell.r || (d.spell.width ? d.spell.width / 2 : 1.5)) * S; c.fillStyle = ok ? 'rgba(255,255,255,0.18)' : 'rgba(255,60,60,0.25)'; c.strokeStyle = ok ? '#fff' : '#f55'; c.lineWidth = 2.5; c.setLineDash([7, 5]); c.lineDashOffset = -this.time * 25; c.beginPath(); if (d.spell.kind === 'log') { c.rect(x - r, y - d.spell.len * S * 0.5, r * 2, d.spell.len * S * 0.5); } else c.arc(x, y, r, 0, TAU); c.fill(); c.stroke(); }
      else { const rad = Math.max(S * 0.5, d.r * S * 1.5), pulse = 1 + Math.sin(this.time * 8) * 0.06; c.globalAlpha = ok ? 0.85 : 0.45; c.fillStyle = ok ? 'rgba(80,160,255,0.35)' : 'rgba(255,80,80,0.35)'; c.beginPath(); c.ellipse(x, y + rad * 0.5, rad * 1.2 * pulse, rad * 0.5 * pulse, 0, 0, TAU); c.fill(); c.translate(x, y); this.token(c, rad, pv.art, ok ? 0 : 1, true); }
      c.restore();
    }
  }
  RA.Renderer = Renderer;
})();
