// Map data shared by the generator, the physics upload and the renderer (§13). Everything is plain typed arrays so a
// map can be transferred to the physics worker without copies.
import type { Localized as Label } from '../ui/i18n';

/** Core surface material ids (core/include/sbc/scenes.h, §11.1 library order). */
export const MAT = {
  concrete: 1,
  asphalt: 3,
  asphaltOld: 5,
  asphaltWet: 6,
  cobble: 7,
  cobbleWet: 8,
  gravel: 9,
  gravelTrap: 10,
  washboard: 11,
  dirt: 12,
  mud: 13,
  sand: 14,
  grass: 15,
  grassWet: 16,
  snowPacked: 17,
  snowFresh: 18,
  ice: 19,
  steel: 20,
  steelWet: 21,
  wood: 22,
  paint: 23,
  paintWet: 24,
  hole: 255,
} as const;

export interface HeightfieldData {
  originX: number;
  originZ: number;
  cell: number;
  nx: number;
  nz: number;
  heights: Float32Array; // (nx + 1)(nz + 1), x fastest
  materials: Uint8Array; // nx · nz, MAT id or MAT.hole
}

/** One physics triangle mesh (one material), vertices relative to `origin`. */
export interface StaticMeshData {
  origin: [number, number, number];
  vertices: Float32Array;
  indices: Int32Array;
  material: number;
}

/** A map's physics part, as sent to the worker. */
export interface MapPhysics {
  heightfield: HeightfieldData;
  meshes: StaticMeshData[];
}

export type PoiKind = 'spawn' | 'city' | 'landmark' | 'test' | 'service' | 'scenic';

/** Point of interest: a teleport / spawn point on the world map (§13.1 지도에서 텔레포트, 스폰 포인트). */
export interface Poi {
  id: string;
  label: Label;
  kind: PoiKind;
  x: number;
  z: number;
  yaw: number; // heading [rad] (0: +z, like the vehicle spawn)
  y?: number;
}

/** Named area label for the maps (district names). */
export interface AreaLabel {
  label: Label;
  x: number;
  z: number;
  size: number; // 0 small … 2 large
}
