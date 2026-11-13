import type { Level } from '@tower-magnate/shared';
import { Container, Graphics, Sprite, TilingSprite, type Texture } from 'pixi.js';
import {
  buildProgress,
  columnRuns,
  revealedHeight,
  runDurationMs,
  staggerFor,
} from './constructionReveal';
import { CulledRows } from './culledRows';
import { levelToIndex, levelTop, WORLD_WIDTH } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';
import { StructureRows, type StructureInput } from './structureRows';
import type { StructurePiece, TimeOfDay } from './structurePlan';
import type { SpriteRegistry } from './spriteRegistry';

/** A lobby row can be up to three floors tall and stands on the row's bottom edge. */
const MASK_TOP = -3 * FLOOR_HEIGHT;
const MASK_BOTTOM = FLOOR_HEIGHT + TILE_WIDTH;

/** New floor cells of a level rising from the ground, one tile after another along each run. */
interface RowConstruction {
  startedAt: number;
  columns: number[];
  mask: Graphics;
  container: Container;
}

/**
 * The Pixi side of the tower structure: one container per level, rebuilt from
 * its plan when the level changes and hidden while off screen.
 */
export class StructureLayer {
  readonly view = new Container();
  readonly rows = new CulledRows<Container>();
  private readonly containers = new Map<Level, Container>();
  private readonly planner: StructureRows;
  private readonly constructions = new Map<Level, RowConstruction>();
  private before: ReadonlyMap<Level, string> | null = null;

  constructor(
    private readonly sprites: SpriteRegistry,
    private readonly time: TimeOfDay = 'day',
    private readonly now: () => number = () => performance.now(),
  ) {
    this.planner = new StructureRows((level, pieces) => this.drawLevel(level, pieces));
  }

  update(input: StructureInput): void {
    const before = this.before;
    this.planner.update(input);
    // The first update draws what is already built; only cells that arrive later are built on screen.
    if (before !== null && before !== input.structure) {
      for (const [level, row] of input.structure) {
        const columns = newColumns(before.get(level), row);
        if (columns.length > 0) {
          this.beginConstruction(level, columns);
        }
      }
    }
    this.before = input.structure;
  }

  /** Moves the floors that are being built one step; call it on every frame. */
  animate(): void {
    const now = this.now();
    for (const [level, build] of this.constructions) {
      this.growConstruction(level, build, now);
    }
  }

  /** Levels with cells still rising. */
  get buildingCount(): number {
    return this.constructions.size;
  }

  private beginConstruction(level: Level, columns: number[]): void {
    const container = this.containers.get(level);
    if (container === undefined) {
      return;
    }
    const existing = this.constructions.get(level);
    const merged = [...new Set([...(existing?.columns ?? []), ...columns])].sort((a, b) => a - b);
    const mask = existing?.mask ?? new Graphics();
    if (existing === undefined) {
      mask.position.set(0, container.y);
      this.view.addChild(mask);
      container.mask = mask;
    }
    const build = { startedAt: this.now(), columns: merged, mask, container };
    this.constructions.set(level, build);
    this.growConstruction(level, build, build.startedAt);
  }

  private growConstruction(level: Level, build: RowConstruction, now: number): void {
    const runs = columnRuns(build.columns);
    const elapsed = now - build.startedAt;
    const longest = Math.max(...runs.map((run) => run.to - run.from + 1));
    if (elapsed >= runDurationMs(longest)) {
      build.container.mask = null;
      build.mask.destroy();
      this.constructions.delete(level);
      return;
    }
    const mask = build.mask.clear();
    let cursor = 0;
    const solid = (from: number, to: number): void => {
      if (to > from) {
        mask.rect(from, MASK_TOP, to - from, MASK_BOTTOM - MASK_TOP).fill(0xffffff);
      }
    };
    for (const run of runs) {
      solid(cursor, run.from * TILE_WIDTH);
      const stagger = staggerFor(run.to - run.from + 1);
      for (let column = run.from; column <= run.to; column += 1) {
        const progress = buildProgress(elapsed - (column - run.from) * stagger);
        const shown = revealedHeight(FLOOR_HEIGHT - MASK_TOP, progress);
        if (shown > 0) {
          mask
            .rect(column * TILE_WIDTH, FLOOR_HEIGHT - shown, TILE_WIDTH, shown + TILE_WIDTH)
            .fill(0xffffff);
        }
      }
      cursor = (run.to + 1) * TILE_WIDTH;
    }
    solid(cursor, WORLD_WIDTH);
  }

  private drawLevel(level: Level, pieces: StructurePiece[]): void {
    const container = this.containerFor(level);
    for (const child of container.removeChildren()) {
      child.destroy();
    }
    for (const piece of pieces) {
      container.addChild(this.spriteFor(piece));
    }
  }

  private containerFor(level: Level): Container {
    const existing = this.containers.get(level);
    if (existing !== undefined) {
      return existing;
    }
    const index = levelToIndex(level);
    const container = new Container();
    container.y = levelTop(index);
    this.containers.set(level, container);
    this.rows.set(index, container);
    this.view.addChild(container);
    return container;
  }

  private spriteFor(piece: StructurePiece): Sprite | TilingSprite {
    const texture = this.texture(piece.subject);
    const sprite =
      piece.width === undefined
        ? new Sprite(texture)
        : new TilingSprite({ texture, width: piece.width, height: texture.height });
    sprite.position.set(piece.x, piece.y);
    return sprite;
  }

  private texture(subject: string): Texture {
    return this.sprites.variant(`structure/${subject}`, { time: this.time });
  }
}

/** Columns that were empty in the old row and are built in the new one. */
export function newColumns(before: string | undefined, after: string): number[] {
  const columns: number[] = [];
  for (let column = 0; column < after.length; column += 1) {
    const wasEmpty = before === undefined || (before[column] ?? '.') === '.';
    if (wasEmpty && after[column] !== '.') {
      columns.push(column);
    }
  }
  return columns;
}
