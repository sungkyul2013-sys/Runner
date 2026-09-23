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
| `pressureWheels` | 배열 | 압력 휠 생성 블록(코어가 펼친다) |
| `vehicle` | 객체 | 차량 컨트롤러. 없으면 일반 노드-빔 소품으로 취급한다 |
| `targets` | 객체(숫자) | 시험 목표값(KICKOFF C7): `mass`, `frontWeightFraction`, `zeroTo100`, `topSpeed`, `braking100`, `skidpadG` … |
| `sources` | 객체(문자열) | 목표값·추정치의 출처 설명(로더는 읽지 않는다) |

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
| `breakForce`, `deformLimit`, `breakGroup` | 파단 힘, 누적 소성 변형 한계, 함께 끊어지는 그룹 이름 |
| `rest` / `restOffset` | 휴지 길이 절댓값 / 초기 길이 + 오프셋(스프링 예압). 없으면 초기 길이 |
| `min`·`max` / `minOffset`·`maxOffset` | `bounded` 범위(절댓값 / 초기 길이 기준) |
| `hydro` | `{channel, factor, speed}`: `L0 = L0,init·(1 + factor·입력)`, 속도 제한 |

빔 항목의 넷째 요소(선택)는 그룹 속성을 덮어쓴다.

## 슬라이더·토션 바

```jsonc
"sliders": [{ "node": "FL_top", "railA": "FL_k5", "railB": "FL_k6", "k": 1e6, "zeta": 0.3 }],
"torsionBars": [{ "arm1": "FL_kl", "pivot1": "FL_arb", "pivot2": "FR_arb", "arm2": "FR_kl", "k": 2600, "c": 8 }]
```

슬라이더는 노드를 두 레일 노드를 지나는 직선에 묶는다(맥퍼슨 스트럿의 톱 마운트). 토션 바는 두 레버의 피벗 축 둘레 상대 비틀림에 저항한다(안티롤바).

## 압력 휠

```jsonc
{ "id": "FL", "axleRight": "FL_ai", "axleLeft": "FL_ao", "center": [0.8003, 0.3446, 1.2219],
  "segments": 24, "tyreRadius": 0.3446, "treadWidth": 0.20, "rimRadius": 0.26, "rimWidth": 0.19,
  "treadNodeMass": 0.20, "rimNodeMass": 0.25, "treadMaterial": "rubber", "rimMaterial": "steel" }
```

코어의 `addPressureWheel`이 림 2열과 트레드 2열(반 세그먼트 엇갈림), 스포크, 사이드월, 벨트, 공동 압력 그룹을 만든다. 나머지 키(`sidewallStiffness`, `sidewallTensionStiffness`, `treadStiffness`, `structuralPressure`, 감쇠비 …)의 기본값은 `core/include/sbc/builder.h`의 `PressureWheelParams`를 따른다. 스핀 축은 `axleLeft − axleRight`이고 차량 왼쪽을 향한다.

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
  "engine": { "torqueCurve": [[1000, 380], …], "idleRpm": 850, "redlineRpm": 7200, "limiterRpm": 7300,
              "stallRpm": 400, "inertia": 0.25, "frictionTorque": 15, "frictionPerRpm": 0.009 },
  "transmission": { "ratios": [3.91, …], "reverseRatio": 3.55, "finalDrive": 3.44, "efficiency": 0.92,
                    "shiftTime": 0.08, "clutchMaxTorque": 1000, "drivelineStiffness": 25000, "drivelineDamping": 500,
                    "upshiftRpm": 7000, "downshiftRpm": 4000, "launchRpm": 4500 },
  "brakes": { "stiffness": 1e5, "damping": 40 },
  "electronics": { "abs": true, "absSlip": 0.13, "tcs": true, "tcsSlip": 0.10 },
  "aero": { "dragArea": 0.65, "liftAreaFront": 0.03, "liftAreaRear": 0.06, "frontNodes": […], "rearNodes": […] }
}
```

- `carrier`: 너클(업라이트) 노드. 3개 이상이고 한 직선 위에 있으면 안 된다. 브레이크 반력, 휠 상대 회전, 축 밖 모멘트를 여기에 건다.
- `tyre`: `TyreParams`(`core/include/sbc/vehicle.h`). Magic Formula 계수 `Bx Cx Ex By Cy Ey`, `loadSensitivity`, `relaxationX/Y`, `rollingResistance`, `pneumaticTrail`, `camberStiffness`, `lowSpeed`, `radialDamping`.
- `driveShare`: 변속기 출력 토크 중 이 휠의 몫이다(합 ≤ 1, 오픈 디퍼렌셜). `axles`의 LSD가 좌우 차이를 옮긴다.
- `driveReaction`: 구동 토크 반력을 받는 차체 노드(3개 이상, 한 직선 위에 있으면 안 됨).

## 생성기

```bash
npm run vehicles:gen    # tools/vehicle-gen/porsche_911_turbo_991.mjs → web/public/vehicles/porsche_911_turbo_991/vehicle.json
./build/native-release/sbc-cli vehicle web/public/vehicles/porsche_911_turbo_991/vehicle.json   # 안정성·정착·하중 분배 확인
```

생성기는 GLB 차체 헐(hull)로 격자 섀시를 자른다. 서스펜션(맥퍼슨·5링크)의 타이로드와 토 링크 안쪽 점은 **범프 스티어 0 점**에 둔다. 조향을 고정한 채 ±50 mm 스트로크에서 조향 암 점이 그리는 원의 축 위에 있는 점이다. 스프링은 승차 주파수에서, 질량은 목표 총중량·앞 하중 비율에서 푼다. 실측 자료가 없는 값(스프링, 부싱, 타이어 형상 계수)은 추정치이고, `sources`에 그렇다고 적는다.
