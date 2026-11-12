import type {
  EngineEvent,
  HotelRoomState,
  Level,
  TowerState,
  UnitId,
  UnitType,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { stepOfDate } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { runInfestationCheck } from './infestation';
import { runDays, type StepContext } from './step';
import { buildTower, plainTowerPlan } from './testing';

interface PlannedRoom {
  name: string;
  type: UnitType;
  x: number;
  level?: Level;
}

type Ids = Record<string, UnitId>;

function towerOf(topLevel: Level, rooms: PlannedRoom[]): { state: TowerState; ids: Ids } {
  const built = buildTower({
    ...plainTowerPlan(topLevel, 0, 60),
    units: rooms.map((room) => ({ type: room.type, x: room.x, level: room.level ?? topLevel })),
  });
  const ids: Ids = {};
  rooms.forEach((room, index) => (ids[room.name] = built.unitIds[index] as UnitId));
  return { state: built.state, ids };
}

function hotelOf(state: TowerState, id: UnitId) {
  const hotel = state.units[id]?.hotel;
  if (!hotel) throw new Error(`${id} is not a room`);
  return hotel;
}

function setState(state: TowerState, id: UnitId, roomState: HotelRoomState): void {
  hotelOf(state, id).state = roomState;
}

function demolish(state: TowerState, id: UnitId): void {
  const unit = state.units[id];
  if (!unit) throw new Error(`${id} is not in the tower`);
  const row = state.grid.levels[unit.level];
  if (row) {
    row.occupants = row.occupants.filter(
      (span) => !(span.occupant.kind === 'unit' && span.occupant.id === id),
    );
  }
  Reflect.deleteProperty(state.units, id);
}

/** Runs the daily check once per call, on consecutive midnights. */
class Checks {
  private day = 0;
  readonly events: EngineEvent[] = [];

  constructor(readonly state: TowerState) {}

  /** The levels of the news.cockroaches notices this check emitted, in order. */
  next(): number[] {
    this.day += 1;
    this.state.step = this.day * STEPS_PER_DAY;
    const context: StepContext = { state: this.state, events: [] };
    runInfestationCheck(context);
    this.events.push(...context.events);
    return context.events.flatMap((event) =>
      event.type === 'news' && event.key === 'news.cockroaches' ? [Number(event.params.level)] : [],
    );
  }

  infested(ids: Ids): string[] {
    return Object.entries(ids)
      .filter(([, id]) => this.state.units[id]?.hotel?.state === 'infested')
      .map(([name]) => name);
  }
}

const ROW: PlannedRoom[] = [
  { name: 'A', type: 'single-room', x: 0 },
  { name: 'B', type: 'single-room', x: 4 },
  { name: 'C', type: 'double-room', x: 8 },
  { name: 'D', type: 'single-room', x: 14 },
  { name: 'office', type: 'office', x: 20 },
  { name: 'E', type: 'single-room', x: 30 },
];

function rowTower() {
  const { state, ids } = towerOf(30, ROW);
  setState(state, ids.A as UnitId, 'dirty');
  return { state, ids, checks: new Checks(state) };
}

describe('hotel spec 7.1, the dirt phase', () => {
  it('counts a dirty check each day and infests the room at the third', () => {
    const { state, ids } = towerOf(3, [{ name: 'a', type: 'single-room', x: 0 }]);
    const room = ids.a as UnitId;
    setState(state, room, 'dirty');
    const checks = new Checks(state);

    expect(checks.next()).toEqual([]);
    expect(hotelOf(state, room)).toMatchObject({ state: 'dirty', dirtyChecks: 1 });
    expect(checks.next()).toEqual([]);
    expect(hotelOf(state, room)).toMatchObject({ state: 'dirty', dirtyChecks: 2 });
    expect(checks.next()).toEqual([3]);
    expect(hotelOf(state, room)).toMatchObject({ state: 'infested', dirtyChecks: 0 });
  });

  it('leaves clean and occupied rooms alone', () => {
    const { state, ids } = towerOf(3, [
      { name: 'a', type: 'single-room', x: 0 },
      { name: 'b', type: 'single-room', x: 10 },
    ]);
    setState(state, ids.b as UnitId, 'occupied');
    const checks = new Checks(state);
    for (let day = 0; day < 5; day++) expect(checks.next()).toEqual([]);
    expect(checks.infested(ids)).toEqual([]);
  });
});

describe('hotel spec 9.3, spread along a row', () => {
  it('infests A to D from Thursday to Sunday and never E', () => {
    const { ids, checks } = rowTower();
    const rooms = Object.fromEntries(Object.entries(ids).filter(([name]) => name !== 'office'));
    const after: string[][] = [];
    const news: number[][] = [];
    for (let day = 0; day < 7; day++) {
      news.push(checks.next());
      after.push(checks.infested(rooms));
    }
    expect(after).toEqual([
      [],
      [],
      ['A'],
      ['A', 'B'],
      ['A', 'B', 'C'],
      ['A', 'B', 'C', 'D'],
      ['A', 'B', 'C', 'D'],
    ]);
    expect(news).toEqual([[], [], [30], [30], [30], [30], []]);
  });

  it('does not spread from a room infested in the same check', () => {
    const { ids, checks } = rowTower();
    for (let day = 0; day < 3; day++) checks.next();
    expect(checks.infested(ids)).toEqual(['A']);
    checks.next();
    expect(checks.infested(ids)).toEqual(['A', 'B']);
  });

  it('reaches C on Friday when B is demolished on Thursday', () => {
    const { state, ids, checks } = rowTower();
    for (let day = 0; day < 3; day++) checks.next();
    demolish(state, ids.B as UnitId);
    checks.next();
    expect(checks.infested(ids)).toEqual(['A', 'C']);
  });

  it('stops when A is demolished on Thursday', () => {
    const { state, ids, checks } = rowTower();
    for (let day = 0; day < 3; day++) checks.next();
    demolish(state, ids.A as UnitId);
    for (let day = 0; day < 4; day++) checks.next();
    expect(checks.infested(ids)).toEqual([]);
  });

  it('does not spread from a room infested by the dirt phase in the same check', () => {
    const { state, ids } = towerOf(3, [
      { name: 'a', type: 'single-room', x: 0 },
      { name: 'b', type: 'single-room', x: 4 },
    ]);
    setState(state, ids.a as UnitId, 'dirty');
    hotelOf(state, ids.a as UnitId).dirtyChecks = 2;
    const checks = new Checks(state);
    checks.next();
    expect(checks.infested(ids)).toEqual(['a']);
    checks.next();
    expect(checks.infested(ids)).toEqual(['a', 'b']);
  });
});

describe('hotel spec 7.2, who is a neighbour', () => {
  it('does not cross a restaurant standing between two rooms', () => {
    const { state, ids } = towerOf(3, [
      { name: 'a', type: 'single-room', x: 0 },
      { name: 'restaurant', type: 'restaurant', x: 4 },
      { name: 'b', type: 'single-room', x: 50 },
    ]);
    setState(state, ids.a as UnitId, 'infested');
    const checks = new Checks(state);
    for (let day = 0; day < 3; day++) checks.next();
    expect(checks.infested(ids)).toEqual(['a']);
  });

  it('crosses empty floor to the next room in the row', () => {
    const { state, ids } = towerOf(3, [
      { name: 'a', type: 'single-room', x: 0 },
      { name: 'b', type: 'single-room', x: 30 },
    ]);
    setState(state, ids.a as UnitId, 'infested');
    new Checks(state).next();
    expect(hotelOf(state, ids.b as UnitId).state).toBe('infested');
  });

  it('does not spread to another level', () => {
    const { state, ids } = towerOf(4, [
      { name: 'a', type: 'single-room', x: 0, level: 3 },
      { name: 'b', type: 'single-room', x: 0, level: 4 },
    ]);
    setState(state, ids.a as UnitId, 'infested');
    new Checks(state).next();
    expect(hotelOf(state, ids.b as UnitId).state).toBe('clean');
  });
});

describe('hotel spec 7.3 and 7.4', () => {
  it('ends an occupied stay at once', () => {
    const { state, ids } = towerOf(3, [
      { name: 'a', type: 'single-room', x: 0 },
      { name: 'b', type: 'single-room', x: 4 },
    ]);
    setState(state, ids.a as UnitId, 'infested');
    setState(state, ids.b as UnitId, 'occupied');
    hotelOf(state, ids.b as UnitId).stayEndStep = 99_999;
    new Checks(state).next();
    expect(hotelOf(state, ids.b as UnitId)).toMatchObject({ state: 'infested', stayEndStep: null });
  });

  it('refunds nothing when the room was never used', () => {
    const { state, ids } = towerOf(3, [
      { name: 'a', type: 'single-room', x: 0 },
      { name: 'b', type: 'single-room', x: 4 },
    ]);
    setState(state, ids.a as UnitId, 'infested');
    new Checks(state).next();
    expect(state.units[ids.b as UnitId]?.used).toBe(true);
  });

  it('emits one notice per level in increasing level order', () => {
    const { state, ids } = towerOf(6, [
      { name: 'high', type: 'single-room', x: 0, level: 6 },
      { name: 'low', type: 'single-room', x: 0, level: 3 },
    ]);
    setState(state, ids.high as UnitId, 'dirty');
    setState(state, ids.low as UnitId, 'dirty');
    hotelOf(state, ids.high as UnitId).dirtyChecks = 2;
    hotelOf(state, ids.low as UnitId).dirtyChecks = 2;
    expect(new Checks(state).next()).toEqual([3, 6]);
  });
});

describe('the check in the step loop', () => {
  it('infests a room made dirty on day 1 at 10:00 at midnight of day 4', () => {
    const { state, ids } = towerOf(3, [{ name: 'a', type: 'single-room', x: 0 }]);
    const room = ids.a as UnitId;
    setState(state, room, 'dirty');
    state.step = stepOfDate({ year: 1, month: 1, day: 1, hour: 10, minute: 0 });

    const run = runDays(state, 3);

    expect(run.state.units[room]?.hotel?.state).toBe('infested');
    expect(
      run.events.some((event) => event.type === 'news' && event.key === 'news.cockroaches'),
    ).toBe(true);
  });
});
