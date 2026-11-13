import {
  levelAbove,
  UNIT_CATALOG,
  type EntityId,
  type Level,
  type LobbyHeight,
  type OccupantRef,
  type TowerState,
  type UnitType,
} from '@tower-magnate/shared';
import { addOccupant, cellsWithoutStructure, setStructure } from '../grid';
import { defaultSchedule, defaultStops, idleCar } from '../commands/shafts';
import { createTower } from '../state';
import { newUnit } from '../units';

export type ShaftType = 'standard' | 'service' | 'express';

export interface PlannedSpan {
  x0: number;
  x1: number;
}

export interface PlannedFloors extends PlannedSpan {
  from: Level;
  to: Level;
}

export interface PlannedUnit {
  type: UnitType;
  level: Level;
  x: number;
}

/** A stair or escalator flight from `level` to the level above, laid on free floor. */
export interface PlannedFlight {
  type: 'stairs' | 'escalator';
  x: number;
  level: Level;
}

export interface PlannedShaft {
  type: ShaftType;
  x: number;
  bottom: Level;
  top: Level;
  /** Cars parked at the bottom level; one when left out. */
  cars?: number;
}

/** A tower laid straight into the grid, without going through commands or their rules. */
export interface TowerPlan {
  seed?: number;
  lobby?: PlannedSpan & { height?: LobbyHeight };
  floors?: readonly PlannedFloors[];
  units?: readonly PlannedUnit[];
  shafts?: readonly PlannedShaft[];
  flights?: readonly PlannedFlight[];
}

export interface BuiltTower {
  state: TowerState;
  unitIds: EntityId[];
  shaftIds: EntityId[];
  flightIds: EntityId[];
}

const MAIN_LOBBY_LEVEL: Level = 1;

const SHAFT_UNITS: Readonly<Record<ShaftType, UnitType>> = {
  standard: 'standard-elevator',
  service: 'service-elevator',
  express: 'express-elevator',
};

export function buildTower(plan: TowerPlan): BuiltTower {
  const state = createTower(plan.seed ?? 1);
  if (plan.lobby) placeLobby(state, plan.lobby);
  for (const floors of plan.floors ?? []) placeFloors(state, floors);

  const unitIds = (plan.units ?? []).map((unit) => placeUnit(state, unit));
  const shaftIds = (plan.shafts ?? []).map((shaft) => placeShaft(state, shaft));
  const flightIds = (plan.flights ?? []).map((flight) => placeFlight(state, flight));
  return { state, unitIds, shaftIds, flightIds };
}

/** A main lobby on level 1 and floors on levels 2..floorCount, all over the same columns. */
export function plainTowerPlan(floorCount: number, x0: number, x1: number): TowerPlan {
  const plan: TowerPlan = { lobby: { x0, x1 } };
  if (floorCount > 1) {
    plan.floors = [{ from: 2, to: floorCount, x0, x1 }];
  }
  return plan;
}

function placeLobby(state: TowerState, lobby: PlannedSpan & { height?: LobbyHeight }): void {
  setStructure(state.grid, MAIN_LOBBY_LEVEL, lobby.x0, lobby.x1, 'lobby');
  state.grid.mainLobbyHeight = lobby.height ?? 1;
}

function placeFloors(state: TowerState, floors: PlannedFloors): void {
  for (const level of levelsBetween(floors.from, floors.to)) {
    setStructure(state.grid, level, floors.x0, floors.x1, 'floor');
  }
}

function placeUnit(state: TowerState, unit: PlannedUnit): EntityId {
  const definition = UNIT_CATALOG[unit.type];
  if (definition.height.kind !== 'fixed') {
    throw new Error(`Unit type ${unit.type} is not a fixed-height unit; plan it as a shaft`);
  }
  const top = levelOffset(unit.level, definition.height.floors - 1);
  const id = takeId(state, 'u');
  const span = { x0: unit.x, x1: unit.x + definition.width - 1 };
  occupy(state, levelsBetween(unit.level, top), span, { kind: 'unit', id }, unit.type);
  state.units[id] = { ...newUnit(id, unit.type, unit.x, unit.level), placedAtStep: state.step };
  return id;
}

function placeShaft(state: TowerState, shaft: PlannedShaft): EntityId {
  const definition = UNIT_CATALOG[SHAFT_UNITS[shaft.type]];
  const id = takeId(state, 's');
  const span = { x0: shaft.x, x1: shaft.x + definition.width - 1 };
  occupy(state, levelsBetween(shaft.bottom, shaft.top), span, { kind: 'shaft', id }, shaft.type);
  const cars = Array.from({ length: shaft.cars ?? 1 }, () => idleCar(shaft.bottom, 0, 0));
  state.shafts[id] = {
    id,
    type: shaft.type,
    x: shaft.x,
    bottom: shaft.bottom,
    top: shaft.top,
    cars,
    stops: defaultStops(shaft.type, shaft, state.grid),
    schedule: defaultSchedule(),
    queues: {},
    paid: 0,
    placedAtStep: state.step,
  };
  return id;
}

function placeFlight(state: TowerState, flight: PlannedFlight): EntityId {
  const id = takeId(state, 't');
  const span = { x0: flight.x, x1: flight.x + UNIT_CATALOG[flight.type].width - 1 };
  const landing = levelOffset(flight.level, 1);
  occupy(state, [flight.level], span, { kind: 'transport', id, part: 'footprint' }, flight.type);
  occupy(state, [landing], span, { kind: 'transport', id, part: 'landing' }, flight.type);
  state.transports[id] = {
    id,
    type: flight.type,
    x: flight.x,
    level: flight.level,
    paid: 0,
    placedAtStep: state.step,
  };
  return id;
}

function occupy(
  state: TowerState,
  levels: Level[],
  span: PlannedSpan,
  occupant: OccupantRef,
  what: string,
): void {
  for (const level of levels) {
    if (cellsWithoutStructure(state.grid, level, span.x0, span.x1) > 0) {
      throw new Error(`Planned ${what} at ${span.x0}..${span.x1} on level ${level} has no floor`);
    }
    addOccupant(state.grid, level, span.x0, span.x1, occupant);
  }
}

function takeId(state: TowerState, prefix: 'u' | 's' | 't'): EntityId {
  const id = `${prefix}${state.nextId}`;
  state.nextId += 1;
  return id;
}

function levelsBetween(from: Level, to: Level): Level[] {
  if (from > to) {
    throw new RangeError(`Level range ${from}..${to} is upside down`);
  }
  const levels: Level[] = [];
  for (let level: Level | null = from; level !== null && level <= to; level = levelAbove(level)) {
    levels.push(level);
  }
  return levels;
}

function levelOffset(level: Level, floorsUp: number): Level {
  let current = level;
  for (let count = 0; count < floorsUp; count++) {
    const next = levelAbove(current);
    if (next === null) throw new RangeError(`No level ${floorsUp} floors above ${level}`);
    current = next;
  }
  return current;
}
