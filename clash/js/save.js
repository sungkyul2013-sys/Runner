window.RA = window.RA || {};

(function () {
  'use strict';

  function makeDefaults() {
    return {
      gold: 150000,
      gems: 1000,
      trophies: 0,
      crowns: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      matches: 0,
      activeDeck: 0,
      deckNames: ['호그 사이클', '메가 나이트 비트다운', '스켈레톤 킹 컨트롤', 'X-Bow 시즈', '골든 나이트 돌진'],
      decks: [
        ['hog_rider', 'musketeer', 'skeletons', 'the_log', 'fireball', 'cannon', 'zap', 'goblins'],
        ['mega_knight', 'giant', 'witch', 'baby_dragon', 'lightning', 'zap', 'archers', 'the_log'],
        ['skeleton_king', 'ice_wizard', 'poison', 'the_log', 'skeletons', 'cannon', 'knight', 'zap'],
        ['xbow', 'knight', 'valkyrie', 'archers', 'inferno_tower', 'skeletons', 'zap', 'fireball'],
        ['golden_knight', 'mini_pekka', 'electro_wizard', 'prince', 'goblins', 'fireball', 'archers', 'the_log']
      ],
      settings: {
        sound: true,
        music: true,
        volume: 0.7,
        difficulty: 'normal',
        damageNumbers: true,
        quality: 'high',
        cardLevel: 11,
        aiSameLevel: true,
        showRanges: false
      },
      shop: {
        theme: 'grass',
        towerSkin: 'classic',
        emote: ['😀', '😂', '😭', '😡', '👍', '🔥'],
        freeClaims: 0
      },
      mods: {
        enabledPacks: [],
        rules: {},
        cardOverrides: {},
        customCards: [],
        scripts: []
      }
    };
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  // Merge stored data over a fresh defaults object.
  // - plain objects merge recursively
  // - arrays from storage replace the default array wholesale
  // - null/undefined stored values and shape mismatches keep the default
  function mergeOver(base, stored) {
    if (!isPlainObject(stored)) return base;
    Object.keys(stored).forEach(function (k) {
      var sv = stored[k];
      var bv = base[k];
      if (sv === null || sv === undefined) return;
      if (isPlainObject(bv)) {
        if (isPlainObject(sv)) base[k] = mergeOver(bv, sv);
        return;
      }
      if (Array.isArray(bv)) {
        if (Array.isArray(sv)) base[k] = sv;
        return;
      }
      base[k] = sv;
    });
    return base;
  }

  RA.Save = {
    KEY: 'royale_arena_v1',
    data: null,

    defaults: function () {
      return makeDefaults();
    },

    load: function () {
      var stored = null;
      var readOk = true;
      try {
        var raw = window.localStorage.getItem(RA.Save.KEY);
        if (raw) stored = JSON.parse(raw);
      } catch (e) {
        readOk = false;
        stored = null;
      }
      if (!readOk && RA.Save.data) {
        // Storage unavailable: keep the in-memory profile, filling any missing keys.
        RA.Save.data = mergeOver(makeDefaults(), RA.Save.data);
      } else {
        RA.Save.data = mergeOver(makeDefaults(), stored);
      }
      return RA.Save.data;
    },

    save: function () {
      try {
        window.localStorage.setItem(RA.Save.KEY, JSON.stringify(RA.Save.data));
        return true;
      } catch (e) {
        return false;
      }
    },

    reset: function () {
      RA.Save.data = makeDefaults();
      RA.Save.save();
      return RA.Save.data;
    },

    addGold: function (n) {
      var amount = Number(n);
      if (!isFinite(amount)) amount = 0;
      var current = Number(RA.Save.data.gold) || 0;
      RA.Save.data.gold = Math.max(0, current + amount);
      RA.Save.save();
      return RA.Save.data.gold;
    },

    addGems: function (n) {
      var amount = Number(n);
      if (!isFinite(amount)) amount = 0;
      var current = Number(RA.Save.data.gems) || 0;
      RA.Save.data.gems = Math.max(0, current + amount);
      RA.Save.save();
      return RA.Save.data.gems;
    }
  };
})();

RA.Save.load();
