import type {
  EngineEvent,
  TenantEvaluation,
  TowerState,
  Unit,
  UnitId,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { dateOfStep } from './calendar';
import { createLeaseSystem, moveInTenant, recordShopVisit, STEPS_PER_WEEK } from './leases';
import { createEngine, type SimulationSystem } from './step';
import { buildTower, plainTowerPlan } from './testing';

const TUESDAY_09_12 = 8_640 + 9 * 360 + 12 * 6;
const TERM = 4 * STEPS_PER_WEEK;

interface Setup {
  moveInAt?: number;
  evaluate?: () => TenantEvaluation | null;
  type?: 'office' | 'retail-shop';
  /** Customer visits the unit gets in each lease week, all on the step after a due step. */
  weeklyVisits?: readonly number[] | number;
}

function towerWithOneUnit(type: 'office' | 'retail-shop'): { tower: TowerState; unitId: UnitId } {
  const plan = { ...plainTowerPlan(3, 0, 40), units: [{ type, x: 0, level: 2 }] };
  const { state, unitIds } = buildTower(plan);
  return { tower: state, unitId: unitIds[0] as UnitId };
}

function unitOf(state: TowerState, unitId: UnitId): Unit {
  const unit = state.units[unitId];
  if (!unit) throw new Error(`No unit ${unitId}`);
  return unit;
}

function moveInSystem(unitId: UnitId, at: number): SimulationSystem {
  return (context) => {
    if (context.state.step === at) moveInTenant(context, unitId);
  };
}

/** Scripted customers: each lease week's visits arrive together, one step after it starts. */
function customersSystem(
  unitId: UnitId,
  weeklyVisits: readonly number[] | number,
): SimulationSystem {
  return (context) => {
    const unit = context.state.units[unitId];
    const lease = unit?.lease;
    if (!unit || !lease || context.state.step !== lease.nextDueStep - STEPS_PER_WEEK + 1) return;
    const week = Math.round((lease.nextDueStep - lease.anchorStep) / STEPS_PER_WEEK) - 1;
    const visits = typeof weeklyVisits === 'number' ? weeklyVisits : (weeklyVisits[week] ?? 0);
    for (let visit = 0; visit < visits; visit++) recordShopVisit(unit);
  };
}

function leaseRun({
  moveInAt = TUESDAY_09_12,
  evaluate,
  type = 'office',
  weeklyVisits = type === 'retail-shop' ? 70 : 0,
}: Setup = {}) {
  const { tower, unitId } = towerWithOneUnit(type);
  const engine = createEngine({
    commandHandlers: {},
    systems: [
      moveInSystem(unitId, moveInAt),
      createLeaseSystem(evaluate),
      customersSystem(unitId, weeklyVisits),
    ],
  });
  return { tower, unitId, engine };
}

function stepsTo(state: TowerState, target: number): number {
  return target - state.step;
}

describe('office and shop leases', () => {
  it('pays $10,000 at move-in and every week at the same weekday and minute', () => {
    const { tower, engine } = leaseRun();
    const payments: number[] = [];
    let state = tower;
    for (let s = 0; s < 4; s++) {
      const due = TUESDAY_09_12 + s * STEPS_PER_WEEK;
      const before = engine.step(state, [], stepsTo(state, due - 1)).state;
      const after = engine.step(before, [], 1).state;
      expect(after.money - before.money).toBe(10_000);
      payments.push(after.step);
      state = after;
    }
    expect(payments.map((step) => dateOfStep(step).weekday)).toEqual([1, 1, 1, 1]);
    expect(payments.map((step) => step % 8_640)).toEqual(Array(4).fill(TUESDAY_09_12 % 8_640));
    expect(payments).toEqual([0, 1, 2, 3].map((week) => TUESDAY_09_12 + week * STEPS_PER_WEEK));
  });

  it('collects five payments and one renewal over five weeks', () => {
    const { tower, unitId, engine } = leaseRun();
    const run = engine.step(tower, [], TUESDAY_09_12 + 5 * STEPS_PER_WEEK - 1);
    const types = run.events.map((event) => event.type);
    expect(types.filter((type) => type === 'leaseSigned')).toHaveLength(1);
    expect(types.filter((type) => type === 'leaseRenewed')).toHaveLength(1);
    expect(run.state.money - tower.money).toBe(5 * 10_000);
    expect(run.state.units[unitId]?.lease).toEqual({
      anchorStep: TUESDAY_09_12 + TERM,
      nextDueStep: TUESDAY_09_12 + TERM + STEPS_PER_WEEK,
      weekVisits: 0,
    });
  });

  it('books rent under the rent ledger category', () => {
    const { tower, engine } = leaseRun({ moveInAt: 1 });
    const run = engine.step(tower, [], 1);
    expect(run.state.ledger.currentWeek.rent.income).toBe(10_000);
  });

  it('marks the unit used and emits leaseSigned at move-in', () => {
    const { tower, unitId, engine } = leaseRun({ moveInAt: 5 });
    const run = engine.step(tower, [], 5);
    expect(run.state.units[unitId]?.used).toBe(true);
    expect(run.events).toEqual([{ type: 'leaseSigned', step: 5, unitId }]);
  });

  it('applies a price change from the next payment, not the current week', () => {
    const { tower, unitId, engine } = leaseRun({ moveInAt: 10 });
    const signed = engine.step(tower, [], 20).state;
    unitOf(signed, unitId).priceLevel = 'high';
    const before = engine.step(signed, [], stepsTo(signed, 10 + STEPS_PER_WEEK - 1)).state;
    expect(before.money - tower.money).toBe(10_000);
    const after = engine.step(before, [], 1).state;
    expect(after.money - before.money).toBe(15_000);
  });

  it('renews on good or fair and pays week 1 of the new term at once', () => {
    for (const evaluation of ['good', 'fair'] as const) {
      const { tower, unitId, engine } = leaseRun({ moveInAt: 10, evaluate: () => evaluation });
      const before = engine.step(tower, [], 10 + TERM - 1);
      const after = engine.step(before.state, [], 1);
      expect(after.state.money - before.state.money).toBe(10_000);
      expect(after.events).toEqual([{ type: 'leaseRenewed', step: 10 + TERM, unitId }]);
    }
  });

  it('lets the tenant leave on a poor evaluation without paying', () => {
    const { tower, unitId, engine } = leaseRun({ moveInAt: 10, evaluate: () => 'poor' });
    const before = engine.step(tower, [], 10 + TERM - 1);
    const after = engine.step(before.state, [], 1);
    expect(after.state.money).toBe(before.state.money);
    expect(after.state.units[unitId]?.lease).toBeNull();
    expect(after.events).toEqual([
      { type: 'leaseEnded', step: 10 + TERM, unitId },
      { type: 'news', step: 10 + TERM, key: 'news.officeLeft', unitId },
    ]);
    const later = engine.step(after.state, [], 2 * STEPS_PER_WEEK);
    expect(later.state.money).toBe(after.state.money);
  });

  it('charges a shop at bajo $10,000 a week and reports its own news on leaving', () => {
    const { tower, unitId, engine } = leaseRun({
      type: 'retail-shop',
      moveInAt: 10,
      evaluate: () => 'poor',
    });
    unitOf(tower, unitId).priceLevel = 'low';
    const run = engine.step(tower, [], 10 + TERM);
    expect(run.state.money - tower.money).toBe(4 * 10_000);
    expect(run.events.at(-1)).toEqual({
      type: 'news',
      step: 10 + TERM,
      key: 'news.shopLeftEvaluation',
      unitId,
    });
  });

  it('takes a new tenant the same day with a new anchor', () => {
    const leaveAt = 10 + TERM;
    const { tower, unitId } = towerWithOneUnit('office');
    const engine = createEngine({
      commandHandlers: {},
      systems: [
        moveInSystem(unitId, 10),
        createLeaseSystem(() => 'poor'),
        moveInSystem(unitId, leaveAt + 360),
      ],
    });
    const run = engine.step(tower, [], leaveAt + 360);
    expect(run.state.units[unitId]?.lease).toEqual({
      anchorStep: leaveAt + 360,
      nextDueStep: leaveAt + 360 + STEPS_PER_WEEK,
      weekVisits: 0,
    });
  });

  it('earns nothing without a tenant', () => {
    const { tower, engine } = leaseRun({ moveInAt: -1 });
    const run = engine.step(tower, [], 2 * STEPS_PER_WEEK);
    expect(run.state.money).toBe(tower.money);
  });

  it('refuses a move-in on a unit that is not an office or shop, or already rented', () => {
    const { tower, unitId } = towerWithOneUnit('office');
    const context = { state: tower, events: [] };
    expect(() => moveInTenant(context, 'u999')).toThrow();
    moveInTenant(context, unitId);
    expect(() => moveInTenant(context, unitId)).toThrow();
  });
});

describe('shop early leave (economy 4.3)', () => {
  const MOVE_IN = 10;

  function newsOf(events: readonly EngineEvent[]): string[] {
    return events.flatMap((event) => (event.type === 'news' ? [event.key] : []));
  }

  it('lets a shop with 69 visits leave at the payment step without paying', () => {
    const { tower, unitId, engine } = leaseRun({
      type: 'retail-shop',
      moveInAt: MOVE_IN,
      weeklyVisits: 69,
    });
    const before = engine.step(tower, [], MOVE_IN + STEPS_PER_WEEK - 1).state;
    const run = engine.step(before, [], 1);
    expect(run.state.money).toBe(before.money);
    expect(run.state.units[unitId]?.lease).toBeNull();
    expect(run.events).toEqual([
      { type: 'leaseEnded', step: MOVE_IN + STEPS_PER_WEEK, unitId },
      { type: 'news', step: MOVE_IN + STEPS_PER_WEEK, key: 'news.shopLeftNoCustomers', unitId },
    ]);
  });

  it('keeps a shop with 70 visits, which pays, and lets it leave a later week with 69', () => {
    const { tower, unitId, engine } = leaseRun({
      type: 'retail-shop',
      moveInAt: MOVE_IN,
      weeklyVisits: [70, 69],
    });
    const firstWeek = engine.step(tower, [], MOVE_IN + STEPS_PER_WEEK);
    expect(firstWeek.state.money - tower.money).toBe(2 * 15_000);
    expect(firstWeek.state.units[unitId]?.lease).toMatchObject({ weekVisits: 0 });
    const secondWeek = engine.step(firstWeek.state, [], STEPS_PER_WEEK);
    expect(secondWeek.state.money).toBe(firstWeek.state.money);
    expect(newsOf(secondWeek.events)).toEqual(['news.shopLeftNoCustomers']);
  });

  it('checks before the end-of-term evaluation, which then never runs', () => {
    let evaluations = 0;
    const { tower, unitId, engine } = leaseRun({
      type: 'retail-shop',
      moveInAt: MOVE_IN,
      weeklyVisits: [70, 70, 70, 69],
      evaluate: () => {
        evaluations += 1;
        return 'good';
      },
    });
    const run = engine.step(tower, [], MOVE_IN + TERM);
    expect(evaluations).toBe(0);
    expect(run.state.units[unitId]?.lease).toBeNull();
    expect(newsOf(run.events)).toEqual(['news.shopLeftNoCustomers']);
  });

  it('never checks at the move-in step', () => {
    const { tower, unitId, engine } = leaseRun({
      type: 'retail-shop',
      moveInAt: MOVE_IN,
      weeklyVisits: 0,
    });
    const run = engine.step(tower, [], MOVE_IN);
    expect(run.state.money - tower.money).toBe(15_000);
    expect(run.state.units[unitId]?.lease).not.toBeNull();
  });

  it('never lets an office leave early, even with no visits', () => {
    const { tower, unitId, engine } = leaseRun({ moveInAt: MOVE_IN, weeklyVisits: 0 });
    const run = engine.step(tower, [], MOVE_IN + 3 * STEPS_PER_WEEK);
    expect(run.state.money - tower.money).toBe(4 * 10_000);
    expect(run.state.units[unitId]?.lease).not.toBeNull();
  });

  it('counts visits only for a shop with a tenant', () => {
    const { tower, unitId } = towerWithOneUnit('retail-shop');
    const shop = unitOf(tower, unitId);
    recordShopVisit(shop);
    expect(shop.lease).toBeNull();
    moveInTenant({ state: tower, events: [] }, unitId);
    recordShopVisit(shop);
    expect(tower.units[unitId]?.lease?.weekVisits).toBe(1);
  });
});
