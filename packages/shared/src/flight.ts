/**
 * How far a person is along a stair or escalator flight, as the client needs it to draw them
 * climbing. `done` is the number of simulation steps already spent on the flight, `steps` is how
 * long the whole flight lasts and `up` is true when the flight rises to the level above.
 */
export interface FlightProgress {
  done: number;
  steps: number;
  up: boolean;
}

/** Longest flight the packed code can describe, in steps. */
export const MAX_FLIGHT_STEPS = 31;

const STEP_BASE = 32;
const UP_FLAG = STEP_BASE * STEP_BASE;

/** Largest packed code; 0 is "not on a flight". */
export const MAX_FLIGHT_CODE = UP_FLAG + STEP_BASE * STEP_BASE - 1;

/** One positive integer for a flight in progress; the packed person tuple carries it last. */
export function packFlight(flight: FlightProgress): number {
  const steps = Math.min(Math.max(Math.round(flight.steps), 1), MAX_FLIGHT_STEPS);
  const done = Math.min(Math.max(Math.round(flight.done), 0), steps);
  return 1 + done + steps * STEP_BASE + (flight.up ? UP_FLAG : 0);
}

/** The flight a packed code describes, or undefined for 0 and for a missing code. */
export function unpackFlight(code: number | undefined): FlightProgress | undefined {
  if (code === undefined || code <= 0) return undefined;
  const value = code - 1;
  const up = value >= UP_FLAG;
  const rest = up ? value - UP_FLAG : value;
  return { done: rest % STEP_BASE, steps: Math.floor(rest / STEP_BASE), up };
}
