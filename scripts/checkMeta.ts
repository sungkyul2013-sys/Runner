/**
 * Dev-only verification of the Sunset Runner meta layer (no DOM/WebGL):
 * save defaults + guarded persistence, the coin/gem economy, character buy/
 * select, upgrades, consumables, achievement claims, the daily streak, and run
 * recording (mileage + best). Exits non-zero on any failed assertion.
 * (localStorage is absent under Node; SaveManager falls back to defaults.)
 */
import { ACHIEVEMENTS, DAILY } from '../src/data/achievements';
import { CHARACTERS, getCharacter } from '../src/data/characters';
import { CONSUMABLES } from '../src/data/consumables';
import { SaveManager } from '../src/data/SaveManager';
import { UPGRADES } from '../src/data/upgrades';

let failures = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    failures++;
    console.error(`✗ ${name}`);
  }
}

// ── Data integrity ──
check('8 characters', CHARACTERS.length === 8);
check('runner is free default', getCharacter('runner').price === 0);
check('celestial is gem-priced', getCharacter('celestial').gem === true);
check('5 upgrades', UPGRADES.length === 5);
check('2 consumables', CONSUMABLES.length === 2);
check('9 achievements', ACHIEVEMENTS.length === 9);
check('7-day daily', DAILY.length === 7);

// ── Save defaults ──
const save = new SaveManager();
check('owns runner by default', save.owns('runner'));
check('selected runner', save.data.selected === 'runner');
check('0 coins / 0 mileage', save.data.coins === 0 && save.data.mileage === 0);

// ── Economy ──
save.addCoins(20000);
check('coins added', save.data.coins === 20000);
check('buy ninja', (save.spend(getCharacter('ninja').price) && (save.buy('ninja'), save.owns('ninja'))));
check('overspend rejected', save.spend(999999) === false);

// ── Gem purchase (celestial) ──
save.addMileage(200);
check('gem spend ok', save.spendMileage(getCharacter('celestial').price));
save.buy('celestial');
check('owns celestial', save.owns('celestial'));

// ── Upgrades ──
const before = save.upgradeLevel('magnet');
save.raiseUpgrade('magnet');
check('upgrade raised', save.upgradeLevel('magnet') === before + 1);

// ── Consumables ──
save.addItem('bomb', 2);
check('have 2 bombs', save.data.inventory.bomb === 2);
check('use a bomb', save.useItem('bomb') && save.data.inventory.bomb === 1);

// ── Run recording: mileage + best ──
const res = save.recordRun('endless', 1500, 120, 3000);
// mileage = floor(3000/100) + floor(120/10) = 30 + 12 = 42
check('mileage computed', res.mileage === 42);
check('endless best set', save.data.best === 1500 && res.isBest);
check('runs incremented', save.data.runs === 1);
check('totals updated', save.data.totalDistance === 3000 && save.data.totalCoins === 120);

// ── Achievements: first-run claim ──
const first = ACHIEVEMENTS.find((a) => a.id === 'first')!;
check('first-run goal met', first.stat(save.data) >= first.goal);
const coinsBefore = save.data.coins;
save.claimAchievement('first', first.reward);
check('achievement paid once', save.data.coins === coinsBefore + first.reward);
save.claimAchievement('first', first.reward);
check('achievement not double-paid', save.data.coins === coinsBefore + first.reward);

// ── Daily ──
check('can claim daily', save.canClaimDaily());
save.claimDaily(DAILY[0].coins, DAILY[0].mile);
check('daily consumed', !save.canClaimDaily() && save.data.dailyStreak === 1);

if (failures === 0) {
  console.log('✓ Meta layer checks passed.');
  process.exit(0);
} else {
  console.error(`\n${failures} meta check(s) failed.`);
  process.exit(1);
}
