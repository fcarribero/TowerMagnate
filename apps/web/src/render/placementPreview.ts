import { UNIT_CATALOG, type UnitType } from '@tower-magnate/shared';
import type { Cell } from './cellAtPoint';
import type { Footprint, GhostInput } from './ghostLayer';
import {
  checkPlacement,
  footprintFloors,
  footprintWidth,
  isGhostTool,
  thingAt,
  type PlacementWorld,
} from './placementCheck';
import type { TimeOfDay } from './structurePlan';

/** What the player has selected: nothing to place (inspect and similar) or a unit to build. */
export type PreviewTool =
  { kind: 'inspect' } | { kind: 'build'; type: UnitType } | { kind: 'none' };

export interface Preview {
  ghost: GhostInput | null;
  highlight: Footprint | null;
}

/** The ghost frame of stairs spans two levels, though the stairs only occupy one. */
const STAIRS_FRAME_FLOORS = 2;

const EMPTY_PREVIEW: Preview = { ghost: null, highlight: null };

/**
 * Decides what to draw for the pointer's tile: a ghost when a build tool is
 * selected, a frame around the hovered unit when inspecting.
 */
export function planPreview(
  tool: PreviewTool,
  cell: Cell | null,
  world: PlacementWorld,
  time: TimeOfDay,
): Preview {
  if (cell === null) {
    return EMPTY_PREVIEW;
  }
  if (tool.kind === 'build') {
    return { ghost: planGhost(tool.type, cell, world, time), highlight: null };
  }
  if (tool.kind === 'inspect') {
    return { ghost: null, highlight: planHighlight(cell, world) };
  }
  return EMPTY_PREVIEW;
}

function planGhost(
  type: UnitType,
  cell: Cell,
  world: PlacementWorld,
  time: TimeOfDay,
): GhostInput | null {
  if (!isGhostTool(type)) {
    return null;
  }
  const check = checkPlacement(type, cell.x, cell.level, world);
  return {
    type,
    x: cell.x,
    level: cell.level,
    width: footprintWidth(type),
    floors: footprintFloors(type),
    frameFloors: type === 'stairs' ? STAIRS_FRAME_FLOORS : footprintFloors(type),
    valid: check.problem === null && canAfford(type, world.money),
    time,
  };
}

/** Units and stairs are paid up front; a build the cash cannot cover is not placeable. */
function canAfford(type: UnitType, money: number | undefined): boolean {
  const { cost } = UNIT_CATALOG[type];
  return money === undefined || cost.kind !== 'per-unit' || money >= cost.amount;
}

function planHighlight(cell: Cell, world: PlacementWorld): Footprint | null {
  const thing = thingAt(world, cell.x, cell.level);
  if (thing === null) {
    return null;
  }
  return {
    x: thing.x,
    level: thing.level,
    width: footprintWidth(thing.type),
    floors: footprintFloors(thing.type),
  };
}
