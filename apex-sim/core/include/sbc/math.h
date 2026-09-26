// SoftBodyCore — small vector types.
// Every operation is plain IEEE-754 (+, −, ×, ÷, sqrt) so results are bit-identical on
// every platform built with -ffp-contract=off (ARCHITECTURE A§4.5).
#pragma once

#include <cmath>
#include <cstdint>

namespace sbc {

struct Vec3 {
  float x = 0.0f, y = 0.0f, z = 0.0f;

  constexpr Vec3() = default;
  constexpr Vec3(float x_, float y_, float z_) : x(x_), y(y_), z(z_) {}

  constexpr Vec3 operator+(Vec3 o) const { return {x + o.x, y + o.y, z + o.z}; }
  constexpr Vec3 operator-(Vec3 o) const { return {x - o.x, y - o.y, z - o.z}; }
  constexpr Vec3 operator-() const { return {-x, -y, -z}; }
  constexpr Vec3 operator*(float s) const { return {x * s, y * s, z * s}; }
  constexpr Vec3& operator+=(Vec3 o) { x += o.x; y += o.y; z += o.z; return *this; }
  constexpr Vec3& operator-=(Vec3 o) { x -= o.x; y -= o.y; z -= o.z; return *this; }
};

constexpr Vec3 operator*(float s, Vec3 v) { return v * s; }
constexpr float dot(Vec3 a, Vec3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
constexpr Vec3 cross(Vec3 a, Vec3 b) {
  return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}
inline float length(Vec3 a) { return std::sqrt(dot(a, a)); }

// Double-precision vector for world-space origins (A§4.4: float32 is ~1 mm coarse at 8 km).
struct DVec3 {
  double x = 0.0, y = 0.0, z = 0.0;

  constexpr DVec3() = default;
  constexpr DVec3(double x_, double y_, double z_) : x(x_), y(y_), z(z_) {}

  constexpr DVec3 operator+(DVec3 o) const { return {x + o.x, y + o.y, z + o.z}; }
  constexpr DVec3 operator-(DVec3 o) const { return {x - o.x, y - o.y, z - o.z}; }
  constexpr DVec3 operator*(double s) const { return {x * s, y * s, z * s}; }
  constexpr DVec3& operator+=(DVec3 o) { x += o.x; y += o.y; z += o.z; return *this; }
};

constexpr double dot(DVec3 a, DVec3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
constexpr DVec3 cross(DVec3 a, DVec3 b) {
  return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}
constexpr DVec3 toDouble(Vec3 v) { return {v.x, v.y, v.z}; }
constexpr Vec3 toFloat(DVec3 v) {
  return {static_cast<float>(v.x), static_cast<float>(v.y), static_cast<float>(v.z)};
}

}  // namespace sbc
