import type { EngineEvent, Level, TowerState, UnitId, UnitType } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import {
  decodeMaidTask,
  encodeMaidTask,
  housekeepingSummary,
  maidTaskAt,
  type MaidTask,
} from './housekeeping';
import { removePeopleOfUnit } from './people';
import { populationOf } from './population';
import { deserializeState, serializeState } from './serialization';
import { step } from './step';
import { buildTower, plainTowerPlan, type PlannedFlight, type PlannedShaft } from './testing';

function at(day: number, hour: number, minute = 0, second = 0): number {
  return day * STEPS_PER_DAY + (hour * 60 + minute) * STEPS_PER_MINUTE + second / 10;
}

interface RoomPlan {
  name: string;
  type: UnitType;
  level: Level;
  x: number;
}

interface TowerOptions {
  rooms: readonly RoomPlan[];
  flights?: readonly PlannedFlight[];
  shafts?: readonly PlannedShaft[];
  housekeeping?: { level: Level; x: number }[];
}

/** Hotel spec 9.1: housekeeping H1 on level 10 at x = 100 and stairs s1 from 10 to 11 at x = 120. */
const EXAMPLE_ROOMS: readonly RoomPlan[] = [
  { name: 'r1', type: 'single-room', level: 11, x: 100 },
  { name: 'r2', type: 'single-room', level: 11, x: 104 },
  { name: 'r3', type: 'double-room', level: 11, x: 108 },
  { name: 'r4', type: 'single-room', level: 11, x: 130 },
  { name: 'r5', type: 'single-room', level: 10, x: 140 },
];

const EXAMPLE_STAIRS: PlannedFlight = { type: 'stairs', x: 120, level: 10 };

function hotelTower(options: TowerOptions) {
  const housekeeping = options.housekeeping ?? [{ level: 10, x: 100 }];
  const { state, unitIds } = buildTower({
    ...plainTowerPlan(16, 0, 299),
    units: [
      ...housekeeping.map((unit) => ({ type: 'housekeeping' as UnitType, ...unit })),
      ...options.rooms.map(({ type, level, x }) => ({ type, level, x })),
    ],
    flights: options.flights ?? [EXAMPLE_STAIRS],
    shafts: options.shafts ?? [],
  });
  const rooms: Record<string, UnitId> = {};
  options.rooms.forEach((room, index) => {
    rooms[room.name] = unitIds[housekeeping.length + index] as UnitId;
  });
  return { state, rooms, units: unitIds.slice(0, housekeeping.length) as UnitId[] };
}

function setRoom(state: TowerState, id: UnitId, roomState: 'dirty' | 'occupied'): void {
  const hotel = state.units[id]?.hotel;
  if (!hotel) throw new Error(`${id} is not a room`);
  hotel.state = roomState;
  hotel.rollDue = false;
  hotel.stayEndStep = roomState === 'occupied' ? at(30, 10) : null;
}

function runUntil(state: TowerState, target: number) {
  return step(state, [], target - state.step);
}

function cleanedAt(events: readonly EngineEvent[], id: UnitId): number | null {
  const event = events.find(
    (candidate) =>
      candidate.type === 'roomStateChanged' &&
      candidate.unitId === id &&
      candidate.state === 'clean',
  );
  return event?.step ?? null;
}

function maidTasks(state: TowerState): MaidTask[] {
  const tasks: MaidTask[] = [];
  for (let slot = 0; slot < state.people.id.length; slot++) {
    const task = maidTaskAt(state.people, slot);
    if (task) tasks.push(task);
  }
  return tasks;
}

function maidCount(state: TowerState): number {
  return maidTasks(state).length;
}

function roomNumber(id: UnitId): number {
  return Number(id.slice(1));
}

describe('maid task encoding', () => {
  it('round-trips every phase and is never zero', () => {
    const tasks: MaidTask[] = [
      { phase: 'waiting', room: 0, cleanings: 0 },
      { phase: 'toRoom', room: 346, cleanings: 7 },
      { phase: 'cleaning', room: 12, cleanings: 8 },
      { phase: 'finished', room: 0, cleanings: 8 },
    ];
    for (const task of tasks) {
      expect(encodeMaidTask(task)).toBeGreaterThan(0);
      expect(decodeMaidTask(encodeMaidTask(task))).toEqual(task);
    }
    expect(decodeMaidTask(0)).toBeNull();
  });
});

describe('maid shift', () => {
  it('brings 6 maids per unit to the door at 09:30 and removes them at 17:00', () => {
    const { state, units } = hotelTower({
      rooms: [],
      housekeeping: [
        { level: 10, x: 100 },
        { level: 12, x: 0 },
      ],
    });
    const before = runUntil(state, at(0, 9, 29, 50)).state;
    expect(maidCount(before)).toBe(0);
    const appeared = runUntil(before, at(0, 9, 30)).state;
    expect(maidCount(appeared)).toBe(12);
    for (let slot = 0; slot < 6; slot++) {
      expect(appeared.people.level[slot]).toBe(10);
      expect(appeared.people.column[slot]).toBe(107);
    }
    expect(appeared.people.level[6]).toBe(12);
    expect(appeared.people.column[6]).toBe(7);
    expect(housekeepingSummary(appeared, units[0] as UnitId)).toEqual({
      working: 0,
      maids: 6,
      dirtyRooms: 0,
    });
    const evening = runUntil(appeared, at(0, 17)).state;
    expect(maidCount(evening)).toBe(0);
  });

  it('does not count maids in population and records no stress', () => {
    const { state, rooms } = hotelTower({ rooms: EXAMPLE_ROOMS });
    setRoom(state, rooms.r4 as UnitId, 'dirty');
    const run = runUntil(state, at(0, 10, 5));
    expect(populationOf(run.state).total).toBe(0);
    expect(run.state.people.stress.every((stress) => stress === 0)).toBe(true);
    expect(Object.keys(run.state.tripLedger)).toHaveLength(0);
  });
});

/** m2 and m3 get off the stairs at their right end, closer to their rooms than the old x + 4 stop (5 steps for r2, 3 for r4). */
const R2_CLEANED = at(0, 10, 37, 50) + 1 - 5;

describe('hotel spec 9.1, morning shift on two floors', () => {
  function morning() {
    const { state, rooms, units } = hotelTower({ rooms: EXAMPLE_ROOMS });
    setRoom(state, rooms.r1 as UnitId, 'occupied');
    setRoom(state, rooms.r3 as UnitId, 'occupied');
    for (const name of ['r2', 'r4', 'r5']) {
      const hotel = state.units[rooms[name] as UnitId]?.hotel;
      if (!hotel) throw new Error('room missing');
      hotel.state = 'occupied';
      hotel.stayEndStep = at(0, 10);
    }
    return { state, rooms, units };
  }

  it('sends m1 to r5, m2 to r2 and m3 to r4, and leaves m4 to m6 idle', () => {
    const { state, rooms } = morning();
    const run = runUntil(state, at(0, 10, 1));
    const tasks = maidTasks(run.state);
    expect(tasks.map((task) => task.room)).toEqual([
      roomNumber(rooms.r5 as UnitId),
      roomNumber(rooms.r2 as UnitId),
      roomNumber(rooms.r4 as UnitId),
      0,
      0,
      0,
    ]);
    expect(tasks.slice(0, 3).every((task) => task.phase === 'toRoom')).toBe(true);
  });

  it('starts each cleaning on arrival and makes the room clean 30 minutes later', () => {
    const { state, rooms } = morning();
    const run = runUntil(state, at(0, 11));
    expect(cleanedAt(run.events, rooms.r5 as UnitId)).toBe(at(0, 10, 35, 50));
    expect(cleanedAt(run.events, rooms.r2 as UnitId)).toBe(R2_CLEANED);
    expect(cleanedAt(run.events, rooms.r4 as UnitId)).toBe(at(0, 10, 36, 10) + 2 - 3);
    for (const name of ['r2', 'r4', 'r5']) {
      expect(run.state.units[rooms[name] as UnitId]?.hotel).toMatchObject({
        dirtyChecks: 0,
      });
    }
    const tasks = maidTasks(run.state);
    expect(tasks.map((task) => task.cleanings)).toEqual([1, 1, 1, 0, 0, 0]);
    expect(tasks.every((task) => task.phase === 'waiting')).toBe(true);
  });

  it('cleans r5 at 10:05:50 arrival: the maid stands at its door while cleaning', () => {
    const { state, rooms, units } = morning();
    const run = runUntil(state, at(0, 10, 5, 50));
    expect(run.state.people.level[0]).toBe(10);
    expect(run.state.people.column[0]).toBe(142);
    expect(maidTasks(run.state)[0]).toMatchObject({ phase: 'cleaning', cleanings: 1 });
    expect(run.state.units[rooms.r5 as UnitId]?.hotel?.state).toBe('dirty');
    expect(housekeepingSummary(run.state, units[0] as UnitId)).toEqual({
      working: 3,
      maids: 6,
      dirtyRooms: 3,
    });
  });

  it('gives the same result after a save and restore in the middle of a cleaning', () => {
    const { state, rooms } = morning();
    const straight = runUntil(state, at(0, 11));
    const half = runUntil(state, at(0, 10, 20));
    const restored = deserializeState(serializeState(half.state));
    const resumed = runUntil(restored, at(0, 11));
    expect(cleanedAt(resumed.events, rooms.r2 as UnitId)).toBe(R2_CLEANED);
    expect(JSON.parse(serializeState(resumed.state))).toEqual(
      JSON.parse(serializeState(straight.state)),
    );
  });

  it('gives the same result after a save and restore at 12:00 with maids mid-cleaning', () => {
    const { state, rooms } = hotelTower({ rooms: EXAMPLE_ROOMS });
    const before = runUntil(state, at(0, 11, 29));
    for (const id of Object.values(rooms)) setRoom(before.state, id, 'dirty');
    const straight = runUntil(deserializeState(serializeState(before.state)), at(0, 16, 30));
    const noon = runUntil(before.state, at(0, 12));
    expect(maidTasks(noon.state).some((task) => task.phase === 'cleaning')).toBe(true);
    const resumed = runUntil(deserializeState(serializeState(noon.state)), at(0, 16, 30));
    expect(JSON.parse(serializeState(resumed.state))).toEqual(
      JSON.parse(serializeState(straight.state)),
    );
  });
});

describe('room choice', () => {
  it('never offers a room 5 stair floors away, and a service elevator makes it reachable', () => {
    const rooms: RoomPlan[] = [{ name: 'r6', type: 'single-room', level: 15, x: 200 }];
    const flights: PlannedFlight[] = [10, 11, 12, 13, 14].map((level) => ({
      type: 'stairs',
      x: level % 2 === 0 ? 120 : 130,
      level: level as Level,
    }));
    const far = hotelTower({ rooms, flights });
    setRoom(far.state, far.rooms.r6 as UnitId, 'dirty');
    const farRun = runUntil(far.state, at(0, 16));
    expect(farRun.state.units[far.rooms.r6 as UnitId]?.hotel?.state).toBe('dirty');
    expect(maidTasks(farRun.state).every((task) => task.cleanings === 0)).toBe(true);

    const served = hotelTower({
      rooms,
      flights,
      shafts: [{ type: 'service', x: 150, bottom: 10, top: 15 }],
    });
    setRoom(served.state, served.rooms.r6 as UnitId, 'dirty');
    const servedRun = runUntil(served.state, at(0, 12));
    expect(servedRun.state.units[served.rooms.r6 as UnitId]?.hotel?.state).toBe('clean');
  });

  it('never rides a passenger elevator', () => {
    const rooms: RoomPlan[] = [{ name: 'r6', type: 'single-room', level: 15, x: 200 }];
    const { state, rooms: ids } = hotelTower({
      rooms,
      flights: [],
      shafts: [{ type: 'standard', x: 150, bottom: 10, top: 15 }],
    });
    setRoom(state, ids.r6 as UnitId, 'dirty');
    const run = runUntil(state, at(0, 16));
    expect(run.state.units[ids.r6 as UnitId]?.hotel?.state).toBe('dirty');
    expect(run.events.some((event) => event.type === 'roomStateChanged')).toBe(false);
  });

  it('asks again at once when the claimed room is demolished', () => {
    const { state, rooms } = hotelTower({ rooms: EXAMPLE_ROOMS });
    setRoom(state, rooms.r5 as UnitId, 'dirty');
    const claimed = runUntil(state, at(0, 10, 1));
    expect(maidTasks(claimed.state)[0]?.room).toBe(roomNumber(rooms.r5 as UnitId));
    setRoom(claimed.state, rooms.r4 as UnitId, 'dirty');
    const demolished = step(
      claimed.state,
      [
        {
          id: 'c1',
          command: { type: 'demolish', target: { kind: 'unit', id: rooms.r5 as UnitId } },
        },
      ],
      1,
    );
    expect(demolished.results[0]?.ok).toBe(true);
    const tasks = maidTasks(demolished.state);
    expect(tasks[0]).toEqual({
      phase: 'toRoom',
      room: roomNumber(rooms.r4 as UnitId),
      cleanings: 0,
    });
    expect(tasks.slice(1).every((task) => task.phase === 'waiting')).toBe(true);
  });

  it('removes the maids of a demolished unit and leaves their room dirty', () => {
    const { state, rooms, units } = hotelTower({ rooms: EXAMPLE_ROOMS });
    setRoom(state, rooms.r5 as UnitId, 'dirty');
    const claimed = runUntil(state, at(0, 10, 1)).state;
    removePeopleOfUnit(claimed, units[0] as UnitId);
    const later = runUntil(claimed, at(0, 11));
    expect(later.state.units[rooms.r5 as UnitId]?.hotel?.state).toBe('dirty');
    expect(maidCount(later.state)).toBe(0);
  });
});

describe('hotel spec 9.4, the 16:00 cut and the cap', () => {
  it('does not start a room reached at 16:00 or later and leaves its dirty checks alone', () => {
    const rooms: RoomPlan[] = [{ name: 'far', type: 'single-room', level: 11, x: 280 }];
    const { state, rooms: ids } = hotelTower({ rooms });
    const far = roomNumber(ids.far as UnitId);
    let run = runUntil(state, at(0, 15, 29));
    const room = run.state.units[ids.far as UnitId]?.hotel;
    if (!room) throw new Error('room missing');
    room.state = 'dirty';
    room.dirtyChecks = 2;
    room.rollDue = false;
    room.arrivalStep = null;
    let claimedAt: number | null = null;
    let releasedAt: number | null = null;
    while (run.state.step < at(0, 16, 30)) {
      run = step(run.state, [], 1);
      const holder = maidTasks(run.state).find((task) => task.room === far);
      expect(holder?.phase).not.toBe('cleaning');
      if (holder && claimedAt === null) claimedAt = run.state.step;
      if (!holder && claimedAt !== null && releasedAt === null) releasedAt = run.state.step;
    }
    expect(claimedAt).toBe(at(0, 15, 30));
    expect(releasedAt).toBeGreaterThanOrEqual(at(0, 16));
    expect(run.state.units[ids.far as UnitId]?.hotel).toMatchObject({
      state: 'dirty',
      dirtyChecks: 2,
    });
    expect(maidTasks(run.state).every((task) => task.cleanings === 0)).toBe(true);
    expect(maidTasks(run.state).every((task) => task.phase === 'waiting')).toBe(true);
  });

  it('cleans at most 48 rooms a unit a day, and no maid starts a ninth cleaning', () => {
    const rooms: RoomPlan[] = [];
    for (let index = 0; index < 60; index++) {
      const level = (10 + Math.floor(index / 30)) as Level;
      rooms.push({ name: `r${index}`, type: 'single-room', level, x: 120 + (index % 30) * 4 });
    }
    const { state, rooms: ids } = hotelTower({
      rooms,
      flights: [{ type: 'stairs', x: 100, level: 10 }],
      housekeeping: [{ level: 10, x: 0 }],
    });
    for (const id of Object.values(ids)) setRoom(state, id, 'dirty');
    const run = runUntil(state, at(0, 16, 30));
    const cleaned = Object.values(ids).filter(
      (id) => run.state.units[id]?.hotel?.state === 'clean',
    );
    expect(cleaned).toHaveLength(48);
    expect(maidTasks(run.state).every((task) => task.cleanings === 8)).toBe(true);
    expect(maidTasks(run.state).every((task) => task.phase === 'finished')).toBe(true);
    const leftOver = Object.values(ids).filter((id) => !cleaned.includes(id));
    const nextDay = runUntil(run.state, at(1, 16, 30));
    for (const id of leftOver) expect(cleanedAt(nextDay.events, id)).not.toBeNull();
  });
});
