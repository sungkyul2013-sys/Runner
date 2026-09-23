/* SoftBodyCore — C ABI used by the WASM module (and any future engine plug-in, A§13).
 * All quantities SI. Handles are opaque. Functions never throw: failures return a negative value.
 */
#ifndef SBC_SBC_H
#define SBC_SBC_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct sbc_world sbc_world;

/* ---- world ---- */
sbc_world* sbc_world_create(int thread_count, int track_energy);
/* One of the reference scenes of sbc/scenes.h (cube_drop, tower, wall_crash, pile, golden_m0); NULL if unknown.
 * `bodies` is used by "pile" only. */
sbc_world* sbc_world_create_scene(const char* name, int thread_count, int track_energy, int bodies);
void sbc_world_destroy(sbc_world* w);
void sbc_world_set_gravity(sbc_world* w, float gx, float gy, float gz);
/* friction µs/µk [-], penalty frequency [Hz], damping ratio [-] for a material pair */
int sbc_world_set_contact_pair(sbc_world* w, int mat_a, int mat_b, float mu_static, float mu_kinetic,
                               float normal_hz, float normal_zeta);
int sbc_world_add_ground_plane(sbc_world* w, double height, int material);
int sbc_world_add_static_box(sbc_world* w, double cx, double cy, double cz, float hx, float hy, float hz, double yaw,
                             int material);
int sbc_world_static_triangle_count(sbc_world* w);
/* Copies static triangles [first, first+count) as 9 floats each (world-space vertices, relative to the world
 * origin, float) into out. Returns the number written. */
int sbc_world_static_triangles(sbc_world* w, int first, int count, float* out);

/* Lattice parameters, in this order (see LatticeParams in sbc/builder.h):
 *  0-2 center xyz [m]   3-5 size xyz [m]   6-8 nodes per axis   9 total mass [kg]   10 node radius [m]
 *  11 EA [N]   12 damping ratio   13 yield strain   14 hardening   15 break strain   16 deform limit
 *  17 material   18-20 velocity [m/s]   21-23 yaw pitch roll [rad] */
#define SBC_LATTICE_PARAM_COUNT 24
int sbc_world_spawn_lattice(sbc_world* w, const double* params, int count);
int sbc_world_add_body_velocity(sbc_world* w, int body, float dvx, float dvy, float dvz);

void sbc_world_step(sbc_world* w, int steps);
double sbc_world_time(sbc_world* w);
double sbc_world_step_index(sbc_world* w);
float sbc_world_dt(sbc_world* w);
/* 64-bit FNV-1a state hash split into two 32-bit halves (JS-friendly). */
uint32_t sbc_world_state_hash_hi(sbc_world* w);
uint32_t sbc_world_state_hash_lo(sbc_world* w);
/* Last step stats: [static contacts, body contacts, CCD clamps, beams broken] */
void sbc_world_last_stats(sbc_world* w, int32_t* out4);
/* Energy [J]: kinetic, gravity, beam, contact, beamDamping, contactDamping, friction, plastic, fracture, ccd,
 * external, balance */
#define SBC_ENERGY_FIELD_COUNT 12
void sbc_world_measure_energy(sbc_world* w, double* out);
/* Momentum: linear xyz [kg·m/s], angular xyz [kg·m²/s] */
void sbc_world_measure_momentum(sbc_world* w, double* out6);

/* ---- bodies ---- */
int sbc_world_body_count(sbc_world* w);
int sbc_body_node_count(sbc_world* w, int body);
int sbc_body_beam_count(sbc_world* w, int body);
uint32_t sbc_body_topology_version(sbc_world* w, int body);
void sbc_body_origin(sbc_world* w, int body, double* out3);
/* Pointers into the live SoA arrays (valid until the next step / topology change). */
const float* sbc_body_px(sbc_world* w, int body);
const float* sbc_body_py(sbc_world* w, int body);
const float* sbc_body_pz(sbc_world* w, int body);
const float* sbc_body_radius(sbc_world* w, int body);
const int32_t* sbc_body_beam_a(sbc_world* w, int body);
const int32_t* sbc_body_beam_b(sbc_world* w, int body);
/* Writes per-beam strain (L − L0)/L0 [-], NaN for broken beams. */
void sbc_body_beam_strain(sbc_world* w, int body, float* out);
/* Stability check (§4.2) at the world dt with safety s. Writes [min critical dt, beam violations, node violations]. */
void sbc_body_check_stability(sbc_world* w, int body, double safety, double* out3);

#ifdef __cplusplus
}
#endif

#endif /* SBC_SBC_H */
