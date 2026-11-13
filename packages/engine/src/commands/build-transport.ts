import {
  isColumn,
  levelAbove,
  stairsTooClose,
  TOWER_LIMITS,
  TransportTypeSchema,
  UNIT_CATALOG,
  type ColumnSpan,
  type ErrorCode,
  type GridState,
  type Level,
  type OccupantRef,
  type TowerState,
} from '@tower-magnate/shared';
import {
  addOccupant,
  isOverlay,
  levelError,
  overlappingOccupants,
  removeOccupant,
  structureAt,
} from '../grid';
import type { CommandHandler } from '../step';
import { isEscalatorFloor } from './escalator-floors';
import { columnsBetween, isInteger, negativeBalanceError, payForConstruction } from './structure';

function isTransportPart(occupant: OccupantRef, part: 'footprint' | 'landing'): boolean {
  return occupant.kind === 'transport' && occupant.part === part;
}

function hasStructureAcross(grid: GridState, level: Level, x0: number, x1: number): boolean {
  return columnsBetween(x0, x1).every((x) => structureAt(grid, level, x) !== null);
}

/**
 * C-28: floor, lobby, a unit or ruins. Stairs and escalators pass over the back layer. The landing
 * of another transport can be stepped onto and built over. Another footprint or a shaft blocks it.
 */
function footprintError(grid: GridState, level: Level, x0: number, x1: number): ErrorCode | null {
  const blocked = overlappingOccupants(grid, level, x0, x1).some(
    (span) => isOverlay(span.occupant) && !isTransportPart(span.occupant, 'landing'),
  );
  if (blocked) return 'CELL_OCCUPIED';
  return hasStructureAcross(grid, level, x0, x1) ? null : 'NO_FLOOR';
}

/** C-29: structure on every landing cell, each free, in the back layer or the footprint of another transport. */
function landingError(grid: GridState, level: Level, x0: number, x1: number): ErrorCode | null {
  const clear = overlappingOccupants(grid, level, x0, x1).every(
    (span) => !isOverlay(span.occupant) || isTransportPart(span.occupant, 'footprint'),
  );
  return clear && hasStructureAcross(grid, level, x0, x1) ? null : 'TRANSPORT_LANDING';
}

/** Footprint cells that were another transport's landing now belong to this footprint. */
function claimLandingCells(grid: GridState, level: Level, x0: number, x1: number): void {
  const claimed = overlappingOccupants(grid, level, x0, x1)
    .filter((span) => isTransportPart(span.occupant, 'landing'))
    .map((span) => span.occupant);
  for (const occupant of claimed) {
    const pieces = (grid.levels[level]?.occupants ?? []).filter(
      (span) =>
        span.occupant.kind === 'transport' &&
        occupant.kind === 'transport' &&
        span.occupant.id === occupant.id &&
        span.occupant.part === 'landing',
    );
    removeOccupant(grid, level, occupant);
    for (const piece of pieces) {
      if (piece.x0 < x0) addOccupant(grid, level, piece.x0, Math.min(piece.x1, x0 - 1), occupant);
      if (piece.x1 > x1) addOccupant(grid, level, Math.max(piece.x0, x1 + 1), piece.x1, occupant);
    }
  }
}

/** The landing cells that are not already the footprint of another transport. */
function freeLandingRuns(grid: GridState, level: Level, x0: number, x1: number): ColumnSpan[] {
  const taken = new Set(
    overlappingOccupants(grid, level, x0, x1)
      .filter((span) => isOverlay(span.occupant))
      .flatMap((span) => columnsBetween(Math.max(span.x0, x0), Math.min(span.x1, x1))),
  );
  const runs: ColumnSpan[] = [];
  for (const x of columnsBetween(x0, x1)) {
    if (taken.has(x)) continue;
    const last = runs.at(-1);
    if (last && last.x1 + 1 === x) last.x1 = x;
    else runs.push({ x0: x, x1: x });
  }
  return runs;
}

function boundsError(level: number, x0: number, x1: number): ErrorCode | null {
  const error = levelError(level);
  if (error) return error;
  return isColumn(x0) && isColumn(x1) && levelAbove(level) !== null ? null : 'OUT_OF_BOUNDS';
}

function isLimitReached(state: TowerState): boolean {
  return Object.keys(state.transports).length >= TOWER_LIMITS['stairs-and-escalators'];
}

export const buildTransport: CommandHandler<'buildTransport'> = (context, command) => {
  const { transportType, x, level } = command;
  const parsedType = TransportTypeSchema.safeParse(transportType);
  if (!parsedType.success || !isInteger(x) || !isInteger(level)) {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const { state } = context;
  const balanceError = negativeBalanceError(state);
  if (balanceError) return { ok: false, error: balanceError };
  if (isLimitReached(state)) return { ok: false, error: 'LIMIT_REACHED' };

  const definition = UNIT_CATALOG[parsedType.data];
  const x1 = x + definition.width - 1;
  const outOfBounds = boundsError(level, x, x1);
  if (outOfBounds) return { ok: false, error: outOfBounds };

  const grid = state.grid;
  const landingLevel = levelAbove(level) as Level;
  const checks = [footprintError(grid, level, x, x1), landingError(grid, landingLevel, x, x1)];
  const placementError = checks.find((error) => error !== null);
  if (placementError) return { ok: false, error: placementError };
  const nearStairs =
    parsedType.data === 'stairs' &&
    stairsTooClose(
      Object.values(state.transports).filter((other) => other.type === 'stairs'),
      x,
      definition.width,
      level,
    );
  if (nearStairs) return { ok: false, error: 'STAIRS_TOO_CLOSE' };
  const onEscalatorFloors = isEscalatorFloor(state, level) && isEscalatorFloor(state, landingLevel);
  if (parsedType.data === 'escalator' && !onEscalatorFloors) {
    return { ok: false, error: 'ESCALATOR_FLOOR_TYPE' };
  }

  const cost = definition.cost.kind === 'per-unit' ? definition.cost.amount : 0;
  const paymentError = payForConstruction(state, cost);
  if (paymentError) return { ok: false, error: paymentError };

  const id = `t${state.nextId}`;
  state.nextId += 1;
  claimLandingCells(grid, level, x, x1);
  addOccupant(grid, level, x, x1, { kind: 'transport', id, part: 'footprint' });
  for (const run of freeLandingRuns(grid, landingLevel, x, x1)) {
    addOccupant(grid, landingLevel, run.x0, run.x1, { kind: 'transport', id, part: 'landing' });
  }
  state.transports[id] = {
    id,
    type: parsedType.data,
    x,
    level,
    paid: cost,
    placedAtStep: state.step,
  };
  return { ok: true, cost, refund: 0, events: [] };
};
