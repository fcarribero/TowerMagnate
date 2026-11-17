import {
  AMBIENT_CALM_EVERY_MINUTES,
  AMBIENT_CALM_RELIEF,
  AMBIENT_DIRT_PER_MINUTE,
  AMBIENT_DIRT_RADIUS,
  AMBIENT_NOISE_PER_MINUTE,
  AMBIENT_NOISE_RADIUS,
  AMBIENT_NOISE_SOURCES,
  AMBIENT_STAY_MAX_STEPS,
  GARBAGE_PILE_POSITION,
  UNIT_CATALOG,
  type PersonPool,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { isCarryingBag } from './venue-staff';

const STEPS_PER_MINUTE = 6;

/** A garbage bag on the floor (a venue's pile) or on someone's shoulder. */
interface Bag {
  level: number;
  column: number;
}

/** What people feel at each cell; built once per step from the tower. */
export interface Ambient {
  /** True when the cell is inside a unit: walking there adds no stress. */
  insideUnit(level: number, column: number): boolean;
  /** Stress for one game minute at this cell: noise and bags add, a quiet clean cell gives back now and then. */
  minuteDelta(level: number, column: number, minute: number): number;
  /** Stress for `steps` sitting at this cell between two trips, capped. */
  stayDelta(level: number, column: number, steps: number): number;
}

function floorsOf(unit: Unit): number {
  const { height } = UNIT_CATALOG[unit.type];
  return height.kind === 'fixed' ? height.floors : 1;
}

function pileColumn(unit: Unit): number {
  return unit.x + Math.floor(UNIT_CATALOG[unit.type].width * GARBAGE_PILE_POSITION);
}

function addSpan(map: Map<number, number[]>, level: number, from: number, to: number): void {
  const spans = map.get(level);
  if (spans) spans.push(from, to);
  else map.set(level, [from, to]);
}

function inSpans(spans: readonly number[] | undefined, column: number): boolean {
  if (!spans) return false;
  for (let at = 0; at < spans.length; at += 2) {
    if (column >= (spans[at] as number) && column <= (spans[at + 1] as number)) return true;
  }
  return false;
}

function bagsOf(state: TowerState): Bag[] {
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

export function buildAmbient(state: TowerState): Ambient {
  const noise = new Map<number, number[]>();
  const inside = new Map<number, number[]>();
  for (const unit of Object.values(state.units)) {
    const first = unit.x;
    const last = unit.x + UNIT_CATALOG[unit.type].width - 1;
    const noisy = AMBIENT_NOISE_SOURCES.includes(unit.type);
    for (let level = unit.level; level < unit.level + floorsOf(unit); level++) {
      addSpan(inside, level, first, last);
      if (noisy) addSpan(noise, level, first - AMBIENT_NOISE_RADIUS, last + AMBIENT_NOISE_RADIUS);
    }
  }
  const dirt = new Map<number, number[]>();
  for (const bag of bagsOf(state)) {
    addSpan(dirt, bag.level, bag.column - AMBIENT_DIRT_RADIUS, bag.column + AMBIENT_DIRT_RADIUS);
  }
  const perMinute = (level: number, column: number): number =>
    (inSpans(noise.get(level), column) ? AMBIENT_NOISE_PER_MINUTE : 0) +
    (inSpans(dirt.get(level), column) ? AMBIENT_DIRT_PER_MINUTE : 0);
  return {
    insideUnit: (level, column) => inSpans(inside.get(level), column),
    minuteDelta(level, column, minute) {
      const delta = perMinute(level, column);
      if (delta > 0) return delta;
      return minute % AMBIENT_CALM_EVERY_MINUTES === 0 ? -AMBIENT_CALM_RELIEF : 0;
    },
    stayDelta(level, column, steps) {
      const minutes = Math.floor(Math.min(Math.max(steps, 0), AMBIENT_STAY_MAX_STEPS) / STEPS_PER_MINUTE);
      const delta = perMinute(level, column);
      if (delta > 0) return minutes * delta;
      return -Math.floor(minutes / AMBIENT_CALM_EVERY_MINUTES) * AMBIENT_CALM_RELIEF;
    },
  };
}

const memo = new WeakMap<TowerState, { step: number; ambient: Ambient }>();

/** The ambient of this tower at its current step, built once per step however many people ask. */
export function ambientOf(state: TowerState): Ambient {
  const kept = memo.get(state);
  if (kept && kept.step === state.step) return kept.ambient;
  const ambient = buildAmbient(state);
  memo.set(state, { step: state.step, ambient });
  return ambient;
}
