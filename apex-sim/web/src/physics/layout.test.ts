import { describe, expect, it } from 'vitest';
import { createControl, TripleBufferReader, TripleBufferWriter } from './layout';

describe('triple buffer', () => {
  it('never hands the reader the slot the writer owns and always delivers the newest frame', () => {
    const ctrl = createControl(false);
    const w = new TripleBufferWriter(ctrl);
    const r = new TripleBufferReader(ctrl);
    const slots = [0, 0, 0];

    expect(r.acquire()).toBe(false); // nothing published yet

    slots[w.slot] = 1;
    w.publish();
    slots[w.slot] = 2; // writer keeps going before the reader looks
    w.publish();
    expect(r.acquire()).toBe(true);
    expect(slots[r.slot]).toBe(2); // newest, frame 1 was superseded
    expect(r.acquire()).toBe(false); // no newer frame

    for (let frame = 3; frame < 50; frame++) {
      slots[w.slot] = frame;
      expect(w.slot).not.toBe(r.slot);
      w.publish();
      if (frame % 3 === 0) {
        expect(r.acquire()).toBe(true);
        expect(slots[r.slot]).toBe(frame);
      }
    }
  });
});
