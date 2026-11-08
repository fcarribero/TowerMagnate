import { z } from 'zod';
import { PERSON_KINDS } from '../people';
import { MAX_CARS_PER_SHAFT } from './commands';

/**
 * People and cars dominate delta size, so deltas carry them as flat number tuples.
 * Every field is a number: ids lose their prefix and enums become an index into the
 * lists below. The lists are part of the protocol, so only ever append to them.
 */
export const FACINGS = ['left', 'right'] as const;
export const PERSON_MODES = ['walk', 'wait', 'ride', 'stairs', 'inside'] as const;
export const STRESS_LEVELS = ['normal', 'stressed', 'veryStressed'] as const;
export const CAR_DIRECTIONS = ['up', 'down', 'idle'] as const;
export const CAR_DOORS = ['open', 'closed'] as const;

const MAX_CAR_LOAD = 42;

const index = (length: number) =>
  z
    .int()
    .min(0)
    .max(length - 1);

/** [id, kind, x, level, facing, mode, stress, shaft, car]; shaft is 0 when not in a car. */
export const PackedPersonSchema = z.tuple([
  z.int().positive(),
  index(PERSON_KINDS.length),
  z.number().nonnegative(),
  z.int(),
  index(FACINGS.length),
  index(PERSON_MODES.length),
  index(STRESS_LEVELS.length),
  z.int().nonnegative(),
  index(MAX_CARS_PER_SHAFT),
]);

/** [shaft, car, position, direction, doors, load]. */
export const PackedCarSchema = z.tuple([
  z.int().positive(),
  index(MAX_CARS_PER_SHAFT),
  z.number().nonnegative(),
  index(CAR_DIRECTIONS.length),
  index(CAR_DOORS.length),
  z.int().min(0).max(MAX_CAR_LOAD),
]);

export type PackedPerson = z.infer<typeof PackedPersonSchema>;
export type PackedCar = z.infer<typeof PackedCarSchema>;

interface PersonFields {
  id: string;
  kind: (typeof PERSON_KINDS)[number];
  x: number;
  level: number;
  facing: (typeof FACINGS)[number];
  mode: (typeof PERSON_MODES)[number];
  carRef: { shaftId: string; index: number } | null;
  stress: (typeof STRESS_LEVELS)[number];
}

interface CarFields {
  shaftId: string;
  index: number;
  position: number;
  direction: (typeof CAR_DIRECTIONS)[number];
  doors: (typeof CAR_DOORS)[number];
  load: number;
}

function at<T>(list: readonly T[], position: number): T {
  const item = list[position];
  if (item === undefined) {
    throw new RangeError(`No entry ${position} in packed list`);
  }
  return item;
}

function entityNumber(id: string): number {
  return Number(id.slice(1));
}

export function packPerson(person: PersonFields): PackedPerson {
  return [
    entityNumber(person.id),
    PERSON_KINDS.indexOf(person.kind),
    person.x,
    person.level,
    FACINGS.indexOf(person.facing),
    PERSON_MODES.indexOf(person.mode),
    STRESS_LEVELS.indexOf(person.stress),
    person.carRef ? entityNumber(person.carRef.shaftId) : 0,
    person.carRef?.index ?? 0,
  ];
}

export function unpackPerson([id, kind, x, level, facing, mode, stress, shaft, car]: PackedPerson) {
  return {
    id: `p${id}`,
    kind: at(PERSON_KINDS, kind),
    x,
    level,
    facing: at(FACINGS, facing),
    mode: at(PERSON_MODES, mode),
    carRef: shaft === 0 ? null : { shaftId: `s${shaft}`, index: car },
    stress: at(STRESS_LEVELS, stress),
  };
}

export function packCar(car: CarFields): PackedCar {
  return [
    entityNumber(car.shaftId),
    car.index,
    car.position,
    CAR_DIRECTIONS.indexOf(car.direction),
    CAR_DOORS.indexOf(car.doors),
    car.load,
  ];
}

export function unpackCar([shaft, car, position, direction, doors, load]: PackedCar) {
  return {
    shaftId: `s${shaft}`,
    index: car,
    position,
    direction: at(CAR_DIRECTIONS, direction),
    doors: at(CAR_DOORS, doors),
    load,
  };
}
