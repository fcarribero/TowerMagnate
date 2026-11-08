import { PARKING_HOLDER_CHANCE, type Level, type TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_DAY } from './clock';
import { migrateState } from './migrations';
import { assignParking } from './parking';
import { addPeopleForUnit, addPerson, removePerson } from './people';
import { createTower } from './state';
import { buildTower } from './testing';

function context(state: TowerState) {
  return { state, events: [] as Parameters<typeof assignParking>[0]['events'] };
}

function basementTower(spaces: number[]) {
  const { state, unitIds } = buildTower({
    seed: 3,
    lobby: { x0: 0, x1: 79 },
    floors: [
      { from: 2, to: 3 as Level, x0: 0, x1: 79 },
      { from: -1 as Level, to: -1 as Level, x0: 0, x1: 79 },
    ],
    units: [
      { type: 'office', level: 2 as Level, x: 0 },
      { type: 'parking-ramp', level: -1 as Level, x: 0 },
      ...spaces.map((x) => ({ type: 'parking-space' as const, level: -1 as Level, x })),
    ],
  });
  state.stars = 3;
  return { state, unitIds };
}

function addHolders(state: TowerState, count: number): number[] {
  const ids: number[] = [];
  for (let index = 0; index < count; index++) {
    const id = addPerson(state, {
      kind: 'officeWorker',
      homeUnit: 1,
      level: 2 as Level,
      column: 0,
    });
    state.parking.spaces[id] = 0;
    ids.push(id);
  }
  return ids;
}

describe('parking holders', () => {
  it('rolls the office chance for worker 1 of a new tenant only', () => {
    let holders = 0;
    const samples = 2000;
    for (let seed = 0; seed < samples; seed++) {
      const { state, unitIds } = buildTower({
        seed,
        lobby: { x0: 0, x1: 79 },
        floors: [{ from: 2, to: 3 as Level, x0: 0, x1: 79 }],
        units: [{ type: 'office', level: 2 as Level, x: 0 }],
      });
      addPeopleForUnit(state, unitIds[0] as string);
      holders += Object.keys(state.parking.spaces).length;
    }
    expect(holders / samples).toBeGreaterThan(PARKING_HOLDER_CHANCE.office - 0.03);
    expect(holders / samples).toBeLessThan(PARKING_HOLDER_CHANCE.office + 0.03);
  });

  it('forgets a holder who is removed', () => {
    const state = createTower(1);
    const [id] = addHolders(state, 1);
    removePerson(state, id as number);
    expect(state.parking.spaces).toEqual({});
  });
});

describe('parking assignment', () => {
  it('gives free connected spaces to holders in person id order, lowest unit id first', () => {
    const { state, unitIds } = basementTower([16, 20]);
    const [first, second] = addHolders(state, 2);
    assignParking(context(state));
    expect(state.parking.spaces[first as number]).toBe(Number((unitIds[2] as string).slice(1)));
    expect(state.parking.spaces[second as number]).toBe(Number((unitIds[3] as string).slice(1)));
    expect(state.lastParkingFailureStep).toBeNull();
  });

  it('records a failure and one notice per day when spaces run out', () => {
    const { state } = basementTower([16]);
    addHolders(state, 3);
    const first = context(state);
    assignParking(first);
    assignParking(first);
    expect(state.lastParkingFailureStep).toBe(state.step);
    expect(first.events.filter((event) => event.type === 'news')).toHaveLength(1);
    state.step += STEPS_PER_DAY;
    const next = context(state);
    assignParking(next);
    expect(next.events).toHaveLength(1);
  });

  it('ignores spaces that do not touch the ramp chain', () => {
    const { state } = basementTower([30]);
    addHolders(state, 1);
    assignParking(context(state));
    expect(state.lastParkingFailureStep).toBe(state.step);
  });

  it('runs no pass below 3 stars', () => {
    const { state } = basementTower([16]);
    const [id] = addHolders(state, 1);
    state.stars = 2;
    assignParking(context(state));
    expect(state.parking.spaces[id as number]).toBe(0);
    expect(state.lastParkingFailureStep).toBeNull();
  });
});

describe('parking state migration', () => {
  it('adds empty parking to a version 16 save', () => {
    const { parking, ...rest } = createTower(1);
    void parking;
    const migrated = migrateState({ ...rest, schemaVersion: 16 });
    expect(migrated.parking).toEqual({ spaces: {}, noticeDay: 0, noticed: [] });
  });
});
