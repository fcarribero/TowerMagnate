import { UNIT_CATALOG, type TowerState, type UnitType } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { hashState } from './hash';
import {
  addPeopleForUnit,
  addPerson,
  countPeopleByKind,
  createPeopleSystem,
  findPerson,
  followPerson,
  listPeople,
  NOTHING_DUE,
  peopleCount,
  personAt,
  removePeopleOfUnit,
  removePerson,
  setDueStep,
  slotOfPerson,
  unitPeople,
} from './people';
import { createTower } from './state';
import { createEngine } from './step';
import { buildTower, plainTowerPlan } from './testing';

function towerWithUnit(type: UnitType, seed = 7): { state: TowerState; unitId: string } {
  const plan = plainTowerPlan(3, 0, 60);
  plan.seed = seed;
  plan.units = [{ type, level: 2, x: 10 }];
  const { state, unitIds } = buildTower(plan);
  const [unitId] = unitIds;
  if (!unitId) throw new Error('No unit was placed');
  return { state, unitId };
}

function visitor(state: TowerState): number {
  return addPerson(state, { kind: 'customer', homeUnit: 0, level: 1, column: 0 });
}

describe('people per unit type', () => {
  it.each([
    ['office', 'officeWorker', 6],
    ['condo', 'resident', 3],
    ['single-room', 'hotelGuest', 1],
    ['double-room', 'hotelGuest', 2],
    ['suite', 'hotelGuest', 2],
    ['housekeeping', 'maid', 6],
    ['security', 'guard', 6],
  ] as const)('a %s holds %s x%i from the catalog', (type, kind, count) => {
    expect(unitPeople(type)).toEqual({ kind, count });
    const { state, unitId } = towerWithUnit(type);
    const created = addPeopleForUnit(state, unitId);
    expect(created).toHaveLength(count);
    expect(countPeopleByKind(state.people)).toEqual({ [kind]: count });
  });

  it('gives no resident people to venues, transport or structure', () => {
    for (const type of ['fast-food', 'cinema', 'cathedral', 'lobby', 'stairs'] as const) {
      expect(unitPeople(type)).toBeNull();
    }
  });

  it('places each person on the unit level, inside its columns, with nothing to do', () => {
    const { state, unitId } = towerWithUnit('office');
    addPeopleForUnit(state, unitId);
    for (const person of listPeople(state.people)) {
      expect(person.homeUnit).toBe(unitId);
      expect(person.level).toBe(2);
      expect(person.column).toBeGreaterThanOrEqual(10);
      expect(person.column).toBeLessThan(10 + UNIT_CATALOG.office.width);
      expect(person.trip).toBe(0);
      expect(person.dueStep).toBe(NOTHING_DUE);
      expect(person.stress).toBe(0);
      expect(person.followed).toBe(false);
    }
  });

  it('refuses a unit that holds nobody and a unit that does not exist', () => {
    const { state, unitId } = towerWithUnit('fast-food');
    expect(() => addPeopleForUnit(state, unitId)).toThrow('hold no people');
    expect(() => addPeopleForUnit(state, 'u999')).toThrow('does not exist');
  });
});

describe('creation', () => {
  it('gives ids in creation order, starting at p1', () => {
    const { state, unitId } = towerWithUnit('condo');
    expect(addPeopleForUnit(state, unitId)).toEqual(['p1', 'p2', 'p3']);
    expect(state.people.nextId).toBe(4);
  });

  it('is deterministic from the seed', () => {
    const first = towerWithUnit('office', 99);
    const second = towerWithUnit('office', 99);
    addPeopleForUnit(first.state, first.unitId);
    addPeopleForUnit(second.state, second.unitId);
    expect(listPeople(first.state.people)).toEqual(listPeople(second.state.people));
    expect(hashState(first.state)).toBe(hashState(second.state));
  });

  it('draws different columns and names under another seed', () => {
    const first = towerWithUnit('office', 1);
    const second = towerWithUnit('office', 2);
    addPeopleForUnit(first.state, first.unitId);
    addPeopleForUnit(second.state, second.unitId);
    const seeds = (state: TowerState) => listPeople(state.people).map((p) => p.nameSeed);
    expect(seeds(first.state)).not.toEqual(seeds(second.state));
  });

  it('holds 20,000 people in a dense pool sorted by id', () => {
    const state = createTower(5);
    for (let index = 0; index < 20_000; index++) visitor(state);
    expect(peopleCount(state.people)).toBe(20_000);
    expect(state.people.id.every((id, slot) => id === slot + 1)).toBe(true);
  });
});

describe('removal', () => {
  it('removes the 6 workers of a demolished office and nobody else', () => {
    const plan = plainTowerPlan(3, 0, 60);
    plan.units = [
      { type: 'office', level: 2, x: 0 },
      { type: 'office', level: 2, x: 20 },
    ];
    const { state, unitIds } = buildTower(plan);
    const [demolished, kept] = unitIds as [string, string];
    addPeopleForUnit(state, demolished);
    addPeopleForUnit(state, kept);
    visitor(state);

    const removed = removePeopleOfUnit(state, demolished);

    expect(removed).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(peopleCount(state.people)).toBe(7);
    expect(listPeople(state.people).map((person) => person.id)).toEqual([
      'p7',
      'p8',
      'p9',
      'p10',
      'p11',
      'p12',
      'p13',
    ]);
    expect(listPeople(state.people).filter((p) => p.homeUnit === demolished)).toEqual([]);
  });

  it('never reuses an id and leaves no empty slots', () => {
    const { state, unitId } = towerWithUnit('condo');
    addPeopleForUnit(state, unitId);
    removePeopleOfUnit(state, unitId);
    for (const array of [state.people.id, state.people.kind, state.people.stress]) {
      expect(array).toEqual([]);
    }
    expect(addPeopleForUnit(state, unitId)).toEqual(['p4', 'p5', 'p6']);
  });

  it('drops a removed person from the followed list', () => {
    const { state, unitId } = towerWithUnit('condo');
    addPeopleForUnit(state, unitId);
    followPerson(state.people, 2);
    removePeopleOfUnit(state, unitId);
    expect(state.people.followed).toEqual([]);
  });

  it('removes a single person and reports an unknown one', () => {
    const state = createTower(1);
    visitor(state);
    visitor(state);
    expect(removePerson(state, 1)).toBe(true);
    expect(removePerson(state, 1)).toBe(false);
    expect(findPerson(state.people, 2)?.id).toBe('p2');
    expect(slotOfPerson(state.people, 2)).toBe(0);
  });
});

describe('following', () => {
  it('follows up to 20 people and rejects the 21st', () => {
    const state = createTower(1);
    for (let index = 0; index < 21; index++) visitor(state);
    for (let id = 1; id <= 20; id++) {
      expect(followPerson(state.people, id)).toBeNull();
    }
    expect(followPerson(state.people, 21)).toBe('FOLLOW_LIMIT');
    expect(followPerson(state.people, 5)).toBeNull();
    expect(state.people.followed).toHaveLength(20);
  });

  it('rejects an unknown person', () => {
    expect(followPerson(createTower(1).people, 3)).toBe('UNKNOWN_ENTITY');
  });
});

describe('processing order', () => {
  it('handles due people in increasing id each step, skipping idle ones', () => {
    const state = createTower(1);
    for (let index = 0; index < 6; index++) visitor(state);
    for (const id of [5, 2, 4]) setDueStep(state.people, id, 1);
    setDueStep(state.people, 6, 2);
    const seen: string[] = [];
    const engine = createEngine({
      commandHandlers: {},
      systems: [
        createPeopleSystem((context, slot) => {
          seen.push(`${context.state.step}:${personAt(context.state.people, slot).id}`);
        }),
      ],
    });

    engine.step(state, [], 3);

    expect(seen).toEqual(['1:p2', '1:p4', '1:p5', '2:p6']);
  });

  it('keeps going in id order when a handler removes or adds people', () => {
    const state = createTower(1);
    for (let index = 0; index < 4; index++) visitor(state);
    for (const id of [1, 2, 3, 4]) setDueStep(state.people, id, 1);
    const seen: string[] = [];
    const engine = createEngine({
      commandHandlers: {},
      systems: [
        createPeopleSystem((context, slot) => {
          const person = personAt(context.state.people, slot);
          seen.push(person.id);
          if (person.id === 'p1') removePerson(context.state, 2);
          if (person.id === 'p3') {
            const added = visitor(context.state);
            setDueStep(context.state.people, added, context.state.step);
          }
        }),
      ],
    });

    engine.step(state, [], 1);

    expect(seen).toEqual(['p1', 'p3', 'p4', 'p5']);
  });

  it('leaves the input state untouched', () => {
    const state = createTower(1);
    visitor(state);
    const before = hashState(state);
    const engine = createEngine({
      commandHandlers: {},
      systems: [createPeopleSystem((context) => removePerson(context.state, 1))],
    });
    setDueStep(state.people, 1, 1);
    const beforeDue = hashState(state);
    const after = engine.step(state, [], 1).state;
    expect(beforeDue).not.toBe(before);
    expect(hashState(state)).toBe(beforeDue);
    expect(peopleCount(after.people)).toBe(0);
  });
});
