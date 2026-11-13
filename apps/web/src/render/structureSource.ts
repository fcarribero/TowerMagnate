import type { Level } from '@tower-magnate/shared';
import type { ClientStore } from '../model/clientStore';
import type { GameState } from '../model/gameState';
import { placeholderTowerContent } from './placeholderTower';
import { TOWER_WIDTH_TILES } from './metrics';
import type { StructureInput } from './structureRows';
import { coveredRows, reuseEqualRows } from './unitCover';

let lastCovered: { units: GameState['units']; rows: ReadonlyMap<Level, string> } | null = null;

/** Cells under units, recomputed only when the unit map changes and reused while the cells stay the same. */
function coveredOf(state: GameState): ReadonlyMap<Level, string> {
  if (lastCovered?.units === state.units) {
    return lastCovered.rows;
  }
  const rows = reuseEqualRows(lastCovered?.rows, coveredRows(state.units.values()));
  lastCovered = { units: state.units, rows };
  return rows;
}

export function structureOf(state: GameState): StructureInput {
  return {
    structure: state.structure,
    mainLobbyHeight: state.mainLobbyHeight,
    covered: coveredOf(state),
  };
}

/**
 * Feeds `show` with the tower structure from the store. Until the first
 * snapshot arrives the stand-in tower is shown, so the view is never empty.
 */
export function bindStructure(
  store: ClientStore,
  show: (input: StructureInput) => void,
): () => void {
  if (store.current === null) {
    show(placeholderStructure());
  }
  return store.select(structureOf, show);
}

export function placeholderStructure(): StructureInput {
  const structure = new Map<Level, string>();
  for (const [level, row] of Object.entries(placeholderTowerContent().levels)) {
    structure.set(Number(level), row.structure);
  }
  return { structure, mainLobbyHeight: 1 };
}

/** A tower built across the whole site from S9 to `floors`, with a 3-high main lobby, for frame rate checks. */
export function fullWidthTestTower(floors: number): StructureInput {
  const floorRow = 'f'.repeat(TOWER_WIDTH_TILES);
  const lobbyRow = 'l'.repeat(TOWER_WIDTH_TILES);
  const structure = new Map<Level, string>();
  for (let level = -9; level <= floors; level += 1) {
    if (level !== 0) {
      structure.set(level, level >= 1 && level <= 3 ? lobbyRow : floorRow);
    }
  }
  return { structure, mainLobbyHeight: 3 };
}

/** Reads `?testTower=N` (1 to 104) so a dev build can draw a full-width test tower of N floors. */
export function testTowerFromQuery(search: string): number | null {
  const floors = Number(new URLSearchParams(search).get('testTower'));
  return Number.isInteger(floors) && floors >= 1 && floors <= 104 ? floors : null;
}
