import {
  PERSON_KINDS,
  UNIT_CATALOG,
  type ParkingState,
  type TowerState,
  type Unit,
  type NewsId,
} from '@tower-magnate/shared';
import { STEPS_PER_DAY } from './clock';
import { slotOfPerson } from './people';
import type { ScheduledHook } from './scheduler';
import type { StepContext } from './step';
import { reseedLook, unitNumber } from './units';
import { emitNews } from './news';

type Holder = 'office' | 'condo' | 'suite';

const NEWS_KEY: Record<Holder, NewsId> = {
  office: 'news.parkingOffice',
  condo: 'news.parkingCondo',
  suite: 'news.parkingSuite',
};

const HOLDER_BY_KIND: Record<number, Holder | undefined> = {
  [PERSON_KINDS.indexOf('officeWorker')]: 'office',
  [PERSON_KINDS.indexOf('resident')]: 'condo',
  [PERSON_KINDS.indexOf('hotelGuest')]: 'suite',
};

export function touches(a: Unit, b: Unit): boolean {
  return (
    a.level === b.level &&
    (a.x + UNIT_CATALOG[a.type].width === b.x || b.x + UNIT_CATALOG[b.type].width === a.x)
  );
}

/**
 * Ramps cars can drive down to: the ramps on S1, which meet the street, and every ramp in the same
 * column directly below a ramp that is reached (C-47).
 */
export function connectedRamps(state: TowerState): Unit[] {
  const ramps = Object.values(state.units).filter((unit) => unit.type === 'parking-ramp');
  const reached = new Set<Unit>();
  let frontier = ramps.filter((ramp) => ramp.level === -1);
  while (frontier.length > 0) {
    for (const ramp of frontier) reached.add(ramp);
    const from = frontier;
    frontier = ramps.filter(
      (ramp) =>
        !reached.has(ramp) &&
        from.some((above) => above.x === ramp.x && above.level - 1 === ramp.level),
    );
  }
  return [...reached].sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

/**
 * Spaces that touch a connected ramp on their level, directly or through a chain of spaces
 * (C-48). Only these can be assigned.
 */
export function connectedSpaces(state: TowerState): Unit[] {
  const units = Object.values(state.units);
  const spaces = units.filter((unit) => unit.type === 'parking-space');
  const reached = new Set<Unit>();
  let frontier = connectedRamps(state);
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

/** Who holds each parking space, by unit number. */
function holderBySpace(state: TowerState): Map<number, number> {
  const holders = new Map<number, number>();
  for (const [holder, space] of Object.entries(state.parking.spaces)) {
    if (space > 0) holders.set(space, Number(holder));
  }
  return holders;
}

/**
 * People spec 17.2: holders keep a valid space, the others take the free valid space with the
 * lowest unit id in increasing person id, and each holder left without one is a parking failure.
 */
export function assignParking(context: StepContext): void {
  const { state } = context;
  if (state.stars < 3) return;
  const before = holderBySpace(state);
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
  // A space taken by someone new gets a new seed, and with it another vehicle.
  for (const [space, holder] of holderBySpace(state)) {
    const unit = state.units[`u${space}`];
    if (unit && before.get(space) !== holder) reseedLook(unit, state.step);
  }
  if (failed.size > 0) state.lastParkingFailureStep = state.step;
  const today = noticesToday(state);
  for (const holder of failed) {
    const key = NEWS_KEY[holder];
    if (today.noticed.includes(key)) continue;
    today.noticed.push(key);
    context.events.push(...emitNews(state, key));
  }
}

/** Holders of a space that no longer exists are left with none until the next assignment. */
export function releaseParkingSpace(state: TowerState, space: number): void {
  for (const [holder, held] of Object.entries(state.parking.spaces)) {
    if (held === space) state.parking.spaces[Number(holder)] = 0;
  }
}

export const parkingAssignmentHook: ScheduledHook = {
  name: 'parking-assignment',
  schedule: { every: 'day', hour: 6, minute: 0 },
  run: assignParking,
};
