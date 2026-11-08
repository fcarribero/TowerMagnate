import {
  levelAbove,
  levelBelow,
  TOWER_LAYOUT,
  UNIT_CATALOG,
  type DemolishTarget,
  type ErrorCode,
  type GridState,
  type Level,
  type LobbyHeight,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import {
  clearRuinsAt,
  clearStructure,
  occupantAt,
  removeOccupant,
  setStructure,
  structureAt,
} from '../grid';
import { chargeMoney } from '../money';
import { removePeopleOfUnit, setDueStep, parsePersonId } from '../people';
import type { CommandHandler, CommandOutcome } from '../step';
import { heightOnLevel, lobbyRows, SKY_LOBBY_LEVELS } from './build-lobby';
import {
  columnRuns,
  columnsBetween,
  hasStructure,
  isInteger,
  refundConstruction,
} from './structure';

type Rejection = { ok: false; error: ErrorCode };
type Plan = Rejection | { ok: true; apply: () => number };

const NOTHING: Rejection = { ok: false, error: 'NOTHING_TO_DEMOLISH' };

function reject(error: ErrorCode): Rejection {
  return { ok: false, error };
}

function isMainLobbyRow(grid: GridState, level: Level, x: number): boolean {
  const height = grid.mainLobbyHeight;
  if (height === null || structureAt(grid, level, x) !== 'lobby') return false;
  return lobbyRows(TOWER_LAYOUT.mainLobbyFloor, height).includes(level);
}

export function unitLevels(unit: Unit): Level[] {
  const definition = UNIT_CATALOG[unit.type];
  const floors = definition.height.kind === 'fixed' ? definition.height.floors : 1;
  const levels: Level[] = [unit.level];
  while (levels.length < floors) {
    const next = levelAbove(levels[levels.length - 1] as Level);
    if (next === null) break;
    levels.push(next);
  }
  return levels;
}

/** C-46: parking ramps stack downward from S1, and only the lowest one can go. */
function isLowestRamp(state: TowerState, unit: Unit): boolean {
  return !Object.values(state.units).some(
    (other) => other.type === 'parking-ramp' && other.level < unit.level,
  );
}

function planUnit(state: TowerState, unitId: string): Plan {
  const unit = Object.hasOwn(state.units, unitId) ? state.units[unitId] : undefined;
  if (!unit) return NOTHING;
  if (unit.type === 'parking-ramp' && !isLowestRamp(state, unit)) return reject('RAMP_POSITION');

  return {
    ok: true,
    apply() {
      const width = UNIT_CATALOG[unit.type].width;
      const x1 = unit.x + width - 1;
      if (unit.sale) chargeMoney(state, 'condoBuybacks', unit.sale.price);
      removePeopleOfUnit(state, unit.id);
      for (const level of unitLevels(unit)) {
        removeOccupant(state.grid, level, { kind: 'unit', id: unit.id });
        setStructure(state.grid, level, unit.x, x1, 'floor');
      }
      Reflect.deleteProperty(state.units, unit.id);
      return refundConstruction(state, unit);
    },
  };
}

function planTransport(state: TowerState, transportId: string): Plan {
  const transport = Object.hasOwn(state.transports, transportId)
    ? state.transports[transportId]
    : undefined;
  if (!transport) return NOTHING;

  return {
    ok: true,
    apply() {
      const landingLevel = levelAbove(transport.level);
      removeOccupant(state.grid, transport.level, {
        kind: 'transport',
        id: transport.id,
        part: 'footprint',
      });
      if (landingLevel !== null) {
        removeOccupant(state.grid, landingLevel, {
          kind: 'transport',
          id: transport.id,
          part: 'landing',
        });
      }
      Reflect.deleteProperty(state.transports, transport.id);
      return 0;
    },
  };
}

function planShaft(state: TowerState, shaftId: string): Plan {
  const shaft = Object.hasOwn(state.shafts, shaftId) ? state.shafts[shaftId] : undefined;
  if (!shaft) return NOTHING;
  if (shaft.cars.some((car) => car.riders.length > 0)) return reject('SHAFT_IN_USE');

  return {
    ok: true,
    apply() {
      const waiting = Object.values(shaft.queues).flatMap((stop) => [...stop.up, ...stop.down]);
      for (let level: Level | null = shaft.bottom; level !== null && level <= shaft.top;) {
        removeOccupant(state.grid, level, { kind: 'shaft', id: shaft.id });
        level = levelAbove(level);
      }
      Reflect.deleteProperty(state.shafts, shaft.id);
      for (const entry of waiting) {
        const personId = parsePersonId(entry.person);
        if (personId !== null) setDueStep(state.people, personId, state.step + 1);
      }
      const cars = shaft.cars.map((car) => refundConstruction(state, car));
      return refundConstruction(state, shaft) + cars.reduce((sum, amount) => sum + amount, 0);
    },
  };
}

/** C-61: above ground the cell above rests on this one; in a basement the cell below hangs from it. */
function restsOnFloor(grid: GridState, level: Level, x: number): boolean {
  const dependent = level > 0 ? levelAbove(level) : levelBelow(level);
  return dependent !== null && hasStructure(grid, dependent, x);
}

function planFloor(state: TowerState, level: Level, x0: number, x1: number): Plan {
  const grid = state.grid;
  const all = columnsBetween(x0, x1);
  if (all.some((x) => isMainLobbyRow(grid, level, x))) return reject('MAIN_LOBBY_PROTECTED');
  const floorColumns = all.filter((x) => structureAt(grid, level, x) === 'floor');
  if (floorColumns.length === 0) return NOTHING;
  if (floorColumns.some((x) => occupantAt(grid, level, x) !== null)) return reject('CELL_OCCUPIED');
  if (floorColumns.some((x) => restsOnFloor(grid, level, x))) return reject('SUPPORTS_STRUCTURE');

  return {
    ok: true,
    apply() {
      for (const run of columnRuns(floorColumns)) clearStructure(grid, level, run.x0, run.x1);
      return 0;
    },
  };
}

function baseLevelOfLobby(
  grid: GridState,
  level: Level,
): { base: Level; height: LobbyHeight } | null {
  for (const base of SKY_LOBBY_LEVELS) {
    const height = heightOnLevel(grid, base);
    if (height !== null && lobbyRows(base, height).includes(level)) return { base, height };
  }
  return null;
}

/** C-21 and 8.3: the main lobby is protected; sky lobby columns turn into floor on every row. */
function planLobby(state: TowerState, level: Level, x0: number, x1: number): Plan {
  const grid = state.grid;
  const lobbyColumns = columnsBetween(x0, x1).filter(
    (x) => structureAt(grid, level, x) === 'lobby',
  );
  if (lobbyColumns.length === 0) return NOTHING;
  if (lobbyColumns.some((x) => isMainLobbyRow(grid, level, x)))
    return reject('MAIN_LOBBY_PROTECTED');
  const sky = baseLevelOfLobby(grid, level);
  if (!sky) return NOTHING;

  return {
    ok: true,
    apply() {
      for (const row of lobbyRows(sky.base, sky.height)) {
        for (const run of columnRuns(lobbyColumns))
          setStructure(grid, row, run.x0, run.x1, 'floor');
      }
      return 0;
    },
  };
}

function planRuins(state: TowerState, level: Level, x: number): Plan {
  if (occupantAt(state.grid, level, x)?.kind !== 'ruins') return NOTHING;
  return {
    ok: true,
    apply() {
      clearRuinsAt(state.grid, level, x);
      return 0;
    },
  };
}

function planTarget(state: TowerState, target: DemolishTarget): Plan {
  switch (target.kind) {
    case 'unit':
      return planUnit(state, target.id);
    case 'transport':
      return planTransport(state, target.id);
    case 'shaft':
      return planShaft(state, target.id);
    case 'floor':
      return planFloor(state, target.level, target.x0, target.x1);
    case 'lobby':
      return planLobby(state, target.level, target.x0, target.x1);
    case 'ruins':
      return planRuins(state, target.level, target.x);
  }
}

function isWellFormed(target: DemolishTarget): boolean {
  switch (target.kind) {
    case 'unit':
    case 'transport':
    case 'shaft':
      return typeof target.id === 'string';
    case 'floor':
    case 'lobby':
      return (
        isInteger(target.level) &&
        isInteger(target.x0) &&
        isInteger(target.x1) &&
        target.x0 <= target.x1
      );
    case 'ruins':
      return isInteger(target.level) && isInteger(target.x);
    default:
      return false;
  }
}

/** Section 8.3 to 8.5. Every check runs before anything changes, so a rejection leaves the tower as it was. */
export const demolish: CommandHandler<'demolish'> = (context, command) => {
  const target = command.target as DemolishTarget | undefined;
  if (!target || typeof target !== 'object' || !isWellFormed(target)) {
    return reject('INVALID_COMMAND');
  }
  const plan = planTarget(context.state, target);
  if (!plan.ok) return plan;
  const refund = plan.apply();
  const outcome: CommandOutcome = { ok: true, cost: 0, refund, events: [] };
  return outcome;
};
