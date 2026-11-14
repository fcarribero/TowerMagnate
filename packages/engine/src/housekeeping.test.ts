import { LAST_COLUMN, type EngineEvent, type Level, type TowerState, type UnitId, type UnitType } from '@tower-magnate/shared';
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
import { outfitOf } from './outfit';
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
    const walking: MaidTask[] = (['arriving', 'changingIn', 'changingOut', 'leaving'] as const).map(
      (phase) => ({ phase, room: 0, cleanings: 3 }),
    );
    for (const task of [...tasks, ...walking]) {
      expect(encodeMaidTask(task)).toBeGreaterThan(0);
      expect(decodeMaidTask(encodeMaidTask(task))).toEqual(task);
    }
    expect(decodeMaidTask(0)).toBeNull();
  });
});

describe('maid shift', () => {
  it('starts 6 maids per unit at 06:00 at their door when no route leads in from the street', () => {
    const { state, units } = hotelTower({
      rooms: [],
      housekeeping: [
        { level: 10, x: 100 },
        { level: 12, x: 0 },
      ],
    });
    const before = runUntil(state, at(0, 5, 59, 50)).state;
    expect(maidCount(before)).toBe(0);
    const appeared = runUntil(before, at(0, 6)).state;
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
    const afternoon = runUntil(appeared, at(0, 17, 30)).state;
    expect(maidCount(afternoon)).toBe(0);
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
const R2_CLEANED = at(0, 10, 37, 50) + 1 - 4;

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

  it('sends m1 to r5, m2 to r4 and m3 to r2, nearest to the housekeeping unit first, and leaves m4 to m6 idle', () => {
    const { state, rooms } = morning();
    const run = runUntil(state, at(0, 10, 1));
    const tasks = maidTasks(run.state);
    expect(tasks.map((task) => task.room)).toEqual([
      roomNumber(rooms.r5 as UnitId),
      roomNumber(rooms.r4 as UnitId),
      roomNumber(rooms.r2 as UnitId),
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
    expect(cleanedAt(run.events, rooms.r4 as UnitId)).toBe(at(0, 10, 36, 10) + 2 - 4);
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
    const straight = runUntil(deserializeState(serializeState(before.state)), at(0, 13, 30));
    const noon = runUntil(before.state, at(0, 12));
    expect(maidTasks(noon.state).some((task) => task.phase === 'cleaning')).toBe(true);
    const resumed = runUntil(deserializeState(serializeState(noon.state)), at(0, 13, 30));
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
    const claimed = runUntil(state, at(0, 6, 1));
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
    const claimed = runUntil(state, at(0, 6, 1)).state;
    removePeopleOfUnit(claimed, units[0] as UnitId);
    const later = runUntil(claimed, at(0, 7));
    expect(later.state.units[rooms.r5 as UnitId]?.hotel?.state).toBe('dirty');
    expect(maidCount(later.state)).toBe(0);
  });
});

describe('hotel spec 4.2, nearest room by route from the housekeeping unit', () => {
  it('sends the first maid to the room with the shortest walk, not the one on her own floor', () => {
    const rooms: RoomPlan[] = [
      { name: 'sameFloorFar', type: 'single-room', level: 10, x: 220 },
      { name: 'upstairsNear', type: 'single-room', level: 11, x: 124 },
    ];
    const { state, rooms: ids } = hotelTower({
      rooms,
      flights: [{ type: 'stairs', x: 120, level: 10 }],
      housekeeping: [{ level: 10, x: 100 }],
    });
    for (const id of Object.values(ids)) setRoom(state, id, 'dirty');
    const run = runUntil(state, at(0, 6, 31));
    const tasks = maidTasks(run.state);
    expect(tasks[0]?.room).toBe(roomNumber(ids.upstairsNear as UnitId));
    expect(tasks[1]?.room).toBe(roomNumber(ids.sameFloorFar as UnitId));
  });
});

describe('hotel spec 9.4, the 17:00 cut and no daily limit', () => {
  function dirtyAt(minuteStep: number, name: string) {
    const rooms: RoomPlan[] = [{ name, type: 'single-room', level: 10, x: 122 }];
    const { state, rooms: ids } = hotelTower({ rooms });
    const id = ids[name] as UnitId;
    const run = runUntil(state, minuteStep);
    const room = run.state.units[id]?.hotel;
    if (!room) throw new Error('room missing');
    room.state = 'dirty';
    room.dirtyChecks = 2;
    room.rollDue = false;
    room.arrivalStep = null;
    return { run, id };
  }

  it('does not start a room after 17:00 and leaves its dirty checks alone', () => {
    const { run: start, id } = dirtyAt(at(0, 17, 5), 'late');
    const run = runUntil(start.state, at(0, 18, 0));
    expect(run.state.units[id]?.hotel).toMatchObject({ state: 'dirty', dirtyChecks: 2 });
    expect(maidTasks(run.state).every((task) => task.cleanings === 0)).toBe(true);
  });

  it('finishes a cleaning that started before 17:00 even when the shift ends meanwhile', () => {
    const { run: start, id } = dirtyAt(at(0, 16, 54), 'last');
    let run = start;
    let cleaningAt17: boolean | null = null;
    while (run.state.step < at(0, 17, 40)) {
      run = step(run.state, [], 1);
      if (run.state.step === at(0, 17, 5)) {
        cleaningAt17 = maidTasks(run.state).some(
          (task) => task.phase === 'cleaning' && task.room === roomNumber(id),
        );
      }
    }
    expect(cleaningAt17).toBe(true);
    expect(run.state.units[id]?.hotel?.state).toBe('clean');
  });

  it('has no daily limit: the maids keep cleaning until 17:00', () => {
    const rooms: RoomPlan[] = [];
    for (let index = 0; index < 96; index++) {
      const level = (10 + Math.floor(index / 48)) as Level;
      rooms.push({ name: `r${index}`, type: 'single-room', level, x: 104 + (index % 48) * 4 });
    }
    const { state, rooms: ids } = hotelTower({
      rooms,
      flights: [{ type: 'stairs', x: 100, level: 10 }],
      housekeeping: [{ level: 10, x: 0 }],
    });
    for (const id of Object.values(ids)) setRoom(state, id, 'dirty');
    const run = runUntil(state, at(0, 17, 30));
    const cleaned = Object.values(ids).filter(
      (id) => run.state.units[id]?.hotel?.state === 'clean',
    );
    expect(cleaned.length).toBeGreaterThan(60);
  });
});

/** A 3-floor hotel with stairs from the lobby to level 2, where the housekeeping room and two rooms are. */
function connectedHotel() {
  const { state, unitIds } = buildTower({
    ...plainTowerPlan(3, 0, 119),
    units: [
      { type: 'housekeeping', level: 2, x: 20 },
      { type: 'single-room', level: 2, x: 60 },
      { type: 'single-room', level: 2, x: 70 },
    ],
    flights: [{ type: 'stairs', x: 10, level: 1 }],
  });
  return { state, unit: unitIds[0] as UnitId, rooms: [unitIds[1], unitIds[2]] as UnitId[] };
}

function maidSlots(state: TowerState): number[] {
  const slots: number[] = [];
  for (let slot = 0; slot < state.people.id.length; slot++) {
    if (maidTaskAt(state.people, slot)) slots.push(slot);
  }
  return slots;
}

describe('maids walk in from the street and change in their room', () => {
  it('appear at a map edge at 06:00 in civilian clothes, never inside the tower', () => {
    const { state } = connectedHotel();
    const before = runUntil(state, at(0, 6) - 1).state;
    expect(maidCount(before)).toBe(0);
    const appeared = runUntil(before, at(0, 6)).state;
    expect(maidCount(appeared)).toBe(6);
    for (const slot of maidSlots(appeared)) {
      expect(appeared.people.level[slot]).toBe(1);
      // They have taken at most their first step along the ground.
      const column = appeared.people.column[slot] as number;
      expect(column <= 1 || column >= LAST_COLUMN - 1).toBe(true);
      expect(maidTaskAt(appeared.people, slot)?.phase).toBe('arriving');
      expect(outfitOf(appeared.people, slot)).toBeUndefined();
    }
  });

  it('reach the door, spend 2 steps changing in civilian clothes, then work in uniform', () => {
    const { state } = connectedHotel();
    let current = runUntil(state, at(0, 6)).state;
    const door = { level: 2, column: 27 };
    const changing = new Map<number, number>();
    for (let count = 0; count < 900; count++) {
      current = step(current, [], 1).state;
      for (const slot of maidSlots(current)) {
        const task = maidTaskAt(current.people, slot);
        const id = current.people.id[slot] as number;
        if (task?.phase === 'changingIn') {
          changing.set(id, (changing.get(id) ?? 0) + 1);
          expect(current.people.level[slot]).toBe(door.level);
          expect(current.people.column[slot]).toBe(door.column);
          expect(outfitOf(current.people, slot)).toBeUndefined();
        }
        if (task?.phase === 'waiting') expect(outfitOf(current.people, slot)).toBe('uniform');
      }
    }
    expect(changing.size).toBe(6);
    for (const steps of changing.values()) expect(steps).toBe(2);
    expect(maidTasks(current).every((task) => task.phase === 'waiting')).toBe(true);
  });

  it('clean each room one by one as it is freed by a check-out', () => {
    const { state, rooms } = connectedHotel();
    const ends = [at(0, 7, 30), at(0, 9)];
    rooms.forEach((id, index) => {
      const hotel = state.units[id]?.hotel;
      if (!hotel) throw new Error('room missing');
      hotel.state = 'occupied';
      hotel.rollDue = false;
      hotel.stayEndStep = ends[index] as number;
    });
    const run = runUntil(state, at(0, 11));
    rooms.forEach((id, index) => {
      const cleaned = cleanedAt(run.events, id);
      expect(cleaned).not.toBeNull();
      expect(cleaned as number).toBeGreaterThan((ends[index] as number) + 30 * STEPS_PER_MINUTE);
      expect(cleaned as number).toBeLessThan((ends[index] as number) + 45 * STEPS_PER_MINUTE);
    });
  });

  it('change back at 13:00 in their room and walk out to a map edge, never vanishing', () => {
    const { state } = connectedHotel();
    let current = runUntil(state, at(0, 12, 59, 50)).state;
    const ids = maidSlots(current).map((slot) => current.people.id[slot] as number);
    expect(ids).toHaveLength(6);
    const lastSeen = new Map<number, { level: number; column: number; phase: string }>();
    const firstGone = new Map<number, number>();
    const uniformSteps = new Map<number, number>();
    const sawCivilianLeaving = new Set<number>();
    for (let count = 0; count < 3000 && maidCount(current) > 0; count++) {
      current = step(current, [], 1).state;
      const present = new Set<number>();
      for (const slot of maidSlots(current)) {
        const id = current.people.id[slot] as number;
        present.add(id);
        const phase = maidTaskAt(current.people, slot)?.phase as string;
        lastSeen.set(id, {
          level: current.people.level[slot] as number,
          column: current.people.column[slot] as number,
          phase,
        });
        if (phase === 'changingOut') {
          uniformSteps.set(id, (uniformSteps.get(id) ?? 0) + 1);
          expect(outfitOf(current.people, slot)).toBe('uniform');
          expect(current.people.level[slot]).toBe(2);
          expect(current.people.column[slot]).toBe(27);
        }
        if (phase === 'leaving') {
          expect(outfitOf(current.people, slot)).toBeUndefined();
          sawCivilianLeaving.add(id);
        }
      }
      for (const id of ids) if (!present.has(id) && !firstGone.has(id)) firstGone.set(id, current.step);
    }
    expect(maidCount(current)).toBe(0);
    for (const id of ids) {
      expect(uniformSteps.get(id)).toBe(2);
      expect(sawCivilianLeaving.has(id)).toBe(true);
      // Gone only once they stood on the ground level at a map edge, long after 13:00.
      const seen = lastSeen.get(id);
      expect(seen?.level).toBe(1);
      expect((seen?.column as number) <= 1 || (seen?.column as number) >= LAST_COLUMN - 1).toBe(true);
      expect(firstGone.get(id) as number).toBeGreaterThan(at(0, 13) + 30);
    }
  });
});
