// Terrain heightfield (§13.4 지형 파이프라인): a regular grid of heights with one surface material per cell. The
// generator fills it from a height function, then roads cut and fill it (embankments) and lower it under their
// ribbons; the physics core collides with exactly these triangles (two per cell, split along the (x0,z0)–(x1,z1)
// diagonal) and the renderer draws the same ones.
import { MAT, type HeightfieldData } from './types';

export class Terrain implements HeightfieldData {
  readonly heights: Float32Array;
  readonly materials: Uint8Array;
  /** Samples a road or pad has claimed (their height is final: later embankments leave them alone). */
  readonly locked: Uint8Array;

  constructor(readonly originX: number, readonly originZ: number, readonly cell: number, readonly nx: number, readonly nz: number) {
    this.heights = new Float32Array((nx + 1) * (nz + 1));
    this.materials = new Uint8Array(nx * nz).fill(MAT.grass);
    this.locked = new Uint8Array((nx + 1) * (nz + 1));
  }

  get width(): number {
    return this.nx * this.cell;
  }
  get depth(): number {
    return this.nz * this.cell;
  }

  /** Fills every sample from f(x, z). */
  fill(f: (x: number, z: number) => number): void {
    const row = this.nx + 1;
    for (let iz = 0; iz <= this.nz; iz++) {
      const z = this.originZ + iz * this.cell;
      for (let ix = 0; ix <= this.nx; ix++) this.heights[iz * row + ix] = f(this.originX + ix * this.cell, z);
    }
  }

  sampleIndex(ix: number, iz: number): number {
    return iz * (this.nx + 1) + ix;
  }

  /** Height of the surface at (x, z): the two-triangle interpolation the physics uses. Outside: clamped to the edge. */
  heightAt(x: number, z: number): number {
    const fx = (x - this.originX) / this.cell, fz = (z - this.originZ) / this.cell;
    const ix = Math.min(Math.max(Math.floor(fx), 0), this.nx - 1), iz = Math.min(Math.max(Math.floor(fz), 0), this.nz - 1);
    const u = Math.min(Math.max(fx - ix, 0), 1), v = Math.min(Math.max(fz - iz, 0), 1);
    const row = this.nx + 1;
    const i = iz * row + ix;
    const h00 = this.heights[i], h10 = this.heights[i + 1], h01 = this.heights[i + row], h11 = this.heights[i + row + 1];
    // Triangles (00, 01, 11) where v ≥ u and (00, 11, 10) where u > v.
    return v >= u ? h00 + (h11 - h01) * u + (h01 - h00) * v : h00 + (h10 - h00) * u + (h11 - h10) * v;
  }

  /** Unit normal of the surface at (x, z) (from the four surrounding samples). */
  normalAt(x: number, z: number, out: [number, number, number] = [0, 1, 0]): [number, number, number] {
    const e = this.cell;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    const l = Math.hypot(dx, 1, dz);
    out[0] = -dx / l;
    out[1] = 1 / l;
    out[2] = -dz / l;
    return out;
  }

  materialAt(x: number, z: number): number {
    const ix = Math.floor((x - this.originX) / this.cell), iz = Math.floor((z - this.originZ) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return MAT.grass;
    return this.materials[iz * this.nx + ix];
  }

  /** Visits the samples inside the world rectangle [x0, x1] × [z0, z1]. */
  forSamples(x0: number, z0: number, x1: number, z1: number, f: (index: number, x: number, z: number) => void): void {
    const ix0 = Math.max(0, Math.ceil((x0 - this.originX) / this.cell)), ix1 = Math.min(this.nx, Math.floor((x1 - this.originX) / this.cell));
    const iz0 = Math.max(0, Math.ceil((z0 - this.originZ) / this.cell)), iz1 = Math.min(this.nz, Math.floor((z1 - this.originZ) / this.cell));
    const row = this.nx + 1;
    for (let iz = iz0; iz <= iz1; iz++) {
      const z = this.originZ + iz * this.cell;
      for (let ix = ix0; ix <= ix1; ix++) f(iz * row + ix, this.originX + ix * this.cell, z);
    }
  }

  /** Visits the cells overlapping the world rectangle. */
  forCells(x0: number, z0: number, x1: number, z1: number, f: (cell: number, cx: number, cz: number) => void): void {
    const ix0 = Math.max(0, Math.floor((x0 - this.originX) / this.cell)), ix1 = Math.min(this.nx - 1, Math.floor((x1 - this.originX) / this.cell));
    const iz0 = Math.max(0, Math.floor((z0 - this.originZ) / this.cell)), iz1 = Math.min(this.nz - 1, Math.floor((z1 - this.originZ) / this.cell));
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) f(iz * this.nx + ix, this.originX + (ix + 0.5) * this.cell, this.originZ + (iz + 0.5) * this.cell);
    }
  }

  data(): HeightfieldData {
    return { originX: this.originX, originZ: this.originZ, cell: this.cell, nx: this.nx, nz: this.nz, heights: this.heights, materials: this.materials };
  }
}
