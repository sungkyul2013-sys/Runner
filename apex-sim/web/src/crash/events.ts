// Collision event log (§5.3 디버그 패널: 시각, 위치, 상대 속도, 최대 힘, 흡수 에너지, 최대 감속 G). Each car's crash
// sensor segments its own events (core Vehicle, telemetry crashEvents / event*); events of two cars that begin
// within 30 ms of each other are one collision between them, an event of one car alone is a hit on the world
// (barrier, ground). Rows update while their events are open.
import type { V3, VehicleState } from '../physics/telemetry';

export interface CarEvent {
  car: string;      // label
  index: number;    // the car's event number (1…)
  active: boolean;
  start: number;    // [s]
  position: V3;     // render space
  velocity: V3;     // [m/s] at the start
  speed: number;    // [m/s] at the start
  peakG: number;
  peakForce: number; // [N]
  deltaV: number;   // [m/s]
  absorbed: number; // [J]
}

export interface CollisionRow {
  time: number;          // [s]
  position: V3;
  cars: string[];        // one car: a hit on the world; two: car-to-car
  relativeSpeed: number; // [m/s] closing speed at the start (the car's own speed against the world)
  peakForce: number;     // [N] largest of the cars'
  absorbed: number;      // [J] summed over the cars
  peakG: number[];       // per car
  active: boolean;
}

const PAIR_WINDOW = 0.03; // [s]
// A car settling after the crash (its crushed nose dropping onto the road, a rebound bump) opens a sensor event too;
// rows whose cars all changed speed by less than an event data recorder's threshold (Δv 8 km/h) and absorbed next to
// nothing are bumps, not collisions, and are left out of the log.
const MIN_DELTA_V = 8 / 3.6; // [m/s]
const MIN_ABSORBED = 1000;   // [J]

export class EventLog {
  private events: CarEvent[] = [];

  clear(): void {
    this.events = [];
  }

  /** Takes a car's latest state; returns true when something changed. */
  observe(car: string, v: VehicleState): boolean {
    if (v.crashEvents <= 0) return false;
    const e: CarEvent = {
      car,
      index: v.crashEvents,
      active: v.eventActive,
      start: v.eventStart,
      position: v.eventPosition,
      velocity: v.eventVelocity,
      speed: v.eventSpeed,
      peakG: v.eventPeakG,
      peakForce: v.eventPeakForce,
      deltaV: v.eventDeltaV,
      absorbed: v.eventAbsorbed,
    };
    const at = this.events.findIndex((x) => x.car === car && x.index === e.index);
    if (at < 0) {
      this.events.push(e);
      return true;
    }
    const old = this.events[at];
    const changed = old.active !== e.active || old.peakG !== e.peakG || old.absorbed !== e.absorbed;
    this.events[at] = e;
    return changed;
  }

  rows(): CollisionRow[] {
    const byTime = [...this.events].sort((a, b) => a.start - b.start || a.car.localeCompare(b.car));
    const used = new Set<CarEvent>();
    const rows: CollisionRow[] = [];
    for (const e of byTime) {
      if (used.has(e)) continue;
      used.add(e);
      const partner = byTime.find((o) => !used.has(o) && o.car !== e.car && Math.abs(o.start - e.start) <= PAIR_WINDOW);
      if (partner) used.add(partner);
      const group = partner ? [e, partner] : [e];
      if (!group.some((g) => g.active) && group.every((g) => g.deltaV < MIN_DELTA_V && g.absorbed < MIN_ABSORBED)) continue;
      const rel = partner
        ? Math.hypot(e.velocity[0] - partner.velocity[0], e.velocity[1] - partner.velocity[1], e.velocity[2] - partner.velocity[2])
        : e.speed;
      rows.push({
        time: Math.min(...group.map((g) => g.start)),
        position: partner ? (e.position.map((c, k) => (c + partner.position[k]) / 2) as V3) : e.position,
        cars: group.map((g) => g.car),
        relativeSpeed: rel,
        peakForce: Math.max(...group.map((g) => g.peakForce)),
        absorbed: group.reduce((sum, g) => sum + g.absorbed, 0),
        peakG: group.map((g) => g.peakG),
        active: group.some((g) => g.active),
      });
    }
    return rows;
  }
}
