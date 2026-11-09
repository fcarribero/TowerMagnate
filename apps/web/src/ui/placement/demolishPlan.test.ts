import type { CarView, ShaftView, TransportView, UnitView } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { levelToIndex } from '../../render/levels';
import { pickDemolition, type DemolishWorld } from './demolishPlan';

const unit = (over: Partial<UnitView>): UnitView => ({
  id: 'u1',
  type: 'office',
  x: 10,
  level: 2,
  name: null,
  price: 'normal' as UnitView['price'],
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
    const cars = [car];
    expect(pickDemolition(world({ shafts, cars }), { x: 40, level: 3 })?.command).toEqual({
      type: 'removeCar',
      shaftId: 's1',
      carIndex: 0,
    });
    expect(pickDemolition(world({ shafts, cars }), { x: 40, level: 4 })?.command).toEqual({
      type: 'demolish',
      target: { kind: 'shaft', id: 's1' },
    });
  });

  it('picks a transport', () => {
    const stairs: TransportView = { id: 't1', type: 'stairs', x: 20, level: 2 };
    const pick = pickDemolition(world({ transports: [stairs] }), { x: 20, level: 2 });
    expect(pick?.command).toEqual({ type: 'demolish', target: { kind: 'transport', id: 't1' } });
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
