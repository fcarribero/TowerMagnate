import {
  INFESTATION_CHECK_MINUTE,
  INFESTATION_DIRTY_CHECKS,
  type Level,
  type TowerState,
  type UnitId,
} from '@tower-magnate/shared';
import { isRoom, setRoomState, type RoomUnit } from './hotel';
import { emitNews } from './news';
import { removePeopleOfUnit } from './people';
import type { ScheduledHook } from './scheduler';
import type { StepContext } from './step';
import { writableUnit } from './step-copy';
import { clearUnitLedger } from './unit-evaluation';
import { unitNumber } from './units';

function roomAt(state: TowerState, id: string): RoomUnit | null {
  const unit = state.units[id as UnitId];
  return unit && isRoom(unit) ? unit : null;
}

/** Rooms in increasing unit id, so every pass over them has the same order. */
function allRooms(state: TowerState): RoomUnit[] {
  const rooms: RoomUnit[] = [];
  for (const id in state.units) {
    const unit = state.units[id as UnitId];
    if (unit && isRoom(unit)) rooms.push(unit);
  }
  return rooms.sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
}

/**
 * The rooms next to this one on its level (hotel spec 7.2). Ruins, transport and shafts do not
 * separate rooms, any other unit does.
 */
function neighboursOf(state: TowerState, room: RoomUnit): RoomUnit[] {
  const units = (state.grid.levels[room.level]?.occupants ?? []).filter(
    (span) => span.occupant.kind === 'unit',
  );
  const index = units.findIndex(
    (span) => span.occupant.kind === 'unit' && span.occupant.id === room.id,
  );
  const sides = [units[index - 1], units[index + 1]];
  const neighbours: RoomUnit[] = [];
  for (const span of sides) {
    const neighbour = span?.occupant.kind === 'unit' ? roomAt(state, span.occupant.id) : null;
    if (neighbour) neighbours.push(neighbour);
  }
  return neighbours;
}

/** Hotel spec 7.3: the room stays infested until demolished; a stay in it ends at once. */
function infest(context: StepContext, found: RoomUnit): void {
  const room = writableUnit(context.state, found);
  if (room.hotel.state === 'occupied') {
    removePeopleOfUnit(context.state, room.id);
    clearUnitLedger(context.state, room.id);
  }
  room.hotel.stayEndStep = null;
  room.hotel.arrivalStep = null;
  room.hotel.rollDue = false;
  room.hotel.dirtyChecks = 0;
  room.used = true;
  setRoomState(context, room, 'infested');
}

function spread(context: StepContext, rooms: readonly RoomUnit[]): Set<RoomUnit['id']> {
  const { state } = context;
  const infested = rooms.filter((room) => room.hotel.state === 'infested');
  const newlyInfested = new Set<RoomUnit['id']>();
  for (const source of infested) {
    for (const neighbour of neighboursOf(state, source)) {
      if (neighbour.hotel.state === 'infested' || newlyInfested.has(neighbour.id)) continue;
      infest(context, neighbour);
      newlyInfested.add(neighbour.id);
    }
  }
  return newlyInfested;
}

function countDirtyChecks(context: StepContext, found: RoomUnit): boolean {
  const room = writableUnit(context.state, found);
  room.hotel.dirtyChecks += 1;
  if (room.hotel.dirtyChecks < INFESTATION_DIRTY_CHECKS) return false;
  infest(context, room);
  return true;
}

function announce(context: StepContext, levels: ReadonlySet<Level>): void {
  for (const level of [...levels].sort((a, b) => a - b)) {
    context.events.push(...emitNews(context.state, 'news.cockroaches', { params: { level } }));
  }
}

/** Hotel spec 7.1: spread from the rooms infested at the start, then count dirty rooms. */
export function runInfestationCheck(context: StepContext): void {
  const rooms = allRooms(context.state);
  const infestedNow = spread(context, rooms);
  const levels = new Set<Level>();
  for (const room of allRooms(context.state)) {
    if (infestedNow.has(room.id)) levels.add(room.level);
    else if (room.hotel.state === 'dirty' && countDirtyChecks(context, room))
      levels.add(room.level);
  }
  announce(context, levels);
}

export const infestationHook: ScheduledHook = {
  name: 'infestation-check',
  schedule: {
    every: 'day',
    hour: Math.floor(INFESTATION_CHECK_MINUTE / 60),
    minute: INFESTATION_CHECK_MINUTE % 60,
  },
  run: runInfestationCheck,
};
