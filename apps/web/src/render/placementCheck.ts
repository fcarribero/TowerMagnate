import {
  CATHEDRAL_BOTTOM_LEVEL,
  LAST_COLUMN,
  LOWEST_BUILDABLE_LEVEL,
  LOWEST_LEVEL,
  SHAFT_UNIT_TYPES,
  TOP_FLOOR_LEVEL,
  TOWER_LAYOUT,
  TOWER_LIMITS,
  UNIT_CATALOG,
  indexToLevel,
  isBasement,
  isColumn,
  isLevel,
  levelAbove,
  levelBelow,
  levelToIndex,
  stairsTooClose,
  type ErrorCode,
  type Level,
  type LobbyHeight,
  type PlacementZone,
  type ShaftType,
  type UnitType,
} from '@tower-magnate/shared';

/** The same codes the server answers with, so a red ghost says what the refusal would say. */
export type PlacementProblem = ErrorCode;

export interface PlacedThing {
  type: UnitType;
  x: number;
  level: Level;
  /** Percent built while the unit is a construction site; sites hold cells but are not units yet. */
  construction?: number;
}

/** What the client knows about built cells: structure rows ('.', 'f', 'l', 'r'), units, and stairs or escalators. */
export interface PlacementWorld {
  structure: ReadonlyMap<Level, string>;
  units: Iterable<PlacedThing>;
  transports: Iterable<PlacedThing>;
  /** Elevator shafts, which block stairs and escalators. */
  shafts?: Iterable<PlacedShaft>;
  /** The player's cash; with it, a build the player cannot pay for shows as not placeable. */
  money?: number;
  /** The tower's star rating, for the unlock check. */
  stars?: number;
  /** True while a bomb threat or a bomb disaster is active. */
  bombActive?: boolean;
  /** The height of the main lobby, null when none stands. */
  mainLobbyHeight?: LobbyHeight | null;
  /** The height fixed on each sky lobby level that was ever built, by level. */
  skyLobbyHeights?: Readonly<Record<string, LobbyHeight>>;
  /** Elevator cars, to know whether a resize would strand riders. */
  cars?: Iterable<PlacedCar>;
}

export interface PlacedShaft {
  type: ShaftType;
  x: number;
  bottom: Level;
  top: Level;
  id?: string;
}

export interface PlacedCar {
  shaftId: string;
  /** Dense level index, as the car views carry it. */
  position: number;
  load: number;
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

const MAX_RAMPS = 9;
const SKY_LOBBY_LEVELS: readonly number[] = TOWER_LAYOUT.skyLobbyFloors;
/** C-39: columns that must stay free of other shafts between two shafts sharing a level. */
const MIN_SHAFT_GAP = 8;

function priceOf(type: UnitType): number {
  const { cost } = UNIT_CATALOG[type];
  return cost.kind === 'per-unit' || cost.kind === 'per-cell' ? cost.amount : 0;
}

function columnsOf(x0: number, x1: number): number[] {
  const columns: number[] = [];
  for (let x = x0; x <= x1; x += 1) {
    columns.push(x);
  }
  return columns;
}

/** Levels from `bottom` to `top`, skipping level 0. */
function levelsBetween(bottom: Level, top: Level): Level[] {
  const levels: Level[] = [];
  for (
    let level: Level | null = bottom;
    level !== null && level <= top;
    level = levelAbove(level)
  ) {
    levels.push(level);
  }
  return levels;
}

/** The engine's levelError: the tunnel level is reserved, anything off the grid is out of bounds. */
function levelProblem(level: number): ErrorCode | null {
  if (level === LOWEST_LEVEL) {
    return 'LEVEL_RESERVED';
  }
  return isLevel(level) ? null : 'OUT_OF_BOUNDS';
}

/** The engine's spanError for a run of cells on one level. */
function spanProblem(level: number, x0: number, x1: number): ErrorCode | null {
  return levelProblem(level) ?? (isColumn(x0) && isColumn(x1) ? null : 'OUT_OF_BOUNDS');
}

/**
 * The client side of every build check, in the order the server runs them, so GREEN means the
 * click will build and RED means it will not. `problem` is the server's own error code.
 * Units, stairs and escalators are checked here; floor, lobby and shafts have functions below.
 */
export function checkPlacement(
  type: UnitType,
  x: number,
  bottom: Level,
  world: PlacementWorld,
): PlacementCheck {
  const view = new WorldView(world);
  const x0 = x;
  const x1 = x + footprintWidth(type) - 1;
  const levels = footprintLevels(type, bottom);
  return {
    x0,
    x1,
    levels: levels ?? [bottom],
    problem: isTransportTool(type)
      ? transportProblem(type, x0, x1, bottom, view)
      : unitProblem(type, x0, x1, bottom, levels, view),
  };
}

function unitProblem(
  type: UnitType,
  x0: number,
  x1: number,
  bottom: Level,
  levels: Level[] | null,
  view: WorldView,
): ErrorCode | null {
  const definition = UNIT_CATALOG[type];
  if (view.money < 0) {
    return 'NEGATIVE_BALANCE';
  }
  if (view.stars < definition.unlockStars) {
    return 'STAR_LOCKED';
  }
  if (type === 'security' && view.bombActive) {
    return 'BOMB_EVENT_ACTIVE';
  }
  if (view.limitReached(type)) {
    return 'LIMIT_REACHED';
  }
  const bounds = levelProblem(bottom);
  if (bounds) {
    return bounds;
  }
  if (levels === null || !isColumn(x0) || !isColumn(x1)) {
    return 'OUT_OF_BOUNDS';
  }
  const top = levels[levels.length - 1] ?? bottom;
  const zone = zoneProblem(definition.placement.zone, bottom, top, levels);
  if (zone) {
    return zone;
  }
  if (levels.some((level) => view.backOccupied(level, x0, x1) || view.hasLobby(level, x0, x1))) {
    return 'CELL_OCCUPIED';
  }
  const anchor = isBasement(bottom) ? top : bottom;
  if (!columnsOf(x0, x1).every((column) => view.isSupported(anchor, column))) {
    return 'NO_SUPPORT';
  }
  const rule = basementRuleProblem(type, x0, bottom, view);
  if (rule) {
    return rule;
  }
  const newFloor = columnsOf(x0, x1).filter((column) => !view.hasStructure(bottom, column));
  return view.fundsProblem(priceOf(type) + newFloor.length * priceOf('floor'));
}

/** C-50 first, then C-06, C-07, C-08 and C-24 to C-26, as the server orders them. */
function zoneProblem(
  zone: PlacementZone,
  bottom: Level,
  top: Level,
  levels: readonly Level[],
): ErrorCode | null {
  if (zone === 'lowest-basement') {
    return bottom === LOWEST_BUILDABLE_LEVEL ? null : 'SUBWAY_POSITION';
  }
  if (isBasement(bottom) && !isBasement(top)) {
    return 'SPANS_GROUND';
  }
  if (levels.includes(TOWER_LAYOUT.mainLobbyFloor)) {
    return 'LOBBY_LEVEL_ONLY';
  }
  switch (zone) {
    case 'above-ground':
      if (isBasement(bottom) || top > TOP_FLOOR_LEVEL) {
        return 'ABOVE_GROUND_ONLY';
      }
      break;
    case 'basement':
      if (!isBasement(bottom)) {
        return 'BASEMENT_ONLY';
      }
      break;
    case 'above-top-floor':
      return bottom === CATHEDRAL_BOTTOM_LEVEL ? null : 'CATHEDRAL_POSITION';
    case 'any':
    case 'lobby-floors':
      break;
  }
  return top >= CATHEDRAL_BOTTOM_LEVEL ? 'CATHEDRAL_LEVEL_ONLY' : null;
}

/** Parking, ramp and recycling rules of construction.md 6.2 to 6.4. */
function basementRuleProblem(
  type: UnitType,
  x: number,
  level: Level,
  view: WorldView,
): ErrorCode | null {
  const spot: PlacedThing = { type, x, level };
  if (type === 'parking-ramp') {
    const ramps = view.builtOfType('parking-ramp');
    const first = ramps[0];
    if (!first) {
      return level === -1 ? null : 'RAMP_POSITION';
    }
    const lowest = Math.min(...ramps.map((ramp) => ramp.level));
    const fits = ramps.length < MAX_RAMPS && x === first.x && level === lowest - 1;
    return fits ? null : 'RAMP_POSITION';
  }
  if (type === 'parking-space') {
    const anchors = [...view.builtOfType('parking-ramp'), ...view.connectedSpaces()];
    return anchors.some((anchor) => touches(anchor, spot)) ? null : 'PARKING_NOT_CONNECTED';
  }
  if (type === 'recycling-center') {
    const existing = view.builtOfType('recycling-center');
    if (existing.length === 0) {
      return null;
    }
    return existing.some((center) => areAdjacent(center, spot)) ? null : 'RECYCLING_NOT_ADJACENT';
  }
  return null;
}

function touches(a: PlacedThing, b: PlacedThing): boolean {
  return (
    a.level === b.level &&
    (a.x + footprintWidth(a.type) === b.x || b.x + footprintWidth(b.type) === a.x)
  );
}

/** C-49: footprints that do not overlap and meet side by side or one above the other. */
function areAdjacent(a: PlacedThing, b: PlacedThing): boolean {
  const first = coveredLevels(a);
  const second = coveredLevels(b);
  const aEnd = a.x + footprintWidth(a.type) - 1;
  const bEnd = b.x + footprintWidth(b.type) - 1;
  const sharesLevel = first.some((level) => second.includes(level));
  const sharesColumn = a.x <= bEnd && b.x <= aEnd;
  const sideBySide = sharesLevel && (aEnd + 1 === b.x || bEnd + 1 === a.x);
  const isBelow = (lower: Level[], upper: Level[]): boolean =>
    levelAbove(lower[lower.length - 1] as Level) === upper[0];
  const stacked = sharesColumn && (isBelow(first, second) || isBelow(second, first));
  return sideBySide || stacked;
}

/**
 * Stairs and escalators are in the front layer: they pass over units and lobby rows, but not over
 * another footprint or a shaft. They need floor under every column on both levels and a landing
 * that is not another transport's landing; stairs keep a gap from other stairs on the same level;
 * escalators end only on levels that hold escalator units. This mirrors the server's checks.
 */
function transportProblem(
  type: UnitType,
  x0: number,
  x1: number,
  bottom: Level,
  view: WorldView,
): ErrorCode | null {
  if (view.money < 0) {
    return 'NEGATIVE_BALANCE';
  }
  if (view.transports.length >= TOWER_LIMITS['stairs-and-escalators']) {
    return 'LIMIT_REACHED';
  }
  const bounds = levelProblem(bottom);
  if (bounds) {
    return bounds;
  }
  const landing = levelAbove(bottom);
  if (!isColumn(x0) || !isColumn(x1) || landing === null) {
    return 'OUT_OF_BOUNDS';
  }
  if (view.footprintAt(bottom, x0, x1) || view.shaftAt(bottom, x0, x1, null)) {
    return 'CELL_OCCUPIED';
  }
  if (!view.hasFloor(bottom, x0, x1)) {
    return 'NO_FLOOR';
  }
  const landingBlocked =
    !view.hasFloor(landing, x0, x1) ||
    view.shaftAt(landing, x0, x1, null) ||
    view.landingAt(landing, x0, x1);
  if (landingBlocked) {
    return 'TRANSPORT_LANDING';
  }
  if (type === 'stairs' && stairsTooClose(view.stairs, x0, footprintWidth(type), bottom)) {
    return 'STAIRS_TOO_CLOSE';
  }
  return view.fundsProblem(priceOf(type));
}

/** The floor tool dragged over x0..x1 of a level; mirrors buildFloor. */
export function checkFloor(
  level: Level,
  x0: number,
  x1: number,
  world: PlacementWorld,
): ErrorCode | null {
  const view = new WorldView(world);
  if (x1 < x0) {
    return 'INVALID_COMMAND';
  }
  if (view.money < 0) {
    return 'NEGATIVE_BALANCE';
  }
  const bounds = spanProblem(level, x0, x1);
  if (bounds) {
    return bounds;
  }
  if (level === TOWER_LAYOUT.mainLobbyFloor) {
    return 'LOBBY_LEVEL_ONLY';
  }
  if (level > CATHEDRAL_BOTTOM_LEVEL) {
    return 'CATHEDRAL_LEVEL_ONLY';
  }
  const columns = columnsOf(x0, x1).filter((x) => !view.hasStructure(level, x));
  if (columns.length === 0) {
    return 'NOTHING_TO_BUILD';
  }
  if (!columns.every((x) => view.isSupported(level, x))) {
    return 'NO_SUPPORT';
  }
  return view.fundsProblem(columns.length * priceOf('floor'));
}

/** The lobby tool dragged over x0..x1 of a level with a height; mirrors buildLobby. */
export function checkLobby(
  level: Level,
  x0: number,
  x1: number,
  height: number,
  world: PlacementWorld,
): ErrorCode | null {
  const view = new WorldView(world);
  if (x1 < x0 || ![1, 2, 3].includes(height)) {
    return 'INVALID_COMMAND';
  }
  if (view.money < 0) {
    return 'NEGATIVE_BALANCE';
  }
  const bounds = spanProblem(level, x0, x1);
  if (bounds) {
    return bounds;
  }
  const isMain = level === TOWER_LAYOUT.mainLobbyFloor;
  if (!isMain && !SKY_LOBBY_LEVELS.includes(level)) {
    return 'LOBBY_FLOOR_NOT_ALLOWED';
  }
  const rows: Level[] = [level];
  for (let row = levelAbove(level); row !== null && rows.length < height; row = levelAbove(row)) {
    rows.push(row);
  }
  const columns = columnsOf(x0, x1).filter((x) => !view.hasLobby(level, x, x));
  if (columns.some((x) => rows.some((row) => view.backOccupied(row, x, x)))) {
    return 'CELL_OCCUPIED';
  }
  if (columns.length === 0) {
    return 'NOTHING_TO_BUILD';
  }
  if (!columns.every((x) => view.isSupported(level, x))) {
    return 'NO_SUPPORT';
  }
  const existing = isMain ? view.mainLobbyHeight : view.skyLobbyHeight(level);
  if (existing !== null && existing !== height) {
    return 'LOBBY_HEIGHT_MISMATCH';
  }
  if (isMain && !view.touchesMainLobby(x0, x1)) {
    return 'LOBBY_NOT_CONTIGUOUS';
  }
  return view.fundsProblem(columns.length * rows.length * priceOf('lobby'));
}

function shaftWidth(type: ShaftType): number {
  return UNIT_CATALOG[SHAFT_UNIT_TYPES[type]].width;
}

/** C-38: express cars stop only in basements, the main lobby and the sky lobbies. */
function isExpressStop(level: Level): boolean {
  return (
    isBasement(level) || level === TOWER_LAYOUT.mainLobbyFloor || SKY_LOBBY_LEVELS.includes(level)
  );
}

/**
 * A shaft dragged out (`self` null) or the grabbed shaft `self` resized to bottom..top. Mirrors
 * buildShaft and resizeShaft: both end levels, the express stops, free cells, floor behind a new
 * shaft, the height cap, spacing, funds, and riders a resize would strand.
 */
export function checkShaft(
  type: ShaftType,
  x: number,
  bottom: Level,
  top: Level,
  world: PlacementWorld,
  self: string | null = null,
): ErrorCode | null {
  const view = new WorldView(world);
  if (!Number.isInteger(bottom) || !Number.isInteger(top) || bottom > top) {
    return 'INVALID_COMMAND';
  }
  if (view.money < 0) {
    return 'NEGATIVE_BALANCE';
  }
  if (self === null && view.shafts.length >= TOWER_LIMITS['elevator-shafts']) {
    return 'LIMIT_REACHED';
  }
  const width = shaftWidth(type);
  const x1 = x + width - 1;
  const bounds = levelProblem(bottom) ?? levelProblem(top);
  if (bounds) {
    return bounds;
  }
  if (bottom < LOWEST_BUILDABLE_LEVEL || top > CATHEDRAL_BOTTOM_LEVEL) {
    return 'OUT_OF_BOUNDS';
  }
  if (!isColumn(x) || !isColumn(x1)) {
    return 'OUT_OF_BOUNDS';
  }
  if (type === 'express' && !(isExpressStop(bottom) && isExpressStop(top))) {
    return 'EXPRESS_STOP_NOT_ALLOWED';
  }
  const levels = levelsBetween(bottom, top);
  const blocked = levels.some(
    (level) =>
      view.shaftAt(level, x, x1, self) ||
      view.footprintAt(level, x, x1) ||
      view.landingAt(level, x, x1),
  );
  if (blocked) {
    return 'CELL_OCCUPIED';
  }
  // A resize may reach levels with no floor yet; only a new shaft needs structure (C-34).
  if (self === null && levels.some((level) => !view.hasFloor(level, x, x1))) {
    return 'NO_FLOOR';
  }
  const { height, cost } = UNIT_CATALOG[SHAFT_UNIT_TYPES[type]];
  if (
    height.kind === 'shaft' &&
    height.maxFloorsServed !== null &&
    levels.length > height.maxFloorsServed
  ) {
    return 'SHAFT_TOO_TALL';
  }
  const tooClose = view.shafts.some((other) => {
    if (self !== null && other.id === self) {
      return false;
    }
    if (bottom > other.top || other.bottom > top) {
      return false;
    }
    const gap = x < other.x ? other.x - (x + width) : x - (other.x + shaftWidth(other.type));
    return gap < MIN_SHAFT_GAP;
  });
  if (tooClose) {
    return 'SHAFT_TOO_CLOSE';
  }
  if (self === null) {
    return view.fundsProblem(cost.kind === 'shaft' ? cost.shaftAmount + cost.perCarAmount : 0);
  }
  const strands = view.cars.some((car) => {
    const level = indexToLevel(car.position);
    return car.shaftId === self && car.load > 0 && (level < bottom || level > top);
  });
  return strands ? 'SHAFT_IN_USE' : null;
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

/** A stair or escalator holds only the cells of its bottom level; its landing is separate. */
function onFootprint(thing: PlacedThing, x: number): boolean {
  return x >= thing.x && x < thing.x + footprintWidth(thing.type);
}

function isSite(thing: PlacedThing): boolean {
  return thing.construction !== undefined;
}

/**
 * The tower as the checks need it, read once from the world (which may hold one-shot iterators)
 * and indexed by level so a check does not scan every unit for every cell.
 */
class WorldView {
  readonly money: number;
  readonly stars: number;
  readonly bombActive: boolean;
  readonly mainLobbyHeight: LobbyHeight | null;
  private readonly skyHeights: Readonly<Record<string, LobbyHeight>>;
  /** Units standing now; construction sites hold cells but the server does not count them. */
  readonly built: PlacedThing[];
  readonly transports: PlacedThing[];
  readonly shafts: PlacedShaft[];
  readonly cars: PlacedCar[];
  readonly stairs: PlacedThing[];
  private readonly structure: ReadonlyMap<Level, string>;
  private readonly unitsByLevel = new Map<Level, PlacedThing[]>();
  private readonly transportsByLevel = new Map<Level, PlacedThing[]>();
  private readonly landings = new Set<string>();

  constructor(world: PlacementWorld) {
    this.money = world.money ?? Number.POSITIVE_INFINITY;
    this.stars = world.stars ?? Number.POSITIVE_INFINITY;
    this.bombActive = world.bombActive ?? false;
    this.mainLobbyHeight = world.mainLobbyHeight ?? null;
    this.skyHeights = world.skyLobbyHeights ?? {};
    this.structure = world.structure;
    const units = [...world.units];
    this.built = units.filter((unit) => !isSite(unit));
    this.transports = [...world.transports];
    this.shafts = [...(world.shafts ?? [])];
    this.cars = [...(world.cars ?? [])];
    this.stairs = this.transports.filter((thing) => thing.type === 'stairs');
    for (const unit of units) {
      index(this.unitsByLevel, unit);
    }
    for (const transport of this.transports) {
      const row = this.transportsByLevel.get(transport.level);
      if (row === undefined) {
        this.transportsByLevel.set(transport.level, [transport]);
      } else {
        row.push(transport);
      }
    }
    for (const transport of this.transports) {
      this.addLanding(transport);
    }
  }

  /** The landing is the level above the footprint, minus cells another footprint took over. */
  private addLanding(transport: PlacedThing): void {
    const level = levelAbove(transport.level);
    if (level === null) {
      return;
    }
    for (let x = transport.x; x < transport.x + footprintWidth(transport.type); x += 1) {
      const taken = this.transportsByLevel
        .get(level)
        ?.some((other) => other !== transport && onFootprint(other, x));
      if (!taken) {
        this.landings.add(`${level}:${x}`);
      }
    }
  }

  cell(level: Level, x: number): string {
    if (x < 0 || x > LAST_COLUMN) {
      return '.';
    }
    return this.structure.get(level)?.charAt(x) || '.';
  }

  private unitCovers(level: Level, x: number): boolean {
    return this.unitsByLevel.get(level)?.some((unit) => covers(unit, x, level)) ?? false;
  }

  /** Floor, lobby, or a cell covered by a unit (construction spec section 1); ruins keep their floor. */
  hasStructure(level: Level, x: number): boolean {
    return this.cell(level, x) !== '.' || this.unitCovers(level, x);
  }

  /** Structure on every column of the span. */
  hasFloor(level: Level, x0: number, x1: number): boolean {
    return columnsOf(x0, x1).every((x) => this.cell(level, x) !== '.');
  }

  /** C-03 and C-04: above ground a cell rests on the one below, a basement hangs from the one above. */
  isSupported(level: Level, x: number): boolean {
    if (level === TOWER_LAYOUT.mainLobbyFloor) {
      return true;
    }
    const neighbour = level > 0 ? levelBelow(level) : levelAbove(level);
    return neighbour !== null && this.hasStructure(neighbour, x);
  }

  /** The back layer: a unit or ruins on any cell of the span. */
  backOccupied(level: Level, x0: number, x1: number): boolean {
    return columnsOf(x0, x1).some((x) => this.cell(level, x) === 'r' || this.unitCovers(level, x));
  }

  hasLobby(level: Level, x0: number, x1: number): boolean {
    return columnsOf(x0, x1).some((x) => this.cell(level, x) === 'l');
  }

  /** A stair or escalator footprint on the span. */
  footprintAt(level: Level, x0: number, x1: number): boolean {
    return columnsOf(x0, x1).some(
      (x) => this.transportsByLevel.get(level)?.some((thing) => onFootprint(thing, x)) ?? false,
    );
  }

  /** The reserved landing of a stair or escalator on the span. */
  landingAt(level: Level, x0: number, x1: number): boolean {
    return columnsOf(x0, x1).some((x) => this.landings.has(`${level}:${x}`));
  }

  /** A shaft other than `self` on the span. */
  shaftAt(level: Level, x0: number, x1: number, self: string | null): boolean {
    const index = levelToIndex(level);
    return this.shafts.some((shaft) => {
      if (self !== null && shaft.id === self) {
        return false;
      }
      const width = UNIT_CATALOG[SHAFT_UNIT_TYPES[shaft.type]].width;
      return (
        shaft.x <= x1 &&
        shaft.x + width - 1 >= x0 &&
        index >= levelToIndex(shaft.bottom) &&
        index <= levelToIndex(shaft.top)
      );
    });
  }

  fundsProblem(cost: number): ErrorCode | null {
    return cost > this.money ? 'INSUFFICIENT_FUNDS' : null;
  }

  /** C-52 and C-53: units of a limit group, counted from the units standing now. */
  limitReached(type: UnitType): boolean {
    const group = UNIT_CATALOG[type].limitGroup;
    if (group === null) {
      return false;
    }
    const standing = this.built.filter((unit) => UNIT_CATALOG[unit.type].limitGroup === group);
    return standing.length >= TOWER_LIMITS[group];
  }

  builtOfType(type: UnitType): PlacedThing[] {
    return this.built.filter((unit) => unit.type === type);
  }

  /** Spaces that touch a ramp on their level, directly or through a chain of spaces (C-47, C-48). */
  connectedSpaces(): PlacedThing[] {
    const spaces = this.builtOfType('parking-space');
    const reached = new Set<PlacedThing>();
    let frontier = this.builtOfType('parking-ramp');
    while (frontier.length > 0) {
      const next = spaces.filter(
        (space) => !reached.has(space) && frontier.some((from) => touches(from, space)),
      );
      for (const space of next) {
        reached.add(space);
      }
      frontier = next;
    }
    return [...reached];
  }

  /** The height the server recorded for a sky lobby on the level; null when none was built. */
  skyLobbyHeight(level: Level): LobbyHeight | null {
    return this.skyHeights[String(level)] ?? null;
  }

  /** C-19: a new main lobby run must touch or overlap the lobby already there. */
  touchesMainLobby(x0: number, x1: number): boolean {
    const row = columnsOf(0, LAST_COLUMN).filter(
      (x) => this.cell(TOWER_LAYOUT.mainLobbyFloor, x) === 'l',
    );
    const first = row[0];
    const last = row[row.length - 1];
    return first === undefined || last === undefined || (x0 <= last + 1 && x1 >= first - 1);
  }
}

function index(rows: Map<Level, PlacedThing[]>, thing: PlacedThing): void {
  for (const level of coveredLevels(thing)) {
    const row = rows.get(level);
    if (row === undefined) {
      rows.set(level, [thing]);
    } else {
      row.push(thing);
    }
  }
}
