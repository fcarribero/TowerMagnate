import type { EngineEvent, TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_DAY } from '../clock';
import { hashState } from '../hash';
import { addPeopleForUnit } from '../people';
import { isOnTrek } from '../trek';
import { step as towerStep } from '../step';
import type { PlannedUnit, TowerPlan } from '../testing';
import { addFlight, buildTower, plainTowerPlan } from '../testing';

const OFFICES_PER_FLOOR = 6;
const OFFICE_WIDTH = 9;
const PLANNED_DAY = STEPS_PER_DAY;
const MORNING_RUSH_STEPS = 8.5 * 360;
const STUCK_STEPS = 360;

function towerPlan(): TowerPlan {
  const units: PlannedUnit[] = [];
  for (let level = 2; level <= 4; level++) {
    for (let slot = 0; slot < OFFICES_PER_FLOOR; slot++) {
      units.push({ type: 'office', level, x: 110 + slot * OFFICE_WIDTH });
    }
  }
  return {
    ...plainTowerPlan(4, 100, 179),
    units,
    shafts: [{ type: 'standard', x: 100, bottom: 1, top: 4 }],
  };
}

function towerWithStairs(): { state: TowerState; stairIds: string[] } {
  const { state, unitIds } = buildTower(towerPlan());
  for (const id of unitIds) addPeopleForUnit(state, id);
  const stairIds = [1, 2, 3].map((level) => addFlight(state, 'stairs', 104, level));
  return { state, stairIds };
}

function movingPeople(state: TowerState): number {
  const pool = state.people;
  let moving = 0;
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (isOnTrek(pool, slot)) moving += 1;
  }
  return moving;
}

interface DayRun {
  hash: string;
  events: EngineEvent[];
  movingAtBreak: number;
  demolished: boolean;
  moving: number;
  longestStuck: number;
}

/** Runs one weekday, demolishing the stairs in the middle of the morning rush. */
function weekdayWithDemolish(): DayRun {
  const { state: start, stairIds } = towerWithStairs();
  const events: EngineEvent[] = [];
  const rush = towerStep(start, [], PLANNED_DAY + MORNING_RUSH_STEPS);
  events.push(...rush.events);

  const demolish = stairIds.map((id, index) => ({
    id: `d${index}`,
    command: { type: 'demolish', target: { kind: 'transport', id } },
  }));
  let state = rush.state;
  const movingAtBreak = movingPeople(state);
  const breakStep = towerStep(state, demolish as never, 1);
  state = breakStep.state;
  events.push(...breakStep.events);

  let longestStuck = 0;
  const lastPlace = new Map<number, string>();
  const stuckSince = new Map<number, number>();
  const remaining = STEPS_PER_DAY - MORNING_RUSH_STEPS - 1;
  for (let done = 0; done < remaining; done += STUCK_STEPS / 4) {
    const run = towerStep(state, [], Math.min(STUCK_STEPS / 4, remaining - done));
    state = run.state;
    events.push(...run.events);
    const pool = state.people;
    for (let slot = 0; slot < pool.id.length; slot++) {
      const id = pool.id[slot] as number;
      const place = `${pool.level[slot]}:${pool.column[slot]}:${pool.trek[slot]}`;
      if (!isOnTrek(pool, slot) || lastPlace.get(id) !== place) {
        stuckSince.delete(id);
      } else {
        const since = stuckSince.get(id) ?? state.step - STUCK_STEPS / 4;
        stuckSince.set(id, since);
        longestStuck = Math.max(longestStuck, state.step - since);
      }
      lastPlace.set(id, place);
    }
  }
  return {
    hash: hashState(state),
    events,
    movingAtBreak,
    demolished: breakStep.results.every((result) => result.ok),
    moving: movingPeople(state),
    longestStuck,
  };
}

describe('scenario: stairs demolished during the morning rush', () => {
  it('re-plans the people on the stairs and reports their trips', () => {
    const run = weekdayWithDemolish();
    const finished = run.events.filter((event) => event.type === 'tripFinished');
    expect(run.demolished).toBe(true);
    expect(run.movingAtBreak).toBeGreaterThan(0);
    expect(finished.length).toBeGreaterThan(0);
    expect(run.moving).toBe(0);
  });

  it('leaves nobody on one spot for more than a game hour', () => {
    expect(weekdayWithDemolish().longestStuck).toBeLessThanOrEqual(STUCK_STEPS);
  });

  it('gives the same results for the same seed', () => {
    const first = weekdayWithDemolish();
    const second = weekdayWithDemolish();
    expect(second.hash).toBe(first.hash);
    expect(second.events).toEqual(first.events);
  });
});
