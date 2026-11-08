import {
  CAR_DIRECTIONS,
  CAR_PHASES,
  DWELL_SECONDS_OPTIONS,
  ELEVATOR_BAND_STARTS,
  ELEVATOR_MODES,
  ELEVATOR_QUEUE_CAPACITY,
  HotelRoomStateSchema,
  isLevel,
  PRICE_LEVELS,
  RESPONSE_DISTANCE_MAX,
  RESPONSE_DISTANCE_MIN,
  SHAFT_TYPES,
  UNIT_TYPES,
  type ElevatorCar,
  type CondoSale,
  type HallCall,
  type HotelRoom,
  type Lease,
  type QueueEntry,
  type RiderTrip,
  type RngState,
  type ShaftBand,
  type Level,
  type Shaft,
  type ShaftSchedule,
  type ShaftType,
  type ShaftId,
  type StopQueues,
  type TowerState,
  type Unit,
  type UnitId,
} from '@tower-magnate/shared';
import { defaultSchedule, defaultStops } from '../commands/shafts';
import { SCHEMA_VERSION } from '../state';
import { isHotelRoomType, newHotelRoom } from '../units';
import { isRecord, StateMigrationError } from './errors';
import { readActiveEvents, readClosedDecisions, readNotices, readTreasureLevels } from './events';
import { readGrid } from './grid';
import { readLedger, readMoney } from './money';
import { readPeople } from './people';
import { readStars } from './stars';
import { readTransports } from './transports';

export { StateMigrationError } from './errors';

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] turns a version n+1 state into version n+2. */
const MIGRATIONS: readonly Migration[] = [
  addUnitPurchaseRecord,
  addUnitLeaseRecord,
  addShafts,
  addTransportRecord,
  addEventState,
  addPersonPool,
  addStarRating,
  addHallQueues,
  addStarState,
  addHotelRooms,
  addCondoSaleRecord,
  addCarMotion,
  addTrekState,
  addNoticesAndFireLevel,
];

/** Version 2 records each unit's price level, what was paid for it and when it was placed. */
function addUnitPurchaseRecord(raw: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(raw.units)) {
    return { ...raw, schemaVersion: 2 };
  }
  const units: Record<string, unknown> = {};
  for (const [id, unit] of Object.entries(raw.units)) {
    units[id] = isRecord(unit) ? { priceLevel: 'normal', paid: 0, placedAtStep: 0, ...unit } : unit;
  }
  return { ...raw, schemaVersion: 2, units };
}

/** Version 3 records whether each unit was ever used and its current lease. */
function addUnitLeaseRecord(raw: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(raw.units)) {
    return { ...raw, schemaVersion: 3 };
  }
  const units: Record<string, unknown> = {};
  for (const [id, unit] of Object.entries(raw.units)) {
    units[id] = isRecord(unit) ? { used: false, lease: null, ...unit } : unit;
  }
  return { ...raw, schemaVersion: 3, units };
}

/** Version 4 keeps elevator shafts in their own record. */
function addShafts(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, schemaVersion: 4, shafts: raw.shafts ?? {} };
}

/** Version 5 records the stairs and escalators; older towers have none. */
function addTransportRecord(raw: Record<string, unknown>): Record<string, unknown> {
  return { transports: {}, ...raw, schemaVersion: 5 };
}

/** Version 6 stores event state: active events, closed decision ids and treasure levels. */
function addEventState(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    schemaVersion: 6,
    activeEvents: raw.activeEvents ?? [],
    closedDecisions: raw.closedDecisions ?? [],
    treasureLevels: raw.treasureLevels ?? [],
  };
}

const EMPTY_VERSION_7_PEOPLE = {
  nextId: 1,
  id: [],
  kind: [],
  homeUnit: [],
  level: [],
  column: [],
  trip: [],
  dueStep: [],
  stress: [],
  nameSeed: [],
  followed: [],
};

/** Version 7 saves the person pool; older saves could only load without people. */
function addPersonPool(raw: Record<string, unknown>): Record<string, unknown> {
  return { people: EMPTY_VERSION_7_PEOPLE, ...raw, schemaVersion: 7 };
}

/** Version 8 records the star rating; older towers start at one star. */
function addStarRating(raw: Record<string, unknown>): Record<string, unknown> {
  return { stars: 1, ...raw, schemaVersion: 8 };
}

/** Version 9 gives every shaft its floor queues; nobody was waiting in older saves. */
function addHallQueues(raw: Record<string, unknown>): Record<string, unknown> {
  const shafts: Record<string, unknown> = {};
  if (isRecord(raw.shafts)) {
    for (const [id, shaft] of Object.entries(raw.shafts)) {
      shafts[id] = isRecord(shaft) ? { queues: {}, ...shaft } : shaft;
    }
  }
  return { ...raw, schemaVersion: 9, shafts };
}

/** Version 10 keeps the star check state. Earlier towers have no VIP approval and no failures. */
function addStarState(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    vipApproved: false,
    lastMedicalFailureStep: null,
    lastParkingFailureStep: null,
    ...raw,
    schemaVersion: 10,
  };
}

/**
 * Version 13 gives each car its motion state and each queued person a destination, and each shaft its stops and band schedule. Older cars
 * stand idle and their riders get off at the next stop; queued people head for the end of the shaft.
 */
function addCarMotion(raw: Record<string, unknown>): Record<string, unknown> {
  const step = isNonNegativeInteger(raw.step) ? raw.step : 0;
  const shafts: Record<string, unknown> = {};
  if (isRecord(raw.shafts)) {
    for (const [id, shaft] of Object.entries(raw.shafts)) {
      shafts[id] = isRecord(shaft) ? withCarMotion(shaft, step) : shaft;
    }
  }
  return { ...raw, schemaVersion: 13, shafts };
}

function withCarMotion(shaft: Record<string, unknown>, step: number): Record<string, unknown> {
  const stops = Array.isArray(shaft.stops) ? shaft.stops : oldShaftStops(shaft);
  const schedule = isRecord(shaft.schedule) ? shaft.schedule : defaultSchedule();
  const cars = Array.isArray(shaft.cars) ? shaft.cars.map((car) => carWithMotion(car, step)) : [];
  const queues: Record<string, unknown> = {};
  if (isRecord(shaft.queues)) {
    for (const [level, stop] of Object.entries(shaft.queues)) {
      queues[level] = isRecord(stop) ? stopWithDestinations(stop, shaft) : stop;
    }
  }
  return { ...shaft, cars, queues, stops, schedule };
}

function oldShaftStops(shaft: Record<string, unknown>): Level[] {
  const range = { x: Number(shaft.x), bottom: shaft.bottom as Level, top: shaft.top as Level };
  const isShaftType = (SHAFT_TYPES as readonly unknown[]).includes(shaft.type);
  if (!isShaftType || !isLevel(range.bottom) || !isLevel(range.top) || range.bottom > range.top) {
    return [];
  }
  return defaultStops(shaft.type as ShaftType, range);
}

function carWithMotion(car: unknown, step: number): unknown {
  if (!isRecord(car)) {
    return car;
  }
  const riders = Array.isArray(car.riders) ? car.riders : [];
  const trips = riders.map(() => ({ destination: car.level, boardedStep: step, waitSteps: 0 }));
  return { trips, phase: 'idle', direction: 'idle', phaseStepsLeft: 0, assigned: [], ...car };
}

function stopWithDestinations(
  stop: Record<string, unknown>,
  shaft: Record<string, unknown>,
): Record<string, unknown> {
  const withDestination = (entries: unknown, destination: unknown): unknown =>
    Array.isArray(entries)
      ? entries.map((entry) => (isRecord(entry) ? { destination, ...entry } : entry))
      : entries;
  return {
    ...stop,
    up: withDestination(stop.up, shaft.top),
    down: withDestination(stop.down, shaft.bottom),
  };
}

/** Version 14 gives each person the state of the trip they are on; nobody is travelling in an older save. */
function addTrekState(raw: Record<string, unknown>): Record<string, unknown> {
  const people = raw.people;
  if (!isRecord(people) || !Array.isArray(people.id)) {
    return { ...raw, schemaVersion: 14 };
  }
  const ids: unknown[] = people.id;
  const idle = (): number[] => ids.map(() => 0);
  const trekFields = {
    trek: idle(),
    trekLevel: idle(),
    trekColumn: idle(),
    trekBudget: idle(),
    legVia: idle(),
    legLevel: idle(),
    legColumn: idle(),
    legStep: idle(),
  };
  return { ...raw, schemaVersion: 14, people: { ...trekFields, ...people } };
}

/** Version 15 keeps the last notices and records the floor of each fire; older fires burn on level 1. */
function addNoticesAndFireLevel(raw: Record<string, unknown>): Record<string, unknown> {
  const activeEvents = Array.isArray(raw.activeEvents)
    ? raw.activeEvents.map((event) =>
        isRecord(event) && event.kind === 'fire' ? { level: 1, ...event } : event,
      )
    : raw.activeEvents;
  return { notices: [], ...raw, activeEvents, schemaVersion: 15 };
}

/** Version 11 gives each hotel room a state; every room in an older tower is clean and empty. */
function addHotelRooms(raw: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(raw.units)) {
    return { ...raw, schemaVersion: 11 };
  }
  const units: Record<string, unknown> = {};
  for (const [id, unit] of Object.entries(raw.units)) {
    units[id] = isRecord(unit) ? { hotel: hotelRoomFor(unit.type), ...unit } : unit;
  }
  return { ...raw, schemaVersion: 11, units };
}

function hotelRoomFor(type: unknown): HotelRoom | null {
  const isRoom =
    (UNIT_TYPES as readonly unknown[]).includes(type) && isHotelRoomType(type as never);
  return isRoom ? newHotelRoom() : null;
}

/** Version 12 records each condo's sale; every condo in an older save is still for sale. */
function addCondoSaleRecord(raw: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(raw.units)) {
    return { ...raw, schemaVersion: 12 };
  }
  const units: Record<string, unknown> = {};
  for (const [id, unit] of Object.entries(raw.units)) {
    units[id] = isRecord(unit) ? { sale: null, ...unit } : unit;
  }
  return { ...raw, schemaVersion: 12, units };
}

function isUint32(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffff_ffff;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isRngState(value: unknown): value is RngState {
  return (
    isRecord(value) &&
    isUint32(value.a) &&
    isUint32(value.b) &&
    isUint32(value.c) &&
    isUint32(value.d)
  );
}

function isUnit(value: unknown): value is Unit {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (UNIT_TYPES as readonly unknown[]).includes(value.type) &&
    isNonNegativeInteger(value.x) &&
    isLevel(value.level) &&
    (value.name === null || typeof value.name === 'string') &&
    (PRICE_LEVELS as readonly unknown[]).includes(value.priceLevel) &&
    isNonNegativeInteger(value.paid) &&
    isNonNegativeInteger(value.placedAtStep) &&
    typeof value.used === 'boolean' &&
    (value.lease === null || isLease(value.lease)) &&
    (value.hotel === null || isHotelRoom(value.hotel)) &&
    (value.sale === null || isCondoSale(value.sale))
  );
}

function isHotelRoom(value: unknown): value is HotelRoom {
  return (
    isRecord(value) &&
    (HotelRoomStateSchema.options as readonly unknown[]).includes(value.state) &&
    (value.stayEndStep === null || isNonNegativeInteger(value.stayEndStep)) &&
    (value.state === 'occupied') === (value.stayEndStep !== null)
  );
}

function isCondoSale(value: unknown): value is CondoSale {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.price) &&
    isNonNegativeInteger(value.anchorStep) &&
    isNonNegativeInteger(value.nextEvaluationStep) &&
    value.nextEvaluationStep > value.anchorStep
  );
}

function isLease(value: unknown): value is Lease {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.anchorStep) &&
    isNonNegativeInteger(value.nextDueStep) &&
    value.nextDueStep > value.anchorStep
  );
}

/** Towers saved before units existed have no `units` record; they start with none. */
function readUnits(raw: unknown): Record<UnitId, Unit> {
  if (raw === undefined) {
    return {};
  }
  if (!isRecord(raw)) {
    throw new StateMigrationError('State units must be a record');
  }
  const units: Record<UnitId, Unit> = {};
  for (const [id, unit] of Object.entries(raw)) {
    if (!isUnit(unit) || unit.id !== id) {
      throw new StateMigrationError(`State unit ${id} is malformed`);
    }
    units[id] = {
      id: unit.id,
      type: unit.type,
      x: unit.x,
      level: unit.level,
      name: unit.name,
      priceLevel: unit.priceLevel,
      paid: unit.paid,
      placedAtStep: unit.placedAtStep,
      used: unit.used,
      lease: unit.lease === null ? null : { ...unit.lease },
      sale: unit.sale === null ? null : { ...unit.sale },
      hotel: unit.hotel === null ? null : { ...unit.hotel },
    };
  }
  return units;
}

function isElevatorCar(value: unknown): value is ElevatorCar {
  return (
    isRecord(value) &&
    isLevel(value.homeLevel) &&
    isLevel(value.level) &&
    Array.isArray(value.riders) &&
    value.riders.every((rider) => typeof rider === 'string') &&
    Array.isArray(value.trips) &&
    value.trips.length === value.riders.length &&
    value.trips.every(isRiderTrip) &&
    (CAR_PHASES as readonly unknown[]).includes(value.phase) &&
    (CAR_DIRECTIONS as readonly unknown[]).includes(value.direction) &&
    isNonNegativeInteger(value.phaseStepsLeft) &&
    Array.isArray(value.assigned) &&
    value.assigned.every(isHallCall) &&
    isNonNegativeInteger(value.paid) &&
    isNonNegativeInteger(value.placedAtStep)
  );
}

function isRiderTrip(value: unknown): value is RiderTrip {
  return (
    isRecord(value) &&
    isLevel(value.destination) &&
    isNonNegativeInteger(value.boardedStep) &&
    isNonNegativeInteger(value.waitSteps)
  );
}

function isHallCall(value: unknown): value is HallCall {
  return (
    isRecord(value) &&
    isLevel(value.level) &&
    (value.direction === 'up' || value.direction === 'down')
  );
}

function isQueueEntry(value: unknown): value is QueueEntry {
  return (
    isRecord(value) &&
    typeof value.person === 'string' &&
    isLevel(value.destination) &&
    isNonNegativeInteger(value.joinedStep)
  );
}

function isStopQueues(value: unknown): value is StopQueues {
  return (
    isRecord(value) &&
    Array.isArray(value.up) &&
    Array.isArray(value.down) &&
    value.up.length <= ELEVATOR_QUEUE_CAPACITY &&
    value.down.length <= ELEVATOR_QUEUE_CAPACITY &&
    value.up.every(isQueueEntry) &&
    value.down.every(isQueueEntry)
  );
}

function isShaftBand(value: unknown): value is ShaftBand {
  return (
    isRecord(value) &&
    (ELEVATOR_MODES as readonly unknown[]).includes(value.mode) &&
    (DWELL_SECONDS_OPTIONS as readonly unknown[]).includes(value.dwellSeconds) &&
    Number.isInteger(value.responseDistance) &&
    (value.responseDistance as number) >= RESPONSE_DISTANCE_MIN &&
    (value.responseDistance as number) <= RESPONSE_DISTANCE_MAX
  );
}

function isSchedule(value: unknown): value is ShaftSchedule {
  const isDay = (bands: unknown) =>
    Array.isArray(bands) &&
    bands.length === ELEVATOR_BAND_STARTS.length &&
    bands.every(isShaftBand);
  return isRecord(value) && isDay(value.weekday) && isDay(value.weekend);
}

function copyBand(band: ShaftBand): ShaftBand {
  return { ...band };
}

function isShaft(value: unknown): value is Shaft {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (SHAFT_TYPES as readonly unknown[]).includes(value.type) &&
    isNonNegativeInteger(value.x) &&
    isLevel(value.bottom) &&
    isLevel(value.top) &&
    value.bottom <= value.top &&
    Array.isArray(value.cars) &&
    value.cars.length > 0 &&
    value.cars.every(isElevatorCar) &&
    Array.isArray(value.stops) &&
    value.stops.every(isLevel) &&
    isSchedule(value.schedule) &&
    isRecord(value.queues) &&
    Object.values(value.queues).every(isStopQueues) &&
    isNonNegativeInteger(value.paid) &&
    isNonNegativeInteger(value.placedAtStep)
  );
}

function copyEntry(entry: QueueEntry): QueueEntry {
  return { person: entry.person, destination: entry.destination, joinedStep: entry.joinedStep };
}

function readShafts(raw: unknown): Record<ShaftId, Shaft> {
  if (!isRecord(raw)) {
    throw new StateMigrationError('State shafts must be a record');
  }
  const shafts: Record<ShaftId, Shaft> = {};
  for (const [id, shaft] of Object.entries(raw)) {
    if (!isShaft(shaft) || shaft.id !== id) {
      throw new StateMigrationError(`State shaft ${id} is malformed`);
    }
    shafts[id] = {
      id: shaft.id,
      type: shaft.type,
      x: shaft.x,
      bottom: shaft.bottom,
      top: shaft.top,
      cars: shaft.cars.map((car) => ({
        homeLevel: car.homeLevel,
        level: car.level,
        riders: [...car.riders],
        trips: car.trips.map((trip) => ({ ...trip })),
        phase: car.phase,
        direction: car.direction,
        phaseStepsLeft: car.phaseStepsLeft,
        assigned: car.assigned.map((call) => ({ ...call })),
        paid: car.paid,
        placedAtStep: car.placedAtStep,
      })),
      stops: [...shaft.stops],
      schedule: {
        weekday: shaft.schedule.weekday.map(copyBand),
        weekend: shaft.schedule.weekend.map(copyBand),
      },
      queues: Object.fromEntries(
        Object.entries(shaft.queues).map(([level, stop]) => [
          level,
          { up: stop.up.map(copyEntry), down: stop.down.map(copyEntry) },
        ]),
      ),
      paid: shaft.paid,
      placedAtStep: shaft.placedAtStep,
    };
  }
  return shafts;
}

function assertCurrentShape(raw: Record<string, unknown>): TowerState {
  if (!isNonNegativeInteger(raw.step)) {
    throw new StateMigrationError('State step must be a non-negative integer');
  }
  if (!isRngState(raw.rng)) {
    throw new StateMigrationError('State rng must hold four unsigned 32-bit words');
  }
  if (!isNonNegativeInteger(raw.nextId)) {
    throw new StateMigrationError('State nextId must be a non-negative integer');
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    step: raw.step,
    rng: { a: raw.rng.a, b: raw.rng.b, c: raw.rng.c, d: raw.rng.d },
    nextId: raw.nextId,
    money: readMoney(raw.money),
    stars: readStars(raw.stars),
    units: readUnits(raw.units),
    transports: readTransports(raw.transports),
    shafts: readShafts(raw.shafts),
    grid: readGrid(raw.grid),
    people: readPeople(raw.people),
    ledger: readLedger(raw.ledger),
    activeEvents: readActiveEvents(raw.activeEvents),
    closedDecisions: readClosedDecisions(raw.closedDecisions),
    notices: readNotices(raw.notices),
    treasureLevels: readTreasureLevels(raw.treasureLevels),
    ...readStarState(raw),
  };
}

type StarState = Pick<
  TowerState,
  'vipApproved' | 'lastMedicalFailureStep' | 'lastParkingFailureStep'
>;

function readStarState(raw: Record<string, unknown>): StarState {
  const { vipApproved, lastMedicalFailureStep, lastParkingFailureStep } = raw;
  if (typeof vipApproved !== 'boolean') {
    throw new StateMigrationError('State vipApproved must be true or false');
  }
  for (const failure of [lastMedicalFailureStep, lastParkingFailureStep]) {
    if (failure !== null && !isNonNegativeInteger(failure)) {
      throw new StateMigrationError('State failure steps must be null or non-negative integers');
    }
  }
  return {
    vipApproved,
    lastMedicalFailureStep: lastMedicalFailureStep as number | null,
    lastParkingFailureStep: lastParkingFailureStep as number | null,
  };
}

export function migrateState(raw: unknown): TowerState {
  if (!isRecord(raw)) {
    throw new StateMigrationError('State must be an object');
  }
  const version = raw.schemaVersion;
  if (version === undefined) {
    throw new StateMigrationError('State has no schema version');
  }
  if (!Number.isInteger(version) || (version as number) < 1) {
    throw new StateMigrationError(`Unknown schema version ${String(version)}`);
  }
  if ((version as number) > SCHEMA_VERSION) {
    throw new StateMigrationError(
      `State schema version ${String(version)} is newer than this engine (${SCHEMA_VERSION})`,
    );
  }
  let migrated = raw;
  for (let from = version as number; from < SCHEMA_VERSION; from++) {
    const migration = MIGRATIONS[from - 1];
    if (!migration) {
      throw new StateMigrationError(`No migration from schema version ${from}`);
    }
    migrated = migration(migrated);
  }
  return assertCurrentShape(migrated);
}
