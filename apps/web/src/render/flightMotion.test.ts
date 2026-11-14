import { describe, expect, it } from 'vitest';
import { drawnOnFlight, findFlightSpan, flightPose, type FlightSpan } from './flightMotion';

const span: FlightSpan = { x: 10, width: 4, lowerIndex: 5, kind: 'stairs' };
const escalator: FlightSpan = { x: 20, width: 8, lowerIndex: 5, kind: 'escalator' };

describe('flightPose', () => {
  it('climbs from the foot on the lower level to the top end on the level above', () => {
    expect(flightPose(span, true, 0)).toEqual({ x: 10, position: 5, facing: 'right' });
    expect(flightPose(span, true, 0.5)).toEqual({ x: 11.5, position: 5.5, facing: 'right' });
    expect(flightPose(span, true, 1)).toEqual({ x: 13, position: 6, facing: 'right' });
  });

  it('goes down the same line the other way', () => {
    expect(flightPose(span, false, 0)).toEqual({ x: 13, position: 6, facing: 'left' });
    expect(flightPose(span, false, 1)).toEqual({ x: 10, position: 5, facing: 'left' });
  });

  it('keeps the position between the two levels for any progress', () => {
    for (let step = 0; step <= 12; step += 1) {
      const pose = flightPose(span, true, step / 12);
      expect(pose.position).toBeGreaterThanOrEqual(5);
      expect(pose.position).toBeLessThanOrEqual(6);
    }
  });
});

describe('flightPose on an escalator', () => {
  it('walks flat over the first 2 columns, climbs over the middle 4 and walks flat over the last 2', () => {
    expect(flightPose(escalator, true, 0).position).toBe(5);
    expect(flightPose(escalator, true, 2 / 8).position).toBe(5);
    expect(flightPose(escalator, true, 4 / 8).position).toBeCloseTo(5.5);
    expect(flightPose(escalator, true, 6 / 8).position).toBe(6);
    expect(flightPose(escalator, true, 1).position).toBe(6);
  });

  it('moves x steadily over the whole span and goes down the same line', () => {
    expect(flightPose(escalator, true, 0.5).x).toBeCloseTo(23.5);
    expect(flightPose(escalator, false, 0)).toEqual({ x: 27, position: 6, facing: 'left' });
    expect(flightPose(escalator, false, 1)).toEqual({ x: 20, position: 5, facing: 'left' });
    expect(flightPose(escalator, false, 0.5).position).toBeCloseTo(5.5);
  });

  it('never decreases the position on the way up', () => {
    let last = 5;
    for (let step = 0; step <= 16; step += 1) {
      const { position } = flightPose(escalator, true, step / 16);
      expect(position).toBeGreaterThanOrEqual(last);
      last = position;
    }
  });
});

describe('findFlightSpan', () => {
  const spans = new Map([[5, [span]]]);

  it('finds a flight by the level the person stands on and the direction', () => {
    expect(findFlightSpan(spans, 5, true, 10)).toBe(span);
    expect(findFlightSpan(spans, 6, false, 13)).toBe(span);
  });

  it('finds nothing off the footprint or on another level', () => {
    expect(findFlightSpan(spans, 6, true, 10)).toBeUndefined();
    expect(findFlightSpan(spans, 5, true, 30)).toBeUndefined();
  });
});

describe('drawnOnFlight', () => {
  it('walks from the exit to the landing column after the flight', () => {
    const flight = { level: 3, x: 10, up: true, progress: 1, walked: 0.5 };
    expect(drawnOnFlight(span, flight, { x: 17, positionIndex: 6 })).toEqual({
      x: 15,
      position: 6,
      facing: 'right',
    });
  });

  it('is exactly the exit when the landing column is the exit', () => {
    const flight = { level: 3, x: 10, up: true, progress: 1, walked: 1 };
    expect(drawnOnFlight(span, flight, { x: 13, positionIndex: 6 })).toMatchObject({
      x: 13,
      position: 6,
    });
  });
});
