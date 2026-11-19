import {
  AMBIENT_STAY_MAX_STEPS,
  BAG_DIRT_MINUTE,
  CALM_BELOW,
  CALM_ONE_IN,
  CAR_DIRT_DECAY_MINUTE,
  CAR_DIRT_RIDER,
  CAR_NOISE_RIDER,
  CAR_NOISE_WORKER,
  CONSTRUCTION_NOISE,
  CONSTRUCTION_NOISE_ADJACENT,
  DIRT_STRESS_PER_LEVEL,
  DIRT_TOLERANCE,
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
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { absorbNoise } from './comfort-units';
import { crewNoiseFactor, crewOf, decodeBuilderTask, isBuilder } from './construction';
import { homesInUse, isUnitInUse } from './unit-use';
import { unitNumber } from './units';

// Constants read in hot paths are copied once: an imported binding is looked up on every use.
const COLUMNS = LAST_COLUMN + 1;
const LAST = LAST_COLUMN;
const NOISE_CELLS = HEAT_NOISE_CELLS;
const NOISE_DECAY = HEAT_NOISE_DECAY_MINUTE;
const CAR_DIRT_DECAY = CAR_DIRT_DECAY_MINUTE;
const NOISE_STRESS = NOISE_STRESS_PER_LEVEL;
const DIRT_STRESS = DIRT_STRESS_PER_LEVEL;
const CALM = CALM_BELOW;
const CALM_EVERY = CALM_ONE_IN;
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
const BUILT_REFRESH_MINUTES = 10;

/**
 * The built cells of the tower. They are worked out again when the grid record is a new one and
 * every few game minutes, which catches a floor placed in a record that was already copied.
 */
function builtOf(state: TowerState): Built {
  const minute = Math.floor(state.step / STEPS_PER_MINUTE);
  const kept = builtMemo.get(state.grid);
  if (kept && minute - kept.minute < BUILT_REFRESH_MINUTES && minute >= kept.minute)
    return kept.built;
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
  if (column < 0 || column > LAST) return;
  if (built && !isBuilt(built, level, column)) return;
  const row = rowOf(rows, level);
  row[column] = (row[column] as number) + amount;
}

/**
 * Adds `amount` on every column from `from` to `to` and, on each side, `fade` more columns whose
 * share falls in a straight line from the edge: distance d gets `amount * (1 - d / (fade + 1))`.
 * With `built`, a side stops at the first cell with no floor: heat never crosses a gap.
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
  /** Adds to a cell; false when the cell is off the grid or has no floor. */
  const add = (column: number, value: number): boolean => {
    if (column < 0 || column > LAST) return false;
    if (built && !isBuilt(built, level, column)) return false;
    const row = rowOf(rows, level);
    row[column] = (row[column] as number) + value;
    return true;
  };
  for (let column = from; column <= to; column++) add(column, amount);
  let left = true;
  let right = true;
  for (let d = 1; d <= fade && (left || right); d++) {
    const share = amount * (1 - d / (fade + 1));
    if (left) left = add(from - d, share);
    if (right) right = add(to + d, share);
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

/**
 * The sites that have a builder working on them this minute, with the share of the construction
 * noise they make: 1, less for a crew whose obrador has quiet equipment.
 */
function sitesBeingBuilt(state: TowerState): Map<number, number> {
  const working = new Map<number, number>();
  if (Object.keys(state.sites).length === 0) return working;
  const pool = state.people;
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (!isBuilder(pool, slot)) continue;
    const task = decodeBuilderTask(pool.trip[slot] as number);
    if (task?.phase === 'working' && !working.has(task.site)) {
      working.set(task.site, crewNoiseFactor(state, crewOf(pool, slot)));
    }
  }
  return working;
}

/**
 * What the units in use and the garbage piles put into the maps in one game minute. Bags being
 * carried add no dirt.
 */
function emitMinute(state: TowerState, built: Built): void {
  const heat = heatOf(state);
  const homes = homesInUse(state);
  for (const unit of Object.values(state.units)) {
    const noise = UNIT_NOISE[unit.type];
    if (noise !== undefined && isUnitInUse(state, unit, homes)) {
      const last = unit.x + UNIT_CATALOG[unit.type].width - 1;
      for (let level = unit.level; level < unit.level + floorsOf(unit); level++) {
        addWithFade(heat.noise, level, unit.x, last, noise, NOISE_CELLS, built);
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
  const working = sitesBeingBuilt(state);
  for (const site of Object.values(state.sites)) {
    const share = working.get(unitNumber(site.id));
    if (share === undefined || share <= 0) continue;
    const { height, width } = UNIT_CATALOG[site.type];
    const floors = height.kind === 'fixed' ? height.floors : 1;
    const bottom = levelToIndex(site.level);
    const last = site.x + width - 1;
    for (let index = bottom - 1; index <= bottom + floors; index++) {
      if (index < 0) continue;
      const level = indexToLevel(index);
      if (level > 104) continue;
      const inside = index >= bottom && index < bottom + floors;
      const amount = (inside ? CONSTRUCTION_NOISE : CONSTRUCTION_NOISE_ADJACENT) * share;
      addWithFade(heat.noise, level, site.x, last, amount, NOISE_CELLS, built);
    }
  }
}

function decayAll(state: TowerState, built: Built): void {
  const heat = heatOf(state);
  decayRows(heat.noise, NOISE_DECAY, built);
  decayRows(heat.dirt, 1, built);
  for (const pair of Object.values(heat.cars)) {
    for (let at = 0; at < pair.length; at += 2) {
      pair[at] = (pair[at] as number) * NOISE_DECAY;
      pair[at + 1] = (pair[at + 1] as number) * CAR_DIRT_DECAY;
    }
  }
}

/** Once a game minute units and bags speak, then the maps fade a little and libraries take some noise. */
export function heatSystem(context: { state: TowerState }): void {
  const { state } = context;
  if (state.step % STEPS_PER_MINUTE !== 0) return;
  const built = builtOf(state);
  emitMinute(state, built);
  decayAll(state, built);
  absorbNoise(state, heatOf(state).noise);
}

/** A person walked into a cell: a little noise and a little dirt, with one lookup of the cell. */
export function addPersonTrail(
  state: TowerState,
  level: number,
  column: number,
  noise: number,
  dirt: number,
): void {
  if (column < 0 || column > LAST || !isBuilt(builtOf(state), level, column)) return;
  const heat = heatOf(state);
  const noiseRow = rowOf(heat.noise, level);
  noiseRow[column] = (noiseRow[column] as number) + noise;
  const dirtRow = rowOf(heat.dirt, level);
  dirtRow[column] = (dirtRow[column] as number) + dirt;
}

/** A person crossed a cell, or stood in it for a minute. */
export function addPersonNoise(state: TowerState, level: number, column: number, amount: number) {
  addToCell(heatOf(state).noise, level, column, amount, builtOf(state));
}

export function addPersonDirt(state: TowerState, level: number, column: number, amount: number) {
  addToCell(heatOf(state).dirt, level, column, amount, builtOf(state));
}

/**
 * A rider boarded the car. `worker` is true for a worker in a standard or express car, who adds
 * more noise than a plain rider. A bag being carried adds no dirt.
 */
export function addCarRider(state: TowerState, shaftId: string, car: number, worker = false): void {
  const pair = (heatOf(state).cars[shaftId] ??= []);
  while (pair.length < (car + 1) * 2) pair.push(0);
  const noise = CAR_NOISE_RIDER + (worker ? CAR_NOISE_WORKER : 0);
  pair[car * 2] = (pair[car * 2] as number) + noise;
  pair[car * 2 + 1] = (pair[car * 2 + 1] as number) + CAR_DIRT_RIDER;
}

export function carLevels(state: TowerState, shaftId: string, car: number) {
  const pair = state.heat?.cars[shaftId];
  return { noise: pair?.[car * 2] ?? 0, dirt: pair?.[car * 2 + 1] ?? 0 };
}

/** Stress steps per game minute for a level of noise and of dirt; dirt up to DIRT_TOLERANCE gives none. */
export function stressPerMinute(noise: number, dirt: number): number {
  return noise * NOISE_STRESS + Math.max(0, dirt - DIRT_TOLERANCE) * DIRT_STRESS;
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
 * minutes. A calm cell gives back 1 step on about one minute in CALM_EVERY.
 */
export function stepsFelt(perMinute: number, minutes: number, id: number, minute: number): number {
  if (minutes <= 0) return 0;
  if (perMinute < CALM) {
    return -Math.floor((minutes + dither(id, minute) * CALM_EVERY) / CALM_EVERY);
  }
  const exact = perMinute * minutes;
  const whole = Math.floor(exact);
  return whole + (dither(id, minute) < exact - whole ? 1 : 0);
}

export const STAY_MAX_MINUTES = AMBIENT_STAY_MAX_STEPS / STEPS_PER_MINUTE;
