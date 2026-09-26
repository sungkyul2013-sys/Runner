#include "sbc/det_math.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace sbc::det {
namespace {

// π/2 split into a high part with trailing zero bits and a low correction (Cody & Waite, 1980),
// so k·kPio2Hi is exact for |k| < 2^20.
constexpr double kTwoOverPi = 0.63661977236758134308;
constexpr double kPio2Hi = 1.57079632673412561417e+00;  // first 33 bits of π/2
constexpr double kPio2Lo = 6.07710050650619224932e-11;  // π/2 − kPio2Hi

// Taylor series on |r| ≤ π/4: the degree-17 (sin) / degree-18 (cos) truncation error is < 1e-17.
double sinPoly(double r) {
  const double r2 = r * r;
  double p = 1.0 / 355687428096000.0;   // 1/17!
  p = p * r2 - 1.0 / 1307674368000.0;   // 1/15!
  p = p * r2 + 1.0 / 6227020800.0;      // 1/13!
  p = p * r2 - 1.0 / 39916800.0;        // 1/11!
  p = p * r2 + 1.0 / 362880.0;          // 1/9!
  p = p * r2 - 1.0 / 5040.0;            // 1/7!
  p = p * r2 + 1.0 / 120.0;             // 1/5!
  p = p * r2 - 1.0 / 6.0;               // 1/3!
  return r + r * r2 * p;
}

double cosPoly(double r) {
  const double r2 = r * r;
  double p = 1.0 / 6402373705728000.0;  // 1/18!
  p = p * r2 - 1.0 / 20922789888000.0;  // 1/16!
  p = p * r2 + 1.0 / 87178291200.0;     // 1/14!
  p = p * r2 - 1.0 / 479001600.0;       // 1/12!
  p = p * r2 + 1.0 / 3628800.0;         // 1/10!
  p = p * r2 - 1.0 / 40320.0;           // 1/8!
  p = p * r2 + 1.0 / 720.0;             // 1/6!
  p = p * r2 - 1.0 / 24.0;              // 1/4!
  p = p * r2 + 0.5;                     // 1/2!
  return 1.0 - r2 * p;
}

// Reduces x to r ∈ [−π/4, π/4] and returns the quadrant k mod 4.
int reduce(double x, double& r) {
  const double k = std::floor(x * kTwoOverPi + 0.5);  // floor is exact → deterministic
  r = (x - k * kPio2Hi) - k * kPio2Lo;
  long long q = static_cast<long long>(k) % 4;
  if (q < 0) q += 4;
  return static_cast<int>(q);
}

// atan(t) for |t| ≤ tan(π/12) ≈ 0.268 by its Taylor series t·Σ (−1)^k t^(2k)/(2k+1), k = 0..15
// (the first omitted term is < 1e-19).
double atanSmall(double t) {
  const double t2 = t * t;
  double p = 0.0;
  for (int k = 15; k >= 0; --k) p = ((k % 2 == 0) ? 1.0 : -1.0) / (2 * k + 1) + t2 * p;
  return t * p;
}

constexpr double kPi = 3.14159265358979323846;
constexpr double kSqrt3 = 1.73205080756887729353;
constexpr double kTanPi12 = 0.26794919243112270647;  // 2 − √3

// ln 2 split like π/2 above (fdlibm): e·kLn2Hi is exact for |e| < 2^11.
constexpr double kLn2Hi = 6.93147180369123816490e-01;
constexpr double kLn2Lo = 1.90821492927058770002e-10;
constexpr double kInvLn2 = 1.44269504088896338700e+00;
constexpr double kSqrtHalf = 0.70710678118654752440;
constexpr double kInvFactorial[16] = {1.0, 1.0, 1.0 / 2, 1.0 / 6, 1.0 / 24, 1.0 / 120, 1.0 / 720, 1.0 / 5040,
                                      1.0 / 40320, 1.0 / 362880, 1.0 / 3628800, 1.0 / 39916800, 1.0 / 479001600,
                                      1.0 / 6227020800.0, 1.0 / 87178291200.0, 1.0 / 1307674368000.0};

}  // namespace

double sin(double x) {
  double r;
  switch (reduce(x, r)) {
    case 0: return sinPoly(r);
    case 1: return cosPoly(r);
    case 2: return -sinPoly(r);
    default: return -cosPoly(r);
  }
}

double atan2(double y, double x) {
  const double ax = std::fabs(x), ay = std::fabs(y);
  if (ax == 0.0 && ay == 0.0) return 0.0;
  const bool swap = ay > ax;
  const double t = swap ? ax / ay : ay / ax;  // t ∈ [0, 1]
  double a;
  if (t > kTanPi12) {
    a = kPi / 6.0 + atanSmall((t * kSqrt3 - 1.0) / (t + kSqrt3));  // atan t = π/6 + atan((t − 1/√3)/(1 + t/√3))
  } else {
    a = atanSmall(t);
  }
  if (swap) a = kPi / 2.0 - a;
  if (x < 0.0) a = kPi - a;
  return y < 0.0 ? -a : a;
}

double cos(double x) {
  double r;
  switch (reduce(x, r)) {
    case 0: return cosPoly(r);
    case 1: return -sinPoly(r);
    case 2: return -cosPoly(r);
    default: return sinPoly(r);
  }
}

double asin(double x) {
  const double c = std::clamp(x, -1.0, 1.0);
  return atan2(c, std::sqrt((1.0 - c) * (1.0 + c)));  // sqrt is correctly rounded (IEEE)
}

double exp(double x) {
  if (x != x) return x;
  if (x > 709.78) return HUGE_VAL;
  if (x < -745.2) return 0.0;
  // x = k·ln 2 + r, |r| ≤ ln 2 / 2; e^r by its Taylor series to r^16 / 16! (the rest < 3e-19), then × 2^k exactly.
  const double k = std::floor(x * kInvLn2 + 0.5);
  const double r = (x - k * kLn2Hi) - k * kLn2Lo;
  double p = 1.0 / 20922789888000.0;  // 1/16!
  for (int n = 15; n >= 1; --n) p = p * r + kInvFactorial[n];
  return std::ldexp(p * r + 1.0, static_cast<int>(k));
}

double log(double x) {
  if (!(x > 0.0)) return x == 0.0 ? -HUGE_VAL : std::numeric_limits<double>::quiet_NaN();
  if (x == HUGE_VAL) return x;
  // x = m·2^e with m ∈ [√½, √2): log m = 2·atanh(s), s = (m − 1)/(m + 1), |s| < 0.172, series to s^31 (rest < 1e-24).
  int e;
  double m = std::frexp(x, &e);  // m ∈ [0.5, 1)
  if (m < kSqrtHalf) { m *= 2.0; --e; }
  const double s = (m - 1.0) / (m + 1.0), s2 = s * s;
  double p = 1.0 / 31.0;
  for (int n = 29; n >= 1; n -= 2) p = p * s2 + 1.0 / n;
  return e * kLn2Hi + (e * kLn2Lo + 2.0 * s * p);
}

}  // namespace sbc::det
