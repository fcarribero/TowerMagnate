import {
  HOTEL_PARTY_SIZE,
  type HotelRoom,
  type Level,
  type TenantEvaluation,
  type TowerState,
  type UnitId,
  type UnitType,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import {
  decodeGuestRoutine,
  encodeGuestRoutine,
  guestRoutineAt,
  type GuestRoutine,
} from './hotel-guest-trip';
import { createHotelGuests } from './hotel-guests';
import { createRng } from './rng';
import { createScheduler } from './scheduler';
import { createEngine, step, towerSystems, type SimulationSystem } from './step';
import { addFlight, buildTower, plainTowerPlan } from './testing';

const TUESDAY = 1;
const ROOM_TYPES: readonly UnitType[] = ['single-room', 'double-room', 'suite'];

function at(day: number, hour: number, minute = 0): number {
  return day * STEPS_PER_DAY + (hour * 60 + minute) * STEPS_PER_MINUTE;
}

function minuteOf(stepNumber: number): number {
  return Math.floor((stepNumber % STEPS_PER_DAY) / STEPS_PER_MINUTE);
}

function hotelOf(tower: TowerState, id: UnitId): HotelRoom {
  const hotel = tower.units[id]?.hotel;
  if (!hotel) throw new Error(`${id} is not a hotel room`);
  return hotel;
}

function roomIds(tower: TowerState): UnitId[] {
  return Object.values(tower.units)
    .filter((unit) => unit.hotel !== null)
    .map((unit) => unit.id);
}

const ROOMS_PER_LEVEL = 10;

/** Ten rooms a level from level 2 up, over a lobby, reachable by stairs unless `reachable` is false. */
interface HotelTowerOptions {
  rooms?: number;
  seed?: number;
  reachable?: boolean;
  /** A restaurant and a fast food on level 2, right of the rooms. */
  venues?: boolean;
}

function hotelTower(options: HotelTowerOptions = {}) {
  const rooms = options.rooms ?? 10;
  const units = Array.from({ length: rooms }, (_, index) => ({
    type: ROOM_TYPES[index % ROOM_TYPES.length] as UnitType,
    x: 20 + (index % ROOMS_PER_LEVEL) * 10,
    level: (2 + Math.floor(index / ROOMS_PER_LEVEL)) as Level,
  }));
  if (options.venues) {
    units.push({ type: 'restaurant', x: 150, level: 2 }, { type: 'fast-food', x: 180, level: 2 });
  }
  const levels = 1 + Math.ceil(rooms / ROOMS_PER_LEVEL);
  const { state, unitIds } = buildTower({
    seed: options.seed ?? 1,
    ...plainTowerPlan(levels, 0, options.venues ? 200 : 20 + ROOMS_PER_LEVEL * 10),
    units,
  });
  if (options.reachable !== false) addFlight(state, 'stairs', 4, 1);
  return { state, rooms: unitIds as UnitId[] };
}

const bookingOnly = createEngine({
  commandHandlers: {},
  systems: [createScheduler([createHotelGuests().bookingHook])],
});

/** Runs the 12:00 roll `rounds` times over every room with the given grade, counting bookings. */
function noonRolls(grade: TenantEvaluation | null, rounds: number) {
  let { state } = hotelTower({ rooms: 50, seed: 7 });
  const arrivals: number[] = [];
  let rolls = 0;
  for (let round = 0; round < rounds; round++) {
    for (const id of roomIds(state)) {
      const unit = state.units[id];
      if (!unit) continue;
      unit.evaluation = grade;
      Object.assign(hotelOf(state, id), { arrivalStep: null, rollDue: false });
    }
    state.step = at(TUESDAY + round, 12) - 1;
    state = bookingOnly.step(state, [], 1).state;
    for (const id of roomIds(state)) {
      rolls += 1;
      const arrival = hotelOf(state, id).arrivalStep;
      if (arrival !== null) arrivals.push(arrival);
    }
  }
  return { rolls, arrivals };
}

function share(count: number, total: number): number {
  return (100 * count) / total;
}

describe('hotel booking rolls', () => {
  it.each([
    ['good', 90],
    ['fair', 70],
    ['poor', 40],
    [null, 80],
  ] as const)('books %s rooms within 3 points of %i%%', (grade, percent) => {
    const { rolls, arrivals } = noonRolls(grade, 40);
    expect(rolls).toBe(2000);
    expect(Math.abs(share(arrivals.length, rolls) - percent)).toBeLessThanOrEqual(3);
  });

  it('draws 12:00 arrivals 25/55/20 over 12:00-17:00, 17:00-21:00 and 21:00-22:30', () => {
    const { arrivals } = noonRolls('good', 23);
    const bookings = arrivals.slice(0, 1000);
    expect(bookings).toHaveLength(1000);
    const minutes = bookings.map(minuteOf);
    const early = minutes.filter((minute) => minute >= 12 * 60 && minute < 17 * 60).length;
    const evening = minutes.filter((minute) => minute >= 17 * 60 && minute < 21 * 60).length;
    const late = minutes.filter((minute) => minute >= 21 * 60 && minute < 22 * 60 + 30).length;
    expect(early + evening + late).toBe(1000);
    expect(Math.abs(share(early, 1000) - 25)).toBeLessThanOrEqual(3);
    expect(Math.abs(share(evening, 1000) - 55)).toBeLessThanOrEqual(3);
    expect(Math.abs(share(late, 1000) - 20)).toBeLessThanOrEqual(3);
    expect(bookings.every((arrival) => arrival % STEPS_PER_MINUTE === 0)).toBe(true);
  });

  it('never books a dirty, occupied or infested room, nor one already booked', () => {
    const built = hotelTower({ rooms: 4 });
    let state = built.state;
    const [dirty, occupied, infested, booked] = built.rooms as [UnitId, UnitId, UnitId, UnitId];
    Object.assign(hotelOf(state, dirty), { state: 'dirty' });
    Object.assign(hotelOf(state, occupied), { state: 'occupied', stayEndStep: at(9, 10) });
    Object.assign(hotelOf(state, infested), { state: 'infested' });
    Object.assign(hotelOf(state, booked), { arrivalStep: at(TUESDAY, 20) });
    for (let day = TUESDAY; day < TUESDAY + 30; day++) {
      state.step = at(day, 12) - 1;
      state = bookingOnly.step(state, [], 1).state;
    }
    expect(hotelOf(state, dirty).arrivalStep).toBeNull();
    expect(hotelOf(state, occupied).arrivalStep).toBeNull();
    expect(hotelOf(state, infested).arrivalStep).toBeNull();
    expect(hotelOf(state, booked).arrivalStep).toBe(at(TUESDAY, 20));
  });

  const lateRolls = createEngine({ commandHandlers: {}, systems: [createHotelGuests().system] });

  it('rolls a room that becomes clean at 15:00 at once, arriving in [15:30, 22:30)', () => {
    const minutes: number[] = [];
    for (let seed = 1; minutes.length < 200; seed++) {
      const { state, rooms } = hotelTower({ rooms: 1, seed });
      state.step = at(TUESDAY, 15) - 1;
      const after = lateRolls.step(state, [], 1).state;
      const hotel = hotelOf(after, rooms[0] as UnitId);
      expect(hotel.rollDue).toBe(false);
      if (hotel.arrivalStep !== null) minutes.push(minuteOf(hotel.arrivalStep));
    }
    expect(Math.min(...minutes)).toBeGreaterThanOrEqual(15 * 60 + 30);
    expect(Math.max(...minutes)).toBeLessThan(22 * 60 + 30);
  });

  it('waits for the next 12:00 when the room becomes clean at 21:00 or later', () => {
    const guests = createHotelGuests();
    const rollsOnly = createEngine({
      commandHandlers: {},
      systems: [createScheduler([guests.bookingHook]), guests.system],
    });
    const { state, rooms } = hotelTower({ rooms: 1 });
    const room = rooms[0] as UnitId;
    state.step = at(TUESDAY, 21) - 1;
    const beforeNoon = rollsOnly.step(state, [], at(TUESDAY + 1, 12) - 1 - state.step).state;
    expect(hotelOf(beforeNoon, room)).toMatchObject({ rollDue: true, arrivalStep: null });
    const atNoon = rollsOnly.step(beforeNoon, [], 1).state;
    expect(hotelOf(atNoon, room).rollDue).toBe(false);
  });
});

describe('guest routine encoding', () => {
  it('round-trips every phase with the largest slots and venue', () => {
    const routine: GuestRoutine = { phase: 'leaveRetry', venue: 99_999, slots: [1440, 1440, 1440] };
    expect(decodeGuestRoutine(encodeGuestRoutine(routine))).toEqual(routine);
    const arriving: GuestRoutine = { phase: 'arriving', venue: 0, slots: [0, 0, 0] };
    expect(decodeGuestRoutine(encodeGuestRoutine(arriving))).toEqual(arriving);
  });
});

interface DayLog {
  day: number;
  states: Record<UnitId, HotelRoom['state']>;
}

interface StayWatch {
  /** Check-in steps by room. */
  checkIns: { room: UnitId; step: number }[];
  checkOuts: { room: UnitId; step: number }[];
  /** Steps at which a guest on the check-out day started walking out. */
  departures: number[];
  /** Steps at which a guest appeared at the entrance. */
  arrivals: number[];
  /** Steps at which a guest started each phase. */
  phaseStarts: { phase: GuestRoutine['phase']; step: number }[];
  /** Any step at which a dirty or infested room held a booking. */
  dirtyBookings: number;
  days: DayLog[];
  money: number[];
}

/** Every day at 11:00 a stand-in for the maids cleans every dirty room. */
const cleanAtEleven: SimulationSystem = ({ state }) => {
  if (state.step % STEPS_PER_DAY !== at(0, 11)) return;
  for (const unit of Object.values(state.units)) {
    if (unit.hotel?.state === 'dirty') Object.assign(unit.hotel, { state: 'clean', rollDue: true });
  }
};

function watcher(watch: StayWatch): SimulationSystem {
  let previousIds = new Set<number>();
  const departed = new Set<number>();
  const phases = new Map<number, GuestRoutine['phase']>();
  return ({ state, events }) => {
    for (const event of events.splice(0)) {
      if (event.type === 'hotelCheckIn')
        watch.checkIns.push({ room: event.unitId, step: event.step });
      if (event.type === 'hotelCheckOut')
        watch.checkOuts.push({ room: event.unitId, step: event.step });
    }
    const pool = state.people;
    const ids = new Set<number>();
    for (let slot = 0; slot < pool.id.length; slot++) {
      const routine = guestRoutineAt(pool, slot);
      if (!routine) continue;
      const id = pool.id[slot] as number;
      ids.add(id);
      if (!previousIds.has(id)) watch.arrivals.push(state.step);
      if (phases.get(id) !== routine.phase) {
        phases.set(id, routine.phase);
        watch.phaseStarts.push({ phase: routine.phase, step: state.step });
      }
      if (routine.phase === 'leaving' && !departed.has(id)) {
        departed.add(id);
        watch.departures.push(state.step);
      }
    }
    previousIds = ids;
    for (const unit of Object.values(state.units)) {
      const hotel = unit.hotel;
      if (hotel && hotel.state !== 'clean' && hotel.arrivalStep !== null) watch.dirtyBookings += 1;
    }
    if (state.step % STEPS_PER_DAY === at(0, 23, 30)) {
      const states: Record<UnitId, HotelRoom['state']> = {};
      for (const unit of Object.values(state.units)) {
        if (unit.hotel) states[unit.id] = unit.hotel.state;
      }
      watch.days.push({ day: Math.floor(state.step / STEPS_PER_DAY), states });
      watch.money.push(state.money);
    }
  };
}

function runHotelWeek(tower: TowerState, days: number, cleaning = true) {
  const watch: StayWatch = {
    checkIns: [],
    checkOuts: [],
    departures: [],
    arrivals: [],
    phaseStarts: [],
    dirtyBookings: 0,
    days: [],
    money: [],
  };
  const engine = createEngine({
    commandHandlers: {},
    systems: [...(cleaning ? [cleanAtEleven] : []), ...towerSystems, watcher(watch)],
  });
  const result = engine.runDays(tower, days);
  return { watch, state: result.state };
}

describe('hotel guests over a week', () => {
  const { state: tower } = hotelTower({ rooms: 10, seed: 3 });
  const { watch, state } = runHotelWeek(tower, 7);
  const departureSteps = watch.departures;

  it('checks parties in from 12:00 to 22:30 and never books a dirty room', () => {
    expect(watch.checkIns.length).toBeGreaterThan(10);
    for (const { step: checkIn } of watch.checkIns) {
      expect(minuteOf(checkIn)).toBeGreaterThanOrEqual(12 * 60);
      expect(minuteOf(checkIn)).toBeLessThan(23 * 60);
    }
    for (const arrival of watch.arrivals) {
      expect(minuteOf(arrival)).toBeGreaterThanOrEqual(12 * 60);
      expect(minuteOf(arrival)).toBeLessThan(22 * 60 + 30);
    }
    expect(watch.dirtyBookings).toBe(0);
  });

  it('ends every stay at 10:00 with guests walking out from 06:00 to 10:00', () => {
    expect(watch.checkOuts.length).toBeGreaterThan(5);
    for (const { step: checkOut } of watch.checkOuts) expect(minuteOf(checkOut)).toBe(10 * 60);
    expect(departureSteps.length).toBeGreaterThan(5);
    for (const departure of departureSteps) {
      expect(minuteOf(departure)).toBeGreaterThanOrEqual(6 * 60);
      expect(minuteOf(departure)).toBeLessThan(10 * 60);
    }
  });

  it('files the guests trips of each stay in the room ledger', () => {
    const lastCheckIn = new Map<UnitId, number>();
    for (const { room, step: checkIn } of watch.checkIns) lastCheckIn.set(room, checkIn);
    for (const [room, checkIn] of lastCheckIn) {
      const ledger = state.unitLedger[room] ?? [];
      const ends = ledger.filter((_, index) => index % 2 === 0);
      expect(ends.length).toBeGreaterThan(0);
      expect(ends.every((end) => end >= checkIn)).toBe(true);
      expect(ends).toContain(checkIn);
    }
    const graded = watch.checkOuts.map(({ room }) => state.units[room]?.evaluation ?? null);
    expect(graded.every((grade) => grade !== null)).toBe(true);
  });

  it('holds only the guests of rooms with a stay at the end of the week', () => {
    const pool = state.people;
    for (let slot = 0; slot < pool.id.length; slot++) {
      const routine = guestRoutineAt(pool, slot);
      if (!routine) continue;
      const room = state.units[`u${pool.homeUnit[slot]}`];
      expect(room?.hotel?.stayEndStep ?? null).not.toBeNull();
    }
  });
});

describe('a party with no route to the room', () => {
  it('gives up at 23:00 unpaid, and the room rolls again at 12:00 next day', () => {
    const { state: tower, rooms } = hotelTower({ rooms: 1, reachable: false, seed: 2 });
    const room = rooms[0] as UnitId;
    let state = tower;
    let bookedDay = -1;
    for (let day = 0; day < 5 && bookedDay < 0; day++) {
      state = step(state, [], at(day, 12) + 1 - state.step).state;
      if (hotelOf(state, room).arrivalStep !== null) bookedDay = day;
    }
    expect(bookedDay).toBeGreaterThanOrEqual(0);
    const arrival = hotelOf(state, room).arrivalStep as number;
    state = step(state, [], arrival + 1 - state.step).state;
    const guests = state.people.id.length;
    expect(guests).toBe(HOTEL_PARTY_SIZE['single-room']);
    const money = state.money;

    state = step(state, [], at(bookedDay, 23) - 1 - state.step).state;
    expect(state.people.id).toHaveLength(guests);
    state = step(state, [], 1).state;
    expect(state.people.id).toHaveLength(0);
    expect(hotelOf(state, room)).toMatchObject({
      state: 'clean',
      arrivalStep: null,
      stayEndStep: null,
    });
    expect(state.money).toBe(money);
    expect(state.ledger.currentWeek.hotel.income).toBe(0);

    state = step(state, [], at(bookedDay + 1, 12) - 1 - state.step).state;
    expect(hotelOf(state, room).arrivalStep).toBeNull();
    const rolled = Array.from({ length: 10 }, (_, seed) => {
      const copy = structuredClone(state);
      copy.rng = createRng(seed + 1);
      return step(copy, [], 1).state;
    });
    expect(rolled.some((after) => hotelOf(after, room).arrivalStep !== null)).toBe(true);
  });
});

describe('guest outings', () => {
  const { state: tower } = hotelTower({ rooms: 10, seed: 5, venues: true });
  const { watch, state } = runHotelWeek(tower, 7);
  const startsOf = (phase: GuestRoutine['phase']) =>
    watch.phaseStarts.filter((start) => start.phase === phase).map((start) => minuteOf(start.step));

  it('goes out to eat from 12:30 to 21:30 and the venues count the visits', () => {
    const outings = startsOf('toVenue');
    expect(outings.length).toBeGreaterThan(5);
    for (const minute of outings) {
      expect(minute).toBeGreaterThanOrEqual(12 * 60 + 30);
      expect(minute).toBeLessThan(21 * 60 + 30);
    }
    const visits = Object.values(state.units).reduce(
      (sum, unit) => sum + (unit.venue?.yesterday?.visits ?? 0) + (unit.venue?.visits ?? 0),
      0,
    );
    expect(visits).toBeGreaterThan(0);
  });

  it('leaves for the day from 07:30 to 10:00 and comes back from 13:00 to 20:00', () => {
    const leaves = startsOf('toExit');
    const returns = startsOf('toRoom');
    expect(leaves.length).toBeGreaterThan(3);
    expect(returns.length).toBe(leaves.length);
    for (const minute of leaves) {
      expect(minute).toBeGreaterThanOrEqual(7 * 60 + 30);
      expect(minute).toBeLessThan(10 * 60);
    }
    for (const minute of returns) {
      expect(minute).toBeGreaterThanOrEqual(13 * 60);
      expect(minute).toBeLessThan(20 * 60);
    }
  });
});

describe('hotel guests by subway', () => {
  const RIGHT = 130;
  const SUBWAY_LEVEL = -7;

  /** Ten rooms on level 2 and, below the lobby, a station reached by an elevator, or no station. */
  function subwayHotel(station: boolean, reachable = true) {
    const { state } = buildTower({
      seed: 6,
      lobby: { x0: 0, x1: RIGHT },
      floors: [
        { from: 2, to: 2 as Level, x0: 0, x1: RIGHT },
        { from: -9 as Level, to: -1 as Level, x0: 0, x1: RIGHT },
      ],
      units: [
        ...Array.from({ length: 10 }, (_, index) => ({
          type: ROOM_TYPES[index % ROOM_TYPES.length] as UnitType,
          x: 20 + index * 10,
          level: 2 as Level,
        })),
        ...(station ? [{ type: 'subway-station' as UnitType, x: 10, level: -9 as Level }] : []),
      ],
      shafts: reachable ? [{ type: 'standard', x: 124, bottom: -7, top: 2 }] : [],
    });
    return state;
  }

  interface EntranceLog {
    arrivals: { level: number; room: number }[];
    exits: number[];
    checkIns: UnitId[];
  }

  /** Where each guest appears, the level of each walk out, and the rooms that checked in. */
  function entranceWatcher(log: EntranceLog): SimulationSystem {
    const seen = new Map<number, { level: number; phase: GuestRoutine['phase'] }>();
    return ({ state, events }) => {
      for (const event of events.splice(0)) {
        if (event.type === 'hotelCheckIn') log.checkIns.push(event.unitId);
      }
      const pool = state.people;
      const present = new Set<number>();
      for (let slot = 0; slot < pool.id.length; slot++) {
        const routine = guestRoutineAt(pool, slot);
        if (!routine) continue;
        const id = pool.id[slot] as number;
        const level = pool.level[slot] as number;
        present.add(id);
        const before = seen.get(id);
        if (!before) log.arrivals.push({ level, room: pool.homeUnit[slot] as number });
        if (routine.phase === 'outside' && before?.phase !== 'outside') log.exits.push(level);
        seen.set(id, { level, phase: routine.phase });
      }
      for (const [id, last] of seen) {
        if (present.has(id)) continue;
        if (last.phase === 'leaving') log.exits.push(last.level);
        seen.delete(id);
      }
    };
  }

  function runDays(tower: TowerState, days: number) {
    const log: EntranceLog = { arrivals: [], exits: [], checkIns: [] };
    const engine = createEngine({
      commandHandlers: {},
      systems: [cleanAtEleven, ...towerSystems, entranceWatcher(log)],
    });
    return { log, state: engine.runDays(tower, days).state };
  }

  function runWeek(station: boolean): EntranceLog {
    return runDays(subwayHotel(station), 7).log;
  }

  it('brings some guests in and out by subway, and they still check in', () => {
    const log = runWeek(true);
    const bySubway = log.arrivals.filter((arrival) => arrival.level === SUBWAY_LEVEL);
    expect(bySubway.length).toBeGreaterThan(0);
    expect(bySubway.length).toBeLessThan(log.arrivals.length);
    expect(log.exits.filter((level) => level === SUBWAY_LEVEL).length).toBeGreaterThan(0);
    const checkedInRooms = new Set(log.checkIns.map((id) => Number(id.slice(1))));
    expect(bySubway.some((arrival) => checkedInRooms.has(arrival.room))).toBe(true);
  });

  it('brings every guest by street without a station, still checking parties in', () => {
    const log = runWeek(false);
    expect(log.checkIns.length).toBeGreaterThan(10);
    expect(log.arrivals.every((arrival) => arrival.level === 1)).toBe(true);
    expect(log.exits.every((level) => level === 1)).toBe(true);
  });

  it('gives up at 23:00 when the rooms cannot be reached from any entrance', () => {
    const { log, state } = runDays(subwayHotel(true, false), 3);
    expect(log.arrivals.length).toBeGreaterThan(0);
    expect(log.checkIns).toHaveLength(0);
    expect(state.people.id).toHaveLength(0);
  });
});

/** One suite on level 2 and a basement with a ramp and `spaces` parking spaces, at 3 stars. */
function suiteParkingTower(spaces: number) {
  const { state, unitIds } = buildTower({
    seed: 4,
    lobby: { x0: 0, x1: 79 },
    floors: [
      { from: 2, to: 2 as Level, x0: 0, x1: 79 },
      { from: -1 as Level, to: -1 as Level, x0: 0, x1: 79 },
    ],
    units: [
      { type: 'suite', level: 2 as Level, x: 20 },
      { type: 'parking-ramp', level: -1 as Level, x: 0 },
      ...Array.from({ length: spaces }, (_, index) => ({
        type: 'parking-space' as const,
        level: -1 as Level,
        x: 16 + index * 4,
      })),
    ],
  });
  addFlight(state, 'stairs', 4, 1);
  state.stars = 3;
  return { state, suite: unitIds[0] as UnitId, spaces: unitIds.slice(2) };
}

/** Runs to the suite party's arrival, makes guest 1 a parking holder, then runs to check-in. */
function checkInHolder(tower: TowerState, suite: UnitId) {
  let state = tower;
  for (let day = 0; day < 10 && hotelOf(state, suite).arrivalStep === null; day++) {
    state = step(state, [], at(day, 12) + 1 - state.step).state;
  }
  const arrival = hotelOf(state, suite).arrivalStep;
  if (arrival === null) throw new Error('The suite was never booked');
  state = step(state, [], arrival + 1 - state.step).state;
  const holder = state.people.id[0] as number;
  state.parking.spaces[holder] = 0;
  const lastMinute = at(Math.floor(arrival / STEPS_PER_DAY), 23);
  while (hotelOf(state, suite).stayEndStep === null && state.step < lastMinute) {
    state = step(state, [], 1).state;
  }
  expect(hotelOf(state, suite).stayEndStep).not.toBeNull();
  return { state, holder };
}

describe('suite parking at check-in', () => {
  it('gives the holder a free space at check-in and frees it at check-out', () => {
    const { state: tower, suite, spaces } = suiteParkingTower(2);
    const { state: checkedIn, holder } = checkInHolder(tower, suite);
    const firstSpace = Number((spaces[0] as string).slice(1));
    expect(checkedIn.parking.spaces[holder]).toBe(firstSpace);
    expect(checkedIn.lastParkingFailureStep).toBeNull();

    const stayEnd = hotelOf(checkedIn, suite).stayEndStep as number;
    const after = step(checkedIn, [], stayEnd + 1 - checkedIn.step).state;
    expect(hotelOf(after, suite).stayEndStep).toBeNull();
    expect(Object.hasOwn(after.parking.spaces, holder)).toBe(false);
    expect(Object.values(after.parking.spaces)).not.toContain(firstSpace);
  });

  it('checks the party in without a space when the lot is full', () => {
    const { state: tower, suite } = suiteParkingTower(0);
    const { state, holder } = checkInHolder(tower, suite);
    expect(hotelOf(state, suite).state).toBe('occupied');
    expect(state.parking.spaces[holder]).toBe(0);
    expect(state.lastParkingFailureStep).toBe(hotelOf(state, suite).checkInStep);
  });
});

describe('guest sleep', () => {
  const { state: tower } = hotelTower({ rooms: 10, seed: 5, venues: true });
  const sleepers: number[] = [];
  const insideMidday: number[] = [];
  const watch: SimulationSystem = ({ state }) => {
    const pool = state.people;
    for (let slot = 0; slot < pool.id.length; slot++) {
      const phase = guestRoutineAt(pool, slot)?.phase;
      if (phase === undefined) continue;
      const minute = minuteOf(state.step);
      if (phase === 'sleeping' && state.step % STEPS_PER_MINUTE === 0) sleepers.push(minute);
      const stayIn = phase === 'room' || phase === 'sleeping';
      if (stayIn && minute >= 10 * 60 + 30 && minute < 13 * 60) insideMidday.push(state.step);
    }
  };
  const engine = createEngine({
    commandHandlers: {},
    systems: [...towerSystems, watch],
  });
  const { watch: log } = runHotelWeek(tower, 1);
  engine.runDays(tower, 8);

  it('puts guests to sleep at night and not in the afternoon', () => {
    expect(sleepers.length).toBeGreaterThan(100);
    for (const minute of sleepers) {
      expect(minute < 9 * 60 || minute >= 22 * 60).toBe(true);
    }
    expect(log.checkIns.length).toBeGreaterThan(0);
  });

  it('keeps every room empty from 10:30 to 13:00', () => {
    expect(insideMidday).toHaveLength(0);
  });

  it('packs a sleeping routine with no intentions into a number that is not zero', () => {
    const routine: GuestRoutine = { phase: 'sleeping', venue: 0, slots: [0, 0, 0] };
    const packed = encodeGuestRoutine(routine);
    expect(packed).not.toBe(0);
    expect(decodeGuestRoutine(packed)).toEqual(routine);
  });
});
