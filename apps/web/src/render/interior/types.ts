/**
 * Interiors: units whose furniture is built from a seed instead of being drawn into their
 * sprite. Each unit type with an interior has a spec (office.ts, condo.ts): the bare room, its
 * windows and zones, the props it can hold and the templates that roll them.
 */

/** 0 stands against the back wall (on the back floor row or hung on it); 1 stands in the middle of the room, in front. */
export type InteriorLayer = 0 | 1;
/** Floor props rest on the floor; wall props hang at eye height. */
export type InteriorMount = 'floor' | 'wall';
/** Functional props are what the people inside use; decor is there for looks. */
export type InteriorRole = 'functional' | 'decor';
/** idle is every prop's look; the others are extra looks some props have. */
export type PropLook = 'idle' | 'busy' | 'sleep' | 'dirty';
export type InteriorTime = 'day' | 'night';

export interface InteriorKind {
  kind: string;
  layer: InteriorLayer;
  mount: InteriorMount;
  role: InteriorRole;
  /** Pixels; must match the art (interior.test.ts checks). */
  width: number;
  height: number;
  /** Relative chance of being picked among the kinds of a roll. */
  weight: number;
  /** Most copies one room can hold. */
  max: number;
  /** Looks drawn besides idle. */
  looks?: readonly PropLook[];
  /** Can be mirrored. */
  flip?: boolean;
  /** Zones the prop may go in; every zone when left out. */
  zones?: readonly string[];
  /** States the prop is not drawn in, such as luggage while no guest is staying. */
  hiddenIn?: readonly string[];
}

export interface InteriorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A stretch of the room, columns `left` to `right` included, that props may not cross out of. */
export interface InteriorZone {
  id: string;
  left: number;
  right: number;
}

/** How many props a roll places, both ends included. */
export type CountRange = readonly [number, number];

export interface InteriorRoll {
  /** Kinds to pick from, by weight. */
  kinds: readonly string[];
  /** Props of these kinds in the room, fixed ones included. */
  count: CountRange;
  /** Only in this zone. */
  zone?: string;
  /** Chance that every prop of the roll is the same kind. */
  matching?: number;
}

export interface FixedProp {
  kind: string;
  x: number;
  flip?: boolean;
}

export interface InteriorTemplate {
  id: string;
  name: string;
  /** Props always placed where the template says, before anything is rolled. */
  fixed: readonly FixedProp[];
  /** Rolled in order, so a seed always gives the same room. */
  rolls: readonly InteriorRoll[];
}

export interface InteriorSpec<State extends string = string> {
  unitType: string;
  /** Atlas group of the props: sprites are `<group>/<kind>/<look>`. */
  group: string;
  /** The bare room the props go on. */
  baseSprite: string;
  room: {
    width: number;
    height: number;
    /** Bottom row of a layer 0 floor prop. */
    backFloorRow: number;
    /** Bottom row of a layer 1 prop. */
    frontFloorRow: number;
    /** Wall props are centered on this row. */
    eyeLine: number;
    /** Highest row a wall prop may reach. */
    wallTop: number;
  };
  /** Window glass; frames are one pixel around it and block layer 0. */
  windows: readonly InteriorRect[];
  zones: readonly InteriorZone[];
  catalog: readonly InteriorKind[];
  /** The first one is the default. */
  templates: readonly InteriorTemplate[];
  states: readonly State[];
  /** The look of the props in each state; null shows the bare room. */
  propLook: Record<State, PropLook | null>;
  /** Curtains over the windows in each state; null leaves the glass bare. */
  curtains: Record<State, 'open' | 'closed' | null>;
  /** How dark the shade over the room is in each state and time, 0 (none) to 1 (black). */
  shade: Record<State, Record<InteriorTime, number>>;
  /** Whole-room sprites drawn over the props in some states, such as grime in a dirty room. */
  overlays?: Partial<Record<State, readonly string[]>>;
  /**
   * The seed every unit of this type uses, for types whose rooms all look alike; left out when
   * each unit stores its own seed (`UnitView.look`).
   */
  fixedSeed?: number;
}

export interface InteriorProp {
  kind: string;
  layer: InteriorLayer;
  mount: InteriorMount;
  /** Left and top of the sprite inside the room, before any flip. */
  x: number;
  y: number;
  width: number;
  height: number;
  flip: boolean;
  /** Set by the template rather than rolled. */
  fixed: boolean;
}

export interface InteriorLayout {
  seed: number;
  template: string;
  /** In drawing order: wall, back floor, then the middle of the room. */
  props: InteriorProp[];
}
