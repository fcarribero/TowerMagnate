import {
  LAST_COLUMN,
  TOWER_LAYOUT,
  UNIT_CATALOG,
  isBasement,
  isColumn,
  isLevel,
  levelAbove,
  levelBelow,
  type Level,
  type UnitType,
} from '@tower-magnate/shared';

export type PlacementProblem = 'OUT_OF_BOUNDS' | 'CELL_OCCUPIED' | 'NO_SUPPORT';

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
  const x0 = x;
  const x1 = x + footprintWidth(type) - 1;
  const levels = footprintLevels(type, bottom);
  if (levels === null || !isColumn(x0) || !isColumn(x1)) {
    return { x0, x1, levels: levels ?? [bottom], problem: 'OUT_OF_BOUNDS' };
  }
  const cells = new BuiltCells(world);
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

  hasOccupant(level: Level, x0: number, x1: number): boolean {
    for (let x = x0; x <= x1; x += 1) {
      if (this.structureAt(level, x) === 'l' || this.thingAt(level, x)) {
        return true;
      }
    }
    return false;
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
