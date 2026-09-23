// beam_throughput.cpp — M0 착수 전 타당성 측정용 마이크로벤치마크 (SoftBodyCore 코드가 아님)
//
// 목적: 네이티브 C++ 대비 WASM(SIMD128 + pthreads)에서 빔 스프링-댐퍼 힘 계산 +
//       반암시적(symplectic) 오일러 적분 처리량을 비교해 ARCHITECTURE.md §12 성능 예산의 근거로 쓴다.
// 범위: 빔 힘 + 적분 + 바닥 클램프만 측정한다. 충돌·타이어·파워트레인·공력은 포함하지 않는다.
//       루프는 스칼라 코드이며 수작업 SIMD 최적화는 하지 않았다(노드 gather/scatter 때문에 자동 벡터화도 제한적).
//
// 빌드·실행:
//   native: g++ -O3 -march=native -std=c++20 -pthread beam_throughput.cpp -o bench_native && ./bench_native
//   wasm  : em++ -O3 -std=c++20 -msimd128 -pthread -sPTHREAD_POOL_SIZE=4 -sALLOW_MEMORY_GROWTH
//                -sENVIRONMENT=node beam_throughput.cpp -o bench_wasm.js && node bench_wasm.js
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <thread>
#include <vector>

namespace {
constexpr int kNodesPerCar = 1500;     // [개] §4.1 승용차 노드 규모 상한 예시
constexpr int kBeamsPerCar = 15000;    // [개] §4.1 승용차 빔 규모 상한 예시
constexpr float kDt = 0.0005f;         // [s] §4.2 고정 스텝 0.5 ms (2000 Hz)
constexpr int kSteps = 4000;           // [스텝] 2.0 s 시뮬레이션 = 4000 × 0.5 ms
constexpr double kSimSeconds = kSteps * 0.0005;  // [s]
constexpr float kGravity = 9.81f;      // [m/s²] 표준 중력
constexpr float kNodeMass = 1.0f;      // [kg] 벤치용 균일 노드 질량
constexpr float kBeamK = 4.0e5f;       // [N/m] 차체 판금급 빔 강성 대표값 (임계 dt = 2√(0.5/4e5) ≈ 2.2 ms > 0.5 ms)
constexpr float kBeamC = 40.0f;        // [N·s/m] 빔 감쇠 대표값
constexpr float kRestPrestrain = 1.01f;  // [-] 초기 1% 인장 상태로 시작해 힘이 0이 아니게 함
constexpr float kLenEpsilon = 1e-9f;   // [m] 0 길이 나눗셈 방지

struct Vehicle {
  // 노드 SoA
  std::vector<float> px, py, pz, vx, vy, vz, fx, fy, fz, invMass;
  // 빔 SoA
  std::vector<int32_t> nodeA, nodeB;
  std::vector<float> restLen, stiffness, damping;

  explicit Vehicle(uint32_t seed) {
    px.resize(kNodesPerCar); py.resize(kNodesPerCar); pz.resize(kNodesPerCar);
    vx.assign(kNodesPerCar, 0); vy.assign(kNodesPerCar, 0); vz.assign(kNodesPerCar, 0);
    fx.assign(kNodesPerCar, 0); fy.assign(kNodesPerCar, 0); fz.assign(kNodesPerCar, 0);
    invMass.assign(kNodesPerCar, 1.0f / kNodeMass);
    // 결정론적 LCG (Numerical Recipes 상수) — 차량 크기 4 m × 1.5 m × 2 m 상자 안에 노드 배치
    uint32_t s = seed;
    auto rnd = [&] { s = s * 1664525u + 1013904223u; return (s >> 8) * (1.0f / 16777216.0f); };
    for (int i = 0; i < kNodesPerCar; i++) { px[i] = rnd() * 4.0f; py[i] = rnd() * 1.5f; pz[i] = rnd() * 2.0f; }
    nodeA.resize(kBeamsPerCar); nodeB.resize(kBeamsPerCar);
    restLen.resize(kBeamsPerCar); stiffness.resize(kBeamsPerCar); damping.resize(kBeamsPerCar);
    for (int j = 0; j < kBeamsPerCar; j++) {
      const int i = j % kNodesPerCar;
      const int o = (i + 1 + static_cast<int>(rnd() * 20)) % kNodesPerCar;  // 인덱스가 가까운 이웃 → 실제 차량과 비슷한 캐시 지역성
      nodeA[j] = i; nodeB[j] = o;
      const float dx = px[o] - px[i], dy = py[o] - py[i], dz = pz[o] - pz[i];
      restLen[j] = std::sqrt(dx * dx + dy * dy + dz * dz) * kRestPrestrain;
      stiffness[j] = kBeamK; damping[j] = kBeamC;
    }
  }

  void step(float dt) {
    for (int i = 0; i < kNodesPerCar; i++) { fx[i] = 0; fy[i] = -kGravity / invMass[i]; fz[i] = 0; }
    for (int j = 0; j < kBeamsPerCar; j++) {
      const int i = nodeA[j], o = nodeB[j];
      const float dx = px[o] - px[i], dy = py[o] - py[i], dz = pz[o] - pz[i];
      const float len = std::sqrt(dx * dx + dy * dy + dz * dz) + kLenEpsilon;
      const float ux = dx / len, uy = dy / len, uz = dz / len;
      const float relVel = (vx[o] - vx[i]) * ux + (vy[o] - vy[i]) * uy + (vz[o] - vz[i]) * uz;
      const float f = stiffness[j] * (len - restLen[j]) + damping[j] * relVel;  // F = k·Δx + c·ẋ  [N]
      fx[i] += f * ux; fy[i] += f * uy; fz[i] += f * uz;
      fx[o] -= f * ux; fy[o] -= f * uy; fz[o] -= f * uz;
    }
    for (int i = 0; i < kNodesPerCar; i++) {  // symplectic Euler: v ← v + a·dt, x ← x + v·dt
      vx[i] += fx[i] * invMass[i] * dt; vy[i] += fy[i] * invMass[i] * dt; vz[i] += fz[i] * invMass[i] * dt;
      px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
      if (py[i] < 0) { py[i] = 0; vy[i] = 0; }
    }
  }
};
}  // namespace

int main() {
  for (int threads : {1, 4}) {
    std::vector<Vehicle> cars;
    for (int t = 0; t < threads; t++) cars.emplace_back(7u + t);
    const auto t0 = std::chrono::steady_clock::now();
    std::vector<std::thread> pool;
    for (int t = 0; t < threads; t++)
      pool.emplace_back([&, t] { for (int s = 0; s < kSteps; s++) cars[t].step(kDt); });
    for (auto& th : pool) th.join();
    const double wall = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    const double beamUpdatesPerSec = static_cast<double>(threads) * kBeamsPerCar * kSteps / wall;
    std::printf("threads=%d cars=%d  wall=%.3fs for %.1fs sim  RTF=%.2f  beam-updates/s=%.1fM  "
                "=> full-res cars @2000Hz per core ~ %.1f\n",
                threads, threads, wall, kSimSeconds, kSimSeconds / wall, beamUpdatesPerSec / 1e6,
                beamUpdatesPerSec / threads / (kBeamsPerCar * 2000.0));
  }
}
