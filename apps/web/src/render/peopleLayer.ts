import { UNIT_CATALOG, levelToIndex, type PersonView, type UnitType } from '@tower-magnate/shared';
import { Container, Sprite } from 'pixi.js';
import type { DrawnFlight, DrawnFrame } from '../model/interpolation';
import type { LevelRange, WorldRect } from './camera';
import { floorSprite } from './elevatorPlan';
import { fitFollowedMarker, newFollowedMarker } from './followedMarker';
import { animationNow, isAnimationPaused } from './animationClock';
import { drawnOnFlight, findFlightSpan, type FlightPose, type FlightSpan } from './flightMotion';
import { insideLook, type UnitSpan } from './insideMotion';
import { levelTop } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';
import { FRAME_HEIGHT, FRAME_WIDTH } from './personLook';
import { PersonRig, type PersonPose } from './personRig';
import type { SpriteRegistry } from './spriteRegistry';

/** Row of a floor tile where a person's feet are. */
const FEET_ROW = 28;
/** Columns a person takes, so the ones inside a unit stay within its walls. */
const INSIDE_PERSON_COLUMNS = 2;
const GUEST_TINT = 0xffe9a8;
const NO_TINT = 0xffffff;
const PERSON_HEIGHT = FRAME_HEIGHT;
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
  sprite: Container;
  rig: PersonRig;
  /** Row of the sprite top a person of average height has, the one used to cull by floor. */
  top: number;
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
  private readonly spare: DrawnWalker[] = [];
  private range: LevelRange | null = null;
  private frameNumber = 0;
  /** Counts the frames drawn while the game runs; idle animations follow it. */
  private idleFrames = 0;
  private guests: ReadonlySet<string> = new Set();
  private followed: ReadonlySet<string> = new Set();

  /** Units by level, which is where the people inside move around. */
  private unitsByLevel = new Map<number, UnitSpan[]>();

  /** Stairs and escalators by the dense index of the lower level they join. */
  private flightsByLevel = new Map<number, FlightSpan[]>();

  constructor(
    private readonly sprites: SpriteRegistry,
    private readonly now: () => number = animationNow,
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

  /** The stairs and escalators people climb. */
  setTransports(transports: Iterable<{ type: UnitType; x: number; level: number }>): void {
    const byLevel = new Map<number, FlightSpan[]>();
    for (const transport of transports) {
      const lowerIndex = levelToIndex(transport.level);
      const spans = byLevel.get(lowerIndex) ?? [];
      spans.push({
        x: transport.x,
        width: UNIT_CATALOG[transport.type].width,
        lowerIndex,
        kind: transport.type === 'escalator' ? 'escalator' : 'stairs',
      });
      byLevel.set(lowerIndex, spans);
    }
    this.flightsByLevel = byLevel;
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

  /** Where a person is drawn now, in world pixels, or undefined when no sprite holds them. */
  rectOf(id: string): WorldRect | undefined {
    const root = this.drawn.get(id)?.sprite;
    if (root === undefined || !root.visible) {
      return undefined;
    }
    const width = FRAME_WIDTH * Math.abs(root.scale.x);
    const height = FRAME_HEIGHT * root.scale.y;
    return { x: root.position.x - width / 2, y: root.position.y - height, width, height };
  }

  show(frame: DrawnFrame): void {
    this.frameNumber += 1;
    if (!isAnimationPaused()) {
      this.idleFrames += 1;
    }
    for (const { person, x, position, flight } of frame.people) {
      if (person.mode === 'ride') {
        continue;
      }
      const pose = flight === undefined ? null : this.onFlight(person, flight, x);
      if (pose === null) {
        this.drawPerson(person, x, position, floorSprite(person, x), person.facing);
        continue;
      }
      this.drawPerson(person, pose.x, pose.position, floorSprite(person, pose.x), pose.facing);
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

  /**
   * Where a person on a flight, or just off it, is: climbing the steps at a steady pace from the
   * entry to the exit, then walking on from the exit to the state's column. Null when no stairs
   * are under them.
   */
  private onFlight(person: PersonView, flight: DrawnFlight, landedX: number): FlightPose | null {
    const span = findFlightSpan(
      this.flightsByLevel,
      levelToIndex(flight.level),
      flight.up,
      flight.x,
    );
    if (span === undefined) {
      return null;
    }
    return drawnOnFlight(span, flight, {
      x: landedX,
      positionIndex: levelToIndex(person.level),
    });
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
    placed: PersonPose,
    facing: PersonView['facing'],
  ): void {
    const top = levelTop(position) + FEET_ROW - PERSON_HEIGHT;
    if (!this.isOnScreen(top)) {
      return;
    }
    const walker = this.drawn.get(person.id) ?? this.create(person.id);
    walker.seenIn = this.frameNumber;
    walker.top = top;
    const { rig, sprite } = walker;
    rig.setPose(this.sprites, this.animated(placed, person.id));
    rig.setTint(this.guests.has(person.id) ? GUEST_TINT : NO_TINT);
    const crewShift = person.kind === 'builder' ? ((idlePhase(person.id) % 5) - 2) * 0.3 : 0;
    rig.place((x + crewShift) * TILE_WIDTH + FRAME_WIDTH / 2, top + PERSON_HEIGHT, facing);
    const marker = sprite.children[0] as Sprite;
    marker.visible = this.followed.has(person.id);
    if (marker.visible) {
      fitFollowedMarker(marker, sprite.scale, PERSON_HEIGHT);
    }
  }

  /** A standing person alternates two idle frames; a walking one keeps the walk frame. */
  private animated(look: PersonPose, id: string): PersonPose {
    if (look.state !== 'stand') {
      return look;
    }
    const tick = Math.floor(this.idleFrames / IDLE_FRAME_LENGTH) + idlePhase(id);
    return { look: look.look, state: 'idle', frame: (tick % 2) + 1 };
  }

  /** People who come into the range get their sprite on the next frame. */
  showOnly(range: LevelRange): void {
    this.range = range;
    for (const [id, walker] of this.drawn) {
      if (!this.isOnScreen(walker.top)) {
        this.release(id, walker);
      }
    }
  }

  private create(id: string): DrawnWalker {
    const walker = this.spare.pop() ?? this.newWalker();
    walker.sprite.visible = true;
    walker.seenIn = 0;
    this.drawn.set(id, walker);
    return walker;
  }

  private newWalker(): DrawnWalker {
    const rig = new PersonRig();
    const marker = newFollowedMarker();
    rig.root.addChildAt(marker, 0);
    this.view.addChild(rig.root);
    return { sprite: rig.root, rig, top: 0, seenIn: 0 };
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
    this.spare.push(walker);
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
