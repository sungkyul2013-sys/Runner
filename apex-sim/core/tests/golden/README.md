# Golden state hashes (§2.8, §23.1 결정론)

`golden_m0.txt` holds the FNV-1a state hash of scene `golden_m0` every 1000 steps. The same file is checked by
the native and the WASM test builds, so a pass on both proves bit-identical simulation across platforms.

Regenerate **only for an intentional behaviour change**, and record the reason in `CHANGELOG.md`:

```bash
build/native-release/sbc-cli golden golden_m0 --seconds 2 --every-steps 1000 > core/tests/golden/golden_m0.txt
```
