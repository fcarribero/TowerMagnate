import type { TowerState, Unit, UnitId, UnitType } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { storeDailyGrades } from './unit-evaluation';
import { evaluatedByLevel, touchingUnits } from './neighbors';
import { buildTower, plainTowerPlan } from './testing';
import { ownValue, unitValue } from './unit-value';

type Placed = { type: UnitType; level: number; x: number };

/** Offices are 9 columns wide; every unit gets a tenant unless listed in `vacant`. */
function tower(units: Placed[], vacant: number[] = []): { state: TowerState; ids: UnitId[] } {
  const { state, unitIds } = buildTower({ ...plainTowerPlan(6, 0, 200), units });
  state.step = 100_000;
  unitIds.forEach((id, index) => {
    const unit = state.units[id] as Unit;
    if (vacant.includes(index)) return;
    if (unit.type === 'condo') unit.sale = { soldStep: 0 } as never;
    else if (unit.type === 'office' || unit.type === 'retail-shop') unit.lease = leaseOf();
    else if (unit.hotel) unit.hotel.stayEndStep = state.step + 1_000;
  });
  return { state, ids: unitIds as UnitId[] };
}

function leaseOf(): Unit['lease'] {
  return { rent: 10_000, anchorStep: 0, nextDueStep: 1e9 } as never;
}

/** Sets a unit's price so that its own value (fair price over price) is `value`. */
function priceFor(state: TowerState, id: UnitId, value: number): void {
  const unit = state.units[id] as Unit;
  unit.price = Math.round(unit.appraisal / value);
}

describe('touching units', () => {
  it('finds units side by side on the same level and units above or below sharing a column', () => {
    const { state, ids } = tower([
      { type: 'office', level: 3, x: 40 },
      { type: 'office', level: 3, x: 49 },
      { type: 'office', level: 3, x: 59 },
      { type: 'office', level: 4, x: 48 },
      { type: 'office', level: 2, x: 31 },
    ]);
    const near = touchingUnits(state, state.units[ids[0]!]!).map((unit) => unit.id);
    expect(near.sort()).toEqual([ids[1], ids[3]].sort());
  });

  it('finds the same units through the level index as by scanning every unit', () => {
    const { state, ids } = tower([
      { type: 'office', level: 3, x: 40 },
      { type: 'office', level: 3, x: 49 },
      { type: 'condo', level: 4, x: 30 },
      { type: 'single-room', level: 2, x: 44 },
      { type: 'office', level: 5, x: 40 },
    ]);
    const index = evaluatedByLevel(state);
    for (const id of ids) {
      const unit = state.units[id]!;
      const byScan = touchingUnits(state, unit).map((u) => u.id).sort();
      expect(touchingUnits(state, unit, index).map((u) => u.id).sort()).toEqual(byScan);
    }
  });
});

describe('neighbor pull', () => {
  function pair(ownA: number, ownB: number, vacantB = false) {
    const { state, ids } = tower(
      [
        { type: 'office', level: 3, x: 40 },
        { type: 'office', level: 3, x: 49 },
      ],
      vacantB ? [1] : [],
    );
    const [a, b] = ids as [UnitId, UnitId];
    priceFor(state, a, ownA);
    priceFor(state, b, ownB);
    return { state, a, b };
  }

  it('takes 15% of the gap to a worse neighbor', () => {
    const { state, a, b } = pair(1.0, 0.6);
    const result = unitValue(state, state.units[a]!);
    expect(result.own).toBeCloseTo(1.0, 3);
    expect(result.value).toBeCloseTo(0.94, 3);
    expect(result.pulledBy).toBe(b);
  });

  it('never lifts a unit next to a better neighbor', () => {
    const { state, a } = pair(1.0, 1.3);
    const result = unitValue(state, state.units[a]!);
    expect(result.value).toBeCloseTo(1.0, 3);
    expect(result.pulledBy).toBeNull();
  });

  it('ignores a vacant neighbor', () => {
    const { state, a } = pair(1.0, 0.3, true);
    expect(unitValue(state, state.units[a]!).pulledBy).toBeNull();
  });

  it('pulls from the neighbor own value, so two poor units do not drift day after day', () => {
    const { state, a, b } = pair(0.75, 0.6);
    expect(unitValue(state, state.units[a]!).value).toBeCloseTo(0.75 - 0.15 * 0.15, 3);
    expect(unitValue(state, state.units[b]!).pulledBy).toBeNull();
    storeDailyGrades(state);
    const first = [state.units[a]!.evaluation, state.units[b]!.evaluation];
    storeDailyGrades(state);
    expect([state.units[a]!.evaluation, state.units[b]!.evaluation]).toEqual(first);
  });

  it('counts only the single worst neighbor', () => {
    const { state, ids } = tower([
      { type: 'office', level: 3, x: 40 },
      { type: 'office', level: 3, x: 49 },
      { type: 'office', level: 3, x: 31 },
    ]);
    const [a, b, c] = ids as [UnitId, UnitId, UnitId];
    priceFor(state, a, 1.0);
    priceFor(state, b, 0.9);
    priceFor(state, c, 0.5);
    const result = unitValue(state, state.units[a]!);
    expect(result.pulledBy).toBe(c);
    expect(result.value).toBeCloseTo(0.925, 3);
  });
});

describe('own value', () => {
  it('is infinite at a price of 0', () => {
    const { state, ids } = tower([{ type: 'office', level: 3, x: 40 }]);
    state.units[ids[0]!]!.price = 0;
    expect(ownValue(state, state.units[ids[0]!]!)).toBe(Infinity);
  });

  it('uses what the hotel stay paid, not a price changed after check-in', () => {
    const { state, ids } = tower([{ type: 'single-room', level: 3, x: 40 }]);
    const room = state.units[ids[0]!]!;
    room.hotel!.stayRate = room.appraisal;
    room.price = room.appraisal * 3;
    expect(ownValue(state, room)).toBeCloseTo(1, 3);
  });
});
