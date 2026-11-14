import type { DrawnFlight } from '../model/interpolation';

/** The footprint of a stair or escalator, with the dense index of the lower level it joins. */
export interface FlightSpan {
  x: number;
  width: number;
  lowerIndex: number;
  kind: 'stairs' | 'escalator';
}

export interface FlightPose {
  x: number;
  /** Dense level index as a float. */
  position: number;
  facing: 'left' | 'right';
}

/** The span whose columns hold a person who stands on the flight at `level` (a dense index). */
export function findFlightSpan(
  spans: ReadonlyMap<number, readonly FlightSpan[]>,
  levelIndex: number,
  up: boolean,
  x: number,
): FlightSpan | undefined {
  const lower = up ? levelIndex : levelIndex - 1;
  return spans.get(lower)?.find((span) => x >= span.x - 1 && x < span.x + span.width + 1);
}

/** Columns of flat landing on each side of an escalator; the climb takes the columns between. */
const ESCALATOR_LANDING = 2;

/**
 * Where a person is on a flight that rises from the bottom left to the top right. Stairs are a
 * steady climb over the flight's columns and one level. An escalator is flat over its first 2
 * columns, climbs over the middle ones and is flat over the last 2. Going down is the same line
 * walked the other way. `progress` is 0 at the entry and 1 at the exit.
 */
export function flightPose(span: FlightSpan, up: boolean, progress: number): FlightPose {
  const along = Math.min(Math.max(progress, 0), 1);
  const reach = span.width - 1;
  // Fraction of the climb done when the person has walked `along` of the way up the flight.
  const climbed = (fraction: number): number => {
    if (span.kind !== 'escalator') return fraction;
    const run = span.width - 2 * ESCALATOR_LANDING;
    const column = fraction * span.width;
    return Math.min(Math.max((column - ESCALATOR_LANDING) / run, 0), 1);
  };
  if (up) {
    return {
      x: span.x + along * reach,
      position: span.lowerIndex + climbed(along),
      facing: 'right',
    };
  }
  return {
    x: span.x + (1 - along) * reach,
    position: span.lowerIndex + climbed(1 - along),
    facing: 'left',
  };
}

/**
 * Where a person who is on a flight, or has just got off it, is drawn. After the exit the person
 * walks from the end of the flight to the column and level they have in the latest state.
 */
export function drawnOnFlight(
  span: FlightSpan,
  flight: DrawnFlight,
  landed: { x: number; positionIndex: number },
): FlightPose {
  const pose = flightPose(span, flight.up, flight.progress);
  if (flight.walked <= 0) return pose;
  const walk = Math.min(flight.walked, 1);
  return {
    x: pose.x + (landed.x - pose.x) * walk,
    position: landed.positionIndex,
    facing: landed.x < pose.x ? 'left' : 'right',
  };
}
