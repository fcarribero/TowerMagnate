import type { BombThreat, Fire, Level, TowerState } from '@tower-magnate/shared';
import { STEPS_PER_HOUR } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { towerCommandHandlers } from '../commands';
import { eventsPhase, openBombThreat, openFire, pickFireTargets, startBombSearch } from '../events';
import { addPeopleForUnit, peopleCount } from '../people';
import { createEngine, towerSystems, type Engine, type StepContext } from '../step';
import { medianOf } from './fastest-run';
import { addFlight } from './hundred-floor-tower';
import { buildTower, plainTowerPlan, type PlannedShaft, type PlannedUnit } from './tower-builder';

const FLOORS = 40;
const TOWER_X1 = 159;
const SPLIT_LEVEL = 30;
const FIRST_OFFICE_LEVEL = 4;
const SECURITY_X = 60;
const OFFICE_X = 80;
const BOMB_LEVEL = FLOORS;
const BURNING_LEVELS: readonly Level[] = [10, 20, 30];
const IGNITION_COLUMN = 120;
const RANSOM = 200_000;

/** Weekday 10:00, the first day with commuters at work. */
const TEN_AM = STEPS_PER_DAY + 10 * STEPS_PER_HOUR;
const BOMB_SEARCH_STEPS = 3 * STEPS_PER_HOUR;
const FIRE_STEPS = STEPS_PER_HOUR;

export const MAX_EVENT_STEP_MS = 0.2;
const RUNS = 3;

/**
 * 40 floors of 160 columns: `securityOffices` security offices from level 2 up and an office on
 * each of levels 4 to 40, 252 people with 5 security offices. Two elevator banks meet at level 30.
 */
export function securityTower(securityOffices: number): TowerState {
  const shafts: PlannedShaft[] = [
    { type: 'standard', x: 4, bottom: 1, top: SPLIT_LEVEL },
    { type: 'standard', x: 34, bottom: SPLIT_LEVEL + 1, top: FLOORS },
  ];
  const units: PlannedUnit[] = [];
  for (let index = 0; index < securityOffices; index++) {
    units.push({ type: 'security', level: 2 + index, x: SECURITY_X });
  }
  for (let level = FIRST_OFFICE_LEVEL; level <= FLOORS; level++) {
    units.push({ type: 'office', level, x: OFFICE_X });
  }
  const { state, unitIds } = buildTower({ ...plainTowerPlan(FLOORS, 0, TOWER_X1), units, shafts });
  addFlight(state, 'stairs', 40, SPLIT_LEVEL);
  for (const id of unitIds) addPeopleForUnit(state, id);
  return state;
}

/** The tower engine with the events phase timed; only steps while `recording` is true are kept. */
function engineTimingEvents(samples: number[], recording: { on: boolean }): Engine {
  const systems = towerSystems.map((system) => {
    if (system !== eventsPhase) return system;
    return (context: StepContext) => {
      const started = performance.now();
      system(context);
      if (recording.on) samples.push(performance.now() - started);
    };
  });
  return createEngine({ commandHandlers: towerCommandHandlers, systems });
}

function averageOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export interface SecurityRun {
  people: number;
  bombAverageMs: number;
  fireAverageMs: number;
  /** Levels searched when the search ends or at 13:00, whichever comes first. */
  levelsSearched: number;
  /** Step the bomb level was found, or null when it was not found by 13:00. */
  bombFoundStep: number | null;
}

interface Timed {
  engine: Engine;
  samples: number[];
  recording: { on: boolean };
}

function timedEngine(): Timed {
  const samples: number[] = [];
  const recording = { on: false };
  return { engine: engineTimingEvents(samples, recording), samples, recording };
}

function timeWindow(timed: Timed, state: TowerState, steps: number): TowerState {
  timed.samples.length = 0;
  timed.recording.on = true;
  const after = timed.engine.step(state, [], steps).state;
  timed.recording.on = false;
  return after;
}

function bombSearchRun(timed: Timed, atTen: TowerState) {
  const context: StepContext = { state: atTen, events: [] };
  const bomb = openBombThreat(context, RANSOM) as BombThreat;
  startBombSearch(context, bomb, BOMB_LEVEL);
  let searched = 0;
  let foundStep: number | null = null;
  let current = atTen;
  timed.samples.length = 0;
  for (let at = 0; at < BOMB_SEARCH_STEPS; at++) {
    timed.recording.on = true;
    current = timed.engine.step(current, [], 1).state;
    timed.recording.on = false;
    const live = current.activeEvents.find((event) => event.kind === 'bomb');
    if (!live) {
      foundStep = current.step;
      break;
    }
    const levels = Object.values(live.search?.levels ?? {});
    searched = levels.filter((status) => status === 'searched').length;
  }
  return { averageMs: averageOf(timed.samples), searched, foundStep };
}

function fireRun(timed: Timed, atTen: TowerState): number {
  const context: StepContext = { state: atTen, events: [] };
  const fire = openFire(context, BURNING_LEVELS[0] as Level) as Fire;
  for (const level of BURNING_LEVELS) {
    const front = { x: IGNITION_COLUMN, progress: 0, out: false };
    fire.levels[level] = {
      ignitionStep: atTen.step,
      ignitionColumn: IGNITION_COLUMN,
      left: { ...front },
      right: { ...front },
    };
  }
  pickFireTargets(context, fire);
  timeWindow(timed, atTen, FIRE_STEPS);
  return averageOf(timed.samples);
}

/** One run: a bomb search from 10:00 to 13:00, then a fire on three levels for an hour from 10:00. */
export function runSecurityEvents(securityOffices: number): SecurityRun {
  const timed = timedEngine();
  const start = securityTower(securityOffices);
  const people = peopleCount(start.people);
  const forBomb = timed.engine.step(start, [], TEN_AM).state;
  const bomb = bombSearchRun(timed, forBomb);
  const forFire = timed.engine.step(securityTower(securityOffices), [], TEN_AM).state;
  const fireAverageMs = fireRun(timed, forFire);
  return {
    people,
    bombAverageMs: bomb.averageMs,
    fireAverageMs,
    levelsSearched: bomb.searched,
    bombFoundStep: bomb.foundStep,
  };
}

export function timeSecurityRuns(securityOffices: number): SecurityRun[] {
  return Array.from({ length: RUNS }, () => runSecurityEvents(securityOffices));
}

export function medianEventCosts(runs: readonly SecurityRun[]) {
  return {
    bombMs: medianOf(runs.map((run) => run.bombAverageMs)),
    fireMs: medianOf(runs.map((run) => run.fireAverageMs)),
  };
}
