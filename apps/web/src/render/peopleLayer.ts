import { Container, Sprite } from 'pixi.js';
import type { DrawnFrame } from '../model/interpolation';
import type { LevelRange } from './camera';
import { floorSprite } from './elevatorPlan';
import { levelTop } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';
import type { SpriteRegistry } from './spriteRegistry';

/** Row of a floor tile where a person's feet are. */
const FEET_ROW = 28;
const PERSON_HEIGHT = 16;

interface DrawnWalker {
  sprite: Sprite;
  textureId: string;
}

/** Draws the people who are not in a car: walking, waiting and on stairs. */
export class PeopleLayer {
  readonly view = new Container();
  private readonly drawn = new Map<string, DrawnWalker>();
  private range: LevelRange | null = null;

  constructor(private readonly sprites: SpriteRegistry) {}

  get count(): number {
    return this.drawn.size;
  }

  show(frame: DrawnFrame): void {
    const present = new Set<string>();
    for (const { person, x, position } of frame.people) {
      if (person.mode === 'ride') {
        continue;
      }
      present.add(person.id);
      const walker = this.drawn.get(person.id) ?? this.create(person.id);
      const look = floorSprite(person, x);
      const variant = { state: look.state, frame: look.frame };
      const textureId = this.sprites.idOf(look.subject, variant);
      if (walker.textureId !== textureId) {
        walker.sprite.texture = this.sprites.variant(look.subject, variant);
        walker.textureId = textureId;
      }
      walker.sprite.scale.x = person.facing === 'left' ? -1 : 1;
      walker.sprite.position.set(
        Math.round(x * TILE_WIDTH + walker.sprite.texture.width / 2),
        levelTop(Math.round(position)) + FEET_ROW - PERSON_HEIGHT,
      );
      walker.sprite.visible = this.isOnScreen(walker.sprite);
    }
    for (const [id, walker] of this.drawn) {
      if (!present.has(id)) {
        walker.sprite.destroy();
        this.drawn.delete(id);
      }
    }
  }

  showOnly(range: LevelRange): void {
    this.range = range;
    for (const walker of this.drawn.values()) {
      walker.sprite.visible = this.isOnScreen(walker.sprite);
    }
  }

  private create(id: string): DrawnWalker {
    const sprite = new Sprite();
    sprite.anchor.set(0.5, 0);
    this.view.addChild(sprite);
    const walker = { sprite, textureId: '' };
    this.drawn.set(id, walker);
    return walker;
  }

  private isOnScreen(sprite: Sprite): boolean {
    if (this.range === null) {
      return true;
    }
    const top = levelTop(this.range.highest);
    const bottom = levelTop(this.range.lowest) + FLOOR_HEIGHT;
    return sprite.y >= top && sprite.y < bottom;
  }
}
