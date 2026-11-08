import type { Delta, Snapshot } from '@tower-magnate/shared';

/** Same JSON means same view, because views are plain data built in a fixed key order. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function changedById<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
): { upserted: T[]; removed: string[] } {
  const previous = new Map(before.map((item) => [item.id, item]));
  const upserted = after.filter((item) => !same(previous.get(item.id), item));
  const kept = new Set(after.map((item) => item.id));
  const removed = before.filter((item) => !kept.has(item.id)).map((item) => item.id);
  return { upserted, removed };
}

function changedStructure(before: Snapshot, after: Snapshot): Delta['structure'] {
  const rows: NonNullable<Delta['structure']> = [];
  for (const [level, row] of Object.entries(after.grid.levels)) {
    if (before.grid.levels[level]?.structure !== row.structure) {
      rows.push({ level: Number(level), structure: row.structure });
    }
  }
  return rows;
}

function changedOverlays(before: Snapshot, after: Snapshot): Delta['overlays'] {
  const overlays: NonNullable<Delta['overlays']> = {};
  if (!same(before.overlays.evaluation, after.overlays.evaluation)) {
    overlays.evaluation = after.overlays.evaluation;
  }
  if (!same(before.overlays.price, after.overlays.price)) {
    overlays.price = after.overlays.price;
  }
  if (!same(before.overlays.hotel, after.overlays.hotel)) {
    overlays.hotel = after.overlays.hotel;
  }
  return overlays;
}

/** Fields that only appear in the first message, so a change in them needs a new snapshot. */
export function needsFreshSnapshot(before: Snapshot, after: Snapshot): boolean {
  return Object.keys(before.grid.levels).some((level) => !(level in after.grid.levels));
}

export interface DeltaResult {
  delta: Delta;
  /** True when the delta says nothing beyond the step. */
  quiet: boolean;
}

/**
 * What changed from `before` to `after`. `cars` and `people` are always complete; the other
 * fields are present only when they differ. The result is `quiet` when neither those two nor
 * any optional field changed, so the caller can skip it unless a heartbeat is due.
 */
export function diffSnapshots(before: Snapshot, after: Snapshot): DeltaResult {
  const delta: Delta = { step: after.step, cars: after.cars, people: after.people };
  let quiet = same(before.cars, after.cars) && same(before.people, after.people);

  const set = <K extends keyof Delta>(key: K, value: Delta[K]) => {
    delta[key] = value;
    quiet = false;
  };

  if (before.money !== after.money) set('money', after.money);
  if (before.stars !== after.stars) set('stars', after.stars);
  if (before.population !== after.population) set('population', after.population);

  if (before.grid.mainLobbyHeight !== after.grid.mainLobbyHeight && after.grid.mainLobbyHeight) {
    set('mainLobbyHeight', after.grid.mainLobbyHeight);
  }

  const structure = changedStructure(before, after);
  if (structure?.length) set('structure', structure);

  const units = changedById(before.units, after.units);
  if (units.upserted.length) set('unitsUpserted', units.upserted);
  if (units.removed.length) set('unitsRemoved', units.removed);

  const transports = changedById(before.transports, after.transports);
  if (transports.upserted.length) set('transportsUpserted', transports.upserted);
  if (transports.removed.length) set('transportsRemoved', transports.removed);

  const shafts = changedById(before.shafts, after.shafts);
  if (shafts.upserted.length) set('shaftsUpserted', shafts.upserted);
  if (shafts.removed.length) set('shaftsRemoved', shafts.removed);

  const people = changedById(before.people, after.people);
  if (people.removed.length) set('peopleGone', people.removed);

  if (!same(before.followed, after.followed)) set('followed', after.followed);
  if (!same(before.activeEvents, after.activeEvents)) set('activeEvents', after.activeEvents);

  const overlays = changedOverlays(before, after);
  if (overlays && Object.keys(overlays).length) set('overlays', overlays);

  if (!same(before.finances, after.finances)) set('finances', after.finances);

  return { delta, quiet };
}
