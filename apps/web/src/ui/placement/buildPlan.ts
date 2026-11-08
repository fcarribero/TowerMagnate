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

export type BuildMode = 'drag' | 'shaft' | 'car' | 'click' | 'none';

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
  if (tool === 'car') {
    return 'car';
  }
  if (tool === 'inspect' || tool === 'bulldozer') {
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

export function commandForCar(shaftId: string | null, cell: Cell): Command | null {
  return shaftId === null ? null : { type: 'addCar', shaftId, homeLevel: cell.level };
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
