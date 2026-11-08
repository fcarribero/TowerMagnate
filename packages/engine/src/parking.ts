import {
  PERSON_KINDS,
  UNIT_CATALOG,
  type ParkingState,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { STEPS_PER_DAY } from './clock';
import { slotOfPerson } from './people';
import type { ScheduledHook } from './scheduler';
import type { StepContext } from './step';
import { unitNumber } from './units';

type Holder = 'office' | 'condo' | 'suite';

const NEWS_KEY: Record<Holder, string> = {
  office: 'news.parkingOffice',
  condo: 'news.parkingCondo',
  suite: 'news.parkingSuite',
};

const HOLDER_BY_KIND: Record<number, Holder | undefined> = {
  [PERSON_KINDS.indexOf('officeWorker')]: 'office',
  [PERSON_KINDS.indexOf('resident')]: 'condo',
  [PERSON_KINDS.indexOf('hotelGuest')]: 'suite',
};

function touches(a: Unit, b: Unit): boolean {
  return (
    a.level === b.level &&
    (a.x + UNIT_CATALOG[a.type].width === b.x || b.x + UNIT_CATALOG[b.type].width === a.x)
  );
}

/** Spaces that touch a ramp on their level, directly or through a chain of spaces (C-47, C-48). */
function connectedSpaces(state: TowerState): Unit[] {
  const units = Object.values(state.units);
  const spaces = units.filter((unit) => unit.type === 'parking-space');
  const reached = new Set<Unit>();
  let frontier = units.filter((unit) => unit.type === 'parking-ramp');
  while (frontier.length > 0) {
    const next = spaces.filter(
      (space) => !reached.has(space) && frontier.some((from) => touches(from, space)),
    );
    for (const space of next) reached.add(space);
    frontier = next;
  }
  return [...reached].sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

function noticesToday(state: TowerState): ParkingState {
  const day = Math.floor(state.step / STEPS_PER_DAY);
  if (state.parking.noticeDay !== day)
    state.parking = { ...state.parking, noticeDay: day, noticed: [] };
  return state.parking;
}

function holderKind(state: TowerState, personId: number): Holder | undefined {
  const slot = slotOfPerson(state.people, personId);
  return slot < 0 ? undefined : HOLDER_BY_KIND[state.people.kind[slot] as number];
}

/**
 * People spec 17.2: holders keep a valid space, the others take the free valid space with the
 * lowest unit id in increasing person id, and each holder left without one is a parking failure.
 */
export function assignParking(context: StepContext): void {
  const { state } = context;
  if (state.stars < 3) return;
  const valid = new Set(connectedSpaces(state).map((space) => unitNumber(space.id)));
  const taken = new Set<number>();
  const holders = Object.keys(state.parking.spaces)
    .map(Number)
    .sort((a, b) => a - b);
  for (const id of holders) {
    const space = state.parking.spaces[id] as number;
    if (valid.has(space) && !taken.has(space)) taken.add(space);
    else state.parking.spaces[id] = 0;
  }
  const free = [...valid].filter((space) => !taken.has(space)).sort((a, b) => a - b);
  const failed = new Set<Holder>();
  for (const id of holders) {
    if (state.parking.spaces[id] !== 0) continue;
    const space = free.shift();
    if (space === undefined) failed.add(holderKind(state, id) ?? 'office');
    else state.parking.spaces[id] = space;
  }
  if (failed.size > 0) state.lastParkingFailureStep = state.step;
  const today = noticesToday(state);
  for (const holder of failed) {
    const key = NEWS_KEY[holder];
    if (today.noticed.includes(key)) continue;
    today.noticed.push(key);
    context.events.push({ type: 'news', step: state.step, key, unitId: null });
  }
}

export const parkingAssignmentHook: ScheduledHook = {
  name: 'parking-assignment',
  schedule: { every: 'day', hour: 6, minute: 0 },
  run: assignParking,
};
