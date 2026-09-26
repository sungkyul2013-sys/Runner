import { describe, expect, it } from 'vitest';
import { DriveLogic, steerLimit, type RawControls } from './DriveInput';

const pad = (steer: number): RawControls => ({ throttle: 0, brake: 0, steer, handbrake: 0, analogSteer: true });

describe('speed-sensitive steering (§15.2)', () => {
  it('keeps full lock for parking and narrows to the grip limit at speed', () => {
    expect(steerLimit(2)).toBe(1);
    const at100 = steerLimit(100 / 3.6), at200 = steerLimit(200 / 3.6);
    // L·a/v² + α over the lock: ≈ 0.23 at 100 km/h, ≈ 0.18 at 200 km/h for a 2.8 m car with a 0.5 rad lock
    expect(at100).toBeGreaterThan(0.18);
    expect(at100).toBeLessThan(0.3);
    expect(at200).toBeLessThan(at100);
    expect(steerLimit(100 / 3.6, 'beginner')).toBeLessThan(at100);
    expect(steerLimit(100 / 3.6, 'sim')).toBe(1);
  });

  it('smooths a thumb or stick instead of jumping', () => {
    const logic = new DriveLogic();
    const first = logic.update(1 / 60, 20, pad(1)).steer;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.2); // not the whole limit in one frame
    let s = first;
    for (let i = 0; i < 60; i++) s = logic.update(1 / 60, 20, pad(1)).steer;
    expect(s).toBeCloseTo(steerLimit(20), 2);
  });

  it('lets a countersteer use the whole lock', () => {
    const logic = new DriveLogic();
    let s = 0;
    // The car yaws left fast (a slide): steering right is a countersteer.
    for (let i = 0; i < 60; i++) s = logic.update(1 / 60, 30, pad(-1), 0.6).steer;
    expect(s).toBeLessThan(-0.9);
    for (let i = 0; i < 60; i++) s = logic.update(1 / 60, 30, pad(-1), 0).steer;
    expect(s).toBeGreaterThan(-0.3); // no slide: back within the grip limit
  });

  it('presets set the aids', () => {
    const logic = new DriveLogic();
    logic.setAssist('sim');
    expect([logic.abs, logic.tcs, logic.esc]).toEqual([false, false, false]);
    logic.setAssist('beginner');
    expect([logic.abs, logic.tcs, logic.esc, logic.manual]).toEqual([true, true, true, false]);
    expect(logic.update(1 / 60, 10, pad(0)).esc).toBe(true);
  });
});
