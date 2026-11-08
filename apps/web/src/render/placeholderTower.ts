import type { ContentSnapshot, ContentUnit } from '../model/towerContent';
import { TOWER_WIDTH_TILES } from './metrics';

const TOWER_LEFT_TILE = 160;
const LOBBY_WIDTH_TILES = 54;
const OFFICE_WIDTH_TILES = 9;
const OFFICES_PER_FLOOR = 6;
const TOP_PLACEHOLDER_LEVEL = 100;

/** A stand-in tower as built cells and units, shown until the server's tower arrives. */
export function placeholderTowerContent(): ContentSnapshot {
  const levels: ContentSnapshot['levels'] = {
    1: { structure: structureRow(LOBBY_WIDTH_TILES, 'l') },
  };
  const units: ContentUnit[] = [];
  for (let level = 2; level <= TOP_PLACEHOLDER_LEVEL; level += 1) {
    levels[level] = { structure: structureRow(OFFICE_WIDTH_TILES * OFFICES_PER_FLOOR, 'f') };
    for (let office = 0; office < OFFICES_PER_FLOOR; office += 1) {
      units.push({
        id: `placeholder-${level}-${office}`,
        type: 'office',
        x: TOWER_LEFT_TILE + office * OFFICE_WIDTH_TILES,
        level,
      });
    }
  }
  return { levels, units };
}

function structureRow(builtWidth: number, cell: 'f' | 'l'): string {
  const right = TOWER_WIDTH_TILES - TOWER_LEFT_TILE - builtWidth;
  return '.'.repeat(TOWER_LEFT_TILE) + cell.repeat(builtWidth) + '.'.repeat(right);
}
