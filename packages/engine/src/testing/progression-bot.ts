import {
  CATHEDRAL_BOTTOM_LEVEL,
  STAR_POPULATION_THRESHOLDS,
  RECYCLING_PEOPLE_PER_CENTER,
  UNIT_CATALOG,
  WEEKLY_UPKEEP,
  bombRansom,
  levelAbove,
  levelBelow,
  type Command,
  type CommandResult,
  type Level,
  type QueuedCommand,
  type Shaft,
  type StarRating,
  type TowerState,
  type Unit,
  type UnitType,
} from '@tower-magnate/shared';
import { STEPS_PER_MINUTE } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { cellsWithoutStructure, overlappingOccupants, structureAt } from '../grid';
import { populationOf } from '../population';
import { createTower } from '../state';
import { step } from '../step';
import {
  CATHEDRAL_LEVEL,
  CATHEDRAL_X,
  CORE_X0,
  CORE_X1,
  EXPRESS_SHAFT_COLUMNS,
  LOCAL_SHAFT_COLUMNS,
  PARKING_LEVELS,
  PARKING_RAMP_X,
  RECYCLING_LEVEL,
  SKY_LOBBIES,
  SKY_LOBBY_X0,
  SUBWAY_LEVEL,
  WALKWAY_LEFT_X1,
  WALKWAY_RIGHT_X0,
  SUBWAY_X,
  TOP_ZONE,
  TOWER_X1,
  ZONE_COUNT,
  growthSlots,
  serviceSlots,
  zoneOf,
  zoneRange,
  type Slot,
} from './progression-layout';

/** The bot looks at the tower and acts every 10 game minutes. */
const TICK_STEPS = 10 * STEPS_PER_MINUTE;
/** Money the bot keeps back from growth, for upkeep and events, on top of a week of upkeep. */
const GROWTH_RESERVE = 100_000;
/** Leased offices that keep one more fast food busy at lunch. */
const OFFICES_PER_FAST_FOOD = 10;
/** Types a careful player builds first once unlocked, because they pay back in days. */
const PREFERRED_TYPES: ReadonlySet<UnitType> = new Set(['party-hall', 'condo']);
/** Hotel rooms one housekeeping unit is planned for. */
const ROOMS_PER_HOUSEKEEPING = 24;
/** Money the bot keeps back from star requirements and transport. */
const NEED_RESERVE = 50_000;
/** Zone load (people and visits a day) one local car is planned for. */
const LOAD_PER_LOCAL_CAR = 110;
/** Load above zone 0 one express car is planned for. */
const LOAD_PER_EXPRESS_CAR = 450;
const MAX_CARS = 8;
const MAX_LOCAL_SHAFTS = 4;
/** Expected medical visits a leased office makes per weekday, and visits planned per center. */
const MEDICAL_VISITS_PER_OFFICE = 0.6;
const MEDICAL_VISITS_PER_CENTER = 70;
const MAX_MEDICAL_CENTERS = 10;
/** Parking spaces kept free above the number of holders. */
const PARKING_MARGIN = 8;
const VENUE_LOAD = 35;
const PARTY_HALL_LOAD = 40;

export interface ProgressionOptions {
  seed: number;
  /** Stop after this many game days if Torre has not come. */
  maxDays: number;
  /** Called at the end of every game day. */
  onDay?: (day: number, state: TowerState) => void;
}

export interface StarDay {
  stars: StarRating;
  day: number;
  population: number;
  money: number;
}

export interface DaySample {
  day: number;
  stars: StarRating;
  population: number;
  money: number;
  offices: number;
  leasedOffices: number;
  venues: number;
  cars: number;
}

export interface ProgressionRun {
  seed: number;
  starDays: StarDay[];
  samples: DaySample[];
  failedCommands: Record<string, number>;
  state: TowerState;
}

interface Action {
  commands: Command[];
  cost: number;
}

function unitsOf(state: TowerState, type: UnitType): Unit[] {
  return Object.values(state.units).filter((unit) => unit.type === type);
}

function widthOf(type: UnitType): number {
  return UNIT_CATALOG[type].width;
}

function heightOf(type: UnitType): number {
  const height = UNIT_CATALOG[type].height;
  return height.kind === 'fixed' ? height.floors : 1;
}

function unitCost(type: UnitType): number {
  const cost = UNIT_CATALOG[type].cost;
  return cost.kind === 'per-unit' ? cost.amount : 0;
}

function topLevelOf(level: Level, floors: number): Level {
  let top = level;
  for (let count = 1; count < floors; count++) top = levelAbove(top) as Level;
  return top;
}

/** The level whose structure holds a unit up: below it above ground, above it in a basement. */
function supportLevel(bottom: Level, top: Level): Level | null {
  if (bottom === 1) return null;
  if (bottom > 0) return levelBelow(bottom);
  return levelAbove(top);
}

class SupportPlanner {
  private readonly planned = new Map<Level, Array<[number, number]>>();

  constructor(private readonly state: TowerState) {}

  private hasStructure(level: Level, x: number): boolean {
    if (structureAt(this.state.grid, level, x) !== null) return true;
    return (this.planned.get(level) ?? []).some(([x0, x1]) => x >= x0 && x <= x1);
  }

  private plan(level: Level, x0: number, x1: number): void {
    const spans = this.planned.get(level) ?? [];
    spans.push([x0, x1]);
    this.planned.set(level, spans);
  }

  /** Commands that give level `level` structure on x0..x1, with what holds it up, bottom first. */
  structureFor(level: Level, x0: number, x1: number, action: Action): void {
    let missing0 = -1;
    let missing1 = -1;
    for (let x = x0; x <= x1; x++) {
      if (this.hasStructure(level, x)) continue;
      if (missing0 < 0) missing0 = x;
      missing1 = x;
    }
    if (missing0 < 0) return;
    if (level === 1) {
      this.lobbyFor(missing0, missing1, action);
      return;
    }
    const below = level > 0 ? levelBelow(level) : levelAbove(level);
    if (below !== null) this.structureFor(below, missing0, missing1, action);
    action.commands.push({ type: 'buildFloor', level, x0: missing0, x1: missing1 });
    action.cost += 500 * (missing1 - missing0 + 1);
    this.plan(level, missing0, missing1);
  }

  /** The main lobby grows as one run, so it reaches the missing columns from its nearest edge. */
  private lobbyFor(x0: number, x1: number, action: Action): void {
    let lobby0 = Infinity;
    let lobby1 = -Infinity;
    for (const span of this.state.grid.levels[1]?.structure ?? []) {
      lobby0 = Math.min(lobby0, span.x0);
      lobby1 = Math.max(lobby1, span.x1);
    }
    let from = x0;
    let to = x1;
    if (Number.isFinite(lobby0)) {
      if (to < lobby0) to = lobby0 - 1;
      if (from > lobby1) from = lobby1 + 1;
    }
    action.commands.push({ type: 'buildLobby', level: 1, x0: from, x1: to, height: 1 });
    action.cost += 5_000 * (to - from + 1);
    this.plan(1, from, to);
  }
}

function slotIsFree(state: TowerState, slot: Slot): boolean {
  const top = topLevelOf(slot.level, heightOf(slot.type));
  const x1 = slot.x + widthOf(slot.type) - 1;
  for (let level: Level = slot.level; ; level = levelAbove(level) as Level) {
    if (overlappingOccupants(state.grid, level, slot.x, x1).length > 0) return false;
    if (level === top) return true;
  }
}

function slotHasRuins(state: TowerState, slot: Slot): Array<{ level: Level; x: number }> {
  const top = topLevelOf(slot.level, heightOf(slot.type));
  const x1 = slot.x + widthOf(slot.type) - 1;
  const cells: Array<{ level: Level; x: number }> = [];
  for (let level: Level = slot.level; ; level = levelAbove(level) as Level) {
    for (const span of overlappingOccupants(state.grid, level, slot.x, x1)) {
      if (span.occupant.kind !== 'ruins') continue;
      for (let x = Math.max(span.x0, slot.x); x <= Math.min(span.x1, x1); x++) {
        cells.push({ level, x });
      }
    }
    if (level === top) return cells;
  }
}

function placeAction(state: TowerState, slot: Slot): Action {
  const action: Action = { commands: [], cost: 0 };
  const top = topLevelOf(slot.level, heightOf(slot.type));
  const support = supportLevel(slot.level, top);
  const x1 = slot.x + widthOf(slot.type) - 1;
  const planner = new SupportPlanner(state);
  if (support !== null) planner.structureFor(support, slot.x, x1, action);
  if (slot.level > 1) walkwayFor(planner, slot.level, slot.x, x1, action);
  if (slot.type === 'stairs') planner.structureFor(top, slot.x, x1, action);
  if (slot.type === 'stairs' || slot.type === 'escalator') {
    action.commands.push({
      type: 'buildTransport',
      transportType: slot.type,
      x: slot.x,
      level: slot.level,
    });
  } else {
    const unitType = slot.type as Extract<Command, { type: 'buildUnit' }>['unitType'];
    action.commands.push({ type: 'buildUnit', unitType, x: slot.x, level: slot.level });
  }
  const missingFloor = cellsWithoutStructure(state.grid, slot.level, slot.x, x1);
  action.cost += unitCost(slot.type) + 500 * missingFloor;
  return action;
}

/** Floor from the transport core to the unit's door, so people can walk there. */
function walkwayFor(planner: SupportPlanner, level: Level, x0: number, x1: number, action: Action) {
  if (x0 > WALKWAY_RIGHT_X0) planner.structureFor(level, WALKWAY_RIGHT_X0, x0 - 1, action);
  else if (x1 < WALKWAY_LEFT_X1) planner.structureFor(level, x1 + 1, WALKWAY_LEFT_X1, action);
}

/** People and daily visits a unit brings to its zone's elevators. */
function loadOf(unit: Unit): number {
  switch (unit.type) {
    case 'office':
      return unit.lease ? 6 : 0;
    case 'condo':
      return unit.sale ? 3 : 0;
    case 'single-room':
      return 1;
    case 'double-room':
    case 'suite':
      return 2;
    case 'fast-food':
    case 'restaurant':
    case 'retail-shop':
      return VENUE_LOAD;
    case 'party-hall':
      return PARTY_HALL_LOAD;
    default:
      return 0;
  }
}

function zoneLoads(state: TowerState): number[] {
  const loads = Array.from({ length: ZONE_COUNT }, () => 0);
  for (const unit of Object.values(state.units)) {
    if (unit.level < 1) continue;
    const zone = zoneOf(unit.level);
    loads[zone] = (loads[zone] as number) + loadOf(unit);
  }
  return loads;
}

/** What next Monday's upkeep would charge for the tower as it stands. */
function weeklyUpkeep(state: TowerState): number {
  let total = 0;
  for (const unit of Object.values(state.units)) total += upkeepOf(unit.type, state.stars);
  for (const shaft of Object.values(state.shafts)) {
    total += shaft.cars.length * upkeepOf(SHAFT_UNITS[shaft.type], state.stars);
  }
  return total;
}

const SHAFT_UNITS = {
  standard: 'standard-elevator',
  service: 'service-elevator',
  express: 'express-elevator',
} as const;

function upkeepOf(type: UnitType, stars: StarRating): number {
  let amount = 0;
  for (const step of WEEKLY_UPKEEP[type].amountByStars) {
    if (stars >= step.minStars) amount = step.amount;
  }
  return amount;
}

function carCount(shafts: readonly Shaft[]): number {
  return shafts.reduce((sum, shaft) => sum + shaft.cars.length, 0);
}

export class ProgressionBot {
  private state: TowerState;
  private commandCount = 0;
  readonly failedCommands: Record<string, number> = {};
  /** The highest zone the bot has opened; growth goes zone by zone. */
  private openZone = 0;
  /** Commands that failed, by their JSON; the bot stops trying one after a few failures. */
  private readonly failures = new Map<string, number>();

  constructor(seed: number) {
    this.state = createTower(seed);
  }

  get tower(): TowerState {
    return this.state;
  }

  /** Plays one tick: decides at its start, then runs the engine. */
  playTick(): void {
    const commands = this.decide();
    const queued: QueuedCommand[] = commands.map((command) => ({
      id: `b${++this.commandCount}`,
      command,
    }));
    const outcome = step(this.state, queued, TICK_STEPS);
    this.state = outcome.state;
    this.countFailures(outcome.results, queued);
  }

  private countFailures(results: readonly CommandResult[], queued: readonly QueuedCommand[]): void {
    const commands = new Map(queued.map((entry) => [entry.id, entry.command]));
    for (const result of results) {
      if (result.ok) continue;
      const command = commands.get(result.id);
      const key = `${command?.type ?? '?'}:${result.error}`;
      this.failedCommands[key] = (this.failedCommands[key] ?? 0) + 1;
      if (result.error === 'INSUFFICIENT_FUNDS' || !command) continue;
      const json = JSON.stringify(command);
      this.failures.set(json, (this.failures.get(json) ?? 0) + 1);
    }
  }

  /** False for an action with a command that keeps failing, so the bot moves on. */
  private usable(action: Action | null): action is Action {
    if (!action) return false;
    return action.commands.every(
      (command) => (this.failures.get(JSON.stringify(command)) ?? 0) < 3,
    );
  }

  private decide(): Command[] {
    const budget = { money: this.state.money };
    const commands: Command[] = [...this.answerDecisions()];
    const take = (action: Action | null, reserve: number): boolean => {
      if (!action || action.commands.length === 0) return false;
      if (budget.money - action.cost < reserve) return false;
      budget.money -= action.cost;
      commands.push(...action.commands);
      return true;
    };
    // One construction per tick keeps the support planner's view of the grid exact.
    for (const need of [
      () => this.ruinsAction(),
      () => this.transportAction(),
      () => this.securityAction(),
      () => this.medicalAction(),
      () => this.parkingAction(),
      () => this.recyclingAction(),
      () => this.subwayAction(),
      () => this.cathedralAction(),
    ]) {
      const action = need();
      if (!this.usable(action)) continue;
      take(action, NEED_RESERVE);
      return commands;
    }
    take(this.growthAction(), this.growthReserve());
    return commands;
  }

  /** A careful player keeps a week of upkeep and the ransom of a bomb threat in the bank. */
  private growthReserve(): number {
    const ransom = this.state.stars >= 2 ? bombRansom(this.state.stars) : 0;
    return GROWTH_RESERVE + ransom + weeklyUpkeep(this.state);
  }

  /** Ruins block walking, so they are cleared before anything else is built. */
  private ruinsAction(): Action | null {
    const commands: Command[] = [];
    for (const [key, row] of Object.entries(this.state.grid.levels)) {
      const level = Number(key);
      for (const span of row?.occupants ?? []) {
        if (span.occupant.kind !== 'ruins') continue;
        for (let x = span.x0; x <= span.x1; x++) {
          commands.push({ type: 'demolish', target: { kind: 'ruins', level, x } });
        }
      }
    }
    return commands.length > 0 ? { commands, cost: 0 } : null;
  }

  private answerDecisions(): Command[] {
    const commands: Command[] = [];
    for (const event of this.state.activeEvents) {
      if (event.decision.choice !== null) continue;
      if (event.kind === 'bomb') {
        const pay = event.ransom + NEED_RESERVE <= this.state.money;
        commands.push({ type: 'answerEvent', eventId: event.id, choice: pay ? 'pay' : 'refuse' });
      } else {
        const helicopter = this.state.money >= 2_000_000;
        commands.push({
          type: 'answerEvent',
          eventId: event.id,
          choice: helicopter ? 'helicopter' : 'burn',
        });
      }
    }
    return commands;
  }

  private unlocked(type: UnitType): boolean {
    return UNIT_CATALOG[type].unlockStars <= this.state.stars;
  }

  // ---- transport ----

  private zoneShafts(zone: number): Shaft[] {
    const { bottom, top } = zoneRange(zone);
    return Object.values(this.state.shafts)
      .filter((shaft) => shaft.type === 'standard' && shaft.bottom >= bottom && shaft.top <= top)
      .sort((a, b) => a.x - b.x);
  }

  private expressShafts(): Shaft[] {
    return Object.values(this.state.shafts).filter((shaft) => shaft.type === 'express');
  }

  /** The highest level with units or floor in a zone that its local shafts should reach. */
  private zoneTop(zone: number): Level {
    const { bottom, top } = zoneRange(zone);
    let highest = bottom;
    for (const unit of Object.values(this.state.units)) {
      if (unit.level > highest && unit.level <= top) highest = unit.level;
    }
    if (zone === TOP_ZONE && unitsOf(this.state, 'cathedral').length > 0) highest = CATHEDRAL_LEVEL;
    return Math.max(highest, bottom + 1);
  }

  private shaftAction(x: number, bottom: Level, top: Level, type: 'standard' | 'express'): Action {
    const action: Action = { commands: [], cost: 0 };
    const planner = new SupportPlanner(this.state);
    const x1 = x + (type === 'express' ? 6 : 4) - 1;
    for (let level: Level = bottom; level <= top; level = levelAbove(level) as Level) {
      planner.structureFor(level, x, x1, action);
      if (level === top) break;
    }
    action.commands.push({ type: 'buildShaft', shaftType: type, x, bottom, top });
    action.cost += type === 'express' ? 550_000 : 280_000;
    return action;
  }

  private resizeAction(shaft: Shaft, bottom: Level, top: Level): Action {
    const action: Action = { commands: [], cost: 0 };
    const planner = new SupportPlanner(this.state);
    const x1 = shaft.x + (shaft.type === 'express' ? 6 : 4) - 1;
    for (let level: Level = bottom; level <= top; level = levelAbove(level) as Level) {
      planner.structureFor(level, shaft.x, x1, action);
      if (level === top) break;
    }
    action.commands.push({ type: 'resizeShaft', shaftId: shaft.id, bottom, top });
    return action;
  }

  private transportAction(): Action | null {
    const loads = zoneLoads(this.state);
    for (let zone = 0; zone <= this.openZone; zone++) {
      const action = this.zoneTransport(zone, loads[zone] as number);
      if (action) return action;
    }
    return this.expressTransport(loads);
  }

  private zoneTransport(zone: number, load: number): Action | null {
    const { bottom } = zoneRange(zone);
    if (zone > 0 && !this.skyLobbyReady(zone)) return this.skyLobbyAction(zone);
    const top = this.zoneTop(zone);
    const shafts = this.zoneShafts(zone);
    const wantedCars = Math.max(1, Math.ceil(load / LOAD_PER_LOCAL_CAR));
    const wantedShafts = Math.min(MAX_LOCAL_SHAFTS, Math.max(1, Math.ceil(wantedCars / 6)));
    if (shafts.length < wantedShafts) {
      const x = LOCAL_SHAFT_COLUMNS[shafts.length] as number;
      if (Object.keys(this.state.shafts).length >= 24) return null;
      return this.shaftAction(x, bottom, top, 'standard');
    }
    for (const shaft of shafts) {
      if (shaft.top < top) return this.resizeAction(shaft, shaft.bottom, top);
    }
    if (carCount(shafts) < Math.min(wantedCars, shafts.length * MAX_CARS)) {
      const target = shafts.reduce((least, shaft) =>
        shaft.cars.length < least.cars.length ? shaft : least,
      );
      return {
        commands: [{ type: 'addCar', shaftId: target.id, homeLevel: target.bottom }],
        cost: 80_000,
      };
    }
    return null;
  }

  private skyLobbyReady(zone: number): boolean {
    const lobby = SKY_LOBBIES[zone - 1] as Level;
    const expressReaches = this.expressShafts().some((shaft) => shaft.top >= lobby);
    return expressReaches && structureAt(this.state.grid, lobby, SKY_LOBBY_X0) === 'lobby';
  }

  private skyLobbyAction(zone: number): Action | null {
    const lobby = SKY_LOBBIES[zone - 1] as Level;
    if (structureAt(this.state.grid, lobby, SKY_LOBBY_X0) !== 'lobby') {
      const action: Action = { commands: [], cost: 0 };
      const planner = new SupportPlanner(this.state);
      const below = levelBelow(lobby) as Level;
      planner.structureFor(below, SKY_LOBBY_X0, CORE_X1, action);
      action.commands.push({
        type: 'buildLobby',
        level: lobby,
        x0: SKY_LOBBY_X0,
        x1: CORE_X1,
        height: 1,
      });
      action.cost += 5_000 * (CORE_X1 - SKY_LOBBY_X0 + 1);
      return action;
    }
    const express = this.expressShafts();
    if (express.length === 0)
      return this.shaftAction(EXPRESS_SHAFT_COLUMNS[0], 1, lobby, 'express');
    for (const shaft of express) {
      if (shaft.top < lobby) return this.resizeAction(shaft, shaft.bottom, lobby);
    }
    return null;
  }

  private expressTransport(loads: readonly number[]): Action | null {
    const express = this.expressShafts();
    if (express.length === 0) return null;
    const upper = loads.slice(1).reduce((sum, load) => sum + load, 0);
    const wantedCars = Math.max(1, Math.ceil(upper / LOAD_PER_EXPRESS_CAR));
    if (express.length < 2 && wantedCars > 4) {
      const top = Math.max(...express.map((shaft) => shaft.top));
      return this.shaftAction(EXPRESS_SHAFT_COLUMNS[1], 1, top, 'express');
    }
    if (carCount(express) >= Math.min(wantedCars, express.length * MAX_CARS)) return null;
    const target = express.reduce((least, shaft) =>
      shaft.cars.length < least.cars.length ? shaft : least,
    );
    return {
      commands: [{ type: 'addCar', shaftId: target.id, homeLevel: 1 }],
      cost: 150_000,
    };
  }

  // ---- star requirements ----

  private serviceAction(type: UnitType, wanted: number): Action | null {
    if (!this.unlocked(type)) return null;
    if (unitsOf(this.state, type).length >= wanted) return null;
    for (const slot of serviceSlots(type)) {
      if (slot.level > 1 && zoneOf(slot.level) > this.openZone) continue;
      if (!slotIsFree(this.state, slot)) continue;
      const action = placeAction(this.state, slot);
      if (this.usable(action)) return action;
    }
    return null;
  }

  /** True once population is close enough to the next rating to prepare its requirements. */
  private nearNextRating(share: number): boolean {
    if (this.state.stars >= 5) return false;
    const threshold = STAR_POPULATION_THRESHOLDS[this.state.stars as 1 | 2 | 3 | 4];
    return populationOf(this.state).total >= threshold * share;
  }

  private securityAction(): Action | null {
    if (this.state.stars === 2 && !this.nearNextRating(0.7)) return null;
    return this.serviceAction('security', this.state.stars >= 4 ? 2 : 1);
  }

  private medicalAction(): Action | null {
    if (this.state.stars < 3) return null;
    if (this.state.stars === 3 && !this.nearNextRating(0.6)) return null;
    const leased = unitsOf(this.state, 'office').filter((unit) => unit.lease).length;
    const visits = leased * MEDICAL_VISITS_PER_OFFICE;
    const wanted = Math.min(
      MAX_MEDICAL_CENTERS,
      Math.max(1, Math.ceil(visits / MEDICAL_VISITS_PER_CENTER)),
    );
    return this.serviceAction('medical-center', wanted);
  }

  private parkingAction(): Action | null {
    if (this.state.stars < 3 || !this.nearNextRating(0.6)) return null;
    const holders = Object.keys(this.state.parking.spaces).length;
    const spaces = unitsOf(this.state, 'parking-space').length;
    if (spaces >= holders + PARKING_MARGIN) return null;
    const ramps = unitsOf(this.state, 'parking-ramp');
    for (const level of PARKING_LEVELS) {
      if (!ramps.some((ramp) => ramp.level === level)) {
        return placeAction(this.state, { type: 'parking-ramp', x: PARKING_RAMP_X, level });
      }
      const onLevel = unitsOf(this.state, 'parking-space').filter((unit) => unit.level === level);
      const x = PARKING_RAMP_X + widthOf('parking-ramp') + 4 * onLevel.length;
      if (x + 3 <= TOWER_X1) return placeAction(this.state, { type: 'parking-space', x, level });
    }
    return null;
  }

  private recyclingAction(): Action | null {
    if (this.state.stars < 3 || this.state.stars >= 5) return null;
    const population = populationOf(this.state).total;
    const threshold = STAR_POPULATION_THRESHOLDS[this.state.stars as 3 | 4];
    if (population < threshold * 0.8) return null;
    const wanted = Math.ceil((Math.max(population, threshold) * 1.1) / RECYCLING_PEOPLE_PER_CENTER);
    const built = unitsOf(this.state, 'recycling-center').length;
    if (built >= wanted) return null;
    const x = SUBWAY_X + built * widthOf('recycling-center');
    return placeAction(this.state, { type: 'recycling-center', x, level: RECYCLING_LEVEL });
  }

  private subwayAction(): Action | null {
    if (this.state.stars !== 4 || unitsOf(this.state, 'subway-station').length > 0) return null;
    return placeAction(this.state, { type: 'subway-station', x: SUBWAY_X, level: SUBWAY_LEVEL });
  }

  private cathedralAction(): Action | null {
    if (this.state.stars !== 5 || unitsOf(this.state, 'cathedral').length > 0) return null;
    this.openZone = TOP_ZONE;
    if (!this.skyLobbyReady(TOP_ZONE)) return null;
    const action: Action = { commands: [], cost: 0 };
    const planner = new SupportPlanner(this.state);
    const cathedralX1 = CATHEDRAL_X + widthOf('cathedral') - 1;
    planner.structureFor(CATHEDRAL_BOTTOM_LEVEL, CORE_X0, cathedralX1, action);
    action.commands.push({
      type: 'buildUnit',
      unitType: 'cathedral',
      x: CATHEDRAL_X,
      level: CATHEDRAL_BOTTOM_LEVEL,
    });
    action.cost += unitCost('cathedral');
    return action;
  }

  // ---- growth ----

  private growthAction(): Action | null {
    for (let zone = 0; zone <= this.openZone; zone++) {
      const action = this.zoneGrowth(zone);
      if (action) return action;
    }
    const nextZone = this.openZone + 1;
    const zoneIsFull = this.openZone === 0 || this.zoneGrowth(this.openZone) === null;
    if (nextZone < ZONE_COUNT && zoneIsFull && this.unlocked('express-elevator')) {
      this.openZone = nextZone;
      return this.zoneGrowth(nextZone);
    }
    return null;
  }

  /** A careful player only adds venues and rooms that their customers and maids can keep up with. */
  private wanted(type: UnitType): boolean {
    if (!this.unlocked(type)) return false;
    const count = (unitType: UnitType) => unitsOf(this.state, unitType).length;
    switch (type) {
      case 'fast-food': {
        const leased = unitsOf(this.state, 'office').filter((unit) => unit.lease).length;
        return count('fast-food') < 1 + Math.floor(leased / OFFICES_PER_FAST_FOOD);
      }
      case 'single-room':
      case 'double-room':
      case 'suite': {
        const rooms = count('single-room') + count('double-room') + count('suite');
        return rooms < count('housekeeping') * ROOMS_PER_HOUSEKEEPING;
      }
      default:
        return true;
    }
  }

  private zoneGrowth(zone: number): Action | null {
    if (zone > 0 && !this.skyLobbyReady(zone)) return null;
    const slots = growthSlots(zone);
    const preferred = slots.filter((slot) => PREFERRED_TYPES.has(slot.type));
    return this.firstBuildable(preferred, true) ?? this.firstBuildable(slots, false);
  }

  /**
   * The first slot the bot wants and can place. With `onlyCheap`, slots that need more than half
   * their price again in lobby and floor underneath are passed over.
   */
  private firstBuildable(slots: readonly Slot[], onlyCheap: boolean): Action | null {
    for (const slot of slots) {
      if (!this.wanted(slot.type)) continue;
      const ruins = slotHasRuins(this.state, slot);
      if (ruins.length > 0) {
        return {
          commands: ruins.map(({ level, x }) => ({
            type: 'demolish',
            target: { kind: 'ruins', level, x },
          })),
          cost: 0,
        };
      }
      if (!slotIsFree(this.state, slot)) continue;
      const action = placeAction(this.state, slot);
      if (onlyCheap && action.cost > unitCost(slot.type) * 1.5) continue;
      if (this.usable(action)) return action;
    }
    return null;
  }
}

function sampleOf(day: number, state: TowerState): DaySample {
  const offices = unitsOf(state, 'office');
  const venues = Object.values(state.units).filter((unit) => unit.venue !== null).length;
  return {
    day,
    stars: state.stars,
    population: populationOf(state).total,
    money: state.money,
    offices: offices.length,
    leasedOffices: offices.filter((unit) => unit.lease).length,
    venues,
    cars: carCount(Object.values(state.shafts)),
  };
}

/** Plays the bot from an empty tower until the Torre rank or `maxDays`. */
export function runProgression(options: ProgressionOptions): ProgressionRun {
  const bot = new ProgressionBot(options.seed);
  const starDays: StarDay[] = [];
  const samples: DaySample[] = [];
  let stars = bot.tower.stars;
  for (let day = 0; day < options.maxDays; day++) {
    for (let tick = 0; tick < STEPS_PER_DAY / TICK_STEPS; tick++) {
      bot.playTick();
      const state = bot.tower;
      if (state.stars !== stars) {
        stars = state.stars;
        starDays.push({ stars, day, population: populationOf(state).total, money: state.money });
      }
    }
    samples.push(sampleOf(day, bot.tower));
    options.onDay?.(day, bot.tower);
    if (stars === 6) break;
  }
  return {
    seed: options.seed,
    starDays,
    samples,
    failedCommands: bot.failedCommands,
    state: bot.tower,
  };
}
