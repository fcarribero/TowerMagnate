import { describe, expect, it } from 'vitest';
import { StressCrowd } from './stressCrowd';

const options = { people: 1000, floors: 100, shafts: 4, riders: 0.05, churn: 0.02 };

describe('StressCrowd', () => {
  it('keeps the crowd size while people come and go', () => {
    const crowd = new StressCrowd(options);
    const firstIds = new Set(crowd.frame(0).people.map(({ person }) => person.id));
    for (let step = 0; step < 10; step++) crowd.step();
    const ids = crowd.frame(1).people.map(({ person }) => person.id);
    expect(crowd.peopleCount).toBe(1000);
    expect(ids.filter((id) => !firstIds.has(id)).length).toBeGreaterThan(50);
  });

  it('spreads people over every floor and puts riders in cars', () => {
    const { people, cars } = new StressCrowd(options).frame(0);
    const levels = new Set(people.map(({ person }) => person.level));
    expect(levels.size).toBeGreaterThan(90);
    expect(cars.size).toBe(4);
    const riders = people.filter(({ person }) => person.mode === 'ride');
    expect(riders.length).toBeGreaterThan(20);
    for (const rider of riders) {
      expect(cars.get(`${rider.person.carRef?.shaftId}#0`)?.position).toBe(rider.position);
    }
  });

  it('moves walkers between the two last steps', () => {
    const crowd = new StressCrowd({ ...options, churn: 0 });
    crowd.step();
    const walker = crowd.frame(1).people.find(({ person }) => person.mode === 'walk');
    const halfway = crowd.frame(0.5).people.find(({ person }) => person.id === walker?.person.id);
    expect(Math.abs((walker?.x ?? 0) - (halfway?.x ?? 0))).toBe(0.25);
  });

  it('is the same crowd on every run', () => {
    const ids = (crowd: StressCrowd) => crowd.frame(0).people.map(({ person }) => person.x);
    expect(ids(new StressCrowd(options))).toEqual(ids(new StressCrowd(options)));
  });
});
