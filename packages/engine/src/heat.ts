import {
  AMBIENT_STAY_MAX_STEPS,
  BAG_DIRT_MINUTE,
  CALM_BELOW,
  CALM_ONE_IN,
  CAR_DIRT_BAG,
  CAR_DIRT_RIDER,
  CAR_NOISE_RIDER,
  CONSTRUCTION_NOISE,
  CONSTRUCTION_NOISE_ADJACENT,
  DIRT_STRESS_PER_LEVEL,
  GARBAGE_PILE_POSITION,
  HEAT_BAG_DIRT_CELLS,
  HEAT_NOISE_CELLS,
  HEAT_NOISE_DECAY_MINUTE,
  indexToLevel,
  LAST_COLUMN,
  levelToIndex,
  NOISE_STRESS_PER_LEVEL,
  UNIT_CATALOG,
  UNIT_NOISE,
  type HeatMaps,
  type PersonPool,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { isUnitInUse } from './unit-use';
import { isCarryingBag } from './venue-staff';

const COLUMNS = LAST_COLUMN + 1;
const STEPS_PER_MINUTE = 6;
/** Values below this are cleared to 0, so rows that went quiet can be dropped. */
const EMPTY = 0.001;

export function emptyHeat(): HeatMaps {
  return { noise: {}, dirt: {}, cars: {} };
}

/** The heat maps of the tower, made on first use. */
export function heatOf(state: TowerState): HeatMaps {
  state.heat ??= emptyHeat();
  return state.heat;
}

type Rows = Record<string, number[]>;

/** A flag per cell, by level, for the cells that have floor or lobby; heat only lives on these. */
type Built = Map<number, Uint8Array>;

const builtMemo = new WeakMap<TowerState['grid'], { minute: number; built: Built }>();

/** The built cells of the tower, worked out once per grid and game minute. */
function builtOf(state: TowerState): Built {
  const minute = Math.floor(state.step / STEPS_PER_MINUTE);
  const kept = builtMemo.get(state.grid);
  if (kept && kept.minute === minute) return kept.built;
  const built: Built = new Map();
  for (const [level, row] of Object.entries(state.grid.levels)) {
    if (!row || row.structure.length === 0) continue;
    const flags = new Uint8Array(COLUMNS);
    for (const span of row.structure) flags.fill(1, Math.max(0, span.x0), span.x1 + 1);
    built.set(Number(level), flags);
  }
  builtMemo.set(state.grid, { minute, built });
  return built;
}

function isBuilt(built: Built, level: number, column: number): boolean {
  return built.get(level)?.[column] === 1;
}

function rowOf(rows: Rows, level: number): number[] {
  let row = rows[level];
  if (!row) {
    row = new Array<number>(COLUMNS).fill(0);
    rows[level] = row;
  }
  return row;
}

export function addToCell(
  rows: Rows,
  level: number,
  column: number,
  amount: number,
  built?: Built,
): void {
  if (column < 0 || column > LAST_COLUMN) return;
  if (built && !isBuilt(built, level, column)) return;
  const row = rowOf(rows, level);
  row[column] = (row[column] as number) + amount;
}

/**
 * Adds `amount` on every column from `from` to `to` and, on each side, `fade` more columns whose
 * share falls in a straight line from the edge: distance d gets `amount * (1 - d / (fade + 1))`.
 */
export function addWithFade(
  rows: Rows,
  level: number,
  from: number,
  to: number,
  amount: number,
  fade: number,
  built?: Built,
): void {
  const add = (column: number, value: number): void => {
    if (column < 0 || column > LAST_COLUMN) return;
    if (built && !isBuilt(built, level, column)) return;
    const row = rowOf(rows, level);
    row[column] = (row[column] as number) + value;
  };
  for (let column = from; column <= to; column++) add(column, amount);
  for (let d = 1; d <= fade; d++) {
    const share = amount * (1 - d / (fade + 1));
    add(from - d, share);
    add(to + d, share);
  }
}

export function valueAt(rows: Rows, level: number, column: number): number {
  return rows[level]?.[column] ?? 0;
}

/** Fades noise by `factor` (1 leaves dirt as it is) and clears cells that are no longer built. */
function decayRows(rows: Rows, factor: number, built: Built): void {
  for (const key of Object.keys(rows)) {
    const row = rows[key] as number[];
    const level = Number(key);
    let alive = false;
    for (let column = 0; column < row.length; column++) {
      let value = (row[column] as number) * factor;
      if (value < EMPTY || !isBuilt(built, level, column)) value = 0;
      row[column] = value;
      if (value) alive = true;
    }
    if (!alive) delete rows[key];
  }
}

function floorsOf(unit: Unit): number {
  const { height } = UNIT_CATALOG[unit.type];
  return height.kind === 'fixed' ? height.floors : 1;
}

function pileColumn(unit: Unit): number {
  return unit.x + Math.floor(UNIT_CATALOG[unit.type].width * GARBAGE_PILE_POSITION);
}

/** What the units in use and the bags put into the maps in one game minute. */
function emitMinute(state: TowerState, built: Built): void {
  const heat = heatOf(state);
  for (const unit of Object.values(state.units)) {
    const noise = UNIT_NOISE[unit.type];
    if (noise !== undefined && isUnitInUse(state, unit)) {
      const last = unit.x + UNIT_CATALOG[unit.type].width - 1;
      for (let level = unit.level; level < unit.level + floorsOf(unit); level++) {
        addWithFade(heat.noise, level, unit.x, last, noise, HEAT_NOISE_CELLS, built);
      }
    }
    if (unit.venue && unit.venue.garbage > 0) {
      const column = pileColumn(unit);
      addWithFade(
        heat.dirt,
        unit.level,
        column,
        column,
        BAG_DIRT_MINUTE,
        HEAT_BAG_DIRT_CELLS,
        built,
      );
    }
  }
  for (const site of Object.values(state.sites)) {
    const { height, width } = UNIT_CATALOG[site.type];
    const floors = height.kind === 'fixed' ? height.floors : 1;
    const bottom = levelToIndex(site.level);
    const last = site.x + width - 1;
    for (let index = bottom - 1; index <= bottom + floors; index++) {
      if (index < 0) continue;
      const level = indexToLevel(index);
      if (level > 104) continue;
      const inside = index >= bottom && index < bottom + floors;
      const amount = inside ? CONSTRUCTION_NOISE : CONSTRUCTION_NOISE_ADJACENT;
      addWithFade(heat.noise, level, site.x, last, amount, HEAT_NOISE_CELLS, built);
    }
  }
  const pool: PersonPool = state.people;
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isCarryingBag(pool, slot)) continue;
    const column = pool.column[slot] as number;
    addWithFade(
      heat.dirt,
      pool.level[slot] as number,
      column,
      column,
      BAG_DIRT_MINUTE,
      HEAT_BAG_DIRT_CELLS,
      built,
    );
  }
}

function decayAll(state: TowerState, built: Built): void {
  const heat = heatOf(state);
  decayRows(heat.noise, HEAT_NOISE_DECAY_MINUTE, built);
  decayRows(heat.dirt, 1, built);
  for (const pair of Object.values(heat.cars)) {
    for (let at = 0; at < pair.length; at += 2) {
      pair[at] = (pair[at] as number) * HEAT_NOISE_DECAY_MINUTE;
    }
  }
}

/** Once a game minute units and bags speak, and then the maps fade a little. */
export function heatSystem(context: { state: TowerState }): void {
  const { state } = context;
  if (state.step % STEPS_PER_MINUTE !== 0) return;
  const built = builtOf(state);
  emitMinute(state, built);
  decayAll(state, built);
}

/** A person crossed a cell, or stood in it for a minute. */
export function addPersonNoise(state: TowerState, level: number, column: number, amount: number) {
  addToCell(heatOf(state).noise, level, column, amount, builtOf(state));
}

export function addPersonDirt(state: TowerState, level: number, column: number, amount: number) {
  addToCell(heatOf(state).dirt, level, column, amount, builtOf(state));
}

/** A rider boarded the car; a rider with a bag dirties it more. */
export function addCarRider(state: TowerState, shaftId: string, car: number, bag: boolean): void {
  const pair = (heatOf(state).cars[shaftId] ??= []);
  while (pair.length < (car + 1) * 2) pair.push(0);
  pair[car * 2] = (pair[car * 2] as number) + CAR_NOISE_RIDER;
  pair[car * 2 + 1] = (pair[car * 2 + 1] as number) + CAR_DIRT_RIDER + (bag ? CAR_DIRT_BAG : 0);
}

export function carLevels(state: TowerState, shaftId: string, car: number) {
  const pair = state.heat?.cars[shaftId];
  return { noise: pair?.[car * 2] ?? 0, dirt: pair?.[car * 2 + 1] ?? 0 };
}

/** Stress steps per game minute for a level of noise and of dirt. */
export function stressPerMinute(noise: number, dirt: number): number {
  return noise * NOISE_STRESS_PER_LEVEL + dirt * DIRT_STRESS_PER_LEVEL;
}

/** A number in [0, 1) that is the same for the same person and minute, whatever order things run in. */
export function dither(id: number, minute: number): number {
  let h = Math.imul(id + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(minute + 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * The whole steps felt in `minutes` of a cell that gives `perMinute` stress a minute. The part
 * below one step is rounded up or down by the dither, so small amounts still add up over many
 * minutes. A calm cell gives back 1 step on about one minute in CALM_ONE_IN.
 */
export function stepsFelt(perMinute: number, minutes: number, id: number, minute: number): number {
  if (minutes <= 0) return 0;
  if (perMinute < CALM_BELOW) {
    return -Math.floor((minutes + dither(id, minute) * CALM_ONE_IN) / CALM_ONE_IN);
  }
  const exact = perMinute * minutes;
  const whole = Math.floor(exact);
  return whole + (dither(id, minute) < exact - whole ? 1 : 0);
}

export const STAY_MAX_MINUTES = AMBIENT_STAY_MAX_STEPS / STEPS_PER_MINUTE;
