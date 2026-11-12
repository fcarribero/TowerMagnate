import type { ShaftView } from '@tower-magnate/shared';
import { Container, Sprite } from 'pixi.js';
import type { DrawnCar, DrawnFrame, DrawnPerson } from '../model/interpolation';
import { carKey } from '../model/gameState';
import type { LevelRange } from './camera';
import { CulledRows } from './culledRows';
import { carInRange, carOrigin, planShaft, riderPlace, riderSprite } from './elevatorPlan';
import { FOLLOWED_MARKER_LIFT, newFollowedMarker } from './followedMarker';
import { levelTop } from './levels';
import type { SpriteRegistry } from './spriteRegistry';

interface DrawnRider {
  sprite: Sprite;
  textureId: string;
}

interface DrawnShaftCar {
  view: Container;
  body: Sprite;
  /** Texture id of the body, so it changes only when the doors do. */
  bodyTextureId: string;
  riders: Map<string, DrawnRider>;
  /** Lamp markers of the followed riders, which show even behind closed doors. */
  markers: Map<string, Sprite>;
  /** Dense level index the car was last drawn at. */
  position: number;
}

/**
 * Draws elevator shafts, which change only when the tower does, and their cars,
 * which move on every frame. A car holds the people riding in it, so they move with it.
 */
export class ElevatorLayer {
  /** Shafts go under the units, cars over them. */
  readonly shaftView = new Container();
  readonly carView = new Container();
  private readonly rows = new CulledRows<Container>();
  private readonly levelContainers = new Map<number, Container>();
  private readonly shaftPieces = new Map<string, Sprite[]>();
  private readonly shaftsDrawn = new Map<string, ShaftView>();
  private readonly cars = new Map<string, DrawnShaftCar>();
  /** Rider sprites no car is using, kept so doors opening and closing do not create new ones. */
  private readonly spareRiders: Sprite[] = [];
  private readonly spareMarkers: Sprite[] = [];
  private followed: ReadonlySet<string> = new Set();
  private range: LevelRange | null = null;

  constructor(private readonly sprites: SpriteRegistry) {}

  get shaftCount(): number {
    return this.shaftsDrawn.size;
  }

  get carCount(): number {
    return this.cars.size;
  }

  /** Followed people carry a lamp marker over the head, also inside a car. */
  markFollowed(followed: ReadonlySet<string>): void {
    this.followed = followed;
  }

  showShafts(shafts: Iterable<ShaftView>): void {
    const keep = new Map<string, ShaftView>();
    for (const shaft of shafts) {
      keep.set(shaft.id, shaft);
    }
    for (const id of [...this.shaftsDrawn.keys()]) {
      if (keep.get(id) !== this.shaftsDrawn.get(id)) {
        this.removeShaft(id);
      }
    }
    for (const [id, shaft] of keep) {
      if (!this.shaftsDrawn.has(id)) {
        this.addShaft(shaft);
      }
    }
  }

  showCars(frame: DrawnFrame, shafts: ReadonlyMap<string, ShaftView>): void {
    const ridersByCar = groupRiders(frame.people);
    for (const key of [...this.cars.keys()]) {
      const car = this.cars.get(key);
      if (car !== undefined && !frame.cars.has(key)) {
        this.releaseRiders(car, NO_RIDERS);
        this.releaseMarkers(car, NO_RIDERS);
        car.view.destroy({ children: true });
        this.cars.delete(key);
      }
    }
    for (const drawn of frame.cars.values()) {
      const shaft = shafts.get(drawn.car.shaftId);
      if (shaft !== undefined) {
        this.placeCar(drawn, shaft, ridersByCar.get(drawn.key) ?? []);
      }
    }
  }

  showOnly(range: LevelRange): void {
    this.range = range;
    this.rows.showOnly(range);
    for (const car of this.cars.values()) {
      car.view.visible = carInRange(car.position, range);
    }
  }

  private addShaft(shaft: ShaftView): void {
    const sprites: Sprite[] = [];
    for (const piece of planShaft(shaft)) {
      const sprite = new Sprite(this.sprites.variant(piece.sprite, {}));
      sprite.position.set(piece.x, piece.y);
      this.containerFor(piece.index).addChild(sprite);
      sprites.push(sprite);
    }
    this.shaftPieces.set(shaft.id, sprites);
    this.shaftsDrawn.set(shaft.id, shaft);
  }

  private removeShaft(id: string): void {
    for (const sprite of this.shaftPieces.get(id) ?? []) {
      sprite.destroy();
    }
    this.shaftPieces.delete(id);
    this.shaftsDrawn.delete(id);
  }

  private containerFor(index: number): Container {
    const existing = this.levelContainers.get(index);
    if (existing !== undefined) {
      return existing;
    }
    const container = new Container();
    container.y = levelTop(index);
    this.levelContainers.set(index, container);
    this.rows.set(index, container);
    this.shaftView.addChild(container);
    return container;
  }

  private placeCar(drawn: DrawnCar, shaft: ShaftView, riders: DrawnPerson[]): void {
    const car = this.cars.get(drawn.key) ?? this.createCar(drawn.key);
    const origin = carOrigin(shaft, drawn.position);
    car.position = drawn.position;
    car.view.position.set(origin.x, origin.y);
    const subject = `transport/${shaft.type}-car`;
    const bodyTextureId = this.sprites.idOf(subject, { state: drawn.car.doors });
    if (car.bodyTextureId !== bodyTextureId) {
      car.body.texture = this.sprites.variant(subject, { state: drawn.car.doors });
      car.bodyTextureId = bodyTextureId;
    }
    car.view.visible = this.range === null || carInRange(drawn.position, this.range);
    if (car.view.visible) {
      this.placeRiders(car, shaft, drawn.car.doors === 'open' ? riders : NO_RIDERS);
      this.placeMarkers(car, shaft, riders);
    }
  }

  private createCar(key: string): DrawnShaftCar {
    const body = new Sprite();
    const view = new Container();
    view.addChild(body);
    this.carView.addChild(view);
    const car = {
      view,
      body,
      bodyTextureId: '',
      riders: new Map<string, DrawnRider>(),
      markers: new Map<string, Sprite>(),
      position: 0,
    };
    this.cars.set(key, car);
    return car;
  }

  private releaseRiders(car: DrawnShaftCar, riders: readonly DrawnPerson[]): void {
    if (car.riders.size === 0) return;
    for (const [id, rider] of car.riders) {
      if (riders.some((drawn) => drawn.person.id === id)) continue;
      rider.sprite.removeFromParent();
      this.spareRiders.push(rider.sprite);
      car.riders.delete(id);
    }
  }

  private releaseMarkers(car: DrawnShaftCar, riders: readonly DrawnPerson[]): void {
    for (const [id, marker] of car.markers) {
      if (riders.some((drawn) => drawn.person.id === id && this.followed.has(id))) continue;
      marker.removeFromParent();
      marker.visible = false;
      this.spareMarkers.push(marker);
      car.markers.delete(id);
    }
  }

  private placeMarkers(car: DrawnShaftCar, shaft: ShaftView, riders: readonly DrawnPerson[]): void {
    this.releaseMarkers(car, riders);
    if (this.followed.size === 0) return;
    riders.forEach(({ person }, n) => {
      if (!this.followed.has(person.id)) return;
      let marker = car.markers.get(person.id);
      if (marker === undefined) {
        marker = this.spareMarkers.pop() ?? newFollowedMarker();
        marker.visible = true;
        car.view.addChild(marker);
        car.markers.set(person.id, marker);
      }
      const look = riderSprite(person);
      const place = riderPlace(shaft.type, n);
      const width = this.sprites.variant(look.subject, { state: look.state }).width;
      marker.position.set(place.x + width / 2, place.y - FOLLOWED_MARKER_LIFT);
    });
  }

  private takeRiderSprite(): Sprite {
    return this.spareRiders.pop() ?? new Sprite();
  }

  private placeRiders(car: DrawnShaftCar, shaft: ShaftView, riders: readonly DrawnPerson[]): void {
    this.releaseRiders(car, riders);
    riders.forEach(({ person }, n) => {
      const look = riderSprite(person);
      const textureId = this.sprites.idOf(look.subject, { state: look.state });
      let rider = car.riders.get(person.id);
      if (rider === undefined) {
        rider = { sprite: this.takeRiderSprite(), textureId: '' };
        car.view.addChild(rider.sprite);
        car.riders.set(person.id, rider);
      }
      if (rider.textureId !== textureId) {
        rider.sprite.texture = this.sprites.variant(look.subject, { state: look.state });
        rider.textureId = textureId;
      }
      const place = riderPlace(shaft.type, n);
      rider.sprite.position.set(place.x, place.y);
    });
  }
}

const NO_RIDERS: readonly DrawnPerson[] = [];

function groupRiders(people: readonly DrawnPerson[]): Map<string, DrawnPerson[]> {
  const grouped = new Map<string, DrawnPerson[]>();
  for (const drawn of people) {
    if (drawn.person.mode !== 'ride' || drawn.person.carRef === null) {
      continue;
    }
    const key = carKey(drawn.person.carRef);
    const list = grouped.get(key) ?? [];
    list.push(drawn);
    grouped.set(key, list);
  }
  return grouped;
}
