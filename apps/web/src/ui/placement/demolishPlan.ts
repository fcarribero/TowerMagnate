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
import type { CommandOutcome } from '../../api/commandApi';
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
  /**
   * `lastCar`: the click was on the last car of a shaft, which only goes with the whole shaft.
   * `buyCondo`: the click was on a condo with owners, which cannot be demolished; the offer is
   * to buy it back at its appraisal (`price`).
   */
  kind: 'buyCondo' | 'expensive' | 'rented' | 'lastCar';
  unitType: UnitType;
  price: number;
  /** Rented units only: the indemnity, one week of rent summed over the units. */
  indemnity?: number;
  /** Rented units only: the rented units that are still listed, which "No renovar" unlists. */
  unlistIds?: string[];
  /** A floor run over units: how many units it removes. The walls under them stay. */
  units?: number;
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

function confirmationFor(unitType: UnitType): Confirmation | null {
  const price = buildPrice(unitType);
  return price >= CONFIRM_PRICE ? { kind: 'expensive', unitType, price } : null;
}

/** One week of the rent locked in each lease: what demolishing rented units costs. */
export function indemnityOf(units: Iterable<Pick<UnitView, 'rent'>>): number {
  let total = 0;
  for (const unit of units) {
    total += unit.rent ?? 0;
  }
  return total;
}

function rentedConfirmation(unit: UnitView): Confirmation {
  return {
    kind: 'rented',
    unitType: unit.type,
    price: buildPrice(unit.type),
    indemnity: indemnityOf([unit]),
    unlistIds: unit.listed === false ? [] : [unit.id],
  };
}

/** The commands behind "No renovar": the contracts end at their term and are not offered again. */
export function unlistCommands(confirmation: Confirmation): Command[] {
  return (confirmation.unlistIds ?? []).map((unitId) => ({
    type: 'setListed',
    unitId,
    listed: false,
  }));
}

function intersectsSpan(unit: UnitView, level: Level, x0: number, x1: number): boolean {
  const footprint = footprintOfThing(unit);
  const bottom = levelToIndex(footprint.level);
  const index = levelToIndex(level);
  return (
    index >= bottom &&
    index < bottom + footprint.floors &&
    footprint.x <= x1 &&
    footprint.x + footprint.width > x0
  );
}

/** The units a floor run over one level would demolish: the engine removes them and leaves the walls. */
export function unitsInSpan(
  units: Iterable<UnitView>,
  level: Level,
  columnA: number,
  columnB: number,
): UnitView[] {
  const x0 = Math.min(columnA, columnB);
  const x1 = Math.max(columnA, columnB);
  return [...units].filter((unit) => intersectsSpan(unit, level, x0, x1));
}

/**
 * What a floor run asks before it goes. With no unit in the span it is a wall demolition and asks
 * nothing. With units it removes only them: rented ones ask about the indemnity, a sold condo or a
 * large total ask for a yes, anything else goes through.
 */
export function floorRunConfirmation(
  world: DemolishWorld,
  level: Level,
  columnA: number,
  columnB: number,
): Confirmation | null {
  return confirmationForUnits(unitsInSpan(world.units, level, columnA, columnB));
}

/** Rented units ask about the indemnity, a sold condo or a large total ask for a yes, else null. */
function confirmationForUnits(inSpan: readonly UnitView[]): Confirmation | null {
  const first = inSpan[0];
  if (first === undefined) {
    return null;
  }
  const rented = inSpan.filter((unit) => unit.rent !== undefined);
  const total = inSpan.reduce((sum, unit) => sum + buildPrice(unit.type), 0);
  if (rented.length > 0) {
    return {
      kind: 'rented',
      unitType: (rented[0] as UnitView).type,
      price: total,
      indemnity: indemnityOf(rented),
      unlistIds: rented.filter((unit) => unit.listed !== false).map((unit) => unit.id),
      units: inSpan.length,
    };
  }
  return total >= CONFIRM_PRICE
    ? { kind: 'expensive', unitType: first.type, price: total, units: inSpan.length }
    : null;
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

/**
 * The car under the cursor. A shaft keeps at least one car, so a click on its last car picks the
 * whole shaft instead, behind a confirmation that says why.
 */
function pickCar(world: DemolishWorld, cell: Cell): DemolishPick | null {
  const cars = [...world.cars];
  for (const shaft of world.shafts) {
    const footprint = footprintOfShaft(shaft);
    if (!coversCell(footprint, cell)) {
      continue;
    }
    const own = cars.filter((car) => car.shaftId === shaft.id);
    for (const car of own) {
      if (Math.round(car.position) !== levelToIndex(cell.level)) {
        continue;
      }
      if (own.length === 1) {
        const unitType = SHAFT_UNIT_TYPES[shaft.type];
        return targetPick({ kind: 'shaft', id: shaft.id }, footprint, {
          kind: 'lastCar',
          unitType,
          price: buildPrice(unitType),
        });
      }
      return {
        command: { type: 'removeCar', shaftId: shaft.id, carIndex: car.index },
        footprint: { ...footprint, level: cell.level, floors: 1 },
        run: null,
        confirmation: null,
      };
    }
  }
  return null;
}

/** The unit at the cell for a sweep, ignoring stairs, escalators, shafts and cars. */
export function unitAt(world: DemolishWorld, cell: Cell): UnitView | null {
  for (const unit of world.units) {
    if (coversCell(footprintOfThing(unit), cell)) {
      return unit;
    }
  }
  return null;
}

export function unitFootprint(unit: UnitView): Footprint {
  return footprintOfThing(unit);
}

/**
 * What removing one swept unit asks. Only a lease needs an answer, since it costs an indemnity
 * and can be left to run out instead; anything else goes straight away.
 */
export function singleUnitConfirmation(unit: UnitView): Confirmation | null {
  return unit.rent !== undefined ? rentedConfirmation(unit) : null;
}

/** The price a buyback of this condo pays: today's appraisal. */
function buyBackPrice(unit: UnitView): number {
  return unit.appraisal ?? unit.price;
}

/**
 * Buying back condos with owners, which must happen before they can be demolished: one command
 * per condo with the price shown, and one warning with the summed prices. Null with no condos.
 */
export function buyBackPlan(
  condos: readonly UnitView[],
): { commands: Command[]; confirmation: Confirmation } | null {
  if (condos.length === 0) {
    return null;
  }
  return {
    commands: condos.map((unit) => ({
      type: 'buyBackCondo',
      unitId: unit.id,
      price: buyBackPrice(unit),
    })),
    confirmation: {
      kind: 'buyCondo',
      unitType: 'condo',
      price: condos.reduce((sum, unit) => sum + buyBackPrice(unit), 0),
      ...(condos.length > 1 ? { units: condos.length } : {}),
    },
  };
}

/** A condo with owners: the engine refuses to demolish it until it is bought back. */
export function isOwnedCondo(unit: Pick<UnitView, 'type' | 'occupied'>): boolean {
  return unit.type === 'condo' && unit.occupied;
}

/**
 * What removing several swept units asks: always a yes. Rented ones add the summed indemnity and
 * a "No renovar" choice, sold condos say their price goes back to the owners.
 */
export function unitsConfirmation(units: readonly UnitView[]): Confirmation | null {
  const first = units[0];
  if (first === undefined) {
    return null;
  }
  return (
    confirmationForUnits(units) ?? {
      kind: 'expensive',
      unitType: first.type,
      price: units.reduce((sum, unit) => sum + buildPrice(unit.type), 0),
      units: units.length,
    }
  );
}

function pickUnit(world: DemolishWorld, cell: Cell): DemolishPick | null {
  for (const unit of world.units) {
    const footprint = footprintOfThing(unit);
    if (coversCell(footprint, cell)) {
      if (isOwnedCondo(unit)) {
        // The command carries the price shown in the warning; the engine refuses it if the
        // appraisal has changed by the time the player presses Comprar.
        const price = buyBackPrice(unit);
        return {
          command: { type: 'buyBackCondo', unitId: unit.id, price },
          footprint,
          run: null,
          confirmation: { kind: 'buyCondo', unitType: unit.type, price },
        };
      }
      const confirmation =
        unit.rent !== undefined ? rentedConfirmation(unit) : confirmationFor(unit.type);
      return targetPick({ kind: 'unit', id: unit.id }, footprint, confirmation);
    }
  }
  return null;
}

/** Stairs, escalators and shafts stand in the front layer, over whatever the back layer holds. */
function pickFrontLayer(world: DemolishWorld, cell: Cell): DemolishPick | null {
  for (const transport of world.transports) {
    const footprint = footprintOfThing(transport);
    if (coversCell(footprint, cell)) {
      return targetPick({ kind: 'transport', id: transport.id }, footprint, null);
    }
  }
  for (const shaft of world.shafts) {
    const footprint = footprintOfShaft(shaft);
    if (coversCell(footprint, cell) && isShaftEnd(shaft, cell)) {
      const unitType = SHAFT_UNIT_TYPES[shaft.type];
      const confirmation: Confirmation = {
        kind: 'expensive',
        unitType,
        price: buildPrice(unitType),
      };
      return targetPick({ kind: 'shaft', id: shaft.id }, footprint, confirmation);
    }
  }
  return null;
}

/** A shaft is demolished only from its base or its top, and always after a confirmation. */
function isShaftEnd(shaft: ShaftView, cell: Cell): boolean {
  return cell.level === shaft.bottom || cell.level === shaft.top;
}

/** The middle of a shaft: nothing there can be demolished, not even the floor behind it. */
function inShaftMiddle(world: DemolishWorld, cell: Cell): boolean {
  for (const shaft of world.shafts) {
    if (coversCell(footprintOfShaft(shaft), cell) && !isShaftEnd(shaft, cell)) {
      return true;
    }
  }
  return false;
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
 * Ui section 5.4 and UI-20, first match wins: car, then unit, then ruins, then transport or
 * shaft, then lobby, then floor. Ruins come before a transport or shaft because they can lie
 * behind one, where nothing else shows them, and they must be cleared to build or walk there.
 */
export function pickDemolition(world: DemolishWorld, cell: Cell): DemolishPick | null {
  const structure = pickStructure(world, cell);
  if (structure?.run === 'ruins') {
    return pickCar(world, cell) ?? pickUnit(world, cell) ?? structure;
  }
  const front = pickCar(world, cell) ?? pickUnit(world, cell) ?? pickFrontLayer(world, cell);
  if (front !== null) {
    return front;
  }
  return inShaftMiddle(world, cell) ? null : structure;
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

/** One outcome for a batch: the first refusal, or the sum of what was charged and paid back. */
export function combineOutcomes(outcomes: readonly CommandOutcome[]): CommandOutcome {
  const refused = outcomes.find((outcome) => !outcome.ok);
  if (refused !== undefined) {
    return refused;
  }
  let cost = 0;
  let refund = 0;
  for (const outcome of outcomes) {
    if (outcome.ok) {
      cost += outcome.cost;
      refund += outcome.refund;
    }
  }
  return { ok: true, cost, refund };
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
