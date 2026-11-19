import type {
  CountRange,
  InteriorKind,
  InteriorLayout,
  InteriorProp,
  InteriorSpec,
  InteriorTemplate,
} from './types';

/**
 * Builds the furniture of one room from a seed. The game stores only the seed; the same seed,
 * spec and template always give the same layout, so it is rebuilt whenever it is drawn.
 */

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

/** A fresh seed for a new room. */
export function newInteriorSeed(random: Random = Math.random): number {
  return Math.floor(random() * 4294967296) >>> 0;
}

/** Pixels kept free between two props of the same layer. */
const GAP = 1;
/** Extra tries with another kind when a rolled prop does not fit. */
const RETRIES = 4;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function boxOf(prop: Pick<InteriorProp, 'x' | 'y' | 'width' | 'height'>): Box {
  return {
    left: prop.x,
    top: prop.y,
    right: prop.x + prop.width - 1,
    bottom: prop.y + prop.height - 1,
  };
}

function overlaps(a: Box, b: Box, gap: number): boolean {
  return (
    a.left <= b.right + gap &&
    b.left <= a.right + gap &&
    a.top <= b.bottom + gap &&
    b.top <= a.bottom + gap
  );
}

export function interiorKind(spec: InteriorSpec, kind: string): InteriorKind {
  const entry = spec.catalog.find((candidate) => candidate.kind === kind);
  if (entry === undefined) {
    throw new Error(`Unknown ${spec.unitType} prop: ${kind}`);
  }
  return entry;
}

export function interiorTemplate(spec: InteriorSpec, id: string): InteriorTemplate {
  const template = spec.templates.find((entry) => entry.id === id);
  if (template === undefined) {
    throw new Error(`Unknown ${spec.unitType} template: ${id}`);
  }
  return template;
}

class Room {
  readonly props: InteriorProp[] = [];
  private readonly windows: readonly Box[];

  constructor(private readonly spec: InteriorSpec) {
    // Window frames block layer 0, so nothing stands or hangs in front of the glass.
    this.windows = spec.windows.map((window) => ({
      left: window.left - 1,
      top: window.top - 1,
      right: window.left + window.width,
      bottom: window.top + window.height,
    }));
  }

  topOf(entry: InteriorKind): number {
    const { room } = this.spec;
    if (entry.mount === 'wall') {
      return Math.max(room.wallTop, room.eyeLine - Math.floor(entry.height / 2));
    }
    const floor = entry.layer === 0 ? room.backFloorRow : room.frontFloorRow;
    return floor - entry.height + 1;
  }

  /** Every left edge where `entry` fits next to what is already placed, zone by zone, left to right. */
  spots(entry: InteriorKind, zone?: string): number[] {
    const spots: number[] = [];
    const y = this.topOf(entry);
    for (const area of this.spec.zones) {
      if (zone !== undefined && area.id !== zone) continue;
      if (entry.zones !== undefined && !entry.zones.includes(area.id)) continue;
      for (let x = area.left; x + entry.width - 1 <= area.right; x++) {
        if (this.fits(entry, x, y)) spots.push(x);
      }
    }
    return spots;
  }

  private fits(entry: InteriorKind, x: number, y: number): boolean {
    const box = boxOf({ x, y, width: entry.width, height: entry.height });
    if (entry.layer === 0 && this.windows.some((window) => overlaps(box, window, 0))) {
      return false;
    }
    return this.props.every(
      (other) => other.layer !== entry.layer || !overlaps(box, boxOf(other), GAP),
    );
  }

  add(entry: InteriorKind, x: number, flip: boolean, fixed: boolean): void {
    this.props.push({
      kind: entry.kind,
      layer: entry.layer,
      mount: entry.mount,
      x,
      y: this.topOf(entry),
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

function pickWeighted(random: Random, kinds: readonly InteriorKind[]): InteriorKind | undefined {
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
 * have copies left, dropped at a random spot where it fits.
 */
function fill(
  room: Room,
  random: Random,
  pool: readonly InteriorKind[],
  count: number,
  zone: string | undefined,
): void {
  for (let placed = 0; placed < count; placed++) {
    let done = false;
    for (let attempt = 0; attempt <= RETRIES && !done; attempt++) {
      const open = pool.filter((entry) => room.count(entry.kind) < entry.max);
      const entry = pickWeighted(random, open);
      if (entry === undefined) {
        return;
      }
      const spots = room.spots(entry, zone);
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

/** The furniture of a room with this seed, rolled in the template's order. */
export function generateInteriorLayout(
  spec: InteriorSpec,
  seed: number,
  template: InteriorTemplate = spec.templates[0] as InteriorTemplate,
): InteriorLayout {
  const random = seededRandom(seed);
  const room = new Room(spec);
  for (const fixed of template.fixed) {
    room.add(interiorKind(spec, fixed.kind), fixed.x, fixed.flip ?? false, true);
  }
  for (const roll of template.rolls) {
    // Keep catalog order, so the picks do not depend on how a roll lists its kinds.
    const pool = spec.catalog.filter((entry) => roll.kinds.includes(entry.kind));
    const already = room.props.filter((prop) => roll.kinds.includes(prop.kind)).length;
    const count = Math.max(0, rollCount(random, roll.count) - already);
    if (roll.matching !== undefined) {
      const matching = random() < roll.matching ? pickWeighted(random, pool) : undefined;
      fill(room, random, matching ? [matching] : pool, count, roll.zone);
    } else {
      fill(room, random, pool, count, roll.zone);
    }
  }
  const order = (prop: InteriorProp) => (prop.layer === 1 ? 2 : prop.mount === 'floor' ? 1 : 0);
  const props = [...room.props].sort((a, b) => order(a) - order(b) || a.x - b.x);
  return { seed: seed >>> 0, template: template.id, props };
}

const cache = new Map<string, InteriorLayout>();
/** Layouts kept before the cache starts over; far more than the rooms a tower can hold. */
const CACHE_LIMIT = 8192;

/** `generateInteriorLayout` with the default template, remembered, so redrawing a tower does not roll every room again. */
export function interiorLayoutFor(spec: InteriorSpec, seed: number): InteriorLayout {
  // The base sprite tells a room above ground from the same type underground, without windows.
  const key = `${spec.unitType}:${spec.baseSprite}:${seed >>> 0}`;
  let layout = cache.get(key);
  if (layout === undefined) {
    if (cache.size >= CACHE_LIMIT) cache.clear();
    layout = generateInteriorLayout(spec, seed);
    cache.set(key, layout);
  }
  return layout;
}
