import type { ShaftView } from '@tower-magnate/shared';
import { Container, Sprite } from 'pixi.js';
import type { DrawnCar, DrawnFrame, DrawnPerson } from '../model/interpolation';
import { carKey } from '../model/gameState';
import type { LevelRange } from './camera';
import { CulledRows } from './culledRows';
import { carInRange, carOrigin, planShaft, riderPlace, riderSprite } from './elevatorPlan';
import { levelTop } from './levels';
import type { SpriteRegistry } from './spriteRegistry';

interface DrawnRider {
  sprite: Sprite;
  textureId: string;
}

interface DrawnShaftCar {
  view: Container;
  body: Sprite;
  riders: Map<string, DrawnRider>;
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
  private range: LevelRange | null = null;

  constructor(private readonly sprites: SpriteRegistry) {}

  get shaftCount(): number {
    return this.shaftsDrawn.size;
  }

  get carCount(): number {
    return this.cars.size;
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
      if (!frame.cars.has(key)) {
        this.cars.get(key)?.view.destroy({ children: true });
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
    car.body.texture = this.sprites.variant(subject, { state: drawn.car.doors });
    car.view.visible = this.range === null || carInRange(drawn.position, this.range);
    this.placeRiders(car, shaft, drawn.car.doors === 'open' ? riders : []);
  }

  private createCar(key: string): DrawnShaftCar {
    const body = new Sprite();
    const view = new Container();
    view.addChild(body);
    this.carView.addChild(view);
    const car = { view, body, riders: new Map<string, DrawnRider>(), position: 0 };
    this.cars.set(key, car);
    return car;
  }

  private placeRiders(car: DrawnShaftCar, shaft: ShaftView, riders: DrawnPerson[]): void {
    const present = new Set(riders.map((rider) => rider.person.id));
    for (const [id, rider] of car.riders) {
      if (!present.has(id)) {
        rider.sprite.destroy();
        car.riders.delete(id);
      }
    }
    riders.forEach(({ person }, n) => {
      const look = riderSprite(person);
      const textureId = this.sprites.idOf(look.subject, { state: look.state });
      let rider = car.riders.get(person.id);
      if (rider === undefined) {
        rider = { sprite: new Sprite(), textureId: '' };
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
