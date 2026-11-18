import {
  DEMOLITION_INDEMNITY_WEEKS,
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
import { siteProgress } from '../construction';
import { chargeMoney, creditMoney } from '../money';
import { removePeopleOfUnit, setDueStep, parsePersonId } from '../people';
import { sendToStreet } from '../trek';
import type { CommandHandler, CommandOutcome } from '../step';
import { heightOnLevel, lobbyRows, SKY_LOBBY_LEVELS } from './build-lobby';
import {
  columnRuns,
  columnsBetween,
  hasStructure,
  isInteger,
  refundConstruction,
  refundFloor,
  refundLobby,
} from './structure';
import { clearUnitLedger } from '../unit-evaluation';

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

export function unitLevels(unit: Pick<Unit, 'type' | 'level'>): Level[] {
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

/**
 * What demolishing these units costs in indemnities: each rented office or shop owes its tenant
 * the rent locked in the lease for DEMOLITION_INDEMNITY_WEEKS week. Like a condo buyback it is
 * charged in full even into a negative balance. Unknown ids and unrented units cost nothing.
 */
export function demolitionIndemnity(state: TowerState, unitIds: readonly string[]): number {
  let total = 0;
  for (const id of new Set(unitIds)) {
    const unit = Object.hasOwn(state.units, id) ? state.units[id] : undefined;
    if (unit?.lease) total += unit.lease.rent * DEMOLITION_INDEMNITY_WEEKS;
  }
  return total;
}

/** C-46: parking ramps stack downward from S1, and only the lowest one can go. */
function isLowestRamp(state: TowerState, unit: Unit): boolean {
  return !Object.values(state.units).some(
    (other) => other.type === 'parking-ramp' && other.level < unit.level,
  );
}

/** A site that has had no work yet is paid back in full; one that has is paid back for what is left. */
function planSite(state: TowerState, siteId: string): Plan {
  const site = Object.hasOwn(state.sites, siteId) ? state.sites[siteId] : undefined;
  if (!site) return NOTHING;
  return {
    ok: true,
    apply() {
      const x1 = site.x + UNIT_CATALOG[site.type].width - 1;
      for (const level of unitLevels(site)) {
        removeOccupant(state.grid, level, { kind: 'unit', id: site.id });
        setStructure(state.grid, level, site.x, x1, 'floor');
      }
      Reflect.deleteProperty(state.sites, site.id);
      const left = 1 - siteProgress(site);
      const refund = Math.floor(site.paid * left);
      return refund > 0 ? creditMoney(state, 'construction', refund) : 0;
    },
  };
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
      const indemnity = demolitionIndemnity(state, [unit.id]);
      if (indemnity > 0) chargeMoney(state, 'rent', indemnity);
      // An obrador's crew is not sent away at once: with the obrador gone they walk out (construction.ts).
      if (unit.type !== 'obrador') removePeopleOfUnit(state, unit.id);
      for (const level of unitLevels(unit)) {
        removeOccupant(state.grid, level, { kind: 'unit', id: unit.id });
        setStructure(state.grid, level, unit.x, x1, 'floor');
      }
      Reflect.deleteProperty(state.units, unit.id);
      clearUnitLedger(state, unit.id);
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
      return refundConstruction(state, transport);
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

/**
 * Walls and units are never demolished together: a floor run that covers units removes only those
 * units (and their sites) and leaves the floor as it is. Anything else standing in the span (a shaft,
 * a transport, ruins) still refuses the run. Null when the span holds no unit.
 */
function planUnitsInSpan(state: TowerState, level: Level, columns: readonly number[]): Plan | null {
  const ids: string[] = [];
  let blocked = false;
  for (const x of columns) {
    const occupant = occupantAt(state.grid, level, x);
    if (occupant === null) continue;
    if (occupant.kind === 'unit') {
      if (!ids.includes(occupant.id)) ids.push(occupant.id);
    } else {
      blocked = true;
    }
  }
  if (ids.length === 0) return null;
  if (blocked) return reject('CELL_OCCUPIED');
  const plans: Plan[] = [];
  for (const id of ids) {
    const plan = Object.hasOwn(state.sites, id) ? planSite(state, id) : planUnit(state, id);
    if (!plan.ok) return plan;
    plans.push(plan);
  }
  return {
    ok: true,
    apply() {
      let refund = 0;
      for (const plan of plans) if (plan.ok) refund += plan.apply();
      return refund;
    },
  };
}

function planFloor(state: TowerState, level: Level, x0: number, x1: number): Plan {
  const grid = state.grid;
  const all = columnsBetween(x0, x1);
  if (all.some((x) => isMainLobbyRow(grid, level, x))) return reject('MAIN_LOBBY_PROTECTED');
  const unitPlan = planUnitsInSpan(state, level, all);
  if (unitPlan !== null) return unitPlan;
  const floorColumns = all.filter((x) => structureAt(grid, level, x) === 'floor');
  if (floorColumns.length === 0) return NOTHING;
  if (floorColumns.some((x) => occupantAt(grid, level, x) !== null)) return reject('CELL_OCCUPIED');
  if (floorColumns.some((x) => restsOnFloor(grid, level, x))) return reject('SUPPORTS_STRUCTURE');

  return {
    ok: true,
    apply() {
      for (const run of columnRuns(floorColumns)) clearStructure(grid, level, run.x0, run.x1);
      return refundFloor(state, level, floorColumns);
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

/**
 * The main lobby can go when nothing is built above it in the columns removed, and only from
 * the ends of its run, so it is never split. Its columns become empty ground.
 */
function planMainLobby(state: TowerState, columns: readonly number[]): Plan {
  const grid = state.grid;
  const height = grid.mainLobbyHeight as LobbyHeight;
  const rows = lobbyRows(TOWER_LAYOUT.mainLobbyFloor, height);
  const first = rows[0] as Level;
  const isLobby = (x: number) => structureAt(grid, first, x) === 'lobby';
  const sorted = [...columns].sort((a, b) => a - b);
  const left = sorted[0] as number;
  const right = sorted[sorted.length - 1] as number;
  let runStart = left;
  while (isLobby(runStart - 1)) runStart -= 1;
  let runEnd = right;
  while (isLobby(runEnd + 1)) runEnd += 1;
  const contiguous = sorted.every(
    (x, index) => index === 0 || x === (sorted[index - 1] as number) + 1,
  );
  if (!contiguous || (left !== runStart && right !== runEnd)) return reject('MAIN_LOBBY_INNER');
  let above: Level | null = levelAbove(rows[rows.length - 1] as Level);
  for (; above !== null; above = levelAbove(above)) {
    for (const x of sorted) {
      if (structureAt(grid, above, x) !== null || occupantAt(grid, above, x) !== null) {
        return reject('MAIN_LOBBY_COVERED');
      }
    }
  }
  for (const row of rows) {
    if (sorted.some((x) => occupantAt(grid, row, x) !== null)) return reject('CELL_OCCUPIED');
  }

  return {
    ok: true,
    apply() {
      for (const row of rows) {
        for (const run of columnRuns(sorted)) clearStructure(grid, row, run.x0, run.x1);
      }
      sendPeopleToStreet(state, first, sorted);
      const stillThere = (grid.levels[first]?.structure ?? []).some(
        (span) => span.kind === 'lobby',
      );
      if (!stillThere) grid.mainLobbyHeight = null;
      return refundLobby(state, TOWER_LAYOUT.mainLobbyFloor, sorted);
    },
  };
}

/** People standing on demolished lobby cells are outside now: they come back in from the edge of the map. */
function sendPeopleToStreet(state: TowerState, level: Level, columns: readonly number[]): void {
  const pool = state.people;
  const first = columns[0] as number;
  const last = columns[columns.length - 1] as number;
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (pool.level[slot] !== level) continue;
    const column = pool.column[slot] as number;
    if (column >= first && column <= last) sendToStreet(state, slot);
  }
}

/** C-21 and 8.3: the main lobby goes only from its ends with nothing above it (planMainLobby); sky lobby columns turn into floor on every row. */
function planLobby(state: TowerState, level: Level, x0: number, x1: number): Plan {
  const grid = state.grid;
  const lobbyColumns = columnsBetween(x0, x1).filter(
    (x) => structureAt(grid, level, x) === 'lobby',
  );
  if (lobbyColumns.length === 0) return NOTHING;
  if (lobbyColumns.some((x) => isMainLobbyRow(grid, level, x))) {
    return planMainLobby(state, lobbyColumns);
  }
  const sky = baseLevelOfLobby(grid, level);
  if (!sky) return NOTHING;

  return {
    ok: true,
    apply() {
      for (const row of lobbyRows(sky.base, sky.height)) {
        for (const run of columnRuns(lobbyColumns))
          setStructure(grid, row, run.x0, run.x1, 'floor');
      }
      return refundLobby(state, sky.base, lobbyColumns);
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
      return Object.hasOwn(state.sites, target.id)
        ? planSite(state, target.id)
        : planUnit(state, target.id);
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
