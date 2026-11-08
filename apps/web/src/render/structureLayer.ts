import type { Level } from '@tower-magnate/shared';
import { Container, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { CulledRows } from './culledRows';
import { levelToIndex, levelTop } from './levels';
import { StructureRows, type StructureInput } from './structureRows';
import type { StructurePiece, TimeOfDay } from './structurePlan';
import type { SpriteRegistry } from './spriteRegistry';

/**
 * The Pixi side of the tower structure: one container per level, rebuilt from
 * its plan when the level changes and hidden while off screen.
 */
export class StructureLayer {
  readonly view = new Container();
  readonly rows = new CulledRows<Container>();
  private readonly containers = new Map<Level, Container>();
  private readonly planner: StructureRows;

  constructor(
    private readonly sprites: SpriteRegistry,
    private readonly time: TimeOfDay = 'day',
  ) {
    this.planner = new StructureRows((level, pieces) => this.drawLevel(level, pieces));
  }

  update(input: StructureInput): void {
    this.planner.update(input);
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
