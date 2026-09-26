#!/usr/bin/env bash
# Builds SoftBodyCore for WASM (SIMD128 + pthreads, and a single-thread fallback) and copies the web modules into
# web/public/wasm/.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if ! command -v em++ >/dev/null 2>&1; then
  # shellcheck disable=SC1091
  source "$ROOT/tools/setup-emsdk.sh"
fi
cmake --preset wasm-release -S core >/dev/null
cmake --build build/wasm-release
# Single-thread module for pages without cross-origin isolation (no SharedArrayBuffer).
cmake --preset wasm-st-release -S core >/dev/null
cmake --build build/wasm-st-release --target sbc_wasm
mkdir -p web/public/wasm
cp build/wasm-release/sbc.mjs build/wasm-release/sbc.wasm web/public/wasm/
cp build/wasm-st-release/sbc-st.mjs build/wasm-st-release/sbc-st.wasm web/public/wasm/
echo "wasm modules → web/public/wasm/ (threads $(wc -c < web/public/wasm/sbc.wasm) bytes, single $(wc -c < web/public/wasm/sbc-st.wasm) bytes)"
