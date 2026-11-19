/**
 * The props an office can hold, drawn by tools/art/src/groups/office.mjs into the office atlas.
 * Sprite ids are `office/<kind>/idle`, plus `office/<kind>/busy` when `busy` is true.
 * Widths and heights are in pixels and must match the art (officeCatalog.test.ts checks).
 */

/** 0 stands against the back wall (on the back floor row or hung on the wall); 1 stands in the middle of the room, in front. */
export type OfficeLayer = 0 | 1;
/** Floor props rest on the floor; wall props hang at eye height. */
export type OfficeMount = 'floor' | 'wall';
/** Functional props are what the tenant works with; decor is there for looks. */
export type OfficeRole = 'functional' | 'decor';

export interface OfficeKind {
  kind: string;
  layer: OfficeLayer;
  mount: OfficeMount;
  role: OfficeRole;
  width: number;
  height: number;
  /** Relative chance of being picked among the kinds of its pool. */
  weight: number;
  /** Most copies one office can hold. */
  max: number;
  /** Has a `busy` sprite for an occupied office. */
  busy?: boolean;
  /** Can be mirrored. */
  flip?: boolean;
  /** A desk someone works at; offices roll how many they have. */
  workstation?: boolean;
}

const workstation = (kind: string, weight: number): OfficeKind => ({
  kind,
  layer: 1,
  mount: 'floor',
  role: 'functional',
  width: 20,
  height: 13,
  weight,
  max: 4,
  busy: true,
  flip: true,
  workstation: true,
});

export const OFFICE_CATALOG: readonly OfficeKind[] = [
  // Layer 1: the middle of the room.
  workstation('workstation', 4),
  workstation('workstation-metal', 3),
  workstation('workstation-dual', 2),
  workstation('workstation-laptop', 2),
  {
    kind: 'meeting-table',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 28,
    height: 9,
    weight: 1,
    max: 1,
    busy: true,
  },
  {
    kind: 'copier',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 12,
    height: 13,
    weight: 2,
    max: 1,
    busy: true,
    flip: true,
  },
  {
    kind: 'plant-medium',
    layer: 1,
    mount: 'floor',
    role: 'decor',
    width: 7,
    height: 12,
    weight: 3,
    max: 2,
    flip: true,
  },
  {
    kind: 'partition',
    layer: 1,
    mount: 'floor',
    role: 'decor',
    width: 3,
    height: 14,
    weight: 2,
    max: 2,
  },

  // Layer 0: against the wall, on the floor.
  {
    kind: 'filing-cabinet',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 6,
    height: 13,
    weight: 3,
    max: 2,
  },
  {
    kind: 'filing-cabinet-low',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 6,
    height: 9,
    weight: 3,
    max: 2,
  },
  {
    kind: 'bookshelf',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 12,
    height: 19,
    weight: 2,
    max: 1,
  },
  {
    kind: 'credenza',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 14,
    height: 10,
    weight: 2,
    max: 1,
    flip: true,
  },
  {
    kind: 'water-cooler',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 6,
    height: 14,
    weight: 2,
    max: 1,
  },
  {
    kind: 'coffee-station',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 12,
    height: 12,
    weight: 2,
    max: 1,
    busy: true,
    flip: true,
  },
  {
    kind: 'plant-tall',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 8,
    height: 17,
    weight: 3,
    max: 2,
    flip: true,
  },
  {
    kind: 'plant-small',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 5,
    height: 8,
    weight: 3,
    max: 2,
    flip: true,
  },
  {
    kind: 'trash-bin',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 5,
    height: 5,
    weight: 2,
    max: 1,
  },
  {
    kind: 'coat-rack',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 6,
    height: 18,
    weight: 1,
    max: 1,
    flip: true,
  },
  {
    kind: 'sofa',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 18,
    height: 9,
    weight: 1,
    max: 1,
  },
  {
    kind: 'locker',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 8,
    height: 17,
    weight: 1,
    max: 1,
  },
  {
    kind: 'safe',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 8,
    height: 8,
    weight: 1,
    max: 1,
  },
  {
    kind: 'vending-machine',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 10,
    height: 20,
    weight: 1,
    max: 1,
    busy: true,
  },

  // Layer 0: hung on the wall.
  { kind: 'clock', layer: 0, mount: 'wall', role: 'decor', width: 6, height: 6, weight: 3, max: 1 },
  {
    kind: 'picture-small',
    layer: 0,
    mount: 'wall',
    role: 'decor',
    width: 8,
    height: 6,
    weight: 3,
    max: 2,
  },
  {
    kind: 'picture-wide',
    layer: 0,
    mount: 'wall',
    role: 'decor',
    width: 14,
    height: 8,
    weight: 2,
    max: 1,
  },
  {
    kind: 'whiteboard',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 18,
    height: 10,
    weight: 2,
    max: 1,
  },
  {
    kind: 'corkboard',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 12,
    height: 8,
    weight: 2,
    max: 1,
  },
  {
    kind: 'wall-shelf',
    layer: 0,
    mount: 'wall',
    role: 'decor',
    width: 9,
    height: 5,
    weight: 2,
    max: 1,
    flip: true,
  },
  {
    kind: 'certificate',
    layer: 0,
    mount: 'wall',
    role: 'decor',
    width: 5,
    height: 6,
    weight: 2,
    max: 2,
  },
  {
    kind: 'calendar',
    layer: 0,
    mount: 'wall',
    role: 'decor',
    width: 5,
    height: 7,
    weight: 2,
    max: 1,
  },
  {
    kind: 'wall-screen',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 16,
    height: 10,
    weight: 1,
    max: 1,
    busy: true,
  },
];

const BY_KIND = new Map(OFFICE_CATALOG.map((entry) => [entry.kind, entry]));

export function officeKind(kind: string): OfficeKind {
  const entry = BY_KIND.get(kind);
  if (entry === undefined) {
    throw new Error(`Unknown office prop: ${kind}`);
  }
  return entry;
}

/** The sprite for a prop, busy when the office is occupied and the prop has a busy look. */
export function officePropSpriteId(kind: string, occupied: boolean): string {
  return `office/${kind}/${occupied && officeKind(kind).busy ? 'busy' : 'idle'}`;
}
