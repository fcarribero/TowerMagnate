import type { Command, CommandResult, QueuedCommand, TowerState } from '@tower-magnate/shared';
import { STEPS_PER_DAY } from '../clock';
import { hashState } from '../hash';
import { deserializeState, serializeState } from '../serialization';
import { step } from '../step';
import { buildTower, plainTowerPlan, type PlannedShaft } from './tower-builder';

export const LONG_RUN_SEED = 35;
export const LONG_RUN_DAYS = 35;
export const LONG_RUN_SNAPSHOT_DAY = 14;

const TOP_LEVEL = 100;
const TOWER_X0 = 0;
const TOWER_X1 = 199;
const SHAFT_COLUMNS = [20, 60, 100, 140] as const;
const SHAFT_TOP = 30;
const SHAFT_CARS = 2;
/** Office columns between the shafts, 20 per floor. */
const OFFICE_COLUMNS = [
  0, 9, 24, 33, 42, 51, 64, 73, 82, 91, 104, 113, 122, 131, 144, 153, 162, 171, 180, 189,
] as const;
/** Condo columns between the shafts, 9 per floor. */
const CONDO_COLUMNS = [0, 24, 40, 64, 80, 104, 120, 144, 160] as const;

/** 100 floors with four standard shafts serving levels 1 to 30; everything else is built by the script. */
export function longRunTower(seed: number = LONG_RUN_SEED): TowerState {
  const shafts: PlannedShaft[] = SHAFT_COLUMNS.map((x) => ({
    type: 'standard',
    x,
    bottom: 1,
    top: SHAFT_TOP,
    cars: SHAFT_CARS,
  }));
  return buildTower({ ...plainTowerPlan(TOP_LEVEL, TOWER_X0, TOWER_X1), seed, shafts }).state;
}

export interface LongRunCommand {
  /** Whole days after the start; the command goes in at 00:00. */
  day: number;
  command: Command;
}

function offices(day: number, level: number, columns: readonly number[]): LongRunCommand[] {
  return columns.map((x) => ({
    day,
    command: { type: 'buildUnit', unitType: 'office', x, level },
  }));
}

function condos(day: number, level: number, columns: readonly number[]): LongRunCommand[] {
  return columns.map((x) => ({ day, command: { type: 'buildUnit', unitType: 'condo', x, level } }));
}

/** The tower grows over the 5 weeks, on both sides of the snapshot day. */
export function longRunScript(): LongRunCommand[] {
  return [
    ...offices(0, 2, OFFICE_COLUMNS),
    ...offices(0, 3, OFFICE_COLUMNS.slice(0, 10)),
    ...offices(7, 3, OFFICE_COLUMNS.slice(10)),
    ...condos(10, 12, CONDO_COLUMNS.slice(0, 3)),
    { day: 17, command: { type: 'buildTransport', transportType: 'stairs', x: 64, level: 12 } },
    ...condos(17, 13, CONDO_COLUMNS.slice(0, 3)),
    ...offices(24, 4, OFFICE_COLUMNS.slice(0, 6)),
    ...offices(31, 5, OFFICE_COLUMNS.slice(0, 4)),
  ];
}

export interface LongRun {
  /** Hash of the state at the end of each day played, in day order. */
  dailyHashes: string[];
  results: CommandResult[];
  state: TowerState;
  /** The state saved at the end of `LONG_RUN_SNAPSHOT_DAY`, when the run got that far. */
  snapshot: string | null;
}

/** Plays days `fromDay` up to `toDay` (exclusive) of the script on `tower`, hashing each day. */
export function playLongRun(
  tower: TowerState,
  fromDay: number,
  toDay: number = LONG_RUN_DAYS,
  script: readonly LongRunCommand[] = longRunScript(),
): LongRun {
  const dailyHashes: string[] = [];
  const results: CommandResult[] = [];
  let snapshot: string | null = null;
  let state = tower;
  for (let day = fromDay; day < toDay; day++) {
    const queued: QueuedCommand[] = script
      .filter((entry) => entry.day === day)
      .map((entry, index) => ({ id: `d${day}.${index}`, command: entry.command }));
    const outcome = step(state, queued, STEPS_PER_DAY);
    state = outcome.state;
    results.push(...outcome.results);
    dailyHashes.push(hashState(state));
    if (day + 1 === LONG_RUN_SNAPSHOT_DAY) snapshot = serializeState(state);
  }
  return { dailyHashes, results, state, snapshot };
}

/** Loads a saved snapshot and plays the rest of the 5 weeks from it. */
export function resumeLongRun(snapshot: string): LongRun {
  return playLongRun(deserializeState(snapshot), LONG_RUN_SNAPSHOT_DAY);
}
