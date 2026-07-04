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
