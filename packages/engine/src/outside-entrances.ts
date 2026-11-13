import {
  SUBWAY_ENTRANCE_CHANCE,
  UNIT_CATALOG,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { entrancePlace, type Place } from './office-routine';
import { chance, nextInt } from './rng';
import { streetColumn, streetPlace } from './street';
import { walkableLevelOfUnit } from './routing';
import { unitNumber } from './units';
import type { CustomerEntrance } from './venue-visitors';

/** The station with the lowest unit id, or null when the tower has none. */
export function subwayStation(state: TowerState): Unit | null {
  let station: Unit | null = null;
  for (const unit of Object.values(state.units)) {
    if (unit.type !== 'subway-station') continue;
    if (!station || unitNumber(unit.id) < unitNumber(station.id)) station = unit;
  }
  return station;
}

export function streetEntrance(state: TowerState): CustomerEntrance {
  return { kind: 'street', onRight: chance(state.rng, 0.5) };
}

/** People spec 3: with a station, a quarter of outside trips use the subway, at a random station column. */
export function drawEntrance(state: TowerState, station: Unit | null): CustomerEntrance {
  if (!station || !chance(state.rng, SUBWAY_ENTRANCE_CHANCE)) return streetEntrance(state);
  const lastColumn = station.x + UNIT_CATALOG[station.type].width - 1;
  return { kind: 'subway', column: nextInt(state.rng, station.x, lastColumn) };
}

export function entranceDoor(state: TowerState, entrance: CustomerEntrance): Place | null {
  if (entrance.kind === 'street') return entrancePlace(state, entrance.onRight);
  const station = subwayStation(state);
  if (!station) return null;
  return { level: walkableLevelOfUnit(station), column: entrance.column };
}

/** Where a person who comes in by this entrance first appears: the map edge for the street, the station for the subway. */
export function entranceStart(state: TowerState, entrance: CustomerEntrance): Place | null {
  if (entrance.kind === 'street') {
    return entrancePlace(state, entrance.onRight) ? streetPlace(entrance.onRight) : null;
  }
  return entranceDoor(state, entrance);
}

/** The map edge a person walks out to after the street door; none for the subway, which has no street walk. */
export function entranceStreetColumn(entrance: CustomerEntrance): number | undefined {
  return entrance.kind === 'street' ? streetColumn(entrance.onRight) : undefined;
}
