// Bounding-volume hierarchy over the static world's triangles (KNOWN_ISSUES P4, A§4.6): the broadphase of static
// contacts and sweeps asks it for the triangles near a body instead of testing every triangle of the map.
//
// Built from world-space (double) triangle bounds by median splits along the longest axis of the centroids, leaves of
// up to 8 triangles. Queries are conservative (the caller's own exact test follows) and return triangle indices in
// ascending order, so what the solver sees — and the state hash — is the same as with a linear scan.
#pragma once

#include <array>
#include <cstdint>
#include <vector>

namespace sbc {

class StaticBvh {
 public:
  struct Box {
    double lo[3], hi[3];
  };

  // `bounds`: world bounds per triangle (index = triangle id).
  void build(const std::vector<Box>& bounds);
  // Triangle ids whose bounds overlap `query`, ascending (appended to `out`, which is cleared first).
  void query(const Box& query, std::vector<int32_t>& out) const;
  bool empty() const { return nodes_.empty(); }
  int nodeCount() const { return static_cast<int>(nodes_.size()); }

 private:
  struct Node {
    Box box;
    int32_t left = -1, right = -1;  // children (internal nodes)
    int32_t first = 0, count = 0;   // leaf: order_[first, first + count)
  };
  std::vector<Node> nodes_;
  std::vector<int32_t> order_;
};

}  // namespace sbc
