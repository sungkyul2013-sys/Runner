# Mod 시스템 가이드

Mod는 게임 규칙, 카드 능력치, 커스텀 카드, 스크립트를 바꾸는 기능입니다. 설정은 로컬 저장소(`RA.Save.data.mods`)에 저장되며, JSON으로 내보내고 가져올 수 있습니다.

적용 순서는 다음과 같습니다.

1. 기본값 (`RA.RULE_DEFS`의 `def`)
2. 켜 둔 내장 팩 (배율 규칙은 곱하고, 나머지는 나중 값이 덮어씀)
3. 사용자가 직접 입력한 규칙 (`rules`)이 마지막에 덮어씀

Mod 화면(하단 🧩 Mod)에는 다섯 개의 탭이 있습니다. 모드 팩, 규칙, 카드 편집, 스크립트, 가져오기/내보내기입니다. 아래 내용은 화면에서 하는 작업과 같은 데이터를 다룹니다.

---

## 1. 내장 팩 (RA.BUILTIN_PACKS)

팩은 규칙 묶음입니다. 여러 팩을 동시에 켤 수 있습니다. 배율 규칙은 곱해지고, 나머지는 나중 팩이 덮어씁니다.

| id | 이름 | 설명 | 적용 규칙 |
|---|---|---|---|
| `infinite` | 💧 무한 엘릭서 | 엘릭서가 항상 가득! 마음껏 카드를 내세요. | `infiniteElixir`=true |
| `chaos` | 🎲 카오스 | 카드를 낼 때마다 다음 카드가 완전 랜덤. | `randomCards`=true |
| `giant` | 🦣 거인 모드 | 모든 유닛이 더 크고 단단해집니다. | `unitSize`=1.35, `unitHp`=1.5, `unitSpeed`=0.9 |
| `tiny` | 🐜 미니 모드 | 유닛이 작고 빠르게, 엘릭서도 빠르게. | `unitSize`=0.7, `unitSpeed`=1.25, `elixirRate`=1.5 |
| `rush` | ⚡ 스피드 러시 | 모든 것이 1.6배 빠르고 엘릭서는 2배. | `unitSpeed`=1.6, `elixirRate`=2, `matchTime`=120 |
| `glass` | 🔮 유리 대포 | 공격력 2배, 체력 절반. 한 방 싸움. | `unitDmg`=2, `unitHp`=0.5 |
| `tower` | 🏰 타워 대혼란 | 타워는 약하지만 아프게 쏩니다. | `towerHp`=0.5, `towerDmg`=2.5, `kingAwake`=true |
| `anywhere` | 📍 어디든 배치 | 상대 진영에도 유닛을 소환할 수 있습니다. | `deployAnywhere`=true |
| `sudden` | 💀 서든 데스 | 60초 단판. 먼저 타워를 부수면 승리. | `matchTime`=60, `overtime`=60, `startElixir`=8 |
| `double` | 💜 더블 엘릭서 | 처음부터 2배 엘릭서 시작. | `doubleAlways`=true |

팩 id는 JSON의 `packs` 배열에 넣습니다. 목록에 없는 id는 무시됩니다.

---

## 2. 규칙 표 (RA.RULE_DEFS)

규칙 키는 `rules` 객체에 넣습니다. 범위를 벗어난 숫자는 가져올 때 범위 안으로 잘립니다. 타입이 맞지 않는 값은 무시됩니다.

| key | 이름 | 기본값 | 범위 | 방식 |
|---|---|---|---|---|
| `matchTime` | 경기 시간(초) | 180 | 30 ~ 600 (step 10) | 값 |
| `overtime` | 연장전(초) | 60 | 0 ~ 180 (step 10) | 값 |
| `elixirRate` | 엘릭서 속도 배율 | 1 | 0.25 ~ 6 (step 0.25) | 배율 (팩끼리 곱함) |
| `aiElixirRate` | AI 엘릭서 배율 | 1 | 0.25 ~ 6 (step 0.25) | 배율 (팩끼리 곱함) |
| `startElixir` | 시작 엘릭서 | 5 | 0 ~ 20 (step 1) | 값 |
| `maxElixir` | 최대 엘릭서 | 10 | 5 ~ 20 (step 1) | 값 |
| `unitHp` | 유닛 체력 배율 | 1 | 0.2 ~ 5 (step 0.1) | 배율 (팩끼리 곱함) |
| `unitDmg` | 유닛 공격력 배율 | 1 | 0.2 ~ 5 (step 0.1) | 배율 (팩끼리 곱함) |
| `unitSpeed` | 유닛 이동속도 배율 | 1 | 0.4 ~ 3 (step 0.1) | 배율 (팩끼리 곱함) |
| `unitSize` | 유닛 크기 배율 | 1 | 0.5 ~ 2.5 (step 0.1) | 배율 (팩끼리 곱함) |
| `spellDmg` | 주문 피해 배율 | 1 | 0.2 ~ 5 (step 0.1) | 배율 (팩끼리 곱함) |
| `towerHp` | 타워 체력 배율 | 1 | 0.2 ~ 5 (step 0.1) | 배율 (팩끼리 곱함) |
| `towerDmg` | 타워 공격력 배율 | 1 | 0.2 ~ 5 (step 0.1) | 배율 (팩끼리 곱함) |
| `infiniteElixir` | 무한 엘릭서(플레이어) | false | true / false | 토글 |
| `doubleAlways` | 처음부터 2배 엘릭서 | false | true / false | 토글 |
| `deployAnywhere` | 어디든 배치 | false | true / false | 토글 |
| `randomCards` | 카오스(교체 카드 랜덤) | false | true / false | 토글 |
| `kingAwake` | 킹 타워 처음부터 활성 | false | true / false | 토글 |

> `rules`에 직접 적은 값은 팩으로 계산된 결과를 그대로 덮어씁니다. 곱해지지 않습니다.

---

## 3. 카드 개조 (cardOverrides)

내장 카드(`RA.BASE_CARDS`의 id)의 능력치를 바꿉니다. 커스텀 카드는 `cardOverrides`가 아니라 `customCards[].stats`에서 바꿉니다.

편집 가능한 필드 (`RA.Mods.EDITABLE`):

| 필드 | 의미 |
|---|---|
| `cost` | 엘릭서 비용 (1~10) |
| `count` | 한 번에 나오는 유닛 수 |
| `hp` | 체력 |
| `dmg` | 공격력 |
| `hs` | 공격 간격(초). 작을수록 빠름 |
| `speed` | 이동속도 (타일/초) |
| `range` | 사거리 (타일) |
| `r` | 유닛 반지름 (타일) |
| `sight` | 시야 (타일) |
| `splash` | 스플래시 반경 (타일) |
| `deploy` | 배치 후 행동까지 걸리는 시간(초) |

플래그 필드 (`RA.Mods.FLAGS`), true / false:

| 필드 | 의미 |
|---|---|
| `fly` | 공중 유닛 |
| `atkAir` | 공중 공격 가능 |
| `atkGround` | 지상 공격 가능 |
| `buildOnly` | 건물 대상 전용 |

숫자 필드는 유한한 숫자만, 플래그 필드는 불리언만 들어갑니다. 그 외 값은 무시됩니다.

기본 카드 예시 수치 (기준 레벨 11): 기사 `hp` 1766, `dmg` 202, `hs` 1.2, `speed` 1.0.

---

## 4. 커스텀 카드 (customCards)

기존 카드를 바탕으로 새 카드를 만듭니다. 덱 화면에서 쓸 수 있습니다.

| 필드 | 설명 |
|---|---|
| `id` | `mod_` 로 시작하고 영문 소문자, 숫자, `_` 만 쓸 수 있습니다. 예: `mod_knight_pro` |
| `name` | 이름. 최대 20자 |
| `base` | 바탕이 되는 카드 id (`RA.BASE_CARDS`에 있어야 함). 아트도 이 카드를 따릅니다 |
| `rarity` | `common`, `rare`, `epic`, `legendary`, `champion` 중 하나. 생략하면 `epic` |
| `cost` | 엘릭서 비용 1~10. 생략하면 바탕 카드 비용 |
| `stats` | 위의 편집 가능 필드와 플래그 필드만 쓸 수 있습니다. 생략한 값은 바탕 카드 값을 씁니다 |

바탕이 될 수 있는 카드 id: `knight, archers, skeletons, goblins, zap, hog_rider, giant, musketeer, valkyrie, mini_pekka, fireball, baby_dragon, witch, prince, poison, wall_breakers, lightning, mega_knight, the_log, lava_hound, ice_wizard, electro_wizard, sparky, golden_knight, skeleton_king, archer_queen, mighty_miner, cannon, inferno_tower, xbow`

---

## 5. JSON 가져오기 / 내보내기

내보내기는 `RA.Mods.exportJSON(name)`, 가져오기는 `RA.Mods.importJSON(text)`입니다. 형식은 다음과 같습니다.

```json
{
  "format": "royale-mod",
  "version": 1,
  "name": "Mod 이름",
  "packs": ["double"],
  "rules": { "matchTime": 150, "startElixir": 6 },
  "cardOverrides": {
    "knight": { "hp": 2000, "cost": 2 }
  },
  "customCards": [
    {
      "id": "mod_knight_pro",
      "name": "프로 기사",
      "base": "knight",
      "rarity": "legendary",
      "cost": 4,
      "stats": { "hp": 2600, "dmg": 260, "speed": 1.2 }
    }
  ],
  "scripts": [
    { "name": "보너스 엘릭서", "code": "let t = 0;\nmod({\n  onTick(api, dt) { t += dt; if (t >= 15) { t = 0; api.addElixir(0, 1); api.say('보너스 엘릭서!'); } }\n});" }
  ]
}
```

필드 설명:

- `format`은 반드시 `"royale-mod"`여야 합니다. 아니면 가져오기가 거부됩니다.
- `version`은 현재 `1`입니다.
- `packs`, `rules`, `cardOverrides`, `customCards`, `scripts`는 모두 선택 사항입니다.
- 가져오기는 기존 설정에 합칩니다. 같은 `customCards.id`는 덮어쓰고, 같은 `cardOverrides` 카드는 필드별로 합칩니다.
- 가져온 스크립트는 **꺼진 상태(`on: false`)** 로 들어옵니다. Mod 화면의 스크립트 탭에서 직접 켜야 실행되며, 켤 때 확인 창이 뜹니다. 적용은 다음 전투부터입니다.

가져오기 예시 (코드로 실행하는 경우):

```js
RA.Mods.importJSON(text); // 가져온 개수를 객체로 돌려줌: { rules, overrides, customs, scripts, packs }
```

---

## 6. 스크립트 훅 API

> **보안 경고**: 스크립트는 입력한 JavaScript를 **이 브라우저에서 그대로 실행**합니다. 페이지 전체 권한(`window`, `localStorage`)에 접근할 수 있습니다. **신뢰할 수 있는 출처의 스크립트만 가져오고, 내용을 읽어 본 뒤에 켜세요.** 모르는 사람이 보낸 JSON은 절대 가져오지 마세요.

### 스크립트 작성 방식

스크립트는 함수 본문입니다. `RA`와 `mod` 두 인자를 받습니다. 경기가 시작될 때 한 번 실행되며, `mod({...})`에 훅 객체를 넘깁니다.

```js
mod({
  onMatchStart(api) { ... },
  onTick(api, dt) { ... },
  onSpawn(api, unit) { ... },
  onDeath(api, unit) { ... },
  onPlayCard(api, team, cardId) { ... },
  onTowerDestroyed(api, tower) { ... },
});
```

| 훅 | 호출 시점 | 인자 |
|---|---|---|
| `onMatchStart` | 경기 시작 시 한 번 | `api` |
| `onTick` | 매 시뮬레이션 프레임 | `api`, `dt` (초) |
| `onSpawn` | 유닛이나 건물이 생성될 때 | `api`, `unit` |
| `onDeath` | 유닛이나 건물이 죽을 때 | `api`, `unit` |
| `onPlayCard` | 카드가 실제로 나올 때 | `api`, `team`, `cardId` |
| `onTowerDestroyed` | 타워가 파괴될 때 | `api`, `tower` |

`team`은 `0`이 플레이어, `1`이 AI입니다. `unit`과 `tower` 객체에는 `team`, `x`, `y`, `token`(소환물 여부) 등이 들어 있습니다. `tower.tower`는 `'king'` 또는 `'princess'`입니다.

스크립트를 읽어 실행하는 중 생긴 오류(문법 오류 등)는 토스트로 알려 줍니다. 훅 안에서 난 오류는 콘솔에만 기록되며, 그 훅만 건너뛰고 나머지 훅은 계속 실행됩니다.

### api 객체

| 메서드 | 설명 |
|---|---|
| `api.spawn(cardId, team, x, y)` | 카드 또는 토큰을 소환합니다. 주문 카드라면 그 자리에 시전합니다. 좌표는 타일 단위(가로 0~18, 세로 0~32)입니다 |
| `api.hurt(entity, amount)` | 유닛이나 타워에 피해를 줍니다 |
| `api.heal(entity, amount)` | 체력을 회복합니다. 최대 체력을 넘지 않습니다 |
| `api.addElixir(team, amount)` | 엘릭서를 더합니다. 0 ~ `maxElixir` 범위로 잘립니다 |
| `api.say(text)` | 화면 중앙에 배너 메시지를 띄웁니다 (약 2초) |
| `api.units()` | 살아 있는 유닛과 건물의 배열을 돌려줍니다 |
| `api.towers()` | 타워의 배열을 돌려줍니다 |
| `api.time()` | 경기 경과 시간(초)을 돌려줍니다 |

`api.game`으로 `Game` 객체에 직접 접근할 수도 있지만 내부 구조라서 바뀔 수 있습니다.

### 예시 스크립트 3개

**1. 15초마다 내 엘릭서 +1**

```js
let t = 0;
mod({
  onTick(api, dt) {
    t += dt;
    if (t >= 15) { t = 0; api.addElixir(0, 1); api.say('보너스 엘릭서!'); }
  }
});
```

**2. 내 유닛이 죽으면 해골 2기 소환**

```js
mod({
  onDeath(api, u) {
    if (u.team === 0 && !u.token) {
      api.spawn('skeletons', 0, u.x, u.y);
    }
  }
});
```

**3. 적 공주 타워가 무너지면 엘릭서 +2 와 배너**

```js
mod({
  onMatchStart(api) { api.say('경기 시작!'); },
  onTowerDestroyed(api, t) {
    if (t.team === 1 && t.tower === 'princess') {
      api.addElixir(0, 2);
      api.say('적 공주 타워 파괴! 엘릭서 +2');
    }
  }
});
```

> 스크립트의 `onTick`은 매 프레임 실행됩니다. 무거운 계산은 피하세요.

---

## 7. 전체 예시 (복사해서 쓰는 Mod)

위 예시 JSON을 그대로 가져오면 다음 효과가 적용됩니다. 더블 엘릭서 팩, 경기 시간 150초, 시작 엘릭서 6, 기사 체력과 비용 조정, 커스텀 전설 기사, 보너스 엘릭서 스크립트(꺼진 상태로 들어옴)입니다.
