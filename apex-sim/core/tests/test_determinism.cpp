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
