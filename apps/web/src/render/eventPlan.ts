import {
  UNIT_CATALOG,
  type CellRange,
  type ClientEvent,
  type EventView,
  type FireSpan,
  type UnitView,
} from '@tower-magnate/shared';
import type { SpriteId } from './atlasManifest';
import { levelToIndex, levelTop, WORLD_WIDTH } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH, TOWER_WIDTH_TILES } from './metrics';

/** One looping sprite of an event, placed in the container of `level`. */
export interface EffectDrawing {
  key: string;
  level: number;
  /** World x of the left edge. */
  x: number;
  /** Offset from the top of the level; negative is above the floor. */
  y: number;
  frames: readonly SpriteId[];
  frameMs: number;
  /** Frames to skip, so neighbours do not move in step. */
  phase: number;
}

const FLAME_FRAMES = frameIds('effects/fire/flame', 4);
const FRONT_FRAMES = frameIds('effects/fire/front', 3);
const SMOKE_FRAMES = frameIds('effects/smoke/puff', 4);
const ROACH_FRAMES = frameIds('effects/roach/crawl', 3);
const BELL_FRAMES = frameIds('events/wedding-bell/swing', 4);
const BLAST_FRAMES = frameIds('effects/bomb/blast', 5);
const WATER_FRAMES = frameIds('effects/helicopter/water', 3);
const HELICOPTER_FRAMES = frameIds('effects/helicopter/fly', 3);
const SLEIGH_FRAMES = frameIds('effects/santa/sleigh', 3);

const FLAME_HEIGHT = 16;
const FRONT_HEIGHT = 8;
const SMOKE_HEIGHT = 10;
const ROACH_WIDTH = 8;
const ROACH_HEIGHT = 5;
const ROACHES_PER_ROOM = 3;
const BELL_WIDTH = 32;
const BLAST_SIZE = 32;
const WATER_SIZE = 16;
const HELICOPTER_WIDTH = 25;
const HELICOPTER_HEIGHT = 13;
const SLEIGH_WIDTH = 56;
const SLEIGH_HEIGHT = 22;

export const BLAST_MS = 600;
export const HELICOPTER_CROSSING_MS = 6000;
export const WATER_DROP_MS = 900;
export const SANTA_CROSSING_MS = 20000;

const FLAME_FRAME_MS = 140;
const ROACH_FRAME_MS = 180;
const BELL_FRAME_MS = 250;

function frameIds(prefix: string, count: number): SpriteId[] {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}_${String(index + 1).padStart(2, '0')}` as SpriteId,
  );
}

/** The burning spans of every active fire, from the decision or the disaster view. */
export function fireSpansOf(events: readonly EventView[]): FireSpan[] {
  const spans: FireSpan[] = [];
  for (const event of events) {
    if (event.kind !== 'wedding' && event.spans !== undefined) {
      spans.push(...event.spans);
    }
  }
  return spans;
}

/** Flames on every burning column, a front on the next column of each side, smoke once a level is out. */
export function planFire(spans: readonly FireSpan[]): EffectDrawing[] {
  const drawings: EffectDrawing[] = [];
  for (const span of spans) {
    for (let column = span.x0; column <= span.x1; column += 1) {
      drawings.push(span.out ? smokeAt(span.level, column) : flameAt(span.level, column));
    }
    if (!span.out) {
      for (const column of [span.x0 - 1, span.x1 + 1]) {
        if (column >= 0 && column < TOWER_WIDTH_TILES) {
          drawings.push(frontAt(span.level, column));
        }
      }
    }
  }
  return drawings;
}

function flameAt(level: number, column: number): EffectDrawing {
  return {
    key: `flame:${level}:${column}`,
    level,
    x: column * TILE_WIDTH,
    y: FLOOR_HEIGHT - FLAME_HEIGHT,
    frames: FLAME_FRAMES,
    frameMs: FLAME_FRAME_MS,
    phase: column,
  };
}

function frontAt(level: number, column: number): EffectDrawing {
  return {
    key: `front:${level}:${column}`,
    level,
    x: column * TILE_WIDTH,
    y: FLOOR_HEIGHT - FRONT_HEIGHT,
    frames: FRONT_FRAMES,
    frameMs: FLAME_FRAME_MS,
    phase: column,
  };
}

function smokeAt(level: number, column: number): EffectDrawing {
  return {
    key: `smoke:${level}:${column}`,
    level,
    x: column * TILE_WIDTH,
    y: FLOOR_HEIGHT - SMOKE_HEIGHT,
    frames: SMOKE_FRAMES,
    frameMs: FLAME_FRAME_MS * 2,
    phase: column,
  };
}

type UnitPlace = Pick<UnitView, 'id' | 'type' | 'x' | 'level' | 'variant'>;

/** Cockroaches crawling along the floor of every infested room. */
export function planRoaches(units: Iterable<UnitPlace>): EffectDrawing[] {
  const drawings: EffectDrawing[] = [];
  for (const unit of units) {
    if (unit.variant !== 'infested') {
      continue;
    }
    const width = UNIT_CATALOG[unit.type].width * TILE_WIDTH;
    const spacing = Math.floor(width / ROACHES_PER_ROOM);
    for (let roach = 0; roach < ROACHES_PER_ROOM; roach += 1) {
      drawings.push({
        key: `roach:${unit.id}:${roach}`,
        level: unit.level,
        x: unit.x * TILE_WIDTH + roach * spacing + Math.floor((spacing - ROACH_WIDTH) / 2),
        y: FLOOR_HEIGHT - ROACH_HEIGHT - 1,
        frames: ROACH_FRAMES,
        frameMs: ROACH_FRAME_MS,
        phase: roach,
      });
    }
  }
  return drawings;
}

/** The ids of the wedding guests and the cathedral, or null while no wedding is on. */
export function weddingOf(
  events: readonly EventView[],
): { cathedral: string; guests: ReadonlySet<string> } | null {
  for (const event of events) {
    if (event.kind === 'wedding') {
      return { cathedral: event.cathedral, guests: new Set(event.guests) };
    }
  }
  return null;
}

/** The bell swinging over the belfry of the cathedral that is hosting the wedding. */
export function planCathedral(
  cathedralId: string,
  units: ReadonlyMap<string, UnitPlace>,
): EffectDrawing[] {
  const cathedral = units.get(cathedralId);
  if (cathedral === undefined) {
    return [];
  }
  const definition = UNIT_CATALOG[cathedral.type];
  const floors = definition.height.kind === 'fixed' ? definition.height.floors : 1;
  const width = definition.width * TILE_WIDTH;
  return [
    {
      key: `bell:${cathedralId}`,
      level: cathedral.level + floors - 1,
      x: cathedral.x * TILE_WIDTH + Math.floor((width - BELL_WIDTH) / 2),
      y: 0,
      frames: BELL_FRAMES,
      frameMs: BELL_FRAME_MS,
      phase: 0,
    },
  ];
}

/** The frame a looping drawing shows at `nowMs`. */
export function frameAt(drawing: EffectDrawing, nowMs: number): SpriteId {
  const tick = Math.floor(nowMs / drawing.frameMs) + drawing.phase;
  return drawing.frames[tick % drawing.frames.length] as SpriteId;
}

/** A one-off effect that starts when a client event arrives. */
export type TransientEffect =
  { kind: 'blast'; cells: readonly CellRange[] } | { kind: 'helicopter' } | { kind: 'santa' };

/** What a drawing of a transient effect needs: a sprite at a world position. */
export interface SpritePlacement {
  key: string;
  /** Level whose container holds the sprite, or null for the sky above the tower. */
  level: number | null;
  x: number;
  y: number;
  sprite: SpriteId;
}

/**
 * Turns client events into the effects they start. A blast needs ruined cells
 * and a helicopter or Santa starts once per notice, so repeats of the same
 * Santa step are dropped.
 */
export class TransientEffects {
  private lastSantaStep: number | null = null;

  receive(events: readonly ClientEvent[]): TransientEffect[] {
    const effects: TransientEffect[] = [];
    for (const event of events) {
      if (event.type === 'disaster' && event.kind === 'bomb' && event.cells.length > 0) {
        effects.push({ kind: 'blast', cells: event.cells });
      } else if (event.type === 'news' && event.key === 'news.fireHelicopter') {
        effects.push({ kind: 'helicopter' });
      } else if (event.type === 'news' && event.key === 'news.santa') {
        if (event.step !== this.lastSantaStep) {
          this.lastSantaStep = event.step;
          effects.push({ kind: 'santa' });
        }
      }
    }
    return effects;
  }
}

/** One blast sprite per four columns of every ruined range, stepping through the frames. */
export function planBlast(cells: readonly CellRange[], elapsedMs: number): SpritePlacement[] {
  if (elapsedMs < 0 || elapsedMs >= BLAST_MS) {
    return [];
  }
  const frame = Math.floor((elapsedMs / BLAST_MS) * BLAST_FRAMES.length);
  const placements: SpritePlacement[] = [];
  for (const range of cells) {
    const columnsPerSprite = BLAST_SIZE / TILE_WIDTH;
    for (let column = range.x0; column <= range.x1; column += columnsPerSprite) {
      placements.push({
        key: `blast:${range.level}:${column}`,
        level: range.level,
        x: column * TILE_WIDTH,
        y: FLOOR_HEIGHT - BLAST_SIZE,
        sprite: BLAST_FRAMES[frame] as SpriteId,
      });
    }
  }
  return placements;
}

/** Where the helicopter drops its water: over the middle of the span on the highest burning level. */
export interface WaterTarget {
  level: number;
  x: number;
}

export function waterTargetOf(spans: readonly FireSpan[]): WaterTarget | null {
  const highest = spans.reduce<FireSpan | null>(
    (best, span) => (best === null || span.level > best.level ? span : best),
    null,
  );
  if (highest === null) {
    return null;
  }
  const middle = ((highest.x0 + highest.x1 + 1) / 2) * TILE_WIDTH;
  return { level: highest.level, x: Math.round(middle - WATER_SIZE / 2) };
}

function helicopterX(elapsedMs: number): number {
  const progress = elapsedMs / HELICOPTER_CROSSING_MS;
  return Math.round(WORLD_WIDTH - (WORLD_WIDTH + HELICOPTER_WIDTH) * progress);
}

/** When the helicopter is over the water target, in milliseconds after it enters. */
export function waterDropStartMs(target: WaterTarget): number {
  const progress =
    (WORLD_WIDTH - target.x - (WATER_SIZE - HELICOPTER_WIDTH) / 2) /
    (WORLD_WIDTH + HELICOPTER_WIDTH);
  return Math.round(progress * HELICOPTER_CROSSING_MS);
}

/**
 * The helicopter crosses right to left one floor above the fire, or above the
 * tower when no fire was known, and the water falls while it is overhead.
 */
export function planHelicopter(
  elapsedMs: number,
  target: WaterTarget | null,
  towerTopLevel: number,
): SpritePlacement[] {
  if (elapsedMs < 0 || elapsedMs >= HELICOPTER_CROSSING_MS) {
    return [];
  }
  const flightLevel = target === null ? towerTopLevel : target.level;
  const flightTop = levelTop(levelToIndex(flightLevel)) - HELICOPTER_HEIGHT - 2;
  const frame = Math.floor(elapsedMs / 80) % HELICOPTER_FRAMES.length;
  const placements: SpritePlacement[] = [
    {
      key: 'helicopter',
      level: null,
      x: helicopterX(elapsedMs),
      y: flightTop,
      sprite: HELICOPTER_FRAMES[frame] as SpriteId,
    },
  ];
  if (target !== null) {
    const sinceDrop = elapsedMs - waterDropStartMs(target);
    if (sinceDrop >= 0 && sinceDrop < WATER_DROP_MS) {
      const waterFrame = Math.floor((sinceDrop / WATER_DROP_MS) * WATER_FRAMES.length);
      placements.push({
        key: 'water',
        level: target.level,
        x: target.x,
        y: FLOOR_HEIGHT - WATER_SIZE,
        sprite: WATER_FRAMES[waterFrame] as SpriteId,
      });
    }
  }
  return placements;
}

/** Papa Noel's sleigh from just past the right edge of the world to just past the left edge, over 20 seconds. */
export function planSanta(elapsedMs: number, towerTopLevel: number): SpritePlacement[] {
  if (elapsedMs < 0 || elapsedMs >= SANTA_CROSSING_MS) {
    return [];
  }
  const progress = elapsedMs / SANTA_CROSSING_MS;
  const x = Math.round(WORLD_WIDTH - (WORLD_WIDTH + SLEIGH_WIDTH) * progress);
  const y = levelTop(levelToIndex(towerTopLevel)) - SLEIGH_HEIGHT - FLOOR_HEIGHT;
  const frame = Math.floor(elapsedMs / 150) % SLEIGH_FRAMES.length;
  return [{ key: 'santa', level: null, x, y, sprite: SLEIGH_FRAMES[frame] as SpriteId }];
}
