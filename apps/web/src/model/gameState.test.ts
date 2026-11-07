import type { CarView, PersonView, UnitView } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { car, delta, office, shaft, snapshot, walker } from '../testing/protocolFixtures';
import { applyDelta, carKey, stateFromSnapshot } from './gameState';

describe('stateFromSnapshot', () => {
  it('indexes everything by id and rows by numeric level', () => {
    const state = stateFromSnapshot(snapshot);
    expect(state.step).toBe(100);
    expect(state.structure.get(1)).toHaveLength(375);
    expect(state.units.get('u12')).toEqual(office);
    expect(state.transports.has('t3')).toBe(true);
    expect(state.shafts.has('s4')).toBe(true);
    expect(state.cars.get(carKey(car))).toEqual(car);
    expect(state.people.get('p1')).toEqual(walker);
  });
});

describe('applyDelta', () => {
  const start = stateFromSnapshot(snapshot);

  it('keeps optional fields that the delta leaves out', () => {
    const next = applyDelta(start, delta());
    expect(next.step).toBe(101);
    expect(next.money).toBe(start.money);
    expect(next.stars).toBe(start.stars);
    expect(next.units).toBe(start.units);
    expect(next.structure).toBe(start.structure);
    expect(next.overlays).toBe(start.overlays);
    expect(next.finances).toBe(start.finances);
  });

  it('replaces optional fields that are present', () => {
    const finances = { ...snapshot.finances, lastWeek: snapshot.finances.thisWeek };
    const next = applyDelta(
      start,
      delta({ money: 5, stars: 2, population: 40, finances, activeEvents: [], followed: [] }),
    );
    expect(next).toMatchObject({ money: 5, stars: 2, population: 40, finances });
  });

  it('upserts and removes units, transports and shafts', () => {
    const condo: UnitView = { ...office, id: 'u13', type: 'condo', x: 30 };
    const next = applyDelta(
      start,
      delta({
        unitsUpserted: [condo, { ...office, occupied: false, variant: 'empty' }],
        transportsRemoved: ['t3'],
        shaftsUpserted: [{ ...shaft, top: 9 }],
      }),
    );
    expect(next.units.get('u12')?.variant).toBe('empty');
    expect(next.units.get('u13')).toEqual(condo);
    expect(next.transports.size).toBe(0);
    expect(next.shafts.get('s4')?.top).toBe(9);
    expect(start.units.get('u12')?.variant).toBe('occupied');
  });

  it('replaces whole structure rows', () => {
    const row = 'f'.repeat(10) + '.'.repeat(365);
    const next = applyDelta(start, delta({ structure: [{ level: 2, structure: row }] }));
    expect(next.structure.get(2)).toBe(row);
    expect(next.structure.get(1)).toBe(start.structure.get(1));
  });

  it('drops cars and people that a delta no longer lists', () => {
    const rider: PersonView = {
      ...walker,
      id: 'p2',
      mode: 'ride',
      carRef: { shaftId: 's4', index: 1 },
    };
    const secondCar: CarView = { ...car, index: 1, position: 2 };
    const next = applyDelta(
      start,
      delta({ cars: [secondCar], people: [rider], peopleGone: ['p1'] }),
    );
    expect([...next.cars.keys()]).toEqual([carKey(secondCar)]);
    expect([...next.people.keys()]).toEqual(['p2']);
  });

  it('merges only the overlay layers the delta sends', () => {
    const next = applyDelta(start, delta({ overlays: { evaluation: { u12: 'poor' } } }));
    expect(next.overlays.evaluation).toEqual({ u12: 'poor' });
    expect(next.overlays.price).toBe(start.overlays.price);
  });
});
