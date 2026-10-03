#!/usr/bin/env bash
# Installs the pinned Emscripten SDK used for the WASM build of SoftBodyCore.
# If EMSDK is already set (e.g. CI cache or a shared install), that install is reused.
# Usage: source tools/setup-emsdk.sh   (so that emcc/em++ land on PATH)
set -euo pipefail

SBC_EMSDK_VERSION="6.0.10"   # pinned: native = WASM state hashes are verified against this toolchain

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMSDK_DIR="${EMSDK:-$ROOT/.emsdk}"

if [ ! -x "$EMSDK_DIR/emsdk" ]; then
  git clone --depth 1 https://github.com/emscripten-core/emsdk.git "$EMSDK_DIR"
fi
"$EMSDK_DIR/emsdk" install "$SBC_EMSDK_VERSION"
"$EMSDK_DIR/emsdk" activate "$SBC_EMSDK_VERSION" >/dev/null
# shellcheck disable=SC1091
source "$EMSDK_DIR/emsdk_env.sh" >/dev/null 2>&1
em++ --version | head -1
