import { LAST_COLUMN, TOWER_LAYOUT, type Level, type TowerState } from '@tower-magnate/shared';

/** The level of the main lobby, where the street meets the tower. */
export const STREET_LEVEL = TOWER_LAYOUT.mainLobbyFloor as Level;

/** The first and last column of the main lobby, or null while the tower has none. */
export function mainLobbyEnds(state: TowerState): { left: number; right: number } | null {
  let left: number | null = null;
  let right: number | null = null;
  for (const span of state.grid.levels[STREET_LEVEL]?.structure ?? []) {
    if (span.kind !== 'lobby') continue;
    left = left === null ? span.x0 : Math.min(left, span.x0);
    right = right === null ? span.x1 : Math.max(right, span.x1);
  }
  return left === null || right === null ? null : { left, right };
}

/** The map edge on the ground level where people come in from and walk out to. */
export function streetColumn(onRight: boolean): number {
  return onRight ? LAST_COLUMN : 0;
}

/** The place at the map edge where a person who comes in from the street first appears. */
export function streetPlace(onRight: boolean): { level: Level; column: number } {
  return { level: STREET_LEVEL, column: streetColumn(onRight) };
}

/** The edge closest to a column. */
export function nearestStreetColumn(column: number): number {
  return column * 2 <= LAST_COLUMN ? 0 : LAST_COLUMN;
}

/**
 * The steps the longest walk from the map edge to a lobby end takes. Rules that give a time limit
 * to people arriving from the street count from when they left the edge, so the walk is not
 * held against them.
 */
export function streetWalkAllowance(state: TowerState): number {
  const ends = mainLobbyEnds(state);
  return ends === null ? 0 : Math.max(ends.left, LAST_COLUMN - ends.right);
}
