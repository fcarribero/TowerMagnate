import {
  AMBIENT_CALM_EVERY,
  AMBIENT_CALM_RELIEF,
  AMBIENT_DIRT_RADIUS,
  AMBIENT_DIRT_STRESS,
  AMBIENT_DIRT_UNIT_RADIUS,
  AMBIENT_NOISE_RADIUS,
  AMBIENT_STAY_CALM_PER_HOUR,
  AMBIENT_STAY_DIRT_PER_HOUR,
  AMBIENT_STAY_MAX_STEPS,
  AMBIENT_STAY_NOISE_PER_HOUR,
  AMBIENT_WAIT_DIRT_PER_MINUTE,
  AMBIENT_WAIT_NOISE_PER_MINUTE,
  AMBIENT_NOISE_SOURCES,
  AMBIENT_NOISE_STRESS,
  GARBAGE_PILE_POSITION,
  UNIT_CATALOG,
  type PersonPool,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { isCarryingBag } from './venue-staff';

/** A garbage bag on the floor (a venue's pile) or on someone's shoulder. */
export interface Bag {
  level: number;
  column: number;
}

/** What the walkers of one step feel at each cell; built once per step from the tower. */
export interface Ambient {
  /** Stress steps to add for one column walked at `column` on `level`; negative when calm. */
  walkDelta(level: number, column: number): number;
  /** Stress for `steps` spent waiting at a shaft at this cell. */
  waitDelta(level: number, column: number, steps: number): number;
  /** Stress for `steps` spent sitting at this cell between two trips (capped, negative when calm). */
  stayDelta(level: number, column: number, steps: number): number;
}

function floorsOf(unit: Unit): number {
  const { height } = UNIT_CATALOG[unit.type];
  return height.kind === 'fixed' ? height.floors : 1;
}

function pileColumn(unit: Unit): number {
  return unit.x + Math.floor(UNIT_CATALOG[unit.type].width * GARBAGE_PILE_POSITION);
}

/** Every bag in the tower: venue piles and bags the crew carries. */
export function bagsOf(state: TowerState): Bag[] {
  const bags: Bag[] = [];
  for (const unit of Object.values(state.units)) {
    if (unit.venue && unit.venue.garbage > 0) {
      bags.push({ level: unit.level, column: pileColumn(unit) });
    }
  }
  const pool: PersonPool = state.people;
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (isCarryingBag(pool, slot)) {
      bags.push({ level: pool.level[slot] as number, column: pool.column[slot] as number });
    }
  }
  return bags;
}

/** True when a bag lies or is carried on the unit's levels within the evaluation radius. */
export function isDirty(unit: Unit, bags: readonly Bag[]): boolean {
  const top = unit.level + floorsOf(unit) - 1;
  const last = unit.x + UNIT_CATALOG[unit.type].width - 1;
  return bags.some(
    (bag) =>
      bag.level >= unit.level &&
      bag.level <= top &&
      bag.column >= unit.x - AMBIENT_DIRT_UNIT_RADIUS &&
      bag.column <= last + AMBIENT_DIRT_UNIT_RADIUS,
  );
}

export function buildAmbient(state: TowerState): Ambient {
  const noise = new Map<number, number[]>();
  for (const unit of Object.values(state.units)) {
    if (!AMBIENT_NOISE_SOURCES.includes(unit.type)) continue;
    const from = unit.x - AMBIENT_NOISE_RADIUS;
    const to = unit.x + UNIT_CATALOG[unit.type].width - 1 + AMBIENT_NOISE_RADIUS;
    for (let level = unit.level; level < unit.level + floorsOf(unit); level++) {
      const spans = noise.get(level);
      if (spans) spans.push(from, to);
      else noise.set(level, [from, to]);
    }
  }
  const dirt = new Map<number, number[]>();
  for (const bag of bagsOf(state)) {
    const columns = dirt.get(bag.level);
    if (columns) columns.push(bag.column);
    else dirt.set(bag.level, [bag.column]);
  }
  const noisyAt = (level: number, column: number): boolean => {
    const spans = noise.get(level);
    if (!spans) return false;
    for (let at = 0; at < spans.length; at += 2) {
      if (column >= (spans[at] as number) && column <= (spans[at + 1] as number)) return true;
    }
    return false;
  };
  const dirtyAt = (level: number, column: number): boolean =>
    dirt.get(level)?.some((bag) => Math.abs(bag - column) <= AMBIENT_DIRT_RADIUS) ?? false;
  return {
    walkDelta(level, column) {
      let delta = 0;
      if (noisyAt(level, column)) delta += AMBIENT_NOISE_STRESS;
      if (dirtyAt(level, column)) delta += AMBIENT_DIRT_STRESS;
      if (delta === 0 && column % AMBIENT_CALM_EVERY === 0) delta = -AMBIENT_CALM_RELIEF;
      return delta;
    },
    waitDelta(level, column, steps) {
      let perMinute = 0;
      if (noisyAt(level, column)) perMinute += AMBIENT_WAIT_NOISE_PER_MINUTE;
      if (dirtyAt(level, column)) perMinute += AMBIENT_WAIT_DIRT_PER_MINUTE;
      return Math.floor((steps * perMinute) / STEPS_PER_MINUTE);
    },
    stayDelta(level, column, steps) {
      const held = Math.min(Math.max(steps, 0), AMBIENT_STAY_MAX_STEPS);
      let perHour = 0;
      if (noisyAt(level, column)) perHour += AMBIENT_STAY_NOISE_PER_HOUR;
      if (dirtyAt(level, column)) perHour += AMBIENT_STAY_DIRT_PER_HOUR;
      if (perHour === 0) perHour = -AMBIENT_STAY_CALM_PER_HOUR;
      return Math.trunc((held * perHour) / STEPS_PER_HOUR);
    },
  };
}

const STEPS_PER_MINUTE = 6;
const STEPS_PER_HOUR = 360;

const memo = new WeakMap<TowerState, { step: number; ambient: Ambient }>();

/** The ambient of this tower at its current step, built once per step however many people ask. */
export function ambientOf(state: TowerState): Ambient {
  const kept = memo.get(state);
  if (kept && kept.step === state.step) return kept.ambient;
  const ambient = buildAmbient(state);
  memo.set(state, { step: state.step, ambient });
  return ambient;
}
