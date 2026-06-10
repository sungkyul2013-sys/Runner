/**
 * Dev-only verification: proves every segment template is *clearable* under the
 * real jump/slide physics. Models a player traversing the 5 slots choosing a
 * lane (±1 change/slot) and actions, where:
 *   - BARRIER (low)   is cleared only while AIRBORNE (jump),
 *   - TUNNEL  (high)  is cleared only while DUCKING (slide),
 *   - TRAIN / WALL    can never be passed (must be in another lane).
 * Jump and slide each cover the start slot plus one following slot (apex /
 * slide duration span ≈ 1.5 slots at run speed). Moving trains are treated as
 * static for lane-occupancy (their drift is only along lanes the safe path
 * already avoids). Exits non-zero if any template is unclearable.
 */
import { ObstacleKind } from '../src/world/Obstacle';
import { TEMPLATES } from '../src/world/segments/templates';

const SLOTS = 5;
const LANES = [-1, 0, 1] as const;

type Vert = 'NORMAL' | 'AIR' | 'DUCK';

function kindAt(
  placements: { slot: number; lane: number; kind: ObstacleKind }[],
  slot: number,
  lane: number,
): ObstacleKind | null {
  for (const p of placements) if (p.slot === slot && p.lane === lane) return p.kind;
  return null;
}

/** Can a cell be survived given the player's vertical state this slot? */
function survives(kind: ObstacleKind | null, vert: Vert): boolean {
  switch (kind) {
    case null:
    case ObstacleKind.LOW_TRAIN: // run up its front ramp onto the roof — always passable
    case ObstacleKind.CRATE: // small ramp — boardable on the run
      return true;
    case ObstacleKind.BARRIER:
      return vert === 'AIR';
    case ObstacleKind.TUNNEL:
    case ObstacleKind.SIGN: // slide under
      return vert === 'DUCK';
    default: // TRAIN, TRAIN_MOVING, WALL
      return false;
  }
}

/** DFS over (slot, lane, carry) where carry = airborne/sliding spill-over. */
function clearable(
  placements: { slot: number; lane: number; kind: ObstacleKind }[],
): boolean {
  type Carry = 'NONE' | 'AIR' | 'DUCK';
  const seen = new Set<string>();

  function dfs(slot: number, lane: number, carry: Carry): boolean {
    if (slot === SLOTS) return true;
    const key = `${slot},${lane},${carry}`;
    if (seen.has(key)) return false;
    seen.add(key);

    for (const next of LANES) {
      if (Math.abs(next - lane) > 1) continue;

      // Option A: honour an in-progress action (carry) — no new action allowed.
      if (carry !== 'NONE') {
        const vert: Vert = carry === 'AIR' ? 'AIR' : 'DUCK';
        if (survives(kindAt(placements, slot, next), vert)) {
          if (dfs(slot + 1, next, 'NONE')) return true; // carry ends after 2nd slot
        }
        continue; // can't start a new action mid-air/mid-slide
      }

      // Option B: grounded — try standing, jumping, or sliding.
      // Stand.
      if (survives(kindAt(placements, slot, next), 'NORMAL') && dfs(slot + 1, next, 'NONE'))
        return true;
      // Jump (covers this slot + next).
      if (survives(kindAt(placements, slot, next), 'AIR') && dfs(slot + 1, next, 'AIR'))
        return true;
      // Slide (covers this slot + next).
      if (survives(kindAt(placements, slot, next), 'DUCK') && dfs(slot + 1, next, 'DUCK'))
        return true;
    }
    return false;
  }

  // The player may enter the segment in any lane (positioned during prior gaps).
  return LANES.some((l) => dfs(0, l, 'NONE'));
}

let failures = 0;
TEMPLATES.forEach((t, i) => {
  const ok = clearable(t.placements);
  if (!ok) {
    failures++;
    console.error(`✗ Template #${i} (difficulty ${t.difficulty}) is UNCLEARABLE`);
    console.error(`   intended: ${t.safePath}`);
    console.error(`   placements: ${JSON.stringify(t.placements)}`);
  }
});

if (failures === 0) {
  console.log(`✓ All ${TEMPLATES.length} segment templates are clearable.`);
  process.exit(0);
} else {
  console.error(`\n${failures} template(s) failed the clearability check.`);
  process.exit(1);
}
