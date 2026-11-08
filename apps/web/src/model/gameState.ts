import {
  unpackCar,
  unpackPerson,
  type CarView,
  type Delta,
  type EventView,
  type FinanceSummary,
  type FollowedView,
  type Level,
  type NoticeView,
  type OverlayData,
  type PersonView,
  type ShaftView,
  type Snapshot,
  type StarRating,
  type StarRequirementView,
  type TransportView,
  type UnitView,
} from '@tower-magnate/shared';

/** The tower as the server last described it, one step at a time. Read-only for everyone but the reducers below. */
export interface GameState {
  readonly step: number;
  readonly money: number;
  readonly stars: StarRating;
  readonly population: number;
  /** The next star step's requirements besides population; empty at Torre. */
  readonly starRequirements: readonly StarRequirementView[];
  readonly mainLobbyHeight: 1 | 2 | 3 | null;
  readonly structure: ReadonlyMap<Level, string>;
  readonly units: ReadonlyMap<string, UnitView>;
  readonly transports: ReadonlyMap<string, TransportView>;
  readonly shafts: ReadonlyMap<string, ShaftView>;
  readonly cars: ReadonlyMap<string, CarView>;
  readonly people: ReadonlyMap<string, PersonView>;
  readonly followed: readonly FollowedView[];
  readonly activeEvents: readonly EventView[];
  readonly notices: readonly NoticeView[];
  readonly overlays: OverlayData;
  readonly finances: FinanceSummary;
}

export function carKey(car: { shaftId: string; index: number }): string {
  return `${car.shaftId}#${car.index}`;
}

function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function carsByKey(cars: readonly CarView[]): Map<string, CarView> {
  return new Map(cars.map((car) => [carKey(car), car]));
}

export function stateFromSnapshot(snapshot: Snapshot): GameState {
  const structure = new Map<Level, string>();
  for (const [level, row] of Object.entries(snapshot.grid.levels)) {
    structure.set(Number(level), row.structure);
  }
  return {
    step: snapshot.step,
    money: snapshot.money,
    stars: snapshot.stars,
    population: snapshot.population,
    starRequirements: snapshot.starRequirements,
    mainLobbyHeight: snapshot.grid.mainLobbyHeight,
    structure,
    units: byId(snapshot.units),
    transports: byId(snapshot.transports),
    shafts: byId(snapshot.shafts),
    cars: carsByKey(snapshot.cars),
    people: byId(snapshot.people),
    followed: snapshot.followed,
    activeEvents: snapshot.activeEvents,
    notices: snapshot.notices,
    overlays: snapshot.overlays,
    finances: snapshot.finances,
  };
}

/** Returns the same map when nothing changed, so selectors can compare by reference. */
function upsertAndRemove<T extends { id: string }>(
  current: ReadonlyMap<string, T>,
  upserted: readonly T[] | undefined,
  removed: readonly string[] | undefined,
): ReadonlyMap<string, T> {
  if (!upserted?.length && !removed?.length) {
    return current;
  }
  const next = new Map(current);
  for (const item of upserted ?? []) {
    next.set(item.id, item);
  }
  for (const id of removed ?? []) {
    next.delete(id);
  }
  return next;
}

function withRows(
  current: ReadonlyMap<Level, string>,
  rows: Delta['structure'],
): ReadonlyMap<Level, string> {
  if (!rows?.length) {
    return current;
  }
  const next = new Map(current);
  for (const row of rows) {
    next.set(row.level, row.structure);
  }
  return next;
}

/**
 * Applies one delta on top of `state`. Optional fields replace what they name;
 * cars and people are complete for their scope, so anyone missing is dropped.
 */
export function applyDelta(state: GameState, delta: Delta): GameState {
  return {
    step: delta.step,
    money: delta.money ?? state.money,
    stars: delta.stars ?? state.stars,
    population: delta.population ?? state.population,
    starRequirements: delta.starRequirements ?? state.starRequirements,
    mainLobbyHeight: delta.mainLobbyHeight ?? state.mainLobbyHeight,
    structure: withRows(state.structure, delta.structure),
    units: upsertAndRemove(state.units, delta.unitsUpserted, delta.unitsRemoved),
    transports: upsertAndRemove(
      state.transports,
      delta.transportsUpserted,
      delta.transportsRemoved,
    ),
    shafts: upsertAndRemove(state.shafts, delta.shaftsUpserted, delta.shaftsRemoved),
    cars: carsByKey(delta.cars.map(unpackCar)),
    people: byId(delta.people.map(unpackPerson)),
    followed: delta.followed ?? state.followed,
    activeEvents: delta.activeEvents ?? state.activeEvents,
    notices: delta.notices ?? state.notices,
    overlays: delta.overlays ? { ...state.overlays, ...delta.overlays } : state.overlays,
    finances: delta.finances ?? state.finances,
  };
}
