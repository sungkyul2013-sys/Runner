/* Royale Arena — card & game data (balance baseline = tournament-standard level 11).
   All numbers are per-unit; stats scale with 1.1^(level-11). Speeds are tiles/second. */
(function () {
  const RA = (window.RA = window.RA || {});

  RA.W = 18; RA.H = 32;              // arena size in tiles
  RA.RIVER_Y = 16; RA.RIVER_HALF = 0.5;
  RA.BRIDGES = [3.5, 14.5]; RA.BRIDGE_HW = 1.25;

  RA.lvlMul = (l) => Math.pow(1.1, (l || 11) - 11);

  RA.RARITY = {
    common: { name: '커먼', color: '#8fb5e8' }, rare: { name: '레어', color: '#f5a03a' },
    epic: { name: '에픽', color: '#c05af0' }, legendary: { name: '레전더리', color: '#ff7ad9' },
    champion: { name: '챔피언', color: '#ffd84a' },
  };

  const SPD = { slow: 0.75, medium: 1.0, fast: 1.5, vfast: 2.0 };

  // ---- base fields every definition gets (see RA.def()) ----
  const DEFAULTS = {
    type: 'troop', count: 1, r: 0.5, mass: 3, sight: 5.5, deploy: 1.0, hs: 1.2, range: 0.6, speed: 1,
    fly: false, atkAir: false, atkGround: true, buildOnly: false, splash: 0, splashMode: 'target',
    projectile: null, projSpeed: 12, hp: 100, dmg: 0,
  };

  const C = {};
  const add = (id, o) => { C[id] = Object.assign({ id }, o); };

  add('knight', { cost: 3, rarity: 'common', hp: 1766, dmg: 202, hs: 1.2, speed: SPD.medium, r: 0.55, mass: 6, range: 0.6 });
  add('archers', { cost: 3, rarity: 'common', count: 2, hp: 304, dmg: 112, hs: 0.9, speed: SPD.medium, r: 0.4, mass: 2, range: 5, atkAir: true, projectile: 'arrow', projSpeed: 16 });
  add('skeletons', { cost: 1, rarity: 'common', count: 3, hp: 81, dmg: 81, hs: 1.0, speed: SPD.fast, r: 0.3, mass: 1, range: 0.5 });
  add('goblins', { cost: 2, rarity: 'common', count: 4, hp: 202, dmg: 117, hs: 1.1, speed: SPD.vfast, r: 0.35, mass: 1.5, range: 0.5, deploy: 0.8 });
  add('zap', { cost: 2, rarity: 'common', type: 'spell', spell: { kind: 'instant', r: 2.5, dmg: 194, tdmg: 0.31, stun: 0.5, delay: 0.15 } });
  add('hog_rider', { cost: 4, rarity: 'rare', hp: 1715, dmg: 285, hs: 1.6, speed: SPD.vfast, r: 0.55, mass: 5, range: 0.6, buildOnly: true, crossRiver: true });
  add('giant', { cost: 5, rarity: 'rare', hp: 3990, dmg: 253, hs: 1.5, speed: SPD.slow, r: 0.8, mass: 12, range: 0.7, buildOnly: true });
  add('musketeer', { cost: 4, rarity: 'rare', hp: 731, dmg: 218, hs: 1.0, speed: SPD.medium, r: 0.45, mass: 3, range: 6, atkAir: true, projectile: 'bullet', projSpeed: 18 });
  add('valkyrie', { cost: 4, rarity: 'rare', hp: 1815, dmg: 270, hs: 1.5, speed: SPD.medium, r: 0.55, mass: 5, range: 0.7, splash: 1.9, splashMode: 'self' });
  add('mini_pekka', { cost: 4, rarity: 'rare', hp: 1100, dmg: 560, hs: 1.6, speed: SPD.fast, r: 0.5, mass: 5, range: 0.6 });
  add('fireball', { cost: 4, rarity: 'rare', type: 'spell', spell: { kind: 'delayed', r: 2.5, dmg: 697, tdmg: 0.3, kb: 1.0, delay: 1.0, visual: 'fire' } });
  add('baby_dragon', { cost: 4, rarity: 'epic', hp: 1160, dmg: 161, hs: 1.5, speed: SPD.fast, r: 0.6, mass: 4, range: 3.5, fly: true, atkAir: true, splash: 1.2, projectile: 'fire', projSpeed: 9 });
  add('witch', { cost: 5, rarity: 'epic', hp: 844, dmg: 135, hs: 1.1, speed: SPD.medium, r: 0.45, mass: 3, range: 5, atkAir: true, splash: 1.3, projectile: 'magic', projSpeed: 12,
    spawner: { id: 'skeleton', count: 4, every: 7, first: 1.2 } });
  add('prince', { cost: 5, rarity: 'epic', hp: 1920, dmg: 395, hs: 1.4, speed: SPD.medium, r: 0.6, mass: 7, range: 0.7, charge: { dist: 2, speedMul: 2, dmgMul: 2 } });
  add('poison', { cost: 4, rarity: 'epic', type: 'spell', spell: { kind: 'poison', r: 3.5, dps: 92, tdmg: 0.35, dur: 8, slow: 0.15, delay: 0.3 } });
  add('wall_breakers', { cost: 2, rarity: 'epic', count: 2, hp: 252, dmg: 333, hs: 1.0, speed: SPD.vfast, r: 0.35, mass: 1, range: 0.4, buildOnly: true, suicide: true, splash: 1.5, splashMode: 'self', deploy: 0.8 });
  add('lightning', { cost: 6, rarity: 'epic', type: 'spell', spell: { kind: 'lightning', r: 3.5, dmg: 1063, tdmg: 0.3, hits: 3, stun: 0.5, delay: 0.5 } });
  add('mega_knight', { cost: 7, rarity: 'legendary', hp: 3993, dmg: 266, hs: 1.7, speed: SPD.medium, r: 0.85, mass: 16, range: 0.8, splash: 1.6,
    jump: { min: 3.5, max: 5, mult: 2 }, deployDmg: { dmg: 266, r: 2.4 } });
  add('the_log', { cost: 2, rarity: 'legendary', type: 'spell', spell: { kind: 'log', dmg: 290, tdmg: 0.3, len: 10.1, width: 2.8, speed: 7.5, kb: 1.0, delay: 0.1 } });
  add('lava_hound', { cost: 7, rarity: 'legendary', hp: 3588, dmg: 53, hs: 1.3, speed: SPD.slow, r: 0.9, mass: 12, range: 2.5, fly: true, buildOnly: true, atkAir: false,
    spawnOnDeath: { id: 'lava_pup', count: 6 } });
  add('ice_wizard', { cost: 3, rarity: 'legendary', hp: 688, dmg: 86, hs: 1.7, speed: SPD.medium, r: 0.45, mass: 3, range: 5.5, atkAir: true, splash: 1.5, projectile: 'ice', projSpeed: 11,
    slow: { pct: 0.35, t: 2.5 }, deployZap: { r: 3, dmg: 75, slow: { pct: 0.35, t: 1 } } });
  add('electro_wizard', { cost: 4, rarity: 'legendary', hp: 713, dmg: 110, hs: 1.8, speed: SPD.fast, r: 0.45, mass: 3, range: 5, atkAir: true, projectile: 'zap', projSpeed: 25,
    multi: 2, stun: 0.5, deployZap: { r: 2.5, dmg: 110, stun: 0.5 } });
  add('sparky', { cost: 6, rarity: 'legendary', hp: 1500, dmg: 1452, hs: 4.0, speed: SPD.slow, r: 0.7, mass: 12, range: 5, splash: 1.8, projectile: 'zap', projSpeed: 20, chargeAtk: true });
  add('golden_knight', { cost: 4, rarity: 'champion', champion: true, hp: 1799, dmg: 178, hs: 0.9, speed: SPD.medium, r: 0.5, mass: 6, range: 0.6,
    ability: { id: 'dash', name: '돌진 연타', cost: 1, cd: 8, dmg: 335, range: 5.5, chain: 10 } });
  add('skeleton_king', { cost: 4, rarity: 'champion', champion: true, hp: 2298, dmg: 204, hs: 1.6, speed: SPD.medium, r: 0.6, mass: 8, range: 0.7,
    ability: { id: 'souls', name: '영혼 소환', cost: 2, cd: 20, base: 6, max: 16 } });
  add('archer_queen', { cost: 5, rarity: 'champion', champion: true, hp: 1000, dmg: 270, hs: 1.2, speed: SPD.medium, r: 0.45, mass: 3, range: 5, atkAir: true, projectile: 'arrow', projSpeed: 18,
    ability: { id: 'cloak', name: '투명 망토', cost: 1, cd: 15, dur: 3.5, hsMul: 0.357, speedMul: 0.6 } });
  add('mighty_miner', { cost: 4, rarity: 'champion', champion: true, hp: 2250, dmg: 40, hs: 0.4, speed: SPD.medium, r: 0.5, mass: 7, range: 0.6, ramp: [40, 200, 400],
    ability: { id: 'escape', name: '폭발 탈출', cost: 1, cd: 13, bomb: 400, r: 2.0 } });
  add('cannon', { cost: 3, rarity: 'common', type: 'building', hp: 835, dmg: 215, hs: 1.0, range: 5.5, r: 0.7, life: 30, projectile: 'cannon', projSpeed: 16 });
  add('inferno_tower', { cost: 5, rarity: 'rare', type: 'building', hp: 1452, dmg: 350, hs: 0.1, range: 6, r: 0.8, life: 30, atkAir: true, inferno: { stages: [0.08, 0.25, 1], times: [2, 4] } });
  add('xbow', { cost: 6, rarity: 'epic', type: 'building', hp: 1610, dmg: 42, hs: 0.3, range: 11.5, r: 0.9, life: 30, deploy: 3.5, projectile: 'bolt', projSpeed: 28 });

  // summoned tokens (not collectible cards)
  const T = {};
  const addT = (id, o) => { T[id] = Object.assign({ id, token: true, cost: 0, rarity: 'common' }, o); };
  addT('skeleton', { hp: 81, dmg: 81, hs: 1.0, speed: SPD.fast, r: 0.3, mass: 1, range: 0.5, portrait: 'skeletons', deploy: 0.3 });
  addT('lava_pup', { hp: 260, dmg: 54, hs: 1.0, speed: SPD.fast, r: 0.35, mass: 1.5, range: 1.6, fly: true, buildOnly: true, portrait: 'lava_hound', deploy: 0.3 });

  RA.BASE_CARDS = C; RA.TOKENS = T;
  RA.CARD_ORDER = ['knight','archers','skeletons','goblins','zap','hog_rider','giant','musketeer','valkyrie','mini_pekka','fireball','baby_dragon','witch','prince','poison','wall_breakers','lightning','mega_knight','the_log','lava_hound','ice_wizard','electro_wizard','sparky','golden_knight','skeleton_king','archer_queen','mighty_miner','cannon','inferno_tower','xbow'];

  RA.DEFAULTS = DEFAULTS;
  // fill defaults so callers always get a complete definition
  RA.def = function (raw) { return Object.assign({}, DEFAULTS, raw); };

  RA.towerBase = {
    princess: { hp: 3052, dmg: 109, hs: 0.8, range: 7.5, r: 1.4 },
    king: { hp: 4824, dmg: 109, hs: 1.0, range: 7, r: 1.8 },
  };

  RA.THEMES = [
    { id: 'grass', name: '잔디 아레나', emoji: '🌿', a: '#7cc34b', b: '#72b843', path: '#f0b43c', river: '#3a8fd6', wall: '#8a86a0' },
    { id: 'snow', name: '설원 아레나', emoji: '❄️', a: '#e8f1fa', b: '#dbe8f5', path: '#b9d5ee', river: '#5cb7e6', wall: '#9fb3c8' },
    { id: 'desert', name: '사막 아레나', emoji: '🏜️', a: '#e6c27a', b: '#dcb76d', path: '#b07c3e', river: '#4aa6a0', wall: '#a58562' },
    { id: 'night', name: '야간 아레나', emoji: '🌙', a: '#3c5a7a', b: '#355270', path: '#8a6bd0', river: '#2a56a8', wall: '#4a4a70' },
  ];
  RA.TOWER_SKINS = [
    { id: 'classic', name: '클래식', emoji: '🏰' },
    { id: 'gold', name: '황금', emoji: '👑' },
    { id: 'shadow', name: '그림자', emoji: '🌑' },
  ];
  RA.EMOTE_POOL = ['😀','😂','😭','😡','👍','🔥','😎','🤔','😱','🥳','👏','💀','🙏','❤️','🤯','😴','🤝','💪'];

  RA.DIFFICULTY = {
    easy: { name: '쉬움', react: 4.0, elixir: 0.85, mistake: 0.3 },
    normal: { name: '보통', react: 2.4, elixir: 1.0, mistake: 0.12 },
    hard: { name: '어려움', react: 1.4, elixir: 1.1, mistake: 0.04 },
    master: { name: '마스터', react: 0.9, elixir: 1.25, mistake: 0.0 },
  };

  // Rules (everything a mod can change). Multipliers are multiplied together across packs.
  RA.RULE_DEFS = [
    { key: 'matchTime', label: '경기 시간(초)', min: 30, max: 600, step: 10, def: 180, group: 'time' },
    { key: 'overtime', label: '연장전(초)', min: 0, max: 180, step: 10, def: 60, group: 'time' },
    { key: 'elixirRate', label: '엘릭서 속도 배율', min: 0.25, max: 6, step: 0.25, def: 1, mult: true },
    { key: 'aiElixirRate', label: 'AI 엘릭서 배율', min: 0.25, max: 6, step: 0.25, def: 1, mult: true },
    { key: 'startElixir', label: '시작 엘릭서', min: 0, max: 20, step: 1, def: 5 },
    { key: 'maxElixir', label: '최대 엘릭서', min: 5, max: 20, step: 1, def: 10 },
    { key: 'unitHp', label: '유닛 체력 배율', min: 0.2, max: 5, step: 0.1, def: 1, mult: true },
    { key: 'unitDmg', label: '유닛 공격력 배율', min: 0.2, max: 5, step: 0.1, def: 1, mult: true },
    { key: 'unitSpeed', label: '유닛 이동속도 배율', min: 0.4, max: 3, step: 0.1, def: 1, mult: true },
    { key: 'unitSize', label: '유닛 크기 배율', min: 0.5, max: 2.5, step: 0.1, def: 1, mult: true },
    { key: 'spellDmg', label: '주문 피해 배율', min: 0.2, max: 5, step: 0.1, def: 1, mult: true },
    { key: 'towerHp', label: '타워 체력 배율', min: 0.2, max: 5, step: 0.1, def: 1, mult: true },
    { key: 'towerDmg', label: '타워 공격력 배율', min: 0.2, max: 5, step: 0.1, def: 1, mult: true },
    { key: 'infiniteElixir', label: '무한 엘릭서(플레이어)', type: 'bool', def: false },
    { key: 'doubleAlways', label: '처음부터 2배 엘릭서', type: 'bool', def: false },
    { key: 'deployAnywhere', label: '어디든 배치', type: 'bool', def: false },
    { key: 'randomCards', label: '카오스(교체 카드 랜덤)', type: 'bool', def: false },
    { key: 'kingAwake', label: '킹 타워 처음부터 활성', type: 'bool', def: false },
  ];

  RA.BUILTIN_PACKS = [
    { id: 'infinite', name: '무한 엘릭서', emoji: '💧', desc: '엘릭서가 항상 가득! 마음껏 카드를 내세요.', rules: { infiniteElixir: true } },
    { id: 'chaos', name: '카오스', emoji: '🎲', desc: '카드를 낼 때마다 다음 카드가 완전 랜덤.', rules: { randomCards: true } },
    { id: 'giant', name: '거인 모드', emoji: '🦣', desc: '모든 유닛이 더 크고 단단해집니다.', rules: { unitSize: 1.35, unitHp: 1.5, unitSpeed: 0.9 } },
    { id: 'tiny', name: '미니 모드', emoji: '🐜', desc: '유닛이 작고 빠르게, 엘릭서도 빠르게.', rules: { unitSize: 0.7, unitSpeed: 1.25, elixirRate: 1.5 } },
    { id: 'rush', name: '스피드 러시', emoji: '⚡', desc: '모든 것이 1.6배 빠르고 엘릭서는 2배.', rules: { unitSpeed: 1.6, elixirRate: 2, matchTime: 120 } },
    { id: 'glass', name: '유리 대포', emoji: '🔮', desc: '공격력 2배, 체력 절반. 한 방 싸움.', rules: { unitDmg: 2, unitHp: 0.5 } },
    { id: 'tower', name: '타워 대혼란', emoji: '🏰', desc: '타워는 약하지만 아프게 쏩니다.', rules: { towerHp: 0.5, towerDmg: 2.5, kingAwake: true } },
    { id: 'anywhere', name: '어디든 배치', emoji: '📍', desc: '상대 진영에도 유닛을 소환할 수 있습니다.', rules: { deployAnywhere: true } },
    { id: 'sudden', name: '서든 데스', emoji: '💀', desc: '60초 단판. 먼저 타워를 부수면 승리.', rules: { matchTime: 60, overtime: 60, startElixir: 8 } },
    { id: 'double', name: '더블 엘릭서', emoji: '💜', desc: '처음부터 2배 엘릭서 시작.', rules: { doubleAlways: true } },
  ];

  RA.Img = {
    cards: {}, ports: {}, ready: false,
    load(done) {
      let left = RA.CARD_ORDER.length * 2;
      const fin = () => { if (--left <= 0) { RA.Img.ready = true; done && done(); } };
      RA.CARD_ORDER.forEach((id) => {
        const a = new Image(); a.onload = a.onerror = fin; a.src = 'assets/cards/' + id + '.png'; RA.Img.cards[id] = a;
        const b = new Image(); b.onload = b.onerror = fin; b.src = 'assets/portraits/' + id + '.png'; RA.Img.ports[id] = b;
      });
    },
  };
})();
