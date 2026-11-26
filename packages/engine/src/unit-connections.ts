import { UNIT_CATALOG, type TowerState, type Unit, type UnitId } from '@tower-magnate/shared';
import { entrancePlace, unitPlace } from './office-routine';
import { connectedRamps, connectedSpaces } from './parking';
import { TransportGraph, TripPlanner, type UserClass } from './routing';

/** A built unit or a construction site: both show the sign when no route reaches them. */
type Placed = Pick<Unit, 'id' | 'type' | 'level' | 'x'>;

/** Maids appear at their unit's door, so a housekeeping unit needs no route from the street. */
function isVisitedFromOutside(unit: Placed): boolean {
  const { capacity } = UNIT_CATALOG[unit.type];
  return capacity !== null && capacity.role !== 'passengers-per-car' && capacity.role !== 'maids';
}

/** Units only workers use are reached by the worker routes, service shafts included. */
function routeClassOf(unit: Placed): UserClass {
  const role = UNIT_CATALOG[unit.type].capacity?.role;
  return role === 'builders' || role === 'cleaners' || role === 'guards' ? 'worker' : 'other';
}

function unitsWithoutRoute(state: TowerState): Set<UnitId> {
  const visited: Placed[] = [...Object.values(state.units), ...Object.values(state.sites)].filter(
    isVisitedFromOutside,
  );
  const entrance = entrancePlace(state, false);
  if (!entrance) return new Set(visited.map((unit) => unit.id));

  const graph = new TransportGraph(state);
  const planner = new TripPlanner(graph);
  const street = { level: entrance.level, x: entrance.column };
  const reachableByRun = new Map<number, boolean>();
  const missing = new Set<UnitId>();
  for (const unit of visited) {
    const door = unitPlace(unit);
    const from = { level: door.level, x: door.column };
    const run = graph.runAtCell(from.level, from.x);
    if (!run) {
      missing.add(unit.id);
      continue;
    }
    const userClass = routeClassOf(unit);
    const key = run.id * 2 + (userClass === 'worker' ? 1 : 0);
    let reachable = reachableByRun.get(key);
    if (reachable === undefined) {
      reachable = planner.plan(state, { from, to: street, userClass }) !== null;
      reachableByRun.set(key, reachable);
    }
    if (!reachable) missing.add(unit.id);
  }
  return missing;
}

/** Ramps with no ramp chain up to S1, and spaces that reach no connected ramp. */
function parkingWithoutAccess(state: TowerState): Set<UnitId> {
  const connected = new Set(
    [...connectedRamps(state), ...connectedSpaces(state)].map((unit) => unit.id),
  );
  const parking = Object.values(state.units).filter(
    (unit) => unit.type === 'parking-space' || unit.type === 'parking-ramp',
  );
  return new Set(parking.filter((unit) => !connected.has(unit.id)).map((unit) => unit.id));
}

/**
 * Units drawn as disconnected: a unit people visit with no route between its door and the street,
 * a parking ramp with no ramp chain up to S1 and a parking space that reaches no connected ramp. It builds a transport graph, so callers keep the
 * result until the layout changes.
 */
export function disconnectedUnits(state: TowerState): ReadonlySet<UnitId> {
  return new Set([...unitsWithoutRoute(state), ...parkingWithoutAccess(state)]);
}
