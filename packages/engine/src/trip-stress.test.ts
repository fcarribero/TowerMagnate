import { describe, expect, it } from 'vitest';
import {
  emptyTripParts,
  tripStress,
  tripStressSoFar,
  type RideStress,
  type TripStressParts,
} from './trip-stress';

function ride(overrides: Partial<RideStress>): RideStress {
  return {
    shaftKind: 'standard',
    waitSteps: 0,
    rideSteps: 0,
    rideFloors: 0,
    direction: 'up',
    boardingLobbyHeight: 1,
    ...overrides,
  };
}

function trip(overrides: Partial<TripStressParts>): TripStressParts {
  return { ...emptyTripParts(), ...overrides };
}

describe('tripStress examples', () => {
  const morning = ride({ waitSteps: 14, rideSteps: 23, rideFloors: 8 });

  it('T1: wait 14 and ride 23 is 37', () => {
    expect(tripStress(trip({ rides: [morning] }))).toBe(37);
  });

  it('T2: a lobby of height 3 cuts the wait to 0, so 23', () => {
    const tall = ride({ ...morning, boardingLobbyHeight: 3 });
    expect(tripStress(trip({ rides: [tall] }))).toBe(23);
  });

  it('T3: 21 slow floors add 30, so 111', () => {
    const long = ride({ waitSteps: 40, rideSteps: 41, rideFloors: 21 });
    expect(tripStress(trip({ rides: [long] }))).toBe(111);
  });

  it('T3 back: no cut going down, so 101', () => {
    const home = ride({
      waitSteps: 30,
      rideSteps: 41,
      rideFloors: 21,
      direction: 'down',
      boardingLobbyHeight: 3,
    });
    expect(tripStress(trip({ rides: [home] }))).toBe(101);
  });

  it('T4: express and a sky lobby ride add no long-trip extra, so 36', () => {
    const express = ride({
      shaftKind: 'express',
      waitSteps: 20,
      rideSteps: 10,
      rideFloors: 14,
      boardingLobbyHeight: 2,
    });
    const standard = ride({ waitSteps: 12, rideSteps: 12, rideFloors: 7 });
    expect(tripStress(trip({ rides: [express, standard] }))).toBe(36);
  });

  it('T5: 2 stair floors and 3 escalator floors is 78', () => {
    expect(tripStress(trip({ stairFloors: 2, escalatorFloors: 3 }))).toBe(78);
  });

  it('T6: two failed searches and a ride are capped at 540', () => {
    const found = ride({ waitSteps: 10, rideSteps: 13, rideFloors: 5 });
    expect(tripStress(trip({ failedSearches: 2, rides: [found] }))).toBe(540);
  });

  it('T7: a full-queue event adds 12, so 67', () => {
    const queued = ride({ waitSteps: 42, rideSteps: 13, rideFloors: 8 });
    expect(tripStress(trip({ fullQueueEvents: 1, rides: [queued] }))).toBe(67);
  });

  it('T8: cut 36 from a wait of 50 and 29 slow floors add 60, so 118', () => {
    const tall = ride({ waitSteps: 50, rideSteps: 44, rideFloors: 29, boardingLobbyHeight: 3 });
    expect(tripStress(trip({ rides: [tall] }))).toBe(118);
  });

  it('T9: three failed searches and the night reset are capped at 540', () => {
    expect(tripStress(trip({ failedSearches: 3, nightReset: true }))).toBe(540);
  });
});

describe('tripStress rules', () => {
  const slowRide = (floors: number) => ride({ rideFloors: floors });

  it.each([
    [14, 0],
    [15, 30],
    [24, 30],
    [25, 60],
  ])('%i slow floors add %i', (floors, extra) => {
    expect(tripStress(trip({ rides: [slowRide(floors)] }))).toBe(extra);
  });

  it('counts stair floors as slow floors', () => {
    const stress = tripStress(trip({ stairFloors: 3, rides: [slowRide(12)] }));
    expect(stress).toBe(3 * 30 + 30);
  });

  it('does not cut the wait of a ride that boards outside a lobby', () => {
    const outside = ride({ waitSteps: 40, boardingLobbyHeight: null });
    expect(tripStress(trip({ rides: [outside] }))).toBe(40);
  });

  it('leaves the long-trip extra out of the stress so far', () => {
    const long = trip({ rides: [slowRide(30)] });
    expect(tripStressSoFar(long)).toBe(0);
    expect(tripStress(long)).toBe(60);
  });

  it('caps the stress so far at 540', () => {
    expect(tripStressSoFar(trip({ failedSearches: 2 }))).toBe(540);
  });
});
