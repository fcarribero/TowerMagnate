import { describe, expect, it } from 'vitest';
import {
  buildTower,
  runScenario,
  summarizeTower,
  tenFloorOfficeTowerPlan as officeTowerPlan,
} from '../testing';
import { hashState } from '../hash';
import { towerCommandHandlers } from '../commands';
import { eventsPhase } from '../events';
import { createEngine, towerSystems } from '../step';

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
});
