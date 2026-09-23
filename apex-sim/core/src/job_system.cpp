#include "sbc/job_system.h"

#include <algorithm>

namespace sbc {
namespace {
// A 2000 Hz step issues two fork-join phases per step, so waking sleeping threads through the OS
// every time (tens of µs) would dominate. Workers spin briefly for the next phase and only then
// block. ~2e5 polls ≈ 0.1–0.5 ms depending on the CPU: longer than a step, shorter than the
// physics worker's idle gap between batches.
constexpr int kSpinPolls = 200000;
}  // namespace

JobSystem::JobSystem(int threadCount) {
  const int extra = std::max(0, threadCount - 1);
  workers_.reserve(static_cast<size_t>(extra));
  for (int i = 0; i < extra; ++i) workers_.emplace_back([this] { workerLoop(); });
}

JobSystem::~JobSystem() {
  {
    std::lock_guard<std::mutex> lock(sleepMutex_);
    stop_.store(true, std::memory_order_release);
    generation_.fetch_add(1, std::memory_order_acq_rel);
  }
  wake_.notify_all();
  for (auto& t : workers_) t.join();
}

void JobSystem::runItems() {
  const auto& fn = *fn_;
  for (;;) {
    const int i = nextItem_.fetch_add(1, std::memory_order_relaxed);
    if (i >= count_) break;
    fn(i);
  }
}

void JobSystem::parallelFor(int count, const std::function<void(int)>& fn) {
  if (count <= 0) return;
  if (workers_.empty() || count == 1) {
    for (int i = 0; i < count; ++i) fn(i);
    return;
  }
  fn_ = &fn;
  count_ = count;
  nextItem_.store(0, std::memory_order_relaxed);
  busyWorkers_.store(static_cast<int>(workers_.size()), std::memory_order_relaxed);
  {
    std::lock_guard<std::mutex> lock(sleepMutex_);
    generation_.fetch_add(1, std::memory_order_acq_rel);  // publishes fn_/count_ to workers
  }
  wake_.notify_all();
  runItems();
  while (busyWorkers_.load(std::memory_order_acquire) != 0) {
    // spin: workers finish within the same phase
  }
  fn_ = nullptr;
}

void JobSystem::workerLoop() {
  unsigned seen = generation_.load(std::memory_order_acquire);
  for (;;) {
    int polls = 0;
    while (generation_.load(std::memory_order_acquire) == seen && polls < kSpinPolls) ++polls;
    if (generation_.load(std::memory_order_acquire) == seen) {
      std::unique_lock<std::mutex> lock(sleepMutex_);
      wake_.wait(lock, [&] { return generation_.load(std::memory_order_acquire) != seen; });
    }
    seen = generation_.load(std::memory_order_acquire);
    if (stop_.load(std::memory_order_acquire)) return;
    runItems();
    busyWorkers_.fetch_sub(1, std::memory_order_acq_rel);
  }
}

}  // namespace sbc
