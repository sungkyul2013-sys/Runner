import { describe, expect, it } from 'vitest';
import { buildProving } from './maps/proving';
import { nextManeuver, Router } from './Route';

describe('route guidance (§13.1)', () => {
  it('plans along the road graph and names the next turn', () => {
    const m = buildProving();
    const r = new Router(m.graph);
    const gate = m.pois.find((p) => p.id === 'gate')!;
    const pad = m.pois.find((p) => p.id === 'pad')!;
    const plan = r.plan(gate.x, gate.z, pad.x, pad.z);
    expect(plan).not.toBeNull();
    // Longer than the straight line, shorter than a detour around the whole map.
    const straight = Math.hypot(pad.x - gate.x, pad.z - gate.z);
    expect(plan!.length).toBeGreaterThan(straight * 0.99);
    expect(plan!.length).toBeLessThan(straight * 2.2);
    const m0 = nextManeuver(plan!, gate.x, gate.z);
    expect(m0.remaining).toBeGreaterThan(straight * 0.9);
    expect(['left', 'right', 'straight', 'uturn', 'arrive']).toContain(m0.turn);
  }, 60000);
});
