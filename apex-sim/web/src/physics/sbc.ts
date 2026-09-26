// Typed view of the SoftBodyCore WASM module (C ABI in core/include/sbc/sbc.h).
export type Ptr = number;

export interface SbcModule {
  wasmMemory: WebAssembly.Memory;
  _malloc(bytes: number): Ptr;
  _free(ptr: Ptr): void;
  _sbc_world_create(threads: number, trackEnergy: number): Ptr;
  _sbc_world_create_scene(name: Ptr, threads: number, trackEnergy: number, bodies: number): Ptr;
  _sbc_world_destroy(w: Ptr): void;
  _sbc_world_set_gravity(w: Ptr, gx: number, gy: number, gz: number): void;
  _sbc_world_set_contact_pair(w: Ptr, a: number, b: number, mus: number, muk: number, hz: number, zeta: number): number;
  _sbc_world_add_ground_plane(w: Ptr, height: number, material: number): number;
  _sbc_world_add_static_box(
    w: Ptr, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw: number, material: number,
  ): number;
  _sbc_world_add_static_mesh(w: Ptr, ox: number, oy: number, oz: number, vertices: Ptr, vertexCount: number, indices: Ptr, indexCount: number, material: number): number;
  _sbc_world_set_heightfield(w: Ptr, ox: number, oz: number, cell: number, nx: number, nz: number, heights: Ptr, materials: Ptr): number;
  _sbc_world_set_material_remap(w: Ptr, from: number, to: number): number;
  _sbc_world_set_wind(w: Ptr, x: number, y: number, z: number): void;
  _sbc_world_static_triangle_count(w: Ptr): number;
  _sbc_world_static_triangles(w: Ptr, first: number, count: number, out: Ptr): number;
  _sbc_world_spawn_lattice(w: Ptr, params: Ptr, count: number): number;
  _sbc_world_static_triangle_materials(w: Ptr, first: number, count: number, out: Ptr): number;
  _sbc_world_add_body_velocity(w: Ptr, body: number, dvx: number, dvy: number, dvz: number): number;
  _sbc_world_retire_family(w: Ptr, body: number): number;
  _sbc_world_relaunch_vehicle(w: Ptr, vehicle: number, x: number, y: number, z: number, yaw: number, speed: number, floorY: number): number;
  _sbc_world_add_tether(w: Ptr, body: number, node: number, anchorBody: number, anchorNode: number, x: number, y: number, z: number, length: number, rope: number, maxForce: number, reelSpeed: number): number;
  _sbc_world_set_tether_anchor(w: Ptr, id: number, x: number, y: number, z: number): number;
  _sbc_world_set_tether_length(w: Ptr, id: number, length: number): number;
  _sbc_world_remove_tether(w: Ptr, id: number): number;
  _sbc_world_tether_count(w: Ptr): number;
  _sbc_world_tether_state(w: Ptr, id: number, out: Ptr): number;
  _sbc_world_step(w: Ptr, steps: number): void;
  _sbc_world_time(w: Ptr): number;
  _sbc_world_step_index(w: Ptr): number;
  _sbc_world_dt(w: Ptr): number;
  _sbc_world_state_hash_hi(w: Ptr): number;
  _sbc_world_state_hash_lo(w: Ptr): number;
  _sbc_world_last_stats(w: Ptr, out4: Ptr): void;
  _sbc_world_measure_energy(w: Ptr, out: Ptr): void;
  _sbc_world_measure_momentum(w: Ptr, out6: Ptr): void;
  _sbc_world_body_count(w: Ptr): number;
  _sbc_body_node_count(w: Ptr, body: number): number;
  _sbc_body_beam_count(w: Ptr, body: number): number;
  _sbc_body_topology_version(w: Ptr, body: number): number;
  _sbc_body_source(w: Ptr, body: number): number;
  _sbc_body_damage_group_count(w: Ptr, body: number): number;
  _sbc_body_damage_group_id(w: Ptr, body: number, group: number): Ptr;
  _sbc_body_damage_groups(w: Ptr, body: number, out: Ptr, capacity: number): number;
  _sbc_body_source_nodes(w: Ptr, body: number): Ptr;
  _sbc_body_origin(w: Ptr, body: number, out3: Ptr): void;
  _sbc_body_px(w: Ptr, body: number): Ptr;
  _sbc_body_py(w: Ptr, body: number): Ptr;
  _sbc_body_pz(w: Ptr, body: number): Ptr;
  _sbc_body_radius(w: Ptr, body: number): Ptr;
  _sbc_body_beam_a(w: Ptr, body: number): Ptr;
  _sbc_body_beam_b(w: Ptr, body: number): Ptr;
  _sbc_body_beam_strain(w: Ptr, body: number, out: Ptr): void;
  _sbc_body_check_stability(w: Ptr, body: number, safety: number, out3: Ptr): void;
  // vehicles (§6–§10)
  _sbc_world_spawn_proto_car(w: Ptr, x: number, y: number, z: number, yaw: number, speed: number): number;
  _sbc_world_spawn_vehicle_json(w: Ptr, json: Ptr, length: number, x: number, y: number, z: number, yaw: number, speed: number): number;
  _sbc_last_error(): Ptr;
  _sbc_world_vehicle_count(w: Ptr): number;
  _sbc_vehicle_body(w: Ptr, vehicle: number): number;
  _sbc_vehicle_wheel_count(w: Ptr, vehicle: number): number;
  _sbc_vehicle_set_input(
    w: Ptr, vehicle: number, throttle: number, brake: number, steer: number, handbrake: number, mode: number, shift: number, aids: number,
  ): number;
  _sbc_vehicle_telemetry(w: Ptr, vehicle: number, out: Ptr, capacity: number): number;
}

/** Reads a NUL-terminated UTF-8 string out of WASM memory. */
export function readCString(memory: ArrayBufferLike, ptr: Ptr, max = 4096): string {
  if (!ptr) return '';
  const bytes = new Uint8Array(memory, ptr, Math.min(max, memory.byteLength - ptr));
  const end = bytes.indexOf(0);
  return new TextDecoder().decode(bytes.slice(0, end < 0 ? bytes.length : end));
}

export type SbcFactory = (options?: { locateFile?: (path: string) => string }) => Promise<SbcModule>;

/** Order of the lattice parameter block (SBC_LATTICE_PARAM_COUNT = 24, see sbc.h). */
export interface LatticeParams {
  center: [number, number, number]; // [m]
  size: [number, number, number]; // [m]
  nodes: [number, number, number]; // nodes per axis
  totalMass: number; // [kg]
  nodeRadius: number; // [m]
  axialStiffness: number; // EA [N]
  dampingRatio: number; // [-]
  yieldStrain: number; // [-] 0 = elastic
  hardening: number; // [-]
  breakStrain: number; // [-] 0 = unbreakable
  deformLimit: number; // [-] 0 = off
  material: number;
  velocity: [number, number, number]; // [m/s]
  yawPitchRoll: [number, number, number]; // [rad]
}

export const LATTICE_PARAM_COUNT = 24;

export function packLattice(p: LatticeParams): Float64Array {
  return Float64Array.from([
    ...p.center,
    ...p.size,
    ...p.nodes,
    p.totalMass,
    p.nodeRadius,
    p.axialStiffness,
    p.dampingRatio,
    p.yieldStrain,
    p.hardening,
    p.breakStrain,
    p.deformLimit,
    p.material,
    ...p.velocity,
    ...p.yawPitchRoll,
  ]);
}
