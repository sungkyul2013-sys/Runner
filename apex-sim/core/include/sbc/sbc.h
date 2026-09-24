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
/* Damage groups (§4.3 glass/lamps, §4.4): count, id, and per group 8 floats [beams, damaged beams, first damage time
   [s] (−1: intact), first damage's node a, node b (a == b: an impact on that node), peak plastic strain, impacts, peak
   impact force [N]]; returns the floats written. */
int sbc_body_damage_group_count(sbc_world* w, int body);
const char* sbc_body_damage_group_id(sbc_world* w, int body, int group);
int sbc_body_damage_groups(sbc_world* w, int body, float* out, int capacity);
/* Island provenance: the body a split-off part came from (−1 for spawned bodies) and, per node, its index there. */
int sbc_body_source(sbc_world* w, int body);
const int32_t* sbc_body_source_nodes(sbc_world* w, int body);
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

/* ---- vehicles (§6–§10) ---- */
/* Spawns the procedural APEX Proto car (sbc/proto_car.h) with its model origin at (x, y, z), heading yaw [rad] about
   +Y and forward speed [m/s]. Returns the vehicle id, or −1. */
int sbc_world_spawn_proto_car(sbc_world* w, double x, double y, double z, double yaw, float speed);
/* Spawns a vehicle from "apex-vehicle" JSON text (docs/VEHICLE_FORMAT.md). Returns the vehicle id, or −1 on a parse /
   validation error (the message is available from sbc_last_error). */
int sbc_world_spawn_vehicle_json(sbc_world* w, const char* json, int length, double x, double y, double z, double yaw,
                                 float speed);
/* Message of the last failed call on this thread ("" if none). */
const char* sbc_last_error(void);
int sbc_world_vehicle_count(sbc_world* w);
int sbc_vehicle_body(sbc_world* w, int vehicle);
int sbc_vehicle_wheel_count(sbc_world* w, int vehicle);
/* mode: 0 drive, 1 reverse, 2 neutral, 3 manual; shift: +1 / −1 manual shift request; aids: bit 0 ABS, bit 1 TCS. */
int sbc_vehicle_set_input(sbc_world* w, int vehicle, float throttle, float brake, float steer, float handbrake,
                          int mode, int shift, int aids);
/* Packed telemetry: SBC_VT_HEADER floats, then SBC_VT_WHEEL floats per wheel (layout below). Returns the number of
   floats written, or −(floats needed) when capacity is too small. Positions are body-local (add sbc_body_origin). */
#define SBC_VT_HEADER 40
#define SBC_VT_WHEEL 20
/* header: 0 time, 1 speed [m/s], 2 engine rpm, 3 engine torque [N·m], 4 clutch torque, 5 gear (−1 R, 0 N),
   6 flags (1 shifting, 2 engine running, 4 TCS active), 7 throttle, 8 brake, 9 steer, 10 clutch, 11 accel long,
   12 accel lat [m/s²], 13 odometer [m], 14–16 chassis position, 17–19 forward, 20–22 up, 23–25 left,
   26–28 refCenter in the model frame, 29 wheel count, 30–31 reserved, §4.4: 32 coolant [°C], 33 coolant [L],
   34 oil pressure [bar], 35 oil [L], 36 fuel [L], 37 engine wear [0, 1], 38 power available [0, 1], 39 fault bits
   wheel: 0 spin [rad/s], 1 spin angle [rad], 2 load [N], 3 slip ratio, 4 slip angle [rad], 5 Fx, 6 Fy [N],
   7 brake torque, 8 drive torque [N·m], 9 loaded radius [m], 10 flags (1 contact, 2 ABS active), 11–13 centre,
   14–16 axis (points left), 17 tyre radius [m], 18–19 reserved */
int sbc_vehicle_telemetry(sbc_world* w, int vehicle, float* out, int capacity);

#ifdef __cplusplus
}
#endif

#endif /* SBC_SBC_H */
