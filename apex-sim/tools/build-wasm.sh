#!/usr/bin/env bash
# Builds SoftBodyCore for WASM (SIMD128 + pthreads) and copies the web module into web/public/wasm/.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if ! command -v em++ >/dev/null 2>&1; then
  # shellcheck disable=SC1091
  source "$ROOT/tools/setup-emsdk.sh"
fi
cmake --preset wasm-release -S core >/dev/null
cmake --build build/wasm-release
mkdir -p web/public/wasm
cp build/wasm-release/sbc.mjs build/wasm-release/sbc.wasm web/public/wasm/
echo "wasm module → web/public/wasm/ ($(wc -c < web/public/wasm/sbc.wasm) bytes)"
