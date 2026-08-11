/**
 * Dev-only verification of the METRO SURF meta layer (no DOM, no WebGL): data
 * integrity across the crew, boards, modes, upgrades, consumables, missions and
 * achievements, plus the live behaviour of the save layer — the coin/key
 * economy, buying and equipping, mission progress and set completion, the word
 * hunt, run recording with the top-run board, world-tour milestones, achievement
 * claims and the daily streak. Exits non-zero on any failed assertion.
 * (localStorage is absent under Node; SaveManager falls back to defaults.)
 */
import { CORE_POWERUPS, HUNT_WORD, POWERUPS, PowerupType, SPAWNABLE } from '../src/config/powerups';
import { ACHIEVEMENTS, DAILY } from '../src/data/achievements';
import { BOARDS, getBoard } from '../src/data/boards';
import { CHARACTERS, getCharacter } from '../src/data/characters';
import { CONSUMABLES } from '../src/data/consumables';
import { JOURNEY } from '../src/data/journey';
import { getMission, goalFor, MISSIONS, rollMissions, setReward } from '../src/data/missions';
import { MODES } from '../src/data/modes';
import { getOutfit, OUTFITS, outfitsFor, resolveColors } from '../src/data/outfits';
import { SaveManager } from '../src/data/SaveManager';
import { UPGRADES } from '../src/data/upgrades';

let failures = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    failures++;
    console.error(`✗ ${name}`);
  }
}

// ── Data integrity ────────────────────────────────────────────────────────
check('12 characters', CHARACTERS.length === 12);
check('starter character is free', getCharacter('jino').price === 0);
check('every character id is unique', new Set(CHARACTERS.map((c) => c.id)).size === CHARACTERS.length);
check('key-priced headliners exist', CHARACTERS.filter((c) => c.key).length >= 2);
check('8 boards', BOARDS.length === 8);
check('starter board is free', getBoard('standard').price === 0);
check('every board id is unique', new Set(BOARDS.map((b) => b.id)).size === BOARDS.length);
check('every character has a fit list', CHARACTERS.every((c) => outfitsFor(c.id).length >= 3));
check('every fit list starts with the free default',
  CHARACTERS.every((c) => outfitsFor(c.id)[0].id === 'default' && outfitsFor(c.id)[0].price === 0));
check('outfit ids are unique per character',
  CHARACTERS.every((c) => new Set(outfitsFor(c.id).map((o) => o.id)).size === outfitsFor(c.id).length));
check('no stray outfit lists', Object.keys(OUTFITS).every((id) => CHARACTERS.some((c) => c.id === id)));
check('an outfit only overrides part of the palette',
  resolveColors('jino', 'varsity').skin === getCharacter('jino').colors.skin
  && resolveColors('jino', 'varsity').top === getOutfit('jino', 'varsity').colors.top);
check('an unknown outfit falls back to the default',
  resolveColors('jino', 'nope').top === getCharacter('jino').colors.top);
check('5 modes', MODES.length === 5);
check('exactly one mode blocks revives', MODES.filter((m) => !m.reviveAllowed).length === 1);
check('6 upgrades', UPGRADES.length === 6);
check('every core power-up has an upgrade', CORE_POWERUPS.every(
  (t) => UPGRADES.some((u) => u.name === POWERUPS[t].label)));
check('4 consumables', CONSUMABLES.length === 4);
check('14 achievements', ACHIEVEMENTS.length === 14);
check('7-day daily cycle', DAILY.length === 7);
check('9 world-tour milestones', JOURNEY.length === 9);
check('world tour is strictly increasing', JOURNEY.every((m, i) => i === 0 || m.need > JOURNEY[i - 1].need));
check('letters never spawn from the random token roll', !SPAWNABLE.includes(PowerupType.LETTER));
check('every spawnable token has a positive weight', SPAWNABLE.every((t) => POWERUPS[t].weight > 0));
check('mission pool is large enough to roll sets', MISSIONS.length >= 12);
check('mission goals grow with the set number', goalFor(MISSIONS[0], 5) > goalFor(MISSIONS[0], 1));
check('set rewards grow', setReward(5) > setReward(1));
const rolled = rollMissions(3);
check('a rolled set has 3 distinct missions',
  rolled.length === 3 && new Set(rolled.map((m) => m.id)).size === 3);
check('rolled missions start empty', rolled.every((m) => m.progress === 0 && m.goal > 0));

// ── Save defaults ─────────────────────────────────────────────────────────
const save = new SaveManager();
check('owns the starter character', save.ownsChar('jino'));
check('owns the starter board', save.ownsBoard('standard'));
check('starts broke', save.data.coins === 0 && save.data.keys === 0);
check('starts on mission set 1', save.data.missionSet === 1 && save.data.missions.length === 3);
check('starts with no multiplier bonus', save.data.multiplierBonus === 0);

// ── Economy ───────────────────────────────────────────────────────────────
save.addCoins(50000);
check('coins added', save.data.coins === 50000);
check('overspend rejected', save.spend(999999) === false);
const tex = getCharacter('tex');
check('buy a character', save.spend(tex.price) && (save.buyChar('tex'), save.ownsChar('tex')));
save.selectChar('tex');
check('equip a character', save.data.selectedChar === 'tex');
const bolt = getBoard('bolt');
check('buy a board', save.spend(bolt.price) && (save.buyBoard('bolt'), save.ownsBoard('bolt')));
save.selectBoard('bolt');
check('equip a board', save.data.selectedBoard === 'bolt');

save.addKeys(30);
const noir = getCharacter('noir');
check('key purchase', save.spendKeys(noir.price));
save.buyChar('noir');
check('owns the key character', save.ownsChar('noir'));
check('key overspend rejected', save.spendKeys(99999) === false);

// ── Outfits ───────────────────────────────────────────────────────────────
{
  check('default fit is owned for free', save.ownsOutfit('jino', 'default'));
  const alt = outfitsFor('jino')[1];
  check('alternate fit starts locked', !save.ownsOutfit('jino', alt.id));
  check('an unowned fit is never worn', save.outfitOf('jino') === 'default');
  const coinsBefore = save.data.coins;
  check('buying a fit charges for it', save.spend(alt.price) && save.data.coins === coinsBefore - alt.price);
  save.buyOutfit('jino', alt.id);
  save.selectOutfit('jino', alt.id);
  check('the fit is owned and worn', save.ownsOutfit('jino', alt.id) && save.outfitOf('jino') === alt.id);
  check('the worn fit changes the palette',
    resolveColors('jino', save.outfitOf('jino')).top === alt.colors.top);
  save.selectOutfit('jino', 'locked-id');
  check('selecting a fit you do not own falls back', save.outfitOf('jino') === 'default');
}

// ── Upgrades ──────────────────────────────────────────────────────────────
const beforeLvl = save.upgradeLevel('magnet');
save.raiseUpgrade('magnet');
check('upgrade raised', save.upgradeLevel('magnet') === beforeLvl + 1);
check('upgrade cost grows', UPGRADES[0].cost(3) > UPGRADES[0].cost(0));

// ── Consumables ───────────────────────────────────────────────────────────
save.addItem('headstart', 2);
check('inventory added', save.data.inventory.headstart === 2);
check('inventory consumed', save.useItem('headstart') && save.data.inventory.headstart === 1);
save.data.inventory.headstart = 0;
check('cannot use an empty slot', save.useItem('headstart') === false);

// ── Missions: progress, completion, set rollover ──────────────────────────
{
  // Force a known set so the assertions do not depend on the random roll.
  save.data.missions = [
    { id: 'coins', goal: 100, progress: 0 },
    { id: 'jump', goal: 10, progress: 0 },
    { id: 'dist-run', goal: 500, progress: 0 },
  ];
  check('cumulative mission progresses', save.bumpMission('coins', 40).length === 0
    && save.data.missions[0].progress === 40);
  check('cumulative mission completes', save.bumpMission('coins', 80).includes('coins'));
  check('progress is clamped to the goal', save.data.missions[0].progress === 100);
  check('per-run mission ignores cumulative bumps', save.bumpMission('distance', 900).length === 0);
  check('per-run mission takes the max', save.setRunMission('distance', 300).length === 0
    && save.data.missions[2].progress === 300);
  check('per-run mission never goes backwards',
    (save.setRunMission('distance', 120), save.data.missions[2].progress === 300));
  check('set is not complete yet', !save.missionsComplete);
  save.bumpMission('jump', 10);
  check('per-run mission completes', save.setRunMission('distance', 800).includes('dist-run'));
  check('set is complete', save.missionsComplete);

  const coinsBefore = save.data.coins;
  const reward = save.completeMissionSet();
  check('set completion pays out', !!reward && save.data.coins === coinsBefore + reward.coins);
  check('set completion raises the multiplier', save.data.multiplierBonus === 1);
  check('set advances', save.data.missionSet === 2);
  check('a fresh set is rolled', save.data.missions.length === 3
    && save.data.missions.every((m) => m.progress === 0));
  check('completing again with no progress is a no-op', save.completeMissionSet() === null);
}

// ── Per-run mission reset ─────────────────────────────────────────────────
{
  save.data.missions = [
    { id: 'coins-run', goal: 100, progress: 60 },
    { id: 'coins', goal: 100, progress: 60 },
    { id: 'jump', goal: 10, progress: 10 },
  ];
  save.resetRunMissions();
  check('incomplete per-run progress resets', save.data.missions[0].progress === 0);
  check('cumulative progress survives', save.data.missions[1].progress === 60);
  check('completed missions survive', save.data.missions[2].progress === 10);
}

// ── Word hunt ─────────────────────────────────────────────────────────────
{
  save.data.huntLetters = [];
  const first = save.nextHuntLetter();
  check('hunt starts on the first letter', first === HUNT_WORD[0]);
  const keysBefore = save.data.keys;
  const coinsBefore = save.data.coins;
  let completed = false;
  for (const ch of HUNT_WORD) completed = save.collectLetter(ch) || completed;
  check('collecting every letter completes the word', completed);
  check('the word pays a key + coins',
    save.data.keys === keysBefore + 1 && save.data.coins === coinsBefore + 500);
  check('the hunt resets for the next cycle', save.data.huntLetters.length === 0 && save.data.huntCompleted === 1);
  check('a duplicate letter is ignored', save.collectLetter(HUNT_WORD[0]) === false
    || save.data.huntLetters.length === 1);
}

// ── Run recording + the top-run board ─────────────────────────────────────
{
  const coinsBefore = save.data.coins;
  const first = save.recordRun('endless', 12000, 250, 3400, 95, 'tex');
  check('first run is a best', first.isBest && first.rank === 0);
  check('coins are banked', save.data.coins === coinsBefore + 250);
  check('lifetime totals update', save.data.totalDistance >= 3400 && save.data.totalCoins >= 250);
  check('endless best set', save.bestFor('endless') === 12000);

  const worse = save.recordRun('endless', 900, 10, 300, 20, 'tex');
  check('a worse run is not a best', !worse.isBest);
  check('the best is unchanged', save.bestFor('endless') === 12000);
  check('the board keeps the leader first', save.data.topRuns[0].score === 12000);

  for (let i = 0; i < 12; i++) save.recordRun('endless', 1000 + i, 1, 100, 5, 'tex');
  check('the top-run board is capped at 8', save.data.topRuns.length === 8);
  check('the board stays sorted',
    save.data.topRuns.every((r, i) => i === 0 || r.score <= save.data.topRuns[i - 1].score));

  save.recordRun('hardcore', 5000, 5, 500, 10, 'tex');
  check('per-mode bests are independent',
    save.bestFor('hardcore') === 5000 && save.bestFor('endless') === 12000);
}

// ── World tour milestones ─────────────────────────────────────────────────
{
  save.data.totalDistance = JOURNEY[0].need + 10;
  check('progress tracks lifetime distance', save.journeyProgress >= JOURNEY[0].need);
  const coinsBefore = save.data.coins;
  check('milestone claims', save.claimMilestone(0, JOURNEY[0].coins, JOURNEY[0].keys, JOURNEY[0].boards));
  check('milestone pays out', save.data.coins === coinsBefore + JOURNEY[0].coins);
  check('milestone cannot be double-claimed',
    save.claimMilestone(0, JOURNEY[0].coins, JOURNEY[0].keys, JOURNEY[0].boards) === false);
  check('milestone is remembered', save.milestoneClaimed(0));
}

// ── Achievements ──────────────────────────────────────────────────────────
{
  const first = ACHIEVEMENTS.find((a) => a.id === 'first')!;
  check('first-run goal met', first.stat(save.data) >= first.goal);
  const coinsBefore = save.data.coins;
  save.claimAchievement('first', first.coins, first.keys ?? 0);
  check('achievement paid once', save.data.coins === coinsBefore + first.coins);
  save.claimAchievement('first', first.coins, first.keys ?? 0);
  check('achievement not double-paid', save.data.coins === coinsBefore + first.coins);
}

// ── Daily ─────────────────────────────────────────────────────────────────
{
  check('daily is claimable on a fresh profile', save.canClaimDaily());
  const streakBefore = save.data.dailyStreak;
  save.claimDaily(DAILY[streakBefore].coins, DAILY[streakBefore].keys);
  check('daily consumed', !save.canClaimDaily());
  check('streak advances', save.data.dailyStreak === (streakBefore + 1) % 7);
}

// ── Mission text renders ──────────────────────────────────────────────────
check('every mission renders its goal text',
  MISSIONS.every((m) => typeof getMission(m.id).text(goalFor(m, 1)) === 'string'));

if (failures === 0) {
  console.log('✓ Meta layer checks passed.');
  process.exit(0);
} else {
  console.error(`\n${failures} meta check(s) failed.`);
  process.exit(1);
}
