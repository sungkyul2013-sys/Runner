# Golden state hashes (§2.8, §23.1 결정론)

`golden_m0.txt` holds the FNV-1a state hash of scene `golden_m0` every 1000 steps. `golden_crash_pair.txt` holds
it for two Porsches 911 Turbo meeting head-on at 64 + 64 km/h (`sbc::makeCrashGolden`: tyres, drivetrain, aero
and wake, body contacts and CCD, damage) every 400 steps. The same files are checked by the native and the WASM
test builds, so a pass on both proves bit-identical simulation across platforms.

Regenerate **only for an intentional behaviour change**, and record the reason in `CHANGELOG.md`:

```bash
build/native-release/sbc-cli golden golden_m0 --seconds 2 --every-steps 1000 > core/tests/golden/golden_m0.txt
build/native-release/sbc-cli golden crash_pair --vehicle web/public/vehicles/porsche_911_turbo_991/vehicle.json \
  --seconds 0.8 --every-steps 400 --threads 2 > core/tests/golden/golden_crash_pair.txt
```

The crash golden also changes when the Porsche's generated `vehicle.json` changes.
