import { describe, expect, it } from 'vitest';
import { decodeDamage, matchPieces, panelLook, PanelState, rimDistance, splitPieces, type DamageGroupDef, type DamageStatus } from './Damage';

// Two unit quads (4 triangles on a 3 × 3 grid each) 2 m apart, the second as a non-indexed copy of the first's seam
// vertices: pieces join by shared index or by position.
function grid(x0: number): { pos: number[]; index: number[] } {
  const pos: number[] = [], index: number[] = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) pos.push(x0 + i * 0.5, j * 0.5, 0);
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const a = j * 3 + i;
      index.push(a, a + 1, a + 4, a, a + 4, a + 3);
    }
  }
  return { pos, index };
}

describe('damage groups on the flexbody', () => {
  const A = grid(0), B = grid(2);
  const pos = [...A.pos, ...B.pos];
  const index = [...A.index, ...B.index.map((i) => i + 9)];

  it('splits a mesh into its connected pieces with area-weighted centroids', () => {
    const { triPiece, centroids, areas } = splitPieces(pos, index);
    expect(new Set(triPiece).size).toBe(2);
    expect(areas[0]).toBeCloseTo(1, 12);
    expect(centroids[0]).toEqual([0.5, 0.5, 0]);
    expect(centroids[1][0]).toBeCloseTo(2.5, 12);
  });

  it('matches pieces to the groups that list their centroids, by kind', () => {
    const { centroids } = splitPieces(pos, index);
    const defs: DamageGroupDef[] = [
      { id: 'lamp', visual: { kind: 'lamp', pieces: [[0.5, 0.5, 0]] } },
      { id: 'glass', visual: { kind: 'glass', glass: 'tempered', pieces: [[2.505, 0.5, 0]] } },
    ];
    expect(matchPieces(centroids, defs, 'glass')).toEqual([-1, 1]);
    expect(matchPieces(centroids, defs, 'lamp')).toEqual([0, -1]);
  });

  it('measures the distance from a pane rim (0 on the rim, 1 in the middle)', () => {
    const { triPiece } = splitPieces(A.pos, A.index);
    const d = rimDistance(A.pos, A.index, triPiece, new Set([0]));
    expect(d[4]).toBe(1);                   // the centre vertex
    for (const rim of [0, 1, 2, 3, 5, 6, 7, 8]) expect(d[rim]).toBe(0);
  });

  it('decides the look: laminated cracks and sags, tempered and lamps break', () => {
    const status = (damaged: number, impacts = 0): DamageStatus => ({ beams: 100, damaged, time: 1, nodeA: 3, nodeB: 4, peakStrain: 0.01, impacts, peakImpact: 0 });
    const laminated: DamageGroupDef = { id: 'w', visual: { kind: 'glass', glass: 'laminated', pieces: [] } };
    const tempered: DamageGroupDef = { id: 's', visual: { kind: 'glass', glass: 'tempered', pieces: [] } };
    const lamp: DamageGroupDef = { id: 'l', visual: { kind: 'lamp', pieces: [] } };
    expect(panelLook(laminated, status(0)).state).toBe(PanelState.Intact);
    const light = panelLook(laminated, status(2));
    expect(light.state).toBe(PanelState.Cracked);
    expect(light.sag).toBe(0);
    const heavy = panelLook(laminated, status(60));
    expect(heavy.crackRadius).toBeGreaterThan(light.crackRadius);
    expect(heavy.sag).toBeGreaterThan(0);
    expect(panelLook(tempered, status(1)).state).toBe(PanelState.Broken);
    expect(panelLook(lamp, status(0, 1)).state).toBe(PanelState.Broken);
    expect(panelLook(lamp, undefined).state).toBe(PanelState.Intact);
  });

  it('decodes the core layout (8 floats per group)', () => {
    const d = decodeDamage(new Float32Array([10, 2, 0.5, 7, 8, 0.02, 1, 12000, 5, 0, -1, -1, -1, 0, 0, 0]));
    expect(d.length).toBe(2);
    expect(d[0]).toEqual({ beams: 10, damaged: 2, time: 0.5, nodeA: 7, nodeB: 8, peakStrain: expect.closeTo(0.02, 6), impacts: 1, peakImpact: 12000 });
    expect(d[1].time).toBe(-1);
  });
});
