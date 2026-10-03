// §23.1 에너지 수지(M0 예비): 1,500 kg 크래시 블록이 64 km/h(17.78 m/s)로 고정벽 충돌 →
// 초기 운동에너지 ≈ 237 kJ = 잔여 운동에너지 + 소성변형 + 감쇠·마찰 손실 (+ 위치에너지 변화), 수지 오차 5% 미만.
// 실제 차량(노드-빔 승용차) 본 테스트는 M2.
#include <catch2/catch_test_macros.hpp>
#include <cmath>

#include "sbc/scenes.h"
#include "test_util.h"

using namespace sbc;

TEST_CASE("64 km/h wall crash closes the energy balance within 5%", "[physics][23.1][energy]") {
  SceneOptions o;
  o.trackEnergy = true;
  o.threads = 2;
  auto w = makeScene("wall_crash", o);
  const EnergyReport e0 = w->measureEnergy();
  const double ke0 = e0.kinetic;
  CHECK(test::relErr(ke0, 237037.0) < 1e-3);  // ½·1500·(64/3.6)²

  double maxX = -1e9;
  for (int s = 0; s < 3000; ++s) {  // 1.5 s: impact, crumple, rebound, standstill
    w->step();
    const Body& b = w->body(0);
    for (int i = 0; i < b.nodeCount(); ++i) maxX = std::max(maxX, b.nodeWorldPosition(i).x);
  }
  const EnergyReport e = w->measureEnergy();
  INFO("KE " << e.kinetic << " plastic " << e.losses.plastic << " beamDamp " << e.losses.beamDamping
             << " contactDamp " << e.losses.contactDamping << " friction " << e.losses.friction
             << " fracture " << e.losses.fracture << " ccd " << e.losses.ccd << " balance " << e.balance());
  CHECK(std::fabs(e.balance()) < 0.05 * ke0);
  CHECK(e.losses.plastic > 0.2 * ke0);          // the front really crumpled
  CHECK(e.kinetic < 0.05 * ke0);                // and the block ended (nearly) at rest
  CHECK(maxX < 3.5 + 0.06);                     // no node centre got past the wall face (x = 3.5 m) + radius
}

TEST_CASE("cube drop closes the energy balance within 2%", "[physics][energy]") {
  SceneOptions o;
  o.trackEnergy = true;
  auto w = makeScene("cube_drop", o);
  const double scale = w->body(0).losses.external;  // mechanical energy brought in at spawn
  w->step(8000);
  const EnergyReport e = w->measureEnergy();
  INFO("balance " << e.balance() << " of " << scale);
  CHECK(std::fabs(e.balance()) < 0.02 * scale);
  CHECK(e.kinetic < 1.0);  // settled
}
