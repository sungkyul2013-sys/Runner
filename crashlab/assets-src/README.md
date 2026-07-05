# 외부 3D 에셋 (CC0)

- 차량 6종: **Kenney Car Kit 1.4** (kenney.nl, CC0) — boytchev/MeshEdgesGeometry 데모 미러에서 취득
- 건물·나무·분수: **Kenney Starter Kit City Builder** (github.com/KenneyNL, 에셋 CC0)

`bake.mjs`(요구: pngjs)가 GLB를 파싱해 양자화(Int16 위치/Int8 노멀/RGB8 색)·
도색 마스크·텍스처 샘플링을 거쳐 `src/15_baked.js`로 굽는다. 런타임 로더는
`src/16_assets.js`. 경로 상수는 환경에 맞게 수정할 것.
