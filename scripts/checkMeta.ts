/**
 * Dev-only verification of the meta layer's pure logic (no DOM/WebGL):
 * save defaults + guarded persistence, the coin economy, mission completion &
 * rotation, and ability/upgrade math. Exits non-zero on any failed assertion.
 * (localStorage is absent under Node; SaveManager's guards fall back to defaults.)
 */
import { abilityMagnitude, CHARACTERS } from '../src/data/characters';
import { powerupDurationMult, abilityPotionCost } from '../src/data/potions';
import { SaveManager } from '../src/data/SaveManager';
import { MissionSystem } from '../src/systems/MissionSystem';

let failures = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    failures++;
    console.error(`✗ ${name}`);
  }
}

// ── Save defaults ──
const save = new SaveManager();
check('owns default character nova', save.ownsCharacter('nova'));
check('selected is nova', save.data.selectedCharacter === 'nova');
check('starts with 0 coins', save.data.totalCoins === 0);
check('has 3 missions', save.data.missions.length === 3);
check('default cosmetics owned', save.ownsCosmetic('hair-none') && save.ownsCosmetic('outfit-classic'));

// ── Economy ──
save.addCoins(1000);
check('coins added', save.data.totalCoins === 1000);
check('affordable spend succeeds', save.spend(400) === true);
check('balance after spend', save.data.totalCoins === 600);
check('overspend rejected', save.spend(99999) === false && save.data.totalCoins === 600);

// ── Ability + upgrade math ──
const nova = CHARACTERS[0];
check('ability grows with level', abilityMagnitude(nova.ability, 2) > abilityMagnitude(nova.ability, 0));
check('powerup duration mult grows', powerupDurationMult(2) > powerupDurationMult(0));
check('ability potion cost grows', abilityPotionCost(1) > abilityPotionCost(0));

// ── Missions: a big coin haul completes the coins mission and rotates it ──
const missions = new MissionSystem(save);
const coinsMissionBefore = save.data.missions.find((m) => m.kind === 'coins')!;
const targetBefore = coinsMissionBefore.target;
const completed = missions.applyRun(targetBefore + 10, 100, 0);
check('coins mission completed', completed.some((m) => m.kind === 'coins'));
const coinsMissionAfter = save.data.missions.find((m) => m.kind === 'coins')!;
check('coins mission rotated (not done, higher target)',
  !coinsMissionAfter.done && coinsMissionAfter.target > targetBefore);
check('mission tier advanced', save.data.missionTiers.coins === 1);

if (failures === 0) {
  console.log('✓ Meta layer checks passed.');
  process.exit(0);
} else {
  console.error(`\n${failures} meta check(s) failed.`);
  process.exit(1);
}
