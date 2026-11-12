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
const GUEST_TINT = 0xffe9a8;
const NO_TINT = 0xffffff;

interface DrawnWalker {
  sprite: Sprite;
  subject: string;
  state: string;
  frame: number | undefined;
  /** Number of the last frame this person was in. */
  seenIn: number;
}

/**
 * Draws the people who are not in a car: walking, waiting and on stairs.
 * Only people on screen hold a sprite. Sprites of people who leave the frame
 * or the screen are hidden and reused for the next ones, so a sprite is drawn
 * as soon as it is taken and the pool stays at the peak number on screen.
 */
export class PeopleLayer {
  readonly view = new Container();
  private readonly drawn = new Map<string, DrawnWalker>();
  private readonly spare: Sprite[] = [];
  private range: LevelRange | null = null;
  private frameNumber = 0;
  private guests: ReadonlySet<string> = new Set();

  constructor(private readonly sprites: SpriteRegistry) {}

  get count(): number {
    return this.drawn.size;
  }

  /** Sprites waiting to be reused. */
  get spareCount(): number {
    return this.spare.length;
  }

  /** All sprites the layer made, shown or spare. */
  get spriteCount(): number {
    return this.view.children.length;
  }

  /** People on the wedding guest list are drawn with a warm tint on their way to the cathedral. */
  markGuests(guests: ReadonlySet<string>): void {
    this.guests = guests;
  }

  show(frame: DrawnFrame): void {
    this.frameNumber += 1;
    for (const { person, x, position } of frame.people) {
      if (person.mode === 'ride') {
        continue;
      }
      const top = levelTop(Math.round(position)) + FEET_ROW - PERSON_HEIGHT;
      if (!this.isOnScreen(top)) {
        continue;
      }
      const walker = this.drawn.get(person.id) ?? this.create(person.id);
      walker.seenIn = this.frameNumber;
      const sprite = walker.sprite;
      const look = floorSprite(person, x);
      if (
        look.subject !== walker.subject ||
        look.state !== walker.state ||
        look.frame !== walker.frame
      ) {
        sprite.texture = this.sprites.variant(look.subject, {
          state: look.state,
          frame: look.frame,
        });
        walker.subject = look.subject;
        walker.state = look.state;
        walker.frame = look.frame;
      }
      sprite.tint = this.guests.has(person.id) ? GUEST_TINT : NO_TINT;
      sprite.scale.x = person.facing === 'left' ? -1 : 1;
      sprite.position.set(Math.round(x * TILE_WIDTH + sprite.texture.width / 2), top);
    }
    this.releaseMissing();
  }

  /** People who come into the range get their sprite on the next frame. */
  showOnly(range: LevelRange): void {
    this.range = range;
    for (const [id, walker] of this.drawn) {
      if (!this.isOnScreen(walker.sprite.y)) {
        this.release(id, walker);
      }
    }
  }

  private create(id: string): DrawnWalker {
    const sprite = this.spare.pop() ?? this.newSprite();
    sprite.visible = true;
    const walker: DrawnWalker = { sprite, subject: '', state: '', frame: undefined, seenIn: 0 };
    this.drawn.set(id, walker);
    return walker;
  }

  private newSprite(): Sprite {
    const sprite = new Sprite();
    sprite.anchor.set(0.5, 0);
    this.view.addChild(sprite);
    return sprite;
  }

  private releaseMissing(): void {
    for (const [id, walker] of this.drawn) {
      if (walker.seenIn !== this.frameNumber) {
        this.release(id, walker);
      }
    }
  }

  private release(id: string, walker: DrawnWalker): void {
    walker.sprite.visible = false;
    this.spare.push(walker.sprite);
    this.drawn.delete(id);
  }

  private isOnScreen(spriteTop: number): boolean {
    if (this.range === null) {
      return true;
    }
    const top = levelTop(this.range.highest);
    const bottom = levelTop(this.range.lowest) + FLOOR_HEIGHT;
    return spriteTop >= top && spriteTop < bottom;
  }
}
