import { describe, expect, it } from 'vitest';
import { DEFAULT_TOUCH_LAYOUT, normalizeLayout, pedalAmount, resolveThrottle, sliderToSteer, tiltToSteer, wheelAngleToSteer } from './TouchControls';

describe('touch controls (§15.4) — pure logic', () => {
  it('pedal amount follows the finger up the pedal, or a real force', () => {
    expect(pedalAmount(200, 100, 100)).toBeCloseTo(0.25, 6);  // bottom edge
    expect(pedalAmount(100, 100, 100)).toBeCloseTo(1, 6);     // top edge
    expect(pedalAmount(150, 100, 100)).toBeCloseTo(0.625, 6);
    expect(pedalAmount(200, 100, 100, 0.8)).toBeCloseTo(0.8, 6);
    expect(pedalAmount(200, 100, 100, 0.5)).toBeCloseTo(0.25, 6); // 0.5 = no sensor (mouse, most touch screens)
  });

  it('wheel and slider map to steer with positive = left and clamp', () => {
    expect(wheelAngleToSteer(-1.05)).toBeCloseTo(0.5, 6);       // wheel turned left (counter-clockwise)
    expect(wheelAngleToSteer(5)).toBe(-1);
    expect(sliderToSteer(-40, 80)).toBeCloseTo(0.5, 6);         // finger left of centre
    expect(sliderToSteer(200, 80)).toBe(-1);
    expect(sliderToSteer(10, 0)).toBe(0);
  });

  it('tilt: a dead zone around level, full lock at 30° of roll, sign follows the screen rotation', () => {
    expect(tiltToSteer(0, 0, 90)).toBe(0);
    const a = tiltToSteer(0, 20, 90);
    const b = tiltToSteer(0, -20, 90);
    expect(Math.abs(a)).toBeGreaterThan(0.5);
    expect(Math.sign(a)).toBe(-Math.sign(b));
    expect(Math.abs(tiltToSteer(0, 60, 90))).toBe(1);
    expect(Math.abs(tiltToSteer(0, 2, 90))).toBe(0); // inside the dead zone
  });

  it('auto-accelerate holds the throttle unless braking', () => {
    expect(resolveThrottle(0, 0, true)).toBe(1);
    expect(resolveThrottle(0, 0.5, true)).toBe(0);
    expect(resolveThrottle(0.3, 0, false)).toBe(0.3);
  });

  it('stored layouts are cleaned: unknown modes fall back, sizes clamp, bad offsets are dropped', () => {
    const l = normalizeLayout({ steer: 'joystick', size: 9, opacity: 0, positions: { throttle: { x: 5, y: -3 }, brake: { x: 'a' } } });
    expect(l.steer).toBe(DEFAULT_TOUCH_LAYOUT.steer);
    expect(l.size).toBe(1.5);
    expect(l.opacity).toBe(0.2);
    expect(l.positions).toEqual({ throttle: { x: 5, y: -3 } });
    expect(normalizeLayout(null)).toEqual(DEFAULT_TOUCH_LAYOUT);
  });
});
