import { levelToIndex, type CarView, type PersonView, type ShaftView } from '@tower-magnate/shared';
import type { DrawnCar, DrawnFrame, DrawnPerson } from '../model/interpolation';
import { carKey } from '../model/gameState';
import { TOWER_WIDTH_TILES } from '../render/metrics';

const STRESSES = ['normal', 'stressed', 'veryStressed'] as const;
const WALK_STEP_COLUMNS = 0.5;
const SHAFT_SPACING_COLUMNS = 40;
const FIRST_SHAFT_COLUMN = 20;
const CAR_STEP_LEVELS = 0.25;

export interface StressCrowdOptions {
  people: number;
  floors: number;
  shafts: number;
  /** Share of the people who ride a car, from 0 to 1. */
  riders: number;
  /** Share of the people replaced by new ones on each step, from 0 to 1. */
  churn: number;
}

interface CrowdCar {
  view: CarView;
  heading: 1 | -1;
}

/**
 * A made-up crowd that moves like server deltas would: on each step people walk
 * half a column, cars move a quarter level and a few people leave while as many arrive.
 * Frames are drawn between the last two steps, as the client does.
 */
export class StressCrowd {
  readonly shafts: ShaftView[];
  private readonly shaftById: Map<string, ShaftView>;
  private previous = new Map<string, PersonView>();
  private latest = new Map<string, PersonView>();
  private readonly cars = new Map<string, CrowdCar>();
  private nextId = 0;
  private seed = 1;

  constructor(private readonly options: StressCrowdOptions) {
    this.shafts = Array.from({ length: options.shafts }, (_, index) => ({
      id: `s${index}`,
      type: 'standard',
      x: FIRST_SHAFT_COLUMN + index * SHAFT_SPACING_COLUMNS,
      bottom: 1,
      top: options.floors,
      stops: Array.from({ length: options.floors }, (_, level) => level + 1),
    }));
    this.shaftById = new Map(this.shafts.map((shaft) => [shaft.id, shaft]));
    for (const shaft of this.shafts) {
      const car: CarView = {
        shaftId: shaft.id,
        index: 0,
        position: levelToIndex(1 + this.random(options.floors)),
        direction: 'up',
        doors: 'closed',
        load: 0,
      };
      this.cars.set(carKey(car), { view: car, heading: 1 });
    }
    for (let count = 0; count < options.people; count++) {
      const person = this.newPerson();
      this.latest.set(person.id, person);
    }
    this.previous = this.latest;
  }

  get peopleCount(): number {
    return this.latest.size;
  }

  step(): void {
    this.previous = this.latest;
    this.latest = new Map();
    for (const person of this.previous.values()) {
      if (this.random(1000) < this.options.churn * 1000) {
        const arriving = this.newPerson();
        this.latest.set(arriving.id, arriving);
      } else {
        this.latest.set(person.id, walked(person));
      }
    }
    for (const car of this.cars.values()) {
      this.moveCar(car);
    }
  }

  /** Cars and people `progress` (0 to 1) of the way from the previous step to the latest. */
  frame(progress: number): DrawnFrame {
    const cars = new Map<string, DrawnCar>();
    for (const [key, { view }] of this.cars) {
      cars.set(key, { key, car: view, position: view.position });
    }
    const people: DrawnPerson[] = [];
    for (const person of this.latest.values()) {
      if (person.carRef !== null) {
        const car = cars.get(carKey(person.carRef));
        const shaft = this.shaftById.get(person.carRef.shaftId);
        if (car !== undefined && shaft !== undefined) {
          people.push({ person, x: shaft.x, position: car.position });
        }
        continue;
      }
      const before = this.previous.get(person.id);
      const x = before === undefined ? person.x : before.x + (person.x - before.x) * progress;
      people.push({ person, x, position: levelToIndex(person.level) });
    }
    return { cars, people };
  }

  private newPerson(): PersonView {
    const id = `p${this.nextId++}`;
    const rides = this.shafts.length > 0 && this.random(1000) < this.options.riders * 1000;
    const shaft = this.shafts[this.random(this.shafts.length)];
    const waits = this.random(10) < 3;
    return {
      id,
      kind: 'officeWorker',
      x: this.random(TOWER_WIDTH_TILES - 2),
      level: 1 + this.random(this.options.floors),
      facing: this.random(2) === 0 ? 'left' : 'right',
      mode: rides ? 'ride' : waits ? 'wait' : 'walk',
      carRef: rides && shaft !== undefined ? { shaftId: shaft.id, index: 0 } : null,
      stress: STRESSES[this.random(STRESSES.length)] ?? 'normal',
    };
  }

  private moveCar(car: CrowdCar): void {
    const lowest = levelToIndex(1);
    const highest = levelToIndex(this.options.floors);
    let position = car.view.position + car.heading * CAR_STEP_LEVELS;
    if (position <= lowest || position >= highest) {
      car.heading = car.heading === 1 ? -1 : 1;
      position = Math.min(Math.max(position, lowest), highest);
    }
    car.view = { ...car.view, position, direction: car.heading === 1 ? 'up' : 'down' };
  }

  /** A whole number from 0 to `below - 1`, the same sequence on every run (mulberry32). */
  private random(below: number): number {
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let mixed = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) % Math.max(below, 1);
  }
}

function walked(person: PersonView): PersonView {
  if (person.mode !== 'walk') {
    return person;
  }
  const step = person.facing === 'left' ? -WALK_STEP_COLUMNS : WALK_STEP_COLUMNS;
  const x = person.x + step;
  if (x < 0 || x > TOWER_WIDTH_TILES - 2) {
    return { ...person, facing: person.facing === 'left' ? 'right' : 'left' };
  }
  return { ...person, x };
}
