import { UNIT_CATALOG, type UnitDefinition, type UnitType } from '@tower-magnate/shared';
import type { ContentUnit, TowerContent } from '../model/towerContent';
import type { Camera } from './camera';
import { LEVEL_COUNT, levelToIndex } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH, TOWER_WIDTH_TILES } from './metrics';

/** Map pixels per level. One map pixel per column. */
export const MAP_ROW_HEIGHT = 2;
export const MAP_WIDTH = TOWER_WIDTH_TILES;
export const MAP_HEIGHT = LEVEL_COUNT * MAP_ROW_HEIGHT;

export const MAP_COLORS = {
  sky: 0xa9cdee,
  soil: 0x5a3a26,
  floor: 0x6b5f55,
  lobby: 0xbfb19c,
  transport: 0x4f4e5c,
  officesAndHousing: 0xd6d4d0,
  hotel: 0xe0875a,
  commerce: 0x4f8a3e,
  services: 0x2f4f9a,
  cathedral: 0xf2d36b,
  subway: 0x141218,
  frame: 0xf4f1e8,
} as const;

export interface MapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorldPoint {
  worldX: number;
  worldY: number;
}

export function unitMapColor(type: UnitType): number {
  if (type === 'cathedral') {
    return MAP_COLORS.cathedral;
  }
  if (type === 'subway-station') {
    return MAP_COLORS.subway;
  }
  if (type === 'lobby') {
    return MAP_COLORS.lobby;
  }
  if (type === 'floor') {
    return MAP_COLORS.floor;
  }
  switch (UNIT_CATALOG[type].category) {
    case 'transport':
      return MAP_COLORS.transport;
    case 'offices-and-housing':
      return MAP_COLORS.officesAndHousing;
    case 'hotel':
      return MAP_COLORS.hotel;
    case 'commerce-and-entertainment':
      return MAP_COLORS.commerce;
    case 'services':
      return MAP_COLORS.services;
    case 'structure':
      return MAP_COLORS.floor;
  }
}

/** Map y of the top pixel row of a level, by dense index. */
export function mapRowTop(index: number): number {
  return (LEVEL_COUNT - 1 - index) * MAP_ROW_HEIGHT;
}

/** The whole site as RGBA pixels, MAP_WIDTH x MAP_HEIGHT. People are not drawn. */
export function paintTowerMap(content: TowerContent): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(MAP_WIDTH * MAP_HEIGHT * 4);
  for (let index = 0; index < LEVEL_COUNT; index += 1) {
    const ground = index < levelToIndex(1) ? MAP_COLORS.soil : MAP_COLORS.sky;
    fillCells(pixels, index, 0, MAP_WIDTH, ground);
  }
  for (const [level, row] of content.structure) {
    paintStructureRow(pixels, levelToIndex(level), row);
  }
  for (const unit of content.units.values()) {
    paintUnit(pixels, unit);
  }
  return pixels;
}

function paintStructureRow(pixels: Uint8ClampedArray, index: number, row: string): void {
  for (let column = 0; column < row.length; column += 1) {
    const cell = row[column];
    if (cell === 'f') {
      fillCells(pixels, index, column, 1, MAP_COLORS.floor);
    } else if (cell === 'l') {
      fillCells(pixels, index, column, 1, MAP_COLORS.lobby);
    }
  }
}

function paintUnit(pixels: Uint8ClampedArray, unit: ContentUnit): void {
  const definition = UNIT_CATALOG[unit.type];
  const floors = unit.floors ?? defaultFloors(definition);
  const color = unitMapColor(unit.type);
  const bottomIndex = levelToIndex(unit.level);
  for (let floor = 0; floor < floors; floor += 1) {
    fillCells(pixels, bottomIndex + floor, unit.x, definition.width, color);
  }
}

function defaultFloors(definition: UnitDefinition): number {
  const height = definition.height;
  if (height.kind === 'fixed') {
    return height.floors;
  }
  if (height.kind === 'choice') {
    return height.floors[0] ?? 1;
  }
  return 1;
}

function fillCells(
  pixels: Uint8ClampedArray,
  index: number,
  firstColumn: number,
  width: number,
  color: number,
): void {
  if (index < 0 || index >= LEVEL_COUNT) {
    return;
  }
  const from = Math.max(0, firstColumn);
  const to = Math.min(MAP_WIDTH, firstColumn + width);
  const top = mapRowTop(index);
  for (let y = top; y < top + MAP_ROW_HEIGHT; y += 1) {
    for (let x = from; x < to; x += 1) {
      writePixel(pixels, x, y, color);
    }
  }
}

function writePixel(pixels: Uint8ClampedArray, x: number, y: number, color: number): void {
  const offset = (y * MAP_WIDTH + x) * 4;
  pixels[offset] = (color >> 16) & 0xff;
  pixels[offset + 1] = (color >> 8) & 0xff;
  pixels[offset + 2] = color & 0xff;
  pixels[offset + 3] = 0xff;
}

/** The part of the map the tower view shows, in whole map pixels, kept inside the map. */
export function mapFrame(camera: Camera): MapRect {
  const worldPerMapX = TILE_WIDTH * camera.zoom;
  const worldPerMapY = (FLOOR_HEIGHT / MAP_ROW_HEIGHT) * camera.zoom;
  const left = clamp(Math.floor(camera.left / worldPerMapX), 0, MAP_WIDTH);
  const top = clamp(Math.floor(camera.top / worldPerMapY), 0, MAP_HEIGHT);
  const right = clamp(Math.ceil((camera.left + camera.viewWidth) / worldPerMapX), 0, MAP_WIDTH);
  const bottom = clamp(Math.ceil((camera.top + camera.viewHeight) / worldPerMapY), 0, MAP_HEIGHT);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The world point, in zoom 1 pixels, at the middle of a map pixel. */
export function mapPointToWorld(mapX: number, mapY: number): WorldPoint {
  const column = clamp(Math.floor(mapX), 0, MAP_WIDTH - 1);
  const row = clamp(Math.floor(mapY), 0, MAP_HEIGHT - 1);
  return {
    worldX: (column + 0.5) * TILE_WIDTH,
    worldY: (row + 0.5) * (FLOOR_HEIGHT / MAP_ROW_HEIGHT),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
