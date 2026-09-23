// SoftBodyCore — minimal fork-join thread pool for per-island parallelism (§21.2).
// Items handed to parallelFor must be independent; results then do not depend on the thread count
// or scheduling, which keeps the simulation deterministic (A§4.5).
#pragma once

#include <atomic>
#include <condition_variable>
#include <functional>
#include <mutex>
#include <thread>
#include <vector>

namespace sbc {

class JobSystem {
 public:
  // threadCount = total threads including the calling thread (1 → everything runs inline).
  explicit JobSystem(int threadCount);
  ~JobSystem();
  JobSystem(const JobSystem&) = delete;
  JobSystem& operator=(const JobSystem&) = delete;

  int threadCount() const { return static_cast<int>(workers_.size()) + 1; }

  // Runs fn(i) for every i in [0, count) and returns when all items are done.
  void parallelFor(int count, const std::function<void(int)>& fn);

 private:
  void workerLoop();
  void runItems();

  std::vector<std::thread> workers_;
  std::atomic<unsigned> generation_{0};
  std::atomic<int> nextItem_{0};
  std::atomic<int> busyWorkers_{0};
  std::atomic<bool> stop_{false};
  const std::function<void(int)>* fn_ = nullptr;
  int count_ = 0;
  std::mutex sleepMutex_;
  std::condition_variable wake_;
};

}  // namespace sbc
