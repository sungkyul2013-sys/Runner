/**
 * Dev-only verification that every layout template is **clearable** under the
 * game's real physics, and that no two pieces overlap.
 *
 * The walker steps the authoring grid one slot at a time carrying the player's
 * true state — which lane, what surface they are standing on (ballast, a low
 * carriage roof or a tall one) and whether a jump or roll is still in flight —
 * and applies the same rules the collision system does:
 *
 *   • a hurdle is only cleared while AIRBORNE, a gantry only while ROLLING,
 *   • a carriage can be boarded from below only when its roof is inside a
 *     standing jump's apex, so tall rakes need a ramp or another roof first,
 *   • ramps lift you to low-roof height, roofs can be run along, and stepping
 *     off one drops you to whatever is underneath,
 *   • a jump covers two slots and a roll one at the run's base speed.
 *
 * Exits non-zero if any template is unclearable or has overlapping pieces.
 */
import {
  BASE_SPEED,
  GRAVITY,
  JUMP_VELOCITY,
  LOW_ROOF,
  PLAYER_HALF_SLIDING,
  PLAYER_HALF_STANDING,
  SLIDE_DURATION,
  SLOT_LEN,
} from '../src/config/constants';
import { SPECS } from '../src/world/Obstacle';
import { buildGrid, type Cell } from '../src/world/SegmentManager';
import { TEMPLATES } from '../src/world/segments/templates';

const LANES = [-1, 0, 1] as const;

/** Peak of a standing jump. */
const APEX = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
/** Standing and rolling heights, for overhead clearance. */
const STAND_H = PLAYER_HALF_STANDING.y * 2;
const ROLL_H = PLAYER_HALF_SLIDING.y * 2;
/** Slots covered by a jump / roll at the run's *base* speed (worst case). */
const AIR_SLOTS = Math.max(1, Math.floor(((2 * JUMP_VELOCITY) / GRAVITY) * BASE_SPEED / SLOT_LEN));
const ROLL_SLOTS = Math.max(1, Math.floor((SLIDE_DURATION * BASE_SPEED) / SLOT_LEN));

type Carry = 'NONE' | 'AIR' | 'ROLL';

interface Step {
  /** Support height the player leaves this slot on, or null if they died. */
  height: number | null;
}

/**
 * Resolve entering `cell` from support height `h` in vertical state `vert`.
 * Returns the new support height, or null when the player would be hit.
 */
function step(cell: Cell, h: number, vert: Carry): Step {
  const onRoof = h > 0.01;

  // Whatever surface you end this slot on, your head has to fit under the
  // lowest thing overhead — that is what makes a bore or a roof gantry lethal.
  const fits = (surface: number): boolean =>
    surface + (vert === 'ROLL' ? ROLL_H : STAND_H) <= cell.ceiling + 0.01;

  if (onRoof) {
    if (Math.abs(cell.surface - h) < 0.01) {
      if (!fits(h)) return { height: null };
      return { height: h };
    }
    if (cell.surface > h + 0.01) {
      // A taller carriage alongside: only boardable mid-jump and within reach.
      if (vert === 'AIR' && cell.surface <= h + APEX && fits(cell.surface)) {
        return { height: cell.surface };
      }
      return { height: null };
    }
    // Dropping off the end of a deck.
    if (cell.surface > 0.01) return fits(cell.surface) ? { height: cell.surface } : { height: null };
    if (cell.blocked) return { height: null };
    if (cell.action !== 'none') return { height: null }; // no time to react on the way down
    return fits(0) ? { height: 0 } : { height: null };
  }

  // ── On the ballast ──
  if (cell.blocked) {
    if (cell.surface > 0.01) {
      // A rideable carriage: board it if a jump can actually reach the roof.
      if (vert === 'AIR' && cell.surface <= APEX && fits(cell.surface)) {
        return { height: cell.surface };
      }
      return { height: null };
    }
    return { height: null }; // pylon / buffer / express
  }
  if (!fits(0)) return { height: null }; // the ballast itself is too tight
  if (cell.action === 'jump') return vert === 'AIR' ? { height: 0 } : { height: null };
  if (cell.action === 'roll') return vert === 'ROLL' ? { height: 0 } : { height: null };
  // A ramp lifts you to its top by the time you leave the slot.
  if (cell.surface > 0.01) return fits(cell.surface) ? { height: cell.surface } : { height: null };
  return { height: 0 };
}

function clearable(grid: Cell[][], slots: number): boolean {
  const seen = new Set<string>();

  function dfs(slot: number, lane: number, h: number, carry: Carry, left: number): boolean {
    if (slot === slots) return true;
    const key = `${slot},${lane},${h.toFixed(2)},${carry},${left}`;
    if (seen.has(key)) return false;
    seen.add(key);

    for (const next of LANES) {
      if (Math.abs(next - lane) > 1) continue;
      const cell = grid[slot][next + 1];

      if (carry !== 'NONE') {
        // An action already in flight: honour it, no new action may start.
        const r = step(cell, h, carry);
        if (r.height === null) continue;
        const rest = left - 1;
        if (dfs(slot + 1, next, r.height, rest > 0 ? carry : 'NONE', Math.max(0, rest))) return true;
        continue;
      }

      // Grounded: stand, jump or roll.
      const stand = step(cell, h, 'NONE');
      if (stand.height !== null && dfs(slot + 1, next, stand.height, 'NONE', 0)) return true;

      const air = step(cell, h, 'AIR');
      if (air.height !== null
        && dfs(slot + 1, next, air.height, AIR_SLOTS > 1 ? 'AIR' : 'NONE', AIR_SLOTS - 1)) return true;

      const roll = step(cell, h, 'ROLL');
      if (roll.height !== null
        && dfs(slot + 1, next, roll.height, ROLL_SLOTS > 1 ? 'ROLL' : 'NONE', ROLL_SLOTS - 1)) return true;
    }
    return false;
  }

  // The player may enter a segment in any lane (positioned during the run-up).
  return LANES.some((l) => dfs(0, l, 0, 'NONE', 0));
}

/** Report any two pieces sharing a lane/slot cell. */
function overlaps(index: number): string[] {
  const t = TEMPLATES[index];
  const used = new Map<string, string>();
  const bad: string[] = [];
  for (const p of t.placements) {
    const spec = SPECS[p.kind];
    for (let s = p.slot; s < p.slot + spec.slots; s++) {
      // Overhead pieces deliberately share their cells with what runs beneath.
      const tag = p.kind === 'ROOF_GATE' || p.kind === 'TUNNEL' ? 'roof' : 'ground';
      const key = `${s}:${p.lane}:${tag}`;
      const prev = used.get(key);
      if (prev) bad.push(`slot ${s} lane ${p.lane}: ${prev} ↔ ${p.kind}`);
      else used.set(key, p.kind);
    }
    if (p.slot + spec.slots > t.slots) {
      bad.push(`${p.kind} at slot ${p.slot} runs past the template end (${t.slots})`);
    }
  }
  return bad;
}

let failures = 0;
console.log(`physics: apex ${APEX.toFixed(2)}u · jump covers ${AIR_SLOTS} slot(s) · roll covers ${ROLL_SLOTS} slot(s)`);
console.log(`heights: low roof ${LOW_ROOF}u — reachable from the ballast: ${APEX >= LOW_ROOF ? 'yes' : 'NO'}`);

TEMPLATES.forEach((t, i) => {
  const bad = overlaps(i);
  if (bad.length) {
    failures++;
    console.error(`✗ Template #${i} (d${t.difficulty}) has overlapping pieces:`);
    for (const b of bad) console.error(`   ${b}`);
  }
  if (!clearable(buildGrid(t), t.slots)) {
    failures++;
    console.error(`✗ Template #${i} (d${t.difficulty}) is UNCLEARABLE`);
    console.error(`   intended: ${t.safePath}`);
    console.error(`   placements: ${JSON.stringify(t.placements)}`);
  }
});

if (failures === 0) {
  console.log(`✓ All ${TEMPLATES.length} layout templates are clearable and non-overlapping.`);
  process.exit(0);
} else {
  console.error(`\n${failures} template check(s) failed.`);
  process.exit(1);
}
