import type { PriceLevel, TenantEvaluation, TowerState, Unit, UnitId } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { createCondoSystem, sellCondo } from './condos';
import { STEPS_PER_WEEK } from './leases';
import { createEngine, type SimulationSystem } from './step';
import { buildTower, plainTowerPlan } from './testing';

const CHECK = 4 * STEPS_PER_WEEK;
const SALE_STEP = 1_000;

function condoTower(): { tower: TowerState; unitId: UnitId } {
  const plan = { ...plainTowerPlan(3, 0, 40), units: [{ type: 'condo' as const, x: 0, level: 2 }] };
  const { state, unitIds } = buildTower(plan);
  return { tower: state, unitId: unitIds[0] as UnitId };
}

function condoOf(state: TowerState, unitId: UnitId): Unit {
  const unit = state.units[unitId];
  if (!unit) throw new Error(`No unit ${unitId}`);
  return unit;
}

function saleAt(unitId: UnitId, steps: number[]): SimulationSystem {
  return (context) => {
    if (steps.includes(context.state.step)) sellCondo(context, unitId);
  };
}

function condoRun(options: { sellAt?: number[]; evaluate?: () => TenantEvaluation | null } = {}) {
  const { tower, unitId } = condoTower();
  const engine = createEngine({
    commandHandlers: {},
    systems: [saleAt(unitId, options.sellAt ?? [SALE_STEP]), createCondoSystem(options.evaluate)],
  });
  return { tower, unitId, engine };
}

describe('condo sale', () => {
  it.each<[PriceLevel, number]>([
    ['high', 230_000],
    ['normal', 175_000],
    ['low', 115_000],
    ['minimum', 45_000],
  ])('credits the %s price once and records it', (priceLevel, price) => {
    const { tower, unitId, engine } = condoRun();
    condoOf(tower, unitId).priceLevel = priceLevel;
    const { state, events } = engine.step(tower, [], SALE_STEP + 100);
    expect(state.money - tower.money).toBe(price);
    expect(state.ledger.currentWeek.condoSales.income).toBe(price);
    expect(condoOf(state, unitId)).toMatchObject({
      used: true,
      sale: { price, anchorStep: SALE_STEP, nextEvaluationStep: SALE_STEP + CHECK },
    });
    expect(events.filter((event) => event.type === 'condoSold')).toEqual([
      { type: 'condoSold', step: SALE_STEP, unitId },
    ]);
  });

  it('refuses to sell a unit that is not a condo or already has owners', () => {
    const { tower, unitId } = condoTower();
    const office = buildTower({
      ...plainTowerPlan(3, 0, 40),
      units: [{ type: 'office', x: 0, level: 2 }],
    });
    const context = { state: tower, events: [] };
    sellCondo(context, unitId);
    expect(() => sellCondo(context, unitId)).toThrow(/already has owners/);
    const officeContext = { state: office.state, events: [] };
    expect(() => sellCondo(officeContext, office.unitIds[0] as UnitId)).toThrow(/not a condo/);
  });
});

describe('condo owner evaluation', () => {
  it('falls exactly at S + k x 241,920 and keeps good or fair owners', () => {
    const evaluations: number[] = [];
    const { tower, unitId, engine } = condoRun({
      evaluate: () => {
        evaluations.push(0);
        return 'fair';
      },
    });
    const beforeFirst = engine.step(tower, [], SALE_STEP + CHECK - 1).state;
    expect(evaluations).toHaveLength(0);
    const afterFirst = engine.step(beforeFirst, [], 1).state;
    expect(evaluations).toHaveLength(1);
    expect(condoOf(afterFirst, unitId).sale?.nextEvaluationStep).toBe(SALE_STEP + 2 * CHECK);
    const afterSecond = engine.step(afterFirst, [], CHECK).state;
    expect(evaluations).toHaveLength(2);
    expect(afterSecond.money).toBe(afterFirst.money);
  });

  it('keeps the owners while there is no evaluation yet', () => {
    const { tower, unitId, engine } = condoRun();
    const { state } = engine.step(tower, [], SALE_STEP + CHECK + 10);
    expect(condoOf(state, unitId).sale).not.toBeNull();
  });

  it('refunds the recorded price on a poor evaluation, even into the negative', () => {
    const { tower, unitId, engine } = condoRun({ evaluate: () => 'poor' });
    const sold = engine.step(tower, [], SALE_STEP + 1).state;
    sold.money = 0;
    condoOf(sold, unitId).priceLevel = 'minimum';
    const { state, events } = engine.step(sold, [], CHECK);
    expect(state.money).toBe(-175_000);
    expect(state.ledger.currentWeek.condoBuybacks.expense).toBe(-175_000);
    expect(condoOf(state, unitId).sale).toBeNull();
    expect(events.map((event) => event.type)).toEqual([
      'unitMoney',
      'condoVacated',
      'news',
      'news',
    ]);
    expect(events[0]).toMatchObject({ unitId, reason: 'condoBuyback' });
    expect(events[0]?.type === 'unitMoney' && events[0].amount).toBeLessThan(0);
    expect(events[2]).toMatchObject({ key: 'news.condoBuyback', unitId });
    expect(events[3]).toMatchObject({ key: 'news.balanceNegative' });
  });

  it('anchors a new sale at its own step', () => {
    const resale = SALE_STEP + CHECK + 50;
    const { tower, unitId, engine } = condoRun({
      sellAt: [SALE_STEP, resale],
      evaluate: () => 'poor',
    });
    const { state } = engine.step(tower, [], resale + 1);
    expect(condoOf(state, unitId).sale).toEqual({
      price: 175_000,
      anchorStep: resale,
      nextEvaluationStep: resale + CHECK,
    });
  });
});
