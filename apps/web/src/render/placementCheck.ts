import {
  LAST_COLUMN,
  SHAFT_UNIT_TYPES,
  TOWER_LAYOUT,
  UNIT_CATALOG,
  isBasement,
  isColumn,
  isLevel,
  levelAbove,
  levelBelow,
  levelToIndex,
  stairsTooClose,
  type Level,
  type ShaftType,
  type UnitType,
} from '@tower-magnate/shared';

export type PlacementProblem =
  | 'OUT_OF_BOUNDS'
  | 'CELL_OCCUPIED'
  | 'NO_SUPPORT'
  | 'NO_FLOOR'
  | 'TRANSPORT_LANDING'
  | 'STAIRS_TOO_CLOSE';

export interface PlacedThing {
  type: UnitType;
  x: number;
  level: Level;
}

/** What the client knows about built cells: structure rows ('.', 'f', 'l'), units, and stairs or escalators. */
export interface PlacementWorld {
  structure: ReadonlyMap<Level, string>;
  units: Iterable<PlacedThing>;
  transports: Iterable<PlacedThing>;
  /** Elevator shafts, which block stairs and escalators. */
  shafts?: Iterable<PlacedShaft>;
  /** The player's cash; with it, a build the player cannot pay for shows as not placeable. */
  money?: number;
}

export interface PlacedShaft {
  type: ShaftType;
  x: number;
  bottom: Level;
  top: Level;
}

export interface PlacementCheck {
  x0: number;
  x1: number;
  /** Bottom level first. */
  levels: Level[];
  problem: PlacementProblem | null;
}

/** Tools that place one fixed-size thing with a click: units, stairs and escalators. */
export function isGhostTool(type: UnitType): boolean {
  const definition = UNIT_CATALOG[type];
  return (
    definition.height.kind === 'fixed' &&
    definition.category !== 'structure' &&
    definition.cost.kind === 'per-unit'
  );
}

function isTransportTool(type: UnitType): boolean {
  return type === 'stairs' || type === 'escalator';
}

export function footprintWidth(type: UnitType): number {
  return UNIT_CATALOG[type].width;
}

export function footprintFloors(type: UnitType): number {
  const height = UNIT_CATALOG[type].height;
  return height.kind === 'fixed' ? height.floors : 1;
}

/** The levels a footprint covers, bottom first, or null when it would run past the top of the grid. */
export function footprintLevels(type: UnitType, bottom: Level): Level[] | null {
  if (!isLevel(bottom)) {
    return null;
  }
  const levels = [bottom];
  while (levels.length < footprintFloors(type)) {
    const next = levelAbove(levels[levels.length - 1] ?? bottom);
    if (next === null) {
      return null;
    }
    levels.push(next);
  }
  return levels;
}

/**
 * The client-side part of the build checks: the footprint is inside the site,
 * its cells are free, and the row it rests on (or hangs from, in a basement)
 * has structure under every column. The server still decides.
 */
export function checkPlacement(
  type: UnitType,
  x: number,
  bottom: Level,
  world: PlacementWorld,
): PlacementCheck {
  // The world may hold one-shot iterators; read each of them once.
  world = {
    ...world,
    units: [...world.units],
    transports: [...world.transports],
    shafts: [...(world.shafts ?? [])],
  };
  const x0 = x;
  const x1 = x + footprintWidth(type) - 1;
  const levels = footprintLevels(type, bottom);
  if (levels === null || !isColumn(x0) || !isColumn(x1)) {
    return { x0, x1, levels: levels ?? [bottom], problem: 'OUT_OF_BOUNDS' };
  }
  const cells = new BuiltCells(world);
  if (isTransportTool(type)) {
    return checkTransport(type, x0, x1, bottom, levels, world, cells);
  }
  if (levels.some((level) => cells.hasOccupant(level, x0, x1))) {
    return { x0, x1, levels, problem: 'CELL_OCCUPIED' };
  }
  const anchor = isBasement(bottom) ? (levels[levels.length - 1] ?? bottom) : bottom;
  for (let column = x0; column <= x1; column += 1) {
    if (!cells.isSupported(anchor, column)) {
      return { x0, x1, levels, problem: 'NO_SUPPORT' };
    }
  }
  return { x0, x1, levels, problem: null };
}

/**
 * Stairs and escalators are in the front layer: they pass over units and lobby rows, but not over
 * another footprint or a shaft. They need floor under every column on both levels, and stairs keep
 * a gap from other stairs on the same level. This mirrors the server's checks.
 */
function checkTransport(
  type: UnitType,
  x0: number,
  x1: number,
  bottom: Level,
  levels: Level[],
  world: PlacementWorld,
  cells: BuiltCells,
): PlacementCheck {
  const result = (problem: PlacementProblem | null): PlacementCheck => ({
    x0,
    x1,
    levels,
    problem,
  });
  const landing = levelAbove(bottom);
  if (landing === null) {
    return result('OUT_OF_BOUNDS');
  }
  const shafts = [...(world.shafts ?? [])];
  if (cells.hasOccupant(bottom, x0, x1, true) || shaftsCover(shafts, bottom, x0, x1)) {
    return result('CELL_OCCUPIED');
  }
  if (!cells.hasFloor(bottom, x0, x1)) {
    return result('NO_FLOOR');
  }
  if (!cells.hasFloor(landing, x0, x1) || shaftsCover(shafts, landing, x0, x1)) {
    return result('TRANSPORT_LANDING');
  }
  if (type === 'stairs') {
    const stairs = [...world.transports].filter((other) => other.type === 'stairs');
    if (stairsTooClose(stairs, x0, footprintWidth(type), bottom)) {
      return result('STAIRS_TOO_CLOSE');
    }
  }
  return result(null);
}

function shaftsCover(
  shafts: readonly PlacedShaft[],
  level: Level,
  x0: number,
  x1: number,
): boolean {
  const index = levelToIndex(level);
  return shafts.some((shaft) => {
    const width = UNIT_CATALOG[SHAFT_UNIT_TYPES[shaft.type]].width;
    return (
      shaft.x <= x1 &&
      shaft.x + width - 1 >= x0 &&
      index >= levelToIndex(shaft.bottom) &&
      index <= levelToIndex(shaft.top)
    );
  });
}

/** The unit or stairs covering a cell, if any. */
export function thingAt(world: PlacementWorld, x: number, level: Level): PlacedThing | null {
  for (const thing of world.units) {
    if (covers(thing, x, level)) {
      return thing;
    }
  }
  for (const thing of world.transports) {
    if (covers(thing, x, level)) {
      return thing;
    }
  }
  return null;
}

/** The unit covering a cell, if any. Stairs and escalators are not units. */
export function unitAt<T extends PlacedThing>(
  units: Iterable<T>,
  x: number,
  level: Level,
): T | null {
  for (const unit of units) {
    if (covers(unit, x, level)) {
      return unit;
    }
  }
  return null;
}

function coveredLevels(thing: PlacedThing): Level[] {
  return footprintLevels(thing.type, thing.level) ?? [thing.level];
}

function covers(thing: PlacedThing, x: number, level: Level): boolean {
  return (
    x >= thing.x && x < thing.x + footprintWidth(thing.type) && coveredLevels(thing).includes(level)
  );
}

/** Looks cells up by level so a check does not scan every unit for every cell. */
class BuiltCells {
  private readonly byLevel = new Map<Level, PlacedThing[]>();

  constructor(private readonly world: PlacementWorld) {
    for (const thing of world.units) {
      this.add(thing);
    }
    for (const thing of world.transports) {
      this.add(thing);
    }
  }

  /** With `frontLayer` only a stair or escalator counts: units and lobby rows are passed over. */
  hasOccupant(level: Level, x0: number, x1: number, frontLayer = false): boolean {
    for (let x = x0; x <= x1; x += 1) {
      if (frontLayer) {
        if (this.transportAt(level, x)) {
          return true;
        }
      } else if (this.structureAt(level, x) === 'l' || this.unitOnlyAt(level, x)) {
        return true;
      }
    }
    return false;
  }

  /** Structure on every column of the span. */
  hasFloor(level: Level, x0: number, x1: number): boolean {
    for (let x = x0; x <= x1; x += 1) {
      if (this.structureAt(level, x) === '.') {
        return false;
      }
    }
    return true;
  }

  isSupported(level: Level, x: number): boolean {
    if (level === TOWER_LAYOUT.mainLobbyFloor) {
      return true;
    }
    const neighbour = level > 0 ? levelBelow(level) : levelAbove(level);
    return neighbour !== null && this.hasStructure(neighbour, x);
  }

  private hasStructure(level: Level, x: number): boolean {
    return this.structureAt(level, x) !== '.' || this.thingAt(level, x);
  }

  private structureAt(level: Level, x: number): string {
    if (x < 0 || x > LAST_COLUMN) {
      return '.';
    }
    return this.world.structure.get(level)?.charAt(x) || '.';
  }

  private transportAt(level: Level, x: number): boolean {
    return (
      this.byLevel
        .get(level)
        ?.some((thing) => isTransportTool(thing.type) && covers(thing, x, level)) ?? false
    );
  }

  /** A unit in the back layer; stairs and escalators pass over it. */
  private unitOnlyAt(level: Level, x: number): boolean {
    return (
      this.byLevel
        .get(level)
        ?.some((thing) => !isTransportTool(thing.type) && covers(thing, x, level)) ?? false
    );
  }

  private thingAt(level: Level, x: number): boolean {
    return this.byLevel.get(level)?.some((thing) => covers(thing, x, level)) ?? false;
  }

  private add(thing: PlacedThing): void {
    for (const level of coveredLevels(thing)) {
      const row = this.byLevel.get(level);
      if (row === undefined) {
        this.byLevel.set(level, [thing]);
      } else {
        row.push(thing);
      }
    }
  }
}
