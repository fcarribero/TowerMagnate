import {
  SHAFT_UNIT_TYPES,
  UNIT_CATALOG,
  type Command,
  type ShaftType,
  type ShaftView,
  type TransportType,
} from '@tower-magnate/shared';
import type { Cell } from '../../render/cellAtPoint';
import { levelToIndex } from '../../render/levels';
import type { ToolId } from '../toolbar/toolbarModel';

type PlaceableUnit = Extract<Command, { type: 'buildUnit' }>['unitType'];
type LobbyHeight = Extract<Command, { type: 'buildLobby' }>['height'];

export type BuildMode = 'drag' | 'shaft' | 'hand' | 'click' | 'demolish' | 'none';

const TRANSPORT_TOOLS: readonly string[] = ['stairs', 'escalator'];
export function shaftTypeOfTool(tool: ToolId): ShaftType | null {
  const entry = Object.entries(SHAFT_UNIT_TYPES).find(([, unitType]) => unitType === tool);
  return entry === undefined ? null : (entry[0] as ShaftType);
}

/** How the tool is used on the tower. */
export function buildMode(tool: ToolId): BuildMode {
  if (tool === 'floor' || tool === 'lobby') {
    return 'drag';
  }
  if (shaftTypeOfTool(tool) !== null) {
    return 'shaft';
  }
  if (tool === 'hand') {
    return 'hand';
  }
  if (tool === 'bulldozer') {
    return 'demolish';
  }
  if (tool === 'inspect') {
    return 'none';
  }
  return Object.hasOwn(UNIT_CATALOG, tool) ? 'click' : 'none';
}

export function commandForClick(tool: ToolId, cell: Cell): Command | null {
  if (buildMode(tool) !== 'click') {
    return null;
  }
  if (TRANSPORT_TOOLS.includes(tool)) {
    return {
      type: 'buildTransport',
      transportType: tool as TransportType,
      x: cell.x,
      level: cell.level,
    };
  }
  return { type: 'buildUnit', unitType: tool as PlaceableUnit, x: cell.x, level: cell.level };
}

/** True for the click tools that place a unit (not stairs or escalators), which a held drag repeats. */
export function repeatsOnDrag(tool: ToolId): boolean {
  return buildMode(tool) === 'click' && !TRANSPORT_TOOLS.includes(tool);
}

/** The slot of the unit-width grid that starts at `pressX` and holds column `x`; negative to the left. */
export function slotIndex(pressX: number, x: number, width: number): number {
  return Math.floor((x - pressX) / width);
}

/**
 * The columns where the next units go when the pointer reaches `currentX` while a drag that began at
 * `pressX` has built the slots `built.min..built.max` (0 is the pressed one). Slots are exactly adjacent, in
 * the order they are reached; nothing comes back for slots already built.
 */
export function adjacentSlots(
  pressX: number,
  currentX: number,
  width: number,
  built: { min: number; max: number },
): number[] {
  const target = slotIndex(pressX, currentX, width);
  const xs: number[] = [];
  for (let k = built.max + 1; k <= target; k += 1) {
    xs.push(pressX + k * width);
  }
  for (let k = built.min - 1; k >= target; k -= 1) {
    xs.push(pressX + k * width);
  }
  return xs;
}

/** One run on the level where the press happened, from the press column to the release column. */
export function commandForDrag(
  tool: ToolId,
  lobbyHeight: number,
  press: Cell,
  releaseX: number,
): Command | null {
  const span = {
    level: press.level,
    x0: Math.min(press.x, releaseX),
    x1: Math.max(press.x, releaseX),
  };
  if (tool === 'floor') {
    return { type: 'buildFloor', ...span };
  }
  if (tool === 'lobby') {
    return { type: 'buildLobby', ...span, height: lobbyHeight as LobbyHeight };
  }
  return null;
}

export interface ShaftSpan {
  bottom: Cell['level'];
  top: Cell['level'];
  floors: number;
}

/** The levels from the press to the release, bottom first, with level 0 not counted. */
export function shaftSpan(pressLevel: Cell['level'], releaseLevel: Cell['level']): ShaftSpan {
  const pressedLower = levelToIndex(pressLevel) <= levelToIndex(releaseLevel);
  const bottom = pressedLower ? pressLevel : releaseLevel;
  const top = pressedLower ? releaseLevel : pressLevel;
  return { bottom, top, floors: levelToIndex(top) - levelToIndex(bottom) + 1 };
}

/** The most levels a shaft of this type serves, or null when there is no limit. */
export function shaftMaxFloors(type: ShaftType): number | null {
  const { height } = UNIT_CATALOG[SHAFT_UNIT_TYPES[type]];
  return height.kind === 'shaft' ? height.maxFloorsServed : null;
}

/** What the server charges: the empty shaft plus its first car. */
export function shaftCost(type: ShaftType): number {
  const { cost } = UNIT_CATALOG[SHAFT_UNIT_TYPES[type]];
  return cost.kind === 'shaft' ? cost.shaftAmount + cost.perCarAmount : 0;
}

export function commandForShaftDrag(
  tool: ToolId,
  press: Cell,
  releaseLevel: Cell['level'],
): Command | null {
  const shaftType = shaftTypeOfTool(tool);
  if (shaftType === null) {
    return null;
  }
  const { bottom, top } = shaftSpan(press.level, releaseLevel);
  return { type: 'buildShaft', shaftType, x: press.x, bottom, top };
}

export interface GrabbedShaft {
  id: string;
  type: ShaftType;
  x: number;
  bottom: Cell['level'];
  top: Cell['level'];
  /** The end the hand took hold of: the one closer to where it pressed. */
  end: 'top' | 'bottom';
}

/** The shaft whose base or top is at the cell; that end is the one dragged. Nothing in the middle can be taken. */
export function grabShaft(
  shafts: Iterable<Pick<ShaftView, 'id' | 'type' | 'x' | 'bottom' | 'top'>> | undefined,
  cell: Cell,
): GrabbedShaft | null {
  // The store hands over an iterator, which can be read only once.
  const all = [...(shafts ?? [])];
  const id = shaftIdAt(all, cell);
  const shaft = id === null ? undefined : all.find((other) => other.id === id);
  if (shaft === undefined) {
    return null;
  }
  // Only the base and the top can be taken; a one-level shaft is taken by its top.
  if (cell.level === shaft.top) {
    return { ...shaft, end: 'top' };
  }
  return cell.level === shaft.bottom ? { ...shaft, end: 'bottom' } : null;
}

/**
 * The levels a shaft would serve if its grabbed end were let go at `releaseLevel`; null if that
 * flips it. A one-level shaft has both ends on the same cell, so it grows the way it is dragged:
 * down moves its bottom, up moves its top.
 */
export function resizedSpan(grabbed: GrabbedShaft, releaseLevel: Cell['level']): ShaftSpan | null {
  const oneLevel = grabbed.bottom === grabbed.top;
  const movesBottom = oneLevel
    ? levelToIndex(releaseLevel) < levelToIndex(grabbed.bottom)
    : grabbed.end === 'bottom';
  const bottom = movesBottom ? releaseLevel : grabbed.bottom;
  const top = movesBottom ? grabbed.top : releaseLevel;
  const floors = levelToIndex(top) - levelToIndex(bottom) + 1;
  return floors < 1 ? null : { bottom, top, floors };
}

/** A resize that serves the new levels, or null when nothing changes. */
export function commandForResize(
  grabbed: GrabbedShaft,
  releaseLevel: Cell['level'],
): Command | null {
  const span = resizedSpan(grabbed, releaseLevel);
  if (span === null || (span.bottom === grabbed.bottom && span.top === grabbed.top)) {
    return null;
  }
  return { type: 'resizeShaft', shaftId: grabbed.id, bottom: span.bottom, top: span.top };
}

/** The shaft whose columns and levels include the cell. */
export function shaftIdAt(
  shafts: Iterable<Pick<ShaftView, 'id' | 'type' | 'x' | 'bottom' | 'top'>> | undefined,
  cell: Cell,
): string | null {
  for (const shaft of shafts ?? []) {
    const width = UNIT_CATALOG[SHAFT_UNIT_TYPES[shaft.type]].width;
    const insideColumns = cell.x >= shaft.x && cell.x < shaft.x + width;
    const index = levelToIndex(cell.level);
    const insideLevels = index >= levelToIndex(shaft.bottom) && index <= levelToIndex(shaft.top);
    if (insideColumns && insideLevels) {
      return shaft.id;
    }
  }
  return null;
}
