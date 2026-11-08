import type { Level } from '@tower-magnate/shared';
import { HIGHEST_LEVEL, LOWEST_LEVEL } from './levels';
import {
  levelsAffectedBy,
  planStructureRow,
  type LobbyHeight,
  type StructurePiece,
} from './structurePlan';

export interface StructureInput {
  structure: ReadonlyMap<Level, string>;
  mainLobbyHeight: LobbyHeight | null;
}

export type RowDrawer = (level: Level, pieces: StructurePiece[]) => void;

const MAIN_LOBBY_ROWS: readonly Level[] = [1, 2, 3];

/**
 * Keeps the structure drawing in step with the client model. The first update
 * draws every level; later ones redraw only the levels whose row changed and
 * their neighbours that depend on it.
 */
export class StructureRows {
  private drawn: StructureInput | null = null;

  constructor(private readonly draw: RowDrawer) {}

  update(input: StructureInput): Level[] {
    const levels = this.drawn === null ? allLevels() : changedLevels(this.drawn, input);
    const source = {
      row: (level: Level) => input.structure.get(level),
      mainLobbyHeight: input.mainLobbyHeight,
    };
    for (const level of levels) {
      this.draw(level, planStructureRow(level, source));
    }
    this.drawn = input;
    return levels;
  }
}

export function allLevels(): Level[] {
  const levels: Level[] = [];
  for (let level = LOWEST_LEVEL; level <= HIGHEST_LEVEL; level += 1) {
    if (level !== 0) {
      levels.push(level);
    }
  }
  return levels;
}

/** Levels to redraw, lowest first, when the model goes from `before` to `after`. */
export function changedLevels(before: StructureInput, after: StructureInput): Level[] {
  const changed = new Set<Level>();
  const markWithNeighbours = (level: Level): void => {
    for (const affected of levelsAffectedBy(level)) {
      changed.add(affected);
    }
  };
  if (before.structure !== after.structure) {
    const levels = new Set([...before.structure.keys(), ...after.structure.keys()]);
    for (const level of levels) {
      if (before.structure.get(level) !== after.structure.get(level)) {
        markWithNeighbours(level);
      }
    }
  }
  if (before.mainLobbyHeight !== after.mainLobbyHeight) {
    MAIN_LOBBY_ROWS.forEach(markWithNeighbours);
  }
  return [...changed].filter((level) => level !== 0).sort((a, b) => a - b);
}
