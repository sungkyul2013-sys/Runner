# 크레딧·라이선스 (§2.6)

## 소프트웨어

| 이름 | 용도 | 라이선스 |
|---|---|---|
| [three.js](https://threejs.org/) 0.186 | 렌더러 (WebGPU/WebGL2) | MIT |
| [Vite](https://vite.dev/) 8 | 개발 서버·번들러 | MIT |
| [Vitest](https://vitest.dev/) 5 | 웹 단위 테스트 | MIT |
| [TypeScript](https://www.typescriptlang.org/) 5.9 | 언어 | Apache-2.0 |
| [Playwright](https://playwright.dev/) (playwright-core) | E2E·스크린샷 | Apache-2.0 |
| [Catch2](https://github.com/catchorg/Catch2) 3.16 | C++ 테스트 | BSL-1.0 |
| [Emscripten](https://emscripten.org/) 6.0.10 | C++ → WASM 툴체인 | MIT / UIUC |

## 폰트

| 이름 | 라이선스 |
|---|---|
| [Pretendard](https://github.com/orioncactus/pretendard) 1.3.9 | SIL OFL 1.1 |
| [Inter](https://rsms.me/inter/) (@fontsource/inter 5.3) | SIL OFL 1.1 |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (@fontsource/jetbrains-mono 5.3) | SIL OFL 1.1 |

## 지형 데이터 (운설령 맵)

| 데이터 | 출처 | 라이선스·표기 |
|---|---|---|
| 표고(DEM) — 설악산 한계령 일대 8 × 8 km (`web/public/data/dem/seorak.*`, `tools/dem/fetch-dem.mjs`) | [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen / Linux Foundation, AWS Open Data; Terrarium 인코딩, z13) | 원자료별 표기 필요: SRTM(NASA, 퍼블릭 도메인) 등 — 등록 페이지의 출처 목록에 따른다. 맵 선택 화면에 표기 |

지명과 도로는 가상이다(실제 도로선은 쓰지 않았다, KNOWN_ISSUES M15).

## 3D 에셋

M0에는 외부 3D 에셋이 없다(모든 형상은 코드로 생성).

예정(사용자 지정, KNOWN_ISSUES A2):
- "Rolls-Royce Ghost" by Black Snow (https://sketchfab.com/BlackSnow02), [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) — 원본: https://sketchfab.com/3d-models/rolls-royce-ghost-4a590f4afa094fa8b407a14db77a63a8
- 포르쉐 911 터보(2014), 메르세데스 GLS 580(마이바흐 슬롯) — 사용자 제공 모델, 원본 출처·라이선스 미기록
