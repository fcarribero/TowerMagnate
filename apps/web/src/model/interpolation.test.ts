import { indexToLevel, levelToIndex, type CarView, type PersonView } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { car, delta, shaft, snapshot, walker } from '../testing/protocolFixtures';
import type { StoreFrames } from './clientStore';
import { applyDelta, stateFromSnapshot, type GameState } from './gameState';
import { CAR_SNAP_GAP_STEPS, drawnFrame, progressSince } from './interpolation';

const start = stateFromSnapshot(snapshot);

function frames(previous: GameState | null, latest: GameState): StoreFrames {
  return { previous, latest, latestArrivedAtMs: 0 };
}

function stepped(step: number, cars: CarView[], people: PersonView[]): StoreFrames {
  const before = applyDelta(
    start,
    delta({ step, cars: cars.slice(0, 1), people: people.slice(0, 1) }),
  );
  const after = applyDelta(
    before,
    delta({ step: step + 2, cars: cars.slice(1), people: people.slice(1) }),
  );
  return frames(before, after);
}

function carAt(position: number): CarView {
  return { ...car, position };
}

function personAt(fields: Partial<PersonView>): PersonView {
  return { ...walker, ...fields };
}

describe('progressSince', () => {
  it('runs from 0 when a delta arrives to 1 one delta interval later', () => {
    expect(progressSince(1000, 1000)).toBe(0);
    expect(progressSince(1000, 1100)).toBe(0.5);
    expect(progressSince(1000, 1600)).toBe(1);
    expect(progressSince(1000, 900)).toBe(0);
  });
});

describe('drawnFrame cars', () => {
  it('draws a car between its two buffered positions', () => {
    const drawn = drawnFrame(stepped(101, [carAt(10), carAt(14)], [walker, walker]), 0.25);
    expect(drawn.cars.get('s4#0')?.position).toBe(11);
  });

  it('crosses from S1 to floor 1 without passing a level 0', () => {
    const s1 = levelToIndex(-1);
    const floor1 = levelToIndex(1);
    expect(floor1 - s1).toBe(1);
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const position = drawnFrame(
        stepped(101, [carAt(s1), carAt(floor1)], [walker, walker]),
        progress,
      ).cars.get('s4#0')?.position;
      expect(position).toBeGreaterThanOrEqual(s1);
      expect(position).toBeLessThanOrEqual(floor1);
      expect([-1, 1]).toContain(indexToLevel(Math.round(position ?? -1)));
    }
  });

  it('snaps a car that is new in the latest delta', () => {
    const newCar = { ...carAt(20), index: 1 };
    const drawn = drawnFrame(stepped(101, [carAt(10), newCar], [walker, walker]), 0.5);
    expect(drawn.cars.get('s4#1')?.position).toBe(20);
    expect(drawn.cars.has('s4#0')).toBe(false);
  });

  it(`snaps every car when the buffered deltas are more than ${CAR_SNAP_GAP_STEPS} steps apart`, () => {
    const before = applyDelta(start, delta({ step: 101, cars: [carAt(10)] }));
    const after = applyDelta(
      before,
      delta({ step: 101 + CAR_SNAP_GAP_STEPS + 1, cars: [carAt(30)] }),
    );
    expect(drawnFrame(frames(before, after), 0.5).cars.get('s4#0')?.position).toBe(30);
  });

  it('still glides across a gap of exactly the limit', () => {
    const before = applyDelta(start, delta({ step: 101, cars: [carAt(10)] }));
    const after = applyDelta(before, delta({ step: 101 + CAR_SNAP_GAP_STEPS, cars: [carAt(30)] }));
    expect(drawnFrame(frames(before, after), 0.5).cars.get('s4#0')?.position).toBe(20);
  });

  it('draws the snapshot as it is', () => {
    expect(drawnFrame(frames(null, start), 0.5).cars.get('s4#0')?.position).toBe(car.position);
  });
});

describe('drawnFrame people', () => {
  it('moves a walker along the same level', () => {
    const drawn = drawnFrame(
      stepped(101, [car, car], [personAt({ x: 20 }), personAt({ x: 24 })]),
      0.5,
    );
    expect(drawn.people[0]?.x).toBe(22);
    expect(drawn.people[0]?.position).toBe(levelToIndex(2));
  });

  it('snaps a person who changed level', () => {
    const drawn = drawnFrame(
      stepped(
        101,
        [car, car],
        [personAt({ x: 20 }), personAt({ x: 24, level: 3, mode: 'stairs' })],
      ),
      0.5,
    );
    expect(drawn.people[0]?.x).toBe(24);
    expect(drawn.people[0]?.position).toBe(levelToIndex(3));
  });

  it('draws a rider inside its car at the car position', () => {
    const rider = personAt({ x: 5, level: 9, mode: 'ride', carRef: { shaftId: 's4', index: 0 } });
    const drawn = drawnFrame(stepped(101, [carAt(10), carAt(14)], [walker, rider]), 0.5);
    expect(drawn.people[0]).toMatchObject({ x: shaft.x, position: 12 });
  });

  it('keeps a person who just stepped out of a car in the car until the car has arrived', () => {
    const rider = personAt({ x: 5, mode: 'ride', carRef: { shaftId: 's4', index: 0 } });
    const frame = stepped(101, [car, car], [rider, personAt({ x: 102 })]);
    expect(drawnFrame(frame, 0.5).people[0]?.x).toBe(shaft.x);
  });

  it('leaves out people inside units and riders of unknown cars', () => {
    const inside = personAt({ id: 'p2', mode: 'inside' });
    const lost = personAt({ id: 'p3', mode: 'ride', carRef: { shaftId: 's9', index: 0 } });
    const latest = applyDelta(start, delta({ people: [walker, inside, lost] }));
    expect(drawnFrame(frames(start, latest), 1).people.map((drawn) => drawn.person.id)).toEqual([
      'p1',
    ]);
  });
});
