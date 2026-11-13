/** Tiles a person walks per second inside a unit. */
const WALK_SPEED = 1.6;
/** Waypoints in one loop of a person's routine. */
const WAYPOINTS = 4;
const MIN_PAUSE_MS = 1500;
const PAUSE_RANGE_MS = 3500;

export interface UnitSpan {
  /** First column of the unit. */
  from: number;
  /** Number of columns of the unit. */
  width: number;
}

export interface InsideLook {
  /** Column of the person's left edge. */
  x: number;
  facing: 'left' | 'right';
  /** True while the person walks; false while they stand and do something. */
  walking: boolean;
}

function hash(text: string, salt: number): number {
  let value = 2166136261 ^ salt;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  }
  value ^= value >>> 15;
  value = Math.imul(value, 2246822519);
  value ^= value >>> 13;
  return (value >>> 0) / 4294967296;
}

/**
 * Where a person who is inside a unit is at `timeMs`, and what they do. Each person loops over a
 * few waypoints in the unit, walking to one and staying a while before the next. The routine
 * depends only on the person id and the clock, so it needs nothing from the server.
 */
export function insideLook(
  personId: string,
  unit: UnitSpan,
  timeMs: number,
  personWidth: number,
): InsideLook {
  const room = Math.max(unit.width - personWidth, 0);
  const point = (index: number): number =>
    unit.from + Math.round(hash(personId, index) * room * 4) / 4;
  const pause = (index: number): number =>
    MIN_PAUSE_MS + hash(personId, 100 + index) * PAUSE_RANGE_MS;
  const walkMs = (index: number): number => {
    const next = (index + 1) % WAYPOINTS;
    return (Math.abs(point(next) - point(index)) / WALK_SPEED) * 1000;
  };

  let cycle = 0;
  for (let index = 0; index < WAYPOINTS; index += 1) {
    cycle += pause(index) + walkMs(index);
  }
  let left = (((timeMs + hash(personId, 200) * cycle) % cycle) + cycle) % cycle;
  for (let index = 0; index < WAYPOINTS; index += 1) {
    const here = point(index);
    const next = point((index + 1) % WAYPOINTS);
    const facing = next < here ? 'left' : 'right';
    const stay = pause(index);
    if (left < stay) {
      return {
        x: here,
        facing: hash(personId, 300 + index) < 0.5 ? 'left' : 'right',
        walking: false,
      };
    }
    left -= stay;
    const walk = walkMs(index);
    if (left < walk) {
      const progress = walk === 0 ? 1 : left / walk;
      return { x: here + (next - here) * progress, facing, walking: walk > 0 };
    }
    left -= walk;
  }
  return { x: point(0), facing: 'right', walking: false };
}
