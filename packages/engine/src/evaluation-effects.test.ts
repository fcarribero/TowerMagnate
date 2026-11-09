import {
  CONDO_EVALUATION_WEEKS,
  LEASE_CONTRACT_WEEKS,
  SHOP_EARLY_LEAVE_MIN_VISITS,
  WEEKLY_RENT,
  type Level,
  type StarRating,
  type TenantEvaluation,
  type TowerState,
  type Unit,
  type UnitType,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { createCondoSystem } from './condos';
import { bookingChance, rollBooking } from './hotel';
import { createLeaseSystem, STEPS_PER_WEEK } from './leases';
import { createRng } from './rng';
import { createEngine, step as towerStep, type StepResult } from './step';
import { buildTower, plainTowerPlan } from './testing';
import { fileUnitTrip, storedGrade } from './unit-evaluation';

const TERM_END = LEASE_CONTRACT_WEEKS * STEPS_PER_WEEK;
const CONDO_CHECK = CONDO_EVALUATION_WEEKS * STEPS_PER_WEEK;
const OFFICE_X = 40;
const OFFICE_LAST_COLUMN = OFFICE_X + 8;
const TRIPS = 20;

interface Placement {
  type: UnitType;
  x: number;
}

function towerWith(...placements: Placement[]): { state: TowerState; units: Unit[] } {
  const { state, unitIds } = buildTower({
    ...plainTowerPlan(5, 0, 299),
    units: placements.map((placement) => ({ ...placement, level: 3 as Level })),
  });
  return { state, units: unitIds.map((id) => state.units[id] as Unit) };
}

/** Files trips of the same stress that ended in the week before `decisionStep`. */
function fileTrips(state: TowerState, unit: Unit, decisionStep: number, stress: number): void {
  for (let trip = TRIPS; trip > 0; trip--) {
    fileUnitTrip(state, unit, decisionStep - trip * 100, stress);
  }
}

/** A tenant whose 4-week term ends at the next step, with trips of `stress` in its window. */
function leaseEndingNext(type: 'office' | 'retail-shop', stress: number, ...others: Placement[]) {
  const { state, units } = towerWith({ type, x: OFFICE_X }, ...others);
  const unit = units[0] as Unit;
  unit.lease = {
    anchorStep: 0,
    nextDueStep: TERM_END,
    weekVisits: SHOP_EARLY_LEAVE_MIN_VISITS,
  };
  fileTrips(state, unit, TERM_END, stress);
  state.step = TERM_END - 1;
  return { state, unit };
}

const decisionEngine = createEngine({
  commandHandlers: {},
  systems: [createLeaseSystem(storedGrade), createCondoSystem(storedGrade)],
});

function stepOnce(state: TowerState): StepResult {
  return decisionEngine.step(state, [], 1);
}

function newsKeys(result: StepResult): string[] {
  return result.events.flatMap((event) => (event.type === 'news' ? [event.key] : []));
}

describe('office lease end by grade (E-12)', () => {
  it('lets the tenant go when a fast food 10 columns away makes the office poor', () => {
    const { state, unit } = leaseEndingNext('office', 130, {
      type: 'fast-food',
      x: OFFICE_LAST_COLUMN + 11,
    });
    const result = stepOnce(state);
    const office = result.state.units[unit.id] as Unit;
    expect(office.lease).toBeNull();
    expect(office.evaluation).toBeNull();
    expect(result.state.money).toBe(state.money);
    expect(newsKeys(result)).toEqual(['news.officeLeft']);
  });

  it('renews for another term with the fast food 11 columns away', () => {
    const { state, unit } = leaseEndingNext('office', 130, {
      type: 'fast-food',
      x: OFFICE_LAST_COLUMN + 12,
    });
    const result = stepOnce(state);
    const office = result.state.units[unit.id] as Unit;
    expect(office.evaluation).toBe('fair');
    expect(office.lease).toEqual({
      anchorStep: TERM_END,
      nextDueStep: TERM_END + STEPS_PER_WEEK,
      weekVisits: 0,
    });
    expect(result.state.money - state.money).toBe(WEEKLY_RENT.office.normal);
    expect(newsKeys(result)).toEqual([]);
  });

  it('treats a score of exactly 180 as poor at 3 stars and fair at 4 stars', () => {
    const outcomes = ([3, 4] as StarRating[]).map((stars) => {
      const { state, unit } = leaseEndingNext('office', 180);
      state.stars = stars;
      return stepOnce(state).state.units[unit.id] as Unit;
    });
    expect(outcomes.map((office) => office.lease !== null)).toEqual([false, true]);
    expect(outcomes[1]?.evaluation).toBe('fair');
  });

  it('renews an office moved to minimo before its lease end and charges the minimo week', () => {
    const { state, unit } = leaseEndingNext('office', 300);
    unit.priceLevel = 'minimum';
    const result = stepOnce(state);
    expect(result.state.units[unit.id]?.lease?.anchorStep).toBe(TERM_END);
    expect(result.state.units[unit.id]?.evaluation).toBe('good');
    expect(result.state.money - state.money).toBe(WEEKLY_RENT.office.minimum);
  });

  it('lets the same office go at normal price', () => {
    const { state, unit } = leaseEndingNext('office', 300);
    expect(stepOnce(state).state.units[unit.id]?.lease).toBeNull();
  });
});

describe('shop lease end by grade (E-12)', () => {
  it('lets a poor shop go with its own notice and renews a fair one', () => {
    const poor = leaseEndingNext('retail-shop', 200);
    const poorResult = stepOnce(poor.state);
    expect(poorResult.state.units[poor.unit.id]?.lease).toBeNull();
    expect(newsKeys(poorResult)).toEqual(['news.shopLeftEvaluation']);

    const fair = leaseEndingNext('retail-shop', 100);
    const fairResult = stepOnce(fair.state);
    expect(fairResult.state.units[fair.unit.id]?.lease?.anchorStep).toBe(TERM_END);
    expect(fairResult.state.money - fair.state.money).toBe(WEEKLY_RENT['retail-shop'].normal);
  });
});

describe('condo evaluation by grade (E-25)', () => {
  const SALE_PRICE = 175_000;

  function condoDueNext(stress: number) {
    const { state, units } = towerWith({ type: 'condo', x: OFFICE_X });
    const condo = units[0] as Unit;
    condo.sale = { price: SALE_PRICE, anchorStep: 0, nextEvaluationStep: CONDO_CHECK };
    fileTrips(state, condo, CONDO_CHECK, stress);
    state.step = CONDO_CHECK - 1;
    return { state, condo };
  }

  it('buys back a poor condo, refunds the sale price and puts it up for sale', () => {
    const { state, condo } = condoDueNext(200);
    const result = stepOnce(state);
    const after = result.state.units[condo.id] as Unit;
    expect(after.sale).toBeNull();
    expect(after.evaluation).toBeNull();
    expect(state.money - result.state.money).toBe(SALE_PRICE);
    expect(newsKeys(result)).toEqual(['news.condoBuyback']);
  });

  it('keeps fair owners until the next evaluation 4 weeks later', () => {
    const { state, condo } = condoDueNext(100);
    const result = stepOnce(state);
    const after = result.state.units[condo.id] as Unit;
    expect(after.evaluation).toBe('fair');
    expect(after.sale?.nextEvaluationStep).toBe(2 * CONDO_CHECK);
    expect(result.state.money).toBe(state.money);
  });
});

describe('tower step uses the stored grade', () => {
  it('ends a poor office lease in the full simulation', () => {
    const { state, unit } = leaseEndingNext('office', 300);
    const result = towerStep(state, [], 1);
    expect(result.state.units[unit.id]?.lease).toBeNull();
    expect(newsKeys(result)).toContain('news.officeLeft');
  });
});

describe('hotel booking roll (people.md 8.1)', () => {
  const ROLLS = 1_000;
  const SEEDS = [1, 2, 3, 4, 5];
  const EXPECTED: [TenantEvaluation | null, number][] = [
    ['good', 90],
    ['fair', 70],
    ['poor', 40],
    [null, 80],
  ];

  function roomGraded(evaluation: TenantEvaluation | null): Unit {
    const { units } = towerWith({ type: 'single-room', x: OFFICE_X });
    const room = units[0] as Unit;
    room.evaluation = evaluation;
    return room;
  }

  it('reads the chance from the stored grade', () => {
    for (const [evaluation, percent] of EXPECTED) {
      expect(bookingChance(roomGraded(evaluation))).toBe(percent);
    }
  });

  it.each(SEEDS)('books within 3 points of each chance over 1,000 rolls with seed %i', (seed) => {
    for (const [evaluation, percent] of EXPECTED) {
      const room = roomGraded(evaluation);
      const rng = createRng(seed);
      let booked = 0;
      for (let roll = 0; roll < ROLLS; roll++) {
        if (rollBooking(rng, room)) booked++;
      }
      expect(Math.abs((booked * 100) / ROLLS - percent)).toBeLessThanOrEqual(3);
    }
  });
});
