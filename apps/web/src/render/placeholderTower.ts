import { Container, Graphics, GraphicsContext } from 'pixi.js';
import type { ContentSnapshot, ContentUnit } from '../model/towerContent';
import { LOWEST_LEVEL, WORLD_WIDTH, levelToIndex } from './levels';
import { FLOOR_HEIGHT, SLAB_HEIGHT, TILE_WIDTH, TOWER_WIDTH_TILES } from './metrics';

const COLORS = {
  ink: 0x141218,
  concreteDark: 0x6b5f55,
  concrete: 0x948576,
  concreteLight: 0xbfb19c,
  soil: 0x5a3a26,
  glass: 0x8fb8c8,
  cloud: 0xd6d4d0,
  wood: 0x8a5a36,
};

const TOWER_LEFT_TILE = 160;
const LOBBY_WIDTH_TILES = 54;
const OFFICE_WIDTH_TILES = 9;
const OFFICES_PER_FLOOR = 6;
const TOP_PLACEHOLDER_LEVEL = 100;

/**
 * A stand-in tower used until the client model is fed by the server: soil
 * under ground, a lobby on level 1 and a row of offices on levels 2 to 100.
 * Floors of the same kind share one geometry.
 */
export function createPlaceholderTower(): Map<number, Container> {
  const soil = soilContext();
  const lobby = lobbyContext();
  const offices = officeRowContext();
  const floors = new Map<number, Container>();

  for (let level = LOWEST_LEVEL; level <= TOP_PLACEHOLDER_LEVEL; level += 1) {
    if (level === 0) {
      continue;
    }
    floors.set(levelToIndex(level), new Graphics(contextForLevel(level, soil, lobby, offices)));
  }
  return floors;
}

/** The same stand-in tower as built cells and units, for views that read the client model. */
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

function contextForLevel(
  level: number,
  soil: GraphicsContext,
  lobby: GraphicsContext,
  offices: GraphicsContext,
): GraphicsContext {
  if (level < 0) {
    return soil;
  }
  if (level === 1) {
    return lobby;
  }
  return offices;
}

function soilContext(): GraphicsContext {
  return new GraphicsContext().rect(0, 0, WORLD_WIDTH, FLOOR_HEIGHT).fill(COLORS.soil);
}

function lobbyContext(): GraphicsContext {
  const left = TOWER_LEFT_TILE * TILE_WIDTH;
  const context = new GraphicsContext();
  drawFramedRoom(context, left, LOBBY_WIDTH_TILES * TILE_WIDTH, COLORS.concreteLight);
  for (let tile = 1; tile < LOBBY_WIDTH_TILES - 2; tile += 3) {
    context.rect(left + tile * TILE_WIDTH, 6, TILE_WIDTH * 2, 16).fill(COLORS.glass);
  }
  return context;
}

function officeRowContext(): GraphicsContext {
  const context = new GraphicsContext();
  for (let office = 0; office < OFFICES_PER_FLOOR; office += 1) {
    const left = (TOWER_LEFT_TILE + office * OFFICE_WIDTH_TILES) * TILE_WIDTH;
    drawFramedRoom(context, left, OFFICE_WIDTH_TILES * TILE_WIDTH, COLORS.cloud);
    context.rect(left + 8, 6, 24, 10).fill(COLORS.glass);
    context.rect(left + 40, 18, 20, 8).fill(COLORS.wood);
  }
  return context;
}

function drawFramedRoom(
  context: GraphicsContext,
  left: number,
  width: number,
  wallColor: number,
): void {
  const slabTop = FLOOR_HEIGHT - SLAB_HEIGHT;
  context.rect(left, 0, width, slabTop).fill(COLORS.ink);
  context.rect(left + 1, 1, width - 2, slabTop - 1).fill(wallColor);
  context.rect(left, slabTop, width, 1).fill(COLORS.concreteLight);
  context.rect(left, slabTop + 1, width, 1).fill(COLORS.concrete);
  context.rect(left, slabTop + 2, width, 1).fill(COLORS.concreteDark);
}
