import {
  SHAFT_UNIT_TYPES,
  UNIT_CATALOG,
  type CarView,
  type Command,
  type DemolishTarget,
  type Level,
  type ShaftView,
  type TransportView,
  type UnitType,
  type UnitView,
} from '@tower-magnate/shared';
import type { Cell } from '../../render/cellAtPoint';
import type { Footprint } from '../../render/ghostLayer';
import { levelToIndex } from '../../render/levels';
import { footprintFloors, footprintWidth } from '../../render/placementCheck';

export const CONFIRM_PRICE = 500_000;

export type RunKind = 'floor' | 'lobby' | 'ruins';

const RUN_KIND_BY_SYMBOL: Readonly<Record<string, RunKind>> = {
  l: 'lobby',
  f: 'floor',
  r: 'ruins',
};

/** What the Topadora can see: the client's copy of the tower. */
export interface DemolishWorld {
  structure: ReadonlyMap<Level, string>;
  units: Iterable<UnitView>;
  transports: Iterable<TransportView>;
  shafts: Iterable<ShaftView>;
  cars: Iterable<CarView>;
}

export interface Confirmation {
  kind: 'soldCondo' | 'expensive';
  unitType: UnitType;
  price: number;
}

/** What sits under the pointer and what removing it would send. */
export interface DemolishPick {
  command: Command;
  footprint: Footprint;
  /** Floor, lobby and ruins are removed as a run: dragging along the level extends it. */
  run: RunKind | null;
  confirmation: Confirmation | null;
}

/** The price paid to build the thing, as the catalog states it. */
export function buildPrice(type: UnitType): number {
  const { cost } = UNIT_CATALOG[type];
  return cost.kind === 'shaft' ? cost.shaftAmount : cost.amount;
}

function confirmationFor(unitType: UnitType, soldCondo: boolean): Confirmation | null {
  const price = buildPrice(unitType);
  if (soldCondo) {
    return { kind: 'soldCondo', unitType, price };
  }
  return price >= CONFIRM_PRICE ? { kind: 'expensive', unitType, price } : null;
}

function targetPick(
  target: DemolishTarget,
  footprint: Footprint,
  confirmation: Confirmation | null,
): DemolishPick {
  return { command: { type: 'demolish', target }, footprint, run: null, confirmation };
}

function coversCell(thing: Footprint, cell: Cell): boolean {
  const bottom = levelToIndex(thing.level);
  const index = levelToIndex(cell.level);
  return (
    cell.x >= thing.x &&
    cell.x < thing.x + thing.width &&
    index >= bottom &&
    index < bottom + thing.floors
  );
}

function footprintOfThing(thing: { type: UnitType; x: number; level: Level }): Footprint {
  return {
    x: thing.x,
    level: thing.level,
    width: footprintWidth(thing.type),
    floors: footprintFloors(thing.type),
  };
}

function footprintOfShaft(shaft: ShaftView): Footprint {
  return {
    x: shaft.x,
    level: shaft.bottom,
    width: footprintWidth(SHAFT_UNIT_TYPES[shaft.type]),
    floors: levelToIndex(shaft.top) - levelToIndex(shaft.bottom) + 1,
  };
}

function pickCar(world: DemolishWorld, cell: Cell): DemolishPick | null {
  for (const shaft of world.shafts) {
    const footprint = footprintOfShaft(shaft);
    if (!coversCell(footprint, cell)) {
      continue;
    }
    for (const car of world.cars) {
      if (car.shaftId === shaft.id && Math.round(car.position) === levelToIndex(cell.level)) {
        return {
          command: { type: 'removeCar', shaftId: shaft.id, carIndex: car.index },
          footprint: { ...footprint, level: cell.level, floors: 1 },
          run: null,
          confirmation: null,
        };
      }
    }
  }
  return null;
}

function pickBuilt(world: DemolishWorld, cell: Cell): DemolishPick | null {
  for (const unit of world.units) {
    const footprint = footprintOfThing(unit);
    if (coversCell(footprint, cell)) {
      const soldCondo = unit.type === 'condo' && unit.occupied;
      const confirmation = confirmationFor(unit.type, soldCondo);
      return targetPick({ kind: 'unit', id: unit.id }, footprint, confirmation);
    }
  }
  for (const transport of world.transports) {
    const footprint = footprintOfThing(transport);
    if (coversCell(footprint, cell)) {
      return targetPick({ kind: 'transport', id: transport.id }, footprint, null);
    }
  }
  for (const shaft of world.shafts) {
    const footprint = footprintOfShaft(shaft);
    if (coversCell(footprint, cell)) {
      const confirmation = confirmationFor(SHAFT_UNIT_TYPES[shaft.type], false);
      return targetPick({ kind: 'shaft', id: shaft.id }, footprint, confirmation);
    }
  }
  return null;
}

function pickStructure(world: DemolishWorld, cell: Cell): DemolishPick | null {
  const symbol = world.structure.get(cell.level)?.[cell.x];
  const kind = symbol === undefined ? undefined : RUN_KIND_BY_SYMBOL[symbol];
  if (kind === undefined) {
    return null;
  }
  const command =
    kind === 'ruins'
      ? clearRuins(cell.level, cell.x)
      : demolishRun(kind, cell.level, cell.x, cell.x);
  return {
    command,
    footprint: runFootprint(cell.level, cell.x, cell.x),
    run: kind,
    confirmation: null,
  };
}

/**
 * Ui section 5.4 and UI-20, first match wins: car, then unit, transport or
 * shaft, then ruins, then lobby, then floor.
 */
export function pickDemolition(world: DemolishWorld, cell: Cell): DemolishPick | null {
  return pickCar(world, cell) ?? pickBuilt(world, cell) ?? pickStructure(world, cell);
}

/**
 * What a run between two columns of one level sends. Floor and lobby go as one
 * command; ruins are cleared one cell at a time, so each ruined cell gets its own.
 */
export function runCommands(
  kind: RunKind,
  level: Level,
  row: string,
  columnA: number,
  columnB: number,
): Command[] {
  if (kind !== 'ruins') {
    return [demolishRun(kind, level, columnA, columnB)];
  }
  const commands: Command[] = [];
  for (let x = Math.min(columnA, columnB); x <= Math.max(columnA, columnB); x++) {
    if (row[x] === 'r') {
      commands.push(clearRuins(level, x));
    }
  }
  return commands;
}

function clearRuins(level: Level, x: number): Command {
  return { type: 'demolish', target: { kind: 'ruins', level, x } };
}

export function demolishRun(
  kind: 'floor' | 'lobby',
  level: Level,
  columnA: number,
  columnB: number,
): Command {
  return {
    type: 'demolish',
    target: { kind, level, x0: Math.min(columnA, columnB), x1: Math.max(columnA, columnB) },
  };
}

/** The tiles a floor or lobby drag would remove. */
export function runFootprint(level: Level, columnA: number, columnB: number): Footprint {
  const x0 = Math.min(columnA, columnB);
  return { x: x0, level, width: Math.max(columnA, columnB) - x0 + 1, floors: 1 };
}
