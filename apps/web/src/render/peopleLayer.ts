import { UNIT_CATALOG, levelToIndex, type PersonView, type UnitType } from '@tower-magnate/shared';
import { Container, Sprite } from 'pixi.js';
import type { DrawnFrame } from '../model/interpolation';
import type { LevelRange } from './camera';
import { floorSprite } from './elevatorPlan';
import { newFollowedMarker } from './followedMarker';
import { insideLook, type UnitSpan } from './insideMotion';
import { levelTop } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';
import type { SpriteRegistry } from './spriteRegistry';

/** Row of a floor tile where a person's feet are. */
const FEET_ROW = 28;
const PERSON_HEIGHT = 16;
/** Columns a person takes, so the ones inside a unit stay within its walls. */
const INSIDE_PERSON_COLUMNS = 2;
const GUEST_TINT = 0xffe9a8;
const NO_TINT = 0xffffff;
/** Render frames each idle frame is shown for, about half a second at 60 frames a second. */
const IDLE_FRAME_LENGTH = 30;

/** A small number from the person id, so people who stand together do not breathe in step. */
function idlePhase(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 1009;
  }
  return hash;
}

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
  private followed: ReadonlySet<string> = new Set();
  private readonly markers = new WeakMap<Sprite, Sprite>();

  /** Units by level, which is where the people inside move around. */
  private unitsByLevel = new Map<number, UnitSpan[]>();

  constructor(
    private readonly sprites: SpriteRegistry,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** The units people can be inside of. Floors, lobbies and transports are not rooms. */
  setUnits(units: Iterable<{ type: UnitType; x: number; level: number }>): void {
    const byLevel = new Map<number, UnitSpan[]>();
    for (const unit of units) {
      const spans = byLevel.get(unit.level) ?? [];
      spans.push({ from: unit.x, width: UNIT_CATALOG[unit.type].width });
      byLevel.set(unit.level, spans);
    }
    this.unitsByLevel = byLevel;
  }

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

  /** Followed people carry a small lamp marker above the head. */
  markFollowed(followed: ReadonlySet<string>): void {
    this.followed = followed;
  }

  show(frame: DrawnFrame): void {
    this.frameNumber += 1;
    for (const { person, x, position } of frame.people) {
      if (person.mode === 'ride') {
        continue;
      }
      this.drawPerson(person, x, position, floorSprite(person, x), person.facing);
    }
    const time = this.now();
    for (const person of frame.inside ?? []) {
      const unit = this.unitAt(person);
      if (unit === undefined) {
        continue;
      }
      const look = insideLook(person.id, unit, time, INSIDE_PERSON_COLUMNS);
      const placed = floorSprite({ ...person, mode: look.walking ? 'walk' : 'wait' }, look.x);
      this.drawPerson(person, look.x, levelToIndex(person.level), placed, look.facing);
    }
    this.releaseMissing();
  }

  /** The unit on the person's level whose columns hold them, if there is one. */
  private unitAt(person: PersonView): UnitSpan | undefined {
    return this.unitsByLevel
      .get(person.level)
      ?.find((unit) => person.x >= unit.from - 1 && person.x < unit.from + unit.width + 1);
  }

  private drawPerson(
    person: PersonView,
    x: number,
    position: number,
    placed: { subject: string; state: string; frame?: number },
    facing: PersonView['facing'],
  ): void {
    const top = levelTop(Math.round(position)) + FEET_ROW - PERSON_HEIGHT;
    if (!this.isOnScreen(top)) {
      return;
    }
    const walker = this.drawn.get(person.id) ?? this.create(person.id);
    walker.seenIn = this.frameNumber;
    const sprite = walker.sprite;
    const look = this.animated(placed, person.id);
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
    const marker = this.markers.get(sprite);
    if (marker !== undefined) {
      marker.visible = this.followed.has(person.id);
    }
    sprite.scale.x = facing === 'left' ? -1 : 1;
    sprite.position.set(Math.round(x * TILE_WIDTH + sprite.texture.width / 2), top);
  }

  /** A standing person alternates two idle frames; a walking one keeps the walk frame. */
  private animated(
    look: { subject: string; state: string; frame?: number },
    id: string,
  ): { subject: string; state: string; frame?: number } {
    if (!look.state.startsWith('stand')) {
      return look;
    }
    const tick = Math.floor(this.frameNumber / IDLE_FRAME_LENGTH) + idlePhase(id);
    return {
      subject: look.subject,
      state: look.state.replace('stand', 'idle'),
      frame: (tick % 2) + 1,
    };
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
    const marker = newFollowedMarker();
    sprite.addChild(marker);
    this.markers.set(sprite, marker);
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
