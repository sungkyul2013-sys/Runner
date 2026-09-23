# 변경 이력

## M0 — 기반 (2026-09-23)

### 추가
- **SoftBodyCore (C++20)**: SoA 노드·빔(normal·support·bounded·rope), symplectic Euler 2000 Hz, 경화를 포함한 소성 복귀 사상, 파단 힘·변형 한계·breakGroup
- 접촉: 질량 비례 페널티 스프링-댐퍼 + stick-anchor 쿨롱 마찰(정지/운동 분리, 변위 기반 앵커) — 지면 평면, 정적 삼각형 메시, 노드 구 바디↔바디. 정적 표면 CCD
- 계측: 운동·중력·빔·접촉 위치에너지, 빔 감쇠·접촉 감쇠·마찰·소성·파단·CCD 손실, 외부 일 → 에너지 수지. 선·각운동량. FNV-1a 상태 해시
- 결정론: 고정 순서 병렬(섬 단위 fork-join), 자체 sin/cos, FMA 축약 금지, 바디별 double 원점 + 4 m 재기준
- 안정성 검사기(감쇠 보정 빔 조건 + Gershgorin 노드 조건), 격자 구조물 생성기, 기준 씬 6종, `sbc-cli`(run·bench·stability·golden), C ABI
- 테스트 30종(Catch2): §23.1 자유낙하·진동 주기·감쇠 진동·운동량·결정론(10회, 1·2·4 스레드, 골든 해시)·10분 정지·30% 경사 정지·안정성 한계·64 km/h 에너지 수지·빔·CCD — 네이티브와 WASM 모두 통과
- **웹**: 물리 워커(WASM SIMD128 + pthreads), SharedArrayBuffer 락프리 트리플 버퍼, 프레임 보간, 과부하 시 슬로다운(RTF 표시), 시간 제어(일시정지·한 스텝·1/2~1/100)
- 무한 그리드맵(1 m/10 m 격자, 거리 표시), 노드·빔 응력 색 디버그 렌더, 정적 충돌 형상 렌더, 샌드박스 패널·HUD(한국어 기본), 데이터 드리븐 스폰 프리셋
- `?golden=1` 브라우저 결정론 자가 검사, `?bench=1` 벤치 JSON, E2E 스크립트, CI 워크플로

### 골든 해시
- `core/tests/golden/golden_m0.txt` 최초 생성. 네이티브(GCC 13, x86-64), WASM(Node 22), 브라우저 WASM(Chromium 141, 2스레드)에서 모두 일치
