import type { CarView, ShaftView, TransportView, UnitView } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { levelToIndex } from '../../render/levels';
import {
  combineOutcomes,
  floorRunConfirmation,
  indemnityOf,
  pickDemolition,
  unitsInSpan,
  unlistCommands,
  type DemolishWorld,
} from './demolishPlan';

const unit = (over: Partial<UnitView>): UnitView => ({
  id: 'u1',
  type: 'office',
  x: 10,
  level: 2,
  name: null,
  price: 1000,
  occupied: false,
  variant: 'empty',
  ...over,
});

const shaft: ShaftView = { id: 's1', type: 'standard', x: 40, bottom: 1, top: 5, stops: [1, 5] };
const car: CarView = {
  shaftId: 's1',
  index: 0,
  position: levelToIndex(3),
  direction: 'idle',
  doors: 'closed',
  load: 0,
};

function world(over: Partial<DemolishWorld> = {}): DemolishWorld {
  return {
    structure: new Map([
      [2, 'f'.repeat(60)],
      [1, 'l'.repeat(60)],
    ]),
    units: [],
    transports: [],
    shafts: [],
    cars: [],
    ...over,
  };
}

describe('pickDemolition', () => {
  it('returns nothing over empty sky', () => {
    expect(pickDemolition(world(), { x: 3, level: 9 })).toBeNull();
  });

  it('picks a floor tile and a lobby tile as one-column runs', () => {
    const floor = pickDemolition(world(), { x: 3, level: 2 });
    expect(floor?.command).toEqual({
      type: 'demolish',
      target: { kind: 'floor', level: 2, x0: 3, x1: 3 },
    });
    expect(floor?.run).toBe('floor');
    expect(pickDemolition(world(), { x: 3, level: 1 })?.run).toBe('lobby');
  });

  it('prefers a unit over the floor under it, without asking for an office', () => {
    const pick = pickDemolition(world({ units: [unit({})] }), { x: 12, level: 2 });
    expect(pick?.command).toEqual({ type: 'demolish', target: { kind: 'unit', id: 'u1' } });
    expect(pick?.confirmation).toBeNull();
  });

  it('asks before demolishing a cinema', () => {
    const cinema = unit({ type: 'cinema' });
    const pick = pickDemolition(world({ units: [cinema] }), { x: 10, level: 2 });
    expect(pick?.confirmation).toMatchObject({ kind: 'expensive', unitType: 'cinema' });
  });

  it('asks before demolishing a sold condo', () => {
    const condo = unit({ type: 'condo', occupied: true });
    const pick = pickDemolition(world({ units: [condo] }), { x: 10, level: 2 });
    expect(pick?.confirmation?.kind).toBe('soldCondo');
  });

  it('picks the car before its shaft, and the shaft where no car is', () => {
    const shafts = [shaft];
    const cars = [car, { ...car, index: 1, position: levelToIndex(4) }];
    expect(pickDemolition(world({ shafts, cars }), { x: 40, level: 3 })?.command).toEqual({
      type: 'removeCar',
      shaftId: 's1',
      carIndex: 0,
    });
    const top = pickDemolition(world({ shafts, cars }), { x: 40, level: 5 });
    expect(top?.command).toEqual({ type: 'demolish', target: { kind: 'shaft', id: 's1' } });
    expect(top?.confirmation).not.toBeNull();
  });

  it('turns a click on the last car into the whole shaft, with the last-car confirmation', () => {
    const shafts = [shaft];
    for (const level of [1, 3]) {
      const cars = [{ ...car, position: levelToIndex(level) }];
      const pick = pickDemolition(world({ shafts, cars }), { x: 41, level });
      expect(pick?.command).toEqual({ type: 'demolish', target: { kind: 'shaft', id: 's1' } });
      expect(pick?.confirmation).toMatchObject({ kind: 'lastCar', unitType: 'standard-elevator' });
      expect(pick?.footprint).toMatchObject({ level: 1, floors: 5 });
    }
    // Away from the car, the middle of the shaft still offers nothing.
    expect(pickDemolition(world({ shafts, cars: [car] }), { x: 41, level: 2 })).toBeNull();
  });

  it('demolishes a shaft only from its base or its top, with a confirmation', () => {
    const shafts = [shaft];
    const base = pickDemolition(world({ shafts }), { x: 41, level: 1 });
    expect(base?.command).toEqual({ type: 'demolish', target: { kind: 'shaft', id: 's1' } });
    expect(base?.confirmation).toMatchObject({ kind: 'expensive' });
    expect(pickDemolition(world({ shafts }), { x: 41, level: 5 })?.confirmation).not.toBeNull();
    expect(pickDemolition(world({ shafts }), { x: 41, level: 3 })).toBeNull();
    expect(pickDemolition(world({ shafts }), { x: 41, level: 2 })).toBeNull();
  });

  it('picks a transport', () => {
    const stairs: TransportView = { id: 't1', type: 'stairs', x: 20, level: 2 };
    const pick = pickDemolition(world({ transports: [stairs] }), { x: 20, level: 2 });
    expect(pick?.command).toEqual({ type: 'demolish', target: { kind: 'transport', id: 't1' } });
  });

  it('picks ruins behind a shaft instead of the shaft', () => {
    const ruined = world({
      structure: new Map([[2, `${'f'.repeat(41)}r${'f'.repeat(18)}`]]),
      shafts: [shaft],
    });
    expect(pickDemolition(ruined, { x: 41, level: 2 })?.command).toEqual({
      type: 'demolish',
      target: { kind: 'ruins', level: 2, x: 41 },
    });
    expect(pickDemolition(ruined, { x: 40, level: 2 })).toBeNull();
  });

  it('picks a unit before ruins, and ruins before lobby and floor', () => {
    const ruined = world({
      structure: new Map([
        [2, 'ffrrff'],
        [1, 'llllll'],
      ]),
      units: [unit({ x: 3, level: 2 })],
    });
    expect(pickDemolition(ruined, { x: 3, level: 2 })?.command).toEqual({
      type: 'demolish',
      target: { kind: 'unit', id: 'u1' },
    });
    const ruins = pickDemolition(world({ structure: ruined.structure }), { x: 3, level: 2 });
    expect(ruins?.command).toEqual({ type: 'demolish', target: { kind: 'ruins', level: 2, x: 3 } });
    expect(ruins?.run).toBe('ruins');
    expect(ruins?.footprint).toEqual({ x: 3, level: 2, width: 1, floors: 1 });
    expect(pickDemolition(ruined, { x: 1, level: 2 })?.run).toBe('floor');
    expect(pickDemolition(ruined, { x: 3, level: 1 })?.run).toBe('lobby');
  });
});

describe('combineOutcomes', () => {
  it('sums charges and refunds when every command is accepted', () => {
    expect(
      combineOutcomes([
        { ok: true, cost: 0, refund: 500 },
        { ok: true, cost: 10, refund: 700 },
      ]),
    ).toEqual({ ok: true, cost: 10, refund: 1200 });
  });

  it('returns a single refusal when some commands are rejected', () => {
    expect(
      combineOutcomes([
        { ok: true, cost: 0, refund: 500 },
        { ok: false, error: 'CELL_OCCUPIED' },
        { ok: false, error: 'CELL_OCCUPIED' },
      ]),
    ).toEqual({ ok: false, error: 'CELL_OCCUPIED' });
  });
});

describe('rented units', () => {
  const rented = unit({ rent: 12_000, listed: true, occupied: true });

  it('asks before demolishing a rented office and names a week of rent', () => {
    const pick = pickDemolition(world({ units: [rented] }), { x: 12, level: 2 });
    expect(pick?.confirmation).toMatchObject({ kind: 'rented', unitType: 'office', indemnity: 12_000 });
    expect(unlistCommands(pick!.confirmation!)).toEqual([
      { type: 'setListed', unitId: 'u1', listed: false },
    ]);
  });

  it('offers no unlisting for a unit that is already unlisted', () => {
    const pick = pickDemolition(world({ units: [{ ...rented, listed: false }] }), {
      x: 12,
      level: 2,
    });
    expect(pick?.confirmation?.kind).toBe('rented');
    expect(unlistCommands(pick!.confirmation!)).toEqual([]);
  });

  it('does not ask for an unrented office', () => {
    const pick = pickDemolition(world({ units: [unit({ listed: true })] }), { x: 12, level: 2 });
    expect(pick?.confirmation).toBeNull();
  });

  it('sums one week of rent over the rented units', () => {
    expect(indemnityOf([{ rent: 5000 }, {}, { rent: 7000 }])).toBe(12_000);
  });
});

describe('floor run over units', () => {
  const rented = unit({ id: 'a', x: 10, rent: 12_000, listed: true, occupied: true });
  const rentedUnlisted = unit({ id: 'b', x: 30, rent: 5000, listed: false, occupied: true });
  const empty = unit({ id: 'c', x: 40 });

  it('finds the units whose footprint touches the span on that level only', () => {
    const units = [rented, rentedUnlisted, empty, unit({ id: 'd', x: 10, level: 3 })];
    expect(unitsInSpan(units, 2, 5, 11).map((u) => u.id)).toEqual(['a']);
    expect(unitsInSpan(units, 2, 30, 0).map((u) => u.id)).toEqual(['a', 'b']);
    expect(unitsInSpan(units, 2, 0, 3)).toEqual([]);
  });

  it('asks nothing when the span has only walls', () => {
    expect(floorRunConfirmation(world({ units: [rented] }), 2, 0, 3)).toBeNull();
  });

  it('asks nothing for unrented units', () => {
    expect(floorRunConfirmation(world({ units: [empty] }), 2, 38, 45)).toBeNull();
  });

  it('sums the rent of the rented units and unlists only those still listed', () => {
    const confirmation = floorRunConfirmation(
      world({ units: [rented, rentedUnlisted, empty] }),
      2,
      0,
      50,
    );
    expect(confirmation).toMatchObject({ kind: 'rented', indemnity: 17_000, units: 3 });
    expect(unlistCommands(confirmation!)).toEqual([
      { type: 'setListed', unitId: 'a', listed: false },
    ]);
  });

  it('asks about sold condos', () => {
    const condo = unit({ id: 'k', type: 'condo', x: 20, occupied: true });
    expect(floorRunConfirmation(world({ units: [condo] }), 2, 20, 21)).toMatchObject({
      kind: 'soldCondo',
      units: 1,
    });
  });
});
