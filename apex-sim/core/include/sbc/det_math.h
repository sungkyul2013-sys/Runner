// SoftBodyCore — deterministic transcendental functions.
// libm implementations of sin/cos differ between platforms (glibc, musl, emscripten),
// which would break native == WASM state-hash equality (ARCHITECTURE A§4.5, KICKOFF C4).
// These use only IEEE-754 basic operations, so they give identical bits everywhere.
#pragma once

namespace sbc::det {

// sin(x) and cos(x) for |x| < 1e6 rad. Absolute error < 1e-15 (Cody–Waite reduction by π/2 +
// Taylor polynomials on [−π/4, π/4]).
double sin(double x);
double cos(double x);

}  // namespace sbc::det
