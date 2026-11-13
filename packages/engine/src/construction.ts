import {
  BUILDER_CREW_SIZE,
  BUILDER_LAST_START_MINUTES,
  BUILDER_WORK_END_MINUTE,
  BUILDER_WORK_START_MINUTE,
  PERSON_KINDS,
  UNIT_CATALOG,
  type ConstructionSite,
  type PersonPool,
  type TowerState,
  type UnitId,
  type UnitType,
} from '@tower-magnate/shared';
import { isWeekendDay, STEPS_PER_MINUTE, weekdayOfDay } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { entrancePlace } from './office-routine';
import { addPeopleForUnit, addPerson, NO_TRIP, removePerson } from './people';
import { chance, nextInt } from './rng';
import type { ScheduledHook } from './scheduler';
import type { SimulationSystem, StepContext } from './step';
import { cancelTrek, isOnTrek, startTrek, trekPhaseAt, type TrekPlace } from './trek';
import { newUnit, unitNumber } from './units';

const BUILDER_KIND = PERSON_KINDS.indexOf('builder');
const WORK_START_STEP = BUILDER_WORK_START_MINUTE * STEPS_PER_MINUTE;
const WORK_END_STEP = BUILDER_WORK_END_MINUTE * STEPS_PER_MINUTE;
const LAST_START_STEP = WORK_END_STEP - BUILDER_LAST_START_MINUTES * STEPS_PER_MINUTE;

/**
 * Construction points a unit needs. An internal number: players never see it. Each builder adds one
 * point a game minute, so a crew of five finishes a site in the points divided by five minutes.
 */
const POINTS_PER_CELL = 60;

export function constructionPointsFor(type: UnitType): number {
  const definition = UNIT_CATALOG[type];
  const floors = definition.height.kind === 'fixed' ? definition.height.floors : 1;
  return definition.width * floors * POINTS_PER_CELL;
}

/** Lobbies and other structure go up at once; every other unit is built by the crew. */
export function isBuiltByCrew(type: UnitType): boolean {
  return UNIT_CATALOG[type].category !== 'structure';
}

/** The sites in the order the crew takes them: the first one placed first. */
export function sitesInOrder(state: TowerState): ConstructionSite[] {
  return Object.values(state.sites).sort(
    (a, b) => a.placedAtStep - b.placedAtStep || unitNumber(a.id) - unitNumber(b.id),
  );
}

/** The door of a site: the column in the middle of its footprint. */
export function siteDoor(site: ConstructionSite): TrekPlace {
  return { level: site.level, column: site.x + Math.floor(UNIT_CATALOG[site.type].width / 2) };
}

/** How far a site is from done, from 0 to 1. */
export function siteProgress(site: ConstructionSite): number {
  return Math.min(site.points / constructionPointsFor(site.type), 1);
}

/** Turns a finished site into its unit, vacant and with the same id. */
export function completeSite(state: TowerState, id: UnitId): void {
  const site = state.sites[id];
  if (!site) return;
  Reflect.deleteProperty(state.sites, id);
  state.units[id] = {
    ...newUnit(id, site.type, site.x, site.level),
    paid: site.paid,
    placedAtStep: state.step,
  };
  if (site.type === 'security') addPeopleForUnit(state, id);
}

/** What a builder is doing; kept in the person's `trip` number. */
export type BuilderPhase = 'choosing' | 'toSite' | 'working' | 'leaving';

const PHASES: readonly BuilderPhase[] = ['choosing', 'toSite', 'working', 'leaving'];

export interface BuilderTask {
  phase: BuilderPhase;
  /** Unit number of the site the builder is heading to or working on, or 0. */
  site: number;
}

export function encodeBuilderTask(task: BuilderTask): number {
  return task.site * PHASES.length + PHASES.indexOf(task.phase) + 1;
}

export function decodeBuilderTask(trip: number): BuilderTask | null {
  if (trip === NO_TRIP) return null;
  const phase = PHASES[(trip - 1) % PHASES.length];
  if (!phase) return null;
  return { phase, site: Math.floor((trip - 1) / PHASES.length) };
}

export function isBuilder(pool: PersonPool, slot: number): boolean {
  return pool.kind[slot] === BUILDER_KIND;
}

function stepOfDay(step: number): number {
  return step % STEPS_PER_DAY;
}

function isWorkDay(step: number): boolean {
  return !isWeekendDay(weekdayOfDay(Math.floor(step / STEPS_PER_DAY)));
}

/** True on a work day between the start and the end of the work hours. */
export function isWorkTime(step: number): boolean {
  const time = stepOfDay(step);
  return isWorkDay(step) && time >= WORK_START_STEP && time < WORK_END_STEP;
}

function hasBuilders(pool: PersonPool): boolean {
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (isBuilder(pool, slot)) return true;
  }
  return false;
}

interface Builder {
  context: StepContext;
  slot: number;
}

function placeOf(builder: Builder): TrekPlace {
  const pool = builder.context.state.people;
  return { level: pool.level[builder.slot] as number, column: pool.column[builder.slot] as number };
}

function isAt(builder: Builder, place: TrekPlace): boolean {
  const here = placeOf(builder);
  return here.level === place.level && here.column === place.column;
}

function save(builder: Builder, task: BuilderTask): void {
  builder.context.state.people.trip[builder.slot] = encodeBuilderTask(task);
}

function stopTrek(builder: Builder): void {
  if (isOnTrek(builder.context.state.people, builder.slot)) {
    cancelTrek(builder.context, builder.slot);
  }
}

/** Heads for the entrance and leaves the tower there; with no entrance or route, leaves at once. */
function leave(builder: Builder): void {
  const { state } = builder.context;
  const pool = state.people;
  stopTrek(builder);
  const onRight = chance(state.rng, 0.5);
  for (const side of [onRight, !onRight]) {
    const exit = entrancePlace(state, side);
    if (!exit) break;
    save(builder, { phase: 'leaving', site: 0 });
    if (isAt(builder, exit)) {
      removePerson(state, pool.id[builder.slot] as number);
      return;
    }
    if (startTrek(builder.context, builder.slot, exit)) return;
  }
  removePerson(state, pool.id[builder.slot] as number);
}

/** Takes the first site in the queue the builder can reach, or goes home when there is none. */
function choose(builder: Builder): void {
  const { state } = builder.context;
  if (!isWorkTime(state.step)) {
    leave(builder);
    return;
  }
  stopTrek(builder);
  for (const site of sitesInOrder(state)) {
    const door = siteDoor(site);
    const number = unitNumber(site.id);
    if (isAt(builder, door)) {
      save(builder, { phase: 'working', site: number });
      return;
    }
    if (startTrek(builder.context, builder.slot, door)) {
      save(builder, { phase: 'toSite', site: number });
      return;
    }
  }
  leave(builder);
}

function siteOf(builder: Builder, task: BuilderTask): ConstructionSite | undefined {
  return builder.context.state.sites[`u${task.site}`];
}

function advanceBuilder(builder: Builder): void {
  const { state } = builder.context;
  const pool = state.people;
  const task = decodeBuilderTask(pool.trip[builder.slot] ?? NO_TRIP);
  if (!task) {
    choose(builder);
    return;
  }
  if (task.phase === 'leaving') {
    if (!isOnTrek(pool, builder.slot)) {
      removePerson(state, pool.id[builder.slot] as number);
    }
    return;
  }
  if (!isWorkTime(state.step)) {
    leave(builder);
    return;
  }
  const site = siteOf(builder, task);
  switch (task.phase) {
    case 'choosing':
      choose(builder);
      return;
    case 'toSite':
      if (!site) {
        choose(builder);
      } else if (trekPhaseAt(pool, builder.slot) === 'noRoute') {
        stopTrek(builder);
        leave(builder);
      } else if (!isOnTrek(pool, builder.slot)) {
        if (isAt(builder, siteDoor(site))) {
          save(builder, { phase: 'working', site: task.site });
        } else {
          choose(builder);
        }
      }
      return;
    case 'working':
      if (!site) {
        choose(builder);
        return;
      }
      if (state.step % STEPS_PER_MINUTE !== 0) return;
      site.points += 1;
      if (site.points >= constructionPointsFor(site.type)) {
        completeSite(state, site.id);
      }
      return;
  }
}

/** Starts a crew when there is work and time for it, and moves every builder on by one step. */
export function createConstructionSystem(): SimulationSystem {
  return (context) => {
    const { state } = context;
    const pool = state.people;
    if (
      state.step % STEPS_PER_MINUTE === 0 &&
      isWorkDay(state.step) &&
      stepOfDay(state.step) >= WORK_START_STEP &&
      stepOfDay(state.step) < LAST_START_STEP &&
      Object.keys(state.sites).length > 0 &&
      !hasBuilders(pool)
    ) {
      bringCrew(context);
    }
    // Backwards, because a builder who leaves the tower is removed from the pool.
    for (let slot = pool.id.length - 1; slot >= 0; slot--) {
      if (isBuilder(pool, slot)) advanceBuilder({ context, slot });
    }
  };
}

/** The crew comes in through the main lobby entrance. */
function bringCrew(context: StepContext): void {
  const { state } = context;
  const left = entrancePlace(state, false);
  const right = entrancePlace(state, true);
  if (!left || !right) return;
  const low = Math.min(left.column, right.column);
  const high = Math.max(left.column, right.column);
  for (let index = 0; index < BUILDER_CREW_SIZE; index++) {
    addPerson(state, {
      kind: 'builder',
      homeUnit: 0,
      level: left.level,
      column: nextInt(state.rng, low, high),
    });
    const slot = state.people.id.length - 1;
    state.people.trip[slot] = encodeBuilderTask({ phase: 'choosing', site: 0 });
  }
}

/** At the end of the work day every builder walks out. */
function sendBuildersHome(context: StepContext): void {
  const pool = context.state.people;
  for (let slot = pool.id.length - 1; slot >= 0; slot--) {
    if (isBuilder(pool, slot)) leave({ context, slot });
  }
}

export const constructionEndHook: ScheduledHook = {
  name: 'construction-end',
  schedule: {
    every: 'day',
    hour: Math.floor(BUILDER_WORK_END_MINUTE / 60),
    minute: BUILDER_WORK_END_MINUTE % 60,
  },
  run: sendBuildersHome,
};
