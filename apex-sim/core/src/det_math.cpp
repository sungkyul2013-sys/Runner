#include "sbc/det_math.h"

#include <cmath>

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

}  // namespace sbc::det
