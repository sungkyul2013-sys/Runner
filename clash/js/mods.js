/* Royale Arena — mod system core.
   Mod config lives in RA.Save.data.mods = { enabledPacks[], rules{}, cardOverrides{}, customCards[], scripts[] }.
   Data mods (rules / card overrides / custom cards) are plain JSON. Script mods are user JS (opt-in, local only). */
(function () {
  const RA = (window.RA = window.RA || {});
  const M = (RA.Mods = {});
  const cfg = () => RA.Save.data.mods;

  M.ruleDefaults = () => { const o = {}; RA.RULE_DEFS.forEach((d) => (o[d.key] = d.def)); return o; };

  // defaults -> enabled packs (multipliers multiply, others last-wins) -> user rule edits
  M.rules = function () {
    const r = M.ruleDefaults(); const c = cfg();
    const multKeys = {}; RA.RULE_DEFS.forEach((d) => { if (d.mult) multKeys[d.key] = true; });
    (c.enabledPacks || []).forEach((pid) => {
      const p = RA.BUILTIN_PACKS.find((x) => x.id === pid); if (!p) return;
      for (const k in p.rules) r[k] = multKeys[k] ? r[k] * p.rules[k] : p.rules[k];
    });
    for (const k in (c.rules || {})) r[k] = c.rules[k];
    return r;
  };
  M.active = () => { const c = cfg(); return (c.enabledPacks || []).length > 0 || Object.keys(c.rules || {}).length > 0 || Object.keys(c.cardOverrides || {}).length > 0 || (c.customCards || []).length > 0 || (c.scripts || []).some((s) => s.on); };
  M.togglePack = function (id) { const c = cfg(); const i = c.enabledPacks.indexOf(id); if (i >= 0) c.enabledPacks.splice(i, 1); else c.enabledPacks.push(id); RA.Save.save(); };

  // ---- cards ----
  M.customs = () => cfg().customCards || [];
  M.allIds = () => RA.CARD_ORDER.concat(M.customs().map((c) => c.id));
  M.isCustom = (id) => M.customs().some((c) => c.id === id);
  M.artOf = (id) => { const c = M.customs().find((x) => x.id === id); return c ? (c.base || 'knight') : id; };
  M.nameOf = (id) => {
    const c = M.customs().find((x) => x.id === id); if (c) return c.name || id;
    return (RA.CARD_TEXT && RA.CARD_TEXT[id] && RA.CARD_TEXT[id].ko) || id;
  };
  // Effective card definition = base (or custom's base) + override/custom fields, defaults filled in.
  M.card = function (id) {
    if (RA.TOKENS[id]) return RA.def(RA.TOKENS[id]);
    const cu = M.customs().find((c) => c.id === id);
    let raw;
    if (cu) { raw = Object.assign({}, RA.BASE_CARDS[cu.base] || RA.BASE_CARDS.knight, cu.stats || {}, { id, rarity: cu.rarity || 'epic', custom: true }); if (cu.cost != null) raw.cost = cu.cost; }
    else { raw = Object.assign({}, RA.BASE_CARDS[id], cfg().cardOverrides[id] || {}); }
    return RA.def(raw);
  };
  M.EDITABLE = ['cost', 'count', 'hp', 'dmg', 'hs', 'speed', 'range', 'r', 'sight', 'splash', 'deploy'];
  M.FLAGS = ['fly', 'atkAir', 'atkGround', 'buildOnly'];

  M.setOverride = function (id, patch) {
    if (M.isCustom(id)) { const cu = M.customs().find((c) => c.id === id); if (patch.cost != null) cu.cost = patch.cost; cu.stats = Object.assign(cu.stats || {}, patch); }
    else { const o = (cfg().cardOverrides[id] = Object.assign(cfg().cardOverrides[id] || {}, patch)); if (!Object.keys(o).length) delete cfg().cardOverrides[id]; }
    RA.Save.save();
  };
  M.resetOverride = function (id) { delete cfg().cardOverrides[id]; RA.Save.save(); };
  M.createCustom = function (baseId, name) {
    const base = RA.BASE_CARDS[baseId] || RA.BASE_CARDS.knight;
    const id = 'mod_' + Date.now().toString(36) + Math.floor(Math.random() * 99);
    const stats = {}; M.EDITABLE.concat(M.FLAGS).forEach((k) => { const v = RA.def(base)[k]; if (v !== undefined) stats[k] = v; });
    cfg().customCards.push({ id, name: name || (M.nameOf(baseId) + ' 개조'), base: baseId, rarity: 'epic', cost: base.cost, stats });
    RA.Save.save(); return id;
  };
  M.deleteCustom = function (id) {
    const c = cfg(); c.customCards = c.customCards.filter((x) => x.id !== id);
    RA.Save.data.decks = RA.Save.data.decks.map((d, i) => { const dd = d.filter((x) => x !== id); const fb = RA.Save.defaults().decks[i]; for (const x of fb) { if (dd.length >= 8) break; if (!dd.includes(x)) dd.push(x); } return dd; });
    RA.Save.save();
  };

  // ---- import / export ----
  M.exportJSON = function (name) {
    const c = cfg();
    return JSON.stringify({ format: 'royale-mod', version: 1, name: name || 'My Mod', packs: c.enabledPacks, rules: c.rules, cardOverrides: c.cardOverrides, customCards: c.customCards, scripts: c.scripts }, null, 2);
  };
  M.importJSON = function (text) {
    let o; try { o = JSON.parse(text); } catch (e) { throw new Error('JSON 형식이 올바르지 않습니다: ' + e.message); }
    if (!o || o.format !== 'royale-mod') throw new Error('royale-mod 형식이 아닙니다 (format 필드 확인).');
    const c = cfg(); const known = {}; RA.RULE_DEFS.forEach((d) => (known[d.key] = d));
    let n = { rules: 0, overrides: 0, customs: 0, scripts: 0, packs: 0 };
    (o.packs || []).forEach((p) => { if (RA.BUILTIN_PACKS.some((b) => b.id === p) && !c.enabledPacks.includes(p)) { c.enabledPacks.push(p); n.packs++; } });
    for (const k in (o.rules || {})) { const d = known[k]; if (!d) continue; const v = o.rules[k]; if (d.type === 'bool') c.rules[k] = !!v; else if (typeof v === 'number' && isFinite(v)) c.rules[k] = Math.min(d.max, Math.max(d.min, v)); else continue; n.rules++; }
    const okKeys = M.EDITABLE.concat(M.FLAGS);
    for (const id in (o.cardOverrides || {})) { if (!RA.BASE_CARDS[id]) continue; const src = o.cardOverrides[id], dst = {}; okKeys.forEach((k) => { if (src[k] !== undefined && (typeof src[k] === 'number' ? isFinite(src[k]) : typeof src[k] === 'boolean')) dst[k] = src[k]; }); if (Object.keys(dst).length) { c.cardOverrides[id] = Object.assign(c.cardOverrides[id] || {}, dst); n.overrides++; } }
    (o.customCards || []).forEach((cc) => {
      if (!cc || !RA.BASE_CARDS[cc.base]) return; const id = /^mod_[a-z0-9_]+$/i.test(cc.id || '') ? cc.id : 'mod_' + Date.now().toString(36) + n.customs;
      const stats = {}; okKeys.forEach((k) => { if (cc.stats && cc.stats[k] !== undefined) stats[k] = cc.stats[k]; });
      c.customCards = c.customCards.filter((x) => x.id !== id);
      c.customCards.push({ id, name: String(cc.name || id).slice(0, 20), base: cc.base, rarity: RA.RARITY[cc.rarity] ? cc.rarity : 'epic', cost: Math.min(10, Math.max(1, +cc.cost || RA.BASE_CARDS[cc.base].cost)), stats }); n.customs++;
    });
    (o.scripts || []).forEach((s) => { const code = typeof s === 'string' ? s : s && s.code; if (!code) return; c.scripts.push({ name: (s && s.name) || ('가져온 스크립트 ' + (c.scripts.length + 1)), code: String(code), on: false }); n.scripts++; });
    RA.Save.save(); return n;
  };
  M.resetAll = function () { RA.Save.data.mods = RA.Save.defaults().mods; RA.Save.save(); };

  // ---- script hooks ----
  // A script is a function body receiving (RA, mod). Call mod({ onMatchStart(api), onTick(api, dt), onSpawn(api, unit), onDeath(api, unit), onPlayCard(api, team, cardId), onTowerDestroyed(api, tower) }).
  M.compileHooks = function () {
    const hooks = [];
    (cfg().scripts || []).forEach((s) => {
      if (!s.on) return;
      try { new Function('RA', 'mod', s.code)(RA, (h) => { if (h && typeof h === 'object') hooks.push(h); }); }
      catch (e) { console.warn('[mod script error]', s.name, e); if (RA.UI && RA.UI.toast) RA.UI.toast('스크립트 오류: ' + s.name + ' — ' + e.message); }
    });
    return hooks;
  };
  M.EXAMPLE_SCRIPT = "// 예시: 15초마다 내 엘릭서 +1, 내 유닛이 죽으면 해골 2기 소환\nlet t = 0;\nmod({\n  onTick(api, dt) { t += dt; if (t >= 15) { t = 0; api.addElixir(0, 1); api.say('보너스 엘릭서!'); } },\n  onDeath(api, u) { if (u.team === 0 && !u.token) api.spawn('skeletons', 0, u.x, u.y); }\n});";
})();
