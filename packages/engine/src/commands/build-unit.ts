import {
  CATHEDRAL_BOTTOM_LEVEL,
  isBasement,
  isColumn,
  levelAbove,
  PlaceableUnitTypeSchema,
  TOP_FLOOR_LEVEL,
  TOWER_LAYOUT,
  UNIT_CATALOG,
  type ErrorCode,
  type GridState,
  type Level,
  type PlacementZone,
  type UnitDefinition,
} from '@tower-magnate/shared';
import { addOccupant, isSpanFree, levelError, setStructure, structureAt } from '../grid';
import type { CommandHandler } from '../step';
import { escalatorLevels, isEscalatorUnit } from './escalator-floors';
import { addPeopleForUnit } from '../people';
import { newUnit } from '../units';
import { bombLockError, limitError, starLockError } from './unit-limits';
import {
  columnRuns,
  columnsBetween,
  hasStructure,
  isInteger,
  isSupported,
  negativeBalanceError,
  payForConstruction,
  pricePerCell,
} from './structure';

/** The cells a unit would cover: columns x0..x1 on every level, bottom level first. */
interface Footprint {
  x0: number;
  x1: number;
  bottom: Level;
  top: Level;
  levels: Level[];
}

function placeableDefinition(unitType: unknown): UnitDefinition | null {
  const parsed = PlaceableUnitTypeSchema.safeParse(unitType);
  if (!parsed.success) return null;
  const definition = UNIT_CATALOG[parsed.data];
  if (definition.height.kind !== 'fixed' || definition.cost.kind !== 'per-unit') return null;
  return definition;
}

function floorsOf(definition: UnitDefinition): number {
  return definition.height.kind === 'fixed' ? definition.height.floors : 1;
}

function unitPrice(definition: UnitDefinition): number {
  return definition.cost.kind === 'per-unit' ? definition.cost.amount : 0;
}

/** C-01 and C-02 for the whole footprint. */
function footprintFor(definition: UnitDefinition, x: number, bottom: Level): Footprint | ErrorCode {
  const bottomError = levelError(bottom);
  if (bottomError) return bottomError;
  const x1 = x + definition.width - 1;
  if (!isColumn(x) || !isColumn(x1)) return 'OUT_OF_BOUNDS';

  const levels: Level[] = [bottom];
  let top = bottom;
  while (levels.length < floorsOf(definition)) {
    const next = levelAbove(top);
    if (next === null) return 'OUT_OF_BOUNDS';
    top = next;
    levels.push(top);
  }
  return { x0: x, x1, bottom, top, levels };
}

/** C-06, C-07, C-08 and C-24 to C-26, in that order. */
function zoneError(zone: PlacementZone, footprint: Footprint): ErrorCode | null {
  const { bottom, top, levels } = footprint;
  if (isBasement(bottom) && !isBasement(top)) return 'SPANS_GROUND';
  if (levels.includes(TOWER_LAYOUT.mainLobbyFloor)) return 'LOBBY_LEVEL_ONLY';

  switch (zone) {
    case 'above-ground':
      if (isBasement(bottom) || top > TOP_FLOOR_LEVEL) return 'ABOVE_GROUND_ONLY';
      break;
    case 'basement':
    case 'lowest-basement':
      if (!isBasement(bottom)) return 'BASEMENT_ONLY';
      break;
    case 'above-top-floor':
      return bottom === CATHEDRAL_BOTTOM_LEVEL ? null : 'CATHEDRAL_POSITION';
    case 'any':
    case 'lobby-floors':
      break;
  }
  if (top >= CATHEDRAL_BOTTOM_LEVEL) return 'CATHEDRAL_LEVEL_ONLY';
  return null;
}

/** C-10: every cell must be free and not lobby. */
function isFootprintFree(grid: GridState, footprint: Footprint): boolean {
  const { x0, x1 } = footprint;
  return footprint.levels.every(
    (level) =>
      isSpanFree(grid, level, x0, x1) &&
      columnsBetween(x0, x1).every((x) => structureAt(grid, level, x) !== 'lobby'),
  );
}

/** C-05: above ground the bottom row rests on structure, a basement unit hangs from its top row. */
function isFootprintSupported(grid: GridState, footprint: Footprint): boolean {
  const anchor = isBasement(footprint.bottom) ? footprint.top : footprint.bottom;
  return columnsBetween(footprint.x0, footprint.x1).every((x) => isSupported(grid, anchor, x));
}

/** C-11: bottom-row cells with no structure get floor with the unit. */
function autoFloorColumns(grid: GridState, footprint: Footprint): number[] {
  return columnsBetween(footprint.x0, footprint.x1).filter(
    (x) => !hasStructure(grid, footprint.bottom, x),
  );
}

export const buildUnit: CommandHandler<'buildUnit'> = (context, command) => {
  const { unitType, x, level } = command;
  const definition = placeableDefinition(unitType);
  if (!definition || !isInteger(x) || !isInteger(level)) {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const { state } = context;
  const balanceError = negativeBalanceError(state);
  if (balanceError) {
    return { ok: false, error: balanceError };
  }

  const lockError =
    starLockError(state, definition) ??
    bombLockError(state, definition) ??
    limitError(state, definition);
  if (lockError) {
    return { ok: false, error: lockError };
  }

  const footprint = footprintFor(definition, x, level);
  if (typeof footprint === 'string') {
    return { ok: false, error: footprint };
  }
  const zone = zoneError(definition.placement.zone, footprint);
  if (zone) {
    return { ok: false, error: zone };
  }
  const grid = state.grid;
  if (!isFootprintFree(grid, footprint)) {
    return { ok: false, error: 'CELL_OCCUPIED' };
  }
  if (!isFootprintSupported(grid, footprint)) {
    return { ok: false, error: 'NO_SUPPORT' };
  }

  const onEscalatorLevel = footprint.levels.some((row) => escalatorLevels(state).has(row));
  if (onEscalatorLevel && !isEscalatorUnit(definition.type)) {
    return { ok: false, error: 'ESCALATOR_FLOOR_TYPE' };
  }

  const newFloor = autoFloorColumns(grid, footprint);
  const cost = unitPrice(definition) + newFloor.length * pricePerCell('floor');
  const paymentError = payForConstruction(state, cost);
  if (paymentError) {
    return { ok: false, error: paymentError };
  }

  for (const run of columnRuns(newFloor)) {
    setStructure(grid, level, run.x0, run.x1, 'floor');
  }
  const id = `u${state.nextId}`;
  state.nextId += 1;
  for (const row of footprint.levels) {
    addOccupant(grid, row, footprint.x0, footprint.x1, { kind: 'unit', id });
  }
  state.units[id] = {
    ...newUnit(id, definition.type, x, level),
    paid: cost,
    placedAtStep: state.step,
  };
  if (definition.type === 'security') addPeopleForUnit(state, id);
  return { ok: true, cost, refund: 0, events: [] };
};
