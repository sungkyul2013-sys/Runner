# 차량 데이터 포맷 `apex-vehicle` v1 (A§4.11)

차량 한 대를 **노드-빔 구조 + 차량 컨트롤러 설정**으로 기술하는 JSON이다. 로더는 C++ 코어(`core/src/vehicle_json.cpp`, yyjson)에 있어서 헤드리스 CLI, 테스트, 웹이 같은 해석 결과를 얻는다. 파싱은 결정론적이다(정확히 반올림하는 숫자 파서). 따라서 같은 파일은 모든 플랫폼에서 비트 단위로 같은 바디를 만든다.

- 주석(`//`, `/* */`)과 끝 쉼표를 허용한다(손으로 고치기 쉽게).
- 좌표는 **모델 좌표계**다. +Z 앞, +Y 위, +X 왼쪽이고, y = 0은 타이어 접지면, z = 0은 앞뒤 차축의 중간이다. GLB 모델과 같은 좌표계다.
- 단위는 SI(m, kg, N, N/m, N·s/m, N·m, rad, Pa)다.
- 오류는 `vehicle json <경로>: <내용>` 형식으로 보고한다(예: `vehicle json beams[12][1]: unknown node 'FL_kx'`).
- 생성기(`tools/vehicle-gen/*.mjs`)가 대부분을 만들고, 사람이 고친 값도 그대로 읽는다.

## 최상위

| 키 | 형식 | 설명 |
|---|---|---|
| `format` | `"apex-vehicle"` | 필수 |
| `version` | `1` | 필수 |
| `id`, `name` | 문자열 | 식별자·표시 이름 |
| `model.glb` | 문자열 | 렌더 모델(웹 루트 기준 경로) |
| `hydroChannels` | 정수 | hydro 빔 입력 채널 수(조향 = 0번) |
| `nodes` | 배열 | 노드 목록 |
| `beamGroups` | 객체 | 빔 속성 묶음(이름 → 속성) |
| `beams` | 배열 | 빔 목록 |
| `sliders`, `torsionBars` | 배열 | 선택 |
| `triangles` | 배열 | 충돌 표면 삼각형(M2) |
| `aeroPanels` | 배열 | 경첩 패널 공력 삼각형(M2) |
| `damageGroups` | 배열 | 손상 감시 그룹(유리·램프·부품, M2) |
| `pressureWheels` | 배열 | 압력 휠 생성 블록(코어가 펼친다) |
| `vehicle` | 객체 | 차량 컨트롤러. 없으면 일반 노드-빔 소품으로 취급한다 |
| `targets` | 객체(숫자) | 시험 목표값(KICKOFF C7): `mass`, `frontWeightFraction`, `zeroTo100`, `topSpeed`, `braking100`, `skidpadG` … |
| `sources` | 객체(문자열) | 목표값·추정치의 출처 설명(로더는 읽지 않는다) |
| `visual` | 객체 | 렌더 메타데이터(코어는 읽지 않는다): `parts`(경첩 패널 GLB 조각 → 패널 노드 접두사), `airbags`(위치·크기) |

## 노드

```jsonc
["FL_kl", 0.7403, 0.13, 1.2319, 3.5, 0.03, "steel", "fixed|nocollide"]
//  id     x       y     z       질량  반경  재질(선택) 플래그(선택)
```

재질 이름: `steel`, `concrete`, `rubber`, `asphalt`(또는 숫자 id). 플래그 `fixed`는 무한 질량 고정점, `nocollide`는 충돌 없음이다. 트레드 노드(`kTread`)는 압력 휠 블록만 만든다.

## 빔 그룹과 빔

```jsonc
"beamGroups": {
  "chassis":  { "k": 4e5, "zeta": 0.1 },
  "tierod":   { "type": "hydro", "k": 1.5e6, "zeta": 0.1 },
  "bumpstop": { "type": "bounded", "k": 1.5e5, "zeta": 0.05 }
},
"beams": [
  ["c4_1_7", "c5_1_7", "chassis", { "k": 533333 }],
  ["FL_top", "FL_k5", "springFront", { "k": 39934, "c": 2119, "restOffset": 0.10197 }],
  ["FL_top", "FL_k5", "bumpstop", { "minOffset": -0.07, "maxOffset": 0.09 }],
  ["FL_rack", "FL_ks", "tierod", { "hydro": { "channel": 0, "factor": -0.123, "speed": 0 } }]
]
```

| 속성 | 설명 |
|---|---|
| `type` | `normal`(기본) · `support`(압축만) · `bounded`(범위 밖에서만) · `rope`(인장만) · `anisotropic`(압축 강성 `kc`) · `hydro` |
| `k` | 강성 [N/m] (필수, > 0) |
| `c` 또는 `zeta` | 감쇠 [N·s/m], 또는 감쇠비 ζ → `c = 2ζ√(k·m_r)`(양 끝 노드의 환산 질량) |
| `plasticForce`, `hardening` | 항복 시작 힘 [N], 항복 후 기울기(k 대비) |
| `breakForce`, `deformLimit`, `breakGroup` | 파단 힘, 누적 소성 변형 한계, 함께 끊어지는 그룹 이름(한 빔이 끊어지면 그룹 전체가 끊어진다 → 부품 분리) |
| `crushLimit` | 소성으로 줄어들 수 있는 초기 길이의 비율(기본 0.95). 그 아래에서는 탄성으로 남아 두 노드를 떼어 놓는다(찌그러진 판재의 밀착) |
| `tearLimit` | 순 소성 신장률 (L0 − L0,init)/L0,init이 이 값을 넘으면 찢어진다(연성 인장 파단) |
| `fatigueLimit` | 방향이 뒤바뀐 누적 소성 변형률 한계(저사이클 피로): 앞뒤로 흔들린 경첩은 찢어지고, 한 번 굽은 것은 버틴다 |
| `damage`, `damageStrain` | 이 빔을 감시하는 손상 그룹 id, 그 빔의 발동 변형률(없으면 그룹 값) |
| `rest` / `restOffset` | 휴지 길이 절댓값 / 초기 길이 + 오프셋(스프링 예압). 없으면 초기 길이 |
| `min`·`max` / `minOffset`·`maxOffset` | `bounded` 범위(절댓값 / 초기 길이 기준) |
| `hydro` | `{channel, factor, speed}`: `L0 = L0,init·(1 + factor·입력) + 소성 오프셋`, 속도 제한. hydro 빔도 `plasticForce`로 항복한다(휜 타이로드: 소성 변화가 오프셋으로 남는다) |

빔 항목의 넷째 요소(선택)는 그룹 속성을 덮어쓴다.

## 슬라이더·토션 바

```jsonc
"sliders": [{ "node": "FL_top", "railA": "FL_k5", "railB": "FL_k6", "k": 1e6, "zeta": 0.3 }],
"torsionBars": [{ "arm1": "FL_kl", "pivot1": "FL_arb", "pivot2": "FR_arb", "arm2": "FR_kl", "k": 2600, "c": 8 }]
```

슬라이더는 노드를 두 레일 노드를 지나는 직선에 묶는다(맥퍼슨 스트럿의 톱 마운트). 토션 바는 두 레버의 피벗 축 둘레 상대 비틀림에 저항한다(안티롤바). 토션 바의 `breakTwist` [rad](기본 1)를 넘게 비틀리거나 레버가 피벗 축 위로 접히면 끊어진다.

## 충돌 삼각형·공력 패널·손상 그룹 (M2)

```jsonc
"triangles":   [["c1_1_12", "c2_1_12", "c2_2_12", 0], …],          // [a, b, c, group?] 밖에서 보아 반시계
"aeroPanels":  [["p_frontLid_0_1_0", "p_frontLid_1_1_0", "p_frontLid_1_2_0", 1.2, 0.3], …],  // [a, b, c, C_N?, C_S?]
"damageGroups": [{ "id": "glass_windscreen", "strain": 0.006, "impact": 30000, "nodes": ["c1_3_8", …],
                   "visual": { "kind": "glass", "glass": "laminated", "pieces": [[0, 0.929, 0.530], …] } }]
```

- `triangles`: 충돌 표면. 두께의 절반은 세 노드 반경의 평균이다. `group` ≥ 0이면 자기충돌 그룹이다. 그룹 g의 노드는 같은 바디의 다른 그룹(≥ 0) 삼각형과 부딪힌다(휠 ↔ 휠하우스). −1(기본)이면 다른 바디하고만 부딪힌다. 차량 외피 그룹은 삼각형 공력(`vehicle.aero.surfaceGroups`)도 받는다.
- `aeroPanels`: 열린 후드·도어처럼 바람에 펄럭이는 판. 법선력 `C_N`(기본 1.2)과 바깥면 흡입 `C_S`(기본 0)를 가진다(A§4.9).
- `damageGroups`: 감시하는 빔 묶음(빔의 `damage` 키). 빔 길이가 [1 − s, 1 + s]·L0,init을 벗어나거나 끊어지면 손상이다. 그룹 손상 = 손상된 빔의 비율이다. `impact` [N]은 `nodes`의 노드 하나에 걸린 접촉 힘이 이 값을 넘으면 손상으로 치는 기준이다. `visual`은 렌더러만 읽는다: `kind`(`glass`·`lamp`·`component`), 유리 종류(`laminated` 금이 감 / `tempered` 산산조각), 조각 기준점 `pieces`.

## 압력 휠

```jsonc
{ "id": "FL", "axleRight": "FL_ai", "axleLeft": "FL_ao", "center": [0.8003, 0.3446, 1.2219],
  "segments": 24, "tyreRadius": 0.3446, "treadWidth": 0.20, "rimRadius": 0.26, "rimWidth": 0.19,
  "treadNodeMass": 0.20, "rimNodeMass": 0.25, "treadMaterial": "rubber", "rimMaterial": "steel" }
```

코어의 `addPressureWheel`이 림 2열과 트레드 2열(반 세그먼트 엇갈림), 스포크, 사이드월, 벨트, 공동 압력 그룹을 만든다. M2 키: `rimYieldForce` [N](림 빔 항복 힘, 0이면 탄성 — 연석·포트홀에 림이 휜다)과 `rimHardening`(항복 후 기울기, k 대비), `collisionSurface`(기본 true: 트레드·사이드월 충돌 삼각형), `collisionGroup`(자기충돌 그룹). 나머지 키(`rimStiffness`, `spokeStiffness`, `sidewallStiffness`, `sidewallTensionStiffness`, `treadStiffness`, `treadNodeRadius`, `structuralPressure`, 감쇠비 …)의 기본값은 `core/include/sbc/builder.h`의 `PressureWheelParams`를 따른다. 스핀 축은 `axleLeft − axleRight`이고 차량 왼쪽을 향한다.

## 차량 (`vehicle`)

```jsonc
{
  "refCenter": "c4_1_7", "refFront": "c4_1_12", "refLeft": "c6_1_7",   // 섀시 좌표계(렌더 바인딩·텔레메트리)
  "steering": { "channel": 0, "rate": 2.5 },
  "wheels": [{ "name": "FL", "pressureWheel": "FL", "carrier": ["FL_ai", "FL_ao", "FL_kl", …],
               "tyre": { "radius": 0.3446, "mu": 1.1, "nominalLoad": 3300 },
               "brakeTorque": 3000, "handbrakeTorque": 0, "driveShare": 0.15 }],
  "axles": [{ "left": "RL", "right": "RR", "lsdPreload": 80, "lsdLockDrive": 0.3, "lsdLockCoast": 0.25 }],
  "driveReaction": ["FL_laf", …],
  "centreCoupling": { "active": true, "frontAxle": 0, "rearAxle": 1, "minFront": 0.1, "maxFront": 0.45, "rate": 4 },
  "engine": { "torqueCurve": [[1000, 380], …], "idleRpm": 850, "redlineRpm": 7200, "limiterRpm": 7300,
              "stallRpm": 400, "inertia": 0.25, "frictionTorque": 15, "frictionPerRpm": 0.009 },
  "transmission": { "ratios": [3.91, …], "reverseRatio": 3.55, "finalDrive": 3.44, "efficiency": 0.92,
                    "shiftTime": 0.08, "clutchMaxTorque": 1000, "drivelineStiffness": 25000, "drivelineDamping": 500,
                    "upshiftRpm": 7000, "downshiftRpm": 4000, "launchRpm": 4500 },
  "brakes": { "stiffness": 1e5, "damping": 40 },
  "electronics": { "abs": true, "absSlip": 0.13, "tcs": true, "tcsSlip": 0.10 },
  "aero": { "dragArea": 0.65, "liftAreaFront": 0.03, "liftAreaRear": 0.06, "frontNodes": […], "rearNodes": […],
            "surfaceGroups": [0], "baseSuction": 0.25, "skinFriction": 0.004,
            "wings": [{ "name": "rearSpoiler", "nodes": ["c6_3_1", "c2_3_1", "c2_3_0", "c6_3_0"], "area": 0.3,
                        "aspectRatio": 3.9, "zeroLiftAngle": 0.05, "angle": 0.1, "stallAngle": 0.26, "cd0": 0.03, "oswald": 0.8 }] },
  "fluids": { "coolantL": 20, "oilL": 9, "fuelL": 67.5, "radiatorUA": 6000, "heatCapacity": 160000 },
  "damageLinks": [{ "group": "radiator_left", "effect": "coolantLeak", "rate": 0.35 }, …]
}
```

- `carrier`: 너클(업라이트) 노드. 3개 이상이고 한 직선 위에 있으면 안 된다. 브레이크 반력, 휠 상대 회전, 축 밖 모멘트를 여기에 건다.
- `tyre`: `TyreParams`(`core/include/sbc/vehicle.h`). Magic Formula 계수 `Bx Cx Ex By Cy Ey`, `mu`, `loadSensitivity`, `nominalLoad`, `relaxationX/Y`, `rollingResistance`(노면 쌍 Crr에 곱하는 배수), `pneumaticTrail`, `camberStiffness`, `lowSpeed`, `verticalStiffness`(반경 스프링 [N/m]: 트레드 노드가 지지 않는 하중을 허브에서 받는다), `radialDamping`(감쇠비).
- `driveShare`: 변속기 출력 토크 중 이 휠의 몫이다(합 ≤ 1, 오픈 디퍼렌셜). `axles`의 LSD가 좌우 차이를 옮긴다.
- `centreCoupling`(선택): 능동 센터 커플링(PTM/할덱스형 다판 클러치). 켜면 `driveShare` 대신 변속기가 `rearAxle`을 직접 돌리고, 클러치가 frontShare·|토크|까지를 `frontAxle`로 넘긴다(빠른 쪽 → 느린 쪽으로만). frontShare는 두 축의 하중 비율을 따라 [minFront, maxFront] 안에서 초당 `rate`까지 움직인다. `frontAxle`·`rearAxle`은 `axles` 배열의 번호다.
- `driveReaction`: 구동 토크 반력을 받는 차체 노드(3개 이상, 한 직선 위에 있으면 안 됨).
- `tyre`의 M2 손상 키: `pressure` [bar](기준 공기압, 표시·경고용), `pinchForce` [N](타이어를 거쳐 림에 걸린 힘이 이를 넘으면 핀치 펑크), `blowoutForce` [N](블로우아웃), `shredDistance` [m](펑크 난 채로 달린 속도 가중 거리가 이를 넘으면 타이어가 찢겨 떨어진다). 동작은 A§4.7.
- `aero`: `surfaceGroups`가 있으면 그 충돌 그룹의 삼각형마다 공력을 건다(바람받이 압력, 바람그늘 흡입 `baseSuction`, 표면 마찰 `skinFriction`). `dragArea`·`liftArea*`는 온전한 차의 목표 합계이고, 생성 시 보정해 맞춘다(A§4.9). `wings`: 네 노드(앞 왼쪽, 앞 오른쪽, 뒤 오른쪽, 뒤 왼쪽) 사각형 날개. 받음각은 노드 형상 + `angle` + 실행 중 조절값이다.
- `fluids`: 냉각수·오일·연료량 [L], 온도 모델(`ambientC`, `thermostatC`, `derateC`, `failC`, `heatCapacity`, `heatShare`, `idleHeatW`, `radiatorUA`, `fanFlow`, `fullFlowSpeed`), 유압(`oilBarPer1000Rpm`, `maxOilBar`, `minOilBar`, `starveRpm`), 엔진 손상 속도(`seizeRate`, `overrevRate`), 연료(`efficiency`, `fuelEnergy`, `idleFuelLph`). 기본값은 `FluidsDesc`(`core/include/sbc/vehicle.h`).
- `damageLinks`: 손상 그룹 → 기능 효과. `effect`는 `coolantLeak`·`oilLeak`·`fuelLeak`(`rate` [L/s]를 손상 비율로 곱함), `steering`, `driveLoss`·`brakeLoss`(`wheel` 필수), `gearbox`, `electrical`이다.

## 생성기

```bash
npm run vehicles:gen    # tools/vehicle-gen/porsche_911_turbo_991.mjs → web/public/vehicles/porsche_911_turbo_991/vehicle.json
./build/native-release/sbc-cli vehicle web/public/vehicles/porsche_911_turbo_991/vehicle.json   # 안정성·정착·하중 분배 확인
```

생성기는 GLB 차체 헐(hull)로 격자 섀시를 자른다. 서스펜션(맥퍼슨·5링크)의 타이로드와 토 링크 안쪽 점은 **범프 스티어 0 점**에 둔다. 조향을 고정한 채 ±50 mm 스트로크에서 조향 암 점이 그리는 원의 축 위에 있는 점이다. 스프링은 승차 주파수에서, 질량은 목표 총중량·앞 하중 비율에서 푼다. 실측 자료가 없는 값(스프링, 부싱, 타이어 형상 계수)은 추정치이고, `sources`에 그렇다고 적는다.

## 렌더 모델(GLB) — `scene.extras.apex`

`tools/vehicle-import`가 쓰는 GLB는 물리 JSON과 같은 좌표계이고, 장면 extras에 차량 메타데이터를 담는다.

| 키 | 설명 |
|---|---|
| `dimensions`, `wheelbase` | [m] 모델 실측 |
| `wheels[]` | 바퀴별 `position`(허브 중심), `side`, `axle`. 아치에 맞춘 휠은 `radius`·`width`·`rimRadius`(차축별 타이어 크기)도 가진다 |
| `wheel` | 휠 메시 정보. `procedural: true`이면 GLB에 휠 메시가 없고 렌더러가 `style`(`ghost`·`maybach`·`default`)로 휠을 만든다(타이어·림·스포크·디스크·캘리퍼). `meshSide`는 베이크 휠 메시가 속한 쪽(다른 쪽은 거울상) |
| `source`, `license` | 원본 출처·라이선스 |

프리미티브의 재질 extras `apexRole`이 렌더 재질을 정한다: `paint`, `glass`(투명 유리), `tint`(거의 불투명한 틴트·파노라마 루프 유리), `lamp`(자체 발광 렌즈), `chrome`(다크 크롬 램프 하우징), `trim`. 정점색은 선형 값이다(glTF COLOR_0).

**휠 맞춤(`fitWheels`, 임포터 설정):** 옆에서 본 깊이 래스터(1 cm 셀, 셀마다 가장 바깥 |x|)에서 외판이 휠 웰로 한 번에 꺼지는 곳(0.04 m 이상 계단)을 아치 립으로 찾고, 휠을 지나는 연속 구간만 남긴다. 아치 중심 = 립 윗부분 구간의 가운데, 아치 꼭대기 = 립 높이의 중앙값이다. 차축별 타이어 반경 = min(max((꼭대기 − 틈)/2, 규격), 규격 × `maxScale`)이고, 남는 틈만큼 차체를 내린다. 트레드 바깥면은 외판보다 15 mm 안쪽에 둔다.

**빈 곳 채우기(`fill`, 임포터 설정):** 위·앞·뒤에서 본 첫 표면 래스터(3 cm)에서 주변(±16 cm)보다 `threshold` 이상 깊거나 표면이 없는 셀을 구멍으로 보고, 래스터 테두리에서 구멍을 따라 닿지 않는(차체에 둘러싸인) 구멍 중 설정한 상자 안의 것을 채운다. 유리는 둘레 표면을 잇는 조화 보간 막면으로, 백킹은 둘레 표면에서 `inset`만큼 들어간 어두운 면으로 만든다. 스캔 데이터가 아닌 합성 면이다(KNOWN_ISSUES A4).
