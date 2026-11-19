import {
  OFFICE_CATALOG,
  officeKind,
  type OfficeKind,
  type OfficeLayer,
  type OfficeMount,
} from './officeCatalog';

/**
 * Builds the furniture of one office from a seed. The game stores only the seed; the same
 * seed and template always give the same layout, so it is rebuilt whenever it is drawn.
 */

/** The bare office room the props go into, in pixels (units/office/empty_day). */
export const OFFICE_ROOM = {
  width: 72,
  height: 32,
  /** First and last wall column a prop may cover; the outer two columns are the frame. */
  innerLeft: 2,
  innerRight: 69,
  /** Bottom row of a layer 0 floor prop: the back row of the floor. */
  backFloorRow: 26,
  /** Bottom row of a layer 1 prop: the front row of the floor. */
  frontFloorRow: 28,
  /** Wall props are centered on this row. */
  eyeLine: 9,
  /** Highest row a wall prop may reach. */
  wallTop: 3,
} as const;

/** The window glass of the office room. Frames are one pixel around it. */
export const OFFICE_WINDOWS = [
  { left: 5, top: 4, width: 14, height: 8 },
  { left: 33, top: 4, width: 14, height: 8 },
] as const;

export interface OfficeProp {
  kind: string;
  layer: OfficeLayer;
  mount: OfficeMount;
  /** Left and top of the sprite inside the room, before any flip. */
  x: number;
  y: number;
  width: number;
  height: number;
  flip: boolean;
  /** Set by the template rather than rolled. */
  fixed: boolean;
}

export interface FixedOfficeProp {
  kind: string;
  x: number;
  flip?: boolean;
}

/** How many props of a pool to roll, both ends included. */
export type CountRange = readonly [number, number];

export interface OfficeTemplate {
  id: string;
  name: string;
  /** Props always placed where the template says, before anything is rolled. */
  fixed: readonly FixedOfficeProp[];
  /** Workstations in the office, the fixed ones included. */
  workstations: CountRange;
  /** Other layer 1 props: meeting table, copier, partitions. */
  front: CountRange;
  /** Layer 0 props standing on the floor against the wall. */
  back: CountRange;
  /** Layer 0 props hung on the wall. */
  wall: CountRange;
  /** Chance that every rolled workstation is the same kind. */
  matchingDesks: number;
}

export const OFFICE_TEMPLATES: readonly OfficeTemplate[] = [
  {
    id: 'random',
    name: 'Random',
    fixed: [],
    workstations: [1, 3],
    front: [0, 2],
    back: [1, 4],
    wall: [1, 3],
    matchingDesks: 0.6,
  },
  {
    id: 'mixed',
    name: 'Two fixed desks, the rest random',
    fixed: [
      { kind: 'workstation', x: 6 },
      { kind: 'workstation', x: 34 },
    ],
    workstations: [2, 2],
    front: [0, 1],
    back: [1, 3],
    wall: [1, 3],
    matchingDesks: 1,
  },
  {
    id: 'classic',
    name: 'Fixed (the current office)',
    fixed: [
      { kind: 'workstation', x: 6 },
      { kind: 'workstation', x: 34 },
      { kind: 'plant-medium', x: 27 },
      { kind: 'filing-cabinet', x: 55 },
    ],
    workstations: [2, 2],
    front: [0, 0],
    back: [0, 0],
    wall: [0, 0],
    matchingDesks: 1,
  },
];

export function officeTemplate(id: string): OfficeTemplate {
  const template = OFFICE_TEMPLATES.find((entry) => entry.id === id);
  if (template === undefined) {
    throw new Error(`Unknown office template: ${id}`);
  }
  return template;
}

/** Pixels kept free between two props of the same layer. */
const GAP = 1;
/** Extra tries with another kind when a rolled prop does not fit. */
const RETRIES = 4;

type Random = () => number;

/** mulberry32: a small seeded generator, the same in every browser and in Node. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for a new office. */
export function newOfficeSeed(random: Random = Math.random): number {
  return Math.floor(random() * 4294967296) >>> 0;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function topOf(entry: OfficeKind): number {
  if (entry.mount === 'wall') {
    return Math.max(OFFICE_ROOM.wallTop, OFFICE_ROOM.eyeLine - Math.floor(entry.height / 2));
  }
  const floor = entry.layer === 0 ? OFFICE_ROOM.backFloorRow : OFFICE_ROOM.frontFloorRow;
  return floor - entry.height + 1;
}

function rectOf(prop: Pick<OfficeProp, 'x' | 'y' | 'width' | 'height'>): Rect {
  return {
    left: prop.x,
    top: prop.y,
    right: prop.x + prop.width - 1,
    bottom: prop.y + prop.height - 1,
  };
}

function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.left <= b.right + gap &&
    b.left <= a.right + gap &&
    a.top <= b.bottom + gap &&
    b.top <= a.bottom + gap
  );
}

/** Window frames block layer 0, so nothing stands or hangs in front of the glass. */
const WINDOW_RECTS: readonly Rect[] = OFFICE_WINDOWS.map((window) => ({
  left: window.left - 1,
  top: window.top - 1,
  right: window.left + window.width,
  bottom: window.top + window.height,
}));

class Room {
  readonly props: OfficeProp[] = [];

  /** Every left edge where `entry` fits next to what is already placed. */
  spots(entry: OfficeKind): number[] {
    const spots: number[] = [];
    const y = topOf(entry);
    for (let x = OFFICE_ROOM.innerLeft; x + entry.width - 1 <= OFFICE_ROOM.innerRight; x++) {
      if (this.fits(entry, x, y)) {
        spots.push(x);
      }
    }
    return spots;
  }

  fits(entry: OfficeKind, x: number, y: number): boolean {
    const rect = rectOf({ x, y, width: entry.width, height: entry.height });
    if (entry.layer === 0 && WINDOW_RECTS.some((window) => overlaps(rect, window, 0))) {
      return false;
    }
    return this.props.every(
      (other) => other.layer !== entry.layer || !overlaps(rect, rectOf(other), GAP),
    );
  }

  add(entry: OfficeKind, x: number, flip: boolean, fixed: boolean): void {
    this.props.push({
      kind: entry.kind,
      layer: entry.layer,
      mount: entry.mount,
      x,
      y: topOf(entry),
      width: entry.width,
      height: entry.height,
      flip,
      fixed,
    });
  }

  count(kind: string): number {
    return this.props.filter((prop) => prop.kind === kind).length;
  }
}

function rollCount(random: Random, [min, max]: CountRange): number {
  return min + Math.floor(random() * (max - min + 1));
}

function pickWeighted(random: Random, kinds: readonly OfficeKind[]): OfficeKind | undefined {
  const total = kinds.reduce((sum, entry) => sum + entry.weight, 0);
  let left = random() * total;
  for (const entry of kinds) {
    left -= entry.weight;
    if (left < 0) {
      return entry;
    }
  }
  return kinds[kinds.length - 1];
}

/**
 * Places up to `count` props from `pool`. Each one is a weighted pick among the kinds that
 * have copies left and room somewhere, dropped at a random spot where it fits.
 */
function fill(room: Room, random: Random, pool: readonly OfficeKind[], count: number): void {
  for (let placed = 0; placed < count; placed++) {
    let done = false;
    for (let attempt = 0; attempt <= RETRIES && !done; attempt++) {
      const open = pool.filter((entry) => room.count(entry.kind) < entry.max);
      const entry = pickWeighted(random, open);
      if (entry === undefined) {
        return;
      }
      const spots = room.spots(entry);
      if (spots.length === 0) {
        continue;
      }
      const x = spots[Math.floor(random() * spots.length)] as number;
      const flip = entry.flip === true && random() < 0.5;
      room.add(entry, x, flip, false);
      done = true;
    }
  }
}

const WORKSTATIONS = OFFICE_CATALOG.filter((entry) => entry.workstation);
const FRONT = OFFICE_CATALOG.filter((entry) => entry.layer === 1 && !entry.workstation);
const BACK = OFFICE_CATALOG.filter((entry) => entry.layer === 0 && entry.mount === 'floor');
const WALL = OFFICE_CATALOG.filter((entry) => entry.mount === 'wall');

export interface OfficeLayout {
  seed: number;
  template: string;
  /** In drawing order: wall, back floor, then the middle of the room. */
  props: OfficeProp[];
}

/**
 * The furniture of an office with this seed. Rolls happen in a fixed order (workstations,
 * other middle props, the back wall floor, the wall) so a seed always gives the same room.
 */
export function generateOfficeLayout(
  seed: number,
  template: OfficeTemplate = OFFICE_TEMPLATES[0] as OfficeTemplate,
): OfficeLayout {
  const random = seededRandom(seed);
  const room = new Room();
  for (const fixed of template.fixed) {
    room.add(officeKind(fixed.kind), fixed.x, fixed.flip ?? false, true);
  }

  const fixedDesks = room.props.filter((prop) => officeKind(prop.kind).workstation).length;
  const desks = Math.max(0, rollCount(random, template.workstations) - fixedDesks);
  const matching =
    random() < template.matchingDesks ? pickWeighted(random, WORKSTATIONS) : undefined;
  if (matching) {
    fill(room, random, [matching], desks);
  } else {
    fill(room, random, WORKSTATIONS, desks);
  }
  fill(room, random, FRONT, rollCount(random, template.front));
  fill(room, random, BACK, rollCount(random, template.back));
  fill(room, random, WALL, rollCount(random, template.wall));

  const order = (prop: OfficeProp) => (prop.layer === 1 ? 2 : prop.mount === 'floor' ? 1 : 0);
  const props = [...room.props].sort((a, b) => order(a) - order(b) || a.x - b.x);
  return { seed: seed >>> 0, template: template.id, props };
}
