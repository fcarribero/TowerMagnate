import {
  BUILDER_CHANGE_MINUTES,
  BUILDER_CREW_SIZE,
  BUILDER_QUIET_SHARE,
  BUILDER_TOOLS_BONUS,
  BUILDER_LAST_START_MINUTES,
  BUILDER_WORK_END_MINUTE,
  BUILDER_WORK_START_MINUTE,
  PERSON_KINDS,
  UNIT_CATALOG,
  type ConstructionSite,
  type PersonPool,
  type Unit,
  type TowerState,
  type UnitId,
  type UnitType,
} from '@tower-magnate/shared';
import { STEPS_PER_MINUTE, WEEKDAYS, weekdayOfDay } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { entrancePlace } from './office-routine';
import { streetColumn, streetPlace } from './street';
import { addPeopleForUnit, addPerson, NO_TRIP, NOTHING_DUE, removePerson } from './people';
import { addCrew } from './venue-staff';
import { chance, nextInt } from './rng';
import type { ScheduledHook } from './scheduler';
import type { SimulationSystem, StepContext } from './step';
import { cancelTrek, isOnTrek, startTrek, trekPhaseAt, type TrekPlace } from './trek';
import { computeAppraisal, startAtAppraisal } from './appraisal';
import { newUnit, unitNumber, withLook } from './units';
import { dither } from './heat';

const BUILDER_KIND = PERSON_KINDS.indexOf('builder');
const WORK_START_STEP = BUILDER_WORK_START_MINUTE * STEPS_PER_MINUTE;
const WORK_END_STEP = BUILDER_WORK_END_MINUTE * STEPS_PER_MINUTE;
const LAST_START_STEP = WORK_END_STEP - BUILDER_LAST_START_MINUTES * STEPS_PER_MINUTE;
const CHANGE_STEPS = BUILDER_CHANGE_MINUTES * STEPS_PER_MINUTE;
/** The crew that comes in from outside has no obrador; its builders keep 0 as their home unit. */
const OUTSIDE_CREW = 0;

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

/** The sites in the order the crew takes them: priority sites first, then the first one placed first. */
export function sitesInOrder(state: TowerState): ConstructionSite[] {
  return Object.values(state.sites).sort(
    (a, b) =>
      Number(b.priority === true) - Number(a.priority === true) ||
      a.placedAtStep - b.placedAtStep ||
      unitNumber(a.id) - unitNumber(b.id),
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
  const built: Unit = withLook({
    ...newUnit(id, site.type, site.x, site.level),
    paid: site.paid,
    placedAtStep: state.step,
    listed: site.listed ?? newUnit(id, site.type, site.x, site.level).listed,
  });
  startAtAppraisal(state, built);
  if (site.price !== undefined) built.price = site.price;
  state.units[id] = built;
  if (site.type === 'security') addPeopleForUnit(state, id);
  addCrew(state, id);
}

/** The appraisal a priced site would start at today, and the price it has unless the player chose one. */
export function siteAppraisal(state: TowerState, site: ConstructionSite): number {
  return computeAppraisal(state, { type: site.type });
}

/**
 * What a builder is doing; kept in the person's `trip` number. A builder of an obrador walks in
 * from the street in everyday clothes (`arriving`), changes in the obrador (`changingIn`), works,
 * walks back to it at the end of the day (`returning`), changes again (`changingOut`) and leaves.
 */
export type BuilderPhase =
  | 'choosing'
  | 'toSite'
  | 'working'
  | 'leaving'
  | 'arriving'
  | 'changingIn'
  | 'returning'
  | 'changingOut';

/** The first four phases are stored as positive numbers, as they always were; the obrador ones as negative. */
const PHASES: readonly BuilderPhase[] = ['choosing', 'toSite', 'working', 'leaving'];
const OBRADOR_PHASES: readonly BuilderPhase[] = [
  'arriving',
  'changingIn',
  'returning',
  'changingOut',
];

export interface BuilderTask {
  phase: BuilderPhase;
  /** Unit number of the site the builder is heading to or working on, or 0. */
  site: number;
}

export function encodeBuilderTask(task: BuilderTask): number {
  const old = PHASES.indexOf(task.phase);
  if (old >= 0) return task.site * PHASES.length + old + 1;
  return -(task.site * OBRADOR_PHASES.length + OBRADOR_PHASES.indexOf(task.phase) + 1);
}

export function decodeBuilderTask(trip: number): BuilderTask | null {
  if (trip === NO_TRIP) return null;
  const list = trip > 0 ? PHASES : OBRADOR_PHASES;
  const code = Math.abs(trip) - 1;
  const phase = list[code % list.length];
  if (!phase) return null;
  return { phase, site: Math.floor(code / list.length) };
}

export function isBuilder(pool: PersonPool, slot: number): boolean {
  return pool.kind[slot] === BUILDER_KIND;
}

/** The obrador number of the builder's crew, or 0 for the crew from outside. */
export function crewOf(pool: PersonPool, slot: number): number {
  return pool.homeUnit[slot] as number;
}

/**
 * True while the builder wears work clothes. The crew from outside always does; an obrador's
 * builders change in their obrador on the way in and on the way out.
 */
export function builderWearsUniform(pool: PersonPool, slot: number): boolean {
  if (crewOf(pool, slot) === OUTSIDE_CREW) return true;
  const task = decodeBuilderTask(pool.trip[slot] ?? NO_TRIP);
  if (!task) return false;
  return (
    task.phase === 'choosing' ||
    task.phase === 'toSite' ||
    task.phase === 'working' ||
    task.phase === 'returning' ||
    task.phase === 'changingOut'
  );
}

function obradorOf(state: TowerState, crew: number): Unit | null {
  if (crew === OUTSIDE_CREW) return null;
  const unit = state.units[`u${crew}`];
  return unit?.type === 'obrador' ? unit : null;
}

function upgradeLevel(unit: Unit | null, id: string): number {
  return unit?.upgrades?.[id] ?? 0;
}

/** Builders in the crew of an obrador: the base crew plus one per level of storage. */
export function crewSize(unit: Unit | null): number {
  return BUILDER_CREW_SIZE + upgradeLevel(unit, 'storage');
}

/** The share of construction noise left for a site this crew works on, from 1 down. */
export function crewNoiseFactor(state: TowerState, crew: number): number {
  const level = upgradeLevel(obradorOf(state, crew), 'quietEquipment');
  return Math.max(0, 1 - level * BUILDER_QUIET_SHARE);
}

function unitDoor(unit: Unit): TrekPlace {
  return { level: unit.level, column: unit.x + Math.floor(UNIT_CATALOG[unit.type].width / 2) };
}

function stepOfDay(step: number): number {
  return step % STEPS_PER_DAY;
}

function isWorkDay(step: number): boolean {
  return weekdayOfDay(Math.floor(step / STEPS_PER_DAY)) !== WEEKDAYS.sunday;
}

/** True on a work day between the start and the end of the work hours. */
export function isWorkTime(step: number): boolean {
  const time = stepOfDay(step);
  return isWorkDay(step) && time >= WORK_START_STEP && time < WORK_END_STEP;
}

/** The crews with at least one builder in the pool. */
function crewsPresent(pool: PersonPool, slots: readonly number[]): Set<number> {
  const crews = new Set<number>();
  for (const slot of slots) crews.add(crewOf(pool, slot));
  return crews;
}

/** Which crew holds each site: a builder heading to it or working on it. */
type Claims = Map<number, number>;

interface Builder {
  context: StepContext;
  slot: number;
  claims: Claims;
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
    if (startTrek(builder.context, builder.slot, exit, streetColumn(side))) return;
  }
  removePerson(state, pool.id[builder.slot] as number);
}

/**
 * The work is over for the builder. One of an obrador walks back to it to change first; the crew
 * from outside, or one whose obrador is gone, walks straight out.
 */
function goHome(builder: Builder): void {
  const { state } = builder.context;
  const pool = state.people;
  const task = decodeBuilderTask(pool.trip[builder.slot] ?? NO_TRIP);
  if (task?.phase === 'returning' || task?.phase === 'changingOut' || task?.phase === 'leaving') {
    return;
  }
  const obrador = obradorOf(state, crewOf(pool, builder.slot));
  if (!obrador || !builderWearsUniform(pool, builder.slot)) {
    leave(builder);
    return;
  }
  stopTrek(builder);
  const door = unitDoor(obrador);
  if (isAt(builder, door)) {
    startChanging(builder, 'changingOut');
    return;
  }
  save(builder, { phase: 'returning', site: 0 });
  if (!startTrek(builder.context, builder.slot, door)) leave(builder);
}

function startChanging(builder: Builder, phase: 'changingIn' | 'changingOut'): void {
  save(builder, { phase, site: 0 });
  builder.context.state.people.dueStep[builder.slot] = builder.context.state.step + CHANGE_STEPS;
}

function claim(builder: Builder, phase: 'toSite' | 'working', site: number): void {
  save(builder, { phase, site });
  builder.claims.set(site, crewOf(builder.context.state.people, builder.slot));
}

/**
 * Takes the first site in the queue that no other crew holds and the builder can reach, or goes
 * home when there is none. A crew's builders all go to the same site.
 */
function choose(builder: Builder): void {
  const { state } = builder.context;
  if (!isWorkTime(state.step)) {
    goHome(builder);
    return;
  }
  stopTrek(builder);
  const crew = crewOf(state.people, builder.slot);
  for (const site of sitesInOrder(state)) {
    const number = unitNumber(site.id);
    const holder = builder.claims.get(number);
    if (holder !== undefined && holder !== crew) continue;
    const door = siteDoor(site);
    if (isAt(builder, door)) {
      claim(builder, 'working', number);
      return;
    }
    if (startTrek(builder.context, builder.slot, door)) {
      claim(builder, 'toSite', number);
      return;
    }
  }
  goHome(builder);
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
  if (advanceAtObrador(builder, task)) return;
  if (!isWorkTime(state.step)) {
    goHome(builder);
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
        goHome(builder);
      } else if (!isOnTrek(pool, builder.slot)) {
        if (isAt(builder, siteDoor(site))) {
          claim(builder, 'working', task.site);
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
      site.points += pointsThisMinute(builder);
      if (site.points >= constructionPointsFor(site.type)) {
        completeSite(state, site.id);
      }
      return;
  }
}

/**
 * The points a builder adds in a minute: 1, and a share more for each level of the tools of the
 * crew's obrador. The share is rounded up or down by a dither on the builder and the minute, so
 * the crew's average is exact and every run gives the same points.
 */
function pointsThisMinute(builder: Builder): number {
  const { state } = builder.context;
  const pool = state.people;
  const tools = upgradeLevel(obradorOf(state, crewOf(pool, builder.slot)), 'tools');
  if (tools === 0) return 1;
  const extra = tools * BUILDER_TOOLS_BONUS;
  const whole = Math.floor(extra);
  const minute = Math.floor(state.step / STEPS_PER_MINUTE);
  return 1 + whole + (dither(pool.id[builder.slot] as number, minute) < extra - whole ? 1 : 0);
}

/** Handles the phases at the obrador; true when the builder was in one of them. */
function advanceAtObrador(builder: Builder, task: BuilderTask): boolean {
  const { state } = builder.context;
  const pool = state.people;
  switch (task.phase) {
    case 'arriving': {
      if (isOnTrek(pool, builder.slot)) return true;
      const obrador = obradorOf(state, crewOf(pool, builder.slot));
      if (!obrador || !isWorkTime(state.step)) {
        leave(builder);
        return true;
      }
      const door = unitDoor(obrador);
      if (isAt(builder, door)) startChanging(builder, 'changingIn');
      else if (!startTrek(builder.context, builder.slot, door)) leave(builder);
      return true;
    }
    case 'changingIn':
      if (state.step < (pool.dueStep[builder.slot] as number)) return true;
      pool.dueStep[builder.slot] = NOTHING_DUE;
      save(builder, { phase: 'choosing', site: 0 });
      choose(builder);
      return true;
    case 'returning': {
      if (isOnTrek(pool, builder.slot)) return true;
      const obrador = obradorOf(state, crewOf(pool, builder.slot));
      if (obrador && isAt(builder, unitDoor(obrador))) startChanging(builder, 'changingOut');
      else leave(builder);
      return true;
    }
    case 'changingOut':
      if (state.step < (pool.dueStep[builder.slot] as number)) return true;
      pool.dueStep[builder.slot] = NOTHING_DUE;
      leave(builder);
      return true;
    default:
      return false;
  }
}

/** The sites held by a crew right now, from the builders heading to them or working on them. */
function claimsOf(pool: PersonPool, slots: readonly number[]): Claims {
  const claims: Claims = new Map();
  for (const slot of slots) {
    const task = decodeBuilderTask(pool.trip[slot] ?? NO_TRIP);
    if (task && (task.phase === 'toSite' || task.phase === 'working')) {
      claims.set(task.site, crewOf(pool, slot));
    }
  }
  return claims;
}

function builderSlots(pool: PersonPool): number[] {
  const slots: number[] = [];
  const kinds = pool.kind;
  for (let slot = 0; slot < kinds.length; slot++) {
    if (kinds[slot] === BUILDER_KIND) slots.push(slot);
  }
  return slots;
}

function isCrewStartTime(state: TowerState): boolean {
  return (
    state.step % STEPS_PER_MINUTE === 0 &&
    isWorkDay(state.step) &&
    stepOfDay(state.step) >= WORK_START_STEP &&
    stepOfDay(state.step) < LAST_START_STEP
  );
}

/**
 * Starts the crews that are missing when there is work and time for it, and moves every builder on
 * by one step. The crew from outside comes whenever there is a site; an obrador's crew comes while
 * there are more sites than crews in the tower.
 */
export function createConstructionSystem(): SimulationSystem {
  return (context) => {
    const { state } = context;
    const pool = state.people;
    let slots = builderSlots(pool);
    if (isCrewStartTime(state)) {
      const siteCount = Object.keys(state.sites).length;
      if (siteCount > 0) {
        const present = crewsPresent(pool, slots);
        const before = pool.id.length;
        if (!present.has(OUTSIDE_CREW)) {
          bringCrew(context);
          present.add(OUTSIDE_CREW);
        }
        for (const unit of obradorsInOrder(state)) {
          if (present.size >= siteCount) break;
          const crew = unitNumber(unit.id);
          if (present.has(crew)) continue;
          bringObradorCrew(context, unit);
          present.add(crew);
        }
        if (pool.id.length !== before) slots = builderSlots(pool);
      }
    }
    if (slots.length === 0) return;
    const claims = claimsOf(pool, slots);
    // Backwards, because a builder who leaves the tower is removed from the pool; only the
    // builder's own slot is removed, and people who are added go after the last slot.
    for (let index = slots.length - 1; index >= 0; index--) {
      advanceBuilder({ context, slot: slots[index] as number, claims });
    }
  };
}

function obradorsInOrder(state: TowerState): Unit[] {
  return Object.values(state.units)
    .filter((unit) => unit.type === 'obrador')
    .sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

/** A builder comes from the edge of the map on the side of the lobby end nearer a random column. */
function streetStart(state: TowerState, low: number, high: number): TrekPlace {
  const onRight = nextInt(state.rng, low, high) * 2 > low + high;
  return streetPlace(onRight);
}

function lobbyEnds(state: TowerState): { low: number; high: number } | null {
  const left = entrancePlace(state, false);
  const right = entrancePlace(state, true);
  if (!left || !right) return null;
  return {
    low: Math.min(left.column, right.column),
    high: Math.max(left.column, right.column),
  };
}

/** The crew from outside comes in through the main lobby entrance, already in work clothes. */
function bringCrew(context: StepContext): void {
  const { state } = context;
  const ends = lobbyEnds(state);
  if (!ends) return;
  for (let index = 0; index < BUILDER_CREW_SIZE; index++) {
    const street = streetStart(state, ends.low, ends.high);
    addPerson(state, {
      kind: 'builder',
      homeUnit: OUTSIDE_CREW,
      level: street.level,
      column: street.column,
    });
    const slot = state.people.id.length - 1;
    state.people.trip[slot] = encodeBuilderTask({ phase: 'choosing', site: 0 });
  }
}

/** An obrador's crew comes in from the street in everyday clothes and walks to the obrador. */
function bringObradorCrew(context: StepContext, obrador: Unit): void {
  const { state } = context;
  const ends = lobbyEnds(state);
  if (!ends) return;
  const door = unitDoor(obrador);
  const size = crewSize(obrador);
  for (let index = 0; index < size; index++) {
    const street = streetStart(state, ends.low, ends.high);
    const id = addPerson(state, {
      kind: 'builder',
      homeUnit: unitNumber(obrador.id),
      level: street.level,
      column: street.column,
    });
    const slot = state.people.id.length - 1;
    state.people.trip[slot] = encodeBuilderTask({ phase: 'arriving', site: 0 });
    if (!startTrek(context, slot, door)) removePerson(state, id);
  }
}

/** At the end of the work day every builder goes home: an obrador's builders change first. */
function sendBuildersHome(context: StepContext): void {
  const pool = context.state.people;
  const slots = builderSlots(pool);
  const claims: Claims = new Map();
  for (let index = slots.length - 1; index >= 0; index--) {
    goHome({ context, slot: slots[index] as number, claims });
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
