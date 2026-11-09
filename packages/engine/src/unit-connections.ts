import { UNIT_CATALOG, type TowerState, type Unit, type UnitId } from '@tower-magnate/shared';
import { entrancePlace, unitPlace } from './office-routine';
import { connectedSpaces } from './parking';
import { graphInputsKey, TransportGraph, TripPlanner } from './routing';

const KEPT_RESULTS = 8;

const resultsByLayout = new Map<string, ReadonlySet<UnitId>>();

/** Maids appear at their unit's door, so a housekeeping unit needs no route from the street. */
function isVisitedFromOutside(unit: Unit): boolean {
  const { capacity } = UNIT_CATALOG[unit.type];
  return capacity !== null && capacity.role !== 'passengers-per-car' && capacity.role !== 'maids';
}

function unitsWithoutRoute(state: TowerState): Set<UnitId> {
  const visited = Object.values(state.units).filter(isVisitedFromOutside);
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
    let reachable = reachableByRun.get(run.id);
    if (reachable === undefined) {
      reachable = planner.plan(state, { from, to: street, userClass: 'other' }) !== null;
      reachableByRun.set(run.id, reachable);
    }
    if (!reachable) missing.add(unit.id);
  }
  return missing;
}

function spacesWithoutRamp(state: TowerState): Set<UnitId> {
  const connected = new Set(connectedSpaces(state).map((space) => space.id));
  const spaces = Object.values(state.units).filter((unit) => unit.type === 'parking-space');
  return new Set(spaces.filter((space) => !connected.has(space.id)).map((space) => space.id));
}

function connectionsKey(state: TowerState): string {
  const places = Object.values(state.units).map((unit) => `${unit.id}@${unit.level}:${unit.x}`);
  return `${graphInputsKey(state)}|${places.join(',')}`;
}

/**
 * Units drawn as disconnected: a unit people visit with no route between its door and the street,
 * and a parking space that reaches no ramp. Kept per layout, since only building changes it.
 */
export function disconnectedUnits(state: TowerState): ReadonlySet<UnitId> {
  const key = connectionsKey(state);
  const known = resultsByLayout.get(key);
  if (known) return known;

  const result = new Set([...unitsWithoutRoute(state), ...spacesWithoutRamp(state)]);
  resultsByLayout.set(key, result);
  if (resultsByLayout.size > KEPT_RESULTS) {
    const oldest = resultsByLayout.keys().next().value as string;
    resultsByLayout.delete(oldest);
  }
  return result;
}
