# Sunset Runner (석양 러너) — Progress

A warm, sunset-themed 3-lane endless runner built with Vite + TypeScript +
Three.js. Reimplemented (original code) from the reference **Sunset Runner**
(github.com/sungkyul2013-sys/games) on a modular manager/system engine.

## Done
- **World**: gradient sky dome (top/mid/bottom per biome), glowing sun + halo,
  320 stars, mountain silhouettes, scrolling palms + lit buildings.
- **6 biomes** (석양/황혼/야간/새벽/창공/오로라) lerped on level-up every 320m.
- **Physics** matched to reference (gravity −38, jump 14, base 11 / max 25).
- **Modes**: Endless + Challenge (60s time-attack, +time at checkpoints).
- **Levels** every 320m (biome shift), **checkpoints** every 800m.
- **8 characters** with abilities (magnet/score/coin mult, lane speed, low-grav,
  revive), each a primitive humanoid (skin/shirt/pants/shoes/hat) + run anim.
- **Power-ups**: magnet, x2, boots, glide, rocket, hoverboard shield, bomb.
- **Consumables**: bomb + rocket (bought, carried, on-screen buttons).
- **5 upgrades** (durations + coin value + headstart), bought with coins.
- **Achievements** (9) + **daily rewards** (7-day cycle) + **gems/mileage**.
- **Save**: localStorage profile (wallet, bests, owned/selected, upgrades,
  inventory, achievements, daily, lifetime stats, settings). Guarded.
- **UI**: sunset glass theme — home (brand, char tag, mode select, play, tabs),
  shop (5 tabs), settings, pause, rich game-over; redesigned in-run HUD.
- **Juice**: bloom, particles, screen shake, hit-stop, combos, near-miss,
  level banners; synthesised Web Audio SFX + BGM + mute.
- **Perf**: instanced coins, pooling everywhere, DPR clamp, quality toggle,
  loading screen.

## Verification
- `npm run build` — strict tsc + vite bundle (green).
- `npm run check:templates` — all segment templates clearable.
- `npm run check:meta` — save/economy/upgrades/achievements/daily/run logic.
- `npm run build:standalone` — regenerates self-contained `play.html`.

## Controls
- Move: ← → / A D or swipe.  Jump: ↑ / W / Space / swipe up.  Slide: ↓ / S /
  swipe down.  Hoverboard: double-tap / Shift / E.  Items: on-screen 💣 / 🚀.
  Pause: Esc / P.

---

# CRASH LAB (크래시 랩) — Progress

기획안 v1.0(2026.07.04) 전 항목 구현. 단일 HTML(`crashlab.html`, Three.js 인라인)
모바일 리얼 드라이빙 샌드박스. 소스는 `crashlab/src/` 청크, `bash crashlab/build.sh`로 재빌드.

## Done
- **물리**: 강체 6DOF + 바퀴별 레이캐스트 서스펜션(스프링·댐퍼·ARB) + 간소화
  Pacejka 타이어(슬립각 피크 ~8°, 마찰원, 바퀴별 노면 μ 판정), 고정 120Hz +
  누산기 + 50ms 프레임 클램프, NaN 롤백 가드.
- **손상·변형**: 충격 기반 메시 변형(d=min(0.4, 0.015Δv), 거리감쇠 크레이터,
  영구 누적), 파츠 6종(범퍼×2·보닛·트렁크·문×2) 분리→디브리(12개 상한·페이드),
  기능 손상(출력 −50%·토우 틀어짐·서스 약화·조향각 감소), 4구역 HUD 실루엣,
  Δv>10m/s 자동 슬로모(0.15×).
- **차량 5종**: 포니 시티(FF)/드리프트킹 GT(FR)/산악왕 4X4(4WD)/타이탄 카고(8t
  RWD)/벨로체 R(720hp+다운포스) — 전부 물리 파라미터로 차별화, 색상 선택.
- **맵 6종+에디터**: 프루빙 그라운드(가속로·충돌벽 2종·램프 15/30/45°·킥램프·
  슬라럼·스키드패드·낙하 타워 10/20m·스피드트랩), 네오시티(6×6블록·고가·로터리·
  파괴 오브젝트), 미시령 와인딩(다운힐·가드레일·낭떠러지), 황야(사구·바위·절벽·
  강바닥), 빙판 호수(μ0.15·드리프트 서클·눈벽), 선셋 레이스웨이(12코너 서킷).
  에디터: 24×24 그리드, 도로/커브/교차로/램프/벽/콘/체크포인트/출발점, 검증 후
  저장, 자유주행·타임어택에서 사용.
- **모드 6종**: 자유주행(시간대 3종·손상 토글), 크래시 테스트(20~200km/h 사출→
  충돌 리포트: 속도·G·변형부피·파츠·수리비 등급), 타임어택(랩·베스트 영구 저장),
  AI 레이스(3~5대·웨이포인트+러버밴딩 ±5%·AI도 손상), 드리프트 스코어(각도×속도×
  콤보·벽 스침 2배·스핀 소멸), 커스텀 맵.
- **조작**: 슬라이더/버튼/틸트 조향, 멀티터치 포인터 분리, 어시스트 3프리셋
  (캐주얼=속도감응+카운터스티어+TCS/ABS, 스포츠=ABS/TCS, 시뮬=전부 OFF)+개별 토글,
  드래그 궤도 카메라(5~80°)+핀치 줌(3~14m), 카메라 5종(체이스/후드/범퍼/탑/프리).
- **사운드**: Web Audio 절차 합성(엔진 RPM 톱니파+노이즈, 스키드, 임팩트, 변속).
- **안정성**: NaN 가드·물리량 클램프·경계 리스폰·visibilitychange 일시정지·
  자동 화질 하향(그림자→파티클→해상도)·파티클/디브리 풀링.

## Verification (Playwright headless, swiftshader)
- `node crashlab/test/test.mjs` — 전 모드 스모크 + 차량5×맵6 로드 매트릭스: 무오류.
- `node crashlab/test/stress.mjs` — 200km/h 충돌(5차종)·낙하 20m·전복 리셋 유도·
  빈 맵 저장 검증·급속 전환 18회·60s 연속 AI 레이스(힙 16MB 유지): 무오류.

## v1.1 (2026-07-04)
- **차량 메시 v2**: 8점 단면 로프트(스타일별 실루엣: 해치/롱노즈 쿠페/박스 SUV/
  캡오버 트럭/웨지 슈퍼카), 휠하우스 셸, 스포크 휠, 미러(분리 가능)·그릴·번호판·
  배기구·도어핸들·덕테일/윙/루프랙/스페어타이어, 페이크 AO. 파츠 8종으로 확대.
- **과속방지턱**: OBB+노랑/검정 비주얼. 프루빙 시험구간 5개, 네오시티 8개,
  그랜드 시티 6개, 에디터 '방지턱' 타일.
- **조향 4방식**: 슬라이더/버튼/틸트 + **스티어링 휠**(드래그 회전, ±137° 잠금,
  자동 복원).
- **그랜드 시티**(맵 7): 1.4km² 오픈월드 — 도심 5×5 격자·순환 고속도로(언덕 절개)·
  호수·교외 주택·공업지구·비포장 언덕길. 타임어택/AI 레이스 루트 포함.
- **현실감**: 엔진 브레이크, 속도 연동 FOV(66→75).
- **용량**: three.js esbuild 트리셰이킹(633→456KB) + 게임 코드 미니파이 —
  아티팩트 574KB(기존 777KB). 로딩 화면에 오류 원인 표시 추가.
- 검증: test/stress 전 항목 무오류 재통과(변형·낙하·전복·60s 지속 주행 포함).

## v1.2 (2026-07-04)
- **외부 3D 모델 도입 (CC0)**: Kenney Car Kit 차량 6종(레이스카=GT, 미래형=벨로체,
  럭셔리 SUV=산악왕, 청소트럭=타이탄, 구급밴=메디밴 911(입문), 신차 막강 트랙터) +
  City Builder Kit 건물 5종·가로수 2종·분수. 빌드 타임 GLB 베이커(양자화·도색
  마스크 리틴트·콜맵 텍스처 샘플링) → 임베드. 물리 스펙(트랙·휠 반경·차체 치수·
  마운트)은 모델 실측 기준 자동 보정, 변형(찌그러짐)은 모델 메시에 그대로 적용.
- **조향 방향 반전**: 우측 입력 = 우회전 (전 입력 방식 공통, 검증 완료).
- **맵 품질**: 베이크 건물·가로수를 네오시티/그랜드/레이스웨이/미시령/프루빙에
  배치(충돌 OBB 포함), 도로 중앙 점선 차선, 로터리 분수.
- **비주얼**: ACES 톤매핑, 그라데이션 스카이돔+구름, 소프트 원형 파티클.
- **UI 대개편**: 아크 게이지 속도계(속도+RPM 이중 아크), 원형 미니맵(도로 지도·
  플레이어 화살표·다음 체크포인트·AI 점), 메뉴 히어로 홈("바로 주행" 최근 설정
  이어하기), 표면 명칭 정리.
- 산출물 1.13MB (모델 임베드 포함). 전체 회귀·스트레스 테스트 무오류.
- 에셋 원본·베이커: `crashlab/assets-src/` (전부 CC0, 출처 README 명기).

## v1.3 (2026-07-05)
- **고해상 지면**: 맵마다 2048² 캔버스 텍스처 — 도로·차선·횡단 마킹·스키드패드·
  트랙 엣지라인을 벡터로 선명하게 + 노면 그레인. (저해상 버텍스컬러 지면 대체)
- **한국형 과속방지턱**: 폭 3.6m·높이 10cm 완만 아치(2단 슬랩 물리) + 노랑/흰
  45° 사선. 노면별 미세 요철(아스팔트 5mm~잔디 22mm)이 서스펜션에 잔진동 전달.
- **슬라임 변형**: 차체 메시 4배 세분화(≈7~15k 정점) + 충격 순간 1.35× 과변형 후
  0.3s 스프링백 → 잔류 변형. 우그러짐이 유기적으로 접힘.
- **UI 리파인**: 차량 선택 카드에 실시간 렌더링한 3D 프리뷰 썸네일, 카드 그라데이션,
  크래시 모드 UI 정리.
- 산출물 1.93MB. 회귀·스트레스 전 항목 무오류(헤드리스 타이밍 마진 보정).

## v1.3.1 (2026-07-05)
- **리얼 타이어/휠**: 케니 장난감 휠 → 토러스 단면 고무 타이어 + 건메탈 알로이 림
  (립·6스포크·센터캡) + 브레이크 디스크·레드 캘리퍼(비회전). 휠 크기를 실차
  비율(0.8×)로 축소하고 마운트를 보정해 지상고 유지.
- **차체 비례**: GT 0.90 / 벨로체 0.88 / SUV 0.96 세로 스쿼시 — 낮고 날렵한 스탠스.
