#include "static_bvh.h"

#include <algorithm>

namespace sbc {

namespace {

constexpr int kLeafSize = 8;

void grow(StaticBvh::Box& a, const StaticBvh::Box& b) {
  for (int k = 0; k < 3; ++k) {
    a.lo[k] = std::min(a.lo[k], b.lo[k]);
    a.hi[k] = std::max(a.hi[k], b.hi[k]);
  }
}

bool overlaps(const StaticBvh::Box& a, const StaticBvh::Box& b) {
  return a.lo[0] <= b.hi[0] && a.hi[0] >= b.lo[0] && a.lo[1] <= b.hi[1] && a.hi[1] >= b.lo[1] && a.lo[2] <= b.hi[2] &&
         a.hi[2] >= b.lo[2];
}

}  // namespace

void StaticBvh::build(const std::vector<Box>& bounds) {
  nodes_.clear();
  order_.resize(bounds.size());
  for (size_t i = 0; i < bounds.size(); ++i) order_[i] = static_cast<int32_t>(i);
  if (bounds.empty()) return;
  auto centre = [&](int32_t t, int axis) { return bounds[static_cast<size_t>(t)].lo[axis] + bounds[static_cast<size_t>(t)].hi[axis]; };
  struct Task { int32_t node, first, count; };
  std::vector<Task> stack;
  nodes_.push_back({});
  stack.push_back({0, 0, static_cast<int32_t>(bounds.size())});
  while (!stack.empty()) {
    const Task task = stack.back();
    stack.pop_back();
    Box box = bounds[static_cast<size_t>(order_[static_cast<size_t>(task.first)])];
    Box centres{{centre(order_[static_cast<size_t>(task.first)], 0), centre(order_[static_cast<size_t>(task.first)], 1),
                 centre(order_[static_cast<size_t>(task.first)], 2)},
                {centre(order_[static_cast<size_t>(task.first)], 0), centre(order_[static_cast<size_t>(task.first)], 1),
                 centre(order_[static_cast<size_t>(task.first)], 2)}};
    for (int32_t k = task.first; k < task.first + task.count; ++k) {
      const int32_t t = order_[static_cast<size_t>(k)];
      grow(box, bounds[static_cast<size_t>(t)]);
      const Box c{{centre(t, 0), centre(t, 1), centre(t, 2)}, {centre(t, 0), centre(t, 1), centre(t, 2)}};
      grow(centres, c);
    }
    nodes_[static_cast<size_t>(task.node)].box = box;
    if (task.count <= kLeafSize) {
      nodes_[static_cast<size_t>(task.node)].first = task.first;
      nodes_[static_cast<size_t>(task.node)].count = task.count;
      continue;
    }
    int axis = 0;
    for (int k = 1; k < 3; ++k) {
      if (centres.hi[k] - centres.lo[k] > centres.hi[axis] - centres.lo[axis]) axis = k;
    }
    // Median split, ties broken by triangle id (a strict order: the same halves on every platform).
    const int32_t half = task.count / 2;
    auto begin = order_.begin() + task.first;
    std::nth_element(begin, begin + half, begin + task.count, [&](int32_t a, int32_t b) {
      const double ca = centre(a, axis), cb = centre(b, axis);
      return ca < cb || (ca == cb && a < b);
    });
    const int32_t left = static_cast<int32_t>(nodes_.size());
    nodes_.push_back({});
    nodes_.push_back({});
    nodes_[static_cast<size_t>(task.node)].left = left;
    nodes_[static_cast<size_t>(task.node)].right = left + 1;
    stack.push_back({left, task.first, half});
    stack.push_back({left + 1, task.first + half, task.count - half});
  }
}

void StaticBvh::query(const Box& q, std::vector<int32_t>& out) const {
  out.clear();
  if (nodes_.empty()) return;
  int32_t stack[64];
  int depth = 0;
  stack[depth++] = 0;
  while (depth > 0) {
    const Node& n = nodes_[static_cast<size_t>(stack[--depth])];
    if (!overlaps(n.box, q)) continue;
    if (n.count > 0) {
      for (int32_t k = n.first; k < n.first + n.count; ++k) out.push_back(order_[static_cast<size_t>(k)]);
    } else {
      stack[depth++] = n.left;
      stack[depth++] = n.right;
    }
  }
  std::sort(out.begin(), out.end());
}

}  // namespace sbc
