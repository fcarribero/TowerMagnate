import type { TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_WEEK } from './leases';
import { createRng } from './rng';
import { runDays, step } from './step';
import { buildTower } from './testing';

const FIRST_MONDAY = STEPS_PER_WEEK;
/** No fire or bomb threat in the first two weeks, so only upkeep moves the balance. */
const QUIET_SEED = 2;

function addStandardCar(state: TowerState): void {
  for (const shaft of Object.values(state.shafts)) {
    const [car] = shaft.cars;
    if (shaft.type === 'standard' && car) {
      shaft.cars.push({ ...car });
    }
  }
}

function upkeepTower(stars: 3 | 4, money = 2_000_000): TowerState {
  const { state } = buildTower({
    lobby: { x0: 0, x1: 9 },
    floors: [{ from: 2, to: 10, x0: 0, x1: 49 }],
    units: [{ type: 'security', level: 2, x: 30 }],
    shafts: [
      { type: 'standard', x: 10, bottom: 2, top: 10 },
      { type: 'express', x: 14, bottom: 2, top: 10 },
    ],
  });
  addStandardCar(state);
  state.transports.t1 = { id: 't1', type: 'escalator', x: 16, level: 3, paid: 0, placedAtStep: 0 };
  state.stars = stars;
  state.money = money;
  state.rng = createRng(QUIET_SEED);
  return state;
}

function runToStep(state: TowerState, target: number): ReturnType<typeof step> {
  return step(state, [], target - state.step);
}

describe('weekly upkeep', () => {
  it('charges nothing at step 0 and the day before the first Monday', () => {
    const { state } = runToStep(upkeepTower(3), FIRST_MONDAY - 1);
    expect(state.money).toBe(2_000_000);
    expect(state.ledger.currentWeek.upkeep.expense).toBe(0);
  });

  it('charges $75,000 at 3 stars on the first Monday', () => {
    const { state } = runToStep(upkeepTower(3), FIRST_MONDAY);
    expect(state.money).toBe(2_000_000 - 75_000);
    expect(state.ledger.currentWeek.upkeep.expense).toBe(-75_000);
  });

  it('charges the lobby at $1,500 a column at 4 stars', () => {
    const { state } = runToStep(upkeepTower(4), FIRST_MONDAY);
    expect(state.money).toBe(2_000_000 - 85_000);
  });

  it('charges again every following Monday and not in between', () => {
    const { state } = runToStep(upkeepTower(3), FIRST_MONDAY + 1);
    const secondWeek = runToStep(state, 2 * FIRST_MONDAY - 1).state;
    expect(secondWeek.money).toBe(2_000_000 - 75_000);
    const monday = runToStep(secondWeek, 2 * FIRST_MONDAY).state;
    expect(monday.money).toBe(2_000_000 - 150_000);
    expect(monday.ledger.previousWeek.upkeep.expense).toBe(-75_000);
    expect(monday.ledger.currentWeek.upkeep.expense).toBe(-75_000);
  });

  it('charges a full week for a car added one step before Monday', () => {
    const tower = upkeepTower(3);
    const before = runToStep(tower, FIRST_MONDAY - 1).state;
    addStandardCar(before);
    const { state } = runToStep(before, FIRST_MONDAY);
    expect(state.money).toBe(2_000_000 - 85_000);
  });

  it('charges hotel rooms, a party hall and the other flat items by type', () => {
    const { state: tower } = buildTower({
      lobby: { x0: 0, x1: 59 },
      floors: [{ from: 2, to: 5, x0: 0, x1: 59 }],
      units: [
        { type: 'single-room', level: 2, x: 0 },
        { type: 'double-room', level: 2, x: 10 },
        { type: 'suite', level: 2, x: 20 },
        { type: 'party-hall', level: 3, x: 0 },
        { type: 'office', level: 2, x: 50 },
      ],
    });
    tower.stars = 2;
    const { state } = runToStep(tower, FIRST_MONDAY);
    expect(2_000_000 - state.money).toBe(2_000 + 3_000 + 6_000 + 20_000);
  });

  it('applies in full into the negative and emits the news once', () => {
    const tower = upkeepTower(3, 40_000);
    const result = runToStep(tower, 2 * FIRST_MONDAY);
    expect(result.state.money).toBe(40_000 - 150_000);
    const news = result.events.filter((event) => event.type === 'news');
    expect(news).toEqual([
      {
        type: 'news',
        step: FIRST_MONDAY,
        key: 'news.upkeepNegative',
        unitId: null,
        params: {},
      },
    ]);
  });

  it('ends at -$35,000 from $40,000 and records the whole week', () => {
    const { state } = runToStep(upkeepTower(3, 40_000), FIRST_MONDAY);
    expect(state.money).toBe(-35_000);
  });

  it('does not charge or emit news for an empty tower', () => {
    const result = runDays(buildTower({}).state, 15);
    expect(result.state.ledger.previousWeek.upkeep.expense).toBe(0);
    expect(result.events).toEqual([]);
  });
});
