import type { TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_WEEK } from './leases';
import { createRng } from './rng';
import { runDays, step } from './step';
import { chargeWeeklyUpkeep } from './upkeep';
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

  it('charges $88,000 at 3 stars on the first Monday', () => {
    const { state } = runToStep(upkeepTower(3), FIRST_MONDAY);
    expect(state.money).toBe(2_000_000 - 88_000);
    expect(state.ledger.currentWeek.upkeep.expense).toBe(-88_000);
  });

  it('charges the lobby at $1,000 a column at 4 stars', () => {
    const { state } = runToStep(upkeepTower(4), FIRST_MONDAY);
    expect(state.money).toBe(2_000_000 - 95_000);
  });

  it('charges again every following Monday and not in between', () => {
    const { state } = runToStep(upkeepTower(3), FIRST_MONDAY + 1);
    const secondWeek = runToStep(state, 2 * FIRST_MONDAY - 1).state;
    expect(secondWeek.money).toBe(2_000_000 - 88_000);
    const monday = runToStep(secondWeek, 2 * FIRST_MONDAY).state;
    expect(monday.money).toBe(2_000_000 - 176_000);
    expect(monday.ledger.previousWeek.upkeep.expense).toBe(-88_000);
    expect(monday.ledger.currentWeek.upkeep.expense).toBe(-88_000);
  });

  it('charges a full week for a car added one step before Monday', () => {
    const tower = upkeepTower(3);
    const before = runToStep(tower, FIRST_MONDAY - 1).state;
    addStandardCar(before);
    const { state } = runToStep(before, FIRST_MONDAY);
    expect(state.money).toBe(2_000_000 - 98_000);
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
    for (const unit of Object.values(tower.units)) unit.listed = false;
    const { state } = runToStep(tower, FIRST_MONDAY);
    expect(2_000_000 - state.money).toBe(2_000 + 3_000 + 10_000 + 20_000);
  });

  it('applies in full into the negative and emits the news once', () => {
    const tower = upkeepTower(3, 40_000);
    const result = runToStep(tower, 2 * FIRST_MONDAY);
    expect(result.state.money).toBe(40_000 - 176_000);
    const news = result.events
      .filter((event) => event.type === 'news')
      .filter((event) => event.key !== 'news.vipNoSuite');
    expect(news).toEqual([
      {
        type: 'news',
        step: FIRST_MONDAY,
        key: 'news.upkeepNegative',
        unitId: null,
        params: {},
      },
    ]);
    expect(news.some((event) => event.key === 'news.balanceNegative')).toBe(false);
  });

  it('ends at -$48,000 from $40,000 and records the whole week', () => {
    const { state } = runToStep(upkeepTower(3, 40_000), FIRST_MONDAY);
    expect(state.money).toBe(-48_000);
  });

  it('does not charge or emit news for an empty tower', () => {
    const result = runDays(buildTower({}).state, 15);
    expect(result.state.ledger.previousWeek.upkeep.expense).toBe(0);
    expect(result.events).toEqual([]);
  });
});

describe('commercial upkeep by opening hours', () => {
  function shops() {
    const { state } = buildTower({
      lobby: { x0: 0, x1: 59 },
      floors: [{ from: 2, to: 3, x0: 0, x1: 59 }],
      units: [
        { type: 'fast-food', level: 2, x: 0 },
        { type: 'retail-shop', level: 2, x: 20 },
        { type: 'restaurant', level: 3, x: 0 },
      ],
    });
    state.money = 1_000_000;
    return state;
  }
  const unitOf = (state: TowerState, type: string) =>
    Object.values(state.units).find((unit) => unit.type === type)!;
  const charged = (state: TowerState) => {
    const before = state.money;
    chargeWeeklyUpkeep(state);
    return before - state.money;
  };

  it('charges each daily open hour: 12 for a fast food, 10 for a shop, 6 for a restaurant', () => {
    expect(charged(shops())).toBe(12 * 250 + 10 * 150 + 6 * 400);
  });

  it('charges less for a fast food the player opens fewer hours', () => {
    const state = shops();
    unitOf(state, 'fast-food').hours = { open: 10, close: 14 };
    expect(charged(state)).toBe(4 * 250 + 10 * 150 + 6 * 400);
  });

  it('charges nothing for a fast food that is shut all day', () => {
    const state = shops();
    unitOf(state, 'fast-food').activeToday = false;
    expect(charged(state)).toBe(10 * 150 + 6 * 400);
  });
});
