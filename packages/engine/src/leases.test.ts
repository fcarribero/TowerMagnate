import type { TenantEvaluation, TowerState, Unit, UnitId } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { dateOfStep } from './calendar';
import { createLeaseSystem, moveInTenant, STEPS_PER_WEEK } from './leases';
import { createEngine, type SimulationSystem } from './step';
import { buildTower, plainTowerPlan } from './testing';

const TUESDAY_09_12 = 8_640 + 9 * 360 + 12 * 6;
const TERM = 4 * STEPS_PER_WEEK;

interface Setup {
  moveInAt?: number;
  evaluate?: () => TenantEvaluation | null;
  type?: 'office' | 'retail-shop';
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

function leaseRun({ moveInAt = TUESDAY_09_12, evaluate, type = 'office' }: Setup = {}) {
  const { tower, unitId } = towerWithOneUnit(type);
  const engine = createEngine({
    commandHandlers: {},
    systems: [moveInSystem(unitId, moveInAt), createLeaseSystem(evaluate)],
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
    unitOf(signed, unitId).price = 'high';
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
    unitOf(tower, unitId).price = 'low';
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
