// §23.1 결정론: 같은 입력 10회 재생 → 상태 해시 완전 일치. 스레드 수와 무관, 네이티브 = WASM (골든 파일).
#include <catch2/catch_test_macros.hpp>
#include <cinttypes>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "sbc/scenes.h"

using namespace sbc;

namespace {

constexpr int kCheckpointEvery = 1000;  // [steps]
constexpr int kCheckpoints = 4;         // 2 s of golden_m0

std::vector<uint64_t> runGolden(int threads) {
  SceneOptions o;
  o.threads = threads;
  auto w = makeScene("golden_m0", o);
  std::vector<uint64_t> hashes;
  for (int c = 0; c < kCheckpoints; ++c) {
    w->step(kCheckpointEvery);
    hashes.push_back(w->stateHash());
  }
  return hashes;
}

std::string hex(uint64_t h) {
  char buf[17];
  std::snprintf(buf, sizeof buf, "%016" PRIx64, h);
  return buf;
}

}  // namespace

TEST_CASE("10 identical runs give identical state hashes", "[determinism][23.1]") {
  const auto reference = runGolden(1);
  for (int run = 0; run < 9; ++run) CHECK(runGolden(1) == reference);
}

TEST_CASE("state hash does not depend on the thread count", "[determinism][23.1]") {
  const auto reference = runGolden(1);
  CHECK(runGolden(2) == reference);
  CHECK(runGolden(4) == reference);
}

TEST_CASE("golden_m0 matches the committed golden hashes (native == WASM)", "[determinism][golden]") {
  // Regenerate with: sbc-cli golden golden_m0 --seconds 2 --every-steps 1000  (see tests/golden/README.md)
  const std::string path = std::string(SBC_GOLDEN_DIR) + "/golden_m0.txt";
  std::ifstream in(path);
  REQUIRE(in.good());
  std::vector<std::pair<int, std::string>> expected;
  std::string line;
  while (std::getline(in, line)) {
    if (line.empty() || line[0] == '#') continue;
    std::istringstream ls(line);
    int step;
    std::string h;
    ls >> step >> h;
    expected.emplace_back(step, h);
  }
  REQUIRE(expected.size() == static_cast<size_t>(kCheckpoints));
  const auto hashes = runGolden(2);
  for (int c = 0; c < kCheckpoints; ++c) {
    INFO("checkpoint step " << expected[static_cast<size_t>(c)].first);
    CHECK(expected[static_cast<size_t>(c)].first == (c + 1) * kCheckpointEvery);
    CHECK(hex(hashes[static_cast<size_t>(c)]) == expected[static_cast<size_t>(c)].second);
  }
}

TEST_CASE("a two-car crash matches the committed golden hashes (native == WASM)", "[determinism][golden][porsche]") {
  // Everything a car brings — tyres, drivetrain, aero and wake, body contacts, CCD, damage — hashed at 0.2 s steps
  // through a 64 + 64 km/h head-on. Transcendental functions must come from det:: (libm differs by platform).
  // Regenerate with: sbc-cli golden crash_pair --vehicle <porsche vehicle.json> --seconds 0.8 --every-steps 400
  std::ifstream in(std::string(SBC_GOLDEN_DIR) + "/golden_crash_pair.txt");
  REQUIRE(in.good());
  std::vector<std::pair<int, std::string>> expected;
  std::string line;
  while (std::getline(in, line)) {
    if (line.empty() || line[0] == '#') continue;
    std::istringstream ls(line);
    int step;
    std::string h;
    ls >> step >> h;
    expected.emplace_back(step, h);
  }
  REQUIRE(expected.size() == 4);
  std::ifstream file(std::string(SBC_VEHICLE_DIR) + "/porsche_911_turbo_991/vehicle.json", std::ios::binary);
  REQUIRE(file.good());
  std::stringstream text;
  text << file.rdbuf();
  SceneOptions o;
  o.threads = 2;
  auto w = makeCrashGolden(text.str(), o);
  int done = 0;
  for (const auto& [step, h] : expected) {
    w->step(step - done);
    done = step;
    INFO("step " << step);
    CHECK(hex(w->stateHash()) == h);
  }
}
