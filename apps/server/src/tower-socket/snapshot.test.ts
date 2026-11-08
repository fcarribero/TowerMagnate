import {
  addPerson,
  chargeMoney,
  createTower,
  creditMoney,
  defaultSchedule,
  followPerson,
  openBombThreat,
  openFire,
  rollLedgerWeek,
  setStructure,
  STEPS_PER_DAY,
  TREK_PHASES,
  type TrekPhase,
} from '@tower-magnate/engine';
import { levelToIndex, SnapshotSchema, type TowerState, type Unit } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { buildSnapshot } from './snapshot';

const STEPS_PER_WEEK = 7 * STEPS_PER_DAY;
const LOBBY_VIEW = { levelFrom: 1, levelTo: 3, xFrom: 0, xTo: 50 };

function office(id: string, x: number, name: string | null): Unit {
  return {
    id,
    type: 'office',
    x,
    level: 2,
    name,
    priceLevel: 'normal',
    paid: 0,
    placedAtStep: 0,
    used: false,
    lease: null,
    sale: null,
    hotel: null,
  };
}

function towerWithPeople(): TowerState {
  const state = createTower(7);
  setStructure(state.grid, 1, 0, 9, 'lobby');
  setStructure(state.grid, 2, 0, 19, 'floor');
  state.units.u5 = office('u5', 0, 'Oficina');
  state.units.u6 = office('u6', 9, null);
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

  it('sends the notices with their unit and time', () => {
    const state = createTower(7);
    state.notices.push({ id: 'n5.0', step: 5, key: 'news.officeLeft', unitId: 'u1' });

    const snapshot = buildSnapshot(state, null);

    expect(snapshot.notices).toEqual([
      { id: 'n5.0', step: 5, key: 'news.officeLeft', unitId: 'u1', params: {} },
    ]);
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('sends open decisions with ransom and fire level, also after a reconnect', () => {
    const state = createTower(7);
    openBombThreat({ state, events: [] }, 300_000);

    const snapshot = buildSnapshot(structuredClone(state), null);

    expect(snapshot.activeEvents).toEqual([
      {
        kind: 'decision',
        id: 'e1',
        decision: 'bomb',
        deadlineStep: 360,
        options: ['pay', 'refuse'],
        ransom: 300_000,
      },
    ]);
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('sends an open fire with the level it burns on', () => {
    const state = createTower(7);
    openFire({ state, events: [] }, 8);

    expect(buildSnapshot(state, null).activeEvents).toMatchObject([
      { kind: 'decision', decision: 'fire', level: 8 },
    ]);
  });

  it('sends the placed stairs and escalators', () => {
    const state = createTower(7);
    state.transports.t3 = { id: 't3', type: 'stairs', x: 4, level: 1 };
    state.transports.t4 = { id: 't4', type: 'escalator', x: 8, level: 2 };

    const snapshot = buildSnapshot(state, null);

    expect(snapshot.transports).toEqual([
      { id: 't3', type: 'stairs', x: 4, level: 1 },
      { id: 't4', type: 'escalator', x: 8, level: 2 },
    ]);
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('sends each shaft with its cars', () => {
    const state = createTower(7);
    state.shafts.s1 = {
      id: 's1',
      type: 'standard',
      x: 40,
      bottom: 1,
      top: 3,
      stops: [1, 2, 3],
      schedule: defaultSchedule(),
      cars: [
        {
          homeLevel: 1,
          level: 1,
          riders: [],
          trips: [],
          phase: 'idle' as const,
          direction: 'idle' as const,
          phaseStepsLeft: 0,
          assigned: [],
          paid: 0,
          placedAtStep: 0,
        },
        {
          homeLevel: 3,
          level: 2,
          riders: ['p1', 'p2'],
          trips: [],
          phase: 'idle' as const,
          direction: 'idle' as const,
          phaseStepsLeft: 0,
          assigned: [],
          paid: 0,
          placedAtStep: 0,
        },
      ],
      queues: {},
      paid: 0,
      placedAtStep: 0,
    };

    const snapshot = buildSnapshot(state, null);

    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.shafts).toEqual([
      { id: 's1', type: 'standard', x: 40, bottom: 1, top: 3, stops: [1, 2, 3] },
    ]);
    expect(
      snapshot.cars.map(({ shaftId, index, position, load }) => [shaftId, index, position, load]),
    ).toEqual([
      ['s1', 0, levelToIndex(1), 0],
      ['s1', 1, levelToIndex(2), 2],
    ]);
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

  it('maps each trip phase to a person mode', () => {
    const wide = { levelFrom: 1, levelTo: 40, xFrom: 0, xTo: 100 };
    const expected: Record<TrekPhase, string> = {
      idle: 'inside',
      walkingToDestination: 'walk',
      walkingToStairs: 'walk',
      walkingToEscalator: 'walk',
      walkingToShaft: 'walk',
      onStairs: 'stairs',
      onEscalator: 'stairs',
      queued: 'wait',
      waitingBesideQueue: 'wait',
      riding: 'ride',
    };
    for (const phase of TREK_PHASES) {
      const state = towerWithPeople();
      state.people.trek[0] = TREK_PHASES.indexOf(phase);
      state.people.trip[0] = phase === 'idle' ? 0 : 1;
      const snapshot = buildSnapshot(state, wide);
      expect(snapshot.people[0]?.mode, phase).toBe(expected[phase]);
    }
  });

  it('keeps the last horizontal facing while the person is not walking', () => {
    const state = towerWithPeople();
    state.people.facing[0] = 1;
    for (const phase of TREK_PHASES) {
      state.people.trek[0] = TREK_PHASES.indexOf(phase);
      expect(buildSnapshot(state, LOBBY_VIEW).people[0]?.facing, phase).toBe('left');
    }
    state.people.facing[0] = 0;
    expect(buildSnapshot(state, LOBBY_VIEW).people[0]?.facing).toBe('right');
  });

  it('sets carRef and the car position only while riding', () => {
    const state = towerWithPeople();
    state.shafts.s1 = {
      id: 's1',
      type: 'standard',
      x: 5,
      bottom: 1,
      top: 3,
      stops: [1, 2, 3],
      schedule: defaultSchedule(),
      cars: [
        {
          homeLevel: 1,
          level: 3,
          riders: ['p1'],
          trips: [],
          phase: 'moving' as const,
          direction: 'up' as const,
          phaseStepsLeft: 0,
          assigned: [],
          paid: 0,
          placedAtStep: 0,
        },
      ],
      queues: {},
      paid: 0,
      placedAtStep: 0,
    };
    state.people.trek[0] = TREK_PHASES.indexOf('queued');
    expect(buildSnapshot(state, LOBBY_VIEW).people[0]).toMatchObject({
      mode: 'wait',
      carRef: null,
    });

    state.people.trek[0] = TREK_PHASES.indexOf('riding');
    expect(buildSnapshot(state, LOBBY_VIEW).people[0]).toMatchObject({
      mode: 'ride',
      carRef: { shaftId: 's1', index: 0 },
      x: 5,
      level: 3,
    });
  });

  it('tints stress at 90 and 180 steps', () => {
    const state = towerWithPeople();
    const steps = [89, 90, 180];
    steps.forEach((value, index) => {
      state.people.stress[index] = value;
    });

    const snapshot = buildSnapshot(state, { levelFrom: 1, levelTo: 40, xFrom: 0, xTo: 100 });

    const byId = Object.fromEntries(snapshot.people.map((person) => [person.id, person.stress]));
    expect(byId).toEqual({ p1: 'normal', p2: 'stressed', p3: 'veryStressed' });
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

  it('counts 6 for each office with a tenant', () => {
    const state = towerWithPeople();
    expect(buildSnapshot(state, null).population).toBe(0);
    (state.units.u5 as { lease: unknown }).lease = { anchorStep: 0, nextDueStep: 60480 };
    expect(buildSnapshot(state, null).population).toBe(6);
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
