import { describe, expect, it } from 'vitest';
import type { PlannedUnit, TowerPlan } from '../testing';
import {
  buildTower,
  fastestRunMillis,
  plainTowerPlan,
  runScenario,
  summarizeTower,
} from '../testing';
import { hashState } from '../hash';
import { towerCommandHandlers } from '../commands';
import { eventsPhase } from '../events';
import { createEngine, towerSystems } from '../step';

const OFFICE_WIDTH = 9;
const OFFICES_PER_FLOOR = 10;
const WEEK_BUDGET_MS = 2000;

function officeTowerPlan(): TowerPlan {
  const units: PlannedUnit[] = [];
  for (let level = 2; level <= 10; level++) {
    for (let slot = 0; slot < OFFICES_PER_FLOOR; slot++) {
      units.push({ type: 'office', level, x: 104 + slot * OFFICE_WIDTH });
    }
  }
  return {
    ...plainTowerPlan(10, 100, 199),
    units,
    shafts: [{ type: 'standard', x: 100, bottom: 1, top: 10 }],
  };
}

/** The tower engine without events, so no bomb threat can destroy part of the tower. */
const engineWithoutEvents = createEngine({
  commandHandlers: towerCommandHandlers,
  systems: towerSystems.filter((system) => system !== eventsPhase),
});

describe('scenario: 10-floor office tower', () => {
  it('runs a game week and keeps the tower it started with', () => {
    const { state: tower } = buildTower(officeTowerPlan());
    const run = runScenario({ tower, days: 7, engine: engineWithoutEvents });

    const summary = summarizeTower(run.state);
    expect(summary.day).toBe(7);
    expect(summary.builtLevels).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(summary.unitIds).toHaveLength(90);
    expect(summary.shaftIds).toEqual(['s91']);
    expect(run.results).toEqual([]);
  });

  it('gives the same state for the same tower and seed', () => {
    const first = runScenario({ tower: buildTower(officeTowerPlan()).state, days: 2 });
    const second = runScenario({ tower: buildTower(officeTowerPlan()).state, days: 2 });
    expect(hashState(first.state)).toBe(hashState(second.state));
  });

  it(`runs a game week inside the ${WEEK_BUDGET_MS} ms CI budget`, () => {
    const { state: tower } = buildTower(officeTowerPlan());
    const elapsed = fastestRunMillis(() => runScenario({ tower, days: 7 }));
    console.info(`10-floor tower, 7 game days: ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(WEEK_BUDGET_MS);
  });
});
