import {
  addPerson,
  chargeMoney,
  createTower,
  creditMoney,
  followPerson,
  rollLedgerWeek,
  setStructure,
  STEPS_PER_DAY,
} from '@tower-magnate/engine';
import { SnapshotSchema, type TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { buildSnapshot } from './snapshot';

const STEPS_PER_WEEK = 7 * STEPS_PER_DAY;
const LOBBY_VIEW = { levelFrom: 1, levelTo: 3, xFrom: 0, xTo: 50 };

function towerWithPeople(): TowerState {
  const state = createTower(7);
  setStructure(state.grid, 1, 0, 9, 'lobby');
  setStructure(state.grid, 2, 0, 19, 'floor');
  state.units.u5 = { id: 'u5', type: 'office', x: 0, level: 2, name: 'Oficina' };
  state.units.u6 = { id: 'u6', type: 'office', x: 9, level: 2, name: null };
  addPerson(state, { kind: 'officeWorker', homeUnit: 5, level: 2, column: 3 });
  addPerson(state, { kind: 'officeWorker', homeUnit: 5, level: 2, column: 80 });
  addPerson(state, { kind: 'maid', homeUnit: 0, level: 30, column: 4 });
  return state;
}

describe('snapshot from tower state', () => {
  it('passes the shared schema and leaves out engine internals', () => {
    const snapshot = buildSnapshot(towerWithPeople(), LOBBY_VIEW);

    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
    const text = JSON.stringify(snapshot);
    for (const field of ['rng', 'dueStep', 'nameSeed', 'nextId', 'occupants']) {
      expect(text).not.toContain(`"${field}"`);
    }
  });

  it('draws structure rows one character per column', () => {
    const snapshot = buildSnapshot(towerWithPeople(), null);

    expect(snapshot.grid.levels['1']?.structure).toBe('l'.repeat(10) + '.'.repeat(365));
    expect(snapshot.grid.levels['2']?.structure).toBe('f'.repeat(20) + '.'.repeat(355));
  });

  it('marks units with tenants as occupied', () => {
    const snapshot = buildSnapshot(towerWithPeople(), null);

    expect(snapshot.units).toEqual([
      expect.objectContaining({ id: 'u5', name: 'Oficina', occupied: true, variant: 'occupied' }),
      expect.objectContaining({ id: 'u6', name: null, occupied: false, variant: 'empty' }),
    ]);
    expect(snapshot.overlays.price).toEqual({ u5: 'normal', u6: 'normal' });
  });

  it('sends only the people inside the viewport', () => {
    const snapshot = buildSnapshot(towerWithPeople(), LOBBY_VIEW);

    expect(snapshot.people.map((person) => person.id)).toEqual(['p1']);
    expect(snapshot.people[0]).toMatchObject({ x: 3, level: 2, mode: 'inside', carRef: null });
  });

  it('sends no people without a viewport', () => {
    expect(buildSnapshot(towerWithPeople(), null).people).toEqual([]);
  });

  it('sends followed people wherever they are', () => {
    const state = towerWithPeople();
    followPerson(state.people, 3);

    const snapshot = buildSnapshot(state, LOBBY_VIEW);

    expect(snapshot.followed).toEqual([
      { id: 'p3', name: 'p3', kind: 'maid', level: 30, x: 4, stress: 'normal' },
    ]);
  });

  it('counts the population without maids', () => {
    expect(buildSnapshot(towerWithPeople(), null).population).toBe(2);
  });

  it('reports this and last week of the ledger by money reason', () => {
    const state = towerWithPeople();
    creditMoney(state, 'rent', 5000);
    rollLedgerWeek(state);
    chargeMoney(state, 'construction', 1200);
    chargeMoney(state, 'upkeep', 300);
    state.step = STEPS_PER_WEEK + 100;

    const { finances, money } = buildSnapshot(state, null);

    expect(money).toBe(state.money);
    expect(finances).toEqual({
      thisWeek: {
        weekStartStep: STEPS_PER_WEEK,
        income: {},
        expenses: { construction: -1200, upkeep: -300 },
      },
      lastWeek: { weekStartStep: 0, income: { rent: 5000 }, expenses: {} },
    });
  });

  it('has no last week during the first week', () => {
    expect(buildSnapshot(createTower(7), null).finances.lastWeek).toBeNull();
  });
});
