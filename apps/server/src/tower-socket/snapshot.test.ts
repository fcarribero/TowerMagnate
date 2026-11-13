import {
  addPerson,
  chargeMoney,
  createTower,
  creditMoney,
  defaultSchedule,
  encodeRoutine,
  followPerson,
  renamePerson,
  newUnit,
  openBombThreat,
  openFire,
  rollLedgerWeek,
  setStructure,
  step,
  STEPS_PER_DAY,
  TREK_PHASES,
  type RoutinePhase,
  type TrekPhase,
} from '@tower-magnate/engine';
import {
  levelToIndex,
  SnapshotSchema,
  UNIT_CATALOG,
  type HotelRoomState,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { toClientEvents } from './client-events';
import { diffSnapshots } from './delta';
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
    evaluation: null,
    venue: null,
  };
}

function towerWithPeople(): TowerState {
  const state = createTower(7);
  setStructure(state.grid, 1, 0, 9, 'lobby');
  setStructure(state.grid, 2, 0, 19, 'floor');
  state.units.u5 = office('u5', 0, 'Oficina');
  state.units.u6 = office('u6', 9, null);
  state.transports.t1 = { id: 't1', type: 'stairs', x: 4, level: 1, paid: 0, placedAtStep: 0 };
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
    state.notices.push({ id: 'n5.0', step: 5, key: 'news.officeLeft', unitId: 'u1', params: {} });

    const snapshot = buildSnapshot(state, null);

    expect(snapshot.notices).toEqual([
      { id: 'n5.0', step: 5, key: 'news.officeLeft', unitId: 'u1', params: {} },
    ]);
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('sends a notice level as its ruler label', () => {
    const state = createTower(7);
    state.notices.push({
      id: 'n5.0',
      step: 5,
      key: 'news.bombExploded',
      unitId: null,
      params: { level: 7 },
    });

    expect(buildSnapshot(state, null).notices[0]?.params).toEqual({ level: '7' });
  });

  it('sends a treasure notice with its basement label and the amount as money text', () => {
    const state = createTower(7);
    const params = { level: -3, amount: 50_000 };
    state.notices.push({ id: 'n5.0', step: 5, key: 'news.treasure', unitId: null, params });

    const snapshot = buildSnapshot(state, null);

    expect(snapshot.notices[0]?.params).toEqual({ level: 'S3', amount: '$50.000' });
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('sends the star count of a promotion notice', () => {
    const state = createTower(7);
    state.notices.push({
      id: 'n5.0',
      step: 5,
      key: 'news.starsUp',
      unitId: null,
      params: { n: 3 },
    });

    expect(buildSnapshot(state, null).notices[0]?.params).toEqual({ n: 3 });
  });

  it('sends a bomb blast notice after a reconnect as it was sent live', () => {
    const tower = createTower(7);
    openBombThreat({ state: tower, events: [] }, 300_000, { x: 0, level: 7 });

    const result = step(tower, [], STEPS_PER_DAY);

    const live = toClientEvents(result.events).find(
      (event) => event.type === 'news' && event.key === 'news.bombExploded',
    );
    const kept = buildSnapshot(structuredClone(result.state), null).notices.find(
      (notice) => notice.key === 'news.bombExploded',
    );
    expect(live).toMatchObject({ params: { level: '7' } });
    expect(kept).toMatchObject({ step: live?.step, unitId: null, params: { level: '7' } });
  });

  it('sends open decisions with ransom and fire level, also after a reconnect', () => {
    const state = createTower(7);
    openBombThreat({ state, events: [] }, 300_000, { x: 0, level: 2 });

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
    state.transports.t3 = { id: 't3', type: 'stairs', x: 4, level: 1, paid: 0, placedAtStep: 0 };
    state.transports.t4 = { id: 't4', type: 'escalator', x: 8, level: 2, paid: 0, placedAtStep: 0 };

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

  it('sends the stored price level of each unit in its view and the price overlay', () => {
    const state = towerWithPeople();
    (state.units.u5 as Unit).priceLevel = 'high';
    (state.units.u6 as Unit).priceLevel = 'low';

    const snapshot = buildSnapshot(state, null);

    expect(snapshot.units).toEqual([
      expect.objectContaining({ id: 'u5', price: 'high' }),
      expect.objectContaining({ id: 'u6', price: 'low' }),
    ]);
    expect(snapshot.overlays.price).toEqual({ u5: 'high', u6: 'low' });
  });

  it('sends the stored grade of each evaluated unit in the evaluation overlay', () => {
    const state = towerWithPeople();
    (state.units.u5 as Unit).evaluation = 'fair';
    state.units.u8 = { ...office('u8', 30, null), type: 'fast-food' };

    const snapshot = buildSnapshot(state, null);

    expect(snapshot.overlays.evaluation).toEqual({ u5: 'fair', u6: null });
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
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
      noRoute: 'walk',
    };
    for (const phase of TREK_PHASES) {
      const state = towerWithPeople();
      state.people.trek[0] = TREK_PHASES.indexOf(phase);
      state.people.trip[0] = phase === 'idle' ? 0 : 1;
      const snapshot = buildSnapshot(state, wide);
      expect(snapshot.people[0]?.mode, phase).toBe(expected[phase]);
    }
  });

  it('leaves out office workers who are still outside the tower or gave up coming in', () => {
    const routine = (phase: RoutinePhase) =>
      encodeRoutine({
        phase,
        lunchHandled: false,
        entranceOnRight: false,
        venue: 0,
        medical: false,
        lunchMinute: 720,
        leaveMinute: 1020,
      });
    const state = towerWithPeople();
    state.people.level[0] = 1;
    state.people.column[0] = 0;
    for (const phase of ['waitingToArrive', 'givingUpArrival'] as const) {
      state.people.trip[0] = routine(phase);
      expect(buildSnapshot(state, LOBBY_VIEW).people, phase).toEqual([]);
    }

    state.people.trek[0] = TREK_PHASES.indexOf('walkingToDestination');
    expect(buildSnapshot(state, LOBBY_VIEW).people.map((person) => person.id)).toEqual(['p1']);

    state.people.trek[0] = TREK_PHASES.indexOf('idle');
    state.people.trip[0] = routine('atOffice');
    expect(buildSnapshot(state, LOBBY_VIEW).people.map((person) => person.id)).toEqual(['p1']);
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
    renamePerson(state.people, 3, 'Ana');
    followPerson(state.people, 3);

    const snapshot = buildSnapshot(state, LOBBY_VIEW);

    expect(snapshot.followed).toEqual([
      { id: 'p3', name: 'Ana', kind: 'maid', level: 30, x: 4, stress: 'normal' },
    ]);
  });

  it('counts 6 for each office with a tenant', () => {
    const state = towerWithPeople();
    expect(buildSnapshot(state, null).population).toBe(0);
    (state.units.u5 as { lease: unknown }).lease = {
      anchorStep: 0,
      nextDueStep: 60480,
      weekVisits: 0,
    };
    expect(buildSnapshot(state, null).population).toBe(6);
  });

  it('lists the next star step requirements and whether each is met', () => {
    const state = towerWithPeople();
    state.stars = 2;
    expect(buildSnapshot(state, null).starRequirements).toEqual([
      { requirement: 'security', met: false },
    ]);
    state.units.u99 = newUnit('u99', 'security', 0, 2);
    expect(buildSnapshot(state, null).starRequirements).toEqual([
      { requirement: 'security', met: true },
    ]);
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

describe('room states and disconnected units', () => {
  function hotelTower(): TowerState {
    const state = createTower(7);
    setStructure(state.grid, 1, 0, 39, 'lobby');
    state.units.u1 = newUnit('u1', 'single-room', 0, 1);
    state.units.u2 = newUnit('u2', 'double-room', 6, 1);
    state.units.u3 = newUnit('u3', 'suite', 14, 1);
    state.units.u4 = newUnit('u4', 'single-room', 26, 1);
    return state;
  }

  function roomState(state: TowerState, id: string, roomState: HotelRoomState): void {
    const room = state.units[id] as Unit;
    if (room.hotel) room.hotel.state = roomState;
  }

  function variantOf(state: TowerState, id: string): string | undefined {
    return buildSnapshot(state, null).units.find((unit) => unit.id === id)?.variant;
  }

  it('sends the state of every hotel room in the hotel overlay', () => {
    const state = hotelTower();
    state.units.u5 = newUnit('u5', 'office', 32, 1);
    roomState(state, 'u2', 'occupied');
    roomState(state, 'u3', 'dirty');
    roomState(state, 'u4', 'infested');

    const snapshot = buildSnapshot(state, null);

    expect(snapshot.overlays.hotel).toEqual({
      u1: 'clean',
      u2: 'occupied',
      u3: 'dirty',
      u4: 'infested',
    });
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('draws a Sucia room as dirty and a room with a plague as infested', () => {
    const state = hotelTower();
    roomState(state, 'u3', 'dirty');
    roomState(state, 'u4', 'infested');

    expect(variantOf(state, 'u1')).toBe('empty');
    expect(variantOf(state, 'u3')).toBe('dirty');
    expect(variantOf(state, 'u4')).toBe('infested');
  });

  it('sends a room that turns Sucia in the next delta, overlay and view', () => {
    const state = hotelTower();
    const before = buildSnapshot(state, null);
    roomState(state, 'u2', 'dirty');

    const { delta } = diffSnapshots(before, buildSnapshot(state, null));

    expect(delta.overlays?.hotel).toEqual({
      u1: 'clean',
      u2: 'dirty',
      u3: 'clean',
      u4: 'clean',
    });
    expect(delta.unitsUpserted).toEqual([expect.objectContaining({ id: 'u2', variant: 'dirty' })]);
  });

  it('draws an office with no route to the street as disconnected', () => {
    const state = createTower(7);
    setStructure(state.grid, 1, 0, 9, 'lobby');
    setStructure(state.grid, 2, 0, 19, 'floor');
    state.units.u5 = office('u5', 0, null);
    state.units.u6 = office('u6', 9, null);

    expect(variantOf(state, 'u5')).toBe('disconnected');

    state.transports.t1 = { id: 't1', type: 'stairs', x: 4, level: 1, paid: 0, placedAtStep: 0 };

    expect(variantOf(state, 'u5')).toBe('empty');
    expect(variantOf(state, 'u6')).toBe('empty');
  });

  it('draws an office site with no route to the street as disconnected', () => {
    const state = createTower(7);
    setStructure(state.grid, 1, 0, 9, 'lobby');
    setStructure(state.grid, 2, 0, 19, 'floor');
    state.sites.u5 = { id: 'u5', type: 'office', x: 0, level: 2, paid: 0, placedAtStep: 0, points: 0 };

    expect(variantOf(state, 'u5')).toBe('disconnected');
  });

  it('draws every visited unit as disconnected when there is no lobby', () => {
    const state = createTower(7);
    setStructure(state.grid, 2, 0, 19, 'floor');
    state.units.u5 = office('u5', 0, null);

    expect(variantOf(state, 'u5')).toBe('disconnected');
  });

  it('keeps a dirty room drawn as dirty when it also has no route', () => {
    const state = createTower(7);
    setStructure(state.grid, 1, 0, 9, 'lobby');
    setStructure(state.grid, 2, 0, 19, 'floor');
    state.units.u7 = newUnit('u7', 'single-room', 0, 2);
    state.units.u8 = newUnit('u8', 'single-room', 6, 2);
    roomState(state, 'u7', 'dirty');

    expect(variantOf(state, 'u7')).toBe('dirty');
    expect(variantOf(state, 'u8')).toBe('disconnected');
  });

  it('draws a parking space that reaches no ramp as disconnected', () => {
    const state = createTower(7);
    setStructure(state.grid, 1, 0, 9, 'lobby');
    setStructure(state.grid, -1, 0, 39, 'floor');
    state.units.u1 = newUnit('u1', 'parking-ramp', 0, -1);
    const rampWidth = UNIT_CATALOG['parking-ramp'].width;
    const spaceWidth = UNIT_CATALOG['parking-space'].width;
    state.units.u2 = newUnit('u2', 'parking-space', rampWidth, -1);
    state.units.u3 = newUnit('u3', 'parking-space', rampWidth + spaceWidth + 1, -1);

    expect(variantOf(state, 'u2')).toBe('empty');
    expect(variantOf(state, 'u3')).toBe('disconnected');
  });
});
