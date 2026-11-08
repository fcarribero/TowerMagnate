import type { PriceLevel, QueuedCommand, TowerState, UnitId } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { createLeaseSystem, moveInTenant, STEPS_PER_WEEK } from '../leases';
import { createEngine, step } from '../step';
import { setPrice as setPriceHandler } from './set-price';
import { buildTower, plainTowerPlan } from '../testing';

type PricedType = 'office' | 'retail-shop' | 'single-room' | 'condo' | 'fast-food';

function towerWith(type: PricedType): { tower: TowerState; unitId: UnitId } {
  const plan = { ...plainTowerPlan(3, 0, 40), units: [{ type, x: 0, level: 2 }] };
  const { state, unitIds } = buildTower(plan);
  return { tower: state, unitId: unitIds[0] as UnitId };
}

function setPrice(unitId: string, price: PriceLevel): QueuedCommand {
  return { id: 'c1', command: { type: 'setPrice', unitId, price } };
}

describe('setPrice', () => {
  it.each<[PricedType]>([['office'], ['retail-shop'], ['single-room'], ['condo']])(
    'changes the level of a %s at no cost',
    (type) => {
      const { tower, unitId } = towerWith(type);
      const { state, results } = step(tower, [setPrice(unitId, 'low')], 0);
      expect(results).toEqual([{ id: 'c1', ok: true, step: 0, cost: 0, refund: 0 }]);
      expect(state.units[unitId]?.priceLevel).toBe('low');
      expect(state.money).toBe(tower.money);
    },
  );

  it('works with a negative balance and charges nothing', () => {
    const { tower, unitId } = towerWith('office');
    tower.money = -1;
    const { state, results } = step(tower, [setPrice(unitId, 'minimum')], 0);
    expect(results[0]).toMatchObject({ ok: true, cost: 0 });
    expect(state.money).toBe(-1);
    expect(state.units[unitId]?.priceLevel).toBe('minimum');
  });

  it('refuses a sold condo with PRICE_LOCKED', () => {
    const { tower, unitId } = towerWith('condo');
    const condo = tower.units[unitId];
    if (!condo) throw new Error('missing condo');
    condo.sale = { price: 150_000, anchorStep: 0, nextEvaluationStep: STEPS_PER_WEEK };
    const { state, results } = step(tower, [setPrice(unitId, 'high')], 0);
    expect(results[0]).toMatchObject({ ok: false, error: 'PRICE_LOCKED' });
    expect(state.units[unitId]?.priceLevel).toBe('normal');
  });

  it('refuses a unit without a price with NOT_PRICED', () => {
    const { tower, unitId } = towerWith('fast-food');
    const { results } = step(tower, [setPrice(unitId, 'high')], 0);
    expect(results[0]).toMatchObject({ ok: false, error: 'NOT_PRICED' });
  });

  it('refuses an unknown id with UNKNOWN_ENTITY', () => {
    const { tower } = towerWith('office');
    const { results } = step(tower, [setPrice('u999', 'high')], 0);
    expect(results[0]).toMatchObject({ ok: false, error: 'UNKNOWN_ENTITY' });
  });

  it('refuses a level that does not exist', () => {
    const { tower, unitId } = towerWith('office');
    const bad = { id: 'c1', command: { type: 'setPrice', unitId, price: 'free' } };
    const { results } = step(tower, [bad as unknown as QueuedCommand], 0);
    expect(results[0]).toMatchObject({ ok: false, error: 'INVALID_COMMAND' });
  });

  it('does not evaluate the unit', () => {
    const { tower, unitId } = towerWith('office');
    const { events } = step(tower, [setPrice(unitId, 'high')], 0);
    expect(events).toEqual([]);
  });

  it('bills an office mid-lease at the new level from the next weekly payment', () => {
    const { tower, unitId } = towerWith('office');
    const engine = createEngine({
      commandHandlers: { setPrice: setPriceHandler },
      systems: [
        (context) => {
          if (context.state.step === 100) moveInTenant(context, unitId);
        },
        createLeaseSystem(),
      ],
    });
    const moved = engine.step(tower, [], 101).state;
    const raised = engine.step(moved, [setPrice(unitId, 'high')], 1).state;
    const beforePayment = engine.step(raised, [], 100 + STEPS_PER_WEEK - raised.step - 1).state;
    const afterPayment = engine.step(beforePayment, [], 1).state;
    expect(afterPayment.money - beforePayment.money).toBe(15_000);
  });
});
